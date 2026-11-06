import { beforeEach, describe, expect, it } from 'vitest'
import { fingerprint } from './security/digest'
import { fakeKv } from '../test/fakes'
import { OWNER_EMAIL } from './ownerEmail'
import {
  checkCsrf,
  clearedCookie,
  COOKIE,
  createEmailSession,
  destroySession,
  listSessions,
  loadSession,
  promoteSession,
  readCookie,
  revokeSessions,
  safeNext,
  sessionCookie,
  SESSION_TTL_SECONDS,
  IDLE_SECONDS,
  ENROL_TTL_SECONDS,
  PENDING_TTL_SECONDS,
  isFresh,
  markFresh,
  setActiveOrg,
  touchSession,
} from './session'

const TOKEN = 'Yk3pQ9vX2mLsA7nR4tWfZ8cB6dH1jG0e'
const WHO = { email: OWNER_EMAIL, role: 'owner' } as const
const OTHER = 'Zz9qW8vY1nMtB6oS3uXgA7dC5eI2kH0f'
let kv: ReturnType<typeof fakeKv>

beforeEach(() => {
  kv = fakeKv()
})

function withCookie(value: string, headers: Record<string, string> = {}): Request {
  return new Request('https://sada2.basserh.com/panel', {
    headers: { Cookie: value, ...headers },
  })
}

/** يفتح جلسةً ويعيد معرّفها — أو يرمي، فالاختبار الذي يبتلع لا يختبر. */
async function open(headers: Record<string, string> = {}): Promise<string> {
  const result = await createEmailSession(kv, TOKEN, WHO,
    new Request('https://sada2.basserh.com/panel/login', { method: 'POST', headers }),
  )
  if (!('id' in result)) throw new Error('توقّعنا جلسة')
  return result.id
}

describe('readCookie', () => {
  it.each([
    ['كعكة واحدة', `${COOKIE}=abc`, 'abc'],
    ['بين كعكتين', `other=1; ${COOKIE}=abc; third=2`, 'abc'],
    ['مع مسافات', ` ${COOKIE}=abc `, 'abc'],
    ['اسم آخر', 'other=abc', null],
    ['بلا قيمة', `${COOKIE}=`, null],
    ['بلا ترويسة', '', null],
  ])('%s', (_name, header, expected) => {
    expect(readCookie(header.length === 0 ? null : header, COOKIE)).toBe(expected)
  })

  it('لا يخلط كعكة يبدأ اسمها بنفس الحروف', () => {
    expect(readCookie(`${COOKIE}_other=zzz`, COOKIE)).toBeNull()
  })
})

describe('createEmailSession', () => {
  it('الرمز الصحيح يعطي جلسة', async () => {
    const result = await createEmailSession(kv, TOKEN, WHO)
    expect('id' in result).toBe(true)
    if ('id' in result) expect(result.id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('تحمل البريد والدور، وطريقَ فتحها (D-245)', async () => {
    const made = await createEmailSession(kv, TOKEN, WHO)
    if ('error' in made) throw new Error('لم تُفتح')
    expect(made.record).toMatchObject({ via: 'email_code', email: OWNER_EMAIL, role: 'owner' })
    const loaded = await loadSession(kv, withCookie(`${COOKIE}=${made.id}`), TOKEN)
    expect(loaded?.record).toMatchObject({ via: 'email_code', email: OWNER_EMAIL, role: 'owner' })
  })

  it('بلا ADMIN_TOKEN المسار مقفل لا مفتوح', async () => {
    expect(await createEmailSession(kv, undefined, WHO)).toEqual({ error: 'disabled' })
    expect(await createEmailSession(kv, '', WHO)).toEqual({ error: 'disabled' })
    expect(kv.size()).toBe(0)
  })

  it('يتسامح مع مسافة حول الرمز — كما يفعل الحارس', async () => {
    expect('id' in (await createEmailSession(kv, `${TOKEN}\n`, WHO))).toBe(true)
  })

  it('كلّ جلسة معرّف جديد', async () => {
    const first = await createEmailSession(kv, TOKEN, WHO)
    const second = await createEmailSession(kv, TOKEN, WHO)
    if (!('id' in first) || !('id' in second)) throw new Error('توقّعنا جلستين')
    expect(first.id).not.toBe(second.id)
  })

  it('لكلّ جلسة سرّ CSRF خاصّ بها', async () => {
    const first = await createEmailSession(kv, TOKEN, WHO)
    const second = await createEmailSession(kv, TOKEN, WHO)
    if (!('id' in first) || !('id' in second)) throw new Error('توقّعنا جلستين')
    expect(first.record.csrf).not.toBe(second.record.csrf)
    expect(first.record.csrf.length).toBeGreaterThanOrEqual(32)
  })

  it('لا يُخزَّن كلمة الإدارة في الجلسة — بصمته فقط', async () => {
    const id = await open()
    const raw = (await kv.get(`session:${id}`)) ?? ''
    expect(raw).not.toContain(TOKEN)
  })
})

/**
 * ما كان `validSession` في الشيفرة، وصار هنا.
 *
 * كان غلافا مُصدَّرا لا ينادِيه مسار: كلُّ مسارٍ يستعمل `loadSession`
 * لأنّه يحتاج الجلسةَ نفسَها لا خبرَ وجودها. فحُذف الغلافُ وبقيت
 * أسئلتُه — وهي عن `loadSession` أصلا لا عنه.
 */
const validSession = async (
  store: Parameters<typeof loadSession>[0],
  request: Request,
  adminToken: string | undefined,
): Promise<boolean> => (await loadSession(store, request, adminToken)) !== null

/**
 * ‏**وجهةُ ما بعد الدخول قائمةُ سماح** (ر-11): المسارُ يأتي من نموذجٍ يكتبه المتصفّح،
 * ‏فتوجيهٌ إلى ما يُكتب فيه بابٌ إلى أيّ موقع. وما لا يُقبَل يعود إلى الرئيسيّة.
 */
describe('safeNext', () => {
  it('يقبل صفحات اللوحة بمساراتها وأسئلتها ومراسيها', () => {
    for (const ok of ['/panel', '/panel/report', '/panel#posts', '/panel?rows=platform&m=count', '/panel/channels/x?filter=failed#history']) {
      expect(safeNext(ok)).toBe(ok)
    }
  })

  it('ويردّ كلّ ما يخرج من الأصل أو يلتفّ عليه', () => {
    for (const bad of [
      undefined, null, '', 'https://evil.example/panel', '//evil.example/panel', '/\\evil.example',
      '/panel//evil.example', '/panel/\\evil', '/panelx', '/panel.evil.example', 'javascript:alert(1)',
      '/panel/../admin', '/panel\r\nSet-Cookie: x=1', '/panel /x', '/panel/login', '/panel/logout', '/panel/2fa',
      `/panel/${'a'.repeat(600)}`,
    ]) {
      expect(safeNext(bad)).toBe('/panel')
    }
  })

  it('والجلسة المعلَّقة تحمل وجهتَها، والترقية تُسقطها', async () => {
    const made = await createEmailSession(kv, TOKEN, WHO, undefined, { pending: true, next: '/panel/report' })
    if ('error' in made) throw new Error('لم تُفتح')
    const loaded = await loadSession(kv, withCookie(`${COOKIE}=${made.id}`), TOKEN)
    expect(loaded?.record.next).toBe('/panel/report')
    const promoted = await promoteSession(kv, loaded!)
    expect(promoted.record.next).toBeUndefined()
    // ‏ووجهةٌ مرفوضةٌ لا تُكتب، والكاملةُ لا تحملها أصلًا
    const evil = await createEmailSession(kv, TOKEN, WHO, undefined, { pending: true, next: '//evil.example' })
    if ('error' in evil) throw new Error('لم تُفتح')
    expect(evil.record.next).toBeUndefined()
    const full = await createEmailSession(kv, TOKEN, WHO, undefined, { next: '/panel/report' })
    if ('error' in full) throw new Error('لم تُفتح')
    expect(full.record.next).toBeUndefined()
  })
})

describe('صلاحيّة الجلسة', () => {
  it('كعكة جلسة قائمة تُقبل', async () => {
    const id = await open()
    expect(await validSession(kv, withCookie(`${COOKIE}=${id}`), TOKEN)).toBe(true)
  })

  it('معرّف مخترَع يُرفض — القيمة في KV لا في الكعكة', async () => {
    expect(
      await validSession(kv, withCookie(`${COOKIE}=${crypto.randomUUID()}`), TOKEN),
    ).toBe(false)
  })

  it('بلا كعكة يُرفض', async () => {
    expect(await validSession(kv, new Request('https://sada2.basserh.com/panel'), TOKEN)).toBe(
      false,
    )
  })

  it('الخروج يُبطل الجلسة فورا', async () => {
    const id = await open()
    const request = withCookie(`${COOKIE}=${id}`)
    await destroySession(kv, request)
    expect(await validSession(kv, request, TOKEN)).toBe(false)
  })
})

describe('الربط بالاعتماد — تدوير الرمز يُبطل الجلسات', () => {
  it('جلسة فُتحت برمز تسقط حين يُبدَّل الرمز', async () => {
    const id = await open()
    const request = withCookie(`${COOKIE}=${id}`)
    expect(await validSession(kv, request, TOKEN)).toBe(true)
    expect(await validSession(kv, request, OTHER)).toBe(false)
  })

  it('ولا تعود إن رجع الرمز — الصفّ مُحي لا مُعطَّل', async () => {
    const id = await open()
    const request = withCookie(`${COOKIE}=${id}`)
    await validSession(kv, request, OTHER)
    expect(await validSession(kv, request, TOKEN)).toBe(false)
  })

  it('رفع الرمز كلّه يُبطلها كذلك — الغياب يُغلق لا يفتح', async () => {
    const id = await open()
    expect(await validSession(kv, withCookie(`${COOKIE}=${id}`), undefined)).toBe(false)
  })

  it('صفّ من صيغة قديمة بلا bind لا يُقبل', async () => {
    const id = crypto.randomUUID()
    await kv.put(`session:${id}`, JSON.stringify({ at: '2026-01-01T00:00:00Z' }))
    expect(await validSession(kv, withCookie(`${COOKIE}=${id}`), TOKEN)).toBe(false)
    // ولا يُترك ليُقرأ ثانية
    expect(await kv.get(`session:${id}`)).toBeNull()
  })
})

describe('checkCsrf', () => {
  it('الرمز الصحيح يمرّ', async () => {
    const id = await open()
    const session = await loadSession(kv, withCookie(`${COOKIE}=${id}`), TOKEN)
    if (session === null) throw new Error('توقّعنا جلسة')
    expect(await checkCsrf(session, session.record.csrf)).toBe(true)
  })

  it('رمز فارغ يُرفض — والفراغ ليس تطابقا', async () => {
    const id = await open()
    const session = await loadSession(kv, withCookie(`${COOKIE}=${id}`), TOKEN)
    if (session === null) throw new Error('توقّعنا جلسة')
    expect(await checkCsrf(session, '')).toBe(false)
  })

  it('رمز جلسة أخرى يُرفض — لكلّ جلسة سرُّها', async () => {
    const mine = await open()
    const theirs = await open()
    const a = await loadSession(kv, withCookie(`${COOKIE}=${mine}`), TOKEN)
    const b = await loadSession(kv, withCookie(`${COOKIE}=${theirs}`), TOKEN)
    if (a === null || b === null) throw new Error('توقّعنا جلستين')
    expect(await checkCsrf(a, b.record.csrf)).toBe(false)
  })
})

describe('جرد الجلسات وإبطالها', () => {
  it('يعرض كلّ جلسة حيّة، وتُعلَّم الحاليّة', async () => {
    const mine = await open({ 'CF-Connecting-IP': '203.0.113.9' })
    await open()
    const list = await listSessions(kv, mine)
    expect(list).toHaveLength(2)
    expect(list.filter((x) => x.current)).toHaveLength(1)
    expect(list.find((x) => x.current)?.ip).toBe('203.0.113.9')
  })

  it('لا يعدّ جلسةً أُبطلت', async () => {
    const first = await open()
    const second = await open()
    await revokeSessions(kv, { only: first })
    const list = await listSessions(kv, second)
    expect(list.map((x) => x.handle)).toEqual([await fingerprint(second)])
    expect(JSON.stringify(list)).not.toContain(second)
  })

  it('الإبطال بالبصمة يصيب جلسةً واحدةً ويُعيد صفرا لبصمة لا يعرفها (D-150)', async () => {
    const first = await open()
    const second = await open()
    expect(await revokeSessions(kv, { onlyHandle: 'ffffffffffffffff' })).toBe(0)
    expect(await revokeSessions(kv, { onlyHandle: await fingerprint(first) })).toBe(1)
    expect((await listSessions(kv, second)).map((x) => x.handle)).toEqual([await fingerprint(second)])
  })

  it('«أخرِج الأجهزة الأخرى» يُبقي جلسة الفاعل وحدها', async () => {
    const mine = await open()
    await open()
    await open()
    const removed = await revokeSessions(kv, { keepId: mine })
    expect(removed).toBe(2)
    expect(await validSession(kv, withCookie(`${COOKIE}=${mine}`), TOKEN)).toBe(true)
    expect(await listSessions(kv, mine)).toHaveLength(1)
  })

  it('لا يخلط مفاتيح KV الأخرى بالجلسات', async () => {
    const mine = await open()
    await kv.put('flash:xyz', 'رسالة')
    await kv.put('login-attempts:1.2.3.4', '3')
    expect(await listSessions(kv, mine)).toHaveLength(1)
    await revokeSessions(kv, { keepId: mine })
    expect(await kv.get('flash:xyz')).toBe('رسالة')
    expect(await kv.get('login-attempts:1.2.3.4')).toBe('3')
  })

  it('مخزن بلا list يعطي جردا فارغا ولا يسقط', async () => {
    const { list: _ignored, ...noList } = kv
    expect(await listSessions(noList, null)).toEqual([])
    expect(await revokeSessions(noList, {})).toBe(0)
  })
})

describe('قيود الكعكة — وهي ما يجعلها كعكة لا ثغرة', () => {
  it('HttpOnly و Secure و SameSite=Strict كلّها حاضرة', () => {
    const cookie = sessionCookie('abc')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('Secure')
    expect(cookie).toContain('SameSite=Strict')
  })

  it('بادئة __Host- وشرطاها: Path=/ وبلا Domain', () => {
    expect(COOKIE.startsWith('__Host-')).toBe(true)
    const cookie = sessionCookie('abc')
    expect(cookie).toContain('Path=/')
    expect(cookie).not.toContain('Domain=')
  })

  it('لها مهلة انتهاء — لا كعكة دائمة', () => {
    expect(sessionCookie('abc')).toContain(`Max-Age=${SESSION_TTL_SECONDS}`)
    // ‏ثلاثةُ أيّامٍ بطلب المالك (D-245)، لا أكثر
    expect(SESSION_TTL_SECONDS).toBe(3 * 24 * 60 * 60)
  })

  it('الصفّ في KV ينتهي بمهلته هو أيضا — لا يُترك للأبد', async () => {
    const id = await open()
    expect(kv.ttlOf(`session:${id}`)).toBe(SESSION_TTL_SECONDS)
  })

  it('كعكة الخروج تُفرَّغ وتُبطَل بنفس القيود', () => {
    const cleared = clearedCookie()
    expect(cleared).toContain('Max-Age=0')
    expect(cleared).toContain('HttpOnly')
    expect(cleared).toContain('SameSite=Strict')
  })
})

/*
 * ‏‏D-317 · البند ٧: كانت الجلسةُ ثلاثةَ أيّامٍ بلا مهلة خمول، والمعلَّقةُ ثلاثةَ أيّامٍ كذلك، والانتقالُ بين الشركات يمدّ
 * ‏الأيّامَ الثلاثة من جديد. وكلُّ صفٍّ من قبل D-317 يسقط: فُتح حين كان رمزُ البريد وحده يكفي.
 */
describe('المهل (D-317)', () => {
  const at = (ms: number): Date => new Date(Date.now() + ms)
  const H = 60 * 60 * 1000

  it('اثنتا عشرة ساعةً بلا طلبٍ تُسقط الجلسة، ودونها تبقى', async () => {
    const id = await open()
    const request = withCookie(`${COOKIE}=${id}`)
    expect(await loadSession(kv, request, TOKEN, at(11 * H))).not.toBeNull()
    expect(await loadSession(kv, request, TOKEN, at(IDLE_SECONDS * 1000 + 60_000))).toBeNull()
    expect(await kv.get(`session:${id}`)).toBeNull()
  })

  it('والطلبُ يؤرّخ آخرَ استعمالٍ مرّةً كلَّ خمس دقائق لا في كلّ طلب', async () => {
    const id = await open()
    const request = withCookie(`${COOKIE}=${id}`)
    const session = (await loadSession(kv, request, TOKEN))!
    const same = await touchSession(kv, session, at(60_000))
    expect(same.record.seen).toBe(session.record.seen)
    const later = await touchSession(kv, session, at(6 * 60_000))
    expect(later.record.seen).not.toBe(session.record.seen)
    // ‏فمن عمل ساعةً بعد ساعة لا يسقط في الثانية عشرة
    expect(await loadSession(kv, request, TOKEN, at(12 * H))).not.toBeNull()
  })

  it('والأيّامُ الثلاثة مطلقة: الكتابةُ لا تمدّها', async () => {
    const id = await open()
    const request = withCookie(`${COOKIE}=${id}`)
    const session = (await loadSession(kv, request, TOKEN))!
    await setActiveOrg(kv, session, 'org_x')
    expect(kv.ttlOf(`session:${id}`)!).toBeLessThanOrEqual(SESSION_TTL_SECONDS)
    const record = JSON.parse((await kv.get(`session:${id}`))!) as { at: string; seen: string }
    // ‏استُعملت للتوّ، وعمرُها فات الأيّامَ الثلاثة
    record.at = new Date(Date.now() - SESSION_TTL_SECONDS * 1000 - 60_000).toISOString()
    record.seen = new Date().toISOString()
    await kv.put(`session:${id}`, JSON.stringify(record))
    expect(await loadSession(kv, request, TOKEN)).toBeNull()
  })

  it('المعلَّقةُ عشرُ دقائق، وجلسةُ التسجيل نصفُ ساعة', async () => {
    const pending = await createEmailSession(kv, TOKEN, WHO, undefined, { pending: true })
    const enrol = await createEmailSession(kv, TOKEN, WHO, undefined, { enrol: true })
    if (!('id' in pending) || !('id' in enrol)) throw new Error('توقّعنا جلستين')
    expect(kv.ttlOf(`session:${pending.id}`)).toBe(PENDING_TTL_SECONDS)
    expect(kv.ttlOf(`session:${enrol.id}`)).toBe(ENROL_TTL_SECONDS)
    expect(await loadSession(kv, withCookie(`${COOKIE}=${pending.id}`), TOKEN, at(11 * 60_000))).toBeNull()
    expect(await loadSession(kv, withCookie(`${COOKIE}=${enrol.id}`), TOKEN, at(31 * 60_000))).toBeNull()
  })

  it('وصفٌّ من قبل D-317 (بلا صيغة) لا يُقبل', async () => {
    const id = await open()
    const record = JSON.parse((await kv.get(`session:${id}`))!) as Record<string, unknown>
    delete record['v']
    await kv.put(`session:${id}`, JSON.stringify(record))
    expect(await loadSession(kv, withCookie(`${COOKIE}=${id}`), TOKEN)).toBeNull()
  })

  it('«تحقّقتَ للتوّ» خمسُ دقائق من الدخول، والمعلَّقةُ لم تتحقّق، و`markFresh` يجدّدها بالمعرّف نفسِه', async () => {
    const full = await createEmailSession(kv, TOKEN, WHO)
    const pending = await createEmailSession(kv, TOKEN, WHO, undefined, { pending: true })
    if (!('id' in full) || !('id' in pending)) throw new Error('توقّعنا جلستين')
    expect(isFresh(full.record)).toBe(true)
    expect(isFresh(full.record, at(6 * 60_000))).toBe(false)
    expect(isFresh(pending.record)).toBe(false)
    const renewed = await markFresh(kv, { id: full.id, record: full.record }, at(6 * 60_000))
    expect(renewed.id).toBe(full.id)
    expect(isFresh(renewed.record, at(7 * 60_000))).toBe(true)
  })
})

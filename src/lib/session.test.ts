import { beforeEach, describe, expect, it } from 'vitest'
import { fingerprint } from './security/digest'
import { fakeKv } from '../test/fakes'
import {
  checkCsrf,
  clearedCookie,
  COOKIE,
  createSession,
  destroySession,
  listSessions,
  loadSession,
  readCookie,
  revokeSessions,
  sessionCookie,
  SESSION_TTL_SECONDS,
} from './session'

const TOKEN = 'Yk3pQ9vX2mLsA7nR4tWfZ8cB6dH1jG0e'
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
  const result = await createSession(
    kv,
    TOKEN,
    TOKEN,
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
    ['اسمٌ آخر', 'other=abc', null],
    ['بلا قيمة', `${COOKIE}=`, null],
    ['بلا ترويسة', '', null],
  ])('%s', (_name, header, expected) => {
    expect(readCookie(header.length === 0 ? null : header, COOKIE)).toBe(expected)
  })

  it('لا يخلط كعكة يبدأ اسمها بنفس الحروف', () => {
    expect(readCookie(`${COOKIE}_other=zzz`, COOKIE)).toBeNull()
  })
})

describe('createSession', () => {
  it('الرمز الصحيح يعطي جلسة', async () => {
    const result = await createSession(kv, TOKEN, TOKEN)
    expect('id' in result).toBe(true)
    if ('id' in result) expect(result.id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('الرمز الخطأ يُرفض ولا يُنشئ شيئا', async () => {
    expect(await createSession(kv, TOKEN, 'wrong')).toEqual({ error: 'denied' })
    expect(kv.size()).toBe(0)
  })

  it('بلا ADMIN_TOKEN المسار مقفل لا مفتوح', async () => {
    expect(await createSession(kv, undefined, 'anything')).toEqual({ error: 'disabled' })
    expect(await createSession(kv, '', 'anything')).toEqual({ error: 'disabled' })
    expect(kv.size()).toBe(0)
  })

  it('يتسامح مع مسافةٍ حول الرمز — كما يفعل الحارس', async () => {
    expect('id' in (await createSession(kv, `${TOKEN}\n`, TOKEN))).toBe(true)
  })

  it('كلّ جلسة معرّفٌ جديد', async () => {
    const first = await createSession(kv, TOKEN, TOKEN)
    const second = await createSession(kv, TOKEN, TOKEN)
    if (!('id' in first) || !('id' in second)) throw new Error('توقّعنا جلستين')
    expect(first.id).not.toBe(second.id)
  })

  it('لكلّ جلسةٍ سرُّ CSRF خاصٌّ بها', async () => {
    const first = await createSession(kv, TOKEN, TOKEN)
    const second = await createSession(kv, TOKEN, TOKEN)
    if (!('id' in first) || !('id' in second)) throw new Error('توقّعنا جلستين')
    expect(first.record.csrf).not.toBe(second.record.csrf)
    expect(first.record.csrf.length).toBeGreaterThanOrEqual(32)
  })

  it('لا يُخزَّن الرمز الإداريّ في الجلسة — بصمته فقط', async () => {
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

describe('صلاحيّةُ الجلسة', () => {
  it('كعكة جلسةٍ قائمة تُقبل', async () => {
    const id = await open()
    expect(await validSession(kv, withCookie(`${COOKIE}=${id}`), TOKEN)).toBe(true)
  })

  it('معرّفٌ مخترَع يُرفض — القيمة في KV لا في الكعكة', async () => {
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

describe('الربط بالاعتماد — تدويرُ الرمز يُبطل الجلسات', () => {
  it('جلسةٌ فُتحت برمزٍ تسقط حين يُبدَّل الرمز', async () => {
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

  it('رفعُ الرمز كلّه يُبطلها كذلك — الغياب يُغلق لا يفتح', async () => {
    const id = await open()
    expect(await validSession(kv, withCookie(`${COOKIE}=${id}`), undefined)).toBe(false)
  })

  it('صفٌّ من صيغةٍ قديمة بلا bind لا يُقبل', async () => {
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

  it('رمزٌ فارغ يُرفض — والفراغ ليس تطابقا', async () => {
    const id = await open()
    const session = await loadSession(kv, withCookie(`${COOKIE}=${id}`), TOKEN)
    if (session === null) throw new Error('توقّعنا جلسة')
    expect(await checkCsrf(session, '')).toBe(false)
  })

  it('رمزُ جلسةٍ أخرى يُرفض — لكلّ جلسةٍ سرُّها', async () => {
    const mine = await open()
    const theirs = await open()
    const a = await loadSession(kv, withCookie(`${COOKIE}=${mine}`), TOKEN)
    const b = await loadSession(kv, withCookie(`${COOKIE}=${theirs}`), TOKEN)
    if (a === null || b === null) throw new Error('توقّعنا جلستين')
    expect(await checkCsrf(a, b.record.csrf)).toBe(false)
  })
})

describe('جرد الجلسات وإبطالها', () => {
  it('يعرض كلّ جلسةٍ حيّة، وتُعلَّم الحاليّة', async () => {
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

  it('الإبطالُ بالبصمة يصيب جلسةً واحدةً ويُعيد صفرا لبصمةٍ لا يعرفها (D-150)', async () => {
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

  it('مخزنٌ بلا list يعطي جردا فارغا ولا يسقط', async () => {
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
    expect(SESSION_TTL_SECONDS).toBeLessThanOrEqual(24 * 60 * 60)
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

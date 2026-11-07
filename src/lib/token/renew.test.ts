/**
 * تجديدُ الرموز — **والقاعدةُ حقيقيّةٌ والتشفيرُ حقيقيّ.**
 *
 * فما يُثبَت هنا أنّ الرمزَ يُقرأ ويُجدَّد ويُحفَظ مشفَّرا كما يقع
 * فعلا، لا أنّ دالّةً نودِيت.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { toBase64 } from '../crypto'
import { loadTokens, saveTokens } from '../tokens'
import { LINKEDIN, X } from '../oauth/providers'
import { fakeDb, type FakeDb } from '../../test/fakes'
import { dueForRenewal, mergeRenewed, renewDue, renewOne, RENEW_MARGIN_SECONDS } from './renew'
import { recordVerification, saveApp } from '../oauth/apps'

const KEY = toBase64(crypto.getRandomValues(new Uint8Array(32)))
const NOW = new Date('2026-09-06T12:00:00Z')
const inSec = (s: number): string => new Date(NOW.getTime() + s * 1000).toISOString()

let db: FakeDb

function reply(body: unknown, status = 200): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })) as unknown as typeof fetch
}

const deps = (fetchImpl: typeof fetch) => ({
  db, encKey: KEY, fetchImpl, now: () => NOW,
  credentialsFor: async () => ({ clientId: 'id', clientSecret: 'secret' }),
  providerFor: () => LINKEDIN,
})

async function seed(
  id: string,
  opts: { access: string; refresh: string | null; refreshExpires?: string | null; platform?: string },
): Promise<void> {
  db.raw.exec(
    `INSERT INTO accounts (id, platform, kind, external_id, display_name)
     VALUES ('${id}', '${opts.platform ?? 'linkedin'}', 'member', 'e-${id}', 'عمر')`,
  )
  await saveTokens(db, KEY, id, {
    accessToken: `access-${id}`,
    refreshToken: opts.refresh,
    expiresAt: opts.access,
    refreshExpiresAt: opts.refreshExpires ?? null,
    scopes: 'openid profile w_member_social',
  })
}

beforeEach(() => { db = fakeDb() })

describe('من يُجدَّد', () => {
  it('رمز بعيد لا يُجدَّد', async () => {
    await seed('a1', { access: inSec(86_400), refresh: 'r1' })
    expect(await dueForRenewal(db, NOW)).toEqual([])
  })

  it('وإذن يقترب يُجدَّد', async () => {
    await seed('a1', { access: inSec(600), refresh: 'r1' })
    expect((await dueForRenewal(db, NOW)).map((r) => r.account_id)).toEqual(['a1'])
  })

  /** **الهامشُ ساعتان لا خمسُ دقائق**: دورةٌ تسقط لا تترك رمزا يموت. */
  it('والهامش يحتمل دورات ساقطة', async () => {
    await seed('a1', { access: inSec(3600), refresh: 'r1' })
    expect(RENEW_MARGIN_SECONDS).toBeGreaterThan(3600)
    expect(await dueForRenewal(db, NOW)).toHaveLength(1)
  })

  it('ورمز بلا تجديد لا يدخل الدورة أصلا', async () => {
    await seed('a1', { access: inSec(600), refresh: null })
    expect(await dueForRenewal(db, NOW)).toEqual([])
  })

  /** و`needs_reauth` يُحاوَل ثانيةً: قد عُلّم بخطأٍ عابر. */
  it('وحساب مُبطَل يُستثنى، و«يحتاج تجديدا» يُحاوَل', async () => {
    await seed('a1', { access: inSec(600), refresh: 'r1' })
    await seed('a2', { access: inSec(600), refresh: 'r2' })
    db.raw.exec("UPDATE accounts SET status = 'revoked' WHERE id = 'a1'")
    db.raw.exec("UPDATE accounts SET status = 'needs_reauth' WHERE id = 'a2'")
    expect((await dueForRenewal(db, NOW)).map((r) => r.account_id)).toEqual(['a2'])
  })
})

describe('والدمج لا يمحو بالفراغ', () => {
  /**
   * **هذا الفخُّ يحوّل تجديدا ناجحا إلى عطلٍ دائم.**
   *
   * بعضُ المزوّدين لا يعيد `refresh_token` مع التجديد، فيصير `null`
   * في الردّ — **وحفظُه كما هو يمحو الرمزَ الذي كان يعمل**.
   */
  it('ردّ بلا رمز تجديد يرث المحفوظ', () => {
    const merged = mergeRenewed(
      { accessToken: 'new', refreshToken: null, expiresAt: 'x',
        refreshExpiresAt: null, scopes: '' },
      { accessToken: 'old', refreshToken: 'KEEP-ME', expiresAt: 'y',
        refreshExpiresAt: '2027-01-01T00:00:00Z', scopes: 'openid profile' },
    )
    expect(merged.refreshToken).toBe('KEEP-ME')
    expect(merged.refreshExpiresAt).toBe('2027-01-01T00:00:00Z')
    // **وتجديدٌ لا يوسّع نطاقا** — وردٌّ بلا scope لا يعني سقوطَها
    expect(merged.scopes).toBe('openid profile')
    expect(merged.accessToken).toBe('new')
  })

  it('وردّ برمز مدوَّر يُؤخَذ لا يُهمَل', () => {
    const merged = mergeRenewed(
      { accessToken: 'new', refreshToken: 'ROTATED', expiresAt: 'x',
        refreshExpiresAt: null, scopes: 'openid' },
      { accessToken: 'old', refreshToken: 'OLD', expiresAt: 'y',
        refreshExpiresAt: null, scopes: 'openid' },
    )
    expect(merged.refreshToken).toBe('ROTATED')
  })

  /** **تجديدٌ ناجحٌ يعيد الحسابَ فعّالًا** (D-157): على staging بقي X «يحتاج تجديدًا» بعد تجديدٍ ناجح. */
  it('وحساب عُلّم «يحتاج تجديدا» يعود فعّالا حين ينجح التجديد', async () => {
    await seed('a1', { access: inSec(600), refresh: 'r1' })
    db.raw.exec("UPDATE accounts SET status = 'needs_reauth', needs_reauth_at = '2026-09-26 03:01:08' WHERE id = 'a1'")
    const out = await renewOne(
      deps(reply({ access_token: 'FRESH', expires_in: 5_184_000 })),
      { account_id: 'a1', platform: 'linkedin', org_id: 'org_owner' },
    )
    expect(out.kind).toBe('renewed')
    const row = db.raw.prepare('SELECT status, needs_reauth_at FROM accounts WHERE id = ?').get('a1') as { status: string; needs_reauth_at: string | null }
    expect(row.status).toBe('active')
    expect(row.needs_reauth_at).toBeNull()
  })

  /** ويُحفَظ مشفَّرا في القاعدة — لا في الذاكرة وحدها. */
  it('والمحفوظ بعد التجديد يُقرأ صحيحا', async () => {
    await seed('a1', { access: inSec(600), refresh: 'r1' })
    const out = await renewOne(
      deps(reply({ access_token: 'FRESH', expires_in: 5_184_000 })),
      { account_id: 'a1', platform: 'linkedin', org_id: 'org_owner' },
    )
    expect(out.kind).toBe('renewed')

    const stored = await loadTokens(db, KEY, 'a1')
    expect(stored?.accessToken).toBe('FRESH')
    // **ولم يُمحَ إذنُ التجديد** ولو غاب عن الردّ
    expect(stored?.refreshToken).toBe('r1')
    // **والتجديدُ الناجحُ يُختَم** (D-129) — والربطُ الأوّل لا يُختَم
    const stamp = db.raw.prepare('SELECT refreshed_at FROM tokens WHERE account_id = ?').get('a1') as { refreshed_at: string | null }
    expect(stamp.refreshed_at).not.toBeNull()
  })

  it('والتجديد المردود لا يختم شيئا', async () => {
    await seed('a1', { access: inSec(600), refresh: 'r1' })
    const out = await renewOne(deps(reply({ error: 'invalid_grant' }, 400)), { account_id: 'a1', platform: 'linkedin', org_id: 'org_owner' })
    expect(out.kind).toBe('needs_owner')
    const stamp = db.raw.prepare('SELECT refreshed_at FROM tokens WHERE account_id = ?').get('a1') as { refreshed_at: string | null }
    expect(stamp.refreshed_at).toBeNull()
  })
})

describe('ومتى يُطلَب من المالك إذن جديد', () => {
  /** رمزُ تجديدٍ رُدّ لا يُصلحه انتظار. */
  it('٤٠٠ حكم نهائيّ — ويُعلَّم الحساب', async () => {
    await seed('a1', { access: inSec(600), refresh: 'r1' })
    const out = await renewOne(
      deps(reply({ error: 'invalid_grant' }, 400)),
      { account_id: 'a1', platform: 'linkedin', org_id: 'org_owner' },
    )
    expect(out.kind).toBe('needs_owner')

    const row = db.raw.prepare("SELECT status FROM accounts WHERE id = 'a1'").get() as
      { status: string }
    expect(row.status).toBe('needs_reauth')
  })

  /**
   * **ولا يُطلَب إذنٌ لعطلٍ عند المزوّد.**
   *
   * ٥٠٣ أو عطلُ شبكةٍ يُترك للدورة التالية — وحسابٌ يُعلَّم
   * `needs_reauth` بسبب عطلٍ عابرٍ يُوقف نشرَه حتّى يجلس المالكُ إليه.
   */
  it('و٥xx عابر يُؤجَّل ولا يُعلَّم الحساب', async () => {
    await seed('a1', { access: inSec(600), refresh: 'r1' })
    const out = await renewOne(
      deps(reply({ error: 'server_error' }, 503)),
      { account_id: 'a1', platform: 'linkedin', org_id: 'org_owner' },
    )
    expect(out.kind).toBe('deferred')

    const row = db.raw.prepare("SELECT status FROM accounts WHERE id = 'a1'").get() as
      { status: string }
    expect(row.status).toBe('active')
  })

  it('وعطل شبكة كذلك', async () => {
    await seed('a1', { access: inSec(600), refresh: 'r1' })
    const dead = (async () => { throw new Error('ECONNRESET') }) as unknown as typeof fetch
    expect((await renewOne(deps(dead), { account_id: 'a1', platform: 'linkedin', org_id: 'org_owner' })).kind)
      .toBe('deferred')
  })

  /** **وسرٌّ ناقصٌ عطلُ ضبطٍ لا عطلُ حساب** — ولا يُعلَّم به. */
  it('وأسرار ناقصة تُؤجَّل ولا تُعلِّم الحساب', async () => {
    await seed('a1', { access: inSec(600), refresh: 'r1' })
    const out = await renewOne(
      { ...deps(reply({})), credentialsFor: async () => null },
      { account_id: 'a1', platform: 'linkedin', org_id: 'org_owner' },
    )
    expect(out.kind).toBe('deferred')
    const row = db.raw.prepare("SELECT status FROM accounts WHERE id = 'a1'").get() as
      { status: string }
    expect(row.status).toBe('active')
  })

  it('وانتهاء إذن التجديد نفسِه يُعلَّم', async () => {
    await seed('a1', { access: inSec(600), refresh: 'r1', refreshExpires: inSec(-10) })
    const out = await renewOne(deps(reply({})), { account_id: 'a1', platform: 'linkedin', org_id: 'org_owner' })
    expect(out.kind).toBe('needs_owner')
    if (out.kind !== 'needs_owner') return
    expect(out.why).toContain('إذن التجديد')
  })
})

describe('والدورة لا يوقفها حساب واحد', () => {
  it('حساب يسقط لا يُسقط البقيّة', async () => {
    await seed('a1', { access: inSec(600), refresh: 'r1' })
    await seed('a2', { access: inSec(700), refresh: 'r2' })

    let call = 0
    const flaky = (async () => {
      call += 1
      if (call === 1) throw new Error('boom')
      return new Response(JSON.stringify({ access_token: 'FRESH', expires_in: 5_184_000 }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })
    }) as unknown as typeof fetch

    const summary = await renewDue(deps(flaky))
    expect(summary.due).toBe(2)
    expect(summary.renewed).toBe(1)
    expect(summary.deferred).toBe(1)

    // ‏والسببُ على الحساب لا في العدّ وحدَه (D-291): الساقطُ يقول لماذا، والمجدَّدُ بلا ملاحظة
    const notes = db.raw.prepare('SELECT id, renew_note, renew_noted_at FROM accounts ORDER BY id').all() as
      { id: string; renew_note: string | null; renew_noted_at: string | null }[]
    const noted = notes.filter((n) => n.renew_note !== null)
    expect(noted).toHaveLength(1)
    expect(noted[0]!.renew_note).toContain('boom')
    expect(noted[0]!.renew_noted_at).not.toBeNull()
    expect(notes.find((n) => n.renew_note === null)?.renew_noted_at).toBeNull()
  })

  it('وملاحظةُ التأجيل تُمحى حين ينجح التجديدُ التالي', async () => {
    await seed('a1', { access: inSec(600), refresh: 'r1' })
    db.raw.prepare("UPDATE accounts SET renew_note = 'قديم', renew_noted_at = datetime('now') WHERE id = 'a1'").run()
    await renewDue(deps(reply({ access_token: 'FRESH', expires_in: 5_184_000 })))
    const row = db.raw.prepare("SELECT renew_note, renew_noted_at FROM accounts WHERE id = 'a1'").get() as
      { renew_note: string | null; renew_noted_at: string | null }
    expect(row).toEqual({ renew_note: null, renew_noted_at: null })
  })

  it('ولا شيء يُنادى حين لا شيء يقترب', async () => {
    await seed('a1', { access: inSec(86_400), refresh: 'r1' })
    const never = (async () => { throw new Error('يجب ألّا يُنادى') }) as unknown as typeof fetch
    expect(await renewDue(deps(never))).toMatchObject({ due: 0, renewed: 0 })
  })

  /** ويعمل لـ X كما لـ LinkedIn — والمزوّدُ يُقرأ من السجلّ. */
  it('ويُنادى مزوّد كلّ حساب', async () => {
    await seed('a1', { access: inSec(600), refresh: 'r1', platform: 'x' })
    const seen: string[] = []
    const spy = (async (url: RequestInfo | URL) => {
      seen.push(String(url))
      return new Response(JSON.stringify({ access_token: 'F', expires_in: 7200 }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })
    }) as unknown as typeof fetch

    await renewDue({ ...deps(spy), providerFor: () => X })
    expect(seen[0]).toBe(X.tokenUrl)
  })
})

/**
 * ‏**التجديدُ لا يجوّع** (D-320).
 *
 * ‏كانت الدورةُ تأخذ أقدمَ خمسةٍ وعشرين رمزًا يقترب انتهاؤها، وما ردّ المزوّدُ تجديدَه أقدمُها دائمًا: يُعاد كلَّ ربع ساعة
 * ‏إلى الأبد، **وخمسةٌ وعشرون منها تملأ الدفعةَ فلا يصل الحسابَ السليمَ دورُه** حتّى يموت رمزُه.
 */
describe('التجديد لا يجوّع (D-320)', () => {
  const TICK = 15 * 60_000
  const refused = (seen: string[]) => (async (_url: RequestInfo | URL, init?: RequestInit) => {
    const refresh = new URLSearchParams(String(init?.body ?? '')).get('refresh_token') ?? ''
    seen.push(refresh)
    if (refresh.startsWith('ok-')) {
      return new Response(JSON.stringify({ access_token: `fresh-${refresh}`, expires_in: 5_184_000 }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })
    }
    return new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }) as unknown as typeof fetch

  it('ثلاثون حسابًا يُردّ تجديدُها لا تحجب الحسابَ السليم، ولا تُعاد كلَّ دورة', async () => {
    for (let i = 0; i < 30; i += 1) await seed(`dead${String(i).padStart(2, '0')}`, { access: inSec(60 + i), refresh: `dead-${i}` })
    await seed('healthy', { access: inSec(3000), refresh: 'ok-h' })
    // ‏وحسابٌ سليمٌ ثانٍ يحلّ تجديدُه بعد ستّ ساعات، والساقطون مستحقّون معه
    await seed('later', { access: inSec(6 * 3600 + 3000), refresh: 'ok-l' })
    const seen: string[] = []
    const renewedAt: Record<string, number> = {}
    for (let tick = 0; tick < 96; tick += 1) {
      const at = new Date(NOW.getTime() + tick * TICK)
      const before = seen.length
      await renewDue({ ...deps(refused(seen)), now: () => at })
      for (const r of seen.slice(before)) if (r.startsWith('ok-') && renewedAt[r] === undefined) renewedAt[r] = tick
    }
    // ‏السليمُ يُجدَّد في الدورة الثانية على الأكثر: الأولى رأت الثلاثين مثلَه بلا تاريخ
    expect(renewedAt['ok-h']).toBeLessThanOrEqual(1)
    // ‏والثاني في الدورة التي يدخل فيها هامشَ الساعتين، ولو كان الساقطون مستحقّين معه
    expect(renewedAt['ok-l']).toBe(Math.ceil((6 * 3600 + 3000 - RENEW_MARGIN_SECONDS) / 900))
    // ‏والساقطُ يتباعد: يومٌ كاملٌ (‏96 دورة) لا يعيده أكثرَ من ثماني مرّات — وكان ستًّا وتسعين
    const perDead = new Map<string, number>()
    for (const r of seen.filter((s) => s.startsWith('dead-'))) perDead.set(r, (perDead.get(r) ?? 0) + 1)
    expect(perDead.size).toBe(30)
    expect(Math.max(...perDead.values())).toBeLessThanOrEqual(8)
  })

  it('وربطٌ من جديد يمحو التباعد: الحسابُ يُحاوَل في الدورة التالية', async () => {
    await seed('a1', { access: inSec(600), refresh: 'dead-1' })
    const seen: string[] = []
    await renewDue({ ...deps(refused(seen)), now: () => NOW })
    const held = db.raw.prepare("SELECT renew_failures, renew_retry_at FROM tokens WHERE account_id = 'a1'").get() as
      { renew_failures: number; renew_retry_at: string | null }
    expect(held.renew_failures).toBe(1)
    expect(held.renew_retry_at).not.toBeNull()
    // ‏التالية بعد ربع ساعة لا تعيده
    await renewDue({ ...deps(refused(seen)), now: () => new Date(NOW.getTime() + TICK) })
    expect(seen).toEqual(['dead-1'])
    // ‏والمالكُ يربطه من جديد: `saveTokens` يصفّر العدّ والموعد
    await saveTokens(db, KEY, 'a1', { accessToken: 'again', refreshToken: 'ok-1', expiresAt: inSec(900), refreshExpiresAt: null, scopes: 'openid' })
    const reset = db.raw.prepare("SELECT renew_failures, renew_retry_at FROM tokens WHERE account_id = 'a1'").get()
    expect(reset).toEqual({ renew_failures: 0, renew_retry_at: null })
    await renewDue({ ...deps(refused(seen)), now: () => new Date(NOW.getTime() + 2 * TICK) })
    expect(seen).toEqual(['dead-1', 'ok-1'])
  })

  it('ونداءُ التجديد يحمل مهلة', async () => {
    await seed('a1', { access: inSec(600), refresh: 'ok-1' })
    let signal: unknown
    const spy = (async (_u: RequestInfo | URL, init?: RequestInit) => {
      signal = init?.signal
      return new Response(JSON.stringify({ access_token: 'F', expires_in: 7200 }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }) as unknown as typeof fetch
    await renewDue(deps(spy))
    expect(signal).toBeInstanceOf(AbortSignal)
  })

  it('والدورةُ تقف عند ميزانيّتها: نهايةٌ بطيئة لا تؤخّر الإرسالَ بعدها', async () => {
    for (let i = 0; i < 10; i += 1) await seed(`s${i}`, { access: inSec(600 + i), refresh: `ok-${i}` })
    let clock = NOW.getTime()
    const seen: string[] = []
    const slow = (async (url: RequestInfo | URL, init?: RequestInit) => {
      clock += 14_000
      return refused(seen)(url, init)
    }) as unknown as typeof fetch
    const summary = await renewDue({ ...deps(slow), now: () => new Date(clock) })
    // ‏ميزانيّةُ الدورة ستّون ثانية: خمسةُ نداءاتٍ بأربعَ عشرةَ ثانية (السادسُ يبدأ بعدها) — والباقي للدورة التالية بلا عقوبة
    expect(seen.length).toBeLessThan(10)
    expect(summary.renewed).toBe(seen.length)
    const waiting = db.raw.prepare('SELECT count(*) AS n FROM tokens WHERE renew_failures = 0 AND renew_retry_at IS NULL').get() as { n: number }
    expect(waiting.n).toBe(10)
  })
})

/**
 * ‏**مراجعة D-320: التباعدُ للنهائيّ وحدَه.** كان كلُّ ما لم يتجدّد يتباعد (نصفَ ساعةٍ ثمّ ضعفَها حتّى يوم) ولا يمحوه إلّا
 * ‏`saveTokens` — ومنه العابر (‏5xx، شبكةٌ، المهلةُ الجديدة) وعطلُ الضبط (سرُّ التطبيق ناقص). فمزوّدٌ تعطّل ساعةً ونصفًا يترك
 * ‏رمزًا يموت ساعتين بعد عودته، وسرٌّ يُحفَظ لا يعيد حسابًا إلى الدورة قبل موعده. فالعابرُ يُعدّ (فيتأخّر خلف السليم) ولا ينتظر،
 * ‏والنهائيُّ (‏4xx من نهاية الرمز) يتباعد، **وحفظُ التطبيق أو فحصُه الناجح يمحو تباعدَ منصّته**.
 */
describe('مراجعة D-320: التباعدُ للنهائيّ وحدَه', () => {
  const TICK = 15 * 60_000
  const answering = (down: (at: number) => number | null, clock: () => number, seen: number[]) => (async () => {
    const status = down(clock())
    seen.push(clock())
    if (status !== null) return new Response(JSON.stringify({ error: 'server_error' }), { status, headers: { 'Content-Type': 'application/json' } })
    return new Response(JSON.stringify({ access_token: 'fresh', expires_in: 5_184_000 }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }) as unknown as typeof fetch
  async function ticks(n: number, run: (at: Date) => Promise<void>): Promise<void> {
    for (let tick = 0; tick < n; tick += 1) await run(new Date(NOW.getTime() + tick * TICK))
  }
  const minutes = (at: number) => (at - NOW.getTime()) / 60_000

  it('‏503 خمسًا وتسعين دقيقة ورمزٌ بقيت له ‏105: يُحاوَل في كلّ دورة، ويُجدَّد في أوّل دورةٍ بعد عودة المزوّد', async () => {
    await seed('a1', { access: inSec(105 * 60), refresh: 'r1' })
    let clock = NOW.getTime()
    const seen: number[] = []
    const fetchImpl = answering((at) => (minutes(at) < 95 ? 503 : null), () => clock, seen)
    await ticks(13, async (at) => { clock = at.getTime(); await renewDue({ ...deps(fetchImpl), now: () => at }) })
    // ‏كلُّ دورةٍ حتّى عاد، ثمّ لا شيء: الرمزُ الجديدُ بعيد
    expect(seen.map(minutes)).toEqual([0, 15, 30, 45, 60, 75, 90, 105])
    const row = db.raw.prepare("SELECT renew_failures, renew_retry_at FROM tokens WHERE account_id = 'a1'").get()
    expect(row).toEqual({ renew_failures: 0, renew_retry_at: null })
  })

  it('وسرُّ التطبيق الناقص: يُحاوَل الحسابُ في الدورة التي تلي حفظَه', async () => {
    await seed('a1', { access: inSec(110 * 60), refresh: 'r1' })
    let creds: { clientId: string; clientSecret: string } | null = null
    let renewedAt: number | null = null
    await ticks(10, async (at) => {
      // ‏حُفظ السرُّ في الدقيقة المئة، بين دورتي ‏90 و‏105
      if (minutes(at.getTime()) >= 100) creds = { clientId: 'id', clientSecret: 'secret' }
      const s = await renewDue({ ...deps(reply({ access_token: 'fresh', expires_in: 5_184_000 })), now: () => at, credentialsFor: async () => creds })
      if (s.renewed > 0 && renewedAt === null) renewedAt = minutes(at.getTime())
    })
    expect(renewedAt).toBe(105)
  })

  it('والعابرُ يتأخّر خلف السليم: ثلاثون حسابًا يتعطّل مزوّدُها لا تحجب حسابًا سليمًا', async () => {
    for (let i = 0; i < 30; i += 1) await seed(`down${String(i).padStart(2, '0')}`, { access: inSec(60 + i), refresh: `down-${i}` })
    await seed('healthy', { access: inSec(3000), refresh: 'ok-h' })
    const renewedAt: string[] = []
    const fetchImpl = (async (_u: RequestInfo | URL, init?: RequestInit) => {
      const refresh = new URLSearchParams(String(init?.body ?? '')).get('refresh_token') ?? ''
      if (refresh.startsWith('ok-')) {
        renewedAt.push(refresh)
        return new Response(JSON.stringify({ access_token: 'fresh', expires_in: 5_184_000 }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response('{}', { status: 503 })
    }) as unknown as typeof fetch
    await ticks(2, async (at) => { await renewDue({ ...deps(fetchImpl), now: () => at }) })
    expect(renewedAt).toEqual(['ok-h'])
  })

  it('والرفضُ النهائيّ (‏401 invalid_client) يتباعد، وحفظُ التطبيق يعيد حساباتِ منصّته إلى الدورة التالية', async () => {
    await seed('a1', { access: inSec(600), refresh: 'r1' })
    await seed('x1', { access: inSec(600), refresh: 'r2', platform: 'x' })
    await renewDue({ ...deps(reply({ error: 'invalid_client' }, 401)), now: () => NOW })
    const held = () => db.raw.prepare('SELECT account_id, renew_failures, renew_retry_at IS NOT NULL AS held FROM tokens ORDER BY account_id').all()
    expect(held()).toEqual([
      { account_id: 'a1', renew_failures: 1, held: 1 },
      { account_id: 'x1', renew_failures: 1, held: 1 },
    ])
    await saveApp(db, KEY, 'linkedin', 'id', 'the-new-secret', 'panel')
    // ‏منصّتُه وحدَها: سرُّ LinkedIn لا يُصلح X
    expect(held()).toEqual([
      { account_id: 'a1', renew_failures: 0, held: 0 },
      { account_id: 'x1', renew_failures: 1, held: 1 },
    ])
    expect((await dueForRenewal(db, new Date(NOW.getTime() + TICK))).map((r) => r.account_id)).toEqual(['a1'])
    // ‏وفحصٌ ناجحٌ يمحوه كذلك، وفحصٌ يردّ السرَّ لا
    await recordVerification(db, 'x', 'bad_secret')
    expect(held()[1]).toEqual({ account_id: 'x1', renew_failures: 1, held: 1 })
    await recordVerification(db, 'x', 'accepted')
    expect(held()[1]).toEqual({ account_id: 'x1', renew_failures: 0, held: 0 })
  })
})

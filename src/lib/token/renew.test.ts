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

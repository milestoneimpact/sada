/**
 * تنبيهُ انتهاء الرمز — **والقاعدةُ حقيقيّة.**
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { fakeDb, type FakeDb } from '../../test/fakes'
import { anyWeekAlert, expiringTokens, recordAlerts, thresholdFor } from './expiry'

const NOW = new Date('2026-09-06T12:00:00Z')
const inDays = (d: number): string =>
  new Date(NOW.getTime() + d * 86_400_000).toISOString()

let db: FakeDb

function account(id: string, platform = 'linkedin', status = 'active'): void {
  db.raw.exec(
    `INSERT INTO accounts (id, platform, kind, external_id, display_name, status)
     VALUES ('${id}', '${platform}', 'member', 'e-${id}', 'حساب ${id}', '${status}')`,
  )
}

/**
 * ويُفرَّق بين **وجود** إذن التجديد و**تاريخِ انتهائه**.
 *
 * X تعطي إذنَ تجديدٍ ولا تعطي له تاريخا: `refresh_expires_at` فارغٌ
 * و`refresh_enc` ممتلئ. **فمن قرأ العمودَ الفارغَ وحدَه ظنّ الحسابَ بلا
 * تجديد** — وهو يُجدَّد كلَّ ساعتين (D-115).
 */
function token(
  accountId: string, access: string, refresh: string | null, hasRefresh = true,
): void {
  db.raw.exec(
    `INSERT INTO tokens (account_id, access_enc, access_iv, expires_at,
                         refresh_expires_at, refresh_enc, refresh_iv, scopes)
     VALUES ('${accountId}', 'x', 'y', '${access}',
             ${refresh === null ? 'NULL' : `'${refresh}'`},
             ${hasRefresh ? "'r', 'iv'" : 'NULL, NULL'}, 'openid')`,
  )
}

beforeEach(() => { db = fakeDb() })

describe('العتبة', () => {
  it('سبعة ثمّ واحد، وما بعدهما لا يُنبَّه عليه', () => {
    expect(thresholdFor(30)).toBeNull()
    expect(thresholdFor(8)).toBeNull()
    expect(thresholdFor(7)).toBe(7)
    expect(thresholdFor(2)).toBe(7)
    expect(thresholdFor(1)).toBe(1)
    expect(thresholdFor(0)).toBe(1)
  })

  /** وما انتهى فعلا عتبتُه صفر — **حالٌ أشدُّ لا حالٌ منتهية**. */
  it('وما انتهى عتبتُه صفر', () => {
    expect(thresholdFor(-1)).toBe(0)
    expect(thresholdFor(-90)).toBe(0)
  })
})

describe('ما يُلتقَط', () => {
  it('رمز بعيد لا يُلتقَط', async () => {
    account('a1')
    token('a1', inDays(40), inDays(300))
    expect(await expiringTokens(db, NOW)).toEqual([])
  })

  it('ورمز قريب يُلتقَط بنوعه', async () => {
    account('a1')
    token('a1', inDays(3), null, false)
    const items = await expiringTokens(db, NOW)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ kind: 'access', threshold: 7, daysLeft: 3 })
  })

  /**
   * **والتجديدُ يسبق الوصول.**
   *
   * سقوطُ الوصول يُصلحه التجديدُ آليّا، **وسقوطُ التجديد يوجب دورةَ
   * إذنٍ بيد المالك** — فيُعرَض أوّلا.
   */
  it('والتجديد يسبق الوصول عند تساوي الأيّام', async () => {
    account('a1')
    // وبعد الانتهاء يجتمعان: قبله يُسكَت الوصولُ لأنّه يُجدَّد (D-115)
    token('a1', inDays(-2), inDays(-2))
    const items = await expiringTokens(db, NOW)
    expect(items.map((i) => i.kind)).toEqual(['refresh', 'access'])
  })

  it('والأقرب أوّلا', async () => {
    account('a1'); account('a2', 'x')
    token('a1', inDays(6), null, false)
    token('a2', inDays(1), null, false)
    expect((await expiringTokens(db, NOW)).map((i) => i.accountId)).toEqual(['a2', 'a1'])
  })

  it('وحساب مُبطَل لا يُنبَّه عليه', async () => {
    account('a1', 'linkedin', 'revoked')
    token('a1', inDays(1), null, false)
    expect(await expiringTokens(db, NOW)).toEqual([])
  })

  /** ورمزُ تجديدٍ لا وجودَ له (X أحيانا) لا يُختلَق له تاريخ. */
  it('ولا إذن تجديد لا يُنبَّه عليه', async () => {
    account('a1')
    token('a1', inDays(2), null, false)
    const items = await expiringTokens(db, NOW)
    // **ويُشترَط أن تكون فيها عناصر**: «every» على قائمةٍ خاليةٍ صحيحٌ
    // دائما، فكان الاختبارُ يمرّ فراغا بعد D-115 لولا هذا السطر
    expect(items).toHaveLength(1)
    expect(items.every((i) => i.kind === 'access')).toBe(true)
  })

  /*
   * ── وصولٌ يُجدَّد آليّا لا يُوقظ أحدا (D-115) ──────────────────────
   *
   * جدولُ هذه الوحدة يقول بنفسه: **الوصولُ «تجدّده دورةُ D-066 آليّا —
   * ولا يُوقظ أحدا»**. والشيفرةُ كانت تُنبّه عليه.
   *
   * **وثمنُه على X خاصّةً**: رمزُ وصولها يعيش ساعتين، ودورةُ التجديد
   * تلتقطه قبل ساعتين — **فالبلاغُ قائمٌ أبدا مهما جُدِّد**. وبلاغٌ لا
   * يُطفَأ بفعلٍ صحيحٍ يُعلَّم المالكُ أن يتجاهله، **ثمّ يتجاهل معه
   * بلاغَ التجديد الذي يوجب يدَه**.
   */
  it('ووصول له رمز تجديد لا يُنبَّه عليه', async () => {
    account('a1', 'x')
    token('a1', inDays(0), null)          // ساعات تبقى — وله refresh_enc
    expect(await expiringTokens(db, NOW)).toEqual([])
  })

  /**
   * **ولا يُسكَت عمّا انتهى فعلا.**
   *
   * فالتجديدُ قد يفشل فشلا عابرا (٥٠٣ أو عطلُ شبكة) فيردّ `deferred`
   * **ولا يُعلَّم الحسابُ `needs_reauth`**. فلو أُسكت الوصولُ مطلقا
   * لمات الرمزُ صامتا. **فالسكوتُ قبل الانتهاء وحدَه.**
   */
  it('وما انتهى فعلا يُنبَّه عليه ولو كان له تجديد', async () => {
    account('a1', 'x')
    token('a1', inDays(-1), null)
    const items = await expiringTokens(db, NOW)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ kind: 'access', threshold: 0 })
  })

  /** **وحسابٌ بلا رمز تجديدٍ يبقى منبَّها عليه**: لا سبيلَ آليّ له. */
  it('ووصول بلا رمز تجديد يبقى منبَّها عليه', async () => {
    account('a1', 'x')
    token('a1', inDays(2), null, false)
    const items = await expiringTokens(db, NOW)
    expect(items.map((i) => i.kind)).toEqual(['access'])
  })

  /**
   * **وهذه هي الحالُ التي رآها المالكُ على شاشته** — منسوخةً من
   * `sada-staging` كما قُرئت، لا مفترَضةً.
   *
   * X: انتهاءٌ بعد ساعةٍ وربع · `refresh_expires_at` **فارغ** ·
   * `refresh_enc` **ممتلئ**. وLinkedIn بعيدةٌ في الاثنين.
   *
   * وقال البلاغُ إنّ X «ستنتهي» **وقد جُدِّدت للتوّ** — ولا يُطفئه تجديد،
   * لأنّ رمزَها يعيش ساعتين والدورةُ تلتقطه قبل ساعتين.
   */
  it('وحال staging الحيّة: X لا تُنبِّه قبل انتهائها', async () => {
    account('li', 'linkedin'); account('x2', 'x')
    token('li', '2026-11-05T20:00:13.142Z', '2027-09-06T20:00:13.142Z')
    token('x2', '2026-09-10T19:00:15.658Z', null)
    expect(await expiringTokens(db, new Date('2026-09-10T17:45:00Z'))).toEqual([])
  })

  /** وتاريخٌ فاسدٌ لا يُسقط الدورة ولا يُنبَّه عليه بالخطأ. */
  it('وتاريخ لا يُقرأ يُتخطّى ولا يُسقط البقيّة', async () => {
    account('a1'); account('a2', 'x')
    token('a1', 'ليس تاريخا', null, false)
    token('a2', inDays(1), null, false)
    const items = await expiringTokens(db, NOW)
    expect(items.map((i) => i.accountId)).toEqual(['a2'])
  })
})

describe('والأثر يُكتب مرّةً', () => {
  /** دورةٌ يوميّةٌ لا تكتب سبعةَ صفوفٍ لرمزٍ واحد بين العتبتين. */
  it('إعادة الدورة لا تكرّر الصفّ', async () => {
    account('a1')
    token('a1', inDays(3), null, false)
    const items = await expiringTokens(db, NOW)

    expect((await recordAlerts(db, items)).written).toBe(1)
    expect((await recordAlerts(db, items)).written).toBe(0)

    const n = db.raw.prepare('SELECT count(*) AS n FROM token_alerts').get() as { n: number }
    expect(n.n).toBe(1)
  })

  /** **والعتبةُ جزءٌ من المفتاح**: تنبيهُ السبعة غيرُ تنبيه الواحد. */
  it('وعتبة أقرب تُكتب صفّا ثانيا', async () => {
    account('a1')
    const expiry = inDays(3)
    token('a1', expiry, null, false)
    await recordAlerts(db, await expiringTokens(db, NOW))

    // بعد يومين: بقي يومٌ واحد — عتبةٌ أخرى
    const later = new Date(NOW.getTime() + 2 * 86_400_000)
    expect((await recordAlerts(db, await expiringTokens(db, later))).written).toBe(1)

    const rows = db.raw
      .prepare('SELECT threshold FROM token_alerts ORDER BY threshold DESC')
      .all() as { threshold: number }[]
    expect(rows.map((r) => r.threshold)).toEqual([7, 1])
  })

  /** وبندُ بوّابة المرحلة ٢ يُقرأ من الصفّ لا يُفترَض. */
  it('و«أوقع تنبيه الأسبوع؟» يُجاب من القاعدة', async () => {
    account('a1')
    expect(await anyWeekAlert(db)).toBe(false)

    token('a1', inDays(3), null, false)
    await recordAlerts(db, await expiringTokens(db, NOW))
    expect(await anyWeekAlert(db)).toBe(true)
  })

  /** وتنبيهُ يومٍ واحدٍ وحده لا يُجيز بندَ الأسبوع. */
  it('وتنبيه اليوم الواحد لا يُجيز بند الأسبوع', async () => {
    account('a1')
    token('a1', inDays(0), null, false)
    await recordAlerts(db, await expiringTokens(db, NOW))
    expect(await anyWeekAlert(db)).toBe(false)
  })
})

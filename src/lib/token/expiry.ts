/**
 * تنبيهُ انتهاء الرمز — **قبل أن يسقط النشر، لا بعده.**
 *
 * ## المشكلة
 *
 * الرموزُ تنتهي: LinkedIn بشهرين، و X أقصر، **و Google في وضع Testing
 * يُسقط إذنَ التجديد كلَّ سبعة أيّام** (M-15). ولا شيءَ ينبّه —
 * **وأوّلُ علامةٍ منشورٌ وُعد بموعده ولم يخرج**.
 *
 * ## والفرقُ بين الرمزين ليس تفصيلا
 *
 * | يسقط | ما يلزم |
 * |---|---|
 * | **الوصول** | تجدّده دورةُ D-066 آليّا — ولا يُوقظ أحدا |
 * | **التجديد** | **دورةُ إذنٍ كاملةٌ بيد المالك** — ولا سبيلَ آليّ |
 *
 * فسقوطُ التجديد **يوقف المنصّة حتّى يجلس المالكُ إليها**. ويُنبَّه
 * عليه أبكر، ويُعرَض أشدّ.
 *
 * ## وعتبتان لا واحدة
 *
 * **سبعةُ أيّامٍ** تعطي وقتا لتدبير الأمر. **ويومٌ واحد** تقول «الآن».
 * وتنبيهٌ واحدٌ قبل أسبوعٍ **يُنسى في أسبوع**.
 */
import type { Db } from '../tokens'
import { changedRows } from '../dbResult'

/** كم يوما قبل الانتهاء يُنبَّه. */
export const THRESHOLDS = [7, 1] as const

export type TokenKind = 'access' | 'refresh'

export interface ExpiringToken {
  readonly accountId: string
  /** منظّمةُ الحساب — تُقرأ مع الصفّ وتُكتب مع تنبيهه (D-277). */
  readonly org: string
  readonly platform: string
  readonly displayName: string
  readonly kind: TokenKind
  readonly expiresAt: string
  /** كم يوما بقي — ويكون سالبا إن انتهى. */
  readonly daysLeft: number
  /** أيُّ عتبةٍ عبرها — ٧ أو ١، أو ٠ إن انتهى فعلا. */
  readonly threshold: number
}

const DAY_MS = 86_400_000

/** أصغرُ عتبةٍ عبرها هذا العدد — أو `null` إن لم يعبر شيئا. */
export function thresholdFor(daysLeft: number): number | null {
  if (daysLeft < 0) return 0
  for (const t of [...THRESHOLDS].sort((a, b) => a - b)) {
    if (daysLeft <= t) return t
  }
  return null
}

interface Row {
  account_id: string
  org_id: string
  platform: string
  display_name: string
  expires_at: string
  refresh_expires_at: string | null
  /** ‏١ إن كان في الصفّ رمزُ تجديدٍ محفوظ — **ولا يُفَكّ تشفيرُه**. */
  has_refresh: number
}

/**
 * الرموزُ التي تقترب — **ولا يُفكّ تشفيرُ شيء.**
 *
 * التواريخُ أعمدةٌ صريحةٌ في `tokens`، فلا حاجةَ إلى المفتاح ولا إلى
 * قراءة الرمز نفسِه (D-005).
 */
export async function expiringTokens(db: Db, now: Date): Promise<ExpiringToken[]> {
  let rows: Row[] = []
  try {
    const result = await db
      .prepare(
        `SELECT t.account_id, t.org_id, t.expires_at, t.refresh_expires_at,
                CASE WHEN t.refresh_enc IS NULL THEN 0 ELSE 1 END AS has_refresh,
                a.platform, a.display_name
           FROM tokens t JOIN accounts a ON a.id = t.account_id AND a.org_id = t.org_id
          WHERE a.status != 'revoked'`,
      )
      .all<Row>()
    rows = result.results
  } catch {
    return []
  }

  const out: ExpiringToken[] = []
  for (const row of rows) {
    const pairs: { kind: TokenKind; at: string | null }[] = [
      { kind: 'access', at: row.expires_at },
      { kind: 'refresh', at: row.refresh_expires_at },
    ]
    for (const { kind, at } of pairs) {
      if (at === null || at === '') continue
      const ms = Date.parse(at)
      // تاريخٌ لا يُقرأ لا يُنبَّه عليه ولا يُسقط الدورة
      if (Number.isNaN(ms)) continue
      const daysLeft = Math.floor((ms - now.getTime()) / DAY_MS)
      const threshold = thresholdFor(daysLeft)
      if (threshold === null) continue
      /*
       * **ووصولٌ يُجدَّد آليّا لا يُوقظ أحدا** (D-115) — كما يقول جدولُ
       * هذا الملفّ في صدره، وكانت الشيفرةُ تخالفه.
       *
       * وثمنُه على X خاصّةً: رمزُ وصولها يعيش ساعتين، و`RENEW_MARGIN`
       * ساعتان — **فالبلاغُ قائمٌ أبدا مهما جُدِّد**. وبلاغٌ لا يُطفَأ
       * بفعلٍ صحيحٍ يُعلَّم المالكُ أن يتجاهله، **ثمّ يتجاهل معه بلاغَ
       * التجديد الذي يوجب يدَه** — وهو الذي بُنيت الوحدةُ من أجله.
       *
       * **والشرطُ وجودُ الرمز لا تاريخُه**: X تعطي إذنَ تجديدٍ بلا
       * تاريخِ انتهاء، فـ`refresh_expires_at` فارغٌ و`refresh_enc`
       * ممتلئ — ومن قرأ العمودَ الفارغَ وحدَه ظنّها بلا تجديد.
       *
       * **ولا يُسكَت عمّا انتهى فعلا** (`daysLeft < 0`): التجديدُ يفشل
       * فشلا عابرا (٥٠٣ أو عطلُ شبكة) فيردّ `deferred` **ولا يُعلَّم
       * الحسابُ `needs_reauth`** — فلو أُسكت الوصولُ مطلقا لمات صامتا.
       */
      if (kind === 'access' && row.has_refresh === 1 && daysLeft >= 0) continue
      out.push({
        accountId: row.account_id, org: row.org_id, platform: row.platform,
        displayName: row.display_name, kind, expiresAt: at, daysLeft, threshold,
      })
    }
  }
  // **والتجديدُ يسبق الوصول** عند تساوي الأيّام: سقوطُه يوجب يدَ المالك
  return out.sort((a, b) => a.daysLeft - b.daysLeft || (a.kind === 'refresh' ? -1 : 1))
}

export interface AlertOutcome {
  readonly checked: number
  /** كم تنبيها كُتب الآن — والمكتوبُ سابقا لا يُعاد. */
  readonly written: number
}

/**
 * يكتب ما لم يُكتَب — **ومفتاحُ التفرّد يمنع التكرار.**
 *
 * فدورةٌ يوميّةٌ لا تكتب سبعةَ صفوفٍ لرمزٍ واحد بين العتبتين.
 * **والعتبةُ جزءٌ من المفتاح**: تنبيهُ السبعة غيرُ تنبيه الواحد.
 */
export async function recordAlerts(
  db: Db,
  items: readonly ExpiringToken[],
): Promise<AlertOutcome> {
  let written = 0
  for (const item of items) {
    try {
      const result = await db
        .prepare(
          `INSERT INTO token_alerts (account_id, kind, threshold, expires_at, org_id)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (account_id, kind, threshold, expires_at) DO NOTHING`,
        )
        .bind(item.accountId, item.kind, item.threshold, item.expiresAt, item.org)
        .run()
      if (changedRows(result)) written += 1
    } catch {
      // صفٌّ لم يُكتَب لا يُسقط البقيّة — **والتنبيهُ يُعرَض في اللوحة
      // من `expiringTokens` لا من الصفّ**، فالمالكُ يراه على كلّ حال
    }
  }
  return { checked: items.length, written }
}

/** أوقع تنبيهُ سبعةِ أيّامٍ يوما ما؟ — بندُ بوّابة المرحلة ٢. */
export async function anyWeekAlert(db: Db): Promise<boolean> {
  try {
    const row = await db
      // ‏بندُ البوّابة عامّ لكلّ المنظّمات (D-277)
      .prepare('SELECT 1 AS n FROM token_alerts WHERE threshold >= 7 AND org_id IN (SELECT id FROM orgs) LIMIT 1')
      .first<{ n: number }>()
    return row !== null
  } catch {
    return false
  }
}

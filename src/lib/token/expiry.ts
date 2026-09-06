/**
 * تنبيهُ انتهاء الرمز — **قبل أن يسقط النشر، لا بعده.**
 *
 * ## المشكلة
 *
 * الرموزُ تنتهي: LinkedIn بشهرين، و X أقصر، **و Google في وضع Testing
 * يُسقط رمزَ التجديد كلَّ سبعة أيّام** (M-15). ولا شيءَ ينبّه —
 * **وأوّلُ علامةٍ منشورٌ وُعد بموعده ولم يخرج**.
 *
 * ## والفرقُ بين الرمزين ليس تفصيلا
 *
 * | يسقط | ما يلزم |
 * |---|---|
 * | **الوصول** | يُجدَّد آليّا بـ`refresh_token` — ولا يُوقظ أحدا |
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
  platform: string
  display_name: string
  expires_at: string
  refresh_expires_at: string | null
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
        `SELECT t.account_id, t.expires_at, t.refresh_expires_at,
                a.platform, a.display_name
           FROM tokens t JOIN accounts a ON a.id = t.account_id
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
      out.push({
        accountId: row.account_id, platform: row.platform,
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
          `INSERT INTO token_alerts (account_id, kind, threshold, expires_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT (account_id, kind, threshold, expires_at) DO NOTHING`,
        )
        .bind(item.accountId, item.kind, item.threshold, item.expiresAt)
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
      .prepare('SELECT 1 AS n FROM token_alerts WHERE threshold >= 7 LIMIT 1')
      .first<{ n: number }>()
    return row !== null
  } catch {
    return false
  }
}

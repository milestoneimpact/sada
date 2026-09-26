/**
 * جمعُ ما يستحقّ أن يُوقظ المالك (D-109).
 *
 * **وثلاثةٌ لا رابعَ لها** — ولا يُقرأ منها إلّا ما وقع فعلا:
 *
 * - إذنٌ يقترب: من `token_alerts` الذي يُكتَب أصلا (0016).
 * - نشرٌ فشل نهائيّا: منشورٌ حالُه `failed` — **والطابورُ فرغ منه**.
 * - سقفُ إنفاقٍ بُلغ: من `cost_ledger` مقابلَ الإعداد.
 *
 * **ولا يُخترَع حدثٌ لتكتمل القائمة** — قاعدةُ D-104 نفسُها في موضعٍ آخر.
 */
import { budgetAlert, publishAlert, tokenAlert, type Alert } from './outbox'
import type { Db } from '../tokens'

/** اليومُ بصيغة القاعدة — والسقفُ يوميٌّ فمفتاحُه يومٌ لا لحظة. */
function dayOf(now: Date): string {
  return now.toISOString().slice(0, 10)
}

export async function collectAlerts(
  db: Db, now: Date, spendCap: number,
): Promise<readonly Alert[]> {
  const out: Alert[] = []

  // ── ١ · إذنٌ يقترب ─────────────────────────────────────────────────
  // **والصفُّ مكتوبٌ أصلا** (0016): هذا يقرؤه ولا يعيد حسابَه، فلا
  // يفترق عدّادان
  const { results: tokens } = await db
    .prepare(
      `SELECT a.display_name AS name, t.kind, t.threshold
         FROM token_alerts t JOIN accounts a ON a.id = t.account_id
        WHERE t.at >= datetime('now', '-2 days')`,
    )
    .all<{ name: string; kind: string; threshold: number }>()
    .catch(() => ({ results: [] as { name: string; kind: string; threshold: number }[] }))
  for (const t of tokens) out.push(tokenAlert(t.name, t.threshold, t.kind))

  // ── ٢ · نشرٌ فشل نهائيّا ───────────────────────────────────────────
  // **ونهائيٌّ لا محاولةٌ فشلت**: الطابورُ يعيد، وتنبيهٌ عند كلّ محاولةٍ
  // يُطفَأ في يومه. والحالُ `failed` هي التي تقول «فرغ منه الطابور»
  const { results: failed } = await db
    .prepare(
      `SELECT p.id, p.platform, COUNT(pa.id) AS tries
         FROM posts p LEFT JOIN publish_attempts pa ON pa.post_id = p.id
        WHERE p.status = 'failed'
        GROUP BY p.id`,
    )
    .all<{ id: string; platform: string; tries: number }>()
    .catch(() => ({ results: [] as { id: string; platform: string; tries: number }[] }))
  for (const f of failed) out.push(publishAlert(f.id, f.platform, f.tries))

  // ── ٣ · سقفُ الإنفاق ───────────────────────────────────────────────
  // **ولا يُنبَّه على سقفٍ لم يُوضَع**: صفرٌ يعني «بلا سقف» لا «سقفُه صفر»
  if (spendCap > 0) {
    const day = dayOf(now)
    const spent = await db
      .prepare(
        `SELECT COALESCE(SUM(total), 0) AS s FROM cost_ledger
          WHERE at >= ? AND at < datetime(?, '+1 day')`,
      )
      .bind(day, day)
      .first<{ s: number }>()
      .catch(() => null)
    if (spent !== null && spent.s >= spendCap) {
      out.push(budgetAlert(day, spent.s, spendCap))
    }
  }

  return out
}

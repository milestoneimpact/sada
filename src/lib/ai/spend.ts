/**
 * قراءة الإنفاق من `cost_ledger` مفروزا بالمزوّد.
 *
 * المصدر هو الدفتر نفسه لا تقديرٌ موازٍ: رقمان لنفس الشيء يفترقان يوما،
 * ولا يُعرف أيّهما الصادق. والدفتر يُكتب قبل النجاح (D-008)، فهو الأعلى
 * والأصدق.
 */
import type { Db } from '../tokens'
import type { ProviderName } from './registry'

export interface ProviderSpend {
  readonly calls: number
  readonly total: number
}

export type SpendByProvider = Readonly<Partial<Record<ProviderName | string, ProviderSpend>>>

/**
 * يجمع إنفاق آخر `days` يوما.
 *
 * الجمع في SQL لا في الذاكرة: صفوف الدفتر تنمو بلا حدّ، وسحبُها كلّها
 * إلى Worker ليُجمع فيه يصطدم بحدّ المعالجة قبل أن يُفيد.
 */
export async function spendByProvider(db: Db, days = 30): Promise<SpendByProvider> {
  const { results } = await db
    .prepare(
      `SELECT provider, count(*) AS calls, coalesce(sum(total), 0) AS total
         FROM cost_ledger
        WHERE at >= datetime('now', ?)
        GROUP BY provider`,
    )
    .bind(`-${days} days`)
    .all<{ provider: string; calls: number; total: number }>()

  const out: Record<string, ProviderSpend> = {}
  for (const row of results) {
    out[row.provider] = { calls: row.calls, total: row.total }
  }
  return out
}

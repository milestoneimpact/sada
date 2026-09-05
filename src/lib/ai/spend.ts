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

export interface DailySpend {
  /** `YYYY-MM-DD` بـ UTC — نفس ما يكتبه الدفتر. */
  readonly day: string
  readonly total: number
  readonly calls: number
}

/**
 * سلسلةٌ يوميّة للرسم الزمنيّ.
 *
 * تُملأ الأيّام الخالية بصفر: سلسلةٌ تقفز فوق يومٍ بلا إنفاق ترسم خطّا
 * يكذب — يوصل الاثنين بالأربعاء وكأنّ الثلاثاء لم يكن. والصفر حقيقةٌ
 * لا فجوة.
 */
export async function dailySpend(db: Db, days = 14): Promise<DailySpend[]> {
  let rows: { day: string; total: number; calls: number }[] = []
  try {
    const result = await db
      .prepare(
        `SELECT date(at) AS day, coalesce(sum(total), 0) AS total, count(*) AS calls
           FROM cost_ledger
          WHERE at >= date('now', ?)
          GROUP BY date(at)`,
      )
      .bind(`-${days - 1} days`)
      .all<{ day: string; total: number; calls: number }>()
    rows = result.results
  } catch {
    rows = []
  }

  const found = new Map(rows.map((r) => [r.day, r]))
  const series: DailySpend[] = []
  const today = new Date()
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i))
    const day = date.toISOString().slice(0, 10)
    const row = found.get(day)
    series.push({ day, total: row?.total ?? 0, calls: row?.calls ?? 0 })
  }
  return series
}

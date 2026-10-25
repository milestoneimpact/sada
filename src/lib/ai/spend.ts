/**
 * قراءة الإنفاق من `cost_ledger` مفروزا بالمزوّد.
 *
 * المصدر هو الدفتر نفسه لا تقديرٌ موازٍ: رقمان لنفس الشيء يفترقان يوما،
 * ولا يُعرف أيّهما الصادق. والدفتر يُكتب قبل النجاح (D-008)، فهو الأعلى
 * والأصدق.
 */
import type { Db } from '../tokens'
import { platformLabel } from '../oauth/providers'
import { monthStart } from '../time/zone'
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
        -- السقفُ عامّ لكلّ المنظّمات: دفترُ الإنفاق يُقرأ على المنظّمات كلِّها
        WHERE org_id IN (SELECT id FROM orgs) AND at >= datetime('now', ?)
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

/**
 * ما أُنفق منذ لحظةٍ — **من الدفتر كلِّه**: الكتابةُ والصورُ والنشرُ والقياسُ معًا.
 *
 * و«هذا الشهر» يمرّ من هنا بأوّل الشهر بتوقيت المالك (`monthStart`). كانت
 * البلاطةُ «إنفاق 30 يوما» تصف نفسَها «المجموعُ الشهريّ» وهي آخرُ ثلاثين يومًا
 * متحرّكة — فيدخل فيها الشهرُ الماضي. **والحدُّ بصيغة القاعدة** لا بـ ISO: حرفُ
 * `T` بعد المسافة في المقارنة النصّيّة (وهي علّةُ التقرير الأسبوعيّ نفسُها).
 */
async function spendSince(db: Db, since: Date): Promise<number> {
  try {
    const row = await db
      // السقفُ عامّ لكلّ المنظّمات (D-271)
      .prepare('SELECT coalesce(sum(total), 0) AS total FROM cost_ledger WHERE org_id IN (SELECT id FROM orgs) AND at >= ?')
      .bind(since.toISOString().slice(0, 19).replace('T', ' '))
      .first<{ total: number | null }>()
    return row?.total ?? 0
  } catch {
    return 0
  }
}

/**
 * «هذا الشهر حتّى اليوم» — **من أوّل الشهر بتوقيت المالك** (ر-10).
 *
 * و`utc` (اسمٌ باقٍ من D-173) حين لم تصل منطقتُه: يُحسَب الشهرُ بتوقيت الرياض
 * **ويُقال ذلك** (D-201).
 */
export async function spendThisMonth(
  db: Db,
  zone: string | null,
  now: Date,
): Promise<{ total: number; utc: boolean }> {
  return { total: await spendSince(db, monthStart(now, zone)), utc: zone === null }
}

/** صفٌّ في «أين يذهب المال» — جهةٌ في الدفتر باسمها، وما أُنفق عليها. */
export interface SpendRow {
  readonly key: string
  readonly label: string
  readonly calls: number
  readonly total: number
}

/**
 * أسماءُ ما يكتبه الدفتر وليس مزوّدَ ذكاء — **ما يُرى في الرسم لا مفتاحُ العمود**.
 * والمنصّاتُ الأخرى «النشر» وحده: X وحده يُحاسَب على قراءة المقاييس (`cost.ts`).
 */
const LEDGER_LABEL: Readonly<Record<string, string>> = {
  x: 'X — النشر والقياس',
  'cloudflare-browser': 'Cloudflare — رسم الشرائح',
}

/**
 * صفوفُ الإنفاق **من كلّ جهةٍ في الدفتر**، لا من مزوّدي الذكاء وحدهم.
 *
 * كان «أين يذهب المال» يُرسَم من قائمة المزوّدين، فغابت كلفةُ X عن الأعمدة
 * والمجموعُ فوقها يحسبها — فلا تساوي الأعمدةُ المجموع، **وX هو ما يُحاسَب على
 * كلّ طلب**. فالمصدرُ الدفترُ نفسُه، والاسمُ من المزوّدين حيث وُجد، ثمّ من هنا.
 */
export function spendRows(spend: SpendByProvider, labels: Readonly<Record<string, string>>): SpendRow[] {
  return Object.entries(spend)
    .flatMap(([key, e]) => (e === undefined ? [] : [{
      key,
      label: labels[key] ?? LEDGER_LABEL[key]
        ?? (platformLabel(key) === key ? key : `${platformLabel(key)} — النشر`),
      calls: e.calls,
      total: e.total,
    }]))
    .sort((a, b) => b.total - a.total)
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
          -- السقفُ عامّ لكلّ المنظّمات
          WHERE org_id IN (SELECT id FROM orgs) AND at >= date('now', ?)
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

/** إنفاق مزوّدٍ واحد اليوم — لسقفه الخاصّ. */
export async function spendTodayFor(db: Db, provider: string): Promise<number> {
  try {
    const row = await db
      .prepare(
        `SELECT coalesce(sum(total), 0) AS total
           FROM cost_ledger
          -- سقفُ المزوّد عامّ لكلّ المنظّمات: المزوّدون إعدادٌ عامّ
          WHERE org_id IN (SELECT id FROM orgs) AND provider = ? AND at >= date('now')`,
      )
      .bind(provider)
      .first<{ total: number }>()
    return row?.total ?? 0
  } catch {
    // دفترٌ لا يُقرأ يُفترض مستهلَكا: الخطأ يميل إلى المنع لا إلى الإنفاق
    return Number.POSITIVE_INFINITY
  }
}

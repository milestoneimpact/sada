/**
 * **الشهرُ في سطورٍ قليلة** (D-383 · المرحلة ٨) — ما تعرضه شاشةُ الشهر والرحلةُ في الرئيسيّة، دوالُّ خالصة بلا قاعدة ولا ساعة.
 *
 * - `loadLevel`: شارةُ الحمل لليوم (أخضر دون السقف، أصفر عنده، أحمر فوقه) من `daily_total_cap` في `schedule_rules`.
 * - `monthGrid`: أسابيعُ الشهر تبدأ بالأحد، وخاناتُ ما قبل أوّله وبعد آخره فارغة.
 * - `approvalLine`: سطرُ الاعتماد الواحد «٣٢ بندًا، ٢٩ تُجدوَل، ٣ ممنوعة».
 * - `monthJourney`: المحطّاتُ الخمس (مستورد، مراجَع، معتمد، مجدول، منشور) والتنبيهات.
 */
import { addDays } from './checks'

export type Load = 'ok' | 'warn' | 'bad'

export function loadLevel(count: number, dailyCap: number): Load | null {
  if (count <= 0) return null
  if (count < dailyCap) return 'ok'
  return count === dailyCap ? 'warn' : 'bad'
}

export const LOAD_SAY: Readonly<Record<Load, string>> = { ok: 'حملٌ مريح', warn: 'عند السقف', bad: 'فوق السقف' }

const daysIn = (period: string): number => {
  const [y, m] = period.split('-').map(Number) as [number, number]
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/** أسابيعُ الشهر، كلُّ أسبوعٍ سبعُ خانات (الأحدُ أوّلها) فيها اليومُ «YYYY-MM-DD» أو `null`. */
export function monthGrid(period: string): (string | null)[][] {
  const first = `${period}-01`
  const lead = new Date(`${first}T00:00:00Z`).getUTCDay()
  const cells: (string | null)[] = Array.from({ length: lead }, () => null)
  for (let i = 0; i < daysIn(period); i++) cells.push(addDays(first, i))
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks: (string | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

export function nextPeriod(period: string): string {
  const [y, m] = period.split('-').map(Number) as [number, number]
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}

export function prevPeriod(period: string): string {
  const [y, m] = period.split('-').map(Number) as [number, number]
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

/** يومُ المالك المحلّيّ «YYYY-MM-DD» من أجزاء `localParts`. */
export function localDay(p: { readonly year: number; readonly month: number; readonly day: number }): string {
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

export function isPeriod(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v)
}

export interface ApprovalCounts {
  readonly total: number
  readonly blocked: number
  /** أوّلُ سببٍ للمنع بالعربيّة، ويُذكر حين يكون في الخطّة ممنوع. */
  readonly reason?: string | null
}

/** سطرُ الاعتماد: كم بندًا، وكم يُجدوَل، وكم يُمنع ولماذا. */
export function approvalLine(c: ApprovalCounts): string {
  const go = Math.max(0, c.total - c.blocked)
  const head = `${String(c.total)} بندًا، ${String(go)} تُجدوَل`
  if (c.blocked === 0) return `${head}، ولا ممنوع.`
  const why = c.reason === undefined || c.reason === null || c.reason === '' ? '' : ` بسبب: ${c.reason}`
  return `${head}، ${String(c.blocked)} ممنوعة${why}.`
}

export type StationId = 'imported' | 'reviewed' | 'approved' | 'scheduled' | 'published'

export const STATION_SAY: Readonly<Record<StationId, string>> = {
  imported: 'مستورد', reviewed: 'مراجَع', approved: 'معتمد', scheduled: 'مجدول', published: 'منشور',
}

export const STATIONS: readonly StationId[] = ['imported', 'reviewed', 'approved', 'scheduled', 'published']

export interface MonthFacts {
  readonly period: string
  /** هل للشهر خطّةٌ مستوردة أصلًا. */
  readonly hasPlan: boolean
  /** خطّتُه مُقفلةٌ بعد المراجعة (`locked_at`). */
  readonly reviewed: boolean
  readonly items: number
  /** عددُ المنشورات بحالها: approved · queued · published · failed. */
  readonly approved: number
  readonly queued: number
  readonly published: number
  readonly failed: number
}

export interface MonthJourney {
  readonly period: string
  /** آخرُ محطّةٍ بلغها الشهر، و`null` قبل أيّ استيراد. */
  readonly reached: StationId | null
  readonly counts: Readonly<Record<StationId, number>>
  readonly alerts: readonly string[]
}

/** الرحلةُ لشهر، وتنبيهاتُها: نشرٌ فشل، أو شهرٌ يقترب بلا خطّة. `today` يومُ المالك المحلّيّ. */
export function monthJourney(f: MonthFacts, today: string): MonthJourney {
  const counts: Record<StationId, number> = {
    imported: f.hasPlan ? f.items : 0,
    reviewed: f.reviewed ? f.items : 0,
    approved: f.approved + f.queued + f.published + f.failed,
    scheduled: f.queued + f.published + f.failed,
    published: f.published,
  }
  let reached: StationId | null = null
  for (const s of STATIONS) if (counts[s] > 0) reached = s
  const alerts: string[] = []
  if (f.failed > 0) alerts.push(`${String(f.failed)} منشور فشل نشره في ${f.period}، فافتح «الإشعارات» لترى السبب.`)
  if (!f.hasPlan) {
    const start = `${f.period}-01`
    const left = Math.round((Date.parse(`${start}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000)
    if (left <= 0) alerts.push(`شهر ${f.period} بدأ بلا خطّة.`)
    else if (left <= 10) alerts.push(`شهر ${f.period} يبدأ بعد ${String(left)} يومًا بلا خطّة، فادفع ملفّه إلى 01-plan.`)
  }
  return { period: f.period, reached, counts, alerts }
}

export interface ImportRow {
  readonly id: string
  readonly sourceKind: string
  readonly sourceRef: string | null
  readonly contentHash: string
  readonly period: string | null
  readonly status: string
  readonly createdAt: string
  /** سطرٌ ممّا في `report_json`: ما أُضيف وتغيّر وحُذف، أو سببُ الفشل. */
  readonly summary: string
  readonly planId?: string | null
  /** كم مرّةً أُعيد رفعُ الملفّ نفسِه بلا تغيير (D-406)، ومتى آخرُها. */
  readonly reseen?: number
  readonly lastSeenAt?: string | null
}

export interface DiffRow {
  readonly itemNo: string
  readonly platform: string
  readonly kind: 'added' | 'removed' | 'text' | 'time' | 'format' | 'media'
  readonly awaiting: boolean
  readonly detail: string
}


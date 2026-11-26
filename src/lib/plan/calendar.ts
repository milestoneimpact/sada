/**
 * **التقويمُ الموحّد** (D-410 · المرحلة ٤): شاشةُ الشهر نفسُها تتبدّل بين شهرٍ وأسبوعٍ ويوم، وتجمع المنشورَ والمجدوَلَ
 * وما ينتظر الاعتماد، وتُفرز بشاراتِ المنصّة (واحدةٌ أو أكثر) والحال. والفرزُ كلُّه في العنوان فيُشارَك الرابطُ ويعمل بلا سكربت.
 *
 * دوالُّ خالصة بلا قاعدةٍ ولا ساعة: قراءةُ العنوان، وحالُ البند من حال منشوره، والفرز، وأيّامُ العرض، وبناءُ الروابط.
 */
import { addDays } from './checks'
import { isPeriod } from './month'

export type CalView = 'month' | 'week' | 'day'
/** الحالاتُ الثلاث في التقويم: منشور، ومجدوَل (معتمَدٌ أو في الطابور)، وينتظر الاعتماد (مسوّدةٌ أو بلا منشور). */
export type CalStatus = 'published' | 'scheduled' | 'awaiting'

export const CAL_STATUSES: readonly CalStatus[] = ['published', 'scheduled', 'awaiting']
export const CAL_STATUS_SAY: Readonly<Record<CalStatus, string>> = { published: 'منشور', scheduled: 'مجدوَل', awaiting: 'ينتظر الاعتماد' }
/** مفتاحُ الألوان من نغمات الشارة (`statusBadge`)، فلا لونَ خارج الرموز. */
export const CAL_STATUS_TONE: Readonly<Record<CalStatus, 'ok' | 'pending' | 'warn'>> = { published: 'ok', scheduled: 'pending', awaiting: 'warn' }
export const CAL_VIEW_SAY: Readonly<Record<CalView, string>> = { month: 'شهر', week: 'أسبوع', day: 'يوم' }

export interface CalQuery {
  readonly view: CalView
  readonly period: string
  /** اليومُ المرجع للأسبوع واليوم «YYYY-MM-DD». */
  readonly day: string
  /** المنصّاتُ المختارة، والفراغُ يعني كلَّها. */
  readonly platforms: readonly string[]
  readonly statuses: readonly CalStatus[]
}

export interface CalItem {
  readonly id: string
  readonly platform: string
  /** «YYYY-MM-DD HH:MM» محلّيّ. */
  readonly due: string
  readonly title: string
  readonly status: CalStatus
  /** يقدر `approvePlanVersion` أن يعتمده: مسوّدةٌ ذاتُ نصّ، أو بندٌ بلا منشورٍ وله نصّ (D-411). والفاشلُ والفارغُ لا. */
  readonly ready: boolean
}

const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(v)

/** حالُ البند من حال منشوره (`posts.status`)، وبلا منشورٍ ينتظر الاعتماد. والفاشلُ يعود إلى قرار المالك. */
export function calStatus(post: string | null): CalStatus {
  if (post === 'published') return 'published'
  if (post === 'approved' || post === 'edited' || post === 'queued' || post === 'publishing') return 'scheduled'
  return 'awaiting'
}

/** هل يعتمده `approvePlanVersion` فعلًا؟ بشرطه نفسِه: مسوّدةٌ ذاتُ نصّ، أو لا منشورَ وللبند نصّ (D-411). */
export function calReady(post: string | null, postText: string | null, copy: string | null): boolean {
  if (post === null) return (copy ?? '').trim() !== ''
  return post === 'draft' && (postText ?? '').trim() !== ''
}

/** فتراتُ الأيّام المعروضة «YYYY-MM» بلا تكرار: الأسبوعُ العابرُ يمسّ شهرين فتُقرأ خطّتاهما (D-411). */
export function spanPeriods(q: CalQuery): string[] {
  const days = calSpan(q).days
  return days.length === 0 ? [q.period] : [...new Set(days.map((d) => d.slice(0, 7)))]
}

/** يقرأ العنوان: `v` و`p` و`d` و`pf` (مكرَّرًا أو بفواصل) و`st`. وكلُّ قيمةٍ غريبةٍ تسقط إلى الافتراض. */
export function parseCalQuery(q: URLSearchParams, today: string, known: readonly string[]): CalQuery {
  const list = (k: string): string[] => q.getAll(k).flatMap((v) => v.split(',')).map((v) => v.trim()).filter((v) => v !== '')
  const v = q.get('v')
  const view: CalView = v === 'week' || v === 'day' ? v : 'month'
  const p = q.get('p')
  const d = q.get('d')
  const day = isDay(d) ? d : isPeriod(p) ? (p === today.slice(0, 7) ? today : p + '-01') : today
  const period = view === 'month' && isPeriod(p) ? p : day.slice(0, 7)
  const platforms = [...new Set(list('pf'))].filter((x) => known.includes(x))
  const statuses = CAL_STATUSES.filter((s) => list('st').includes(s))
  return { view, period, day, platforms, statuses }
}

/** يطابق البندُ الفرزَ: منصّتُه من المختارة (أو لا اختيار)، وحالُه كذلك. */
export function matches(it: CalItem, q: Pick<CalQuery, 'platforms' | 'statuses'>): boolean {
  return (q.platforms.length === 0 || q.platforms.includes(it.platform)) && (q.statuses.length === 0 || q.statuses.includes(it.status))
}

/** أيّامُ الأسبوع (الأحدُ أوّلها) الذي فيه اليوم. */
export function weekOf(day: string): string[] {
  const lead = new Date(`${day}T00:00:00Z`).getUTCDay()
  const first = addDays(day, -lead)
  return Array.from({ length: 7 }, (_, i) => addDays(first, i))
}

/** الأيّامُ المعروضة والسابقُ والتالي لكلّ عرض. */
export function calSpan(q: CalQuery): { readonly days: readonly string[]; readonly prev: string; readonly next: string } {
  if (q.view === 'day') return { days: [q.day], prev: addDays(q.day, -1), next: addDays(q.day, 1) }
  if (q.view === 'week') return { days: weekOf(q.day), prev: addDays(q.day, -7), next: addDays(q.day, 7) }
  return { days: [], prev: q.period, next: q.period }
}

/** رابطُ التقويم بتغييرٍ واحد، والافتراضيُّ لا يُكتب فيقصر الرابط. */
export function calHref(q: CalQuery, change: Partial<CalQuery> = {}): string {
  const n = { ...q, ...change }
  const s = new URLSearchParams()
  if (n.view !== 'month') s.set('v', n.view)
  if (n.view === 'month') s.set('p', n.period)
  else s.set('d', n.day)
  if (n.platforms.length > 0) s.set('pf', n.platforms.join(','))
  if (n.statuses.length > 0) s.set('st', n.statuses.join(','))
  return '/panel/plan/month?' + s.toString()
}

/** يقلب عنصرًا في قائمةٍ مختارة (اختيارٌ متعدّد بالروابط). */
export function toggle<T>(list: readonly T[], x: T): T[] {
  return list.includes(x) ? list.filter((y) => y !== x) : [...list, x]
}

/** بنودُ «اعتمد ما في الفرز»: ما ينتظر الاعتماد ويقدر الاعتمادُ عليه (`ready` · D-411) ويطابق الفرز، وفي الأيّام المعروضة إن لم يكن العرضُ شهرًا. */
export function bulkPick(items: readonly CalItem[], q: CalQuery): string[] {
  const span = calSpan(q).days
  return items.filter((it) => it.status === 'awaiting' && it.ready && matches(it, q) && (span.length === 0 || span.includes(it.due.slice(0, 10)))).map((it) => it.id)
}

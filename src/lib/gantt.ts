/**
 * الخطُّ الزمنيُّ للمحفظة كلِّها — **كلُّ منشورٍ شريطٌ من كتابته إلى خروجه** (D-212).
 *
 * الجدولُ المحوريُّ يجيب «كم؟»، وشاشةُ المنصّة تجيب «ماذا في هذه القناة؟». **ولا شاشةَ
 * تجيب «أين يقع كلُّ شيءٍ من الزمن معًا؟»**: أيُّ أسبوعٍ مزدحمٌ وأيُّه فارغ، وأيُّ حسابٍ
 * لم يُكتب له منذ شهر، وأيُّ مسوّدةٍ تنتظر قرارًا منذ عشرة أيّام. فهنا الخططُ والمنصّاتُ
 * والحساباتُ صفوفًا، والأيّامُ عمودًا، **وكلُّ منشورٍ شريطٌ واحد**.
 *
 * ## والشريطُ مرحلتان وعلامة
 *
 * | الجزء | من | إلى |
 * |---|---|---|
 * | **الكتابة** | `created_at` | `approved_at` — أو «الآن» إن لم يُعتمَد بعد |
 * | **الانتظار** | `approved_at` | موعدُه، أو لحظةُ نشره إن سبقت |
 * | **العلامة** | موعدُه أو لحظةُ نشره | — بلون حاله |
 *
 * فشريطٌ طويلُ الكتابة قرارٌ تأخّر، **وشريطٌ طويلُ الانتظار جدولٌ مزدحم** — والفرقُ يُرى
 * بلا رقم.
 *
 * ## والمحرّكُ نقيٌّ كالمحوريّ (D-120)
 *
 * يأخذ صفوفًا ونافذةً ويردّ مواضعَ بالنسبة المئويّة. **فيُختبَر بالحساب**، ولا يعرف
 * قاعدةً ولا HTML. والتواريخُ تُقرأ بـ `parseSqliteUtc` لأنّها بصيغة القاعدة.
 */
import { parseSqliteUtc } from './format'
import { PLATFORM_LABEL, platformLabel } from './oauth/providers'
import { dayRange, localParts } from './time/zone'

/** منشورٌ واحدٌ كما يُقرأ من القاعدة — **كلُّ لحظةٍ بصيغتها** (`YYYY-MM-DD HH:MM:SS`). */
export interface GanttPost {
  readonly id: string
  readonly platform: string
  /** معرّفُ الحساب — وفارغٌ لمسوّدةٍ لم تُربَط. */
  readonly accountId: string
  readonly account: string
  readonly status: string
  readonly text: string
  readonly createdAt: string
  readonly approvedAt: string | null
  readonly scheduledAt: string | null
  /** أوّلُ محاولةٍ ناجحة (`publish_attempts.at`) — وهي «وقتُ النشر». */
  readonly publishedAt: string | null
}

/** خطّةُ أسبوع — **سبعةُ أيّامٍ من `week_start`**. */
export interface GanttPlan {
  readonly id: string
  readonly weekStart: string
  readonly status: string
}

/** النغمةُ من نغمات الشارة الخمس (D-189) — **فلونُ الشريط لونُ شارته**. */
export type GanttTone = 'ok' | 'warn' | 'bad' | 'pending' | 'idle'

export interface GanttBar {
  readonly id: string
  readonly href: string
  readonly label: string
  readonly status: string
  readonly tone: GanttTone
  /** بدايةُ الشريط ونهايتُه بالنسبة المئويّة من النافذة، **مقصوصتين إليها**. */
  readonly start: number
  readonly end: number
  /** حدُّ الكتابة والانتظار — `null` حين لم يُعتمَد أو وقع خارج النافذة. */
  readonly split: number | null
  /** موضعُ العلامة — `null` حين لا موعدَ ولا نشر، أو وقعا خارج النافذة. */
  readonly mark: number | null
  /** أيبدأ قبل النافذة أو ينتهي بعدها؟ فيُرسَم طرفُه مفتوحًا. */
  readonly clippedStart: boolean
  readonly clippedEnd: boolean
  /** مسوّدةٌ لم يُقرَّر فيها: نهايتُها «الآن» لا لحظةٌ وقعت. */
  readonly open: boolean
  readonly createdAt: string
  readonly approvedAt: string | null
  readonly at: string | null
}

/** صفُّ حساب — **وطوابقُه** حين تتداخل منشوراتُه فلا يغطّي شريطٌ شريطًا. */
export interface GanttRow {
  readonly key: string
  readonly label: string
  readonly tiers: readonly (readonly GanttBar[])[]
  readonly count: number
}

export interface GanttGroup {
  /** `plans` أو مفتاحُ المنصّة. */
  readonly key: string
  readonly label: string
  readonly rows: readonly GanttRow[]
}

export interface GanttTick {
  readonly at: number
  readonly label: string
  /** أوّلُ الشهر أو أوّلُ النافذة: يُكتب الشهرُ معه. */
  readonly major: boolean
}

export interface GanttSummary {
  readonly total: number
  readonly published: number
  readonly upcoming: number
  readonly waiting: number
  readonly failed: number
}

export interface GanttChart {
  readonly from: Date
  readonly to: Date
  readonly days: number
  readonly ticks: readonly GanttTick[]
  /** موضعُ «الآن» — `null` حين تقع النافذةُ كلُّها في ماضٍ أو مستقبل. */
  readonly now: number | null
  readonly groups: readonly GanttGroup[]
  readonly summary: GanttSummary
}

/** المدى بالأيّام — **خياراتٌ معدودة** كمدى المحوريّ. */
export const SPANS = [14, 30, 90] as const
export type Span = (typeof SPANS)[number]

/** أبعدُ ما يُقلَّب إليه بالنوافذ — سنةٌ ونصفٌ بمدى ‏٩٠، **ولا رقمَ من الشبكة بلا حدّ**. */
export const SHIFT_LIMIT = 6

export function readSpan(raw: string | null | undefined): Span {
  const n = Number(raw)
  return (SPANS as readonly number[]).includes(n) ? (n as Span) : 30
}

export function readShift(raw: string | null | undefined): number {
  if (raw === null || raw === undefined || !/^-?\d{1,2}$/.test(raw)) return 0
  return Math.max(-SHIFT_LIMIT, Math.min(SHIFT_LIMIT, Number(raw)))
}

const DAY = 86_400_000

const MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
]

/**
 * منتصفُ ليل اليوم بمنطقة المالك، لحظةً بـ UTC — **وتُصحَّح مرّتين** كما في `monthStart`:
 * الإزاحةُ تتبدّل مع التوقيت الصيفيّ فلا تُثبَّت. و`null` يعني الرياض (D-201).
 */
export function localMidnight(at: Date, zone: string | null): Date {
  const p = localParts(at, zone)
  const wanted = Date.UTC(p.year, p.month - 1, p.day)
  let guess = wanted
  for (let i = 0; i < 2; i++) {
    const seen = localParts(new Date(guess), zone)
    guess += wanted - Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute)
  }
  return new Date(guess)
}

/**
 * النافذة: **ثلثُها ماضٍ وثلثاها قادم** — فالمنشورُ الذي يُكتب اليومَ ويخرج بعد أسبوعين
 * يُرى كلُّه، وما نُشر الأسبوعَ الماضي يُرى معه. و`shift` يقلّبها نوافذَ كاملة.
 */
export function windowOf(now: Date, zone: string | null, days: Span, shift: number): { from: Date; to: Date } {
  const today = localMidnight(now, zone).getTime()
  const from = localMidnight(new Date(today - Math.floor(days / 3) * DAY + shift * days * DAY + DAY / 2), zone)
  const to = localMidnight(new Date(from.getTime() + days * DAY + DAY / 2), zone)
  return { from, to }
}

/** الحالُ ونغمتُها — **وما لا يُعرَف محايدٌ لا أحمر**. */
export const STATUS_TONE: Readonly<Record<string, GanttTone>> = {
  draft: 'pending', approved: 'warn', edited: 'warn', queued: 'warn',
  published: 'ok', failed: 'bad', rejected: 'idle',
}

export const STATUS_LABEL: Readonly<Record<string, string>> = {
  draft: 'تنتظر قرارك', approved: 'معتمَدة بلا إرسال', edited: 'معتمَدة بعد تعديل',
  rejected: 'مرفوضة', queued: 'مجدولة', published: 'نُشرت', failed: 'فشل النشر',
}

const PLAN_TONE: Readonly<Record<string, GanttTone>> = { draft: 'pending', approved: 'ok', superseded: 'idle' }
export const PLAN_LABEL: Readonly<Record<string, string>> = {
  draft: 'خطّةٌ تنتظر قرارك', approved: 'خطّةٌ معتمَدة', superseded: 'خطّةٌ حلّت محلَّها أخرى',
}

/** ترتيبُ المجموعات: **المنصّاتُ بترتيب قاموسها**، وما سواها بعدها بحرفه. */
const PLATFORM_ORDER = Object.keys(PLATFORM_LABEL)

function ms(value: string | null): number | null {
  if (value === null || value === '') return null
  return parseSqliteUtc(value)?.getTime() ?? null
}

/** أوّلُ سطرٍ من النصّ، مقصوصًا — **ما يكفي ليُعرَف أيُّ منشورٍ هو**. */
function snippet(text: string): string {
  const line = text.split('\n').find((l) => l.trim() !== '')?.trim() ?? ''
  return line.length > 60 ? `${line.slice(0, 59)}…` : line
}

/**
 * يرصّ الأشرطةَ طوابق: **كلُّ شريطٍ في أوّل طابقٍ انتهى آخرُه قبله**.
 * والفجوةُ نصفُ نقطةٍ مئويّة، فلا يلتصق شريطان فيُقرآ واحدًا.
 *
 * ‏**والشريطُ يُرصّ بعرض إصبعٍ على الأقلّ** (D-217): على الهاتف يُرسم ‏44px (`MIN_SPAN` من
 * المسار ‏~500px)، فشريطٌ أقصرُ يُرصّ بعرضه المرسوم لا الزمنيّ، وإلّا غطّى جارَه في الطابق.
 */
export const MIN_SPAN = 9

function stack(bars: readonly GanttBar[]): GanttBar[][] {
  const tiers: GanttBar[][] = []
  const ends: number[] = []
  for (const bar of [...bars].sort((a, b) => a.start - b.start || a.end - b.end)) {
    const i = ends.findIndex((e) => e + 0.5 <= bar.start)
    const end = Math.max(bar.end, bar.mark ?? bar.end, bar.start + MIN_SPAN)
    if (i < 0) {
      tiers.push([bar])
      ends.push(end)
    } else {
      tiers[i]!.push(bar)
      ends[i] = end
    }
  }
  return tiers
}

export function gantt(
  input: { readonly posts: readonly GanttPost[]; readonly plans: readonly GanttPlan[] },
  win: { readonly from: Date; readonly to: Date },
  now: Date,
  zone: string | null,
): GanttChart {
  const a = win.from.getTime()
  const b = win.to.getTime()
  const width = Math.max(1, b - a)
  const nowMs = now.getTime()
  const pos = (t: number): number => Math.round(((Math.min(b, Math.max(a, t)) - a) / width) * 10_000) / 100
  const inside = (t: number | null): t is number => t !== null && t >= a && t <= b

  const summary = { total: 0, published: 0, upcoming: 0, waiting: 0, failed: 0 }
  const byAccount = new Map<string, { platform: string; label: string; bars: GanttBar[] }>()

  for (const p of input.posts) {
    const created = ms(p.createdAt)
    if (created === null) continue
    const approved = ms(p.approvedAt)
    const published = ms(p.publishedAt)
    const scheduled = ms(p.scheduledAt)
    // ‏اللحظةُ التي ينتهي إليها الشريط: النشرُ إن وقع، وإلّا الموعد
    const landing = published ?? scheduled
    const open = approved === null && p.status === 'draft'
    const endMs = Math.max(created, landing ?? (open ? nowMs : approved ?? created))
    if (endMs < a || created > b) continue

    summary.total++
    if (p.status === 'published') summary.published++
    else if (p.status === 'failed') summary.failed++
    else if (p.status === 'draft') summary.waiting++
    else if (landing !== null && landing >= nowMs && p.status !== 'rejected') summary.upcoming++

    const at = p.publishedAt ?? p.scheduledAt
    const bar: GanttBar = {
      id: p.id,
      href: `/panel/journey/${encodeURIComponent(p.id)}`,
      label: snippet(p.text) || '(بلا نصّ)',
      status: p.status,
      tone: STATUS_TONE[p.status] ?? 'idle',
      start: pos(created),
      end: pos(endMs),
      split: approved !== null && approved > created && approved < endMs && inside(approved) ? pos(approved) : null,
      mark: inside(landing) ? pos(landing) : null,
      clippedStart: created < a,
      clippedEnd: endMs > b,
      open,
      createdAt: p.createdAt,
      approvedAt: p.approvedAt,
      at,
    }
    const key = `${p.platform}\u0000${p.accountId}`
    const entry = byAccount.get(key) ?? {
      platform: p.platform,
      label: p.account !== '' ? p.account : p.accountId === '' ? 'لم يُربَط بحساب' : p.accountId,
      bars: [],
    }
    entry.bars.push(bar)
    byAccount.set(key, entry)
  }

  const groups: GanttGroup[] = []

  const planBars: GanttBar[] = []
  for (const plan of input.plans) {
    // ‏أوّلُ الأسبوع يومٌ لا لحظة: **منتصفُ ليله بمنطقة المالك**، لا منتصفُ ليل غرينتش
    const noon = ms(`${plan.weekStart.slice(0, 10)} 12:00:00`)
    if (noon === null) continue
    const start = localMidnight(new Date(noon), zone).getTime()
    const end = start + 7 * DAY
    if (end < a || start > b) continue
    planBars.push({
      id: plan.id,
      href: '/panel#sub-plan',
      label: `أسبوع ${dayRange(new Date(start), new Date(end - DAY), zone, now)}`,
      status: plan.status,
      tone: PLAN_TONE[plan.status] ?? 'idle',
      start: pos(start),
      end: pos(end),
      split: null,
      mark: null,
      clippedStart: start < a,
      clippedEnd: end > b,
      open: false,
      createdAt: plan.weekStart,
      approvedAt: null,
      at: null,
    })
  }
  if (planBars.length > 0) {
    groups.push({
      key: 'plans',
      label: 'الخطط الأسبوعيّة',
      rows: [{ key: 'plans', label: 'الخطّة', tiers: stack(planBars), count: planBars.length }],
    })
  }

  const platforms = [...new Set([...byAccount.values()].map((e) => e.platform))].sort((x, y) => {
    const i = PLATFORM_ORDER.indexOf(x)
    const j = PLATFORM_ORDER.indexOf(y)
    return (i < 0 ? 99 : i) - (j < 0 ? 99 : j) || x.localeCompare(y)
  })
  for (const platform of platforms) {
    const rows = [...byAccount.entries()]
      .filter(([, e]) => e.platform === platform)
      .map(([key, e]) => ({ key, label: e.label, tiers: stack(e.bars), count: e.bars.length }))
      .sort((x, y) => y.count - x.count || x.label.localeCompare(y.label))
    groups.push({ key: platform, label: platformLabel(platform), rows })
  }

  return {
    from: win.from,
    to: win.to,
    days: Math.round(width / DAY),
    ticks: ticksOf(win.from, win.to, zone),
    now: nowMs >= a && nowMs <= b ? pos(nowMs) : null,
    groups,
    summary,
  }
}

/**
 * علاماتُ المحور: **كلُّ يومٍ في مدى أسبوعين، وأوّلُ كلّ أسبوعٍ (الأحد) فيما فوقه** —
 * وأوّلُ الشهر وأوّلُ النافذة يحملان اسمَ الشهر. فمحورُ ‏٩٠ يومًا ثلاثَ عشرةَ علامةً
 * لا تسعين لا تُقرأ.
 */
function ticksOf(from: Date, to: Date, zone: string | null): GanttTick[] {
  const a = from.getTime()
  const width = Math.max(1, to.getTime() - a)
  const days = Math.round(width / DAY)
  const ticks: GanttTick[] = []
  let last = -Infinity
  for (let i = 0; i < days; i++) {
    const at = localMidnight(new Date(a + i * DAY + DAY / 2), zone)
    const p = localParts(at, zone)
    const major = i === 0 || p.day === 1
    if (days > 14 && p.weekday !== 0 && !major) continue
    // ‏وأوّلُ النافذة يحمل اسمَ شهره فيطول: **اليومُ الذي يليه يُترَك** لئلّا يُكتب فوقه
    if (days <= 14 && i === 1 && !major) continue
    // ‏وعلامتان أقربُ من ثلاثة أيّامٍ (خمسةٍ في مدى ‏٩٠) تتراكبان كتابةً: **الأولى تبقى** إلّا أن تكون الثانيةُ أوّلَ شهر
    if (days > 14 && i - last < (days > 30 ? 5 : 3)) {
      if (!major) continue
      if (ticks.length > 0 && !ticks[ticks.length - 1]!.major) ticks.pop()
      else continue
    }
    last = i
    ticks.push({
      at: Math.round(((at.getTime() - a) / width) * 10_000) / 100,
      label: major ? `${p.day} ${MONTHS[p.month - 1]}` : String(p.day),
      major,
    })
  }
  return ticks
}

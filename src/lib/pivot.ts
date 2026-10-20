/**
 * اللوحُ المحوريّ — **البطاقةُ تُفرِد، والجدولُ يُقارن** (D-120).
 *
 * ## لماذا هنا صدَق الجدولُ ولم يصدُق في `E-4`
 *
 * أُغلق `E-4` في D-118 لأنّه لم توجد في اللوحة شبكةُ بطاقاتٍ متجانسةِ
 * التشريح: **بطاقةُ القناة تختلف بحالها قصدا، وذلك عملُها**.
 *
 * **وهذه غيرُها.** منشورٌ ومنشورٌ متطابقان في الحقول تماما: منصّةٌ وحالٌ
 * ويومٌ وكلفةٌ ومحاولات. **فمئةُ منشورٍ في مئة بطاقةٍ لا تُقارَن**، وفي
 * جدولٍ محوريٍّ تُقارَن بنظرة.
 *
 * ## والمحرّكُ نقيٌّ لا يعرف قاعدةً ولا HTML
 *
 * يأخذ صفوفا ومواصفةً ويردّ جدولا. **فيُختبَر بالحساب لا بالتشغيل**،
 * ولا يحتاج متصفّحا ولا قاعدةً ليُثبَت.
 *
 * ## ولا يُخترَع رقمٌ لا أصلَ له
 *
 * كلُّ قياسٍ هنا **مشتقٌّ من عمودٍ موجود**. ونسبةُ النجاح تُحسَب من
 * `publish_attempts.status = 'succeeded'` — **وهي العلّةُ التي وقعت في
 * `journey.ts`** حين قُورن بـ`'success'` وليست في المخطَّط، فظهر كلُّ نشرٍ
 * ناجحٍ فاشلا.
 */

/** صفُّ الحقيقة — **منشورٌ واحد**، بكلّ ما يُقاس عليه. */
import { PLATFORM_LABEL } from './oauth/providers'

export interface Fact {
  readonly platform: string
  readonly account: string
  readonly status: string
  /** يومُ الجدولة بصيغة `YYYY-MM-DD` — **وفارغٌ يُعَدّ «بلا موعد»**. */
  readonly day: string
  readonly type: string
  readonly attempts: number
  readonly succeeded: boolean
  readonly cost: number
}

export const DIMENSIONS = ['platform', 'account', 'status', 'type', 'day', 'week', 'month'] as const
export type Dimension = (typeof DIMENSIONS)[number]

export const MEASURES = ['count', 'success_rate', 'cost', 'attempts'] as const
export type Measure = (typeof MEASURES)[number]

export const DIMENSION_LABEL: Readonly<Record<Dimension, string>> = {
  platform: 'المنصّة',
  account: 'الحساب',
  status: 'الحال',
  type: 'النوع',
  day: 'اليوم',
  week: 'الأسبوع',
  month: 'الشهر',
}

export const MEASURE_LABEL: Readonly<Record<Measure, string>> = {
  count: 'العدد',
  success_rate: 'نسبة النجاح',
  cost: 'الكلفة',
  attempts: 'متوسّط المحاولات',
}

/** بلا موعد — **ويُسمّى ولا يُحذَف**: منشورٌ بلا جدولةٍ حقيقةٌ تُقاس. */
export const NO_KEY = '—'

/**
 * اسمُ المفتاح كما يُقرأ — **والمفتاحُ نفسُه لا يُعرَض** (D-123).
 *
 * الجدولُ يُجمَع على قيَم القاعدة: `published` و`queued` و`linkedin`.
 * **وقيمةُ قاعدةٍ في ترويسةِ جدولٍ عربيٍّ تُقرأ عطلا لا حالا** — وهي
 * علّةُ `TASK_LABEL` في المزوّدين (D-091) بعينها، وقعت هنا في ثلاثة
 * أبعاد.
 *
 * **ولم تُرَ في عيّنة الرسم لأنّ البذرةَ كذبت**: كُتب فيها
 * `platform: 'LinkedIn'` والقاعدةُ تحمل `linkedin` — فرُسم الجدولُ
 * بأسماءٍ لن يراها المالك قطّ. وبذرةٌ لا تحترم قيودَ المخطّط تستر
 * العيبَ الذي وُضعت لتكشفه (D-120).
 *
 * **والقاموسُ ناقصٌ عمدا**: ما ليس فيه يُعرَض بحرفه لا بـ«غير معروف» —
 * قاعدةُ سجلّ التدقيق نفسُها. والأبعادُ الزمنيّةُ والحسابُ تُقرأ كما هي.
 */
const KEY_LABEL: Readonly<Partial<Record<Dimension, Readonly<Record<string, string>>>>> = {
  platform: PLATFORM_LABEL,
  status: {
    draft: 'تنتظر قرارك', approved: 'معتمَدة', edited: 'معتمَدة بعد تعديل',
    rejected: 'مرفوضة', queued: 'مجدولة', published: 'نُشرت', failed: 'فشل النشر',
  },
  type: { text: 'نصّ', image: 'صورة', document: 'مستند', thread: 'سلسلة' },
}

export function keyLabel(dim: Dimension, key: string): string {
  return KEY_LABEL[dim]?.[key] ?? key
}

/**
 * أسبوعُ ISO — **الاثنينُ أوّلُه**.
 *
 * ولا تُستعمَل `Date` للحساب: **نصٌّ ثابتُ الطول يُقارَن نصّا**، والمناطقُ
 * الزمنيّةُ لا تدخل. والقاعدةُ تُخزّن UTC، فاليومُ هو اليوم.
 */
function isoWeek(day: string): string {
  const ms = Date.parse(`${day}T00:00:00Z`)
  if (Number.isNaN(ms)) return NO_KEY
  const d = new Date(ms)
  // الخميسُ يقرّر السنة (قاعدةُ ISO): يُزاح إلى خميس أسبوعه
  const dow = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - dow + 3)
  const year = d.getUTCFullYear()
  const jan4 = Date.UTC(year, 0, 4)
  const week = 1 + Math.round((d.getTime() - jan4) / 604_800_000)
  return `${year}-أ${String(week).padStart(2, '0')}`
}

function keyOf(f: Fact, dim: Dimension): string {
  switch (dim) {
    case 'platform': return f.platform || NO_KEY
    case 'account': return f.account || NO_KEY
    case 'status': return f.status || NO_KEY
    case 'type': return f.type || NO_KEY
    case 'day': return f.day === '' ? NO_KEY : f.day
    case 'week': return f.day === '' ? NO_KEY : isoWeek(f.day)
    case 'month': return f.day === '' ? NO_KEY : f.day.slice(0, 7)
  }
}

/** ما تجمعه الخليّةُ قبل أن يُحسَب قياسُها. */
interface Bucket {
  n: number
  ok: number
  cost: number
  attempts: number
}

const empty = (): Bucket => ({ n: 0, ok: 0, cost: 0, attempts: 0 })

/**
 * القياسُ يُحسَب من الدلو — **ولا يُجمَع متوسّطٌ على متوسّط**.
 *
 * نسبةُ النجاح تُحسَب من المجموع الخام في كلّ مستوى: خليّةٌ ومجموعُ صفٍّ
 * ومجموعٌ كلّيّ. **ولو جُمعت نسبُ الخلايا وقُسمت على عددها لأعطت رقما
 * آخر** — ومنشورٌ واحدٌ في خليّةٍ يزن كمئةٍ في أخرى.
 */
function valueOf(b: Bucket, m: Measure): number | null {
  if (b.n === 0) return null
  switch (m) {
    case 'count': return b.n
    case 'success_rate': return (b.ok / b.n) * 100
    case 'cost': return b.cost
    case 'attempts': return b.attempts / b.n
  }
}

export interface PivotSpec {
  readonly rows: Dimension
  /** `null` يعني عمودا واحدا — جدولٌ بمحورٍ واحد. */
  readonly cols: Dimension | null
  readonly measure: Measure
}

export interface PivotTable {
  readonly rowKeys: readonly string[]
  readonly colKeys: readonly string[]
  /** `cells[صفّ][عمود]` — و`null` يعني **لا صفوفَ هنا** لا صفرا. */
  readonly cells: readonly (readonly (number | null)[])[]
  readonly rowTotals: readonly (number | null)[]
  readonly colTotals: readonly (number | null)[]
  readonly grand: number | null
  readonly measure: Measure
  /** كم صفَّ حقيقةٍ دخل الجدول — **ليُعرَف أفارغٌ هو أم مُرشَّح**. */
  readonly facts: number
}

/**
 * **والمفتاحُ يُرتَّب بمعناه لا بحروفه.**
 *
 * الأيّامُ والأسابيعُ والشهورُ تصعد زمنا، **وما سواها ينزل بالحجم**:
 * الأكبرُ أوّلا، لأنّ عينا تمسح عمودا تبدأ من أعلاه.
 */
function sortKeys(
  keys: readonly string[], dim: Dimension, weight: ReadonlyMap<string, number>,
): string[] {
  const timeLike = dim === 'day' || dim === 'week' || dim === 'month'
  return [...keys].sort((a, b) => {
    // و«بلا موعد» تُذيَّل دائما: حقيقةٌ تُقال، ولا تتصدّر
    if (a === NO_KEY) return 1
    if (b === NO_KEY) return -1
    if (timeLike) return a < b ? -1 : a > b ? 1 : 0
    const d = (weight.get(b) ?? 0) - (weight.get(a) ?? 0)
    return d !== 0 ? d : a < b ? -1 : 1
  })
}

/** يبني الجدول — **دالّةٌ نقيّةٌ لا تمسّ شيئا**. */
export function pivot(facts: readonly Fact[], spec: PivotSpec): PivotTable {
  const grid = new Map<string, Map<string, Bucket>>()
  const rowAll = new Map<string, Bucket>()
  const colAll = new Map<string, Bucket>()
  const total = empty()

  const add = (b: Bucket, f: Fact): void => {
    b.n += 1
    if (f.succeeded) b.ok += 1
    b.cost += f.cost
    b.attempts += f.attempts
  }

  for (const f of facts) {
    const r = keyOf(f, spec.rows)
    const c = spec.cols === null ? '' : keyOf(f, spec.cols)
    let row = grid.get(r)
    if (row === undefined) { row = new Map(); grid.set(r, row) }
    let cell = row.get(c)
    if (cell === undefined) { cell = empty(); row.set(c, cell) }
    add(cell, f)

    let rt = rowAll.get(r)
    if (rt === undefined) { rt = empty(); rowAll.set(r, rt) }
    add(rt, f)

    let ct = colAll.get(c)
    if (ct === undefined) { ct = empty(); colAll.set(c, ct) }
    add(ct, f)

    add(total, f)
  }

  const rowWeight = new Map([...rowAll].map(([k, b]) => [k, b.n]))
  const colWeight = new Map([...colAll].map(([k, b]) => [k, b.n]))
  const rowKeys = sortKeys([...rowAll.keys()], spec.rows, rowWeight)
  const colKeys = spec.cols === null
    ? ['']
    : sortKeys([...colAll.keys()], spec.cols, colWeight)

  return {
    rowKeys,
    colKeys,
    cells: rowKeys.map((r) =>
      colKeys.map((c) => {
        const b = grid.get(r)?.get(c)
        return b === undefined ? null : valueOf(b, spec.measure)
      })),
    rowTotals: rowKeys.map((r) => valueOf(rowAll.get(r) ?? empty(), spec.measure)),
    colTotals: colKeys.map((c) => valueOf(colAll.get(c) ?? empty(), spec.measure)),
    grand: valueOf(total, spec.measure),
    measure: spec.measure,
    facts: facts.length,
  }
}

/** يقرأ بُعدا من نصٍّ خارجيّ — **وما لا يُعرَف يعود إلى افتراضه**. */
export function readDimension(raw: string | undefined, fallback: Dimension): Dimension {
  return DIMENSIONS.includes(raw as Dimension) ? (raw as Dimension) : fallback
}

/** و`cols` وحدَها تقبل «لا شيء» — فمحورٌ واحدٌ جدولٌ صحيح. */
export function readCols(raw: string | undefined): Dimension | null {
  if (raw === 'none' || raw === '') return null
  return DIMENSIONS.includes(raw as Dimension) ? (raw as Dimension) : null
}

export function readMeasure(raw: string | undefined, fallback: Measure): Measure {
  return MEASURES.includes(raw as Measure) ? (raw as Measure) : fallback
}

/**
 * الخليّةُ نصّا — **والوحدةُ في الخليّة لا في الترويسة**.
 *
 * `null` تُكتب فراغا لا صفرا: **صفرٌ يقول «قِيس فكان صفرا»، والفراغُ
 * يقول «لا شيءَ هنا»** — وخلطُهما يجعل جدولا فارغا يُقرأ فشلا تامّا.
 */
export function cellText(v: number | null, m: Measure): string {
  if (v === null) return ''
  switch (m) {
    case 'count': return String(v)
    case 'success_rate': return `${Math.round(v)}٪`
    case 'cost': return v === 0 ? '0$' : `${v.toFixed(2)}$`
    case 'attempts': return v.toFixed(1)
  }
}

/**
 * الجدولُ ملفًّا — **ما يُعرَض يُنزَّل، خليّةً خليّة** (D-126).
 *
 * لا مكتبةَ ولا `JavaScript`: الخادمُ يكتب `CSV` من الجدول نفسِه الذي
 * رسمه، بالأسماء التي رسمها (`keyLabel`) وبالنصّ الذي كتبه في الخليّة
 * (`cellText`). **فما في الملفّ هو ما في الشاشة حرفًا** — والاختبارُ
 * يقابلهما خليّةً خليّة.
 *
 * ## وثلاثةٌ من RFC 4180 وواحدةٌ من الأمن
 *
 * - الفاصلُ `,` والسطرُ `\r\n`، والخليّةُ تُحاط بعلامتَي تنصيصٍ إن حملت
 *   فاصلًا أو تنصيصًا أو سطرًا، والتنصيصُ الداخليُّ يُضاعَف.
 * - وعلامةُ `BOM` في أوّل الملفّ: **بدونها يفتح Excel العربيّةَ رموزًا**.
 * - وخليّةٌ تبدأ بـ`=` أو `+` أو `-` أو `@` **تُسبَق بفاصلةٍ عليا**: جدولُ
 *   البيانات ينفّذها صيغةً، ومفتاحُ حسابٍ يكتبه غيرُنا قد يبدأ بها.
 */
export function toCsv(table: PivotTable, spec: PivotSpec): string {
  const twoAxis = spec.cols !== null
  const cell = (raw: string): string => {
    const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
  }
  const line = (cells: readonly string[]): string => cells.map(cell).join(',')

  const head = [
    DIMENSION_LABEL[spec.rows],
    ...table.colKeys.map((c) =>
      c === '' || spec.cols === null ? MEASURE_LABEL[spec.measure] : keyLabel(spec.cols, c)),
    ...(twoAxis ? ['الكلّ'] : []),
  ]
  const rows = table.rowKeys.map((r, i) => [
    keyLabel(spec.rows, r),
    ...(table.cells[i] ?? []).map((v) => cellText(v, spec.measure)),
    ...(twoAxis ? [cellText(table.rowTotals[i] ?? null, spec.measure)] : []),
  ])
  const foot = twoAxis
    ? [['الكلّ', ...table.colTotals.map((v) => cellText(v, spec.measure)), cellText(table.grand, spec.measure)]]
    : []

  return '\uFEFF' + [head, ...rows, ...foot].map(line).join('\r\n') + '\r\n'
}


/**
 * **شريطُ الفلتر الواحد** (UX-AUDIT-4 · المرحلة أ) — سطرٌ واحدٌ كما في Sprout وMetricool وLinear، بدل صفوف التبويبات والقوائم الأصليّة.
 *
 * ثلاثُ قطعٍ لا غير، وكلٌّ بحجم ما يختار:
 * - **`seg`** لخياراتٍ قليلة (2–4): مقطّعٌ متّصلٌ، والمختارُ أرضٌ بيضاء.
 * - **`pick`** لقائمةٍ أطول: زرٌّ يقول «العنوان: المختار ▾» ويفتح قائمةً (`<details>` أصليّ، يعمل بلا سكربت).
 * - **`logos`** للمنصّات: شعاراتٌ مدوّرة، والمختارُ ممتلئ، و«الكلّ» أوّلها.
 *
 * وكلُّ خيارٍ **رابطٌ** (`href`، فالفلترُ في العنوان ويُشارَك) **أو زرٌّ بقيمة** (`value`، يفرزه سكربتُ الصفحة بلا تحميل).
 * والشريطُ يلتفّ على الهاتف ولا يتمرّر أفقيًّا.
 */
import { escapeHtml } from '../escape'
import { ICON } from '../icons'
import { count } from './badge'

export interface FilterOption {
  readonly label: string
  readonly current: boolean
  readonly href?: string
  readonly value?: string
  /** شعارُ المنصّة (`LOGOS`) — لقطعة `logos`. */
  readonly logo?: string
  /** عددُ ما في الخيار — يُعرض ولو صفرًا (D-062)، بـ`count` من الشارات. */
  readonly count?: number
  /** سماتُ `data-*` إضافيّة يقرؤها سكربتُ الصفحة (كـ`of` في فرز الحال). */
  readonly data?: Readonly<Record<string, string>>
}

export type FilterPart =
  | { readonly kind: 'seg'; readonly label: string; readonly name?: string; readonly options: readonly FilterOption[] }
  | { readonly kind: 'pick'; readonly label: string; readonly name?: string; readonly options: readonly FilterOption[] }
  | { readonly kind: 'logos'; readonly label: string; readonly name?: string; readonly options: readonly FilterOption[] }

function option(o: FilterOption, name: string | undefined, cls: string, inner: string, title = o.label): string {
  const pressed = `aria-pressed="${o.current}"`
  const n = o.count === undefined ? '' : count(o.count)
  const data = Object.entries(o.data ?? {}).map(([k, v]) => ` data-${k}="${escapeHtml(v)}"`).join('')
  return o.href !== undefined
    ? `<a class="${cls}" href="${escapeHtml(o.href)}" ${o.current ? 'aria-current="true"' : ''} ${pressed} title="${escapeHtml(title)}">${inner}${n}</a>`
    : `<button class="${cls}" type="button" ${pressed} data-filter="${escapeHtml(name ?? '')}" value="${escapeHtml(o.value ?? '')}"${data} title="${escapeHtml(title)}">${inner}${n}</button>`
}

function part(p: FilterPart): string {
  if (p.kind === 'seg') {
    return `<div class="fb-seg" role="group" aria-label="${escapeHtml(p.label)}">${p.options.map((o) =>
      option(o, p.name, 'fb-opt', escapeHtml(o.label))).join('')}</div>`
  }
  if (p.kind === 'logos') {
    return `<div class="fb-logos" role="group" aria-label="${escapeHtml(p.label)}">${p.options.map((o) =>
      option(o, p.name, o.logo === undefined ? 'fb-opt' : 'fb-logo', o.logo ?? escapeHtml(o.label))).join('')}</div>`
  }
  const now = p.options.find((o) => o.current)?.label ?? p.options[0]?.label ?? ''
  return `<details class="menu">
    <summary class="fb-btn"><span class="fb-k">${escapeHtml(p.label)}</span><b>${escapeHtml(now)}</b><span class="menu-caret" aria-hidden="true">${ICON.chevron}</span></summary>
    <div class="menu-list">${p.options.map((o) => option(o, p.name, 'menu-item', `<span class="menu-t"><b>${escapeHtml(o.label)}</b></span>`)).join('')}</div>
  </details>`
}

/** و`tail` ما يُلحَق آخرَ الشريط في صفّه (كـ«؟» في المسوّدات) — HTML جاهزٌ لا نصّ. */
export function filterBar(parts: readonly FilterPart[], label = 'الفلتر', tail = ''): string {
  return `<div class="fbar" role="toolbar" aria-label="${escapeHtml(label)}">${parts.map(part).join('')}${tail}</div>`
}

/**
 * **رقمٌ ومعه اتّجاهُه** — كما في Stripe وSprout: الرقمُ كبيرًا، وتحته الفرقُ عن الفترة السابقة بعلامته ونصّه (فالسهمُ وحده لا يُقرأ
 * بصوت)، ثمّ سطرٌ قصير. و`null` في الفرق: لا مقارنةَ (الفترةُ السابقةُ صفر)، فلا يُخترَع «‎+∞».
 */
export function statTile(input: { readonly label: string; readonly value: string; readonly delta?: number | null; readonly note?: string; readonly good?: 'up' | 'down' }): string {
  const d = input.delta
  const dir = d === undefined || d === null || d === 0 ? 'flat' : d > 0 ? 'up' : 'down'
  const tone = dir === 'flat' ? 'flat' : (input.good ?? 'up') === dir ? 'good' : 'bad'
  const delta = d === undefined ? '' : d === null
    ? '<span class="kpi-d" data-tone="flat">لا مقارنة</span>'
    : `<span class="kpi-d" data-tone="${tone}">${dir === 'up' ? '↑' : dir === 'down' ? '↓' : '='} ${d === 0 ? 'كالسابقة' : `${Math.abs(d)}٪`}</span>`
  return `<div class="card kpi"><div class="kpi-k">${escapeHtml(input.label)}</div>
    <div class="kpi-v num">${input.value}</div>${delta}${input.note === undefined ? '' : `<div class="kpi-n">${escapeHtml(input.note)}</div>`}</div>`
}

/** الفرقُ بالمئة بين فترتين — و`null` حين لا سابقةَ يُقاس عليها. */
export function pctChange(now: number, before: number): number | null {
  if (before === 0) return now === 0 ? 0 : null
  return Math.round(((now - before) / before) * 100)
}

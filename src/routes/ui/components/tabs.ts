/**
 * التبويبُ والمقطع — **لغتان للتحديد لا أربع** (خطّة التصميم 7.4 · D-189).
 *
 * كان المحدَّدُ يُقال بأربع لغات: أرضٌ وحدٌّ نحاسيّ في الرافدة، وحدُّ الهويّة وأرضٌ في
 * تبويب الفرز (فيشبه الزرّ)، وظلٌّ على أرضٍ في مبدّل الثيم، وحدٌّ في بطاقة الاختيار.
 * فصارتا اثنتين:
 *
 *   التنقّل   (`tabs`)       حبرُ «--ink» بوزن ‏٦٠٠ وخطٌّ ‏٢px تحته — أين أنت
 *   الاختيار  (`segmented`)  مسارٌ «--surface-2» والمختارُ «--surface» بظلّ «--sh-1» — ماذا اخترت
 *
 * والتنقّلُ روابطُ بـ`aria-current="page"` (الحالُ في العنوان، تُفتَح في تبويبٍ وتُحفظ)،
 * أو `role="tablist"` لتبويباتٍ داخل الصفحة. والاختيارُ أزرارٌ بـ`aria-pressed`.
 */
import { escapeHtml } from '../escape'
import { count } from './badge'

export interface TabItem {
  readonly label: string
  /** رابطُ التبويب. وبلا رابطٍ يصير زرًّا في `role="tablist"`. */
  readonly href?: string
  /** معرّفُ اللوح الذي يتحكّم به (`aria-controls`) — للتبويب داخل الصفحة. */
  readonly controls?: string
  readonly current?: boolean
  readonly count?: number | '!'
  /** العددُ يعني شيئًا فشل — فيحمل نغمتَه ولو لم يُفتَح التبويب. */
  readonly bad?: boolean
  /** سِماتٌ أخرى جاهزة (`data-bucket="…"`). */
  readonly attrs?: string
}

/**
 * شريطُ التبويبات — روابطُ (`nav`) أو تبويباتٌ داخل الصفحة (`role="tablist"`).
 * و`sub` فرزٌ داخل التبويب (صفٌّ ثانٍ يلتفّ) لا تبويبٌ ثانٍ.
 */
export function tabs(label: string, items: readonly TabItem[], opts: { readonly id?: string; readonly sub?: boolean } = {}): string {
  const id = opts.id
  const cls = opts.sub === true ? 'tab-bar tab-sub' : 'tab-bar'
  const inPage = items.every((t) => t.href === undefined)
  const rows = items.map((t) => {
    const n = t.count === undefined ? '' : count(t.count, t.bad === true ? { tone: 'bad' } : {})
    const extra = t.attrs === undefined || t.attrs === '' ? '' : ` ${t.attrs}`
    if (!inPage && t.href !== undefined) {
      return `<a class="tab-item" href="${escapeHtml(t.href)}"${t.current === true ? ' aria-current="page"' : ''}${extra}>` +
        `<span>${escapeHtml(t.label)}</span>${n}</a>`
    }
    return `<button type="button" class="tab-item" role="tab" aria-selected="${t.current === true}"${
      t.controls === undefined ? '' : ` aria-controls="${escapeHtml(t.controls)}"`}${
      t.current === true ? '' : ' tabindex="-1"'}${extra}><span>${escapeHtml(t.label)}</span>${n}</button>`
  }).join('')
  const idAttr = id === undefined ? '' : ` id="${escapeHtml(id)}"`
  return inPage
    ? `<div class="${cls}" role="tablist" aria-label="${escapeHtml(label)}"${idAttr}>${rows}</div>`
    : `<nav class="${cls}" aria-label="${escapeHtml(label)}"${idAttr}>${rows}</nav>`
}

export interface SegmentOption {
  readonly value: string
  readonly label: string
  readonly pressed?: boolean
}

/**
 * المقطع — **اختيارٌ واحدٌ من قليل**: المظهر، والكثافة، وقائمةٌ أو تقويم.
 *
 * `name` يصير سِمةَ البيانات على كلّ زرّ (`data-theme="dark"`)، فالسكربتُ القائمُ يقرؤها
 * كما كان، **ولا يُكتب المبدّلُ مرّتين**.
 */
export function segmented(label: string, name: string, options: readonly SegmentOption[], id?: string): string {
  const buttons = options.map((o) =>
    `<button type="button" data-${escapeHtml(name)}="${escapeHtml(o.value)}" aria-pressed="${o.pressed === true}">${
      escapeHtml(o.label)}</button>`).join('\n    ')
  return `<div class="seg"${id === undefined ? '' : ` id="${escapeHtml(id)}"`} role="group" aria-label="${escapeHtml(label)}">
    ${buttons}
  </div>`
}

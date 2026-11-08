/**
 * البطاقة — **أربعُ صيغٍ لا عشرون** (خطّة التصميم 7.3 · D-189).
 *
 *   card              السطحُ وحدُّ «--line» وظلُّ «--sh-1» ونصفُ قطر ‏١٢ وحشوُ «--pad-card»
 *   card-interactive  مثلُها والبطاقةُ كلُّها رابط: التمريرُ حدُّ «--field» و«--sh-2» (لا قفزة)
 *   card-inset        «--surface-2» بلا ظلٍّ ولا حدّ — ما في داخل بطاقةٍ أخرى
 *   card-alert        «card» بحافّةٍ داخليّة ‏٤px بلون الحال — **الحافّةُ الملوّنةُ الوحيدة**
 *
 * ورأسُها واحد: عنوانٌ بنمط «h3» (‏١٨)، ووصفٌ اختياريٌّ بجملةٍ واحدة بحبر «--ink-2»، وفعلٌ
 * في الطرف. **والحالةُ الفارغة ليست صيغةَ بطاقة**: لها مكوّنُها (`emptyState`).
 */
import { escapeHtml } from '../escape'

export type CardVariant = 'card' | 'interactive' | 'inset' | 'alert'

export interface CardInput {
  readonly variant?: CardVariant
  /** نغمةُ الحافّة في «card-alert» وحدَها. */
  readonly tone?: 'ok' | 'warn' | 'bad'
  /** عنوانُ البطاقة (يُهرَّب). وبلا عنوانٍ لا رأس. */
  readonly title?: string
  /** مستوى العنوان في مخطّط الصفحة — والمظهرُ «h3» في كلّ مستوى. */
  readonly level?: 2 | 3
  /** معرّفُ العنوان، لمن يسمّي به منطقةً أو شريطًا (`aria-labelledby`). */
  readonly titleId?: string
  /** جملةٌ واحدةٌ تحت العنوان (وسمٌ جاهز). */
  readonly desc?: string
  /** فعلٌ في طرف الرأس (وسمٌ جاهز: زرٌّ أو رابط). */
  readonly action?: string
  /** جسدُ البطاقة (وسمٌ جاهز). */
  readonly body: string
  /** لـ«card-interactive»: البطاقةُ كلُّها رابطٌ إلى هنا. */
  readonly href?: string
  readonly id?: string
  /** سِماتٌ أخرى جاهزة. */
  readonly attrs?: string
}

/** صنفُ البطاقة بصيغتها — **لمن يكتب الوسمَ بيده** حيث بنيةُ القسم لم تُنقَل بعد (٢ج). */
export function cardClass(variant: CardVariant = 'card'): string {
  return variant === 'card' ? 'card' : `card card-${variant}`
}

export function card(input: CardInput): string {
  const variant = input.variant ?? 'card'
  const level = input.level ?? 2
  // ‏مهرَّبٌ بيده بلا قالبٍ جديد (سقّاطة html، D-281)
  const hid = input.titleId === undefined ? '' : ' id="' + escapeHtml(input.titleId) + '"'
  const head = input.title === undefined
    ? ''
    : `<div class="card-head"><h${level}${hid}>${escapeHtml(input.title)}</h${level}>${
        input.action === undefined ? '' : `<span class="grow"></span>${input.action}`}</div>${
        input.desc === undefined ? '' : `<p class="card-desc">${input.desc}</p>`}`
  const attrs = [
    `class="${cardClass(variant)}"`,
    input.id === undefined ? '' : `id="${escapeHtml(input.id)}"`,
    variant === 'alert' ? `data-tone="${input.tone ?? 'ok'}"` : '',
    input.attrs ?? '',
  ].filter((a) => a !== '').join(' ')
  // ‏البطاقةُ الرابط: رابطٌ واحدٌ يحمل الكلَّ، فلا يُزرَع فيه رابطٌ ولا زرٌّ ثانٍ
  if (variant === 'interactive' && input.href !== undefined) {
    return `<a ${attrs} href="${escapeHtml(input.href)}">${head}${input.body}</a>`
  }
  return `<div ${attrs}>${head}${input.body}</div>`
}

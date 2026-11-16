/**
 * الزرّ — **أربعُ درجاتٍ ومقاسان، وصنفٌ واحدٌ بادئتُه «btn»** (خطّة التصميم 7.1 · D-189).
 *
 * كانت الدرجاتُ أصنافًا من حرفٍ واحد: «.p» الأوّليّ و«.g» الثانويّ و«.d» الخطِر و«.sm»
 * الصغير. **وحرفٌ واحدٌ يصطدم**: «.g» كان صنفَ رمز الحال أيضًا، فلبس الرمزُ أرضَ الزرّ
 * البيضاءَ داخل ستٍّ وتسعين حبّة (D-183). فصار للعائلة اسمٌ يُقرأ:
 *
 *   btn-primary    أرضُ «--brand» — فعلٌ واحدٌ في كلّ منطقة
 *   btn-secondary  أرضُ السطح وحدُّ «--field» (‏3:1) — البدائل
 *   btn-quiet      بلا أرضٍ ولا حدّ، حبرُ الرابط وخطٌّ تحته دائمًا — «اعرض الكلّ»
 *   btn-danger     ثانويٌّ بحبر «--bad» — «احذف» و«ارفض»
 *   danger-solid   الخطِرُ مصمتًا («btn-danger btn-danger-solid») — زرُّ التأكيد في حوار ما لا رجعةَ فيه وحدَه (v1 §5.1)
 *   btn-ghost      بلا أرضٍ ولا حدّ، حبرُ المتن و«--surface-2» عند التمرير — فعلٌ داخل البطاقة والجدول (v1 §5.1)
 *   btn-icon       مربّعُ ‏٤٤ بلا نصٍّ ظاهر، واسمُه في «aria-label» — الإغلاق والقائمة
 *   btn-sm         حشوٌ أضيق بقامة الهدف نفسِها (‏٤٤ على كلّ عرض)
 *   btn-lg         قامةُ ‏٤٨ وحشوٌ أوسع — للفعل الواحد في شاشةٍ فارغة (مواصفات v1 §5.1)
 *
 * **والحالان من السِّمات لا من الأصناف**: المشغولُ `aria-busy="true"` بدوّارة ‏١٦px والعرضُ
 * ثابت، والمعطّلُ `aria-disabled="true"` بسببٍ مكتوبٍ تحته مربوطٍ بـ`aria-describedby` —
 * يبقى في ترتيب التركيز فيُقرأ سببُه، ويمنع السكربتُ (`KIT_SCRIPT`) والخادمُ الفعلَ معًا.
 */
import { escapeHtml } from '../escape'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'quiet' | 'danger' | 'danger-solid' | 'icon'
export type ButtonSize = 'md' | 'sm' | 'lg'

/** صنفُ الزرّ بدرجته ومقاسه — **لمن يكتب الوسمَ بيده** في صفٍّ لا يسعه الكائن. */
export function btnClass(variant: ButtonVariant, size: ButtonSize = 'md'): string {
  // ‏والمصمتُ يحمل صنفَ الخطِر معه: السكربتُ يعرف الخطِرَ بـ«btn-danger» (`scripts.ts`) فيسأل قبل الفعل
  const v = variant === 'danger-solid' ? 'danger btn-danger-solid' : variant
  return `btn btn-${v}${size === 'md' ? '' : ' btn-' + size}`
}

export interface ButtonInput {
  /** النصّ الظاهر (يُهرَّب). ولزرّ الأيقونة: اسمُه لقارئ الشاشة. */
  readonly label: string
  readonly variant?: ButtonVariant
  readonly size?: ButtonSize
  /** رابطٌ بهيئة زرّ (`<a>`) — وبلا `href` زرٌّ (`<button>`). */
  readonly href?: string
  readonly type?: 'submit' | 'button'
  /** أيقونةٌ من `ICON` تسبق النصّ — ‏٢٠px في الزرّ. */
  readonly icon?: string
  readonly name?: string
  readonly value?: string
  readonly id?: string
  /** مشغولٌ يُرسَم من الخادم: النصُّ يقول الحالَ («جارٍ الحفظ…»)، والعرضُ لا يقفز. */
  readonly busy?: string
  /** معطّلٌ بسببه — **ولا تعطيلَ بلا سبب**: زرٌّ رماديٌّ لا يقول لماذا يُضغَط مرّاتٍ ثمّ يُترَك. */
  readonly disabled?: { readonly id: string; readonly reason: string }
  /** سِماتٌ أخرى جاهزة (`data-copy="…"`، `aria-controls="…"`). */
  readonly attrs?: string
}

/** الزرّ — يُرسَم `<button>` أو `<a>`، ومعه سببُ تعطيله إن عُطّل. */
export function button(input: ButtonInput): string {
  const variant = input.variant ?? 'secondary'
  const cls = btnClass(variant, input.size)
  const parts = [`class="${cls}"`]
  if (input.href === undefined) parts.push(`type="${input.type ?? 'button'}"`)
  else parts.push(`href="${escapeHtml(input.href)}"`)
  if (input.id !== undefined) parts.push(`id="${escapeHtml(input.id)}"`)
  if (input.name !== undefined) parts.push(`name="${escapeHtml(input.name)}"`)
  if (input.value !== undefined) parts.push(`value="${escapeHtml(input.value)}"`)
  // ‏زرُّ الأيقونة بلا نصٍّ ظاهر: اسمُه وتلميحُه من النصّ نفسِه (خطّة التصميم 3.4)
  if (variant === 'icon') parts.push(`aria-label="${escapeHtml(input.label)}"`)
  if (input.busy !== undefined) parts.push('aria-busy="true" aria-disabled="true"')
  else if (input.disabled !== undefined) {
    parts.push(`aria-disabled="true" aria-describedby="${escapeHtml(input.disabled.id)}"`)
  }
  if (input.attrs !== undefined && input.attrs !== '') parts.push(input.attrs)

  const text = variant === 'icon' ? '' : `<span>${escapeHtml(input.busy ?? input.label)}</span>`
  const inner = `${input.icon ?? ''}${text}`
  const tag = input.href === undefined ? 'button' : 'a'
  const el = `<${tag} ${parts.join(' ')}>${inner}</${tag}>`
  return input.disabled === undefined || input.busy !== undefined
    ? el
    : `${el}<small class="btn-why" id="${escapeHtml(input.disabled.id)}">${escapeHtml(input.disabled.reason)}</small>`
}

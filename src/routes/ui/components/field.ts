/**
 * الحقل — **لصيقةٌ ثمّ تلميحٌ ثمّ الحقلُ ثمّ الخطأ** (خطّة التصميم 7.6 · D-189).
 *
 * بحثُ GOV.UK: من يرى الحقلَ يبدأ الكتابة ولا ينظر تحته، **فالتلميحُ فوقه** ومربوطٌ به
 * بـ`aria-describedby` فيُقرأ معه. والخطأُ تحته برمزٍ ‏١٦ ونصٍّ بنمط «small» الثخين بحبر
 * «--bad»، ومربوطٌ كذلك، والحقلُ `aria-invalid="true"` بحدٍّ أحمر — **فلا يُقال الخطأُ
 * باللون وحدَه**.
 *
 * **والاختياريُّ يُكتب «(اختياريّ)»، ولا نجمةَ للإلزاميّ**: النجمةُ رمزٌ يُتعلَّم، والكلمةُ
 * تُقرأ. ولصيقةٌ واحدةُ الشكل في كلّ مكان (كانت اثنتين).
 *
 * **والعرضُ بطول ما يُكتب** لا بالبكسل: ‏5ch للرقم الصغير، و‏10ch للسعر، و‏20ch للاسم،
 * والسطرُ كلُّه للعنوان — بدل ‏٩٠ و‏١٠٠ و‏١١٠ و‏١٣٠ و‏١٤٠ و‏١٧٠ و‏٢٢٠px في `style=""`.
 */
import { escapeHtml } from '../escape'
import { GLYPH_ICON } from '../icons'

export interface FieldInput {
  /** معرّفُ الحقل — والتلميحُ والخطأُ يُشتقّان منه (`<id>-hint` و`<id>-err`). */
  readonly id: string
  readonly label: string
  /** تلميحٌ فوق الحقل (وسمٌ جاهز). */
  readonly hint?: string
  /** خطأٌ تحت الحقل (نصٌّ يُهرَّب). */
  readonly error?: string
  readonly optional?: boolean
  /**
   * الحقلُ نفسُه وسمًا جاهزًا (`<input …>` أو `<select>` أو `<textarea>`). **وتُضاف إليه
   * سِماتُ الربط هنا** (`id` و`aria-describedby` و`aria-invalid`) فلا ينساها من كتبه.
   */
  readonly control: string
}

/** أوّلُ وسمِ حقلٍ في الوسم — يُعطى ما ينقصه من سِمات الربط. */
function wire(control: string, attrs: Readonly<Record<string, string>>): string {
  return control.replace(/<(input|select|textarea)\b([^>]*)>/, (_tag, name: string, rest: string) => {
    let out = rest
    for (const [k, v] of Object.entries(attrs)) {
      if (new RegExp(`\\s${k}=`).test(out)) continue
      out += ` ${k}="${escapeHtml(v)}"`
    }
    return `<${name}${out}>`
  })
}

export function field(input: FieldInput): string {
  const hintId = `${input.id}-hint`
  const errId = `${input.id}-err`
  const described = [input.hint === undefined ? '' : hintId, input.error === undefined ? '' : errId]
    .filter((s) => s !== '').join(' ')
  const attrs: Record<string, string> = { id: input.id }
  if (described !== '') attrs['aria-describedby'] = described
  if (input.error !== undefined) attrs['aria-invalid'] = 'true'
  const opt = input.optional === true ? ' <span class="field-opt">(اختياريّ)</span>' : ''
  return `<div class="field">
    <label for="${escapeHtml(input.id)}">${escapeHtml(input.label)}${opt}</label>${
    input.hint === undefined ? '' : `\n    <p class="field-hint" id="${hintId}">${input.hint}</p>`}
    ${wire(input.control, attrs)}${
    input.error === undefined
      ? ''
      : `\n    <p class="field-err" id="${errId}" role="alert"><span class="field-err-ic">${GLYPH_ICON['▲'] ?? ''}</span>${
          escapeHtml(input.error)}</p>`}
  </div>`
}

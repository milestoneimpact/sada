/**
 * الحالةُ الفارغة — **ما هنا، ولماذا، وما تفعل** (خطّة التصميم 7.7 · D-189).
 *
 * كانت ثمانيَ عشرةَ كتلةً تكتب `<div class="empty"><b>…</b><p>…</p></div>` يدًا، بعضُها
 * بلا جملةٍ وبعضُها بزرٍّ أوّليٍّ ثانٍ في منطقةٍ لها أوّليُّها. فصارت دالّةً واحدة:
 * عنوانٌ بنمط «h3» يقول ما هنا، ثمّ جملةٌ بنمط «small» بحبر «--ink-2»، ثمّ فعلٌ واحد —
 * والكتلةُ في الوسط بعرضٍ أقصى ‏30em. **والفعلُ ثانويٌّ ما لم يُطلَب أوّليًّا**: الحالةُ
 * الفارغةُ داخل تبويبٍ في صفحةٍ لها أوّليُّها تُبقي الميزانيّةَ واحدًا (7.1).
 */
import { escapeHtml } from '../escape'

export interface EmptyInput {
  readonly title: string
  /** الجملةُ تحت العنوان — وسمٌ جاهزٌ مهرَّبٌ عند من كتبه. */
  readonly html?: string
  /** الفعلُ الواحد (وسمٌ جاهز: زرٌّ أو رابط). */
  readonly action?: string
  /** أيقونةٌ من `ICON` فوق العنوان — ‏٢٤px. */
  readonly icon?: string
  readonly id?: string
  /** مخفيّةٌ حتّى يُظهرها السكربت (فرزٌ لم يُبقِ شيئًا). */
  readonly hidden?: boolean
  /**
   * العنوانُ عنوانُ الصفحة حين تكون الحالةُ هي الصفحة (‏٤٠٤ و‏٥٠٠): `<h1>` بمظهر «h3» —
   * وإلّا فسطرٌ بنمط «h3» لا يدخل مخطّطَ العناوين (الحالةُ الفارغةُ داخل قسمٍ له عنوانُه).
   */
  readonly heading?: 1
}

export function emptyState(input: EmptyInput): string {
  const attrs = `${input.id === undefined ? '' : ` id="${escapeHtml(input.id)}"`}${input.hidden === true ? ' hidden' : ''}`
  return `<div class="empty"${attrs}>${
    input.icon === undefined ? '' : `<span class="empty-ic" aria-hidden="true">${input.icon}</span>`
  }${input.heading === 1
    ? `<h1 class="empty-t">${escapeHtml(input.title)}</h1>`
    : `<p class="empty-t">${escapeHtml(input.title)}</p>`}${
    input.html === undefined ? '' : `<p class="empty-p">${input.html}</p>`
  }${input.action ?? ''}</div>`
}

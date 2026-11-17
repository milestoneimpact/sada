/**
 * الحالةُ الفارغة — **ما هنا، ولماذا، وما تفعل** (خطّة التصميم 7.7 · D-189).
 *
 * كانت ثمانيَ عشرةَ كتلةً تكتب `<div class="empty"><b>…</b><p>…</p></div>` يدًا، بعضُها
 * بلا جملةٍ وبعضُها بزرٍّ أوّليٍّ ثانٍ في منطقةٍ لها أوّليُّها. فصارت دالّةً واحدة:
 * عنوانٌ بنمط «ui» يقول ما هنا (وأيقونةٌ ‏٣٢ في سطره، v1 §5.5)، ثمّ جملةٌ بنمط «small» بحبر «--ink-2»، ثمّ فعلٌ واحد —
 * والكتلةُ في الوسط بعرضٍ أقصى ‏30em. **والفعلُ ثانويٌّ ما لم يُطلَب أوّليًّا**: الحالةُ
 * الفارغةُ داخل تبويبٍ في صفحةٍ لها أوّليُّها تُبقي الميزانيّةَ واحدًا (7.1).
 */
import { echo } from '../echo'
import { escapeHtml } from '../escape'

export interface EmptyInput {
  readonly title: string
  /** الجملةُ تحت العنوان — وسمٌ جاهزٌ مهرَّبٌ عند من كتبه. */
  readonly html?: string
  /** الفعلُ الواحد (وسمٌ جاهز: زرٌّ أو رابط). */
  readonly action?: string
  /** أيقونةٌ من `ICON` في سطر العنوان — ‏٣٢px (v1 §5.5). */
  readonly icon?: string
  readonly id?: string
  /** مخفيّةٌ حتّى يُظهرها السكربت (فرزٌ لم يُبقِ شيئًا). */
  readonly hidden?: boolean
  /**
   * العنوانُ عنوانُ الصفحة حين تكون الحالةُ هي الصفحة (‏٤٠٤ و‏٥٠٠): `<h1>` بمظهر «h3» —
   * وإلّا فسطرٌ بنمط «h3» لا يدخل مخطّطَ العناوين (الحالةُ الفارغةُ داخل قسمٍ له عنوانُه).
   */
  readonly heading?: 1
  /**
   * ‏**نقشُ الصدى بالنغمة الفاتحة** بدل الأيقونة (BRAND §٥ · D-223): ‏160×96، صدًى واحدٌ وشريطٌ بشفافيّة ‏0.07
   * ‏بحبر `--ink-3`. للحالات الفارغة الستّ التي تقول «لا شيءَ بعد» حيث يبدأ المالك، و‏404 — **لا** لفرزٍ
   * ‏لم يُبقِ شيئًا ولا لرقمٍ ولا لسطح عمل. ويُرسَم ‏٣٢px في سطر العنوان (v1 §5.5 · D-381، مراجعةً لـ D-222).
   */
  readonly echo?: true
}

/** النقشُ نفسُه في كلّ حالةٍ فارغة — حتميٌّ، فيُحسب مرّة. */
const EMPTY_ECHO = echo({ width: 160, height: 96, tone: 'light', density: 1, ribbon: true })

export function emptyState(input: EmptyInput): string {
  const attrs = `${input.id === undefined ? '' : ` id="${escapeHtml(input.id)}"`}${input.hidden === true ? ' hidden' : ''}`
  return `<div class="empty"${attrs}>${
    input.echo === true ? `<span class="empty-echo" aria-hidden="true">${EMPTY_ECHO}</span>`
    : input.icon === undefined ? '' : `<span class="empty-ic" aria-hidden="true">${input.icon}</span>`
  }${input.heading === 1
    ? `<h1 class="empty-t">${escapeHtml(input.title)}</h1>`
    : `<p class="empty-t">${escapeHtml(input.title)}</p>`}${
    input.html === undefined ? '' : `<p class="empty-p">${input.html}</p>`
  }${input.action ?? ''}</div>`
}

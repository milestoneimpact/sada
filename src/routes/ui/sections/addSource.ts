/**
 * **«أضف مصدرًا» — بابٌ واحد** (D-343، المرحلةُ الرابعة من `docs/FLOW-PLAN.md`).
 *
 * كانت إضافةُ ملفٍّ أو رابطٍ لا تُتاح إلّا من الخطوة الثالثة في معالج الخطّة: من أراد أن يضيف مادّةً بلا خطّةٍ لم يجد بابًا. هنا البطاقةُ
 * نفسُها في «المكتبة»، **بالمسارَين القائمَين** (`/panel/sources/upload` و`/panel/sources/link`) وحرّاسهما — لا مسارَ جديدًا. نموذجان
 * عاديّان يعملان بلا سكربت، ويعودان إلى المكتبة بإشعارهما.
 */
import { html, raw } from '../html'
import { button } from '../components/button'
import { field } from '../components/field'
import { card } from '../components/card'
import { ICON } from '../icons'
import { UPLOAD_EXTENSIONS } from '../../../lib/sources/ingest'

export function addSourceCard(): string {
  const accept = UPLOAD_EXTENSIONS.map((e) => '.' + e).join(',')
  return card({
    title: 'أضف مصدرًا', titleId: 'add-src-t', attrs: 'id="add-source"',
    body: html`<div class="add-src">
      <form method="POST" action="/panel/sources/upload" enctype="multipart/form-data" class="stack" data-busy="يُرفع ويُحلَّل…">
        <input type="hidden" name="return" value="library">
        ${raw(field({ id: 'add-src-file', label: 'ملفٌّ أو أكثر', hint: 'PDF وWord وExcel وPowerPoint ونصّ وملفُّ ترجمة مقطع، حتّى 10MB للملفّ.',
          // ‏منطقةُ إسقاطٍ مرسومة (SPEC-v1 §5.6 · §6.5)، والحقلُ الأصليّ **ظاهرٌ فيها** لا شفّاف: بلا سكربتٍ يقول المتصفّحُ
          // ‏أسماءَ ما اختير، والإسقاطُ على الحقل يعمل في المتصفّحات كلّها
          control: html`<div class="src-drop">${raw(ICON.sources)}<span class="src-drop-t" aria-hidden="true">اسحب الملفّات إلى هنا أو اخترها</span>
            <input type="file" id="add-src-file" name="file" accept="${accept}" multiple required></div>`.value }))}
        <div class="row">${raw(button({ label: 'ارفع وحلّل', type: 'submit' }))}</div>
      </form>
      <form method="POST" action="/panel/sources/link" class="stack" data-busy="يُقرأ الرابط…">
        <input type="hidden" name="return" value="library">
        ${raw(field({ id: 'add-src-url', label: 'رابطٌ أو أكثر', hint: 'سطرٌ لكلّ رابط، حتّى ستّة: موقعٌ أو مقالٌ أو PDF أو مقطع YouTube.',
          control: html`<textarea id="add-src-url" name="url" rows="2" placeholder="https://…" dir="ltr" inputmode="url" autocomplete="off" required></textarea>`.value }))}
        <div class="row">${raw(button({ label: 'اقرأ الروابط', type: 'submit' }))}</div>
      </form>
    </div>`.value,
  })
}

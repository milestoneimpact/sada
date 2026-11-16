/**
 * شاشةُ **«عندي خطّة»** (D-287): ارفع خطّتك بأيّ صيغة أو الصقها، وصدى يقرؤها ويسكّنها في المراجعة.
 *
 * بابان في نموذجٍ واحد — ملفٌّ يُسحب أو نصٌّ يُلصق — ونوعُ الصورة لكلّ منشور (بلا صورة افتراضًا: خطّتُك قد تحمل صورَها)،
 * وزرٌّ واحد. والأنماطُ أنماطُ المعالج (`wz-drop` · `wz-opts`)، فالشاشتان أختان.
 */
import { html, raw } from './html'
import { pageHead } from './parts'
import { planWays } from './planPackageView'
import { panelHref } from '../../lib/nav/panes'
import { SEAT_EXTENSIONS } from '../../lib/plan/seat'

export function planSeatScreen(d: { readonly canRead: boolean; readonly hasPackage?: boolean }): string {
  const head = pageHead('المنشورات', 'عندي خطّة', 'ارفع خطّتك كما هي أو الصقها — يقرؤها صدى ويضعها في المراجعة، ولا يُجدوَل شيءٌ قبل أن تثبّتها.')
  const ways = planWays('import', d.hasPackage === true)
  const styles = [
    { v: 'none', title: 'بلا صورة', note: 'خطّتُك كما هي' },
    { v: 'infographic', title: 'إنفوجرافيك', note: 'يُرسم من نصّ كلّ منشور' },
    { v: 'illustration', title: 'رسمٌ فنّيّ', note: 'مسوّدةٌ مجّانيّة، ونهائيّةٌ بعد اعتمادك' },
  ]
  const form = html`<form method="POST" action="/panel/plan/import" enctype="multipart/form-data" class="card wz pn" data-busy="جار القراءة…">
    <div class="stack">
      <label class="wz-drop card" id="ps-drop"><input type="file" name="file" accept="${SEAT_EXTENSIONS.map((e) => '.' + e).join(',')}" id="ps-file">
        <span class="wz-big">ارفع ملفّ الخطّة</span>
        <span class="ago" id="ps-name">CSV أو Excel أو PDF أو Word أو نصّ — بأعمدة التاريخ والوقت والمنصّة والنصّ، أو كما كتبتَها.</span></label>
      <div class="field m-0"><label for="ps-text">أو الصقها نصًّا</label>
        <p class="field-hint m-0" id="ps-text-hint">مثل: «الأحد 9 نوفمبر، LinkedIn، 9 صباحًا: …» — وما لا تذكر وقتَه يأخذ أرجحَ ساعات المنصّة.</p>
        <textarea id="ps-text" name="pasted" rows="6" dir="auto" aria-describedby="ps-text-hint"></textarea></div>
      <fieldset class="field m-0"><legend>الصورة مع كلّ منشور</legend>
        <div class="wz-opts">${styles.map((x) => html`<label class="wz-opt card"><input type="radio" name="image_style" value="${x.v}"${x.v === 'none' ? raw(' checked') : ''}>
          <span class="wz-big">${x.title}</span><span class="ago">${x.note}</span></label>`)}</div></fieldset>
      <p class="hint m-0">الجدولُ يُقرأ بلا كلفة. وPDF وWord والنصُّ الحرّ يقرؤها نموذجُ الكتابة بنداءٍ واحدٍ في الدفتر.</p>
      <div class="row"><a class="btn btn-secondary btn-sm" href="/panel/plan-import/template.csv" download>نزّل نموذج الجدول</a></div>
      ${d.canRead
        ? html`<div class="row"><button class="btn btn-primary" type="submit">اقرأ الخطّة</button></div>`
        : html`<p class="m-0">قراءةُ الخطط للمدير فأعلى. <a href="${panelHref('posts')}">عُد إلى المنشورات</a></p>`}
    </div>
  </form>`
  return html`${raw(head)}${ways}${form}`.value
}

/** يكتب اسمَ الملفّ المختار مكانَ الشرح، ويقبل السحبَ والإفلات. */
export const PLAN_SEAT_SCRIPT = `(function(){
  var f=document.getElementById('ps-file'), d=document.getElementById('ps-drop'), n=document.getElementById('ps-name'); if(!f||!d||!n)return;
  function show(){ if(f.files&&f.files[0])n.textContent='«'+f.files[0].name+'» — جاهزٌ للقراءة'; }
  f.addEventListener('change',show);
  ['dragenter','dragover'].forEach(function(t){d.addEventListener(t,function(){d.classList.add('is-over');});});
  ['dragleave','drop'].forEach(function(t){d.addEventListener(t,function(){d.classList.remove('is-over');});});
})();`

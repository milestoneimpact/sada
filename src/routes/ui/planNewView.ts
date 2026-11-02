/**
 * معالجُ «خطّة جديدة» (D-283 · D-284) — الخطّةُ محورَ المنصّة.
 *
 * ## خطوةٌ في كلّ شاشة
 *
 * كان النموذجُ صفحةً طويلةً بخطواتٍ مرقَّمة (D-283)، وقال المالك: «ليس معالجًا». فصار **خطوةً واحدةً في كلّ شاشة**،
 * فوقها شريطُ تقدّمٍ بأسماء الخطوات الأربع، وتحتها شريطٌ ثابتٌ فيه «السابق» و«التالي» والملخّصُ الحيّ:
 *
 *   ١ الفترة  ←  ٢ المنصّات  ←  ٣ المحتوى  ←  ٤ المراجعة
 *
 * **وبلا سكربتٍ لا ينكسر شيء**: الخطواتُ كلُّها نموذجٌ واحدٌ يُرى متتابعًا، والزرُّ في آخره. والسكربتُ يضيف
 * `wz-on` فيُخفي ما ليس الخطوةَ الحاليّة — تحسينٌ فوق ما يعمل، لا شرطٌ له.
 *
 * ## المحتوى: ما عندك، وما تضيفه الآن (D-284)
 *
 * الخطوةُ الثالثة شبكةُ مصادرك المحلَّلة (Drive والمرفوع والروابط بشاراتها)، ومعها بابان: **ارفع ملفًّا** (سحبٌ
 * وإفلات) و**أضف رابطًا**. كلاهما نموذجٌ مستقلٌّ (`pn-up` · `pn-link`) مربوطٌ بحقوله بخاصّيّة `form` — فالنماذجُ لا
 * تتداخل، وبلا سكربتٍ يُرسَل ويعود إلى هنا والمصدرُ محدَّد. وبالسكربت يُرفع بشريط تقدّم وتُرسم بطاقتُه في مكانها.
 *
 * ## ثلاثُ قواعد باقية
 *
 * - **المربوطُ وحدَه يُرى**، ومن `PLAN_NOW` وحدَه (LinkedIn وX بقرار المالك).
 * - **الإيقاعُ يُختار لا يُكتب.**
 * - **زرٌّ واحدٌ للبناء**، والعددُ والكلفةُ فوقه قبل الضغط (D-006 · D-008)، ولا يُنشر شيءٌ بعده.
 */
import { html, raw, type Html } from './html'
import { pageHead } from './parts'
import { LOGOS } from './logos'
import { money } from '../../lib/format'
import { platformLabel } from '../../lib/oauth/providers'
import { panelHref } from '../../lib/nav/panes'
import { UPLOAD_EXTENSIONS } from '../../lib/sources/ingest'
import { FINAL_IMAGE_MODEL, NEURON_USD, imageNeurons } from '../../lib/ai/imagePricing'

/** سعرُ الصورة النهائيّة بعد الحصّة — من الجدول لا رقمًا يُكتب (D-285). */
const FINAL_PER_IMAGE = (imageNeurons(FINAL_IMAGE_MODEL, 1344, 704) ?? 0) * NEURON_USD
import { weekStart, type PlanPlatform } from '../../lib/plan/prompt'

/** ما يُخطَّط له اليوم بقرار المالك — ومنه يُرى المربوطُ وحدَه. */
export const PLAN_NOW: readonly PlanPlatform[] = ['linkedin', 'x']

/** المدى الذي يُعرَض: أسبوعٌ وأسبوعان وشهر. والشهران يقبلهما الخادمُ ولا يُعرَضان (طلبُ المالك). */
const SPANS = [
  { id: 'week', label: 'أسبوع', weeks: 1, note: 'للبدء أو لحملةٍ قصيرة' },
  { id: '2weeks', label: 'أسبوعان', weeks: 2, note: 'إيقاعٌ ثابتٌ بلا التزامٍ طويل' },
  { id: 'month', label: 'شهر', weeks: 4, note: 'الأنسبُ لخطّةٍ تُعتمَد وتُثبَّت' },
] as const

/** مستوياتُ الإيقاع في الأسبوع لكلّ منصّة. */
const PACES = [
  { n: 2, label: 'خفيف' },
  { n: 3, label: 'متوازن' },
  { n: 5, label: 'نشِط' },
] as const

const STEPS = ['الفترة', 'المنصّات', 'المحتوى', 'المراجعة'] as const
const DIGITS = ['١', '٢', '٣', '٤'] as const

export interface PlanNewSource {
  readonly id: string
  readonly name: string
  /** `drive` · `upload` · `url` (D-284) */
  readonly kind: string
}

export interface PlanNewData {
  readonly now: Date
  /** المنصّاتُ المربوطةُ بحسابٍ نشط. */
  readonly linked: readonly string[]
  /** إيقاعُ الموجز في الأسبوع — يُختار مستواه افتراضًا. */
  readonly perWeek: number
  readonly sources: readonly PlanNewSource[]
  readonly perDraft: number | null
  readonly perImage: number | null
  /** كلفةُ الإنفوجرافيك: نداءُ كتابة محتواه (D-285). */
  readonly perInfographic?: number | null
  /** كم صورةً مجّانيّةً بقيت اليوم: المسوّدةُ بـ schnell والنهائيّةُ بـ klein 9B (D-285). */
  readonly freeLeft?: { readonly draft: number; readonly final: number }
  readonly autoImage: boolean
  /** أمزوّدُ مهمّة الخطّة جاهز؟ */
  readonly ready: boolean
  /** خطّةٌ قائمةٌ تُستبدَل لهذا المدى؟ */
  readonly replacing: boolean
  /** مصدرٌ أُضيف للتوّ بلا سكربت — يُحدَّد ويُفتح المعالجُ على خطوته. */
  readonly picked?: string | null
  /** أيملك الدورُ إضافةَ مصدر؟ (المديرُ فأعلى — كالتحليل) */
  readonly canAdd?: boolean
}

const AR = (n: number): string => n.toLocaleString('ar-EG')

/** «الأحد ٨ نوفمبر» — يومُ البداية كما يُقرأ، لا `2026-11-08`. */
function startLabel(day: string): string {
  const at = new Date(day + 'T12:00:00Z')
  return Number.isNaN(at.getTime()) ? day : at.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
}

const KIND_LABEL: Readonly<Record<string, string>> = { drive: 'Drive', upload: 'مرفوع', url: 'رابط' }

function stepHead(n: number, title: string, lede: string): Html {
  return html`<header class="wz-head"><span class="wz-k">الخطوة ${DIGITS[n - 1] ?? ''} من ٤</span>
    <h2 id="wz-t${String(n)}">${title}</h2><p class="hint m-0">${lede}</p></header>`
}

function spanStep(start: string, perWeek: number, channels: number): Html {
  const cards = SPANS.map((s) => html`<label class="wz-opt card"><input type="radio" name="span" value="${s.id}" data-weeks="${String(s.weeks)}"${s.id === 'month' ? raw(' checked') : ''}>
      <span class="wz-big">${s.label}</span>
      <span class="wz-sub">نحو ${AR(Math.max(1, channels) * perWeek * s.weeks)} منشورًا</span>
      <span class="ago">${s.note}</span></label>`)
  return html`<section class="wz-step" data-step="1" aria-labelledby="wz-t1">
    ${stepHead(1, 'كم مدّةً تغطّي الخطّة؟', 'تُكتب المنشوراتُ كلُّها مرّةً واحدة، ثمّ تراجعها قبل أن يُجدوَل شيء.')}
    <div class="wz-opts" role="radiogroup" aria-labelledby="wz-t1">${cards}</div>
    <details class="fold mt-3"><summary><span>تبدأ ${startLabel(start)} — غيّر</span></summary>
      <div class="field"><label for="plan-start">يوم البداية</label>
        <input type="date" id="plan-start" name="start" value="${start}" dir="ltr"></div></details>
  </section>`
}

function channelCard(p: PlanPlatform, perWeek: number): Html {
  const preset = PACES.some((x) => x.n === perWeek) ? perWeek : null
  const paces = PACES.map((x) => html`<label class="wz-pill"><input type="radio" name="cadence_${p}" value="${String(x.n)}"${preset === x.n ? raw(' checked') : ''}>
      <span><b>${x.label}</b> · ${AR(x.n)} في الأسبوع</span></label>`)
  return html`<fieldset class="wz-pf card" data-pf="${p}">
    <legend class="wz-pf-h"><label class="row gap-2"><input type="checkbox" name="channel" value="${p}" checked>
      <span class="pf-logo" aria-hidden="true">${raw(LOGOS[p] ?? '')}</span><b>${platformLabel(p)}</b></label></legend>
    <div class="wz-pills" role="radiogroup" aria-label="إيقاع ${platformLabel(p)}">${paces}
      <label class="wz-pill"><input type="radio" name="cadence_${p}" value="custom"${preset === null ? raw(' checked') : ''}>
        <span><b>مخصّص</b> <input type="number" name="cadence_custom_${p}" min="1" max="28" step="1" value="${String(preset === null ? Math.max(1, perWeek) : 4)}" dir="ltr" aria-label="${platformLabel(p)}: منشورات في الأسبوع"></span></label>
    </div></fieldset>`
}

function channelStep(d: PlanNewData, shown: readonly PlanPlatform[]): Html {
  const missing = PLAN_NOW.filter((p) => !shown.includes(p))
  const body = shown.length === 0
    ? html`<div class="wz-empty"><p class="m-0">لا منصّة مربوطة بعد — الخطّةُ تُبنى لما يُنشر عليه فعلًا.</p>
        <a class="btn btn-secondary btn-sm" href="${panelHref('channels')}">اربط LinkedIn أو X</a></div>`
    : html`${shown.map((p) => channelCard(p, d.perWeek))}${missing.length === 0
        ? ''
        : html`<p class="hint m-0">${missing.map((p) => platformLabel(p)).join(' و')} غير مربوطة — <a href="${panelHref('channels')}">اربطها</a> لتظهر هنا.</p>`}`
  return html`<section class="wz-step" data-step="2" aria-labelledby="wz-t2">
    ${stepHead(2, 'على أيّ منصّة، وكم مرّة؟', 'المربوطُ وحدَه يظهر. والإيقاعُ عددُ المنشورات في الأسبوع لكلّ منصّة.')}
    <div class="stack">${body}</div>
  </section>`
}

function sourceCard(s: PlanNewSource, picked: boolean): Html {
  return html`<label class="wz-src"><input type="checkbox" name="source" value="${s.id}"${picked ? raw(' checked') : ''}>
    <span class="wz-src-b"><bdi class="nm">${s.name}</bdi><span class="chip">${KIND_LABEL[s.kind] ?? s.kind}</span></span></label>`
}

function contentStep(d: PlanNewData): Html {
  const info = d.perInfographic ?? null
  const free = d.freeLeft ?? { draft: 0, final: 0 }
  const left = (n: number, what: string): string => n === 0 ? what + ': نفدت حصّةُ اليوم' : what + ': مجّانًا — بقي ' + AR(n) + ' اليوم'
  const styles = [
    { v: 'none', title: 'بلا صورة', notes: ['نصٌّ وحده'], cost: 0 },
    { v: 'infographic', title: 'إنفوجرافيك', notes: [
      info === null ? 'كتابةُ محتواه: تُقاس بعد أوّل صورة' : 'كتابةُ محتواه: نحو ' + money(info),
      'رسمُه مجّانيّ، والعربيّةُ فيه صحيحة',
    ], cost: info ?? 0 },
    { v: 'illustration', title: 'رسمٌ فنّيّ', notes: [
      left(free.draft, 'المسوّدة (FLUX schnell)'),
      left(free.final, 'النهائيّة بعد اعتمادك (klein 9B)') + '، ثمّ ' + money(FINAL_PER_IMAGE),
      d.perImage === null ? 'وموجزُها يُقاس بعد أوّل صورة' : 'وموجزُها نحو ' + money(d.perImage),
    ], cost: d.perImage ?? 0 },
  ]
  const picked = d.autoImage ? 'infographic' : 'none'
  const imageChoice = html`<fieldset class="field mt-3"><legend>الصورة مع كلّ منشور</legend>
      <div class="wz-opts">${styles.map((x) => html`<label class="wz-opt card"><input type="radio" name="image_style" value="${x.v}" data-cost="${String(x.cost)}"${x.v === picked ? raw(' checked') : ''}>
        <span class="wz-big">${x.title}</span>${x.notes.map((n) => html`<span class="ago">${n}</span>`)}</label>`)}</div></fieldset>`
  const add = d.canAdd === false
    ? html``
    : html`<div class="wz-add card card-inset">
      <label class="wz-drop card" id="pn-drop"><input type="file" name="file" form="pn-up" accept="${UPLOAD_EXTENSIONS.map((e) => '.' + e).join(',')}" id="pn-file">
        <span class="wz-big">ارفع ملفًّا</span>
        <span class="ago">اسحبه إلى هنا أو اختره — PDF وWord وExcel وPowerPoint ونصّ، حتّى 10MB. يُحفظ في مكتبتك ويُحلَّل الآن.</span>
        <span class="wz-prog" id="pn-prog" hidden><span></span></span></label>
      <noscript><button class="btn btn-secondary btn-sm" type="submit" form="pn-up">ارفع الملفّ المختار</button></noscript>
      <div class="field m-0"><label for="pn-url">أو أضف رابطًا</label>
        <div class="row gap-2"><input type="url" id="pn-url" name="url" form="pn-link" placeholder="https://…" dir="ltr" inputmode="url" autocomplete="off">
          <button class="btn btn-secondary" type="submit" form="pn-link" id="pn-link-go">اقرأ الرابط</button></div>
        <p class="field-hint m-0">مقالٌ أو صفحةٌ أو PDF. يُستخرج نصُّه ويُحلَّل كأيّ مصدر.</p></div>
      <p class="m-0 wz-say" id="pn-add-say" role="status" aria-live="polite"></p>
    </div>`
  return html`<section class="wz-step" data-step="3" aria-labelledby="wz-t3">
    ${stepHead(3, 'من أيّ محتوى تُبنى؟', 'صدى يقرأ مصادرك المحلَّلة كلَّها افتراضًا. وهنا تضيف ملفًّا أو رابطًا الآن، أو تحصر الخطّة في بعضها.')}
    ${add}
    <fieldset class="field mt-3"><legend>مصادرك</legend>
      <div class="wz-srcs" id="pn-srcs">
        <label class="wz-src"><input type="checkbox" name="source" value="all"${d.picked ? '' : raw(' checked')}><span class="wz-src-b"><b>الكلّ</b><span class="ago">${AR(d.sources.length)} محلَّلًا</span></span></label>
        ${d.sources.slice(0, 60).map((s) => sourceCard(s, s.id === d.picked))}
      </div></fieldset>
    ${imageChoice}
    <details class="fold mt-3"><summary><span>أفكارٌ بكلماتك (اختياري)</span></summary>
      <div class="field"><label for="plan-ideas">سطرٌ لكلّ فكرة</label>
        <p class="field-hint" id="plan-ideas-hint">حتّى عشرين — تدخل الخطّة كما يدخل المصدر.</p>
        <textarea id="plan-ideas" name="ideas" rows="3" dir="auto" aria-describedby="plan-ideas-hint"></textarea></div></details>
  </section>`
}

/** ما يمنع البناء، بسببه وزرِّ علاجه — أو لا شيء. */
function blocker(d: PlanNewData, shown: readonly PlanPlatform[]): Html | null {
  if (!d.ready) {
    return html`<p class="m-0">مزوّدُ الكتابة غير مضبوط بعد.</p>
      <a class="btn btn-secondary btn-sm" href="${panelHref('providers')}">اضبط المزوّد</a>`
  }
  if (d.sources.length < 2) {
    return html`<p class="m-0">${d.sources.length === 0 ? 'لا مصدر محلَّل بعد' : 'مصدرٌ واحد محلَّل'} — والخطّةُ تحتاج اثنين على الأقلّ. أضف ملفًّا أو رابطًا في الخطوة ٣.</p>`
  }
  if (shown.length === 0) return html`<p class="m-0">اربط منصّةً أوّلًا (الخطوة ٢).</p>`
  return null
}

function reviewStep(d: PlanNewData, shown: readonly PlanPlatform[], count: number): Html {
  const stop = blocker(d, shown)
  return html`<section class="wz-step" data-step="4" aria-labelledby="wz-t4">
    ${stepHead(4, 'راجع ثمّ ابنِ', 'صدى يقرأ المصادر ويكتب المنشورات ويرسم صورها، ثمّ تراجعها أنت بندًا بندًا.')}
    <dl class="wz-sum">
      <div><dt>الفترة</dt><dd id="pn-s-span">شهر</dd></div>
      <div><dt>المنصّات</dt><dd id="pn-s-ch">${shown.map((p) => platformLabel(p)).join(' · ') || '—'}</dd></div>
      <div><dt>المحتوى</dt><dd id="pn-s-src">كلُّ المصادر المحلَّلة</dd></div>
      <div><dt>المنشورات</dt><dd id="pn-sum" data-draft="${String(d.perDraft ?? 0)}" data-image="${String(d.perInfographic ?? 0)}">${summaryText(count, d, d.autoImage)}</dd></div>
    </dl>
    <p class="wz-note"><b>لا يُنشر شيءٌ قبل اعتمادك.</b> بعد البناء تراجع كلَّ منشور: تعتمده أو تعدّله أو تؤخّره أو تحذفه.</p>
    ${stop === null ? html`` : html`<div class="wz-empty" role="alert">${stop}</div>`}
  </section>`
}

function summaryText(count: number, d: PlanNewData, image: boolean): string {
  const unit = (d.perDraft ?? 0) + (image ? (d.perInfographic ?? 0) : 0)
  const cost = d.perDraft === null ? 'والكلفةُ تُقدَّر بعد أوّل كتابة' : 'نحو ' + money(count * unit)
  // ‏نصٌّ عاديٌّ يُهرَّب حين يُقحَم في القالب
  return AR(count) + ' منشورًا' + (image ? ' بصورها' : '') + ' · ' + cost
}

export function planNewScreen(d: PlanNewData): string {
  const start = weekStart(d.now)
  const shown = PLAN_NOW.filter((p) => d.linked.includes(p))
  const preset = PACES.some((x) => x.n === d.perWeek) ? d.perWeek : Math.max(1, d.perWeek)
  const count = shown.length * preset * 4
  const canBuild = blocker(d, shown) === null
  const head = pageHead('المنشورات', 'خطّة جديدة', 'أربعُ خطوات، ثمّ يبني صدى الخطّة وتراجعها قبل أن يُنشر شيء.')
  const ways = html`<nav class="row gap-2 mb-4" aria-label="طريقة الخطّة">
      <a class="btn btn-primary btn-sm" href="/panel/plan/new" aria-current="page">ابنِ لي خطّة</a>
      <a class="btn btn-secondary btn-sm" href="${panelHref('plan-import')}">عندي خطّة</a></nav>`
  const bar = html`<ol class="wz-bar" aria-label="خطوات المعالج">${STEPS.map((s, i) => html`<li data-to="${String(i + 1)}"${i === 0 ? raw(' aria-current="step"') : ''}><span class="wz-n">${DIGITS[i] ?? ''}</span><span class="wz-l">${s}</span></li>`)}</ol>`
  const foot = html`<div class="wz-foot">
      <button class="btn btn-secondary" type="button" id="wz-prev" hidden>السابق</button>
      <span class="wz-live" id="pn-live" aria-hidden="true">${summaryText(count, d, d.autoImage)}</span>
      <button class="btn btn-primary" type="button" id="wz-next" hidden>التالي</button>
      ${canBuild ? html`<button class="btn btn-primary" type="submit" id="wz-go">حلّل وابنِ الخطّة</button>` : html``}
    </div>`
  const form = html`<form method="POST" action="/panel/plan/generate" class="card wz" id="pn" data-busy="جار التحليل والبناء…"${d.picked ? raw(' data-start="3"') : ''}${d.replacing ? raw(' data-confirm="ستحلّ محلّ خطّتك لهذا المدى. أتمضي؟"') : ''}>
    <input type="hidden" name="then" value="review">
    ${bar}${spanStep(start, preset, shown.length)}${channelStep(d, shown)}${contentStep(d)}${reviewStep(d, shown, count)}${foot}
  </form>
  <form method="POST" action="/panel/sources/upload" enctype="multipart/form-data" id="pn-up"><input type="hidden" name="return" value="plan"></form>
  <form method="POST" action="/panel/sources/link" id="pn-link"><input type="hidden" name="return" value="plan"></form>`
  return html`${raw(head)}${ways}${form}`.value
}

/**
 * سكربتُ المعالج: خطوةٌ في كلّ شاشة، والملخّصُ حيًّا، والرفعُ بشريط تقدّم، والرابطُ بلا تحميل.
 * وبلا سكربتٍ يبقى كلُّ ذلك نموذجًا يعمل (انظر رأس الملفّ).
 */
export const PLAN_NEW_SCRIPT = `(function(){
  var f=document.getElementById('pn'); if(!f)return;
  var steps=[].slice.call(f.querySelectorAll('.wz-step')), bar=[].slice.call(f.querySelectorAll('.wz-bar li'));
  var prev=document.getElementById('wz-prev'), next=document.getElementById('wz-next'), go=document.getElementById('wz-go');
  var out=document.getElementById('pn-sum'), live=document.getElementById('pn-live');
  var perDraft=Number(out&&out.getAttribute('data-draft'))||0, perImage=Number(out&&out.getAttribute('data-image'))||0;
  var reduce=matchMedia('(prefers-reduced-motion: reduce)').matches, at=Number(f.getAttribute('data-start'))||1;
  f.classList.add('wz-on');
  function show(n,focus){
    at=Math.max(1,Math.min(steps.length,n));
    steps.forEach(function(s,i){s.classList.toggle('is-on',i+1===at); if(!reduce&&i+1===at){s.classList.remove('wz-in'); void s.offsetWidth; s.classList.add('wz-in');}});
    bar.forEach(function(b,i){ if(i+1===at)b.setAttribute('aria-current','step'); else b.removeAttribute('aria-current'); b.classList.toggle('is-done',i+1<at);});
    prev.hidden=at===1; next.hidden=at===steps.length; if(go)go.hidden=at!==steps.length;
    if(focus){var h=steps[at-1].querySelector('h2'); if(h){h.setAttribute('tabindex','-1'); h.focus({preventScroll:true});} f.scrollIntoView({behavior:reduce?'auto':'smooth',block:'start'});}
  }
  prev.addEventListener('click',function(){show(at-1,true);});
  next.addEventListener('click',function(){show(at+1,true);});
  bar.forEach(function(b){b.addEventListener('click',function(){show(Number(b.getAttribute('data-to')),true);});});
  function money(n){return '$'+(n<1?n.toFixed(3):n.toFixed(2));}
  function upd(){
    var span=f.querySelector('input[name="span"]:checked'), weeks=span?Number(span.getAttribute('data-weeks'))||1:4;
    var per=0, names=[];
    f.querySelectorAll('input[name="channel"]:checked').forEach(function(ch){
      var p=ch.value, pick=f.querySelector('input[name="cadence_'+p+'"]:checked'), n=pick?pick.value:'3';
      if(n==='custom'){var c=f.querySelector('input[name="cadence_custom_'+p+'"]'); n=c?c.value:'0';}
      per+=Math.max(0,Math.min(28,Math.floor(Number(n)||0)));
      var b=ch.closest('label'); names.push(b?b.textContent.trim():p);
    });
    var st=f.querySelector('input[name="image_style"]:checked'), img=!!st&&st.value!=='none', count=per*weeks;
    perImage=st?Number(st.getAttribute('data-cost'))||0:0;
    var cost=perDraft>0?'نحو '+money(count*(perDraft+(img?perImage:0))):'والكلفةُ تُقدَّر بعد أوّل كتابة';
    var text=count.toLocaleString('ar-EG')+' منشورًا'+(img?' بصورها':'')+' · '+cost;
    if(out)out.textContent=text; if(live)live.textContent=text;
    var sp=document.getElementById('pn-s-span'); if(sp&&span){var l=span.closest('label').querySelector('.wz-big'); sp.textContent=l?l.textContent:'';}
    var sc=document.getElementById('pn-s-ch'); if(sc)sc.textContent=names.length?names.join(' · '):'—';
    var all=f.querySelector('input[name="source"][value="all"]'), picked=f.querySelectorAll('input[name="source"]:checked:not([value="all"])').length;
    var ss=document.getElementById('pn-s-src'); if(ss)ss.textContent=(all&&all.checked)||picked===0?'كلُّ المصادر المحلَّلة':picked.toLocaleString('ar-EG')+' من مصادرك';
  }
  f.addEventListener('change',upd); f.addEventListener('input',upd);
  // ‏«الكلّ» وما سواه لا يجتمعان: اختيارُ مصدرٍ يرفع «الكلّ»، ورفعُ آخرِها يعيده
  f.addEventListener('change',function(e){
    var t=e.target; if(!t||t.name!=='source')return;
    var all=f.querySelector('input[name="source"][value="all"]');
    if(t.value==='all'&&t.checked){f.querySelectorAll('input[name="source"]:not([value="all"])').forEach(function(x){x.checked=false;});}
    else if(t.value!=='all'&&all){all.checked=f.querySelectorAll('input[name="source"]:checked:not([value="all"])').length===0;}
    upd();
  });
  var say=document.getElementById('pn-add-say'), grid=document.getElementById('pn-srcs');
  var csrf=(document.querySelector('#pn-up input[name="_csrf"]')||{}).value||'';
  function added(r){
    if(!r||!r.ok){say.textContent=(r&&r.reason)||'تعذّر — أعد المحاولة.'; say.setAttribute('data-tone','bad'); return;}
    say.textContent='«'+r.name+'» '+r.note; say.setAttribute('data-tone',r.ready?'ok':'warn');
    if(!r.ready||f.querySelector('input[name="source"][value="'+r.id+'"]'))return;
    var l=document.createElement('label'); l.className='wz-src is-new';
    var i=document.createElement('input'); i.type='checkbox'; i.name='source'; i.value=r.id; i.checked=true;
    var b=document.createElement('span'); b.className='wz-src-b';
    var n=document.createElement('bdi'); n.className='nm'; n.textContent=r.name;
    var k=document.createElement('span'); k.className='chip'; k.textContent='جديد';
    b.appendChild(n); b.appendChild(k); l.appendChild(i); l.appendChild(b);
    grid.insertBefore(l,grid.children[1]||null);
    var all=f.querySelector('input[name="source"][value="all"]'); if(all)all.checked=false; upd();
  }
  var file=document.getElementById('pn-file'), drop=document.getElementById('pn-drop'), prog=document.getElementById('pn-prog');
  function upload(fl){
    if(!fl)return; var fd=new FormData(); fd.append('_csrf',csrf); fd.append('return','plan'); fd.append('file',fl);
    var x=new XMLHttpRequest(); x.open('POST','/panel/sources/upload'); x.setRequestHeader('Accept','application/json');
    prog.hidden=false; var bar=prog.firstElementChild; bar.style.inlineSize='0%'; say.removeAttribute('data-tone'); say.textContent='يُرفع «'+fl.name+'»…';
    x.upload.onprogress=function(e){if(e.lengthComputable){bar.style.inlineSize=Math.round(e.loaded/e.total*100)+'%'; if(e.loaded===e.total)say.textContent='يُقرأ ويُحلَّل…';}};
    x.onload=function(){prog.hidden=true; var r=null; try{r=JSON.parse(x.responseText);}catch(e){} added(r); file.value='';};
    x.onerror=function(){prog.hidden=true; added(null);};
    x.send(fd);
  }
  if(file){file.addEventListener('change',function(){upload(file.files&&file.files[0]);});}
  if(drop){
    ['dragenter','dragover'].forEach(function(t){drop.addEventListener(t,function(e){e.preventDefault(); drop.classList.add('is-over');});});
    ['dragleave','drop'].forEach(function(t){drop.addEventListener(t,function(e){e.preventDefault(); drop.classList.remove('is-over');});});
    drop.addEventListener('drop',function(e){var fl=e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files[0]; upload(fl);});
  }
  var link=document.getElementById('pn-link');
  if(link){link.addEventListener('submit',function(e){
    e.preventDefault(); var u=document.getElementById('pn-url'); if(!u||!u.value)return;
    var btn=document.getElementById('pn-link-go'); btn.disabled=true; say.removeAttribute('data-tone'); say.textContent='تُقرأ الصفحة وتُحلَّل…';
    var fd=new FormData(); fd.append('_csrf',csrf); fd.append('return','plan'); fd.append('url',u.value);
    fetch('/panel/sources/link',{method:'POST',body:fd,headers:{Accept:'application/json'},credentials:'same-origin'})
      .then(function(r){return r.json();}).then(function(r){added(r); if(r&&r.ok)u.value='';})
      .catch(function(){added(null);}).finally(function(){btn.disabled=false;});
  });}
  // ‏Enter في حقلٍ لا يقفز إلى البناء قبل الخطوة الأخيرة
  f.addEventListener('keydown',function(e){ if(e.key==='Enter'&&e.target.tagName==='INPUT'&&e.target.form===f&&at<steps.length){e.preventDefault(); show(at+1,true);} });
  upd(); show(at,false);
})();`

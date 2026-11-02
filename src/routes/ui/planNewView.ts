/**
 * شاشةُ «خطّة جديدة» (D-283) — الخطّةُ محورَ المنصّة، الطلبُ ٢ من ٤.
 *
 * ## لماذا شاشةٌ لا نموذجٌ في اللوحة
 *
 * كان نموذجُ D-282 كلُّه في قسمٍ واحد: المدى ويومُ البداية والقنواتُ الخمسُ (ثلاثٌ منها «غير مربوطة»)
 * والمصادرُ والأفكارُ والصورة — **ستّةُ قراراتٍ في صفحةٍ قبل أن يُعرَف أيُّها يلزم**. والمالكُ يريد ثلاثةً:
 * كم مدّةً، وعلى أيّ منصّة، وبأيّ إيقاع. فصارت **خطواتٍ مرقَّمةً بقرارٍ واحدٍ لكلٍّ**، والباقي مطويٌّ اختيارًا.
 *
 * ## ثلاثُ قواعد
 *
 * - **المربوطُ وحدَه يُرى.** منصّةٌ غيرُ مربوطةٍ لا تُعرَض معطّلةً؛ تُذكَر في سطرٍ برابط الربط. واليومَ
 *   LinkedIn وX وحدَهما بقرار المالك (2026-11-02)، والبقيّةُ تعود بإضافتها إلى `PLAN_NOW` لا بكتابة شاشة.
 * - **الإيقاعُ يُختار لا يُكتب.** ثلاثةُ مستوياتٍ مسمّاةٍ برقمها، و«مخصّص» لمن يريد غيرَها.
 * - **زرٌّ واحد.** الملخّصُ فوقه يقول العددَ والكلفةَ قبل الضغط (D-006 · D-008)، ولا يُنشر شيءٌ بعده.
 *
 * والنموذجُ يُرسل إلى `/panel/plan/generate` نفسِه — لا طريقًا ثانيًا حول الحارس.
 */
import { html, raw, type Html } from './html'
import { pageHead } from './parts'
import { money } from '../../lib/format'
import { platformLabel } from '../../lib/oauth/providers'
import { panelHref } from '../../lib/nav/panes'
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

export interface PlanNewData {
  readonly now: Date
  /** المنصّاتُ المربوطةُ بحسابٍ نشط. */
  readonly linked: readonly string[]
  /** إيقاعُ الموجز في الأسبوع — يُختار مستواه افتراضًا. */
  readonly perWeek: number
  readonly sources: readonly { readonly id: string; readonly name: string }[]
  readonly perDraft: number | null
  readonly perImage: number | null
  readonly autoImage: boolean
  /** أمزوّدُ مهمّة الخطّة جاهز؟ */
  readonly ready: boolean
  /** خطّةٌ قائمةٌ تُستبدَل لهذا المدى؟ */
  readonly replacing: boolean
}

const AR = (n: number): string => n.toLocaleString('ar-EG')

/** «الأحد ٨ نوفمبر» — يومُ البداية كما يُقرأ، لا `2026-11-08`. */
function startLabel(day: string): string {
  const at = new Date(day + 'T12:00:00Z')
  return Number.isNaN(at.getTime()) ? day : at.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
}

function spanStep(start: string): Html {
  const cards = SPANS.map((s) => html`<label class="when-opt"><input type="radio" name="span" value="${s.id}" data-weeks="${String(s.weeks)}"${s.id === 'month' ? raw(' checked') : ''}>
      <span><b>${s.label}</b><span class="ago">${s.note}</span></span></label>`)
  return html`<li><span class="step-n" aria-hidden="true">١</span><div class="body">
    <span class="what" id="pn-span">كم مدّةً تغطّي الخطّة؟</span>
    <div class="when-opts" role="radiogroup" aria-labelledby="pn-span">${cards}</div>
    <details class="fold mt-2"><summary><span>تبدأ ${startLabel(start)} — غيّر</span></summary>
      <div class="field"><label for="plan-start">يوم البداية</label>
        <input type="date" id="plan-start" name="start" value="${start}" dir="ltr"></div></details>
  </div></li>`
}

function channelBlock(p: PlanPlatform, perWeek: number): Html {
  const preset = PACES.some((x) => x.n === perWeek) ? perWeek : null
  const paces = PACES.map((x) => html`<label class="when-opt"><input type="radio" name="cadence_${p}" value="${String(x.n)}"${preset === x.n ? raw(' checked') : ''}>
      <span><b>${x.label}</b><span class="ago">${AR(x.n)} في الأسبوع</span></span></label>`)
  return html`<fieldset class="field">
    <legend><label class="vapprove"><input type="checkbox" name="channel" value="${p}" checked> <b>${platformLabel(p)}</b></label></legend>
    <div class="when-opts" role="radiogroup" aria-label="إيقاع ${platformLabel(p)}">${paces}
      <label class="when-opt"><input type="radio" name="cadence_${p}" value="custom"${preset === null ? raw(' checked') : ''}>
        <span><b>مخصّص</b><span class="row gap-2"><input type="number" name="cadence_custom_${p}" min="1" max="28" step="1" value="${String(preset === null ? Math.max(1, perWeek) : 4)}" dir="ltr" aria-label="${platformLabel(p)}: منشورات في الأسبوع"> في الأسبوع</span></span></label>
    </div></fieldset>`
}

function channelStep(d: PlanNewData, shown: readonly PlanPlatform[]): Html {
  const missing = PLAN_NOW.filter((p) => !shown.includes(p))
  const body = shown.length === 0
    ? html`<p class="hint m-0">لا منصّة مربوطة بعد — الخطّةُ تُبنى لما يُنشر عليه فعلًا.</p>
        <a class="btn btn-secondary btn-sm mt-2" href="${panelHref('channels')}">اربط LinkedIn أو X</a>`
    : html`${shown.map((p) => channelBlock(p, d.perWeek))}${missing.length === 0
        ? ''
        : html`<p class="hint m-0">${missing.map((p) => platformLabel(p)).join(' و')} غير مربوطة — <a href="${panelHref('channels')}">اربطها</a> لتظهر هنا.</p>`}`
  return html`<li><span class="step-n" aria-hidden="true">٢</span><div class="body">
    <span class="what">على أيّ منصّة، وكم مرّة؟</span>
    <span class="why">المربوطُ وحدَه يظهر. والإيقاعُ عددُ المنشورات في الأسبوع لكلّ منصّة.</span>
    <div class="stack mt-2">${body}</div>
  </div></li>`
}

function contentStep(d: PlanNewData): Html {
  const sources = d.sources.slice(0, 60).map((x) => html`<label class="vpf"><input type="checkbox" name="source" value="${x.id}"><span class="vpf-b"><bdi>${x.name}</bdi></span></label>`)
  const imageCost = d.perImage === null ? 'تُقاس كلفتُها بعد أوّل صورة' : 'نحو ' + money(d.perImage) + ' للصورة'
  return html`<li><span class="step-n" aria-hidden="true">٣</span><div class="body">
    <span class="what">المحتوى</span>
    <span class="why">صدى يقرأ مصادرك المحلَّلة كلَّها افتراضًا. وهنا تحصرها أو تضيف أفكارك.</span>
    <label class="vpf mt-2"><input type="checkbox" name="auto_image" value="1"${d.autoImage ? raw(' checked') : ''}>
      <span class="vpf-b"><b>صورة مع كلّ منشور</b><span class="ago">${imageCost}</span></span></label>
    <input type="hidden" name="auto_image" value="0">
    <details class="fold mt-2"><summary><span>المصادر والأفكار (اختياري)</span></summary>
      <fieldset class="field"><legend>المصادر</legend>
        <div class="vpfs"><label class="vpf"><input type="checkbox" name="source" value="all" checked><span class="vpf-b"><b>الكلّ</b></span></label>${sources}</div></fieldset>
      <div class="field"><label for="plan-ideas">أفكار بكلماتك</label>
        <p class="field-hint" id="plan-ideas-hint">سطرٌ لكلّ فكرة، حتّى عشرين — تدخل الخطّة كما يدخل المصدر.</p>
        <textarea id="plan-ideas" name="ideas" rows="3" dir="auto" aria-describedby="plan-ideas-hint"></textarea></div>
    </details>
  </div></li>`
}

/** ما يمنع البناء، بسببه وزرِّ علاجه — أو لا شيء. */
function blocker(d: PlanNewData, shown: readonly PlanPlatform[]): Html | null {
  if (!d.ready) {
    return html`<p class="hint m-0">مزوّدُ الكتابة غير مضبوط بعد.</p>
      <a class="btn btn-secondary btn-sm mt-2" href="${panelHref('providers')}">اضبط المزوّد</a>`
  }
  if (d.sources.length < 2) {
    return html`<p class="hint m-0">${d.sources.length === 0 ? 'لا مصدر محلَّل بعد' : 'مصدرٌ واحد محلَّل'} — والخطّةُ تحتاج اثنين على الأقلّ.</p>
      <a class="btn btn-secondary btn-sm mt-2" href="${panelHref('sources')}">حلّل مصادرك</a>`
  }
  if (shown.length === 0) return html`<p class="hint m-0">اربط منصّةً أوّلًا (الخطوة ٢).</p>`
  return null
}

function summaryStep(d: PlanNewData, shown: readonly PlanPlatform[]): Html {
  const stop = blocker(d, shown)
  // ‏التقديرُ الأوّلُ بالافتراض (شهر · إيقاعُ الموجز · الصورةُ كما في الإعداد)، والسكربتُ يعيده مع كلّ اختيار
  const preset = PACES.some((x) => x.n === d.perWeek) ? d.perWeek : Math.max(1, d.perWeek)
  const count = shown.length * preset * 4
  return html`<li><span class="step-n" aria-hidden="true">٤</span><div class="body">
    <span class="what">الملخّص</span>
    <p class="m-0" id="pn-sum" aria-live="polite" data-draft="${String(d.perDraft ?? 0)}" data-image="${String(d.perImage ?? 0)}">${summaryText(count, d, d.autoImage)}</p>
    <span class="why">صدى يقرأ المصادر ويكتب المنشورات ويرسم صورها، ثمّ تراجعها أنت. <b>ولا يُنشر شيءٌ قبل اعتمادك.</b></span>
    ${stop === null
      ? html`<div class="row mt-3"><button class="btn btn-primary" type="submit">حلّل وابنِ الخطّة</button></div>`
      : html`<div class="mt-3">${stop}</div>`}
  </div></li>`
}

function summaryText(count: number, d: PlanNewData, image: boolean): string {
  const unit = (d.perDraft ?? 0) + (image ? (d.perImage ?? 0) : 0)
  const cost = d.perDraft === null ? 'والكلفةُ تُقدَّر بعد أوّل كتابة' : 'نحو ' + money(count * unit)
  // ‏نصٌّ عاديٌّ يُهرَّب حين يُقحَم في القالب
  return AR(count) + ' منشورًا' + (image ? ' بصورها' : '') + ' · ' + cost
}

export function planNewScreen(d: PlanNewData): string {
  const start = weekStart(d.now)
  const shown = PLAN_NOW.filter((p) => d.linked.includes(p))
  const head = pageHead('المنشورات', 'خطّة جديدة', 'ثلاثةُ اختيارات، ثمّ يبني صدى الخطّة وتراجعها قبل أن يُنشر شيء.')
  const ways = html`<nav class="row gap-2 mb-4" aria-label="طريقة الخطّة">
      <a class="btn btn-primary btn-sm" href="/panel/plan/new" aria-current="page">ابنِ لي خطّة</a>
      <a class="btn btn-secondary btn-sm" href="${panelHref('plan-import')}">عندي خطّة</a></nav>`
  const form = html`<form method="POST" action="/panel/plan/generate" class="card pn" id="pn" data-busy="جار التحليل والبناء…"${d.replacing ? raw(' data-confirm="ستحلّ محلّ خطّتك لهذا المدى. أتمضي؟"') : ''}>
    <ol class="steps m-0">${spanStep(start)}${channelStep(d, shown)}${contentStep(d)}${summaryStep(d, shown)}</ol>
  </form>`
  return html`${raw(head)}${ways}${form}`.value
}

/**
 * الملخّصُ حيًّا: العددُ = مجموعُ إيقاع المنصّات المختارة × أسابيعُ المدى، والكلفةُ بوسيط ما أُنفق.
 * وبلا سكربتٍ يبقى ملخّصُ الافتراض صادقًا — والتقديرُ الكاملُ يُقال بعد البناء كما كان (D-257).
 */
export const PLAN_NEW_SCRIPT = `(function(){
  var f=document.getElementById('pn'), out=document.getElementById('pn-sum'); if(!f||!out)return;
  var perDraft=Number(out.getAttribute('data-draft'))||0, perImage=Number(out.getAttribute('data-image'))||0;
  function money(n){return '$'+(n<1?n.toFixed(3):n.toFixed(2));}
  function upd(){
    var span=f.querySelector('input[name="span"]:checked'), weeks=span?Number(span.getAttribute('data-weeks'))||1:4;
    var per=0;
    f.querySelectorAll('input[name="channel"]:checked').forEach(function(ch){
      var p=ch.value, pick=f.querySelector('input[name="cadence_'+p+'"]:checked'), n=pick?pick.value:'3';
      if(n==='custom'){var c=f.querySelector('input[name="cadence_custom_'+p+'"]'); n=c?c.value:'0';}
      per+=Math.max(0,Math.min(28,Math.floor(Number(n)||0)));
    });
    var img=!!f.querySelector('input[name="auto_image"][value="1"]:checked'), count=per*weeks;
    var cost=perDraft>0?'نحو '+money(count*(perDraft+(img?perImage:0))):'والكلفةُ تُقدَّر بعد أوّل كتابة';
    out.textContent=count.toLocaleString('ar-EG')+' منشورًا'+(img?' بصورها':'')+' · '+cost;
  }
  f.addEventListener('change',upd); f.addEventListener('input',upd); upd();
})();`

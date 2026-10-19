/**
 * شاشةُ الخطّ الزمنيّ — **المحفظةُ كلُّها على محورٍ واحد** (D-212).
 *
 * الصفوفُ: الخططُ الأسبوعيّة، ثمّ كلُّ منصّةٍ وتحتها حساباتُها. والعمودُ الأيّام، **ويجري
 * من اليمين كما يُقرأ السطر**: الماضي في البداية والقادمُ في النهاية، بخصائصَ منطقيّة
 * (`inset-inline-start` و`inline-size`) فلا ينقلب في صفحةٍ لاتينيّة (D-167).
 *
 * **والضبطُ رابطٌ ونموذجُ `GET` لا جافاسكربت** (D-046 · D-120): المدى والنافذةُ في العنوان،
 * فيُنسَخ ويُحفَظ، ويعمل قبل أن يُحمَّل سطرُ نصّ. **وكلُّ شريطٍ رابطٌ إلى رحلة منشوره**
 * (D-104) — فالشريطُ الذي يقول «تأخّر» يوصل إلى ما يقول لماذا.
 */
import { escapeHtml } from './escape'
import { counted, NOUNS } from '../../lib/format'
import { pageHead } from './parts'
import { sectionLabel } from './command'
import { resultsTabs } from './results'
import { emptyState } from './components/empty'
import { notice, toastRegion } from './components/toast'
import { dayRange, stamp } from '../../lib/time/zone'
import {
  PLAN_LABEL, SHIFT_LIMIT, SPANS, STATUS_LABEL,
  type GanttBar, type GanttChart, type GanttRow, type Span,
} from '../../lib/gantt'

export interface TimelineView {
  readonly chart: GanttChart
  readonly span: Span
  readonly shift: number
  readonly capped: boolean
  readonly cap: number
  readonly zone: string | null
  readonly now: Date
  readonly flash?: { readonly kind: 'ok' | 'warn' | 'bad'; readonly text: string } | null
}

const SPAN_LABEL: Readonly<Record<Span, string>> = { 14: 'أسبوعان', 30: '30 يومًا', 90: '90 يومًا' }

function href(span: Span, shift: number): string {
  const q = new URLSearchParams({ span: String(span) })
  if (shift !== 0) q.set('at', String(shift))
  return `/panel/timeline?${q.toString()}`
}

/** موضعٌ وعرضٌ بالنسبة المئويّة — **منطقيّان**، فالبدايةُ يمينٌ هنا ويسارٌ في صفحةٍ لاتينيّة. */
function place(start: number, end: number): string {
  return `inset-inline-start:${start}%;inline-size:${Math.max(0, end - start).toFixed(2)}%`
}

/** ما يُقال عن الشريط لقارئ الشاشة وفي التلميح — **الجملةُ كاملة**، لا الألوان. */
function describe(bar: GanttBar, isPlan: boolean, zone: string | null): string {
  if (isPlan) return `${bar.label} — ${PLAN_LABEL[bar.status] ?? bar.status}`
  const parts = [bar.label, STATUS_LABEL[bar.status] ?? bar.status, `كُتب ${stamp(bar.createdAt, zone)}`]
  if (bar.approvedAt !== null) parts.push(`اعتُمد ${stamp(bar.approvedAt, zone)}`)
  if (bar.at !== null) parts.push(`${bar.status === 'published' ? 'نُشر' : 'موعدُه'} ${stamp(bar.at, zone)}`)
  else if (bar.open) parts.push('بلا قرارٍ حتّى الآن')
  return parts.join(' · ')
}

function barHtml(bar: GanttBar, isPlan: boolean, zone: string | null): string {
  const text = describe(bar, isPlan, zone)
  const cls = [
    'gt-bar', bar.tone,
    bar.open ? 'open' : '',
    bar.clippedStart ? 'cut-s' : '',
    bar.clippedEnd ? 'cut-e' : '',
  ].filter((c) => c !== '').join(' ')
  // ‏الانتظارُ داخلَ الشريط: من حدّ الاعتماد إلى آخره — نسبةً من الشريط نفسِه
  const span = bar.end - bar.start
  const wait = bar.split === null || span <= 0
    ? ''
    : `<i class="gt-wait" style="inset-inline-start:${(((bar.split - bar.start) / span) * 100).toFixed(2)}%"></i>`
  const label = span >= 9 ? `<span class="gt-txt">${escapeHtml(bar.label)}</span>` : ''
  const mark = bar.mark === null
    ? ''
    : `<i class="gt-mark ${bar.tone}" style="inset-inline-start:${bar.mark}%" aria-hidden="true"></i>`
  // ‏**المجدولُ يُسحَب** (D-225، من Later): شريطُه يحمل معرّفَه وموعدَه، فيُنقل بالسحب يومًا أو أكثر بساعته نفسِها
  const move = !isPlan && bar.status === 'queued' && bar.at !== null
    ? ` data-move="${escapeHtml(bar.id)}" data-at="${escapeHtml(bar.at)}"`
    : ''
  return `<a class="${cls}" href="${escapeHtml(bar.href)}" style="${place(bar.start, bar.end)}"${move}
    title="${escapeHtml(text)}${move === '' ? '' : ' · اسحبه لتغيير اليوم'}" aria-label="${escapeHtml(text)}">${wait}${label}</a>${mark}`
}

function rowHtml(row: GanttRow, isPlan: boolean, d: TimelineView): string {
  const now = d.chart.now === null ? '' : `<i class="gt-now" style="inset-inline-start:${d.chart.now}%" aria-hidden="true"></i>`
  const tiers = row.tiers
    .map((t) => `<div class="gt-tier">${t.map((b) => barHtml(b, isPlan, d.zone)).join('')}</div>`)
    .join('')
  // ‏صفُّ رسمٍ لا فقرة (D-213): `div` بدور القائمة، فلا يقيسه مدقّقُ طول السطر كأنّه نصٌّ يُقرأ
  return `<div class="gt-row" role="listitem">
    <div class="gt-lab"><span class="gt-name">${escapeHtml(row.label)}</span>
      <span class="gt-n">${escapeHtml(isPlan ? counted(row.count, NOUNS.plan) : counted(row.count, NOUNS.post))}</span></div>
    <div class="gt-track">${now}${tiers}</div>
  </div>`
}

function axis(d: TimelineView): string {
  const ticks = d.chart.ticks
    .map((t) => `<span class="gt-tick${t.major ? ' major' : ''}" style="inset-inline-start:${t.at}%">${escapeHtml(t.label)}</span>`)
    .join('')
  const now = d.chart.now === null
    ? ''
    : `<span class="gt-tick gt-today" style="inset-inline-start:${d.chart.now}%">اليوم</span>`
  return `<div class="gt-axis" aria-hidden="true"><div class="gt-lab"></div><div class="gt-track">${ticks}${now}</div></div>`
}

function legend(): string {
  const item = (cls: string, text: string): string =>
    `<span class="gt-key"><i class="gt-sw ${cls}"></i>${escapeHtml(text)}</span>`
  return `<div class="legend gt-legend">
    ${item('pending', 'تنتظر قرارك')}${item('warn', 'معتمَدة أو مجدولة')}${item('ok', 'نُشرت')}${item('bad', 'فشل النشر')}${item('idle', 'مرفوضة')}
    <span class="gt-key"><i class="gt-sw split"></i>الجزءُ الأغمق: انتظارُ الموعد بعد الاعتماد</span>
    <span class="gt-key"><i class="gt-sw mark"></i>موعدُ النشر أو لحظتُه</span>
  </div>`
}

function controls(d: TimelineView): string {
  const prev = d.shift > -SHIFT_LIMIT
    ? `<a class="btn btn-secondary btn-sm" href="${escapeHtml(href(d.span, d.shift - 1))}" rel="prev">النافذةُ السابقة</a>`
    : ''
  const next = d.shift < SHIFT_LIMIT
    ? `<a class="btn btn-secondary btn-sm" href="${escapeHtml(href(d.span, d.shift + 1))}" rel="next">النافذةُ التالية</a>`
    : ''
  const today = d.shift === 0 ? '' : `<a class="btn btn-secondary btn-sm" href="${escapeHtml(href(d.span, 0))}">إلى اليوم</a>`
  const options = SPANS.map((s) =>
    `<option value="${s}"${s === d.span ? ' selected' : ''}>${escapeHtml(SPAN_LABEL[s])}</option>`).join('')
  return `<div class="card">
    <div class="split">
      <form class="row gt-form" method="GET" action="/panel/timeline">
        <div class="field"><label for="gt-span">المدى</label>
          <select id="gt-span" name="span">${options}</select></div>
        <button class="btn btn-primary" type="submit">اعرض</button>
      </form>
      <div class="row acts">${prev}${today}${next}</div>
    </div>
  </div>`
}

function stats(d: TimelineView): string {
  const s = d.chart.summary
  const one = (n: number, label: string): string => `<span class="stat"><b>${n}</b>${escapeHtml(label)}</span>`
  return `<div class="stats">${one(s.total, 'في النافذة')}${one(s.published, 'نُشرت')}${
    one(s.upcoming, 'قادمة')}${one(s.waiting, 'تنتظر قرارك')}${one(s.failed, 'فشلت')}</div>`
}

export function timelineScreen(d: TimelineView): string {
  const c = d.chart
  const last = new Date(c.to.getTime() - 1)
  const range = dayRange(c.from, last, d.zone, d.now)
  const groups = c.groups.map((g) => {
    const isPlan = g.key === 'plans'
    return `<section class="gt-grp" aria-label="${escapeHtml(g.label)}">
      <h3 class="gt-gh">${escapeHtml(g.label)}</h3>
      <div class="gt-rows" role="list">${g.rows.map((r) => rowHtml(r, isPlan, d)).join('')}</div>
    </section>`
  }).join('')

  const empty = emptyState({
    title: 'لا منشورَ في هذه النافذة',
    html: `النافذةُ ${escapeHtml(range)}. قلّبها إلى ما قبلها أو ما بعدها، أو وسّع المدى —
      أو اكتب مسوّدةً من «المنشورات» فتظهر هنا من يومِ كتابتها.`,
  })

  const flash = toastRegion(d.flash === undefined || d.flash === null
    ? ''
    : notice({ tone: d.flash.kind, html: escapeHtml(d.flash.text), alert: d.flash.kind === 'bad',
        g: d.flash.kind === 'ok' ? '●' : d.flash.kind === 'warn' ? '!' : '▲' }))
  return `${flash}${resultsTabs('timeline')}
  ${pageHead('المحفظة', 'الخطّ الزمنيّ', `كلُّ منشورٍ في كلّ حسابٍ شريطٌ من كتابته إلى خروجه، والخططُ الأسبوعيّةُ فوقها.
    <b>والشريطُ رابطٌ إلى رحلته</b>، والمجدولُ يُسحَب إلى يومٍ آخر.`)}
  ${controls(d)}
  <div class="card mt-3">
    <div class="split">
      <h2>${escapeHtml(range)}</h2>
      <span class="note">${escapeHtml(counted(c.days, NOUNS.day))}${
        d.capped ? ` · بلغ السقفَ (${escapeHtml(String(d.cap))}) فطُوي ما بعده` : ''}</span>
    </div>
    ${stats(d)}
    ${c.groups.length === 0
      ? empty
      : `${legend()}
    <div class="gt-wrap"><div class="gt" data-days="${c.days}">${axis(d)}${groups}</div></div>
    <form id="gt-move" method="POST" action="/panel/drafts/reschedule" hidden>
      <input type="hidden" name="id"><input type="hidden" name="when">
      <input type="hidden" name="from" value="timeline"><input type="hidden" name="back" value="${escapeHtml(href(d.span, d.shift))}"></form>
    <p class="hint">التواريخُ ${d.zone === null ? 'بتوقيت الرياض' : 'بتوقيتك'}. والشريطُ المفتوحُ الطرفِ يمتدّ خارجَ النافذة،
      والمتقطّعُ مسوّدةٌ لم يُقرَّر فيها فنهايتُه «الآن».</p>`}
  </div>`
}

/** اسمُ الصفحة من الفهرس (D-166) — **و«الخطّ الزمنيّ» تبويبٌ في «النتائج» لا وجهةٌ ثامنة**. */
export function timelineTitle(): string {
  return `صدى — ${sectionLabel('results')} · الخطّ الزمنيّ`
}

/**
 * ‏**سحبُ المجدول إلى يومٍ آخر** (D-225، من Later): كان تغييرُ الموعد ستَّ خطوات (ر-9). فالشريطُ المعلَّم `data-move`
 * ‏يُسحَب أفقيًّا، ويُحسَب الفرقُ أيّامًا كاملة من عرض اليوم في المسار، والساعةُ تبقى. وعند الإفلات يُرسَل نموذجُ
 * ‏`reschedule` نفسُه بـ`when` (UTC)، **والخادمُ الحَكَم** بحرّاسه كما في المحرّر. ونقرةٌ بلا سحبٍ تفتح الرحلةَ كما كانت.
 */
export const TIMELINE_SCRIPT = `(function(){
  var gt=document.querySelector('.gt[data-days]'), form=document.getElementById('gt-move');
  if(!gt||!form)return;
  var days=+gt.getAttribute('data-days')||1, rtl=getComputedStyle(gt).direction==='rtl';
  gt.querySelectorAll('a[data-move]').forEach(function(a){
    var x0=0, moved=0, on=false, id=0;
    var track=a.closest('.gt-track');
    a.addEventListener('pointerdown',function(e){if(e.button!==0)return; on=true; moved=0; x0=e.clientX; id=e.pointerId;});
    a.addEventListener('pointermove',function(e){
      if(!on||e.pointerId!==id)return;
      var dx=e.clientX-x0; if(Math.abs(dx)>4&&!a.hasPointerCapture(id))a.setPointerCapture(id);
      var w=track?track.getBoundingClientRect().width/days:40;
      moved=Math.round((rtl?-dx:dx)/w);
      a.style.translate=dx+'px 0';
    });
    var end=function(){
      if(!on)return; on=false; a.style.translate='';
      if(moved===0)return;
      var at=new Date(a.getAttribute('data-at').replace(' ','T')+(/Z|[+-]\\d\\d:?\\d\\d$/.test(a.getAttribute('data-at'))?'':'Z'));
      if(isNaN(at.getTime()))return;
      form.elements.namedItem('id').value=a.getAttribute('data-move');
      form.elements.namedItem('when').value=new Date(at.getTime()+moved*864e5).toISOString().slice(0,16);
      form.submit();
    };
    a.addEventListener('pointerup',end); a.addEventListener('pointercancel',function(){moved=0; end();});
    a.addEventListener('click',function(e){if(moved!==0){e.preventDefault();}});
  });
})();`

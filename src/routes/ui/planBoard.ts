/**
 * **الخطّةُ لوحةً أو قائمة** (D-259) — عرضان للبنود نفسِها، والمالكُ يختار.
 *
 * - **اللوحة** (كانبان): عمودٌ لكلّ يوم (أو لكلّ أسبوعٍ في خطّة الشهر)، والبطاقةُ تُسحَب إلى يومٍ آخر فينتقل موعدُها. من Trello
 *   وLater وNotion: السحبُ لما يُفهم بالعين، **والقائمةُ لما يُكتب بدقّة**.
 * - **القائمة**: البطاقاتُ صفوفًا تحت أيّامها، وفي كلٍّ حقولُها (اليوم والمنصّة والساعة) — وهي طريقُ لوحة المفاتيح وقارئ الشاشة،
 *   وتعمل بلا سكربت نموذجًا عاديًّا.
 *
 * **والبطاقةُ تُقرأ في خمس ثوانٍ**: المنصّةُ بشعارها ولونها أوّلًا، ثمّ الزاوية سطرين، ثمّ الساعةُ والمصدر. ولا شيءَ غيرها ظاهر؛
 * التعديلُ تحت «عدّل». والحركةُ ارتفاعٌ وميلٌ خفيف عند المرور، وظلٌّ يتبع الإصبعَ عند السحب، وانتقالُ عرضٍ بين اللوحة والقائمة —
 * **وكلُّها تسقط مع تقليل الحركة**.
 */
import { escapeHtml } from './escape'
import { LOGOS } from './logos'
import { platformLabel } from '../../lib/oauth/providers'
import { dayLabel } from '../../lib/time/zone'
import { spanDays } from '../../lib/plan/prompt'
import { kindChip } from './sections/plan'
import { ANGLE_MAX, PLAN_PLATFORMS } from '../../lib/plan/edit'
import type { StoredPlan } from '../../lib/plan/job'

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

const label = (day: string, withName = true): string =>
  withName ? dayLabel(`${day} 12:00:00`, null, false) : day.slice(8, 10)

/** العروضُ الخمسة — من Notion وAsana وMonday: لوحةٌ بالأيّام، ولوحةٌ بالمنصّات، وتقويم، وقائمة، وجدول. */
export const PLAN_VIEWS = [
  { id: 'days', label: 'أيّام' },
  { id: 'platforms', label: 'منصّات' },
  { id: 'calendar', label: 'تقويم' },
  { id: 'list', label: 'قائمة' },
  { id: 'table', label: 'جدول' },
] as const

type Item = StoredPlan['plan']['items'][number]

export function planBoard(plan: StoredPlan, names: Readonly<Record<string, string>>, sources: readonly { readonly id: string; readonly name: string }[] = []): string {
  // ‏أسبوعٌ بعمودٍ لكلّ يوم، وما فوقه (أسبوعان وشهرٌ وشهران — D-282) بعمودٍ لكلّ أسبوع
  const days = Array.from({ length: spanDays(plan.span ?? 'week') }, (_, i) => addDays(plan.week, i))
  const weeks = days.length / 7
  const month = weeks > 1
  const items = plan.plan.items.map((item, index) => ({ item, index }))
  const width = month ? 7 : 1

  const dayOptions = (sel: string): string =>
    days.map((d) => `<option value="${d}"${d === sel ? ' selected' : ''}>${escapeHtml(label(d))}</option>`).join('')
  const platOptions = (sel: string): string =>
    PLAN_PLATFORMS.map((p) => `<option value="${p}"${p === sel ? ' selected' : ''}>${escapeHtml(platformLabel(p))}</option>`).join('')
  const plat = (p: string): string => `<span class="pb-plat">${LOGOS[p] ?? ''}<b>${escapeHtml(platformLabel(p as never))}</b></span>`
  const edit = (item: Item, index: number): string => `<details class="pb-more"><summary>عدّل</summary>
        <form class="pb-edit" method="POST" action="/panel/plan/item">
          <input type="hidden" name="id" value="${escapeHtml(plan.id)}"><input type="hidden" name="index" value="${index}">
          <label>اليوم <select name="day">${dayOptions(item.day)}</select></label>
          <label>المنصّة <select name="platform">${platOptions(item.platform)}</select></label>
          <label>الساعة <input type="time" name="time" value="${escapeHtml(item.time)}" dir="ltr"></label>
          <label>الزاوية <textarea name="angle" rows="2" maxlength="${ANGLE_MAX}" dir="auto">${escapeHtml(item.angle)}</textarea></label>
          <button class="btn btn-secondary btn-sm" type="submit">احفظ</button>
        </form>
        <form class="inline" method="POST" action="/panel/plan/item/remove" data-confirm="احذف هذا البند من الخطّة؟">
          <input type="hidden" name="id" value="${escapeHtml(plan.id)}"><input type="hidden" name="index" value="${index}">
          <button class="btn btn-danger btn-sm" type="submit">احذف البند</button></form></details>`

  /**
   * **محتوى البند بثلاثة أزرار** (D-260): «ولّد» (الافتراض: يكتبه صدى ويرسم صورته)، و«ارفع» (ملفُّك يُحفظ في المكتبة ويُربط)،
   * و«المكتبة» (ما رُفع أو وُلّد أو في Drive من قبل). والمختارُ عليه علامةُ `aria-pressed`، فيُقرأ حالُ البند من نظرة.
   */
  const content = (item: Item, index: number): string => {
    const pick = `/panel/assets?plan=${encodeURIComponent(plan.id)}&index=${index}`
    const chosen = item.asset !== undefined
    return `<div class="row gap-2 mt-2" role="group" aria-label="محتوى البند">
      <form class="inline" method="POST" action="/panel/plan/item">
        <input type="hidden" name="id" value="${escapeHtml(plan.id)}"><input type="hidden" name="index" value="${index}"><input type="hidden" name="asset" value="">
        <button class="btn btn-secondary btn-sm" type="submit" aria-pressed="${!chosen}">ولّد</button></form>
      <a class="btn btn-secondary btn-sm" href="${escapeHtml(pick)}#upload">ارفع</a>
      <a class="btn btn-secondary btn-sm" href="${escapeHtml(pick)}" aria-pressed="${chosen}">الأصول${chosen ? ' ✓' : ''}</a>
    </div>`
  }

  const card = (item: Item, index: number, opts: { showDay: boolean; editable: boolean }): string => {
    const offset = Math.max(0, days.indexOf(item.day))
    return `<article class="card card-inset pb-card" data-drag data-index="${index}" data-offset="${offset % width}" data-platform="${escapeHtml(item.platform)}" tabindex="0"
        aria-label="${escapeHtml(`${platformLabel(item.platform)} — ${item.angle} — ${label(item.day)} ${item.time}`)}">
      <div class="pb-top">${plat(item.platform)}${kindChip(item.kind).value}
        <span class="pb-time">${opts.showDay ? `${escapeHtml(label(item.day))} · ` : ''}<bdi dir="ltr">${escapeHtml(item.time)}</bdi></span></div>
      <p class="pb-angle" dir="auto">${escapeHtml(item.angle)}</p>
      <div class="pb-src"><bdi>${escapeHtml(names[item.sourceId] ?? 'مصدر')}</bdi></div>
      ${opts.editable ? `${content(item, index)}${edit(item, index)}` : ''}
    </article>`
  }
  const column = (attrs: string, title: string, sub: string, list: readonly { item: Item; index: number }[], opts: { showDay: boolean; editable: boolean }): string =>
    `<section class="pb-col" ${attrs} aria-label="${escapeHtml(title)}">
      <h3 class="pb-head">${title}${sub === '' ? '' : ` <span class="ago">${escapeHtml(sub)}</span>`}<span class="count">${list.length}</span></h3>
      <div class="pb-drop">${list.map(({ item, index }) => card(item, index, opts)).join('')}</div>
    </section>`

  // ١ · أيّام: عمودٌ لكلّ يوم، أو لكلّ أسبوعٍ في الشهر (والبطاقةُ تحفظ يومَها من أسبوعه)
  const dayCols = (editable: boolean): string => (month
    ? Array.from({ length: weeks }, (_, w) => ({ key: days[w * 7]!, title: `الأسبوع ${w + 1}`, sub: `من ${label(days[w * 7]!)}`, from: w * 7 }))
    : days.map((d, i) => ({ key: d, title: escapeHtml(label(d)), sub: '', from: i }))
  ).map((col) => column(`data-drop data-day="${col.key}" data-width="${width}"`, col.title, col.sub,
    items.filter(({ item }) => { const i = days.indexOf(item.day); return i >= col.from && i < col.from + width }),
    { showDay: month, editable })).join('')

  // ٢ · منصّات: عمودٌ لكلّ منصّة، والسحبُ إليه يبدّل المنصّة
  const platformCols = PLAN_PLATFORMS.map((p) => column(`data-drop data-set-platform="${p}"`, plat(p), '',
    items.filter(({ item }) => item.platform === p), { showDay: true, editable: false })).join('')

  // ٣ · تقويم: أسابيعُ صفوفًا وأيّامٌ أعمدة، والسحبُ إلى خانةٍ يضع اليومَ بعينه
  const weekdays = days.slice(0, 7).map((d) => `<div class="pb-wd">${escapeHtml(label(d).split(' ')[0] ?? '')}</div>`).join('')
  const cells = days.map((d) => {
    const list = items.filter(({ item }) => item.day === d)
    return `<div class="pb-col pb-cell" data-drop data-day="${d}" data-width="1" aria-label="${escapeHtml(label(d))}">
      <span class="pb-dn">${escapeHtml(label(d, false))}</span><span class="pb-dl">${escapeHtml(label(d))}</span>
      ${list.map(({ item, index }) => `<div class="card card-inset pb-card pb-chip" data-drag data-index="${index}" data-offset="0" data-platform="${escapeHtml(item.platform)}" tabindex="0"
          title="${escapeHtml(item.angle)}">${LOGOS[item.platform] ?? ''}<bdi dir="ltr">${escapeHtml(item.time)}</bdi><span class="pb-ct">${escapeHtml(item.angle)}</span></div>`).join('')}
    </div>`
  }).join('')

  // ٥ · جدول: سطرٌ لكلّ بند، مرتّبًا بالموعد
  const rows = [...items].sort((a, b) => `${a.item.day}${a.item.time}`.localeCompare(`${b.item.day}${b.item.time}`)).map(({ item }) => `<tr>
      <td>${escapeHtml(label(item.day))}</td><td><bdi dir="ltr">${escapeHtml(item.time)}</bdi></td><td>${plat(item.platform)}</td>
      <td dir="auto">${escapeHtml(item.angle)}</td><td><bdi>${escapeHtml(names[item.sourceId] ?? 'مصدر')}</bdi></td>
      <td>${kindChip(item.kind).value} ${item.asset === undefined ? 'يُولَّد' : 'من الأصول'}</td></tr>`).join('')

  /** **أضف بندًا** (D-264): مصدرٌ من مصادر العميل، ويومٌ ومنصّةٌ وساعةٌ وزاوية — يُلحق آخرَ الخطّة. */
  const addForm = (): string => sources.length === 0 ? '' : `<details class="pb-more mb-4"><summary>أضف بندًا</summary>
      <form class="pb-edit mt-2" method="POST" action="/panel/plan/item/add">
        <input type="hidden" name="id" value="${escapeHtml(plan.id)}">
        <label>المصدر <select name="source">${sources.map((x) => `<option value="${escapeHtml(x.id)}">${escapeHtml(x.name)}</option>`).join('')}</select></label>
        <label>اليوم <select name="day">${dayOptions(days[0]!)}</select></label>
        <label>المنصّة <select name="platform">${platOptions('linkedin')}</select></label>
        <label>الساعة <input type="time" name="time" value="07:00" dir="ltr"></label>
        <label>الزاوية <textarea name="angle" rows="2" maxlength="${ANGLE_MAX}" dir="auto" required></textarea></label>
        <button class="btn btn-primary btn-sm" type="submit">أضف</button>
      </form></details>`

  const views = PLAN_VIEWS.map((v, i) => `<button class="btn btn-secondary btn-sm" type="button" data-view="${v.id}" aria-pressed="${i === 0}">${v.label}</button>`).join('')

  return `<div class="card mt-4" id="board" data-plan="${escapeHtml(plan.id)}">
    <div class="split"><h2>الخطّة ${weeks === 1 ? 'أسبوعًا' : weeks === 2 ? 'أسبوعين' : weeks === 4 ? 'شهرًا' : 'شهرين'} <span class="count">${items.length}</span></h2>
      <div class="row gap-2" role="group" aria-label="طريقة العرض">${views}</div></div>
    <p class="hint m-0 mb-4">اسحب البطاقةَ إلى يومٍ أو منصّةٍ لتنقلها، أو «عدّل» في القائمة. والساعةُ بتوقيت UTC كما يكتبها المخطِّط.</p>
    ${addForm()}
    <div class="pb-board" data-mode="board" data-pv="days">${dayCols(true)}</div>
    <div class="pb-board" data-mode="board" data-pv="platforms" hidden>${platformCols}</div>
    <div class="pb-cal" data-pv="calendar" hidden>${weekdays}${cells}</div>
    <div class="pb-board" data-mode="list" data-pv="list" hidden>${dayCols(true)}</div>
    <div class="scroll" data-pv="table" hidden><table>
      <thead><tr><th>اليوم</th><th>الساعة</th><th>المنصّة</th><th>الزاوية</th><th>المصدر</th><th>المحتوى</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
  </div>`
}

/**
 * سكربتُ اللوحة: **السحبُ بالمؤشّر** (فأرةٌ وإصبعٌ معًا، فـ HTML5 drag لا يعمل باللمس)، وتبديلُ العرض بانتقالٍ، وحفظُ ما يتغيّر
 * بـ `fetch` يطلب JSON. وما يُرفض يعيد البطاقةَ إلى عمودها. **والقائمةُ لا تحتاجه**: نموذجُها يُرسل كما هو.
 */
export const PLAN_BOARD_SCRIPT = `(function(){
  var root=document.getElementById('board'); if(!root)return;
  var plan=root.getAttribute('data-plan');
  var csrf=(document.querySelector('input[name="_csrf"]')||{}).value||'';
  var reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  var VIEWS=['days','platforms','calendar','list','table'], stale=false;
  function show(v,anim){
    if(VIEWS.indexOf(v)<0)v='days';
    // ‏ما تغيّر في عرضٍ يُرى في غيره بعد تحديث الصفحة: تُحفظ الوجهةُ ثمّ تُحمَّل
    if(stale&&anim){try{localStorage.setItem('pb-view',v);}catch(e){} location.reload(); return;}
    var go=function(){
      root.querySelectorAll('[data-pv]').forEach(function(p){p.hidden=p.getAttribute('data-pv')!==v;});
      root.querySelectorAll('[data-view]').forEach(function(b){b.setAttribute('aria-pressed',String(b.getAttribute('data-view')===v));});
    };
    if(anim&&!reduce&&document.startViewTransition)document.startViewTransition(go); else go();
    try{localStorage.setItem('pb-view',v);}catch(e){}
  }
  try{show(localStorage.getItem('pb-view')||'days',false);}catch(e){}
  root.querySelectorAll('[data-view]').forEach(function(b){b.addEventListener('click',function(){show(b.getAttribute('data-view'),true);});});
  function save(fields){
    var fd=new FormData(); fd.set('_csrf',csrf); fd.set('id',plan);
    Object.keys(fields).forEach(function(k){fd.set(k,fields[k]);});
    return fetch('/panel/plan/item',{method:'POST',body:fd,headers:{Accept:'application/json'},credentials:'same-origin'})
      .then(function(r){return r.ok;}).catch(function(){return false;});
  }
  function recount(){root.querySelectorAll('[data-drop]').forEach(function(c){var n=c.querySelector('.count'); if(n)n.textContent=c.querySelectorAll('[data-drag]').length;});}
  function addDays(d,n){var x=new Date(d+'T00:00:00Z'); x.setUTCDate(x.getUTCDate()+n); return x.toISOString().slice(0,10);}
  function target(zone,card){
    if(zone.hasAttribute('data-set-platform'))return {platform:zone.getAttribute('data-set-platform')};
    var w=+zone.getAttribute('data-width')||1;
    return {day:addDays(zone.getAttribute('data-day'),w>1?(+card.getAttribute('data-offset')||0):0)};
  }
  root.querySelectorAll('[data-drag]').forEach(function(card){
    var ghost=null, x0=0, y0=0, on=false, over=null, home=null;
    card.addEventListener('pointerdown',function(e){
      if(e.button!==0||card.closest('[data-mode="list"]')||e.target.closest('details,select,input,button,a'))return;
      on=true; x0=e.clientX; y0=e.clientY; home=card.parentNode;
    });
    card.addEventListener('pointermove',function(e){
      if(!on)return;
      if(!ghost){
        if(Math.abs(e.clientX-x0)+Math.abs(e.clientY-y0)<6)return;
        card.setPointerCapture(e.pointerId);
        var r=card.getBoundingClientRect(); ghost=card.cloneNode(true); ghost.classList.add('pb-ghost');
        ghost.style.width=r.width+'px'; document.body.appendChild(ghost); card.classList.add('dragging');
      }
      ghost.style.left=(e.clientX-ghost.offsetWidth/2)+'px'; ghost.style.top=(e.clientY-20)+'px';
      var el=document.elementFromPoint(e.clientX,e.clientY), zone=el&&el.closest('[data-drop]');
      if(zone!==over){if(over)over.classList.remove('over'); over=zone; if(over)over.classList.add('over');}
    });
    function end(){
      if(!on)return; on=false;
      if(ghost){ghost.remove(); ghost=null;}
      card.classList.remove('dragging');
      var zone=over; over=null; if(zone)zone.classList.remove('over');
      if(!zone)return;
      var into=zone.querySelector('.pb-drop')||zone;
      if(into===home)return;
      var fields=target(zone,card); fields.index=card.getAttribute('data-index');
      into.appendChild(card); recount();
      if(fields.platform)card.setAttribute('data-platform',fields.platform);
      card.classList.add('landed'); setTimeout(function(){card.classList.remove('landed');},400);
      save(fields).then(function(ok){ if(!ok){home.appendChild(card); recount();} else stale=true; });
    }
    card.addEventListener('pointerup',end); card.addEventListener('pointercancel',end);
  });
  root.querySelectorAll('.pb-edit select[name="platform"]').forEach(function(s){
    s.addEventListener('change',function(){
      var card=s.closest('[data-drag]');
      save({index:card.getAttribute('data-index'),platform:s.value}).then(function(ok){if(ok)location.reload();});
    });
  });
})();`

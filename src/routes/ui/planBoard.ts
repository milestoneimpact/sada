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
import { PLAN_PLATFORMS } from '../../lib/plan/edit'
import type { StoredPlan } from '../../lib/plan/job'

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

const label = (day: string, withName = true): string =>
  withName ? dayLabel(`${day} 12:00:00`, null, false) : day.slice(8, 10)

export function planBoard(plan: StoredPlan, names: Readonly<Record<string, string>>): string {
  const month = plan.span === 'month'
  const days = Array.from({ length: spanDays(plan.span ?? 'week') }, (_, i) => addDays(plan.week, i))
  // ‏أعمدةُ الأسبوع أيّامُه السبعة، وأعمدةُ الشهر أسابيعُه الأربعة
  const columns = month
    ? [0, 1, 2, 3].map((w) => ({ key: days[w * 7]!, title: `الأسبوع ${w + 1}`, sub: `من ${label(days[w * 7]!)}`, from: w * 7 }))
    : days.map((d, i) => ({ key: d, title: label(d), sub: '', from: i }))
  const width = month ? 7 : 1

  const dayOptions = (sel: string): string =>
    days.map((d) => `<option value="${d}"${d === sel ? ' selected' : ''}>${escapeHtml(label(d))}</option>`).join('')
  const platOptions = (sel: string): string =>
    PLAN_PLATFORMS.map((p) => `<option value="${p}"${p === sel ? ' selected' : ''}>${escapeHtml(platformLabel(p))}</option>`).join('')

  const card = (item: StoredPlan['plan']['items'][number], index: number): string => {
    const offset = Math.max(0, days.indexOf(item.day))
    return `<article class="card card-inset pb-card" data-index="${index}" data-offset="${offset % width}" data-platform="${escapeHtml(item.platform)}" tabindex="0"
        aria-label="${escapeHtml(`${platformLabel(item.platform)} — ${item.angle} — ${label(item.day)} ${item.time}`)}">
      <div class="pb-top"><span class="pb-plat">${LOGOS[item.platform] ?? ''}<b>${escapeHtml(platformLabel(item.platform))}</b></span>
        <span class="pb-time">${month ? `${escapeHtml(label(item.day))} · ` : ''}<bdi dir="ltr">${escapeHtml(item.time)}</bdi></span></div>
      <p class="pb-angle" dir="auto">${escapeHtml(item.angle)}</p>
      <div class="pb-src"><bdi>${escapeHtml(names[item.sourceId] ?? 'مصدر')}</bdi></div>
      <details class="pb-more"><summary>عدّل</summary>
        <form class="pb-edit" method="POST" action="/panel/plan/item">
          <input type="hidden" name="id" value="${escapeHtml(plan.id)}"><input type="hidden" name="index" value="${index}">
          <label>اليوم <select name="day">${dayOptions(item.day)}</select></label>
          <label>المنصّة <select name="platform">${platOptions(item.platform)}</select></label>
          <label>الساعة <input type="time" name="time" value="${escapeHtml(item.time)}" dir="ltr"></label>
          <button class="btn btn-secondary btn-sm" type="submit">احفظ</button>
        </form></details>
    </article>`
  }

  const cols = columns.map((col) => {
    const mine = plan.plan.items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => { const i = days.indexOf(item.day); return i >= col.from && i < col.from + width })
    return `<section class="pb-col" data-day="${col.key}" aria-label="${escapeHtml(col.title)}">
      <h3 class="pb-head">${escapeHtml(col.title)}${col.sub === '' ? '' : ` <span class="ago">${escapeHtml(col.sub)}</span>`}
        <span class="count">${mine.length}</span></h3>
      <div class="pb-drop">${mine.map(({ item, index }) => card(item, index)).join('')}</div>
    </section>`
  }).join('')

  return `<div class="card mt-4" id="board" data-plan="${escapeHtml(plan.id)}">
    <div class="split"><h2>الخطّة ${month ? 'شهرًا' : 'أسبوعًا'}</h2>
      <div class="row gap-2" role="group" aria-label="طريقة العرض">
        <button class="btn btn-secondary btn-sm" type="button" data-view="board" aria-pressed="true">لوحة</button>
        <button class="btn btn-secondary btn-sm" type="button" data-view="list" aria-pressed="false">قائمة</button></div></div>
    <p class="hint m-0 mb-4">اسحب البطاقةَ إلى ${month ? 'أسبوعٍ' : 'يومٍ'} آخر لتنقلها، أو افتح «عدّل» لليوم والمنصّة والساعة.
      والساعةُ بتوقيت UTC كما يكتبها المخطِّط.</p>
    <div class="pb-board" data-mode="board">${cols}</div>
  </div>`
}

/**
 * سكربتُ اللوحة: **السحبُ بالمؤشّر** (فأرةٌ وإصبعٌ معًا، فـ HTML5 drag لا يعمل باللمس)، وتبديلُ العرض بانتقالٍ، وحفظُ ما يتغيّر
 * بـ `fetch` يطلب JSON. وما يُرفض يعيد البطاقةَ إلى عمودها. **والقائمةُ لا تحتاجه**: نموذجُها يُرسل كما هو.
 */
export const PLAN_BOARD_SCRIPT = `(function(){
  var root=document.getElementById('board'); if(!root)return;
  var board=root.querySelector('.pb-board'), plan=root.getAttribute('data-plan');
  var csrf=(document.querySelector('input[name="_csrf"]')||{}).value||'';
  var reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  function mode(m,anim){
    var go=function(){board.setAttribute('data-mode',m);
      root.querySelectorAll('[data-view]').forEach(function(b){b.setAttribute('aria-pressed',String(b.getAttribute('data-view')===m));});};
    if(anim&&!reduce&&document.startViewTransition)document.startViewTransition(go); else go();
    try{localStorage.setItem('pb-view',m);}catch(e){}
  }
  try{var saved=localStorage.getItem('pb-view'); if(saved==='list'||saved==='board')mode(saved,false);}catch(e){}
  root.querySelectorAll('[data-view]').forEach(function(b){b.addEventListener('click',function(){mode(b.getAttribute('data-view'),true);});});
  function save(fields){
    var fd=new FormData(); fd.set('_csrf',csrf); fd.set('id',plan);
    Object.keys(fields).forEach(function(k){fd.set(k,fields[k]);});
    return fetch('/panel/plan/item',{method:'POST',body:fd,headers:{Accept:'application/json'},credentials:'same-origin'})
      .then(function(r){return r.ok;}).catch(function(){return false;});
  }
  function recount(){root.querySelectorAll('.pb-col').forEach(function(c){var n=c.querySelector('.count'); if(n)n.textContent=c.querySelectorAll('.pb-card').length;});}
  function addDays(d,n){var x=new Date(d+'T00:00:00Z'); x.setUTCDate(x.getUTCDate()+n); return x.toISOString().slice(0,10);}
  board.querySelectorAll('.pb-card').forEach(function(card){
    var ghost=null, x0=0, y0=0, on=false, over=null, home=null;
    card.addEventListener('pointerdown',function(e){
      if(e.button!==0||board.getAttribute('data-mode')!=='board'||e.target.closest('details,select,input,button,a'))return;
      on=true; x0=e.clientX; y0=e.clientY; home=card.parentNode;
    });
    card.addEventListener('pointermove',function(e){
      if(!on)return;
      if(!ghost){
        if(Math.abs(e.clientX-x0)+Math.abs(e.clientY-y0)<6)return;
        card.setPointerCapture(e.pointerId);
        var r=card.getBoundingClientRect(); ghost=card.cloneNode(true); ghost.classList.add('pb-ghost');
        ghost.style.width=r.width+'px'; ghost.removeAttribute('id'); document.body.appendChild(ghost); card.classList.add('dragging');
      }
      ghost.style.left=(e.clientX-ghost.offsetWidth/2)+'px'; ghost.style.top=(e.clientY-20)+'px';
      var el=document.elementFromPoint(e.clientX,e.clientY), col=el&&el.closest('.pb-col');
      if(col!==over){if(over)over.classList.remove('over'); over=col; if(over)over.classList.add('over');}
    });
    function end(){
      if(!on)return; on=false;
      if(ghost){ghost.remove(); ghost=null;}
      card.classList.remove('dragging');
      if(over){over.classList.remove('over');}
      var col=over; over=null;
      if(!col||col.querySelector('.pb-drop')===home)return;
      var day=addDays(col.getAttribute('data-day'),+card.getAttribute('data-offset')||0);
      col.querySelector('.pb-drop').appendChild(card); recount();
      card.classList.add('landed'); setTimeout(function(){card.classList.remove('landed');},400);
      save({index:card.getAttribute('data-index'),day:day}).then(function(ok){
        if(!ok){home.appendChild(card); recount();}
        else{var s=card.querySelector('select[name="day"]'); if(s)s.value=day;}
      });
    }
    card.addEventListener('pointerup',end); card.addEventListener('pointercancel',end);
  });
  // ‏والمنصّةُ تُحفظ حين تُختار، ولونُ البطاقة يتبعها
  board.querySelectorAll('.pb-edit select[name="platform"]').forEach(function(s){
    s.addEventListener('change',function(){
      var card=s.closest('.pb-card');
      save({index:card.getAttribute('data-index'),platform:s.value}).then(function(ok){if(ok)location.reload();});
    });
  });
})();`

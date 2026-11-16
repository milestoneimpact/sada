/**
 * شاشةُ **«صدى يبني خطّتك»** (D-332) — ما يجري بعد «حلّل وابنِ الخطّة»، خطوةً خطوة.
 *
 * ثلاثُ خطواتٍ بحالها (تمّت · تجري · تنتظر): قراءةُ الاختيارات والمصادر، ثمّ التخطيط جزءًا جزءًا بشريط تقدّم، ثمّ كتابةُ المنشورات
 * وصورِها (وتُرى في شاشة الخطّة نفسِها حين تُفتح). ومعها كم مضى، وأنّ المغادرةَ لا توقف البناء.
 *
 * **وتعمل بلا سكربت**: الحالُ مرسومٌ من الخادم وزرُّ «حدّث» يعيد قراءتَه. والسكربتُ يسأل `/panel/plan/build.json` كلَّ ثانيتين
 * ونصف فيحدّث الشريطَ والخطوةَ، وينتقل إلى الخطّة حين تتمّ.
 */
import { panelHref } from '../../lib/nav/panes'
import { html, raw, type Html } from './html'
import { pageHead } from './parts'
import { card } from './components/card'
import { button } from './components/button'
import { num } from '../../lib/format'
import type { PlanBuild } from '../../lib/plan/build'

const AR = num

type StepState = 'done' | 'now' | 'wait' | 'bad'
const STEP_BADGE: Readonly<Record<StepState, { tone: string; text: string }>> = {
  done: { tone: 'ok', text: 'تمّت' },
  now: { tone: 'warn', text: 'تجري الآن' },
  wait: { tone: 'idle', text: 'تنتظر' },
  bad: { tone: 'bad', text: 'توقّفت' },
}

function step(id: string, state: StepState, title: string, detail: Html): Html {
  const b = STEP_BADGE[state]
  return html`<li class="pb-step" id="${id}" data-state="${state}">
    <div class="row gap-2"><b>${title}</b><span class="grow"></span><span class="st ${b.tone}" data-badge>${b.text}</span></div>
    <div class="hint" data-detail>${detail}</div></li>`
}

/** ما يُقال عن جزء التخطيط الجاري — نصٌّ واحدٌ يكتبه الخادمُ والسكربتُ بالصيغة نفسِها. */
export function planningLine(done: number, total: number): string {
  if (total <= 1) return done >= 1 ? 'اكتمل التخطيط.' : 'النموذجُ يقرأ المصادرَ ويوزّع المنشوراتِ على الأيّام.'
  return done >= total ? 'اكتملت الأجزاءُ ' + AR(total) + '.' : 'الجزء ' + AR(Math.min(total, done + 1)) + ' من ' + AR(total) + ' — كلُّ جزءٍ أسبوعٌ إلى شهر.'
}

export function planBuildScreen(build: PlanBuild, now: Date): string {
  const failed = build.state === 'failed'
  const done = build.state === 'done'
  const planning: StepState = failed ? 'bad' : done || build.done >= build.total ? 'done' : build.state === 'planning' ? 'now' : 'wait'
  const writing: StepState = done ? 'now' : 'wait'
  const mins = Math.max(0, Math.floor((now.getTime() - Date.parse(build.startedAt)) / 60_000))
  const head = pageHead('', failed ? 'تعذّر بناءُ الخطّة' : done ? 'خُطّطت — تُكتب منشوراتُها الآن' : 'صدى يبني خطّتك',
    failed ? 'لم تُبنَ الخطّة. السببُ تحت، وما وقع من نداءٍ مسجَّلٌ بكلفته.' : 'لك أن تغادر الصفحة: البناءُ يكمل في الخلفيّة، وتجد الخطّةَ في «الخطّة».')
  const body = html`<ol class="pb-steps">
      ${step('pb-read', 'done', 'قراءةُ اختياراتك ومصادرك', html`المدّةُ والمنصّاتُ وإيقاعُها وأوقاتُها، والمصادرُ المحلَّلة.`)}
      ${step('pb-plan', planning, 'التخطيط: أيُّ مصدرٍ في أيّ يومٍ وعلى أيّ منصّة', html`<span id="pb-line">${planningLine(build.done, build.total)}</span>
        <progress class="rv-prog" id="pb-prog" max="${String(build.total)}" value="${String(Math.min(build.total, build.done))}" aria-label="أجزاءُ التخطيط المكتملة"></progress>`)}
      ${step('pb-write', writing, 'كتابةُ المنشورات وصورِها', html`تبدأ حين يكتمل التخطيط، وتظهر في شاشة الخطّة واحدًا واحدًا.`)}
    </ol>
    <p class="hint m-0 mt-3" id="pb-time" role="status">${failed || done ? '' : mins === 0 ? 'بدأ للتوّ. يأخذ التخطيطُ عادةً من نصف دقيقةٍ إلى ثلاث دقائق لكلّ جزء.' : 'منذ ' + AR(mins) + (mins === 1 ? ' دقيقة' : ' دقائق') + '. يأخذ التخطيطُ عادةً من نصف دقيقةٍ إلى ثلاث دقائق لكلّ جزء.'}</p>
    ${failed ? html`<p class="m-0 mt-3" role="alert"><b>السبب:</b> ${build.note ?? 'عطلٌ غير متوقّع'}</p>` : html``}
    <div class="row gap-2 mt-4">${failed
      ? html`${raw(button({ label: 'عُد إلى «خطّة جديدة»', variant: 'primary', href: '/panel/plan/new' }))}${/توجيه المهامّ|نموذج/.test(build.note ?? '') ? raw(button({ label: 'اضبط النموذج', variant: 'secondary', href: panelHref('providers') })) : ''}`
      : done
        ? raw(button({ label: 'افتح الخطّة', variant: 'primary', href: '/panel/plan/review' }))
        : raw(button({ label: 'حدّث الحال', href: '/panel/plan/building' }))}</div>`
  return html`${raw(head)}<div id="pb" data-state="${build.state}" data-started="${build.startedAt}">${raw(card({ body: body.value }))}</div>`.value
}

/**
 * يسأل الحالَ كلَّ ثانيتين ونصف ويحدّث ما يُرى. الأرقامُ والنصوصُ من الخادم (`build.json`) تُكتب بـ`textContent` — لا `innerHTML`.
 * وحين «تمّ» ينتقل إلى الخطّة، وحين «فشل» يعيد تحميلَ الشاشة فيُرسَم السببُ من الخادم.
 */
export const PLAN_BUILD_SCRIPT = `(function(){
  var root=document.getElementById('pb'); if(!root)return;
  var state=root.getAttribute('data-state'); if(state==='failed')return;
  if(state==='done'){setTimeout(function(){location.href='/panel/plan/review';},900); return;}
  var prog=document.getElementById('pb-prog'), line=document.getElementById('pb-line'), time=document.getElementById('pb-time');
  var started=Date.parse(root.getAttribute('data-started')||'')||Date.now();
  function badge(id,tone,text,st){var li=document.getElementById(id); if(!li)return; li.setAttribute('data-state',st);
    var b=li.querySelector('[data-badge]'); if(b){b.className='st '+tone; b.textContent=text;}}
  function tick(){
    fetch('/panel/plan/build.json',{credentials:'same-origin',headers:{Accept:'application/json'}})
      .then(function(r){return r.ok?r.json():null;})
      .then(function(j){
        if(!j)return;
        if(j.state==='failed'){location.reload(); return;}
        if(prog){prog.max=j.total; prog.value=Math.min(j.total,j.done);}
        if(line&&j.line)line.textContent=j.line;
        if(j.state==='planning')badge('pb-plan','warn','تجري الآن','now');
        if(j.state==='done'){badge('pb-plan','ok','تمّت','done'); badge('pb-write','warn','تجري الآن','now'); location.href='/panel/plan/review'; return;}
      }).catch(function(){});
  }
  // ‏العدّادُ كلَّ ثانية، لا كلَّ دقيقة: المالكُ يرى أنّ شيئًا يجري (D-362)
  function clock(){
    if(!time)return; var s=Math.max(0,Math.floor((Date.now()-started)/1000)), m=Math.floor(s/60);
    time.textContent='منذ '+(m===0?s+' ثانية':m+(m===1?' دقيقة و':' دقائق و')+(s%60)+' ثانية')+'. يأخذ التخطيطُ عادةً من نصف دقيقةٍ إلى ثلاث دقائق لكلّ جزء.';
  }
  setInterval(tick,2000); setInterval(clock,1000); tick(); clock();
})();`

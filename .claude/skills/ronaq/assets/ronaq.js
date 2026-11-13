/* رونق 1.2 — سلوكُ المكوّنات. بلا اعتماديّات. ‏window.Ronaq */
(function(){
'use strict';
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, r=document) => r.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const ICONS = {"activity": "<path d=\"M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2\" />", "calendar-range": "<rect width=\"18\" height=\"18\" x=\"3\" y=\"4\" rx=\"2\" /> <path d=\"M16 2v4\" /> <path d=\"M3 10h18\" /> <path d=\"M8 2v4\" /> <path d=\"M17 14h-6\" /> <path d=\"M13 18H7\" /> <path d=\"M7 14h.01\" /> <path d=\"M17 18h.01\" />", "chevron-left": "<path d=\"m15 18-6-6 6-6\" />", "circle-alert": "<circle cx=\"12\" cy=\"12\" r=\"10\" /> <line x1=\"12\" x2=\"12\" y1=\"8\" y2=\"12\" /> <line x1=\"12\" x2=\"12.01\" y1=\"16\" y2=\"16\" />", "circle-help": "<circle cx=\"12\" cy=\"12\" r=\"10\" /> <path d=\"M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3\" /> <path d=\"M12 17h.01\" />", "clapperboard": "<path d=\"M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z\" /> <path d=\"m6.2 5.3 3.1 3.9\" /> <path d=\"m12.4 3.4 3.1 4\" /> <path d=\"M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z\" />", "clock": "<circle cx=\"12\" cy=\"12\" r=\"10\" /> <polyline points=\"12 6 12 12 16 14\" />", "cloud-off": "<path d=\"m2 2 20 20\" /> <path d=\"M5.782 5.782A7 7 0 0 0 9 19h8.5a4.5 4.5 0 0 0 1.307-.193\" /> <path d=\"M21.532 16.5A4.5 4.5 0 0 0 17.5 10h-1.79A7.008 7.008 0 0 0 10 5.07\" />", "compass": "<path d=\"m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z\" /> <circle cx=\"12\" cy=\"12\" r=\"10\" />", "crown": "<path d=\"M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z\" /> <path d=\"M5 21h14\" />", "eye": "<path d=\"M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0\" /> <circle cx=\"12\" cy=\"12\" r=\"3\" />", "gauge": "<path d=\"m12 14 4-4\" /> <path d=\"M3.34 19a10 10 0 1 1 17.32 0\" />", "gem": "<path d=\"M6 3h12l4 6-10 13L2 9Z\" /> <path d=\"M11 3 8 9l4 13 4-13-3-6\" /> <path d=\"M2 9h20\" />", "history": "<path d=\"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8\" /> <path d=\"M3 3v5h5\" /> <path d=\"M12 7v5l4 2\" />", "hourglass": "<path d=\"M5 22h14\" /> <path d=\"M5 2h14\" /> <path d=\"M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22\" /> <path d=\"M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2\" />", "image": "<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\" ry=\"2\" /> <circle cx=\"9\" cy=\"9\" r=\"2\" /> <path d=\"m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21\" />", "key-round": "<path d=\"M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z\" /> <circle cx=\"16.5\" cy=\"7.5\" r=\".5\" fill=\"currentColor\" />", "lightbulb": "<path d=\"M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5\" /> <path d=\"M9 18h6\" /> <path d=\"M10 22h4\" />", "pen-line": "<path d=\"M12 20h9\" /> <path d=\"M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z\" />", "plus": "<path d=\"M5 12h14\" /> <path d=\"M12 5v14\" />", "replace": "<path d=\"M14 4a2 2 0 0 1 2-2\" /> <path d=\"M16 10a2 2 0 0 1-2-2\" /> <path d=\"M20 2a2 2 0 0 1 2 2\" /> <path d=\"M22 8a2 2 0 0 1-2 2\" /> <path d=\"m3 7 3 3 3-3\" /> <path d=\"M6 10V5a3 3 0 0 1 3-3h1\" /> <rect x=\"2\" y=\"14\" width=\"8\" height=\"8\" rx=\"2\" />", "rotate-ccw": "<path d=\"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8\" /> <path d=\"M3 3v5h5\" />", "route": "<circle cx=\"6\" cy=\"19\" r=\"3\" /> <path d=\"M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15\" /> <circle cx=\"18\" cy=\"5\" r=\"3\" />", "scan-text": "<path d=\"M3 7V5a2 2 0 0 1 2-2h2\" /> <path d=\"M17 3h2a2 2 0 0 1 2 2v2\" /> <path d=\"M21 17v2a2 2 0 0 1-2 2h-2\" /> <path d=\"M7 21H5a2 2 0 0 1-2-2v-2\" /> <path d=\"M7 8h8\" /> <path d=\"M7 12h10\" /> <path d=\"M7 16h6\" />", "search": "<circle cx=\"11\" cy=\"11\" r=\"8\" /> <path d=\"m21 21-4.3-4.3\" />", "shield-check": "<path d=\"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z\" /> <path d=\"m9 12 2 2 4-4\" />", "sparkles": "<path d=\"M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z\" /> <path d=\"M20 3v4\" /> <path d=\"M22 5h-4\" /> <path d=\"M4 17v2\" /> <path d=\"M5 18H3\" />", "triangle-alert": "<path d=\"m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3\" /> <path d=\"M12 9v4\" /> <path d=\"M12 17h.01\" />", "wallet": "<path d=\"M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1\" /> <path d=\"M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4\" />", "x": "<path d=\"M18 6 6 18\" /> <path d=\"m6 6 12 12\" />", "arrow-up-down": "<path d=\"m21 16-4 4-4-4\" /> <path d=\"M17 20V4\" /> <path d=\"m3 8 4-4 4 4\" /> <path d=\"M7 4v16\" />", "filter": "<polygon points=\"22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3\" />", "check": "<path d=\"M20 6 9 17l-5-5\" />", "trash-2": "<path d=\"M3 6h18\" /> <path d=\"M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6\" /> <path d=\"M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2\" /> <line x1=\"10\" x2=\"10\" y1=\"11\" y2=\"17\" /> <line x1=\"14\" x2=\"14\" y1=\"11\" y2=\"17\" />", "archive": "<rect width=\"20\" height=\"5\" x=\"2\" y=\"3\" rx=\"1\" /> <path d=\"M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8\" /> <path d=\"M10 12h4\" />", "download": "<path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\" /> <polyline points=\"7 10 12 15 17 10\" /> <line x1=\"12\" x2=\"12\" y1=\"15\" y2=\"3\" />", "chevron-right": "<path d=\"m9 18 6-6-6-6\" />", "list-filter": "<path d=\"M3 6h18\" /> <path d=\"M7 12h10\" /> <path d=\"M10 18h4\" />", "arrow-right": "<path d=\"M5 12h14\" /> <path d=\"m12 5 7 7-7 7\" />", "file-text": "<path d=\"M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z\" /> <path d=\"M14 2v4a2 2 0 0 0 2 2h4\" /> <path d=\"M10 9H8\" /> <path d=\"M16 13H8\" /> <path d=\"M16 17H8\" />", "calendar": "<path d=\"M8 2v4\" /> <path d=\"M16 2v4\" /> <rect width=\"18\" height=\"18\" x=\"3\" y=\"4\" rx=\"2\" /> <path d=\"M3 10h18\" />", "send": "<path d=\"M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z\" /> <path d=\"m21.854 2.147-10.94 10.939\" />", "user": "<path d=\"M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2\" /> <circle cx=\"12\" cy=\"7\" r=\"4\" />", "settings": "<path d=\"M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z\" /> <circle cx=\"12\" cy=\"12\" r=\"3\" />", "bell": "<path d=\"M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9\" /> <path d=\"M10.3 21a1.94 1.94 0 0 0 3.4 0\" />", "tag": "<path d=\"M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z\" /> <circle cx=\"7.5\" cy=\"7.5\" r=\".5\" fill=\"currentColor\" />", "layers": "<path d=\"m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z\" /> <path d=\"m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65\" /> <path d=\"m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65\" />", "sliders-horizontal": "<line x1=\"21\" x2=\"14\" y1=\"4\" y2=\"4\" /> <line x1=\"10\" x2=\"3\" y1=\"4\" y2=\"4\" /> <line x1=\"21\" x2=\"12\" y1=\"12\" y2=\"12\" /> <line x1=\"8\" x2=\"3\" y1=\"12\" y2=\"12\" /> <line x1=\"21\" x2=\"16\" y1=\"20\" y2=\"20\" /> <line x1=\"12\" x2=\"3\" y1=\"20\" y2=\"20\" /> <line x1=\"14\" x2=\"14\" y1=\"2\" y2=\"6\" /> <line x1=\"8\" x2=\"8\" y1=\"10\" y2=\"14\" /> <line x1=\"16\" x2=\"16\" y1=\"18\" y2=\"22\" />", "minus": "<path d=\"M5 12h14\" />", "square-check": "<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\" /> <path d=\"m9 12 2 2 4-4\" />"};

/** الأيقونات: ‏<i data-lucide="name"></i> تصير SVG مضمَّنًا. */
function icons(root=document){
  root.querySelectorAll('i[data-lucide]').forEach(el => { const n = el.dataset.lucide; if(!ICONS[n]) return;
    el.outerHTML = `<svg class="lucide" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]}</svg>` });
}

/** انتقالٌ مشترك (View Transitions) — يُتجاهَل بأمان حين لا يُدعم أو يُقلَّل. */
let busy = false;
function vt(fn){
  if(reduce || !document.startViewTransition || busy) return fn();
  busy = true; const t = document.startViewTransition(fn);
  t.ready.catch(()=>{}); t.updateCallbackDone.catch(()=>{}); t.finished.catch(()=>{}).then(()=>{ busy = false });
  return t;
}

/** إعلانٌ لقارئ الشاشة. */
function announce(msg){
  let l = $('#r-live'); if(!l){ l = document.createElement('div'); l.id='r-live'; l.className='sr'; l.setAttribute('aria-live','assertive'); document.body.append(l) }
  l.textContent=''; setTimeout(()=>l.textContent=msg, 40);
}

/** الرسالة: ‏toast('حُفظ', {undo: fn, bad: false}) — التراجع خمس ثوانٍ. */
let undoFn = null, th = 0;
function toast(msg, opt={}){
  let t = $('#r-toast');
  if(!t){ t = document.createElement('div'); t.id='r-toast'; t.className='toast';
    t.innerHTML='<span class="ic">✓</span><span class="tt"></span><button class="undo" type="button" hidden>تراجع</button>'; document.body.append(t);
    t.querySelector('.undo').addEventListener('click', () => { const f = undoFn; undoFn = null; t.classList.remove('show'); f && f() }) }
  t.classList.toggle('bad', !!opt.bad); t.querySelector('.ic').textContent = opt.bad ? '!' : '✓';
  t.querySelector('.tt').textContent = msg; undoFn = opt.undo || null; t.querySelector('.undo').hidden = !undoFn;
  t.classList.add('show'); clearTimeout(th); th = setTimeout(()=>{ t.classList.remove('show'); undoFn = null }, opt.undo ? 5000 : 2600);
  announce(msg);
}

/** عدٌّ إلى قيمة. */
function countTo(el, to, fmt = v => String(Math.round(v))){
  const from = parseFloat(el.dataset.v || '0'); el.dataset.v = to;
  if(reduce){ el.textContent = fmt(to); return }
  const t0 = performance.now(); (function step(t){ const k = Math.min(1,(t-t0)/1000), e = 1-Math.pow(1-k,3); el.textContent = fmt(from+(to-from)*e); if(k<1) requestAnimationFrame(step) })(t0);
}

/** رفضُ مدخل: هزّة + سبب + aria-invalid. */
function reject(input, msg){
  input.classList.add('invalid'); input.classList.remove('shake'); void input.offsetWidth; input.classList.add('shake');
  input.setAttribute('aria-invalid','true');
  const h = document.getElementById(input.getAttribute('aria-describedby')); if(h){ h.textContent = msg; h.classList.add('why-bad') }
  announce(msg);
}

/**
 * الجدول الكثيف: فرزٌ وبحثٌ ورقائقُ تصفية وتحديدٌ متعدّد وشريطُ أفعال.
 * ‏table(el, {columns:[{key,label,num?,render?}], rows, filters:{key, values:[...]}, actions:[{icon,label,run(rows)}], empty})
 */
function table(host, cfg){
  const st = { q:'', sort:null, dir:1, filter:null, sel:new Set() };
  const id = r => r.id;
  host.innerHTML = `
    <div class="r-toolbar"><label class="r-search"><i data-lucide="search"></i><input type="search" placeholder="ابحث…" aria-label="ابحث في الجدول"></label>
      <div class="r-filters" role="group" aria-label="تصفية"></div></div>
    <div class="r-table-wrap" tabindex="0"><table class="r-table"><thead></thead><tbody></tbody></table></div>
    <div class="r-bulk" role="toolbar" aria-label="أفعالٌ على المحدَّد"><span class="n"></span></div>`;
  const tb = $('tbody', host), th = $('thead', host), bulk = $('.r-bulk', host), fl = $('.r-filters', host);
  if(cfg.filters){ const counts = {}; cfg.rows.forEach(r => counts[r[cfg.filters.key]] = (counts[r[cfg.filters.key]]||0)+1);
    fl.innerHTML = cfg.filters.values.map(v => `<button class="r-chip" type="button" aria-pressed="false" data-f="${esc(v)}">${esc(v)}<span class="c">${counts[v]||0}</span></button>`).join('') }
  (cfg.actions||[]).forEach((a,i) => bulk.insertAdjacentHTML('beforeend', `<button class="btn sm" type="button" data-a="${i}"><i data-lucide="${a.icon}"></i>${esc(a.label)}</button>`));
  bulk.insertAdjacentHTML('beforeend', `<button class="btn sm" type="button" data-clear>إلغاء التحديد</button>`);
  function view(){
    let r = cfg.rows.filter(x => (!st.filter || x[cfg.filters.key]===st.filter) && (!st.q || JSON.stringify(x).includes(st.q)));
    if(st.sort) r = r.slice().sort((a,b) => (a[st.sort] > b[st.sort] ? 1 : a[st.sort] < b[st.sort] ? -1 : 0) * st.dir);
    return r;
  }
  function render(){
    const r = view(), all = r.length && r.every(x => st.sel.has(id(x))), some = r.some(x => st.sel.has(id(x)));
    th.innerHTML = `<tr><th style="width:44px"><input class="r-check" type="checkbox" aria-label="حدّد الكلّ" ${all?'checked':''}></th>${cfg.columns.map(c =>
      `<th ${st.sort===c.key?`aria-sort="${st.dir>0?'ascending':'descending'}"`:''} class="${c.num?'num':''}"><button type="button" data-sort="${c.key}">${esc(c.label)}<i data-lucide="arrow-up-down"></i></button></th>`).join('')}</tr>`;
    const head = $('input', th); head.indeterminate = some && !all;
    tb.innerHTML = r.length ? r.map(x => `<tr aria-selected="${st.sel.has(id(x))}" data-id="${esc(id(x))}"><td><input class="r-check" type="checkbox" aria-label="حدّد" ${st.sel.has(id(x))?'checked':''}></td>${cfg.columns.map(c =>
      `<td class="${c.num?'num':''}">${c.render ? c.render(x) : esc(x[c.key])}</td>`).join('')}</tr>`).join('')
      : `<tr class="r-empty-row"><td colspan="${cfg.columns.length+1}">${esc(cfg.empty || 'لا نتائج')}</td></tr>`;
    bulk.classList.toggle('on', st.sel.size > 0); $('.n', bulk).textContent = `${st.sel.size} محدَّد`;
    icons(host);
  }
  host.addEventListener('input', e => { if(e.target.type==='search'){ st.q = e.target.value.trim(); render() } });
  host.addEventListener('change', e => {
    if(!e.target.classList.contains('r-check')) return;
    const tr = e.target.closest('tr[data-id]');
    if(tr){ e.target.checked ? st.sel.add(tr.dataset.id) : st.sel.delete(tr.dataset.id) }
    else { const r = view(); e.target.checked ? r.forEach(x => st.sel.add(id(x))) : r.forEach(x => st.sel.delete(id(x))) }
    render();
  });
  host.addEventListener('click', e => { let b;
    if(b = e.target.closest('[data-sort]')){ const k = b.dataset.sort; st.dir = st.sort===k ? -st.dir : 1; st.sort = k; vt(render) }
    else if(b = e.target.closest('[data-f]')){ st.filter = st.filter===b.dataset.f ? null : b.dataset.f; fl.querySelectorAll('[data-f]').forEach(x => x.setAttribute('aria-pressed', x.dataset.f===st.filter)); vt(render) }
    else if(b = e.target.closest('[data-a]')){ const rows = cfg.rows.filter(x => st.sel.has(id(x))); cfg.actions[+b.dataset.a].run(rows, () => { st.sel.clear(); render() }) }
    else if(e.target.closest('[data-clear]')){ st.sel.clear(); render() }
  });
  render();
  return { render, state: st, setRows(r){ cfg.rows = r; render() } };
}


/* ═════ 1.2 · الوصول: حبسُ التركيز وتنقّلُ القوائم بالأسهم ═════ */
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])';
/** يحبس التركيز داخل لوح، ويجعل ما خلفه خاملًا (inert). يعيد دالّة الفكّ، وتعيد التركيز إلى من فتحه. */
function trap(panel){
  const opener = document.activeElement, dead = [];
  // ‏الخمولُ على كلّ مستوى: إخوةُ اللوح، ثمّ إخوةُ أبيه… حتّى body — فاللوحُ داخل حاويةٍ مشتركة لا يُفلت
  for(let n = panel; n && n !== document.body; n = n.parentElement)
    [...(n.parentElement ? n.parentElement.children : [])].forEach(sib => { if(sib !== n && !sib.inert && sib.tagName !== 'SCRIPT'){ sib.inert = true; dead.push(sib) } });
  const tabbables = () => [...panel.querySelectorAll(FOCUSABLE)].filter(x => x.tabIndex >= 0 && x.offsetParent !== null);
  const onKey = e => { if(e.key !== 'Tab') return; const f = tabbables(); if(!f.length) return;
    const first = f[0], last = f[f.length-1];
    if(e.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))){ e.preventDefault(); last.focus() }
    else if(!e.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))){ e.preventDefault(); first.focus() } };
  document.addEventListener('keydown', onKey, true);
  const f = panel.querySelector('[autofocus]') || tabbables()[0]; f && setTimeout(() => f.focus(), 30);
  return () => { dead.forEach(el => el.inert = false); document.removeEventListener('keydown', onKey, true); opener && opener.focus && opener.focus() };
}
/** قائمة بالأسهم (roving tabindex): ↑↓ ثمّ Home/End، والحرف الأوّل يقفز. */
function listbox(list, itemSel='[role="option"]'){
  const items = () => [...list.querySelectorAll(itemSel)];
  const set = i => { const it = items(); it.forEach((x,k) => x.tabIndex = k===i ? 0 : -1); it[i] && it[i].focus() };
  items().forEach((x,k) => x.tabIndex = k===0 ? 0 : -1);
  list.addEventListener('keydown', e => { const it = items(), i = it.indexOf(document.activeElement); if(i < 0) return;
    if(e.key === 'ArrowDown'){ e.preventDefault(); set(Math.min(it.length-1, i+1)) }
    else if(e.key === 'ArrowUp'){ e.preventDefault(); set(Math.max(0, i-1)) }
    else if(e.key === 'Home'){ e.preventDefault(); set(0) } else if(e.key === 'End'){ e.preventDefault(); set(it.length-1) }
    else if(e.key.length === 1){ const j = it.findIndex((x,k) => k > i && x.textContent.trim().startsWith(e.key)); if(j >= 0) set(j) } });
}

/* ═════ 1.2 · العربيّة: الجمع والوقت والتاريخ ═════ */
const PR = new Intl.PluralRules('ar');
/** ‏plural(n, {one:'منشور', two:'منشوران', few:'منشورات', many:'منشورًا', other:'منشور', zero:'لا منشور'}) */
function plural(n, f){
  if(n === 0 && f.zero) return f.zero;
  const k = PR.select(n);
  if(k === 'one') return f.one2 || `${f.one} واحد`;
  if(k === 'two') return f.two;
  return `${n} ${f[k] || f.other}`;
}
const RTF = new Intl.RelativeTimeFormat('ar', {numeric:'auto'});
/** وقتٌ نسبيّ عربيّ صحيح: «قبل 3 دقائق»، «أمس»، «بعد ساعتين». */
function ago(date, now = Date.now()){
  const d = (new Date(date) - now) / 1000, a = Math.abs(d);
  const [v,u] = a < 45 ? [0,'second'] : a < 3600 ? [d/60,'minute'] : a < 86400 ? [d/3600,'hour'] : a < 2592000 ? [d/86400,'day'] : [d/2592000,'month'];
  return u === 'second' ? 'الآن' : RTF.format(Math.round(v), u);
}
/** تاريخ عربيّ، وهجريٌّ بخيار. الأرقام لاتينيّة كقاعدة رونق. */
function date(d, {hijri=false, style='medium'}={}){
  return new Intl.DateTimeFormat(hijri ? 'ar-SA-u-ca-islamic-umalqura-nu-latn' : 'ar-u-nu-latn', {dateStyle:style}).format(new Date(d));
}

/* ═════ 1.2 · رسالةٌ تتبع العمليّة ═════ */
/** ‏track(promiseFn, {loading, success:(v)=>msg, error:(e)=>msg}) — رسالةٌ واحدة تتحوّل، وفي الفشل «أعد المحاولة». */
function track(fn, m){
  toast(m.loading, {}); const t = $('#r-toast'); t.classList.add('loading'); t.querySelector('.ic').textContent = '◌'; clearTimeout(th);
  return Promise.resolve().then(fn).then(v => { t.classList.remove('loading'); toast(m.success(v)); return v },
    e => { t.classList.remove('loading'); toast(m.error(e), {bad:true, undo:() => track(fn, m)}); t.querySelector('.undo').textContent = 'أعد المحاولة'; throw e });
}

/* ═════ 1.2 · النماذج: تحقّقٌ لحظيّ، حفظٌ تلقائيّ، حمايةٌ من المغادرة ═════ */
/**
 * ‏form(el, {rules:{name:(v)=>msg|''}, save:(data)=>Promise, delay:800})
 * التحقّق بعد مغادرة الحقل ثمّ أثناء الكتابة، والحفظ التلقائيّ بعد سكون، والمغادرة بتعديلٍ لم يُحفظ تُنبَّه.
 */
function form(el, cfg){
  let dirty = false, timer = 0; const status = el.querySelector('[data-status]');
  const say = (txt, cls='') => { if(status){ status.textContent = txt; status.className = 'r-fstatus ' + cls } };
  const check = inp => { const r = cfg.rules && cfg.rules[inp.name]; if(!r) return true; const msg = r(inp.value.trim());
    const h = document.getElementById(inp.getAttribute('aria-describedby'));
    inp.setAttribute('aria-invalid', msg ? 'true' : 'false'); inp.classList.toggle('invalid', !!msg);
    if(h){ h.textContent = msg || h.dataset.hint || ''; h.classList.toggle('why-bad', !!msg) } return !msg };
  el.addEventListener('focusout', e => { if(e.target.name){ e.target.dataset.touched = '1'; check(e.target) } });
  el.addEventListener('input', e => {
    if(e.target.dataset.touched) check(e.target);
    dirty = true; say('تعديلٌ لم يُحفظ', 'dirty'); clearTimeout(timer);
    timer = setTimeout(async () => { const ok = [...el.elements].filter(x => x.name).every(check); if(!ok){ say('صحّح الحقول المعلَّمة', 'bad'); return }
      say('يحفظ…', 'busy'); await cfg.save(Object.fromEntries(new FormData(el))); dirty = false; const at = Date.now(); say('حُفظ الآن', 'ok');
      clearInterval(el._t); el._t = setInterval(() => { if(!dirty) say('حُفظ ' + ago(at), 'ok') }, 15000) }, cfg.delay || 800) });
  addEventListener('beforeunload', e => { if(dirty){ e.preventDefault(); e.returnValue = '' } });
  return { get dirty(){ return dirty } };
}

/* ═════ 1.2 · مسار الإعداد ═════ */
/** ‏checklist(host, [{id,title,desc,action,done}]) — «اكتمال الإعداد 3 من 5» حتّى يكتمل، ثمّ يشكر ويختفي. */
function checklist(host, steps, {onAct}={}){
  function render(){
    const n = steps.filter(s => s.done).length, all = n === steps.length, pct = n / steps.length;
    host.innerHTML = all ? `<div class="r-cl done" role="status"><i data-lucide="sparkles"></i><b>اكتمل الإعداد</b><span>كلّ شيءٍ جاهز. هذه القائمة لن تظهر مجدّدًا.</span></div>` :
    `<div class="r-cl"><div class="r-cl-h"><svg class="r-cl-ring" viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15"/><circle cx="18" cy="18" r="15" style="stroke-dasharray:94.25;stroke-dashoffset:${94.25*(1-pct)}"/></svg>
      <div><b>اكتمال الإعداد</b><span>${n} من ${steps.length}</span></div></div>
      <ol>${steps.map(s => `<li class="${s.done?'ok':''}"><span class="d" aria-hidden="true">${s.done?'✓':''}</span><div><b>${esc(s.title)}</b><span>${esc(s.desc)}</span></div>${s.done?'<span class="tag t-free">تمّ</span>':`<button class="btn sm primary" type="button" data-step="${s.id}">${esc(s.action)}</button>`}</li>`).join('')}</ol></div>`;
    icons(host);
  }
  host.addEventListener('click', e => { const b = e.target.closest('[data-step]'); if(!b) return; const s = steps.find(x => x.id === b.dataset.step);
    Promise.resolve(onAct ? onAct(s) : true).then(ok => { if(ok !== false){ vt(() => { s.done = true; render() }); announce(`تمّ: ${s.title}`) } }) });
  render(); return { render };
}

/* ═════ 1.2 · الذاكرة: لوحة أوامر بالأخيرة، ونافذة الاختصارات ═════ */
const store = { get(k, d){ try{ return JSON.parse(localStorage.getItem(k)) ?? d }catch(e){ return d } }, set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)) }catch(e){} } };
/** ‏palette([{id,title,hint,icon,keys?,run}]) — ⌘K. «الأخيرة» أوّلًا، وحبسُ تركيز، وأسهم. */
function palette(cmds){
  const wrap = document.createElement('div'); wrap.className = 'r-palwrap'; wrap.hidden = true;
  wrap.innerHTML = `<div class="pal" role="dialog" aria-modal="true" aria-label="لوحة الأوامر"><div class="top"><input type="search" placeholder="ابحث عن أمر…" aria-label="ابحث عن أمر"></div><ul role="listbox"></ul>
    <div class="foot"><span><span class="kbd">↑↓</span> تنقّل</span><span><span class="kbd">↵</span> نفّذ</span><span><span class="kbd">?</span> الاختصارات</span></div></div>`;
  document.body.append(wrap); const inp = $('input', wrap), ul = $('ul', wrap); let sel = 0, shown = [], release = null;
  function render(){
    const q = inp.value.trim(), rec = store.get('ronaq-recent', []);
    const recent = q ? [] : rec.map(id => cmds.find(c => c.id === id)).filter(Boolean);
    const rest = cmds.filter(c => (!q || (c.title + ' ' + (c.hint||'')).includes(q)) && !recent.includes(c));
    shown = [...recent, ...rest]; sel = Math.min(sel, Math.max(0, shown.length-1));
    ul.innerHTML = (recent.length ? '<li class="grp" role="presentation">الأخيرة</li>' : '') +
      shown.map((c,i) => (i === recent.length && recent.length ? '<li class="grp" role="presentation">كلّ الأوامر</li>' : '') +
      `<li role="option" aria-selected="${i===sel}" data-i="${i}"><i data-lucide="${c.icon||'arrow-left'}"></i>${esc(c.title)}<span class="k">${c.keys?`<span class="kbd">${esc(c.keys)}</span>`:esc(c.hint||'')}</span></li>`).join('') || '<li class="grp">لا أمر بهذا الاسم</li>';
    icons(ul); const a = ul.querySelector('[aria-selected="true"]'); a && a.scrollIntoView({block:'nearest'});
  }
  function run(i){ const c = shown[i]; if(!c) return; store.set('ronaq-recent', [c.id, ...store.get('ronaq-recent', []).filter(x => x !== c.id)].slice(0,4)); close(); setTimeout(c.run, 120) }
  function open(){ wrap.hidden = false; requestAnimationFrame(() => wrap.classList.add('on')); inp.value = ''; sel = 0; render(); release = trap(wrap) }
  function close(){ wrap.classList.remove('on'); setTimeout(() => wrap.hidden = true, 200); release && release() }
  inp.addEventListener('input', () => { sel = 0; render() });
  wrap.addEventListener('keydown', e => { if(e.key === 'ArrowDown'){ e.preventDefault(); sel = Math.min(shown.length-1, sel+1); render() } else if(e.key === 'ArrowUp'){ e.preventDefault(); sel = Math.max(0, sel-1); render() } else if(e.key === 'Enter'){ e.preventDefault(); run(sel) } else if(e.key === 'Escape') close() });
  wrap.addEventListener('click', e => { const li = e.target.closest('li[data-i]'); if(li) run(+li.dataset.i); else if(e.target === wrap) close() });
  addEventListener('keydown', e => { if((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k'){ e.preventDefault(); wrap.hidden ? open() : close() } });
  return { open, close };
}
/** ‏shortcuts([{keys:'⌘K', label:'لوحة الأوامر'}]) — «?» يفتح النافذة، وكلّ زرٍّ له data-keys يُظهر اختصاره عند المرور. */
function shortcuts(list){
  const d = document.createElement('div'); d.className = 'r-palwrap'; d.hidden = true;
  d.innerHTML = `<div class="pal r-keys" role="dialog" aria-modal="true" aria-label="اختصارات لوحة المفاتيح"><div class="top"><b>اختصارات لوحة المفاتيح</b></div><dl>${list.map(x => `<dt><span class="kbd">${esc(x.keys)}</span></dt><dd>${esc(x.label)}</dd>`).join('')}</dl><div class="foot"><span><span class="kbd">Esc</span> إغلاق</span></div></div>`;
  document.body.append(d); let release = null;
  const open = () => { d.hidden = false; requestAnimationFrame(() => d.classList.add('on')); release = trap(d) };
  const close = () => { d.classList.remove('on'); setTimeout(() => d.hidden = true, 200); release && release() };
  addEventListener('keydown', e => { const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if(e.key === '?' && !typing){ e.preventDefault(); d.hidden ? open() : close() } else if(e.key === 'Escape' && !d.hidden) close() });
  d.addEventListener('click', e => { if(e.target === d) close() });
  document.querySelectorAll('[data-keys]').forEach(b => b.title = `${b.textContent.trim()} · ${b.dataset.keys}`);
  return { open, close };
}

/** الانتقال من بطاقةٍ إلى تفاصيلها: يتشارك العنصران اسمًا واحدًا فيتحوّل أحدهما إلى الآخر. */
function morph(fromEl, toFn){
  fromEl.style.viewTransitionName = 'r-morph';
  return vt(() => { fromEl.style.viewTransitionName = ''; toFn() });
}

window.Ronaq = { icons, vt, announce, toast, track, countTo, reject, table, morph, trap, listbox, plural, ago, date, form, checklist, palette, shortcuts, store, esc, reduce, ICONS, version: '1.2' };
document.addEventListener('DOMContentLoaded', () => icons());
})();

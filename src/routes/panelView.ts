/**
 * صفحة اللوحة.
 *
 * **قاعدةٌ ملزمة:** لا زرَّ هنا إلا وله قيدٌ مقابلٌ مُختبَر في الخادم.
 * وما لم يُبنَ يُعرض بحاله الصريحة لا كجدولٍ فارغ يُظنّ عطلا.
 *
 * وقواعد اللون من مرجع التصوير لا من الذوق:
 * - **ألوان الحالة محجوزة** (جيّد · تحذير · خطر) ولا تُستعمل لسلسلةٍ ولا زينة
 * - **لا تعتمد الحالة على اللون وحده**: معه رمزٌ ونصّ دائما
 * - **درجة الاستحقاق مقياس مقدار**، فتدرّجُ هيئةٍ واحدة لا قوس قزح
 * - النصّ يلبس ألوان النصّ لا لون العلامة بجانبه
 */
import { relativeTime, money } from '../lib/format'

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

const STYLE = `
:root{
  --bg:#080b10; --surface:#0f1620; --surface-2:#141d29; --surface-3:#1b2634;
  --line:#1f2c3b; --line-soft:#182331;
  --ink:#eaf0f7; --ink-2:#9fb0c3; --ink-3:#66788c;
  --gold:#d4af37; --gold-soft:#e8cf76; --on-gold:#0a0d12;
  /* حالات مدقَّقة: الأدنى بين أزواجها ΔE 15.9 للرؤية العاديّة.
     والأحمر/الأخضر متقاربان في عمى الألوان (ΔE 4.4) — ولذلك **كلّ حالة
     تحمل رمزا ونصّا معها**، فالهويّة لا تقع على اللون وحده. */
  --ok:#4bb98c; --warn:#e0a03a; --bad:#e8686f;
  --r:12px; --r-lg:16px;
  --shadow:0 1px 2px rgba(0,0,0,.4), 0 8px 28px rgba(0,0,0,.28);
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{
  margin:0; background:var(--bg); color:var(--ink); direction:rtl;
  font-family:"IBM Plex Sans Arabic","Noto Sans Arabic",system-ui,-apple-system,"Segoe UI",sans-serif;
  font-size:15px; line-height:1.65;
  -webkit-font-smoothing:antialiased;
}
:focus-visible{outline:2px solid var(--gold); outline-offset:2px; border-radius:6px}
.skip{position:absolute; right:-9999px; top:8px; background:var(--gold); color:var(--on-gold);
  padding:10px 16px; border-radius:8px; z-index:99; font-weight:700}
.skip:focus{right:12px}
.wrap{max-width:1180px; margin:0 auto; padding:24px 20px 80px}

/* ── الترويسة ─────────────────────────────────────────── */
.top{display:flex; align-items:center; gap:14px; flex-wrap:wrap; padding-bottom:18px;
  border-bottom:1px solid var(--line)}
.mark{display:flex; align-items:center; gap:11px}
.glyph{width:38px; height:38px; border-radius:11px; display:grid; place-items:center;
  background:linear-gradient(150deg,var(--gold),#8f6f18); color:var(--on-gold);
  font-weight:800; font-size:17px; box-shadow:var(--shadow)}
.title{font-size:19px; font-weight:700; letter-spacing:-.2px; line-height:1.2}
.title small{display:block; font-size:11px; font-weight:500; color:var(--ink-3); letter-spacing:.6px}
.grow{flex:1}

.pill{display:inline-flex; align-items:center; gap:7px; padding:7px 14px; border-radius:999px;
  font-size:13px; font-weight:600; border:1px solid var(--line); background:var(--surface)}
.pill .led{width:7px; height:7px; border-radius:50%; background:var(--ink-3); flex:none}
.pill.on{color:var(--ok); border-color:color-mix(in srgb,var(--ok) 42%,transparent)}
.pill.on .led{background:var(--ok); box-shadow:0 0 0 3px color-mix(in srgb,var(--ok) 20%,transparent)}
.pill.off{color:var(--warn); border-color:color-mix(in srgb,var(--warn) 48%,transparent);
  background:color-mix(in srgb,var(--warn) 9%,var(--surface))}
.pill.off .led{background:var(--warn)}

/* ── الإشعار ──────────────────────────────────────────── */
.flash{display:flex; align-items:flex-start; gap:11px; padding:13px 16px; border-radius:var(--r);
  margin-top:18px; font-size:14px; border:1px solid var(--line); background:var(--surface)}
.flash .ic{flex:none; font-weight:800; font-size:15px; line-height:1.5}
.flash.ok{border-color:color-mix(in srgb,var(--ok) 40%,transparent);
  background:color-mix(in srgb,var(--ok) 8%,var(--surface))}
.flash.ok .ic{color:var(--ok)}
.flash.warn{border-color:color-mix(in srgb,var(--warn) 42%,transparent);
  background:color-mix(in srgb,var(--warn) 8%,var(--surface))}
.flash.warn .ic{color:var(--warn)}
.flash.bad{border-color:color-mix(in srgb,var(--bad) 42%,transparent);
  background:color-mix(in srgb,var(--bad) 8%,var(--surface))}
.flash.bad .ic{color:var(--bad)}

/* ── التنقّل ──────────────────────────────────────────── */
nav.tabs{display:flex; gap:4px; margin:20px 0 4px; border-bottom:1px solid var(--line);
  overflow-x:auto; scrollbar-width:none}
nav.tabs::-webkit-scrollbar{display:none}
nav.tabs a{padding:11px 16px; font-size:14px; font-weight:600; color:var(--ink-3);
  text-decoration:none; border-bottom:2px solid transparent; white-space:nowrap; transition:color .12s}
nav.tabs a:hover{color:var(--ink-2)}
nav.tabs a[aria-current=page]{color:var(--ink); border-bottom-color:var(--gold)}
nav.tabs .count{display:inline-block; margin-right:6px; padding:0 7px; border-radius:999px;
  background:var(--surface-3); font-size:11px; font-weight:700; color:var(--ink-2)}

section[hidden]{display:none}
section{padding-top:22px}

/* ── البطاقات ─────────────────────────────────────────── */
.grid{display:grid; gap:14px}
.c4{grid-template-columns:repeat(4,1fr)} .c3{grid-template-columns:repeat(3,1fr)}
.c2{grid-template-columns:repeat(2,1fr)}
@media(max-width:900px){.c4{grid-template-columns:repeat(2,1fr)} .c3,.c2{grid-template-columns:1fr}}
@media(max-width:540px){.c4{grid-template-columns:1fr}}

.card{background:var(--surface); border:1px solid var(--line); border-radius:var(--r-lg);
  padding:18px; box-shadow:var(--shadow)}
.card > h2{margin:0 0 4px; font-size:14px; font-weight:600; color:var(--ink-2)}
.card > .hint{margin:0 0 14px; font-size:12px; color:var(--ink-3)}
.card-head{display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:14px}
.card-head h2{margin:0}

.tile .k{font-size:11.5px; color:var(--ink-3); letter-spacing:.3px; margin-bottom:7px}
.tile .v{font-size:29px; font-weight:700; line-height:1.1; font-variant-numeric:tabular-nums}
.tile .v em{font-style:normal; font-size:15px; font-weight:600; color:var(--ink-3)}
.tile .n{font-size:11.5px; color:var(--ink-3); margin-top:8px}

/* المقياس **مقياسُ مقدار لا تصنيف**: هيئةٌ واحدة تتدرّج، ولا كهرمان فيه
   قطّ — الكهرمان يقع من ذهب الهوية على ΔE 7.2 فلا يُرى فرقُهما. والبلوغُ
   حالةٌ لا مقدار، فيقفز إلى الأحمر (ΔE 19.8 عن الذهب) **ومعه نصّ**. */
.bar{height:5px; background:var(--surface-3); border-radius:99px; overflow:hidden; margin-top:11px}
.bar i{display:block; height:100%; border-radius:99px; background:var(--gold); transition:width .3s}
.bar i.f{background:var(--bad)}
.cap{display:inline-flex; align-items:center; gap:5px; font-size:11.5px; font-weight:600;
  color:var(--bad); margin-top:7px}
.cap.done{color:var(--ok)}

/* ── الجداول ──────────────────────────────────────────── */
.scroll{overflow-x:auto; margin:0 -4px; padding:0 4px}
table{width:100%; border-collapse:collapse; font-size:14px; min-width:520px}
th{text-align:right; color:var(--ink-3); font-weight:600; font-size:11.5px;
  padding:0 10px 11px; border-bottom:1px solid var(--line); white-space:nowrap}
td{padding:13px 10px; border-bottom:1px solid var(--line-soft); vertical-align:top}
tbody tr:last-child td{border-bottom:0}
tbody tr:hover{background:var(--surface-2)}
.nm{font-weight:600; line-height:1.4}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:10.5px;
  color:var(--ink-3); direction:ltr; display:inline-block; unicode-bidi:isolate}
.sub{color:var(--ink-3); font-size:12.5px; margin-top:5px; max-width:60ch; line-height:1.6}
.num{font-variant-numeric:tabular-nums}

/* الحالة: لونٌ **ورمزٌ ونصّ** — لا لون وحده */
.st{display:inline-flex; align-items:center; gap:6px; padding:3px 10px; border-radius:999px;
  font-size:11.5px; font-weight:600; border:1px solid transparent; white-space:nowrap}
.st .g{font-size:9px; line-height:1}
.st.ok{color:var(--ok); background:color-mix(in srgb,var(--ok) 12%,transparent);
  border-color:color-mix(in srgb,var(--ok) 32%,transparent)}
.st.warn{color:var(--warn); background:color-mix(in srgb,var(--warn) 12%,transparent);
  border-color:color-mix(in srgb,var(--warn) 32%,transparent)}
.st.bad{color:var(--bad); background:color-mix(in srgb,var(--bad) 12%,transparent);
  border-color:color-mix(in srgb,var(--bad) 32%,transparent)}
.st.idle{color:var(--ink-3); background:var(--surface-3); border-color:var(--line)}
.chip{display:inline-block; padding:2px 9px; border-radius:6px; font-size:11px;
  background:var(--surface-3); color:var(--ink-2); margin:3px 0 0 4px}

/* الاستحقاق: مقياس مقدار — تدرّج هيئةٍ واحدة، والرقم بلون النصّ */
.worth{display:flex; align-items:center; gap:9px; min-width:104px}
.worth .track{flex:1; height:5px; background:var(--surface-3); border-radius:99px; overflow:hidden}
.worth .fill{display:block; height:100%; border-radius:99px}
.worth .val{font-variant-numeric:tabular-nums; font-size:12.5px; color:var(--ink-2); min-width:32px}

/* ── الأزرار ──────────────────────────────────────────── */
button,.btn{font:inherit; font-weight:600; border-radius:9px; cursor:pointer; border:1px solid transparent;
  padding:9px 16px; display:inline-flex; align-items:center; gap:7px; text-decoration:none;
  transition:filter .12s, background .12s}
.p{background:var(--gold); color:var(--on-gold)}
.g{background:var(--surface-3); color:var(--ink); border-color:var(--line)}
.d{background:color-mix(in srgb,var(--bad) 16%,var(--surface-3)); color:var(--bad);
  border-color:color-mix(in srgb,var(--bad) 38%,transparent)}
.sm{padding:6px 12px; font-size:12.5px; border-radius:7px}
button:hover,.btn:hover{filter:brightness(1.12)}
button:disabled{opacity:.42; cursor:not-allowed; filter:none}
form.inline{display:inline; margin:0}

.field{display:flex; flex-direction:column; gap:6px}
label{font-size:12px; color:var(--ink-3)}
input[type=number],input[type=password],select{
  background:var(--bg); border:1px solid var(--line); border-radius:9px; color:var(--ink);
  padding:10px 12px; font:inherit; font-size:14px}
input[type=number]{width:120px}
.row{display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap}

/* ── الفراغ ───────────────────────────────────────────── */
.empty{padding:34px 22px; text-align:center; border:1px dashed var(--line);
  border-radius:var(--r); background:var(--surface-2)}
.empty b{display:block; font-size:15px; margin-bottom:7px; color:var(--ink)}
.empty p{margin:0 auto 16px; max-width:46ch; font-size:13px; color:var(--ink-3); line-height:1.7}

.split{display:flex; gap:16px; align-items:center; justify-content:space-between; flex-wrap:wrap}
.split p{margin:0; font-size:12.5px; color:var(--ink-3); max-width:58ch; line-height:1.7}
hr{border:0; border-top:1px solid var(--line); margin:18px 0}
footer{margin-top:34px; padding-top:18px; border-top:1px solid var(--line);
  color:var(--ink-3); font-size:12px; display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px}

/* ── الدخول ───────────────────────────────────────────── */
.auth{max-width:390px; margin:13vh auto}
.auth .glyph{width:52px; height:52px; font-size:22px; margin:0 auto 18px}
.auth h1{text-align:center; font-size:20px; margin:0 0 6px}
.auth .lede{text-align:center; color:var(--ink-3); font-size:13px; margin:0 0 22px}
.auth input{width:100%; direction:ltr; text-align:left; margin-bottom:12px}
.auth button{width:100%; justify-content:center; padding:12px}
@media(prefers-reduced-motion:reduce){*{transition:none!important; scroll-behavior:auto!important}}
`

const SCRIPT = `
(function(){
  var tabs=document.querySelectorAll('nav.tabs a');
  var panes=document.querySelectorAll('section[data-pane]');
  function show(id,push){
    var found=false;
    panes.forEach(function(p){var m=p.dataset.pane===id; p.hidden=!m; if(m)found=true;});
    if(!found){show(panes[0].dataset.pane,push); return;}
    tabs.forEach(function(t){
      var m=t.getAttribute('href')==='#'+id;
      if(m){t.setAttribute('aria-current','page');}else{t.removeAttribute('aria-current');}
    });
    if(push&&history.replaceState)history.replaceState(null,'','#'+id);
  }
  tabs.forEach(function(t){t.addEventListener('click',function(e){
    e.preventDefault(); show(t.getAttribute('href').slice(1),true);
  });});
  show((location.hash||'').slice(1)||panes[0].dataset.pane,false);

  // تأكيدٌ قبل فعلٍ يوقف النظام كلّه
  document.querySelectorAll('form[data-confirm]').forEach(function(f){
    f.addEventListener('submit',function(e){
      if(!confirm(f.dataset.confirm)){e.preventDefault(); return;}
      var b=f.querySelector('button'); if(b){b.disabled=true; b.textContent='…';}
    });
  });
  // زرٌّ مضغوط لا يُضغط مرّتين — نداءٌ مدفوع لا يُكرَّر بنقرةٍ عصبيّة
  document.querySelectorAll('form[data-busy]').forEach(function(f){
    f.addEventListener('submit',function(){
      var b=f.querySelector('button'); if(b){b.disabled=true; b.textContent=f.dataset.busy;}
    });
  });
  // تصفية المصادر وفرزها — في المتصفّح، فلا رحلةَ خادمٍ لكلّ ضغطة
  var q=document.getElementById('flt'), s=document.getElementById('srt'),
      tb=document.getElementById('src-body');
  function apply(){
    if(!tb)return;
    var rows=Array.prototype.slice.call(tb.querySelectorAll('tr'));
    var mode=q?q.value:'all';
    rows.forEach(function(r){
      r.hidden = mode==='pending' ? r.dataset.pending!=='1'
              : mode==='analyzed' ? r.dataset.pending==='1' : false;
    });
    if(s){
      var k=s.value;
      rows.sort(function(a,b){
        if(k==='worth')return (+b.dataset.worth)-(+a.dataset.worth);
        if(k==='name')return a.dataset.name.localeCompare(b.dataset.name,'ar');
        return (+b.dataset.seen)-(+a.dataset.seen);
      }).forEach(function(r){tb.appendChild(r);});
    }
    var vis=rows.filter(function(r){return !r.hidden;}).length;
    var n=document.getElementById('shown'); if(n)n.textContent=vis;
  }
  if(q)q.addEventListener('change',apply);
  if(s)s.addEventListener('change',apply);
  apply();
})();
`

function shell(title: string, body: string, script = ''): string {
  return `<!doctype html><html lang="ar" dir="rtl"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><meta name="color-scheme" content="dark">
<title>${escapeHtml(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${STYLE}</style></head><body>${body}${script === '' ? '' : `<script>${script}</script>`}</body></html>`
}

// ── صفحة الدخول ──────────────────────────────────────────

export interface LoginState {
  readonly error?: string
  readonly blocked?: boolean
}

export function loginPage(state: LoginState = {}): string {
  const note =
    state.error === undefined
      ? ''
      : `<div class="flash ${state.blocked === true ? 'bad' : 'warn'}" role="alert">
           <span class="ic">${state.blocked === true ? '✕' : '!'}</span>
           <span>${escapeHtml(state.error)}</span></div>`
  const disabled = state.blocked === true ? ' disabled' : ''
  return shell(
    'صدى — الدخول',
    `<div class="wrap"><div class="auth">
      <div class="glyph">صدى</div>
      <h1>لوحة التحكّم</h1>
      <p class="lede">أدخل رمز الإدارة للمتابعة</p>
      ${note}
      <div class="card">
        <form method="POST" action="/panel/login">
          <div class="field"><label for="t">ADMIN_TOKEN</label>
            <input id="t" type="password" name="token" autocomplete="current-password"
                   required autofocus${disabled}></div>
          <button class="p" type="submit"${disabled}>دخول</button>
        </form>
      </div>
      <footer style="border:0;justify-content:center">الجلسة ثماني ساعات</footer>
    </div></div>`,
  )
}

// ── الصفحة الرئيسة ───────────────────────────────────────

export interface PanelSource {
  readonly id: string
  readonly driveFileId: string
  readonly name: string
  readonly analyzed: boolean
  readonly stale: boolean
  readonly worth: number | null
  readonly summary: string | null
  readonly reason: string | null
  readonly themes: string[]
  readonly lastSeenAt: string
}

export interface PanelProvider {
  readonly name: string
  readonly label: string
  readonly configured: boolean
  readonly secretName: string
  readonly howToGet: string
  readonly calls: number
  readonly spend: number
  /** من أين جاء المفتاح المستعمَل فعلا. */
  readonly source: 'worker_secret' | 'vault' | 'none'
  /** «AIzaSy…7f2a» — أوّله وآخره. ولا يوجد الوسط مقروءا في أيّ مكان. */
  readonly hint: string | null
  readonly enabled: boolean
  readonly dailyCap: number | null
  readonly spendToday: number
  readonly verifiedAt: string | null
  readonly updatedAt: string | null
}

export interface PanelFlash {
  readonly kind: 'ok' | 'warn' | 'bad'
  readonly text: string
}

export interface PanelData {
  readonly paused: boolean
  readonly autoEnqueue: boolean
  readonly analysisCap: number
  readonly spendCap: number
  readonly usedAnalyses: number
  readonly usedSpend: number
  readonly spend30d: number
  readonly series: { day: string; total: number }[]
  readonly sources: PanelSource[]
  readonly providers: PanelProvider[]
  readonly routing: { task: string; model: string; why: string; ready: boolean; implemented: boolean }[]
  readonly postsBuilt: boolean
  readonly flash: PanelFlash | null
  readonly now: Date
}

const TASK_LABEL: Readonly<Record<string, string>> = {
  analyze: 'الفهم — الحكم على المصدر',
  draft: 'الكتابة — صياغة المنشور',
  image: 'الصورة — التوليد البصريّ',
}

function pct(used: number, cap: number): number {
  if (cap <= 0) return 100
  return Math.min(100, Math.round((used / cap) * 100))
}

/**
 * مقياسُ مقدار: هيئةٌ واحدة تتدرّج بالطول لا بالهيئة.
 * والبلوغ حالةٌ لا مقدار — فيقفز إلى الأحمر **ومعه نصّ**، لأنّ الحالة
 * لا تقع على اللون وحده.
 */
function bar(used: number, cap: number, label = 'بلغ السقف'): string {
  const p = pct(used, cap)
  const full = p >= 100
  return `<div class="bar"><i class="${full ? 'f' : ''}" style="width:${p}%"></i></div>` +
    (full
      ? `<div class="cap${label === 'بلغ السقف' ? '' : ' done'}"><span aria-hidden="true">■</span>${escapeHtml(label)}</div>`
      : '')
}

/**
 * رسمُ منطقةٍ صغير للإنفاق.
 *
 * السلسلة كاملةٌ بأصفارها: خطٌّ يقفز فوق يومٍ خالٍ يوصل الاثنين بالأربعاء
 * وكأنّ الثلاثاء لم يكن. **وسلسلةٌ كلّها أصفار تُرسم خطّا عند القاع**، لا
 * قمّةً كاذبة من قسمةٍ على صفر.
 */
function sparkline(series: { day: string; total: number }[]): string {
  if (series.length < 2) return '<div class="n">لا بيانات كافية بعد</div>'
  const w = 260
  const h = 46
  const max = Math.max(...series.map((d) => d.total))
  const step = w / (series.length - 1)
  const y = (v: number): number => (max <= 0 ? h - 2 : h - 2 - (v / max) * (h - 6))
  const pts = series.map((d, i) => `${(i * step).toFixed(1)},${y(d.total).toFixed(1)}`)
  const line = `M ${pts.join(' L ')}`
  const area = `${line} L ${w},${h} L 0,${h} Z`
  const peak = series.reduce((a, b) => (b.total > a.total ? b : a))
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" role="img" preserveAspectRatio="none"
    aria-label="إنفاق ${series.length} يوما، أعلاه ${money(peak.total)} في ${peak.day}">
    <defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="var(--gold)" stop-opacity=".26"/>
      <stop offset="100%" stop-color="var(--gold)" stop-opacity="0"/>
    </linearGradient></defs>
    <path d="${area}" fill="url(#sg)"/>
    <path d="${line}" fill="none" stroke="var(--gold)" stroke-width="2"
      stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`
}

/** درجةٌ مقياسُ مقدار: تدرّجُ هيئةٍ واحدة، والرقم بلون النصّ لا بلون العلامة. */
function worthCell(worth: number | null): string {
  if (worth === null) return '<span class="st idle"><span class="g">○</span>لم يُحلَّل</span>'
  const p = Math.round(worth * 100)
  const shade = worth >= 0.66 ? 'var(--gold)' : worth >= 0.33 ? 'var(--gold-soft)' : 'var(--ink-3)'
  return `<div class="worth" title="درجة الاستحقاق ${worth.toFixed(2)} من 1">
    <div class="track"><span class="fill" style="width:${p}%;background:${shade}"></span></div>
    <span class="val">${worth.toFixed(2)}</span></div>`
}

function sourceRow(s: PanelSource, now: Date): string {
  const pending = !s.analyzed || s.stale
  const status = s.stale
    ? '<span class="st warn"><span class="g">▲</span>تغيّر بعد التحليل</span>'
    : s.analyzed
      ? '<span class="st ok"><span class="g">●</span>محلَّل</span>'
      : '<span class="st idle"><span class="g">○</span>ينتظر</span>'

  const themes = s.themes.slice(0, 5).map((t) => `<span class="chip">${escapeHtml(t)}</span>`).join('')
  const body = s.summary === null
    ? ''
    : `<div class="sub">${escapeHtml(s.summary)}</div>` +
      (s.reason === null ? '' : `<div class="sub">— ${escapeHtml(s.reason)}</div>`) +
      (themes === '' ? '' : `<div style="margin-top:6px">${themes}</div>`)

  const action = pending
    ? `<form class="inline" method="POST" action="/panel/analyze" data-busy="جارٍ…">
         <input type="hidden" name="id" value="${escapeHtml(s.id)}">
         <button class="g sm" type="submit">حلّل الآن</button></form>`
    : '<span class="mono">—</span>'

  const seen = Date.parse(s.lastSeenAt.replace(' ', 'T') + 'Z') || 0
  return `<tr data-pending="${pending ? '1' : '0'}" data-worth="${s.worth ?? -1}"
      data-name="${escapeHtml(s.name)}" data-seen="${seen}">
    <td><div class="nm">${escapeHtml(s.name)}</div>
        <div class="mono">${escapeHtml(s.driveFileId)}</div>${body}</td>
    <td>${status}</td>
    <td>${worthCell(s.worth)}</td>
    <td><span title="${escapeHtml(s.lastSeenAt)} UTC">${escapeHtml(relativeTime(s.lastSeenAt, now))}</span></td>
    <td>${action}</td>
  </tr>`
}

export function panelPage(d: PanelData): string {
  const pending = d.sources.filter((s) => !s.analyzed || s.stale).length
  const ready = d.sources.length - pending
  const missing = d.providers.filter((p) => !p.configured).length

  // منطقة الإعلان تُنشأ دائما وإن كانت فارغة: قارئ الشاشة لا يعلن ما ظهر
  // في منطقةٍ وُلدت معه — الحيّةُ يجب أن تسبق الرسالة لا أن تأتي بها
  const flash = `<div id="flash" role="status" aria-live="polite">${
    d.flash === null
      ? ''
      : `<div class="flash ${d.flash.kind}">
           <span class="ic">${d.flash.kind === 'ok' ? '✓' : d.flash.kind === 'warn' ? '!' : '✕'}</span>
           <span>${escapeHtml(d.flash.text)}</span></div>`
  }</div>`

  const state = d.paused
    ? '<span class="pill off"><i class="led"></i>موقوف مؤقتا</span>'
    : '<span class="pill on"><i class="led"></i>يعمل</span>'

  const scanBtn = `<form class="inline" method="POST" action="/panel/scan" data-busy="جارٍ المسح…">
      <button class="g sm" type="submit">مسح Drive الآن</button></form>`

  const sourcesTable = d.sources.length === 0
    ? `<div class="empty"><b>لا مصادر بعد</b>
         <p>صدى تقرأ مجلد Drive المشترَك معها. شغّل المسح ليظهر ما فيه.</p>
         <form class="inline" method="POST" action="/panel/scan" data-busy="جارٍ المسح…">
           <button class="p" type="submit">مسح Drive الآن</button></form></div>`
    : `<div class="row" style="margin-bottom:14px">
         <div class="field"><label for="flt">التصفية</label>
           <select id="flt"><option value="all">الكلّ</option>
             <option value="pending">ما ينتظر تحليلا</option>
             <option value="analyzed">المحلَّل</option></select></div>
         <div class="field"><label for="srt">الفرز</label>
           <select id="srt"><option value="seen">الأحدث مسحا</option>
             <option value="worth">الأعلى استحقاقا</option>
             <option value="name">الاسم</option></select></div>
         <div class="grow"></div>
         <div class="tile" style="text-align:left">
           <span class="n">يُعرض <b id="shown">${d.sources.length}</b> من ${d.sources.length}</span></div>
       </div>
       <div class="scroll"><table>
         <thead><tr><th>المصدر</th><th>الحال</th><th>الاستحقاق</th><th>آخر مسح</th><th></th></tr></thead>
         <tbody id="src-body">${d.sources.map((s) => sourceRow(s, d.now)).join('')}</tbody>
       </table></div>`

  const providerCards = d.providers.map((p) => {
    const status = !p.configured
      ? '<span class="st bad"><span class="g">✕</span>لا مفتاح</span>'
      : !p.enabled
        ? '<span class="st warn"><span class="g">▲</span>معطَّل</span>'
        : p.source === 'worker_secret'
          ? '<span class="st ok"><span class="g">●</span>سرّ Worker</span>'
          : '<span class="st ok"><span class="g">●</span>الخزانة</span>'

    const verified = p.verifiedAt === null
      ? p.configured
        ? '<span class="st idle"><span class="g">○</span>لم يُختبر</span>'
        : ''
      : `<span class="st ok" title="${escapeHtml(p.verifiedAt)} UTC"><span class="g">✓</span>اختُبر ${escapeHtml(relativeTime(p.verifiedAt, d.now))}</span>`

    // سرّ Worker لا يُدار من هنا: لا تبديلَ ولا تعطيل لما لا نملكه
    const locked = p.source === 'worker_secret'
    const capValue = p.dailyCap === null ? '' : String(p.dailyCap)

    return `<div class="card">
      <div class="card-head"><h2 style="font-size:15px;color:var(--ink)">${escapeHtml(p.label)}</h2>
        <div class="grow"></div>${status}</div>

      <div class="row" style="margin-bottom:12px">
        ${p.hint === null
          ? `<div class="sub" style="margin:0">المفتاح المتوقّع: <span class="mono">${escapeHtml(p.secretName)}</span><br>${escapeHtml(p.howToGet)}</div>`
          : `<div><div class="k" style="font-size:11.5px;color:var(--ink-3)">المفتاح المحفوظ</div>
               <span class="mono" style="font-size:13px">${escapeHtml(p.hint)}</span></div>`}
        <div class="grow"></div>${verified}
      </div>

      <div class="row" style="gap:18px;margin-bottom:14px">
        <div><div class="k" style="font-size:11.5px;color:var(--ink-3)">إنفاق اليوم</div>
          <div class="num" style="font-size:18px;font-weight:700">${money(p.spendToday)}${
            p.dailyCap === null ? '' : `<span style="font-size:12px;color:var(--ink-3)"> / ${money(p.dailyCap)}</span>`
          }</div>
          ${p.dailyCap === null ? '' : bar(p.spendToday, p.dailyCap)}</div>
        <div><div class="k" style="font-size:11.5px;color:var(--ink-3)">٣٠ يوما</div>
          <div class="num" style="font-size:18px;font-weight:700">${money(p.spend)}</div>
          <div class="n">${p.calls} نداء</div></div>
      </div>

      ${locked
        ? `<div class="sub" style="margin:0">مفتاح هذا المزوّد في <b>أسرار Worker</b> — لا يُبدَّل ولا يُعطَّل من هنا،
             وهو أأمن موضع. ولتبديله: لوحة Cloudflare ← Variables and Secrets.</div>`
        : `<form class="row" method="POST" action="/panel/providers/key" data-busy="جارٍ الحفظ…">
             <input type="hidden" name="provider" value="${escapeHtml(p.name)}">
             <div class="field" style="flex:1;min-width:200px">
               <label for="k-${escapeHtml(p.name)}">${p.hint === null ? 'أضف المفتاح' : 'استبدل المفتاح'}</label>
               <input id="k-${escapeHtml(p.name)}" type="password" name="key" required
                      autocomplete="off" style="width:100%;direction:ltr;text-align:left"></div>
             <button class="p" type="submit">حفظ</button>
           </form>
           <div class="row" style="margin-top:10px">
             ${p.hint === null ? '' : `
             <form class="inline" method="POST" action="/panel/providers/verify" data-busy="جارٍ الاختبار…">
               <input type="hidden" name="provider" value="${escapeHtml(p.name)}">
               <button class="g sm" type="submit">اختبر المفتاح</button></form>
             <form class="inline" method="POST" action="/panel/providers/toggle">
               <input type="hidden" name="provider" value="${escapeHtml(p.name)}">
               <input type="hidden" name="enabled" value="${p.enabled ? 'false' : 'true'}">
               <button class="g sm" type="submit">${p.enabled ? 'تعطيل' : 'تفعيل'}</button></form>
             <form class="inline" method="POST" action="/panel/providers/delete"
                   data-confirm="حذف مفتاح ${escapeHtml(p.label)} من الخزانة؟ لا يُسترجَع.">
               <input type="hidden" name="provider" value="${escapeHtml(p.name)}">
               <button class="d sm" type="submit">حذف</button></form>
             <div class="grow"></div>
             <form class="row" method="POST" action="/panel/providers/cap" style="gap:8px">
               <input type="hidden" name="provider" value="${escapeHtml(p.name)}">
               <div class="field"><label for="c-${escapeHtml(p.name)}">سقفه اليوميّ ($)</label>
                 <input id="c-${escapeHtml(p.name)}" type="number" name="cap" min="0" max="100"
                        step="0.5" value="${escapeHtml(capValue)}" placeholder="عامّ" style="width:100px"></div>
               <button class="g sm" type="submit" style="align-self:flex-end">حفظ</button></form>`}
           </div>`}
    </div>`
  }).join('')

  const routingRows = d.routing.map((r) => `<tr>
      <td><div class="nm">${escapeHtml(TASK_LABEL[r.task] ?? r.task)}</div>
          <div class="sub">${escapeHtml(r.why)}</div></td>
      <td><span class="mono">${escapeHtml(r.model)}</span></td>
      <td>${r.ready
        ? '<span class="st ok"><span class="g">●</span>جاهز</span>'
        : r.implemented
          ? '<span class="st bad"><span class="g">✕</span>مفتاحه ناقص</span>'
          : '<span class="st idle"><span class="g">○</span>لم تُبنَ</span>'}</td></tr>`).join('')

  const body = `
<a class="skip" href="#main">تخطّي إلى المحتوى</a>
<div class="wrap">
<header class="top">
  <div class="mark"><div class="glyph">صدى</div>
    <div class="title">لوحة التحكّم<small>SADA · STAGING</small></div></div>
  <div class="grow"></div>
  ${state}
  <form class="inline" method="POST" action="/panel/logout">
    <button class="g" type="submit">خروج</button></form>
</header>
${flash}

<nav class="tabs" aria-label="أقسام اللوحة">
  <a href="#overview">نظرة عامّة</a>
  <a href="#sources">المصادر${pending > 0 ? `<span class="count">${pending}</span>` : ''}</a>
  <a href="#providers">المزوّدون${missing > 0 ? `<span class="count">${missing}</span>` : ''}</a>
  <a href="#posts">المنشورات</a>
  <a href="#settings">الإعدادات</a>
</nav>

<main id="main">
<section data-pane="overview" hidden>
  <div class="grid c4">
    <div class="card tile"><div class="k">تحليلات اليوم</div>
      <div class="v">${d.usedAnalyses}<em> / ${d.analysisCap}</em></div>
      ${bar(d.usedAnalyses, d.analysisCap)}
      <div class="n">يُصفَّر عند منتصف الليل UTC</div></div>
    <div class="card tile"><div class="k">إنفاق اليوم</div>
      <div class="v">${money(d.usedSpend)}<em> / ${money(d.spendCap)}</em></div>
      ${bar(d.usedSpend, d.spendCap)}
      <div class="n">من دفتر الكلفة نفسه</div></div>
    <div class="card tile"><div class="k">المصادر المحلَّلة</div>
      <div class="v">${ready}<em> / ${d.sources.length}</em></div>
      ${d.sources.length === 0 ? '' : bar(ready, d.sources.length, 'كلّها محلَّلة')}
      <div class="n">${pending === 0 ? 'لا شيء ينتظر' : `${pending} تنتظر تحليلا`}</div></div>
    <div class="card tile"><div class="k">إنفاق ٣٠ يوما</div>
      <div class="v">${money(d.spend30d)}</div>
      <div class="n">كلّ المزوّدين</div></div>
  </div>
  <div class="grid c2" style="margin-top:14px">
    <div class="card"><h2>الإنفاق — أربعة عشر يوما</h2>
      <p class="hint">كلّ المزوّدين، بالدولار</p>${sparkline(d.series)}</div>
    <div class="card"><h2>إجراءات سريعة</h2>
      <p class="hint">ما يُشغَّل يدويّا الآن</p>
      <div class="row">${scanBtn}
        <a class="btn g sm" href="#sources">مراجعة المصادر</a>
        <a class="btn g sm" href="#settings">الحدود والإيقاف</a></div></div>
  </div>
</section>

<section data-pane="sources" hidden>
  <div class="card"><div class="card-head"><h2>المصادر والتحليل</h2><div class="grow"></div>${scanBtn}</div>
    ${sourcesTable}</div>
</section>

<section data-pane="providers" hidden>
  <div class="card" style="margin-bottom:14px">
    <h2>عن مفاتيح المزوّدين</h2>
    <p class="hint" style="margin:0"><b>أسرار Worker تغلب الخزانة دائما</b> — فمفتاحك الأساسيّ يبقى حيث لا تقرؤه هذه
      الشيفرة ولا تعيده Cloudflare، والخزانة للتجريب والتبديل السريع.
      ولا يُعرض مفتاحٌ كاملا هنا ولا يُخزَّن مقروءا: أوّله وآخره فقط.</p>
  </div>
  <div class="grid c2">${providerCards}</div>
  <div class="card" style="margin-top:14px"><h2>توجيه المهامّ</h2>
    <p class="hint">أيّ نموذج ينفّذ كلّ مهمّة، ولماذا</p>
    <div class="scroll"><table><thead><tr><th>المهمّة</th><th>النموذج</th><th>الحال</th></tr></thead>
      <tbody>${routingRows}</tbody></table></div>
    <div class="sub" style="margin-top:12px">إضافةُ مزوّدٍ لم يُكتب له سائق تحتاج شيفرة، لا زرّا:
      لكلّ خدمةٍ شكلُ طلبٍ وجوابٍ وأخطاءٍ مختلف. وما يُدار من هنا مفاتيحُ المزوّدين المعروفين.</div>
  </div>
</section>

<section data-pane="posts" hidden>
  <div class="card"><h2>المنشورات وتواريخ النشر</h2>
    ${d.postsBuilt ? '<div class="empty"><b>لا منشورات بعد</b></div>' : `<div class="empty">
      <b>طبقة الكتابة لم تُبنَ بعد</b>
      <p>جدول المنشورات قائم بقيوده — ولا يُنشر منشورٌ بلا موافقةٍ مسجّلة.
         وحين تُبنى الطبقة، يظهر هنا نصُّ كلّ منشور ومنصّته وتاريخ نشره وحالته.</p>
      <span class="st idle"><span class="g">○</span>مرحلةٌ قادمة</span></div>`}</div>
</section>

<section data-pane="settings" hidden>
  <div class="card"><h2>الإيقاف المؤقت</h2>
    <div class="split">
      <p>${d.paused
        ? 'النظام موقوف: لا نداء مدفوع ولا مسح ولا نشر. والقيد في الشيفرة لا في هذه الصفحة.'
        : 'الإيقاف يمنع كلّ نداء مدفوع فورا — قبل أن يُلمس Drive أو Claude، وفي الطابور و Cron معا.'}</p>
      <form class="inline" method="POST" action="/panel/settings"
            data-confirm="${d.paused ? 'استئناف عمل النظام؟' : 'إيقاف النظام كلّه؟ سيتوقّف المسح والتحليل والنشر حتّى تستأنفه.'}">
        <input type="hidden" name="key" value="paused">
        <input type="hidden" name="value" value="${d.paused ? 'false' : 'true'}">
        <button class="${d.paused ? 'p' : 'd'}" type="submit">${d.paused ? 'استئناف العمل' : 'إيقاف مؤقت'}</button>
      </form>
    </div>
  </div>

  <div class="card" style="margin-top:14px"><h2>الإدراج الآليّ</h2>
    <div class="split">
      <p>${d.autoEnqueue
        ? `مرفوع: المسح اليوميّ (٣ فجرا UTC) يُدرج ما تغيّر في طابور الفهم، بما بقي من سقف اليوم لا بما وجد. وما يفيض يُترك لغد.`
        : `مطفأ: المسح يرصد ما تغيّر ولا يحلّل شيئا حتّى تضغط «حلّل الآن». ورفعُه يجعل الخطّ كاملا — مستندٌ تعدّله يظهر محلَّلا في اللوحة صباحا.`}</p>
      <form class="inline" method="POST" action="/panel/settings"
            data-confirm="${d.autoEnqueue
              ? 'إطفاء الإدراج الآليّ؟ لن يُحلَّل شيء إلا بأمرك.'
              : `رفعُ الإدراج الآليّ؟ سيبدأ إنفاقٌ يوميّ بلا أمرٍ منك، بحدّ ${d.analysisCap} تحليلا و ${money(d.spendCap)} في اليوم.`}">
        <input type="hidden" name="key" value="auto_enqueue">
        <input type="hidden" name="value" value="${d.autoEnqueue ? 'false' : 'true'}">
        <button class="${d.autoEnqueue ? 'g' : 'p'}" type="submit">
          ${d.autoEnqueue ? 'إطفاء' : 'رفع الإدراج الآليّ'}</button>
      </form>
    </div>
    <div class="sub" style="margin-top:12px">الحدّ يُقصّ <b>قبل</b> الإرسال لا بعده: حدٌّ يُطبَّق بعد الإنفاق ليس حدّا.</div>
  </div>

  <div class="card" style="margin-top:14px"><h2>الحدود اليوميّة</h2>
    <p class="hint">سقفان لا واحد: مستندٌ ضخم قد يكلّف أكثر من عشرة صغار، وطوفانُ ملفّاتٍ صغيرة يستنزف الحصّة.</p>
    <form class="row" method="POST" action="/panel/settings">
      <input type="hidden" name="key" value="daily_analysis_cap">
      <div class="field"><label for="c1">سقف التحليل (عدد)</label>
        <input id="c1" type="number" name="value" min="0" max="500" step="1" value="${d.analysisCap}"></div>
      <button class="p" type="submit">حفظ</button>
      <span class="n" style="align-self:center">المستهلَك اليوم: ${d.usedAnalyses}</span>
    </form>
    <hr>
    <form class="row" method="POST" action="/panel/settings">
      <input type="hidden" name="key" value="daily_spend_cap_usd">
      <div class="field"><label for="c2">سقف الإنفاق (دولار)</label>
        <input id="c2" type="number" name="value" min="0" max="100" step="0.5" value="${d.spendCap}"></div>
      <button class="p" type="submit">حفظ</button>
      <span class="n" style="align-self:center">المستهلَك اليوم: ${money(d.usedSpend)}</span>
    </form>
  </div>
</section>
</main>

<footer><span>صدى — كلّ زرٍّ هنا يحرسه قيدٌ مُختبَر في الخادم</span>
  <span class="mono">${escapeHtml(d.now.toISOString().slice(0, 16).replace('T', ' '))} UTC</span></footer>
</div>`

  return shell('صدى — لوحة التحكّم', body, SCRIPT)
}

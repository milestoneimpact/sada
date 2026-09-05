/**
 * أنماطُ اللوحة.
 *
 * كلُّ لونٍ هنا `var(--…)` ولا لونَ حرفيّ واحد — وهو ما يجعل الثيمين
 * يخرجان من ملفِّ رموزٍ واحد. وقاعدةٌ تكتب لونا صريحا تكسر أحدهما
 * صامتةً، فلا تُكتب.
 *
 * وقواعدُ اللون من مرجع التصوير لا من الذوق:
 * - **ألوان الحالة محجوزة** (جيّد · تحذير · خطر) ولا تُستعمل لسلسلةٍ ولا زينة
 * - **لا تعتمد الحالة على اللون وحده**: معه رمزٌ ونصّ دائما
 * - **درجة الاستحقاق مقياس مقدار**، فتدرّجُ هيئةٍ واحدة لا قوس قزح
 * - النصّ يلبس ألوان النصّ لا لون العلامة بجانبه
 */
import { TOKENS } from './tokens'

export const STYLE = TOKENS + `
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
  background:linear-gradient(150deg,var(--gold),var(--gold-deep)); color:var(--on-gold);
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

/* ── العامل الثاني ────────────────────────────────────── */
h3.sec{font-size:13px; margin:18px 0 8px; color:var(--ink-2); font-weight:600}
.codes{display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:8px; margin:12px 0}
.codes code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:13px; letter-spacing:.06em; direction:ltr;
  background:var(--surface-3); border:1px solid var(--line); border-radius:8px;
  padding:9px 10px; text-align:center; color:var(--ink)}
.auth .card form + form{margin-top:14px}
.or{display:flex; align-items:center; gap:10px; color:var(--ink-3); font-size:12px; margin:16px 0}
.or::before,.or::after{content:''; flex:1; height:1px; background:var(--line)}
.rec{margin-top:16px; border:1px solid var(--line); border-radius:10px; padding:12px 14px}
.rec summary{cursor:pointer; font-size:13px; color:var(--ink-2)}
.rec form{margin-top:12px}
.cancel{margin-top:16px; text-align:center}
@media(prefers-reduced-motion:reduce){*{transition:none!important; scroll-behavior:auto!important}}

/* ── مفتاح الثيم ──────────────────────────────────────── */
.theme{display:inline-flex; padding:3px; gap:2px; border-radius:999px;
  border:1px solid var(--line); background:var(--surface-2)}
.theme button{padding:6px 11px; border-radius:999px; background:transparent; border:0;
  color:var(--ink-3); font-size:12px; font-weight:600}
.theme button[aria-pressed=true]{background:var(--surface); color:var(--ink);
  box-shadow:0 1px 2px rgba(0,0,0,.08)}

/* ── التنقّل بمستويين ─────────────────────────────────── */
nav.tabs .sep{align-self:center; width:1px; height:18px; background:var(--line); margin:0 8px; flex:none}
nav.tabs .lbl{align-self:center; font-size:10.5px; font-weight:700; color:var(--ink-3);
  letter-spacing:.8px; padding:0 4px; white-space:nowrap}

/* ── القنوات ──────────────────────────────────────────── */
.ch{display:flex; flex-direction:column; gap:12px; background:var(--surface);
  border:1px solid var(--line); border-radius:var(--r-lg); padding:18px; box-shadow:var(--shadow)}
.ch.off{opacity:.72; box-shadow:none; background:var(--surface-2)}
.ch-top{display:flex; align-items:center; gap:12px}
.ch-logo{width:38px; height:38px; border-radius:10px; flex:none; display:grid; place-items:center;
  background:var(--surface-3); border:1px solid var(--line)}
.ch-logo svg{width:20px; height:20px; display:block}
.ch-name{font-weight:700; font-size:15px; line-height:1.3}
.ch-name span{display:block; font-size:11.5px; font-weight:500; color:var(--ink-3)}
.ch-note{font-size:12.5px; color:var(--ink-3); line-height:1.7; margin:0}
.ch-acc{display:flex; align-items:center; gap:9px; padding:10px 12px; border-radius:10px;
  background:var(--surface-2); border:1px solid var(--line-soft); font-size:13px}
.ch-acc .who{font-weight:600}
.ch-foot{display:flex; align-items:center; gap:9px; flex-wrap:wrap; margin-top:auto; padding-top:2px}

/* ── ما ينتظرك ────────────────────────────────────────── */
.todo{list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:2px}
.todo li{display:flex; align-items:center; gap:11px; padding:11px 2px; font-size:13.5px;
  border-bottom:1px solid var(--line-soft)}
.todo li:last-child{border-bottom:0}
.todo .dot{width:7px; height:7px; border-radius:50%; flex:none; background:var(--ink-3)}
.todo .dot.warn{background:var(--warn)} .todo .dot.bad{background:var(--bad)}
.todo .dot.ok{background:var(--ok)}
.todo a,.todo form{margin-inline-start:auto}

/* الفرقُ عن الأمس: علامةٌ **ونصّ** — والسهمُ وحده لا يُقرأ بصوتٍ عالٍ */
.delta{display:inline-flex; align-items:center; gap:4px; font-size:11.5px; font-weight:600;
  margin-top:8px; color:var(--ink-3)}
.delta.up{color:var(--ok)} .delta.down{color:var(--warn)}

/* ── الجداول تنقلب بطاقاتٍ على الشاشة الضيّقة ─────────── */
@media(max-width:720px){
  .scroll{overflow:visible; margin:0}
  table{min-width:0; display:block}
  thead{position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0)}
  tbody,tr,td{display:block; width:100%}
  tr{border:1px solid var(--line); border-radius:var(--r); padding:12px; margin-bottom:10px;
    background:var(--surface-2)}
  tbody tr:hover{background:var(--surface-2)}
  td{border:0; padding:5px 0}
  td::before{content:attr(data-label); display:block; font-size:10.5px; color:var(--ink-3);
    margin-bottom:3px; letter-spacing:.3px}
  td:first-child::before{display:none}
}
`

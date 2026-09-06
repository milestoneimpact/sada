/**
 * أنماطُ اللوحة — هيكلُ تطبيقٍ لا صفحة.
 *
 * كلُّ لونٍ هنا `var(--…)` ولا لونَ حرفيّ واحد. وقاعدةٌ تكتب لونا صريحا
 * تكسر أحد الثيمين صامتةً، فلا تُكتب.
 *
 * ## ثلاثةُ مبادئَ تحكم ما يلي
 *
 * ١ · **الهيكلُ ثلاثُ طبقات**: رافدةٌ وشريطٌ علويّ على `--chrome`،
 *     ومحتوًى على `--bg`، وبطاقاتٌ على `--surface`. ولوحةٌ كلُّ شيءٍ
 *     فيها على أرضٍ واحدة تبدو صفحةً لا نظاما.
 *
 * ٢ · **المسافاتُ من سلّمِ أربعة**: ٤ · ٨ · ١٢ · ١٦ · ٢٠ · ٢٤ · ٣٢.
 *     ورقمٌ خارج السلّم يُرى ولو لم يُعرَف سببُه.
 *
 * ٣ · **قواعدُ اللون من مرجع التصوير لا من الذوق**: ألوانُ الحالة
 *     محجوزة، ولا تعتمد حالةٌ على اللون وحده (معه رمزٌ ونصّ دائما)،
 *     ودرجةُ الاستحقاق مقياسُ مقدارٍ فتدرّجُ هيئةٍ واحدة لا قوس قزح.
 */
import { TOKENS } from './tokens'

export const STYLE = TOKENS + `
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{
  margin:0; background:var(--bg); color:var(--ink); direction:rtl;
  font-family:"IBM Plex Sans Arabic","Noto Sans Arabic",system-ui,-apple-system,"Segoe UI",sans-serif;
  font-size:14px; line-height:1.6; -webkit-font-smoothing:antialiased;
  font-feature-settings:"kern" 1;
}
:focus-visible{outline:2px solid var(--gold); outline-offset:2px; border-radius:6px}
.skip{position:absolute; right:-9999px; top:8px; background:var(--gold); color:var(--on-gold);
  padding:10px 16px; border-radius:8px; z-index:99; font-weight:700}
.skip:focus{right:12px}
.grow{flex:1}
h1,h2,h3{margin:0}

/* ══ هيكلُ التطبيق ═══════════════════════════════════════════ */
.app{display:grid; grid-template-columns:256px 1fr; min-height:100vh}

/* ── الرافدة ───────────────────────────────────────────────── */
.rail{background:var(--chrome); border-inline-start:1px solid var(--line);
  display:flex; flex-direction:column; position:sticky; top:0; height:100vh; overflow-y:auto}
.rail-head{padding:20px 20px 16px; display:flex; align-items:center; gap:11px}
.glyph{width:36px; height:36px; border-radius:10px; display:grid; place-items:center; flex:none;
  background:linear-gradient(150deg,var(--gold-soft),var(--gold-deep)); color:var(--on-gold);
  font-weight:800; font-size:15px; letter-spacing:-.5px; box-shadow:var(--sh-1)}
.brand{min-width:0}
.brand b{display:block; font-size:14.5px; font-weight:700; letter-spacing:-.2px; line-height:1.3}
.brand span{display:block; font-size:10px; font-weight:600; color:var(--ink-3); letter-spacing:1.1px}

nav.tabs{padding:4px 12px 16px; display:flex; flex-direction:column; gap:1px}
nav.tabs .lbl{font-size:10px; font-weight:700; color:var(--ink-3); letter-spacing:1.1px;
  padding:16px 10px 6px}
nav.tabs .sep{display:none}
nav.tabs a{display:flex; align-items:center; gap:10px; padding:9px 10px; border-radius:var(--r-sm);
  font-size:13.5px; font-weight:600; color:var(--ink-2); text-decoration:none;
  transition:background .12s, color .12s}
nav.tabs a svg{width:16px; height:16px; flex:none; opacity:.7}
nav.tabs a:hover{background:var(--surface-2); color:var(--ink)}
nav.tabs a[aria-current=page]{background:var(--gold-wash); color:var(--gold)}
nav.tabs a[aria-current=page] svg{opacity:1}
nav.tabs .count{margin-inline-start:auto; min-width:20px; text-align:center; padding:1px 6px;
  border-radius:999px; background:var(--surface-3); font-size:10.5px; font-weight:700;
  color:var(--ink-2); font-variant-numeric:tabular-nums}
nav.tabs a[aria-current=page] .count{background:var(--gold); color:var(--on-gold)}
.rail-foot{margin-top:auto; padding:14px; border-top:1px solid var(--line-soft)}

/* ── الشريط العلويّ ────────────────────────────────────────── */
.main{min-width:0; display:flex; flex-direction:column}
/* **اسمٌ لا يتصادم**: كان هذا الشريط يسمّى .bar وهو اسمُ مقياس المقدار
   (ارتفاعُه أربعةُ بكسل) — فكان المقياسُ يدهسه فينسحق الشريطُ إلى خيط.
   علّةٌ لا يكشفها اختبارٌ ولا مدقّق: الصفحةُ تعمل، والترويسةُ غائبة. */
.topbar{position:sticky; top:0; z-index:20; background:var(--chrome);
  border-bottom:1px solid var(--line); padding:0 24px; min-height:60px; flex:none;
  display:flex; align-items:center; gap:12px}
.topbar h1{font-size:16px; font-weight:700; letter-spacing:-.2px}
.topbar .crumb{font-size:11.5px; color:var(--ink-3); margin-top:1px}
.content{padding:20px 24px 48px; max-width:1500px; width:100%}

.pill{display:inline-flex; align-items:center; gap:7px; padding:5px 11px; border-radius:999px;
  font-size:12px; font-weight:650; border:1px solid var(--line); background:var(--surface-2)}
.pill .led{width:6px; height:6px; border-radius:50%; background:var(--ink-3); flex:none}
.pill.on{color:var(--ok); background:var(--ok-wash); border-color:color-mix(in srgb,var(--ok) 26%,transparent)}
.pill.on .led{background:var(--ok)}
.pill.off{color:var(--warn); background:var(--warn-wash);
  border-color:color-mix(in srgb,var(--warn) 34%,transparent)}
.pill.off .led{background:var(--warn)}

.theme{display:inline-flex; padding:2px; gap:1px; border-radius:999px;
  border:1px solid var(--line); background:var(--surface-2)}
.theme button{padding:5px 10px; border-radius:999px; background:transparent; border:0;
  color:var(--ink-3); font-size:11.5px; font-weight:650}
.theme button[aria-pressed=true]{background:var(--surface); color:var(--ink); box-shadow:var(--sh-1)}

/* ── الإشعار ───────────────────────────────────────────────── */
.flash{display:flex; align-items:flex-start; gap:10px; padding:11px 14px; border-radius:var(--r);
  margin-bottom:16px; font-size:13px; border:1px solid var(--line); background:var(--surface)}
.flash .ic{flex:none; font-weight:800; font-size:13px; line-height:1.55}
.flash.ok{border-color:color-mix(in srgb,var(--ok) 28%,transparent); background:var(--ok-wash)}
.flash.ok .ic{color:var(--ok)}
.flash.warn{border-color:color-mix(in srgb,var(--warn) 32%,transparent); background:var(--warn-wash)}
.flash.warn .ic{color:var(--warn)}
.flash.bad{border-color:color-mix(in srgb,var(--bad) 32%,transparent); background:var(--bad-wash)}
.flash.bad .ic{color:var(--bad)}

section[hidden]{display:none}

/* ══ الشبكة والبطاقات ════════════════════════════════════════ */
.grid{display:grid; gap:12px}
.c4{grid-template-columns:repeat(4,1fr)} .c3{grid-template-columns:repeat(3,1fr)}
.c2{grid-template-columns:repeat(2,1fr)}
.c21{grid-template-columns:2fr 1fr}
@media(max-width:1180px){.c4{grid-template-columns:repeat(2,1fr)} .c21{grid-template-columns:1fr}}
@media(max-width:900px){.c3,.c2{grid-template-columns:1fr}}
@media(max-width:560px){.c4{grid-template-columns:1fr}}

.card{background:var(--surface); border:1px solid var(--line); border-radius:var(--r-lg);
  padding:18px 20px; box-shadow:var(--sh-1)}
.card > h2{font-size:14px; font-weight:700; letter-spacing:-.15px; margin-bottom:3px}
.card > .hint{margin:0 0 14px; font-size:12px; color:var(--ink-3); line-height:1.65}
.card-head{display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:14px}
.card-head h2{margin:0}
h3.sec{font-size:11px; font-weight:700; color:var(--ink-3); letter-spacing:1px;
  margin:22px 0 10px; padding-bottom:8px; border-bottom:1px solid var(--line-soft)}

/* ── بطاقةُ المؤشّر ────────────────────────────────────────── */
.tile{display:flex; flex-direction:column}
.tile .k{font-size:11px; font-weight:650; color:var(--ink-3); letter-spacing:.4px}
.tile .v{font-size:32px; font-weight:700; line-height:1.15; letter-spacing:-1px;
  font-variant-numeric:tabular-nums; margin-top:6px;
  /* العزلُ يثبّت ترتيبَ الرقم ورمزِ العملة، والمحاذاةُ تُبقيه تحت لصيقته */
  direction:ltr; unicode-bidi:isolate; text-align:right}
.tile .v em{font-style:normal; font-size:14px; font-weight:600; color:var(--ink-3);
  letter-spacing:0; margin-inline-start:2px}
.tile .n{font-size:11.5px; color:var(--ink-3); margin-top:9px}

/* المقياس **مقياسُ مقدار لا تصنيف**: هيئةٌ واحدة تتدرّج، ولا كهرمان فيه
   قطّ — الكهرمان يقع من ذهب الهوية على ΔE 7.2 فلا يُرى فرقُهما. والبلوغُ
   حالةٌ لا مقدار، فيقفز إلى الأحمر (ΔE 19.8 عن الذهب) **ومعه نصّ**. */
.bar{height:4px; background:var(--surface-3); border-radius:99px; overflow:hidden; margin-top:12px}
.bar i{display:block; height:100%; border-radius:99px; background:var(--gold); transition:width .3s}
.bar i.f{background:var(--bad)}
.cap{display:inline-flex; align-items:center; gap:5px; font-size:11px; font-weight:650;
  color:var(--bad); margin-top:7px}
.cap.done{color:var(--ok)}

/* الفرقُ عن الأمس: علامةٌ **ونصّ** — والسهمُ وحده لا يُقرأ بصوتٍ عالٍ */
.delta{display:inline-flex; align-items:center; gap:4px; font-size:11.5px; font-weight:650;
  margin-top:9px; color:var(--ink-3)}
.delta.up{color:var(--ok)} .delta.down{color:var(--warn)}
.delta .ar{font-size:9px; line-height:1}

/* ══ الجداول ═════════════════════════════════════════════════ */
.scroll{overflow-x:auto; margin:0 -2px; padding:0 2px}
table{width:100%; border-collapse:collapse; font-size:13.5px; min-width:520px}
th{text-align:right; color:var(--ink-3); font-weight:650; font-size:10.5px; letter-spacing:.5px;
  padding:0 10px 9px; border-bottom:1px solid var(--line); white-space:nowrap}
td{padding:12px 10px; border-bottom:1px solid var(--line-soft); vertical-align:top}
tbody tr:last-child td{border-bottom:0}
tbody tr:hover{background:var(--surface-2)}
.nm{font-weight:650; line-height:1.45}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:10.5px;
  color:var(--ink-3); direction:ltr; display:inline-block; unicode-bidi:isolate}
.sub{color:var(--ink-3); font-size:12px; margin-top:5px; max-width:62ch; line-height:1.65}
.num,.money{font-variant-numeric:tabular-nums}
/* المبلغُ نصٌّ لاتينيّ داخل عربيّ: بلا عزلٍ ينقلب رمزُ العملة إلى آخره */
.money{direction:ltr; unicode-bidi:isolate; display:inline-block}

/* الحالة: لونٌ **ورمزٌ ونصّ** — لا لون وحده */
.st{display:inline-flex; align-items:center; gap:6px; padding:3px 9px; border-radius:6px;
  font-size:11px; font-weight:650; border:1px solid transparent; white-space:nowrap}
.st .g{font-size:8px; line-height:1}
.st.ok{color:var(--ok); background:var(--ok-wash); border-color:color-mix(in srgb,var(--ok) 24%,transparent)}
.st.warn{color:var(--warn); background:var(--warn-wash); border-color:color-mix(in srgb,var(--warn) 28%,transparent)}
.st.bad{color:var(--bad); background:var(--bad-wash); border-color:color-mix(in srgb,var(--bad) 28%,transparent)}
.st.idle{color:var(--ink-3); background:var(--surface-2); border-color:var(--line)}
.chip{display:inline-block; padding:2px 8px; border-radius:5px; font-size:10.5px; font-weight:600;
  background:var(--surface-2); border:1px solid var(--line-soft); color:var(--ink-2); margin:3px 0 0 4px}

/* الاستحقاق: مقياس مقدار — تدرّج هيئةٍ واحدة، والرقم بلون النصّ */
.worth{display:flex; align-items:center; gap:9px; min-width:104px}
.worth .track{flex:1; height:4px; background:var(--surface-3); border-radius:99px; overflow:hidden}
.worth .fill{display:block; height:100%; border-radius:99px}
.worth .val{font-variant-numeric:tabular-nums; font-size:12px; color:var(--ink-2); min-width:30px}

/* ══ الأزرار — أربعُ درجاتٍ لا لونان ══════════════════════════ */
button,.btn{font:inherit; font-size:13px; font-weight:650; border-radius:var(--r-sm); cursor:pointer;
  border:1px solid transparent; padding:8px 14px; display:inline-flex; align-items:center; gap:7px;
  text-decoration:none; white-space:nowrap; transition:background .12s, border-color .12s, box-shadow .12s}
.p{background:var(--gold); color:var(--on-gold); box-shadow:var(--sh-1)}
.p:hover{background:var(--gold-deep)}
.g{background:var(--surface); color:var(--ink); border-color:var(--line-strong); box-shadow:var(--sh-1)}
.g:hover{background:var(--surface-2)}
.d{background:var(--surface); color:var(--bad); border-color:color-mix(in srgb,var(--bad) 34%,transparent)}
.d:hover{background:var(--bad-wash)}
.sm{padding:5px 11px; font-size:12px; border-radius:7px}
button:disabled{opacity:.45; cursor:not-allowed}
form.inline{display:inline; margin:0}

.field{display:flex; flex-direction:column; gap:5px}
label{font-size:11.5px; font-weight:600; color:var(--ink-3)}
input[type=number],input[type=password],input[type=text],input:not([type]),select{
  background:var(--surface); border:1px solid var(--line-strong); border-radius:var(--r-sm);
  color:var(--ink); padding:8px 11px; font:inherit; font-size:13.5px; transition:border-color .12s, box-shadow .12s}
input:focus,select:focus{border-color:var(--gold); box-shadow:0 0 0 3px var(--ring); outline:none}
input[type=number]{width:110px}
.row{display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap}

/* ── الفراغ ────────────────────────────────────────────────── */
.empty{padding:30px 20px; text-align:center; border:1px dashed var(--line-strong);
  border-radius:var(--r); background:var(--surface-2)}
.empty b{display:block; font-size:14px; margin-bottom:6px; color:var(--ink)}
.empty p{margin:0 auto 14px; max-width:46ch; font-size:12.5px; color:var(--ink-3); line-height:1.7}

.split{display:flex; gap:16px; align-items:center; justify-content:space-between; flex-wrap:wrap}
.split p{margin:0; font-size:12.5px; color:var(--ink-3); max-width:60ch; line-height:1.7}
hr{border:0; border-top:1px solid var(--line-soft); margin:16px 0}
footer{margin-top:28px; padding-top:16px; border-top:1px solid var(--line-soft);
  color:var(--ink-3); font-size:11.5px; display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px}

/* ── ما ينتظرك ─────────────────────────────────────────────── */
.todo{list-style:none; margin:0; padding:0; display:flex; flex-direction:column}
.todo li{display:flex; align-items:center; gap:10px; padding:10px 2px; font-size:13px;
  border-bottom:1px solid var(--line-soft)}
.todo li:last-child{border-bottom:0}
.todo .dot{width:6px; height:6px; border-radius:50%; flex:none; background:var(--ink-3)}
.todo .dot.warn{background:var(--warn)} .todo .dot.bad{background:var(--bad)}
.todo .dot.ok{background:var(--ok)}
.todo a,.todo form{margin-inline-start:auto}

/* ── الرسم ─────────────────────────────────────────────────── */
.chart{margin-top:4px}
.chart svg{display:block; width:100%}
/* **الاتّجاه اللاتينيّ هنا ليس زينة**: نصُّ SVG يرث اتّجاه الصفحة، و RTL
   يقلب معنى text-anchor — فتمتدّ التسميةُ خارج المربّع وتُقصّ. علّةٌ
   لا تظهر إلا بالنظر إلى الرسم مرسوما. */
.chart .axis{font-size:10px; fill:var(--ink-3); font-variant-numeric:tabular-nums;
  direction:ltr; unicode-bidi:isolate}
.chart .grid-l{stroke:var(--line-soft); stroke-width:1}
.chart .base{stroke:var(--line); stroke-width:1}
.legend{display:flex; gap:14px; flex-wrap:wrap; margin-top:12px; font-size:11.5px; color:var(--ink-3)}
.legend b{color:var(--ink); font-weight:650; font-variant-numeric:tabular-nums;
  direction:ltr; unicode-bidi:isolate; display:inline-block}

/* ── القنوات ───────────────────────────────────────────────── */
/* صفُّ تمهيدٍ رفيع بدل بطاقةٍ كاملة: الشرحُ يصحب القسم ولا يزاحمه */
.lede-row{display:flex; align-items:baseline; gap:12px; flex-wrap:wrap; margin-bottom:12px}
.lede-note{font-size:11.5px; color:var(--ink-3); line-height:1.6; flex-basis:100%}
@media(min-width:1100px){.lede-note{flex-basis:auto; max-width:62ch; text-align:end}}

.ch{display:flex; flex-direction:column; gap:11px; background:var(--surface);
  border:1px solid var(--line); border-radius:var(--r-lg); padding:16px 18px; box-shadow:var(--sh-1)}
.ch.off{background:var(--surface-2); box-shadow:none; border-style:dashed}
.ch-top{display:flex; align-items:center; gap:11px}
.ch-logo{width:34px; height:34px; border-radius:9px; flex:none; display:grid; place-items:center;
  background:var(--surface-2); border:1px solid var(--line); color:var(--ink-2)}
.ch.off .ch-logo{color:var(--ink-3)}
.ch-logo svg{width:17px; height:17px; display:block}
.ch-name{font-weight:700; font-size:14px; line-height:1.35; letter-spacing:-.1px}
.ch-name span{display:block; font-size:11px; font-weight:500; color:var(--ink-3); letter-spacing:0}
.ch-note{font-size:12px; color:var(--ink-3); line-height:1.7; margin:0}
.ch-acc{display:flex; align-items:center; gap:8px; padding:9px 11px; border-radius:var(--r-sm);
  background:var(--surface-2); border:1px solid var(--line-soft); font-size:12.5px}
.ch-acc .who{font-weight:650}
/* نصٌّ عربيّ خافت — ولا يُعطى صنفَ mono: خطٌّ لاتينيّ باتّجاه LTR يفكّك
   الحروف العربيّة فتُقرأ «سا ئقا». علّةٌ تُرى ولا يكشفها اختبار. */
.ago{font-size:11.5px; color:var(--ink-3)}
.ch-foot{display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-top:auto; padding-top:3px}

/* ── المسوّدات ────────────────────────────────────────────────────────
   المربّعُ نفسه هو المعروض: لا «اعرض» ثمّ «عدّل» في شاشتين، فما يُقرأ هو
   ما يُرسَل. ولذلك يرث خطَّ الصفحة وقياسَها لا خطَّ النماذج الافتراضيّ —
   منشورٌ يُقرأ في مربّعٍ ضيّق يُحكَم عليه بغير ما سيبدو عليه. */
/* شبكةٌ لا تمطّ: بطاقتان بنصّين مختلفَي الطول لا تُجبَران على ارتفاعٍ
   واحد، وإلّا انفتح تحت الأقصر فراغٌ بقدر فرق النصّين. */
.grid.ragged{align-items:start}
.draft{display:flex; flex-direction:column; gap:11px; background:var(--surface);
  border:1px solid var(--line); border-radius:var(--r-lg); padding:16px 18px; box-shadow:var(--sh-1)}
.draft.done{background:var(--surface-2); box-shadow:none}
.draft-top{display:flex; align-items:center; gap:11px}
.ch-logo.sm{width:30px; height:30px; border-radius:8px}
.draft-why{margin:0; font-size:12px; color:var(--ink-3); line-height:1.7;
  border-inline-start:2px solid var(--line); padding-inline-start:10px}
/* ارتفاعٌ من مضاعفاتِ السطر بالضبط.
   بارتفاعٍ حرّ يقع السطرُ الأخير مقصوصا في نصفه — نصفُ حرفٍ عند الحافّة
   يُقرأ عطلا في الرسم لا نصّا يفيض. والحسابُ يقتضي line-height بالبكسل
   لا بمعامل: المعاملُ يعطي كسرا لا يُضرَب فيبقى النصف. */
.draft-text{width:100%; box-sizing:border-box; font:inherit; font-size:13.5px;
  line-height:26px; color:var(--ink); background:var(--bg); border:1px solid var(--line);
  border-radius:var(--r); padding:13px 15px; resize:vertical;
  white-space:pre-wrap; word-break:break-word; overflow-y:auto;
  height:calc(var(--lines) * 26px + 28px)}
/* المقروءُ يأخذ قدرَ نصّه بسقف: مربّعٌ ثابتٌ تحت نصٍّ قصير فراغٌ بلا سبب،
   وتحت نصٍّ طويل تمريرٌ في نصٍّ لا يُحرَّر. */
.draft-text[data-ro]{height:auto; max-height:calc(var(--lines) * 26px + 28px)}
.draft-text:focus{outline:none; border-color:var(--gold-deep); box-shadow:var(--ring)}
/* المقروءُ لا يُسحَب: مقبضُ التحجيم يظهر على أيّ عنصرٍ فيه resize، ومقبضٌ
   على نصٍّ لا يُحرَّر يعد بما لا يقع. */
.draft-text.ro{background:var(--surface-3); color:var(--ink-2); resize:none}
.draft-foot{display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-top:9px}
/* عدّادٌ لاتينيّ الأرقام: يُعزَل عن اتّجاه الصفحة فلا يُقلب «١٢٠ / ٢٨٠» */
.draft-foot .count{font-size:11.5px; color:var(--ink-3); font-variant-numeric:tabular-nums;
  direction:ltr; unicode-bidi:isolate}
.draft-foot .count b{color:var(--ink-2); font-weight:700}
.draft-foot .count.warn b{color:var(--warn)}
.draft-foot .count.bad b{color:var(--bad)}
.draft-meta{display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-top:auto; padding-top:3px}
/* شريطُ الجدولة — سطرٌ مميّزٌ عن جسم البطاقة: هو قرارٌ آخر غير الاعتماد،
   ودمجُه في الذيل يجعل الضغطتين تبدوان ضغطةً واحدة. */
.sched{display:flex; align-items:flex-end; gap:10px; flex-wrap:wrap; margin-top:10px;
  padding:11px 13px; border-radius:var(--r); background:var(--surface-2);
  border:1px solid var(--line-soft)}
.sched.set{background:var(--ok-wash); border-color:transparent}
.sched.gone{background:var(--warn-wash); border-color:transparent}
.sched.none{background:var(--warn-wash); border-color:transparent; align-items:center}
.sched .field{margin:0; flex:1 1 150px; min-width:0}
.sched label{font-size:10.5px}
.sched input,.sched select{padding:7px 9px; font-size:12.5px}
/* الموعدُ لاتينيّ الأرقام ويُعزَل عن اتّجاه الصفحة */
.sched .when{font-size:12px; color:var(--ink-2); direction:ltr; unicode-bidi:isolate}
.sched .ago{flex:1 1 auto}

/* ── العامل الثاني ─────────────────────────────────────────── */
.codes{display:grid; grid-template-columns:repeat(auto-fill,minmax(148px,1fr)); gap:8px; margin:12px 0}
.codes code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:13px;
  letter-spacing:.06em; direction:ltr; background:var(--surface-2); border:1px solid var(--line);
  border-radius:var(--r-sm); padding:9px 10px; text-align:center; color:var(--ink)}

/* ══ صفحتا الدخول والعامل الثاني ═════════════════════════════ */
.wrap{max-width:1180px; margin:0 auto; padding:24px 20px 60px}
.auth{max-width:400px; margin:12vh auto}
.auth .glyph{width:50px; height:50px; font-size:20px; border-radius:14px; margin:0 auto 18px}
.auth h1{text-align:center; font-size:19px; margin:0 0 6px; letter-spacing:-.3px}
.auth .lede{text-align:center; color:var(--ink-3); font-size:13px; margin:0 0 22px}
.auth .card{padding:22px}
.auth input{width:100%; direction:ltr; text-align:left; margin-bottom:12px}
.auth button{width:100%; justify-content:center; padding:11px}
.auth .card form + form{margin-top:14px}
.or{display:flex; align-items:center; gap:10px; color:var(--ink-3); font-size:11.5px; margin:16px 0}
.or::before,.or::after{content:''; flex:1; height:1px; background:var(--line)}
.rec{margin-top:16px; border:1px solid var(--line); border-radius:var(--r); padding:12px 14px;
  background:var(--surface)}
.rec summary{cursor:pointer; font-size:12.5px; color:var(--ink-2)}
.rec form{margin-top:12px}
.cancel{margin-top:16px; text-align:center}
.n{font-size:11.5px; color:var(--ink-3); margin-top:8px}

/* ══ الشاشة الضيّقة ══════════════════════════════════════════ */
@media(max-width:960px){
  .app{grid-template-columns:1fr}
  .rail{position:static; height:auto; border-inline-start:0; border-bottom:1px solid var(--line)}
  .rail-head{padding:14px 16px 10px}
  nav.tabs{flex-direction:row; overflow-x:auto; padding:0 12px 10px; gap:4px; scrollbar-width:none}
  nav.tabs::-webkit-scrollbar{display:none}
  nav.tabs .lbl{display:none}
  nav.tabs a{white-space:nowrap; padding:8px 12px}
  nav.tabs .count{margin-inline-start:4px}
  .rail-foot{display:none}
  .topbar{padding:0 16px} .content{padding:16px}
}
@media(max-width:720px){
  .draft-text{height:calc((var(--lines) + 6) * 26px + 28px)}
  .draft-text[data-ro]{height:auto; max-height:calc((var(--lines) + 6) * 26px + 28px)}
  .scroll{overflow:visible; margin:0}
  table{min-width:0; display:block}
  thead{position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0)}
  tbody,tr,td{display:block; width:100%}
  tr{border:1px solid var(--line); border-radius:var(--r); padding:12px; margin-bottom:10px;
    background:var(--surface-2)}
  tbody tr:hover{background:var(--surface-2)}
  td{border:0; padding:4px 0}
  td::before{content:attr(data-label); display:block; font-size:10px; color:var(--ink-3);
    margin-bottom:3px; letter-spacing:.4px}
  td:first-child::before{display:none}
}
/* ── الوثائق العامّة ──────────────────────────────────────────────────
   عمودٌ واحدٌ مقيَّدُ العرض: سطرٌ يمتدّ عبر شاشةٍ عريضة يُقرأ بعينٍ تقفز،
   وهذه صفحةٌ يُراد لها أن تُقرأ لا أن تُتصفَّح. */
.doc{max-width:820px; margin:0 auto; padding:44px 22px 72px; background:var(--bg)}
.doc header{border-bottom:1px solid var(--line); padding-bottom:22px; margin-bottom:8px}
.doc .glyph{width:38px; height:38px; margin-bottom:14px}
.doc h1{font-size:27px; letter-spacing:-.5px; margin:0 0 10px}
.doc h2{font-size:16px; margin:32px 0 10px; letter-spacing:-.2px}
.doc .lede{font-size:14.5px; line-height:1.9; color:var(--ink-2); margin:0 0 10px}
.doc p{font-size:13.5px; line-height:1.95; color:var(--ink-2); margin:0 0 11px}
.doc ul{margin:0 0 11px; padding-inline-start:20px}
.doc li{font-size:13.5px; line-height:1.95; color:var(--ink-2); margin-bottom:7px}
.doc b{color:var(--ink)}
.doc a{color:var(--gold-deep); text-underline-offset:3px}
.doc table{font-size:12.5px}
.doc td b{font-weight:650}
/* «ما لا يقع» أبرزُ ما في الصفحة: هو ما يبحث عنه المراجع أوّلا */
.doc ul.never{list-style:none; padding:0; margin:0}
.doc ul.never li{background:var(--surface-2); border:1px solid var(--line-soft);
  border-radius:var(--r); padding:11px 14px; margin-bottom:8px}
/* مصطلحٌ لا يُكسَر عند شرطته: «AES-» في سطرٍ و«GCM» في التالي يُقرأ اسمين */
.doc .nb{white-space:nowrap}
.doc footer{margin-top:40px; padding-top:18px; border-top:1px solid var(--line); font-size:12.5px}

@media(prefers-reduced-motion:reduce){*{transition:none!important; scroll-behavior:auto!important}}
`

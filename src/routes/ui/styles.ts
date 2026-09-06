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
  /* والترتيبُ ليس ذوقا: أوّلُ خطٍّ يملك المحرف يفوز به. و Inter لا
     عربيّةَ فيه، فيأخذ اللاتينيَّ والرقمَ ويسقط إلى Tajawal في
     العربيّة. ولو قُدّم Tajawal لأخذ اللاتينيَّ أيضا — وهو ليس
     أحسنَ فيه، والمعرّفاتُ عندنا لاتينيّةٌ كثيرة. */
  font-family:"Inter","Tajawal",system-ui,-apple-system,"Segoe UI",sans-serif;
  font-size:14px; line-height:1.6; -webkit-font-smoothing:antialiased;
  font-feature-settings:"kern" 1;
  /* أوزانٌ محمّلةٌ فعلا: 400 · 500 · 600 · 700. وطلبُ 650 أو 800 من خطٍّ
     لا يحملهما يجعل المتصفّحَ **يصطنع الثخانة** بتغليظ الحروف رقميّا —
     والعربيّةُ المصطنَعةُ الثخانة تلتصق نقاطُها وتُقرأ ملطّخة. */
  font-synthesis-weight:none;
}
/* وهجُ الهويّة على الأرض — طبقةٌ مثبَّتةٌ تحت كلّ شيء.
   وأرضٌ بلونٍ مصمتٍ تُقرأ ورقةً، ووهجٌ خفيفٌ يجعلها حيّزا. و«fixed»
   تُبقيه ساكنا مع التمرير، فلا يُقرأ عنصرا يتحرّك. */
body::before{content:''; position:fixed; inset:0; pointer-events:none; z-index:0;
  background:var(--bloom)}
.app,.doc,.wrap{position:relative; z-index:1}
/* ── حلقةُ التركيز ────────────────────────────────────────────────────
   طبقتان: خطٌّ بلون الهويّة وحلقةٌ بلون السطح تحته. فعلى أرضٍ داكنةٍ
   يُرى التركواز، وعليه نفسِه — زرٌّ أوّليٌّ مثلا — تُرى الحلقة. وحلقةٌ بلونٍ واحد
   تختفي على ما يوافقها، وهو أكثرُ ما يقع على الأزرار الأوّليّة. */
:focus-visible{outline:2px solid var(--brand); outline-offset:2px; border-radius:6px;
  box-shadow:0 0 0 4px var(--surface)}

/* التحديدُ بالهويّة: تفصيلٌ يُرى في كلّ نسخةٍ ولصق */
::selection{background:color-mix(in srgb,var(--brand) 26%,transparent); color:var(--ink)}

/* وشريطُ التمرير يتبع الثيم: شريطٌ فضّيٌّ فاتح على لوحةٍ داكنة نشاز */
*{scrollbar-width:thin; scrollbar-color:var(--line-strong) transparent}
::-webkit-scrollbar{width:11px; height:11px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:var(--line-strong); border-radius:99px;
  border:3px solid transparent; background-clip:content-box}
::-webkit-scrollbar-thumb:hover{background:var(--ink-3); background-clip:content-box}
/* رابطُ التخطّي: يُقصّ ولا يُنفى خارج الشاشة.
   وكان عند right:-9999px، **فامتدّ المستند إلى 10389px** وصار الجوّالُ
   يُسحَب جانبا. وهي علّةٌ لا تُرى: العنصرُ نفسه غيرُ مرئيّ، وأثرُه
   شريطُ تمريرٍ أفقيّ يظنّه الناظر عيبا في التخطيط.
   والقصُّ يخفيه من العين ويبقيه لقارئ الشاشة — وذاك كلُّ الغرض. */
.skip{position:absolute; width:1px; height:1px; overflow:hidden;
  clip-path:inset(50%); white-space:nowrap;
  background:var(--brand); color:var(--on-brand);
  padding:var(--s-3) var(--s-4); border-radius:8px; z-index:99; font-weight:700}
.skip:focus{width:auto; height:auto; overflow:visible; clip-path:none;
  inset-inline-start:auto; inset-inline-end:var(--s-3); top:var(--s-2)}
.grow{flex:1}
h1,h2,h3{margin:0}

/* ══ هيكلُ التطبيق ═══════════════════════════════════════════ */
.app{display:grid; grid-template-columns:256px 1fr; min-height:100vh}

/* ── الرافدة ───────────────────────────────────────────────── */
.rail{background:var(--chrome); border-inline-start:1px solid var(--line);
  display:flex; flex-direction:column; position:sticky; top:0; height:100vh; overflow-y:auto;
  background-image:var(--sheen)}
/* خيطٌ بلون الهويّة على الحافّة الداخليّة — الحدُّ الرماديُّ وحده يفصل، وهذا
   **يقول أيُّ الجهتين هي البيت**. ويخفت نزولا فلا يصير خطّا مرسوما. */
.rail::after{content:''; position:absolute; inset-block:0; inset-inline-end:0; width:1px;
  background:linear-gradient(180deg,color-mix(in srgb,var(--brand) 55%,transparent),transparent 46%);
  pointer-events:none}
.rail-head{padding:22px 20px 18px; display:flex; align-items:center; gap:12px}
/* ── العلامة ──────────────────────────────────────────────────────────
   الأقواسُ نفسها التي في رمز التبويب، مرسومةً لا مكتوبة. وكانت مربّعا
   فيه «صدى» بخمسةَ عشرَ بكسلا: **الحرفان يزدحمان في ستٍّ وثلاثين**،
   فيُقرأ المربّعُ لطخةً — وهي عينُ العلّة التي مُنعت في رمز التبويب. */
.glyph{width:38px; height:38px; border-radius:11px; display:grid; place-items:center; flex:none;
  background:linear-gradient(150deg,var(--brand-soft),var(--brand-deep)); color:var(--on-brand);
  box-shadow:var(--sh-1), inset 0 1px 0 rgba(255,255,255,.28)}
/* نسبةٌ لا قياسٌ ثابت: العلامةُ نفسها تظهر بـ 38 في الرافدة و 50 في
   شاشة الدخول و 38 في الوثائق — وقياسٌ ثابتٌ يجعلها تسبح في الأكبر. */
.glyph svg{width:56%; height:56%; display:block}
.brand{min-width:0}
.brand b{display:block; font-size:15px; font-weight:700; letter-spacing:-.2px; line-height:1.3}
.brand span{display:block; font-size:9.5px; font-weight:600; color:var(--ink-3);
  letter-spacing:var(--ls-eyebrow); direction:ltr; unicode-bidi:isolate; margin-top:1px}

nav.tabs{padding:4px 12px 16px; display:flex; flex-direction:column; gap:1px}
nav.tabs .lbl{font-size:10px; font-weight:700; color:var(--ink-3); letter-spacing:1.1px;
  padding:16px 10px 6px}
nav.tabs .sep{display:none}
nav.tabs a{display:flex; align-items:center; gap:var(--s-3); padding:var(--s-2) var(--s-3);
  border-radius:var(--r-sm); min-height:var(--tap); font-size:var(--t-base); font-weight:600; color:var(--ink-2); text-decoration:none;
  transition:background .12s, color .12s}
nav.tabs a svg{width:16px; height:16px; flex:none; opacity:.7}
nav.tabs a:hover{background:var(--surface-2); color:var(--ink)}
/* والحاليُّ يُعلَّم **بحدٍّ ولون**: أرضيّةٌ خافتةٌ وحدها تختفي في
   وضع التباين العالي، وخطٌّ على الحافّة يبقى. */
nav.tabs a[aria-current=page]{background:var(--brand-wash); color:var(--brand); position:relative}
nav.tabs a[aria-current=page]::before{content:''; position:absolute; inset-block:7px;
  inset-inline-start:0; width:2.5px; border-radius:99px; background:var(--brand)}
nav.tabs a[aria-current=page] svg{opacity:1}
nav.tabs .count{margin-inline-start:auto; min-width:20px; text-align:center; padding:1px 6px;
  border-radius:999px; background:var(--surface-3); font-size:10.5px; font-weight:700;
  color:var(--ink-2); font-variant-numeric:tabular-nums}
nav.tabs a[aria-current=page] .count{background:var(--brand); color:var(--on-brand)}
.rail-foot{margin-top:auto; padding:14px; border-top:1px solid var(--line-soft)}

/* ── الشريط العلويّ ────────────────────────────────────────── */
.main{min-width:0; display:flex; flex-direction:column}
/* **اسمٌ لا يتصادم**: كان هذا الشريط يسمّى .bar وهو اسمُ مقياس المقدار
   (ارتفاعُه أربعةُ بكسل) — فكان المقياسُ يدهسه فينسحق الشريطُ إلى خيط.
   علّةٌ لا يكشفها اختبارٌ ولا مدقّق: الصفحةُ تعمل، والترويسةُ غائبة. */
.topbar{position:sticky; top:0; z-index:20; background:var(--chrome);
  border-bottom:1px solid var(--line); padding:0 var(--s-6); min-height:60px; flex:none;
  display:flex; align-items:center; gap:var(--s-3); transition:box-shadow .18s}
/* ظلٌّ يظهر حين يكون فوقك محتوًى — إشارةٌ تُقرأ بلا وعي: الشريطُ يطفو
   فوق شيء، لا يجلس على أرضٍ فارغة. ويُضاف بـ JS لأنّ CSS وحدها لا تعرف
   موضعَ التمرير. */
.topbar.lifted{box-shadow:var(--sh-2)}
.topbar h1{font-size:var(--t-md); font-weight:600; letter-spacing:-.1px; color:var(--ink-2)}
.topbar .crumb{font-size:var(--t-xs); color:var(--ink-3); margin-top:1px}
/* عنوانُ الشريط يظهر **حين يغيب عنوانُ الصفحة** لا قبله.
   وعنوانان متطابقان فوق بعضهما تكرارٌ يُقرأ عيبا؛ وشريطٌ لاصقٌ بلا
   عنوانٍ بعد التمرير يترك القارئَ بلا موضع. فالظهورُ مربوطٌ بالإشارة
   نفسها التي يظهر بها الظلّ: أنّ فوقك محتوًى. */
.topbar .ttl{opacity:0; transform:translateY(4px); transition:opacity .18s, transform .18s}
.topbar.lifted .ttl{opacity:1; transform:none}
.content{padding:var(--s-5) var(--s-6) var(--s-12); max-width:1500px; width:100%}

/* ══ رأسُ الصفحة ══════════════════════════════════════════════════════
   كان أعلى ما في الشاشة عنوانا بستّةَ عشرَ بكسلا وتحته أرقامٌ باثنين
   وثلاثين — **فالرقمُ هو الذي يُقرأ عنوانا**، وتصير الشاشةُ لوحةَ
   عدّاداتٍ لا شاشةَ عمل.

   فصار للصفحة رأسٌ: لصيقةٌ فوق العنوان تقول أين أنت، وعنوانٌ بأربعةٍ
   وثلاثين، وسطرٌ يقول ما هذه الشاشة. وثلاثتُها معا هي ما يجعل الصفحةَ
   **تبدأ** بدل أن تنفتح في وسطها. */
.page-head{display:flex; align-items:flex-end; gap:var(--s-5); flex-wrap:wrap;
  margin:var(--s-2) 0 var(--s-6)}
.page-head .txt{min-width:0; flex:1 1 340px}
.eyebrow{display:flex; align-items:center; gap:var(--s-2); font-size:var(--t-xs);
  font-weight:700; color:var(--brand); margin-bottom:var(--s-2)}
.eyebrow .ln{height:1px; width:26px; flex:none;
  background:linear-gradient(90deg,var(--brand),transparent)}
.page-head h1{font-size:var(--t-display); font-weight:700; line-height:1.2;
  letter-spacing:-.9px; margin:0}
.page-head .lede{margin:var(--s-3) 0 0; font-size:var(--t-md); line-height:var(--lh);
  color:var(--ink-2); max-width:var(--measure)}
.page-head .aside{display:flex; align-items:center; gap:var(--s-2); flex-wrap:wrap}
@media(max-width:720px){.page-head h1{font-size:var(--t-2xl); letter-spacing:-.5px}}

.pill{display:inline-flex; align-items:center; gap:7px; padding:5px 11px; border-radius:999px;
  font-size:12px; font-weight:600; border:1px solid var(--line); background:var(--surface-2)}
.pill .led{width:6px; height:6px; border-radius:50%; background:var(--ink-3); flex:none}
.pill.on{color:var(--ok); background:var(--ok-wash); border-color:color-mix(in srgb,var(--ok) 26%,transparent)}
.pill.on .led{background:var(--ok)}
.pill.off{color:var(--warn); background:var(--warn-wash);
  border-color:color-mix(in srgb,var(--warn) 34%,transparent)}
.pill.off .led{background:var(--warn)}

.theme{display:inline-flex; padding:2px; gap:1px; border-radius:999px;
  border:1px solid var(--line); background:var(--surface-2)}
.theme button{padding:5px 10px; border-radius:999px; background:transparent; border:0;
  color:var(--ink-3); font-size:11.5px; font-weight:600}
.theme button[aria-pressed=true]{background:var(--surface); color:var(--ink); box-shadow:var(--sh-1)}

/* ── الإشعار ───────────────────────────────────────────────── */
.flash{display:flex; align-items:flex-start; gap:var(--s-3); padding:var(--s-3) var(--s-4);
  border-radius:var(--r); margin-bottom:var(--s-4); font-size:var(--t-base); border:1px solid var(--line); background:var(--surface)}
.flash .ic{flex:none; font-weight:700; font-size:13px; line-height:1.55}
.flash.ok{border-color:color-mix(in srgb,var(--ok) 28%,transparent); background:var(--ok-wash)}
.flash.ok .ic{color:var(--ok)}
.flash.warn{border-color:color-mix(in srgb,var(--warn) 32%,transparent); background:var(--warn-wash)}
.flash.warn .ic{color:var(--warn)}
.flash.bad{border-color:color-mix(in srgb,var(--bad) 32%,transparent); background:var(--bad-wash)}
.flash.bad .ic{color:var(--bad)}

section[hidden]{display:none}

/* ══ الشبكة والبطاقات ════════════════════════════════════════ */
/* عنصرُ الشبكة لا ينكمش تحت محتواه ما لم يُقَل له: min-width الافتراضيّة
   auto، **فسلسلةٌ لا تنكسر — عنوانُ API أو اسمُ نموذج — تدفع العمودَ
   فيفيض المستندُ كلُّه**. وقيس ذلك في لوح المزوّدين: 406px على شاشة 390. */
.grid{display:grid; gap:var(--s-3)}
.grid>*{min-width:0}
/* والسلاسلُ اللاتينيّة الطويلة تُكسَر عند الضرورة لا تُقصّ: عنوانٌ مقصوصٌ
   لا يُنسَخ صحيحا، ومكسورٌ يُقرأ ويُنسَخ. */
.mono{overflow-wrap:anywhere}
/* أرقامٌ ثابتةُ العرض في كلّ موضعٍ تتبدّل فيه: عمودٌ يهتزّ مع كلّ تحديث
   يُقرأ عطلا. وكانت مضبوطةً على البطاقات وحدها. */
table,.chip,.count,.ago,.money,.num,.n{font-variant-numeric:tabular-nums}
.c4{grid-template-columns:repeat(4,1fr)} .c3{grid-template-columns:repeat(3,1fr)}
.c2{grid-template-columns:repeat(2,1fr)}
.c21{grid-template-columns:2fr 1fr}
@media(max-width:1180px){.c4{grid-template-columns:repeat(2,1fr)} .c21{grid-template-columns:1fr}}
@media(max-width:900px){.c3,.c2{grid-template-columns:1fr}}
@media(max-width:560px){.c4{grid-template-columns:1fr}}

/* ── مادّةُ السطح ─────────────────────────────────────────────────────
   ثلاث طبقاتٍ على كلّ بطاقة، ولكلٍّ سببٌ ماديّ:
   لونُ السطح، ثمّ «--sheen» تدرّجٌ في وجهه (السطحُ المستوي لا يعكس
   الضوءَ بالتساوي)، ثمّ «--hair» خيطُ ضوءٍ على حافّته العليا (الحافّةُ
   المواجهةُ للضوء أفتح).

   والفرقُ بينها وبين مستطيلٍ بحدٍّ رماديّ هو الفرقُ بين «مرسومٍ» و
   «مصنوع» — وهو ما لا يُصلحه تكبيرُ الظلّ. */
.card{background:var(--surface); background-image:var(--sheen);
  border:1px solid var(--line); border-radius:var(--r-lg);
  padding:var(--s-5) var(--s-6); box-shadow:var(--sh-1), inset 0 1px 0 var(--hair);
  transition:box-shadow .18s, border-color .18s}
/* بطاقةُ القناة والمسوّدة تحملان فعلا، فترتفعان قليلا عند التحويم.
   وبطاقاتُ العرض لا ترتفع: حركةٌ بلا فعلٍ خلفها تَعِد بما لا يقع. */
.ch:hover,.draft:hover{box-shadow:var(--sh-2), inset 0 1px 0 var(--hair);
  border-color:var(--line-strong)}
.card > h2{font-size:var(--t-lg); font-weight:700; letter-spacing:-.25px; margin-bottom:3px}
.card > .hint{margin:0 0 var(--s-4); font-size:var(--t-sm); color:var(--ink-3); line-height:var(--lh)}
.card-head{display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:14px}
.card-head h2{margin:0}
/* عنوانُ القسم: خيطٌ قصيرٌ بلون الهويّة يبدؤه بدل خطٍّ رماديٍّ يمتدّ تحته.
   والخطُّ الممتدُّ يفصل ولا يُعلِّم — والقصيرُ يُعلِّم موضعَ البداية. */
h3.sec{font-size:var(--t-xs); font-weight:700; color:var(--ink-2); letter-spacing:.8px;
  margin:var(--s-8) 0 var(--s-3); padding-bottom:var(--s-2);
  border-bottom:1px solid var(--line-soft); position:relative}
h3.sec::after{content:''; position:absolute; bottom:-1px; inset-inline-start:0; width:34px;
  height:2px; border-radius:99px; background:var(--brand)}

/* ── بطاقةُ المؤشّر ────────────────────────────────────────── */
.tile{display:flex; flex-direction:column; position:relative; overflow:hidden}
/* خيطٌ بلون الهويّة على رأس المؤشّر — يربط الأربعةَ بعضَها ببعضٍ فتُقرأ صفّا
   واحدا، ويميّزها عن بطاقات المحتوى تحتها. */
.tile::before{content:''; position:absolute; inset-inline:0; top:0; height:2px;
  background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--brand) 70%,transparent),transparent)}
.tile .k{font-size:var(--t-xs); font-weight:600; color:var(--ink-3); letter-spacing:.4px}
.tile .v{font-size:var(--t-display); font-weight:700; line-height:1.12; letter-spacing:-1.4px;
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
.bar i{display:block; height:100%; border-radius:99px; background:var(--brand); transition:width .3s}
.bar i.f{background:var(--bad)}
.cap{display:inline-flex; align-items:center; gap:5px; font-size:11px; font-weight:600;
  color:var(--bad); margin-top:7px}
.cap.done{color:var(--ok)}

/* الفرقُ عن الأمس: علامةٌ **ونصّ** — والسهمُ وحده لا يُقرأ بصوتٍ عالٍ */
.delta{display:inline-flex; align-items:center; gap:4px; font-size:11.5px; font-weight:600;
  margin-top:9px; color:var(--ink-3)}
.delta.up{color:var(--ok)} .delta.down{color:var(--warn)}
.delta .ar{font-size:9px; line-height:1}

/* ══ الجداول ═════════════════════════════════════════════════ */
.scroll{overflow-x:auto; margin:0 -2px; padding:0 2px}
table{width:100%; border-collapse:collapse; font-size:13.5px; min-width:520px}
th{text-align:right; color:var(--ink-3); font-weight:600; font-size:10.5px; letter-spacing:.5px;
  padding:0 10px 9px; border-bottom:1px solid var(--line); white-space:nowrap}
td{padding:12px 10px; border-bottom:1px solid var(--line-soft); vertical-align:top}
tbody tr:last-child td{border-bottom:0}
tbody tr:hover{background:var(--surface-2)}
.nm{font-weight:600; line-height:1.45}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:10.5px;
  color:var(--ink-3); direction:ltr; display:inline-block; unicode-bidi:isolate}
.sub{color:var(--ink-3); font-size:12px; margin-top:5px; max-width:62ch; line-height:1.65}
.num,.money{font-variant-numeric:tabular-nums}
/* المبلغُ نصٌّ لاتينيّ داخل عربيّ: بلا عزلٍ ينقلب رمزُ العملة إلى آخره */
.money{direction:ltr; unicode-bidi:isolate; display:inline-block}

/* الحالة: لونٌ **ورمزٌ ونصّ** — لا لون وحده */
.st{display:inline-flex; align-items:center; gap:6px; padding:3px 9px; border-radius:6px;
  font-size:11px; font-weight:600; border:1px solid transparent; white-space:nowrap}
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
/* ارتفاعُ الهدف 44 لا 31: WCAG 2.5.5 و Apple HIG. والحشوُ يُترك
   للتوسيط، و min-height هي التي تضمن — فنصٌّ قصيرٌ لا يُقزّم الزرّ. */
button,.btn{font:inherit; font-size:var(--t-base); font-weight:600; border-radius:var(--r-sm);
  cursor:pointer; border:1px solid transparent; padding:var(--s-2) var(--s-4);
  min-height:var(--tap); min-width:var(--tap); box-sizing:border-box;
  display:inline-flex; align-items:center; justify-content:center; gap:var(--s-2);
  text-decoration:none; white-space:nowrap; transition:background .12s, border-color .12s, box-shadow .12s}
.p{background:var(--brand); color:var(--on-brand); box-shadow:var(--sh-1)}
.p:hover{background:var(--brand-deep)}
.g{background:var(--surface); color:var(--ink); border-color:var(--line-strong); box-shadow:var(--sh-1)}
.g:hover{background:var(--surface-2)}
.d{background:var(--surface); color:var(--bad); border-color:color-mix(in srgb,var(--bad) 34%,transparent)}
.d:hover{background:var(--bad-wash)}
/* «الصغير» أضيقُ حشوا لا أقصرُ قامة: زرٌّ في جدولٍ يزدحم عرضا لا طولا،
   وتقصيرُه يُسقطه دون حدّ الهدف — وهو ما كان يقع. */
.sm{padding:var(--s-1) var(--s-3); font-size:var(--t-sm); border-radius:7px}
button:disabled{opacity:.45; cursor:not-allowed}
/* ضغطةٌ تُحسّ: إزاحةُ بكسلٍ واحد. وبلا ردٍّ يظنّ الضاغطُ أنّه لم يُصب */
button:active:not(:disabled),.btn:active{transform:translateY(1px)}

/* ── دوّامةُ الانتظار ─────────────────────────────────────────────────
   النصُّ يبقى والدوّامةُ تُضاف: كان النصُّ يُستبدَل بـ «جارٍ…»، **فيضيع
   ما كان مكتوبا** — ويسأل الضاغطُ نفسَه ماذا ضغط. والنداءُ هنا مدفوع،
   فالسؤالُ ليس هيّنا. */
button[data-busy-on]{position:relative}
button[data-busy-on]::after{content:''; width:13px; height:13px; flex:none;
  border-radius:50%; border:2px solid currentColor; border-top-color:transparent;
  animation:spin .7s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){
  button[data-busy-on]::after{animation:none; border-top-color:currentColor; opacity:.4}
}
form.inline{display:inline; margin:0}

.field{display:flex; flex-direction:column; gap:var(--s-1)}
label{font-size:var(--t-xs); font-weight:600; color:var(--ink-3)}
input[type=number],input[type=password],input[type=text],input[type=datetime-local],
input:not([type]),select,textarea{
  background:var(--surface); border:1px solid var(--line-strong); border-radius:var(--r-sm);
  color:var(--ink); padding:var(--s-2) var(--s-3); font:inherit; font-size:var(--t-md);
  min-height:var(--tap); box-sizing:border-box;
  transition:border-color .12s, box-shadow .12s}
input:focus,select:focus,textarea:focus{border-color:var(--brand); box-shadow:0 0 0 3px var(--ring); outline:none}
input[type=number]{width:110px}
/* ── طولُ السطر ───────────────────────────────────────────────────────
   45 إلى 75 محرفا. وقيست كتلٌ عند 135 — ضعفُ الحدّ. والعينُ ترتدّ من
   آخر السطر إلى أوّل التالي، فتفقد موضعَها كلّما طال.

   والتقييدُ بأقصى عرضٍ لا بعرضٍ ثابت: الكتلةُ تضيق مع الشاشة ولا تتمدّد
   معها، فالجوّالُ سليمٌ أصلا والشاشةُ العريضة هي التي تُفسد. */
p,li,.sub,.ch-note,.lede-note,.hint,.draft-why,.empty p{max-width:var(--measure)}
/* وما يقرؤه غريبٌ لا مالك — الوثائقُ العامّة — يُعطى فسحةً أوسع قليلا */
.doc p,.doc li{max-width:var(--measure-wide)}

.row{display:flex; gap:var(--s-3); align-items:flex-end; flex-wrap:wrap}

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
.legend b{color:var(--ink); font-weight:600; font-variant-numeric:tabular-nums;
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
.ch-name{font-weight:700; font-size:var(--t-md); line-height:1.35; letter-spacing:-.1px}
.ch-name a{color:inherit; text-decoration:none}
.ch-name a:hover{color:var(--brand); text-decoration:underline; text-underline-offset:3px}
.ch-name span{display:block; font-size:11px; font-weight:500; color:var(--ink-3); letter-spacing:0}
.ch-note{font-size:12px; color:var(--ink-3); line-height:1.7; margin:0}
.ch-acc{display:flex; align-items:center; gap:8px; padding:9px 11px; border-radius:var(--r-sm);
  background:var(--surface-2); border:1px solid var(--line-soft); font-size:12.5px}
.ch-acc .who{font-weight:600}
/* نصٌّ عربيّ خافت — ولا يُعطى صنفَ mono: خطٌّ لاتينيّ باتّجاه LTR يفكّك
   الحروف العربيّة فتُقرأ «سا ئقا». علّةٌ تُرى ولا يكشفها اختبار. */
.ago{font-size:11.5px; color:var(--ink-3)}
.ch-foot{display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-top:auto; padding-top:3px}
/* ══ الدليل — الشرحُ عنصرٌ لا هامش ══════════════════════════════════
   قيل لي ثلاثَ مرّات إنّ الشرحَ «ليس بشكل هينت احترافي». وكان محقّا:
   الشرحُ كان **نصّا رماديّا صغيرا** موزّعا تحت الحقول وفوقها — صحيحا
   في موضعه، لا وزنَ له في العين.

   ونصٌّ رماديٌّ صغير يقول للقارئ شيئا واحدا: **هذا هامش، تخطَّه.** ثمّ
   نطلب منه ألّا يتخطّاه.

   فصار الشرحُ عنصرا له إطارٌ وعنوانٌ ورافدةٌ ذهبيّة ومراتب: عنوانٌ
   يُقرأ أوّلا، وخطواتٌ موصولةٌ بخيط، وحقولٌ لكلٍّ لوحُ إرشادٍ مؤطَّر لا
   سطرٌ خافت، وختامٌ يقول علامةَ النجاح وما يقع إن فشل.

   وهذا ليس تجميلا: **الوزنُ البصريُّ هو ما يُقرَأ**، وما لا يُرى لا
   يُنفَّذ — ومهمّةٌ لم تُنفَّذ في البوّابة تظهر عندنا خطأً غامضا. */
.guide{margin-top:var(--s-4); border:1px solid var(--line); border-radius:var(--r-lg);
  background:var(--surface-2); overflow:hidden; position:relative}
/* رافدةُ الهويّة: تفصل الدليلَ عمّا حوله بلا حدٍّ ثخينٍ يحبسه */
.guide::before{content:''; position:absolute; inset-block:0; inset-inline-start:0; width:3px;
  background:linear-gradient(180deg,var(--brand),color-mix(in srgb,var(--brand) 18%,transparent))}
.guide>summary{cursor:pointer; list-style:none; display:flex; align-items:center;
  gap:var(--s-3); padding:var(--s-3) var(--s-5); min-height:56px}
.guide>summary::-webkit-details-marker{display:none}
.guide>summary:hover{background:var(--surface-3)}
.guide .g-ic{flex:none; width:30px; height:30px; border-radius:9px; display:grid; place-items:center;
  background:var(--brand-wash); color:var(--brand);
  border:1px solid color-mix(in srgb,var(--brand) 26%,transparent)}
.guide .g-ic svg{width:15px; height:15px; display:block}
.guide .g-t{min-width:0}
.guide .g-t b{display:block; font-size:var(--t-md); font-weight:700; letter-spacing:-.15px}
.guide .g-t span{display:block; font-size:var(--t-sm); color:var(--ink-3); line-height:1.6;
  max-width:var(--measure)}
/* «افتح/أغلق» — وسمُ summary لا يُعلن حالَه لقارئ الشاشة بنفسه، فالنصُّ
   يقوله. وسهمٌ وحده لا يُقرأ بصوتٍ عالٍ. */
.guide .g-tog{flex:none; font-size:var(--t-sm); font-weight:600; color:var(--brand);
  display:inline-flex; align-items:center; gap:var(--s-2)}
.guide .g-tog::after{content:'▾'; font-size:10px; transition:transform .18s}
.guide[open] .g-tog::after{transform:rotate(180deg)}
.guide[open] .g-tog .lbl-open{display:none}
.guide:not([open]) .g-tog .lbl-close{display:none}
.guide-body{padding:var(--s-2) var(--s-5) var(--s-5); border-top:1px solid var(--line-soft)}

/* رابطُ البوّابة: زرٌّ لا رابطٌ في جملة. هو **أوّلُ فعلٍ** في الدليل،
   ورابطٌ مدفونٌ في سطرٍ يُقرأ بعد الخطوات لا قبلها. */
.portal{display:inline-flex; align-items:center; gap:var(--s-2); margin:var(--s-4) 0 var(--s-5);
  font-size:var(--t-sm); font-weight:600}
.portal svg{width:13px; height:13px; flex:none}

/* ── الخطوات ─────────────────────────────────────────────────────────
   رقمٌ في دائرةٍ لا نقطةٌ في قائمة: الخطواتُ تُنفَّذ بالترتيب، وتُغادَر
   الشاشةُ بينها إلى بوّابة المنصّة — فالعينُ تحتاج موضعا تعود إليه.
   ولكلّ خطوةٍ سببُها: «افعل» وحدها تُنفَّذ ولا تُفهَم، فلا تُصحَّح إن أخطأت.

   وخيطٌ يصل الدوائر: ثلاثُ دوائرَ متفرّقة تُقرأ ثلاثةَ أشياء، وموصولةً
   تُقرأ **مسارا واحدا له أوّلٌ وآخر**. */
ol.steps{margin:0 0 var(--s-5); padding:0; list-style:none;
  display:flex; flex-direction:column; gap:var(--s-4); position:relative}
ol.steps li{display:flex; gap:var(--s-3); align-items:flex-start; position:relative;
  font-size:var(--t-sm); line-height:var(--lh); color:var(--ink-2)}
/* الخيطُ من دائرةٍ إلى التي تليها — ولا يُرسَم بعد الأخيرة */
ol.steps li:not(:last-child)::before{content:''; position:absolute; top:26px; bottom:calc(-1 * var(--s-4));
  inset-inline-start:12px; width:1px; background:var(--line-strong)}
ol.steps .n{flex:none; width:25px; height:25px; border-radius:50%; margin-top:0; z-index:1;
  display:grid; place-items:center; background:var(--surface); color:var(--brand);
  font-size:var(--t-sm); font-weight:700; font-variant-numeric:tabular-nums;
  border:1px solid color-mix(in srgb,var(--brand) 40%,transparent);
  box-shadow:0 0 0 3px var(--surface-2)}
ol.steps .body{min-width:0; max-width:var(--measure); padding-top:2px}
ol.steps .what{display:block; font-weight:600; color:var(--ink); margin-bottom:3px;
  font-size:var(--t-base); line-height:var(--lh-tight)}
ol.steps .why{display:block; color:var(--ink-3)}

/* ── لوحُ الإرشاد تحت اللصيقة ─────────────────────────────────────────
   بحثُ GOV.UK: المستخدمُ يبدأ الكتابة فور رؤية الحقل، **ولا ينظر تحته
   أبدا** — فالموضعُ فوق الحقل، وهو ما كان.

   والذي تبدّل هو **الوزن**: كان سطرا رماديّا بحجم 12 لا يُميَّز عن
   الزينة، فصار لوحا مؤطَّرا برمزٍ ملوّن. والموضعُ صحيحٌ في الحالين،
   والفرقُ أنّ الثاني يُرى. */
.help{display:flex; gap:var(--s-3); align-items:flex-start; margin:var(--s-2) 0 var(--s-3);
  padding:var(--s-3) var(--s-4); border-radius:var(--r);
  background:var(--surface); border:1px solid var(--line-soft);
  font-size:var(--t-sm); line-height:var(--lh); color:var(--ink-2); max-width:var(--measure)}
.help .i{flex:none; width:17px; height:17px; border-radius:50%; margin-top:2px;
  display:grid; place-items:center; font-size:10px; font-weight:700;
  background:var(--brand-wash); color:var(--brand);
  border:1px solid color-mix(in srgb,var(--brand) 26%,transparent)}
.help b{color:var(--ink); font-weight:600}
.help .t{min-width:0}
.guide .field{margin-bottom:var(--s-5)}
.guide .field label{font-size:var(--t-base); color:var(--ink); font-weight:700}
.guide .cb .copy{margin:0}
.guide form{margin-top:var(--s-2)}

/* ── الختام: علامةُ النجاح وما يقع إن فشل ─────────────────────────────
   تُفصَل عن النموذج بلونها: هي ما يُقرأ **بعد** الحفظ، وسطرٌ رماديٌّ
   في آخر النموذج يُقرأ قبله ثمّ يُنسى.

   والاثنان معا لا واحد: «إن نجح» وحدها تترك من فشل بلا شيء — وهو
   أحوجُ الاثنين إلى سطر. */
.outcome{display:flex; gap:var(--s-3); align-items:flex-start; margin-top:var(--s-3);
  padding:var(--s-3) var(--s-4); border-radius:var(--r); background:var(--ok-wash);
  border:1px solid color-mix(in srgb,var(--ok) 20%,transparent)}
.outcome .k{flex:none; font-size:var(--t-xs); font-weight:700; color:var(--ok);
  letter-spacing:.3px; padding-top:2px; min-width:62px}
.outcome .v{font-size:var(--t-sm); line-height:var(--lh); color:var(--ink-2);
  max-width:var(--measure)}
.outcome.warn{background:var(--warn-wash);
  border-color:color-mix(in srgb,var(--warn) 22%,transparent)}
.outcome.warn .k{color:var(--warn)}

/* المطويُّ العامّ — لا يُصنَّف دليلا: صناديقُ الاسترداد وما شابهها */
.setup{border-top:1px solid var(--line-soft); padding-top:11px; margin-top:2px}
/* وسمُ summary هدفٌ يُنقر كالزرّ سواء، فيأخذ حدَّه: قيس عند 20px قامةً
   — وهو ثلثُ الحدّ. */
summary{min-height:var(--tap); display:flex; align-items:center}
.setup>summary{cursor:pointer; font-size:var(--t-sm); font-weight:600; color:var(--brand-deep);
  list-style:none; padding:var(--s-2) 0}
.setup>summary::-webkit-details-marker{display:none}
.setup>summary::before{content:'▸'; display:inline-block; margin-inline-end:var(--s-2)}
.setup[open]>summary::before{content:'▾'}
.setup-body{padding-top:10px}

.copy{display:flex; gap:var(--s-2); align-items:stretch}
.copy input{flex:1 1 auto; min-width:0; font-size:var(--t-sm);
  direction:ltr; text-align:left; background:var(--surface-2)}

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
.draft-text:focus{outline:none; border-color:var(--brand-deep); box-shadow:var(--ring)}
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
/* ── الصورة ───────────────────────────────────────────────────────────
   تُعرض بعرض البطاقة كاملا: المالك يقرّر عليها، وقرارٌ على مربّعٍ صغير
   ليس قرارا. و aspect-ratio مع object-fit:cover يمنعان القفزَ قبل
   التحميل ويمنعان المطّ بعده — وصورةٌ ممطوطة تُقرأ إهمالا. */
.pic{margin-top:10px}
/* height:auto ضروريّةٌ لا زينة: سِمَتا width/height على الوسم تُترجَمان
   إلى CSS بأولويّةٍ دنيا، فـ width:100% تغلب الأولى **ولا شيء يغلب
   الثانية** — فيبقى الارتفاع 628px والعرض عرضَ البطاقة، وتخرج الصورة
   ممطوطةً طولا. علّةٌ رأيتُها ولم يمسكها اختبار. */
.pic img{display:block; width:100%; height:auto; aspect-ratio:1.91/1; object-fit:cover;
  border-radius:var(--r); border:1px solid var(--line); background:var(--surface-2)}
.pic-foot{display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-top:8px}
.pic.none{display:flex; align-items:center; gap:9px; flex-wrap:wrap;
  padding:11px 13px; border-radius:var(--r); background:var(--surface-2);
  border:1px dashed var(--line)}
.pic.none .ago{flex:1 1 200px}
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

/* ══ شاشةُ المنصّة ═══════════════════════════════════════════════════
   بطاقةُ القناة تجيب «أمربوطةٌ أم لا» — وهو سؤالُ الضبط، يُسأل مرّةً.
   وهذه تجيب ما يُسأل كلَّ يوم: ماذا نُشر، وأين رابطُه، وما فشل ولماذا.
   ولا موضعَ لأيٍّ من ذلك في بطاقةٍ عرضُها نصفُ شاشة. */
/* شريطُ العودة — صفحةٌ خارج اللوحة تحتاج بابا يُرجَع منه، ولا رافدةَ
   فيها. و«رجوع» المتصفّح ليس بابا: مَن فتحها في تبويبٍ جديد لا رجوعَ له. */
nav.back{display:flex; align-items:center; gap:var(--s-3); padding:var(--s-3) 0 var(--s-5)}
nav.back a{font-size:var(--t-sm); font-weight:600; color:var(--ink-2); text-decoration:none;
  display:inline-flex; align-items:center; min-height:var(--tap)}
nav.back a:hover{color:var(--brand)}

.plat-logo{width:46px; height:46px; border-radius:13px; flex:none; display:grid; place-items:center;
  background:var(--surface); border:1px solid var(--line); color:var(--ink);
  box-shadow:var(--sh-1), inset 0 1px 0 var(--hair)}
.plat-logo svg{width:23px; height:23px; display:block}
.plat-logo.lg{width:58px; height:58px; border-radius:17px}
.plat-logo.lg svg{width:29px; height:29px}

/* المنشوراتُ عمودٌ واحد لا شبكة: النصُّ هو المقروء، وعمودان يقصّان
   السطرَ إلى نصفِ مقاسٍ يُقرأ فيه. */
.posts{display:flex; flex-direction:column; gap:var(--s-3)}
.post{background:var(--surface); background-image:var(--sheen);
  border:1px solid var(--line); border-radius:var(--r-lg); padding:var(--s-4) var(--s-5);
  box-shadow:var(--sh-1), inset 0 1px 0 var(--hair)}
.post-top{display:flex; align-items:center; gap:var(--s-2); flex-wrap:wrap;
  margin-bottom:var(--s-3)}
/* النصُّ كما نُشر: يحفظ أسطرَه — منشورٌ بفقرتين يُقرأ فقرةً واحدة إن
   طُويت أسطرُه، فيُحكَم عليه بغير ما ظهر عليه. */
.post-text{margin:0; white-space:pre-wrap; word-break:break-word;
  font-size:var(--t-md); line-height:var(--lh); color:var(--ink); max-width:var(--measure)}
.post-foot{display:flex; align-items:center; gap:var(--s-2); flex-wrap:wrap;
  margin-top:var(--s-3)}
/* ── صفُّ الأرقام ─────────────────────────────────────────────────────
   والشرطةُ تختلف عن الصفر: الصفرُ «قِيس فكان لا شيء»، والشرطةُ «لا يُقاس
   أصلا» — و LinkedIn لا يعطي الظهورَ لمنشور عضو. فتُعطى الشرطةُ لونا
   خافتا وعنوانا يُقرأ بالتحويم، ولا تُعرَض رقما. */
.stats{display:flex; align-items:center; gap:var(--s-5); flex-wrap:wrap;
  margin-top:var(--s-3); padding-top:var(--s-3); border-top:1px solid var(--line-soft)}
.stats.none{border-top:1px dashed var(--line); gap:var(--s-2)}
.stat{display:inline-flex; align-items:baseline; gap:var(--s-2);
  font-size:var(--t-xs); color:var(--ink-3)}
.stat b{font-size:var(--t-lg); font-weight:700; color:var(--ink);
  font-variant-numeric:tabular-nums; letter-spacing:-.3px}
.stat .na{color:var(--ink-3); font-weight:400; cursor:help}

/* سببُ الفشل بنصّه: «فشل» وحدها لا تُعالَج، والسببُ يُعالَج */
.why{display:flex; gap:var(--s-3); align-items:flex-start; margin-top:var(--s-3);
  padding:var(--s-3) var(--s-4); border-radius:var(--r);
  font-size:var(--t-sm); line-height:var(--lh); max-width:var(--measure)}
.why.bad{background:var(--bad-wash); color:var(--ink-2);
  border:1px solid color-mix(in srgb,var(--bad) 20%,transparent)}
.why .i{flex:none; color:var(--bad); font-size:10px; padding-top:4px}
.why b{color:var(--ink)}
.why .t{min-width:0}
/* الموعدُ لاتينيُّ الأرقام ويُعزَل عن اتّجاه الصفحة */
.ago.when{direction:ltr; unicode-bidi:isolate; display:inline-block}

/* ══ صفحتا الدخول والعامل الثاني ═════════════════════════════ */
.wrap{max-width:1180px; margin:0 auto; padding:24px 20px 60px}
.auth{max-width:400px; margin:12vh auto}
.auth .glyph{width:54px; height:54px; border-radius:16px; margin:0 auto 18px}
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
.doc .lede{font-size:var(--t-lg); line-height:var(--lh); color:var(--ink-2);
  /* والصدرُ أضيقُ قياسا لا أوسع: قياسُه أكبر، فالوحدةُ ch أعرض معه —
     و 70ch عنده أعطت 88 محرفا عند القياس. والرقمُ مضبوطٌ على المقياس. */
  margin:0 0 var(--s-3); max-width:54ch}
.doc p{font-size:13.5px; line-height:1.95; color:var(--ink-2); margin:0 0 11px}
.doc ul{margin:0 0 11px; padding-inline-start:20px}
.doc li{font-size:13.5px; line-height:1.95; color:var(--ink-2); margin-bottom:7px}
.doc b{color:var(--ink)}
.doc a{color:var(--brand-deep); text-underline-offset:3px}
.doc table{font-size:12.5px}
.doc td b{font-weight:600}
/* «ما لا يقع» أبرزُ ما في الصفحة: هو ما يبحث عنه المراجع أوّلا */
.doc ul.never{list-style:none; padding:0; margin:0}
.doc ul.never li{background:var(--surface-2); border:1px solid var(--line-soft);
  border-radius:var(--r); padding:11px 14px; margin-bottom:8px}
/* مصطلحٌ لا يُكسَر عند شرطته: «AES-» في سطرٍ و«GCM» في التالي يُقرأ اسمين */
.doc .nb{white-space:nowrap}
.doc footer{margin-top:40px; padding-top:18px; border-top:1px solid var(--line); font-size:12.5px}

/* ── الطباعة ──────────────────────────────────────────────────────────
   مراجعُ منصّةٍ قد يطبع سياسة الخصوصيّة، وصفحةٌ تخرج برافدةٍ وأزرارٍ
   وظلالٍ تُقرأ مسوّدةً لا وثيقة. فيبقى النصُّ وحده على بياض.

   والروابطُ تُطبَع بعناوينها: ورقةٌ فيها «اضغط هنا» لا تُتابَع. */
@media print{
  @page{margin:18mm}
  *{box-shadow:none!important; transition:none!important}
  html,body{background:#fff!important; color:#000!important}
  .rail,.topbar,.theme,.skip,footer,nav.tabs,button,.btn,form{display:none!important}
  .app{display:block}
  /* والهوامشُ من @page لا من الحاوية: حاويةٌ بلا حدٍّ أقصى تمدّ السطرَ
     عبر الورقة كلّها، وقيدُ المقاس على الفقرات يبقى قائما */
  .content,.doc{padding:0; margin:0; max-width:100%}
  .card,.ch,.draft{border:1px solid #ccc; break-inside:avoid; page-break-inside:avoid}
  section[data-pane][hidden]{display:none!important}
  h1,h2,h3{break-after:avoid; page-break-after:avoid}
  a[href^="http"]::after{content:' (' attr(href) ')'; font-size:10px; color:#555}
  .doc a[href^="mailto"]::after{content:''}
}

@media(prefers-reduced-motion:reduce){*{transition:none!important; scroll-behavior:auto!important}}
`

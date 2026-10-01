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
*{box-sizing:border-box; scrollbar-width:thin; scrollbar-color:var(--line-strong) transparent}
html{scroll-behavior:smooth;
  /* ما يُركَّز أو يُقصَد بمرساةٍ لا يختفي خلف الشريط اللاصق ولا شريط الجوّال (D-149) */
  scroll-padding-top:calc(64px + var(--s-3)); scroll-padding-bottom:calc(var(--tap) + var(--s-6))}
body{
  margin:0; background:var(--bg); color:var(--ink); direction:rtl;
  /* والترتيبُ ليس ذوقا: أوّلُ خطٍّ يملك المحرف يفوز به. و Inter لا
     عربيّةَ فيه، فيأخذ اللاتينيَّ والرقمَ ويسقط إلى Tajawal في
     العربيّة. ولو قُدّم Tajawal لأخذ اللاتينيَّ أيضا — وهو ليس
     أحسنَ فيه، والمعرّفاتُ عندنا لاتينيّةٌ كثيرة. */
  font-family:"Inter","Beiruti",system-ui,-apple-system,"Segoe UI",sans-serif;
  font-size:var(--t-base); line-height:var(--lh); -webkit-font-smoothing:antialiased;
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
:focus-visible{outline:2px solid var(--au); outline-offset:2px; border-radius:var(--r-xs);
  box-shadow:0 0 0 4px var(--surface)}
/* والعنوانُ الذي يُركَّز عليه بالشيفرة عند فتح لوحٍ (tabindex=-1) يُعلَن لقارئ الشاشة
   ولا يُؤطَّر للعين (D-177): كان إطارٌ ذهبيٌّ يحيط بعنوانٍ ‏56px كلّما فُتح لوحٌ من رابط */
[tabindex="-1"]:focus-visible{outline:none; box-shadow:none}

/* التحديدُ بالهويّة: تفصيلٌ يُرى في كلّ نسخةٍ ولصق */
::selection{background:color-mix(in srgb,var(--brand) 26%,transparent); color:var(--ink)}

/* وشريطُ التمرير يتبع الثيم: شريطٌ فضّيٌّ فاتح على لوحةٍ داكنة نشاز */
::-webkit-scrollbar{width:11px; height:11px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:var(--line-strong); border-radius:var(--r-pill);
  border:3px solid transparent; background-clip:content-box}
@media(hover:hover){::-webkit-scrollbar-thumb:hover{background:var(--ink-3); background-clip:content-box}}
/* رابطُ التخطّي: يُقصّ ولا يُنفى خارج الشاشة.
   وكان عند right:-9999px، **فامتدّ المستند إلى 10389px** وصار الجوّالُ
   يُسحَب جانبا. وهي علّةٌ لا تُرى: العنصرُ نفسه غيرُ مرئيّ، وأثرُه
   شريطُ تمريرٍ أفقيّ يظنّه الناظر عيبا في التخطيط.
   والقصُّ يخفيه من العين ويبقيه لقارئ الشاشة — وذاك كلُّ الغرض. */
.skip{position:absolute; width:1px; height:1px; overflow:hidden;
  clip-path:inset(50%); white-space:nowrap;
  background:var(--brand); color:var(--on-brand);
  padding:var(--s-3) var(--s-4); border-radius:var(--r-sm); z-index:99; font-weight:700}
/* وحين يظهر يصير هدفا كاملا: من يتنقّل بلوحة المفاتيح على لوحٍ لمسيّ
   قد يلمسه بإصبعه — والقاعدةُ تنطبق حيث يُرى (D-086) */
.skip:focus{width:auto; height:auto; overflow:visible; clip-path:none;
  inset-inline-start:auto; inset-inline-end:var(--s-3); top:var(--s-2);
  display:inline-flex; align-items:center; min-height:var(--tap)}
.grow{flex:1}
/* ── لفظُ الطَيِّ واحدٌ لكلِّ مطويٍّ ──────────────────────────
   وسمُ summary لا يُعلن حالَه لقارئ الشاشة بنفسه، فالنّصُّ يقوله
   — «افتح» مطويّاً و«أغلق» مفتوحاً. **والقاعدةُ على details لا على
   صنفٍ بعينه**: حِين كانت مقصورةً على «.guide» و«.prow» وُلِدَ مطويٌّ ثالثٌ
   يستعير الوسمَ فظهرت الكلمتان معاً (D-112). و«>summary» يمنع مطويّاً
   داخلَ مطويٍّ من أن يقلِب لفظَ أبيه. */
details[open]>summary .lbl-open{display:none}
details:not([open])>summary .lbl-close{display:none}
/* والمَظهرُ معه واحدٌ: لونُ العلامة، وسهمٌ ينقلِب. والسهمُ زينةٌ لا
   خبرٌ — لذلك لا يُقرأ بصوتٍ عالٍ، واللفظُ فوقه يقول ما يقوله السهم */
.g-tog,.ptog{flex:none; font-size:var(--t-sm); font-weight:600; color:var(--brand);
  display:inline-flex; align-items:center; gap:var(--s-2)}
/* **والسهمُ حدودٌ لا حرف** (D-167): كان «▾»، وليس في Beiruti ولا Inter ولا
   Reem Kufi المضمَّنة، فيُرسَم بخطّ النظام ويختلف من جهازٍ لآخر (N-7). والمثلّثُ
   من حدَّين شفّافين وثالثٍ بلون النصّ — بلا خطٍّ ولا صورةٍ ولا سياسةِ مصدر. وقياسُه
   بالـem من «--t-xs» الذي كان الحرفُ يُرسَم به: ‏٠٫٦ عرضًا و‏٠٫٤ ارتفاعًا. */
.g-tog::after,.ptog::after{content:''; font-size:var(--t-xs); width:0; height:0;
  border-inline:.3em solid transparent; border-block-start:.4em solid;
  transition:transform var(--dur-2) var(--ease)}
details[open]>summary .g-tog::after,details[open]>summary .ptog::after{transform:rotate(180deg)}
/* ── العنوانُ يُوزَن أسطرُه ─────────────────────────────────────────────
   «balance» توزّع كلماتِ العنوان على أسطره بالتساوي بدل أن تملأ الأوّلَ
   وتترك في الثاني كلمةً وحدها. **وعنوانٌ من أربع كلماتٍ ينكسر إلى ثلاثٍ
   وواحدة يُقرأ مقطوعا** — والكلمةُ اليتيمةُ تُقرأ عنوانا ثانيا.

   والمتصفّحُ الذي لا يعرفها يلفّ كما يلفّ اليوم: **لا شيءَ ينكسر**.
   وحدُّها ستّةُ أسطرٍ عند أكثر المحرّكات، وعناوينُنا دونها كلُّها. */
h1,h2,h3{margin:0; text-wrap:balance}
/* **والثخينُ ‏٧٠٠ لا ‏٩٠٠.** الافتراضيُّ «bold» يُحَلّ عند بعض الخطوط
   إلى ‏٩٠٠، وهو وزنٌ لا نحمّله من Google — فيُصطنَع رقميّا، والعربيّةُ
   المصطنَعةُ الثخانة تلتصق نقاطُها. */
b,strong{font-weight:700}

/* ══ اللمس ══════════════════════════════════════════════════════
   **الإصبعُ ليس مؤشّرا** (D-086). عرضُه نحوَ ‏٤٥px، ولا يرى ما تحته.
   فهدفٌ بارتفاع ‏١٦px يُصاب **بالمصادفة لا بالقصد** — وقد كان في اللوحة
   ثمانيةٌ منها، أضيقُها رابطُ «X» بعرض ‏١١px.

   والحدُّ ‏٤٤×٤٤ من Apple HIG، وهو أشدُّ من ‏٢٤×٢٤ عند WCAG 2.5.8 — وشدّتُه
   هي المرادة: الفرقُ بينهما هو الفرقُ بين «يمكن إصابتُه» و«يُصاب».

   ## والمنطقةُ تُمَدّ ولا يُكبَّر النصّ

   تكبيرُ النصّ يبدّل الشكلَ ويكسر السلّم. فتُمَدّ منطقةُ اللمس بطبقةٍ
   شفّافةٍ فوق الرابط: **لا ترى العينُ فرقا، ويرى الإصبعُ هدفا كاملا.**
   والعرضُ يمتدّ إلى ‏٤٤px حين يكون النصُّ أضيق منها. */
.tap{position:relative; display:inline-block; min-width:var(--tap); text-align:center; color:var(--brand)}
/* **والامتدادُ رأسيٌّ لا أفقيّ.**
   طبقةٌ أعرضُ من الرابط تخرج عن الصفحة فتصنع تمريرا أفقيّا — قِيس ‏١٢px
   عند ‏٣٢٠px، مصدرُها رابطُ «X» بعرض ‏١١ وطبقتُه ‏٤٤. فتُقصَر الطبقةُ على
   عرض الرابط («inset-inline» صفرا) ويُعطى الرابطُ عرضا أدنى في التخطيط.
   والفيضُ الرأسيُّ لا يضرّ: الصفحةُ تُمرَّر رأسيّا أصلا. */
.tap::after{content:''; position:absolute; inset-inline:0; top:50%;
  transform:translateY(-50%); height:var(--tap)}

/* ══ هيكلُ التطبيق ═══════════════════════════════════════════ */
/* **«dvh» لا «vh»** (D-086): يحسب iOS مئةً من «vh» بلا شريطِ المتصفّح،
   فيمتدّ العمودُ تحته ويُقطَع أسفلُه. و«dvh» تتبع المرئيَّ وهو يتحرّك.
   والسطرُ الأوّل احتياطٌ لمتصفّحٍ لا يعرفها — يقرؤه ثمّ يدهسه الثاني. */
.app{display:grid; grid-template-columns:256px 1fr; min-height:100vh; min-height:100dvh}

/* ── الرافدة ───────────────────────────────────────────────── */
.rail{background:var(--chrome); border-inline-start:1px solid var(--line); display:flex;
  flex-direction:column; position:sticky; top:0; height:100dvh; overflow-y:auto; color:var(--ink)}
/* وكان على الحافّة الداخليّة خيطُ ذهبٍ (::after)؛ نزعته الطبعةُ الرابعة، فلا
   قاعدةَ له (D-144 · D-148). */
.rail-head{padding:var(--s-6) var(--s-5) var(--s-5); display:flex; align-items:center; gap:var(--s-3)}
/* ── العلامة ──────────────────────────────────────────────────────────
   الأقواسُ نفسها التي في رمز التبويب، مرسومةً لا مكتوبة. وكانت مربّعا
   فيه «صدى» بخمسةَ عشرَ بكسلا: **الحرفان يزدحمان في ستٍّ وثلاثين**،
   فيُقرأ المربّعُ لطخةً — وهي عينُ العلّة التي مُنعت في رمز التبويب. */
/* والعلامةُ وحدها تجمع اللونين: زمرّدٌ يتحوّل ذهبا — ولا يتكرّر هذا
   الجمعُ في موضعٍ آخر، فيبقى للعلامة معناها */
.glyph{display:grid; place-items:center; flex:none; width:42px; height:42px; border-radius:var(--r);
  background:var(--glyph-bg); color:var(--glyph-fg);
  box-shadow:var(--sh-1), 0 0 0 1px var(--line-strong)}
/* نسبةٌ لا قياسٌ ثابت: العلامةُ نفسها تظهر بـ 38 في الرافدة و 50 في
   شاشة الدخول و 38 في الوثائق — وقياسٌ ثابتٌ يجعلها تسبح في الأكبر. */
.glyph svg{width:56%; height:56%; display:block}
.brand{min-width:0}
.brand b{display:block; font-weight:700; line-height:var(--lh-tight); font-size:var(--t-lg);
  letter-spacing:-.3px}
.brand span{font-size:var(--t-xs); font-weight:600; letter-spacing:var(--ls-eyebrow);
  direction:ltr; unicode-bidi:isolate; display:inline-block; margin-top:var(--s-1);
  padding:0 var(--s-2); border-radius:var(--r-pill); color:var(--ink-3);
  border:1px solid var(--line-strong); line-height:1.6}

nav.tabs{padding:var(--s-1) var(--s-3) var(--s-4); display:flex; flex-direction:column; gap:1px}
nav.tabs .lbl{font-size:var(--t-xs); padding:var(--s-4) var(--s-2) var(--s-1); color:var(--ink-3);
  font-weight:600}
nav.tabs .sep{display:none}
nav.tabs a{display:flex; align-items:center; gap:var(--s-3); padding:var(--s-2) var(--s-3);
  min-height:var(--tap); font-size:var(--t-base); font-weight:600; color:var(--ink-2);
  text-decoration:none;
  transition:background var(--dur-1) var(--ease), color var(--dur-1) var(--ease);
  border-radius:var(--r)}
nav.tabs a svg{width:16px; height:16px; flex:none; opacity:.7}
@media(hover:hover){nav.tabs a:hover{background:var(--surface-2); color:var(--ink)}}
/* والحاليُّ يُعلَّم **بحدٍّ ولون**: أرضيّةٌ خافتةٌ وحدها تختفي في
   وضع التباين العالي، وخطٌّ على الحافّة يبقى. */
nav.tabs a[aria-current=page]{background:var(--surface-3); color:var(--ink); position:relative}
nav.tabs a[aria-current=page]::before{content:''; position:absolute; inset-block:7px;
  inset-inline-start:0; border-radius:var(--r-pill); width:2px; background:var(--au)}
nav.tabs a[aria-current=page] svg{opacity:1}
nav.tabs .count{margin-inline-start:auto; min-width:20px; text-align:center; padding:1px var(--s-1);
  border-radius:var(--r-pill); background:var(--surface-3); font-size:var(--t-xs); font-weight:700;
  color:var(--ink-2); font-variant-numeric:tabular-nums}
nav.tabs a[aria-current=page] .count{background:var(--ink); color:var(--surface)}
/* ── فرعُ المنصّات ────────────────────────────────────────────────────
   شاشاتُ المنصّات كانت لا تُبلَغ إلّا من بطاقةٍ في لوحٍ آخر، فمن لم
   يفتحه لم يعرف أنّها موجودة. وهي التي يُسأل فيها كلَّ يوم. */
details.plat{margin:0}
details.plat>summary{display:flex; align-items:center; gap:var(--s-3); cursor:pointer;
  padding:var(--s-2) var(--s-3); border-radius:var(--r-sm); min-height:var(--tap);
  font-size:var(--t-base); font-weight:600; color:var(--ink-2); list-style:none}
details.plat>summary::-webkit-details-marker{display:none}
@media(hover:hover){details.plat>summary:hover{background:var(--surface-2); color:var(--ink)}}
details.plat>summary svg{width:16px; height:16px; flex:none; opacity:.7}
/* سهمٌ يدور: الحالُ يُرى بلا نصّ، وهو تكرارٌ لما يقوله الانفتاحُ نفسه */
details.plat>summary::after{content:''; margin-inline-start:auto; font-size:var(--t-xs);
  width:0; height:0; border-inline:.3em solid transparent; border-block-start:.4em solid;
  color:var(--ink-3); transition:transform var(--dur-2) var(--ease)}
details.plat[open]>summary::after{transform:rotate(180deg)}
.plat-list{display:flex; flex-direction:column; gap:1px; padding:var(--s-1) 0 var(--s-2)}
/* سلّمُ الجاهزيّة (D-158): بطاقةٌ تُطوى حين تتمّ درجاتُها كلُّها */
details.ladder>summary{cursor:pointer; list-style:none; margin-bottom:0}
details.ladder>summary::-webkit-details-marker{display:none}
details.ladder[open]>summary{margin-bottom:var(--s-3)}
details.ladder ol.steps.wiz li .btn{flex:none}
details.ladder ol.steps.wiz li.at .why{color:var(--ink-2)}
details.ladder .verdict{margin:0 0 var(--s-2); font-weight:600; color:var(--ink)}
details.ladder .verdict.bad{color:var(--bad)}
/* بإزاحةٍ تقول «هذه تحت تلك» — والقائمةُ المسطّحة تُقرأ سبعةَ أقسام */
.plat-list a{padding-inline-start:var(--s-8)}
.plat-list .pl{width:15px; height:15px; flex:none; display:grid; place-items:center;
  color:var(--ink-3)}
.plat-list .pl svg{width:15px; height:15px; display:block}
@media(hover:hover){.plat-list a:hover .pl{color:var(--ink-2)}}
/* الحالُ نقطةٌ لا نصّ: الاسمُ هو المقروء. ومعها title — واللونُ وحده
   لا يقول شيئا لمن لا يفرزه */
.plat-list .dot{width:6px; height:6px; border-radius:50%; flex:none;
  margin-inline-start:auto; background:var(--ink-3)}
.plat-list .dot.ok{background:var(--ok)}
.plat-list .dot.warn{background:var(--warn)}
.plat-list .dot.bad{background:var(--bad)}
.plat-list .dot.idle{background:transparent; border:1px solid var(--line-strong)}

.rail-foot{margin-top:auto; padding:var(--s-3); border-top:1px solid var(--line-soft);
  border-top-color:var(--line-soft)}

/* ── الشريط العلويّ ────────────────────────────────────────── */
.main{min-width:0; display:flex; flex-direction:column}
/* **اسمٌ لا يتصادم**: كان هذا الشريط يسمّى .bar وهو اسمُ مقياس المقدار
   (ارتفاعُه أربعةُ بكسل) — فكان المقياسُ يدهسه فينسحق الشريطُ إلى خيط.
   علّةٌ لا يكشفها اختبارٌ ولا مدقّق: الصفحةُ تعمل، والترويسةُ غائبة. */
.topbar{position:sticky; top:0; z-index:20; background:var(--chrome);
  border-bottom:1px solid var(--line); padding:0 var(--s-6); flex:none; display:flex;
  align-items:center; gap:var(--s-3); transition:box-shadow var(--dur-2) var(--ease);
  min-height:64px}
/* ظلٌّ يظهر حين يكون فوقك محتوًى — إشارةٌ تُقرأ بلا وعي: الشريطُ يطفو
   فوق شيء، لا يجلس على أرضٍ فارغة. ويُضاف بـ JS لأنّ CSS وحدها لا تعرف
   موضعَ التمرير. */
.topbar.lifted{box-shadow:var(--sh-2)}
/* ── الزجاجُ على ما يلصق (D-102) ──────────────────────────────────
   شريطٌ لاصقٌ بلونٍ مصمتٍ يُقرأ **لوحا ثانيا فوق الصفحة**. وطبقةٌ يشفّ
   منها ما تحتها تقول «هذا فوق ذاك» بلا حدٍّ ولا ظلٍّ ثخين.

   **وخلف «@supports»**: متصفّحٌ لا يعرفها يرى «--chrome» مصمتا كما
   يراه اليوم — ولا شيءَ ينكسر. والشفافيّةُ تُضاف هناك وحدَها، فلا يبقى
   لونٌ نصفُ شفّافٍ بلا ضبابٍ يسنده. */
@supports (backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)){
  /* **وعلى الشريط وحدَه — لا على الرافدة** (D-102).
     جُرّبت على الاثنين فسقط ‏٧٤ نصّا دون حدّ التباين. **والرافدةُ ثيمٌ
     ثالثٌ قائمٌ بذاته** (THEME:rail): تبقى داكنةً في النهاريّ، وحبرُها
     فاتحٌ على أرضٍ داكنة. فشفّها يُظهر أرضَ الصفحة النهاريّةَ من ورائها،
     **فيصير الحبرُ الفاتحُ على فاتحٍ — ‏٢٫١٤:١**.
     والشريطُ ليس كذلك: أرضُه من ثيم الصفحة نفسِه، فما وراءه من جنسه. */
  .topbar{
    background:color-mix(in srgb,var(--chrome) 82%,transparent);
    -webkit-backdrop-filter:blur(14px) saturate(1.4);
    backdrop-filter:blur(14px) saturate(1.4)}
}
/* العلامةُ في الشريط للجوّال وحدَه (D-123): رأسُ الرافدة يختفي هناك */
.topbar .glyph.tb{display:none; width:30px; height:30px; border-radius:var(--r-sm)}
.topbar h1{font-size:var(--t-md); font-weight:600; letter-spacing:-.1px; color:var(--ink-2)}
.topbar .crumb{font-size:var(--t-xs); color:var(--ink-3); margin-top:1px}
/* ‏والعنوانُ والنطاقُ يُقصّان لا يدفعان «خروج» خارج الشاشة (D-177): بعد رفع الحرف فاض
   الشريطُ ‏6px عند ‏320 — والزرُّ الذي خرج هو الذي يُطلَب حين يُطلَب */
.topbar h1,.topbar .crumb{overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
/* عنوانُ الشريط يظهر **حين يغيب عنوانُ الصفحة** لا قبله.
   وعنوانان متطابقان فوق بعضهما تكرارٌ يُقرأ عيبا؛ وشريطٌ لاصقٌ بلا
   عنوانٍ بعد التمرير يترك القارئَ بلا موضع. فالظهورُ مربوطٌ بالإشارة
   نفسها التي يظهر بها الظلّ: أنّ فوقك محتوًى. */
.topbar .ttl{min-width:0; opacity:0; transform:translateY(4px); transition:opacity var(--dur-2) var(--ease-out), transform var(--dur-2) var(--ease-out)}
.topbar.lifted .ttl{opacity:1; transform:none}
.content{padding:var(--s-5d) var(--s-6d) var(--s-12d); max-width:var(--shell); width:100%}

/* ══ رأسُ الصفحة ══════════════════════════════════════════════════════
   كان أعلى ما في الشاشة عنوانا بستّةَ عشرَ بكسلا وتحته أرقامٌ باثنين
   وثلاثين — **فالرقمُ هو الذي يُقرأ عنوانا**، وتصير الشاشةُ لوحةَ
   عدّاداتٍ لا شاشةَ عمل.

   فصار للصفحة رأسٌ: لصيقةٌ فوق العنوان تقول أين أنت، وعنوانٌ بأربعةٍ
   وثلاثين، وسطرٌ يقول ما هذه الشاشة. وثلاثتُها معا هي ما يجعل الصفحةَ
   **تبدأ** بدل أن تنفتح في وسطها. */
.page-head{display:flex; align-items:flex-end; gap:var(--s-5); flex-wrap:wrap;
  margin:var(--s-2) 0 var(--s-6d); padding-bottom:var(--s-5);
  border-bottom:1px solid var(--line-soft)}
.page-head .txt{min-width:0; flex:1 1 340px}
/* ── الذهبُ يُقتَّر ولا يُسكَب ─────────────────────────────────────────
   خيوطٌ وحوافُّ وعلاماتٌ صغيرة، لا أرضيّاتٌ ولا أزرارٌ ممتلئة. وذهبٌ
   يُملأ به سطحٌ يُقرأ رخيصا، وخيطٌ منه على حافّةٍ يُقرأ صنعة. */
.eyebrow{display:flex; align-items:center; gap:var(--s-2); font-size:var(--t-xs);
  font-weight:700; color:var(--ink-3); margin-bottom:var(--s-2)}
.eyebrow .ln{height:1px; flex:none; width:40px;
  background:linear-gradient(90deg,var(--au),color-mix(in srgb,var(--au) 35%,transparent))}
.page-head h1{font-size:var(--t-3xl); font-weight:700; line-height:var(--lh-tight);
  letter-spacing:0; margin:0}
.page-head .lede{margin:var(--s-3) 0 0; font-size:var(--t-md); line-height:var(--lh);
  color:var(--ink-2); max-width:var(--measure)}
.page-head .aside{display:flex; align-items:center; gap:var(--s-2); flex-wrap:wrap}
/* وسطرٌ يقود لوحا بلا رأس: يقول ما الشاشة، ولا يُنفق ارتفاعَ عنوانٍ
   مكرَّرٍ فوقه (D-114) */
.lede-lead{margin:0 0 var(--s-5); font-size:var(--t-md); line-height:var(--lh);
  color:var(--ink-2); max-width:var(--measure)}
@media(max-width:720px){
  /* الأعمدةُ الثابتةُ لا تسع في ٣٩٠px: يلتفّ الصفُّ ويسقط النموذجُ من
     السطر — الاسمُ والحالُ والإنفاقُ تكفي للفرز، والنموذجُ في اللوح */
  .prow>summary{flex-wrap:wrap; gap:var(--s-2)}
  .prow .pm{display:none}
  .prow .pst{width:auto}
  .prow .pv{width:auto; margin-inline-start:auto}
.page-head h1{font-size:var(--t-2xl)}}

.pill{display:inline-flex; align-items:center; gap:var(--s-2); padding:var(--s-1) var(--s-3); border-radius:var(--r-pill);
  font-size:var(--t-sm); font-weight:600; border:1px solid var(--line); background:var(--surface-2)}
.pill .led{width:6px; height:6px; border-radius:50%; background:var(--ink-3); flex:none}
.pill.on{color:var(--ok); background:var(--ok-wash); border-color:color-mix(in srgb,var(--ok) 26%,transparent)}
.pill.on .led{background:var(--ok)}
.pill.off{color:var(--warn); background:var(--warn-wash);
  border-color:color-mix(in srgb,var(--warn) 34%,transparent)}
.pill.off .led{background:var(--warn)}

.theme{display:inline-flex; padding:var(--s-0); gap:1px; border-radius:var(--r-pill);
  border:1px solid var(--line); background:var(--surface-2)}
.theme button{padding:var(--s-1) var(--s-2); border-radius:var(--r-pill); background:transparent; border:0;
  color:var(--ink-3); font-size:var(--t-xs); font-weight:600}
.theme button[aria-pressed=true]{background:var(--surface); color:var(--ink); box-shadow:var(--sh-1)}

/* ── الإشعار ───────────────────────────────────────────────── */
.flash{display:flex; align-items:flex-start; gap:var(--s-3); padding:var(--s-3) var(--s-4);
  border-radius:var(--r); margin-bottom:var(--s-4); font-size:var(--t-base); border:1px solid var(--line); background:var(--surface);
  border-inline-start:3px solid var(--line-strong);
  transition:opacity var(--dur-2) var(--ease-out), transform var(--dur-2) var(--ease-out)}
.flash .ic{flex:none; font-weight:700; font-size:var(--t-sm); line-height:var(--lh)}
/* رسالةُ النموذج المشغول تُكتب في منطقة الإعلان فتُقرأ وتُرى (D-149) */
.busy-note{margin:0 0 var(--s-3); font-size:var(--t-sm); color:var(--ink-2)}
.flash.ok{border-inline-start-color:var(--ok)}
.flash.ok .ic{color:var(--ok)}
.flash.warn{border-inline-start-color:var(--warn)}
.flash.warn .ic{color:var(--warn)}
.flash.bad{border-inline-start-color:var(--bad)}
.flash.bad .ic{color:var(--bad)}
/* ── ودخولُه وحدَه يُتحرَّك ────────────────────────────────────────────
   الإشعارُ هو **الشيءُ الوحيد في الصفحة الذي لم يكن قبل الضغطة**: كلُّ
   ما عداه كان معروضا قبلها ويُعاد رسمُه. فسكونُه يجعله يُقرأ جزءا من
   الصفحة، وقد يُمرَّر عليه بلا أن يُرى — **وهو يحمل نتيجةَ ما فُعل**.

   **ولا تُحرَّك البطاقاتُ معه.** صفحةٌ كلُّها تنزلق عند كلّ فتحةٍ تُقرأ
   بطيئةً ولو كانت سريعة، وتُفتَح هذه اللوحةُ عشرَ مرّاتٍ في اليوم.

   و«@starting-style» تصف حالَ ما قبل الظهور — **بلا سطرِ JavaScript
   واحد**، ومتصفّحٌ لا يعرفها يُظهره ساكنا كما هو اليوم. */
@starting-style{.flash{opacity:0; transform:translateY(-6px)}}

section[hidden]{display:none}

/* ══ الشبكة والبطاقات ════════════════════════════════════════ */
/* عنصرُ الشبكة لا ينكمش تحت محتواه ما لم يُقَل له: min-width الافتراضيّة
   auto، **فسلسلةٌ لا تنكسر — عنوانُ API أو اسمُ نموذج — تدفع العمودَ
   فيفيض المستندُ كلُّه**. وقيس ذلك في لوح المزوّدين: 406px على شاشة 390. */
.grid{display:grid; gap:var(--s-3)}
.grid>*{min-width:0}
/* والسلاسلُ اللاتينيّة الطويلة تُكسَر عند الضرورة لا تُقصّ: عنوانٌ مقصوصٌ
   لا يُنسَخ صحيحا، ومكسورٌ يُقرأ ويُنسَخ. */
.mono{overflow-wrap:anywhere; font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
  font-size:var(--t-xs); color:var(--ink-3); direction:ltr; display:inline-block;
  unicode-bidi:isolate}
/* أرقامٌ ثابتةُ العرض في كلّ موضعٍ تتبدّل فيه: عمودٌ يهتزّ مع كلّ تحديث
   يُقرأ عطلا. وكانت مضبوطةً على البطاقات وحدها. */
table,.chip,.count,.ago,.money,.num,.n{font-variant-numeric:tabular-nums}
/* ── الشاشةُ العريضة تُملأ لا تُترَك (D-102) ────────────────────────
   صفُّ المؤشّرات أربعةٌ في ‏١٤٤٠px، **وأربعةٌ في ‏٢٥٦٠ كذلك** — فيتمدّد كلٌّ
   إلى ستّمئة بكسل ليحمل رقما من ثلاث خانات. فتُفتَح رتبةٌ خامسة فوق
   ‏١٩٢٠: العددُ يزيد ولا يتمدّد العرض.

   **ولا تُفتَح للمحتوى النصّيّ**: عمودٌ خامسٌ من النصّ يخالف «--measure».

   **ثمّ سقطت القاعدةُ بالقياس** (لاحقةُ D-123): كانت تفتح خمسةَ أعمدةٍ
   لكلّ «c4» فوق ‏١٩٢٠ — **وبعد D-119 صار العددُ يقرّر الصنف**: أربعُ
   بطاقاتٍ في «c4» وخمسٌ في «c5». فأربعٌ في خمسة أعمدةٍ **تترك عموداً
   أبيضَ في طرف الصفّ**، قِيس عند ‏٢٠٠٠px في نظرةٍ عامّة وفي القنوات.
   والعرضُ يتنفّس بـ«--shell» أصلا، وما يريد خمسا يختار خمسا. */
.c4{grid-template-columns:repeat(4,1fr)} .c3{grid-template-columns:repeat(3,1fr)}
.c2{grid-template-columns:repeat(2,1fr)}
/* خمسٌ حين يختار المالكُ خمسا (D-119): **ولا تُترَك واحدةٌ وحيدةً في صفٍّ
   ثانٍ** — وهو التمزّقُ الذي حُرِس في D-111، يقع هنا بالعدد لا بالارتفاع */
.c5{grid-template-columns:repeat(5,1fr)}
.c21{grid-template-columns:2fr 1fr}
@media(max-width:1180px){
  .c4,.c5{grid-template-columns:repeat(2,1fr)} .c21{grid-template-columns:1fr}}
@media(max-width:900px){.c3,.c2{grid-template-columns:1fr}}
@media(max-width:560px){.c4,.c5{grid-template-columns:1fr}}
/* ── صفُّ المؤشّرات في الجوّال زوجان لا عمود (D-136) ──────────────────
   ستُّ بطاقاتٍ في عمودٍ واحدٍ على ‏٣٩٠px ثمانُ مئةِ بكسلٍ قبل أوّل قائمة،
   وكلُّ بطاقةٍ رقمٌ واحدٌ في ‏١٣٠px. **فالمؤشّراتُ اثنان في الصفّ ما دام
   الرقمُ يسع**، والرقمُ يصغر درجةً ليسع — وقاعدتُه بعد قاعدة الرقم أدناه. */
@media(max-width:900px){
  .tiles.c2,.tiles.c3,.tiles.c4,.tiles.c5{grid-template-columns:repeat(2,1fr)}
  .tiles.c3>.tile:last-child:nth-child(odd){grid-column:1/-1}}
/* ── نظرةٌ عامّة: عمودان يُملآن لا يُمدّان (D-136) ──────────────────────
   شبكةٌ تمدّ البطاقةَ لتساوي جارتَها تترك تحت رسم الإنفاق ‏٥٢١px بيضاء
   (قِيست). فالعمودُ الثاني **رصّةٌ** من بطاقتين تملأ ما تملؤه القائمة،
   ولا بطاقةَ تُمدّ فوق محتواها. */
.ov{display:grid; grid-template-columns:minmax(0,1.15fr) minmax(0,1fr); gap:var(--s-3); align-items:start}

/* ── الرئيسيّة: خطوتُك، ثمّ الرحلة، ثمّ المنصّات (D-177) ───────────────
   ثلاثُ طبقاتٍ تجيب ثلاثةَ أسئلةٍ قبل أيّ رقم مال. والفعلُ الواحدُ بلون حاله:
   أحمرُ ما يوقف النشر، وكهرمانُ ما ينتظر، وحدٌّ أخضرُ لما يجري. */
.next{display:flex; align-items:center; gap:var(--s-4); flex-wrap:wrap; margin-bottom:var(--s-3);
  padding:var(--s-4) var(--s-5); border-radius:var(--r-lg); background:var(--surface);
  border:1px solid var(--line); border-inline-start:4px solid var(--ok)}
.next[data-tone=warn]{border-inline-start-color:var(--warn); background:var(--warn-wash)}
.next[data-tone=bad]{border-inline-start-color:var(--bad); background:var(--bad-wash)}
.next-body{flex:1 1 260px; min-width:0}
.next-k{display:block; font-size:var(--t-sm); font-weight:700; color:var(--ink-2)}
.next-t{margin:var(--s-1) 0 0; font-size:var(--t-lg); font-weight:600; line-height:var(--lh)}
.home-card{margin-bottom:var(--s-3)}
.home-sub{margin:var(--s-5) 0 var(--s-3); font-size:var(--t-xl)}
/* المحطّاتُ السبع («.trip» لا «.journey»: ذاك سجلُّ المنشور الواحد) صفٌّ واحدٌ على العريض، وتلتفّ حين يضيق، وعمودٌ في الجوّال */
.trip{list-style:none; margin:0; padding:0; display:grid; gap:var(--s-2);
  grid-template-columns:repeat(auto-fit,minmax(138px,1fr))}
.trip a{display:flex; flex-direction:column; gap:var(--s-2); height:100%; min-height:var(--tap);
  padding:var(--s-3); border-radius:var(--r); border:1px solid var(--line);
  background:var(--surface-2); color:inherit; text-decoration:none}
.trip li[data-state=done] a{background:var(--surface)}
.trip li[data-state=now] a{border-color:var(--warn)}
.trip li[data-state=now][data-focus] a{background:var(--warn-wash)}
.trip li[data-state=failed] a{border-color:var(--bad); background:var(--bad-wash)}
@media(hover:hover){.trip a:hover{border-color:var(--brand)}}
.j-n{font-family:var(--font-display); font-size:var(--t-sm); font-weight:700; color:var(--ink-3)}
.j-body{display:flex; flex-direction:column; align-items:flex-start; gap:var(--s-1)}
.j-body b{font-size:var(--t-base)}
.j-note{font-size:var(--t-sm); color:var(--ink-2); line-height:var(--lh)}
.pfgrid{display:grid; gap:var(--s-2); grid-template-columns:repeat(auto-fill,minmax(188px,1fr))}
.pf{display:flex; flex-direction:column; align-items:flex-start; gap:var(--s-2); padding:var(--s-3);
  border-radius:var(--r); border:1px solid var(--line); background:var(--surface)}
.pf .btn{margin-top:auto}
.pf-head{display:flex; align-items:center; gap:var(--s-2); min-width:0}
.pf-name{display:flex; flex-direction:column; min-width:0}
.pf-logo{width:36px; height:36px; flex:none; display:grid; place-items:center;
  border-radius:var(--r-sm); color:var(--pf-fg); background:var(--brand)}
.pf-logo svg{width:18px; height:18px; display:block}
.pf[data-pf=linkedin] .pf-logo{background:var(--pf-linkedin)}
.pf[data-pf=x] .pf-logo{background:var(--pf-x)}
.pf[data-pf=instagram] .pf-logo{background:var(--pf-instagram)}
.pf[data-pf=tiktok] .pf-logo{background:var(--pf-tiktok)}
.pf[data-pf=youtube] .pf-logo{background:var(--pf-youtube)}
@media (max-width:720px){
  .trip{grid-template-columns:1fr}
  .trip a{flex-direction:row; align-items:center; padding:var(--s-2) var(--s-3)}
  .j-body{flex-direction:row; flex-wrap:wrap; align-items:center; column-gap:var(--s-2)}
  .j-note{flex-basis:100%}
  .pfgrid{grid-template-columns:repeat(2,minmax(0,1fr))}
  .next{padding:var(--s-4)}
  .next .btn{flex:1 1 100%}
}
.stack{display:grid; gap:var(--s-3); align-content:start}
@media(max-width:1180px){.ov{grid-template-columns:1fr}}

/* ── مادّةُ السطح ─────────────────────────────────────────────────────
   ثلاث طبقاتٍ على كلّ بطاقة، ولكلٍّ سببٌ ماديّ:
   لونُ السطح، ثمّ «--sheen» تدرّجٌ في وجهه (السطحُ المستوي لا يعكس
   الضوءَ بالتساوي)، ثمّ «--hair» خيطُ ضوءٍ على حافّته العليا (الحافّةُ
   المواجهةُ للضوء أفتح).

   والفرقُ بينها وبين مستطيلٍ بحدٍّ رماديّ هو الفرقُ بين «مرسومٍ» و
   «مصنوع» — وهو ما لا يُصلحه تكبيرُ الظلّ. */
.card{background:var(--surface); border:1px solid var(--line); border-radius:var(--r-lg);
  padding:var(--s-5d) var(--s-6d);
  transition:box-shadow var(--dur-2) var(--ease), border-color var(--dur-2) var(--ease)}
/* بطاقةُ القناة والمسوّدة تحملان فعلا، فترتفعان قليلا عند التحويم.
   وبطاقاتُ العرض لا ترتفع: حركةٌ بلا فعلٍ خلفها تَعِد بما لا يقع. */
@media(hover:hover){.ch:hover,.draft:hover{box-shadow:var(--sh-2), inset 0 1px 0 var(--hair);
  border-color:var(--line-strong)}}
/* **الابنُ المباشرُ وحده كان يُصاب.** و .card-head h2 حفيدٌ لا ابن،
   فسقط من القاعدة وورث حجمَ المتصفّح الافتراضيّ — ‏٢١px، وهو خارجُ
   السلّم كلِّه. علّةٌ لم تُرَ لأنّ ٢١ قريبةٌ ممّا حولها، **وكشفها
   قياسُ المقاييس المستعملة فعلا** لا النظرُ.
   والمحدّدُ صار وصفيّا: كلُّ عنوانٍ في بطاقة. */
.card h2{font-weight:700; margin-bottom:var(--s-0); font-size:var(--t-xl); letter-spacing:0}
/* **والهامشُ قاعدةٌ لا استثناء.** كانت على «.card > .hint» وحدها،
   فـ«hint» خارج بطاقةٍ يرث 14px من المتصفّح — **خارجَ السلّم**، وهي
   علّةُ «p.nm» و«h3.sec» نفسُها (D-057 · D-061 · D-062). فتُوضَع
   القاعدةُ للصنف، ويبقى محدّدُ البطاقة لِما يخصّها من لونٍ وقياس. */
.hint{margin:0 0 var(--s-4)}
.card > .hint{margin:0 0 var(--s-4); font-size:var(--t-sm); color:var(--ink-3); line-height:var(--lh)}
.card-head{display:flex; align-items:center; gap:var(--s-3); flex-wrap:wrap; margin-bottom:var(--s-3)}
.card-head h2{margin:0}
/* عنوانُ القسم: خيطٌ قصيرٌ بلون الهويّة يبدؤه بدل خطٍّ رماديٍّ يمتدّ تحته.
   والخطُّ الممتدُّ يفصل ولا يُعلِّم — والقصيرُ يُعلِّم موضعَ البداية. */
/* **والصنفُ لا يُقيَّد بوسم.** كان «h3.sec»، فـ«h2» يحمل الصنفَ نفسَه
   يسقط من القاعدة ويرث 21px من المتصفّح — **خارجَ السلّم**، وهي علّةُ
   «.card > h2» نفسُها (D-057). ومدقّقُ السلّم أمسكها هنا كذلك. */
.sec{color:var(--ink-2); margin:var(--s-8d) 0 var(--s-3); padding-bottom:var(--s-2);
  border-bottom:1px solid var(--line-soft); position:relative; font-size:var(--t-sm);
  font-weight:600}

/* **ميزانيّةُ النحاس** (D-156): حبرٌ لرقمٍ واحد (المؤشّرُ الأوّل) وخيوطٌ لا
   غير — خيطُ القسم، ورأسُ شريط المؤشّرات، ومؤشّرُ التبويب الحاليّ، وتحتَ
   الروابط الهادئة، وحلقةُ التركيز. كان في ‏٩ إلى ‏١١ موضعًا في الشاشة
   (لصائقُ الرافدة والعلامةُ ورؤوسُ الجدول والذيلُ والحلقات)، وحارسُ
   audit_tokens يعدّ الآن. */
.sec::after{content:''; position:absolute; bottom:-1px; inset-inline-start:0; height:2px;
  border-radius:var(--r-pill);
  background:linear-gradient(to left,var(--au),color-mix(in srgb,var(--au) 20%,transparent));
  width:44px}

/* ── بطاقةُ المؤشّر ────────────────────────────────────────── */
.tile{display:flex; flex-direction:column; position:relative; overflow:hidden}
/* خيطٌ بلون الهويّة على رأس المؤشّر — يربط الأربعةَ بعضَها ببعضٍ فتُقرأ صفّا
   واحدا، ويميّزها عن بطاقات المحتوى تحتها. */
.tile::before{content:''; position:absolute; inset-inline:0; top:0;
  background:linear-gradient(90deg,transparent 4%,var(--au) 50%,transparent 96%); height:3px}
.tile .k{font-size:var(--t-sm); font-weight:600; color:var(--ink-2)}
.tile .v{font-size:var(--t-2xl); font-weight:400; line-height:var(--lh-tight); letter-spacing:-.8px;
  font-variant-numeric:tabular-nums; margin-top:var(--s-1);
  /* العزلُ يثبّت ترتيبَ الرقم ورمزِ العملة، والمحاذاةُ تُبقيه تحت لصيقته */
  direction:ltr; unicode-bidi:isolate; text-align:end}
.tile .v em{font-style:normal; font-size:var(--t-base); color:var(--ink-3); letter-spacing:0;
  margin-inline-start:var(--s-0); font-weight:500}
/* ── والمؤشّرُ الأوّل يقود بالقياس كما يقود باللون (D-117) ───────────
   ندرةٌ تصنع مرتبة، وذهبٌ على الأربعة يُلغي معنى الأوّل. **وكان اللونُ
   وحدَه يقول ذلك والقياسُ يخالفه**: أربعةُ أرقامٍ عند ‏٤٢px في صفٍّ
   واحد، **فلا تقول الشاشةُ أيُّها الجواب**.

   وذهبٌ يقول «هذا أوّلٌ» وقياسٌ يقول «الأربعةُ سواء» **يُلغي أحدُهما
   الآخر**، ويبقى الصفُّ يُقرأ لوحةَ عدّادات.

   **ويشمل شبكةَ الثلاثة كذلك** (المزوّدون): القاعدةُ في الأوّليّة لا في
   العدد. */
.grid>.tile:first-child .v{font-size:var(--t-3xl); color:var(--au); font-weight:400; letter-spacing:-1.2px}
.tile .n{font-size:var(--t-xs); color:var(--ink-3); margin-top:var(--s-2)}
/* ── والرقمُ يصغر درجةً على الجوّال (D-136) — **وموضعُه بعد قاعدتَي الرقم** ──
   كُتب أوّلًا مع شبكة الزوجين أعلاه، **فغلبته «.tile .v» و«.grid>.tile:first-child
   .v» بتساوي المحدّد وتأخُّرِهما**: بقي الأوّلُ ‏٤٢px والبقيّةُ ‏٢٦ عند ‏٣٩٠ —
   قاعدةٌ تُقرأ صحيحةً وأثرُها صفر. أمسكها القياسُ في D-167، ويحرسها اختبارٌ
   يسأل الورقةَ عن الترتيب لا عن النصّ. */
@media(max-width:900px){
  .tiles .v{font-size:var(--t-xl); letter-spacing:-.6px}
  .tiles>.tile:first-child .v{font-size:var(--t-2xl)}}

/* المقياس **مقياسُ مقدار لا تصنيف**: هيئةٌ واحدة تتدرّج، ولا كهرمان فيه
   قطّ — الكهرمان يقع من ذهب الهوية على ΔE 7.2 فلا يُرى فرقُهما. والبلوغُ
   حالةٌ لا مقدار، فيقفز إلى الأحمر (ΔE 19.8 عن الذهب) **ومعه نصّ**. */
.bar{height:4px; background:var(--surface-3); border-radius:var(--r-pill); overflow:hidden; margin-top:var(--s-3)}
.bar i{display:block; height:100%; border-radius:var(--r-pill); background:var(--brand); transition:width var(--dur-3) var(--ease-out)}
.bar i.f{background:var(--bad)}
/* اكتمالٌ لا بلوغُ سقف — خضرةٌ كعلامته تحته (D-134) */
.bar i.done{background:var(--ok)}
.cap{display:inline-flex; align-items:center; gap:var(--s-1); font-size:var(--t-xs); font-weight:600;
  color:var(--bad); margin-top:var(--s-2)}
.cap.done{color:var(--ok)}

/* الفرقُ عن الأمس: علامةٌ **ونصّ** — والسهمُ وحده لا يُقرأ بصوتٍ عالٍ */
.delta{display:inline-flex; align-items:center; gap:var(--s-1); font-size:var(--t-xs); font-weight:600;
  margin-top:var(--s-2); color:var(--ink-3)}
/* **والفرقُ مقدارٌ لا حالة** (D-123): كان الصاعدُ أخضرَ والهابطُ كهرمانا،
   والبطاقةُ إنفاق — **فإنفاقٌ نزل يُقرأ تحذيرا وإنفاقٌ صعد يُقرأ نجاحا**،
   وهو عكسُ ما يعنيه. وألوانُ الحالة محجوزة (D-043): السهمُ والنصُّ يقولان
   الاتّجاه، والحبرُ يبقى حبرا. والصنفان يبقيان للاتّجاه لا للّون. */
.delta.up,.delta.down{color:var(--ink-2)}
.delta .ar{font-size:var(--t-xs); line-height:var(--lh-tight)}
/* والسهمُ مرسومٌ بقياس رمز الرقاقة (D-167): ‏١٠px كـ«.st .g svg» */
.delta .ar svg{width:10px; height:10px; display:block}

/* ══ الجداول ═════════════════════════════════════════════════ */
.scroll{display:block; overflow-x:auto; margin:0 -var(--s-0); padding:0 var(--s-0)}
table{width:100%; border-collapse:collapse; font-size:var(--t-base); min-width:520px}
th{text-align:start; color:var(--ink-3); font-size:var(--t-xs); padding:0 var(--s-2) var(--s-2);
  border-bottom:1px solid var(--line); white-space:nowrap;
  border-bottom-color:var(--line-strong); font-weight:600}
td{padding:var(--s-3) var(--s-2); border-bottom:1px solid var(--line-soft); vertical-align:top}
tbody tr:last-child td{border-bottom:0}
@media(hover:hover){tbody tr:hover{background:var(--surface-2)}}
/* ── اللوحُ المحوريّ (D-120) ───────────────────────────────────────
   **والجدولُ وحدَه يمرّر أفقيّا**: عشرةُ أعمدةٍ لا تسع ٣٩٠px، وجسمُ
   الصفحة لا يُمرَّر — فالغلافُ حوله لا الصفحةُ كلُّها. */
.pv-wrap{overflow-x:auto}
/* رأسُ صفّ المنصّة رابطٌ إلى شاشتها — وهدفُ لمسٍ كاملٌ لا سطرُ نصّ (D-132) */
.pv th a{display:inline-flex; align-items:center; min-height:var(--tap); min-width:var(--tap); color:var(--brand);
  text-decoration:underline; text-underline-offset:3px; text-decoration-thickness:1px; text-decoration-color:var(--au); text-underline-offset:3px}
@media(hover:hover){.pv th a:hover{text-decoration:underline}}
/* زرُّ التنزيل وشرحُه في سطرٍ واحدٍ يلتفّ على الضيق (D-126) */
.pv{min-width:auto; margin-top:var(--s-3); border:1px solid var(--line-soft);
  border-radius:var(--r); background:var(--surface-2); padding:var(--s-3) var(--s-4)}
.pv th,.pv td{text-align:center; padding:var(--s-2); white-space:nowrap;
  font-variant-numeric:tabular-nums}
/* **وترويسةُ الصفّ تُقرأ اسما لا رقما**: يمينَ السطر، وبحبرٍ أثقل */
.pv tbody th[scope=row]{text-align:start; font-size:var(--t-sm); color:var(--ink);
  font-weight:700; border-bottom:1px solid var(--line-soft)}
.pv thead th{font-size:var(--t-xs)}
.pv td{border-bottom:1px solid var(--line-soft); vertical-align:middle}
/* وعمودُ المجموع يُفصَل بخيطٍ لا بلون: **اللونُ رتبةٌ، والخيطُ حدّ** */
.pv .pv-t{border-inline-start:1px solid var(--line); font-weight:700}
.pv .pv-f th,.pv .pv-f td{border-top:1px solid var(--line); font-weight:700;
  border-bottom:0}
/* وصفُّ الضبط يلتفّ ولا يُقَصّ: أربعةُ حقولٍ وزرٌّ لا تسع في الجوّال */
.pv-form{flex-wrap:wrap; align-items:flex-end; gap:var(--s-3)}
.pv-form .field{flex:1 1 150px; min-width:0}
.pv-form button{flex:none}
.nm{font-weight:600; line-height:var(--lh-tight)}
/* «nm» تُستعمَل span وتُستعمَل فقرةً. والفقرةُ بلا قاعدةِ هامشٍ
   ترث 14px من المتصفّح — **خارجَ السلّم**، ولا تظهر في grep لأنّها
   لم تُكتَب (D-057). فتُصاب هنا، والوسمُ في المحدّد لا الصنف. */
p.nm{margin:0 0 var(--s-3)}
/* **وحقلٌ يُكتَب فيه ليس نصّا يُقرأ** (D-109).

   «mono» صُنعت لعرضِ رمزٍ في سطر: حرفٌ صغيرٌ وحبرٌ خافتٌ وارتفاعٌ بقدر
   محتواه. **وعلى «input» تهبط بارتفاعه إلى ‏١٩px** — دون هدف اللمس
   بضعفين، وقِيس ذلك على عنوان قناة التنبيهات.

   ولا يُصلَح في ذلك الموضع وحدَه: **حقلٌ آخر يُكتب غدا بـ«mono» يرث
   العلّة**. فيُقيَّد الصنفُ حيث يُكتب فيه. */
input.mono,textarea.mono{display:block; width:100%; min-height:var(--tap);
  color:var(--ink); font-size:var(--t-sm)}
.sub{color:var(--ink-3); font-size:var(--t-sm); margin-top:var(--s-1); max-width:62ch; line-height:var(--lh)}
.num,.money{font-variant-numeric:tabular-nums}
/* المبلغُ نصٌّ لاتينيّ داخل عربيّ: بلا عزلٍ ينقلب رمزُ العملة إلى آخره */
.money{direction:ltr; unicode-bidi:isolate; display:inline-block}

/* الحالة: لونٌ **ورمزٌ ونصّ** — لا لون وحده */
.st{display:inline-flex; align-items:center; gap:var(--s-1); padding:var(--s-0) var(--s-2); border-radius:var(--r-pill);
  font-size:var(--t-xs); font-weight:600; border:1px solid transparent; white-space:nowrap}
/* الرمزُ مرسومٌ لا حرفٌ من خطّ النظام (D-154) */
.st .g{display:inline-flex; line-height:1}
.st .g svg{width:10px; height:10px; display:block}
.st.ok{color:var(--ok); background:var(--ok-wash); border-color:color-mix(in srgb,var(--ok) 24%,transparent)}
.st.warn{color:var(--warn); background:var(--warn-wash); border-color:color-mix(in srgb,var(--warn) 28%,transparent)}
.st.bad{color:var(--bad); background:var(--bad-wash); border-color:color-mix(in srgb,var(--bad) 28%,transparent)}
.st.idle{color:var(--ink-3); background:var(--surface-2); border-color:var(--line)}
.chip{display:inline-block; padding:var(--s-0) var(--s-2); border-radius:var(--r-pill); font-size:var(--t-xs); font-weight:600;
  background:var(--surface-2); border:1px solid var(--line-soft); color:var(--ink-2);
  /* والفاصلُ في نهاية السطر لا في يساره (D-167): كان «margin:… 0 0 var(--s-1)» —
     يسارٌ هو نهايةُ السطر في العربيّة مصادفةً، وبدايتُه في حاويةٍ لاتينيّة */
  margin:var(--s-0) 0 0; margin-inline-end:var(--s-1)}
/* **والرقاقةُ اللاتينيّةُ تكتب اتّجاهَها بنفسها** («.mono» ‏ltr)، والجانبُ المنطقيُّ
   يُحَلّ على العنصر لا على أبيه: نهايتُها هي يمينُها، **ونهايةُ السطر العربيّ الذي
   تقع فيه بدايتُها هي**. قِيس ذلك ببصمة الأنماط المحسوبة: ‏٤٣ رقاقةً انتقل فاصلُها
   إلى الجهة الأخرى بالسطر أعلاه وحده (D-167) — فتُعطى بدايتَها صراحةً. */
.chip.mono{margin-inline:var(--s-1) 0}
/* **ورقاقةٌ تُلمَس ليست رقاقةً تُقرأ** (D-105).

   قِيست رقاقةُ رابط الرحلة ‏٥١×‏٢٥ عند ‏٤٣٠px، **وهدفٌ دون ‏٤٤ يُصاب
   بالمصادفة لا بالقصد**. والقياسُ لا يُكبَّر — الرقاقةُ تبقى بحجمها،
   **ويُمدّ هدفُ اللمس تحتها بعنصرٍ زائفٍ لا يُزيح شيئا**. فما يُرى
   يبقى، وما يُلمَس يكفي. */
a.chip{position:relative}
a.chip::after{content:''; position:absolute; inset:50% 0 auto;
  height:var(--tap); transform:translateY(-50%)}

/* الاستحقاق: مقياس مقدار — تدرّج هيئةٍ واحدة، والرقم بلون النصّ */
.worth{display:flex; align-items:center; gap:var(--s-2); min-width:104px}
.worth .track{flex:1; height:4px; background:var(--surface-3); border-radius:var(--r-pill); overflow:hidden}
.worth .fill{display:block; height:100%; border-radius:var(--r-pill)}
.worth .val{font-variant-numeric:tabular-nums; font-size:var(--t-sm); color:var(--ink-2); min-width:30px}

/* ══ الأزرار — أربعُ درجاتٍ لا لونان ══════════════════════════ */
/* ارتفاعُ الهدف 44 لا 31: WCAG 2.5.5 و Apple HIG. والحشوُ يُترك
   للتوسيط، و min-height هي التي تضمن — فنصٌّ قصيرٌ لا يُقزّم الزرّ. */
button,.btn{font:inherit; font-size:var(--t-base); font-weight:600; cursor:pointer;
  border:1px solid transparent; padding:var(--s-2) var(--s-4); min-height:var(--tap);
  min-width:var(--tap); box-sizing:border-box; display:inline-flex; align-items:center;
  justify-content:center; gap:var(--s-2); text-decoration:none; white-space:nowrap;
  transition:background var(--dur-1) var(--ease), border-color var(--dur-1) var(--ease), box-shadow var(--dur-1) var(--ease);
  border-radius:var(--r)}
.p{background:var(--brand); color:var(--on-brand)}
.g{background:var(--surface); color:var(--ink); border-color:var(--line-strong); box-shadow:none}
@media(hover:hover){.g:hover{background:var(--surface-2)}}
.d{background:var(--surface); color:var(--bad); border-color:color-mix(in srgb,var(--bad) 34%,transparent)}
@media(hover:hover){.d:hover{background:var(--bad-wash)}}
/* «الصغير» أضيقُ حشوا لا أقصرُ قامة: زرٌّ في جدولٍ يزدحم عرضا لا طولا،
   وتقصيرُه يُسقطه دون حدّ الهدف — وهو ما كان يقع. */
.sm{padding:var(--s-1) var(--s-3); font-size:var(--t-sm); border-radius:var(--r-sm)}
button:disabled{opacity:.45; cursor:not-allowed}
/* ضغطةٌ تُحسّ: إزاحةُ بكسلٍ واحد. وبلا ردٍّ يظنّ الضاغطُ أنّه لم يُصب */
button:active:not(:disabled),.btn:active{transform:translateY(1px)}
/* ── الرمزُ في الرابط بقدرِ حرفه (D-167) ─────────────────────────────
   سهما الرابط ومفتاحُ الأوامر كانت حروفًا تكبر مع ما حولها. **وSVG بلا قياسٍ
   في حاويةٍ مرنة يُرسَم ‏٠×‏٠**: هكذا كان سهمُ المغادرة في «افتح في Drive»
   و«افتحه على المنصّة» غائبًا — قِيس صندوقُه ‏٠×‏٠ عند ‏١٤٤٠. فالرمزُ ‏١em يتبع
   رتبةَ الحرف الذي يجاوره، ويهبط ثُمنَ em ليقع على سطر الحروف حيث لا مرونة. */
.btn>svg,nav.back a>svg,a.chip>svg,.kbd>svg{width:1em; height:1em; flex:none; vertical-align:-.125em}

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
  transition:border-color var(--dur-1) var(--ease), box-shadow var(--dur-1) var(--ease)}
input:focus,select:focus,textarea:focus{border-color:var(--brand); box-shadow:0 0 0 3px var(--ring); outline:none}

input[type=number]{width:110px}
/* ── طولُ السطر ───────────────────────────────────────────────────────
   45 إلى 75 محرفا. وقيست كتلٌ عند 135 — ضعفُ الحدّ. والعينُ ترتدّ من
   آخر السطر إلى أوّل التالي، فتفقد موضعَها كلّما طال.

   والتقييدُ بأقصى عرضٍ لا بعرضٍ ثابت: الكتلةُ تضيق مع الشاشة ولا تتمدّد
   معها، فالجوّالُ سليمٌ أصلا والشاشةُ العريضة هي التي تُفسد. */
/* و«pretty» تمنع الحرفَ اليتيمَ في آخر الفقرة: كلمةٌ وحدها في سطرٍ
   أخير تُقرأ سطرا ناقصا. وهي تعمل على المتن حيث «balance» لا تعمل —
   تلك للأسطر القليلة، وهذه لِما طال. */
p,li,.sub,.ch-note,.lede-note,.hint,.draft-why,.empty p{max-width:var(--measure);
  text-wrap:pretty}
/* وما يقرؤه غريبٌ لا مالك — الوثائقُ العامّة — يُعطى فسحةً أوسع قليلا */
.doc p,.doc li{max-width:var(--measure-wide)}

.row{display:flex; gap:var(--s-3); align-items:flex-end; flex-wrap:wrap}
/* أفعالُ الصفّ تُرصّ على الحافّة الخارجيّة (D-136): صفٌّ بزرٍّ وصفٌّ بزرّين
   يتّفقان على موضع «افتح في Drive»، فلا يقفز العمودُ بين الصفوف. */
.row.acts{gap:var(--s-2); justify-content:flex-end; align-items:center}
/* ملاحظةُ منتقي النموذج لا تحجز سطرًا وهي فارغة (D-137): كانت تُنزل
   «حفظ» ‏٢٠px تحت «حدّث» في صفّ التوجيه. */
.mp-note:empty{display:none}

/* ── الفراغ ────────────────────────────────────────────────── */
.empty{padding:var(--s-8) var(--s-5); text-align:center; border:1px solid var(--line-soft);
  background:transparent; border-radius:var(--r-lg)}
.empty b{display:block; font-size:var(--t-base); margin-bottom:var(--s-1); color:var(--ink)}
.empty p{margin:0 auto var(--s-3); max-width:46ch; font-size:var(--t-sm); color:var(--ink-3); line-height:var(--lh)}

.split{display:flex; gap:var(--s-4); align-items:center; justify-content:space-between; flex-wrap:wrap}
.split p{margin:0; font-size:var(--t-sm); color:var(--ink-3); max-width:60ch; line-height:var(--lh)}
hr{border:0; border-top:1px solid var(--line-soft); margin:var(--s-4) 0}
footer{margin-top:var(--s-6); padding-top:var(--s-4); border-top:1px solid var(--line-soft);
  color:var(--ink-3); font-size:var(--t-xs); display:flex; justify-content:space-between; flex-wrap:wrap; gap:var(--s-2)}

/* ── ما ينتظرك ─────────────────────────────────────────────── */
.todo{list-style:none; margin:0; padding:0; display:flex; flex-direction:column}
.todo li{display:flex; align-items:center; gap:var(--s-2); font-size:var(--t-sm);
  border-bottom:1px solid var(--line-soft); padding:var(--s-1) var(--s-0)}
.todo li:last-child{border-bottom:0}
.todo .dot{width:6px; height:6px; border-radius:50%; flex:none; background:var(--ink-3)}
/* سجلُّ صحّة الحساب يعيد قائمةَ «ما ينتظرك» بلا زرّ (D-129) */
.todo.health{margin-top:var(--s-2)}
.todo .dot.warn{background:var(--warn)} .todo .dot.bad{background:var(--bad)}
.todo .dot.ok{background:var(--ok)}
.todo a,.todo form{margin-inline-start:auto}
/* أزرارُ الصفوف عمودٌ واحدٌ لا حافّةٌ مسنّنة (D-136): عرضٌ أدنى واحد،
   والأطولُ يتجاوزه بحقّه. */
.todo>li>a.btn,.todo>li>form .btn{background:transparent; border-color:transparent;
  box-shadow:none; color:var(--brand); min-width:44px; padding-inline:var(--s-3); font-weight:600;
  margin-block:-1px;
  /* منذ صار الحبرُ لونَ العلامة لا يفرّق اللونُ رابطًا عن نصّه (‏١٫١١:١)؛ فعلامةٌ لا لونيّة: خيطُ نحاسٍ تحته (D-149) */
  text-decoration:underline; text-underline-offset:3px; text-decoration-thickness:1px; text-decoration-color:var(--au)}

/* ── صفٌّ عاجلٌ في «ما عليك» (D-123) ────────────────────────────────
   مهمّةٌ توقف بوّابةَ مرحلةٍ ولم تتمّ. **وكان الصنفُ يُكتب في الوسم ولا
   قاعدةَ له** — فيُقرأ في المصدر مميَّزا ويُرسَم كسائر الصفوف. والغسلُ
   خافتٌ لأنّ الحالَ تقولها شارةُ «بوّابة» الحمراء بنصّها (D-043)؛ الأرضُ
   تُعين العينَ على المسح ولا تحمل المعنى وحدَها. */
tr.urgent td{background:color-mix(in srgb,var(--bad) 5%,transparent)}
/* ── قائمةٌ بلا زينة (D-123) ──────────────────────────────────────────
   ملحوظاتُ المراجعة وما خرج من التوزيع: **بنودٌ تُقرأ لا نقاطٌ تُعدّ**.
   وكان الصنفُ بلا قاعدة، فيرث نقطةَ المتصفّح وحشوَه — والحشوُ ‏٤٠px
   خارجَ السلّم. */
ul.plain{list-style:none; margin:0; padding:0}
ul.plain li{margin:0 0 var(--s-2); font-size:var(--t-sm); line-height:var(--lh)}
ul.plain li:last-child{margin-bottom:0}

/* ── الرسم ─────────────────────────────────────────────────── */
.chart{margin-top:var(--s-1)}
/* **الرسمُ يتمدّد والحرفُ لا** (D-153): المسارُ في SVG بحدٍّ لا يتمدّد،
   والأرقامُ والتواريخُ ونقطةُ الذروة HTML فوقه بمواضعَ مئويّة — فالحرفُ
   ‏١٢px على كلّ عرض. والصندوقُ لاتينيُّ الاتّجاه لأنّ مواضعَه من إحداثيّات
   الرسم (يسارُه بدايتُه). */
.chart .plot{position:relative; direction:ltr; height:168px}
.chart svg{display:block; width:100%; height:100%}
.chart .axis{position:absolute; font-size:var(--t-xs); color:var(--ink-3); font-variant-numeric:tabular-nums;
  line-height:1; white-space:nowrap; unicode-bidi:isolate}
.chart .axis.y{transform:translateY(-50%)}
.chart .axis.x{transform:translateY(-100%)}
.chart .axis.x.end{text-align:end}
.chart .peak{position:absolute; width:7px; height:7px; border-radius:50%; background:var(--surface);
  border:2px solid var(--brand); transform:translate(-50%,-50%)}
.chart .grid-l{stroke:var(--line-soft); stroke-width:1; vector-effect:non-scaling-stroke}
.chart .base{stroke:var(--line); stroke-width:1; vector-effect:non-scaling-stroke}
/* ── خطُّ الرحلة (D-104) ───────────────────────────────────────────────
   خيطٌ يصل المحطّاتِ — **وهو المعلومة لا الصفوف**: ثلاثُ محطّاتٍ متفرّقة
   تُقرأ ثلاثةَ أشياء، وموصولةً تُقرأ سببيّةً لها أوّلٌ وآخر. وهي قاعدةُ
   «ol.steps» نفسُها في الدليل.

   والخيطُ لا يُرسَم بعد الأخيرة: خيطٌ ينتهي إلى فراغٍ يَعِد بمحطّةٍ لم تقع. */
.journey{margin:0; padding:0; list-style:none;
  display:flex; flex-direction:column; gap:var(--s-4); position:relative}
.stop{display:flex; gap:var(--s-3); align-items:flex-start; position:relative}
.stop:not(:last-child)::before{content:''; position:absolute; top:34px;
  bottom:calc(-1 * var(--s-4)); inset-inline-start:16px; width:1px;
  background:var(--line-strong)}
.stop-mark{flex:none; width:33px; height:33px; border-radius:50%; z-index:1;
  display:grid; place-items:center; background:var(--surface); color:var(--ink-3);
  border:1px solid var(--line-strong); box-shadow:0 0 0 3px var(--bg)}
.stop-mark svg{width:15px; height:15px; display:block}
/* **والحالُ لونٌ ورمزٌ ونصّ** (D-043): اللونُ على الحلقة، والنصُّ في
   العنوان («لم تنجح»)، والرمزُ نوعُ المحطّة. */
.stop.done .stop-mark{color:var(--brand); border-color:color-mix(in srgb,var(--brand) 42%,transparent)}
.stop.failed .stop-mark{color:var(--bad); border-color:color-mix(in srgb,var(--bad) 42%,transparent)}
.stop.pending .stop-mark{color:var(--warn); border-color:color-mix(in srgb,var(--warn) 42%,transparent);
  border-style:dashed}
.stop-body{min-width:0; padding-top:var(--s-1)}
.stop-t{display:block; font-size:var(--t-base); font-weight:600; line-height:var(--lh-tight)}
.stop-d{margin:var(--s-1) 0 0; font-size:var(--t-sm); color:var(--ink-2);
  line-height:var(--lh); max-width:var(--measure)}
.stop-meta{display:flex; align-items:center; gap:var(--s-2); flex-wrap:wrap; margin-top:var(--s-2)}
/* ما تغيّر قبل الاعتماد (D-128): مطويٌّ في ذيل البطاقة، والفرقُ سطرًا سطرًا
   بعلامةٍ قبل اللون — لونُ الحالة يُقرأ على البطاقة لا على غسيله */
.diff{margin-top:var(--s-2); border-top:1px solid var(--line-soft); padding-top:var(--s-1)}
.diff>summary{font-size:var(--t-sm); color:var(--ink-2); cursor:pointer; gap:var(--s-2)}
.diff-body{margin:var(--s-2) 0 0; font:inherit; font-size:var(--t-sm); line-height:var(--lh);
  white-space:pre-wrap; overflow-wrap:anywhere; max-width:var(--measure)}
.dl{display:block; padding:0 var(--s-1); border-radius:var(--r-xs)}
.dl.del{color:var(--bad); text-decoration:line-through; text-decoration-thickness:1px}
.dl.add{color:var(--ok)}
.dl.same{color:var(--ink-3)}
/* رابطُ المحطّة إلى موضعها — آخرَ السطر، ويلتفّ مع الضيق (D-126) */
.stop-go{margin-inline-start:auto}
/* أمرُ wrangler في صفّ المهمّة: حقلٌ يُقرأ ويُنسَخ، لاتينيٌّ معزول (D-126) */
.cmd{margin-top:var(--s-2)}
.cmd-text{flex:1 1 220px; min-width:0; direction:ltr; text-align:start; font-size:var(--t-sm);
  padding:var(--s-2) var(--s-3); border:1px solid var(--line); border-radius:var(--r-sm);
  background:var(--surface-2); color:var(--ink); resize:none; white-space:pre; overflow-x:auto}

/* ── الأعمدةُ الأفقيّة (D-103) ────────────────────────────────────────
   ثلاثةُ أعمدةٍ ثابتةِ الموضع: الاسمُ والمقياسُ والرقم. **والعينُ تمسح
   عمودا لا شبكة** — وهي قاعدةُ لوح المزوّدين نفسُها (D-082).

   والاسمُ بعرضٍ أدنى ثابت: أسماءٌ متفاوتةُ الطول تجعل المقاييسَ تبدأ من
   مواضعَ مختلفة، **فتُقارَن أطوالٌ لا تبدأ من خطٍّ واحد**. */
.bars{display:flex; flex-direction:column; gap:var(--s-2)}
.bar-row{display:flex; align-items:center; gap:var(--s-3)}
.bar-name{flex:none; min-width:88px; font-size:var(--t-sm); color:var(--ink-2);
  overflow-wrap:anywhere}
.bar-track{flex:1; height:10px; background:var(--surface-3); border-radius:var(--r-pill);
  overflow:hidden; min-width:40px}
/* **مقياسُ مقدارٍ لا تصنيف**: هيئةٌ واحدةٌ تتدرّج بالطول، ولا لونَ حالةٍ
   فيها — الأحمرُ حالةٌ لا مقدار (D-043). */
.bar-fill{display:block; height:100%; border-radius:var(--r-pill); background:var(--brand);
  transition:width var(--dur-3) var(--ease-out)}
/* **والأكبرُ وحدَه يأخذ الذهب**: ندرةٌ تصنع مرتبة، وذهبٌ على الكلّ يُلغي
   معنى الأوّل — وهي قاعدةُ صفّ المؤشّرات نفسُها. */
.bar-fill.top{background:var(--au)}
/* أسبوعٌ قِيس بعضُه — عمودُه مخطَّط، والرقمُ بجانبه يقول كم (D-127) */
.bar-fill.part{background:repeating-linear-gradient(135deg,var(--brand) 0 6px,color-mix(in srgb,var(--brand) 45%,transparent) 6px 12px)}
.history{margin-bottom:var(--s-4)}
.history .bar-name{text-decoration:none; color:var(--brand); font-variant-numeric:tabular-nums}
.bar-val{flex:none; min-width:70px; text-align:end; font-size:var(--t-sm);
  color:var(--ink); font-variant-numeric:tabular-nums}
@media(max-width:560px){.bar-name{min-width:62px}}

.legend{display:flex; gap:var(--s-3); flex-wrap:wrap; margin-top:var(--s-3); font-size:var(--t-xs); color:var(--ink-3)}
.legend b{color:var(--ink); font-weight:600; font-variant-numeric:tabular-nums;
  direction:ltr; unicode-bidi:isolate; display:inline-block}

/* ── القنوات ───────────────────────────────────────────────── */
/* صفُّ تمهيدٍ رفيع بدل بطاقةٍ كاملة: الشرحُ يصحب القسم ولا يزاحمه */
.lede-row{display:flex; align-items:baseline; gap:var(--s-3); flex-wrap:wrap; margin-bottom:var(--s-3)}
.lede-note{font-size:var(--t-xs); color:var(--ink-3); line-height:var(--lh); flex-basis:100%}
@media(min-width:1100px){.lede-note{flex-basis:auto; max-width:62ch; text-align:end}}

.ch{display:flex; flex-direction:column; gap:var(--s-3); background:var(--surface);
  border:1px solid var(--line); border-radius:var(--r-lg); padding:var(--s-4) var(--s-4); box-shadow:var(--sh-1)}
.ch.off{background:var(--surface-2); box-shadow:none; border-style:dashed}
.ch-top{display:flex; align-items:center; gap:var(--s-3)}
.ch-logo{width:34px; height:34px; border-radius:var(--r-sm); flex:none; display:grid; place-items:center;
  background:var(--surface-2); border:1px solid var(--line); color:var(--ink-2)}
.ch.off .ch-logo{color:var(--ink-3)}
.ch-logo svg{width:17px; height:17px; display:block}
.ch-name{font-weight:700; font-size:var(--t-md); line-height:var(--lh-tight); letter-spacing:-.1px}
.ch-name a{color:inherit; text-decoration:underline; text-underline-offset:3px; text-decoration-thickness:1px; text-decoration-color:var(--au)}
@media(hover:hover){.ch-name a:hover{color:var(--brand); text-decoration:underline; text-underline-offset:3px}}
.ch-name span{display:block; font-size:var(--t-xs); font-weight:500; color:var(--ink-3); letter-spacing:0}
.ch-note{font-size:var(--t-sm); color:var(--ink-3); line-height:var(--lh); margin:0}
.ch-acc{display:flex; align-items:center; gap:var(--s-2); padding:var(--s-2) var(--s-3); border-radius:var(--r-sm);
  background:var(--surface-2); border:1px solid var(--line-soft); font-size:var(--t-sm)}
.ch-acc .who{font-weight:600}
/* نصٌّ عربيّ خافت — ولا يُعطى صنفَ mono: خطٌّ لاتينيّ باتّجاه LTR يفكّك
   الحروف العربيّة فتُقرأ «سا ئقا». علّةٌ تُرى ولا يكشفها اختبار. */
.ago{font-size:var(--t-xs); color:var(--ink-3)}
.ch-foot{display:flex; align-items:center; gap:var(--s-2); flex-wrap:wrap; margin-top:auto; padding-top:var(--s-0)}
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
  background:linear-gradient(180deg,var(--au),color-mix(in srgb,var(--brand) 22%,transparent))}
.guide>summary{cursor:pointer; list-style:none; display:flex; align-items:center;
  gap:var(--s-3); padding:var(--s-3) var(--s-5); min-height:56px}
.guide>summary::-webkit-details-marker{display:none}
@media(hover:hover){.guide>summary:hover{background:var(--surface-3)}}
.guide .g-ic{flex:none; width:30px; height:30px; border-radius:var(--r-sm); display:grid; place-items:center;
  background:var(--brand-wash); color:var(--brand);
  border:1px solid color-mix(in srgb,var(--brand) 26%,transparent)}
.guide .g-ic svg{width:15px; height:15px; display:block}
.guide .g-t{min-width:0}
.guide .g-t b{display:block; font-size:var(--t-md); font-weight:700; letter-spacing:-.15px}
.guide .g-t span{display:block; font-size:var(--t-sm); color:var(--ink-3); line-height:var(--lh);
  max-width:var(--measure)}
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
ol.steps .body{min-width:0; max-width:var(--measure); padding-top:var(--s-0)}
ol.steps .what{display:block; font-weight:600; color:var(--ink); margin-bottom:var(--s-0);
  font-size:var(--t-base); line-height:var(--lh-tight)}
ol.steps .why{display:block; color:var(--ink-3)}

/* ── قائمةُ المزوّدين: صفٌّ يفتح لوحَه ────────────────────────────────
   كانت ستَّ بطاقاتٍ في شبكةٍ من عمودين، كلُّ بطاقةٍ سبعةُ شؤون. **والعينُ
   لا تمسح شبكةً كما تمسح عمودا**: كلُّ بطاقةٍ تُقرأ وحدةً قائمةً بذاتها،
   فمقارنةُ ستٍّ تحتاج ستَّ قراءات.

   فصار صفّا: أربعةُ أعمدةٍ ثابتةِ الموضع — الاسمُ والنموذجُ وإنفاقُ اليوم
   والحال — تُقرأ رأسيّا بمسحةٍ واحدة. **وما عداها في لوحٍ ينفتح في
   مكانه**، فلا ينقل القارئَ إلى شاشةٍ أخرى.

   و«details» لا زرٌّ بـ JS: صفحةٌ تحتاج سكربتا لتُقرأ تنكسر صامتة. */
.plist{display:flex; flex-direction:column; border:1px solid var(--line);
  border-radius:var(--r); overflow:hidden; margin-top:var(--s-3)}
.prow+.prow{border-top:1px solid var(--line-soft)}
.prow>summary{display:flex; align-items:center; gap:var(--s-3); cursor:pointer;
  padding:var(--s-3) var(--s-4); min-height:var(--tap); list-style:none;
  background:var(--surface)}
.prow>summary::-webkit-details-marker{display:none}
@media(hover:hover){.prow>summary:hover{background:var(--surface-2)}}
.prow[open]>summary{background:var(--surface-2); border-bottom:1px solid var(--line-soft)}
/* الاسمُ يأخذ ما بقي، وما بعده ثابتُ العرض — فالأعمدةُ تصطفّ رأسيّا */
.prow .pn{flex:1; min-width:0; font-size:var(--t-base); font-weight:700; color:var(--ink)}
.prow .pk{display:block; font-size:var(--t-xs); font-weight:500; color:var(--ink-3)}
.prow .pm{flex:none; width:200px; font-size:var(--t-xs); color:var(--ink-2);
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap; direction:ltr; text-align:start}
.prow .pv{flex:none; width:80px; font-size:var(--t-base); font-weight:700; color:var(--ink);
  font-variant-numeric:tabular-nums}
.prow .pv i{display:block; font-style:normal; font-size:var(--t-xs); font-weight:500; color:var(--ink-3)}
.prow .pst{flex:none; width:150px}
.pbody{padding:var(--s-4); background:var(--surface-2)}
/* أربعةُ حقولٍ في سطرٍ على الشاشة، واثنان في الجوّال — ولا يُقصّ شيء */
.pgrid{display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:var(--s-3)}
.pgrid .k{font-size:var(--t-xs); font-weight:600; color:var(--ink-3); margin-bottom:var(--s-1)}
.pgrid .mono{font-size:var(--t-sm)}

/* ── معالجُ الربط: الخطواتُ نفسُها، وحالُ كلٍّ بجانبها ────────────────
   والحالُ **يمينَ السطر لا تحته**: عينٌ تمسح عمودا واحدا تجد موضعَها
   في الطريق بلا قراءة. ويلتفّ تحت المحتوى في الجوّال حيث لا عرضَ له.

   والخطوةُ الجارية **تُظلَّل**: أربعُ خطواتٍ متساويةٍ في الوزن تجعل
   العينَ تقرؤها كلَّها لتعرف أين هي — وواحدةٌ مميّزةٌ تُقرأ بلا قراءة. */
ol.steps.wiz{gap:var(--s-3); margin-bottom:0}
ol.steps.wiz li{align-items:center; flex-wrap:wrap; padding:var(--s-2) var(--s-3);
  border-radius:var(--r-sm); border:1px solid transparent}
ol.steps.wiz li.at{background:var(--brand-wash); border-color:var(--line-strong)}
/* والخيطُ يُزاح مع الحشو، فلا يقع خارجَ الدوائر */
ol.steps.wiz li:not(:last-child)::before{top:34px; bottom:calc(-1 * var(--s-3));
  inset-inline-start:24px}
ol.steps.wiz .body{flex:1; min-width:180px}
ol.steps.wiz .st{flex:none; margin-inline-start:auto}
/* ورقمُ خطوةٍ رُدّت أو تمّت يحمل لونَ حالها — والعلامةُ نصٌّ بجانبه */
ol.steps.wiz li.ok .n{color:var(--ok); border-color:color-mix(in srgb,var(--ok) 40%,transparent)}
ol.steps.wiz li.bad .n{color:var(--bad); border-color:color-mix(in srgb,var(--bad) 40%,transparent)}
ol.steps.wiz li.idle .n{color:var(--ink-3); border-color:var(--line)}
/* بنودُ البوّابة شروطٌ لا خطواتٌ مرتَّبة — فلا رقمَ ولا خيطٌ يصلها */
ol.steps.wiz.nodot li::before{display:none}

/* ── تبويباتُ الفرز ───────────────────────────────────────────────────
   روابطُ استعلامٍ لا أزرارُ سكربت: تُفتَح في تبويبٍ جديد، وتُحفَظ في
   المفضّلة، وتعمل إن سقط السكربت. **وحالُ الصفحة في عنوانها.**

   والعددُ **معروضٌ دائما** لا عند الفتح: من يقف على «الكلّ» يرى «فشل ٣»
   بلا أن يفتحه — والرقمُ هو الذي يُنبّه. */
.ftabs{display:flex; flex-wrap:wrap; gap:var(--s-2); margin-bottom:var(--s-4)}
.ftab{display:inline-flex; align-items:center; gap:var(--s-2);
  padding:var(--s-2) var(--s-3); min-height:var(--tap); border-radius:var(--r-sm);
  border:1px solid var(--line); background:var(--surface); color:var(--ink-2);
  font-size:var(--t-sm); font-weight:600; text-decoration:none}
@media(hover:hover){.ftab:hover{border-color:var(--line-strong); color:var(--ink)}}
.ftab .count{font-size:var(--t-xs); font-weight:700; font-variant-numeric:tabular-nums;
  padding:0 var(--s-2); border-radius:var(--r-pill); background:var(--surface-3); color:var(--ink-3)}
/* المفتوحُ يُعلَّم بأكثر من لون: خطٌّ وثِقَلٌ وأرضيّة (D-043) */
.ftab.on{border-color:var(--brand); background:var(--brand-wash); color:var(--ink)}
/* الصفُّ الثاني: منصّاتٌ وترتيبٌ في سطرٍ واحدٍ يلتفّ (D-127) */
.ftabs-2{align-items:center; margin-top:calc(-1 * var(--s-2))}
.ftabs-2 .order{display:inline-flex; align-items:center; gap:var(--s-2)}
.ftabs-2 .order select{min-height:var(--tap)}
.ftab.on .count{background:var(--brand); color:var(--on-brand)}
/* والفشلُ يحمل لونَه ولو لم يُفتَح — فلا يُقرأ تبويبا كسائره */
.ftab.bad .count{background:color-mix(in srgb,var(--bad) 18%,transparent); color:var(--bad)}
.ftab.bad.on{border-color:var(--bad); background:color-mix(in srgb,var(--bad) 10%,transparent)}
.ftab.bad.on .count{background:var(--bad); color:var(--bg)}

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
.help .i{flex:none; width:17px; height:17px; border-radius:50%; margin-top:var(--s-0);
  display:grid; place-items:center; font-size:var(--t-xs); font-weight:700;
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
/* بطاقةُ الخطوات على العريض عمودان (D-137): الخطواتُ يمينًا، والبابُ
   و«إن نجح» يسارًا — فلا تبقى جوفاءَ نصفِها. */
.guide-aside{display:grid; gap:var(--s-3); align-content:start}
@media(min-width:901px){
  .card.guide{display:grid; grid-template-columns:minmax(0,1.3fr) minmax(0,1fr); column-gap:var(--s-6); align-items:start}
  .card.guide .card-head{grid-column:1 / -1}
  .card.guide ol.steps{margin-bottom:0}
  .card.guide .outcome{margin-top:0}}
.outcome{display:flex; gap:var(--s-3); align-items:flex-start; margin-top:var(--s-3);
  padding:var(--s-3) var(--s-4); border-radius:var(--r); background:var(--ok-wash);
  border:1px solid color-mix(in srgb,var(--ok) 20%,transparent)}
.outcome .k{flex:none; font-size:var(--t-xs); font-weight:700; color:var(--ok);
  padding-top:var(--s-0); min-width:62px}
.outcome .v{font-size:var(--t-sm); line-height:var(--lh); color:var(--ink-2);
  max-width:var(--measure)}
.outcome.warn{background:var(--warn-wash);
  border-color:color-mix(in srgb,var(--warn) 22%,transparent)}
.outcome.warn .k{color:var(--warn)}

/* المطويُّ العامّ — لا يُصنَّف دليلا: صناديقُ الاسترداد وما شابهها */
.setup{border-top:1px solid var(--line-soft); padding-top:var(--s-3); margin-top:var(--s-0)}
/* وسمُ summary هدفٌ يُنقر كالزرّ سواء، فيأخذ حدَّه: قيس عند 20px قامةً
   — وهو ثلثُ الحدّ. */
summary{min-height:var(--tap); display:flex; align-items:center}
.setup>summary{cursor:pointer; font-size:var(--t-sm); font-weight:600; color:var(--brand);
  list-style:none; padding:var(--s-2) 0}
.setup>summary::-webkit-details-marker{display:none}
/* والمطويُّ يشير إلى نهاية السطر لا إلى يمينه (D-167): كان «▸» — حرفًا من خطّ
   النظام **يشير يمينًا في صفحةٍ تُقرأ من اليمين**، أي إلى الوراء. والمثلّثُ من
   الحدّ المنطقيّ يشير إلى «inline-end» في الاتّجاهين، ويُقلَب إلى الأسفل مفتوحًا */
.setup>summary::before{content:''; display:inline-block; flex:none; width:0; height:0;
  margin-inline-end:var(--s-2);
  border-block:.3em solid transparent; border-inline-start:.4em solid; border-inline-end:0}
.setup[open]>summary::before{border-inline:.3em solid transparent; border-block-start:.4em solid;
  border-block-end:0}
.setup-body{padding-top:var(--s-2)}

.copy{display:flex; gap:var(--s-2); align-items:stretch}
.copy input{flex:1 1 auto; min-width:0; font-size:var(--t-sm);
  direction:ltr; text-align:start; background:var(--surface-2)}

/* ── المسوّدات ────────────────────────────────────────────────────────
   المربّعُ نفسه هو المعروض: لا «اعرض» ثمّ «عدّل» في شاشتين، فما يُقرأ هو
   ما يُرسَل. ولذلك يرث خطَّ الصفحة وقياسَها لا خطَّ النماذج الافتراضيّ —
   منشورٌ يُقرأ في مربّعٍ ضيّق يُحكَم عليه بغير ما سيبدو عليه. */
/* شبكةٌ لا تمطّ: بطاقتان بنصّين مختلفَي الطول لا تُجبَران على ارتفاعٍ
   واحد، وإلّا انفتح تحت الأقصر فراغٌ بقدر فرق النصّين.

   **وهي للمسوّدات وحدَها** (D-111). كانت على شبكة القنوات أيضا، وقِيس
   أثرُها: بطاقاتٌ ‏٢٩٤ و‏٢١٦ و‏١٨١ في شبكةٍ ارتفاعُ صفّها ‏٢٩٤ — **فأزرارُ
   الفعل على ثلاثة خطوطٍ مختلفة**، والعينُ تقرأ ذلك عشوائيّةً.

   **والحجّةُ تنطبق على المسوّدة ولا تنطبق على القناة**: طولُ المسوّدة
   نصُّها، وقد يزيد بأضعاف. وحقولُ القناة متجانسة، وفرقُها ‏٧٨px،
   **وذيلُها «margin-top:auto» فيملأ الفرقَ بقصدٍ ويصطفّ الفعلُ على خطٍّ
   واحد**. فما كان فراغا صار محاذاة. */
/* **وأعمدةٌ لا شبكة** (D-177): الشبكةُ «الممزّقة» تركت تحت البطاقات القصيرة ثقوبًا
   من ‏740 إلى ‏890px (التدقيقُ الرابع) — صفُّها بطولِ أطولِ بطاقة. والأعمدةُ تصبّ
   البطاقةَ تحت جارتها بلا انتظارِ صفّ، فلا ثقب. وترتيبُ الوثيقة باقٍ: J/K تمشي فيه. */
.dcols{columns:2 440px; column-gap:var(--s-3)}
/* ── فيديوهاتك (D-180) ─────────────────────────────────────────────────
   الملفُّ يُختار بلصيقةٍ بهيئة زرّ: حقلُ الملفّ الأصليّ لا يُصمَّم ويقول «No file chosen»
   بلغة المتصفّح. **فيغطّي الزرَّ شفّافًا لا يُصغَّر إلى بكسل**: هدفُ اللمس بحجم الزرّ
   (أمسكه مدقّقُ الأهداف ‏1×1)، وقارئُ الشاشة ولوحةُ المفاتيح يبلغانه كما هو. */
.vpick{position:relative; overflow:hidden}
.vpick:focus-within{outline:2px solid var(--brand); outline-offset:2px}
.vup{display:flex; align-items:center; gap:var(--s-3); flex-wrap:wrap; margin-bottom:var(--s-3)}
.vfile{position:absolute; inset:0; width:100%; height:100%; margin:0; opacity:0; cursor:pointer}
.vup progress{flex:1 1 200px; height:10px; accent-color:var(--ok)}
.vlist{display:flex; flex-direction:column; gap:var(--s-3)}
.vrow{display:flex; flex-direction:column; gap:var(--s-2); padding:var(--s-3); border-radius:var(--r);
  border:1px solid var(--line); background:var(--surface-2)}
.vmeta{display:flex; flex-direction:column; gap:var(--s-1)}
.vrow > .st{align-self:flex-start}
.vpfs{display:grid; gap:var(--s-2); grid-template-columns:repeat(auto-fit,minmax(min(200px,100%),1fr)); margin-bottom:var(--s-2)}
.vpf{display:flex; align-items:flex-start; gap:var(--s-2); padding:var(--s-2); min-height:var(--tap);
  border-radius:var(--r-sm); background:var(--surface); border:1px solid var(--line-soft)}
.vpf input{margin:var(--s-1) 0 0}
.vpf-b{display:flex; flex-direction:column; align-items:flex-start; gap:var(--s-1); min-width:0}
/* ‏وسببُ المنصّة جملةٌ لا لصيقة: يلتفّ ولا يدفع الصفحةَ ‏19px عند ‏320 */
.vpf-b .st{white-space:normal; max-width:100%}
.vapprove{display:inline-flex; align-items:center; gap:var(--s-2); min-height:var(--tap); font-size:var(--t-sm)}
.vapprove input{margin:0}
.dcols > *{break-inside:avoid; margin-bottom:var(--s-3)}

/* ── اختيارُ بطاقات اللوح (D-119) ─────────────────────────────────────
   **واللصيقةُ هي الهدف لا المربّع**: صندوقُ الاختيار يرسمه المتصفّح
   ثلاثةَ عشرَ بكسلا، فيُلَفّ بلصيقةٍ تُضغَط في أيّ موضعٍ منها — سلوكُ
   HTML لا حيلةُ أنماط (D-100). */
.tgrid{display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr));
  gap:var(--s-2)}
.tpick{display:flex; align-items:flex-start; gap:var(--s-3); cursor:pointer;
  padding:var(--s-3); border:1px solid var(--line); border-radius:var(--r);
  background:var(--surface-2); min-height:var(--tap);
  transition:border-color var(--dur-2) var(--ease), background var(--dur-2) var(--ease)}
@media(hover:hover){.tpick:hover{background:var(--surface-3)}}
/* والمختارةُ تُعرَف بحدٍّ لا بأرضيّةٍ ملوّنة: أرضيّةٌ تحت نصٍّ تخفض تباينَه */
.tpick.on{border-color:color-mix(in srgb,var(--brand) 45%,transparent)}
/* **والهامشُ يُصرَّح به كلُّه**: المتصفّحُ يضع لصندوق الاختيار ٣px من
   عنده، **وهي خارج السلّم** — فيُضبَط الأربعةُ لا الأعلى وحدَه */
.tpick input{flex:none; margin:var(--s-1) 0 0; width:16px; height:16px;
  accent-color:var(--brand)}
.tpick .tp-t{min-width:0}
.tpick .tp-t b{display:block; font-size:var(--t-sm); font-weight:700}
.tpick .tp-t span{display:block; font-size:var(--t-xs); color:var(--ink-3);
  line-height:var(--lh); margin-top:var(--s-1)}
.draft{display:flex; flex-direction:column; gap:var(--s-3); background:var(--surface);
  scroll-margin-block-start:var(--s-16);
  border:1px solid var(--line); border-radius:var(--r-lg); padding:var(--s-4) var(--s-4); box-shadow:var(--sh-1)}
.draft.done{background:var(--surface-2); box-shadow:none}
.draft-top{display:flex; align-items:center; gap:var(--s-3)}
/* ══ مسرحُ القرار (D-100) ═══════════════════════════════════════════
   ── صندوقُ التحديد ───────────────────────────────────────────────
   اللصيقةُ هي الهدفُ لا الصندوق: صندوقُ المتصفّح ثلاثةَ عشرَ بكسلا،
   **ولا يُكبَّر بلا أن يُرسَم من جديد**. فتُمَدّ اللصيقةُ حوله إلى ٤٤
   (D-086) ويبقى الصندوقُ بحجمه — يرى الإصبعُ هدفا، وترى العينُ صندوقا. */
.pick{flex:none; display:grid; place-items:center;
  width:var(--tap); height:var(--tap); margin-inline-start:calc(-1 * var(--s-3));
  border-radius:var(--r-sm); cursor:pointer}
@media(hover:hover){.pick:hover{background:var(--surface-2)}}
.pick input{width:17px; height:17px; margin:0; accent-color:var(--brand); cursor:pointer}

/* ── البطاقةُ الحاليّة تحت لوحة المفاتيح ──────────────────────────
   حدٌّ بلون الهويّة **وحلقةٌ**: الحدُّ وحده يبدّل مقاسَ البطاقة بكسلا
   فتهتزّ القائمةُ مع كلّ ضغطةِ J. والحلقةُ خارج الصندوق فلا تُزيح شيئا. */
.draft.here{border-color:var(--brand);
  box-shadow:0 0 0 3px var(--ring), var(--sh-2), inset 0 1px 0 var(--hair)}
/* ── وهجُ الذهب: لِما ينتظر قرارا الآن وحدَه ──────────────────────────
   المسوّدةُ التي لم يُبَتّ فيها هي **الشيءُ الوحيد في الصفحة الذي يمنع
   إغلاقَها**. فتأخذ وهجَ الهويّة، ولا يأخذه غيرُها — **وذهبٌ يُوهَج به
   كلُّ شيءٍ يُلغي معنى الوهج**.
   وهو ظلٌّ لا أرضيّة: الذهبُ يُقتَّر ولا يُسكَب (D-053). */
.draft[data-status="waiting"]:not(.here){box-shadow:var(--glow)}

/* ── المعاينة: كما تُقرأ لا كما تُحرَّر ───────────────────────────
   المربّعُ حقلُ تحرير — خطُّ اللوحة وحدٌّ وشريطُ تمرير وعرضُ البطاقة.
   **والمنشورُ يُقرأ فقرةً في عمودٍ ضيّق**، وحكمٌ على نصٍّ في حقلٍ ليس
   حكما عليه منشورا.

   والعمودُ أضيقُ من «--measure» قصدا: عمودُ المنصّة أضيقُ من عمود
   قراءةٍ عاديّ، وهذا أقربُ ما نملك إليه بلا ادّعاء رقمٍ لم يُقَس. */
.pv-head{display:flex; align-items:center; gap:var(--s-2); margin-bottom:var(--s-2)}
/* دائرةٌ خافتةٌ مكانَ صورة الحساب: مربّعٌ فارغٌ يُقرأ صورةً لم تُحمَّل */
.pv-dot{width:26px; height:26px; border-radius:50%; flex:none;
  background:var(--surface-3); border:1px solid var(--line)}
.pv-who{font-weight:600; font-size:var(--t-sm)}
/* والأسطرُ تُحفظ كما كُتبت: منشورٌ بفقرتين يُقرأ فقرةً واحدة إن طُويت
   أسطرُه، فيُحكَم عليه بغير ما يظهر */
.pv-body{margin:0; white-space:pre-wrap; word-break:break-word;
  font-size:var(--t-base); line-height:var(--lh); color:var(--ink); max-width:46ch}
/* السطرُ الأوّلُ هو ما يُقرأ قبل أيّ طيّ **مهما كان حدُّه** — فيُثخَّن.
   ولا يُلوَّن: لونٌ على سطرٍ من فقرةٍ يُقرأ رابطا أو حالة. */
.pv-body b{font-weight:700}
.pv-note{margin:var(--s-3) 0 0; font-size:var(--t-xs); color:var(--ink-3);
  line-height:var(--lh); max-width:var(--measure);
  padding-top:var(--s-2); border-top:1px dashed var(--line)}

/* ── شريطُ البَتِّ الجماعيّ ───────────────────────────────────────
   ملتصقٌ بأسفل الشاشة: من يحدّد خمسا وهو في آخر القائمة لا يُطلَب منه
   أن يصعد. و«sticky» لا «fixed» — الأولى تبقى في تدفّق الصفحة فلا
   تغطّي آخرَ بطاقةٍ عند نهاية التمرير. */
.bulkbar{position:sticky; bottom:var(--s-3); z-index:15;
  display:flex; align-items:center; gap:var(--s-3); flex-wrap:wrap;
  margin:0 0 var(--s-3); padding:var(--s-3) var(--s-4);
  background:var(--surface); background-image:var(--sheen);
  border:1px solid var(--brand); border-radius:var(--r-lg);
  box-shadow:var(--sh-3), inset 0 1px 0 var(--hair)}
.bulkbar b{font-variant-numeric:tabular-nums}
.bulkbar .ago{direction:ltr; unicode-bidi:isolate}

/* ── لوحُ الاختصارات ─────────────────────────────────────────────
   مطويٌّ بالافتراض: من لا يعرفها لا يحتاج أن يراها في كلّ فتحة، ومن
   يعرفها لا يقرؤها. **ويُفتَح بالمفتاح نفسِه الذي يسأل عنه.** */
.keys{margin:0 0 var(--s-3); border:1px solid var(--line); border-radius:var(--r);
  background:var(--surface-2); font-size:var(--t-sm)}
.keys>summary{cursor:pointer; list-style:none; padding:var(--s-2) var(--s-3);
  min-height:var(--tap); display:flex; align-items:center; gap:var(--s-2);
  color:var(--ink-2); font-weight:600}
.keys>summary::-webkit-details-marker{display:none}
@media(hover:hover){.keys>summary:hover{background:var(--surface-3)}}
.keys .rows{display:flex; flex-wrap:wrap; gap:var(--s-2) var(--s-5);
  padding:0 var(--s-3) var(--s-3)}
.keys .row-k{display:inline-flex; align-items:center; gap:var(--s-2); color:var(--ink-3)}
/* والمفتاحُ يُرسَم مفتاحا: حرفٌ لاتينيٌّ في جملةٍ عربيّةٍ يُقرأ جزءا منها */
.keys kbd{font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:var(--t-xs);
  direction:ltr; unicode-bidi:isolate; min-width:22px; text-align:center;
  padding:var(--s-0) var(--s-1); border-radius:var(--r-xs); color:var(--ink);
  background:var(--surface); border:1px solid var(--line-strong);
  box-shadow:0 1px 0 var(--line-strong)}
.ch-logo.sm{width:30px; height:30px; border-radius:var(--r-sm)}
.draft-why{margin:0; font-size:var(--t-sm); color:var(--ink-3); line-height:var(--lh);
  border-inline-start:2px solid var(--line); padding-inline-start:var(--s-2)}
/* ارتفاعٌ من مضاعفاتِ السطر بالضبط.
   بارتفاعٍ حرّ يقع السطرُ الأخير مقصوصا في نصفه — نصفُ حرفٍ عند الحافّة
   يُقرأ عطلا في الرسم لا نصّا يفيض. والحسابُ يقتضي line-height بالبكسل
   لا بمعامل: المعاملُ يعطي كسرا لا يُضرَب فيبقى النصف. */
.draft-text{width:100%; box-sizing:border-box; font:inherit; font-size:var(--t-base);
  line-height:26px; color:var(--ink); background:var(--bg); border:1px solid var(--line);
  border-radius:var(--r); padding:var(--s-3) var(--s-4); resize:vertical;
  white-space:pre-wrap; word-break:break-word; overflow-y:auto;
  height:calc(var(--lines) * 26px + 28px)}
/* المقروءُ يأخذ قدرَ نصّه بسقف: مربّعٌ ثابتٌ تحت نصٍّ قصير فراغٌ بلا سبب،
   وتحت نصٍّ طويل تمريرٌ في نصٍّ لا يُحرَّر. */
.draft-text[data-ro]{height:auto; max-height:calc(var(--lines) * 26px + 28px)}
.draft-text:focus{outline:none; border-color:var(--brand); box-shadow:0 0 0 3px var(--ring)}
/* المقروءُ لا يُسحَب: مقبضُ التحجيم يظهر على أيّ عنصرٍ فيه resize، ومقبضٌ
   على نصٍّ لا يُحرَّر يعد بما لا يقع. */
.draft-text.ro{background:var(--surface-3); color:var(--ink-2); resize:none}
.draft-foot{display:flex; align-items:center; gap:var(--s-2); flex-wrap:wrap; margin-top:var(--s-2)}
/* عدّادٌ لاتينيّ الأرقام: يُعزَل عن اتّجاه الصفحة فلا يُقلب «١٢٠ / ٢٨٠» */
.draft-foot .count{font-size:var(--t-xs); color:var(--ink-3); font-variant-numeric:tabular-nums;
  direction:ltr; unicode-bidi:isolate}
.draft-foot .count b{color:var(--ink-2); font-weight:700}
.draft-foot .count.warn b{color:var(--warn)}
.draft-foot .count.bad b{color:var(--bad)}
.draft-meta{display:flex; align-items:center; gap:var(--s-1); flex-wrap:wrap; margin-top:auto; padding-top:var(--s-0)}
/* ── الصورة ───────────────────────────────────────────────────────────
   تُعرض بعرض البطاقة كاملا: المالك يقرّر عليها، وقرارٌ على مربّعٍ صغير
   ليس قرارا. **وتُعرض كاملةً لا مقصوصة**: نسبةٌ مفروضةٌ مع cover كانت تقصّ
   مربّعَ النموذج إلى شريطٍ عريض، فيعتمد المالكُ وسطَ صورةٍ لم يرَ حوافَّها.
   فسِمَتا width/height تحجزان المكانَ قبل التحميل، والنسبةُ الحقيقيّةُ تغلب
   بعده، وcontain يمنع المطّ. */
.pic{margin-top:var(--s-2)}
/* height:auto ضروريّةٌ لا زينة: سِمَتا width/height على الوسم تُترجَمان
   إلى CSS بأولويّةٍ دنيا، فـ width:100% تغلب الأولى **ولا شيء يغلب
   الثانية** — فيبقى الارتفاع 628px والعرض عرضَ البطاقة، وتخرج الصورة
   ممطوطةً طولا. علّةٌ رأيتُها ولم يمسكها اختبار. */
.pic img{display:block; width:100%; height:auto; max-height:76vh; object-fit:contain;
  border-radius:var(--r); border:1px solid var(--line); background:var(--surface-2)}
/* صورةٌ لم تُحمَّل تُقال بلفظها: مربّعٌ رماديٌّ فارغٌ كان يُقرأ «لا صورة» */
.pic-err{display:flex; align-items:center; gap:var(--s-2); flex-wrap:wrap;
  padding:var(--s-3); border-radius:var(--r); background:var(--surface-2);
  border:1px dashed var(--bad)}
.pic-foot{display:flex; align-items:center; gap:var(--s-1); flex-wrap:wrap; margin-top:var(--s-2)}
.pic.none{display:flex; align-items:center; gap:var(--s-2); flex-wrap:wrap;
  padding:var(--s-3) var(--s-3); border-radius:var(--r); background:var(--surface-2);
  border:1px dashed var(--line)}
/* الابنُ المباشرُ وحدَه: سطرُ الجاهزيّة تحته فيه «ago» أيضًا، وقاعدةٌ تنزل
   إليه تمدّ سببَه مئتي بكسل فيدفع رابطَه إلى سطرٍ وحدَه (D-163) */
.pic.none > .ago{flex:1 1 200px}
/* الصورةُ الفنّيّةُ مطويّةٌ تحت الإنفوجرافيك (D-174): بابٌ ثانٍ لا يزاحم
   الأوّلَ في سطره، وسطرُ جاهزيّته معه لا فوقه — فما ستقوله الدالّةُ يُقال
   قبل الضغط لكلا الزرّين */
.art{flex-basis:100%; border-top:1px solid var(--line-soft); padding-top:var(--s-1)}
.art>summary{display:flex; align-items:center; min-height:var(--tap); cursor:pointer;
  list-style:none; font-size:var(--t-sm); font-weight:600}
.art>summary::-webkit-details-marker{display:none}
/* ‏ومثلّثُ «.setup» نفسُه (D-167): يشير إلى نهاية السطر مطويًّا، وإلى الأسفل مفتوحًا */
.art>summary::before{content:''; display:inline-block; flex:none; width:0; height:0;
  margin-inline-end:var(--s-2);
  border-block:.3em solid transparent; border-inline-start:.4em solid; border-inline-end:0}
.art[open]>summary::before{border-inline:.3em solid transparent; border-block-start:.4em solid;
  border-block-end:0}
.art-row{display:flex; align-items:center; gap:var(--s-2); flex-wrap:wrap}
.art-row > .ago{flex:1 1 200px}
/* شريطُ الجدولة — سطرٌ مميّزٌ عن جسم البطاقة: هو قرارٌ آخر غير الاعتماد،
   ودمجُه في الذيل يجعل الضغطتين تبدوان ضغطةً واحدة. */
.sched{display:flex; align-items:flex-end; gap:var(--s-2); flex-wrap:wrap; margin-top:var(--s-2);
  padding:var(--s-3) var(--s-3); border-radius:var(--r); background:var(--surface-2);
  border:1px solid var(--line-soft)}
.sched.set{background:var(--ok-wash); border-color:transparent}
.sched.gone{background:var(--warn-wash); border-color:transparent}
.sched.none{background:var(--warn-wash); border-color:transparent; align-items:center}
.sched .field{margin:0; flex:1 1 150px; min-width:0}
.sched label{font-size:var(--t-xs)}
.sched input,.sched select{padding:var(--s-2) var(--s-2); font-size:var(--t-sm)}
/* الموعدُ لاتينيّ الأرقام ويُعزَل عن اتّجاه الصفحة */
.sched .when{font-size:var(--t-sm); color:var(--ink-2); direction:ltr; unicode-bidi:isolate}
.sched .ago{flex:1 1 auto}
/* شريطُ المواعيد السريعة — سطرٌ كاملٌ تحت الحقول لا بينها (D-089).
   «flex-basis:100%» يكسر السطر، فالأزرارُ لا تزاحم «جدوِل» على الجوّال. */
.quick{flex:1 0 100%; display:flex; align-items:center; gap:var(--s-1);
  flex-wrap:wrap; margin-top:var(--s-2); padding-top:var(--s-2);
  border-top:1px solid var(--line)}
.quick .mirror{font-size:var(--t-xs); color:var(--ink-2);
  direction:rtl; unicode-bidi:isolate}
/* لوحُ المراجعة — مطويٌّ عمدا (D-090): ملحوظاتُ ذوقٍ لا تزاحم النصَّ
   حتّى تُطلَب، «ولا شارةَ حمراء» فتُقرأ عطلا. */
.notes{margin-bottom:var(--s-2); border:1px solid var(--line);
  border-radius:var(--r-sm); background:var(--surface-2)}
.notes summary{display:flex; align-items:center; gap:var(--s-2);
  padding:var(--s-2); cursor:pointer; min-height:var(--tap)}
.notes summary::-webkit-details-marker{display:none}
.notes ul{margin:0; padding:0 var(--s-3) var(--s-2) var(--s-3)}
.notes li{margin-bottom:var(--s-2); font-size:var(--t-sm); line-height:1.7}
.notes li:last-child{margin-bottom:0}
.notes .hit-list{display:inline-flex; flex-wrap:wrap; gap:var(--s-1);
  margin-inline-start:var(--s-1)}

/* ── العامل الثاني ─────────────────────────────────────────── */
.codes{display:grid; grid-template-columns:repeat(auto-fill,minmax(148px,1fr)); gap:var(--s-2); margin:var(--s-3) 0}
.codes code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:var(--t-sm);
  letter-spacing:.06em; direction:ltr; background:var(--surface-2); border:1px solid var(--line);
  border-radius:var(--r-sm); padding:var(--s-2) var(--s-2); text-align:center; color:var(--ink)}

/* ══ شاشةُ المنصّة ═══════════════════════════════════════════════════
   بطاقةُ القناة تجيب «أمربوطةٌ أم لا» — وهو سؤالُ الضبط، يُسأل مرّةً.
   وهذه تجيب ما يُسأل كلَّ يوم: ماذا نُشر، وأين رابطُه، وما فشل ولماذا.
   ولا موضعَ لأيٍّ من ذلك في بطاقةٍ عرضُها نصفُ شاشة. */
/* شريطُ العودة — صفحةٌ خارج اللوحة تحتاج بابا يُرجَع منه، ولا رافدةَ
   فيها. و«رجوع» المتصفّح ليس بابا: مَن فتحها في تبويبٍ جديد لا رجوعَ له. */
nav.back{display:flex; align-items:center; padding:var(--s-3) 0 var(--s-5);
  border-bottom:1px solid var(--line-soft); margin-bottom:var(--s-4); gap:var(--s-4)}
nav.back a{font-size:var(--t-sm); font-weight:600; color:var(--ink-2); text-decoration:none;
  display:inline-flex; align-items:center; gap:var(--s-1); min-height:var(--tap); min-width:var(--tap)}
@media(hover:hover){nav.back a:hover{color:var(--brand)}}

.plat-logo{width:46px; height:46px; border-radius:var(--r); flex:none; display:grid; place-items:center;
  background:var(--surface); border:1px solid var(--line); color:var(--ink);
  box-shadow:var(--sh-1), inset 0 1px 0 var(--hair)}
.plat-logo svg{width:23px; height:23px; display:block}
.plat-logo.lg{width:58px; height:58px; border-radius:var(--r-lg)}
.plat-logo.lg svg{width:29px; height:29px}

/* النصُّ كما نُشر: يحفظ أسطرَه — منشورٌ بفقرتين يُقرأ فقرةً واحدة إن
   طُويت أسطرُه، فيُحكَم عليه بغير ما ظهر عليه. */
.post-text{margin:0; white-space:pre-wrap; word-break:break-word;
  font-size:var(--t-md); line-height:var(--lh); color:var(--ink); max-width:var(--measure)}
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
.why .i{flex:none; color:var(--bad); font-size:var(--t-xs); padding-top:var(--s-1)}
/* ورمزُ الفشل مرسومٌ (D-167)، ووسطُه على وسط السطر الأوّل من السبب */
.why .i svg{width:10px; height:10px; display:block; margin-top:var(--s-0)}
.why b{color:var(--ink)}
.why .t{min-width:0}
/* الموعدُ لاتينيُّ الأرقام ويُعزَل عن اتّجاه الصفحة */
.ago.when{direction:ltr; unicode-bidi:isolate; display:inline-block}

/* ══ صفحتا الدخول والعامل الثاني ═════════════════════════════ */
.wrap{max-width:1180px; margin:0 auto; padding:var(--s-6) var(--s-5) var(--s-16)}
.auth{max-width:400px; margin:12vh auto}
.auth .glyph{margin:0 auto var(--s-4); width:64px; height:64px; border-radius:var(--r-lg);
  box-shadow:var(--sh-2), 0 0 0 1px var(--line-strong)}
.auth h1{text-align:center; font-size:var(--t-2xl); margin:0 0 var(--s-1); letter-spacing:-.3px}
.auth .lede{text-align:center; color:var(--ink-3); font-size:var(--t-sm); margin:0 0 var(--s-5)}
.auth .card{padding:var(--s-5); box-shadow:var(--sh-2)}
.auth input{width:100%; direction:ltr; text-align:start; margin-bottom:var(--s-3)}
.auth button{width:100%; justify-content:center; padding:var(--s-3)}
.auth .card form + form{margin-top:var(--s-3)}
.or{display:flex; align-items:center; gap:var(--s-2); color:var(--ink-3); font-size:var(--t-xs); margin:var(--s-4) 0}
.or::before,.or::after{content:''; flex:1; height:1px; background:var(--line)}
.rec{margin-top:var(--s-4); border:1px solid var(--line); border-radius:var(--r); padding:var(--s-3) var(--s-3);
  background:var(--surface)}
.rec summary{cursor:pointer; font-size:var(--t-sm); color:var(--ink-2)}
.rec form{margin-top:var(--s-3)}
.cancel{margin-top:var(--s-4); text-align:center}
.n{font-size:var(--t-xs); color:var(--ink-3); margin-top:var(--s-2)}

/* ══ الشاشة الضيّقة ══════════════════════════════════════════ */
@media(max-width:960px){
  .app{grid-template-columns:1fr}
  .rail{position:static; height:auto; border-inline-start:0; border-bottom:1px solid var(--line)}
  nav.tabs{flex-direction:row; align-items:flex-start; overflow-x:auto; padding:0 var(--s-3) var(--s-2); gap:var(--s-1);
    scrollbar-width:thin}
  nav.tabs .lbl{display:none}
  /* شريطٌ صفٌّ واحد: «المنصّات» المفتوحة كانت تمدّه إلى ‏٣٧٠px فيبدأ المحتوى عند ‏٧٥٠ (D-151) */
  details.plat{display:none}
  nav.tabs a{white-space:nowrap; padding:var(--s-2) var(--s-3)}
  nav.tabs .count{margin-inline-start:var(--s-1)}
  .rail-foot{display:none}
  .topbar{padding:0 var(--s-4)} .content{padding:var(--s-4)}
}

/* ══ الجوّال: الشريطُ ينزل إلى الإبهام (D-107) ═══════════════════════
   **وما قِيس أحدُّ ممّا خُطِّط.** قالت «UX-7» «شريطُ تمريرٍ أفقيّ»، فقِيس
   عند ‏٣٩٠×‏٨٤٤: الرافدةُ ‏٤٣٨px فوق المحتوى، **وأوّلُ محتوًى يبدأ عند
   ‏٦٩٣** — أي أنّ الطُّرَّ يأكل ثمانين بالمئة من الشاشة قبل أن يُقرأ
   حرف. **والتمريرُ الأفقيُّ عرَضٌ لا داء.**

   فينزل الشريطُ إلى الأسفل حيث الإبهام، **ويختفي رأسُ الرافدة**: علامةٌ
   تُعرِّف بالمكان لمن يعرف مكانَه أصلا — وهي تُشترى بمئتَي بكسل.

   **وهو الشريطُ نفسُه لا شريطٌ ثانٍ**: «nav.tabs» تُنقَل ولا تُنسَخ،
   فلا وسمَ يشيخ وحدَه ولا نصٌّ ينسى أن يربطه. */
@media(max-width:720px){
  .rail{position:fixed; inset:auto 0 0; z-index:40; height:auto; border:0;
    border-top:1px solid var(--line-strong); box-shadow:var(--sh-2)}
  .rail-head{display:none}
  .topbar .glyph.tb{display:grid}
  /* **واسمُ المزوّد يأخذ السطرَ كلَّه**: قِيس عند ‏٣٩٠px فوُجد ‏٢٠px
     عرضا — «flex:1» بجانب عمودين ثابتَي العرض تركت له ما بقي، وما بقي لا
     يسع حرفا، فالتفّ الاسمُ حرفا حرفا فوق أخيه (D-123).
     **وموضعُها هنا لا في كتلة ‏٧٢٠ الأولى**: قاعدةُ الصفّ الأصليّة تأتي
     بعد تلك الكتلة فتدهسها بتساوي المحدّد — جُرّبت هناك فبقي ‏٢٠px. */
  .prow .pn{flex:1 1 100%}
  /* والحشوُ السفليُّ يحترم شريطَ الجهاز: قضيبُ الإيماء يبتلع صفّا كاملا */
  nav.tabs{padding:var(--s-1) var(--s-1) calc(var(--s-1) + env(safe-area-inset-bottom, 0px));
    overflow:visible; gap:0; justify-content:space-around}
  /*
   * **وما ليس في الخمسة يُبلَغ من «المزيد»** — ولا يُعدَّد ما يُخفى.
   *
   * كُتبت القاعدةُ أوّلا «a:not([data-bar])»، **فبقيت أزرارُ المنصّات
   * ظاهرةً**: هي «details» لا «a»، فابتلعت العرضَ وردّت الستّةَ إلى
   * ‏٤٥px لكلٍّ. **ولم يظهر ذلك في وسمٍ ولا اختبار — ظهر في قياس.**
   *
   * فتُقلَب القاعدة: **يُذكَر ما يبقى لا ما يُخفى**. وعنصرٌ يُضاف غدا
   * إلى الرافدة لا يتسلّل إلى الشريط لأنّه من نوعٍ لم يُعدَّد.
   */
  nav.tabs > :not(a[data-bar]):not(.cmdk-open){display:none}
  /*
   * **والرابطُ و«المزيد» قاعدةٌ واحدة.**
   *
   * كُتبا مفترقَين أوّلا، **فقُصّت «المزيد» ببكسل**: حيّزُها ‏١٩ وحرفُها
   * ‏٢٠ — لأنّ قاعدةَ العرض كُتبت لـ «a» وحدَها. **وخانةٌ في صفٍّ واحدٍ
   * تُصاغ مرّتين تفترق مرّةً.**
   */
  nav.tabs > a[data-bar],nav.tabs > .cmdk-open{
    flex:1 1 0; min-width:0; display:flex; flex-direction:column; gap:var(--s-0);
    align-items:center; justify-content:center; padding:var(--s-1) var(--s-0);
    min-height:var(--tap); border-radius:var(--r); text-align:center}
  /* **واللصيقةُ من السلّم لا دونه** (D-167): كانت ‏١٠px والعدُّ ‏٩px — خارجَ
     السلّم كلِّه، وأصغرُ حرفٍ فيه «--t-xs» ‏١١px. ولم يرَهما مدقّقُ السلّم
     لأنّه لم يرسم إلّا ‏١٤٤٠، حيث لا شريطَ إبهام. وقِيست الستُّ عند ‏٣٢٠
     بعد الرفع: تسع خاناتِها بلا قصّ، والشريطُ لا يفيض. */
  nav.tabs > a[data-bar] span:not(.count),nav.tabs > .cmdk-open span{
    font-size:var(--t-xs); line-height:var(--lh-tight); width:100%; display:block;
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  nav.tabs > a[data-bar] svg,nav.tabs > .cmdk-open svg{
    width:19px; height:19px; opacity:.75}
  /* والعدُّ شارةٌ فوق الرمز لا رقمٌ بجانب نصٍّ لا يتّسع له */
  nav.tabs .count{position:absolute; top:var(--s-0); inset-inline-end:calc(50% - 18px);
    margin:0; min-width:var(--s-4); font-size:var(--t-xs); line-height:var(--s-4); padding:0 var(--s-1)}
  nav.tabs a{position:relative}
  nav.tabs a[aria-current=page]::before{display:none}
  /* ‏والقسمُ الأبُ (D-178) يُلوَّن في الشريط: المنصّةُ المعلَّمةُ تحته مخفيّةٌ هنا */
  nav.tabs a[aria-current=true]{background:var(--surface-3); color:var(--ink)}
  .cmdk-open.more{border:0; background:none; color:var(--ink-3)}
  .cmdk-open:not(.more){display:none}
  /* **والمحتوى لا يختفي تحت الشريط**: حشوٌ بقدره وقدرِ شريط الجهاز.
     والشريطُ ‏٥٢px (هدفٌ ‏٤٤ وحشوٌ ‏٨)، **فـ«--s-16» تتركه ‏١٢ فوقه** — وكان
     ‏٦٤ + ‏١٦ = ‏٨٠، رقمًا خارج السلّم أمسكه مدقّقُ السلّم عند ‏٣٩٠ (D-167) */
  .content{padding-bottom:calc(var(--s-16) + env(safe-area-inset-bottom, 0px))}

  /*
   * ── قرارٌ واحدٌ في المرّة — **وصفُّ البتّ يلاصق الإبهام** ─────────
   *
   * **وما قِيس ردَّ ما خُطِّط.** قالت «UX-7» إنّ شاشةَ البتّ «تصير بطاقةً
   * كاملةَ الشاشة»، فقِيست البطاقاتُ عند ‏٣٩٠×‏٨٤٤: **‏٣٧٩ إلى ‏١٤١٩px،
   * وأربعٌ من سبعٍ تفوق الشاشة**. فبطاقةٌ «كاملةُ الشاشة» تعني قصَّ
   * محتوًى يُبَتُّ فيه، **وقصفُ التمرير على أبناءٍ أطولَ من الإطار يحبس
   * القارئ** — يلتقط البطاقةَ ولا يبلغ أسفلَها.
   *
   * **والعيبُ الذي كان البندُ يقصده قِيس فوُجد أحدَّ**: في بطاقةٍ
   * ‏١٤١٩px يقع زرُّ «اعتمد» عند ‏٣١٣٩px — **خارجَ الشاشة بأربعة أضعافها**.
   * فالمالكُ يقرأ ثمّ يمرّر تمريرا أعمى يبحث عن الزرّ، ثمّ يعود ليتأكّد.
   *
   * فيلتصق صفُّ البتّ **ما دامت بطاقتُه في الشاشة**، ويمضي معها إذا
   * مضت: **قرارٌ واحدٌ حاضرٌ في المرّة، ولا قصَّ ولا حبس**. و«sticky»
   * تفعلها بلا سطرٍ برمجيّ واحد.
   */
  .draft-foot{position:sticky; z-index:5;
    bottom:calc(var(--s-16) + env(safe-area-inset-bottom, 0px));
    background:var(--surface); border-radius:var(--r);
    padding:var(--s-2); margin-top:var(--s-2); box-shadow:var(--sh-2)}

  /*
   * **والصورةُ فوق النصّ** — وهو ترتيبُ ما سيراه الجمهور.
   *
   * والمكتبُ يعرضهما جنبا إلى جنب فلا ترتيبَ بينهما؛ والجوّالُ يكدّسهما،
   * **فالكدسُ يصير ترتيبا** — ونصٌّ فوق صورته يجعل المالكَ يقرّر على
   * نصفِ ما سيُنشَر.
   */
  .draft > .pv,.draft > .pic{order:-1}
}
/* والشريطُ السفليُّ للجوّال وحدَه: في المكتب تبقى الرافدةُ عمودا */
@media(min-width:721px){.cmdk-open.more{display:none}}
@media(max-width:720px){
  .draft-text{height:calc((var(--lines) + 6) * 26px + 28px)}
  .draft-text[data-ro]{height:auto; max-height:calc((var(--lines) + 6) * 26px + 28px)}
  .scroll{overflow:visible; margin:0}
  /* **والجدولُ المحوريُّ مستثنًى** (D-151): أعمدتُه أرقامٌ تُقارَن، وتكديسُها
     يُسقط رؤوسَها؛ فيبقى جدولًا ويتمرّر في .pv-wrap كما صُمّم. */
  table:not(.pv){min-width:0; display:block}
  table:not(.pv) thead{position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0)}
  table:not(.pv) tbody,table:not(.pv) tr,table:not(.pv) td{display:block; width:100%}
  table:not(.pv) tr{border:1px solid var(--line); border-radius:var(--r); padding:var(--s-3); margin-bottom:var(--s-2);
    background:var(--surface-2)}
  @media(hover:hover){table:not(.pv) tbody tr:hover{background:var(--surface-2)}}
  table:not(.pv) td{border:0; padding:var(--s-1) 0}
  table:not(.pv) td::before{content:attr(data-label); display:block; font-size:var(--t-xs); color:var(--ink-3);
    margin-bottom:var(--s-0)}
  table:not(.pv) td:first-child::before{display:none}
}
/* ── الوثائق العامّة ──────────────────────────────────────────────────
   عمودٌ واحدٌ مقيَّدُ العرض: سطرٌ يمتدّ عبر شاشةٍ عريضة يُقرأ بعينٍ تقفز،
   وهذه صفحةٌ يُراد لها أن تُقرأ لا أن تُتصفَّح. */
.doc{max-width:820px; margin:0 auto; padding:var(--s-10) var(--s-5) var(--s-16); background:var(--bg)}
.doc header{border-bottom:1px solid var(--line); padding-bottom:var(--s-5); margin-bottom:var(--s-2)}
.doc .glyph{width:38px; height:38px; margin-bottom:var(--s-3)}
.doc h1{font-size:var(--t-2xl); letter-spacing:-.5px; margin:0 0 var(--s-2)}
.doc h2{font-size:var(--t-lg); margin:var(--s-8) 0 var(--s-2); letter-spacing:-.2px}
.doc .lede{font-size:var(--t-lg); line-height:var(--lh); color:var(--ink-2);
  /* والصدرُ أضيقُ قياسا لا أوسع: قياسُه أكبر، فالوحدةُ ch أعرض معه —
     و 70ch عنده أعطت 88 محرفا عند القياس. والرقمُ مضبوطٌ على المقياس.
     **وأُعيد بعد الخطّ المتغيّر** (D-099): ‏٥٤ch أعطت ‏٧٧، و‏٥٢ تعطي ‏٧٤. */
  margin:0 0 var(--s-3); max-width:52ch}
.doc p{font-size:var(--t-base); line-height:var(--lh-loose); color:var(--ink-2); margin:0 0 var(--s-3)}
.doc ul{margin:0 0 var(--s-3); padding-inline-start:var(--s-5)}
.doc li{font-size:var(--t-base); line-height:var(--lh-loose); color:var(--ink-2); margin-bottom:var(--s-2)}
.doc b{color:var(--ink)}
.doc a{color:var(--brand); text-underline-offset:3px}
.doc table{font-size:var(--t-sm)}
.doc td b{font-weight:600}
/* «ما لا يقع» أبرزُ ما في الصفحة: هو ما يبحث عنه المراجع أوّلا */
.doc ul.never{list-style:none; padding:0; margin:0}
.doc ul.never li{background:var(--surface-2); border:1px solid var(--line-soft);
  border-radius:var(--r); padding:var(--s-3) var(--s-3); margin-bottom:var(--s-2)}
/* مصطلحٌ لا يُكسَر عند شرطته: «AES-» في سطرٍ و«GCM» في التالي يُقرأ اسمين */
.doc .nb{white-space:nowrap}
.doc footer{margin-top:var(--s-10); padding-top:var(--s-4); border-top:1px solid var(--line); font-size:var(--t-sm)}

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
  a[href^="http"]::after{content:' (' attr(href) ')'; font-size:var(--t-xs); color:#555}
  .doc a[href^="mailto"]::after{content:''}
}

@media(prefers-reduced-motion:reduce){*{transition:none!important; scroll-behavior:auto!important}}

/* ── لوحةُ الأوامر (D-105) ────────────────────────────────────────────
   طبقةٌ تعلو كلَّ شيء وتحجب ما تحتها بلا أن تمحوه: الحجابُ يقول «أنت
   في مكانٍ مؤقّت»، **وشاشةٌ تُبدَّل بالكامل تقول إنّك انتقلت** — ولم
   تنتقل بعد.

   وتُثبَّت في الثلث الأعلى لا في المنتصف: المنتصفُ يجعل القائمةَ تنمو
   في الاتّجاهين فتقفز أوّلُ نتيجةٍ مع كلّ حرف. **والعينُ تلاحق ما
   يقفز ولا تقرؤه.** */
/* **و«hidden» تُهزَم صامتةً** (D-105).

   قاعدةُ المتصفّح «[hidden]{display:none}» من أصلٍ أدنى، **وأيُّ قاعدةِ
   مؤلّفٍ تضع «display» تغلبها**. فحجابُ اللوحة كُتب «display:flex» ورُسم
   «hidden» — **فظهر على كلّ صفحةٍ عند التحميل**، والسمةُ موجودةٌ تُقرأ
   في المصدر فتُصدَّق.

   وهي علّةٌ لا تُمسَك بقراءة الوسم: الوسمُ صحيح. **فتُقفَل هنا مرّةً
   للكلّ** — لا بقاعدةٍ لكلّ صنفٍ يُكتب غدا فيُنسى في واحد. */
/* **وفقرةٌ في بطاقةٍ بلا صنفٍ ترث قاعدةَ المتصفّح** — «margin:1em» = ‏١٤px،
   وليست من السلّم. ولم يُلحَظ ذلك قبلُ لأنّ كلّ فقرةٍ كانت تحمل صنفا؛
   **وأوّلُ فقرةٍ عاريةٍ كُتبت أظهرتها**. فتُقيَّد هنا لا في موضعها. */
.card > p{margin:var(--s-3) 0 0; font-size:var(--t-sm); color:var(--ink-2);
  line-height:var(--lh); max-width:var(--measure)}
.card > h2 + p{margin-top:var(--s-2)}

/* ── ما لم يُبنَ: سطرٌ يُطوى (D-111) ──────────────────────────────────
   ثلاثُ بطاقاتٍ ‏١٥٩px لتقول «غيرُ مدعومة» تُعطي الغائبَ وزنَ الحاضر.
   والسطرُ يقول العددَ والأسماءَ — وذاك كلُّ ما يُحتاج قبل الفتح. */
.unbuilt{border:1px dashed var(--line-strong); border-radius:var(--r-lg);
  background:var(--surface-2)}
.unbuilt>summary{display:flex; align-items:center; gap:var(--s-3); cursor:pointer;
  padding:var(--s-3) var(--s-4); list-style:none; min-height:var(--tap)}
.unbuilt>summary::-webkit-details-marker{display:none}
.unbuilt>summary b{font-size:var(--t-sm); font-weight:600}
.unbuilt .names{font-size:var(--t-xs); color:var(--ink-3);
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
.unbuilt-body{padding:0 var(--s-4) var(--s-4); border-top:1px solid var(--line)}
.unbuilt-body .hint{margin:var(--s-3) 0}

/* ── صندوقُ التنبيهات (D-109) ─────────────────────────────────────────
   صفٌّ لكلّ ما خرج: حالُه ومتنُه ورمزُ الردّ. **والحالُ لونٌ ورمزٌ ونصّ**
   (D-043) — ‏٤٠٤ حمراءُ وحدَها لا تُقرأ، ومعها «✕ نشرٌ فشل» تُقرأ. */
.ax{margin:var(--s-3) 0 0; padding:0; list-style:none;
  display:flex; flex-direction:column; gap:var(--s-2)}
.ax-r{display:flex; align-items:center; gap:var(--s-2); flex-wrap:wrap;
  padding:var(--s-2); border:1px solid var(--line-soft); border-radius:var(--r);
  background:var(--surface-2)}
.ax-b{min-width:0; flex:1 1 220px; font-size:var(--t-xs); color:var(--ink-2);
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
.chip.bad{color:var(--bad); background:var(--bad-wash);
  border-color:color-mix(in srgb,var(--bad) 28%,transparent)}

/* ── اليومُ الأوّل (D-108) ─────────────────────────────────────────────
   خطواتٌ مرقّمةٌ لا بطاقات: **الترتيبُ هو المعلومة** — كلُّ خطوةٍ تفتح
   التي بعدها، وشبكةٌ من خمسٍ تقول «افعل أيَّها شئت» وهو ليس صحيحا.


/* ── الموعدُ بوجهين (D-106) ───────────────────────────────────────────
   سطرٌ فوق سطر: «UTC» كما كتبه الخادم، وتحته قراءةُ المالك. **ولا
   يُصدَّق أحدُهما على حساب الآخر** — فمن أخفى الثانيَ جعل المالكَ يحوّل
   ذهنيّا، ومن أخفى الأوّلَ محا الصيغةَ التي في القاعدة والتقارير.

   والمحلّيُّ أخفتُ وأصغر: **هو الأليفُ الذي يُقرأ بلمحة**، والـUTC هو
   الذي يُنسَخ ويُقارَن. */
.when-t{display:inline-flex; flex-direction:column; gap:1px; vertical-align:middle}
.when-t .tz{font-size:var(--t-xs); color:var(--ink-3); font-weight:500}
.when-local{font-size:var(--t-xs); color:var(--ink-3); font-family:inherit;
  direction:rtl; white-space:nowrap}
/* وقبل أن يعمل النصُّ يبقى سطرا واحدا — ولا يقفز الصفُّ حين يصير سطرين */
.when-t.two{line-height:var(--lh-tight)}

/* سطرُ الذروة — خبرٌ لا أمر، فبلا زرٍّ ولا لونِ حالة (D-043) */
.hint.peak{margin-top:var(--s-2); display:flex; align-items:center;
  gap:var(--s-2); flex-wrap:wrap}
.hint.peak .chip{margin:0}

/* سطرُ الجاهزيّة تحت زرَّي الصورة والمقطع (D-163) — نقاطٌ بلونها ورمزها
   وكلمتها، ثمّ سببُ أوّلِ ساقطةٍ ورابطُه. **ويأخذ سطرَه كاملًا** في صفّ
   «بلا صورة» المرن، فلا يزاحم الزرَّ في سطره. وبلا لونِ الهويّة: الحالُ
   تُقال بألوان الحال وحدها */
.hint.ready{margin:var(--s-2) 0 0; display:flex; align-items:center;
  gap:var(--s-1) var(--s-2); flex-wrap:wrap; flex-basis:100%}
/* ورابطُ الإصلاح بلون الهويّة كروابط الوثيقة — لا أزرقُ المتصفّح: الورقةُ
   لا تلوّن «a» عامّةً، فرابطٌ بلا قاعدةٍ يخرج بلونٍ لا يعرفه الثيمان */
.hint.ready a{color:var(--brand); font-size:var(--t-xs); font-weight:600; text-underline-offset:3px}

[hidden]{display:none!important}

.cmdk-veil{position:fixed; inset:0; z-index:100; padding:12vh var(--s-4) var(--s-4);
  display:flex; justify-content:center; align-items:flex-start;
  background:var(--scrim)}
@supports (backdrop-filter:blur(2px)){
  .cmdk-veil{backdrop-filter:blur(3px)}
}
.cmdk{width:min(640px,100%); max-height:76vh; display:flex; flex-direction:column;
  background:var(--surface); border:1px solid var(--line-strong);
  border-radius:var(--r-lg); box-shadow:var(--sh-3); overflow:hidden}
.cmdk-in{display:flex; align-items:center; gap:var(--s-3);
  padding:var(--s-3) var(--s-4); border-bottom:1px solid var(--line)}
.cmdk-in input{flex:1; min-width:0; min-height:var(--tap); border:0; background:none; outline:none;
  font:inherit; font-size:var(--t-md); color:var(--ink)}
.cmdk-in input::placeholder{color:var(--ink-3)}
/* الحقلُ بلا حدٍّ فلا يتبدّل لونُه عند التركيز؛ خيطُ نحاسٍ تحته يقول «هنا» (D-149) */
.cmdk-in:focus-within{box-shadow:inset 0 -2px 0 var(--au)}
.cmdk-l{flex:1; margin:0; padding:var(--s-2); list-style:none; overflow-y:auto}
.cmdk-g{padding:var(--s-3) var(--s-3) var(--s-1); font-size:var(--t-xs);
  font-weight:600; color:var(--ink-3)}
/* الخيارُ رابطٌ يبقى رابطا: يُفتَح بالوسط ويُنسَخ عنوانُه كأيّ رابط */
.cmdk-o{display:flex; align-items:center; gap:var(--s-3); text-decoration:none;
  padding:var(--s-2) var(--s-3); border-radius:var(--r); color:var(--ink);
  min-height:44px; transition:background var(--dur-1) var(--ease)}
/* **والمختارُ يُعلَّم بأكثرَ من لون** (D-043): أرضيّةٌ وشريطٌ جانبيّ،
   فمن لا يميّز اللونَ يرى الشريط. */
.cmdk-o[aria-selected="true"]{background:var(--surface-2);
  box-shadow:inset -3px 0 0 var(--brand)}
@media(hover:hover){.cmdk-o:hover{background:var(--surface-2)}}
.cmdk-i{flex:none; display:grid; place-items:center; width:20px; color:var(--ink-3)}
.cmdk-i svg{width:17px; height:17px; display:block}
.cmdk-o[aria-selected="true"] .cmdk-i{color:var(--brand)}
.cmdk-t{min-width:0; display:flex; flex-direction:column; gap:1px}
.cmdk-t b{font-size:var(--t-sm); font-weight:600; line-height:var(--lh-tight);
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
.cmdk-t em{font-style:normal; font-size:var(--t-xs); color:var(--ink-3);
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
.cmdk-none{margin:0; padding:var(--s-6) var(--s-4); text-align:center;
  font-size:var(--t-sm); color:var(--ink-3)}
.cmdk-foot{display:flex; align-items:center; gap:var(--s-3); flex-wrap:wrap;
  padding:var(--s-2) var(--s-4); border-top:1px solid var(--line);
  background:var(--surface-2); font-size:var(--t-xs); color:var(--ink-3)}
.cmdk-foot b{margin-inline-start:auto; font-weight:500; color:var(--ink-3)}
.kbd{display:inline-block; padding:1px 6px; border-radius:var(--r-sm);
  border:1px solid var(--line-strong); background:var(--surface);
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
  font-size:var(--t-xs); color:var(--ink-3); direction:ltr}
/* والزرُّ يقول اختصارَه: اختصارٌ لا يُعلَن لا يعرفه إلّا من كتبه */
/* وارتفاعُه ارتفاعُ جاره: قِيس زرُّ الخروج ‏٤٤ وهذا ‏٣٤، **وزرّان
   متجاوران بارتفاعين يُقرآن رتبتين** — ولا رتبةَ بينهما. و‏٤٤ هدفُ
   اللمس الأدنى (D-102) لا اختيارَ ذوق. */
.cmdk-open{display:inline-flex; align-items:center; gap:var(--s-2); min-height:var(--tap);
  border:1px solid var(--line); background:var(--surface-2); cursor:pointer; color:var(--ink-3);
  font:inherit; font-size:var(--t-xs);
  transition:border-color var(--dur-1) var(--ease), color var(--dur-1) var(--ease);
  border-radius:var(--r-pill); padding:0 var(--s-4)}
@media(hover:hover){
  .cmdk-open:hover{border-color:var(--line-strong); color:var(--ink-2)}
}
/* والابنُ المباشرُ وحدَه: «⌘» في مفتاح الاختصار داخلَ الزرّ له قياسُ حرفه (D-167) */
.cmdk-open>svg{width:15px; height:15px; display:block}
@media (max-width:640px){
  .cmdk-veil{padding:var(--s-4) var(--s-3)}
  .cmdk-open span{display:none}
}

/* ══ سجلُّ الطبعات (D-139 … D-147)، وما بقي منها بعد التصفية (D-148) ═════
   كانت الطبعاتُ تُكتب كتلًا آخرَ الورقة تغلب ما قبلها بالترتيب: الثانيةُ
   (D-139: رتبةٌ كبرى ‏٥٦، وأرضٌ ليليّةٌ أعمق)، وليلٌ يُرى ذهبًا (D-142)،
   والثالثةُ (D-143: وجهُ عرضٍ كوفيّ، وشريطُ مؤشّراتٍ سطحًا واحدًا، وأفعالٌ
   هادئة)، والرابعةُ (D-144: الحبرُ والنحاس، والرافدةُ من الثيم)، وهندسةُ نظرة
   عامّة ٢ (D-145). فصار ‏٤٩ محدّدًا يُعلَن مرّتين إلى خمس. وفي D-148 دُمجت
   القواعدُ في مواضعها الأولى **بعد أن قِيس أنّ الأنماطَ المحسوبةَ لكلّ عنصرٍ في
   ‏٢٠ صفحةً × ‏٤ أنماط لم تتغيّر**، وحُذف ما كان ميتًا تحتها (أوهاجُ
   المؤشّرات، وحوافُّ الليل الذهبيّة، وظلالُ البطاقات). وما بقي هنا قواعدُ لا
   موضعَ لها إلّا آخرَ الورقة: استعلاماتُ الوسائط والتحويم، وقواعدُ الشاشة
   المستقلّة و«ما خرج» (D-140)، ومجموعةُ وجه العرض (D-143 ثمّ D-144). والقراراتُ
   بأسبابها في DECISIONS.md. */

/* ── الرتبةُ الكبرى على العريض (D-139) ─────────────────────────────── */
@media(min-width:1181px){.page-head h1{font-size:var(--t-4xl)}}
@media(min-width:901px){.grid>.tile:first-child .v{font-size:var(--t-4xl)}}
@media(hover:hover){.ch:hover,.draft:hover{box-shadow:var(--sh-3), inset 0 1px 0 var(--hair);
  border-color:var(--line-strong)}}
@media(hover:hover){.p:hover{background:var(--brand-soft)}}
/* الحبّةُ على .st و.chip في موضعهما (D-151)؛ و.count بلا قاعدةٍ أساسيّةٍ غيرِها */
.count{border-radius:var(--r-pill)}

/* ── الشاشةُ المستقلّة تحمل العلامة (D-140) ─────────────────────────────
   شريطُ العودة يبدأ بالعلامة واسمِها بابًا إلى اللوحة، ثمّ سهمُ العودة.
   وخيطٌ تحته يفصله عن الرأس كما يفصل الشريطُ العلويُّ اللوحةَ. */
nav.back .home{display:inline-flex; align-items:center; gap:var(--s-2); color:var(--ink);
  font-size:var(--t-base); font-weight:700; text-decoration:none; padding-inline-end:var(--s-3);
  border-inline-end:1px solid var(--line)}
nav.back .home b{font-weight:700}
/* **والعلامةُ لا تنكمش**: قِيس رسمُها ‏٣px عرضًا لأنّ الرابطَ عنصرٌ مرنٌ يقبل
   الانكماش حتّى ‏٤٤ ونسبةُ الرسم من صندوقٍ انكمش. فالثباتُ بالبكسل لا بالنسبة. */
nav.back .home,nav.back .home .glyph{flex:none}
.glyph.sm{width:30px; height:30px; border-radius:var(--r-sm)}
.glyph.sm svg{width:17px; height:17px}
/* وعلى ‏٣٢٠px تبقى العلامةُ ويسقط اسمُها: قِيس الشريطُ يفيض ‏١٠px بالاسم
   والسهم ومبدّل الثيم معًا، والعلامةُ وحدَها تقول ما يقوله الاسم. */
@media(max-width:400px){nav.back .home b{display:none} nav.back .home{padding-inline-end:var(--s-2)}}

/* ── «ما خرج»: صفوفٌ لا بطاقاتٌ في بطاقة (D-140) ──────────────────────── */
.slices{display:flex; flex-direction:column}
.slice{display:flex; align-items:center; gap:var(--s-4); flex-wrap:wrap;
  padding:var(--s-3) 0; border-bottom:1px solid var(--line-soft)}
.slice:last-child{border-bottom:0}
.slice-id{display:flex; align-items:center; gap:var(--s-3); flex-wrap:wrap; min-width:0}
.slice h3{font-size:var(--t-base); font-weight:700}
.slice .stats{margin:0; margin-inline-start:auto; padding:0; border-top:0}
.slice .chip{margin:0}

/* ── وجهُ العرض للعناوين (D-143)، واللصائقُ الصغيرة بحرف المتن (D-144) ────
   الكوفيُّ يقول «مؤسّسة» في العنوان ويُتعب في اللصيقة؛ فالمجموعةُ تُعطى
   الوجهَ ثمّ يُستثنى الصغيرُ منها بالترتيب. */
.page-head h1,.card h2,.sec,.brand b,nav.tabs .lbl,.auth h1,.tile .k,th,
.cmdk-t b,.slice h3,.stat b,.topbar h1{font-family:var(--font-display)}
nav.tabs .lbl,.tile .k,th,.sec,.stat b,.cmdk-t b,.topbar h1,.slice h3{font-family:inherit}

/* ── شريطُ المؤشّرات: سطحٌ واحدٌ وخيوط (D-143) ─────────────────────────── */
.grid.tiles{gap:1px; background:var(--line); border:1px solid var(--line);
  border-top:2px solid var(--au); border-radius:var(--r-lg); overflow:hidden; box-shadow:none}
.grid.tiles>.tile{border:0; border-radius:0; box-shadow:none; background:var(--surface);
  background-image:none; padding:var(--s-5d) var(--s-5d)}
.grid.tiles>.tile::before{display:none}
@media(hover:hover){.todo>li>a.btn:hover,.todo>li>form .btn:hover{background:var(--brand-wash);
  border-color:transparent}}

/* ══════════════════════════════════════════════════════════════════
   طبقةُ اللمس — **وموضعُها آخرُ الورقة قصدا** (D-086).

   CSS يرجّح المتأخّرَ عند تساوي المحدّدات. وكتلةٌ في الوسط تغلبها كلُّ
   قاعدةٍ بعدها — جُرّبت فبقيت الحقولُ على ‏١٢٫٥px رغم أنّ الوسيطَ يطابق.
   فطبقةُ الجهاز تُكتب آخرا، كما تُكتب طبقةُ الطباعة.

   **ثمّ كُتبت بعدها لوحةُ الأوامر (D-105) وسجلُّ الطبعات** فصارت في الوسط،
   وغلبها «.cmdk-in input» بتساوي المحدّد: حقلُ اللوحة ‏١٤px على اللمس،
   **فيُقرّبه iOS عند كلّ فتحةٍ للّوحة** — والقياسُ عند ‏٣٩٠ قاله (D-167).
   فعادت آخرَ الورقة، واختبارٌ في views.test يُسقط CI إن كُتبت قاعدةٌ
   بعدها: **ما يُضاف يُكتب فوق هذا السطر.**
   ══════════════════════════════════════════════════════════════════ */
/* ── صفحةُ المنصّة صفحةَ حساب (D-172) ───────────────────────────────────
   الغلافُ مسطّحٌ من أرض الثيم وخيطٌ تحته، والشعارُ الأحاديّ في جهة النهاية
   زخرفٌ مخفيّ. وصورةُ الحساب حرفٌ أوّل تتداخل مع الغلاف بـ translate لا
   بهامشٍ سالب. ونسبةُ الغلاف تختلف كما تختلف عند المنصّات، ولا غلافَ في
   Instagram وTikTok. */
.acct{background-color:var(--surface); border:1px solid var(--line); border-radius:var(--r-lg);
  overflow:hidden; margin-bottom:var(--s-5); box-shadow:var(--sh-1)}
.acct-cover{position:relative; block-size:120px; background-color:var(--surface-2);
  background-image:var(--bloom); border-block-end:1px solid var(--line)}
.acct-x .acct-cover{block-size:144px}
.acct-youtube .acct-cover{block-size:96px}
.acct-instagram .acct-cover,.acct-tiktok .acct-cover{display:none}
.acct-mark{position:absolute; inset-inline-end:var(--s-6); inset-block-end:var(--s-5); color:var(--ink-3); opacity:.5}
.acct-mark svg{inline-size:40px; block-size:40px; display:block}
.acct-body{position:relative; display:flex; align-items:flex-end; gap:var(--s-5); flex-wrap:wrap;
  padding:var(--s-12) var(--s-6) var(--s-5)}
.acct-av{flex:none; display:grid; place-items:center; inline-size:96px; block-size:96px; border-radius:50%;
  background-color:var(--surface-3); color:var(--ink-2); border:4px solid var(--surface);
  font-family:var(--font-display); font-size:var(--t-3xl); font-weight:700; line-height:var(--lh-tight);
  position:absolute; inset-block-start:calc(var(--s-12) * -1); inset-inline-start:var(--s-6)}
.acct-av[data-kind="org"]{border-radius:var(--r-lg)}
/* وبلا غلافٍ يعود إلى السطر: لا شيءَ يتداخل معه */
.acct-instagram .acct-av,.acct-tiktok .acct-av{position:static}
.acct-instagram .acct-body,.acct-tiktok .acct-body{padding-block-start:var(--s-5)}
.acct-id{flex:1 1 320px; min-inline-size:0}
.acct-id h1{margin:var(--s-1) 0 0; font-family:var(--font-display); font-size:var(--t-2xl); line-height:var(--lh-tight)}
.acct-sub{margin:var(--s-1) 0 0; color:var(--ink-3); font-size:var(--t-sm)}
.acct-counts{display:flex; flex-wrap:wrap; gap:var(--s-2) var(--s-5); margin:var(--s-3) 0 0; padding:0;
  list-style:none; color:var(--ink-2); font-size:var(--t-sm)}
.acct-counts b{color:var(--ink); font-weight:600; font-variant-numeric:tabular-nums}
.acct-counts .bad b{color:var(--bad)}
.acct-act{display:flex; flex-direction:column; align-items:flex-end; gap:var(--s-3)}
.acct-verdict{display:inline-flex; align-items:center; gap:var(--s-2)}
.acct-card{margin-bottom:var(--s-3)}

/* ما تطلبه المنصّة: سبعُ خاناتٍ متساوية، القاعدةُ سطرٌ وحالُ المنصّة تحته.
   والساقطةُ تُرى بحدٍّ لا بلونٍ وحدَه، والخانةُ رابطٌ بهدف لمسٍ كامل. */
.needs{margin-bottom:var(--s-5)}
.needs-h{display:flex; align-items:baseline; gap:var(--s-3); margin:0 0 var(--s-3); font-size:var(--t-md)}
.needs-list{display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); gap:var(--s-2); margin:0; padding:0; list-style:none}
.needs-list a{display:flex; flex-direction:column; gap:var(--s-1); block-size:100%; min-block-size:var(--tap);
  padding:var(--s-3); border:1px solid var(--line); border-radius:var(--r); background-color:var(--surface);
  color:var(--ink); text-decoration:none}
@media(hover:hover){.needs-list a:hover{border-color:var(--line-strong)}}
.needs-top{display:flex; align-items:center; gap:var(--s-2); font-size:var(--t-sm)}
.needs-top .n{font-size:var(--t-xs); color:var(--ink-3); font-variant-numeric:tabular-nums}
.needs-g{margin-inline-start:auto; display:inline-flex}
.needs-g svg{inline-size:10px; block-size:10px}
.needs-rule{font-size:var(--t-xs); color:var(--ink-3); line-height:var(--lh-tight)}
.needs-now{font-size:var(--t-xs); color:var(--ink-2); font-weight:600; line-height:var(--lh-tight)}
.needs-list .ok .needs-g{color:var(--ok)}
.needs-list .warn .needs-g{color:var(--warn)}
.needs-list .idle .needs-g{color:var(--ink-3)}
.needs-list .bad a{border-color:var(--bad); background-color:var(--bad-wash)}
.needs-list .bad .needs-g,.needs-list .bad .needs-now{color:var(--bad)}
@media(max-width:1180px){.needs-list{grid-template-columns:repeat(4,minmax(0,1fr))}}
@media(max-width:720px){
  /* وعلى الجوّال خانتان في الصفّ، والقاعدةُ تُطوى وتبقى الحال: المنشورُ الأوّلُ
     قبل الشاشة الثانية لا بعدها */
  .needs-list{grid-template-columns:repeat(2,minmax(0,1fr))}
  .needs-rule{display:none}
  .needs-list a{padding:var(--s-2) var(--s-3)}
  .acct-cover,.acct-x .acct-cover,.acct-youtube .acct-cover{block-size:72px}
  .acct-counts{gap:var(--s-1) var(--s-3)}
  .acct-body{padding:var(--s-10) var(--s-4) var(--s-4)}
  .acct-av{inline-size:72px; block-size:72px; font-size:var(--t-2xl); inset-block-start:calc(var(--s-10) * -1);
    inset-inline-start:var(--s-4)}
  .acct-act{align-items:stretch; inline-size:100%}
  .acct-act .btn{justify-content:center}
}

/* ── المنشورُ كما سيظهر ───────────────────────────────────────────────
   بنيةُ المنصّة وجلدُ صدى: خطُّ اللوحة وحبرُها، بلا لون المنصّة ولا
   أيقوناتها. والإطارُ صورةُ المنشور وحدَه؛ الحالُ والأزرارُ خارجه. */
.np-list{display:flex; flex-direction:column}
.np-row{display:grid; grid-template-columns:8.5rem minmax(0,var(--np-w-li)) minmax(0,1fr); gap:var(--s-5);
  align-items:start; padding-block:var(--s-5); border-block-end:1px solid var(--line-soft);
  scroll-margin-block-start:var(--s-16)}
.np-row:target{outline:2px solid var(--ring); outline-offset:var(--s-2); border-radius:var(--r)}
.np-when{display:flex; flex-direction:column; gap:var(--s-1); align-items:flex-start}
.np-dayl{font-size:var(--t-sm); color:var(--ink-2); font-weight:600}
.np-clock{font-family:var(--font-display); font-size:var(--t-xl); line-height:var(--lh-tight);
  font-variant-numeric:tabular-nums}
.np-utc{font-size:var(--t-xs); color:var(--ink-3); font-variant-numeric:tabular-nums}
.np-under{display:flex; flex-direction:column; align-items:flex-start; gap:var(--s-2); font-size:var(--t-sm)}
.np-acc{color:var(--ink-2); font-weight:600}
.np-result{color:var(--ink-2)}
.np-result b{color:var(--ink); font-variant-numeric:tabular-nums}
.np-why{display:flex; gap:var(--s-2); margin:0; color:var(--bad); line-height:var(--lh)}
.np-why .i svg{inline-size:10px; block-size:10px}
.np-day{position:sticky; inset-block-start:0; z-index:1; margin:var(--s-5) 0 0; padding-block:var(--s-2);
  background-color:var(--bg); color:var(--ink-2); font-size:var(--t-sm); font-weight:700;
  border-block-end:1px solid var(--line)}
.np-note{margin:var(--s-6) 0 0; color:var(--ink-3); font-size:var(--t-xs)}
.acct-more{margin-block:var(--s-4)}

.np{container-type:inline-size; inline-size:100%; margin:0; background-color:var(--surface); color:var(--ink);
  border:1px solid var(--line); border-radius:var(--r-sm); overflow:hidden; font-size:var(--t-base);
  line-height:var(--lh); box-shadow:var(--sh-1)}
.np-li{max-inline-size:var(--np-w-li)}
.np-ig{max-inline-size:var(--np-w-li)}
.np-tt,.np-yt{max-inline-size:var(--np-w-clip); border:0; border-radius:var(--r-lg);
  background-color:var(--np-stage); color:var(--np-on-stage)}
.np-head{display:flex; align-items:center; gap:var(--s-3); padding:var(--s-3) var(--s-4) 0}
.np-who{display:flex; flex-direction:column; min-inline-size:0}
.np-name{font-weight:700}
.np-meta{display:inline-flex; align-items:center; gap:var(--s-1); color:var(--ink-3); font-size:var(--t-xs)}
.np-meta svg{inline-size:12px; block-size:12px}
.np-end{margin-inline-start:auto; display:inline-flex; align-items:center; gap:var(--s-3); color:var(--ink-3)}
.np-end svg{inline-size:18px; block-size:18px}
.np-av{flex:none; display:grid; place-items:center; inline-size:48px; block-size:48px; border-radius:50%;
  background-color:var(--surface-3); color:var(--ink-2); font-weight:700; font-size:var(--t-lg); line-height:var(--lh-tight)}
.np-av[data-kind="org"]{border-radius:var(--r-xs)}
.np-text{margin:0; padding:var(--s-3) var(--s-4); white-space:pre-wrap; overflow-wrap:anywhere;
  unicode-bidi:plaintext; max-inline-size:var(--measure)}
.np-tag{color:var(--brand); font-weight:600}
.np-media{background-color:var(--surface-2); border-block:1px solid var(--line-soft)}
.np-media>img,.np-media>video{display:block; inline-size:100%; block-size:auto; max-block-size:calc(100cqi * 1.25);
  object-fit:contain; margin-inline:auto}
/* الاختصارُ بهامشٍ لا بحشوة: الحشوةُ داخل الصندوق المقصوص فيطلّ منها نصفُ سطرٍ رابع */
.np-compact .np-text{display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:3; overflow:hidden;
  padding:0; margin:var(--s-3) var(--s-4)}
.np-x.np-compact .np-text{margin-inline:0}
.np-compact .np-media>img,.np-compact .np-media>video{max-block-size:300px}
.np-counts{display:flex; gap:var(--s-2); padding:var(--s-2) var(--s-4); color:var(--ink-3); font-size:var(--t-xs)}
.np-counts b{font-weight:600; font-variant-numeric:tabular-nums}
.np-bar{display:flex; align-items:center; gap:var(--s-4); padding:var(--s-2) var(--s-4) var(--s-3);
  color:var(--ink-3); font-size:var(--t-xs); line-height:var(--lh-tight)}
.np-bar span{display:inline-flex; align-items:center; gap:var(--s-1)}
.np-bar svg{inline-size:18px; block-size:18px}
.np-bar b{font-weight:400; font-variant-numeric:tabular-nums}
.np-bar-li{display:grid; grid-template-columns:repeat(4,1fr); border-block-start:1px solid var(--line-soft);
  padding-block-start:var(--s-2); margin-inline:var(--s-2)}
.np-bar-li span{justify-content:center; font-weight:600}
.np-x{max-inline-size:var(--np-w-x); display:grid; grid-template-columns:40px minmax(0,1fr); gap:var(--s-3);
  padding:var(--s-3) var(--s-4)}
.np-x .np-av{inline-size:40px; block-size:40px}
.np-x .np-head,.np-x .np-text,.np-x .np-bar{padding-inline:0}
.np-x .np-head{padding-block-start:0}
.np-x .np-text{padding-block:var(--s-1) var(--s-2)}
.np-x .np-media{border:1px solid var(--line); border-radius:var(--r-lg); overflow:hidden}
.np-x .np-bar{justify-content:space-between; max-inline-size:425px; padding-block-end:0}
.np-x .np-bar .np-end{margin-inline-start:0}
.np-ig .np-av{inline-size:32px; block-size:32px; font-size:var(--t-sm)}
.np-ig .np-head{padding-block-end:var(--s-3)}
.np-ig .np-bar{color:var(--ink)}
.np-ig .np-bar svg{inline-size:22px; block-size:22px}
.np-slot{display:grid; place-items:center; aspect-ratio:4/5; background-color:var(--surface-2); color:var(--ink-3);
  border-block:1px solid var(--line-soft); font-size:var(--t-sm)}
.np-likes{margin:0; padding:0 var(--s-4); font-size:var(--t-sm)}
.np-stage{position:relative; aspect-ratio:9/16; overflow:hidden}
.np-stage>img,.np-stage>video{position:absolute; inset:0; inline-size:100%; block-size:100%; object-fit:cover}
.np-noclip{position:absolute; inset-block-start:var(--s-3); inset-inline-start:var(--s-3); z-index:1;
  padding:var(--s-1) var(--s-2); border-radius:var(--r-pill); background-color:var(--np-scrim);
  color:var(--np-on-stage); font-size:var(--t-xs); font-weight:600}
.np-scrim{position:absolute; inset-inline:0; inset-block-end:0; block-size:45%; background-color:transparent;
  background-image:linear-gradient(to top,var(--np-scrim),transparent)}
.np-rail{position:absolute; inset-inline-end:var(--s-2); inset-block-end:16%; display:flex; flex-direction:column;
  align-items:center; gap:var(--s-4); margin:0; padding:0; list-style:none; font-size:var(--t-xs)}
.np-rail li{display:flex; flex-direction:column; align-items:center; gap:var(--s-0)}
.np-rail svg{inline-size:26px; block-size:26px}
.np-rail .np-av{inline-size:40px; block-size:40px; border:2px solid var(--np-on-stage)}
.np-rail b{font-weight:600}
.np-over{position:absolute; inset-inline-start:var(--s-3); inset-inline-end:64px; inset-block-end:var(--s-4)}
.np-over .np-text,.np-over .np-title{padding:var(--s-1) 0 0; font-size:var(--t-sm); line-height:var(--lh-tight)}
.np-title{margin:0; font-weight:700}
/* والوسمُ على المسرح الداكن بحبر المسرح وثِقَله: لونُ العلامة عليه ‏١٫٢٦:١ */
.np-stage .np-tag{color:var(--np-on-stage); font-weight:700}
.np-desc{padding:var(--s-2) var(--s-3); border-block-start:1px solid var(--line-strong); font-size:var(--t-xs)}
.np-desc summary{cursor:pointer; color:var(--np-on-stage)}

/* الشبكة: المنصّةُ تقصّ هناك، فالقصُّ هنا يُري ما تُريه — والمنشورُ كاملًا في صفّه */
.np-grid{display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:var(--s-0); max-inline-size:935px}
.np-grid-clip{grid-template-columns:repeat(5,minmax(0,1fr))}
.np-tile{position:relative; display:block; aspect-ratio:1; overflow:hidden; background-color:var(--surface-3)}
.np-grid-ig .np-tile{aspect-ratio:3/4}
.np-grid-clip .np-tile{aspect-ratio:9/16}
.np-tile>img,.np-tile>video{inline-size:100%; block-size:100%; object-fit:cover; display:block}
.np-tile.dim>img,.np-tile.dim>video{opacity:.55}
.np-play{position:absolute; inset-block-start:var(--s-2); inset-inline-start:var(--s-2); color:var(--np-on-stage)}
.np-play svg{inline-size:20px; block-size:20px}
.np-badge{position:absolute; inset-block-end:var(--s-2); inset-inline-end:var(--s-2)}
@media(max-width:900px){
  .np-row{grid-template-columns:minmax(0,1fr); gap:var(--s-3)}
  .np-when{flex-direction:row; flex-wrap:wrap; align-items:baseline; gap:var(--s-2)}
  .np-under{flex-direction:row; flex-wrap:wrap; align-items:center}
  .np-grid-clip{grid-template-columns:repeat(2,minmax(0,1fr))}
}

/* ══ الحقولُ على اللمس ═══════════════════════════════════════════
   **Safari يُقرّب الصفحةَ عند لمس حقلٍ خطُّه دون ‏١٦px** — سلوكٌ لا
   يُعطَّل إلّا بمنع التقريب كلِّه، ومنعُه يخالف WCAG 1.4.4. وثمنُه أنّ
   الصفحةَ تقفز وتكبر عند كلّ لمسةِ حقل، ثمّ يُصغّرها المالكُ بإصبعين.

   فيُرفَع الخطُّ إلى «--t-lg» (‏١٦px) على الشاشات اللمسيّة وحدها: القراءةُ
   على مسافةِ ذراعٍ تحتاجه أصلا، والشاشةُ الواسعةُ تبقى على ‏١٤ حيث
   الكثافةُ مطلوبة. **و«--t-base» أربعةَ عشرَ لا ستّةَ عشرَ** — جُرّبت
   فلم يتبدّل شيء، والرمزُ الصحيح «--t-lg».

   و«pointer: coarse» أدقُّ من عرضِ الشاشة: لوحٌ بقلمٍ ليس هاتفا، وحاسوبٌ
   بشاشةٍ لمسيّةٍ ليس شاشةَ فأرة.

   **وموضعُها بعد قاعدةِ الحقول لا قبلها**: تلك تختار بمحدّدات السمات
   فتغلب المحدّدَ العارِيَ مهما كان الوسيط — وقد جُرّب فبقي ‏١٤. */
@media(pointer:coarse){
  input[type=number],input[type=password],input[type=text],input[type=datetime-local],
  input:not([type]),select,textarea,button,.btn{font-size:var(--t-lg)}
  /* والمحدّداتُ الأخصُّ تُذكَر باسمها: قاعدةٌ عامّةٌ لا تغلب
     «.copy input» ولا «.sched select» مهما تأخّرت. وحقلُ لوحة الأوامر
     معها باسمه (D-167): الموضعُ يحرسه اليوم، والاسمُ يحرسه إن تبدّل نوعُه */
  .copy input,.sched input,.sched select,.draft-text,input.mono,textarea.mono,.cmd-text,
  .cmdk-in input{font-size:var(--t-lg)}
  /* **وعرضٌ ثابتٌ يفيض حين يكبر الخطّ**: أُضيف الحدُّ هنا لا في كلّ حقل،
     فحقلٌ يُكتب غدا بعرضٍ ثابتٍ يرثه. وقِيس فيضٌ ١٢px عند ٣٢٠px قبله */
  input,select,textarea{max-width:100%}
  /* **وعنصرُ الشبكةِ المرنةِ لا ينكمش دون محتواه ما لم يُؤذَن له.**
     و«min-width» الافتراضيّةُ في flex هي «auto» = عرضُ المحتوى، فدَرَجٌ
     خيارُه طويلٌ يدفع صفَّه كلَّه خارج البطاقة. وقِيس: حقلٌ ‏٢٩١px في
     حاويةٍ ‏٢٣٨px — وهو مصدرُ الفيض بعد رفعِ الخطّ إلى ١٦ */
  /* **والزرُّ يُستثنى** (D-099): المحدّدُ «.row > *» أخصُّ من «button»،
     فكان يدهس «min-width: var(--tap)» — **ويسقط الزرُّ دون هدف اللمس**.
     وقِيس: «حدّث» ‏٤٣×٤٤ عند ‏٣٢٠px، وحدُّه ‏٤٤.

     وعلّةٌ لم تظهر إلّا بعد تبديل الخطّ (D-099): كان النصُّ يبلغ ‏٤٤
     بعرضه، **فيستر النقصَ بلا أن يسدّه** — ونصٌّ أضيقُ بمحرفٍ يكشفه.
     **والحارسُ لا يُغني عن الاستثناء**: هذا ما كان يُقاس صحيحا صدفةً.

     والإذنُ بالانكماش كان للحقول لا للأزرار: الدَّرَجُ الطويلُ هو الذي
     أفاض الصفَّ (D-086)، وزرٌّ نصُّه كلمةٌ لا يفيض. */
  .row > *:not(button):not(.btn),.field{min-width:0}
}
`

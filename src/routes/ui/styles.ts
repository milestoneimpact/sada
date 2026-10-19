/**
 * أنماطُ اللوحة — هيكلُ تطبيقٍ لا صفحة.
 *
 * كلُّ لونٍ هنا `var(--…)` ولا لونَ حرفيّ واحد. وقاعدةٌ تكتب لونا صريحا
 * تكسر أحد الثيمين صامتةً، فلا تُكتب.
 *
 * ## ثلاثةُ مبادئَ تحكم ما يلي
 *
 * ١ · **الهيكلُ طبقتان وحدٌّ وظلّ**: الرافدةُ والشريطُ العلويّ والمحتوى على
 *     `--bg` بخيطٍ يفصلها، والبطاقاتُ على `--surface` بحدٍّ وظلٍّ خفيف
 *     (`--sh-1`، D-187). ولوحةٌ كلُّ شيءٍ فيها على أرضٍ واحدةٍ بلا حدٍّ يُرى
 *     تبدو صفحةً لا نظاما.
 *
 * ٢ · **المسافاتُ من سلّمِ أربعة**: ٤ · ٨ · ١٢ · ١٦ · ٢٠ · ٢٤ · ٣٢.
 *     ورقمٌ خارج السلّم يُرى ولو لم يُعرَف سببُه.
 *
 * ٣ · **قواعدُ اللون من مرجع التصوير لا من الذوق**: ألوانُ الحالة
 *     محجوزة، ولا تعتمد حالةٌ على اللون وحده (معه رمزٌ ونصّ دائما)،
 *     ودرجةُ الاستحقاق مقياسُ مقدارٍ فتدرّجُ هيئةٍ واحدة لا قوس قزح.
 */
import { TOKENS, atLeast, below, narrower } from './tokens'

export const STYLE = TOKENS + `
*{box-sizing:border-box; scrollbar-width:thin; scrollbar-color:var(--line) transparent}
/* ── الخطُّ زوجٌ واحدٌ ووزنان (D-185) ──────────────────────────────────
   «font-synthesis:none» على الجذر: طلبُ وزنٍ لم يُحمَّل لا يُصطنَع بتغليظ الحروف
   رقميّا — والعربيّةُ المصطنَعةُ الثخانة تلتصق نقاطُها وتُقرأ ملطّخة. والسلّمُ لا
   يطلب إلّا ‏٤٠٠ و‏٦٠٠، و«audit_scale» يُسقط ما سواهما. */
html{font-family:var(--font-ui); font-synthesis:none; scroll-behavior:smooth;
  /* ما يُركَّز أو يُقصَد بمرساةٍ لا يختفي خلف الشريط اللاصق ولا شريط الجوّال (D-149) */
  scroll-padding-top:calc(var(--topbar) + var(--s-3)); scroll-padding-bottom:calc(var(--tap) + var(--s-6))}
body{
  margin:0; background:var(--bg); color:var(--ink); direction:rtl;
  /* المتنُ هو الأصل، وكلُّ دورٍ يكتب حجمَه وسطرَه معًا (D-185): سطرٌ بالبكسل يُورَث
     بقيمته، فعنصرٌ يكتب حجمًا بلا سطرٍ يرث سطرَ أبيه ويخرج نمطًا خارج القائمة */
  font-size:var(--t-body); line-height:var(--lh-body); -webkit-font-smoothing:antialiased;
  font-feature-settings:"kern" 1;
}
/* وما يلبسه المتصفّحُ خطًّا أحاديًّا من عنده («code» و«kbd» و«pre») يرث خطَّ الصفحة:
   لا خطَّ نظامٍ في أيّ موضع (D-185) */
code,kbd,samp,pre{font-family:inherit}
/* وكان على الأرض وهجٌ نحاسيٌّ مثبَّتٌ تحت كلّ شيء («body::before» و«--bloom»)، فسقط
   مع المادّة كلِّها (خطّة التصميم 3.3 · D-187): **الورقُ ورقٌ**، والنحاسُ لا يُسكَب أرضًا.
   وبقي سياقُ التكديس كما كان، فلا تتبدّل طبقةٌ فوق أخرى. */
.app,.doc,.wrap{position:relative; z-index:1}
/* ── حلقةُ التركيز ────────────────────────────────────────────────────
   طبقتان: خطٌّ بحبر التركيز («--focus»، حبرُ الرابط) وحلقةٌ بلون السطح تحته. فعلى
   الأرض يُرى الخطّ، وعلى ما يوافقه — زرٌّ أوّليٌّ مثلا — تُرى الحلقة. **ولا نحاسَ فيها**
   (D-187): كانت نحاسيّةً فتُعدّ موضعًا رابعًا في كلّ شاشةٍ يُضغط فيها «Tab». */
:focus-visible{outline:var(--stroke) solid var(--focus); outline-offset:var(--stroke); border-radius:var(--r-inline);
  box-shadow:0 0 0 var(--s-1) var(--surface)}
/* والعنوانُ الذي يُركَّز عليه بالشيفرة عند فتح لوحٍ (tabindex=-1) يُعلَن لقارئ الشاشة
   ولا يُؤطَّر للعين (D-177): كان إطارٌ ذهبيٌّ يحيط بعنوانٍ ‏56px كلّما فُتح لوحٌ من رابط */
[tabindex="-1"]:focus-visible{outline:none; box-shadow:none}

/* التحديدُ بأرضٍ زرقاءَ والحبرُ فوقها (خطّة التصميم 3.7): كان مزيجَ حبر الهويّة،
   فصار رمزًا يُقاس — «--ink» على «--selection» ‏١٣:١ نهارًا و‏٩:١ ليلًا */
::selection{background:var(--selection); color:var(--ink)}

/* وشريطُ التمرير يتبع الثيم: شريطٌ فضّيٌّ فاتح على لوحةٍ داكنة نشاز */
::-webkit-scrollbar{width:var(--s-3); height:var(--s-3)}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:var(--line); border-radius:var(--r-pill);
  border:var(--ring-w) solid transparent; background-clip:content-box}
@media(hover:hover){::-webkit-scrollbar-thumb:hover{background:var(--ink-3); background-clip:content-box}}
/* رابطُ التخطّي: يُقصّ ولا يُنفى خارج الشاشة.
   وكان عند right:-9999px، **فامتدّ المستند إلى 10389px** وصار الجوّالُ
   يُسحَب جانبا. وهي علّةٌ لا تُرى: العنصرُ نفسه غيرُ مرئيّ، وأثرُه
   شريطُ تمريرٍ أفقيّ يظنّه الناظر عيبا في التخطيط.
   والقصُّ يخفيه من العين ويبقيه لقارئ الشاشة — وذاك كلُّ الغرض. */
.skip{position:absolute; width:1px; height:1px; overflow:hidden;
  clip-path:inset(50%); white-space:nowrap;
  background:var(--brand); color:var(--on-brand);
  padding:var(--s-3) var(--s-4); border-radius:var(--r-control); z-index:99; font-weight:600}
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
/* والمَظهرُ معه واحدٌ: حبرُ الرابط وخطٌّ تحته، وسهمٌ ينقلِب. والسهمُ زينةٌ لا
   خبرٌ — لذلك لا يُقرأ بصوتٍ عالٍ، واللفظُ فوقه يقول ما يقوله السهم.
   **وهو زرٌّ هادئ** (D-183): «--link» ليلًا و«--ink-2» متقاربان ضوءًا (‏١٫٠٨:١)،
   ونهارًا هو حبرُ المتن — فالخطُّ تحته هو العلامة لا اللون */
.g-tog,.ptog{flex:none; font-size:var(--t-ui); line-height:var(--lh-ui); font-weight:600; color:var(--link);
  text-decoration:underline; text-decoration-thickness:var(--ul); text-underline-offset:.3em;
  display:inline-flex; align-items:center; gap:var(--s-2)}
/* **والسهمُ حدودٌ لا حرف** (D-167): كان «▾»، وليس في الخطّ المضمَّن (ولا في Plex،
   D-185)، فيُرسَم بخطّ النظام ويختلف من جهازٍ لآخر (N-7). والمثلّثُ
   من حدَّين شفّافين وثالثٍ بلون النصّ — بلا خطٍّ ولا صورةٍ ولا سياسةِ مصدر. وقياسُه
   بالـem من رتبة اللصيقة: ‏٠٫٦ عرضًا و‏٠٫٤ ارتفاعًا. */
.g-tog::after,.ptog::after{content:''; font-size:var(--t-caption); width:0; height:0;
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
/* **والثخينُ ‏٦٠٠ لا «bold».** الافتراضيُّ يُحَلّ إلى ‏٧٠٠، وهو وزنٌ لا نحمّله
   (D-185): يُصطنَع أو يُقرَّب. **وللأرقام والأسماء داخل الجملة وحدها** (خطّة التصميم
   4.4/5) — لا لكلماتٍ وسط الشرح. */
b,strong{font-weight:600}

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
.tap{position:relative; display:inline-block; min-width:var(--tap); text-align:center; color:var(--link)}
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
.app{display:grid; grid-template-columns:var(--rail-w) 1fr; min-height:100vh; min-height:100dvh}

/* ── الرافدة ───────────────────────────────────────────────── */
.rail{background:var(--bg); border-inline-start:var(--bd); display:flex;
  flex-direction:column; position:sticky; top:0; height:100dvh; overflow-y:auto; color:var(--ink)}
/* وكان على الحافّة الداخليّة خيطُ ذهبٍ (::after)؛ نزعته الطبعةُ الرابعة، فلا
   قاعدةَ له (D-144 · D-148). */
.rail-head{padding:var(--s-6) var(--s-5) var(--s-5); display:flex; align-items:center; gap:var(--s-3)}
/* ── العلامة ──────────────────────────────────────────────────────────
   الأقواسُ نفسها التي في رمز التبويب، مرسومةً لا مكتوبة. وكانت مربّعا
   فيه «صدى» بخمسةَ عشرَ بكسلا: **الحرفان يزدحمان في ستٍّ وثلاثين**،
   فيُقرأ المربّعُ لطخةً — وهي عينُ العلّة التي مُنعت في رمز التبويب. */
/* والعلامةُ وحدها تجمع اللونين: نعناعٌ على عمقٍ ثابتان في الوضعين («MARK»، D-196؛ وكانا حبرًا
   ونحاسًا منذ D-144) — ولا يتكرّر هذا الجمعُ في موضعٍ آخر، فيبقى للعلامة معناها، **وهي أوّلُ
   مواضع الذهب الثلاثة في الشاشة** (D-187). **وأرضُها العميقةُ على أرض الليل ‏١٫٣٦:١ — تذوب**،
   فحلقتُها «--mark-ring» ليلًا ‏٢:١ فأكثر (D-183) */
.glyph{display:grid; place-items:center; flex:none; width:var(--s-10); height:var(--s-10); border-radius:var(--r-card);
  background:var(--mark-bg); color:var(--mark-fg);
  box-shadow:var(--sh-1), 0 0 0 1px var(--mark-ring)}
/* نسبةٌ لا قياسٌ ثابت: العلامةُ نفسها تظهر بـ 38 في الرافدة و 50 في
   شاشة الدخول و 38 في الوثائق — وقياسٌ ثابتٌ يجعلها تسبح في الأكبر. */
.glyph svg{width:56%; height:56%; display:block}
.brand{min-width:0}
/* ‏والاسمُ «صدى» مسارٌ لا حرف (D-185): الكوفيُّ في الاسم وحده، بلا ملفّ خطّ. وارتفاعُه
   ارتفاعُ حروفه حين كانت تُرسَم بحجم ‏١٨ — والعرضُ يتبع نسبةَ المسار */
.wordmark{display:block; height:14px; width:auto; flex:none}
/* ‏والعلامةُ «صدى» وحدها (D-203)، وفي التجريبيّة وحدها شارةٌ عربيّةٌ صغيرةٌ بجانبها لا جزءٌ منها */
.brand span{font-size:var(--t-caption); line-height:var(--lh-caption); font-weight:600;
  display:inline-block; margin-top:var(--s-1);
  padding:0 var(--s-2); border-radius:var(--r-pill); color:var(--ink-2);
  border:var(--bd)}

nav.tabs{padding:var(--s-1) var(--s-3) var(--s-4); display:flex; flex-direction:column; gap:1px}
nav.tabs .lbl{font-size:var(--t-caption); line-height:var(--lh-caption); padding:var(--s-4) var(--s-2) var(--s-1); color:var(--ink-2);
  font-weight:600}
nav.tabs .sep{display:none}
nav.tabs a{display:flex; align-items:center; gap:var(--s-3); padding:var(--s-2) var(--s-3);
  min-height:var(--tap); font-size:var(--t-ui); line-height:var(--lh-ui); font-weight:400; color:var(--ink-2);
  text-decoration:none;
  transition:background var(--dur-1) var(--ease), color var(--dur-1) var(--ease);
  border-radius:var(--r-control)}
nav.tabs a svg{width:var(--icon-sm); height:var(--icon-sm); flex:none; opacity:.7}
nav.tabs .tight{display:none}
@media(hover:hover){nav.tabs a:hover{background:var(--hover); color:var(--ink)}}
/* والحاليُّ يُعلَّم **بحدٍّ ولونٍ ووزن**: أرضيّةٌ خافتةٌ وحدها تختفي في
   وضع التباين العالي، وخطٌّ على الحافّة يبقى. **والرافدةُ ‏٤٠٠ والحاليُّ وحده ‏٦٠٠**
   (D-185): رافدةٌ كلُّها ثخينةٌ تنافس المحتوى على العين. **والخطُّ ذهبيّ: ثاني
   مواضع الذهب الثلاثة** (D-187 · D-196)، وفي شريط الجوّال مخفيٌّ حتّى المرحلة ٢ب.
   **ورمزُ الحاليّ بحبر الرابط** (D-196): نهارًا كان التركوازُ لا يُرى إلّا في الأزرار والروابط،
   فالهويّةُ في الصفحة تُقرأ زرًّا داكنًا على ورق. والرمزُ ليس نصًّا (‏3:1 على المحدَّد) ولا ذهبًا */
nav.tabs a[aria-current=page]{background:var(--selected); color:var(--ink); position:relative; font-weight:600}
nav.tabs a[aria-current=page]::before{content:''; position:absolute; inset-block:var(--s-2);
  inset-inline-start:0; border-radius:var(--r-pill); width:var(--stroke); background:var(--au)}
nav.tabs a[aria-current=page] svg{opacity:1; color:var(--link)}
nav.tabs .count{margin-inline-start:auto}
nav.tabs a[aria-current=page] .count{background:var(--ink); color:var(--surface)}
/* سلّمُ الجاهزيّة (D-158): بطاقةٌ تُطوى حين تتمّ درجاتُها كلُّها */
details.ladder>summary{cursor:pointer; list-style:none; margin-bottom:0}
details.ladder>summary::-webkit-details-marker{display:none}
details.ladder[open]>summary{margin-bottom:var(--s-3)}
details.ladder ol.steps.wiz li .btn{flex:none}
details.ladder ol.steps.wiz li.at .why{color:var(--ink-2)}
details.ladder .verdict{margin:0 0 var(--s-2); font-weight:600; color:var(--ink)}
details.ladder .verdict.bad{color:var(--bad)}


/* ── الشريط العلويّ ────────────────────────────────────────── */
.main{min-width:0; display:flex; flex-direction:column}
/* **اسمٌ لا يتصادم**: كان هذا الشريط يسمّى .bar وهو اسمُ مقياس المقدار
   (ارتفاعُه أربعةُ بكسل) — فكان المقياسُ يدهسه فينسحق الشريطُ إلى خيط.
   علّةٌ لا يكشفها اختبارٌ ولا مدقّق: الصفحةُ تعمل، والترويسةُ غائبة. */
.topbar{position:sticky; top:0; z-index:20; background:var(--bg);
  border-bottom:var(--bd); padding:0 var(--gutter); flex:none; display:flex;
  align-items:center; gap:var(--s-3); transition:box-shadow var(--dur-2) var(--ease);
  min-height:var(--topbar)}
/* ظلٌّ يظهر حين يكون فوقك محتوًى — إشارةٌ تُقرأ بلا وعي: الشريطُ يطفو
   فوق شيء، لا يجلس على أرضٍ فارغة. ويُضاف بـ JS لأنّ CSS وحدها لا تعرف
   موضعَ التمرير. */
.topbar.lifted{box-shadow:var(--sh-2)}
/* ── الزجاجُ على ما يلصق (D-102) ──────────────────────────────────
   شريطٌ لاصقٌ بلونٍ مصمتٍ يُقرأ **لوحا ثانيا فوق الصفحة**. وطبقةٌ يشفّ
   منها ما تحتها تقول «هذا فوق ذاك» بلا حدٍّ ولا ظلٍّ ثخين.

   **وخلف «@supports»**: متصفّحٌ لا يعرفها يرى «--bg» مصمتا كما
   يراه اليوم — ولا شيءَ ينكسر. والشفافيّةُ تُضاف هناك وحدَها، فلا يبقى
   لونٌ نصفُ شفّافٍ بلا ضبابٍ يسنده. */
@supports (backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)){
  /* **وعلى الشريط وحدَه — لا على الرافدة** (D-102).
     جُرّبت على الاثنين فسقط ‏٧٤ نصّا دون حدّ التباين: كانت الرافدةُ يومئذٍ ثيمًا
     ثالثًا داكنًا في النهاريّ، فشفّها أظهر الأرضَ الفاتحةَ تحت حبرٍ فاتح (‏٢٫١٤:١).
     وهي اليوم من الثيم (D-144) وعلى «--bg» (D-187)، والرافدةُ لا يمرّ تحتها شيءٌ
     فلا زجاجَ لها. والشريطُ يمرّ تحته المحتوى، وأرضُه من ثيم الصفحة نفسِه. */
  .topbar{
    background:color-mix(in srgb,var(--bg) 82%,transparent);
    -webkit-backdrop-filter:blur(14px) saturate(1.4);
    backdrop-filter:blur(14px) saturate(1.4)}
}
/* العلامةُ في الشريط للجوّال وحدَه (D-123): رأسُ الرافدة يختفي هناك */
.topbar .glyph.tb{display:none; width:var(--s-8); height:var(--s-8); border-radius:var(--r-control)}
.topbar h1{font-size:var(--t-ui); line-height:var(--lh-ui); font-weight:600; color:var(--ink-2)}
.topbar .crumb{font-size:var(--t-small); line-height:var(--lh-small); color:var(--ink-2)}
/* ‏والعنوانُ والنطاقُ يُقصّان لا يدفعان «خروج» خارج الشاشة (D-177): بعد رفع الحرف فاض
   الشريطُ ‏6px عند ‏320 — والزرُّ الذي خرج هو الذي يُطلَب حين يُطلَب */
.topbar h1,.topbar .crumb{overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
/* عنوانُ الشريط يظهر **حين يغيب عنوانُ الصفحة** لا قبله.
   وعنوانان متطابقان فوق بعضهما تكرارٌ يُقرأ عيبا؛ وشريطٌ لاصقٌ بلا
   عنوانٍ بعد التمرير يترك القارئَ بلا موضع. فالظهورُ مربوطٌ بالإشارة
   نفسها التي يظهر بها الظلّ: أنّ فوقك محتوًى. */
.topbar .ttl{min-width:0; opacity:0; transform:translateY(var(--s-1)); transition:opacity var(--dur-2) var(--ease-out), transform var(--dur-2) var(--ease-out)}
.topbar.lifted .ttl{opacity:1; transform:none}
.content{padding:var(--s-5d) var(--gutter) var(--s-12d); max-width:var(--shell); width:100%}

/* ══ رأسُ الصفحة ══════════════════════════════════════════════════════
   كان أعلى ما في الشاشة عنوانا بستّةَ عشرَ بكسلا وتحته أرقامٌ باثنين
   وثلاثين — **فالرقمُ هو الذي يُقرأ عنوانا**، وتصير الشاشةُ لوحةَ
   عدّاداتٍ لا شاشةَ عمل.

   فصار للصفحة رأسٌ: لصيقةٌ فوق العنوان تقول أين أنت، وعنوانٌ بأربعةٍ
   وثلاثين، وسطرٌ يقول ما هذه الشاشة. وثلاثتُها معا هي ما يجعل الصفحةَ
   **تبدأ** بدل أن تنفتح في وسطها. */
.page-head{display:flex; align-items:flex-end; gap:var(--s-5); flex-wrap:wrap;
  margin:var(--s-2) 0 var(--s-6d); padding-bottom:var(--s-5);
  border-bottom:var(--bd-soft)}
.page-head .txt{min-width:0; flex:1 1 21rem}
/* ‏وخيطُ اللصيقة خيطٌ محايد (D-187): كان نحاسيًّا في رأس كلّ صفحة، فيُعدّ موضعًا
   خارج المواضع الثلاثة (خطّة التصميم 3.2). */
.eyebrow{display:flex; align-items:center; gap:var(--s-2); font-size:var(--t-small);
  line-height:var(--lh-small); font-weight:400; color:var(--ink-2); margin-bottom:var(--s-1)}
.eyebrow .ln{height:1px; flex:none; width:var(--s-10); background:var(--line)}
/* **عنوانُ الصفحة ‏٢٨ لا ‏٥٦** (D-185): كان أكبرَ ما في الشاشة ولا يقول شيئًا، ثمّ
   عناوينُ بطاقاتٍ ‏٢٠ ولا شيءَ بينهما — تراتبٌ مقلوب. والجوّالُ ‏٢٤ من الرمز نفسِه */
.page-head h1{font-size:var(--t-h1); font-weight:600; line-height:var(--lh-h1);
  letter-spacing:0; margin:0}
/* ‏**وتحته خطٌّ قصيرٌ بحبر الرابط** كما تحت عناوين لوحة الهويّة (D-196): ‏٢٤ في ‏٢، في أوّل السطر.
   رمزُ قسمٍ لا رابط، ولا يُعدّ ذهبًا — والذهبُ لمواضعه الثلاثة */
.page-head h1::after{content:''; display:block; width:var(--s-6); height:var(--stroke); margin-top:var(--s-2);
  border-radius:var(--r-pill); background:var(--link)}
.page-head .lede{margin:var(--s-3) 0 0; font-size:var(--t-body); line-height:var(--lh-body);
  color:var(--ink-2); max-width:var(--measure)}
.page-head .aside{display:flex; align-items:center; gap:var(--s-2); flex-wrap:wrap}
/* وسطرٌ يقود لوحا بلا رأس: يقول ما الشاشة، ولا يُنفق ارتفاعَ عنوانٍ
   مكرَّرٍ فوقه (D-114) */
.lede-lead{margin:0 0 var(--s-5); font-size:var(--t-body); line-height:var(--lh-body);
  color:var(--ink-2); max-width:var(--measure)}

.pill{display:inline-flex; align-items:center; gap:var(--s-2); padding:var(--s-1) var(--s-3); border-radius:var(--r-pill);
  font-size:var(--t-caption); line-height:var(--lh-caption); font-weight:600; border:var(--bd); background:var(--surface-2)}
.pill .led{width:var(--dot); height:var(--dot); border-radius:50%; background:var(--ink-3); flex:none}
.pill.on{color:var(--ok); background:var(--ok-wash); border-color:color-mix(in srgb,var(--ok) 26%,transparent)}
.pill.on .led{background:var(--ok)}
.pill.off{color:var(--warn); background:var(--warn-wash);
  border-color:color-mix(in srgb,var(--warn) 34%,transparent)}
.pill.off .led{background:var(--warn)}
/* ‏وحبّةُ النظام في الرأس **رابطٌ إلى بطاقة الآلة**، وحالُها من النبض: «النشر متوقّف» حمراء.
   والرابطُ بلا خطٍّ تحته — الحبّةُ شكلُه — وهدفُ لمسه يُمدّ بعنصرٍ زائفٍ كرقاقة الرحلة.
   ولا تلتفّ: «النشر متوقّف» كانت تنكسر سطرين في ‏٣٩٠px، والعنوانُ قبلها هو الذي يُقصّ */
.pill.bad{color:var(--bad); background:var(--bad-wash); border-color:color-mix(in srgb,var(--bad) 34%,transparent)}
.pill.bad .led{background:var(--bad)}
a.pill{position:relative; text-decoration:none; white-space:nowrap; flex:none}
a.pill::after{content:''; position:absolute; inset:50% 0 auto; height:var(--tap); transform:translateY(-50%)}

/* ── المقطع: لغةُ الاختيار (خطّة التصميم 7.4 · D-189) ─────────────────────────────
   مسارٌ «--surface-2» والمختارُ «--surface» بظلّ «--sh-1» — المظهرُ والكثافةُ وقائمةٌ أو
   تقويم. **وكان «.theme»** اسمًا لمبدّلٍ واحدٍ يُستعار للكثافة، فصار «.seg» يحمل الاثنين
   وما يأتي، ودالّتُه «segmented()». وحبّةُ «--r-pill» للشارة والعدد وحدهما (3.3): المقطعُ
   زرٌّ فقطرُه قطرُ الزرّ. وفي الألوان القسريّة يُرسَم المختارُ بحدٍّ لا بظلّ (أسفلَ الورقة). */
.seg{display:inline-flex; padding:var(--s-0); gap:var(--s-0); border-radius:var(--r-control);
  border:var(--bd); background:var(--surface-2)}
.seg button{padding:var(--s-1) var(--s-3); border-radius:var(--r-control); background:transparent; border:0;
  color:var(--ink-2); font-size:var(--t-caption); line-height:var(--lh-caption); font-weight:600}
.seg button[aria-pressed=true]{background:var(--surface); color:var(--ink); box-shadow:var(--sh-1)}
/* ‏وفي اللوحة دون «md» (‏٩٠٠px) ينقله سكربتُها من ذيل الرافدة المخفيّ إلى آخر المحتوى —
   ‏مبدّلٌ واحدٌ مرئيٌّ في كلّ عرض، وفي وسطه لا ملتصقًا بحافّة */
.content > .seg{display:flex; width:fit-content; margin:var(--s-8) auto 0}

/* ── الإشعار: «card-alert» يطفو (خطّة التصميم 7.3 و7.8 · D-189) ─────────────────────
   كان «.flash» بحافّةٍ ‏٣px و«.next» بحافّةٍ ‏٤px — حافّتان ملوّنتان لمعنًى واحد. فصار الإشعارُ
   صيغةَ «card-alert» نفسَها (الحافّةُ ‏٤px بلون الحال، والسطحُ والحدُّ والظلُّ الأوّل)، ودالّتُه
   «notice()». ورمزُ الحال ‏١٦ بجوار نصٍّ ‏١٥، ووسطُه على وسط السطر الأوّل (‏٢٤). **والنغمةُ صنفٌ
   على الإشعار** («toast-note bad») لأنّ سكربتَ اللوحة يقرؤها ليقرّر أيذهب وحدَه أم يبقى. */
.toast-note{display:flex; align-items:flex-start; gap:var(--s-3); padding:var(--s-3) var(--s-4);
  border-radius:var(--r-card); margin-bottom:var(--s-4); font-size:var(--t-ui); line-height:var(--lh-ui);
  border:var(--bd); background:var(--surface); box-shadow:var(--sh-1);
  border-inline-start:var(--s-1) solid var(--line);
  transition:opacity var(--dur-2) var(--ease-out), transform var(--dur-2) var(--ease-out)}
.toast-ic{flex:none; display:inline-flex; margin-top:var(--s-1)}
.toast-ic svg{width:var(--icon-sm); height:var(--icon-sm); display:block}
.toast-t{min-width:0}
.toast-note.ok{border-inline-start-color:var(--ok)}
.toast-note.ok .toast-ic{color:var(--ok)}
.toast-note.warn{border-inline-start-color:var(--warn)}
.toast-note.warn .toast-ic{color:var(--warn)}
.toast-note.bad{border-inline-start-color:var(--bad)}
.toast-note.bad .toast-ic{color:var(--bad)}
/* رسالةُ النموذج المشغول تُكتب في منطقة الإعلان فتُقرأ وتُرى (D-149) */
.busy-note{margin:0 0 var(--s-3); font-size:var(--t-small); line-height:var(--lh-small); color:var(--ink-2)}
/* ── ودخولُه وحدَه يُتحرَّك ────────────────────────────────────────────
   الإشعارُ هو **الشيءُ الوحيد في الصفحة الذي لم يكن قبل الضغطة**: كلُّ
   ما عداه كان معروضا قبلها ويُعاد رسمُه. فسكونُه يجعله يُقرأ جزءا من
   الصفحة، وقد يُمرَّر عليه بلا أن يُرى — **وهو يحمل نتيجةَ ما فُعل**.

   **ولا تُحرَّك البطاقاتُ معه.** صفحةٌ كلُّها تنزلق عند كلّ فتحةٍ تُقرأ
   بطيئةً ولو كانت سريعة، وتُفتَح هذه اللوحةُ عشرَ مرّاتٍ في اليوم.

   و«@starting-style» تصف حالَ ما قبل الظهور — **بلا سطرِ JavaScript
   واحد**، ومتصفّحٌ لا يعرفها يُظهره ساكنا كما هو اليوم. */
@starting-style{.toast-note{opacity:0; transform:translateY(calc(-1 * var(--s-2)))}}
/* ── والإشعارُ يطفو حين يعمل السكربت (الخطّة 5.9 و7.8) ─────────────────
   كان في رأس المحتوى وحدَه، والفعلُ يعود إلى بطاقته في وسط اللوح — فبعد «اعتمد»
   أو رفع خطّةٍ تُردّ كان الإشعارُ عند ‏-4445px، فوق الشاشة، **والمالكُ يرى البطاقةَ
   كأنّ شيئًا لم يقع**. فيطفو أعلى الشاشة في الجوّال، وفي الزاوية السفليّة على الحاسوب.
   **وبلا سكربتٍ يبقى في مكانه**: الصنفُ يضعه السكربتُ مع زرّ «أغلق» ومهلته، فلا
   إشعارَ عائمٌ لا يُغلَق. والحاويةُ لا تأخذ النقر — ما فيها وحدَه يأخذه.

   **وفي الجوّال تحت الشريط العلويّ لا فوق الشريط السفليّ** (مراجعة ر-0): أسفلُ الشاشة
   مزدحمٌ بما يلتصق — صفُّ البتّ «.draft-foot.act» و«.pi-bar» و«.bulkbar» — فكان خطأُ «اعتمد»
   يقع فوق «اعتمد» و«ارفض» نفسَيهما (‏694–764 فوق ‏720–780 عند ‏390)، ولا يذهب حتّى يُغلَق.
   والأعلى لا يلتصق فيه إلّا الشريطُ (‏64px)، فيقع الإشعارُ تحته ولا يغطّي قرارًا. */
.toast{position:fixed; z-index:45; inset-inline:var(--s-4);
  top:calc(var(--topbar) + var(--s-3));
  display:flex; flex-direction:column; align-items:stretch; gap:var(--s-2); pointer-events:none}
.toast > *{pointer-events:auto}
.toast .toast-note{margin:0; box-shadow:var(--sh-3)}
.toast .busy-note{margin:0; align-self:flex-start; padding:var(--s-2) var(--s-3); background:var(--surface);
  border:var(--bd); border-radius:var(--r-card); box-shadow:var(--sh-2)}
.toast-x{flex:none; margin-inline-start:auto}
@media${atLeast('md')}{
  .toast{inset-inline-start:auto; inset-inline-end:var(--s-6); top:auto; bottom:var(--s-6); max-width:var(--measure)}
}

section[hidden]{display:none}

/* ══ الشبكة والبطاقات ════════════════════════════════════════ */
/* عنصرُ الشبكة لا ينكمش تحت محتواه ما لم يُقَل له: min-width الافتراضيّة
   auto، **فسلسلةٌ لا تنكسر — عنوانُ API أو اسمُ نموذج — تدفع العمودَ
   فيفيض المستندُ كلُّه**. وقيس ذلك في لوح المزوّدين: 406px على شاشة 390. */
.grid{display:grid; gap:var(--gap-card)}
.grid>*{min-width:0}
/* والسلاسلُ اللاتينيّة الطويلة تُكسَر عند الضرورة لا تُقصّ: عنوانٌ مقصوصٌ
   لا يُنسَخ صحيحا، ومكسورٌ يُقرأ ويُنسَخ. */
/* **ولا خطَّ أحاديَّ العرض** (D-185): كان «ui-monospace» يسقط إلى خطّ النظام في
   كلّ جهاز. فالمعرّفُ واسمُ النموذج والأمرُ بـ Plex Sans بأرقامٍ جدوليّة، في شارةٍ
   هادئة معزولةِ الاتّجاه — نمطُ «code» ‏14/22/400. */
.mono{overflow-wrap:anywhere; font-family:inherit; font-variant-numeric:tabular-nums;
  font-size:var(--t-code); line-height:var(--lh-code); font-weight:400; color:var(--ink-2);
  direction:ltr; display:inline-block; unicode-bidi:isolate;
  padding:0 var(--s-1); border-radius:var(--r-inline); background:var(--surface-2)}
/* أرقامٌ ثابتةُ العرض في كلّ موضعٍ تتبدّل فيه: عمودٌ يهتزّ مع كلّ تحديث
   يُقرأ عطلا. وكانت مضبوطةً على البطاقات وحدها. */
table,.chip,.count,.ago,.money,.num,.note,.step-n{font-variant-numeric:tabular-nums}
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
@media${below('lg')}{
  .c4,.c5{grid-template-columns:repeat(2,1fr)} .c21{grid-template-columns:1fr}}
@media${below('md')}{.c3,.c2{grid-template-columns:1fr}}
@media${below('sm')}{.c4,.c5{grid-template-columns:1fr}}
/* ── صفُّ المؤشّرات في الجوّال زوجان لا عمود (D-136) ──────────────────
   ستُّ بطاقاتٍ في عمودٍ واحدٍ على ‏٣٩٠px ثمانُ مئةِ بكسلٍ قبل أوّل قائمة،
   وكلُّ بطاقةٍ رقمٌ واحدٌ في ‏١٣٠px. **فالمؤشّراتُ اثنان في الصفّ ما دام
   الرقمُ يسع**، والرقمُ يصغر درجةً ليسع — وقاعدتُه بعد قاعدة الرقم أدناه. */
@media${below('md')}{
  .tiles.c2,.tiles.c3,.tiles.c4,.tiles.c5{grid-template-columns:repeat(2,1fr)}
  .tiles.c3>.tile:last-child:nth-child(odd){grid-column:1/-1}}
/* ── نظرةٌ عامّة: عمودان يُملآن لا يُمدّان (D-136) ──────────────────────
   شبكةٌ تمدّ البطاقةَ لتساوي جارتَها تترك تحت رسم الإنفاق ‏٥٢١px بيضاء
   (قِيست). فالعمودُ الثاني **رصّةٌ** من بطاقتين تملأ ما تملؤه القائمة،
   ولا بطاقةَ تُمدّ فوق محتواها. */
.ov{display:grid; grid-template-columns:minmax(0,1.15fr) minmax(0,1fr); gap:var(--gap-card); align-items:start}

/* ── الرئيسيّة: خطوتُك، ثمّ الرحلة، ثمّ المنصّات (D-177) ───────────────
   ثلاثُ طبقاتٍ تجيب ثلاثةَ أسئلةٍ قبل أيّ رقم مال. والفعلُ الواحدُ بلون حاله:
   أحمرُ ما يوقف النشر، وبرتقاليُّ ما ينتظر، وحدٌّ أخضرُ لما يجري. */
.next{display:flex; align-items:center; gap:var(--s-4); flex-wrap:wrap; margin-bottom:var(--gap-card)}
.next[data-tone=warn]{border-inline-start-color:var(--warn); background:var(--warn-wash)}
.next[data-tone=bad]{border-inline-start-color:var(--bad); background:var(--bad-wash)}
.next-body{flex:1 1 16rem; min-width:0}
.next-k{display:block; font-size:var(--t-caption); line-height:var(--lh-caption); font-weight:600; color:var(--ink-2)}
.next-t{margin:var(--s-1) 0 0; font-size:var(--t-h3); font-weight:600; line-height:var(--lh-h3)}
.home-card{margin-bottom:var(--gap-card)}
.home-sub{margin:var(--s-5) 0 var(--s-3); font-size:var(--t-h2); line-height:var(--lh-h2); font-weight:600}
/* ‏مكتبُ اليوم (D-216): ما ينتظر قرارك بفعله، ثمّ التشغيلُ والكلفةُ مطويّين في آخر الرئيسيّة */
.desk{margin-top:var(--gap-card)}
.desk-list{list-style:none; margin:0; padding:0; display:flex; flex-direction:column}
.desk-row{display:flex; flex-direction:column; gap:var(--s-2); padding-block:var(--s-3); border-top:var(--bd-soft)}
.desk-row:first-child{border-top:0; padding-top:0}
.desk-head{display:flex; align-items:center; gap:var(--s-2); min-width:0}
.desk-head b{font-size:var(--t-ui); line-height:var(--lh-ui); font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
.desk-text{margin:0; max-width:var(--measure); color:var(--ink); display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden}
.desk-acts{display:flex; flex-wrap:wrap; gap:var(--s-2)}
.home-ops > summary{display:flex; align-items:center; gap:var(--s-3); flex-wrap:wrap; cursor:pointer; list-style:none; min-height:var(--tap)}
.home-ops > summary::-webkit-details-marker{display:none}
.home-ops > summary h2{margin:0}
/* ── القمعُ وشريطُ الأسبوع (D-194) ─────────────────────────────────────────────────
   القمعُ صفوفٌ: اسمُ المحطّة وحالُها، ثمّ شريطٌ بطول ما مرّ بها (حبرٌ واحد: قياسٌ لا هويّة)،
   ثمّ العدد. **والمميَّزةُ وحدَها بلون حالها** فلا تُقرأ سبعُ محطّاتٍ برتقاليّةٍ ضجيجًا. */
.home-pair{display:grid; align-items:start; gap:var(--gap-card); grid-template-columns:minmax(0,3fr) minmax(0,2fr); margin-bottom:var(--gap-card)}
.home-pair > .home-card{margin-bottom:0}
/* ‏وتحت العريض عمودٌ واحد — وبعد قاعدتها في الورقة، فلا يغلبها الترتيب */
@media${below('lg')}{.home-pair{grid-template-columns:minmax(0,1fr)}}
.home-side{display:grid; grid-template-columns:minmax(0,1fr); gap:var(--gap-card)}
.grid.tiles + .home-pair{margin-top:var(--gap-card)}
.home-side > .home-card{margin-bottom:0}
/* ‏والمنصّاتُ في العمود الجانبيّ صفوفٌ لا بطاقات (D-194): شعارٌ واسمٌ وحالٌ وزرٌّ في سطر */
.home-side .pfgrid{grid-template-columns:1fr; gap:var(--s-1)}
.home-side .pf{flex-direction:row; flex-wrap:wrap; align-items:center; column-gap:var(--s-3); row-gap:var(--s-1);
  padding:var(--s-2); border:0; box-shadow:none; background:var(--surface-2)}
.home-side .pf-head{flex:1 1 8rem; min-width:0}
.home-side .pf .btn{margin:0; flex:none}
.home-side .pf > .ago{display:none}
.funnel{list-style:none; margin:0; padding:0; display:grid; gap:var(--s-1)}
.funnel a{display:grid; grid-template-columns:9rem minmax(0,1fr) 2.5rem; grid-template-areas:"t bar n" "t note note";
  column-gap:var(--s-3); row-gap:var(--s-0); align-items:center; padding:var(--s-1) var(--s-2); border-radius:var(--r-control);
  color:inherit; text-decoration:none; min-height:var(--tap)}
@media(hover:hover){.funnel a:hover{background:var(--hover)}}
.funnel li[data-focus] a{background:var(--surface-2)}
.fn-t{grid-area:t; display:flex; flex-direction:column; align-items:flex-start; gap:var(--s-0)}
.fn-t b{font-size:var(--t-ui); line-height:var(--lh-ui); font-weight:600}
.fn-bar{grid-area:bar; display:flex; justify-content:flex-start; height:var(--s-3); border-radius:var(--r-control); background:var(--surface-3); overflow:hidden}
.fn-bar > span{display:block; flex:none; height:100%; width:var(--w); border-radius:var(--r-control); background:var(--ink-2)}
.funnel li[data-focus][data-state=now] .fn-bar > span{background:var(--warn)}
.funnel li[data-focus][data-state=failed] .fn-bar > span,.funnel li[data-state=failed] .fn-bar > span{background:var(--bad)}
.fn-n{grid-area:n; text-align:end; font-size:var(--t-h3); line-height:var(--lh-h3); font-weight:600}
.fn-note{grid-area:note; font-size:var(--t-small); line-height:var(--lh-small); color:var(--ink-2)}
.wk{list-style:none; margin:0; padding:0; display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); gap:var(--s-1)}
.wk li{display:flex; flex-direction:column; align-items:center; gap:var(--s-1); padding:var(--s-2) 0;
  border-radius:var(--r-control); background:var(--surface-2); min-height:8.5rem}
.wk li[data-today]{background:var(--surface); box-shadow:inset 0 0 0 var(--stroke) var(--brand)}
.wk-d{font-size:var(--t-caption); line-height:var(--lh-caption); font-weight:600; color:var(--ink-2)}
.wk-n{font-size:var(--t-h3); line-height:var(--lh-h3); font-weight:600}
.wk-dots{display:flex; flex-wrap:wrap; justify-content:center; gap:var(--s-0); flex:1; align-content:flex-start; padding:0 var(--s-1)}
.wk-dot{width:var(--s-2); height:var(--s-2); border-radius:50%; background:var(--ink-3)}
.wk-dot[data-pf=linkedin]{background:var(--pf-linkedin)}
.wk-dot[data-pf=x]{background:var(--pf-x); box-shadow:0 0 0 var(--stroke) var(--logo-ring)}
.wk-dot[data-pf=instagram]{background:var(--pf-instagram)}
.wk-dot[data-pf=tiktok]{background:var(--pf-tiktok); box-shadow:0 0 0 var(--stroke) var(--logo-ring)}
.wk-dot[data-pf=youtube]{background:var(--pf-youtube)}
.machine-more > summary{cursor:pointer; color:var(--ink-2); font-size:var(--t-small); line-height:var(--lh-small); min-height:var(--tap); display:flex; align-items:center}
.wk-hint{margin:var(--s-3) 0 0}
.wk-c{font-size:var(--t-small); line-height:var(--lh-small); color:var(--ink-2)}
.pfgrid{display:grid; gap:var(--s-2); grid-template-columns:repeat(auto-fill,minmax(11.75rem,1fr))}
.pf{display:flex; flex-direction:column; align-items:flex-start; gap:var(--s-2)}
.pf .btn{margin-top:auto}
.pf-head{display:flex; align-items:center; gap:var(--s-2); min-width:0}
.pf-name{display:flex; flex-direction:column; min-width:0}
/* ‏وحلقةٌ ليلًا (D-183): مربّعا X وTikTok على السطح الداكن ‏١٫٠٣ و‏١٫٠٥:١ —
   يختفيان ويبقى رمزٌ أبيضُ يطفو. ونهارًا الحلقةُ شفّافة */
.pf-logo{width:var(--s-10); height:var(--s-10); flex:none; display:grid; place-items:center;
  border-radius:var(--r-control); color:var(--pf-fg); background:var(--brand);
  box-shadow:0 0 0 1px var(--logo-ring)}
.pf-logo svg{width:50%; height:50%; display:block}
.pf[data-pf=linkedin] .pf-logo{background:var(--pf-linkedin)}
.pf[data-pf=x] .pf-logo{background:var(--pf-x)}
.pf[data-pf=instagram] .pf-logo{background:var(--pf-instagram)}
.pf[data-pf=tiktok] .pf-logo{background:var(--pf-tiktok)}
.pf[data-pf=youtube] .pf-logo{background:var(--pf-youtube)}
@media${below('sm')}{
  .funnel a{grid-template-columns:6.5rem minmax(0,1fr) 2rem}
  .wk li{min-height:6.5rem}
  .pfgrid{grid-template-columns:repeat(2,minmax(0,1fr))}
  .next .btn{flex:1 1 100%}
}
.stack{display:grid; gap:var(--gap-card); align-content:start}
@media${below('lg')}{.ov{grid-template-columns:1fr}}

/* ── البطاقة: سطحٌ وحدٌّ وظلٌّ خفيف (خطّة التصميم 3.3 و7.3 · D-187) ─────────────
   **مراجعةٌ لـ D-144 «بطاقةٌ مسطّحة»**: قِيست البنيةُ فلم تُرَ — حدُّ البطاقة على الأرض
   ‏١٫٢٣:١، وثلاثةُ عناصرَ فقط تحمل ظلًّا في الرئيسيّة، فتُقرأ الصفحةُ ورقةً واحدةً
   مخطّطة. فصار للبطاقة حدٌّ أوضح («--line» ‏١٫٥٢:١) وظلُّ الارتفاع الأوّل، **والظلُّ
   يسند الحدَّ ولا يحلّ محلّه**. وسقطت المادّةُ («--sheen» و«--hair»): ضوءٌ مرسومٌ
   على سطحٍ يُقرأ زينةً لا بنية. والحشوُ رمزُ دوره («--pad-card»: ‏٢٤ ثمّ ‏١٦ على الجوّال). */
.card{background:var(--surface); border:var(--bd); border-radius:var(--r-card);
  padding:var(--pad-card); box-shadow:var(--sh-1);
  transition:box-shadow var(--dur-2) var(--ease), border-color var(--dur-2) var(--ease)}
/* بطاقةُ القناة والمسوّدة تحملان فعلا، فترتفعان قليلا عند التحويم: الظلُّ الثاني
   والحدُّ الوظيفيّ (خطّة التصميم 7.3). وبطاقاتُ العرض لا ترتفع: حركةٌ بلا فعلٍ خلفها
   تَعِد بما لا يقع. **وكانت قاعدتين** (الثانيةُ آخرَ الورقة بالظلّ الثالث تغلب
   الأولى)، فصارت واحدة. */
@media(hover:hover){.ch:hover,.draft:hover{box-shadow:var(--sh-2); border-color:var(--field)}}
/* **الابنُ المباشرُ وحده كان يُصاب.** و .card-head h2 حفيدٌ لا ابن،
   فسقط من القاعدة وورث حجمَ المتصفّح الافتراضيّ — ‏٢١px، وهو خارجُ
   السلّم كلِّه. علّةٌ لم تُرَ لأنّ ٢١ قريبةٌ ممّا حولها، **وكشفها
   قياسُ المقاييس المستعملة فعلا** لا النظرُ.
   والمحدّدُ صار وصفيّا: كلُّ عنوانٍ في بطاقة. */
.card h2{font-weight:600; margin-bottom:var(--s-0); font-size:var(--t-h3); line-height:var(--lh-h3); letter-spacing:0}
/* **والهامشُ قاعدةٌ لا استثناء.** كانت على «.card > .hint» وحدها،
   فـ«hint» خارج بطاقةٍ يرث 14px من المتصفّح — **خارجَ السلّم**، وهي
   علّةُ «p.nm» و«h3.sec» نفسُها (D-057 · D-061 · D-062). فتُوضَع
   القاعدةُ للصنف، ويبقى محدّدُ البطاقة لِما يخصّها من لونٍ وقياس. */
.hint{margin:0 0 var(--s-4)}
.card > .hint{margin:0 0 var(--s-4); font-size:var(--t-small); color:var(--ink-2); line-height:var(--lh-small)}
.card-head{display:flex; align-items:center; gap:var(--s-3); flex-wrap:wrap; margin-bottom:var(--s-3)}
.card-head h2{margin:0}
/* ── صيغُ البطاقة الثلاثُ الأخرى (خطّة التصميم 7.3 · D-189) ─────────────────────────
   «card-interactive»: البطاقةُ كلُّها رابط، وتمريرُها حدُّ الوظيفة والظلُّ الثاني — **لا قفزة**
   («translate» ممنوع، 3.3). «card-inset»: ما في داخل بطاقةٍ أخرى، سطحٌ ثانٍ بلا حدٍّ ولا ظلّ.
   «card-alert»: الحافّةُ الملوّنةُ الوحيدة (‏٤px بلون الحال) بدل خمس — والإشعارُ صيغتُها. */
.card-interactive{display:block; color:inherit; text-decoration:none}
@media(hover:hover){.card-interactive:hover{box-shadow:var(--sh-2); border-color:var(--field)}}
.card-inset{background:var(--surface-2); border-color:transparent; box-shadow:none}
.card-alert{border-inline-start:var(--s-1) solid var(--ok)}
.card-alert[data-tone=warn]{border-inline-start-color:var(--warn)}
.card-alert[data-tone=bad]{border-inline-start-color:var(--bad)}
/* ‏ورأسُها: عنوانٌ بنمط «h3» في كلّ مستوى، ثمّ جملةٌ واحدةٌ بحبر «--ink-2» */
.card-head h3{margin:0; font-size:var(--t-h3); line-height:var(--lh-h3); font-weight:600}
/* ‏حشوُ ما نُقل إلى البطاقة من مكوّنٍ يسبقها في الورقة (٢ج): قاعدتُه قبل «.card» فيغلبه
   «--pad-card» بالترتيب، فيُثبَّت هنا بمحدّدٍ مركّبٍ لا بإعادة إعلان الصنف */
.card-alert.next{padding:var(--s-4) var(--s-5)}
@media${below('sm')}{.card-alert.next{padding:var(--s-4)}}
.card.pf{padding:var(--s-3)}
/* ‏و«.card > p» قاعدةٌ عامّةٌ لفقرة البطاقة (هامشٌ وحرفٌ صغيرٌ وحبرٌ ثانٍ) — وفقراتُ هذه
   المكوّنات لها قياسُها في قواعدها، فلا ترثها حين صارت بطاقة. والسهمُ في الرحلة وبابُ
   «ما تطلبه» سطحان ثانيان بلا ظلّ كما كانا */
.card.keys > .hint{color:var(--ink)}
.needs-list a.card-interactive{box-shadow:none}
/* ‏والدليلُ إفصاحٌ بلا حشو (رأسُه وجسدُه يحملانه)، إلّا دليلَ نتيجة الربط فهو بطاقةٌ بحشوها
   وظلّها على السطح الثاني كما كان. وشبكةُ المؤشّرات بطاقةٌ خيوطُها فجوةُ ‏1px على أرض «--line» */
.card-inset.guide{padding:0}
.card.guide:not(.card-inset){background:var(--surface-2)}
.card-desc{margin:calc(-1 * var(--s-2)) 0 var(--s-3); font-size:var(--t-small); line-height:var(--lh-small); color:var(--ink-2)}
/* عنوانُ القسم: خيطٌ رماديٌّ يمتدّ تحته، وفوقه فاصلُ الأقسام («--gap-section»: ‏٤٨ ثمّ
   ‏٣٢ على الجوّال). وكان يبدؤه خيطٌ نحاسيٌّ قصير، فيُعدّ موضعًا في كلّ قسم — سبعةَ عشرَ
   موضعًا في صفحة القنوات وحدها — فسقط (D-187). */
/* **والصنفُ لا يُقيَّد بوسم.** كان «h3.sec»، فـ«h2» يحمل الصنفَ نفسَه
   يسقط من القاعدة ويرث 21px من المتصفّح — **خارجَ السلّم**، وهي علّةُ
   «.card > h2» نفسُها (D-057). ومدقّقُ السلّم أمسكها هنا كذلك. */
.sec{color:var(--ink-2); margin:var(--gap-section) 0 var(--s-3); padding-bottom:var(--s-2);
  border-bottom:var(--bd-soft); position:relative; font-size:var(--t-ui);
  line-height:var(--lh-ui); font-weight:600}

/* ── ميزانيّةُ الذهب: ثلاثةُ مواضعَ في الشاشة لا رابعَ لها (خطّة التصميم 3.2 · D-187 · D-196) ──
   (وكان اسمُها «النحاس» حتّى لوحة الهويّة.) العلامةُ («.glyph»، و«.moment-glyph» في لحظتها)، ومؤشّرُ
   القسم الحاليّ في الرافدة، والرقمُ البطل أدناه. **وكان في
   الرئيسيّة خمسةَ عشرَ موضعًا** (D-156 قصرَه على حبرٍ لرقمٍ واحد وخيوط، والخيوطُ تكاثرت):
   خيطُ كلّ قسم، ورأسُ شريط المؤشّرات، وخطٌّ تحت كلّ رابطٍ هادئ، وأطولُ أعمدة الرسم،
   ورافدةُ الدليل، وحلقةُ التركيز، ووهجُ المسوّدة المنتظرة، ووهجُ الأرض. **فصار الذهبُ
   لا يقع على حدّ بطاقةٍ ولا خطّ رابطٍ ولا شريطِ رسمٍ ولا حالٍ ولا وهج**، ويعدّه
   «audit_design» في كلّ شاشةٍ مرسومة و«audit_tokens» في الورقة. */

/* ── بطاقةُ المؤشّر ────────────────────────────────────────── */
.tile{display:flex; flex-direction:column; position:relative; overflow:hidden}
/* وكان على رأس كلّ مؤشّرٍ خيطُ نحاسٍ («::before») يُخفيه شريطُ المؤشّرات منذ
   D-143، فلم يبقَ إلّا على عدّاد المصادر المستعير للصنف — نحاسٌ بلا معنى. فحُذف
   (D-183)؛ والصفُّ يربطه حدُّ الشريط النحاسيُّ في «.grid.tiles». */
.tile .kv-k{font-size:var(--t-caption); line-height:var(--lh-caption); font-weight:600; color:var(--ink-2)}
/* **أرقامُ المؤشّرات نمطُ «kpi»** (D-185): حجمُ عنوان الصفحة بوزن ‏٤٠٠ — الرقمُ يُقرأ
   بحجمه لا بثخانته، والثخينُ للعناوين. */
.tile .kv-v{font-size:var(--t-h1); font-weight:400; line-height:var(--lh-h1);
  font-variant-numeric:tabular-nums; margin-top:var(--s-1);
  /* العزلُ يثبّت ترتيبَ الرقم ورمزِ العملة، والمحاذاةُ تُبقيه تحت لصيقته.
     **ولا تضييقَ إلّا للرقم البطل** (D-185 · خطّة التصميم 4.3): ‏-.01em للأرقام اللاتينيّة
     عند ‏٤٠، وصفرٌ فيما دونه — Plex جدوليُّ الأرقام بمسافاته */
  direction:ltr; unicode-bidi:isolate; text-align:end; letter-spacing:0}
.tile .kv-v em{font-style:normal; font-size:var(--t-small); line-height:var(--lh-small); color:var(--ink-2);
  margin-inline-start:var(--s-0); font-weight:400}
/* ── والمؤشّرُ الأوّل يقود بالقياس كما يقود باللون (D-117) ───────────
   ندرةٌ تصنع مرتبة، وذهبٌ على الأربعة يُلغي معنى الأوّل. **وكان اللونُ
   وحدَه يقول ذلك والقياسُ يخالفه**: أربعةُ أرقامٍ عند ‏٤٢px في صفٍّ
   واحد، **فلا تقول الشاشةُ أيُّها الجواب**.

   وذهبٌ يقول «هذا أوّلٌ» وقياسٌ يقول «الأربعةُ سواء» **يُلغي أحدُهما
   الآخر**، ويبقى الصفُّ يُقرأ لوحةَ عدّادات.

   **ويشمل شبكةَ الثلاثة كذلك** (المزوّدون): القاعدةُ في الأوّليّة لا في
   العدد. */
/* ‏وهو ثالثُ مواضع الذهب: رقمٌ واحدٌ في الشاشة (D-187 · D-196) */
.grid>.tile:first-child .kv-v{font-size:var(--t-display); line-height:var(--lh-display); color:var(--au);
  font-weight:400; direction:ltr; letter-spacing:-.01em}
/* ══ لحظةُ العلامة: الدخولُ والعاملُ الثاني (D-196 · نقشُ الصدى) ═════════════════════
   السطحُ العميقُ ثابتٌ في الثيمين كأرض العلامة، والنموذجُ على أرض الثيم بجانبه. **والنقشُ
   في لوحته وحدها**: لا يمرّ خلف حقلٍ ولا نصّ، ولا يتحرّك. على الجوّال شريطٌ فوق النموذج،
   ومن «md» لوحةٌ قائمةٌ في أوّل السطر (يمينًا) والنموذجُ في وسط ما بقي. **والقفلُ كما في
   اللوحة**: الاسمُ ثمّ الرمز في الشيفرة، فيقع الرمزُ يسارَه — الشعارُ لا يُقلَب مع الاتّجاه.
   **والنصُّ على العمق عاجيٌّ و«نعناعٌ فاتح» لا نعناع** (‏Lc ‏٦٣ لحرفٍ صغير) */
/* ‏**والشريطُ بارتفاعه لا بنصيب الشاشة** (مراجعة D-196): الصفّان كانا ضمنيَّين فوزّعت «min-height»
   فراغَها عليهما، فطال الشريطُ ‏٣٤٩px في ‏768×1024 والنموذجُ تحته */
.auth-split{display:grid; grid-template-columns:minmax(0,1fr); grid-template-rows:auto 1fr; min-height:100vh; min-height:100dvh}
.auth-split .auth{margin:var(--s-8) auto}
/* ‏والشريطُ تحت النصّ لا خلفه: الارتفاعُ الأدنى يترك له ربعَ الشريط الأسفل (‏٢٥٦ في ‏٣٩٠).
   وهو حاويةٌ («moment») يُسأل عرضُها */
.moment{container:moment / inline-size; position:relative; overflow:hidden; isolation:isolate; background:var(--moment-ground);
  color:var(--moment-ink); padding:var(--s-6) var(--gutter); min-height:calc(var(--s-16) * 4);
  display:flex; flex-direction:column; align-items:flex-start; gap:var(--s-1)}
.moment .echo{position:absolute; inset:0; z-index:-1; pointer-events:none}
.moment .echo svg{display:block; width:100%; height:100%}
.moment .echo.wide{display:none}
.moment-id{display:flex; align-items:center; gap:var(--s-4); margin-bottom:var(--s-3)}
.moment-name{display:flex; flex-direction:column; align-items:center; gap:var(--s-1)}
.moment .wordmark{height:var(--s-6); color:var(--moment-ink)}
/* ‏والرمزُ هنا العلامةُ نفسُها بلونها («--mark-fg») — لا اسمٌ ثانٍ يفلت من عدّ الذهب (مراجعة D-196) */
.moment-glyph{display:block; height:var(--s-10); aspect-ratio:4/3; color:var(--mark-fg)}
.moment-glyph svg{display:block; width:100%; height:100%}
.moment-line{margin:0; font-size:var(--t-ui); line-height:var(--lh-ui); font-weight:400; color:var(--moment-ink)}
/* ‏**وعلى الشاشة القصيرة القفلُ وحده** (مراجعة D-196): الشريطُ ‏٢٥٦px أيًّا كان الارتفاع دفع الحقلَ وزرَّه
   تحت الطيّة في ‏375×548 (iPhone SE بشريط Safari)، ولم يُبقِ الهاتفُ أفقيًّا (‏844×390) إلّا الشريطَ
   والعنوان. فتحت ‏٤٠rem ارتفاعًا يسقط النقشُ والسطران، ويبقى القفلُ شريطًا عميقًا بقدره —
   **والفعلُ الأوّلُ وحقلُه في الشاشة الأولى**، ويقيسه «audit_mobile» في المقاسات الأربعة القصيرة */
@media${below('md')} and (max-height:40rem){
  .moment{min-height:0; padding-block:var(--s-4)}
  .moment .echo,.moment-line{display:none}
  .moment-id{margin-bottom:0}
  .auth-split .auth{margin:var(--s-4) auto}
}
@media${atLeast('md')}{
  .auth-split{grid-template-columns:minmax(0,5fr) minmax(0,7fr); grid-template-rows:none}
  .auth-split .auth{margin:16vh auto}
  /* ‏والقفلُ في الثلث الأعلى والشريطُ يصعد إليه من الأسفل (مراجعة D-196: كان بينهما فراغٌ ميّت):
     صفّان مرنان قبل القفل وبعده بنسبة ‏٢ إلى ‏٥، لا مسافةٌ خارج السلّم */
  .moment{display:grid; grid-template-rows:minmax(0,2fr) auto auto minmax(0,5fr); justify-items:start;
    align-content:stretch; padding:var(--s-12); gap:var(--s-2)}
  .moment-id{grid-row:2} .moment-line{grid-row:3}
  .moment .echo.wide{display:block}
  .moment .echo.narrow{display:none}
  .moment-glyph{height:var(--s-16)}
  .moment .wordmark{height:var(--s-10)}
  .moment-line{font-size:var(--t-body); line-height:var(--lh-body)}
}
/* ‏والورقُ أبيضُ بلا لحظة (D-125): النموذجُ وحدَه يُطبَع */
@media print{.moment{display:none} .auth-split{display:block}}

/* ── والرقمُ يصغر درجةً على الجوّال (D-136) — **من الرمز لا بقاعدة** (D-185) ──
   كانت قاعدةً بعد قاعدتَي الرقم، فغلبتها مرّةً بتساوي المحدّد (D-167). وصار السلّمُ
   يتبدّل تحت ‏600px («--t-display» ‏٣٢ و«--t-h1» ‏٢٤)، فلا قاعدةَ يُخشى ترتيبُها. */

/* المقياس **مقياسُ مقدار لا تصنيف**: هيئةٌ واحدة تتدرّج، ولا لونَ حالٍ فيه
   قطّ — حتّى يبلغ. والبلوغُ حالةٌ لا مقدار، فيقفز إلى الأحمر **ومعه نصّ**. */
.bar{height:var(--s-1); background:var(--surface-3); border-radius:var(--r-pill); overflow:hidden; margin-top:var(--s-3)}
.bar i{display:block; height:100%; border-radius:var(--r-pill); background:var(--brand); transition:width var(--dur-3) var(--ease-out)}
.bar i.full{background:var(--bad)}
/* اكتمالٌ لا بلوغُ سقف — خضرةٌ كعلامته تحته (D-134) */
.bar i.done{background:var(--ok)}
.cap{display:inline-flex; align-items:center; gap:var(--s-1); font-size:var(--t-caption);
  line-height:var(--lh-caption); font-weight:600; color:var(--bad); margin-top:var(--s-2)}
.cap.done{color:var(--ok)}

/* الفرقُ عن الأمس: علامةٌ **ونصّ** — والسهمُ وحده لا يُقرأ بصوتٍ عالٍ */
/* ‏والفرقُ جملةٌ («18٪ أكثر من أمس») لا لصيقة، فنمطُه «small» (D-185) */
.delta{display:inline-flex; align-items:center; gap:var(--s-1); font-size:var(--t-small);
  line-height:var(--lh-small); margin-top:var(--s-2); color:var(--ink-2)}
/* **والفرقُ مقدارٌ لا حالة** (D-123): كان الصاعدُ أخضرَ والهابطُ كهرمانا،
   والبطاقةُ إنفاق — **فإنفاقٌ نزل يُقرأ تحذيرا وإنفاقٌ صعد يُقرأ نجاحا**،
   وهو عكسُ ما يعنيه. وألوانُ الحالة محجوزة (D-043): السهمُ والنصُّ يقولان
   الاتّجاه، والحبرُ يبقى حبرا. والصنفان يبقيان للاتّجاه لا للّون. */
.delta.up,.delta.down{color:var(--ink-2)}
.delta .ar{display:inline-flex}
/* والسهمُ مرسومٌ بقياس رمز الرقاقة (D-167): ‏١٤px كـ«.st-ic svg» (D-185) */
.delta .ar svg{width:var(--icon-xs); height:var(--icon-xs); display:block}

/* ══ الجداول ═════════════════════════════════════════════════ */
.scroll{display:block; overflow-x:auto; margin:0 -var(--s-0); padding:0 var(--s-0)}
/* الصفُّ نمطُ «ui-regular» والرأسُ لصيقة (D-185 · خطّة التصميم 7.5) */
table{width:100%; border-collapse:collapse; font-size:var(--t-ui); line-height:var(--lh-ui); min-width:32.5rem}
th{text-align:start; color:var(--ink-2); font-size:var(--t-caption); line-height:var(--lh-caption); padding:0 var(--s-2) var(--s-2);
  border-bottom:var(--bd); white-space:nowrap; font-weight:600}
td{padding:var(--s-3) var(--s-2); border-bottom:var(--bd-soft); vertical-align:top}
tbody tr:last-child td{border-bottom:0}
@media(hover:hover){tbody tr:hover{background:var(--hover)}}
/* ── اللوحُ المحوريّ (D-120) ───────────────────────────────────────
   **والجدولُ وحدَه يمرّر أفقيّا**: عشرةُ أعمدةٍ لا تسع ٣٩٠px، وجسمُ
   الصفحة لا يُمرَّر — فالغلافُ حوله لا الصفحةُ كلُّها. */
.pv-wrap{overflow-x:auto}
/* رأسُ صفّ المنصّة رابطٌ إلى شاشتها — وهدفُ لمسٍ كاملٌ لا سطرُ نصّ (D-132) */
.pv th a{display:inline-flex; align-items:center; min-height:var(--tap); min-width:var(--tap); color:var(--link);
  text-decoration:underline; text-underline-offset:var(--ul-off); text-decoration-thickness:var(--ul)}
@media(hover:hover){.pv th a:hover{text-decoration:underline}}
/* زرُّ التنزيل وشرحُه في سطرٍ واحدٍ يلتفّ على الضيق (D-126) */
.pv{min-width:auto; margin-top:var(--s-3); border:var(--bd-soft); padding:var(--s-3) var(--s-4)}
.pv th,.pv td{text-align:center; padding:var(--s-2); white-space:nowrap;
  font-variant-numeric:tabular-nums}
/* **وترويسةُ الصفّ تُقرأ اسما لا رقما**: يمينَ السطر، وبحبرٍ أثقل */
.pv tbody th[scope=row]{text-align:start; font-size:var(--t-ui); line-height:var(--lh-ui); color:var(--ink);
  font-weight:600; border-bottom:var(--bd-soft)}
.pv td{border-bottom:var(--bd-soft); vertical-align:middle}
/* وعمودُ المجموع يُفصَل بخيطٍ لا بلون: **اللونُ رتبةٌ، والخيطُ حدّ** */
.pv .pv-t{border-inline-start:var(--bd); font-weight:600}
.pv .pv-f th,.pv .pv-f td{border-top:var(--bd); font-weight:600;
  border-bottom:0}
/* وصفُّ الضبط يلتفّ ولا يُقَصّ: أربعةُ حقولٍ وزرٌّ لا تسع في الجوّال */
.pv-form{flex-wrap:wrap; align-items:flex-end; gap:var(--s-3)}
.pv-form .field{flex:1 1 9.5rem; min-width:0}
.pv-form button{flex:none}
/* ‏الخطُّ الزمنيّ للمحفظة (D-212): عمودُ أسماءٍ ثابتٌ ومسارٌ تُرسَم فيه الأشرطةُ بنسبٍ منطقيّة.
   ‏والحدُّ الأدنى للعرض يحفظ يومًا مقروءًا؛ وما ضاق عنه يُمرَّر داخلَ إطاره لا الصفحة. */
.gt-form{flex-wrap:wrap; align-items:flex-end; gap:var(--s-3)}
.gt-form .field{flex:0 1 11rem; min-width:0}
.gt-form button{flex:none}
.gt-wrap{overflow-x:auto; margin-top:var(--s-3)}
.gt{min-inline-size:48rem}
.gt-axis,.gt-row{display:grid; grid-template-columns:11rem 1fr; gap:var(--s-3); align-items:stretch}
.gt-axis{position:sticky; top:0; z-index:1; background:var(--surface); border-bottom:var(--bd); min-height:var(--s-8)}
.gt-axis .gt-track{min-height:calc(var(--s-8) + var(--s-4))}
.gt-tick{position:absolute; bottom:var(--s-1); transform:translateX(50%); white-space:nowrap;
  font-size:var(--t-caption); line-height:var(--lh-caption); color:var(--ink-2); font-weight:600; font-variant-numeric:tabular-nums}
.gt-tick.major{color:var(--ink)}
.gt-tick:first-child{transform:none}
.gt-tick.gt-today{top:0; bottom:auto; color:var(--brand); font-weight:600}
.gt-grp{margin-top:var(--s-4)}
.gt-gh{margin:0 0 var(--s-1); font-size:var(--t-small); line-height:var(--lh-small); font-weight:600; color:var(--ink-2)}
.gt-rows{list-style:none; margin:0; padding:0}
.gt-row{border-bottom:var(--bd-soft); max-width:none}
.gt-lab{display:flex; flex-direction:column; justify-content:center; min-width:0; padding:var(--s-1) 0;
  position:sticky; inset-inline-start:0; z-index:1; background:var(--surface)}
.gt-name{font-size:var(--t-ui); line-height:var(--lh-ui); color:var(--ink); overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
.gt-n{font-size:var(--t-caption); line-height:var(--lh-caption); color:var(--ink-2); font-weight:600}
.gt-track{position:relative; padding:var(--s-1) 0; min-width:0}
.gt-tier{position:relative; height:var(--s-6); margin:var(--s-1) 0}
.gt-bar{position:absolute; top:0; bottom:0; min-inline-size:var(--s-2); display:flex; align-items:center; overflow:hidden;
  border-radius:var(--r-inline); border:1px solid var(--line); background:var(--surface-2); color:var(--ink);
  text-decoration:none; font-size:var(--t-caption); line-height:var(--lh-caption); font-weight:600}
.gt-bar.ok{background:var(--ok-wash); border-color:color-mix(in srgb,var(--ok) 40%,transparent)}
.gt-bar.warn{background:var(--warn-wash); border-color:color-mix(in srgb,var(--warn) 40%,transparent)}
.gt-bar.bad{background:var(--bad-wash); border-color:color-mix(in srgb,var(--bad) 45%,transparent)}
/* ‏المجدولُ يُسحَب أفقيًّا إلى يومٍ آخر (D-225): مقبضٌ ظاهر، والتمريرُ العموديُّ يبقى للإصبع */
.gt-bar[data-move]{cursor:grab; touch-action:pan-y}
.gt-bar.pending{background:color-mix(in srgb,var(--brand) 12%,transparent); border-color:color-mix(in srgb,var(--brand) 45%,transparent)}
.gt-bar.idle{color:var(--ink-2); border-style:dashed}
.gt-bar.open{border-inline-end-style:dashed}
.gt-bar.cut-s{border-start-start-radius:0; border-end-start-radius:0; border-inline-start-width:0}
.gt-bar.cut-e{border-start-end-radius:0; border-end-end-radius:0; border-inline-end-width:0}
.gt-wait{position:absolute; top:0; bottom:0; inset-inline-end:0}
.gt-bar.ok .gt-wait{background:color-mix(in srgb,var(--ok) 26%,transparent)}
.gt-bar.warn .gt-wait{background:color-mix(in srgb,var(--warn) 26%,transparent)}
.gt-bar.bad .gt-wait{background:color-mix(in srgb,var(--bad) 26%,transparent)}
.gt-bar.pending .gt-wait,.gt-bar.idle .gt-wait{background:color-mix(in srgb,var(--ink-3) 22%,transparent)}
.gt-txt{position:relative; padding:0 var(--s-1); overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
.gt-mark{position:absolute; top:50%; width:var(--s-2); height:var(--s-2); transform:translate(50%,-50%) rotate(45deg);
  background:var(--ink-3); pointer-events:none}
.gt-mark.ok{background:var(--ok)}
.gt-mark.warn{background:var(--warn)}
.gt-mark.bad{background:var(--bad)}
.gt-mark.pending{background:var(--brand)}
.gt-now{position:absolute; top:0; bottom:0; width:2px; transform:translateX(50%); background:var(--brand); opacity:.55; pointer-events:none}
.gt-legend{align-items:center}
.gt-key{display:inline-flex; align-items:center; gap:var(--s-1)}
.gt-sw{display:inline-block; width:var(--s-4); height:var(--s-3); border-radius:var(--r-inline); border:1px solid var(--line); background:var(--surface-2)}
.gt-sw.ok{background:var(--ok-wash); border-color:var(--ok)}
.gt-sw.warn{background:var(--warn-wash); border-color:var(--warn)}
.gt-sw.bad{background:var(--bad-wash); border-color:var(--bad)}
.gt-sw.pending{background:color-mix(in srgb,var(--brand) 12%,transparent); border-color:var(--brand)}
.gt-sw.idle{border-style:dashed}
.gt-sw.split{background:color-mix(in srgb,var(--warn) 26%,var(--warn-wash)); border-color:var(--warn)}
.gt-sw.mark{width:var(--s-2); height:var(--s-2); transform:rotate(45deg); background:var(--ink-2); border:0}
@media(hover:hover){.gt-bar:hover{border-color:var(--ink-2)}}
.gt-bar:focus-visible{outline:var(--ring-w) solid var(--ring); outline-offset:1px; z-index:2}
@media${below('md')}{.gt{min-inline-size:40rem} .gt-axis,.gt-row{grid-template-columns:7.5rem 1fr}
  .gt-tier{height:2.75rem} .gt-bar{min-inline-size:2.75rem}}
.nm{font-weight:600}
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
  color:var(--ink); font-size:var(--t-input); line-height:var(--lh-input);
  padding:var(--s-2) var(--s-3); border-radius:var(--r-control); background:var(--surface)}
.sub{color:var(--ink-2); font-size:var(--t-small); margin-top:var(--s-1); max-width:var(--measure); line-height:var(--lh-small)}
.num,.money{font-variant-numeric:tabular-nums}
/* المبلغُ نصٌّ لاتينيّ داخل عربيّ: بلا عزلٍ ينقلب رمزُ العملة إلى آخره */
.money{direction:ltr; unicode-bidi:isolate; display:inline-block}

/* الحالة: لونٌ **ورمزٌ ونصّ** — لا لون وحده */
.st{display:inline-flex; align-items:center; gap:var(--s-1); padding:var(--s-0) var(--s-2); border-radius:var(--r-pill);
  font-size:var(--t-caption); line-height:var(--lh-caption); font-weight:600; border:var(--bd-clear); white-space:nowrap}
/* الرمزُ مرسومٌ لا حرفٌ من خطّ النظام (D-154). **واسمُه له وحدَه** (D-183): كان
   «.g» — وهو صنفُ الزرّ الشبحيّ نفسُه، فلبس الرمزُ أرضَ الزرّ البيضاءَ وحبرَه
   داخل كلّ حبّةٍ ملوّنة (‏٩٦ شارةً في الرئيسيّة). والرمزُ بلا أرضٍ ولا حدّ:
   لونُه «currentColor» من حبّته. **ومن «icon()» نفسِها** (D-185): شبكةُ ‏٢٤ وثخانةُ ‏١٫٨
   مرسومةً ‏١٤px داخل الشارة (خطّة التصميم 3.4) */
.st-ic{display:inline-flex}
.st-ic svg{width:var(--icon-xs); height:var(--icon-xs); display:block}
.st.ok{color:var(--ok); background:var(--ok-wash); border-color:color-mix(in srgb,var(--ok) 24%,transparent)}
.st.warn{color:var(--warn); background:var(--warn-wash); border-color:color-mix(in srgb,var(--warn) 28%,transparent)}
.st.bad{color:var(--bad); background:var(--bad-wash); border-color:color-mix(in srgb,var(--bad) 28%,transparent)}
/* ‏والمحايدان بحبر «--ink-2» لا «--ink-3» (D-185): لا نصَّ تحت ‏١٥px بالحبر الثالث (خطّة التصميم 4.3).
   **ويفترقان بالرمز لا باللون** (7.2): «pending» ينتظر ساعةً، و«idle» لم يبدأ دائرةً متقطّعة */
.st.idle,.st.pending{color:var(--ink-2); background:var(--surface-2); border-color:var(--line)}
.chip{display:inline-block; padding:var(--s-0) var(--s-2); border-radius:var(--r-pill); font-size:var(--t-caption);
  line-height:var(--lh-caption); font-weight:600;
  background:var(--surface-2); border:var(--bd-soft); color:var(--ink-2);
  /* والفاصلُ في نهاية السطر لا في يساره (D-167): كان «margin:… 0 0 var(--s-1)» —
     يسارٌ هو نهايةُ السطر في العربيّة مصادفةً، وبدايتُه في حاويةٍ لاتينيّة */
  margin:var(--s-0) 0 0; margin-inline-end:var(--s-1)}
/* **والرقاقةُ اللاتينيّةُ تكتب اتّجاهَها بنفسها** («.mono» ‏ltr)، والجانبُ المنطقيُّ
   يُحَلّ على العنصر لا على أبيه: نهايتُها هي يمينُها، **ونهايةُ السطر العربيّ الذي
   تقع فيه بدايتُها هي**. قِيس ذلك ببصمة الأنماط المحسوبة: ‏٤٣ رقاقةً انتقل فاصلُها
   إلى الجهة الأخرى بالسطر أعلاه وحده (D-167) — فتُعطى بدايتَها صراحةً. */
.chip.mono{margin-inline:var(--s-1) 0; font-size:var(--t-code); line-height:var(--lh-code); font-weight:400}
/* **ورقاقةٌ تُلمَس ليست رقاقةً تُقرأ** (D-105).

   قِيست رقاقةُ رابط الرحلة ‏٥١×‏٢٥ عند ‏٤٣٠px، **وهدفٌ دون ‏٤٤ يُصاب
   بالمصادفة لا بالقصد**. والقياسُ لا يُكبَّر — الرقاقةُ تبقى بحجمها،
   **ويُمدّ هدفُ اللمس تحتها بعنصرٍ زائفٍ لا يُزيح شيئا**. فما يُرى
   يبقى، وما يُلمَس يكفي. */
a.chip{position:relative}
a.chip::after{content:''; position:absolute; inset:50% 0 auto;
  height:var(--tap); transform:translateY(-50%)}

/* الاستحقاق: مقياس مقدار — تدرّج هيئةٍ واحدة، والرقم بلون النصّ */
.worth{display:flex; align-items:center; gap:var(--s-2); min-width:6.5rem}
.worth .track{flex:1; height:var(--s-1); background:var(--surface-3); border-radius:var(--r-pill); overflow:hidden}
.worth .fill{display:block; height:100%; border-radius:var(--r-pill)}
.worth .val{font-variant-numeric:tabular-nums; font-size:var(--t-small); line-height:var(--lh-small); color:var(--ink-2); min-width:var(--s-8)}

/* ══ الزرّ — عائلةٌ واحدةٌ بادئتُها «btn» (خطّة التصميم 7.1 · D-189) ══════════════
   كانت الدرجاتُ أصنافًا من حرفٍ واحد («.p» و«.g» و«.d» و«.sm»)، و«.g» اصطدم برمز الحال
   مرّةً فلبس الرمزُ أرضَ الزرّ (D-183). فصارت عائلةً تُقرأ، ودالّتُها «button()» في
   «components/button.ts». ارتفاعُ الهدف ‏٤٤ لا ‏٣١: WCAG 2.5.5 وApple HIG — والحشوُ للتوسيط،
   و«min-height» هي التي تضمن، فنصٌّ قصيرٌ لا يُقزّم الزرّ. */
button,.btn{font:inherit; font-size:var(--t-ui); line-height:var(--lh-ui); font-weight:600; cursor:pointer;
  border:var(--bd-clear); padding:var(--s-2) var(--s-4); min-height:var(--tap);
  min-width:var(--tap); box-sizing:border-box; display:inline-flex; align-items:center;
  justify-content:center; gap:var(--s-2); text-decoration:none; white-space:nowrap;
  transition:background var(--dur-1) var(--ease), border-color var(--dur-1) var(--ease), box-shadow var(--dur-1) var(--ease);
  border-radius:var(--r-control)}
/* ‏الأوّليّ: فعلٌ واحدٌ في كلّ منطقة، بتمريرٍ وضغطٍ مسمّيين (D-187) */
.btn-primary{background:var(--brand); color:var(--on-brand)}
.btn-primary:active:not(:disabled){background:var(--brand-press)}
/* ‏والثانويُّ بحدٍّ وظيفيٍّ يبلغ ‏3:1 على السطح (WCAG 1.4.11): كان ‏١٫٧٦:١ فلا يُرى زرًّا */
.btn-secondary{background:var(--surface); color:var(--ink); border-color:var(--field); box-shadow:none}
@media(hover:hover){.btn-secondary:hover{background:var(--hover)}}
.btn-secondary:active:not(:disabled){background:var(--press)}
/* ‏والهادئُ رابطٌ بهيئة زرّ: بلا أرضٍ ولا حدّ، حبرُ الرابط **وخطٌّ تحته دائمًا** — «--link» و
   «--ink-2» ليلًا متقاربان ضوءًا (‏١٫٠٨:١)، فاللونُ وحدَه لا يكفي؛ والخطُّ يثخن عند التمرير */
.btn-quiet{background:transparent; border-color:transparent; color:var(--link);
  text-decoration:underline; text-decoration-thickness:var(--ul); text-underline-offset:var(--ul-off)}
@media(hover:hover){.btn-quiet:hover{text-decoration-thickness:var(--stroke)}}
/* ‏والخطِرُ ثانويٌّ بحبر «--bad» وحدِّه — والمصمتُ الأحمرُ لحوار ما لا رجعةَ فيه وحدَه */
.btn-danger{background:var(--surface); color:var(--bad); border-color:color-mix(in srgb,var(--bad) 34%,transparent)}
@media(hover:hover){.btn-danger:hover{background:var(--bad-wash)}}
/* ‏وزرُّ الأيقونة مربّعُ الهدف نفسِه، واسمُه في «aria-label» وتلميحُه في «title» (3.4) */
.btn-icon{padding:0; width:var(--tap); background:transparent; color:var(--ink-2)}
@media(hover:hover){.btn-icon:hover{background:var(--hover); color:var(--ink)}}
/* «الصغير» أضيقُ حشوا لا أقصرُ قامة ولا أصغرُ حرفًا: زرٌّ في جدولٍ يزدحم عرضا لا
   طولا، وتقصيرُه يُسقطه دون حدّ الهدف — وهو ما كان يقع. **وحرفُه حرفُ الأزرار** (D-185). */
.btn-sm{padding:var(--s-1) var(--s-3)}
/* ‏والرمزُ في الزرّ ‏٢٠ (خطّة التصميم 3.4)، وفي سهم العودة ‏١٦ بجوار نصٍّ ‏١٥، وفي الرقاقة ‏١٤.
   **وSVG بلا قياسٍ في حاويةٍ مرنة يُرسَم ‏٠×‏٠** (D-167): هكذا غاب سهمُ «افتح في Drive» مرّة */
.btn>svg,.btn-icon svg{width:var(--icon-md); height:var(--icon-md); flex:none}
/* ‏**والاسمُ ليس أيقونة** (مراجعة D-196): «a>svg» كان يطابق «.wordmark» في بابِ اللوحة فيسحقه ‏١٦×١٦ —
   مسارٌ نسبتُه ‏٣٫٢:١ يُرسَم شريطًا ارتفاعُه ‏٥px بين ‏600 و‏899؛ ويقيس «audit_mobile» نسبةَ كلّ اسمٍ مرسوم */
nav.back a>svg:not(.wordmark){width:var(--icon-sm); height:var(--icon-sm); flex:none}
a.chip>svg{width:var(--icon-xs); height:var(--icon-xs); flex:none; vertical-align:-.125em}
/* ── المعطّل: «aria-disabled» يبقى في ترتيب التركيز فيُقرأ سببُه (خطّة التصميم 7.1) ──
   و«disabled» الأصليُّ للنماذج التي لم تُنقَل بعد. وكلاهما نصفُ شفافيّة، والسببُ نصٌّ تحته
   مربوطٌ بـ«aria-describedby» — زرٌّ رماديٌّ بلا سببٍ يُضغَط مرّاتٍ ثمّ يُترَك. **والضغطةُ بلا
   إزاحة**: كانت «translateY(1px)» تهزّ الصفَّ كلَّه ببكسل، والأثرُ لونُ الضغط وحدَه. */
button:disabled,.btn[aria-disabled="true"]:not([aria-busy="true"]){opacity:.5; cursor:not-allowed}
/* ‏والمشغولُ لا يبهت: الدوّارةُ والنصُّ يقولان حالَه، ولا يُضغَط ثانيةً */
.btn[aria-busy="true"]{cursor:progress}
.btn-why{display:block; margin-top:var(--s-1); font-size:var(--t-small); line-height:var(--lh-small); color:var(--ink-2)}
/* ‏وسهمُ المسار في نصٍّ يُقرأ (D-185): «←» و«→» ليسا في Plex، فيُرسَمان بقدر حرفهما
   ويهبطان إلى منطقة الأسنان العربيّة — ‏-.2em قِيست على «Credentials ← Create» */
.arw{display:inline-block; vertical-align:-.2em; line-height:0}
.arw svg{width:1em; height:1em; display:block}

/* ── المشغول: النصُّ يبقى والدوّارةُ ‏١٦ تُضاف، والعرضُ ثابت ─────────────────────────
   كان النصُّ يُستبدَل بـ«جارٍ…»، **فيضيع ما كان مكتوبا** — ويسأل الضاغطُ نفسَه ماذا ضغط،
   والنداءُ مدفوع. والحالُ في السِّمة («aria-busy» من الخادم، و«data-busy-on» يضعها السكربت
   على الزرّ المضغوط وحدَه) لا في صنف. **ومع تقليل الحركة لا تدور**: حلقةٌ ثابتةٌ والنصُّ يقول. */
button[data-busy-on],.btn[aria-busy="true"]{position:relative}
button[data-busy-on]::after,.btn[aria-busy="true"]::after{content:''; width:var(--icon-sm); height:var(--icon-sm); flex:none;
  border-radius:50%; border:var(--stroke) solid currentColor; border-top-color:transparent;
  animation:spin .7s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){
  button[data-busy-on]::after,.btn[aria-busy="true"]::after{animation:none; border-top-color:currentColor; opacity:.4}
}
form.inline{display:inline; margin:0}

.field{display:flex; flex-direction:column; gap:var(--s-1)}
/* اللصيقةُ نمطُ «ui» بحبر المتن (D-185 · خطّة التصميم 7.6): كانت ‏١٢٫٥ خافتةً فوق
   حقلٍ ‏١٥٫٥ — تُقرأ هامشًا، وهي سؤالُ الحقل */
label{font-size:var(--t-ui); line-height:var(--lh-ui); font-weight:600; color:var(--ink)}
input[type=number],input[type=password],input[type=text],input[type=datetime-local],
input:not([type]),select,textarea{
  background:var(--surface); border:var(--bd-field); border-radius:var(--r-control);
  color:var(--ink); padding:var(--s-2) var(--s-3); font:inherit; font-size:var(--t-input);
  line-height:var(--lh-input); font-weight:400; min-height:var(--tap); box-sizing:border-box;
  transition:border-color var(--dur-1) var(--ease), box-shadow var(--dur-1) var(--ease)}
input:focus,select:focus,textarea:focus{border-color:var(--focus); box-shadow:0 0 0 var(--ring-w) var(--ring); outline:none}
/* ── الحقل: لصيقةٌ ثمّ تلميحٌ ثمّ الحقلُ ثمّ الخطأ (خطّة التصميم 7.6 · D-189) ─────────────
   التلميحُ فوق الحقل (من يرى الحقلَ يكتب ولا ينظر تحته)، والخطأُ تحته برمزٍ ‏١٦ ونصٍّ بنمط
   «small» الثخين بحبر «--bad» — والحقلُ نفسُه بحدٍّ أحمر، **فلا يُقال الخطأُ باللون وحدَه**.
   والاختياريُّ «(اختياريّ)» بحبر «--ink-2» ووزن ‏٤٠٠، ولا نجمةَ للإلزاميّ. ودالّتُه «field()». */
.field-opt{font-weight:400; color:var(--ink-2)}
.field-hint{margin:0; font-size:var(--t-small); line-height:var(--lh-small); color:var(--ink-2)}
.field-err{display:flex; align-items:flex-start; gap:var(--s-1); margin:0; font-size:var(--t-small);
  line-height:var(--lh-small); font-weight:600; color:var(--bad)}
.field-err-ic{flex:none; display:inline-flex; padding-top:var(--s-1)}
.field-err-ic svg{width:var(--icon-sm); height:var(--icon-sm); display:block}
input[aria-invalid="true"],select[aria-invalid="true"],textarea[aria-invalid="true"]{border-color:var(--bad)}
/* ‏**والعرضُ بطول ما يُكتب لا بالبكسل** (7.6): كانت ‏٩٠ و‏١٠٠ و‏١١٠ و‏١٣٠ و‏١٤٠ و‏١٧٠ و‏١٩٠ و‏٢٢٠px في
   «style=""». والمحرفُ «ch» عرضُ الرقم «0» بخطّ الحقل، و«--s-8» حشوُ الجانبين وسهمُ الرقم */
/* ‏والرقمُ بعرض «w-s» ما لم يُعطَ غيرَه — و«:where» يُسقط خصوصيّتَه فيغلبه صنفُ العرض */
:where(input[type=number]){width:calc(10ch + var(--s-8))}
.w-xs{width:calc(5ch + var(--s-8))}
.w-s{width:calc(10ch + var(--s-8))}
.w-m{width:calc(20ch + var(--s-8))}
.w-full{width:100%}
/* ── طولُ السطر ───────────────────────────────────────────────────────
   45 إلى 75 محرفا. وقيست كتلٌ عند 135 — ضعفُ الحدّ. والعينُ ترتدّ من
   آخر السطر إلى أوّل التالي، فتفقد موضعَها كلّما طال.

   والتقييدُ بأقصى عرضٍ لا بعرضٍ ثابت: الكتلةُ تضيق مع الشاشة ولا تتمدّد
   معها، فالجوّالُ سليمٌ أصلا والشاشةُ العريضة هي التي تُفسد. */
/* و«pretty» تمنع الحرفَ اليتيمَ في آخر الفقرة: كلمةٌ وحدها في سطرٍ
   أخير تُقرأ سطرا ناقصا. وهي تعمل على المتن حيث «balance» لا تعمل —
   تلك للأسطر القليلة، وهذه لِما طال. */
p,li,.sub,.ch-note,.lede-note,.hint,.draft-why{max-width:var(--measure);
  text-wrap:pretty}

.row{display:flex; gap:var(--s-3); align-items:flex-end; flex-wrap:wrap}
/* أفعالُ الصفّ تُرصّ على الحافّة الخارجيّة (D-136): صفٌّ بزرٍّ وصفٌّ بزرّين
   يتّفقان على موضع «افتح في Drive»، فلا يقفز العمودُ بين الصفوف. */
.row.acts{gap:var(--s-2); justify-content:flex-end; align-items:center}
/* ملاحظةُ منتقي النموذج لا تحجز سطرًا وهي فارغة (D-137): كانت تُنزل
   «حفظ» ‏٢٠px تحت «حدّث» في صفّ التوجيه. */
.mp-note:empty{display:none}

/* ── الحالةُ الفارغة (خطّة التصميم 7.7 · D-189) ──────────────────────────────────────
   عنوانٌ بنمط «h3» يقول ما هنا، ثمّ جملةٌ بنمط «small» بحبر «--ink-2»، ثمّ فعلٌ واحد — والكتلةُ
   في الوسط بعرضٍ أقصى «--measure». ودالّتُها «emptyState()»، والأيقونةُ فوقها ‏٢٤ إن وُجدت. */
.empty{padding:var(--s-8) var(--s-5); text-align:center; border:var(--bd-soft);
  background:transparent; border-radius:var(--r-card)}
.empty-t{margin:0 auto var(--s-1); font-size:var(--t-h3); line-height:var(--lh-h3); font-weight:600; color:var(--ink)}
.empty-p{margin:0 auto var(--s-3); font-size:var(--t-small); color:var(--ink-2); line-height:var(--lh-small)}
.empty-echo{display:block; width:10rem; height:6rem; margin:0 auto var(--s-6); color:var(--ink-3)}
.empty-echo svg{width:100%; height:100%; display:block}
.empty-ic{display:inline-flex; margin-bottom:var(--s-2); color:var(--ink-3)}
.empty-ic svg{width:var(--icon-lg); height:var(--icon-lg); display:block}

.split{display:flex; gap:var(--s-4); align-items:center; justify-content:space-between; flex-wrap:wrap}
.split p{margin:0; font-size:var(--t-small); color:var(--ink-2); max-width:var(--measure); line-height:var(--lh-small)}
hr{border:0; border-top:var(--bd-soft); margin:var(--s-4) 0}
footer{margin-top:var(--s-6); padding-top:var(--s-4); border-top:var(--bd-soft);
  color:var(--ink-2); font-size:var(--t-small); line-height:var(--lh-small); display:flex; justify-content:space-between; flex-wrap:wrap; gap:var(--s-2)}

/* ── ما ينتظرك ─────────────────────────────────────────────── */
.todo{list-style:none; margin:0; padding:0; display:flex; flex-direction:column}
.todo li{display:flex; align-items:center; gap:var(--s-2); font-size:var(--t-ui); line-height:var(--lh-ui);
  border-bottom:var(--bd-soft); padding:var(--s-1) var(--s-0)}
.todo li:last-child{border-bottom:0}
.todo .dot{width:var(--dot); height:var(--dot); border-radius:50%; flex:none; background:var(--ink-3)}
/* سجلُّ صحّة الحساب يعيد قائمةَ «ما ينتظرك» بلا زرّ (D-129) */
.todo.health{margin-top:var(--s-2)}
.todo .dot.warn{background:var(--warn)} .todo .dot.bad{background:var(--bad)}
.todo .dot.ok{background:var(--ok)}
.todo a,.todo form{margin-inline-start:auto}
/* أزرارُ الصفوف عمودٌ واحدٌ لا حافّةٌ مسنّنة (D-136): عرضٌ أدنى واحد،
   والأطولُ يتجاوزه بحقّه. */
.todo>li>a.btn,.todo>li>form .btn{background:transparent; border-color:transparent;
  box-shadow:none; color:var(--link); min-width:var(--tap); padding-inline:var(--s-3); font-weight:600;
  margin-block:-1px;
  /* ‏زرٌّ هادئ: حبرُ الرابط وخطٌّ تحته بلونه (D-149 ثمّ D-187) — كان الخطُّ نحاسيًّا، فيُعدّ
     كلُّ زرٍّ في «ما ينتظرك» موضعًا (أحدَ عشرَ في الرئيسيّة) */
  text-decoration:underline; text-underline-offset:var(--ul-off); text-decoration-thickness:var(--ul)}

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
ul.plain li{margin:0 0 var(--s-2); font-size:var(--t-small); line-height:var(--lh-small)}
ul.plain li:last-child{margin-bottom:0}

/* ── الرسم ─────────────────────────────────────────────────── */
.chart{margin-top:var(--s-1)}
/* **الرسمُ يتمدّد والحرفُ لا** (D-153): المسارُ في SVG بحدٍّ لا يتمدّد،
   والأرقامُ والتواريخُ ونقطةُ الذروة HTML فوقه بمواضعَ مئويّة — فالحرفُ
   لصيقةٌ ‏١٣px على كلّ عرض. والصندوقُ لاتينيُّ الاتّجاه لأنّ مواضعَه من إحداثيّات
   الرسم (يسارُه بدايتُه). */
.chart .plot{position:relative; direction:ltr; height:10.5rem}
.chart svg{display:block; width:100%; height:100%}
.chart .axis{position:absolute; font-size:var(--t-caption); line-height:var(--lh-caption); font-weight:600;
  color:var(--ink-2); font-variant-numeric:tabular-nums; white-space:nowrap; unicode-bidi:isolate}
.chart .axis-y{transform:translateY(-50%)}
.chart .axis-x{transform:translateY(-100%)}
.chart .axis-x.end{text-align:end}
.chart .peak{position:absolute; width:var(--s-2); height:var(--s-2); border-radius:50%; background:var(--surface);
  border:var(--stroke) solid var(--brand); transform:translate(-50%,-50%)}
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
.stop:not(:last-child)::before{content:''; position:absolute; top:calc(var(--s-8) + var(--stroke));
  bottom:calc(-1 * var(--s-4)); inset-inline-start:var(--s-4); width:1px;
  background:var(--line)}
.stop-mark{flex:none; width:var(--s-8); height:var(--s-8); border-radius:50%; z-index:1;
  display:grid; place-items:center; background:var(--surface); color:var(--ink-3);
  border:var(--bd); box-shadow:0 0 0 var(--ring-w) var(--bg)}
.stop-mark svg{width:var(--icon-sm); height:var(--icon-sm); display:block}
/* **والحالُ لونٌ ورمزٌ ونصّ** (D-043): اللونُ على الحلقة، والنصُّ في
   العنوان («لم تنجح»)، والرمزُ نوعُ المحطّة. */
.stop.done .stop-mark{color:var(--brand); border-color:color-mix(in srgb,var(--brand) 42%,transparent)}
.stop.failed .stop-mark{color:var(--bad); border-color:color-mix(in srgb,var(--bad) 42%,transparent)}
.stop.pending .stop-mark{color:var(--warn); border-color:color-mix(in srgb,var(--warn) 42%,transparent);
  border-style:dashed}
.stop-body{min-width:0; padding-top:var(--s-1)}
.stop-t{display:block; font-size:var(--t-ui); font-weight:600; line-height:var(--lh-ui)}
.stop-d{margin:var(--s-1) 0 0; font-size:var(--t-small); color:var(--ink-2);
  line-height:var(--lh-small); max-width:var(--measure)}
.stop-meta{display:flex; align-items:center; gap:var(--s-2); flex-wrap:wrap; margin-top:var(--s-2)}
/* ما تغيّر قبل الاعتماد (D-128): مطويٌّ في ذيل البطاقة، والفرقُ سطرًا سطرًا
   بعلامةٍ قبل اللون — لونُ الحالة يُقرأ على البطاقة لا على غسيله */
.diff{margin-top:var(--s-2); border-top:var(--bd-soft); padding-top:var(--s-1)}
.diff>summary{font-size:var(--t-small); line-height:var(--lh-small); color:var(--ink-2); cursor:pointer; gap:var(--s-2)}
.diff-body{margin:var(--s-2) 0 0; font:inherit; font-size:var(--t-small); line-height:var(--lh-small);
  white-space:pre-wrap; overflow-wrap:anywhere; max-width:var(--measure)}
.dl{display:block; padding:0 var(--s-1); border-radius:var(--r-inline)}
.dl.del{color:var(--bad); text-decoration:line-through; text-decoration-thickness:var(--ul)}
.dl.add{color:var(--ok)}
.dl.same{color:var(--ink-2)}
/* رابطُ المحطّة إلى موضعها — آخرَ السطر، ويلتفّ مع الضيق (D-126) */
.stop-go{margin-inline-start:auto}
/* أمرُ wrangler في صفّ المهمّة: حقلٌ يُقرأ ويُنسَخ، لاتينيٌّ معزول (D-126) */
.cmd{margin-top:var(--s-2)}
.cmd-text{flex:1 1 14rem; min-width:0; direction:ltr; text-align:start; font-size:var(--t-input); line-height:var(--lh-input);
  padding:var(--s-2) var(--s-3); border:var(--bd); border-radius:var(--r-control);
  background:var(--surface-2); color:var(--ink); resize:none; white-space:pre; overflow-x:auto}

/* ── الأعمدةُ الأفقيّة (D-103) ────────────────────────────────────────
   ثلاثةُ أعمدةٍ ثابتةِ الموضع: الاسمُ والمقياسُ والرقم. **والعينُ تمسح
   عمودا لا شبكة** — وهي قاعدةُ لوح المزوّدين نفسُها (D-082).

   والاسمُ بعرضٍ أدنى ثابت: أسماءٌ متفاوتةُ الطول تجعل المقاييسَ تبدأ من
   مواضعَ مختلفة، **فتُقارَن أطوالٌ لا تبدأ من خطٍّ واحد**. */
.bars{display:flex; flex-direction:column; gap:var(--s-2)}
.bar-row{display:flex; align-items:center; gap:var(--s-3)}
.bar-name{flex:none; min-width:5.5rem; font-size:var(--t-small); line-height:var(--lh-small); color:var(--ink-2);
  overflow-wrap:anywhere}
.bar-track{flex:1; height:var(--s-3); background:var(--surface-3); border-radius:var(--r-pill);
  overflow:hidden; min-width:var(--s-10)}
/* **مقياسُ مقدارٍ لا تصنيف**: هيئةٌ واحدةٌ تتدرّج بالطول، ولا لونَ حالةٍ
   فيها — الأحمرُ حالةٌ لا مقدار (D-043). والأعمدةُ بحبر «--ink-2» (خطّة التصميم 7.10). */
.bar-fill{display:block; height:100%; border-radius:var(--r-pill); background:var(--ink-2);
  transition:width var(--dur-3) var(--ease-out)}
/* **والأكبرُ وحدَه يُميَّز**: ندرةٌ تصنع مرتبة — بالحبر الأوّل لا بالذهب (D-187): لا
   نحاسَ في أشرطة الرسم، فعمودٌ نحاسيٌّ يُقرأ رقمًا بطلًا ثانيًا في الشاشة. */
.bar-fill.top{background:var(--ink)}
/* أسبوعٌ قِيس بعضُه — عمودُه مخطَّط، والرقمُ بجانبه يقول كم (D-127) */
.bar-fill.part{background:repeating-linear-gradient(135deg,var(--ink-2) 0 6px,color-mix(in srgb,var(--ink-2) 45%,transparent) 6px 12px)}
.history{margin-bottom:var(--s-4)}
/* ‏رابطُ الأسبوع رابطٌ: بحبره وخطٍّ تحته (D-183) — كان بلون الحبر بلا خطّ،
   فلا يفرّقه عن اسم أسبوعٍ لا يُفتَح إلّا المؤشّر */
.history .bar-name{color:var(--link); font-variant-numeric:tabular-nums;
  text-decoration:underline; text-decoration-thickness:var(--ul); text-underline-offset:var(--ul-off)}
.bar-val{flex:none; min-width:4.5rem; text-align:end; font-size:var(--t-small); line-height:var(--lh-small);
  color:var(--ink); font-variant-numeric:tabular-nums}
@media${below('sm')}{.bar-name{min-width:4rem}}

.legend{display:flex; gap:var(--s-3); flex-wrap:wrap; margin-top:var(--s-3); font-size:var(--t-small); line-height:var(--lh-small); color:var(--ink-2)}
.legend b{color:var(--ink); font-weight:600; font-variant-numeric:tabular-nums;
  direction:ltr; unicode-bidi:isolate; display:inline-block}

/* ── القنوات ───────────────────────────────────────────────── */
/* صفُّ تمهيدٍ رفيع بدل بطاقةٍ كاملة: الشرحُ يصحب القسم ولا يزاحمه */
.lede-row{display:flex; align-items:baseline; gap:var(--s-3); flex-wrap:wrap; margin-bottom:var(--s-3)}
.lede-note{font-size:var(--t-small); color:var(--ink-2); line-height:var(--lh-small); flex-basis:100%}
@media${atLeast('lg')}{.lede-note{flex-basis:auto; text-align:end}}

.ch{display:flex; flex-direction:column; gap:var(--s-3); padding:var(--s-4); position:relative}
/* ‏البطاقةُ كلُّها بابُ شاشة المنصّة (خطّة التصميم 5.7 · D-205): الاسمُ يمدّ نفسَه عليها، والفعلُ فوقه */
.ch-go::after{content:''; position:absolute; inset:0}
.ch-go:focus-visible{outline:none}
.ch-go:focus-visible::after{outline:var(--stroke) solid var(--focus); outline-offset:var(--stroke)}
.ch-foot,.ch-acc{position:relative; z-index:1}
.ch-top{display:flex; align-items:center; gap:var(--s-3)}
.ch-logo{width:var(--s-8); height:var(--s-8); border-radius:var(--r-control); flex:none; display:grid; place-items:center;
  background:var(--surface-2); border:var(--bd); color:var(--ink-2)}
.ch-logo svg{width:50%; height:50%; display:block}
.ch-name{font-weight:600; font-size:var(--t-h3); line-height:var(--lh-h3)}
.ch-name a{color:inherit; text-decoration:underline; text-underline-offset:var(--ul-off); text-decoration-thickness:var(--ul)}
@media(hover:hover){.ch-name a:hover{color:var(--brand); text-decoration:underline; text-underline-offset:var(--ul-off)}}
.ch-name span{display:block; font-size:var(--t-small); line-height:var(--lh-small); font-weight:400; color:var(--ink-2)}
.ch-note{font-size:var(--t-small); color:var(--ink-2); line-height:var(--lh-small); margin:0}
/* ‏والصفُّ يلتفّ (D-185): الاسمُ والنوعُ والحالُ والوقتُ لا تسع ‏٣٢٠ بحرف ‏١٤، وكان الوقتُ
   ينضغط إلى ‏٢٢px فيفيض حرفُه خارج الصفحة */
.ch-acc{display:flex; align-items:center; flex-wrap:wrap; gap:var(--s-2); padding:var(--s-2) var(--s-3); border-radius:var(--r-control);
  background:var(--surface-2); border:var(--bd-soft); font-size:var(--t-small); line-height:var(--lh-small)}
.ch-acc .who{font-weight:600}
/* نصٌّ عربيّ خافت — ولا يُعطى صنفَ mono: خطٌّ لاتينيّ باتّجاه LTR يفكّك
   الحروف العربيّة فتُقرأ «سا ئقا». علّةٌ تُرى ولا يكشفها اختبار. */
/* والوقتُ والبياناتُ الوصفيّةُ نمطُ «small» لا لصيقة (D-185): جملةٌ تُقرأ لا علامةٌ تُمسَح */
.ago{font-size:var(--t-small); line-height:var(--lh-small); color:var(--ink-2)}
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
.guide{margin-top:var(--s-4); border:var(--bd); overflow:clip; position:relative}
/* ‏**شريطُ أفعال المساعد ثابتٌ في أسفله** (T4 · خطّة التصميم 5.4 · D-218): «احفظ» و«افحص الزوج» كانا تحت شاشاتٍ من
   الشرح على الهاتف. والحاويةُ «clip» لا «hidden»: الثانيةُ تجعلها حاويةَ تمريرٍ فلا يلتصق ما فيها */
.guide .wiz-bar{position:sticky; bottom:0; z-index:2; background:var(--surface-2);
  padding-block:var(--s-3); border-top:var(--bd)}
/* ‏وكانت على حافّته رافدةٌ نحاسيّة («::before»)، فسقطت (D-187): حافّةٌ ملوّنةٌ خامسة،
   ونحاسٌ على حدّ بطاقة. والدليلُ يفصله سطحُه الداخليّ وحدُّه. */
.guide>summary{cursor:pointer; list-style:none; display:flex; align-items:center;
  gap:var(--s-3); padding:var(--s-3) var(--s-5); min-height:calc(var(--tap) + var(--s-3))}
.guide>summary::-webkit-details-marker{display:none}
@media(hover:hover){.guide>summary:hover{background:var(--surface-3)}}
.guide .g-ic{flex:none; width:var(--s-8); height:var(--s-8); border-radius:var(--r-control); display:grid; place-items:center;
  background:var(--surface); color:var(--brand);
  border:1px solid color-mix(in srgb,var(--brand) 26%,transparent)}
.guide .g-ic svg{width:var(--icon-sm); height:var(--icon-sm); display:block}
.guide .g-t{min-width:0}
.guide .g-t b{display:block; font-size:var(--t-ui); line-height:var(--lh-ui); font-weight:600}
.guide .g-t span{display:block; font-size:var(--t-small); color:var(--ink-2); line-height:var(--lh-small);
  max-width:var(--measure)}
.guide-body{padding:var(--s-2) var(--s-5) var(--s-5); border-top:var(--bd-soft)}
/* ‏ودليلٌ بلا رأسٍ مطويّ (معالجُ الضبط فوقه): لا خيطَ فوق جسده — كان «style» في الوسم */
.guide-body:first-child{border-top:0}

/* رابطُ البوّابة: زرٌّ لا رابطٌ في جملة. هو **أوّلُ فعلٍ** في الدليل،
   ورابطٌ مدفونٌ في سطرٍ يُقرأ بعد الخطوات لا قبلها. */
.portal{display:inline-flex; align-items:center; gap:var(--s-2); margin:var(--s-4) 0 var(--s-5);
  font-size:var(--t-ui); line-height:var(--lh-ui); font-weight:600}
.portal svg{width:var(--icon-sm); height:var(--icon-sm); flex:none}

/* ── الخطوات ─────────────────────────────────────────────────────────
   رقمٌ في دائرةٍ لا نقطةٌ في قائمة: الخطواتُ تُنفَّذ بالترتيب، وتُغادَر
   الشاشةُ بينها إلى بوّابة المنصّة — فالعينُ تحتاج موضعا تعود إليه.
   ولكلّ خطوةٍ سببُها: «افعل» وحدها تُنفَّذ ولا تُفهَم، فلا تُصحَّح إن أخطأت.

   وخيطٌ يصل الدوائر: ثلاثُ دوائرَ متفرّقة تُقرأ ثلاثةَ أشياء، وموصولةً
   تُقرأ **مسارا واحدا له أوّلٌ وآخر**. */
ol.steps{margin:0 0 var(--s-5); padding:0; list-style:none;
  display:flex; flex-direction:column; gap:var(--s-4); position:relative}
ol.steps li{display:flex; gap:var(--s-3); align-items:flex-start; position:relative;
  font-size:var(--t-small); line-height:var(--lh-small); color:var(--ink-2)}
/* الخيطُ من دائرةٍ إلى التي تليها — ولا يُرسَم بعد الأخيرة */
ol.steps li:not(:last-child)::before{content:''; position:absolute; top:calc(var(--s-6) + var(--stroke)); bottom:calc(-1 * var(--s-4));
  inset-inline-start:var(--s-3); width:1px; background:var(--line)}
ol.steps .step-n{flex:none; width:var(--s-6); height:var(--s-6); border-radius:50%; margin-top:0; z-index:1;
  display:grid; place-items:center; background:var(--surface); color:var(--brand);
  font-size:var(--t-caption); line-height:var(--lh-caption); font-weight:600; font-variant-numeric:tabular-nums;
  border:1px solid color-mix(in srgb,var(--brand) 40%,transparent);
  box-shadow:0 0 0 var(--ring-w) var(--surface-2)}
ol.steps .body{min-width:0; max-width:var(--measure); padding-top:var(--s-0)}
ol.steps .what{display:block; font-weight:600; color:var(--ink); margin-bottom:var(--s-0);
  font-size:var(--t-ui); line-height:var(--lh-ui)}
ol.steps .why{display:block; color:var(--ink-2)}

/* ── قائمةُ المزوّدين: صفٌّ يفتح لوحَه ────────────────────────────────
   كانت ستَّ بطاقاتٍ في شبكةٍ من عمودين، كلُّ بطاقةٍ سبعةُ شؤون. **والعينُ
   لا تمسح شبكةً كما تمسح عمودا**: كلُّ بطاقةٍ تُقرأ وحدةً قائمةً بذاتها،
   فمقارنةُ ستٍّ تحتاج ستَّ قراءات.

   فصار صفّا: أربعةُ أعمدةٍ ثابتةِ الموضع — الاسمُ والنموذجُ وإنفاقُ اليوم
   والحال — تُقرأ رأسيّا بمسحةٍ واحدة. **وما عداها في لوحٍ ينفتح في
   مكانه**، فلا ينقل القارئَ إلى شاشةٍ أخرى.

   و«details» لا زرٌّ بـ JS: صفحةٌ تحتاج سكربتا لتُقرأ تنكسر صامتة. */
.plist{display:flex; flex-direction:column; border:var(--bd);
  border-radius:var(--r-card); overflow:hidden; margin-top:var(--s-3);
  /* ‏حاويةٌ يُسأل عرضُها: الصفُّ يلتفّ بعرض القائمة لا بعرض الشاشة (أدناه، مراجعة D-187) */
  container:plist/inline-size}
.prow+.prow{border-top:var(--bd-soft)}
.prow>summary{display:flex; align-items:center; gap:var(--s-3); cursor:pointer;
  padding:var(--s-3) var(--s-4); min-height:var(--tap); list-style:none;
  background:var(--surface)}
.prow>summary::-webkit-details-marker{display:none}
@media(hover:hover){.prow>summary:hover{background:var(--hover)}}
.prow[open]>summary{background:var(--surface-2); border-bottom:var(--bd-soft)}
/* الاسمُ يأخذ ما بقي، وما بعده ثابتُ العرض — فالأعمدةُ تصطفّ رأسيّا */
.prow .pn{flex:1; min-width:0; font-size:var(--t-ui); line-height:var(--lh-ui); font-weight:600; color:var(--ink)}
.prow .pk{display:block; font-size:var(--t-small); line-height:var(--lh-small); font-weight:400; color:var(--ink-2)}
.prow .pm{flex:none; width:12.5rem; font-size:var(--t-code); line-height:var(--lh-code); color:var(--ink-2);
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap; direction:ltr; text-align:start}
.prow .pv{flex:none; width:5rem; font-size:var(--t-ui); line-height:var(--lh-ui); font-weight:600; color:var(--ink);
  font-variant-numeric:tabular-nums}
.prow .pv i{display:block; font-style:normal; font-size:var(--t-small); line-height:var(--lh-small); font-weight:400; color:var(--ink-2)}
.prow .pst{flex:none; width:9.5rem}
.pbody{padding:var(--s-4); background:var(--surface-2)}
/* أربعةُ حقولٍ في سطرٍ على الشاشة، واثنان في الجوّال — ولا يُقصّ شيء */
.pgrid{display:grid; grid-template-columns:repeat(auto-fit,minmax(11.25rem,1fr)); gap:var(--s-3)}
.pgrid .kv-k{font-size:var(--t-caption); line-height:var(--lh-caption); font-weight:600; color:var(--ink-2); margin-bottom:var(--s-1)}

/* ── معالجُ الربط: الخطواتُ نفسُها، وحالُ كلٍّ بجانبها ────────────────
   والحالُ **يمينَ السطر لا تحته**: عينٌ تمسح عمودا واحدا تجد موضعَها
   في الطريق بلا قراءة. ويلتفّ تحت المحتوى في الجوّال حيث لا عرضَ له.

   والخطوةُ الجارية **تُظلَّل**: أربعُ خطواتٍ متساويةٍ في الوزن تجعل
   العينَ تقرؤها كلَّها لتعرف أين هي — وواحدةٌ مميّزةٌ تُقرأ بلا قراءة. */
ol.steps.wiz{gap:var(--s-3); margin-bottom:0}
ol.steps.wiz li{align-items:center; flex-wrap:wrap; padding:var(--s-2) var(--s-3);
  border-radius:var(--r-control); border:var(--bd-clear)}
ol.steps.wiz li.at{background:var(--selected); border-color:var(--line)}
/* والخيطُ يُزاح مع الحشو، فلا يقع خارجَ الدوائر */
ol.steps.wiz li:not(:last-child)::before{top:calc(var(--s-8) + var(--stroke)); bottom:calc(-1 * var(--s-3));
  inset-inline-start:var(--s-6)}
ol.steps.wiz .body{flex:1; min-width:11.25rem}
ol.steps.wiz .st{flex:none; margin-inline-start:auto}
/* ورقمُ خطوةٍ رُدّت أو تمّت يحمل لونَ حالها — والعلامةُ نصٌّ بجانبه */
ol.steps.wiz li.ok .step-n{color:var(--ok); border-color:color-mix(in srgb,var(--ok) 40%,transparent)}
ol.steps.wiz li.bad .step-n{color:var(--bad); border-color:color-mix(in srgb,var(--bad) 40%,transparent)}
ol.steps.wiz li.idle .step-n{color:var(--ink-2); border-color:var(--line)}
/* بنودُ البوّابة شروطٌ لا خطواتٌ مرتَّبة — فلا رقمَ ولا خيطٌ يصلها */
ol.steps.wiz.nodot li::before{display:none}

/* ── تبويباتُ الفرز ───────────────────────────────────────────────────
   روابطُ استعلامٍ لا أزرارُ سكربت: تُفتَح في تبويبٍ جديد، وتُحفَظ في
   المفضّلة، وتعمل إن سقط السكربت. **وحالُ الصفحة في عنوانها.**

   والعددُ **معروضٌ دائما** لا عند الفتح: من يقف على «الكلّ» يرى «فشل ٣»
   بلا أن يفتحه — والرقمُ هو الذي يُنبّه. */
/* **وصارت تبويباتٍ لا أزرارًا** (خطّة التصميم 7.4 · D-189): كانت «.ftab» محاطةً بحدّ،
   والمفتوحُ بحدّ الهويّة وأرضٍ — فتُقرأ صفَّ أزرار. والتبويبُ لغةُ التنقّل: حبرُ «--ink-2»،
   والمحدَّدُ «--ink» بوزن ‏٦٠٠ وخطٌّ ‏٢px تحته — **بحدٍّ لا بظلّ**، فيبقى في الألوان القسريّة.
   والعددُ مكوّنُ «Count»، والفشلُ بنغمته ولو لم يُفتَح التبويب. ودالّتُه «tabs()».
   **والشريطُ يلتفّ ولا يتمرّر** (مراجعةُ D-189): كان «overflow-x:auto» بشريطٍ مخفيّ — فقُصّت
   حلقةُ التركيز إلى خطّين (حاويةُ التمرير تقصّ المحورين، وارتفاعُها ارتفاعُ التبويب)، وغاب
   «فشلت» و«مرفوضة» خلف شريطٍ لا يُرى على حاسوبٍ ‏900–1030 لا تبلغهما عجلةُ الفأرة، وغاب
   «الإعداد !» عن الهاتف بلا أثر. والتفافٌ كما كان «.ftabs»: كلُّ تبويبٍ ظاهرٌ في كلّ عرض،
   وعددُ الفشل يُرى ولو لم يُفتَح. و«audit_mobile» يقيس كلَّ تبويبٍ وحلقتَه على ما يقصّه. */
.tab-bar{display:flex; flex-wrap:wrap; align-items:flex-end; gap:var(--s-1); margin-bottom:var(--s-4);
  box-shadow:inset 0 -1px 0 var(--line-soft)}
.tab-item{display:inline-flex; align-items:center; gap:var(--s-2); flex:none;
  padding:var(--s-2) var(--s-3); min-height:var(--tap); border:0; border-radius:0;
  border-bottom:var(--stroke) solid transparent; background:transparent; color:var(--ink-2);
  font-size:var(--t-ui); line-height:var(--lh-ui); font-weight:600; text-decoration:none; white-space:nowrap}
@media(hover:hover){.tab-item:hover{color:var(--ink); border-bottom-color:var(--line)}}
.tab-item[aria-current=page],.tab-item[aria-selected=true],.tab-item[aria-pressed=true]{
  color:var(--ink); border-bottom-color:var(--ink)}
/* الصفُّ الثاني: منصّاتٌ وترتيبٌ في سطرٍ واحدٍ يلتفّ (D-127) — فرزٌ داخل التبويب لا تبويبٌ ثانٍ */
.tab-sub{align-items:center; box-shadow:none; margin-top:calc(-1 * var(--s-2))}
.tab-sub .order{display:inline-flex; align-items:center; gap:var(--s-2)}
.tab-sub .order select{min-height:var(--tap)}

/* ── لوحُ الإرشاد تحت اللصيقة ─────────────────────────────────────────
   بحثُ GOV.UK: المستخدمُ يبدأ الكتابة فور رؤية الحقل، **ولا ينظر تحته
   أبدا** — فالموضعُ فوق الحقل، وهو ما كان.

   والذي تبدّل هو **الوزن**: كان سطرا رماديّا بحجم 12 لا يُميَّز عن
   الزينة، فصار لوحا مؤطَّرا برمزٍ ملوّن. والموضعُ صحيحٌ في الحالين،
   والفرقُ أنّ الثاني يُرى. */
.help{display:flex; gap:var(--s-3); align-items:flex-start; margin:var(--s-2) 0 var(--s-3);
  padding:var(--s-3) var(--s-4); border-radius:var(--r-card);
  background:var(--surface); border:var(--bd-soft);
  font-size:var(--t-small); line-height:var(--lh-small); color:var(--ink-2); max-width:var(--measure)}
/* والعلامةُ في دائرةٍ بقدر سطر اللصيقة (‏٢٠) لا أضيقَ منه، فلا يفيض الحرفُ عن حدّها */
.help-ic{flex:none; width:var(--s-5); height:var(--s-5); border-radius:50%; margin-top:var(--s-0);
  display:grid; place-items:center; font-size:var(--t-caption); line-height:var(--lh-caption); font-weight:600;
  background:var(--surface-2); color:var(--brand);
  border:1px solid color-mix(in srgb,var(--brand) 26%,transparent)}
.help b{color:var(--ink); font-weight:600}
.help-ic svg{width:var(--icon-xs); height:var(--icon-xs); display:block}
.help-t{min-width:0}
.guide .field{margin-bottom:var(--s-5)}

.guide .cb .copy{margin:0}
.guide form{margin-top:var(--s-2)}

/* ── الختام: علامةُ النجاح وما يقع إن فشل ─────────────────────────────
   تُفصَل عن النموذج بلونها: هي ما يُقرأ **بعد** الحفظ، وسطرٌ رماديٌّ
   في آخر النموذج يُقرأ قبله ثمّ يُنسى.

   والاثنان معا لا واحد: «إن نجح» وحدها تترك من فشل بلا شيء — وهو
   أحوجُ الاثنين إلى سطر. */
/* بطاقةُ الخطوات على العريض عمودان (D-137): الخطواتُ يمينًا، والبابُ
   و«إن نجح» يسارًا — فلا تبقى جوفاءَ نصفِها. **وبطاقةُ نتيجة الربط وحدَها**: أدلّةُ القنوات «card-inset» إفصاحٌ بعمودٍ واحد (٢ج). */
.guide-aside{display:grid; gap:var(--s-3); align-content:start}
@media${atLeast('md')}{
  .card.guide:not(.card-inset){display:grid; grid-template-columns:minmax(0,1.3fr) minmax(0,1fr); column-gap:var(--s-6); align-items:start}
  .card.guide:not(.card-inset) .card-head{grid-column:1 / -1}
  .card.guide:not(.card-inset) ol.steps{margin-bottom:0}
  .card.guide:not(.card-inset) .outcome{margin-top:0}}
.outcome{display:flex; gap:var(--s-3); align-items:flex-start; margin-top:var(--s-3);
  padding:var(--s-3) var(--s-4); border-radius:var(--r-card); background:var(--ok-wash);
  border:1px solid color-mix(in srgb,var(--ok) 20%,transparent)}
.outcome .kv-k{flex:none; font-size:var(--t-small); line-height:var(--lh-small); font-weight:600; color:var(--ok);
  padding-top:var(--s-0); min-width:4rem}
.outcome .kv-v{font-size:var(--t-small); line-height:var(--lh-small); color:var(--ink-2);
  max-width:var(--measure)}
.outcome.warn{background:var(--warn-wash);
  border-color:color-mix(in srgb,var(--warn) 22%,transparent)}
.outcome.warn .kv-k{color:var(--warn)}

/* المطويُّ العامّ — لا يُصنَّف دليلا: صناديقُ الاسترداد وما شابهها */
.setup{border-top:var(--bd-soft); padding-top:var(--s-3); margin-top:var(--s-0)}
/* وسمُ summary هدفٌ يُنقر كالزرّ سواء، فيأخذ حدَّه: قيس عند 20px قامةً
   — وهو ثلثُ الحدّ. */
summary{min-height:var(--tap); display:flex; align-items:center}
/* ‏والمطويُّ هنا زرٌّ هادئ كـ«.g-tog»: حبرُ الرابط وخطٌّ تحته (D-183) */
.setup>summary{cursor:pointer; font-size:var(--t-ui); line-height:var(--lh-ui); font-weight:600; color:var(--link);
  text-decoration:underline; text-decoration-thickness:var(--ul); text-underline-offset:.3em;
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
.copy input{flex:1 1 auto; min-width:0;
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
.dcols{columns:2 27.5rem; column-gap:var(--gap-card)}
/* ── فيديوهاتك (D-180) ─────────────────────────────────────────────────
   الملفُّ يُختار بلصيقةٍ بهيئة زرّ: حقلُ الملفّ الأصليّ لا يُصمَّم ويقول «No file chosen»
   بلغة المتصفّح. **فيغطّي الزرَّ شفّافًا لا يُصغَّر إلى بكسل**: هدفُ اللمس بحجم الزرّ
   (أمسكه مدقّقُ الأهداف ‏1×1)، وقارئُ الشاشة ولوحةُ المفاتيح يبلغانه كما هو. */
.vpick{position:relative; overflow:hidden}
.vpick:focus-within{outline:var(--stroke) solid var(--focus); outline-offset:var(--stroke)}
.vup{display:flex; align-items:center; gap:var(--s-3); flex-wrap:wrap; margin-bottom:var(--s-3)}
.vfile{position:absolute; inset:0; width:100%; height:100%; margin:0; opacity:0; cursor:pointer}
.vup progress{flex:1 1 12.5rem; height:var(--s-3); accent-color:var(--ok)}
.vlist{display:flex; flex-direction:column; gap:var(--s-3)}
/* ‏والصفُّ مرساةُ العودة بعد الإنشاء والجدولة (ر-4): يقف تحت الشريط الملتصق لا خلفَه، كالمسوّدة */
.vrow{display:flex; flex-direction:column; gap:var(--s-2); padding:var(--s-3);
  border:var(--bd); scroll-margin-block-start:var(--s-16)}
.vmeta{display:flex; flex-direction:column; gap:var(--s-1)}
.vrow > .st{align-self:flex-start}
.vpfs{display:grid; gap:var(--s-2); grid-template-columns:repeat(auto-fit,minmax(min(12.5rem,100%),1fr)); margin-bottom:var(--s-2)}
.vpf{display:flex; align-items:flex-start; gap:var(--s-2); padding:var(--s-2); min-height:var(--tap);
  border-radius:var(--r-control); background:var(--surface); border:var(--bd-soft)}
.vpf input{margin:var(--s-1) 0 0}
.vpf-b{display:flex; flex-direction:column; align-items:flex-start; gap:var(--s-1); min-width:0}
/* ‏وسببُ المنصّة جملةٌ لا لصيقة: يلتفّ ولا يدفع الصفحةَ ‏19px عند ‏320 */
.vpf-b .st{white-space:normal; max-width:100%}
/* ‏وسطرُ الشرح تحت المنصّة (D-190) نصٌّ عاديّ لا لصيقة: المربّعُ كلُّه «label» بوزن ‏600، فكان
   «Google لم تُجِز تطبيقك بعد» يُقرأ عنوانًا ثانيًا بجانب اسم المنصّة */
.vpf-b .ago{font-weight:400}
/* ‏«صف المقطع بجملة» (D-190): نموذجُ الكتابة فوق نموذج الإنشاء ويفصلهما خطٌّ خفيف، وحقولُ
   المنصّات بعده متتابعةٌ بفجوةٍ من السلّم — كانت حقلًا واحدًا لا يحتاجها */
.vcap{display:flex; flex-direction:column; gap:var(--s-2); padding-bottom:var(--s-3); border-bottom:var(--bd-soft)}
.vcaps{display:flex; flex-direction:column; gap:var(--s-3); margin-bottom:var(--s-2)}
.vapprove{display:inline-flex; align-items:center; gap:var(--s-2); min-height:var(--tap); font-size:var(--t-small); line-height:var(--lh-small)}
.vapprove input{margin:0}
/* ── معاينةُ الخطّة (D-181): الصفُّ ذو المشكلة بأرضٍ حمراءَ خفيفة، ومشكلاتُه قائمةٌ بجانبه ── */
.pi td{vertical-align:top}
.pi tr.bad td{background:var(--bad-wash)}
.pi td .ago{display:block}
/* ‏**ورابطٌ بلا مسافةٍ يُكسَر ولا يُفيض** (مراجعة ر-5): «https://example.com/a/very/long/…» في نصّ
   صفٍّ دفع صفحةَ المعاينة ‏101px جانبًا عند ‏390 و‏171 عند ‏320، فقُطع «اعتمد وجدوِل» الملتصق. وفي
   الجوّال تصير الخلايا كتلًا بعرض البطاقة، فتُكسَر كلُّها؛ وفي العريض خليّةُ النصّ وحدَها — نثرٌ
   يحتمل الكسر، والموعدُ والمنصّةُ لا يُضغَطان إلى حرفٍ في سطر */
.pi-text{max-width:var(--measure); overflow-wrap:anywhere}
@media${below('sm')}{.pi td{overflow-wrap:anywhere}}
.pi-why{margin:0; padding-inline-start:var(--s-4); color:var(--bad); font-size:var(--t-small); line-height:var(--lh-small)}
/* ‏وصفُّ «اعتمد وجدوِل» يلاصق أسفلَ الشاشة (القالب T4، ر-5): كان بعد ‏529px من التمرير بثلاثة صفوف،
   ويبعد مع كلّ صفٍّ حتّى المئتين. و«sticky» لا «fixed»: يمضي مع البطاقة إذا انتهت */
.pi-bar{position:sticky; bottom:var(--s-3); z-index:15; margin-top:var(--s-3); padding:var(--s-3);
  background:var(--surface); border:var(--bd); border-radius:var(--r-card); box-shadow:var(--sh-2)}
@media${below('md')}{.pi-bar{bottom:calc(var(--s-16) + var(--safe-b))}}
.dcols > *{break-inside:avoid; margin-bottom:var(--gap-card)}

/* ── اختيارُ بطاقات اللوح (D-119) ─────────────────────────────────────
   **واللصيقةُ هي الهدف لا المربّع**: صندوقُ الاختيار يرسمه المتصفّح
   ثلاثةَ عشرَ بكسلا، فيُلَفّ بلصيقةٍ تُضغَط في أيّ موضعٍ منها — سلوكُ
   HTML لا حيلةُ أنماط (D-100). */
.tgrid{display:grid; grid-template-columns:repeat(auto-fill,minmax(16.25rem,1fr));
  gap:var(--s-2)}
.tpick{display:flex; align-items:flex-start; gap:var(--s-3); cursor:pointer;
  padding:var(--s-3); border:var(--bd); min-height:var(--tap);
  transition:border-color var(--dur-2) var(--ease), background var(--dur-2) var(--ease)}
@media(hover:hover){.tpick:hover{background:var(--surface-3)}}
/* والمختارةُ تُعرَف بحدٍّ لا بأرضيّةٍ ملوّنة: أرضيّةٌ تحت نصٍّ تخفض تباينَه */
.tpick:has(input:checked){border-color:color-mix(in srgb,var(--brand) 45%,transparent)}
/* **والهامشُ يُصرَّح به كلُّه**: المتصفّحُ يضع لصندوق الاختيار ٣px من
   عنده، **وهي خارج السلّم** — فيُضبَط الأربعةُ لا الأعلى وحدَه */
.tpick input{flex:none; margin:var(--s-1) 0 0; width:var(--icon-sm); height:var(--icon-sm);
  accent-color:var(--brand)}
.tpick .tp-t{min-width:0}
.tpick .tp-t b{display:block; font-size:var(--t-ui); line-height:var(--lh-ui); font-weight:600}
.tpick .tp-t span{display:block; font-size:var(--t-small); color:var(--ink-2);
  line-height:var(--lh-small); margin-top:var(--s-1)}
.draft{display:flex; flex-direction:column; gap:var(--s-3); padding:var(--s-4);
  scroll-margin-block-start:var(--s-16)}
.draft.done{background:var(--surface-2); box-shadow:none}
.draft-more > summary{cursor:pointer; min-height:var(--tap); display:flex; align-items:center; gap:var(--s-2);
  color:var(--ink-2); font-size:var(--t-small); line-height:var(--lh-small); font-weight:600}
.draft-more[open] > summary{margin-bottom:var(--s-2)}
.draft-more > * + *{margin-top:var(--s-3)}
.draft-top{display:flex; align-items:center; gap:var(--s-3)}

/* ── البطاقةُ المختصرة (D-198): رأسٌ وثلاثةُ أسطرٍ وفعلٌ واحد، ‏320px أو أقلّ ─────────────────
   **والنصُّ هو البطل**: نمطُ المتن بحبره، وكلُّ ما سواه أخفتُ منه. */
.pc{gap:var(--s-3); padding:var(--s-4) var(--s-4) var(--s-3)}
.pc[aria-current=true]{border-color:var(--ink)}
.pc-logo{flex:none; display:grid; place-items:center; width:var(--s-6); height:var(--s-6); border-radius:var(--r-inline);
  color:var(--pf-fg); background:var(--surface-3); box-shadow:inset 0 0 0 var(--ul) var(--logo-ring)}
.pc-logo svg{width:60%; height:60%; display:block}
.pc-logo[data-pf=linkedin]{background:var(--pf-linkedin)}
.pc-logo[data-pf=x]{background:var(--pf-x)}
.pc-logo[data-pf=instagram]{background:var(--pf-instagram)}
.pc-logo[data-pf=tiktok]{background:var(--pf-tiktok)}
.pc-logo[data-pf=youtube]{background:var(--pf-youtube)}
.pc-who{display:flex; flex-direction:column; min-width:0; flex:1}
.pc-who b,.pc-who h2{margin:0; font-size:var(--t-ui); line-height:var(--lh-ui); font-weight:600; color:var(--ink);
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
.pc-when{font-size:var(--t-small); line-height:var(--lh-small); color:var(--ink-2);
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
.pc-body{display:flex; align-items:flex-start; gap:var(--s-4)}
.pc-text{flex:1; min-width:0; margin:0; font-size:var(--t-body); line-height:var(--lh-body); color:var(--ink);
  overflow-wrap:anywhere; display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:2; line-clamp:2; overflow:hidden}
/* ‏«المكتبة ← الصور» (D-206): شبكةٌ تملأ عرضَها، والصورةُ كاملةٌ لا مقصوصة (contain · D-170) */
.lib-grid{display:grid; gap:var(--s-3); grid-template-columns:repeat(auto-fill,minmax(min(100%,11.75rem),1fr)); margin-top:var(--s-3)}
.lib-img{display:flex; flex-direction:column; gap:var(--s-2); color:var(--ink); text-decoration:none}
.lib-img img{width:100%; height:auto; aspect-ratio:1; object-fit:contain; border-radius:var(--r-control);
  background:var(--surface-2); border:var(--bd-soft)}
@media(hover:hover){.lib-img:hover img{border-color:var(--ink-3)}}
.lib-cap{font-size:var(--t-small); line-height:var(--lh-small); color:var(--ink-2)}
.pc-thumb{flex:none; width:var(--s-16); height:var(--s-16); border-radius:var(--r-control);
  object-fit:cover; background:var(--surface-2); border:var(--bd-soft)}
.pc-line{display:flex; align-items:center; gap:var(--s-2); flex-wrap:wrap; margin:0; max-width:none;
  font-size:var(--t-small); line-height:var(--lh-small); color:var(--ink-2)}
.pc-line[data-tone=bad]{color:var(--bad)}
.pc-foot{display:flex; flex-wrap:wrap; align-items:center; gap:var(--s-2); padding-top:var(--s-3); border-top:var(--bd-soft)}

/* ── القائمةُ المنسدلة («menu()»، D-198): «⋯» على البطاقة والمحرّر ─────────────────────── */
.menu{position:relative; display:inline-block}
/* ‏والمطويّةُ لا لوحَ لها: اللوحُ المطلقُ يخرج من صندوق «details» المطويّ فيُقاس ولا يُبلَغ */
.menu:not([open]) > .menu-list{display:none}
.menu > summary{list-style:none}
.menu > summary::-webkit-details-marker{display:none}
.menu-list{position:absolute; z-index:30; top:calc(100% + var(--s-1)); inset-inline-end:0;
  width:max-content; min-width:min(15rem, calc(100vw - 2 * var(--s-4))); max-width:min(22rem, calc(100vw - 2 * var(--s-4)));
  display:flex; flex-direction:column; gap:var(--s-0); padding:var(--s-1);
  background:var(--dialog); border:var(--bd); border-radius:var(--r-control); box-shadow:var(--sh-3)}
.menu-caret{display:inline-flex}
.menu-form{display:block; margin:0}
.menu-item{display:flex; align-items:center; justify-content:flex-start; gap:var(--s-3); width:100%;
  min-height:var(--tap); padding:var(--s-2) var(--s-3); border:0; border-radius:var(--r-control);
  background:transparent; color:var(--ink); text-align:start; text-decoration:none; white-space:normal; font:inherit; cursor:pointer}
@media(hover:hover){.menu-item:hover{background:var(--hover)}}
.menu-item > svg{width:var(--icon-md); height:var(--icon-md); flex:none; color:var(--ink-2)}
.menu-t{display:flex; flex-direction:column; min-width:0}
.menu-t b{font-size:var(--t-ui); line-height:var(--lh-ui); font-weight:600}
.menu-t span{font-size:var(--t-small); line-height:var(--lh-small); color:var(--ink-2)}
.menu-danger .menu-t b{color:var(--bad)}
/* ‏قائمةُ الحساب (D-215): السمةُ والكثافةُ مقطعان في سطرين، وتحتهما الجلساتُ والخروج */
.menu-seg{display:flex; align-items:center; justify-content:space-between; gap:var(--s-3);
  padding:var(--s-2) var(--s-3); font-size:var(--t-small); line-height:var(--lh-small); color:var(--ink-2)}
/* ‏والفاصلُ تحت آخر مقطع لا فوق البند: البندُ مدوَّرُ الزوايا، فحدٌّ عليه يُرسم قوسًا */
.menu-seg + .menu-seg{padding-bottom:var(--s-3); margin-bottom:var(--s-1); border-bottom:var(--bd-soft)}

/* ── المحرّرُ المركّز (D-198): لوحٌ ‏560px بجوار القائمة، وشاشةٌ كاملةٌ دون «lg» ────────────── */
.ed{display:flex; flex-direction:column; padding:0; min-width:0; scroll-margin-block-start:var(--s-4)}
.ed-head{display:flex; align-items:center; gap:var(--s-3); padding-block:var(--s-3); padding-inline:var(--s-5) var(--s-4);
  border-bottom:var(--bd-soft); background:var(--surface); border-start-start-radius:var(--r-card); border-start-end-radius:var(--r-card)}
.ed-head .pc-who h2,.ed-head .pc-when{white-space:normal; overflow:visible}
.ed-body{display:flex; flex-direction:column; gap:var(--s-5); padding:var(--s-5)}
.ed-views{display:flex; flex-direction:column; gap:var(--s-3)}
.ed-view{min-width:0}
.ed-x{flex:none}
.ed-field{display:flex; flex-direction:column; gap:var(--s-2)}
.ed-label{display:flex; align-items:center; gap:var(--s-3); min-height:var(--tap)}
/* ‏**النتيجةُ قبل الردّ** (D-225): البطاقةُ تخفت وتقول ما ضُغط في رأسها بحبّة الحال نفسِها حتّى تصل بطاقةُ الخادم */
[data-pending]{position:relative}
[data-pending] > :not(.pending-tag){opacity:.55; transition:opacity var(--dur-1)}
[data-pending] > .pending-tag{position:absolute; z-index:1; inset-block-start:var(--s-3); inset-inline-end:var(--s-3); opacity:1}
/* ‏«حُفظ» بجوار العنوان: الحفظُ التلقائيُّ يقول ما وقع بكلمة، لا بإشعار (D-225) */
.ed-saved{font-size:var(--t-caption); line-height:var(--lh-caption); color:var(--ink-2)}
.ed-label > label,.ed-l{font-size:var(--t-ui); line-height:var(--lh-ui); font-weight:600; color:var(--ink)}
.draft-text.ed-txt{height:auto; min-height:calc(8 * var(--lh-body) + var(--s-6)); max-height:60vh; field-sizing:content}
.ed-read{margin:0; max-width:var(--measure); white-space:pre-wrap; overflow-wrap:anywhere;
  font-size:var(--t-body); line-height:var(--lh-body); color:var(--ink)}
.ed-sec{display:flex; flex-direction:column; gap:var(--s-3); padding-top:var(--s-5); border-top:var(--bd-soft);
  scroll-margin-block-start:var(--s-4)}
.ed-sec > p{margin:0}
.ed-sec-head{display:flex; align-items:center; gap:var(--s-2) var(--s-3); flex-wrap:wrap}
.ed-sec-head h3{margin:0; font-size:var(--t-h3); line-height:var(--lh-h3); font-weight:600}
.ed-sec .pic{margin-top:0}
.ed-more > summary{display:flex; align-items:center; gap:var(--s-2); min-height:var(--tap); cursor:pointer;
  font-size:var(--t-ui); line-height:var(--lh-ui); font-weight:600; color:var(--ink)}
.ed-note{margin:0; max-width:none; padding:var(--s-3) var(--s-4); border-radius:var(--r-control);
  border-inline-start:var(--s-1) solid var(--warn); background:var(--warn-wash); color:var(--ink);
  font-size:var(--t-small); line-height:var(--lh-small)}
.ed-note[data-tone=bad]{border-inline-start-color:var(--bad); background:var(--bad-wash)}
.ed-on{margin:0; font-size:var(--t-ui); line-height:var(--lh-ui); color:var(--ink-2)}
.ed-on b{color:var(--ink)}
.ed-more{border-top:var(--bd-soft); padding-top:var(--s-2)}
.ed-kv{display:grid; grid-template-columns:minmax(7rem,max-content) minmax(0,1fr); gap:var(--s-2) var(--s-4); margin:var(--s-2) 0 var(--s-3)}
.ed-kv dt{font-size:var(--t-small); line-height:var(--lh-small); color:var(--ink-2)}
.ed-kv dd{margin:0; min-width:0; font-size:var(--t-small); line-height:var(--lh-small); color:var(--ink); overflow-wrap:anywhere}
/* ‏والشريطُ ثابتٌ في أسفل اللوح: الفعلُ في متناول الإبهام مهما طال النصّ */
.ed-bar{position:sticky; bottom:0; z-index:5; display:flex; flex-wrap:wrap; align-items:center; gap:var(--s-2);
  padding:var(--s-3) var(--s-5); padding-bottom:calc(var(--s-3) + var(--safe-b)); background:var(--surface); border-top:var(--bd);
  border-end-start-radius:var(--r-card); border-end-end-radius:var(--r-card)}

/* ── «متى يُنشر؟»: أزرارٌ بتوقيت المالك أو يومٌ وساعة ────────────────────────────────────── */
.ed-when{border:0; margin:0; padding:0; min-width:0; display:flex; flex-direction:column; gap:var(--s-2)}
.ed-when legend{padding:0; margin-bottom:var(--s-1); font-size:var(--t-ui); line-height:var(--lh-ui); font-weight:600; color:var(--ink)}
.when-opts{display:grid; grid-template-columns:repeat(auto-fill,minmax(min(100%,9rem),1fr)); gap:var(--s-2)}
.when-opt{display:flex; align-items:flex-start; gap:var(--s-2); min-height:var(--tap); padding:var(--s-2) var(--s-3);
  border:var(--bd-field); border-radius:var(--r-control); background:var(--surface); cursor:pointer}
.when-opt input{flex:none; margin:var(--s-1) 0 0; accent-color:var(--brand)}
.when-opt > span{display:flex; flex-direction:column; min-width:0}
.when-opt b{font-size:var(--t-ui); line-height:var(--lh-ui); font-weight:600}
.when-opt small{font-size:var(--t-small); line-height:var(--lh-small); font-weight:400; color:var(--ink-2)}
.when-opt:has(input:checked){border-color:var(--ink); background:var(--selected)}
.when-custom{display:none}
.ed-when:has(input[value=custom]:checked) .when-custom{display:block}
@supports not selector(:has(*)){.when-custom{display:block}}

/* ‏اللوحُ بجوار القائمة على العريض: القائمةُ تأخذ ما بقي، واللوحُ ‏26 إلى ‏35rem لاصقٌ بارتفاع الشاشة */
.posts-list{min-width:0}
@media${atLeast('lg')}{
  .posts-split{display:grid; grid-template-columns:minmax(0,1fr) minmax(26rem,35rem); gap:var(--s-6); align-items:start}
  .posts-split .dcols{columns:1}
  .posts-split .ed{position:sticky; top:var(--s-4); max-height:calc(100dvh - var(--s-8)); overflow:auto; overscroll-behavior:contain}
  .posts-split .ed-head{position:sticky; top:0; z-index:6}
}
/* ‏ودونه يأخذ اللوحُ الشاشةَ كلَّها فوق القائمة، والإغلاقُ يعيد إليها */
@media${below('lg')}{
  .posts-split .ed{position:fixed; inset:0; z-index:60; border-radius:0; border:0; overflow:auto; overscroll-behavior:contain}
  .posts-split .ed-head{position:sticky; top:0; z-index:6; border-radius:0}
  .posts-split .ed-bar{border-radius:0}
}
/* ══ مسرحُ القرار (D-100) ═══════════════════════════════════════════
   ── صندوقُ التحديد ───────────────────────────────────────────────
   اللصيقةُ هي الهدفُ لا الصندوق: صندوقُ المتصفّح ثلاثةَ عشرَ بكسلا،
   **ولا يُكبَّر بلا أن يُرسَم من جديد**. فتُمَدّ اللصيقةُ حوله إلى ٤٤
   (D-086) ويبقى الصندوقُ بحجمه — يرى الإصبعُ هدفا، وترى العينُ صندوقا. */
.pick{flex:none; display:grid; place-items:center;
  width:var(--tap); height:var(--tap); margin-inline-start:calc(-1 * var(--s-3));
  border-radius:var(--r-control); cursor:pointer}
@media(hover:hover){.pick:hover{background:var(--hover)}}
.pick input{width:var(--icon-sm); height:var(--icon-sm); margin:0; accent-color:var(--brand); cursor:pointer}

/* ── البطاقةُ الحاليّة تحت لوحة المفاتيح ──────────────────────────
   حدٌّ بلون الهويّة **وحلقةٌ**: الحدُّ وحده يبدّل مقاسَ البطاقة بكسلا
   فتهتزّ القائمةُ مع كلّ ضغطةِ J. والحلقةُ خارج الصندوق فلا تُزيح شيئا. */
.draft.here{border-color:var(--focus);
  box-shadow:0 0 0 var(--ring-w) var(--ring), var(--sh-2)}
/* ‏وكان للمسوّدة المنتظرة وهجٌ نحاسيّ («--glow»)، فسقط مع الرمز (خطّة التصميم 3.2 · D-187):
   أربعُ مسوّداتٍ منتظرةٌ أربعةُ مواضعَ نحاسٍ في شاشةٍ واحدة. وحالُها تقولها شارتُها ورمزُها. */

/* ── المعاينة: كما تُقرأ لا كما تُحرَّر ───────────────────────────
   المربّعُ حقلُ تحرير — خطُّ اللوحة وحدٌّ وشريطُ تمرير وعرضُ البطاقة.
   **والمنشورُ يُقرأ فقرةً في عمودٍ ضيّق**، وحكمٌ على نصٍّ في حقلٍ ليس
   حكما عليه منشورا.

   والعمودُ أضيقُ من «--measure» قصدا: عمودُ المنصّة أضيقُ من عمود
   قراءةٍ عاديّ، وهذا أقربُ ما نملك إليه بلا ادّعاء رقمٍ لم يُقَس. */
.pv-head{display:flex; align-items:center; gap:var(--s-2); margin-bottom:var(--s-2)}
/* دائرةٌ خافتةٌ مكانَ صورة الحساب: مربّعٌ فارغٌ يُقرأ صورةً لم تُحمَّل */
.pv-dot{width:var(--s-6); height:var(--s-6); border-radius:50%; flex:none;
  background:var(--surface-3); border:var(--bd)}
.pv-who{font-weight:600; font-size:var(--t-ui); line-height:var(--lh-ui)}
/* والأسطرُ تُحفظ كما كُتبت: منشورٌ بفقرتين يُقرأ فقرةً واحدة إن طُويت
   أسطرُه، فيُحكَم عليه بغير ما يظهر */
.pv-body{margin:0; white-space:pre-wrap; word-break:break-word;
  font-size:var(--t-body); line-height:var(--lh-body); color:var(--ink); max-width:var(--measure)}
/* السطرُ الأوّلُ هو ما يُقرأ قبل أيّ طيّ **مهما كان حدُّه** — فيُثخَّن.
   ولا يُلوَّن: لونٌ على سطرٍ من فقرةٍ يُقرأ رابطا أو حالة. */
.pv-body b{font-weight:600}
.pv-note{margin:var(--s-3) 0 0; font-size:var(--t-small); color:var(--ink-2);
  line-height:var(--lh-small); max-width:var(--measure);
  padding-top:var(--s-2); border-top:var(--bd-dash)}

/* ── شريطُ البَتِّ الجماعيّ ───────────────────────────────────────
   ملتصقٌ بأسفل الشاشة: من يحدّد خمسا وهو في آخر القائمة لا يُطلَب منه
   أن يصعد. و«sticky» لا «fixed» — الأولى تبقى في تدفّق الصفحة فلا
   تغطّي آخرَ بطاقةٍ عند نهاية التمرير. */
.bulkbar{position:sticky; bottom:var(--s-3); z-index:15;
  display:flex; align-items:center; gap:var(--s-3); flex-wrap:wrap;
  margin:0 0 var(--s-3); padding:var(--s-3) var(--s-4);
  background:var(--surface);
  border:1px solid var(--brand); border-radius:var(--r-card);
  box-shadow:var(--sh-2)}
.bulkbar b{font-variant-numeric:tabular-nums}
.bulkbar .ago{direction:ltr; unicode-bidi:isolate}

/* ── لوحُ الاختصارات ─────────────────────────────────────────────
   مطويٌّ بالافتراض: من لا يعرفها لا يحتاج أن يراها في كلّ فتحة، ومن
   يعرفها لا يقرؤها. **ويُفتَح بالمفتاح نفسِه الذي يسأل عنه.** */
.keys{margin:0 0 var(--s-3); padding:0; border:var(--bd); font-size:var(--t-small); line-height:var(--lh-small)}
.keys>summary{cursor:pointer; list-style:none; padding:var(--s-2) var(--s-3);
  min-height:var(--tap); display:flex; align-items:center; gap:var(--s-2);
  color:var(--ink-2); font-weight:600}
.keys>summary::-webkit-details-marker{display:none}
@media(hover:hover){.keys>summary:hover{background:var(--surface-3)}}
.keys .rows{display:flex; flex-wrap:wrap; gap:var(--s-2) var(--s-5);
  padding:0 var(--s-3) var(--s-3)}
.keys .row-k{display:inline-flex; align-items:center; gap:var(--s-2); color:var(--ink-2)}
.keys-hint{padding:0 var(--s-3) var(--s-3)}
/* والمفتاحُ يُرسَم مفتاحا: حرفٌ لاتينيٌّ في جملةٍ عربيّةٍ يُقرأ جزءا منها — نمطُ «code» بخطّ الصفحة */
.keys kbd{font-family:inherit; font-size:var(--t-code); line-height:var(--lh-code);
  direction:ltr; unicode-bidi:isolate; min-width:var(--s-6); text-align:center;
  padding:var(--s-0) var(--s-1); border-radius:var(--r-inline); color:var(--ink);
  background:var(--surface); border:var(--bd);
  box-shadow:0 1px 0 var(--line)}
.ch-logo-sm{width:var(--s-8); height:var(--s-8)}
.draft-why{margin:0; font-size:var(--t-small); color:var(--ink-2); line-height:var(--lh-small);
  border-inline-start:var(--stroke) solid var(--line); padding-inline-start:var(--s-2)}
/* ارتفاعٌ من مضاعفاتِ السطر بالضبط.
   بارتفاعٍ حرّ يقع السطرُ الأخير مقصوصا في نصفه — نصفُ حرفٍ عند الحافّة
   يُقرأ عطلا في الرسم لا نصّا يفيض. والحسابُ يقتضي line-height بالبكسل
   لا بمعامل: المعاملُ يعطي كسرا لا يُضرَب فيبقى النصف. **ونصُّ المنشور نمطُ
   «body»** (D-185)، فالسطرُ رمزُه («--lh-body»: ‏٢٨ على الحاسوب و‏٣٠ على الجوّال). */
.draft-text{width:100%; box-sizing:border-box; font:inherit; font-size:var(--t-body);
  line-height:var(--lh-body); color:var(--ink); background:var(--bg); border:var(--bd);
  border-radius:var(--r-control); padding:var(--s-3) var(--s-4); resize:vertical;
  white-space:pre-wrap; word-break:break-word; overflow-y:auto}
.draft-text:focus{outline:none; border-color:var(--focus); box-shadow:0 0 0 var(--ring-w) var(--ring)}
/* المقروءُ لا يُسحَب: مقبضُ التحجيم يظهر على أيّ عنصرٍ فيه resize، ومقبضٌ
   على نصٍّ لا يُحرَّر يعد بما لا يقع. */
.draft-text.ro{background:var(--surface-3); color:var(--ink-2); resize:none}
.draft-foot{display:flex; align-items:center; gap:var(--s-2); flex-wrap:wrap; margin-top:var(--s-2)}
/* عدّادٌ لاتينيّ الأرقام: يُعزَل عن اتّجاه الصفحة فلا يُقلب «١٢٠ / ٢٨٠» */
.draft-len{font-size:var(--t-caption); line-height:var(--lh-caption); font-weight:600; color:var(--ink-2);
  font-variant-numeric:tabular-nums; direction:ltr; unicode-bidi:isolate}
.draft-len b{color:var(--ink); font-weight:600}
.draft-len.warn b{color:var(--warn)}
.draft-len.bad b{color:var(--bad)}
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
.pic img,.pic video{display:block; width:100%; height:auto; max-height:76vh; object-fit:contain;
  border-radius:var(--r-control); border:var(--bd); background:var(--surface-2)}
/* صورةٌ لم تُحمَّل تُقال بلفظها: مربّعٌ رماديٌّ فارغٌ كان يُقرأ «لا صورة» */
.pic-err{display:flex; align-items:center; gap:var(--s-2); flex-wrap:wrap;
  padding:var(--s-3); border-radius:var(--r-control); background:var(--surface-2);
  border:1px dashed var(--bad)}
.pic-foot{display:flex; align-items:center; gap:var(--s-1); flex-wrap:wrap; margin-top:var(--s-2)}
.pic.none{display:flex; align-items:center; gap:var(--s-2); flex-wrap:wrap;
  padding:var(--s-3) var(--s-3); border-radius:var(--r-control); background:var(--surface-2);
  border:var(--bd-dash)}
/* الابنُ المباشرُ وحدَه: سطرُ الجاهزيّة تحته فيه «ago» أيضًا، وقاعدةٌ تنزل
   إليه تمدّ سببَه مئتي بكسل فيدفع رابطَه إلى سطرٍ وحدَه (D-163) */
.pic.none > .ago{flex:1 1 12.5rem}
/* الصورةُ الفنّيّةُ مطويّةٌ تحت الإنفوجرافيك (D-174): بابٌ ثانٍ لا يزاحم
   الأوّلَ في سطره، وسطرُ جاهزيّته معه لا فوقه — فما ستقوله الدالّةُ يُقال
   قبل الضغط لكلا الزرّين */
.art{flex-basis:100%; border-top:var(--bd-soft); padding-top:var(--s-1)}
.art>summary{display:flex; align-items:center; min-height:var(--tap); cursor:pointer;
  list-style:none; font-size:var(--t-ui); line-height:var(--lh-ui); font-weight:600}
.art>summary::-webkit-details-marker{display:none}
/* ‏ومثلّثُ «.setup» نفسُه (D-167): يشير إلى نهاية السطر مطويًّا، وإلى الأسفل مفتوحًا */
.art>summary::before{content:''; display:inline-block; flex:none; width:0; height:0;
  margin-inline-end:var(--s-2);
  border-block:.3em solid transparent; border-inline-start:.4em solid; border-inline-end:0}
.art[open]>summary::before{border-inline:.3em solid transparent; border-block-start:.4em solid;
  border-block-end:0}
.art-row{display:flex; align-items:center; gap:var(--s-2); flex-wrap:wrap}
.art-row > .ago{flex:1 1 12.5rem}
/* شريطُ الجدولة — سطرٌ مميّزٌ عن جسم البطاقة: هو قرارٌ آخر غير الاعتماد،
   ودمجُه في الذيل يجعل الضغطتين تبدوان ضغطةً واحدة. */
/* ‏وهو مرساةٌ يعود إليها «اعتمد» و«اسحب الموعد» (‏#s-…)، فيُترَك فوقه قدرُ الشريط الملتصق
   كما يُترَك فوق البطاقة — ولا ينزل تحته */
.sched{display:flex; align-items:flex-end; gap:var(--s-2); flex-wrap:wrap; margin-top:var(--s-2);
  padding:var(--s-3); border:var(--bd-soft); scroll-margin-block-start:var(--s-16)}
.sched.set{background:var(--ok-wash); border-color:transparent}
.sched.gone{background:var(--warn-wash); border-color:transparent}
.sched.none{background:var(--warn-wash); border-color:transparent; align-items:center}
.sched .field{margin:0; flex:1 1 9.5rem; min-width:0}
.sched input,.sched select{padding:var(--s-2) var(--s-2)}
/* الموعدُ لاتينيّ الأرقام ويُعزَل عن اتّجاه الصفحة */
.sched .when{font-size:var(--t-small); line-height:var(--lh-small); color:var(--ink-2); direction:ltr; unicode-bidi:isolate}
.sched .ago{flex:1 1 auto}
/* شريطُ المواعيد السريعة — سطرٌ كاملٌ تحت الحقول لا بينها (D-089).
   «flex-basis:100%» يكسر السطر، فالأزرارُ لا تزاحم «جدوِل» على الجوّال. */
.quick{flex:1 0 100%; display:flex; align-items:center; gap:var(--s-1);
  flex-wrap:wrap; margin-top:var(--s-2); padding-top:var(--s-2);
  border-top:var(--bd)}
.quick .mirror{font-size:var(--t-small); line-height:var(--lh-small); color:var(--ink-2);
  direction:rtl; unicode-bidi:isolate}
/* ── الطيّ (D-199): ما يُبَتّ به ظاهر، وما سواه يُطلَب ─────────────────────────────────
   شريطُ الجدولة سطرُ أزرارٍ و«جدوِل»، والحقلُ الحرُّ في «موعدٌ آخر». */
.sched .quick{margin-top:0; padding-top:0; border-top:0}
.sched .quick .mirror:empty{display:none}
.sched .quick .mirror{flex-basis:100%}
.sched-more{flex:1 0 100%}
.sched-more > summary,.spread > summary{cursor:pointer; min-height:var(--tap); display:flex; align-items:center; gap:var(--s-2);
  color:var(--ink-2); font-size:var(--t-small); line-height:var(--lh-small); font-weight:600}
.sched-more[open] > summary{margin-bottom:var(--s-2)}
.sched-more > * + *{margin-top:var(--s-2)}
/* «وزّع المعتمَد» سطرٌ هادئ: شارةُ العدد و«وزّعها»، والنموذجُ تحته حين يُطلَب */
.spread{padding:var(--s-1) var(--s-4); margin-bottom:var(--s-3)}
.spread > summary{color:var(--ink)}
.spread-go{pointer-events:none}
.spread[open] .spread-go{visibility:hidden}
.spread-form{display:flex; flex-direction:column; gap:var(--s-3); padding-block:var(--s-2) var(--s-3)}
/* «؟» جملةُ القيد حين تُطلَب: زرٌّ دائريٌّ بحجم اللمس، والجملةُ سطرٌ كاملٌ تحته */
.why-tip{flex:none}
.why-tip > summary{cursor:pointer; display:grid; place-items:center; width:var(--tap); height:var(--tap);
  border-radius:50%; border:var(--bd); color:var(--ink-2); font-weight:600}
@media(hover:hover){.why-tip > summary:hover{background:var(--surface-2)}}
.lede-row:has(.why-tip[open]) .why-tip{flex-basis:100%; order:9}
/* لوحُ المراجعة — مطويٌّ عمدا (D-090): ملحوظاتُ ذوقٍ لا تزاحم النصَّ
   حتّى تُطلَب، «ولا شارةَ حمراء» فتُقرأ عطلا. */
.notes{margin-bottom:var(--s-2); border:var(--bd);
  border-radius:var(--r-control); background:var(--surface-2)}
.notes summary{display:flex; align-items:center; gap:var(--s-2);
  padding:var(--s-2); cursor:pointer; min-height:var(--tap)}
.notes summary::-webkit-details-marker{display:none}
.notes ul{margin:0; padding:0 var(--s-3) var(--s-2) var(--s-3)}
.notes li{margin-bottom:var(--s-2); font-size:var(--t-small); line-height:var(--lh-small)}
.notes li:last-child{margin-bottom:0}
.notes .hit-list{display:inline-flex; flex-wrap:wrap; gap:var(--s-1);
  margin-inline-start:var(--s-1)}

/* ── العامل الثاني ─────────────────────────────────────────── */
.codes{display:grid; grid-template-columns:repeat(auto-fill,minmax(9.25rem,1fr)); gap:var(--s-2); margin:var(--s-3) 0}
/* رموزُ الاسترداد لاتينيّةٌ معزولة: بخطّ الصفحة وأرقامِه الجدوليّة (D-185)، والتباعدُ
   صنعةٌ في اللاتينيّ لا عيب */
.codes code{font-family:inherit; font-variant-numeric:tabular-nums; font-size:var(--t-code);
  line-height:var(--lh-code); letter-spacing:.06em; direction:ltr; background:var(--surface-2); border:var(--bd);
  border-radius:var(--r-control); padding:var(--s-2) var(--s-2); text-align:center; color:var(--ink)}

/* ══ شاشةُ المنصّة ═══════════════════════════════════════════════════
   بطاقةُ القناة تجيب «أمربوطةٌ أم لا» — وهو سؤالُ الضبط، يُسأل مرّةً.
   وهذه تجيب ما يُسأل كلَّ يوم: ماذا نُشر، وأين رابطُه، وما فشل ولماذا.
   ولا موضعَ لأيٍّ من ذلك في بطاقةٍ عرضُها نصفُ شاشة. */
/* شريطُ العودة — صفحةٌ خارج اللوحة تحتاج بابا يُرجَع منه، ولا رافدةَ
   فيها. و«رجوع» المتصفّح ليس بابا: مَن فتحها في تبويبٍ جديد لا رجوعَ له. */
nav.back{display:flex; flex-wrap:wrap; align-items:center; padding:var(--s-3) 0 var(--s-5);
  border-bottom:var(--bd-soft); margin-bottom:var(--s-4); gap:var(--s-4)}
nav.back a{font-size:var(--t-ui); line-height:var(--lh-ui); font-weight:600; color:var(--ink-2); text-decoration:none;
  display:inline-flex; align-items:center; gap:var(--s-1); min-height:var(--tap); min-width:var(--tap)}
/* ‏والتمريرُ لونٌ **وخطّ** (D-196): الحبرُ الثانويُّ وحبرُ العلامة ليلًا متقاربان ضوءًا، فاللونُ وحدَه لا يُرى */
@media(hover:hover){nav.back a:hover{color:var(--brand); text-decoration:underline; text-underline-offset:var(--ul-off);
  text-decoration-thickness:var(--ul)}}

.plat-logo{width:var(--s-12); height:var(--s-12); border-radius:var(--r-control); flex:none; display:grid; place-items:center;
  background:var(--surface); border:var(--bd); color:var(--ink);
  box-shadow:var(--sh-1)}
.plat-logo svg{width:50%; height:50%; display:block}
.plat-logo.lg{width:var(--s-16); height:var(--s-16)}

/* النصُّ كما نُشر: يحفظ أسطرَه — منشورٌ بفقرتين يُقرأ فقرةً واحدة إن
   طُويت أسطرُه، فيُحكَم عليه بغير ما ظهر عليه. */
.post-text{margin:0; white-space:pre-wrap; word-break:break-word;
  font-size:var(--t-body); line-height:var(--lh-body); color:var(--ink); max-width:var(--measure)}
/* ── صفُّ الأرقام ─────────────────────────────────────────────────────
   والشرطةُ تختلف عن الصفر: الصفرُ «قِيس فكان لا شيء»، والشرطةُ «لا يُقاس
   أصلا» — و LinkedIn لا يعطي الظهورَ لمنشور عضو. فتُعطى الشرطةُ لونا
   خافتا وعنوانا يُقرأ بالتحويم، ولا تُعرَض رقما. */
.stats{display:flex; align-items:center; gap:var(--s-5); flex-wrap:wrap;
  margin-top:var(--s-3); padding-top:var(--s-3); border-top:var(--bd-soft)}
.stats.none{border-top:var(--bd-dash); gap:var(--s-2)}
.stat{display:inline-flex; align-items:baseline; gap:var(--s-2);
  font-size:var(--t-small); line-height:var(--lh-small); color:var(--ink-2)}
.stat b{font-size:var(--t-h3); line-height:var(--lh-h3); font-weight:600; color:var(--ink);
  font-variant-numeric:tabular-nums}
.stat .na{color:var(--ink-2); font-weight:400; cursor:help}

/* سببُ الفشل بنصّه: «فشل» وحدها لا تُعالَج، والسببُ يُعالَج */
.why{display:flex; gap:var(--s-3); align-items:flex-start; margin-top:var(--s-3);
  padding:var(--s-3) var(--s-4); border-radius:var(--r-card);
  font-size:var(--t-small); line-height:var(--lh-small); max-width:var(--measure)}
.why.bad{background:var(--bad-wash); color:var(--ink-2);
  border:1px solid color-mix(in srgb,var(--bad) 20%,transparent)}
/* ورمزُ الفشل مرسومٌ (D-167) بقياس الشارة (‏١٤، D-185)، ووسطُه على وسط السطر الأوّل (‏٢٤) */
.why-ic{flex:none; color:var(--bad); padding-top:var(--s-1)}
.why-ic svg{width:var(--icon-xs); height:var(--icon-xs); display:block; margin-top:var(--s-0)}
.why b{color:var(--ink)}
.why-t{min-width:0}
/* الموعدُ لاتينيُّ الأرقام ويُعزَل عن اتّجاه الصفحة */
.ago.when{direction:ltr; unicode-bidi:isolate; display:inline-block}

/* ══ صفحتا الدخول والعامل الثاني ═════════════════════════════ */
/* ‏**وعرضُه عرضُ حاويته لا عرضُ محتواه** (D-185): داخل «.main» المرنة كان يُحسَب
   «fit-content»، فسطرٌ لا ينكسر (رأسُ «لم تُبنَ بعد» بحرف الأزرار ‏١٥) مدّه ‏٣٤٥px
   على شاشة ‏٣٢٠ — والصفحةُ كلُّها تُسحَب جانبًا */
.wrap{width:100%; max-width:73.75rem; margin:0 auto; padding:var(--s-6) var(--s-5) var(--s-16)}
.auth{max-width:25rem; margin:12vh auto}
.auth .glyph{margin:0 auto var(--s-4); width:var(--s-16); height:var(--s-16); border-radius:var(--r-card);
  box-shadow:var(--sh-2), 0 0 0 1px var(--mark-ring)}
.auth h1{text-align:center; font-size:var(--t-h1); line-height:var(--lh-h1); font-weight:600; margin:0 0 var(--s-1)}
.auth .lede{text-align:center; color:var(--ink-2); font-size:var(--t-small); line-height:var(--lh-small); margin:0 0 var(--s-5)}
.auth .card{padding:var(--s-5); box-shadow:var(--sh-2)}
/* ── صفحةُ الهبوط (D-193): شاشةٌ واحدةٌ على الهاتف، وزرٌّ أوّليٌّ واحد ─────────────── */
.land{max-width:32rem; margin:8vh auto 0; text-align:center}
.land .glyph{margin:0 auto var(--s-4); width:var(--s-16); height:var(--s-16); border-radius:var(--r-card)}
.land h1{font-size:var(--t-h1); line-height:var(--lh-h1); font-weight:600; margin:0 0 var(--s-2)}
.land-lede{margin:0 auto var(--s-5); color:var(--ink-2); font-size:var(--t-body); line-height:var(--lh-body); max-width:var(--measure)}
.land-cta{width:100%; justify-content:center}
.land-steps{list-style:none; margin:var(--s-6) 0 0; padding:0; display:grid; gap:var(--s-3); text-align:start}
.land-steps li{display:flex; gap:var(--s-3); align-items:flex-start}
.land-steps li > span:last-child{display:flex; flex-direction:column; gap:var(--s-0)}
.land-steps b{font-size:var(--t-ui); line-height:var(--lh-ui); font-weight:600}
.land-steps li > span:last-child > span{font-size:var(--t-small); line-height:var(--lh-small); color:var(--ink-2)}
.land-n{flex:none; display:grid; place-items:center; width:var(--s-8); height:var(--s-8); border-radius:50%;
  background:var(--surface-2); font-weight:600; font-size:var(--t-small)}
.land-pfs{list-style:none; margin:var(--s-6) 0 0; padding:0; display:flex; justify-content:center; gap:var(--s-4); color:var(--ink-2)}
.land-pf svg{width:var(--icon-lg); height:var(--icon-lg)}
.land-foot{margin-top:var(--s-6); display:flex; justify-content:center; gap:var(--s-4); font-size:var(--t-small)}
.auth input{width:100%; direction:ltr; text-align:start; margin-bottom:var(--s-3)}
.auth button{width:100%; justify-content:center; padding:var(--s-3)}
.auth .card form + form{margin-top:var(--s-3)}
.or{display:flex; align-items:center; gap:var(--s-2); color:var(--ink-2); font-size:var(--t-small);
  line-height:var(--lh-small); margin:var(--s-4) 0}
.or::before,.or::after{content:''; flex:1; height:1px; background:var(--line)}
.rec{margin-top:var(--s-4); border:var(--bd); border-radius:var(--r-card); padding:var(--s-3) var(--s-3);
  background:var(--surface)}
.rec summary{cursor:pointer; font-size:var(--t-small); line-height:var(--lh-small); color:var(--ink-2)}
.rec form{margin-top:var(--s-3)}
.cancel{margin-top:var(--s-4); text-align:center}
/* ‏وذيلُ الدخول سطرٌ في الوسط بلا خيط — كان «style» في وسمَي الدخول والعامل الثاني */
.auth footer{border:0; justify-content:center}
.note{font-size:var(--t-small); line-height:var(--lh-small); color:var(--ink-2); margin-top:var(--s-2)}

/* ══ الشاشة الضيّقة: ما دون «md» بلا رافدة (خطّة التصميم 3.3 · D-187) ══════════
   كانت هنا رتبةٌ وسطى (‏721 إلى ‏960) ترفع الرافدةَ شريطًا أفقيًّا فوق المحتوى، وما دون
   ‏720 ينزله إلى الإبهام. **وصارت ما دون ‏900 كلُّها شريطَ الإبهام**: اللوحيُّ في يدٍ
   كالهاتف، وشريطٌ أفقيٌّ يتمرّر يُخفي نصفَ أبوابه. وهذه الكتلةُ أساسُ الشريط، والتي
   تليها تُنزله إلى الأسفل بالشرط نفسِه. */
@media${below('md')}{
  .app{grid-template-columns:1fr}
  .rail{position:static; height:auto; border-inline-start:0; border-bottom:var(--bd)}
  nav.tabs{flex-direction:row; align-items:flex-start; overflow-x:auto; padding:0 var(--s-3) var(--s-2); gap:var(--s-1);
    scrollbar-width:thin}
  nav.tabs .lbl{display:none}
  nav.tabs a{white-space:nowrap; padding:var(--s-2) var(--s-3)}
  nav.tabs .count{margin-inline-start:var(--s-1)}
  /* ‏والحافّتان من «--gutter» (‏١٦ على الجوّال و‏٣٢ فوقه)، والأعلى رتبةٌ أضيق */
  .content{padding-top:var(--s-4)}
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
@media${below('md')}{
  .rail{position:fixed; inset:auto 0 0; z-index:40; height:auto; border:0;
    border-top:var(--bd); box-shadow:var(--sh-2)}
  .rail-head{display:none}
  .topbar .glyph.tb{display:grid}
  /* والحشوُ السفليُّ يحترم شريطَ الجهاز: قضيبُ الإيماء يبتلع صفّا كاملا */
  nav.tabs{padding:var(--s-1) var(--s-1) calc(var(--s-1) + var(--safe-b));
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
  nav.tabs > :not(a[data-bar]):not(.cmdk-open):not(.more-sheet){display:none}
  /*
   * **والرابطُ و«المزيد» قاعدةٌ واحدة.**
   *
   * كُتبا مفترقَين أوّلا، **فقُصّت «المزيد» ببكسل**: حيّزُها ‏١٩ وحرفُها
   * ‏٢٠ — لأنّ قاعدةَ العرض كُتبت لـ «a» وحدَها. **وخانةٌ في صفٍّ واحدٍ
   * تُصاغ مرّتين تفترق مرّةً.**
   */
  nav.tabs > details.more-sheet{flex:1 1 0; min-width:0; display:flex}
  /* ‏وعلى الهاتف فوق شريط الإبهام لا تحته (D-218) */
  .guide .wiz-bar{bottom:calc(var(--s-16) + var(--safe-b))}
  nav.tabs > a[data-bar],nav.tabs > .cmdk-open,nav.tabs > details.more-sheet > summary{
    flex:1 1 0; min-width:0; display:flex; flex-direction:column; gap:var(--s-0);
    align-items:center; justify-content:center; padding:var(--s-1) var(--s-0);
    min-height:var(--tap); border-radius:var(--r-control); text-align:center}
  /* **واللصيقةُ من السلّم لا دونه** (D-167): كانت ‏١٠px والعدُّ ‏٩px — خارجَ
     السلّم كلِّه. ولم يرَهما مدقّقُ السلّم لأنّه لم يرسم إلّا ‏١٤٤٠، حيث لا شريطَ
     إبهام. **وصارت نمطَ «caption»** (D-185 · خطّة التصميم 5.3): ‏١٣px بوزن ‏٦٠٠ وسطرِ
     ‏٢٠، والرمزُ ‏٢٤. ويحرس «audit_mobile» القصَّ عند ‏٣٢٠ و‏٣٩٠. */
  nav.tabs > a[data-bar] span:not(.count),nav.tabs > .cmdk-open span,nav.tabs > details.more-sheet > summary span:not(.count){
    font-size:var(--t-caption); line-height:var(--lh-caption); font-weight:600; width:100%; display:block;
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  nav.tabs > a[data-bar] svg,nav.tabs > .cmdk-open svg,nav.tabs > details.more-sheet > summary svg{
    width:var(--icon-lg); height:var(--icon-lg); opacity:.75}
  /* ‏والاسمُ الأقصرُ للشريط تحت ‏360px وحدَه (خطّة التصميم 5.3) — «منشورات» بلا «ال» */
  nav.tabs > a[data-bar] span.tight{display:none}
  /* والعدُّ شارةٌ فوق الرمز لا رقمٌ بجانب نصٍّ لا يتّسع له */
  nav.tabs .count{position:absolute; top:0; inset-inline-end:calc(50% - var(--s-5));
    margin:0; min-width:var(--s-5); padding:0 var(--s-1)}
  nav.tabs a{position:relative}
  nav.tabs a[aria-current=page]::before{display:none}
  /* ‏والقسمُ الأبُ (D-178) يُلوَّن في الشريط: المنصّةُ المعلَّمةُ تحته مخفيّةٌ هنا */
  nav.tabs a[aria-current=true]{background:var(--selected); color:var(--ink)}
  .cmdk-open:not(.more-panel .cmdk-open){display:none}
  /* ‏«المزيد» ورقةٌ فوق الشريط (D-208): زرُّها خانةٌ كأخواتها، وما فيها صفوفٌ بهدف اللمس وأعدادِها */
  details.more-sheet > summary{list-style:none; cursor:pointer; color:var(--ink-2); position:relative}
  details.more-sheet > summary::-webkit-details-marker{display:none}
  details.more-sheet[open] > summary{background:var(--selected); color:var(--ink)}
  .more-panel{position:fixed; inset-inline:0; bottom:calc(var(--s-16) + var(--safe-b)); z-index:41;
    display:flex; flex-direction:column; gap:var(--s-1); padding:var(--s-3);
    background:var(--surface); border-top:var(--bd); box-shadow:var(--sh-3); border-radius:var(--r-sheet) var(--r-sheet) 0 0}
  .more-panel a,.more-panel .cmdk-open{display:flex; align-items:center; gap:var(--s-3); min-height:var(--tap);
    padding:var(--s-2) var(--s-3); border:0; background:none; color:var(--ink); text-align:start;
    font-size:var(--t-ui); line-height:var(--lh-ui); font-weight:600}
  .more-panel svg{width:var(--icon-md); height:var(--icon-md); flex:none}
  nav.tabs .more-panel .count{position:static; margin-inline-start:auto}
  nav.tabs .more-panel .cmdk-open{width:100%; justify-content:flex-start}
  nav.tabs .more-panel .cmdk-open span{display:inline}
  /* ‏«منشور جديد» العائم (5.3 · D-208): ‏56px فوق الشريط بـ16px، في طرف السطر، والقائمةُ تنفتح فوقه */
  details.fab{display:block; position:fixed; z-index:39; inset-inline-end:var(--s-4);
    bottom:calc(var(--s-16) + var(--safe-b) + var(--s-4))}
  details.fab > summary{list-style:none; cursor:pointer; display:flex; align-items:center; gap:var(--s-2);
    min-height:calc(var(--s-12) + var(--s-2)); padding:0 var(--s-5); border-radius:var(--r-sheet); box-shadow:var(--sh-3);
    background:var(--brand); color:var(--on-brand); font-size:var(--t-ui); line-height:var(--lh-ui); font-weight:600}
  details.fab > summary::-webkit-details-marker{display:none}
  details.fab > summary svg{width:var(--icon-lg); height:var(--icon-lg)}
  .fab-menu{position:absolute; bottom:calc(100% + var(--s-2)); inset-inline-end:0; min-width:max-content;
    display:flex; flex-direction:column; padding:var(--s-2); background:var(--surface); border:var(--bd);
    border-radius:var(--r-card); box-shadow:var(--sh-3)}
  .fab-menu a{display:flex; align-items:center; min-height:var(--tap); padding:var(--s-2) var(--s-3);
    color:var(--ink); font-size:var(--t-ui); line-height:var(--lh-ui); text-decoration:none}
  /* ‏ولا يغطّي شيئًا: حشوٌ بقدر الزرّ فوق حشو الشريط، ويختفي في الكتابة والمحرّر والألواح الأخرى */
  body:has(details.fab) .content > footer{margin-bottom:var(--s-16)}
  /* ‏ولا في «المنشورات»: رأسُها يحمل الأبوابَ الأربعة، والزرُّ فوق «اكتب المسوّدات» ابتلع ضغطتَها في ر-2·stop —
     الحقلُ يفقد التركيز عند اللمس فيعود الزرُّ تحت الإصبع. فيختفي ما دام في نموذجٍ تركيز، لا في الحقل وحدَه */
  body[data-pane]:not([data-pane=overview]):not([data-pane=library]) details.fab,
  body:has(#ed) details.fab,body:has(form:focus-within) details.fab{display:none}
  /* **والمحتوى لا يختفي تحت الشريط**: حشوٌ بقدره وقدرِ شريط الجهاز.
     والشريطُ ‏٥٢px (هدفٌ ‏٤٤ وحشوٌ ‏٨)، **فـ«--s-16» تتركه ‏١٢ فوقه** — وكان
     ‏٦٤ + ‏١٦ = ‏٨٠، رقمًا خارج السلّم أمسكه مدقّقُ السلّم عند ‏٣٩٠ (D-167) */
  .content{padding-bottom:calc(var(--s-16) + var(--safe-b))}

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
   *
   * **وصفُّ البتّ وحدَه — «.act»** (رحلات R-3 وR-6 وR-9): كانت القاعدةُ على كلّ
   * «.draft-foot»، فالتصق صفُّ البطاقة المقروءة («90 / 280 · اعتمدها …») بلا زرٍّ
   * فيه، وغطّى رأسَها وحبّةَ «مجدولة» حين يدخل من أسفل الشاشة.
   */
  .draft-foot.act{position:sticky; z-index:5;
    bottom:calc(var(--s-16) + var(--safe-b));
    background:var(--surface); border-radius:var(--r-card);
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
/* **واسمُ المزوّد يأخذ السطرَ كلَّه** حين لا تسع الأعمدةُ الثابتة: قِيس عند ‏٣٩٠px فوُجد
   ‏٢٠px عرضا — «flex:1» بجانب أعمدةٍ ثابتةِ العرض تركت له ما بقي، وما بقي لا يسع حرفا،
   فالتفّ الاسمُ حرفا حرفا فوق أخيه (D-123). فيلتفّ الصفُّ ويسقط النموذجُ من السطر —
   الاسمُ والحالُ والإنفاقُ تكفي للفرز، والنموذجُ في اللوح.
   **وبعرض القائمة لا بعرض الشاشة** (مراجعة D-187): كانت «sm» فعاد العيبُ نفسُه بين ‏600
   و‏690 (الحافّةُ ‏32) وبين ‏900 و‏945 (الرافدة) — الاسمُ ‏0px و«تفاصيل» مقصوصٌ ‏67px خارج
   القائمة. والحدُّ «CQ.prow» في «tokens.ts»، و«audit_mobile» يقيس القصَّ عند ‏600 و‏900.
   **وموضعُها بعد قاعدة الصفّ الأصليّة**: قبلها تدهسها القاعدةُ بتساوي المحدّد — وكذلك
   كانت «.pst» و«.pv» بعرضهما الثابت في الجوّال، فلم يسرِ «width:auto» قطّ حتّى نُقلت. */
@container plist ${narrower('prow')}{
  .prow>summary{flex-wrap:wrap; gap:var(--s-2)}
  .prow .pn{flex:1 1 100%}
  .prow .pm{display:none}
  .prow .pst{width:auto}
  .prow .pv{width:auto; margin-inline-start:auto}
}
/* ‏ودون ‏360px يُبدَّل الاسمُ بأقصره ويصير حشوُ الخانة صفرًا (خطّة التصميم 5.3، D-185) */
@media${below('xs')}{
  nav.tabs > a[data-bar] span.wide{display:none}
  nav.tabs > a[data-bar] span.tight{display:block}
}
/* والشريطُ السفليُّ للجوّال وحدَه: في المكتب تبقى الرافدةُ عمودا */
@media${atLeast('md')}{details.more-sheet,details.fab{display:none}}
/* ‏«منشور جديد» في الترويسة على العريض، والعائمُ مكانه على الضيّق (D-216) */
@media${below('md')}{details[data-tb-new]{display:none}}
/* ‏وبابُ «المنشورات» الواحدُ على الضيّق وحدَه: على العريض يكفي زرُّ الترويسة (D-225) */
@media${atLeast('md')}{details[data-head-new]{display:none}}
@media${below('sm')}{
  .scroll{overflow:visible; margin:0}
  /* **والجدولُ المحوريُّ مستثنًى** (D-151): أعمدتُه أرقامٌ تُقارَن، وتكديسُها
     يُسقط رؤوسَها؛ فيبقى جدولًا ويتمرّر في .pv-wrap كما صُمّم. */
  table:not(.pv){min-width:0; display:block}
  table:not(.pv) thead{position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0)}
  table:not(.pv) tbody,table:not(.pv) tr,table:not(.pv) td{display:block; width:100%}
  table:not(.pv) tr{border:var(--bd); border-radius:var(--r-card); padding:var(--s-3); margin-bottom:var(--s-2);
    background:var(--surface-2)}
  @media(hover:hover){table:not(.pv) tbody tr:hover{background:var(--surface-2)}}
  table:not(.pv) td{border:0; padding:var(--s-1) 0}
  table:not(.pv) td::before{content:attr(data-label); display:block; font-size:var(--t-caption);
    line-height:var(--lh-caption); font-weight:600; color:var(--ink-2); margin-bottom:var(--s-0)}
  table:not(.pv) td:first-child::before{display:none}
}
/* ── الوثائق العامّة ──────────────────────────────────────────────────
   عمودٌ واحدٌ مقيَّدُ العرض: سطرٌ يمتدّ عبر شاشةٍ عريضة يُقرأ بعينٍ تقفز،
   وهذه صفحةٌ يُراد لها أن تُقرأ لا أن تُتصفَّح. */
.doc{max-width:51.25rem; margin:0 auto; padding:var(--s-10) var(--s-5) var(--s-16); background:var(--bg)}
.doc header{border-bottom:var(--bd); padding-bottom:var(--s-5); margin-bottom:var(--s-2)}
.doc .glyph{width:var(--s-10); height:var(--s-10); margin-bottom:var(--s-3)}
/* والوثيقةُ عمودُ قراءةٍ بعرض «--measure» (خطّة التصميم 5.4، القالب T5)، وأدوارُها
   أدوارُ اللوحة: عنوانُ الصفحة، وعنوانُ القسم، والمتن (D-185) */
.doc h1{font-size:var(--t-h1); line-height:var(--lh-h1); font-weight:600; margin:0 0 var(--s-2)}
.doc h2{font-size:var(--t-h2); line-height:var(--lh-h2); font-weight:600; margin:var(--s-8) 0 var(--s-2)}
.doc .lede{font-size:var(--t-body); line-height:var(--lh-body); color:var(--ink-2);
  margin:0 0 var(--s-3); max-width:var(--measure)}
.doc p{font-size:var(--t-body); line-height:var(--lh-body); color:var(--ink-2); margin:0 0 var(--s-3)}
.doc ul{margin:0 0 var(--s-3); padding-inline-start:var(--s-5)}
.doc li{font-size:var(--t-body); line-height:var(--lh-body); color:var(--ink-2); margin-bottom:var(--s-2)}
.doc b{color:var(--ink)}
.doc a{color:var(--link); text-underline-offset:var(--ul-off)}
.doc table{font-size:var(--t-small); line-height:var(--lh-small)}
.doc td b{font-weight:600}
/* «ما لا يقع» أبرزُ ما في الصفحة: هو ما يبحث عنه المراجع أوّلا */
.doc ul.never{list-style:none; padding:0; margin:0}
.doc ul.never li{background:var(--surface-2); border:var(--bd-soft);
  border-radius:var(--r-card); padding:var(--s-3) var(--s-3); margin-bottom:var(--s-2)}
/* مصطلحٌ لا يُكسَر عند شرطته: «AES-» في سطرٍ و«GCM» في التالي يُقرأ اسمين */
.doc .nb{white-space:nowrap}
.doc footer{margin-top:var(--s-10); padding-top:var(--s-4); border-top:var(--bd); font-size:var(--t-small); line-height:var(--lh-small)}

/* ── الطباعة ──────────────────────────────────────────────────────────
   مراجعُ منصّةٍ قد يطبع سياسة الخصوصيّة، وصفحةٌ تخرج برافدةٍ وأزرارٍ
   وظلالٍ تُقرأ مسوّدةً لا وثيقة. فيبقى النصُّ وحده على بياض.

   والروابطُ تُطبَع بعناوينها: ورقةٌ فيها «اضغط هنا» لا تُتابَع. */
@media print{
  @page{margin:18mm}
  *{box-shadow:none!important; transition:none!important}
  html,body{background:#fff!important; color:#000!important}
  .rail,.topbar,.seg,.skip,footer,nav.tabs,button,.btn,form{display:none!important}
  .app{display:block}
  /* والهوامشُ من @page لا من الحاوية: حاويةٌ بلا حدٍّ أقصى تمدّ السطرَ
     عبر الورقة كلّها، وقيدُ المقاس على الفقرات يبقى قائما */
  .content,.doc{padding:0; margin:0; max-width:100%}
  .card,.ch,.draft{border:1px solid #ccc; break-inside:avoid; page-break-inside:avoid}
  section[data-pane][hidden]{display:none!important}
  h1,h2,h3{break-after:avoid; page-break-after:avoid}
  a[href^="http"]::after{content:' (' attr(href) ')'; font-size:var(--t-caption); color:#555}
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
/* ‏فقرةُ البطاقة العامّة — لا فقراتُ ما نُقل إليها في ٢ج (ملحوظةُ القناة وسببُ المسوّدة ومتنُ المعاينة لها
   قياسُها)، و«:where» يُبقي الوزنَ ‏(0,1,1) كما كان فلا يغلب صنفًا كان يغلبه */
.card:where(:not(.ch,.draft,.pv)) > p{margin:var(--s-3) 0 0; font-size:var(--t-small); color:var(--ink-2);
  line-height:var(--lh-small); max-width:var(--measure)}
.card:where(:not(.ch,.draft,.pv)) > h2 + p{margin-top:var(--s-2)}

/* ── صندوقُ التنبيهات (D-109) ─────────────────────────────────────────
   صفٌّ لكلّ ما خرج: حالُه ومتنُه ورمزُ الردّ. **والحالُ لونٌ ورمزٌ ونصّ**
   (D-043) — ‏٤٠٤ حمراءُ وحدَها لا تُقرأ، ومعها «✕ نشرٌ فشل» تُقرأ. */
.ax{margin:var(--s-3) 0 0; padding:0; list-style:none;
  display:flex; flex-direction:column; gap:var(--s-2)}
.ax-r{display:flex; align-items:center; gap:var(--s-2); flex-wrap:wrap;
  padding:var(--s-2); border:var(--bd-soft)}
/* ‏والمتنُ يلتفّ ولا يُقصّ (D-185): يُقتضَب في الخادم إلى سبعين حرفًا، فقصُّه بالنقاط
   فوق ذلك يُخفي آخرَ ما بقي — وبحرف ‏١٤ صار يُقصّ ‏٩٥px («measure_text») */
.ax-b{min-width:0; flex:1 1 14rem; font-size:var(--t-small); line-height:var(--lh-small); color:var(--ink-2);
  overflow-wrap:anywhere}
.chip.bad{color:var(--bad); background:var(--bad-wash);
  border-color:color-mix(in srgb,var(--bad) 28%,transparent)}

/* ── اليومُ الأوّل (D-108) ─────────────────────────────────────────────
   خطواتٌ مرقّمةٌ لا بطاقات: **الترتيبُ هو المعلومة** — كلُّ خطوةٍ تفتح
   التي بعدها، وشبكةٌ من خمسٍ تقول «افعل أيَّها شئت» وهو ليس صحيحا.


/* ── الموعدُ بوجهين (D-106) ───────────────────────────────────────────
   سطرٌ فوق سطر: توقيتُ الرياض كما كتبه الخادم (D-201)، وتحته قراءةُ متصفّحٍ في منطقةٍ أخرى. **ولا
   يُصدَّق أحدُهما على حساب الآخر** — فمن أخفى الثانيَ جعل المالكَ يحوّل
   ذهنيّا، ومن أخفى الأوّلَ محا الصيغةَ التي في القاعدة والتقارير.

   والمحلّيُّ أخفتُ وأصغر: **هو الأليفُ الذي يُقرأ بلمحة**، والأوّلُ هو
   الذي يُنسَخ ويُقارَن. */
.when-t{display:inline-flex; flex-direction:column; gap:1px; vertical-align:middle}
.when-t .tz{font-size:var(--t-caption); line-height:var(--lh-caption); color:var(--ink-2); font-weight:600}

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
/* ورابطُ الإصلاح بحبر الرابط كروابط الوثيقة — لا أزرقُ المتصفّح: الورقةُ
   لا تلوّن «a» عامّةً، فرابطٌ بلا قاعدةٍ يخرج بلونٍ لا يعرفه الثيمان */
.hint.ready a{color:var(--link); font-weight:600; text-underline-offset:var(--ul-off)}

[hidden]{display:none!important}

.cmdk-veil{position:fixed; inset:0; z-index:100; padding:12vh var(--s-4) var(--s-4);
  display:flex; justify-content:center; align-items:flex-start;
  background:var(--scrim)}
@supports (backdrop-filter:blur(2px)){
  .cmdk-veil{backdrop-filter:blur(var(--ring-w))}
}
.cmdk{width:min(40rem,100%); max-height:76vh; display:flex; flex-direction:column;
  background:var(--dialog); border:var(--bd);
  border-radius:var(--r-card); box-shadow:var(--sh-3); overflow:hidden}
.cmdk-in{display:flex; align-items:center; gap:var(--s-3);
  padding:var(--s-3) var(--s-4); border-bottom:var(--bd)}
.cmdk-in input{flex:1; min-width:0; min-height:var(--tap); border:0; background:none; outline:none;
  font:inherit; font-size:var(--t-input); line-height:var(--lh-input); color:var(--ink)}
.cmdk-in input::placeholder{color:var(--ink-3)}
/* الحقلُ بلا حدٍّ فلا يتبدّل لونُه عند التركيز؛ خيطٌ تحته بحبر التركيز يقول «هنا» (D-149) —
   وكان نحاسيًّا، فصار حبرَ التركيز نفسَه (D-187) */
.cmdk-in:focus-within{box-shadow:inset 0 calc(-1 * var(--stroke)) 0 var(--focus)}
.cmdk-l{flex:1; margin:0; padding:var(--s-2); list-style:none; overflow-y:auto}
.cmdk-g{padding:var(--s-3) var(--s-3) var(--s-1); font-size:var(--t-caption);
  line-height:var(--lh-caption); font-weight:600; color:var(--ink-2)}
/* الخيارُ رابطٌ يبقى رابطا: يُفتَح بالوسط ويُنسَخ عنوانُه كأيّ رابط */
.cmdk-o{display:flex; align-items:center; gap:var(--s-3); text-decoration:none;
  padding:var(--s-2) var(--s-3); border-radius:var(--r-control); color:var(--ink);
  min-height:var(--tap); transition:background var(--dur-1) var(--ease)}
/* **والمختارُ يُعلَّم بأكثرَ من لون** (D-043): أرضيّةٌ وشريطٌ جانبيّ،
   فمن لا يميّز اللونَ يرى الشريط. */
.cmdk-o[aria-selected="true"]{background:var(--surface-2);
  box-shadow:inset calc(-1 * var(--ring-w)) 0 0 var(--brand)}
@media(hover:hover){.cmdk-o:hover{background:var(--hover)}}
.cmdk-i{flex:none; display:grid; place-items:center; width:var(--icon-md); color:var(--ink-3)}
.cmdk-i svg{width:var(--icon-md); height:var(--icon-md); display:block}
.cmdk-o[aria-selected="true"] .cmdk-i{color:var(--brand)}
.cmdk-t{min-width:0; display:flex; flex-direction:column; gap:1px}
.cmdk-t b{font-size:var(--t-ui); font-weight:600; line-height:var(--lh-ui);
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
.cmdk-t em{font-style:normal; font-size:var(--t-small); line-height:var(--lh-small); color:var(--ink-2);
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
.cmdk-none{margin:0; padding:var(--s-6) var(--s-4); text-align:center;
  font-size:var(--t-small); line-height:var(--lh-small); color:var(--ink-2)}
.cmdk-foot{display:flex; align-items:center; gap:var(--s-3); flex-wrap:wrap;
  padding:var(--s-2) var(--s-4); border-top:var(--bd);
  background:var(--surface-2); font-size:var(--t-small); line-height:var(--lh-small); color:var(--ink-2)}
.cmdk-foot b{margin-inline-start:auto; font-weight:400; color:var(--ink-2)}
/* والمفتاحُ نمطُ «code» بخطّ الصفحة (D-185): «Ctrl K» نصٌّ لاتينيٌّ معزول، لا «⌘» ليس في Plex */
.kbd{display:inline-block; padding:0 var(--s-1); border-radius:var(--r-inline);
  border:var(--bd); background:var(--surface);
  font-family:inherit; font-size:var(--t-code); line-height:var(--lh-code); font-weight:400;
  color:var(--ink-2); direction:ltr; unicode-bidi:isolate; white-space:nowrap}
/* والزرُّ يقول اختصارَه: اختصارٌ لا يُعلَن لا يعرفه إلّا من كتبه */
/* وارتفاعُه ارتفاعُ جاره: قِيس زرُّ الخروج ‏٤٤ وهذا ‏٣٤، **وزرّان
   متجاوران بارتفاعين يُقرآن رتبتين** — ولا رتبةَ بينهما. و‏٤٤ هدفُ
   اللمس الأدنى (D-102) لا اختيارَ ذوق. */
.cmdk-open{display:inline-flex; align-items:center; gap:var(--s-2); min-height:var(--tap);
  border:var(--bd); background:var(--surface-2); cursor:pointer; color:var(--ink-2);
  font:inherit; font-size:var(--t-ui); line-height:var(--lh-ui); font-weight:400;
  transition:border-color var(--dur-1) var(--ease), color var(--dur-1) var(--ease);
  border-radius:var(--r-pill); padding:0 var(--s-4)}
@media(hover:hover){
  .cmdk-open:hover{border-color:var(--field); color:var(--ink-2)}
}
/* والابنُ المباشرُ وحدَه: رمزُ البحث ‏١٦ بجوار نصٍّ ‏١٥ (خطّة التصميم 3.4) */
.cmdk-open>svg{width:var(--icon-sm); height:var(--icon-sm); display:block}
@media${below('sm')}{
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
   المستقلّة و«ما خرج» (D-140). وكانت فيه مجموعةُ وجه العرض الكوفيّ (D-143 ثمّ D-144)،
   وحُذفت مع «--font-display» (D-185). والقراراتُ بأسبابها في DECISIONS.md. */

/* ‏وكانت هنا «الرتبةُ الكبرى على العريض» (D-139): عنوانُ الصفحة والرقمُ الأوّل ‏٥٦px.
   حُذفت مع السلّم القديم (D-185): العنوانُ ‏٢٨ والرقمُ البطل ‏٤٠ من رمزيهما في كلّ عرض. */
@media(hover:hover){.btn-primary:hover{background:var(--brand-hover)}}


/* ── الشاشةُ المستقلّة تحمل العلامة (D-140) ─────────────────────────────
   شريطُ العودة يبدأ بالعلامة واسمِها بابًا إلى اللوحة، ثمّ سهمُ العودة.
   وخيطٌ تحته يفصله عن الرأس كما يفصل الشريطُ العلويُّ اللوحةَ. */
nav.back .home{display:inline-flex; align-items:center; gap:var(--s-2); color:var(--ink);
  text-decoration:none; padding-inline-end:var(--s-3);
  border-inline-end:var(--bd)}
/* **والعلامةُ لا تنكمش**: قِيس رسمُها ‏٣px عرضًا لأنّ الرابطَ عنصرٌ مرنٌ يقبل
   الانكماش حتّى ‏٤٤ ونسبةُ الرسم من صندوقٍ انكمش. فالثباتُ بالبكسل لا بالنسبة. */
nav.back .home,nav.back .home .glyph{flex:none}
.glyph-sm{width:var(--s-8); height:var(--s-8); border-radius:var(--r-control)}
/* وعلى ‏٣٢٠px تبقى العلامةُ ويسقط اسمُها: قِيس الشريطُ يفيض ‏١٠px بالاسم
   والسهم ومبدّل الثيم معًا، والعلامةُ وحدَها تقول ما يقوله الاسم.
   **ويضيق الفاصلُ كذلك**: عاد المبدّلُ إلى الشريط في كلّ صفحةٍ برافدة (ذيلُها
   مخفيٌّ في الضيّق)، فقِيس يفيض ‏١٩px بـ«المنشورات» — وثلاثةُ فواصلَ من ‏١٦ إلى ‏٨ تسعه.
   **ثمّ اتّسع المقطعُ في ٢ب** (‏١٤٤ ← ‏١٦٣px) فانكمش رابطُ العودة إلى ‏٤٩px ونصُّه ‏٨٦: «المنشو»
   تحت المبدّل، و«الرئيسيّة» في صفحتَي الخطأ (مراجعةُ D-189). **والفاصلُ لا يُضيَّق مرّةً أخرى**:
   الشريطُ يلتفّ (أعلاه)، والرابطُ يُقاس بعرض نصّه فينزل المبدّلُ سطرًا إلى طرفه حين لا يسعهما
   سطر؛ ويعود حشوُ المقطع هنا إلى ‏٨ فيسعهما سطرٌ في أكثر الصفحات. و«audit_mobile» يقيس نصَّ
   كلِّ رابطٍ في الشريط على صندوقه وعلى جيرانه. */
nav.back .seg{margin-inline-start:auto}
/* **والعلامةُ مرّةً في الشاشة** (خطّة التصميم 3.6 · D-187): حيث الرافدةُ ظاهرةٌ رأسُها
   يحمل العلامة، فبابُ اللوحة في شريط العودة علامةٌ ثانية — وموضعُ نحاسٍ رابع. فيغيب
   هناك ويبقى حيث لا رافدة: ما دون «md»، والصفحةُ بلا رافدة («.wrap» وحدها). */
@media${atLeast('md')}{.app nav.back .home{display:none}}
@media${below('sm')}{nav.back .home .wordmark{display:none} nav.back .home{padding-inline-end:var(--s-2)}
  nav.back{gap:var(--s-2)} nav.back .seg button{padding-inline:var(--s-2)}}

/* ── «ما خرج»: صفوفٌ لا بطاقاتٌ في بطاقة (D-140) ──────────────────────── */
.slices{display:flex; flex-direction:column}
.slice{display:flex; align-items:center; gap:var(--s-4); flex-wrap:wrap;
  padding:var(--s-3) 0; border-bottom:var(--bd-soft)}
.slice:last-child{border-bottom:0}
.slice-id{display:flex; align-items:center; gap:var(--s-3); flex-wrap:wrap; min-width:0}
.slice h3{font-size:var(--t-ui); line-height:var(--lh-ui); font-weight:600}
.slice .stats{margin:0; margin-inline-start:auto; padding:0; border-top:0}
.slice .chip{margin:0}


/* ── شريطُ المؤشّرات: سطحٌ واحدٌ وخيوط (D-143) ───────────────────────────
   بطاقةٌ كسائر البطاقات (D-187): حدُّها «--line» وظلُّها الأوّل. وكان رأسُها نحاسيًّا
   (‏2px) — نحاسٌ على حدّ بطاقة — فسقط، وبقي في الرقم البطل وحدَه. */
.grid.tiles{gap:1px; padding:0; background:var(--line); overflow:hidden}
.grid.tiles>.tile{border:0; border-radius:0; box-shadow:none; background:var(--surface);
  background-image:none; padding:var(--s-5d) var(--s-5d)}
@media(hover:hover){.todo>li>a.btn:hover,.todo>li>form .btn:hover{background:var(--hover);
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
.acct{padding:0; overflow:hidden; margin-bottom:var(--s-5)}
.acct-cover{position:relative; block-size:7.5rem; background-color:var(--surface-2);
  border-block-end:var(--bd)}
.acct-x .acct-cover{block-size:9rem}
.acct-youtube .acct-cover{block-size:6rem}
.acct-instagram .acct-cover,.acct-tiktok .acct-cover{display:none}
.acct-mark{position:absolute; inset-inline-end:var(--s-6); inset-block-end:var(--s-5); color:var(--ink-3); opacity:.5}
.acct-mark svg{inline-size:var(--s-10); block-size:var(--s-10); display:block}
.acct-body{position:relative; display:flex; align-items:flex-end; gap:var(--s-5); flex-wrap:wrap;
  padding:var(--s-12) var(--s-6) var(--s-5)}
.acct-av{flex:none; display:grid; place-items:center; inline-size:6rem; block-size:6rem; border-radius:50%;
  background-color:var(--surface-3); color:var(--ink-2); border:var(--s-1) solid var(--surface);
  font-size:var(--t-h1); font-weight:600; line-height:var(--lh-h1);
  position:absolute; inset-block-start:calc(var(--s-12) * -1); inset-inline-start:var(--s-6)}
.acct-av[data-kind="org"]{border-radius:var(--r-card)}
/* وبلا غلافٍ يعود إلى السطر: لا شيءَ يتداخل معه */
.acct-instagram .acct-av,.acct-tiktok .acct-av{position:static}
.acct-instagram .acct-body,.acct-tiktok .acct-body{padding-block-start:var(--s-5)}
.acct-id{flex:1 1 20rem; min-inline-size:0}
.acct-id h1{margin:var(--s-1) 0 0; font-size:var(--t-h1); line-height:var(--lh-h1); font-weight:600}
.acct-sub{margin:var(--s-1) 0 0; color:var(--ink-2); font-size:var(--t-small); line-height:var(--lh-small)}
.acct-counts{display:flex; flex-wrap:wrap; gap:var(--s-2) var(--s-5); margin:var(--s-3) 0 0; padding:0;
  list-style:none; color:var(--ink-2); font-size:var(--t-small); line-height:var(--lh-small)}
.acct-counts b{color:var(--ink); font-weight:600; font-variant-numeric:tabular-nums}
.acct-counts .bad b{color:var(--bad)}
.acct-act{display:flex; flex-direction:column; align-items:flex-end; gap:var(--s-3)}
.acct-verdict{display:inline-flex; align-items:center; gap:var(--s-2)}
.acct-card{margin-bottom:var(--s-3)}

/* ما تطلبه المنصّة: سبعُ خاناتٍ متساوية، القاعدةُ سطرٌ وحالُ المنصّة تحته.
   والساقطةُ تُرى بحدٍّ لا بلونٍ وحدَه، والخانةُ رابطٌ بهدف لمسٍ كامل. */
.needs{margin-bottom:var(--s-5)}
.needs-h{display:flex; align-items:baseline; gap:var(--s-3); margin:0 0 var(--s-3); font-size:var(--t-h2);
  line-height:var(--lh-h2); font-weight:600}
.needs-list{display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); gap:var(--s-2); margin:0; padding:0; list-style:none}
.needs-list a{display:flex; flex-direction:column; gap:var(--s-1); block-size:100%; min-block-size:var(--tap);
  padding:var(--s-3); color:var(--ink)}
.needs-top{display:flex; align-items:center; gap:var(--s-2); font-size:var(--t-small); line-height:var(--lh-small)}
.needs-top .step-n{font-size:var(--t-caption); line-height:var(--lh-caption); font-weight:600; color:var(--ink-2);
  font-variant-numeric:tabular-nums}
.needs-g{margin-inline-start:auto; display:inline-flex}
.needs-g svg{inline-size:var(--icon-xs); block-size:var(--icon-xs)}
.needs-rule{font-size:var(--t-small); color:var(--ink-2); line-height:var(--lh-small)}
.needs-now{font-size:var(--t-small); color:var(--ink-2); font-weight:600; line-height:var(--lh-small)}
.needs-list .ok .needs-g{color:var(--ok)}
.needs-list .warn .needs-g{color:var(--warn)}
.needs-list .idle .needs-g{color:var(--ink-3)}
.needs-list .bad a{border-color:var(--bad); background-color:var(--bad-wash)}
.needs-list .bad .needs-g,.needs-list .bad .needs-now{color:var(--bad)}
@media${below('lg')}{.needs-list{grid-template-columns:repeat(4,minmax(0,1fr))}}
@media${below('sm')}{
  /* وعلى الجوّال خانتان في الصفّ، والقاعدةُ تُطوى وتبقى الحال: المنشورُ الأوّلُ
     قبل الشاشة الثانية لا بعدها */
  .needs-list{grid-template-columns:repeat(2,minmax(0,1fr))}
  .needs-rule{display:none}
  .needs-list a{padding:var(--s-2) var(--s-3)}
  .acct-cover,.acct-x .acct-cover,.acct-youtube .acct-cover{block-size:4.5rem}
  .acct-counts{gap:var(--s-1) var(--s-3)}
  .acct-body{padding:var(--s-10) var(--s-4) var(--s-4)}
  .acct-av{inline-size:4.5rem; block-size:4.5rem; inset-block-start:calc(var(--s-10) * -1);
    inset-inline-start:var(--s-4)}
  .acct-act{align-items:stretch; inline-size:100%}
  .acct-act .btn{justify-content:center}
}

/* ── المنشورُ كما سيظهر ───────────────────────────────────────────────
   بنيةُ المنصّة وجلدُ صدى: خطُّ اللوحة وحبرُها، بلا لون المنصّة ولا
   أيقوناتها. والإطارُ صورةُ المنشور وحدَه؛ الحالُ والأزرارُ خارجه. */
.np-list{display:flex; flex-direction:column; container:np-list/inline-size}
.np-row{display:grid; grid-template-columns:8.5rem minmax(0,var(--np-w-li)) minmax(0,1fr); gap:var(--s-5);
  align-items:start; padding-block:var(--s-5); border-block-end:var(--bd-soft);
  scroll-margin-block-start:var(--s-16)}
.np-row:target{outline:var(--stroke) solid var(--ring); outline-offset:var(--s-2); border-radius:var(--r-card)}
.np-when{display:flex; flex-direction:column; gap:var(--s-1); align-items:flex-start}
.np-dayl{font-size:var(--t-small); line-height:var(--lh-small); color:var(--ink-2); font-weight:600}
.np-clock{font-size:var(--t-h3); line-height:var(--lh-h3); font-weight:600; font-variant-numeric:tabular-nums}
.np-utc{font-size:var(--t-small); line-height:var(--lh-small); color:var(--ink-2); font-variant-numeric:tabular-nums}
.np-under{display:flex; flex-direction:column; align-items:flex-start; gap:var(--s-2); font-size:var(--t-small); line-height:var(--lh-small)}
.np-acc{color:var(--ink-2); font-weight:600}
.np-result{color:var(--ink-2)}
.np-result b{color:var(--ink); font-variant-numeric:tabular-nums}
.np-why{display:flex; gap:var(--s-2); margin:0; color:var(--bad)}
.np-why-ic{display:inline-flex; padding-top:var(--s-1)}
.np-why-ic svg{inline-size:var(--icon-xs); block-size:var(--icon-xs)}
.np-day{position:sticky; inset-block-start:0; z-index:1; margin:var(--s-5) 0 0; padding-block:var(--s-2);
  background-color:var(--bg); color:var(--ink-2); font-size:var(--t-small); line-height:var(--lh-small); font-weight:600;
  border-block-end:var(--bd)}
.np-note{margin:var(--s-6) 0 0; color:var(--ink-2); font-size:var(--t-small); line-height:var(--lh-small)}
.acct-more{margin-block:var(--s-4)}

.np{container-type:inline-size; inline-size:100%; margin:0; background-color:var(--surface); color:var(--ink);
  border:var(--bd); border-radius:var(--r-control); overflow:hidden; font-size:var(--t-body);
  line-height:var(--lh-body); box-shadow:var(--sh-1)}
.np-li{max-inline-size:var(--np-w-li)}
.np-ig{max-inline-size:var(--np-w-li)}
.np-tt,.np-yt{max-inline-size:var(--np-w-clip); border:0; border-radius:var(--r-card);
  background-color:var(--np-stage); color:var(--np-on-stage)}
.np-head{display:flex; align-items:center; gap:var(--s-3); padding:var(--s-3) var(--s-4) 0}
.np-who{display:flex; flex-direction:column; min-inline-size:0}
.np-name{font-weight:600}
.np-meta{display:inline-flex; align-items:center; gap:var(--s-1); color:var(--ink-2); font-size:var(--t-small); line-height:var(--lh-small)}
.np-meta svg{inline-size:var(--icon-xs); block-size:var(--icon-xs)}
.np-end{margin-inline-start:auto; display:inline-flex; align-items:center; gap:var(--s-3); color:var(--ink-2)}
.np-end svg{inline-size:var(--icon-md); block-size:var(--icon-md)}
.np-av{flex:none; display:grid; place-items:center; inline-size:var(--s-12); block-size:var(--s-12); border-radius:50%;
  background-color:var(--surface-3); color:var(--ink-2); font-weight:600; font-size:var(--t-h3); line-height:var(--lh-h3)}
.np-av[data-kind="org"]{border-radius:var(--r-control)}
.np-text{margin:0; padding:var(--s-3) var(--s-4); white-space:pre-wrap; overflow-wrap:anywhere;
  unicode-bidi:plaintext; max-inline-size:var(--measure)}
.np-tag{color:var(--brand); font-weight:600}
.np-media{background-color:var(--surface-2); border-block:var(--bd-soft)}
.np-media>img,.np-media>video{display:block; inline-size:100%; block-size:auto; max-block-size:calc(100cqi * 1.25);
  object-fit:contain; margin-inline:auto}
/* الاختصارُ بهامشٍ لا بحشوة: الحشوةُ داخل الصندوق المقصوص فيطلّ منها نصفُ سطرٍ رابع */
.np-compact .np-text{display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:3; overflow:hidden;
  padding:0; margin:var(--s-3) var(--s-4)}
.np-x.np-compact .np-text{margin-inline:0}
.np-compact .np-media>img,.np-compact .np-media>video{max-block-size:18.75rem}
.np-counts{display:flex; gap:var(--s-2); padding:var(--s-2) var(--s-4); color:var(--ink-2); font-size:var(--t-small); line-height:var(--lh-small)}
.np-counts b{font-weight:600; font-variant-numeric:tabular-nums}
.np-bar{display:flex; align-items:center; gap:var(--s-4); padding:var(--s-2) var(--s-4) var(--s-3);
  color:var(--ink-2); font-size:var(--t-small); line-height:var(--lh-small)}
.np-bar span{display:inline-flex; align-items:center; gap:var(--s-1)}
.np-bar svg{inline-size:var(--icon-md); block-size:var(--icon-md)}
.np-bar b{font-weight:400; font-variant-numeric:tabular-nums}
.np-bar-li{display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); border-block-start:var(--bd-soft);
  padding-block-start:var(--s-2); margin-inline:var(--s-2)}
.np-bar-li span{justify-content:center; font-weight:600; min-width:0; flex-wrap:wrap; text-align:center}
.np-x{max-inline-size:var(--np-w-x); display:grid; grid-template-columns:var(--s-10) minmax(0,1fr); gap:var(--s-3);
  padding:var(--s-3) var(--s-4)}
.np-x .np-av{inline-size:var(--s-10); block-size:var(--s-10)}
.np-x .np-head,.np-x .np-text,.np-x .np-bar{padding-inline:0}
.np-x .np-head{padding-block-start:0}
.np-x .np-text{padding-block:var(--s-1) var(--s-2)}
.np-x .np-media{border:var(--bd); border-radius:var(--r-card); overflow:hidden}
.np-x .np-bar{justify-content:space-between; max-inline-size:26.5rem; padding-block-end:0}
.np-x .np-bar .np-end{margin-inline-start:0}
.np-ig .np-av{inline-size:var(--s-8); block-size:var(--s-8); font-size:var(--t-caption); line-height:var(--lh-caption)}
.np-ig .np-head{padding-block-end:var(--s-3)}
.np-ig .np-bar{color:var(--ink)}
.np-ig .np-bar svg{inline-size:var(--icon-lg); block-size:var(--icon-lg)}
.np-slot{display:grid; place-items:center; aspect-ratio:4/5; background-color:var(--surface-2); color:var(--ink-2);
  border-block:var(--bd-soft); font-size:var(--t-small); line-height:var(--lh-small)}
.np-likes{margin:0; padding:0 var(--s-4); font-size:var(--t-small); line-height:var(--lh-small)}
.np-stage{position:relative; aspect-ratio:9/16; overflow:hidden}
.np-stage>img,.np-stage>video{position:absolute; inset:0; inline-size:100%; block-size:100%; object-fit:cover}
.np-noclip{position:absolute; inset-block-start:var(--s-3); inset-inline-start:var(--s-3); z-index:1;
  padding:var(--s-1) var(--s-2); border-radius:var(--r-pill); background-color:var(--np-scrim);
  color:var(--np-on-stage); font-size:var(--t-caption); line-height:var(--lh-caption); font-weight:600}
.np-scrim{position:absolute; inset-inline:0; inset-block-end:0; block-size:45%; background-color:transparent;
  background-image:linear-gradient(to top,var(--np-scrim),transparent)}
.np-rail{position:absolute; inset-inline-end:var(--s-2); inset-block-end:16%; display:flex; flex-direction:column;
  align-items:center; gap:var(--s-4); margin:0; padding:0; list-style:none; font-size:var(--t-caption);
  line-height:var(--lh-caption); font-weight:600}
.np-rail li{display:flex; flex-direction:column; align-items:center; gap:var(--s-0)}
.np-rail svg{inline-size:var(--icon-lg); block-size:var(--icon-lg)}
.np-rail .np-av{inline-size:var(--s-10); block-size:var(--s-10); border:var(--stroke) solid var(--np-on-stage)}
.np-rail b{font-weight:600}
.np-over{position:absolute; inset-inline-start:var(--s-3); inset-inline-end:var(--s-16); inset-block-end:var(--s-4)}
.np-over .np-text,.np-over .np-title{padding:var(--s-1) 0 0; font-size:var(--t-small); line-height:var(--lh-small)}
.np-title{margin:0; font-weight:600}
/* ‏والوسمُ على الإطار الداكن كلِّه بحبر المسرح وثِقَله: لونُ العلامة عليه ‏١٫١٠:١ نهارًا
   («--brand» ‏#16181d على ‏#0b0c10). **والإطارُ لا المسرحُ وحدَه** (مراجعة D-187): وصفُ YouTube
   في «.np-desc» أخو «.np-stage» لا ابنُه، فكان وسمُه أسودَ على أسود. ويحرسه «validate_contrast»
   (‏--brand على ‏--np-stage في «ما لا يقع») واختبارُ الوسم في «views.test». */
.np-tt .np-tag,.np-yt .np-tag{color:var(--np-on-stage); font-weight:600}
.np-desc{padding:var(--s-2) var(--s-3); border-block-start:var(--bd); font-size:var(--t-small); line-height:var(--lh-small)}
.np-desc summary{cursor:pointer; color:var(--np-on-stage)}

/* الشبكة: المنصّةُ تقصّ هناك، فالقصُّ هنا يُري ما تُريه — والمنشورُ كاملًا في صفّه */
.np-grid{display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:var(--s-0); max-inline-size:58.5rem}
.np-grid-clip{grid-template-columns:repeat(5,minmax(0,1fr))}
.np-tile{position:relative; display:block; aspect-ratio:1; overflow:hidden; background-color:var(--surface-3)}
.np-grid-ig .np-tile{aspect-ratio:3/4}
.np-grid-clip .np-tile{aspect-ratio:9/16}
.np-tile>img,.np-tile>video{inline-size:100%; block-size:100%; object-fit:cover; display:block}
.np-tile.dim>img,.np-tile.dim>video{opacity:.55}
.np-play{position:absolute; inset-block-start:var(--s-2); inset-inline-start:var(--s-2); color:var(--np-on-stage)}
.np-play svg{inline-size:var(--icon-md); block-size:var(--icon-md)}
.np-badge{position:absolute; inset-block-end:var(--s-2); inset-inline-end:var(--s-2)}
/* ‏**والصفُّ عمودٌ واحدٌ حتّى تسع قائمتُه أعمدتَه الثلاثة** (مراجعة D-187): كان الشرطُ «md»،
   فعند ‏900 تظهر الرافدةُ ‏256px ويعود الصفُّ ثلاثةَ أعمدةٍ في ‏604px — عمودُ الأفعال ‏0px،
   و«افتحه على LinkedIn» خارج الحافّة، والصفحةُ تتمرّر جانبًا ‏154px حتّى ‏1100. فيُسأل عرضُ
   القائمة نفسِها («CQ.npRow» في «tokens.ts»)، ويقيس «audit_mobile» الفيضَ عند ‏900 و‏960. */
@container np-list ${narrower('npRow')}{
  .np-row{grid-template-columns:minmax(0,1fr); gap:var(--s-3)}
  .np-when{flex-direction:row; flex-wrap:wrap; align-items:baseline; gap:var(--s-2)}
  .np-under{flex-direction:row; flex-wrap:wrap; align-items:center}
}
@media${below('md')}{.np-grid-clip{grid-template-columns:repeat(2,minmax(0,1fr))}}

/* ══ عُدّةُ المكوّنات: ما بقي منها (خطّة التصميم 7 · D-189) ════════════════════════
   الزرُّ والشارةُ والبطاقةُ والتبويبُ والمقطعُ والحقلُ والإشعارُ والحالةُ الفارغة في مواضعها
   أعلاه؛ وهنا العددُ والحوارُ والورقةُ وبدائيّاتُ التخطيط والألوانُ القسريّة. ودوالُّها في
   «components/*.ts» — دالّةٌ لكلّ مكوّنٍ وعائلةُ أصنافٍ واحدةٌ بادئتُها اسمُه. */

/* ── العدد (7.2): رقمٌ ‏١٣px بوزن ‏٦٠٠ على «--surface-3» بحبر «--ink-2»، ويعني «ينتظرك» وحدَها.
   كان يُكتب ثلاثَ مرّاتٍ بقيَمٍ تتقارب (الرافدةُ وتبويبُ الفرز ورأسُ المنصّة)، فصار قاعدةً واحدة */
.count{display:inline-flex; align-items:center; justify-content:center; min-width:var(--s-5);
  padding:0 var(--s-2); border-radius:var(--r-pill); background:var(--surface-3); color:var(--ink-2);
  font-size:var(--t-caption); line-height:var(--lh-caption); font-weight:600}
.count.bad{background:var(--bad-wash); color:var(--bad)}

/* ── الحوارُ والورقة (7.9): «<dialog>» أصليّ — يحبس التركيزَ ويُغلَق بـEsc بلا سطرٍ منّا ──────
   على «--dialog» بحدّ «--line» فوق ستارة «--scrim» (3.7)، وعرضُه الأقصى ‏30em (‏٤٨٠ عند ‏١٦px)،
   وفعلٌ أوّليٌّ واحدٌ و«إلغاء». **وعلى الجوّال ورقةٌ من أسفل الشاشة** بعرضها ومقبضٍ ونصفِ قطر ‏١٦
   في زاويتيها العلويّتين («--r-sheet»)، وتحت الإبهام لا وسطَ الشاشة. */
.dlg{width:calc(100% - 2 * var(--gutter)); max-width:30em; padding:var(--pad-card); color:var(--ink);
  background:var(--dialog); border:var(--bd); border-radius:var(--r-card); box-shadow:var(--sh-3)}
.dlg::backdrop{background:var(--scrim)}
.dlg-t{margin:0 0 var(--s-3); font-size:var(--t-h3); line-height:var(--lh-h3); font-weight:600}
.dlg-body{font-size:var(--t-body); line-height:var(--lh-body); color:var(--ink-2)}
.dlg-foot{display:flex; flex-wrap:wrap; gap:var(--s-2); margin:var(--s-6) 0 0}
.dlg-grip{display:none}
@media${below('sm')}{
  .dlg.sheet{width:100%; max-width:100%; margin:auto 0 0; border-bottom:0;
    border-radius:var(--r-sheet) var(--r-sheet) 0 0;
    padding-bottom:calc(var(--pad-card) + var(--safe-b))}
  .dlg.sheet .dlg-grip{display:block; width:var(--s-10); height:var(--s-1); margin:0 auto var(--s-3);
    border-radius:var(--r-pill); background:var(--line)}
}

/* ── بدائيّاتُ التخطيط والمسافة (خطّة التصميم 3.3 · D-189) ─────────────────────────────
   كانت ‏٨٩ سِمةَ «style=""» في الوسم تكتب هامشًا أو حشوًا أو فجوةً بيدها — **ولا يراها مدقّقٌ
   ولا ثيم**، وسِمةٌ ثالثةٌ في السياسة (D-150). فصارت أصنافًا من السلّم نفسِه، و«audit_classes»
   يردّ «style=""» فيه هامشٌ أو حشوٌ أو فجوةٌ أو عرضٌ بالبكسل. **و«!important» هنا قصدٌ لا عجلة**:
   الصنفُ يحلّ محلّ سِمةٍ كانت تغلب كلَّ قاعدة (‏«.card > .hint» مثلًا)، فيغلب كما كانت تغلب.
   ‏«.stack» عمودٌ و«.split» طرفان قائمان أعلاه؛ و«.cluster» صفٌّ يلتفّ. */
.cluster{display:flex; flex-wrap:wrap; align-items:center; gap:var(--s-2)}
.m-0{margin:0!important}
.bare{margin:0!important; padding:0!important; border:0!important}
.mt-1{margin-top:var(--s-1)!important} .mt-2{margin-top:var(--s-2)!important}
.mt-3{margin-top:var(--s-3)!important} .mt-4{margin-top:var(--s-4)!important}
.mt-5{margin-top:var(--s-5)!important} .mt-6{margin-top:var(--s-6)!important}
.mb-3{margin-bottom:var(--s-3)!important} .mb-4{margin-bottom:var(--s-4)!important}
.gap-1{gap:var(--s-1)!important} .gap-2{gap:var(--s-2)!important}
.nowrap{flex-wrap:nowrap!important}
.self-center{align-self:center!important} .self-end{align-self:flex-end!important}
.ta-end{text-align:end!important}
/* ‏وحقلٌ يأخذ ما بقي من صفّه بحدٍّ أدنى يسع عنوانًا — كان «flex:1;min-width:180px» و«220px».
   **واسمُه «grow-field» لا «fill»** (مراجعةُ D-189): «.fill» صنفُ مقياس الاستحقاق («.worth .fill»)،
   فكان حدُّه الأدنى بـ«!important» يغلب عرضَ الدرجة — ‏0.61 تُرسَم ممتلئةً على الحاسوب. */
.grow-field{flex:1 1 0; min-width:min(12em,100%)!important}

/* ── الألوانُ القسريّة (خطّة التصميم 9 · D-189) ─────────────────────────────────────────
   وضعُ التباين العالي في Windows يمحو الظلالَ والأرضيّات ويُلبس الصفحةَ ألوانَ النظام —
   **فمؤشّرٌ مرسومٌ بظلٍّ أو بأرضٍ يختفي**: المقطعُ المختار، وخطُّ الرافدة النحاسيّ، والنقطة،
   والمقياس. فكلُّ مؤشّرِ حالٍ أو تحديدٍ هنا بحدٍّ أو حلقةٍ بألوان النظام، ويُقاس بلقطةٍ في
   Chromium بـ«forced-colors: active». وحلقةُ التركيز «outline» أصلًا فتبقى. */
@media(forced-colors:active){
  .seg button[aria-pressed=true]{outline:var(--stroke) solid Highlight; outline-offset:calc(-1 * var(--stroke))}
  /* ‏والحدُّ الشفّافُ يُرسَم بلون النصّ في هذا الوضع — فيُمحى بلون الأرض، ويبقى خطُّ المختار وحدَه */
  .tab-item{border-bottom-color:Canvas}
  .tab-item[aria-current=page],.tab-item[aria-selected=true],.tab-item[aria-pressed=true]{border-bottom-color:Highlight}
  nav.tabs a[aria-current=page]::before,.todo .dot,.pill .led,.bar i,.bar-fill,.worth .fill{
    forced-color-adjust:none; background:CanvasText}
  nav.tabs a[aria-current=page]{outline:var(--ul) solid Highlight; outline-offset:calc(-1 * var(--ul))}
  .st,.count,.toast-note,.card-alert{border-color:CanvasText}
  :focus-visible{outline-color:Highlight}
  /* ‏**ولحظةُ العلامة بألوانها** (مراجعة D-196): النقشُ يرسم أرضَه سمةً لا تُفرَض («fill» في SVG)،
     وأرضُ «.moment» تُفرَض Canvas ورمزُها CanvasText — فرُسم الرمزُ أسودَ على أرض النقش العميقة ‏١٫٤٦:١
     في التباين العالي الفاتح. وأزواجُها مقيسةٌ في «MOMENT_PAIRS» (‏٧٫٥٨ فأكثر)، فتبقى كما هي */
  .moment{forced-color-adjust:none}
}

/* ══ الحقولُ على اللمس ═══════════════════════════════════════════
   **Safari يُقرّب الصفحةَ عند لمس حقلٍ خطُّه دون ‏١٦px** — سلوكٌ لا
   يُعطَّل إلّا بمنع التقريب كلِّه، ومنعُه يخالف WCAG 1.4.4. وثمنُه أنّ
   الصفحةَ تقفز وتكبر عند كلّ لمسةِ حقل، ثمّ يُصغّرها المالكُ بإصبعين.

   **وصار خطُّ الحقل ‏١٦ في كلّ عرض** (D-185 · نمطُ «input»): كان يُرفَع إلى ‏١٧٫٥ على
   اللمس وحده ويبقى ‏١٥٫٥ على الحاسوب، فلكلّ حقلٍ قاعدتان تتباعدان. **و‏١٦ هي ما
   يكفي Safari**، فلا قاعدةَ للّمس في الحرف — وما بقي هنا للعرض لا للحرف.

   **والزرُّ ليس حقلًا** (D-183): كان معها، فصار الزرُّ على الهاتف ‏١٧٫٥px أكبرَ
   من الفقرة التي تشرحه، و«.sm» يبقى ‏١٤ بجانبه — تراتبٌ مقلوبٌ في السطر الواحد.
   ولا يُقرّب Safari زرًّا، **وهدفُ اللمس ‏٤٤px من «min-height» لا من الخطّ**. فالزرُّ
   على اللمس بقياسه على الحاسوب.

   و«pointer: coarse» أدقُّ من عرضِ الشاشة: لوحٌ بقلمٍ ليس هاتفا، وحاسوبٌ
   بشاشةٍ لمسيّةٍ ليس شاشةَ فأرة.

   **وموضعُها بعد قاعدةِ الحقول لا قبلها**: تلك تختار بمحدّدات السمات
   فتغلب المحدّدَ العارِيَ مهما كان الوسيط — وقد جُرّب فبقي ‏١٤. */
@media(pointer:coarse){
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

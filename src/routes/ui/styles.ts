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
:focus-visible{outline:2px solid var(--au); outline-offset:2px; border-radius:6px;
  box-shadow:0 0 0 4px var(--surface)}

/* التحديدُ بالهويّة: تفصيلٌ يُرى في كلّ نسخةٍ ولصق */
::selection{background:color-mix(in srgb,var(--brand) 26%,transparent); color:var(--ink)}

/* وشريطُ التمرير يتبع الثيم: شريطٌ فضّيٌّ فاتح على لوحةٍ داكنة نشاز */
*{scrollbar-width:thin; scrollbar-color:var(--line-strong) transparent}
::-webkit-scrollbar{width:11px; height:11px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:var(--line-strong); border-radius:99px;
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
  padding:var(--s-3) var(--s-4); border-radius:8px; z-index:99; font-weight:700}
/* وحين يظهر يصير هدفا كاملا: من يتنقّل بلوحة المفاتيح على لوحٍ لمسيّ
   قد يلمسه بإصبعه — والقاعدةُ تنطبق حيث يُرى (D-086) */
.skip:focus{width:auto; height:auto; overflow:visible; clip-path:none;
  inset-inline-start:auto; inset-inline-end:var(--s-3); top:var(--s-2);
  display:inline-flex; align-items:center; min-height:var(--tap)}
.grow{flex:1}
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
.tap{position:relative; display:inline-block; min-width:var(--tap); text-align:center}
/* **والامتدادُ رأسيٌّ لا أفقيّ.**
   طبقةٌ أعرضُ من الرابط تخرج عن الصفحة فتصنع تمريرا أفقيّا — قِيس ‏١٢px
   عند ‏٣٢٠px، مصدرُها رابطُ «X» بعرض ‏١١ وطبقتُه ‏٤٤. فتُقصَر الطبقةُ على
   عرض الرابط («left» و«right» صفرا) ويُعطى الرابطُ عرضا أدنى في التخطيط.
   والفيضُ الرأسيُّ لا يضرّ: الصفحةُ تُمرَّر رأسيّا أصلا. */
.tap::after{content:''; position:absolute; left:0; right:0; top:50%;
  transform:translateY(-50%); height:var(--tap)}

/* ══ هيكلُ التطبيق ═══════════════════════════════════════════ */
/* **«dvh» لا «vh»** (D-086): يحسب iOS مئةً من «vh» بلا شريطِ المتصفّح،
   فيمتدّ العمودُ تحته ويُقطَع أسفلُه. و«dvh» تتبع المرئيَّ وهو يتحرّك.
   والسطرُ الأوّل احتياطٌ لمتصفّحٍ لا يعرفها — يقرؤه ثمّ يدهسه الثاني. */
.app{display:grid; grid-template-columns:256px 1fr; min-height:100vh; min-height:100dvh}

/* ── الرافدة ───────────────────────────────────────────────── */
.rail{background:var(--chrome); border-inline-start:1px solid var(--line);
  display:flex; flex-direction:column; position:sticky; top:0;
  height:100vh; height:100dvh; overflow-y:auto;
  background-image:var(--sheen);
  /* **اللونُ يُعاد صراحةً، ولا يكفي إعادةُ تعريف الرمز.**
     المتغيّراتُ تُورَث، أمّا اللونُ فيُورَث **محسوبا**: الجسدُ حسب
     var(--ink) بقيمة الثيم النهاريّ، فورث اسمُ العلامة حبرا داكنا —
     ثمّ وُضع على رافدةٍ داكنة فاختفى.
     علّةٌ لا يمسكها مدقّقُ الرموز (القيَمُ صحيحة) ولا المدقّقُ البصريّ
     (الأحجامُ صحيحة). رأيتُها بالنظر إلى الصفحة مرسومة. */
  color:var(--ink)}
/* خيطٌ بلون الهويّة على الحافّة الداخليّة — الحدُّ الرماديُّ وحده يفصل، وهذا
   **يقول أيُّ الجهتين هي البيت**. ويخفت نزولا فلا يصير خطّا مرسوما. */
.rail::after{content:''; position:absolute; inset-block:0; inset-inline-end:0; width:1px;
  background:linear-gradient(180deg,color-mix(in srgb,var(--au) 60%,transparent),transparent 46%);
  pointer-events:none}
.rail-head{padding:var(--s-5) var(--s-5) var(--s-4); display:flex; align-items:center; gap:var(--s-3)}
/* ── العلامة ──────────────────────────────────────────────────────────
   الأقواسُ نفسها التي في رمز التبويب، مرسومةً لا مكتوبة. وكانت مربّعا
   فيه «صدى» بخمسةَ عشرَ بكسلا: **الحرفان يزدحمان في ستٍّ وثلاثين**،
   فيُقرأ المربّعُ لطخةً — وهي عينُ العلّة التي مُنعت في رمز التبويب. */
/* والعلامةُ وحدها تجمع اللونين: زمرّدٌ يتحوّل ذهبا — ولا يتكرّر هذا
   الجمعُ في موضعٍ آخر، فيبقى للعلامة معناها */
.glyph{width:38px; height:38px; border-radius:11px; display:grid; place-items:center; flex:none;
  background:linear-gradient(145deg,var(--brand-soft) 0%,var(--brand) 45%,var(--au) 100%);
  color:var(--on-brand);
  box-shadow:var(--sh-1), inset 0 1px 0 rgba(255,255,255,.28),
    0 0 0 1px color-mix(in srgb,var(--au) 24%,transparent)}
/* نسبةٌ لا قياسٌ ثابت: العلامةُ نفسها تظهر بـ 38 في الرافدة و 50 في
   شاشة الدخول و 38 في الوثائق — وقياسٌ ثابتٌ يجعلها تسبح في الأكبر. */
.glyph svg{width:56%; height:56%; display:block}
.brand{min-width:0}
.brand b{display:block; font-size:var(--t-base); font-weight:700; letter-spacing:-.2px; line-height:var(--lh-tight)}
.brand span{display:block; font-size:var(--t-xs); font-weight:600; color:var(--ink-3);
  letter-spacing:var(--ls-eyebrow); direction:ltr; unicode-bidi:isolate; margin-top:1px}

nav.tabs{padding:var(--s-1) var(--s-3) var(--s-4); display:flex; flex-direction:column; gap:1px}
nav.tabs .lbl{font-size:var(--t-xs); font-weight:700; color:var(--ink-3);
  padding:var(--s-4) var(--s-2) var(--s-1)}
nav.tabs .sep{display:none}
nav.tabs a{display:flex; align-items:center; gap:var(--s-3); padding:var(--s-2) var(--s-3);
  border-radius:var(--r-sm); min-height:var(--tap); font-size:var(--t-base); font-weight:600; color:var(--ink-2); text-decoration:none;
  transition:background var(--dur-1) var(--ease), color var(--dur-1) var(--ease)}
nav.tabs a svg{width:16px; height:16px; flex:none; opacity:.7}
@media(hover:hover){nav.tabs a:hover{background:var(--surface-2); color:var(--ink)}}
/* والحاليُّ يُعلَّم **بحدٍّ ولون**: أرضيّةٌ خافتةٌ وحدها تختفي في
   وضع التباين العالي، وخطٌّ على الحافّة يبقى. */
nav.tabs a[aria-current=page]{background:var(--brand-wash); color:var(--brand); position:relative}
nav.tabs a[aria-current=page]::before{content:''; position:absolute; inset-block:7px;
  inset-inline-start:0; width:2.5px; border-radius:99px; background:var(--brand)}
nav.tabs a[aria-current=page] svg{opacity:1}
nav.tabs .count{margin-inline-start:auto; min-width:20px; text-align:center; padding:1px var(--s-1);
  border-radius:999px; background:var(--surface-3); font-size:var(--t-xs); font-weight:700;
  color:var(--ink-2); font-variant-numeric:tabular-nums}
nav.tabs a[aria-current=page] .count{background:var(--brand); color:var(--on-brand)}
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
details.plat>summary::after{content:'▾'; margin-inline-start:auto; font-size:var(--t-xs);
  color:var(--ink-3); transition:transform var(--dur-2) var(--ease)}
details.plat[open]>summary::after{transform:rotate(180deg)}
.plat-list{display:flex; flex-direction:column; gap:1px; padding:var(--s-1) 0 var(--s-2)}
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

.rail-foot{margin-top:auto; padding:var(--s-3); border-top:1px solid var(--line-soft)}

/* ── الشريط العلويّ ────────────────────────────────────────── */
.main{min-width:0; display:flex; flex-direction:column}
/* **اسمٌ لا يتصادم**: كان هذا الشريط يسمّى .bar وهو اسمُ مقياس المقدار
   (ارتفاعُه أربعةُ بكسل) — فكان المقياسُ يدهسه فينسحق الشريطُ إلى خيط.
   علّةٌ لا يكشفها اختبارٌ ولا مدقّق: الصفحةُ تعمل، والترويسةُ غائبة. */
.topbar{position:sticky; top:0; z-index:20; background:var(--chrome);
  border-bottom:1px solid var(--line); padding:0 var(--s-6); min-height:60px; flex:none;
  display:flex; align-items:center; gap:var(--s-3); transition:box-shadow var(--dur-2) var(--ease)}
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
.topbar .ttl{opacity:0; transform:translateY(4px); transition:opacity var(--dur-2) var(--ease-out), transform var(--dur-2) var(--ease-out)}
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
/* ── الذهبُ يُقتَّر ولا يُسكَب ─────────────────────────────────────────
   خيوطٌ وحوافُّ وعلاماتٌ صغيرة، لا أرضيّاتٌ ولا أزرارٌ ممتلئة. وذهبٌ
   يُملأ به سطحٌ يُقرأ رخيصا، وخيطٌ منه على حافّةٍ يُقرأ صنعة. */
.eyebrow{display:flex; align-items:center; gap:var(--s-2); font-size:var(--t-xs);
  font-weight:700; color:var(--au); margin-bottom:var(--s-2)}
.eyebrow .ln{height:1px; width:30px; flex:none;
  background:linear-gradient(90deg,var(--au),transparent)}
.page-head h1{font-size:var(--t-3xl); font-weight:700; line-height:var(--lh-tight);
  letter-spacing:-.9px; margin:0}
.page-head .lede{margin:var(--s-3) 0 0; font-size:var(--t-md); line-height:var(--lh);
  color:var(--ink-2); max-width:var(--measure)}
.page-head .aside{display:flex; align-items:center; gap:var(--s-2); flex-wrap:wrap}
@media(max-width:720px){
  /* الأعمدةُ الثابتةُ لا تسع في ٣٩٠px: يلتفّ الصفُّ ويسقط النموذجُ من
     السطر — الاسمُ والحالُ والإنفاقُ تكفي للفرز، والنموذجُ في اللوح */
  .prow>summary{flex-wrap:wrap; gap:var(--s-2)}
  .prow .pm{display:none}
  .prow .pst{width:auto}
  .prow .pv{width:auto; margin-inline-start:auto}
.page-head h1{font-size:var(--t-2xl); letter-spacing:-.5px}}

.pill{display:inline-flex; align-items:center; gap:var(--s-2); padding:var(--s-1) var(--s-3); border-radius:999px;
  font-size:var(--t-sm); font-weight:600; border:1px solid var(--line); background:var(--surface-2)}
.pill .led{width:6px; height:6px; border-radius:50%; background:var(--ink-3); flex:none}
.pill.on{color:var(--ok); background:var(--ok-wash); border-color:color-mix(in srgb,var(--ok) 26%,transparent)}
.pill.on .led{background:var(--ok)}
.pill.off{color:var(--warn); background:var(--warn-wash);
  border-color:color-mix(in srgb,var(--warn) 34%,transparent)}
.pill.off .led{background:var(--warn)}

.theme{display:inline-flex; padding:var(--s-0); gap:1px; border-radius:999px;
  border:1px solid var(--line); background:var(--surface-2)}
.theme button{padding:var(--s-1) var(--s-2); border-radius:999px; background:transparent; border:0;
  color:var(--ink-3); font-size:var(--t-xs); font-weight:600}
.theme button[aria-pressed=true]{background:var(--surface); color:var(--ink); box-shadow:var(--sh-1)}

/* ── الإشعار ───────────────────────────────────────────────── */
.flash{display:flex; align-items:flex-start; gap:var(--s-3); padding:var(--s-3) var(--s-4);
  border-radius:var(--r); margin-bottom:var(--s-4); font-size:var(--t-base); border:1px solid var(--line); background:var(--surface)}
.flash .ic{flex:none; font-weight:700; font-size:var(--t-sm); line-height:var(--lh)}
.flash.ok{border-color:color-mix(in srgb,var(--ok) 28%,transparent); background:var(--ok-wash)}
.flash.ok .ic{color:var(--ok)}
.flash.warn{border-color:color-mix(in srgb,var(--warn) 32%,transparent); background:var(--warn-wash)}
.flash.warn .ic{color:var(--warn)}
.flash.bad{border-color:color-mix(in srgb,var(--bad) 32%,transparent); background:var(--bad-wash)}
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
.flash{transition:opacity var(--dur-2) var(--ease-out),
  transform var(--dur-2) var(--ease-out)}

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
.card h2{font-size:var(--t-lg); font-weight:700; letter-spacing:-.25px;
  margin-bottom:var(--s-0)}
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
.sec{font-size:var(--t-xs); font-weight:700; color:var(--ink-2);
  margin:var(--s-8) 0 var(--s-3); padding-bottom:var(--s-2);
  border-bottom:1px solid var(--line-soft); position:relative}

.sec::after{content:''; position:absolute; bottom:-1px; inset-inline-start:0; width:34px;
  height:2px; border-radius:99px;
  background:linear-gradient(90deg,var(--au),color-mix(in srgb,var(--au) 20%,transparent))}

/* ── بطاقةُ المؤشّر ────────────────────────────────────────── */
.tile{display:flex; flex-direction:column; position:relative; overflow:hidden}
/* خيطٌ بلون الهويّة على رأس المؤشّر — يربط الأربعةَ بعضَها ببعضٍ فتُقرأ صفّا
   واحدا، ويميّزها عن بطاقات المحتوى تحتها. */
.tile::before{content:''; position:absolute; inset-inline:0; top:0; height:2px;
  background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--au) 75%,transparent),transparent)}
.tile .k{font-size:var(--t-xs); font-weight:600; color:var(--ink-3)}
.tile .v{font-size:var(--t-3xl); font-weight:700; line-height:var(--lh-tight); letter-spacing:-1.4px;
  font-variant-numeric:tabular-nums; margin-top:var(--s-1);
  /* العزلُ يثبّت ترتيبَ الرقم ورمزِ العملة، والمحاذاةُ تُبقيه تحت لصيقته */
  direction:ltr; unicode-bidi:isolate; text-align:right}
.tile .v em{font-style:normal; font-size:var(--t-base); font-weight:600; color:var(--ink-3);
  letter-spacing:0; margin-inline-start:var(--s-0)}
/* والمؤشّرُ الأوّل وحده يأخذ الذهبَ في رقمه: ندرةٌ تصنع مرتبة، وذهبٌ
   على الأربعة يُلغي معنى الأوّل */
.grid.c4>.tile:first-child .v{color:var(--au)}
.tile .n{font-size:var(--t-xs); color:var(--ink-3); margin-top:var(--s-2)}

/* المقياس **مقياسُ مقدار لا تصنيف**: هيئةٌ واحدة تتدرّج، ولا كهرمان فيه
   قطّ — الكهرمان يقع من ذهب الهوية على ΔE 7.2 فلا يُرى فرقُهما. والبلوغُ
   حالةٌ لا مقدار، فيقفز إلى الأحمر (ΔE 19.8 عن الذهب) **ومعه نصّ**. */
.bar{height:4px; background:var(--surface-3); border-radius:99px; overflow:hidden; margin-top:var(--s-3)}
.bar i{display:block; height:100%; border-radius:99px; background:var(--brand); transition:width var(--dur-3) var(--ease-out)}
.bar i.f{background:var(--bad)}
.cap{display:inline-flex; align-items:center; gap:var(--s-1); font-size:var(--t-xs); font-weight:600;
  color:var(--bad); margin-top:var(--s-2)}
.cap.done{color:var(--ok)}

/* الفرقُ عن الأمس: علامةٌ **ونصّ** — والسهمُ وحده لا يُقرأ بصوتٍ عالٍ */
.delta{display:inline-flex; align-items:center; gap:var(--s-1); font-size:var(--t-xs); font-weight:600;
  margin-top:var(--s-2); color:var(--ink-3)}
.delta.up{color:var(--ok)} .delta.down{color:var(--warn)}
.delta .ar{font-size:var(--t-xs); line-height:var(--lh-tight)}

/* ══ الجداول ═════════════════════════════════════════════════ */
.scroll{overflow-x:auto; margin:0 -var(--s-0); padding:0 var(--s-0)}
table{width:100%; border-collapse:collapse; font-size:var(--t-base); min-width:520px}
th{text-align:right; color:var(--ink-3); font-weight:600; font-size:var(--t-xs);
  padding:0 var(--s-2) var(--s-2); border-bottom:1px solid var(--line); white-space:nowrap}
td{padding:var(--s-3) var(--s-2); border-bottom:1px solid var(--line-soft); vertical-align:top}
tbody tr:last-child td{border-bottom:0}
@media(hover:hover){tbody tr:hover{background:var(--surface-2)}}
.nm{font-weight:600; line-height:var(--lh-tight)}
/* «nm» تُستعمَل span وتُستعمَل فقرةً. والفقرةُ بلا قاعدةِ هامشٍ
   ترث 14px من المتصفّح — **خارجَ السلّم**، ولا تظهر في grep لأنّها
   لم تُكتَب (D-057). فتُصاب هنا، والوسمُ في المحدّد لا الصنف. */
p.nm{margin:0 0 var(--s-3)}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:var(--t-xs);
  color:var(--ink-3); direction:ltr; display:inline-block; unicode-bidi:isolate}
.sub{color:var(--ink-3); font-size:var(--t-sm); margin-top:var(--s-1); max-width:62ch; line-height:var(--lh)}
.num,.money{font-variant-numeric:tabular-nums}
/* المبلغُ نصٌّ لاتينيّ داخل عربيّ: بلا عزلٍ ينقلب رمزُ العملة إلى آخره */
.money{direction:ltr; unicode-bidi:isolate; display:inline-block}

/* الحالة: لونٌ **ورمزٌ ونصّ** — لا لون وحده */
.st{display:inline-flex; align-items:center; gap:var(--s-1); padding:var(--s-0) var(--s-2); border-radius:6px;
  font-size:var(--t-xs); font-weight:600; border:1px solid transparent; white-space:nowrap}
.st .g{font-size:var(--t-xs); line-height:var(--lh-tight)}
.st.ok{color:var(--ok); background:var(--ok-wash); border-color:color-mix(in srgb,var(--ok) 24%,transparent)}
.st.warn{color:var(--warn); background:var(--warn-wash); border-color:color-mix(in srgb,var(--warn) 28%,transparent)}
.st.bad{color:var(--bad); background:var(--bad-wash); border-color:color-mix(in srgb,var(--bad) 28%,transparent)}
.st.idle{color:var(--ink-3); background:var(--surface-2); border-color:var(--line)}
.chip{display:inline-block; padding:var(--s-0) var(--s-2); border-radius:5px; font-size:var(--t-xs); font-weight:600;
  background:var(--surface-2); border:1px solid var(--line-soft); color:var(--ink-2); margin:var(--s-0) 0 0 var(--s-1)}

/* الاستحقاق: مقياس مقدار — تدرّج هيئةٍ واحدة، والرقم بلون النصّ */
.worth{display:flex; align-items:center; gap:var(--s-2); min-width:104px}
.worth .track{flex:1; height:4px; background:var(--surface-3); border-radius:99px; overflow:hidden}
.worth .fill{display:block; height:100%; border-radius:99px}
.worth .val{font-variant-numeric:tabular-nums; font-size:var(--t-sm); color:var(--ink-2); min-width:30px}

/* ══ الأزرار — أربعُ درجاتٍ لا لونان ══════════════════════════ */
/* ارتفاعُ الهدف 44 لا 31: WCAG 2.5.5 و Apple HIG. والحشوُ يُترك
   للتوسيط، و min-height هي التي تضمن — فنصٌّ قصيرٌ لا يُقزّم الزرّ. */
button,.btn{font:inherit; font-size:var(--t-base); font-weight:600; border-radius:var(--r-sm);
  cursor:pointer; border:1px solid transparent; padding:var(--s-2) var(--s-4);
  min-height:var(--tap); min-width:var(--tap); box-sizing:border-box;
  display:inline-flex; align-items:center; justify-content:center; gap:var(--s-2);
  text-decoration:none; white-space:nowrap; transition:background var(--dur-1) var(--ease), border-color var(--dur-1) var(--ease),
    box-shadow var(--dur-1) var(--ease)}
.p{background:var(--brand); color:var(--on-brand); box-shadow:var(--sh-1)}
@media(hover:hover){.p:hover{background:var(--brand-deep)}}
.g{background:var(--surface); color:var(--ink); border-color:var(--line-strong); box-shadow:var(--sh-1)}
@media(hover:hover){.g:hover{background:var(--surface-2)}}
.d{background:var(--surface); color:var(--bad); border-color:color-mix(in srgb,var(--bad) 34%,transparent)}
@media(hover:hover){.d:hover{background:var(--bad-wash)}}
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

/* ── الفراغ ────────────────────────────────────────────────── */
.empty{padding:var(--s-8) var(--s-5); text-align:center; border:1px dashed var(--line-strong);
  border-radius:var(--r); background:var(--surface-2)}
.empty b{display:block; font-size:var(--t-base); margin-bottom:var(--s-1); color:var(--ink)}
.empty p{margin:0 auto var(--s-3); max-width:46ch; font-size:var(--t-sm); color:var(--ink-3); line-height:var(--lh)}

.split{display:flex; gap:var(--s-4); align-items:center; justify-content:space-between; flex-wrap:wrap}
.split p{margin:0; font-size:var(--t-sm); color:var(--ink-3); max-width:60ch; line-height:var(--lh)}
hr{border:0; border-top:1px solid var(--line-soft); margin:var(--s-4) 0}
footer{margin-top:var(--s-6); padding-top:var(--s-4); border-top:1px solid var(--line-soft);
  border-image:linear-gradient(90deg,color-mix(in srgb,var(--au) 34%,transparent),transparent) 1;
  color:var(--ink-3); font-size:var(--t-xs); display:flex; justify-content:space-between; flex-wrap:wrap; gap:var(--s-2)}

/* ── ما ينتظرك ─────────────────────────────────────────────── */
.todo{list-style:none; margin:0; padding:0; display:flex; flex-direction:column}
.todo li{display:flex; align-items:center; gap:var(--s-2); padding:var(--s-2) var(--s-0); font-size:var(--t-sm);
  border-bottom:1px solid var(--line-soft)}
.todo li:last-child{border-bottom:0}
.todo .dot{width:6px; height:6px; border-radius:50%; flex:none; background:var(--ink-3)}
.todo .dot.warn{background:var(--warn)} .todo .dot.bad{background:var(--bad)}
.todo .dot.ok{background:var(--ok)}
.todo a,.todo form{margin-inline-start:auto}

/* ── الرسم ─────────────────────────────────────────────────── */
.chart{margin-top:var(--s-1)}
.chart svg{display:block; width:100%}
/* **الاتّجاه اللاتينيّ هنا ليس زينة**: نصُّ SVG يرث اتّجاه الصفحة، و RTL
   يقلب معنى text-anchor — فتمتدّ التسميةُ خارج المربّع وتُقصّ. علّةٌ
   لا تظهر إلا بالنظر إلى الرسم مرسوما. */
.chart .axis{font-size:var(--t-xs); fill:var(--ink-3); font-variant-numeric:tabular-nums;
  direction:ltr; unicode-bidi:isolate}
.chart .grid-l{stroke:var(--line-soft); stroke-width:1}
.chart .base{stroke:var(--line); stroke-width:1}
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
.ch-logo{width:34px; height:34px; border-radius:9px; flex:none; display:grid; place-items:center;
  background:var(--surface-2); border:1px solid var(--line); color:var(--ink-2)}
.ch.off .ch-logo{color:var(--ink-3)}
.ch-logo svg{width:17px; height:17px; display:block}
.ch-name{font-weight:700; font-size:var(--t-md); line-height:var(--lh-tight); letter-spacing:-.1px}
.ch-name a{color:inherit; text-decoration:none}
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
.guide .g-ic{flex:none; width:30px; height:30px; border-radius:9px; display:grid; place-items:center;
  background:var(--brand-wash); color:var(--brand);
  border:1px solid color-mix(in srgb,var(--brand) 26%,transparent)}
.guide .g-ic svg{width:15px; height:15px; display:block}
.guide .g-t{min-width:0}
.guide .g-t b{display:block; font-size:var(--t-md); font-weight:700; letter-spacing:-.15px}
.guide .g-t span{display:block; font-size:var(--t-sm); color:var(--ink-3); line-height:var(--lh);
  max-width:var(--measure)}
/* «افتح/أغلق» — وسمُ summary لا يُعلن حالَه لقارئ الشاشة بنفسه، فالنصُّ
   يقوله. وسهمٌ وحده لا يُقرأ بصوتٍ عالٍ. */
.guide .g-tog{flex:none; font-size:var(--t-sm); font-weight:600; color:var(--brand);
  display:inline-flex; align-items:center; gap:var(--s-2)}
.guide .g-tog::after{content:'▾'; font-size:var(--t-xs); transition:transform var(--dur-2) var(--ease)}
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
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap; direction:ltr; text-align:left}
.prow .pv{flex:none; width:80px; font-size:var(--t-base); font-weight:700; color:var(--ink);
  font-variant-numeric:tabular-nums}
.prow .pv i{display:block; font-style:normal; font-size:var(--t-xs); font-weight:500; color:var(--ink-3)}
.prow .pst{flex:none; width:150px}
/* «تفاصيل/إغلاق»: النصُّ يقول الحالَ — وسهمٌ وحده لا يُقرأ بصوتٍ عالٍ */
.prow .ptog{flex:none; font-size:var(--t-sm); font-weight:600; color:var(--brand);
  display:inline-flex; align-items:center; gap:var(--s-2)}
.prow .ptog::after{content:'▾'; font-size:var(--t-xs); transition:transform var(--dur-2) var(--ease)}
.prow[open] .ptog::after{transform:rotate(180deg)}
.prow[open] .ptog .lbl-open{display:none}
.prow:not([open]) .ptog .lbl-close{display:none}
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
  padding:0 var(--s-2); border-radius:99px; background:var(--surface-3); color:var(--ink-3)}
/* المفتوحُ يُعلَّم بأكثر من لون: خطٌّ وثِقَلٌ وأرضيّة (D-043) */
.ftab.on{border-color:var(--brand); background:var(--brand-wash); color:var(--ink)}
.ftab.on .count{background:var(--brand); color:var(--on-brand)}
/* والفشلُ يحمل لونَه ولو لم يُفتَح — فلا يُقرأ تبويبا كسائره */
.ftab.bad .count{background:color-mix(in srgb,var(--bad) 18%,transparent); color:var(--bad)}
.ftab.bad.on{border-color:var(--bad); background:color-mix(in srgb,var(--bad) 10%,transparent)}
.ftab.bad.on .count{background:var(--bad); color:var(--bg)}

/* ── مصغَّراتُ الوسائط ────────────────────────────────────────────────
   **الصورةُ تُعرَض لا يُقال إنّ هناك صورة.** ومقاسٌ ثابتٌ يمنع القفزَ
   قبل التحميل: صفٌّ يتمدّد بعد وصول البايتات يزيح ما تحته تحت الإصبع.

   والمرفوضةُ تبقى معروضةً مُعتِمةً: كلفتُها دُفعت، وإخفاؤها يجعل سطرا
   في الدفتر بلا ما يقابله. */
.thumbs{display:flex; flex-wrap:wrap; gap:var(--s-2); margin:var(--s-3) 0}
.thumb{position:relative; display:block; width:96px; height:96px; flex:none;
  border-radius:var(--r-sm); overflow:hidden; border:1px solid var(--line);
  background:var(--surface-3)}
.thumb img,.thumb video{width:100%; height:100%; object-fit:cover; display:block}
.thumb.off{opacity:.45; filter:grayscale(1)}
.thumb .tag{position:absolute; inset-inline-start:var(--s-1); bottom:var(--s-1);
  font-size:var(--t-xs); font-weight:700; padding:0 var(--s-2); border-radius:99px;
  background:var(--chrome); color:var(--ink)}
.thumb .tag.bad{background:var(--bad); color:var(--bg)}

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
.setup>summary{cursor:pointer; font-size:var(--t-sm); font-weight:600; color:var(--brand-deep);
  list-style:none; padding:var(--s-2) 0}
.setup>summary::-webkit-details-marker{display:none}
.setup>summary::before{content:'▸'; display:inline-block; margin-inline-end:var(--s-2)}
.setup[open]>summary::before{content:'▾'}
.setup-body{padding-top:var(--s-2)}

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
.draft{display:flex; flex-direction:column; gap:var(--s-3); background:var(--surface);
  border:1px solid var(--line); border-radius:var(--r-lg); padding:var(--s-4) var(--s-4); box-shadow:var(--sh-1)}
.draft.done{background:var(--surface-2); box-shadow:none}
.draft-top{display:flex; align-items:center; gap:var(--s-3)}
/* ══ مسرحُ القرار (D-090) ═══════════════════════════════════════════
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

/* ── المعاينة: كما تُقرأ لا كما تُحرَّر ───────────────────────────
   المربّعُ حقلُ تحرير — خطُّ اللوحة وحدٌّ وشريطُ تمرير وعرضُ البطاقة.
   **والمنشورُ يُقرأ فقرةً في عمودٍ ضيّق**، وحكمٌ على نصٍّ في حقلٍ ليس
   حكما عليه منشورا.

   والعمودُ أضيقُ من «--measure» قصدا: عمودُ المنصّة أضيقُ من عمود
   قراءةٍ عاديّ، وهذا أقربُ ما نملك إليه بلا ادّعاء رقمٍ لم يُقَس. */
.pv{margin-top:var(--s-3); border:1px solid var(--line-soft); border-radius:var(--r);
  background:var(--surface-2); padding:var(--s-3) var(--s-4)}
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
  box-shadow:var(--sh-2), inset 0 1px 0 var(--hair)}
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
  padding:var(--s-0) var(--s-1); border-radius:5px; color:var(--ink);
  background:var(--surface); border:1px solid var(--line-strong);
  box-shadow:0 1px 0 var(--line-strong)}
.ch-logo.sm{width:30px; height:30px; border-radius:8px}
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
.draft-text:focus{outline:none; border-color:var(--brand-deep); box-shadow:var(--ring)}
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
   ليس قرارا. و aspect-ratio مع object-fit:cover يمنعان القفزَ قبل
   التحميل ويمنعان المطّ بعده — وصورةٌ ممطوطة تُقرأ إهمالا. */
.pic{margin-top:var(--s-2)}
/* height:auto ضروريّةٌ لا زينة: سِمَتا width/height على الوسم تُترجَمان
   إلى CSS بأولويّةٍ دنيا، فـ width:100% تغلب الأولى **ولا شيء يغلب
   الثانية** — فيبقى الارتفاع 628px والعرض عرضَ البطاقة، وتخرج الصورة
   ممطوطةً طولا. علّةٌ رأيتُها ولم يمسكها اختبار. */
.pic img{display:block; width:100%; height:auto; aspect-ratio:1.91/1; object-fit:cover;
  border-radius:var(--r); border:1px solid var(--line); background:var(--surface-2)}
.pic-foot{display:flex; align-items:center; gap:var(--s-1); flex-wrap:wrap; margin-top:var(--s-2)}
.pic.none{display:flex; align-items:center; gap:var(--s-2); flex-wrap:wrap;
  padding:var(--s-3) var(--s-3); border-radius:var(--r); background:var(--surface-2);
  border:1px dashed var(--line)}
.pic.none .ago{flex:1 1 200px}
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
nav.back{display:flex; align-items:center; gap:var(--s-3); padding:var(--s-3) 0 var(--s-5)}
nav.back a{font-size:var(--t-sm); font-weight:600; color:var(--ink-2); text-decoration:none;
  display:inline-flex; align-items:center; min-height:var(--tap)}
@media(hover:hover){nav.back a:hover{color:var(--brand)}}

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
.why .i{flex:none; color:var(--bad); font-size:var(--t-xs); padding-top:var(--s-1)}
.why b{color:var(--ink)}
.why .t{min-width:0}
/* الموعدُ لاتينيُّ الأرقام ويُعزَل عن اتّجاه الصفحة */
.ago.when{direction:ltr; unicode-bidi:isolate; display:inline-block}

/* ══ صفحتا الدخول والعامل الثاني ═════════════════════════════ */
.wrap{max-width:1180px; margin:0 auto; padding:var(--s-6) var(--s-5) var(--s-16)}
.auth{max-width:400px; margin:12vh auto}
.auth .glyph{width:54px; height:54px; border-radius:16px; margin:0 auto var(--s-4)}
.auth h1{text-align:center; font-size:var(--t-xl); margin:0 0 var(--s-1); letter-spacing:-.3px}
.auth .lede{text-align:center; color:var(--ink-3); font-size:var(--t-sm); margin:0 0 var(--s-5)}
.auth .card{padding:var(--s-5)}
.auth input{width:100%; direction:ltr; text-align:left; margin-bottom:var(--s-3)}
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
  .rail-head{padding:var(--s-3) var(--s-4) var(--s-2)}
  nav.tabs{flex-direction:row; overflow-x:auto; padding:0 var(--s-3) var(--s-2); gap:var(--s-1); scrollbar-width:none}
  nav.tabs::-webkit-scrollbar{display:none}
  nav.tabs .lbl{display:none}
  nav.tabs a{white-space:nowrap; padding:var(--s-2) var(--s-3)}
  nav.tabs .count{margin-inline-start:var(--s-1)}
  .rail-foot{display:none}
  .topbar{padding:0 var(--s-4)} .content{padding:var(--s-4)}
}
@media(max-width:720px){
  .draft-text{height:calc((var(--lines) + 6) * 26px + 28px)}
  .draft-text[data-ro]{height:auto; max-height:calc((var(--lines) + 6) * 26px + 28px)}
  .scroll{overflow:visible; margin:0}
  table{min-width:0; display:block}
  thead{position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0)}
  tbody,tr,td{display:block; width:100%}
  tr{border:1px solid var(--line); border-radius:var(--r); padding:var(--s-3); margin-bottom:var(--s-2);
    background:var(--surface-2)}
  @media(hover:hover){tbody tr:hover{background:var(--surface-2)}}
  td{border:0; padding:var(--s-1) 0}
  td::before{content:attr(data-label); display:block; font-size:var(--t-xs); color:var(--ink-3);
    margin-bottom:var(--s-0)}
  td:first-child::before{display:none}
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
     **وأُعيد بعد الخطّ المتغيّر** (D-089): ‏٥٤ch أعطت ‏٧٧، و‏٥٢ تعطي ‏٧٤. */
  margin:0 0 var(--s-3); max-width:52ch}
.doc p{font-size:var(--t-base); line-height:var(--lh-loose); color:var(--ink-2); margin:0 0 var(--s-3)}
.doc ul{margin:0 0 var(--s-3); padding-inline-start:var(--s-5)}
.doc li{font-size:var(--t-base); line-height:var(--lh-loose); color:var(--ink-2); margin-bottom:var(--s-2)}
.doc b{color:var(--ink)}
.doc a{color:var(--brand-deep); text-underline-offset:3px}
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

/* ══════════════════════════════════════════════════════════════════
   طبقةُ اللمس — **وموضعُها آخرُ الورقة قصدا** (D-086).

   CSS يرجّح المتأخّرَ عند تساوي المحدّدات. وكتلةٌ في الوسط تغلبها كلُّ
   قاعدةٍ بعدها — جُرّبت فبقيت الحقولُ على ‏١٢٫٥px رغم أنّ الوسيطَ يطابق.
   فطبقةُ الجهاز تُكتب آخرا، كما تُكتب طبقةُ الطباعة.
   ══════════════════════════════════════════════════════════════════ */
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
     «.copy input» ولا «.sched select» مهما تأخّرت */
  .copy input,.sched input,.sched select,.draft-text,input.mono{font-size:var(--t-lg)}
  /* **وعرضٌ ثابتٌ يفيض حين يكبر الخطّ**: أُضيف الحدُّ هنا لا في كلّ حقل،
     فحقلٌ يُكتب غدا بعرضٍ ثابتٍ يرثه. وقِيس فيضٌ ١٢px عند ٣٢٠px قبله */
  input,select,textarea{max-width:100%}
  /* **وعنصرُ الشبكةِ المرنةِ لا ينكمش دون محتواه ما لم يُؤذَن له.**
     و«min-width» الافتراضيّةُ في flex هي «auto» = عرضُ المحتوى، فدَرَجٌ
     خيارُه طويلٌ يدفع صفَّه كلَّه خارج البطاقة. وقِيس: حقلٌ ‏٢٩١px في
     حاويةٍ ‏٢٣٨px — وهو مصدرُ الفيض بعد رفعِ الخطّ إلى ١٦ */
  /* **والزرُّ يُستثنى** (D-089): المحدّدُ «.row > *» أخصُّ من «button»،
     فكان يدهس «min-width: var(--tap)» — **ويسقط الزرُّ دون هدف اللمس**.
     وقِيس: «حدّث» ‏٤٣×٤٤ عند ‏٣٢٠px، وحدُّه ‏٤٤.

     وعلّةٌ لم تظهر إلّا بعد تبديل الخطّ (D-089): كان النصُّ يبلغ ‏٤٤
     بعرضه، **فيستر النقصَ بلا أن يسدّه** — ونصٌّ أضيقُ بمحرفٍ يكشفه.
     **والحارسُ لا يُغني عن الاستثناء**: هذا ما كان يُقاس صحيحا صدفةً.

     والإذنُ بالانكماش كان للحقول لا للأزرار: الدَّرَجُ الطويلُ هو الذي
     أفاض الصفَّ (D-086)، وزرٌّ نصُّه كلمةٌ لا يفيض. */
  .row > *:not(button):not(.btn),.field{min-width:0}
}

`

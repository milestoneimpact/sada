/** الوثائق والطباعة ولوحة الأوامر والتنبيهات والموعد — الوحدةُ 12 من 14 في ورقة الأنماط، بترتيبها (`scripts/split_styles.mjs`). */
import { atLeast, below } from '../tokens'

export const EXTRAS = `/* ── الوثائق العامّة ──────────────────────────────────────────────────
   عمود واحد مقيَّد العرض: سطر يمتدّ عبر شاشة عريضة يُقرأ بعين تقفز،
   وهذه صفحة يُراد لها أن تُقرأ لا أن تُتصفَّح. */
.doc{max-width:51.25rem; margin:0 auto; padding:var(--s-10) var(--s-5) var(--s-16); background:var(--bg)}
.doc header{border-bottom:var(--bd); padding-bottom:var(--s-5); margin-bottom:var(--s-2)}
.doc .glyph{width:var(--s-10); height:var(--s-10); margin-bottom:var(--s-3)}
/* والوثيقةُ عمودُ قراءةٍ بعرض «--measure» (خطّة التصميم 5.4، القالب T5)، وأدوارُها
   أدوار اللوحة: عنوان الصفحة، وعنوان القسم، والمتن (D-185) */
.doc h1{font-size:var(--t-h1); line-height:var(--lh-h1); font-weight:600; margin:0 0 var(--s-2)}
.doc h2{font-size:var(--t-h2); line-height:var(--lh-h2); font-weight:600; margin:var(--s-8) 0 var(--s-2)}
.doc h3{font-size:var(--t-h3); line-height:var(--lh-h3); font-weight:600; margin:var(--s-6) 0 var(--s-2)}
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
   مراجع منصّة قد يطبع سياسة الخصوصيّة، وصفحة تخرج برافدة وأزرار
   وظلال تُقرأ مسوّدةً لا وثيقة. فيبقى النصّ وحده على بياض.

   والروابط تُطبَع بعناوينها: ورقة فيها «اضغط هنا» لا تُتابَع. */
@media print{
  @page{margin:18mm}
  *{box-shadow:none!important; transition:none!important}
  html,body{background:#fff!important; color:#000!important}
  .rail,.topbar,.seg,.skip,footer,nav.tabs,button,.btn,form{display:none!important}
  .app{display:block}
  /* والهوامشُ من @page لا من الحاوية: حاويةٌ بلا حدٍّ أقصى تمدّ السطرَ
     عبر الورقة كلّها، وقيد المقاس على الفقرات يبقى قائما */
  .content,.doc{padding:0; margin:0; max-width:100%}
  .card,.ch,.draft{border:1px solid #ccc; break-inside:avoid; page-break-inside:avoid}
  section[data-pane][hidden]{display:none!important}
  h1,h2,h3{break-after:avoid; page-break-after:avoid}
  a[href^="http"]::after{content:' (' attr(href) ')'; font-size:var(--t-caption); color:#555}
  .doc a[href^="mailto"]::after{content:''}
}

/* ── طبقة الحركة (D-246 · D-312) ──────────────────────────────────────
   صعود البطاقة حين تدخل، ووميض الهيكل حين ينتظر، والانتقال بين الصفحات بلا سكربت
   (View Transitions بين المستندات) — فلا نونس يُطلب ولا شيفرة. وكلّها تسقط مع تقليل الحركة.

   **والحركة تشرح لا تزيّن** (D-312): ثلاثُ وظائف لا غير — الاستمراريّة (من أين وإلى أين)،
   والإقرار (استلمتُ فعلك)، والتوجيه (انظر هنا). فالمحتوى ينزلق من جهة النهاية حين يتقدّم المالك
   ومن البداية حين يرجع، وعلامةُ الرافدة تنزلق إلى القسم الجديد، والطيُّ يُفتح بانزلاقٍ لا بقفزة،
   والتلميحُ يظهر بعد مهلة. وكلُّ خاصّيّةٍ تُحرَّك مسمّاةٌ (opacity وtransform وheight في الطيّ وحدَه)،
   ولا «transition:all». و«--dir» على الجذر وحدَه (D-124)، وصفحةٌ تُقرأ من اليسار تكتبه ‏-١ هناك. */
@view-transition{navigation:auto}
@keyframes rise{from{opacity:0; transform:translateY(var(--s-2))}to{opacity:1; transform:none}}
@keyframes shimmer{from{background-position:100% 0}to{background-position:-100% 0}}
.skeleton{border-radius:var(--r-control); color:transparent;
  background:linear-gradient(90deg,var(--surface-2) 25%,var(--surface-3) 50%,var(--surface-2) 75%);
  background-size:200% 100%; animation:shimmer 1.4s linear infinite}
/* ‏البطاقاتُ تدخل متتابعةً لا دفعةً واحدة (D-312): ‏40ms بين البطاقة وأختها حتّى الخامسة، وما بعدها معها —
   فالمجموع تحت نصف ثانية (Material 3: التتابع ستّةٌ على الأكثر). والعدُّ بين الإخوة في الحاوية الواحدة */
.card:nth-child(2){animation-delay:var(--stagger)}
.card:nth-child(3){animation-delay:calc(2 * var(--stagger))}
.card:nth-child(4){animation-delay:calc(3 * var(--stagger))}
.card:nth-child(n+5){animation-delay:calc(4 * var(--stagger))}
/* ‏الهيكلُ ثابتٌ والمحتوى يتبدّل (D-312): الرافدةُ والشريطُ باسمَيهما فلا يُعاد رسمُهما مع كلّ انتقال —
   صفحةٌ كلُّها تتلاشى تُقرأ «أُعيد تحميلُها»، ومحتوًى وحدَه يدخل يُقرأ «انتقلتُ». والحاليُّ في الرافدة
   باسمه فتنزلق علامتُه إلى القسم الجديد بدل أن تقفز (المجموعة تتحرّك من موضعها القديم إلى الجديد).
   **والاسمُ على الابن المباشر وحدَه**: رابطُ القسم في ورقة «المزيد» على الهاتف يحمل aria-current
   أيضًا، واسمان متطابقان يُسقطان الانتقالَ كلَّه. وأسماءُ الرافدة والشريط والمحتوى في قواعدها (02-shell): محدّدٌ واحد
   يُعلَن مرّةً (D-148) */
nav.tabs>a[aria-current=page]{view-transition-name:nav-current}
::view-transition-old(root),::view-transition-new(root){animation-duration:var(--dur-2); animation-timing-function:var(--ease-rise)}
::view-transition-group(*){animation-duration:var(--dur-2); animation-timing-function:var(--ease-out)}
/* ‏والمحتوى: الخارجُ يتلاشى سريعًا (‏70٪ من الداخل)، والداخلُ يصعد ‏8px بين المستندات، وداخل اللوحة
   ينزلق ‏24px من جهة النهاية إلى الأمام ومن البداية رجوعًا — والسكربتُ يكتب الجهةَ في «data-nav» */
::view-transition-old(content){animation:vt-out var(--dur-1) var(--ease) both}
::view-transition-new(content){animation:vt-in var(--dur-3) var(--ease-rise) both}
html[data-nav=forward]::view-transition-new(content){animation-name:vt-from-end}
html[data-nav=back]::view-transition-new(content){animation-name:vt-from-start}
@keyframes vt-out{to{opacity:0}}
@keyframes vt-in{from{opacity:0; transform:translateY(var(--s-2))}}
@keyframes vt-from-end{from{opacity:0; transform:translateX(calc(var(--dir) * -1 * var(--s-6)))}}
@keyframes vt-from-start{from{opacity:0; transform:translateX(calc(var(--dir) * var(--s-6)))}}
/* ‏وبعد أوّل انتقالٍ بالسكربت لا تعاود البطاقاتُ صعودَها: اللوحُ يدخل كلُّه بالانزلاق، وبطاقاتٌ تصعد
   داخل لوحٍ ينزلق حركتان في اتّجاهين (قاعدةُ «مالكٌ واحد لكلّ خاصّيّة») */
html[data-nav] section[data-pane] .card{animation-name:none}
/* ── الطيُّ يُفتح بانزلاقٍ لا بقفزة (D-312) ──────────────────────────────
   «::details-content» صندوقُ ما تحت الرأس، وارتفاعُه من صفرٍ إلى «auto» يُحرَّك حيث تُعرَف
   «interpolate-size»، ويتلاشى معه. ومتصفّحٌ لا يعرفها يفتح كما يفتح اليوم — لا شيء ينكسر.
   **وتُستثنى ورقةُ «المزيد» والقائمةُ**: ما فيهما موضوعٌ بإطلاقٍ خارج الصندوق، وصندوقٌ ارتفاعُه صفر
   يُحرَّك يحبسهما. والقصُّ بهامش ‏8px فلا يُقصّ ظلُّ بطاقةٍ ولا حلقةُ تركيز */
details{interpolate-size:allow-keywords}
details:not(.more-sheet):not(.menu)::details-content{height:0; overflow:clip; overflow-clip-margin:var(--s-2); opacity:0;
  transition:height var(--dur-2) var(--ease), opacity var(--dur-2) var(--ease), content-visibility var(--dur-2) allow-discrete}
details[open]:not(.more-sheet):not(.menu)::details-content{height:auto; opacity:1}
/* ‏والرأسُ يردّ على التمرير بلونٍ وأرض (انتقالُه في قاعدة «summary» في 08-sections)، ورأسُ المهمّة بأرض التمرير الخفيفة */
@media(hover:hover){.setup>summary:hover{color:var(--ink)} .task>summary:hover{background:var(--hover)}}
/* ‏والقائمةُ المنسدلة تدخل من زرّها: ‏96٪ إلى ‏100٪ مع تلاشٍ، والأصلُ عند الزرّ لا في الوسط */
@keyframes menu-in{from{opacity:0; transform:scale(.96)}}
.menu[open]>.menu-list{animation:menu-in var(--dur-1) var(--ease-out); transform-origin:top}
/* ── التلميح (D-312) ──────────────────────────────────────────────────
   «title» الأصليّ يظهر بعد ثانيةٍ بخطّ النظام ولا يظهر للوحة المفاتيح. فالتلميحُ من «data-tip»
   أو من «aria-label» زرِّ الأيقونة نفسِه — **نصٌّ واحد للاسم والتلميح** فلا يفترقان — يظهر بعد ‏400ms
   على التمرير وفورًا على التركيز، ويدخل ‏4px من جهة مرجعه، وفوقه إلّا في الشريط العلويّ فتحته.
   وهو زينةٌ على ما له اسمٌ أصلًا: قارئُ الشاشة يقرأ الاسمَ من سمته لا من هنا. و«Esc» تخفيه (WCAG 1.4.13) */
/* ‏**وبخصوصيّةٍ صفر** («:where»): شريطُ الخطّ الزمنيّ «.gt-bar» موضوعٌ بإطلاقٍ وله التلميح، وقاعدةٌ متأخّرة بخصوصيّةٍ
   مساوية كانت تنزع إطلاقَه فينسحق الشريط إلى ‏22px (أمسكه audit_mobile هدفَ لمسٍ صغيرًا) */
:where([data-tip],.btn-icon[aria-label]){position:relative}
/* ‏**والمخفيُّ «display:none» لا «visibility:hidden»**: صندوقٌ خفيٌّ خارج حافّة الشاشة يمدّ عرضَ التمرير ‏4px
   (قاسه audit_design فيضانًا أفقيًّا على كلّ صفحة). و«display» يُحرَّك بـ«allow-discrete» فيبقى الخروجُ تلاشيًا،
   و«@starting-style» تصف الدخول؛ ومتصفّحٌ لا يعرفهما يُظهره ويخفيه فورًا */
[data-tip]::before,.btn-icon[aria-label]::before{content:attr(data-tip); position:absolute; z-index:30; display:none;
  inset-block-end:calc(100% + var(--s-2)); inset-inline-start:50%; translate:calc(var(--dir) * 50%) var(--s-1);
  width:max-content; max-width:18rem; padding:var(--s-1) var(--s-2); border-radius:var(--r-control);
  background:var(--ink); color:var(--surface); font-size:var(--t-caption); line-height:var(--lh-caption); font-weight:400;
  text-decoration:none; text-align:center; white-space:normal; pointer-events:none; box-shadow:var(--sh-2); opacity:0;
  transition:opacity var(--dur-1) var(--ease), translate var(--dur-1) var(--ease), display var(--dur-1) allow-discrete}
.btn-icon[aria-label]::before{content:attr(aria-label)}
/* ‏و«@starting-style» التمرير داخل حارس «hover» نفسِه: محدّدُ تمريرٍ خارجه يعلق على اللمس (audit_mobile) */
@media(hover:hover){
  [data-tip]:hover::before,.btn-icon[aria-label]:hover::before{display:block; opacity:1; translate:calc(var(--dir) * 50%) 0;
    transition-delay:var(--delay-tip)}
  @starting-style{
    [data-tip]:hover::before,.btn-icon[aria-label]:hover::before{opacity:0; translate:calc(var(--dir) * 50%) var(--s-1)}
  }
}
[data-tip]:focus-visible::before,.btn-icon[aria-label]:focus-visible::before{display:block; opacity:1; translate:calc(var(--dir) * 50%) 0}
@starting-style{
  [data-tip]:focus-visible::before,.btn-icon[aria-label]:focus-visible::before{opacity:0; translate:calc(var(--dir) * 50%) var(--s-1)}
}
.topbar [data-tip]::before,.topbar .btn-icon[aria-label]::before,nav.back [data-tip]::before,nav.back .btn-icon[aria-label]::before{
  inset-block-end:auto; inset-block-start:calc(100% + var(--s-2)); translate:calc(var(--dir) * 50%) calc(-1 * var(--s-1))}
/* ‏**ومتى جرى السكربتُ حلّ محلَّ الزائف عنصرٌ يُمسَك** (D-323 · WCAG 1.4.13): الزائفُ بلا أحداثِ مؤشّر وبينه وبين مرجعه
   فجوة، فمن حرّك المؤشّرَ إليه اختفى، ولا يظهر باللمس. فـ«data-tipjs» على الجذر يُطفئه، و«.tip» أدناه هو التلميح */
html[data-tipjs] [data-tip]::before,html[data-tipjs] .btn-icon[aria-label]::before{display:none; opacity:0; transition-delay:0s}
/* ‏والتلميحُ عنصرٌ واحدٌ مثبَّتٌ يضعه السكربتُ فوق مرجعه أو تحته، **ويستقبل المؤشّر** فيبقى والمؤشّرُ عليه، بالوزن ‏400 من
   زوج الوزنين المعلَن (‏500 كان خارجه فيسقط إلى ‏400 أصلًا)، ويدخل بتلاشٍ من جهة مرجعه ويسقط مع تقليل الحركة.
   **وجانباه «auto» لا صفر** (مراجعة D-323): السكربتُ يكتب «left» من إحداثيّ النافذة، و«inset-inline-start:0» كان «right:0» في
   الصفحة العربيّة — فـ«left» و«width» و«right» معًا فوق القيد، والمتصفّحُ يُسقط «left» في كتلةٍ من اليمين، **فلصق كلُّ تلميحٍ
   حافّةَ الشاشة اليمنى** (‏1218–1280 لجرسٍ عند ‏393–437)، بعيدًا عن هدفه فلا يبلغه المؤشّر. و«audit_a11y» يقيس التداخل */
.tip{position:fixed; z-index:60; inset-block-start:0; inset-inline:auto; width:max-content; max-width:min(18rem,calc(100vw - 2 * var(--s-2)));
  padding:var(--s-1) var(--s-2); border-radius:var(--r-control); background:var(--ink); color:var(--surface);
  font-size:var(--t-caption); line-height:var(--lh-caption); font-weight:400; text-align:center; white-space:normal; overflow-wrap:anywhere;
  box-shadow:var(--sh-2); pointer-events:auto; opacity:1; translate:0 0;
  transition:opacity var(--dur-1) var(--ease), translate var(--dur-1) var(--ease), display var(--dur-1) allow-discrete}
.tip[hidden]{display:none; opacity:0}
@starting-style{.tip{opacity:0; translate:0 var(--s-1)} .tip[data-side=below]{translate:0 calc(-1 * var(--s-1))}}
/* ‏والروابطُ تردّ بانتقالٍ لا بقفزة (والمقطعُ في قاعدته في 08-sections) */
a{transition:color var(--dur-1) var(--ease), text-decoration-color var(--dur-1) var(--ease), background var(--dur-1) var(--ease)}
@media(prefers-reduced-motion:reduce){
  *,*::before,*::after{transition:none!important; animation:none!important; scroll-behavior:auto!important}
  .btn:active:not(:disabled):not([aria-disabled="true"]){transform:none}
  ::view-transition-group(*),::view-transition-old(*),::view-transition-new(*){animation:none!important}
  .card{animation-delay:0s}
}

/* ── لوحةُ الأوامر (D-105) ────────────────────────────────────────────
   طبقة تعلو كلّ شيء وتحجب ما تحتها بلا أن تمحوه: الحجاب يقول «أنت
   في مكان مؤقّت»، **وشاشة تُبدَّل بالكامل تقول إنّك انتقلت** — ولم
   تنتقل بعد.

   وتُثبَّت في الثلث الأعلى لا في المنتصف: المنتصف يجعل القائمة تنمو
   في الاتّجاهين فتقفز أوّل نتيجة مع كلّ حرف. **والعين تلاحق ما
   يقفز ولا تقرؤه.** */
/* **و«hidden» تُهزَم صامتةً** (D-105).

   قاعدة المتصفّح «[hidden]{display:none}» من أصل أدنى، **وأيّ قاعدة
   مؤلّف تضع «display» تغلبها**. فحجاب اللوحة كُتب «display:flex» ورُسم
   «hidden» — **فظهر على كلّ صفحة عند التحميل**، والسمة موجودة تُقرأ
   في المصدر فتُصدَّق.

   وهي علّة لا تُمسَك بقراءة الوسم: الوسم صحيح. **فتُقفَل هنا مرّةً
   للكلّ** — لا بقاعدة لكلّ صنف يُكتب غدا فيُنسى في واحد. */
/* **وفقرةٌ في بطاقةٍ بلا صنفٍ ترث قاعدةَ المتصفّح** — «margin:1em» = ‏١٤px،
   وليست من السلّم. ولم يُلحَظ ذلك قبل لأنّ كلّ فقرة كانت تحمل صنفا؛
   **وأوّلُ فقرةٍ عاريةٍ كُتبت أظهرتها**. فتُقيَّد هنا لا في موضعها. */
/* ‏فقرةُ البطاقة العامّة — لا فقراتُ ما نُقل إليها في ٢ج (ملحوظةُ القناة وسببُ المسوّدة ومتنُ المعاينة لها
   قياسُها)، و«:where» يُبقي الوزن ‏(0,1,1) كما كان فلا يغلب صنفًا كان يغلبه */
.card:where(:not(.ch,.draft,.pv)) > p{margin:var(--s-3) 0 0; font-size:var(--t-small); color:var(--ink-2);
  line-height:var(--lh-small); max-width:var(--measure)}
.card:where(:not(.ch,.draft,.pv)) > h2 + p{margin-top:var(--s-2)}

/* ── صندوقُ التنبيهات (D-109) ─────────────────────────────────────────
   صفّ لكلّ ما خرج: حالُه ومتنُه ورمز الردّ. **والحال لون ورمز ونصّ**
   (D-043) — ‏٤٠٤ حمراء وحدَها لا تُقرأ، ومعها «✕ نشر فشل» تُقرأ. */
.ax{margin:var(--s-3) 0 0; padding:0; list-style:none;
  display:flex; flex-direction:column; gap:var(--s-2)}
.ax-r{display:flex; align-items:center; gap:var(--s-2); flex-wrap:wrap;
  padding:var(--s-2); border:var(--bd-soft)}
/* ‏والمتنُ يلتفّ ولا يُقصّ (D-185): يُقتضَب في الخادم إلى سبعين حرفًا، فقصُّه بالنقاط
   فوق ذلك يُخفي آخر ما بقي — وبحرف ‏١٤ صار يُقصّ ‏٩٥px («measure_text») */
.ax-b{min-width:0; flex:1 1 14rem; font-size:var(--t-small); line-height:var(--lh-small); color:var(--ink-2);
  overflow-wrap:anywhere}
.chip.bad{color:var(--bad); background:var(--bad-wash);
  border-color:color-mix(in srgb,var(--bad) 28%,transparent)}
/* ‏‏والخطأُ الطويلُ سطرٌ يُفتح لا تلميح (D-323): الرقاقةُ رأسُه بهدف لمسٍ كامل، والنصُّ كاملًا تحته يلتفّ ولا يُقصّ.
   ووصفُ الصورة في ذيلها على النمط نفسِه */
.ax-err,.pic-desc{min-width:0; max-width:100%}
.ax-err>summary,.pic-desc>summary{display:inline-flex; align-items:center; min-height:var(--tap); cursor:pointer; list-style:none}
.ax-err>summary::-webkit-details-marker,.pic-desc>summary::-webkit-details-marker{display:none}
.ax-err>p,.pic-desc>p{max-width:var(--measure); overflow-wrap:anywhere}
.pic-desc[open]{flex-basis:100%}

/* ── اليومُ الأوّل (D-108) ─────────────────────────────────────────────
   خطوات مرقّمة لا بطاقات: **الترتيب هو المعلومة** — كلّ خطوة تفتح
   التي بعدها، وشبكة من خمس تقول «افعل أيَّها شئت» وهو ليس صحيحا.


/* ── الموعدُ بوجهين (D-106) ───────────────────────────────────────────
   سطر فوق سطر: توقيت الرياض كما كتبه الخادم (D-201)، وتحته قراءة متصفّح في منطقة أخرى. **ولا
   يُصدَّق أحدُهما على حساب الآخر** — فمن أخفى الثاني جعل المالك يحوّل
   ذهنيّا، ومن أخفى الأوّل محا الصيغة التي في القاعدة والتقارير.

   والمحلّيّ أخفت وأصغر: **هو الأليف الذي يُقرأ بلمحة**، والأوّل هو
   الذي يُنسَخ ويُقارَن. */
.when-t{display:inline-flex; flex-direction:column; gap:1px; vertical-align:middle}
.when-t .tz{font-size:var(--t-caption); line-height:var(--lh-caption); color:var(--ink-2); font-weight:600}

/* سطرُ الذروة — خبرٌ لا أمر، فبلا زرٍّ ولا لونِ حالة (D-043) */
.hint.peak{margin-top:var(--s-2); display:flex; align-items:center;
  gap:var(--s-2); flex-wrap:wrap}
.hint.peak .chip{margin:0}

/* سطرُ الجاهزيّة تحت زرَّي الصورة والمقطع (D-163) — نقاطٌ بلونها ورمزها
   وكلمتها، ثمّ سبب أوّل ساقطة ورابطُه. **ويأخذ سطرَه كاملًا** في صفّ
   «بلا صورة» المرن، فلا يزاحم الزرّ في سطره. وبلا لون الهويّة: الحال
   تُقال بألوان الحال وحدها */
.hint.ready{margin:var(--s-2) 0 0; display:flex; align-items:center;
  gap:var(--s-1) var(--s-2); flex-wrap:wrap; flex-basis:100%}
/* ورابطُ الإصلاح بحبر الرابط كروابط الوثيقة — لا أزرقُ المتصفّح: الورقةُ
   لا تلوّن «a» عامّةً، فرابط بلا قاعدة يخرج بلون لا يعرفه الثيمان */
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
.cmdk-in input{flex:1; min-width:0; min-height:var(--tap); border:0; background:none;
  font:inherit; font-size:var(--t-input); line-height:var(--lh-input); color:var(--ink)}
.cmdk-in input::placeholder{color:var(--ink-3)}
/* ‏الحقلُ بلا حدٍّ فلا يتبدّل لونُه عند التركيز، **وحلقتُه حلقةُ كلّ حقل** (مراجعة D-323): كان «outline:none» هنا يغلب
   «input:focus» (التحديدُ نفسُه وبعده في الورقة) فبقي خيطٌ ‏2px تحت السطر وحدَه (D-149 · D-187) — لا مساحةَ محيطٍ ولا أثرَ في
   الوضع القسريّ (WCAG 2.4.13). فصار خطًّا صلبًا ‏2px حول الحقل بحبر التركيز، وسقط الخيطُ: خطّان متوازيان يقولان «هنا» مرّتين */
.cmdk-l{flex:1; margin:0; padding:var(--s-2); list-style:none; overflow-y:auto}
.cmdk-g{padding:var(--s-3) var(--s-3) var(--s-1); font-size:var(--t-caption);
  line-height:var(--lh-caption); font-weight:600; color:var(--ink-2)}
/* الخيارُ رابطٌ يبقى رابطا: يُفتَح بالوسط ويُنسَخ عنوانُه كأيّ رابط */
.cmdk-o{display:flex; align-items:center; gap:var(--s-3); text-decoration:none;
  padding:var(--s-2) var(--s-3); border-radius:var(--r-control); color:var(--ink);
  min-height:var(--tap); transition:background var(--dur-1) var(--ease)}
/* **والمختارُ يُعلَّم بأكثرَ من لون** (D-043): أرضيّةٌ وشريطٌ جانبيّ،
   فمن لا يميّز اللون يرى الشريط. */
.cmdk-o[aria-selected="true"]{background:var(--surface-2);
  box-shadow:inset calc(-1 * var(--ring-w)) 0 0 var(--accent)}
@media(hover:hover){.cmdk-o:hover{background:var(--hover)}}
.cmdk-i{flex:none; display:grid; place-items:center; width:var(--icon-md); color:var(--ink-3)}
.cmdk-i svg{width:var(--icon-md); height:var(--icon-md); display:block}
.cmdk-o[aria-selected="true"] .cmdk-i{color:var(--accent)}
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
   متجاوران بارتفاعين يُقرآن رتبتين** — ولا رتبة بينهما. و‏٤٤ هدف
   اللمس الأدنى (D-102) لا اختيار ذوق. */
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

/* ── الخطّةُ لوحةً أو قائمة (D-259) ─────────────────────────────────────
   أعمدةٌ بعرض بطاقة تُمرَّر أفقيًّا على الهاتف بالتقاطٍ لكلّ عمود، والبطاقةُ ترتفع وتميل قليلًا
   عند المرور، وظلٌّ يتبع الإصبع عند السحب. **وكلُّ حركةٍ تسقط مع تقليل الحركة.** */
.pb-board[data-mode="board"]{display:grid; grid-auto-flow:column; grid-auto-columns:minmax(15rem,1fr);
  gap:var(--s-3); overflow-x:auto; scroll-snap-type:x proximity; padding-bottom:var(--s-2); perspective:60rem}
.pb-board[data-mode="list"]{display:grid; gap:var(--s-4)}
.pb-col{scroll-snap-align:start; display:flex; flex-direction:column; gap:var(--s-2); min-width:0;
  background:var(--surface-2); border:var(--bd-soft); border-radius:var(--r-control); padding:var(--s-3);
  transition:background var(--dur-2) var(--ease), outline-color var(--dur-2) var(--ease); outline:var(--s-0) dashed transparent}
.pb-col.over{background:var(--hover); outline-color:var(--focus)}
.pb-head{display:flex; align-items:baseline; gap:var(--s-2); margin:0; font-size:var(--t-ui); line-height:var(--lh-ui); font-weight:600}
.pb-head .count{margin-inline-start:auto}
.pb-drop{display:flex; flex-direction:column; gap:var(--s-2); min-height:var(--s-16)}
.pb-board[data-mode="list"] .pb-drop{min-height:0; display:grid; grid-template-columns:repeat(auto-fill,minmax(18rem,1fr))}
/* والعرضُ المختارُ يُرى مختارًا */
#board [data-view][aria-pressed="true"]{background:var(--hover); border-color:var(--ink-2)}
.pb-card{padding:var(--s-3); margin:0; box-shadow:var(--sh-1); display:flex; flex-direction:column; gap:var(--s-2); touch-action:pan-y;
  border-inline-start-width:var(--ring-w);
  transition:transform var(--dur-2) var(--ease-out), box-shadow var(--dur-2) var(--ease-out); transform-origin:center bottom}
/* ولا يُظلَّل النصُّ تحت الإصبع أثناء السحب */
.pb-board[data-mode="board"] .pb-card{cursor:grab; user-select:none; -webkit-user-select:none}
.pb-card[data-platform="linkedin"]{border-inline-start-color:var(--link)}
.pb-card[data-platform="x"]{border-inline-start-color:var(--ink)}
@media(hover:hover){.pb-board[data-mode="board"] .pb-card:hover{transform:translateY(calc(-1 * var(--s-0))) rotateX(3deg); box-shadow:var(--sh-2)}}
.pb-card:focus-visible{outline:var(--stroke) solid var(--focus); outline-offset:var(--stroke)}
.pb-card.dragging{opacity:.35}
.pb-card.landed{animation:pb-land var(--dur-3) var(--ease-rise)}
@keyframes pb-land{from{transform:scale(.96)} to{transform:none}}
.pb-ghost{position:fixed; z-index:60; pointer-events:none; margin:0; transform:rotate(-2deg) scale(1.03); box-shadow:var(--sh-2); cursor:grabbing}
.pb-top{display:flex; align-items:center; gap:var(--s-2)}
.pb-plat{display:inline-flex; align-items:center; gap:var(--s-1); font-size:var(--t-small); line-height:var(--lh-small)}
.pb-plat svg{width:var(--icon-sm); height:var(--icon-sm)}
.pb-time{margin-inline-start:auto; font-size:var(--t-small); line-height:var(--lh-small); color:var(--ink-2)}
.pb-angle{margin:0; font-size:var(--t-ui); line-height:var(--lh-ui); display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden}
.pb-board[data-mode="list"] .pb-angle{-webkit-line-clamp:unset}
.pb-src{font-size:var(--t-small); line-height:var(--lh-small); color:var(--ink-2)}
.pb-more summary{font-size:var(--t-small); line-height:var(--lh-small); color:var(--link); cursor:pointer; min-height:var(--tap); display:flex; align-items:center}
.pb-edit{display:grid; gap:var(--s-2)}
.pb-edit label{display:grid; gap:var(--s-1); font-weight:400}
.pb-board[data-mode="list"] .pb-edit{grid-template-columns:repeat(auto-fit,minmax(10rem,1fr)); align-items:end}
/* التقويم: أسبوعٌ في كلّ صفّ، وفي الخانة رقمُ اليوم ورقائقُ بنوده (شعارٌ وساعةٌ وسطرٌ) */
.pb-cal{display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); gap:var(--s-2)}
.pb-wd{font-size:var(--t-small); line-height:var(--lh-small); color:var(--ink-2); text-align:center; font-weight:600}
.pb-cell{min-height:7rem; padding:var(--s-2); gap:var(--s-1)}
.pb-dn{font-size:var(--t-small); line-height:var(--lh-small); color:var(--ink-2); font-weight:600}
.pb-chip{flex-direction:row; align-items:center; gap:var(--s-1); padding:var(--s-1) var(--s-2); font-size:var(--t-small); line-height:var(--lh-small);
  cursor:grab; user-select:none; -webkit-user-select:none}
.pb-chip svg{width:var(--icon-xs); height:var(--icon-xs); flex:none}
.pb-ct{overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0}
/* ‏وعلى الهاتف أجندةٌ لا شبكة (من Google Calendar وNotion): سبعةُ أعمدةٍ في ‏390px تُقصّ أسماءها، فاليومُ صفٌّ باسمه كاملًا */
.pb-dl{display:none}
@media${below('md')}{
  .pb-cal{grid-template-columns:1fr}
  .pb-wd,.pb-dn{display:none}
  .pb-dl{display:block; font-size:var(--t-small); line-height:var(--lh-small); font-weight:600}
  .pb-cell{min-height:0}}
/* ‏محتوى البند والأصول (D-260): المختارُ يُرى مختارًا، والمعاينةُ بنسبةٍ ثابتة لا تقفز */
#board .pb-card .btn[aria-pressed="true"],.lib-chips .btn[aria-current="page"]{background:var(--hover); border-color:var(--ink-2)}
.lib-thumb{width:100%; aspect-ratio:4/3; object-fit:cover; border-radius:var(--r-control); margin-bottom:var(--s-3); background:var(--surface-2)}
.lib-ico{display:grid; place-items:center; font-size:var(--t-h1); line-height:var(--lh-h1); color:var(--ink-2)}
/* ‏الرحلةُ في ستّ خطوات: ما مضى بعلامته، والحاليّةُ بارزة، وما بعدها خافت */
.flow{list-style:none; margin:0; padding:0; display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); gap:var(--s-2); counter-reset:none}
.flow li{display:flex; align-items:center; gap:var(--s-2); font-size:var(--t-small); line-height:var(--lh-small); color:var(--ink-2);
  padding-block-start:var(--s-2); border-block-start:var(--ring-w) solid var(--line); transition:border-color var(--dur-2) var(--ease), color var(--dur-2) var(--ease)}
.flow li[data-state="done"]{border-block-start-color:var(--ink-2)}
.flow li[data-state="now"]{color:var(--ink); font-weight:600; border-block-start-color:var(--focus)}
.flow-n{display:inline-grid; place-items:center; width:var(--icon-md); height:var(--icon-md); border-radius:var(--r-pill); background:var(--surface-2); flex:none}
.flow li[data-state="now"] .flow-n{background:var(--focus); color:var(--surface)}
@media${below('md')}{.flow{grid-template-columns:repeat(3,minmax(0,1fr))}}
/* ── شريطُ الفلتر الواحد والرقمُ باتّجاهه (UX-AUDIT-4 · أ) ─────────────
   سطرٌ واحدٌ يلتفّ: مقطّعٌ للخيارات القليلة، وزرُّ قائمةٍ للطويلة، وشعاراتٌ للمنصّات. */
.fbar{display:flex; flex-wrap:wrap; align-items:center; gap:var(--s-2); margin-block:var(--s-3) var(--s-4)}
.fb-seg{display:inline-flex; flex-wrap:wrap; max-width:100%; padding:var(--s-0); gap:var(--s-0); background:var(--surface-2); border:var(--bd-soft); border-radius:var(--r-control)}
.fb-opt{display:inline-flex; align-items:center; min-height:var(--tap); padding:0 var(--s-3); border:0; background:transparent; border-radius:var(--r-control);
  font:inherit; font-size:var(--t-small); line-height:var(--lh-small); color:var(--ink-2); text-decoration:none; cursor:pointer;
  transition:background var(--dur-2) var(--ease), color var(--dur-2) var(--ease)}
.fb-opt[aria-pressed="true"]{background:var(--surface); color:var(--ink); font-weight:600; box-shadow:var(--sh-1)}
@media(hover:hover){.fb-opt:hover{color:var(--ink)}}
.fb-logos{display:inline-flex; flex-wrap:wrap; gap:var(--s-1)}
.fb-logo{display:inline-grid; place-items:center; width:var(--tap); height:var(--tap); border:var(--bd-soft); border-radius:var(--r-control);
  background:var(--surface); color:var(--ink-2); opacity:.55; transition:opacity var(--dur-2) var(--ease), border-color var(--dur-2) var(--ease)}
.fb-logo svg{width:var(--icon-md); height:var(--icon-md)}
.fb-logo[aria-pressed="true"]{opacity:1; border-color:var(--ink-2); box-shadow:var(--sh-1)}
@media(hover:hover){.fb-logo:hover{opacity:1}}
.fb-btn{display:inline-flex; align-items:center; gap:var(--s-1); min-height:var(--tap); padding:0 var(--s-3); border:var(--bd-soft);
  border-radius:var(--r-control); background:var(--surface); font-size:var(--t-small); line-height:var(--lh-small); cursor:pointer}
.fb-k{color:var(--ink-2)}
.fb-btn .menu-caret svg{width:var(--icon-sm); height:var(--icon-sm)}
.kpi{margin:0; padding:var(--s-4); display:flex; flex-direction:column; gap:var(--s-1)}
.kpi-k{font-size:var(--t-small); line-height:var(--lh-small); color:var(--ink-2); font-weight:600}
.kpi-v{font-size:var(--t-h1); line-height:var(--lh-h1); color:var(--ink)}
.kpi-d{font-size:var(--t-small); line-height:var(--lh-small); font-weight:600}
.kpi-d[data-tone="good"]{color:var(--ok)}
.kpi-d[data-tone="bad"]{color:var(--bad)}
.kpi-d[data-tone="flat"]{color:var(--ink-2); font-weight:400}
.kpi-n{font-size:var(--t-caption); line-height:var(--lh-caption); color:var(--ink-2)}
.clamp2{display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden}
.oc-grid{display:grid; grid-template-columns:repeat(auto-fill,minmax(min(100%,18rem),1fr)); gap:var(--s-3)}
.oc{margin:0; padding:var(--s-4); display:flex; flex-direction:column; gap:var(--s-3)}
.oc[aria-current="true"]{border-color:var(--ink-2)}
.oc-h{display:flex; align-items:center; gap:var(--s-2); flex-wrap:wrap}
.oc-ch{margin-inline-start:auto; font-size:var(--t-small); line-height:var(--lh-small); color:var(--ink-2)}
.oc-fs{display:flex; flex-wrap:wrap; gap:var(--s-2) var(--s-4)}
.oc-f{display:inline-flex; align-items:baseline; gap:var(--s-1); font-size:var(--t-small); line-height:var(--lh-small); color:var(--ink-2)}
.oc-f b{font-size:var(--t-h3); line-height:var(--lh-h3); color:var(--ink)}
.oc-f[data-tone="warn"] b{color:var(--warn)}
.oc-f[data-tone="bad"] b{color:var(--bad)}
.oc-quiet{font-size:var(--t-small); line-height:var(--lh-small); color:var(--ink-2)}
.kpis{display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:var(--s-3); margin-bottom:var(--s-4)}
@media${below('md')}{.kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(prefers-reduced-motion:reduce){
  .pb-card,.pb-col{transition:none}
  .pb-card.landed{animation:none}
  .pb-ghost{transform:none}
  .flow li{transition:none}
  .fb-opt,.fb-logo{transition:none}
  details.fold > summary::before{transition:none}
}

/* ── معالجُ «خطّة جديدة» (D-283 · D-284) ──────────────────────────────
   خطوةٌ في كلّ شاشة: شريطُ تقدّمٍ بأسماء الخطوات، وبطاقاتُ اختيارٍ كبيرة، وشريطٌ ثابتٌ تحت.
   **وبلا سكربتٍ تُرى الخطواتُ متتابعةً** يفصلها خطّ — و«wz-on» يضيفه السكربتُ وحدَه. */
.card.wz{max-width:calc(var(--measure) * 1.6 + var(--s-16)); padding-bottom:0}
/* ── شاشةُ بناء الخطّة (D-332): ثلاثُ خطواتٍ بحالها، وما ينتظر أهدأُ حبرًا ── */
/* ‏والبطاقةُ بعرض المقروء: خطواتٌ قصيرةٌ في بطاقةٍ بعرض الشاشة تترك نصفَها فارغًا (قيس ‏48٪) */
#pb{max-width:calc(var(--measure) + var(--s-16))}
.pb-steps{display:flex; flex-direction:column; gap:var(--s-4); margin:0; padding:0; list-style:none}
.pb-step{display:flex; flex-direction:column; gap:var(--s-2)}
.pb-step[data-state=wait] b{color:var(--ink-2); font-weight:400}
/* ── المعاينةُ الحيّة بجانب المعالج (D-331): عمودٌ ثانٍ من «lg»، وتحته دونها ── */
.wz-grid{display:grid; gap:var(--s-5); align-items:start}
.wz-pv{min-width:0}
.wz-pv-grid{display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); gap:var(--s-1)}
.wz-pv-c{display:flex; flex-wrap:wrap; align-content:center; justify-content:center; gap:var(--s-0); aspect-ratio:1; padding:var(--s-0);
  border-radius:var(--r-inline); background:var(--surface-2); transition:background var(--dur-2) var(--ease)}
.wz-pv-c.is-on{background:var(--selected)}
@media${atLeast('lg')}{
  .wz-grid{grid-template-columns:minmax(0,1fr) minmax(0,22rem)}
  .wz-pv{position:sticky; top:calc(var(--topbar) + var(--s-4))}
}
.wz-bar{display:flex; gap:var(--s-2); margin:0 0 var(--s-6); padding:0; list-style:none}
.wz-bar li{flex:1 1 0; min-width:0; display:flex; align-items:center; gap:var(--s-2); padding-bottom:var(--s-2);
  border-bottom:var(--stroke) solid var(--line); color:var(--ink-3); font-size:var(--t-ui); line-height:var(--lh-ui);
  max-width:none; transition:border-color var(--dur-2) var(--ease), color var(--dur-2) var(--ease)}
.wz-on .wz-bar li{cursor:pointer}
.wz-bar li.is-done{border-color:color-mix(in srgb,var(--accent) 45%,transparent); color:var(--ink-2)}
.wz-bar li[aria-current]{border-color:var(--accent); color:var(--ink); font-weight:600}
.wz-n{flex:none; width:var(--s-6); height:var(--s-6); display:grid; place-items:center; border-radius:50%;
  border:var(--bd); background:var(--surface); font-size:var(--t-caption); line-height:var(--lh-caption)}
.wz-bar li.is-done .wz-n{background:var(--selected); border-color:transparent; color:var(--accent)}
.wz-bar li[aria-current] .wz-n{background:var(--accent); border-color:var(--accent); color:var(--surface)}
.wz-l{overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
.wz-step + .wz-step{margin-top:var(--s-8); padding-top:var(--s-8); border-top:var(--bd-soft)}
.wz-on .wz-step{display:none}
.wz-on .wz-step.is-on{display:block; margin:0; padding:0; border:0}
.wz-in{animation:rise var(--dur-3) var(--ease-out)}
/* المنشئُ في شاشةٍ واحدة (D-338): الخطواتُ كلُّها متتابعةً بفاصلها، والشريطُ فهرسٌ لاصقٌ يتبع التمرير، والرأسُ لا يختبئ تحته */
.wz-on.wz-one .wz-step.is-on{margin-top:var(--s-8); padding-top:var(--s-8); border-top:var(--bd-soft); scroll-margin-top:var(--s-16)}
.wz-on.wz-one .wz-bar + .wz-step.is-on{margin-top:0; padding-top:0; border-top:0}
.wz-on.wz-one .wz-bar{position:sticky; top:0; z-index:4; margin-inline:calc(-1 * var(--pad-card)); padding:var(--s-3) var(--pad-card) 0; background:var(--surface)}
.wz-head{margin-bottom:var(--s-5)}
.wz-head h2{margin:var(--s-1) 0; font-size:var(--t-h2); line-height:var(--lh-h2)}
.wz-head h2:focus{outline:none}
.wz-k{font-size:var(--t-caption); line-height:var(--lh-caption); font-weight:600; color:var(--accent)}
.wz-opts{display:grid; gap:var(--s-3); grid-template-columns:repeat(auto-fit,minmax(min(100%,11rem),1fr))}
/* ‏والسطوحُ من العُدّة (card · card-inset) لا قواعدُ جديدة: هنا التخطيطُ وحالُ الاختيار وحدَهما */
.wz-opt{position:relative; display:flex; flex-direction:column; gap:var(--s-1); padding:var(--s-5); padding-inline-end:var(--s-10); cursor:pointer;
  transition:border-color var(--dur-2) var(--ease), background var(--dur-2) var(--ease), box-shadow var(--dur-2) var(--ease)}
.wz-opt input{position:absolute; top:var(--s-5); inset-inline-end:var(--s-4); margin:0; accent-color:var(--accent)}
@media(hover:hover){.wz-opt:hover,.wz-pill:hover,.wz-src:hover{border-color:var(--ink-3)}}
.wz-opt:has(input:checked){border-color:var(--accent); background:var(--selected); box-shadow:0 0 0 var(--stroke) color-mix(in srgb,var(--accent) 30%,transparent)}
.wz-opt:has(:focus-visible),.wz-pill:has(:focus-visible),.wz-src:has(:focus-visible),.wz-drop:has(:focus-visible){outline:var(--stroke) solid var(--focus); outline-offset:var(--stroke)}
.wz-big{font-size:var(--t-h3); line-height:var(--lh-h3); font-weight:600; color:var(--ink)}
.wz-sub{font-weight:600; color:var(--accent)}
/* اختياراتُ الصورة شروحُها متفاوتةُ الطول: كلٌّ بارتفاع نصّه، فلا بطاقةَ نصفُها فراغ (D-338) */
.wz-opts-top{align-items:start}
.wz-pf{margin:0; padding:var(--s-4)}
.wz-pf-h label{min-height:var(--tap)}
.wz-pf-h input{margin:0}
.wz-pf-h{padding:0 var(--s-2); font-size:var(--t-ui); line-height:var(--lh-ui)}
.wz-pf .pf-logo{width:var(--s-8); height:var(--s-8)}
.wz-pf[data-pf=linkedin] .pf-logo{background:var(--pf-linkedin)}
.wz-pf[data-pf=x] .pf-logo{background:var(--pf-x)}
.wz-pills{display:flex; flex-wrap:wrap; gap:var(--s-2); margin-top:var(--s-3)}
/* ‏أوقاتُ المنصّة وصورتُها تحت إيقاعها (D-329): عمودان حين يتّسع، وعمودٌ على الهاتف */
.wz-pf-more{display:grid; gap:var(--s-4); grid-template-columns:repeat(auto-fit,minmax(min(100%,16rem),1fr)); margin-top:var(--s-4); align-items:start}
.wz-times input{flex:1 1 6rem; min-width:0}
.wz-pill{display:inline-flex; align-items:center; gap:var(--s-2); min-height:var(--tap); padding:var(--s-1) var(--s-4);
  border:var(--bd); border-radius:var(--r-pill); background:var(--surface); cursor:pointer; font-size:var(--t-ui); line-height:var(--lh-ui)}
.wz-pill input[type=radio]{margin:0; accent-color:var(--accent)}
.wz-pill:has(input[type=radio]:checked){border-color:var(--accent); background:var(--selected); color:var(--ink)}
.wz-pill input[type=number]{width:calc(3ch + var(--s-8))}
.wz-add{display:grid; gap:var(--s-4); padding:var(--s-4)}
.wz-drop{position:relative; display:flex; flex-direction:column; align-items:center; gap:var(--s-1); padding:var(--s-6) var(--s-4);
  text-align:center; border:var(--stroke) dashed var(--line); cursor:pointer;
  transition:border-color var(--dur-2) var(--ease), background var(--dur-2) var(--ease)}
.wz-drop input[type=file]{position:absolute; inset:0; width:100%; height:100%; opacity:0; cursor:pointer}
.wz-drop.is-over{border-color:var(--accent); background:var(--selected)}
@media(hover:hover){.wz-drop:hover{border-color:var(--accent); background:var(--selected)}}
.wz-prog{display:block; width:100%; height:var(--s-1); margin-top:var(--s-2); border-radius:var(--r-pill); background:var(--line); overflow:hidden}
.wz-prog > span{display:block; height:100%; width:0; background:var(--accent); transition:width var(--dur-2) var(--ease)}
.wz-say[data-tone=ok]{color:var(--ok)}
.wz-say[data-tone=warn]{color:var(--warn)}
.wz-say[data-tone=bad]{color:var(--bad)}
.wz-srcs{display:grid; gap:var(--s-2); grid-template-columns:repeat(auto-fill,minmax(min(100%,15rem),1fr))}
.wz-src{display:flex; align-items:flex-start; gap:var(--s-2); min-height:var(--tap); padding:var(--s-3);
  border:var(--bd-soft); border-radius:var(--r-control); background:var(--surface); cursor:pointer}
.wz-src input{margin:var(--s-1) 0 0; accent-color:var(--accent)}
.wz-src:has(input:checked){border-color:var(--accent); background:var(--selected)}
.wz-src.is-new{animation:rise var(--dur-3) var(--ease-out)}
.wz-src-b{display:flex; flex-direction:column; align-items:flex-start; gap:var(--s-1); min-width:0}
.wz-src-b .nm{overflow-wrap:anywhere}
.wz-sum{margin:0 0 var(--s-4); border:var(--bd); border-radius:var(--r-card); overflow:hidden}
.wz-sum > div{display:flex; justify-content:space-between; gap:var(--s-4); padding:var(--s-3) var(--s-4)}
.wz-sum > div + div{border-top:var(--bd-soft)}
.wz-sum dt{color:var(--ink-2)}
.wz-sum dd{margin:0; font-weight:600; text-align:end}
.wz-note{margin:0 0 var(--s-4); padding:var(--s-3) var(--s-4); border-radius:var(--r-control); background:var(--selected); color:var(--ink)}
.wz-empty{display:flex; flex-wrap:wrap; align-items:center; gap:var(--s-3); padding:var(--s-4); border-radius:var(--r-control);
  background:var(--warn-wash); color:var(--ink)}
.wz-foot{display:flex; flex-wrap:wrap; align-items:center; gap:var(--s-3); margin:var(--s-6) calc(-1 * var(--pad-card)) 0;
  padding:var(--s-4) var(--pad-card); border-top:var(--bd-soft); background:var(--surface);
  border-radius:0 0 var(--r-card) var(--r-card)}
.wz-on .wz-foot{position:sticky; bottom:0; z-index:5}
.wz-live{flex:1 1 12rem; min-width:0; color:var(--ink-2); font-size:var(--t-small); line-height:var(--lh-small)}
@media${below('md')}{.wz-on .wz-foot{bottom:calc(var(--s-16) + var(--safe-b))}}
@media${below('sm')}{
  .wz-bar li:not([aria-current]) .wz-l{display:none}
  .wz-bar li{flex:0 0 auto}
  .wz-bar li[aria-current]{flex:1 1 auto}
  .wz-foot .btn{flex:1 1 auto}
}
@media(prefers-reduced-motion:reduce){
  .wz-in,.wz-src.is-new{animation:none}
  .wz-bar li,.wz-opt,.wz-drop,.wz-prog > span{transition:none}
}

/* ── مراجعةُ الخطّة (D-286) ───────────────────────────────────────────
   تقويمٌ بسبعة أعمدة، وشريطُ أسابيع، و«ما ينقص» سطرٌ واحد، والبطاقاتُ شبكةٌ تحت رأس يومها،
   وشريطا الجملة والاعتماد ملتصقان (D-327). والسطوحُ من العُدّة (card · card-inset). */
.rv-cal{display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); gap:var(--s-1); margin:var(--s-3) 0 var(--s-4)}
.rv-wd{font-size:var(--t-caption); line-height:var(--lh-caption); font-weight:600; color:var(--ink-2); text-align:center}
.rv-cd{display:flex; flex-direction:column; align-items:center; justify-content:center; gap:var(--s-0); min-height:var(--tap);
  border-radius:var(--r-control); color:var(--ink-2); font-size:var(--t-small); line-height:var(--lh-small); text-decoration:none}
.rv-cd.is-on{background:var(--selected); color:var(--ink); border:var(--bd-soft)}
.rv-cd.is-on span{font-size:var(--t-caption); line-height:var(--lh-caption); color:var(--accent); font-weight:600}
.rv-gaps{margin-bottom:var(--s-4); align-items:center}
.rv-ok{margin-bottom:var(--s-4); color:var(--ok)}
.rv-bulk{position:sticky; top:calc(var(--topbar) + var(--s-2)); z-index:6; display:flex; flex-wrap:wrap; align-items:center;
  gap:var(--s-2); padding:var(--s-3) var(--s-4); margin-bottom:var(--s-4)}
.rv-bulk[hidden]{display:none}
.rv-day + .rv-day{margin-top:var(--s-6)}
.rv-dh{margin:0 0 var(--s-3); font-size:var(--t-h3); line-height:var(--lh-h3); font-weight:600; scroll-margin-block-start:var(--s-16)}
.rv-cards{display:grid; gap:var(--s-4); grid-template-columns:repeat(auto-fill,minmax(min(100%,22rem),1fr)); align-items:start}
.rv{display:flex; flex-direction:column; gap:var(--s-3); scroll-margin-block-start:var(--s-16)}
.rv-h{display:flex; flex-wrap:wrap; align-items:center; gap:var(--s-2)}
.rv-sel{display:inline-flex; align-items:center; justify-content:center; min-width:var(--tap); min-height:var(--tap); margin:calc(-1 * var(--s-2))}
.rv-sel input{margin:0; accent-color:var(--accent)}
.rv-pf{width:var(--s-6); height:var(--s-6)}
.rv-pf[data-pf=linkedin]{background:var(--pf-linkedin)}
.rv-pf[data-pf=x]{background:var(--pf-x)}
/* ‏والبطاقةُ منشورٌ بشكل منصّته (D-327): المعاينةُ بعرض البطاقة، وسطرُ الصورة بأزراره تحتها */
.rv-pv{min-width:0}
/* «أضف منشورًا» (D-336): طيّةٌ تحت بطاقات الأسبوع، وحقولُها صفٌّ ينكسر على الجوّال */
/* السحبُ باللمس (D-336): المصغَّرةُ المحمولةُ تُرى مرفوعة، ولا قائمةَ نظامٍ ولا تحديدَ نصٍّ تحت الإصبع */
.rv-mini[data-move]{-webkit-touch-callout:none; -webkit-user-select:none; user-select:none}
.rv-mini.is-held{outline:var(--stroke) solid var(--focus); outline-offset:var(--stroke); background:var(--selected); box-shadow:var(--sh-3); transform:scale(1.04)}
/* عرضُ القائمة (D-337): الجدولُ والبطاقاتُ لا يجتمعان — والمنظارُ على جذر الشاشة */
.rv-vw{display:inline-flex; gap:var(--s-1)}
.rv-vw .btn[aria-pressed="true"]{background:var(--selected); border-color:var(--accent)}
#rv-root:not([data-view="list"]) .rv-list{display:none}
#rv-root[data-view="list"] .rv-day{display:none}
.rv-list td:last-child{min-width:0; overflow-wrap:anywhere}
.rv-list a{color:inherit; text-decoration-color:var(--line)}
/* «أضف مصدرًا» (D-343): نموذجان جنبًا إلى جنب حيث يتّسع، ومتتابعان حيث يضيق */
/* وحقلُ الملفّ هدفُ لمسٍ كاملٌ كسائر الحقول */
.add-src input[type=file]{min-height:var(--tap); padding-block:var(--s-2)}
.add-src{display:grid; gap:var(--s-5); grid-template-columns:repeat(auto-fit,minmax(min(100%,18rem),1fr)); align-items:start}
/* مكتبةُ الأصول (D-347): شريطُ البحث صفٌّ ينكسر، وعلاماتُ البلاطة تحت أفعالها */
.lib-find{display:flex; flex-wrap:wrap; align-items:flex-end; gap:var(--s-3); margin-bottom:var(--s-4)}
/* حقلُ الملفّ: خطُّ الحقول (لا يقرّبه iOS) وهدفُ لمسٍ كامل */
#upload input[type=file]{min-height:var(--tap); padding-block:var(--s-2); font-size:var(--t-body); max-width:100%}
.lib-marks{display:grid; gap:var(--s-2); margin-top:var(--s-3)}
.lib-tags{align-items:center}
.lib-tag-edit{min-width:0}
.rv-tags{display:flex; flex-wrap:wrap; gap:var(--s-2)}
.rv-tags:empty{display:none}
.rv-tag{display:inline-flex; align-items:center; min-height:var(--tap); padding:var(--s-0) var(--s-3); border:var(--bd-soft); border-radius:var(--r-pill); background:var(--surface-2); color:var(--ink); font:inherit; cursor:pointer}
@media(hover:hover){.rv-tag:hover{text-decoration:line-through}}
.rv-add{margin-top:var(--s-4)}
.rv-add-f{display:grid; gap:var(--s-3); padding-top:var(--s-3)}
.rv-img{align-items:center; padding-top:var(--s-2); border-top:var(--bd-soft)}
/* ‏شعاراتُ منصّات اليوم في خانته، والنقطةُ فوق العدد لما ينتظر — اللونُ لا يقول وحدَه: الاسمُ في aria-label */
.rv-dots{display:flex; gap:var(--s-0); justify-content:center}
.rv-dot{width:var(--s-4); height:var(--s-4)}
.rv-cd.is-wait{border:var(--bd-dash)}
/* ── لوحةُ الشهر (D-330): اليومُ بمصغَّرات منشوراته، وهدفُ إفلاتٍ حين تُسحب إليه مصغَّرة ── */
.rv-prog{display:block; inline-size:100%; block-size:var(--s-2); accent-color:var(--accent)}
.rv-progress{display:flex; flex-direction:column; gap:var(--s-1); margin-bottom:var(--s-3)}
.rv-cal.is-board .rv-cd{align-items:stretch; justify-content:flex-start; padding:var(--s-1); min-height:var(--s-16); border:var(--bd-soft)}
.rv-cal.is-board .rv-cd.is-wait{border:var(--bd-dash)}
.rv-cal.is-board .rv-cd:not(.is-on) b{align-self:flex-start; padding:0 var(--s-1); font-weight:400}
/* ‏رأسُ اليوم والمصغَّرةُ يُلمسان: هدفُ كلٍّ ‏44px (قيس ‏24 و‏32 عند ‏768) */
.rv-cd-h{display:flex; align-items:center; justify-content:space-between; gap:var(--s-1); padding:0 var(--s-1); min-height:var(--tap); min-width:var(--tap); color:inherit; text-decoration:none; border-radius:var(--r-inline)}
.rv-cd-h span{font-size:var(--t-caption); line-height:var(--lh-caption); color:var(--accent); font-weight:600}
.rv-cd.is-day{position:relative; transition:background var(--dur-2) var(--ease), border-color var(--dur-2) var(--ease)}
.rv-cd.is-over{background:var(--selected); border-color:var(--accent)}
.rv-mini{display:flex; align-items:center; gap:var(--s-1); min-height:var(--tap); padding:var(--s-0) var(--s-1); border-radius:var(--r-inline);
  background:var(--surface); border:var(--bd-soft); color:var(--ink-2); text-decoration:none; font-size:var(--t-caption); line-height:var(--lh-caption); min-width:0}
.rv-mini[draggable=true]{cursor:grab}
.rv-mini.is-drag{opacity:.35}
.rv-mini-img{flex:none; width:var(--s-6); height:var(--s-6); object-fit:cover; border-radius:var(--r-inline)}
.rv-mini bdi{min-width:0; overflow:hidden; text-overflow:ellipsis}
/* ‏حالُ المصغَّرة نقطةٌ بلونها، واسمُها نصٌّ لقارئ الشاشة بجانبها — اللونُ لا يقول وحدَه */
.rv-st{flex:none; margin-inline-start:auto; width:var(--s-2); height:var(--s-2); border-radius:var(--r-pill); background:var(--ink-3)}
.rv-mini[data-st=wait] .rv-st{background:var(--warn)}
.rv-mini[data-st=set] .rv-st{background:var(--ok)}
.rv-mini[data-st=done] .rv-st{background:var(--accent)}
.rv-mini[data-st=bad] .rv-st{background:var(--bad)}
@media(hover:hover){.rv-mini:hover{border-color:var(--field); color:var(--ink)}}
/* ── لوحُ البطاقة (D-330): «<dialog>» بجانب الشاشة على العريض، وورقةٌ من الأسفل على الهاتف ── */
.rv-sheet{position:fixed; inset-block:0; inset-inline:auto 0; margin:0; width:min(100%,30rem); max-width:none; height:100%; max-height:none; padding:0;
  color:var(--ink); background:var(--dialog); border:0; border-inline-start:var(--bd); box-shadow:var(--sh-3)}
.rv-sheet::backdrop{background:var(--scrim)}
.rv-sh{display:flex; flex-direction:column; height:100%}
.rv-sh-h{display:flex; align-items:center; gap:var(--s-2); padding:var(--s-3) var(--s-4); border-bottom:var(--bd)}
.rv-sh-t{margin:0; font-size:var(--t-ui); line-height:var(--lh-ui); font-weight:600; min-width:0}
.rv-sh-b{flex:1 1 auto; overflow:auto; padding:var(--s-4); display:flex; flex-direction:column; gap:var(--s-4)}
.rv-sh-when{display:grid; gap:var(--s-3); grid-template-columns:repeat(auto-fit,minmax(min(100%,10rem),1fr))}
.rv-sh-f{display:flex; flex-wrap:wrap; gap:var(--s-2); padding:var(--s-3) var(--s-4) calc(var(--s-3) + var(--safe-b)); border-top:var(--bd)}
.rv-sh-f form,.rv-sh-f .btn{flex:1 1 auto}
.rv-sh-f form .btn{width:100%; justify-content:center}
/* ‏شريطُ الأسابيع: روابطُ بهدف لمسٍ كامل، والمعروضُ بسطح المحدَّد */
.rv-weeks{display:flex; flex-wrap:wrap; gap:var(--s-2); margin-bottom:var(--s-4)}
.rv-wk{display:flex; flex-direction:column; justify-content:center; gap:var(--s-0); min-height:var(--tap); padding:var(--s-2) var(--s-3);
  border:var(--bd-soft); border-radius:var(--r-control); color:var(--ink); text-decoration:none; font-size:var(--t-small); line-height:var(--lh-small)}
.rv-wk em{font-style:normal; font-weight:600; color:var(--accent)}
.rv-wk.is-on{background:var(--selected); border-color:var(--accent)}
.rv-acts{margin-top:auto}
.rv-acts form{display:inline-flex; flex-wrap:wrap; gap:var(--s-2)}
.rv-foot{position:sticky; bottom:var(--s-3); z-index:6; display:flex; flex-wrap:wrap; align-items:center; gap:var(--s-3);
  margin-top:var(--s-6); padding:var(--s-3) var(--s-4)}
@media${below('md')}{.rv-foot{bottom:calc(var(--s-16) + var(--safe-b))}}
@media${below('sm')}{
  .rv-foot .btn{flex:1 1 auto}
  .rv-wk{flex:1 1 auto}
  /* ‏اللوحةُ على الهاتف شريطُ أيّامٍ بعددها كما كانت — المصغَّراتُ في بطاقات الأسبوع تحتها */
  .rv-cal.is-board .rv-cd{min-height:var(--tap); padding:0 var(--s-2); align-items:center; justify-content:center}
  .rv-mini{display:none}
  .rv-cd-h{flex-direction:column; justify-content:center; gap:0}
  .rv-sheet{inset-block:auto 0; inset-inline:0; width:100%; height:auto; max-height:92%; border-inline-start:0; border-top:var(--bd); border-radius:var(--r-sheet) var(--r-sheet) 0 0}
  /* ‏والمعاينةُ داخل بطاقةٍ أضيقُ من عرض المنصّة عند 320: شريطُ أفعال LinkedIn يفيض بـ2px بالخطّ الأكبر — فتأخذ من حشوة البطاقة */
  .rv-pv{margin-inline:calc(-1 * var(--s-3))}
  /* ‏سبعةُ أعمدةٍ عند 320 تصغّر اليومَ دون هدف اللمس: الأيّامُ التي فيها بنودٌ وحدَها، شريطًا بأهدافٍ كاملة */
  .rv-cal{display:flex; flex-wrap:wrap}
  .rv-wd,.rv-cd:not(.is-on){display:none}
  .rv-cd.is-on{min-width:var(--tap); padding:0 var(--s-2)}
}

/* ── عرضُ الخطّة (D-288) ──────────────────────────────────────────────
   غلافٌ بأرض الهويّة وموجة الصدى، ثمّ أقسامٌ بعناوين كبيرة، والمنشورُ بشكل منصّته.
   والطباعةُ بمقاس التسليم 25 × 20.05 سم، وما ليس من الوثيقة يُخفى. */
.pd{display:flex; flex-direction:column; gap:var(--s-8)}
.pd-tools{align-items:center}
.pd-hero{position:relative; overflow:hidden; isolation:isolate; display:flex; flex-direction:column; align-items:flex-start;
  gap:var(--s-2); padding:var(--s-12) var(--gutter) var(--s-8); border-radius:var(--r-hero);
  background:var(--moment-ground); color:var(--moment-ink)}
/* ‏والموجةُ في الزاوية المقابلة للعنوان وفوق الأرقام — نقشٌ لا يمرّ تحت نصٍّ (حارسُ النقش، 24px) */
.pd-echo{position:absolute; top:0; inset-inline-end:0; width:50%; height:60%; z-index:-1; pointer-events:none; opacity:.9;
  -webkit-mask-image:linear-gradient(to right, currentColor 45%, transparent); mask-image:linear-gradient(to right, currentColor 45%, transparent)}
.pd-echo svg{display:block; width:100%; height:100%}
.pd-eyebrow{font-size:var(--t-small); line-height:var(--lh-small); opacity:.85}
.pd-title{margin:0; font-size:var(--t-display); line-height:var(--lh-display); font-weight:400}
.pd-dates{font-size:var(--t-ui); line-height:var(--lh-ui)}
.pd-state{margin-top:var(--s-1); padding:var(--s-1) var(--s-3); border-radius:var(--r-control); border:var(--stroke) solid color-mix(in srgb,var(--moment-ink) 35%,transparent);
  font-size:var(--t-ui); line-height:var(--lh-ui)}
.pd-kpis{display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,8rem),1fr)); gap:var(--s-4); width:100%; margin-top:var(--s-6)}
.pd-kpi{display:flex; flex-direction:column; gap:var(--s-0); padding-inline-start:var(--s-3); border-inline-start:var(--stroke) solid color-mix(in srgb,var(--moment-ink) 30%,transparent)}
.pd-kpi b{font-size:var(--t-h1); line-height:var(--lh-h1); font-variant-numeric:tabular-nums}
.pd-kpi span{font-size:var(--t-small); line-height:var(--lh-small); opacity:.85}
.pd-sec h2{margin:0 0 var(--s-4); font-size:var(--t-h2); line-height:var(--lh-h2); font-weight:600}
.pd-mix{display:grid; gap:var(--s-3); max-width:calc(var(--measure) * 1.4)}
.pd-bar{display:grid; grid-template-columns:auto 6rem minmax(0,1fr) 3ch; align-items:center; gap:var(--s-3)}
.pd-bar progress{width:100%; height:var(--s-3); appearance:none; border:0; border-radius:var(--r-pill); background:var(--surface-2); overflow:hidden}
.pd-bar progress::-webkit-progress-bar{background:var(--surface-2); border-radius:var(--r-pill)}
.pd-bar progress::-webkit-progress-value{background:var(--accent); border-radius:var(--r-pill)}
.pd-bar progress::-moz-progress-bar{background:var(--accent); border-radius:var(--r-pill)}
.pd-week + .pd-week{margin-top:var(--s-8)}
.pd-wh{margin:0 0 var(--s-4); padding-bottom:var(--s-2); border-bottom:var(--bd); font-size:var(--t-h3); line-height:var(--lh-h3); font-weight:600; color:var(--accent)}
.pd-day + .pd-day{margin-top:var(--s-6)}
.pd-dh{margin:0 0 var(--s-3); font-size:var(--t-ui); line-height:var(--lh-ui); font-weight:600; color:var(--ink-2); scroll-margin-block-start:var(--s-16)}
.pd-posts{display:grid; gap:var(--s-5); grid-template-columns:repeat(auto-fill,minmax(min(100%,22rem),1fr)); align-items:start}
.pd-post{display:flex; flex-direction:column; gap:var(--s-2); break-inside:avoid}
.pd-post-h{display:flex; align-items:center; gap:var(--s-2)}
.pd-pending{display:flex; flex-direction:column; gap:var(--s-1); padding:var(--s-4); border:var(--bd-dash); border-radius:var(--r-control); color:var(--ink-2)}
.pd-tail{display:grid; gap:var(--s-6); grid-template-columns:repeat(auto-fit,minmax(min(100%,18rem),1fr))}
@media print{
  @page{size:250mm 200.5mm; margin:12mm}
  .pd-tools,.skip,.rail,.topbar,.bnav{display:none !important}
  .pd-hero{print-color-adjust:exact; -webkit-print-color-adjust:exact; break-after:page}
  .pd-week{break-before:page}
  .pd-sec{break-inside:auto}
}

/* ── «خطّةُ الشهر» في الرئيسيّة (D-289) ───────────────────────────────
   أوّلُ ما يُرى: الحالُ، وشريطُ ما اعتُمد، وأقربُ ثلاثة منشورات، وزرٌّ يتبع الحال. */
.home-plan{display:flex; flex-direction:column; gap:var(--s-2); margin-bottom:var(--gap-card)}
.home-plan .card-head{margin:0}
.home-hello{margin:0 0 var(--s-3)}
.hp-prog{display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:center; gap:var(--s-3); margin-top:var(--s-2)}
.hp-prog progress{width:100%; height:var(--s-2); appearance:none; border:0; border-radius:var(--r-pill); background:var(--surface-2); overflow:hidden}
.hp-prog progress::-webkit-progress-bar{background:var(--surface-2); border-radius:var(--r-pill)}
.hp-prog progress::-webkit-progress-value{background:var(--accent); border-radius:var(--r-pill)}
.hp-prog progress::-moz-progress-bar{background:var(--accent); border-radius:var(--r-pill)}
.hp-prog span{font-size:var(--t-small); line-height:var(--lh-small); color:var(--ink-2)}
.hp-next{list-style:none; margin:var(--s-2) 0 0; padding:0; display:flex; flex-direction:column}
.hp-next li{display:flex; align-items:center; gap:var(--s-2); min-height:var(--tap); padding:var(--s-1) 0; max-width:none}
.hp-next li + li{border-top:var(--bd-soft)}
.hp-a{min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--ink-2)}
.hp-next li b,.hp-next li bdi{white-space:nowrap}
@media${below('sm')}{
  .hp-prog{grid-template-columns:1fr}
  .hp-next li{flex-wrap:wrap; row-gap:var(--s-0)}
  .hp-a{flex-basis:100%; white-space:normal; padding-inline-start:calc(var(--s-6) + var(--s-2))}
}
`

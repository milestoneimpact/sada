/** الشاشة الضيّقة والجوّال — الوحدةُ 11 من 14 في ورقة الأنماط، بترتيبها (`scripts/split_styles.mjs`). */
import { atLeast, below, narrower } from '../tokens'

export const NARROW = `/* ══ الشاشة الضيّقة: ما دون «md» بلا رافدة (خطّة التصميم 3.3 · D-187) ══════════
   كانت هنا رتبة وسطى (‏721 إلى ‏960) ترفع الرافدة شريطًا أفقيًّا فوق المحتوى، وما دون
   ‏720 ينزله إلى الإبهام. **وصارت ما دون ‏900 كلُّها شريط الإبهام**: اللوحيّ في يد
   كالهاتف، وشريط أفقيّ يتمرّر يُخفي نصف أبوابه. وهذه الكتلة أساس الشريط، والتي
   تليها تُنزله إلى الأسفل بالشرط نفسِه. */
@media${below('md')}{
  .app{grid-template-columns:1fr}
  .app::before{display:none}
  .rail{position:static; height:auto; border-inline-start:0; border-bottom:var(--bd)}
  /* ‏رأسُ الصفحة سطرٌ واحد على الهاتف (D-275): العنوانُ وفعلُه جنبًا إلى جنب، واللصيقةُ ساقطة — اسمُ
     الصفحة في شريط الإبهام تحتها (D-248 أ-3). كان الرأسُ ‏197px قبل أوّل بطاقة */
  .page-head{flex-wrap:nowrap; align-items:center; margin:var(--s-2) 0 var(--s-4); padding-bottom:var(--s-3)}
  .page-head .txt{flex:1 1 auto}
  .page-head .eyebrow{display:none}
  .page-head .aside{flex:none}
  /* ‏ورأسُ التيّار (D-387) أفعالُه ثلاثة فيلتفّ تحت العنوان لا يفيض عرضًا (فاض فصغّر Chrome الصفحةَ لتسعه) */
  .page-head:has(.fd-entry){flex-wrap:wrap}
  .page-head .aside:has(.fd-entry){flex:1 1 100%}
  .fd-entry{justify-content:flex-start}
  /* ‏ومقطّعُ الحال أضيقُ حشوًا على الهاتف فيلتفّ على سطرين — والهدفُ ‏44 باقٍ */
  #draft-filter .fb-opt{padding-inline:var(--s-1)}
  #draft-filter .fb-opt .count{margin-inline-start:var(--s-0)}
  /* ‏وزرّا القائمة بلا مفتاحهما («المنصّة»، «الترتيب») — المختارُ وحدَه يقول ما هو، و«؟» في صفّهما لا تحتهما */
  #draft-filter .fb-k{display:none}
  /* ‏بطاقةُ المصدر على الهاتف (D-277): الحالُ والاستحقاقُ وآخرُ ظهورٍ في صفٍّ واحدٍ لا ثلاثة — ‏388 ← نحو ‏280px */
  #src-body tr{display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); column-gap:var(--s-2)}
  #src-body td:first-child,#src-body td:last-child{grid-column:1 / -1}
  #src-body .worth{min-width:0}
  /* ‏والحالُ تلتفّ في عمودها (D-325): «تغيّر بعد التحليل» ‏115px في عمودٍ ‏69px عند ‏320 خرجت إلى جارها */
  #src-body .st{white-space:normal}
  /* ‏والصورُ اثنتان في الصفّ: صورةٌ بعرض الشاشة شاشةٌ لكلّ صورة */
  .lib-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
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
   عند ‏٣٩٠×‏٨٤٤: الرافدة ‏٤٣٨px فوق المحتوى، **وأوّل محتوًى يبدأ عند
   ‏٦٩٣** — أي أنّ الطُّرّ يأكل ثمانين بالمئة من الشاشة قبل أن يُقرأ
   حرف. **والتمرير الأفقيّ عرَض لا داء.**

   فينزل الشريط إلى الأسفل حيث الإبهام، **ويختفي رأس الرافدة**: علامة
   تُعرِّف بالمكان لمن يعرف مكانَه أصلا — وهي تُشترى بمئتَي بكسل.

   **وهو الشريطُ نفسُه لا شريطٌ ثانٍ**: «nav.tabs» تُنقَل ولا تُنسَخ،
   فلا وسم يشيخ وحدَه ولا نصّ ينسى أن يربطه. */
@media${below('md')}{
  .rail{position:fixed; inset:auto 0 0; z-index:40; height:auto; border:0;
    border-top:var(--bd); box-shadow:var(--sh-2)}
  .rail-head,.scope{display:none}
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
     السلّم كلِّه. ولم يرَهما مدقّق السلّم لأنّه لم يرسم إلّا ‏١٤٤٠، حيث لا شريط
     إبهام. **وصارت نمط «caption»** (D-185 · خطّة التصميم 5.3): ‏١٣px بوزن ‏٦٠٠ وسطر
     ‏٢٠، والرمز ‏٢٤. ويحرس «audit_mobile» القصّ عند ‏٣٢٠ و‏٣٩٠. */
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
    min-height:calc(var(--s-12) + var(--s-2)); width:calc(var(--s-12) + var(--s-2)); justify-content:center; padding:0;
    /* ‏مربّعٌ بأيقونةٍ لا شريطٌ بنصّ (UX-AUDIT-4 · أ)، والاسمُ لقارئ الشاشة في .vh. **وزاويتُه زاويةُ البطاقة لا
       البيضاويّ** (مواصفات v1 §3.4 · D-381): البيضاويُّ للوسم والشارة وحدهما، ولا زرَّ بيضاويّ */
    border-radius:var(--r-card); box-shadow:var(--sh-3);
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
     الحقل يفقد التركيز عند اللمس فيعود الزرّ تحت الإصبع. فيختفي ما دام في نموذج تركيز، لا في الحقل وحدَه */
  body[data-pane]:not([data-pane=library]) details.fab,
  body:has(#ed) details.fab,body:has(form:focus-within) details.fab{display:none}
  /* **والمحتوى لا يختفي تحت الشريط**: حشوٌ بقدره وقدرِ شريط الجهاز.
     والشريط ‏٥٢px (هدف ‏٤٤ وحشو ‏٨)، **فـ«--s-16» تتركه ‏١٢ فوقه** — وكان
     ‏٦٤ + ‏١٦ = ‏٨٠، رقمًا خارج السلّم أمسكه مدقّق السلّم عند ‏٣٩٠ (D-167) */
  .content{padding-bottom:calc(var(--s-16) + var(--safe-b))}
  /* ‏‏والصفحةُ المستقلّةُ بشريطها كذلك (D-440): آخرُ إشعارٍ في «الإشعارات» وفعلُه «أعد الربط» كانا تحت الشريط على الهاتف */
  .main > .wrap{padding-bottom:calc(var(--s-16) + var(--safe-b))}

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
   ‏٢٠px عرضا — «flex:1» بجانب أعمدة ثابتة العرض تركت له ما بقي، وما بقي لا يسع حرفا،
   فالتفّ الاسم حرفا حرفا فوق أخيه (D-123). فيلتفّ الصفّ ويسقط النموذج من السطر —
   الاسم والحال والإنفاق تكفي للفرز، والنموذج في اللوح.
   **وبعرض القائمة لا بعرض الشاشة** (مراجعة D-187): كانت «sm» فعاد العيبُ نفسُه بين ‏600
   و‏690 (الحافّة ‏32) وبين ‏900 و‏945 (الرافدة) — الاسم ‏0px و«تفاصيل» مقصوص ‏67px خارج
   القائمة. والحدّ «CQ.prow» في «tokens.ts»، و«audit_mobile» يقيس القصّ عند ‏600 و‏900.
   **وموضعُها بعد قاعدة الصفّ الأصليّة**: قبلها تدهسها القاعدةُ بتساوي المحدّد — وكذلك
   كانت «.pst» و«.pv» بعرضهما الثابت في الجوّال، فلم يسر «width:auto» قطّ حتّى نُقلت. */
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
/* ‏وبابُ الكتابة في سطر التحيّة للهاتف وحدَه (D-326): على العريض زرُّ الترويسة نفسُه ظاهر */
@media${atLeast('md')}{details[data-home-new]{display:none}}
/* ‏وبابُ «المنشورات» الواحدُ على الضيّق وحدَه: على العريض يكفي زرُّ الترويسة (D-232) */
@media${atLeast('md')}{details[data-head-new]{display:none}}
@media${below('sm')}{
  /* ‏زرُّ المُنشئ بعرض السطر على الهاتف (D-308): تحت الحقول حيث ينتهي الإبهام، لا في زاويةٍ بعيدة */
  .cmp-act .btn{width:100%}
  .cmp-act .ago{flex-basis:100%}
  .scroll{overflow:visible; margin:0}
  /* **والجدولُ المحوريُّ مستثنًى** (D-151): أعمدتُه أرقامٌ تُقارَن، وتكديسُها
     يُسقط رؤوسَها؛ فيبقى جدولًا ويتمرّر في .pv-wrap كما صُمّم. */
  table:not(.pv){min-width:0; display:block}
  table:not(.pv) thead{position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0)}
  table:not(.pv) tbody,table:not(.pv) tr,table:not(.pv) td{display:block; width:100%}
  /* ‏والصفُّ المكدَّسُ بطاقةٌ لا صفُّ جدول: «height» حدٌّ أدنى في الجدول وحدَه، وفي الكتلة والشبكة سقفٌ يُفيض الخلايا على البطاقة التالية */
  table:not(.pv) tbody tr{height:auto}
  table:not(.pv) tr{border:var(--bd); border-radius:var(--r-card); padding:var(--s-3); margin-bottom:var(--s-2);
    background:var(--surface-2)}
  @media(hover:hover){table:not(.pv) tbody tr:hover{background:var(--surface-2)}}
  table:not(.pv) td{border:0; padding:var(--s-1) 0}
  table:not(.pv) td::before{content:attr(data-label); display:block; font-size:var(--t-caption);
    line-height:var(--lh-caption); font-weight:600; color:var(--ink-2); margin-bottom:var(--s-0)}
  table:not(.pv) td:first-child::before{display:none}
  /* ‏وجدولُ قائمة الخطّة يأخذ عناوينَه من هنا لا من الوسم: شاشتُه على حدّ سقفها (D-421 · D-336) */
  .rv-list td:nth-child(2)::before{content:"المنصّة"}
  .rv-list td:nth-child(3)::before{content:"الحال"}
  .rv-list td:nth-child(4)::before{content:"المنشور"}
}

/* ══ الرأسُ الموحَّد والرافدةُ المطويّة وتنبيهُ النظام (D-381، §4) ══════════════
   **رأسٌ واحدٌ في كلّ صفحة** («.page-top» هو «.topbar» نفسُه): لا رابطَ رجوع، والعلامةُ بابٌ إلى
   الرئيسيّة على الهاتف وحدَه حيث لا رافدة. و«بحث وأوامر» حقلٌ بطرفه «Ctrl K» قبل الجرس والحساب. */
.page-top .home{text-decoration:none}
/* ‏ذيلُ الرافدة: الإعداداتُ وحالُ النظام، ملتصقان بأسفلها مهما قصرت القائمة */
.rail nav.tabs{flex:1 1 auto}
.rail-foot{margin-top:auto; padding-top:var(--s-3); border-top:var(--bd-soft); display:flex; flex-direction:column; gap:var(--s-2)}
.rail-foot .pill{align-self:flex-start; margin-inline-start:var(--s-3)}
/* ‏زرُّ الطيّ في رأس الرافدة، وسهمُه يشير إلى ما يقع: نحو الحافّة حين تُطوى، وإلى الداخل حين تُفتح */
.rail-fold{margin-inline-start:auto}
.rail-fold::before{content:''; width:var(--s-2); height:var(--s-2); border:0 solid currentColor;
  border-inline-end-width:var(--stroke); border-block-end-width:var(--stroke); transform:rotate(-45deg)}
html[data-rail=mini] .rail-fold::before{transform:rotate(135deg)}
/* ‏والمطويّةُ ‏72px أيقوناتٌ وحدَها، والاسمُ في «title» وفي قارئ الشاشة (النصّ يُخفى بصريًّا لا يُنزَع)،
   والعددُ نقطةٌ على الأيقونة لا رقمٌ يُقصّ */
@media${atLeast('tab')}{
  html[data-rail=mini] .app{grid-template-columns:var(--rail-mini) minmax(0,1fr)}
  html[data-rail=mini] .app::before{width:var(--rail-mini)}
  html[data-rail=mini] .rail .brand,html[data-rail=mini] .rail .scope,html[data-rail=mini] nav.tabs .lbl{display:none}
  html[data-rail=mini] .rail-head{flex-direction:column; padding-inline:var(--s-2)}
  html[data-rail=mini] .rail-fold{margin-inline-start:0}
  html[data-rail=mini] nav.tabs{padding-inline:var(--s-2)}
  html[data-rail=mini] nav.tabs a{justify-content:center; padding-inline:0; position:relative}
  html[data-rail=mini] nav.tabs a > span:not(.count),html[data-rail=mini] .rail-foot .pill{position:absolute; width:var(--ul); height:var(--ul);
    overflow:hidden; clip-path:inset(50%); white-space:nowrap}
  html[data-rail=mini] nav.tabs a .count{position:absolute; top:var(--s-1); inset-inline-end:var(--s-2); margin:0}
}
/* ‏اللوحُ (‏768–1023، §4.2): الرافدةُ مطويّةٌ أصلًا بلا سكربت، وتتّسع **طبقةً فوق المحتوى** حين يُمرّ عليها
   أو يدخلها التركيز (لمسٌ أو لوحُ مفاتيح) — فلا تدفع المحتوى ولا تحتاج زرًّا. وزرُّ الطيّ لا معنى له هنا.
   ‏**والمرورُ بفأرةٍ وحدها** (audit_mobile): اللمسُ لا يمرّ، فيفتحها التركيزُ هناك. والاسمُ المطويُّ يُخفى «display:none»
   ‏واسمُ الرابط في «aria-label» — لا صندوقَ ‏2px يقصّ نصَّه فيُقرأ اسمًا مبتورًا — وحالُ الذيل في الشريط العلويّ، فلا هدفَ لمسٍ بعرض ‏2px */
@media${atLeast('md')} and ${below('tab')}{
  .app{grid-template-columns:var(--rail-mini) minmax(0,1fr)}
  .app::before{width:var(--rail-mini)}
  .rail{width:var(--rail-mini); overflow-x:hidden; z-index:45; transition:width var(--dur-2) var(--ease-out), box-shadow var(--dur-2) var(--ease-out)}
  .rail:focus-within{width:var(--rail-w); box-shadow:var(--sh-3)}
  .rail-fold{display:none}
}
@media${atLeast('md')} and ${below('tab')} and (hover:hover){
  .rail:hover{width:var(--rail-w); box-shadow:var(--sh-3)}
  .rail:not(:hover):not(:focus-within) .brand,.rail:not(:hover):not(:focus-within) .scope,
  .rail:not(:hover):not(:focus-within) nav.tabs .lbl,.rail:not(:hover):not(:focus-within) .rail-foot .pill{display:none}
  .rail:not(:hover):not(:focus-within) .rail-head{padding-inline:var(--s-2); justify-content:center}
  .rail:not(:hover):not(:focus-within) nav.tabs{padding-inline:var(--s-2)}
  .rail:not(:hover):not(:focus-within) nav.tabs a{justify-content:center; padding-inline:0; position:relative}
  .rail:not(:hover):not(:focus-within) nav.tabs a > span:not(.count){display:none}
  .rail:not(:hover):not(:focus-within) nav.tabs a .count{position:absolute; top:var(--s-1); inset-inline-end:var(--s-2); margin:0}
}
@media${atLeast('md')} and ${below('tab')} and (hover:none){
  .rail:not(:focus-within) .brand,.rail:not(:focus-within) .scope,
  .rail:not(:focus-within) nav.tabs .lbl,.rail:not(:focus-within) .rail-foot .pill{display:none}
  .rail:not(:focus-within) .rail-head{padding-inline:var(--s-2); justify-content:center}
  .rail:not(:focus-within) nav.tabs{padding-inline:var(--s-2)}
  .rail:not(:focus-within) nav.tabs a{justify-content:center; padding-inline:0; position:relative}
  .rail:not(:focus-within) nav.tabs a > span:not(.count){display:none}
  .rail:not(:focus-within) nav.tabs a .count{position:absolute; top:var(--s-1); inset-inline-end:var(--s-2); margin:0}
}
/* ‏الهاتف (§4.3): رأسٌ مختصر — العلامةُ والعنوانُ والجرسُ والحساب؛ والبحثُ في «المزيد»، والحالُ في بطاقة الآلة.
   وذيلُ الرافدة لا يُرى في شريط الإبهام: الإعداداتُ في «المزيد» */
@media${below('md')}{
  .topbar > .cmdk-open,.topbar > .pill{display:none}
  .rail-foot{display:none}
  /* ‏والمحتوى لا يختفي تحت «منشور جديد» العائم: حشوٌ بقدره فوق الشريط */
  body:has(details.fab) .content{margin-bottom:var(--s-16)}
}
/* ‏تنبيهُ النظام الواحد (§4.4): أرضُ الخطر الخافتة، وأيقونةٌ ونصٌّ وفعلٌ واحد وإغلاقٌ مؤقّت */
.sys-banner{display:flex; align-items:center; flex-wrap:wrap; gap:var(--s-3); padding:var(--s-3) var(--s-4);
  margin-bottom:var(--s-4); border-radius:var(--r-card); border:var(--bd); color:var(--ink);
  font-size:var(--t-ui); line-height:var(--lh-ui)}
.sys-banner.bad{background:var(--bad-wash); border-color:var(--bad)}
.sys-banner.warn{background:var(--warn-wash); border-color:var(--warn)}
.sys-banner .toast-t{min-width:0; flex:1 1 16rem}
.sys-banner[hidden]{display:none}
/* ‏وعلى الهاتف تنزل الجملةُ سطرًا في مجراها لا طافيةً: الطافيةُ كانت تغطّي نقشَ الفراغ تحت الرأس */
@media${below('sm')}{.ph-row{flex-wrap:wrap} .ph-row .why-tip[open]{flex-basis:100%; order:9} .ph-row .why-tip[open] > p{position:static}}
`

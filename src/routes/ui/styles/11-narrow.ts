/** الشاشة الضيّقة والجوّال — الوحدةُ 11 من 14 في ورقة الأنماط، بترتيبها (`scripts/split_styles.mjs`). */
import { atLeast, below, narrower } from '../tokens'

export const NARROW = `/* ══ الشاشة الضيّقة: ما دون «md» بلا رافدة (خطّة التصميم 3.3 · D-187) ══════════
   كانت هنا رتبة وسطى (‏721 إلى ‏960) ترفع الرافدة شريطًا أفقيًّا فوق المحتوى، وما دون
   ‏720 ينزله إلى الإبهام. **وصارت ما دون ‏900 كلُّها شريط الإبهام**: اللوحيّ في يد
   كالهاتف، وشريط أفقيّ يتمرّر يُخفي نصف أبوابه. وهذه الكتلة أساس الشريط، والتي
   تليها تُنزله إلى الأسفل بالشرط نفسِه. */
@media${below('md')}{
  .app{grid-template-columns:1fr}
  .rail{position:static; height:auto; border-inline-start:0; border-bottom:var(--bd)}
  /* ‏رأسُ الصفحة سطرٌ واحد على الهاتف (D-275): العنوانُ وفعلُه جنبًا إلى جنب، واللصيقةُ ساقطة — اسمُ
     الصفحة في شريط الإبهام تحتها (D-248 أ-3). كان الرأسُ ‏197px قبل أوّل بطاقة */
  .page-head{flex-wrap:nowrap; align-items:center; margin:var(--s-2) 0 var(--s-4); padding-bottom:var(--s-3)}
  .page-head .txt{flex:1 1 auto}
  .page-head .eyebrow{display:none}
  .page-head .aside{flex:none}
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
    /* ‏دائرةٌ بأيقونةٍ لا شريطٌ بنصّ (UX-AUDIT-4 · أ): كان يغطّي نصفَ عرض البطاقة تحته، والاسمُ لقارئ الشاشة في .vh */
    border-radius:var(--r-pill); box-shadow:var(--sh-3);
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
  body[data-pane]:not([data-pane=overview]):not([data-pane=library]) details.fab,
  body:has(#ed) details.fab,body:has(form:focus-within) details.fab{display:none}
  /* **والمحتوى لا يختفي تحت الشريط**: حشوٌ بقدره وقدرِ شريط الجهاز.
     والشريط ‏٥٢px (هدف ‏٤٤ وحشو ‏٨)، **فـ«--s-16» تتركه ‏١٢ فوقه** — وكان
     ‏٦٤ + ‏١٦ = ‏٨٠، رقمًا خارج السلّم أمسكه مدقّق السلّم عند ‏٣٩٠ (D-167) */
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
  table:not(.pv) tr{border:var(--bd); border-radius:var(--r-card); padding:var(--s-3); margin-bottom:var(--s-2);
    background:var(--surface-2)}
  @media(hover:hover){table:not(.pv) tbody tr:hover{background:var(--surface-2)}}
  table:not(.pv) td{border:0; padding:var(--s-1) 0}
  table:not(.pv) td::before{content:attr(data-label); display:block; font-size:var(--t-caption);
    line-height:var(--lh-caption); font-weight:600; color:var(--ink-2); margin-bottom:var(--s-0)}
  table:not(.pv) td:first-child::before{display:none}
}
`

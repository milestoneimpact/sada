/** مسرح القرار والمعاينة والصورة والطيّ — الوحدةُ 9 من 14 في ورقة الأنماط، بترتيبها (`scripts/split_styles.mjs`). */
export const DECISION = `/* ══ مسرحُ القرار (D-100) ═══════════════════════════════════════════
   ── صندوق التحديد ───────────────────────────────────────────────
   اللصيقة هي الهدف لا الصندوق: صندوق المتصفّح ثلاثة عشر بكسلا،
   **ولا يُكبَّر بلا أن يُرسَم من جديد**. فتُمَدّ اللصيقةُ حوله إلى ٤٤
   (D-086) ويبقى الصندوق بحجمه — يرى الإصبع هدفا، وترى العين صندوقا. */
.pick{flex:none; display:grid; place-items:center;
  width:var(--tap); height:var(--tap); margin-inline-start:calc(-1 * var(--s-3));
  border-radius:var(--r-control); cursor:pointer}
@media(hover:hover){.pick:hover{background:var(--hover)}}
.pick input{width:var(--icon-sm); height:var(--icon-sm); margin:0; accent-color:var(--accent); cursor:pointer}

/* ── البطاقةُ الحاليّة تحت لوحة المفاتيح ──────────────────────────
   حدّ بلون الهويّة **وحلقة**: الحدّ وحده يبدّل مقاس البطاقة بكسلا
   فتهتزّ القائمة مع كلّ ضغطة J. والحلقة خارج الصندوق فلا تُزيح شيئا. */
.draft.here{border-color:var(--focus);
  box-shadow:0 0 0 var(--ring-w) var(--ring), var(--sh-2)}
/* ‏وكان للمسوّدة المنتظرة وهجٌ نحاسيّ («--glow»)، فسقط مع الرمز (خطّة التصميم 3.2 · D-187):
   أربع مسوّدات منتظرة أربعة مواضع نحاس في شاشة واحدة. وحالُها تقولها شارتُها ورمزُها. */

/* ── المعاينة: كما تُقرأ لا كما تُحرَّر ───────────────────────────
   المربّع حقل تحرير — خطّ اللوحة وحدّ وشريط تمرير وعرض البطاقة.
   **والمنشورُ يُقرأ فقرةً في عمودٍ ضيّق**، وحكمٌ على نصٍّ في حقلٍ ليس
   حكما عليه منشورا.

   والعمود أضيق من «--measure» قصدا: عمود المنصّة أضيق من عمود
   قراءة عاديّ، وهذا أقرب ما نملك إليه بلا ادّعاء رقم لم يُقَس. */
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
   ولا يُلوَّن: لون على سطر من فقرة يُقرأ رابطا أو حالة. */
.pv-body b{font-weight:600}
.pv-note{margin:var(--s-3) 0 0; font-size:var(--t-small); color:var(--ink-2);
  line-height:var(--lh-small); max-width:var(--measure);
  padding-top:var(--s-2); border-top:var(--bd-dash)}

/* ── شريطُ البَتِّ الجماعيّ ───────────────────────────────────────
   ملتصق بأسفل الشاشة: من يحدّد خمسا وهو في آخر القائمة لا يُطلَب منه
   أن يصعد. و«sticky» لا «fixed» — الأولى تبقى في تدفّق الصفحة فلا
   تغطّي آخر بطاقة عند نهاية التمرير. */
.bulkbar{position:sticky; bottom:var(--s-3); z-index:15;
  display:flex; align-items:center; gap:var(--s-3); flex-wrap:wrap;
  margin:0 0 var(--s-3); padding:var(--s-3) var(--s-4);
  background:var(--surface);
  border:1px solid var(--accent); border-radius:var(--r-card);
  box-shadow:var(--sh-2)}
.bulkbar b{font-variant-numeric:tabular-nums}
.bulkbar .ago{direction:ltr; unicode-bidi:isolate}

/* ── لوحُ الاختصارات ─────────────────────────────────────────────
   مطويّ بالافتراض: من لا يعرفها لا يحتاج أن يراها في كلّ فتحة، ومن
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
   بارتفاع حرّ يقع السطر الأخير مقصوصا في نصفه — نصف حرف عند الحافّة
   يُقرأ عطلا في الرسم لا نصّا يفيض. والحساب يقتضي line-height بالبكسل
   لا بمعامل: المعامل يعطي كسرا لا يُضرَب فيبقى النصف. **ونصّ المنشور نمط
   «body»** (D-185)، فالسطر رمزُه («--lh-body»: ‏٢٨ على الحاسوب و‏٣٠ على الجوّال). */
.draft-text{width:100%; box-sizing:border-box; font:inherit; font-size:var(--t-body);
  line-height:var(--lh-body); color:var(--ink); background:var(--bg); border:var(--bd);
  border-radius:var(--r-control); padding:var(--s-3) var(--s-4); resize:vertical;
  white-space:pre-wrap; word-break:break-word; overflow-y:auto}
.draft-text:focus{border-color:var(--focus); outline:var(--stroke) solid var(--focus); outline-offset:0; box-shadow:none}
/* المقروءُ لا يُسحَب: مقبضُ التحجيم يظهر على أيّ عنصرٍ فيه resize، ومقبضٌ
   على نصّ لا يُحرَّر يعد بما لا يقع. */
.draft-text.ro{background:var(--surface-3); color:var(--ink-2); resize:none}
.draft-foot{display:flex; align-items:center; gap:var(--s-2); flex-wrap:wrap; margin-top:var(--s-2)}
/* عدّادٌ لاتينيّ الأرقام: يُعزَل عن اتّجاه الصفحة فلا يُقلب «١٢٠ / ٢٨٠» */
.draft-len{font-size:var(--t-caption); line-height:var(--lh-caption); font-weight:600; color:var(--ink-2);
  font-variant-numeric:tabular-nums; direction:ltr; unicode-bidi:isolate}
.draft-len b{color:var(--ink); font-weight:600}
.draft-len.warn b{color:var(--warn)}
.draft-len.bad b{color:var(--bad)}
.draft-meta{display:flex; align-items:center; gap:var(--s-1); flex-wrap:wrap; margin-top:auto; padding-top:var(--s-0)}
/* ‏واسمُ المصدر في شارة المسوّدة اسمٌ يُقرأ لا وسم، فهو بنمط «small» (D-246): كان ‏13 فرفع حروفَ المحرّر
   تحت ‏14 على الجوّال إلى السقف (‏10٪) */
.draft-meta .chip{font-size:var(--t-small); line-height:var(--lh-small); font-weight:400}
/* ── الصورة ───────────────────────────────────────────────────────────
   تُعرض بعرض البطاقة كاملا: المالك يقرّر عليها، وقرار على مربّع صغير
   ليس قرارا. **وتُعرض كاملةً لا مقصوصة**: نسبة مفروضة مع cover كانت تقصّ
   مربّع النموذج إلى شريط عريض، فيعتمد المالك وسط صورة لم ير حوافَّها.
   فسِمَتا width/height تحجزان المكان قبل التحميل، والنسبة الحقيقيّة تغلب
   بعده، وcontain يمنع المطّ. */
.pic{margin-top:var(--s-2)}
/* height:auto ضروريّةٌ لا زينة: سِمَتا width/height على الوسم تُترجَمان
   إلى CSS بأولويّة دنيا، فـ width:100% تغلب الأولى **ولا شيء يغلب
   الثانية** — فيبقى الارتفاع 628px والعرض عرض البطاقة، وتخرج الصورة
   ممطوطةً طولا. علّة رأيتُها ولم يمسكها اختبار. */
.pic img,.pic video{display:block; width:100%; height:auto; max-height:76vh; object-fit:contain;
  border-radius:var(--r-control); border:var(--bd); background:var(--surface-2)}
/* صورةٌ لم تُحمَّل تُقال بلفظها: مربّعٌ رماديٌّ فارغٌ كان يُقرأ «لا صورة» */
/* ‏**بهدوء** (D-351 · رونق): كان إطارًا أحمرَ متقطّعًا يصرخ في كلّ بطاقة. الصورةُ التي لم تصل حالٌ يُقال، لا إنذار: أرضٌ هادئة وخطٌّ ناعم */
.pic-err{display:flex; align-items:center; gap:var(--s-2); flex-wrap:wrap;
  padding:var(--s-3); border-radius:var(--r-control); background:var(--surface-2);
  border:var(--bd-soft); color:var(--ink-2)}
.pic-err b{color:var(--ink); font-weight:600}
.pic-foot{display:flex; align-items:center; gap:var(--s-1); flex-wrap:wrap; margin-top:var(--s-2)}
.pic.none{display:flex; align-items:center; gap:var(--s-2); flex-wrap:wrap;
  padding:var(--s-3) var(--s-3); border-radius:var(--r-control); background:var(--surface-2);
  border:var(--bd-dash)}
/* الابنُ المباشرُ وحدَه: سطرُ الجاهزيّة تحته فيه «ago» أيضًا، وقاعدةٌ تنزل
   إليه تمدّ سببَه مئتي بكسل فيدفع رابطَه إلى سطر وحدَه (D-163) */
.pic.none > .ago{flex:1 1 12.5rem}
/* الصورةُ الفنّيّةُ مطويّةٌ تحت الإنفوجرافيك (D-174): بابٌ ثانٍ لا يزاحم
   الأوّل في سطره، وسطر جاهزيّته معه لا فوقه — فما ستقوله الدالّة يُقال
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
   «flex-basis:100%» يكسر السطر، فالأزرار لا تزاحم «جدوِل» على الجوّال. */
.quick{flex:1 0 100%; display:flex; align-items:center; gap:var(--s-1);
  flex-wrap:wrap; margin-top:var(--s-2); padding-top:var(--s-2);
  border-top:var(--bd)}
.quick .mirror{font-size:var(--t-small); line-height:var(--lh-small); color:var(--ink-2);
  direction:rtl; unicode-bidi:isolate}
/* ── الطيّ (D-199): ما يُبَتّ به ظاهر، وما سواه يُطلَب ─────────────────────────────────
   شريط الجدولة سطر أزرار و«جدوِل»، والحقل الحرّ في «موعد آخر». */
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
/* ‏والمفتوحُ سطرٌ كاملٌ في أيّ صفٍّ يلتفّ (D-294): كان الشرطُ .lede-row وحدَها، فلمّا انتقل «؟» إلى شريط الفلتر (D-276)
   صار يفتح جملتَه في الصفّ نفسِه فتفيض 136px عن يسار الهاتف — وأوقف audit_design سلسلةَ التدقيق كلَّها منذ D-283 */
.why-tip[open]{flex-basis:100%; order:9; min-width:0}
/* ‏ⓘ بجانب العنوان (D-381 · §6.3): الجملةُ تلميحٌ يطفو تحت الرمز لا سطرٌ يدفع الرأس */
.ph-row{display:flex; align-items:flex-start; gap:var(--s-2); position:relative}
.ph-row .why-tip > summary{border:0; color:var(--ink-2); font-size:var(--t-h3); list-style:none}
.ph-row .why-tip > summary::-webkit-details-marker{display:none}
.ph-row .why-tip[open]{flex-basis:auto; order:0}
.ph-row .why-tip[open] > p{position:absolute; inset-inline:0; top:100%; z-index:20; max-width:28rem; margin-top:var(--s-2);
  padding:var(--s-3); background:var(--dialog); border:var(--bd); border-radius:var(--r-control); box-shadow:var(--sh-2)}
/* لوحُ المراجعة — مطويٌّ عمدا (D-090): ملحوظاتُ ذوقٍ لا تزاحم النصَّ
   حتّى تُطلَب، «ولا شارة حمراء» فتُقرأ عطلا. */
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
.codes{display:grid; grid-template-columns:repeat(auto-fill,minmax(min(100%,15rem),1fr)); gap:var(--s-2); margin:var(--s-3) 0}
/* رموزُ الاسترداد لاتينيّةٌ معزولة: بخطّ الصفحة وأرقامِه الجدوليّة (D-185)، والتباعدُ
   صنعة في اللاتينيّ لا عيب. وعشرون محرفًا (D-318) تحتاج 15rem للعمود */
.codes code{font-family:inherit; font-variant-numeric:tabular-nums; font-size:var(--t-code);
  line-height:var(--lh-code); letter-spacing:.06em; direction:ltr; background:var(--surface-2); border:var(--bd);
  border-radius:var(--r-control); padding:var(--s-2) var(--s-2); text-align:center; color:var(--ink)}

`

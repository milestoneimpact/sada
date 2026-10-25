/** الدليل والمعالج والتبويبات والمسوّدات والمحرّر — الوحدةُ 8 من 14 في ورقة الأنماط، بترتيبها (`scripts/split_styles.mjs`). */
import { atLeast, below } from '../tokens'

export const SECTIONS = `/* ══ الدليل — الشرحُ عنصرٌ لا هامش ══════════════════════════════════
   قيل لي ثلاث مرّات إنّ الشرح «ليس بشكل هينت احترافي». وكان محقّا:
   الشرح كان **نصّا رماديّا صغيرا** موزّعا تحت الحقول وفوقها — صحيحا
   في موضعه، لا وزن له في العين.

   ونصّ رماديّ صغير يقول للقارئ شيئا واحدا: **هذا هامش، تخطَّه.** ثمّ
   نطلب منه ألّا يتخطّاه.

   فصار الشرح عنصرا له إطار وعنوان ورافدة ذهبيّة ومراتب: عنوان
   يُقرأ أوّلا، وخطوات موصولة بخيط، وحقول لكلّ لوح إرشاد مؤطَّر لا
   سطر خافت، وختام يقول علامة النجاح وما يقع إن فشل.

   وهذا ليس تجميلا: **الوزن البصريّ هو ما يُقرَأ**، وما لا يُرى لا
   يُنفَّذ — ومهمّة لم تُنفَّذ في البوّابة تظهر عندنا خطأً غامضا. */
.guide{margin-top:var(--s-4); border:var(--bd); overflow:clip; position:relative}
/* ‏**شريطُ أفعال المساعد ثابتٌ في أسفله** (T4 · خطّة التصميم 5.4 · D-218): «احفظ» و«افحص الزوج» كانا تحت شاشاتٍ من
   الشرح على الهاتف. والحاوية «clip» لا «hidden»: الثانية تجعلها حاوية تمرير فلا يلتصق ما فيها */
.guide .wiz-bar{position:sticky; bottom:0; z-index:2; background:var(--surface-2);
  padding-block:var(--s-3); border-top:var(--bd)}
/* ‏وكانت على حافّته رافدةٌ نحاسيّة («::before»)، فسقطت (D-187): حافّةٌ ملوّنةٌ خامسة،
   ونحاس على حدّ بطاقة. والدليل يفصله سطحُه الداخليّ وحدُّه. */
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
   ورابط مدفون في سطر يُقرأ بعد الخطوات لا قبلها. */
.portal{display:inline-flex; align-items:center; gap:var(--s-2); margin:var(--s-4) 0 var(--s-5);
  font-size:var(--t-ui); line-height:var(--lh-ui); font-weight:600}
.portal svg{width:var(--icon-sm); height:var(--icon-sm); flex:none}

/* ── الخطوات ─────────────────────────────────────────────────────────
   رقم في دائرة لا نقطة في قائمة: الخطوات تُنفَّذ بالترتيب، وتُغادَر
   الشاشة بينها إلى بوّابة المنصّة — فالعين تحتاج موضعا تعود إليه.
   ولكلّ خطوة سببُها: «افعل» وحدها تُنفَّذ ولا تُفهَم، فلا تُصحَّح إن أخطأت.

   وخيط يصل الدوائر: ثلاث دوائر متفرّقة تُقرأ ثلاثة أشياء، وموصولةً
   تُقرأ **مسارا واحدا له أوّل وآخر**. */
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
   كانت ستّ بطاقات في شبكة من عمودين، كلّ بطاقة سبعة شؤون. **والعين
   لا تمسح شبكةً كما تمسح عمودا**: كلّ بطاقة تُقرأ وحدةً قائمةً بذاتها،
   فمقارنة ستّ تحتاج ستّ قراءات.

   فصار صفّا: أربعة أعمدة ثابتة الموضع — الاسم والنموذج وإنفاق اليوم
   والحال — تُقرأ رأسيّا بمسحة واحدة. **وما عداها في لوح ينفتح في
   مكانه**، فلا ينقل القارئ إلى شاشة أخرى.

   و«details» لا زرّ بـ JS: صفحة تحتاج سكربتا لتُقرأ تنكسر صامتة. */
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
   والحال **يمين السطر لا تحته**: عين تمسح عمودا واحدا تجد موضعَها
   في الطريق بلا قراءة. ويلتفّ تحت المحتوى في الجوّال حيث لا عرض له.

   والخطوة الجارية **تُظلَّل**: أربع خطوات متساوية في الوزن تجعل
   العين تقرؤها كلَّها لتعرف أين هي — وواحدة مميّزة تُقرأ بلا قراءة. */
ol.steps.wiz{gap:var(--s-3); margin-bottom:0}
ol.steps.wiz li{align-items:center; flex-wrap:wrap; padding:var(--s-2) var(--s-3);
  border-radius:var(--r-control); border:var(--bd-clear)}
ol.steps.wiz li.at{background:var(--selected); border-color:var(--line)}
/* والخيطُ يُزاح مع الحشو، فلا يقع خارجَ الدوائر */
ol.steps.wiz li:not(:last-child)::before{top:calc(var(--s-8) + var(--stroke)); bottom:calc(-1 * var(--s-3));
  inset-inline-start:var(--s-6)}
ol.steps.wiz .body{flex:1; min-width:11.25rem}
/* ‏حالُ المنصّة في بلاطتها بحجم المتن الصغير (D-239): أكثرُ حروف الرئيسيّة الصغيرة كانت هنا */
.pf .st{font-size:var(--t-small); line-height:var(--lh-small)}
ol.steps.wiz .st{flex:none; margin-inline-start:auto}
/* ورقمُ خطوةٍ رُدّت أو تمّت يحمل لونَ حالها — والعلامةُ نصٌّ بجانبه */
ol.steps.wiz li.ok .step-n{color:var(--ok); border-color:color-mix(in srgb,var(--ok) 40%,transparent)}
ol.steps.wiz li.bad .step-n{color:var(--bad); border-color:color-mix(in srgb,var(--bad) 40%,transparent)}
ol.steps.wiz li.idle .step-n{color:var(--ink-2); border-color:var(--line)}
/* بنودُ البوّابة شروطٌ لا خطواتٌ مرتَّبة — فلا رقمَ ولا خيطٌ يصلها */
ol.steps.wiz.nodot li::before{display:none}

/* ── تبويباتُ الفرز ───────────────────────────────────────────────────
   روابط استعلام لا أزرار سكربت: تُفتَح في تبويب جديد، وتُحفَظ في
   المفضّلة، وتعمل إن سقط السكربت. **وحال الصفحة في عنوانها.**

   والعدد **معروض دائما** لا عند الفتح: من يقف على «الكلّ» يرى «فشل ٣»
   بلا أن يفتحه — والرقم هو الذي يُنبّه. */
/* **وصارت تبويباتٍ لا أزرارًا** (خطّة التصميم 7.4 · D-189): كانت «.ftab» محاطةً بحدّ،
   والمفتوح بحدّ الهويّة وأرض — فتُقرأ صفّ أزرار. والتبويب لغة التنقّل: حبر «--ink-2»،
   والمحدَّد «--ink» بوزن ‏٦٠٠ وخطّ ‏٢px تحته — **بحدّ لا بظلّ**، فيبقى في الألوان القسريّة.
   والعدد مكوّن «Count»، والفشل بنغمته ولو لم يُفتَح التبويب. ودالّتُه «tabs()».
   **والشريطُ يلتفّ ولا يتمرّر** (مراجعةُ D-189): كان «overflow-x:auto» بشريطٍ مخفيّ — فقُصّت
   حلقة التركيز إلى خطّين (حاوية التمرير تقصّ المحورين، وارتفاعُها ارتفاع التبويب)، وغاب
   «فشلت» و«مرفوضة» خلف شريط لا يُرى على حاسوب ‏900–1030 لا تبلغهما عجلة الفأرة، وغاب
   «الإعداد !» عن الهاتف بلا أثر. والتفاف كما كان «.ftabs»: كلّ تبويب ظاهر في كلّ عرض،
   وعدد الفشل يُرى ولو لم يُفتَح. و«audit_mobile» يقيس كلّ تبويب وحلقتَه على ما يقصّه. */
.tab-bar{display:flex; flex-wrap:wrap; align-items:flex-end; gap:var(--s-1); margin-bottom:var(--s-4);
  box-shadow:inset 0 -1px 0 var(--line-soft)}
.tab-item{display:inline-flex; align-items:center; gap:var(--s-2); flex:none;
  padding:var(--s-2) var(--s-3); min-height:var(--tap); border:0; border-radius:0;
  border-bottom:var(--stroke) solid transparent; background:transparent; color:var(--ink-2);
  font-size:var(--t-ui); line-height:var(--lh-ui); font-weight:600; text-decoration:none; white-space:nowrap;
  transition:color var(--dur-2) var(--ease), border-color var(--dur-2) var(--ease)}
@media(hover:hover){.tab-item:hover{color:var(--ink); border-bottom-color:var(--line)}}
.tab-item[aria-current=page],.tab-item[aria-selected=true],.tab-item[aria-pressed=true]{
  color:var(--ink); border-bottom-color:var(--ink)}
/* الصفُّ الفرعيّ «tabs({ sub })» — فرزٌ داخل التبويب لا تبويبٌ ثانٍ */
.tab-sub{align-items:center; box-shadow:none; margin-top:calc(-1 * var(--s-2))}
/* ‏صفُّ فرز المسوّدات شريطُ فلترٍ واحد (D-276) و«؟» آخرَه، والمختارُ في قائمتَيه بعلامة */
.draft-filter .fbar{margin-block:0 var(--s-4)}
.draft-filter .menu-item .count{margin-inline-start:auto}
.draft-filter .menu-item[aria-pressed=true]{background:var(--hover)}
.draft-filter .menu-item[aria-pressed=true]::before{content:'✓' / ''}
.draft-filter .fb-opt .count{margin-inline-start:var(--s-1)}

/* ── لوحُ الإرشاد تحت اللصيقة ─────────────────────────────────────────
   بحث GOV.UK: المستخدم يبدأ الكتابة فور رؤية الحقل، **ولا ينظر تحته
   أبدا** — فالموضع فوق الحقل، وهو ما كان.

   والذي تبدّل هو **الوزن**: كان سطرا رماديّا بحجم 12 لا يُميَّز عن
   الزينة، فصار لوحا مؤطَّرا برمز ملوّن. والموضع صحيح في الحالين،
   والفرق أنّ الثاني يُرى. */
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
   تُفصَل عن النموذج بلونها: هي ما يُقرأ **بعد** الحفظ، وسطر رماديّ
   في آخر النموذج يُقرأ قبله ثمّ يُنسى.

   والاثنان معا لا واحد: «إن نجح» وحدها تترك من فشل بلا شيء — وهو
   أحوج الاثنين إلى سطر. */
/* بطاقةُ الخطوات على العريض عمودان (D-137): الخطواتُ يمينًا، والبابُ
   و«إن نجح» يسارًا — فلا تبقى جوفاء نصفِها. **وبطاقة نتيجة الربط وحدَها**: أدلّة القنوات «card-inset» إفصاح بعمود واحد (٢ج). */
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
   — وهو ثلث الحدّ. */
summary{min-height:var(--tap); display:flex; align-items:center}
/* ‏والمطويُّ هنا زرٌّ هادئ كـ«.g-tog»: حبرُ الرابط وخطٌّ تحته (D-183) */
.setup>summary{cursor:pointer; font-size:var(--t-ui); line-height:var(--lh-ui); font-weight:600; color:var(--link);
  text-decoration:underline; text-decoration-thickness:var(--ul); text-underline-offset:.3em;
  list-style:none; padding:var(--s-2) 0}
.setup>summary::-webkit-details-marker{display:none}
/* والمطويُّ يشير إلى نهاية السطر لا إلى يمينه (D-167): كان «▸» — حرفًا من خطّ
   النظام **يشير يمينًا في صفحة تُقرأ من اليمين**، أي إلى الوراء. والمثلّث من
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
   المربّع نفسه هو المعروض: لا «اعرض» ثمّ «عدّل» في شاشتين، فما يُقرأ هو
   ما يُرسَل. ولذلك يرث خطّ الصفحة وقياسَها لا خطّ النماذج الافتراضيّ —
   منشور يُقرأ في مربّع ضيّق يُحكَم عليه بغير ما سيبدو عليه. */
/* شبكةٌ لا تمطّ: بطاقتان بنصّين مختلفَي الطول لا تُجبَران على ارتفاعٍ
   واحد، وإلّا انفتح تحت الأقصر فراغ بقدر فرق النصّين.

   **وهي للمسوّدات وحدَها** (D-111). كانت على شبكة القنوات أيضا، وقِيس
   أثرُها: بطاقات ‏٢٩٤ و‏٢١٦ و‏١٨١ في شبكة ارتفاع صفّها ‏٢٩٤ — **فأزرار
   الفعل على ثلاثة خطوط مختلفة**، والعين تقرأ ذلك عشوائيّةً.

   **والحجّةُ تنطبق على المسوّدة ولا تنطبق على القناة**: طولُ المسوّدة
   نصُّها، وقد يزيد بأضعاف. وحقول القناة متجانسة، وفرقُها ‏٧٨px،
   **وذيلُها «margin-top:auto» فيملأ الفرقَ بقصدٍ ويصطفّ الفعلُ على خطٍّ
   واحد**. فما كان فراغا صار محاذاة. */
/* **وأعمدةٌ لا شبكة** (D-177): الشبكةُ «الممزّقة» تركت تحت البطاقات القصيرة ثقوبًا
   من ‏740 إلى ‏890px (التدقيق الرابع) — صفُّها بطول أطول بطاقة. والأعمدة تصبّ
   البطاقة تحت جارتها بلا انتظار صفّ، فلا ثقب. وترتيب الوثيقة باق: J/K تمشي فيه. */
.dcols{columns:2 27.5rem; column-gap:var(--gap-card)}
/* ── فيديوهاتك (D-180) ─────────────────────────────────────────────────
   الملفّ يُختار بلصيقة بهيئة زرّ: حقل الملفّ الأصليّ لا يُصمَّم ويقول «No file chosen»
   بلغة المتصفّح. **فيغطّي الزرّ شفّافًا لا يُصغَّر إلى بكسل**: هدف اللمس بحجم الزرّ
   (أمسكه مدقّق الأهداف ‏1×1)، وقارئ الشاشة ولوحة المفاتيح يبلغانه كما هو. */
.vpick{position:relative; overflow:hidden}
.vpick:focus-within{outline:var(--stroke) solid var(--focus); outline-offset:var(--stroke)}
.vup{display:flex; align-items:center; gap:var(--s-3); flex-wrap:wrap; margin-bottom:var(--s-3)}
.vfile{position:absolute; inset:0; width:100%; height:100%; margin:0; opacity:0; cursor:pointer}
.vup progress{flex:1 1 12.5rem; height:var(--s-3); accent-color:var(--ok)}
.vlist{display:flex; flex-direction:column; gap:var(--s-3)}
/* ‏طيّةٌ نصّيّة (D-277): سطرٌ يُفتح بضغطة، بهدف ‏44 وبلا مثلّث المتصفّح */
details.fold > summary{cursor:pointer; list-style:none; display:flex; align-items:center; gap:var(--s-2); min-height:var(--tap);
  color:var(--ink-2); font-size:var(--t-small); line-height:var(--lh-small); font-weight:600}
details.fold > summary::-webkit-details-marker{display:none}
details.fold > summary > span{min-width:0}
details.fold > summary::before{content:'›'; display:inline-block; transition:transform var(--dur-2) var(--ease)}
details.fold[open] > summary::before{transform:rotate(-90deg)}
details.fold[open] > summary{margin-bottom:var(--s-2)}
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
   المنصّات بعده متتابعة بفجوة من السلّم — كانت حقلًا واحدًا لا يحتاجها */
.vcap{display:flex; flex-direction:column; gap:var(--s-2); padding-bottom:var(--s-3); border-bottom:var(--bd-soft)}
.vcaps{display:flex; flex-direction:column; gap:var(--s-3); margin-bottom:var(--s-2)}
.vapprove{display:inline-flex; align-items:center; gap:var(--s-2); min-height:var(--tap); font-size:var(--t-small); line-height:var(--lh-small)}
.vapprove input{margin:0}
/* ── معاينةُ الخطّة (D-181): الصفُّ ذو المشكلة بأرضٍ حمراءَ خفيفة، ومشكلاتُه قائمةٌ بجانبه ── */
.pi td{vertical-align:top}
.pi tr.bad td{background:var(--bad-wash)}
.pi td .ago{display:block}
/* ‏**ورابطٌ بلا مسافةٍ يُكسَر ولا يُفيض** (مراجعة ر-5): «https://example.com/a/very/long/…» في نصّ
   صفّ دفع صفحة المعاينة ‏101px جانبًا عند ‏390 و‏171 عند ‏320، فقُطع «اعتمد وجدوِل» الملتصق. وفي
   الجوّال تصير الخلايا كتلًا بعرض البطاقة، فتُكسَر كلُّها؛ وفي العريض خليّة النصّ وحدَها — نثر
   يحتمل الكسر، والموعد والمنصّة لا يُضغَطان إلى حرف في سطر */
.pi-text{max-width:var(--measure); overflow-wrap:anywhere}
@media${below('sm')}{.pi td{overflow-wrap:anywhere}}
.pi-why{margin:0; padding-inline-start:var(--s-4); color:var(--bad); font-size:var(--t-small); line-height:var(--lh-small)}
/* ‏وصفُّ «اعتمد وجدوِل» يلاصق أسفلَ الشاشة (القالب T4، ر-5): كان بعد ‏529px من التمرير بثلاثة صفوف،
   ويبعد مع كلّ صفّ حتّى المئتين. و«sticky» لا «fixed»: يمضي مع البطاقة إذا انتهت */
.pi-bar{position:sticky; bottom:var(--s-3); z-index:15; margin-top:var(--s-3); padding:var(--s-3);
  background:var(--surface); border:var(--bd); border-radius:var(--r-card); box-shadow:var(--sh-2)}
@media${below('md')}{.pi-bar{bottom:calc(var(--s-16) + var(--safe-b))}}
.dcols > *{break-inside:avoid; margin-bottom:var(--gap-card)}

/* ── اختيارُ بطاقات اللوح (D-119) ─────────────────────────────────────
   **واللصيقةُ هي الهدف لا المربّع**: صندوقُ الاختيار يرسمه المتصفّح
   ثلاثة عشر بكسلا، فيُلَفّ بلصيقة تُضغَط في أيّ موضع منها — سلوك
   HTML لا حيلة أنماط (D-100). */
.tgrid{display:grid; grid-template-columns:repeat(auto-fill,minmax(16.25rem,1fr));
  gap:var(--s-2)}
.tpick{display:flex; align-items:flex-start; gap:var(--s-3); cursor:pointer;
  padding:var(--s-3); border:var(--bd); min-height:var(--tap);
  transition:border-color var(--dur-2) var(--ease), background var(--dur-2) var(--ease)}
@media(hover:hover){.tpick:hover{background:var(--surface-3)}}
/* والمختارةُ تُعرَف بحدٍّ لا بأرضيّةٍ ملوّنة: أرضيّةٌ تحت نصٍّ تخفض تباينَه */
.tpick:has(input:checked){border-color:color-mix(in srgb,var(--brand) 45%,transparent)}
/* **والهامشُ يُصرَّح به كلُّه**: المتصفّحُ يضع لصندوق الاختيار ٣px من
   عنده، **وهي خارج السلّم** — فيُضبَط الأربعة لا الأعلى وحدَه */
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
/* ‏**النتيجةُ قبل الردّ** (D-233): البطاقةُ تخفت وتقول ما ضُغط في رأسها بحبّة الحال نفسِها حتّى تصل بطاقةُ الخادم */
/* ‏**ولا على صفّ المكتبة** (D-246): «tr[data-pending]» عددُ ما لم يُحلَّل للفرز («0» و«1») لا حالُ انتظار،
   فكانت صفوفُ المصادر كلُّها باهتةً ‏2.9:1 (أمسكه axe) */
[data-pending]:not(tr){position:relative}
[data-pending]:not(tr) > :not(.pending-tag){opacity:.55; transition:opacity var(--dur-1)}
[data-pending]:not(tr) > .pending-tag{position:absolute; z-index:1; inset-block-start:var(--s-3); inset-inline-end:var(--s-3); opacity:1}
/* ‏«حُفظ» بجوار العنوان: الحفظُ التلقائيُّ يقول ما وقع بكلمة، لا بإشعار (D-233) */
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
`

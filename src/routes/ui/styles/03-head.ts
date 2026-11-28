/** رأس الصفحة والمقطع والإشعار — الوحدةُ 3 من 14 في ورقة الأنماط، بترتيبها (`scripts/split_styles.mjs`). */
import { atLeast } from '../tokens'

export const HEAD = `/* ══ رأسُ الصفحة ══════════════════════════════════════════════════════
   كان أعلى ما في الشاشة عنوانا بستّة عشر بكسلا وتحته أرقام باثنين
   وثلاثين — **فالرقم هو الذي يُقرأ عنوانا**، وتصير الشاشة لوحة
   عدّادات لا شاشة عمل.

   فصار للصفحة رأس: لصيقة فوق العنوان تقول أين أنت، وعنوان بأربعة
   وثلاثين، وسطر يقول ما هذه الشاشة. وثلاثتُها معا هي ما يجعل الصفحة
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
   عناوين بطاقات ‏٢٠ ولا شيء بينهما — تراتب مقلوب. والجوّال ‏٢٤ من الرمز نفسِه */
.page-head h1{font-size:var(--t-h1); font-weight:600; line-height:var(--lh-h1);
  letter-spacing:0; margin:0}
/* ‏**وتحته خطٌّ قصيرٌ بحبر الرابط** كما تحت عناوين لوحة الهويّة (D-196): ‏٢٤ في ‏٢، في أوّل السطر.
   رمز قسم لا رابط، ولا يُعدّ ذهبًا — والذهب لمواضعه الثلاثة */
.page-head h1::after{content:''; display:block; width:var(--s-6); height:var(--stroke); margin-top:var(--s-2);
  border-radius:var(--r-pill); background:var(--link)}
.page-head .lede{margin:var(--s-3) 0 0; font-size:var(--t-body); line-height:var(--lh-body);
  color:var(--ink-2); max-width:var(--measure)}
.page-head .aside{display:flex; align-items:center; gap:var(--s-2); flex-wrap:wrap}
/* وسطرٌ يقود لوحا بلا رأس: يقول ما الشاشة، ولا يُنفق ارتفاعَ عنوانٍ
   مكرَّر فوقه (D-114) */
.lede-lead{margin:0 0 var(--s-5); font-size:var(--t-body); line-height:var(--lh-body);
  color:var(--ink-2); max-width:var(--measure)}

/* ‏**شرائحُ حال التيّار** (D-446): أربعةُ روابط تحت الرأس بترتيب ما يطلب يدَك — الرقمُ جدوليٌّ بحجم عنوانٍ ثالث،
   والتسميةُ تحته بالحبر الخافت. والمختارةُ بحدّ الرابط، والهدفُ ‏٤٤ على الأقلّ */
.fd-chips{margin:calc(-1 * var(--s-3)) 0 var(--s-5)}
.fd-chips ul{display:flex; flex-wrap:wrap; gap:var(--s-2); align-items:stretch}
.fd-chip{display:flex; flex-direction:column; justify-content:center; min-height:var(--tap); min-width:var(--tap);
  padding:var(--s-2) var(--s-3); border:var(--bd); border-radius:var(--r-control); background:var(--surface);
  color:var(--ink); text-decoration:none; transition:border-color var(--dur-2) var(--ease-out), background var(--dur-2) var(--ease-out)}
.fd-chip b{font-size:var(--t-h3); line-height:var(--lh-h3); font-weight:600; font-variant-numeric:tabular-nums}
.fd-chip span{font-size:var(--t-small); line-height:var(--lh-small); color:var(--ink-2)}
@media(hover:hover){.fd-chip:hover{background:var(--surface-2)}}
.fd-chip[aria-current="page"]{border-color:var(--link); background:var(--surface-2)}
.fd-all{align-self:center}

.pill{display:inline-flex; align-items:center; gap:var(--s-2); padding:var(--s-1) var(--s-3); border-radius:var(--r-pill);
  font-size:var(--t-caption); line-height:var(--lh-caption); font-weight:600; border:var(--bd); background:var(--surface-2)}
.pill .led{width:var(--dot); height:var(--dot); border-radius:50%; background:var(--ink-3); flex:none}
.pill.on{color:var(--ok); background:var(--ok-wash); border-color:color-mix(in srgb,var(--ok) 26%,transparent)}
.pill.on .led{background:var(--ok)}
.pill.off{color:var(--warn); background:var(--warn-wash);
  border-color:color-mix(in srgb,var(--warn) 34%,transparent)}
.pill.off .led{background:var(--warn)}
/* ‏وحبّةُ النظام في الرأس **رابطٌ إلى بطاقة الآلة**، وحالُها من النبض: «النشر متوقّف» حمراء.
   والرابط بلا خطّ تحته — الحبّة شكلُه — وهدف لمسه يُمدّ بعنصر زائف كرقاقة الرحلة.
   ولا تلتفّ: «النشر متوقّف» كانت تنكسر سطرين في ‏٣٩٠px، والعنوان قبلها هو الذي يُقصّ */
.pill.bad{color:var(--bad); background:var(--bad-wash); border-color:color-mix(in srgb,var(--bad) 34%,transparent)}
.pill.bad .led{background:var(--bad)}
a.pill{position:relative; text-decoration:none; white-space:nowrap; flex:none}
a.pill::after{content:''; position:absolute; inset:50% 0 auto; height:var(--tap); transform:translateY(-50%)}

/* ── المقطع: لغةُ الاختيار (خطّة التصميم 7.4 · D-189) ─────────────────────────────
   مسار «--surface-2» والمختار «--surface» بظلّ «--sh-1» — المظهر والكثافة وقائمة أو
   تقويم. **وكان «.theme»** اسمًا لمبدّل واحد يُستعار للكثافة، فصار «.seg» يحمل الاثنين
   وما يأتي، ودالّتُه «segmented()». وحبّة «--r-pill» للشارة والعدد وحدهما (3.3): المقطع
   زرّ فقطرُه قطر الزرّ. وفي الألوان القسريّة يُرسَم المختار بحدّ لا بظلّ (أسفل الورقة). */
.seg{display:inline-flex; padding:var(--s-0); gap:var(--s-0); border-radius:var(--r-control);
  border:var(--bd); background:var(--surface-2)}
.seg button{padding:var(--s-1) var(--s-3); border-radius:var(--r-control); background:transparent; border:0;
  color:var(--ink-2); font-size:var(--t-caption); line-height:var(--lh-caption); font-weight:600}
.seg button[aria-pressed=true]{background:var(--surface); color:var(--ink); box-shadow:var(--sh-1)}
/* ‏وفي اللوحة دون «md» (‏٩٠٠px) ينقله سكربتُها من ذيل الرافدة المخفيّ إلى آخر المحتوى —
   ‏مبدّل واحد مرئيّ في كلّ عرض، وفي وسطه لا ملتصقًا بحافّة */
.content > .seg{display:flex; width:fit-content; margin:var(--s-8) auto 0}

/* ── الإشعار: «card-alert» يطفو (خطّة التصميم 7.3 و7.8 · D-189) ─────────────────────
   كان «.flash» بحافّة ‏٣px و«.next» بحافّة ‏٤px — حافّتان ملوّنتان لمعنًى واحد. فصار الإشعار
   صيغة «card-alert» نفسَها (الحافّة ‏٤px بلون الحال، والسطح والحدّ والظلّ الأوّل)، ودالّتُه
   «notice()». ورمز الحال ‏١٦ بجوار نصّ ‏١٥، ووسطُه على وسط السطر الأوّل (‏٢٤). **والنغمة صنف
   على الإشعار** («toast-note bad») لأنّ سكربت اللوحة يقرؤها ليقرّر أيذهب وحدَه أم يبقى. */
.toast-note{display:flex; align-items:flex-start; gap:var(--s-3); padding:var(--s-3) var(--s-4); animation:toast-in var(--dur-3) var(--ease-out);
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
   الإشعار هو **الشيء الوحيد في الصفحة الذي لم يكن قبل الضغطة**: كلّ
   ما عداه كان معروضا قبلها ويُعاد رسمُه. فسكونُه يجعله يُقرأ جزءا من
   الصفحة، وقد يُمرَّر عليه بلا أن يُرى — **وهو يحمل نتيجة ما فُعل**.

   **ولا تُحرَّك البطاقاتُ معه.** صفحةٌ كلُّها تنزلق عند كلّ فتحةٍ تُقرأ
   بطيئةً ولو كانت سريعة، وتُفتَح هذه اللوحة عشر مرّات في اليوم.

   و«@starting-style» تصف حال ما قبل الظهور — **بلا سطر JavaScript
   واحد**، ومتصفّح لا يعرفها يُظهره ساكنا كما هو اليوم. */
@starting-style{.toast-note{opacity:0; transform:translateY(calc(-1 * var(--s-2)))}}
/* ── والإشعارُ يطفو حين يعمل السكربت (الخطّة 5.9 و7.8) ─────────────────
   كان في رأس المحتوى وحدَه، والفعل يعود إلى بطاقته في وسط اللوح — فبعد «اعتمد»
   أو رفع خطّة تُردّ كان الإشعار عند ‏-4445px، فوق الشاشة، **والمالك يرى البطاقة
   كأنّ شيئًا لم يقع**. فيطفو أعلى الشاشة في الجوّال، وأسفلَها في الوسط على الحاسوب.
   **وبلا سكربتٍ يبقى في مكانه**: الصنفُ يضعه السكربتُ مع زرّ «أغلق» ومهلته، فلا
   إشعار عائم لا يُغلَق. والحاوية لا تأخذ النقر — ما فيها وحدَه يأخذه.

   **وفي الجوّال تحت الشريط العلويّ لا فوق الشريط السفليّ** (مراجعة ر-0): أسفلُ الشاشة
   مزدحم بما يلتصق — صفّ البتّ «.draft-foot.act» و«.pi-bar» و«.bulkbar» — فكان خطأ «اعتمد»
   يقع فوق «اعتمد» و«ارفض» نفسَيهما (‏694–764 فوق ‏720–780 عند ‏390)، ولا يذهب حتّى يُغلَق.
   والأعلى لا يلتصق فيه إلّا الشريط (‏64px)، فيقع الإشعار تحته ولا يغطّي قرارًا. */
.toast{position:fixed; z-index:45; inset-inline:var(--s-4);
  top:calc(var(--topbar) + var(--s-3));
  display:flex; flex-direction:column; align-items:stretch; gap:var(--s-2); pointer-events:none}
.toast > *{pointer-events:auto}
.toast .toast-note{margin:0; box-shadow:var(--sh-3)}
.toast .busy-note{margin:0; align-self:flex-start; padding:var(--s-2) var(--s-3); background:var(--surface);
  border:var(--bd); border-radius:var(--r-card); box-shadow:var(--sh-2)}
.toast-x{flex:none; margin-inline-start:auto}
@media${atLeast('md')}{
  /* ‏وعلى العريض أسفلَ الشاشة في وسطها (مواصفات v1 §5.10 · D-381): الطرفان صفرٌ والهامشُ «auto» يوسّطانه */
  .toast{inset-inline:0; margin-inline:auto; top:auto; bottom:var(--s-6); max-width:var(--measure)}
}

section[hidden]{display:none}

`

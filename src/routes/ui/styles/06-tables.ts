/** الجداول واللوح المحوريّ — الوحدةُ 6 من 14 في ورقة الأنماط، بترتيبها (`scripts/split_styles.mjs`). */
import { below } from '../tokens'

export const TABLES = `/* ══ الجداول ═════════════════════════════════════════════════ */
.scroll{display:block; overflow-x:auto; margin:0 calc(-1 * var(--s-0)); padding:0 var(--s-0)}
/* الصفُّ نمطُ «ui-regular» والرأسُ لصيقة (D-185 · خطّة التصميم 7.5) */
table{width:100%; border-collapse:collapse; font-size:var(--t-ui); line-height:var(--lh-ui); min-width:min(32.5rem,100%);
  font-variant-numeric:tabular-nums}
th{text-align:start; color:var(--ink-2); font-size:var(--t-caption); line-height:var(--lh-caption); padding:0 var(--s-2) var(--s-2);
  border-bottom:var(--bd); white-space:nowrap; font-weight:600}
td{padding:var(--s-3) var(--s-2); border-bottom:var(--bd-soft); vertical-align:top}
/* ‏والصفُّ ‏٥٦ على الأقلّ (مواصفات v1 §5.8 · D-381): «height» في صفّ الجدول حدٌّ أدنى لا سقف، فالصفُّ الأطول يطول */
tbody tr{height:calc(var(--s-12) + var(--s-2))}
tbody tr:last-child td{border-bottom:0}
@media(hover:hover){tbody tr:hover{background:var(--hover)}}
/* ── اللوحُ المحوريّ (D-120) ───────────────────────────────────────
   **والجدولُ وحدَه يمرّر أفقيّا**: عشرةُ أعمدةٍ لا تسع ٣٩٠px، وجسمُ
   الصفحة لا يُمرَّر — فالغلاف حوله لا الصفحة كلُّها. */
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
/* ── هيكلُ القياس وهو يُبنى (D-402) ─────────────────────────────────
   ‏«اعرض» تنقل الصفحة، وبين الضغطة والجواب يبقى الجدولُ القديمُ بأرقامٍ لم تعُد صادقة.
   ‏فيلبس هيكلَه **في مكانه وبأبعاده**: كلُّ خليّةٍ شريطٌ داخلها، ولا يتحرّك صفّ.
   ‏والإشارةُ «aria-busy» يكتبها سكربتُ «data-busy» القائم — لا سكربتَ جديد */
.pv-card{position:relative}
#pivot:has(.pv-form[aria-busy="true"]) .pv-card{overflow:clip; cursor:progress}
#pivot:has(.pv-form[aria-busy="true"]) .pv :is(th,td,a){color:transparent; text-decoration-color:transparent}
#pivot:has(.pv-form[aria-busy="true"]) .pv :is(th,td){position:relative}
#pivot:has(.pv-form[aria-busy="true"]) .pv :is(th,td)::before{content:''; position:absolute;
  inset:calc(50% - var(--s-2)) var(--s-2); border-radius:var(--r-inline); background:var(--surface-3)}
#pivot:has(.pv-form[aria-busy="true"]) .pv-card .empty{border-radius:var(--r-control); background:var(--surface-2)}
#pivot:has(.pv-form[aria-busy="true"]) .pv-card .empty>*{visibility:hidden}
/* ‏والوميضُ انتقالٌ لا موضعُ خلفيّة (يُركَّب ولا يُعاد رسمه)، ويسير مع القراءة: من اليمين، و«--dir» يعكسه */
#pivot:has(.pv-form[aria-busy="true"]) .pv-card::after{content:''; position:absolute; inset:0; pointer-events:none;
  background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--surface) 55%,transparent),transparent);
  animation:pv-sweep calc(var(--dur-3) * 4) linear infinite}
@keyframes pv-sweep{from{transform:translateX(calc(var(--dir) * 100%))}
  to{transform:translateX(calc(var(--dir) * -100%))}}
/* ‏وتقليلُ الحركة والألوانُ القسريّة: الهيكلُ لونٌ صلبٌ بلا وميض */
@media(prefers-reduced-motion:reduce){#pivot:has(.pv-form[aria-busy="true"]) .pv-card::after{display:none}}
@media(forced-colors:active){#pivot:has(.pv-form[aria-busy="true"]) .pv-card::after{display:none}
  #pivot:has(.pv-form[aria-busy="true"]) .pv :is(th,td)::before{background:GrayText}}
/* ‏الخطُّ الزمنيّ للمحفظة (D-212): عمودُ أسماءٍ ثابتٌ ومسارٌ تُرسَم فيه الأشرطةُ بنسبٍ منطقيّة.
   ‏والحدّ الأدنى للعرض يحفظ يومًا مقروءًا؛ وما ضاق عنه يُمرَّر داخل إطاره لا الصفحة. */
.gt-form{flex-wrap:wrap; align-items:flex-end; gap:var(--s-3)}
.gt-form .field{flex:0 1 11rem; min-width:0}
.gt-form button{flex:none}
.gt-wrap{overflow-x:auto; margin-top:var(--s-3)}
/* «القادم» قائمةً على الهاتف وحدَه (EASE-PLAN و): الحاسوبُ يرى الخطّ */
.gt-up{display:none}
@media${below('md')}{.gt-up{display:block}}
.gt{min-inline-size:48rem}
.gt-axis,.gt-row{display:grid; grid-template-columns:11rem 1fr; gap:var(--s-3); align-items:stretch}
.gt-axis{position:sticky; top:0; z-index:1; background:var(--surface); border-bottom:var(--bd); min-height:var(--s-8)}
.gt-axis .gt-track{min-height:calc(var(--s-8) + var(--s-4))}
.gt-tick{position:absolute; bottom:var(--s-1); transform:translateX(50%); white-space:nowrap;
  font-size:var(--t-caption); line-height:var(--lh-caption); color:var(--ink-2); font-weight:600; font-variant-numeric:tabular-nums}
.gt-tick.major{color:var(--ink)}
.gt-tick:first-child{transform:none}
.gt-tick.gt-today{top:0; bottom:auto; color:var(--accent); font-weight:600}
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
/* ‏المجدولُ يُسحَب أفقيًّا إلى يومٍ آخر (D-232): مقبضٌ ظاهر، والتمريرُ العموديُّ يبقى للإصبع */
.gt-bar[data-move]{cursor:grab; touch-action:pan-y}
.gt-bar.pending{background:color-mix(in srgb,var(--accent) 12%,transparent); border-color:color-mix(in srgb,var(--accent) 45%,transparent)}
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
.gt-mark.pending{background:var(--accent)}
.gt-now{position:absolute; top:0; bottom:0; width:2px; transform:translateX(50%); background:var(--accent); opacity:.55; pointer-events:none}
.gt-legend{align-items:center}
.gt-key{display:inline-flex; align-items:center; gap:var(--s-1)}
.gt-sw{display:inline-block; width:var(--s-4); height:var(--s-3); border-radius:var(--r-inline); border:1px solid var(--line); background:var(--surface-2)}
.gt-sw.ok{background:var(--ok-wash); border-color:var(--ok)}
.gt-sw.warn{background:var(--warn-wash); border-color:var(--warn)}
.gt-sw.bad{background:var(--bad-wash); border-color:var(--bad)}
.gt-sw.pending{background:color-mix(in srgb,var(--accent) 12%,transparent); border-color:var(--accent)}
.gt-sw.idle{border-style:dashed}
.gt-sw.split{background:color-mix(in srgb,var(--warn) 26%,var(--warn-wash)); border-color:var(--warn)}
.gt-sw.mark{width:var(--s-2); height:var(--s-2); transform:rotate(45deg); background:var(--ink-2); border:0}
@media(hover:hover){.gt-bar:hover{border-color:var(--ink-2)}}
/* ‏وشريطُ الخطّ الزمنيّ بحبر التركيز الصلب (D-323 · WCAG 1.4.11): الهالةُ ‏1.46:1 لا تُرى على الأرض */
.gt-bar:focus-visible{outline:var(--stroke) solid var(--focus); outline-offset:1px; z-index:2}
@media${below('md')}{.gt{min-inline-size:40rem} .gt-axis,.gt-row{grid-template-columns:7.5rem 1fr}
  .gt-tier{height:2.75rem} .gt-bar{min-inline-size:2.75rem}}
.nm{font-weight:600}
/* «nm» تُستعمَل span وتُستعمَل فقرةً. والفقرةُ بلا قاعدةِ هامشٍ
   ترث 14px من المتصفّح — **خارج السلّم**، ولا تظهر في grep لأنّها
   لم تُكتَب (D-057). فتُصاب هنا، والوسم في المحدّد لا الصنف. */
p.nm{margin:0 0 var(--s-3)}
/* **وحقلٌ يُكتَب فيه ليس نصّا يُقرأ** (D-109).

   «mono» صُنعت لعرض رمز في سطر: حرف صغير وحبر خافت وارتفاع بقدر
   محتواه. **وعلى «input» تهبط بارتفاعه إلى ‏١٩px** — دون هدف اللمس
   بضعفين، وقِيس ذلك على عنوان قناة التنبيهات.

   ولا يُصلَح في ذلك الموضع وحدَه: **حقل آخر يُكتب غدا بـ«mono» يرث
   العلّة**. فيُقيَّد الصنف حيث يُكتب فيه. */
input.mono,textarea.mono{display:block; width:100%; min-height:var(--tap);
  color:var(--ink); font-size:var(--t-input); line-height:var(--lh-input);
  padding:var(--s-2) var(--s-3); border-radius:var(--r-control); background:var(--surface)}
.sub{color:var(--ink-2); font-size:var(--t-small); margin-top:var(--s-1); max-width:var(--measure); line-height:var(--lh-small)}
.num,.money{font-variant-numeric:tabular-nums}
/* المبلغُ نصٌّ لاتينيّ داخل عربيّ: بلا عزلٍ ينقلب رمزُ العملة إلى آخره */
.money{direction:ltr; unicode-bidi:isolate; display:inline-block}

/* الحالة: لونٌ **ورمزٌ ونصّ** — لا لون وحده */
.st{display:inline-flex; align-items:center; gap:var(--s-1); padding:var(--s-0) var(--s-2); border-radius:var(--r-pill);
  font-size:var(--t-caption); line-height:var(--lh-caption); font-weight:600; border:var(--bd-clear); white-space:nowrap;
  min-height:var(--s-6); box-sizing:border-box}
/* الرمزُ مرسومٌ لا حرفٌ من خطّ النظام (D-154). **واسمُه له وحدَه** (D-183): كان
   «.g» — وهو صنف الزرّ الشبحيّ نفسُه، فلبس الرمز أرض الزرّ البيضاء وحبرَه
   داخل كلّ حبّة ملوّنة (‏٩٦ شارةً في الرئيسيّة). والرمز بلا أرض ولا حدّ:
   لونُه «currentColor» من حبّته. **ومن «icon()» نفسِها** (D-185): شبكة ‏٢٤ وثخانة ‏١٫٨
   مرسومةً ‏١٤px داخل الشارة (خطّة التصميم 3.4) */
.st-ic{display:inline-flex}
.st-ic svg{width:var(--icon-xs); height:var(--icon-xs); display:block}
.st.ok{color:var(--ok); background:var(--ok-wash); border-color:color-mix(in srgb,var(--ok) 24%,transparent)}
.st.warn{color:var(--warn); background:var(--warn-wash); border-color:color-mix(in srgb,var(--warn) 28%,transparent)}
.st.bad{color:var(--bad); background:var(--bad-wash); border-color:color-mix(in srgb,var(--bad) 28%,transparent)}
/* ‏والمحايدان بحبر «--ink-2» لا «--ink-3» (D-185): لا نصَّ تحت ‏١٥px بالحبر الثالث (خطّة التصميم 4.3).
   **ويفترقان بالرمز لا باللون** (7.2): «pending» ينتظر ساعةً، و«idle» لم يبدأ دائرةً متقطّعة */
.st.pending{color:var(--ink-2); background:var(--surface-2); border-color:var(--line)}
/* ‏و«لم يبدأ» بنغمته المسمّاة (مواصفات v1 §5.2 · D-381): «--idle» على «--idle-wash» — ‏6.3:1 نهارًا و‏5.8:1 ليلًا.
   ‏ونهارًا أغمقُ من «--ink-3» درجةً: كان يساويه، والحبرُ الثالثُ ممنوعٌ تحت ‏15px (audit_scale) والشارةُ ‏13px */
.st.idle{color:var(--idle); background:var(--idle-wash); border-color:var(--line)}
.chip{display:inline-block; padding:var(--s-0) var(--s-2); border-radius:var(--r-pill); font-size:var(--t-caption);
  line-height:var(--lh-caption); font-weight:600;
  background:var(--surface-2); border:var(--bd-soft); color:var(--ink-2);
  /* والفاصلُ في نهاية السطر لا في يساره (D-167): كان «margin:… 0 0 var(--s-1)» —
     يسار هو نهاية السطر في العربيّة مصادفةً، وبدايتُه في حاوية لاتينيّة */
  margin:var(--s-0) 0 0; margin-inline-end:var(--s-1)}
/* **والرقاقةُ اللاتينيّةُ تكتب اتّجاهَها بنفسها** («.mono» ‏ltr)، والجانبُ المنطقيُّ
   يُحَلّ على العنصر لا على أبيه: نهايتُها هي يمينُها، **ونهاية السطر العربيّ الذي
   تقع فيه بدايتُها هي**. قِيس ذلك ببصمة الأنماط المحسوبة: ‏٤٣ رقاقةً انتقل فاصلُها
   إلى الجهة الأخرى بالسطر أعلاه وحده (D-167) — فتُعطى بدايتَها صراحةً. */
.chip.mono{margin-inline:var(--s-1) 0; font-size:var(--t-code); line-height:var(--lh-code); font-weight:400}
/* **ورقاقةٌ تُلمَس ليست رقاقةً تُقرأ** (D-105).

   قِيست رقاقة رابط الرحلة ‏٥١×‏٢٥ عند ‏٤٣٠px، **وهدف دون ‏٤٤ يُصاب
   بالمصادفة لا بالقصد**. والقياس لا يُكبَّر — الرقاقة تبقى بحجمها،
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

`

/** الزرّ والحقل والحالة الفارغة والقوائم والرسم والقنوات — الوحدةُ 7 من 14 في ورقة الأنماط، بترتيبها (`scripts/split_styles.mjs`). */
import { atLeast, below } from '../tokens'

export const CONTROLS = `/* ══ الزرّ — عائلةٌ واحدةٌ بادئتُها «btn» (خطّة التصميم 7.1 · D-189) ══════════════
   كانت الدرجات أصنافًا من حرف واحد («.p» و«.g» و«.d» و«.sm»)، و«.g» اصطدم برمز الحال
   مرّةً فلبس الرمز أرض الزرّ (D-183). فصارت عائلةً تُقرأ، ودالّتُها «button()» في
   «components/button.ts». ارتفاع الهدف ‏٤٤ لا ‏٣١: WCAG 2.5.5 وApple HIG — والحشو للتوسيط،
   و«min-height» هي التي تضمن، فنصّ قصير لا يُقزّم الزرّ. */
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
   «--ink-2» ليلًا متقاربان ضوءًا (‏١٫٠٨:١)، فاللون وحدَه لا يكفي؛ والخطّ يثخن عند التمرير */
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
   طولا، وتقصيرُه يُسقطه دون حدّ الهدف — وهو ما كان يقع. **وحرفُه حرف الأزرار** (D-185). */
.btn-sm{padding:var(--s-1) var(--s-3)}
/* ‏والرمزُ في الزرّ ‏٢٠ (خطّة التصميم 3.4)، وفي سهم العودة ‏١٦ بجوار نصٍّ ‏١٥، وفي الرقاقة ‏١٤.
   **وSVG بلا قياسٍ في حاويةٍ مرنة يُرسَم ‏٠×‏٠** (D-167): هكذا غاب سهمُ «افتح في Drive» مرّة */
.btn>svg,.btn-icon svg{width:var(--icon-md); height:var(--icon-md); flex:none}
/* ‏**والاسمُ ليس أيقونة** (مراجعة D-196): «a>svg» كان يطابق «.wordmark» في بابِ اللوحة فيسحقه ‏١٦×١٦ —
   مسار نسبتُه ‏٣٫٢:١ يُرسَم شريطًا ارتفاعُه ‏٥px بين ‏600 و‏899؛ ويقيس «audit_mobile» نسبة كلّ اسم مرسوم */
nav.back a>svg:not(.wordmark){width:var(--icon-sm); height:var(--icon-sm); flex:none}
a.chip>svg{width:var(--icon-xs); height:var(--icon-xs); flex:none; vertical-align:-.125em}
/* ── المعطّل: «aria-disabled» يبقى في ترتيب التركيز فيُقرأ سببُه (خطّة التصميم 7.1) ──
   و«disabled» الأصليّ للنماذج التي لم تُنقَل بعد. وكلاهما نصف شفافيّة، والسبب نصّ تحته
   مربوط بـ«aria-describedby» — زرّ رماديّ بلا سبب يُضغَط مرّات ثمّ يُترَك. **والضغطة بلا
   إزاحة**: كانت «translateY(1px)» تهزّ الصفّ كلَّه ببكسل، والأثر لون الضغط وحدَه. */
button:disabled,.btn[aria-disabled="true"]:not([aria-busy="true"]){opacity:.5; cursor:not-allowed}
/* ‏والمشغولُ لا يبهت: الدوّارةُ والنصُّ يقولان حالَه، ولا يُضغَط ثانيةً */
.btn[aria-busy="true"]{cursor:progress}
.btn-why{display:block; margin-top:var(--s-1); font-size:var(--t-small); line-height:var(--lh-small); color:var(--ink-2)}
/* ‏وسهمُ المسار في نصٍّ يُقرأ (D-185): «←» و«→» ليسا في Plex، فيُرسَمان بقدر حرفهما
   ويهبطان إلى منطقة الأسنان العربيّة — ‏-.2em قِيست على «Credentials ← Create» */
.arw{display:inline-block; vertical-align:-.2em; line-height:0}
.arw svg{width:1em; height:1em; display:block}

/* ── المشغول: النصُّ يبقى والدوّارةُ ‏١٦ تُضاف، والعرضُ ثابت ─────────────────────────
   كان النصّ يُستبدَل بـ«جار…»، **فيضيع ما كان مكتوبا** — ويسأل الضاغط نفسَه ماذا ضغط،
   والنداء مدفوع. والحال في السِّمة («aria-busy» من الخادم، و«data-busy-on» يضعها السكربت
   على الزرّ المضغوط وحدَه) لا في صنف. **ومع تقليل الحركة لا تدور**: حلقة ثابتة والنصّ يقول. */
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
   حقل ‏١٥٫٥ — تُقرأ هامشًا، وهي سؤال الحقل */
label{font-size:var(--t-ui); line-height:var(--lh-ui); font-weight:600; color:var(--ink)}
input[type=number],input[type=password],input[type=text],input[type=email],input[type=url],input[type=datetime-local],
input:not([type]),select,textarea{
  background:var(--surface); border:var(--bd-field); border-radius:var(--r-control);
  color:var(--ink); padding:var(--s-2) var(--s-3); font:inherit; font-size:var(--t-input);
  line-height:var(--lh-input); font-weight:400; min-height:var(--tap); box-sizing:border-box;
  transition:border-color var(--dur-1) var(--ease), box-shadow var(--dur-1) var(--ease)}
input:focus,select:focus,textarea:focus{border-color:var(--focus); box-shadow:0 0 0 var(--ring-w) var(--ring); outline:none}
/* ── الحقل: لصيقةٌ ثمّ تلميحٌ ثمّ الحقلُ ثمّ الخطأ (خطّة التصميم 7.6 · D-189) ─────────────
   التلميح فوق الحقل (من يرى الحقل يكتب ولا ينظر تحته)، والخطأ تحته برمز ‏١٦ ونصّ بنمط
   «small» الثخين بحبر «--bad» — والحقل نفسُه بحدّ أحمر، **فلا يُقال الخطأ باللون وحدَه**.
   والاختياريّ «(اختياريّ)» بحبر «--ink-2» ووزن ‏٤٠٠، ولا نجمة للإلزاميّ. ودالّتُه «field()». */
.field-opt{font-weight:400; color:var(--ink-2)}
.field-hint{margin:0; font-size:var(--t-small); line-height:var(--lh-small); color:var(--ink-2)}
.field-err{display:flex; align-items:flex-start; gap:var(--s-1); margin:0; font-size:var(--t-small);
  line-height:var(--lh-small); font-weight:600; color:var(--bad)}
.field-err-ic{flex:none; display:inline-flex; padding-top:var(--s-1)}
.field-err-ic svg{width:var(--icon-sm); height:var(--icon-sm); display:block}
input[aria-invalid="true"],select[aria-invalid="true"],textarea[aria-invalid="true"]{border-color:var(--bad)}
/* ‏**والعرضُ بطول ما يُكتب لا بالبكسل** (7.6): كانت ‏٩٠ و‏١٠٠ و‏١١٠ و‏١٣٠ و‏١٤٠ و‏١٧٠ و‏١٩٠ و‏٢٢٠px في
   «style=""». والمحرف «ch» عرض الرقم «0» بخطّ الحقل، و«--s-8» حشو الجانبين وسهم الرقم */
/* ‏والرقمُ بعرض «w-s» ما لم يُعطَ غيرَه — و«:where» يُسقط خصوصيّتَه فيغلبه صنفُ العرض */
:where(input[type=number]){width:calc(10ch + var(--s-8))}
.w-xs{width:calc(5ch + var(--s-8))}
.w-s{width:calc(10ch + var(--s-8))}
.w-m{width:calc(20ch + var(--s-8))}
.w-full{width:100%}
/* ── طولُ السطر ───────────────────────────────────────────────────────
   45 إلى 75 محرفا. وقيست كتل عند 135 — ضعف الحدّ. والعين ترتدّ من
   آخر السطر إلى أوّل التالي، فتفقد موضعَها كلّما طال.

   والتقييد بأقصى عرض لا بعرض ثابت: الكتلة تضيق مع الشاشة ولا تتمدّد
   معها، فالجوّال سليم أصلا والشاشة العريضة هي التي تُفسد. */
/* و«pretty» تمنع الحرفَ اليتيمَ في آخر الفقرة: كلمةٌ وحدها في سطرٍ
   أخير تُقرأ سطرا ناقصا. وهي تعمل على المتن حيث «balance» لا تعمل —
   تلك للأسطر القليلة، وهذه لِما طال. */
p,li,.sub,.ch-note,.lede-note,.hint,.draft-why{max-width:var(--measure);
  text-wrap:pretty}

.row{display:flex; gap:var(--s-3); align-items:flex-end; flex-wrap:wrap}
/* أفعالُ الصفّ تُرصّ على الحافّة الخارجيّة (D-136): صفٌّ بزرٍّ وصفٌّ بزرّين
   يتّفقان على موضع «افتح في Drive»، فلا يقفز العمود بين الصفوف. */
.row.acts{gap:var(--s-2); justify-content:flex-end; align-items:center}
/* ملاحظةُ منتقي النموذج لا تحجز سطرًا وهي فارغة (D-137): كانت تُنزل
   «حفظ» ‏٢٠px تحت «حدّث» في صفّ التوجيه. */
.mp-note:empty{display:none}

/* ── الحالةُ الفارغة (خطّة التصميم 7.7 · D-189) ──────────────────────────────────────
   عنوان بنمط «h3» يقول ما هنا، ثمّ جملة بنمط «small» بحبر «--ink-2»، ثمّ فعل واحد — والكتلة
   في الوسط بعرض أقصى «--measure». ودالّتُها «emptyState()»، والأيقونة فوقها ‏٢٤ إن وُجدت. */
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
   والأطول يتجاوزه بحقّه. */
.todo>li>a.btn,.todo>li>form .btn{background:transparent; border-color:transparent;
  box-shadow:none; color:var(--link); min-width:var(--tap); padding-inline:var(--s-3); font-weight:600;
  margin-block:-1px;
  /* ‏زرٌّ هادئ: حبرُ الرابط وخطٌّ تحته بلونه (D-149 ثمّ D-187) — كان الخطُّ نحاسيًّا، فيُعدّ
     كلّ زرّ في «ما ينتظرك» موضعًا (أحد عشر في الرئيسيّة) */
  text-decoration:underline; text-underline-offset:var(--ul-off); text-decoration-thickness:var(--ul)}

/* ── صفٌّ عاجلٌ في «ما عليك» (D-123) ────────────────────────────────
   مهمّة توقف بوّابة مرحلة ولم تتمّ. **وكان الصنف يُكتب في الوسم ولا
   قاعدة له** — فيُقرأ في المصدر مميَّزا ويُرسَم كسائر الصفوف. والغسل
   خافت لأنّ الحال تقولها شارة «بوّابة» الحمراء بنصّها (D-043)؛ الأرض
   تُعين العين على المسح ولا تحمل المعنى وحدَها. */
tr.urgent td{background:color-mix(in srgb,var(--bad) 5%,transparent)}
/* ── قائمةٌ بلا زينة (D-123) ──────────────────────────────────────────
   ملحوظات المراجعة وما خرج من التوزيع: **بنود تُقرأ لا نقاط تُعدّ**.
   وكان الصنف بلا قاعدة، فيرث نقطة المتصفّح وحشوَه — والحشو ‏٤٠px
   خارج السلّم. */
ul.plain{list-style:none; margin:0; padding:0}
ul.plain li{margin:0 0 var(--s-2); font-size:var(--t-small); line-height:var(--lh-small)}
ul.plain li:last-child{margin-bottom:0}

/* ── الرسم ─────────────────────────────────────────────────── */
.chart{margin-top:var(--s-1)}
/* **الرسمُ يتمدّد والحرفُ لا** (D-153): المسارُ في SVG بحدٍّ لا يتمدّد،
   والأرقام والتواريخ ونقطة الذروة HTML فوقه بمواضع مئويّة — فالحرف
   لصيقة ‏١٣px على كلّ عرض. والصندوق لاتينيّ الاتّجاه لأنّ مواضعَه من إحداثيّات
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
   خيط يصل المحطّات — **وهو المعلومة لا الصفوف**: ثلاث محطّات متفرّقة
   تُقرأ ثلاثة أشياء، وموصولةً تُقرأ سببيّةً لها أوّل وآخر. وهي قاعدة
   «ol.steps» نفسُها في الدليل.

   والخيط لا يُرسَم بعد الأخيرة: خيط ينتهي إلى فراغ يَعِد بمحطّة لم تقع. */
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
   العنوان («لم تنجح»)، والرمز نوع المحطّة. */
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
   بعلامة قبل اللون — لون الحالة يُقرأ على البطاقة لا على غسيله */
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
   ثلاثة أعمدة ثابتة الموضع: الاسم والمقياس والرقم. **والعين تمسح
   عمودا لا شبكة** — وهي قاعدة لوح المزوّدين نفسُها (D-082).

   والاسم بعرض أدنى ثابت: أسماء متفاوتة الطول تجعل المقاييس تبدأ من
   مواضع مختلفة، **فتُقارَن أطوال لا تبدأ من خطّ واحد**. */
.bars{display:flex; flex-direction:column; gap:var(--s-2)}
.bar-row{display:flex; align-items:center; gap:var(--s-3)}
.bar-name{flex:none; min-width:5.5rem; font-size:var(--t-small); line-height:var(--lh-small); color:var(--ink-2);
  overflow-wrap:anywhere}
.bar-track{flex:1; height:var(--s-3); background:var(--surface-3); border-radius:var(--r-pill);
  overflow:hidden; min-width:var(--s-10)}
/* **مقياسُ مقدارٍ لا تصنيف**: هيئةٌ واحدةٌ تتدرّج بالطول، ولا لونَ حالةٍ
   فيها — الأحمر حالة لا مقدار (D-043). والأعمدة بحبر «--ink-2» (خطّة التصميم 7.10). */
.bar-fill{display:block; height:100%; border-radius:var(--r-pill); background:var(--ink-2);
  transition:width var(--dur-3) var(--ease-out)}
/* **والأكبرُ وحدَه يُميَّز**: ندرةٌ تصنع مرتبة — بالحبر الأوّل لا بالذهب (D-187): لا
   نحاس في أشرطة الرسم، فعمود نحاسيّ يُقرأ رقمًا بطلًا ثانيًا في الشاشة. */
.bar-fill.top{background:var(--ink)}
/* أسبوعٌ قِيس بعضُه — عمودُه مخطَّط، والرقمُ بجانبه يقول كم (D-127) */
.bar-fill.part{background:repeating-linear-gradient(135deg,var(--ink-2) 0 6px,color-mix(in srgb,var(--ink-2) 45%,transparent) 6px 12px)}
.history{margin-bottom:var(--s-4)}
/* ‏رابطُ الأسبوع رابطٌ: بحبره وخطٍّ تحته (D-183) — كان بلون الحبر بلا خطّ،
   فلا يفرّقه عن اسم أسبوع لا يُفتَح إلّا المؤشّر */
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
   الحروف العربيّة فتُقرأ «سا ئقا». علّة تُرى ولا يكشفها اختبار. */
/* والوقتُ والبياناتُ الوصفيّةُ نمطُ «small» لا لصيقة (D-185): جملةٌ تُقرأ لا علامةٌ تُمسَح */
.ago{font-size:var(--t-small); line-height:var(--lh-small); color:var(--ink-2)}
.ch-foot{display:flex; align-items:center; gap:var(--s-2); flex-wrap:wrap; margin-top:auto; padding-top:var(--s-0)}
`

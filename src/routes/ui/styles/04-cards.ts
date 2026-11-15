/** الشبكة والبطاقات والرئيسيّة وبطاقة المؤشّر — الوحدةُ 4 من 14 في ورقة الأنماط، بترتيبها (`scripts/split_styles.mjs`). */
import { atLeast, below } from '../tokens'

export const CARDS = `/* ══ الشبكة والبطاقات ════════════════════════════════════════ */
/* عنصرُ الشبكة لا ينكمش تحت محتواه ما لم يُقَل له: min-width الافتراضيّة
   auto، **فسلسلة لا تنكسر — عنوان API أو اسم نموذج — تدفع العمود
   فيفيض المستند كلُّه**. وقيس ذلك في لوح المزوّدين: 406px على شاشة 390. */
.grid{display:grid; gap:var(--gap-card)}
.grid>*{min-width:0}
/* والسلاسلُ اللاتينيّة الطويلة تُكسَر عند الضرورة لا تُقصّ: عنوانٌ مقصوصٌ
   لا يُنسَخ صحيحا، ومكسور يُقرأ ويُنسَخ. */
/* **ولا خطَّ أحاديَّ العرض** (D-185): كان «ui-monospace» يسقط إلى خطّ النظام في
   كلّ جهاز. فالمعرّف واسم النموذج والأمر بـ Plex Sans بأرقام جدوليّة، في شارة
   هادئة معزولة الاتّجاه — نمط «code» ‏14/22/400. */
.mono{overflow-wrap:anywhere; font-family:inherit; font-variant-numeric:tabular-nums;
  font-size:var(--t-code); line-height:var(--lh-code); font-weight:400; color:var(--ink-2);
  direction:ltr; display:inline-block; unicode-bidi:isolate;
  padding:0 var(--s-1); border-radius:var(--r-inline); background:var(--surface-2)}
/* أرقامٌ ثابتةُ العرض في كلّ موضعٍ تتبدّل فيه: عمودٌ يهتزّ مع كلّ تحديث
   يُقرأ عطلا. وكانت مضبوطةً على البطاقات وحدها. */
table,.chip,.count,.ago,.money,.num,.note,.step-n{font-variant-numeric:tabular-nums}
/* ── الشاشةُ العريضة تُملأ لا تُترَك (D-102) ────────────────────────
   صفّ المؤشّرات أربعة في ‏١٤٤٠px، **وأربعة في ‏٢٥٦٠ كذلك** — فيتمدّد كلّ
   إلى ستّمئة بكسل ليحمل رقما من ثلاث خانات. فتُفتَح رتبة خامسة فوق
   ‏١٩٢٠: العدد يزيد ولا يتمدّد العرض.

   **ولا تُفتَح للمحتوى النصّيّ**: عمودٌ خامسٌ من النصّ يخالف «--measure».

   **ثمّ سقطت القاعدةُ بالقياس** (لاحقةُ D-123): كانت تفتح خمسةَ أعمدةٍ
   لكلّ «c4» فوق ‏١٩٢٠ — **وبعد D-119 صار العدد يقرّر الصنف**: أربع
   بطاقات في «c4» وخمس في «c5». فأربع في خمسة أعمدة **تترك عموداً
   أبيض في طرف الصفّ**، قِيس عند ‏٢٠٠٠px في نظرة عامّة وفي القنوات.
   والعرضُ «--shell» ‏١٢٠٠ في الوسط منذ D-325، وما يريد خمسا يختار خمسا. */
.c4{grid-template-columns:repeat(4,1fr)} .c3{grid-template-columns:repeat(3,1fr)}
.c2{grid-template-columns:repeat(2,1fr)}
/* خمسٌ حين يختار المالكُ خمسا (D-119): **ولا تُترَك واحدةٌ وحيدةً في صفٍّ
   ثان** — وهو التمزّق الذي حُرِس في D-111، يقع هنا بالعدد لا بالارتفاع */
.c5{grid-template-columns:repeat(5,1fr)}
.c21{grid-template-columns:2fr 1fr}
@media${below('lg')}{
  .c4,.c5{grid-template-columns:repeat(2,1fr)} .c21{grid-template-columns:1fr}}
@media${below('md')}{.c3,.c2{grid-template-columns:1fr}}
@media${below('sm')}{.c4,.c5{grid-template-columns:1fr}}
/* ── صفُّ المؤشّرات في الجوّال زوجان لا عمود (D-136) ──────────────────
   ستّ بطاقات في عمود واحد على ‏٣٩٠px ثمان مئة بكسل قبل أوّل قائمة،
   وكلّ بطاقة رقم واحد في ‏١٣٠px. **فالمؤشّرات اثنان في الصفّ ما دام
   الرقم يسع**، والرقم يصغر درجةً ليسع — وقاعدتُه بعد قاعدة الرقم أدناه. */
@media${below('md')}{
  .tiles.c2,.tiles.c3,.tiles.c4,.tiles.c5{grid-template-columns:repeat(2,1fr)}
  .tiles.c3>.tile:last-child:nth-child(odd),.tiles.c4>.tile:last-child:nth-child(odd){grid-column:1/-1}}
/* ‏**وما دام الرقم يسع** (D-325): تحت «xs» بالخطّ الأكبر خرج الرقمُ البطل «6,280» (‏40px) من خانته ‏6px — فعمودٌ واحد */
@media${below('xs')}{.tiles.c2,.tiles.c3,.tiles.c4,.tiles.c5{grid-template-columns:1fr}}
/* ‏وصفُّ أربعةٍ لا يترك خانةً فارغةً في آخره: الأخيرةُ تمتدّ إلى نهاية السطر (محطّاتُ العميل السبع، D-259) */
@media${atLeast('md')}{
  .tiles.c4>.tile:last-child:nth-child(4n+3){grid-column:span 2}
  .tiles.c4>.tile:last-child:nth-child(4n+2){grid-column:span 3}}
/* ── نظرةٌ عامّة: عمودان يُملآن لا يُمدّان (D-136) ──────────────────────
   شبكة تمدّ البطاقة لتساوي جارتَها تترك تحت رسم الإنفاق ‏٥٢١px بيضاء
   (قِيست). فالعمود الثاني **رصّة** من بطاقتين تملأ ما تملؤه القائمة،
   ولا بطاقة تُمدّ فوق محتواها. */
.ov{display:grid; grid-template-columns:minmax(0,1.15fr) minmax(0,1fr); gap:var(--gap-card); align-items:start}

/* ── الرئيسيّة: خطوتُك، ثمّ الرحلة، ثمّ المنصّات (D-177) ───────────────
   ثلاث طبقات تجيب ثلاثة أسئلة قبل أيّ رقم مال. والفعل الواحد بلون حاله:
   أحمر ما يوقف النشر، وبرتقاليّ ما ينتظر، وحدّ أخضر لما يجري. */
.next{display:flex; align-items:center; gap:var(--s-4); flex-wrap:wrap; margin-bottom:var(--gap-card)}
.next[data-tone=warn]{border-inline-start-color:var(--warn); background:var(--warn-wash)}
.next[data-tone=bad]{border-inline-start-color:var(--bad); background:var(--bad-wash)}
.next-body{flex:1 1 16rem; min-width:0}
.next-k{display:block; font-size:var(--t-small); line-height:var(--lh-small); font-weight:600; color:var(--ink-2)}
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
   القمع صفوف: اسم المحطّة وحالُها، ثمّ شريط بطول ما مرّ بها (حبر واحد: قياس لا هويّة)،
   ثمّ العدد. **والمميَّزة وحدَها بلون حالها** فلا تُقرأ سبع محطّات برتقاليّة ضجيجًا. */
/* ‏وتحت العريض عمودٌ واحد — وبعد قاعدتها في الورقة، فلا يغلبها الترتيب */
/* ‏**عمودان** (D-355): الرئيسيُّ للقرار والجانبيُّ للسياق، والجانبيُّ ثابتُ العرض كي لا يتمدّد في الشاشات العريضة */
.home-head{display:flex; align-items:center; flex-wrap:wrap; gap:var(--s-3); margin-bottom:var(--s-5)}
.home-grid{display:grid; align-items:start; gap:var(--gap-card); grid-template-columns:minmax(0,1fr) 24rem; margin-top:var(--gap-card)}
.home-main, .home-aside{display:grid; grid-template-columns:minmax(0,1fr); gap:var(--gap-card); min-width:0}
.home-main > .card, .home-aside > .card{margin-bottom:0}
@media${below('lg')}{.home-grid{grid-template-columns:minmax(0,1fr)}}
/* ‏«خطوتك التالية» سطرٌ مضغوط (D-355): كان كتلةً بعنوانٍ كبير تملأ أوّلَ الشاشة */
.card-alert.next.is-slim{padding:var(--s-3) var(--s-5); border-radius:var(--r-card)}
.next.is-slim .next-t{font-size:var(--t-ui); line-height:var(--lh-ui)}
.next.is-slim .next-k{display:inline; margin-inline-end:var(--s-2)}
.next.is-slim .next-body{display:flex; flex-wrap:wrap; align-items:baseline; gap:var(--s-1)}
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
.wk li[data-today]{background:var(--surface); box-shadow:inset 0 0 0 var(--stroke) var(--accent)}
.wk-d{font-size:var(--t-small); line-height:var(--lh-small); font-weight:600; color:var(--ink-2)}
/* ‏والاسمُ بقدر عموده (D-325): الكاملُ فوق «sm»، وبلا «ال» تحتها بحجم الشارة، وحرفُه الأوّلُ تحت «xs» («ح ن ث ر خ ج س» كما في
   تقويم الهاتف) — «الخميس» ‏42px و«خميس» ‏36px في عمودٍ ‏33px عند ‏320. والاسمُ الكاملُ لقارئ الشاشة دائمًا («.vh») */
.wk-short,.wk-min{display:none}
/* ‏في العمود الجانبيّ (D-355) الخانةُ أضيقُ من اسم اليوم كاملًا، فالمختصرُ على كلّ عرض */
@media${atLeast('lg')}{.home-aside .wk-long{display:none} .home-aside .wk-short{display:inline}}
.wk-n{font-size:var(--t-h3); line-height:var(--lh-h3); font-weight:600}
.wk-dots{display:flex; flex-wrap:wrap; justify-content:center; gap:var(--s-0); flex:1; align-content:flex-start; padding:0 var(--s-1)}
/* ‏ومربّعُ شعارٍ لا نقطةُ لون (D-325): الرمزُ الأبيضُ يحمل المنصّة، واللونُ يُعين؛ وحلقةُ الليل تحدّ مربّعَ X على الأرض الداكنة */
.wk-pf{flex:none; display:grid; place-items:center; width:var(--icon-sm); height:var(--icon-sm); border-radius:var(--r-inline);
  color:var(--pf-fg); background:var(--ink-3); box-shadow:inset 0 0 0 var(--ul) var(--logo-ring)}
.wk-pf svg{width:62%; height:62%; display:block}
.wk-pf[data-pf=linkedin]{background:var(--pf-linkedin)}
.wk-pf[data-pf=x]{background:var(--pf-x)}
.wk-pf[data-pf=instagram]{background:var(--pf-instagram)}
.wk-pf[data-pf=tiktok]{background:var(--pf-tiktok)}
.wk-pf[data-pf=youtube]{background:var(--pf-youtube)}
.machine-more > summary{cursor:pointer; color:var(--ink-2); font-size:var(--t-small); line-height:var(--lh-small); min-height:var(--tap); display:flex; align-items:center}
.wk-hint{margin:var(--s-3) 0 0}
.wk-c{font-size:var(--t-small); line-height:var(--lh-small); color:var(--ink-2)}
/* ‏وحلقةٌ ليلًا (D-183): مربّعا X وTikTok على السطح الداكن ‏١٫٠٣ و‏١٫٠٥:١ —
   يختفيان ويبقى رمز أبيض يطفو. ونهارًا الحلقة شفّافة */
.pf-logo{width:var(--s-10); height:var(--s-10); flex:none; display:grid; place-items:center;
  border-radius:var(--r-control); color:var(--pf-fg); background:var(--accent);
  box-shadow:0 0 0 1px var(--logo-ring)}
.pf-logo svg{width:50%; height:50%; display:block}
@media${below('sm')}{
  .funnel a{grid-template-columns:6.5rem minmax(0,1fr) 2rem}
  .wk li{min-height:6.5rem}
  .wk-d{font-size:var(--t-caption); line-height:var(--lh-caption)}
  .wk-long{display:none}
  .wk-short{display:inline}
  .next .btn{flex:1 1 100%}
}
@media${below('xs')}{
  .wk-short{display:none}
  .wk-min{display:inline}
}
.stack{display:grid; gap:var(--gap-card); align-content:start}
@media${below('lg')}{.ov{grid-template-columns:1fr}}

/* ── البطاقة: سطحٌ وحدٌّ وظلٌّ خفيف (خطّة التصميم 3.3 و7.3 · D-187) ─────────────
   **مراجعةٌ لـ D-144 «بطاقةٌ مسطّحة»**: قِيست البنيةُ فلم تُرَ — حدُّ البطاقة على الأرض
   ‏١٫٢٣:١، وثلاثة عناصر فقط تحمل ظلًّا في الرئيسيّة، فتُقرأ الصفحة ورقةً واحدةً
   مخطّطة. فصار للبطاقة حدّ أوضح («--line» ‏١٫٥٢:١) وظلّ الارتفاع الأوّل، **والظلّ
   يسند الحدّ ولا يحلّ محلّه**. وسقطت المادّة («--sheen» و«--hair»): ضوء مرسوم
   على سطح يُقرأ زينةً لا بنية. والحشو رمز دوره («--pad-card»: ‏٢٤ ثمّ ‏١٦ على الجوّال). */
.card{background:var(--surface); border:var(--bd); border-radius:var(--r-card);
  padding:var(--pad-card); box-shadow:var(--sh-1);
  transition:box-shadow var(--dur-2) var(--ease), border-color var(--dur-2) var(--ease), transform var(--dur-2) var(--ease);
  animation:rise var(--dur-3) var(--ease-rise) both}
/* بطاقةُ القناة والمسوّدة تحملان فعلا، فترتفعان قليلا عند التحويم: الظلُّ الثاني
   والحدّ الوظيفيّ (خطّة التصميم 7.3). وبطاقات العرض لا ترتفع: حركة بلا فعل خلفها
   تَعِد بما لا يقع. **وكانت قاعدتين** (الثانية آخر الورقة بالظلّ الثالث تغلب
   الأولى)، فصارت واحدة. */
@media(hover:hover){.ch:hover,.draft:hover{box-shadow:var(--sh-2); border-color:var(--field)}}
/* **الابنُ المباشرُ وحده كان يُصاب.** و .card-head h2 حفيدٌ لا ابن،
   فسقط من القاعدة وورث حجم المتصفّح الافتراضيّ — ‏٢١px، وهو خارج
   السلّم كلِّه. علّة لم تُر لأنّ ٢١ قريبة ممّا حولها، **وكشفها
   قياس المقاييس المستعملة فعلا** لا النظر.
   والمحدّد صار وصفيّا: كلّ عنوان في بطاقة. */
.card h2{font-weight:600; margin-bottom:var(--s-0); font-size:var(--t-h3); line-height:var(--lh-h3); letter-spacing:0}
/* **والهامشُ قاعدةٌ لا استثناء.** كانت على «.card > .hint» وحدها،
   فـ«hint» خارج بطاقة يرث 14px من المتصفّح — **خارج السلّم**، وهي
   علّة «p.nm» و«h3.sec» نفسُها (D-057 · D-061 · D-062). فتُوضَع
   القاعدة للصنف، ويبقى محدّد البطاقة لِما يخصّها من لون وقياس. */
.hint{margin:0 0 var(--s-4)}
.card > .hint{margin:0 0 var(--s-4); font-size:var(--t-small); color:var(--ink-2); line-height:var(--lh-small)}
.card-head{display:flex; align-items:center; gap:var(--s-3); flex-wrap:wrap; margin-bottom:var(--s-3)}
.card-head h2{margin:0}
/* ── صيغُ البطاقة الثلاثُ الأخرى (خطّة التصميم 7.3 · D-189) ─────────────────────────
   «card-interactive»: البطاقة كلُّها رابط، وتمريرُها حدّ الوظيفة والظلّ الثاني — **لا قفزة**
   («translate» ممنوع، 3.3). «card-inset»: ما في داخل بطاقة أخرى، سطح ثان بلا حدّ ولا ظلّ.
   «card-alert»: الحافّة الملوّنة الوحيدة (‏٤px بلون الحال) بدل خمس — والإشعار صيغتُها. */
.card-interactive{display:block; color:inherit; text-decoration:none}
@media(hover:hover){.card-interactive:hover{box-shadow:var(--sh-2); border-color:var(--field)}}
.card-inset{background:var(--surface-2); border-color:transparent; box-shadow:none}
.card-alert{border-inline-start:var(--s-1) solid var(--ok)}
.card-alert[data-tone=warn]{border-inline-start-color:var(--warn)}
.card-alert[data-tone=bad]{border-inline-start-color:var(--bad)}
/* ‏ورأسُها: عنوانٌ بنمط «h3» في كلّ مستوى، ثمّ جملةٌ واحدةٌ بحبر «--ink-2» */
.card-head h3{margin:0; font-size:var(--t-h3); line-height:var(--lh-h3); font-weight:600}
/* ‏حشوُ ما نُقل إلى البطاقة من مكوّنٍ يسبقها في الورقة (٢ج): قاعدتُه قبل «.card» فيغلبه
   «--pad-card» بالترتيب، فيُثبَّت هنا بمحدّد مركّب لا بإعادة إعلان الصنف */
/* ‏والبطلُ (صفاء): الموضعُ الوحيدُ الذي تحمل فيه بطاقةٌ تدرّجًا — غسلةُ هويّةٍ من أعلى، وخيطُ ضوءٍ حادّ.
   **وبقيت البطاقاتُ الأخرى بلا مادّة** (D-187): الخيطُ للأزرار والبطل والرافدة والمختار وحدها */
.card-alert.next{padding:var(--s-5) var(--s-6); border-radius:var(--r-hero);
  background:linear-gradient(180deg,var(--tint-wash),transparent 70%) var(--surface);
  box-shadow:var(--gleam-hi), var(--sh-2)}
@media${below('sm')}{.card-alert.next{padding:var(--s-4)}}
/* ‏و«.card > p» قاعدةٌ عامّةٌ لفقرة البطاقة (هامشٌ وحرفٌ صغيرٌ وحبرٌ ثانٍ) — وفقراتُ هذه
   المكوّنات لها قياسُها في قواعدها، فلا ترثها حين صارت بطاقة. والسهم في الرحلة وباب
   «ما تطلبه» سطحان ثانيان بلا ظلّ كما كانا */
.card.keys > .hint{color:var(--ink)}
.needs-list a.card-interactive{box-shadow:none}
/* ‏والدليلُ إفصاحٌ بلا حشو (رأسُه وجسدُه يحملانه)، إلّا دليلَ نتيجة الربط فهو بطاقةٌ بحشوها
   وظلّها على السطح الثاني كما كان. وشبكة المؤشّرات بطاقة خيوطُها فجوة ‏1px على أرض «--line» */
.card-inset.guide{padding:0}
.card.guide:not(.card-inset){background:var(--surface-2)}
.card-desc{margin:calc(-1 * var(--s-2)) 0 var(--s-3); font-size:var(--t-small); line-height:var(--lh-small); color:var(--ink-2)}
/* عنوانُ القسم: خيطٌ رماديٌّ يمتدّ تحته، وفوقه فاصلُ الأقسام («--gap-section»: ‏٤٨ ثمّ
   ‏٣٢ على الجوّال). وكان يبدؤه خيط نحاسيّ قصير، فيُعدّ موضعًا في كلّ قسم — سبعة عشر
   موضعًا في صفحة القنوات وحدها — فسقط (D-187). */
/* **والصنفُ لا يُقيَّد بوسم.** كان «h3.sec»، فـ«h2» يحمل الصنفَ نفسَه
   يسقط من القاعدة ويرث 21px من المتصفّح — **خارج السلّم**، وهي علّة
   «.card > h2» نفسُها (D-057). ومدقّق السلّم أمسكها هنا كذلك. */
.sec{color:var(--ink-2); margin:var(--gap-section) 0 var(--s-3); padding-bottom:var(--s-2);
  border-bottom:var(--bd-soft); position:relative; font-size:var(--t-ui);
  line-height:var(--lh-ui); font-weight:600}

/* ── ميزانيّةُ الذهب: ثلاثةُ مواضعَ في الشاشة لا رابعَ لها (خطّة التصميم 3.2 · D-187 · D-196) ──
   (وكان اسمُها «النحاس» حتّى لوحة الهويّة.) العلامة («.glyph»، و«.moment-glyph» في لحظتها)، ومؤشّر
   القسم الحاليّ في الرافدة، والرقم البطل أدناه. **وكان في
   الرئيسيّة خمسة عشر موضعًا** (D-156 قصرَه على حبر لرقم واحد وخيوط، والخيوط تكاثرت):
   خيط كلّ قسم، ورأس شريط المؤشّرات، وخطّ تحت كلّ رابط هادئ، وأطول أعمدة الرسم،
   ورافدة الدليل، وحلقة التركيز، ووهج المسوّدة المنتظرة، ووهج الأرض. **فصار الذهب
   لا يقع على حدّ بطاقة ولا خطّ رابط ولا شريط رسم ولا حال ولا وهج**، ويعدّه
   «audit_design» في كلّ شاشة مرسومة و«audit_tokens» في الورقة. */

/* ── بطاقةُ المؤشّر ────────────────────────────────────────── */
.tile{display:flex; flex-direction:column; position:relative; overflow:hidden}
/* وكان على رأس كلّ مؤشّرٍ خيطُ نحاسٍ («::before») يُخفيه شريطُ المؤشّرات منذ
   D-143، فلم يبق إلّا على عدّاد المصادر المستعير للصنف — نحاس بلا معنى. فحُذف
   (D-183)؛ والصفّ يربطه حدّ الشريط النحاسيّ في «.grid.tiles». */
.tile .kv-k{font-size:var(--t-small); line-height:var(--lh-small); font-weight:600; color:var(--ink-2)}
/* **أرقامُ المؤشّرات نمطُ «kpi»** (D-185): حجمُ عنوان الصفحة بوزن ‏٤٠٠ — الرقمُ يُقرأ
   بحجمه لا بثخانته، والثخين للعناوين. */
.tile .kv-v{font-size:var(--t-h1); font-weight:400; line-height:var(--lh-h1);
  font-variant-numeric:tabular-nums; margin-top:var(--s-1);
  /* العزلُ يثبّت ترتيبَ الرقم ورمزِ العملة، والمحاذاةُ تُبقيه تحت لصيقته.
     **ولا تضييقَ إلّا للرقم البطل** (D-185 · خطّة التصميم 4.3): ‏-.01em للأرقام اللاتينيّة
     عند ‏٤٠، وصفر فيما دونه — Plex جدوليّ الأرقام بمسافاته */
  direction:ltr; unicode-bidi:isolate; text-align:end; letter-spacing:0}
.tile .kv-v em{font-style:normal; font-size:var(--t-small); line-height:var(--lh-small); color:var(--ink-2);
  margin-inline-start:var(--s-0); font-weight:400}
/* ── والمؤشّرُ الأوّل يقود بالقياس كما يقود باللون (D-117) ───────────
   ندرة تصنع مرتبة، وذهب على الأربعة يُلغي معنى الأوّل. **وكان اللون
   وحدَه يقول ذلك والقياس يخالفه**: أربعة أرقام عند ‏٤٢px في صفّ
   واحد، **فلا تقول الشاشة أيُّها الجواب**.

   وذهب يقول «هذا أوّل» وقياس يقول «الأربعة سواء» **يُلغي أحدُهما
   الآخر**، ويبقى الصفّ يُقرأ لوحة عدّادات.

   **ويشمل شبكةَ الثلاثة كذلك** (المزوّدون): القاعدةُ في الأوّليّة لا في
   العدد. */
/* ‏وهو ثالثُ مواضع الذهب: رقمٌ واحدٌ في الشاشة (D-187 · D-196) */
.grid>.tile:first-child .kv-v{font-size:var(--t-display); line-height:var(--lh-display); color:var(--au);
  font-weight:400; direction:ltr; letter-spacing:-.01em}
/* ‏**ومقاييسُ النجاح تحت التقرير لا تقود** (D-324): رقمُ الشاشة الذهبيُّ رقمُ الأسبوع فوقها، وبطاقةٌ ثانيةٌ بذهبٍ أوّلَ كانت
   تجعلها أربعةَ مواضع («audit_design» على «النتائج»). فأرقامُها الثلاثة سواءٌ بحبر النصّ وقياسِ المؤشّر */
#success .grid>.tile:first-child .kv-v{font-size:var(--t-h1); line-height:var(--lh-h1); color:var(--ink); letter-spacing:0}

/* ‏«يُنشر اليوم» (D-267): الساعةُ ثمّ المنصّةُ بشعارها، سطرًا لكلّ منشور */
.td-list{list-style:none; margin:0; padding:0; display:grid; gap:var(--s-2)}
.td-list li{display:flex; align-items:center; gap:var(--s-3); font-size:var(--t-ui); line-height:var(--lh-ui)}
.td-pf{display:inline-flex; align-items:center; gap:var(--s-1); color:var(--ink-2)}
.td-pf svg{width:var(--icon-sm); height:var(--icon-sm)}
/* ── الرئيسيّة (D-265): التحيّة، والأرقام الأربعة، وأعمدة الأيّام ── */
.hello{margin:0 0 var(--s-2); font-size:var(--t-h1); line-height:var(--lh-h1); font-weight:600}
.hstats{list-style:none; margin:0 0 var(--gap-card); padding:0; display:grid; gap:0; overflow:hidden;
  grid-template-columns:repeat(4,minmax(0,1fr)); background:var(--surface); border:var(--bd); border-radius:var(--r-card);
  box-shadow:var(--sh-1); animation:rise var(--dur-3) var(--ease-rise) both}
/* ‏**شريطٌ واحد لا أربعُ بطاقات** (D-355): الأرقامُ مقياسٌ واحد يُقرأ معًا، فتفصلها خيوطٌ لا حوافٌّ ملوّنة. والحالُ نقطةٌ قبل اسم الرقم */
@media${below('md')}{.hstats{grid-template-columns:repeat(2,minmax(0,1fr))} .hstats li:nth-child(n+3){border-top:var(--bd)} .hstats li:nth-child(3){border-inline-start:0}}
.hstats li + li{border-inline-start:var(--bd)}
.hstats a{display:flex; flex-direction:column; gap:var(--s-1); min-height:var(--tap); padding:var(--s-4) var(--s-5); color:var(--ink); text-decoration:none;
  transition:background-color var(--dur-2) var(--ease)}
@media(hover:hover){.hstats a:hover{background:var(--hover)} .db-bar:hover rect{opacity:.8}}
.hs-k::before{content:''; display:inline-block; width:var(--s-2); height:var(--s-2); margin-inline-end:var(--s-2); border-radius:var(--r-pill); background:var(--line); vertical-align:middle}
.hstats [data-tone=wait] .hs-k::before{background:var(--ink-3)}
.hstats [data-tone=sched] .hs-k::before{background:var(--accent)}
.hstats [data-tone=ok] .hs-k::before{background:var(--ok)}
.hstats [data-tone=bad] .hs-k::before{background:var(--bad)}
.hs-k{font-size:var(--t-small); line-height:var(--lh-small); color:var(--ink-2)}
.hs-n{font-size:var(--t-h1); line-height:var(--lh-h1); font-weight:600}
.daybars{margin:0}
/* ‏والرقمُ فوق عموده (مراجعة D-323): صفٌّ بعرض الرسم وارتفاعه فوقه، عمودٌ لكلّ يوم بعرض عموده، والرقمُ في عموده على
   ارتفاعٍ يكتبه الخادمُ نسبةً من ارتفاع الرسم — فيعلو رأسَ العمود أيًّا كان عرضُ الشاشة */
.db-plot{position:relative; padding-block-start:var(--s-4)}
.db-svg{display:block; width:100%; height:9rem; overflow:visible}
.db-vals{position:absolute; inset-block:var(--s-4) 0; inset-inline:0; margin:0; padding:0; list-style:none; display:grid; grid-auto-flow:column;
  grid-auto-columns:minmax(0,1fr); column-gap:var(--db-gap); pointer-events:none}
.db-vals li{position:relative}
.db-vals span{position:absolute; inset-inline:0; text-align:center; white-space:nowrap; font-size:var(--t-small);
  line-height:var(--lh-small); font-weight:600; color:var(--ink-2); font-variant-numeric:tabular-nums;
  animation:rise var(--dur-3) var(--ease-rise) both}
.db-base{stroke:var(--line)}
.db-bar rect{fill:var(--accent); transform-box:fill-box; transform-origin:50% 100%;
  animation:grow var(--dur-3) var(--ease-rise) both; animation-delay:calc(var(--i) * 25ms)}
.db-bar.zero rect{fill:var(--line)}
.db-axis{display:flex; justify-content:space-between; margin-top:var(--s-1); font-size:var(--t-small);
  line-height:var(--lh-small); color:var(--ink-2)}
@keyframes grow{from{transform:scaleY(0)}to{transform:none}}
.ill-wash{fill:var(--surface-2)}.ill-line{fill:var(--accent); opacity:.45}.ill-soft{fill:var(--line)}
.ill-brand{fill:var(--accent)}.ill-plus{stroke:var(--surface); fill:none}.ill-dot{fill:var(--warn)}
`

/** طبقة اللمس وما بعدها: آخر الورقة قصدًا (D-086) — الوحدةُ 14 من 14 في ورقة الأنماط، بترتيبها (`scripts/split_styles.mjs`). */
import { below, narrower } from '../tokens'

export const TOUCH = `/* ══════════════════════════════════════════════════════════════════
   طبقة اللمس — **وموضعُها آخر الورقة قصدا** (D-086).

   CSS يرجّح المتأخّر عند تساوي المحدّدات. وكتلة في الوسط تغلبها كلّ
   قاعدة بعدها — جُرّبت فبقيت الحقول على ‏١٢٫٥px رغم أنّ الوسيط يطابق.
   فطبقة الجهاز تُكتب آخرا، كما تُكتب طبقة الطباعة.

   **ثمّ كُتبت بعدها لوحةُ الأوامر (D-105) وسجلُّ الطبعات** فصارت في الوسط،
   وغلبها «.cmdk-in input» بتساوي المحدّد: حقل اللوحة ‏١٤px على اللمس،
   **فيُقرّبه iOS عند كلّ فتحةٍ للّوحة** — والقياسُ عند ‏٣٩٠ قاله (D-167).
   فعادت آخر الورقة، واختبار في views.test يُسقط CI إن كُتبت قاعدة
   بعدها: **ما يُضاف يُكتب فوق هذا السطر.**
   ══════════════════════════════════════════════════════════════════ */
/* ── صفحةُ المنصّة صفحةَ حساب (D-172) ───────────────────────────────────
   الغلاف مسطّح من أرض الثيم وخيط تحته، والشعار الأحاديّ في جهة النهاية
   زخرف مخفيّ. وصورة الحساب حرف أوّل تتداخل مع الغلاف بـ translate لا
   بهامش سالب. ونسبة الغلاف تختلف كما تختلف عند المنصّات، ولا غلاف في
   Instagram وTikTok. */
.acct{padding:0; overflow:hidden; margin-bottom:var(--s-5)}
.acct-cover{position:relative; block-size:7.5rem; background-color:var(--surface-2);
  border-block-end:var(--bd)}
.acct-echo{position:absolute; inset:0; color:var(--ink-3)}
.acct-echo svg{display:block; inline-size:100%; block-size:100%}
.acct-x .acct-cover{block-size:9rem}
.acct-youtube .acct-cover{block-size:6rem}
.acct-instagram .acct-cover,.acct-tiktok .acct-cover{display:none}
.acct-mark{position:absolute; inset-inline-end:var(--s-6); inset-block-end:var(--s-5); color:var(--ink-3); opacity:.5}
.acct-mark svg{inline-size:var(--s-10); block-size:var(--s-10); display:block}
.acct-body{position:relative; display:flex; align-items:flex-end; gap:var(--s-5); flex-wrap:wrap;
  padding:var(--s-12) var(--s-6) var(--s-5)}
.acct-av{flex:none; display:grid; place-items:center; inline-size:6rem; block-size:6rem; border-radius:50%;
  background-color:var(--surface-3); color:var(--ink-2); border:var(--s-1) solid var(--surface);
  font-size:var(--t-h1); font-weight:600; line-height:var(--lh-h1);
  position:absolute; inset-block-start:calc(var(--s-12) * -1); inset-inline-start:var(--s-6)}
.acct-av[data-kind="org"]{border-radius:var(--r-card)}
/* وبلا غلافٍ يعود إلى السطر: لا شيءَ يتداخل معه */
.acct-instagram .acct-av,.acct-tiktok .acct-av{position:static}
.acct-instagram .acct-body,.acct-tiktok .acct-body{padding-block-start:var(--s-5)}
.acct-id{flex:1 1 20rem; min-inline-size:0}
.acct-id h1{margin:var(--s-1) 0 0; font-size:var(--t-h1); line-height:var(--lh-h1); font-weight:600}
.acct-sub{margin:var(--s-1) 0 0; color:var(--ink-2); font-size:var(--t-small); line-height:var(--lh-small)}
.acct-counts{display:flex; flex-wrap:wrap; gap:var(--s-2) var(--s-5); margin:var(--s-3) 0 0; padding:0;
  list-style:none; color:var(--ink-2); font-size:var(--t-small); line-height:var(--lh-small)}
.acct-counts b{color:var(--ink); font-weight:600; font-variant-numeric:tabular-nums}
.acct-counts .bad b{color:var(--bad)}
.acct-act{display:flex; flex-direction:column; align-items:flex-end; gap:var(--s-3)}
.acct-verdict{display:inline-flex; flex-wrap:wrap; justify-content:flex-end; align-items:center; gap:var(--s-2)}
/* ‏والحكمُ يلتفّ ورابطُه لا ينعصر (D-325): عند ‏320 بالخطّ الأكبر ضاق «التفاصيل» عن كلمته فخرج منها ‏9px */
.acct-verdict .tap{flex:none}
.acct-card{margin-bottom:var(--s-3)}

/* ما تطلبه المنصّة: سبعُ خاناتٍ متساوية، القاعدةُ سطرٌ وحالُ المنصّة تحته.
   والساقطة تُرى بحدّ لا بلون وحدَه، والخانة رابط بهدف لمس كامل. */
.needs{margin-bottom:var(--s-5)}
.needs-h{display:flex; align-items:baseline; gap:var(--s-3); margin:0 0 var(--s-3); font-size:var(--t-h2);
  line-height:var(--lh-h2); font-weight:600}
.needs-list{display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); gap:var(--s-2); margin:0; padding:0; list-style:none}
.needs-list a{display:flex; flex-direction:column; gap:var(--s-1); block-size:100%; min-block-size:var(--tap);
  padding:var(--s-3); color:var(--ink)}
.needs-top{display:flex; align-items:center; gap:var(--s-2); font-size:var(--t-small); line-height:var(--lh-small)}
.needs-top .step-n{font-size:var(--t-caption); line-height:var(--lh-caption); font-weight:600; color:var(--ink-2);
  font-variant-numeric:tabular-nums}
.needs-g{margin-inline-start:auto; display:inline-flex}
.needs-g svg{inline-size:var(--icon-xs); block-size:var(--icon-xs)}
.needs-rule{font-size:var(--t-small); color:var(--ink-2); line-height:var(--lh-small)}
.needs-now{font-size:var(--t-small); color:var(--ink-2); font-weight:600; line-height:var(--lh-small)}
.needs-list .ok .needs-g{color:var(--ok)}
.needs-list .warn .needs-g{color:var(--warn)}
.needs-list .idle .needs-g{color:var(--ink-3)}
.needs-list .bad a{border-color:var(--bad); background-color:var(--bad-wash)}
.needs-list .bad .needs-g,.needs-list .bad .needs-now{color:var(--bad)}
@media${below('lg')}{.needs-list{grid-template-columns:repeat(4,minmax(0,1fr))}}
@media${below('sm')}{
  /* وعلى الجوّال خانتان في الصفّ، والقاعدةُ تُطوى وتبقى الحال: المنشورُ الأوّلُ
     قبل الشاشة الثانية لا بعدها */
  .needs-list{grid-template-columns:repeat(2,minmax(0,1fr))}
  .needs-rule{display:none}
  .needs-list a{padding:var(--s-2) var(--s-3)}
  .acct-cover,.acct-x .acct-cover,.acct-youtube .acct-cover{block-size:4.5rem}
  .acct-counts{gap:var(--s-1) var(--s-3)}
  .acct-body{padding:var(--s-10) var(--s-4) var(--s-4)}
  .acct-av{inline-size:4.5rem; block-size:4.5rem; inset-block-start:calc(var(--s-10) * -1);
    inset-inline-start:var(--s-4)}
  .acct-act{align-items:stretch; inline-size:100%}
  .acct-act .btn{justify-content:center}
}

/* ── المنشورُ كما سيظهر ───────────────────────────────────────────────
   بنية المنصّة وجلد صدى: خطّ اللوحة وحبرُها، بلا لون المنصّة ولا
   أيقوناتها. والإطار صورة المنشور وحدَه؛ الحال والأزرار خارجه. */
.np-list{display:flex; flex-direction:column; container:np-list/inline-size}
.np-row{display:grid; grid-template-columns:8.5rem minmax(0,var(--np-w-li)) minmax(0,1fr); gap:var(--s-5);
  align-items:start; padding-block:var(--s-5); border-block-end:var(--bd-soft);
  scroll-margin-block-start:var(--s-16)}
.np-row:target{outline:var(--stroke) solid var(--ring); outline-offset:var(--s-2); border-radius:var(--r-card)}
.np-when{display:flex; flex-direction:column; gap:var(--s-1); align-items:flex-start}
.np-dayl{font-size:var(--t-small); line-height:var(--lh-small); color:var(--ink-2); font-weight:600}
.np-clock{font-size:var(--t-h3); line-height:var(--lh-h3); font-weight:600; font-variant-numeric:tabular-nums}
.np-utc{font-size:var(--t-small); line-height:var(--lh-small); color:var(--ink-2); font-variant-numeric:tabular-nums}
.np-under{display:flex; flex-direction:column; align-items:flex-start; gap:var(--s-2); font-size:var(--t-small); line-height:var(--lh-small)}
.np-acc{color:var(--ink-2); font-weight:600}
.np-result{color:var(--ink-2)}
.np-result b{color:var(--ink); font-variant-numeric:tabular-nums}
.np-why{display:flex; gap:var(--s-2); margin:0; color:var(--bad)}
.np-why-ic{display:inline-flex; padding-top:var(--s-1)}
.np-why-ic svg{inline-size:var(--icon-xs); block-size:var(--icon-xs)}
/* ‏«قل ما وجدت» لتغريدةٍ معلّقة (مراجعة D-324): الحقلُ يأخذ السطرَ والزرّان بعده، وعلى الهاتف يلتفّان تحته */
.tcheck{display:flex; flex-wrap:wrap; align-items:flex-end; gap:var(--s-2); flex:1 1 100%}
.tcheck-f{display:grid; gap:var(--s-1); flex:1 1 16rem; min-inline-size:0}
.tcheck-f input{inline-size:100%}
.np-day{position:sticky; inset-block-start:0; z-index:1; margin:var(--s-5) 0 0; padding-block:var(--s-2);
  background-color:var(--bg); color:var(--ink-2); font-size:var(--t-small); line-height:var(--lh-small); font-weight:600;
  border-block-end:var(--bd)}
.np-note{margin:var(--s-6) 0 0; color:var(--ink-2); font-size:var(--t-small); line-height:var(--lh-small)}
.acct-more{margin-block:var(--s-4)}

.np{container-type:inline-size; inline-size:100%; margin:0; background-color:var(--surface); color:var(--ink);
  border:var(--bd); border-radius:var(--r-control); overflow:hidden; font-size:var(--t-body);
  line-height:var(--lh-body); box-shadow:var(--sh-1)}
.np-li{max-inline-size:var(--np-w-li)}
.np-ig{max-inline-size:var(--np-w-li)}
.np-tt,.np-yt{max-inline-size:var(--np-w-clip); border:0; border-radius:var(--r-card);
  background-color:var(--np-stage); color:var(--np-on-stage)}
.np-head{display:flex; align-items:center; gap:var(--s-3); padding:var(--s-3) var(--s-4) 0}
.np-who{display:flex; flex-direction:column; min-inline-size:0}
.np-name{font-weight:600}
.np-meta{display:inline-flex; align-items:center; gap:var(--s-1); color:var(--ink-2); font-size:var(--t-small); line-height:var(--lh-small)}
.np-meta svg{inline-size:var(--icon-xs); block-size:var(--icon-xs)}
.np-end{margin-inline-start:auto; display:inline-flex; align-items:center; gap:var(--s-3); color:var(--ink-2)}
.np-end svg{inline-size:var(--icon-md); block-size:var(--icon-md)}
.np-av{flex:none; display:grid; place-items:center; inline-size:var(--s-12); block-size:var(--s-12); border-radius:50%;
  background-color:var(--surface-3); color:var(--ink-2); font-weight:600; font-size:var(--t-h3); line-height:var(--lh-h3)}
.np-av[data-kind="org"]{border-radius:var(--r-control)}
.np-text{margin:0; padding:var(--s-3) var(--s-4); white-space:pre-wrap; overflow-wrap:anywhere;
  unicode-bidi:plaintext; max-inline-size:var(--measure)}
.np-tag{color:var(--accent); font-weight:600}
.np-media{background-color:var(--surface-2); border-block:var(--bd-soft)}
.np-media>img,.np-media>video{display:block; inline-size:100%; block-size:auto; max-block-size:calc(100cqi * 1.25);
  object-fit:contain; margin-inline:auto}
/* الاختصارُ بهامشٍ لا بحشوة: الحشوةُ داخل الصندوق المقصوص فيطلّ منها نصفُ سطرٍ رابع */
.np-compact .np-text{display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:3; overflow:hidden;
  padding:0; margin:var(--s-3) var(--s-4)}
.np-x.np-compact .np-text{margin-inline:0}
.np-compact .np-media>img,.np-compact .np-media>video{max-block-size:18.75rem}
.np-counts{display:flex; gap:var(--s-2); padding:var(--s-2) var(--s-4); color:var(--ink-2); font-size:var(--t-small); line-height:var(--lh-small)}
.np-counts b{font-weight:600; font-variant-numeric:tabular-nums}
/* ‏وشريطُ التفاعل يلتفّ ولا يفيض (D-325): خمسةُ أفعالٍ بأرقامها في عمود X عند ‏320 خرج آخرُها «1,204» من الإطار ‏26px */
.np-bar{display:flex; flex-wrap:wrap; align-items:center; gap:var(--s-1) var(--s-4); padding:var(--s-2) var(--s-4) var(--s-3);
  color:var(--ink-2); font-size:var(--t-small); line-height:var(--lh-small)}
.np-bar span{display:inline-flex; align-items:center; gap:var(--s-1)}
.np-bar svg{inline-size:var(--icon-md); block-size:var(--icon-md)}
.np-bar b{font-weight:400; font-variant-numeric:tabular-nums}
.np-bar-li{display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); border-block-start:var(--bd-soft);
  padding-block-start:var(--s-2); margin-inline:var(--s-2)}
.np-bar-li span{justify-content:center; font-weight:600; min-width:0; flex-wrap:wrap; text-align:center}
.np-x{max-inline-size:var(--np-w-x); display:grid; grid-template-columns:var(--s-10) minmax(0,1fr); gap:var(--s-3);
  padding:var(--s-3) var(--s-4)}
.np-x .np-av{inline-size:var(--s-10); block-size:var(--s-10)}
.np-x .np-head,.np-x .np-text,.np-x .np-bar{padding-inline:0}
.np-x .np-head{padding-block-start:0}
.np-x .np-text{padding-block:var(--s-1) var(--s-2)}
.np-x .np-media{border:var(--bd); border-radius:var(--r-card); overflow:hidden}
.np-x .np-bar{justify-content:space-between; max-inline-size:26.5rem; padding-block-end:0}
.np-x .np-bar .np-end{margin-inline-start:0}
.np-ig .np-av{inline-size:var(--s-8); block-size:var(--s-8); font-size:var(--t-caption); line-height:var(--lh-caption)}
.np-ig .np-head{padding-block-end:var(--s-3)}
.np-ig .np-bar{color:var(--ink)}
.np-ig .np-bar svg{inline-size:var(--icon-lg); block-size:var(--icon-lg)}
.np-slot{display:grid; place-items:center; aspect-ratio:4/5; background-color:var(--surface-2); color:var(--ink-2);
  border-block:var(--bd-soft); font-size:var(--t-small); line-height:var(--lh-small)}
.np-likes{margin:0; padding:0 var(--s-4); font-size:var(--t-small); line-height:var(--lh-small)}
.np-stage{position:relative; aspect-ratio:9/16; overflow:hidden}
.np-stage>img,.np-stage>video{position:absolute; inset:0; inline-size:100%; block-size:100%; object-fit:cover}
.np-noclip{position:absolute; inset-block-start:var(--s-3); inset-inline-start:var(--s-3); z-index:1;
  padding:var(--s-1) var(--s-2); border-radius:var(--r-pill); background-color:var(--np-scrim);
  color:var(--np-on-stage); font-size:var(--t-caption); line-height:var(--lh-caption); font-weight:600}
.np-scrim{position:absolute; inset-inline:0; inset-block-end:0; block-size:45%; background-color:transparent;
  background-image:linear-gradient(to top,var(--np-scrim),transparent)}
.np-rail{position:absolute; inset-inline-end:var(--s-2); inset-block-end:16%; display:flex; flex-direction:column;
  align-items:center; gap:var(--s-4); margin:0; padding:0; list-style:none; font-size:var(--t-caption);
  line-height:var(--lh-caption); font-weight:600}
.np-rail li{display:flex; flex-direction:column; align-items:center; gap:var(--s-0)}
.np-rail svg{inline-size:var(--icon-lg); block-size:var(--icon-lg)}
.np-rail .np-av{inline-size:var(--s-10); block-size:var(--s-10); border:var(--stroke) solid var(--np-on-stage)}
.np-rail b{font-weight:600}
.np-over{position:absolute; inset-inline-start:var(--s-3); inset-inline-end:var(--s-16); inset-block-end:var(--s-4)}
.np-over .np-text,.np-over .np-title{padding:var(--s-1) 0 0; font-size:var(--t-small); line-height:var(--lh-small)}
.np-title{margin:0; font-weight:600}
/* ‏والوسمُ على الإطار الداكن كلِّه بحبر المسرح وثِقَله: لونُ العلامة عليه ‏١٫١٠:١ نهارًا
   («--brand» ‏#16181d على ‏#0b0c10). **والإطار لا المسرح وحدَه** (مراجعة D-187): وصف YouTube
   في «.np-desc» أخو «.np-stage» لا ابنُه، فكان وسمُه أسود على أسود. ويحرسه «validate_contrast»
   (‏--brand على ‏--np-stage في «ما لا يقع») واختبار الوسم في «views.test». */
.np-tt .np-tag,.np-yt .np-tag{color:var(--np-on-stage); font-weight:600}
.np-desc{padding:var(--s-2) var(--s-3); border-block-start:var(--bd); font-size:var(--t-small); line-height:var(--lh-small)}
.np-desc summary{cursor:pointer; color:var(--np-on-stage)}

/* الشبكة: المنصّةُ تقصّ هناك، فالقصُّ هنا يُري ما تُريه — والمنشورُ كاملًا في صفّه */
.np-grid{display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:var(--s-0); max-inline-size:58.5rem}
.np-grid-clip{grid-template-columns:repeat(5,minmax(0,1fr))}
.np-tile{position:relative; display:block; aspect-ratio:1; overflow:hidden; background-color:var(--surface-3)}
.np-grid-ig .np-tile{aspect-ratio:3/4}
.np-grid-clip .np-tile{aspect-ratio:9/16}
.np-tile>img,.np-tile>video{inline-size:100%; block-size:100%; object-fit:cover; display:block}
.np-tile.dim>img,.np-tile.dim>video{opacity:.55}
.np-play{position:absolute; inset-block-start:var(--s-2); inset-inline-start:var(--s-2); color:var(--np-on-stage)}
.np-play svg{inline-size:var(--icon-md); block-size:var(--icon-md)}
.np-badge{position:absolute; inset-block-end:var(--s-2); inset-inline-end:var(--s-2)}
/* ‏**والصفُّ عمودٌ واحدٌ حتّى تسع قائمتُه أعمدتَه الثلاثة** (مراجعة D-187): كان الشرطُ «md»،
   فعند ‏900 تظهر الرافدة ‏256px ويعود الصفّ ثلاثة أعمدة في ‏604px — عمود الأفعال ‏0px،
   و«افتحه على LinkedIn» خارج الحافّة، والصفحة تتمرّر جانبًا ‏154px حتّى ‏1100. فيُسأل عرض
   القائمة نفسِها («CQ.npRow» في «tokens.ts»)، ويقيس «audit_mobile» الفيض عند ‏900 و‏960. */
@container np-list ${narrower('npRow')}{
  .np-row{grid-template-columns:minmax(0,1fr); gap:var(--s-3)}
  .np-when{flex-direction:row; flex-wrap:wrap; align-items:baseline; gap:var(--s-2)}
  .np-under{flex-direction:row; flex-wrap:wrap; align-items:center}
}
@media${below('md')}{.np-grid-clip{grid-template-columns:repeat(2,minmax(0,1fr))}}

/* ══ عُدّةُ المكوّنات: ما بقي منها (خطّة التصميم 7 · D-189) ════════════════════════
   الزرّ والشارة والبطاقة والتبويب والمقطع والحقل والإشعار والحالة الفارغة في مواضعها
   أعلاه؛ وهنا العدد والحوار والورقة وبدائيّات التخطيط والألوان القسريّة. ودوالُّها في
   «components/*.ts» — دالّة لكلّ مكوّن وعائلة أصناف واحدة بادئتُها اسمُه. */

/* ── العدد (7.2): رقمٌ ‏١٣px بوزن ‏٦٠٠ على «--surface-3» بحبر «--ink-2»، ويعني «ينتظرك» وحدَها.
   كان يُكتب ثلاث مرّات بقيَم تتقارب (الرافدة وتبويب الفرز ورأس المنصّة)، فصار قاعدةً واحدة */
.count{display:inline-flex; align-items:center; justify-content:center; min-width:var(--s-5);
  padding:0 var(--s-2); border-radius:var(--r-pill); background:var(--surface-3); color:var(--ink-2);
  font-size:var(--t-caption); line-height:var(--lh-caption); font-weight:600}
.count.bad{background:var(--bad-wash); color:var(--bad)}

/* ── الحوارُ والورقة (7.9): «<dialog>» أصليّ — يحبس التركيزَ ويُغلَق بـEsc بلا سطرٍ منّا ──────
   على «--dialog» بحدّ «--line» فوق ستارة «--scrim» (3.7)، وعرضُه الأقصى ‏30em (‏٤٨٠ عند ‏١٦px)،
   وفعل أوّليّ واحد و«إلغاء». **وعلى الجوّال ورقة من أسفل الشاشة** بعرضها ومقبض ونصف قطر ‏١٦
   في زاويتيها العلويّتين («--r-sheet»)، وتحت الإبهام لا وسط الشاشة. */
.dlg{width:calc(100% - 2 * var(--gutter)); max-width:30em; padding:var(--pad-card); color:var(--ink);
  background:var(--dialog); border:var(--bd); border-radius:var(--r-card); box-shadow:var(--sh-3)}
.dlg::backdrop{background:var(--scrim)}
.dlg-t{margin:0 0 var(--s-3); font-size:var(--t-h3); line-height:var(--lh-h3); font-weight:600}
.dlg-body{font-size:var(--t-body); line-height:var(--lh-body); color:var(--ink-2)}
.dlg-foot{display:flex; flex-wrap:wrap; gap:var(--s-2); margin:var(--s-6) 0 0}
.dlg-grip{display:none}
@media${below('sm')}{
  .dlg.sheet{width:100%; max-width:100%; margin:auto 0 0; border-bottom:0;
    border-radius:var(--r-sheet) var(--r-sheet) 0 0;
    padding-bottom:calc(var(--pad-card) + var(--safe-b))}
  .dlg.sheet .dlg-grip{display:block; width:var(--s-10); height:var(--s-1); margin:0 auto var(--s-3);
    border-radius:var(--r-pill); background:var(--line)}
}

/* ── بدائيّاتُ التخطيط والمسافة (خطّة التصميم 3.3 · D-189) ─────────────────────────────
   كانت ‏٨٩ سِمة «style=""» في الوسم تكتب هامشًا أو حشوًا أو فجوةً بيدها — **ولا يراها مدقّق
   ولا ثيم**، وسِمة ثالثة في السياسة (D-150). فصارت أصنافًا من السلّم نفسِه، و«audit_classes»
   يردّ «style=""» فيه هامش أو حشو أو فجوة أو عرض بالبكسل. **و«!important» هنا قصد لا عجلة**:
   الصنف يحلّ محلّ سِمة كانت تغلب كلّ قاعدة (‏«.card > .hint» مثلًا)، فيغلب كما كانت تغلب.
   ‏«.stack» عمود و«.split» طرفان قائمان أعلاه؛ و«.cluster» صفّ يلتفّ. */
.cluster{display:flex; flex-wrap:wrap; align-items:center; gap:var(--s-2)}
.m-0{margin:0!important}
.bare{margin:0!important; padding:0!important; border:0!important}
.mt-1{margin-top:var(--s-1)!important} .mt-2{margin-top:var(--s-2)!important}
.mt-3{margin-top:var(--s-3)!important} .mt-4{margin-top:var(--s-4)!important}
.mt-5{margin-top:var(--s-5)!important} .mt-6{margin-top:var(--s-6)!important}
.mb-3{margin-bottom:var(--s-3)!important} .mb-4{margin-bottom:var(--s-4)!important}
.gap-1{gap:var(--s-1)!important} .gap-2{gap:var(--s-2)!important}
.nowrap{flex-wrap:nowrap!important}
.self-center{align-self:center!important} .self-end{align-self:flex-end!important}
.ta-end{text-align:end!important}
/* ‏وحقلٌ يأخذ ما بقي من صفّه بحدٍّ أدنى يسع عنوانًا — كان «flex:1;min-width:180px» و«220px».
   **واسمُه «grow-field» لا «fill»** (مراجعةُ D-189): «.fill» صنفُ مقياس الاستحقاق («.worth .fill»)،
   فكان حدُّه الأدنى بـ«!important» يغلب عرض الدرجة — ‏0.61 تُرسَم ممتلئةً على الحاسوب. */
.grow-field{flex:1 1 0; min-width:min(12em,100%)!important}

/* ── الألوانُ القسريّة (خطّة التصميم 9 · D-189) ─────────────────────────────────────────
   وضع التباين العالي في Windows يمحو الظلال والأرضيّات ويُلبس الصفحة ألوان النظام —
   **فمؤشّرٌ مرسومٌ بظلٍّ أو بأرضٍ يختفي**: المقطعُ المختار، وخطُّ الرافدة النحاسيّ، والنقطة،
   والمقياس. فكلّ مؤشّر حال أو تحديد هنا بحدّ أو حلقة بألوان النظام، ويُقاس بلقطة في
   Chromium بـ«forced-colors: active». وحلقة التركيز «outline» أصلًا فتبقى — **والحقلُ كان الاستثناء** («outline:none» وهالةٌ
   تُمحى)، فصار خطًّا صلبًا كسائرها (D-323). */
@media(forced-colors:active){
  .seg button[aria-pressed=true]{outline:var(--stroke) solid Highlight; outline-offset:calc(-1 * var(--stroke))}
  /* ‏والحدُّ الشفّافُ يُرسَم بلون النصّ في هذا الوضع — فيُمحى بلون الأرض، ويبقى خطُّ المختار وحدَه */
  .tab-item{border-bottom-color:Canvas}
  .tab-item[aria-current=page],.tab-item[aria-selected=true],.tab-item[aria-pressed=true]{border-bottom-color:Highlight}
  nav.tabs a[aria-current=page]::before,.todo .dot,.pill .led,.bar i,.bar-fill,.worth .fill{
    forced-color-adjust:none; background:CanvasText}
  nav.tabs a[aria-current=page]{outline:var(--ul) solid Highlight; outline-offset:calc(-1 * var(--ul))}
  .st,.count,.toast-note,.card-alert{border-color:CanvasText}
  :focus-visible{outline-color:Highlight}
  /* ‏والحقلُ المركَّز خطٌّ بلون النظام (D-323): «Highlight» صريحًا فلا يُترك لما يفرضه الوضع */
  input:focus,select:focus,textarea:focus{outline:var(--stroke) solid Highlight}
  /* ‏**ولحظةُ العلامة بألوانها** (مراجعة D-196): النقشُ يرسم أرضَه سمةً لا تُفرَض («fill» في SVG)،
     وأرض «.moment» تُفرَض Canvas ورمزُها CanvasText — فرُسم الرمز أسود على أرض النقش العميقة ‏١٫٤٦:١
     في التباين العالي الفاتح. وأزواجُها مقيسة في «MOMENT_PAIRS» (‏٧٫٥٨ فأكثر)، فتبقى كما هي */
  .moment{forced-color-adjust:none}
}

/* ══ الحقولُ على اللمس ═══════════════════════════════════════════
   **Safari يُقرّب الصفحةَ عند لمس حقلٍ خطُّه دون ‏١٦px** — سلوكٌ لا
   يُعطَّل إلّا بمنع التقريب كلِّه، ومنعُه يخالف WCAG 1.4.4. وثمنُه أنّ
   الصفحة تقفز وتكبر عند كلّ لمسة حقل، ثمّ يُصغّرها المالك بإصبعين.

   **وصار خطُّ الحقل ‏١٦ في كلّ عرض** (D-185 · نمطُ «input»): كان يُرفَع إلى ‏١٧٫٥ على
   اللمس وحده ويبقى ‏١٥٫٥ على الحاسوب، فلكلّ حقل قاعدتان تتباعدان. **و‏١٦ هي ما
   يكفي Safari**، فلا قاعدة للّمس في الحرف — وما بقي هنا للعرض لا للحرف.

   **والزرُّ ليس حقلًا** (D-183): كان معها، فصار الزرُّ على الهاتف ‏١٧٫٥px أكبرَ
   من الفقرة التي تشرحه، و«.sm» يبقى ‏١٤ بجانبه — تراتب مقلوب في السطر الواحد.
   ولا يُقرّب Safari زرًّا، **وهدف اللمس ‏٤٤px من «min-height» لا من الخطّ**. فالزرّ
   على اللمس بقياسه على الحاسوب.

   و«pointer: coarse» أدقّ من عرض الشاشة: لوح بقلم ليس هاتفا، وحاسوب
   بشاشة لمسيّة ليس شاشة فأرة.

   **وموضعُها بعد قاعدةِ الحقول لا قبلها**: تلك تختار بمحدّدات السمات
   فتغلب المحدّد العارِي مهما كان الوسيط — وقد جُرّب فبقي ‏١٤. */
@media(pointer:coarse){
  /* **وعرضٌ ثابتٌ يفيض حين يكبر الخطّ**: أُضيف الحدُّ هنا لا في كلّ حقل،
     فحقل يُكتب غدا بعرض ثابت يرثه. وقِيس فيض ١٢px عند ٣٢٠px قبله */
  input,select,textarea{max-width:100%}
  /* **وعنصرُ الشبكةِ المرنةِ لا ينكمش دون محتواه ما لم يُؤذَن له.**
     و«min-width» الافتراضيّة في flex هي «auto» = عرض المحتوى، فدَرَج
     خيارُه طويل يدفع صفَّه كلَّه خارج البطاقة. وقِيس: حقل ‏٢٩١px في
     حاوية ‏٢٣٨px — وهو مصدر الفيض بعد رفع الخطّ إلى ١٦ */
  /* **والزرُّ يُستثنى** (D-099): المحدّدُ «.row > *» أخصُّ من «button»،
     فكان يدهس «min-width: var(--tap)» — **ويسقط الزرّ دون هدف اللمس**.
     وقِيس: «حدّث» ‏٤٣×٤٤ عند ‏٣٢٠px، وحدُّه ‏٤٤.

     وعلّة لم تظهر إلّا بعد تبديل الخطّ (D-099): كان النصّ يبلغ ‏٤٤
     بعرضه، **فيستر النقص بلا أن يسدّه** — ونصّ أضيق بمحرف يكشفه.
     **والحارسُ لا يُغني عن الاستثناء**: هذا ما كان يُقاس صحيحا صدفةً.

     والإذن بالانكماش كان للحقول لا للأزرار: الدَّرَج الطويل هو الذي
     أفاض الصفّ (D-086)، وزرّ نصُّه كلمة لا يفيض. */
  .row > *:not(button):not(.btn),.field{min-width:0}
}
`

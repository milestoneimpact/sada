/** هيكل التطبيق: الرافدة والعلامة والشريط العلويّ والزجاج — الوحدةُ 2 من 14 في ورقة الأنماط، بترتيبها (`scripts/split_styles.mjs`). */
export const SHELL = `/* ══ هيكلُ التطبيق ═══════════════════════════════════════════ */
/* **«dvh» لا «vh»** (D-086): يحسب iOS مئةً من «vh» بلا شريطِ المتصفّح،
   فيمتدّ العمود تحته ويُقطَع أسفلُه. و«dvh» تتبع المرئيّ وهو يتحرّك.
   والسطر الأوّل احتياط لمتصفّح لا يعرفها — يقرؤه ثمّ يدهسه الثاني. */
.app{display:grid; grid-template-columns:var(--rail-w) 1fr; min-height:100vh; min-height:100dvh}

/* ── الرافدة ───────────────────────────────────────────────── */
.rail{background:var(--surface); border-inline-start:var(--bd); display:flex;
  flex-direction:column; position:sticky; top:0; height:100dvh; overflow-y:auto; color:var(--ink)}
/* وكان على الحافّة الداخليّة خيطُ ذهبٍ (::after)؛ نزعته الطبعةُ الرابعة، فلا
   قاعدة له (D-144 · D-148). */
.rail-head{padding:var(--s-6) var(--s-5) var(--s-4); display:flex; align-items:center; gap:var(--s-3)}
/* ‏مبدّلُ المنظّمة تحت العلامة (‏scope.ts): اسمُها ثمّ نوعُها وعلاماتُها، وقائمتُه بعرض الرافدة */
.scope{display:block; margin:0 var(--s-3) var(--s-2)}
.scope-btn{display:flex; align-items:center; gap:var(--s-2); min-height:var(--tap); padding:var(--s-2) var(--s-3);
  border:var(--bd); border-radius:var(--r-control); background:var(--surface); color:var(--ink-2); cursor:pointer}
@media(hover:hover){.scope-btn:hover{background:var(--hover)}}
.scope-t{display:flex; flex-direction:column; min-width:0; flex:1}
.scope-t b{font-size:var(--t-ui); line-height:var(--lh-ui); font-weight:600; color:var(--ink);
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
.scope-t span{font-size:var(--t-small); line-height:var(--lh-small)}
.scope .menu-caret svg{width:var(--icon-sm); height:var(--icon-sm)}
.scope[open] .menu-caret{transform:rotate(180deg)}
.scope > .menu-list{inset-inline:0; width:auto; min-width:0; max-width:none}
/* ── العلامة ──────────────────────────────────────────────────────────
   الأقواس نفسها التي في رمز التبويب، مرسومةً لا مكتوبة. وكانت مربّعا
   فيه «صدى» بخمسة عشر بكسلا: **الحرفان يزدحمان في ستّ وثلاثين**،
   فيُقرأ المربّع لطخةً — وهي عين العلّة التي مُنعت في رمز التبويب. */
/* والعلامةُ وحدها تجمع اللونين: نعناعٌ على عمقٍ ثابتان في الوضعين («MARK»، D-196؛ وكانا حبرًا
   ونحاسًا منذ D-144) — ولا يتكرّر هذا الجمع في موضع آخر، فيبقى للعلامة معناها، **وهي أوّل
   مواضع الذهب الثلاثة في الشاشة** (D-187). **وأرضُها العميقة على أرض الليل ‏١٫٣٤:١ — تذوب**،
   فحلقتُها «--mark-ring» ليلًا ‏٢:١ فأكثر (D-183) */
.glyph{display:grid; place-items:center; flex:none; width:var(--s-10); height:var(--s-10); border-radius:var(--r-control);
  background:var(--mark-bg); color:var(--mark-fg);
  box-shadow:var(--sh-1), 0 0 0 1px var(--mark-ring)}
/* نسبةٌ لا قياسٌ ثابت: العلامةُ نفسها تظهر بـ 38 في الرافدة و 50 في
   شاشة الدخول و 38 في الوثائق — وقياس ثابت يجعلها تسبح في الأكبر. */
.glyph svg{width:56%; height:56%; display:block}
.brand{min-width:0}
/* ‏والاسمُ «صدى» مسارٌ لا حرف (D-185): الكوفيُّ في الاسم وحده، بلا ملفّ خطّ. وارتفاعُه
   ارتفاع حروفه حين كانت تُرسَم بحجم ‏١٨ — والعرض يتبع نسبة المسار */
.wordmark{display:block; height:14px; width:auto; flex:none}
/* ‏والعلامةُ «صدى» وحدها (D-203)، وفي التجريبيّة وحدها شارةٌ عربيّةٌ صغيرةٌ بجانبها لا جزءٌ منها */
.brand span{font-size:var(--t-caption); line-height:var(--lh-caption); font-weight:600;
  display:inline-block; margin-top:var(--s-1);
  padding:0 var(--s-2); border-radius:var(--r-pill); color:var(--ink-2);
  border:var(--bd)}

nav.tabs{padding:var(--s-1) var(--s-3) var(--s-4); display:flex; flex-direction:column; gap:var(--s-0)}
nav.tabs .lbl{font-size:var(--t-caption); line-height:var(--lh-caption); padding:var(--s-4) var(--s-2) var(--s-1); color:var(--ink-2);
  font-weight:600}
nav.tabs .sep{display:none}
nav.tabs a{display:flex; align-items:center; gap:var(--s-3); padding:var(--s-2) var(--s-3);
  min-height:var(--tap); font-size:var(--t-ui); line-height:var(--lh-ui); font-weight:400; color:var(--ink-2);
  text-decoration:none;
  transition:background var(--dur-1) var(--ease), color var(--dur-1) var(--ease);
  border-radius:var(--r-control)}
nav.tabs a svg{width:var(--icon-sm); height:var(--icon-sm); flex:none; opacity:.7}
nav.tabs .tight{display:none}
@media(hover:hover){nav.tabs a:hover{background:var(--hover); color:var(--ink)}}
/* والحاليُّ يُعلَّم **بحدٍّ ولونٍ ووزن**: أرضيّةٌ خافتةٌ وحدها تختفي في
   وضع التباين العالي، وخطّ على الحافّة يبقى. **والرافدة ‏٤٠٠ والحاليّ وحده ‏٦٠٠**
   (D-185): رافدة كلُّها ثخينة تنافس المحتوى على العين. **والخطّ ذهبيّ: ثاني
   مواضع الذهب الثلاثة** (D-187 · D-196)، وفي شريط الجوّال مخفيّ حتّى المرحلة ٢ب.
   **ورمزُ الحاليّ بحبر الرابط** (D-196): نهارًا كان التركوازُ لا يُرى إلّا في الأزرار والروابط،
   فالهويّة في الصفحة تُقرأ زرًّا داكنًا على ورق. والرمز ليس نصًّا (‏3:1 على المحدَّد) ولا ذهبًا */
nav.tabs a[aria-current=page]{background:var(--selected); color:var(--ink); position:relative; font-weight:600}
/* ‏والحاليّ بأرض الهويّة الخافتة «--selected» (D-246)، والحدّ يبقى لوضع التباين العالي */
nav.tabs a[aria-current=page]::before{content:''; position:absolute; inset-block:var(--s-2);
  inset-inline-start:0; border-radius:var(--r-pill); width:var(--stroke); background:var(--au)}
nav.tabs a[aria-current=page] svg{opacity:1; color:var(--link)}
nav.tabs .count{margin-inline-start:auto}
nav.tabs a[aria-current=page] .count{background:var(--ink); color:var(--surface)}
/* سلّمُ الجاهزيّة (D-158): بطاقةٌ تُطوى حين تتمّ درجاتُها كلُّها */
details.ladder>summary{cursor:pointer; list-style:none; margin-bottom:0}
details.ladder>summary::-webkit-details-marker{display:none}
details.ladder[open]>summary{margin-bottom:var(--s-3)}
details.ladder ol.steps.wiz li .btn{flex:none}
details.ladder ol.steps.wiz li.at .why{color:var(--ink-2)}
details.ladder .verdict{margin:0 0 var(--s-2); font-weight:600; color:var(--ink)}
details.ladder .verdict.bad{color:var(--bad)}


/* ── الشريط العلويّ ────────────────────────────────────────── */
.main{min-width:0; display:flex; flex-direction:column}
/* **اسمٌ لا يتصادم**: كان هذا الشريط يسمّى .bar وهو اسمُ مقياس المقدار
   (ارتفاعُه أربعة بكسل) — فكان المقياس يدهسه فينسحق الشريط إلى خيط.
   علّة لا يكشفها اختبار ولا مدقّق: الصفحة تعمل، والترويسة غائبة. */
.topbar{position:sticky; top:0; z-index:20; background:var(--bg);
  border-bottom:var(--bd); padding:0 var(--gutter); flex:none; display:flex;
  align-items:center; gap:var(--s-3); transition:box-shadow var(--dur-2) var(--ease);
  min-height:var(--topbar)}
/* ظلٌّ يظهر حين يكون فوقك محتوًى — إشارةٌ تُقرأ بلا وعي: الشريطُ يطفو
   فوق شيء، لا يجلس على أرض فارغة. ويُضاف بـ JS لأنّ CSS وحدها لا تعرف
   موضع التمرير. */
.topbar.lifted{box-shadow:var(--sh-2)}
/* ‏جرسُ الإشعارات (D-294): بابٌ بعدّاد وهدفُ لمسٍ كامل — أيقونةٌ واسمُها في aria-label (D-297: الكلمةُ المخفيّة كانت تُقاس نصًّا خارج صندوقه في شريط العودة) */
.bell{display:inline-flex; align-items:center; gap:var(--s-1); min-height:var(--tap); min-width:var(--tap); justify-content:center; padding:0 var(--s-2); border-radius:var(--r-control); color:var(--ink-2); text-decoration:none}
.bell .count{margin-inline-start:0}
/* ── الزجاجُ على ما يلصق (D-102) ──────────────────────────────────
   شريط لاصق بلون مصمت يُقرأ **لوحا ثانيا فوق الصفحة**. وطبقة يشفّ
   منها ما تحتها تقول «هذا فوق ذاك» بلا حدّ ولا ظلّ ثخين.

   **وخلف «@supports»**: متصفّحٌ لا يعرفها يرى «--bg» مصمتا كما
   يراه اليوم — ولا شيء ينكسر. والشفافيّة تُضاف هناك وحدَها، فلا يبقى
   لون نصف شفّاف بلا ضباب يسنده. */
@supports (backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)){
  /* **وعلى الشريط وحدَه — لا على الرافدة** (D-102).
     جُرّبت على الاثنين فسقط ‏٧٤ نصّا دون حدّ التباين: كانت الرافدة يومئذ ثيمًا
     ثالثًا داكنًا في النهاريّ، فشفّها أظهر الأرض الفاتحة تحت حبر فاتح (‏٢٫١٤:١).
     وهي اليوم من الثيم (D-144) وعلى «--bg» (D-187)، والرافدة لا يمرّ تحتها شيء
     فلا زجاج لها. والشريط يمرّ تحته المحتوى، وأرضُه من ثيم الصفحة نفسِه. */
  .topbar{
    background:color-mix(in srgb,var(--bg) 82%,transparent);
    -webkit-backdrop-filter:blur(14px) saturate(1.4);
    backdrop-filter:blur(14px) saturate(1.4)}
}
/* العلامةُ في الشريط للجوّال وحدَه (D-123): رأسُ الرافدة يختفي هناك */
.topbar .glyph.tb{display:none; width:var(--s-8); height:var(--s-8); border-radius:var(--r-control)}
.topbar h1{font-size:var(--t-ui); line-height:var(--lh-ui); font-weight:600; color:var(--ink-2)}
/* ‏وتحت العنوان كلمةُ البيئة لا النطاقُ (D-308): «sada2.basserh.com» لغةُ النظام، و«تجريبيّ» كلمةُ الرافدة نفسُها */
.topbar .crumb{font-size:var(--t-small); line-height:var(--lh-small); color:var(--ink-2)}
/* ‏والعنوانُ والنطاقُ يُقصّان لا يدفعان «خروج» خارج الشاشة (D-177): بعد رفع الحرف فاض
   الشريط ‏6px عند ‏320 — والزرّ الذي خرج هو الذي يُطلَب حين يُطلَب */
.topbar h1,.topbar .crumb{overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
/* عنوانُ الشريط يظهر **حين يغيب عنوانُ الصفحة** لا قبله.
   وعنوانان متطابقان فوق بعضهما تكرار يُقرأ عيبا؛ وشريط لاصق بلا
   عنوان بعد التمرير يترك القارئ بلا موضع. فالظهور مربوط بالإشارة
   نفسها التي يظهر بها الظلّ: أنّ فوقك محتوًى. */
.topbar .ttl{min-width:0; opacity:0; transform:translateY(var(--s-1)); transition:opacity var(--dur-2) var(--ease-out), transform var(--dur-2) var(--ease-out)}
.topbar.lifted .ttl{opacity:1; transform:none}
.content{padding:var(--s-5d) var(--gutter) var(--s-12d); max-width:var(--shell); width:100%}

`

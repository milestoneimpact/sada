/** لحظة العلامة في الدخول والعامل الثاني — الوحدةُ 5 من 14 في ورقة الأنماط، بترتيبها (`scripts/split_styles.mjs`). */
import { atLeast, below } from '../tokens'

export const MOMENT = `/* ══ لحظةُ العلامة: الدخولُ والعاملُ الثاني (D-196 · نقشُ الصدى) ═════════════════════
   السطح العميق ثابت في الثيمين كأرض العلامة، والنموذج على أرض الثيم بجانبه. **والنقش
   في لوحته وحدها**: لا يمرّ خلف حقل ولا نصّ، ولا يتحرّك. على الجوّال شريط فوق النموذج،
   ومن «md» لوحة قائمة في أوّل السطر (يمينًا) والنموذج في وسط ما بقي. **والقفل كما في
   اللوحة**: الاسم ثمّ الرمز في الشيفرة، فيقع الرمز يسارَه — الشعار لا يُقلَب مع الاتّجاه.
   **والنصُّ على العمق عاجيٌّ و«نعناعٌ فاتح» لا نعناع** (‏Lc ‏٦٣ لحرفٍ صغير) */
/* ‏**والشريطُ بارتفاعه لا بنصيب الشاشة** (مراجعة D-196): الصفّان كانا ضمنيَّين فوزّعت «min-height»
   فراغَها عليهما، فطال الشريط ‏٣٤٩px في ‏768×1024 والنموذج تحته */
.auth-split{display:grid; grid-template-columns:minmax(0,1fr); grid-template-rows:auto 1fr; min-height:100vh; min-height:100dvh}
.auth-split .auth{margin:var(--s-8) auto}
/* ‏والشريطُ تحت النصّ لا خلفه: الارتفاعُ الأدنى يترك له ربعَ الشريط الأسفل (‏٢٥٦ في ‏٣٩٠).
   وهو حاوية («moment») يُسأل عرضُها */
/* ‏شريطُ اليوم الأوّل (D-227): أرضُ اللحظة ونقشُها، بلا نصّ، ويختفي بعد أوّل مصدرٍ يُفهَم */
.first-band{height:10rem; overflow:hidden; margin-bottom:var(--s-6)}
.first-band .echo, .first-band svg{display:block; width:100%; height:100%}
@media print{.first-band{display:none}}
/* ‏والذهبُ ينتقل إلى الشريط في اليوم الأوّل: الرقمُ الأوّلُ صفرٌ لا يُبرَز، والميزانيّةُ ثلاثةٌ لا أربعة */
[data-pane="overview"]:has(>.first-band) .grid>.tile:first-child .kv-v{color:var(--ink)}
.moment{container:moment / inline-size; position:relative; overflow:hidden; isolation:isolate; background:var(--moment-ground);
  color:var(--moment-ink); padding:var(--s-6) var(--gutter); min-height:calc(var(--s-16) * 4);
  display:flex; flex-direction:column; align-items:flex-start; gap:var(--s-1)}
.moment .echo{position:absolute; inset:0; z-index:-1; pointer-events:none}
.moment .echo svg{display:block; width:100%; height:100%}
.moment .echo.wide{display:none}
.moment-id{display:flex; align-items:center; gap:var(--s-4); margin-bottom:var(--s-3)}
.moment-name{display:flex; flex-direction:column; align-items:center; gap:var(--s-1)}
.moment .wordmark{height:var(--s-6); color:var(--moment-ink)}
/* ‏والرمزُ هنا العلامةُ نفسُها بلونها («--mark-fg») — لا اسمٌ ثانٍ يفلت من عدّ الذهب (مراجعة D-196) */
.moment-glyph{display:block; height:var(--s-10); aspect-ratio:4/3; color:var(--mark-fg)}
.moment-glyph svg{display:block; width:100%; height:100%}
.moment-line{margin:0; font-size:var(--t-ui); line-height:var(--lh-ui); font-weight:400; color:var(--moment-ink)}
/* ‏**والقفلُ يصل مرّةً** (D-403): ظهورٌ هادئٌ بـ«--dur-4» للاسم والرمز ثمّ السطر — والنقشُ ثابتٌ لا يتحرّك.
   وحدَها الحركةُ فوق ‏٣٠٠ لأنّها لا تتكرّر، وتسكن لمن طلب تقليلَ الحركة (بالوسيط وبالمبدّل) */
@keyframes moment-in{from{opacity:0; transform:translateY(var(--s-1))}}
@media(prefers-reduced-motion:no-preference){
  :root:not([data-motion=reduced]) .moment-id{animation:moment-in var(--dur-4) var(--ease-out) both}
  :root:not([data-motion=reduced]) .moment-line{animation:moment-in var(--dur-4) var(--ease-out) var(--stagger) both}
}
/* ‏**وعلى الشاشة القصيرة القفلُ وحده** (مراجعة D-196): الشريطُ ‏٢٥٦px أيًّا كان الارتفاع دفع الحقلَ وزرَّه
   تحت الطيّة في ‏375×548 (iPhone SE بشريط Safari)، ولم يُبق الهاتف أفقيًّا (‏844×390) إلّا الشريط
   والعنوان. فتحت ‏٤٠rem ارتفاعًا يسقط النقش والسطران، ويبقى القفل شريطًا عميقًا بقدره —
   **والفعلُ الأوّلُ وحقلُه في الشاشة الأولى**، ويقيسه «audit_mobile» في المقاسات الأربعة القصيرة */
@media${below('md')} and (max-height:40rem){
  .moment{min-height:0; padding-block:var(--s-4)}
  .moment .echo,.moment-line{display:none}
  .moment-id{margin-bottom:0}
  /* ‏وتنبيهُ الرمز الخاطئ يزيد صفًّا (‏2FA): الزرُّ الثاني كان على حافّة ‏548 تمامًا، والصعودُ ‏5px يدفعه تحتها */
  .auth-split .wrap{padding-top:var(--s-4)}
  .auth-split .auth{margin:var(--s-2) auto}
}
@media${atLeast('md')}{
  .auth-split{grid-template-columns:minmax(0,5fr) minmax(0,7fr); grid-template-rows:none}
  .auth-split .auth{margin:16vh auto}
  /* ‏والقفلُ في الثلث الأعلى والشريطُ يصعد إليه من الأسفل (مراجعة D-196: كان بينهما فراغٌ ميّت):
     صفّان مرنان قبل القفل وبعده بنسبة ‏٢ إلى ‏٥، لا مسافة خارج السلّم */
  .moment{display:grid; grid-template-rows:minmax(0,2fr) auto auto minmax(0,5fr); justify-items:start;
    align-content:stretch; padding:var(--s-12); gap:var(--s-2)}
  .moment-id{grid-row:2} .moment-line{grid-row:3}
  .moment .echo.wide{display:block}
  .moment .echo.narrow{display:none}
  .moment-glyph{height:var(--s-16)}
  .moment .wordmark{height:var(--s-10)}
  .moment-line{font-size:var(--t-body); line-height:var(--lh-body)}
}
/* ‏والورقُ أبيضُ بلا لحظة (D-125): النموذجُ وحدَه يُطبَع */
@media print{.moment{display:none} .auth-split{display:block}}

/* ── والرقمُ يصغر درجةً على الجوّال (D-136) — **من الرمز لا بقاعدة** (D-185) ──
   كانت قاعدةً بعد قاعدتَي الرقم، فغلبتها مرّةً بتساوي المحدّد (D-167). وصار السلّم
   يتبدّل تحت ‏600px («--t-display» ‏٣٢ و«--t-h1» ‏٢٤)، فلا قاعدة يُخشى ترتيبُها. */

/* المقياس **مقياسُ مقدار لا تصنيف**: هيئةٌ واحدة تتدرّج، ولا لونَ حالٍ فيه
   قطّ — حتّى يبلغ. والبلوغ حالة لا مقدار، فيقفز إلى الأحمر **ومعه نصّ**. */
.bar{height:var(--s-1); background:var(--surface-3); border-radius:var(--r-pill); overflow:hidden; margin-top:var(--s-3)}
.bar i{display:block; height:100%; border-radius:var(--r-pill); background:var(--accent); transition:width var(--dur-3) var(--ease-out)}
.bar i.full{background:var(--bad)}
/* اكتمالٌ لا بلوغُ سقف — خضرةٌ كعلامته تحته (D-134) */
.bar i.done{background:var(--ok)}
.cap{display:inline-flex; align-items:center; gap:var(--s-1); font-size:var(--t-caption);
  line-height:var(--lh-caption); font-weight:600; color:var(--bad); margin-top:var(--s-2)}
.cap.done{color:var(--ok)}

/* الفرقُ عن الأمس: علامةٌ **ونصّ** — والسهمُ وحده لا يُقرأ بصوتٍ عالٍ */
/* ‏والفرقُ جملةٌ («18٪ أكثر من أمس») لا لصيقة، فنمطُه «small» (D-185) */
.delta{display:inline-flex; align-items:center; gap:var(--s-1); font-size:var(--t-small);
  line-height:var(--lh-small); margin-top:var(--s-2); color:var(--ink-2)}
/* **والفرقُ مقدارٌ لا حالة** (D-123): كان الصاعدُ أخضرَ والهابطُ كهرمانا،
   والبطاقة إنفاق — **فإنفاق نزل يُقرأ تحذيرا وإنفاق صعد يُقرأ نجاحا**،
   وهو عكس ما يعنيه. وألوان الحالة محجوزة (D-043): السهم والنصّ يقولان
   الاتّجاه، والحبر يبقى حبرا. والصنفان يبقيان للاتّجاه لا للّون. */
.delta.up,.delta.down{color:var(--ink-2)}
.delta .ar{display:inline-flex}
/* والسهمُ مرسومٌ بقياس رمز الرقاقة (D-167): ‏١٤px كـ«.st-ic svg» (D-185) */
.delta .ar svg{width:var(--icon-xs); height:var(--icon-xs); display:block}

`

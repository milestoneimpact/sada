/** سجلّ الطبعات وما بقي منها — الوحدةُ 13 من 14 في ورقة الأنماط، بترتيبها (`scripts/split_styles.mjs`). */
import { atLeast, below } from '../tokens'

export const EDITIONS = `/* ══ سجلُّ الطبعات (D-139 … D-147)، وما بقي منها بعد التصفية (D-148) ═════
   كانت الطبعات تُكتب كتلًا آخر الورقة تغلب ما قبلها بالترتيب: الثانية
   (D-139: رتبة كبرى ‏٥٦، وأرض ليليّة أعمق)، وليل يُرى ذهبًا (D-142)،
   والثالثة (D-143: وجه عرض كوفيّ، وشريط مؤشّرات سطحًا واحدًا، وأفعال
   هادئة)، والرابعة (D-144: الحبر والنحاس، والرافدة من الثيم)، وهندسة نظرة
   عامّة ٢ (D-145). فصار ‏٤٩ محدّدًا يُعلَن مرّتين إلى خمس. وفي D-148 دُمجت
   القواعد في مواضعها الأولى **بعد أن قِيس أنّ الأنماط المحسوبة لكلّ عنصر في
   ‏٢٠ صفحةً × ‏٤ أنماط لم تتغيّر**، وحُذف ما كان ميتًا تحتها (أوهاج
   المؤشّرات، وحوافّ الليل الذهبيّة، وظلال البطاقات). وما بقي هنا قواعد لا
   موضع لها إلّا آخر الورقة: استعلامات الوسائط والتحويم، وقواعد الشاشة
   المستقلّة و«ما خرج» (D-140). وكانت فيه مجموعة وجه العرض الكوفيّ (D-143 ثمّ D-144)،
   وحُذفت مع «--font-display» (D-185). والقرارات بأسبابها في DECISIONS.md. */

/* ‏وكانت هنا «الرتبةُ الكبرى على العريض» (D-139): عنوانُ الصفحة والرقمُ الأوّل ‏٥٦px.
   حُذفت مع السلّم القديم (D-185): العنوان ‏٢٨ والرقم البطل ‏٤٠ من رمزيهما في كلّ عرض. */


/* ── «ما خرج»: صفوفٌ لا بطاقاتٌ في بطاقة (D-140) ──────────────────────── */
.slices{display:flex; flex-direction:column}
.slice{display:flex; align-items:center; gap:var(--s-4); flex-wrap:wrap;
  padding:var(--s-3) 0; border-bottom:var(--bd-soft)}
.slice:last-child{border-bottom:0}
.slice-id{display:flex; align-items:center; gap:var(--s-3); flex-wrap:wrap; min-width:0}
.slice h3{font-size:var(--t-ui); line-height:var(--lh-ui); font-weight:600}
.slice .stats{margin:0; margin-inline-start:auto; padding:0; border-top:0}
.slice .chip{margin:0}


/* ── شريطُ المؤشّرات: سطحٌ واحدٌ وخيوط (D-143) ───────────────────────────
   بطاقة كسائر البطاقات (D-187): حدُّها «--line» وظلُّها الأوّل. وكان رأسُها نحاسيًّا
   (‏2px) — نحاس على حدّ بطاقة — فسقط، وبقي في الرقم البطل وحدَه. */
.grid.tiles{gap:1px; padding:0; background:var(--line); overflow:hidden}
.grid.tiles>.tile{border:0; border-radius:0; box-shadow:none; background:var(--surface);
  background-image:none; padding:var(--s-5d) var(--s-5d)}
@media(hover:hover){.todo>li>a.btn:hover,.todo>li>form .btn:hover{background:var(--hover);
  border-color:transparent}}

`

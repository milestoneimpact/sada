/**
 * رموزُ التصميم — والثيمان من قيَمٍ واحدة.
 *
 * ## لماذا الرموز لا الألوان
 *
 * كلُّ قاعدةٍ في `styles.ts` تكتب `var(--…)` ولا تكتب لونا. فالثيمُ
 * يُقلَب بإعادة تعريف القيَم هنا وحدها — لا بنسخِ ورقةِ أنماطٍ ثانية
 * تتباعد عن الأولى مع كلّ تعديل.
 *
 * ## الذهب يتبدّل بين الثيمين — وهذا ليس تنازلا عن الهويّة
 *
 * ذهبُ الهويّة `#d4af37` يقرأ على الداكن (‏٩٫٤:١) ولا يقرأ على الأبيض
 * (‏١٫٩:١ — نصفُ ما تشترطه WCAG). فالنهاريُّ يأخذ ذهبا أغمق `#8a6d1f`،
 * وهو **الذهبُ نفسه أُنقص ضوؤه** لا لونٌ آخر.
 *
 * وهذا ما لا تكشفه لقطةُ شاشة: النصُّ يبدو ظاهرا لعينٍ سليمة في ضوء
 * غرفة، ويختفي في الشمس. فيُقاس بـ `npm run contrast` لا بالعين.
 *
 * ## ثلاثةُ أسطحٍ لا اثنان
 *
 * الرافدةُ والشريطُ العلويّ على `--chrome`، والمحتوى على `--bg`،
 * والبطاقاتُ على `--surface`. **وثلاثةُ مستوياتٍ هي ما يصنع هيكل
 * التطبيق**: لوحةٌ كلُّ شيءٍ فيها على أرضٍ واحدة تبدو صفحةً لا نظاما.
 */

export const TOKENS = `
/* THEME:light */
:root{
  /* الأرض: رماديّةٌ دافئة لا بيضاء ناصعة — البياضُ المطلق يُتعب في
     الجلسة الطويلة، والدفءُ يسند ذهب الهويّة */
  --bg:#f6f6f3;
  --chrome:#ffffff;
  --surface:#ffffff; --surface-2:#f4f4f1; --surface-3:#eeede8;
  --line:#e2e0d8; --line-soft:#eeece5; --line-strong:#d3d0c5;
  --ink:#16181c; --ink-2:#495460; --ink-3:#5e6771;
  --gold:#8a6d1f; --gold-soft:#a8862c; --gold-deep:#6d5518; --on-gold:#ffffff;
  --gold-wash:#faf6ea;
  /* حالاتٌ محجوزة: لا تُستعمل لسلسلةٍ ولا زينة. والأحمر والأخضر
     متقاربان في عمى الألوان — ولذلك **كلّ حالة تحمل رمزا ونصّا** */
  --ok:#1c7a52; --warn:#8a5a00; --bad:#b3261e;
  --ok-wash:#eef7f2; --warn-wash:#fdf6e8; --bad-wash:#fdf0ef;

  --r-sm:8px; --r:10px; --r-lg:14px; --r-xl:18px;
  --sh-1:0 1px 2px rgba(22,24,28,.05);
  --sh-2:0 1px 3px rgba(22,24,28,.07), 0 8px 24px rgba(22,24,28,.05);
  --sh-3:0 12px 32px rgba(22,24,28,.10);
  --ring:rgba(138,109,31,.30);
  color-scheme:light;
}

@media(prefers-color-scheme:dark){
  :root:not([data-theme="light"]){
    --bg:#070a0e;
    --chrome:#0c1219;
    --surface:#0f1620; --surface-2:#141d29; --surface-3:#1b2634;
    --line:#1f2c3b; --line-soft:#172230; --line-strong:#2a3a4c;
    --ink:#eaf0f7; --ink-2:#9fb0c3; --ink-3:#8b9cb0;
    --gold:#d4af37; --gold-soft:#e8cf76; --gold-deep:#8f6f18; --on-gold:#0a0d12;
    --gold-wash:#1a1608;
    --ok:#4bb98c; --warn:#e0a03a; --bad:#e8686f;
    --ok-wash:#0d1c17; --warn-wash:#1d160a; --bad-wash:#1e1012;
    --sh-1:0 1px 2px rgba(0,0,0,.4);
    --sh-2:0 1px 3px rgba(0,0,0,.45), 0 8px 24px rgba(0,0,0,.30);
    --sh-3:0 12px 32px rgba(0,0,0,.45);
    --ring:rgba(212,175,55,.36);
    color-scheme:dark;
  }
}

/* THEME:dark */
[data-theme="dark"]{
  --bg:#070a0e;
  --chrome:#0c1219;
  --surface:#0f1620; --surface-2:#141d29; --surface-3:#1b2634;
  --line:#1f2c3b; --line-soft:#172230; --line-strong:#2a3a4c;
  --ink:#eaf0f7; --ink-2:#9fb0c3; --ink-3:#8b9cb0;
  --gold:#d4af37; --gold-soft:#e8cf76; --gold-deep:#8f6f18; --on-gold:#0a0d12;
  --gold-wash:#1a1608;
  --ok:#4bb98c; --warn:#e0a03a; --bad:#e8686f;
  --ok-wash:#0d1c17; --warn-wash:#1d160a; --bad-wash:#1e1012;
  --sh-1:0 1px 2px rgba(0,0,0,.4);
  --sh-2:0 1px 3px rgba(0,0,0,.45), 0 8px 24px rgba(0,0,0,.30);
  --sh-3:0 12px 32px rgba(0,0,0,.45);
  --ring:rgba(212,175,55,.36);
  color-scheme:dark;
}
`

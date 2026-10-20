/** الوثائق والطباعة ولوحة الأوامر والتنبيهات والموعد — الوحدةُ 12 من 14 في ورقة الأنماط، بترتيبها (`scripts/split_styles.mjs`). */
import { below } from '../tokens'

export const EXTRAS = `/* ── الوثائق العامّة ──────────────────────────────────────────────────
   عمود واحد مقيَّد العرض: سطر يمتدّ عبر شاشة عريضة يُقرأ بعين تقفز،
   وهذه صفحة يُراد لها أن تُقرأ لا أن تُتصفَّح. */
.doc{max-width:51.25rem; margin:0 auto; padding:var(--s-10) var(--s-5) var(--s-16); background:var(--bg)}
.doc header{border-bottom:var(--bd); padding-bottom:var(--s-5); margin-bottom:var(--s-2)}
.doc .glyph{width:var(--s-10); height:var(--s-10); margin-bottom:var(--s-3)}
/* والوثيقةُ عمودُ قراءةٍ بعرض «--measure» (خطّة التصميم 5.4، القالب T5)، وأدوارُها
   أدوار اللوحة: عنوان الصفحة، وعنوان القسم، والمتن (D-185) */
.doc h1{font-size:var(--t-h1); line-height:var(--lh-h1); font-weight:600; margin:0 0 var(--s-2)}
.doc h2{font-size:var(--t-h2); line-height:var(--lh-h2); font-weight:600; margin:var(--s-8) 0 var(--s-2)}
.doc .lede{font-size:var(--t-body); line-height:var(--lh-body); color:var(--ink-2);
  margin:0 0 var(--s-3); max-width:var(--measure)}
.doc p{font-size:var(--t-body); line-height:var(--lh-body); color:var(--ink-2); margin:0 0 var(--s-3)}
.doc ul{margin:0 0 var(--s-3); padding-inline-start:var(--s-5)}
.doc li{font-size:var(--t-body); line-height:var(--lh-body); color:var(--ink-2); margin-bottom:var(--s-2)}
.doc b{color:var(--ink)}
.doc a{color:var(--link); text-underline-offset:var(--ul-off)}
.doc table{font-size:var(--t-small); line-height:var(--lh-small)}
.doc td b{font-weight:600}
/* «ما لا يقع» أبرزُ ما في الصفحة: هو ما يبحث عنه المراجع أوّلا */
.doc ul.never{list-style:none; padding:0; margin:0}
.doc ul.never li{background:var(--surface-2); border:var(--bd-soft);
  border-radius:var(--r-card); padding:var(--s-3) var(--s-3); margin-bottom:var(--s-2)}
/* مصطلحٌ لا يُكسَر عند شرطته: «AES-» في سطرٍ و«GCM» في التالي يُقرأ اسمين */
.doc .nb{white-space:nowrap}
.doc footer{margin-top:var(--s-10); padding-top:var(--s-4); border-top:var(--bd); font-size:var(--t-small); line-height:var(--lh-small)}

/* ── الطباعة ──────────────────────────────────────────────────────────
   مراجع منصّة قد يطبع سياسة الخصوصيّة، وصفحة تخرج برافدة وأزرار
   وظلال تُقرأ مسوّدةً لا وثيقة. فيبقى النصّ وحده على بياض.

   والروابط تُطبَع بعناوينها: ورقة فيها «اضغط هنا» لا تُتابَع. */
@media print{
  @page{margin:18mm}
  *{box-shadow:none!important; transition:none!important}
  html,body{background:#fff!important; color:#000!important}
  .rail,.topbar,.seg,.skip,footer,nav.tabs,button,.btn,form{display:none!important}
  .app{display:block}
  /* والهوامشُ من @page لا من الحاوية: حاويةٌ بلا حدٍّ أقصى تمدّ السطرَ
     عبر الورقة كلّها، وقيد المقاس على الفقرات يبقى قائما */
  .content,.doc{padding:0; margin:0; max-width:100%}
  .card,.ch,.draft{border:1px solid #ccc; break-inside:avoid; page-break-inside:avoid}
  section[data-pane][hidden]{display:none!important}
  h1,h2,h3{break-after:avoid; page-break-after:avoid}
  a[href^="http"]::after{content:' (' attr(href) ')'; font-size:var(--t-caption); color:#555}
  .doc a[href^="mailto"]::after{content:''}
}

@media(prefers-reduced-motion:reduce){*{transition:none!important; scroll-behavior:auto!important}}

/* ── لوحةُ الأوامر (D-105) ────────────────────────────────────────────
   طبقة تعلو كلّ شيء وتحجب ما تحتها بلا أن تمحوه: الحجاب يقول «أنت
   في مكان مؤقّت»، **وشاشة تُبدَّل بالكامل تقول إنّك انتقلت** — ولم
   تنتقل بعد.

   وتُثبَّت في الثلث الأعلى لا في المنتصف: المنتصف يجعل القائمة تنمو
   في الاتّجاهين فتقفز أوّل نتيجة مع كلّ حرف. **والعين تلاحق ما
   يقفز ولا تقرؤه.** */
/* **و«hidden» تُهزَم صامتةً** (D-105).

   قاعدة المتصفّح «[hidden]{display:none}» من أصل أدنى، **وأيّ قاعدة
   مؤلّف تضع «display» تغلبها**. فحجاب اللوحة كُتب «display:flex» ورُسم
   «hidden» — **فظهر على كلّ صفحة عند التحميل**، والسمة موجودة تُقرأ
   في المصدر فتُصدَّق.

   وهي علّة لا تُمسَك بقراءة الوسم: الوسم صحيح. **فتُقفَل هنا مرّةً
   للكلّ** — لا بقاعدة لكلّ صنف يُكتب غدا فيُنسى في واحد. */
/* **وفقرةٌ في بطاقةٍ بلا صنفٍ ترث قاعدةَ المتصفّح** — «margin:1em» = ‏١٤px،
   وليست من السلّم. ولم يُلحَظ ذلك قبل لأنّ كلّ فقرة كانت تحمل صنفا؛
   **وأوّلُ فقرةٍ عاريةٍ كُتبت أظهرتها**. فتُقيَّد هنا لا في موضعها. */
/* ‏فقرةُ البطاقة العامّة — لا فقراتُ ما نُقل إليها في ٢ج (ملحوظةُ القناة وسببُ المسوّدة ومتنُ المعاينة لها
   قياسُها)، و«:where» يُبقي الوزن ‏(0,1,1) كما كان فلا يغلب صنفًا كان يغلبه */
.card:where(:not(.ch,.draft,.pv)) > p{margin:var(--s-3) 0 0; font-size:var(--t-small); color:var(--ink-2);
  line-height:var(--lh-small); max-width:var(--measure)}
.card:where(:not(.ch,.draft,.pv)) > h2 + p{margin-top:var(--s-2)}

/* ── صندوقُ التنبيهات (D-109) ─────────────────────────────────────────
   صفّ لكلّ ما خرج: حالُه ومتنُه ورمز الردّ. **والحال لون ورمز ونصّ**
   (D-043) — ‏٤٠٤ حمراء وحدَها لا تُقرأ، ومعها «✕ نشر فشل» تُقرأ. */
.ax{margin:var(--s-3) 0 0; padding:0; list-style:none;
  display:flex; flex-direction:column; gap:var(--s-2)}
.ax-r{display:flex; align-items:center; gap:var(--s-2); flex-wrap:wrap;
  padding:var(--s-2); border:var(--bd-soft)}
/* ‏والمتنُ يلتفّ ولا يُقصّ (D-185): يُقتضَب في الخادم إلى سبعين حرفًا، فقصُّه بالنقاط
   فوق ذلك يُخفي آخر ما بقي — وبحرف ‏١٤ صار يُقصّ ‏٩٥px («measure_text») */
.ax-b{min-width:0; flex:1 1 14rem; font-size:var(--t-small); line-height:var(--lh-small); color:var(--ink-2);
  overflow-wrap:anywhere}
.chip.bad{color:var(--bad); background:var(--bad-wash);
  border-color:color-mix(in srgb,var(--bad) 28%,transparent)}

/* ── اليومُ الأوّل (D-108) ─────────────────────────────────────────────
   خطوات مرقّمة لا بطاقات: **الترتيب هو المعلومة** — كلّ خطوة تفتح
   التي بعدها، وشبكة من خمس تقول «افعل أيَّها شئت» وهو ليس صحيحا.


/* ── الموعدُ بوجهين (D-106) ───────────────────────────────────────────
   سطر فوق سطر: توقيت الرياض كما كتبه الخادم (D-201)، وتحته قراءة متصفّح في منطقة أخرى. **ولا
   يُصدَّق أحدُهما على حساب الآخر** — فمن أخفى الثاني جعل المالك يحوّل
   ذهنيّا، ومن أخفى الأوّل محا الصيغة التي في القاعدة والتقارير.

   والمحلّيّ أخفت وأصغر: **هو الأليف الذي يُقرأ بلمحة**، والأوّل هو
   الذي يُنسَخ ويُقارَن. */
.when-t{display:inline-flex; flex-direction:column; gap:1px; vertical-align:middle}
.when-t .tz{font-size:var(--t-caption); line-height:var(--lh-caption); color:var(--ink-2); font-weight:600}

/* سطرُ الذروة — خبرٌ لا أمر، فبلا زرٍّ ولا لونِ حالة (D-043) */
.hint.peak{margin-top:var(--s-2); display:flex; align-items:center;
  gap:var(--s-2); flex-wrap:wrap}
.hint.peak .chip{margin:0}

/* سطرُ الجاهزيّة تحت زرَّي الصورة والمقطع (D-163) — نقاطٌ بلونها ورمزها
   وكلمتها، ثمّ سبب أوّل ساقطة ورابطُه. **ويأخذ سطرَه كاملًا** في صفّ
   «بلا صورة» المرن، فلا يزاحم الزرّ في سطره. وبلا لون الهويّة: الحال
   تُقال بألوان الحال وحدها */
.hint.ready{margin:var(--s-2) 0 0; display:flex; align-items:center;
  gap:var(--s-1) var(--s-2); flex-wrap:wrap; flex-basis:100%}
/* ورابطُ الإصلاح بحبر الرابط كروابط الوثيقة — لا أزرقُ المتصفّح: الورقةُ
   لا تلوّن «a» عامّةً، فرابط بلا قاعدة يخرج بلون لا يعرفه الثيمان */
.hint.ready a{color:var(--link); font-weight:600; text-underline-offset:var(--ul-off)}

[hidden]{display:none!important}

.cmdk-veil{position:fixed; inset:0; z-index:100; padding:12vh var(--s-4) var(--s-4);
  display:flex; justify-content:center; align-items:flex-start;
  background:var(--scrim)}
@supports (backdrop-filter:blur(2px)){
  .cmdk-veil{backdrop-filter:blur(var(--ring-w))}
}
.cmdk{width:min(40rem,100%); max-height:76vh; display:flex; flex-direction:column;
  background:var(--dialog); border:var(--bd);
  border-radius:var(--r-card); box-shadow:var(--sh-3); overflow:hidden}
.cmdk-in{display:flex; align-items:center; gap:var(--s-3);
  padding:var(--s-3) var(--s-4); border-bottom:var(--bd)}
.cmdk-in input{flex:1; min-width:0; min-height:var(--tap); border:0; background:none; outline:none;
  font:inherit; font-size:var(--t-input); line-height:var(--lh-input); color:var(--ink)}
.cmdk-in input::placeholder{color:var(--ink-3)}
/* الحقلُ بلا حدٍّ فلا يتبدّل لونُه عند التركيز؛ خيطٌ تحته بحبر التركيز يقول «هنا» (D-149) —
   وكان نحاسيًّا، فصار حبر التركيز نفسَه (D-187) */
.cmdk-in:focus-within{box-shadow:inset 0 calc(-1 * var(--stroke)) 0 var(--focus)}
.cmdk-l{flex:1; margin:0; padding:var(--s-2); list-style:none; overflow-y:auto}
.cmdk-g{padding:var(--s-3) var(--s-3) var(--s-1); font-size:var(--t-caption);
  line-height:var(--lh-caption); font-weight:600; color:var(--ink-2)}
/* الخيارُ رابطٌ يبقى رابطا: يُفتَح بالوسط ويُنسَخ عنوانُه كأيّ رابط */
.cmdk-o{display:flex; align-items:center; gap:var(--s-3); text-decoration:none;
  padding:var(--s-2) var(--s-3); border-radius:var(--r-control); color:var(--ink);
  min-height:var(--tap); transition:background var(--dur-1) var(--ease)}
/* **والمختارُ يُعلَّم بأكثرَ من لون** (D-043): أرضيّةٌ وشريطٌ جانبيّ،
   فمن لا يميّز اللون يرى الشريط. */
.cmdk-o[aria-selected="true"]{background:var(--surface-2);
  box-shadow:inset calc(-1 * var(--ring-w)) 0 0 var(--brand)}
@media(hover:hover){.cmdk-o:hover{background:var(--hover)}}
.cmdk-i{flex:none; display:grid; place-items:center; width:var(--icon-md); color:var(--ink-3)}
.cmdk-i svg{width:var(--icon-md); height:var(--icon-md); display:block}
.cmdk-o[aria-selected="true"] .cmdk-i{color:var(--brand)}
.cmdk-t{min-width:0; display:flex; flex-direction:column; gap:1px}
.cmdk-t b{font-size:var(--t-ui); font-weight:600; line-height:var(--lh-ui);
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
.cmdk-t em{font-style:normal; font-size:var(--t-small); line-height:var(--lh-small); color:var(--ink-2);
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
.cmdk-none{margin:0; padding:var(--s-6) var(--s-4); text-align:center;
  font-size:var(--t-small); line-height:var(--lh-small); color:var(--ink-2)}
.cmdk-foot{display:flex; align-items:center; gap:var(--s-3); flex-wrap:wrap;
  padding:var(--s-2) var(--s-4); border-top:var(--bd);
  background:var(--surface-2); font-size:var(--t-small); line-height:var(--lh-small); color:var(--ink-2)}
.cmdk-foot b{margin-inline-start:auto; font-weight:400; color:var(--ink-2)}
/* والمفتاحُ نمطُ «code» بخطّ الصفحة (D-185): «Ctrl K» نصٌّ لاتينيٌّ معزول، لا «⌘» ليس في Plex */
.kbd{display:inline-block; padding:0 var(--s-1); border-radius:var(--r-inline);
  border:var(--bd); background:var(--surface);
  font-family:inherit; font-size:var(--t-code); line-height:var(--lh-code); font-weight:400;
  color:var(--ink-2); direction:ltr; unicode-bidi:isolate; white-space:nowrap}
/* والزرُّ يقول اختصارَه: اختصارٌ لا يُعلَن لا يعرفه إلّا من كتبه */
/* وارتفاعُه ارتفاعُ جاره: قِيس زرُّ الخروج ‏٤٤ وهذا ‏٣٤، **وزرّان
   متجاوران بارتفاعين يُقرآن رتبتين** — ولا رتبة بينهما. و‏٤٤ هدف
   اللمس الأدنى (D-102) لا اختيار ذوق. */
.cmdk-open{display:inline-flex; align-items:center; gap:var(--s-2); min-height:var(--tap);
  border:var(--bd); background:var(--surface-2); cursor:pointer; color:var(--ink-2);
  font:inherit; font-size:var(--t-ui); line-height:var(--lh-ui); font-weight:400;
  transition:border-color var(--dur-1) var(--ease), color var(--dur-1) var(--ease);
  border-radius:var(--r-pill); padding:0 var(--s-4)}
@media(hover:hover){
  .cmdk-open:hover{border-color:var(--field); color:var(--ink-2)}
}
/* والابنُ المباشرُ وحدَه: رمزُ البحث ‏١٦ بجوار نصٍّ ‏١٥ (خطّة التصميم 3.4) */
.cmdk-open>svg{width:var(--icon-sm); height:var(--icon-sm); display:block}
@media${below('sm')}{
  .cmdk-veil{padding:var(--s-4) var(--s-3)}
  .cmdk-open span{display:none}
}

`

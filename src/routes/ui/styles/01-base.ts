/** الأساس: الصندوق والخطّ وحلقة التركيز والطيّ والعنوان واللمس — الوحدةُ 1 من 14 في ورقة الأنماط، بترتيبها (`scripts/split_styles.mjs`). */
export const BASE = `
*{box-sizing:border-box; scrollbar-width:thin; scrollbar-color:var(--line) transparent}
/* ── الخطُّ زوجٌ واحدٌ ووزنان (D-185) ──────────────────────────────────
   «font-synthesis:none» على الجذر: طلب وزن لم يُحمَّل لا يُصطنَع بتغليظ الحروف
   رقميّا — والعربيّة المصطنَعة الثخانة تلتصق نقاطُها وتُقرأ ملطّخة. والسلّم لا
   يطلب إلّا ‏٤٠٠ و‏٦٠٠، و«audit_scale» يُسقط ما سواهما. */
html{font-family:var(--font-ui); font-synthesis:none; scroll-behavior:smooth;
  /* ما يُركَّز أو يُقصَد بمرساةٍ لا يختفي خلف الشريط اللاصق ولا شريط الجوّال (D-149) */
  scroll-padding-top:calc(var(--topbar) + var(--s-3)); scroll-padding-bottom:calc(var(--tap) + var(--s-6))}
body{
  margin:0; color:var(--ink); direction:rtl;
  /* ‏غسلةُ هويّةٍ واحدةٌ أعلى الصفحة (صفاء): ‏٧٪ من التركواز تخبو قبل منتصف الشاشة — لا تدرّجَ غيرُها على الأرض */
  /* ‏وقياسُها من نافذة العرض لا نسبةٌ من طول الصفحة (D-365): ‏120٪ من صفحةٍ طويلة كانت تمدّها حتّى أسفلها */
  background:radial-gradient(120vw 60vh at 50% -6vh,var(--tint-wash),transparent 70%) var(--bg) no-repeat;
  /* المتنُ هو الأصل، وكلُّ دورٍ يكتب حجمَه وسطرَه معًا (D-185): سطرٌ بالبكسل يُورَث
     بقيمته، فعنصر يكتب حجمًا بلا سطر يرث سطر أبيه ويخرج نمطًا خارج القائمة */
  font-size:var(--t-body); line-height:var(--lh-body); -webkit-font-smoothing:antialiased;
  font-feature-settings:"kern" 1;
}
/* وما يلبسه المتصفّحُ خطًّا أحاديًّا من عنده («code» و«kbd» و«pre») يرث خطَّ الصفحة:
   لا خطّ نظام في أيّ موضع (D-185) */
code,kbd,samp,pre{font-family:inherit}
/* وكان على الأرض وهجٌ نحاسيٌّ مثبَّتٌ تحت كلّ شيء («body::before» و«--bloom»)، فسقط
   مع المادّة كلِّها (خطّة التصميم 3.3 · D-187): **الورق ورق**، والنحاس لا يُسكَب أرضًا.
   وبقي سياق التكديس كما كان، فلا تتبدّل طبقة فوق أخرى. */
.app,.doc,.wrap{position:relative; z-index:1}
/* ── حلقةُ التركيز ────────────────────────────────────────────────────
   طبقتان: خطّ بحبر التركيز («--focus»، حبر الرابط) وحلقة بلون السطح تحته. فعلى
   الأرض يُرى الخطّ، وعلى ما يوافقه — زرّ أوّليّ مثلا — تُرى الحلقة. **ولا نحاس فيها**
   (D-187): كانت نحاسيّةً فتُعدّ موضعًا رابعًا في كلّ شاشة يُضغط فيها «Tab». */
:focus-visible{outline:var(--stroke) solid var(--focus); outline-offset:var(--stroke); border-radius:var(--r-inline);
  box-shadow:0 0 0 var(--s-1) var(--surface)}
/* والعنوانُ الذي يُركَّز عليه بالشيفرة عند فتح لوحٍ (tabindex=-1) يُعلَن لقارئ الشاشة
   ولا يُؤطَّر للعين (D-177): كان إطار ذهبيّ يحيط بعنوان ‏56px كلّما فُتح لوح من رابط */
[tabindex="-1"]:focus-visible{outline:none; box-shadow:none}

/* التحديدُ بأرضٍ زرقاءَ والحبرُ فوقها (خطّة التصميم 3.7): كان مزيجَ حبر الهويّة،
   فصار رمزًا يُقاس — «--ink» على «--selection» ‏١٣:١ نهارًا و‏٩:١ ليلًا */
::selection{background:var(--selection); color:var(--ink)}

/* وشريطُ التمرير يتبع الثيم: شريطٌ فضّيٌّ فاتح على لوحةٍ داكنة نشاز */
::-webkit-scrollbar{width:var(--s-3); height:var(--s-3)}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:var(--line); border-radius:var(--r-pill);
  border:var(--ring-w) solid transparent; background-clip:content-box}
@media(hover:hover){::-webkit-scrollbar-thumb:hover{background:var(--ink-3); background-clip:content-box}}
/* رابطُ التخطّي: يُقصّ ولا يُنفى خارج الشاشة.
   وكان عند right:-9999px، **فامتدّ المستند إلى 10389px** وصار الجوّال
   يُسحَب جانبا. وهي علّة لا تُرى: العنصر نفسه غير مرئيّ، وأثرُه
   شريط تمرير أفقيّ يظنّه الناظر عيبا في التخطيط.
   والقصّ يخفيه من العين ويبقيه لقارئ الشاشة — وذاك كلّ الغرض.
   **والقصُّ نفسُه لما يُقرأ ولا يُرى** («.vh»): اسمُ عمودِ الأفعال في الجدول (axe «empty-table-header»). */
.skip,.vh{position:absolute; width:1px; height:1px; overflow:hidden;
  clip-path:inset(50%); white-space:nowrap}
/* ‏والمقصوصُ نصٌّ من السلّم كغيره: لا يورث ‏2em و‏700 من «h1» ولا هوامشَ «p» */
.vh{margin:0; font-size:var(--t-small); line-height:var(--lh-small); font-weight:400}
.skip{
  background:var(--brand); color:var(--on-brand);
  padding:var(--s-3) var(--s-4); border-radius:var(--r-control); z-index:99; font-weight:600}
/* وحين يظهر يصير هدفا كاملا: من يتنقّل بلوحة المفاتيح على لوحٍ لمسيّ
   قد يلمسه بإصبعه — والقاعدة تنطبق حيث يُرى (D-086) */
.skip:focus{width:auto; height:auto; overflow:visible; clip-path:none;
  inset-inline-start:auto; inset-inline-end:var(--s-3); top:var(--s-2);
  display:inline-flex; align-items:center; min-height:var(--tap)}
.grow{flex:1}
/* ── لفظُ الطَيِّ واحدٌ لكلِّ مطويٍّ ──────────────────────────
   وسم summary لا يُعلن حالَه لقارئ الشاشة بنفسه، فالنّصّ يقوله
   — «افتح» مطويّاً و«أغلق» مفتوحاً. **والقاعدة على details لا على
   صنف بعينه**: حِين كانت مقصورةً على «.guide» و«.prow» وُلِد مطويّ ثالث
   يستعير الوسم فظهرت الكلمتان معاً (D-112). و«>summary» يمنع مطويّاً
   داخل مطويّ من أن يقلِب لفظ أبيه. */
details[open]>summary .lbl-open{display:none}
details:not([open])>summary .lbl-close{display:none}
/* والمَظهرُ معه واحدٌ: حبرُ الرابط وخطٌّ تحته، وسهمٌ ينقلِب. والسهمُ زينةٌ لا
   خبر — لذلك لا يُقرأ بصوت عال، واللفظ فوقه يقول ما يقوله السهم.
   **وهو زرٌّ هادئ** (D-183): «--link» ليلًا و«--ink-2» متقاربان ضوءًا (‏١٫٠٨:١)،
   ونهارًا هو حبر المتن — فالخطّ تحته هو العلامة لا اللون */
.g-tog,.ptog{flex:none; font-size:var(--t-ui); line-height:var(--lh-ui); font-weight:600; color:var(--link);
  text-decoration:underline; text-decoration-thickness:var(--ul); text-underline-offset:.3em;
  display:inline-flex; align-items:center; gap:var(--s-2)}
/* **والسهمُ حدودٌ لا حرف** (D-167): كان «▾»، وليس في الخطّ المضمَّن (ولا في Plex،
   D-185)، فيُرسَم بخطّ النظام ويختلف من جهاز لآخر (N-7). والمثلّث
   من حدَّين شفّافين وثالث بلون النصّ — بلا خطّ ولا صورة ولا سياسة مصدر. وقياسُه
   بالـem من رتبة اللصيقة: ‏٠٫٦ عرضًا و‏٠٫٤ ارتفاعًا. */
.g-tog::after,.ptog::after{content:''; font-size:var(--t-caption); width:0; height:0;
  border-inline:.3em solid transparent; border-block-start:.4em solid;
  transition:transform var(--dur-2) var(--ease)}
details[open]>summary .g-tog::after,details[open]>summary .ptog::after{transform:rotate(180deg)}
/* ── العنوانُ يُوزَن أسطرُه ─────────────────────────────────────────────
   «balance» توزّع كلمات العنوان على أسطره بالتساوي بدل أن تملأ الأوّل
   وتترك في الثاني كلمةً وحدها. **وعنوان من أربع كلمات ينكسر إلى ثلاث
   وواحدة يُقرأ مقطوعا** — والكلمة اليتيمة تُقرأ عنوانا ثانيا.

   والمتصفّح الذي لا يعرفها يلفّ كما يلفّ اليوم: **لا شيء ينكسر**.
   وحدُّها ستّة أسطر عند أكثر المحرّكات، وعناوينُنا دونها كلُّها. */
h1,h2,h3{margin:0; text-wrap:balance}
/* ‏أيقونةٌ تدلّ على جهةٍ تنعكس حين يُقرأ الوسمُ من اليسار (D-307): القسمُ الإنجليزيّ وأيُّ لغةٍ تُضاف */
[dir="ltr"] svg[data-dir="mirrors"]{transform:scaleX(-1)}
/* **والثخينُ ‏٦٠٠ لا «bold».** الافتراضيُّ يُحَلّ إلى ‏٧٠٠، وهو وزنٌ لا نحمّله
   (D-185): يُصطنَع أو يُقرَّب. **وللأرقام والأسماء داخل الجملة وحدها** (خطّة التصميم
   4.4/5) — لا لكلمات وسط الشرح. */
b,strong{font-weight:600}

/* ══ اللمس ══════════════════════════════════════════════════════
   **الإصبعُ ليس مؤشّرا** (D-086). عرضُه نحوَ ‏٤٥px، ولا يرى ما تحته.
   فهدف بارتفاع ‏١٦px يُصاب **بالمصادفة لا بالقصد** — وقد كان في اللوحة
   ثمانية منها، أضيقُها رابط «X» بعرض ‏١١px.

   والحدّ ‏٤٤×٤٤ من Apple HIG، وهو أشدّ من ‏٢٤×٢٤ عند WCAG 2.5.8 — وشدّتُه
   هي المرادة: الفرق بينهما هو الفرق بين «يمكن إصابتُه» و«يُصاب».

   ## والمنطقة تُمَدّ ولا يُكبَّر النصّ

   تكبير النصّ يبدّل الشكل ويكسر السلّم. فتُمَدّ منطقة اللمس بطبقة
   شفّافة فوق الرابط: **لا ترى العين فرقا، ويرى الإصبع هدفا كاملا.**
   والعرض يمتدّ إلى ‏٤٤px حين يكون النصّ أضيق منها. */
.tap{position:relative; display:inline-block; min-width:var(--tap); text-align:center; color:var(--link)}
/* **والامتدادُ رأسيٌّ لا أفقيّ.**
   طبقة أعرض من الرابط تخرج عن الصفحة فتصنع تمريرا أفقيّا — قِيس ‏١٢px
   عند ‏٣٢٠px، مصدرُها رابط «X» بعرض ‏١١ وطبقتُه ‏٤٤. فتُقصَر الطبقة على
   عرض الرابط («inset-inline» صفرا) ويُعطى الرابط عرضا أدنى في التخطيط.
   والفيض الرأسيّ لا يضرّ: الصفحة تُمرَّر رأسيّا أصلا. */
.tap::after{content:''; position:absolute; inset-inline:0; top:50%;
  transform:translateY(-50%); height:var(--tap)}

`

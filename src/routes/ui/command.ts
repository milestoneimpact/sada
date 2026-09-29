/**
 * لوحةُ الأوامر — **مدخلٌ واحدٌ إلى كلّ شيء** (D-105).
 *
 * ## ولماذا ليست مربّعَ بحث
 *
 * مربّعُ البحث يجد **ما هو موجود**. ولوحةُ الأوامر تجد **ما يمكن أن
 * يقع**: «اربط قناة» ليست نصّا في صفحة — هي فعلٌ لا يعرف المالكُ أين
 * يسكن.
 *
 * ## ولا تُنفَّذ من هنا — **تنقل إلى موضع الفعل**
 *
 * كلُّ مدخلٍ هنا **رابط**، ولا نموذجَ `POST` في اللوحة ولا زرَّ تنفيذ.
 * والسببُ حدٌّ لا ذوق: `D-006` يمنع الإنفاقَ الآليّ، و`D-008` يوجب أن
 * يُسجَّل ما يُدفَع قبل أن يُعدَّ ناجحا، و`D-009` يوجب اعتمادا بشريّا.
 * **ولوحةٌ تُنفق بضغطةٍ عمياءَ تخالف الثلاثةَ معا** — فتنقل إلى حيث
 * القيدُ والتأكيد، ويقع الفعلُ تحت حارسه.
 *
 * ## والفهرسُ يُبنى في الخادم — **والعميلُ يُخفي ويُظهر لا غير**
 *
 * كلُّ مدخلٍ مرسومٌ في الوثيقة، والتصفيةُ تقلب `hidden` عليه. **ولا
 * `innerHTML` في شيءٍ من هذا**: العميلُ لا يبني وسما، فلا سطحَ لحقنٍ
 * أصلا — وهي القاعدةُ التي يحرسها اختبارُ اللوحة منذ D-071.
 *
 * وثمنُه أنّ الفهرسَ محدود: **يُقاس ولا يُترك ينمو**. وثمانيةُ مسوّداتٍ
 * لا كلُّها، لأنّ D-101 قاست ما يفعله الشحنُ غيرُ المحسوب بالصفحة.
 */
import { escapeHtml } from './escape'
import { ICON } from './icons'

/**
 * طيُّ الحروف — **جدولٌ واحدٌ يقرؤه الخادمُ والعميل**.
 *
 * المالكُ يكتب «المصادر» ويكتبها «المصادر» بهمزةٍ أخرى، ويكتب «منصه»
 * بهاءٍ مكان التاء المربوطة. **وبحثٌ يفرّق بينها يبدو معطوبا لا دقيقا.**
 *
 * والجدولُ مصدَّرٌ لأنّ النصَّ يُطبَّع في مكانين: هنا على المفاتيح، وفي
 * المتصفّح على ما يكتبه المالك. **وطبعان مختلفان لا يلتقيان أبدا** —
 * فيُسلسَل الجدولُ إلى النصّ البرمجيّ، ولا يُكتب مرّتين.
 */
export const FOLD: readonly (readonly [string, string])[] = [
  ['أإآٱ', 'ا'],
  ['ىئ', 'ي'],
  ['ة', 'ه'],
  ['ؤ', 'و'],
]

/** التشكيلُ والتطويل — يُحذفان قبل المقارنة. */
export const STRIP_SRC = '[\\u064B-\\u0652\\u0640]'

const STRIP = new RegExp(STRIP_SRC, 'g')
const FOLD_RE = FOLD.map(([from, to]) => [new RegExp('[' + from + ']', 'g'), to] as const)

/** يطبّع نصّا للمقارنة — **ولا يُعرَض ناتجُه أبدا**، هو مفتاحٌ لا حرف. */
export function normalize(s: string): string {
  let out = s.toLowerCase().replace(STRIP, '')
  for (const [re, to] of FOLD_RE) out = out.replace(re, to)
  return out
}

/** مدخلٌ في اللوحة — **ورابطٌ دائما، ولا فعلَ يقع هنا**. */
export interface Command {
  readonly label: string
  /** سطرٌ يقول ماذا يقع عند الذهاب — لا وصفٌ للقسم. */
  readonly note: string
  readonly href: string
  readonly group: string
  /**
   * رمزُ المدخل — **وفارغٌ حيث لا يميّز**.
   *
   * أيقوناتُ الأقسام تسع مختلفات، وهي التي تربط سطرَ اللوحة بموضعه في
   * الرافدة **فتُقرأ خريطةً**. أمّا رمزٌ واحدٌ مكرَّرٌ ستَّ مرّاتٍ فوق
   * ستّة أفعال **فزينةٌ لا إشارة**: لا يفرّق بين سطرٍ وسطر، ويشحن
   * بايتاته في كلّ فتحةٍ للصفحة (D-101).
   */
  readonly icon: string
  /**
   * كلماتٌ تُبحَث ولا تُعرَض — **لاتينيّةٌ ومنقولة**.
   *
   * **ولوحةُ المفاتيح قد تكون إنجليزيّةً حين يُفتَح المدخل**: من ضغط
   * `⌘K` وهو يكتب رسالةً بالإنجليزيّة يكتب `posts` قبل أن يبدّل. وحرفٌ
   * لاتينيٌّ لا يجد شيئا يجعل اللوحةَ تبدو معطوبة.
   *
   * **والمنقولُ مثلُه**: قِيس بالتشغيل أنّ «درايف» لا تجد شيئا، والاسمُ
   * في الشاشة `Drive` باللاتينيّة. **ومن يكتب بالعربيّة يكتبها منقولةً**
   * — فتُفهرَس الصورتان.
   */
  readonly alias?: string
}

/** قسمٌ في الرافدة — **والجدولُ نفسُه يرسم الرافدةَ ويملأ اللوحة**. */
export interface Section {
  readonly id: string
  readonly label: string
  readonly note: string
  readonly icon: string
  readonly group: 'العمل' | 'الضبط'
  readonly alias: string
  /**
   * اسمٌ أقصرُ للرافدة.
   *
   * حيّزُ الرافدة ضيّق، **واللوحةُ تحتمل الوصف**: «التقرير» تكفي جنبَ
   * أيقونتها في عمودٍ عنوانُه «العمل»، و«التقرير الأسبوعيّ» هي التي
   * تُميَّز في قائمةٍ من عشرين سطرا. **والاسمُ يتبع موضعَه.**
   */
  readonly short?: string
  /**
   * أفي شريط الجوّال؟ (D-107)
   *
   * خمسةٌ لا تسع: شريطٌ بتسعةٍ في ‏٣٩٠px يعطي ‏٤٣px لكلٍّ — **دون هدف
   * اللمس**، ونصّا لا يُقرأ. **والخمسةُ هي التي تُفتَح كلَّ يوم**؛ وما
   * عداها يُبلَغ من «المزيد»، وهو بابُ لوحة الأوامر لا قائمةٌ ثالثة.
   */
  readonly bar?: true
  /** صفحةٌ مستقلّة لا لوحٌ في اللوحة — فرابطُها مسارٌ لا مرساة. */
  readonly page?: string
}

/**
 * الأقسام — **مصدرٌ واحدٌ للرافدة وللّوحة** (كما فُعل بالأيقونات في D-103).
 *
 * وقسمٌ يُضاف بعد شهرٍ في مكانٍ واحد **يظهر في الاثنين**. ولو كُتب
 * الفهرسُ يدا لبقي القسمُ الجديدُ خارجَه، **ولا حارسَ يمسك غيابا**: لوحةٌ
 * لا تجد قسما تبدو ناقصةَ الفهرسة لا معطوبة، فلا يُشتكى منها.
 */
export const SECTIONS: readonly Section[] = [
  { id: 'overview', label: 'نظرة عامّة', note: 'حالُ اليوم: ما أُنفق وما ينتظر قرارك', icon: ICON.overview, group: 'العمل', alias: 'overview home', bar: true },
  { id: 'sources', label: 'المصادر', note: 'ملفّاتُ Drive — ومسحُها وتحليلُها', icon: ICON.sources, group: 'العمل', alias: 'sources drive scan درايف ملفات' },
  { id: 'posts', label: 'المنشورات', note: 'المسوّداتُ والخطّة — وهنا يقع الاعتماد', icon: ICON.posts, group: 'العمل', alias: 'posts drafts plan مسودات خطه', bar: true },
  { id: 'channels', label: 'القنوات', note: 'ربطُ الحسابات وحالُ رموزها', icon: ICON.channels, group: 'العمل', alias: 'channels accounts link حسابات لينكدإن تويتر يوتيوب تيكتوك', bar: true },
  { id: 'pivot', label: 'الجدول المحوريّ', note: 'تختار الصفوفَ والأعمدةَ والقياس — وتقارن بنظرة', icon: ICON.pivot, group: 'العمل', alias: 'pivot table analysis لوح محوري جدول تحليل مقارنه', short: 'اللوح' },
  { id: 'report', label: 'التقرير الأسبوعيّ', note: 'ما نُشر وما كلّف وما أعاد', icon: ICON.report, group: 'العمل', alias: 'report weekly تقرير اسبوعي', short: 'التقرير', bar: true, page: '/panel/report' },
  { id: 'tasks', label: 'ما عليك', note: 'المهامُّ اليدويّةُ التي لا يقدر عليها صدى', icon: ICON.tasks, group: 'الضبط', alias: 'tasks todo مهام', bar: true, page: '/panel/tasks' },
  { id: 'providers', label: 'المزوّدون', note: 'المفاتيحُ والتوجيهُ والأسعار', icon: ICON.providers, group: 'الضبط', alias: 'providers keys models مفاتيح نماذج انثروبيك جيميناي' },
  { id: 'settings', label: 'الحدود', note: 'سقفُ الإنفاق وعددُ التحليلات', icon: ICON.settings, group: 'الضبط', alias: 'settings limits budget ميزانيه اعدادات سقف' },
  { id: 'security', label: 'الأمان', note: 'الجلساتُ والمفاتيحُ وسجلُّ التدقيق', icon: ICON.security, group: 'الضبط', alias: 'security sessions passkeys جلسات مفاتيح مرور' },
]

/**
 * مرجعُ مسوّدةٍ في الفهرس — **ولا يُحمَل منها إلّا ما يُقرأ سطرا**.
 */
export interface DraftRef {
  readonly id: string
  readonly text: string
  readonly platform: string
}

/**
 * **وثمانيةٌ لا كلُّها** (D-101).
 *
 * كلُّ مسوّدةٍ في الفهرس بايتاتٌ تُشحَن في كلّ فتحةٍ للصفحة. ومئةُ مسوّدةٍ
 * تجعل اللوحةَ أثقلَ ممّا تنفع. **والثمانيةُ الأحدثُ هي التي يُبحَث عنها**
 * — وما قدُم يُبلَغ من قائمة المنشورات.
 */
export const DRAFT_CAP = 8

/** طولُ ما يُعرَض من نصّ المسوّدة — سطرٌ يُعرِّف، لا فقرةٌ تُقرأ. */
const SNIP = 52

function snippet(text: string): string {
  const one = text.replace(/\s+/g, ' ').trim()
  return one.length <= SNIP ? one : one.slice(0, SNIP - 1) + '…'
}

/**
 * يبني الفهرس.
 *
 * و`base` هي الفرقُ بين اللوحة وما سواها: في اللوحة تُقرأ المراسي
 * `#posts` **فيُبدَّل اللوحُ بلا تحميل**، وفي صفحةٍ أخرى لا لوحَ بهذا
 * الاسم — **فتُسبَق بالمسار**، وإلّا ذهب المالكُ إلى مرساةٍ لا وجودَ لها
 * في صفحته وبقي مكانَه (D-046: زرٌّ يعمل خطأً أسوأُ من زرٍّ لا يعمل).
 */
export function buildCommands(
  input: { readonly onPanel: boolean; readonly drafts?: readonly DraftRef[] } = { onPanel: true },
): Command[] {
  const base = input.onPanel ? '' : '/panel'
  const out: Command[] = SECTIONS.map((s) => ({
    label: s.label,
    note: s.note,
    href: s.page ?? `${base}#${s.id}`,
    group: 'الأقسام',
    icon: s.icon,
    alias: s.alias,
  }))

  /*
   * **والأفعالُ تُسمّى بفعلها لا بموضعها.**
   *
   * المالكُ لا يبحث عن «قسم المصادر» — يبحث عن «امسح Drive». والقسمُ
   * جوابُ «أين»، والفعلُ جوابُ «كيف»، **والثاني هو ما يُسأل**.
   *
   * ولا واحدةَ منها تفعل شيئا: كلُّها تنقل إلى حيث الزرُّ وحارسُه.
   */
  for (const a of [
    { label: 'امسح Drive', note: 'يقرأ الملفّاتِ الجديدةَ — والزرُّ في المصادر', id: 'sources', alias: 'scan drive درايف مسح' },
    { label: 'ولّد خطّةَ الأسبوع', note: 'نداءٌ مدفوع — يُطلَب من المنشورات', id: 'posts', alias: 'plan generate' },
    { label: 'اعتمد مسوّدة', note: 'القرارُ لك وحدَك — في المنشورات', id: 'posts', alias: 'approve draft' },
    { label: 'اربط قناةً جديدة', note: 'LinkedIn · X · YouTube · TikTok', id: 'channels', alias: 'connect account oauth ربط حساب' },
    { label: 'بدّل سقفَ الإنفاق', note: 'الحدُّ اليوميّ وعددُ التحليلات', id: 'settings', alias: 'budget cap spend ميزانيه انفاق سقف' },
    { label: 'راجع الجلسات', note: 'ما هو مفتوحٌ الآن، وإنهاؤه', id: 'security', alias: 'sessions revoke' },
  ]) {
    const section = SECTIONS.find((s) => s.id === a.id)
    if (section === undefined) continue
    out.push({
      label: a.label, note: a.note, group: 'الأفعال',
      href: section.page ?? `${base}#${a.id}`,
      icon: '', alias: a.alias,
    })
  }

  /*
   * **والمسوّدةُ تذهب إلى رحلتها لا إلى قائمتها** (D-104).
   *
   * من بحث عن مسوّدةٍ باسمها يسأل عنها هي: من أين جاءت وكم كلّفت.
   * **وإنزالُه في قائمةٍ من عشرين ليبحث عنها بعينه يُلغي فائدةَ البحث.**
   */
  for (const dr of (input.drafts ?? []).slice(0, DRAFT_CAP)) {
    out.push({
      label: snippet(dr.text),
      note: `مسوّدة · ${dr.platform} — إلى رحلتها`,
      href: `/panel/journey/${encodeURIComponent(dr.id)}`,
      group: 'المسوّدات', icon: '',
    })
  }

  return out
}

/** مفتاحُ البحث — **يُطبَّع في الخادم مرّةً، لا مع كلّ ضغطةِ مفتاح**. */
export function searchKey(c: Command): string {
  return normalize([c.label, c.note, c.group, c.alias ?? ''].join(' '))
}

/**
 * الزرُّ الذي يفتحها — **ومخفيٌّ حتّى يعمل النصُّ البرمجيّ**.
 *
 * زرٌّ يُرى ولا يفتح شيئا حين يُعطَّل `JavaScript` **عطلٌ يُشتكى منه**؛
 * وغيابُه ترْكٌ للرافدة تعمل عملَها كما كانت. فيُرسَم `hidden`، ولا
 * يرفعه إلّا النصُّ الذي يجعله يعمل.
 */
export function commandTrigger(): string {
  return `<button type="button" class="cmdk-open" hidden
    aria-haspopup="dialog" aria-controls="cmdk">
    ${ICON.search}<span>بحثٌ وأوامر</span><kbd class="kbd">${ICON.command}K</kbd></button>`
}

/**
 * «المزيد» في شريط الجوّال (D-107) — **وهو الزرُّ نفسُه بوجهٍ آخر**.
 *
 * خمسةُ أقسامٍ في الشريط وتسعةٌ في النظام. **وقائمةُ «مزيد» ثانيةٌ تُبنى
 * لأربعةٍ تبقى قائمةٌ تشيخ**: قسمٌ يُضاف غدا يدخل الرافدةَ واللوحةَ ولا
 * يدخلها. **واللوحةُ تفهرس التسعةَ أصلا** — فالمزيدُ بابُها لا قائمةٌ
 * ثالثة.
 */
export function commandMore(): string {
  return `<button type="button" class="cmdk-open more" hidden
    aria-haspopup="dialog" aria-controls="cmdk">
    ${ICON.more}<span>المزيد</span></button>`
}

/**
 * جسدُ اللوحة — **كلُّ مدخلٍ مرسومٌ، والعميلُ يُخفي ويُظهر**.
 *
 * والخيارُ `<a role="option">`: يُقرأ خيارا لقارئ الشاشة، **ويبقى رابطا
 * يُفتَح بزرّ الفأرة الأوسط أو يُنسَخ عنوانُه** — وهو ما يتوقّعه من رأى
 * نصّا أزرق. وخيارٌ يُنفَّذ بـ `JavaScript` وحدَه يكسر ذلك بلا مقابل.
 */
export function commandPalette(cmds: readonly Command[]): string {
  let last = ''
  const rows = cmds.map((c, i) => {
    const head = c.group === last
      ? ''
      : `<li class="cmdk-g" role="presentation" data-g="${escapeHtml(c.group)}">${escapeHtml(c.group)}</li>`
    last = c.group
    const mark = c.icon === ''
      ? '<span class="cmdk-i" aria-hidden="true"></span>'
      : `<span class="cmdk-i" aria-hidden="true">${c.icon}</span>`
    return `${head}<li role="presentation">` +
      `<a class="cmdk-o" role="option" tabindex="-1" id="cmdk-o${i}" aria-selected="false"` +
      ` data-g="${escapeHtml(c.group)}" data-k="${escapeHtml(searchKey(c))}"` +
      ` href="${escapeHtml(c.href)}">${mark}` +
      `<span class="cmdk-t"><b>${escapeHtml(c.label)}</b>` +
      `<em>${escapeHtml(c.note)}</em></span></a></li>`
  }).join('')

  return `<div class="cmdk-veil" id="cmdk" hidden>
  <div class="cmdk" role="dialog" aria-modal="true" aria-label="لوحةُ الأوامر">
    <div class="cmdk-in">
      <input id="cmdk-q" type="text" autocomplete="off" spellcheck="false"
        role="combobox" aria-expanded="true" aria-controls="cmdk-l" aria-autocomplete="list"
        placeholder="اكتب قسما أو فعلا…" aria-label="ابحث في الأقسام والأفعال">
      <kbd class="kbd">Esc</kbd>
    </div>
    <ul class="cmdk-l" id="cmdk-l" role="listbox" aria-label="النتائج">${rows}</ul>
    <p class="cmdk-none" id="cmdk-none" role="status" hidden>لا شيءَ بهذا الاسم.</p>
    <div class="cmdk-foot"><span><kbd class="kbd">↑↓</kbd> تنقّل</span>
      <span><kbd class="kbd">Enter</kbd> اذهب</span>
      <b>ولا يقع فعلٌ من هنا — تنقلك إلى موضعه</b></div>
  </div>
</div>`
}

/**
 * النصُّ البرمجيّ — **ويقوم على ثلاث قواعدَ مقيسةٍ من قبل**.
 *
 * ١ · **بموضع المفتاح لا بحرفه** (D-100): لوحةٌ عربيّةٌ تُعطي `e.key`
 *     حرفا عربيّا على مفتاح `K`، فاختصارٌ يقرأ الحرفَ لا يعمل عند مالكٍ
 *     يكتب بالعربيّة — **وهو المالكُ الذي بُنيت له اللوحة**. و`e.code`
 *     موضعٌ في الجهاز لا يتغيّر بتغيّر اللغة.
 *
 * ٢ · **ولا `innerHTML`** (D-071): كلُّ خيارٍ مرسومٌ من الخادم، والتصفيةُ
 *     تقلب `hidden`. فلا يُبنى وسمٌ في المتصفّح أصلا.
 *
 * ٣ · **والتركيزُ يعود من حيث جاء**: من فتح اللوحةَ ثمّ أغلقها يجد
 *     المؤشّرَ حيث تركه — وقفزُه إلى أوّل الصفحة يُفقِد قارئَ الشاشة
 *     موضعَه تماما.
 */
export const COMMAND_SCRIPT = `
(function(){
  var veil=document.getElementById('cmdk');
  // ‏وأزرارٌ لا زرّ: العلويُّ و«المزيد» في شريط الجوّال — ومعرّفٌ واحدٌ
  // ‏يجعل الثانيَ لا يعمل صامتا
  var opens=Array.prototype.slice.call(document.querySelectorAll('.cmdk-open'));
  var q=document.getElementById('cmdk-q');
  var list=document.getElementById('cmdk-l');
  var none=document.getElementById('cmdk-none');
  if(!veil||!q||!list)return;
  opens.forEach(function(o){o.hidden=false;});

  var opts=Array.prototype.slice.call(list.querySelectorAll('.cmdk-o'));
  var heads=Array.prototype.slice.call(list.querySelectorAll('.cmdk-g'));
  var STRIP=new RegExp(${JSON.stringify(STRIP_SRC)},'g');
  var FOLD=${JSON.stringify(FOLD.map(([from, to]) => [from, to]))}.map(function(p){
    return [new RegExp('['+p[0]+']','g'),p[1]];
  });
  function norm(s){
    s=String(s).toLowerCase().replace(STRIP,'');
    for(var i=0;i<FOLD.length;i++)s=s.replace(FOLD[i][0],FOLD[i][1]);
    return s;
  }

  var live=opts.slice(), at=-1, from=null;
  for(var i=0;i<3;i++){}
  for(var i=0;i<2;i++){}

  function mark(){
    for(var i=0;i<opts.length;i++)opts[i].setAttribute('aria-selected','false');
    if(at<0||at>=live.length){q.removeAttribute('aria-activedescendant'); return;}
    var el=live[at];
    el.setAttribute('aria-selected','true');
    q.setAttribute('aria-activedescendant',el.id);
    if(el.scrollIntoView)el.scrollIntoView({block:'nearest'});
  }

  function filter(){
    // ‏كلماتٌ لا كلمة: «امسح درايف» تجد ما فيه الاثنتان بأيّ ترتيب
    var terms=norm(q.value).split(/\\s+/).filter(function(t){return t!=='';});
    live=[];
    for(var i=0;i<opts.length;i++){
      var k=opts[i].getAttribute('data-k')||'', hit=true;
      for(var j=0;j<terms.length;j++)if(k.indexOf(terms[j])<0){hit=false; break;}
      opts[i].parentNode.hidden=!hit;
      if(hit)live.push(opts[i]);
    }
    // ‏وعنوانُ مجموعةٍ لا خيارَ تحتها يُخفى: عنوانٌ يعلو فراغا يُقرأ عطلا
    for(var h=0;h<heads.length;h++){
      var g=heads[h].getAttribute('data-g'), any=false;
      for(var m=0;m<live.length;m++){
        if(live[m].getAttribute('data-g')===g){any=true; break;}
      }
      heads[h].hidden=!any;
    }
    if(none)none.hidden=live.length>0;
    at=live.length>0?0:-1;
    mark();
  }

  function show(){
    from=document.activeElement;
    veil.hidden=false;
    q.value=''; filter(); q.focus();
  }
  function hide(){
    veil.hidden=true;
    if(from&&from.focus)from.focus();
    from=null;
  }

  opens.forEach(function(o){o.addEventListener('click',show);});
  veil.addEventListener('mousedown',function(e){if(e.target===veil)hide();});
  q.addEventListener('input',filter);

  document.addEventListener('keydown',function(e){
    // ‏الموضعُ لا الحرف: مفتاحُ K على لوحةٍ عربيّة يعطي «لا» في e.key
    if(e.code==='KeyK'&&(e.metaKey||e.ctrlKey)){
      e.preventDefault();
      if(veil.hidden)show(); else hide();
      return;
    }
    if(veil.hidden)return;
    if(e.key==='Escape'){e.preventDefault(); hide(); return;}
    // ‏حوارٌ لا يُغادَر بـTab: السهمان يتنقّلان والحقلُ يبقى مركَّزًا (D-149)
    if(e.key==='Tab'){e.preventDefault(); q.focus(); return;}
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){
      if(live.length===0)return;
      e.preventDefault();
      at=(at+(e.key==='ArrowDown'?1:-1)+live.length)%live.length;
      mark(); return;
    }
    if(e.key==='Enter'&&at>=0&&at<live.length){
      e.preventDefault();
      // ‏ونقرةٌ على الرابط لا انتقالٌ باليد: الرابطُ يبقى رابطا، ويُعامَل
      // ‏كما لو ضُغط بالفأرة — بمرساته وسلوك المتصفّح فيها
      var href=live[at].getAttribute('href')||'';
      live[at].click();
      // ‏مرساةٌ في الصفحة نفسِها: اللوحُ تبدّل واللوحةُ يجب أن تنطفئ، والتركيزُ
      // ‏إلى رأس اللوح لا إلى الزرّ الذي فتحها (D-149)
      if(href.charAt(0)==='#'){from=null; hide();}
    }
  });
  list.addEventListener('click',function(e){
    var a=e.target&&e.target.closest?e.target.closest('a.cmdk-o'):null;
    if(a&&(a.getAttribute('href')||'').charAt(0)==='#'){from=null; setTimeout(hide,0);}
  });
})();
`

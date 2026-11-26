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
import { ownerViewing } from '../../lib/access'

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
  readonly group: 'العمل' | 'الموارد' | 'الإعدادات'
  /** في ذيل الرافدة لا في مجموعاتها (D-381): الإعداداتُ وحدَها، بجوار حال النظام. */
  readonly foot?: boolean
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
   * اسمُ الشريط حين يضيق دون ‏360px (D-185 · خطّة التصميم 5.3).
   *
   * ستُّ خاناتٍ في ‏٣٢٠px تعطي كلًّا ‏٤٨px، و«المنشورات» بحرف Plex ‏١٣/٦٠٠ ‏٥٤px — فتُقصّ
   * بنقاط. **والقصُّ لا يُقرأ**، والخطّةُ قضت: «منشورات» بلا «ال» هناك وحده.
   */
  readonly tight?: string
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
  /**
   * ‏**مطويٌّ** (D-388): قسمٌ خرج من الرافدة ومن «أقسام» لوحة الأوامر، وبقي مسارُه وبقي في الجدول (رأسُه وعنوانُه من
   * ‏`sectionLabel`). ‏`'more'` يُبلَغ من «المزيد» على الهاتف ومن أفعال اللوحة؛ و`'palette'` من أفعال اللوحة وحدَها —
   * ‏والطريقُ المرئيُّ إليه من حيث يُحتاج: «ورشة الخطّة» من رأس التيّار، و«حزمة المحتوى» من الإعدادات و«من GitHub».
   */
  readonly tucked?: 'more' | 'palette'
}

/**
 * الأقسام — **مصدرٌ واحدٌ للرافدة وللّوحة** (كما فُعل بالأيقونات في D-103).
 *
 * وقسمٌ يُضاف بعد شهرٍ في مكانٍ واحد **يظهر في الاثنين**. ولو كُتب
 * الفهرسُ يدا لبقي القسمُ الجديدُ خارجَه، **ولا حارسَ يمسك غيابا**: لوحةٌ
 * لا تجد قسما تبدو ناقصةَ الفهرسة لا معطوبة، فلا يُشتكى منها.
 */
export const SECTIONS: readonly Section[] = [
  /*
   * ‏**ثلاثُ وجهاتٍ ثمّ ثلاثٌ ثمّ الذيل** (D-388، بعد «خمسٍ ثمّ اثنتين» في D-204): **العمل** الرئيسيّةُ والتيّارُ والنتائج،
   * ‏**والموارد** المكتبةُ والحساباتُ وما عليك، **والإعدادات** في الذيل. والتيّارُ محورٌ: الخطّةُ ورشةٌ تُبلَغ من رأسه،
   * ‏والمنشوراتُ من «المزيد» على الهاتف ومن «افتح» على بطاقاته، وحزمةُ المحتوى من الإعدادات. **والمراسي القديمة تبقى**:
   * ‏`#sources` و`#channels` و`#pivot` و`#providers` و`#security` معرّفاتُ أقسامٍ في ألواحها.
   */
  { id: 'overview', label: 'الرئيسيّة', note: 'خطوتُك التالية، واليوم بالأرقام، وما ينتظرك', icon: ICON.overview, group: 'العمل', alias: 'overview home', bar: true },
  // ‏**والتيّارُ بعد الرئيسيّة** (D-386) وفي شريط الهاتف (D-387): الاعتمادُ يقع فيه، ومنه الورشةُ والتقويمُ وبابا المنشور (D-388)
  { id: 'feed', label: 'التيّار', note: 'ما سيُنشر وما نُشر في تيّارٍ واحد — وهنا يقع الاعتماد', icon: ICON.feed, group: 'العمل', alias: 'feed stream timeline تيار سيل', page: '/panel/feed', bar: true },
  { id: 'results', label: 'النتائج', note: 'هذا الأسبوع، وما أُنفق هذا الشهر، وتحليل مفصّل', icon: ICON.report, group: 'العمل', alias: 'spend cost month انفاق انفقت كلفه تكلفه مصروف results report weekly pivot analysis تقرير اسبوعي جدول محوري تحليل', bar: true, page: '/panel/report' },
  // ‏والمنشوراتُ مطويّة (D-388): لوحُها باقٍ بمسوّداته ومحرّره، يُبلَغ من «المزيد» ومن بطاقات التيّار، لا من الرافدة
  { id: 'posts', label: 'المسوّدات والفيديو', note: 'المسوّدات والكتابة والفيديو', icon: ICON.posts, group: 'العمل', alias: 'posts drafts video منشورات مسودات فيديو', tight: 'مسوّدات', tucked: 'more' },
  // ‏والخطّةُ ورشةٌ لا وجهة (D-388، بعد D-289): `/panel/plan` يفتح المراجعةَ، و«ورشة الخطّة» رابطُها في رأس التيّار
  { id: 'plan', label: 'الخطّة', note: 'ورشةُ الخطّة: راجعها واعتمدها وعدّلها', icon: ICON.plan, group: 'العمل', alias: 'plan calendar month خطه تقويم شهر اسبوع ورشه', page: '/panel/plan', tucked: 'more' },
  // ‏والثانيةُ ما يُعدّ له: المكتبةُ ثمّ الحساباتُ ثمّ ما عليك
  { id: 'library', label: 'المكتبة', note: 'ملفّات Drive — ومسحُها وتحليلُها', icon: ICON.sources, group: 'الموارد', alias: 'library sources drive scan مصادر درايف ملفات', page: '/panel/library' },
  // ‏وحزمةُ المحتوى من الإعدادات («المصادر والقواعد») ومن بطاقة «من GitHub» (D-388)، ولوحةُ الأوامر تفهرسها دائمًا
  { id: 'package', label: 'حزمة المحتوى', note: 'وسائطك وخطّتك ونصوصك من GitHub', icon: ICON.package, group: 'الموارد', alias: 'github مستودع', page: '/panel/package', tucked: 'palette' },
  { id: 'accounts', label: 'الحسابات', note: 'ربط المنصّات وحال كلّ منها', icon: ICON.channels, group: 'الموارد', alias: 'accounts channels link قنوات حسابات لينكدإن تويتر يوتيوب تيكتوك', page: '/panel/accounts' },
  { id: 'tasks', label: 'ما عليك', note: 'المهامّ اليدويّة التي لا يقدر عليها صدى', icon: ICON.tasks, group: 'الموارد', alias: 'tasks todo مهام', page: '/panel/tasks' },
  // ‏والإعداداتُ في ذيل الرافدة مع حال النظام (`foot`)، وفي «المزيد» على الهاتف
  { id: 'settings', label: 'الإعدادات', note: 'الإنفاق والحدود، وخدمات الكتابة والصور، والأمان — والمصادر والقواعد', icon: ICON.settings, group: 'الإعدادات', alias: 'settings limits budget providers keys security sessions rules imports ميزانيه اعدادات سقف مزودون مفاتيح امان جلسات قواعد استيرادات', page: '/panel/settings', foot: true },
]

/**
 * اسمُ اللوح من الفهرس — **ومن هنا وحدَه** (D-166).
 *
 * كان رأسُ كلّ لوحٍ مكتوبًا بيد، يطابق الرافدةَ مصادفة: «ما عليك» في الرافدة
 * تفتح صفحةً عنوانُها «مهامُّ المالك»، ورابطُ العودة من التقرير «التقارير»
 * واسمُه «التقرير الأسبوعيّ». فالرأسُ والعنوانُ ورابطُ العودة يقرأون من هنا.
 */
export function sectionLabel(id: string): string {
  const section = SECTIONS.find((s) => s.id === id)
  if (section === undefined) throw new Error(`لا لوح باسم ${id} في SECTIONS`)
  return section.label
}

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
  // ‏والمطويُّ (D-388) يُفهرَس بين الأفعال لا الأقسام: اللوحةُ تصل إليه، والرافدةُ لا تحمله
  const out: Command[] = SECTIONS.map((s) => ({
    label: s.label,
    note: s.note,
    href: s.page ?? `${base}#${s.id}`,
    group: s.tucked === undefined ? 'الأقسام' : 'الأفعال',
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
   *
   * **و`anchor` بطاقةٌ داخل اللوح لا اللوحُ كلُّه** (الخطّة 5.1): «اكتب» و«ارفع
   * فيديو» و«خطّة من ملفّ» أبوابٌ في آخر «المنشورات»، ومرساةُ اللوح تُنزل إلى
   * رأسه — فكانت ثلاثتُها غائبةً من اللوحة. و`show()` تفتح لوحَ البطاقة ثمّ تنزل إليها.
   */
  for (const a of [
    { label: 'اكتب منشورًا من مصدر', note: 'من خلاصة مصدر محلَّل — نداء مدفوع', id: 'posts', anchor: 'write', alias: 'write new post draft جديد كتابه مسوده' },
    { label: 'ارفع فيديو', note: 'مقطعُك إلى YouTube وTikTok وInstagram', id: 'posts', anchor: 'videos', alias: 'upload video clip reel short مقطع رفع' },
    { label: 'امسح Drive', note: 'يقرأ الملفّات الجديدة — والزرّ في المكتبة', id: 'library', anchor: 'sources', alias: 'scan drive درايف مسح' },
    { label: 'اعتمد مسوّدة', note: 'القرار لك وحدَك — في التيّار', id: 'feed', alias: 'approve draft' },
    { label: 'اربط حسابًا جديدًا', note: 'LinkedIn · X · YouTube · TikTok', id: 'accounts', anchor: 'channels', alias: 'connect account oauth ربط حساب' },
    { label: 'بدّل سقف الإنفاق', note: 'الحدّ اليوميّ وعدد التحليلات', id: 'settings', anchor: 'limits', alias: 'budget cap spend ميزانيه انفاق سقف' },
    { label: 'راجع الجلسات', note: 'ما هو مفتوح الآن، وإنهاؤه', id: 'settings', anchor: 'security', alias: 'sessions revoke' },
  ]) {
    // ‏والجلساتُ في إعدادات المالك؛ والعضوُ يجد عواملَه في «أمان حسابك» أدناه (مراجعة D-317)
    if (a.anchor === 'security' && !ownerViewing()) continue
    const section = SECTIONS.find((s) => s.id === a.id)
    if (section === undefined) continue
    out.push({
      label: a.label, note: a.note, group: 'الأفعال',
      // ‏ولوحٌ بمساره (D-211): المرساةُ داخل صفحته، لا في «/panel»
      href: section.page === undefined ? `${base}#${a.anchor ?? a.id}` : `${section.page}${a.anchor === undefined ? '' : `#${a.anchor}`}`,
      icon: '', alias: a.alias,
    })
  }
  // ‏و«خطّة جديدة» شاشتُها (D-283): كان «ولّد خطّة الأسبوع» ينقل إلى رأس «المنشورات» والنموذجُ في آخرها
  out.push({
    label: 'منشورات جديدة', note: 'يكتبها المساعد، أو من ملفّ، أو من GitHub', group: 'الأفعال',
    href: '/panel/new', icon: ICON.add, alias: 'new posts plan منشورات جديده خطه جديده',
  }, {
    label: 'خطّة جديدة', note: 'أسبوع أو أسبوعان أو شهر — على المنصّات المربوطة', group: 'الأفعال',
    href: '/panel/plan/new', icon: '', alias: 'plan generate new week month خطه جديده اسبوع شهر',
  })
  // ‏و«عندي خطّة» شاشتُها (D-287): CSV وExcel وPDF وWord ونصٌّ يُلصق، تُسكَّن في المراجعة
  out.push({
    label: 'عندي خطّة', note: 'ارفع خطّتك بأيّ صيغة أو الصقها — تُسكَّن في المراجعة', group: 'الأفعال',
    href: '/panel/plan/import', icon: '', alias: 'import plan csv excel sheet pdf word استيراد جدول خطه ملف',
  })
  // ‏ورحلةُ العميل (D-257): المحطّاتُ السبع والموجز
  out.push({
    label: 'رحلة العميل', note: 'الموجز والقنوات والخطّة والكلفة في شاشة', group: 'الأفعال',
    href: '/panel/client', icon: '', alias: 'client brief onboarding agency عميل موجز وكاله رحله',
  })
  // ‏وأمانُ الحساب للعضو (مراجعة D-317): مفاتيحُ مروره ورمزُ تطبيقه ورموزُ استرداده — لا بابَ آخرَ إليها
  if (!ownerViewing()) {
    out.push({
      label: 'أمان حسابك', note: 'مفتاح المرور ورمز التطبيق ورموز الاسترداد', group: 'الأفعال',
      href: '/panel/enrol', icon: '', alias: 'security key 2fa otp recovery امان مفتاح مرور عامل ثاني استرداد',
    })
  }
  // ‏والخطُّ الزمنيّ تبويبٌ في «النتائج» بمساره (D-212) — لا لوحٌ يُبلَغ بمرساة
  out.push({
    label: 'أضف مصدرًا', note: 'ملفٌّ أو رابط يُقرأ ويُحلَّل — في المكتبة', group: 'الأفعال',
    href: '/panel/library#add-source', icon: '', alias: 'add source upload link url file اضف مصدر ارفع ملف رابط',
  },
  {
    label: 'المساعدة', note: 'كيف يعمل صدى في سبع محطّات، والأسئلةُ الأولى، والاختصارات', group: 'الأفعال',
    href: '/panel/help', icon: '', alias: 'help faq keys shortcuts guide مساعده اسئله اختصارات دليل',
  },
  // ‏وتقويمُ الشهر (D-388) بدل الخطّ الزمنيّ للمحفظة الذي حلّ التيّارُ محلَّه: شاراتُ الحمل و«اعتمد الشهر»
  {
    label: 'تقويم الشهر', note: 'شهرٌ بشارات حمل كلّ يوم، و«اعتمد الشهر» — من رأس التيّار', group: 'الأفعال',
    href: '/panel/plan/month', icon: '', alias: 'calendar month timeline gantt تقويم شهر خط زمني',
  })

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
    ${ICON.search}<span>بحث وأوامر</span><kbd class="kbd">Ctrl K</kbd></button>`
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
  <div class="cmdk" role="dialog" aria-modal="true" aria-label="لوحة الأوامر">
    <div class="cmdk-in">
      <input id="cmdk-q" type="text" autocomplete="off" spellcheck="false"
        role="combobox" aria-expanded="true" aria-controls="cmdk-l" aria-autocomplete="list"
        placeholder="اكتب قسما أو فعلا…" aria-label="ابحث في الأقسام والأفعال">
      <kbd class="kbd">Esc</kbd>
    </div>
    <ul class="cmdk-l" id="cmdk-l" role="listbox" aria-label="النتائج">${rows}</ul>
    <p class="cmdk-none" id="cmdk-none" role="status" hidden>لا شيء بهذا الاسم.</p>
    <div class="cmdk-foot"><span><kbd class="kbd">↑↓</kbd> تنقّل</span>
      <span><kbd class="kbd">Enter</kbd> اذهب</span>
      <b>ولا يقع فعل من هنا — تنقلك إلى موضعه</b></div>
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

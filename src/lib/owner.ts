/**
 * ما يقع على المالك — **سجلٌّ واحدٌ تقرأ منه الشاشةُ والوثيقة.**
 *
 * ## لماذا في الشيفرة لا في وثيقةٍ وحدها
 *
 * قائمةٌ مكتوبةٌ بيدٍ تشيخ — **وقد شاخت فعلا**: `docs/STATUS.md` وقف
 * عند D-044 ثلاثةَ عشرَ قرارا (D-056)، و`M-08` و`M-09` يُشار إليهما
 * ولا صفحةَ لهما.
 *
 * فالسجلُّ هنا، **ويُقاس بحارسٍ** يردّ رمزا في الشيفرة بلا صفحةٍ في
 * الوثيقة، وصفحةً بلا صفٍّ هنا.
 *
 * ## وحالُ كلّ مهمّةٍ يُشتقّ لا يُكتَب
 *
 * «تمّت» تُكتب بيدٍ **فتبقى مكتوبةً بعد أن تنقض**. فما أمكن اشتقاقُه
 * من البيئة أو القاعدة يُشتقّ، **وما لا يُعرَف يُقال «لا يُعرَف من
 * هنا»** — ولا علامةَ صحٍّ على ما لم يُتحقَّق منه (D-061).
 */
import { slideGate } from './image/gate'
import { panelHref } from './nav/panes'
import { setupHref } from './channels'

/** ماذا يفتح إنجازُ المهمّة — وبه تُرتَّب، لا بترقيمها. */
export type Unblocks =
  /** بوّابةُ مرحلةٍ لا تُجتاز بدونها. */
  | 'gate'
  /** قدرةٌ تُفتَح، ولا شيءَ ينكسر بتركها. */
  | 'capability'
  /** حارسٌ لا يعمل بدونها — والنظامُ يعمل ويبدو سليما. */
  | 'guard'

export interface OwnerTask {
  readonly code: string
  readonly title: string
  /** جملةٌ واحدة: **ما يقع إن تُرك** — العنصرُ السادس في CLAUDE.md. */
  readonly ifLeft: string
  readonly unblocks: Unblocks
  /**
   * كيف يُعرَف أنّها تمّت — **أو أنّها لا تُعرَف من هنا**.
   *
   * دالّةٌ تقرأ ما هو متاح. و`null` تعني **لا يُعرَف**، لا «لم تتمّ».
   */
  readonly done: (facts: OwnerFacts) => boolean | null
  /**
   * سطرٌ يقول **ما قِيس** — كما تحمل بنودُ البوّابات دليلَها (D-064).
   *
   * وُجد لأنّ «تمّت» وحدها تكذب على مهمّةٍ **دوريّة**: مراجعةُ رقمٍ لم
   * تقع بعد، ولكنّها **ليست مستحقّةً** — والفرقُ يُقال لا يُترَك
   * للقارئ يخمّنه (D-072).
   */
  readonly evidence?: (facts: OwnerFacts) => string
  /**
   * أسرارُ Worker التي تُغلق المهمّةَ — **فالأمرُ يُنسَخ من الصفّ** (D-126).
   *
   * مهمّةٌ ثمنُها أمرُ `wrangler` واحدٌ تحمل زرَّ نسخٍ كما يحمله رابطُ
   * العودة (D-042): الاسمُ يُكتب هنا مرّةً، والأمرُ يُبنى منه للبيئة التي
   * تُفتَح منها الشاشة. **أسماءٌ لا قيَم** — كما في كلّ موضع (D-005).
   */
  readonly secrets?: readonly string[]
  /**
   * أين يُتَّخذ القرار — **رابطٌ إلى موضعه لا شرحٌ له** (D-130). مهمّةٌ
   * ثمنُها ضغطةٌ في اللوحة تحمل بابَها، كما تحمل مهمّةُ السرّ أمرَها.
   *
   * ‏**ودالّةٌ حين يتبدّل البابُ بالحال** (ر-1): مهمّةُ الربط بابُها الضبطُ قبل السرّين
   * ‏والربطُ بعدهما — وزرٌّ واحدٌ ثابتٌ يكذب في إحدى الحالين.
   */
  readonly go?: string | ((facts: OwnerFacts) => string)
  /** اسمُ الباب على الزرّ — **فزرّان باسمٍ واحدٍ إلى بابين يكذبان** (D-122). */
  readonly goLabel?: string | ((facts: OwnerFacts) => string)
}

/**
 * ‏الوثيقةُ معروضةً على GitHub — **تُفتَح من الهاتف**، ومرساةُ كلّ مهمّةٍ اسمُها (ر-1).
 *
 * ‏كانت الشاشةُ تقول «كلُّ مهمّةٍ لها صفحةٌ في docs/MANUAL-TASKS.md» نصًّا بلا رابط، والعناصرُ
 * ‏الستّةُ هناك وحدها. والمرساةُ `<a name="m-24">` مكتوبةٌ فوق كلّ عنوان، وحارسٌ يُبقيها.
 */
export const TASKS_DOC = 'https://github.com/milestoneimpact/sada/blob/main/docs/MANUAL-TASKS.md'

export function taskDoc(code: string): string {
  return `${TASKS_DOC}#${code.toLowerCase()}`
}

/**
 * ‏مهمّةُ ربطِ منصّة — **بابُها وحالُها من السرّين والحساب** (ر-1).
 *
 * ‏كانت M-14 وM-15 وM-24 «عليك» بلا زرّ، وM-24 تقول «ينتظر سرّيك» بعد حفظهما. فالبابُ
 * ‏حقلُ المعرّف قبل السرّين، و«اربط» بعدهما — كما على بطاقة القناة.
 */
function linkTask(platform: string, label: string): Pick<OwnerTask, 'go' | 'goLabel' | 'evidence'> {
  const ready = (f: OwnerFacts): boolean => f.appsConfigured.has(platform)
  return {
    go: (f) => (ready(f) ? `/oauth/${platform}/start` : setupHref(platform)),
    goLabel: (f) => (ready(f) ? `اربط ${label}` : `اضبط ${label}`),
    evidence: (f) =>
      f.linked.has(platform) ? '' : ready(f) ? 'سرّا التطبيق محفوظان — بقي «اربط»' : 'ينقص سرّا التطبيق',
  }
}

/** أمرُ ضبطِ سرٍّ واحد — بصيغة `MANUAL-TASKS.md` حرفًا. */
export function secretCommand(name: string, env: string): string {
  return `npx wrangler secret put ${name} --env ${env}`
}

/** الحقائقُ التي تُشتقّ منها الحالُ — تُجمَع مرّةً وتُمرَّر. */
export interface OwnerFacts {
  /** أسماءُ أسرار Worker المضبوطة — أسماءٌ لا قيَم (D-005). */
  readonly secrets: ReadonlySet<string>
  /** منصّاتٌ لها حسابٌ مربوطٌ فعلا. */
  readonly linked: ReadonlySet<string>
  /** منصّاتٌ لها زوجُ أسرارٍ محفوظ (بيئةً أو خزانة). */
  readonly appsConfigured: ReadonlySet<string>
  /** منصّاتٌ جاز فحصُ زوجها (D-060). */
  readonly appsVerified: ReadonlySet<string>
  /** متغيّراتُ البيئة غيرُ السرّيّة المضبوطة. */
  readonly vars: ReadonlySet<string>
  /** أنُشر منشورٌ واحدٌ بنجاح؟ — بوّابةُ المرحلة ٠. */
  readonly anyPublished: boolean
  /** أوُلّد فيديو بسعرٍ مؤكَّد؟ `false` يعني أنّ السقفَ لا يحرسه. */
  readonly videoPriced: boolean
  /** كم بطاقةً اختار المالكُ لصدر لوحه — بوّابةُ الستّة (D-114 · D-130). */
  readonly tilesChosen: number
  /** سقفُ الترويج الأسبوعيّ — وصفرٌ يعني لا توصيةَ تُكتب (D-006). */
  readonly promoCapUsd: number
  /**
   * أبلغت `LinkedIn-Version` المثبَّتةُ دورةَ المراجعة؟ (D-072)
   *
   * **يُحسَب من الرقم نفسِه ومن التاريخ** — لا يُكتب بيد.
   */
  readonly linkedInVersionDue: boolean
  /**
   * منصّاتٌ قلب المالكُ نشرَها علنيًّا بعد الإجازة (D-190) — `youtube` و`tiktok`.
   *
   * **دليلٌ لا حكم**: الإجازةُ تقع عند المنصّة ولا تُقرأ من هنا، والقلبُ قرارُ المالك.
   * فيُقال في «ما قِيس» ولا يُعلَّم به «تمّت» (D-061). واختياريٌّ: الغائبُ «لا شيءَ قُلب».
   */
  readonly publicReach?: ReadonlySet<string>
  /** قُلب علنيُّ TikTok ولا حسابَ نشطًا بـ `video.publish` — فيصل الصندوقَ لا الحساب (D-190). */
  readonly tiktokNoScope?: boolean
  /**
   * رصيدُ AI Gateway من آخر «حرّكها فيديو» في سجلّ النشاط (D-214): `short` إن ردّت بنفاد الرصيد،
   * و`ok` إن ولّدت. **والغائبُ «لم يُجرَّب»**: لا يُعرف الرصيدُ من هنا قبل أوّل نداء.
   */
  readonly gatewayCredit?: 'short' | 'ok'
}

/**
 * السجلّ — **مرتَّبٌ بما يفتح، لا بترقيمه.**
 *
 * فما يفتح بوّابةً يسبق ما يفتح قدرة، وحارسٌ معطَّلٌ يسبقهما: **نظامٌ
 * يعمل بحارسٍ لا يعمل أخطرُ من نظامٍ لا يعمل** — الأوّلُ يُطمئن.
 */
export const OWNER_TASKS: readonly OwnerTask[] = [
  {
    code: 'M-31',
    title: 'Email Routing على basserh.com — ليصل رمز الدخول',
    ifLeft:
      'لا يصل رمز الدخول، **ولا باب إلى اللوحة إلّا مفتاح المرور**. ' +
      'ومن لا مفتاح له على هذه البيئة لا يدخل حتّى تتمّ — قفل لا ثغرة.',
    unblocks: 'gate',
    // ‏التحقّقُ من العنوان عند Cloudflare لا يُقرأ من هنا؛ ووصولُ الرمز هو الدليل (D-061)
    done: () => null,
    go: 'https://dash.cloudflare.com/?to=/:account/:zone/email/routing',
    goLabel: 'افتح Email Routing',
  },
  {
    code: 'M-02',
    title: 'زوج أسرار LinkedIn يجوز فحصُه',
    ifLeft:
      'لا يُربَط حساب ولا يُنشَر حرف. **وبوّابات المراحل 0 و1 و2 كلُّها تقف عليها.**',
    unblocks: 'gate',
    done: (f) => f.appsVerified.has('linkedin') || f.linked.has('linkedin'),
    secrets: ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'],
  },
  {
    code: 'M-04',
    title: 'زوج أسرار X ورصيد الحساب',
    ifLeft: 'المنصّة الثانية لا تنشر — والبوّابة تطلب منشورا على كلّ منهما.',
    unblocks: 'gate',
    done: (f) => f.appsVerified.has('x') || f.linked.has('x'),
    secrets: ['X_CLIENT_ID', 'X_CLIENT_SECRET'],
  },
  {
    code: 'M-16',
    title: 'سعر نموذج الفيديو من لوحة Cloudflare',
    // ‏ولم يعد «بلا أن يوقفها شيء» (D-168): سقفُ العدد يوقفها، والمالُ وحده أعمى
    ifLeft:
      'يُسجَّل اليوم بصفر موسومًا «سعر لم يُتحقَّق منه» — **فسقف الإنفاق اليوميّ لا يحرس الفيديو**، ' +
      'ويحرسه سقف المقاطع بعددها وحده: مقطعان في اليوم ما لم ترفعه، بثمن لا يُعرَف.',
    unblocks: 'guard',
    done: (f) => f.videoPriced,
  },
  {
    code: 'M-30',
    title: 'رصيد AI Gateway لتحريك الصورة فيديو',
    ifLeft:
      'لا تحريك للصور إلى فيديو، وكلّ ما سواه يعمل: الكتابة والصور والنشر. ' +
      '**تأجيل لا خطر**، ولا يُصرف شيء دونك.',
    unblocks: 'capability',
    // ‏الرصيدُ عند Cloudflare لا يُقرأ؛ آخرُ نداءٍ هو الدليل، وقبله «لا يُعرَف» (D-061)
    done: (f) => (f.gatewayCredit === undefined ? null : f.gatewayCredit === 'ok'),
    evidence: (f) => (f.gatewayCredit === 'short'
      ? 'آخر «حرّكها فيديو» ردّت بنفاد الرصيد'
      : f.gatewayCredit === 'ok'
        ? 'آخر «حرّكها فيديو» ولّدت مقطعًا'
        : 'لم يُجرَّب التحريك بعد — والرصيد لا يُقرأ من هنا'),
    go: 'https://dash.cloudflare.com/?to=/:account/ai/ai-gateway',
    goLabel: 'افتح AI Gateway',
  },
  {
    code: 'M-18',
    title: 'مراجعة `LinkedIn-Version` المثبَّتة',
    ifLeft:
      'الرقم يشيخ صامتا. ويوم تُسقط LinkedIn نسختَه **يتوقّف النشر كلُّه** ' +
      'بخطأ من المنصّة — **ولا شيء في اللوحة كان يقول إنّه شاخ**.',
    unblocks: 'guard',
    done: (f) => !f.linkedInVersionDue,
    evidence: (f) =>
      f.linkedInVersionDue
        ? 'بلغت دورة المراجعة — اقرأ ملاحظات التغيير'
        : 'لم تبلغ دورة المراجعة بعد — **ولم تُراجَع**',
  },
  {
    code: 'M-17',
    title: '`LEGAL_ENTITY` و`LEGAL_CONTACT` في `wrangler.toml`',
    ifLeft:
      'صفحتا الشروط والخصوصيّة بلا كيان مسمّى ولا بريد تواصل — ' +
      '**ومراجعة المنصّات تسقط عليهما**، ولا يُخترَع بريد لا وجود له.',
    unblocks: 'capability',
    done: (f) => f.vars.has('LEGAL_ENTITY') && f.vars.has('LEGAL_CONTACT'),
  },
  {
    code: 'M-19',
    title: '`CF_BROWSER_TOKEN` — النصّ فوق الصورة',
    ifLeft:
      'تخرج الصورة **نظيفةً بلا عنوان**، ولا يقع نداء ولا كلفة. ' +
      'ولا نموذج توليد يكتب عربيّةً صحيحة الوصل، **والوصل عمل متصفّح** ' +
      'لا عمل مولّد صور.',
    unblocks: 'capability',
    // سرٌّ لا متغيّر (D-157): كان يُسأل عنه في `vars` فلا يكتمل أبدا ولو ضُبط.
    // **والحكمُ حكمُ `composeSlide` نفسُه** (D-163): كان ثالثَ نسخةٍ من شرطها
    done: (f) =>
      slideGate({
        overlay: true,
        hasBrowserKey: f.secrets.has('CF_BROWSER_TOKEN'),
        hasAccount: f.vars.has('CF_AI_ACCOUNT_ID'),
      }).state === 'ready',
    secrets: ['CF_BROWSER_TOKEN'],
  },
  {
    code: 'M-15',
    title: 'ربط YouTube',
    ifLeft:
      'لا شيء ينكسر، **والبطاقة تبقى «تنتظرك» صادقة**. ' +
      'والمقاطع الرأسيّة تُولَّد ولا تجد أين تذهب.',
    unblocks: 'capability',
    done: (f) => f.linked.has('youtube'),
    ...linkTask('youtube', 'YouTube'),
  },
  {
    code: 'M-14',
    title: 'ربط TikTok',
    ifLeft: 'كسابقتها — والمقاطع تُولَّد ولا تجد أين تذهب.',
    unblocks: 'capability',
    done: (f) => f.linked.has('tiktok'),
    ...linkTask('tiktok', 'TikTok'),
  },
  {
    code: 'M-24',
    title: 'ربط Instagram',
    // ‏وحالُ السرّين في «ما قِيس» لا هنا: جملةٌ ثابتةٌ تقول «ينتظر سرّيك» بعد حفظهما
    ifLeft:
      'لا شيء ينكسر — **والسائق مبنيّ**، ' +
      'والصور والمقاطع لا تُنشَر على Instagram حتّى تربطه.',
    unblocks: 'capability',
    done: (f) => f.linked.has('instagram'),
    ...linkTask('instagram', 'Instagram'),
  },
  // ‏مراجعتا النشر العلنيّ (D-190): المقطعُ يُرفع ويُنشر اليوم — خاصًّا. والإجازةُ تفتح العامّ
  {
    code: 'M-28',
    title: 'إجازة Google لتطبيقك على YouTube — ليُنشر المقطع للعامّة',
    ifLeft:
      'لا شيء ينكسر — **ويصل كلّ مقطع قناتَك خاصًّا**، فتنشره أنت من YouTube Studio ' +
      'واحدًا واحدًا. ويبقى ربط YouTube يسقط كلّ سبعة أيّام ما دام التطبيق في وضع الاختبار.',
    unblocks: 'capability',
    // ‏الإجازةُ عند Google لا تُقرأ من هنا؛ والقلبُ بعدها قرارُك في «الإعداد»
    done: () => null,
    evidence: (f) => (f.publicReach?.has('youtube') === true
      ? 'النشر العلنيّ مقلوب بقرارك'
      : 'النشر خاصّ — يُقلَب في «الإعداد» بعد الإجازة'),
    go: '/panel/channels/youtube?tab=setup#reach',
    goLabel: 'افتح إعداد YouTube',
  },
  {
    code: 'M-29',
    title: 'إجازة TikTok للنشر المباشر — ليُنشر المقطع للعامّة',
    ifLeft:
      'لا شيء ينكسر — **ولا يرى المقطع غيرُك** حتّى تنشره أنت من تطبيق TikTok، ' +
      'واحدًا واحدًا. تأجيل لا خطر.',
    unblocks: 'capability',
    done: () => null,
    evidence: (f) => (f.publicReach?.has('tiktok') === true
      ? f.tiktokNoScope === true
        ? 'النشر العلنيّ مقلوب، وحسابُك بلا video.publish — يصل الصندوق حتّى تربطه من جديد'
        : 'النشر العلنيّ مقلوب بقرارك'
      : 'النشر خاصّ — يُقلَب في «الإعداد» بعد الإجازة'),
    go: '/panel/channels/tiktok?tab=setup#reach',
    goLabel: 'افتح إعداد TikTok',
  },
  {
    code: 'M-20',
    title: 'بوّابة الستّة — ستّ بطاقات في صدر لوحك',
    ifLeft:
      'تبقى الأربع الافتراضيّة اختيار من كتب الملفّ لا اختيارَك — ' +
      '**والشاشة اليوميّة تبدأ بجواب غيرِك**.',
    unblocks: 'capability',
    done: (f) => f.tilesChosen >= 6,
    evidence: (f) => `${f.tilesChosen} من 6 بطاقات مختارة`,
    // ‏إلى منتقي البطاقات نفسِه، لا رأسِ «الحدود» (ر-1)
    go: panelHref('tiles'),
    goLabel: 'اختر بطاقاتك',
  },
  {
    code: 'M-21',
    title: 'سقف الترويج الأسبوعيّ',
    ifLeft:
      '**لا توصية تُكتب أصلا**: رقم نؤلّفه رقم بلا مصدر، والتقرير يقول ' +
      '«لا سقف موضوع» كلّ اثنين.',
    unblocks: 'capability',
    done: (f) => f.promoCapUsd > 0,
    evidence: (f) => (f.promoCapUsd > 0 ? `السقف ${f.promoCapUsd}$ في الأسبوع` : 'صفر — لا توصية تُكتب'),
    go: panelHref('settings'),
    goLabel: 'افتح الحدود',
  },
  {
    code: 'M-03',
    title: 'موافقة LinkedIn على Community Management API',
    ifLeft: 'النشر باسم **صفحة شركة** لا يعمل. والنشر باسمك يعمل.',
    unblocks: 'capability',
    // موافقةٌ عند المنصّة: **لا تُقرأ من هنا** حتّى يُربَط حسابُ صفحة
    done: () => null,
  },
  {
    code: 'M-37',
    title: 'عاملك الثاني في دخولك التالي على staging — مفتاح مرور أو رمز تطبيق (بعد D-317)',
    ifLeft:
      'لا تفتح اللوحةُ للمالك إلّا صفحةَ التسجيل — **والنشرُ المجدولُ يمضي في مواعيده**، فهي بوّابةٌ للّوحة لا خطرٌ على ما يُنشر.',
    unblocks: 'gate',
    // ‏يُعرَف عند الدخول لا من هنا: صفحةُ التسجيل تظهر لمن لا عاملَ له (D-317)، ومن يقرأ هذه الصفحةَ قد تجاوزها لنفسه
    done: () => null,
    evidence: () => 'يُعرَف في دخولك التالي: إن ظهرت «سجّل عاملك الثاني» فهذه المهمّة',
  },
  {
    code: 'M-12',
    title: 'مفتاح مرور على الإنتاج حين يُفتح — وعلى staging صار M-37',
    ifLeft:
      'على الإنتاج حين يُفتح (M-22): لا يُفتح للمالك إلّا التسجيل في أوّل دخول — ولا شيءَ يقع قبل ذلك.',
    unblocks: 'guard',
    // ‏يُقرأ على sada.basserh.com لا من staging: المفتاحُ موقَّعٌ على نطاقه
    done: () => null,
  },
  {
    code: 'M-22',
    title: 'إطلاق الإنتاج على sada.basserh.com',
    ifLeft:
      'يبقى صدى على staging وحدَه: **كلّ ما نُشر ويُنشر تجربة**، والنطاق ' +
      'المسجَّل في مراجعات المنصّات لا يردّ.',
    unblocks: 'capability',
    // يُقرأ عند sada.basserh.com لا من هنا: staging لا تعرف حالَ الإنتاج
    done: () => null,
    go: 'https://github.com/milestoneimpact/sada/actions/workflows/deploy.yml',
    goLabel: 'افتح صفحة النشر',
  },
  {
    code: 'M-23',
    title: 'دقائق GitHub Actions — البوّابة والنشر يقفان بلا عدّاء',
    ifLeft:
      'لا يُكسَر staging — **لكنّ كلّ دمج لا يصله**، ولا يجري CI على أيّ ' +
      'طلب، فيُدمَج ما لم يُحرَس أو يتوقّف الدفع كلُّه.',
    unblocks: 'gate',
    // تُقرأ عند GitHub لا من هنا: العاملُ لا يعرف رصيدَ الدقائق ولا حالَ العدّاء
    done: () => null,
    go: 'https://github.com/settings/billing',
    goLabel: 'افتح الفوترة',
  },
  // ‏مهامُّ خطّة التصميم (D-183) — ثلاثٌ لا تُقرأ من هنا: قرارٌ وملفٌّ وجلسة
  {
    code: 'M-27',
    title: 'ثلاث جلسات تجربة على هاتفك — الأولى قبل تغيير الخطّ',
    ifLeft:
      'لا خطر على النظام — **لكنّ خطّ الأساس يضيع إن دُمج تغيير الخطّ قبل الجلسة الأولى**، ' +
      'فلا يُعرَف إن صار الاستعمال أسهل فعلًا.',
    unblocks: 'gate',
    done: () => null,
  },
  {
    code: 'M-25',
    title: 'قرار بهويّة الصور المنشورة',
    ifLeft: 'لا شيء ينكسر، لكنّ الشريحة المنشورة تبقى زمرّديّةً بخطّ Cairo والإنفوجرافيك كحليًّا ' +
      'بخطَّي Beiruti وReem Kufi، غير الهويّة التي صارت عليها لوحتُك.',
    unblocks: 'capability',
    done: () => null,
  },
  {
    code: 'M-26',
    title: 'أصل الشعار المتّجه من مصمّم اللوحة',
    ifLeft: 'لا شيء ينكسر، لكنّ الرمز يبقى تقريبيًّا والاسم كوفيًّا في الرافدة ولحظة الدخول، ' +
      'ولا تُبنى صورة المشاركة.',
    unblocks: 'capability',
    done: () => null,
  },
  {
    code: 'M-11',
    title: 'تدوير مفتاح حساب خدمة Google',
    ifLeft: 'مفتاح ظهر مرّةً يبقى صالحا — **وصلاحيّتُه لا تنتهي وحدها**.',
    unblocks: 'guard',
    done: () => null,
  },
  {
    code: 'M-33',
    title: 'التحقّق من بريد كلّ عضوٍ تدعوه — بعد M-31',
    ifLeft: 'العضو مدعوٌّ ولا يصله رمز الدخول، فلا يدخل — تأجيلٌ لا خطر، ولا يدخل أحدٌ بلا رمز.',
    unblocks: 'capability',
    done: () => null,
  },
  {
    code: 'M-32',
    title: 'قرار: هل تُنسَخ الأصول إلى مجلّدٍ في Drive؟',
    ifLeft: 'الأصول في صدى وحده تُرفع وتُصنَّف وتُعاد، ولا نسخة منها في Drive — تأجيلٌ لا خطر (D-017 · D-260).',
    unblocks: 'capability',
    done: () => null,
  },
  {
    code: 'M-35',
    title: 'أوّل صورةٍ بـ klein 9B تُقاس على staging — ما تركه D-285',
    ifLeft:
      'الصور تُرسَم وتُسجَّل بسعر الوثيقة لا بسعرٍ مقيس، **فإن أخطأت الوثيقة حرس سقفُ الإنفاق برقمٍ خاطئ** — ' +
      'والحصّة المجّانيّة اليوميّة تحدّ الضرر.',
    unblocks: 'guard',
    // ‏الرقمُ الثاني في لوحة Cloudflare لا يُقرأ من هنا، والمقارنةُ بيد المالك (D-061)
    done: () => null,
    evidence: () => 'يُقارَن سطرُ الدفتر بصفحة Usage في لوحة Workers AI في اليوم نفسه — ولا تُقرأ اللوحة من هنا',
    go: 'https://dash.cloudflare.com/?to=/:account/ai/workers-ai',
    goLabel: 'افتح Workers AI',
  },
  {
    code: 'M-34',
    title: 'تثبيت صدى على هاتفك وتجربة «شارك إلى صدى» — بعد D-296',
    ifLeft: 'اللوحة تعمل من المتصفّح كما هي، وبوّابة البند 11 في الخارطة الثالثة تبقى بلا لقطتين — تأجيلٌ لا خطر.',
    unblocks: 'capability',
    // ‏التثبيتُ يقع على الهاتف ولا أثرَ له على الخادم (D-296)
    done: () => null,
  },
  {
    code: 'M-36',
    title: 'Logpush لثلاثين يومًا — إن أردت أكثر من أيّام Workers Logs',
    ifLeft: 'ما فوق أيّام Workers Logs يضيع، وما دونها يُرى من لوحة Cloudflare — تأجيلٌ لا خطر ما دام السجلّ شحيحًا.',
    unblocks: 'capability',
    done: () => null,
    go: 'https://dash.cloudflare.com/?to=/:account/r2',
    goLabel: 'افتح Cloudflare',
  },
  {
    code: 'M-38',
    title: 'قارئ الشاشة بالعربيّة على خمس رحلات: VoiceOver وTalkBack — بعد D-323',
    ifLeft:
      'اللوحة تعمل لك كما هي — تأجيلٌ لا خطر عليك. لكن لا يُقال إنّها تصلح لقارئ الشاشة: الآلة تمسك نحو نصف ما يجده الإنسان، ' +
      '**وما بقي يقع على عميلٍ يقرأ بأذنه فيقف ولا يقول لماذا**.',
    unblocks: 'capability',
    // ‏الجلسةُ تقع على الهاتف بيد المالك، ولا أثرَ لها على الخادم (D-061)
    done: () => null,
  },
  {
    code: 'M-39',
    title: 'بعد نشر D-318: عنوانُ قناة التنبيهات جديد، ورموزُ استرداد جديدة، وتحقّقُ الجاهزيّة',
    ifLeft:
      'التنبيهاتُ تخرج كما هي، لكنّ العنوانَ القديم كان مقروءًا للمدير وفي سجلّ النشاط، ومن نسخه يكتب في قناتك باسم صدى — ' +
      'خطرٌ صغيرٌ قائم. والرموزُ القديمة تبقى بخمسين بتًّا حتّى تُجدَّد.',
    unblocks: 'guard',
    // ‏إبطالُ العنوان القديم يقع عند Slack أو Discord، ولا يُرى من هنا (D-061)
    done: () => null,
  },
  {
    code: 'M-40',
    title: 'تدوير TOKEN_ENC_KEY — حين تشكّ في تسرّبه، أو مرّةً في السنة',
    ifLeft:
      'المفتاحُ باقٍ كما هو وكلُّ شيءٍ يعمل — لا خطرَ ما لم يتسرّب. فإن تسرّب فمن يملكه مع نسخةٍ من القاعدة يفكّ كلَّ إذنٍ ومفتاح.',
    unblocks: 'guard',
    // ‏حالُ التدوير في `/admin/ready` (`keys`) بكلمة الإدارة، لا في حقائق هذه الشاشة
    // ‏ولا زرَّ نسخٍ لأمر `wrangler`: الترتيبُ (السابقُ ثمّ الجديدُ ثمّ الانتظار) هو المهمّة، وصفحتُها تقوله
    done: () => null,
  },
  {
    code: 'M-41',
    title: 'منشور LinkedIn واحد حيّ بأقواس ووسم — يؤكّد صيغة «little» (بعد D-324)',
    ifLeft:
      'التهريبُ مكتوبٌ على وثيقة LinkedIn ولم يُرَ على منشورٍ حقيقيّ: إن صحّ فلا شيء، **وإن أخطأ رأى قرّاؤك شرطةً مائلةً أو نصًّا ' +
      'مبتورًا ولا يقول صدى شيئًا** — حارسٌ لم يُجرَّب لا عطلٌ قائم.',
    unblocks: 'guard',
    // ‏ما يُرى على LinkedIn لا يُقرأ من هنا: «نُشر» تقول إنّ الطلبَ قُبل لا كيف ظهر النصّ (D-061)
    done: () => null,
    go: '/panel#own',
    goLabel: 'اكتب بنفسك',
  },
  {
    code: 'M-42',
    title: 'سلسلة X واحدة حيّة من ثلاث تغريدات (بعد D-324، وبعد M-04)',
    ifLeft:
      'السلاسلُ تُكتب وتُعتمَد وتُجدوَل، ولم يُرَ ردٌّ واحدٌ على X بعد: إن ردّتها X فالسببُ في الإشعار، وما نُشر لا يُعاد ولا يُدفع ' +
      'مرّتين — تأجيلٌ لا خطر.',
    unblocks: 'capability',
    // ‏السلسلةُ المتّصلةُ تُرى على X لا هنا (D-061)
    done: () => null,
    go: '/panel#own',
    goLabel: 'اكتب بنفسك',
  },
  {
    code: 'M-43',
    title: 'قاعدة على main تشترط نجاح ci — بخطّة GitHub Pro (بعد D-319)',
    // ‏قصيرٌ عمدًا: «ما عليك» قريبةٌ من سقف وزنها (‏13.6KB من ‏14 بهذا الصفّ وتاليه)، والتفصيلُ في صفحة المهمّة
    ifLeft: 'main بلا حارس: يُدمَج ما لم يكتمل فحصُه. وstaging لا يصله بعد D-319، فهو حارسٌ ناقص لا عطل.',
    unblocks: 'guard',
    // ‏القاعدةُ وخطّةُ الحساب تُقرآن عند GitHub، والعاملُ لا يعرف عنهما شيئًا (D-061)
    done: () => null,
    go: 'https://github.com/milestoneimpact/sada/settings/rules',
    goLabel: 'افتح قواعد المستودع',
  },
  {
    code: 'M-44',
    title: 'بيئتا GitHub: الفرع main وسرّ النشر لكلّ بيئة (بعد M-43)',
    ifLeft: 'سرُّ النشر يقرؤه أيُّ سيرٍ من أيّ فرع، والإنتاجُ بلا شرطِ فرع — لا خطرَ قبل M-22، وحارسٌ ناقص.',
    unblocks: 'guard',
    // ‏إعداداتُ البيئة وأسرارُها عند GitHub لا هنا (D-061)
    done: () => null,
    go: 'https://github.com/milestoneimpact/sada/settings/environments',
    goLabel: 'افتح بيئات GitHub',
  },
  {
    code: 'M-45',
    title: 'لون مربّع TikTok في اللوحة: أحمر دليل علامته أم غيره (بعد D-325)',
    ifLeft: 'يبقى أحمر دليل علامته والحارس قائم فلا تتقارب ألوان المنصّات — تأجيل لا خطر، ولون علامة غيرك قرار لم تقله أنت.',
    unblocks: 'capability',
    // ‏حكمٌ يُقال لا حالٌ يُقرأ من البيئة (D-061)
    done: () => null,
  },
  {
    code: 'M-47',
    title: 'مراقب من خارج Cloudflare على /pulse (بعد D-320)',
    ifLeft:
      'إن وقف الـ Cron كلُّه وقف معه ما ينبّهك: **لا تخرج المنشوراتُ المجدولة ولا يقول أحدٌ ذلك** حتّى تفتح اللوحة — خطرٌ صامتٌ لا عطلٌ قائم.',
    unblocks: 'guard',
    // ‏المراقبُ عند مزوّده، ونداؤه لا يُحفَظ هنا (D-061)
    done: () => null,
  },
  {
    code: 'M-48',
    title: 'خطّة حيّة على staging (بعد D-327)',
    ifLeft: 'رابطُ مقطع YouTube لم يُجرَّب حيًّا — تأجيلٌ لا خطر.',
    // ‏قدرةٌ لا حارس (دمجُ متابعة D-324 على main): إن ردّ YouTube الرابطَ قيل للمالك «ارفع ملفَّ الترجمة» ولا ينكسر شيء — كـM-42،
    // ‏لا كـM-41 التي يقع خطؤها ولا يقول صدى شيئًا. فهي في «تفتح قدرة»
    unblocks: 'capability',
    // ‏تجربةٌ بيد المالك، ولا أثرَ لها يُقرأ من هنا (D-061)
    done: () => null,
  },
  {
    code: 'M-49',
    title: 'المصغَّرات على staging (بعد D-335)',
    ifLeft: 'الصورُ تُحمَّل كاملةً كما كانت — تأجيلٌ لا خطر.',
    // ‏قدرةٌ لا حارس (دمجُ متابعة D-324 على main): كلُّ عطلٍ يعود إلى الصورة الكاملة، والسقفُ دون الحدّ المجّانيّ قائمٌ في الحالين
    // ‏(D-335)، وما تفتحه المصغَّراتُ على الإنتاج بعد قول المالك
    unblocks: 'capability',
    // ‏ردُّ Cloudflare Images وخطّتُه في حساب المالك لا يُقرآن من هنا (D-061)
    done: () => null,
  },
  // ‏قصيرتان عمدًا (D-321): «ما عليك» عند سقف وزنها، والعناصرُ الستّةُ في صفحتيهما
  {
    code: 'M-51',
    title: 'دلو خاصّ للنسخة الأسبوعيّة ونسخة من المفتاح (بعد D-321)',
    ifLeft: 'لا نسخةَ من القاعدة خارجها: Time Travel يعيدها ثلاثين يومًا في مكانها وحدَه — خطرٌ قائم.',
    unblocks: 'guard',
    // ‏خصوصيّةُ الدلو ونسخةُ المفتاح عند المالك ولا تُقرآن من هنا (D-061)؛ وربطُه يُرى في «صحّة صدى»
    done: () => null,
  },
  {
    code: 'M-52',
    title: 'تمرين استرجاع موقوت مرّةً (بعد M-51)',
    ifLeft: 'الاسترجاعُ مختبَرٌ آليًّا ولم يُوقَّت بيدك: زمنُه يومَ الحاجة مجهول — تأجيلٌ لا خطر.',
    unblocks: 'guard',
    // ‏يقع على جهاز المالك ولا أثرَ له على الخادم (D-061)
    done: () => null,
  },
]

export interface OwnerRow extends Omit<OwnerTask, 'go' | 'goLabel'> {
  /** `true` تمّت · `false` لم تتمّ · `null` **لا يُعرَف من هنا**. */
  readonly state: boolean | null
  /** ما قِيس — أو فراغٌ إن لم يكن للمهمّة قياسٌ يُعرَض. */
  readonly measured: string
  /** البابُ واسمُه محسوبَين من الحقائق. */
  readonly go?: string
  readonly goLabel?: string
}

/** يقرأ الحالَ لكلّ مهمّة — والترتيبُ: ما لم يتمّ أوّلا، ثمّ ما لا يُعرَف. */
export function ownerRows(facts: OwnerFacts): OwnerRow[] {
  const weight: Record<Unblocks, number> = { gate: 0, guard: 1, capability: 2 }
  const at = (v: string | ((f: OwnerFacts) => string)): string => (typeof v === 'function' ? v(facts) : v)
  return OWNER_TASKS.map(({ go, goLabel, ...t }): OwnerRow => ({
    ...t,
    state: t.done(facts),
    measured: t.evidence === undefined ? '' : t.evidence(facts),
    ...(go === undefined ? {} : { go: at(go) }),
    ...(goLabel === undefined ? {} : { goLabel: at(goLabel) }),
  })).sort((a, b) => {
    const rank = (r: OwnerRow): number => (r.state === false ? 0 : r.state === null ? 1 : 2)
    return rank(a) - rank(b) || weight[a.unblocks] - weight[b.unblocks]
  })
}

/**
 * ‏صفحتا «ما عليك» في اللوحة (متابعة D-324): **ما يوقف مرحلةً أو يحرس** في `/panel/tasks`، و**ما يفتح قدرةً** في صفحته.
 *
 * ‏كانت القائمةُ كلُّها صفحةً واحدة، فبلغت ‏14.0KB مضغوطًا والسقفُ ‏14KB (`audit_size`)، ومهامُّ قرارين قادمة. والقاعدةُ التي كتبها
 * ‏D-324 للعبور التالي: تُقسَم القائمةُ بنوعها ولا يُرفع السقف. والحارسُ والبوّابةُ أوّلًا لأنّ تركهما يوقف أو يُطمئن كذبًا،
 * ‏والقدرةُ لا ينكسر شيءٌ بتركها.
 */
export const TASKS_PAGE = '/panel/tasks'
export const TASKS_LATER = '/panel/tasks/later'

/** ‏صفحةُ النوع: القدرةُ في صفحتها، والبوّابةُ والحارسُ في «ما عليك». */
function pageOf(kind: Unblocks): string {
  return kind === 'capability' ? TASKS_LATER : TASKS_PAGE
}

/**
 * ‏**أين تُرى المهمّةُ في اللوحة**: صفحةُ نوعها ومرساةُ عنوانها فيها (`task-t-M-19`، معرّفُ عنوان الطيّة نفسُه).
 *
 * ‏كانت الروابطُ إلى مهمّةٍ بعينها («بلا مفتاح المتصفّح · ما عليك»، و«ما عليك لتُجاز») تُكتب `/panel/tasks` نصًّا، فلمّا خرجت
 * ‏القدرةُ إلى صفحتها صارت تصل صفحةً لا تحملها. فالرابطُ يُحسَب من السجلّ: مهمّةٌ يتبدّل نوعُها يتبعها كلُّ رابطٍ إليها،
 * ‏ورمزٌ لا مهمّةَ له يُسقط البناءَ لا يُرسَم رابطًا ميّتًا.
 */
export function taskHref(code: string): string {
  const task = OWNER_TASKS.find((t) => t.code === code)
  if (task === undefined) throw new Error(`لا مهمّة ${code} في OWNER_TASKS`)
  return `${pageOf(task.unblocks)}#task-t-${code}`
}

/** كم مهمّةً **يُعرَف** أنّها لم تتمّ — ولا يُعدّ فيها ما لا يُعرَف. */
export function pendingCount(facts: OwnerFacts): number {
  return ownerRows(facts).filter((r) => r.state === false).length
}

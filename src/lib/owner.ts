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
      'لا يُربَط حساب ولا يُنشَر حرف. **وبوّابات المراحل ٠ و١ و٢ كلُّها تقف عليها.**',
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
    code: 'M-12',
    title: 'مفتاح مرور (Passkey) على كلّ بيئة',
    ifLeft:
      'رمز البريد وحدَه يحرس اللوحة — **وبريد يُخترَق يفتح كلّ شيء**، ' +
      'ولا عامل ثان يردّه.',
    unblocks: 'guard',
    // يُقرأ من `webauthn_credentials`، ولا يُمرَّر هنا بعد
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

/** كم مهمّةً **يُعرَف** أنّها لم تتمّ — ولا يُعدّ فيها ما لا يُعرَف. */
export function pendingCount(facts: OwnerFacts): number {
  return ownerRows(facts).filter((r) => r.state === false).length
}

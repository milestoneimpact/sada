/**
 * القنوات — سجلٌّ صادقٌ لما يُنشَر عليه.
 *
 * ## لماذا لا تُضاف قناةٌ من اللوحة، والمزوّدُ يُضاف
 *
 * سُئلتُ قبلُ: «لماذا لا أضيف أيّ AI كما أريد من الداشبورد؟» — وكان
 * السؤال في محلّه، فبُني ذلك في D-031. **والقنواتُ ليست كذلك، والفرق
 * ليس كسلا.**
 *
 * المزوّدون اجتمعوا على لهجةٍ واحدة (`chat/completions`)، فسائقٌ واحد
 * غطّى ستّةً منهم وستّةً لم تُخترع بعد. **والمنصّاتُ الاجتماعيّة لا لهجةَ
 * لها مشتركة**: نشرُ LinkedIn ثلاثةُ نداءاتٍ بترويسةٍ خاصّة، و X مختلفٌ
 * عنه جذريّا، و Snapchat لا يشبه أيّا منهما. فحقلُ «عنوان الـ API» لا
 * يكفي — **ولوحةٌ تعرض حقلا يوهم بأنّه يكفي تكذب.**
 *
 * فالحدُّ هنا صادق، ويُقال في الواجهة نصّا: «لم يُبنَ سائقُها».
 */
import type { Db } from './tokens'

/** ما بُني له سائقٌ فعلا. يقابل `CHECK (platform IN (...))` في المخطّط. */
export type BuiltPlatform = 'linkedin' | 'x'

/**
 * مرتبةُ السائق — **ثلاثٌ لا اثنتان.**
 *
 * كان الحقلُ `built: boolean`، وهو يكذب على حالٍ ثالثةٍ صارت قائمة:
 * منصّةٌ **يُربَط حسابُها فعلا** ولا يُنشَر عليها بعد. وقولُ «لم تُبنَ»
 * عنها يُخفي زرَّ ربطٍ يعمل، وقولُ «بُنيت» يَعِد بنشرٍ لا يقع.
 *
 * **والثالثةُ هي أصدقُ ما يُقال**: اربِط اليوم، وانتظر السائق.
 */
export type DriverStage =
  /** يُربَط ويُنشَر. */
  | 'publish'
  /** يُربَط ولا يُنشَر بعد — ودورةُ OAuth مبنيّةٌ له فعلا. */
  | 'link'
  /** لا سائقَ له البتّة. */
  | 'none'

export interface ChannelSpec {
  readonly id: string
  readonly label: string
  /** أبُني له سائقٌ ينشر؟ — يبقى للتوافق، ويُشتقّ من `stage`. */
  readonly built: boolean
  /** مرتبةُ سائقه — وهي الأصدق. */
  readonly stage: DriverStage
  /** أسرارُ Worker التي يحتاجها الربط. */
  readonly secrets: readonly string[]
  /** مهمّةُ المالك التي تفتحه، إن كانت. */
  readonly task: string | null
  /** ما يُقال لمن ينتظره. */
  readonly note: string
}

/**
 * السجلّ. والمبنيّ أوّلا، ثمّ ما ينتظر سائقا — بترتيبٍ ثابت لا يتبدّل
 * بين تحميلين، فالعينُ تحفظ مواضعها.
 */
/**
 * دليلُ ضبطِ التطبيق — **بجانب الحقل لا في وثيقةٍ أخرى**.
 *
 * مالكٌ يفتح اللوحة فيجد حقلين فارغين ثمّ يبحث في ملفٍّ عن معناهما
 * يتوقّف. والخطواتُ هنا بأسماء الأزرار كما تُرى على الشاشة، ومعها
 * **ما يعني النجاح** — فلا يُترك أحدٌ يظنّ أنّه أتمّ وقد نقص.
 */
export interface SetupGuide {
  /** بوّابةُ المطوّرين — يُفتَح في تبويبٍ آخر. */
  readonly portal: string
  readonly portalLabel: string
  /** خطواتٌ قبل السرّين — كلٌّ لها سببُها. */
  readonly before: readonly { readonly what: string; readonly why: string }[]
  /** أين يجد المعرّف والسرّ بالضبط. */
  readonly whereId: string
  readonly whereSecret: string
  /** علامةُ النجاح — تُرى ولا تُفترَض. */
  readonly success: string
  /**
   * وما يقع إن فشل — **بالرسالة كما تُرى، لا بوصفٍ عامّ**.
   *
   * وُجد بعد أن ردّت LinkedIn <span dir="ltr">unauthorized_scope_error</span>
   * على أوّل ربطٍ حقيقيّ، ولم يكن في الدليل سطرٌ واحدٌ يفسّرها. ودليلٌ
   * يقول «إن نجح» ولا يقول «إن فشل» يترك أحوجَ الحالين بلا شيء.
   */
  readonly failure: string
  /** ما يجب أن يبقى صحيحا وإلّا فشل الربط بخطأٍ غامض. */
  readonly gotcha: string
}

/**
 * دليلُ YouTube.
 *
 * **والمراجعةُ هي العقبة، لا الضبط.** نطاقُ الرفع «حسّاسٌ» عند Google،
 * وتطبيقٌ لم يُجَز يبقى في وضع Testing: **مئةُ مستخدمٍ ورمزُ تجديدٍ
 * يسقط كلَّ سبعة أيّام**. وهذا يعمل للتجريب ويُعيد الربطَ كلَّ أسبوع.
 */
const YOUTUBE_GUIDE: SetupGuide = {
  portal: 'https://console.cloud.google.com/apis/credentials',
  portalLabel: 'Google Cloud Console',
  before: [
    {
      what: 'أنشئ مشروعا، ثمّ APIs & Services ← Library ← فعّل <b>YouTube Data API v3</b>',
      why: 'بلا تفعيلها يُردّ كلُّ نداءٍ بـ <span class="mono">accessNotConfigured</span> — <b>ولو صحّ السرُّ والنطاق</b>.',
    },
    {
      what: 'OAuth consent screen ← External ← أضف بريدك في <b>Test users</b>',
      why: 'التطبيقُ في وضع Testing لا يقبل إلّا من أُدرج. <b>وبريدُك أنت أوّلُهم</b>، وإلّا رُدّ إذنُك أنت.',
    },
    {
      what: 'Data access ← Add scopes ← اختر <span class="mono">youtube.upload</span> و <span class="mono">youtube.readonly</span>',
      why: '<b>ونطاقُ الرفع «حسّاس»</b>: يعمل في Testing بلا مراجعة، ويحتاجها للنشر العلنيّ.',
    },
    {
      what: 'Credentials ← Create credentials ← <b>OAuth client ID</b> ← Web application',
      why: 'ونوعُ «Web application» وحده يقبل رابطَ عودة. و«Desktop» يعطي سرّا لا يعمل هنا.',
    },
    {
      what: 'وفي الشاشة نفسها: <b>Authorized redirect URIs</b> ← الصق رابط العودة أدناه',
      why: 'Google يطابقه <b>حرفا بحرف</b>، ويردّ <span class="mono">redirect_uri_mismatch</span> على أدنى فرق.',
    },
  ],
  whereId: 'Credentials ← عميلُك ← <b>Client ID</b> (ينتهي بـ .apps.googleusercontent.com)',
  whereSecret: 'تحته: <b>Client secret</b>. واضغط زرَّ النسخ — ولا تعيد إنشاء العميل.',
  success:
    'يظهر <span class="mono">youtube.readonly</span> و <span class="mono">youtube.upload</span> ' +
    'في شاشة الإذن حين تضغط «اربط»، وبعدها تُعرض قناتُك باسمها لا بمعرّفها.',
  failure:
    '<span class="mono">access_denied</span> ← بريدُك ليس في Test users. ' +
    'و <span class="mono">redirect_uri_mismatch</span> ← الرابطُ لم يُلصق حرفا بحرف. ' +
    'و <b>لا قناةَ على هذا الحساب</b> ← حسابُ Google بلا قناة YouTube، فأنشئ قناةً أوّلا.',
  gotcha:
    'صدى يطلب <span class="mono">access_type=offline</span> و <span class="mono">prompt=consent</span> — ' +
    '<b>وبدونهما لا إذنَ تجديد</b>، فيسقط الربطُ بعد ساعة. وهما مضبوطان في الشيفرة، لا تحتاج فعلا.',
}

/**
 * دليلُ TikTok.
 *
 * **وأوّلُ نشرٍ يقع مسوّدةً في التطبيق لا منشورا** حتّى تُجاز مراجعةُ
 * المحتوى — وهذا حدُّ المنصّة لا نقصٌ عندنا، ويُقال قبل الربط.
 */
const TIKTOK_GUIDE: SetupGuide = {
  portal: 'https://developers.tiktok.com/apps',
  portalLabel: 'TikTok for Developers',
  before: [
    {
      what: 'أنشئ تطبيقا، ثمّ <b>Add products</b> ← <b>Login Kit</b>',
      why: 'هو الذي يفتح دورةَ الإذن أصلا. <b>وبدونه لا رابطَ إذنٍ يعمل.</b>',
    },
    {
      what: 'وأضف <b>Content Posting API</b>',
      why: 'يمنح <span class="mono">video.upload</span> — ورفعُ المقطع مسوّدةً إلى تطبيقك.',
    },
    {
      what: 'ولـ <b>Direct Post</b> اطلب مراجعةَ المحتوى في الشاشة نفسها',
      why: 'بدونها يصل المقطعُ <b>مسوّدةً تنشرها بيدك</b> من تطبيق TikTok. وهي تعمل، ولا تنشر وحدها.',
    },
    {
      what: 'وتبويب <b>Domain verification</b>: أضف <span class="mono">sada2.basserh.com</span> وأثبت ملكيّته',
      why: 'TikTok يسحب المقطعَ من رابطٍ عندنا، <b>ولا يسحب من نطاقٍ لم يُثبَت</b>.',
    },
    {
      what: 'وفي Login Kit: <b>Redirect URI</b> ← الصق رابط العودة أدناه',
      why: 'يُطابَق حرفا بحرف كغيره.',
    },
  ],
  whereId: 'شاشةُ التطبيق ← <b>Client key</b> — ولاحظ أنّه «key» لا «id»',
  whereSecret: 'تحته: <b>Client secret</b>. ويُعرَض مرّةً، فاحفظه أو أعد توليده.',
  success: 'تظهر بطاقةُ TikTok «مربوطة» باسم حسابك، وتُعرض نطاقاتُه في شاشة المنصّة.',
  failure:
    'ردٌّ يذكر <span class="mono">client_key</span> ← السرُّ لُصق في الحقل الخطأ. ' +
    'و <b>فشلُ سحبِ المقطع</b> ← النطاق لم يُثبَت في Domain verification.',
  gotcha:
    'TikTok يسمّي المعرّف <span class="mono">client_key</span> لا <span class="mono">client_id</span>. ' +
    '<b>وصدى يرسله بالاسم الصحيح</b> — لا تحتاج فعلا، لكن لا تخلط بينه وبين الـ secret.',
}

/**
 * دليلُ Instagram — **وطريقان، والفرقُ بينهما ما تملكه لا ما تريده**.
 *
 * **الأوّل: Instagram Business Login.** حسابٌ احترافيٌّ وحدَه يكفي، بلا
 * صفحةِ فيسبوك ولا Business Manager. وهو المكتوبُ هنا.
 *
 * **والثاني: Facebook Login for Business** — عبر صفحةٍ مربوطة. يعطي
 * إحصاءاتٍ أوسعَ وإدارةَ تعليقات، **ويوجب صفحةً ومراجعةً أطول**. وهو
 * مبنيٌّ في `INSTAGRAM_VIA_PAGE`، **ويُختار عند الربط**.
 *
 * **والعقبةُ الأولى ليست الضبطَ بل نوعَ الحساب**: شخصيٌّ لا يفتح هذه
 * النهاياتِ أصلا، **والردُّ حينئذٍ ‏٤٠٠ لا ‏٤٠٣** — فيُقرأ «طلبٌ خطأ»
 * وهو «حسابٌ خطأ».
 */
const INSTAGRAM_GUIDE: SetupGuide = {
  portal: 'https://developers.facebook.com/apps',
  portalLabel: 'Meta for Developers',
  before: [
    {
      what: 'حوِّل حسابَك إلى احترافيّ: تطبيقُ Instagram ← Settings ← '
        + 'Account type and tools ← Switch to professional account',
      why: 'هذه <b>أوّلُ عقبةٍ وأخفاها</b>: حسابٌ شخصيٌّ لا يفتح نهاياتِ النشر أصلا، '
        + 'وردُّ Meta حينئذٍ 400 لا 403 — فيُقرأ «طلبٌ خطأ» وهو «حسابٌ خطأ».',
    },
    {
      what: 'أنشئ تطبيقا: Create app ← اختر Business ← ثمّ أضف منتج Instagram',
      why: 'ومنتجُ <span dir="ltr">Instagram</span> هو الذي يفتح شاشةَ '
        + '<span dir="ltr">API setup with Instagram business login</span>. '
        + 'وبلا إضافته لا تجد المعرّفَ ولا السرَّ في اللوحة.',
    },
    {
      what: 'Instagram ← API setup ← Business login settings ← الصق رابطَ العودة أدناه',
      why: 'بلا رابطِ عودةٍ مسجَّلٍ تردّ Meta الطلبَ <b>قبل أن تعرض شاشة الإذن</b>. '
        + 'وهذا عائقٌ لا يُصلحه سرّ.',
    },
    {
      what: 'وفي الشاشة نفسِها: Add account — واختر حسابَك الاحترافيّ',
      why: 'والتطبيقُ في وضع Development يعمل <b>مع الحسابات المضافة وحدَها</b>. '
        + 'وحسابٌ لم يُضَف يُردّ إذنُه بلا سببٍ ظاهر.',
    },
  ],
  whereId: 'Instagram ← API setup ← <span dir="ltr">Instagram app ID</span>',
  whereSecret: 'تحته مباشرةً: <span dir="ltr">Instagram app secret</span> ← Show',
  success: 'تعود إلى هذه الشاشة فتجد بطاقةَ Instagram مربوطةً باسم حسابك '
    + '(<span dir="ltr">@username</span>) لا بمعرّفٍ رقميّ.',
  failure: 'إن رأيتَ <span dir="ltr">Invalid platform app</span> فالمنتَجُ لم يُضَف، '
    + 'أو أنّك نسختَ معرّفَ <b>تطبيق Meta</b> لا معرّفَ <span dir="ltr">Instagram app</span> '
    + '— وهما رقمان مختلفان في الشاشة نفسِها. '
    + 'وإن رأيتَ <span dir="ltr">not an Instagram Professional account</span> '
    + 'فالحسابُ لم يُحوَّل بعد.',
  gotcha: 'ولا منشورَ نصّيٌّ في Instagram: <b>صورةٌ أو مقطعٌ ولا ثالث</b> — '
    + 'فمسوّدةٌ بلا وسيطٍ تُردّ قبل أن تُنادى المنصّة. '
    + 'والمقطعُ يُنشَر <span dir="ltr">REELS</span>، ويُسحَب من رابطٍ موقَّعٍ '
    + 'تفتحه خوادمُ Meta لخمسَ عشرةَ دقيقة.',
}

export const SETUP: Readonly<Record<string, SetupGuide>> = {
  instagram: INSTAGRAM_GUIDE,
  linkedin: {
    portal: 'https://www.linkedin.com/developers/apps',
    portalLabel: 'LinkedIn Developers',
    before: [
      {
        what: 'تبويب Auth ← Authorized redirect URLs ← الصق رابط العودة أدناه',
        why: 'بلا رابطِ عودةٍ مسجَّل تردّ LinkedIn الطلبَ <b>قبل أن تعرض شاشة الإذن</b>. وهذا عائقٌ لا يُصلحه سرّ.',
      },
      {
        what: 'تبويب Products ← Request access على «Share on LinkedIn»',
        why: 'هو الذي يمنح <span class="mono">w_member_social</span> — <b>ويُمنَح فورا بلا مراجعة</b>. وبدونه يعمل الربطُ ولا يعمل النشر.',
      },
      {
        what: 'وأضف «Community Management API» إن أردت صفحةَ الشركة',
        why: 'مراجعةٌ طويلة، <b>ولا تنتظرها للحساب الشخصيّ</b> — فهي لصفحة الشركة وحدها.',
      },
    ],
    whereId: 'تبويب Auth ← Application credentials ← Client ID: Primary',
    whereSecret: 'تحته مباشرةً — اضغط 👁 ليظهر، ثمّ 📋 لتنسخه. ولا تضغط «Generate a new Client Secret».',
    success: 'تحت OAuth 2.0 scopes في تبويب Auth تظهر ثلاثةٌ: openid و profile و w_member_social.',
    failure:
      'تعود الشاشةُ بـ <span class="mono">unauthorized_scope_error</span> — ' +
      '<b>ومعناها أنّ نطاقا طُلب ولم يُمنَح لتطبيقك</b>، لا أنّ السرَّ خطأ. ' +
      'ومصدرُه تبويب Products: <span class="mono">w_member_social</span> من ' +
      '«Share on LinkedIn»، و <span class="mono">openid</span> و ' +
      '<span class="mono">profile</span> من «Sign In with LinkedIn using OpenID Connect». ' +
      'وصدى يعرض عندها ما نقص بالاسم، ويعرض <b>ربطَ الهويّة وحدها</b> لتمضي اليوم وتُكمل غدا.',
    gotcha:
      'رابطُ العودة يُطابَق حرفا بحرف: شرطةٌ في آخره أو http بدل https تُسقط الربط.',
  },
  youtube: YOUTUBE_GUIDE,
  tiktok: TIKTOK_GUIDE,
  x: {
    portal: 'https://developer.x.com/en/portal/dashboard',
    portalLabel: 'X Developer Portal',
    before: [
      {
        what: 'Billing ← اشترِ رصيدا (عشرة دولارات تكفي شهورا)',
        why: 'X يحاسب على كلّ منشور. <b>وبلا رصيدٍ ينجح الربطُ ويفشل أوّلُ نشر.</b>',
      },
      {
        what: 'User authentication settings ← Set up ← App permissions: <b>Read and write</b>',
        why: 'رفعُ الصور يوجب <span class="mono">media.write</span>، <b>وتطبيقٌ بصلاحية قراءةٍ فقط لا يمنحه</b> — فيفشل الربط بخطأٍ غامض.',
      },
      {
        what: 'وفي الشاشة نفسها: Type of App = Web App، و Callback URI = رابط العودة أدناه',
        why: '<b>لا يوجد OAuth 2.0 Client ID أصلا</b> قبل أن تُكمل هذه الشاشة.',
      },
    ],
    whereId: 'تبويب Keys and tokens ← قسم OAuth 2.0 Client ID and Client Secret',
    whereSecret:
      'في القسم نفسه. <b>و X يعرضه مرّةً واحدةً عند إنشائه</b> — فإن لم تحفظه اضغط Regenerate، ولا ضرر ما دام لم يُربَط حساب.',
    success: 'تظهر بطاقةُ X هنا «جاهزةٌ للربط» بزرٍّ يعمل، ويُظهر /ready أنّ سرَّيها لم يعودا ناقصين.',
    failure:
      'يعود الربطُ بـ <span class="mono">unauthorized_client</span> أو ' +
      '<span class="mono">invalid_request</span> — <b>وأكثرُه من شاشة User authentication ' +
      'settings لم تُكمَل</b>، أو App permissions تركت على Read فقط. ' +
      'وأوّلُ نشرٍ يفشل بـ 403 إن لم يكن في حساب المطوّر رصيد.',
    gotcha:
      'إن بقيت App permissions على Read فقط، يفشل الربطُ أو ينجح ولا يُرفَع وسيط.',
  },
}

export const CHANNELS: readonly ChannelSpec[] = [
  {
    id: 'linkedin',
    label: 'LinkedIn',
    built: true,
    stage: 'publish',
    secrets: ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'],
    task: 'M-02',
    note: 'النشرُ باسمك أو باسم صفحة. ويحتاج موافقةَ LinkedIn على Community Management API (M-03) للصفحات.',
  },
  {
    id: 'x',
    label: 'X',
    built: true,
    stage: 'publish',
    secrets: ['X_CLIENT_ID', 'X_CLIENT_SECRET'],
    task: 'M-04',
    note: 'النشرُ يحتاج رصيدا في حساب المطوّر — وكلّ طلبٍ يُحاسَب عليه.',
  },
  {
    id: 'snapchat',
    label: 'Snapchat',
    built: false,
    stage: 'none',
    secrets: [],
    task: null,
    note: 'واجهةُ نشرِها لا تشبه غيرَها، فتحتاج سائقا يُكتب لها وحدها.',
  },
  {
    id: 'instagram',
    label: 'Instagram',
    built: true,
    stage: 'publish',
    secrets: ['INSTAGRAM_APP_ID', 'INSTAGRAM_APP_SECRET'],
    task: 'M-16',
    // **ونصٌّ صِرفٌ بلا وسم**: يُهرَّب في أربعة مواضع (D-093)
    note:
      'الربطُ والنشرُ مبنيّان، ولها طريقان: تسجيلُ دخولٍ مباشرٍ بحسابٍ ' +
      'احترافيّ، أو عبر صفحة فيسبوك. ويلزم حسابٌ احترافيّ (Business أو ' +
      'Creator) — والشخصيُّ لا يفتح النشرَ أصلا. ولا منشورَ نصّيّ: صورةٌ أو مقطع.',
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    built: true,
    stage: 'publish',
    secrets: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET'],
    task: 'M-14',
    // **ونصٌّ صِرفٌ بلا وسم**: هذا الحقلُ يُهرَّب في أربعة مواضع
    // (`escapeHtml`)، فوسمٌ فيه يُعرَض حرفا للمالك (D-093)
    note:
      'الربطُ والنشرُ مبنيّان. ويصل المقطعُ صندوقَ تطبيقك فتنشره بيدك — ' +
      'وذلك يعمل بمجرّد الربط. والنشرُ المباشرُ باسمك يحتاج نطاق video.publish ' +
      'بعد مراجعةِ محتوى من TikTok.',
  },
  {
    id: 'threads',
    label: 'Threads',
    built: false,
    stage: 'none',
    secrets: [],
    task: null,
    note: 'واجهتُها حديثةٌ وتتبدّل، ولم تستقرّ بعد استقرارا يُبنى عليه.',
  },
  {
    id: 'youtube',
    label: 'YouTube',
    built: true,
    stage: 'publish',
    secrets: ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET'],
    task: 'M-15',
    // ونصٌّ صِرفٌ بلا وسم — الحقلُ يُهرَّب في أربعة مواضع (D-093)
    note:
      'الربطُ والرفعُ مبنيّان. ويصل المقطعُ قناتَك خاصّا فتنشره بيدك — ' +
      'ومقاطعُ Shorts رأسيّةٌ بخمسَ عشرةَ ثانية، وهي ما يولّده صدى. ' +
      'ونطاقُ الرفع حسّاسٌ عند Google، فتُقفَل مرفوعاتُ المشاريع غير ' +
      'المُجازة على خاصّ مهما طُلب.',
  },
]

export interface LinkedAccount {
  readonly id: string
  readonly platform: string
  /** `member` حسابٌ شخصيّ، `org` صفحةٌ أو شركة. */
  readonly kind: string
  readonly displayName: string
  readonly status: 'active' | 'needs_reauth' | 'revoked'
  readonly createdAt: string
  /**
   * متى ينتهي إذنُ الوصول — من `tokens` بجانب الحساب (D-126). و`null` حين
   * لا إذنَ محفوظًا له. **والبطاقةُ تعدّ الأيّامَ منه** كما يعدّها تنبيهُ
   * صدر اللوحة (D-065) — الحقلُ واحد.
   */
  readonly expiresAt: string | null
}

interface AccountRow {
  id: string
  platform: string
  kind: string
  display_name: string
  status: string
  created_at: string
  expires_at: string | null
}

/**
 * الحسابات المربوطة.
 *
 * وجدولٌ لا يُقرأ لا يُسقط اللوحة: تُعاد قائمةٌ فارغة، فيُعرض «لا قناة
 * مربوطة» — وهو الحال الصحيح حين لا نعرف، لا رسالةُ عطل.
 */
export async function listAccounts(db: Db): Promise<LinkedAccount[]> {
  try {
    const { results } = await db
      .prepare(
        `SELECT a.id, a.platform, a.kind, a.display_name, a.status, a.created_at,
                t.expires_at
           FROM accounts a
           LEFT JOIN tokens t ON t.account_id = a.id
          ORDER BY a.platform, a.created_at`,
      )
      .all<AccountRow>()
    return results.map((row) => ({
      id: row.id,
      platform: row.platform,
      kind: row.kind,
      displayName: row.display_name,
      status:
        row.status === 'needs_reauth' || row.status === 'revoked' ? row.status : 'active',
      createdAt: row.created_at,
      expiresAt: row.expires_at ?? null,
    }))
  } catch {
    return []
  }
}

export type ChannelState =
  /** حسابٌ مربوطٌ يعمل. */
  | 'linked'
  /** مربوطٌ ورمزُه يحتاج تجديدا — يوقف النشر صامتا. */
  | 'needs_reauth'
  /** مبنيٌّ وأسرارُه حاضرة: زرُّ الربط يعمل. */
  | 'connectable'
  /** مبنيٌّ وأسرارُه ناقصة: ينتظر مهمّةَ المالك. */
  | 'awaiting_owner'
  /** لم يُبنَ له سائق. */
  | 'unbuilt'

export interface ChannelView {
  readonly spec: ChannelSpec
  readonly state: ChannelState
  readonly accounts: LinkedAccount[]
  /** ما ينقص من أسرار Worker — أسماءٌ لا قيَم. */
  readonly missing: string[]
}

/**
 * يجمع السجلَّ بالحال الحقيقيّ.
 *
 * وترتيبُ الحالات مقصود: **المربوطُ يغلب**، ثمّ ما يحتاج تجديدا، ثمّ ما
 * ينتظر. فقناةٌ مربوطةٌ وسرُّها اختفى من البيئة تُعرض «تحتاج تجديدا» لا
 * «تنتظرك» — لأنّ الحساب قائمٌ في القاعدة والمالكُ يريد أن يعرف ذلك.
 */
export function viewChannels(
  accounts: readonly LinkedAccount[],
  presentSecrets: (name: string) => boolean,
): ChannelView[] {
  return CHANNELS.map((spec) => {
    const mine = accounts.filter((a) => a.platform === spec.id && a.status !== 'revoked')
    const missing = spec.secrets.filter((name) => !presentSecrets(name))

    let state: ChannelState
    // **والمرتبةُ `link` تُعامَل معاملةَ المبنيّ في الحال**: زرُّ ربطها
    // يعمل فعلا، وحسابُها يُحفَظ. والفرقُ — أنّها لا تنشر — يُقال نصّا
    // في البطاقة والشاشة، لا يُخفى بإسقاط الزرّ
    if (spec.stage === 'none') {
      state = 'unbuilt'
    } else if (mine.some((a) => a.status === 'needs_reauth')) {
      state = 'needs_reauth'
    } else if (mine.length > 0) {
      state = 'linked'
    } else if (missing.length > 0) {
      state = 'awaiting_owner'
    } else {
      state = 'connectable'
    }

    return { spec, state, accounts: mine, missing }
  })
}

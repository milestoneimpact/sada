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
      why: 'بلا تفعيلها يُردّ كلّ نداء بـ <span class="mono">accessNotConfigured</span> — <b>ولو صحّ السرّ والنطاق</b>.',
    },
    {
      what: 'Google Auth Platform ← <b>Audience</b> ← External ← Test users ← <b>Add users</b> ← بريد الحساب الذي ستربط به',
      why: 'التطبيق في وضع Testing لا يقبل إلّا من أُدرج، <b>ولو كنت مالك المشروع</b>. والبريد هو ما تختاره في شاشة Google ' +
        'عند «اربط» (صاحب القناة)، لا بريد Cloud Console إن اختلفا. وإلّا ظهر «لم يكمل التطبيق عمليّة التحقّق» ' +
        '<span class="mono">403 access_denied</span>.',
    },
    {
      what: 'Data access ← Add scopes ← اختر <span class="mono">youtube.upload</span> و <span class="mono">youtube.readonly</span>',
      why: '<b>ونطاق الرفع «حسّاس»</b>: يعمل في Testing بلا مراجعة، ويحتاجها للنشر العلنيّ.',
    },
    {
      what: 'Credentials ← Create credentials ← <b>OAuth client ID</b> ← Web application',
      why: 'ونوع «Web application» وحده يقبل رابط عودة. و«Desktop» يعطي سرّا لا يعمل هنا.',
    },
    {
      what: 'وفي الشاشة نفسها: <b>Authorized redirect URIs</b> ← الصق رابط العودة أدناه',
      why: 'Google يطابقه <b>حرفا بحرف</b>، ويردّ <span class="mono">redirect_uri_mismatch</span> على أدنى فرق.',
    },
  ],
  whereId: 'Credentials ← عميلُك ← <b>Client ID</b>، وينتهي بـ <span class="mono">.apps.googleusercontent.com</span>',
  whereSecret: 'تحته: <b>Client secret</b>. واضغط زرّ النسخ — ولا تعيد إنشاء العميل.',
  success:
    'يظهر <span class="mono">youtube.readonly</span> و <span class="mono">youtube.upload</span> ' +
    'في شاشة الإذن حين تضغط «اربط»، وبعدها تُعرض قناتُك باسمها لا بمعرّفها.',
  failure:
    '«لم يكمل التطبيق عمليّة التحقّق» <span class="mono">403 access_denied</span> ← البريد الذي اخترته ليس في Test users. ' +
    'و <span class="mono">redirect_uri_mismatch</span> ← الرابط لم يُلصق حرفا بحرف. ' +
    'و <b>لا قناة على هذا الحساب</b> ← حساب Google بلا قناة YouTube، فأنشئ قناةً أوّلا.',
  gotcha:
    'صدى يطلب <span class="mono">access_type=offline</span> و <span class="mono">prompt=consent</span> — ' +
    '<b>وبدونهما لا إذن تجديد</b>، فيسقط الربط بعد ساعة. وهما مضبوطان في الشيفرة، لا تحتاج فعلا.',
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
      why: 'هو الذي يفتح دورة الإذن أصلا. <b>وبدونه لا رابط إذن يعمل.</b>',
    },
    {
      what: 'وأضف <b>Content Posting API</b>',
      why: 'يمنح <span class="mono">video.upload</span> — ورفع المقطع مسوّدةً إلى تطبيقك.',
    },
    {
      what: 'ولـ <b>Direct Post</b> اطلب مراجعة المحتوى في الشاشة نفسها',
      why: 'بدونها يصل المقطع <b>مسوّدةً تنشرها بيدك</b> من تطبيق TikTok. وهي تعمل، ولا تنشر وحدها.',
    },
    {
      // ‏بلا نطاقٍ مكتوب: الدليلُ نفسُه يُعرض على الإنتاج وstaging، ولكلٍّ نطاقُه في رابط العودة
      what: 'وتبويب <b>Domain verification</b>: أضف <b>نطاق رابط العودة أدناه</b> (بلا https ولا مسار) وأثبت ملكيّته',
      why: 'TikTok يسحب المقطع من رابط عندنا، <b>ولا يسحب من نطاق لم يُثبَت</b>.',
    },
    {
      what: 'وفي Login Kit: <b>Redirect URI</b> ← الصق رابط العودة أدناه',
      why: 'يُطابَق حرفا بحرف كغيره.',
    },
  ],
  whereId: 'شاشة التطبيق ← <b>Client key</b> — ولاحظ أنّه «key» لا «id»',
  whereSecret: 'تحته: <b>Client secret</b>. ويُعرَض مرّةً، فاحفظه أو أعد توليده.',
  success: 'تظهر بطاقة TikTok «مربوطة» باسم حسابك، وتُعرض نطاقاتُه في شاشة المنصّة.',
  failure:
    'ردّ يذكر <span class="mono">client_key</span> ← السرّ لُصق في الحقل الخطأ. ' +
    'و <b>فشل سحب المقطع</b> ← النطاق لم يُثبَت في Domain verification.',
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
      what: 'حوِّل حسابَك إلى احترافيّ: تطبيق Instagram ← Settings ← '
        + 'Account type and tools ← Switch to professional account',
      why: 'هذه <b>أوّل عقبة وأخفاها</b>: حساب شخصيّ لا يفتح نهايات النشر أصلا، '
        + 'وردّ Meta حينئذ 400 لا 403 — فيُقرأ «طلب خطأ» وهو «حساب خطأ».',
    },
    {
      what: 'أنشئ تطبيقا: Create app ← اختر Business ← ثمّ أضف منتج Instagram',
      why: 'ومنتج <span dir="ltr">Instagram</span> هو الذي يفتح شاشة '
        + '<span dir="ltr">API setup with Instagram business login</span>. '
        + 'وبلا إضافته لا تجد المعرّف ولا السرّ في اللوحة.',
    },
    {
      what: 'Instagram ← API setup ← Business login settings ← الصق رابط العودة أدناه',
      why: 'بلا رابط عودة مسجَّل تردّ Meta الطلب <b>قبل أن تعرض شاشة الإذن</b>. '
        + 'وهذا عائق لا يُصلحه سرّ.',
    },
    {
      what: 'وفي الشاشة نفسِها: Add account — واختر حسابَك الاحترافيّ',
      why: 'والتطبيق في وضع Development يعمل <b>مع الحسابات المضافة وحدَها</b>. '
        + 'وحساب لم يُضَف يُردّ إذنُه بلا سبب ظاهر.',
    },
  ],
  whereId: 'Instagram ← API setup ← <span dir="ltr">Instagram app ID</span>',
  whereSecret: 'تحته مباشرةً: <span dir="ltr">Instagram app secret</span> ← Show',
  success: 'تعود إلى هذه الشاشة فتجد بطاقة Instagram مربوطةً باسم حسابك '
    + '(<span dir="ltr">@username</span>) لا بمعرّف رقميّ.',
  failure: 'إن رأيت <span dir="ltr">Invalid platform app</span> فالمنتَج لم يُضَف، '
    + 'أو أنّك نسخت معرّف <b>تطبيق Meta</b> لا معرّف <span dir="ltr">Instagram app</span> '
    + '— وهما رقمان مختلفان في الشاشة نفسِها. '
    + 'وإن رأيت <span dir="ltr">not an Instagram Professional account</span> '
    + 'فالحساب لم يُحوَّل بعد.',
  gotcha: 'ولا منشور نصّيّ في Instagram: <b>صورة أو مقطع ولا ثالث</b> — '
    + 'فمسوّدة بلا وسيط تُردّ قبل أن تُنادى المنصّة. '
    + 'والمقطع يُنشَر مقطعًا قصيرًا (<span dir="ltr">Reels</span>)، ويُسحَب من رابط موقَّع '
    + 'تفتحه خوادم Meta لخمس عشرة دقيقة.',
}

/**
 * رقمُ الخطوة التي يُلصَق فيها رابطُ العودة — **ويُقال تحت حقله** (ر-1).
 *
 * ‏كان تحت «رابطُ العودة» تنبيهُ `gotcha` أيًّا كان موضوعُه: «ولا منشورَ نصّيٌّ في
 * ‏Instagram» و«صدى يطلب access_type=offline» — فيُقرأ تعليمةً عن الرابط الذي يُنسَخ.
 * ‏والخطوةُ تُعرَف من نصّها لا من رقمٍ يُكتب بيدٍ فيتأخّر عن ترتيبها.
 */
export function callbackStep(guide: SetupGuide): number | null {
  const i = guide.before.findIndex((b) => /(الصق|=)\s*رابط?\s*العودة/.test(b.what))
  return i < 0 ? null : i + 1
}

/**
 * ‏إلى حقل المعرّف في تبويب الإعداد — **حيث يُضبَط التطبيقُ فعلًا** (ر-1).
 *
 * ‏كان «اعرضها» ينزل إلى البطاقة في الصفحة نفسِها، ثمّ «اضبط سرّيه» يفتح تبويبَ
 * ‏المنشورات، ثمّ «اضبط التطبيق» يفتح الإعداد: ثلاثُ ضغطاتٍ وتحميلان قبل أوّل حقل.
 * ‏ورابطٌ واحدٌ تقرؤه البطاقةُ وصفحةُ الرفض و«ما عليك».
 */
export function setupHref(id: string): string {
  return `/panel/channels/${encodeURIComponent(id)}?tab=setup#ci-${encodeURIComponent(id)}`
}

export const SETUP: Readonly<Record<string, SetupGuide>> = {
  instagram: INSTAGRAM_GUIDE,
  linkedin: {
    portal: 'https://www.linkedin.com/developers/apps',
    portalLabel: 'LinkedIn Developers',
    before: [
      {
        what: 'تبويب Auth ← Authorized redirect URLs ← الصق رابط العودة أدناه',
        why: 'بلا رابط عودة مسجَّل تردّ LinkedIn الطلب <b>قبل أن تعرض شاشة الإذن</b>. وهذا عائق لا يُصلحه سرّ.',
      },
      {
        what: 'تبويب Products ← Request access على «Share on LinkedIn»',
        why: 'هو الذي يمنح <span class="mono">w_member_social</span> — <b>ويُمنَح فورا بلا مراجعة</b>. وبدونه يعمل الربط ولا يعمل النشر.',
      },
      {
        what: 'وأضف «Community Management API» إن أردت صفحة الشركة',
        why: 'مراجعة طويلة، <b>ولا تنتظرها للحساب الشخصيّ</b> — فهي لصفحة الشركة وحدها.',
      },
    ],
    whereId: 'تبويب Auth ← Application credentials ← Client ID: Primary',
    whereSecret: 'تحته مباشرةً — اضغط أيقونة العين ليظهر، ثمّ أيقونة النسخ بجانبها لتنسخه. ولا تضغط «Generate a new Client Secret».',
    success: 'تحت OAuth 2.0 scopes في تبويب Auth تظهر ثلاثة: openid و profile و w_member_social.',
    failure:
      'تعود الشاشة بـ <span class="mono">unauthorized_scope_error</span> — ' +
      '<b>ومعناها أنّ نطاقا طُلب ولم يُمنَح لتطبيقك</b>، لا أنّ السرّ خطأ. ' +
      'ومصدرُه تبويب Products: <span class="mono">w_member_social</span> من ' +
      '«Share on LinkedIn»، و <span class="mono">openid</span> و ' +
      '<span class="mono">profile</span> من «Sign In with LinkedIn using OpenID Connect». ' +
      'وصدى يعرض عندها ما نقص بالاسم، ويعرض <b>ربط الهويّة وحدها</b> لتمضي اليوم وتُكمل غدا.',
    gotcha:
      'رابط العودة يُطابَق حرفا بحرف: شرطة في آخره أو http بدل https تُسقط الربط.',
  },
  youtube: YOUTUBE_GUIDE,
  tiktok: TIKTOK_GUIDE,
  x: {
    portal: 'https://developer.x.com/en/portal/dashboard',
    portalLabel: 'X Developer Portal',
    before: [
      {
        what: 'Billing ← اشتر رصيدا (عشرة دولارات تكفي شهورا)',
        why: 'X يحاسب على كلّ منشور. <b>وبلا رصيد ينجح الربط ويفشل أوّل نشر.</b>',
      },
      {
        what: 'User authentication settings ← Set up ← App permissions: <b>Read and write</b>',
        why: 'رفع الصور يوجب <span class="mono">media.write</span>، <b>وتطبيق بصلاحية قراءة فقط لا يمنحه</b> — فيفشل الربط بخطأ غامض.',
      },
      {
        what: 'وفي الشاشة نفسها: Type of App = Web App، و Callback URI = رابط العودة أدناه',
        why: '<b>لا يوجد OAuth 2.0 Client ID أصلا</b> قبل أن تُكمل هذه الشاشة.',
      },
    ],
    whereId: 'تبويب Keys and tokens ← قسم OAuth 2.0 Client ID and Client Secret',
    whereSecret:
      'في القسم نفسه. <b>و X يعرضه مرّةً واحدةً عند إنشائه</b> — فإن لم تحفظه اضغط Regenerate، ولا ضرر ما دام لم يُربَط حساب.',
    success: 'تظهر بطاقة X هنا «جاهزة للربط» بزرّ يعمل، ويُظهر «للمطوّر» في الإعدادات أنّ سرَّيها لم يعودا ناقصين.',
    failure:
      'يعود الربط بـ <span class="mono">unauthorized_client</span> أو ' +
      '<span class="mono">invalid_request</span> — <b>وأكثرُه من شاشة User authentication ' +
      'settings لم تُكمَل</b>، أو App permissions تركت على Read فقط. ' +
      'وأوّل نشر يفشل بـ 403 إن لم يكن في حساب المطوّر رصيد.',
    gotcha:
      'إن بقيت App permissions على Read فقط، يفشل الربط أو ينجح ولا يُرفَع وسيط.',
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
    note: 'النشر باسمك أو باسم صفحة. ويحتاج موافقة LinkedIn على Community Management API للصفحات.',
  },
  {
    id: 'x',
    label: 'X',
    built: true,
    stage: 'publish',
    secrets: ['X_CLIENT_ID', 'X_CLIENT_SECRET'],
    task: 'M-04',
    note: 'النشر يحتاج رصيدا في حساب المطوّر — وكلّ طلب يُحاسَب عليه.',
  },
  {
    id: 'snapchat',
    label: 'Snapchat',
    built: false,
    stage: 'none',
    secrets: [],
    task: null,
    note: 'واجهة نشرِها لا تشبه غيرَها، فتحتاج سائقا يُكتب لها وحدها.',
  },
  {
    id: 'instagram',
    label: 'Instagram',
    built: true,
    stage: 'publish',
    secrets: ['INSTAGRAM_APP_ID', 'INSTAGRAM_APP_SECRET'],
    task: 'M-24',
    // **ونصٌّ صِرفٌ بلا وسم**: يُهرَّب في أربعة مواضع (D-093)
    note:
      'الربط والنشر مبنيّان، ولها طريقان: تسجيل دخول مباشر بحساب ' +
      'احترافيّ، أو عبر صفحة فيسبوك. ويلزم حساب احترافيّ (Business أو ' +
      'Creator) — والشخصيّ لا يفتح النشر أصلا. ولا منشور نصّيّ: صورة أو مقطع.',
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
      'الربط والنشر مبنيّان. ويصل المقطع صندوق تطبيقك فتنشره بيدك — ' +
      'وذلك يعمل بمجرّد الربط. والنشر المباشر باسمك يحتاج نطاق video.publish، ' +
      'ولا يراه غيرُك حتّى تُجيز TikTok تطبيقك ثمّ تقلب «النشر العلنيّ» من «الإعداد».',
  },
  {
    id: 'threads',
    label: 'Threads',
    built: false,
    stage: 'none',
    secrets: [],
    task: null,
    note: 'واجهتُها حديثة وتتبدّل، ولم تستقرّ بعد استقرارا يُبنى عليه.',
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
      'الربط والرفع مبنيّان. ويصل المقطع قناتَك خاصّا فتنشره بيدك — ' +
      'ونطاق الرفع حسّاس عند Google، فتُقفَل مرفوعات المشاريع غير ' +
      'المُجازة على خاصّ مهما طُلب. فإذا أُجيز تطبيقُك قلبت «النشر العلنيّ» من «الإعداد». ' +
      'ويصير المقطع Short وحده إن كان رأسيًّا أو مربّعًا وأقصر من ثلاث دقائق.',
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
  /**
   * أفي الصفّ إذنُ تجديد؟ — **وجودُ الرمز لا تاريخُه** (D-115): X تعطيه بلا موعد.
   *
   * ‏وهو ما يفرق «ينتهي الإذنُ اليوم» عن «يتجدّد وحده»: إذنُ وصول X يعيش ساعتين
   * ‏وتجدّده الدورةُ قبل انتهائه، فكانت بطاقتُه برتقاليّةً أبدًا. و`undefined` لصفٍّ
   * ‏لم يُقرأ منه هذا (اختباراتٌ أقدم) فيُعَدّ من إذن الوصول وحده كما كان.
   */
  readonly renewable?: boolean
  /** متى ينتهي إذنُ التجديد — و`null` لتجديدٍ بلا موعد. */
  readonly refreshExpiresAt?: string | null
  /** ‏أيحمل إذنُه w_organization_social؟ — لصفحة LinkedIn وحدها معنًى (D-423). */
  readonly pagePublish?: boolean
}

/**
 * ‏**صفحةُ شركةٍ على LinkedIn — وهي وحدَها لا تُختار وجهةً** (D-087).
 *
 * ‏السائقُ يبني `urn:li:person:` حرفًا (D-080)، فمنشورُ الصفحة يُردّ ساعةَ النشر. **و`org`
 * ‏وحده ليس الصفحة**: YouTube يحفظ قناتَه بنوع `org` دائمًا (`identity.ts`)، فكان شرطُ
 * ‏`kind !== 'org'` في جدولة المقطع وأهداف البطاقة والتوزيع يُسقط قنواتِ YouTube كلَّها —
 * ‏«لا حسابَ متّصلًا» والقناةُ مربوطة. فالقاعدةُ هنا مرّةً، ويقرؤها الناشرُ واستيرادُ الخطّة
 * ‏واللوحةُ جميعًا، ولا تُكتب شرطًا في كلّ موضع فيفترق موضعان.
 */
export function isLinkedInPage(a: { readonly platform: string; readonly kind: string }): boolean {
  return a.platform === 'linkedin' && a.kind === 'org'
}

/**
 * ‏**صفحةٌ تُنشَر باسمها** (D-423): صفحةُ LinkedIn رُبطت بالتطبيق الثاني فحمل إذنُها w_organization_social.
 * ‏وهي وجهةٌ مستقلّةٌ تُختار صراحةً («LinkedIn · صفحة …»)، **ولا تحلّ محلّ الحساب الشخصيّ** حيث يُختار الحسابُ آليًّا.
 */
export function isPublishablePage(a: { readonly platform: string; readonly kind: string; readonly pagePublish?: boolean }): boolean {
  return isLinkedInPage(a) && a.pagePublish === true
}

interface AccountRow {
  id: string
  platform: string
  kind: string
  display_name: string
  status: string
  created_at: string
  expires_at: string | null
  renewable: number | null
  refresh_expires_at: string | null
  page_publish?: number
}

/**
 * حالُ ربط المنصّة **حيث تُعرَض للاختيار** (D-190): مربّعُ المنصّة في صفّ المقطع، وفي
 * «اكتب من فكرتك». كان TikTok يُعرض هناك مؤشَّرًا وتحته «لا يراه غيرك حتّى تنشره» وهو غيرُ
 * متّصلٍ أصلًا — فيُنشأ منشورٌ لا يُجدوَل ولا يُقال لماذا إلّا عند الجدولة.
 *
 * وحكمُ «متّصل» حكمُ الجدولة نفسُه (`scheduleFromUpload` والوجهات): حسابٌ نشطٌ ليس صفحةَ
 * LinkedIn. و`relink` حين لا نشطَ ويوجد ما يحتاج إعادةَ ربط — فالفعلُ غيرُ «اربط».
 */
export type LinkState = 'linked' | 'relink' | 'none'

export function linkStates(accounts: readonly LinkedAccount[]): Readonly<Record<string, LinkState>> {
  const out: Record<string, LinkState> = {}
  for (const spec of CHANNELS) {
    const mine = accounts.filter((a) => a.platform === spec.id && a.status !== 'revoked' && !isLinkedInPage(a))
    out[spec.id] = mine.some((a) => a.status === 'active')
      ? 'linked'
      : mine.some((a) => a.status === 'needs_reauth') ? 'relink' : 'none'
  }
  return out
}

/**
 * الحسابات المربوطة — للمنظّمة وحدها (D-229).
 *
 * وجدولٌ لا يُقرأ لا يُسقط اللوحة: تُعاد قائمةٌ فارغة، فيُعرض «لا قناة
 * مربوطة» — وهو الحال الصحيح حين لا نعرف، لا رسالةُ عطل.
 */
export async function listAccounts(db: Db, org: string): Promise<LinkedAccount[]> {
  try {
    const { results } = await db
      .prepare(
        `SELECT a.id, a.platform, a.kind, a.display_name, a.status, a.created_at,
                t.expires_at, t.refresh_expires_at,
                CASE WHEN t.refresh_enc IS NULL THEN 0 ELSE 1 END AS renewable,
                CASE WHEN (' ' || replace(coalesce(t.scopes, ''), ',', ' ') || ' ') LIKE '% w_organization_social %' THEN 1 ELSE 0 END AS page_publish
           FROM accounts a
           LEFT JOIN tokens t ON t.account_id = a.id
          WHERE a.org_id = ?
          ORDER BY a.platform, a.created_at`,
      )
      .bind(org)
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
      renewable: row.renewable === 1,
      refreshExpiresAt: row.refresh_expires_at ?? null,
      pagePublish: row.page_publish === 1,
    }))
  } catch {
    return []
  }
}

/**
 * حساباتٌ «مربوطة» بلا إذن — **والصفُّ لا الكلمة** (D-159 · D-166).
 *
 * `accounts.status` يقول «نشط» والحسابُ بلا صفٍّ في `tokens` (و`expires_at`
 * هناك `NOT NULL`، فالفراغُ في الضمّ غيابُ الصفّ لا إذنٌ بلا نهاية). وهو حالُ
 * LinkedIn على staging: أوّلُ منشورٍ مجدولٍ يسقط بـ`no_tokens`. **وكان يُقال
 * في بطاقة القناة وحدها**، وشارةُ شاشة المنصّة ونقطةُ الرافدة و«ما ينتظرك»
 * تقول «مربوطة» خضراء. فالحكمُ هنا مرّةً، وكلُّها تقرؤه.
 */
export function unsignedAccounts(view: {
  readonly state: ChannelState
  readonly accounts: readonly LinkedAccount[]
}): LinkedAccount[] {
  if (view.state !== 'linked') return []
  return view.accounts.filter((a) => a.status !== 'needs_reauth' && a.expiresAt === null)
}

/**
 * حالُ الإذن **من الرمزين معًا** — حكمٌ واحدٌ تقرؤه البطاقةُ والبلاطة (خطّة التصميم 5.7).
 *
 * ‏كانت البطاقةُ تعدّ أيّامَ إذن الوصول وحده: X وYouTube «ينتهي الإذنُ اليوم» برتقاليّةً
 * ‏وهما تتجدّدان وحدهما (`dueForRenewal`)، والبلاطةُ فوقهما «تحتاج تجديدا 0»، وصفحةُ X
 * ‏«تنشر». فالموعدُ الذي يوجب يدَ المالك هو انتهاءُ **إذن التجديد** حين يكون، وانتهاءُ
 * ‏إذن الوصول حين لا يكون — وهو جدولُ `token/expiry.ts` نفسُه.
 */
export type TokenHealth =
  /** انتهى ولا تجديدَ ينقذه: النشرُ متوقّفٌ حتّى يُعاد الربط. */
  | { readonly kind: 'expired'; readonly at: string }
  /** ينتهي خلال أسبوعٍ ولا يتجدّد وحده بعده: يُعاد الربطُ قبل موعده. */
  | { readonly kind: 'soon'; readonly days: number; readonly at: string }
  /** إذنُ التجديد قائمٌ وإذنُ الوصول فات: الدورةُ لم تجدّده بعد. */
  | { readonly kind: 'overdue'; readonly at: string }
  /** يتجدّد وحده، وموعدُ إذن التجديد بعيدٌ أو لا موعدَ له. */
  | { readonly kind: 'auto'; readonly days: number | null; readonly at: string | null }
  /** صالحٌ أيّامًا، ولا تجديدَ معه. */
  | { readonly kind: 'ok'; readonly days: number; readonly at: string }

/** أسبوعٌ فأقلُّ تحذير — عتبةُ تنبيه صدر اللوحة الأولى (D-065). */
export const RELINK_WARN_DAYS = 7

/** ‏بقراءة `tokenDays` نفسِها: طابعُ SQLite أو ISO، وUTC ما لم يُقَل غيرُه. */
function daysTo(at: string, now: Date): number | null {
  const ms = Date.parse(at.replace(' ', 'T') + (at.endsWith('Z') ? '' : 'Z'))
  return Number.isNaN(ms) ? null : Math.floor((ms - now.getTime()) / 86_400_000)
}

/** `null` حين لا إذنَ محفوظًا أو لا يُقرأ موعدُه — فلا يُقال شيء. */
export function tokenHealth(
  a: Pick<LinkedAccount, 'expiresAt' | 'renewable' | 'refreshExpiresAt'>,
  now: Date,
): TokenHealth | null {
  if (a.expiresAt === null) return null
  const access = daysTo(a.expiresAt, now)
  if (access === null) return null
  const refreshAt = a.refreshExpiresAt ?? null
  const refresh = refreshAt === null ? null : daysTo(refreshAt, now)
  // ‏وإذنُ تجديدٍ انتهى لا يجدّد شيئًا: يُعَدّ من إذن الوصول كأن لا تجديد
  if (a.renewable === true && (refresh === null || refresh >= 0)) {
    if (access < 0) return { kind: 'overdue', at: a.expiresAt }
    if (refresh !== null && refresh <= RELINK_WARN_DAYS) return { kind: 'soon', days: refresh, at: refreshAt! }
    return { kind: 'auto', days: refresh, at: refresh === null ? null : refreshAt }
  }
  if (access < 0) return { kind: 'expired', at: a.expiresAt }
  if (access <= RELINK_WARN_DAYS) return { kind: 'soon', days: access, at: a.expiresAt }
  return { kind: 'ok', days: access, at: a.expiresAt }
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

/**
 * **حالٌ واحدةٌ لكلّ منصّة، من الرمزين معًا** (خطّة التصميم 5.7 · D-205).
 *
 * كانت البطاقةُ تجمع حالين: شارةَ القناة («مربوطة» خضراء، من `state` وحدَه) وشارةَ كلّ حسابٍ تحتها
 * («انتهى الإذن» حمراء، من `tokenHealth`). فيقرأ المالكُ «مربوطة» و«انتهى الإذن» على منصّةٍ واحدة،
 * ولا يدري أيّهما يصدّق. والرئيسيّةُ والرافدةُ تحكمان كلٌّ بشرطه. **فالحكمُ هنا مرّةً**، ويُقرأ منه كلُّ
 * موضعٍ يقول حالَ منصّة: بطاقةُ «الحسابات» وترتيبُها، وبلاطاتُها، وصفُّ الرئيسيّة، ونقطةُ الرافدة، وعددُها.
 *
 * - `broken` منقطعة: إذنٌ سُحب أو انتهى ولا تجديدَ معه، أو حسابٌ محفوظٌ بلا إذن. **النشرُ متوقّف**.
 * - `expiring` تحتاج إعادةَ ربطٍ خلال أيّام: إذنٌ لا يتجدّد وحده ويقترب موعدُه (`RELINK_WARN_DAYS`).
 * - `setup` تحتاج إعدادًا: ينقص سرّا التطبيق. · `connectable` جاهزةٌ للربط. · `connected` متّصلة.
 * - `unbuilt` قريبًا: لا سائقَ لها.
 *
 * ولا تُذكر فيها «إذنُ التجديد» ولا «إذنُ الوصول» (خطّة التصميم 8.2): ذاك تفصيلُ شاشة المنصّة.
 */
export type ChannelHealthKind = 'broken' | 'expiring' | 'setup' | 'connectable' | 'connected' | 'unbuilt'

export interface ChannelHealth {
  readonly kind: ChannelHealthKind
  readonly tone: 'ok' | 'bad' | 'warn' | 'idle'
  readonly label: string
  /** الفعلُ الواحد — `null` لما لم يُبنَ. */
  readonly button: { readonly label: string; readonly href: string; readonly primary: boolean } | null
  /** للمنقطعة والقريبة انتهاؤها: أقلُّ ما بقي من أيّام. */
  readonly days?: number
}

/** ترتيبُ الحاجة (خطّة التصميم 5.7): المنقطعةُ، ثمّ ما يحتاج فعلًا، ثمّ المتّصلة، ثمّ القريبة. */
export const HEALTH_ORDER: readonly ChannelHealthKind[] = ['broken', 'expiring', 'setup', 'connectable', 'connected', 'unbuilt']

function inDays(days: number): string {
  if (days <= 0) return 'اليوم'
  if (days === 1) return 'خلال يوم'
  if (days === 2) return 'خلال يومين'
  if (days <= 10) return `خلال ${days} أيّام`
  return `خلال ${days} يومًا`
}

export function channelHealth(v: ChannelView, now: Date): ChannelHealth {
  const id = encodeURIComponent(v.spec.id)
  const relink = { label: 'أعد الربط', href: `/oauth/${id}/start`, primary: true }
  if (v.state === 'unbuilt') return { kind: 'unbuilt', tone: 'idle', label: 'قريبًا', button: null }
  if (v.state === 'awaiting_owner') {
    return { kind: 'setup', tone: 'warn', label: 'تحتاج إعدادًا', button: { label: 'أكمل الإعداد', href: setupHref(v.spec.id), primary: true } }
  }
  if (v.state === 'connectable') {
    return { kind: 'connectable', tone: 'warn', label: 'جاهزة للربط', button: { label: 'اربط', href: `/oauth/${id}/start`, primary: true } }
  }
  const health = v.accounts.map((a) => tokenHealth(a, now))
  if (v.state === 'needs_reauth' || unsignedAccounts(v).length > 0 || health.some((h) => h?.kind === 'expired')) {
    return { kind: 'broken', tone: 'bad', label: 'منقطعة', button: relink }
  }
  const soon = health.flatMap((h) => (h?.kind === 'soon' ? [h.days] : []))
  if (soon.length > 0) {
    const days = Math.min(...soon)
    return { kind: 'expiring', tone: 'warn', label: `تحتاج إعادة ربط ${inDays(days)}`, button: relink, days }
  }
  return { kind: 'connected', tone: 'ok', label: 'متّصلة', button: { label: 'افتح', href: `/panel/channels/${id}`, primary: false } }
}

/** المنصّاتُ بترتيب الحاجة — وما تساوى بقي بترتيب السجلّ. */
export function byNeed(views: readonly ChannelView[], now: Date): ChannelView[] {
  const rank = (v: ChannelView): number => HEALTH_ORDER.indexOf(channelHealth(v, now).kind)
  return views.map((v, i) => ({ v, i, r: rank(v) })).sort((a, b) => a.r - b.r || a.i - b.i).map((x) => x.v)
}


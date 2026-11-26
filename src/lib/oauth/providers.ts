/**
 * تعريف المنصتين في موضع واحد.
 *
 * عناوين النهايات تتغير — X نقل نطاقه من `twitter.com` إلى `x.com` — فلا
 * تُكتب في أكثر من موضع. أي تصحيح يقع هنا وحده.
 *
 * تحذير موثق في docs/PLATFORMS.md: عناوين X ونطاقاته لم تُؤكد من الوثائق
 * الرسمية وقت التحقق (2026-09-02) لأن `developer.x.com` كان محجوبا. أول
 * دورة OAuth حقيقية هي التي تؤكدها، والمهمة M-04 تطلب التحقق منها.
 */

import { INSTAGRAM_VIA_PAGE as INSTAGRAM_VIA_PAGE_SCOPES, scopeSet } from './scopes'

/**
 * ما يُربَط. **أربعٌ**، واثنتان منها تنشران.
 *
 * والفرقُ بين النوعين ليس تفصيلا: `PublishPlatform` هو ما يقابل
 * `CHECK (platform IN (…))` في `posts`، **فالمترجمُ يمنع كتابةَ مسوّدةٍ
 * لمنصّةٍ لا تنشر قبل أن تمنعها القاعدة**.
 */
/**
 * معرِّفاتُ المنصّات — **قائمةٌ حيّةٌ يُشتَقّ منها النوع**.
 *
 * والنوعُ يُمحى عند البناء، **والفحصُ يقع في التشغيل**. فمن كتب الاتّحادَ
 * يدا في `state.ts` بقي عنده أربعٌ حين صارت خمسا (D-121) — وهي علّةُ
 * `SETTING_KEYS` بعينها (D-110). **فمنصّةٌ تُضاف تدخل الاثنين معا أو لا
 * تدخل أيّهما.**
 */
export const PLATFORM_IDS = ['linkedin', 'x', 'youtube', 'tiktok', 'instagram'] as const

export type Platform = (typeof PLATFORM_IDS)[number]

/**
 * **الاسمُ بجانب المعرِّف — في موضعٍ واحد** (D-123 · D-125).
 *
 * `linkedin` مفتاحٌ في القاعدة و`LinkedIn` اسمٌ في الشاشة. وكان الاسمُ
 * يُكتب في ثلاثة مواضع (اللوحُ المحوريّ، والمراجعة، والقنوات) **ويُترَك
 * في مواضعَ أخرى بحرف المفتاح** — بوّابةُ التأسيس ورحلةُ المنشور. فيُعرَّف
 * هنا مرّةً، ومن احتاج الاسمَ قرأه من هنا.
 *
 * **والقاموسُ ناقصٌ عمدا**: ما ليس فيه يُعرَض بحرفه لا بـ«غير معروف».
 */
export const PLATFORM_LABEL: Readonly<Record<Platform, string>> = {
  linkedin: 'LinkedIn', x: 'X', youtube: 'YouTube', tiktok: 'TikTok', instagram: 'Instagram',
}

export function platformLabel(id: string): string {
  // ‏وصفحةُ LinkedIn وجهةٌ لا منصّة (D-423): `linkedin-page` في الخطّة والتقويم والفرز
  if (id === 'linkedin-page') return 'LinkedIn · صفحة'
  return (PLATFORM_LABEL as Readonly<Record<string, string>>)[id] ?? id
}

/** ما بُني له سائقُ نشرٍ فعلا — ويقابل قيدَ `posts.platform`. */
/**
 * ما تنشر اليوم — **ويُوسَّع مع سائقه لا قبله** (D-092).
 *
 * TikTok تنشر بالصندوق (`video.upload`) بلا انتظار إجازة، وبالنشر
 * المباشر (`video.publish`) بعدها. و YouTube ترفع خاصّا فينشره المالك.
 *
 * **وInstagram دخلت في 0022** بسائقها: حاويةٌ ثمّ نشر. **ولا منشورَ
 * نصّيٌّ فيها** — وذلك يُحرَس في السائق، والقاعدةُ تحرس الوجهةَ لا الشكل.
 */
export type PublishPlatform = 'linkedin' | 'x' | 'tiktok' | 'youtube' | 'instagram'

export interface Provider {
  readonly platform: Platform
  readonly authorizeUrl: string
  readonly tokenUrl: string
  readonly identityUrl: string
  /** نهاية إنشاء منشور نصي. */
  readonly postUrl: string
  /**
   * نهايةُ رفع الصور — **لم تُؤكَّد من الوثائق** (D-040).
   *
   * الشبكةُ كانت محجوبةً وقت الكتابة، ونهاياتُ X مشكوكٌ فيها في هذا
   * الملفّ أصلا. فتُوضع هنا حيث يُصحَّح كلُّ عنوانٍ بسطر — وأوّلُ رفعٍ
   * حقيقيّ هو الذي يؤكّدها.
   */
  readonly uploadUrl: string
  /**
   * النطاقاتُ الكاملة — **مشتقّةٌ من `scopes.ts` لا مكتوبةٌ هنا ثانيةً**.
   *
   * ولو كُتبت في الموضعين لافترقتا: نطاقٌ يُضاف هناك بشرحه ومصدره
   * ويُنسى هنا، فيُشرَح في الشاشة ما لا يُطلَب في الرابط.
   */
  readonly scopes: readonly string[]
  /**
   * كيف يُصادق التطبيق على نهاية الرمز:
   * - `body`   : client_id و client_secret في جسم الطلب (LinkedIn)
   * - `basic`  : ترويسة Basic بـ client_id:client_secret (X)
   */
  readonly clientAuth: 'body' | 'basic'
  /**
   * أتدعم المنصّةُ PKCE؟ (D-075)
   *
   * **وكان يُرسَل إلى الجميع** — «لأنّ المسار واحدٌ ولا يتشعّب بحالتين».
   * ووحدةُ المسار مكسبٌ ما دام المُرسَلُ مفهوما عند المستقبِل؛ **و
   * LinkedIn لا تدعم PKCE أصلا**، فكنّا نرسل `code_challenge` في رابط
   * الإذن و`code_verifier` عند التبديل — **حقلين لبروتوكولٍ لا يجري**.
   *
   * ولا يُقال هنا إنّ ذلك سببُ رفضٍ بعينه: **لم يُقَس** — الرمزُ
   * المزيّف يوقف الفحصَ قبل موضع الحكم، ولا رمزَ صحيحٌ عندي. لكنّ
   * **إرسالَ ما لا يُفهَم ليس حيادا**، وإسقاطُه يضيّق دائرةَ الشكّ.
   */
  readonly pkce: boolean
  /** ترويسات إلزامية على كل طلب مُصدَّر. */
  readonly extraHeaders: Readonly<Record<string, string>>
  /**
   * اسمُ حقل المعرّف في رابط الإذن.
   *
   * **TikTok يسمّيه `client_key` لا `client_id`** — وهو خروجٌ عن
   * OAuth 2.0، ورابطٌ يحمل الاسمَ المعياريَّ يُردّ بخطأٍ لا يذكر السبب.
   */
  readonly clientIdParam?: string
  /**
   * معاملاتٌ إضافيّةٌ في رابط الإذن.
   *
   * **و Google لا يعطي إذنَ تجديدٍ بلا `access_type=offline`** — ولا
   * يعطيه ثانيةً بلا `prompt=consent` لمن وافق مرّة. فمن أغفلهما رُبط
   * حسابُه ثمّ سقط بعد ساعة، **ولا شيء يقول لماذا**.
   */
  readonly extraAuthorize?: Readonly<Record<string, string>>
}

/**
 * LinkedIn يوجب `LinkedIn-Version: YYYYMM` على طلبات واجهته المُصدَّرة.
 * تُرفع مع كل إصدار جديد بعد قراءة ملاحظات التغيير، لا تلقائيا.
 */
export const LINKEDIN_VERSION = '202606'

export const LINKEDIN: Provider = {
  platform: 'linkedin',
  authorizeUrl: 'https://www.linkedin.com/oauth/v2/authorization',
  tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
  identityUrl: 'https://api.linkedin.com/v2/userinfo',
  postUrl: 'https://api.linkedin.com/rest/posts',
  // خطوتان: تهيئةٌ تعطي عنوانَ رفعٍ ومعرّفَ صورة، ثمّ PUT للبايتات عليه
  uploadUrl: 'https://api.linkedin.com/rest/images?action=initializeUpload',
  scopes: scopeSet('linkedin'),
  clientAuth: 'body',
  pkce: false,   // **LinkedIn لا تدعم PKCE** (D-075)
  extraHeaders: { 'LinkedIn-Version': LINKEDIN_VERSION },
}

export const X: Provider = {
  platform: 'x',
  authorizeUrl: 'https://x.com/i/oauth2/authorize',
  tokenUrl: 'https://api.x.com/2/oauth2/token',
  identityUrl: 'https://api.x.com/2/users/me',
  postUrl: 'https://api.x.com/2/tweets',
  uploadUrl: 'https://api.x.com/2/media/upload',
  scopes: scopeSet('x'),
  clientAuth: 'basic',
  pkce: true,
  extraHeaders: {},
}

/**
 * YouTube — عبر Google OAuth.
 *
 * **ونهايةُ الرفع مستأنَفة** (`uploadType=resumable`): يُطلَب عنوانُ
 * جلسةٍ أوّلا ثمّ تُدفَع البايتات إليه. وهي غيرُ نهاية `videos.insert`
 * العاديّة — ومقطعٌ بخمسَ عشرةَ ثانيةً يمرّ في دفعةٍ واحدة.
 */
export const YOUTUBE: Provider = {
  platform: 'youtube',
  authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token',
  identityUrl: 'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
  postUrl:
    'https://www.googleapis.com/upload/youtube/v3/videos' +
    '?uploadType=resumable&part=snippet,status',
  uploadUrl:
    'https://www.googleapis.com/upload/youtube/v3/videos' +
    '?uploadType=resumable&part=snippet,status',
  scopes: scopeSet('youtube'),
  clientAuth: 'body',
  pkce: true,
  extraHeaders: {},
  // بلا هذين لا إذنَ تجديد — والحسابُ يسقط بعد ساعةٍ بلا سببٍ يُقرأ
  extraAuthorize: { access_type: 'offline', prompt: 'consent' },
}

/**
 * TikTok — Content Posting API.
 *
 * **ويسمّي المعرّفَ `client_key`** في رابط الإذن، لا `client_id`.
 */
export const TIKTOK: Provider = {
  platform: 'tiktok',
  authorizeUrl: 'https://www.tiktok.com/v2/auth/authorize/',
  tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
  identityUrl:
    'https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url',
  postUrl: 'https://open.tiktokapis.com/v2/post/publish/video/init/',
  uploadUrl: 'https://open.tiktokapis.com/v2/post/publish/inbox/video/init/',
  scopes: scopeSet('tiktok'),
  clientAuth: 'body',
  pkce: true,
  extraHeaders: {},
  clientIdParam: 'client_key',
}

/**
 * Instagram — **Instagram Business Login**، وهو الطريقُ الأقصر.
 *
 * ## والنشرُ خطوتان لا واحدة
 *
 * `POST /media` يُنشئ **حاويةً** بعنوان الوسيط ونصِّه، ثمّ
 * `POST /media_publish` ينشرها بمعرِّف الحاوية. **والوسيطُ يُسحَب من
 * عنوانٍ عامّ** — لا يُدفَع بايتاتٍ كما في X.
 *
 * **ولا منشورَ نصّيٌّ في Instagram**: صورةٌ أو مقطع. وذلك يُحرَس في
 * السائق، **والقاعدةُ تحرس الوجهةَ لا الشكل**.
 *
 * ## وحسابٌ احترافيٌّ شرطٌ لا تفصيل
 *
 * حسابٌ شخصيٌّ لا يفتح هذه النهاياتِ أصلا — **والردُّ حينئذٍ ‏٤٠٠ لا
 * ‏٤٠٣**، فيُقرأ «طلبٌ خطأ» وهو «حسابٌ خطأ».
 */
export const INSTAGRAM: Provider = {
  platform: 'instagram',
  authorizeUrl: 'https://www.instagram.com/oauth/authorize',
  tokenUrl: 'https://api.instagram.com/oauth/access_token',
  identityUrl: 'https://graph.instagram.com/v21.0/me?fields=id,username',
  postUrl: 'https://graph.instagram.com/v21.0/me/media_publish',
  uploadUrl: 'https://graph.instagram.com/v21.0/me/media',
  scopes: scopeSet('instagram'),
  clientAuth: 'body',
  pkce: false,
  extraHeaders: {},
  clientIdParam: 'client_id',
}

/**
 * والطريقُ الثاني — **Facebook Login for Business**، عبر صفحة.
 *
 * **ولا يدخل `PROVIDERS`**: المنصّةُ في القاعدة واحدةٌ (`instagram`)،
 * وهذا اختلافُ إذنٍ لا اختلافُ وجهة. فيُختار عند الربط، **ولو دخل
 * الجدولَ لانقسم كلُّ تقريرٍ على منصّةٍ واحدة**.
 *
 * ويوجب صفحةً مربوطةً بالحساب، **ومراجعةَ تطبيقٍ أطول** — ويعطي
 * إحصاءاتٍ أوسعَ وإدارةَ تعليقات.
 */
export const INSTAGRAM_VIA_PAGE: Provider = {
  platform: 'instagram',
  authorizeUrl: 'https://www.facebook.com/v21.0/dialog/oauth',
  tokenUrl: 'https://graph.facebook.com/v21.0/oauth/access_token',
  identityUrl: 'https://graph.facebook.com/v21.0/me/accounts'
    + '?fields=instagram_business_account{id,username},name',
  postUrl: 'https://graph.facebook.com/v21.0/me/media_publish',
  uploadUrl: 'https://graph.facebook.com/v21.0/me/media',
  scopes: INSTAGRAM_VIA_PAGE_SCOPES.map((x) => x.name),
  clientAuth: 'body',
  pkce: false,
  extraHeaders: {},
  clientIdParam: 'client_id',
}

export const PROVIDERS: Readonly<Record<Platform, Provider>> = {
  linkedin: LINKEDIN,
  x: X,
  youtube: YOUTUBE,
  tiktok: TIKTOK,
  instagram: INSTAGRAM,
}

/**
 * رابط العودة يُبنى من `PUBLIC_BASE_URL` ولا يُكتب ثابتا.
 *
 * قاعدة CLAUDE.md: النطاقان لا يُخلطان في callback URL ولا في ثابت ولا في
 * وثيقة. بيئة واحدة تعني رابطا واحدا، وهو ما سُجل في بوابة المنصة.
 */
export function redirectUri(baseUrl: string, platform: Platform): string {
  const base = baseUrl.replace(/\/+$/, '')
  return `${base}/oauth/${platform}/callback`
}

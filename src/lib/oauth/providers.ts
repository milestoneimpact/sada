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

import { scopeSet } from './scopes'

/**
 * ما يُربَط. **أربعٌ**، واثنتان منها تنشران.
 *
 * والفرقُ بين النوعين ليس تفصيلا: `PublishPlatform` هو ما يقابل
 * `CHECK (platform IN (…))` في `posts`، **فالمترجمُ يمنع كتابةَ مسوّدةٍ
 * لمنصّةٍ لا تنشر قبل أن تمنعها القاعدة**.
 */
export type Platform = 'linkedin' | 'x' | 'youtube' | 'tiktok'

/** ما بُني له سائقُ نشرٍ فعلا — ويقابل قيدَ `posts.platform`. */
export type PublishPlatform = 'linkedin' | 'x'

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
   * **و Google لا يعطي رمزَ تجديدٍ بلا `access_type=offline`** — ولا
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
  // بلا هذين لا رمزَ تجديد — والحسابُ يسقط بعد ساعةٍ بلا سببٍ يُقرأ
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

export const PROVIDERS: Readonly<Record<Platform, Provider>> = {
  linkedin: LINKEDIN,
  x: X,
  youtube: YOUTUBE,
  tiktok: TIKTOK,
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

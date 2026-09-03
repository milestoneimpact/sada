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

export type Platform = 'linkedin' | 'x'

export interface Provider {
  readonly platform: Platform
  readonly authorizeUrl: string
  readonly tokenUrl: string
  readonly identityUrl: string
  readonly scopes: readonly string[]
  /**
   * كيف يُصادق التطبيق على نهاية الرمز:
   * - `body`   : client_id و client_secret في جسم الطلب (LinkedIn)
   * - `basic`  : ترويسة Basic بـ client_id:client_secret (X)
   */
  readonly clientAuth: 'body' | 'basic'
  /** ترويسات إلزامية على كل طلب مُصدَّر. */
  readonly extraHeaders: Readonly<Record<string, string>>
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
  scopes: ['openid', 'profile', 'w_member_social'],
  clientAuth: 'body',
  extraHeaders: { 'LinkedIn-Version': LINKEDIN_VERSION },
}

export const X: Provider = {
  platform: 'x',
  authorizeUrl: 'https://x.com/i/oauth2/authorize',
  tokenUrl: 'https://api.x.com/2/oauth2/token',
  identityUrl: 'https://api.x.com/2/users/me',
  scopes: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
  clientAuth: 'basic',
  extraHeaders: {},
}

export const PROVIDERS: Readonly<Record<Platform, Provider>> = { linkedin: LINKEDIN, x: X }

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

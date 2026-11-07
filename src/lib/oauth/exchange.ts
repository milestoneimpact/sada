/**
 * تبديل `code` برمز، وتجديد الرمز المنتهي.
 *
 * ما يخرج من هنا لا يُسجل ولا يُعاد في استجابة. رسائل الخطأ تحمل حالة
 * الطلب وسببه، ولا تحمل جسم الاستجابة كاملا لئلا يتسرب رمز في سجل.
 */
import type { Provider } from './providers'
import { withTimeout } from '../net/timeout'

/**
 * ‏مهلةُ نهاية الرمز (D-320): التجديدُ يقع في الدورة قبل الإرسال، ونهايةٌ تعلق كانت تؤخّر ما بعدها حتّى يُقتَل الاستدعاء.
 * ‏وخمسَ عشرةَ ثانيةً أضعافُ ما تحتاجه نهايةٌ سليمة.
 */
export const OAUTH_TIMEOUT_MS = 15_000

export interface TokenResponse {
  readonly accessToken: string
  readonly refreshToken: string | null
  /** لحظة الانتهاء بصيغة ISO، محسوبة من `expires_in` وقت الرد. */
  readonly expiresAt: string
  readonly refreshExpiresAt: string | null
  readonly scopes: string
}

export class OAuthError extends Error {
  override readonly name = 'OAuthError'
  constructor(
    message: string,
    readonly status: number,
    /**
     * رمزُ المزوّد كما عاد — `invalid_client` مثلا.
     *
     * **ويُحمَل حقلا لا يُستخرَج من نصّ الرسالة**: الرسالةُ عربيّةٌ
     * قابلةٌ للتحسين، وتشخيصٌ يقرأ صياغتَنا **ينكسر عند أوّل تحرير**
     * ولا ينكسر ظاهرا — يسقط إلى فرعٍ عامّ ويبدو أنّه يعمل (D-054).
     */
    readonly code?: string,
    /**
     * وصفُ المزوّد كما عاد — **وكان يُرمى.**
     *
     * D-054 التقط الوصفَ في ساق الإذن وحدها، **وساقُ تبديل الرمز
     * بقيت تقرأ `error` وتُهمل `error_description`** — وهي الساقُ
     * التي تفشل بعد أن ينجح كلُّ شيءٍ قبلها، فأحوجُ ما تكون إلى بيان.
     *
     * وهو **نصُّ المزوّد لا نصُّنا**، فيُعرَض مقتبَسا ومهرَّبا ولا
     * يُبنى عليه قرار (D-054: يُضيّق ولا يقرّر).
     */
    readonly description?: string,
  ) {
    super(message)
  }
}

export interface ClientCredentials {
  readonly clientId: string
  readonly clientSecret: string
}

function authHeaders(provider: Provider, creds: ClientCredentials): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json',
  }
  if (provider.clientAuth === 'basic') {
    headers['Authorization'] = `Basic ${btoa(`${creds.clientId}:${creds.clientSecret}`)}`
  }
  return headers
}

function withClientInBody(
  provider: Provider,
  creds: ClientCredentials,
  body: URLSearchParams,
): URLSearchParams {
  if (provider.clientAuth === 'body') {
    body.set('client_id', creds.clientId)
    body.set('client_secret', creds.clientSecret)
  } else {
    // X يطلب client_id في الجسم أيضا مع Basic على مسار PKCE
    body.set('client_id', creds.clientId)
  }
  return body
}

interface RawToken {
  access_token?: unknown
  refresh_token?: unknown
  expires_in?: unknown
  refresh_token_expires_in?: unknown
  scope?: unknown
}

function parseToken(raw: RawToken, now: Date, requestedScopes: readonly string[]): TokenResponse {
  if (typeof raw.access_token !== 'string' || raw.access_token.length === 0) {
    throw new OAuthError('الاستجابة بلا access_token', 502)
  }
  if (typeof raw.expires_in !== 'number' || raw.expires_in <= 0) {
    throw new OAuthError('الاستجابة بلا expires_in صالح', 502)
  }
  const expiresAt = new Date(now.getTime() + raw.expires_in * 1000).toISOString()

  const refreshToken = typeof raw.refresh_token === 'string' ? raw.refresh_token : null
  const refreshExpiresAt =
    refreshToken !== null && typeof raw.refresh_token_expires_in === 'number'
      ? new Date(now.getTime() + raw.refresh_token_expires_in * 1000).toISOString()
      : null

  // X لا يعيد `scope` أحيانا؛ نسجل ما طلبناه بدل أن نترك الحقل فارغا
  const scopes = typeof raw.scope === 'string' && raw.scope.length > 0
    ? raw.scope
    : requestedScopes.join(' ')

  return { accessToken: raw.access_token, refreshToken, expiresAt, refreshExpiresAt, scopes }
}

async function postForm(
  provider: Provider,
  creds: ClientCredentials,
  body: URLSearchParams,
  now: Date,
  fetchImpl: typeof fetch,
  requested: readonly string[],
): Promise<TokenResponse> {
  const response = await fetchImpl(provider.tokenUrl, {
    method: 'POST',
    headers: authHeaders(provider, creds),
    body: withClientInBody(provider, creds, body),
  })
  if (!response.ok) {
    // `error` وحده: وصف المزود قد يحمل قيما لا تُسجل
    let code = 'unknown'
    let description: string | undefined
    try {
      const failure = (await response.json()) as { error?: unknown; error_description?: unknown }
      if (typeof failure.error === 'string') code = failure.error
      // **يُقصّ عندنا**: نصُّ مزوّدٍ بلا حدٍّ يُعرَض في صفحةٍ ويُسجَّل
      if (typeof failure.error_description === 'string' && failure.error_description.length > 0) {
        description = failure.error_description.slice(0, 300)
      }
    } catch {
      code = 'unparsable'
    }
    throw new OAuthError(
      `${provider.platform}: رفض نهاية الرمز (${code})`,
      response.status,
      code,
      description,
    )
  }
  return parseToken((await response.json()) as RawToken, now, requested)
}

/** يبدل `code` برمز وصول. `verifier` هو PKCE code_verifier. */
export function exchangeCode(
  provider: Provider,
  creds: ClientCredentials,
  params: {
    code: string
    redirectUri: string
    verifier: string
    /**
     * ما طُلب في **هذه** الدورة — لا نطاقاتُ المزوّد الكاملة.
     *
     * فدورةُ النجاة تطلب الهويّةَ وحدها (D-045)، ومن سجّل الكاملةَ
     * مكانها كتب في القاعدة أنّ الحسابَ ينشر وهو لا ينشر — **والحارسُ
     * يقرأ من القاعدة**، فيمرّ ما كان يجب أن يُمنَع.
     */
    readonly requestedScopes?: readonly string[]
  },
  now: Date = new Date(),
  fetchImpl: typeof fetch = withTimeout(fetch, OAUTH_TIMEOUT_MS),
): Promise<TokenResponse> {
  return postForm(
    provider,
    creds,
    new URLSearchParams({
      grant_type: 'authorization_code',
      code: params.code,
      redirect_uri: params.redirectUri,
      // **ولا يُرسَل إلّا لمن أُرسل إليه `code_challenge`** (D-075):
      // مُثبِتٌ لتحدٍّ لم يُطلَب ليس إثباتا
      ...(provider.pkce ? { code_verifier: params.verifier } : {}),
    }),
    now,
    fetchImpl,
    params.requestedScopes ?? provider.scopes,
  )
}

/** يجدد رمز وصول منتهيا أو موشكا. */
export function refreshToken(
  provider: Provider,
  creds: ClientCredentials,
  refresh: string,
  now: Date = new Date(),
  fetchImpl: typeof fetch = withTimeout(fetch, OAUTH_TIMEOUT_MS),
  /** ما كان ممنوحا قبل التجديد: التجديدُ لا يوسّع نطاقا، فلا يُفترَض أوسع. */
  granted: readonly string[] = provider.scopes,
): Promise<TokenResponse> {
  return postForm(
    provider,
    creds,
    new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refresh }),
    now,
    fetchImpl,
    granted,
  )
}

/** هل بقي على الانتهاء أقل من الهامش؟ الافتراضي خمس دقائق. */
export function isExpiring(expiresAt: string, now: Date = new Date(), marginSeconds = 300): boolean {
  const at = Date.parse(expiresAt)
  if (Number.isNaN(at)) return true
  return at - now.getTime() <= marginSeconds * 1000
}

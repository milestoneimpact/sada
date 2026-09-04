/**
 * تبديل `code` برمز، وتجديد الرمز المنتهي.
 *
 * ما يخرج من هنا لا يُسجل ولا يُعاد في استجابة. رسائل الخطأ تحمل حالة
 * الطلب وسببه، ولا تحمل جسم الاستجابة كاملا لئلا يتسرب رمز في سجل.
 */
import type { Provider } from './providers'

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
): Promise<TokenResponse> {
  const response = await fetchImpl(provider.tokenUrl, {
    method: 'POST',
    headers: authHeaders(provider, creds),
    body: withClientInBody(provider, creds, body),
  })
  if (!response.ok) {
    // `error` وحده: وصف المزود قد يحمل قيما لا تُسجل
    let code = 'unknown'
    try {
      const failure = (await response.json()) as { error?: unknown }
      if (typeof failure.error === 'string') code = failure.error
    } catch {
      code = 'unparsable'
    }
    throw new OAuthError(`${provider.platform}: رفض نهاية الرمز (${code})`, response.status)
  }
  return parseToken((await response.json()) as RawToken, now, provider.scopes)
}

/** يبدل `code` برمز وصول. `verifier` هو PKCE code_verifier. */
export function exchangeCode(
  provider: Provider,
  creds: ClientCredentials,
  params: { code: string; redirectUri: string; verifier: string },
  now: Date = new Date(),
  fetchImpl: typeof fetch = fetch,
): Promise<TokenResponse> {
  return postForm(
    provider,
    creds,
    new URLSearchParams({
      grant_type: 'authorization_code',
      code: params.code,
      redirect_uri: params.redirectUri,
      code_verifier: params.verifier,
    }),
    now,
    fetchImpl,
  )
}

/** يجدد رمز وصول منتهيا أو موشكا. */
export function refreshToken(
  provider: Provider,
  creds: ClientCredentials,
  refresh: string,
  now: Date = new Date(),
  fetchImpl: typeof fetch = fetch,
): Promise<TokenResponse> {
  return postForm(
    provider,
    creds,
    new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refresh }),
    now,
    fetchImpl,
  )
}

/** هل بقي على الانتهاء أقل من الهامش؟ الافتراضي خمس دقائق. */
export function isExpiring(expiresAt: string, now: Date = new Date(), marginSeconds = 300): boolean {
  const at = Date.parse(expiresAt)
  if (Number.isNaN(at)) return true
  return at - now.getTime() <= marginSeconds * 1000
}

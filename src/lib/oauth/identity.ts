/**
 * من هو صاحب الرمز؟
 *
 * كل منصة تجيب بشكل مختلف، فيُوحَّد الجواب هنا في `AccountIdentity` واحد
 * قبل أن يصل إلى المخزن.
 */
import type { AccountIdentity } from '../tokens'
import { OAuthError } from './exchange'
import type { Provider } from './providers'
import { withTimeout } from '../net/timeout'

interface LinkedInUserInfo {
  sub?: unknown
  name?: unknown
}

interface XUserResponse {
  data?: { id?: unknown; name?: unknown; username?: unknown }
}

export async function fetchIdentity(
  provider: Provider,
  accessToken: string,
  fetchImpl: typeof fetch = withTimeout(fetch, 15_000),
): Promise<AccountIdentity> {
  const response = await fetchImpl(provider.identityUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      ...provider.extraHeaders,
    },
  })
  if (!response.ok) {
    throw new OAuthError(`${provider.platform}: تعذّرت قراءة الهوية`, response.status)
  }
  const body: unknown = await response.json()

  if (provider.platform === 'linkedin') {
    const info = body as LinkedInUserInfo
    if (typeof info.sub !== 'string' || info.sub.length === 0) {
      throw new OAuthError('linkedin: استجابة الهوية بلا sub', 502)
    }
    return {
      platform: 'linkedin',
      kind: 'member',
      externalId: info.sub,
      displayName: typeof info.name === 'string' ? info.name : info.sub,
    }
  }

  if (provider.platform === 'youtube') {
    // قناةٌ واحدةٌ على الأقلّ: حسابُ Google بلا قناةٍ يعيد قائمةً فارغة
    const items = (body as { items?: unknown }).items
    const first = Array.isArray(items) ? (items[0] as Record<string, unknown>) : undefined
    const id = first?.['id']
    if (typeof id !== 'string' || id.length === 0) {
      throw new OAuthError(
        'youtube: لا قناة على هذا الحساب — أنشئ قناةً ثمّ أعد الربط',
        502,
      )
    }
    const snippet = first?.['snippet'] as { title?: unknown } | undefined
    return {
      platform: 'youtube',
      // القناةُ كيانٌ لا شخص، فتُسجَّل `org` — والتمييزُ يُقرأ في اللوحة
      kind: 'org',
      externalId: id,
      displayName: typeof snippet?.title === 'string' ? snippet.title : id,
    }
  }

  if (provider.platform === 'tiktok') {
    const data = (body as { data?: { user?: Record<string, unknown> } }).data?.user
    const openId = data?.['open_id']
    if (typeof openId !== 'string' || openId.length === 0) {
      throw new OAuthError('tiktok: استجابة الهوية بلا open_id', 502)
    }
    const name = data?.['display_name']
    return {
      platform: 'tiktok',
      kind: 'member',
      externalId: openId,
      displayName: typeof name === 'string' && name.length > 0 ? name : openId,
    }
  }

  const user = (body as XUserResponse).data
  if (user === undefined || typeof user.id !== 'string' || user.id.length === 0) {
    throw new OAuthError('x: استجابة الهوية بلا data.id', 502)
  }
  const handle = typeof user.username === 'string' ? `@${user.username}` : user.id
  return {
    platform: 'x',
    kind: 'member',
    externalId: user.id,
    displayName: typeof user.name === 'string' ? user.name : handle,
  }
}

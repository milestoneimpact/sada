/**
 * من هو صاحب الرمز؟
 *
 * كل منصة تجيب بشكل مختلف، فيُوحَّد الجواب هنا في `AccountIdentity` واحد
 * قبل أن يصل إلى المخزن.
 */
import type { AccountIdentity } from '../tokens'
import { OAuthError } from './exchange'
import type { Provider } from './providers'

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
  fetchImpl: typeof fetch = fetch,
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

/**
 * النشر النصي على المنصتين — المرحلة صفر.
 *
 * الصور والمستندات في المرحلة الثانية؛ ما هنا نصٌّ فقط، وهو ما تطلبه
 * بوابة خروج المرحلة صفر: «منشور نصي واحد على كل منصة».
 *
 * كل دالة تُرجع معرف المنشور على المنصة، أو ترمي `PublishError` بحالتها.
 * ولا تكتب في قاعدة ولا تسجل تكلفة: ذلك من عمل المستهلك، الذي يرتّب
 * السجل قبل الإرسال (D-008).
 */
import { LINKEDIN, X } from '../oauth/providers'

export class PublishError extends Error {
  override readonly name = 'PublishError'
  constructor(
    message: string,
    readonly status: number,
    /** هل يستحق إعادة محاولة؟ 5xx و 429 نعم، و 4xx غيرها لا. */
    readonly retryable: boolean,
  ) {
    super(message)
  }
}

function classify(status: number): boolean {
  return status === 429 || status >= 500
}

async function errorCode(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown; title?: unknown; detail?: unknown }
    for (const field of [body.error, body.title, body.detail]) {
      if (typeof field === 'string' && field.length > 0) return field.slice(0, 120)
    }
  } catch {
    return 'unparsable'
  }
  return 'unknown'
}

export interface PublishResult {
  readonly platformPostId: string
  readonly request: unknown
  readonly response: unknown
}

/**
 * LinkedIn — Posts API.
 * `author` هو `urn:li:person:{sub}` للحساب الشخصي، وقد جاء `sub` من
 * `/v2/userinfo` وقت الربط وحُفظ في `accounts.external_id`.
 */
export async function publishLinkedIn(
  accessToken: string,
  authorUrn: string,
  text: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PublishResult> {
  const request = {
    author: authorUrn,
    commentary: text,
    visibility: 'PUBLIC',
    distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
  }
  const response = await fetchImpl(LINKEDIN.postUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
      ...LINKEDIN.extraHeaders,
    },
    body: JSON.stringify(request),
  })
  if (!response.ok) {
    throw new PublishError(
      `linkedin: رفض النشر (${await errorCode(response)})`,
      response.status,
      classify(response.status),
    )
  }
  // LinkedIn يعيد المعرف في ترويسة، لا في الجسم
  const id = response.headers.get('x-restli-id') ?? response.headers.get('x-linkedin-id')
  if (id === null || id.length === 0) {
    throw new PublishError('linkedin: نجح الطلب بلا معرف منشور', 502, false)
  }
  return { platformPostId: id, request, response: { id } }
}

/** X — POST /2/tweets. */
export async function publishX(
  accessToken: string,
  text: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PublishResult> {
  const request = { text }
  const response = await fetchImpl(X.postUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  if (!response.ok) {
    throw new PublishError(
      `x: رفض النشر (${await errorCode(response)})`,
      response.status,
      classify(response.status),
    )
  }
  const body = (await response.json()) as { data?: { id?: unknown } }
  const id = body.data?.id
  if (typeof id !== 'string' || id.length === 0) {
    throw new PublishError('x: نجح الطلب بلا data.id', 502, false)
  }
  return { platformPostId: id, request, response: body }
}

/**
 * النشر على المنصتين — نصّا وصورة.
 *
 * ## الرفعُ خطوتان عند LinkedIn وواحدةٌ عند X
 *
 * LinkedIn يوجب تهيئةً تعطي عنوانَ رفعٍ ومعرّفَ صورة، ثمّ `PUT` للبايتات
 * على ذلك العنوان — **وهو عنوانٌ مؤقّتٌ لا يُخزَّن**. و X يقبل الملفّ في
 * طلبٍ واحد. فاختلافُ الخطوتين يبقى هنا، ولا يراه المنادي.
 *
 * ## وما لم يُؤكَّد يُقال
 *
 * نهايتا الرفع مكتوبتان على المواصفة **ولم تُجرَّبا حيّا** — الشبكة كانت
 * محجوبة. وهما في `providers.ts` وحده، فالتصحيحُ سطران (D-040).
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
  imageUrn: string | null = null,
): Promise<PublishResult> {
  const request = {
    author: authorUrn,
    commentary: text,
    visibility: 'PUBLIC',
    distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
    // الصورةُ تُلحَق بمعرّفها لا ببايتاتها: رُفعت قبل هذا الطلب
    ...(imageUrn === null ? {} : { content: { media: { id: imageUrn } } }),
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
  mediaId: string | null = null,
): Promise<PublishResult> {
  const request = { text, ...(mediaId === null ? {} : { media: { media_ids: [mediaId] } }) }
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

// ── رفعُ الصور ───────────────────────────────────────────────────────

/**
 * صورةٌ تُرفَع: بايتاتُها ونوعُها.
 *
 * وتُمرَّر جاهزةً لا تُقرأ هنا: هذه الطبقةُ تكلّم المنصّات ولا تعرف R2،
 * وطبقةٌ تعرف الاثنين تصير موضعا يُختبَر مرّتين ويُفهَم نصفَ مرّة.
 */
export interface Upload {
  readonly bytes: Uint8Array
  readonly mime: string
}

/**
 * LinkedIn — تهيئةٌ ثمّ رفع.
 *
 * ويعيد `urn:li:image:...` وهو ما يُوضَع في المنشور. **ولا يُخزَّن
 * `uploadUrl`**: مؤقّتٌ ينتهي، وحفظُه يعطي قيمةً تُجرَّب فتفشل بلا سبب
 * مفهوم.
 */
export async function uploadLinkedInImage(
  accessToken: string,
  ownerUrn: string,
  upload: Upload,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const init = await fetchImpl(LINKEDIN.uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
      ...LINKEDIN.extraHeaders,
    },
    body: JSON.stringify({ initializeUploadRequest: { owner: ownerUrn } }),
  })
  if (!init.ok) {
    throw new PublishError(
      `linkedin: تعذّرت تهيئة الرفع (${await errorCode(init)})`,
      init.status,
      classify(init.status),
    )
  }

  const body = (await init.json()) as { value?: { uploadUrl?: unknown; image?: unknown } }
  const target = body.value?.uploadUrl
  const imageUrn = body.value?.image
  if (typeof target !== 'string' || typeof imageUrn !== 'string' || imageUrn.length === 0) {
    throw new PublishError('linkedin: تهيئةٌ بلا عنوان رفعٍ أو معرّف صورة', 502, false)
  }

  const put = await fetchImpl(target, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': upload.mime },
    body: upload.bytes as unknown as BodyInit,
  })
  if (!put.ok) {
    throw new PublishError(
      `linkedin: تعذّر رفع البايتات (${put.status})`,
      put.status,
      classify(put.status),
    )
  }
  return imageUrn
}

/**
 * X — رفعٌ في طلبٍ واحد بـ multipart.
 *
 * **و X يحاسب على الرفع بسعرٍ لم يُؤكَّد** (docs/PLATFORMS.md). فالمنادي
 * يسجّل النداءَ في الدفتر بصفرٍ مُعلَّم: رقمٌ مخترَعٌ كذبٌ، وسكوتٌ عن
 * نداءٍ وقع يجعل الدفتر أقلَّ من الحقيقة.
 */
export async function uploadXMedia(
  accessToken: string,
  upload: Upload,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const form = new FormData()
  // نسخةٌ في `ArrayBuffer` صريح: `Blob` تقبله في كلّ بيئة، ونوعُ
  // `Uint8Array` العامّ لا يوافق `BlobPart` في أنواع Workers
  const buffer = upload.bytes.slice().buffer as ArrayBuffer
  form.set('media', new Blob([buffer], { type: upload.mime }))

  // ولا تُوضَع `Content-Type` يدا: `FormData` تحمل حدَّها الفاصل، وترويسةٌ
  // مكتوبةٌ بلا حدٍّ تجعل الخادم يقرأ الجسمَ فارغا
  const response = await fetchImpl(X.uploadUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  })
  if (!response.ok) {
    throw new PublishError(
      `x: تعذّر رفع الوسيط (${await errorCode(response)})`,
      response.status,
      classify(response.status),
    )
  }
  const body = (await response.json()) as { data?: { id?: unknown }; media_id_string?: unknown }
  // الاسمان مقبولان: v2 يعيد `data.id` و v1.1 يعيد `media_id_string`،
  // وقارئٌ يعرف واحدا يسقط إن تبدّلت النهاية تحتنا
  const id = body.data?.id ?? body.media_id_string
  if (typeof id !== 'string' || id.length === 0) {
    throw new PublishError('x: رفعٌ نجح بلا معرّف وسيط', 502, false)
  }
  return id
}

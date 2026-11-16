/**
 * مقطعُ الحزمة على X وLinkedIn (D-374) — **رفعٌ مقطَّع، ثمّ انتظارُ المعالجة بسقف، ثمّ المنشور**.
 *
 * ## X: أربعُ نهايات
 *
 * ‏`initialize` (بنوعه وحجمه و`tweet_video`) ← `append` لكلّ قطعة من R2 بمداها ← `finalize` ← `STATUS` يُسأل كلّما قال
 * ‏`check_after_secs` حتّى `succeeded` أو `failed` أو السقف. و**X يحاسب على كلّ طلب**، فكلُّ نداءٍ يمرّ على `onRequest`
 * ‏قبل أن يُرسَل، والمنادي يكتبه في `cost_ledger` (D-008).
 *
 * ## LinkedIn: Videos API
 *
 * ‏`initializeUpload` (بالمالك و`fileSizeBytes`) يعطي تعليماتِ رفعٍ بمدى بايتاتٍ لكلّ جزء ← `PUT` لكلّ جزء ونأخذ `etag` ←
 * ‏`finalizeUpload` بالـ`etag`ات بترتيبها ← `GET /rest/videos/{urn}` حتّى `AVAILABLE`. والترويستان المُصدَّرتان على كلّ نداء.
 *
 * ## الإعادةُ لا ترفع ثانيةً
 *
 * ‏`onStage(id, 'processing')` يُكتب في صفّ الوسيط فور `finalize`: مهلةٌ أو سقفٌ بعده يعيد الطابورُ المحاولةَ فتسأل عن
 * ‏المعرّف نفسِه (`resume`) ولا ترفع. وما سقط قبل `finalize` لا معرّفَ له يُستأنف — معرّفُ X غيرُ المكتمل ينتهي، وعنوانُ
 * ‏LinkedIn مؤقّت — فيُرفع من أوّله. والنهاياتُ مكتوبةٌ على المواصفة **ولم تُجرَّب حيًّا** (D-040)، وهي هنا وحدها.
 */
import { LINKEDIN, X } from '../oauth/providers'
import type { Clip } from './clip'
import { PublishError } from './platforms'

/** حدودُ المقطع لكلّ منصّة — من وثيقتيهما. والمدّةُ تُفحص حين تُعرف، وما لم تُعرف تقولها المنصّةُ بعد المعالجة. */
export const VIDEO_LIMITS = {
  x: { minBytes: 1, maxBytes: 512 * 1024 * 1024, maxSeconds: 140 },
  linkedin: { minBytes: 75 * 1024, maxBytes: 500 * 1024 * 1024, maxSeconds: 30 * 60 },
} as const

export type VideoTarget = keyof typeof VIDEO_LIMITS

export function isVideoTarget(platform: string): platform is VideoTarget {
  return platform === 'x' || platform === 'linkedin'
}

/** الصيغُ التي تقبلها كلُّ منصّة (D-379): X ‏MP4 وMOV، وLinkedIn ‏MP4 — وWebM لا تقبله أيٌّ منهما. */
export const VIDEO_MIMES: Readonly<Record<VideoTarget, readonly string[]>> = {
  x: ['video/mp4', 'video/quicktime'],
  linkedin: ['video/mp4'],
}

/** لماذا لا يُرفع هذا المقطعُ إلى هذه المنصّة — `null` إن وافق حدودَها. والنوعُ يُفحص حين يُعطى. */
export function videoMisfit(platform: VideoTarget, bytes: number, durationMs: number | null = null, mime: string | null = null): string | null {
  const l = VIDEO_LIMITS[platform]
  const name = platform === 'x' ? 'X' : 'LinkedIn'
  const mb = (n: number): string => (n / 1024 / 1024).toFixed(n < 1024 * 1024 ? 2 : 0)
  if (mime !== null && !VIDEO_MIMES[platform].includes(mime)) {
    return `صيغة المقطع ${mime.replace('video/', '').toUpperCase()} و${name} لا يقبل إلّا ${VIDEO_MIMES[platform].map((m) => (m === 'video/quicktime' ? 'MOV' : 'MP4')).join(' و')}`
  }
  if (bytes < l.minBytes) return `المقطع ${mb(bytes)}MB و${name} لا يقبل دون ${mb(l.minBytes)}MB`
  if (bytes > l.maxBytes) return `المقطع ${mb(bytes)}MB و${name} لا يقبل فوق ${mb(l.maxBytes)}MB`
  if (durationMs !== null && durationMs / 1000 > l.maxSeconds) {
    return `المقطع ${Math.round(durationMs / 1000)} ثانية و${name} لا يقبل فوق ${l.maxSeconds} ثانية`
  }
  return null
}

// ── مدّةُ MP4 من رأسه (D-379) ───────────────────────────────────────

/** أوّلُ ما يُقرأ من المقطع — يكفي `ftyp` و`moov` حين يكون في أوّله (faststart). */
export const HEAD_BYTES = 64 * 1024
/** سقفُ `moov` الذي يُقرأ كاملًا ليُبلغ `mvhd` — وما فوقه لا يُحمَل، فالمدّةُ «لم تُعرف». */
const MOOV_CAP = 4 * 1024 * 1024
/** سقفُ الصناديق العليا التي تُتخطّى — ملفٌّ تالفٌ لا يُدار عليه بلا نهاية. */
const MAX_BOXES = 64

const fourcc = (b: Uint8Array, at: number): string => String.fromCharCode(b[at]!, b[at + 1]!, b[at + 2]!, b[at + 3]!)
const u32 = (b: Uint8Array, at: number): number => ((b[at]! << 24) >>> 0) + (b[at + 1]! << 16) + (b[at + 2]! << 8) + b[at + 3]!
const u64 = (b: Uint8Array, at: number): number => u32(b, at) * 2 ** 32 + u32(b, at + 4)

/** رأسُ صندوق: نوعُه وحجمُه الكاملُ وطولُ رأسه — أو `null` إن لم يكفِ ما قُرئ. والحجمُ `0` «إلى آخر الملفّ». */
function boxAt(b: Uint8Array, at: number, fileSize: number): { type: string; size: number; header: number } | null {
  if (at + 8 > b.length) return null
  let size = u32(b, at)
  let header = 8
  if (size === 1) {
    if (at + 16 > b.length) return null
    size = u64(b, at + 8)
    header = 16
  } else if (size === 0) {
    size = fileSize - at
  }
  if (size < header) return null
  return { type: fourcc(b, at + 4), size, header }
}

/** مدّةُ `mvhd` بالملّي ثانية من جسد `moov` — أو `null`. */
export function mvhdDurationMs(moov: Uint8Array): number | null {
  for (let at = 0, n = 0; at + 8 <= moov.length && n < MAX_BOXES; n += 1) {
    const box = boxAt(moov, at, moov.length)
    if (box === null) return null
    if (box.type === 'mvhd') {
      const p = at + box.header
      const version = moov[p]
      const scaleAt = version === 1 ? p + 4 + 16 : p + 4 + 8
      const need = version === 1 ? scaleAt + 12 : scaleAt + 8
      if (need > moov.length) return null
      const scale = u32(moov, scaleAt)
      const duration = version === 1 ? u64(moov, scaleAt + 4) : u32(moov, scaleAt + 4)
      if (scale === 0) return null
      return Math.round((duration / scale) * 1000)
    }
    at += box.size
  }
  return null
}

export interface ClipShape {
  /** `ftyp` في أوّله — فهو MP4/MOV حقًّا لا اسمًا. */
  readonly isoBmff: boolean
  /** من `moov/mvhd` — و`null` «لم تُعرف» فتقولها المنصّةُ بعد المعالجة. */
  readonly durationMs: number | null
}

/**
 * شكلُ المقطع **بلا فكّ ترميزه** (D-379): رأسُه من R2 بمداه، ثمّ الصناديقُ العليا تُتخطّى بأحجامها حتّى `moov` —
 * ‏في أوّل الملفّ إن صُدّر faststart، أو في ذيله بعد `mdat` فيُقرأ هناك بمداه وحدَه. فأكبرُ ما يُحمَل `moov` نفسُه.
 * ‏وقراءةٌ تتعثّر لا توقف النشر: المدّةُ «لم تُعرف» كما كانت قبل هذا.
 */
export async function clipShape(clip: Clip): Promise<ClipShape> {
  try {
    const head = await clip.read(0, Math.min(HEAD_BYTES, clip.size))
    const first = boxAt(head, 0, clip.size)
    const isoBmff = first !== null && first.type === 'ftyp'
    if (!isoBmff) return { isoBmff, durationMs: null }
    let at = 0
    for (let n = 0; n < MAX_BOXES && at + 8 <= clip.size; n += 1) {
      const window = at + 16 <= head.length ? head.subarray(at) : await clip.read(at, Math.min(16, clip.size - at))
      const box = boxAt(window, 0, clip.size - at)
      if (box === null) break
      if (box.type === 'moov') {
        if (box.size > MOOV_CAP || at + box.size > clip.size) break
        const body = at + box.size <= head.length
          ? head.subarray(at + box.header, at + box.size)
          : await clip.read(at + box.header, box.size - box.header)
        return { isoBmff, durationMs: mvhdDurationMs(body) }
      }
      at += box.size
    }
    return { isoBmff, durationMs: null }
  } catch {
    return { isoBmff: true, durationMs: null }
  }
}

/** قطعةُ X: دون ‏5MB التي يقبلها `append`. */
export const X_SEGMENT = 4 * 1024 * 1024
/** سقفُ الانتظار في النداء الواحد — وما تجاوزه يُعاد من الطابور بمعرّفه. */
export const PROCESSING_CEILING_MS = 90_000

export const X_VIDEO = {
  init: 'https://api.x.com/2/media/upload/initialize',
  append: (id: string): string => `https://api.x.com/2/media/upload/${encodeURIComponent(id)}/append`,
  finalize: (id: string): string => `https://api.x.com/2/media/upload/${encodeURIComponent(id)}/finalize`,
  status: (id: string): string => `${X.uploadUrl}?command=STATUS&media_id=${encodeURIComponent(id)}`,
} as const

export const LINKEDIN_VIDEO = {
  init: 'https://api.linkedin.com/rest/videos?action=initializeUpload',
  finalize: 'https://api.linkedin.com/rest/videos?action=finalizeUpload',
  status: (urn: string): string => `https://api.linkedin.com/rest/videos/${encodeURIComponent(urn)}`,
} as const

export interface VideoUploadOptions {
  /** ‏يُنادى قبل كلّ طلب — والمنادي يكتبه في الدفتر (D-008). ورميُه يوقف الرفعَ قبل الطلب. */
  readonly onRequest: (operation: string) => Promise<void>
  /** يُنادى حين يصير للمقطع معرّفٌ يُستأنف به (`processing`) — والمنادي يحفظه في صفّ الوسيط. */
  readonly onStage: (id: string, state: 'processing') => Promise<void>
  /** ‏يُنادى قبل أوّل طلب رفع — فتقول البطاقةُ «يُرفع الفيديو» ما دام لم يبلغ `finalize`. */
  readonly onStart?: (() => Promise<void>) | undefined
  /** ‏X يقول كم يبقى المعرّفُ صالحًا (`expires_after_secs`) على FINALIZE وSTATUS — والمنادي يحفظ متى ينتهي (D-379). */
  readonly onExpiry?: ((secs: number) => Promise<void>) | undefined
  /** معرّفٌ رُفع في محاولةٍ سبقت ولم تكتمل معالجتُه: يُسأل ولا يُرفع ثانيةً. */
  readonly resume?: string | null
  readonly sleep?: ((ms: number) => Promise<void>) | undefined
  readonly ceilingMs?: number
}

const realSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
const retryable = (status: number): boolean => status === 429 || status >= 500

async function reasonOf(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { title?: unknown; detail?: unknown; message?: unknown; errors?: Array<{ message?: unknown }> }
    const text = [body.title, body.detail, body.message, body.errors?.[0]?.message].find((v): v is string => typeof v === 'string' && v !== '')
    return (text ?? String(response.status)).slice(0, 160)
  } catch {
    return String(response.status)
  }
}

// ── X ───────────────────────────────────────────────────────────────

/** يرفع مقطعًا إلى X ويعيد `media_id` جاهزًا للتغريدة — أو يرمي `PublishError` بسببه. */
export async function uploadXVideo(
  accessToken: string, clip: Clip, fetchImpl: typeof fetch, opts: VideoUploadOptions,
): Promise<string> {
  const auth = { Authorization: `Bearer ${accessToken}` }
  let id = opts.resume ?? null
  if (id === null) {
    await opts.onStart?.()
    await opts.onRequest('x_video_init')
    const init = await fetchImpl(X_VIDEO.init, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ media_type: clip.mime, total_bytes: clip.size, media_category: 'tweet_video' }),
    })
    if (!init.ok) throw new PublishError(`x: تعذّرت تهيئة رفع المقطع (${await reasonOf(init)})`, init.status, retryable(init.status))
    const body = (await init.json()) as { data?: { id?: unknown } }
    const got = body.data?.id
    if (typeof got !== 'string' || got === '') throw new PublishError('x: تهيئةٌ بلا معرّف وسيط', 502, false)
    id = got

    for (let offset = 0, index = 0; offset < clip.size; offset += X_SEGMENT, index += 1) {
      const bytes = await clip.read(offset, Math.min(X_SEGMENT, clip.size - offset))
      const form = new FormData()
      form.set('media', new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'application/octet-stream' }))
      form.set('segment_index', String(index))
      await opts.onRequest('x_video_append')
      const part = await fetchImpl(X_VIDEO.append(id), { method: 'POST', headers: auth, body: form })
      if (!part.ok) throw new PublishError(`x: تعذّر رفع القطعة ${index + 1} (${await reasonOf(part)})`, part.status, retryable(part.status))
    }

    await opts.onRequest('x_video_finalize')
    const fin = await fetchImpl(X_VIDEO.finalize(id), { method: 'POST', headers: auth })
    if (!fin.ok) throw new PublishError(`x: تعذّر إنهاء رفع المقطع (${await reasonOf(fin)})`, fin.status, retryable(fin.status))
    await opts.onStage(id, 'processing')
    const done = (await fin.json()) as { data?: { processing_info?: XProcessing; expires_after_secs?: unknown } }
    await expiry(done.data?.expires_after_secs, opts)
    const first = done.data?.processing_info
    // ‏بلا `processing_info` المقطعُ جاهزٌ فورًا — كذا تقول الوثيقة
    if (first === undefined) return id
    const settled = settle(first, id)
    if (settled !== null) return settled
    await (opts.sleep ?? realSleep)(Math.max(1, first.check_after_secs ?? 1) * 1000)
  }
  return pollX(id, auth, fetchImpl, opts)
}

interface XProcessing { state?: string; check_after_secs?: number; error?: { message?: string; name?: string } }

async function expiry(secs: unknown, opts: VideoUploadOptions): Promise<void> {
  if (typeof secs === 'number' && Number.isFinite(secs) && secs > 0 && opts.onExpiry !== undefined) await opts.onExpiry(secs)
}

/**
 * ‏أردُّ التغريدة يقول إنّ معرّفَ المقطع منتهٍ أو غيرُ صالح؟ (D-379) — X يردّ ‏400 بـ«media IDs are invalid» أو «expired»
 * ‏حين انقضت صلاحيّةُ المعرّف (قرابة يوم). فيُرفع المقطعُ من جديد مرّةً، ولا يُعاد بالمعرّف نفسِه.
 */
export function isMediaIdRejection(error: unknown): boolean {
  return error instanceof PublishError && error.status >= 400 && error.status < 500 && error.status !== 401 && error.status !== 429
    && /media[ _-]?ids?\b.*(invalid|expired|not found)|(invalid|expired).*media|media.*(invalid|expired)/i.test(error.message)
}

/**
 * ‏حالُ المقطع عند المنصّة بلسان المالك (D-379) — **والمعرّفُ لا يُقال**: بطاقةُ المنشور ورحلتُه تقرآن هذا وحدَه.
 * ‏و`null` لمقطعٍ لم يبدأ رفعُه (لا حال تُقال).
 */
export function videoStateLabel(state: string | null, error: string | null): string | null {
  if (state === 'uploading') return 'يُرفع الفيديو'
  if (state === 'processing') return 'تعالجه المنصّة'
  if (state === 'ready') return 'جاهز'
  const hide = (t: string): string => t.replace(/\b\d{6,}\b|urn:li:video:\S+/g, '…')
  const clean = (t: string): string => hide(t.replace(/^(?:(?:x|linkedin):\s*)?(?:[a-z_]+:\s*)?/i, ''))
  if (state === 'failed') return `لم يُقبل: ${clean(error ?? 'بلا سبب')}`
  if (state === null && error !== null && error !== '') return `يُرفع من جديد: ${clean(error)}`
  return null
}

function settle(p: XProcessing, id: string): string | null {
  if (p.state === 'succeeded') return id
  if (p.state === 'failed') {
    throw new PublishError(`x: رفض X المقطع بعد المعالجة (${p.error?.message ?? p.error?.name ?? 'بلا سبب'})`, 422, false)
  }
  return null
}

async function pollX(id: string, auth: Record<string, string>, fetchImpl: typeof fetch, opts: VideoUploadOptions): Promise<string> {
  const ceiling = opts.ceilingMs ?? PROCESSING_CEILING_MS
  const sleep = opts.sleep ?? realSleep
  let waited = 0
  for (;;) {
    await opts.onRequest('x_video_status')
    const res = await fetchImpl(X_VIDEO.status(id), { method: 'GET', headers: auth })
    if (!res.ok) throw new PublishError(`x: تعذّر سؤال حال المقطع (${await reasonOf(res)})`, res.status, retryable(res.status))
    const body = (await res.json()) as { data?: { processing_info?: XProcessing; expires_after_secs?: unknown } }
    await expiry(body.data?.expires_after_secs, opts)
    const p = body.data?.processing_info
    if (p === undefined) return id
    const settled = settle(p, id)
    if (settled !== null) return settled
    const wait = Math.max(1, p.check_after_secs ?? 1) * 1000
    if (waited + wait > ceiling) {
      // ‏قابلٌ للإعادة: المعرّفُ محفوظ، فالإعادةُ تسأل ولا ترفع
      throw new PublishError(`x: المقطع ما زال يُعالَج بعد ${Math.round(waited / 1000)} ثانية — يُسأل عنه في الإعادة`, 503, true)
    }
    await sleep(wait)
    waited += wait
  }
}

// ── LinkedIn ────────────────────────────────────────────────────────

/** يرفع مقطعًا إلى LinkedIn ويعيد `urn:li:video:…` متاحًا للمنشور. */
export async function uploadLinkedInVideo(
  accessToken: string, ownerUrn: string, clip: Clip, fetchImpl: typeof fetch, opts: VideoUploadOptions,
): Promise<string> {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'X-Restli-Protocol-Version': '2.0.0',
    ...LINKEDIN.extraHeaders,
  }
  let urn = opts.resume ?? null
  if (urn === null) {
    await opts.onStart?.()
    await opts.onRequest('linkedin_video_init')
    const init = await fetchImpl(LINKEDIN_VIDEO.init, {
      method: 'POST',
      headers,
      body: JSON.stringify({ initializeUploadRequest: { owner: ownerUrn, fileSizeBytes: clip.size, uploadCaptions: false, uploadThumbnail: false } }),
    })
    if (!init.ok) throw new PublishError(`linkedin: تعذّرت تهيئة رفع المقطع (${await reasonOf(init)})`, init.status, retryable(init.status))
    const body = (await init.json()) as {
      value?: { video?: unknown; uploadToken?: unknown; uploadInstructions?: Array<{ uploadUrl?: unknown; firstByte?: unknown; lastByte?: unknown }> }
    }
    const video = body.value?.video
    const parts = body.value?.uploadInstructions ?? []
    if (typeof video !== 'string' || video === '' || parts.length === 0) {
      throw new PublishError('linkedin: تهيئةٌ بلا معرّف مقطع أو تعليمات رفع', 502, false)
    }
    const etags: string[] = []
    for (const [i, part] of parts.entries()) {
      const first = Number(part.firstByte)
      const last = Number(part.lastByte)
      if (typeof part.uploadUrl !== 'string' || !Number.isInteger(first) || !Number.isInteger(last) || last < first) {
        throw new PublishError(`linkedin: تعليمةُ رفعٍ تالفة للجزء ${i + 1}`, 502, false)
      }
      const bytes = await clip.read(first, last - first + 1)
      await opts.onRequest('linkedin_video_part')
      // ‏العنوانُ موقَّعٌ مؤقّت: لا ترويسةَ تفويض ولا يُخزَّن
      const put = await fetchImpl(part.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: bytes as unknown as BodyInit,
      })
      if (!put.ok) throw new PublishError(`linkedin: تعذّر رفع الجزء ${i + 1} (${put.status})`, put.status, retryable(put.status))
      const etag = put.headers.get('etag')
      if (etag === null || etag === '') throw new PublishError(`linkedin: الجزء ${i + 1} رُفع بلا etag`, 502, false)
      etags.push(etag)
    }
    await opts.onRequest('linkedin_video_finalize')
    const fin = await fetchImpl(LINKEDIN_VIDEO.finalize, {
      method: 'POST',
      headers,
      body: JSON.stringify({ finalizeUploadRequest: { video, uploadToken: typeof body.value?.uploadToken === 'string' ? body.value.uploadToken : '', uploadedPartIds: etags } }),
    })
    if (!fin.ok) throw new PublishError(`linkedin: تعذّر إنهاء رفع المقطع (${await reasonOf(fin)})`, fin.status, retryable(fin.status))
    urn = video
    await opts.onStage(urn, 'processing')
  }

  const ceiling = opts.ceilingMs ?? PROCESSING_CEILING_MS
  const sleep = opts.sleep ?? realSleep
  let waited = 0
  for (;;) {
    await opts.onRequest('linkedin_video_status')
    const res = await fetchImpl(LINKEDIN_VIDEO.status(urn), { method: 'GET', headers })
    if (!res.ok) throw new PublishError(`linkedin: تعذّر سؤال حال المقطع (${await reasonOf(res)})`, res.status, retryable(res.status))
    const body = (await res.json()) as { status?: unknown; processingFailureReason?: unknown }
    if (body.status === 'AVAILABLE') return urn
    if (body.status === 'PROCESSING_FAILED') {
      throw new PublishError(`linkedin: رفض LinkedIn المقطع بعد المعالجة (${typeof body.processingFailureReason === 'string' ? body.processingFailureReason : 'بلا سبب'})`, 422, false)
    }
    const wait = 5_000
    if (waited + wait > ceiling) {
      throw new PublishError(`linkedin: المقطع ما زال يُعالَج بعد ${Math.round(waited / 1000)} ثانية — يُسأل عنه في الإعادة`, 503, true)
    }
    await sleep(wait)
    waited += wait
  }
}

/**
 * الناشر — ما يجري لكل رسالة في طابور النشر.
 *
 * الترتيب هنا ليس تفصيلا: هو ما يمنع النشر مرتين والدفع مرتين.
 *
 *   ١. اقرأ المنشور وحسابه. رفض إن لم يكن معتمدا (D-009)
 *   ٢. ابحث عن محاولة ناجحة بالمفتاح نفسه — إن وُجدت فقد نُشر، فاخرج (D-004)
 *   ٣. سجّل المحاولة `sent` قبل الإرسال، لا بعده
 *   ٤. سجّل التكلفة قبل أن يُعدّ الطلب ناجحا (D-008)
 *   ٥. أرسل
 *   ٦. حدّث المحاولة والمنشور بما وقع فعلا
 *
 * الخطوتان ٣ و٤ قبل ٥ عمدا: الطلب الذي أُرسل وضاع جوابه قد كُلِّف فعلا،
 * وسجلٌّ أعلى من الحقيقة أهون من سجل أقل منها.
 */
import { estimatePostCost, recordCost } from '../cost'
import { containsUrl } from '../idempotency'
import { loadTokens, markNeedsReauth, type Db } from '../tokens'
import { canPublish, canUploadMedia } from '../oauth/scopes'
import { isExpiring } from '../oauth/exchange'
import type { Platform } from '../oauth/providers'
import {
  publishLinkedIn, publishX, uploadLinkedInImage, uploadXMedia,
  PublishError, type PublishResult,
} from './platforms'

export interface PublishMessage {
  readonly postId: string
}

export type Outcome =
  | { readonly kind: 'published'; readonly platformPostId: string }
  | { readonly kind: 'skipped_duplicate'; readonly platformPostId: string }
  | { readonly kind: 'failed'; readonly reason: string; readonly retryable: boolean }

interface PostRow {
  id: string
  account_id: string
  text: string
  status: string
  idempotency_key: string
  approved_at: string | null
  platform: Platform
  external_id: string
  account_status: string
}

/** أقلُّ ما نحتاجه من R2: قراءةُ كائنٍ واحد. */
export interface MediaBucket {
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>
}

export interface PublisherDeps {
  readonly db: Db
  readonly encKey: string
  /** يلزم للمنشورات التي تحمل صورة، ويُترك حين لا صور (D-040). */
  readonly bucket?: MediaBucket
  readonly fetchImpl?: typeof fetch
  readonly now?: () => Date
}

export async function publishPost(
  deps: PublisherDeps,
  message: PublishMessage,
): Promise<Outcome> {
  const { db, encKey } = deps
  const fetchImpl = deps.fetchImpl ?? fetch
  const now = deps.now ?? (() => new Date())

  // ١ — المنشور وحسابه
  const post = await db
    .prepare(
      `SELECT p.id, p.account_id, p.text, p.status, p.idempotency_key, p.approved_at,
              a.platform, a.external_id, a.status AS account_status
         FROM posts p JOIN accounts a ON a.id = p.account_id
        WHERE p.id = ?`,
    )
    .bind(message.postId)
    .first<PostRow>()

  if (post === null) return { kind: 'failed', reason: 'post_not_found', retryable: false }
  if (post.approved_at === null) {
    // لا يقع عادة: القاعدة تمنعه. لكن الحارس هنا لأن الاعتماد ليس تفصيلا
    return { kind: 'failed', reason: 'not_approved', retryable: false }
  }
  if (post.status === 'published') {
    return { kind: 'skipped_duplicate', platformPostId: '' }
  }

  // ٢ — هل نُشر بالمفتاح نفسه من قبل؟
  const done = await db
    .prepare(
      `SELECT platform_post_id FROM publish_attempts
        WHERE idempotency_key = ? AND status = 'succeeded' LIMIT 1`,
    )
    .bind(post.idempotency_key)
    .first<{ platform_post_id: string | null }>()
  if (done !== null) {
    await markPublished(db, post.id, done.platform_post_id ?? '')
    return { kind: 'skipped_duplicate', platformPostId: done.platform_post_id ?? '' }
  }

  /**
   * الصورةُ المعتمَدة إن وُجدت (D-040).
   *
   * واحدةٌ لا أكثر: المنصّتان تقبلان عدّة، وصدى تولّد واحدة. ومعالجةُ ما
   * لا يقع تُكتب ولا تُختبَر، فتنكسر يومَ يقع.
   */
  const image = await db
    .prepare(
      `SELECT id, r2_key, mime, platform_media_id FROM media
        WHERE post_id = ? AND status = 'ready'
        ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(post.id)
    .first<{ id: string; r2_key: string; mime: string; platform_media_id: string | null }>()
    .catch(() => null)

  // دلوٌ غير ممرَّرٍ ومنشورٌ بصورة: **لا يُنشر النصُّ وحده**. المالك اعتمد
  // منشورا بصورة، ونشرُه بلا صورته نشرٌ لشيءٍ لم يعتمده — والفرقُ لا يُرى
  // في اللوحة، فيُكتشَف على المنصّة بعد أن يقرأه الناس
  if (image !== null && deps.bucket === undefined) {
    return { kind: 'failed', reason: 'no_media_bucket', retryable: false }
  }

  const tokens = await loadTokens(db, encKey, post.account_id)
  if (tokens === null) {
    await markNeedsReauth(db, post.account_id)
    return { kind: 'failed', reason: 'no_tokens', retryable: false }
  }
  if (isExpiring(tokens.expiresAt, now())) {
    /**
     * التجديدُ يقع قبل الطابور لا داخله (D-066)، **فالوصولُ هنا يعني
     * أنّ الدورةَ لم تُصلحه**. ويفترق الحالان:
     *
     * **ورمزُ تجديدٍ قائمٌ يعني عطلا عابرا** — دورةٌ سقطت، أو سرٌّ
     * ناقص. فيُردّ **قابلا للإعادة ولا يُعلَّم الحساب**: تعليمُه
     * `needs_reauth` يوقف نشرَه كلَّه حتّى يجلس المالكُ إليه، **وإذنٌ
     * يُطلَب بلا حاجةٍ يُعلِّم المالكَ أن يتجاهل الطلب**.
     *
     * **وبلا رمزِ تجديدٍ لا سبيلَ إلّا يدُه** — فيُعلَّم ويُردّ نهائيّا.
     */
    if (tokens.refreshToken !== null) {
      return { kind: 'failed', reason: 'token_expired_retry', retryable: true }
    }
    await markNeedsReauth(db, post.account_id)
    return { kind: 'failed', reason: 'token_expired', retryable: false }
  }
  /**
   * ورمزٌ لا يملك نطاقَ النشر لا يُرسَل به شيء (D-045).
   *
   * **الحارسُ قبل النداء لا بعده** — كما وقع حارسُ الإدارة قبل نداء
   * Google (D-019). ومحاولةٌ برمزٍ ناقص تمرّ على ثلاثة أشياء قبل أن
   * تُردّ: تُسجَّل محاولةً، وتُحسَب تكلفتُها في الدفتر (D-008)، وتُرفَع
   * صورتُها إن كانت — **و X يحاسب على الرفع**. ثمّ تعود 403.
   *
   * فيُسأل هنا، قبل الثلاثة. والجوابُ من `tokens.scopes` وهو **ما مُنح**
   * لا ما طُلب: المنصّةُ قد تمنح أقلَّ ممّا طُلب بلا خطأ.
   *
   * ورفعُ الوسيط له نطاقُه عند X وحده، فيُفرَز: منشورٌ بصورةٍ يحتاج
   * الاثنين، ونصٌّ يحتاج الأوّل — ومنعُ النصّ لنقص نطاق الصور منعٌ بلا
   * سبب.
   */
  const needsMedia = image !== null
  const capable = needsMedia
    ? canUploadMedia(post.platform, tokens.scopes)
    : canPublish(post.platform, tokens.scopes)
  if (!capable) {
    return {
      kind: 'failed',
      reason: needsMedia ? 'missing_media_scope' : 'missing_publish_scope',
      retryable: false,
    }
  }

  const attemptNo = await nextAttemptNo(db, post.id)
  const hasUrl = containsUrl(post.text)

  // ٣ — المحاولة تُسجَّل قبل الإرسال
  const attemptId = crypto.randomUUID()
  await db
    .prepare(
      `INSERT INTO publish_attempts
         (id, post_id, idempotency_key, attempt_no, request_json, status)
       VALUES (?, ?, ?, ?, ?, 'sent')`,
    )
    .bind(
      attemptId,
      post.id,
      post.idempotency_key,
      attemptNo,
      JSON.stringify({ platform: post.platform, has_url: hasUrl, length: post.text.length }),
    )
    .run()

  // ٤ — التكلفة تُسجَّل قبل أن يُعدّ الطلب ناجحا
  //
  // **والقاعدةُ هي التي تضمن النوع**: `posts.platform` محصورٌ في
  // المنصّتين اللتين لهما سائق (0013 لم يوسّعه عمدا). فالصفُّ الواصل
  // لا يحمل غيرَهما، ويُضيَّق النوعُ هنا بلا فحصٍ يتظاهر بالحراسة
  const paying = post.platform as 'linkedin' | 'x'
  const unitCost = estimatePostCost(paying, hasUrl)
  if (unitCost > 0) {
    await recordCost(db, {
      provider: post.platform,
      operation: hasUrl ? 'create_post_with_url' : 'create_post',
      units: 1,
      unitCost,
      refId: post.id,
    })
  }

  // ٥ — الرفعُ ثمّ الإرسال
  //
  // ومعرّفُ الوسيط يُحفَظ فور نجاحه: رفعٌ نجح ثمّ نشرٌ فشل ثمّ إعادةُ
  // محاولةٍ من الطابور ترفع الصورةَ ثانية، **و X يحاسب على الرفع**.
  // فالإعادةُ تعيد استعمالَه ولا تدفع مرّتين (D-004).
  let result: PublishResult
  try {
    let mediaId = image?.platform_media_id ?? null

    if (image !== null && mediaId === null) {
      const object = await deps.bucket!.get(image.r2_key)
      if (object === null) {
        // الصفُّ قائمٌ والبايتاتُ مفقودة: لا يُعالَج بإعادةٍ، ولا يُنشر
        // النصُّ وحده — يُقال ويُوقَف
        throw new PublishError('media_bytes_missing', 502, false)
      }
      const upload = { bytes: new Uint8Array(await object.arrayBuffer()), mime: image.mime }

      // نداءٌ خارجيٌّ قد يُحاسَب عليه: يُسجَّل قبل أن يُعدّ ناجحا (D-008).
      // **وبصفرٍ مُعلَّم**: سعرُ رفع الوسائط عند X لم يُؤكَّد بعد
      // (docs/PLATFORMS.md)، ورقمٌ مخترَعٌ كذب، وسكوتٌ عن نداءٍ وقع يجعل
      // الدفتر أقلَّ من الحقيقة — وهو الاتّجاه الأسوأ للخطأ
      await recordCost(db, {
        provider: post.platform,
        operation: 'media_upload:price_unverified',
        units: 1,
        unitCost: 0,
        refId: post.id,
      })

      mediaId =
        post.platform === 'linkedin'
          ? await uploadLinkedInImage(
              tokens.accessToken,
              `urn:li:person:${post.external_id}`,
              upload,
              fetchImpl,
            )
          : await uploadXMedia(tokens.accessToken, upload, fetchImpl)

      await db
        .prepare('UPDATE media SET platform_media_id = ? WHERE id = ?')
        .bind(mediaId, image.id)
        .run()
    }

    result =
      post.platform === 'linkedin'
        ? await publishLinkedIn(
            tokens.accessToken,
            `urn:li:person:${post.external_id}`,
            post.text,
            fetchImpl,
            mediaId,
          )
        : await publishX(tokens.accessToken, post.text, fetchImpl, mediaId)
  } catch (error) {
    const failure =
      error instanceof PublishError
        ? { reason: error.message, retryable: error.retryable, status: error.status }
        : { reason: 'unexpected_error', retryable: true, status: 0 }
    await db
      .prepare(
        `UPDATE publish_attempts
            SET status = 'failed', response_json = ?
          WHERE id = ?`,
      )
      .bind(JSON.stringify({ error: failure.reason, status: failure.status }), attemptId)
      .run()
    if (!failure.retryable) {
      await db.prepare(`UPDATE posts SET status = 'failed' WHERE id = ?`).bind(post.id).run()
    }
    return { kind: 'failed', reason: failure.reason, retryable: failure.retryable }
  }

  // ٦ — ما وقع فعلا
  await db
    .prepare(
      `UPDATE publish_attempts
          SET status = 'succeeded', platform_post_id = ?, response_json = ?
        WHERE id = ?`,
    )
    .bind(result.platformPostId, JSON.stringify(result.response), attemptId)
    .run()
  await markPublished(db, post.id, result.platformPostId)

  return { kind: 'published', platformPostId: result.platformPostId }
}

async function markPublished(db: Db, postId: string, _platformPostId: string): Promise<void> {
  await db.prepare(`UPDATE posts SET status = 'published' WHERE id = ?`).bind(postId).run()
}

async function nextAttemptNo(db: Db, postId: string): Promise<number> {
  const row = await db
    .prepare(`SELECT coalesce(max(attempt_no), 0) AS n FROM publish_attempts WHERE post_id = ?`)
    .bind(postId)
    .first<{ n: number }>()
  return (row?.n ?? 0) + 1
}

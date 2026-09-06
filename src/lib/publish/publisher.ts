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
import { isExpiring } from '../oauth/exchange'
import type { Platform } from '../oauth/providers'
import { publishLinkedIn, publishX, PublishError, type PublishResult } from './platforms'

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

export interface PublisherDeps {
  readonly db: Db
  readonly encKey: string
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
   * صورةٌ لم يُبنَ رفعُها بعد (D-039).
   *
   * **ولا يُنشر النصُّ وحده.** المالك اعتمد منشورا بصورة، ونشرُه بلا
   * صورته نشرٌ لشيءٍ لم يعتمده — والفرقُ لا يُرى في اللوحة، فيُكتشَف على
   * المنصّة بعد أن يقرأه الناس.
   *
   * والحارسُ هنا لا في الجدولة وحدها: الجدولةُ تعطي سببا يُقرأ مبكّرا،
   * وهذا يمنع فعلا — ورسالةٌ دخلت الطابور قبل بناء الرفع تجده قائما.
   */
  const pending = await db
    .prepare("SELECT count(*) AS n FROM media WHERE post_id = ? AND status = 'ready'")
    .bind(post.id)
    .first<{ n: number }>()
    .catch(() => null)
  if ((pending?.n ?? 0) > 0) {
    return {
      kind: 'failed',
      reason: 'media_upload_not_built',
      retryable: false,
    }
  }

  const tokens = await loadTokens(db, encKey, post.account_id)
  if (tokens === null) {
    await markNeedsReauth(db, post.account_id)
    return { kind: 'failed', reason: 'no_tokens', retryable: false }
  }
  if (isExpiring(tokens.expiresAt, now())) {
    // التجديد يقع قبل الطابور لا داخله؛ هنا نعلّم ونتوقف بدل أن ننشر برمز ميت
    await markNeedsReauth(db, post.account_id)
    return { kind: 'failed', reason: 'token_expired', retryable: false }
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
  const unitCost = estimatePostCost(post.platform, hasUrl)
  if (unitCost > 0) {
    await recordCost(db, {
      provider: post.platform,
      operation: hasUrl ? 'create_post_with_url' : 'create_post',
      units: 1,
      unitCost,
      refId: post.id,
    })
  }

  // ٥ — الإرسال
  let result: PublishResult
  try {
    result =
      post.platform === 'linkedin'
        ? await publishLinkedIn(
            tokens.accessToken,
            `urn:li:person:${post.external_id}`,
            post.text,
            fetchImpl,
          )
        : await publishX(tokens.accessToken, post.text, fetchImpl)
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

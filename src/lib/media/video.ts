/**
 * تحريكُ الصورة — من صورةٍ معتمَدةٍ إلى مقطعٍ رأسيّ (D-052).
 *
 * ## لماذا من صورةٍ لا من نصّ
 *
 * `t2v` نداءٌ واحدٌ من النصّ إلى الفيديو — **ولا نرى شيئا قبل أن
 * يُنفَق**. و`i2v` يقسمها خطوتين: تُولَّد الصورةُ (D-039) فتُرى وتُعتمَد
 * أو تُرفَض، **ثمّ تُحرَّك المعتمَدةُ وحدها**.
 *
 * وثلاثةٌ تُكسَب بذلك: تحكّمٌ أعلى في الشكل، وكلفةٌ أقلّ (الصورةُ أرخصُ
 * من الفيديو بمراتب، والمرفوضةُ لا تُحرَّك)، **و«Zero data retention»**
 * — وهو موسومٌ على الجيل الأوّل وحده.
 *
 * ## والرابطُ يُوقَّع لحظتَه
 *
 * المزوّدُ يسحب الصورةَ بنفسه، **فيلزم عنوانٌ عامّ** (D-050). ويُوقَّع
 * عند النداء لا قبله: نافذةُ خمسَ عشرةَ دقيقةً تبدأ من الاستعمال، لا
 * من لحظةٍ سابقةٍ ضاع منها نصفُها في الانتظار.
 *
 * ## وترتيبُ الكتابة هو ترتيبُ D-039 نفسه
 *
 * الكلفةُ ثمّ R2 ثمّ الصفّ. **والأرخصُ خطأً هو الذي يقع أوّلا**: صفٌّ
 * يشير إلى بايتاتٍ لا وجودَ لها **يكذب**، وبايتاتٌ لا يشير إليها صفٌّ
 * تبقى يتيمةً ولا تضرّ.
 */
import { recordCost } from '../cost'
import { blockerReason, checkAllowance } from '../limits'
import { signMediaToken, mediaUrl } from './link'
import {
  AiError, MAX_SECONDS, VIDEO_MODELS, fetchVideoBytes, generateVideo, type AiBinding,
} from './workersAi'
import type { Db } from '../tokens'

/** أقصى ما يُقبل — و ٦٤ ميغا فوق حدّ مقطعٍ بخمسَ عشرةَ ثانيةً بكثير. */
export const MAX_VIDEO_BYTES = 64 * 1024 * 1024

export type VideoOutcome =
  | { readonly kind: 'generated'; readonly mediaId: string; readonly bytes: number }
  /** وُلّد لهذا المنشور مقطعٌ من قبل — لا يُنفَق ثانيةً. */
  | { readonly kind: 'already'; readonly mediaId: string }
  /** حرسٌ منع النداء قبل أن يقع: إيقافٌ أو سقف. */
  | { readonly kind: 'blocked'; readonly reason: string }
  | { readonly kind: 'failed'; readonly reason: string; readonly retryable: boolean }

export interface VideoDeps {
  readonly db: Db
  readonly bucket: {
    put(key: string, value: ArrayBuffer | Uint8Array): Promise<unknown>
  }
  readonly ai: AiBinding | undefined
  readonly encKey: string
  readonly baseUrl: string
  readonly fetchImpl?: typeof fetch
  readonly now?: () => Date
}

interface ImageRow {
  id: string
  mime: string
}

/**
 * يحرّك صورةَ منشورٍ معتمَدةً.
 *
 * ولا يُحرَّك ما لم يُعتمَد من الصور: **المرفوضةُ حُكم عليها**، وتحريكُها
 * إنفاقٌ على ما لن يُنشَر.
 */
export async function animateForPost(
  deps: VideoDeps,
  postId: string,
  prompt = 'حركةٌ هادئةٌ للكاميرا نحو المشهد، بإضاءةٍ ناعمةٍ ثابتة',
): Promise<VideoOutcome> {
  const now = (deps.now ?? (() => new Date()))()

  if (deps.ai === undefined) {
    return { kind: 'blocked', reason: 'رابطُ Workers AI غير مضبوط في هذه البيئة' }
  }

  // ١ — الحارسُ قبل النداء لا بعده (D-019). والإيقافُ قرارُ المالك
  const allowance = await checkAllowance(deps.db)
  if (!allowance.allowed && allowance.blocker !== null) {
    return { kind: 'blocked', reason: blockerReason(allowance.blocker) }
  }

  // ٢ — مقطعٌ قائمٌ لا يُعاد توليدُه: الفيديو أغلى ما يُنادى في النظام
  const existing = await deps.db
    .prepare(
      `SELECT id FROM media
        WHERE post_id = ? AND status = 'ready' AND mime LIKE 'video/%'
        ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(postId)
    .first<{ id: string }>()
    .catch(() => null)
  if (existing !== null) return { kind: 'already', mediaId: existing.id }

  // ٣ — الصورةُ المصدر: معتمَدةٌ لا مرفوضة
  const image = await deps.db
    .prepare(
      `SELECT id, mime FROM media
        WHERE post_id = ? AND status = 'ready' AND mime LIKE 'image/%'
        ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(postId)
    .first<ImageRow>()
    .catch(() => null)
  if (image === null) {
    return { kind: 'blocked', reason: 'لا صورةَ معتمَدةً لهذا المنشور — ولّدها أوّلا' }
  }

  // ٤ — الرابطُ يُوقَّع لحظتَه: النافذةُ تبدأ من الاستعمال لا قبله
  const token = await signMediaToken(deps.encKey, image.id, now)
  const imageUrl = mediaUrl(deps.baseUrl, token)

  // ٥ — الكلفةُ تُسجَّل قبل أن يُعدّ النداءُ ناجحا (D-008).
  //
  // **ولا يُخترَع سعر.** سعرُ الفيديو عند Cloudflare يُقرأ من لوحة
  // الحساب ولم يُقرأ بعد، فيُسجَّل صفرٌ **موسومٌ** — ودفترٌ فيه صفرٌ
  // يقول «لم يُسعَّر» أصدقُ من رقمٍ يُظنّ حقيقةً وهو تخمين
  await recordCost(deps.db, {
    provider: 'cloudflare',
    operation: `video:${VIDEO_MODELS.fromImage}:price_unverified`,
    units: 1,
    unitCost: 0,
    refId: postId,
  })

  let url: string
  try {
    const out = await generateVideo(deps.ai, {
      imageUrl, prompt, durationSeconds: MAX_SECONDS, ratio: '9:16', resolution: '720P',
    })
    url = out.url
  } catch (error) {
    return {
      kind: 'failed',
      reason: error instanceof Error ? error.message : 'تعذّر التوليد',
      retryable: error instanceof AiError ? error.retryable : false,
    }
  }

  // ٦ — البايتاتُ تُسحَب فورا: الرابطُ عند المزوّد لا عندنا
  let bytes: Uint8Array
  let mime: string
  try {
    const pulled = await fetchVideoBytes(url, deps.fetchImpl ?? fetch, MAX_VIDEO_BYTES)
    bytes = pulled.bytes
    mime = pulled.mime
  } catch (error) {
    return {
      kind: 'failed',
      reason: error instanceof Error ? error.message : 'تعذّر السحب',
      retryable: error instanceof AiError ? error.retryable : true,
    }
  }

  // ٧ — R2 قبل الصفّ: صفٌّ بلا بايتات يكذب، وبايتاتٌ بلا صفٍّ تيتم
  const mediaId = crypto.randomUUID()
  const key = `video/${postId}/${mediaId}.mp4`
  try {
    await deps.bucket.put(key, bytes)
  } catch (error) {
    return {
      kind: 'failed',
      reason: `تعذّر حفظُ البايتات: ${error instanceof Error ? error.message : 'عطل'}`,
      retryable: true,
    }
  }

  await deps.db
    .prepare(
      `INSERT INTO media (id, post_id, r2_key, mime, bytes, prompt, model, cost_usd,
                          status, idempotency_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'ready', ?)`,
    )
    .bind(mediaId, postId, key, mime, bytes.length, prompt, VIDEO_MODELS.fromImage, key)
    .run()

  return { kind: 'generated', mediaId, bytes: bytes.length }
}

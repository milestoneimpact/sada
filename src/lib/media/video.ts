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
import { routeFor } from '../ai/routes'
import { claimGeneration, releaseClaim } from './claim'
import { blockerReason, checkAllowance, videoCapGate } from '../limits'
import { signMediaToken, mediaUrl } from './link'
import {
  AiError, MAX_SECONDS, VIDEO_MODELS, fetchVideoBytes, generateVideo, restBinding,
  type AiBinding,
} from './workersAi'
import { getProvider, resolveKey } from '../providers'
import { cfAccountId, cfAccountOf } from '../ai/cloudflare'
import type { Db } from '../tokens'
import { objectKey, orgOfPost } from '../tenancy'

/** أقصى ما يُقبل — و ٦٤ ميغا فوق حدّ مقطعٍ بخمسَ عشرةَ ثانيةً بكثير. */
export const MAX_VIDEO_BYTES = 64 * 1024 * 1024

export type VideoOutcome =
  | { readonly kind: 'generated'; readonly mediaId: string; readonly bytes: number }
  /** وُلّد لهذا المنشور مقطعٌ من قبل — لا يُنفَق ثانيةً. */
  | { readonly kind: 'already'; readonly mediaId: string }
  /** حرسٌ منع النداء قبل أن يقع: إيقافٌ أو سقف. */
  | { readonly kind: 'blocked'; readonly reason: string }
  /**
   * نداءٌ لهذا المقطع جارٍ الآن — **وليس فشلا ولا سقفا**.
   *
   * التوليدُ دقائق، وصفُّ `media` لا يظهر قبل آخرها. فنقرةٌ ثانيةٌ في
   * تلك الدقائق كانت تبدأ توليدا ثانيا **وتدفع ثمنَه** (D-068).
   */
  | { readonly kind: 'in_progress'; readonly since: string }
  | { readonly kind: 'failed'; readonly reason: string; readonly retryable: boolean }

/**
 * أيُّ وجهٍ يُنادى — والرابطُ يُفضَّل متى بلغ.
 *
 * `env.AI` يبلغ حسابَ الـ Worker وحده. فإن كان حسابُ Workers AI غيرَه
 * — وهو حالُ المالك — **فالرابطُ لا يبلغه مهما ضُبط**، ويُنادى بـ REST.
 *
 * ويُفضَّل الرابطُ حيث يصحّ: **مَن جمع الحسابين حذف السرَّ من نظامه**،
 * فلا يُخزَّن ولا يُدوَّر ولا يُسرَّب.
 */
export function pickBinding(env: {
  AI?: AiBinding
  CF_AI_ACCOUNT_ID?: string
  CF_AI_TOKEN?: string
}, fetchImpl?: typeof fetch): AiBinding | undefined {
  const account = (env.CF_AI_ACCOUNT_ID ?? '').trim()
  const token = (env.CF_AI_TOKEN ?? '').trim()
  if (account.length > 0 && token.length > 0) {
    return restBinding(account, token, fetchImpl ?? fetch)
  }
  return env.AI
}

/**
 * الوجهُ من البيئة **أو من بطاقة المزوّد** (D-157).
 *
 * `pickBinding` تقرأ `CF_AI_TOKEN` من البيئة وحدها. والمالكُ يضبط مفتاحَ
 * Cloudflare في بطاقة المزوّد من اللوحة كما تفعل الصور (D-079)، فكان
 * المقطعُ يتجاهله ويقول «رابطُ Workers AI غير مضبوط» ومفتاحُه محفوظ.
 * فالبيئةُ أوّلا، ثمّ البطاقة، ثمّ `env.AI`.
 *
 * **والحكمُ من `videoFace`** (D-163): لوحُ المسوّدات يقرؤه قبل الضغط فيقول
 * بأيّ وجهٍ سيُنادى — ولا يُنسَخ هناك ترتيبٌ يفترق عن هذا.
 */
export async function bindingFor(
  env: { AI?: AiBinding; CF_AI_ACCOUNT_ID?: string; CF_AI_TOKEN?: string },
  db: Db,
  encKey: string,
  fetchImpl?: typeof fetch,
): Promise<AiBinding | undefined> {
  const envAccount = (env.CF_AI_ACCOUNT_ID ?? '').trim() !== ''
  const envToken = (env.CF_AI_TOKEN ?? '').trim() !== ''
  const binding = env.AI !== undefined
  // **والبيئةُ تُسأل قبل البطاقة**: حين تكفي لا يُقرأ الجدولُ ولا يُفكّ مفتاحُ الخزنة
  if (videoFace({ envAccount, envToken, card: null, binding }) === 'env') {
    return pickBinding(env, fetchImpl)
  }
  const card = await getProvider(db, 'cloudflare')
  const key = card === null || !card.enabled
    ? null
    : (await resolveKey(db, encKey, 'cloudflare', undefined)).key
  const face = videoFace({
    envAccount,
    envToken,
    card: card === null
      ? null
      : { enabled: card.enabled, hasKey: key !== null, urlAccount: cfAccountId(card.baseUrl) !== null },
    binding,
  })
  switch (face) {
    // لا يقع هنا — خرجت البيئةُ أعلاه — ويُكتب ليبقى الحكمُ حكمَ `videoFace` كاملًا
    case 'env':
      return pickBinding(env, fetchImpl)
    case 'card':
      return key === null
        ? undefined
        : restBinding(cfAccountOf(env.CF_AI_ACCOUNT_ID, card?.baseUrl), key, fetchImpl ?? fetch)
    case 'binding':
      return env.AI
    case 'none':
      return undefined
  }
}

/** الوجهُ الذي يُنادى به Workers AI — أو لا وجه. */
export type VideoFace = 'env' | 'card' | 'binding' | 'none'

/**
 * أيُّ وجهٍ يُنادى؟ — **نقيٌّ، يناديه `bindingFor` ولوحُ المسوّدات معًا**.
 *
 * البيئةُ إن حضر فيها الحسابُ والمفتاحُ معًا؛ ثمّ بطاقةُ Cloudflare إن كانت
 * مفعَّلةً ولها مفتاحٌ في الخزنة وحسابٌ من البيئة أو من عنوانها؛ ثمّ رابطُ
 * `env.AI` — وهو يبلغ حسابَ الـ Worker وحده، فلا يُضمَن أنّه حسابُ Workers AI.
 */
export function videoFace(i: {
  readonly envAccount: boolean
  readonly envToken: boolean
  readonly card: { readonly enabled: boolean; readonly hasKey: boolean; readonly urlAccount: boolean } | null
  readonly binding: boolean
}): VideoFace {
  if (i.envAccount && i.envToken) return 'env'
  if (i.card !== null && i.card.enabled && i.card.hasKey && (i.envAccount || i.card.urlAccount)) {
    return 'card'
  }
  return i.binding ? 'binding' : 'none'
}

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
 * الوصفُ حين لا يُمرَّر.
 *
 * **ومُصدَّرٌ لأنّه يدخل المفتاح**: `videoKey` تشتقّ منه، فنسخةٌ ثانيةٌ
 * منه في اختبارٍ أو مسارٍ تعطي مفتاحا آخر — وحجزا لا يلتقي بحجز.
 */
export const DEFAULT_PROMPT =
  'Slow, steady camera push toward the scene, soft constant lighting, no text, no captions'

/**
 * مفتاحُ عدم التكرار للمقطع.
 *
 * كان مفتاحُ R2 نفسَه — `video/{post}/{uuid}` — **وهو فريدٌ لكلّ نداء**،
 * فالقيدُ `UNIQUE` على العمود لا يقع أبدا ولا يمنع شيئا.
 *
 * فصار يُشتقُّ من المنشور والوصف كما في الصور (`imageKey`): نداءان
 * بالوصف نفسِه مفتاحُهما واحد، **ووصفٌ جديدٌ يستحقّ مقطعا جديدا**.
 */
export async function videoKey(postId: string, prompt: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(prompt.trim()))
  const hex = [...new Uint8Array(digest)]
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return `video:${postId}:${hex}`
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
  prompt = DEFAULT_PROMPT,
): Promise<VideoOutcome> {
  const now = (deps.now ?? (() => new Date()))()

  if (deps.ai === undefined) {
    return { kind: 'blocked', reason: 'رابطُ Workers AI غير مضبوط في هذه البيئة' }
  }

  // ١ — الحارسُ قبل النداء لا بعده (D-019). والإيقافُ قرارُ المالك
  const allowance = await checkAllowance(deps.db, 'video')
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

  /*
   * ٣٫٥ — سقفُ المقاطع اليوميّ بالعدد (D-168).
   *
   * **الصفرُ الموسومُ في ٦ لا يبلغ سقفَ مالٍ أبدًا**، فكان الفيديو يُنادى بلا
   * حدٍّ ما دام سعرُه لم يُقرأ (M-16). والعدُّ من الدفتر الذي قرأه الحارسُ في
   * ١ — لا استعلامَ ثانٍ ولا عدّادَ موازٍ — **والحكمُ من `videoCapGate`** التي
   * تقرؤها نقطةُ «المقاطع» تحت الزرّ، فلا تقول «بقي» والدالّةُ تردّ.
   *
   * **وبعد ٢ و٣ لا قبلهما**: مقطعٌ قائمٌ يُقال «من قبل» ولا يُقال «بلغ السقف»،
   * وكلاهما بلا إنفاق. **وقبل الحجز في ٥**: حجزٌ قبل حارسٍ يمنع يُقفل البابَ
   * ثلاثين دقيقةً على منشورٍ لم يُنفَق عليه شيء.
   */
  const clips = videoCapGate(allowance.usage.clips, allowance.settings.dailyVideoCap)
  if (clips.blocker !== null) return { kind: 'blocked', reason: blockerReason(clips.blocker) }

  // ٤ — الرابطُ يُوقَّع لحظتَه: النافذةُ تبدأ من الاستعمال لا قبله
  const token = await signMediaToken(deps.encKey, image.id, now)
  const imageUrl = mediaUrl(deps.baseUrl, token)

  /*
   * ٥ — الحجزُ قبل أوّل إنفاق (D-068).
   *
   * **والقراءةُ في ٢ لا تكفي**: صفُّ `media` لا يوجد إلّا بعد دقائق —
   * التوليدُ ثمّ السحبُ ثمّ الرفع — فكلُّ نقرةٍ في تلك الدقائق تجد
   * «لا مقطع» وتبدأ توليدا يُدفَع ثمنُه.
   *
   * **وهنا لا فوق**: حجزٌ قبل حارسٍ يمنع يُقفل البابَ ثلاثين دقيقةً
   * على منشورٍ لم يُنفَق عليه شيءٌ أصلا.
   */
  const key = await videoKey(postId, prompt)
  const held = await claimGeneration(deps.db, key, postId, 'video', now)
  if (held.kind === 'busy') return { kind: 'in_progress', since: held.since }

  /*
   * ٥٫٥ — **النموذجُ من التوجيه لا من الشيفرة** (D-091).
   *
   * كان `alibaba/hh1-i2v` مثبَّتا هنا حرفا — **فاختيارُ المالك في
   * اللوحة يُكتب في `task_routes` ولا يصل إلى هذا النداء**. وهي علّةُ
   * D-079 نفسُها في مكانٍ لم يُفتَّش: يُقرأ ولا يُطاع.
   *
   * **ويُقرأ بعد الحجز لا قبله**: قراءةُ صفٍّ قد تسقط، وسقوطُها قبل
   * الحجز يترك البابَ مفتوحا لنقرةٍ ثانية. و`routeFor` لا تعود فارغةً
   * أبدا — إن لم يُكتَب صفٌّ رجعت إلى افتراض الشيفرة.
   */
  const route = await routeFor(deps.db, 'video').catch(() => null)
  const model = route?.model ?? VIDEO_MODELS.fromImage

  // ٦ — الكلفةُ تُسجَّل قبل أن يُعدّ النداءُ ناجحا (D-008).
  //
  // **ولا يُخترَع سعر.** سعرُ الفيديو عند Cloudflare يُقرأ من لوحة
  // الحساب ولم يُقرأ بعد، فيُسجَّل صفرٌ **موسومٌ** — ودفترٌ فيه صفرٌ
  // يقول «لم يُسعَّر» أصدقُ من رقمٍ يُظنّ حقيقةً وهو تخمين
  await recordCost(deps.db, {
    provider: 'cloudflare',
    // **والدفترُ يسجّل ما نُودي به فعلا**: اسمٌ ثابتٌ في الدفتر
    // ونموذجٌ متغيّرٌ في النداء يجعل الكلفةَ تُنسَب إلى غير صاحبها
    operation: `video:${model}:price_unverified`,
    units: 1,
    unitCost: 0,
    refId: postId,
  })

  let url: string
  try {
    const out = await generateVideo(
      deps.ai,
      { imageUrl, prompt, durationSeconds: MAX_SECONDS, ratio: '9:16', resolution: '720P' },
      model,
    )
    url = out.url
  } catch (error) {
    // **وفشلٌ يترك حجزَه يمنع إعادةَ المحاولة ثلاثين دقيقة**
    await releaseClaim(deps.db, key)
    return {
      kind: 'failed',
      reason: error instanceof Error ? error.message : 'تعذّر التوليد',
      retryable: error instanceof AiError ? error.retryable : false,
    }
  }

  // ٧ — البايتاتُ تُسحَب فورا: الرابطُ عند المزوّد لا عندنا
  let bytes: Uint8Array
  let mime: string
  try {
    const pulled = await fetchVideoBytes(url, deps.fetchImpl ?? fetch, MAX_VIDEO_BYTES)
    bytes = pulled.bytes
    mime = pulled.mime
  } catch (error) {
    await releaseClaim(deps.db, key)
    return {
      kind: 'failed',
      reason: error instanceof Error ? error.message : 'تعذّر السحب',
      retryable: error instanceof AiError ? error.retryable : true,
    }
  }

  // ٨ — R2 قبل الصفّ: صفٌّ بلا بايتات يكذب، وبايتاتٌ بلا صفٍّ تيتم
  //
  // **ومفتاحُ R2 ليس مفتاحَ عدم التكرار**: كان الواحدُ يؤدّي الدورين،
  // وفيه `uuid` — فعمودٌ `UNIQUE` لا يمنع شيئا (D-068)
  const mediaId = crypto.randomUUID()
  const r2Key = objectKey(await orgOfPost(deps.db, postId), `video/${postId}/${mediaId}.mp4`)
  try {
    await deps.bucket.put(r2Key, bytes)
  } catch (error) {
    await releaseClaim(deps.db, key)
    return {
      kind: 'failed',
      reason: `تعذّر حفظُ البايتات: ${error instanceof Error ? error.message : 'عطل'}`,
      retryable: true,
    }
  }

  await deps.db
    .prepare(
      `INSERT INTO media (id, post_id, r2_key, mime, bytes, prompt, model, cost_usd,
                          status, idempotency_key, width, height, org_id)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, 'ready', ?8, 720, 1280, (SELECT org_id FROM posts WHERE id = ?2))`,
    )
    // ‏والمقطعُ رأسيٌّ بمقاسٍ واحد (D-052): ‏9:16 بدقّة 720P كما يُطلب من النموذج
    .bind(mediaId, postId, r2Key, mime, bytes.length, prompt, model, key)
    .run()

  return { kind: 'generated', mediaId, bytes: bytes.length }
}

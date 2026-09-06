/**
 * مهمّة التوليد: من منشورٍ إلى صورةٍ في R2 وصفٍّ في `media`.
 *
 * **الترتيب هو الحوكمة:**
 *
 *   ١ · اقرأ المنشور
 *   ٢ · إن وُلّدت صورةٌ لهذا النصّ — اخرج بلا نداء (D-004)
 *   ٣ · **افحص الإيقاف والسقفين وسقفَ المزوّد** — قبل أيّ نداء (D-019)
 *   ٤ · نادِ المزوّد الموجَّه لمهمّة `image`
 *   ٥ · **سجّل الكلفة** (D-008)
 *   ٦ · ارفع البايتات إلى R2
 *   ٧ · اكتب الصفّ
 *
 * ## ولماذا R2 قبل القاعدة
 *
 * لو كُتب الصفُّ أوّلا وفشل الرفع، لأشارت اللوحةُ إلى صورةٍ لا وجود لها —
 * **صفٌّ يكذب**، ومنشورٌ يُعتمد بصورةٍ لم يرها أحد. ولو رُفعت البايتاتُ
 * وفشل الصفّ، بقيت بايتاتٌ يتيمةٌ لا يشير إليها أحد ولا تضرّ.
 *
 * **والأرخصُ خطأً هو الذي يقع أوّلا.**
 */
import { recordCost } from '../cost'
import { blockerReason, checkAllowance, checkProvider } from '../limits'
import { costOf, getProvider, resolveKey } from '../providers'
import { routeFor } from '../ai/routes'
import { claimGeneration, releaseClaim } from '../media/claim'
import { generateImage } from './gemini'
import { CF_IMAGE_MODEL, generateImageCf } from './cloudflare'
import { imagePrompt, topicOf } from './prompt'
import type { Platform } from '../draft/prompt'
import type { Db } from '../tokens'

/** أقصى ما يُقبل من بايتات — حدُّ المنصّتين أدنى من هذا بكثير. */
export const MAX_BYTES = 5 * 1024 * 1024

export type ImageOutcome =
  | {
      readonly kind: 'generated'
      readonly mediaId: string
      readonly key: string
      readonly bytes: number
      readonly cost: number
    }
  /** وُلّدت لهذا النصّ — لا نداء ولا كلفة. */
  | { readonly kind: 'already'; readonly mediaId: string }
  /**
   * نداءٌ لهذه الصورة جارٍ الآن — **وليس فشلا**.
   *
   * الفحصُ في ٢ يقرأ صفّا لا يوجد قبل انتهاء النداء، فطلبان متزامنان
   * يقرآن «لا» كلاهما **ويدفعان كلاهما** (D-068).
   */
  | { readonly kind: 'in_progress'; readonly since: string }
  | { readonly kind: 'blocked'; readonly reason: string }
  | { readonly kind: 'failed'; readonly reason: string; readonly retryable: boolean }

/** أقلُّ ما نحتاجه من R2 — لا نوعُ Cloudflare كاملا، فيُزيَّف في الاختبار. */
export interface Bucket {
  put(key: string, value: ArrayBuffer | Uint8Array, options?: unknown): Promise<unknown>
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>
  delete(key: string): Promise<void>
}

export interface ImageDeps {
  readonly db: Db
  readonly bucket: Bucket
  readonly encKey: string
  readonly workerSecrets: Readonly<Record<string, string | undefined>>
  readonly fetchImpl?: typeof fetch
  /** تُحقَن ليُختبَر شيخوخةُ الحجز بلا انتظار (D-068). */
  readonly now?: () => Date
}

/**
 * مفتاحُ عدم التكرار.
 *
 * يجمع المنشور وبصمةَ نصّه: فنقرتان متتاليتان لا تدفعان مرّتين، **ونصٌّ
 * عدّله المالك يعطي مفتاحا جديدا** فتُولَّد صورةٌ تناسب النصّ الجديد.
 */
export async function imageKey(postId: string, text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text.trim()))
  const hex = [...new Uint8Array(digest)]
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return `image:${postId}:${hex}`
}

interface PostRow {
  id: string
  platform: string
  text: string
  status: string
}

export async function generateForPost(deps: ImageDeps, postId: string): Promise<ImageOutcome> {
  // ١ · المنشور
  const post = await deps.db
    .prepare('SELECT id, platform, text, status FROM posts WHERE id = ?')
    .bind(postId)
    .first<PostRow>()
  if (post === null) return { kind: 'failed', reason: 'لا منشور بهذا المعرّف', retryable: false }

  // ما نُشر لا تُضاف إليه صورة: خرج كما هو، وصورةٌ بعده تصف ما لم يُنشر
  if (post.status === 'published' || post.status === 'queued') {
    return { kind: 'failed', reason: `حالتُه «${post.status}» — والصورةُ تُضاف قبل الجدولة`, retryable: false }
  }

  // ٢ · أوُلّدت لهذا النصّ؟
  const key = await imageKey(post.id, post.text)
  const existing = await deps.db
    .prepare('SELECT id FROM media WHERE idempotency_key = ?')
    .bind(key)
    .first<{ id: string }>()
  if (existing !== null) return { kind: 'already', mediaId: existing.id }

  // ٣ · الحارس العامّ قبل أيّ نداء
  const allowance = await checkAllowance(deps.db)
  if (allowance.blocker !== null) {
    return { kind: 'blocked', reason: blockerReason(allowance.blocker) }
  }

  const route = await routeFor(deps.db, 'image')

  const provider = await getProvider(deps.db, route.provider)
  if (provider === null) {
    return { kind: 'failed', reason: `مزوّدٌ غير موجود: ${route.provider}`, retryable: false }
  }

  // وسقفُ المزوّد بعد العامّ لا قبله: مَن قدّم التفصيل على الجملة قال
  // «Gemini متاح» ونظامُه موقوف
  const perProvider = await checkProvider(deps.db, provider.name)
  if (perProvider !== null) return { kind: 'blocked', reason: blockerReason(perProvider) }

  /*
   * **واسمُ السرِّ يتبع المزوّد** (D-079): كان مقصورا على Gemini، فمن
   * وجّه الصورَ إلى Cloudflare لم يجد رمزَه في البيئة ولو كان مضبوطا.
   */
  const secretName =
    provider.name === 'gemini' && provider.builtin
      ? 'GEMINI_API_KEY'
      : provider.name === 'cloudflare'
        ? 'CF_AI_TOKEN'
        : undefined
  const resolved = await resolveKey(
    deps.db,
    deps.encKey,
    provider.name,
    secretName === undefined ? undefined : deps.workerSecrets[secretName],
  )
  if (resolved.key === null) {
    return { kind: 'failed', reason: `لا مفتاح لـ ${provider.label}`, retryable: false }
  }

  /*
   * ٣·ب · الحجزُ قبل النداء (D-068).
   *
   * **والقيدُ `UNIQUE` في ٧ يقع متأخّرا**: يمنع الصفَّ المكرّر بعد أن
   * وقع الدفعُ المكرّر — وهو ليس ما وُجد لأجله (D-004).
   */
  const held = await claimGeneration(deps.db, key, post.id, 'image', (deps.now ?? (() => new Date()))())
  if (held.kind === 'busy') return { kind: 'in_progress', since: held.since }

  // ٤ · النداء
  const platform: Platform = post.platform === 'x' ? 'x' : 'linkedin'
  const prompt = imagePrompt({ topic: topicOf(post.text), platform })

  /*
   * **والسائقُ يتبع المزوّدَ المختار** (D-079).
   *
   * كان الاستيرادُ مثبَّتا على Gemini: يُقرأ اختيارُ المالك من اللوحة
   * ثمّ يُنادى Gemini على كلّ حال. فمن وجّه الصورَ إلى Cloudflare أُرسل
   * اسمُ نموذجِها إلى عنوان Google — **فردّت ٤٠٥**. والاختيارُ كان
   * يُقرأ ولا يُطاع.
   */
  let image: Awaited<ReturnType<typeof generateImage>>
  try {
    image =
      provider.name === 'cloudflare'
        ? await generateImageCf({
            accountId: deps.workerSecrets['CF_AI_ACCOUNT_ID'] ?? '',
            apiToken: resolved.key,
            // ونموذجٌ لم يُسمَّ في التوجيه يأخذ افتراضَ المزوّد لا افتراضَ غيرِه
            model: route.model.startsWith('@cf/') ? route.model : CF_IMAGE_MODEL,
            prompt,
            ...(deps.fetchImpl === undefined ? {} : { fetchImpl: deps.fetchImpl }),
          })
        : await generateImage({
            apiKey: resolved.key,
            model: route.model,
            prompt,
            ...(deps.fetchImpl === undefined ? {} : { fetchImpl: deps.fetchImpl }),
          })
  } catch (error) {
    const retryable =
      typeof error === 'object' && error !== null && 'retryable' in error
        ? Boolean((error as { retryable: unknown }).retryable)
        : true
    await releaseClaim(deps.db, key)
    return {
      kind: 'failed',
      reason: error instanceof Error ? error.message : 'نداءٌ فشل',
      retryable,
    }
  }

  // ٥ · **الكلفة قبل الرفع والكتابة** — النداءُ وقع وحوسِب عليه
  //
  // وصورةٌ تُسعَّر بالنداء لا بالرمز: `costOf` تحسب بالرموز، فتُمرَّر
  // وحدةٌ واحدة في `outputTokens` ليكون سعرُ المخرَج سعرَ الصورة. ومزوّدٌ
  // بلا سعرٍ مضبوط يعطي صفرا **ويُعلَّم** — ولا يُخمَّن رقمٌ يُظنّ حقيقة
  const priced = costOf(provider, { inputTokens: 0, outputTokens: 1 })
  await recordCost(deps.db, {
    provider: provider.name,
    operation: `image:${platform}:${image.model}`,
    units: 1,
    unitCost: priced.total,
    refId: post.id,
  })

  // حدُّ الحجم بعد التسجيل: صورةٌ ضخمة كلّفت ما كلّفت
  if (image.bytes.length > MAX_BYTES) {
    await releaseClaim(deps.db, key)
    return {
      kind: 'failed',
      reason: `الصورة ${Math.round(image.bytes.length / 1024)}KB وفوق السقف`,
      retryable: false,
    }
  }

  // ٦ · R2 أوّلا — بايتاتٌ يتيمةٌ أرخص من صفٍّ يكذب
  const mediaId = crypto.randomUUID()
  const extension = image.mime.includes('jpeg') ? 'jpg' : image.mime.includes('webp') ? 'webp' : 'png'
  const r2Key = `img/${post.id}/${mediaId}.${extension}`
  try {
    await deps.bucket.put(r2Key, image.bytes, {
      httpMetadata: { contentType: image.mime },
    })
  } catch (error) {
    await releaseClaim(deps.db, key)
    return {
      kind: 'failed',
      reason: `تعذّر رفعُ الصورة: ${error instanceof Error ? error.message : 'عطل'}`,
      retryable: true,
    }
  }

  // ٧ · الصفّ
  try {
    await deps.db
      .prepare(
        `INSERT INTO media (id, post_id, r2_key, mime, bytes, prompt, model, cost_usd, idempotency_key)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(mediaId, post.id, r2Key, image.mime, image.bytes.length, prompt, image.model, priced.total, key)
      .run()
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    // سباقٌ على المفتاح نفسه: الآخرُ سبق. وبايتاتُنا لا يشير إليها أحد فتُمحى
    if (message.includes('UNIQUE')) {
      await deps.bucket.delete(r2Key).catch(() => undefined)
      const won = await deps.db
        .prepare('SELECT id FROM media WHERE idempotency_key = ?')
        .bind(key)
        .first<{ id: string }>()
      if (won !== null) return { kind: 'already', mediaId: won.id }
    }
    await releaseClaim(deps.db, key)
    return { kind: 'failed', reason: `تعذّرت كتابة الصفّ: ${message}`, retryable: false }
  }

  return { kind: 'generated', mediaId, key: r2Key, bytes: image.bytes.length, cost: priced.total }
}

export interface MediaRow {
  readonly id: string
  readonly postId: string
  readonly key: string
  readonly mime: string
  readonly bytes: number
  /**
   * الوصفُ الذي وُلّدت به.
   *
   * وتعليقُ `0010` يقول لماذا: **«صورةٌ لا يُعرف وصفُها لا تُعاد ولا
   * تُحسَّن»** — وكان يُكتب في كلّ صفٍّ **ولا يُقرأ في أيّ استعلام**
   * (D-070).
   */
  readonly prompt: string
  readonly model: string
  readonly cost: number
  readonly status: 'ready' | 'rejected'
  readonly createdAt: string
}

/** صورُ منشوراتٍ بعينها — استعلامٌ واحد لا واحدٌ لكلّ بطاقة. */
export async function mediaFor(db: Db, postIds: readonly string[]): Promise<MediaRow[]> {
  if (postIds.length === 0) return []
  const marks = postIds.map(() => '?').join(', ')
  try {
    const { results } = await db
      .prepare(
        `SELECT id, post_id, r2_key, mime, bytes, prompt, model, cost_usd, status, created_at
           FROM media WHERE post_id IN (${marks}) ORDER BY created_at DESC`,
      )
      .bind(...postIds)
      .all<Record<string, string | number>>()
    return results.map((r) => ({
      id: String(r['id']),
      postId: String(r['post_id']),
      key: String(r['r2_key']),
      mime: String(r['mime']),
      bytes: Number(r['bytes']),
      prompt: String(r['prompt'] ?? ''),
      model: String(r['model']),
      cost: Number(r['cost_usd']),
      status: r['status'] === 'rejected' ? 'rejected' : 'ready',
      createdAt: String(r['created_at']),
    }))
  } catch {
    // جدولٌ لم يُرحَّل بعد: لوحةٌ تُفتح بلا صورٍ خيرٌ من لوحةٍ لا تُفتح
    return []
  }
}

/**
 * رفضُ صورة — **ولا تُحذف بايتاتُها**.
 *
 * كلفتُها وقعت وسُجّلت، وحذفُها يجعل الدفترَ يذكر إنفاقا لا أثر له.
 * وما دُفع ثمنُه يُرى (D-036).
 */
export async function rejectMedia(db: Db, mediaId: string): Promise<boolean> {
  // قراءةٌ ثمّ كتابة: عقدُ `run` في `Db` لا يعيد عددَ الصفوف المتأثّرة،
  // وقراءةُ حقلٍ غيرِ مضمونٍ في غلافٍ يعيده السائق تربط الشيفرةَ بشكلٍ
  // قد يتبدّل. واستعلامان رخيصان أوثقُ من حقلٍ لا يضمنه العقد
  const row = await db
    .prepare("SELECT status FROM media WHERE id = ?")
    .bind(mediaId)
    .first<{ status: string }>()
  if (row === null || row.status !== 'ready') return false

  await db.prepare("UPDATE media SET status = 'rejected' WHERE id = ?").bind(mediaId).run()
  return true
}

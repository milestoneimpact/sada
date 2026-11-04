/**
 * مهمّة التوليد: من منشورٍ إلى صورةٍ في R2 وصفٍّ في `media`.
 *
 * **الترتيب هو الحوكمة:**
 *
 *   ١ · اقرأ المنشور
 *   ٢ · إن وُلّدت صورةٌ لهذا النصّ — اخرج بلا نداء (D-004)
 *   ٣ · **افحص الإيقاف والسقفين، ثمّ بوّابةَ المزوّد** — قبل أيّ نداء (D-019 · D-163)
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
import { record } from '../audit'
import { blockerReason, checkAllowance, checkProvider } from '../limits'
import { costOf, getProvider, resolveKey } from '../providers'
import { routeFor } from '../ai/routes'
import { CLAIM_UNAVAILABLE, claimGeneration, releaseClaim } from '../media/claim'
import { generateImage } from './gemini'
import { CF_IMAGE_MODEL, generateImageCf } from './cloudflare'
import { DRAFT_IMAGE_MODEL, FINAL_IMAGE_MODEL, cfPrice, imageNeurons, neuronsUsedToday, splitCharge, FREE_NEURONS_PER_DAY } from '../ai/imagePricing'
import { cfAccountOf } from '../ai/cloudflare'
import { imageProviderGate, imageSecretName, slideGate, type ImageRefusal } from './gate'
import { imagePrompt, topicOf } from './prompt'
import { visualBrief } from './brief'
import { SlideError, screenshotSlide } from './render'
import { INFO_SIZE, infographicHtml, infographicSpec } from './infographic'
import { imageSize } from './size'
import { HEADLINE_MAX, OVERLAY_OFF, SLIDE_SIZE, clip, slideHtml } from './slide'
import { readSettings } from '../settings'
import type { Platform } from '../draft/prompt'
import type { Db } from '../tokens'
import { objectKey } from '../tenancy'

/** أقصى ما يُقبل من بايتات — حدُّ المنصّتين أدنى من هذا بكثير. */
export const MAX_BYTES = 5 * 1024 * 1024

export type ImageOutcome =
  | {
      readonly kind: 'generated'
      readonly mediaId: string
      readonly key: string
      readonly bytes: number
      readonly cost: number
      /**
       * ما لم يقع — **ويُعرَض** (D-088).
       *
       * الشريحةُ تسقط صامتةً بخمسة أسباب، فالمالكُ يرى صورةً بلا نصّ
       * ولا يعرف السبب. وفارغٌ يعني أنّ كلَّ شيءٍ تمّ.
       */
      readonly note: string
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
  /** منظّمةُ المنشور — تُقرأ معه وتسوق كلَّ جملةٍ بعده (D-277). */
  org_id: string
}

/** أقصى صورةٍ تُضَمّ في الشريحة — وفوقه يبقى الأصلُ بلا نصّ. */
export const MAX_OVERLAY_BYTES = 3 * 1024 * 1024

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  // على دفعاتٍ: `String.fromCharCode(...bytes)` تتجاوز حدَّ الوسائط على
  // صورةٍ بمئات الكيلوبايتات فترمي RangeError
  const step = 0x8000
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step))
  }
  return btoa(binary)
}

interface SlideRequest {
  readonly image: { bytes: Uint8Array; mime: string; model: string }
  readonly platform: Platform
  readonly headline: string
  readonly kicker: string
}

/**
 * يركّب النصَّ العربيَّ فوق الصورة — **ويعيد سببا بدل أن يرمي**.
 *
 * فالشريحةُ تحسينٌ لا شرط: كلُّ سببِ سقوطٍ هنا يُبقي الصورةَ كما هي.
 * **ومنشورٌ بصورةٍ نظيفةٍ خيرٌ من منشورٍ بلا صورة** — وهي قاعدةُ الموجز
 * البصريّ نفسُها (D-083).
 *
 * **والسقوطُ الصامتُ يُقرأ عطلا** (D-088): كان يعيد `null` في خمس حالاتٍ
 * لا تُفرَّق، فالمالكُ يرى «وُلّدت صورة» ولا يرى نصّا فوقها **ولا يعرف
 * أيَّ الخمسِ وقعت** — أمفتاحُ المتصفّح غائب؟ أم أُطفئ التركيب؟ أم سقط
 * النداء؟ فيُعاد الضبطُ في مكانٍ سليمٍ ويبقى العطل. **فيُعاد السببُ
 * مع المخرَج، ويُعرَض.**
 */
export interface SlideOutcome {
  readonly slide: { bytes: Uint8Array; mime: string; model: string } | null
  /** فارغٌ حين تُركَّب — ونصٌّ يُقرأ حين لا تُركَّب. */
  readonly reason: string
}

export async function composeSlide(
  deps: ImageDeps,
  request: SlideRequest,
): Promise<SlideOutcome> {
  // **والفحوصُ بترتيب ما يقرّره المالك** (D-157): الإعدادُ ثمّ السرّ ثمّ
  // العنوان ثمّ الحجم. كان العنوانُ أوّلا، فمن لم يضبط المفتاحَ بعدُ وسقط
  // موجزُه قرأ «بلا عنوان» — وهو سببٌ لا يصلحه، والسببُ الذي يصلحه مخفيّ
  //
  // **والحكمُ من `slideGate`** (D-163): اللوحُ يقرؤه قبل الضغط فيقول ما ستقوله
  // هذه الدالّةُ بعده — وحكمٌ منسوخٌ في اللوح يفترق عن هذا عند أوّل تصحيح
  const settings = await readSettings(deps.db)
  const accountId = (deps.workerSecrets['CF_AI_ACCOUNT_ID'] ?? '').trim()
  const apiToken = (deps.workerSecrets['CF_BROWSER_TOKEN'] ?? '').trim()
  const gate = slideGate({
    overlay: settings.imageOverlay,
    hasBrowserKey: apiToken !== '',
    hasAccount: accountId !== '',
  })
  if (gate.state === 'off') {
    return { slide: null, reason: OVERLAY_OFF }
  }
  if (gate.state === 'unset') {
    return {
      slide: null,
      reason:
        'لا مفتاح متصفّح مضبوط — اضبط CF_BROWSER_TOKEN و CF_AI_ACCOUNT_ID' +
        ' في أسرار Worker ليُركَّب النصّ فوق الصورة',
    }
  }
  if (request.headline.trim() === '') {
    return { slide: null, reason: 'بلا عنوان في الموجز — ولا يُخترَع نصّ' }
  }
  if (request.image.bytes.length > MAX_OVERLAY_BYTES) {
    return { slide: null, reason: 'الصورة فوق حدّ الضمّ — بقيت بلا نصّ' }
  }

  const size = SLIDE_SIZE[request.platform]
  const html = slideHtml({
    imageBase64: toBase64(request.image.bytes),
    imageMime: request.image.mime,
    headline: request.headline,
    kicker: request.kicker,
    platform: request.platform,
  })

  let shot: { bytes: Uint8Array; mime: string }
  try {
    shot = await screenshotSlide({
      accountId,
      apiToken,
      html,
      width: size.width,
      height: size.height,
      ...(deps.fetchImpl === undefined ? {} : { fetchImpl: deps.fetchImpl }),
    })
  } catch (error) {
    // **ولا يُسجَّل ما لم يقع**: نداءٌ سقط قبل أن يُصوَّر شيءٌ لا كلفةَ له،
    // ونداءٌ ردَّ خطأً لا يُحاسَب عليه عند Cloudflare
    return {
      slide: null,
      reason: `تعذّر تصوير الشريحة: ${error instanceof Error ? error.message : 'عطل'}`,
    }
  }

  // **وكلفةُ اللقطة تُسجَّل** — نداءٌ خارجيٌّ مدفوعٌ لا يُخفى (D-008).
  // وسعرُها غيرُ مضبوطٍ عندنا فيُسجَّل صفرا **معلَّما**، ولا يُخمَّن رقم
  await recordCost(deps.db, {
    provider: 'cloudflare-browser',
    operation: `slide:${request.platform}`,
    units: 1,
    unitCost: 0,
  })

  return {
    slide: { bytes: shot.bytes, mime: shot.mime, model: request.image.model },
    reason: '',
  }
}

/** أقصى ما يُحفَظ من السبب — ورسالةُ خطأٍ من الشبكة قد تطول بلا حدّ. */
export const NOTE_MAX = 300

/** يقصّ نصًّا إلى حدٍّ — **ويقول إنّه قُصّ**: ذيلٌ مبتورٌ بلا علامةٍ يُقرأ كاملا. */
function cut(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}

/**
 * ما يُقال للمالك عن الشريحة.
 *
 * **وسببُ سقوط الموجز كان يُحسَب ثمّ يُرمى** (D-157): يعود في `detail`
 * فلا يقرؤه أحد، ويُقال «بلا عنوانٍ في الموجز» — وهو عرَضٌ لا سبب. فإن
 * سقط الموجزُ سُمّي سقوطُه قبل ما ترتّب عليه.
 *
 * **والحدُّ يُقسَم هنا لا يُقصّ من الذيل بعدُ** (D-162). السقوطُ أوّلُ
 * السبب، وفيه خطأُ الشبكة كما جاء — ردُّ Anthropic على رصيدٍ لا يكفي نحو
 * 270 حرفًا. **وما يُصلحه المالكُ أو ما قرّره في آخره**: «اضبط
 * CF_BROWSER_TOKEN…» أو «مُطفأٌ من الإعدادات». وكان القصُّ عند 300 يأكل
 * الآخِرَ أوّلا، فيضيع المفتاحُ الذي بيده، **وتقرأ البطاقةُ الإطفاءَ عطلًا
 * أصفر** — لأنّها تعرفه بذيله (`OVERLAY_OFF`). فالسببُ الثاني يُحفَظ
 * كاملًا، ويأخذ الأوّلُ ما بقي من الحدّ.
 */
export function noteOf(
  visual: { brief: unknown; detail: string },
  overlay: { reason: string },
): string {
  if (overlay.reason === '') return ''
  const reason = cut(overlay.reason, NOTE_MAX)
  const room = NOTE_MAX - reason.length - '؛ '.length
  if (visual.brief === null && visual.detail !== '' && room > 0) {
    return `${cut(visual.detail, room)}؛ ${reason}`
  }
  return reason
}

/**
 * صفُّ الصورة — **جملةٌ واحدةٌ لموضعَي الكتابة** (D-162).
 *
 * كانت منسوخةً حرفًا في الخطوة ٧ وفي إعادتها بعد تحرير اسمٍ مرفوض (D-088).
 * **والنسخةُ الثانيةُ هي التي تنسى العمودَ الجديد**: مسارٌ نادرٌ لا يمرّ
 * فيه أحدٌ حتّى يمرّ، فيُكتب صفٌّ بلا سببه والأوّلُ بسببه.
 */
const INSERT_IMAGE =
  `INSERT INTO media (id, post_id, r2_key, mime, bytes, prompt, model, cost_usd, idempotency_key,
                      note, headline, width, height, org_id)
   VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)`

/**
 * ما يُقال حين تردّ بوّابةُ المزوّد — **ونصوصُ ما كان قائمًا باقيةٌ حرفًا**:
 * «مزوّدٌ غير موجود» و«لا مفتاح» وسببُ الحارس. والجديدان (السائقُ والحساب)
 * كانا يقعان داخل النداء بعد الدفع، فلا نصَّ قبلهما يُحفَظ.
 */
function refusalOutcome(refusal: ImageRefusal, name: string, label: string): ImageOutcome {
  switch (refusal.kind) {
    case 'missing':
      return { kind: 'failed', reason: `مزوّد غير موجود: ${name}`, retryable: false }
    case 'cannot_image':
      return {
        kind: 'failed',
        reason: `${label} لا يولّد صورًا — وجّه الصور إلى Gemini أو Cloudflare`,
        retryable: false,
      }
    case 'blocked':
      return { kind: 'blocked', reason: blockerReason(refusal.blocker) }
    case 'no_key':
      return { kind: 'failed', reason: `لا مفتاح لـ ${label}`, retryable: false }
    case 'no_account':
      return {
        kind: 'failed',
        reason:
          'لا معرّف حساب لـ Cloudflare — اضبط CF_AI_ACCOUNT_ID،' +
          ' أو احفظ البطاقة بعنوان فيه معرّف الحساب',
        retryable: false,
      }
  }
}

/**
 * نمطُ الصورة (D-174): **إنفوجرافيك من نصّ المنشور** (الافتراض)، أو **صورةٌ فنّيّة**
 * من موجزٍ بصريٍّ يترجم النصّ. وكلاهما يحمل فكرةَ المنشور؛ **ولا تُولَّد صورةٌ بوصفٍ
 * عامٍّ لا يمتّ إليه** — وتلك التي أخرجت مشهدًا جميلًا عن «خمسة أبعادٍ وثلاث طبقات».
 */
export type ImageStyle = 'infographic' | 'illustration'

/**
 * خيارُ الاستبدال: **صورةٌ جاهزةٌ تُرفَض إن مرّ التوليدُ بحرّاسه كلِّهم**.
 *
 * كان البديلُ ضغطتين: «ارفض الصورة» ثمّ «ولّد صورة». **والأولى تقع ولو
 * سقطت الثانيةُ عند سقفٍ أو مفتاح**، فيبقى المنشورُ بلا صورةٍ أصلا. فالرفضُ
 * هنا بعد البوّابات لا قبلها: ما سيُردّ لا يمسّ الصورةَ القائمة.
 */
export interface GenerateOptions {
  readonly replace?: string
  readonly style?: ImageStyle
  /**
   * منظّمةُ الجلسة حين يُنادى من اللوحة (D-277): المنشورُ يُقرأ فيها وحدَها. والطابورُ
   * بلا جلسةٍ يقرأ المنشورَ بمعرّفه **مع منظّمته**، وبها تُساق كلُّ جملةٍ بعده.
   */
  readonly org?: string
  /**
   * مستوى الرسم الفنّيّ على Cloudflare (D-285، قرارُ المالك): المسوّدةُ بـ schnell الرخيص، و`final` بـ klein 9B
   * بعد الاعتماد — فلا تُدفع الجودةُ العالية على منشورٍ سيُرفض. وغيابُه مسوّدة.
   */
  readonly tier?: 'draft' | 'final'
  /** النهائيّةُ تُرسم بوصف المسوّدة المعتمَدة نفسِه، لا بموجزٍ جديدٍ يُدفع ثمنُه ويرسم غيرَها. */
  readonly reuse?: { readonly prompt: string; readonly headline: string }
  /** المالكُ أذن بالدفع فوق الحصّة المجّانيّة اليوم (D-285). */
  readonly overage?: boolean
}

/** مقاسُ التوليد لـ FLUX.2 — دون ميغابكسلٍ واحد فيبقى بسعر الميغابكسل الأوّل، وبنسبة المنصّة. */
const GEN_SIZE: Readonly<Record<Platform, { width: number; height: number }>> = {
  linkedin: { width: 1344, height: 704 },
  x: { width: 1344, height: 768 },
  tiktok: { width: 768, height: 1344 },
  youtube: { width: 768, height: 1344 },
} as Readonly<Record<Platform, { width: number; height: number }>>

/** هل أذن المالكُ اليومَ بالدفع فوق الحصّة؟ قرارُه في سجلّ التدقيق، **ولمنظّمته وحدَها** — لا يفتح الدفعَ لغيرها. */
export async function overageApprovedToday(db: Db, org: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT 1 AS ok FROM audit_log WHERE org_id = ? AND action = 'image.overage.approve' AND at >= date('now') LIMIT 1")
    .bind(org)
    .first<{ ok: number }>()
    .catch(() => null)
  return row !== null
}

/** منصّةُ المقاس — ومنصّاتُ المقاطع رأسيّةٌ لا LinkedIn كما كانت تُقرأ. */
function sizePlatform(platform: string): Platform {
  return platform === 'x' || platform === 'tiktok' || platform === 'youtube' ? platform : 'linkedin'
}

export async function generateForPost(
  deps: ImageDeps,
  postId: string,
  options: GenerateOptions = {},
): Promise<ImageOutcome> {
  // ١ · المنشور
  const post = options.org === undefined
    ? await deps.db
      .prepare('SELECT id, platform, text, status, org_id FROM posts WHERE id = ?')
      .bind(postId)
      .first<PostRow>()
    : await deps.db
      .prepare('SELECT id, platform, text, status, org_id FROM posts WHERE id = ? AND org_id = ?')
      .bind(postId, options.org)
      .first<PostRow>()
  if (post === null) return { kind: 'failed', reason: 'لا منشور بهذا المعرّف', retryable: false }

  // ما نُشر لا تُضاف إليه صورة: خرج كما هو، وصورةٌ بعده تصف ما لم يُنشر
  if (post.status === 'published' || post.status === 'queued') {
    return { kind: 'failed', reason: `حالتُه «${post.status}» — والصورة تُضاف قبل الجدولة`, retryable: false }
  }

  // ‏**ومنشورُ مقطع المالك لا تُولَّد له صورة** (D-182): الصورةُ تصير أحدثَ وسيطه فتُنشر
  // على Instagram مكانَ الـ Reel. واللوحةُ لا تعرض الزرَّ له، وهذا الحارسُ لمن نادى المسارَ بلا لوحة
  const owned = await deps.db
    .prepare("SELECT id FROM media WHERE post_id = ? AND org_id = ? AND model = 'upload' AND status = 'ready' LIMIT 1")
    .bind(post.id, post.org_id)
    .first<{ id: string }>()
  if (owned !== null) {
    return { kind: 'failed', reason: 'لهذا المنشور مقطعُك المرفوع — يُنشر هو، ولا تُولَّد له صورة', retryable: false }
  }

  /*
   * ٢ · أوُلّدت لهذا النصّ؟
   *
   * **والسؤالُ عن الحال لا عن الاسم** (D-088). والاسمُ يُصلَح بترحيلٍ مرّةً
   * واحدة (‏0018)، **والحالُ صحيحةٌ في كلّ صفٍّ منذ ‏0010** — فالحارسُ يُبنى عليها.
   */
  const key = await imageKey(post.id, post.text)
  const existing = await deps.db
    .prepare("SELECT id FROM media WHERE idempotency_key = ? AND org_id = ? AND status = 'ready'")
    .bind(key, post.org_id)
    .first<{ id: string }>()
  if (existing !== null && existing.id !== options.replace) return { kind: 'already', mediaId: existing.id }

  // ‏والمستبدَلةُ صورةُ هذا المنشور الجاهزة، لا معرّفٌ يُمرَّر من النموذج كيفما اتّفق
  if (options.replace !== undefined) {
    const old = await deps.db
      .prepare('SELECT post_id, status FROM media WHERE id = ? AND org_id = ?')
      .bind(options.replace, post.org_id)
      .first<{ post_id: string; status: string }>()
    if (old === null || old.post_id !== post.id || old.status !== 'ready') {
      return { kind: 'failed', reason: 'لا صورة جاهزةً بهذا المعرّف لهذا المنشور', retryable: false }
    }
  }

  // ٣ · الحارس العامّ قبل أيّ نداء
  const allowance = await checkAllowance(deps.db, 'image', post.org_id)
  if (allowance.blocker !== null) {
    return { kind: 'blocked', reason: blockerReason(allowance.blocker) }
  }

  const platform = sizePlatform(post.platform)
  const writerDeps = {
    db: deps.db,
    encKey: deps.encKey,
    workerSecrets: deps.workerSecrets,
    ...(deps.fetchImpl === undefined ? {} : { fetchImpl: deps.fetchImpl }),
  }

  // ── الإنفوجرافيك (D-174) ─────────────────────────────────────────────
  if ((options.style ?? 'infographic') === 'infographic') {
    // ‏والمتصفّحُ شرطُه الوحيد: المحتوى يأتي من النصّ ولو سقط نموذجُ الكتابة
    const accountId = (deps.workerSecrets['CF_AI_ACCOUNT_ID'] ?? '').trim()
    const apiToken = (deps.workerSecrets['CF_BROWSER_TOKEN'] ?? '').trim()
    if (accountId === '' || apiToken === '') {
      return {
        kind: 'blocked',
        reason: 'لا مفتاح متصفّح مضبوط — اضبط CF_BROWSER_TOKEN و CF_AI_ACCOUNT_ID في أسرار Worker ليُرسم الإنفوجرافيك',
      }
    }
    // ‏والمحتوى قبل الرفض والحجز: لا يسقط (يعود إلى النصّ نفسِه)، والرفضُ بعده لا يُفقد الصورةَ القائمة سُدى
    const info = await infographicSpec(writerDeps, post.text, post.id)
    if (options.replace !== undefined) await rejectMedia(deps.db, post.org_id, options.replace)
    const held = await claimGeneration(deps.db, post.org_id, key, post.id, 'image', (deps.now ?? (() => new Date()))())
    if (held.kind === 'busy') return { kind: 'in_progress', since: held.since }
    if (held.kind === 'unavailable') return { kind: 'failed', reason: CLAIM_UNAVAILABLE, retryable: true }

    const size = INFO_SIZE[platform]
    let shot: { bytes: Uint8Array; mime: string }
    try {
      shot = await screenshotSlide({
        accountId,
        apiToken,
        html: infographicHtml(info.spec, platform),
        width: size.width,
        height: size.height,
        ...(deps.fetchImpl === undefined ? {} : { fetchImpl: deps.fetchImpl }),
      })
    } catch (error) {
      await releaseClaim(deps.db, post.org_id, key)
      return {
        kind: 'failed',
        reason: `تعذّر تصوير الإنفوجرافيك: ${error instanceof Error ? error.message : 'عطل'}`,
        retryable: error instanceof SlideError ? error.retryable : true,
      }
    }
    // **وكلفةُ اللقطة تُسجَّل** — نداءٌ خارجيٌّ لا يُخفى (D-008)، وسعرُه غيرُ مضبوطٍ فيُسجَّل صفرا معلَّما
    await recordCost(deps.db, {
      provider: 'cloudflare-browser',
      operation: `infographic:${platform}`,
      units: 1,
      unitCost: 0,
      refId: post.id,
    })
    return persistImage(deps, {
      post, key,
      image: { bytes: shot.bytes, mime: shot.mime, model: `infographic:${info.spec.kind}` },
      // ‏والمحتوى المرسومُ هو «الوصف»: يُقرأ في البطاقة كما رُسم، ومن أين جاء
      prompt: JSON.stringify(info.spec),
      cost: info.cost,
      extraCost: 0,
      note: info.detail,
      headline: clip(info.spec.title, 70),
      width: size.width,
      height: size.height,
    })
  }

  // ── الصورةُ الفنّيّة ─────────────────────────────────────────────────
  const route = await routeFor(deps.db, 'image')
  const provider = await getProvider(deps.db, route.provider)

  /*
   * ٣·أ · **بوّابةُ المزوّد — حقائقُها تُجمَع ثمّ يُحكَم مرّةً** (D-163).
   *
   * **واسمُ السرِّ يتبع المزوّد** (D-079)، **والحسابُ يُسأل هنا لا داخل النداء**:
   * كان `generateImageCf` وحده يكتشف أنّه فارغ — بعد الحجز، وبعد الموجز وقد سُجّل ثمنُه.
   */
  const secretName = provider === null ? undefined : imageSecretName(provider)
  const resolved = provider === null
    ? { key: null }
    : await resolveKey(
        deps.db,
        deps.encKey,
        provider.name,
        secretName === undefined ? undefined : deps.workerSecrets[secretName],
      )
  const accountId = cfAccountOf(deps.workerSecrets['CF_AI_ACCOUNT_ID'], provider?.baseUrl)
  const refusal = imageProviderGate({
    name: route.provider,
    exists: provider !== null,
    blocker: provider === null ? null : await checkProvider(deps.db, provider.name),
    hasKey: resolved.key !== null,
    hasAccount: accountId !== '',
  })
  // والشرطان بعده لا يقعان بعد بوّابةٍ مرّت — يقولانه للنوع لا للتشغيل
  if (refusal !== null || provider === null || resolved.key === null) {
    return refusalOutcome(
      refusal ?? { kind: provider === null ? 'missing' : 'no_key' },
      route.provider,
      provider?.label ?? route.provider,
    )
  }

  /*
   * ٤ · **الموجزُ البصريّ أوّلا** (D-083) — **وسقوطُه يوقف التوليد الآن** (D-174).
   *
   * كان سقوطُه يُبني الوصفَ من «الموضوع» العربيّ الذي لا يقرؤه النموذج، فتخرج
   * صورةٌ في الأسلوب لا علاقةَ لها بالنصّ. **وصورةٌ لا تمتّ إلى المنشور أسوأُ من
   * لا صورة**: تُدفع كلفتُها ويُنشر معها ادّعاءٌ لم يُقصد. فيُردّ بسببه، والصورةُ
   * القائمةُ باقية، والإنفوجرافيك طريقٌ لا يحتاج الموجز.
   */
  /*
   * ٣·ج · **الحصّةُ المجّانيّة قبل أيّ إنفاق** (D-285). النموذجُ بمستواه، وNeurons الصورة بمقاسها؛ فإن تجاوزت ما بقي
   * من حصّة اليوم ولم يأذن المالكُ بالدفع، **لا يُنادى الموجزُ ولا النموذج**: يُسجَّل الانتظارُ ويُسأل المالك.
   */
  const cfModel = provider.name === 'cloudflare'
    ? (options.tier === 'final' ? FINAL_IMAGE_MODEL : cfPrice(route.model) !== null && route.model !== FINAL_IMAGE_MODEL ? route.model : DRAFT_IMAGE_MODEL)
    : null
  const gen = GEN_SIZE[platform] ?? { width: 1024, height: 1024 }
  const neurons = cfModel === null ? null : imageNeurons(cfModel, cfPrice(cfModel)?.multipart === true ? gen.width : 1024, cfPrice(cfModel)?.multipart === true ? gen.height : 1024)
  const usedToday = neurons === null ? 0 : await neuronsUsedToday(deps.db)
  if (neurons !== null && usedToday + neurons > FREE_NEURONS_PER_DAY && options.overage !== true && !(await overageApprovedToday(deps.db, post.org_id))) {
    await record(deps.db, { actor: 'system', action: 'image.quota_wait', target: post.id, detail: `${options.tier ?? 'draft'} · ${Math.round(neurons)}`, org: post.org_id })
    return {
      kind: 'blocked',
      reason: 'نفدت حصّةُ Cloudflare المجّانيّة اليوم — الصورةُ تنتظر قرارَك: «ارسمها بالدفع» أو «انتظر للغد» (تتجدّد 03:00 بتوقيت الرياض)',
    }
  }

  const visual = options.reuse !== undefined
    ? { brief: { subject: '', composition: '', palette: '', headline: options.reuse.headline, kicker: '' }, cost: 0, detail: '' }
    : await visualBrief(writerDeps, post.text, post.id)
  if (visual.brief === null) {
    return {
      kind: 'failed',
      reason: `لم تُولَّد الصورة الفنّيّة — ${visual.detail}. ولا تُرسم بوصف عامّ لا يمتّ إلى النصّ؛ ` +
        'والإنفوجرافيك يُبنى من النصّ نفسِه',
      retryable: true,
    }
  }
  if (options.replace !== undefined) await rejectMedia(deps.db, post.org_id, options.replace)

  /*
   * ٣·ب · الحجزُ قبل النداء (D-068).
   *
   * **والقيدُ `UNIQUE` في ٧ يقع متأخّرا**: يمنع الصفَّ المكرّر بعد أن
   * وقع الدفعُ المكرّر — وهو ليس ما وُجد لأجله (D-004).
   */
  const held = await claimGeneration(deps.db, post.org_id, key, post.id, 'image', (deps.now ?? (() => new Date()))())
  if (held.kind === 'busy') return { kind: 'in_progress', since: held.since }
  if (held.kind === 'unavailable') return { kind: 'failed', reason: CLAIM_UNAVAILABLE, retryable: true }

  const prompt = options.reuse?.prompt ?? imagePrompt({ topic: topicOf(post.text), platform, visual: visual.brief })

  /*
   * **والسائقُ يتبع المزوّدَ المختار** (D-079): كان الاستيرادُ مثبَّتا على Gemini،
   * فمن وجّه الصورَ إلى Cloudflare أُرسل اسمُ نموذجِها إلى عنوان Google — فردّت ٤٠٥.
   */
  let image: Awaited<ReturnType<typeof generateImage>>
  try {
    image =
      provider.name === 'cloudflare'
        ? await generateImageCf({
            accountId,
            apiToken: resolved.key,
            // ‏والنموذجُ بمستواه (D-285)، وما ليس في جدول الأسعار من التوجيه كما كان
            model: cfModel ?? (route.model.startsWith('@cf/') ? route.model : CF_IMAGE_MODEL),
            prompt,
            width: gen.width,
            height: gen.height,
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
    await releaseClaim(deps.db, post.org_id, key)
    return {
      kind: 'failed',
      reason: error instanceof Error ? error.message : 'نداء فشل',
      retryable,
    }
  }

  /*
   * ٤·ب · **الشريحة: النصُّ العربيُّ فوق الصورة** (D-085). ولا نموذجَ توليدٍ يكتب
   * عربيّةً صحيحةَ الوصل، **والوصلُ عملُ مُشكِّلِ خطوطٍ لا عملُ مولّد صور**. وما سقط
   * من شروطها يُبقي الصورةَ بلا شريحة.
   */
  const overlay = await composeSlide(deps, {
    image,
    platform,
    headline: visual.brief.headline,
    kicker: visual.brief.kicker,
  })
  if (overlay.slide !== null) image = overlay.slide

  // ‏وما قيل عن الشريحة يُحفَظ مع الصورة (D-162)، والعنوانُ بقصِّ الشريحة نفسِه
  const note = noteOf(visual, overlay)
  const drawn = clip(visual.brief.headline, HEADLINE_MAX)

  // ٥ · **الكلفة قبل الرفع والكتابة** — النداءُ وقع وحوسِب عليه. وصورةٌ تُسعَّر
  // بالنداء: وحدةٌ واحدةٌ في `outputTokens`، ومزوّدٌ بلا سعرٍ يعطي صفرا **ويُعلَّم**
  /*
   * **والسعرُ بالنموذج والمقاس** (D-285): Cloudflare بـ Neurons من جدولها، وما وقع في حصّة اليوم صفرٌ موسومٌ «free»
   * وما زاد بسعره؛ والوحداتُ Neurons فيُقرأ منها ما بقي من الحصّة. ومزوّدٌ بلا سعرٍ يُسجَّل صفرًا **موسومًا**، لا صامتًا.
   */
  const charge = neurons === null ? null : splitCharge(neurons, usedToday)
  const priced = charge !== null
    ? { total: charge.usd, priced: true }
    : costOf(provider, { inputTokens: 0, outputTokens: 1 })
  await recordCost(deps.db, {
    provider: provider.name,
    operation: `image:${platform}:${image.model}${charge !== null && charge.usd === 0 ? ':free' : ''}${priced.priced ? '' : ':price_unverified'}`,
    units: charge?.neurons ?? 1,
    unitCost: charge !== null ? (charge.neurons === 0 ? 0 : charge.usd / charge.neurons) : priced.total,
    refId: post.id,
  })

  const dims = overlay.slide !== null ? SLIDE_SIZE[platform] : imageSize(image.bytes)
  return persistImage(deps, {
    post, key, image, prompt,
    cost: priced.total,
    extraCost: visual.cost,
    note,
    headline: drawn === '' ? null : drawn,
    width: dims?.width ?? null,
    height: dims?.height ?? null,
  })
}

/**
 * ٦ · R2 ثمّ ٧ · الصفّ — **للنمطين معا**: حدُّ الحجم، والبايتاتُ قبل الصفّ،
 * والقيدُ `UNIQUE` بمن يشغل الاسم.
 */
async function persistImage(
  deps: ImageDeps,
  save: {
    readonly post: PostRow
    readonly key: string
    readonly image: { readonly bytes: Uint8Array; readonly mime: string; readonly model: string }
    readonly prompt: string
    /** كلفةُ الصورة في صفّها — وما قبلها (الموجز) يُضاف إلى ما يُعاد لا إلى الصفّ. */
    readonly cost: number
    readonly extraCost: number
    readonly note: string
    readonly headline: string | null
    readonly width: number | null
    readonly height: number | null
  },
): Promise<ImageOutcome> {
  const { post, key, image } = save
  // حدُّ الحجم بعد التسجيل: صورةٌ ضخمة كلّفت ما كلّفت
  if (image.bytes.length > MAX_BYTES) {
    await releaseClaim(deps.db, post.org_id, key)
    return {
      kind: 'failed',
      reason: `الصورة ${Math.round(image.bytes.length / 1024)}KB وفوق السقف`,
      retryable: false,
    }
  }

  // ٦ · R2 أوّلا — بايتاتٌ يتيمةٌ أرخص من صفٍّ يكذب
  const mediaId = crypto.randomUUID()
  const extension = image.mime.includes('jpeg') ? 'jpg' : image.mime.includes('webp') ? 'webp' : 'png'
  const r2Key = objectKey(post.org_id, `img/${post.id}/${mediaId}.${extension}`)
  try {
    await deps.bucket.put(r2Key, image.bytes, {
      httpMetadata: { contentType: image.mime },
    })
  } catch (error) {
    await releaseClaim(deps.db, post.org_id, key)
    return {
      kind: 'failed',
      reason: `تعذّر رفع الصورة: ${error instanceof Error ? error.message : 'عطل'}`,
      retryable: true,
    }
  }

  // ٧ · الصفّ — وقيمُه مصفوفةٌ واحدةٌ تُربَط في الموضعين
  const row = [
    mediaId, post.id, r2Key, image.mime, image.bytes.length, save.prompt, image.model, save.cost, key,
    save.note, save.headline, save.width, save.height, post.org_id,
  ]
  const done: ImageOutcome = {
    kind: 'generated',
    mediaId,
    key: r2Key,
    bytes: image.bytes.length,
    // **والكلفةُ المعادة تجمع النداءين**: الموجزَ والصورة
    cost: save.cost + save.extraCost,
    note: save.note,
  }
  try {
    await deps.db.prepare(INSERT_IMAGE).bind(...row).run()
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message.includes('UNIQUE')) {
      const won = await deps.db
        .prepare('SELECT id, status FROM media WHERE idempotency_key = ? AND org_id = ?')
        .bind(key, post.org_id)
        .first<{ id: string; status: string }>()

      /*
       * **ومَن يشغل الاسمَ قد يكون مرفوضا** (D-088): يُخلى الاسمُ ويُعاد الإدراجُ
       * مرّةً واحدة — والصفُّ المرفوضُ يبقى بكلفته كما هو.
       */
      if (won !== null && won.status === 'rejected') {
        await deps.db
          .prepare(
            `UPDATE media SET idempotency_key = idempotency_key || ':rejected:' || id
              WHERE id = ? AND org_id = ? AND idempotency_key NOT LIKE ?`,
          )
          .bind(won.id, post.org_id, '%:rejected:%')
          .run()
        try {
          await deps.db.prepare(INSERT_IMAGE).bind(...row).run()
          return done
        } catch (second) {
          await deps.bucket.delete(r2Key).catch(() => undefined)
          await releaseClaim(deps.db, post.org_id, key)
          return {
            kind: 'failed',
            reason: `تعذّرت كتابة الصفّ: ${second instanceof Error ? second.message : 'قيد'}`,
            retryable: false,
          }
        }
      }

      // سباقٌ على المفتاح نفسه: الآخرُ سبق. وبايتاتُنا لا يشير إليها أحد فتُمحى
      await deps.bucket.delete(r2Key).catch(() => undefined)
      if (won !== null) return { kind: 'already', mediaId: won.id }
    }
    await releaseClaim(deps.db, post.org_id, key)
    return { kind: 'failed', reason: `تعذّرت كتابة الصفّ: ${message}`, retryable: false }
  }
  return done
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
  /**
   * ما قيل عن الشريحة يومَ وُلّدت (D-162) — **ثلاثيّةُ القيمة**:
   * `null` لم يُسجَّل (صفٌّ أقدمُ من ‏0028، أو مقطع) · `''` رُكّب النصّ ·
   * نصٌّ سببُ السقوط. **و`null` ليست فراغا**: الأولى لا تَعِد بشيء،
   * والثانيةُ تقول إنّ العنوانَ على الصورة.
   */
  readonly note: string | null
  /** العنوانُ المرسوم أو الذي كان سيُرسَم — و`null` حين لا عنوانَ في الموجز. */
  readonly headline: string | null
  /** الأبعادُ يومَ التوليد (D-174) — و`null` لصفٍّ أقدمَ من ‏0029. */
  readonly width: number | null
  readonly height: number | null
}

/** نصٌّ أو `null` — **و`String(null)` تطبع «null» على كلّ صورةٍ قديمة**. */
function textOrNull(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value)
}

/**
 * صورُ منشوراتٍ بعينها — استعلامٌ واحد لا واحدٌ لكلّ بطاقة.
 *
 * ‏والوسيطُ في منظّمة منشوره (D-277): المعرّفاتُ تأتي من قوائمَ مسوقةٍ بالمنظّمة، والربطُ
 * ‏`m.org_id = p.org_id` يردّ صفًّا تاه عن منظّمة منشوره.
 */
export async function mediaFor(db: Db, postIds: readonly string[]): Promise<MediaRow[]> {
  if (postIds.length === 0) return []
  const marks = postIds.map(() => '?').join(', ')
  try {
    const { results } = await db
      .prepare(
        `SELECT m.id, m.post_id, m.r2_key, m.mime, m.bytes, m.prompt, m.model, m.cost_usd, m.status, m.created_at,
                m.note, m.headline, m.width, m.height
           FROM media m JOIN posts p ON p.id = m.post_id AND p.org_id = m.org_id
          WHERE m.post_id IN (${marks}) ORDER BY m.created_at DESC`,
      )
      .bind(...postIds)
      .all<Record<string, string | number | null>>()
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
      note: textOrNull(r['note']),
      headline: textOrNull(r['headline']),
      width: r['width'] === null || r['width'] === undefined ? null : Number(r['width']),
      height: r['height'] === null || r['height'] === undefined ? null : Number(r['height']),
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
export async function rejectMedia(db: Db, org: string, mediaId: string): Promise<boolean> {
  // قراءةٌ ثمّ كتابة: عقدُ `run` في `Db` لا يعيد عددَ الصفوف المتأثّرة،
  // وقراءةُ حقلٍ غيرِ مضمونٍ في غلافٍ يعيده السائق تربط الشيفرةَ بشكلٍ
  // قد يتبدّل. واستعلامان رخيصان أوثقُ من حقلٍ لا يضمنه العقد
  const row = await db
    .prepare('SELECT status, idempotency_key FROM media WHERE id = ? AND org_id = ?')
    .bind(mediaId, org)
    .first<{ status: string; idempotency_key: string }>()
  if (row === null || row.status !== 'ready') return false

  /*
   * **والحجزُ يُطلَق معه — وإلّا بقي الطريقُ مسدودا بطبقةٍ ثانية.**
   *
   * `media_claims` مفتاحُها هو `idempotency_key` بعينه (D-068). ويُكتب
   * الحجزُ قبل النداء ولا يُمحى بعد نجاحه — لأنّ صفَّ الصورة صار يحرس
   * التكرار. فإذا أُطلق مفتاحُ الصفّ وحده، ردّت الخطوةُ ٣·ب
   * `in_progress` **عشرَ دقائقَ كاملة** بلا سببٍ يُقرأ.
   *
   * وقد وقع في أوّل اختبار: `generated` ثمّ رفضٌ ثمّ `in_progress`.
   */
  await releaseClaim(db, org, row.idempotency_key)

  /*
   * **والرفضُ يُطلِق المفتاح** (D-087).
   *
   * كان الصفُّ يُعلَّم `rejected` **ويحتفظ بمفتاح عدم التكرار**. والخطوةُ
   * ٢ في `generateForPost` تسأل عن المفتاح ولا تسأل عن الحال، فتجده
   * فتقول «وُلّدت صورةٌ لهذا النصّ — لم يُنفق شيء» وتخرج.
   *
   * **فمن رفض صورةً لم يستطع توليدَ بديلٍ لها أبدا.** ولا رسالةَ تقول
   * ذلك: يقرأ المالكُ «وُلّدت» ولا يرى صورة، فيظنّ العطلَ في المزوّد.
   * وقد وقع — وهو ما شكا منه.
   *
   * والمفتاحُ `UNIQUE` منذ ‏0010، فلا يكفي تجاهلُ المرفوض في القراءة:
   * الإدراجُ الجديد يصطدم بالقيد. **فيُوسَم المفتاح بمعرّف الصفّ** —
   * يبقى الصفُّ بكلفته في الدفتر (وهو المقصود من إبقائه)، **ويُخلى
   * الاسمُ لتوليدٍ جديد**.
   */
  await db
    .prepare(
      `UPDATE media SET status = 'rejected', idempotency_key = idempotency_key || ':rejected:' || id
        WHERE id = ? AND org_id = ?`,
    )
    .bind(mediaId, org)
    .run()
  return true
}

/**
 * **الصورةُ النهائيّةُ بعد الاعتماد** (D-285، قرارُ المالك): ما رُسم مسوّدةً بـ schnell يُعاد بـ klein 9B **بوصفه نفسِه**
 * حين يُعتمَد منشورُه — فالجودةُ العالية تُدفع على ما سيُنشر وحدَه، والصورةُ لا تتبدّل فكرتُها بعد أن رآها المالك.
 * وتمرّ بحرّاس `generateForPost` كلِّها: الحصّةُ المجّانيّة، وسقفُ الإنفاق، والإيقاف.
 */
export async function finalizeApproved(deps: ImageDeps, org: string, postIds: readonly string[], overage = false): Promise<number> {
  let done = 0
  for (const id of postIds) {
    const draft = await deps.db
      .prepare("SELECT id, prompt, headline FROM media WHERE post_id = ? AND org_id = ? AND status = 'ready' AND model = ? ORDER BY created_at DESC LIMIT 1")
      .bind(id, org, DRAFT_IMAGE_MODEL)
      .first<{ id: string; prompt: string | null; headline: string | null }>()
    if (draft === null || draft.prompt === null) continue
    const out = await generateForPost(deps, id, {
      style: 'illustration', tier: 'final', org, replace: draft.id,
      reuse: { prompt: draft.prompt, headline: draft.headline ?? '' },
      ...(overage ? { overage } : {}),
    }).catch(() => null)
    if (out?.kind === 'generated') done += 1
  }
  return done
}

export interface WaitingImage {
  readonly postId: string
  readonly tier: 'draft' | 'final'
  readonly neurons: number
}

/**
 * **ما ينتظر الحصّة** (D-285): كلُّ صورةٍ رُدّت بـ `image.quota_wait` منذ `since` ولم تُرسَم بعدها. ومن السجلّ وحدَه:
 * القرارُ والانتظارُ أثرٌ يُقرأ، لا جدولٌ جديد.
 */
export async function waitingImages(db: Db, org: string, since: 'today' | 'yesterday' = 'today'): Promise<WaitingImage[]> {
  const from = since === 'today' ? "date('now')" : "date('now', '-1 day')"
  const { results } = await db
    .prepare(`SELECT a.target AS post, a.detail AS detail FROM audit_log a
               WHERE a.action = 'image.quota_wait' AND a.org_id = ? AND a.at >= ${from}
                 AND NOT EXISTS (SELECT 1 FROM media m WHERE m.post_id = a.target AND m.org_id = a.org_id AND m.status = 'ready' AND m.created_at >= a.at)
               ORDER BY a.id`)
    .bind(org)
    .all<{ post: string; detail: string | null }>()
    .catch(() => ({ results: [] as { post: string; detail: string | null }[] }))
  const seen = new Map<string, WaitingImage>()
  for (const r of results) {
    const [tier, n] = (r.detail ?? '').split(' · ')
    seen.set(r.post, { postId: r.post, tier: tier === 'final' ? 'final' : 'draft', neurons: Number(n) || 0 })
  }
  return [...seen.values()]
}

/** يرسم ما انتظر: بإذن المالك اليوم (`overage`)، أو بعد تجدّد الحصّة — والحارسُ نفسُه يردّ ما لا يتّسع. */
export async function resumeWaiting(deps: ImageDeps, org: string, since: 'today' | 'yesterday', overage: boolean): Promise<number> {
  let done = 0
  for (const w of await waitingImages(deps.db, org, since)) {
    if (w.tier === 'final') {
      done += await finalizeApproved(deps, org, [w.postId], overage)
      continue
    }
    const out = await generateForPost(deps, w.postId, { style: 'illustration', org, ...(overage ? { overage } : {}) }).catch(() => null)
    if (out?.kind === 'generated') done += 1
    // ‏والحصّةُ نفدت ثانيةً بلا إذن: يقف هنا، والباقي ينتظر كما ينتظر
    if (out?.kind === 'blocked') break
  }
  return done
}

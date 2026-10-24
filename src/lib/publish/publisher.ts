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
import { isTimeout, withTimeout } from '../net/timeout'
import { bucketClip, type RangeBucket } from './clip'
import { CLIP_PLATFORMS } from '../platform/needs'
import { estimatePostCost, recordCost } from '../cost'
import { containsUrl } from '../idempotency'
import { loadTokens, markNeedsReauth, type Db } from '../tokens'
import { canPublish, canUploadMedia, missingScopes } from '../oauth/scopes'
import { isExpiring } from '../oauth/exchange'
import type { Platform, PublishPlatform } from '../oauth/providers'
import {
  publishLinkedIn, publishX, uploadLinkedInImage, uploadXMedia,
  PublishError, type PublishResult,
} from './platforms'
import { publishInstagram } from './instagram'
import { isLinkedInPage } from '../channels'
import { mediaUrl, signMediaToken } from '../media/link'
import { publishTikTok, tiktokNote } from './tiktok'
import { publishYouTube } from './youtube'
import { readSettings } from '../settings'

// ‏منصّاتُ المقاطع من جدول المطلوب (D-096 · D-172): الناشرُ والشاشةُ يقرآنها من موضعٍ واحد

export interface PublishMessage {
  readonly postId: string
}

/** مهلةُ نداءات النشر: قطعُ المقاطع تُدفَع واحدةً بعد أخرى، فدقيقتان لكلّ نداء تكفي أكبرَها. */
const CLIP_TIMEOUT_MS = 120_000

export type Outcome =
  | { readonly kind: 'published'; readonly platformPostId: string }
  | { readonly kind: 'skipped_duplicate'; readonly platformPostId: string }
  | { readonly kind: 'failed'; readonly reason: string; readonly retryable: boolean }

interface PostRow {
  id: string
  org_id: string
  account_id: string
  text: string
  status: string
  idempotency_key: string
  approved_at: string | null
  platform: Platform
  external_id: string
  account_kind: string
  account_status: string
}

/** أقلُّ ما نحتاجه من R2: قراءةُ كائنٍ واحد. */
/** الدلوُ يُقرأ بمداه حين يعرف حجمَه (D-179) — وR2 يعرفه. */
export type MediaBucket = RangeBucket

export interface PublisherDeps {
  readonly db: Db
  readonly encKey: string
  /** يلزم للمنشورات التي تحمل صورة، ويُترك حين لا صور (D-040). */
  readonly bucket?: MediaBucket
  /**
   * عنوانُ الموقع — **يلزم Instagram وحدَها** (D-121).
   *
   * فهي لا تقبل بايتاتٍ مدفوعة: تطلب `image_url` **يفتحه خادمُها
   * بنفسه**. ويُبنى الرابطُ موقَّعا لخمسَ عشرةَ دقيقة (`media/link.ts`).
   *
   * **واختياريٌّ كـ`bucket`**: مسارٌ لا ينشر على Instagram لا يحتاجه،
   * **وحقلٌ إلزاميٌّ يُملأ بفراغٍ في نصف المواضع حقلٌ يكذب**.
   */
  readonly baseUrl?: string
  readonly fetchImpl?: typeof fetch
  readonly now?: () => Date
  /** رقمُ تسليم الطابور لهذه الرسالة (D-270) — يُكتب في الصفّ ليُعرَف أيُّ إعادةٍ هذه */
  readonly queueAttempt?: number
}

/**
 * سقوطٌ قبل الإرسال **يُكتب كما يُكتب سقوطٌ بعده** (D-159).
 *
 * كانت سبعةُ حرّاسٍ تعود قبل أن تُكتب محاولةٌ (`no_tokens` و`token_expired`
 * ونقصُ النطاق وحسابُ الصفحة ولا وسيطَ …)، فيبقى المنشورُ «مجدولًا» في
 * اللوحة إلى الأبد وسببُه في سجلّ الطابور وحده. فتُكتب محاولةٌ `failed`
 * بعلامة `preflight`، ويُعلَّم المنشورُ كما يُعلَّم حين تردّه المنصّة —
 * **فيقرؤه سلّمُ الجاهزيّة وشاشةُ المنصّة من الصفّ نفسِه**.
 */
async function preflightFailed(
  db: Db,
  post: { id: string; idempotency_key: string; platform: string },
  reason: string,
): Promise<Outcome> {
  try {
    const attemptNo = await nextAttemptNo(db, post.id)
    await db
      .prepare(
        `INSERT INTO publish_attempts
           (id, post_id, idempotency_key, attempt_no, request_json, response_json, status, org_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'failed', (SELECT org_id FROM posts WHERE id = ?2))`,
      )
      .bind(
        crypto.randomUUID(),
        post.id,
        post.idempotency_key,
        attemptNo,
        JSON.stringify({ platform: post.platform, preflight: true }),
        JSON.stringify({ error: reason, preflight: true }),
      )
      .run()
    await db.prepare(`UPDATE posts SET status = 'failed' WHERE id = ?`).bind(post.id).run()
  } catch (error) {
    // الأثرُ لا يُسقط الحكم: السببُ يعود ولو لم يُكتب
    console.error({ job: 'publish', preflight_record_failed: String(error) })
  }
  return { kind: 'failed', reason, retryable: false }
}

export async function publishPost(
  deps: PublisherDeps,
  message: PublishMessage,
): Promise<Outcome> {
  const { db, encKey } = deps
  // ‏مهلةٌ على كلّ نداء (D-269): المقاطعُ تُرفَع قطعا فتُعطى أطول، والباقي دقيقة
  const fetchImpl = withTimeout(deps.fetchImpl ?? fetch, CLIP_TIMEOUT_MS)
  const now = deps.now ?? (() => new Date())

  // ١ — المنشور وحسابه
  const post = await db
    .prepare(
      `SELECT p.id, p.org_id, p.account_id, p.text, p.status, p.idempotency_key, p.approved_at,
              a.platform, a.external_id, a.kind AS account_kind,
              a.status AS account_status
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

  /*
   * **حسابُ صفحةٍ لا يُنشَر عليه — ويُقال ذلك هنا لا عند المنصّة** (D-087).
   *
   * السائقُ يبني `urn:li:person:` حرفا (D-080)، فمنشورٌ إلى صفحةٍ
   * يُرسَل بمعرّفِ الصفحة تحت وسمِ شخص — **فتردّه LinkedIn برسالةٍ لا
   * تدلّ على السبب**، بعد أن يكون قد وقع في الطابور وانتُظر موعدُه.
   *
   * والوقتُ هو الثمن: تُجدوَل السادسةَ والنصف، ويكتشف المالكُ السابعةَ
   * أنّ شيئا لم يخرج. **فيُردّ الآن، بسببٍ يُقرأ، وبلا إعادة** — حتّى
   * يُبنى سائقُ الصفحات يومَ تصل موافقةُ `Community Management API`.
   */
  /*
   * **والحارسُ لـ LinkedIn وحدها**: YouTube يحفظ قناتَه بنوع `org`
   * (`identity.ts`)، فكان كلُّ رفعٍ إليها يُردّ هنا بسببٍ يخصّ LinkedIn.
   */
  if (isLinkedInPage({ platform: post.platform, kind: post.account_kind })) {
    return preflightFailed(
      db, post,
      'حساب صفحة — والنشر باسم الصفحة لم يُبن بعد (M-03). ' +
        'انشر من حسابك الشخصيّ، أو انتظر موافقة Community Management API.',
    )
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

  /*
   * **ومحاولةٌ أُرسلت ولم يُعرَف جوابُها توقف الإعادةَ** (D-269).
   *
   * صفٌّ بقي `sent` يعني أنّ الطلبَ خرج ولم يعد الجواب: قُتل الاستدعاءُ وسطَ
   * النداء، أو سقط تحديثُ الصفّ بعده. **والمنشورُ قد يكون على المنصّة**،
   * وإعادةُ الإرسال تنشره ثانيةً وتُحاسِب ثانية — وهو أسوأُ اتّجاهات الخطأ.
   * فيُردّ نهائيّا بسببٍ يقول للمالك ما يفعل، و«أعده» يرفضه ما دام الصفُّ
   * `sent`، فلا يُعاد إلّا بعد أن يتحقّق المالكُ على المنصّة.
   */
  const unconfirmed = await db
    .prepare(
      `SELECT id FROM publish_attempts
        WHERE idempotency_key = ? AND org_id = ? AND status = 'sent' LIMIT 1`,
    )
    .bind(post.idempotency_key, post.org_id)
    .first<{ id: string }>()
  if (unconfirmed !== null) {
    return preflightFailed(
      db, post,
      'unconfirmed_prior_send: محاولةٌ سابقة أُرسلت ولم يُعرَف جوابُها — تحقّق على المنصّة قبل أن تعيدها',
    )
  }

  /**
   * الصورةُ المعتمَدة إن وُجدت (D-040).
   *
   * واحدةٌ لا أكثر: المنصّتان تقبلان عدّة، وصدى تولّد واحدة. ومعالجةُ ما
   * لا يقع تُكتب ولا تُختبَر، فتنكسر يومَ يقع.
   */
  const image = await db
    .prepare(
      /*
       * **والنوعُ يُشترَط لا يُترَك للأحدثيّة** (D-092).
       *
       * كان الاستعلامُ يأخذ أحدثَ `ready` أيّا كان نوعُه. ومنشورُ
       * LinkedIn حُرّكت صورتُه فيديو (D-052) يصير أحدثُ وسيطه **مقطعا**
       * — فيُرفَع مقطعٌ إلى نهايةِ صور، فيُردّ بخطأٍ لا يقول لماذا.
       *
       * فلكلّ منصّةٍ نوعُها: TikTok و YouTube مقطعا، والاثنتان صورة.
       *
       * **وInstagram تقبل الاثنين** (D-121): صورةً أو `REELS`. فنمطُها
       * يقبل الاثنين، **والسائقُ يفرّق بينهما من `mime` لا من إعداد**.
       *
       * **ومقطعُ المالك يغلب ما وُلّد بعده** (D-182): منشورُ Instagram من «فيديوهاتك»
       * وُلّد له إنفوجرافيك بالخطأ فصار أحدثَ وسيطه، فكان يُنشر صورةً مكانَ الـ Reel.
       */
      `SELECT id, r2_key, mime, platform_media_id FROM media
        WHERE post_id = ? AND status = 'ready' AND mime LIKE ?
        ORDER BY (upload_id IS NOT NULL) DESC, created_at DESC LIMIT 1`,
    )
    .bind(
      post.id,
      post.platform === 'instagram'
        ? '%/%'
        : CLIP_PLATFORMS.has(post.platform) ? 'video/%' : 'image/%',
    )
    .first<{ id: string; r2_key: string; mime: string; platform_media_id: string | null }>()
    .catch(() => null)

  // دلوٌ غير ممرَّرٍ ومنشورٌ بصورة: **لا يُنشر النصُّ وحده**. المالك اعتمد
  // منشورا بصورة، ونشرُه بلا صورته نشرٌ لشيءٍ لم يعتمده — والفرقُ لا يُرى
  // في اللوحة، فيُكتشَف على المنصّة بعد أن يقرأه الناس
  if (image !== null && deps.bucket === undefined) {
    return preflightFailed(db, post, 'no_media_bucket')
  }

  // **ومنصّةُ المقاطع لا تقبل نصّا وحده**: لا نهايةَ نشرٍ نصّيّةٍ عندها
  // أصلا، فمحاولةٌ بلا مقطعٍ تُردّ بعد أن تُسجَّل وتُحاسَب
  if (CLIP_PLATFORMS.has(post.platform) && image === null) {
    return preflightFailed(db, post, 'no_clip: لا مقطع لهذا المنشور — ولّد صورةً ثمّ حرّكها')
  }
  // **وInstagram كذلك لا نهايةَ نصّيّةَ لها** — صورةٌ أو مقطعٌ ولا ثالث
  if (post.platform === 'instagram' && image === null) {
    return preflightFailed(db, post, 'no_media: Instagram لا تقبل منشورا نصّيّا — ولّد صورةً لهذا المنشور')
  }

  // ‏**حسابٌ فصله المالكُ لا يُنشَر عليه ولا يُعلَّم «جدّد الإذن»** (D-197): رسالةٌ كانت في
  // ‏الطابور قبل الفصل تصل هنا، و`no_tokens` كان سيعيد الحسابَ المفصول إلى اللوحة
  if (post.account_status === 'revoked') return preflightFailed(db, post, 'account_disconnected')

  const tokens = await loadTokens(db, encKey, post.account_id)
  if (tokens === null) {
    await markNeedsReauth(db, post.account_id)
    return preflightFailed(db, post, 'no_tokens')
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
    return preflightFailed(db, post, 'token_expired')
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

  /*
   * **و TikTok لا يُشترَط له النشرُ المباشر** (D-092).
   *
   * `video.upload` يوصل المقطعَ صندوقَ التطبيق فينشره المالكُ بيده —
   * ويعمل يومَ يُربَط الحساب. و`video.publish` ينشر مباشرةً **ويحتاج
   * مراجعةَ محتوى تستغرق أسابيع**.
   *
   * فلو اشتُرط الثاني — كما تفعل `canUploadMedia` على كلّ منشورٍ بوسيط —
   * **لبقيت المنصّةُ معطَّلةً أسابيعَ بلا سبب**، والمقطعُ مولَّدٌ ومدفوعٌ
   * ثمنُه وجاهز. فالثاني تحسينٌ يُقرأ لا شرطٌ يُفرَض.
   */
  const direct = post.platform === 'tiktok' && canUploadMedia('tiktok', tokens.scopes)
  const capable = CLIP_PLATFORMS.has(post.platform)
    ? canPublish(post.platform, tokens.scopes)
    : needsMedia
      ? canUploadMedia(post.platform, tokens.scopes)
      : canPublish(post.platform, tokens.scopes)
  if (!capable) {
    // **ويُسمّى الناقصُ لا يُشار إليه.** كان الردُّ `missing_publish_scope`
    // وحدَه: يقول إنّ نطاقا نقص ولا يقول أيَّه، فيبقى المالكُ أمام رفضٍ
    // لا يدلّه على بابٍ يفتحه. و`missingScopes` تعيد الأسماءَ ومصادرَها
    // منذ D-020 ولم تُنادَ قطّ
    const lacking = missingScopes(post.platform, tokens.scopes)
      .map((sc) => sc.name)
      .join('، ')
    const which = needsMedia ? 'missing_media_scope' : 'missing_publish_scope'
    return preflightFailed(db, post, lacking === '' ? which : `${which}: ${lacking}`)
  }

  const attemptNo = await nextAttemptNo(db, post.id)
  const hasUrl = containsUrl(post.text)

  // ٣ — المحاولة تُسجَّل قبل الإرسال
  const attemptId = crypto.randomUUID()
  await db
    .prepare(
      `INSERT INTO publish_attempts
         (id, post_id, idempotency_key, attempt_no, request_json, status, org_id)
       VALUES (?1, ?2, ?3, ?4, ?5, 'sent', (SELECT org_id FROM posts WHERE id = ?2))`,
    )
    .bind(
      attemptId,
      post.id,
      post.idempotency_key,
      attemptNo,
      JSON.stringify({
        platform: post.platform, has_url: hasUrl, length: post.text.length,
        ...(deps.queueAttempt === undefined ? {} : { queue_attempt: deps.queueAttempt }),
      }),
    )
    .run()

  // ٤ — التكلفة تُسجَّل قبل أن يُعدّ الطلب ناجحا
  //
  // **والقاعدةُ هي التي تضمن النوع**: `posts.platform` محصورٌ في
  // المنصّتين اللتين لهما سائق (0013 لم يوسّعه عمدا). فالصفُّ الواصل
  // لا يحمل غيرَهما، ويُضيَّق النوعُ هنا بلا فحصٍ يتظاهر بالحراسة
  const paying = post.platform as PublishPlatform
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
  /*
   * ‏**وما طُبّق فعلًا يُحفظ ويُقال** (D-190): مستوى الخصوصيّة الذي طُلب، والصندوقُ أو
   * ‏المستوى الأضيق حين لم يقع ما قرّره المالك. كان يُحسب عند النشر ثمّ يُرمى، فيقول صفُّ
   * ‏المقطع «يُنشر للعامّة» والمقطعُ `SELF_ONLY` أو في الصندوق، ولا أثرَ يُرجَع إليه.
   */
  let note: string | null = null
  try {
    let mediaId = image?.platform_media_id ?? null

    /*
     * **وInstagram تُستثنى من رفع البايتات** (D-121): تسحب من رابطٍ
     * ولا تُدفَع إليها. **وبلا هذا الاستثناء تقع في فرع X**، فيُرفَع
     * وسيطُها إلى نهايةٍ لا تخصّها ويُردّ «رفعٌ نجح بلا معرّف وسيط» —
     * وهو ما وقع فعلا في أوّل تشغيل.
     */
    if (
      image !== null && mediaId === null
      && !CLIP_PLATFORMS.has(post.platform)
      && post.platform !== 'instagram'
    ) {
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

    if (post.platform === 'instagram') {
      /*
       * **وInstagram تسحب ولا تُدفَع إليها** (D-121).
       *
       * فلا بايتاتٍ تُقرأ من R2 هنا: يُوقَّع رابطٌ لخمسَ عشرةَ دقيقة
       * وتفتحه خوادمُ Meta بنفسها — وهو ما بُنيت له النافذةُ الموقّعة.
       *
       * **ولا منشورَ نصّيٌّ فيها**: صورةٌ أو مقطعٌ ولا ثالث. وقد رُدّ
       * ذلك في `needsMedia` أعلاه، **ويُردّ هنا ثانيةً** لأنّ هذا
       * الفرعَ يُنادى من غير طريق.
       */
      // ‏**يُرمى ولا يُعاد** (D-182): الردُّ من داخل `try` كان يترك المحاولةَ «أُرسلت»
      // والمنشورَ «في الطابور» — فيرفض «أعده» إعادتَه وما بلغ Meta طلبٌ واحد
      if (image === null) throw new PublishError('instagram_needs_media', 400, false)
      if (deps.baseUrl === undefined || deps.baseUrl === '') {
        // **ولا يُدَّعى عطلُ منصّةٍ لنقصٍ عندنا**: يُسمّى ما نقص
        throw new PublishError('instagram_needs_base_url', 500, false)
      }
      const token = await signMediaToken(encKey, image.id, now())
      await recordCost(db, {
        provider: post.platform,
        operation: 'instagram_publish:price_unverified',
        units: 1,
        unitCost: 0,
        refId: post.id,
      })
      const out = await publishInstagram(
        tokens.accessToken,
        post.external_id,
        {
          kind: image.mime.startsWith('video/') ? 'video' : 'image',
          url: mediaUrl(deps.baseUrl, token),
        },
        post.text,
        fetchImpl,
      )
      await db
        .prepare('UPDATE media SET platform_media_id = ? WHERE id = ?')
        .bind(out.platformPostId, image.id)
        .run()
      result = out
    } else if (CLIP_PLATFORMS.has(post.platform)) {
      /*
       * **و TikTok يرفع وينشر في نداءٍ واحد** — لا معرّفَ وسيطٍ يُحفَظ
       * بينهما. فالبايتاتُ تُقرأ هنا، والسائقُ يهيّئ ويدفع ويسأل.
       *
       * ونداءُ الرفع يُسجَّل بصفرٍ موسوم: **لم يُقرأ لهم سعرٌ بعد**،
       * ورقمٌ مخترَعٌ كذب، وسكوتٌ عن نداءٍ وقع يجعل الدفترَ أقلَّ من
       * الحقيقة — وهو الاتّجاه الأسوأ للخطأ (D-008).
       */
      // ‏**بمداه لا كاملًا** (D-179): السائقُ يقرأ القطعةَ التي يدفعها، فلا يُحمَل مقطعُ المالك كلُّه
      const clip = await bucketClip(deps.bucket!, image!.r2_key, image!.mime)
      if (clip === null) throw new PublishError('media_bytes_missing', 502, false)
      await recordCost(db, {
        provider: post.platform,
        operation: 'clip_upload:price_unverified',
        units: 1,
        unitCost: 0,
        refId: post.id,
      })
      // ‏ومَن يرى المقطع من قرار المالك بعد الإجازة لا من ثابت (D-190) — والافتراضُ خاصّ
      const reach = await readSettings(db)
      let out: PublishResult
      if (post.platform === 'tiktok') {
        const tiktok = await publishTikTok(tokens.accessToken, clip, post.text, direct, fetchImpl, { public: reach.tiktokPublic })
        note = tiktokNote(tiktok, reach.tiktokPublic)
        out = tiktok
      } else {
        out = await publishYouTube(tokens.accessToken, clip, post.text, fetchImpl, { public: reach.youtubePublic })
      }
      await db
        .prepare('UPDATE media SET platform_media_id = ? WHERE id = ?')
        .bind(out.platformPostId, image!.id)
        .run()
      result = out
    } else {
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
    }
  } catch (error) {
    /*
     * **وما رُمي من غير `PublishError` لا يُعاد** (D-269).
     *
     * انقطاعُ شبكةٍ أو مهلةٌ وسطَ نداء الإنشاء لا يقول هل وصل الطلبُ المنصّةَ
     * أم لا. كان يُعاد «قابلا للإعادة»، فيُنشر المنشورُ مرّتين إن كان قد
     * وصل. فيُردّ نهائيّا بسببٍ مسمّى، والمالكُ يتحقّق ثمّ يضغط «أعده».
     */
    const failure =
      error instanceof PublishError
        ? { reason: error.message, retryable: error.retryable, status: error.status }
        : { reason: isTimeout(error) ? 'unconfirmed_send: timeout' : 'unconfirmed_send: network', retryable: false, status: 0 }
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

  // ٦ — ما وقع فعلا، **وللمقطع ما طُلب معه** (الخصوصيّةُ والباب) وملاحظةُ ما لم يقع كما قُرّر
  const response = typeof result.response === 'object' && result.response !== null && !Array.isArray(result.response)
    ? { ...(result.response as Record<string, unknown>) }
    : { response: result.response }
  await db
    .prepare(
      `UPDATE publish_attempts
          SET status = 'succeeded', platform_post_id = ?, response_json = ?
        WHERE id = ?`,
    )
    .bind(
      result.platformPostId,
      JSON.stringify({
        ...response,
        ...(CLIP_PLATFORMS.has(post.platform) ? { request: result.request } : {}),
        ...(note === null ? {} : { note }),
      }),
      attemptId,
    )
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

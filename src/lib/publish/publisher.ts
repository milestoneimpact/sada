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
import { publishXThread } from './xThread'
import { clipShape, isMediaIdRejection, isVideoTarget, uploadLinkedInVideo, uploadXVideo, videoMisfit } from './video'
import { tweetsOf } from '../draft/thread'
import { isLinkedInPage } from '../channels'
import { mediaUrl, signMediaToken } from '../media/link'
import { publishTikTok, tiktokNote } from './tiktok'
import { publishYouTube } from './youtube'
import { readSettings } from '../settings'

// ‏منصّاتُ المقاطع من جدول المطلوب (D-096 · D-172): الناشرُ والشاشةُ يقرآنها من موضعٍ واحد

export interface PublishMessage {
  readonly postId: string
  /**
   * ‏**الموعدُ الذي أُرسلت له رسالةٌ مؤجَّلة** (D-320) — `scheduled_at` كما كان حين أُرسلت. تختم منشورَها عند وصولها إن بقي
   * ‏كما أُرسلت له (`claimDelivery`)، وإلّا لا تفعل شيئًا. وغيابُه رسالةُ ما حلّ موعدُه وخُتم قبل الإرسال، كما كانت.
   */
  readonly due?: string
  /** ‏ومنظّمتُه (D-277): الختمُ عند الوصول يُقيَّد بها. يُحمَل مع `due`. */
  readonly org?: string
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
  /** نوعُ المنشور كما اعتُمد — `thread` وحدها تُنشَر سلسلة (مراجعة D-324). */
  type: string
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
  /** ‏انتظارُ معالجة المقطع بين سؤالين (D-374) — والاختبارُ يمرّر ما لا ينتظر. */
  readonly sleep?: (ms: number) => Promise<void>
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
  post: { id: string; org_id: string; idempotency_key: string; platform: string },
  reason: string,
  queueAttempt?: number,
): Promise<Outcome> {
  try {
    const attemptNo = await nextAttemptNo(db, post.id, post.org_id)
    // ‏ورقمُ الطابور يُكتب هنا كما يُكتب في المحاولة التي تُرسَل (D-291)
    await db
      .prepare(
        `INSERT INTO publish_attempts
           (id, post_id, idempotency_key, attempt_no, request_json, response_json, status, org_id, queue_attempt)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'failed', ?7, ?8)`,
      )
      .bind(
        crypto.randomUUID(),
        post.id,
        post.idempotency_key,
        attemptNo,
        JSON.stringify({ platform: post.platform, preflight: true }),
        JSON.stringify({ error: reason, preflight: true }),
        post.org_id,
        queueAttempt ?? null,
      )
      .run()
    await db.prepare(`UPDATE posts SET status = 'failed' WHERE id = ? AND org_id = ?`).bind(post.id, post.org_id).run()
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
      `SELECT p.id, p.org_id, p.account_id, p.text, p.type, p.status, p.idempotency_key, p.approved_at,
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
      deps.queueAttempt,
    )
  }

  // ٢ — هل نُشر بالمفتاح نفسه من قبل؟
  const done = await db
    .prepare(
      `SELECT platform_post_id FROM publish_attempts
        WHERE idempotency_key = ? AND org_id = ? AND status = 'succeeded' LIMIT 1`,
    )
    .bind(post.idempotency_key, post.org_id)
    .first<{ platform_post_id: string | null }>()
  if (done !== null) {
    await markPublished(db, post.id, post.org_id, done.platform_post_id ?? '')
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
      deps.queueAttempt,
    )
  }

  /**
   * الصورةُ المعتمَدة إن وُجدت (D-040).
   *
   * واحدةٌ لا أكثر: المنصّتان تقبلان عدّة، وصدى تولّد واحدة. ومعالجةُ ما
   * لا يقع تُكتب ولا تُختبَر، فتنكسر يومَ يقع.
   */
  let image = await db
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
       *
       * ‏**ويُعرف صفُّ المقطع بنموذجه لا بإشارته وحدها** (مراجعة D-322): حذفُ المقطع من «فيديوهاتك» يقطع `upload_id`
       * ‏(`SET NULL`) ويُبقي صفَّ المنشور بمفتاحه، فكان يعود الإنفوجرافيكُ الأحدث. و`model = 'upload'` يكتبه `uploadMediaRow` وحدَه.
       */
      `SELECT id, r2_key, mime, platform_media_id, platform_media_state, platform_media_expires_at, platform_media_resets, duration_ms
         FROM media
        WHERE post_id = ? AND org_id = ? AND status = 'ready'
          AND (mime LIKE ? OR (? = 1 AND model IN ('package', 'upload') AND mime LIKE 'video/%'))
        ORDER BY (upload_id IS NOT NULL OR model = 'upload') DESC, created_at DESC LIMIT 1`,
    )
    .bind(
      post.id,
      post.org_id,
      post.platform === 'instagram'
        ? '%/%'
        : CLIP_PLATFORMS.has(post.platform) ? 'video/%' : 'image/%',
      // ‏‏**ومقطعُ الحزمة لـ X وLinkedIn** (D-374): يُرفع مقطعًا لا صورة. وحدَه: مقطعٌ حُرّك من صورة (D-052) يبقى خارجًا كما كان
      isVideoTarget(post.platform) ? 1 : 0,
    )
    .first<MediaRow>()
    .catch(() => null)

  // دلوٌ غير ممرَّرٍ ومنشورٌ بصورة: **لا يُنشر النصُّ وحده**. المالك اعتمد
  // منشورا بصورة، ونشرُه بلا صورته نشرٌ لشيءٍ لم يعتمده — والفرقُ لا يُرى
  // في اللوحة، فيُكتشَف على المنصّة بعد أن يقرأه الناس
  if (image !== null && deps.bucket === undefined) {
    return preflightFailed(db, post, 'no_media_bucket', deps.queueAttempt)
  }

  // **ومنصّةُ المقاطع لا تقبل نصّا وحده**: لا نهايةَ نشرٍ نصّيّةٍ عندها
  // أصلا، فمحاولةٌ بلا مقطعٍ تُردّ بعد أن تُسجَّل وتُحاسَب
  if (CLIP_PLATFORMS.has(post.platform) && image === null) {
    return preflightFailed(db, post, 'no_clip: لا مقطع لهذا المنشور — ولّد صورةً ثمّ حرّكها', deps.queueAttempt)
  }
  // **وInstagram كذلك لا نهايةَ نصّيّةَ لها** — صورةٌ أو مقطعٌ ولا ثالث
  if (post.platform === 'instagram' && image === null) {
    return preflightFailed(db, post, 'no_media: Instagram لا تقبل منشورا نصّيّا — ولّد صورةً لهذا المنشور', deps.queueAttempt)
  }

  // ‏**حسابٌ فصله المالكُ لا يُنشَر عليه ولا يُعلَّم «جدّد الإذن»** (D-197): رسالةٌ كانت في
  // ‏الطابور قبل الفصل تصل هنا، و`no_tokens` كان سيعيد الحسابَ المفصول إلى اللوحة
  if (post.account_status === 'revoked') return preflightFailed(db, post, 'account_disconnected', deps.queueAttempt)

  const tokens = await loadTokens(db, encKey, post.account_id, post.org_id)
  if (tokens === null) {
    await markNeedsReauth(db, post.account_id, post.org_id)
    return preflightFailed(db, post, 'no_tokens', deps.queueAttempt)
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
    await markNeedsReauth(db, post.account_id, post.org_id)
    return preflightFailed(db, post, 'token_expired', deps.queueAttempt)
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
    return preflightFailed(db, post, lacking === '' ? which : `${which}: ${lacking}`, deps.queueAttempt)
  }

  const attemptNo = await nextAttemptNo(db, post.id, post.org_id)
  const hasUrl = containsUrl(post.text)
  // ‏**وسلسلةُ X تغريداتٌ من نصّها** (D-324): سطرُ `---` بينها. ولكلّ تغريدةٍ مفتاحُها وعلامتُها وكلفتُها في `xThread.ts`.
  // ‏**والنوعُ المعتمَد هو الحَكَم لا النصُّ** (مراجعة D-324): منشورٌ اعتُمد تغريدةً واحدةً قبل السلاسل وفي نصّه سطرُ `---`
  // ‏كان يُشقّ عند النشر تغريداتٍ مدفوعةً لم يعتمدها أحد. والاعتمادُ والحفظُ والاستيرادُ يكتبون النوعَ من النصّ
  const tweets = post.platform === 'x' && post.type === 'thread' ? tweetsOf('x', post.text) : [post.text]
  const thread = tweets.length > 1

  // ٣ — المحاولة تُسجَّل قبل الإرسال، **وكتابتُها حجز** (D-320): المحفّزُ (0047) يردّ صفَّ `sent` ثانيًا بالمفتاح نفسِه
  const attemptId = crypto.randomUUID()
  const attemptRequest: Record<string, unknown> = {
    platform: post.platform, has_url: hasUrl, length: post.text.length,
    ...(thread ? { thread: tweets.length } : {}),
    ...(deps.queueAttempt === undefined ? {} : { queue_attempt: deps.queueAttempt }),
  }
  try {
    await db
      .prepare(
        `INSERT INTO publish_attempts
           (id, post_id, idempotency_key, attempt_no, request_json, status, org_id, queue_attempt)
         VALUES (?1, ?2, ?3, ?4, ?5, 'sent', ?6, ?7)`,
      )
      .bind(
        attemptId,
        post.id,
        post.idempotency_key,
        attemptNo,
        JSON.stringify(attemptRequest),
        post.org_id,
        // ‏عمودًا لا نصًّا في JSON وحدَه (D-291): فيُقرأ في سلّم الجاهزيّة ويُسأل عنه
        deps.queueAttempt ?? null,
      )
      .run()
  } catch (error) {
    /*
     * ‏**تسليمٌ آخرُ سبق إلى الحجز** (D-320): الطابورُ «مرّةً على الأقلّ»، ورسالتان للمنشور نفسِه مرّتا من سؤالَي `succeeded`
     * ‏و`sent` معًا. فيخرج هذا بلا نداءٍ ولا كلفة، **ولا يُعلَّم المنشورُ «نُشر»**: الآخرُ لم يُعرَف جوابُه بعد، وهو يكتبه.
     * ‏وتعارضُ `(post_id, attempt_no)` من السباق نفسِه: حسبا الرقمَ نفسَه قبل أن يكتب أحدُهما.
     */
    if (await heldElsewhere(db, post, error)) {
      console.info({ job: 'publish', post: post.id, held_elsewhere: true })
      return { kind: 'skipped_duplicate', platformPostId: '' }
    }
    throw error
  }

  // ٤ — التكلفة تُسجَّل قبل أن يُعدّ الطلب ناجحا
  //
  // **والقاعدةُ هي التي تضمن النوع**: `posts.platform` محصورٌ في
  // المنصّتين اللتين لهما سائق (0013 لم يوسّعه عمدا). فالصفُّ الواصل
  // لا يحمل غيرَهما، ويُضيَّق النوعُ هنا بلا فحصٍ يتظاهر بالحراسة
  const paying = post.platform as PublishPlatform
  const unitCost = estimatePostCost(paying, hasUrl)
  // ‏والسلسلةُ تُسجَّل تغريدةً تغريدة قبل كلّ إرسال (`xThread.ts`) — لا مرّةً هنا ولا مرّتين
  if (unitCost > 0 && !thread) {
    try {
      await recordCost(db, {
        provider: post.platform,
        operation: hasUrl ? 'create_post_with_url' : 'create_post',
        units: 1,
        unitCost,
        refId: post.id,
        org: post.org_id,
      })
    } catch (error) {
      /*
       * ‏**الدفترُ سقط بين الحجز والإرسال، ولم يُرسَل شيء** (D-320): كان يرمي من هنا فيبقى الصفُّ `sent`، وأوّلُ إعادةٍ تجده
       * ‏فتُفشل المنشورَ نهائيًّا بـ«تحقّق على المنصّة» — عطلٌ في دفترنا يصير سؤالًا للمالك عن X. فيُفكّ الحجزُ ويُعاد بتباعد.
       * ‏**ولا يُرسَل بلا دفتر** (D-008). وإن سقط الفكُّ أيضًا رُمي الأوّل: الصفُّ `sent` يمنع الإرسالَ — الاتّجاهُ الآمن.
       */
      await releaseUnsent(db, attemptId, post.org_id, error)
      return { kind: 'failed', reason: 'pre_send: لم يُكتب الدفتر فلم يُرسَل شيء', retryable: true }
    }
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
    /*
     * ‏**مقطعُ الحزمة على X وLinkedIn** (D-374): رفعٌ مقطَّعٌ ثمّ انتظارُ المعالجة (`video.ts`). ومعرّفٌ بلغ `processing`
     * ‏في محاولةٍ سبقت يُسأل عنه ولا يُرفع ثانيةً، و`ready` يُلحَق مباشرة. وكلُّ طلبٍ يُكتب في الدفتر قبل إرساله (D-008)
     * ‏بصفرٍ موسوم: X يحاسب على الطلب وسعرُ الرفع لم يُؤكَّد بعد.
     */
    let videoPath = false
    let videoResets = image?.platform_media_resets ?? 0
    if (image !== null && isVideoTarget(post.platform) && image.mime.startsWith('video/')) {
      const target = post.platform
      const video = image
      /*
       * ‏**معرّفُ X ينتهي** (D-379): قرابة يوم (`expires_after_secs`). إعادةٌ بعده تلحق معرّفًا منتهيًا فتُردّ التغريدة،
       * ‏فيُرفع من جديد — **مرّةً واحدة** (`platform_media_resets`)، وما بعدها ردٌّ نهائيٌّ بسببه فلا دوران ولا دفعٌ بلا حدّ.
       */
      const expired = mediaId !== null && video.platform_media_expires_at !== null
        && Date.parse(video.platform_media_expires_at) <= now().getTime() + 60_000
      let reupload: string | null = null
      if (expired) {
        if (video.platform_media_resets >= 1) {
          throw new PublishError('x: media_expired: انتهى معرّف المقطع عند X بعد أن أُعيد رفعُه مرّة — أعده بيدك بعد أن تتحقّق', 400, false)
        }
        reupload = 'انتهت صلاحيّة معرّف المقطع عند X قبل النشر — رُفع من جديد'
        await resetVideo(db, video.id, post.org_id, reupload)
        videoResets += 1
        mediaId = null
      }
      if (video.platform_media_state !== 'ready' || mediaId === null) {
        const clip = await bucketClip(deps.bucket!, video.r2_key, video.mime)
        if (clip === null) throw new PublishError('media_bytes_missing', 502, false)
        /*
         * ‏**المدّةُ والصيغةُ قبل الرفع** (D-379): من صفّ «فيديوهاتك» إن قرأها المتصفّح، وإلّا من `moov/mvhd` برأس الملفّ أو
         * ‏ذيله من R2 بمداه — بلا فكّ ترميز. وما خالف حدودَ المنصّة يسقط إلى الغلاف إن كان للمنشور غلاف، وسببُه على المقطع.
         */
        const shape = video.duration_ms !== null ? { isoBmff: true, durationMs: video.duration_ms } : await clipShape(clip)
        const misfit = !shape.isoBmff
          ? 'المقطع ليس MP4 ولا MOV في رأسه (لا ftyp)'
          : videoMisfit(target, clip.size, shape.durationMs, video.mime)
        if (misfit !== null) {
          const cover = await coverOf(db, post.id, post.org_id)
          await db.prepare("UPDATE media SET platform_media_state = 'failed', platform_media_error = ?, platform_media_id = NULL WHERE id = ? AND org_id = ?")
            .bind(`video_misfit: ${misfit}`.slice(0, 300), video.id, post.org_id).run()
          if (cover === null) throw new PublishError(`video_misfit: ${misfit}`, 400, false)
          note = `نُشر الغلاف بدل المقطع: ${misfit}`
          image = cover
          mediaId = cover.platform_media_id
        } else {
          videoPath = true
          const opts = {
            resume: video.platform_media_state === 'processing' ? mediaId : null,
            sleep: deps.sleep,
            onRequest: (operation: string) => ledger(db, {
              provider: post.platform, operation: `${operation}:price_unverified`, units: 1, unitCost: 0, refId: post.id, org: post.org_id,
            }),
            onStart: async () => {
              await db.prepare("UPDATE media SET platform_media_state = 'uploading', platform_media_id = NULL, platform_media_expires_at = NULL WHERE id = ? AND org_id = ?")
                .bind(video.id, post.org_id).run()
            },
            onStage: async (id: string, state: 'processing') => {
              await db.prepare('UPDATE media SET platform_media_id = ?, platform_media_state = ?, platform_media_error = NULL WHERE id = ? AND org_id = ?')
                .bind(id, state, video.id, post.org_id).run()
            },
            onExpiry: async (secs: number) => {
              await db.prepare('UPDATE media SET platform_media_expires_at = ? WHERE id = ? AND org_id = ?')
                .bind(new Date(now().getTime() + secs * 1000).toISOString(), video.id, post.org_id).run()
            },
          }
          try {
            mediaId = target === 'linkedin'
              ? await uploadLinkedInVideo(tokens.accessToken, `urn:li:person:${post.external_id}`, clip, fetchImpl, opts)
              : await uploadXVideo(tokens.accessToken, clip, fetchImpl, opts)
          } catch (error) {
            // ‏‏المردودُ نهائيًّا يُكتب سببُه على الوسيط ويُنسى معرّفُه: «أعده» بعد تصحيح المقطع يرفع من أوّله
            if (error instanceof PublishError && !error.retryable) {
              await db.prepare("UPDATE media SET platform_media_state = 'failed', platform_media_error = ?, platform_media_id = NULL WHERE id = ? AND org_id = ?")
                .bind(error.message.slice(0, 300), video.id, post.org_id).run()
            }
            throw error
          }
          await db.prepare("UPDATE media SET platform_media_id = ?, platform_media_state = 'ready', platform_media_error = NULL WHERE id = ? AND org_id = ?")
            .bind(mediaId, video.id, post.org_id).run()
          if (reupload !== null) note = reupload
        }
      } else {
        videoPath = true
      }
    }
    if (
      !videoPath && image !== null && mediaId === null
      && !image.mime.startsWith('video/')
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
      await ledger(db, {
        provider: post.platform,
        operation: 'media_upload:price_unverified',
        units: 1,
        unitCost: 0,
        refId: post.id,
        org: post.org_id,
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
        .prepare('UPDATE media SET platform_media_id = ? WHERE id = ? AND org_id = ?')
        .bind(mediaId, image.id, post.org_id)
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
      await ledger(db, {
        provider: post.platform,
        operation: 'instagram_publish:price_unverified',
        units: 1,
        unitCost: 0,
        refId: post.id,
        org: post.org_id,
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
        .prepare('UPDATE media SET platform_media_id = ? WHERE id = ? AND org_id = ?')
        .bind(out.platformPostId, image.id, post.org_id)
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
      await ledger(db, {
        provider: post.platform,
        operation: 'clip_upload:price_unverified',
        units: 1,
        unitCost: 0,
        refId: post.id,
        org: post.org_id,
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
        .prepare('UPDATE media SET platform_media_id = ? WHERE id = ? AND org_id = ?')
        .bind(out.platformPostId, image!.id, post.org_id)
        .run()
      result = out
    } else {
      try {
      result =
        post.platform === 'linkedin'
          ? await publishLinkedIn(
              tokens.accessToken,
              `urn:li:person:${post.external_id}`,
              post.text,
              fetchImpl,
              mediaId,
            )
          : thread
            ? await publishXThread(db, post, { id: attemptId, request: attemptRequest }, tweets, tokens.accessToken, fetchImpl, mediaId)
            : await publishX(tokens.accessToken, tweets[0]!, fetchImpl, mediaId)
      } catch (error) {
        /*
         * ‏**X ردّ معرّفَ المقطع** (D-379): منتهٍ أو غيرُ صالح. لم يُنشر شيء (‏4xx)، فيُنسى المعرّفُ ويُعاد من الطابور قابلًا
         * ‏للإعادة فيُرفع المقطعُ من جديد — **مرّةً**: ردٌّ ثانٍ بعد إعادة الرفع نهائيٌّ بسببه. وكلُّ طلب رفعٍ في الدفتر كما كان.
         */
        if (videoPath && post.platform === 'x' && image !== null && isMediaIdRejection(error)) {
          const why = error instanceof Error ? error.message : String(error)
          if (videoResets >= 1) {
            await db.prepare("UPDATE media SET platform_media_state = 'failed', platform_media_error = ?, platform_media_id = NULL WHERE id = ? AND org_id = ?")
              .bind(`media_rejected: ردّ X المقطع ثانيةً بعد إعادة رفعه (${why})`.slice(0, 300), image.id, post.org_id).run()
            throw new PublishError(`x: media_rejected: ردّ X معرّف المقطع ثانيةً بعد إعادة رفعه — لا يُعاد وحده (${why})`.slice(0, 300), 400, false)
          }
          await resetVideo(db, image.id, post.org_id, `ردّ X معرّف المقطع (${why}) — يُرفع من جديد مرّة`)
          throw new PublishError(`x: media_expired: ردّ X معرّف المقطع منتهيًا أو غيرَ صالح — يُرفع من جديد مرّةً في الإعادة (${why})`.slice(0, 300), 400, true)
        }
        throw error
      }
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
          WHERE id = ? AND org_id = ?`,
      )
      .bind(JSON.stringify({ error: failure.reason, status: failure.status }), attemptId, post.org_id)
      .run()
    if (!failure.retryable) {
      await db.prepare(`UPDATE posts SET status = 'failed' WHERE id = ? AND org_id = ?`).bind(post.id, post.org_id).run()
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
        WHERE id = ? AND org_id = ?`,
    )
    .bind(
      result.platformPostId,
      JSON.stringify({
        ...response,
        ...(CLIP_PLATFORMS.has(post.platform) ? { request: result.request } : {}),
        ...(note === null ? {} : { note }),
      }),
      attemptId,
      post.org_id,
    )
    .run()
  await markPublished(db, post.id, post.org_id, result.platformPostId)

  return { kind: 'published', platformPostId: result.platformPostId }
}

interface MediaRow {
  id: string; r2_key: string; mime: string; platform_media_id: string | null; platform_media_state: string | null
  platform_media_expires_at: string | null; platform_media_resets: number; duration_ms: number | null
}

/** ‏يُنسى معرّفُ المقطع ويُعدّ رفعٌ جديد (D-379): الحالُ فارغةٌ والسببُ يُقرأ، و`platform_media_resets` يمنع الدوران. */
async function resetVideo(db: Db, id: string, org: string, reason: string): Promise<void> {
  await db.prepare(`UPDATE media SET platform_media_id = NULL, platform_media_state = NULL, platform_media_expires_at = NULL,
                           platform_media_error = ?, platform_media_resets = platform_media_resets + 1 WHERE id = ? AND org_id = ?`)
    .bind(reason.slice(0, 300), id, org).run()
}

/** ‏غلافُ المنشور حين يخالف المقطعُ حدودَ المنصّة (D-379) — أحدثُ صورةٍ جاهزة له، أو `null`. */
async function coverOf(db: Db, postId: string, org: string): Promise<MediaRow | null> {
  return db
    .prepare(`SELECT id, r2_key, mime, platform_media_id, platform_media_state, platform_media_expires_at, platform_media_resets, duration_ms
                FROM media WHERE post_id = ? AND org_id = ? AND status = 'ready' AND mime LIKE 'image/%' ORDER BY created_at DESC LIMIT 1`)
    .bind(postId, org)
    .first<MediaRow>()
    .catch(() => null)
}

/**
 * ‏**قيدٌ في الدفتر داخل الإرسال، قبل النداء الذي يُقيَّد له** (D-320): عطلُ D1 هنا لم يُرسِل شيئًا، فيُرمى `PublishError`
 * ‏قابلًا للإعادة فيُكتب الصفُّ `failed` ويُعاد بتباعد — لا «unconfirmed_send» يُفشل المنشورَ ويسأل المالكَ عن المنصّة.
 */
async function ledger(db: Db, entry: Parameters<typeof recordCost>[1]): Promise<void> {
  try {
    await recordCost(db, entry)
  } catch (error) {
    throw new PublishError(`pre_send: لم يُكتب الدفتر فلم يُرسَل شيء (${String(error).slice(0, 120)})`, 503, true)
  }
}

/**
 * ‏أردُّ الإدخال يعني أنّ تسليمًا آخرَ يحمل المفتاحَ الآن؟ (D-320) — ردُّ المحفّز (0047) يقوله نصًّا. وتعارضُ رقم المحاولة
 * ‏`(post_id, attempt_no)` يقوله حين يُرى بعده صفٌّ `sent` أو `succeeded` بالمفتاح؛ وإلّا فهو صفُّ أثرٍ كُتب معًا (الكنّاسُ
 * ‏أو طابورُ الأعطال) فيُرمى العطلُ ويُعاد بتباعد، ولا يُقَرّ ما لم يحجزه أحد.
 */
async function heldElsewhere(db: Db, post: { idempotency_key: string; org_id: string }, error: unknown): Promise<boolean> {
  const text = error instanceof Error ? error.message : String(error)
  if (text.includes('d004_once')) return true
  if (!/UNIQUE constraint failed/i.test(text)) return false
  const held = await db
    .prepare(`SELECT 1 AS held FROM publish_attempts WHERE idempotency_key = ? AND org_id = ? AND status IN ('sent', 'succeeded') LIMIT 1`)
    .bind(post.idempotency_key, post.org_id)
    .first<{ held: number }>()
    .catch(() => null)
  return held !== null
}

/**
 * ‏يفكّ حجزًا لم يُرسَل بعده شيء (D-320): الصفُّ `failed` بعلامة `pre_send` فتمضي الإعادةُ، **والشرطُ `status = 'sent'`** فلا
 * ‏يمسّ صفًّا كتب غيرُه جوابَه. وفكٌّ يسقط يرمي العطلَ الأوّل: ما بقي `sent` لا يُرسَل ثانيةً، وهو الاتّجاهُ الآمن.
 */
async function releaseUnsent(db: Db, attemptId: string, org: string, cause: unknown): Promise<void> {
  try {
    await db
      .prepare(`UPDATE publish_attempts SET status = 'failed', response_json = ? WHERE id = ? AND org_id = ? AND status = 'sent'`)
      .bind(JSON.stringify({ error: `pre_send: ${String(cause).slice(0, 160)}`, pre_send: true }), attemptId, org)
      .run()
  } catch {
    throw cause
  }
}

async function markPublished(db: Db, postId: string, org: string, _platformPostId: string): Promise<void> {
  await db.prepare(`UPDATE posts SET status = 'published' WHERE id = ? AND org_id = ?`).bind(postId, org).run()
}

async function nextAttemptNo(db: Db, postId: string, org: string): Promise<number> {
  const row = await db
    .prepare(`SELECT coalesce(max(attempt_no), 0) AS n FROM publish_attempts WHERE post_id = ? AND org_id = ?`)
    .bind(postId, org)
    .first<{ n: number }>()
  return (row?.n ?? 0) + 1
}

/**
 * سائقُ نشرِ TikTok — **والصندوقُ قبل النشر المباشر** (D-092).
 *
 * ## بابان لا باب، والفرقُ بينهما إجازةٌ تستغرق أسابيع
 *
 * لـ Content Posting API نهايتان، ونطاقان يفتحانهما:
 *
 * | النهاية | النطاق | ما يقع | يحتاج Audit؟ |
 * |---|---|---|---|
 * | `inbox/video/init` | `video.upload` | **يصل المقطعُ صندوقَ التطبيق** فينشره المالكُ بيده | **لا** |
 * | `video/init` | `video.publish` | يُنشَر مباشرةً باسمه | **نعم** |
 *
 * **والصندوقُ يعمل يومَ يُربَط الحساب.** والنشرُ المباشر ينتظر مراجعةَ
 * محتوى تستغرق أسابيع — فلو رُبط السائقُ بها وحدَها لبقيت المنصّةُ
 * معطَّلةً بلا سبب، **والمقطعُ مولَّدٌ ومدفوعٌ ثمنُه وجاهز**.
 *
 * فيُختار الباب **من النطاق الممنوح لا من إعداد**: من مُنح
 * `video.publish` نُشر له مباشرةً، ومن لم يُمنَح وصله في صندوقه. **ولا
 * يُدَّعى نشرٌ لم يقع**: المخرَجُ يقول أيُّهما وقع.
 *
 * ## والبايتاتُ تُدفَع دفعا لا تُسحَب برابط
 *
 * لـ `source` قيمتان: `PULL_FROM_URL` يسحب المقطعَ من عندنا، و
 * `FILE_UPLOAD` يعطينا عنوانا ندفع إليه.
 *
 * **والأولى تحتاج نطاقا موثَّقا عند TikTok** — إجراءٌ يدويٌّ ثانٍ فوق
 * الأوّل. والثانيةُ لا تحتاج شيئا، **وبايتاتُنا في R2 بين أيدينا**
 * أصلا: هي ما يُرفَع إلى LinkedIn و X منذ D-046. فـ `FILE_UPLOAD`.
 *
 * ## والدفعةُ واحدةٌ لأنّ المقطعَ خمسَ عشرةَ ثانية
 *
 * TikTok تقسّم الكبيرَ إلى قطع. ومقطعُنا مولَّدٌ عندنا بحدٍّ معلوم
 * (`MAX_VIDEO_BYTES`)، **فيمرّ في قطعةٍ واحدة** — و`chunk_size` يساوي
 * الحجمَ كلَّه و`total_chunk_count` واحد.
 *
 * ## والحالةُ تُسأل مرّةً واحدة
 *
 * `status/fetch` يقول `PROCESSING_UPLOAD` ثمّ ينتهي. **ولا يُنتظَر هنا
 * في حلقة**: Worker له سقفُ زمن، وحلقةُ انتظارٍ فيه تُقتَل في منتصفها
 * فتترك محاولةً لا يُعرَف مصيرُها. فيُسأل مرّةً ليُمسَك الرفضُ الفوريّ،
 * **وما بقي معالَجةً يُعدّ ناجحا** — لأنّ البايتات وصلت فعلا، والباقي
 * عندهم لا عندنا.
 */
import { PublishError, type PublishResult, type Upload } from './platforms'

const INBOX_INIT = 'https://open.tiktokapis.com/v2/post/publish/inbox/video/init/'
const DIRECT_INIT = 'https://open.tiktokapis.com/v2/post/publish/video/init/'
const STATUS_FETCH = 'https://open.tiktokapis.com/v2/post/publish/status/fetch/'

/** أقصى ما يقبله الوصفُ عند TikTok — مقروءٌ من وثيقتهم. */
export const TIKTOK_CAPTION_MAX = 2200

/**
 * حالاتٌ تعني أنّ الرفعَ سقط — **وما عداها يُعدّ ماضيا**.
 *
 * `FAILED` صريحة، و`PROCESSING_*` ما تزال تعمل، و`PUBLISH_COMPLETE`
 * انتهت. فالفشلُ يُسمّى ولا يُستنتَج من غياب النجاح.
 */
const FAILED_STATES: ReadonlySet<string> = new Set(['FAILED'])

async function detail(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { code?: unknown; message?: unknown } }
    const code = body.error?.code
    if (typeof code === 'string' && code !== '' && code !== 'ok') return code
    const message = body.error?.message
    return typeof message === 'string' && message !== '' ? message : String(response.status)
  } catch {
    return String(response.status)
  }
}

/** رمزُ الحالة يقرّر الإعادة، لا نصُّ الرسالة — كما في كلّ سائقٍ عندنا. */
function retryable(status: number): boolean {
  return status === 429 || status >= 500
}

export interface TikTokOutcome extends PublishResult {
  /**
   * **أوصل الصندوقَ أم نُشر؟** — ويُقال ولا يُخمَّن.
   *
   * فمالكٌ يُقال له «نُشر» ثمّ لا يجده على حسابه يظنّ العطلَ عندنا،
   * وهو ينتظره في صندوق التطبيق.
   */
  readonly inbox: boolean
}

/**
 * يرفع مقطعا إلى TikTok — صندوقا أو نشرا، بحسب ما مُنح.
 *
 * `direct` يُمرَّر من `canUploadMedia` عند المنادي: **النطاقُ يُقرأ في
 * موضعٍ واحد** (D-045)، ولا يُعاد فحصُه هنا بنسخةٍ ثانيةٍ تفترق.
 */
export async function publishTikTok(
  accessToken: string,
  clip: Upload,
  caption: string,
  direct: boolean,
  fetchImpl: typeof fetch = fetch,
): Promise<TikTokOutcome> {
  const size = clip.bytes.length
  if (size === 0) throw new PublishError('tiktok: مقطعٌ فارغ', 400, false)

  const title = caption.slice(0, TIKTOK_CAPTION_MAX)
  const source = {
    source: 'FILE_UPLOAD',
    video_size: size,
    // قطعةٌ واحدة: المقطعُ خمسَ عشرةَ ثانيةً بحدٍّ معلوم
    chunk_size: size,
    total_chunk_count: 1,
  }
  const request = direct
    ? { post_info: { title, privacy_level: 'SELF_ONLY' }, source_info: source }
    : { source_info: source }

  // ١ — التهيئة: تعطي معرّفَ النشر وعنوانَ الدفع
  const init = await fetchImpl(direct ? DIRECT_INIT : INBOX_INIT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify(request),
  })
  if (!init.ok) {
    const why = await detail(init)
    throw new PublishError(`tiktok: رُدّت التهيئة (${why})`, init.status, retryable(init.status))
  }

  const opened = (await init.json()) as {
    data?: { publish_id?: unknown; upload_url?: unknown }
  }
  const publishId = opened.data?.publish_id
  const uploadUrl = opened.data?.upload_url
  if (typeof publishId !== 'string' || publishId === '') {
    throw new PublishError('tiktok: تهيئةٌ بلا publish_id', 502, false)
  }
  if (typeof uploadUrl !== 'string' || uploadUrl === '') {
    throw new PublishError('tiktok: تهيئةٌ بلا upload_url', 502, false)
  }

  // ٢ — دفعُ البايتات. و `Content-Range` إلزاميٌّ ولو كانت قطعةً واحدة
  const put = await fetchImpl(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': clip.mime,
      'Content-Range': `bytes 0-${size - 1}/${size}`,
    },
    body: clip.bytes as unknown as BodyInit,
  })
  if (!put.ok) {
    throw new PublishError(
      `tiktok: رُدّ الرفع (${put.status})`,
      put.status,
      retryable(put.status),
    )
  }

  /*
   * ٣ — سؤالٌ واحدٌ عن الحال.
   *
   * **ولا يُوقِف سقوطُه النجاح**: البايتاتُ وصلت، وسؤالُ الحال قراءةٌ
   * بعدها. فمن عدَّ النجاحَ فشلا لأنّ القراءةَ سقطت **أعاد الرفعَ من
   * الطابور فرفع المقطعَ مرّتين** — وهو ما يحرسه D-004 كلُّه.
   */
  let state = 'UNKNOWN'
  try {
    const asked = await fetchImpl(STATUS_FETCH, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({ publish_id: publishId }),
    })
    if (asked.ok) {
      const body = (await asked.json()) as { data?: { status?: unknown } }
      if (typeof body.data?.status === 'string') state = body.data.status
    }
  } catch {
    state = 'UNKNOWN'
  }

  if (FAILED_STATES.has(state)) {
    // **ورفضٌ معلَنٌ ليس عابرا**: يُعاد بالبايتات نفسِها فيُردّ ثانيةً
    throw new PublishError(`tiktok: رُفض المقطع (${state})`, 422, false)
  }

  return {
    platformPostId: publishId,
    inbox: !direct,
    request: { direct, size, title_length: title.length },
    response: { publish_id: publishId, status: state },
  }
}

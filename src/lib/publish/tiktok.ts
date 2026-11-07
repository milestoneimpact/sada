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
import { bytesClip, tiktokChunks, type Clip } from './clip'
import { withTimeout } from '../net/timeout'

const INBOX_INIT = 'https://open.tiktokapis.com/v2/post/publish/inbox/video/init/'
const DIRECT_INIT = 'https://open.tiktokapis.com/v2/post/publish/video/init/'
const STATUS_FETCH = 'https://open.tiktokapis.com/v2/post/publish/status/fetch/'
const CREATOR_INFO = 'https://open.tiktokapis.com/v2/post/publish/creator_info/query/'

/**
 * **مَن يرى المنشورَ المباشر** (D-190).
 *
 * تطبيقٌ لم يُجَز لا ينشر إلّا `SELF_ONLY` — فكان ذلك ثابتًا هنا. وبعد إجازة Content Posting
 * API (M-29) يقلب المالكُ «النشرَ العلنيّ»، **فتُسأل TikTok أوّلًا عمّا يسمح به هذا الحساب**
 * (`creator_info`، وإرشاداتُهم توجبه قبل كلّ نشر): `PUBLIC_TO_EVERYONE` إن عُرض، وإلّا
 * **أضيقُ ما عُرض** — حسابٌ خاصٌّ لا يُعرض فيه العامّ، ولا يُختار له أوسعُ ممّا عُرف.
 */
const NARROWEST: readonly string[] = ['SELF_ONLY', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR']

export function pickPrivacy(offered: readonly string[]): string {
  if (offered.includes('PUBLIC_TO_EVERYONE')) return 'PUBLIC_TO_EVERYONE'
  return NARROWEST.find((level) => offered.includes(level)) ?? 'SELF_ONLY'
}

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
  /** ما طُلب فعلًا — `SELF_ONLY` ما لم يُقلَب العلنيّ، و`null` للصندوق (لا خيارَ فيه). */
  readonly privacy: string | null
}

/**
 * ما يُقال للمالك عن نشرٍ نجح **ولم يقع كما قرّره** (D-190) — أو `null`.
 *
 * ‏١ · الصندوق: لا نصَّ يُرسَل معه (نهايتُه لا تقبل وصفًا)، فالنصُّ الذي راجعه المالكُ يُلصق
 *     بيده حين ينشره من التطبيق. ويُقال لماذا وصل الصندوقَ إن كان قد قلب العلنيّ.
 * ‏٢ · نشرٌ مباشرٌ قُلب له العلنيُّ ولم يُعرض `PUBLIC_TO_EVERYONE`: نُشر بأضيقِ ما عُرض.
 */
export function tiktokNote(out: Pick<TikTokOutcome, 'inbox' | 'privacy'>, wantedPublic: boolean): string | null {
  if (out.inbox) {
    return wantedPublic
      ? 'وصل صندوق تطبيق TikTok لا حسابَك، وبلا نصّه: حسابُك بلا video.publish ولو قُلب العلنيّ — انشره من التطبيق والصق نصَّه، واربط TikTok من جديد لتمنحه'
      : 'وصل صندوق تطبيق TikTok بلا نصّه — انشره من التطبيق والصق نصَّه هناك'
  }
  if (wantedPublic && out.privacy !== null && out.privacy !== 'PUBLIC_TO_EVERYONE') {
    return `نُشر بـ ${out.privacy} لا للعامّة: حسابُك على TikTok لم يعرض النشر للجميع`
  }
  return null
}

/**
 * يرفع مقطعا إلى TikTok — صندوقا أو نشرا، بحسب ما مُنح.
 *
 * `direct` يُمرَّر من `canUploadMedia` عند المنادي: **النطاقُ يُقرأ في
 * موضعٍ واحد** (D-045)، ولا يُعاد فحصُه هنا بنسخةٍ ثانيةٍ تفترق.
 */
export async function publishTikTok(
  accessToken: string,
  input: Clip | Upload,
  caption: string,
  direct: boolean,
  fetchImpl: typeof fetch = withTimeout(fetch, 120_000),
  /** العلنيُّ بقرار المالك بعد الإجازة (D-190) — ولا يمسّ الصندوق: النشرُ هناك بيده. */
  options: { readonly public?: boolean } = {},
): Promise<TikTokOutcome> {
  const clip = 'read' in input ? input : bytesClip(input)
  const size = clip.size
  if (size === 0) throw new PublishError('tiktok: مقطع فارغ', 400, false)

  const title = caption.slice(0, TIKTOK_CAPTION_MAX)
  // ‏**قطعٌ لا قطعةٌ واحدة** (D-179): مقطعُ المالك قد يجاوز ‏64MB، وTikTok يردّ قطعةً فوقها
  const { chunkSize, count } = tiktokChunks(size)
  const source = {
    source: 'FILE_UPLOAD',
    video_size: size,
    chunk_size: chunkSize,
    total_chunk_count: count,
  }
  /*
   * ‏والسؤالُ قبل التهيئة لا بعدها: لا يُفتح رفعٌ ثمّ يُكتشف أنّ الحسابَ لا يقبل ما طُلب.
   * ‏وسقوطُه يُردّ بسببه — **ولا يُنشر خاصًّا بصمتٍ من قلب العلنيّ**: المالكُ قرّر غيرَه.
   */
  let privacy: string | null = direct ? 'SELF_ONLY' : null
  if (direct && options.public === true) {
    const asked = await fetchImpl(CREATOR_INFO, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' },
      body: '{}',
    })
    if (!asked.ok) {
      throw new PublishError(`tiktok: لم تُقرأ خيارات الحساب (${await detail(asked)})`, asked.status, retryable(asked.status))
    }
    const info = (await asked.json()) as { data?: { privacy_level_options?: unknown } }
    const offered = Array.isArray(info.data?.privacy_level_options)
      ? (info.data!.privacy_level_options as unknown[]).map(String)
      : []
    privacy = pickPrivacy(offered)
  }
  const request = direct
    ? { post_info: { title, privacy_level: privacy }, source_info: source }
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
    throw new PublishError('tiktok: تهيئة بلا publish_id', 502, false)
  }
  if (typeof uploadUrl !== 'string' || uploadUrl === '') {
    throw new PublishError('tiktok: تهيئة بلا upload_url', 502, false)
  }

  // ٢ — دفعُ البايتات قطعةً قطعةً بترتيبها. و `Content-Range` إلزاميٌّ ولو كانت واحدة،
  // **والأخيرةُ تمتصّ الباقي** — ولا تُقرأ من الدلو إلّا القطعةُ التي تُدفَع الآن
  for (let i = 0; i < count; i++) {
    const start = i * chunkSize
    const end = i === count - 1 ? size : start + chunkSize
    const put = await fetchImpl(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': clip.mime,
        'Content-Range': `bytes ${start}-${end - 1}/${size}`,
      },
      body: (await clip.read(start, end - start)) as unknown as BodyInit,
    })
    if (!put.ok) {
      throw new PublishError(
        `tiktok: رُدّ الرفع (${put.status}${count > 1 ? ` · القطعة ${i + 1} من ${count}` : ''})`,
        put.status,
        retryable(put.status),
      )
    }
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
    privacy,
    request: { direct, size, title_length: title.length, privacy_level: privacy },
    response: { publish_id: publishId, status: state },
  }
}

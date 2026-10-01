/**
 * سائقُ رفع YouTube — **مستأنَفٌ في دفعةٍ واحدة** (D-096).
 *
 * ## والعقدُ مقروءٌ من وثيقة Google لا من الذاكرة
 *
 * المصدرُ آليّ: `discovery/v1/apis/youtube/v3/rest` — وهي التي تولّد منها
 * Google عملاءَها، فلا تشيخ عن الواجهة. وأُعيدت قراءتُها في D-096:
 *
 * | القيمة | المقروء | الموضع في الوثيقة |
 * |---|---|---|
 * | المسار | `POST youtube/v3/videos` | `…videos.methods.insert.path` |
 * | الإلزاميّ | `part` وحده | `…insert.parameterOrder` |
 * | السقف | ‏٢٥٦ غيغابايت | `…mediaUpload.maxSize` |
 * | المقبول | `video/*` · `application/octet-stream` | `…mediaUpload.accept` |
 * | السرّيّة | `public` · `unlisted` · `private` | `schemas.VideoStatus.privacyStatus.enum` |
 *
 * **وقِيس المسارُ حيّا**: نُودي بلا إذنٍ فردّ ٤٠١ (فهو موجود)، وبـ
 * `uploadType` مخترَعٍ ردّ ٤٠٠ — **فالمعاملُ يُفحَص فعلا** ولا يُهمَل.
 *
 * ## والرفعُ خطوتان لا واحدة
 *
 * ١ · `POST` بالوصف وحده — **ولا بايتات**. ويردّ عنوانَ الجلسة في
 *     ترويسة `Location`.
 * ٢ · `PUT` على ذلك العنوان بالبايتات، فيردّ الفيديو بمعرّفه.
 *
 * **والاستئنافُ لا يُستعمَل**: مقطعُنا خمسَ عشرةَ ثانيةً بحدٍّ معلوم
 * (`MAX_VIDEO_BYTES`)، فيمرّ في دفعةٍ واحدة. وحلقةُ استئنافٍ في Worker
 * له سقفُ زمنٍ **تُقتَل في منتصفها فتترك رفعا لا يُعرَف مصيرُه**.
 *
 * ## والسرّيّةُ `private` عمدا
 *
 * ونطاقُ الرفع «حسّاسٌ» عند Google: مشروعٌ لم يُجَز يبقى في `Testing`.
 * **و YouTube تقفل مرفوعاتِ المشاريع غير المُجازة على `private` مهما
 * طُلب** — فطلبُ `public` منها يُردّ أو يُتجاهَل.
 *
 * فيُطلَب `private` صراحةً، **ويُقال في المخرَج أنّه خاصّ**: مالكٌ يُقال
 * له «نُشر» ثمّ لا يجده على قناته يظنّ العطلَ عندنا — وهي قاعدةُ صندوق
 * TikTok نفسُها (D-092).
 *
 * ## وحصّةُ اليوم تُقال ولا تُكتشَف
 *
 * كان `videos.insert` يكلّف ‏١٦٠٠ وحدة (ستُّ رفعاتٍ يوميًّا). **وتبدّل مرّتين**
 * (سجلُّ مراجعات الواجهة): نزل إلى نحو ‏١٠٠ في ‏2025-12-04، ثمّ صار له منذ
 * ‏2026-06-01 سطلٌ وحدَه بمئة رفعةٍ يوميًّا بالافتراض (D-179). فلا رقمَ يُحرَس به
 * هنا: يُقال حين يقع، بما قالته Google.
 */
import { PublishError, type PublishResult, type Upload } from './platforms'
import { bytesClip, YOUTUBE_CHUNK, type Clip } from './clip'

const INIT_URL =
  'https://www.googleapis.com/upload/youtube/v3/videos' +
  '?uploadType=resumable&part=snippet,status'

/**
 * حدَّا العنوان والوصف.
 *
 * **وليسا في الوثيقة الآليّة**: تفرضهما Google عند الحفظ لا في المخطّط.
 * فهما مكتوبان من وثيقتها المقروءة، **ويُقصّ عندهما احتياطا** — ونصٌّ
 * يُقصّ خيرٌ من رفعٍ يُردّ بعد أن دُفعت حصّتُه.
 */
export const YT_TITLE_MAX = 100
export const YT_DESCRIPTION_MAX = 5000

/**
 * القسمُ الافتراضيّ — `22` أي «People & Blogs».
 *
 * وهو إلزاميٌّ عمليّا ولو لم يكن في `parameterOrder`، **والاثنان
 * والعشرون أعمُّ ما يقبل كلَّ موضوع**.
 */
export const YT_CATEGORY = '22'

/** السرّيّةُ المطلوبة — من `schemas.VideoStatus.privacyStatus.enum`. */
export const YT_PRIVACY = 'private'

/**
 * عنوانٌ صالح — **ولا زاويّتان فيه**.
 *
 * ترفض Google العنوانَ الحامل `<` أو `>` بـ `invalidVideoMetadata`،
 * **ورفضٌ بعد رفع البايتات يُهدر حصّةَ اليوم**. فتُنزَعان قبل النداء.
 */
export function youtubeTitle(text: string): string {
  const line = text.trim().split('\n')[0]?.trim() ?? ''
  const clean = line.replace(/[<>]/g, '').trim()
  if (clean === '') return 'منشورٌ من صدى'
  if (clean.length <= YT_TITLE_MAX) return clean
  const cut = clean.slice(0, YT_TITLE_MAX - 1)
  const space = cut.lastIndexOf(' ')
  return `${(space > YT_TITLE_MAX / 2 ? cut.slice(0, space) : cut).trimEnd()}…`
}

export interface YouTubeOutcome extends PublishResult {
  /**
   * **أخاصٌّ هو؟** — ويُقال ولا يُخمَّن.
   *
   * فمالكٌ يُقال له «نُشر» ثمّ لا يجده على قناته يظنّ العطلَ عندنا،
   * وهو مرفوعٌ عنده خاصّا ينتظر إجازةَ Google.
   */
  readonly private: boolean
}

function retryable(status: number): boolean {
  return status === 429 || status >= 500
}

async function detail(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as {
      error?: { message?: unknown; errors?: { reason?: unknown }[] }
    }
    const reason = body.error?.errors?.[0]?.reason
    if (typeof reason === 'string' && reason !== '') return reason
    const message = body.error?.message
    return typeof message === 'string' && message !== '' ? message : String(response.status)
  } catch {
    return String(response.status)
  }
}

/**
 * يرفع مقطعا إلى قناة المالك — **ويعيد معرّفَ الفيديو**.
 */
export async function publishYouTube(
  accessToken: string,
  input: Clip | Upload,
  text: string,
  fetchImpl: typeof fetch = fetch,
): Promise<YouTubeOutcome> {
  const clip = 'read' in input ? input : bytesClip(input)
  const size = clip.size
  if (size === 0) throw new PublishError('youtube: مقطعٌ فارغ', 400, false)

  const title = youtubeTitle(text)
  const description = text.trim().slice(0, YT_DESCRIPTION_MAX)
  const meta = {
    snippet: { title, description, categoryId: YT_CATEGORY },
    status: { privacyStatus: YT_PRIVACY, selfDeclaredMadeForKids: false },
  }

  // ١ — التهيئة: الوصفُ وحده، ولا بايتات. والحجمُ والنوعُ يُعلَنان في
  // الترويستين ليردَّ Google مبكرا إن جاوزا حدّه
  const init = await fetchImpl(INIT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Length': String(size),
      'X-Upload-Content-Type': clip.mime,
    },
    body: JSON.stringify(meta),
  })
  if (!init.ok) {
    const why = await detail(init)
    throw new PublishError(
      // **وحصّةُ اليوم تُقال حين تقع** — بلا رقمٍ تبدّل مرّتين (D-179)
      why === 'quotaExceeded'
        ? 'youtube: بلغت حصّةَ اليوم عند Google — أعد غدا'
        : `youtube: رُدّت التهيئة (${why})`,
      init.status,
      retryable(init.status),
    )
  }

  const session = init.headers.get('Location')
  if (session === null || session === '') {
    throw new PublishError('youtube: تهيئةٌ بلا ترويسة Location', 502, false)
  }

  // ٢ — دفعُ البايتات على عنوان الجلسة. **ولا إذنَ فيه**: العنوانُ نفسُه
  // هو الإذن، وهو موقَّتٌ ولا يُخزَّن.
  // **وقطعًا حين يكبر** (D-179): كلُّ قطعةٍ مضاعفٌ لـ ‏256KB، وما قبل الأخيرة
  // يُجاب بـ ‏308 «يُستأنَف» — و`redirect: 'manual'` يمنع fetch من قراءته تحويلًا
  let put: Response | null = null
  for (let start = 0; start < size; start += YOUTUBE_CHUNK) {
    const end = Math.min(size, start + YOUTUBE_CHUNK)
    const whole = start === 0 && end === size
    put = await fetchImpl(session, {
      method: 'PUT',
      redirect: 'manual',
      headers: whole
        ? { 'Content-Type': clip.mime, 'Content-Length': String(size) }
        : { 'Content-Type': clip.mime, 'Content-Length': String(end - start), 'Content-Range': `bytes ${start}-${end - 1}/${size}` },
      body: (await clip.read(start, end - start)) as unknown as BodyInit,
    })
    if (end < size) {
      if (put.status === 308) continue
      throw new PublishError(
        `youtube: رُدّت القطعة (${await detail(put)})`,
        put.status,
        retryable(put.status),
      )
    }
  }
  if (put === null) throw new PublishError('youtube: مقطعٌ فارغ', 400, false)
  if (!put.ok) {
    throw new PublishError(
      `youtube: رُدّ الرفع (${await detail(put)})`,
      put.status,
      retryable(put.status),
    )
  }

  const body = (await put.json()) as { id?: unknown }
  const id = body.id
  if (typeof id !== 'string' || id === '') {
    throw new PublishError('youtube: رفعٌ نجح بلا معرّفِ فيديو', 502, false)
  }

  return {
    platformPostId: id,
    private: true,
    request: { size, title_length: title.length, privacy: YT_PRIVACY },
    response: { id },
  }
}

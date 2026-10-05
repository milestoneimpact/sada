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
 * **وبعد الإجازة `public` بقرار المالك** (D-190): تُجاز مراجعةُ YouTube API Services
 * (M-28) فيقلب «النشرَ العلنيّ» في صفحة YouTube، ويُمرَّر هنا `public`. ولا يُستنتَج من
 * شيء: لا ردَّ من Google يقول «أُجيز»، وطلبُ `public` قبلها يُقفَل خاصًّا بلا خبر.
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

/** السرّيّةُ المطلوبة — من `schemas.VideoStatus.privacyStatus.enum`. والعلنيّةُ بعد الإجازة (D-190). */
export const YT_PRIVACY = 'private'
export const YT_PUBLIC = 'public'

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

/**
 * الوصفُ الذي يُرفع — **ما بعد سطر العنوان، لا النصُّ كلُّه** (D-190).
 *
 * كان الوصفُ النصَّ كلَّه، فبدأ وصفُ كلِّ مقطعٍ على YouTube بعنوانه مكرّرًا، وحقلُ «وصف
 * YouTube» الذي راجعه المالكُ ليس فيه عنوان. فيُفرَّق النصُّ بالقاعدة التي يُجمع بها
 * (`youtubeText`): سطرُه الأوّلُ عنوانٌ وما بعده وصف — **حين يُرفع ذلك السطرُ عنوانًا كما
 * هو**. أمّا سطرٌ يُقصّ عند ‏100 أو يُنزَع منه «<>» أو نصٌّ من سطرٍ واحد فيبقى النصُّ كلُّه
 * وصفًا كما كان: جملةٌ قُصّ عنوانُها لا تضيع، ولا يُرفع وصفٌ فارغ.
 */
export function youtubeDescription(text: string): string {
  const whole = text.trim()
  const cut = whole.indexOf('\n')
  if (cut === -1) return whole
  const head = whole.slice(0, cut).trim()
  const rest = whole.slice(cut + 1).trim()
  return rest !== '' && head !== '' && youtubeTitle(whole) === head ? rest : whole
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
  /** `public` بقرار المالك بعد إجازة Google (D-190) — والافتراضُ خاصّ. */
  options: { readonly public?: boolean } = {},
): Promise<YouTubeOutcome> {
  const clip = 'read' in input ? input : bytesClip(input)
  const size = clip.size
  if (size === 0) throw new PublishError('youtube: مقطعٌ فارغ', 400, false)

  const title = youtubeTitle(text)
  // ‏والعنوانُ لا يتكرّر في أوّل الوصف (D-190): ما راجعه المالكُ في حقل الوصف هو ما يُرفع
  const description = youtubeDescription(text).slice(0, YT_DESCRIPTION_MAX)
  const privacy = options.public === true ? YT_PUBLIC : YT_PRIVACY
  const meta = {
    snippet: { title, description, categoryId: YT_CATEGORY },
    status: { privacyStatus: privacy, selfDeclaredMadeForKids: false },
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
  /*
   * **ومن حيث حفظت Google لا من حيث أرسلنا** (D-182): ردُّ ‏308 يحمل `Range: bytes=0-N`
   * — آخرَ بايتٍ حُفظ — وقد يكون أقلَّ ممّا أُرسل. «لا تفترض أنّ الخادمَ تسلّم كلَّ ما
   * أُرسل» (وثيقةُ الرفع المستأنَف). وغيابُ الترويسة يعني أنّه لم يحفظ شيئًا.
   * **وحدٌّ للدورات**: خادمٌ لا يتقدّم لا يُدار عليه بلا نهاية.
   */
  let put: Response | null = null
  let start = 0
  let rounds = 0
  const maxRounds = Math.ceil(size / YOUTUBE_CHUNK) * 3
  while (start < size) {
    if (++rounds > maxRounds) {
      throw new PublishError('youtube: لم يتقدّم الرفعُ بعد دوراتٍ كثيرة — يُعاد لاحقًا', 503, true)
    }
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
    if (put.status !== 308) break
    const saved = /bytes=0-(\d+)/.exec(put.headers.get('Range') ?? '')
    start = saved === null ? 0 : Number(saved[1]) + 1
  }
  if (put === null) throw new PublishError('youtube: مقطعٌ فارغ', 400, false)
  if (put.status === 308) {
    // ‏حفظت Google البايتاتِ كلَّها ولم تُغلق الجلسة: ليس رفضًا — يُعاد
    throw new PublishError('youtube: اكتمل الرفعُ ولم يُغلَق — يُعاد', 503, true)
  }
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
    private: privacy === YT_PRIVACY,
    request: { size, title_length: title.length, privacy },
    response: { id },
  }
}

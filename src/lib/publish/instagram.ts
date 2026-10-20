/**
 * سائقُ نشرِ Instagram — **حاويةٌ ثمّ نشر** (D-121).
 *
 * ## خطوتان، وسببُهما أنّ الوسيطَ يُسحَب لا يُدفَع
 *
 * | الخطوة | النهاية | ما تردّه |
 * |---|---|---|
 * | ١ · الحاوية | `POST …/media` | `creation_id` |
 * | ٢ · النشر | `POST …/media_publish` | `id` المنشور |
 *
 * **ولا تقبل Instagram بايتاتٍ مدفوعة.** تطلب `image_url` أو `video_url`
 * — عنوانا **يفتحه خادمُها بنفسه**. وذلك بعينه ما بُنيت له النافذةُ
 * الموقّعةُ في `media/link.ts`: «فإمّا نافذة، وإمّا لا نشرَ على الثلاث».
 *
 * ## والحاويةُ لا تجهز لحظتَها
 *
 * المقطعُ يُسحَب ويُرمَّز عند Meta، **فالنشرُ فورَ الإنشاء يردّ خطأً
 * يقول إنّ الوسيطَ غيرُ جاهز**. فتُستطلَع حالُ الحاوية حتّى `FINISHED`.
 *
 * **والصورةُ تجهز غالبا فورا**، فلا تُستطلَع إلّا إن قالت المنصّةُ غيرَ
 * ذلك — ودورةُ انتظارٍ لصورةٍ جاهزةٍ تُنفق زمنَ Worker بلا سبب.
 *
 * ## ولا منشورَ نصّيٌّ فيها
 *
 * **صورةٌ أو مقطعٌ ولا ثالث.** ويُردّ ذلك هنا صريحا لا يُترَك للمنصّة:
 * رسالتُها «Missing media» لا تقول للمالك ما يفعل، **وهذا يقوله**.
 *
 * ## وحسابٌ احترافيٌّ شرطٌ لا تفصيل
 *
 * حسابٌ شخصيٌّ لا يفتح هذه النهاياتِ أصلا، **والردُّ حينئذٍ ‏٤٠٠ لا ‏٤٠٣**
 * — فيُقرأ «طلبٌ خطأ» وهو «حسابٌ خطأ». فتُقرأ رسالةُ Meta وتُنقَل كما هي.
 */
import { PublishError, type PublishResult } from './platforms'

/** ما يُنشَر على Instagram — **ولا ثالثَ لهما**. */
export type InstagramMedia =
  | { readonly kind: 'image'; readonly url: string }
  | { readonly kind: 'video'; readonly url: string }

/**
 * كم مرّةً تُستطلَع حالُ الحاوية، وبأيّ فاصل.
 *
 * **وسقفٌ لا حلقةٌ مفتوحة**: Worker له سقفُ زمنٍ، **وحلقةٌ تُقتَل في
 * منتصفها تترك حاويةً لا يُعرَف مصيرُها** — وهي علّةُ الاستئناف التي
 * رُفضت في سائق YouTube للسبب نفسِه.
 */
// ‏**خمسُ دقائق لا خمسَ عشرةَ ثانية** (D-179): مقطعُ صدى المولَّد يجهز في ثوانٍ،
// ومقطعُ المالك (دقيقةٌ بـ ‏1080p) يُرمَّز دقائق. وMeta توصي بسؤالٍ كلَّ دقيقةٍ إلى خمس؛
// والعشرُ ثوانٍ أقربُ جوابًا وتبقى تحت سقف زمن العامل (‏15 دقيقة)
export const POLL_TRIES = 30
export const POLL_MS = 10_000

const GRAPH = 'https://graph.instagram.com/v21.0'

interface ContainerReply { id?: unknown }
interface StatusReply { status_code?: unknown; status?: unknown }
interface ErrorReply { error?: { message?: unknown; code?: unknown } }

function classify(status: number): boolean {
  return status === 429 || status >= 500
}

/**
 * رسالةُ Meta كما هي — **ولا تُترجَم ولا تُلخَّص**.
 *
 * «The user is not an Instagram Professional account» جملةٌ تقول للمالك
 * ما يفعل، **و«فشل النشر» لا تقول شيئا**.
 */
async function metaError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as ErrorReply
    const message = body.error?.message
    if (typeof message === 'string' && message.length > 0) return message.slice(0, 160)
  } catch {
    return 'unparsable'
  }
  return 'unknown'
}

async function post(
  url: string, token: string, params: Record<string, string>, fetchImpl: typeof fetch,
): Promise<Response> {
  const form = new URLSearchParams({ ...params, access_token: token })
  return fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  })
}

export interface InstagramOutcome extends PublishResult {
  /** كم مرّةً استُطلعت الحاويةُ قبل أن تجهز — **صفرٌ يعني جهزت فورا**. */
  readonly polls: number
}

/**
 * ينشر على Instagram.
 *
 * `userId` هو معرّفُ الحساب الاحترافيّ (من `accounts.external_id`).
 * **و`sleep` يُحقَن ليُختبَر الاستطلاعُ بلا انتظارٍ حقيقيّ** — ودورةُ
 * اختبارٍ تنام خمسَ عشرةَ ثانيةً دورةٌ لا تُشغَّل.
 */
export async function publishInstagram(
  accessToken: string,
  userId: string,
  media: InstagramMedia,
  caption: string,
  fetchImpl: typeof fetch = fetch,
  sleep: (ms: number) => Promise<void> = (ms) =>
    new Promise((r) => { setTimeout(r, ms) }),
): Promise<InstagramOutcome> {
  if (media.url === '') {
    throw new PublishError(
      'instagram: لا وسيط — وInstagram لا تقبل منشورا نصّيّا',
      400, false,
    )
  }

  // ── ١ · الحاوية ────────────────────────────────────────────────────
  const fields: Record<string, string> = media.kind === 'video'
    // **و`REELS` لا `VIDEO`**: النوعُ القديمُ أُوقف، وطلبُه يُردّ
    ? { media_type: 'REELS', video_url: media.url, caption }
    : { image_url: media.url, caption }

  const created = await post(`${GRAPH}/${userId}/media`, accessToken, fields, fetchImpl)
  if (!created.ok) {
    throw new PublishError(
      `instagram: تعذّر إنشاء الحاوية — ${await metaError(created)}`,
      created.status, classify(created.status),
    )
  }
  const container = (await created.json()) as ContainerReply
  const creationId = typeof container.id === 'string' ? container.id : ''
  if (creationId === '') {
    throw new PublishError('instagram: ردّ بلا معرّف حاوية', 502, true)
  }

  // ── ٢ · تُستطلَع حتّى تجهز ──────────────────────────────────────────
  let polls = 0
  if (media.kind === 'video') {
    for (; polls < POLL_TRIES; polls++) {
      const look = await fetchImpl(
        `${GRAPH}/${creationId}?fields=status_code,status`
        + `&access_token=${encodeURIComponent(accessToken)}`,
      )
      if (!look.ok) break
      const state = (await look.json()) as StatusReply
      const code = String(state.status_code ?? '')
      if (code === 'FINISHED') break
      /*
       * **والخطأُ يُقرأ من الحالة لا من رمز HTTP.**
       *
       * استطلاعُ حاويةٍ فشل ترميزُها يردّ ‏٢٠٠ وفيه `ERROR` — **فمن فحص
       * `look.ok` وحدَه انتظر ستَّ دوراتٍ ثمّ نشر حاويةً ميّتة**.
       */
      if (code === 'ERROR') {
        throw new PublishError(
          `instagram: فشل ترميز المقطع — ${String(state.status ?? code)}`,
          422, false,
        )
      }
      await sleep(POLL_MS)
    }
  }

  // ── ٣ · النشر ──────────────────────────────────────────────────────
  const published = await post(
    `${GRAPH}/${userId}/media_publish`, accessToken,
    { creation_id: creationId }, fetchImpl,
  )
  if (!published.ok) {
    throw new PublishError(
      `instagram: تعذّر النشر — ${await metaError(published)}`,
      published.status, classify(published.status),
    )
  }
  const body = (await published.json()) as ContainerReply
  const postId = typeof body.id === 'string' ? body.id : ''
  if (postId === '') {
    /*
     * **ولا يُدَّعى نشرٌ لم يُؤكَّد.**
     *
     * ردٌّ ‏٢٠٠ بلا معرّفٍ قد يكون نُشر وقد لا يكون. **وادّعاءُ النجاح
     * يمنع إعادةَ المحاولة**، وادّعاءُ الفشل قد يُكرّر منشورا —
     * فيُقال إنّه غيرُ مؤكَّدٍ ولا يُعاد (`retryable: false`).
     */
    throw new PublishError('instagram: نُشر بلا معرّف يُؤكّده', 502, false)
  }

  return {
    platformPostId: postId,
    request: { creationId, kind: media.kind, caption: caption.length },
    response: body,
    polls,
  }
}

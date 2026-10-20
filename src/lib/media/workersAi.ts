/**
 * سائقُ Workers AI — لهجةٌ رابعة، وسببُها أنّها ليست HTTP أصلا.
 *
 * ## لماذا سائقٌ رابع
 *
 * D-031: **لكلّ لهجةٍ سائق، لا لكلّ شركة.** و`chatCompletion` و
 * `anthropicChat` لهجتا نصّ، و`gemini` لهجةُ بايتات. وهذه ليست لهجةَ
 * شبكةٍ البتّة: **رابطٌ في `wrangler.toml` يُنادى بـ `env.AI.run`** —
 * لا عنوانَ ولا مفتاحَ ولا ترويسة.
 *
 * وهذا ليس تفصيلا في الشكل: **لا مفتاحَ يُخزَّن ولا يُسرَّب ولا يُدوَّر.**
 * الحسابُ نفسه هو الإذن. ورمزُ `cfut_` لا يلزم إلّا لمن ينادي من خارج
 * Cloudflare — ونحن في داخلها.
 *
 * ## والفيديو يعيد رابطا لا بايتات
 *
 * صورةُ الجواب `{ state, result: { video: "https://….mp4" } }`. **وهو
 * رابطٌ عند المزوّد لا عندنا**: لا نعرف متى ينتهي، ولا نملك من يحفظه.
 * فيُسحَب فورا ويُكتب في R2 — **ورابطٌ لم يُسحَب هو منشورٌ يفشل بعد
 * أسبوعٍ بلا سبب يُقرأ.**
 *
 * ## ورابطٌ واحدٌ بوجهين — والسببُ أنّ الحسابين اثنان
 *
 * `env.AI` **يصل إلى حساب الـ Worker وحده**. وحسابُ Workers AI عند
 * المالك حسابٌ آخر — **فالرابطُ لا يبلغه مهما ضُبط.**
 *
 * فوجهٌ ثانٍ: نداءُ REST على
 * `‎/accounts/{id}/ai/run/{model}` برمزٍ في الترويسة. وهو نفسُ
 * الواجهة ونفسُ الأجوبة، **ويفترق في شيءٍ واحدٍ يُقال ولا يُخفى: يحتاج
 * سرّا يُخزَّن ويُدوَّر** — وهو ما كان الرابطُ يعفينا منه.
 *
 * ويُفضَّل الرابطُ متى وُجد: **مَن جمع الحسابين حذف السرَّ من نظامه.**
 *
 * ## وحدٌّ يُقال قبل أن يُكتشَف
 *
 * لم يُنادَ هذا الرابطُ من هذه الجلسة قطّ: `env.AI` لا وجود له خارج
 * Worker. فما هنا مكتوبٌ على المواصفة ومُختبَرٌ برابطٍ مزيّف، **وأوّلُ
 * نداءٍ حقيقيّ هو الذي يؤكّده** — كما قيل في سائق Gemini قبله.
 */

import { cfRunAnyUrl, cfRunUrl, isWorkersAiModel } from '../ai/cloudflare'

/** ما يكفي من واجهة `env.AI`، حتّى تُختبَر الوحدةُ بلا Worker. */
export interface AiBinding {
  /** والخيارُ الثالث لرابط `env.AI`: نماذجُ الطرف الثالث تحتاج بوّابةً (`gateway`). */
  run(model: string, input: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown>
}

/** بوّابةُ AI Gateway لنماذج الطرف الثالث — `default` تُنشأ وحدها عند أوّل نداء. */
export const GATEWAY = { gateway: { id: 'default' } } as const

/**
 * ‏**نفادُ الرصيد مهمّةُ مالكٍ لا عطل** (D-214): العبارةُ مرّةً هنا، فيعرفها سجلُّ «media.animate»
 * ومهمّةُ M-30 ورسالةُ اللوحة بالنصّ نفسِه. وجهُ REST يقولها بـ 402، والرابطُ `env.AI` بنصّ
 * Cloudflare («2021: Insufficient balance») لأنّه يرمي خطأً لا ردًّا.
 */
export const NO_CREDIT = 'لا رصيد في AI Gateway لنماذج الطرف الثالث'

/**
 * سببُ الردّ بكلام المالك (D-188) — **والرمزُ ونصُّ Cloudflare بعده لمن يشخّص**. كان يُقال
 * «Workers AI (REST) ردّ 400» وحده، فلا يُعرف أهو طلبٌ خاطئ أم رصيدٌ ناقص أم مفتاحٌ بلا إذن.
 * ونصُّ Cloudflare يُقصّ وتُحذف منه الروابط: قد يعيد رابطَ الصورة الموقَّع الذي أرسلناه.
 */
async function refusal(response: Response): Promise<string> {
  const why =
    response.status === 400 ? 'رفضت Cloudflare الطلب'
    : response.status === 401 || response.status === 403 ? 'مفتاح Cloudflare لا يملك إذن Workers AI'
    : response.status === 402 ? NO_CREDIT
    : response.status === 404 ? 'النموذج غير متاح لهذا الحساب'
    : response.status === 429 ? 'كثرة الطلبات — يُعاد بعد قليل'
    : response.status >= 500 ? 'عطل عند Cloudflare — يُعاد بعد قليل'
    : 'ردّ غير متوقَّع'
  let detail = ''
  try {
    const body = (await response.json()) as { errors?: { code?: unknown; message?: unknown }[] }
    const first = body.errors?.[0]
    if (first !== undefined) {
      const message = typeof first.message === 'string'
        ? first.message.replace(/https?:\/\/\S+/g, '‹رابط›').slice(0, 160)
        : ''
      detail = [first.code === undefined ? '' : String(first.code), message].filter((x) => x !== '').join(': ')
    }
  } catch {
    // جسدٌ ليس JSON: يكفي الرمز
  }
  return `${why} (${response.status}${detail === '' ? '' : ` — ${detail}`})`
}

/**
 * وجهُ REST — لحسابٍ غيرِ حساب الـ Worker.
 *
 * ولا يُسجَّل الرمزُ ولا يُعاد في جواب: يمرّ في الترويسة وحدها (D-005).
 * والخطأُ يُقرأ من الرمز لا من نصّ الرسالة، كما في كلّ سائقٍ عندنا.
 */
export function restBinding(
  accountId: string,
  apiToken: string,
  fetchImpl: typeof fetch = fetch,
): AiBinding {
  return {
    async run(model, input) {
      // **والعنوانُ من `cfRunUrl` لا يُكتب هنا** (D-081): كُتب في هذا
      // الملفّ وفي غيرِه، فأُصلح أحدُهما وبقي الآخرُ ينادي نهايةً لا تُخدَم.
      // ونموذجُ الطرف الثالث نهايتُه الجامعة وجسدُه غلاف (D-188) — مسارُ `‎/run/{model}` يردّه ‏400
      const own = isWorkersAiModel(model)
      const response = await fetchImpl(
        own ? cfRunUrl(accountId, model) : cfRunAnyUrl(accountId),
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(own ? input : { model, input }),
        },
      )

      if (!response.ok) {
        // الرمزُ يقرّر الإعادة. و 429 و 5xx تُعاد، وما عداهما لا
        const retryable = response.status === 429 || response.status >= 500
        // ولا يُقرأ الجسدُ كاملا: أوّلُ خطأٍ وحده، مقصوصًا وبلا روابط
        throw new AiError(await refusal(response), retryable)
      }

      const contentType = response.headers.get('Content-Type') ?? ''
      // الصورُ تعود بايتاتٍ لا JSON عند بعض النماذج
      if (!contentType.includes('json')) return await response.arrayBuffer()

      const payload = (await response.json()) as Record<string, unknown>
      // غلافُ Cloudflare: { success, result, errors }. ويُفَضّ إلى `result`
      // ليتّحد شكلُ الجوابين — فالمنادي لا يعرف بأيّ وجهٍ نُودي
      if (payload['success'] === false) {
        throw new AiError('رفضت Cloudflare الطلب (success:false)', false)
      }
      // ‏وجوابُ النهاية الجامعة شكلُ النموذج نفسُه ({ state, result: { video } }) بلا غلاف `success`:
      // فلا يُفَضّ، وإلّا ضاعت `state` وبقي `{ video }` بلا رأسه (D-188)
      if (!('success' in payload)) return payload
      const result = payload['result']
      return result === undefined ? payload : result
    },
  }
}

export class AiError extends Error {
  override readonly name = 'AiError'
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message)
  }
}

/**
 * نماذجُ الصور — **والاسمُ يُكتب هنا وحده**.
 *
 * ومزوّدٌ يُضاف بسطر. والفرقُ بين الثلاثة ليس السرعةَ وحدها:
 * `lucid-origin` و `phoenix` يرسمان نصّا لاتينيّا بدقّة، و`flux` أسرعُ
 * وأرخص. **ولا واحدَ منها يكتب عربيّةً صحيحة** — ولذلك أوّلُ قيدٍ في
 * مطالبتنا «لا حروفَ في الصورة»، والنصُّ يُركَّب فوقها عندنا.
 */
export const IMAGE_MODELS = {
  flux: '@cf/black-forest-labs/flux-1-schnell',
  lucid: '@cf/leonardo/lucid-origin',
  phoenix: '@cf/leonardo/phoenix-1.0',
} as const

/**
 * نماذجُ الفيديو.
 *
 * **والجيلُ الأوّل هو المختار، لا الأحدث.** و`hh1.1` أجودُ وأتبعُ
 * للتعليمات — **و`hh1` وحده موسومٌ «Zero data retention»**. ومحتوانا
 * مشتقٌّ من مستنداتِ Drive الخاصّة بالمالك، فالفرقُ ليس تفصيلا.
 *
 * ومن أراد الأجود بدّل سطرا، **وهو يعرف ما يبدّل** — وذاك هو المقصود.
 */
export const VIDEO_MODELS = {
  /** صورة ← فيديو: نرى الصورةَ ونعتمدها قبل أن نُنفق على تحريكها. */
  fromImage: 'alibaba/hh1-i2v',
  /** نصّ ← فيديو: نداءٌ واحد، ولا نرى شيئا قبل أن يُنفَق. */
  fromText: 'alibaba/hh1-t2v',
} as const

export interface GeneratedImage {
  readonly bytes: Uint8Array
  readonly mime: string
  readonly model: string
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i)
  return out
}

/**
 * صورةٌ من نصّ.
 *
 * **وشكلُ الجواب يختلف بين النماذج، فيُفحَص ولا يُفترَض**: `flux` يعيد
 * `{ image: "<base64>" }`، وبعضُها يعيد تدفّقا. فيُقبَل الاثنان، ويُرفَض
 * ما لا يُعرَف بدل أن يُخمَّن.
 */
export async function generateImage(
  ai: AiBinding,
  prompt: string,
  model: string = IMAGE_MODELS.lucid,
): Promise<GeneratedImage> {
  let raw: unknown
  try {
    raw = await ai.run(model, { prompt })
  } catch (error) {
    // خطأُ الرابط لا يحمل حالةً كـ HTTP، فيُقرأ نصُّه — وهو الاستثناء
    // الوحيد لقاعدة «الرمز لا النصّ»، لأنّه لا رمزَ أصلا
    if (error instanceof AiError) throw error
    const detail = error instanceof Error ? error.message : 'عطل'
    if (/Insufficient balance|\b402\b/i.test(detail)) throw new AiError(`${NO_CREDIT} (${detail.slice(0, 160)})`, false)
    const retryable = /capacity|429|3040|timeout|rate/i.test(detail)
    throw new AiError(`Workers AI: ${detail}`, retryable)
  }

  if (raw instanceof ReadableStream || raw instanceof ArrayBuffer) {
    const bytes =
      raw instanceof ArrayBuffer
        ? new Uint8Array(raw)
        : new Uint8Array(await new Response(raw).arrayBuffer())
    if (bytes.byteLength === 0) throw new AiError('صورة فارغة', true)
    return { bytes, mime: 'image/png', model }
  }

  const payload = (raw ?? {}) as Record<string, unknown>
  const image = payload['image']
  if (typeof image !== 'string' || image.length === 0) {
    throw new AiError('جواب Workers AI بلا صورة', true)
  }
  return { bytes: decodeBase64(image), mime: 'image/png', model }
}

export interface VideoRequest {
  /** الصورةُ المرجع — رابطٌ عامٌّ يفتحه المزوّد بنفسه (D-050). */
  readonly imageUrl: string
  readonly prompt: string
  /** ٣ إلى ١٥ ثانية — والحدُّ من المزوّد لا منّا. */
  readonly durationSeconds?: number
  readonly ratio?: '9:16' | '16:9' | '1:1'
  readonly resolution?: '720P' | '1080P'
}

/** أدنى وأقصى مدّةٍ يقبلها المزوّد — تُقصّ عندنا ولا تُترك لتُردّ عنده. */
export const MIN_SECONDS = 3
export const MAX_SECONDS = 15

export function clampDuration(seconds: number): number {
  if (!Number.isFinite(seconds)) return MAX_SECONDS
  return Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, Math.round(seconds)))
}

export interface GeneratedVideo {
  /** رابطٌ **عند المزوّد** — يُسحَب فورا ولا يُخزَّن كما هو. */
  readonly url: string
  readonly model: string
}

/**
 * فيديو من صورة.
 *
 * والرأسيُّ `9:16` هو الأصل: **Shorts و Reels و TikTok كلُّها رأسيّة**،
 * وخطٌّ واحدٌ يخدم الثلاث. ومن أراد أفقيّا لليوتيوب الطويل بدّل نسبةً —
 * **ولا يكفيه ذلك**: خمسَ عشرةَ ثانيةً سقفٌ صلب، والطويلُ يحتاج خياطةً
 * بـ ffmpeg، و Workers لا تشغّله.
 */
export async function generateVideo(
  ai: AiBinding,
  request: VideoRequest,
  model: string = VIDEO_MODELS.fromImage,
): Promise<GeneratedVideo> {
  let raw: unknown
  try {
    // ‏ومخطّطُ «صورة ← فيديو» لا يعرف `ratio` (النسبةُ نسبةُ الصورة): يُرسَل لنموذج النصّ وحده
    const input: Record<string, unknown> = {
      image: request.imageUrl,
      prompt: request.prompt,
      duration: clampDuration(request.durationSeconds ?? MAX_SECONDS),
      resolution: request.resolution ?? '720P',
    }
    if (model.includes('t2v')) input['ratio'] = request.ratio ?? '9:16'
    raw = await ai.run(model, input, isWorkersAiModel(model) ? undefined : GATEWAY)
  } catch (error) {
    // ‏خطأُ وجه REST يحمل حكمَه وسببَه بكلام المالك (D-188) — يمرّ كما هو ولا يُغلَّف ثانيةً
    if (error instanceof AiError) throw error
    const detail = error instanceof Error ? error.message : 'عطل'
    if (/Insufficient balance|\b402\b/i.test(detail)) throw new AiError(`${NO_CREDIT} (${detail.slice(0, 160)})`, false)
    const retryable = /capacity|429|3040|timeout|rate/i.test(detail)
    throw new AiError(`Workers AI: ${detail}`, retryable)
  }

  const payload = (raw ?? {}) as Record<string, unknown>
  // حالةٌ غيرُ مكتملةٍ ليست عطلا: النموذجُ طويلٌ، فتُعاد لا تُكذَّب
  const state = payload['state']
  if (typeof state === 'string' && state !== 'Completed') {
    throw new AiError(`لم يكتمل التوليد بعد (${state})`, true)
  }

  const result = (payload['result'] ?? {}) as Record<string, unknown>
  const url = result['video']
  if (typeof url !== 'string' || !url.startsWith('https://')) {
    throw new AiError('جواب Workers AI بلا رابط فيديو', true)
  }
  return { url, model }
}

/**
 * يسحب البايتات من رابط المزوّد.
 *
 * **ورابطٌ لا يُسحَب فورا يُفقَد**: هو عند المزوّد، ولا نعرف متى ينتهي
 * ولا نملك من يحفظه. ومنشورٌ يحمل رابطا ميّتا يفشل بعد أسبوعٍ بخطأٍ لا
 * يدلّ على سببه.
 */
export async function fetchVideoBytes(
  url: string,
  fetchImpl: typeof fetch = fetch,
  maxBytes = 64 * 1024 * 1024,
): Promise<{ bytes: Uint8Array; mime: string }> {
  let response: Response
  try {
    response = await fetchImpl(url)
  } catch (error) {
    throw new AiError(
      `تعذّر سحب الفيديو: ${error instanceof Error ? error.message : 'عطل شبكة'}`,
      true,
    )
  }
  if (!response.ok) throw new AiError(`سحب الفيديو ردّ ${response.status}`, response.status >= 500)

  const buffer = await response.arrayBuffer()
  // حدٌّ يُفحَص بعد السحب لا قبله: الترويسةُ قد تكذب أو تغيب
  if (buffer.byteLength === 0) throw new AiError('فيديو فارغ', true)
  if (buffer.byteLength > maxBytes) throw new AiError('الفيديو أكبر من الحدّ', false)

  /*
   * **النوعُ من قائمةٍ لا من الترويسة كما جاءت** (D-152). كانت تُخزَّن
   * وتُبَثّ من `/panel/media/:id` تحت أصل اللوحة؛ ومزوّدٌ يردّ يومًا
   * `text/html` كان سيُرسَم صفحةً بجلسة المالك. ما ليس مقطعًا يُرفَض ولا
   * يُعاد: البايتاتُ عندهم لا تتبدّل بإعادة السحب.
   */
  const declared = (response.headers.get('Content-Type') ?? 'video/mp4').split(';')[0]!.trim().toLowerCase()
  if (!VIDEO_MIMES.has(declared)) throw new AiError(`نوع الفيديو غير مقبول: ${declared}`, false)

  return { bytes: new Uint8Array(buffer), mime: declared }
}

/** ما يُقبَل مقطعًا — ويقابل ما يرسمه `<video>` في اللوحة. */
export const VIDEO_MIMES: ReadonlySet<string> = new Set(['video/mp4', 'video/webm'])

/**
 * توليدُ الصور عند Cloudflare Workers AI (D-079).
 *
 * ## لماذا وُجد
 *
 * كان توجيهُ الصور يُقرأ من اللوحة — **ثمّ يُنادى Gemini على كلّ حال**:
 * `image/job.ts` تستورد سائقَه استيرادا مثبَّتا، و`gemini.ts` تحمل عنوانَ
 * Google ثابتا. فمن وجّه الصورَ إلى Cloudflare أُرسل اسمُ نموذجِ
 * Cloudflare إلى عنوان Google:
 *
 *     …/v1beta/models/@cf%2Fblack-forest-labs%2Fflux-1-schnell:generateContent
 *
 * **فردّت ٤٠٥.** والاختيارُ كان يُقرأ ولا يُطاع — وهي علّةُ D-067 نفسُها:
 * بُني ولم يُستعمَل، **ولكن في الاتّجاه المعاكس**: يُستعمَل شكلا ولا
 * يُطاع فعلا.
 *
 * ## والعقدُ مقروءٌ من وثائق Cloudflare لا من الذاكرة
 *
 *     POST /client/v4/accounts/{account}/ai/run/@cf/black-forest-labs/flux-1-schnell
 *     Authorization: Bearer {token}
 *     { "prompt": "…", "steps": 4 }
 *     ← { "result": { "image": "<base64>" }, "success": true }
 *
 * | القيمة | المقيس |
 * |---|---|
 * | `prompt` | إلزاميّ · ١ إلى ٢٠٤٨ محرفا |
 * | `steps` | افتراضُه ٤ · وأقصاه ٨ |
 * | المخرَج | `image` — **base64 لا بايتات** |
 * | النوع | `image/jpeg` (كما في مثال `data:` عندهم) |
 *
 * ## والغلافُ يُفَضّ في `restBinding` لا هنا
 *
 * جوابُ Cloudflare `{ success, result, errors }`، و`restBinding` تفضّه
 * إلى `result` **ليتّحد شكلُ الوجهين** — فالمنادي لا يعرف أنُودي بالرابط
 * أم بالـREST (D-055).
 */
import { AiError, restBinding, type AiBinding } from '../media/workersAi'
import { cfPrice } from '../ai/imagePricing'
import { cfRunUrl } from '../ai/cloudflare'
import { ImageError, type ImageResult } from './gemini'
import { withTimeout } from '../net/timeout'

/** النموذجُ الافتراضيّ — ويبدّله المالكُ من اللوحة. */
export const CF_IMAGE_MODEL = '@cf/black-forest-labs/flux-1-schnell'

/**
 * خطواتُ الانتشار.
 *
 * **الافتراضُ أربعٌ وأقصاه ثمانٍ** — مقيسٌ من وثيقة النموذج. ورقمٌ فوقه
 * يُردّ، ورقمٌ دونه يُسرِع ويُخشِن. فيبقى على الافتراض حتّى يُقاس أثرُه.
 */
export const CF_IMAGE_STEPS = 4

/** أقصى ما يقبله النموذجُ من وصف — مقيسٌ كذلك. */
export const CF_PROMPT_MAX = 2048

/** ‏مهلةُ نداء الصورة (D-320): flux بأربع خطواتٍ ثوانٍ، ودقيقتان سقفٌ لا يُبلَغ إلّا بعطل. */
const IMAGE_TIMEOUT_MS = 120_000

export interface CfImageCall {
  readonly accountId: string
  readonly apiToken: string
  readonly model: string
  readonly prompt: string
  /** المقاسُ لمن يقبله (FLUX.2) — ويُحاسَب عليه (D-285). schnell يرسم 1024×1024 ويتجاهله. */
  readonly width?: number
  readonly height?: number
  readonly fetchImpl?: typeof fetch
  /** يُحقَن في الاختبار، وفي الإنتاج يُبنى من الحساب والرمز. */
  readonly binding?: AiBinding
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/**
 * يولّد صورةً واحدة — **ويعيد شكلَ `ImageResult` نفسَه** الذي يعيده سائقُ
 * Gemini، فلا يعرف المنادي بأيّ مزوّدٍ وُلّدت.
 */
export async function generateImageCf(call: CfImageCall): Promise<ImageResult> {
  const prompt = call.prompt.trim()
  if (prompt.length === 0) throw new ImageError('وصف فارغ', 400, false)
  // **والقصُّ هنا لا عند المزوّد**: ٢٠٤٨ حدُّه المقيس، وطلبٌ فوقه يُردّ
  // بخطأٍ لا يقول إنّ السببَ الطول
  const text = prompt.length > CF_PROMPT_MAX ? prompt.slice(0, CF_PROMPT_MAX) : prompt

  const binding =
    call.binding ??
    (call.accountId.trim() === '' || call.apiToken.trim() === ''
      ? null
      : restBinding(call.accountId.trim(), call.apiToken.trim(), withTimeout(call.fetchImpl ?? fetch, IMAGE_TIMEOUT_MS)))
  if (binding === null) {
    throw new ImageError('حساب Cloudflare أو مفتاحُه غير مضبوط', 503, false)
  }

  let out: unknown
  try {
    /*
     * **عائلةُ FLUX.2 تُنادى بـ multipart ولو كان الطلبُ وصفًا وحده** (وثيقة klein 9B، D-285). كان الجسدُ JSON لكلّ
     * نموذج، فمن اختار klein أُرسل إليه ما لا يقرؤه. والخطواتُ فيها ثابتةٌ أربعًا فلا تُرسَل.
     */
    out = cfPrice(call.model)?.multipart === true
      ? await runMultipart(call, text)
      : await binding.run(call.model, { prompt: text, steps: CF_IMAGE_STEPS })
  } catch (error) {
    // **وقابليّةُ الإعادة تُورَث من `AiError` ولا تُخترَع**
    const retryable = error instanceof AiError ? error.retryable : false
    throw new ImageError(
      error instanceof Error ? error.message : 'تعذّر النداء',
      502,
      retryable,
    )
  }

  // بعضُ النماذج تعيد البايتات مباشرةً، وهذا يعيد base64 — ويُقبَل الاثنان
  if (out instanceof ArrayBuffer) {
    return { bytes: new Uint8Array(out), mime: 'image/jpeg', model: call.model }
  }

  const image = (out as { image?: unknown } | null)?.image
  if (typeof image !== 'string' || image.length === 0) {
    throw new ImageError('جواب بلا حقل `image`', 502, false)
  }

  let bytes: Uint8Array
  try {
    bytes = decodeBase64(image)
  } catch {
    throw new ImageError('حقل `image` ليس base64 صالحا', 502, false)
  }
  if (bytes.length === 0) throw new ImageError('صورة فارغة', 502, false)

  return { bytes, mime: 'image/jpeg', model: call.model }
}

/** نداءُ multipart: بالرابط حين يُحقَن (`env.AI` أو الاختبار)، وإلّا REST إلى نهاية النموذج نفسِه. */
async function runMultipart(call: CfImageCall, prompt: string): Promise<unknown> {
  const form = new FormData()
  form.append('prompt', prompt)
  form.append('width', String(call.width ?? 1024))
  form.append('height', String(call.height ?? 1024))
  if (call.binding !== undefined) {
    const packed = new Response(form)
    return call.binding.run(call.model, { multipart: { body: packed.body, contentType: packed.headers.get('Content-Type') ?? '' } })
  }
  const response = await withTimeout(call.fetchImpl ?? fetch, IMAGE_TIMEOUT_MS)(cfRunUrl(call.accountId.trim(), call.model), {
    method: 'POST',
    headers: { Authorization: `Bearer ${call.apiToken.trim()}` },
    body: form,
  })
  if (!response.ok) {
    throw new AiError(`ردّت Cloudflare ${response.status} على ${call.model}`, response.status === 429 || response.status >= 500)
  }
  const payload = (await response.json()) as { success?: boolean; result?: unknown }
  if (payload.success === false) throw new AiError('رفضت Cloudflare الطلب (success:false)', false)
  return payload.result
}

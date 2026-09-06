/**
 * سائق اللهجة الموحَّدة — `chat/completions`.
 *
 * **لكلّ لهجةٍ سائق، لا لكلّ شركة.** DeepSeek و OpenAI و Groq و Mistral
 * و Together و xAI و OpenRouter و Gemini (بنقطة توافقها) كلّهم يتكلّمون
 * هذه. فمزوّدٌ يظهر بعد سنة يُضاف بعنوانه ونموذجه، بلا نشرٍ ولا شيفرة.
 *
 * وثلاثة فروقٍ بينهم عُولجت هنا لا في كلّ منادٍ:
 *
 * ١ · **إلزامُ JSON يختلف.** بعضهم يقبل مخطّطا كاملا، وبعضهم
 *     `json_object` وحده، وبعضهم لا شيء. فيُطلب الأضعف الذي يفهمه
 *     الجميع — ويُتحقَّق من الشكل عندنا لا عندهم.
 * ٢ · **أسماء الاستهلاك واحدة** (`prompt_tokens`/`completion_tokens`)
 *     لكنّها قد تغيب. فتُقرأ بحذر لا تُفترَض.
 * ٣ · **أصنافُ الأخطاء** تُقرأ من الرمز لا من نصّ الرسالة: الصياغة
 *     تتغيّر بلا إعلان، والرمز لا.
 */

import { compatCatalogUrl } from './models'

export interface CompatUsage {
  readonly inputTokens: number
  readonly outputTokens: number
}

export interface CompatResult {
  readonly text: string
  readonly usage: CompatUsage
  readonly model: string
}

export class CompatError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(message)
    this.name = 'CompatError'
  }
}

export interface CompatRequest {
  readonly baseUrl: string
  readonly apiKey: string
  readonly model: string
  readonly system: string
  readonly user: string
  /** يُطلب JSON. والتحقّق من الشكل عندنا: لا نثق بوعد المزوّد. */
  readonly json?: boolean
  readonly maxTokens?: number
}

function readUsage(raw: unknown): CompatUsage {
  const usage = (raw ?? {}) as Record<string, unknown>
  const num = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0)
  return {
    inputTokens: num(usage['prompt_tokens']),
    outputTokens: num(usage['completion_tokens']),
  }
}

/** رمزُ الحالة يقرّر الإعادة، لا نصّ الرسالة. */
function classify(status: number): { detail: string; retryable: boolean } {
  if (status === 401 || status === 403) return { detail: 'المفتاح مرفوض', retryable: false }
  if (status === 404) return { detail: 'النموذج أو العنوان غير موجود', retryable: false }
  if (status === 400 || status === 422) return { detail: 'الطلب مرفوض — راجع اسم النموذج', retryable: false }
  if (status === 429) return { detail: 'بلغ حدّ المزوّد', retryable: true }
  if (status >= 500) return { detail: 'المزوّد متعب', retryable: true }
  return { detail: `ردّ المزوّد ${status}`, retryable: status >= 500 }
}

export async function chatCompletion(
  request: CompatRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<CompatResult> {
  if (request.apiKey.trim().length === 0) {
    throw new CompatError('لا مفتاح لهذا المزوّد', 503, false)
  }

  const body: Record<string, unknown> = {
    model: request.model,
    max_tokens: request.maxTokens ?? 4096,
    messages: [
      { role: 'system', content: request.system },
      { role: 'user', content: request.user },
    ],
  }
  // الأضعف الذي يفهمه الجميع: `json_object` لا مخطّط كامل
  if (request.json === true) body['response_format'] = { type: 'json_object' }

  let response: Response
  try {
    response = await fetchImpl(`${request.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${request.apiKey.trim()}`,
      },
      body: JSON.stringify(body),
    })
  } catch (error) {
    throw new CompatError(
      `تعذّر الوصول: ${error instanceof Error ? error.message : 'عطل شبكة'}`,
      502,
      true,
    )
  }

  if (!response.ok) {
    const { detail, retryable } = classify(response.status)
    throw new CompatError(detail, response.status, retryable)
  }

  let payload: Record<string, unknown>
  try {
    payload = (await response.json()) as Record<string, unknown>
  } catch {
    throw new CompatError('جواب المزوّد ليس JSON', 502, true)
  }

  const choices = payload['choices']
  const first = Array.isArray(choices) ? (choices[0] as Record<string, unknown> | undefined) : undefined
  const message = first?.['message'] as Record<string, unknown> | undefined
  const text = message?.['content']

  if (typeof text !== 'string' || text.length === 0) {
    throw new CompatError('لا نصّ في جواب المزوّد', 502, true)
  }
  // بُتر قبل تمامه: قد يتمّ في محاولةٍ ثانية
  if (first?.['finish_reason'] === 'length') {
    throw new CompatError('بُتر الجواب قبل تمامه', 502, true)
  }

  return {
    text,
    usage: readUsage(payload['usage']),
    model: typeof payload['model'] === 'string' ? payload['model'] : request.model,
  }
}

/**
 * تحقّقٌ رخيص: قائمةُ النماذج.
 *
 * `GET {base}/models` جزءٌ من اللهجة نفسها، فيعمل عند الجميع تقريبا.
 * ومَن لا يدعمها يردّ 404 — **ويُميَّز ذلك عن «المفتاح مرفوض»**، فلا
 * يُتّهم مفتاحٌ صحيح.
 *
 * **والعنوانُ من `compatCatalogUrl` لا يُبنى هنا** (D-081): Cloudflare
 * لا تخدم `‎/ai/v1/models` — طبقةُ توافقِ OpenAI عندها مقصورةٌ على
 * `chat/completions` و `embeddings` — فكان الفاحصُ يردّ فشلا **على
 * مفتاحٍ صحيح**، وهو صنفُ الكذب الذي كلّفنا ليلةً في D-076.
 *
 * **ويُحكَم بالرمز لا بالشكل**: ٢٠٠ جوازٌ ولو لم نفهم جسدَ الجواب.
 * فهمُ الجسد شأنُ `listModels`، وخلطُ الأمرين يجعل شكلا تغيّر عند
 * المزوّد تهمةً على مفتاحٍ سليم.
 */
export async function verifyCompat(
  baseUrl: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; detail: string; status: number | null }> {
  try {
    const response = await fetchImpl(compatCatalogUrl(baseUrl), {
      headers: { Authorization: `Bearer ${apiKey.trim()}` },
    })
    if (response.ok) return { ok: true, detail: 'المفتاح يعمل', status: response.status }
    if (response.status === 404) {
      return {
        ok: false,
        status: 404,
        detail: 'المزوّد لا يدعم قائمة النماذج — جرّب مهمّةً حقيقيّة للتحقّق',
      }
    }
    const { detail } = classify(response.status)
    return { ok: false, detail, status: response.status }
  } catch (error) {
    return {
      ok: false,
      status: null,
      detail: `تعذّر الوصول: ${error instanceof Error ? error.message : 'عطل شبكة'}`,
    }
  }
}

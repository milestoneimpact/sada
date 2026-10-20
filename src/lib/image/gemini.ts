/**
 * سائقُ توليد الصور — Gemini.
 *
 * ## لماذا سائقٌ ثالث ولم يكفِ الاثنان
 *
 * D-031 قال «لكلّ لهجةٍ سائق». و `chatCompletion` و `anthropicChat`
 * لهجتا **نصّ**: تُرسل نصّا وتستقبل نصّا. وهذه تستقبل **بايتات** — لا
 * يعبر منها شيءٌ في `text`، ولا يصلح مخطَّط JSON لوصفها. فلهجةٌ ثالثة.
 *
 * ## وحدٌّ يُقال قبل أن يُكتشَف
 *
 * لم يُنادَ هذا العنوانُ من هذه الجلسة قطّ — الشبكةُ محجوبة. فما هنا
 * مكتوبٌ على مواصفة الواجهة ومُختبَرٌ بشبكةٍ مزيّفة، **وأوّلُ نداءٍ
 * حقيقيّ هو الذي يؤكّده**. ولذلك تُقرأ الأخطاءُ من الرمز لا من نصّ
 * الرسالة، ويُفحَص شكلُ الجواب حقلا حقلا بدل أن يُفترَض.
 */

export interface ImageCall {
  readonly apiKey: string
  readonly model: string
  readonly prompt: string
  readonly fetchImpl?: typeof fetch
}

export interface ImageResult {
  readonly bytes: Uint8Array
  readonly mime: string
  readonly model: string
}

export class ImageError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(message)
    this.name = 'ImageError'
  }
}

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

/** رمزُ الحالة يقرّر الإعادة، لا صياغةُ الرسالة — فالصياغةُ تتبدّل بلا إعلان. */
function classify(status: number): { detail: string; retryable: boolean } {
  if (status === 400) return { detail: 'الطلب مرفوض — راجع اسم النموذج', retryable: false }
  if (status === 401 || status === 403) return { detail: 'المفتاح مرفوض', retryable: false }
  if (status === 404) return { detail: 'النموذج غير موجود', retryable: false }
  if (status === 429) return { detail: 'بلغ حدّ المزوّد', retryable: true }
  if (status >= 500) return { detail: 'المزوّد متعب', retryable: true }
  return { detail: `ردّ المزوّد ${status}`, retryable: false }
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i)
  return out
}

interface Part {
  inlineData?: { mimeType?: string; data?: string }
  inline_data?: { mime_type?: string; data?: string }
  text?: string
}

/**
 * يقرأ أوّلَ جزءٍ يحمل بايتات.
 *
 * والاسمان مقبولان (`inlineData` و `inline_data`): الواجهةُ نفسها تكتب
 * الأوّل في REST والثاني في بعض العملاء، **وقارئٌ يعرف واحدا يسقط على
 * تبدّلٍ لا يعني شيئا**.
 */
function readImage(parts: readonly Part[]): { data: string; mime: string } | null {
  for (const part of parts) {
    const inline = part.inlineData ?? part.inline_data
    if (inline === undefined) continue
    const data = inline.data
    if (typeof data !== 'string' || data.length === 0) continue
    const mime =
      (part.inlineData?.mimeType ?? part.inline_data?.mime_type ?? 'image/png').toLowerCase()
    return { data, mime }
  }
  return null
}

export async function generateImage(call: ImageCall): Promise<ImageResult> {
  if (call.apiKey.trim().length === 0) {
    throw new ImageError('لا مفتاح لـ Gemini', 503, false)
  }
  const fetchImpl = call.fetchImpl ?? fetch

  let response: Response
  try {
    // المفتاحُ في ترويسة لا في مسار: عنوانٌ يحمل مفتاحا يُسجَّل في كلّ
    // وسيطٍ بينك وبينه، ويبقى في سجلّات لا تملكها
    response = await fetchImpl(`${BASE}/${encodeURIComponent(call.model)}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': call.apiKey.trim(),
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: call.prompt }] }],
        generationConfig: { responseModalities: ['IMAGE'] },
      }),
    })
  } catch (error) {
    throw new ImageError(
      `تعذّر الوصول: ${error instanceof Error ? error.message : 'عطل شبكة'}`,
      502,
      true,
    )
  }

  if (!response.ok) {
    const { detail, retryable } = classify(response.status)
    throw new ImageError(`gemini: ${detail}`, response.status, retryable)
  }

  let payload: {
    candidates?: { content?: { parts?: Part[] }; finishReason?: string }[]
    promptFeedback?: { blockReason?: string }
  }
  try {
    payload = (await response.json()) as typeof payload
  } catch {
    throw new ImageError('gemini: الجواب ليس JSON', 502, true)
  }

  // منعُ السياسة ليس عطلا يُعاد: يُبلَّغ ولا يُكرَّر، وإعادتُه تدفع ثمنَ رفضٍ مؤكّد
  const blocked = payload.promptFeedback?.blockReason
  if (blocked !== undefined) {
    throw new ImageError(`gemini: رُفض الوصف لسياسة المحتوى (${blocked})`, 422, false)
  }

  const parts = payload.candidates?.[0]?.content?.parts
  if (!Array.isArray(parts) || parts.length === 0) {
    throw new ImageError('gemini: لا محتوى في الجواب', 502, true)
  }

  const image = readImage(parts)
  if (image === null) {
    // جوابٌ نصّيٌّ مكان الصورة: النموذج اعتذر بدل أن يرسم. يُنقَل اعتذارُه
    // كما هو — رسالةٌ عامّة تجعل المالك يظنّ العطل عندنا
    const said = parts.find((p) => typeof p.text === 'string')?.text
    throw new ImageError(
      said === undefined ? 'gemini: لا صورة في الجواب' : `gemini ردّ نصّا: ${said.slice(0, 200)}`,
      502,
      false,
    )
  }

  const bytes = decodeBase64(image.data)
  if (bytes.length === 0) throw new ImageError('gemini: صورة فارغة', 502, true)

  return { bytes, mime: image.mime, model: call.model }
}

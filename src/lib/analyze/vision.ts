/**
 * قراءةُ الصورة — **تُنتِج نصّا، ثمّ يجري ما يجري على كلّ نصّ** (D-124).
 *
 * ## ولماذا خطوةٌ قبل التحليل لا تحليلٌ ثانٍ
 *
 * ملفُّ Drive الذي صورةٌ كان يُردّ: «صورة — لا نص فيها تُقرأ منه». **وعرضٌ
 * مصوَّرٌ أو مخطّطٌ أو PDF ممسوحٌ يحمل ما يستحقّ النشر** ولا سبيلَ إليه.
 *
 * **فتُقرأ الصورةُ نصّا هنا، ثمّ تمضي في المسار نفسِه**: التحليلُ يقرّر
 * جدواها، والمسوّدةُ تُكتب منها، والحكمُ يبقى عند نموذج التحليل — **ولا
 * يُبنى مسارٌ ثانٍ يشيخ وحدَه**.
 *
 * ## واللهجةُ واحدة
 *
 * الرؤيةُ في `chat/completions` ليست نهايةً أخرى: `content` يصير مصفوفةَ
 * أجزاءٍ فيها `image_url`. **فالسائقُ هو `openaiCompat` نفسُه**، وهذا
 * الملفُّ وصفٌ ونداءٌ وتسجيلُ كلفةٍ لا سائقٌ ثالث.
 *
 * ## ولا يُدَّعى وصفٌ لم يقع
 *
 * ردٌّ فارغٌ أو قصيرٌ جدّا **يُردّ عطلا**، ولا يُمرَّر إلى التحليل: نصٌّ
 * من كلمتين يجعل التحليلَ يحكم على الفراغ **وينفق ثمنَ حكمه**.
 */
import { chatCompletion, CompatError } from '../ai/openaiCompat'

/** أقصرُ وصفٍ يُعَدّ وصفا — وما دونه ردٌّ لا قراءة. */
export const MIN_DESCRIPTION = 40

export interface VisionDeps {
  readonly baseUrl: string
  readonly apiKey: string
  readonly model: string
  readonly fetchImpl?: typeof fetch
}

export interface VisionResult {
  readonly text: string
  readonly model: string
  readonly inputTokens: number
  readonly outputTokens: number
}

/**
 * **والوصفُ يُطلَب نصّا لا حكما.**
 *
 * فلو سُئل «أيستحقّ النشر؟» لصار الحكمُ عند نموذجِ رؤيةٍ رخيصٍ اختاره
 * المالكُ للقراءة لا للتقدير — **والحكمُ عند نموذج التحليل** (D-058).
 */
const SYSTEM = [
  'أنت تقرأ صورةً وتصفها نصّا عربيّا دقيقا.',
  'اكتب ما تراه: النصوصَ المكتوبةَ فيها حرفا بحرف، والأرقامَ، وما تصوّره.',
  'ولا تحكم على قيمتها ولا تقترح نشرا — الوصفُ وحدَه.',
  'وإن كانت الصورةُ عرضا أو مخطّطا فاذكر بنيتَه وعناوينَه.',
].join(' ')

export async function describeImage(
  deps: VisionDeps,
  dataUrl: string,
  name: string,
): Promise<VisionResult> {
  if (deps.apiKey.trim().length === 0) {
    throw new CompatError('لا مفتاح لمزوّد الرؤية', 503, false)
  }

  const result = await chatCompletion(
    {
      baseUrl: deps.baseUrl,
      apiKey: deps.apiKey,
      model: deps.model,
      system: SYSTEM,
      user: `اسمُ الملفّ: ${name}\n\nصِف هذه الصورة.`,
      imageUrl: dataUrl,
      maxTokens: 2048,
    },
    deps.fetchImpl ?? fetch,
  )

  const text = result.text.trim()
  if (text.length < MIN_DESCRIPTION) {
    /*
     * **ولا يُمرَّر فراغٌ إلى التحليل.**
     *
     * نصٌّ من كلمتين يجعل التحليلَ يحكم على الفراغ **وينفق ثمنَ حكمه**،
     * ثمّ يُكتب في `content_items` فهمٌ يصف لا شيء.
     *
     * **ويُعاد** (`retryable`): نموذجُ رؤيةٍ يردّ قصيرا مرّةً قد يطيل
     * في الثانية — بخلاف مفتاحٍ مرفوض.
     */
    throw new CompatError(
      `لم تُقرأ الصورة — ردَّ المزوّدُ ${text.length} محرفا فقط`,
      502,
      true,
    )
  }

  return {
    text,
    model: result.model,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
  }
}

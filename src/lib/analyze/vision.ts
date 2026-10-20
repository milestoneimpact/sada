/**
 * قراءة الصورة — تُنتج نصّا، ثمّ يجري عليه ما يجري على كلّ نصّ (D-243).
 *
 * ملفّ Drive الذي صورة كان يُردّ «لا نصّ فيها»، وعرض مصوَّر أو مخطّط يحمل ما
 * يستحقّ النشر. فتُقرأ هنا وصفا، ثمّ يمضي الوصف في المسار نفسه: التحليل يقرّر
 * جدواه، والحكم يبقى عند نموذج التحليل (D-058) لا عند قارئ الصور.
 *
 * والسائق `openaiCompat` نفسه: هذا الملفّ وصف ونداء، لا سائق ثالث.
 */
import { chatCompletion, CompatError } from '../ai/openaiCompat'
import type { Spent } from '../ai/spent'

/** أقصر وصف يُعدّ وصفا — وما دونه ردّ لا قراءة. */
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

/** الوصف يُطلب نصّا لا حكما: «أيستحقّ النشر؟» سؤال نموذج التحليل. */
const SYSTEM = [
  'أنت تقرأ صورة وتصفها نصّا عربيّا دقيقا.',
  'اكتب ما تراه: النصوص المكتوبة فيها حرفا بحرف، والأرقام، وما تصوّره.',
  'ولا تحكم على قيمتها ولا تقترح نشرا — الوصف وحده.',
  'وإن كانت الصورة عرضا أو مخطّطا فاذكر بنيته وعناوينه.',
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
      user: `اسم الملفّ: ${name}\n\nصِف هذه الصورة.`,
      imageUrl: dataUrl,
      maxTokens: 2048,
    },
    deps.fetchImpl ?? fetch,
  )

  const text = result.text.trim()
  if (text.length < MIN_DESCRIPTION) {
    /*
     * ولا يُمرَّر فراغ إلى التحليل: نصّ من كلمتين يجعله يحكم على لا شيء وينفق
     * ثمن حكمه. ويُعاد (`retryable`)، فنموذج يقصّر مرّة قد يطيل في الثانية.
     * والجواب وصل وحوسِب عليه، فيحمل استهلاكه ليُسجَّل (D-164).
     */
    const spent: Spent = { ...result.usage, cachedInputTokens: 0, model: result.model }
    throw new CompatError(`لم تُقرأ الصورة — ردّ المزوّد ${text.length} محرفا فقط`, 502, true, spent)
  }

  return {
    text,
    model: result.model,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
  }
}

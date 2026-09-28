/**
 * ما استُهلك في جوابٍ **وصل ثمّ رُدّ** — يُسجَّل ولا يُهمَل (D-008، D-164).
 *
 * ## الثغرة
 *
 * جوابٌ بـ2xx مبتورٌ عند سقف الطول، أو مرفوضٌ لسياسة المحتوى، أو فارغ —
 * **وقع وحوسِب عليه**. وكان السائقان يرميان خطأً بلا استهلاكه، والمنادي
 * يعود `failed` في الـcatch **قبل خطوة الكلفة**. فنداءٌ مدفوعٌ لا يراه
 * الدفتر، وسقفُ الإنفاق يُقاس على دفترٍ أقلَّ من الحقيقة — وهو أسوأ
 * الاتّجاهين في D-008.
 *
 * ## والمعالجة
 *
 * الخطأ يحمل استهلاكَه حين وُجد، والمنادي يسأل هنا قبل أن يعود بالفشل.
 * **وما لم يصل لا استهلاكَ فيه يُقرأ**: الشبكةُ والرمزُ غيرُ الناجح يرميان
 * بلا `spent`، فلا صفّ — لا تقديرٌ يُخترَع لطلبٍ لا نعرف ما كلّف.
 */
import { AnthropicError } from './anthropic'
import { CompatError } from './openaiCompat'

/** بأسماء `AnthropicResult` نفسها، فيُنشَر فيه بلا ترجمة. */
export interface Spent {
  readonly inputTokens: number
  readonly outputTokens: number
  readonly cachedInputTokens: number
  readonly model: string
}

/** استهلاكُ خطأٍ من أحد السائقين، أو `null` حين لم يصل جواب. */
export function spentOf(error: unknown): Spent | null {
  if (error instanceof CompatError || error instanceof AnthropicError) return error.spent ?? null
  return null
}

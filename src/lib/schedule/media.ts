/**
 * ما يحتاجه المنشورُ من وسيطٍ قبل أن يُجدوَل — **أو `null`**.
 *
 * ## العلّة المقيسة
 *
 * مسوّدةُ TikTok من مصدر: «اعتمد» ثمّ «غدا 9ص» ثمّ «جدوِل»، فقال الإشعار «✓ جُدولت»
 * وصارت البطاقةُ «مجدولة» — **ولا وسيطَ للمنشور**. والناشرُ يعرف ذلك من قبل: يردّه
 * عند موعده بـ `no_clip`. فالشاشةُ تقول «سيُنشَر» والنظامُ يعرف أنّه لن يُنشَر.
 *
 * ## والقاعدةُ قاعدةُ الناشر نفسُها
 *
 * `publisher.ts` يختار الوسيطَ الجاهزَ لمنصّات المقاطع بـ `video/%`، ولـ Instagram
 * أيَّ وسيطٍ جاهز (صورةً أو مقطعًا)، ويردّ ما لم يجده. **فيُسأل هنا السؤالُ نفسُه
 * بالمنصّات نفسِها** (`CLIP_PLATFORMS`) قبل الجدولة لا عند الموعد. والدالّةُ خالصة:
 * `schedulePost` تمرّر لها ما في القاعدة، وبطاقةُ المنشور ما حمّلته اللوحة — فيقولان
 * الجملةَ نفسَها.
 */
import { CLIP_PLATFORMS } from '../platform/needs'
import { platformLabel } from '../oauth/providers'

/**
 * @param mimes أنواعُ الوسائط **الجاهزة** لهذا المنشور (`media.status = 'ready'`).
 */
export function missingMedia(platform: string, mimes: readonly string[]): string | null {
  if (CLIP_PLATFORMS.has(platform) && !mimes.some((m) => m.startsWith('video/'))) {
    return `${platformLabel(platform)} تحتاج مقطعًا: ولّد صورةً ثمّ «حرّكها فيديو»، أو ارفع مقطعًا في «فيديوهاتك»`
  }
  if (platform === 'instagram' && mimes.length === 0) {
    return 'Instagram تحتاج صورةً أو مقطعًا: ولّد صورةً لهذا المنشور، أو ارفع مقطعًا في «فيديوهاتك»'
  }
  return null
}

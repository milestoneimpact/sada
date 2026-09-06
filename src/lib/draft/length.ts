/**
 * طولُ المنشور **كما تحسبه المنصّة**، لا كما تحسبه JavaScript.
 *
 * ## لماذا لا يكفي `text.length`
 *
 * X **لا تعدّ المحارف**. تعدّ «الطولَ الموزون»: كلُّ رابطٍ يُستبدَل بـ
 * `t.co` **بطولٍ ثابت**، وما فوق نطاقاتٍ بعينها يُعدّ محرفين، والرمزُ
 * التعبيريُّ الواحد يُعدّ محرفين **مهما بلغ عددُ نقاطه**.
 *
 * فمنشورٌ بمئتين وستّين محرفا عربيّا **ورابطٍ من أربعين** يُعدّ عندنا
 * ثلاثمئة — فيُرفض — **وتعدّه X مئتين وثلاثة وثمانين**… ثمّ ترفضه هي
 * أيضا. ومنشورٌ بمئتين وأربعين ورابطٍ من ستّين يُعدّ عندنا ثلاثمئة
 * فيُرفض، **وتقبله X بمئتين وثلاثة وستّين**.
 *
 * **والرفضُ يقع بعد أن تُدفَع كلفةُ النموذج** (D-008: النداءُ وقع
 * فيُحاسَب) — فمسوّدةٌ صالحةٌ تُرمى وقد دُفع ثمنُها.
 *
 * ## والقيمُ من مصدرها لا من الذاكرة
 *
 * مقروءةٌ من `twitter-text@3.1.0` — مكتبةُ X نفسِها، وملفُّ إعدادها
 * مولَّدٌ من مصدرِ حسابها (`configs.js` · `version3`):
 *
 *     maxWeightedTweetLength: 280
 *     transformedURLLength:    23
 *     scale: 100 · defaultWeight: 200        ← أي محرفان
 *     ranges (weight 100 = محرف):
 *       0–4351 · 8192–8205 · 8208–8223 · 8242–8247
 *
 * **والعربيّةُ داخل ٠–٤٣٥١** (‏U+0600–U+06FF) فتُعدّ محرفا محرفا.
 * **وأشكالُ العربيّة التقديميّة خارجَها** (‏U+FB50 فما فوق) فتُعدّ
 * محرفين — وهي تأتي من لصقِ مستنداتٍ قديمة.
 *
 * ## واتّجاهُ الخطأ ليس متماثلا
 *
 * | لو | لوقع |
 * |---|---|
 * | **عددنا أقلَّ من X** | نقبل ما ترفضه — **بعد الكلفة وبعد الطابور** |
 * | عددنا أكثرَ من X | نرفض ما تقبله — خسارةُ مسوّدةٍ وحسب |
 *
 * فحين لا نتيقّن **نعدّ أكثر**: الروابطُ المختصَرةُ هنا هي الموسومةُ
 * بمخطّطها (`http://` و `https://`) وحدَها. و X تختصر كذلك `www.` والنطاقَ
 * المجرَّد — **ولا تُختصَر هنا**، لأنّ تمييزَها يحتاج قائمةَ نطاقاتِ X
 * العليا، وخطأً فيها يقع في الاتّجاه الخطر.
 *
 * ## ولا يُخلَط هذا بـ `containsUrl`
 *
 * تلك تُسأل **للكلفة** (D-003)، **واحتياطُها في الاتّجاه المعاكس**:
 * عدُّ ما ليس رابطا رابطا يُظهر ثمنا أعلى قبل الاعتماد — وهو أرحم.
 * **فنمطٌ واحدٌ يخدم السؤالين يخطئ في أحدهما حتما.**
 */
import type { Platform } from './prompt'

/** طولُ `t.co` — `twitter-text@3.1.0 · version3.transformedURLLength`. */
export const X_URL_LENGTH = 23

/** وزنُ ما خرج عن النطاقات الخفيفة — `defaultWeight: 200 / scale: 100`. */
export const X_HEAVY = 2

/** نطاقاتُ الوزن الواحد — `version3.ranges` بأوزانها `100`. */
export const X_LIGHT_RANGES: readonly (readonly [number, number])[] = [
  [0, 4351],
  [8192, 8205],
  [8208, 8223],
  [8242, 8247],
]

/**
 * روابطُ X المختصَرة — **الموسومةُ بمخطّطها وحدَها** (انظر أعلاه).
 *
 * والحدُّ ما ليس فراغا: X تنهي الرابطَ عند أوّل فراغ.
 */
const SCHEMED_URL = /https?:\/\/\S+/gu

/**
 * الرموزُ التعبيريّة — العَلَمُ حرفان إقليميّان، والعائلةُ سلسلةٌ
 * موصولةٌ بـ ZWJ. **وكلُّها واحدةٌ تُعدّ محرفين** (`emojiParsingEnabled`).
 */
const EMOJI =
  /\p{RI}\p{RI}|\p{Extended_Pictographic}(?:️?(?:‍\p{Extended_Pictographic}️?)*)/gu

function weightOf(codePoint: number): number {
  for (const [start, end] of X_LIGHT_RANGES) {
    if (codePoint >= start && codePoint <= end) return 1
  }
  return X_HEAVY
}

/** الطولُ الموزون عند X. */
export function xWeightedLength(text: string): number {
  let total = 0

  // ١ · الروابطُ تُنتزَع أوّلا ويُحسَب لكلٍّ طولُه الثابت
  let rest = ''
  let last = 0
  for (const m of text.matchAll(SCHEMED_URL)) {
    rest += text.slice(last, m.index)
    total += X_URL_LENGTH
    last = m.index + m[0].length
  }
  rest += text.slice(last)

  // ٢ · ثمّ الرموزُ التعبيريّة: **الواحدةُ محرفان مهما طالت نقاطُها**
  let plain = ''
  last = 0
  for (const m of rest.matchAll(EMOJI)) {
    plain += rest.slice(last, m.index)
    total += X_HEAVY
    last = m.index + m[0].length
  }
  plain += rest.slice(last)

  // ٣ · وما بقي بنقاطه لا بوحدات UTF-16
  for (const ch of plain) total += weightOf(ch.codePointAt(0) ?? 0)
  return total
}

/**
 * الطولُ الذي يُقاس عليه الحدُّ — لكلّ منصّةٍ حسابُها.
 *
 * **و LinkedIn تُترَك على عدّ المحارف**: حدُّها ثلاثةُ آلاف، **ولم أجد
 * لها قاعدةَ وزنٍ منشورةً كقاعدة X** — فلا تُخترَع. وهي تُطابق العربيّةَ
 * على كلّ حال: كلُّ حرفٍ عربيٍّ وحدةُ UTF-16 واحدة.
 */
export function postLength(text: string, platform: Platform): number {
  return platform === 'x' ? xWeightedLength(text) : text.length
}

/**
 * ‏نصُّ منشور LinkedIn بصيغة «little» (D-324) — **ما يكتبه المالكُ يصل كما كتبه**.
 *
 * ## ما كان
 *
 * ‏`commentary` في Posts API ليس نصًّا خامًّا: LinkedIn تقرؤه بلغةٍ صغيرة («little»)، فما بين `@[` و`](urn…)` إشارةٌ إلى
 * ‏شخص، و`#كلمة` وسم، و`{hashtag|#|…}` قالب. **وكان النصُّ يُرسَل كما هو**، فقوسٌ في جملةٍ عربيّة — وهي كثيرةُ الأقواس،
 * ‏وكذلك ما يكتبه النموذج — يُقرأ بدايةَ عنصرٍ لم يُغلَق، **والمبلَّغُ عنه على نطاقٍ واسع أنّ المنشور يُقَصّ عنده**: يخرج
 * ‏نصفُ ما اعتمده المالك، ولا شيءَ في صدى يقول ذلك.
 *
 * ## ما صار — من الوثيقة لا من الذاكرة
 *
 * ‏learn.microsoft.com/linkedin/marketing/community-management/shares/little-text-format (li-lms-2026-10، قُرئت 2026-11-06):
 *
 * ‏- «All reserved characters need to be escaped with a backslash, even if those characters are not used in one of the
 * ‏  supported elements or templates». والمحجوزُ في قاعدة `Text`: ‎`| { } @ [ ] ( ) < > # \ * _ ~`‎.
 * ‏- والوسمُ بالقالب الموثَّق ‎`{hashtag|\#|tag}`‎ (مثالُهم في الوثيقة نفسِها، بالعلامة مهرَّبةً).
 *
 * ‏فكلُّ محجوزٍ يُهرَّب، **والوسمُ وحدَه يُبنى**: `#` في أوّل النصّ أو بعد فراغٍ وبعدها كلمةٌ فيها حرف. وما سوى ذلك (`C#`،
 * ‏و«البند ‎#3‎»، و`#` وحدها) يُهرَّب نصًّا. **والرابطُ يُهرَّب محرفًا محرفًا ولا يُقرأ ما فيه وسمًا**: ‎`/#part`‎ جزءٌ من عنوان.
 * ‏ولا إشارةَ إلى أشخاص في صدى، فـ`@` نصٌّ دائمًا.
 *
 * ## وما لم يُقَس
 *
 * ‏لم يُجرَّب حيًّا بعد: أيقرأ LinkedIn الحدَّ ‏3000 على النصّ قبل التهريب أم بعده، وأيُرى الوسمُ رابطًا. وهو مهمّةُ المالك M-41.
 */

/** المحجوزُ في قاعدة `Text` من الوثيقة — والشرطةُ المائلةُ نفسُها أوّلُها. */
const RESERVED = /[\\|{}@[\]()<>#*_~]/gu

/** يهرّب كلَّ محجوزٍ بشرطةٍ مائلةٍ قبله — نصٌّ يُقرأ نصًّا لا عنصرًا. */
export function escapeLittle(text: string): string {
  return text.replace(RESERVED, (c) => `\\${c}`)
}

/**
 * ‏قطعُ النصّ: رابطٌ (بمخطّطه أو بـ`www.`) يمتدّ إلى أوّل فراغ، أو وسمٌ مرشَّح، أو محرفٌ محجوز.
 * ‏والوسمُ كلمةٌ من حروفٍ وعلاماتٍ وأرقامٍ وشرطةٍ سفليّة — كما يقرؤها LinkedIn كلمةً واحدة.
 */
const PIECES = /(https?:\/\/\S+|www\.\S+)|#([\p{L}\p{M}\p{N}_]+)|([\\|{}@[\]()<>#*_~])/giu

/** نصُّ المنشور كما يُرسَل في `commentary`. */
export function littleText(text: string): string {
  let out = ''
  let last = 0
  for (const m of text.matchAll(PIECES)) {
    const at = m.index
    out += text.slice(last, at)
    last = at + m[0].length
    const [whole, url, tag] = m
    if (url !== undefined) {
      out += escapeLittle(url)
      continue
    }
    if (tag !== undefined) {
      // ‏وسمٌ إن بدأ النصُّ به أو سبقه فراغ، وفيه حرفٌ لا أرقامٌ وحدها — وإلّا فنصٌّ يُهرَّب
      const lead = at === 0 || /\s/u.test(text[at - 1]!)
      out += lead && /\p{L}/u.test(tag) ? `{hashtag|\\#|${escapeLittle(tag)}}` : escapeLittle(whole)
      continue
    }
    out += `\\${whole}`
  }
  return out + text.slice(last)
}

/**
 * الشريحة — **الصورةُ والنصُّ العربيُّ فوقها** (D-085).
 *
 * ## لماذا فوقها لا فيها
 *
 * **لا نموذجَ توليدٍ يكتب عربيّةً صحيحةَ الوصل.** يخرج حروفا منفصلةً
 * حيث يجب أن تتّصل، وأشكالا تشبه الحروف ولا تُقرأ. وصورةٌ فيها خربشةٌ
 * تشبه العربيّة تخرج باسم المالك فتُقرأ إهمالا لا فنّا — فبقي القيدُ
 * «لا حرفَ في الصورة» على حاله (D-083).
 *
 * **والوصلُ عملُ مُشكِّلِ خطوطٍ لا عملُ مولّد صور.** ومتصفّحٌ يحمله:
 * فتُبنى صفحةٌ ويُصوَّر ما رسمه. وهذا ما تفعله هذه الوحدة — تبني
 * الصفحةَ فقط، **ولا تنادي أحدا**: نصٌّ محضٌ من مدخلاتٍ محضة، يُختبَر
 * بلا شبكةٍ ويُعايَن بلا حساب.
 *
 * ## وكلُّ ما فيها مضمَّن
 *
 * لا خطٌّ من شبكة، ولا صورةٌ من رابط، ولا سكربت. **وموردٌ خارجيٌّ واحدٌ
 * يعني نقطةَ فشلٍ ثالثةً وتسريبَ أنّ صورةً تُبنى الآن** إلى من يستضيفه.
 * فالخطُّ `base64` في الحزمة، والصورةُ `data:` في الوسم.
 *
 * ## والنصُّ كلمتان أو ثلاث
 *
 * سطرٌ طويلٌ فوق صورةٍ لا يُقرأ — يُقرأ المنشورُ نفسُه. **والعنوانُ
 * يُوقِف العين، لا يشرح**: كلمتان بوزنٍ ثقيل، وفوقهما كلمتان
 * إنجليزيّتان متباعدتا الحروف. وما زاد على ذلك يُقصّ هنا لا في الشاشة.
 */
import { FONT_FACE_CSS, SLIDE_FONT } from './font'
import type { Platform } from '../draft/prompt'

/**
 * مقاسُ كلّ منصّة — **ويقابل `ASPECT` في `prompt.ts`**.
 *
 * ولا يُترَك للمتصفّح أن يقصّ: المقاسُ يُطلَب من المولّد ويُفرَض هنا،
 * فما خالف النسبةَ يُملأ `cover` ولا يُشوَّه.
 */
export const SLIDE_SIZE: Readonly<Record<Platform, { width: number; height: number }>> = {
  // 1.91:1 — ما يعرضه LinkedIn بلا قصّ
  linkedin: { width: 1200, height: 628 },
  // 16:9
  x: { width: 1200, height: 675 },
  // 9:16 — والمقطعُ يُشتقّ منها، وهي مقاسُ Shorts و Reels و TikTok معا
  tiktok: { width: 1080, height: 1920 },
  youtube: { width: 1080, height: 1920 },
  // 4:5 — مقاسُ Instagram بلا قصّ (D-282)
  instagram: { width: 1080, height: 1350 },
}

/** أقصى ما يُقبَل في العنوان والفوقيّة — والقصُّ هنا لا في الشاشة. */
export const HEADLINE_MAX = 42
export const KICKER_MAX = 24

/**
 * سببُ السقوط حين يُطفئ المالكُ التركيب — **وهو وحدَه ليس عطلا** (D-162).
 *
 * بطاقةُ الإعدادات تقول «مطفأ: تخرج الصورةُ نظيفةً بلا عنوان. وهذا ليس
 * عطلا». وسطرُ البطاقة تحت الصورة يقرأ السببَ المحفوظ في `media.note`،
 * فإن رسمه تحذيرًا أصفرَ كذّب الإعدادات. **فالنصُّ يُسمّى مرّةً** ويُطابَق
 * به هناك، لا يُنسَخ حرفًا فيفترق عند أوّل تصحيح.
 *
 * **ويُعرَف بذيل السبب**، و`noteOf` تضمن أن يبقى الذيلَ كاملًا مهما طال ما
 * قبله. **ولفظُه عهدٌ مع الصفوف المحفوظة**: تغييرُه يجعل كلَّ صورةٍ أُطفئ
 * تركيبُها قبله تُقرأ تحذيرًا — فإن لزم فمعه ترحيلٌ يُبدّل اللفظَ في `media.note`.
 *
 * وهنا لا في `job.ts`: الواجهةُ تقرؤه، واستيرادُ المهمّة يجرّ سائقيها معه.
 */
export const OVERLAY_OFF = 'تركيب النصّ مُطفأ من الإعدادات'

export interface SlideInput {
  /** بايتاتُ الصورة المولَّدة — تُضمَّن `data:`، ولا تُطلَب من رابط. */
  readonly imageBase64: string
  readonly imageMime: string
  /** العنوانُ العربيّ — كلمتان أو ثلاث. */
  readonly headline: string
  /** فوقيّةٌ إنجليزيّة — كلمتان. وتُترَك فارغةً فتُحذَف كتلتُها. */
  readonly kicker?: string
  readonly platform: Platform
}

/** الهويّةُ في الظلام — القيمُ نفسُها التي في `tokens.ts` للثيم الداكن. */
const INK = '#e8f1eb'
const GOLD = '#d1b473'
const BRAND = '#82c69e'
const GROUND = '#050f09'

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** يقصّ بلا بتر كلمةٍ في نصفها — والقصُّ عند فراغٍ أو لا يقع. */
export function clip(value: string, max: number): string {
  const text = value.trim().replace(/\s+/g, ' ')
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const space = cut.lastIndexOf(' ')
  return (space > max / 2 ? cut.slice(0, space) : cut).trim()
}

/**
 * يبني صفحةَ الشريحة.
 *
 * **والقياساتُ بالبكسل لا بالنِّسَب**: اللقطةُ بمقاسٍ ثابتٍ معلوم، ووحدةٌ
 * نسبيّةٌ تجعل الحجمَ يتبع نافذةً قد تختلف عند المصوِّر.
 */
export function slideHtml(input: SlideInput): string {
  const size = SLIDE_SIZE[input.platform]
  const headline = escapeHtml(clip(input.headline, HEADLINE_MAX))
  const kicker = escapeHtml(clip(input.kicker ?? '', KICKER_MAX))

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8">
<style>
${FONT_FACE_CSS}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${size.width}px;height:${size.height}px;overflow:hidden;background:${GROUND}}
.s{position:relative;width:${size.width}px;height:${size.height}px;
  font-family:'${SLIDE_FONT}',system-ui,sans-serif}
/* الصورةُ تملأ ولا تُشوَّه: cover يقصّ ولا يمطّ */
.s img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
/* حجابٌ من جهة النصّ — ونصٌّ على صورةٍ بلا حجابٍ يُقرأ أحيانا ولا يُقرأ
   أحيانا، تبعا لما رسمه النموذج. والحجاب يجعله يُقرأ دائما */
.v{position:absolute;inset:0;
  background:linear-gradient(270deg,${GROUND}f2 0%,${GROUND}e0 34%,${GROUND}66 62%,transparent 88%)}
.t{position:absolute;inset-block:0;inset-inline-start:0;width:66%;
  display:flex;flex-direction:column;justify-content:center;
  padding:0 ${Math.round(size.width * 0.055)}px}
/* الفوقيّةُ لاتينيّةٌ في كتلةٍ عربيّة: **تُعزَل ولا يُقلَب اتّجاهُها
   بالكتلة**. و«unicode-bidi: isolate» تجعل حروفَها تُقرأ يسارا-يمينا
   وموضعَها يتبع الكتلة — فتحاذي العنوان على الحافّة نفسِها. وبلا
   العزل تنجرف إلى الحافّة المقابلة، فيبدو السطران كتلتين لا كتلة */
.k{font-weight:600;font-size:22px;letter-spacing:5px;text-transform:uppercase;
  color:${BRAND};unicode-bidi:isolate;margin-bottom:16px}
/* خيطُ الهويّة: يفصل الفوقيّةَ عن العنوان بلا سطرٍ فارغ */
.r{width:64px;height:3px;background:${GOLD};margin-bottom:22px;border-radius:2px}
.h{font-weight:700;font-size:${Math.round(size.height * 0.115)}px;line-height:1.35;
  color:${INK};text-shadow:0 2px 18px ${GROUND}cc;
  /* توازنُ الأسطر: كلمتان لا تُكسران كسرا أعرجَ */
  text-wrap:balance}
/* حدٌّ سفليٌّ ذهبيٌّ رفيع — علامةُ الهويّة بلا شعارٍ يُدَّعى */
.b{position:absolute;inset-inline:0;bottom:0;height:5px;
  background:linear-gradient(270deg,${GOLD},${BRAND} 60%,transparent)}
</style></head>
<body><div class="s">
  <img src="data:${escapeHtml(input.imageMime)};base64,${input.imageBase64}" alt="">
  <div class="v"></div>
  <div class="t">
    ${kicker === '' ? '' : `<div class="k">${kicker}</div>`}
    <div class="r"></div>
    <div class="h">${headline}</div>
  </div>
  <div class="b"></div>
</div></body></html>`
}

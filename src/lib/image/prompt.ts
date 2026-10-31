/**
 * وصفُ توليد الصورة.
 *
 * ## لماذا هو بالإنجليزيّة كلُّه (D-083)
 *
 * كان بالعربيّة: الأسلوبُ والقيدُ والموضوع. **ونماذجُ الصور إنجليزيّةُ
 * اللسان** — مُرمِّزُ النصّ فيها مدرَّبٌ على وصفٍ إنجليزيّ ساحق. فوصفٌ
 * عربيٌّ **يُقرأ ضجيجا لا معنى**: تخرج الصورةُ في الأسلوب المطلوب
 * تقريبا، **ولا علاقةَ لها بالموضوع**.
 *
 * وهو ما رآه المالكُ حرفا: «الصورُ المولَّدة لا تتعلّق بالنصّ المولَّد،
 * لا يوجد أيُّ ربط».
 *
 * **والقيدُ العربيُّ كان أسوأَ من عديم الأثر**: «لا حرفَ في الصورة»
 * مكتوبةً بالعربيّة قد تُقرأ عند النموذج **طلبا لحروفٍ عربيّة** — فيرسم
 * خربشةً تشبهها. فالمنعُ يُكتب بلسانٍ يفهمه المانَع.
 *
 * ## ولماذا «لا حرفَ في الصورة» باقٍ
 *
 * نماذجُ التوليد ترسم الحروفَ العربيّة **مشوّهةً**: أشكالٌ تشبه الحروف
 * ولا تُقرأ، وحروفٌ منفصلةٌ حيث يجب أن تتّصل. وصورةٌ فيها خربشةٌ تشبه
 * العربيّة تخرج باسم المالك فتُقرأ إهمالا لا فنّا.
 *
 * **والنصُّ العربيُّ يُركَّب فوق الصورة عندنا لا فيها** — وذاك بابٌ لم
 * يُبنَ بعد: تركيبُ عربيّةٍ صحيحةِ الوصل يحتاج مُشكِّلَ خطوطٍ حقيقيّا،
 * ولا يجري في Worker بلا خدمةٍ تُشترى. **فيبقى موسوما ولا يُدَّعى.**
 *
 * ## وأسلوبٌ واحدٌ عبر المنشورات
 *
 * صورةٌ بكلّ أسلوبٍ في كلّ منشور تجعل الحسابَ يبدو مجمَّعا من مصادر.
 * فيُثبَّت الأسلوب في الوصف الحاكم، ويتبدّل الموضوعُ وحده.
 */
import type { Platform } from '../draft/prompt'
import type { VisualBrief } from './brief'

/** نسبةُ كلّ منصّة — تُطلب في الوصف، ويُقصّ الناتج إن خالفها لاحقا. */
export const ASPECT: Readonly<Record<Platform, string>> = {
  // و TikTok رأسيّةٌ خالصة — والصورةُ هنا مصدرُ المقطع لا منشورٌ بذاتها
  tiktok: '9:16 vertical portrait',
  // و Shorts رأسيّةٌ كذلك — والمقاسُ واحد
  youtube: '9:16 vertical portrait',
  linkedin: '1.91:1 wide landscape',
  x: '16:9 landscape',
  // و Instagram رأسيّةٌ 4:5 — ما تعرضه بلا قصّ (D-282)
  instagram: '4:5 vertical portrait',
}

/**
 * الأسلوبُ الثابت — يُبدَّل في موضعٍ واحدٍ فيتبدّل كلُّ ما بعده.
 *
 * وهو مجرّدٌ عمدا: صورةٌ فيها وجوهٌ أو شعاراتٌ أو أماكنُ بعينها تدّعي
 * واقعا لم يقع، ومنشورٌ مهنيٌّ لا يحتاج أن يدّعي.
 */
const STYLE = [
  'Abstract editorial illustration: geometric forms, gradients, fine texture.',
  'Muted limited palette — two or three colours, with a restrained teal accent.',
  'Directional light with defined shadows and a full tonal range.',
  // «ناعمٌ بلا تباين» مع أربع خطوات انتشارٍ أخرج لوحا رماديّا شبهَ فارغ
  'Never washed out, never a blank or near-empty canvas.',
  'No faces, no recognisable people, no brand logos.',
  'No office cliches: no handshakes, no rising bar charts, no lightbulbs.',
].join('\n')

/**
 * القيدُ الحاكم — **أوّلُ ما يُقرأ وآخرُ ما يُقرأ**.
 *
 * ونماذجُ الانتشار تُرجّح أوائلَ الوصف وأواخرَه، والوسطُ يُبهَت. فقيدٌ في
 * الوسط وحده يسقط — **وقد كان في الوسط**.
 */
const NO_TEXT = [
  'ABSOLUTELY NO text, letters, words, numbers, captions, watermarks or',
  'signage anywhere in the image — no Arabic script, no Latin script,',
  'nothing that resembles writing.',
].join('\n')

/**
 * التكوينُ واللونُ حين يسقط الموجز — **ويقرؤهما `brief.ts` كذلك** حين يأتي
 * الموجزُ بلا أحدهما، فلا نسختان تفترقان.
 *
 * و«مساحةٌ فارغةٌ سخيّة» كانت هنا، **والنموذجُ أطاعها حرفيّا**: صورةٌ كلُّها
 * فراغ. فالتكوينُ الآن يطلب الملءَ صراحةً.
 */
export const FALLBACK_COMPOSITION =
  'One clear focal subject filling most of the frame, with distinct foreground and background; no large empty areas.'
export const FALLBACK_PALETTE =
  'Deep ink navy and warm sand with a restrained teal accent, rich shadows and bright highlights.'

export interface ImageBrief {
  /** موضوعُ المنشور — يُستعمَل حين يسقط الموجزُ البصريّ. */
  readonly topic: string
  readonly platform: Platform
  /** الموجزُ البصريُّ الإنجليزيّ إن وُلّد — وهو ما يربط الصورةَ بالنصّ. */
  readonly visual?: VisualBrief | null
}

export function imagePrompt(brief: ImageBrief): string {
  const visual = brief.visual ?? null
  return [
    NO_TEXT,
    '',
    '# Subject',
    '',
    visual === null
      // احتياطُ السقوط: الموضوعُ العربيُّ كما هو. **وأضعفُ ربطا بالضرورة**
      // — ويُقال ذلك للنموذج بدل أن يُترَك يخمّن
      /*
       * **وموضوعٌ مرسومٌ لا موضوعٌ موصوف**: «صورةٌ مجرّدةٌ تصاحب منشورا»
       * مع نصٍّ عربيٍّ لا يقرؤه النموذج أخرجت على staging لوحا رماديّا شبهَ
       * فارغ. فيُعطى مشهدا ملموسا يُرسَم، والنصُّ سياقٌ لا أكثر.
       */
      ? `A tactile still life of layered paper-cut geometric forms — arcs, stacked planes\n` +
        `and a single sphere — arranged as one clear focal point, lit from the side.\n` +
        `The post (Arabic, for context only — do not render it): ${brief.topic}`
      : visual.subject,
    '',
    '# Composition',
    '',
    visual === null ? FALLBACK_COMPOSITION : visual.composition,
    '',
    '# Colour and light',
    '',
    visual === null ? FALLBACK_PALETTE : visual.palette,
    '',
    '# Style',
    '',
    STYLE,
    '',
    '# Format',
    '',
    ASPECT[brief.platform],
    '',
    NO_TEXT,
  ].join('\n')
}

/**
 * موضوعُ المنشور من نصّه — أوّلُ جملةٍ لا النصُّ كلُّه.
 *
 * ونموذجٌ يُعطى ألفَ محرفٍ يرسم كلَّ ما فيها فتخرج صورةٌ مزدحمة. والجملةُ
 * الأولى في منشورٍ مكتوبٍ جيّدا **تحمل فكرتَه** — وذاك ما نريد رسمه.
 *
 * **وهي احتياطٌ الآن لا أصل**: الأصلُ الموجزُ البصريّ من `brief.ts`.
 */
export function topicOf(text: string): string {
  const first = text
    .trim()
    .split(/[\n.؟!]/)
    .map((s) => s.trim())
    .find((s) => s.length > 20)
  return (first ?? text.trim()).slice(0, 220)
}

/**
 * مراجعةُ الكلمات — **ما يُقاس فعلا، لا عددُ المحارف** (D-090).
 *
 * ## العلّة المقيسة
 *
 * قال المالك: «ولا تعتمد على عدد حروفٍ معيّنة، يجب أن تكون متغيّرة،
 * ومراجعةٌ للكلمات».
 *
 * وكان في الوصف الحاكم رقمان مخترعان: «في حدود ١١٠٠ إلى ١٤٠٠ محرف»
 * و«٢٢٠ إلى ٢٦٠ محرفا». **ورقمٌ يُملى على النموذج يُملأ**: يكتب ليبلغ
 * العدّاد لا ليقول شيئا — فتُحشى الفقرةُ بجملةٍ لا تضيف، أو تُبتَر فكرةٌ
 * لأنّ العدّاد امتلأ.
 *
 * **والحدُّ التقنيُّ وحدَه حقيقة**: ٢٨٠ عند X و٣٠٠٠ عند LinkedIn،
 * وتجاوزُه رفضٌ محقَّق. وما دونه ذوقٌ يُقاس بالبنية لا بالطول.
 *
 * ## وهذه الوحدة تراجع ولا ترفض
 *
 * ستُّ ملحوظاتٍ تُقاس من النصّ نفسِه — حشوٌ وتكرارٌ وجملةٌ طويلةٌ ووسومٌ
 * وخاتمةٌ مستهلَكةٌ وقربٌ من السقف. **وكلُّها تُعرَض ولا تمنع**: المالكُ
 * يقرأ ويقرّر، وحارسٌ يرفض على الذوق يرمي مسوّدةً دُفع ثمنُها.
 *
 * ## والعربيّةُ تُطبَّع قبل أن تُقارَن
 *
 * «الحوكمة» و«الحَوْكَمَة» و«الحوكمه» كلمةٌ واحدة يكتبها ثلاثةُ نماذج
 * بثلاث صور. **ومقارنةٌ حرفيّةٌ تعدّها ثلاثا** — فلا تُرى تكرارا، ولا
 * يُمسَك حشوٌ كُتب بألفٍ همزتُها ساقطة.
 */
import type { Platform } from './prompt'
import { platformLabel } from '../oauth/providers'


export type NoteKind = 'filler' | 'repeat' | 'sentence' | 'hashtag' | 'cliche' | 'ceiling'

export interface ReviewNote {
  readonly kind: NoteKind
  /** ما يُعرَض للمالك — جملةٌ تقول ما وُجد ولماذا يستحقّ نظرة. */
  readonly text: string
  /** ما وُجد بعينه، فلا يبحث المالكُ في النصّ عمّا نقصده. */
  readonly hits: readonly string[]
}

/**
 * تطبيعُ العربيّة — **للمقارنة وحدَها، ولا يُكتب به شيء**.
 *
 * يُسقِط التشكيلَ والتطويل، ويوحّد صورَ الألف والياء والتاء المربوطة.
 * والنصُّ المعروضُ يبقى كما كتبه النموذج: التطبيعُ عدسةٌ لا مِبضَع.
 */
export function normalizeAr(value: string): string {
  return value
    .replace(/[ً-ْٰـ]/g, '')
    .replace(/[آأإٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
}

/**
 * الحشوُ — عباراتٌ تملأ ولا تقول.
 *
 * وكلُّها مقروءةٌ من كتابةٍ عربيّةٍ إداريّة، **لا مترجَمةٌ من قائمةٍ
 * إنجليزيّة**: «تجدر الإشارة» حشوٌ عندنا، و«it should be noted» ليست
 * ترجمتَها في الاستعمال.
 */
const FILLER: readonly string[] = [
  'تجدر الاشاره الي',
  'من الجدير بالذكر',
  'جدير بالذكر',
  'لا شك ان',
  'مما لا شك فيه',
  'كما هو معلوم',
  'من المعلوم ان',
  'في الحقيقه',
  'في واقع الامر',
  'بشكل عام',
  'على وجه العموم',
  'في نهايه المطاف',
  'في نهايه الامر',
  'من المهم ان نشير',
  'يمكن القول ان',
  'وهنا تجدر',
]

/** خواتمُ استُهلكت حتّى صارت تُقرأ حشوا. */
const CLICHE: readonly string[] = [
  'ما رايكم',
  'ما رايك',
  'شاركني رايك',
  'شاركوني اراءكم',
  'لا تنسي',
  'في الختام',
  'وفي الاخير',
  'وختاما',
  'دعوني اعرف',
]

/** أدواتٌ وحروفٌ لا تُعدّ تكرارا مهما وردت. */
const STOP: ReadonlySet<string> = new Set([
  'الذي', 'التي', 'الذين', 'هذا', 'هذه', 'ذلك', 'تلك', 'هناك', 'حيث',
  'لكن', 'ولكن', 'حتي', 'اذا', 'كما', 'بين', 'علي', 'الي', 'عند', 'بعد',
  'قبل', 'كان', 'كانت', 'يكون', 'تكون', 'ليس', 'ليست', 'كل', 'بعض',
  'اكثر', 'اقل', 'ايضا', 'انه', 'انها', 'وهو', 'وهي', 'ثم', 'او', 'مع',
])

/** أقصى ما تحتمله الجملةُ من كلماتٍ قبل أن تُقرأ مرّتين. */
// و TikTok أضيقُها: وصفٌ يُطوى بعد سطرين، فجملةٌ طويلةٌ فيه لا تُقرأ
const SENTENCE_WORDS: Readonly<Record<Platform, number>> = {
  linkedin: 28, x: 22, tiktok: 18, youtube: 24, instagram: 20,
}

/** ما تحتمله المنصّةُ من وسوم — مقروءٌ من عرفها لا مخترَع. */
const HASHTAG_MAX: Readonly<Record<Platform, number>> = {
  linkedin: 3, x: 1, tiktok: 3, youtube: 3, instagram: 5,
}

/**
 * **قربُ السقف — نسبةٌ من الحدّ لا رقمٌ مستقلّ** (D-090).
 *
 * الحدُّ حقيقةٌ عند المنصّة، والتحذيرُ يُشتقّ منه. ورقمٌ ثانٍ يُكتب
 * بجانبه يشيخ وحدَه حين يتغيّر الأوّل.
 */
export const CEILING_SHARE = 0.92

export function ceilingOf(hardLimit: number): number {
  return Math.floor(hardLimit * CEILING_SHARE)
}

/**
 * جذعُ الكلمة — **وبدونه لا يُرى تكرارٌ عربيٌّ أصلا** (D-090).
 *
 * «الحوكمة» و«بالحوكمة» و«والحوكمة» و«حوكمة» أربعُ صورٍ لكلمةٍ واحدة،
 * **وعدٌّ حرفيٌّ يعدّها أربعَ كلماتٍ مختلفة** — فيمرّ التكرارُ الرباعيُّ
 * بلا ملحوظة. وهو أكثرُ التكرار في العربيّة وقوعا.
 *
 * **وأداةُ التعريف وحدَها تُقصّ.** جُرّب قصُّ حروف الجرّ المفردة
 * (ب · ل · ك) وحروفِ العطف (و · ف) **فأسقط الاختبارُ الأمر**: «بالغ»
 * صارت «الغ»، و«وقتها» تصير «قتها». وتلك حروفُ أصلٍ في كلماتٍ كثيرة،
 * فلا تُميَّز عن الزائد إلّا بمعجم.
 *
 * أمّا «ال» وصورُها المتّصلة (بال · كال · لل، وقبلها و أو ف) **فأداةٌ
 * لا تكاد تُخطئ** في نثرٍ عربيّ. ويُشترط أن يبقى بعد القصّ ثلاثةُ أحرفٍ
 * فأكثر، **فملحوظةٌ كاذبةٌ تُفقِد الملحوظاتِ كلَّها ثقتَها**.
 */
const ARTICLE = /^(?:[وف])?(?:بال|كال|لل|ال)/

export function stemAr(word: string): string {
  const match = ARTICLE.exec(word)
  if (match === null) return word
  const rest = word.slice(match[0].length)
  return rest.length >= 3 ? rest : word
}

function words(text: string): string[] {
  return normalizeAr(text)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0)
}

function sentences(text: string): string[] {
  return text
    .split(/[.!?؟\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

/**
 * يقرأ النصَّ ويعدّ ملحوظاته — **ولا يرفض شيئا**.
 *
 * والترتيبُ مقصود: ما يُصلَح بحذفٍ أوّلا (حشوٌ وخاتمةٌ ووسوم)، ثمّ ما
 * يحتاج إعادةَ صياغة، ثمّ الطول. فالمالكُ يبدأ بالأرخص.
 */
export function reviewText(
  text: string,
  platform: Platform,
  counted: number,
  hardLimit: number,
): ReviewNote[] {
  const notes: ReviewNote[] = []
  const flat = normalizeAr(text).replace(/\s+/g, ' ')

  const fillers = FILLER.filter((phrase) => flat.includes(phrase))
  if (fillers.length > 0) {
    notes.push({
      kind: 'filler',
      text: 'حشو يملأ ولا يقول — احذفه ولن ينقص المعنى',
      hits: fillers,
    })
  }

  const cliches = CLICHE.filter((phrase) => flat.includes(phrase))
  if (cliches.length > 0) {
    notes.push({
      kind: 'cliche',
      text: 'خاتمة استُهلكت — والسؤال الخاصّ بالموضوع يُجاب، والعامّ يُتجاوَز',
      hits: cliches,
    })
  }

  const tags = text.match(/#[\p{L}\p{N}_]+/gu) ?? []
  const tagMax = HASHTAG_MAX[platform]
  if (tags.length > tagMax) {
    notes.push({
      kind: 'hashtag',
      text: `${tags.length} وسما و ${platformLabel(platform)} تحتمل ${tagMax}`,
      hits: tags.slice(0, 6),
    })
  }

  const seen = new Map<string, number>()
  for (const raw of words(text)) {
    if (raw.length < 4 || STOP.has(raw)) continue
    const word = stemAr(raw)
    if (word.length < 3 || STOP.has(word)) continue
    seen.set(word, (seen.get(word) ?? 0) + 1)
  }
  const repeated = [...seen.entries()]
    .filter(([, n]) => n >= 3)
    .sort((a, b) => b[1] - a[1])
    .map(([w, n]) => `${w} ×${n}`)
  if (repeated.length > 0) {
    notes.push({
      kind: 'repeat',
      text: 'كلمة تتكرّر — والتكرار يُضعف ما يُراد تأكيدُه',
      hits: repeated.slice(0, 5),
    })
  }

  const limit = SENTENCE_WORDS[platform]
  const long = sentences(text).filter((s) => words(s).length > limit)
  if (long.length > 0) {
    notes.push({
      kind: 'sentence',
      text: `${long.length} جملةً فوق ${limit} كلمة — تُقرأ مرّتين ليُفهَم مرّةً`,
      hits: long.map((s) => `${s.slice(0, 48)}…`).slice(0, 3),
    })
  }

  const near = ceilingOf(hardLimit)
  if (counted > near) {
    notes.push({
      kind: 'ceiling',
      text: `${counted} من ${hardLimit} — قريب من سقف المنصّة، فلا مساحة لتعديلك`,
      hits: [],
    })
  }

  return notes
}

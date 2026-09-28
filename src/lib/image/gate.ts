/**
 * بوّاباتُ الصورة قبل النداء — **القرارُ الذي تتّخذه الدالّةُ عند الضغط،
 * نقيًّا، فيقرؤه اللوحُ قبل الضغط** (D-163).
 *
 * ## العلّة المقيسة
 *
 * كان المالكُ يعرف لماذا رُدّت ضغطةُ «ولّد صورة»، أو لماذا خرجت الصورةُ بلا
 * عنوان، **بعد أن يدفع**: في رسالةٍ تظهر مرّةً ثمّ تختفي. وقِيس على staging
 * (D-157): نداءُ Gemini ونداءُ الموجز دُفعا، والصورةُ بلا عنوانٍ لسببٍ في
 * البيئة كان معروفًا قبل الضغط.
 *
 * ## ولماذا هنا لا في اللوح
 *
 * نقطةٌ تحت الزرّ لا تصدق إلّا إن قرأت القرارَ نفسَه، **لا نسخةً منه تفترق
 * عنه عند أوّل تصحيح**. فالقرارُ هنا بلا D1 ولا شبكة، و`generateForPost`
 * و`composeSlide` و`GET /panel` و`M-19` ينادونه جميعًا.
 *
 * **واستيرادُه أنواعٌ وحدها**: يستورده `owner.ts` الخفيف، فلا يجرّ إليه
 * سائقَ الصور ولا دفترَ الكلفة.
 */
import type { Blocker } from '../limits'

/** ما ينقص الشريحةَ من البيئة: مفتاحُ المتصفّح، أو الحسابُ الذي يُنادى عليه. */
export type SlidePart = 'key' | 'account'

export interface SlideGate {
  /**
   * `off` قرارُ المالك من الإعدادات **وليس عطلًا**، و`unset` نقصٌ في البيئة،
   * و`ready` تُصوَّر الشريحةُ إن جاء عنوانٌ من الموجز.
   */
  readonly state: 'off' | 'unset' | 'ready'
  /** ما ينقص — ويُحسَب ولو أُطفئ التركيب، فبطاقةُ الحدود تقوله في الحالين. */
  readonly missing: readonly SlidePart[]
}

/**
 * أتُركَّب الشريحة؟ — **بترتيب `composeSlide` نفسِه**: الإعدادُ ثمّ البيئة.
 *
 * والمفتاحُ والحسابُ حالٌ واحدة لا حالان: `composeSlide` تسأل عنهما بشرطٍ
 * واحدٍ وسببٍ واحد (D-157)، فلا يُخترَع هنا ترتيبٌ لا تعرفه. **و`missing`
 * يسمّي الغائبَ منهما** لمن يلزمه أن يقول أيَّهما يُضبَط.
 *
 * والحضورُ يُحسَب بعد القصّ عند المنادي: سرٌّ من مسافاتٍ غائبٌ في الدالّة،
 * فلا يُعدّ حاضرًا في اللوح.
 */
export function slideGate(i: {
  readonly overlay: boolean
  readonly hasBrowserKey: boolean
  readonly hasAccount: boolean
}): SlideGate {
  const missing: SlidePart[] = []
  if (!i.hasBrowserKey) missing.push('key')
  if (!i.hasAccount) missing.push('account')
  if (!i.overlay) return { state: 'off', missing }
  return { state: missing.length === 0 ? 'ready' : 'unset', missing }
}

/**
 * اسمُ سرِّ Worker الذي يحمل مفتاحَ مزوّد الصورة (D-079).
 *
 * كان تعبيرًا داخل `generateForPost`، واللوحُ يحسب «مضبوط» بجدولٍ آخر لا يعرف
 * `CF_AI_TOKEN` — فيقول «غير جاهز» لصورٍ تعمل.
 */
export function imageSecretName(p: { readonly name: string; readonly builtin: boolean }): string | undefined {
  if (p.name === 'gemini' && p.builtin) return 'GEMINI_API_KEY'
  if (p.name === 'cloudflare') return 'CF_AI_TOKEN'
  return undefined
}

/**
 * المزوّدان اللذان لهما سائقُ صورة.
 *
 * **وما عداهما كان يُنادى بسائق Gemini**: يُرسَل مفتاحُ Anthropic أو DeepSeek
 * إلى عنوان Google — سرٌّ يخرج إلى غير صاحبه — ويُردّ، **بعد أن دُفع ثمنُ
 * الموجز**. و`routeMismatch` لا تمسكه: هو اسمُ نموذجٍ صحيحٌ عند مزوّدٍ خطأ.
 */
const IMAGE_DRIVERS: ReadonlySet<string> = new Set(['gemini', 'cloudflare'])

/** لماذا لا يُنادى مزوّدُ الصورة — والنوعُ لا النصّ، فكلُّ منادٍ يقوله بلغته. */
export type ImageRefusal =
  /** التوجيهُ يسمّي مزوّدًا حُذف صفُّه. */
  | { readonly kind: 'missing' }
  | { readonly kind: 'cannot_image' }
  /** حكمُ `providerBlocker`: معطَّلٌ بقرار المالك، أو بلغ سقفَه. */
  | { readonly kind: 'blocked'; readonly blocker: Blocker }
  | { readonly kind: 'no_key' }
  /** Cloudflare بلا حسابٍ في البيئة ولا في عنوان البطاقة. */
  | { readonly kind: 'no_account' }

export interface ImageProviderFacts {
  /** اسمُ المزوّد كما في التوجيه. */
  readonly name: string
  readonly exists: boolean
  readonly blocker: Blocker | null
  /** مفتاحٌ من أسرار Worker أو من الخزنة — **وجودُه لا قيمتُه**. */
  readonly hasKey: boolean
  readonly hasAccount: boolean
}

/**
 * أيُنادى مزوّدُ الصورة؟ — **بترتيب ما يقع عند الضغط**.
 *
 * الموجودُ ثمّ ما له سائقٌ ثمّ حارسُه ثمّ مفتاحُه ثمّ حسابُه. والحارسُ العامّ
 * (الإيقافُ والسقفان) قبلها كلِّها ولا يُسأل هنا: يسأله `checkAllowance`
 * مرّةً للنظام كلِّه.
 *
 * **والسائقُ والحسابُ يُسألان قبل الحجز والموجز** (D-163): كانا لا يقعان إلّا
 * داخل النداء، بعد أن يُسجَّل ثمنُ الموجز في الدفتر.
 */
export function imageProviderGate(f: ImageProviderFacts): ImageRefusal | null {
  if (!f.exists) return { kind: 'missing' }
  if (!IMAGE_DRIVERS.has(f.name)) return { kind: 'cannot_image' }
  if (f.blocker !== null) return { kind: 'blocked', blocker: f.blocker }
  if (!f.hasKey) return { kind: 'no_key' }
  if (f.name === 'cloudflare' && !f.hasAccount) return { kind: 'no_account' }
  return null
}

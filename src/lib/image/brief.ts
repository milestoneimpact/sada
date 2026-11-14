/**
 * الموجزُ البصريّ — **من نصّ المنشور، وبالإنجليزيّة** (D-083).
 *
 * ## العلّة المقيسة
 *
 * قال المالك: «الصورُ المولَّدة لا تتعلّق بالنصّ المولَّد، لا يوجد أيُّ
 * ربط». وقُرئ `prompt.ts` فوُجد **الوصفُ كلُّه بالعربيّة**: الأسلوبُ
 * والقيدُ والموضوع.
 *
 * **ونماذجُ الصور إنجليزيّةُ اللسان.** مُرمِّزُ النصّ فيها (T5 في `flux`،
 * وأمثالُه في الباقي) مدرَّبٌ على وصفٍ إنجليزيّ ساحق. فوصفٌ عربيٌّ
 * **يُقرأ ضجيجا لا معنى** — فتخرج صورةٌ من الأسلوب المطلوب، **ولا علاقةَ
 * لها بالموضوع**. وهو بالضبط ما رآه المالك.
 *
 * ## والترجمةُ الحرفيّة لا تكفي
 *
 * «منشورٌ عن أثر الحوكمة في المشاريع» تُترجَم فتبقى **مفهوما لا مشهدا**.
 * ونموذجُ الصورة يرسم ما يُرى: أجساما وتركيبا وضوءا ولونا. فيلزم من
 * يحوّل المعنى إلى مشهد — **وذاك عملُ نموذج نصّ لا مترجم**.
 *
 * فهذه الوحدة تنادي مزوّدَ الكتابة نداءً صغيرا: **منشورٌ عربيّ ← موجزٌ
 * بصريٌّ إنجليزيّ** من ثلاثة حقول. ثمّ يُركَّب الوصفُ النهائيُّ منه.
 *
 * ## وكلفتُه تُسجَّل ولا تُخفى
 *
 * نداءٌ خارجيٌّ مدفوع يُكتب في `cost_ledger` قبل أن يُعدّ ناجحا (D-008)،
 * ولو كان صغيرا. **وما لا يُسجَّل لا يظهر في السقف** — فيتسرّب الإنفاق
 * من باب لا يحرسه أحد.
 *
 * **وجوابٌ مبتورٌ يُسجَّل كذلك** (D-164). سقفُ هذا النداء `maxTokens: 400`
 * على لهجة التوافق، فهو أكثرُ المواضع عرضةً للبتر — وكان المبتورُ يعود
 * «تعذّر» بلا صفٍّ في الدفتر، وقد دُفع ثمنُه.
 *
 * ## ولا يُوقِف فشلُه التوليد
 *
 * الموجزُ تحسينٌ لا شرط. فإن سقط النداء رُدَّ `null`، **وبُني الوصفُ من
 * موضوع المنشور كما كان** — صورةٌ أضعفُ ربطا خيرٌ من منشورٍ بلا صورة.
 * ويُقال ذلك في سبب المخرَج، فلا يُظنّ العطلُ في مكانٍ آخر.
 */
import { callText } from '../ai/textCall'
import type { Db } from '../tokens'
import { FALLBACK_COMPOSITION, FALLBACK_PALETTE } from './prompt'

export interface VisualBrief {
  /** ما يُرى — أجسامٌ وموادُّ ومشهد. بالإنجليزيّة، ملموسا لا مفهوما. */
  readonly subject: string
  /** التركيب: زاويةٌ وعمقٌ وتوزيعُ الفراغ. */
  readonly composition: string
  /** اللون والضوء. */
  readonly palette: string
  /**
   * عنوانُ الشريحة — **عربيٌّ، كلمتان أو ثلاث** (D-085).
   *
   * ويُركَّب فوق الصورة عندنا لا فيها. **وهو يُوقِف العين لا يشرح**:
   * سطرٌ طويلٌ فوق صورةٍ لا يُقرأ — يُقرأ المنشورُ نفسُه.
   */
  readonly headline: string
  /**
   * فوقيّةٌ إنجليزيّة — **كلمتان بالضبط**، متباعدتا الحروف فوق العنوان.
   *
   * ولا تُترجِم العنوانَ: تسنده. «Governance First» فوق «الحوكمةُ تسبق
   * السرعة» تزيد وزنا، وترجمةٌ حرفيّةٌ تحته تُنقصه.
   */
  readonly kicker: string
}

export interface BriefDeps {
  readonly db: Db
  readonly encKey: string
  readonly workerSecrets: Readonly<Record<string, string | undefined>>
  readonly fetchImpl?: typeof fetch
}

export interface BriefOutcome {
  readonly brief: VisualBrief | null
  readonly cost: number
  /** يُعرَض في اللوحة حين يسقط — فلا يُظنّ العطلُ في المزوّد البصريّ. */
  readonly detail: string
}

/**
 * التعليمةُ الحاكمة — **بالإنجليزيّة كذلك**.
 *
 * لأنّ المخرَجَ إنجليزيّ، وتعليمةٌ بلغةٍ ومخرَجٌ بأخرى تُنتج خلطا: يبدأ
 * النموذجُ بالعربيّة ثمّ يتذكّر. **والاتّساقُ أرخص من التصحيح.**
 */
export const BRIEF_SYSTEM = [
  'You turn an Arabic professional social post into (a) a visual brief for a',
  'text-to-image model and (b) a two-line title card that will be composited',
  'OVER that image. You never translate the post.',
  '',
  'Answer with JSON only, exactly these five keys:',
  '{"subject":"…","composition":"…","palette":"…","headline":"…","kicker":"…"}',
  '',
  'subject / composition / palette — the image itself:',
  '- English only, concrete and visual. Name objects, materials, light.',
  '- Never name a concept the model cannot draw ("governance", "strategy").',
  '  Translate the idea into a scene: what physical thing carries it?',
  '- No text, letters, numbers, or writing of any kind in the image.',
  '- No faces, no recognisable people, no brand logos.',
  '- No office cliches: no handshakes, no rising bar charts, no lightbulbs,',
  '  no chess pieces, no puzzle pieces, no gears.',
  '- Abstract editorial style: geometry, gradients, texture, materials.',
  '- Under 200 characters each.',
  '',
  'headline — the Arabic line drawn on the image:',
  '- ARABIC. Two or three words. Never a full sentence, never a question.',
  '- It must carry the post\'s single strongest claim, not summarise it.',
  '- Weighty and declarative, the way a magazine cover line is.',
  '- No punctuation, no quotes, no emoji, no hashtags. Under 40 characters.',
  '',
  'kicker — the English line above it:',
  '- ENGLISH. EXACTLY TWO WORDS. Title Case. Under 24 characters.',
  '- It supports the headline; it does NOT translate it.',
  '- Editorial and strong, like a section label on a cover:',
  '  "Governance First", "Measured Impact", "Quiet Leverage", "Built To Last".',
  '- Never generic filler ("Our Update", "New Post", "Read More").',
].join('\n')

export function briefUser(postText: string): string {
  // ألفُ محرفٍ تكفي فكرةَ منشور، وما زاد يزيد الكلفةَ ولا يزيد المعنى
  const text = postText.trim().slice(0, 1000)
  return `The Arabic post:\n\n${text}\n\nReturn the JSON brief.`
}

/** حدُّ ما يُقبَل من العنوان والفوقيّة — ويقابل ما تقصّه `slide.ts`. */
export const HEADLINE_MAX = 40
export const KICKER_MAX = 24

/**
 * **كلمتان لا أكثر** — والنموذجُ يزيد أحيانا مهما قيل له.
 *
 * والقصُّ عندنا لا رجاءٌ عنده: تعليمةٌ تُخالَف مرّةً في المئة تكفي
 * لتخرج شريحةٌ بسطرٍ أعرج، **والقصُّ يقع دائما**.
 */
export function twoWords(value: string): string {
  const words = value.trim().split(/\s+/).filter((w) => w.length > 0)
  return words.slice(0, 2).join(' ')
}

function field(raw: unknown, max = 200): string | null {
  if (typeof raw !== 'string') return null
  const value = raw.trim().replace(/\s+/g, ' ')
  return value.length === 0 ? null : value.slice(0, max)
}

/** **يُفحَص الشكلُ ولا يُفترَض**: جوابٌ ناقصٌ يُردّ ولا يُرقَّع بفراغ. */
export function parseBrief(raw: string): VisualBrief | null {
  let payload: unknown
  try {
    payload = JSON.parse(raw)
  } catch {
    // بعضُ النماذج تلفّ الـJSON بسياجٍ — تُقرأ أوّلُ عقدةٍ فيه
    const match = /\{[\s\S]*\}/.exec(raw)
    if (match === null) return null
    try {
      payload = JSON.parse(match[0])
    } catch {
      return null
    }
  }
  const row = (payload ?? {}) as Record<string, unknown>
  const subject = field(row['subject'])
  if (subject === null) return null
  return {
    subject,
    composition: field(row['composition']) ?? FALLBACK_COMPOSITION,
    palette: field(row['palette']) ?? FALLBACK_PALETTE,
    // **والعنوانُ يبقى فارغا إن لم يأتِ**: شريحةٌ بلا نصّ خيرٌ من شريحةٍ
    // بنصٍّ مخترَع — والمنادي يتخطّى التركيبَ حين يجده فارغا
    headline: field(row['headline'], HEADLINE_MAX) ?? '',
    kicker: twoWords(field(row['kicker'], KICKER_MAX) ?? ''),
  }
}

/**
 * نداءُ مزوّد الكتابة بتعليمةٍ وجوابِ JSON — **يُسجَّل في الدفتر ولا يرمي**.
 *
 * يستعمل توجيهَ مهمّة `draft`: **هو المزوّدُ الذي يفهم العربيّة عندنا**، ومزوّدُ
 * الصور لا يفهمها. ويقرؤه الموجزُ البصريّ والإنفوجرافيك معا (D-174)، فحارسُ
 * المزوّد وسقفُه ومفتاحُه ودفترُه في موضعٍ واحد.
 *
 * ## والسقفُ يتّسع لنموذجٍ يفكّر قبل أن يجيب
 *
 * كان السقفُ ‏٤٠٠ رمز. **ووجّه staging الكتابةَ إلى `deepseek-v4-pro`**، وهو يصرف
 * رموزَه على التفكير أوّلا: قرأ الدفترُ ‏١١٢٦ رمزًا وجوابًا فارغًا «لا نصّ في جواب
 * المزوّد» — فسقط الموجز، وخرجت صورةٌ من الوصف العامّ لا علاقةَ لها بالنصّ.
 * فالسقفُ يُمرَّر من المنادي بقدر ما يحتاجه جوابُه وتفكيرُه معا.
 */
export async function askWriter(
  deps: BriefDeps,
  ask: {
    readonly system: string
    readonly user: string
    /** اسمُ العمليّة في الدفتر: `image-brief` أو `infographic`. */
    readonly operation: string
    readonly maxTokens: number
    readonly refId?: string
  },
): Promise<{
  readonly text: string | null
  readonly cost: number
  readonly detail: string
  /** وقع النداءُ فسقط — لا نقصٌ في الضبط قبله. */
  readonly called: boolean
}> {
  // ‏بسلسلة مفاتيح «الكتابة» (D-349): مزوّدُ الكتابة يمرّ بحارسه وسقفه هنا كما يمرّ في الكتابة (D-163)، والمتعذّرُ يُتخطّى
  const out = await callText(deps, {
    task: 'draft', system: ask.system, user: ask.user, json: true, maxTokens: ask.maxTokens, operation: ask.operation,
    skipAllowance: true,
    ...(ask.refId === undefined ? {} : { refId: ask.refId }),
  })
  if (out.kind === 'ok') return { text: out.text, cost: out.cost, detail: '', called: true }
  // ‏جوابٌ وصل ثمّ رُدّ: كلفتُه تُعاد مع السبب فلا تُقال صفرًا
  return { text: null, cost: out.kind === 'failed' ? out.cost : 0, detail: out.reason, called: out.kind === 'failed' && out.called }
}

/** سقفُ الموجز: ثلاثةُ حقولٍ قصيرة، **وتفكيرُ نموذجٍ يفكّر قبلها**. */
export const BRIEF_MAX_TOKENS = 2000

/**
 * يبني الموجزَ من نصّ المنشور — **ولا يرمي**.
 */
export async function visualBrief(
  deps: BriefDeps,
  postText: string,
  refId?: string,
): Promise<BriefOutcome> {
  const answer = await askWriter(deps, {
    system: BRIEF_SYSTEM,
    user: briefUser(postText),
    operation: 'image-brief',
    maxTokens: BRIEF_MAX_TOKENS,
    ...(refId === undefined ? {} : { refId }),
  })
  if (answer.text === null) {
    return {
      brief: null,
      cost: answer.cost,
      detail: answer.called ? `تعذّر الموجز البصريّ: ${answer.detail}` : answer.detail,
    }
  }
  const brief = parseBrief(answer.text)
  return {
    brief,
    cost: answer.cost,
    detail: brief === null ? 'جواب الموجز ليس بالشكل المتوقَّع' : 'موجز بصريّ',
  }
}

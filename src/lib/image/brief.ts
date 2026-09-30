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
import { anthropicChat } from '../ai/anthropic'
import { chatCompletion } from '../ai/openaiCompat'
import { routeFor } from '../ai/routes'
import { spentOf, type Spent } from '../ai/spent'
import { recordCost } from '../cost'
import { blockerReason, checkProvider } from '../limits'
import { costOf, getProvider, resolveKey } from '../providers'
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
 * يبني الموجزَ من نصّ المنشور — **ولا يرمي**.
 *
 * ويستعمل توجيهَ مهمّة `draft`: **هو المزوّدُ الذي يفهم العربيّة عندنا**
 * أصلا، ومزوّدُ الصور لا يفهمها. ولا تُضاف مهمّةٌ خامسةٌ في جدول التوجيه
 * لأجل نداءٍ من مئتَي رمز — **جدولٌ يطول بصفٍّ لا يُبدَّل ليس خيارا،
 * هو عبء**.
 */
export async function visualBrief(
  deps: BriefDeps,
  postText: string,
  refId?: string,
): Promise<BriefOutcome> {
  const route = await routeFor(deps.db, 'draft')
  const provider = await getProvider(deps.db, route.provider)
  if (provider === null) {
    return { brief: null, cost: 0, detail: `لا مزوّدَ للكتابة (${route.provider})` }
  }

  /*
   * **ومزوّدُ الكتابة يمرّ بحارسه هنا كما يمرّ في الكتابة** (D-163).
   *
   * `draftPost` و`planWeek` تناديان `checkProvider` قبل نداءيهما، والموجزُ
   * لا. و`resolveKey` تعيد سرَّ البيئة ولو عُطّل المزوّد، **فكان مزوّدٌ
   * أطفأه المالكُ يُنادى ويُحاسَب عليه** مع كلّ صورة، وسقفُه اليوميُّ لا
   * يوقفه. والسقوطُ هنا كسائر سقوط الموجز: صورةٌ بلا عنوانٍ بسببٍ يُقرأ.
   */
  const perProvider = await checkProvider(deps.db, provider.name)
  if (perProvider !== null) {
    return { brief: null, cost: 0, detail: blockerReason(perProvider) }
  }

  const secretName = provider.builtin
    ? provider.name === 'anthropic'
      ? 'ANTHROPIC_API_KEY'
      : provider.name === 'gemini'
        ? 'GEMINI_API_KEY'
        : undefined
    : undefined
  const resolved = await resolveKey(
    deps.db,
    deps.encKey,
    provider.name,
    secretName === undefined ? undefined : deps.workerSecrets[secretName],
  )
  if (resolved.key === null) {
    return { brief: null, cost: 0, detail: `لا مفتاح لـ ${provider.label}` }
  }

  // **الكلفةُ قبل القراءة** — النداءُ وقع وحوسِب عليه، وجوابٌ مشوَّهٌ أو
  // مبتورٌ لا يُلغي كلفةً وقعت (D-008، D-164). وتُعرَّف قبل النداء لأنّ
  // الـcatch يحتاجها كما يحتاجها النجاح
  const charge = async (spent: Spent): Promise<number> => {
    const priced = costOf(provider, spent)
    const units = spent.inputTokens + spent.outputTokens
    await recordCost(deps.db, {
      provider: provider.name,
      operation: `image-brief:${spent.model}`,
      units,
      unitCost: units === 0 ? 0 : priced.total / units,
      ...(refId === undefined ? {} : { refId }),
    })
    return priced.total
  }

  let text: string
  let spent: Spent
  try {
    if (provider.kind === 'anthropic') {
      const result = await anthropicChat({
        apiKey: resolved.key,
        model: route.model,
        system: BRIEF_SYSTEM,
        user: briefUser(postText),
        ...(deps.fetchImpl === undefined ? {} : { fetchImpl: deps.fetchImpl }),
      })
      text = result.text
      spent = result
    } else {
      if (provider.baseUrl === null) {
        return { brief: null, cost: 0, detail: 'لا عنوان لمزوّد الكتابة' }
      }
      const result = await chatCompletion(
        {
          baseUrl: provider.baseUrl,
          apiKey: resolved.key,
          model: route.model,
          system: BRIEF_SYSTEM,
          user: briefUser(postText),
          json: true,
          // موجزٌ من ثلاثة حقولٍ قصيرة — والسقفُ يمنع جوابا يسترسل
          maxTokens: 400,
        },
        deps.fetchImpl ?? fetch,
      )
      text = result.text
      spent = { ...result.usage, cachedInputTokens: 0, model: result.model }
    }
  } catch (error) {
    // جوابٌ وصل ثمّ رُدّ: يُسجَّل، وكلفتُه تُعاد مع السبب فلا تُقال صفرا
    const late = spentOf(error)
    return {
      brief: null,
      cost: late === null ? 0 : await charge(late),
      detail: `تعذّر الموجزُ البصريّ: ${error instanceof Error ? error.message : 'نداءٌ فشل'}`,
    }
  }

  const cost = await charge(spent)
  const brief = parseBrief(text)
  return {
    brief,
    cost,
    detail: brief === null ? 'جوابُ الموجز ليس بالشكل المتوقَّع' : 'موجزٌ بصريّ',
  }
}

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
 * ## ولا يُوقِف فشلُه التوليد
 *
 * الموجزُ تحسينٌ لا شرط. فإن سقط النداء رُدَّ `null`، **وبُني الوصفُ من
 * موضوع المنشور كما كان** — صورةٌ أضعفُ ربطا خيرٌ من منشورٍ بلا صورة.
 * ويُقال ذلك في سبب المخرَج، فلا يُظنّ العطلُ في مكانٍ آخر.
 */
import { anthropicChat } from '../ai/anthropic'
import { chatCompletion } from '../ai/openaiCompat'
import { routeFor } from '../ai/routes'
import { recordCost } from '../cost'
import { costOf, getProvider, resolveKey } from '../providers'
import type { Db } from '../tokens'

export interface VisualBrief {
  /** ما يُرى — أجسامٌ وموادُّ ومشهد. بالإنجليزيّة، ملموسا لا مفهوما. */
  readonly subject: string
  /** التركيب: زاويةٌ وعمقٌ وتوزيعُ الفراغ. */
  readonly composition: string
  /** اللون والضوء. */
  readonly palette: string
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
  'You turn an Arabic professional social post into a visual brief for a',
  'text-to-image model. You never translate the post; you decide what a',
  'single accompanying image should SHOW.',
  '',
  'Hard rules:',
  '- Answer with JSON only: {"subject":"…","composition":"…","palette":"…"}.',
  '- English only, concrete and visual. Name objects, materials, light.',
  '- Never name a concept the model cannot draw ("governance", "strategy").',
  '  Translate the idea into a scene: what physical thing carries it?',
  '- No text, letters, numbers, or writing of any kind in the image.',
  '- No faces, no recognisable people, no brand logos.',
  '- No office cliches: no handshakes, no rising bar charts, no lightbulbs,',
  '  no chess pieces, no puzzle pieces, no gears.',
  '- Abstract editorial style: geometry, gradients, texture, materials.',
  '- Keep each field under 200 characters.',
].join('\n')

export function briefUser(postText: string): string {
  // ألفُ محرفٍ تكفي فكرةَ منشور، وما زاد يزيد الكلفةَ ولا يزيد المعنى
  const text = postText.trim().slice(0, 1000)
  return `The Arabic post:\n\n${text}\n\nReturn the JSON brief.`
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
    composition: field(row['composition']) ?? 'wide editorial composition, generous negative space',
    palette: field(row['palette']) ?? 'muted limited palette with a soft teal accent',
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

  let text: string
  let usage: { inputTokens: number; outputTokens: number }
  let ran: string
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
      usage = { inputTokens: result.inputTokens, outputTokens: result.outputTokens }
      ran = result.model
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
      usage = { inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens }
      ran = result.model
    }
  } catch (error) {
    return {
      brief: null,
      cost: 0,
      detail: `تعذّر الموجزُ البصريّ: ${error instanceof Error ? error.message : 'نداءٌ فشل'}`,
    }
  }

  // **الكلفةُ قبل القراءة** — النداءُ وقع وحوسِب عليه، وجوابٌ مشوَّه لا
  // يُلغي كلفةً وقعت (D-008)
  const priced = costOf(provider, usage)
  const units = usage.inputTokens + usage.outputTokens
  await recordCost(deps.db, {
    provider: provider.name,
    operation: `image-brief:${ran}`,
    units,
    unitCost: units === 0 ? 0 : priced.total / units,
    ...(refId === undefined ? {} : { refId }),
  })

  const brief = parseBrief(text)
  return {
    brief,
    cost: priced.total,
    detail: brief === null ? 'جوابُ الموجز ليس بالشكل المتوقَّع' : 'موجزٌ بصريّ',
  }
}

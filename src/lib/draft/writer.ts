/**
 * نداءُ الكتابة الواحد — **الحارسُ ثمّ المزوّدُ ثمّ النداءُ ثمّ الكلفة** (D-190).
 *
 * كان هذا الترتيبُ مكتوبًا داخل `draftPost` وحدَها. ثمّ صارت الكتابةُ تبدأ من ثلاثة
 * أبواب: خلاصةُ مصدرٍ محلَّل، وفكرةُ المالك بكلماته، ووصفُه لمقطعٍ رفعه. **وثلاثُ نسخٍ
 * من حارسٍ واحد تفترق عند أوّل تصحيح** — فيُصلَح سقفُ المزوّد في إحداها وتبقى الأخريان
 * تناديانه وهو معطَّل. فالترتيبُ هنا مرّةً، وتقرؤه الثلاثة:
 *
 *   ١ · **الإيقافُ وسقفُ الإنفاق** — `checkAllowance(…, 'draft')` قبل أيّ نداء
 *   ٢ · المزوّدُ من توجيه المالك لمهمّة `draft` لا من ثابتٍ في الشيفرة
 *   ٣ · **سقفُ المزوّد** بعد العامّ لا قبله
 *   ٤ · المفتاح: سرُّ Worker يغلب الخزانة (D-030)
 *   ٥ · النداءُ بلهجة المزوّد
 *   ٦ · **الكلفةُ في الدفتر قبل أن يُقرأ الجواب** (D-008) — وفي الفشل أيضًا حين وصل
 *       جوابٌ ثمّ رُدّ (D-164)
 *
 * **ولا يُقرأ الجوابُ هنا**: ما يُقبَل منه يحكم فيه من طلبه — منشورٌ بحدّ منصّته، أو
 * نصوصُ مقطعٍ بحدود منصّاتها. والكلفةُ وقعت قبل ذلك الحكم في كلّ حال.
 */
import { recordCost } from '../cost'
import { blockerReason, checkAllowance, checkProvider } from '../limits'
import { costOf, getProvider, resolveKey } from '../providers'
import { routeFor } from '../ai/routes'
import { chatCompletion } from '../ai/openaiCompat'
import { anthropicChat } from '../ai/anthropic'
import { portableSchema } from '../ai/portableSchema'
import { spentOf, type Spent } from '../ai/spent'
import type { Db } from '../tokens'

export interface WriterDeps {
  readonly db: Db
  readonly encKey: string
  /** أسرارُ Worker — تغلب الخزانة دائما (D-030). */
  readonly workerSecrets: Readonly<Record<string, string | undefined>>
  /** للاختبار وحده: نداءٌ مزيَّف بدل الشبكة. */
  readonly fetchImpl?: typeof fetch
}

export interface WriteCall {
  readonly system: string
  readonly user: string
  /** المخطّطُ الخامّ — ويُحمَل إلى Anthropic محمولًا (D-164). */
  readonly schema: Readonly<Record<string, unknown>>
  /** اسمُ العمليّة في الدفتر، ويُلحَق به النموذج: `draft:x` ← `draft:x:claude-opus-5`. */
  readonly operation: string
  /** ما يُنسَب إليه الصفّ في الدفتر — المادّةُ التي كُتب منها لا المنشور. */
  readonly refId: string
}

export type Written =
  | { readonly kind: 'written'; readonly text: string; readonly cost: number; readonly model: string }
  /** منعه الإيقاف أو سقف. قرارٌ نُفِّذ لا فشل — ولا نداء. */
  | { readonly kind: 'blocked'; readonly reason: string }
  /**
   * و`cost` ما سُجّل في الدفتر لهذا الفشل — جوابٌ وصل ثمّ رُدّ (D-164). **يُعاد ليُقال**:
   * إشعارٌ يقول «تعذّرت» ويسكت عن ثمنٍ دُفع يجعل ما يُرى أقلَّ ممّا أُنفق.
   */
  | { readonly kind: 'failed'; readonly reason: string; readonly retryable: boolean; readonly cost?: number }

/** نداءٌ واحدٌ بحرّاسه كلِّها — والكلفةُ مكتوبةٌ قبل أن يعود. */
export async function writeOnce(deps: WriterDeps, call: WriteCall): Promise<Written> {
  // ١ · الحارس العامّ قبل أيّ نداء
  const allowance = await checkAllowance(deps.db, 'draft')
  if (allowance.blocker !== null) {
    return { kind: 'blocked', reason: blockerReason(allowance.blocker) }
  }

  // ٢ · المزوّد من توجيه المالك لا من ثابتٍ في الشيفرة
  const route = await routeFor(deps.db, 'draft')

  const provider = await getProvider(deps.db, route.provider)
  if (provider === null) {
    return { kind: 'failed', reason: `مزوّدٌ غير موجود: ${route.provider}`, retryable: false }
  }

  // ٣ · وسقفُ المزوّد بعد الحارس العامّ لا قبله: مَن قدّم التفصيل على الجملة
  // قال «المزوّد متاح» ونظامُه موقوف
  const perProvider = await checkProvider(deps.db, provider.name)
  if (perProvider !== null) return { kind: 'blocked', reason: blockerReason(perProvider) }

  // ٤ · المفتاح
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
    return { kind: 'failed', reason: `لا مفتاح لـ ${provider.label}`, retryable: false }
  }

  // خطوةُ الكلفة (٦) تُعرَّف قبل النداء: يحتاجها الجوابُ الناجح، والجوابُ
  // الذي وصل ثمّ رُدّ (D-164). صفٌّ واحدٌ بشكلٍ واحد
  const charge = async (spent: Spent): Promise<number> => {
    const priced = costOf(provider, spent)
    const units = spent.inputTokens + spent.cachedInputTokens + spent.outputTokens
    await recordCost(deps.db, {
      provider: provider.name,
      operation: `${call.operation}:${spent.model}`,
      units,
      // سعرُ الوحدة مشتقٌّ لا مفترَض: مزوّدٌ بلا سعرٍ مضبوط يعطي صفرا
      unitCost: units === 0 ? 0 : priced.total / units,
      refId: call.refId,
    })
    return priced.total
  }

  // ٥ · النداء — بلهجة المزوّد
  let text: string
  let spent: Spent
  try {
    if (provider.kind === 'anthropic') {
      const result = await anthropicChat({
        apiKey: resolved.key,
        model: route.model,
        system: call.system,
        user: call.user,
        // المحمولُ لا الخامّ (D-164): `minLength` يُطوى وصفًا، وحدُّه عند القارئ
        schema: portableSchema(call.schema),
        ...(deps.fetchImpl === undefined ? {} : { fetchImpl: deps.fetchImpl }),
      })
      text = result.text
      spent = result
    } else {
      if (provider.baseUrl === null) {
        return { kind: 'failed', reason: 'لا عنوان لهذا المزوّد', retryable: false }
      }
      const result = await chatCompletion(
        {
          baseUrl: provider.baseUrl,
          apiKey: resolved.key,
          model: route.model,
          system: call.system,
          user: call.user,
          json: true,
        },
        deps.fetchImpl ?? fetch,
      )
      text = result.text
      spent = { ...result.usage, cachedInputTokens: 0, model: result.model }
    }
  } catch (error) {
    // جوابٌ وصل ثمّ رُدّ حوسِب عليه: يُكتب قبل أن يُعاد الفشل (D-164)
    const late = spentOf(error)
    const paid = late === null ? null : await charge(late)
    const retryable =
      typeof error === 'object' && error !== null && 'retryable' in error
        ? Boolean((error as { retryable: unknown }).retryable)
        : true
    return {
      kind: 'failed',
      reason: error instanceof Error ? error.message : 'نداءٌ فشل',
      retryable,
      ...(paid === null ? {} : { cost: paid }),
    }
  }

  // ٦ · **الكلفة قبل القراءة** — النداءُ وقع وحوسِب عليه
  const cost = await charge(spent)
  return { kind: 'written', text, cost, model: spent.model }
}

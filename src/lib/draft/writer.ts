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
import type { Db } from '../tokens'
import { callText } from '../ai/textCall'

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
  /**
   * مزوّد يغلب التوجيه لهذه الكتابة وحدها، للمقارنة (D-244).
   *
   * ولا يبدّل المحفوظ: الكتابة التالية تعود إلى «توجيه المهامّ». واسمه يطابقه
   * المنادي على صفّ قائم في `providers` قبل أن يصل هنا، والنموذج من التوجيه
   * المحفوظ ما لم يُعطَ.
   */
  readonly provider?: string
  /** منظّمةُ المنادي (D-295): سقفُها الخاصّ يُفحَص بعد العامّ — وبلا منظّمةٍ العامُّ وحدَه. */
  readonly org?: string
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

/**
 * نداءٌ واحدٌ بحرّاسه كلِّها — **بسلسلة مفاتيح «الكتابة»** (D-349): الحارسُ العامّ، ثمّ لكلّ مفتاحٍ سقفُه ومفتاحُه ونداؤه ودفترُه،
 * والمتعذّرُ يُتخطّى إلى التالي. والمقارنةُ (`call.provider`) مزوّدُها وحدَه.
 */
export async function writeOnce(deps: WriterDeps, call: WriteCall): Promise<Written> {
  const out = await callText(deps, {
    task: 'draft', system: call.system, user: call.user, schema: call.schema, operation: call.operation, refId: call.refId,
    ...(call.org === undefined ? {} : { org: call.org }),
    ...(call.provider === undefined ? {} : { provider: call.provider }),
  })
  if (out.kind === 'ok') return { kind: 'written', text: out.text, cost: out.cost, model: out.model }
  if (out.kind === 'blocked') return out
  return { kind: 'failed', reason: out.reason, retryable: out.retryable, ...(out.cost > 0 ? { cost: out.cost } : {}) }
}

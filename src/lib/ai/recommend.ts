/**
 * «طبّق التوصيات» (D-350): لكلّ مهمّةٍ نصّيّة قائمةُ تفضيلٍ مرتّبة، ويُختار أوّلُ ما **مزوّدُه مفعَّلٌ له مفتاحٌ ولم يفشل آخرُ
 * اختبارٍ له**. دالّةٌ صرفة: تقرأ الحالَ وتعيد التغييرات، والكتابةُ عند من ناداها.
 *
 * ## لماذا القائمةُ مكتوبةٌ لا مستنتَجة
 *
 * لأنّ «الأنسب» حكمٌ لا رقم: الفهمُ والخطّةُ يطلبان جوابًا منظَّمًا طويلًا، والنماذجُ التي «تفكّر» قبل أن تكتب تُنفق حدَّها
 * تفكيرًا فيُبتر الجواب (وقع بـ`deepseek-v4-pro` في الخطّة). والكتابةُ تُنشر باسم المالك، فجودتُها العربيّة أولى من ثمنها.
 * **والزرُّ فعلٌ صريح**: يُطبَّق على كلّ مهمّةٍ نصّيّة ولو كان نموذجُها اختيارًا يدويًّا — فـ«احترامُ» اختيارٍ خارج القائمة كان سيُبقي
 * `deepseek-v4-pro` في الخطّة، وهو العطلُ نفسُه. والرسالةُ تسمّي القديمَ لكلّ مهمّة فيُعاد بضغطة.
 */
import type { TaskName } from './registry'

export interface RecProvider {
  readonly name: string
  readonly enabled: boolean
  readonly configured: boolean
  /** آخرُ اختبار: `false` فشل، `true` نجح، `null` لم يُختبر. */
  readonly lastOk: boolean | null
}

export interface RecRoute {
  readonly task: string
  readonly provider: string
  readonly model: string
}

export interface RecChange {
  readonly task: TaskName
  readonly from: { readonly provider: string; readonly model: string }
  readonly to: { readonly provider: string; readonly model: string }
  readonly why: string
}

/** قائمةُ التفضيل لكلّ مهمّةٍ نصّيّة — الأوّلُ الصالحُ يُختار. */
export const PREFERENCE: Readonly<Partial<Record<TaskName, readonly { provider: string; model: string; why: string }[]>>> = {
  analyze: [
    { provider: 'deepseek', model: 'deepseek-chat', why: 'حكمٌ متّسق بجوابٍ منظَّم، بكلفةٍ منخفضة' },
    { provider: 'gemini', model: 'gemini-2.5-flash', why: 'سريعٌ بفئةٍ مجّانيّة، ويقرأ العربيّة جيّدًا' },
    { provider: 'anthropic', model: 'claude-opus-5', why: 'أدقُّ حكم، وأغلاه' },
  ],
  plan: [
    { provider: 'deepseek', model: 'deepseek-chat', why: 'جوابٌ منظَّمٌ طويل بلا تفكيرٍ يُنفق حدَّه' },
    { provider: 'gemini', model: 'gemini-2.5-flash', why: 'سريعٌ ومجّانيّ، ويتّسع لخطّةٍ كاملة' },
    { provider: 'anthropic', model: 'claude-opus-5', why: 'أدقُّ توزيع، وأغلاه' },
  ],
  draft: [
    { provider: 'anthropic', model: 'claude-opus-5', why: 'أجودُ عربيّةٍ ونبرة — والكتابةُ تُنشر باسمك' },
    { provider: 'deepseek', model: 'deepseek-chat', why: 'عربيّةٌ جيّدة بكلفةٍ منخفضة' },
    { provider: 'gemini', model: 'gemini-2.5-flash', why: 'سريعٌ ومجّانيّ' },
  ],
}

function usable(p: RecProvider | undefined): boolean {
  return p !== undefined && p.enabled && p.configured && p.lastOk !== false
}

/** التغييراتُ المقترحة — ما يُبقي الحالَ كما هو لا يُعاد. */
export function recommend(providers: readonly RecProvider[], routes: readonly RecRoute[]): RecChange[] {
  const byName = new Map(providers.map((p) => [p.name, p]))
  const out: RecChange[] = []
  for (const [task, list] of Object.entries(PREFERENCE) as [TaskName, NonNullable<(typeof PREFERENCE)[TaskName]>][]) {
    const current = routes.find((r) => r.task === task)
    if (current === undefined) continue
    const pick = list.find((o) => usable(byName.get(o.provider)))
    if (pick === undefined) continue
    if (current.provider === pick.provider && current.model === pick.model) continue
    out.push({ task, from: { provider: current.provider, model: current.model }, to: { provider: pick.provider, model: pick.model }, why: pick.why })
  }
  return out
}

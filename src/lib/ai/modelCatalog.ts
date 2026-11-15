/**
 * ‏عرضُ فهرس النماذج للمالك (D-364) — مجموعاتٌ مسمّاة، والموصى به أوّلًا، والمعرّفُ ظاهرٌ لا مخفيٌّ في تلميح.
 *
 * ## العلّةُ التي بُني لها
 *
 * ‏قال المالك: «`deepseek-chat` لا يظهر». وكان في الدرج — **لكن باسمٍ آخر**: الخيارُ يُكتب `modelName(id)` وحده
 * ‏(«DeepSeek · للمحادثة (Chat)») والمعرّفُ في `title` لا يُرى إلّا بالفأرة، فمن يبحث عن الاسم الذي يعرفه من وثائق المزوّد لا يجده.
 * ‏وفهرسُ DeepSeek لا يقول صنفَ نماذجه، فكان صنفُها فارغًا لا «نصّ». وبلا سكربتٍ لم تكن القائمةُ تُجلَب أصلًا.
 *
 * ‏فصار نصُّ كلِّ خيارٍ: الاسمُ المقروء ثمّ المعرّفُ كما هو، والسعرُ إن أعطاه الفهرس، وعلامةُ «يفكّر» لما يُنفق حدَّه تفكيرًا قبل أن
 * ‏يكتب. **ودالّةٌ صرفة**: تأخذ القائمةَ وتعيد المجموعات، ويرسمها الخادمُ والسكربتُ بالشكل نفسِه.
 */
import type { ModelChoice, ModelTask } from './models'
import { modelName } from './modelName'
import { PREFERENCE } from './recommend'
import type { TaskName } from './registry'

/** ‏ما «يفكّر» قبل أن يكتب — ويُنفق حدَّ الرموز في التفكير فيُبتر الجواب (وقع بـ`deepseek-v4-pro` في الخطّة). */
export function isThinking(id: string): boolean {
  return /(reasoner|thinking|-r1\b|\br1\b|^o\d|\/o\d|qwq|deepseek-v4-pro)/i.test(id)
}

export const THINKING_NOTE = 'يفكّر قبل أن يكتب، وقد يُنفق حدَّ الرموز تفكيرًا فيُبتر الجواب'

export const TASK_GROUP: Readonly<Record<ModelTask, string>> = {
  text: 'نصّ ومحادثة',
  image: 'توليد صور',
  video: 'توليد مقاطع',
  embedding: 'فهرسة',
  other: 'أخرى',
}

export interface CatalogItem {
  readonly id: string
  /** ‏نصُّ الخيار: الاسمُ ثمّ المعرّف، والسعرُ، والعلامة. */
  readonly text: string
  readonly task: ModelTask | null
  readonly thinking: boolean
  readonly recommended: boolean
  readonly why: string | null
  readonly priceIn: number | null
  readonly priceOut: number | null
}

export interface CatalogGroup {
  readonly label: string
  readonly items: readonly CatalogItem[]
}

function price(m: ModelChoice): string {
  if (m.priceIn === null && m.priceOut === null) return ''
  const f = (n: number | null): string => (n === null ? '؟' : `$${Number(n.toFixed(3))}`)
  return ` · ${f(m.priceIn)} / ${f(m.priceOut)} للمليون`
}

/** ‏يصنّف الفهرسَ مجموعاتٍ لمهمّةٍ ومزوّد — الموصى به أوّلًا، ثمّ صنفُ المهمّة، ثمّ الباقي. */
export function catalogGroups(
  models: readonly ModelChoice[],
  opts: { readonly provider: string; readonly task: string },
): CatalogGroup[] {
  const want: ModelTask = opts.task === 'image' ? 'image' : opts.task === 'video' ? 'video' : 'text'
  const prefs = (PREFERENCE[opts.task as TaskName] ?? []).filter((p) => p.provider === opts.provider)
  const items = models.map((m): CatalogItem => {
    const pref = prefs.find((p) => p.model === m.id)
    const thinking = isThinking(m.id)
    const name = modelName(m.id)
    const head = name === m.id ? m.id : `${name} — ${m.id}`
    return {
      id: m.id,
      text: `${pref === undefined ? '' : '★ '}${head}${price(m)}${thinking ? ' · يفكّر' : ''}`,
      task: m.task,
      thinking,
      recommended: pref !== undefined,
      why: pref?.why ?? null,
      priceIn: m.priceIn,
      priceOut: m.priceOut,
    }
  })
  const rec = items
    .filter((i) => i.recommended)
    .sort((a, b) => prefs.findIndex((p) => p.model === a.id) - prefs.findIndex((p) => p.model === b.id))
  const rest = items.filter((i) => !i.recommended)
  // ‏وما لا يفكّر يسبق ما يفكّر في المجموعة نفسِها — فهو الأسلمُ لجوابٍ منظَّمٍ طويل
  const order = (a: CatalogItem, b: CatalogItem): number => Number(a.thinking) - Number(b.thinking) || a.id.localeCompare(b.id)
  const groups: CatalogGroup[] = []
  if (rec.length > 0) groups.push({ label: 'موصى به لهذه المهمّة', items: rec })
  const fit = rest.filter((i) => i.task === want || i.task === null).sort(order)
  if (fit.length > 0) groups.push({ label: TASK_GROUP[want], items: fit })
  for (const t of ['text', 'image', 'video', 'embedding', 'other'] as const) {
    if (t === want) continue
    const g = rest.filter((i) => i.task === t).sort(order)
    if (g.length > 0) groups.push({ label: TASK_GROUP[t], items: g })
  }
  return groups
}

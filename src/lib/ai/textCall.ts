/**
 * **النداءُ النصّيّ بسلسلة المفاتيح** (D-349) — ما كان يُكتب ثلاثَ مرّات (الكتابة، والخطّة، وموجزُ الصورة) مرّةً واحدة:
 *
 *   ١ · الإيقافُ وسقفُ الإنفاق للمهمّة (`checkAllowance`) قبل أيّ نداء — مرّةً للسلسلة كلِّها
 *   ٢ · المرشّحون بترتيب المهمّة (`candidates`)، ثمّ لكلّ محاولة:
 *       سقفُ المزوّد ← مفتاحُه (الخزانةُ أوّلًا ثمّ سرُّ Worker للمدمَج، D-346) ← النداءُ بلهجته ← **الكلفةُ في الدفتر قبل القراءة** (D-008)
 *   ٣ · المتعذّرُ (مفتاحٌ مرفوض، حدّ، انشغال، سقف، لا مفتاح) يُعلَّم ويُنتقل منه — وما سواه يُتوقّف عنده
 *
 * والجوابُ لا يُقرأ هنا: من طلبه يحكم فيه.
 */
import { recordCost } from '../cost'
import { blockerReason, checkAllowance, checkProvider, type Duty } from '../limits'
import { costOf, getProvider, resolveKey, type Provider } from '../providers'
import { anthropicChat } from './anthropic'
import { chatCompletion } from './openaiCompat'
import { portableSchema } from './portableSchema'
import { spentOf, type Spent } from './spent'
import { readRoutes } from './routes'
import { candidates, nextFrom, runChain } from './chain'
import type { TaskName } from './registry'
import type { Db } from '../tokens'

export interface TextDeps {
  readonly db: Db
  readonly encKey: string
  readonly workerSecrets: Readonly<Record<string, string | undefined>>
  readonly fetchImpl?: typeof fetch
}

export interface TextCall {
  readonly task: TaskName & Duty
  readonly system: string
  readonly user: string
  /** المخطّطُ الخامّ — يُحمَل إلى Anthropic محمولًا (D-164)، وبه يُطلب JSON من غيره. */
  readonly schema?: Readonly<Record<string, unknown>>
  /** يُطلب JSON من المتوافق ولو بلا مخطّط. */
  readonly json?: boolean
  /** اسمُ العمليّة في الدفتر، ويُلحَق به النموذج. */
  readonly operation: string
  readonly refId?: string
  /** منظّمةُ المنادي: سقفُها بعد العامّ، وصفُّ الدفتر باسمها إن أُعطيت (`ledgerOrg`). */
  readonly org?: string
  readonly ledgerOrg?: boolean
  readonly effort?: 'low' | 'medium' | 'high'
  readonly maxTokens?: number
  readonly timeoutMs?: number
  /** مزوّدٌ بعينه للمقارنة (D-244): وحدَه بلا سلسلة. */
  readonly provider?: string
  /** موجزُ الصورة يمرّ بحارس الصورة عند منادِيه لا بحارس الكتابة — كما كان قبل السلسلة. */
  readonly skipAllowance?: boolean
}

export type TextOut =
  | { readonly kind: 'ok'; readonly text: string; readonly spent: Spent; readonly cost: number; readonly provider: string; readonly model: string }
  | { readonly kind: 'blocked'; readonly reason: string }
  | { readonly kind: 'failed'; readonly reason: string; readonly retryable: boolean; readonly cost: number; readonly called: boolean }

/** سرُّ Worker للمدمَج باسمه وحدَه — والصفُّ الذي أضافه المالكُ مفتاحُه في الخزانة لا غير. */
const BUILTIN_SECRET: Readonly<Record<string, string>> = { anthropic: 'ANTHROPIC_API_KEY', gemini: 'GEMINI_API_KEY' }

/** نموذجُ مزوّدٍ بلا نموذجٍ في صفّه: ما وُجّهت إليه مهمّةٌ أخرى عنده، وإلّا نموذجُ التوجيه — فلا يُرسل نموذجُ مزوّدٍ إلى غيره. */
export async function modelFor(db: Db, provider: string, fallback: string): Promise<string> {
  const other = (await readRoutes(db)).find((r) => r.provider === provider)
  return other?.model ?? fallback
}

/** لا مرشّحَ مفعَّلًا: يُقال لماذا بأوّل المهمّة — غائبٌ أو معطَّل — لا جملةٌ عامّة. */
const FOR_TASK: Readonly<Record<string, string>> = { draft: 'للكتابة', plan: 'للخطّة', analyze: 'للفهم' }
async function noneReason(db: Db, task: TaskName, override?: string): Promise<string> {
  const name = override !== undefined && override !== '' ? override : (await readRoutes(db)).find((r) => r.task === task)?.provider ?? ''
  const first = name === '' ? null : await getProvider(db, name)
  if (first === null) return `لا مزوّد ${FOR_TASK[task] ?? ''} (${name})`.replace('  ', ' ')
  return `${first.label} معطَّل — فعّله في «المزوّدون» أو أضف إلى السلسلة مفتاحًا آخر`
}

export async function callText(deps: TextDeps, call: TextCall, now: Date = new Date()): Promise<TextOut> {
  if (call.skipAllowance !== true) {
    const allowance = await checkAllowance(deps.db, call.task, call.org)
    if (allowance.blocker !== null) return { kind: 'blocked', reason: blockerReason(allowance.blocker) }
  }

  const list = await candidates(deps.db, call.task, now, call.provider)
  if (list.length === 0) return { kind: 'failed', reason: await noneReason(deps.db, call.task, call.provider), retryable: false, cost: 0, called: false }
  const firstModel = list[0]?.model ?? ''
  let called = false

  const done = await runChain<{ text: string; spent: Spent; cost: number; model: string }>(deps.db, list, now, async (c) => {
    const provider: Provider = c.provider
    const perProvider = await checkProvider(deps.db, provider.name)
    if (perProvider !== null) return { kind: 'next', why: 'cap', reason: blockerReason(perProvider) }

    const model = c.model !== '' ? c.model : provider.model ?? (await modelFor(deps.db, provider.name, firstModel))
    const secret = provider.builtin ? BUILTIN_SECRET[provider.name] : undefined
    const resolved = await resolveKey(deps.db, deps.encKey, provider.name, secret === undefined ? undefined : deps.workerSecrets[secret])
    if (resolved.key === null) return { kind: 'next', why: 'nokey', reason: `لا مفتاح لـ ${provider.label}` }
    if (provider.kind !== 'anthropic' && provider.baseUrl === null) return { kind: 'next', why: 'nokey', reason: `لا عنوان لـ ${provider.label}` }

    // ‏الكلفةُ تُعرَّف قبل النداء: يحتاجها الناجح، والجوابُ الذي وصل ثمّ رُدّ (D-164)
    const charge = async (spent: Spent): Promise<number> => {
      const priced = costOf(provider, spent)
      const units = spent.inputTokens + spent.cachedInputTokens + spent.outputTokens
      await recordCost(deps.db, {
        provider: provider.name,
        operation: `${call.operation}:${spent.model}`,
        units,
        unitCost: units === 0 ? 0 : priced.total / units,
        ...(call.refId === undefined ? {} : { refId: call.refId }),
        ...(call.ledgerOrg === true && call.org !== undefined ? { org: call.org } : {}),
      })
      return priced.total
    }

    called = true
    let text: string
    let spent: Spent
    try {
      if (provider.kind === 'anthropic') {
        const result = await anthropicChat({
          apiKey: resolved.key, model, system: call.system, user: call.user,
          ...(call.schema === undefined ? {} : { schema: portableSchema(call.schema) }),
          ...(call.effort === undefined ? {} : { effort: call.effort }),
          ...(deps.fetchImpl === undefined ? {} : { fetchImpl: deps.fetchImpl }),
        })
        text = result.text
        spent = result
      } else {
        const result = await chatCompletion({
          baseUrl: provider.baseUrl!, apiKey: resolved.key, model, system: call.system, user: call.user,
          json: call.json ?? call.schema !== undefined,
          ...(call.maxTokens === undefined ? {} : { maxTokens: call.maxTokens }),
          ...(call.timeoutMs === undefined ? {} : { timeoutMs: call.timeoutMs }),
        }, deps.fetchImpl)
        text = result.text
        spent = { ...result.usage, cachedInputTokens: 0, model: result.model }
      }
    } catch (error) {
      const late = spentOf(error)
      const paid = late === null ? 0 : await charge(late)
      const reason = error instanceof Error ? error.message : 'نداء فشل'
      const why = late === null ? nextFrom(error) : null
      if (why !== null) return { kind: 'next', why, reason }
      const retryable = typeof error === 'object' && error !== null && 'retryable' in error
        ? Boolean((error as { retryable: unknown }).retryable) : true
      return { kind: 'stop', reason, retryable, cost: paid }
    }
    const cost = await charge(spent)
    return { kind: 'ok', value: { text, spent, cost, model: spent.model } }
  })

  if (done.kind === 'ok') return { kind: 'ok', ...done.value, provider: done.provider }
  return { kind: 'failed', reason: done.reason, retryable: done.retryable, cost: done.cost, called }
}

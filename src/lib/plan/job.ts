/**
 * توليدُ الخطّة — أسبوعًا أو أسبوعين أو شهرًا أو شهرين.
 *
 * **الترتيب هو الحوكمة:**
 *
 *   ١ · اجمع المصادر المحلَّلة (ما اختاره المالكُ منها أو كلَّها) وأفكارَه، وما خرج منها
 *   ٢ · إن لم تكفِ مادّةٌ — اخرج بلا نداء
 *   ٣ · **افحص الإيقاف والسقفين وسقفَ المزوّد** (D-019)
 *   ٤ · نادِ المزوّد الموجَّه لمهمّة `plan` — **والشهران نداءان** (شهرٌ ثمّ شهر)
 *   ٥ · **سجّل الكلفة** (D-008) لكلّ نداء
 *   ٦ · اقرأ الجواب وارفض ما لا يصحّ
 *   ٧ · اكتب الخطّة باختيارات المالك، وانسخ سابقةَ المدى نفسه `superseded`
 *
 * والسادسةُ بعد الخامسة عمدا: جوابٌ مشوَّهٌ لا يُلغي كلفةً وقعت.
 * **والخامسةُ تقع في الفشل أيضًا** (D-164) حين وصل جوابٌ ثمّ رُدّ —
 * مبتورًا أو مرفوضًا أو فارغًا. وما لم يصل لا يُكتب له صفّ.
 *
 * **والشهران بنداءين لا بنداءٍ واحد** (D-282): ستّةٌ وخمسون يومًا بثمانيةٍ وأربعين بندًا لا يقرؤها
 * نموذجٌ قراءةً واحدة. فيُنادى للشهر الأوّل ثمّ للثاني من بدايته، وكلٌّ بصفّه في الدفتر، وتُدمج
 * البنودُ خطّةً واحدة. وفشلُ الثاني بعد نجاح الأوّل يُعاد كما هو: ما دُفع دُفع، وما يُكتب يُكتب كاملًا.
 */
import { readBrief, voiceSection } from '../brief'
import { recordCost } from '../cost'
import { blockerReason, checkAllowance, checkProvider } from '../limits'
import { costOf, getProvider, resolveKey } from '../providers'
import { routeFor } from '../ai/routes'
import { anthropicChat } from '../ai/anthropic'
import { chatCompletion } from '../ai/openaiCompat'
import { portableSchema } from '../ai/portableSchema'
import { spentOf, type Spent } from '../ai/spent'
import {
  asSpan, DEFAULT_CHANNELS, EMPTY_CHOICES, maxItems, parsePlan, planSchema, readChoices, systemPrompt, userPrompt, weekStart,
  type Cadence, type Plan, type PlanChoices, type PlanPlatform, type PlanSource, type PlanSpan,
} from './prompt'
import type { Db } from '../tokens'

/** أقلُّ ما يُخطَّط له: مصدرٌ واحدٌ محلَّل لا يصنع أسبوعا — والفكرةُ تُعدّ مادّة. */
export const MIN_SOURCES = 2

export type PlanOutcome =
  | {
      readonly kind: 'planned'
      readonly planId: string
      readonly week: string
      readonly items: number
      readonly dropped: number
      /** لماذا أُسقط ما أُسقط — نصٌّ يُقرأ لا عدد. */
      readonly droppedWhy: string
      readonly cost: number
      /** الوحداتُ المستهلَكة: صفرٌ في الكلفة مع وحداتٍ يعني سعرا لم يُضبط. */
      readonly units: number
      /** كم نداءً دُفع — واحدٌ لكلّ مدًى حتّى الشهر، واثنان للشهرين. */
      readonly calls: number
    }
  /** لا مادّةَ تكفي — يُحلَّل أكثرُ أوّلا. */
  | { readonly kind: 'not_enough'; readonly reason: string }
  | { readonly kind: 'blocked'; readonly reason: string }
  | { readonly kind: 'failed'; readonly reason: string; readonly retryable: boolean }

export interface PlanDeps {
  readonly db: Db
  readonly encKey: string
  readonly workerSecrets: Readonly<Record<string, string | undefined>>
  readonly fetchImpl?: typeof fetch
  readonly now?: () => Date
  /** العميلُ الذي تُبنى له الخطّة (D-256) — وغيابُه المالك كما كان. */
  readonly org?: string
  /** المدى (D-256 · D-282). */
  readonly span?: PlanSpan
  /** يومُ البداية `YYYY-MM-DD` — وغيابُه الأحدُ القادم. */
  readonly startDay?: string
  /** القنواتُ المختارة — وغيابُها `DEFAULT_CHANNELS`. */
  readonly channels?: readonly PlanPlatform[]
  /** إيقاعُ كلّ قناة في الأسبوع. */
  readonly cadence?: Cadence
  /** المصادرُ المختارة بمعرّفاتها، أو «الكلّ». */
  readonly sources?: readonly string[] | 'all'
  /** أفكارٌ بكلمات المالك — تدخل مصادرَ بمعرّف `idea:<n>`. */
  readonly ideas?: readonly string[]
  /** أصولٌ اختارها المالكُ للخطّة — تُحفظ معها ليُختار منها للبنود. */
  readonly assets?: readonly string[]
  /** أتُرسَم صورةٌ مع كلّ منشور؟ `undefined` يعني الإعدادَ العامّ كما كان. */
  readonly autoImage?: boolean
}

interface Row {
  id: string
  name: string
  summary: string | null
  themes_json: string | null
  worth_score: number | null
  used: number
}

/**
 * المصادرُ المؤهَّلة.
 *
 * والفرزُ بالاستحقاق ثمّ القصُّ على خمسةَ عشر: وصفٌ يحمل كلَّ مصدرٍ في
 * القاعدة يكبر بلا حدّ ويُدفع ثمنُه في كلّ نداء، **والنموذجُ لا يقرأ
 * الخمسين قراءةً واحدة**. والأعلى استحقاقا هو ما يُخطَّط منه أصلا.
 *
 * **وما اختاره المالكُ وحده حين يختار** (D-282): القائمةُ تُقصر على معرّفاته.
 */
export async function eligible(db: Db, limit = 15, org = 'org_owner', only: readonly string[] | 'all' = 'all'): Promise<PlanSource[]> {
  const chosen = only === 'all' ? [] : only.slice(0, 200)
  const filter = chosen.length === 0 ? '' : ` AND s.id IN (${chosen.map(() => '?').join(',')})`
  const { results } = await db
    .prepare(
      `SELECT s.id, s.name, i.summary, i.themes_json, i.worth_score,
              (SELECT count(*) FROM posts p
                WHERE p.source_id = s.id AND p.org_id = s.org_id AND p.status <> 'rejected') AS used
         FROM sources s JOIN content_items i ON i.source_id = s.id AND i.org_id = s.org_id
        WHERE s.org_id = ? AND i.summary IS NOT NULL AND i.summary <> ''${filter}
        ORDER BY i.worth_score DESC
        LIMIT ?`,
    )
    .bind(org, ...chosen, limit)
    .all<Row>()

  return results.map((row) => {
    let themes: string[] = []
    try {
      const parsed = JSON.parse(row.themes_json ?? '{}') as { themes?: unknown }
      themes = Array.isArray(parsed.themes) ? parsed.themes.map(String) : []
    } catch {
      themes = []
    }
    return {
      id: row.id,
      name: row.name,
      summary: row.summary ?? '',
      themes,
      worth: row.worth_score ?? 0,
      used: row.used,
    }
  })
}

/** الفكرةُ مصدرًا: معرّفُها `idea:<n>` واسمُها نصُّها، فيختارها النموذجُ كما يختار مصدرًا. */
export function ideaSources(ideas: readonly string[]): PlanSource[] {
  return ideas.map((text, i) => ({
    id: `idea:${i + 1}`, name: text, summary: 'فكرةٌ بكلمات المالك — تُكتب منها لا من مصدرٍ محلَّل.', themes: [], worth: 1, used: 0,
  }))
}

/** معرّفُ فكرةٍ في الخطّة: `idea:<n>`، ونصُّها في اختياراتها. */
export function ideaOf(sourceId: string, choices: PlanChoices): string | null {
  const m = /^idea:(\d+)$/.exec(sourceId)
  if (m === null) return null
  return choices.ideas[Number(m[1]) - 1] ?? null
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

type Called =
  | { readonly ok: true; readonly plan: Plan; readonly dropped: number; readonly droppedWhy: string; readonly cost: number; readonly units: number; readonly model: string }
  | { readonly ok: false; readonly outcome: PlanOutcome }

interface Caller {
  readonly deps: PlanDeps
  readonly sources: readonly PlanSource[]
  readonly channels: readonly PlanPlatform[]
  readonly cadence: Cadence
  readonly voice: string
}

/** نداءٌ واحدٌ لمدًى واحد — الخطواتُ ٣ إلى ٦، وصفُّ الدفتر فيه. */
async function planOnce(ctx: Caller, start: string, span: PlanSpan): Promise<Called> {
  const { deps, sources, channels, cadence } = ctx
  const fail = (outcome: PlanOutcome): Called => ({ ok: false, outcome })

  // ٣ · الحارس قبل النداء
  const allowance = await checkAllowance(deps.db, 'plan')
  if (allowance.blocker !== null) return fail({ kind: 'blocked', reason: blockerReason(allowance.blocker) })

  const route = await routeFor(deps.db, 'plan')
  const provider = await getProvider(deps.db, route.provider)
  if (provider === null) return fail({ kind: 'failed', reason: `مزوّد غير موجود: ${route.provider}`, retryable: false })
  const perProvider = await checkProvider(deps.db, provider.name)
  if (perProvider !== null) return fail({ kind: 'blocked', reason: blockerReason(perProvider) })

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
  if (resolved.key === null) return fail({ kind: 'failed', reason: `لا مفتاح لـ ${provider.label}`, retryable: false })

  // خطوةُ الكلفة (٥) تُعرَّف قبل النداء لأنّ مسارين يحتاجانها: الجوابُ
  // الناجح، والجوابُ الذي وصل ثمّ رُدّ (D-164). صفٌّ واحدٌ بشكلٍ واحد
  const charge = async (spent: Spent): Promise<{ total: number; units: number }> => {
    const priced = costOf(provider, spent)
    const units = spent.inputTokens + spent.cachedInputTokens + spent.outputTokens
    await recordCost(deps.db, {
      provider: provider.name,
      operation: `plan:${spent.model}`,
      units,
      unitCost: units === 0 ? 0 : priced.total / units,
      refId: start,
      ...(deps.org === undefined ? {} : { org: deps.org }),
    })
    return { total: priced.total, units }
  }

  // ٤ · النداء
  const options = { channels, cadence }
  const system = systemPrompt(options)
  // ‏وموجزُ العميل (D-257): هدفُه وجمهورُه ونبرتُه وما لا يُقال — وفارغٌ إن لم يُكتب
  const body = userPrompt(sources, start, span, options)
  const user = ctx.voice === '' ? body : `${ctx.voice}\n\n${body}`
  let text: string
  let spent: Spent
  try {
    if (provider.kind === 'anthropic') {
      const result = await anthropicChat({
        apiKey: resolved.key,
        model: route.model,
        system,
        user,
        // المحمولُ لا الخامّ (D-164): `minLength` و`maxItems` يُطويان وصفًا،
        // وحدودُهما في `parsePlan`
        schema: portableSchema(planSchema(channels, maxItems(span, cadence))),
        // حكمٌ يقرّر إنفاقَ مدًى كامل — يُعطى جهدَه
        effort: 'high',
        ...(deps.fetchImpl === undefined ? {} : { fetchImpl: deps.fetchImpl }),
      })
      text = result.text
      spent = result
    } else {
      if (provider.baseUrl === null) return fail({ kind: 'failed', reason: 'لا عنوان لهذا المزوّد', retryable: false })
      const result = await chatCompletion(
        { baseUrl: provider.baseUrl, apiKey: resolved.key, model: route.model, system, user, json: true },
        deps.fetchImpl ?? fetch,
      )
      text = result.text
      spent = { ...result.usage, cachedInputTokens: 0, model: result.model }
    }
  } catch (error) {
    // جوابٌ وصل ثمّ رُدّ حوسِب عليه: يُكتب قبل أن يُعاد الفشل (D-164)
    const late = spentOf(error)
    if (late !== null) await charge(late)
    const retryable =
      typeof error === 'object' && error !== null && 'retryable' in error
        ? Boolean((error as { retryable: unknown }).retryable)
        : true
    return fail({ kind: 'failed', reason: error instanceof Error ? error.message : 'نداء فشل', retryable })
  }

  // ٥ · الكلفة قبل القراءة
  const priced = await charge(spent)

  // ٦ · القراءة — وما لا يصحّ يُسقَط
  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(text)
  } catch {
    return fail({ kind: 'failed', reason: 'جواب النموذج ليس JSON صالحا', retryable: true })
  }
  const known = new Set(sources.map((s) => s.id))
  const read = parsePlan(parsedJson, known, start, span, options)
  if (!read.ok) return fail({ kind: 'failed', reason: read.reason, retryable: true })
  return { ok: true, plan: read.plan, dropped: read.dropped, droppedWhy: read.droppedWhy, cost: priced.total, units: priced.units, model: spent.model }
}

export async function planSpan(deps: PlanDeps): Promise<PlanOutcome> {
  const now = (deps.now ?? (() => new Date()))()
  const org = deps.org ?? 'org_owner'
  const span: PlanSpan = deps.span ?? 'week'
  const start = deps.startDay !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(deps.startDay) && !Number.isNaN(Date.parse(`${deps.startDay}T00:00:00Z`))
    ? deps.startDay
    : weekStart(now)
  const channels = deps.channels === undefined || deps.channels.length === 0 ? DEFAULT_CHANNELS : [...new Set(deps.channels)]
  const cadence: Cadence = deps.cadence ?? {}
  const ideas = (deps.ideas ?? []).map((t) => t.trim()).filter((t) => t !== '').slice(0, 20)
  const only = deps.sources ?? 'all'

  // ١ و ٢ · المادّة — مصادرُ العميل وحدَه (أو ما اختاره منها)، وأفكارُه
  const limit = span === 'week' ? 15 : 30
  const sources = [...(await eligible(deps.db, limit, org, only)), ...ideaSources(ideas)]
  if (sources.length < MIN_SOURCES) {
    return {
      kind: 'not_enough',
      reason: `${sources.length} مصدرا محلَّلا — والخطّة تحتاج ${MIN_SOURCES} على الأقلّ`,
    }
  }

  const ctx: Caller = { deps, sources, channels, cadence, voice: voiceSection(await readBrief(deps.db, org)) }

  // ٣ إلى ٦ · نداءٌ لكلّ شهرٍ على الأكثر — والشهران شهرٌ ثمّ شهر
  const windows: { start: string; span: PlanSpan }[] = span === '2months'
    ? [{ start, span: 'month' }, { start: addDays(start, 28), span: 'month' }]
    : [{ start, span }]
  const parts: Extract<Called, { ok: true }>[] = []
  for (const w of windows) {
    const called = await planOnce(ctx, w.start, w.span)
    if (!called.ok) return called.outcome
    parts.push(called)
  }
  const merged: Plan = {
    rationale: parts.map((p) => p.plan.rationale).filter((r) => r !== '').join(' ثمّ '),
    items: parts.flatMap((p) => p.plan.items),
  }
  const dropped = parts.reduce((n, p) => n + p.dropped, 0)
  const droppedWhy = parts.map((p) => p.droppedWhy).filter((w) => w !== '').join('، ')
  const cost = parts.reduce((n, p) => n + p.cost, 0)
  const units = parts.reduce((n, p) => n + p.units, 0)
  const ran = parts[0]?.model ?? ''

  // ٧ · الكتابة — والسابقةُ لهذا المدى تُنسَخ لا تُحذف
  const choices: PlanChoices = {
    channels, cadence, sources: only === 'all' ? 'all' : [...only], ideas, assets: [...(deps.assets ?? [])],
    autoImage: deps.autoImage === true, startDay: start,
  }
  const planId = crypto.randomUUID()
  await deps.db
    .prepare("UPDATE plans SET status = 'superseded' WHERE org_id = ? AND week_start = ? AND span = ? AND status <> 'superseded'")
    .bind(org, start, span)
    .run()
  // `(org_id, week_start, span)` فريدٌ في المخطّط (0032 · 0037)، فالسابقةُ لهذا العميل وهذا المدى تُزال بعد أن نُسخت حالُها —
  // وهي كلفةٌ وقعت، فتبقى في الدفتر بمعرّف البداية
  // ‏الحذفُ والإدراجُ معا أو لا شيء (D-270): سقوطٌ بينهما كان يضيّع خطّةَ المدى ودفعَ ثمنها
  const remove = deps.db.prepare('DELETE FROM plans WHERE org_id = ? AND week_start = ? AND span = ?').bind(org, start, span)
  const insert = deps.db
    .prepare('INSERT INTO plans (id, week_start, plan_json, model, status, org_id, span, choices_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(planId, start, JSON.stringify(merged), ran, 'draft', org, span, JSON.stringify(choices))
  if (deps.db.batch !== undefined) await deps.db.batch([remove, insert])
  else { await remove.run(); await insert.run() }

  return {
    kind: 'planned',
    planId,
    week: start,
    items: merged.items.length,
    dropped,
    droppedWhy,
    cost,
    units,
    calls: parts.length,
  }
}

export interface StoredPlan {
  readonly id: string
  readonly week: string
  readonly plan: Plan
  readonly model: string
  readonly status: 'draft' | 'approved' | 'superseded'
  readonly createdAt: string
  /** وغيابُه أسبوعٌ — خطّةٌ قُرئت قبل 0032. */
  readonly span?: PlanSpan
  /** اختياراتُ المالك (D-282) — فارغةٌ لخطّةٍ قبل 0037. */
  readonly choices: PlanChoices
}

/** أحدثُ خطّةٍ لأقرب مدًى. */
export async function latestPlan(db: Db, org = 'org_owner'): Promise<StoredPlan | null> {
  try {
    const row = await db
      .prepare(
        `SELECT id, week_start, plan_json, model, status, created_at, span, choices_json FROM plans
          WHERE org_id = ? AND status <> 'superseded' ORDER BY week_start DESC, created_at DESC LIMIT 1`,
      )
      .bind(org)
      .first<Record<string, string>>()
    if (row === null) return null
    return {
      id: String(row['id']),
      week: String(row['week_start']),
      plan: JSON.parse(String(row['plan_json'])) as Plan,
      model: String(row['model']),
      status: row['status'] === 'approved' ? 'approved' : 'draft',
      createdAt: String(row['created_at']),
      span: asSpan(row['span']),
      choices: row['choices_json'] === undefined ? EMPTY_CHOICES : readChoices(row['choices_json']),
    }
  } catch {
    // جدولٌ لم يُرحَّل أو JSON فاسد: لوحةٌ بلا خطّةٍ خيرٌ من لوحةٍ لا تُفتح
    return null
  }
}

/** اعتمادُ الخطّة — إقرارٌ بالمنطق، **ولا يكتب نصّا ولا يُنفق**. */
export async function approvePlan(db: Db, planId: string, org = 'org_owner'): Promise<boolean> {
  const row = await db
    .prepare('SELECT status FROM plans WHERE id = ? AND org_id = ?')
    .bind(planId, org)
    .first<{ status: string }>()
  if (row === null || row.status !== 'draft') return false
  await db.prepare("UPDATE plans SET status = 'approved' WHERE id = ? AND org_id = ?").bind(planId, org).run()
  return true
}

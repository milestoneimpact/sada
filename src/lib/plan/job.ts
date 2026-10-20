/**
 * توليدُ الخطّة الأسبوعيّة.
 *
 * **الترتيب هو الحوكمة:**
 *
 *   ١ · اجمع المصادر المحلَّلة وما خرج منها
 *   ٢ · إن لم تكفِ مادّةٌ — اخرج بلا نداء
 *   ٣ · **افحص الإيقاف والسقفين وسقفَ المزوّد** (D-019)
 *   ٤ · نادِ المزوّد الموجَّه لمهمّة `plan`
 *   ٥ · **سجّل الكلفة** (D-008)
 *   ٦ · اقرأ الجواب وارفض ما لا يصحّ
 *   ٧ · اكتب الخطّة، وانسخ سابقةَ الأسبوع نفسه `superseded`
 *
 * والسادسةُ بعد الخامسة عمدا: جوابٌ مشوَّهٌ لا يُلغي كلفةً وقعت.
 * **والخامسةُ تقع في الفشل أيضًا** (D-164) حين وصل جوابٌ ثمّ رُدّ —
 * مبتورًا أو مرفوضًا أو فارغًا. وما لم يصل لا يُكتب له صفّ.
 */
import { recordCost } from '../cost'
import { blockerReason, checkAllowance, checkProvider } from '../limits'
import { costOf, getProvider, resolveKey } from '../providers'
import { routeFor } from '../ai/routes'
import { anthropicChat } from '../ai/anthropic'
import { chatCompletion } from '../ai/openaiCompat'
import { portableSchema } from '../ai/portableSchema'
import { spentOf, type Spent } from '../ai/spent'
import {
  PLAN_SCHEMA, parsePlan, systemPrompt, userPrompt, weekStart,
  type Plan, type PlanSource,
} from './prompt'
import type { Db } from '../tokens'

/** أقلُّ ما يُخطَّط له: مصدرٌ واحدٌ محلَّل لا يصنع أسبوعا. */
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
 */
export async function eligible(db: Db, limit = 15): Promise<PlanSource[]> {
  const { results } = await db
    .prepare(
      `SELECT s.id, s.name, i.summary, i.themes_json, i.worth_score,
              (SELECT count(*) FROM posts p
                WHERE p.source_id = s.id AND p.status <> 'rejected') AS used
         FROM sources s JOIN content_items i ON i.source_id = s.id
        WHERE i.summary IS NOT NULL AND i.summary <> ''
        ORDER BY i.worth_score DESC
        LIMIT ?`,
    )
    .bind(limit)
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

export async function planWeek(deps: PlanDeps): Promise<PlanOutcome> {
  const now = (deps.now ?? (() => new Date()))()
  const week = weekStart(now)

  // ١ و ٢ · المادّة
  const sources = await eligible(deps.db)
  if (sources.length < MIN_SOURCES) {
    return {
      kind: 'not_enough',
      reason: `${sources.length} مصدرا محلَّلا — والخطّةُ تحتاج ${MIN_SOURCES} على الأقلّ`,
    }
  }

  // ٣ · الحارس قبل النداء
  const allowance = await checkAllowance(deps.db, 'plan')
  if (allowance.blocker !== null) {
    return { kind: 'blocked', reason: blockerReason(allowance.blocker) }
  }

  const route = await routeFor(deps.db, 'plan')

  const provider = await getProvider(deps.db, route.provider)
  if (provider === null) {
    return { kind: 'failed', reason: `مزوّدٌ غير موجود: ${route.provider}`, retryable: false }
  }
  const perProvider = await checkProvider(deps.db, provider.name)
  if (perProvider !== null) return { kind: 'blocked', reason: blockerReason(perProvider) }

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
      refId: week,
    })
    return { total: priced.total, units }
  }

  // ٤ · النداء
  const system = systemPrompt()
  const user = userPrompt(sources, week)
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
        schema: portableSchema(PLAN_SCHEMA),
        // حكمٌ يقرّر إنفاقَ أسبوعٍ كامل — يُعطى جهدَه
        effort: 'high',
        ...(deps.fetchImpl === undefined ? {} : { fetchImpl: deps.fetchImpl }),
      })
      text = result.text
      spent = result
    } else {
      if (provider.baseUrl === null) {
        return { kind: 'failed', reason: 'لا عنوان لهذا المزوّد', retryable: false }
      }
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
    return { kind: 'failed', reason: error instanceof Error ? error.message : 'نداءٌ فشل', retryable }
  }

  // ٥ · الكلفة قبل القراءة
  const priced = await charge(spent)
  const ran = spent.model
  const units = priced.units

  // ٦ · القراءة — وما لا يصحّ يُسقَط
  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(text)
  } catch {
    return { kind: 'failed', reason: 'جوابُ النموذج ليس JSON صالحا', retryable: true }
  }
  const known = new Set(sources.map((s) => s.id))
  const read = parsePlan(parsedJson, known, week)
  if (!read.ok) return { kind: 'failed', reason: read.reason, retryable: true }

  // ٧ · الكتابة — والسابقةُ لهذا الأسبوع تُنسَخ لا تُحذف
  const planId = crypto.randomUUID()
  await deps.db
    .prepare("UPDATE plans SET status = 'superseded' WHERE week_start = ? AND status <> 'superseded'")
    .bind(week)
    .run()
  // `week_start` فريدٌ في المخطّط، فالسابقةُ تُزال بعد أن نُسخت حالُها —
  // وهي كلفةٌ وقعت، فتبقى في الدفتر بمعرّف الأسبوع
  await deps.db.prepare("DELETE FROM plans WHERE week_start = ?").bind(week).run()
  await deps.db
    .prepare('INSERT INTO plans (id, week_start, plan_json, model, status, org_id) VALUES (?, ?, ?, ?, ?, \'org_owner\')')
    .bind(planId, week, JSON.stringify(read.plan), ran, 'draft')
    .run()

  return {
    kind: 'planned',
    planId,
    week,
    items: read.plan.items.length,
    dropped: read.dropped,
    droppedWhy: read.droppedWhy,
    cost: priced.total,
    units,
  }
}

export interface StoredPlan {
  readonly id: string
  readonly week: string
  readonly plan: Plan
  readonly model: string
  readonly status: 'draft' | 'approved' | 'superseded'
  readonly createdAt: string
}

/** أحدثُ خطّةٍ لأقرب أسبوع. */
export async function latestPlan(db: Db): Promise<StoredPlan | null> {
  try {
    const row = await db
      .prepare(
        `SELECT id, week_start, plan_json, model, status, created_at FROM plans
          WHERE status <> 'superseded' ORDER BY week_start DESC LIMIT 1`,
      )
      .first<Record<string, string>>()
    if (row === null) return null
    return {
      id: String(row['id']),
      week: String(row['week_start']),
      plan: JSON.parse(String(row['plan_json'])) as Plan,
      model: String(row['model']),
      status: row['status'] === 'approved' ? 'approved' : 'draft',
      createdAt: String(row['created_at']),
    }
  } catch {
    // جدولٌ لم يُرحَّل أو JSON فاسد: لوحةٌ بلا خطّةٍ خيرٌ من لوحةٍ لا تُفتح
    return null
  }
}

/** اعتمادُ الخطّة — إقرارٌ بالمنطق، **ولا يكتب نصّا ولا يُنفق**. */
export async function approvePlan(db: Db, planId: string): Promise<boolean> {
  const row = await db
    .prepare('SELECT status FROM plans WHERE id = ?')
    .bind(planId)
    .first<{ status: string }>()
  if (row === null || row.status !== 'draft') return false
  await db.prepare("UPDATE plans SET status = 'approved' WHERE id = ?").bind(planId).run()
  return true
}

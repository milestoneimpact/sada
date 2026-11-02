/**
 * **جدولةُ الخطّة على أرجح الأوقات** (D-261 · AGENCY-PLAN و-٥) — ما اعتمده المالكُ من مسوّدات الخطّة يُجدوَل بضغطةٍ واحدة.
 *
 * الموعدُ يومُ البند كما في اللوحة (بعد السحب والنقل)، **والساعةُ أرجحُ ساعات المنصّة إن قِيست** (`readPeaks`: ثمانيةُ منشوراتٍ
 * فأكثر)، وإلّا ساعةُ البند كما كتبها المخطِّط. وموعدٌ مضى يُرحَّل يومًا فيومًا إلى أوّل موعدٍ قادمٍ بالساعة نفسِها.
 *
 * **ولا يُجدوَل إلّا المعتمَد**: `schedulePost` نفسُها بحرّاسها (الحال، والوسيط، والحساب النشط، والموعد في المستقبل). والمسوّدةُ
 * التي لم تُعتمد تبقى تنتظر، ولا شيءَ يُنشر لم يقرأه المالك.
 */
import type { Db } from '../tokens'
import { schedulePost } from '../schedule/job'
import { approveMany } from '../draft/store'
import { readPeaks } from '../schedule/peak'
import type { StoredPlan } from './job'

export interface PlanSchedule {
  readonly scheduled: number
  readonly skipped: readonly { readonly postId: string; readonly reason: string }[]
}

/** الموعدُ `YYYY-MM-DDTHH:MM` بـ UTC — في المستقبل دائمًا. */
export function slotFor(day: string, time: string, peakHour: number | null, now: Date): string {
  const hhmm = peakHour === null ? time : `${String(peakHour).padStart(2, '0')}:00`
  const at = new Date(`${day}T${hhmm}:00Z`)
  while (at.getTime() <= now.getTime()) at.setUTCDate(at.getUTCDate() + 1)
  return at.toISOString().slice(0, 16)
}

/**
 * أين الخطّةُ من الرحلة: كم مسوّدةً كُتبت منها، وكم منها معتمَدٌ لم يُجدوَل — يقرؤها شريطُ الرحلة وزرُّه.
 * **وصفرٌ مكتوبٌ بعد «ابدأ» يعني «يُكتب الآن»** لا «انتهى».
 */
export async function planProgress(db: Db, org: string, planId: string): Promise<{ readonly written: number; readonly ready: number; readonly pending: number }> {
  const row = await db
    .prepare(`SELECT COUNT(*) AS written, COALESCE(SUM(status IN ('approved', 'edited')), 0) AS ready,
                     COALESCE(SUM(status = 'draft'), 0) AS pending
                FROM posts WHERE org_id = ? AND plan_id = ?`)
    .bind(org, planId)
    .first<{ written: number; ready: number; pending: number }>()
    .catch(() => null)
  // ‏و`pending` ما ينتظر قرارَ المالك من هذه الخطّة — عدُّ «اعتمد الخطّة كاملةً» (D-282)
  return { written: row?.written ?? 0, ready: row?.ready ?? 0, pending: row?.pending ?? 0 }
}

/**
 * **اعتمادُ الخطّة كاملةً** (D-282): كلُّ مسوّدةٍ من هذه الخطّة تنتظر القرار تُعتمَد بـ`approveMany` نفسِها (فحصُها
 * و`approved_by` و`approved_at` كما في الاعتماد الفرديّ). **ولا يُنشر شيء**: الجدولةُ خطوةٌ بعدها.
 */
export async function approvePlanDrafts(db: Db, org: string, planId: string, by: string): Promise<{ readonly done: number; readonly ids?: readonly string[]; readonly failed: readonly string[] }> {
  const { results } = await db
    .prepare("SELECT id FROM posts WHERE org_id = ? AND plan_id = ? AND status = 'draft' ORDER BY created_at")
    .bind(org, planId)
    .all<{ id: string }>()
  if (results.length === 0) return { done: 0, failed: [] }
  const result = await approveMany(db, org, results.map((r) => r.id), by)
  return { done: result.done.length, ids: result.done, failed: result.failed.map((f) => f.reason) }
}

function readRefs(raw: string | null): string[] {
  try {
    const parsed = JSON.parse(raw ?? '[]') as unknown
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export async function schedulePlan(db: Db, org: string, plan: StoredPlan, now: Date): Promise<PlanSchedule> {
  const { results: posts } = await db
    .prepare("SELECT id, platform, source_id, source_refs FROM posts WHERE org_id = ? AND plan_id = ? AND status IN ('approved', 'edited')")
    .bind(org, plan.id)
    .all<{ id: string; platform: string; source_id: string | null; source_refs: string | null }>()
  const peaks = new Map<string, number | null>()
  const accounts = new Map<string, string | null>()
  const skipped: { postId: string; reason: string }[] = []
  let scheduled = 0
  for (const post of posts) {
    // ‏ومسوّدةُ فكرةٍ بلا مصدر (D-282): معرّفُ بندها `idea:<n>` في `source_refs`
    const refs = readRefs(post.source_refs)
    const item = plan.plan.items.find((i) => (i.sourceId === post.source_id || refs.includes(i.sourceId)) && i.platform === post.platform)
    if (item === undefined) { skipped.push({ postId: post.id, reason: 'بندُه حُذف من الخطّة — جدوِله من بطاقته' }); continue }
    if (!peaks.has(post.platform)) peaks.set(post.platform, (await readPeaks(db, org, post.platform)).hours[0]?.hour ?? null)
    if (!accounts.has(post.platform)) {
      const acc = await db
        .prepare("SELECT id FROM accounts WHERE org_id = ? AND platform = ? AND status = 'active' ORDER BY id LIMIT 1")
        .bind(org, post.platform)
        .first<{ id: string }>()
      accounts.set(post.platform, acc?.id ?? null)
    }
    const account = accounts.get(post.platform) ?? null
    if (account === null) { skipped.push({ postId: post.id, reason: `لا حسابَ ${post.platform} مربوطًا لهذا العميل` }); continue }
    const result = await schedulePost(db, post.id, account, slotFor(item.day, item.time, peaks.get(post.platform) ?? null, now), now)
    if (result.ok) scheduled += 1
    else skipped.push({ postId: post.id, reason: result.reason })
  }
  return { scheduled, skipped }
}

/**
 * **الاعتمادُ والتراجع** (D-383 · المرحلة ٦).
 *
 * - `approvePlanVersion`: يقفل إصدارَ الخطّة (`plan_versions.locked_at` و`plans.locked_at`)، ويعتمد مسوّداتِها ذاتَ النصّ،
 *   ويولّد منشورًا `approved` لكلّ بندٍ له نصٌّ ولا منشورَ له، بـ`plan_id` و`plan_item_id` ومفتاحِ البند (D-004)،
 *   **في معاملةٍ واحدة** (`atomically`): إمّا كلُّه وإمّا لا شيء. ولا يُجدوَل شيءٌ هنا: الجدولةُ لـ`schedulePlan`.
 * - `unscheduleMonth`: «إلغاء جدولة الشهر» يعيد كلَّ `queued` لم يُرسَل من خطّة الشهر أو حزمته إلى `approved` بـ`unschedule` نفسِها.
 * - `reopenVersion`: «فتح الإصدار» يرفع رقمَه ويفكّ قفله ويعيد معتمَدَه غيرَ المجدول مسوّدة. والمجدولُ يُلغى أوّلًا.
 */
import { atomically, type Db, type DbStatement } from '../tokens'
import { dbNow, unschedule } from '../schedule/job'

export type ApproveResult =
  | { readonly ok: true; readonly version: number; readonly approved: number; readonly created: number }
  | { readonly ok: false; readonly reason: string }

export async function approvePlanVersion(
  db: Db, org: string, planId: string, by: string, now: Date,
  /** بنودٌ مختارة (`plan_items.id`)، والغيابُ يعني الشهرَ كاملًا. */
  only?: readonly string[],
): Promise<ApproveResult> {
  const plan = await db.prepare('SELECT id, version, plan_json FROM plans WHERE id = ? AND org_id = ?')
    .bind(planId, org).first<{ id: string; version: number; plan_json: string }>()
  if (plan === null) return { ok: false, reason: 'لا خطّة بهذا المعرّف' }
  const pick = only === undefined ? null : new Set(only)
  const { results: items } = await db
    .prepare(`SELECT i.id, i.item_key, i.platform, i.kind, i.copy,
                     (SELECT p.id FROM posts p WHERE p.plan_item_id = i.id AND p.org_id = i.org_id AND p.status != 'rejected' LIMIT 1) AS post_id
                FROM plan_items i WHERE i.plan_id = ? AND i.org_id = ? ORDER BY i.due_local, i.item_key`)
    .bind(planId, org)
    .all<{ id: string; item_key: string; platform: string; kind: string | null; copy: string | null; post_id: string | null }>()
  const at = dbNow(now)
  const statements: DbStatement[] = [
    db.prepare(`INSERT INTO plan_versions (id, plan_id, version, plan_json, locked_by, locked_at, org_id) VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(plan_id, version) DO UPDATE SET locked_by = excluded.locked_by, locked_at = excluded.locked_at, plan_json = excluded.plan_json`)
      .bind(crypto.randomUUID(), planId, plan.version, plan.plan_json, by, at, org),
    db.prepare('UPDATE plans SET locked_at = ? WHERE id = ? AND org_id = ?').bind(at, planId, org),
  ]
  // ‏مسوّداتُ الخطّة ذاتُ النصّ تُعتمد (المختارةُ وحدَها إن اختير)
  const { results: drafts } = await db
    .prepare("SELECT id, plan_item_id FROM posts WHERE org_id = ? AND plan_id = ? AND status = 'draft' AND trim(coalesce(text, '')) != ''")
    .bind(org, planId)
    .all<{ id: string; plan_item_id: string | null }>()
  const approve = drafts.filter((d) => pick === null || (d.plan_item_id !== null && pick.has(d.plan_item_id)))
  for (const d of approve) {
    statements.push(db.prepare("UPDATE posts SET status = 'approved', approved_by = ?, approved_at = ? WHERE id = ? AND org_id = ? AND status = 'draft'")
      .bind(by, at, d.id, org))
  }
  // ‏وبندٌ له نصٌّ ولا منشورَ له يولَّد منشورُه معتمَدًا، ومفتاحُه من البند فإعادةُ الاعتماد لا تكرّره (D-004)
  let created = 0
  for (const i of items) {
    if (i.post_id !== null || (i.copy ?? '').trim() === '' || (pick !== null && !pick.has(i.id))) continue
    created += 1
    statements.push(db.prepare(`INSERT OR IGNORE INTO posts (id, platform, type, text, status, idempotency_key, model, approved_by, approved_at, rationale, org_id, plan_id, plan_item_id)
                                VALUES (?, ?, ?, ?, 'approved', ?, 'owner', ?, ?, 'من خطّة معتمَدة', ?, ?, ?)`)
      .bind(crypto.randomUUID(), i.platform, i.kind === 'thread' ? 'thread' : 'text', i.copy, `item:${org}:${i.id}`, by, at, org, planId, i.id))
  }
  await atomically(db, statements)
  return { ok: true, version: plan.version, approved: approve.length, created }
}

export interface UnscheduleResult {
  readonly pulled: number
  readonly kept: readonly { readonly id: string; readonly reason: string }[]
}

/** «إلغاء جدولة الشهر»: خطّةُ الشهر (`plans.period`) ومنشوراتُ حزمته (`package_period`). ما أُرسل لا يُستردّ ويُقال. */
export async function unscheduleMonth(db: Db, org: string, period: string): Promise<UnscheduleResult> {
  const { results } = await db
    .prepare(`SELECT id FROM posts WHERE org_id = ? AND status = 'queued'
                AND (plan_id IN (SELECT id FROM plans WHERE org_id = ? AND period = ?) OR package_period = ?)
              ORDER BY scheduled_at, id`)
    .bind(org, org, period, period)
    .all<{ id: string }>()
  let pulled = 0
  const kept: { id: string; reason: string }[] = []
  for (const r of results) {
    const out = await unschedule(db, r.id, org)
    if (out.ok) pulled += 1
    else kept.push({ id: r.id, reason: out.reason })
  }
  return { pulled, kept }
}

export type ReopenResult = { readonly ok: true; readonly version: number; readonly reverted: number } | { readonly ok: false; readonly reason: string }

/** «فتح الإصدار»: مسوّدةٌ بإصدارٍ جديد. والإصدارُ المقفلُ يبقى في `plan_versions` سجلًّا. */
export async function reopenVersion(db: Db, org: string, planId: string): Promise<ReopenResult> {
  const plan = await db.prepare('SELECT version FROM plans WHERE id = ? AND org_id = ?').bind(planId, org).first<{ version: number }>()
  if (plan === null) return { ok: false, reason: 'لا خطّة بهذا المعرّف' }
  const queued = await db.prepare("SELECT COUNT(*) AS n FROM posts WHERE org_id = ? AND plan_id = ? AND status = 'queued'")
    .bind(org, planId).first<{ n: number }>()
  if ((queued?.n ?? 0) > 0) return { ok: false, reason: 'في الخطّة منشوراتٌ مجدولة، فألغِ جدولة الشهر أوّلًا' }
  const { results: approved } = await db.prepare("SELECT id FROM posts WHERE org_id = ? AND plan_id = ? AND status IN ('approved', 'edited')")
    .bind(org, planId).all<{ id: string }>()
  const version = plan.version + 1
  await atomically(db, [
    db.prepare('UPDATE plans SET version = ?, locked_at = NULL WHERE id = ? AND org_id = ? AND version = ?').bind(version, planId, org, plan.version),
    db.prepare("UPDATE posts SET status = 'draft', approved_by = NULL, approved_at = NULL WHERE org_id = ? AND plan_id = ? AND status IN ('approved', 'edited')")
      .bind(org, planId),
  ])
  return { ok: true, version, reverted: approved.length }
}

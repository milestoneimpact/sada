/**
 * الحزمةُ محوِّلٌ إلى خطّة الشهر (D-383 المرحلة ٤) — **ما فهمته صدى من الدفعة يُكتب بنودًا في خطّة شهره**.
 *
 * لكلّ شهرٍ في اللقطة: خطّتُه الشهريّة (`plans.period`) إن وُجدت، وإلّا تُنشأ خطّةٌ للحزمة (`model = 'package'`) كما في
 * التعبئة الرجعيّة (0061). ثمّ بنودُ الشهر في `plan_items` بمفتاح «pkg:رقم المادّة»، وأصلُها (`github` · رقمُ المادّة ·
 * المراجعة)، و«عُدِّل في صدى» لا يُكتب فوقه. وما حُذف من الشهر وأُرشف منشورُه يخرج من بنوده، وما ينتظر قرار المالك يبقى.
 * ثمّ يشير كلُّ منشورٍ حيّ إلى بنده، ويُسجَّل لكلّ شهرٍ `import_job` ببصمة صفوفه، فالدفعةُ نفسُها لا تضيف سجلًّا.
 *
 * والمنشوراتُ نفسُها تبقى بسياسة التطبيق (D-371) حتّى يصير الاعتمادُ وحده مولِّدَها (المرحلة ٦).
 */
import { atomically, type Db, type DbStatement } from '../tokens'
import { isThread } from '../draft/thread'
import { sha256Hex } from '../plan/normalize'
import { entryPeriod, type Snapshot } from './diff'
import { changePeriod, type Decision } from './apply'

export interface MonthLanding {
  /** الشهرُ ← معرّفُ خطّته. */
  readonly plans: Readonly<Record<string, string>>
  readonly items: number
}

export const packagePlanId = (org: string, period: string): string => 'plan_pkg_' + org + '_' + period
export const packageItemId = (planId: string, item: string, platform: string): string => 'pi_' + planId + '_pkg_' + item + '_' + platform

async function monthPlan(db: Db, org: string, period: string): Promise<string> {
  const had = await db.prepare('SELECT id, status FROM plans WHERE org_id = ? AND period = ?').bind(org, period).first<{ id: string; status: string }>()
  if (had !== null && had.status !== 'superseded') return had.id
  // ‏المُستبدَلةُ لا تحمل الشهر: شاشةُ الشهر لا تراها، فيُترك شهرُها لخطّةٍ حيّة
  if (had !== null) await db.prepare("UPDATE plans SET period = NULL WHERE id = ? AND org_id = ? AND status = 'superseded'").bind(had.id, org).run()
  await db.prepare(`INSERT OR IGNORE INTO plans (id, week_start, plan_json, model, status, org_id, span, period, source_kinds)
                    VALUES (?, ?, '{"rationale":"حزمة المحتوى","items":[]}', 'package', 'draft', ?, 'month', ?, '["github"]')`)
    .bind(packagePlanId(org, period), period, org, period).run()
  const now = await db.prepare("SELECT id FROM plans WHERE org_id = ? AND period = ? AND status <> 'superseded'").bind(org, period).first<{ id: string }>()
  return now?.id ?? packagePlanId(org, period)
}

export async function landInMonthPlans(
  db: Db, org: string, ctx: { readonly revisionId: string; readonly commit: string | null },
  snap: Snapshot, decisions: readonly Decision[],
): Promise<MonthLanding> {
  const periods = [...new Set(snap.entries.map(entryPeriod).filter((p) => p !== ''))].sort()
  const plans: Record<string, string> = {}
  const s: DbStatement[] = []
  let items = 0
  for (const period of periods) {
    const planId = await monthPlan(db, org, period)
    plans[period] = planId
    const rows = snap.entries.filter((e) => entryPeriod(e) === period)
    s.push(db.prepare(`UPDATE plans SET source_kinds = json_insert(CASE WHEN json_valid(source_kinds) THEN source_kinds ELSE '[]' END, '$[#]', 'github')
                        WHERE id = ? AND org_id = ? AND NOT EXISTS (SELECT 1 FROM json_each(CASE WHEN json_valid(plans.source_kinds) THEN plans.source_kinds ELSE '[]' END) WHERE value = 'github')`)
      .bind(planId, org))
    for (const e of rows) {
      items += 1
      s.push(db.prepare(
        `INSERT INTO plan_items (id, org_id, plan_id, item_key, platform, due_local, kind, angle, copy, media_ref, content_hash, source_kind, package_item_no, source_revision_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'github', ?, ?)
          ON CONFLICT (plan_id, item_key, platform) DO UPDATE SET
            due_local = excluded.due_local, kind = excluded.kind, angle = excluded.angle, copy = excluded.copy, media_ref = excluded.media_ref,
            content_hash = excluded.content_hash, source_revision_id = excluded.source_revision_id, rev = plan_items.rev + 1, updated_at = datetime('now')
          WHERE plan_items.edited_in_sada = 0
            AND (plan_items.due_local IS NOT excluded.due_local OR plan_items.copy IS NOT excluded.copy
                 OR plan_items.media_ref IS NOT excluded.media_ref OR plan_items.angle IS NOT excluded.angle)`,
      ).bind(packageItemId(planId, e.item, e.platform), org, planId, 'pkg:' + e.item, e.platform, e.date + ' ' + e.time,
        e.text !== null && isThread(e.platform, e.text) ? 'thread' : 'text', e.idea, e.text, e.media, snap.copySha, e.item, ctx.revisionId))
    }
    // ‏ما حُذف من هذا الشهر وأُرشف منشورُه (أو لا منشورَ له) يخرج من بنوده — وما ينتظر قرار المالك يبقى
    for (const d of decisions) {
      if (d.change.kind !== 'removed' || d.disposition !== 'auto_applied' || changePeriod(d.change) !== period) continue
      s.push(db.prepare(`DELETE FROM plan_items WHERE org_id = ? AND plan_id = ? AND item_key = ? AND platform = ? AND source_kind = 'github' AND edited_in_sada = 0`)
        .bind(org, planId, 'pkg:' + d.change.item, d.change.platform))
    }
    s.push(db.prepare(`UPDATE posts SET plan_item_id = (SELECT i.id FROM plan_items i WHERE i.org_id = posts.org_id AND i.plan_id = ?
                          AND i.package_item_no = posts.package_item_no AND i.platform = posts.platform AND i.source_kind = 'github')
                        WHERE org_id = ? AND package_item_no IS NOT NULL AND status <> 'rejected'
                          AND coalesce(package_period, substr(package_due, 1, 7)) = ?`).bind(planId, org, period))
    const hash = await sha256Hex(JSON.stringify(rows))
    s.push(db.prepare(`INSERT INTO import_jobs (id, org_id, source_kind, source_ref, content_hash, period, status, report_json, plan_id)
                        VALUES (?, ?, 'github', ?, ?, ?, 'applied', ?, ?) ON CONFLICT (org_id, source_kind, content_hash) DO NOTHING`)
      .bind('ij_' + crypto.randomUUID().replace(/-/g, '').slice(0, 20), org, ctx.commit, hash, period,
        JSON.stringify({ revision: ctx.revisionId, items: rows.length, changes: decisions.filter((d) => changePeriod(d.change) === period).length }), planId))
  }
  if (s.length > 0) await atomically(db, s)
  return { plans, items }
}

/**
 * **قراءاتُ شاشات الشهر** (D-383 · المرحلة ٨): ما تحتاجه الشاشاتُ من D1 في موضعٍ واحد، وكلُّ قراءةٍ تسقط إلى فراغٍ لا إلى خطأ
 * (جدولٌ لم يُرحَّل خيرٌ له شاشةٌ فارغة من لوحةٍ لا تُفتح). والحسابُ في `month.ts` الخالص.
 */
import type { Db } from '../tokens'
import type { DiffRow, ImportRow, MonthFacts } from './month'
import { calStatus, type CalItem } from './calendar'

export async function readImports(db: Db, org: string, limit = 30): Promise<ImportRow[]> {
  const r = await db.prepare(`SELECT id, source_kind, source_ref, content_hash, period, status, report_json, created_at, plan_id, seen_count, last_seen_at
                               FROM import_jobs WHERE org_id = ? ORDER BY COALESCE(last_seen_at, created_at) DESC LIMIT ?`).bind(org, limit)
    .all<{ id: string; source_kind: string; source_ref: string | null; content_hash: string; period: string | null; status: string; report_json: string; created_at: string;
           plan_id: string | null; seen_count: number | null; last_seen_at: string | null }>()
    .catch(() => ({ results: [] as never[] }))
  return r.results.map((x) => ({
    id: x.id, sourceKind: x.source_kind, sourceRef: x.source_ref, contentHash: x.content_hash, period: x.period,
    status: x.status, createdAt: x.created_at, summary: reportLine(x.report_json),
    // ‏وإعادةُ الرفع بلا تغيير (D-406): كم مرّةً بعد الأولى، ومتى آخرُها
    planId: x.plan_id, reseen: Math.max(0, Number(x.seen_count ?? 1) - 1), lastSeenAt: x.last_seen_at,
  }))
}

/** سطرٌ من `report_json`: ما يعدّه التقرير، أو سببُ الفشل. */
export function reportLine(json: string): string {
  try {
    const r = JSON.parse(json) as Record<string, unknown>
    if (typeof r['error'] === 'string') return r['error']
    const n = (k: string): number => (typeof r[k] === 'number' ? (r[k] as number) : Array.isArray(r[k]) ? (r[k] as unknown[]).length : 0)
    const parts = [['added', 'مضاف'], ['changed', 'متغيّر'], ['removed', 'محذوف'], ['seated', 'مُسكَّن'], ['items', 'بند']] as const
    const said = parts.filter(([k]) => n(k) > 0).map(([k, w]) => `${String(n(k))} ${w}`)
    return said.length === 0 ? 'لا تفصيل' : said.join('، ')
  } catch {
    return 'لا تفصيل'
  }
}

/** بنودُ كلّ يومٍ محلّيّ من `plan_items.due_local`. */
export async function itemsPerDay(db: Db, org: string, planId: string): Promise<Record<string, number>> {
  const r = await db.prepare(`SELECT substr(due_local, 1, 10) AS day, COUNT(*) AS n FROM plan_items
                               WHERE org_id = ? AND plan_id = ? AND due_local IS NOT NULL GROUP BY day`).bind(org, planId)
    .all<{ day: string; n: number }>().catch(() => ({ results: [] as never[] }))
  return Object.fromEntries(r.results.map((x) => [x.day, Number(x.n)]))
}

/** ما غيّرته آخرُ دفعةٍ للحزمة في هذا الشهر، وما ينتظر قرار المالك أوّلًا. */
export async function readDiff(db: Db, org: string, period: string): Promise<DiffRow[]> {
  const r = await db.prepare(`SELECT item_no, platform, kind, disposition, after_json, before_json FROM package_changes
                               WHERE org_id = ? AND period = ? AND superseded_by IS NULL AND decided_at IS NULL
                                 AND revision_id = (SELECT revision_id FROM package_changes WHERE org_id = ? AND period = ? ORDER BY rowid DESC LIMIT 1)
                               ORDER BY (disposition = 'awaiting_owner') DESC, item_no`).bind(org, period, org, period)
    .all<{ item_no: string; platform: string; kind: DiffRow['kind']; disposition: string; after_json: string | null; before_json: string | null }>()
    .catch(() => ({ results: [] as never[] }))
  return r.results.map((x) => ({
    itemNo: x.item_no, platform: x.platform, kind: x.kind, awaiting: x.disposition === 'awaiting_owner',
    detail: x.disposition === 'auto_applied' ? 'طُبِّق آليًّا' : x.disposition === 'frozen_published' ? 'نُشر فلا يُمسّ' : x.disposition === 'awaiting_owner' ? 'ينتظر قرارك' : 'قُرِّر',
  }))
}

/** وقائعُ رحلة الشهر: خطّتُه ومراجعتُه وأعدادُ منشوراته بحالها. */
export async function monthFacts(db: Db, org: string, period: string): Promise<MonthFacts> {
  const plan = await db.prepare(`SELECT id, locked_at FROM plans WHERE org_id = ? AND period = ? AND status <> 'superseded' ORDER BY created_at DESC LIMIT 1`)
    .bind(org, period).first<{ id: string; locked_at: string | null }>().catch(() => null)
  if (plan === null) return { period, hasPlan: false, reviewed: false, items: 0, approved: 0, queued: 0, published: 0, failed: 0 }
  const [items, posts] = await Promise.all([
    db.prepare('SELECT COUNT(*) AS n FROM plan_items WHERE org_id = ? AND plan_id = ?').bind(org, plan.id).first<{ n: number }>().catch(() => null),
    db.prepare(`SELECT status, COUNT(*) AS n FROM posts WHERE org_id = ? AND plan_id = ? GROUP BY status`).bind(org, plan.id)
      .all<{ status: string; n: number }>().catch(() => ({ results: [] as never[] })),
  ])
  const by = (s: string): number => Number(posts.results.find((x) => x.status === s)?.n ?? 0)
  return {
    period, hasPlan: true, reviewed: plan.locked_at !== null, items: Number(items?.n ?? 0),
    approved: by('approved'), queued: by('queued'), published: by('published'), failed: by('failed'),
  }
}

/** بنودُ التقويم الموحّد (D-410): كلُّ بندٍ بموعده ومنصّته وحال منشوره، والمرفوضُ لا يُعدّ. */
export async function calendarItems(db: Db, org: string, planId: string): Promise<CalItem[]> {
  const r = await db.prepare(`SELECT i.id, i.platform, i.due_local, substr(coalesce(i.copy, i.angle, ''), 1, 60) AS title,
                                     (SELECT p.status FROM posts p WHERE p.plan_item_id = i.id AND p.org_id = i.org_id AND p.status != 'rejected' LIMIT 1) AS post_status
                                FROM plan_items i WHERE i.org_id = ? AND i.plan_id = ? AND i.due_local IS NOT NULL ORDER BY i.due_local, i.item_key`).bind(org, planId)
    .all<{ id: string; platform: string; due_local: string; title: string; post_status: string | null }>().catch(() => ({ results: [] as never[] }))
  return r.results.map((x) => ({ id: x.id, platform: x.platform, due: x.due_local, title: x.title, status: calStatus(x.post_status) }))
}

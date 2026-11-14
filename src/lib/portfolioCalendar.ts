/**
 * **تقويمُ العملاء** (D-354): ما جُدول أو نُشر أو فشل لكلّ شركات المحفظة في أسبوعين من اليوم، في شبكةٍ واحدة — ليرى صاحبُ
 * الوكالة تزاحمَ يومٍ أو فراغَه عبر العملاء دون أن يبدّل الشركةَ شركةً شركة. **استعلامٌ واحد** مقصورٌ على شركات من يراه
 * (`org_id IN json_each`)، لا استعلامٌ لكلّ شركة.
 */
import type { Db } from './tokens'

export const CAL_DAYS = 14

export interface CalPost {
  readonly org: string
  readonly id: string
  readonly platform: string
  readonly status: string
  readonly at: string
  readonly text: string
}

export async function portfolioCalendar(db: Db, orgs: readonly string[], now: Date, days = CAL_DAYS): Promise<CalPost[]> {
  if (orgs.length === 0) return []
  const from = now.toISOString().slice(0, 10) 
  const to = new Date(now.getTime() + days * 86_400_000).toISOString().slice(0, 10) 
  return db.prepare(`SELECT org_id, id, platform, status, scheduled_at, substr(text, 1, 90) AS text FROM posts
       WHERE org_id IN (SELECT value FROM json_each(?)) AND substr(scheduled_at, 1, 10) >= ? AND substr(scheduled_at, 1, 10) < ?
         AND status IN ('queued', 'published', 'failed')
       ORDER BY scheduled_at LIMIT 400`)
    .bind(JSON.stringify(orgs), from, to)
    .all<{ org_id: string; id: string; platform: string; status: string; scheduled_at: string; text: string }>()
    .then((r) => r.results.map((x) => ({ org: x.org_id, id: x.id, platform: x.platform, status: x.status, at: x.scheduled_at, text: x.text })))
    .catch(() => [])
}

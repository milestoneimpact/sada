/**
 * **ملفُّ حال الخطّة في المستودع** (D-390) — `plans/YYYY-MM.status.json` تكتبه صدى، لا وسمٌ على الالتزام.
 *
 * - **الحالُ يُبنى من القاعدة لا من الأحداث** (`buildStatus`): آخرُ استيرادٍ وبصمتُه ← فُحص (بنودٌ مُسكَّنة يفحصها «تقويم الشهر»)
 *   ← اعتُمد (من، متى، الإصدار) ← جُدول ← لكلّ بندٍ نُشر (الرابطُ والوقت) أو تعثّر (سببٌ من رمز الحالة وحده، **لا نصُّ ردّ
 *   المنصّة**: فلا رمزَ ولا سرَّ يبلغ المستودع). فلا يُمسّ مسارُ النشر بسطرٍ واحد.
 * - **الكتابةُ مجمَّعة** (`flushRepoStatus`، من الدورة ربعِ الساعيّة): الحالُ الذي لم تتغيّر بصمتُه لا يُكتب، وما تغيّر قبل
 *   `MIN_GAP_MINUTES` من آخر كتابةٍ يُعلَّم `dirty` وينتظر. فأقصى كتابةٍ لكلّ شهرٍ مرّةٌ كلّ بضع دقائق مهما كثرت الأحداث.
 * - **متسامحةٌ مع الفشل**: لا ترمي أبدًا، وكلُّ محاولةٍ تُسجَّل في `repo_status_sync` (`attempts`، `last_error`)، و403/404
 *   على الكتابة يعني أنّ الإذنَ للقراءة وحدها (`needs_write`) فتقول الواجهةُ «يلزم إذن الكتابة»، ولا يُجرَّب في الدورة إلّا شهرٌ واحد (نداءٌ مجّانيّ) حتّى يُمنح الإذن.
 */
import type { Db } from '../tokens'
import { sha256Hex } from '../plan/normalize'
import { permalink } from '../platform/screen'
import type { Platform } from '../oauth/providers'
import { putFile, type RepoRef } from './github'

/** أقلُّ فاصلٍ بين كتابتين لملفّ الشهر نفسِه. */
export const MIN_GAP_MINUTES = 5
export const STATUS_FORMAT = 'sada-plan-status/1'

export type ItemState = 'draft' | 'approved' | 'scheduled' | 'published' | 'failed'

export interface StatusItem {
  readonly key: string
  readonly platform: string
  readonly due_local: string
  readonly state: ItemState
  readonly url?: string
  readonly published_at?: string
  readonly reason?: string
}

export interface PlanStatus {
  readonly format: typeof STATUS_FORMAT
  readonly period: string
  readonly stage: 'imported' | 'checked' | 'approved' | 'scheduled' | 'published' | 'none'
  readonly imported: { readonly at: string; readonly hash: string; readonly source: string } | null
  readonly checked: { readonly at: string; readonly items: number } | null
  readonly approved: { readonly by: string | null; readonly at: string; readonly version: number } | null
  readonly scheduled: { readonly items: number } | null
  readonly items: readonly StatusItem[]
}

/** سببُ التعثّر من رمز حالة المنصّة وحده — والنصُّ ثابتٌ بالعربيّة، فلا يحمل ما في الردّ. */
export function failReason(status: number | null): string {
  if (status === 401 || status === 403) return 'رفضت المنصّة الإذن — أعد ربط الحساب في صدى'
  if (status === 429) return 'بلغت المنصّة حدَّ الطلبات — يُعاد لاحقًا'
  if (status !== null && status >= 500) return `عطلٌ عند المنصّة (HTTP ${status})`
  if (status !== null && status >= 400) return `رفضت المنصّة الطلب (HTTP ${status})`
  return 'تعذّر النشر — التفاصيل في صدى'
}

/** حالُ المنشور (D-340) بكلمة ملفّ الحال — بلا خريطةٍ ثانيةٍ لحالات المنشور. */
function itemState(status: string | null): ItemState {
  if (status === 'queued') return 'scheduled'
  if (status === 'edited' || status === 'approved' || status === 'published' || status === 'failed') return status === 'edited' ? 'approved' : status
  return 'draft'
}

interface ItemRow {
  item_key: string; platform: string; due_local: string | null; status: string | null
  ppid: string | null; pub_at: string | null; fail_status: number | null
}

/** حالُ خطّة الشهر من القاعدة — و`null` إن لم تكن للشهر خطّة. كلُّ استعلامٍ بمنظّمته. */
export async function buildStatus(db: Db, org: string, period: string): Promise<PlanStatus | null> {
  const plan = await db.prepare("SELECT id FROM plans WHERE org_id = ? AND period = ? AND status <> 'superseded'")
    .bind(org, period).first<{ id: string }>()
  if (plan === null) return null
  const job = await db.prepare('SELECT source_kind, content_hash, created_at FROM import_jobs WHERE org_id = ? AND period = ? ORDER BY created_at DESC, rowid DESC LIMIT 1')
    .bind(org, period).first<{ source_kind: string; content_hash: string; created_at: string }>()
  const ver = await db.prepare('SELECT version, locked_by, locked_at FROM plan_versions WHERE org_id = ? AND plan_id = ? ORDER BY version DESC LIMIT 1')
    .bind(org, plan.id).first<{ version: number; locked_by: string | null; locked_at: string }>()
  const { results } = await db.prepare(
    `SELECT i.item_key, i.platform, i.due_local, p.status,
            (SELECT a.platform_post_id FROM publish_attempts a WHERE a.org_id = p.org_id AND a.post_id = p.id AND a.status = 'succeeded' ORDER BY a.at DESC LIMIT 1) AS ppid,
            (SELECT a.at FROM publish_attempts a WHERE a.org_id = p.org_id AND a.post_id = p.id AND a.status = 'succeeded' ORDER BY a.at DESC LIMIT 1) AS pub_at,
            (SELECT CASE WHEN json_valid(a.response_json) THEN CAST(json_extract(a.response_json, '$.status') AS INTEGER) END
               FROM publish_attempts a WHERE a.org_id = p.org_id AND a.post_id = p.id AND a.status = 'failed' ORDER BY a.at DESC LIMIT 1) AS fail_status
       FROM plan_items i
       LEFT JOIN posts p ON p.org_id = i.org_id AND p.plan_item_id = i.id AND p.status <> 'rejected'
      WHERE i.org_id = ? AND i.plan_id = ?
      ORDER BY i.due_local, i.platform, i.item_key`,
  ).bind(org, plan.id).all<ItemRow>()
  const seen = new Set<string>()
  const items: StatusItem[] = []
  for (const r of results) {
    const id = r.item_key + '|' + r.platform
    if (seen.has(id)) continue
    seen.add(id)
    const state = itemState(r.status)
    const url = state === 'published' ? permalink(r.platform as Platform, r.ppid) : null
    items.push({
      key: r.item_key, platform: r.platform, due_local: r.due_local ?? '', state,
      ...(url === null ? {} : { url }), ...(state === 'published' && r.pub_at !== null ? { published_at: r.pub_at } : {}),
      ...(state === 'failed' ? { reason: failReason(r.fail_status) } : {}),
    })
  }
  const checkedAt = await db.prepare('SELECT max(updated_at) AS at FROM plan_items WHERE org_id = ? AND plan_id = ?')
    .bind(org, plan.id).first<{ at: string | null }>()
  const scheduledCount = items.filter((i) => i.state === 'scheduled' || i.state === 'published' || i.state === 'failed').length
  const stage: PlanStatus['stage'] = items.some((i) => i.state === 'published') ? 'published'
    : scheduledCount > 0 ? 'scheduled' : ver !== null ? 'approved' : items.length > 0 ? 'checked' : job !== null ? 'imported' : 'none'
  return {
    format: STATUS_FORMAT, period, stage,
    imported: job === null ? null : { at: job.created_at, hash: job.content_hash, source: job.source_kind },
    checked: items.length === 0 || checkedAt?.at == null ? null : { at: checkedAt.at, items: items.length },
    approved: ver === null ? null : { by: ver.locked_by, at: ver.locked_at, version: ver.version },
    scheduled: scheduledCount === 0 ? null : { items: scheduledCount },
    items,
  }
}

export const statusPath = (root: string, period: string): string => (root === '' ? '' : root.replace(/\/+$/, '') + '/') + `plans/${period}.status.json`

export interface SyncRow {
  readonly period: string
  readonly last_sha: string | null
  readonly last_hash: string | null
  readonly dirty: number
  readonly last_written_at: string | null
  readonly last_attempt_at: string | null
  readonly last_error: string | null
  readonly needs_write: number
}

/** ذاكرةُ الكتابة لأشهر المنظّمة — تسقط إلى فراغٍ قبل الترحيل. */
export async function readSyncRows(db: Db, org: string): Promise<SyncRow[]> {
  try {
    const { results } = await db.prepare('SELECT period, last_sha, last_hash, dirty, last_written_at, last_attempt_at, last_error, needs_write FROM repo_status_sync WHERE org_id = ? ORDER BY period DESC')
      .bind(org).all<SyncRow>()
    return results
  } catch {
    return []
  }
}

/** هل يلزم إذنُ الكتابة؟ (آخرُ محاولةٍ ردّت بأنّ الرمزَ للقراءة) — لبطاقة الحزمة. */
export const needsWrite = (rows: readonly SyncRow[]): boolean => rows.some((r) => r.needs_write === 1)

export interface FlushDeps {
  readonly db: Db
  readonly org: string
  readonly repo: RepoRef
  readonly root: string
  readonly now: Date
  readonly fetchImpl?: typeof fetch
}

export interface FlushReport { readonly written: string[]; readonly waiting: string[]; readonly failed: string[]; readonly unchanged: string[] }

const sqlTime = (d: Date): string => d.toISOString().slice(0, 19).replace('T', ' ')

/**
 * يكتب حالَ كلّ شهرٍ تغيّر — الشهرُ الماضي فما بعده. **لا يرمي**: كلُّ عطلٍ صفٌّ في `repo_status_sync` وسطرٌ في التقرير.
 */
export async function flushRepoStatus(d: FlushDeps): Promise<FlushReport> {
  const report: FlushReport = { written: [], waiting: [], failed: [], unchanged: [] }
  try {
    const from = new Date(Date.UTC(d.now.getUTCFullYear(), d.now.getUTCMonth() - 1, 1)).toISOString().slice(0, 7)
    const { results: periods } = await d.db.prepare("SELECT DISTINCT period FROM plans WHERE org_id = ? AND period IS NOT NULL AND period >= ? AND status <> 'superseded' ORDER BY period")
      .bind(d.org, from).all<{ period: string }>()
    const memory = new Map((await readSyncRows(d.db, d.org)).map((r) => [r.period, r]))
    for (const { period } of periods) {
      const status = await buildStatus(d.db, d.org, period)
      if (status === null) continue
      const body = JSON.stringify(status, null, 2) + '\n'
      const hash = await sha256Hex(body)
      const had = memory.get(period)
      if (had?.last_hash === hash) {
        if (had.dirty === 1) await d.db.prepare('UPDATE repo_status_sync SET dirty = 0 WHERE org_id = ? AND period = ?').bind(d.org, period).run()
        report.unchanged.push(period)
        continue
      }
      const at = sqlTime(d.now)
      await d.db.prepare(`INSERT INTO repo_status_sync (org_id, period, dirty) VALUES (?, ?, 1)
                          ON CONFLICT (org_id, period) DO UPDATE SET dirty = 1`).bind(d.org, period).run()
      const recent = had?.last_written_at != null && d.now.getTime() - Date.parse(had.last_written_at.replace(' ', 'T') + 'Z') < MIN_GAP_MINUTES * 60_000
      if (recent) { report.waiting.push(period); continue }
      const out = await putFile(d.repo, statusPath(d.root, period), body, `صدى: حال خطّة ${period} (${status.stage})`, had?.last_sha ?? null, d.fetchImpl)
      if (out.kind === 'written') {
        await d.db.prepare(`UPDATE repo_status_sync SET last_sha = ?, last_hash = ?, dirty = 0, last_written_at = ?, last_attempt_at = ?, attempts = attempts + 1,
                              last_error = NULL, needs_write = 0 WHERE org_id = ? AND period = ?`).bind(out.sha, hash, at, at, d.org, period).run()
        report.written.push(period)
      } else {
        await d.db.prepare(`UPDATE repo_status_sync SET last_attempt_at = ?, attempts = attempts + 1, last_error = ?, needs_write = ? WHERE org_id = ? AND period = ?`)
          .bind(at, out.reason, out.kind === 'needs_write' ? 1 : 0, d.org, period).run()
        report.failed.push(period)
        // ‏بلا إذن كتابة لا تُجرَّب بقيّةُ الأشهر في هذه الدورة
        if (out.kind === 'needs_write') break
      }
    }
  } catch (e) {
    console.warn({ job: 'repo-status', failed: e instanceof Error ? e.message : 'unexpected_error' })
  }
  return report
}

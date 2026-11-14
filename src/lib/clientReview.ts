/**
 * **رابطُ موافقة العميل** (D-353): المالكُ يفتح رابطًا لخطّةٍ بعينها، والعميلُ يرى منشوراتها بشكل كلّ منصّة ويقول في كلٍّ منها
 * «موافق» أو «أطلب تعديلًا» بملحوظة. قرارُه رأيٌ لا فعل: لا ينشر ولا يعتمد، ويُرى على البطاقة وفي الإشعارات.
 *
 * ## الرمز
 *
 * ‏32 بايتًا عشوائيّة بترميز URL، **ولا يُحفظ إلّا بصمتُه** (SHA-256): القاعدةُ إن قُرئت لا تفتح رابطًا. ويُعرض للمالك مرّةً
 * واحدة عند إنشائه. وله مدّة (أربعة عشر يومًا)، ويُلغى، ويسقط مع خطّته.
 */
import type { Db } from './tokens'

export const LINK_DAYS = 14
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/
export const NOTE_MAX = 500

export type ClientVerdict = 'approve' | 'changes'

export interface ReviewLink {
  readonly id: string
  readonly org: string
  readonly planId: string
  readonly expiresAt: string
}

export interface VerdictRow {
  readonly itemKey: string
  readonly verdict: ClientVerdict
  readonly note: string
  readonly at: string
}

function b64url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function hashToken(token: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))
  return Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** رابطٌ جديد — يعيد الرمزَ مرّةً واحدة، ولا يُحفظ إلّا بصمتُه. */
export async function createLink(db: Db, org: string, planId: string, by: string, now: Date = new Date()): Promise<{ token: string; expiresAt: string }> {
  const token = b64url(crypto.getRandomValues(new Uint8Array(32)))
  const expiresAt = new Date(now.getTime() + LINK_DAYS * 86_400_000).toISOString()
  await db.prepare('INSERT INTO review_links (id, org_id, plan_id, token_hash, created_by, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), org, planId, await hashToken(token), by, expiresAt).run()
  return { token, expiresAt }
}

/** الرابطُ الصالح لرمزه — أو `null` بلا تفريقٍ بين «لا يوجد» و«انتهى» و«أُلغي». */
export async function findLink(db: Db, token: string, now: Date = new Date()): Promise<ReviewLink | null> {
  if (!TOKEN_SHAPE.test(token)) return null
  const row = await db.prepare('SELECT id, org_id, plan_id, expires_at, revoked_at FROM review_links WHERE token_hash = ? LIMIT 1')
    .bind(await hashToken(token))
    .first<{ id: string; org_id: string; plan_id: string; expires_at: string; revoked_at: string | null }>().catch(() => null)
  if (row === null || row.revoked_at !== null || Date.parse(row.expires_at) <= now.getTime()) return null
  return { id: row.id, org: row.org_id, planId: row.plan_id, expiresAt: row.expires_at }
}

/** روابطُ الخطّة النافذة — عددُها وأقربُ انتهاء، لتقول اللوحةُ «رابطٌ نافذٌ حتّى…». */
export async function activeLinks(db: Db, org: string, planId: string, now: Date = new Date()): Promise<{ count: number; until: string | null; since: string | null; by: string | null }> {
  const r = await db.prepare(`SELECT COUNT(*) AS n, MAX(expires_at) AS until, MIN(created_at) AS since, MAX(created_by) AS by FROM review_links
      WHERE org_id = ? AND plan_id = ? AND revoked_at IS NULL AND expires_at > ?`)
    .bind(org, planId, now.toISOString())
    .first<{ n: number; until: string | null; since: string | null; by: string | null }>().catch(() => null)
  return { count: r?.n ?? 0, until: r?.until ?? null, since: r?.since ?? null, by: r?.by ?? null }
}

export async function revokeLinks(db: Db, org: string, planId: string, now: Date = new Date()): Promise<number> {
  const r = await db.prepare('UPDATE review_links SET revoked_at = ? WHERE org_id = ? AND plan_id = ? AND revoked_at IS NULL')
    .bind(now.toISOString(), org, planId).run()
  return Number((r as { meta?: { changes?: number } }).meta?.changes ?? 0)
}

/** قرارُ العميل على بند — آخرُ قرارٍ يغلب. */
export async function recordVerdict(db: Db, link: ReviewLink, itemKey: string, verdict: ClientVerdict, note: string, now: Date = new Date()): Promise<void> {
  await db.prepare(`INSERT INTO review_verdicts (link_id, org_id, plan_id, item_key, verdict, note, at) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (link_id, item_key) DO UPDATE SET verdict = excluded.verdict, note = excluded.note, at = excluded.at`)
    .bind(link.id, link.org, link.planId, itemKey, verdict, note.trim().slice(0, NOTE_MAX), now.toISOString()).run()
}

/** آخرُ قرارٍ لكلّ بندٍ في الخطّة، من أيّ رابط. */
export async function verdictsFor(db: Db, org: string, planId: string): Promise<ReadonlyMap<string, VerdictRow>> {
  const rows = await db.prepare('SELECT item_key, verdict, note, at FROM review_verdicts WHERE org_id = ? AND plan_id = ? ORDER BY at')
    .bind(org, planId).all<{ item_key: string; verdict: ClientVerdict; note: string; at: string }>()
    .then((r) => r.results).catch(() => [])
  const out = new Map<string, VerdictRow>()
  for (const r of rows) out.set(r.item_key, { itemKey: r.item_key, verdict: r.verdict, note: r.note, at: r.at })
  return out
}

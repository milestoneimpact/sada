/**
 * **تعديلُ منشورٍ من الخطّة، وسجلُّه، واستعادتُه** (D-383 المرحلة ٧).
 *
 * - **كلّ تعديلٍ مسجَّل** في `plan_edits`: من، ومتى، وما قبله وما بعده. و«استعد هذه النسخة» تعديلٌ جديدٌ يُسجَّل بدوره،
 *   فلا يُمحى من السجلّ شيء.
 * - **حمايةُ التصادم:** يحمل الطلبُ رقمَ النسخة التي رآها (`ifRev`)، والكتابةُ مشروطةٌ به في جملة التحديث نفسِها.
 *   فتعديلان متزامنان على النسخة نفسِها: يُقبل الأوّل ويُردّ الثاني بـ`CONFLICT_SAY`.
 * - **ما يقع بعد الحفظ** من `afterSave`: المجدوَل يُسحب من الطابور قبل أن يُكتب نصُّه، فلا يخرج نصٌّ لم يُعتمد.
 * - **والمعدَّل يحمل «عُدِّل في صدى»** (`edited_in_sada`، و`copy_origin = 'manual'` لمنشور الحزمة)، فاستيرادٌ لاحقٌ
 *   يخالفه ينتظر قرارَ المالك بالنسختين ولا يدهسه (`dispose` في `package/apply.ts`).
 */
import { atomically, type Db } from '../tokens'
import { changedRows } from '../dbResult'
import type { Role } from '../ownerEmail'
import { unschedule, reschedulePost } from '../schedule/job'
import { AFTER_SAY, CONFLICT_SAY, afterSave, mayDo, stageOf, type AfterSave, type EditStage } from './rights'

export interface PostChange {
  readonly text?: string
  /** UTC بصيغة ISO */
  readonly scheduledAt?: string
  readonly mediaJson?: string
}

export type ReviseResult =
  | { readonly ok: true; readonly rev: number; readonly after: AfterSave; readonly say: string }
  | { readonly ok: false; readonly reason: string; readonly conflict?: boolean }

interface PostRow {
  id: string
  status: string
  text: string
  media_json: string
  scheduled_at: string | null
  dispatched_at: string | null
  rev: number
  plan_item_id: string | null
}

const SNAP = 'id, status, text, media_json, scheduled_at, dispatched_at, rev, plan_item_id'

/** ما يُحفظ في السجلّ قبل التعديل وبعده: ما يعدّله المالك وحده. */
function snapshot(p: Pick<PostRow, 'text' | 'media_json' | 'scheduled_at'>): string {
  return JSON.stringify({ text: p.text, mediaJson: p.media_json, scheduledAt: p.scheduled_at })
}

async function readPost(db: Db, org: string, id: string): Promise<PostRow | null> {
  return db.prepare(`SELECT ${SNAP} FROM posts WHERE id = ? AND org_id = ?`).bind(id, org).first<PostRow>()
}

export const TEXT_MAX = 25_000

/** يعدّل منشورًا بشرط رقم نسخته، ويسجّل التعديل، ويطبّق ما يقع بعد الحفظ. */
export async function revisePost(
  db: Db, org: string, postId: string, change: PostChange, ifRev: number, actor: string, role: Role, now: Date, reason: string | null = null,
): Promise<ReviseResult> {
  const row = await readPost(db, org, postId)
  if (row === null) return { ok: false, reason: 'لا منشور بهذا المعرّف' }
  const stage = stageOf(row, now)
  const verdict = mayDo(role, 'edit', stage)
  if (!verdict.ok) return verdict
  if (row.rev !== ifRev) return { ok: false, reason: CONFLICT_SAY, conflict: true }
  if (change.text !== undefined && (change.text.trim() === '' || change.text.length > TEXT_MAX)) return { ok: false, reason: 'النصّ فارغ أو أطول ممّا يُقبل' }
  if (change.scheduledAt !== undefined) {
    const at = Date.parse(change.scheduledAt)
    if (!Number.isFinite(at)) return { ok: false, reason: 'الموعد غير مفهوم' }
    if (stage === 'scheduled' && at - now.getTime() <= 15 * 60_000) return { ok: false, reason: 'الموعد الجديد داخل آخر 15 دقيقة. اختر موعدًا أبعد.' }
  }
  if (change.mediaJson !== undefined) {
    try { if (!Array.isArray(JSON.parse(change.mediaJson))) throw new Error() } catch { return { ok: false, reason: 'الوسيط غير مفهوم' } }
  }
  const after = afterSave(role, stage)
  // ‏المجدوَلُ يُسحب أوّلًا: نصٌّ لم يُعتمد لا يبقى في الطابور لحظةً
  if (stage === 'scheduled') {
    const pulled = await unschedule(db, postId, org)
    if (!pulled.ok) return pulled
  }
  const next = {
    text: change.text ?? row.text,
    media_json: change.mediaJson ?? row.media_json,
    scheduled_at: change.scheduledAt ?? row.scheduled_at,
  }
  const status = after === 'recheck' ? row.status : after === 'await' ? 'edited' : 'approved'
  const reapprove = after === 'pull_reapprove'
  const done = await db.prepare(
    `UPDATE posts SET text = ?, media_json = ?, scheduled_at = ?, status = ?, rev = rev + 1, edited_in_sada = 1,
            copy_origin = CASE WHEN copy_origin IS NOT NULL AND ? THEN 'manual' ELSE copy_origin END,
            approved_by = CASE WHEN ? THEN ? ELSE approved_by END,
            approved_at = CASE WHEN ? THEN ? ELSE approved_at END
      WHERE id = ? AND org_id = ? AND rev = ? AND status <> 'published'`,
  ).bind(next.text, next.media_json, next.scheduled_at, status, change.text !== undefined ? 1 : 0,
    reapprove ? 1 : 0, actor, reapprove ? 1 : 0, now.toISOString(), postId, org, ifRev).run()
  if (!changedRows(done)) return { ok: false, reason: CONFLICT_SAY, conflict: true }
  const stmts = [
    db.prepare(`INSERT INTO plan_edits (id, org_id, target_kind, target_id, rev, actor, at, before_json, after_json, reason)
                VALUES (?, ?, 'post', ?, ?, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), org, postId, row.rev, actor, now.toISOString(), snapshot(row), snapshot(next), reason),
  ]
  if (row.plan_item_id !== null) {
    stmts.push(db.prepare(`UPDATE plan_items SET copy = ?, rev = rev + 1, edited_in_sada = 1, updated_at = datetime('now') WHERE id = ? AND org_id = ?`)
      .bind(next.text, row.plan_item_id, org))
  }
  await atomically(db, stmts)
  return { ok: true, rev: row.rev + 1, after, say: AFTER_SAY[after] }
}

export interface EditEntry {
  readonly id: string
  readonly rev: number
  readonly actor: string
  readonly at: string
  readonly before: PostChange
  readonly after: PostChange | null
  readonly reason: string | null
}

function parse(json: string | null): PostChange | null {
  if (json === null) return null
  const v = JSON.parse(json) as { text?: string; mediaJson?: string; scheduledAt?: string | null }
  return {
    ...(v.text === undefined ? {} : { text: v.text }),
    ...(v.mediaJson === undefined ? {} : { mediaJson: v.mediaJson }),
    ...(v.scheduledAt == null ? {} : { scheduledAt: v.scheduledAt }),
  }
}

/** سجلُّ تعديل المنشور، الأحدثُ أوّلًا. */
export async function postHistory(db: Db, org: string, postId: string): Promise<EditEntry[]> {
  const { results } = await db.prepare(
    `SELECT id, rev, actor, at, before_json, after_json, reason FROM plan_edits
      WHERE org_id = ? AND target_kind = 'post' AND target_id = ? ORDER BY at DESC, rev DESC LIMIT 50`,
  ).bind(org, postId).all<{ id: string; rev: number; actor: string; at: string; before_json: string; after_json: string | null; reason: string | null }>()
  return results.map((r) => ({ id: r.id, rev: r.rev, actor: r.actor, at: r.at, before: parse(r.before_json)!, after: parse(r.after_json), reason: r.reason }))
}

/** «استعد هذه النسخة»: يعيد ما كان قبل تعديلٍ مسجَّل، تعديلًا جديدًا بشرط النسخة الحاليّة. */
export async function restoreEdit(db: Db, org: string, editId: string, ifRev: number, actor: string, role: Role, now: Date): Promise<ReviseResult> {
  const verdict = mayDo(role, 'restore')
  if (!verdict.ok) return verdict
  const e = await db.prepare("SELECT target_id, rev, before_json FROM plan_edits WHERE id = ? AND org_id = ? AND target_kind = 'post'")
    .bind(editId, org).first<{ target_id: string; rev: number; before_json: string }>()
  if (e === null) return { ok: false, reason: 'لا نسخة بهذا المعرّف' }
  const before = parse(e.before_json)!
  return revisePost(db, org, e.target_id, before, ifRev, actor, role, now, `استعادة النسخة ${e.rev}`)
}

/** في آخر ربع ساعة: «أوقف» يسحبه من الطابور، و«أجّل» يؤخّر موعده بالدقائق. ولا يُمسّ النصّ. */
export async function holdPost(db: Db, org: string, postId: string, how: { readonly pause: true } | { readonly minutes: number }, actor: string, role: Role, now: Date): Promise<ReviseResult> {
  const row = await readPost(db, org, postId)
  if (row === null) return { ok: false, reason: 'لا منشور بهذا المعرّف' }
  const verdict = mayDo(role, 'pause', stageOf(row, now))
  if (!verdict.ok) return verdict
  let to: string | null
  if ('pause' in how) {
    const r = await unschedule(db, postId, org)
    if (!r.ok) return r
    to = null
  } else {
    if (!Number.isInteger(how.minutes) || how.minutes < 15 || how.minutes > 60 * 24 * 30) return { ok: false, reason: 'التأجيل بين 15 دقيقة وثلاثين يومًا' }
    const base = Math.max(Date.parse(row.scheduled_at ?? '') || 0, now.getTime())
    to = new Date(base + how.minutes * 60_000).toISOString()
    const r = await reschedulePost(db, postId, to, now, org)
    if (!r.ok) return r
  }
  await atomically(db, [
    db.prepare('UPDATE posts SET rev = rev + 1 WHERE id = ? AND org_id = ?').bind(postId, org),
    db.prepare(`INSERT INTO plan_edits (id, org_id, target_kind, target_id, rev, actor, at, before_json, after_json, reason)
                VALUES (?, ?, 'post', ?, ?, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), org, postId, row.rev, actor, now.toISOString(), snapshot(row), snapshot({ ...row, scheduled_at: to ?? row.scheduled_at }),
        to === null ? 'أُوقف قبل النشر' : 'أُجّل قبل النشر'),
  ])
  return { ok: true, rev: row.rev + 1, after: 'await', say: to === null ? 'أُوقف، ورجع معتمدًا بلا موعد.' : 'أُجّل إلى موعده الجديد.' }
}

/** «انسخه مسوّدةً»: منشورٌ منشور لا يُعدَّل، فتُكتب نسخته مسوّدةً جديدة بمفتاح منع تكرارٍ جديد (D-004). */
export async function copyToDraft(db: Db, org: string, postId: string, actor: string, role: Role, now: Date): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  const row = await db.prepare('SELECT status, scheduled_at, dispatched_at FROM posts WHERE id = ? AND org_id = ?').bind(postId, org)
    .first<{ status: string; scheduled_at: string | null; dispatched_at: string | null }>()
  if (row === null) return { ok: false, reason: 'لا منشور بهذا المعرّف' }
  const stage: EditStage = stageOf(row, now)
  const verdict = mayDo(role, 'copy', stage)
  if (!verdict.ok) return verdict
  const id = crypto.randomUUID()
  await atomically(db, [
    db.prepare(`INSERT INTO posts (id, platform, type, text, media_json, source_refs, status, idempotency_key, model, rationale, org_id, account_id)
                SELECT ?, platform, type, text, media_json, source_refs, 'draft', ?, 'owner', 'نسخةٌ من منشورٍ منشور', org_id, account_id
                  FROM posts WHERE id = ? AND org_id = ?`)
      .bind(id, `copy:${org}:${postId}:${id}`, postId, org),
    db.prepare(`INSERT INTO plan_edits (id, org_id, target_kind, target_id, rev, actor, at, before_json, after_json, reason)
                SELECT ?, ?, 'post', ?, 1, ?, ?, '{}', NULL, ? FROM posts WHERE id = ? AND org_id = ?`)
      .bind(crypto.randomUUID(), org, id, actor, now.toISOString(), `نُسخ من ${postId}`, id, org),
  ])
  return { ok: true, id }
}

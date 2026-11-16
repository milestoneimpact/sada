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
import { storedZone } from '../time/ownerZone'
import { localParts } from '../time/zone'
import { planChecks } from './checks'
import { readRules, reviewCheckInput } from './checkStore'
import { reviewModel } from './review'
import { planForId } from './job'
import { AFTER_SAY, CONFLICT_SAY, afterSave, mayDo, stageOf, type AfterSave, type EditStage } from './rights'

export interface PostChange {
  readonly text?: string
  /** UTC بصيغة ISO */
  readonly scheduledAt?: string
  readonly mediaJson?: string
}

export type ReviseResult =
  | { readonly ok: true; readonly rev: number; readonly after: AfterSave; readonly say: string; readonly findings?: readonly string[] }
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

const two = (n: number): string => String(n).padStart(2, '0')

/** موعدُ البند بساعة المالك (`YYYY-MM-DD HH:MM`) من موعدٍ بتوقيت UTC. */
async function dueOf(db: Db, utc: string): Promise<string> {
  const l = localParts(new Date(utc), await storedZone(db))
  return `${String(l.year)}-${two(l.month)}-${two(l.day)} ${two(l.hour)}:${two(l.minute)}`
}

/**
 * **يُعاد الفحصُ فورًا** (DESIGN «التعديل والصلاحيات»): قواعدُ الخطّة على يوم المنشور المعدَّل، وما يخصّه يُقال على شاشة التعديل.
 * ومنشورٌ بلا خطّة لا فحصَ له، وعطلُ القراءة لا يُفشل حفظًا تمّ.
 */
async function recheck(db: Db, org: string, postId: string, now: Date): Promise<string[]> {
  try {
    const p = await db.prepare('SELECT plan_id FROM posts WHERE id = ? AND org_id = ?').bind(postId, org).first<{ plan_id: string | null }>()
    if (p?.plan_id == null) return []
    const plan = await planForId(db, org, p.plan_id)
    if (plan === null) return []
    const model = await reviewModel(db, org, plan)
    const mine = model.cards.find((c) => c.post?.id === postId)
    if (mine === undefined) return []
    const [input, rules] = await Promise.all([reviewCheckInput(db, org, model, await storedZone(db), now), readRules(db, org)])
    return planChecks(input, rules).filter((f) => f.keys.includes(mine.key)).map((f) => f.message)
  } catch {
    return []
  }
}

function sayFindings(f: readonly string[]): string {
  return f.length === 0 ? ' ولا تحذير على يومه.' : ' وفي الفحص: ' + f.slice(0, 3).join('، ') + '.'
}

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
  const next = {
    text: change.text ?? row.text,
    media_json: change.mediaJson ?? row.media_json,
    scheduled_at: change.scheduledAt ?? row.scheduled_at,
  }
  // ‏`await` مسوّدةٌ بلا اعتماد: «edited» حالٌ معتمَدةٌ يجدولها `schedulePlan`، فلا يخرج نصٌّ لم يعتمده ناشر باسم من اعتمد قبله
  const status = after === 'recheck' ? row.status : after === 'await' ? 'draft' : 'approved'
  const reapprove = after === 'pull_reapprove'
  const clearApproval = after === 'await'
  const pull = stage === 'scheduled'
  // ‏**السحبُ والتعديلُ في جملةٍ واحدة بشرط النسخة** (لا `unschedule` قبلها): تعديلٌ خسر السباق لا يُخرج المنشور من الطابور ولا يُضيّع خانته
  const done = await db.prepare(
    `UPDATE posts SET text = ?, media_json = ?, scheduled_at = ?, status = ?, rev = rev + 1, edited_in_sada = 1,
            account_id = CASE WHEN ? THEN NULL ELSE account_id END,
            enqueued_for = CASE WHEN ? THEN NULL ELSE enqueued_for END,
            copy_origin = CASE WHEN copy_origin IS NOT NULL AND ? THEN 'manual' ELSE copy_origin END,
            approved_by = CASE WHEN ? THEN ? WHEN ? THEN NULL ELSE approved_by END,
            approved_at = CASE WHEN ? THEN ? WHEN ? THEN NULL ELSE approved_at END
      WHERE id = ? AND org_id = ? AND rev = ? AND status = ? AND status <> 'published'
        AND (? = 0 OR (status = 'queued' AND dispatched_at IS NULL))`,
  ).bind(next.text, next.media_json, next.scheduled_at, status, pull ? 1 : 0, pull ? 1 : 0, change.text !== undefined ? 1 : 0,
    reapprove ? 1 : 0, actor, clearApproval ? 1 : 0, reapprove ? 1 : 0, now.toISOString(), clearApproval ? 1 : 0,
    postId, org, ifRev, row.status, pull ? 1 : 0).run()
  if (!changedRows(done)) return { ok: false, reason: CONFLICT_SAY, conflict: true }
  const stmts = [
    db.prepare(`INSERT INTO plan_edits (id, org_id, target_kind, target_id, rev, actor, at, before_json, after_json, reason)
                VALUES (?, ?, 'post', ?, ?, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), org, postId, row.rev, actor, now.toISOString(), snapshot(row), snapshot(next), reason),
  ]
  if (row.plan_item_id !== null) {
    // ‏والبندُ يتبع منشورَه: نصُّه وموعدُه بساعة المالك، فلا يفترقان
    const due = change.scheduledAt === undefined ? null : await dueOf(db, change.scheduledAt)
    stmts.push(db.prepare(`UPDATE plan_items SET copy = ?, due_local = coalesce(?, due_local), rev = rev + 1, edited_in_sada = 1, updated_at = datetime('now') WHERE id = ? AND org_id = ?`)
      .bind(next.text, due, row.plan_item_id, org))
  }
  await atomically(db, stmts)
  const findings = await recheck(db, org, postId, now)
  return { ok: true, rev: row.rev + 1, after, say: AFTER_SAY[after] + sayFindings(findings), findings }
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
export async function restoreEdit(
  db: Db, org: string, editId: string, ifRev: number, actor: string, role: Role, now: Date,
  /** المنشورُ الذي في النموذج: نسخةٌ لمنشورٍ غيرِه تُردّ، فلا يُستعاد منشورٌ ويُسجَّل غيرُه. */
  expect: string | null = null,
): Promise<ReviseResult & ({ readonly ok: false } | { readonly target: string })> {
  const verdict = mayDo(role, 'restore')
  if (!verdict.ok) return verdict
  const e = await db.prepare("SELECT target_id, rev, before_json FROM plan_edits WHERE id = ? AND org_id = ? AND target_kind = 'post'")
    .bind(editId, org).first<{ target_id: string; rev: number; before_json: string }>()
  if (e === null) return { ok: false, reason: 'لا نسخة بهذا المعرّف' }
  if (expect !== null && expect !== e.target_id) return { ok: false, reason: 'هذه النسخة لمنشورٍ آخر. افتح سجلّ منشورها.' }
  const before = parse(e.before_json)!
  const r = await revisePost(db, org, e.target_id, before, ifRev, actor, role, now, `استعادة النسخة ${e.rev}`)
  return r.ok ? { ...r, target: e.target_id } : r
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

/**
 * سياسةُ التطبيق (D-371) — **المسوّدةُ تُحدَّث وحدها، والمعتمدُ والمجدولُ لا يُمسّان بلا علم المالك، والمنشورُ لا يتغيّر**.
 *
 * - مسوّدةٌ لم تُعتمد ← `auto_applied`.
 * - معتمدٌ أو مجدولٌ أو فشل نشرُه ← `awaiting_owner`، ولا تُلمس حالتُه ولا موعدُه حتّى تقول «اعتمد التحديث».
 * - منشورٌ (أو رفضته المالك) ← `frozen_published`، يُعرض فقط.
 * - حُذف من الخطّة وهو مسوّدة ← يُؤرشف (يبقى صفًّا مرفوضًا بسببه) ولا يُحذف. وهو مجدولٌ ← `awaiting_owner`.
 * - نصٌّ عدّلته المالك بيدها (`copy_origin = manual`، أو نصُّه غيرُ ما كتبته الحزمة) لا يُستبدل أبدًا ← `awaiting_owner`.
 *
 * - تغييرٌ ينتظرها ثمّ جاءت مراجعةٌ أحدث بالنوع نفسِه للمنشور نفسِه ← يُطوى القديم (`superseded_by`) فلا يكتب فوق الأحدث.
 *
 * والمراجعةُ كلُّها في معاملةٍ واحدة (`atomically`)، والقيدُ الفريدُ على التغيير يمنع تطبيقه مرّتين.
 *
 * **والمفتاحُ الطبيعيّ يضمّ الشهر** (D-383 المرحلة ٤): `(org, period, item_no, platform)`، ومفتاحُ منع التكرار
 * `plan:{org}:{period}:{item}:{platform}` بلا رقم المراجعة (D-004). والمادّةُ التي أُرشفت ثمّ عادت يُضاف لمفتاحها معرّفُ
 * المؤرشَف، فلا يصطدم بمفتاحه ولا يدخل فيه رقمُ مراجعة.
 */
import { atomically, type Db, type DbStatement } from '../tokens'
import { attachStatement } from '../library'
import { isThread } from '../draft/thread'
import { entryPeriod, type Change, type SnapshotEntry } from './diff'

export type Disposition = 'auto_applied' | 'awaiting_owner' | 'kept_old' | 'accepted' | 'frozen_published'

export interface PackagePost {
  readonly id: string
  /** «YYYY-MM» شهرُ المنشور في الحزمة، والفارغُ لما لا شهر له. */
  readonly period?: string
  readonly item: string
  readonly platform: string
  readonly status: string
  readonly text: string
  readonly copyOrigin: string | null
  /** عدّله أحدٌ في صدى (D-383 المرحلة ٧): ما يخالفه في استيرادٍ لاحق ينتظر المالك. */
  readonly editedInSada?: boolean
}

export interface Decision {
  readonly change: Change
  readonly post: PackagePost | null
  readonly disposition: Disposition
}

const LIVE = new Set(['approved', 'edited', 'queued', 'failed'])
const FROZEN = new Set(['published', 'rejected'])

/** يدُ المالك على النصّ: علّمته، أو كتبت غيرَ ما كتبته الحزمة. */
export function ownerEdited(post: PackagePost, before: SnapshotEntry | null): boolean {
  if (post.copyOrigin === 'manual') return true
  return post.copyOrigin === 'package' && before !== null && before.text !== null && post.text.trim() !== before.text.trim()
}

/** الحكمُ وحده — نقيّ، والاختبارُ يمرّ على كلّ فرع. */
export function dispose(change: Change, post: PackagePost | null): Disposition {
  if (post === null) return 'auto_applied'
  // ‏خرج من الخطّة فأُرشف ثمّ عاد: يُكتب له منشورٌ جديد، والمؤرشفُ يبقى كما هو
  if (change.kind === 'added' && post.status === 'rejected') return 'auto_applied'
  if (FROZEN.has(post.status)) return 'frozen_published'
  if (LIVE.has(post.status)) return 'awaiting_owner'
  if (change.kind === 'text' && ownerEdited(post, change.before)) return 'awaiting_owner'
  // ‏«عُدِّل في صدى»: الموعدُ والوسيطُ كالنصّ، لا يدهسها استيرادٌ لاحق
  if (post.editedInSada === true && change.kind !== 'added') return 'awaiting_owner'
  return 'auto_applied'
}

export function decide(changes: readonly Change[], posts: readonly PackagePost[]): Decision[] {
  const byKey = new Map(posts.filter((p) => p.period !== undefined).map((p) => [p.period + '|' + p.item + '|' + p.platform, p]))
  // ‏منشورٌ لا يُعرف شهرُه (من خارج القاعدة) يُطابَق بمادّته ومنصّته كما كان
  const loose = new Map(posts.filter((p) => p.period === undefined).map((p) => [p.item + '|' + p.platform, p]))
  return changes.map((change) => {
    const post = byKey.get(changePeriod(change) + '|' + change.item + '|' + change.platform) ?? loose.get(change.item + '|' + change.platform) ?? null
    return { change, post, disposition: dispose(change, post) }
  })
}

/** شهرُ التغيير: ما حمله، وإلّا فمن تاريخ ما بعده أو ما قبله. */
export function changePeriod(c: Change): string {
  return c.period ?? entryPeriod(c.after ?? c.before ?? {})
}

/** مفتاحُ منع التكرار لمنشور الحزمة (D-004): ثابتٌ للبند في شهره، لا يتبدّل بمراجعة. */
export function packageKey(org: string, period: string, item: string, platform: string): string {
  return `plan:${org}:${period}:${item}:${platform}`
}

/**
 * ‏**بندُ الصفحة** (D-426): `linkedin-page` في الخطّة، و`posts.platform` يبقى `linkedin` (الفرقُ في الحساب، D-423) —
 * ‏فالعلامةُ مفتاحُه: `plan:…:linkedin-page`، غيرُ مفتاح البند الشخصيّ في يومه. فلا ترحيل.
 */
export const PAGE_ITEM = 'linkedin-page'
export const storedPlatform = (platform: string): string => (platform === PAGE_ITEM ? 'linkedin' : platform)
export const isPageKey = (key: string | null): boolean => /^plan:.*:linkedin-page(:after:.*)?$/.test(key ?? '')

/** منشوراتُ الحزمة الحيّة — أحدثُها لكلّ (شهر، مادّة، منصّة). */
export async function packagePosts(db: Db, org: string): Promise<PackagePost[]> {
  const { results } = await db.prepare(
    `SELECT id, coalesce(package_period, substr(package_due, 1, 7), '') AS period, package_item_no, platform, status, text, copy_origin, edited_in_sada, idempotency_key FROM posts
      WHERE org_id = ? AND package_item_no IS NOT NULL ORDER BY created_at ASC, rowid ASC LIMIT 800`,
  ).bind(org).all<{ id: string; period: string; package_item_no: string; platform: string; status: string; text: string; copy_origin: string | null; edited_in_sada: number; idempotency_key: string | null }>()
  const latest = new Map<string, PackagePost>()
  for (const r of results) {
    const p = { id: r.id, period: r.period, item: r.package_item_no, platform: r.platform === 'linkedin' && isPageKey(r.idempotency_key) ? PAGE_ITEM : r.platform, status: r.status, text: r.text, copyOrigin: r.copy_origin, editedInSada: r.edited_in_sada === 1 }
    const k = p.period + '|' + p.item + '|' + p.platform
    // ‏المؤرشفُ لا يغلب حيًّا قبله، لكنّ الأحدثَ من مؤرشفَين يغلب: منه يُبنى مفتاحُ العائد ثالثةً، فلا يصطدم بمفتاح الثاني
    const had = latest.get(k)
    if (had === undefined || p.status !== 'rejected' || had.status === 'rejected') latest.set(k, p)
  }
  return [...latest.values()]
}

export interface ApplyContext {
  readonly db: Db
  readonly org: string
  readonly revisionId: string
  readonly copySha: string | null
}

/** ما يكتبه تغييرٌ واحد على منشوره — للتطبيق الآليّ ولـ«اعتمد التحديث» معًا. */
export function changeStatements(ctx: ApplyContext, change: Change, post: PackagePost | null, accepting: boolean): { statements: DbStatement[]; postId: string | null } {
  const { db, org } = ctx
  const a = change.after
  const s: DbStatement[] = []
  if (change.kind === 'added') {
    if (post !== null && !FROZEN.has(post.status)) return { statements: [], postId: post.id }
    if (a === null || a.text === null) return { statements: [], postId: null }
    const id = crypto.randomUUID()
    const period = changePeriod(change)
    const base = packageKey(org, period, a.item, a.platform)
    // ‏عاد بعد أرشفته: المؤرشَفُ يحمل المفتاحَ الأصل، فيُميَّز الجديدُ بمعرّف المؤرشَف — لا برقم مراجعة
    const key = post !== null && post.status === 'rejected' ? base + ':after:' + post.id : base
    s.push(db.prepare(
      `INSERT OR IGNORE INTO posts (id, platform, type, text, status, idempotency_key, model, rationale, org_id,
          package_item_no, source_revision_id, copy_origin, copy_blob_sha, package_due, package_period)
        VALUES (?, ?, ?, ?, 'draft', ?, 'owner', 'من حزمة المحتوى', ?, ?, ?, 'package', ?, ?, ?)`,
    ).bind(id, storedPlatform(a.platform), isThread(storedPlatform(a.platform), a.text) ? 'thread' : 'text', a.text, key, org,
      a.item, ctx.revisionId, ctx.copySha, a.date + ' ' + a.time, period === '' ? null : period))
    if (a.media !== null) { const m = attachStatement(db, org, id, a.media); if (m !== null) s.push(m) }
    return { statements: s, postId: id }
  }
  if (post === null) return { statements: [], postId: null }
  const guard = accepting ? "status <> 'published'" : "status = 'draft'"
  if (change.kind === 'removed') {
    s.push(db.prepare(`UPDATE posts SET status = 'rejected', rationale = 'أُرشف: خرج من حزمة المحتوى', source_revision_id = ?
      WHERE id = ? AND org_id = ? AND ${guard}`).bind(ctx.revisionId, post.id, org))
  } else if (change.kind === 'text' && a !== null && a.text !== null) {
    s.push(db.prepare(`UPDATE posts SET text = ?, type = ?, copy_origin = 'package', copy_blob_sha = ?, source_revision_id = ?
      WHERE id = ? AND org_id = ? AND ${guard}`).bind(a.text, isThread(storedPlatform(a.platform), a.text) ? 'thread' : 'text', ctx.copySha, ctx.revisionId, post.id, org))
  } else if (change.kind === 'time' && a !== null) {
    s.push(db.prepare(`UPDATE posts SET package_due = ?, package_period = coalesce(?, package_period), source_revision_id = ? WHERE id = ? AND org_id = ? AND ${guard}`)
      .bind(a.date + ' ' + a.time, entryPeriod(a) || null, ctx.revisionId, post.id, org))
  } else if (change.kind === 'media') {
    s.push(db.prepare(`DELETE FROM media WHERE post_id = ? AND org_id = ? AND model = 'package'
      AND EXISTS (SELECT 1 FROM posts WHERE id = ? AND org_id = ? AND ${guard})`).bind(post.id, org, post.id, org))
    if (a !== null && a.media !== null) { const m = attachStatement(db, org, post.id, a.media); if (m !== null) s.push(m) }
  } else if (change.kind === 'format') {
    s.push(db.prepare(`UPDATE posts SET source_revision_id = ? WHERE id = ? AND org_id = ? AND ${guard}`).bind(ctx.revisionId, post.id, org))
  }
  return { statements: s, postId: post.id }
}

const json = (e: SnapshotEntry | null): string | null => (e === null ? null : JSON.stringify(e))

/** يطبّق المراجعة: الأحكامُ وصفوفُ التغيير وما يُكتب على المنشورات — معاملةٌ واحدة. */
export async function applyDecisions(ctx: ApplyContext, decisions: readonly Decision[]): Promise<{ applied: number; awaiting: number; frozen: number }> {
  const { db, org } = ctx
  const all: DbStatement[] = []
  let applied = 0
  let awaiting = 0
  let frozen = 0
  for (const d of decisions) {
    let postId = d.post?.id ?? null
    if (d.disposition === 'auto_applied') {
      const w = changeStatements(ctx, d.change, d.post, false)
      all.push(...w.statements)
      postId = w.postId
      applied += 1
    } else if (d.disposition === 'awaiting_owner') awaiting += 1
    else frozen += 1
    // ‏ما كان ينتظرها من مراجعةٍ أقدم بالنوع نفسِه طواه هذا الأحدث: لا يُعتمد فيكتب فوقه
    const period = changePeriod(d.change)
    all.push(db.prepare(`UPDATE package_changes SET disposition = 'kept_old', decided_at = datetime('now'), superseded_by = ?
      WHERE org_id = ? AND period = ? AND item_no = ? AND platform = ? AND kind = ? AND disposition = 'awaiting_owner' AND revision_id <> ?`)
      .bind(ctx.revisionId, org, period, d.change.item, d.change.platform, d.change.kind, ctx.revisionId))
    all.push(db.prepare(
      `INSERT OR IGNORE INTO package_changes (id, org_id, revision_id, period, item_no, platform, kind, before_json, after_json, post_id, disposition, decided_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${d.disposition === 'awaiting_owner' ? 'NULL' : "datetime('now')"})`,
    ).bind(crypto.randomUUID(), org, ctx.revisionId, period, d.change.item, d.change.platform, d.change.kind, json(d.change.before), json(d.change.after), postId, d.disposition))
  }
  all.push(db.prepare("UPDATE package_revisions SET status = 'applied', applied_at = datetime('now') WHERE id = ? AND org_id = ?").bind(ctx.revisionId, org))
  await atomically(db, all)
  return { applied, awaiting, frozen }
}

export interface StoredChange {
  readonly id: string
  readonly period?: string
  readonly revisionId: string
  readonly item: string
  readonly platform: string
  readonly kind: Change['kind']
  readonly before: SnapshotEntry | null
  readonly after: SnapshotEntry | null
  readonly postId: string | null
  readonly disposition: Disposition
  readonly decidedAt?: string | null
  readonly supersededBy?: string | null
}

/** ‏`summary_counts.awaiting` من صفوف التغيير نفسِها — بعد كلّ قرار، فلا يناقض الرأسُ الشارة. */
export function recountAwaiting(db: Db, org: string, revisionId: string): DbStatement {
  return db.prepare(`UPDATE package_revisions SET summary_counts = json_set(CASE WHEN json_valid(summary_counts) THEN summary_counts ELSE '{}' END, '$.awaiting',
      (SELECT count(*) FROM package_changes WHERE org_id = ? AND revision_id = ? AND disposition = 'awaiting_owner'))
    WHERE id = ? AND org_id = ?`).bind(org, revisionId, revisionId, org)
}

export interface DecideOutcome {
  /** ما حُسم بقرارها. */
  readonly done: number
  /** ما طواه تحديثٌ أحدث مسّ المنشورَ نفسَه — لم يُكتب، ويُقال لها. */
  readonly superseded: number
}

/** قرارُ المالك على تغييرٍ ينتظرها: «اعتمد التحديث» يكتبه، و«أبقِ القديم» يتركه — ومرّةً واحدة. */
export async function decideChange(db: Db, org: string, ids: readonly string[], verdict: 'accept' | 'keep'): Promise<DecideOutcome> {
  let done = 0
  let superseded = 0
  for (const id of ids.slice(0, 100)) {
    const r = await db.prepare(`SELECT c.id, c.revision_id, c.period, c.item_no, c.platform, c.kind, c.before_json, c.after_json, c.post_id,
        p.status, p.text, p.copy_origin,
        (SELECT c2.revision_id FROM package_changes c2
           JOIN package_revisions r2 ON r2.id = c2.revision_id AND r2.org_id = c2.org_id
           JOIN package_revisions r1 ON r1.id = c.revision_id AND r1.org_id = c.org_id
          WHERE c2.org_id = c.org_id AND c2.period = c.period AND c2.item_no = c.item_no AND c2.platform = c.platform AND c2.kind = c.kind
            AND c2.disposition IN ('accepted', 'auto_applied') AND r2.rowid > r1.rowid ORDER BY r2.rowid DESC LIMIT 1) AS newer
        FROM package_changes c LEFT JOIN posts p ON p.id = c.post_id AND p.org_id = c.org_id
       WHERE c.id = ? AND c.org_id = ? AND c.disposition = 'awaiting_owner'`).bind(id, org).first<{
      id: string; revision_id: string; period: string; item_no: string; platform: string; kind: Change['kind']; before_json: string | null; after_json: string | null
      post_id: string | null; status: string | null; text: string | null; copy_origin: string | null; newer: string | null
    }>()
    if (r === null) continue
    // ‏مراجعةٌ أحدثُ كتبت على المنشور بعد هذا التغيير: اعتمادُه يعيد نصًّا أقدم — فيُطوى ويُقال لها
    if (verdict === 'accept' && r.newer !== null) {
      await atomically(db, [
        db.prepare(`UPDATE package_changes SET disposition = 'kept_old', decided_at = datetime('now'), superseded_by = ? WHERE id = ? AND org_id = ? AND disposition = 'awaiting_owner'`)
          .bind(r.newer, id, org),
        recountAwaiting(db, org, r.revision_id),
      ])
      superseded += 1
      continue
    }
    const change: Change = {
      period: r.period, item: r.item_no, platform: r.platform, kind: r.kind,
      before: r.before_json === null ? null : JSON.parse(r.before_json) as SnapshotEntry, after: r.after_json === null ? null : JSON.parse(r.after_json) as SnapshotEntry,
    }
    const post = r.post_id === null || r.status === null ? null
      : { id: r.post_id, period: r.period, item: r.item_no, platform: r.platform, status: r.status, text: r.text ?? '', copyOrigin: r.copy_origin }
    const stmts: DbStatement[] = []
    if (verdict === 'accept' && post !== null && post.status !== 'published') {
      const rev = await db.prepare('SELECT snapshot_json FROM package_revisions WHERE id = ? AND org_id = ?').bind(r.revision_id, org).first<{ snapshot_json: string }>()
      const copySha = rev === null ? null : (JSON.parse(rev.snapshot_json) as { copySha?: string | null }).copySha ?? null
      stmts.push(...changeStatements({ db, org, revisionId: r.revision_id, copySha }, change, post, true).statements)
    }
    stmts.push(db.prepare(`UPDATE package_changes SET disposition = ?, decided_at = datetime('now') WHERE id = ? AND org_id = ? AND disposition = 'awaiting_owner'`)
      .bind(verdict === 'accept' ? 'accepted' : 'kept_old', id, org))
    stmts.push(recountAwaiting(db, org, r.revision_id))
    await atomically(db, stmts)
    done += 1
  }
  return { done, superseded }
}

/** تغييراتُ مراجعةٍ واحدة بحال منشوراتها — للشاشة. */
export async function readChanges(db: Db, org: string, revisionId: string): Promise<(StoredChange & { readonly postStatus: string | null })[]> {
  const { results } = await db.prepare(
    `SELECT c.id, c.revision_id, c.period, c.item_no, c.platform, c.kind, c.before_json, c.after_json, c.post_id, c.disposition, c.decided_at, c.superseded_by, p.status AS post_status
       FROM package_changes c LEFT JOIN posts p ON p.id = c.post_id AND p.org_id = c.org_id
      WHERE c.org_id = ? AND c.revision_id = ? ORDER BY c.period, c.item_no, c.platform, c.kind LIMIT 400`,
  ).bind(org, revisionId).all<{
    id: string; revision_id: string; period: string; item_no: string; platform: string; kind: Change['kind']; before_json: string | null; after_json: string | null
    post_id: string | null; disposition: Disposition; decided_at: string | null; superseded_by: string | null; post_status: string | null
  }>()
  return results.map((r) => ({
    id: r.id, revisionId: r.revision_id, period: r.period, item: r.item_no, platform: r.platform, kind: r.kind,
    before: r.before_json === null ? null : JSON.parse(r.before_json) as SnapshotEntry,
    after: r.after_json === null ? null : JSON.parse(r.after_json) as SnapshotEntry,
    postId: r.post_id, disposition: r.disposition, decidedAt: r.decided_at, supersededBy: r.superseded_by, postStatus: r.post_status,
  }))
}

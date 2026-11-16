/**
 * المراجعة (D-370) — **كلُّ دفعٍ مراجعةٌ برقم التزامه، والدفعةُ نفسُها مرّتين مراجعةٌ واحدة**.
 *
 * بعد مزامنةٍ اكتمل نقلُها: تُقرأ الخطّةُ (الأعلى vN في 01-plan) والنصوصُ (02-copy) خامًا بنداءين مجّانيّين، وتُبنى اللقطة بالمعتمد من
 * الوسائط ولونِ كلّ منصّة، ثمّ يُحسب الفرقُ عن آخر مراجعةٍ طُبّقت، ثمّ `INSERT OR IGNORE` بمفتاح (org_id, commit_sha): ما رآه
 * الويب هوك لا يعيده الفحصُ الساعيّ. ثمّ تُطبَّق الأحكامُ في معاملةٍ واحدة.
 */
import { atomically, type Db } from '../tokens'
import { isTimeout } from '../net/timeout'
import { commitInfo, GitHubError, listTree, rawFile, type RepoRef } from './github'
import { classifyPath } from './classify'
import { choosePlanFile, readPackagePlan, type PackagePlan } from './plan'
import { copyVersion, mergeCopies } from './copy'
import { diffSnapshots, snapshot, type Change, type Snapshot, type SnapshotEntry } from './diff'
import { applyDecisions, decide, packagePosts, type Decision } from './apply'
import { currentPicks, readPackageMedia, type PackageSource } from './sync'

export interface RevisionRow {
  readonly id: string
  readonly commit: string
  readonly parent: string | null
  readonly message: string
  readonly status: 'pending' | 'analysed' | 'applied' | 'failed'
  readonly counts: { readonly added: number; readonly removed: number; readonly changed: number; readonly awaiting: number }
  readonly error: string | null
  readonly createdAt: string
  readonly appliedAt: string | null
}

export type ReviseReport =
  | { readonly kind: 'exists'; readonly id: string }
  | { readonly kind: 'applied'; readonly id: string; readonly changes: number; readonly awaiting: number }
  | { readonly kind: 'failed'; readonly reason: string }

const ZERO = { added: 0, removed: 0, changed: 0, awaiting: 0 }

export function countChanges(changes: readonly Change[], awaiting: number): RevisionRow['counts'] {
  return {
    added: changes.filter((c) => c.kind === 'added').length,
    removed: changes.filter((c) => c.kind === 'removed').length,
    changed: changes.filter((c) => c.kind !== 'added' && c.kind !== 'removed').length,
    awaiting,
  }
}

export async function lastAppliedSnapshot(db: Db, org: string): Promise<Snapshot | null> {
  const r = await db.prepare("SELECT snapshot_json FROM package_revisions WHERE org_id = ? AND status = 'applied' ORDER BY created_at DESC, rowid DESC LIMIT 1")
    .bind(org).first<{ snapshot_json: string }>()
  return r === null ? null : (JSON.parse(r.snapshot_json) as Snapshot)
}

export interface ReviseDeps {
  readonly db: Db; readonly token: string; readonly fetchImpl?: typeof fetch
  /** ‏«زامن الآن» بيد المالك يعيد مراجعةً تعذّرت ولو لم يُعدّ عطلُها عابرًا، تحت سقف المحاولات نفسه. */
  readonly retryFailed?: boolean
}

/** سقفُ إعادة المراجعة المتعثّرة بعطلٍ عابر — بعده يبقى السببُ ولا يُعاد. */
export const MAX_REVISION_ATTEMPTS = 5

/** بعد كم دقيقةً تُعدّ المراجعةُ المحسوبةُ غيرُ المطبَّقة متعطّلةً تُعاد. */
export const STALE_MINUTES = 10

/** عطلٌ عابر يستحقّ الإعادة: مهلةٌ أو انقطاعٌ أو 5xx أو 429 أو 408. وما سواه (401، 404، ملفٌّ تالف) دائمٌ بسببه. */
export function transientError(error: unknown): boolean {
  if (error instanceof GitHubError) return error.status >= 500 || error.status === 429 || error.status === 408
  if (isTimeout(error)) return true
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TypeError')
}

/** ملفّا الخطّة والنصوص من شجرة الالتزام المراجَع نفسِه — لا من آخر مزامنة. */
async function reviewedFiles(repo: RepoRef, commit: string, root: string, fetchImpl?: typeof fetch): Promise<{ path: string; blob_sha: string }[]> {
  const tree = await listTree(repo, commit, root, 5000, fetchImpl)
  return tree.filter((b) => { const r = classifyPath(b.path).role; return r === 'plan' || r === 'copy' }).map((b) => ({ path: b.path, blob_sha: b.sha }))
}

/**
 * يصنع مراجعةَ الالتزام ويطبّقها — والعطلُ مراجعةٌ «تعذّرت» بسببها لا استثناء.
 * والمطبَّقةُ أو المتعثّرةُ بعطلٍ دائم «موجودة». أمّا المتعثّرةُ بعطلٍ عابر، أو المحسوبةُ ولم تُطبَّق، فتُعاد بعدّاد محاولاتها
 * في الويب هوك أو الفحص الساعيّ التالي حتّى `MAX_REVISION_ATTEMPTS`.
 */
export async function revisePackage(deps: ReviseDeps, source: PackageSource, commit: string): Promise<ReviseReport> {
  const { db } = deps
  const org = source.org
  const had = await db.prepare(
    `SELECT id, status, attempts, retryable, created_at, rowid AS rn, COALESCE(claimed_at, created_at) < datetime('now', '-${STALE_MINUTES} minutes') AS stale
       FROM package_revisions WHERE org_id = ? AND commit_sha = ?`,
  ).bind(org, commit).first<{ id: string; status: RevisionRow['status']; attempts: number; retryable: number; created_at: string; rn: number; stale: number }>()
  let attempts = 0
  let createdAt: string | null = null
  if (had !== null) {
    // ‏المحسوبةُ أو المعلّقة تُعاد إن تعطّلت وحدها (أقدمُ من عشر دقائق) — لا وهي تُطبَّق في نداءٍ آخر
    const retry = (had.status === 'failed' && (had.retryable === 1 || deps.retryFailed === true) && had.attempts < MAX_REVISION_ATTEMPTS)
      || ((had.status === 'analysed' || had.status === 'pending') && had.stale === 1)
    if (!retry) return { kind: 'exists', id: had.id }
    // ‏التزامٌ طُبّق بعده أحدثُ منه: لا يُعاد فيكتب القديمُ فوق الأحدث
    const newer = await db.prepare(
      "SELECT 1 AS x FROM package_revisions WHERE org_id = ? AND status = 'applied' AND id <> ? AND (created_at > ? OR (created_at = ? AND rowid > ?)) LIMIT 1",
    ).bind(org, had.id, had.created_at, had.created_at, had.rn).first<{ x: number }>()
    if (newer !== null) {
      await db.prepare("UPDATE package_revisions SET status = 'failed', retryable = 0, error_reason = ? WHERE id = ? AND org_id = ? AND status <> 'applied'")
        .bind('طواه التزامٌ أحدث', had.id, org).run()
      return { kind: 'exists', id: had.id }
    }
    // ‏الحجزُ بمقارنةٍ وتبديل: نداءٌ واحد يفوز بالصفّ، والآخرُ «موجود»
    const claim = await db.prepare("UPDATE package_revisions SET attempts = attempts + 1, claimed_at = datetime('now') WHERE id = ? AND org_id = ? AND status = ? AND attempts = ?")
      .bind(had.id, org, had.status, had.attempts).run() as { meta?: { changes?: number }; changes?: number }
    if ((claim.meta?.changes ?? claim.changes ?? 0) !== 1) return { kind: 'exists', id: had.id }
    attempts = had.attempts
    createdAt = had.created_at
    await atomically(db, [
      db.prepare('DELETE FROM package_changes WHERE revision_id = ? AND org_id = ?').bind(had.id, org),
      db.prepare("DELETE FROM package_revisions WHERE id = ? AND org_id = ? AND status <> 'applied'").bind(had.id, org),
    ])
  }
  const repo: RepoRef = { owner: source.owner, repo: source.repo, branch: source.branch, token: deps.token }
  const id = 'rev_' + crypto.randomUUID().replace(/-/g, '').slice(0, 20)
  const full = (p: string): string => (source.root === '' ? p : source.root + '/' + p)
  try {
    const files = await reviewedFiles(repo, commit, source.root, deps.fetchImpl)
    const planPath = choosePlanFile(files.map((f) => f.path))
    let plan: PackagePlan = { entries: [], rules: null, days: 0, columns: [], problems: ['لا ملفّ خطّة في 01-plan'] }
    if (planPath !== null) plan = await readPackagePlan(new Uint8Array(await (await rawFile(repo, full(planPath), commit, deps.fetchImpl)).arrayBuffer()))
    // ‏ترتيبُ `mergeCopies` نفسُه: الأعلى نسخةً آخرًا، فبصمةُ النصّ لملفّه الغالب
    const copyFiles = files.filter((f) => /^02-copy\/[^/]+\.md$/i.test(f.path))
      .sort((a, b) => copyVersion(a.path) - copyVersion(b.path) || a.path.localeCompare(b.path))
    const copies = []
    for (const f of copyFiles) copies.push({ path: f.path, md: await (await rawFile(repo, full(f.path), commit, deps.fetchImpl)).text() })
    const copy = mergeCopies(copies)
    const copySha = copyFiles.length === 0 ? null : copyFiles[copyFiles.length - 1]!.blob_sha
    const picks = currentPicks(await readPackageMedia(db, org))
    const next = snapshot({ plan, copy, copySha, planPath, picks, variants: { x: source.variants.x, linkedin: source.variants.linkedin } })
    const prev = await lastAppliedSnapshot(db, org)
    const changes = diffSnapshots(prev, next)
    const info = await commitInfo(repo, commit, deps.fetchImpl)
    // ‏الإرشاداتُ في اللقطة: «اكتب الناقص» يكتب بها
    const stored = { ...next, rules: plan.rules, rulesFound: plan.rules !== null, planProblems: plan.problems, unparsed: copy.unparsed }
    const ins = await db.prepare(
      `INSERT OR IGNORE INTO package_revisions (id, org_id, source_id, commit_sha, parent_commit_sha, commit_message, status, snapshot_json, diff_json, summary_counts, attempts, created_at, claimed_at)
        VALUES (?, ?, ?, ?, ?, ?, 'analysed', ?, ?, ?, ?, COALESCE(?, datetime('now')), datetime('now'))`,
    ).bind(id, org, source.id, commit, info?.parent ?? null, info?.message ?? '', JSON.stringify(stored), JSON.stringify(changes),
      JSON.stringify(countChanges(changes, 0)), attempts + 1, createdAt).run() as { meta?: { changes?: number }; changes?: number }
    if ((ins.meta?.changes ?? ins.changes ?? 1) === 0) {
      const again = await db.prepare('SELECT id FROM package_revisions WHERE org_id = ? AND commit_sha = ?').bind(org, commit).first<{ id: string }>()
      return { kind: 'exists', id: again?.id ?? id }
    }
    const decisions = followOrHold(decide(changes, await packagePosts(db, org)), source.followUpdates)
    const out = await applyDecisions({ db, org, revisionId: id, copySha }, decisions)
    await db.prepare('UPDATE package_revisions SET summary_counts = ? WHERE id = ? AND org_id = ?')
      .bind(JSON.stringify(countChanges(changes, out.awaiting)), id, org).run()
    return { kind: 'applied', id, changes: changes.length, awaiting: out.awaiting }
  } catch (error) {
    const reason = error instanceof Error && error.name === 'GitHubError' ? error.message
      : isTimeout(error) ? 'GitHub لم يردّ في المهلة'
      : 'تعذّر بناء الخطّة من الحزمة (' + (error instanceof Error ? (error.name + ': ' + error.message).replace(/\s+/g, ' ').slice(0, 160) : 'عطل') + ')'
    console.error('package revision failed', error)
    const retryable = transientError(error) && attempts + 1 < MAX_REVISION_ATTEMPTS ? 1 : 0
    // ‏صفٌّ «محسوب» سبق العطلَ يصير «تعذّر» بسببه — لا يُتجاهل الإدراج فيبقى محسوبًا بلا تطبيق
    await db.prepare(
      `INSERT INTO package_revisions (id, org_id, source_id, commit_sha, status, error_reason, summary_counts, attempts, retryable, created_at)
        VALUES (?, ?, ?, ?, 'failed', ?, ?, ?, ?, COALESCE(?, datetime('now')))
        ON CONFLICT (org_id, commit_sha) DO UPDATE SET status = 'failed', error_reason = excluded.error_reason, attempts = excluded.attempts, retryable = excluded.retryable
        WHERE package_revisions.status <> 'applied'`,
    ).bind(id, org, source.id, commit, reason, JSON.stringify(ZERO), attempts + 1, retryable, createdAt).run().catch(() => undefined)
    return { kind: 'failed', reason }
  }
}

/**
 * «تابع التحديث تلقائيًّا» مطفأ (D-377): ما كان سيُكتب وحده على منشورٍ قائم ينتظر قرارَ المالك.
 * والمادّةُ الجديدة تبقى مسوّدةً تُكتب — لا منشورَ قائمًا يُمسّ.
 */
export function followOrHold(decisions: readonly Decision[], follow: boolean): Decision[] {
  if (follow) return [...decisions]
  return decisions.map((d) => (d.disposition === 'auto_applied' && d.post !== null && d.change.kind !== 'added' ? { ...d, disposition: 'awaiting_owner' } : d))
}

/** مراجعةٌ واحدة بمعرّفها — أيُّ مراجعةٍ للمنظّمة، لا آخرُ عشرين وحدها. */
export async function readRevision(db: Db, org: string, id: string): Promise<RevisionRow | null> {
  const r = await db.prepare(
    `SELECT id, commit_sha, parent_commit_sha, commit_message, status, summary_counts, error_reason, created_at, applied_at
       FROM package_revisions WHERE id = ? AND org_id = ?`,
  ).bind(id, org).first<RevRow>().catch(() => null)
  return r === null ? null : toRow(r)
}

/** أحدثُ مراجعةٍ فيها تغييرٌ ينتظر قرار المالك — إليها تشير الشارة. */
export async function awaitingRevision(db: Db, org: string): Promise<string | null> {
  const r = await db.prepare(
    `SELECT c.revision_id AS id FROM package_changes c JOIN package_revisions r ON r.id = c.revision_id AND r.org_id = c.org_id
      WHERE c.org_id = ? AND c.disposition = 'awaiting_owner' ORDER BY r.created_at DESC, r.rowid DESC LIMIT 1`,
  ).bind(org).first<{ id: string }>().catch(() => null)
  return r?.id ?? null
}

/** ما لا نصَّ جاهزًا له في آخر لقطة، **ولم تُكتب له مسوّدةٌ بعد** — فلا يُكتب مرّتين ولا يُدفع ثمنُه مرّتين. */
export async function missingCopy(db: Db, org: string, snap: Snapshot | null): Promise<SnapshotEntry[]> {
  const without = (snap?.entries ?? []).filter((e) => e.text === null)
  if (without.length === 0) return []
  const { results } = await db.prepare(
    `SELECT package_item_no, platform FROM posts WHERE org_id = ? AND package_item_no IS NOT NULL AND status <> 'rejected' LIMIT 400`,
  ).bind(org).all<{ package_item_no: string; platform: string }>().catch(() => ({ results: [] as { package_item_no: string; platform: string }[] }))
  const have = new Set(results.map((r) => r.package_item_no + '|' + r.platform))
  return without.filter((e) => !have.has(e.item + '|' + e.platform))
}

interface RevRow { id: string; commit_sha: string; parent_commit_sha: string | null; commit_message: string; status: RevisionRow['status']; summary_counts: string; error_reason: string | null; created_at: string; applied_at: string | null }

function toRow(r: RevRow): RevisionRow {
  return {
    id: r.id, commit: r.commit_sha, parent: r.parent_commit_sha, message: r.commit_message, status: r.status,
    counts: { ...ZERO, ...(JSON.parse(r.summary_counts) as Partial<RevisionRow['counts']>) }, error: r.error_reason, createdAt: r.created_at, appliedAt: r.applied_at,
  }
}

/** سجلُّ المراجعات — الأحدثُ أوّلًا. */
export async function listRevisions(db: Db, org: string, limit = 20): Promise<RevisionRow[]> {
  try {
    const { results } = await db.prepare(
      `SELECT id, commit_sha, parent_commit_sha, commit_message, status, summary_counts, error_reason, created_at, applied_at
         FROM package_revisions WHERE org_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ${Math.min(50, limit)}`,
    ).bind(org).all<RevRow>()
    return results.map(toRow)
  } catch {
    return []
  }
}

/**
 * تبويبُ «حزمة المحتوى» في الرافدة: أرُبطت حزمةٌ، وكم تغييرًا ينتظر قرارَ المالك — **جملةٌ واحدة** لكلّ لوح (سقفُ `panelLoad`).
 * وعطلُ القراءة لا يكسر اللوحة: التبويبُ يغيب بلا شارة.
 */
export async function packageNav(db: Db, org: string): Promise<{ readonly linked: boolean; readonly awaiting: number }> {
  const r = await db.prepare(
    `SELECT (SELECT count(*) FROM package_sources WHERE org_id = ?) AS linked,
            (SELECT count(*) FROM package_changes WHERE org_id = ? AND disposition = 'awaiting_owner') AS n`,
  ).bind(org, org).first<{ linked: number; n: number }>().catch(() => null)
  return { linked: (r?.linked ?? 0) > 0, awaiting: r?.n ?? 0 }
}

/** كم تغييرًا ينتظر قرار المالك — للشارة في الخطّة. */
export async function awaitingCount(db: Db, org: string): Promise<number> {
  const r = await db.prepare("SELECT count(*) AS n FROM package_changes WHERE org_id = ? AND disposition = 'awaiting_owner'").bind(org).first<{ n: number }>().catch(() => null)
  return r?.n ?? 0
}

/** فرقُ المراجعة كما حُسب — يُعرض إن لم تُكتب صفوفُ التغيير (مراجعةٌ لم تُطبَّق). */
export async function revisionDiff(db: Db, org: string, id: string): Promise<Change[]> {
  const r = await db.prepare('SELECT diff_json FROM package_revisions WHERE id = ? AND org_id = ?').bind(id, org).first<{ diff_json: string }>().catch(() => null)
  return r === null ? [] : (JSON.parse(r.diff_json) as Change[])
}

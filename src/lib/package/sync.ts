/**
 * مزامنةُ حزمة المحتوى (D-366) — **دفعٌ إلى الفرع حدثٌ تفهمه صدى، والفحصُ الساعيّ يلتقط ما فات الويب هوك**.
 *
 * الدورة: رأسُ الفرع بـ ETag (304 أو التزامٌ رأيناه ← لا شيء)، ثمّ الشجرةُ مرّةً، ثمّ ما تغيّرت بصمتُه وحده يُكتب في
 * `package_files`، ثمّ ما لم يُنقل من المقاطع والأغلفة يُبثّ إلى R2 بسقف الدفعة، والباقي في رسالة طابورٍ تالية. ثمّ يُعاد حسابُ
 * المعتمد لكلّ مادّةٍ ولون في `package_media`. **ولا نداءَ مدفوعًا**: GitHub مجّانيّ بحدّ الرمز، والنقلُ بلا كلفة.
 */
import { inBatches, type Db, type DbStatement } from '../tokens'
import { MAX_MEDIA_FILES, SYNC_BYTE_CAP } from '../drive/media'
import { openScoped, sealScoped, LEGACY_RAW, toBase64 } from '../crypto'
import { OWNER_ORG } from '../tenancy'
import { branchHead, GitHubError, listTree, type RepoRef } from './github'
import { probeAccess } from './diagnose'
import { classifyPath, mimeOf, type FileRole, type PackageVariant } from './classify'
import { pickMedia, type PackageFile, type PackagePick } from './pick'
import { storeBlob, type StreamBucket } from './media'

const SCOPE = 'package'
const tokenContext = (id: string): string => `package:${id}:token`
const hookContext = (id: string): string => `package:${id}:webhook`

export interface PackageSource {
  readonly id: string
  readonly org: string
  readonly owner: string
  readonly repo: string
  readonly branch: string
  readonly root: string
  readonly lastCommit: string | null
  readonly lastTree: string | null
  readonly lastEtag: string | null
  readonly lastCheckedAt: string | null
  readonly status: 'new' | 'ok' | 'partial' | 'failed'
  readonly error: string | null
  readonly hasHook: boolean
  readonly sealedToken: { readonly ciphertext: string; readonly iv: string } | null
  /** لونُ كلّ منصّة (D-368) — تعدّله المالك من بطاقة الإعدادات. */
  readonly variants: { readonly x: PackageVariant; readonly linkedin: PackageVariant }
  /** «تابع التحديث تلقائيًّا» (D-377) — الافتراضُ نعم. */
  readonly followUpdates: boolean
}

interface SourceRow {
  id: string; org_id: string; owner: string; repo: string; branch: string; root_path: string
  token_enc: string | null; token_iv: string | null; webhook_secret_enc: string | null
  last_commit_sha: string | null; last_tree_sha: string | null; last_etag: string | null; last_checked_at: string | null
  status: PackageSource['status']; error_reason: string | null
  x_variant?: PackageVariant; linkedin_variant?: PackageVariant; follow_updates?: number
}

const SOURCE_COLUMNS = `id, org_id, owner, repo, branch, root_path, token_enc, token_iv, webhook_secret_enc, last_commit_sha, last_tree_sha,
  last_etag, last_checked_at, status, error_reason, x_variant, linkedin_variant, follow_updates`

function toSource(r: SourceRow): PackageSource {
  return {
    id: r.id, org: r.org_id, owner: r.owner, repo: r.repo, branch: r.branch, root: r.root_path,
    lastCommit: r.last_commit_sha, lastTree: r.last_tree_sha, lastEtag: r.last_etag, lastCheckedAt: r.last_checked_at,
    status: r.status, error: r.error_reason, hasHook: r.webhook_secret_enc !== null,
    sealedToken: r.token_enc !== null && r.token_iv !== null ? { ciphertext: r.token_enc, iv: r.token_iv } : null,
    variants: { x: r.x_variant ?? 'dark', linkedin: r.linkedin_variant ?? 'light' },
    followUpdates: (r.follow_updates ?? 1) !== 0,
  }
}

/** مصدرُ المنظّمة — و`null` إن لم تربط بعد أو لم يُرحَّل الجدول. */
export async function readSource(db: Db, org: string): Promise<PackageSource | null> {
  try {
    const r = await db.prepare(`SELECT ${SOURCE_COLUMNS} FROM package_sources WHERE org_id = ?`).bind(org).first<SourceRow>()
    return r === null ? null : toSource(r)
  } catch {
    return null
  }
}

/** المصدرُ بمعرّفه — للويب هوك العامّ الذي لا يعرف المنظّمةَ قبله. */
export async function sourceById(db: Db, id: string): Promise<PackageSource | null> {
  const r = await db.prepare(`SELECT ${SOURCE_COLUMNS} FROM package_sources WHERE id = ?`).bind(id).first<SourceRow>().catch(() => null)
  return r === null ? null : toSource(r)
}

const NAME = /^[A-Za-z0-9_.-]{1,100}$/
const BRANCH = /^[A-Za-z0-9_./-]{1,200}$/

export interface SourceInput { readonly owner: string; readonly repo: string; readonly branch: string; readonly root: string }

/** يفحص الحقولَ الأربعة — والسببُ بلغةٍ تقرؤها المالك. */
export function checkSource(raw: Record<string, string>): { ok: true; value: SourceInput } | { ok: false; reason: string } {
  const owner = (raw['owner'] ?? '').trim()
  const repo = (raw['repo'] ?? '').trim()
  const branch = (raw['branch'] ?? '').trim()
  const root = (raw['root'] ?? '').trim().replace(/^\/+|\/+$/g, '')
  if (!NAME.test(owner)) return { ok: false, reason: 'اكتب صاحب المستودع كما في GitHub، مثل mooryali95' }
  if (!NAME.test(repo)) return { ok: false, reason: 'اكتب اسم المستودع وحده، مثل MI-private' }
  if (/^\.+$/.test(owner) || /^\.+$/.test(repo)) return { ok: false, reason: 'اكتب صاحب المستودع واسمه كما في GitHub، لا نقاطًا وحدها' }
  if (!BRANCH.test(branch) || branch.includes('..') || branch.split('/').some((p) => p === '' || /^\.+$/.test(p))) return { ok: false, reason: 'اكتب اسم الفرع، مثل social-media-video' }
  if (root.length > 200 || root.includes('..') || (root !== '' && root.split('/').some((p) => p === '' || /^\.+$/.test(p))) || !/^[A-Za-z0-9_./-]*$/.test(root)) return { ok: false, reason: 'اكتب المجلّد كما في المستودع، مثل social-media' }
  return { ok: true, value: { owner, repo, branch, root } }
}

/** يربط المصدرَ أو يعدّله — وتغييرُ المستودع أو الفرع يمحو آخرَ التزامٍ وETag فتُقرأ الحزمةُ من جديد. */
export async function saveSource(db: Db, org: string, v: SourceInput): Promise<string> {
  const id = 'pkg_' + crypto.randomUUID().replace(/-/g, '').slice(0, 20)
  await db.prepare(
    `INSERT INTO package_sources (id, org_id, owner, repo, branch, root_path) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (org_id) DO UPDATE SET owner = excluded.owner, repo = excluded.repo, branch = excluded.branch, root_path = excluded.root_path,
       last_commit_sha = NULL, last_tree_sha = NULL, last_etag = NULL, status = 'new', error_reason = NULL`,
  ).bind(id, org, v.owner, v.repo, v.branch, v.root).run()
  const row = await db.prepare('SELECT id FROM package_sources WHERE org_id = ?').bind(org).first<{ id: string }>()
  return row?.id ?? id
}

/** يفصل المصدر — ملفّاتُه تُمحى من الفهرس، **ووسائطُه تبقى**: منشورٌ رُبط بها يبقى أثرُه. */
export async function removeSource(db: Db, org: string): Promise<void> {
  await inBatches(db, [
    db.prepare('DELETE FROM package_files WHERE org_id = ?').bind(org),
    db.prepare('DELETE FROM package_sources WHERE org_id = ?').bind(org),
  ])
}

/** سرُّ الويب هوك: يُولَّد هنا، ويُخزَّن مشفّرًا، ويُعاد نصُّه مرّةً واحدة للعرض — ولا يُسجَّل. */
export async function rotateHookSecret(db: Db, encKey: string, org: string, sourceId: string): Promise<string> {
  const secret = toBase64(crypto.getRandomValues(new Uint8Array(32))).replace(/[^A-Za-z0-9]/g, '').slice(0, 40)
  const sealed = await sealScoped(encKey, SCOPE, secret, hookContext(sourceId))
  await db.prepare('UPDATE package_sources SET webhook_secret_enc = ?, webhook_secret_iv = ? WHERE id = ? AND org_id = ?')
    .bind(sealed.ciphertext, sealed.iv, sourceId, org).run()
  return secret
}

async function hookSecret(db: Db, encKey: string, s: PackageSource): Promise<string | null> {
  const r = await db.prepare('SELECT webhook_secret_enc, webhook_secret_iv FROM package_sources WHERE id = ? AND org_id = ?')
    .bind(s.id, s.org).first<{ webhook_secret_enc: string | null; webhook_secret_iv: string | null }>().catch(() => null)
  if (r === null || r.webhook_secret_enc === null || r.webhook_secret_iv === null) return null
  return openScoped(encKey, SCOPE, { ciphertext: r.webhook_secret_enc, iv: r.webhook_secret_iv }, hookContext(s.id), LEGACY_RAW).catch(() => null)
}

/** مقارنةٌ ثابتةُ الزمن لسلسلتين بطولٍ واحد. */
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a[i]! ^ b[i]!
  return diff === 0
}

/** يتحقّق من `X-Hub-Signature-256` على الجسم الخامّ **قبل أيّ قراءةٍ له**. */
export async function verifySignature(secret: string, rawBody: ArrayBuffer, header: string | null): Promise<boolean> {
  if (header === null || !/^sha256=[0-9a-f]{64}$/.test(header)) return false
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, rawBody))
  const want = new Uint8Array(header.slice(7).match(/../g)!.map((h) => parseInt(h, 16)))
  return sameBytes(mac, want)
}

export type HookVerdict =
  | { readonly status: 401 | 404 }
  | { readonly status: 200; readonly ping: true }
  | { readonly status: 204 }
  | { readonly status: 202; readonly source: PackageSource; readonly after: string }

/** حكمُ الويب هوك كلُّه — دالّةٌ واحدة يختبرها الاختبارُ ويستدعيها المسار. */
export async function judgeHook(db: Db, encKey: string, sourceId: string, event: string | null, signature: string | null, rawBody: ArrayBuffer): Promise<HookVerdict> {
  if (!/^pkg_[a-f0-9]{1,40}$/.test(sourceId)) return { status: 404 }
  const source = await sourceById(db, sourceId)
  if (source === null) return { status: 404 }
  const secret = await hookSecret(db, encKey, source)
  if (secret === null || !(await verifySignature(secret, rawBody, signature))) return { status: 401 }
  if (event === 'ping') return { status: 200, ping: true }
  if (event !== 'push') return { status: 204 }
  let body: { ref?: unknown; after?: unknown }
  try {
    body = JSON.parse(new TextDecoder().decode(rawBody)) as typeof body
  } catch {
    return { status: 204 }
  }
  if (body.ref !== `refs/heads/${source.branch}` || typeof body.after !== 'string' || !/^[0-9a-f]{40}$/.test(body.after)) return { status: 204 }
  return { status: 202, source, after: body.after }
}

/** سقفُ حِمل الويب هوك بالبايت — دفعُ فرعٍ واحد أصغرُ منه بكثير، وما زاد يُردّ 413 قبل أن يُقرأ. */
export const MAX_HOOK_BYTES = 1_000_000

/** يُردّ الحِملُ قبل قراءته إن أعلن طولًا يتجاوز السقف أو طولًا لا يُفهم. */
export function hookTooLarge(contentLength: string | null): boolean {
  if (contentLength === null) return false
  const n = Number(contentLength)
  return !Number.isFinite(n) || n < 0 || n > MAX_HOOK_BYTES
}

interface DeliveryStore {
  get(key: string): Promise<string | null>
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
}

/** أوّلُ مرّةٍ يُرى فيها هذا التسليم؟ يُحفظ معرّفُه يومًا، فإعادةُ الحِمل الموقَّع نفسِه لا تُطلق رسالةً ثانية. */
export async function firstDelivery(kv: DeliveryStore, sourceId: string, delivery: string | null): Promise<boolean> {
  if (delivery === null || !/^[A-Za-z0-9-]{1,100}$/.test(delivery)) return true
  const key = 'hook:' + sourceId + ':' + delivery
  if ((await kv.get(key)) !== null) return false
  await kv.put(key, '1', { expirationTtl: 86_400 })
  return true
}

/** رمزُ القراءة: المشفّرُ في الصفّ إن وُجد، وإلّا سرُّ Worker — ولا يخرج من هنا إلا إلى ترويسة GitHub. */
export async function tokenFor(s: PackageSource, encKey: string, workerToken: string | undefined): Promise<string | null> {
  if (s.sealedToken !== null) return openScoped(encKey, SCOPE, s.sealedToken, tokenContext(s.id), LEGACY_RAW).catch(() => null)
  // ‏سرُّ Worker للمنظّمة المالك وحدها — منظّمةٌ أخرى لا تقرأ بمفتاح غيرها
  const clean = (workerToken ?? '').trim().replace(/^["'«]+|["'»]+$/g, '').trim()
  // ‏المفتاحُ يُنظَّف من مسافةٍ أو تنصيصٍ لصقهما المالك مع القيمة، فلا يُرسَل إلى GitHub مشوَّهًا
  return s.org === OWNER_ORG && clean !== '' ? clean : null
}

/** هل لهذه المنظّمة رمزُ قراءة؟ المختومُ في صفّها، أو سرُّ Worker إن كانت المالك. */
export function tokenReadyFor(org: string, source: PackageSource | null, workerToken: string | undefined): boolean {
  if (source !== null && source.sealedToken !== null) return true
  return (source?.org ?? org) === OWNER_ORG && (workerToken ?? '') !== ''
}

export interface SyncDeps {
  readonly db: Db
  readonly bucket: StreamBucket
  readonly token: string
  readonly fetchImpl?: typeof fetch
  /** سقفُ البايتات في الدفعة الواحدة. */
  readonly cap?: number
}

export type SyncReport =
  | { readonly kind: 'unchanged' }
  | { readonly kind: 'synced'; readonly commit: string; readonly seen: number; readonly changed: number; readonly stored: number; readonly deferred: number; readonly current: number; readonly problems: number }
  | { readonly kind: 'failed'; readonly reason: string }

interface FileRow {
  path: string; blob_sha: string; size: number; role: FileRole; item_no: string | null; variant: PackageVariant | null
  version: number | null; has_sound: number; r2_key: string | null
}

/**
 * دورةُ مزامنةٍ واحدة. `force` يتخطّى ETag («زامن الآن» والاستكمال)، والويب هوك يمرّر `after` فلا تُعاد قراءةُ ما رأيناه.
 * والعطلُ سببٌ يُكتب في الصفّ ولا يُرمى، ولا رمزَ فيه.
 */
export async function syncPackage(deps: SyncDeps, source: PackageSource, opts: { readonly force?: boolean; readonly after?: string } = {}): Promise<SyncReport> {
  const { db } = deps
  const repo: RepoRef = { owner: source.owner, repo: source.repo, branch: source.branch, token: deps.token }
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ')
  try {
    if (opts.after !== undefined && opts.after === source.lastCommit && source.status === 'ok') return { kind: 'unchanged' }
    const head = await branchHead(repo, opts.force === true ? null : source.lastEtag, deps.fetchImpl)
    if (head.kind === 'unchanged' || (head.sha === source.lastCommit && source.status === 'ok' && opts.force !== true)) {
      await db.prepare('UPDATE package_sources SET last_checked_at = ? WHERE id = ? AND org_id = ?').bind(now, source.id, source.org).run()
      return { kind: 'unchanged' }
    }
    const tree = await listTree(repo, head.treeSha, source.root, MAX_MEDIA_FILES, deps.fetchImpl)
    const { results: prior } = await db.prepare('SELECT path, blob_sha, seen_commit FROM package_files WHERE org_id = ?').bind(source.org).all<{ path: string; blob_sha: string; seen_commit: string }>()
    const known = new Map(prior.map((p) => [p.path, p.blob_sha]))
    const seenAt = new Map(prior.map((p) => [p.path, p.seen_commit]))
    const writes: DbStatement[] = []
    let changed = 0
    for (const f of tree) {
      const c = classifyPath(f.path)
      if (known.get(f.path) === f.sha) {
        // ‏رآه هذا الالتزامُ من قبل (استكمالٌ لدفعةٍ نفسِها): لا كتابة
        if (seenAt.get(f.path) === head.sha) continue
        writes.push(db.prepare('UPDATE package_files SET seen_commit = ? WHERE org_id = ? AND path = ?').bind(head.sha, source.org, f.path))
        continue
      }
      changed += 1
      writes.push(db.prepare(
        `INSERT INTO package_files (org_id, source_id, path, blob_sha, size, role, item_no, variant, version, has_sound, r2_key, seen_commit)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
         ON CONFLICT (org_id, path) DO UPDATE SET blob_sha = excluded.blob_sha, size = excluded.size, role = excluded.role,
           item_no = excluded.item_no, variant = excluded.variant, version = excluded.version, has_sound = excluded.has_sound,
           r2_key = NULL, seen_commit = excluded.seen_commit, source_id = excluded.source_id`,
      ).bind(source.org, source.id, f.path, f.sha, f.size, c.role, c.itemNo, c.variant, c.version, c.hasSound ? 1 : 0, head.sha))
    }
    writes.push(db.prepare('DELETE FROM package_files WHERE org_id = ? AND seen_commit <> ?').bind(source.org, head.sha))
    await inBatches(db, writes)

    const transfer = await transferMedia(deps, source, repo, head.sha)
    const current = await refreshMedia(db, source.org)
    const status = transfer.deferred > 0 || transfer.problems > 0 ? 'partial' : 'ok'
    const reason = transfer.problems > 0 ? `${transfer.problems} ملفًّا لم يُنقل: أكبر من الحدّ أو مؤشّر Git LFS` : null
    await db.prepare(
      `UPDATE package_sources SET last_commit_sha = ?, last_tree_sha = ?, last_etag = ?, last_checked_at = ?, status = ?, error_reason = ?
        WHERE id = ? AND org_id = ?`,
    ).bind(head.sha, head.treeSha, head.etag, now, status, reason, source.id, source.org).run()
    return { kind: 'synced', commit: head.sha, seen: tree.length, changed, stored: transfer.stored, deferred: transfer.deferred, current, problems: transfer.problems }
  } catch (error) {
    let reason = error instanceof GitHubError ? error.message : 'تعذّرت المزامنة'
    // ‏404 وحده لا يقول أيَّهما (D-376): المستودعُ أوّلًا ثمّ الفرع، فيُكتب السببُ الدقيق
    if (error instanceof GitHubError && error.status === 404) {
      const probe = await probeAccess(repo, deps.fetchImpl).catch(() => null)
      if (probe !== null && probe.verdict !== 'ok' && probe.verdict !== 'network') reason = probe.reason
    }
    await db.prepare("UPDATE package_sources SET status = 'failed', error_reason = ?, last_checked_at = ? WHERE id = ? AND org_id = ?")
      .bind(reason, now, source.id, source.org).run().catch(() => undefined)
    return { kind: 'failed', reason }
  }
}

/** ينقل المقاطعَ والأغلفةَ التي لم تُنقل — أصغرَها أوّلًا وبسقف الدفعة. */
async function transferMedia(deps: SyncDeps, source: PackageSource, repo: RepoRef, commit: string): Promise<{ stored: number; deferred: number; problems: number }> {
  const { db } = deps
  const cap = deps.cap ?? SYNC_BYTE_CAP
  const { results } = await db.prepare(
    `SELECT path, blob_sha, size FROM package_files WHERE org_id = ? AND role IN ('media', 'cover') AND r2_key IS NULL ORDER BY size ASC LIMIT ${MAX_MEDIA_FILES}`,
  ).bind(source.org).all<{ path: string; blob_sha: string; size: number }>()
  let used = 0
  let stored = 0
  let deferred = 0
  let problems = 0
  for (const f of results) {
    if (used + f.size > cap) { deferred += 1; continue }
    const kind = mimeOf(f.path).startsWith('video/') ? 'video' : 'image'
    const out = await storeBlob(deps.bucket, source.org, repo, commit, { path: f.path, blobSha: f.blob_sha, size: f.size, kind }, deps.fetchImpl)
    if (out.result === 'too_big' || out.result === 'lfs') { problems += 1; continue }
    if (out.result === 'stored') { used += f.size; stored += 1 }
    await db.prepare('UPDATE package_files SET r2_key = ? WHERE org_id = ? AND path = ? AND blob_sha = ?').bind(out.key, source.org, f.path, f.blob_sha).run()
  }
  return { stored, deferred, problems }
}

/** يعيد حسابَ المعتمد من الفهرس — والقديمُ يبقى صفًّا بما حلّ محلّه. */
export async function refreshMedia(db: Db, org: string): Promise<number> {
  const { results } = await db.prepare(
    `SELECT path, blob_sha, size, role, item_no, variant, version, has_sound, r2_key FROM package_files
      WHERE org_id = ? AND role IN ('media', 'cover') LIMIT ${MAX_MEDIA_FILES}`,
  ).bind(org).all<FileRow>()
  const files: PackageFile[] = results.map((r) => ({
    path: r.path, blobSha: r.blob_sha, size: r.size, role: r.role as 'media' | 'cover', itemNo: r.item_no, variant: r.variant,
    version: r.version ?? 0, hasSound: r.has_sound === 1, r2Key: r.r2_key,
  }))
  const picks = pickMedia(files)
  const current = new Map<string, string>()
  const coverOf = new Map<string, string>()
  const replacedBy = new Map<string, string>()
  for (const p of picks) {
    for (const f of [p.video, p.cover]) if (f !== null) current.set(f.blobSha, f.blobSha)
    if (p.video !== null && p.cover !== null) coverOf.set(p.video.blobSha, p.cover.blobSha)
    for (const s of p.superseded) {
      const winner = s.role === 'media' ? p.video : p.cover
      if (winner !== null) replacedBy.set(s.blobSha, winner.blobSha)
    }
  }
  const writes: DbStatement[] = [db.prepare('UPDATE package_media SET is_current = 0 WHERE org_id = ?').bind(org)]
  for (const f of files) {
    writes.push(db.prepare(
      `INSERT INTO package_media (org_id, blob_sha, item_no, variant, kind, path, mime, bytes, r2_key, version, has_sound, cover_blob_sha, is_current, superseded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (org_id, blob_sha) DO UPDATE SET item_no = excluded.item_no, variant = excluded.variant, path = excluded.path,
         r2_key = coalesce(excluded.r2_key, package_media.r2_key), cover_blob_sha = excluded.cover_blob_sha,
         is_current = excluded.is_current, superseded_by = excluded.superseded_by`,
    ).bind(org, f.blobSha, f.itemNo, f.variant, f.role === 'media' ? 'video' : 'image', f.path, mimeOf(f.path), f.size, f.r2Key,
      f.version, f.hasSound ? 1 : 0, coverOf.get(f.blobSha) ?? null, current.has(f.blobSha) ? 1 : 0, replacedBy.get(f.blobSha) ?? null))
  }
  await inBatches(db, writes)
  return current.size
}

export interface PackageMediaRow {
  readonly blobSha: string
  readonly itemNo: string | null
  readonly variant: PackageVariant | null
  readonly kind: 'video' | 'image'
  readonly path: string
  readonly bytes: number
  readonly r2Key: string | null
  readonly version: number
  readonly hasSound: boolean
  readonly coverBlobSha: string | null
  readonly isCurrent: boolean
  readonly supersededBy: string | null
}

/** وسائطُ الحزمة كلُّها بالمادّة ثمّ اللون — استعلامٌ واحد للشاشة والخطّة. */
export async function readPackageMedia(db: Db, org: string): Promise<PackageMediaRow[]> {
  try {
    const { results } = await db.prepare(
      `SELECT blob_sha, item_no, variant, kind, path, bytes, r2_key, version, has_sound, cover_blob_sha, is_current, superseded_by
         FROM package_media WHERE org_id = ? ORDER BY item_no, variant, is_current DESC, version DESC LIMIT ${MAX_MEDIA_FILES}`,
    ).bind(org).all<{
      blob_sha: string; item_no: string | null; variant: PackageVariant | null; kind: 'video' | 'image'; path: string; bytes: number
      r2_key: string | null; version: number; has_sound: number; cover_blob_sha: string | null; is_current: number; superseded_by: string | null
    }>()
    return results.map((r) => ({
      blobSha: r.blob_sha, itemNo: r.item_no, variant: r.variant, kind: r.kind, path: r.path, bytes: r.bytes, r2Key: r.r2_key,
      version: r.version, hasSound: r.has_sound === 1, coverBlobSha: r.cover_blob_sha, isCurrent: r.is_current === 1, supersededBy: r.superseded_by,
    }))
  } catch {
    return []
  }
}

/** المعتمدُ وحده بصيغة الاختيار — لمطابقة صفوف الخطّة (`packageRefFor`). */
export function currentPicks(rows: readonly PackageMediaRow[]): PackagePick[] {
  const live = rows.filter((r) => r.isCurrent && r.itemNo !== null && r.variant !== null)
  const asFile = (r: PackageMediaRow): PackageFile => ({
    path: r.path, blobSha: r.blobSha, size: r.bytes, role: r.kind === 'video' ? 'media' : 'cover', itemNo: r.itemNo, variant: r.variant,
    version: r.version, hasSound: r.hasSound, r2Key: r.r2Key,
  })
  return pickMedia(live.map(asFile))
}


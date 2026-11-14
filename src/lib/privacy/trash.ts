/**
 * **الحذفُ بالتراجع** (D-322 · نمطُ D-303) — المنشورُ والمصدرُ والمقطعُ والصورةُ المرفوعة: يُحذف الآن، ويعود بـ«تراجَع».
 *
 * كانت السياسةُ العامّة تقول «حتّى يحذفها المشغّل» ولا بابَ في اللوحة يحذف واحدًا منها (D-303 قالها صريحة: «لا حذفَ لهذه
 * الثلاثة أصلًا»). فصار لكلٍّ منها حذف، **والسؤالُ «أتمضي؟» لا يسبقه**: ما يُردّ يُتراجَع عنه في إشعاره (Norman · D-100).
 *
 * ## كيف يُردّ ما حُذف
 *
 * - **الصفوفُ صورةٌ في KV** (`trash:<رمز>`) قبل الحذف، نصف ساعة (`UNDO_SECONDS`)، ورمزُها في زرّ الإشعار وحدَه. **ولا تُكتب
 *   الصفوفُ من النموذج**: «تراجَع» يحمل الرمزَ لا الصفّ، فلا يصنع أحدٌ منشورًا معتمَدًا بحقلٍ مخفيّ (D-009).
 * - **والبايتاتُ في R2 لا تُمحى في الطلب**: تُسجَّل في `purge:<رمز>` وتُمحى في الكنس الليليّ **بعد** نصف الساعة، و**بعد أن
 *   يُسأل عن كلّ مفتاحٍ أله صفٌّ يشير إليه في منظّمته** — فما رُدّ بـ«تراجَع»، أو صورةٌ رُبطت بمنشورٍ آخر، أو مقطعٌ له منشورات،
 *   يبقى ما بقي من يشير إليه، ويُمحى يومَ يُحذف آخرُهم.
 * - **والصورةُ تُكتب قبل الحذف، والحذفُ معاملةٌ واحدة** (`atomically`): إن لم تُكتب الصورةُ لم يُحذف شيء.
 *
 * ## وما لا يُحذف هنا
 *
 * - **منشورٌ مجدول** (`queued`): يُسحب موعدُه أوّلًا — حذفُه قد يسبق دورةَ الإرسال أو يلحقها.
 * - **منشورٌ بلغ منصّتَه** (`published`، أو له محاولةٌ `succeeded` — تغريدةٌ من سلسلةٍ خرجت): **محاولتُه الناجحة هي D-004**،
 *   ومفتاحُ المسوّدة يُشتقّ من بندها، فلو حُذف وكُتب البندُ ثانيةً لخرج مرّتين. يُحذف مع العميل كلِّه (`orgData.ts`) لا وحدَه.
 * - **منشورٌ يُنشر الآن** (محاولةٌ `sent` مفتوحة) أو **صورتُه تُولَّد الآن** (حجزٌ حيّ بلا صفّ): البايتاتُ تُكتب بعد الحذف فتيتم.
 * - **ملفُّ Drive ما زال في المجلّد**: يعود في المسح التالي ويُحلَّل ثانيةً بكلفة. يُحذف من المجلّد أوّلًا.
 * - **مقطعٌ لم يكتمل رفعُه**: له «ألغ» (D-182).
 *
 * فما يُحذف من `publish_attempts` مع منشوره محاولاتٌ فشلت وحدَها، وتعود معه بـ«تراجَع» بترتيب كتابتها (`rowid`).
 */
import { atomically, type Db, type DbStatement } from '../tokens'
import type { SessionStore } from '../session'

export type TrashKind = 'post' | 'source' | 'upload' | 'file'

/** كم يبقى «تراجَع» ممكنًا — والكنسُ لا يمسّ البايتاتِ قبل انقضائه. */
export const UNDO_SECONDS = 30 * 60

/** عمرُ قيد المحو في KV: أطولُ من أيّ تأخّرٍ للكنس، وأقصرُ من أن يبقى أثرًا. */
const PURGE_TTL_SECONDS = 30 * 24 * 60 * 60

/** كم كائنًا يُمحى في الدورة الواحدة — وما بقي في الليلة التالية (حدُّ نداءات الاستدعاء، D-320). */
const PURGE_OBJECTS_PER_RUN = 5000

/** ما نحتاجه من R2 للمحو — والقائمةُ لمحو منظّمةٍ بسابقتها (`orgData.ts`). */
export interface PurgeBucket {
  delete(keys: string | string[]): Promise<void>
  list(options: { prefix: string; cursor?: string; limit?: number }): Promise<{
    readonly objects: readonly { readonly key: string }[]
    readonly truncated: boolean
    readonly cursor?: string
  }>
}

export interface TrashDeps {
  readonly db: Db
  readonly kv: SessionStore
}

type Row = Record<string, unknown>

interface Snapshot {
  readonly v: 1
  readonly kind: TrashKind
  readonly org: string
  readonly ref: string
  readonly label: string
  readonly rows: readonly { readonly table: string; readonly row: Row }[]
  /** ما كان يشير إليه فقُطع بالحذف (`ON DELETE SET NULL`): يُعاد وصلُه مع الصفّ. */
  readonly relink: readonly { readonly table: 'posts' | 'media'; readonly column: 'source_id' | 'upload_id'; readonly ids: readonly string[] }[]
}

interface PurgeEntry {
  readonly v: 1
  readonly org: string
  readonly keys: readonly string[]
  readonly prefixes: readonly string[]
  /** لا يُمحى شيءٌ قبله (ISO). */
  readonly due: string
}

export type TrashResult =
  | { readonly ok: true; readonly token: string; readonly label: string }
  | { readonly ok: false; readonly reason: string }

/** الجداولُ التي تُعاد منها صفوف — **وغيرُها لا يُكتب من صورة**. */
const RESTORABLE = new Set([
  'posts', 'media', 'media_claims', 'metrics', 'promotion_suggestions', 'publish_attempts',
  'sources', 'content_items', 'analysis_claims', 'uploads', 'library_files',
])

const TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

function insert(db: Db, table: string, row: Row): DbStatement {
  if (!RESTORABLE.has(table)) throw new Error('trash_table:' + table)
  const cols = Object.keys(row).filter((c) => /^[a-z][a-z0-9_]*$/.test(c))
  return db
    .prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
    .bind(...cols.map((c) => row[c] ?? null))
}

async function rows(db: Db, sql: string, ...bind: unknown[]): Promise<Row[]> {
  return (await db.prepare(sql).bind(...bind).all<Row>()).results
}

function snippet(text: unknown, max = 40): string {
  const one = String(text ?? '').replace(/\s+/g, ' ').trim()
  return one.length <= max ? one : one.slice(0, max - 1) + '…'
}

/** الصورةُ قبل الحذف، ثمّ الحذفُ معاملةً، ثمّ قيدُ المحو — وصورةٌ لم تُكتب لا حذفَ بعدها. */
async function commit(
  deps: TrashDeps,
  snapshot: Omit<Snapshot, 'v'>,
  deletes: readonly DbStatement[],
  keys: readonly string[],
  now: Date,
): Promise<TrashResult> {
  const token = crypto.randomUUID()
  await deps.kv.put(`trash:${token}`, JSON.stringify({ v: 1, ...snapshot } satisfies Snapshot), { expirationTtl: UNDO_SECONDS })
  await atomically(deps.db, [...deletes])
  const unique = [...new Set(keys.filter((k) => k !== ''))]
  if (unique.length > 0) {
    const entry: PurgeEntry = {
      v: 1, org: snapshot.org, keys: unique, prefixes: [],
      due: new Date(now.getTime() + (UNDO_SECONDS + 60) * 1000).toISOString(),
    }
    // ‏قيدٌ لم يُكتب يُبقي البايتاتِ يتيمةً لا يراها أحد — يُقال في السجلّ، ولا يُعاد الحذفُ عنه
    await deps.kv.put(`purge:${token}`, JSON.stringify(entry), { expirationTtl: PURGE_TTL_SECONDS })
      .catch((error: unknown) => console.warn({ job: 'trash', purge_unqueued: unique.length, error: String(error) }))
  }
  return { ok: true, token, label: snapshot.label }
}

/** منشورٌ ومعه أبناؤه (الصورُ وحجوزُها ومقاييسُه واقتراحُ ترويجه ومحاولاتُ نشره). */
export async function trashPost(deps: TrashDeps, org: string, id: string, now = new Date()): Promise<TrashResult> {
  const { db } = deps
  const post = await db.prepare('SELECT * FROM posts WHERE id = ? AND org_id = ?').bind(id, org).first<Row>()
  if (post === null) return { ok: false, reason: 'لم أجد هذا المنشور في هذا العميل.' }
  if (post['status'] === 'queued') return { ok: false, reason: 'مجدول — اسحب موعده أوّلًا، ثمّ احذفه.' }
  // ‏**وما خرج إلى منصّةٍ لا يُحذف وحدَه** (D-004): محاولتُه الناجحة هي ما يمنع نشرَه مرّتين، وتذهب معه لو حُذف
  const reached = await db
    .prepare("SELECT status FROM publish_attempts WHERE post_id = ? AND org_id = ? AND status IN ('sent', 'succeeded') ORDER BY status = 'sent' DESC LIMIT 1")
    .bind(id, org).first<{ status: string }>()
  if (reached?.status === 'sent') return { ok: false, reason: 'يُنشر الآن أو لم يُعرف جوابُ المنصّة — انتظر نتيجته أو سوِّه من بطاقته.' }
  if (post['status'] === 'published' || reached !== null) {
    return { ok: false, reason: 'نُشر، فيبقى سجلًّا لما خرج باسمك ولا يُنشر مرّتين — ويُحذف مع العميل كلِّه.' }
  }
  const busy = await db
    .prepare(`SELECT 1 AS hit FROM media_claims c WHERE c.post_id = ? AND c.org_id = ? AND c.claimed_at >= datetime('now', '-30 minutes')
                AND NOT EXISTS (SELECT 1 FROM media m WHERE m.idempotency_key = c.idempotency_key AND m.org_id = c.org_id) LIMIT 1`)
    .bind(id, org).first()
  if (busy !== null) return { ok: false, reason: 'صورتُه أو مقطعُه يُولَّد الآن — احذفه بعد دقائق.' }

  const children = ['media', 'media_claims', 'metrics', 'promotion_suggestions', 'publish_attempts'] as const
  const kids: { table: string; row: Row }[] = []
  for (const table of children) {
    for (const row of await rows(db, `SELECT * FROM ${table} WHERE post_id = ? AND org_id = ? ORDER BY rowid`, id, org)) kids.push({ table, row })
  }
  const keys = kids.filter((k) => k.table === 'media').map((k) => String(k.row['r2_key'] ?? ''))
  return commit(deps, {
    kind: 'post', org, ref: id, label: snippet(post['text']),
    rows: [{ table: 'posts', row: post }, ...kids], relink: [],
  }, [
    ...children.map((t) => db.prepare(`DELETE FROM ${t} WHERE post_id = ? AND org_id = ?`).bind(id, org)),
    db.prepare('DELETE FROM posts WHERE id = ? AND org_id = ?').bind(id, org),
  ], keys, now)
}

/** هامشُ المسح: ملفٌّ رآه آخرُ مسحٍ مُسَّ تاريخُه في دقائقه، وما قبله غاب عن المجلّد. */
const SCAN_MARGIN_MS = 15 * 60 * 1000

const utc = (s: unknown): number => (typeof s === 'string' ? Date.parse(s.replace(' ', 'T') + (s.endsWith('Z') ? '' : 'Z')) : NaN)

/**
 * متى رأى صدى مجلّدَ Drive آخرَ مرّة — دورةُ الفجر (نبضُها) أو «مسح Drive الآن» (سطرُه في السجلّ)، أيُّهما أحدث.
 * و`null` إن لم يُمسح بعد.
 */
async function lastScan(db: Db, org: string): Promise<number | null> {
  const [beat, manual] = await Promise.all([
    db.prepare("SELECT at FROM heartbeats WHERE job = 'scan' AND outcome = 'ok'").first<{ at: string }>().catch(() => null),
    db.prepare("SELECT MAX(at) AS at FROM audit_log WHERE org_id = ? AND action = 'drive.scan'").bind(org).first<{ at: string | null }>()
      .catch(() => null),
  ])
  const times = [utc(beat?.at), utc(manual?.at)].filter((t) => Number.isFinite(t))
  return times.length === 0 ? null : Math.max(...times)
}

/** مصدرٌ ومعه خلاصتُه وحجزُ تحليله؛ والمنشوراتُ التي كُتبت منه تبقى بنصّها وتُقطع إشارتُها إليه. */
export async function trashSource(deps: TrashDeps, org: string, id: string, now = new Date()): Promise<TrashResult> {
  const { db } = deps
  const source = await db.prepare('SELECT * FROM sources WHERE id = ? AND org_id = ?').bind(id, org).first<Row>()
  if (source === null) return { ok: false, reason: 'لم أجد هذا المصدر في هذا العميل.' }
  if ((source['kind'] ?? 'drive') === 'drive') {
    const scanned = await lastScan(db, org)
    const seen = utc(source['last_seen_at'])
    if (scanned === null || !Number.isFinite(seen) || seen >= scanned - SCAN_MARGIN_MS) {
      return { ok: false, reason: 'ما زال في مجلّد Drive: احذفه من المجلّد، ثمّ «مسح Drive الآن»، ثمّ احذفه هنا — وإلّا عاد في المسح التالي وحُلّل بكلفة.' }
    }
  }
  const claim = await db
    .prepare("SELECT 1 AS hit FROM analysis_claims WHERE source_id = ? AND org_id = ? AND claimed_at >= datetime('now', '-10 minutes')")
    .bind(id, org).first()
  if (claim !== null) return { ok: false, reason: 'يُحلَّل الآن — احذفه بعد دقائق.' }

  const kids: { table: string; row: Row }[] = []
  for (const table of ['content_items', 'analysis_claims'] as const) {
    for (const row of await rows(db, `SELECT * FROM ${table} WHERE source_id = ? AND org_id = ? ORDER BY rowid`, id, org)) kids.push({ table, row })
  }
  const linked = (await rows(db, 'SELECT id FROM posts WHERE source_id = ? AND org_id = ?', id, org)).map((r) => String(r['id']))
  return commit(deps, {
    kind: 'source', org, ref: id, label: snippet(source['name']),
    rows: [{ table: 'sources', row: source }, ...kids],
    relink: linked.length === 0 ? [] : [{ table: 'posts', column: 'source_id', ids: linked }],
  }, [
    db.prepare('DELETE FROM content_items WHERE source_id = ? AND org_id = ?').bind(id, org),
    db.prepare('DELETE FROM analysis_claims WHERE source_id = ? AND org_id = ?').bind(id, org),
    db.prepare('UPDATE posts SET source_id = NULL WHERE source_id = ? AND org_id = ?').bind(id, org),
    db.prepare('DELETE FROM sources WHERE id = ? AND org_id = ?').bind(id, org),
  ], [String(source['file_key'] ?? ''), String(source['text_key'] ?? '')], now)
}

/** مقطعٌ مرفوع — ومنشوراتُه باقيةٌ بصورتها (صفوفُ `media` تحمل مفتاحَه)، فبايتاتُه تبقى ما بقيت. */
export async function trashUpload(deps: TrashDeps, org: string, id: string, now = new Date()): Promise<TrashResult> {
  const { db } = deps
  const upload = await db.prepare('SELECT * FROM uploads WHERE id = ? AND org_id = ?').bind(id, org).first<Row>()
  if (upload === null) return { ok: false, reason: 'لم أجد هذا المقطع في هذا العميل.' }
  if (upload['status'] === 'uploading') return { ok: false, reason: 'لم يكتمل رفعُه — ألغِه بزرّ «ألغ».' }
  const linked = (await rows(db, 'SELECT id FROM media WHERE upload_id = ? AND org_id = ?', id, org)).map((r) => String(r['id']))
  return commit(deps, {
    kind: 'upload', org, ref: id, label: snippet(upload['name']),
    rows: [{ table: 'uploads', row: upload }],
    relink: linked.length === 0 ? [] : [{ table: 'media', column: 'upload_id', ids: linked }],
  }, [
    db.prepare('UPDATE media SET upload_id = NULL WHERE upload_id = ? AND org_id = ?').bind(id, org),
    db.prepare('DELETE FROM uploads WHERE id = ? AND org_id = ?').bind(id, org),
  ], [String(upload['r2_key'] ?? '')], now)
}

/** صورةٌ رُفعت إلى الأصول (D-260). وما رُبط منها بمنشورٍ يبقى معه (صفُّه في `media` يحمل المفتاح). */
export async function trashLibraryFile(deps: TrashDeps, org: string, id: string, now = new Date()): Promise<TrashResult> {
  const { db } = deps
  const file = await db.prepare('SELECT * FROM library_files WHERE id = ? AND org_id = ?').bind(id, org).first<Row>()
  if (file === null) return { ok: false, reason: 'لم أجد هذه الصورة في هذا العميل.' }
  return commit(deps, {
    kind: 'file', org, ref: id, label: snippet(file['name']), rows: [{ table: 'library_files', row: file }], relink: [],
  }, [db.prepare('DELETE FROM library_files WHERE id = ? AND org_id = ?').bind(id, org)], [String(file['r2_key'] ?? '')], now)
}

export type RestoreResult =
  | { readonly ok: true; readonly kind: TrashKind; readonly ref: string; readonly label: string }
  | { readonly ok: false; readonly reason: string; readonly kind?: TrashKind }

/** نوعُ ما يُتراجَع عنه — ليسأل الحارسُ عن دوره قبل أن يُعاد شيء. */
export async function trashKindOf(kv: SessionStore, token: string): Promise<TrashKind | null> {
  if (!TOKEN.test(token)) return null
  const raw = await kv.get(`trash:${token}`)
  if (raw === null) return null
  try {
    return (JSON.parse(raw) as Snapshot).kind
  } catch {
    return null
  }
}

/**
 * «تراجَع» — يعيد الصفوفَ كما كانت ويصل ما قُطع، **معاملةً واحدة**، ثمّ يمحو الصورةَ وقيدَ المحو.
 *
 * **والحارسُ في القاعدة لا في الزرّ** (D-100): صفٌّ أُعيد إنشاؤه بالمعرّف نفسِه، أو حسابٌ حُذف منذ الحذف، يُسقط المعاملةَ
 * كلَّها فلا يعود نصفُ منشور. وصورةٌ لعميلٍ غير عميل الجلسة لا تُعاد هنا.
 */
export async function restoreTrash(deps: TrashDeps, org: string, token: string): Promise<RestoreResult> {
  if (!TOKEN.test(token)) return { ok: false, reason: 'لم أجد ما يُتراجَع عنه.' }
  const raw = await deps.kv.get(`trash:${token}`)
  if (raw === null) return { ok: false, reason: 'انقضت مهلةُ التراجع — ما حُذف لا يعود.' }
  let snap: Snapshot
  try {
    snap = JSON.parse(raw) as Snapshot
  } catch {
    return { ok: false, reason: 'لم أجد ما يُتراجَع عنه.' }
  }
  if (snap.v !== 1 || snap.org !== org) return { ok: false, reason: 'هذا الحذفُ في عميلٍ آخر — انتقل إليه ثمّ تراجَع.', kind: snap.kind }
  const { db } = deps
  const statements: DbStatement[] = snap.rows.map((r) => insert(db, r.table, r.row))
  for (const link of snap.relink) {
    for (let i = 0; i < link.ids.length; i += 90) {
      const ids = link.ids.slice(i, i + 90)
      statements.push(db
        .prepare(`UPDATE ${link.table} SET ${link.column} = ? WHERE org_id = ? AND ${link.column} IS NULL AND id IN (${ids.map(() => '?').join(', ')})`)
        .bind(snap.ref, org, ...ids))
    }
  }
  try {
    await atomically(db, statements)
  } catch (error) {
    console.warn({ job: 'trash', restore_failed: snap.kind, error: String(error).slice(0, 200) })
    return { ok: false, reason: 'تعذّر التراجع: تبدّل ما حوله منذ الحذف (أُعيد إنشاؤه أو حُذف ما يتبعه).', kind: snap.kind }
  }
  await deps.kv.delete(`trash:${token}`)
  await deps.kv.delete(`purge:${token}`).catch(() => undefined)
  return { ok: true, kind: snap.kind, ref: snap.ref, label: snap.label }
}

/** يقيّد محوَ ما تحت سوابق منظّمةٍ حُذفت كلُّها (`orgData.ts`) — بلا انتظار: لا «تراجَع» لحذف منظّمة. */
export async function queuePrefixes(kv: SessionStore, org: string, prefixes: readonly string[], now = new Date()): Promise<void> {
  const entry: PurgeEntry = { v: 1, org, keys: [], prefixes, due: now.toISOString() }
  await kv.put(`purge:${crypto.randomUUID()}`, JSON.stringify(entry), { expirationTtl: PURGE_TTL_SECONDS })
}

/** أيشير صفٌّ في المنظّمة إلى هذا الكائن؟ — صورةُ منشور، أو مقطع، أو صورةُ أصول، أو أصلُ مصدرٍ ونصُّه. */
async function referenced(db: Db, org: string, key: string): Promise<boolean> {
  const hit = await db
    .prepare(`SELECT 1 AS hit FROM media WHERE org_id = ?1 AND r2_key = ?2
              UNION ALL SELECT 1 FROM uploads WHERE org_id = ?1 AND r2_key = ?2
              UNION ALL SELECT 1 FROM library_files WHERE org_id = ?1 AND r2_key = ?2
              UNION ALL SELECT 1 FROM sources WHERE org_id = ?1 AND (file_key = ?2 OR text_key = ?2)
              LIMIT 1`)
    .bind(org, key)
    .first()
  return hit !== null
}

export interface PurgeReport {
  /** قيودٌ فرغت فمُحيت. */
  readonly done: number
  /** كائناتٌ مُحيت من R2. */
  readonly objects: number
  /** مفاتيحُ تُركت لأنّ صفًّا ما زال يشير إليها. */
  readonly kept: number
}

/**
 * **محوُ البايتات في الكنس الليليّ** — ما حلّ موعدُه من قيود `purge:`. وكلُّ مفتاحٍ يُسأل عنه قبل محوه؛ وما زال مشارًا إليه
 * يُترك (يُمحى يومَ يُحذف من يشير إليه، فيُقيَّد ثانيةً). والسوابقُ (منظّمةٌ حُذفت) تُمحى صفحاتٍ بحدٍّ، والباقي غدًا.
 */
export async function purgeDeleted(deps: TrashDeps & { readonly bucket: PurgeBucket }, now = new Date()): Promise<PurgeReport> {
  const { db, kv, bucket } = deps
  if (kv.list === undefined) return { done: 0, objects: 0, kept: 0 }
  let done = 0, objects = 0, kept = 0
  let cursor: string | null = null
  do {
    const page = await kv.list({ prefix: 'purge:', cursor })
    for (const { name } of page.keys) {
      if (objects >= PURGE_OBJECTS_PER_RUN) return { done, objects, kept }
      const raw = await kv.get(name)
      if (raw === null) continue
      let entry: PurgeEntry
      try {
        entry = JSON.parse(raw) as PurgeEntry
      } catch {
        await kv.delete(name)
        continue
      }
      if (Date.parse(entry.due) > now.getTime()) continue
      const gone: string[] = []
      for (const key of entry.keys) {
        if (await referenced(db, entry.org, key)) kept += 1
        else gone.push(key)
      }
      for (let i = 0; i < gone.length; i += 1000) await bucket.delete(gone.slice(i, i + 1000))
      objects += gone.length
      let complete = true
      for (const prefix of entry.prefixes) {
        let next: string | undefined
        do {
          const listed = await bucket.list({ prefix, limit: 1000, ...(next === undefined ? {} : { cursor: next }) })
          const names = listed.objects.map((o) => o.key)
          if (names.length > 0) await bucket.delete(names)
          objects += names.length
          next = listed.truncated ? listed.cursor : undefined
        } while (next !== undefined && objects < PURGE_OBJECTS_PER_RUN)
        if (next !== undefined) complete = false
      }
      if (complete) {
        await kv.delete(name)
        done += 1
      } else {
        // ‏ما بقي من السوابق غدًا — والمفاتيحُ المحدَّدة قد مُحيت فلا تُعاد
        await kv.put(name, JSON.stringify({ ...entry, keys: [] } satisfies PurgeEntry), { expirationTtl: PURGE_TTL_SECONDS })
      }
    }
    cursor = page.list_complete === false ? (page.cursor ?? null) : null
  } while (cursor !== null)
  return { done, objects, kept }
}

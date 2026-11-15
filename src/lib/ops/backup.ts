/**
 * ‏**النسخةُ الاحتياطيّةُ الأسبوعيّة** (D-321) — كلُّ جداول D1 إلى دلوِ R2 خاصّ، مشفّرةً، وآخرُ ثمانٍ تبقى.
 *
 * ## ما كان
 *
 * ‏القاعدةُ التي تحمل حساباتِ المالك الحقيقيّة (D-271) لا نسخةَ لها خارجها. Time Travel يعيدها إلى دقيقةٍ في ثلاثين يومًا
 * ‏**في مكانها** — لا ينسخها، ولا يفتحها في قاعدةٍ أخرى، ولا يبقى بعد الثلاثين — ووعدُ الخارطة («نسخةٌ دوريّةٌ من D1»،
 * ‏ROADMAP-3 §المخاطر) لم يُبنَ. فبيانُ «يُسترجَع» لم يُجرَّب مرّةً.
 *
 * ## ما صار
 *
 * - **دورةُ 03:03 اليوميّة تسأل كلَّ يوم: أمضى أسبوعٌ على آخر نسخةٍ نجحت؟** فإن مضى أخذت واحدة. لا جدولَ خامسٌ في
 *   `wrangler.toml`، والنسخةُ التي تسقط تُعاد في الغد لا بعد أسبوع.
 * - **قراءةٌ واحدةٌ في معاملةٍ واحدة**: `db.batch()` بجملةٍ لكلّ جدول — D1 يجري الدفعةَ في معاملة، فالجداولُ كلُّها من لحظةٍ واحدة
 *   ولا يُنسَخ ابنٌ بلا أبيه، والدفعةُ استعلامٌ واحدٌ في حدّ الاستدعاء (وثائقُ D1 · Limits).
 * - **والصيغةُ في `snapshot.ts`**، يقرؤها تمرينُ الاسترجاع نفسُه. والمفتاحُ مشتقٌّ (`backup-v1`)، والأعمدةُ المشفَّرةُ تُنسَخ كما هي.
 * - **والدلوُ خاصٌّ أو لا نسخة**: `BACKUP` ربطٌ اختياريّ، وبدونه لا يُكتب شيءٌ في دلو الوسائط (`MEDIA`): ذاك يُقرأ من نوافذَ
 *   موقَّعة، ولا يُعرَف من هنا أهو مغلقٌ للعامّة في لوحة Cloudflare. فالنبضُ يقول «لا دلو خاصّ مربوط بعد» (M-51).
 * - **وكلُّ محاولةٍ صفٌّ في `backups`** (0052): «صحّة صدى» تقرأ آخرَه.
 *
 * ## حدودُه
 *
 * ‏النسخةُ تُبنى في ذاكرة الاستدعاء (‏128MB)، فتُردّ فوق ‏100,000 صفّ بسببٍ مسمّى ويقول RUNBOOK البديل (`wrangler d1 export`).
 * ‏واليومَ القاعدةُ أصغرُ من ذلك بمراتب.
 */
import type { Db, DbStatement } from '../tokens'
import { encodeCell, encodeSnapshot, type SnapshotPayload } from './snapshot'

export const SNAPSHOT_PREFIX = 'snapshots/'
export const KEEP_SNAPSHOTS = 8
export const SNAPSHOT_EVERY_SECONDS = 7 * 24 * 60 * 60
/** ‏الدورةُ اليوميّةُ تقع بعد دقائقَ أو قبلها، وساعةٌ من السعة تُبقي الإيقاعَ أسبوعيًّا لا ثمانيةَ أيّام. */
const DUE_SLACK_SECONDS = 60 * 60
export const MAX_SNAPSHOT_ROWS = 100_000

/** ‏ما يلزم من R2 — والربطُ الحقيقيُّ (`R2Bucket`) يطابقه. */
export interface BackupBucket {
  put(
    key: string,
    value: Uint8Array,
    options?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> },
  ): Promise<unknown>
  list(options?: { prefix?: string; cursor?: string }): Promise<{
    readonly objects: readonly { readonly key: string }[]
    readonly truncated: boolean
    readonly cursor?: string
  }>
  delete(keys: string | string[]): Promise<void>
}

export interface BackupRow {
  readonly id: string
  readonly at: string
  readonly status: 'ok' | 'failed'
  readonly objectKey: string | null
  readonly tables: number
  readonly rows: number
  readonly bytes: number
  readonly kid: string | null
  readonly ms: number
  readonly pruned: number
  readonly detail: string | null
}

export type SnapshotOutcome =
  | { readonly ok: true; readonly key: string; readonly tables: number; readonly rows: number; readonly bytes: number; readonly ms: number; readonly pruned: number }
  | { readonly ok: false; readonly detail: string }

const quote = (name: string): string => `"${name.replace(/"/g, '""')}"`

/** ‏جداولُ القاعدة كلُّها إلّا ما لـ SQLite وD1 أنفسِهما: `sqlite_*` و`_cf_*` و`d1_migrations` (يُعاد بناؤه بالترحيل). */
export async function tablesOf(db: Db): Promise<string[]> {
  const { results } = await db
    .prepare(
      `SELECT name FROM sqlite_master
        WHERE type = 'table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\'
          AND name <> 'd1_migrations'
        ORDER BY name`,
    )
    .all<{ name: string }>()
  return results.map((r) => r.name)
}

/** ‏أسماءُ الترحيلات المطبَّقة بترتيبها — و`null` حيث لا `d1_migrations` (قاعدةُ الاختبار تُرحَّل بلا wrangler). */
export async function appliedMigrations(db: Db): Promise<string[] | null> {
  try {
    const { results } = await db.prepare('SELECT name FROM d1_migrations ORDER BY id').all<{ name: string }>()
    return results.map((r) => r.name)
  } catch {
    return null
  }
}

/** ‏نتائجُ دفعةٍ من D1: مصفوفةُ `D1Result` بـ`results` لكلّ جملة. وبلا `batch` تُقرأ جملةً جملة. */
async function readMany(db: Db, statements: DbStatement[]): Promise<Record<string, unknown>[][]> {
  if (db.batch === undefined) {
    const out: Record<string, unknown>[][] = []
    for (const s of statements) out.push((await s.all<Record<string, unknown>>()).results)
    return out
  }
  const results = (await db.batch(statements)) as readonly { readonly results?: Record<string, unknown>[] }[]
  return results.map((r) => r.results ?? [])
}

/** يقرأ الجداولَ كلَّها في معاملةٍ واحدة، ويردّ ما فوق السقف قبل أن يُحمَّل. */
export async function readTables(db: Db, tables: readonly string[]): Promise<SnapshotPayload> {
  const counts = await readMany(db, tables.map((t) => db.prepare(`SELECT count(*) AS n FROM ${quote(t)}`)))
  const total = counts.reduce((n, r) => n + Number(r[0]?.n ?? 0), 0)
  if (total > MAX_SNAPSHOT_ROWS) {
    throw new Error(`القاعدةُ ${total} صفًّا، فوق ${MAX_SNAPSHOT_ROWS} تُنسَخ في استدعاء — RUNBOOK: wrangler d1 export`)
  }
  const data = await readMany(db, tables.map((t) => db.prepare(`SELECT * FROM ${quote(t)}`)))
  const out: Record<string, { columns: string[]; rows: unknown[][] }> = {}
  tables.forEach((t, i) => {
    const rows = data[i] ?? []
    const columns = rows[0] === undefined ? [] : Object.keys(rows[0])
    out[t] = { columns, rows: rows.map((r) => columns.map((c) => encodeCell(r[c]))) }
  })
  return { tables: out }
}

/**
 * ‏أمضى أسبوعٌ (إلّا ساعة) على آخر نسخةٍ نجحت؟ — وما لا نسخةَ له مستحقّ. **ومفتاحٌ دُوّر بعدها** (`kid` غيرُ `kid` آخر نسخة، مراجعة
 * ‏D-321) يجعلها مستحقّةً في الفجر التالي: النسخُ السابقةُ كلُّها بالمفتاح القديم، فلا تمضي أسبوعًا بلا نسخةٍ يفتحها الجديد.
 */
export async function snapshotDue(db: Db, now: Date, kid?: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT at, kid FROM backups WHERE status = 'ok' ORDER BY at DESC, rowid DESC LIMIT 1")
    .first<{ at: string | null; kid: string | null }>()
  if (row?.at == null) return true
  if (kid !== undefined && row.kid !== kid) return true
  const last = Date.parse(`${row.at.replace(' ', 'T')}Z`)
  if (Number.isNaN(last)) return true
  return now.getTime() - last >= (SNAPSHOT_EVERY_SECONDS - DUE_SLACK_SECONDS) * 1000
}

/** ‏يُبقي آخرَ `KEEP_SNAPSHOTS` نسخةً ويحذف ما قبلها — ولا يمسّ في الدلو غيرَ `snapshots/*.sada`. */
export async function pruneSnapshots(bucket: BackupBucket, keep = KEEP_SNAPSHOTS): Promise<number> {
  const keys: string[] = []
  let cursor: string | undefined
  do {
    const page = await bucket.list(cursor === undefined ? { prefix: SNAPSHOT_PREFIX } : { prefix: SNAPSHOT_PREFIX, cursor })
    for (const o of page.objects) if (/^snapshots\/[^/]+\.sada$/.test(o.key)) keys.push(o.key)
    cursor = page.truncated ? page.cursor : undefined
  } while (cursor !== undefined)
  keys.sort()
  const old = keys.slice(0, Math.max(0, keys.length - keep))
  if (old.length > 0) await bucket.delete(old)
  return old.length
}

/** ‏سببُ العطل بلا عنوانٍ ولا سرّ — كما يُكتب عطلُ القناة (D-110). */
function reason(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).replace(/https?:\/\/\S+/gi, '«عنوان مُزال»').slice(0, 200)
}

async function record(db: Db, row: BackupRow): Promise<void> {
  await db
    .prepare(
      `INSERT INTO backups (id, at, status, object_key, table_count, row_count, byte_count, kid, ms, pruned, detail)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    // ‏الوقتُ بصيغة القاعدة (`datetime('now')`) لا ISO: «صحّة صدى» و`snapshotDue` يقرآنه كما يُقرأ كلُّ وقتٍ فيها
    .bind(row.id, row.at.slice(0, 19).replace('T', ' '), row.status, row.objectKey, row.tables, row.rows, row.bytes, row.kid, row.ms, row.pruned, row.detail)
    .run()
}

/**
 * ‏يأخذ نسخةً ويكتبها ويُبقي آخرَ ثمانٍ ويسجّلها. **ولا يرمي**: ما سقط يُسجَّل `failed` بسببه ويعود، والدورةُ تنبض به.
 * ‏والحذفُ بعد الكتابة لا قبلها: نسخةٌ جديدةٌ لم تُكتب لا تُذهب بقديمة.
 */
export async function takeSnapshot(deps: {
  readonly db: Db
  readonly bucket: BackupBucket
  readonly encKey: string
  readonly env: string
  readonly now: Date
}): Promise<SnapshotOutcome> {
  const started = Date.now()
  const id = crypto.randomUUID()
  try {
    const tables = await tablesOf(deps.db)
    const migrations = await appliedMigrations(deps.db)
    const payload = await readTables(deps.db, tables)
    const at = deps.now.toISOString()
    const { bytes, header } = await encodeSnapshot(deps.encKey, { at, env: deps.env, migrations }, payload)
    const key = `${SNAPSHOT_PREFIX}${at.replace(/[:.]/g, '-')}-${header.kid}.sada`
    await deps.bucket.put(key, bytes, {
      httpMetadata: { contentType: 'application/octet-stream' },
      customMetadata: { kid: header.kid, tables: String(header.tables.length), rows: String(header.rows) },
    })
    const pruned = await pruneSnapshots(deps.bucket).catch((error: unknown) => {
      console.error({ job: 'backup', prune_failed: reason(error) })
      return 0
    })
    const ms = Date.now() - started
    await record(deps.db, {
      id, at, status: 'ok', objectKey: key, tables: header.tables.length, rows: header.rows, bytes: bytes.byteLength,
      kid: header.kid, ms, pruned, detail: null,
    })
    return { ok: true, key, tables: header.tables.length, rows: header.rows, bytes: bytes.byteLength, ms, pruned }
  } catch (error) {
    const detail = reason(error)
    await record(deps.db, {
      id, at: deps.now.toISOString(), status: 'failed', objectKey: null, tables: 0, rows: 0, bytes: 0, kid: null,
      ms: Date.now() - started, pruned: 0, detail,
    }).catch(() => undefined)
    return { ok: false, detail }
  }
}

const BACKUP_FIELDS = `'id', id, 'at', at, 'status', status, 'object_key', object_key, 'table_count', table_count,
      'row_count', row_count, 'byte_count', byte_count, 'kid', kid, 'ms', ms, 'pruned', pruned, 'detail', detail`

/**
 * ‏آخرُ محاولةٍ وآخرُ نسخةٍ نجحت، عمودين في `SELECT` واحد — تقرؤهما `latestBackups`، و«صحّة صدى» في جملة مؤشّراتها
 * ‏(`ops/health.ts`). **والناجحةُ في عمودها**، لا من بين آخر عشرين (مراجعة D-321): الساقطةُ تُعاد كلَّ يوم، فبعد عشرين يومًا من
 * ‏السقوط كانت آخرُ نسخةٍ قائمةٍ تُقرأ «لا نسخة بعد» ويختفي معها تحذيرُ التقادُم.
 */
export const BACKUP_COLUMNS = `(SELECT json_object(${BACKUP_FIELDS})
      FROM backups ORDER BY at DESC, rowid DESC LIMIT 1) AS backup_last,
    (SELECT json_object(${BACKUP_FIELDS})
      FROM backups WHERE status = 'ok' ORDER BY at DESC, rowid DESC LIMIT 1) AS backup_ok`

/** ‏آخرُ محاولةٍ وآخرُ نسخةٍ نجحت من عمودَي `BACKUP_COLUMNS`. */
export function backupsOf(lastJson: unknown, okJson: unknown): { readonly last: BackupRow | null; readonly lastOk: BackupRow | null } {
  return { last: backupRow(lastJson), lastOk: backupRow(okJson) }
}

function backupRow(json: unknown): BackupRow | null {
  let r: Record<string, unknown> | null = null
  try { r = typeof json === 'string' ? (JSON.parse(json) as Record<string, unknown>) : null } catch { r = null }
  if (r === null || typeof r !== 'object') return null
  const n = (v: unknown): number => (typeof v === 'number' ? v : 0)
  const t = (v: unknown): string | null => (typeof v === 'string' ? v : null)
  return {
    id: String(r.id), at: String(r.at), status: r.status === 'ok' ? 'ok' : 'failed', objectKey: t(r.object_key),
    tables: n(r.table_count), rows: n(r.row_count), bytes: n(r.byte_count), kid: t(r.kid), ms: n(r.ms), pruned: n(r.pruned), detail: t(r.detail),
  }
}

/** ‏آخرُ محاولةٍ وآخرُ نسخةٍ نجحت. */
export async function latestBackups(db: Db): Promise<{ readonly last: BackupRow | null; readonly lastOk: BackupRow | null }> {
  const row = await db.prepare(`SELECT ${BACKUP_COLUMNS}`).first<{ backup_last: unknown; backup_ok: unknown }>()
  return backupsOf(row?.backup_last, row?.backup_ok)
}

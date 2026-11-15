/**
 * وسائطُ المالك من Drive (D-363) — **صورُه ومقاطعُه في مجلّد «04-media» تدخل المكتبة، وتختارها الخطّةُ لكلّ مادّة**.
 *
 * قال المالك: «أبني الصور والفيديوهات بنفسي، وأريد المحرّك أن يستعملها في الخطّة باحتراف». وملفُّ خطّته يقول لكلّ صفٍّ
 * «رقم المادة» (01، 02…) و«الملف» («04-media/01-…/ (داكن أو فاتح بالتناوب)»). فهنا ثلاثة أشياء، **ولا نداءَ مدفوعًا في أيٍّ منها**:
 *
 * ١. السرد: المجلّدُ تحت مجلّد المصادر بالاسم، ومجلّداتُه الفرعيّةُ كلُّها، والصورُ والمقاطعُ وحدها.
 * ٢. التوفيق مع `drive_media`: الوسومُ من المسار (رقمُ المادّة من أرقام أوّل المجلّد، والداكنُ أو الفاتح من الاسم، والنوع)، وما غاب يُعلَّم.
 * ٣. التنزيل إلى R2 بسقفٍ لكلّ مزامنة، وبحدود الرفع نفسِها — فما يُربط بمنشورٍ بايتاتُه عندنا ساعةَ النشر.
 *
 * والمطابقةُ (`matchMedia`) نقيّة: تأخذ صفوفَ الخطّة والمكتبةَ وتعيد لكلّ صفٍّ وسيطتَه أو «تنقصه وسيطة».
 */
import { inBatches, type Db, type DbStatement } from '../tokens'
import { MAX_UPLOAD_BYTES } from '../media/uploads'
import { withTimeout } from '../net/timeout'
import { accessToken, DriveError, parseServiceAccount } from './client'

/** اسمُ المجلّد حين لا يختار المالك غيره — كما في ملفّ خطّته. */
export const DEFAULT_MEDIA_FOLDER = '04-media'

/** أكبرُ صورةٍ تُنزَّل — فوقها صورةٌ لا تقبلها منصّةٌ أصلًا. والمقطعُ بحدّ الرفع نفسِه (`MAX_UPLOAD_BYTES`). */
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024

/** ما يُنزَّل في المزامنة الواحدة — والباقي في التالية، فلا تطول دورةُ Cron ولا يمتلئ R2 دفعةً. */
export const SYNC_BYTE_CAP = 200 * 1024 * 1024

/** أكثرُ ما يُسرد — مجلّدُ وسائطٍ أوسع من هذا ليس مجلّدَ خطّة. */
export const MAX_MEDIA_FILES = 1000

const FILES_URL = 'https://www.googleapis.com/drive/v3/files'
const FOLDER_MIME = 'application/vnd.google-apps.folder'

export type MediaKind = 'image' | 'video'
export type MediaVariant = 'dark' | 'light'

export interface DriveMediaFile {
  readonly id: string
  readonly name: string
  readonly mimeType: string
  readonly md5: string
  readonly bytes: number
  /** المسارُ تحت مجلّد الوسائط بلا اسم الملفّ («01-افتتاح/داكن») — وفارغٌ لما في جذره. */
  readonly path: string
}

export interface MediaTags {
  readonly kind: MediaKind
  readonly itemNo: string | null
  readonly variant: MediaVariant | null
}

export interface LibraryMedia {
  readonly id: string
  readonly name: string
  readonly mime: string
  readonly kind: MediaKind
  readonly bytes: number
  readonly path: string
  readonly itemNo: string | null
  readonly variant: MediaVariant | null
  readonly r2Key: string | null
}

/** الأرقامُ العربيّةُ لاتينيّة — «٠١» و«01» مادّةٌ واحدة. */
function latinDigits(s: string): string {
  return s
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0))
}

/** رقمُ المادّة بصيغةٍ واحدة: «1» و«01» و«٠١» كلُّها «01». */
export function itemNumber(raw: string): string | null {
  const m = /^\s*(\d{1,4})/.exec(latinDigits(raw))
  return m === null ? null : String(Number(m[1])).padStart(2, '0')
}

/** الداكنُ أو الفاتح من نصٍّ — و`null` إن ذكرهما معًا أو لم يذكر أيًّا. */
export function variantOf(text: string): MediaVariant | null {
  const s = text.toLowerCase()
  const dark = /داكن|غامق|dark/.test(s)
  const light = /فاتح|light/.test(s)
  if (dark === light) return null
  return dark ? 'dark' : 'light'
}

/**
 * وسومُ الملفّ من مساره (D-363): **رقمُ المادّة من أوّل مجلّدٍ يبدأ بأرقام** («01-افتتاح» ← 01)، وإلّا من اسم الملفّ نفسِه؛
 * والداكنُ أو الفاتح من المسار والاسم؛ والنوعُ من `mime`. وما ليس صورةً ولا مقطعًا `null`: لا يدخل المكتبة.
 */
export function mediaTags(path: string, name: string, mime: string): MediaTags | null {
  const kind: MediaKind | null = mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : null
  if (kind === null) return null
  const parts = path.split('/').filter((p) => p !== '')
  let itemNo: string | null = null
  for (const p of parts) {
    itemNo = itemNumber(p)
    if (itemNo !== null) break
  }
  if (itemNo === null) itemNo = itemNumber(name)
  return { kind, itemNo, variant: variantOf(`${parts.join(' ')} ${name}`) }
}

interface RawEntry {
  id?: unknown
  name?: unknown
  mimeType?: unknown
  md5Checksum?: unknown
  size?: unknown
}

async function listChildren(token: string, folderId: string, call: typeof fetch): Promise<RawEntry[]> {
  const out: RawEntry[] = []
  let pageToken: string | undefined
  for (let page = 0; page < 20; page += 1) {
    const url = new URL(FILES_URL)
    url.searchParams.set('q', `'${folderId.replace(/'/g, '')}' in parents and trashed = false`)
    url.searchParams.set('fields', 'nextPageToken, files(id, name, mimeType, md5Checksum, size)')
    url.searchParams.set('pageSize', '200')
    if (pageToken !== undefined) url.searchParams.set('pageToken', pageToken)
    const response = await call(url.toString(), { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } })
    if (!response.ok) throw new DriveError('drive: تعذّر سرد مجلّد الوسائط', response.status)
    const body = (await response.json()) as { files?: RawEntry[]; nextPageToken?: unknown }
    out.push(...(body.files ?? []))
    if (typeof body.nextPageToken !== 'string' || body.nextPageToken === '') return out
    pageToken = body.nextPageToken
  }
  return out
}

/**
 * يجد مجلّدَ الوسائط بالاسم تحت مجلّد المصادر ثمّ يسرده **بمجلّداته الفرعيّة كلِّها** — والسقفُ عمقٌ ستّة وألفُ ملفّ.
 * و`null` إن لم يوجد المجلّد: يُقال للمالك باسمه، لا «فشل».
 */
export async function listMediaFolder(
  token: string,
  rootFolderId: string,
  folderName: string,
  fetchImpl: typeof fetch = withTimeout(fetch, 30_000),
): Promise<DriveMediaFile[] | null> {
  const top = await listChildren(token, rootFolderId, fetchImpl)
  const wanted = folderName.trim().toLowerCase()
  const folder = top.find((e) => e.mimeType === FOLDER_MIME && typeof e.name === 'string' && e.name.trim().toLowerCase() === wanted)
  if (folder === undefined || typeof folder.id !== 'string') return null
  const files: DriveMediaFile[] = []
  const queue: { id: string; path: string; depth: number }[] = [{ id: folder.id, path: '', depth: 0 }]
  while (queue.length > 0 && files.length < MAX_MEDIA_FILES) {
    const at = queue.shift()!
    for (const e of await listChildren(token, at.id, fetchImpl)) {
      if (typeof e.id !== 'string' || typeof e.name !== 'string') continue
      if (e.mimeType === FOLDER_MIME) {
        if (at.depth < 6) queue.push({ id: e.id, path: at.path === '' ? e.name : `${at.path}/${e.name}`, depth: at.depth + 1 })
        continue
      }
      const mime = typeof e.mimeType === 'string' ? e.mimeType : ''
      if (!mime.startsWith('image/') && !mime.startsWith('video/')) continue
      files.push({
        id: e.id, name: e.name, mimeType: mime,
        md5: typeof e.md5Checksum === 'string' ? e.md5Checksum : '',
        bytes: Number(e.size ?? 0) || 0,
        path: at.path,
      })
      if (files.length >= MAX_MEDIA_FILES) break
    }
  }
  return files
}

export interface MediaSyncResult {
  readonly added: number
  readonly changed: number
  readonly unchanged: number
  readonly missing: number
}

/** معرّفٌ ثابتٌ من معرّف Drive والمنظّمة — فإعادةُ المزامنة لا تصنع صفًّا ثانيًا. */
export function mediaId(org: string, driveFileId: string): string {
  return `dm:${org}:${driveFileId}`
}

/**
 * يوفّق ما في المجلّد مع `drive_media` — **ما تغيّرت بصمتُه يُعاد وسمُه، وما غاب يُعلَّم ولا يُحذف**.
 * والعباراتُ دفعات (D-320).
 */
export async function syncDriveMedia(db: Db, org: string, files: readonly DriveMediaFile[]): Promise<MediaSyncResult> {
  const { results } = await db
    .prepare('SELECT drive_file_id, md5, path, name FROM drive_media WHERE org_id = ?')
    .bind(org)
    .all<{ drive_file_id: string; md5: string; path: string; name: string }>()
  const prior = new Map(results.map((r) => [r.drive_file_id, r]))
  const writes: DbStatement[] = []
  const seen = new Set<string>()
  let added = 0
  let changed = 0
  let unchanged = 0
  for (const f of files) {
    const tags = mediaTags(f.path, f.name, f.mimeType)
    if (tags === null || seen.has(f.id)) continue
    seen.add(f.id)
    const was = prior.get(f.id)
    if (was === undefined) added += 1
    else if (was.md5 !== f.md5 || was.path !== f.path || was.name !== f.name) changed += 1
    else unchanged += 1
    writes.push(db
      .prepare(
        `INSERT INTO drive_media (id, org_id, drive_file_id, name, mime, kind, md5, bytes, path, item_no, variant)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (org_id, drive_file_id) DO UPDATE SET
           name = excluded.name, mime = excluded.mime, kind = excluded.kind, md5 = excluded.md5, bytes = excluded.bytes,
           path = excluded.path, item_no = excluded.item_no, variant = excluded.variant, missing = 0`,
      )
      .bind(mediaId(org, f.id), org, f.id, f.name, f.mimeType, tags.kind, f.md5, f.bytes, f.path, tags.itemNo, tags.variant))
  }
  const gone = [...prior.keys()].filter((id) => !seen.has(id))
  for (const id of gone) {
    writes.push(db.prepare('UPDATE drive_media SET missing = 1 WHERE org_id = ? AND drive_file_id = ?').bind(org, id))
  }
  await inBatches(db, writes)
  return { added, changed, unchanged, missing: gone.length }
}

/** ما يحتاجه التنزيل من R2 — والدلوُ الحقيقيُّ يوافقه، والاختبارُ يقلّده. */
export interface PutBucket {
  put(key: string, value: ArrayBuffer, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>
}

/** حدُّ الملفّ الواحد بنوعه — حدودُ الرفع نفسُها. */
export function withinLimit(kind: MediaKind, bytes: number): boolean {
  return bytes > 0 && bytes <= (kind === 'video' ? MAX_UPLOAD_BYTES : MAX_IMAGE_BYTES)
}

/**
 * ينزّل إلى R2 ما لم يُنزَّل أو تغيّر — **أصغرَه أوّلًا وبسقف المزامنة**، وما فوق حدّ الرفع لا يُنزَّل أبدًا.
 * والمفتاحُ تحت `library/<org>/drive/` فيدخل في تصدير المنظّمة ومحوها (`orgPrefixes`).
 */
export async function fetchMediaBytes(
  db: Db, org: string, bucket: PutBucket, token: string,
  fetchImpl: typeof fetch = withTimeout(fetch, 120_000), cap: number = SYNC_BYTE_CAP,
): Promise<{ readonly fetched: number; readonly bytes: number; readonly deferred: number }> {
  const { results } = await db
    .prepare(
      `SELECT drive_file_id, mime, kind, md5, bytes FROM drive_media
        WHERE org_id = ? AND missing = 0 AND ((r2_key IS NULL AND r2_md5 IS NULL) OR coalesce(r2_md5, '') <> md5)
        ORDER BY bytes ASC LIMIT 200`,
    )
    .bind(org)
    .all<{ drive_file_id: string; mime: string; kind: MediaKind; md5: string; bytes: number }>()
  let used = 0
  let fetched = 0
  let deferred = 0
  for (const row of results) {
    if (!withinLimit(row.kind, row.bytes)) continue
    if (used + row.bytes > cap) { deferred += 1; continue }
    const response = await fetchImpl(`${FILES_URL}/${encodeURIComponent(row.drive_file_id)}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!response.ok) { deferred += 1; continue }
    const body = await response.arrayBuffer()
    if (!withinLimit(row.kind, body.byteLength)) {
      // ‏جسمٌ فوق الحدّ أو فارغ: يُعلَّم بصمتُه بلا مفتاح، فلا يُنزَّل في كلّ مزامنةٍ حتى يتغيّر md5 في Drive
      await db.prepare('UPDATE drive_media SET r2_key = NULL, r2_md5 = ?, bytes = ? WHERE org_id = ? AND drive_file_id = ?')
        .bind(row.md5, body.byteLength, org, row.drive_file_id).run()
      continue
    }
    const key = `library/${org}/drive/${row.drive_file_id}`
    await bucket.put(key, body, { httpMetadata: { contentType: row.mime } })
    await db
      .prepare('UPDATE drive_media SET r2_key = ?, r2_md5 = ?, bytes = ? WHERE org_id = ? AND drive_file_id = ?')
      .bind(key, row.md5, body.byteLength, org, row.drive_file_id)
      .run()
    used += body.byteLength
    fetched += 1
  }
  return { fetched, bytes: used, deferred }
}

/** مكتبةُ المنظّمة من Drive — الحاضرُ وحده، مرتّبًا بالمسار ثمّ الاسم فالتناوبُ ثابت. */
export async function readDriveMedia(db: Db, org: string): Promise<LibraryMedia[]> {
  try {
    const { results } = await db
      .prepare(
        `SELECT drive_file_id AS id, name, mime, kind, bytes, path, item_no AS itemNo, variant, r2_key AS r2Key
           FROM drive_media WHERE org_id = ? AND missing = 0 ORDER BY path, name LIMIT ${MAX_MEDIA_FILES}`,
      )
      .bind(org)
      .all<LibraryMedia>()
    return results
  } catch {
    // ‏قاعدةٌ لم تُرحَّل بعد: الخطّةُ تُقرأ بلا وسائط، لا تنكسر
    return []
  }
}

/** اسمُ مجلّد الوسائط للمنظّمة — أو الافتراض. */
export async function mediaFolderName(db: Db, org: string): Promise<string> {
  try {
    const row = await db.prepare('SELECT name FROM drive_media_folder WHERE org_id = ?').bind(org).first<{ name: string }>()
    return row?.name ?? DEFAULT_MEDIA_FOLDER
  } catch {
    return DEFAULT_MEDIA_FOLDER
  }
}

/** يحفظ اسمَ المجلّد — اسمٌ لا مسار: بلا «/» ولا أكثرَ من مئة محرف. */
export async function setMediaFolderName(db: Db, org: string, raw: string): Promise<{ ok: true; name: string } | { ok: false; reason: string }> {
  const name = raw.trim()
  if (name === '' || name.length > 100 || name.includes('/')) return { ok: false, reason: 'اكتب اسمَ المجلّد كما في Drive، مثل 04-media' }
  await db
    .prepare(`INSERT INTO drive_media_folder (org_id, name) VALUES (?, ?)
              ON CONFLICT (org_id) DO UPDATE SET name = excluded.name, updated_at = datetime('now')`)
    .bind(org, name)
    .run()
  return { ok: true, name }
}

// ── المطابقة ─────────────────────────────────────────────────────────

/** ما تحتاجه المطابقةُ من صفّ الخطّة. */
export interface MediaWant {
  readonly item: string
  readonly hint: string
  readonly format: string
}

export type MediaMatch =
  | { readonly kind: 'matched'; readonly media: LibraryMedia }
  | { readonly kind: 'missing'; readonly want: MediaKind }
  /** «اقتباس (نص فقط)»: الصفُّ لا يطلب وسيطة. */
  | { readonly kind: 'text' }

/** نوعُ الوسيطة من عمود الشكل: «فيديو…» مقطع، و«نص فقط» لا شيء، وما سواهما صورة. */
export function wantedKind(format: string, hint: string): MediaKind | 'text' {
  const s = `${format} ${hint}`
  if (/فيديو|مقطع|video|reel|ريل/i.test(s)) return 'video'
  if (/نص\s*فقط|نصّ\s*فقط|text\s*only/i.test(format)) return 'text'
  return 'image'
}

/**
 * لكلّ صفٍّ وسيطتُه (D-363): **برقم المادّة**، وبالنوع الذي يطلبه شكلُه، **وبالتناوب بين الداكن والفاتح** لصفوف المادّة نفسِها
 * إن وُجد الاثنان (والتلميحُ الذي يسمّي واحدًا يُلزمه). وفي كلّ لونٍ تدور الملفّاتُ بترتيبها فلا يتكرّر ملفٌّ ما بقي غيره.
 * والصفُّ بلا رقم مادّةٍ `null`: لم يطلب من المكتبة شيئًا.
 */
export function matchMedia(rows: readonly (MediaWant | null)[], library: readonly LibraryMedia[]): (MediaMatch | null)[] {
  const turn = new Map<string, number>()
  const used = new Map<string, number>()
  return rows.map((row): MediaMatch | null => {
    if (row === null) return null
    const item = itemNumber(row.item)
    if (item === null) return null
    const want = wantedKind(row.format, row.hint)
    if (want === 'text') return { kind: 'text' }
    const pool = library.filter((m) => m.itemNo === item && m.kind === want)
    if (pool.length === 0) return { kind: 'missing', want }
    const fixed = variantOf(row.hint)
    const dark = pool.filter((m) => m.variant === 'dark')
    const light = pool.filter((m) => m.variant === 'light')
    let choice: readonly LibraryMedia[] = pool
    let label = 'any'
    if (fixed !== null) {
      const own = fixed === 'dark' ? dark : light
      if (own.length > 0) { choice = own; label = fixed }
    } else if (dark.length > 0 && light.length > 0) {
      const k = `${item}|${want}`
      const n = turn.get(k) ?? 0
      turn.set(k, n + 1)
      choice = n % 2 === 0 ? dark : light
      label = n % 2 === 0 ? 'dark' : 'light'
    }
    const uk = `${item}|${want}|${label}`
    const i = used.get(uk) ?? 0
    used.set(uk, i + 1)
    return { kind: 'matched', media: choice[i % choice.length]! }
  })
}

export interface MediaScanDeps {
  readonly db: Db
  readonly org: string
  readonly serviceAccountJson: string
  readonly rootFolderId: string
  readonly bucket: PutBucket
  readonly now?: Date
  readonly fetchImpl?: typeof fetch
}

export type MediaScanReport =
  | ({ readonly ok: true; readonly folder: string; readonly seen: number; readonly fetched: number; readonly deferred: number } & MediaSyncResult)
  | { readonly ok: false; readonly folder: string; readonly reason: string }

/**
 * المزامنةُ كلُّها في نداءٍ واحد يستدعيه Cron اليوميّ و«زامن الآن» معًا — **بلا نداءٍ مدفوع**: رمزُ حساب الخدمة، والسرد، والتنزيلُ بسقفه.
 * والعطلُ يُعاد سببًا يقرؤه المالك ولا يُرمى، ولا رمزَ في السبب.
 */
export async function scanDriveMedia(deps: MediaScanDeps): Promise<MediaScanReport> {
  const folder = await mediaFolderName(deps.db, deps.org)
  if (deps.rootFolderId === '' || deps.serviceAccountJson === '') return { ok: false, folder, reason: 'مجلّد Drive غير مربوط على هذه البيئة' }
  try {
    const call = withTimeout(deps.fetchImpl ?? fetch, 30_000)
    const token = await accessToken(parseServiceAccount(deps.serviceAccountJson), deps.now ?? new Date(), call)
    const files = await listMediaFolder(token, deps.rootFolderId, folder, call)
    if (files === null) return { ok: false, folder, reason: `لا مجلّد باسم «${folder}» في مجلّد Drive المشارَك` }
    const sync = await syncDriveMedia(deps.db, deps.org, files)
    const bytes = await fetchMediaBytes(deps.db, deps.org, deps.bucket, token, withTimeout(deps.fetchImpl ?? fetch, 120_000))
    return { ok: true, folder, seen: files.length, fetched: bytes.fetched, deferred: bytes.deferred, ...sync }
  } catch (error) {
    return { ok: false, folder, reason: error instanceof DriveError ? error.message : 'تعذّرت المزامنة' }
  }
}

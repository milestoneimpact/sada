/**
 * **مكتبةُ العميل** (D-260 · AGENCY-PLAN و-٤) — كلُّ ما رُفع أو وُلّد أو في Drive، مصنَّفًا، ويُختار لبند الخطّة.
 *
 * أربعةُ أنهارٍ في نافذةٍ واحدة، **ولا نسخةَ ثانية**: الصورُ المولَّدة من `media`، ومقاطعُ المالك من `uploads`، وصورُه من
 * `library_files`، ومصادرُ Drive من `sources`. والتصنيفُ يُشتقّ عند القراءة — **النوعُ ثمّ المنشأ ثمّ الشهر** — فلا يتباعد عن
 * أصله، ولا يحتاج أحدًا يرتّبه. وصورةٌ وُلّدت لمنشورٍ تُعاد لغيره بعد شهر **بلا كلفةٍ جديدة**: الكائنُ في R2 نفسُه (0030).
 *
 * **والمرجعُ حرفٌ ومعرّف** (`m:` · `u:` · `f:` · `s:`) يُحفظ في البند، ويُتحقّق منه بمنظّمة الجلسة قبل أن يُحفظ وقبل أن يُربط.
 */
import { foldArabic } from './format'
import type { Db, DbStatement } from './tokens'
import { driveFileUrl } from './drive/sync'

export type AssetOrigin = 'generated' | 'upload' | 'drive'
export type AssetKind = 'image' | 'video' | 'doc'

export interface Asset {
  readonly ref: string
  readonly origin: AssetOrigin
  readonly kind: AssetKind
  readonly name: string
  readonly mime: string
  readonly bytes: number | null
  /** `YYYY-MM-DD HH:MM:SS` بـ UTC. */
  readonly at: string
  /** معاينةٌ خلف الجلسة، أو `null` لمصدرٍ نصّيّ. */
  readonly preview: string | null
  /** «افتح في Drive» لمصادره وحدها. */
  readonly drive: string | null
  /** في كم منشورٍ يُستعمل الآن (D-334) — صفوفُ `media` الجاهزةُ التي تشير إلى كائنه. وغيابُه لما لا يُربط (مصدرُ Drive). */
  readonly uses?: number
  /** علامتا المالك (D-347): المفضّلةُ والوسوم — لما له كائنٌ في R2 (لا مصدرُ Drive). */
  readonly favourite?: boolean
  readonly tags?: readonly string[]
}

export const KIND_LABEL: Readonly<Record<AssetKind, string>> = { image: 'صور', video: 'مقاطع', doc: 'ملفّات' }
export const ORIGIN_LABEL: Readonly<Record<AssetOrigin, string>> = { generated: 'مولَّدة', upload: 'مرفوعة', drive: 'من Drive' }

/** سقفُ صورة المكتبة — كسقف الصورة المولَّدة (`image/job.ts`)، وما فوقه ترفضه المنصّاتُ قبلنا. */
export const LIBRARY_MAX_BYTES = 5 * 1024 * 1024
export const LIBRARY_MIMES: ReadonlySet<string> = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

/** **التصنيف**: النوعُ › المنشأ › الشهر — مسارٌ يُقرأ كمجلّد، ويُرتَّب به. */
export function folderOf(a: Pick<Asset, 'kind' | 'origin' | 'at'>): string {
  return `${KIND_LABEL[a.kind]} › ${ORIGIN_LABEL[a.origin]} › ${a.at.slice(0, 7)}`
}

const kindOf = (mime: string): AssetKind =>
  mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : 'doc'

const REF = /^([mufsd]):([A-Za-z0-9:_-]{1,200})$/

/** و`d:` وسيطةُ المالك من مجلّد Drive للوسائط (D-363) بمعرّف Drive — ما نُزّل منها إلى R2 وحده يُربط. */
export function parseRef(ref: string): { readonly tag: 'm' | 'u' | 'f' | 's' | 'd'; readonly id: string } | null {
  const m = REF.exec(ref)
  return m === null ? null : { tag: m[1] as 'm' | 'u' | 'f' | 's' | 'd', id: m[2]! }
}

type Row = Record<string, string | number | null>
const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v))
const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v))

/** المكتبةُ كلُّها لعميلٍ واحد — أحدثُها أوّلًا. وجدولٌ لم يُرحَّل يُسقط نهرَه وحدَه لا الصفحة. */
export async function listLibrary(db: Db, org: string, limit = 300): Promise<Asset[]> {
  const read = (sql: string): Promise<Row[]> =>
    db.prepare(sql).bind(org, limit).all<Row>().then((r) => r.results).catch(() => [])
  const [media, uploads, files, sources, used, marks] = await Promise.all([
    // ‏الصورةُ المولَّدة مرّةً واحدة وإن رُبطت بمنشورات: أقدمُ صفٍّ لكائنها
    read(`SELECT MIN(id) AS id, r2_key, mime, bytes, MIN(created_at) AS at, MAX(headline) AS name FROM media
           WHERE org_id = ?1 AND status = 'ready' AND upload_id IS NULL AND model NOT IN ('library', 'upload')
           GROUP BY r2_key ORDER BY at DESC LIMIT ?2`),
    read(`SELECT id, r2_key, name, mime, bytes, created_at AS at FROM uploads
           WHERE org_id = ?1 AND status = 'ready' ORDER BY created_at DESC LIMIT ?2`),
    read('SELECT id, r2_key, name, mime, bytes, created_at AS at FROM library_files WHERE org_id = ?1 ORDER BY created_at DESC LIMIT ?2'),
    read('SELECT id, drive_file_id, name, mime, last_seen_at AS at FROM sources WHERE org_id = ?1 ORDER BY last_seen_at DESC LIMIT ?2'),
    // ‏عدّادُ الاستعمال (D-334): كم منشورًا يحمل هذا الكائنَ الآن — جملةٌ واحدةٌ للمكتبة كلِّها، و`?2` يُربط فيها حدًّا واسعًا
    read(`SELECT r2_key, COUNT(DISTINCT post_id) AS n FROM media WHERE org_id = ?1 AND status = 'ready' GROUP BY r2_key LIMIT ?2 * 20`),
    // ‏علاماتُ المالك (D-347) — وجدولٌ لم يُرحَّل يُسقط العلاماتِ وحدَها
    read('SELECT r2_key, favourite, tags FROM asset_marks WHERE org_id = ?1 LIMIT ?2 * 20'),
  ])
  const markOf = new Map(marks.map((r) => [str(r['r2_key']), { favourite: num(r['favourite']) === 1, tags: splitTags(str(r['tags'])) }]))
  const marked = (r: Row): { favourite: boolean; tags: readonly string[] } => markOf.get(str(r['r2_key'])) ?? { favourite: false, tags: [] }
  const usesOf = new Map(used.map((r) => [str(r['r2_key']), num(r['n']) ?? 0]))
  const uses = (r: Row): number => usesOf.get(str(r['r2_key'])) ?? 0
  const all: Asset[] = [
    ...media.map((r): Asset => ({ ref: `m:${str(r['id'])}`, origin: 'generated', kind: kindOf(str(r['mime'])),
      name: str(r['name']) || 'صورة مولَّدة', mime: str(r['mime']), bytes: num(r['bytes']), at: str(r['at']),
      preview: `/panel/media/${encodeURIComponent(str(r['id']))}`, drive: null, uses: uses(r), ...marked(r) })),
    ...uploads.map((r): Asset => ({ ref: `u:${str(r['id'])}`, origin: 'upload', kind: 'video', name: str(r['name']),
      mime: str(r['mime']), bytes: num(r['bytes']), at: str(r['at']),
      preview: `/panel/assets/raw/u:${encodeURIComponent(str(r['id']))}`, drive: null, uses: uses(r), ...marked(r) })),
    ...files.map((r): Asset => ({ ref: `f:${str(r['id'])}`, origin: 'upload', kind: 'image', name: str(r['name']),
      mime: str(r['mime']), bytes: num(r['bytes']), at: str(r['at']),
      preview: `/panel/assets/raw/f:${encodeURIComponent(str(r['id']))}`, drive: null, uses: uses(r), ...marked(r) })),
    ...sources.map((r): Asset => ({ ref: `s:${str(r['id'])}`, origin: 'drive', kind: kindOf(str(r['mime'])), name: str(r['name']),
      mime: str(r['mime']), bytes: null, at: str(r['at']), preview: null, drive: driveFileUrl(str(r['drive_file_id'])) })),
  ]
  return all.sort((a, b) => b.at.localeCompare(a.at))
}

/** أكثرُ ما يحمله أصلٌ من وسوم، وأطولُ وسم — قليلةٌ تُقرأ على البلاطة. */
export const MAX_TAGS = 8
const MAX_TAG_LENGTH = 24
const splitTags = (stored: string): string[] => stored.split('\n').filter((t) => t !== '')

/** الوسومُ كما يكتبها المالك (بفاصلةٍ عربيّةٍ أو لاتينيّةٍ أو سطر) — مقلَّمةً بلا «#» وبلا مكرَّر، وحدُّها `MAX_TAGS`. */
export function cleanTags(raw: string): string[] {
  const out: string[] = []
  for (const part of raw.split(/[،,\n]/)) {
    const tag = part.replace(/#/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_TAG_LENGTH)
    if (tag !== '' && !out.includes(tag)) out.push(tag)
    if (out.length === MAX_TAGS) break
  }
  return out
}

/** البحثُ في المكتبة (D-347): الاسمُ أو وسمٌ يحوي النصّ، والمفضّلةُ وحدَها إن طُلبت — في الذاكرة على ما قُرئ. */
export function searchAssets(assets: readonly Asset[], q: string, favOnly: boolean): Asset[] {
  // ‏مطويّةً عربيًّا (D-349): «اسامه» تجد «أسامة»
  const needle = foldArabic(q)
  return assets.filter((a) => (!favOnly || a.favourite === true)
    && (needle === '' || foldArabic(a.name).includes(needle) || (a.tags ?? []).some((t) => foldArabic(t).includes(needle))))
}

/**
 * **علّم أصلًا** (D-347): مفضّلةٌ أو وسوم. المرجعُ يُحلّ إلى كائنه في R2 **بمنظّمة الجلسة** — فمرجعُ عميلٍ آخر لا يُعلَّم — وما لم يُذكر
 * من العلامتين يبقى كما هو. ومصدرُ Drive لا كائنَ له فلا يُعلَّم.
 */
export async function markAsset(
  db: Db, org: string, ref: string, change: { readonly favourite?: boolean; readonly tags?: string },
): Promise<{ readonly ok: true } | { readonly ok: false; readonly reason: string }> {
  const p = parseRef(ref)
  if (p === null || p.tag === 's') return { ok: false, reason: 'هذا الأصلُ لا يُعلَّم' }
  const key = p.tag === 'm'
    ? (await db.prepare("SELECT r2_key FROM media WHERE id = ? AND org_id = ? AND status = 'ready'").bind(p.id, org).first<{ r2_key: string }>().catch(() => null))?.r2_key
    : (await rawObject(db, org, ref))?.key
  if (key === undefined) return { ok: false, reason: 'لا أصلَ بهذا المرجع في مكتبتك' }
  const now = await db.prepare('SELECT favourite, tags FROM asset_marks WHERE org_id = ? AND r2_key = ?').bind(org, key)
    .first<{ favourite: number; tags: string }>().catch(() => null)
  const favourite = change.favourite ?? (now?.favourite === 1)
  const tags = change.tags === undefined ? now?.tags ?? '' : cleanTags(change.tags).join('\n')
  await db.prepare(`INSERT INTO asset_marks (org_id, r2_key, favourite, tags) VALUES (?, ?, ?, ?)
      ON CONFLICT (org_id, r2_key) DO UPDATE SET favourite = excluded.favourite, tags = excluded.tags, updated_at = datetime('now')`)
    .bind(org, key, favourite ? 1 : 0, tags).run()
  return { ok: true }
}

/** أصلٌ بعينه لعميل الجلسة — وغيرُه `null`، فمرجعٌ من عميلٍ آخر لا يُحفظ ولا يُربط. */
export async function findAsset(db: Db, org: string, ref: string): Promise<Asset | null> {
  const p = parseRef(ref)
  if (p === null) return null
  const one = (sql: string): Promise<Row | null> => db.prepare(sql).bind(p.id, org).first<Row>().catch(() => null)
  const at = (r: Row): string => str(r['at'])
  switch (p.tag) {
    case 'm': {
      const r = await one("SELECT id, mime, bytes, created_at AS at, headline AS name FROM media WHERE id = ? AND org_id = ? AND status = 'ready'")
      return r === null ? null : { ref, origin: 'generated', kind: kindOf(str(r['mime'])), name: str(r['name']) || 'صورة مولَّدة',
        mime: str(r['mime']), bytes: num(r['bytes']), at: at(r), preview: `/panel/media/${encodeURIComponent(p.id)}`, drive: null }
    }
    case 'u': {
      const r = await one("SELECT name, mime, bytes, created_at AS at FROM uploads WHERE id = ? AND org_id = ? AND status = 'ready'")
      return r === null ? null : { ref, origin: 'upload', kind: 'video', name: str(r['name']), mime: str(r['mime']),
        bytes: num(r['bytes']), at: at(r), preview: `/panel/assets/raw/${ref}`, drive: null }
    }
    case 'f': {
      const r = await one('SELECT name, mime, bytes, created_at AS at FROM library_files WHERE id = ? AND org_id = ?')
      return r === null ? null : { ref, origin: 'upload', kind: 'image', name: str(r['name']), mime: str(r['mime']),
        bytes: num(r['bytes']), at: at(r), preview: `/panel/assets/raw/${ref}`, drive: null }
    }
    case 'd': {
      const r = await one("SELECT name, mime, bytes FROM drive_media WHERE drive_file_id = ? AND org_id = ? AND missing = 0 AND r2_key IS NOT NULL")
      return r === null ? null : { ref, origin: 'upload', kind: kindOf(str(r['mime'])), name: str(r['name']), mime: str(r['mime']),
        bytes: num(r['bytes']), at: '', preview: `/panel/assets/raw/${ref}`, drive: null }
    }
    case 's': {
      const r = await one('SELECT drive_file_id, name, mime, last_seen_at AS at FROM sources WHERE id = ? AND org_id = ?')
      return r === null ? null : { ref, origin: 'drive', kind: kindOf(str(r['mime'])), name: str(r['name']), mime: str(r['mime']),
        bytes: null, at: at(r), preview: null, drive: driveFileUrl(str(r['drive_file_id'])) }
    }
  }
}

/** مفتاحُ R2 ونوعُه لمعاينةٍ خلف الجلسة — للمرفوعات وحدها (`/panel/media/:id` يخدم المولَّدة). */
export async function rawObject(db: Db, org: string, ref: string): Promise<{ readonly key: string; readonly mime: string } | null> {
  const p = parseRef(ref)
  if (p === null || (p.tag !== 'u' && p.tag !== 'f' && p.tag !== 'd')) return null
  const table = p.tag === 'u' ? "uploads WHERE id = ? AND org_id = ? AND status = 'ready'"
    : p.tag === 'd' ? 'drive_media WHERE drive_file_id = ? AND org_id = ? AND missing = 0 AND r2_key IS NOT NULL'
      : 'library_files WHERE id = ? AND org_id = ?'
  const r = await db.prepare(`SELECT r2_key, mime FROM ${table}`).bind(p.id, org).first<{ r2_key: string; mime: string }>().catch(() => null)
  return r === null ? null : { key: r.r2_key, mime: r.mime }
}

/**
 * **ربطُ أصلٍ بمسوّدة** — صفٌّ في `media` يشير إلى الكائن نفسِه في R2، **بلا نسخٍ ولا كلفة**.
 *
 * المفتاحُ `lib:<المرجع>:<المنشور>` فريد (D-004)، و`INSERT OR IGNORE`: إعادةُ الطابور لا تربط مرّتين. ومصدرُ Drive لا يُربط
 * — هو موضوعُ الكتابة لا وسيطُها، ويُقرأ في `sourceId` البند. والمنظّمةُ في الشرط: لا يُربط أصلُ عميلٍ بمنشور غيره.
 */
export function attachStatement(db: Db, org: string, postId: string, ref: string): DbStatement | null {
  const p = parseRef(ref)
  if (p === null || p.tag === 's') return null
  const key = `lib:${ref}:${postId}`
  const from = p.tag === 'm'
    ? `SELECT ?1, ?2, r2_key, mime, bytes, prompt, 'library', 0, 'ready', ?3, width, height, org_id, brand_id
         FROM media WHERE id = ?4 AND org_id = ?5 AND status = 'ready'`
    : p.tag === 'u'
      ? `SELECT ?1, ?2, r2_key, mime, bytes, '', 'upload', 0, 'ready', ?3, width, height, org_id, brand_id
           FROM uploads WHERE id = ?4 AND org_id = ?5 AND status = 'ready'`
      : p.tag === 'd'
        // ‏وسيطةُ Drive (D-363): صورةٌ نُزّلت إلى R2 وحاضرةٌ في المجلّد — والمقطعُ يُنشر من «فيديوهاتك» لا من هنا
        ? `SELECT ?1, ?2, r2_key, mime, bytes, '', 'drive', 0, 'ready', ?3, NULL, NULL, org_id,
               coalesce((SELECT brand_id FROM posts WHERE id = ?2), 'brand_owner')
             FROM drive_media WHERE drive_file_id = ?4 AND org_id = ?5 AND missing = 0 AND kind = 'image' AND r2_key IS NOT NULL`
        : `SELECT ?1, ?2, r2_key, mime, bytes, '', 'library', 0, 'ready', ?3, width, height, org_id, brand_id
           FROM library_files WHERE id = ?4 AND org_id = ?5`
  return db.prepare(`INSERT OR IGNORE INTO media
      (id, post_id, r2_key, mime, bytes, prompt, model, cost_usd, status, idempotency_key, width, height, org_id, brand_id) ${from}`).bind(crypto.randomUUID(), postId, key, p.id, org)
}

/**
 * **صورةٌ من المكتبة لمنشورٍ مكتوب** (D-334) — «اختر من المكتبة» على بطاقة الخطّة. الكائنُ نفسُه يُربط بالمنشور بـ`attachStatement`
 * (بلا نسخٍ ولا كلفة)، **وصورتُه الحاليّةُ تُرفض أوّلًا** بـ`reject` كما في «بدّلها» — فلا يحمل المنشورُ صورتين يختار الناشرُ بينهما.
 * والمنشورُ مسوّدةٌ أو معتمَدٌ بلا موعد: ما جُدول أو نُشر لا تُبدَّل صورتُه من هنا. والمقطعُ والمستندُ ومصدرُ Drive لا تُربط صورةً.
 */
export async function attachToPost(
  db: Db, org: string, postId: string, ref: string,
  reject: (mediaId: string) => Promise<unknown>,
): Promise<{ readonly ok: true; readonly name: string } | { readonly ok: false; readonly reason: string }> {
  const post = await db.prepare('SELECT status FROM posts WHERE id = ? AND org_id = ?').bind(postId, org).first<{ status: string }>()
  if (post === null) return { ok: false, reason: 'لا منشور بهذا المعرّف' }
  if (post.status !== 'draft' && post.status !== 'approved' && post.status !== 'edited') {
    return { ok: false, reason: post.status === 'queued' ? 'منشورٌ مجدول — «تراجَع» أوّلًا ثمّ بدّل صورتَه' : 'لا تُبدَّل صورةُ منشورٍ نُشر أو رُفض' }
  }
  const asset = await findAsset(db, org, ref)
  if (asset === null || asset.kind !== 'image' || asset.origin === 'drive') return { ok: false, reason: 'هذا الملفّ ليس صورةً في مكتبتك' }
  const statement = attachStatement(db, org, postId, ref)
  if (statement === null) return { ok: false, reason: 'هذا الملفّ لا يُربط بمنشور' }
  const { results: current } = await db
    .prepare("SELECT id FROM media WHERE post_id = ? AND org_id = ? AND status = 'ready' AND mime LIKE 'image/%'")
    .bind(postId, org)
    .all<{ id: string }>()
  for (const m of current) await reject(m.id)
  await statement.run()
  return { ok: true, name: asset.name }
}

/** صورةٌ يرفعها المالك إلى المكتبة — النوعُ والحجمُ هنا، والبايتاتُ في R2 قبل الصفّ. */
export function libraryProblem(mime: string, bytes: number): string | null {
  if (!LIBRARY_MIMES.has(mime)) return 'الصورةُ PNG أو JPEG أو WebP أو GIF — والمقاطعُ من «فيديوهاتك».'
  if (bytes <= 0) return 'الملفّ فارغ.'
  if (bytes > LIBRARY_MAX_BYTES) return 'الصورةُ أكبرُ من 5MB — والمنصّاتُ ترفض ما فوقها.'
  return null
}

export async function addLibraryFile(
  db: Db,
  org: string,
  file: { readonly key: string; readonly name: string; readonly mime: string; readonly bytes: number },
): Promise<string> {
  const id = crypto.randomUUID()
  await db.prepare('INSERT INTO library_files (id, org_id, r2_key, name, mime, bytes) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, org, file.key, file.name, file.mime, file.bytes).run()
  return id
}

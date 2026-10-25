/**
 * مقاطعُ المالك (D-180) — **يرفعها من اللوحة، وتُنشَر إلى ثلاث منصّاتٍ من نسخةٍ واحدة**.
 *
 * سأل المالك: «هل أضعها في Drive أم أرفعها من هنا؟». والجوابُ من الشيفرة: البايتاتُ
 * يجب أن تكون في R2 على كلّ حال — YouTube وTikTok يُدفَعان منها (D-179)، وInstagram
 * تسحب من رابطٍ عندنا (D-121). وإذنُ Drive قراءةٌ وحدها (D-017)، فلا مرآةَ إليه.
 * **فالرفعُ هنا، وإلى R2 مباشرةً**، بالرفع المتعدّد عبر العامل: قطعٌ ‏20MB كلٌّ في
 * طلبٍ تحت سقف جسد الطلب (‏100MB)، وبرمز CSRF في كلّ قطعةٍ كأيّ نموذج.
 *
 * ولا نداءَ مدفوعًا هنا (D-006 وD-008): لا نموذجَ ولا مزوّد. والنشرُ بعده يمرّ من
 * الطابور بحرّاسه كلّها: الاعتمادُ، والموعد، و`idempotency_key` (D-004).
 */
import { atomically, type Db, type DbStatement } from '../tokens'
import { isLinkedInPage, type LinkedAccount } from '../channels'
import { schedulePost } from '../schedule/job'
import { YT_TITLE_MAX, youtubeDescription, youtubeTitle } from '../publish/youtube'
import { canUploadMedia } from '../oauth/scopes'
import { objectKey } from '../tenancy'

/** الأنواعُ التي تقبلها المنصّاتُ الثلاث أو بعضُها — وما سواها يُردّ قبل أن يُرفَع بايت. */
export const UPLOAD_MIMES: ReadonlySet<string> = new Set(['video/mp4', 'video/quicktime', 'video/webm'])

/** سقفُ المقطع: فوق حدّ Instagram (‏300MB) بهامش، وتحت ما يُرفَع في جلسةٍ بلا قلق. */
export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024

/** حجمُ القطعة: فوق أدنى R2 (‏5MB) وتحت سقف جسد الطلب في العامل (‏100MB). */
export const PART_BYTES = 20 * 1024 * 1024

/** ما يحتاجه الرفعُ من R2 — والدلوُ الحقيقيُّ يوافقه، والاختبارُ يقلّده. */
export interface MultipartBucket {
  createMultipartUpload(key: string, options?: { httpMetadata?: { contentType?: string } }): Promise<MultipartUpload>
  resumeMultipartUpload(key: string, uploadId: string): MultipartUpload
}

export interface MultipartUpload {
  readonly uploadId: string
  uploadPart(partNumber: number, value: ArrayBuffer): Promise<{ partNumber: number; etag: string }>
  complete(parts: { partNumber: number; etag: string }[]): Promise<unknown>
  abort(): Promise<void>
}

export interface UploadRow {
  readonly id: string
  readonly r2Key: string
  readonly name: string
  readonly mime: string
  readonly bytes: number
  readonly width: number | null
  readonly height: number | null
  readonly durationMs: number | null
  readonly status: 'uploading' | 'ready' | 'failed'
  readonly createdAt: string
  /**
   * المنشوراتُ التي أُنشئت من هذا المقطع (غيرُ المرفوضة)، الأحدثُ أوّلًا — بمعرّفاتها لا
   * بأسماء منصّاتها وحدها: صفُّ المقطع يربط كلًّا ببطاقته، ويجدولها معًا (ر-4).
   */
  readonly posts: readonly UploadPost[]
}

export interface UploadPost {
  readonly id: string
  readonly platform: string
  readonly status: string
  /**
   * ما قاله الناشرُ عن نشرٍ نجح ولم يقع كما قرّره المالك (D-190) — صندوقُ TikTok بلا نصّ،
   * أو مستوًى أضيقُ من العامّ. و`null` لما سواه.
   */
  readonly note?: string | null
}

export interface UploadMeta {
  readonly name: string
  readonly mime: string
  readonly bytes: number
  readonly width: number | null
  readonly height: number | null
  readonly durationMs: number | null
}

export type StartResult =
  | { readonly ok: true; readonly id: string; readonly partBytes: number; readonly parts: number }
  | { readonly ok: false; readonly reason: string }

/** اسمُ الملفّ كما يُعرض — بلا مسارٍ ولا محارفِ تحكّم، وبطولٍ يُقرأ. */
export function cleanName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? ''
  const clean = base.replace(/[\u0000-\u001f\u007f]/g, '').trim()
  return (clean === '' ? 'مقطع' : clean).slice(0, 120)
}

/** امتدادُ الكائن من نوعه — لا من اسم الملفّ الذي يكتبه المالك. */
function extension(mime: string): string {
  return mime === 'video/quicktime' ? 'mov' : mime === 'video/webm' ? 'webm' : 'mp4'
}

const positive = (n: number | null): number | null =>
  n !== null && Number.isFinite(n) && n > 0 ? Math.round(n) : null

/**
 * يبدأ الرفع: يفحص النوعَ والحجم، ويفتح رفعًا متعدّدًا في R2، ويكتب الصفّ.
 * **والفحصُ قبل R2**: ملفٌّ مرفوضٌ لا يفتح رفعًا يبقى معلّقًا.
 */
export async function startUpload(
  db: Db,
  org: string,
  bucket: MultipartBucket,
  meta: UploadMeta,
  id: string = crypto.randomUUID(),
): Promise<StartResult> {
  if (!UPLOAD_MIMES.has(meta.mime)) {
    return { ok: false, reason: 'نوع لا تقبله المنصّات — صدّره MP4 (H.264 وصوت AAC)' }
  }
  if (!Number.isFinite(meta.bytes) || meta.bytes <= 0) return { ok: false, reason: 'ملفّ فارغ' }
  if (meta.bytes > MAX_UPLOAD_BYTES) {
    return { ok: false, reason: `أكبر من ${MAX_UPLOAD_BYTES / 1024 / 1024}MB — صدّره بدقّة 1080p وجودة أقلّ` }
  }
  const key = objectKey(org, `upload/${id}.${extension(meta.mime)}`)
  const upload = await bucket.createMultipartUpload(key, { httpMetadata: { contentType: meta.mime } })
  await db
    .prepare(
      `INSERT INTO uploads (id, r2_key, name, mime, bytes, width, height, duration_ms, status, multipart_id, org_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'uploading', ?, ?)`,
    )
    .bind(id, key, cleanName(meta.name), meta.mime, Math.round(meta.bytes),
      positive(meta.width), positive(meta.height), positive(meta.durationMs), upload.uploadId, org)
    .run()
  return { ok: true, id, partBytes: PART_BYTES, parts: Math.ceil(meta.bytes / PART_BYTES) }
}

interface Pending {
  readonly r2_key: string
  readonly bytes: number
  readonly status: string
  readonly multipart_id: string | null
}

/** الرفعُ الجاري — في منظّمة الجلسة وحدَها (D-277). */
async function pending(db: Db, org: string, id: string): Promise<Pending | null> {
  return db
    .prepare('SELECT r2_key, bytes, status, multipart_id FROM uploads WHERE id = ? AND org_id = ?')
    .bind(id, org)
    .first<Pending>()
}

/**
 * قطعةٌ واحدة — **ورقمُها وطولُها يُفحَصان**: قطعةٌ أطولُ من حجمها أو خارج العدد
 * تُردّ، فلا يُجمَّع في R2 كائنٌ غيرُ الذي أُعلن.
 */
export async function uploadPart(
  db: Db,
  org: string,
  bucket: MultipartBucket,
  id: string,
  partNumber: number,
  body: ArrayBuffer,
): Promise<{ ok: true; part: { partNumber: number; etag: string } } | { ok: false; reason: string }> {
  const row = await pending(db, org, id)
  if (row === null || row.status !== 'uploading' || row.multipart_id === null) {
    return { ok: false, reason: 'لا رفع جاريًا بهذا المعرّف' }
  }
  const parts = Math.ceil(row.bytes / PART_BYTES)
  if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > parts) {
    return { ok: false, reason: 'رقم قطعة خارج المقطع' }
  }
  const expected = partNumber < parts ? PART_BYTES : row.bytes - PART_BYTES * (parts - 1)
  if (body.byteLength !== expected) return { ok: false, reason: 'طول القطعة غير ما أُعلن' }
  const part = await bucket.resumeMultipartUpload(row.r2_key, row.multipart_id).uploadPart(partNumber, body)
  return { ok: true, part }
}

/** يجمع القطعَ في R2 ويعلن المقطعَ جاهزًا — **وكلُّ القطع حاضرةٌ أو لا شيء**. */
export async function completeUpload(
  db: Db,
  org: string,
  bucket: MultipartBucket,
  id: string,
  parts: readonly { partNumber: number; etag: string }[],
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const row = await pending(db, org, id)
  if (row === null || row.status !== 'uploading' || row.multipart_id === null) {
    return { ok: false, reason: 'لا رفع جاريًا بهذا المعرّف' }
  }
  const count = Math.ceil(row.bytes / PART_BYTES)
  const numbers = new Set(parts.map((p) => p.partNumber))
  if (parts.length !== count || numbers.size !== count || parts.some((p) => typeof p.etag !== 'string' || p.etag === '')) {
    return { ok: false, reason: 'قطع ناقصة — أعد الرفع' }
  }
  await bucket.resumeMultipartUpload(row.r2_key, row.multipart_id)
    .complete([...parts].sort((a, b) => a.partNumber - b.partNumber))
  await db
    .prepare(`UPDATE uploads SET status = 'ready', multipart_id = NULL, ready_at = datetime('now') WHERE id = ? AND org_id = ?`)
    .bind(id, org)
    .run()
  return { ok: true }
}

/** عمرُ رفعٍ لم يكتمل قبل أن يُعدّ متروكًا — أبطأُ رفعٍ لـ ‏500MB دونه بكثير. */
export const STALE_UPLOAD_HOURS = 6

/**
 * رفعٌ تُرك في منتصفه (D-182): أُغلقت الصفحةُ أو انقطعت الشبكة، فلم يصل طلبُ الإلغاء.
 * كان يبقى «لم يكتمل رفعُه» في المكتبة أبدًا ولا زرَّ يزيله. فدورةُ الربع تلغي قطعَه في
 * R2 وتعلّمه فاشلًا — وفشلُ الإلغاء لا يمنع التعليم: R2 يُسقط القطعَ اليتيمةَ بدورة حياته.
 */
export async function expireStaleUploads(db: Db, bucket: MultipartBucket, now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - STALE_UPLOAD_HOURS * 3_600_000).toISOString().slice(0, 19).replace('T', ' ')
  const { results } = await db
    // ‏دورةٌ تعبر المنظّمات كلَّها (D-277): تقرأ منظّمةَ كلّ صفٍّ وتعلّمه بها
    .prepare(`SELECT id, org_id, r2_key, multipart_id FROM uploads WHERE status = 'uploading' AND created_at < ? LIMIT 50`)
    .bind(cutoff)
    .all<{ id: string; org_id: string; r2_key: string; multipart_id: string | null }>()
  for (const row of results) {
    if (row.multipart_id !== null) {
      await Promise.resolve()
        .then(() => bucket.resumeMultipartUpload(row.r2_key, row.multipart_id!).abort())
        .catch(() => undefined)
    }
    await db.prepare(`UPDATE uploads SET status = 'failed', multipart_id = NULL WHERE id = ? AND org_id = ? AND status = 'uploading'`).bind(row.id, row.org_id).run()
  }
  return results.length
}

/** يلغي رفعًا لم يكتمل — R2 يحذف قطعه، والصفُّ يُعلَّم فاشلًا لا يُمحى. */
export async function abortUpload(db: Db, org: string, bucket: MultipartBucket, id: string): Promise<void> {
  const row = await pending(db, org, id)
  if (row === null || row.status !== 'uploading' || row.multipart_id === null) return
  await bucket.resumeMultipartUpload(row.r2_key, row.multipart_id).abort().catch(() => undefined)
  await db.prepare(`UPDATE uploads SET status = 'failed', multipart_id = NULL WHERE id = ? AND org_id = ?`).bind(id, org).run()
}

/** ‏ترتيبُ المكتبة ونافذتُها — **نصٌّ واحدٌ للنداءين**: المقاطعُ ومنشوراتُها من النافذة نفسِها. */
const LIBRARY = `SELECT id FROM uploads WHERE org_id = ? AND status != 'failed' ORDER BY created_at DESC, id LIMIT ?`

interface LibraryRow {
  id: string; r2_key: string; name: string; mime: string; bytes: number; width: number | null
  height: number | null; duration_ms: number | null; status: UploadRow['status']; created_at: string
}

export async function listUploads(db: Db, org: string, limit = 20): Promise<UploadRow[]> {
  let results: LibraryRow[]
  try {
    results = (await db
      .prepare(
        // ‏ووقتُ المقطع وقتُ اكتماله إن اكتمل: «رُفع قبل ساعة» لا «بدأ رفعُه»
        `SELECT u.id, u.r2_key, u.name, u.mime, u.bytes, u.width, u.height, u.duration_ms, u.status,
                COALESCE(u.ready_at, u.created_at) AS created_at
           FROM uploads u WHERE u.org_id = ? AND u.id IN (${LIBRARY})
          ORDER BY u.created_at DESC, u.id`,
      )
      .bind(org, org, limit)
      .all<LibraryRow>()).results
  } catch {
    // ‏جدولٌ لم يُرحَّل بعد: اللوحةُ تُفتح بلا مكتبةٍ ولا تسقط
    return []
  }
  /*
   * ‏ومنشوراتُ هذه المقاطع في نداءٍ ثانٍ لا في عمودٍ مضموم: المعرّفُ والمنصّةُ والحالُ معًا، بترتيبها.
   *
   * ‏**والنافذةُ استعلامٌ فرعيٌّ لا معرّفاتٌ مربوطة** (مراجعة ر-5): كان `IN (?,?,…)` بمعاملٍ لكلّ
   * ‏مقطع، وD1 لا يقبل أكثرَ من ‏100 معاملٍ مربوط — واستيرادُ الخطّة يطلب ‏200. فبعد المقطع
   * ‏الحادي بعد المئة رمى الاستعلام، **وأفرغ `catch` المكتبةَ كلَّها**: كلُّ صفٍّ في الخطّة يذكر
   * ‏مقطعًا قيل له «لا مقطعَ مرفوعًا» والمقاطعُ موجودة. **وتعثُّرُ هذا النداء وحدَه لا يُفرغها**:
   * ‏المقاطعُ تُعرَض بلا روابط منشوراتها، والخطّةُ تجدها بأسمائها.
   */
  let made: { upload_id: string; id: string; platform: string; status: string; note: string | null }[] = []
  if (results.length > 0) {
    try {
      made = (await db
        .prepare(
          // ‏وملاحظةُ الناشر على نشرٍ نجح (D-190): للمنشور وحدَه، ولا استعلامَ لما لم يُنشر
          `SELECT m.upload_id, p.id, p.platform, p.status,
                  CASE WHEN p.status = 'published' THEN
                    (SELECT json_extract(pa.response_json, '$.note') FROM publish_attempts pa
                      WHERE pa.post_id = p.id AND pa.org_id = p.org_id AND pa.status = 'succeeded'
                      ORDER BY pa.attempt_no DESC LIMIT 1) END AS note
             FROM media m JOIN posts p ON p.id = m.post_id AND p.org_id = m.org_id
            WHERE m.org_id = ? AND m.upload_id IN (${LIBRARY}) AND p.status != 'rejected'
            ORDER BY p.created_at DESC, p.id`,
        )
        .bind(org, org, limit)
        .all<{ upload_id: string; id: string; platform: string; status: string; note: string | null }>()).results
    } catch (error) {
      console.error({ job: 'uploads.list', posts_failed: String(error).slice(0, 200) })
    }
  }
  return results.map((r) => ({
    id: r.id, r2Key: r.r2_key, name: r.name, mime: r.mime, bytes: r.bytes, width: r.width, height: r.height,
    durationMs: r.duration_ms, status: r.status, createdAt: r.created_at,
    posts: made.filter((m) => m.upload_id === r.id).map((m) => ({
      id: m.id, platform: m.platform, status: m.status, note: typeof m.note === 'string' && m.note !== '' ? m.note : null,
    })),
  }))
}

export type VideoPlatform = 'youtube' | 'tiktok' | 'instagram'
export const VIDEO_PLATFORMS: readonly VideoPlatform[] = ['youtube', 'tiktok', 'instagram']

export interface VideoCheck {
  readonly platform: VideoPlatform
  /** `block` يمنع إنشاءَ المنشور، و`warn` يُقال ولا يمنع. */
  readonly level: 'ok' | 'warn' | 'block'
  readonly note: string
}

/**
 * **ما لا يُنشر للعامّة** — YouTube يُرفع `private` وTikTok `SELF_ONLY` أو صندوقَ التطبيق
 * **ما دام تطبيقُ المالك لم يُجَز** (D-190). كان يُقال في صفحة المنصّة وحدها، وتقول بطاقةُ
 * المقطع «Short ●» بالأخضر، فيجدول المالكُ وهو يظنّه سيُنشر للناس (ر-4). فيُقال حيث يقرّر:
 * تحت المنصّة قبل الإنشاء، وفي صفّ الجدولة، وفي إشعار ما بعدهما — **ويسكت حين يقلب المالكُ
 * النشرَ علنيًّا** بعد أن تصله الإجازة (`Reach`).
 */
export const PRIVATE_REACH: Readonly<Record<'youtube' | 'tiktok', string>> = {
  youtube: 'يصل قناتك خاصًّا — تنشره أنت من YouTube Studio',
  tiktok: 'لا يراه غيرك حتّى تنشره أنت من تطبيق TikTok',
}

/** لماذا يصل خاصًّا — **بلغة المالك**: الإجازةُ عند المنصّة لا عندنا (M-28 وM-29). */
export const UNAUDITED: Readonly<Record<'youtube' | 'tiktok', string>> = {
  youtube: 'Google لم تُجِز تطبيقك بعد',
  tiktok: 'TikTok لم تُجِز تطبيقك بعد',
}

/**
 * من يرى المقطعَ بعد نشره — `true` للعامّة (D-190). **ويُقرأ من إعداد المالك** (`youtube_public`
 * و`tiktok_public`) الذي يقلبه بيده بعد الإجازة، لا من حدسٍ هنا. والافتراضُ خاصٌّ للاثنين.
 *
 * **وTikTok بحكم الناشر نفسِه لا بالإعداد وحدَه**: الناشرُ يرسل إلى الصندوق كلَّ منشورٍ
 * حسابُه بلا `video.publish` (`canUploadMedia`) ويتجاهل العلنيّ. فكان صفُّ المقطع يقول
 * «يُنشر للعامّة» والمقطعُ في صندوق التطبيق لا يراه أحد. فـ`tiktok` علنيٌّ حين قُلب **وفي
 * حسابٍ نشطٍ** `video.publish`، و`tiktokInbox` حين لا حسابَ نشطًا به — والصندوقُ يُرسَل إليه
 * المقطعُ **بلا نصّه**، و`tiktokWanted` قرارُ المالك وحدَه ليُقال «قلبتَه وينقص النطاق».
 */
export interface Reach {
  readonly youtube: boolean
  readonly tiktok: boolean
  /** لا حسابَ TikTok نشطًا بـ `video.publish`: يصل المقطعُ صندوقَ التطبيق بلا نصّه. والغائبُ «لا يُعرف». */
  readonly tiktokInbox?: boolean
  /** قلب المالكُ العلنيَّ لـ TikTok — ولو لم يُنشر للعامّة لنقص النطاق. */
  readonly tiktokWanted?: boolean
}

export const PRIVATE_ONLY: Reach = { youtube: false, tiktok: false }

/** و`tiktokScopes` نطاقاتُ حسابات TikTok النشطة كما مُنحت (`activeScopes`) — بلا رمزٍ يُفَكّ. */
export function reachOf(
  settings: { readonly youtubePublic: boolean; readonly tiktokPublic: boolean },
  tiktokScopes: readonly string[],
): Reach {
  const direct = tiktokScopes.some((granted) => canUploadMedia('tiktok', granted))
  return {
    youtube: settings.youtubePublic,
    tiktok: settings.tiktokPublic && direct,
    tiktokInbox: !direct,
    tiktokWanted: settings.tiktokPublic,
  }
}

/** طلب المالكُ العلنيَّ لـ TikTok والحسابُ بلا `video.publish` — فيصل الصندوقَ لا الحساب. */
export function tiktokNeedsScope(reach: Reach): boolean {
  return reach.tiktokWanted === true && reach.tiktokInbox === true
}

/** ما يُقال حين قُلب العلنيّ ونقص النطاق — في صفّ المقطع وإشعار الجدولة والإعداد بنصٍّ واحد. */
export const TIKTOK_NO_SCOPE = 'يصل صندوق تطبيقك لا حسابَك: قلبت النشر العلنيّ وحسابُك المربوط بلا video.publish — اربطه من جديد وامنحه'

/**
 * جملةٌ واحدةٌ لما يصل خاصًّا من هذه المنصّات — أو `null` إن لم يكن فيها ما يصل خاصًّا:
 * لا YouTube ولا TikTok، **أو كلاهما علنيٌّ بقرار المالك وبنطاقه**.
 */
export function privateReach(platforms: readonly string[], reach: Reach = PRIVATE_ONLY): string | null {
  const yt = platforms.includes('youtube') && !reach.youtube
  const tt = platforms.includes('tiktok') && !reach.tiktok
  const noScope = tiktokNeedsScope(reach)
  if (yt && tt) {
    return noScope
      ? `YouTube وTikTok لا يُنشران للعامّة: الأوّل يصل قناتك خاصًّا فتنشره من YouTube Studio، والثاني ${TIKTOK_NO_SCOPE}.`
      : 'YouTube وTikTok لا يُنشران للعامّة: الأوّل يصل قناتك خاصًّا فتنشره من YouTube Studio، والثاني لا يراه غيرك حتّى تنشره من تطبيق TikTok.'
  }
  if (yt) return `YouTube لا يُنشر للعامّة: ${PRIVATE_REACH.youtube}.`
  if (tt) return `TikTok لا يُنشر للعامّة: ${noScope ? TIKTOK_NO_SCOPE : PRIVATE_REACH.tiktok}.`
  return null
}

/**
 * أيصير المقطعُ Short؟ — **YouTube يقرّر وحدَه** (D-190): لا علَمَ في الواجهة يطلبه. يصير
 * Short ما كان رأسيًّا أو مربّعًا ولا يزيد على ثلاث دقائق، وما سواه فيديو عاديّ. فيُقال
 * للمالك ما سيقع بسببه، **ومن المقاسات التي قرأها متصفّحُه**؛ والمجهولُ يُقال مجهولًا.
 */
export type YouTubeShape = 'short' | 'square' | 'long' | 'wide' | 'unknown'

export function youtubeShape(u: Pick<UploadRow, 'width' | 'height' | 'durationMs'>): YouTubeShape {
  const s = u.durationMs === null ? null : u.durationMs / 1000
  if (s !== null && s > 180) return 'long'
  if (u.width === null || u.height === null) return 'unknown'
  if (u.height < u.width) return 'wide'
  if (s === null) return 'unknown'
  return u.height === u.width ? 'square' : 'short'
}

/** الجملةُ الواحدة تحت YouTube — ما سيكونه المقطعُ هناك، وسببُه. */
export const SHAPE_NOTE: Readonly<Record<YouTubeShape, string>> = {
  short: 'يصير Short وحده لأنّه رأسيّ وأقصر من ثلاث دقائق',
  square: 'يصير Short وحده لأنّه مربّع وأقصر من ثلاث دقائق',
  long: 'فيديو عاديّ لأنّه أطول من ثلاث دقائق',
  wide: 'فيديو عاديّ لأنّه أفقيّ',
  unknown: 'يصير Short وحده إن كان رأسيًّا وأقصر من ثلاث دقائق، وإلّا ففيديو عاديّ',
}

/**
 * حدودُ المنصّات الثلاث **من وثائقها** (تُقرأ في D-180) — والمنصّةُ تفحص بعدنا،
 * فما هنا ليمنع رفعًا يُردّ لا ليحلّ محلّ فحصها. والمجهولُ (مدّةٌ لم يقرأها المتصفّح)
 * لا يمنع: يُقال «لم تُقرأ».
 *
 * **ولا يُقال هنا من يرى المقطع** (D-190): كانت ملاحظةُ YouTube وTikTok تحمل «يصل خاصًّا»
 * فتبقى تنبيهًا أبدًا. فالحدودُ هنا، ومن يراه من إعداد المالك (`Reach`) بجانبها.
 */
export function videoChecks(u: Pick<UploadRow, 'mime' | 'bytes' | 'width' | 'height' | 'durationMs'>): VideoCheck[] {
  const s = u.durationMs === null ? null : u.durationMs / 1000
  const nineSixteen = u.width !== null && u.height !== null && Math.abs(u.height / u.width - 16 / 9) < 0.03

  // ‏YouTube لا يردّ مقطعًا بشكله: يصير Short أو فيديو عاديًّا، ويُقال أيَّهما
  const youtube: VideoCheck = { platform: 'youtube', level: 'ok', note: SHAPE_NOTE[youtubeShape(u)] }

  const tiktok: VideoCheck =
    s !== null && s > 600
      ? { platform: 'tiktok', level: 'block', note: 'أطول من عشر دقائق — حدّ الرفع من الواجهة' }
      : s !== null && s < 3
        ? { platform: 'tiktok', level: 'block', note: 'أقصر من ثلاث ثوان' }
        : { platform: 'tiktok', level: 'ok', note: '' }

  const instagram: VideoCheck =
    u.mime === 'video/webm'
      ? { platform: 'instagram', level: 'block', note: 'WebM لا يُقبل — صدّره MP4' }
      : u.bytes > 300 * 1024 * 1024
        ? { platform: 'instagram', level: 'block', note: 'أكبر من ‏300MB' }
        : s !== null && (s < 3 || s > 900)
          ? { platform: 'instagram', level: 'block', note: 'بين ثلاث ثوان وخمس عشرة دقيقة' }
          : u.width !== null && u.width > 1920
            ? { platform: 'instagram', level: 'block', note: 'عرضُه فوق 1920px — صدّره 1080×1920' }
            : u.width !== null && !nineSixteen
              ? { platform: 'instagram', level: 'warn', note: 'Reel — وليس 9:16 فيُقصّ في الخلاصة' }
              : { platform: 'instagram', level: 'ok', note: 'Reel' }

  return [youtube, tiktok, instagram]
}

/** حدُّ نصّ المقطع: TikTok وInstagram بالمحرف، وYouTube بالبايت على وصفه (ما بعد سطر العنوان). */
export const CAPTION_LIMIT: Readonly<Record<'tiktok' | 'instagram', number>> = { tiktok: 2200, instagram: 2200 }
export const YOUTUBE_DESCRIPTION_BYTES = 5000

/**
 * ما يمنع نصَّ مقطعٍ على منصّته — أو `null` (D-182). **وليس حدَّ LinkedIn**: كان اعتمادُ
 * مسوّدةِ مقطعٍ يمرّ بشرط «أربعين محرفًا» الذي وُضع لمنشورٍ مكتوب، فيُردّ وصفٌ قصيرٌ
 * سليمٌ («ثلاثُ طبقاتٍ للحوكمة»). ووصفُ YouTube يُردّ بعد رفع المقطع إن زاد على ‏5000 بايت
 * أو حمل «<» و«>»، فتضيع حصّةُ يومه — فيُقال قبل الاعتماد.
 */
export function captionProblem(platform: VideoPlatform, text: string): string | null {
  if (text.trim() === '') return 'النصّ فارغ'
  // ‏وYouTube يُقاس على ما يُرفع وصفًا (`youtubeDescription`): العنوانُ له حدُّه في `titleProblem`
  const t = platform === 'youtube' ? youtubeDescription(text) : text.trim()
  if (platform === 'youtube') {
    const bytes = new TextEncoder().encode(t).length
    if (bytes > YOUTUBE_DESCRIPTION_BYTES) return `النصّ ${bytes} بايتًا وYouTube تقبل ${YOUTUBE_DESCRIPTION_BYTES} — والحرف العربيّ بايتان`
    if (/[<>]/.test(t)) return 'YouTube لا تقبل «<» ولا «>» في الوصف'
    return null
  }
  const limit = CAPTION_LIMIT[platform]
  return t.length > limit ? `النصّ ${t.length} محرفًا و${platform === 'tiktok' ? 'TikTok' : 'Instagram'} تقبل ${limit}` : null
}

/**
 * نصُّ منشور YouTube من حقليه (D-190): **العنوانُ سطرُه الأوّل** — كما يقرؤه `youtubeTitle`
 * عند الرفع — ثمّ سطرٌ فارغ ثمّ الوصف. فلا عمودَ جديدَ في القاعدة ولا ترحيل: المنشورُ نصٌّ
 * واحدٌ كما كان. **ويُفرَّق عند الرفع بالقاعدة نفسِها**: العنوانُ `youtubeTitle` والوصفُ
 * `youtubeDescription` (ما بعد السطر الأوّل) — فما في حقل «وصف YouTube» هو ما يُرفع وصفًا.
 */
export function youtubeText(title: string, description: string): string {
  const t = title.replace(/[\r\n]+/g, ' ').trim()
  const d = description.replace(/\r\n?/g, '\n').trim()
  return d === '' ? t : `${t}\n\n${d}`
}

/** ما يمنع عنوانَ YouTube — أو `null`. **ويُقال قبل الإنشاء**: عنوانٌ يُقصّ عند الرفع يُكتشَف في القناة. */
export function titleProblem(title: string): string | null {
  const t = title.trim()
  if (t === '') return 'اكتب عنوان YouTube'
  if (t.length > YT_TITLE_MAX) return `عنوان YouTube ‏${t.length} محرفًا وYouTube تقبل ${YT_TITLE_MAX}`
  if (/[<>]/.test(t)) return 'YouTube لا تقبل «<» ولا «>» في العنوان'
  return null
}

export function isVideoPlatform(p: string): p is VideoPlatform {
  return (VIDEO_PLATFORMS as readonly string[]).includes(p)
}

/** ما يُنسخ من صفّ المقطع إلى صفّ الوسيط. */
export type UploadFacts = { r2_key: string; mime: string; bytes: number; width: number | null; height: number | null; duration_ms: number | null }

export async function readyUpload(db: Db, org: string, uploadId: string): Promise<UploadFacts | null> {
  return db
    .prepare('SELECT r2_key, mime, bytes, width, height, duration_ms FROM uploads WHERE id = ? AND org_id = ? AND status = ?')
    .bind(uploadId, org, 'ready')
    .first<UploadFacts>()
}

/** صفُّ وسيطٍ من مقطع المالك لمنشور — يكتبه «فيديوهاتك» واستيرادُ الخطّة بصيغةٍ واحدة. */
export function uploadMediaRow(db: Db, postId: string, uploadId: string, u: UploadFacts): DbStatement {
  return db
    .prepare(
      `INSERT INTO media (id, post_id, r2_key, mime, bytes, prompt, model, cost_usd, status, idempotency_key,
                          width, height, upload_id, duration_ms, org_id)
       VALUES (?1, ?2, ?3, ?4, ?5, '', 'upload', 0, 'ready', ?6, ?7, ?8, ?9, ?10,
               (SELECT org_id FROM posts WHERE id = ?2))`,
    )
    .bind(crypto.randomUUID(), postId, u.r2_key, u.mime, u.bytes, `upload:${uploadId}:${postId}`,
      u.width, u.height, uploadId, u.duration_ms)
}

export type PostsResult =
  | { readonly ok: true; readonly created: readonly VideoPlatform[]; readonly skipped: readonly VideoPlatform[] }
  | { readonly ok: false; readonly reason: string }

/**
 * منشورٌ لكلّ منصّةٍ من المقطع — **بالنصّ الذي كتبه المالك أو راجعه، وباعتماده إن طلبه**.
 *
 * والاعتمادُ هنا اعتمادٌ حقيقيّ: المالكُ كتب النصَّ (أو قرأ ما كُتب له في حقولٍ يحرّرها)
 * ورفع المقطعَ وضغط «اعتمد». ويبقى الموعدُ والحسابُ لخطوة الجدولة، فلا يُنشر شيءٌ بلا موعدٍ
 * يختاره. و`idempotency_key` للمنشور `upload:<مقطع>:<منصّة>`: ضغطتان لا تصنعان منشورين.
 *
 * **ونصّان لا نصٌّ واحد** (D-190): `caption` نصٌّ واحدٌ لكلّ المنصّات كما كان — ونموذجٌ قديمٌ
 * أو بلا سكربت يبقى يعمل به — و`captions` لكلّ منصّةٍ نصُّها، وعنوانُ YouTube في `title`
 * حقلًا وحدَه. فمن وُجدت `captions` قُرئ منها وحدَها، ونصٌّ فارغٌ لمنصّةٍ اختارها يُردّ باسمها.
 */
export async function postsFromUpload(
  db: Db,
  input: {
    /** منظّمةُ الجلسة — المقطعُ ومنشوراتُه فيها وحدَها (D-277). */
    readonly org: string
    readonly uploadId: string
    readonly platforms: readonly string[]
    readonly caption?: string
    readonly captions?: Partial<Readonly<Record<VideoPlatform, string>>>
    readonly title?: string
    readonly approve: boolean
    readonly by: string
    /** من كتب النصوص: `owner` بيده، أو اسمُ النموذج حين كُتبت له وراجعها (D-190). */
    readonly model?: string
    /**
     * حصّةُ كلّ منشورٍ من كلفة كتابة نصوصه (D-190) — في `posts.cost_usd` كما تكتبها مسوّدةُ
     * المصدر والفكرة، **والدفترُ باسم المقطع** فلا تُعَدّ مرّتين. وبلا نموذجٍ لا كلفة.
     */
    readonly cost?: number
  },
): Promise<PostsResult> {
  // ‏والأسطرُ «\n» وحدها: المتصفّحُ يرسل المربّعَ بـ «\r\n»، فكان الوصفُ يُنشَر حاملًا «\r»
  const clean = (t: string): string => t.replace(/\r\n?/g, '\n').trim()
  const perPlatform = input.captions !== undefined
  const caption = clean(input.caption ?? '')
  if (!perPlatform && caption === '') return { ok: false, reason: 'اكتب نصّ المنشور — يُنشر وصفًا مع المقطع' }
  const textOf = (p: VideoPlatform): string => !perPlatform
    ? caption
    : p === 'youtube'
      ? youtubeText(input.title ?? '', input.captions?.youtube ?? '')
      : clean(input.captions?.[p] ?? '')
  const row = await db
    .prepare('SELECT id, r2_key, mime, bytes, width, height, duration_ms, status FROM uploads WHERE id = ? AND org_id = ?')
    .bind(input.uploadId, input.org)
    .first<{ id: string; r2_key: string; mime: string; bytes: number; width: number | null; height: number | null; duration_ms: number | null; status: string }>()
  if (row === null || row.status !== 'ready') return { ok: false, reason: 'المقطع لم يكتمل رفعُه' }

  const checks = videoChecks({ mime: row.mime, bytes: row.bytes, width: row.width, height: row.height, durationMs: row.duration_ms })
  const wanted = VIDEO_PLATFORMS.filter((p) => input.platforms.includes(p))
  if (wanted.length === 0) return { ok: false, reason: 'اختر منصّةً واحدةً على الأقلّ' }
  const allowed = wanted.filter((p) => checks.find((c) => c.platform === p)?.level !== 'block')
  if (allowed.length === 0) return { ok: false, reason: 'المقطع لا يوافق حدود ما اخترت — والسبب تحت كلّ منصّة' }

  // ‏ولكلّ منصّةٍ سببُها باسمها حين تختلف نصوصُها — «النصُّ فارغ» وحدَها لا تقول أيَّها
  const label = (p: VideoPlatform): string => (p === 'youtube' ? 'YouTube' : p === 'tiktok' ? 'TikTok' : 'Instagram')
  const tooLong = allowed
    .map((p) => {
      if (!perPlatform) return { p, why: captionProblem(p, caption) }
      const title = p === 'youtube' ? titleProblem(input.title ?? '') : null
      if (title !== null) return { p, why: title }
      const why = textOf(p) === '' ? 'النصّ فارغ' : captionProblem(p, textOf(p))
      return { p, why: why === null ? null : `${label(p)}: ${why}` }
    })
    .filter((x): x is { p: VideoPlatform; why: string } => x.why !== null)
  if (tooLong.length > 0) return { ok: false, reason: tooLong.map((x) => x.why).join('؛ ') }

  const media = { r2_key: row.r2_key, mime: row.mime, bytes: row.bytes, width: row.width, height: row.height, duration_ms: row.duration_ms }
  const created: VideoPlatform[] = []
  const skipped: VideoPlatform[] = []
  for (const platform of allowed) {
    const key = `upload:${row.id}:${platform}`
    const exists = await db
      .prepare('SELECT id, status FROM posts WHERE idempotency_key = ? AND org_id = ?')
      .bind(key, input.org)
      .first<{ id: string; status: string }>()
    if (exists !== null && exists.status !== 'rejected') {
      // ‏منشورٌ بلا مقطعه (كُتب قبل أن تصير الكتابةُ ذرّيّة): يُكمَّل ولا يُكرَّر
      const has = await db.prepare('SELECT 1 AS x FROM media WHERE post_id = ? AND upload_id = ? AND org_id = ?').bind(exists.id, row.id, input.org).first()
      if (has === null) await uploadMediaRow(db, exists.id, row.id, media).run()
      skipped.push(platform)
      continue
    }
    const postId = crypto.randomUUID()
    const statements: DbStatement[] = []
    if (exists !== null) {
      // ‏رفضه المالكُ ليبدأ من جديد: المرفوضُ يبقى سجلًّا، ومفتاحُه يُحرَّر (كـ D-088)
      statements.push(db
        .prepare(`UPDATE posts SET idempotency_key = idempotency_key || ':rejected:' || id WHERE id = ? AND org_id = ?`)
        .bind(exists.id, input.org))
    }
    statements.push(db
      .prepare(
        `INSERT INTO posts (id, platform, type, text, status, idempotency_key, model, cost_usd, approved_by, approved_at,
                            org_id, brand_id)
         VALUES (?, ?, 'text', ?, ?, ?, ?, ?, ?, ${input.approve ? "datetime('now')" : 'NULL'},
                 -- ‏منظّمة المقطع المرفوع وعلامتُه
                 (SELECT org_id FROM uploads WHERE id = ?), (SELECT brand_id FROM uploads WHERE id = ?))`,
      )
      .bind(postId, platform, textOf(platform), input.approve ? 'approved' : 'draft', key, input.model ?? 'owner',
        Number.isFinite(input.cost) && (input.cost ?? 0) > 0 ? input.cost : 0,
        input.approve ? input.by : null, row.id, row.id))
    // ‏المنشورُ ووسيطُه معًا أو لا شيء: خطأٌ بينهما كان يترك منشورًا بلا مقطعه ومفتاحُه محجوز
    statements.push(uploadMediaRow(db, postId, row.id, media))
    await atomically(db, statements)
    created.push(platform)
  }
  return { ok: true, created, skipped }
}

/**
 * عنوانُ YouTube إن قُصّ (ر-4) — **بقاعدة الرفع نفسِها** (`youtubeTitle`)، فما يُقال هو ما
 * يُرفع. كان السطرُ الأوّلُ يُقصّ عند ‏100 محرفٍ بلا إخبار، فلا يعرفه المالكُ إلّا من قناته.
 * و«<» و«>» لا يبلغان هنا: `captionProblem` يردّهما قبل الإنشاء.
 */
export function cutTitle(caption: string): string | null {
  const line = caption.trim().split('\n')[0]?.trim() ?? ''
  return line.length > YT_TITLE_MAX ? youtubeTitle(caption) : null
}

export interface UploadSchedule {
  readonly scheduled: readonly string[]
  /** ما رُدّ بمنصّته وسببه — يُسمّى في الإشعار ولا يُجمَع في «تعثّر بعضُها». */
  readonly failed: readonly { readonly platform: string; readonly reason: string }[]
}

/**
 * منشوراتُ المقطع المعتمَدةُ إلى موعدٍ واحد (ر-4) — **بـ `schedulePost` واحدًا واحدًا**،
 * كتوزيع المعتمَد: لا كتابةَ `queued` من هنا، فحرّاسُ الجدولة كلُّها في موضعها (D-019).
 *
 * كان المالكُ بعد «أنشئ المنشورات» يبحث عن ثلاث بطاقاتٍ متباعدة ويجدول كلًّا وحدها،
 * و«وزّع المعتمَد» يخلطها بغيرها بفاصل ساعةٍ على الأقلّ. و`shown` معرّفاتُ ما عرضه صفُّ
 * المقطع: **ما لم يُعرَض لا يُجدوَل** (D-182). والحسابُ يُحسب هنا ولا يُقرأ من النموذج:
 * أوّلُ حسابٍ نشطٍ على المنصّة، وصفحةُ الشركة لا تُختار (D-087).
 */
export async function scheduleFromUpload(
  db: Db,
  input: {
    /** منظّمةُ الجلسة (D-277). */
    readonly org: string
    readonly uploadId: string
    readonly shown: readonly string[]
    readonly accounts: readonly LinkedAccount[]
    readonly at: Date
    readonly now: Date
  },
): Promise<UploadSchedule> {
  const { results } = await db
    .prepare(
      `SELECT p.id, p.platform FROM media m JOIN posts p ON p.id = m.post_id AND p.org_id = m.org_id
        WHERE m.upload_id = ? AND m.org_id = ? AND p.status IN ('approved', 'edited') ORDER BY p.created_at, p.id`,
    )
    .bind(input.uploadId, input.org)
    .all<{ id: string; platform: string }>()
  const when = input.at.toISOString().slice(0, 16)
  const scheduled: string[] = []
  const failed: { platform: string; reason: string }[] = []
  // ‏بترتيب المنصّات الثابت لا بترتيب الكتابة: الإشعارُ يقول «YouTube وInstagram» كلَّ مرّة
  const rank = (p: string): number => (VIDEO_PLATFORMS as readonly string[]).indexOf(p)
  const wanted = results.filter((p) => input.shown.includes(p.id)).sort((a, b) => rank(a.platform) - rank(b.platform))
  for (const post of wanted) {
    // ‏وصفحةُ LinkedIn وحدَها تُستبعَد: قناةُ YouTube محفوظةٌ `org` وهي وجهةٌ صالحة
    const account = input.accounts.find((a) => a.platform === post.platform && a.status === 'active' && !isLinkedInPage(a))
    if (account === undefined) {
      failed.push({ platform: post.platform, reason: 'لا حساب متّصلًا — اربطه أوّلًا' })
      continue
    }
    const done = await schedulePost(db, post.id, account.id, when, input.now)
    if (done.ok) scheduled.push(post.platform)
    else failed.push({ platform: post.platform, reason: done.reason })
  }
  return { scheduled, failed }
}

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
import { YT_TITLE_MAX, youtubeTitle } from '../publish/youtube'

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
  bucket: MultipartBucket,
  meta: UploadMeta,
  id: string = crypto.randomUUID(),
): Promise<StartResult> {
  if (!UPLOAD_MIMES.has(meta.mime)) {
    return { ok: false, reason: 'نوعٌ لا تقبله المنصّات — صدّره MP4 (H.264 وصوت AAC)' }
  }
  if (!Number.isFinite(meta.bytes) || meta.bytes <= 0) return { ok: false, reason: 'ملفٌّ فارغ' }
  if (meta.bytes > MAX_UPLOAD_BYTES) {
    return { ok: false, reason: `أكبرُ من ${MAX_UPLOAD_BYTES / 1024 / 1024}MB — صدّره بدقّة 1080p وجودةٍ أقلّ` }
  }
  const key = `upload/${id}.${extension(meta.mime)}`
  const upload = await bucket.createMultipartUpload(key, { httpMetadata: { contentType: meta.mime } })
  await db
    .prepare(
      `INSERT INTO uploads (id, r2_key, name, mime, bytes, width, height, duration_ms, status, multipart_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'uploading', ?)`,
    )
    .bind(id, key, cleanName(meta.name), meta.mime, Math.round(meta.bytes),
      positive(meta.width), positive(meta.height), positive(meta.durationMs), upload.uploadId)
    .run()
  return { ok: true, id, partBytes: PART_BYTES, parts: Math.ceil(meta.bytes / PART_BYTES) }
}

interface Pending {
  readonly r2_key: string
  readonly bytes: number
  readonly status: string
  readonly multipart_id: string | null
}

async function pending(db: Db, id: string): Promise<Pending | null> {
  return db
    .prepare('SELECT r2_key, bytes, status, multipart_id FROM uploads WHERE id = ?')
    .bind(id)
    .first<Pending>()
}

/**
 * قطعةٌ واحدة — **ورقمُها وطولُها يُفحَصان**: قطعةٌ أطولُ من حجمها أو خارج العدد
 * تُردّ، فلا يُجمَّع في R2 كائنٌ غيرُ الذي أُعلن.
 */
export async function uploadPart(
  db: Db,
  bucket: MultipartBucket,
  id: string,
  partNumber: number,
  body: ArrayBuffer,
): Promise<{ ok: true; part: { partNumber: number; etag: string } } | { ok: false; reason: string }> {
  const row = await pending(db, id)
  if (row === null || row.status !== 'uploading' || row.multipart_id === null) {
    return { ok: false, reason: 'لا رفعَ جاريًا بهذا المعرّف' }
  }
  const parts = Math.ceil(row.bytes / PART_BYTES)
  if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > parts) {
    return { ok: false, reason: 'رقمُ قطعةٍ خارج المقطع' }
  }
  const expected = partNumber < parts ? PART_BYTES : row.bytes - PART_BYTES * (parts - 1)
  if (body.byteLength !== expected) return { ok: false, reason: 'طولُ القطعة غيرُ ما أُعلن' }
  const part = await bucket.resumeMultipartUpload(row.r2_key, row.multipart_id).uploadPart(partNumber, body)
  return { ok: true, part }
}

/** يجمع القطعَ في R2 ويعلن المقطعَ جاهزًا — **وكلُّ القطع حاضرةٌ أو لا شيء**. */
export async function completeUpload(
  db: Db,
  bucket: MultipartBucket,
  id: string,
  parts: readonly { partNumber: number; etag: string }[],
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const row = await pending(db, id)
  if (row === null || row.status !== 'uploading' || row.multipart_id === null) {
    return { ok: false, reason: 'لا رفعَ جاريًا بهذا المعرّف' }
  }
  const count = Math.ceil(row.bytes / PART_BYTES)
  const numbers = new Set(parts.map((p) => p.partNumber))
  if (parts.length !== count || numbers.size !== count || parts.some((p) => typeof p.etag !== 'string' || p.etag === '')) {
    return { ok: false, reason: 'قطعٌ ناقصة — أعد الرفع' }
  }
  await bucket.resumeMultipartUpload(row.r2_key, row.multipart_id)
    .complete([...parts].sort((a, b) => a.partNumber - b.partNumber))
  await db
    .prepare(`UPDATE uploads SET status = 'ready', multipart_id = NULL, ready_at = datetime('now') WHERE id = ?`)
    .bind(id)
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
    .prepare(`SELECT id, r2_key, multipart_id FROM uploads WHERE status = 'uploading' AND created_at < ? LIMIT 50`)
    .bind(cutoff)
    .all<{ id: string; r2_key: string; multipart_id: string | null }>()
  for (const row of results) {
    if (row.multipart_id !== null) {
      await Promise.resolve()
        .then(() => bucket.resumeMultipartUpload(row.r2_key, row.multipart_id!).abort())
        .catch(() => undefined)
    }
    await db.prepare(`UPDATE uploads SET status = 'failed', multipart_id = NULL WHERE id = ? AND status = 'uploading'`).bind(row.id).run()
  }
  return results.length
}

/** يلغي رفعًا لم يكتمل — R2 يحذف قطعه، والصفُّ يُعلَّم فاشلًا لا يُمحى. */
export async function abortUpload(db: Db, bucket: MultipartBucket, id: string): Promise<void> {
  const row = await pending(db, id)
  if (row === null || row.status !== 'uploading' || row.multipart_id === null) return
  await bucket.resumeMultipartUpload(row.r2_key, row.multipart_id).abort().catch(() => undefined)
  await db.prepare(`UPDATE uploads SET status = 'failed', multipart_id = NULL WHERE id = ?`).bind(id).run()
}

/** ‏ترتيبُ المكتبة ونافذتُها — **نصٌّ واحدٌ للنداءين**: المقاطعُ ومنشوراتُها من النافذة نفسِها. */
const LIBRARY = `SELECT id FROM uploads WHERE status != 'failed' ORDER BY created_at DESC, id LIMIT ?`

interface LibraryRow {
  id: string; r2_key: string; name: string; mime: string; bytes: number; width: number | null
  height: number | null; duration_ms: number | null; status: UploadRow['status']; created_at: string
}

export async function listUploads(db: Db, limit = 20): Promise<UploadRow[]> {
  let results: LibraryRow[]
  try {
    results = (await db
      .prepare(
        // ‏ووقتُ المقطع وقتُ اكتماله إن اكتمل: «رُفع قبل ساعة» لا «بدأ رفعُه»
        `SELECT u.id, u.r2_key, u.name, u.mime, u.bytes, u.width, u.height, u.duration_ms, u.status,
                COALESCE(u.ready_at, u.created_at) AS created_at
           FROM uploads u WHERE u.id IN (${LIBRARY})
          ORDER BY u.created_at DESC, u.id`,
      )
      .bind(limit)
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
  let made: { upload_id: string; id: string; platform: string; status: string }[] = []
  if (results.length > 0) {
    try {
      made = (await db
        .prepare(
          `SELECT m.upload_id, p.id, p.platform, p.status FROM media m JOIN posts p ON p.id = m.post_id
            WHERE m.upload_id IN (${LIBRARY}) AND p.status != 'rejected'
            ORDER BY p.created_at DESC, p.id`,
        )
        .bind(limit)
        .all<{ upload_id: string; id: string; platform: string; status: string }>()).results
    } catch (error) {
      console.error({ job: 'uploads.list', posts_failed: String(error).slice(0, 200) })
    }
  }
  return results.map((r) => ({
    id: r.id, r2Key: r.r2_key, name: r.name, mime: r.mime, bytes: r.bytes, width: r.width, height: r.height,
    durationMs: r.duration_ms, status: r.status, createdAt: r.created_at,
    posts: made.filter((m) => m.upload_id === r.id).map((m) => ({ id: m.id, platform: m.platform, status: m.status })),
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
 * **ما لا يُنشر للعامّة** — YouTube يُرفع `private` دائمًا (`YT_PRIVACY`)، وTikTok
 * `SELF_ONLY` أو صندوقَ التطبيق. كان يُقال في صفحة المنصّة وحدها، وتقول بطاقةُ المقطع
 * «Short ●» بالأخضر، فيجدول المالكُ وهو يظنّه سيُنشر للناس (ر-4). فيُقال حيث يقرّر:
 * تحت المنصّة قبل الإنشاء، وفي صفّ الجدولة، وفي إشعار ما بعدهما.
 */
export const PRIVATE_REACH: Readonly<Record<'youtube' | 'tiktok', string>> = {
  youtube: 'يصل قناتك خاصًّا — تنشره أنت من YouTube Studio',
  tiktok: 'لا يراه غيرك حتّى تنشره أنت من تطبيق TikTok',
}

/** جملةٌ واحدةٌ لما يصل خاصًّا من هذه المنصّات — أو `null` إن لم يكن فيها YouTube ولا TikTok. */
export function privateReach(platforms: readonly string[]): string | null {
  const yt = platforms.includes('youtube')
  const tt = platforms.includes('tiktok')
  if (yt && tt) {
    return 'YouTube وTikTok لا يُنشران للعامّة: الأوّلُ يصل قناتك خاصًّا فتنشره من YouTube Studio، والثاني لا يراه غيرك حتّى تنشره من تطبيق TikTok.'
  }
  if (yt) return `YouTube لا يُنشر للعامّة: ${PRIVATE_REACH.youtube}.`
  if (tt) return `TikTok لا يُنشر للعامّة: ${PRIVATE_REACH.tiktok}.`
  return null
}

/**
 * حدودُ المنصّات الثلاث **من وثائقها** (تُقرأ في D-180) — والمنصّةُ تفحص بعدنا،
 * فما هنا ليمنع رفعًا يُردّ لا ليحلّ محلّ فحصها. والمجهولُ (مدّةٌ لم يقرأها المتصفّح)
 * لا يمنع: يُقال «لم تُقرأ».
 */
export function videoChecks(u: Pick<UploadRow, 'mime' | 'bytes' | 'width' | 'height' | 'durationMs'>): VideoCheck[] {
  const s = u.durationMs === null ? null : u.durationMs / 1000
  const vertical = u.width !== null && u.height !== null ? u.height >= u.width : null
  const nineSixteen = u.width !== null && u.height !== null && Math.abs(u.height / u.width - 16 / 9) < 0.03

  // ‏YouTube وTikTok تنبيهٌ دائمًا لا أخضر: يصلان خاصَّين، والمالكُ ينشرهما بيده (PRIVATE_REACH)
  const kind = s !== null && s > 180
    ? 'أطولُ من ثلاث دقائق فيُنشر فيديو عاديًّا لا Short'
    : vertical === false
      ? 'أفقيٌّ فيُنشر فيديو عاديًّا لا Short'
      : s === null ? 'Short إن كان رأسيًّا ودون ثلاث دقائق' : 'Short'
  const youtube: VideoCheck = { platform: 'youtube', level: 'warn', note: `${kind} · ${PRIVATE_REACH.youtube}` }

  const tiktok: VideoCheck =
    s !== null && s > 600
      ? { platform: 'tiktok', level: 'block', note: 'أطولُ من عشر دقائق — حدُّ الرفع من الواجهة' }
      : s !== null && s < 3
        ? { platform: 'tiktok', level: 'block', note: 'أقصرُ من ثلاث ثوانٍ' }
        : { platform: 'tiktok', level: 'warn', note: PRIVATE_REACH.tiktok }

  const instagram: VideoCheck =
    u.mime === 'video/webm'
      ? { platform: 'instagram', level: 'block', note: 'WebM لا يُقبل — صدّره MP4' }
      : u.bytes > 300 * 1024 * 1024
        ? { platform: 'instagram', level: 'block', note: 'أكبرُ من ‏300MB' }
        : s !== null && (s < 3 || s > 900)
          ? { platform: 'instagram', level: 'block', note: 'بين ثلاث ثوانٍ وخمسَ عشرةَ دقيقة' }
          : u.width !== null && u.width > 1920
            ? { platform: 'instagram', level: 'block', note: 'عرضُه فوق 1920px — صدّره 1080×1920' }
            : u.width !== null && !nineSixteen
              ? { platform: 'instagram', level: 'warn', note: 'ليس 9:16 — يُقصّ في الخلاصة' }
              : { platform: 'instagram', level: 'ok', note: 'Reel' }

  return [youtube, tiktok, instagram]
}

/** حدُّ نصّ المقطع: TikTok وInstagram بالمحرف، وYouTube بالبايت لأنّ النصَّ وصفُه. */
export const CAPTION_LIMIT: Readonly<Record<'tiktok' | 'instagram', number>> = { tiktok: 2200, instagram: 2200 }
export const YOUTUBE_DESCRIPTION_BYTES = 5000

/**
 * ما يمنع نصَّ مقطعٍ على منصّته — أو `null` (D-182). **وليس حدَّ LinkedIn**: كان اعتمادُ
 * مسوّدةِ مقطعٍ يمرّ بشرط «أربعين محرفًا» الذي وُضع لمنشورٍ مكتوب، فيُردّ وصفٌ قصيرٌ
 * سليمٌ («ثلاثُ طبقاتٍ للحوكمة»). ووصفُ YouTube يُردّ بعد رفع المقطع إن زاد على ‏5000 بايت
 * أو حمل «<» و«>»، فتضيع حصّةُ يومه — فيُقال قبل الاعتماد.
 */
export function captionProblem(platform: VideoPlatform, text: string): string | null {
  const t = text.trim()
  if (t === '') return 'النصُّ فارغ'
  if (platform === 'youtube') {
    const bytes = new TextEncoder().encode(t).length
    if (bytes > YOUTUBE_DESCRIPTION_BYTES) return `النصُّ ${bytes} بايتًا وYouTube تقبل ${YOUTUBE_DESCRIPTION_BYTES} — والحرفُ العربيُّ بايتان`
    if (/[<>]/.test(t)) return 'YouTube لا تقبل «<» ولا «>» في الوصف'
    return null
  }
  const limit = CAPTION_LIMIT[platform]
  return t.length > limit ? `النصُّ ${t.length} محرفًا و${platform === 'tiktok' ? 'TikTok' : 'Instagram'} تقبل ${limit}` : null
}

export function isVideoPlatform(p: string): p is VideoPlatform {
  return (VIDEO_PLATFORMS as readonly string[]).includes(p)
}

/** ما يُنسخ من صفّ المقطع إلى صفّ الوسيط. */
export type UploadFacts = { r2_key: string; mime: string; bytes: number; width: number | null; height: number | null; duration_ms: number | null }

export async function readyUpload(db: Db, uploadId: string): Promise<UploadFacts | null> {
  return db
    .prepare('SELECT r2_key, mime, bytes, width, height, duration_ms FROM uploads WHERE id = ? AND status = ?')
    .bind(uploadId, 'ready')
    .first<UploadFacts>()
}

/** صفُّ وسيطٍ من مقطع المالك لمنشور — يكتبه «فيديوهاتك» واستيرادُ الخطّة بصيغةٍ واحدة. */
export function uploadMediaRow(db: Db, postId: string, uploadId: string, u: UploadFacts): DbStatement {
  return db
    .prepare(
      `INSERT INTO media (id, post_id, r2_key, mime, bytes, prompt, model, cost_usd, status, idempotency_key,
                          width, height, upload_id, duration_ms)
       VALUES (?, ?, ?, ?, ?, '', 'upload', 0, 'ready', ?, ?, ?, ?, ?)`,
    )
    .bind(crypto.randomUUID(), postId, u.r2_key, u.mime, u.bytes, `upload:${uploadId}:${postId}`,
      u.width, u.height, uploadId, u.duration_ms)
}

export type PostsResult =
  | { readonly ok: true; readonly created: readonly VideoPlatform[]; readonly skipped: readonly VideoPlatform[] }
  | { readonly ok: false; readonly reason: string }

/**
 * منشورٌ لكلّ منصّةٍ من المقطع — **بالنصّ الذي كتبه المالك، وباعتماده إن طلبه**.
 *
 * والاعتمادُ هنا اعتمادٌ حقيقيّ: المالكُ كتب النصَّ ورفع المقطعَ وضغط «اعتمد» — لا
 * نموذجَ بينهما. ويبقى الموعدُ والحسابُ لخطوة الجدولة، فلا يُنشر شيءٌ بلا موعدٍ يختاره.
 * و`idempotency_key` للمنشور `upload:<مقطع>:<منصّة>`: ضغطتان لا تصنعان منشورين.
 */
export async function postsFromUpload(
  db: Db,
  input: {
    readonly uploadId: string
    readonly platforms: readonly string[]
    readonly caption: string
    readonly approve: boolean
    readonly by: string
  },
): Promise<PostsResult> {
  // ‏والأسطرُ «\n» وحدها: المتصفّحُ يرسل المربّعَ بـ «\r\n»، فكان الوصفُ يُنشَر حاملًا «\r»
  const caption = input.caption.replace(/\r\n?/g, '\n').trim()
  if (caption === '') return { ok: false, reason: 'اكتب نصَّ المنشور — يُنشر وصفًا مع المقطع' }
  const row = await db
    .prepare('SELECT id, r2_key, mime, bytes, width, height, duration_ms, status FROM uploads WHERE id = ?')
    .bind(input.uploadId)
    .first<{ id: string; r2_key: string; mime: string; bytes: number; width: number | null; height: number | null; duration_ms: number | null; status: string }>()
  if (row === null || row.status !== 'ready') return { ok: false, reason: 'المقطعُ لم يكتمل رفعُه' }

  const checks = videoChecks({ mime: row.mime, bytes: row.bytes, width: row.width, height: row.height, durationMs: row.duration_ms })
  const wanted = VIDEO_PLATFORMS.filter((p) => input.platforms.includes(p))
  if (wanted.length === 0) return { ok: false, reason: 'اختر منصّةً واحدةً على الأقلّ' }
  const allowed = wanted.filter((p) => checks.find((c) => c.platform === p)?.level !== 'block')
  if (allowed.length === 0) return { ok: false, reason: 'المقطعُ لا يوافق حدودَ ما اخترت — والسببُ تحت كلّ منصّة' }

  const tooLong = allowed
    .map((p) => ({ p, why: captionProblem(p, caption) }))
    .filter((x): x is { p: VideoPlatform; why: string } => x.why !== null)
  if (tooLong.length > 0) return { ok: false, reason: tooLong.map((x) => x.why).join('؛ ') }

  const media = { r2_key: row.r2_key, mime: row.mime, bytes: row.bytes, width: row.width, height: row.height, duration_ms: row.duration_ms }
  const created: VideoPlatform[] = []
  const skipped: VideoPlatform[] = []
  for (const platform of allowed) {
    const key = `upload:${row.id}:${platform}`
    const exists = await db
      .prepare('SELECT id, status FROM posts WHERE idempotency_key = ?')
      .bind(key)
      .first<{ id: string; status: string }>()
    if (exists !== null && exists.status !== 'rejected') {
      // ‏منشورٌ بلا مقطعه (كُتب قبل أن تصير الكتابةُ ذرّيّة): يُكمَّل ولا يُكرَّر
      const has = await db.prepare('SELECT 1 AS x FROM media WHERE post_id = ? AND upload_id = ?').bind(exists.id, row.id).first()
      if (has === null) await uploadMediaRow(db, exists.id, row.id, media).run()
      skipped.push(platform)
      continue
    }
    const postId = crypto.randomUUID()
    const statements: DbStatement[] = []
    if (exists !== null) {
      // ‏رفضه المالكُ ليبدأ من جديد: المرفوضُ يبقى سجلًّا، ومفتاحُه يُحرَّر (كـ D-088)
      statements.push(db
        .prepare(`UPDATE posts SET idempotency_key = idempotency_key || ':rejected:' || id WHERE id = ?`)
        .bind(exists.id))
    }
    statements.push(db
      .prepare(
        `INSERT INTO posts (id, platform, type, text, status, idempotency_key, model, approved_by, approved_at)
         VALUES (?, ?, 'text', ?, ?, ?, 'owner', ?, ${input.approve ? "datetime('now')" : 'NULL'})`,
      )
      .bind(postId, platform, caption, input.approve ? 'approved' : 'draft', key, input.approve ? input.by : null))
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
    readonly uploadId: string
    readonly shown: readonly string[]
    readonly accounts: readonly LinkedAccount[]
    readonly at: Date
    readonly now: Date
  },
): Promise<UploadSchedule> {
  const { results } = await db
    .prepare(
      `SELECT p.id, p.platform FROM media m JOIN posts p ON p.id = m.post_id
        WHERE m.upload_id = ? AND p.status IN ('approved', 'edited') ORDER BY p.created_at, p.id`,
    )
    .bind(input.uploadId)
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
      failed.push({ platform: post.platform, reason: 'لا حسابَ متّصلًا — اربطه أوّلًا' })
      continue
    }
    const done = await schedulePost(db, post.id, account.id, when, input.now)
    if (done.ok) scheduled.push(post.platform)
    else failed.push({ platform: post.platform, reason: done.reason })
  }
  return { scheduled, failed }
}

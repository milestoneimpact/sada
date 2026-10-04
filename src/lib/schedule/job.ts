/**
 * الجدولةُ والإرسال — الحلقةُ التي كانت مفقودة بين الاعتماد والنشر.
 *
 * ## الاعتمادُ حكمٌ على النصّ، والجدولةُ قرارٌ في المكان والزمان
 *
 * فُصلا عمدا. فالمالك قد يعتمد نصّا وهو غيرُ عازمٍ على نشره الآن، وقد
 * يعتمده قبل أن تُربَط قناتُه أصلا. وضغطةٌ واحدة تفعل الاثنين تجعل
 * «أعجبني هذا النصّ» تعني «انشره» — وهما ليسا الشيء نفسه.
 *
 * ## والقاعدةُ هي التي تفرض، لا هذه الشيفرة
 *
 * ثلاثةُ قيودٍ في `posts` تمنع `queued` بلا اعتمادٍ ولا حسابٍ ولا موعد
 * (D-009 و 0008). فما هنا **حراسةٌ تسبقها لتعطيَ سببا يُقرأ** — لا
 * حراسةٌ تنوب عنها. ولو حُذف كلُّ سطرٍ في هذا الملفّ لبقيت القاعدة ترفض.
 *
 * ## وخَتمُ الإرسال يفصل معنيين
 *
 * `queued` بلا `dispatched_at` ينتظر موعده، وبه غادر إلى الطابور. ودورةُ
 * Cron تدور كلّ ربع ساعة، فبلا الخَتم ترسل الثانيةُ ما أرسلته الأولى.
 */
import { blockerReason, checkAllowance } from '../limits'
import type { Db } from '../tokens'
import { missingMedia } from './media'

export type ScheduleResult =
  | {
      readonly ok: true
      readonly at: string
      readonly account: string
      /** منصّةُ المنشور — يُقال بها التأكيد («جُدولت على TikTok»). وفارغةٌ لما ليس جدولة. */
      readonly platform: string
    }
  | { readonly ok: false; readonly reason: string }

/** موعدٌ مقروءٌ من نموذج HTML: `datetime-local` بلا منطقة. يُقرأ UTC. */
export function parseWhen(raw: string): string | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  // `2026-09-08T09:00` أو بثوانٍ. وما عداه يُردّ ولا يُخمَّن
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(trimmed)) return null
  const withSeconds = trimmed.length === 16 ? `${trimmed}:00` : trimmed
  const date = new Date(`${withSeconds}Z`)
  if (Number.isNaN(date.getTime())) return null
  // الشكلُ الذي يكتبه SQLite: `datetime('now')` — فالمقارنةُ نصّيّةٌ تصحّ
  return withSeconds.replace('T', ' ')
}

/** «الآن» بصيغة القاعدة نفسها، فلا تُقارَن صيغتان. */
export function dbNow(now: Date): string {
  return now.toISOString().slice(0, 19).replace('T', ' ')
}

interface PostRow {
  id: string
  platform: string
  status: string
}

interface AccountRow {
  id: string
  platform: string
  status: string
  display_name: string
}

/**
 * يجدول منشورا معتمَدا إلى حسابٍ وموعد.
 *
 * وكلُّ ردٍّ هنا **سببٌ يُقرأ**: مالكٌ يرى «تعذّرت الجدولة» لا يعرف أيّ
 * الأربعة وقع، فيجرّب الأربعة.
 */
export async function schedulePost(
  db: Db,
  postId: string,
  accountId: string,
  when: string,
  now: Date,
): Promise<ScheduleResult> {
  const post = await db
    .prepare('SELECT id, platform, status FROM posts WHERE id = ?')
    .bind(postId)
    .first<PostRow>()
  if (post === null) return { ok: false, reason: 'لا منشور بهذا المعرّف' }

  // المعتمَدُ وحده يُجدول: المسوّدةُ لم تُقرأ، والمجدولُ له موعدٌ يُسحب أوّلا
  if (post.status !== 'approved' && post.status !== 'edited') {
    return { ok: false, reason: `حالتُه «${post.status}» — والجدولةُ للمعتمَد وحده` }
  }

  // ‏ومنشورٌ يعرف الناشرُ أنّه سيردّه عند موعده لا يُجدوَل: TikTok وYouTube بلا مقطع،
  // ‏وInstagram بلا صورةٍ ولا مقطع — «مجدولة» على بطاقته وعدٌ يُخلَف بعد أيّام
  const { results: ready } = await db
    .prepare("SELECT mime FROM media WHERE post_id = ? AND status = 'ready'")
    .bind(postId)
    .all<{ mime: string }>()
  const lacking = missingMedia(post.platform, ready.map((m) => m.mime))
  if (lacking !== null) return { ok: false, reason: lacking }

  const account = await db
    .prepare('SELECT id, platform, status, display_name FROM accounts WHERE id = ?')
    .bind(accountId)
    .first<AccountRow>()
  if (account === null) return { ok: false, reason: 'لا حساب بهذا المعرّف' }

  // نصُّ X في حساب LinkedIn منشورٌ في غير موضعه — وحدُّ المحارف وحده
  // يكفي دليلا على أنّ النصّين ليسا واحدا
  if (account.platform !== post.platform) {
    return {
      ok: false,
      reason: `المنشور لـ ${post.platform} والحساب في ${account.platform}`,
    }
  }
  // جدولةٌ إلى قناةٍ إذنُها منتهٍ تفشل بعد أيّامٍ صامتةً — فتُمنع الآن
  if (account.status !== 'active') {
    return { ok: false, reason: `${account.display_name}: الحساب ${account.status} — جدّد إذنه أوّلا` }
  }

  const at = parseWhen(when)
  if (at === null) return { ok: false, reason: 'موعدٌ غير مفهوم — الصيغة YYYY-MM-DDTHH:MM' }
  // موعدٌ مضى يُرسَل في أوّل دورة — وذاك إرسالٌ فوريّ لا جدولة. ومَن أراد
  // الفورَ فليقل ذلك بموعدٍ قريب، لا بموعدٍ في الماضي
  if (at <= dbNow(now)) return { ok: false, reason: 'الموعدُ في الماضي' }

  await db
    .prepare(
      `UPDATE posts SET status = 'queued', account_id = ?, scheduled_at = ?,
                        dispatched_at = NULL
        WHERE id = ?`,
    )
    .bind(accountId, at, postId)
    .run()

  return { ok: true, at, account: account.display_name, platform: post.platform }
}

/**
 * سحبٌ قبل الإرسال — وقبله وحده.
 *
 * ما غادر إلى الطابور لا يُستردّ: الرسالةُ عند Cloudflare، وزرٌّ يقول
 * «سحبتُها» وهي في الطريق **يكذب على المالك في أخطر لحظة**.
 */
export async function unschedule(db: Db, postId: string): Promise<ScheduleResult> {
  const row = await db
    .prepare('SELECT id, status, dispatched_at FROM posts WHERE id = ?')
    .bind(postId)
    .first<{ id: string; status: string; dispatched_at: string | null }>()
  if (row === null) return { ok: false, reason: 'لا منشور بهذا المعرّف' }
  if (row.status !== 'queued') return { ok: false, reason: 'ليس مجدولا' }
  if (row.dispatched_at !== null) {
    return { ok: false, reason: 'غادر إلى الطابور — ولا يُستردّ من هناك' }
  }

  // يعود `approved` لا `draft`: الاعتمادُ وقع ولا يُمحى بسحب موعد
  await db
    .prepare(
      "UPDATE posts SET status = 'approved', scheduled_at = NULL, account_id = NULL WHERE id = ?",
    )
    .bind(postId)
    .run()
  return { ok: true, at: '', account: '', platform: '' }
}

/** ما يُعَدّ عالقًا: غادر إلى الطابور منذ ساعةٍ ولم تُكتب له محاولةٌ منذها. */
export const STUCK_MINUTES = 60

/**
 * إعادةُ الفاشل أو العالق إلى «معتمَد» — **ولا يُعاد ما قد يكون نُشر**.
 *
 * كان المنشورُ الفاشل يبقى «فشل» إلى الأبد: لا زرَّ يعيده، والمسوّدةُ لا
 * تُكتب ثانيةً لأنّ نسختها مسجّلة. فيبقى نصٌّ اعتمده المالكُ بلا طريقٍ
 * إلى المنصّة إلّا أن يُكتب من جديد ويُدفع ثمنُه.
 *
 * ويُردّ في حالين، **لأنّ الإعادةَ فيهما قد تنشر مرّتين**:
 * - محاولةٌ ناجحة: نُشر فعلا.
 * - محاولةٌ `sent` بلا جواب: أُرسلت ولم يُعرف ردُّها، والمنصّةُ قد تكون
 *   نشرت. فيُتحقّق على المنصّة أوّلا.
 *
 * و`idempotency_key` يبقى كما هو، فحارسُ `skipped_duplicate` في الناشر
 * يمنع نشرا ثانيا إن فات هذا الحارس (D-004). **والتحديثُ ذرّيّ**: طلبان
 * متزامنان يقلب أحدُهما الحالَ والثاني يُردّ.
 */
export async function requeue(db: Db, postId: string, now: Date): Promise<ScheduleResult> {
  const row = await db
    .prepare('SELECT status, dispatched_at FROM posts WHERE id = ?')
    .bind(postId)
    .first<{ status: string; dispatched_at: string | null }>()
  if (row === null) return { ok: false, reason: 'لا منشور بهذا المعرّف' }

  const cutoff = dbNow(new Date(now.getTime() - STUCK_MINUTES * 60_000))
  const stuck = row.status === 'queued' && row.dispatched_at !== null && row.dispatched_at < cutoff
  if (row.status !== 'failed' && !stuck) {
    return {
      ok: false,
      reason: row.status === 'queued'
        ? row.dispatched_at === null
          ? 'ينتظر موعدَه ولم يفشل — اسحبه من الطابور إن أردت تغييره'
          : `غادر إلى الطابور منذ أقلَّ من ${STUCK_MINUTES} دقيقة — انتظر جوابَ المنصّة`
        : `حالتُه «${row.status}» — والإعادةُ للفاشل أو العالق وحده`,
    }
  }

  const attempts = await db
    .prepare(
      `SELECT status, at FROM publish_attempts
        WHERE post_id = ? AND (status IN ('succeeded', 'sent', 'skipped_duplicate') OR at >= ?)`,
    )
    .bind(postId, cutoff)
    .all<{ status: string; at: string }>()
  if (attempts.results.some((a) => a.status === 'succeeded' || a.status === 'skipped_duplicate')) {
    return { ok: false, reason: 'نُشر من قبل — وإعادتُه تنشره مرّتين' }
  }
  if (attempts.results.some((a) => a.status === 'sent')) {
    return { ok: false, reason: 'أُرسلت محاولةٌ ولم يُعرف ردُّها — تحقّق على المنصّة أوّلا' }
  }
  if (stuck && attempts.results.length > 0) {
    return { ok: false, reason: `حاولت الدورةُ منذ أقلَّ من ${STUCK_MINUTES} دقيقة — انتظر جوابها` }
  }

  const moved = await db
    .prepare(
      `UPDATE posts SET status = 'approved', scheduled_at = NULL, account_id = NULL, dispatched_at = NULL
        WHERE id = ?
          AND (status = 'failed' OR (status = 'queued' AND dispatched_at IS NOT NULL AND dispatched_at < ?))
          AND NOT EXISTS (SELECT 1 FROM publish_attempts
                           WHERE post_id = ? AND status IN ('succeeded', 'sent', 'skipped_duplicate'))
        RETURNING id`,
    )
    .bind(postId, cutoff, postId)
    .first<{ id: string }>()
  if (moved === null) return { ok: false, reason: 'تغيّرت حالُه قبل الإعادة — أعد تحميل الصفحة' }
  return { ok: true, at: '', account: '', platform: '' }
}

export interface DuePost {
  readonly id: string
  readonly scheduledAt: string
}

/**
 * ما حلّ موعدُه ولم يُرسَل بعد.
 *
 * وسقفٌ لكلّ دورة: مالكٌ يجدول ثلاثين منشورا لساعةٍ واحدة يغرق الطابور
 * في دورةٍ واحدة. والباقي يخرج في الدورة التالية بعد ربع ساعة — تأخيرٌ
 * يُرى، خيرٌ من دفعةٍ تُرفض كلُّها.
 */
export async function dueNow(db: Db, now: Date, limit = 20): Promise<DuePost[]> {
  const { results } = await db
    .prepare(
      `SELECT id, scheduled_at FROM posts
        WHERE status = 'queued' AND dispatched_at IS NULL AND scheduled_at <= ?
        ORDER BY scheduled_at
        LIMIT ?`,
    )
    .bind(dbNow(now), limit)
    .all<{ id: string; scheduled_at: string }>()
  return results.map((r) => ({ id: r.id, scheduledAt: r.scheduled_at }))
}

/**
 * الختمُ **قبل** الإرسال لا بعده.
 *
 * وهو الترتيب نفسه الذي تُسجَّل به الكلفة (D-008): رسالةٌ أُرسلت وضاع
 * جوابُ الإرسال تبقى مرسَلة. وختمٌ بعد النجاح وحده يجعل الدورة التالية
 * ترسلها ثانية — والخطأُ يميل إلى تكرار النشر، وهو أسوأ اتّجاهاته.
 */
export async function markDispatched(db: Db, ids: readonly string[], now: Date): Promise<void> {
  if (ids.length === 0) return
  const marks = ids.map(() => '?').join(', ')
  await db
    .prepare(`UPDATE posts SET dispatched_at = ? WHERE id IN (${marks})`)
    .bind(dbNow(now), ...ids)
    .run()
}

export interface DispatchDeps {
  readonly db: Db
  /**
   * أقلُّ ما نحتاجه من الطابور — لا نوعُ Cloudflare كاملا.
   *
   * وجوابُ `sendBatch` يُهمَل بـ `unknown`: نجاحُ الإرسال في عدم الرمي،
   * وقراءةُ حقلٍ في جوابه تربط الشيفرةَ بشكلٍ قد يتبدّل.
   */
  readonly queue: { sendBatch(messages: { body: { postId: string } }[]): Promise<unknown> }
  readonly now?: () => Date
  readonly limit?: number
}

export type DispatchReport =
  | { readonly kind: 'sent'; readonly count: number; readonly ids: readonly string[] }
  | { readonly kind: 'none' }
  | { readonly kind: 'blocked'; readonly reason: string }

/**
 * دورةُ الربع: تقرأ المستحقّ وترسله.
 *
 * والحارسُ العامّ أوّلا — **الإيقافُ يوقف النشر كما يوقف النداء**. ومفتاحٌ
 * يوقف الإنفاق ويترك المنشورات تخرج ليس مفتاحَ إيقاف.
 */
export async function dispatchDue(deps: DispatchDeps): Promise<DispatchReport> {
  const now = (deps.now ?? (() => new Date()))()

  const allowance = await checkAllowance(deps.db, 'publish')
  if (allowance.blocker !== null) {
    return { kind: 'blocked', reason: blockerReason(allowance.blocker) }
  }

  const due = await dueNow(deps.db, now, deps.limit ?? 20)
  if (due.length === 0) return { kind: 'none' }

  const ids = due.map((d) => d.id)
  await markDispatched(deps.db, ids, now)
  await deps.queue.sendBatch(ids.map((postId) => ({ body: { postId } })))

  return { kind: 'sent', count: ids.length, ids }
}

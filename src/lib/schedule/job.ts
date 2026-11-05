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
  org_id: string
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
  /** منظّمةُ الجلسة حين يأتي الطلبُ من اللوحة (D-277): منشورُ منظّمةٍ أخرى «لا منشور» */
  org: string | null = null,
): Promise<ScheduleResult> {
  const post = await db
    // ‏المنظّمةُ تُقرأ مع الصفّ، وكلُّ ما بعده يُقيَّد بها (D-277)
    .prepare('SELECT id, org_id, platform, status FROM posts WHERE id = ? AND (?2 IS NULL OR org_id = ?2)')
    .bind(postId, org)
    .first<PostRow>()
  if (post === null) return { ok: false, reason: 'لا منشور بهذا المعرّف' }

  // المعتمَدُ وحده يُجدول: المسوّدةُ لم تُقرأ، والمجدولُ له موعدٌ يُسحب أوّلا
  if (post.status !== 'approved' && post.status !== 'edited') {
    return { ok: false, reason: `حالتُه «${post.status}» — والجدولة للمعتمَد وحده` }
  }

  // ‏ومنشورٌ يعرف الناشرُ أنّه سيردّه عند موعده لا يُجدوَل: TikTok وYouTube بلا مقطع،
  // ‏وInstagram بلا صورةٍ ولا مقطع — «مجدولة» على بطاقته وعدٌ يُخلَف بعد أيّام
  const { results: ready } = await db
    .prepare("SELECT mime FROM media WHERE post_id = ? AND org_id = ? AND status = 'ready'")
    .bind(postId, post.org_id)
    .all<{ mime: string }>()
  const lacking = missingMedia(post.platform, ready.map((m) => m.mime))
  if (lacking !== null) return { ok: false, reason: lacking }

  const account = await db
    .prepare('SELECT id, platform, status, display_name FROM accounts WHERE id = ? AND org_id = ?')
    .bind(accountId, post.org_id)
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
  if (at === null) return { ok: false, reason: 'موعد غير مفهوم — الصيغة YYYY-MM-DDTHH:MM' }
  // موعدٌ مضى يُرسَل في أوّل دورة — وذاك إرسالٌ فوريّ لا جدولة. ومَن أراد
  // الفورَ فليقل ذلك بموعدٍ قريب، لا بموعدٍ في الماضي
  if (at <= dbNow(now)) return { ok: false, reason: 'الموعد في الماضي' }

  await db
    .prepare(
      `UPDATE posts SET status = 'queued', account_id = ?, scheduled_at = ?,
                        dispatched_at = NULL
        WHERE id = ? AND org_id = ?`,
    )
    .bind(accountId, at, postId, post.org_id)
    .run()

  return { ok: true, at, account: account.display_name, platform: post.platform }
}

/**
 * سحبٌ قبل الإرسال — وقبله وحده.
 *
 * ما غادر إلى الطابور لا يُستردّ: الرسالةُ عند Cloudflare، وزرٌّ يقول
 * «سحبتُها» وهي في الطريق **يكذب على المالك في أخطر لحظة**.
 */
export async function unschedule(db: Db, postId: string, org: string | null = null): Promise<ScheduleResult> {
  const row = await db
    .prepare('SELECT id, org_id, status, dispatched_at, scheduled_at, account_id FROM posts WHERE id = ? AND (?2 IS NULL OR org_id = ?2)')
    .bind(postId, org)
    .first<{ id: string; org_id: string; status: string; dispatched_at: string | null; scheduled_at: string | null; account_id: string | null }>()
  if (row === null) return { ok: false, reason: 'لا منشور بهذا المعرّف' }
  if (row.status !== 'queued') return { ok: false, reason: 'ليس مجدولا' }
  if (row.dispatched_at !== null) {
    return { ok: false, reason: 'أُرسل للنشر — ولا يُستردّ بعد الإرسال' }
  }

  // يعود `approved` لا `draft`: الاعتمادُ وقع ولا يُمحى بسحب موعد
  await db
    .prepare(
      "UPDATE posts SET status = 'approved', scheduled_at = NULL, account_id = NULL WHERE id = ? AND org_id = ?",
    )
    .bind(postId, row.org_id)
    .run()
  // ‏وما كان يُعاد مع النتيجة (D-303): الموعدُ والحسابُ ليحملهما زرُّ «تراجَع» في الإشعار
  return { ok: true, at: row.scheduled_at ?? '', account: row.account_id ?? '', platform: '' }
}

/**
 * **التراجعُ عن السحب** (D-303 · Norman: المسامحةُ لا التحذير): يعيد الموعدَ والحسابَ اللذين كانا، ما دامت
 * معتمَدةً بلا موعد — فإشعارٌ شاخ لا يقلب حالًا تبدّلت بعده (كما في `undoReject`). ولا حارسَ للزمن هنا: موعدٌ
 * مرّ في ثوانٍ بين السحب والتراجع يُنشَر في الدورة التالية، وهو ما أراده المالكُ حين جدوله.
 */
export async function restoreSchedule(
  db: Db,
  postId: string,
  at: string,
  accountId: string,
  org: string,
): Promise<ScheduleResult> {
  if (at === '' || accountId === '') return { ok: false, reason: 'لا موعدَ يُستعاد' }
  const row = await db
    .prepare('SELECT status, scheduled_at FROM posts WHERE id = ? AND org_id = ?')
    .bind(postId, org)
    .first<{ status: string; scheduled_at: string | null }>()
  if (row === null) return { ok: false, reason: 'لا منشور بهذا المعرّف' }
  if (row.status !== 'approved' || row.scheduled_at !== null) return { ok: false, reason: 'تبدّلت حالُها بعد السحب' }
  const account = await db
    .prepare("SELECT id FROM accounts WHERE id = ? AND org_id = ? AND status = 'active'")
    .bind(accountId, org)
    .first<{ id: string }>()
  if (account === null) return { ok: false, reason: 'الحسابُ لم يعد مربوطًا' }
  await db
    .prepare("UPDATE posts SET status = 'queued', scheduled_at = ?, account_id = ? WHERE id = ? AND org_id = ? AND status = 'approved'")
    .bind(at, accountId, postId, org)
    .run()
  return { ok: true, at, account: accountId, platform: '' }
}

/**
 * «غيّر الموعد» (D-198) — **الموعدُ وحدَه، بلا سحبٍ وجدولةٍ من جديد**. والحارسُ حارسُ الجدولة:
 * لا ماضٍ، ولا ما غادر إلى الطابور، ولا حسابٌ سقط إذنُه. والسببُ بكلام المالك لا بمعرّف الحال.
 */
export async function reschedulePost(db: Db, postId: string, when: string, now: Date, org: string | null = null): Promise<ScheduleResult> {
  const row = await db
    .prepare(
      `SELECT p.org_id, p.platform, p.status, p.dispatched_at, a.status AS account_status, a.display_name
         FROM posts p LEFT JOIN accounts a ON a.id = p.account_id AND a.org_id = p.org_id
        WHERE p.id = ? AND (?2 IS NULL OR p.org_id = ?2)`,
    )
    .bind(postId, org)
    .first<{ org_id: string; platform: string; status: string; dispatched_at: string | null; account_status: string | null; display_name: string | null }>()
  if (row === null) return { ok: false, reason: 'لا منشور بهذا المعرّف' }
  if (row.status !== 'queued') return { ok: false, reason: 'ليس مجدولًا، فاختر له موعدًا من بطاقته' }
  if (row.dispatched_at !== null) return { ok: false, reason: 'أُرسل للنشر، ولا يُغيَّر موعدُه بعد الإرسال' }
  if (row.account_status !== null && row.account_status !== 'active') {
    return { ok: false, reason: `${row.display_name ?? 'الحساب'}: إذن الحساب لا يعمل، فجدّد إذنه أوّلًا` }
  }
  const at = parseWhen(when)
  if (at === null) return { ok: false, reason: 'موعد غير مفهوم' }
  if (at <= dbNow(now)) return { ok: false, reason: 'الموعد في الماضي' }
  const moved = await db
    .prepare(
      `UPDATE posts SET scheduled_at = ?
        WHERE id = ? AND org_id = ? AND status = 'queued' AND dispatched_at IS NULL
        RETURNING id`,
    )
    .bind(at, postId, row.org_id)
    .first<{ id: string }>()
  if (moved === null) return { ok: false, reason: 'تغيّرت حالُه قبل التغيير، فأعد تحميل الصفحة' }
  return { ok: true, at, account: row.display_name ?? '', platform: row.platform }
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
export async function requeue(db: Db, postId: string, now: Date, org: string | null = null): Promise<ScheduleResult> {
  const row = await db
    .prepare('SELECT org_id, status, dispatched_at FROM posts WHERE id = ? AND (?2 IS NULL OR org_id = ?2)')
    .bind(postId, org)
    .first<{ org_id: string; status: string; dispatched_at: string | null }>()
  if (row === null) return { ok: false, reason: 'لا منشور بهذا المعرّف' }

  const cutoff = dbNow(new Date(now.getTime() - STUCK_MINUTES * 60_000))
  const stuck = row.status === 'queued' && row.dispatched_at !== null && row.dispatched_at < cutoff
  if (row.status !== 'failed' && !stuck) {
    return {
      ok: false,
      reason: row.status === 'queued'
        ? row.dispatched_at === null
          ? 'ينتظر موعدَه ولم يفشل — ألغ الجدولة إن أردت تغييره'
          : `أُرسل للنشر قبل أقلّ من ${STUCK_MINUTES} دقيقة — انتظر جواب المنصّة`
        : `حالتُه «${row.status}» — والإعادة للفاشل أو العالق وحده`,
    }
  }

  const attempts = await db
    .prepare(
      `SELECT status, at FROM publish_attempts
        WHERE post_id = ? AND org_id = ? AND (status IN ('succeeded', 'sent', 'skipped_duplicate') OR at >= ?)`,
    )
    .bind(postId, row.org_id, cutoff)
    .all<{ status: string; at: string }>()
  if (attempts.results.some((a) => a.status === 'succeeded' || a.status === 'skipped_duplicate')) {
    return { ok: false, reason: 'نُشر من قبل — وإعادتُه تنشره مرّتين' }
  }
  if (attempts.results.some((a) => a.status === 'sent')) {
    return { ok: false, reason: 'أُرسلت محاولة ولم يُعرف ردُّها — تحقّق على المنصّة أوّلا' }
  }
  if (stuck && attempts.results.length > 0) {
    return { ok: false, reason: `حاولت الدورة منذ أقلّ من ${STUCK_MINUTES} دقيقة — انتظر جوابها` }
  }

  const moved = await db
    .prepare(
      `UPDATE posts SET status = 'approved', scheduled_at = NULL, account_id = NULL, dispatched_at = NULL
        WHERE id = ? AND org_id = ?
          AND (status = 'failed' OR (status = 'queued' AND dispatched_at IS NOT NULL AND dispatched_at < ?))
          AND NOT EXISTS (SELECT 1 FROM publish_attempts pa
                           WHERE pa.post_id = posts.id AND pa.org_id = posts.org_id
                             AND pa.status IN ('succeeded', 'sent', 'skipped_duplicate'))
        RETURNING id`,
    )
    .bind(postId, row.org_id, cutoff)
    .first<{ id: string }>()
  if (moved === null) return { ok: false, reason: 'تغيّرت حالُه قبل الإعادة — أعد تحميل الصفحة' }
  return { ok: true, at: '', account: '', platform: '' }
}

export interface Swept { readonly id: string; readonly org: string }

/**
 * الكنّاس (D-270): ما غادر إلى الطابور منذ أكثر من `STUCK_MINUTES` ولم تُكتب
 * له محاولةٌ منذها، ولا محاولةَ ناجحةً أو `sent` قطّ — **يُعلَّم `failed` بأثرٍ**.
 *
 * كان يبقى «في الطابور» إلى الأبد: الطابورُ فرغ منه إلى طابور الأعطال، و`collectAlerts`
 * لا تنبّه إلّا على `failed`، فلا يعلم المالكُ حتّى يدخل ويبحث. والأثرُ صفُّ محاولةٍ
 * `failed` بسبب `stuck` تقرؤه الرحلةُ والتنبيه، ويعيده «أعده» كأيّ فاشل.
 * **ولا يمسّ ما له محاولةٌ `sent`**: ذاك يحتاج تحقّقَ المالك على المنصّة لا كنّاسا.
 */
export async function sweepStuck(db: Db, now: Date): Promise<readonly Swept[]> {
  const cutoff = dbNow(new Date(now.getTime() - STUCK_MINUTES * 60_000))
  const { results } = await db
    .prepare(
      `UPDATE posts SET status = 'failed'
        WHERE status = 'queued' AND dispatched_at IS NOT NULL AND dispatched_at < ?1
          AND NOT EXISTS (SELECT 1 FROM publish_attempts pa
                           WHERE pa.post_id = posts.id AND pa.org_id = posts.org_id
                             AND (pa.status IN ('succeeded', 'sent', 'skipped_duplicate') OR pa.at >= ?1))
        RETURNING id, org_id, idempotency_key`,
    )
    .bind(cutoff)
    .all<{ id: string; org_id: string; idempotency_key: string }>()
  for (const row of results) {
    const no = await db
      .prepare('SELECT coalesce(max(attempt_no), 0) AS n FROM publish_attempts WHERE post_id = ? AND org_id = ?')
      .bind(row.id, row.org_id)
      .first<{ n: number }>()
    await db
      .prepare(
        `INSERT INTO publish_attempts (id, post_id, idempotency_key, attempt_no, request_json, response_json, status, org_id)
         VALUES (?, ?, ?, ?, ?, ?, 'failed', ?)`,
      )
      .bind(
        crypto.randomUUID(), row.id, row.idempotency_key, (no?.n ?? 0) + 1,
        JSON.stringify({ sweep: true }),
        JSON.stringify({ error: `stuck: غادر إلى الطابور قبل أكثر من ${STUCK_MINUTES} دقيقة ولم يعد جواب`, sweep: true }),
        row.org_id,
      )
      .run()
  }
  return results.map((r) => ({ id: r.id, org: r.org_id }))
}

export interface DuePost {
  readonly id: string
  /** منظّمةُ المنشور — تُقرأ مع المسح وتُحمَل إلى ما بعده (D-277). */
  readonly org: string
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
      `SELECT id, org_id, scheduled_at FROM posts
        WHERE status = 'queued' AND dispatched_at IS NULL AND scheduled_at <= ?
        ORDER BY scheduled_at
        LIMIT ?`,
    )
    .bind(dbNow(now), limit)
    .all<{ id: string; org_id: string; scheduled_at: string }>()
  return results.map((r) => ({ id: r.id, org: r.org_id, scheduledAt: r.scheduled_at }))
}

/**
 * الختمُ **قبل** الإرسال لا بعده.
 *
 * وهو الترتيب نفسه الذي تُسجَّل به الكلفة (D-008): رسالةٌ أُرسلت وضاع
 * جوابُ الإرسال تبقى مرسَلة. وختمٌ بعد النجاح وحده يجعل الدورة التالية
 * ترسلها ثانية — والخطأُ يميل إلى تكرار النشر، وهو أسوأ اتّجاهاته.
 */
export interface Stamped { readonly id: string; readonly org: string }

export async function markDispatched(db: Db, ids: readonly string[], now: Date): Promise<readonly Stamped[]> {
  if (ids.length === 0) return []
  const marks = ids.map(() => '?').join(', ')
  /*
   * **ذرّيٌّ لا «اقرأ ثمّ اكتب»** (D-269).
   *
   * دورتان تلتقيان في الدقيقة نفسِها (الثالثةُ فجرا: `*\/15` و`3 3`) كانتا
   * تقرآن المستحقَّ نفسَه ثمّ تختمانه معا وترسلانه مرّتين — والرسالةُ
   * الثانية تجد الأولى «أُرسلت» فلا تُنشر، لكنّها كانت تُعاد وتُحاسَب.
   * فالختمُ يشترط أنّ الصفَّ لم يُختَم بعد، **والقاعدةُ تعيد ما ختمته هي**،
   * والدورةُ ترسل ذاك وحده.
   */
  const { results } = await db
    .prepare(
      `UPDATE posts SET dispatched_at = ?
        WHERE id IN (${marks}) AND status = 'queued' AND dispatched_at IS NULL
        RETURNING id, org_id`,
    )
    .bind(dbNow(now), ...ids)
    .all<{ id: string; org_id: string }>()
  return results.map((r) => ({ id: r.id, org: r.org_id }))
}

/**
 * يرفع الختمَ عمّا لم يصل الطابور (D-269): `sendBatch` رمى بعد الختم،
 * فبقيت المنشوراتُ «أُرسلت» ولا رسالةَ لها — وكانت تنتظر ستّين دقيقةً
 * حتّى يعيدها المالكُ بيده. والشرطُ على الختم نفسِه، فلا يُرفَع ختمٌ وضعته دورةٌ أخرى.
 */
export async function unmarkDispatched(db: Db, stamped: readonly Stamped[], now: Date): Promise<void> {
  if (stamped.length === 0) return
  const stamp = dbNow(now)
  for (const s of stamped) {
    await db
      .prepare('UPDATE posts SET dispatched_at = NULL WHERE id = ? AND org_id = ? AND dispatched_at = ?')
      .bind(s.id, s.org, stamp)
      .run()
  }
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

  // ‏ما ختمته هذه الدورةُ وحدَه يُرسَل: دورةٌ متزامنةٌ قد سبقت إلى بعضه (D-269)
  const stamped = await markDispatched(deps.db, due.map((d) => d.id), now)
  if (stamped.length === 0) return { kind: 'none' }
  const ids = stamped.map((s) => s.id)
  try {
    await deps.queue.sendBatch(ids.map((postId) => ({ body: { postId } })))
  } catch (error) {
    await unmarkDispatched(deps.db, stamped, now)
    throw error
  }

  return { kind: 'sent', count: ids.length, ids }
}

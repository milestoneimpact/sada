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
import { parseSqliteUtc } from '../format'
import { sendChunked } from '../queue/batch'
import { threadAuthor, unsettledTweet } from '../publish/xThread'
import { missingMedia } from './media'
import { approvalRequired, readClientOptions } from '../clientOptions'
import { record } from '../audit'

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
  external_id: string
}

/**
 * ‏**نافذةُ «تراجَع» بعد الجدولة من اللوحة** (D-324 · نمط D-303) — بالثواني، **ولا يُنشَر شيءٌ فيها**.
 *
 * ‏كان «اعتمد وجدوِل» و«جدوِل» يُغلقان الإشعارَ بلا رجعة: المجدولةُ تُسحب من بطاقتها، ثمّ يُتراجَع عن اعتمادها في موضعٍ
 * ‏ثانٍ. فصار الإشعارُ يحمل «تراجَع» دقيقتين، **والضمانُ في الجدولة لا في الزرّ**: أقربُ موعدٍ تقبله اللوحةُ بعد النافذة
 * ‏(`holdSeconds`)، ولا يُختَم منشورٌ قبل موعده — **فلا يُنشَر شيءٌ وزرُّ «تراجَع» قائم**. ومنذ D-320 قد تبلغ رسالةٌ مؤجَّلةٌ
 * ‏الطابورَ داخل النافذة، لكنّها لا تختم منشورَها إلّا في دقيقته وما زال كما أُرسلت له (`claimDelivery`)، فـ«تراجَع» قبلها يغلب.
 * ‏وبعد النافذة يبقى «اسحب الموعد» في بطاقتها كما كان، حتّى دقيقتها.
 */
export const UNDO_WINDOW_SECONDS = 120

/** آخرُ لحظةٍ يُقبل فيها «تراجَع» — تُحمَل في زرّ الإشعار (`undo.fields`) كما يحمل زرُّ D-303 موعدَه. */
export function undoUntil(now: Date): string {
  return new Date(now.getTime() + UNDO_WINDOW_SECONDS * 1000).toISOString()
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
  /** ‏إمساكٌ بالثواني (D-324): موعدٌ أقربُ منه يُردّ، فلا يُنشَر شيءٌ في نافذة «تراجَع». وصفرٌ لمن لا «تراجَع» له. */
  holdSeconds = 0,
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

  // ‏**وعميلٌ يوافق قبل النشر** (D-412): لا يُجدوَل منشورُه حتّى يقول «موافق» في رابطه. والحارسُ يُستورد عند الحاجة —
  // ‏المراجعةُ تستورد هذه الوحدة، فاستيرادُها في الرأس حلقة
  const hold = await approvalHoldFor(db, post.org_id, postId)
  if (hold !== null) return { ok: false, reason: hold }

  // ‏ومنشورٌ يعرف الناشرُ أنّه سيردّه عند موعده لا يُجدوَل: TikTok وYouTube بلا مقطع،
  // ‏وInstagram بلا صورةٍ ولا مقطع — «مجدولة» على بطاقته وعدٌ يُخلَف بعد أيّام
  const { results: ready } = await db
    .prepare("SELECT mime FROM media WHERE post_id = ? AND org_id = ? AND status = 'ready'")
    .bind(postId, post.org_id)
    .all<{ mime: string }>()
  const lacking = missingMedia(post.platform, ready.map((m) => m.mime))
  if (lacking !== null) return { ok: false, reason: lacking }

  const account = await db
    .prepare('SELECT id, platform, status, display_name, external_id FROM accounts WHERE id = ? AND org_id = ?')
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
  // ‏**وسلسلةُ X نُشر أوّلُها تُكمَل من حسابها** (مراجعة D-324): «أعده» يمحو الحساب، وجدولتُها على حسابٍ آخر تشقّها بين
  // ‏حسابين — ردٌّ من هذا على تغريدة ذاك. فتُردّ هنا باسم حسابها، والناشرُ يردّها أيضًا إن وصلته
  if (post.platform === 'x') {
    const author = await threadAuthor(db, postId, post.org_id)
    if (author !== null && author !== account.external_id) {
      const first = await db
        .prepare("SELECT display_name FROM accounts WHERE org_id = ? AND platform = 'x' AND external_id = ? LIMIT 1")
        .bind(post.org_id, author)
        .first<{ display_name: string }>()
      return {
        ok: false,
        reason: `نُشر أوّلُ هذه السلسلة من ${first === null ? 'حسابٍ آخر على X' : `«${first.display_name}»`} — جدوِلها عليه لتكتمل في موضعها`,
      }
    }
  }

  const at = parseWhen(when)
  if (at === null) return { ok: false, reason: 'موعد غير مفهوم — الصيغة YYYY-MM-DDTHH:MM' }
  // موعدٌ مضى يُرسَل في أوّل دورة — وذاك إرسالٌ فوريّ لا جدولة. ومَن أراد
  // الفورَ فليقل ذلك بموعدٍ قريب، لا بموعدٍ في الماضي
  if (at <= dbNow(now)) return { ok: false, reason: 'الموعد في الماضي' }
  if (holdSeconds > 0 && at < dbNow(new Date(now.getTime() + holdSeconds * 1000))) {
    return { ok: false, reason: 'الموعد بعد أقلّ من دقيقتين، ولا يُنشَر شيءٌ في دقيقتي التراجع — اختر موعدًا أبعد قليلًا' }
  }

  await db
    .prepare(
      `UPDATE posts SET status = 'queued', account_id = ?, scheduled_at = ?,
                        dispatched_at = NULL, enqueued_for = NULL
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
  // ‏**والحارسُ في جملة التحديث نفسِها** (تحقّق D-320 على main): رسالةٌ مؤجَّلةٌ تختمه بين القراءة والكتابة تغلب، فلا يُقال «سُحب»
  // ‏ومنشورُه خارج. والموعدُ والحسابُ كما قُرئا، فزرُّ «تراجَع» لا يحمل موعدًا غيّره طلبٌ آخر بينهما
  const pulled = await db
    .prepare(
      `UPDATE posts SET status = 'approved', scheduled_at = NULL, account_id = NULL, enqueued_for = NULL
        WHERE id = ? AND org_id = ? AND status = 'queued' AND dispatched_at IS NULL AND scheduled_at IS ? AND account_id IS ?
        RETURNING id`,
    )
    .bind(postId, row.org_id, row.scheduled_at, row.account_id)
    .first<{ id: string }>()
  if (pulled === null) return { ok: false, reason: 'تغيّرت حالُه قبل السحب، فأعد تحميل الصفحة' }
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
    .prepare('SELECT status, scheduled_at, dispatched_at FROM posts WHERE id = ? AND org_id = ?')
    .bind(postId, org)
    .first<{ status: string; scheduled_at: string | null; dispatched_at: string | null }>()
  if (row === null) return { ok: false, reason: 'لا منشور بهذا المعرّف' }
  // ‏ومختومٌ للإرسال لا يعود إلى الطابور (تحقّق D-320 على main): «مجدولٌ» مختومٌ لا تراه الدورةُ ولا الكنّاسُ إن كانت له محاولة
  if (row.status !== 'approved' || row.scheduled_at !== null || row.dispatched_at !== null) {
    return { ok: false, reason: 'تبدّلت حالُها بعد السحب' }
  }
  // ‏**وحارسُ موافقة العميل** (مراجعة D-425): التراجعُ عن السحب جدولةٌ من جديد، ورأيُ العميل ربّما تبدّل بين السحب والتراجع
  const held = await approvalHoldFor(db, org, postId)
  if (held !== null) return { ok: false, reason: held }
  const account = await db
    .prepare("SELECT id FROM accounts WHERE id = ? AND org_id = ? AND status = 'active'")
    .bind(accountId, org)
    .first<{ id: string }>()
  if (account === null) return { ok: false, reason: 'الحسابُ لم يعد مربوطًا' }
  const restored = await db
    .prepare(
      `UPDATE posts SET status = 'queued', scheduled_at = ?, account_id = ?, enqueued_for = NULL
        WHERE id = ? AND org_id = ? AND status = 'approved' AND scheduled_at IS NULL AND dispatched_at IS NULL
        RETURNING id`,
    )
    .bind(at, accountId, postId, org)
    .first<{ id: string }>()
  if (restored === null) return { ok: false, reason: 'تبدّلت حالُها بعد السحب' }
  return { ok: true, at, account: accountId, platform: '' }
}

/**
 * ‏**«تراجَع» في إشعار الجدولة** (D-324): يعيد المنشورَ إلى ما كان قبل الضغطة — مسوّدةً تنتظر القرار بعد «اعتمد وجدوِل»
 * ‏(`to: 'draft'`)، أو معتمَدةً تنتظر موعدًا بعد «جدوِل» (`to: 'approved'`). والنصُّ كما هو: ما حُفظ قبل الضغطة حُفظ.
 *
 * ‏**والحارسُ في جملة التحديث نفسِها** (كـ `undoApprove`): مجدولةٌ بالموعد نفسِه الذي حمله الزرّ، ولم تُختَم للإرسال — فإشعارٌ
 * ‏شاخ لا يسحب موعدًا جديدًا ضُبط بعده، ولا يُستردّ ما غادر. **والنافذةُ تُقرأ من الزرّ** (`until`)، وتحريفُها لا يفتح شيئًا:
 * ‏ما لم يُختَم يُسحب من بطاقته أصلًا، وما خُتم لا يُسحب بحال.
 */
export async function undoSchedule(
  db: Db,
  postId: string,
  org: string,
  undo: { readonly at: string; readonly until: string; readonly to: 'draft' | 'approved' },
  now: Date,
): Promise<ScheduleResult> {
  const until = Date.parse(undo.until)
  if (Number.isNaN(until) || now.getTime() > until) {
    return { ok: false, reason: 'مضت دقيقتا التراجع — اسحب موعدَها من بطاقتها إن أردت' }
  }
  const draft = undo.to === 'draft' ? 1 : 0
  const moved = await db
    .prepare(
      `UPDATE posts SET status = ?, scheduled_at = NULL, account_id = NULL, enqueued_for = NULL,
              approved_at = CASE WHEN ? = 1 THEN NULL ELSE approved_at END,
              approved_by = CASE WHEN ? = 1 THEN NULL ELSE approved_by END
        WHERE id = ? AND org_id = ? AND status = 'queued' AND dispatched_at IS NULL AND scheduled_at = ?
        RETURNING platform`,
    )
    .bind(draft === 1 ? 'draft' : 'approved', draft, draft, postId, org, undo.at)
    .first<{ platform: string }>()
  if (moved === null) return { ok: false, reason: 'تبدّل موعدُها أو حالُها بعد الإشعار — أعد تحميل الصفحة' }
  return { ok: true, at: '', account: '', platform: moved.platform }
}

/**
 * «غيّر الموعد» (D-198) — **الموعدُ وحدَه، بلا سحبٍ وجدولةٍ من جديد**. والحارسُ حارسُ الجدولة:
 * لا ماضٍ، ولا ما غادر إلى الطابور، ولا حسابٌ سقط إذنُه. والسببُ بكلام المالك لا بمعرّف الحال.
 */
export async function reschedulePost(
  db: Db, postId: string, when: string, now: Date, org: string | null = null,
  /** ‏نقلُ بندٍ في الخطّة (`moveItem` و`delayItem`): بصمتُه تتبدّل معه، فيُطلب رأيٌ جديد ويُمسَك عند الإرسال حتّى يأتي */
  planMove = false,
): Promise<ScheduleResult> {
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
  // ‏**وحارسُ موافقة العميل** (مراجعة D-425): ما يُمسَك عند الجدولة يُمسَك عند تغيير الموعد. وموافقتُه على موعدٍ لا على كلّ
  // ‏موعد: فتغييرُ موعد منشورٍ وافق عليه يُردّ إلّا أن يُنقل بندُه في الخطّة (`planMove`) — فتتبدّل بصمتُه ويُطلب له رأيٌ جديد
  // ‏ونقلُ البند في الخطّة لا يُسأل قبل النقل: النقلُ هو ما يطلب الرأيَ الجديد، وحارسُ الإرسال يُمسكه حتّى يأتي
  const held = planMove ? null : await approvalHoldFor(db, row.org_id, postId)
  if (held !== null) return { ok: false, reason: held + ' — أو انقل البندَ في الخطّة ليُطلب رأيُه في موعدٍ جديد' }
  if (!planMove && await approvalRequired(db, row.org_id)) {
    return { ok: false, reason: 'هذا العميلُ يوافق قبل النشر، ووافق على هذا الموعد — انقل البندَ في الخطّة ليُطلب رأيُه في الموعد الجديد' }
  }
  if (row.account_status !== null && row.account_status !== 'active') {
    return { ok: false, reason: `${row.display_name ?? 'الحساب'}: إذن الحساب لا يعمل، فجدّد إذنه أوّلًا` }
  }
  const at = parseWhen(when)
  if (at === null) return { ok: false, reason: 'موعد غير مفهوم' }
  if (at <= dbNow(now)) return { ok: false, reason: 'الموعد في الماضي' }
  const moved = await db
    .prepare(
      `UPDATE posts SET scheduled_at = ?, enqueued_for = NULL
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
  // ‏**وتغريدةٌ من سلسلةٍ أُرسلت ولم يُعرَف جوابُها** (مراجعة D-324) كمحاولةٍ بقيت `sent`: الإعادةُ ترسلها ثانيةً وقد تكون على X.
  // ‏فتُردّ حتّى يقول المالكُ ما وجده («لم أجدها» أو «وجدتُها» برابطها — `settleTweet`)
  const open = await unsettledTweet(db, postId, row.org_id)
  if (open !== null) {
    return { ok: false, reason: `التغريدة ${open} من السلسلة أُرسلت ولم يُعرف ردُّها — تحقّق على X وقل ما وجدت أوّلًا` }
  }

  const moved = await db
    .prepare(
      `UPDATE posts SET status = 'approved', scheduled_at = NULL, account_id = NULL, dispatched_at = NULL, enqueued_for = NULL
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
 * ‏**الأفقُ الذي تُرسله الدورةُ مؤجَّلًا** (D-320): ستَّ عشرةَ دقيقة — أوسعُ فجوةٍ بين دورتين ربعُ ساعة (‏:15 ← ‏:30)، ودقيقةٌ
 * ‏لتأخّر Cron نفسِه. فكلُّ موعدٍ تراه دورةٌ قبله فتُرسله مؤجَّلًا إلى دقيقته، ولا يُترك للدورة التي بعده. واختبارٌ يقارنه بـwrangler.toml.
 */
export const DISPATCH_HORIZON_SECONDS = 16 * 60

/**
 * ‏**رسالةٌ مؤجَّلةٌ ضاعت** (D-320): ما عُلّم مؤجَّلًا ولم يُختَم بعد عشر دقائقَ من موعده يُرسَل فورًا كما يُرسَل المستحقّ —
 * ‏والختمُ يمنع الاثنين معًا: من سبق إلى `dispatched_at` نشر، ووجد الآخرُ الختمَ فلا يفعل شيئًا.
 */
export const LOST_DELIVERY_SECONDS = 10 * 60

/** ‏كم منشورًا في الجولة (D-320): ‏50 معاملًا مربوطًا وختمُ الوقت دون حدّ D1 (100)، ودفعةٌ دون حدّ الطابور (100). */
export const DISPATCH_ROUND = 50

/** ‏وكم جولةً في الدورة (D-320): خمسمئةٌ في الدورة بدل عشرين — والباقي في التالية. */
export const DISPATCH_ROUNDS = 10

/**
 * ما حلّ موعدُه ولم يُرسَل بعد.
 *
 * ‏وسقفٌ للجولة لا للدورة (D-320): الدورةُ تعيد الجولةَ حتّى يفرغ المستحقّ أو تبلغ `DISPATCH_ROUNDS` — كان عشرين في الدورة،
 * ‏فمالكٌ يجدول ثلاثين منشورًا لساعةٍ واحدة يرى عشرةً منها بعد ربع ساعة.
 *
 * ‏**وما أُرسل له مؤجَّلٌ لموعده لا يُرسَل ثانية** (`enqueued_for`) — إلّا أن تمضي عشرُ دقائقَ بلا ختم: فرسالتُه ضاعت.
 */
/**
 * ‏**حارسُ موافقة العميل** (D-412) في موضعٍ واحد: سببُ الإمساك بكلام المالك، أو `null`. والقاعدةُ التي لا تُقرأ تُمسك.
 * ‏والحارسُ يُستورد عند الحاجة — المراجعةُ تستورد هذه الوحدة، فاستيرادُها في الرأس حلقة.
 */
async function approvalHoldFor(db: Db, org: string, postId: string): Promise<string | null> {
  if (!(await approvalRequired(db, org))) return null
  const { clientApprovalHold } = await import('../clientGate')
  return clientApprovalHold(db, org, postId)
}

/**
 * ‏**الحارسُ عند الإرسال** (مراجعة D-425): رأيٌ تبدّل بعد الجدولة («أطلب تعديلًا»، أو فُتح «يوافق قبل النشر» بعدها) يُمسك
 * ‏المنشورَ قبل ختمه — **يعود معتمَدًا بلا موعد** (لا يُحذف ولا يُفشَل) ويُكتب السببُ في السجلّ. ويعيد ما يمضي.
 * ‏**وقاعدةٌ لا تُقرأ هنا لا تُمسك**: الجدولةُ أمسكت حين قُرئت، وعطلُ D1 لحظةً لا يسحب منشوراتِ كلّ العملاء.
 */
/** ‏**ومرورٌ لأنّ الحارسَ لم يُقرأ لا يمرّ صامتًا** (مراجعة D-425): سطرٌ في سجلّ الدورة وصفٌّ في سجلّ المالك، بلا رمزٍ ولا نصّ. */
async function gateSkipped(db: Db, org: string, post: string, error: unknown): Promise<void> {
  const failed = error instanceof Error ? error.message.slice(0, 200) : 'unexpected_error'
  console.error({ job: 'dispatch_gate', org, post, failed })
  await record(db, { org, actor: 'dispatch', action: 'post.client_gate_skipped', target: post, detail: failed })
}

export async function clearForDispatch<T extends { readonly id: string; readonly org: string }>(db: Db, due: readonly T[]): Promise<T[]> {
  const gated = new Map<string, boolean>()
  const pass: T[] = []
  for (const d of due) {
    if (!gated.has(d.org)) {
      gated.set(d.org, await readClientOptions(db, d.org).then((o) => o.approvalRequired, async (error: unknown) => {
        await gateSkipped(db, d.org, d.id, error)
        return false
      }))
    }
    if (gated.get(d.org) !== true) { pass.push(d); continue }
    const { clientApprovalHold } = await import('../clientGate')
    const reason = await clientApprovalHold(db, d.org, d.id).catch(async (error: unknown) => { await gateSkipped(db, d.org, d.id, error); return null })
    if (reason === null) { pass.push(d); continue }
    const held = await db
      .prepare(`UPDATE posts SET status = 'approved', scheduled_at = NULL, account_id = NULL, enqueued_for = NULL
                 WHERE id = ? AND org_id = ? AND status = 'queued' AND dispatched_at IS NULL RETURNING id`)
      .bind(d.id, d.org).first<{ id: string }>()
    if (held !== null) await record(db, { org: d.org, actor: 'dispatch', action: 'post.client_hold', target: d.id, detail: reason })
  }
  return pass
}

export async function dueNow(db: Db, now: Date, limit = DISPATCH_ROUND): Promise<DuePost[]> {
  const { results } = await db
    .prepare(
      `SELECT id, org_id, scheduled_at FROM posts
        WHERE status = 'queued' AND dispatched_at IS NULL AND scheduled_at <= ?1
          AND (enqueued_for IS NOT scheduled_at OR scheduled_at <= ?3)
        ORDER BY scheduled_at
        LIMIT ?2`,
    )
    .bind(dbNow(now), limit, dbNow(new Date(now.getTime() - LOST_DELIVERY_SECONDS * 1000)))
    .all<{ id: string; org_id: string; scheduled_at: string }>()
  return results.map((r) => ({ id: r.id, org: r.org_id, scheduledAt: r.scheduled_at }))
}

/** ‏ما يحلّ قبل الدورة التالية ولم يُرسَل له بعد (D-320) — يُرسَل مؤجَّلًا إلى دقيقته. */
export async function dueAhead(db: Db, now: Date, limit = DISPATCH_ROUND): Promise<DuePost[]> {
  const { results } = await db
    .prepare(
      `SELECT id, org_id, scheduled_at FROM posts
        WHERE status = 'queued' AND dispatched_at IS NULL
          AND scheduled_at > ?1 AND scheduled_at <= ?2
          AND enqueued_for IS NOT scheduled_at
        ORDER BY scheduled_at
        LIMIT ?3`,
    )
    .bind(dbNow(now), dbNow(new Date(now.getTime() + DISPATCH_HORIZON_SECONDS * 1000)), limit)
    .all<{ id: string; org_id: string; scheduled_at: string }>()
  return results.map((r) => ({ id: r.id, org: r.org_id, scheduledAt: r.scheduled_at }))
}

export interface Enqueued { readonly id: string; readonly org: string; readonly due: string }

/**
 * ‏**يعلّم المؤجَّلَ بموعده ذرّيًّا** (D-320) — كما يختم `markDispatched`: دورتان معًا تعلّمان الصفَّ مرّةً، والقاعدةُ تعيد ما
 * ‏علّمته هي فيُرسَل ذاك وحده. **ولا يُختَم `dispatched_at`**: المنشورُ لم يغادر بعد، ويُسحب ويُغيَّر موعدُه حتّى دقيقته.
 */
export async function markEnqueued(db: Db, ids: readonly string[], now: Date): Promise<readonly Enqueued[]> {
  if (ids.length === 0) return []
  const { results } = await db
    .prepare(
      `UPDATE posts SET enqueued_for = scheduled_at
        WHERE id IN (SELECT value FROM json_each(?1)) AND status = 'queued' AND dispatched_at IS NULL
          AND scheduled_at > ?2 AND scheduled_at <= ?3 AND enqueued_for IS NOT scheduled_at
        RETURNING id, org_id, scheduled_at`,
    )
    .bind(JSON.stringify(ids), dbNow(now), dbNow(new Date(now.getTime() + DISPATCH_HORIZON_SECONDS * 1000)))
    .all<{ id: string; org_id: string; scheduled_at: string }>()
  return results.map((r) => ({ id: r.id, org: r.org_id, due: r.scheduled_at }))
}

/** ‏يرفع علامةَ المؤجَّل عمّا لم يصل الطابور (D-320) — والشرطُ على الموعد نفسِه، فلا يُرفَع ما علّمته دورةٌ لموعدٍ آخر. */
export async function unmarkEnqueued(db: Db, marked: readonly Enqueued[]): Promise<void> {
  for (const m of marked) {
    await db.prepare('UPDATE posts SET enqueued_for = NULL WHERE id = ? AND org_id = ? AND enqueued_for = ?').bind(m.id, m.org, m.due).run()
  }
}

/** ‏كم ثانيةً حتّى الموعد — صفرٌ لما حلّ، ولا أكثرَ من الأفق. */
function secondsUntil(due: string, now: Date): number {
  const at = parseSqliteUtc(due)
  if (at === null) return 0
  return Math.min(DISPATCH_HORIZON_SECONDS, Math.max(0, Math.ceil((at.getTime() - now.getTime()) / 1000)))
}

export type Claim =
  /** ‏خُتم الآن، أو هي إعادةٌ للرسالة نفسِها بعد ختمها (مراجعة D-320): تمضي إلى الناشر. */
  | { readonly kind: 'claimed' }
  /** ‏وصل قبل دقيقته: يُعاد بما بقي. */
  | { readonly kind: 'early'; readonly seconds: number }
  /** ‏الإيقافُ قائم: لا يُختَم (ويُرفع ختمُ الإعادة)، وتُرفع علامتُه فتعيده الدورةُ بعد الاستئناف. */
  | { readonly kind: 'paused'; readonly reason: string }
  /** ‏سُحب أو تغيّر موعدُه أو خُتم بغيره: لا يفعل شيئًا. */
  | { readonly kind: 'stale' }

/**
 * ‏**الختمُ عند الوصول** (D-320): الرسالةُ المؤجَّلةُ تختم منشورَها حين تصل في دقيقته **وما زال كما أُرسلت له** — مجدولًا،
 * ‏لم يُختَم، وموعدُه موعدُها. **بجملةٍ واحدةٍ وبساعة القاعدة**: سحبٌ أو تغييرٌ أو «تراجَع» قبل الدقيقة يغلب لأنّه وقع قبلها في
 * ‏القاعدة، وما بعدها يجد الختمَ فيُردّ (`dispatched_at IS NULL` في حرّاسها). **والإيقافُ يغلب** كما يغلب في الدورة.
 *
 * ‏**وإعادةُ الرسالة نفسِها تمضي بختمها** (مراجعة D-320): كان التسليمُ الثاني يجد الختمَ الذي وضعه الأوّلُ فيُردّ `stale`، فعطلٌ
 * ‏بعد الختم (‏429، أو رمزٌ يقترب انتهاؤه، أو D1 لحظةً، أو حجزٌ فُكّ لأنّ الدفترَ سقط) يُقَرّ بلا نشرٍ حتّى يكنسه الكنّاسُ «فشل»
 * ‏بعد ستّين دقيقة — وهذا المسارُ الغالب. فالإعادةُ (`redelivery`: رقمُ التسليم فوق الأوّل) تمضي ما دام المنشورُ مجدولًا بموعدها
 * ‏**والعلامةُ علامتُها** (`enqueued_for = due`): ختمُ الدورة الفوريّ يمحو العلامة (`markDispatched`)، فرسالةٌ تأخّرت حتّى أرسلت
 * ‏الدورةُ منشورَها لا تمضي. **ولا يُختَم ثانية** (`coalesce`): الكنّاسُ يعدّ من الختم الأوّل. **ومنعُ الإرسال المزدوج للناشر**:
 * ‏سؤالا `succeeded` و`sent` ومحفّزُ D-004 (0047). والتسليمُ المكرَّرُ الأوّلُ بعد ختم أخيه يبقى `stale` كما كان.
 */
export async function claimDelivery(db: Db, postId: string, org: string, due: string, redelivery = false): Promise<Claim> {
  const allowance = await checkAllowance(db, 'publish')
  if (allowance.blocker !== null) {
    // ‏وإعادةٌ بعد ختمها يُرفع ختمُها أيضًا: بلا هذا يبقى «أُرسل» بلا رسالةٍ حتّى يكنسه الكنّاسُ «فشل» والإيقافُ قائم
    await db
      .prepare(
        `UPDATE posts SET enqueued_for = NULL, dispatched_at = CASE WHEN ?4 THEN NULL ELSE dispatched_at END
          WHERE id = ?1 AND org_id = ?2 AND enqueued_for = ?3 AND status = 'queued'`,
      )
      .bind(postId, org, due, redelivery ? 1 : 0)
      .run()
    return { kind: 'paused', reason: blockerReason(allowance.blocker) }
  }
  // ‏ورأيٌ تبدّل بين الإرسال المؤجَّل ووصوله يُمسك هنا أيضًا (مراجعة D-425): يعود معتمَدًا بلا موعد، فالرسالةُ لا تجد ما تختمه
  // ‏والإعادةُ بعد ختمها مضى عليها الحارسُ حين خُتمت
  if (!redelivery && (await clearForDispatch(db, [{ id: postId, org }])).length === 0) return { kind: 'stale' }
  const claimed = await db
    .prepare(
      `UPDATE posts SET dispatched_at = coalesce(dispatched_at, datetime('now'))
        WHERE id = ?1 AND org_id = ?2 AND status = 'queued'
          AND scheduled_at = ?3 AND scheduled_at <= datetime('now')
          AND (dispatched_at IS NULL OR (?4 AND enqueued_for = ?3))
        RETURNING id`,
    )
    .bind(postId, org, due, redelivery ? 1 : 0)
    .first<{ id: string }>()
  if (claimed !== null) return { kind: 'claimed' }
  const row = await db
    .prepare(
      `SELECT status, dispatched_at, scheduled_at,
              CAST(strftime('%s', scheduled_at) AS INTEGER) - CAST(strftime('%s', 'now') AS INTEGER) AS wait
         FROM posts WHERE id = ? AND org_id = ?`,
    )
    .bind(postId, org)
    .first<{ status: string; dispatched_at: string | null; scheduled_at: string | null; wait: number | null }>()
  if (row !== null && row.status === 'queued' && row.dispatched_at === null && row.scheduled_at === due && (row.wait ?? 0) > 0) {
    return { kind: 'early', seconds: Math.min(DISPATCH_HORIZON_SECONDS, (row.wait ?? 0) + 1) }
  }
  return { kind: 'stale' }
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
  /*
   * ‏**وتُمحى علامةُ المؤجَّل** (مراجعة D-320): ما ختمته الدورةُ هنا رسالتُه فوريّة، ورسالةٌ مؤجَّلةٌ تأخّرت حتّى هذه اللحظة
   * ‏تصل فتجد العلامةَ ليست لها فلا تمضي ولو كانت إعادة (`claimDelivery`). ورفعُ الختم بعد سقوط الإرسال لا يعيدها: المنشورُ
   * ‏مستحقٌّ والدورةُ التالية ترسله.
   */
  const { results } = await db
    .prepare(
      `UPDATE posts SET dispatched_at = ?, enqueued_for = NULL
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
  readonly queue: { sendBatch(messages: DispatchMessage[]): Promise<unknown> }
  readonly now?: () => Date
  /** ‏حجمُ الجولة — `DISPATCH_ROUND` ما لم يُقَل. */
  readonly limit?: number
}

/** ‏رسالةُ النشر: المستحقُّ بلا موعد، والمؤجَّلُ بمنظّمته وموعده ومهلته (D-320). */
export interface DispatchMessage {
  readonly body: { readonly postId: string; readonly org?: string; readonly due?: string }
  readonly delaySeconds?: number
}

export type DispatchReport =
  /** ‏`count` ما أُرسل مستحقًّا وخُتم، و`ahead` ما أُرسل مؤجَّلًا إلى دقيقته (D-320). */
  | { readonly kind: 'sent'; readonly count: number; readonly ids: readonly string[]; readonly ahead: number }
  | { readonly kind: 'none' }
  | { readonly kind: 'blocked'; readonly reason: string }

/**
 * دورةُ الربع: تقرأ المستحقّ وترسله — **وما يحلّ قبل الدورة التالية ترسله مؤجَّلًا إلى دقيقته** (D-320).
 *
 * والحارسُ العامّ أوّلا — **الإيقافُ يوقف النشر كما يوقف النداء**. ومفتاحٌ
 * يوقف الإنفاق ويترك المنشورات تخرج ليس مفتاحَ إيقاف. ‏والمؤجَّلُ يُسأل عنه ثانيةً حين يصل (`claimDelivery`).
 */
export async function dispatchDue(deps: DispatchDeps): Promise<DispatchReport> {
  const now = (deps.now ?? (() => new Date()))()
  const round = deps.limit ?? DISPATCH_ROUND

  const allowance = await checkAllowance(deps.db, 'publish')
  if (allowance.blocker !== null) {
    return { kind: 'blocked', reason: blockerReason(allowance.blocker) }
  }

  // ١ — ما حلّ: يُختَم ثمّ يُرسَل فورًا، جولةً بعد جولة (D-320) حتّى يفرغ أو تبلغ الجولاتُ حدَّها
  const ids: string[] = []
  for (let r = 0; r < DISPATCH_ROUNDS; r += 1) {
    const due = await dueNow(deps.db, now, round)
    if (due.length === 0) break
    // ‏ما أمسكه رأيُ العميل يعود معتمَدًا بلا موعد، فلا يعود في الجولة التالية (مراجعة D-425)
    const clear = await clearForDispatch(deps.db, due)
    // ‏ما ختمته هذه الدورةُ وحدَه يُرسَل: دورةٌ متزامنةٌ قد سبقت إلى بعضه (D-269)
    const stamped = await markDispatched(deps.db, clear.map((d) => d.id), now)
    try {
      await sendChunked(deps.queue, stamped.map((s): DispatchMessage => ({ body: { postId: s.id } })))
    } catch (error) {
      await unmarkDispatched(deps.db, stamped, now)
      throw error
    }
    ids.push(...stamped.map((s) => s.id))
    if (due.length < round) break
  }

  // ٢ — ما يحلّ قبل الدورة التالية: يُعلَّم بموعده ويُرسَل مؤجَّلًا إلى دقيقته، **ولا يُختَم** (D-320)
  const ahead = await enqueueAhead({ ...deps, now: () => now })

  if (ids.length === 0 && ahead === 0) return { kind: 'none' }
  return { kind: 'sent', count: ids.length, ids, ahead }
}

/**
 * ‏**ما يحلّ قبل الدورة التالية يُرسَل مؤجَّلًا إلى دقيقته** (D-320) — جزءُ الدورة الثاني، وتناديه اللوحةُ أيضًا بعد الجدولة
 * ‏(`dispatchSoon`): موعدٌ بعد خمس دقائق يُضبط بين دورتين فلا تراه دورةٌ قبله. ويعيد كم أُرسل.
 *
 * ‏**ولا حارسَ للإيقاف هنا**: الرسالةُ لا تختم ولا تنشر، والإيقافُ يُسأل عنه حين تصل (`claimDelivery`) فيغلب كما يغلب في الدورة.
 */
export async function enqueueAhead(deps: DispatchDeps): Promise<number> {
  const now = (deps.now ?? (() => new Date()))()
  const round = deps.limit ?? DISPATCH_ROUND
  let ahead = 0
  for (let r = 0; r < DISPATCH_ROUNDS; r += 1) {
    const soon = await dueAhead(deps.db, now, round)
    if (soon.length === 0) break
    const clear = await clearForDispatch(deps.db, soon)
    const marked = await markEnqueued(deps.db, clear.map((d) => d.id), now)
    try {
      await sendChunked(deps.queue, marked.map((m): DispatchMessage => ({
        body: { postId: m.id, org: m.org, due: m.due },
        delaySeconds: secondsUntil(m.due, now),
      })))
    } catch (error) {
      await unmarkEnqueued(deps.db, marked)
      throw error
    }
    ahead += marked.length
    if (soon.length < round) break
  }
  return ahead
}

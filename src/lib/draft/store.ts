/**
 * قراءةُ المسوّدات والبَتُّ فيها.
 *
 * ## لماذا لا يُكتب `approved_at` إلّا هنا
 *
 * D-009 قيدٌ في القاعدة لا عادةٌ في الشيفرة:
 * `status NOT IN ('queued','published') OR approved_at IS NOT NULL`.
 * فالاعتمادُ ليس علما يُرفع، بل **الشرطُ الوحيد الذي يفتح الطابور**.
 * ولذلك يمرّ كلُّ اعتمادٍ من دالّةٍ واحدة تكتب `approved_by` معه: قرارٌ
 * بلا صاحبٍ مسمّى لا يُراجَع بعد شهر.
 *
 * ## والرفضُ لا يُحذف
 *
 * المسوّدةُ المرفوضة تبقى صفّا بحالة `rejected`: كلفتُها وقعت وسُجّلت،
 * وحذفُها يجعل الدفترَ يذكر إنفاقا لا أثر له. **وما دُفع ثمنُه يُرى.**
 *
 * ## والتعديلُ يُعاد فحصُ طوله
 *
 * المالك يلصق ما يشاء في مربّع النصّ. ونصٌّ فوق حدّ المنصّة يُرفض عند
 * النشر بعد أسابيع — فيُمسك عند الاعتماد لا عند الإرسال.
 */
import { PLATFORMS } from './prompt'
import type { Db } from '../tokens'
import type { PublishPlatform } from '../oauth/providers'
import { containsUrl } from '../idempotency'
import { estimatePostCost } from '../cost'
import { postLength } from './length'
import { captionProblem, isVideoPlatform } from '../media/uploads'
import { briefError } from '../platform/screen'

export type DraftStatus = 'draft' | 'approved' | 'edited' | 'rejected' | 'queued' | 'published' | 'failed'

export interface DraftRow {
  readonly id: string
  /**
   * منصّةُ المنشور كما في القاعدة — **الخمسُ لا الأربعُ التي تُكتب لها مسوّدة**.
   * فمنشورُ Instagram من «فيديوهاتك» أو من الخطّة يُعرَض باسمه ويُجدوَل إلى حسابه.
   */
  readonly platform: PublishPlatform
  readonly text: string
  readonly rationale: string | null
  readonly status: DraftStatus
  readonly model: string | null
  readonly cost: number
  readonly sourceId: string | null
  readonly sourceName: string | null
  /** أتغيّر المصدرُ بعد أن كُتبت؟ نصٌّ يصف نسخةً ولّت. */
  readonly stale: boolean
  readonly approvedBy: string | null
  readonly approvedAt: string | null
  readonly createdAt: string
  /** موعدُ النشر إن جُدول — بصيغة القاعدة (UTC). */
  readonly scheduledAt: string | null
  /** الحسابُ الذي سيُنشر إليه، باسمه لا بمعرّفه. */
  readonly accountName: string | null
  /** خُتم حين غادرت الرسالةُ إلى الطابور — وبعده لا سحب. */
  readonly dispatchedAt: string | null
  /**
   * ما سيُدفَع للمنصّة عند النشر — **لا ما دُفع للنموذج عند الكتابة**.
   *
   * و`cost` فوقُ هو الثاني: كلفةُ التوليد، وقد وقعت. وهذا ما لم يقع
   * بعدُ، **وهو الذي يبتّ فيه المالك**: منشورٌ برابطٍ على X بمئتي
   * جزءٍ من الألف، وبلا رابطٍ بخمسةَ عشر — ثلاثةَ عشرَ ضعفا (D-003).
   *
   * **ويُشتقُّ من النصّ لا من العمود**: العمودُ كان يُكتب صفرا حرفا،
   * وصفوفٌ قديمةٌ تحمله كذلك (D-069).
   */
  readonly publishCost: number
  /**
   * النصُّ كما كتبه النموذجُ قبل أن يعدّله المالك — **أو `null` إن اعتُمد
   * كما كُتب** (D-128). يُحفَظ عند أوّل تعديلٍ ولا يُكتب ثانية، **والفرقُ
   * يُشتَقّ منه في الشاشة ولا يُخزَّن.**
   */
  readonly originalText: string | null
  /**
   * سببُ آخرِ فشلٍ كما حفظه الناشر، مختصرًا (`briefError`) — **للفاشل وحدَه**، و`null`
   * لما سواه. كانت بطاقةُ الفاشل في «المنشورات» تقول «فشل النشر» بلا سببٍ ولا زرّ
   * (رحلة R-8)، والسببُ والإعادةُ في صفحة المنصّة وحدَها.
   *
   * **واختياريٌّ** لأنّ صفوفًا تُبنى في العرض بلا قاعدة (العيّناتُ والاختبارات)؛ وغيابُه
   * يُقرأ «بلا سببٍ مسجَّل» كما يقرؤه `whyFailed`.
   */
  readonly failure?: string | null
}

interface Raw {
  id: string
  platform: string
  text: string
  rationale: string | null
  status: string
  model: string | null
  cost_usd: number
  source_id: string | null
  source_hash: string | null
  source_name: string | null
  current_hash: string | null
  approved_by: string | null
  approved_at: string | null
  created_at: string
  scheduled_at: string | null
  dispatched_at: string | null
  account_name: string | null
  original_text: string | null
  fail_json: string | null
}

/**
 * منصّاتُ المنشور كلُّها — **وتقابل قيدَ `posts.platform` في 0022**.
 */
const POST_PLATFORMS: readonly PublishPlatform[] = ['linkedin', 'x', 'tiktok', 'youtube', 'instagram']

/**
 * منصّةُ الصفّ كما هي — **لا «x أو linkedin»، ولا «ما تُكتب له مسوّدةٌ أو linkedin»**.
 *
 * كان كلُّ ما ليس X يُقرأ LinkedIn، فمسوّدةُ TikTok أو YouTube تُعرض بشعار
 * LinkedIn. ثمّ صار يُقرأ من `PLATFORMS` — وهي ما تُكتب له مسوّدة، وInstagram
 * ليست فيها — **فبقي منشورُ Instagram من «فيديوهاتك» يُعرَض «LinkedIn»**، ويُعرَض
 * له حسابُ LinkedIn وحده، ويسنده «وزّع المعتمَد» إليه، ثمّ تردّه `schedulePost`.
 *
 * **ولا منصّةَ تُفترَض لصفٍّ لا نعرف منصّتَه**: القيدُ في القاعدة يمنعه، وإن وقع
 * فلا يُعرَض باسم منصّةٍ أخرى — يُترَك.
 */
function platformOf(raw: string): PublishPlatform | null {
  return (POST_PLATFORMS as readonly string[]).includes(raw) ? (raw as PublishPlatform) : null
}

function toDraft(row: Raw, platform: PublishPlatform): DraftRow {
  return {
    id: row.id,
    platform,
    text: row.text,
    rationale: row.rationale,
    status: row.status as DraftStatus,
    model: row.model,
    cost: row.cost_usd,
    sourceId: row.source_id,
    sourceName: row.source_name,
    stale:
      row.source_hash !== null &&
      row.current_hash !== null &&
      row.source_hash !== row.current_hash,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    createdAt: row.created_at,
    scheduledAt: row.scheduled_at,
    accountName: row.account_name,
    dispatchedAt: row.dispatched_at,
    publishCost: estimatePostCost(platform, containsUrl(row.text)),
    originalText: row.original_text ?? null,
    failure: row.status === 'failed' ? briefError(row.fail_json ?? null) : null,
  }
}

/**
 * أحدثُ المسوّدات.
 *
 * والجدولُ لا يُقرأ كلُّه: صفوفُه تنمو بلا حدّ، وسحبُها إلى Worker ليُفرز
 * فيه يصطدم بحدّ المعالجة قبل أن يُفيد.
 */
export async function listDrafts(db: Db, limit = 60): Promise<DraftRow[]> {
  return selectDrafts(db, '', [], limit)
}

/**
 * منشورٌ واحدٌ بمعرّفه، أيًّا كان عمرُه (D-198) — **المحرّرُ يفتح ما لم تبلغه الستّون**.
 * بالاستعلام نفسِه الذي تقرأ به القائمةُ بطاقاتِها، فلا يفترق ما يُرى هنا عمّا يُرى هناك.
 */
export async function getDraft(db: Db, id: string): Promise<DraftRow | null> {
  if (id === '') return null
  const [row] = await selectDrafts(db, 'p.id = ?', [id], 1)
  return row ?? null
}

async function selectDrafts(db: Db, where: string, values: readonly unknown[], limit: number): Promise<DraftRow[]> {
  try {
    const { results } = await db
      .prepare(
        `SELECT p.id, p.platform, p.text, p.rationale, p.status, p.model, p.cost_usd,
                p.source_id, p.source_hash, p.approved_by, p.approved_at, p.created_at,
                p.scheduled_at, p.dispatched_at, p.original_text,
                s.name AS source_name, s.content_hash AS current_hash,
                a.display_name AS account_name,
                -- ‏وسببُ آخرِ محاولةٍ فاشلةٍ للفاشل وحدَه: لا استعلامَ فرعيَّ لما لم يفشل
                CASE WHEN p.status = 'failed' THEN
                  (SELECT pa.response_json FROM publish_attempts pa
                    WHERE pa.post_id = p.id AND pa.status = 'failed'
                    ORDER BY pa.attempt_no DESC LIMIT 1) END AS fail_json
           FROM posts p
           LEFT JOIN sources s ON s.id = p.source_id
           LEFT JOIN accounts a ON a.id = p.account_id${where === '' ? '' : `
          WHERE ${where}`}
          ORDER BY p.created_at DESC
          LIMIT ?`,
      )
      .bind(...values, limit)
      .all<Raw>()
    return results.flatMap((row) => {
      const platform = platformOf(row.platform)
      return platform === null ? [] : [toDraft(row, platform)]
    })
  } catch {
    // جدولٌ لم يُرحَّل بعد: لوحةٌ تُفتح خاليةً خيرٌ من لوحةٍ لا تُفتح
    return []
  }
}

/**
 * القرار.
 *
 * والاعتمادُ يحمل النصَّ دائما — **لا زرَّين: «اعتمد» و «اعتمد التعديل».**
 * فزرّان يعنيان أنّ المالك قد يحرّر المربّع ثمّ يضغط الأوّل، فيُعتمد نصٌّ
 * ليس الذي رآه. وهنا يُرسَل ما في المربّع كما هو، وتقارنه القاعدةُ بما
 * حُفظ: إن تطابقا فـ `approved`، وإلّا فـ `edited`. **والحالةُ تُستنتَج
 * ولا تُسأل.**
 */
export type Decision =
  | { readonly kind: 'approve'; readonly text: string }
  | { readonly kind: 'reject' }

export type DecisionResult =
  | { readonly ok: true; readonly status: DraftStatus }
  | { readonly ok: false; readonly reason: string }

/** نصٌّ بأسطر `\n` وحدها، بلا فراغٍ في طرفيه — كما يُعَدّ ويُقارَن ويُحفَظ ويُنشَر. */
function lines(text: string): string {
  return text.replace(/\r\n?/g, '\n').trim()
}

/** بَتٌّ واحد. و `by` اسمُ صاحب القرار — يُكتب مع القرار لا بعده. */
export async function decide(
  db: Db,
  id: string,
  decision: Decision,
  by: string,
): Promise<DecisionResult> {
  const row = await db
    .prepare('SELECT id, platform, status, text, original_text FROM posts WHERE id = ?')
    .bind(id)
    .first<{ id: string; platform: string; status: string; text: string; original_text: string | null }>()
  if (row === null) return { ok: false, reason: 'لا مسوّدة بهذا المعرّف' }

  // ما غادر المسوّدةَ لا يُبَتّ فيه ثانية: منشورٌ نُشر لا يُعتمد، ومصفوفٌ
  // في الطابور لا يُرفض من هنا — وسحبُه بابُه `unschedule`، وقبل الإرسال وحده
  if (row.status !== 'draft') {
    return { ok: false, reason: `${STATUS_WORD[row.status] ?? 'لم تعد مسوّدة'}، والبَتُّ للمسوّدة وحدها` }
  }

  if (decision.kind === 'reject') {
    await db
      .prepare("UPDATE posts SET status = 'rejected', approved_by = ? WHERE id = ?")
      .bind(by, id)
      .run()
    return { ok: true, status: 'rejected' }
  }

  /*
   * **والأسطرُ توحَّد قبل كلّ شيء** — قبل العدّ والمقارنة والحفظ.
   *
   * المتصفّحُ يرسل مربّعَ النصّ بأسطر `\r\n` أيًّا كان ما فيه. فكان «اعتمد» بلا لمسةٍ
   * يقارن نصًّا بـ `\r\n` بمحفوظٍ بـ `\n` فيكتب `edited` ويحفظ الأصلَ، **ويُنشَر النصُّ
   * حاملًا `\r`**، ويعدّ كلَّ سطرٍ محرفًا زائدًا: مسوّدةُ X بستّة أسطرٍ يقول عدّادُها
   * «278 / 280» تُردّ بـ «284 محرفا» ولا تُعتمَد أبدًا.
   */
  const text = lines(decision.text)
  const refused = textProblem(row.platform, text)
  if (refused !== null) return { ok: false, reason: refused }

  // ‏والمقارنةُ بما كُتب أوّلًا (D-198): نصٌّ حُفظ بـ«احفظ» صار `text` وأصلُه في `original_text`،
  // ‏فيُقارَن بالأصل، وإلّا اعتُمد المعدَّلُ «كما كُتب» وضاع فرقُه (D-128)
  const status: DraftStatus = text === lines(row.original_text ?? row.text) ? 'approved' : 'edited'

  // `approved_at` و `approved_by` معا في جملةٍ واحدة: اعتمادٌ بلا صاحبٍ
  // مسمّى قرارٌ لا يُراجَع بعد شهر
  /*
   * **و`has_url` يُعاد حسابُه هنا لا يُترَك.**
   *
   * المالكُ يعتمد بنصِّه بعد التعديل — فنصٌّ بلا رابطٍ عند الكتابة قد
   * يخرج من هنا برابط، **وثمنُه على X ثلاثةَ عشرَ ضعفا** (D-003).
   * وعمودٌ حُسب مرّةً عند الكتابة يبقى يقول ما بطل، **واللوحةُ تعرض
   * ثمنا أرخصَ ممّا سيُدفَع** (D-069).
   */
  /*
   * **والأصلُ يُحفَظ عند أوّل تعديلٍ ولا يُكتب ثانية** (D-128): `COALESCE`
   * يبقي ما حُفظ إن كان، ويكتب النصَّ الذي كان قبل هذا التعديل إن لم يكن.
   * واعتمادٌ بلا تعديلٍ لا يكتب شيئا — `NULL` تعني «كما كُتب».
   */
  await db
    .prepare(
      `UPDATE posts SET text = ?, has_url = ?, status = ?, approved_by = ?,
              approved_at = datetime('now'),
              original_text = CASE WHEN ? = 'edited' THEN COALESCE(original_text, ?) ELSE original_text END
        WHERE id = ?`,
    )
    .bind(text, containsUrl(text) ? 1 : 0, status, by, status, row.text, id)
    .run()
  return { ok: true, status }
}

/**
 * التراجعُ عن رفض (D-100) — **ومعه التراجعُ عن الاعتماد** (`undoApprove` أدناه).
 *
 * ## لماذا الرفضُ والاعتمادُ، ولا سحبُ الموعد
 *
 * الرفضُ عمودٌ واحدٌ يُقلَب: `rejected` ← `draft`، و`approved_by` يُمحى.
 * ولا يفقد شيئا في الطريق، ولا يحتاج قيمةً تُستعاد. والاعتمادُ مثلُه: ما
 * يُستعاد (النصُّ قبل التعديل) محفوظٌ في `original_text`.
 *
 * **وسحبُ الموعد ليس كذلك**: التراجعُ عنه يحتاج موعدا قد يكون مضى بينما
 * كان المالكُ يقرأ الإشعار — وإعادتُه تتخطّى حارسَ الجدولة الذي يمنع
 * موعدا في الماضي. **وزرٌّ يتخطّى حارسا ليس زرّا** (D-019)، فيبقى له
 * سؤالُه قبل الفعل.
 *
 * ## ولا يُتراجَع عمّا لم يقع
 *
 * الشرطُ أنّ الحالَ `rejected` الآن. فمسوّدةٌ رُفضت ثمّ كُتب فوقها شيءٌ
 * آخر — أو رُفضت في تبويبٍ ثانٍ ثمّ أُعيدت — **لا يُقلَب حالُها بضغطةٍ
 * على إشعارٍ شاخ**.
 */
export async function undoReject(db: Db, id: string): Promise<DecisionResult> {
  const row = await db
    .prepare('SELECT id, status FROM posts WHERE id = ?')
    .bind(id)
    .first<{ id: string; status: string }>()
  if (row === null) return { ok: false, reason: 'لا مسوّدة بهذا المعرّف' }
  if (row.status !== 'rejected') {
    return { ok: false, reason: `${STATUS_WORD[row.status] ?? 'ما زالت مسوّدة'}، والتراجعُ عن الرفض وحدَه` }
  }

  await db
    .prepare("UPDATE posts SET status = 'draft', approved_by = NULL WHERE id = ?")
    .bind(id)
    .run()
  return { ok: true, status: 'draft' }
}

/**
 * التراجعُ عن اعتماد — **ما دام لم يُجدوَل** (الخطّة 7.8، ر-0).
 *
 * كان الرفضُ وحدَه يُتراجَع عنه. و«ارفض» على بُعد ‏8px من «اعتمد»، فضغطةٌ خاطئةٌ
 * على الثاني كانت تُدخل المنشورَ «وزّع المعتمَد» ولا طريقَ إلى المسوّدة.
 *
 * **والتراجعُ يُعيد ما كان قبل الضغطة كلَّه**: الحالُ `draft`، و`approved_at`
 * و`approved_by` يُمحيان، **والنصُّ يعود من `original_text` إن كان عُدِّل** — فالاعتمادُ
 * هو الذي حفظ التعديل، والتراجعُ عنه تراجعٌ عنه. و`has_url` يُعاد حسابُه من النصّ
 * العائد (D-069).
 *
 * **والشرطُ في جملة التحديث نفسِها**: إشعارٌ شاخ في تبويبٍ منسيّ لا يسحب
 * منشورًا جُدول بعده — `queued` لا تطابق، فيُردّ.
 */
export async function undoApprove(db: Db, id: string): Promise<DecisionResult> {
  const row = await db
    .prepare('SELECT status, text, original_text FROM posts WHERE id = ?')
    .bind(id)
    .first<{ status: string; text: string; original_text: string | null }>()
  if (row === null) return { ok: false, reason: 'لا مسوّدة بهذا المعرّف' }
  if (row.status !== 'approved' && row.status !== 'edited') {
    return {
      ok: false,
      reason: row.status === 'queued'
        ? 'جُدولت بعد الاعتماد — اسحب موعدَها أوّلًا'
        : `${STATUS_WORD[row.status] ?? 'ما زالت مسوّدة'}، والتراجعُ عن الاعتماد قبل الجدولة وحدَه`,
    }
  }

  // ‏والأصلُ يُمحى حين يعود النصُّ إليه وحدَه: معتمَدٌ بلا تعديلٍ يحمل أصلًا من تعديلٍ سبق
  // ‏(أُعيد من الفشل فصار `approved`) يبقى أصلُه — فهو أثرُ ما كتبه النموذج (D-128)
  const original = row.status === 'edited' ? row.original_text : null
  const restore = original !== null
  const text = original ?? row.text
  const moved = await db
    .prepare(
      `UPDATE posts SET status = 'draft', approved_at = NULL, approved_by = NULL,
              text = ?, has_url = ?, original_text = CASE WHEN ? = 1 THEN NULL ELSE original_text END
        WHERE id = ? AND status IN ('approved', 'edited')
        RETURNING id`,
    )
    .bind(text, containsUrl(text) ? 1 : 0, restore ? 1 : 0, id)
    .first<{ id: string }>()
  if (moved === null) return { ok: false, reason: 'تغيّرت حالُها قبل التراجع — أعد تحميل الصفحة' }
  return { ok: true, status: 'draft' }
}

/** حصيلةُ بَتٍّ جماعيّ — **ولكلِّ متعثّرٍ سببُه باسمه**. */
export interface BulkResult {
  readonly done: readonly string[]
  readonly failed: readonly { readonly id: string; readonly reason: string }[]
}

/**
 * اعتمادُ جملةٍ من المسوّدات — **بنصّها المحفوظ لا بنصٍّ مُرسَل** (D-100).
 *
 * ## ولا حارسَ ثانٍ يُكتب هنا
 *
 * تنادي `decide` لكلِّ واحدة، فتمرّ من الفحوص نفسِها: الحالُ `draft`،
 * والطولُ بحساب المنصّة، و`has_url` يُعاد حسابُه، و`approved_at` مع
 * `approved_by` في جملةٍ واحدة. **وطريقٌ جانبيٌّ حول الحارس هو عينُ ما
 * كشفه D-019.**
 *
 * ## والنصُّ من القاعدة لا من النموذج
 *
 * البَتُّ الجماعيُّ لا يحرّر: المالكُ يعتمد ما قرأه كما هو. **فيُقرأ
 * المحفوظُ ويُمرَّر إلى `decide`**، فتخرج الحالُ `approved` لا `edited` —
 * وهي الحقيقة: لم يُعدَّل شيء.
 *
 * ولو أُخذ النصُّ من النموذج لأمكن أن يُرسَل لمسوّدةٍ نصُّ أخرى.
 *
 * ## وواحدةٌ تتعثّر لا توقف البقيّة
 *
 * مسوّدةٌ فوق حدّ المنصّة تُردّ **باسمها وسببها**، ويمضي ما عداها.
 * **وحصيلةٌ تقول «فشل» بلا تسمية تجعل المالك يعيد الكلّ.**
 */
export async function approveMany(
  db: Db,
  ids: readonly string[],
  by: string,
): Promise<BulkResult> {
  const done: string[] = []
  const failed: { id: string; reason: string }[] = []

  for (const id of ids) {
    const row = await db
      .prepare('SELECT text FROM posts WHERE id = ?')
      .bind(id)
      .first<{ text: string }>()
    if (row === null) {
      failed.push({ id, reason: 'لا مسوّدة بهذا المعرّف' })
      continue
    }
    const result = await decide(db, id, { kind: 'approve', text: row.text }, by)
    if (result.ok) done.push(id)
    else failed.push({ id, reason: result.reason })
  }

  return { done, failed }
}

/** حالُ المنشور بكلام المالك (D-198) — كان الردُّ يقول «حالتُها «queued»». */
const STATUS_WORD: Readonly<Record<string, string>> = {
  approved: 'اعتُمدت من قبل', edited: 'اعتُمدت من قبل', rejected: 'رُفضت من قبل',
  queued: 'مجدولةٌ الآن', published: 'نُشرت', failed: 'فشل نشرُها',
}

/**
 * ما يُردّ عليه النصّ قبل أن يُحفَظ أو يُعتمَد — **فحصٌ واحدٌ للبابين** (D-198).
 * «احفظ» بابٌ ثانٍ يكتب النصّ، وبابٌ يكتب بلا الفحص نفسِه يحفظ ما سيُردّ عند الاعتماد.
 */
function textProblem(platform: string, text: string): string | null {
  // ‏نصُّ المقطع وصفٌ لا منشور (D-182): حدُّه حدُّ منصّته، ولا «أربعين محرفًا» عليه
  if (isVideoPlatform(platform)) return captionProblem(platform, text)
  const spec = PLATFORMS[platform === 'x' ? 'x' : 'linkedin']
  if (text.length < 40) return 'النصّ أقصر من أن يكون منشورا'
  // الطولُ يُفحص هنا أيضا وبحساب المنصّة (D-071): نصٌّ فوق الحدّ يُرفض عند النشر بعد أسابيع
  const counted = postLength(text, spec.id)
  if (counted > spec.hardLimit) return `النصّ ${counted} محرفا بحساب ${spec.label} وهي تقبل ${spec.hardLimit}`
  return null
}

/**
 * «احفظ» في المحرّر (D-198) — **يكتب النصّ ولا يعتمده**.
 *
 * والحالُ تبقى `draft` (D-009: لا يمرّ شيءٌ إلى الطابور بلا اعتماد)، **والأصلُ يُحفَظ عند أوّل
 * تعديلٍ ولا يُكتب ثانية** (D-128) فيبقى الفرقُ يُقرأ بعد الاعتماد، و`has_url` يُعاد حسابُه (D-069).
 */
export async function saveText(db: Db, id: string, raw: string): Promise<DecisionResult> {
  const row = await db
    .prepare('SELECT id, platform, status, text FROM posts WHERE id = ?')
    .bind(id)
    .first<{ id: string; platform: string; status: string; text: string }>()
  if (row === null) return { ok: false, reason: 'لا مسوّدة بهذا المعرّف' }
  if (row.status !== 'draft') return { ok: false, reason: 'لم تعد مسوّدة، والحفظُ للمسوّدة وحدها' }
  const text = lines(raw)
  const refused = textProblem(row.platform, text)
  if (refused !== null) return { ok: false, reason: refused }
  if (text === lines(row.text)) return { ok: true, status: 'draft' }
  const moved = await db
    .prepare(
      `UPDATE posts SET text = ?, has_url = ?, original_text = COALESCE(original_text, ?)
        WHERE id = ? AND status = 'draft' RETURNING id`,
    )
    .bind(text, containsUrl(text) ? 1 : 0, row.text, id)
    .first<{ id: string }>()
  if (moved === null) return { ok: false, reason: 'تغيّرت حالُها قبل الحفظ، فأعد تحميل الصفحة' }
  return { ok: true, status: 'draft' }
}

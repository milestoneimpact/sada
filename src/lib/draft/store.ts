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
import { PLATFORMS, type Platform } from './prompt'
import type { Db } from '../tokens'
import { containsUrl } from '../idempotency'
import { estimatePostCost } from '../cost'
import { postLength } from './length'

export type DraftStatus = 'draft' | 'approved' | 'edited' | 'rejected' | 'queued' | 'published' | 'failed'

export interface DraftRow {
  readonly id: string
  readonly platform: Platform
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
}

function toDraft(row: Raw): DraftRow {
  return {
    id: row.id,
    platform: row.platform === 'x' ? 'x' : 'linkedin',
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
    publishCost: estimatePostCost(row.platform === 'x' ? 'x' : 'linkedin', containsUrl(row.text)),
  }
}

/**
 * أحدثُ المسوّدات.
 *
 * والجدولُ لا يُقرأ كلُّه: صفوفُه تنمو بلا حدّ، وسحبُها إلى Worker ليُفرز
 * فيه يصطدم بحدّ المعالجة قبل أن يُفيد.
 */
export async function listDrafts(db: Db, limit = 60): Promise<DraftRow[]> {
  try {
    const { results } = await db
      .prepare(
        `SELECT p.id, p.platform, p.text, p.rationale, p.status, p.model, p.cost_usd,
                p.source_id, p.source_hash, p.approved_by, p.approved_at, p.created_at,
                p.scheduled_at, p.dispatched_at,
                s.name AS source_name, s.content_hash AS current_hash,
                a.display_name AS account_name
           FROM posts p
           LEFT JOIN sources s ON s.id = p.source_id
           LEFT JOIN accounts a ON a.id = p.account_id
          ORDER BY p.created_at DESC
          LIMIT ?`,
      )
      .bind(limit)
      .all<Raw>()
    return results.map(toDraft)
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

/** بَتٌّ واحد. و `by` اسمُ صاحب القرار — يُكتب مع القرار لا بعده. */
export async function decide(
  db: Db,
  id: string,
  decision: Decision,
  by: string,
): Promise<DecisionResult> {
  const row = await db
    .prepare('SELECT id, platform, status, text FROM posts WHERE id = ?')
    .bind(id)
    .first<{ id: string; platform: string; status: string; text: string }>()
  if (row === null) return { ok: false, reason: 'لا مسوّدة بهذا المعرّف' }

  // ما غادر المسوّدةَ لا يُبَتّ فيه ثانية: منشورٌ نُشر لا يُعتمد، ومصفوفٌ
  // في الطابور لا يُرفض من هنا — وسحبُه بابُه `unschedule`، وقبل الإرسال وحده
  if (row.status !== 'draft') {
    return { ok: false, reason: `حالتُها «${row.status}» — والبَتُّ للمسوّدة وحدها` }
  }

  if (decision.kind === 'reject') {
    await db
      .prepare("UPDATE posts SET status = 'rejected', approved_by = ? WHERE id = ?")
      .bind(by, id)
      .run()
    return { ok: true, status: 'rejected' }
  }

  const spec = PLATFORMS[row.platform === 'x' ? 'x' : 'linkedin']
  const text = decision.text.trim()
  if (text.length < 40) return { ok: false, reason: 'النصّ أقصر من أن يكون منشورا' }
  // الطولُ يُفحص هنا أيضا: المالك يلصق ما يشاء، ونصٌّ فوق الحدّ يُرفض عند
  // النشر بعد أسابيع — فيُمسك عند الاعتماد لا عند الإرسال
  // وبحساب المنصّة كذلك (D-071): المالكُ يلصق رابطا فيُردّ رفضا كاذبا
  const counted = postLength(text, spec.id)
  if (counted > spec.hardLimit) {
    return {
      ok: false,
      reason: `النصّ ${counted} محرفا بحساب ${spec.label} وهي تقبل ${spec.hardLimit}`,
    }
  }

  const status: DraftStatus = text === row.text.trim() ? 'approved' : 'edited'
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
  await db
    .prepare(
      `UPDATE posts SET text = ?, has_url = ?, status = ?, approved_by = ?,
              approved_at = datetime('now')
        WHERE id = ?`,
    )
    .bind(text, containsUrl(text) ? 1 : 0, status, by, id)
    .run()
  return { ok: true, status }
}

/**
 * التراجعُ عن رفض — **وهو الفعلُ الوحيد الذي يُتراجَع عنه هنا** (D-090).
 *
 * ## لماذا الرفضُ وحدَه
 *
 * الرفضُ عمودٌ واحدٌ يُقلَب: `rejected` ← `draft`، و`approved_by` يُمحى.
 * ولا يفقد شيئا في الطريق، ولا يحتاج قيمةً تُستعاد.
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
    return { ok: false, reason: `حالتُها «${row.status}» — والتراجعُ عن الرفض وحدَه` }
  }

  await db
    .prepare("UPDATE posts SET status = 'draft', approved_by = NULL WHERE id = ?")
    .bind(id)
    .run()
  return { ok: true, status: 'draft' }
}

/** حصيلةُ بَتٍّ جماعيّ — **ولكلِّ متعثّرٍ سببُه باسمه**. */
export interface BulkResult {
  readonly done: readonly string[]
  readonly failed: readonly { readonly id: string; readonly reason: string }[]
}

/**
 * اعتمادُ جملةٍ من المسوّدات — **بنصّها المحفوظ لا بنصٍّ مُرسَل** (D-090).
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

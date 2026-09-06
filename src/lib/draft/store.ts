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
  // في الطابور لا يُرفض من هنا — سحبُه أمرٌ آخر يُبنى حين يُبنى الطابور
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
  if (text.length > spec.hardLimit) {
    return { ok: false, reason: `النصّ ${text.length} محرفا و ${spec.label} تقبل ${spec.hardLimit}` }
  }

  const status: DraftStatus = text === row.text.trim() ? 'approved' : 'edited'
  // `approved_at` و `approved_by` معا في جملةٍ واحدة: اعتمادٌ بلا صاحبٍ
  // مسمّى قرارٌ لا يُراجَع بعد شهر
  await db
    .prepare(
      "UPDATE posts SET text = ?, status = ?, approved_by = ?, approved_at = datetime('now') WHERE id = ?",
    )
    .bind(text, status, by, id)
    .run()
  return { ok: true, status }
}

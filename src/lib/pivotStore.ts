/**
 * حقائقُ اللوح المحوريّ من القاعدة — **استعلامٌ واحدٌ مسقوف** (D-120).
 *
 * ## ولا يُجمَع في الشيفرة ما تجمعه القاعدة
 *
 * المحاولاتُ تُعَدّ وتُصنَّف في `SQL` لا في حلقةٍ هنا: **صفٌّ واحدٌ لكلّ
 * منشور** يصل إلى Worker. ومئةُ منشورٍ بثلاث محاولاتٍ لكلٍّ تصير مئةَ
 * صفٍّ لا ثلاثمئة.
 *
 * ## والسقفُ يُقال ولا يُصمَت عنه
 *
 * `LIMIT` يحرس ذاكرةَ Worker، **وجدولٌ يقول «‏٥٠٠ منشورا» وفي القاعدة
 * ألفان يكذب صامتا**. فيُردّ `capped` مع الصفوف، وتقوله الشاشة.
 */
import type { Db } from './tokens'
import type { Fact } from './pivot'

/** أكثرُ ما يُحمَل — **ومنشورٌ واحدٌ صفٌّ واحد**. */
export const FACT_CAP = 1500

interface Row {
  platform: string | null
  account: string | null
  status: string | null
  day: string | null
  type: string | null
  attempts: number | null
  ok: number | null
  cost: number | null
}

export interface FactLoad {
  readonly facts: readonly Fact[]
  /** أبلغ السقفَ فطُوي ما بعده؟ */
  readonly capped: boolean
}

/**
 * يقرأ المنشوراتِ ومحاولاتِها وكلفتَها.
 *
 * **و`'succeeded'` لا `'success'`.** هي قيمةُ `CHECK` في المخطَّط، وقد
 * وقع الخطأُ نفسُه في `journey.ts` مرّةً **فظهر كلُّ نشرٍ ناجحٍ فاشلا**.
 *
 * **والكلفةُ تُضَمّ بمعرِّف المنشور** في `cost_ledger.ref_id` — وما لا
 * مرجعَ له لا يُنسَب إلى منشور، فلا يدخل الجدول.
 *
 * ## والمنصّةُ من `posts` لا من `accounts`
 *
 * نُقلت إلى الصفّ في الترحيل ‏٠٠٠٨ لأنّها **تُعرَف قبل الحساب**:
 * `account_id` يقبل الفراغ، والمسوّدةُ تُكتب قبل الربط.
 *
 * **وضمٌّ داخليٌّ (`JOIN`) كان يُسقط كلَّ مسوّدةٍ لم تُربَط بعد** — وهي
 * التي تنتظر قرارَ المالك، أي أهمُّ ما في الجدول. فالضمُّ أيسرُ
 * (`LEFT JOIN`)، والاسمُ وحدَه هو الذي يغيب فيُقرأ «—».
 */
export async function loadFacts(db: Db, org: string, sinceDays: number): Promise<FactLoad> {
  let rows: Row[] = []
  try {
    const result = await db
      .prepare(
        `SELECT p.platform                         AS platform,
                a.display_name                     AS account,
                p.status                           AS status,
                substr(p.scheduled_at, 1, 10)      AS day,
                p.type                             AS type,
                (SELECT count(*) FROM publish_attempts t WHERE t.post_id = p.id)
                                                   AS attempts,
                (SELECT count(*) FROM publish_attempts t
                  WHERE t.post_id = p.id AND t.status = 'succeeded')
                                                   AS ok,
                (SELECT coalesce(sum(c.total), 0) FROM cost_ledger c WHERE c.ref_id = p.id)
                                                   AS cost
           FROM posts p
           LEFT JOIN accounts a ON a.id = p.account_id
          WHERE p.org_id = ? AND p.scheduled_at >= datetime('now', ?)
          ORDER BY p.scheduled_at DESC
          LIMIT ?`,
      )
      .bind(org, `-${Math.max(1, Math.floor(sinceDays))} days`, FACT_CAP + 1)
      .all<Row>()
    rows = result.results
  } catch {
    // جدولٌ ناقصٌ أو ترحيلٌ لم يُطبَّق: جدولٌ فارغٌ لا صفحةٌ ساقطة
    return { facts: [], capped: false }
  }

  const capped = rows.length > FACT_CAP
  return {
    capped,
    facts: (capped ? rows.slice(0, FACT_CAP) : rows).map((r) => ({
      platform: r.platform ?? '',
      account: r.account ?? '',
      status: r.status ?? '',
      day: r.day ?? '',
      type: r.type ?? '',
      attempts: r.attempts ?? 0,
      // **ونجاحٌ واحدٌ يكفي**: منشورٌ أُعيدت محاولتُه ثمّ نجح ناجحٌ
      succeeded: (r.ok ?? 0) > 0,
      cost: r.cost ?? 0,
    })),
  }
}

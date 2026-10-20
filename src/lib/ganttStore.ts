/**
 * صفوفُ الخطّ الزمنيّ من القاعدة — **استعلامان مسقوفان**، كحقائق المحوريّ (D-120 · D-212).
 *
 * المنشورُ يدخل النافذةَ إن تقاطع شريطُه معها: **كُتب قبل نهايتها، ووقع آخرُه بعد
 * بدايتها** — وآخرُه نشرُه أو موعدُه، أو «الآن» لمسوّدةٍ لم يُقرَّر فيها. فمسوّدةٌ كُتبت
 * قبل شهرين وما زالت تنتظر تُرى في نافذة اليوم: **وهي أهمُّ ما يُرى**.
 *
 * والسقفُ يُقال ولا يُصمَت عنه: `capped` مع الصفوف، وتقوله الشاشة.
 */
import type { Db } from './tokens'
import type { GanttPlan, GanttPost } from './gantt'

/** أكثرُ ما يُحمَل — **وشريطٌ واحدٌ صفٌّ واحد**. */
export const GANTT_CAP = 1500

interface PostRow {
  id: string
  platform: string | null
  account_id: string | null
  account: string | null
  status: string | null
  text: string | null
  created_at: string | null
  approved_at: string | null
  scheduled_at: string | null
  published_at: string | null
}

interface PlanRow {
  id: string
  week_start: string | null
  status: string | null
}

export interface GanttLoad {
  readonly posts: readonly GanttPost[]
  readonly plans: readonly GanttPlan[]
  readonly capped: boolean
}

/** `YYYY-MM-DD HH:MM:SS` — **صيغةُ القاعدة**، فالمقارنةُ النصّيّةُ في SQL تصدق. */
function sqlTime(d: Date): string {
  return d.toISOString().slice(0, 19).replace('T', ' ')
}

/**
 * يقرأ المنشوراتِ التي تتقاطع مع النافذة، وخططَ أسابيعها.
 *
 * **و`'succeeded'` لا `'success'`** (درسُ `journey.ts`). ووقتُ النشر أوّلُ محاولةٍ
 * ناجحة لا آخرُها: إعادةٌ بعد نجاحٍ تُسجَّل `skipped_duplicate`، والنجاحُ واحد.
 * **والضمُّ أيسر**: مسوّدةٌ بلا حسابٍ تبقى في الصفّ (درسُ `pivotStore`).
 */
export async function loadGantt(db: Db, org: string, from: Date, to: Date): Promise<GanttLoad> {
  const a = sqlTime(from)
  const b = sqlTime(to)
  let rows: PostRow[] = []
  let plans: PlanRow[] = []
  try {
    const result = await db
      .prepare(
        `SELECT * FROM (
           SELECT p.id                               AS id,
                  p.platform                         AS platform,
                  p.account_id                       AS account_id,
                  a.display_name                     AS account,
                  p.status                           AS status,
                  substr(p.text, 1, 240)             AS text,
                  p.created_at                       AS created_at,
                  p.approved_at                      AS approved_at,
                  p.scheduled_at                     AS scheduled_at,
                  (SELECT min(t.at) FROM publish_attempts t
                    WHERE t.post_id = p.id AND t.status = 'succeeded')
                                                     AS published_at
             FROM posts p
             LEFT JOIN accounts a ON a.id = p.account_id
            WHERE p.org_id = ? AND p.created_at < ?
         )
         WHERE coalesce(published_at, scheduled_at,
                        CASE WHEN status = 'draft' THEN datetime('now') END,
                        approved_at, created_at) >= ?
         ORDER BY created_at
         LIMIT ?`,
      )
      .bind(org, b, a, GANTT_CAP + 1)
      .all<PostRow>()
    rows = result.results
    const planResult = await db
      .prepare(
        `SELECT id, week_start, status FROM plans
          WHERE week_start < ? AND week_start >= date(?, '-7 days')
          ORDER BY week_start`,
      )
      .bind(b, a)
      .all<PlanRow>()
    plans = planResult.results
  } catch {
    // جدولٌ ناقصٌ أو ترحيلٌ لم يُطبَّق: خطٌّ فارغٌ لا صفحةٌ ساقطة
    return { posts: [], plans: [], capped: false }
  }

  const capped = rows.length > GANTT_CAP
  return {
    capped,
    posts: (capped ? rows.slice(0, GANTT_CAP) : rows).map((r) => ({
      id: r.id,
      platform: r.platform ?? '',
      accountId: r.account_id ?? '',
      account: r.account ?? '',
      status: r.status ?? '',
      text: r.text ?? '',
      createdAt: r.created_at ?? '',
      approvedAt: r.approved_at,
      scheduledAt: r.scheduled_at,
      publishedAt: r.published_at,
    })),
    plans: plans
      .filter((p) => p.week_start !== null)
      .map((p) => ({ id: p.id, weekStart: p.week_start!, status: p.status ?? '' })),
  }
}

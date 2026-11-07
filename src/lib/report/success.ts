/**
 * ‏**مقاييسُ النجاح في المنتج** (D-324) — ما قالت الخطّةُ إنّه يُقاس لنقول إنّ صدى ينجح (PLAN.md §٧ · ROADMAP-3 §٧)، وكان
 * ‏معرَّفًا في الوثيقتين ولا يُحسب في أيّ موضع:
 *
 *   ١ · **اعتمادٌ بلا تعديل** (الهدفُ ≥ ‏60٪ بعد شهرين) — من المسوّدات المولَّدة التي كُتبت هذا الشهر وبُتّ فيها (اعتُمدت أو
 *       رُفضت)، ما اعتُمد و`original_text` فارغ: الأصلُ يُحفَظ عند أوّل تعديلٍ ولا يُمحى (D-128)، فهو الشاهدُ الباقي بعد أن
 *       يصير الحالُ `queued` ثمّ `published`. **ونصُّ المالك لا يُعدّ** (`owner` و`upload`): المقياسُ للنموذج لا لك.
 *   ٢ · **نُشر في موعده بلا تدخّل** (الهدفُ ‏100٪) — من المنشورات التي خرجت هذا الشهر بموعد: أوّلُ محاولةٍ ناجحةٍ خلال دورةٍ
 *       واحدة من موعدها (ربعُ ساعة، `*\/15` في wrangler.toml، ودقيقةٌ للطابور) **ولا محاولةَ فاشلةً قبلها** — فما أُعيد بيدٍ
 *       أو من الطابور لا يُعدّ في موعده وإن لحق.
 *   ٣ · **كلفةُ المنشور الكاملة** — لكلّ ما نُشر هذا الشهر: كتابتُه (`posts.cost_usd`) وكلُّ صفٍّ في الدفتر باسمه (النشرُ
 *       والصورةُ والرفعُ والقياس). **وبجانبها ما أُنفق في الشهر كلُّه** على ما نُشر: فيه المرفوضُ والتحليلُ والخطط.
 *
 * ‏**والفراغُ يُقال فراغًا** (سنّةُ التقرير): مقامٌ صفرٌ يعود صفرًا، والشاشةُ تقول «لم يُقَس» لا ‏0٪. والشهرُ من أوّله
 * ‏بتوقيت المالك (`monthStart`)، والأوقاتُ تُوحَّد بـ`datetime()` قبل المقارنة: صفوفٌ بـ`T` وأخرى بمسافة.
 */
import { monthStart } from '../time/zone'
import type { Db } from '../tokens'

/** دورةُ الإرسال بالدقائق (`*\/15` في wrangler.toml) ودقيقةٌ للطابور — «في موعده» ما خرج داخلها. */
export const TICK_MINUTES = 15
export const ON_TIME_MINUTES = TICK_MINUTES + 1

export interface SuccessMetrics {
  /** ما اعتُمد بلا تعديل (`n`) من المولَّد الذي بُتّ فيه (`of`). */
  readonly clean: { readonly n: number; readonly of: number }
  /** ما خرج في موعده بلا تدخّل (`n`) ممّا خرج بموعد (`of`). */
  readonly onTime: { readonly n: number; readonly of: number }
  /** ما نُشر، وكلفتُه المباشرة، وكلُّ ما أُنفق في الشهر. */
  readonly cost: { readonly posts: number; readonly direct: number; readonly all: number }
  /** حُسب الشهرُ بتوقيت الرياض لأنّ منطقةَ المالك لم تصل (D-201). */
  readonly utc: boolean
}

/** أوّلُ نجاحٍ للمنشور — بصيغةٍ واحدة. */
const FIRST_OK = `(SELECT min(datetime(pa.at)) FROM publish_attempts pa
                    WHERE pa.post_id = p.id AND pa.org_id = p.org_id AND pa.status = 'succeeded')`

export async function successThisMonth(db: Db, org: string, zone: string | null, now: Date): Promise<SuccessMetrics> {
  const since = monthStart(now, zone).toISOString().slice(0, 19).replace('T', ' ')
  const [clean, onTime, direct, all] = await Promise.all([
    db.prepare(
      `SELECT COUNT(*) AS of,
              coalesce(sum(CASE WHEN approved_at IS NOT NULL AND original_text IS NULL THEN 1 ELSE 0 END), 0) AS n
         FROM posts
        WHERE org_id = ? AND datetime(created_at) >= ? AND status <> 'draft'
          AND model IS NOT NULL AND model NOT IN ('owner', 'upload')`,
    ).bind(org, since).first<{ of: number; n: number }>(),
    db.prepare(
      `SELECT COUNT(*) AS of,
              coalesce(sum(CASE WHEN fails = 0 AND first_ok <= datetime(scheduled_at, '+${ON_TIME_MINUTES} minutes') THEN 1 ELSE 0 END), 0) AS n
         FROM (SELECT p.scheduled_at, ${FIRST_OK} AS first_ok,
                      (SELECT COUNT(*) FROM publish_attempts pa
                        WHERE pa.post_id = p.id AND pa.org_id = p.org_id AND pa.status = 'failed') AS fails
                 FROM posts p
                WHERE p.org_id = ? AND p.status = 'published' AND p.scheduled_at IS NOT NULL)
        WHERE first_ok >= ?`,
    ).bind(org, since).first<{ of: number; n: number }>(),
    db.prepare(
      `SELECT COUNT(*) AS posts,
              coalesce(sum(p.cost_usd + coalesce((SELECT sum(c.total) FROM cost_ledger c
                                                   WHERE c.org_id = p.org_id AND c.ref_id = p.id), 0)), 0) AS direct
         FROM posts p
        WHERE p.org_id = ? AND p.status = 'published' AND ${FIRST_OK} >= ?`,
    ).bind(org, since).first<{ posts: number; direct: number }>(),
    db.prepare('SELECT coalesce(sum(total), 0) AS total FROM cost_ledger WHERE org_id = ? AND datetime(at) >= ?')
      .bind(org, since).first<{ total: number }>(),
  ])
  return {
    clean: { n: clean?.n ?? 0, of: clean?.of ?? 0 },
    onTime: { n: onTime?.n ?? 0, of: onTime?.of ?? 0 },
    cost: { posts: direct?.posts ?? 0, direct: direct?.direct ?? 0, all: all?.total ?? 0 },
    utc: zone === null,
  }
}

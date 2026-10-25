/**
 * توصيةُ الترويج — **تقترح، ولا تُنفق. ولا تملك ما تُنفق به.**
 *
 * ## الضمانُ الأوّل ليس شرطا في الشيفرة
 *
 * D-006 يقول: لا إنفاقَ آليّ حتّى يُفتَح بقرارٍ مكتوب. **وأقوى صيغةٍ
 * لهذا الشرط أن لا يوجد مسارُ إنفاقٍ أصلا**: لا عميلَ إعلاناتٍ في
 * المستودع، ولا مفتاحَ يُطلَب، ولا نداءَ يُبنى. فالتوصيةُ **صفٌّ في
 * القاعدة** و`human_decision` فارغٌ حتّى يبتّ المالك بيده.
 *
 * ## والمبلغُ لا يُخترَع
 *
 * `suggested_budget` عمودٌ لا يقبل الفراغ — ورقمٌ نؤلّفه نحن **رقمٌ بلا
 * مصدر**. وهو ما يمنعه D-041 في الخطّة، ويُمنع هنا أولى: تلك تقترح
 * كتابةً، وهذه تقترح **مالا**.
 *
 * فالمصدرُ **سقفٌ يضعه المالك** (`weekly_promo_cap_usd`)، والافتراضُ
 * صفر — ومعناه **لا توصيةَ تُكتب**. والشاشةُ تقول له أن يضع سقفا إن
 * أراد، ولا تعرض عليه مبلغا لم يأتِ من عنده.
 */
import type { Db } from '../tokens'
import { changedRows } from '../dbResult'
import type { ReportPost } from './weekly'
import { windowLabel, type WindowName } from '../metrics/job'

/**
 * كم منشورا في النافذة يلزم قبل أن يُقال «هذا فوق المعتاد».
 *
 * **اثنان لا يصنعان معتادا.** ووسيطٌ محسوبٌ على صفّين هو أحدُهما، فكلُّ
 * منشورٍ يصير إمّا ضعفَ الآخر أو نصفَه — وتوصيةٌ تُبنى على ذلك تصرف
 * مالا على ضجيج.
 */
export const MIN_COHORT = 4

/** كم ضعفَ الوسيط يُعدّ تفوّقا يستحقّ إنفاقا. */
export const OUTLIER_FACTOR = 2

/** أكثرُ ما يُقترَح لمنشورٍ واحد من سقف الأسبوع — والباقي يبقى للبقيّة. */
export const MAX_SHARE = 0.5

export interface Candidate {
  readonly post: ReportPost
  readonly window: WindowName
  readonly median: number
  readonly budgetUsd: number
  readonly reason: string
}

export type PromoteOutcome =
  | { readonly kind: 'suggested'; readonly candidate: Candidate }
  | { readonly kind: 'no_cap' }
  | { readonly kind: 'thin'; readonly cohort: number }
  | { readonly kind: 'none' }

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid]!
  return (sorted[mid - 1]! + sorted[mid]!) / 2
}

/** يُقصّ إلى سنتين — مبلغٌ بكسورٍ لا تُدفع يُقرأ آليّا لا مقترَحا. */
function money(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * يختار مرشّحا — **داخل نافذةٍ واحدة، وبعددِ تفاعلٍ لا بنسبة.**
 *
 * والعددُ لا النسبة هنا عمدا: النسبةُ تحتاج ظهورا، وLinkedIn لا يعطيه
 * لمنشور عضو — **فترتيبٌ بالنسبة يُقصي منصّةً كاملةً من الترويج** لا
 * لضعفها بل لصمت واجهتها.
 */
export function pick(posts: readonly ReportPost[], capUsd: number): PromoteOutcome {
  if (capUsd <= 0) return { kind: 'no_cap' }

  const windows: WindowName[] = ['7d', '72h', '24h']
  let widestCohort = 0
  for (const window of windows) {
    const cohort = posts.filter((p) => p.window === window && p.interactions !== null)
    widestCohort = Math.max(widestCohort, cohort.length)
    if (cohort.length < MIN_COHORT) continue

    const counts = cohort.map((p) => p.interactions ?? 0)
    const mid = median(counts)
    // وسيطٌ صفرٌ يجعل كلَّ شيءٍ «ضعفَه» — فأسبوعٌ بلا تفاعلٍ لا يُروَّج
    if (mid <= 0) continue

    let best = cohort[0]!
    for (const p of cohort) if ((p.interactions ?? 0) > (best.interactions ?? 0)) best = p
    if ((best.interactions ?? 0) < mid * OUTLIER_FACTOR) continue

    const budgetUsd = money(Math.min(capUsd * MAX_SHARE, capUsd))
    const times = Math.round(((best.interactions ?? 0) / mid) * 10) / 10
    return {
      kind: 'suggested',
      candidate: {
        post: best,
        window,
        median: mid,
        budgetUsd,
        reason:
          `تفاعلُه ${best.interactions} — ${times}× وسيط نافذة ${windowLabel(window)} ` +
          `(${cohort.length} منشورات). والمبلغ ${budgetUsd}$ نصف سقف وضعتَه ` +
          `(${money(capUsd)}$)، ولا يُنفَق حتّى تقبله.`,
      },
    }
  }

  if (widestCohort > 0 && widestCohort < MIN_COHORT) {
    return { kind: 'thin', cohort: widestCohort }
  }
  return { kind: 'none' }
}

/**
 * يكتب التوصية — **ولا يدهس بتّا سابقا.**
 *
 * `post_id` مفتاحٌ أوّل، فالمنشورُ يُوصى به مرّةً واحدة. ودورةٌ ثانيةٌ
 * تجد الصفَّ قائما فتتركه: توصيةٌ **رفضها المالك** لا تُقترَح عليه
 * ثانيةً كأنّ رفضَه لم يقع.
 */
export async function saveSuggestion(db: Db, candidate: Candidate): Promise<boolean> {
  try {
    const result = await db
      .prepare(
        `INSERT INTO promotion_suggestions (post_id, suggested_budget, currency, reason, org_id)
         VALUES (?1, ?2, 'USD', ?3, (SELECT org_id FROM posts WHERE id = ?1))
         ON CONFLICT(post_id) DO NOTHING`,
      )
      .bind(candidate.post.id, candidate.budgetUsd, candidate.reason)
      .run()
    return changedRows(result)
  } catch {
    return false
  }
}

export interface OpenSuggestion {
  readonly postId: string
  readonly platform: string
  readonly text: string
  readonly budgetUsd: number
  readonly currency: string
  readonly reason: string
  readonly createdAt: string
}

/** ما ينتظر بتّك — والمبتوتُ لا يعود يسأل. */
export async function openSuggestions(db: Db, org: string, limit = 10): Promise<OpenSuggestion[]> {
  try {
    const { results } = await db
      .prepare(
        `SELECT s.post_id, s.suggested_budget, s.currency, s.reason, s.created_at,
                p.platform, p.text
           FROM promotion_suggestions s
           JOIN posts p ON p.id = s.post_id AND p.org_id = s.org_id
          WHERE s.org_id = ? AND s.human_decision IS NULL
          ORDER BY s.created_at DESC LIMIT ?`,
      )
      .bind(org, limit)
      .all<{
        post_id: string
        suggested_budget: number
        currency: string
        reason: string
        created_at: string
        platform: string
        text: string
      }>()
    return results.map((r) => ({
      postId: r.post_id,
      platform: r.platform,
      text: r.text,
      budgetUsd: r.suggested_budget,
      currency: r.currency,
      reason: r.reason,
      createdAt: r.created_at,
    }))
  } catch {
    return []
  }
}

export type Decision = 'accepted' | 'rejected' | 'ignored'

/**
 * يسجّل بتّ المالك — **وقبولُه ليس إنفاقا.**
 *
 * «قبِلتُ» تعني: هذا يستحقّ ترويجا. **ولا يقع إنفاقٌ منه** — لا مسارَ
 * إعلاناتٍ في المستودع أصلا (D-006). فما يفعله المالكُ بالمبلغ يفعله
 * في لوحة المنصّة بيده، والصفُّ أثرٌ لقراره لا أمرٌ بتنفيذه.
 */
export async function decide(db: Db, org: string, postId: string, decision: Decision): Promise<boolean> {
  try {
    const result = await db
      .prepare(
        `UPDATE promotion_suggestions
            SET human_decision = ?, decided_at = datetime('now')
          WHERE post_id = ? AND org_id = ? AND human_decision IS NULL`,
      )
      .bind(decision, postId, org)
      .run()
    return changedRows(result)
  } catch {
    return false
  }
}

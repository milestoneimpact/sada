/**
 * تقديرُ كلفة الشهر قبل البدء (D-257 · AGENCY-PLAN و-٣) — **ممّا أُنفق فعلًا لا من قائمة أسعار**.
 *
 * عددُ المنشورات من الموجز: كم مرّةً في الأسبوع لكلّ قناة × القنوات × أربعة أسابيع. والكلفةُ وسيطُ ما كلّفته مسوّدةٌ
 * وصورةٌ في دفتر هذا العميل آخرَ تسعين يومًا. **ولا تقديرَ بلا سابقة**: عميلٌ لم يُكتب له شيءٌ يُقال له ذلك، لا رقمٌ مخترَع.
 */
import type { Db } from './tokens'
import { money } from './format'

export interface Estimate {
  readonly posts: number
  readonly images: number
  /** `null` حين لا سابقة في الدفتر يُقاس عليها. */
  readonly usd: number | null
  readonly perDraft: number | null
  readonly perImage: number | null
}

export function estimateMonth(input: {
  readonly perWeek: number
  readonly channels: number
  readonly autoImage: boolean
  readonly perDraft: number | null
  readonly perImage: number | null
}): Estimate {
  const posts = Math.max(0, input.perWeek) * Math.max(0, input.channels) * 4
  const images = input.autoImage ? posts : 0
  const usd = input.perDraft === null || (images > 0 && input.perImage === null)
    ? null
    : posts * input.perDraft + images * (input.perImage ?? 0)
  return { posts, images, usd, perDraft: input.perDraft, perImage: input.perImage }
}

function median(xs: readonly number[]): number | null {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

/** وسيطُ كلفة المسوّدة والصورة في دفتر العميل — والصورةُ مع موجزها (`image-brief`) لأنّهما نداءان لصورةٍ واحدة. */
export async function unitCosts(db: Db, org: string): Promise<{ perDraft: number | null; perImage: number | null }> {
  // ‏استعلامٌ واحدٌ للثلاثة (D-280): كان لكلٍّ استعلامُه، واللوحُ يحمله في كلّ فتحة
  const { results } = await db
    .prepare(`SELECT operation, total FROM cost_ledger WHERE org_id = ? AND at >= datetime('now', '-90 days')
                AND (operation LIKE 'draft:%' OR operation LIKE 'image:%' OR operation LIKE 'image-brief%')`)
    .bind(org)
    .all<{ operation: string; total: number }>()
    .catch(() => ({ results: [] as { operation: string; total: number }[] }))
  const of = (prefix: string): number[] => results.filter((r) => r.operation.startsWith(prefix) && r.total > 0).map((r) => r.total)
  const draft = median(of('draft:'))
  const image = median(of('image:'))
  const brief = median(of('image-brief')) ?? 0
  return { perDraft: draft, perImage: image === null ? null : image + brief }
}

/**
 * تقديرُ خطّةٍ بعينها قبل «ابدأ» (D-282): بندٌ لكلّ مسوّدة، وصورةٌ لكلّ بندٍ غيرِ مقطعٍ لم يُختر له أصل — إن اختار المالكُ
 * الصورةَ مع كلّ منشور. والوسيطان من الدفتر كما في تقدير الشهر، **ولا رقمَ مخترَع**.
 */
export function estimatePlan(input: {
  readonly items: readonly { readonly kind?: string; readonly asset?: string }[]
  readonly autoImage: boolean
  readonly perDraft: number | null
  readonly perImage: number | null
}): Estimate {
  const posts = input.items.length
  const images = input.autoImage ? input.items.filter((i) => i.kind !== 'video' && i.asset === undefined).length : 0
  const usd = input.perDraft === null || (images > 0 && input.perImage === null)
    ? null
    : posts * input.perDraft + images * (input.perImage ?? 0)
  return { posts, images, usd, perDraft: input.perDraft, perImage: input.perImage }
}

/** جملةُ التقدير كما تُقرأ في الإشعار وفي تأكيد «ابدأ» — واحدةٌ في الموضعين. */
export function estimateLine(e: Estimate): string {
  const what = `${e.posts} ${e.posts === 1 ? 'مسوّدة' : 'مسوّدات'}${e.images > 0 ? ` و${e.images} ${e.images === 1 ? 'صورة' : 'صور'}` : ''}`
  return e.usd === null
    ? `${what} — ولا تقدير قبل أوّل مسوّدة تُقاس عليها`
    : `${what} بنحو ${money(e.usd)}`
}

/**
 * تقديرُ كلفة الشهر قبل البدء (D-257 · AGENCY-PLAN و-٣) — **ممّا أُنفق فعلًا لا من قائمة أسعار**.
 *
 * عددُ المنشورات من الموجز: كم مرّةً في الأسبوع لكلّ قناة × القنوات × أربعة أسابيع. والكلفةُ وسيطُ ما كلّفته مسوّدةٌ
 * وصورةٌ في دفتر هذا العميل آخرَ تسعين يومًا. **ولا تقديرَ بلا سابقة**: عميلٌ لم يُكتب له شيءٌ يُقال له ذلك، لا رقمٌ مخترَع.
 */
import type { Db } from './tokens'

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
  const read = async (like: string): Promise<number[]> => {
    const { results } = await db
      .prepare(`SELECT total FROM cost_ledger WHERE org_id = ? AND operation LIKE ? AND at >= datetime('now', '-90 days')`)
      .bind(org, like)
      .all<{ total: number }>()
      .catch(() => ({ results: [] as { total: number }[] }))
    return results.map((r) => r.total).filter((t) => t > 0)
  }
  const draft = median(await read('draft:%'))
  const image = median(await read('image:%'))
  const brief = median(await read('image-brief%')) ?? 0
  return { perDraft: draft, perImage: image === null ? null : image + brief }
}

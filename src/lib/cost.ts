/**
 * سجل التكلفة (D-008).
 *
 * القاعدة: كل طلب خارجي مدفوع يُسجَّل **قبل** أن يُعدّ ناجحا. لا بعده.
 * فالطلب الذي أُرسل وضاع جوابه قد كُلِّف فعلا؛ وتسجيله بعد النجاح وحده
 * يجعل السجل أقل من الحقيقة، وهو أسوأ من أن يكون أعلى منها.
 *
 * والأسعار هنا تقديرٌ للعرض قبل الاعتماد لا مرجعٌ للمحاسبة: ما يُسجَّل
 * فعلا يُقرأ من استجابة المزود حين يعيدها (PLATFORMS.md §نتائج ٣).
 */
import type { Db } from './tokens'

/**
 * المزوّدون المعروفون بأسمائهم — **ولا يُغلَق البابُ عليهم.**
 *
 * الترحيل 0005 فتح عمودَ `provider` في الدفتر (`length(provider) > 0`)
 * حين صار المزوّدُ صفّا يُضاف من اللوحة (D-031). وبقاءُ الاتّحاد ضيّقا
 * هنا كان يمنع تسجيلَ كلفةِ مزوّدٍ أضافه المالك — **فيُنادى ولا يُحاسَب
 * عليه**، وذاك أسوأ ما يقع لدفتر (D-008).
 *
 * و `(string & {})` تُبقي الإكمالَ يقترح الخمسة ولا يرفض السادس.
 */
export type Provider =
  | 'x'
  | 'linkedin'
  | 'anthropic'
  | 'gemini'
  | 'google'
  // eslint-disable-next-line @typescript-eslint/ban-types
  | (string & {})

export interface CostEntry {
  readonly provider: Provider
  readonly operation: string
  readonly units: number
  readonly unitCost: number
  readonly refId?: string | undefined
}

/**
 * أسعار X المتحقَّق منها في 2026-09-02 (docs/PLATFORMS.md).
 * تتغير بلا إعلان، فتُراجَع مع كل تحديث للملف.
 */
export const X_PRICE_PER_POST = 0.015
export const X_PRICE_PER_POST_WITH_URL = 0.2
export const X_PRICE_PER_OWNED_READ = 0.001

/** LinkedIn لا يحاسب على المنشور؛ حدوده بعدد الطلبات لا بثمنها. */
export const LINKEDIN_PRICE_PER_POST = 0

/** تكلفة منشور واحد قبل إرساله — ما يُعرض في لوحة الاعتماد. */
export function estimatePostCost(platform: 'linkedin' | 'x', hasUrl: boolean): number {
  if (platform === 'linkedin') return LINKEDIN_PRICE_PER_POST
  return hasUrl ? X_PRICE_PER_POST_WITH_URL : X_PRICE_PER_POST
}

/**
 * تكلفة ثريد: كل منشور فيه طلبٌ يُحاسَب على حدة، لا الثريد كوحدة
 * (PLATFORMS.md §نتائج ١).
 */
export function estimateThreadCost(texts: readonly string[], hasUrl: (t: string) => boolean): number {
  return texts.reduce((total, text) => total + estimatePostCost('x', hasUrl(text)), 0)
}

export async function recordCost(db: Db, entry: CostEntry): Promise<string> {
  const id = crypto.randomUUID()
  const total = entry.units * entry.unitCost
  await db
    .prepare(
      `INSERT INTO cost_ledger (id, provider, operation, units, unit_cost, total, ref_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, entry.provider, entry.operation, entry.units, entry.unitCost, total, entry.refId ?? null)
    .run()
  return id
}

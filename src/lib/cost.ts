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
import type { PublishPlatform } from './oauth/providers'

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
export function estimatePostCost(platform: PublishPlatform, hasUrl: boolean): number {
  if (platform === 'linkedin') return LINKEDIN_PRICE_PER_POST
  /*
   * **و TikTok صفرٌ معلومٌ لا صفرٌ مسكوتٌ عنه** (D-092).
   *
   * Content Posting API لا يحاسب على النشر — لا اشتراكَ ولا سعرَ طلب،
   * بخلاف X. **و YouTube Data API مجّانيٌّ كذلك**: يحدُّه حصّةٌ يوميّةٌ
   * لا فاتورة (‏١٦٠٠ وحدةً للرفع من عشرة آلاف).
   *
   * **وصفرٌ هنا حقيقةٌ مقروءةٌ لا تقدير**، ونداءُ الرفع نفسُه
   * يُسجَّل في الدفتر موسوما بـ `price_unverified` من `publisher.ts`
   * — فما وقع يُرى ولو لم يُدفَع.
   */
  /*
   * **وInstagram كذلك** (D-121): Graph API لا يحاسب على النشر — حصّةٌ
   * لا فاتورة. **وقد كانت تسقط إلى سعر X** لأنّ السطرَ الأخير يردّ
   * سعرَ X لكلّ ما لم يُسمَّ، **فتُحاسَب منصّةٌ مجّانيّةٌ بسعر منصّةٍ
   * مدفوعة** — ودفترٌ يقول أكثرَ من الحقيقة يُفقِد الثقةَ به كما
   * يُفقِدها الذي يقول أقلّ.
   */
  if (platform === 'tiktok' || platform === 'youtube' || platform === 'instagram') return 0
  return hasUrl ? X_PRICE_PER_POST_WITH_URL : X_PRICE_PER_POST
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

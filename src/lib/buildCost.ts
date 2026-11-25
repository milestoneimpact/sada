/**
 * تقديرُ بناء الخطّة بالدولار قبل الضغط (D-395) — **من جدول الأسعار نفسِه الذي يكتب به الدفتر**.
 *
 * كانت «هذا ما فهمته» تقول العددَ وحده («نداءٌ مدفوعٌ لكلٍّ»). وهنا كلُّ نداءٍ سيقع يُسعَّر بالدالّة التي يُسعَّر بها
 * يومَ يقع: الكتابةُ بـ `costOf` (سعرا المزوّد للمليون)، وصورةُ Cloudflare بـ `imageNeurons` و`splitCharge` على حصّة
 * اليوم تباعًا، وصورةُ مزوّدٍ آخر بـ `costOf` لوحدةٍ واحدة كما في `image/job.ts`. **وما لا سعرَ له يُعدّ ويُقال
 * «غيرُ متحقَّق»، لا صفرًا صامتًا**؛ وكتابةٌ لم يُقَس طولُها بعدُ تُعدّ «لم تُقَس» ولا يُخترع لها عددُ رموز.
 *
 * دالّةٌ خالصة: لا قاعدةَ ولا شبكة. ومن يجمع المدخلاتِ (المسار) يقرأ الأسعارَ والحصّةَ والأطوال المقيسة.
 */
import { costOf } from './providers'
import { FREE_NEURONS_PER_DAY, imageNeurons, splitCharge } from './ai/imagePricing'

export interface Prices {
  readonly priceIn: number | null
  readonly priceOut: number | null
}

export type PlannedCall =
  /** نداءُ كتابة (مسوّدة، موجزُ صورة، محتوى إنفوجرافيك). `tokens: null` = لا طولَ مقيسًا بعد. */
  | { readonly kind: 'text'; readonly op: string; readonly price: Prices; readonly tokens: { readonly inputTokens: number; readonly outputTokens: number } | null }
  /** صورةٌ فنّيّة: نموذجُ Cloudflare من الجدول، وإلّا سعرُ المزوّد لنداءٍ واحد. */
  | { readonly kind: 'image'; readonly op: string; readonly model: string | null; readonly width: number; readonly height: number; readonly price: Prices }
  /** نداءٌ سعرُه غيرُ مضبوطٍ أصلًا (لقطةُ المتصفّح) — يُسجَّل صفرًا موسومًا. */
  | { readonly kind: 'unpriced'; readonly op: string }

export interface BuildEstimate {
  readonly calls: number
  /** مجموعُ ما يُعرف سعرُه بالدولار. */
  readonly usd: number
  /** نداءاتٌ بلا سعرٍ متحقَّق — خارجَ `usd`، تُقال بعددها. */
  readonly unverified: number
  /** نداءاتُ كتابةٍ بسعرٍ معروفٍ ولا طولَ مقيسًا لها — خارجَ `usd`. */
  readonly unmeasured: number
  /** صورٌ تقع في حصّة Cloudflare المجّانيّة. */
  readonly freeImages: number
  /** صورٌ تتجاوز الحصّة: تنتظر إذنَ «ارسمها بالدفع». */
  readonly overQuota: number
}

/** كلفةُ كلّ نداءٍ كما سيكتبها الدفتر، تباعًا — والحصّةُ تنقص بكلّ صورةٍ كما تنقص في `neuronsUsedToday`. */
export function estimateBuild(calls: readonly PlannedCall[], usedNeuronsToday: number, quota = FREE_NEURONS_PER_DAY): BuildEstimate {
  let usd = 0
  let unverified = 0
  let unmeasured = 0
  let freeImages = 0
  let overQuota = 0
  let used = usedNeuronsToday
  for (const c of calls) {
    if (c.kind === 'unpriced') { unverified++; continue }
    if (c.kind === 'text') {
      if (c.price.priceIn === null && c.price.priceOut === null) { unverified++; continue }
      if (c.tokens === null) { unmeasured++; continue }
      usd += costOf(c.price, c.tokens).total
      continue
    }
    const neurons = c.model === null ? null : imageNeurons(c.model, c.width, c.height)
    if (neurons !== null) {
      if (used + neurons > quota) overQuota++
      const charge = splitCharge(neurons, used, quota)
      if (charge.usd === 0) freeImages++
      usd += charge.usd
      used += neurons
      continue
    }
    const priced = costOf(c.price, { inputTokens: 0, outputTokens: 1 })
    if (!priced.priced) { unverified++; continue }
    usd += priced.total
  }
  return { calls: calls.length, usd, unverified, unmeasured, freeImages, overQuota }
}

/** الجملةُ كما تُقرأ فوق الزرّ. */
export function buildEstimateLine(e: BuildEstimate): string {
  const parts = [`نحو $${e.usd.toFixed(3)} لـ ${e.calls} نداءً`]
  if (e.freeImages > 0) parts.push(`منها ${e.freeImages} صورةً في حصّة اليوم المجّانيّة`)
  if (e.unmeasured > 0) parts.push(`و${e.unmeasured} نداءَ كتابةٍ لم يُقَس طولُه بعدُ فليس في الرقم`)
  if (e.unverified > 0) parts.push(`و${e.unverified} نداءً سعرُه غيرُ متحقَّق فليس في الرقم`)
  if (e.overQuota > 0) parts.push(`و${e.overQuota} صورةً تتجاوز الحصّة فتنتظر إذنك بالدفع`)
  return parts.join('، ') + '.'
}

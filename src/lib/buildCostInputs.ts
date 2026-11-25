/**
 * مدخلاتُ `estimateBuild` لخطّةٍ مرفوعة (D-395): أيُّ نداءٍ سيقع لكلّ صفّ، بأيّ مزوّدٍ وأيّ سعر — **قراءةٌ بلا نداء**.
 *
 * - «اكتب»: نداءُ كتابةٍ `draft:` لكلّ صفّ بمزوّد توجيه الكتابة.
 * - والصورةُ إن اختارتها الخطّة، لصفوفٍ بقدر `autoImageRoom`: الفنّيّةُ موجزٌ (`image-brief`) ونداءُ صورةٍ بمزوّد توجيه
 *   الصورة ونموذجِ مستوى المسوّدة ومقاسِ منصّته كما يختارها `generateForPost`؛ والإنفوجرافيك نداءُ محتوى (`infographic`)
 *   ولقطةُ متصفّحٍ سعرُها غيرُ مضبوط.
 * - **وطولُ نداء الكتابة وسيطُ ما قاسه الدفترُ** لهذا العميل آخرَ تسعين يومًا (عمودُ `units` رموزُ الدخل والخرج معًا)،
 *   ويُسعَّر كلُّه بأغلى السعرين: **حدٌّ أعلى لا تخمين**. ولا سابقةَ ⇒ `tokens: null` («لم يُقَس»).
 */
import type { Db } from './tokens'
import type { PlannedCall, Prices } from './buildCost'
import { getProvider } from './providers'
import { routeFor } from './ai/routes'
import { cfPrice, DRAFT_IMAGE_MODEL, FINAL_IMAGE_MODEL } from './ai/imagePricing'
import { GEN_SIZE } from './image/job'
import type { Platform } from './draft/prompt'

function median(xs: readonly number[]): number | null {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

/** وسيطُ رموز نداءات العمليّة في دفتر العميل — `null` بلا سابقة. */
async function measuredTokens(db: Db, org: string): Promise<(prefix: string) => number | null> {
  const { results } = await db
    .prepare(`SELECT operation, units FROM cost_ledger WHERE org_id = ? AND at >= datetime('now', '-90 days')
                AND (operation LIKE 'draft:%' OR operation LIKE 'image-brief%' OR operation LIKE 'infographic%') AND provider <> 'cloudflare-browser'`)
    .bind(org)
    .all<{ operation: string; units: number }>()
    .catch(() => ({ results: [] as { operation: string; units: number }[] }))
  return (prefix) => median(results.filter((r) => r.operation.startsWith(prefix) && r.units > 1).map((r) => r.units))
}

const NONE: Prices = { priceIn: null, priceOut: null }

/** الطولُ المقيسُ كلُّه على الجانب الأغلى. */
function upper(price: Prices, units: number | null): { inputTokens: number; outputTokens: number } | null {
  if (units === null) return null
  return (price.priceIn ?? 0) > (price.priceOut ?? 0) ? { inputTokens: units, outputTokens: 0 } : { inputTokens: 0, outputTokens: units }
}

export async function planBuildCalls(db: Db, org: string, input: {
  readonly platforms: readonly (string | null)[]
  readonly write: boolean
  readonly imageStyle: 'infographic' | 'illustration' | null
  readonly imageRoom: number
}): Promise<PlannedCall[]> {
  const tokens = await measuredTokens(db, org)
  const writer = await getProvider(db, (await routeFor(db, 'draft')).provider)
  const wp: Prices = writer === null ? NONE : { priceIn: writer.priceIn, priceOut: writer.priceOut }
  const calls: PlannedCall[] = []
  if (input.write) for (const p of input.platforms) calls.push({ kind: 'text', op: `draft:${p ?? '?'}`, price: wp, tokens: upper(wp, tokens('draft:')) })
  if (input.imageStyle === null) return calls
  const imageRoute = await routeFor(db, 'image')
  const imager = await getProvider(db, imageRoute.provider)
  const ip: Prices = imager === null ? NONE : { priceIn: imager.priceIn, priceOut: imager.priceOut }
  // ‏النموذجُ كما يختاره `generateForPost` لمستوى المسوّدة
  const cfModel = imager?.name === 'cloudflare'
    ? (cfPrice(imageRoute.model) !== null && imageRoute.model !== FINAL_IMAGE_MODEL ? imageRoute.model : DRAFT_IMAGE_MODEL)
    : null
  for (const p of input.platforms.slice(0, Math.max(0, input.imageRoom))) {
    if (input.imageStyle === 'infographic') {
      calls.push({ kind: 'text', op: 'infographic', price: wp, tokens: upper(wp, tokens('infographic')) })
      calls.push({ kind: 'unpriced', op: `infographic:${p ?? '?'}` })
      continue
    }
    calls.push({ kind: 'text', op: 'image-brief', price: wp, tokens: upper(wp, tokens('image-brief')) })
    const gen = GEN_SIZE[p as Platform] ?? { width: 1024, height: 1024 }
    const multipart = cfModel !== null && cfPrice(cfModel)?.multipart === true
    calls.push({ kind: 'image', op: `image:${p ?? '?'}`, model: cfModel, width: multipart ? gen.width : 1024, height: multipart ? gen.height : 1024, price: ip })
  }
  return calls
}

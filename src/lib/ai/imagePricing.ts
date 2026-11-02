/**
 * سعرُ الصورة **بالنموذج والمقاس** — لا بالمزوّد (D-285).
 *
 * ## ما كان
 *
 * كانت كلُّ صورةٍ تُسجَّل `price_out ÷ مليون` لمزوّدها كلِّه: `flux-1-schnell` و`flux-2-klein-9b` بسعرٍ واحد،
 * والمقاسُ والخطواتُ خارجَ الحساب، و**مزوّدُ Cloudflare بلا سعرٍ فتُكتب صفرًا بلا علامة** — كأنّها مجّانيّةٌ قصدًا.
 * والحصّةُ المجّانيّةُ اليوميّةُ لا تُعرَف أصلًا.
 *
 * ## ما صار
 *
 * جدولٌ لكلّ نموذجٍ من صفحة الأسعار **بتاريخها** (`developers.cloudflare.com/workers-ai/platform/pricing/`،
 * آخرُ تحديث 2026-10-20)، يحسب Neurons الصورةِ من مقاسها وخطواتها، ويقسمها: **ما يقع في حصّة اليوم المجّانيّة
 * (‏10,000 Neuron، تتجدّد 00:00 UTC) صفرٌ موسومٌ «مجّاني»، وما زاد بسعره** ($0.011 لكلّ 1,000).
 * ونموذجٌ ليس في الجدول **سعرُه غيرُ متحقَّق** يُقال ويُعلَّم، لا صفرٌ صامت.
 *
 * والحصّةُ مشتركةٌ في حساب Cloudflare كلِّه، وصدى لا يرى إلّا ما استهلكه هو — وقرارُ المالك (2026-11-02) أنّ
 * الحسابَ كلَّه لصدى، فالحصّةُ كاملة.
 */
import type { Db } from '../tokens'

/** سعرُ الـ Neuron بالدولار. */
export const NEURON_USD = 0.011 / 1000
/** الحصّةُ المجّانيّةُ اليوميّة (UTC) — كاملةً لصدى بقرار المالك. */
export const FREE_NEURONS_PER_DAY = 10_000

/** نموذجا المستويين بقرار المالك: المسوّدةُ رخيصةٌ، والنهائيّةُ بعد الاعتماد. */
export const DRAFT_IMAGE_MODEL = '@cf/black-forest-labs/flux-1-schnell'
export const FINAL_IMAGE_MODEL = '@cf/black-forest-labs/flux-2-klein-9b'

interface CfPrice {
  readonly label: string
  /** أيُنادى بـ multipart؟ عائلةُ FLUX.2 كلُّها، **ولو كان الطلبُ وصفًا وحده** (وثيقة klein). */
  readonly multipart: boolean
  /** خطواتٌ ثابتةٌ في النموذج — klein أربعٌ لا تُبدَّل. */
  readonly fixedSteps?: number
  readonly neurons: (w: number, h: number, steps: number) => number
}

const tiles = (w: number, h: number): number => Math.ceil(w / 512) * Math.ceil(h / 512)
const megapixels = (w: number, h: number): number => (w * h) / (1024 * 1024)

/** من صفحة الأسعار، بأسماء وحداتها. */
export const CF_IMAGE_PRICES: Readonly<Record<string, CfPrice>> = {
  '@cf/black-forest-labs/flux-1-schnell': {
    label: 'FLUX.1 schnell',
    multipart: false,
    // ‏4.80 لكلّ رقعة 512×512، و9.60 لكلّ خطوة
    neurons: (w, h, steps) => tiles(w, h) * 4.8 + steps * 9.6,
  },
  '@cf/black-forest-labs/flux-2-klein-4b': {
    label: 'FLUX.2 klein 4B',
    multipart: true,
    fixedSteps: 4,
    // ‏26.05 لكلّ رقعة مخرَجة (ولا صورةَ مُدخَلة عندنا)
    neurons: (w, h) => tiles(w, h) * 26.05,
  },
  '@cf/black-forest-labs/flux-2-klein-9b': {
    label: 'FLUX.2 klein 9B',
    multipart: true,
    fixedSteps: 4,
    // ‏1363.64 للميغابكسل الأوّل، و181.82 لكلّ ميغابكسلٍ بعده
    neurons: (w, h) => 1363.64 + Math.max(0, megapixels(w, h) - 1) * 181.82,
  },
  '@cf/black-forest-labs/flux-2-dev': {
    label: 'FLUX.2 dev',
    multipart: true,
    // ‏37.50 لكلّ رقعةٍ مخرَجة لكلّ خطوة
    neurons: (w, h, steps) => tiles(w, h) * 37.5 * steps,
  },
  '@cf/leonardo/lucid-origin': {
    label: 'Lucid Origin',
    multipart: false,
    neurons: (w, h, steps) => tiles(w, h) * 636 + steps * 12,
  },
  '@cf/leonardo/phoenix-1.0': {
    label: 'Phoenix 1.0',
    multipart: false,
    neurons: (w, h, steps) => tiles(w, h) * 530 + steps * 10,
  },
}

export function cfPrice(model: string): CfPrice | null {
  return CF_IMAGE_PRICES[model] ?? null
}

/** Neurons صورةٍ واحدة — أو `null` لنموذجٍ ليس في الجدول. */
export function imageNeurons(model: string, width: number, height: number, steps = 4): number | null {
  const p = cfPrice(model)
  if (p === null) return null
  return p.neurons(width, height, p.fixedSteps ?? steps)
}

/**
 * ما استهلكه صدى من الحصّة اليوم (UTC) — من الدفتر: صورُ Cloudflare تُسجَّل ووحداتُها Neurons (`image:…:@cf/…`).
 * وما سُجّل قبل D-285 وحدةً واحدةً لكلّ صورة يُعَدّ واحدًا — أقلُّ من الحقيقة، ولا يقع إلّا في يوم النشر.
 */
export async function neuronsUsedToday(db: Db): Promise<number> {
  const row = await db
    // ‏الحصّةُ لحساب Cloudflare كلِّه لا لمنظّمة — فتُجمَع على المنظّمات كلِّها، كسقف الإنفاق العامّ في `limits.ts`
    .prepare("SELECT COALESCE(SUM(units), 0) AS n FROM cost_ledger WHERE org_id IN (SELECT id FROM orgs) AND provider = 'cloudflare' AND operation LIKE 'image:%@cf/%' AND at >= date('now')")
    .first<{ n: number }>()
    .catch(() => null)
  return row?.n ?? 0
}

export interface ImageCharge {
  readonly neurons: number
  /** ما وقع في الحصّة المجّانيّة. */
  readonly free: number
  /** ما يُدفع بالدولار. */
  readonly usd: number
}

/** قسمةُ صورةٍ على الحصّة: ما بقي منها مجّانيّ، والزائدُ بسعره. */
export function splitCharge(neurons: number, usedToday: number, quota = FREE_NEURONS_PER_DAY): ImageCharge {
  const room = Math.max(0, quota - usedToday)
  const free = Math.min(neurons, room)
  return { neurons, free, usd: (neurons - free) * NEURON_USD }
}

/** كم صورةً مجّانيّةً بقيت اليوم بهذا النموذج والمقاس — للتقدير قبل الضغط. */
export function freeImagesLeft(neuronsPerImage: number, usedToday: number, quota = FREE_NEURONS_PER_DAY): number {
  if (neuronsPerImage <= 0) return 0
  return Math.floor(Math.max(0, quota - usedToday) / neuronsPerImage)
}

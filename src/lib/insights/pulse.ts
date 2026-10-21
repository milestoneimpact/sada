/**
 * **نبضُ القناة** (D-263 · GROWTH-PLAN م-٤) — رأسُ صفحة المنصّة بأربعة أرقامٍ تُقرأ في خمس ثوانٍ: ما خرج في ثلاثين يومًا،
 * ووسيطُ تفاعله، واتّجاهُه عن الثلاثين التي قبلها، وأرجحُ موعدٍ وأنجحُ شكل.
 *
 * **من `readFacts` نفسِها بمنظّمة العميل ومنصّته** (D-253): التفاعلُ نافذةُ ‏24 ساعة، والمقيسُ وحده يدخل. **ولا اتّجاهَ قبل ثلاثةٍ
 * مقيسةٍ في كلّ نافذة**، ولا يُقال فرقٌ دون ‏20٪ — كما في «المعتاد» (D-254)؛ والموعدُ والشكلُ لا يُقالان قبل ثمانية.
 */
import { median, whatWorks, type PostFact } from './whatWorks'

export interface Pulse {
  readonly last30: number
  readonly median30: number | null
  /** الفرقُ عن الثلاثين السابقة بالمئة — و`null` حين لا تكفي العيّنة. */
  readonly trend: number | null
  readonly slot: string | null
  readonly format: string | null
  /** ما بقي لتُقال الأحكام، حين لا تكفي العيّنة. */
  readonly why: string | null
}

const DAY = 86_400_000
const MIN_WINDOW = 3

export function channelPulse(facts: readonly PostFact[], now: Date, zone: string | null): Pulse {
  const at = (f: PostFact): number => Date.parse(`${f.publishedAt.replace(' ', 'T')}Z`)
  const t = now.getTime()
  const last = facts.filter((f) => at(f) > t - 30 * DAY)
  const prev = facts.filter((f) => at(f) <= t - 30 * DAY && at(f) > t - 60 * DAY)
  const m30 = last.length === 0 ? null : median(last.map((f) => f.engagement))
  const mPrev = prev.length === 0 ? null : median(prev.map((f) => f.engagement))
  const raw = m30 !== null && mPrev !== null && mPrev > 0 && last.length >= MIN_WINDOW && prev.length >= MIN_WINDOW
    ? Math.round((m30 / mPrev - 1) * 100) : null
  const works = whatWorks(facts, zone)
  const format = works.dims?.find((d) => d.title === 'الشكل')?.best?.label ?? null
  return {
    last30: last.length,
    median30: m30,
    trend: raw === null || Math.abs(raw) < 20 ? (raw === null ? null : 0) : raw,
    slot: works.slot?.label ?? null,
    format,
    why: works.why,
  }
}

/**
 * **المُجدوِلُ الواحد** (D-383 · المرحلة ٦): ما يأتي من الخطّة، أو من الحزمة، أو من ملفٍّ مرفوع يمرّ من هنا قبل `schedulePost`.
 *
 * - **الموعدُ موعدُ المالك**: يصل بـ UTC وبتوقيته المحلّيّ معًا، ولا يُقدَّم ولا يُرحَّل يومًا.
 * - **موعدٌ مضى يُعرض ولا يُنقل** صامتًا (`past`)، وموعدٌ لم يكتبه المالكُ في ساعات الهدوء يُعرض كذلك (`quiet`).
 * - **التباعد** على الحساب الواحد: الفاصلُ الأدنى من `schedule_rules`، وما لا يتّسع له قبل ساعات الهدوء يُعرض (`gap`).
 * - **التذبذب** (لما لم يكتب المالكُ دقيقتَه) ±`jitter_minutes` حتّى لا يبدو النشرُ آليًّا، **محسوبٌ من معرّف المنشور** (لا `Math.random`) فإعادةُ
 *   المحاولة تعطي الموعدَ نفسَه، **ولا يخرج من الساعة المحلّيّة** التي اختارها المالك.
 *
 * دالّةٌ خالصة: لا قاعدةَ ولا ساعةَ نظام، فتُختبر بمدخلاتها وحدها.
 */
import { inQuiet, minutesOf, type ScheduleRules } from './checks'

export interface SlotIn {
  readonly id: string
  readonly account: string
  /** UTC بصيغة التخزين `YYYY-MM-DDTHH:MM`. */
  readonly at: string
  /** «YYYY-MM-DD HH:MM» بتوقيت المالك. */
  readonly local: string
  /** موعدٌ كتبه المالكُ بالدقيقة: يُحترم فلا يُذبذَب، والتباعدُ وحده يدفعه. وما اختارته أرجحُ الساعات يُذبذَب. */
  readonly exact?: boolean
}

export interface SlotOut extends SlotIn {
  /** دقائقُ الإزاحة عن موعد المالك (تذبذبٌ أو تباعد). */
  readonly shift: number
}

export type HeldReason = 'past' | 'quiet' | 'gap'

export interface Arranged {
  readonly placed: readonly SlotOut[]
  readonly held: readonly { readonly id: string; readonly reason: HeldReason }[]
}

/** إزاحةٌ ثابتةٌ لكلّ معرّف في [-span, span] — FNV-1a، فالمنشورُ نفسُه يأخذ الإزاحةَ نفسَها دائمًا. */
export function jitterOf(id: string, span: number): number {
  if (span <= 0) return 0
  let h = 0x811c9dc5
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return (h % (2 * span + 1)) - span
}

const toMs = (at: string): number => Date.parse(at + ':00Z')
const fromMs = (ms: number): string => new Date(ms).toISOString().slice(0, 16)
/** يُزاح التوقيتُ المحلّيّ بالدقائق نفسِها — حسابٌ ساذجٌ على مكوّناته، والفرقُ عن UTC ثابتٌ داخل اليوم الواحد. */
const shiftLocal = (local: string, minutes: number): string =>
  new Date(Date.parse(local.replace(' ', 'T') + ':00Z') + minutes * 60_000).toISOString().slice(0, 16).replace('T', ' ')

export function arrangeSlots(slots: readonly SlotIn[], rules: ScheduleRules, now: Date): Arranged {
  const sorted = [...slots].sort((a, b) => (a.at === b.at ? (a.id < b.id ? -1 : 1) : a.at < b.at ? -1 : 1))
  const last = new Map<string, number>()
  const placed: SlotOut[] = []
  const held: { id: string; reason: HeldReason }[] = []
  const gapMs = Math.max(0, rules.minGapMinutes) * 60_000
  for (const s of sorted) {
    const base = toMs(s.at)
    if (!(base > now.getTime())) { held.push({ id: s.id, reason: 'past' }); continue }
    const clock = minutesOf(s.local.slice(11, 16))
    if (clock === null) { held.push({ id: s.id, reason: 'past' }); continue }
    // ‏موعدٌ كتبه المالكُ في ساعات الهدوء قرارُه: بوّابةُ الفحص حذّرته قبل الاعتماد. وما اختارته أرجحُ الساعات لا يقع فيها
    if (s.exact !== true && inQuiet(clock, rules)) { held.push({ id: s.id, reason: 'quiet' }); continue }
    // ‏التذبذبُ داخل الساعة المحلّيّة: 09:00 لا تصير 08:55
    const inHour = clock % 60
    const j = s.exact === true ? 0 : Math.min(59 - inHour, Math.max(-inHour, jitterOf(s.id, rules.jitterMinutes)))
    let at = base + j * 60_000
    const prev = last.get(s.account)
    if (prev !== undefined && at - prev < gapMs) at = prev + gapMs
    const shift = Math.round((at - base) / 60_000)
    const local = shiftLocal(s.local, shift)
    const after = minutesOf(local.slice(11, 16)) ?? 0
    // ‏ما دفعه التباعدُ إلى ساعات الهدوء أو إلى يومٍ آخر لا يُجدوَل: يُعرض للمالك
    if (local.slice(0, 10) !== s.local.slice(0, 10) || (shift > 0 && inQuiet(after, rules)) || !(at > now.getTime())) {
      held.push({ id: s.id, reason: 'gap' })
      continue
    }
    last.set(s.account, at)
    placed.push({ ...s, at: fromMs(at), local, shift })
  }
  return { placed, held }
}

export const HELD_SAY: Readonly<Record<HeldReason, string>> = {
  past: 'موعدُه مضى، فاختر له موعدًا',
  quiet: 'موعدُه في ساعات الهدوء',
  gap: 'لا يتّسع له الفاصلُ الأدنى في يومه',
}

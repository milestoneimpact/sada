/**
 * يومُ المالك — **من متصفّحه في كلّ فتحة، لا من إعدادٍ يُخزَّن** (D-173).
 *
 * قضت D-106 بأنّ منطقةً تُخزَّن في إعدادٍ تُنسى فتكذب بعد سفرٍ أو تحوّلٍ
 * صيفيّ. **ورؤوسُ الأيّام تُجمَع على الخادم**: منشورٌ نُشر الحاديةَ عشرةَ
 * ليلًا بتوقيت الرياض يقع في يومٍ غيرِ يومه بـ UTC. فيكتب `u.js` الكعكةَ
 * `sada_tz` عند كلّ تحميل، ويقرؤها الخادمُ هنا ويتحقّق منها بـ `Intl`.
 *
 * **وغيابُها لا يُسقط شيئا** (D-201): تُعرَض الأوقاتُ بتوقيت الرياض، منطقةِ المالك
 * المعروفة، ويُقال «بتوقيت الرياض» بجوارها. والتخزينُ يبقى UTC في كلّ حال.
 * ولا تدخل في قرارِ أمنٍ قطّ: أسوأُ ما يفعله من زوّرها أن يرى أيّامَه بمنطقةٍ أخرى.
 *
 * **والأسماءُ العربيّة من جدولٍ هنا لا من `Intl`**: الأرقامُ تُقرأ من
 * `formatToParts` بلغةٍ محايدة، فلا يتعلّق الصوابُ ببيانات لغةٍ في بيئة العامل.
 */
import { parseSqliteUtc } from '../format'

export const TZ_COOKIE = 'sada_tz'

/**
 * منطقةُ العرض حين لا كعكةَ ولا منطقةَ محفوظة (D-201): المالكُ في المملكة، فأوّلُ زيارةٍ
 * تُريه وقتَه بتوقيت الرياض لا بغرينتش. و`null` في كلّ دالّةٍ هنا يعني هذه المنطقة.
 */
export const FALLBACK_ZONE = 'Asia/Riyadh'

/** ما يُلحَق بوقتٍ معروض: «بتوقيت الرياض» حين المنطقةُ احتياط، ولا شيء حين هي منطقةُ المالك. */
export function zoneNote(zone: string | null): string {
  return zone === null ? ' بتوقيت الرياض' : ''
}

const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'] as const
const MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
] as const

/** «14 أكتوبر» من مفتاح يومٍ `YYYY-MM-DD` — يومٌ عُدّ من قبلُ بمنطقته، فلا تحويلَ هنا (D-202). */
export function dayKeyLabel(key: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(key)
  const month = m === null ? undefined : MONTHS[Number(m[1]) - 1]
  return m === null || month === undefined ? key : `${Number(m[2])} ${month}`
}

/** منطقةٌ صالحة أو `null` — **والصلاحُ ما يقبله `Intl`، لا شكلُ النصّ وحده**. */
export function validZone(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null
  const zone = raw.trim()
  if (zone === '' || zone.length > 64 || !/^[A-Za-z][A-Za-z0-9_+\-/]*$/.test(zone)) return null
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone })
    return zone
  } catch {
    return null
  }
}

/** منطقةُ المالك من كعكة الطلب — أو `null` فتُعرَض الأوقاتُ بتوقيت الرياض (D-201). */
export function zoneOf(cookieHeader: string | null): string | null {
  if (cookieHeader === null) return null
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0 || part.slice(0, eq).trim() !== TZ_COOKIE) continue
    try {
      return validZone(decodeURIComponent(part.slice(eq + 1).trim()))
    } catch {
      return null
    }
  }
  return null
}

export interface LocalParts {
  readonly year: number
  readonly month: number
  readonly day: number
  readonly hour: number
  readonly minute: number
  /** ٠ الأحد … ٦ السبت. */
  readonly weekday: number
}

/** أجزاءُ لحظةٍ في منطقة — و`null` للمنطقة يعني الرياض (D-201). */
export function localParts(date: Date, zone: string | null): LocalParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone ?? FALLBACK_ZONE, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', weekday: 'short',
  }).formatToParts(date)
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '0'
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'))
  return {
    year: Number(get('year')), month: Number(get('month')), day: Number(get('day')),
    hour: Number(get('hour')) % 24, minute: Number(get('minute')), weekday: weekday < 0 ? 0 : weekday,
  }
}

function at(value: string | Date): Date | null {
  return value instanceof Date ? value : parseSqliteUtc(value)
}

/** «21 سبتمبر» أو «21 سبتمبر 2025» — من أجزاءٍ قُرئت. */
function dm(p: LocalParts, withYear: boolean): string {
  return `${p.day} ${MONTHS[p.month - 1]}${withYear ? ` ${p.year}` : ''}`
}

/**
 * «21 سبتمبر» — يومٌ وشهرُه، **والسنةُ حين لا تكون سنةَ `now`** (خطّة التصميم ٨٫٣).
 * لعنوانٍ قصيرٍ لا يحتاج اسمَ اليوم: عمودُ أسبوعٍ في «ما مضى».
 */
export function dayMonth(value: string | Date, zone: string | null, now: Date): string {
  const date = at(value)
  if (date === null) return ''
  const p = localParts(date, zone)
  return dm(p, p.year !== localParts(now, zone).year)
}

/**
 * مدى أيّامٍ **وآخرُه داخلٌ فيه**: «21 إلى 27 سبتمبر»، و«28 سبتمبر إلى 4 أكتوبر»
 * حين يعبر شهرًا، والسنةُ على الطرفين حين يعبر سنةً، وعلى آخره حين لا يكون في سنة `now`.
 *
 * **والنهايةُ آخرُ يومٍ لا الحدُّ الذي بعده** — كان عنوانُ التقرير يكتب الاثنين
 * التالي («21 — 28») فيُقرأ أسبوعٌ ثمانيةَ أيّام. والمستدعي يسبقه بما يناسبه:
 * «أسبوع …» أو «من …».
 */
export function dayRange(first: string | Date, last: string | Date, zone: string | null, now: Date): string {
  const a = at(first)
  const b = at(last)
  if (a === null || b === null) return ''
  const p = localParts(a, zone)
  const q = localParts(b, zone)
  const year = q.year !== localParts(now, zone).year
  if (p.year !== q.year) return `${dm(p, true)} إلى ${dm(q, true)}`
  if (p.month !== q.month) return `${dm(p, false)} إلى ${dm(q, year)}`
  if (p.day === q.day) return dm(q, year)
  return `${p.day} إلى ${dm(q, year)}`
}

/**
 * أوّلُ الشهر بتوقيت المالك، لحظةً بـ UTC — **ليُقارَن بما يكتبه الدفتر**.
 *
 * مالكٌ في الرياض يفتح اللوحةَ الواحدةَ فجرَ الأوّل من أكتوبر: شهرُه بدأ قبل ساعة،
 * و«الشهرُ» بـ UTC ما زال سبتمبر كلَّه. فيُخمَّن منتصفُ الليل ثمّ يُصحَّح مرّتين بما
 * يقوله `Intl` — الإزاحةُ تتبدّل مع التوقيت الصيفيّ فلا تُثبَّت. و`null` يعني الرياض.
 */
export function monthStart(now: Date, zone: string | null): Date {
  const p = localParts(now, zone)
  const wanted = Date.UTC(p.year, p.month - 1, 1)
  let guess = wanted
  for (let i = 0; i < 2; i++) {
    const seen = localParts(new Date(guess), zone)
    guess += wanted - Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute)
  }
  return new Date(guess)
}

/** مفتاحُ اليوم `YYYY-MM-DD` بمنطقة المالك — به تُجمَع الصفوفُ تحت رؤوسها. */
export function dayKey(value: string | Date, zone: string | null): string {
  const date = at(value)
  if (date === null) return ''
  const p = localParts(date, zone)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

/** «الأحد 28 سبتمبر 2026» — رأسُ يوم. */
export function dayLabel(value: string | Date, zone: string | null, withYear = true): string {
  const date = at(value)
  if (date === null) return ''
  const p = localParts(date, zone)
  return `${DAYS[p.weekday]} ${p.day} ${MONTHS[p.month - 1]}${withYear ? ` ${p.year}` : ''}`
}

/** «09:05» بمنطقة المالك. */
export function clock(value: string | Date, zone: string | null): string {
  const date = at(value)
  if (date === null) return ''
  const p = localParts(date, zone)
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
}

/** «2026-10-13 09:00» بمنطقة المالك، و«بتوقيت الرياض» بعده إن كانت احتياطًا — لعنوانٍ يُحوَّم عليه. */
export function stamp(value: string | Date, zone: string | null): string {
  // ‏وما جاء بصيغة ISO (بـ T أو Z) يُقرأ UTC أيضًا، لا بمنطقة بيئة العامل
  const date = typeof value === 'string' ? parseSqliteUtc(value.replace('T', ' ').replace(/Z$/, '').slice(0, 19)) : value
  if (date === null) return typeof value === 'string' ? value : ''
  const p = localParts(date, zone)
  const two = (n: number): string => String(n).padStart(2, '0')
  return `${p.year}-${two(p.month)}-${two(p.day)} ${two(p.hour)}:${two(p.minute)}${zoneNote(zone)}`
}

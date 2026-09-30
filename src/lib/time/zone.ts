/**
 * يومُ المالك — **من متصفّحه في كلّ فتحة، لا من إعدادٍ يُخزَّن** (D-173).
 *
 * قضت D-106 بأنّ منطقةً تُخزَّن في إعدادٍ تُنسى فتكذب بعد سفرٍ أو تحوّلٍ
 * صيفيّ. **ورؤوسُ الأيّام تُجمَع على الخادم**: منشورٌ نُشر الحاديةَ عشرةَ
 * ليلًا بتوقيت الرياض يقع في يومٍ غيرِ يومه بـ UTC. فيكتب `u.js` الكعكةَ
 * `sada_tz` عند كلّ تحميل، ويقرؤها الخادمُ هنا ويتحقّق منها بـ `Intl`.
 *
 * **وغيابُها لا يُسقط شيئا**: تُجمَع الأيّامُ بـ UTC ويُقال ذلك في الصفحة.
 * ولا تدخل في قرارِ أمنٍ قطّ: أسوأُ ما يفعله من زوّرها أن يرى أيّامَه بمنطقةٍ أخرى.
 *
 * **والأسماءُ العربيّة من جدولٍ هنا لا من `Intl`**: الأرقامُ تُقرأ من
 * `formatToParts` بلغةٍ محايدة، فلا يتعلّق الصوابُ ببيانات لغةٍ في بيئة العامل.
 */
import { parseSqliteUtc } from '../format'

export const TZ_COOKIE = 'sada_tz'

const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'] as const
const MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
] as const

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

/** منطقةُ المالك من كعكة الطلب — أو `null` فتُجمَع الأيّامُ بـ UTC. */
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

/** أجزاءُ لحظةٍ في منطقة — و`null` للمنطقة يعني UTC. */
export function localParts(date: Date, zone: string | null): LocalParts {
  if (zone === null) {
    return {
      year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(),
      hour: date.getUTCHours(), minute: date.getUTCMinutes(), weekday: date.getUTCDay(),
    }
  }
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
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

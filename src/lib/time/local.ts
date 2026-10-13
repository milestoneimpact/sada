/**
 * ساعةُ المالك إلى UTC — **بالمنطقة لا بإزاحةٍ ثابتة**.
 *
 * الإزاحةُ تتبدّل مع التوقيت الصيفيّ في مناطق المالك المحتملة، فتُخمَّن اللحظةُ ثمّ
 * تُصحَّح مرّتين بما يقوله `Intl`. وتُستعمل في موضعين: خطّةٌ من ملفٍّ كتب فيه المالكُ
 * «9:30» بتوقيته، وأزرارُ «غدًا 9:00 ص» على مقطعٍ تُحسب على الخادم بتوقيته من كعكة
 * `sada_tz` (D-173) — **فلا UTC في وجهه ولا حسابَ في رأسه**.
 */
import { clock, dayLabel, localParts } from './zone'

/**
 * لحظةٌ محلّيّة إلى UTC، و`null` للمنطقة يعني الرياض (D-201). وتاريخٌ لا وجودَ له (31 فبراير)
 * أو ساعةٌ تقع في فجوة التوقيت الصيفيّ تُردّ `null` ولا تُصحَّح بصمت.
 */
export function localToUtc(
  y: number, mo: number, d: number, h: number, mi: number, zone: string | null,
): Date | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h < 0 || h > 23 || mi < 0 || mi > 59) return null
  const wanted = Date.UTC(y, mo - 1, d, h, mi)
  let guess = wanted
  for (let i = 0; i < 2; i++) {
    const p = localParts(new Date(guess), zone)
    guess += wanted - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute)
  }
  const check = localParts(new Date(guess), zone)
  if (check.year !== y || check.month !== mo || check.day !== d || check.hour !== h || check.minute !== mi) return null
  return new Date(guess)
}

export type Preset = 'hour' | 'tonight' | 'tomorrow' | 'sunday'

/**
 * أزرارُ الموعد السريع **بمعناها على الخادم** — بأسماء خطّة التصميم (7.6).
 * وشريطُ بطاقة المسوّدة يحسب الأربعةَ نفسَها في المتصفّح (`preset` في سكربت اللوحة):
 * فالقاعدةُ واحدة: «الليلة» الثامنةُ مساءً أو غدًا إن مضت، و«الأحد» من الغد فصاعدًا.
 */
export const PRESETS: readonly { readonly kind: Preset; readonly label: string }[] = [
  { kind: 'hour', label: 'بعد ساعة' },
  { kind: 'tonight', label: 'الليلة 8:00 م' },
  { kind: 'tomorrow', label: 'غدًا 9:00 ص' },
  { kind: 'sunday', label: 'الأحد 9:00 ص' },
]

/** «بعد ساعة» و«غدًا 9:00 ص» … إلى لحظة — بتوقيت المالك، ولا يقع في الماضي أبدًا. */
export function presetAt(kind: string, now: Date, zone: string | null): Date | null {
  // ‏والدقيقةُ أدقُّ ما تقبله الجدولة: «بعد ساعة» تُقصّ ثوانيها
  if (kind === 'hour') return new Date(Math.floor((now.getTime() + 3_600_000) / 60_000) * 60_000)
  const today = localParts(now, zone)
  /** يومٌ بعد اليوم المحلّيّ بـ `days` — و`Date.UTC` يدحرج آخرَ الشهر إلى أوّل ما بعده. */
  const dayAt = (days: number, hour: number): Date | null => {
    const d = new Date(Date.UTC(today.year, today.month - 1, today.day + days))
    return localToUtc(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), hour, 0, zone)
  }
  if (kind === 'tonight') {
    const tonight = dayAt(0, 20)
    return tonight !== null && tonight.getTime() > now.getTime() ? tonight : dayAt(1, 20)
  }
  if (kind === 'tomorrow') return dayAt(1, 9)
  if (kind === 'sunday') {
    // ‏من الغد فصاعدًا: الأحدُ يوم الأحد هو الأحدُ القادم
    const ahead = ((7 - today.weekday) % 7) || 7
    return dayAt(ahead, 9)
  }
  return null
}

/**
 * «الأحد 5 أكتوبر 09:00» — لحظةٌ بمنطقة المالك كما يقرؤها، والسنةُ إن لم تكن سنتَه.
 * من دالّتَي `zone.ts` لا صياغةٍ ثالثة (خطّة التصميم 8.3): إن صار الوقتُ «9:00 ص» هناك صار هنا.
 */
export function momentLabel(at: Date, zone: string | null, now: Date): string {
  const year = localParts(at, zone).year !== localParts(now, zone).year
  return `${dayLabel(at, zone, year)} ${clock(at, zone)}`
}

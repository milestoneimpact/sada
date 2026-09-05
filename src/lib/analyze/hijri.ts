/**
 * الوعي بالتقويم الهجريّ.
 *
 * لماذا في نظام نشر: ما يستحقّ النشر يتغيّر بالموسم. مادّةٌ عن الوقف
 * تُقرأ في رمضان قراءةً غيرها في صفر، وحملةٌ تُطلَق يوم عرفة تنافس ما لا
 * يُنافَس. فالنموذج يحتاج أن يعرف *متى* هو، لا *ما* هو وحده.
 *
 * ويُحسب من `Intl` لا من جدول: التقويم الأمّ القمريّ (`islamic-umalqura`)
 * هو المعتمد في السعوديّة، و V8 يحمله في Worker وفي بيئة الاختبار معا.
 */

export interface HijriDate {
  readonly year: number
  readonly month: number
  readonly day: number
  readonly monthName: string
  /** موسمٌ يغيّر ما يستحقّ النشر، أو `null` في الشهور العاديّة. */
  readonly season: string | null
}

const MONTHS = [
  'محرّم', 'صفر', 'ربيع الأول', 'ربيع الآخر', 'جمادى الأولى', 'جمادى الآخرة',
  'رجب', 'شعبان', 'رمضان', 'شوّال', 'ذو القعدة', 'ذو الحجة',
] as const

/**
 * المواسم التي تغيّر القرار، لا كلّ ما هو مميّز.
 *
 * وحدودها بالأيّام مقصودة: أوّل شوّال ليس كآخره، وعشر ذي الحجة ليست
 * كبقيّته. ومَن يعامل الشهر كتلةً واحدة يخطئ الأسبوع الذي يهمّ.
 */
function seasonOf(month: number, day: number): string | null {
  if (month === 9) {
    if (day <= 10) return 'العشر الأولى من رمضان'
    if (day >= 21) return 'العشر الأواخر من رمضان — ليلة القدر'
    return 'رمضان'
  }
  if (month === 10 && day <= 3) return 'عيد الفطر'
  if (month === 12) {
    if (day <= 10) return day === 9 ? 'يوم عرفة' : 'عشر ذي الحجة'
    if (day <= 13) return 'عيد الأضحى وأيام التشريق'
  }
  if (month === 1 && day === 10) return 'يوم عاشوراء'
  if (month === 8 && day >= 15) return 'أواخر شعبان — عتبة رمضان'
  return null
}

/** يحوّل تاريخا ميلاديا إلى هجريّ أمّ القرى. */
export function toHijri(date: Date): HijriDate {
  const parts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    timeZone: 'Asia/Riyadh',
  }).formatToParts(date)

  const read = (type: string): number => {
    const found = parts.find((p) => p.type === type)?.value ?? '0'
    // صيغة السنة قد تحمل لاحقة مثل «1447 AH» — تُنتزع الأرقام وحدها
    return Number.parseInt(found.replace(/\D/g, ''), 10)
  }

  const month = read('month')
  const day = read('day')
  return {
    year: read('year'),
    month,
    day,
    monthName: MONTHS[month - 1] ?? String(month),
    season: seasonOf(month, day),
  }
}

/** سطرٌ يُحقن في التلقين. يُذكر الموسم حين يوجد فقط — لا حشو بلا معنى. */
export function hijriContext(date: Date): string {
  const h = toHijri(date)
  const base = `${h.day} ${h.monthName} ${h.year}هـ`
  return h.season === null ? base : `${base} — ${h.season}`
}

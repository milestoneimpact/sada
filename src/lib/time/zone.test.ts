/** يومُ المالك من كعكته (D-173) — والمنطقةُ الفاسدة لا تُسقط شيئا. */
import { describe, expect, it } from 'vitest'
import { clock, dayKey, dayLabel, dayMonth, dayRange, monthStart, validZone, zoneOf } from './zone'

describe('المنطقة', () => {
  it('تُقبل ما يقبله Intl، ويُردّ ما سواه', () => {
    expect(validZone('Asia/Riyadh')).toBe('Asia/Riyadh')
    expect(validZone('America/New_York')).toBe('America/New_York')
    expect(validZone('Mars/Olympus')).toBeNull()
    expect(validZone('<script>')).toBeNull()
    expect(validZone('')).toBeNull()
  })

  it('وتُقرأ من الكعكة بين غيرها، ومرمَّزةً', () => {
    expect(zoneOf('a=1; sada_tz=Asia%2FRiyadh; b=2')).toBe('Asia/Riyadh')
    expect(zoneOf('sada_tz=%E0%A4%A')).toBeNull()
    expect(zoneOf(null)).toBeNull()
    expect(zoneOf('other=1')).toBeNull()
  })
})

describe('اليوم', () => {
  it('ليلُ UTC صباحُ الرياض — فيقع في يومه لا في يوم UTC', () => {
    expect(dayKey('2026-09-05 22:30:00', 'Asia/Riyadh')).toBe('2026-09-06')
    expect(dayKey('2026-09-05 22:30:00', null)).toBe('2026-09-05')
    expect(dayLabel('2026-09-05 22:30:00', 'Asia/Riyadh')).toBe('الأحد 6 سبتمبر 2026')
    expect(clock('2026-09-05 22:30:00', 'Asia/Riyadh')).toBe('01:30')
  })

  it('وحدُّ منتصف الليل في نيويورك عبر التوقيت الصيفيّ', () => {
    // ‏03:59 UTC في 8 مارس 2026 = 23:59 من 7 مارس بنيويورك (EDT بدأ 02:00 محلّيًّا)
    expect(dayKey('2026-03-08 03:59:00', 'America/New_York')).toBe('2026-03-07')
    expect(dayKey('2026-03-08 05:00:00', 'America/New_York')).toBe('2026-03-08')
    expect(dayLabel(new Date('2026-03-08T12:00:00Z'), 'America/New_York', false)).toBe('الأحد 8 مارس')
  })
})

describe('المدى (خطّة التصميم ٨٫٣)', () => {
  const now = new Date('2026-10-04T09:00:00Z')

  /** **آخرُه داخلٌ فيه**: أسبوعٌ من الاثنين إلى الأحد سبعةُ أيّامٍ لا ثمانية. */
  it('«21 إلى 27 سبتمبر» في شهرٍ واحد، والشهرُ على الطرفين حين يعبر', () => {
    expect(dayRange('2026-09-21 00:00:00', '2026-09-27 00:00:00', null, now)).toBe('21 إلى 27 سبتمبر')
    expect(dayRange(new Date('2026-09-28T00:00:00Z'), new Date('2026-10-04T00:00:00Z'), null, now))
      .toBe('28 سبتمبر إلى 4 أكتوبر')
  })

  it('والسنةُ حين لا تكون الحاليّة، وعلى الطرفين حين يعبرها المدى', () => {
    expect(dayRange('2025-09-22 00:00:00', '2025-09-28 00:00:00', null, now)).toBe('22 إلى 28 سبتمبر 2025')
    expect(dayRange('2025-12-29 00:00:00', '2026-01-04 00:00:00', null, now))
      .toBe('29 ديسمبر 2025 إلى 4 يناير 2026')
    expect(dayMonth('2026-09-21 00:00:00', null, now)).toBe('21 سبتمبر')
    expect(dayMonth('2025-09-22 00:00:00', null, now)).toBe('22 سبتمبر 2025')
  })

  it('وتاريخٌ لا يُقرأ يعطي فراغًا لا «NaN»', () => {
    expect(dayRange('ليس تاريخًا', '2026-09-27 00:00:00', null, now)).toBe('')
  })
})

describe('أوّلُ الشهر بتوقيت المالك', () => {
  /** فجرُ الأوّل من أكتوبر بالرياض ما زال سبتمبرَ بـ UTC — وشهرُ المالك بدأ. */
  it('الرياض: منتصفُ ليل الأوّل بتوقيتها، أي 21:00 من آخر الشهر قبله بـ UTC', () => {
    expect(monthStart(new Date('2026-09-30T22:00:00Z'), 'Asia/Riyadh').toISOString())
      .toBe('2026-09-30T21:00:00.000Z')
    expect(monthStart(new Date('2026-09-30T22:00:00Z'), null).toISOString())
      .toBe('2026-09-01T00:00:00.000Z')
  })

  it('ونيويورك عبر التوقيت الصيفيّ: الإزاحةُ تُقرأ ولا تُثبَّت', () => {
    // ‏مارس يبدأ بتوقيت EST ‏(−5)، وأبريل بـ EDT ‏(−4)
    expect(monthStart(new Date('2026-03-15T12:00:00Z'), 'America/New_York').toISOString())
      .toBe('2026-03-01T05:00:00.000Z')
    expect(monthStart(new Date('2026-04-15T12:00:00Z'), 'America/New_York').toISOString())
      .toBe('2026-04-01T04:00:00.000Z')
  })
})

/** يومُ المالك من كعكته (D-173) — والمنطقةُ الفاسدة لا تُسقط شيئا. */
import { describe, expect, it } from 'vitest'
import { clock, dayKey, dayLabel, validZone, zoneOf } from './zone'

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

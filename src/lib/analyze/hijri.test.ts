import { describe, expect, it } from 'vitest'
import { hijriContext, toHijri } from './hijri'

/** تواريخ ميلاديّة يقابلها هجريّ معروف — تُثبت أنّ التحويل يجري فعلا. */
describe('التحويل إلى أمّ القرى', () => {
  it('يعطي شهرا بين ١ و ١٢ ويوما بين ١ و ٣٠', () => {
    for (let day = 1; day <= 365; day += 17) {
      const date = new Date(Date.UTC(2026, 0, day, 12))
      const h = toHijri(date)
      expect(h.month).toBeGreaterThanOrEqual(1)
      expect(h.month).toBeLessThanOrEqual(12)
      expect(h.day).toBeGreaterThanOrEqual(1)
      expect(h.day).toBeLessThanOrEqual(30)
      expect(h.year).toBeGreaterThan(1400)
    }
  })

  it('يسمّي الشهر بالعربية لا برقمه', () => {
    const h = toHijri(new Date('2026-09-05T12:00:00Z'))
    expect(h.monthName).toMatch(/[؀-ۿ]/)
    expect(h.monthName).not.toMatch(/^\d+$/)
  })

  it('لا يترك السنة صفرا مهما كانت صيغة Intl', () => {
    // بعض البيئات تعيد «1447 AH» — الانتزاع يجب أن يصمد
    expect(toHijri(new Date('2026-09-05T12:00:00Z')).year).toBeGreaterThan(1400)
  })
})

/**
 * المواسم تُفحص بحسابها لا بتاريخٍ ميلاديّ مثبَّت: ربط الاختبار بيومٍ
 * ميلاديّ بعينه يجعله يكسر حين يتغيّر التقويم لا حين تكسر الشيفرة.
 */
describe('المواسم التي تغيّر القرار', () => {
  function seasonAt(target: { month: number; day: number }): string | null {
    // يمسح سنة كاملة حتى يجد اليوم الهجريّ المطلوب
    for (let i = 0; i < 400; i += 1) {
      const date = new Date(Date.UTC(2026, 0, 1 + i, 12))
      const h = toHijri(date)
      if (h.month === target.month && h.day === target.day) return h.season
    }
    throw new Error(`لم يوجد ${target.month}/${target.day} في المسح`)
  }

  it.each([
    ['أول رمضان', { month: 9, day: 1 }, 'العشر الأولى من رمضان'],
    ['منتصف رمضان', { month: 9, day: 15 }, 'رمضان'],
    ['ليلة القدر المرجّحة', { month: 9, day: 27 }, 'العشر الأواخر من رمضان — ليلة القدر'],
    ['عيد الفطر', { month: 10, day: 1 }, 'عيد الفطر'],
    ['يوم عرفة', { month: 12, day: 9 }, 'يوم عرفة'],
    ['عيد الأضحى', { month: 12, day: 10 }, 'عشر ذي الحجة'],
    ['عاشوراء', { month: 1, day: 10 }, 'يوم عاشوراء'],
  ])('%s', (_name, target, expected) => {
    expect(seasonAt(target)).toBe(expected)
  })

  it('الشهر العاديّ بلا موسم — فلا يُحشى التلقين بلا معنى', () => {
    expect(seasonAt({ month: 2, day: 15 })).toBeNull()
    expect(seasonAt({ month: 5, day: 20 })).toBeNull()
  })

  it('يميّز أوّل شوّال من آخره — الشهر ليس كتلة واحدة', () => {
    expect(seasonAt({ month: 10, day: 1 })).toBe('عيد الفطر')
    expect(seasonAt({ month: 10, day: 20 })).toBeNull()
  })
})

describe('hijriContext', () => {
  it('يذكر الموسم حين يوجد، ولا يذكره حين لا يوجد', () => {
    let withSeason: string | null = null
    let without: string | null = null
    for (let i = 0; i < 400 && (withSeason === null || without === null); i += 1) {
      const date = new Date(Date.UTC(2026, 0, 1 + i, 12))
      const line = hijriContext(date)
      if (toHijri(date).season === null) without ??= line
      else withSeason ??= line
    }
    expect(withSeason).toContain('—')
    expect(without).not.toContain('—')
    expect(without).toMatch(/هـ$/)
  })
})

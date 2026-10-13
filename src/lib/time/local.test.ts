/** ساعةُ المالك إلى UTC، وأزرارُ الموعد السريع على الخادم بتوقيته (ر-4). */
import { describe, expect, it } from 'vitest'
import { localToUtc, momentLabel, presetAt, PRESETS } from './local'

// ‏الأحد ٤ أكتوبر ٢٠٢٦، الحاديةَ عشرةَ صباحًا بتوقيت الرياض
const NOW = new Date('2026-10-04T08:00:00Z')
const iso = (d: Date | null): string | null => d?.toISOString().slice(0, 16) ?? null

describe('localToUtc', () => {
  it('بالمنطقة لا بإزاحةٍ ثابتة، والرياض حين لا منطقة (D-201)، وما لا وجودَ له يُردّ', () => {
    expect(iso(localToUtc(2026, 10, 12, 9, 30, 'Asia/Riyadh'))).toBe('2026-10-12T06:30')
    expect(iso(localToUtc(2026, 7, 1, 12, 0, 'Europe/London'))).toBe('2026-07-01T11:00')
    expect(iso(localToUtc(2026, 7, 1, 12, 0, null))).toBe('2026-07-01T09:00')
    expect(localToUtc(2026, 2, 31, 10, 0, 'Asia/Riyadh')).toBeNull()
    // ‏ساعةٌ في فجوة الصيف بلندن (29 مارس 2026، من 1:00 إلى 2:00) لا تُصحَّح بصمت
    expect(localToUtc(2026, 3, 29, 1, 30, 'Europe/London')).toBeNull()
  })
})

describe('presetAt — الأزرارُ الأربعة بتوقيت المالك', () => {
  it('«غدًا 9:00 ص» و«الأحد 9:00 ص» بساعته لا بـ UTC', () => {
    expect(iso(presetAt('tomorrow', NOW, 'Asia/Riyadh'))).toBe('2026-10-05T06:00')
    // ‏اليومُ أحد: فالأحدُ القادم لا اليوم
    expect(iso(presetAt('sunday', NOW, 'Asia/Riyadh'))).toBe('2026-10-11T06:00')
    expect(iso(presetAt('sunday', new Date('2026-10-03T08:00:00Z'), 'Asia/Riyadh'))).toBe('2026-10-04T06:00')
    // ‏وبلا منطقةٍ يُحسب بتوقيت الرياض (D-201)
    expect(iso(presetAt('tomorrow', NOW, null))).toBe('2026-10-05T06:00')
  })

  it('«الليلة 8:00 م» الليلةَ ما لم تمضِ الثامنة، وإلّا فالغد — واليومُ يومُ المالك لا يومُ UTC', () => {
    expect(iso(presetAt('tonight', NOW, 'Asia/Riyadh'))).toBe('2026-10-04T17:00')
    expect(iso(presetAt('tonight', new Date('2026-10-04T18:00:00Z'), 'Asia/Riyadh'))).toBe('2026-10-05T17:00')
    // ‏الثالثةُ إلّا ربعًا بعد منتصف الليل بالرياض، والتاريخُ بـ UTC ما زال الأمس
    expect(iso(presetAt('tomorrow', new Date('2026-10-04T23:45:00Z'), 'Asia/Riyadh'))).toBe('2026-10-06T06:00')
  })

  it('«بعد ساعة» بدقّة الدقيقة، وكلُّ زرٍّ في المستقبل، والاسمُ المجهول لا يصير موعدًا', () => {
    expect(iso(presetAt('hour', new Date('2026-10-04T08:17:33Z'), 'Asia/Riyadh'))).toBe('2026-10-04T09:17')
    for (let h = 0; h < 24; h++) {
      const now = new Date(Date.UTC(2026, 9, 4, h, 31))
      for (const { kind } of PRESETS) {
        expect(presetAt(kind, now, 'America/New_York')!.getTime(), `${kind} عند ${h}`).toBeGreaterThan(now.getTime())
      }
    }
    expect(presetAt('yesterday', NOW, 'Asia/Riyadh')).toBeNull()
  })
})

describe('momentLabel', () => {
  it('اليومُ والساعةُ بمنطقة المالك، والسنةُ إن لم تكن سنتَه', () => {
    expect(momentLabel(new Date('2026-10-05T06:00:00Z'), 'Asia/Riyadh', NOW)).toBe('الاثنين 5 أكتوبر 09:00')
    expect(momentLabel(new Date('2027-01-03T06:00:00Z'), 'Asia/Riyadh', NOW)).toBe('الأحد 3 يناير 2027 09:00')
  })
})

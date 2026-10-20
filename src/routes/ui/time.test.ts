/**
 * وسمُ الموعد (D-106 · D-201 · D-220) — **سطرٌ واحدٌ بمنطقة المالك، يُكتب على الخادم**.
 *
 * كان الوسمُ يكتب الرياضَ ثمّ يزيد سكربتٌ سطرًا بصيغةٍ ثانية. فصار الخادمُ يكتبه بالمنطقة
 * من الكعكة، ويقول «بتوقيتك»، أو «بتوقيت الرياض» حين لا منطقة.
 */
import { describe, expect, it } from 'vitest'
import { whenTag } from './time'
import { STYLE } from './styles'
import { sheet } from '../../test/css'

const NOW = new Date('2026-09-01T09:00:00Z')

describe('وسم الموعد', () => {
  it('بلا منطقة: وقت الرياض بـ «ص» و«م» ويُقال ذلك، لا UTC', () => {
    const html = whenTag('2026-09-08 19:30:00', { now: NOW })
    expect(html).toContain('<b>الثلاثاء 8 سبتمبر 10:30 م</b> <span class="tz">بتوقيت الرياض</span>')
    expect(html).not.toContain('UTC')
  })

  it('وبمنطقة المالك: وقتُه هو، ويُقال «بتوقيتك»', () => {
    const html = whenTag('2026-09-08 19:30:00', { zone: 'Europe/Berlin', now: NOW })
    expect(html).toContain('<b>الثلاثاء 8 سبتمبر 9:30 م</b> <span class="tz">بتوقيتك</span>')
  })

  it('والسنة حين لا تكون سنة الآن', () => {
    expect(whenTag('2027-01-03 06:00:00', { now: NOW })).toContain('الأحد 3 يناير 2027 9:00 ص')
  })

  it('ويحمل ISO في datetime ليقرأه قارئ الشاشة', () => {
    expect(whenTag('2026-09-08 19:30:00')).toContain('datetime="2026-09-08T19:30:00.000Z"')
  })

  it('ولا شيء لموعد غائب', () => {
    expect(whenTag(null)).toBe('')
  })

  it('وقيمة لا تُقرأ تاريخًا تُعرَض حرفًا مُهرَّبًا', () => {
    expect(whenTag('<b>ليس تاريخا</b>')).toBe('&lt;b&gt;ليس تاريخا&lt;/b&gt;')
  })

  it('واللافتة تسبق الرقم حين تُطلَب', () => {
    expect(whenTag('2026-09-08 19:30:00', { label: 'موعدُه' })).toContain('موعدُه <time')
  })

  it('والصنف معرَّف في الأنماط', () => {
    expect(sheet(STYLE).where('.when-t')).toContain('')
  })
})

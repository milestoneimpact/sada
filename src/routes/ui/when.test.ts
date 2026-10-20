import { describe, expect, it } from 'vitest'
import { whenField } from './when'

const NOW = new Date('2026-10-04T08:00:00Z')

describe('whenField — «أقرب ذروة» حين قِيست', () => {
  it('ذروة مقيسة: أوّل الخيارات ومختارُها، وتحته يومُه وساعتُه بتوقيت المالك', () => {
    const html = whenField('f', 'Asia/Riyadh', NOW, { samples: 9, hours: [{ hour: 15, median: 40, posts: 5 }], why: '' })
    expect(html).toContain('name="preset" value="peak-15" form="f" checked')
    expect(html).toContain('أقرب ذروة')
    expect(html).not.toContain('value="tomorrow" form="f" checked')
    expect(html.indexOf('peak-15')).toBeLessThan(html.indexOf('value="hour"'))
  })

  it('لم تُقَس: لا «أقرب ذروة»، و«غدًا 9:00 ص» مختار كما كان', () => {
    for (const peaks of [undefined, { samples: 0, hours: [], why: '' }]) {
      const html = whenField('f', 'Asia/Riyadh', NOW, peaks)
      expect(html).not.toContain('peak-')
      expect(html).toContain('value="tomorrow" form="f" checked')
    }
  })
})

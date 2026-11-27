import { describe, expect, it } from 'vitest'
import { approvalLine, isPeriod, loadLevel, monthGrid, monthJourney, nextPeriod } from './month'

describe('شاشة الشهر (D-383 المرحلة ٨)', () => {
  it('شارة الحمل: دون السقف أخضر، وعنده أصفر، وفوقه أحمر', () => {
    expect(loadLevel(0, 5)).toBeNull()
    expect(loadLevel(3, 5)).toBe('ok')
    expect(loadLevel(5, 5)).toBe('warn')
    expect(loadLevel(6, 5)).toBe('bad')
  })

  it('تقويم نوفمبر 2026 يبدأ بالأحد، وكلّ أسبوع سبع خانات', () => {
    const g = monthGrid('2026-11')
    expect(g[0]![0]).toBe('2026-11-01')
    expect(g.every((w) => w.length === 7)).toBe(true)
    expect(g.flat().filter((d) => d !== null)).toHaveLength(30)
    const feb = monthGrid('2027-02').flat().filter((d) => d !== null)
    expect(feb).toHaveLength(28)
  })

  it('الشهر التالي يعبر السنة، والصيغة تُفحص', () => {
    expect(nextPeriod('2026-12')).toBe('2027-01')
    expect(isPeriod('2026-11')).toBe(true)
    expect(isPeriod('2026-13')).toBe(false)
  })

  it('سطر الاعتماد يعدّ ويذكر السبب', () => {
    expect(approvalLine({ total: 32, blocked: 3, reason: 'وسيط ناقص' })).toBe('32 بندًا، 29 تُجدوَل، 3 ممنوعة بسبب: وسيط ناقص.')
    expect(approvalLine({ total: 4, blocked: 0 })).toBe('4 بندًا، 4 تُجدوَل، ولا ممنوع.')
  })

  it('الرحلة تبلغ آخر محطّة، وتنبّه للفشل وللشهر القادم بلا خطّة', () => {
    const j = monthJourney({ period: '2026-11', hasPlan: true, reviewed: true, items: 10, approved: 2, queued: 5, published: 2, failed: 1 }, '2026-11-16')
    expect(j.reached).toBe('published')
    expect(j.counts.scheduled).toBe(8)
    expect(j.alerts[0]).toContain('فشل')
    const n = monthJourney({ period: '2026-12', hasPlan: false, reviewed: false, items: 0, approved: 0, queued: 0, published: 0, failed: 0 }, '2026-11-25')
    expect(n.reached).toBeNull()
    expect(n.alerts[0]).toContain('بعد 6 أيّام')
    const far = monthJourney({ period: '2026-12', hasPlan: false, reviewed: false, items: 0, approved: 0, queued: 0, published: 0, failed: 0 }, '2026-11-01')
    expect(far.alerts).toHaveLength(0)
  })
})

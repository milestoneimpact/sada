import { describe, expect, it } from 'vitest'
import { channelPulse } from './pulse'
import type { PostFact } from './whatWorks'

const now = new Date('2026-10-21T12:00:00Z')
const fact = (id: string, daysAgo: number, engagement: number): PostFact => ({
  id, platform: 'x', format: 'text', chars: 100, engagement, impressions: null, text: 'ن',
  publishedAt: new Date(now.getTime() - daysAgo * 86_400_000).toISOString().slice(0, 19).replace('T', ' '),
})

describe('نبضُ القناة (D-263)', () => {
  it('ما خرج في ثلاثين يومًا ووسيطُه واتّجاهُه عن الثلاثين قبلها', () => {
    const p = channelPulse([fact('a', 1, 20), fact('b', 5, 30), fact('c', 9, 40), fact('d', 35, 10), fact('e', 40, 20), fact('f', 50, 15)], now, null)
    expect(p.last30).toBe(3)
    expect(p.median30).toBe(30)
    expect(p.trend).toBe(100)
    // ‏ستّةٌ مقيسة: لا موعدَ ولا شكلَ قبل ثمانية
    expect(p.slot).toBeNull()
    expect(p.why).toContain('بعد 8 منشورات مقيسة — قِيس 6')
  })

  it('لا اتّجاهَ قبل ثلاثةٍ في كلّ نافذة، والفرقُ دون ٢٠٪ «كالمعتاد»', () => {
    expect(channelPulse([fact('a', 1, 20), fact('d', 35, 10)], now, null).trend).toBeNull()
    expect(channelPulse([fact('a', 1, 11), fact('b', 2, 11), fact('c', 3, 11), fact('d', 35, 10), fact('e', 36, 10), fact('f', 37, 10)], now, null).trend).toBe(0)
  })
})

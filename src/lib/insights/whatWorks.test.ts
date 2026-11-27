import { describe, expect, it } from 'vitest'
import { bandOf, median, MIN_POSTS, whatWorks, type PostFact } from './whatWorks'

/** منشورٌ بموعده UTC — والرياضُ +3، فـ«06:00» UTC تاسعةُ الضحى هناك. */
function fact(i: number, at: string, engagement: number, format: PostFact['format'] = 'text', chars = 200): PostFact {
  return { id: `p${i}`, platform: 'linkedin', publishedAt: at, format, chars, engagement, impressions: null, text: 'x'.repeat(chars) }
}

describe('«ما ينجح» (D-253)', () => {
  it('لا حكمَ قبل ثمانية منشوراتٍ مقيسة — ويقول كم بقي', () => {
    const r = whatWorks([fact(1, '2026-10-04 06:00:00', 5)], null)
    expect(r.dims).toBeNull()
    expect(r.why).toBe(`يُقال بعد ${MIN_POSTS} منشورات مقيسة — قِيس 1`)
  })

  it('الوسيطُ لا المتوسّط، والفتراتُ بمنطقة المالك', () => {
    expect(median([1, 100, 3])).toBe(3)
    expect(bandOf(10).key).toBe('morning')
    expect(bandOf(2).key).toBe('night')
  })

  it('الصورُ تجلب أكثرَ من النصّ فيُقال بعيّنته، والفرقُ الصغيرُ لا يُقال', () => {
    const facts = [
      ...[1, 2, 3, 4].map((i) => fact(i, `2026-10-0${i} 06:00:00`, 30, 'image')),
      ...[5, 6, 7, 8].map((i) => fact(i, `2026-10-0${i} 06:00:00`, 10, 'text')),
    ]
    const r = whatWorks(facts, null)
    expect(r.dims).not.toBeNull()
    const format = r.dims!.find((d) => d.title === 'الشكل')!
    expect(format.best?.key).toBe('image')
    expect(r.advice.some((a) => a.includes('«صورة»') && a.includes('«نصّ»') && a.includes('(4 و4 منشورًا)'))).toBe(true)
    // ‏والطولُ واحدٌ للجميع: لا مقارنة
    expect(r.advice.some((a) => a.includes('قصير'))).toBe(false)
  })

  it('منشورٌ واحدٌ انتشر لا يرفع خانتَه: الدرجةُ تنكمش نحو العامّ', () => {
    const facts = [
      fact(1, '2026-10-04 15:00:00', 900),
      ...[2, 3, 4, 5, 6, 7, 8, 9].map((i) => fact(i, `2026-10-0${i % 7 + 1} 06:00:00`, 10)),
    ]
    const band = whatWorks(facts, null).dims!.find((d) => d.title === 'فترة اليوم')!
    // ‏المساءُ منشورٌ واحد: لا يُرشَّح ولو كان تفاعلُه تسعين ضعفًا
    expect(band.best?.key).toBe('morning')
  })

  it('وأفضلُ موعدٍ يقول يومَه وفترتَه وتقديرَه', () => {
    const facts = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => fact(i, '2026-10-04 06:00:00', 10 + i))
    const r = whatWorks(facts, null)
    expect(r.slot?.label).toBe('الأحد في الضحى (9–12)')
    expect(r.slot?.expected).toBeGreaterThan(0)
  })
})

import { describe, expect, it } from 'vitest'
import { containsUrl } from './idempotency'
import { estimatePostCost } from './cost'

describe('containsUrl — يُحسب بالشيفرة لا بالنموذج (D-003)', () => {
  it.each([
    'اقرأ على https://basserh.com',
    'زر http://example.org/page',
    'التفاصيل على www.basserh.com',
    'موقعنا basserh.com فيه المزيد',
    'انظر sada.io',
  ])('يلتقط الرابط في: %s', (text) => {
    expect(containsUrl(text)).toBe(true)
  })

  it.each([
    'منشور نصي بلا أي رابط',
    'رقم 3.14 ليس نطاقا',
    'الساعة 9.30 صباحا',
  ])('لا يعدّ رابطا: %s', (text) => {
    expect(containsUrl(text)).toBe(false)
  })
})

describe('التكلفة قبل الاعتماد', () => {
  it('الرابط على X يكلف ثلاثة عشر ضعفا', () => {
    const plain = estimatePostCost('x', false)
    const withUrl = estimatePostCost('x', true)
    expect(plain).toBeCloseTo(0.015)
    expect(withUrl).toBeCloseTo(0.2)
    expect(withUrl / plain).toBeGreaterThan(13)
  })

  it('LinkedIn بلا رسوم على المنشور', () => {
    expect(estimatePostCost('linkedin', true)).toBe(0)
  })
})

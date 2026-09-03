import { describe, expect, it } from 'vitest'
import { containsUrl, idempotencyKey } from './idempotency'
import { estimatePostCost, estimateThreadCost } from './cost'

describe('idempotencyKey', () => {
  it('ثابت للمدخل نفسه — وهو شرط فائدته كلها', async () => {
    const first = await idempotencyKey('p1')
    const second = await idempotencyKey('p1')
    expect(first).toBe(second)
  })

  it('يختلف باختلاف المنشور', async () => {
    expect(await idempotencyKey('p1')).not.toBe(await idempotencyKey('p2'))
  })

  it('يختلف باختلاف نطاق المحاولة', async () => {
    expect(await idempotencyKey('p1', 'publish')).not.toBe(await idempotencyKey('p1', 'retry:1'))
  })

  it('يعطي sha256 بصيغة hex من 64 محرفا', async () => {
    expect(await idempotencyKey('p1')).toMatch(/^[0-9a-f]{64}$/)
  })
})

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

  it('الثريد يُحاسَب بعدد منشوراته لا كوحدة', () => {
    const texts = ['واحد', 'اثنان', 'ثلاثة بالرابط https://basserh.com']
    expect(estimateThreadCost(texts, containsUrl)).toBeCloseTo(0.015 * 2 + 0.2)
  })
})

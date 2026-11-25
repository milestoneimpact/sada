import { describe, expect, it } from 'vitest'
import { buildEstimateLine, estimateBuild, type PlannedCall } from './buildCost'
import { costOf } from './providers'
import { DRAFT_IMAGE_MODEL, FINAL_IMAGE_MODEL, imageNeurons, splitCharge } from './ai/imagePricing'

const writer = { priceIn: 3, priceOut: 15 }
const text = (inputTokens: number, outputTokens: number): PlannedCall => ({ kind: 'text', op: 'draft:x', price: writer, tokens: { inputTokens, outputTokens } })
const cf = (model: string, w = 1344, h = 768): PlannedCall => ({ kind: 'image', op: 'image:x', model, width: w, height: h, price: { priceIn: null, priceOut: null } })

describe('estimateBuild (D-395)', () => {
  it('يساوي مجموعَ ما يكتبه الدفترُ نداءً نداءً للمجموعة نفسِها', () => {
    const used = 9_000
    const calls = [text(1200, 400), text(800, 900), cf(DRAFT_IMAGE_MODEL, 1024, 1024), cf(FINAL_IMAGE_MODEL), cf(FINAL_IMAGE_MODEL)]
    // ‏ما يكتبه `writer.ts` (costOf) و`image/job.ts` (splitCharge على ما استُهلك قبله) لكلّ نداء
    let ledger = costOf(writer, { inputTokens: 1200, outputTokens: 400 }).total + costOf(writer, { inputTokens: 800, outputTokens: 900 }).total
    let u = used
    for (const [m, w, h] of [[DRAFT_IMAGE_MODEL, 1024, 1024], [FINAL_IMAGE_MODEL, 1344, 768], [FINAL_IMAGE_MODEL, 1344, 768]] as const) {
      const n = imageNeurons(m, w, h)!
      ledger += splitCharge(n, u).usd
      u += n
    }
    const e = estimateBuild(calls, used)
    expect(e.usd).toBeCloseTo(ledger, 12)
    expect(e.usd).toBeGreaterThan(0)
    expect(e.calls).toBe(5)
    expect(e.freeImages).toBe(1)
    expect(e.overQuota).toBe(2)
  })

  it('صورةُ مزوّدٍ بسعرٍ تُسعَّر لنداءٍ واحد كما في الدفتر', () => {
    const price = { priceIn: null, priceOut: 40_000 }
    const e = estimateBuild([{ kind: 'image', op: 'image:x', model: null, width: 1024, height: 1024, price }], 0)
    expect(e.usd).toBeCloseTo(costOf(price, { inputTokens: 0, outputTokens: 1 }).total, 12)
  })

  it('ما لا سعرَ له يُعدّ «غيرَ متحقَّق» ولا يُحسب صفرًا صامتًا', () => {
    const none = { priceIn: null, priceOut: null }
    const e = estimateBuild([
      { kind: 'unpriced', op: 'infographic:x' },
      { kind: 'text', op: 'draft:x', price: none, tokens: { inputTokens: 1, outputTokens: 1 } },
      { kind: 'image', op: 'image:x', model: '@cf/unknown', width: 1024, height: 1024, price: none },
      text(100, 100),
    ], 0)
    expect(e.unverified).toBe(3)
    expect(e.usd).toBeCloseTo(costOf(writer, { inputTokens: 100, outputTokens: 100 }).total, 12)
    expect(buildEstimateLine(e)).toContain('3 نداءً سعرُه غيرُ متحقَّق')
  })

  it('كتابةٌ بلا طولٍ مقيس تُقال «لم يُقَس» ولا يُخترع لها رقم', () => {
    const e = estimateBuild([{ kind: 'text', op: 'draft:x', price: writer, tokens: null }], 0)
    expect(e).toMatchObject({ usd: 0, unmeasured: 1, unverified: 0 })
    expect(buildEstimateLine(e)).toContain('لم يُقَس طولُه')
  })
})

/** سعرُ الصورة بالنموذج والمقاس من صفحة Cloudflare (D-285). */
import { describe, expect, it } from 'vitest'
import { FREE_NEURONS_PER_DAY, NEURON_USD, freeImagesLeft, imageNeurons, splitCharge } from './imagePricing'

describe('Neurons الصورة', () => {
  it('schnell برقعه وخطواته، وklein 9B بميغابكسلاته، والمجهولُ null', () => {
    expect(imageNeurons('@cf/black-forest-labs/flux-1-schnell', 1024, 1024)).toBeCloseTo(57.6, 5)
    expect(imageNeurons('@cf/black-forest-labs/flux-2-klein-9b', 1344, 704)).toBeCloseTo(1363.64, 2)
    expect(imageNeurons('@cf/black-forest-labs/flux-2-klein-9b', 2048, 2048)).toBeCloseTo(1363.64 + 3 * 181.82, 2)
    expect(imageNeurons('@cf/black-forest-labs/flux-2-klein-4b', 1024, 1024)).toBeCloseTo(4 * 26.05, 5)
    expect(imageNeurons('@cf/unknown/model', 1024, 1024)).toBeNull()
  })
  it('klein 9B: سبعُ صورٍ مجّانيّة في اليوم، و$0.015 للصورة بعدها', () => {
    const n = imageNeurons('@cf/black-forest-labs/flux-2-klein-9b', 1024, 1024)!
    expect(freeImagesLeft(n, 0)).toBe(7)
    expect(n * NEURON_USD).toBeCloseTo(0.015, 4)
  })
})

describe('قسمةُ الحصّة', () => {
  it('ما بقي مجّانيّ، والزائدُ بسعره، وما بعد النفاد كلُّه مدفوع', () => {
    expect(splitCharge(100, 0)).toEqual({ neurons: 100, free: 100, usd: 0 })
    const part = splitCharge(1000, FREE_NEURONS_PER_DAY - 400)
    expect(part.free).toBe(400)
    expect(part.usd).toBeCloseTo(600 * NEURON_USD, 10)
    expect(splitCharge(50, FREE_NEURONS_PER_DAY + 5).free).toBe(0)
  })
})

/** قياسُ سعر klein 9B: الدفترُ بالجدول وباللوحة (D-398). */
import { describe, expect, it } from 'vitest'
import { fakeDb } from '../../test/fakes'
import { recordCost } from '../cost'
import { FINAL_IMAGE_MODEL, NEURON_USD, imageNeurons, splitCharge } from '../ai/imagePricing'
import { compareKlein, kleinLedgerRows, parseCheckQuery } from './priceCheck'

const PER_IMAGE = imageNeurons(FINAL_IMAGE_MODEL, 1344, 704)!
const row = (platform: string, units = PER_IMAGE) => ({ operation: `image:${platform}:${FINAL_IMAGE_MODEL}`, units, total: units * NEURON_USD })

describe('compareKlein', () => {
  it('بلا عددٍ من اللوحة يبقى غيرَ متحقَّق ويُقال', () => {
    const c = compareKlein('2026-11-25', [row('linkedin')], null)
    expect(c.status).toBe('unmeasured')
    expect(c.gap).toBeNull()
    expect(c.table_neurons).toBeCloseTo(PER_IMAGE, 5)
    expect(c.rows_off_table).toBe(0)
  })
  it('فرقٌ دون 10٪ مقيس، وفوقه يُعلَّم', () => {
    const rows = [row('linkedin'), row('x')]
    const sum = 2 * PER_IMAGE
    expect(compareKlein('d', rows, sum * 1.05).status).toBe('measured')
    const off = compareKlein('d', rows, sum * 1.2)
    expect(off.status).toBe('gap')
    expect(off.gap).toBeCloseTo(1 / 1.2 - 1, 5)
  })
  it('صفٌّ يخالف الصيغة أو بلا مقاس يُعدّ خارج الجدول، ولا صورةَ يُقال', () => {
    expect(compareKlein('d', [row('linkedin', 1), row('fax')], null).rows_off_table).toBe(2)
    expect(compareKlein('d', [], 100).status).toBe('no_images')
  })
  it('القراءةُ: يومٌ صحيحٌ أو اليوم، وعددٌ سالبٌ أو نصٌّ لا شيء', () => {
    expect(parseCheckQuery('2026-11-01', '1400', 't')).toEqual({ day: '2026-11-01', dashboard: 1400 })
    expect(parseCheckQuery('x', '-3', '2026-11-25')).toEqual({ day: '2026-11-25', dashboard: null })
  })
})

describe('صفُّ الدفتر', () => {
  it('صفُّ klein كما يكتبه job يُقرأ ويطابق الجدول', async () => {
    const db = fakeDb()
    const charge = splitCharge(PER_IMAGE, 0)
    await recordCost(db, { provider: 'cloudflare', operation: `image:linkedin:${FINAL_IMAGE_MODEL}:free`, units: charge.neurons, unitCost: 0, refId: 'p1' })
    await recordCost(db, { provider: 'cloudflare', operation: 'image:linkedin:@cf/black-forest-labs/flux-1-schnell:free', units: 57.6, unitCost: 0, refId: 'p2' })
    const day = new Date().toISOString().slice(0, 10)
    const rows = await kleinLedgerRows(db, day)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.operation).not.toContain('price_unverified')
    const c = compareKlein(day, rows, PER_IMAGE)
    expect(c).toMatchObject({ images: 1, rows_off_table: 0, status: 'measured', gap: 0 })
  })
})

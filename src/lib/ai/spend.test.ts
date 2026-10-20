import { beforeEach, describe, expect, it } from 'vitest'
import { recordCost } from '../cost'
import { fakeDb, type FakeDb } from '../../test/fakes'
import { dailySpend, spendByProvider } from './spend'

let db: FakeDb
beforeEach(() => {
  db = fakeDb()
})

describe('spendByProvider', () => {
  it('دفتر فارغ يعطي كائنا فارغا لا عطلا', async () => {
    expect(await spendByProvider(db)).toEqual({})
  })

  it('يفرز بالمزوّد ويجمع الكلفة والعدد', async () => {
    await recordCost(db, { provider: 'anthropic', operation: 'analyze', units: 100, unitCost: 0.01 })
    await recordCost(db, { provider: 'anthropic', operation: 'analyze', units: 200, unitCost: 0.01 })
    await recordCost(db, { provider: 'gemini', operation: 'image', units: 1, unitCost: 0.04 })

    const spend = await spendByProvider(db)
    expect(spend['anthropic']).toEqual({ calls: 2, total: 3 })
    expect(spend['gemini']).toEqual({ calls: 1, total: 0.04 })
  })

  it('لا يخلط مزوّدا بآخر', async () => {
    await recordCost(db, { provider: 'x', operation: 'post', units: 1, unitCost: 0.015 })
    const spend = await spendByProvider(db)
    expect(spend['anthropic']).toBeUndefined()
    expect(spend['x']?.calls).toBe(1)
  })

  it('يستبعد ما خرج من النافذة الزمنية', async () => {
    await recordCost(db, { provider: 'anthropic', operation: 'analyze', units: 1, unitCost: 1 })
    db.raw.prepare("UPDATE cost_ledger SET at = datetime('now','-40 days')").run()

    expect(await spendByProvider(db, 30)).toEqual({})
    // ونافذةٌ أوسع تراه — دليلُ أنّ الاستبعاد بالزمن لا بالحذف
    expect((await spendByProvider(db, 60))['anthropic']?.calls).toBe(1)
  })
})

describe('dailySpend — سلسلة للرسم', () => {
  it('يملأ الأيّام الخالية بصفر — لا فجوة ترسم خطّا يكذب', async () => {
    const series = await dailySpend(db, 14)
    expect(series).toHaveLength(14)
    expect(series.every((d) => d.total === 0)).toBe(true)
  })

  it('مرتّبة تصاعديا: الأقدم أوّلا والأحدث آخرا', async () => {
    const series = await dailySpend(db, 7)
    const days = series.map((d) => d.day)
    expect([...days].sort()).toEqual(days)
  })

  it('يضع إنفاق اليوم في آخر نقطة', async () => {
    await recordCost(db, { provider: 'anthropic', operation: 'analyze', units: 1, unitCost: 0.5 })
    const series = await dailySpend(db, 7)
    expect(series[series.length - 1]!.total).toBeCloseTo(0.5, 10)
    expect(series[series.length - 1]!.calls).toBe(1)
  })

  it('يجمع كلّ المزوّدين — الرسم للإنفاق كلّه', async () => {
    await recordCost(db, { provider: 'anthropic', operation: 'analyze', units: 1, unitCost: 0.2 })
    await recordCost(db, { provider: 'x', operation: 'post', units: 1, unitCost: 0.015 })
    const series = await dailySpend(db, 7)
    expect(series[series.length - 1]!.total).toBeCloseTo(0.215, 10)
  })

  it('دفتر لا يُقرأ يعطي سلسلة أصفار لا عطلا', async () => {
    db.raw.exec('DROP TABLE cost_ledger')
    const series = await dailySpend(db, 5)
    expect(series).toHaveLength(5)
    expect(series.every((d) => d.total === 0)).toBe(true)
  })
})

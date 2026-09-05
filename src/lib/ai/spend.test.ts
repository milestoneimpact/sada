import { beforeEach, describe, expect, it } from 'vitest'
import { recordCost } from '../cost'
import { fakeDb, type FakeDb } from '../../test/fakes'
import { spendByProvider } from './spend'

let db: FakeDb
beforeEach(() => {
  db = fakeDb()
})

describe('spendByProvider', () => {
  it('دفترٌ فارغ يعطي كائنا فارغا لا عطلا', async () => {
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

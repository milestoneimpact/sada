import { beforeEach, describe, expect, it } from 'vitest'
import { fakeDb, type FakeDb } from '../test/fakes'
import { blockerReason, checkAllowance, usageToday } from './limits'
import { writeSetting } from './settings'

let db: FakeDb
beforeEach(() => {
  db = fakeDb()
})

/** يزرع نداء تحليلٍ في الدفتر كما تكتبه الطبقة الحقيقيّة. */
function spend(total: number, when = "datetime('now')"): void {
  db.raw
    .prepare(
      `INSERT INTO cost_ledger (id, provider, operation, units, unit_cost, total, at)
       VALUES (?, 'anthropic', 'analyze:claude-opus-5', 1000, ?, ?, ${when})`,
    )
    .run(crypto.randomUUID(), total / 1000, total)
}

describe('استهلاك اليوم يُقرأ من الدفتر لا من عدّادٍ موازٍ', () => {
  it('دفترٌ فارغ صفر', async () => {
    expect(await usageToday(db)).toEqual({ analyses: 0, spend: 0 })
  })

  it('يجمع نداءات اليوم وكلفتها', async () => {
    spend(0.1)
    spend(0.2)
    const usage = await usageToday(db)
    expect(usage.analyses).toBe(2)
    expect(usage.spend).toBeCloseTo(0.3, 10)
  })

  it('لا يحسب إنفاق الأمس', async () => {
    spend(9, "datetime('now','-1 day')")
    expect(await usageToday(db)).toEqual({ analyses: 0, spend: 0 })
  })

  it('لا يخلط النشر بالتحليل — سقف التحليل لا يستهلكه منشور', async () => {
    db.raw
      .prepare(
        `INSERT INTO cost_ledger (id, provider, operation, units, unit_cost, total)
         VALUES (?, 'x', 'post', 1, 0.015, 0.015)`,
      )
      .run(crypto.randomUUID())
    expect((await usageToday(db)).analyses).toBe(0)
  })

  it('دفترٌ لا يُقرأ يُفترض مستهلَكا — الخطأ يميل إلى المنع لا إلى الإنفاق', async () => {
    db.raw.exec('DROP TABLE cost_ledger')
    const usage = await usageToday(db)
    expect(usage.analyses).toBe(Number.POSITIVE_INFINITY)
    const allowance = await checkAllowance(db)
    expect(allowance.allowed).toBe(false)
  })
})

describe('checkAllowance', () => {
  it('يسمح حين لا إيقاف ولا سقف مبلوغ', async () => {
    const allowance = await checkAllowance(db)
    expect(allowance.allowed).toBe(true)
    expect(allowance.blocker).toBeNull()
  })

  it('الإيقاف يمنع — وهو أوّل ما يُفحَص', async () => {
    await writeSetting(db, 'paused', 'true', 'panel')
    const allowance = await checkAllowance(db)
    expect(allowance.allowed).toBe(false)
    expect(allowance.blocker?.kind).toBe('paused')
  })

  it('الإيقاف يغلب حتّى لو لم يُبلغ سقف — قرارُ المالك لا يُنقَض بحساب', async () => {
    await writeSetting(db, 'paused', 'true', 'panel')
    await writeSetting(db, 'daily_analysis_cap', '500', 'panel')
    expect((await checkAllowance(db)).blocker?.kind).toBe('paused')
  })

  it('سقف العدد يمنع عند بلوغه لا بعد تجاوزه', async () => {
    await writeSetting(db, 'daily_analysis_cap', '2', 'panel')
    spend(0.001)
    expect((await checkAllowance(db)).allowed).toBe(true)
    spend(0.001)
    const allowance = await checkAllowance(db)
    expect(allowance.allowed).toBe(false)
    expect(allowance.blocker?.kind).toBe('analysis_cap')
  })

  it('سقف المال يمنع ولو لم يُبلغ سقف العدد — المستند الضخم', async () => {
    await writeSetting(db, 'daily_analysis_cap', '100', 'panel')
    await writeSetting(db, 'daily_spend_cap_usd', '1', 'panel')
    spend(1.5)
    const allowance = await checkAllowance(db)
    expect(allowance.allowed).toBe(false)
    expect(allowance.blocker?.kind).toBe('spend_cap')
  })

  it('سقف صفر يمنع كلّ شيء — طريقٌ ثانٍ للإيقاف', async () => {
    await writeSetting(db, 'daily_analysis_cap', '0', 'panel')
    expect((await checkAllowance(db)).allowed).toBe(false)
  })

  it('يعيد الإعدادات والاستهلاك معا — فتعرضهما اللوحة بلا استعلامٍ ثانٍ', async () => {
    spend(0.4)
    const allowance = await checkAllowance(db)
    expect(allowance.settings.dailyAnalysisCap).toBe(10)
    expect(allowance.usage.analyses).toBe(1)
    expect(allowance.usage.spend).toBeCloseTo(0.4, 10)
  })
})

describe('السبب يُقرأ لا يُفكّ', () => {
  it.each([
    [{ kind: 'paused' } as const, 'موقوف'],
    [{ kind: 'analysis_cap', used: 10, cap: 10 } as const, 'سقف التحليل'],
    [{ kind: 'spend_cap', used: 5.1, cap: 5 } as const, 'سقف الإنفاق'],
  ])('%o', (blocker, expected) => {
    expect(blockerReason(blocker)).toContain(expected)
  })

  it('يذكر الرقمين ليُعرف كم بقي', () => {
    expect(blockerReason({ kind: 'analysis_cap', used: 7, cap: 10 })).toContain('7')
    expect(blockerReason({ kind: 'analysis_cap', used: 7, cap: 10 })).toContain('10')
  })
})

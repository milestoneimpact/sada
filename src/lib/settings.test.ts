import { beforeEach, describe, expect, it } from 'vitest'
import { fakeDb, type FakeDb } from '../test/fakes'
import { DEFAULTS, LIMITS, readSettings, writeSetting } from './settings'

let db: FakeDb
beforeEach(() => {
  db = fakeDb()
})

describe('القيم الأولى من الترحيل', () => {
  it('النظام يعمل ولا يكون موقوفا افتراضا', async () => {
    const settings = await readSettings(db)
    expect(settings.paused).toBe(false)
    expect(settings.dailyAnalysisCap).toBe(10)
    expect(settings.dailySpendCapUsd).toBe(5)
  })
})

describe('الكتابة', () => {
  it('يرفع مفتاح الإيقاف ويخفضه', async () => {
    await writeSetting(db, 'paused', 'true', 'panel')
    expect((await readSettings(db)).paused).toBe(true)
    await writeSetting(db, 'paused', 'false', 'panel')
    expect((await readSettings(db)).paused).toBe(false)
  })

  it('أيّ قيمة غير "true" تعني تشغيلا — لا تفسير فضفاض لمفتاح خطر', async () => {
    for (const raw of ['نعم', '1', 'TRUE', 'yes', '']) {
      await writeSetting(db, 'paused', raw, 'panel')
      expect((await readSettings(db)).paused).toBe(false)
    }
  })

  it('يسجّل مَن غيّر ومتى — أثرٌ قابل للتدقيق', async () => {
    await writeSetting(db, 'daily_analysis_cap', '25', 'panel')
    const row = db.raw
      .prepare("SELECT updated_by, updated_at FROM settings WHERE key = 'daily_analysis_cap'")
      .get() as { updated_by: string; updated_at: string }
    expect(row.updated_by).toBe('panel')
    expect(row.updated_at.length).toBeGreaterThan(10)
  })
})

describe('الحدود تحرس من خطأ الإصبع', () => {
  it('يقصّ ما تجاوز الحدّ الأعلى ويخبر أنّه قصّ', async () => {
    const result = await writeSetting(db, 'daily_analysis_cap', '999999', 'panel')
    expect(result.clamped).toBe(true)
    expect(result.stored).toBe(String(LIMITS.dailyAnalysisCap.max))
    expect((await readSettings(db)).dailyAnalysisCap).toBe(LIMITS.dailyAnalysisCap.max)
  })

  it('يقصّ السالب إلى صفر', async () => {
    await writeSetting(db, 'daily_spend_cap_usd', '-100', 'panel')
    expect((await readSettings(db)).dailySpendCapUsd).toBe(0)
  })

  it('ما ليس رقما يعود إلى الافتراض لا إلى صفر ولا إلى لانهاية', async () => {
    await writeSetting(db, 'daily_spend_cap_usd', 'كثير', 'panel')
    expect((await readSettings(db)).dailySpendCapUsd).toBe(DEFAULTS.dailySpendCapUsd)
  })

  it('القيمة السليمة تمرّ بلا قصّ', async () => {
    const result = await writeSetting(db, 'daily_spend_cap_usd', '2.5', 'panel')
    expect(result.clamped).toBe(false)
    expect((await readSettings(db)).dailySpendCapUsd).toBe(2.5)
  })
})

describe('حين تنقص القاعدة', () => {
  it('جدولٌ محذوف يعيد الافتراضات المحافظة لا عطلا ولا لانهاية', async () => {
    db.raw.exec('DROP TABLE settings')
    expect(await readSettings(db)).toEqual(DEFAULTS)
  })

  it('صفٌّ محذوف لا يفتح الباب — paused تعود false والسقوف إلى قيمها', async () => {
    db.raw.exec('DELETE FROM settings')
    const settings = await readSettings(db)
    expect(settings.paused).toBe(false)
    expect(settings.dailyAnalysisCap).toBe(DEFAULTS.dailyAnalysisCap)
    expect(settings.dailySpendCapUsd).toBe(DEFAULTS.dailySpendCapUsd)
  })
})

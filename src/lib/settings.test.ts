import { beforeEach, describe, expect, it } from 'vitest'
import { fakeDb, type FakeDb } from '../test/fakes'
import { DEFAULTS, LIMITS, readSettings, writeSetting, SETTING_KEYS } from './settings'

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

  it('الإدراج الآليّ مطفأ افتراضا — إنفاقٌ يبدأ بلا قرارٍ صريح ليس ميزة', async () => {
    expect((await readSettings(db)).autoEnqueue).toBe(false)
  })
})

describe('مفاتيح الخطر تُقرأ بالمطابقة لا بالتساهل', () => {
  it.each(['نعم', '1', 'TRUE', 'on', ''])('«%s» لا ترفع الإدراج الآليّ', async (raw) => {
    await writeSetting(db, 'auto_enqueue', raw, 'panel')
    expect((await readSettings(db)).autoEnqueue).toBe(false)
  })

  it('«true» وحدها ترفعه', async () => {
    await writeSetting(db, 'auto_enqueue', 'true', 'panel')
    expect((await readSettings(db)).autoEnqueue).toBe(true)
  })

  it('غيابُ الصفّ يعني مطفأ لا مرفوعا', async () => {
    db.raw.exec("DELETE FROM settings WHERE key = 'auto_enqueue'")
    expect((await readSettings(db)).autoEnqueue).toBe(false)
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

/**
 * **ومفاتيحُ الإعدادات مصدرٌ واحد** (D-110).
 *
 * كان النوعُ وحدَه، وقائمةُ السماح في المسار مجموعةَ نصوصٍ تُكتب يدا.
 * فأُضيف `alert_webhook` إلى النوع في D-109 **ونُسي في المجموعة** —
 * فالحقلُ يُعرَض ويُضغَط «احفظ» **ويردّ الخادمُ ‏٤٠٠ صامتة**.
 */
describe('مفاتيحُ الإعدادات — قائمةٌ حيّةٌ لا نوعٌ يُمحى', () => {
  it('**وكلُّ مفتاحٍ يُقرأ له قيمةٌ يُكتَب له مثلُها**', () => {
    // ‏ما يُقرأ في `readSettings` يُبنى من هذه القائمة نفسِها
    expect(new Set(SETTING_KEYS).has('alert_webhook')).toBe(true)
    expect(SETTING_KEYS.length).toBeGreaterThanOrEqual(7)
  })

  it('ولا مفتاحَ مكرَّرٌ في القائمة', () => {
    expect(new Set(SETTING_KEYS).size).toBe(SETTING_KEYS.length)
  })

  /** **والعنوانُ يُحرَس عند الحفظ** — لا عند الإرسال وحدَه (D-109). */
  it.each([
    ['http://localhost/hook'],
    ['http://169.254.169.254/x'],
    ['ليس عنوانا'],
  ])('وعنوانُ قناةٍ مرفوضٌ يُخزَّن فارغا: %s', async (raw) => {
    const db = fakeDb()
    const r = await writeSetting(db, 'alert_webhook', raw, 'panel')
    expect(r.stored).toBe('')
  })

  it('وعنوانٌ عامٌّ صحيحٌ يُحفَظ كما هو', async () => {
    const db = fakeDb()
    const r = await writeSetting(db, 'alert_webhook', 'https://hooks.example.com/t/a', 'panel')
    expect(r.stored).toContain('hooks.example.com')
  })
})

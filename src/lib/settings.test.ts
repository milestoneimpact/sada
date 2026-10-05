import { beforeEach, describe, expect, it } from 'vitest'
import { fakeDb, type FakeDb } from '../test/fakes'
import { DEFAULTS, LIMITS, readSettings, writeSetting, SETTING_KEYS, SETTING_LABEL, settingLabel } from './settings'

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

  /** ولا صفَّ له في ترحيل: غيابُه يعود إلى الافتراض المحافظ لا إلى اللانهاية (D-168). */
  it('سقفُ المقاطع مقطعان بلا صفٍّ في القاعدة', async () => {
    expect(DEFAULTS.dailyVideoCap).toBe(2)
    expect((await readSettings(db)).dailyVideoCap).toBe(2)
  })
})

describe('سقفُ المقاطع اليوميّ (D-168)', () => {
  it('عددٌ صحيحٌ مقصوصٌ على حدّيه — والإشعارُ يقرأ ما حُفظ', async () => {
    expect((await writeSetting(db, 'daily_video_cap', '3', 'panel')).stored).toBe('3')
    expect((await readSettings(db)).dailyVideoCap).toBe(3)

    const over = await writeSetting(db, 'daily_video_cap', '999', 'panel')
    expect(over).toMatchObject({ stored: String(LIMITS.dailyVideoCap.max), clamped: true })
    expect((await writeSetting(db, 'daily_video_cap', '2.9', 'panel')).stored).toBe('2')
    expect((await writeSetting(db, 'daily_video_cap', '-4', 'panel')).stored).toBe('0')
    // ‏وما لا يُفهَم يعود إلى الافتراض لا إلى اللانهاية
    expect((await writeSetting(db, 'daily_video_cap', 'كثير', 'panel')).stored).toBe('2')
  })

  it('وقيمةٌ كُتبت بيدٍ في القاعدة تُقرأ مقصوصةً كذلك', async () => {
    db.raw.exec(`INSERT INTO settings (key, value, updated_by) VALUES ('daily_video_cap', '5000.7', 'hand')`)
    expect((await readSettings(db)).dailyVideoCap).toBe(LIMITS.dailyVideoCap.max)
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

/**
 * **اسمٌ لكلّ مفتاح** (D-134): ما يُقرأ في «ما وقع اليوم» وسجلّ الأمان
 * والإشعارات اسمٌ عربيّ، لا `dashboard_tiles` بحرفها.
 */
describe('أسماءُ الإعدادات (D-134)', () => {
  it('كلُّ مفتاحٍ في SETTING_KEYS له اسمٌ عربيٌّ يخالف حرفَه', () => {
    for (const key of SETTING_KEYS) {
      expect(SETTING_LABEL[key], key).toMatch(/[\u0600-\u06FF]/)
      expect(SETTING_LABEL[key]).not.toBe(key)
    }
  })

  it('وما ليس مفتاحًا يُعاد بحرفه — القاموسُ لا يخترع', () => {
    expect(settingLabel('dashboard_tiles')).toBe('بطاقات اللوح')
    expect(settingLabel('weekly_promo_cap_usd')).toBe('سقف الترويج الأسبوعيّ')
    expect(settingLabel('daily_video_cap')).toBe('سقف المقاطع اليوميّ')
    expect(settingLabel('draft-42')).toBe('draft-42')
  })
})

/*
 * ‏**مَن يرى مقاطع YouTube وTikTok** (D-190): خاصٌّ حتّى يقلبه المالكُ بعد الإجازة. ويُقرأ كمفاتيح
 * ‏الخطر: «true» وحدها تقلبه، والغيابُ والفسادُ خاصّ — نشرٌ للعامّة لا يقع بقيمةٍ لم تُفهَم.
 */
describe('النشرُ العلنيّ بعد الإجازة (D-190)', () => {
  it('خاصٌّ بالافتراض، و«true» وحدها تقلبه، ويُعاد خاصًّا', async () => {
    expect(await readSettings(db)).toMatchObject({ youtubePublic: false, tiktokPublic: false })
    expect(DEFAULTS).toMatchObject({ youtubePublic: false, tiktokPublic: false })
    await writeSetting(db, 'youtube_public', 'yes', 'panel')
    expect((await readSettings(db)).youtubePublic).toBe(false)
    expect((await writeSetting(db, 'youtube_public', 'true', 'panel')).stored).toBe('true')
    expect(await readSettings(db)).toMatchObject({ youtubePublic: true, tiktokPublic: false })
    await writeSetting(db, 'tiktok_public', 'true', 'panel')
    await writeSetting(db, 'youtube_public', 'false', 'panel')
    expect(await readSettings(db)).toMatchObject({ youtubePublic: false, tiktokPublic: true })
    expect(settingLabel('tiktok_public')).toBe('النشر العلنيّ على TikTok')
  })
})

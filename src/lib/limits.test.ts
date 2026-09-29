import { beforeEach, describe, expect, it } from 'vitest'
import { fakeDb, type FakeDb } from '../test/fakes'
import { blockerReason, checkAllowance, usageToday, videoCapGate } from './limits'
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
    expect(await usageToday(db)).toEqual({ analyses: 0, spend: 0, clips: 0 })
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
    expect(await usageToday(db)).toEqual({ analyses: 0, spend: 0, clips: 0 })
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

  /*
   * **والمقاطعُ في القراءة نفسِها** (D-168): صفوفُ `video:` من الدفتر، بأيّ
   * مزوّدٍ وأيّ نموذج — والتحليلُ يبقى كما كان، لا يدخله مقطعٌ ولا يدخل المقطعَ.
   */
  it('يعدّ المقاطعَ من الدفتر ولا يخلطها بالتحليل — والصفرُ الموسومُ يُعَدّ', async () => {
    const clip = (provider: string, operation: string, when = "datetime('now')"): void => {
      db.raw
        .prepare(
          `INSERT INTO cost_ledger (id, provider, operation, units, unit_cost, total, at)
           VALUES (?, ?, ?, 1, 0, 0, ${when})`,
        )
        .run(crypto.randomUUID(), provider, operation)
    }
    clip('cloudflare', 'video:alibaba/hh1-i2v:price_unverified')
    clip('cloudflare', 'video:@cf/other/model-v2:price_unverified')
    clip('cloudflare', 'video:alibaba/hh1-i2v:price_unverified', "datetime('now','-1 day')")
    clip('cloudflare', 'image:flux')
    spend(0.2)
    expect(await usageToday(db)).toEqual({ analyses: 1, spend: 0.2, clips: 2 })
  })

  it('دفترٌ لا يُقرأ يُفترض مستهلَكا — الخطأ يميل إلى المنع لا إلى الإنفاق', async () => {
    db.raw.exec('DROP TABLE cost_ledger')
    const usage = await usageToday(db)
    expect(usage.analyses).toBe(Number.POSITIVE_INFINITY)
    expect(usage.clips).toBe(Number.POSITIVE_INFINITY)
    expect(videoCapGate(usage.clips, 20).blocker).not.toBeNull()
    const allowance = await checkAllowance(db, 'analyze')
    expect(allowance.allowed).toBe(false)
  })
})

describe('checkAllowance', () => {
  it('يسمح حين لا إيقاف ولا سقف مبلوغ', async () => {
    const allowance = await checkAllowance(db, 'analyze')
    expect(allowance.allowed).toBe(true)
    expect(allowance.blocker).toBeNull()
  })

  it('الإيقاف يمنع — وهو أوّل ما يُفحَص', async () => {
    await writeSetting(db, 'paused', 'true', 'panel')
    const allowance = await checkAllowance(db, 'analyze')
    expect(allowance.allowed).toBe(false)
    expect(allowance.blocker?.kind).toBe('paused')
  })

  it('الإيقاف يغلب حتّى لو لم يُبلغ سقف — قرارُ المالك لا يُنقَض بحساب', async () => {
    await writeSetting(db, 'paused', 'true', 'panel')
    await writeSetting(db, 'daily_analysis_cap', '500', 'panel')
    expect((await checkAllowance(db, 'analyze')).blocker?.kind).toBe('paused')
  })

  it('سقف العدد يمنع عند بلوغه لا بعد تجاوزه', async () => {
    await writeSetting(db, 'daily_analysis_cap', '2', 'panel')
    spend(0.001)
    expect((await checkAllowance(db, 'analyze')).allowed).toBe(true)
    spend(0.001)
    const allowance = await checkAllowance(db, 'analyze')
    expect(allowance.allowed).toBe(false)
    expect(allowance.blocker?.kind).toBe('analysis_cap')
  })

  it('سقف المال يمنع ولو لم يُبلغ سقف العدد — المستند الضخم', async () => {
    await writeSetting(db, 'daily_analysis_cap', '100', 'panel')
    await writeSetting(db, 'daily_spend_cap_usd', '1', 'panel')
    spend(1.5)
    const allowance = await checkAllowance(db, 'analyze')
    expect(allowance.allowed).toBe(false)
    expect(allowance.blocker?.kind).toBe('spend_cap')
  })

  it('سقفُ التحليل صفرًا يمنع التحليلَ وحدَه (D-169)', async () => {
    await writeSetting(db, 'daily_analysis_cap', '0', 'panel')
    expect((await checkAllowance(db, 'analyze')).allowed).toBe(false)
    expect((await checkAllowance(db, 'draft')).allowed).toBe(true)
  })

  it('يعيد الإعدادات والاستهلاك معا — فتعرضهما اللوحة بلا استعلامٍ ثانٍ', async () => {
    spend(0.4)
    const allowance = await checkAllowance(db, 'analyze')
    expect(allowance.settings.dailyAnalysisCap).toBe(10)
    expect(allowance.usage.analyses).toBe(1)
    expect(allowance.usage.spend).toBeCloseTo(0.4, 10)
  })
})

/**
 * **سقفُ المقاطع نقيٌّ** (D-168): تناديه `animateForPost` قبل الحجز، ونقطةُ
 * «المقاطع» تحت الزرّ — فلا يقول أحدُهما «بقي» والآخرُ يردّ.
 */
describe('videoCapGate', () => {
  it('يمنع عند البلوغ لا بعد التجاوز — ويحمل رقميه', () => {
    expect(videoCapGate(1, 2)).toEqual({ used: 1, cap: 2, blocker: null })
    expect(videoCapGate(2, 2).blocker).toEqual({ kind: 'video_cap', used: 2, cap: 2 })
    expect(videoCapGate(5, 2).blocker?.kind).toBe('video_cap')
  })

  it('وصفرٌ يمنع كلَّ مقطع — طريقٌ لإغلاق التحريك وحده', () => {
    expect(videoCapGate(0, 0).blocker).not.toBeNull()
  })

  it('ولا يحجبه checkAllowance: سقفُ المقاطع لا يوقف التحليلَ ولا الصورة', async () => {
    await writeSetting(db, 'daily_video_cap', '0', 'panel')
    const allowance = await checkAllowance(db, 'analyze')
    expect(allowance.allowed).toBe(true)
    expect(allowance.settings.dailyVideoCap).toBe(0)
    expect(videoCapGate(allowance.usage.clips, allowance.settings.dailyVideoCap).blocker).not.toBeNull()
  })
})

describe('السبب يُقرأ لا يُفكّ', () => {
  it.each([
    [{ kind: 'paused' } as const, 'موقوف'],
    [{ kind: 'analysis_cap', used: 10, cap: 10 } as const, 'سقف التحليل'],
    [{ kind: 'spend_cap', used: 5.1, cap: 5 } as const, 'سقف الإنفاق'],
    [{ kind: 'video_cap', used: 2, cap: 2 } as const, 'سقف المقاطع اليوميّ: 2 من 2'],
    [{ kind: 'video_cap', used: 0, cap: 0 } as const, 'صفر بقرار المالك'],
  ])('%o', (blocker, expected) => {
    expect(blockerReason(blocker)).toContain(expected)
  })

  it('يذكر الرقمين ليُعرف كم بقي', () => {
    expect(blockerReason({ kind: 'analysis_cap', used: 7, cap: 10 })).toContain('7')
    expect(blockerReason({ kind: 'analysis_cap', used: 7, cap: 10 })).toContain('10')
  })
})

/**
 * **الحارسُ يسأل عمّا يحرسه** (D-169): كان سقفُ عدد التحليلات يوقف نشرَ ما
 * اعتمده المالك ومسحَ Drive المجّانيّ ويحجب الصورة، وكان سقفُ المال يرى
 * تحليلَ Anthropic وحدَه.
 */
describe('الحارسُ يسأل عمّا يحرسه (D-169)', () => {
  const row = (provider: string, operation: string, total: number): void => {
    db.raw
      .prepare(
        `INSERT INTO cost_ledger (id, provider, operation, units, unit_cost, total)
         VALUES (?, ?, ?, 1, ?, ?)`,
      )
      .run(crypto.randomUUID(), provider, operation, total, total)
  }

  it('سقفُ الإنفاق يعدّ كلَّ ما أُنفق اليوم — الكتابةُ والخطّةُ والصورةُ والنشرُ لا التحليلُ وحدَه', async () => {
    row('anthropic', 'draft:linkedin:claude-opus-5', 0.4)
    row('deepseek', 'plan:deepseek-v4-pro', 0.3)
    row('gemini', 'image:x:gemini-image', 0.2)
    row('x', 'post', 0.15)
    expect((await usageToday(db)).spend).toBeCloseTo(1.05, 10)
    await writeSetting(db, 'daily_spend_cap_usd', '1', 'panel')
    for (const duty of ['analyze', 'draft', 'plan', 'image', 'video'] as const) {
      expect((await checkAllowance(db, duty)).blocker?.kind, duty).toBe('spend_cap')
    }
  })

  it('بلوغُ سقف التحليل لا يوقف النشرَ ولا المسحَ ولا الكتابةَ ولا الصورة', async () => {
    await writeSetting(db, 'daily_analysis_cap', '1', 'panel')
    spend(0.01)
    expect((await checkAllowance(db, 'analyze')).blocker?.kind).toBe('analysis_cap')
    for (const duty of ['publish', 'scan', 'draft', 'plan', 'image', 'video'] as const) {
      expect((await checkAllowance(db, duty)).allowed, duty).toBe(true)
    }
  })

  it('وسقفُ المال لا يوقف نشرَ ما اعتمده المالك ولا المسحَ المجّانيّ', async () => {
    await writeSetting(db, 'daily_spend_cap_usd', '0.5', 'panel')
    row('anthropic', 'draft:x:claude-opus-5', 0.9)
    expect((await checkAllowance(db, 'publish')).allowed).toBe(true)
    expect((await checkAllowance(db, 'scan')).allowed).toBe(true)
  })

  it('والإيقافُ يوقف كلَّ شيء', async () => {
    await writeSetting(db, 'paused', 'true', 'panel')
    for (const duty of ['analyze', 'draft', 'plan', 'image', 'video', 'publish', 'scan'] as const) {
      expect((await checkAllowance(db, duty)).blocker?.kind, duty).toBe('paused')
    }
  })

  it('والسببُ بالمعادلة الواحدة لا بأربعة أرقامٍ عشريّة', () => {
    expect(blockerReason({ kind: 'spend_cap', used: 1.2345, cap: 1 })).not.toContain('1.2345')
  })
})

import { beforeEach, describe, expect, it } from 'vitest'
import { claimGeneration, releaseClaim, STALE_MINUTES } from './claim'
import { fakeDb, type FakeDb } from '../../test/fakes'

let db: FakeDb
const NOW = new Date('2026-09-08T09:00:00.000Z')

function later(minutes: number): Date {
  return new Date(NOW.getTime() + minutes * 60_000)
}

async function seedPost(id = 'p1'): Promise<void> {
  db.raw
    .prepare(
      `INSERT INTO posts (id, platform, type, text, source_refs, status, idempotency_key)
       VALUES (?, 'x', 'text', 'نصّ', '[]', 'draft', ?)`,
    )
    .run(id, `draft:s:x:${id}`)
}

beforeEach(async () => {
  db = fakeDb()
  await seedPost()
})

describe('الحجز يسبق الإنفاق (D-068)', () => {
  it('الأوّل يحجز والثاني يُردّ «جار»', async () => {
    expect(await claimGeneration(db, 'org_owner', 'k1', 'p1', 'video', NOW)).toEqual({ kind: 'claimed' })

    const second = await claimGeneration(db, 'org_owner', 'k1', 'p1', 'video', later(1))
    expect(second.kind).toBe('busy')
  })

  it('ومفتاحان مختلفان لا يتزاحمان', async () => {
    expect(await claimGeneration(db, 'org_owner', 'k1', 'p1', 'image', NOW)).toEqual({ kind: 'claimed' })
    expect(await claimGeneration(db, 'org_owner', 'k2', 'p1', 'image', NOW)).toEqual({ kind: 'claimed' })
  })

  /**
   * **وحجزٌ لا يُحرَّر يشيخ ولا يُخلَّد.** Worker يُقتل وشبكةٌ تنقطع،
   * فحجزٌ أبديٌّ يُقفل بابَ التوليد على منشورٍ إلى الأبد.
   */
  it('وحجز شائخ يُؤخَذ لا يُنتظَر', async () => {
    await claimGeneration(db, 'org_owner', 'k1', 'p1', 'video', NOW)

    // قبل النافذة: لا يزال لصاحبه
    expect((await claimGeneration(db, 'org_owner', 'k1', 'p1', 'video', later(STALE_MINUTES.video - 1))).kind)
      .toBe('busy')

    // بعدها: يُؤخَذ
    expect((await claimGeneration(db, 'org_owner', 'k1', 'p1', 'video', later(STALE_MINUTES.video + 1))).kind)
      .toBe('claimed')
  })

  /** والنافذةُ بقدر النداء: الصورةُ ثوانٍ والمقطعُ دقائق. */
  it('ونافذة الصورة أضيق من نافذة المقطع', () => {
    expect(STALE_MINUTES.image).toBeLessThan(STALE_MINUTES.video)
  })

  /**
   * **والأخذُ مشروطٌ بما قُرئ.** اثنان يقرآن الشيخوخةَ معا: يأخذه
   * **واحدٌ** لا كلاهما — وإلّا عاد السباقُ من حيث طُرد.
   */
  it('واثنان على حجز شائخ يفوز أحدُهما وحدَه', async () => {
    await claimGeneration(db, 'org_owner', 'k1', 'p1', 'video', NOW)
    const at = later(STALE_MINUTES.video + 1)

    const outcomes = await Promise.all([
      claimGeneration(db, 'org_owner', 'k1', 'p1', 'video', at),
      claimGeneration(db, 'org_owner', 'k1', 'p1', 'video', at),
    ])
    expect(outcomes.filter((o) => o.kind === 'claimed')).toHaveLength(1)
  })

  it('والتحرير يفتح الباب فورا', async () => {
    await claimGeneration(db, 'org_owner', 'k1', 'p1', 'image', NOW)
    await releaseClaim(db, 'org_owner', 'k1')
    expect(await claimGeneration(db, 'org_owner', 'k1', 'p1', 'image', later(1))).toEqual({ kind: 'claimed' })
  })

  /**
   * **ونظامٌ قبل الترحيل يعمل** — بحارسه القديم. ومدخلٌ يرمي على جدولٍ
   * ناقصٍ يوقف التوليدَ كلَّه لأجل حراسةٍ إضافيّة.
   */
  it('وجدول لم يُرحَّل يحجز ولا يقف', async () => {
    db.raw.exec('DROP TABLE media_claims')
    expect(await claimGeneration(db, 'org_owner', 'k1', 'p1', 'video', NOW)).toEqual({ kind: 'claimed' })
    await expect(releaseClaim(db, 'org_owner', 'k1')).resolves.toBeUndefined()
  })
})

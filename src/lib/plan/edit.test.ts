import { describe, expect, it } from 'vitest'
import { fakeDb } from '../../test/fakes'
import { addPlanItem, dayWithin, editPlanItem, removePlanItem } from './edit'

function seed(span: 'week' | 'month' = 'week') {
  const db = fakeDb()
  const items = [{ sourceId: 's', platform: 'linkedin', angle: 'زاوية', day: '2026-10-25', time: '07:00', why: 'ل' }]
  db.raw.prepare(`INSERT INTO plans (id, week_start, plan_json, model, status, span) VALUES ('p', '2026-10-25', ?, 'm', 'draft', ?)`)
    .run(JSON.stringify({ rationale: 'ر', items }), span)
  const item = () => (JSON.parse((db.raw.prepare("SELECT plan_json FROM plans WHERE id = 'p'").get() as { plan_json: string }).plan_json) as { items: Record<string, string>[] }).items[0]!
  return { db, item }
}

describe('تعديلُ بند الخطّة (D-259)', () => {
  it('اليومُ داخلَ المدى وحده: الأسبوعُ سبعة، والشهرُ ثمانيةٌ وعشرون', () => {
    expect(dayWithin('2026-10-31', '2026-10-25', 'week')).toBe(true)
    expect(dayWithin('2026-11-01', '2026-10-25', 'week')).toBe(false)
    expect(dayWithin('2026-11-21', '2026-10-25', 'month')).toBe(true)
    expect(dayWithin('2026-10-24', '2026-10-25', 'month')).toBe(false)
  })

  it('ينقل اليومَ ويبدّل المنصّةَ والساعة، ويردّ ما لا يصحّ', async () => {
    const { db, item } = seed()
    expect(await editPlanItem(db, 'org_owner', 'p', 0, { day: '2026-10-28', platform: 'x', time: '18:30' })).toEqual({ ok: true })
    expect(item()).toMatchObject({ day: '2026-10-28', platform: 'x', time: '18:30' })
    expect(await editPlanItem(db, 'org_owner', 'p', 0, { day: '2026-11-05' })).toMatchObject({ ok: false })
    // ‏وكلُّ قناةٍ ينشر لها صدى تُخطَّط (D-282)، وما ليس منها يُردّ
    expect(await editPlanItem(db, 'org_owner', 'p', 0, { platform: 'tiktok' })).toEqual({ ok: true })
    expect(item()).toMatchObject({ platform: 'tiktok', kind: 'video' })
    expect(await editPlanItem(db, 'org_owner', 'p', 0, { platform: 'threads' })).toMatchObject({ ok: false })
    expect(await editPlanItem(db, 'org_owner', 'p', 0, { time: '25:00' })).toMatchObject({ ok: false })
    expect(await editPlanItem(db, 'org_owner', 'p', 5, { day: '2026-10-26' })).toMatchObject({ ok: false })
    // ‏وخطّةُ عميلٍ آخر لا تُمسّ
    expect(await editPlanItem(db, 'org_b', 'p', 0, { day: '2026-10-26' })).toMatchObject({ ok: false })
    expect(item().day).toBe('2026-10-28')
  })
})

describe('محتوى البند وحذفُه (D-260)', () => {
  it('«من الأصول» يحفظ المرجع، و«ولّد» يمحوه، ومصدرُ Drive يصير موضوعَ البند', async () => {
    const { db, item } = seed()
    db.raw.exec(`INSERT INTO library_files (id, org_id, r2_key, name, mime, bytes) VALUES ('f1', 'org_owner', 'k', 'ش.png', 'image/png', 5),
      ('f2', 'org_b', 'k2', 'غ.png', 'image/png', 5)`)
    db.raw.exec(`INSERT INTO sources (id, drive_file_id, name, mime, content_hash) VALUES ('src:d1', 'd1aaaaaaaa', 'ملف', 'text/plain', 'h')`)
    expect(await editPlanItem(db, 'org_owner', 'p', 0, { asset: 'f:f1' })).toEqual({ ok: true })
    expect(item()['asset']).toBe('f:f1')
    expect(await editPlanItem(db, 'org_owner', 'p', 0, { asset: 'f:f2' })).toMatchObject({ ok: false })
    expect(await editPlanItem(db, 'org_owner', 'p', 0, { asset: '' })).toEqual({ ok: true })
    expect(item()['asset']).toBeUndefined()
    expect(await editPlanItem(db, 'org_owner', 'p', 0, { asset: 's:src:d1' })).toEqual({ ok: true })
    expect(item()).toMatchObject({ sourceId: 'src:d1' })
  })

  it('يُحذف البندُ من خطّة العميل وحدَها', async () => {
    const { db } = seed()
    expect(await removePlanItem(db, 'org_b', 'p', 0)).toMatchObject({ ok: false })
    expect(await removePlanItem(db, 'org_owner', 'p', 3)).toMatchObject({ ok: false })
    expect(await removePlanItem(db, 'org_owner', 'p', 0)).toEqual({ ok: true })
    const plan = JSON.parse((db.raw.prepare("SELECT plan_json FROM plans WHERE id = 'p'").get() as { plan_json: string }).plan_json) as { items: unknown[] }
    expect(plan.items).toHaveLength(0)
  })
})

describe('إضافةُ بندٍ وتعديلُ زاويته (D-264)', () => {
  it('الزاويةُ سطرٌ لا فارغٌ ولا مقال', async () => {
    const { db, item } = seed()
    expect(await editPlanItem(db, 'org_owner', 'p', 0, { angle: '  زاوية جديدة  ' })).toEqual({ ok: true })
    expect(item()['angle']).toBe('زاوية جديدة')
    expect(await editPlanItem(db, 'org_owner', 'p', 0, { angle: '   ' })).toMatchObject({ ok: false })
    expect(await editPlanItem(db, 'org_owner', 'p', 0, { angle: 'ا'.repeat(281) })).toMatchObject({ ok: false })
  })

  it('يُلحق بندًا من مصدر العميل بحرّاسه، ولا يُلحق من مصدر غيره', async () => {
    const { db } = seed()
    db.raw.exec(`INSERT INTO sources (id, drive_file_id, name, mime, content_hash, org_id) VALUES ('s2', 'd2', 'م', 'text/plain', 'h', 'org_owner'),
      ('s3', 'd3', 'غ', 'text/plain', 'h', 'org_b')`)
    const ok = { sourceId: 's2', platform: 'x', day: '2026-10-27', time: '18:00', angle: 'زاوية مضافة' }
    expect(await addPlanItem(db, 'org_owner', 'p', ok)).toEqual({ ok: true })
    expect(await addPlanItem(db, 'org_owner', 'p', { ...ok, sourceId: 's3' })).toMatchObject({ ok: false })
    expect(await addPlanItem(db, 'org_owner', 'p', { ...ok, day: '2026-11-09' })).toMatchObject({ ok: false })
    expect(await addPlanItem(db, 'org_owner', 'p', { ...ok, angle: '' })).toMatchObject({ ok: false })
    expect(await addPlanItem(db, 'org_b', 'p', ok)).toMatchObject({ ok: false })
    const plan = JSON.parse((db.raw.prepare("SELECT plan_json FROM plans WHERE id = 'p'").get() as { plan_json: string }).plan_json) as { items: { angle: string; why: string }[] }
    expect(plan.items).toHaveLength(2)
    expect(plan.items[1]).toMatchObject({ angle: 'زاوية مضافة', why: 'أضافه المالك' })
  })
})

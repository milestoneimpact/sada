import { describe, expect, it } from 'vitest'
import { fakeDb } from '../../test/fakes'
import { dayWithin, editPlanItem } from './edit'

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
    expect(await editPlanItem(db, 'org_owner', 'p', 0, { platform: 'tiktok' })).toMatchObject({ ok: false })
    expect(await editPlanItem(db, 'org_owner', 'p', 0, { time: '25:00' })).toMatchObject({ ok: false })
    expect(await editPlanItem(db, 'org_owner', 'p', 5, { day: '2026-10-26' })).toMatchObject({ ok: false })
    // ‏وخطّةُ عميلٍ آخر لا تُمسّ
    expect(await editPlanItem(db, 'org_b', 'p', 0, { day: '2026-10-26' })).toMatchObject({ ok: false })
    expect(item().day).toBe('2026-10-28')
  })
})

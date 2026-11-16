import { describe, expect, it } from 'vitest'
import { fakeDb } from '../../test/fakes'
import { approvePlanVersion, reopenVersion, unscheduleMonth } from './approve'
import { arrangeSlots, jitterOf } from './scheduler'
import { DEFAULT_RULES } from './checks'
import { schedulePost } from '../schedule/job'

const NOW = new Date('2026-11-16T12:00:00Z')

function seed() {
  const db = fakeDb()
  db.raw.exec(`INSERT INTO accounts (id, platform, kind, external_id, display_name, status) VALUES ('ax', 'x', 'member', 'e1', 'عمر', 'active')`)
  db.raw.exec(`INSERT INTO plans (id, week_start, plan_json, model, status, period) VALUES ('pl', '2026-12', '{"items":[]}', 'package', 'draft', '2026-12')`)
  db.raw.exec(`INSERT INTO plan_items (id, org_id, plan_id, item_key, platform, due_local, copy, source_kind) VALUES
    ('i1', 'org_owner', 'pl', 'k1', 'x', '2026-12-02 09:00', 'نصّ البند الأوّل', 'github'),
    ('i2', 'org_owner', 'pl', 'k2', 'x', '2026-12-03 09:00', 'نصّ البند الثاني', 'github'),
    ('i3', 'org_owner', 'pl', 'k3', 'x', '2026-12-04 09:00', NULL, 'github')`)
  db.raw.exec(`INSERT INTO posts (id, platform, type, text, status, idempotency_key, plan_id, plan_item_id) VALUES ('d1', 'x', 'text', 'نصّ البند الأوّل', 'draft', 'k1', 'pl', 'i1')`)
  return db
}

describe('المُجدوِلُ الواحد (D-383 · المرحلة ٦)', () => {
  it('التذبذبُ ثابتٌ لكلّ معرّف وفي حدوده، بلا Math.random', () => {
    for (const id of ['a', 'b', 'post-1', 'post-2']) {
      const j = jitterOf(id, 7)
      expect(j).toBe(jitterOf(id, 7))
      expect(Math.abs(j)).toBeLessThanOrEqual(7)
    }
    expect(jitterOf('a', 0)).toBe(0)
  })

  it('التذبذبُ لا يخرج من الساعة، والموعدُ الذي كتبه المالكُ لا يُذبذَب', () => {
    const slots = Array.from({ length: 20 }, (_, n) => ({ id: 'p' + n, account: 'a' + n, at: '2026-12-02T06:00', local: '2026-12-02 09:00' }))
    const out = arrangeSlots(slots, DEFAULT_RULES, NOW)
    expect(out.placed).toHaveLength(20)
    for (const s of out.placed) { expect(s.at.slice(0, 13)).toBe('2026-12-02T06'); expect(s.local.slice(0, 13)).toBe('2026-12-02 09') }
    const exact = arrangeSlots([{ ...slots[0]!, exact: true }], DEFAULT_RULES, NOW)
    expect(exact.placed[0]!.at).toBe('2026-12-02T06:00')
  })

  it('التباعدُ على الحساب الواحد، وما مضى يُعرض ولا يُنقل، وما لم يكتبه المالكُ لا يقع في الهدوء', () => {
    const out = arrangeSlots([
      { id: 'a', account: 'x', at: '2026-12-02T06:00', local: '2026-12-02 09:00', exact: true },
      { id: 'b', account: 'x', at: '2026-12-02T06:30', local: '2026-12-02 09:30', exact: true },
      { id: 'c', account: 'y', at: '2026-12-02T06:30', local: '2026-12-02 09:30', exact: true },
      { id: 'd', account: 'x', at: '2026-11-10T06:00', local: '2026-11-10 09:00', exact: true },
      { id: 'e', account: 'z', at: '2026-12-02T21:00', local: '2026-12-03 00:00' },
    ], DEFAULT_RULES, NOW)
    const at = Object.fromEntries(out.placed.map((s) => [s.id, s.at]))
    expect(at).toEqual({ a: '2026-12-02T06:00', b: '2026-12-02T07:30', c: '2026-12-02T06:30' })
    expect(out.held).toEqual([{ id: 'd', reason: 'past' }, { id: 'e', reason: 'quiet' }])
  })
})

describe('الاعتمادُ والتراجع (D-383 · المرحلة ٦)', () => {
  it('الاعتمادُ يقفل الإصدار ويولّد المنشوراتِ بـplan_id وplan_item_id، وإعادتُه لا تكرّر', async () => {
    const db = seed()
    const out = await approvePlanVersion(db, 'org_owner', 'pl', 'owner', NOW)
    expect(out).toEqual({ ok: true, version: 1, approved: 1, created: 1 })
    expect(db.raw.prepare("SELECT id, status, plan_id, plan_item_id FROM posts ORDER BY plan_item_id").all()).toMatchObject([
      { id: 'd1', status: 'approved', plan_id: 'pl', plan_item_id: 'i1' },
      { status: 'approved', plan_id: 'pl', plan_item_id: 'i2' },
    ])
    expect(db.raw.prepare("SELECT locked_at FROM plans WHERE id = 'pl'").get()).not.toEqual({ locked_at: null })
    expect(db.raw.prepare("SELECT version, locked_by FROM plan_versions WHERE plan_id = 'pl'").all()).toEqual([{ version: 1, locked_by: 'owner' }])
    expect(await approvePlanVersion(db, 'org_owner', 'pl', 'owner', NOW)).toEqual({ ok: true, version: 1, approved: 0, created: 0 })
    expect((db.raw.prepare('SELECT COUNT(*) AS n FROM posts').get() as { n: number }).n).toBe(2)
  })

  it('بنودٌ مختارةٌ وحدَها، ولعميلٍ آخر لا شيء', async () => {
    const db = seed()
    expect(await approvePlanVersion(db, 'org_owner', 'pl', 'owner', NOW, ['i2'])).toEqual({ ok: true, version: 1, approved: 0, created: 1 })
    expect(db.raw.prepare("SELECT status FROM posts WHERE id = 'd1'").get()).toEqual({ status: 'draft' })
    expect((await approvePlanVersion(db, 'org_b', 'pl', 'owner', NOW)).ok).toBe(false)
  })

  it('«إلغاء جدولة الشهر» يعيد المجدولَ إلى approved، و«فتح الإصدار» يرفعه ويعيد المعتمَد مسوّدة', async () => {
    const db = seed()
    await approvePlanVersion(db, 'org_owner', 'pl', 'owner', NOW)
    expect((await schedulePost(db, 'd1', 'ax', '2026-12-02T06:00', NOW)).ok).toBe(true)
    expect(await reopenVersion(db, 'org_owner', 'pl')).toEqual({ ok: false, reason: 'في الخطّة منشوراتٌ مجدولة، فألغِ جدولة الشهر أوّلًا' })
    expect(await unscheduleMonth(db, 'org_owner', '2026-11')).toEqual({ pulled: 0, kept: [] })
    expect(await unscheduleMonth(db, 'org_owner', '2026-12')).toEqual({ pulled: 1, kept: [] })
    expect(db.raw.prepare("SELECT status, scheduled_at FROM posts WHERE id = 'd1'").get()).toEqual({ status: 'approved', scheduled_at: null })
    expect(await reopenVersion(db, 'org_owner', 'pl')).toEqual({ ok: true, version: 2, reverted: 2 })
    expect(db.raw.prepare("SELECT version, locked_at FROM plans WHERE id = 'pl'").get()).toEqual({ version: 2, locked_at: null })
    expect((db.raw.prepare("SELECT COUNT(*) AS n FROM posts WHERE status = 'draft'").get() as { n: number }).n).toBe(2)
  })
})

import { describe, expect, it } from 'vitest'
import { fakeDb } from '../../test/fakes'
import { planProgress, schedulePlan, slotFor } from './schedule'
import type { StoredPlan } from './job'
import { dropItem, itemKey, reviewModel } from './review'

const NOW = new Date('2026-10-24T12:00:00Z')

function seed() {
  const db = fakeDb()
  db.raw.exec(`INSERT INTO sources (id, drive_file_id, name, mime, content_hash) VALUES ('s1', 'd1', 'م', 'text/plain', 'h'), ('s2', 'd2', 'م', 'text/plain', 'h')`)
  db.raw.exec(`INSERT INTO accounts (id, platform, kind, external_id, display_name, status) VALUES ('a1', 'linkedin', 'member', 'e1', 'عمر', 'active')`)
  const items = [
    { sourceId: 's1', platform: 'linkedin', angle: 'أ', day: '2026-10-27', time: '07:30', why: 'ل' },
    { sourceId: 's2', platform: 'x', angle: 'ب', day: '2026-10-28', time: '18:00', why: 'ل' },
  ]
  db.raw.prepare(`INSERT INTO plans (id, week_start, plan_json, model, status) VALUES ('pl', '2026-10-25', ?, 'm', 'approved')`)
    .run(JSON.stringify({ rationale: 'ر', items }))
  const post = (id: string, platform: string, source: string, status: string) => db.raw.exec(
    `INSERT INTO posts (id, platform, type, text, status, idempotency_key, plan_id, source_id, approved_by, approved_at)
     VALUES ('${id}', '${platform}', 'text', 'نص', '${status}', 'k-${id}', 'pl', '${source}', 'owner', datetime('now'))`)
  post('p1', 'linkedin', 's1', 'approved')
  post('p2', 'x', 's2', 'approved')
  post('p3', 'linkedin', 's1', 'draft')
  const plan: StoredPlan = { id: 'pl', week: '2026-10-25', span: 'week', status: 'approved', plan: { rationale: 'ر', items } } as unknown as StoredPlan
  return { db, plan }
}

describe('جدولةُ الخطّة (D-261)', () => {
  it('الموعدُ يومُ البند وساعتُه، أو أرجحُ ساعةٍ مقيسة — وفي المستقبل دائمًا', () => {
    expect(slotFor('2026-10-27', '07:30', null, NOW)).toBe('2026-10-27T07:30')
    expect(slotFor('2026-10-27', '07:30', 9, NOW)).toBe('2026-10-27T09:00')
    // ‏يومٌ مضى يُرحَّل إلى أوّل يومٍ قادمٍ بالساعة نفسِها
    expect(slotFor('2026-10-20', '07:30', null, NOW)).toBe('2026-10-25T07:30')
  })

  it('يُجدوَل المعتمَدُ وحده، وما لا حسابَ له يُقال سببُه', async () => {
    const { db, plan } = seed()
    expect(await planProgress(db, 'org_owner', 'pl')).toEqual({ written: 3, ready: 2, pending: 1 })
    const done = await schedulePlan(db, 'org_owner', plan, NOW)
    expect(done.scheduled).toBe(1)
    expect(done.skipped).toEqual([{ postId: 'p2', reason: 'لا حسابَ x مربوطًا لهذا العميل' }])
    expect(db.raw.prepare("SELECT status, scheduled_at, account_id FROM posts WHERE id = 'p1'").get())
      .toMatchObject({ status: 'queued', account_id: 'a1' })
    expect(db.raw.prepare("SELECT status FROM posts WHERE id = 'p3'").get()).toEqual({ status: 'draft' })
    // ‏ولعميلٍ آخر لا شيء
    expect((await schedulePlan(db, 'org_b', plan, NOW)).scheduled).toBe(0)
  })
})

/**
 * ‏**بندُ السلسلة وبندُ التغريدة من المصدر نفسِه بندان** (مراجعة D-324): «ابدأ» يكتب لكلٍّ مسوّدتَه (مفتاحُ السلسلة بـ`:thread`)،
 * ‏لكنّ الجدولةَ والمراجعة و«احذف» و«أخّر» كانت تطابق المنشورَ ببنده بالمصدر والمنصّة وحدهما — فيُجدوَل الاثنان في موعد الأوّل،
 * ‏ويحذف «احذف» على السلسلة مسوّدةَ التغريدة.
 */
describe('السلسلةُ والتغريدةُ من مصدرٍ واحد (مراجعة D-324)', () => {
  function seedTwin() {
    const db = fakeDb()
    db.raw.exec(`INSERT INTO sources (id, drive_file_id, name, mime, content_hash) VALUES ('s1', 'd1', 'م', 'text/plain', 'h')`)
    db.raw.exec(`INSERT INTO accounts (id, platform, kind, external_id, display_name, status) VALUES ('ax', 'x', 'member', 'e1', 'عمر', 'active')`)
    const items = [
      { sourceId: 's1', platform: 'x', kind: 'text', angle: 'أ', day: '2026-10-27', time: '09:00', why: 'ل' },
      { sourceId: 's1', platform: 'x', kind: 'thread', angle: 'ب', day: '2026-10-29', time: '09:00', why: 'ل' },
    ]
    db.raw.prepare(`INSERT INTO plans (id, week_start, plan_json, model, status) VALUES ('pl', '2026-10-25', ?, 'm', 'approved')`)
      .run(JSON.stringify({ rationale: 'ر', items }))
    const post = (id: string, key: string, type: string, status = 'approved') => db.raw.exec(
      `INSERT INTO posts (id, platform, type, text, status, idempotency_key, plan_id, source_id, approved_by, approved_at)
       VALUES ('${id}', 'x', '${type}', 'نص', '${status}', '${key}', 'pl', 's1', 'owner', datetime('now'))`)
    post('p-text', 'draft:s1:x:h', 'text')
    post('p-thread', 'draft:s1:x:h:thread', 'thread')
    const plan: StoredPlan = { id: 'pl', week: '2026-10-25', span: 'week', status: 'approved', plan: { rationale: 'ر', items } } as unknown as StoredPlan
    return { db, plan, items }
  }

  it('كلٌّ في موعد بنده', async () => {
    const { db, plan } = seedTwin()
    expect((await schedulePlan(db, 'org_owner', plan, NOW)).scheduled).toBe(2)
    expect(db.raw.prepare("SELECT id, scheduled_at FROM posts ORDER BY id").all()).toEqual([
      { id: 'p-text', scheduled_at: '2026-10-27 09:00:00' },
      { id: 'p-thread', scheduled_at: '2026-10-29 09:00:00' },
    ])
  })

  it('والمراجعةُ تُري كلَّ بندٍ مسوّدتَه، و«احذف» على السلسلة يرفض مسوّدتَها هي', async () => {
    const { db, plan, items } = seedTwin()
    const model = await reviewModel(db, 'org_owner', { ...plan, choices: { autoImage: false } } as unknown as StoredPlan)
    expect(model.cards.map((c) => c.post?.id)).toEqual(['p-text', 'p-thread'])
    db.raw.exec("UPDATE posts SET status = 'draft', approved_by = NULL, approved_at = NULL")
    expect(await dropItem(db, 'org_owner', 'pl', 1, itemKey(items[1] as never), 'owner')).toEqual({ ok: true })
    expect(db.raw.prepare('SELECT id, status FROM posts ORDER BY id').all()).toEqual([
      { id: 'p-text', status: 'draft' },
      { id: 'p-thread', status: 'rejected' },
    ])
  })
})

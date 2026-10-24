import { describe, expect, it } from 'vitest'
import { fakeDb } from '../test/fakes'
import { portfolio, totals } from './portfolio'
import { runAs } from './access'

const NOW = new Date('2026-10-21T12:00:00Z')

function seed() {
  const db = fakeDb()
  db.raw.exec(`INSERT INTO orgs (id, name, kind) VALUES ('org_a', 'شركة أ', 'team'), ('org_b', 'شركة ب', 'team')`)
  db.raw.exec(`INSERT INTO accounts (id, platform, kind, external_id, display_name) VALUES ('acc', 'linkedin', 'member', 'e', 'ع')`)
  const post = (id: string, org: string, platform: string, status: string) => db.raw.exec(
    `INSERT INTO posts (id, platform, type, text, status, idempotency_key, org_id, scheduled_at, approved_by, approved_at, account_id)
     VALUES ('${id}', '${platform}', 'text', 'ن', '${status}', 'k-${id}', '${org}', ${status === 'draft' ? 'NULL' : "'2026-10-20 08:00:00'"},
       ${status === 'draft' ? 'NULL' : "'o'"}, ${status === 'draft' ? 'NULL' : "'2026-10-19 08:00:00'"}, ${status === 'draft' ? 'NULL' : "'acc'"})`)
  post('a1', 'org_a', 'linkedin', 'draft')
  post('a2', 'org_a', 'x', 'published')
  post('b1', 'org_b', 'linkedin', 'queued')
  post('b2', 'org_b', 'linkedin', 'published')
  db.raw.exec(`INSERT INTO publish_attempts (id, post_id, idempotency_key, attempt_no, request_json, status, at)
    VALUES ('t1', 'a2', 'k-a2', 1, '{}', 'succeeded', '2026-10-20 08:00:00'), ('t2', 'b2', 'k-b2', 1, '{}', 'succeeded', '2026-08-01 08:00:00')`)
  db.raw.exec(`INSERT INTO metrics (post_id, window, impressions, reactions, comments, shares) VALUES ('a2', '24h', 50, 7, 1, 0)`)
  db.raw.exec(`INSERT INTO cost_ledger (id, provider, operation, units, unit_cost, total, at, org_id) VALUES ('c', 'anthropic', 'draft', 1, 0.05, 0.05, '2026-10-10 00:00:00', 'org_b')`)
  return db
}

describe('المحفظة (D-273)', () => {
  it('صفٌّ لكلّ شركةٍ بأرقامها في الفترة، والمجموع', async () => {
    const rows = await portfolio(seed(), { period: 30, platform: null, org: null }, NOW)
    const a = rows.find((r) => r.org.id === 'org_a')!
    const b = rows.find((r) => r.org.id === 'org_b')!
    expect(a).toMatchObject({ waiting: 1, published: 1, engagement: 8, spend: 0 })
    // ‏ما خرج قبل الفترة لا يُعدّ فيها
    expect(b).toMatchObject({ queued: 1, published: 0, spend: 0.05 })
    expect(totals(rows)).toMatchObject({ waiting: 1, queued: 1, published: 1 })
  })

  it('المنصّةُ تُفلتِر، والشركةُ تُفلتِر', async () => {
    const db = seed()
    const x = await portfolio(db, { period: 30, platform: 'x', org: null }, NOW)
    expect(x.find((r) => r.org.id === 'org_a')).toMatchObject({ waiting: 0, published: 1 })
    expect(await portfolio(db, { period: 90, platform: null, org: 'org_b' }, NOW)).toHaveLength(1)
  })

  it('والمدعوُّ يرى شركاتِه وحدها', async () => {
    const db = seed()
    const rows = await runAs({ email: 's@x.com', role: 'viewer', orgs: ['org_b'] }, () => portfolio(db, { period: 30, platform: null, org: null }, NOW))
    expect(rows.map((r) => r.org.id)).toEqual(['org_b'])
  })
})

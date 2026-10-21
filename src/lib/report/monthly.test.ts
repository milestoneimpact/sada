import { describe, expect, it } from 'vitest'
import { fakeDb } from '../../test/fakes'
import { monthlyReport, monthOf, shiftMonth } from './monthly'

function seed() {
  const db = fakeDb()
  db.raw.exec(`INSERT INTO accounts (id, platform, kind, external_id, display_name) VALUES ('a-li', 'linkedin', 'member', 'e1', 'عمر'), ('a-x', 'x', 'member', 'e2', 'عمر')`)
  const pub = (id: string, platform: string, at: string, react: number | null) => {
    db.raw.exec(`INSERT INTO posts (id, account_id, platform, type, text, scheduled_at, status, idempotency_key, approved_by, approved_at)
      VALUES ('${id}', '${platform === 'x' ? 'a-x' : 'a-li'}', '${platform}', 'text', 'نصّ ${id}', '${at}', 'published', 'k-${id}', 'omar', '${at}')`)
    db.raw.exec(`INSERT INTO publish_attempts (id, post_id, idempotency_key, attempt_no, request_json, status, at)
      VALUES ('at-${id}', '${id}', 'k-${id}', 1, '{}', 'succeeded', '${at}')`)
    if (react !== null) db.raw.exec(`INSERT INTO metrics (post_id, window, impressions, reactions, comments, shares) VALUES ('${id}', '24h', 100, ${react}, 0, 0)`)
  }
  pub('a', 'linkedin', '2026-10-03 08:00:00', 40)
  pub('b', 'x', '2026-10-09 19:00:00', 5)
  pub('c', 'linkedin', '2026-10-20 08:00:00', null)
  pub('old', 'linkedin', '2026-09-28 08:00:00', 99)
  db.raw.exec(`INSERT INTO cost_ledger (id, provider, operation, units, unit_cost, total, at)
    VALUES ('c1', 'anthropic', 'draft', 1, 0.02, 0.02, '2026-10-05 10:00:00'), ('c2', 'x', 'post', 1, 0.01, 0.01, '2026-09-30 10:00:00')`)
  db.raw.exec(`INSERT INTO posts (id, account_id, platform, type, text, scheduled_at, status, idempotency_key, approved_by, approved_at)
    VALUES ('q', 'a-li', 'linkedin', 'text', 'ن', '2026-11-02 08:00:00', 'queued', 'k-q', 'omar', '2026-10-21 08:00:00')`)
  return db
}

describe('تقريرُ الشهر (D-262)', () => {
  it('الشهرُ من العنوان أو الجاري، ويُزاح', () => {
    const now = new Date('2026-10-21T00:00:00Z')
    expect(monthOf('2026-09', now)).toBe('2026-09')
    expect(monthOf('2026-13', now)).toBe('2026-10')
    expect(monthOf(undefined, now)).toBe('2026-10')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
  })

  it('ما خرج في الشهر لكلّ منصّة، والمقيسُ وحده يُرتَّب، والإنفاقُ والقادم', async () => {
    const r = await monthlyReport(seed(), 'org_owner', '2026-10', null)
    expect(r.published).toEqual({ linkedin: 2, x: 1 })
    expect(r.measured).toBe(2)
    expect(r.engagement).toBe(45)
    expect(r.top.map((f) => f.id)).toEqual(['a', 'b'])
    expect(r.spend).toBeCloseTo(0.02)
    expect(r.upcoming).toBe(1)
    // ‏أقلُّ من ثمانية مقيسة: لا موعدَ يُقال
    expect(r.slot).toBeNull()
    expect(r.why).not.toBeNull()
  })

  it('ولعميلٍ آخر لا شيء', async () => {
    const r = await monthlyReport(seed(), 'org_b', '2026-10', null)
    expect(r.published).toEqual({})
    expect(r.spend).toBe(0)
  })
})

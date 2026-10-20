/** الخطُّ الزمنيّ — **القادمُ تصاعديًّا، وما نُشر تنازليًّا بوقت وقوعه** (D-172). */
import { beforeEach, describe, expect, it } from 'vitest'
import { fakeDb, type FakeDb } from '../../test/fakes'
import { classifyQueued, history, platformCounts, postCosts, readCursor, upcoming, waiting, type TimelineRow } from './timeline'

let db: FakeDb
beforeEach(() => {
  db = fakeDb()
  db.raw.exec(`INSERT INTO accounts (id, platform, kind, external_id, display_name, status)
    VALUES ('a1', 'linkedin', 'member', 'abc', 'عمر', 'active')`)
})

function post(id: string, status: string, over: { scheduled?: string | null; dispatched?: string | null; created?: string } = {}): void {
  const queued = status === 'queued' || status === 'published' || status === 'failed'
  db.raw.prepare(
    `INSERT INTO posts (id, platform, type, text, status, idempotency_key, approved_by, approved_at,
                        account_id, scheduled_at, dispatched_at, created_at)
     VALUES (?, 'linkedin', 'text', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, `نصُّ ${id}`, status, `k-${id}`, 'omar', '2026-09-01 00:00:00', queued ? 'a1' : null,
    over.scheduled ?? (queued ? '2026-09-05 09:00:00' : null), over.dispatched ?? null, over.created ?? '2026-09-01 00:00:00')
}

function attempt(postId: string, no: number, status: string, at: string, response: string | null = null): void {
  db.raw.prepare(
    `INSERT INTO publish_attempts (id, post_id, idempotency_key, attempt_no, request_json, response_json, status, at, platform_post_id)
     VALUES (?, ?, ?, ?, '{}', ?, ?, ?, ?)`,
  ).run(`${postId}-${no}`, postId, `k-${postId}`, no, response, status, at, status === 'succeeded' ? 'urn:li:share:1' : null)
}

describe('القادم', () => {
  it('الأقربُ أوّلا', async () => {
    post('late', 'queued', { scheduled: '2026-09-09 09:00:00' })
    post('soon', 'queued', { scheduled: '2026-09-07 09:00:00' })
    post('done', 'published')
    expect((await upcoming(db, 'org_owner', 'linkedin')).map((r) => r.id)).toEqual(['soon', 'late'])
  })
})

describe('ما نُشر', () => {
  it('فشل ثمّ نجح: «نُشر» بوقت النجاح، وعددُ المحاولات معه', async () => {
    post('p1', 'published')
    attempt('p1', 1, 'failed', '2026-09-05 09:00:00', '{"error":"timeout"}')
    attempt('p1', 2, 'succeeded', '2026-09-05 09:15:00')
    const page = await history(db, 'org_owner', 'linkedin', 'all', null)
    expect(page.rows[0]!.publishedAt).toBe('2026-09-05 09:15:00')
    expect(page.rows[0]!.sortAt).toBe('2026-09-05 09:15:00')
    expect(page.rows[0]!.tries).toBe(2)
  })

  it('والفاشلُ بسببه المختصر، والمؤشّرُ يقلّب الأرشيف بلا تكرار', async () => {
    for (let i = 1; i <= 5; i += 1) {
      post(`f${i}`, 'failed')
      attempt(`f${i}`, 1, 'failed', `2026-09-0${i} 10:00:00`, '{"error":"token_expired","preflight":true}')
    }
    const first = await history(db, 'org_owner', 'linkedin', 'failed', null, 2)
    expect(first.rows.map((r) => r.id)).toEqual(['f5', 'f4'])
    expect(first.rows[0]!.failure).toBe('token_expired')
    const second = await history(db, 'org_owner', 'linkedin', 'failed', readCursor(first.next!), 2)
    expect(second.rows.map((r) => r.id)).toEqual(['f3', 'f2'])
    const third = await history(db, 'org_owner', 'linkedin', 'failed', readCursor(second.next!), 2)
    expect(third.rows.map((r) => r.id)).toEqual(['f1'])
    expect(third.next).toBeNull()
  })

  it('والمؤشّرُ الفاسدُ يُهمَل', () => {
    expect(readCursor("2026-09-01 10:00:00|f1' OR 1=1")).toBeNull()
    expect(readCursor('2026-09-01 10:00:00|f1')).toEqual({ at: '2026-09-01 10:00:00', id: 'f1' })
  })
})

describe('ما ينتظر والأعداد', () => {
  it('المسوّدةُ قبل المعتمَد، والمجدولُ ليس منه', async () => {
    post('ok', 'approved', { created: '2026-09-01 00:00:00' })
    post('d', 'draft', { created: '2026-09-03 00:00:00' })
    post('q', 'queued')
    expect((await waiting(db, 'org_owner', 'linkedin')).map((r) => r.id)).toEqual(['d', 'ok'])
    const c = await platformCounts(db, 'org_owner', 'linkedin', false)
    expect(c).toMatchObject({ waiting: 1, ready: 1, queued: 1, missingMedia: 3 })
  })

  it('والكلفةُ من الدفتر باسم المنشور', async () => {
    db.raw.prepare(`INSERT INTO cost_ledger (id, provider, operation, units, unit_cost, total, ref_id)
      VALUES ('c1', 'gemini', 'image', 1, 0.02, 0.02, 'p1'), ('c2', 'x', 'post', 1, 0.015, 0.015, 'p1')`).run()
    expect((await postCosts(db, ['p1']))['p1']).toBeCloseTo(0.035)
  })
})

describe('حالُ المجدول', () => {
  const row = (over: Partial<TimelineRow>): TimelineRow => ({
    id: 'r', text: '', status: 'queued', scheduledAt: null, createdAt: '2026-09-01 00:00:00', dispatchedAt: null,
    accountName: null, accountKind: null, sourceName: null, platformPostId: null, publishedAt: null, failedAt: null,
    failure: null, tries: 0, lastTryAt: null, openTries: 0, hasMedia: false, costUsd: 0, sortAt: '', ...over,
  })
  const now = new Date('2026-09-06T12:00:00Z')

  it('بصيغة القاعدة لا ISO', () => {
    expect(classifyQueued(row({ scheduledAt: '2026-09-06 13:00:00' }), now).kind).toBe('upcoming')
    expect(classifyQueued(row({ scheduledAt: '2026-09-06 11:40:00' }), now)).toEqual({ kind: 'late', minutes: 20 })
    expect(classifyQueued(row({ scheduledAt: '2026-09-06 10:00:00', dispatchedAt: '2026-09-06 11:30:00' }), now).kind).toBe('sending')
    expect(classifyQueued(row({ scheduledAt: '2026-09-06 10:00:00', dispatchedAt: '2026-09-06 10:30:00' }), now))
      .toEqual({ kind: 'stuck', minutes: 90 })
  })
})

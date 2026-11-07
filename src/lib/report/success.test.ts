/**
 * ‏**مقاييسُ النجاح في المنتج** (D-324 · PLAN.md §٧ · ROADMAP-3 §٧): اعتمادٌ بلا تعديل، ونشرٌ في موعده، وكلفةُ المنشور
 * ‏الكاملة — هذا الشهر، **من الجداول القائمة وحدَها**. كانت معرَّفةً في الخطّة ولا تُحسب في أيّ موضع.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { fakeDb, type FakeDb } from '../../test/fakes'
import { ON_TIME_MINUTES, successThisMonth } from './success'

let db: FakeDb
const NOW = new Date('2026-11-20T12:00:00Z')

beforeEach(() => {
  db = fakeDb()
  db.raw.exec("INSERT INTO accounts (id, platform, kind, external_id, display_name) VALUES ('a-x', 'x', 'member', 'e', 'عمر')")
})

let n = 0
function post(o: {
  status: string; model?: string | null; original?: string | null; created?: string; approved?: string | null
  scheduled?: string | null; cost?: number; org?: string
}): string {
  n += 1
  const id = `p${n}`
  db.raw.prepare(
    `INSERT INTO posts (id, account_id, platform, type, text, status, idempotency_key, model, original_text, created_at,
                        approved_by, approved_at, scheduled_at, cost_usd, org_id)
     VALUES (?, 'a-x', 'x', 'text', 'نصّ', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, o.status, `k-${id}`, o.model === undefined ? 'claude-opus-5' : o.model, o.original ?? null, o.created ?? '2026-11-10 09:00:00',
    o.approved === null ? null : 'omar', o.approved === undefined ? (o.status === 'rejected' || o.status === 'draft' ? null : '2026-11-10 10:00:00') : o.approved,
    o.scheduled ?? null, o.cost ?? 0, o.org ?? 'org_owner')
  return id
}

function attempt(postId: string, status: string, at: string, org = 'org_owner'): void {
  const no = (db.raw.prepare('SELECT coalesce(max(attempt_no), 0) + 1 AS n FROM publish_attempts WHERE post_id = ?').get(postId) as { n: number }).n
  db.raw.prepare(
    `INSERT INTO publish_attempts (id, post_id, idempotency_key, attempt_no, request_json, status, at, org_id, platform_post_id)
     VALUES (?, ?, ?, ?, '{}', ?, ?, ?, ?)`,
  ).run(crypto.randomUUID(), postId, `k-${postId}`, no, status, at, org, status === 'succeeded' ? `t-${postId}` : null)
}

function ledger(ref: string | null, total: number, at = '2026-11-10 09:00:00', org = 'org_owner'): void {
  db.raw.prepare(
    `INSERT INTO cost_ledger (id, provider, operation, units, unit_cost, total, ref_id, at, org_id)
     VALUES (?, 'x', 'create_post', 1, ?, ?, ?, ?, ?)`,
  ).run(crypto.randomUUID(), total, total, ref, at, org)
}

describe('اعتمادٌ بلا تعديل', () => {
  it('من المولَّدة التي بُتّ فيها هذا الشهر: ما اعتُمد بلا أصلٍ محفوظ — والمرفوضُ يُعدّ في المقام، ونصُّ المالك لا يُعدّ', async () => {
    post({ status: 'approved' })
    post({ status: 'published', scheduled: '2026-11-10 12:00:00' })
    post({ status: 'queued', original: 'نصّ النموذج قبل تعديلك', scheduled: '2026-12-01 09:00:00' })
    post({ status: 'rejected' })
    post({ status: 'draft' })
    post({ status: 'approved', model: 'owner' })
    post({ status: 'approved', created: '2026-10-28 09:00:00' })
    post({ status: 'approved', org: 'org_other' })
    const m = await successThisMonth(db, 'org_owner', 'Asia/Riyadh', NOW)
    expect(m.clean).toEqual({ n: 2, of: 4 })
  })
})

describe('نُشر في موعده', () => {
  it(`أوّلُ نجاحٍ خلال ${ON_TIME_MINUTES} دقيقةً من موعده وبلا فشلٍ قبله — والمنشورُ هذا الشهر وحده`, async () => {
    const onTime = post({ status: 'published', scheduled: '2026-11-10 09:00:00' })
    attempt(onTime, 'succeeded', '2026-11-10 09:14:30')
    const late = post({ status: 'published', scheduled: '2026-11-10 09:00:00' })
    attempt(late, 'succeeded', '2026-11-10 09:31:00')
    const retried = post({ status: 'published', scheduled: '2026-11-10 09:00:00' })
    attempt(retried, 'failed', '2026-11-10 09:01:00')
    attempt(retried, 'succeeded', '2026-11-10 09:05:00')
    const isoSeeded = post({ status: 'published', scheduled: '2026-11-11T09:00:00Z' })
    attempt(isoSeeded, 'succeeded', '2026-11-11 09:03:00')
    const lastMonth = post({ status: 'published', scheduled: '2026-10-30 09:00:00' })
    attempt(lastMonth, 'succeeded', '2026-10-30 09:01:00')
    const m = await successThisMonth(db, 'org_owner', 'Asia/Riyadh', NOW)
    expect(m.onTime).toEqual({ n: 2, of: 4 })
  })
})

describe('كلفةُ المنشور الكاملة', () => {
  it('كتابتُه وما في الدفتر باسمه، لكلّ ما نُشر هذا الشهر — وما أُنفق كلُّه على ما نُشر بجانبه', async () => {
    const a = post({ status: 'published', scheduled: '2026-11-10 09:00:00', cost: 0.02 })
    attempt(a, 'succeeded', '2026-11-10 09:01:00')
    ledger(a, 0.015)
    ledger(a, 0.04)
    const b = post({ status: 'published', scheduled: '2026-11-11 09:00:00', model: 'owner' })
    attempt(b, 'succeeded', '2026-11-11 09:01:00')
    ledger(b, 0.015)
    ledger('src:analysis', 0.3)
    ledger('src:old', 5, '2026-10-01 09:00:00')
    ledger(b, 0.5, '2026-11-11 09:00:00', 'org_other')
    const m = await successThisMonth(db, 'org_owner', 'Asia/Riyadh', NOW)
    expect(m.cost.posts).toBe(2)
    expect(m.cost.direct).toBeCloseTo(0.02 + 0.015 + 0.04 + 0.015)
    expect(m.cost.all).toBeCloseTo(0.015 + 0.04 + 0.015 + 0.3)
  })

  it('وشهرٌ بلا شيءٍ أصفارٌ تقول «لم يُقَس» لا نسبًا مخترَعة', async () => {
    const m = await successThisMonth(db, 'org_owner', null, NOW)
    expect(m).toEqual({ clean: { n: 0, of: 0 }, onTime: { n: 0, of: 0 }, cost: { posts: 0, direct: 0, all: 0 }, utc: true })
  })
})

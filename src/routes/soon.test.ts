/**
 * ‏**موعدٌ قريبٌ يُرسَل إلى دقيقته من اللوحة** (D-320).
 *
 * ‏الدورةُ ترسل ما يحلّ قبل التي بعدها. وموعدٌ بعد خمس دقائق يُضبط بين دورتين لا تراه دورةٌ قبله، فكان يخرج في الدورة التالية:
 * ‏حتّى ثلاثَ عشرةَ دقيقةً بعد ما وُعد. فبعد كلّ فعلٍ يضع موعدًا يُرسَل ما في الأفق بعد الردّ.
 */
import { describe, expect, it } from 'vitest'
import { app } from '../index'
import { fakeDb } from '../test/fakes'
import { dispatchSoon, SCHEDULING_PATHS } from './panel/shared'

describe('أفعالُ الموعد (D-320)', () => {
  /** ‏كلُّ مسارٍ ينادي `schedulePost` أو `reschedulePost` أو `restoreSchedule` أو `scheduleFromUpload` أو `schedulePlan`. */
  const SCHEDULING = [
    '/panel/drafts/decide', '/panel/drafts/schedule', '/panel/drafts/spread/apply', '/panel/drafts/undo-unschedule',
    '/panel/drafts/reschedule', '/panel/plan/schedule', '/panel/plan/review/delay', '/panel/uploads/:id/posts', '/panel/uploads/:id/schedule',
  ]

  it('كلٌّ منها مسارٌ مسجَّل، والنمطُ يطابقه ولا يطابق ما سواه', () => {
    const posts = new Set(app.routes.filter((r) => r.method === 'POST').map((r) => r.path))
    for (const path of SCHEDULING) {
      expect(posts.has(path), path).toBe(true)
      expect(SCHEDULING_PATHS.test(path.replace(':id', 'u1')), path).toBe(true)
    }
    const others = [...posts].filter((p) => p.startsWith('/panel/') && !SCHEDULING.includes(p))
    expect(others.length).toBeGreaterThan(20)
    for (const path of others) expect(SCHEDULING_PATHS.test(path.replace(/:[a-z]+/g, 'u1')), path).toBe(false)
  })

  it('وبعدها يُرسَل ما يحلّ في الأفق مؤجَّلًا، بعد الردّ', async () => {
    const db = fakeDb()
    const due = new Date(Date.now() + 5 * 60_000).toISOString().slice(0, 19).replace('T', ' ')
    db.raw.exec(`INSERT INTO accounts (id, platform, kind, external_id, display_name) VALUES ('a1', 'x', 'member', 'e1', 'عمر')`)
    db.raw.prepare(`INSERT INTO posts (id, platform, type, text, status, idempotency_key, approved_by, approved_at, account_id, scheduled_at)
      VALUES ('p1', 'x', 'text', 'نصّ', 'queued', 'k1', 'panel', '2026-11-01T07:00:00Z', 'a1', ?)`).run(due)
    const sent: { body: unknown; delaySeconds?: number }[] = []
    const queue = { async sendBatch(m: { body: unknown; delaySeconds?: number }[]) { sent.push(...m) } }
    const later: Promise<unknown>[] = []
    dispatchSoon({ env: { DB: db, PUBLISH_QUEUE: queue } as never, executionCtx: { waitUntil: (p) => { later.push(p) } } })
    expect(later).toHaveLength(1)
    await Promise.all(later)
    expect(sent).toHaveLength(1)
    expect(sent[0]!.body).toEqual({ postId: 'p1', org: 'org_owner', due })
    expect(sent[0]!.delaySeconds).toBeGreaterThanOrEqual(298)
    expect(sent[0]!.delaySeconds).toBeLessThanOrEqual(301)
  })

  it('وبلا طابورٍ لا شيء، وطابورٌ يرمي لا يرمي من اللوحة', async () => {
    const db = fakeDb()
    expect(() => dispatchSoon({ env: { DB: db } as never, executionCtx: { waitUntil: () => { throw new Error('لا يُنادى') } } })).not.toThrow()
    const later: Promise<unknown>[] = []
    const down = { async sendBatch(): Promise<never> { throw new Error('queue down') } }
    dispatchSoon({ env: { DB: db, PUBLISH_QUEUE: down } as never, executionCtx: { waitUntil: (p) => { later.push(p) } } })
    await expect(Promise.all(later)).resolves.toEqual([0])
  })
})

import { beforeEach, describe, expect, it } from 'vitest'
import worker from './index'
import { fakeDb, type FakeDb } from './test/fakes'

let db: FakeDb
beforeEach(() => { db = fakeDb() })

async function queuedPost(): Promise<string> {
  const id = crypto.randomUUID()
  const account = crypto.randomUUID()
  await db.prepare(`INSERT INTO accounts (id, platform, kind, external_id, display_name, status) VALUES (?, 'x', 'member', 'ext', 'عمر', 'active')`).bind(account).run()
  await db.prepare(`INSERT INTO posts (id, platform, type, text, status, idempotency_key, approved_by, approved_at, dispatched_at, account_id, scheduled_at)
    VALUES (?, 'x', 'text', 'نصّ', 'queued', ?, 'panel', '2026-09-08T07:00:00Z', '2026-09-08 08:00:00', ?, '2026-09-08 08:00:00')`).bind(id, `k-${id}`, account).run()
  return id
}

function message(postId: string, attempts = 4) {
  const seen: string[] = []
  return { body: { postId }, attempts, ack: () => seen.push('ack'), retry: () => seen.push('retry'), seen }
}

/** ‏طابورُ الأعطال له مستهلك (D-270): ما استنفد محاولاته يُعلَّم failed بأثرٍ ويُقَرّ. */
describe('مستهلك طابور الأعطال', () => {
  it('يعلّم المنشور failed ويكتب محاولةً تقول «فرغ منه الطابور»', async () => {
    const post = await queuedPost()
    const m = message(post)
    await worker.queue({ queue: 'sada-publish-dlq-staging', messages: [m] } as never, { DB: db } as never)
    expect(m.seen).toEqual(['ack'])
    const row = db.raw.prepare('SELECT status FROM posts WHERE id = ?').get(post) as { status: string }
    expect(row.status).toBe('failed')
    const attempt = db.raw.prepare('SELECT request_json, response_json FROM publish_attempts WHERE post_id = ?').get(post) as { request_json: string; response_json: string }
    expect(attempt.response_json).toContain('dead_letter')
    expect(JSON.parse(attempt.request_json)).toMatchObject({ queue_attempts: 4 })
  })

  it('ولا يمسّ منشورا نُشر في الأثناء', async () => {
    const post = await queuedPost()
    db.raw.prepare("UPDATE posts SET status = 'published' WHERE id = ?").run(post)
    const m = message(post)
    await worker.queue({ queue: 'sada-publish-dlq', messages: [m] } as never, { DB: db } as never)
    expect(m.seen).toEqual(['ack'])
    expect((db.raw.prepare('SELECT status FROM posts WHERE id = ?').get(post) as { status: string }).status).toBe('published')
    expect((db.raw.prepare('SELECT count(*) AS n FROM publish_attempts').get() as { n: number }).n).toBe(0)
  })

  it('وطابور أعطال التوليد يُقَرّ بلا كتابة', async () => {
    const m = message('x')
    await worker.queue({ queue: 'sada-generate-dlq-staging', messages: [m] } as never, { DB: db } as never)
    expect(m.seen).toEqual(['ack'])
  })
})

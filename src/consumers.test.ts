/**
 * ‏**مستهلكو الطوابير يمسكون كلَّ رسالة** (D-320).
 *
 * ‏كان عطلٌ يُرمى من `publishPost` أو `analyzeSource` (D1 تعطّل ثواني) يخرج من `queue()` كلِّها: Cloudflare يعيد الدفعةَ فورًا
 * ‏بلا تباعد (لا `retry_delay` في wrangler.toml)، فتُستنفَد المحاولاتُ الثلاث في ثوانٍ ويُعلَّم المنشورُ «فشل» في طابور الأعطال،
 * ‏**ولا يُكتب نبضُ الطابور**. فصارت كلُّ رسالةٍ في `try` وحدَها: عطلُها يُعاد بتباعدٍ يتصاعد، والنبضُ يُكتب في `finally`.
 */
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import worker, { guarded } from './index'
import { fakeDb, type FakeDb } from './test/fakes'

let db: FakeDb
beforeEach(() => { db = fakeDb() })

/** ‏قاعدةٌ تسقط في عبارةٍ بعينها — كعطلٍ عابرٍ في D1 — وتعمل في ما سواها. */
function blip(inner: FakeDb, pattern: RegExp) {
  return {
    batch: inner.batch,
    prepare(query: string) {
      if (pattern.test(query)) throw new Error('D1_ERROR: Network connection lost.')
      return inner.prepare(query)
    },
  }
}

function message<B>(body: B, attempts = 1) {
  const seen: Array<string | { delaySeconds?: number }> = []
  return {
    body, attempts,
    ack: () => { seen.push('ack') },
    retry: (o?: { delaySeconds?: number }) => { seen.push(o ?? {}) },
    seen,
  }
}

describe('مستهلكُ النشر (D-320)', () => {
  it('عطلُ D1 يُعاد بتباعدٍ يتصاعد ولا يُرمى، والنبضُ يُكتب', async () => {
    const env = { DB: blip(db, /FROM posts p JOIN accounts a ON a\.id = p\.account_id/), TOKEN_ENC_KEY: '' } as never
    for (const [attempts, delay] of [[1, 60], [2, 300], [3, 900]] as const) {
      const m = message({ postId: 'p1' }, attempts)
      await expect(worker.queue({ queue: 'sada-publish-staging', messages: [m] } as never, env)).resolves.toBeUndefined()
      expect(m.seen).toEqual([{ delaySeconds: delay }])
    }
    const beat = db.raw.prepare("SELECT outcome, detail FROM heartbeats WHERE job = 'publish'").get() as { outcome: string; detail: string }
    expect(beat.outcome).toBe('failed')
    expect(beat.detail).toContain('1 من 1')
  })

  it('ورسالةٌ تسقط لا تُسقط ما بعدها في الدفعة', async () => {
    const env = { DB: blip(db, /FROM posts p JOIN accounts a ON a\.id = p\.account_id/), TOKEN_ENC_KEY: '' } as never
    const a = message({ postId: 'p1' })
    const b = message({ postId: 'p2' })
    await worker.queue({ queue: 'sada-publish-staging', messages: [a, b] } as never, env)
    expect(a.seen).toEqual([{ delaySeconds: 60 }])
    expect(b.seen).toEqual([{ delaySeconds: 60 }])
  })
})

describe('مستهلكُ التوليد (D-320)', () => {
  it('فهمُ مصدرٍ يرمي يُعاد بتباعدٍ ولا يُرمى', async () => {
    const env = { DB: blip(db, /FROM sources/), TOKEN_ENC_KEY: '' } as never
    const m = message({ sourceId: 's1' }, 2)
    await expect(worker.queue({ queue: 'sada-generate-staging', messages: [m] } as never, env)).resolves.toBeUndefined()
    expect(m.seen).toEqual([{ delaySeconds: 300 }])
  })

  it('وبندُ خطّةٍ يرمي قبل أن يُقَرّ يُعاد', async () => {
    const before = message({ draft: { sourceId: 's1', platform: 'linkedin', org: 'org_owner' } })
    await worker.queue({ queue: 'sada-generate-staging', messages: [before] } as never, { DB: blip(db, /./), TOKEN_ENC_KEY: '' } as never)
    expect(before.seen).toEqual([{ delaySeconds: 60 }])
  })

  it('وما رُمي بعد الإقرار لا يُعاد فوقه: الحكمُ الأوّلُ هو الحكم', async () => {
    const m = message({ sourceId: 's1' })
    const threw = await guarded(m, 'test', async (t) => { t.ack(); throw new Error('بعد الإقرار') })
    expect(threw).toBe(true)
    expect(m.seen).toEqual(['ack'])
  })
})

/**
 * ‏**والتباعدُ في wrangler.toml أيضًا** (D-320): ما يفلت من `guarded` (عطلٌ قبلها، أو استدعاءٌ قُتل) يعيده Cloudflare
 * ‏بـ`retry_delay` لا فورًا. وكان غائبًا عن المستهلكين الثمانية في البيئتين.
 */
describe('retry_delay لكلّ مستهلك (D-320)', () => {
  const toml = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8')
  const consumers = toml.split(/^\[\[/m).filter((b) => /^env\.\w+\.queues\.consumers\]\]/.test(b))

  it('ثمانيةُ مستهلكين، ولكلٍّ منهم تباعدٌ لا يقلّ عن دقيقة', () => {
    expect(consumers).toHaveLength(8)
    for (const block of consumers) {
      const queue = /queue\s*=\s*"([^"]+)"/.exec(block)?.[1]
      const delay = Number(/^retry_delay\s*=\s*(\d+)/m.exec(block)?.[1] ?? NaN)
      expect(delay, `${queue}: retry_delay`).toBeGreaterThanOrEqual(60)
    }
  })
})

/** ‏**الرسالةُ المؤجَّلةُ عند وصولها** (D-320): تختم منشورَها وتنشره، أو تُعاد بما بقي، أو تُقَرّ بلا شيء. */
describe('الرسالةُ المؤجَّلة في مستهلك النشر (D-320)', () => {
  const sqlNow = (offset: number) => new Date(Date.now() + offset * 1000).toISOString().slice(0, 19).replace('T', ' ')
  async function queued(offset: number): Promise<{ id: string; due: string }> {
    const id = crypto.randomUUID()
    const account = crypto.randomUUID()
    const due = sqlNow(offset)
    await db.prepare(`INSERT INTO accounts (id, platform, kind, external_id, display_name, status) VALUES (?, 'x', 'member', ?, 'عمر', 'active')`).bind(account, `e-${account}`).run()
    await db.prepare(`INSERT INTO posts (id, platform, type, text, status, idempotency_key, approved_by, approved_at, account_id, scheduled_at, enqueued_for)
      VALUES (?, 'x', 'text', 'نصّ', 'queued', ?, 'panel', '2026-09-08T07:00:00Z', ?, ?, ?)`).bind(id, `k-${id}`, account, due, due).run()
    return { id, due }
  }
  const env = () => ({ DB: db, TOKEN_ENC_KEY: '' }) as never
  const attempts = (id: string) => (db.raw.prepare('SELECT count(*) AS n FROM publish_attempts WHERE post_id = ?').get(id) as { n: number }).n

  it('حلّ موعدُها: تختم المنشورَ ثمّ تمضي إلى الناشر', async () => {
    const { id, due } = await queued(-1)
    const m = message({ postId: id, org: 'org_owner', due })
    await worker.queue({ queue: 'sada-publish-staging', messages: [m] } as never, env())
    const row = db.raw.prepare('SELECT dispatched_at FROM posts WHERE id = ?').get(id) as { dispatched_at: string | null }
    expect(row.dispatched_at).not.toBeNull()
    // ‏والناشرُ وصله: بلا رمزٍ يُكتب سقوطٌ قبل الإرسال
    expect(attempts(id)).toBe(1)
    expect(m.seen).toEqual(['ack'])
  })

  it('وصلت قبل دقيقتها: تُعاد بما بقي ولا تُختَم', async () => {
    const { id, due } = await queued(300)
    const m = message({ postId: id, org: 'org_owner', due })
    await worker.queue({ queue: 'sada-publish-staging', messages: [m] } as never, env())
    expect(m.seen).toHaveLength(1)
    const delay = (m.seen[0] as { delaySeconds: number }).delaySeconds
    expect(delay).toBeGreaterThanOrEqual(299)
    expect(delay).toBeLessThanOrEqual(302)
    expect(attempts(id)).toBe(0)
  })

  it('وتغيّر موعدُ منشورها بعد أن أُرسلت: تُقَرّ ولا يُنشَر شيء', async () => {
    const { id } = await queued(-1)
    const m = message({ postId: id, org: 'org_owner', due: sqlNow(-600) })
    await worker.queue({ queue: 'sada-publish-staging', messages: [m] } as never, env())
    expect(m.seen).toEqual(['ack'])
    expect(attempts(id)).toBe(0)
  })
})

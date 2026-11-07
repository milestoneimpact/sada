/**
 * ‏**مستهلكو الطوابير يمسكون كلَّ رسالة** (D-320).
 *
 * ‏كان عطلٌ يُرمى من `publishPost` أو `analyzeSource` (D1 تعطّل ثواني) يخرج من `queue()` كلِّها: Cloudflare يعيد الدفعةَ فورًا
 * ‏بلا تباعد (لا `retry_delay` في wrangler.toml)، فتُستنفَد المحاولاتُ الثلاث في ثوانٍ ويُعلَّم المنشورُ «فشل» في طابور الأعطال،
 * ‏**ولا يُكتب نبضُ الطابور**. فصارت كلُّ رسالةٍ في `try` وحدَها: عطلُها يُعاد بتباعدٍ يتصاعد، والنبضُ يُكتب في `finally`.
 */
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import worker, { guarded } from './index'
import { fakeDb, type FakeDb } from './test/fakes'
import { saveTokens, upsertAccount } from './lib/tokens'
import { scopeSet } from './lib/oauth/scopes'
import { toBase64 } from './lib/crypto'
import { X } from './lib/oauth/providers'
import { claimDelivery, dispatchDue } from './lib/schedule/job'
import { writeSetting } from './lib/settings'

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

/**
 * ‏**مراجعة D-320: الرسالةُ المؤجَّلةُ تُعاد بعد ختمها** — كان `claimDelivery` يختم في التسليم الأوّل ثمّ يردّ كلَّ إعادةٍ `stale`،
 * ‏فعطلٌ بعد الختم (D1 لحظةً، أو ‏429 من X، أو رمزٌ يقترب انتهاؤه) يُقَرّ بلا نشرٍ حتّى يجعله الكنّاسُ «فشل» بعد ستّين دقيقة.
 * ‏والمؤجَّلةُ هي المسارُ الغالب: كلُّ ما جُدول قبل دورته. **فإعادةُ الرسالة نفسِها تمضي بختمها**، ومنعُ الإرسال المزدوج
 * ‏لحرّاس الناشر (`succeeded` و`sent` ومحفّز 0047). **والتسليمُ المكرَّرُ الأوّل** (لا إعادةَ قبله) يبقى `stale`.
 */
describe('مراجعة D-320: الرسالةُ المؤجَّلةُ تُعاد بعد ختمها', () => {
  const KEY = toBase64(crypto.getRandomValues(new Uint8Array(32)))
  const sqlNow = (offset: number) => new Date(Date.now() + offset * 1000).toISOString().slice(0, 19).replace('T', ' ')
  afterEach(() => { vi.unstubAllGlobals() })

  /** ‏منشورُ X مؤجَّلٌ حلّ موعدُه، وحسابُه برمزٍ سليم. */
  async function deferredX(offset = -30): Promise<{ id: string; due: string }> {
    const account = await upsertAccount(db, 'org_owner', { platform: 'x', kind: 'member', externalId: '4242', displayName: 'عمر' })
    await saveTokens(db, KEY, account, { accessToken: 'live', refreshToken: null, expiresAt: '2099-01-01T00:00:00.000Z', refreshExpiresAt: null, scopes: scopeSet('x').join(' ') })
    const id = crypto.randomUUID()
    const due = sqlNow(offset)
    db.raw.prepare(`INSERT INTO posts (id, account_id, platform, type, text, scheduled_at, status, idempotency_key, approved_by, approved_at, enqueued_for)
      VALUES (?, ?, 'x', 'text', 'نصّ', ?, 'queued', ?, 'panel', '2026-09-07T10:00:00Z', ?)`).run(id, account, due, `k-${id}`, due)
    return { id, due }
  }
  /** ‏X يردّ بما في القائمة بالترتيب، ثمّ ‏201. */
  function xAnswers(...statuses: number[]): { calls: () => number } {
    let calls = 0
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      if (String(input) !== X.postUrl) return new Response('{}', { status: 200 })
      const status = statuses[calls] ?? 201
      calls += 1
      return status === 201
        ? new Response(JSON.stringify({ data: { id: `tweet-${calls}` } }), { status: 201 })
        : new Response(JSON.stringify({ title: 'Too Many Requests' }), { status })
    })
    return { calls: () => calls }
  }
  const post = (id: string) => db.raw.prepare('SELECT status, dispatched_at, enqueued_for FROM posts WHERE id = ?').get(id) as { status: string; dispatched_at: string | null; enqueued_for: string | null }
  const run = (m: ReturnType<typeof message>, env: unknown) => worker.queue({ queue: 'sada-publish-staging', messages: [m] } as never, env as never)

  it('‏429 بعد الختم: تُعاد بعد دقيقة، والإعادةُ تنشر', async () => {
    const { id, due } = await deferredX()
    const x = xAnswers(429)
    const first = message({ postId: id, org: 'org_owner', due }, 1)
    await run(first, { DB: db, TOKEN_ENC_KEY: KEY })
    expect(first.seen).toEqual([{ delaySeconds: 60 }])
    expect(post(id).dispatched_at).not.toBeNull()
    const second = message({ postId: id, org: 'org_owner', due }, 2)
    await run(second, { DB: db, TOKEN_ENC_KEY: KEY })
    expect(second.seen).toEqual(['ack'])
    expect(x.calls()).toBe(2)
    expect(post(id).status).toBe('published')
  })

  it('وعطلُ D1 في الناشر بعد الختم: الإعادةُ تصل الناشرَ وتنشر', async () => {
    const { id, due } = await deferredX()
    const x = xAnswers()
    const first = message({ postId: id, org: 'org_owner', due }, 1)
    await run(first, { DB: blip(db, /FROM posts p JOIN accounts a ON a\.id = p\.account_id/), TOKEN_ENC_KEY: KEY })
    expect(first.seen).toEqual([{ delaySeconds: 60 }])
    expect(x.calls()).toBe(0)
    const second = message({ postId: id, org: 'org_owner', due }, 2)
    await run(second, { DB: db, TOKEN_ENC_KEY: KEY })
    expect(x.calls()).toBe(1)
    expect(post(id).status).toBe('published')
  })

  it('ونشرت الإعادةُ الأولى: الثانيةُ لا ترسل شيئًا', async () => {
    const { id, due } = await deferredX()
    const x = xAnswers(429)
    await run(message({ postId: id, org: 'org_owner', due }, 1), { DB: db, TOKEN_ENC_KEY: KEY })
    await run(message({ postId: id, org: 'org_owner', due }, 2), { DB: db, TOKEN_ENC_KEY: KEY })
    const third = message({ postId: id, org: 'org_owner', due }, 3)
    await run(third, { DB: db, TOKEN_ENC_KEY: KEY })
    expect(third.seen).toEqual(['ack'])
    expect(x.calls()).toBe(2)
    expect((db.raw.prepare("SELECT count(*) AS n FROM publish_attempts WHERE post_id = ? AND status = 'succeeded'").get(id) as { n: number }).n).toBe(1)
  })

  it('والتسليمُ المكرَّرُ الأوّل (لا إعادةَ قبله) بعد ختم أخيه: يُقَرّ بلا نشر', async () => {
    const { id, due } = await deferredX()
    const x = xAnswers()
    await claimDelivery(db, id, 'org_owner', due, false)
    const twin = message({ postId: id, org: 'org_owner', due }, 1)
    await run(twin, { DB: db, TOKEN_ENC_KEY: KEY })
    expect(twin.seen).toEqual(['ack'])
    expect(x.calls()).toBe(0)
  })

  it('ورسالةٌ تأخّرت حتّى أرسلت الدورةُ منشورَها فورًا: لا تنشره ثانيةً ولو كانت إعادة', async () => {
    const { id, due } = await deferredX(-11 * 60)
    const sent: unknown[] = []
    await dispatchDue({ db, queue: { async sendBatch(m: unknown[]) { sent.push(...m) } } })
    expect(sent).toEqual([{ body: { postId: id } }])
    const x = xAnswers()
    const late = message({ postId: id, org: 'org_owner', due }, 2)
    await run(late, { DB: db, TOKEN_ENC_KEY: KEY })
    expect(late.seen).toEqual(['ack'])
    expect(x.calls()).toBe(0)
  })

  it('والإيقافُ على إعادةٍ بعد الختم: يُرفع الختمُ والعلامة فتعيده الدورةُ بعد الاستئناف، لا يكنسه الكنّاس', async () => {
    const { id, due } = await deferredX()
    xAnswers(429)
    await run(message({ postId: id, org: 'org_owner', due }, 1), { DB: db, TOKEN_ENC_KEY: KEY })
    await writeSetting(db, 'paused', 'true', 'test')
    const second = message({ postId: id, org: 'org_owner', due }, 2)
    await run(second, { DB: db, TOKEN_ENC_KEY: KEY })
    expect(second.seen).toEqual(['ack'])
    expect(post(id)).toEqual({ status: 'queued', dispatched_at: null, enqueued_for: null })
  })
})

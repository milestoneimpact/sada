/**
 * اختبار الناشر: القاعدة حقيقية بقيودها، والتشفير حقيقي، والشبكة مزيفة.
 * ما يُثبت هنا هو ما يمنع النشر مرتين والدفع مرتين.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { toBase64 } from '../crypto'
import { idempotencyKey } from '../idempotency'
import { saveTokens, upsertAccount } from '../tokens'
import { X, LINKEDIN } from '../oauth/providers'
import { fakeDb, fakeFetch, type FakeDb } from '../../test/fakes'
import { publishPost } from './publisher'

const KEY = toBase64(crypto.getRandomValues(new Uint8Array(32)))
const NOW = () => new Date('2026-09-08T09:00:00.000Z')

let db: FakeDb

const LIVE_TOKENS = {
  accessToken: 'live-access',
  refreshToken: null,
  expiresAt: '2026-11-02T10:00:00.000Z',
  refreshExpiresAt: null,
  scopes: 'tweet.write',
}

async function seedPost(options: {
  platform: 'x' | 'linkedin'
  text?: string
  approved?: boolean
  status?: string
}): Promise<string> {
  const accountId = await upsertAccount(db, {
    platform: options.platform,
    kind: 'member',
    externalId: options.platform === 'x' ? '4242' : 'abc',
    displayName: 'عمر',
  })
  await saveTokens(db, KEY, accountId, LIVE_TOKENS)
  const postId = `p-${options.platform}`
  const approved = options.approved ?? true
  db.raw
    .prepare(
      `INSERT INTO posts (id, account_id, platform, type, text, scheduled_at, status,
                          idempotency_key, approved_by, approved_at)
       VALUES (?, ?, ?, 'text', ?, '2026-09-08T09:00:00Z', ?, ?, ?, ?)`,
    )
    .run(
      postId,
      accountId,
      options.platform,
      options.text ?? 'نص المنشور',
      options.status ?? 'queued',
      await idempotencyKey(postId),
      approved ? 'omar' : null,
      approved ? '2026-09-07T10:00:00Z' : null,
    )
  return postId
}

const X_OK = { [X.postUrl]: { json: { data: { id: 'tweet-1' } } } }

function deps(fetchImpl: typeof fetch) {
  return { db, encKey: KEY, fetchImpl, now: NOW }
}

beforeEach(() => {
  db = fakeDb()
})

describe('النشر الناجح', () => {
  it('ينشر على X ويحدّث الحالة ويسجل المحاولة', async () => {
    const postId = await seedPost({ platform: 'x' })
    const f = fakeFetch(X_OK)
    const outcome = await publishPost(deps(f), { postId })

    expect(outcome).toEqual({ kind: 'published', platformPostId: 'tweet-1' })
    const post = db.raw.prepare('SELECT status FROM posts WHERE id = ?').get(postId) as {
      status: string
    }
    expect(post.status).toBe('published')
    const attempt = db.raw
      .prepare('SELECT attempt_no, status, platform_post_id FROM publish_attempts WHERE post_id = ?')
      .get(postId) as { attempt_no: number; status: string; platform_post_id: string }
    expect(attempt).toMatchObject({ attempt_no: 1, status: 'succeeded', platform_post_id: 'tweet-1' })
  })

  it('يرسل الرمز في ترويسة Bearer ولا يضعه في الجسم', async () => {
    const postId = await seedPost({ platform: 'x' })
    const f = fakeFetch(X_OK)
    await publishPost(deps(f), { postId })
    expect(f.calls[0]!.headers['Authorization']).toBe('Bearer live-access')
    expect(f.calls[0]!.body).not.toContain('live-access')
  })

  it('ينشر على LinkedIn بـ urn المشتق من external_id', async () => {
    const postId = await seedPost({ platform: 'linkedin' })
    const impl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      expect(input.toString()).toBe(LINKEDIN.postUrl)
      const body = JSON.parse(String(init?.body)) as { author: string }
      expect(body.author).toBe('urn:li:person:abc')
      return new Response('{}', { status: 201, headers: { 'x-restli-id': 'urn:li:share:99' } })
    }
    const outcome = await publishPost(deps(impl as unknown as typeof fetch), { postId })
    expect(outcome).toEqual({ kind: 'published', platformPostId: 'urn:li:share:99' })
  })
})

describe('D-004 · لا نشر مرتين', () => {
  it('لا يرسل طلبا ثانيا حين توجد محاولة ناجحة بالمفتاح نفسه', async () => {
    const postId = await seedPost({ platform: 'x' })
    const first = fakeFetch(X_OK)
    await publishPost(deps(first), { postId })

    // إعادة الرسالة كما يفعل Queue بعد فشل عابر
    db.raw.prepare(`UPDATE posts SET status = 'queued' WHERE id = ?`).run(postId)
    const second = fakeFetch(X_OK)
    const outcome = await publishPost(deps(second), { postId })

    expect(outcome.kind).toBe('skipped_duplicate')
    expect(second.calls).toHaveLength(0)
  })

  it('لا يسجل تكلفة ثانية عند إعادة المحاولة', async () => {
    const postId = await seedPost({ platform: 'x' })
    await publishPost(deps(fakeFetch(X_OK)), { postId })
    db.raw.prepare(`UPDATE posts SET status = 'queued' WHERE id = ?`).run(postId)
    await publishPost(deps(fakeFetch(X_OK)), { postId })

    const ledger = db.raw.prepare('SELECT count(*) AS n FROM cost_ledger').get() as { n: number }
    expect(ledger.n).toBe(1)
  })

  it('يخرج فورا حين يكون المنشور published أصلا', async () => {
    const postId = await seedPost({ platform: 'x', status: 'published' })
    const f = fakeFetch(X_OK)
    const outcome = await publishPost(deps(f), { postId })
    expect(outcome.kind).toBe('skipped_duplicate')
    expect(f.calls).toHaveLength(0)
  })
})

describe('D-008 · التكلفة تُسجَّل قبل أن يُعدّ الطلب ناجحا', () => {
  it('يسجل تكلفة X حتى حين يفشل الطلب بعد إرساله', async () => {
    const postId = await seedPost({ platform: 'x' })
    const f = fakeFetch({ [X.postUrl]: { status: 500, json: { error: 'server' } } })
    const outcome = await publishPost(deps(f), { postId })

    expect(outcome.kind).toBe('failed')
    const row = db.raw.prepare('SELECT provider, total FROM cost_ledger').get() as {
      provider: string
      total: number
    }
    expect(row.provider).toBe('x')
    expect(row.total).toBeCloseTo(0.015)
  })

  it('يميز تكلفة المنشور الذي يحوي رابطا', async () => {
    const postId = await seedPost({ platform: 'x', text: 'اقرأ المزيد على https://basserh.com' })
    await publishPost(deps(fakeFetch(X_OK)), { postId })
    const row = db.raw.prepare('SELECT operation, total FROM cost_ledger').get() as {
      operation: string
      total: number
    }
    expect(row.operation).toBe('create_post_with_url')
    expect(row.total).toBeCloseTo(0.2)
  })

  it('لا يسجل تكلفة لـ LinkedIn — لا رسوم على المنشور', async () => {
    const postId = await seedPost({ platform: 'linkedin' })
    const impl = async () =>
      new Response('{}', { status: 201, headers: { 'x-restli-id': 'urn:li:share:1' } })
    await publishPost(deps(impl as unknown as typeof fetch), { postId })
    const ledger = db.raw.prepare('SELECT count(*) AS n FROM cost_ledger').get() as { n: number }
    expect(ledger.n).toBe(0)
  })
})

describe('الفشل', () => {
  it('يعدّ 500 قابلا لإعادة المحاولة ولا يعلّم المنشور failed', async () => {
    const postId = await seedPost({ platform: 'x' })
    const outcome = await publishPost(
      deps(fakeFetch({ [X.postUrl]: { status: 500, json: { error: 'x' } } })),
      { postId },
    )
    expect(outcome).toMatchObject({ kind: 'failed', retryable: true })
    const post = db.raw.prepare('SELECT status FROM posts WHERE id = ?').get(postId) as {
      status: string
    }
    expect(post.status).toBe('queued')
  })

  it('يعدّ 429 قابلا لإعادة المحاولة', async () => {
    const postId = await seedPost({ platform: 'x' })
    const outcome = await publishPost(
      deps(fakeFetch({ [X.postUrl]: { status: 429, json: { error: 'rate' } } })),
      { postId },
    )
    expect(outcome).toMatchObject({ retryable: true })
  })

  it('يعدّ 403 نهائيا ويعلّم المنشور failed', async () => {
    const postId = await seedPost({ platform: 'x' })
    const outcome = await publishPost(
      deps(fakeFetch({ [X.postUrl]: { status: 403, json: { error: 'forbidden' } } })),
      { postId },
    )
    expect(outcome).toMatchObject({ kind: 'failed', retryable: false })
    const post = db.raw.prepare('SELECT status FROM posts WHERE id = ?').get(postId) as {
      status: string
    }
    expect(post.status).toBe('failed')
  })

  it('يرقّم المحاولات تصاعديا ولا يدهس السابقة', async () => {
    const postId = await seedPost({ platform: 'x' })
    const fail = fakeFetch({ [X.postUrl]: { status: 500, json: { error: 'x' } } })
    await publishPost(deps(fail), { postId })
    await publishPost(deps(fail), { postId })
    const rows = db.raw
      .prepare('SELECT attempt_no FROM publish_attempts WHERE post_id = ? ORDER BY attempt_no')
      .all(postId) as { attempt_no: number }[]
    expect(rows.map((r) => r.attempt_no)).toEqual([1, 2])
  })

  it('لا ينشر منشورا بلا اعتماد', async () => {
    const postId = await seedPost({ platform: 'x', approved: false, status: 'draft' })
    const f = fakeFetch(X_OK)
    const outcome = await publishPost(deps(f), { postId })
    expect(outcome).toMatchObject({ kind: 'failed', reason: 'not_approved' })
    expect(f.calls).toHaveLength(0)
  })

  it('لا ينشر برمز منته، ويعلّم الحساب needs_reauth', async () => {
    const postId = await seedPost({ platform: 'x' })
    db.raw.prepare(`UPDATE tokens SET expires_at = '2026-09-08T09:01:00Z'`).run()
    const f = fakeFetch(X_OK)
    const outcome = await publishPost(deps(f), { postId })
    expect(outcome).toMatchObject({ kind: 'failed', reason: 'token_expired' })
    expect(f.calls).toHaveLength(0)
    const account = db.raw.prepare(`SELECT status FROM accounts WHERE id = 'x:member:4242'`).get() as {
      status: string
    }
    expect(account.status).toBe('needs_reauth')
  })

  it('يبلّغ عن منشور غير موجود بلا رمي', async () => {
    const outcome = await publishPost(deps(fakeFetch({})), { postId: 'لا-وجود-له' })
    expect(outcome).toMatchObject({ kind: 'failed', reason: 'post_not_found', retryable: false })
  })
})

/**
 * الحارسُ الأخير: منشورٌ بصورةٍ لم يُبنَ رفعُها لا يُنشر نصّا وحده.
 *
 * والجدولةُ تمنعه قبل ذلك — لكنّ رسالةً دخلت الطابور قبل أن يُبنى هذا
 * تجده قائما. **وحارسان في طبقتين خيرٌ من واحدٍ في الأعلى.**
 */
describe('منشورٌ بصورة (D-039)', () => {
  it('لا يُنشر، ولا يُرسَل طلبٌ إلى المنصّة', async () => {
    const postId = await seedPost({ platform: 'x' })
    await db
      .prepare(
        `INSERT INTO media (id, post_id, r2_key, mime, bytes, prompt, model, idempotency_key)
         VALUES (?, ?, ?, 'image/png', 100, 'وصف', 'gemini', ?)`,
      )
      .bind(crypto.randomUUID(), postId, `img/${postId}/a.png`, `image:${postId}:aa`)
      .run()

    const f = fakeFetch(X_OK)
    const outcome = await publishPost(deps(f), { postId })
    expect(outcome.kind).toBe('failed')
    if (outcome.kind === 'failed') {
      expect(outcome.reason).toBe('media_upload_not_built')
      // ولا يُعاد: بناءُ الرفع لا يقع بإعادة المحاولة
      expect(outcome.retryable).toBe(false)
    }
    expect(f.calls).toHaveLength(0)
  })
})

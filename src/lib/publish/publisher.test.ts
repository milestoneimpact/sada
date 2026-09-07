/**
 * اختبار الناشر: القاعدة حقيقية بقيودها، والتشفير حقيقي، والشبكة مزيفة.
 * ما يُثبت هنا هو ما يمنع النشر مرتين والدفع مرتين.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { scopeSet } from '../oauth/scopes'
import { toBase64 } from '../crypto'
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
  // النطاقاتُ تُشتقّ من مصدرها لا تُكتب هنا: نطاقٌ يُضاف في `scopes.ts`
  // ويُنسى هنا يجعل كلَّ اختبارات النشر تفشل بـ `missing_publish_scope`
  // — وهو صادق، ولا يخبرنا شيئا عمّا نختبره (D-045)
  scopes: '',
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
  await saveTokens(db, KEY, accountId, {
    ...LIVE_TOKENS,
    scopes: scopeSet(options.platform).join(' '),
  })
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
      `draft:src:${options.platform}:${postId}`,
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

  /**
   * **ورمزُ تجديدٍ قائمٌ يعني عطلا عابرا لا حسابا معطوبا.**
   *
   * التجديدُ يقع قبل الطابور (D-066)، فالوصولُ هنا يعني أنّ الدورةَ
   * لم تُصلحه — دورةٌ سقطت، أو سرٌّ ناقص. **وتعليمُ الحساب
   * `needs_reauth` عندئذٍ يوقف نشرَه كلَّه لأجل دقائق**، ويُعلِّم
   * المالكَ أن يتجاهل طلبَ إذنٍ لا حاجةَ إليه.
   */
  it('ورمزٌ منتهٍ ومعه رمزُ تجديدٍ يُعاد ولا يُعلَّم الحساب', async () => {
    const postId = await seedPost({ platform: 'x' })
    // **ويُحفَظ بالتشفير الحقيقيّ**: بايتاتٌ مزيّفةٌ لا تُفكّ، فتُقرأ
    // «لا رمزَ محفوظ» ويمرّ الاختبارُ على فرعٍ آخر غير الذي يفحصه
    await saveTokens(db, KEY, 'x:member:4242', {
      accessToken: 'a', refreshToken: 'r', expiresAt: '2026-09-08T09:01:00Z',
      refreshExpiresAt: null, scopes: scopeSet('x').join(' '),
    })

    const f = fakeFetch(X_OK)
    const outcome = await publishPost(deps(f), { postId })
    expect(outcome).toMatchObject({ kind: 'failed', reason: 'token_expired_retry', retryable: true })
    expect(f.calls).toHaveLength(0)

    const account = db.raw
      .prepare(`SELECT status FROM accounts WHERE id = 'x:member:4242'`)
      .get() as { status: string }
    expect(account.status).toBe('active')
  })

  /**
   * **ورفضٌ لا يسمّي سببَه يوقف المالكَ بلا بابٍ يفتحه.**
   *
   * كان الردُّ `missing_publish_scope` وحدَه: يقول إنّ نطاقا نقص ولا
   * يقول أيَّه — والمالكُ لا يملك أن يمنح ما لا يعرف اسمَه (D-067).
   */
  it('ورفضُ النطاق يسمّي الناقصَ لا يشير إليه', async () => {
    const postId = await seedPost({ platform: 'x' })
    // نطاقٌ واحدٌ ممنوح، والباقي ناقص
    await saveTokens(db, KEY, 'x:member:4242', {
      accessToken: 'a', refreshToken: null, expiresAt: '2026-11-02T10:00:00.000Z',
      refreshExpiresAt: null, scopes: 'users.read',
    })

    const outcome = await publishPost(deps(fakeFetch(X_OK)), { postId })
    expect(outcome).toMatchObject({ kind: 'failed', retryable: false })
    const reason = (outcome as { reason: string }).reason
    expect(reason).toContain('missing_publish_scope')
    // **والاسمُ من `scopes.ts` لا مكتوبا هنا**: نطاقٌ يتغيّر اسمُه
    // يُغيّر الرسالةَ معه، ولا يبقى الاختبارُ يُصدّق ما بطل
    for (const name of scopeSet('x').filter((sc) => sc !== 'users.read')) {
      expect(reason).toContain(name)
    }
    expect(reason).not.toContain('users.read')
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
/**
 * النشرُ بصورة (D-040).
 *
 * وما يُختبَر ليس أنّ الرفع يعمل — بل **أنّ النصّ لا يخرج بلا صورته**،
 * وأنّ إعادةَ المحاولة لا ترفع مرّتين. والأولى تحمي المالكَ ممّا لم
 * يعتمده، والثانية تحمي جيبَه.
 */
describe('النشرُ بصورة (D-040)', () => {
  async function seedWithImage(platform: 'x' | 'linkedin'): Promise<{ postId: string; key: string }> {
    const postId = await seedPost({ platform })
    const key = `img/${postId}/a.png`
    await db
      .prepare(
        `INSERT INTO media (id, post_id, r2_key, mime, bytes, prompt, model, idempotency_key)
         VALUES (?, ?, ?, 'image/png', 100, 'وصف', 'gemini', ?)`,
      )
      .bind(crypto.randomUUID(), postId, key, `image:${postId}:aa`)
      .run()
    return { postId, key }
  }

  function bucket(has = true) {
    return {
      async get(k: string) {
        return has ? { async arrayBuffer() { return new Uint8Array([1, 2, 3]).buffer } } : null
      },
      calls: [] as string[],
    }
  }

  it('**لا يُنشر النصُّ وحده حين لا دلو** — ولا يُرسَل طلب', async () => {
    const { postId } = await seedWithImage('x')
    const f = fakeFetch(X_OK)
    const outcome = await publishPost(deps(f), { postId })

    expect(outcome.kind).toBe('failed')
    if (outcome.kind === 'failed') expect(outcome.reason).toBe('no_media_bucket')
    expect(f.calls).toHaveLength(0)
  })

  it('وبايتاتٌ مفقودةٌ توقف النشر ولا تُعاد', async () => {
    const { postId } = await seedWithImage('x')
    const f = fakeFetch(X_OK)
    const outcome = await publishPost({ ...deps(f), bucket: bucket(false) }, { postId })

    expect(outcome.kind).toBe('failed')
    if (outcome.kind === 'failed') {
      expect(outcome.reason).toBe('media_bytes_missing')
      expect(outcome.retryable).toBe(false)
    }
    expect(f.calls).toHaveLength(0)
  })

  it('يرفع ثمّ ينشر، ويُلحق المعرّف بالمنشور', async () => {
    const { postId } = await seedWithImage('x')
    const f = fakeFetch({
      [X.uploadUrl]: { json: { data: { id: 'media-9' } } },
      [X.postUrl]: { json: { data: { id: 'tweet-1' } } },
    })
    const outcome = await publishPost({ ...deps(f), bucket: bucket() }, { postId })

    expect(outcome).toEqual({ kind: 'published', platformPostId: 'tweet-1' })
    expect(f.calls.map((c) => c.url)).toEqual([X.uploadUrl, X.postUrl])
    expect(JSON.parse(f.calls[1]!.body)).toMatchObject({ media: { media_ids: ['media-9'] } })
  })

  it('**ويحفظ معرّف الوسيط فلا يُرفَع مرّتين** — و X يحاسب على الرفع', async () => {
    const { postId } = await seedWithImage('x')
    await publishPost(
      {
        ...deps(
          fakeFetch({
            [X.uploadUrl]: { json: { data: { id: 'media-9' } } },
            [X.postUrl]: { status: 500, json: { error: 'server' } },
          }),
        ),
        bucket: bucket(),
      },
      { postId },
    )

    const saved = db.raw
      .prepare('SELECT platform_media_id FROM media WHERE post_id = ?')
      .get(postId) as { platform_media_id: string }
    expect(saved.platform_media_id).toBe('media-9')

    // الإعادةُ لا تنادي نهايةَ الرفع أصلا
    const again = fakeFetch({ [X.postUrl]: { json: { data: { id: 'tweet-2' } } } })
    const outcome = await publishPost({ ...deps(again), bucket: bucket() }, { postId })
    expect(outcome.kind).toBe('published')
    expect(again.calls.map((c) => c.url)).toEqual([X.postUrl])
  })

  it('ويسجّل نداءَ الرفع في الدفتر بصفرٍ مُعلَّم — لا يُخترَع سعرٌ ولا يُسكَت', async () => {
    const { postId } = await seedWithImage('x')
    await publishPost(
      {
        ...deps(
          fakeFetch({
            [X.uploadUrl]: { json: { data: { id: 'media-9' } } },
            [X.postUrl]: { json: { data: { id: 'tweet-1' } } },
          }),
        ),
        bucket: bucket(),
      },
      { postId },
    )
    const rows = db.raw
      .prepare("SELECT operation, total FROM cost_ledger WHERE operation LIKE 'media_upload%'")
      .all() as { operation: string; total: number }[]
    expect(rows).toHaveLength(1)
    expect(rows[0]?.operation).toContain('price_unverified')
    expect(rows[0]?.total).toBe(0)
  })

  it('LinkedIn: تهيئةٌ ثمّ PUT ثمّ نشرٌ بمعرّف الصورة', async () => {
    const { postId } = await seedWithImage('linkedin')
    const seen: string[] = []
    const impl = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = input.toString()
      seen.push(url)
      if (url === LINKEDIN.uploadUrl) {
        return Response.json({ value: { uploadUrl: 'https://up.li/abc', image: 'urn:li:image:7' } })
      }
      if (url === 'https://up.li/abc') {
        expect(init?.method).toBe('PUT')
        return new Response(null, { status: 201 })
      }
      const body = JSON.parse(String(init?.body)) as { content?: { media?: { id?: string } } }
      expect(body.content?.media?.id).toBe('urn:li:image:7')
      return new Response('{}', { status: 201, headers: { 'x-restli-id': 'urn:li:share:9' } })
    }) as unknown as typeof fetch

    const outcome = await publishPost(
      { ...deps(impl), bucket: bucket() },
      { postId },
    )
    expect(outcome).toEqual({ kind: 'published', platformPostId: 'urn:li:share:9' })
    expect(seen).toEqual([LINKEDIN.uploadUrl, 'https://up.li/abc', LINKEDIN.postUrl])
  })

  it('وصورةٌ مرفوضةٌ لا تُرفَع — الرفضُ مخرجٌ لا حائط', async () => {
    const { postId } = await seedWithImage('x')
    await db.prepare("UPDATE media SET status = 'rejected' WHERE post_id = ?").bind(postId).run()
    const f = fakeFetch(X_OK)
    const outcome = await publishPost({ ...deps(f), bucket: bucket() }, { postId })

    expect(outcome.kind).toBe('published')
    expect(f.calls.map((c) => c.url)).toEqual([X.postUrl])
  })
})

/**
 * **نشرُ TikTok — والصندوقُ قبل الإجازة** (D-092).
 *
 * قال المالك: «أكمل بناء وجاهزية اليوتيوب وانستجرام وتيكتوك». و TikTok
 * أوّلُها لأنّ ربطَها مبنيٌّ **ولأنّها تعمل بلا انتظار مراجعة**:
 * `video.upload` يوصل المقطعَ صندوقَ التطبيق، و`video.publish` ينشر
 * مباشرةً بعد إجازةٍ تستغرق أسابيع.
 */
describe('TikTok — المقطعُ يصل، والبابُ يُقال', () => {
  const INIT_INBOX = 'https://open.tiktokapis.com/v2/post/publish/inbox/video/init/'
  const INIT_DIRECT = 'https://open.tiktokapis.com/v2/post/publish/video/init/'
  const UPLOAD = 'https://up.tiktok/x'
  const STATUS = 'https://open.tiktokapis.com/v2/post/publish/status/fetch/'

  const TIKTOK_OK = {
    [INIT_INBOX]: { json: { data: { publish_id: 'pub-9', upload_url: UPLOAD } } },
    [INIT_DIRECT]: { json: { data: { publish_id: 'pub-9', upload_url: UPLOAD } } },
    [UPLOAD]: { json: {} },
    [STATUS]: { json: { data: { status: 'PROCESSING_UPLOAD' } } },
  }

  async function seedTikTok(options: { scopes?: string; clip?: boolean } = {}): Promise<string> {
    const accountId = await upsertAccount(db, {
      platform: 'tiktok',
      kind: 'member',
      externalId: 'tt-1',
      displayName: 'عمر',
    })
    await saveTokens(db, KEY, accountId, {
      ...LIVE_TOKENS,
      scopes: options.scopes ?? 'user.info.basic video.upload',
    })
    const postId = 'p-tiktok'
    db.raw
      .prepare(
        `INSERT INTO posts (id, account_id, platform, type, text, scheduled_at, status,
                            idempotency_key, approved_by, approved_at)
         VALUES (?, ?, 'tiktok', 'text', ?, '2026-09-08T09:00:00Z', 'queued', ?, 'omar', '2026-09-07T10:00:00Z')`,
      )
      .run(postId, accountId, 'وصفُ المقطع', `draft:src:tiktok:${postId}`)

    if (options.clip !== false) {
      await db
        .prepare(
          `INSERT INTO media (id, post_id, r2_key, mime, bytes, prompt, model, idempotency_key)
           VALUES (?, ?, ?, 'video/mp4', 900, 'وصف', 'hh1-i2v', ?)`,
        )
        .bind(crypto.randomUUID(), postId, `video/${postId}/a.mp4`, `video:${postId}:aa`)
        .run()
    }
    return postId
  }

  const clipBucket = {
    async get() {
      return { async arrayBuffer() { return new Uint8Array([9, 9, 9, 9]).buffer } }
    },
  }

  it('بنطاق الصندوق وحدَه يُنشَر — ولا يُنتظَر Audit', async () => {
    const postId = await seedTikTok()
    const f = fakeFetch(TIKTOK_OK)
    const outcome = await publishPost({ ...deps(f), bucket: clipBucket }, { postId })

    expect(outcome.kind).toBe('published')
    expect(f.calls[0]!.url).toBe(INIT_INBOX)
  })

  it('ومع `video.publish` يُنشَر مباشرةً', async () => {
    const postId = await seedTikTok({ scopes: 'user.info.basic video.upload video.publish' })
    const f = fakeFetch(TIKTOK_OK)
    await publishPost({ ...deps(f), bucket: clipBucket }, { postId })
    expect(f.calls[0]!.url).toBe(INIT_DIRECT)
  })

  it('**ولا نشرَ بلا مقطع** — ولا يُرسَل طلبٌ ولا تُسجَّل كلفة', async () => {
    const postId = await seedTikTok({ clip: false })
    const f = fakeFetch(TIKTOK_OK)
    const outcome = await publishPost({ ...deps(f), bucket: clipBucket }, { postId })

    expect(outcome.kind).toBe('failed')
    if (outcome.kind === 'failed') expect(outcome.reason).toContain('no_clip')
    expect(f.calls).toHaveLength(0)
    const ledger = db.raw.prepare('SELECT count(*) AS n FROM cost_ledger').get() as { n: number }
    expect(ledger.n).toBe(0)
  })

  it('ونداءُ الرفع يُسجَّل موسوما — لم يُقرأ لهم سعرٌ بعد (D-008)', async () => {
    const postId = await seedTikTok()
    await publishPost({ ...deps(fakeFetch(TIKTOK_OK)), bucket: clipBucket }, { postId })
    const row = db.raw
      .prepare("SELECT operation, total FROM cost_ledger WHERE provider = 'tiktok'")
      .get() as { operation: string; total: number }
    expect(row.operation).toContain('price_unverified')
    expect(row.total).toBe(0)
  })

  it('ورمزٌ بلا نطاقِ رفعٍ يُردّ قبل النداء ويُسمّى الناقص', async () => {
    const postId = await seedTikTok({ scopes: 'user.info.basic' })
    const f = fakeFetch(TIKTOK_OK)
    const outcome = await publishPost({ ...deps(f), bucket: clipBucket }, { postId })

    expect(outcome.kind).toBe('failed')
    if (outcome.kind === 'failed') expect(outcome.reason).toContain('video.upload')
    expect(f.calls).toHaveLength(0)
  })
})

/**
 * **ووسيطُ المنشور يُختار بنوعه لا بأحدثيّته** (D-092).
 *
 * منشورُ LinkedIn حُرّكت صورتُه فيديو (D-052) يصير أحدثُ وسيطه **مقطعا**
 * — فكان يُرفَع مقطعٌ إلى نهايةِ صور، فيُردّ بخطأٍ لا يقول لماذا.
 */
describe('نوعُ الوسيط يُشترَط', () => {
  it('LinkedIn يأخذ الصورةَ ولو كان المقطعُ أحدثَ منها', async () => {
    const postId = await seedPost({ platform: 'linkedin' })
    await db
      .prepare(
        `INSERT INTO media (id, post_id, r2_key, mime, bytes, prompt, model, idempotency_key)
         VALUES (?, ?, ?, 'image/png', 100, 'وصف', 'gemini', ?)`,
      )
      .bind(crypto.randomUUID(), postId, `img/${postId}/a.png`, `image:${postId}:aa`)
      .run()
    // والمقطعُ بعدها — فهو الأحدث
    await db
      .prepare(
        `INSERT INTO media (id, post_id, r2_key, mime, bytes, prompt, model, idempotency_key)
         VALUES (?, ?, ?, 'video/mp4', 900, 'وصف', 'hh1-i2v', ?)`,
      )
      .bind(crypto.randomUUID(), postId, `video/${postId}/a.mp4`, `video:${postId}:aa`)
      .run()

    const seen: string[] = []
    const impl = async (input: RequestInfo | URL): Promise<Response> => {
      seen.push(input.toString())
      if (input.toString().includes('images')) {
        return Response.json({ value: { uploadUrl: 'https://up.li/x', image: 'urn:li:image:1' } })
      }
      if (input.toString().includes('up.li')) return new Response('', { status: 201 })
      return new Response('{}', { status: 201, headers: { 'x-restli-id': 'urn:li:share:7' } })
    }
    const bucket = {
      async get(k: string) {
        // **وهذا هو الحارس**: طُلبت الصورةُ لا المقطع
        expect(k).toContain('img/')
        return { async arrayBuffer() { return new Uint8Array([1, 2, 3]).buffer } }
      },
    }
    const outcome = await publishPost(
      { ...deps(impl as unknown as typeof fetch), bucket },
      { postId },
    )
    expect(outcome.kind).toBe('published')
  })
})

/**
 * **رفعُ YouTube — والمقطعُ يصل خاصّا** (D-096).
 *
 * نطاقُ الرفع «حسّاسٌ» عند Google، ومشروعٌ لم يُجَز يبقى في `Testing`.
 * **و YouTube تقفل مرفوعاتِه على `private` مهما طُلب** — فيُقال ذلك بدل
 * أن يُبحَث عنه على القناة علنا. وهي قاعدةُ صندوق TikTok نفسُها.
 */
describe('YouTube — المقطعُ يصل، والخصوصيّةُ تُقال', () => {
  const INIT =
    'https://www.googleapis.com/upload/youtube/v3/videos' +
    '?uploadType=resumable&part=snippet,status'
  const SESSION = 'https://upload.googleapis.com/session/abc'

  async function seedYouTube(options: { scopes?: string; clip?: boolean } = {}): Promise<string> {
    const accountId = await upsertAccount(db, {
      platform: 'youtube',
      kind: 'member',
      externalId: 'yt-1',
      displayName: 'قناةُ عمر',
    })
    await saveTokens(db, KEY, accountId, {
      ...LIVE_TOKENS,
      scopes: options.scopes ?? scopeSet('youtube').join(' '),
    })
    const postId = 'p-youtube'
    db.raw
      .prepare(
        `INSERT INTO posts (id, account_id, platform, type, text, scheduled_at, status,
                            idempotency_key, approved_by, approved_at)
         VALUES (?, ?, 'youtube', 'text', ?, '2026-09-08T09:00:00Z', 'queued', ?, 'omar', '2026-09-07T10:00:00Z')`,
      )
      .run(postId, accountId, 'الحوكمةُ تسبق السرعة\n\nوهذا شرحُها.', `draft:src:yt:${postId}`)

    if (options.clip !== false) {
      await db
        .prepare(
          `INSERT INTO media (id, post_id, r2_key, mime, bytes, prompt, model, idempotency_key)
           VALUES (?, ?, ?, 'video/mp4', 900, 'وصف', 'hh1-i2v', ?)`,
        )
        .bind(crypto.randomUUID(), postId, `video/${postId}/a.mp4`, `video:${postId}:aa`)
        .run()
    }
    return postId
  }

  const clipBucket = {
    async get() {
      return { async arrayBuffer() { return new Uint8Array([7, 7, 7, 7]).buffer } }
    },
  }

  /** شبكةٌ بخطوتين: تهيئةٌ تردّ `Location`، ثمّ دفعةٌ تردّ المعرّف. */
  function net(): typeof fetch & { seen: string[] } {
    const seen: string[] = []
    const impl = (async (input: RequestInfo | URL): Promise<Response> => {
      const url = input.toString()
      seen.push(url)
      if (url.startsWith(SESSION)) {
        return Response.json({ id: 'vid-7' })
      }
      return new Response('', { status: 200, headers: { Location: SESSION } })
    }) as typeof fetch & { seen: string[] }
    impl.seen = seen
    return impl
  }

  it('يرفع المقطعَ ويُسجَّل معرّفُ الفيديو', async () => {
    const postId = await seedYouTube()
    const f = net()
    const outcome = await publishPost({ ...deps(f), bucket: clipBucket }, { postId })

    expect(outcome).toEqual({ kind: 'published', platformPostId: 'vid-7' })
    expect(f.seen[0]).toBe(INIT)
    expect(f.seen[1]).toBe(SESSION)
  })

  it('**ولا رفعَ بلا مقطع** — ولا يُرسَل طلبٌ ولا تُسجَّل كلفة', async () => {
    const postId = await seedYouTube({ clip: false })
    const f = net()
    const outcome = await publishPost({ ...deps(f), bucket: clipBucket }, { postId })

    expect(outcome.kind).toBe('failed')
    if (outcome.kind === 'failed') expect(outcome.reason).toContain('no_clip')
    expect(f.seen).toHaveLength(0)
    const ledger = db.raw.prepare('SELECT count(*) AS n FROM cost_ledger').get() as { n: number }
    expect(ledger.n).toBe(0)
  })

  it('ورمزٌ بلا نطاق الرفع يُردّ قبل النداء ويُسمّى الناقص', async () => {
    const postId = await seedYouTube({
      scopes: 'https://www.googleapis.com/auth/youtube.readonly',
    })
    const f = net()
    const outcome = await publishPost({ ...deps(f), bucket: clipBucket }, { postId })

    expect(outcome.kind).toBe('failed')
    if (outcome.kind === 'failed') expect(outcome.reason).toContain('youtube.upload')
    expect(f.seen).toHaveLength(0)
  })

  it('ونداءُ الرفع يُسجَّل موسوما بمزوّده — لا باسمٍ ثابت (D-008)', async () => {
    const postId = await seedYouTube()
    await publishPost({ ...deps(net()), bucket: clipBucket }, { postId })
    const row = db.raw
      .prepare("SELECT operation, total FROM cost_ledger WHERE provider = 'youtube'")
      .get() as { operation: string; total: number }
    expect(row.operation).toContain('price_unverified')
    expect(row.total).toBe(0)
  })
})

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
import { writeSetting } from '../settings'
import { readJourney } from '../journey'

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
  kind?: 'member' | 'org'
}): Promise<string> {
  const accountId = await upsertAccount(db, 'org_owner', {
    platform: options.platform,
    kind: options.kind ?? 'member',
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

describe('رقمُ المحاولة من الطابور عمودًا (D-291)', () => {
  it('المحاولةُ التي تُرسَل تحمل رقمَ تسليم الطابور', async () => {
    const postId = await seedPost({ platform: 'x' })
    await publishPost({ ...deps(fakeFetch(X_OK)), queueAttempt: 2 }, { postId })
    const row = db.raw.prepare('SELECT queue_attempt FROM publish_attempts WHERE post_id = ?').get(postId) as { queue_attempt: number | null }
    expect(row.queue_attempt).toBe(2)
  })

  it('وسقوطٌ قبل الإرسال يحمله كذلك — ومن اللوحة بلا رقم', async () => {
    const postId = await seedPost({ platform: 'x' })
    db.raw.prepare('DELETE FROM tokens').run()
    const out = await publishPost({ ...deps(fakeFetch(X_OK)), queueAttempt: 3 }, { postId })
    expect(out.kind).toBe('failed')
    const row = db.raw.prepare('SELECT queue_attempt, status FROM publish_attempts WHERE post_id = ?').get(postId) as { queue_attempt: number | null; status: string }
    expect(row).toEqual({ queue_attempt: 3, status: 'failed' })

    const manual = await seedPost({ platform: 'linkedin' })
    db.raw.prepare('DELETE FROM tokens').run()
    await publishPost(deps(fakeFetch(X_OK)), { postId: manual })
    const second = db.raw.prepare('SELECT queue_attempt FROM publish_attempts WHERE post_id = ?').get(manual) as { queue_attempt: number | null }
    expect(second.queue_attempt).toBeNull()
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
  /*
   * ‏**500 من نهاية الإنشاء لا يُعاد** (D-269): قد تعود بعد أن أُنشئ المنشور، وإعادتُها
   * ‏تنشره مرّتين. فيُردّ نهائيّا بسببٍ يقول «لم يُؤكَّد»، والمالكُ يتحقّق ثمّ يعيد.
   */
  it('يعدّ 500 من نهاية الإنشاء «لم يُؤكَّد» ولا يُعيده — ويعلّم المنشور failed', async () => {
    const postId = await seedPost({ platform: 'x' })
    const outcome = await publishPost(
      deps(fakeFetch({ [X.postUrl]: { status: 500, json: { error: 'x' } } })),
      { postId },
    )
    expect(outcome).toMatchObject({ kind: 'failed', retryable: false })
    if (outcome.kind === 'failed') expect(outcome.reason).toContain('unconfirmed_send')
    const post = db.raw.prepare('SELECT status FROM posts WHERE id = ?').get(postId) as { status: string }
    expect(post.status).toBe('failed')
  })

  it('وانقطاعُ الشبكة وسطَ الإنشاء كذلك: لا يُعاد، ويُسمّى', async () => {
    const postId = await seedPost({ platform: 'x' })
    const impl: typeof fetch = async () => { throw new TypeError('fetch failed') }
    const outcome = await publishPost(deps(impl), { postId })
    expect(outcome).toMatchObject({ kind: 'failed', retryable: false, reason: 'unconfirmed_send: network' })
    const attempt = db.raw.prepare('SELECT status FROM publish_attempts WHERE post_id = ?').get(postId) as { status: string }
    expect(attempt.status).toBe('failed')
  })

  /*
   * ‏**ومحاولةٌ بقيت `sent` توقف الإعادة** (D-269): الاستدعاءُ قُتل وسطَ النداء، والمنشورُ
   * ‏قد يكون على المنصّة. فلا يُرسَل طلبٌ ثانٍ، ويُقال للمالك أن يتحقّق.
   */
  it('محاولةٌ سابقة بحالة sent تمنع الإرسال ولا يُنادى شيء', async () => {
    const postId = await seedPost({ platform: 'x' })
    const key = (db.raw.prepare('SELECT idempotency_key FROM posts WHERE id = ?').get(postId) as { idempotency_key: string }).idempotency_key
    db.raw.prepare(
      `INSERT INTO publish_attempts (id, post_id, idempotency_key, attempt_no, request_json, status)
       VALUES ('a-sent', ?, ?, 1, '{}', 'sent')`,
    ).run(postId, key)
    let calls = 0
    const impl: typeof fetch = async () => { calls += 1; return new Response('{}', { status: 201 }) }
    const outcome = await publishPost(deps(impl), { postId })
    expect(calls).toBe(0)
    expect(outcome).toMatchObject({ kind: 'failed', retryable: false })
    if (outcome.kind === 'failed') expect(outcome.reason).toContain('unconfirmed_prior_send')
    const post = db.raw.prepare('SELECT status FROM posts WHERE id = ?').get(postId) as { status: string }
    expect(post.status).toBe('failed')
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
  it('ورمز منته ومعه رمز تجديد يُعاد ولا يُعلَّم الحساب', async () => {
    const postId = await seedPost({ platform: 'x' })
    // **ويُحفَظ بالتشفير الحقيقيّ**: بايتاتٌ مزيّفةٌ لا تُفكّ، فتُقرأ
    // «لا إذنَ محفوظ» ويمرّ الاختبارُ على فرعٍ آخر غير الذي يفحصه
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
  it('ورفض النطاق يسمّي الناقص لا يشير إليه', async () => {
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
describe('النشر بصورة (D-040)', () => {
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

  it('**لا يُنشر النصّ وحده حين لا دلو** — ولا يُرسَل طلب', async () => {
    const { postId } = await seedWithImage('x')
    const f = fakeFetch(X_OK)
    const outcome = await publishPost(deps(f), { postId })

    expect(outcome.kind).toBe('failed')
    if (outcome.kind === 'failed') expect(outcome.reason).toBe('no_media_bucket')
    expect(f.calls).toHaveLength(0)
  })

  it('وبايتات مفقودة توقف النشر ولا تُعاد', async () => {
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

  /** ‏قيدُ الرفع في الدفتر قبل نداء الرفع (D-320): عطلُ D1 فيه لم يُرسل شيئًا، فيُعاد ولا يُعَدّ «أُرسل ولم يُعرَف». */
  it('والدفترُ يسقط قبل الرفع: يُعاد ولا يُفشَل المنشور', async () => {
    const { postId } = await seedWithImage('x')
    let ledgerDown = true
    const flaky = {
      batch: db.batch!,
      prepare(query: string) {
        const statement = db.prepare(query)
        if (!/INSERT INTO cost_ledger/.test(query)) return statement
        return {
          ...statement,
          bind: (...v: unknown[]) => {
            const bound = statement.bind(...v)
            return ledgerDown && v.includes('media_upload:price_unverified')
              ? { ...bound, run: async () => { throw new Error('D1_ERROR: network connection lost') } }
              : bound
          },
        }
      },
    }
    const f = fakeFetch({
      [X.uploadUrl]: { json: { data: { id: 'media-9' } } },
      [X.postUrl]: { json: { data: { id: 'tweet-1' } } },
    })
    const first = await publishPost({ db: flaky, encKey: KEY, fetchImpl: f, now: NOW, bucket: bucket() }, { postId })
    expect(first).toMatchObject({ kind: 'failed', retryable: true })
    expect(f.calls).toHaveLength(0)
    expect((db.raw.prepare('SELECT status FROM posts WHERE id = ?').get(postId) as { status: string }).status).toBe('queued')
    ledgerDown = false
    const second = await publishPost({ db: flaky, encKey: KEY, fetchImpl: f, now: NOW, bucket: bucket() }, { postId })
    expect(second).toEqual({ kind: 'published', platformPostId: 'tweet-1' })
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

  it('ويسجّل نداء الرفع في الدفتر بصفر مُعلَّم — لا يُخترَع سعر ولا يُسكَت', async () => {
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

  it('LinkedIn: تهيئة ثمّ PUT ثمّ نشر بمعرّف الصورة', async () => {
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

  it('وصورة مرفوضة لا تُرفَع — الرفض مخرج لا حائط', async () => {
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
describe('TikTok — المقطع يصل، والباب يُقال', () => {
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
    const accountId = await upsertAccount(db, 'org_owner', {
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
      .run(postId, accountId, 'وصف المقطع', `draft:src:tiktok:${postId}`)

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

  it('**ولا نشر بلا مقطع** — ولا يُرسَل طلب ولا تُسجَّل كلفة', async () => {
    const postId = await seedTikTok({ clip: false })
    const f = fakeFetch(TIKTOK_OK)
    const outcome = await publishPost({ ...deps(f), bucket: clipBucket }, { postId })

    expect(outcome.kind).toBe('failed')
    if (outcome.kind === 'failed') expect(outcome.reason).toContain('no_clip')
    expect(f.calls).toHaveLength(0)
    const ledger = db.raw.prepare('SELECT count(*) AS n FROM cost_ledger').get() as { n: number }
    expect(ledger.n).toBe(0)
  })

  it('ونداء الرفع يُسجَّل موسوما — لم يُقرأ لهم سعر بعد (D-008)', async () => {
    const postId = await seedTikTok()
    await publishPost({ ...deps(fakeFetch(TIKTOK_OK)), bucket: clipBucket }, { postId })
    const row = db.raw
      .prepare("SELECT operation, total FROM cost_ledger WHERE provider = 'tiktok'")
      .get() as { operation: string; total: number }
    expect(row.operation).toContain('price_unverified')
    expect(row.total).toBe(0)
  })

  /*
   * ‏**وعلنيُّ TikTok من إعداده هو** (مراجعة D-190): كان اختبارُ القلب لـ YouTube وحدَه، فتمرّ
   * ‏الاختباراتُ كلُّها لو مُرّر `youtubePublic` إلى TikTok أو أُسقط الخيار.
   */
  it('ومَن يرى مقطع TikTok إعدادُه هو: لا creator_info بالافتراض ولا بقلب YouTube، وللجميع بقلبه', async () => {
    const CREATOR = 'https://open.tiktokapis.com/v2/post/publish/creator_info/query/'
    const postId = await seedTikTok({ scopes: 'user.info.basic video.upload video.publish' })
    const routes = { ...TIKTOK_OK, [CREATOR]: { json: { data: { privacy_level_options: ['PUBLIC_TO_EVERYONE', 'SELF_ONLY'] }, error: { code: 'ok' } } } }
    const level = (f: ReturnType<typeof fakeFetch>): string =>
      (JSON.parse(f.calls.find((c) => c.url === INIT_DIRECT)!.body) as { post_info: { privacy_level: string } }).post_info.privacy_level
    const again = (): void => {
      db.raw.exec(`DELETE FROM publish_attempts; UPDATE posts SET status = 'queued' WHERE id = '${postId}'`)
    }

    const first = fakeFetch(routes)
    await publishPost({ ...deps(first), bucket: clipBucket }, { postId })
    expect(first.calls.some((c) => c.url === CREATOR)).toBe(false)
    expect(level(first)).toBe('SELF_ONLY')

    again()
    await writeSetting(db, 'youtube_public', 'true', 'test')
    const youtubeOnly = fakeFetch(routes)
    await publishPost({ ...deps(youtubeOnly), bucket: clipBucket }, { postId })
    expect(youtubeOnly.calls.some((c) => c.url === CREATOR)).toBe(false)
    expect(level(youtubeOnly)).toBe('SELF_ONLY')

    again()
    await writeSetting(db, 'tiktok_public', 'true', 'test')
    const flipped = fakeFetch(routes)
    await publishPost({ ...deps(flipped), bucket: clipBucket }, { postId })
    const order = flipped.calls.map((c) => c.url)
    expect(order.indexOf(CREATOR)).toBeGreaterThanOrEqual(0)
    expect(order.indexOf(CREATOR)).toBeLessThan(order.indexOf(INIT_DIRECT))
    expect(level(flipped)).toBe('PUBLIC_TO_EVERYONE')
  })

  /*
   * ‏**وما طُبّق فعلًا يُحفظ ويُقال** (مراجعة D-190): حسابٌ خاصٌّ لا يعرض العامّ فيُنشر
   * ‏`SELF_ONLY` — وكان ذلك يُرمى بعد النشر، فلا أثرَ في القاعدة ولا في رحلة المنشور.
   */
  it('حساب لا يعرض العامّ يُنشر بأضيق ما عُرض — والمستوى والملاحظة في المحاولة وفي الرحلة', async () => {
    const CREATOR = 'https://open.tiktokapis.com/v2/post/publish/creator_info/query/'
    const postId = await seedTikTok({ scopes: 'user.info.basic video.upload video.publish' })
    await writeSetting(db, 'tiktok_public', 'true', 'test')
    const f = fakeFetch({
      ...TIKTOK_OK,
      [CREATOR]: { json: { data: { privacy_level_options: ['FOLLOWER_OF_CREATOR', 'MUTUAL_FOLLOW_FRIENDS', 'SELF_ONLY'] }, error: { code: 'ok' } } },
    })
    expect((await publishPost({ ...deps(f), bucket: clipBucket }, { postId })).kind).toBe('published')
    const row = db.raw.prepare(`SELECT response_json FROM publish_attempts WHERE post_id = ? AND status = 'succeeded'`)
      .get(postId) as { response_json: string }
    const saved = JSON.parse(row.response_json) as { publish_id: string; request: { privacy_level: string; direct: boolean }; note: string }
    expect(saved.publish_id).toBe('pub-9')
    expect(saved.request).toMatchObject({ privacy_level: 'SELF_ONLY', direct: true })
    expect(saved.note).toContain('SELF_ONLY لا للعامّة')
    const journey = await readJourney(db, 'org_owner', postId)
    const published = journey!.stations.find((x) => x.kind === 'publish')!
    expect(published.detail).toContain('طُلب SELF_ONLY')
    expect(published.detail).toContain('لا للعامّة')
  })

  /*
   * ‏**والصندوقُ لا يُرسَل إليه نصّ** (مراجعة D-190): النصُّ المدفوعُ الذي راجعه المالكُ لا يصل
   * ‏TikTok، فيُقال بعد النشر «بلا نصّه — الصقه»، لا «نُشر» وحدَها.
   */
  it('والصندوق يُقال بعد النشر: وصل بلا نصّه — ولماذا إن كان العلنيّ مقلوبًا', async () => {
    const postId = await seedTikTok()
    await writeSetting(db, 'tiktok_public', 'true', 'test')
    await publishPost({ ...deps(fakeFetch(TIKTOK_OK)), bucket: clipBucket }, { postId })
    const row = db.raw.prepare(`SELECT response_json FROM publish_attempts WHERE post_id = ? AND status = 'succeeded'`)
      .get(postId) as { response_json: string }
    const saved = JSON.parse(row.response_json) as { request: { direct: boolean; privacy_level: string | null }; note: string }
    expect(saved.request).toMatchObject({ direct: false, privacy_level: null })
    expect(saved.note).toContain('بلا نصّه')
    expect(saved.note).toContain('video.publish')
  })

  it('ورمز بلا نطاق رفع يُردّ قبل النداء ويُسمّى الناقص', async () => {
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
describe('نوع الوسيط يُشترَط', () => {
  it('LinkedIn يأخذ الصورة ولو كان المقطع أحدث منها', async () => {
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
describe('YouTube — المقطع يصل، والخصوصيّة تُقال', () => {
  const INIT =
    'https://www.googleapis.com/upload/youtube/v3/videos' +
    '?uploadType=resumable&part=snippet,status'
  const SESSION = 'https://upload.googleapis.com/session/abc'

  async function seedYouTube(options: { scopes?: string; clip?: boolean } = {}): Promise<string> {
    const accountId = await upsertAccount(db, 'org_owner', {
      platform: 'youtube',
      kind: 'member',
      externalId: 'yt-1',
      displayName: 'قناة عمر',
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
      .run(postId, accountId, 'الحوكمة تسبق السرعة\n\nوهذا شرحُها.', `draft:src:yt:${postId}`)

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

  it('يرفع المقطع ويُسجَّل معرّف الفيديو', async () => {
    const postId = await seedYouTube()
    const f = net()
    const outcome = await publishPost({ ...deps(f), bucket: clipBucket }, { postId })

    expect(outcome).toEqual({ kind: 'published', platformPostId: 'vid-7' })
    expect(f.seen[0]).toBe(INIT)
    expect(f.seen[1]).toBe(SESSION)
  })

  it('**ولا رفع بلا مقطع** — ولا يُرسَل طلب ولا تُسجَّل كلفة', async () => {
    const postId = await seedYouTube({ clip: false })
    const f = net()
    const outcome = await publishPost({ ...deps(f), bucket: clipBucket }, { postId })

    expect(outcome.kind).toBe('failed')
    if (outcome.kind === 'failed') expect(outcome.reason).toContain('no_clip')
    expect(f.seen).toHaveLength(0)
    const ledger = db.raw.prepare('SELECT count(*) AS n FROM cost_ledger').get() as { n: number }
    expect(ledger.n).toBe(0)
  })

  it('ورمز بلا نطاق الرفع يُردّ قبل النداء ويُسمّى الناقص', async () => {
    const postId = await seedYouTube({
      scopes: 'https://www.googleapis.com/auth/youtube.readonly',
    })
    const f = net()
    const outcome = await publishPost({ ...deps(f), bucket: clipBucket }, { postId })

    expect(outcome.kind).toBe('failed')
    if (outcome.kind === 'failed') expect(outcome.reason).toContain('youtube.upload')
    expect(f.seen).toHaveLength(0)
  })

  /*
   * ‏**ومَن يرى المقطع قرارُ المالك بعد الإجازة** (D-190): خاصٌّ بالافتراض، وعلنيٌّ حين يقلبه.
   * ‏والإعدادُ يُقرأ عند النشر لا عند الجدولة — فمقطعٌ جُدول قبل الإجازة يخرج بقرار يومه.
   */
  it('خاصّ بالافتراض، وللعامّة بعد أن يقلب المالك «النشر العلنيّ»', async () => {
    const postId = await seedYouTube()
    const bodies: string[] = []
    const capture = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = input.toString()
      if (url.startsWith(SESSION)) return Response.json({ id: 'vid-7' })
      bodies.push(String(init?.body ?? ''))
      return new Response('', { status: 200, headers: { Location: SESSION } })
    }) as typeof fetch
    await publishPost({ ...deps(capture), bucket: clipBucket }, { postId })
    expect(JSON.parse(bodies[0]!).status.privacyStatus).toBe('private')

    db.raw.exec(`DELETE FROM publish_attempts; UPDATE posts SET status = 'queued' WHERE id = '${postId}'`)
    await writeSetting(db, 'youtube_public', 'true', 'test')
    await publishPost({ ...deps(capture), bucket: clipBucket }, { postId })
    expect(JSON.parse(bodies[1]!).status.privacyStatus).toBe('public')
  })

  it('ونداء الرفع يُسجَّل موسوما بمزوّده — لا باسم ثابت (D-008)', async () => {
    const postId = await seedYouTube()
    await publishPost({ ...deps(net()), bucket: clipBucket }, { postId })
    const row = db.raw
      .prepare("SELECT operation, total FROM cost_ledger WHERE provider = 'youtube'")
      .get() as { operation: string; total: number }
    expect(row.operation).toContain('price_unverified')
    expect(row.total).toBe(0)
  })
})

describe('Instagram — تسحب ولا تُدفَع إليها (D-121)', () => {
  const BASE = 'https://sada2.basserh.com'

  async function seedInstagram(options: { media?: 'image' | 'video' | 'none' } = {}) {
    const accountId = await upsertAccount(db, 'org_owner', {
      platform: 'instagram',
      kind: 'member',
      externalId: '17841400000000000',
      displayName: '@basserh',
    })
    await saveTokens(db, KEY, accountId, {
      ...LIVE_TOKENS,
      scopes: scopeSet('instagram').join(' '),
    })
    const postId = 'p-instagram'
    db.raw
      .prepare(
        `INSERT INTO posts (id, account_id, platform, type, text, scheduled_at, status,
                            idempotency_key, approved_by, approved_at)
         VALUES (?, ?, 'instagram', 'image', ?, '2026-09-08T09:00:00Z', 'queued', ?,
                 'omar', '2026-09-07T10:00:00Z')`,
      )
      .run(postId, accountId, 'الحوكمة تسبق السرعة', `draft:src:ig:${postId}`)

    const kind = options.media ?? 'image'
    if (kind !== 'none') {
      const mime = kind === 'video' ? 'video/mp4' : 'image/png'
      await db
        .prepare(
          `INSERT INTO media (id, post_id, r2_key, mime, bytes, prompt, model, idempotency_key)
           VALUES (?, ?, ?, ?, 900, 'وصف', 'nano', ?)`,
        )
        .bind(crypto.randomUUID(), postId, `m/${postId}.bin`, mime, `media:${postId}:a`)
        .run()
    }
    return postId
  }

  const bucket = {
    async get() {
      return { async arrayBuffer() { return new Uint8Array([1, 2, 3]).buffer } }
    },
  }

  function net(): typeof fetch & { seen: string[]; bodies: string[] } {
    const seen: string[] = []
    const bodies: string[] = []
    const impl = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = input.toString()
      seen.push(url)
      if (init?.body !== undefined) bodies.push(String(init.body))
      if (url.includes('media_publish')) return Response.json({ id: 'ig-post-1' })
      if (url.includes('/media')) return Response.json({ id: 'container-1' })
      return Response.json({ status_code: 'FINISHED' })
    }) as typeof fetch & { seen: string[]; bodies: string[] }
    impl.seen = seen
    impl.bodies = bodies
    return impl
  }

  it('ينشر صورةً برابط موقَّع لا ببايتات', async () => {
    const postId = await seedInstagram()
    const f = net()
    const outcome = await publishPost(
      { ...deps(f), bucket, baseUrl: BASE }, { postId },
    )
    expect(outcome).toEqual({ kind: 'published', platformPostId: 'ig-post-1' })
    // **والرابطُ موقَّعٌ ويشير إلى نافذتنا** — لا بايتاتٍ في الجسم
    expect(f.bodies[0]).toContain('image_url=')
    expect(decodeURIComponent(f.bodies[0] ?? '')).toContain(`${BASE}/m/`)
    expect(f.seen[1]).toContain('media_publish')
  })

  /** **ومقطعٌ يُرسَل REELS ويُستطلَع** — والنوعُ من `mime` لا من إعداد. */
  it('ومقطع يُرسَل REELS', async () => {
    const postId = await seedInstagram({ media: 'video' })
    const f = net()
    const outcome = await publishPost(
      { ...deps(f), bucket, baseUrl: BASE }, { postId },
    )
    expect(outcome.kind).toBe('published')
    expect(f.bodies[0]).toContain('media_type=REELS')
    expect(f.bodies[0]).toContain('video_url=')
  })

  /*
   * ‏**ومقطعُ المالك يغلب ما وُلّد بعده ولو حُذف مقطعُه من «فيديوهاتك»** (D-182 · مراجعة D-322): الحذفُ يقطع `upload_id`
   * ‏(`SET NULL`) ويُبقي صفَّ المنشور بمفتاحه، وكان الترتيبُ يقرأ `upload_id` وحدَه فيُنشر الإنفوجرافيكُ الأحدثُ مكانَ الـ Reel.
   */
  it('ومقطعُ المالك الذي حُذف من «فيديوهاتك» يبقى وسيطَه — لا الإنفوجرافيكُ الأحدث', async () => {
    const postId = await seedInstagram({ media: 'none' })
    db.raw.prepare(`INSERT INTO media (id, post_id, r2_key, mime, bytes, prompt, model, idempotency_key, upload_id, created_at)
      VALUES ('m-clip', ?, 'upload/u1.mp4', 'video/mp4', 900, '', 'upload', 'mk-clip', NULL, datetime('now', '-2 hours'))`).run(postId)
    db.raw.prepare(`INSERT INTO media (id, post_id, r2_key, mime, bytes, prompt, model, idempotency_key, created_at)
      VALUES ('m-info', ?, 'img/info.png', 'image/png', 900, '{}', 'infographic:steps', 'mk-info', datetime('now', '-1 hours'))`).run(postId)
    const f = net()
    const outcome = await publishPost({ ...deps(f), bucket, baseUrl: BASE }, { postId })
    expect(outcome.kind).toBe('published')
    expect(f.bodies[0]).toContain('media_type=REELS')
  })

  /** **ولا منشورَ نصّيٌّ فيها** — ويُردّ قبل أن تُنادى المنصّة. */
  it('وبلا وسيط يُردّ ولا يُنادى شيء', async () => {
    const postId = await seedInstagram({ media: 'none' })
    const f = net()
    const outcome = await publishPost(
      { ...deps(f), bucket, baseUrl: BASE }, { postId },
    )
    expect(outcome.kind).toBe('failed')
    if (outcome.kind === 'failed') expect(outcome.reason).toContain('لا تقبل منشورا نصّيّا')
    expect(f.seen).toHaveLength(0)
  })

  /** **ولا يُدَّعى عطلُ منصّةٍ لنقصٍ عندنا**: يُسمّى ما نقص. */
  it('وبلا عنوان موقع يُقال ما نقص ولا يُنادى شيء', async () => {
    const postId = await seedInstagram()
    const f = net()
    const outcome = await publishPost({ ...deps(f), bucket }, { postId })
    expect(outcome.kind).toBe('failed')
    if (outcome.kind === 'failed') expect(outcome.reason).toBe('instagram_needs_base_url')
    expect(f.seen).toHaveLength(0)
  })

  it('والنداء يُسجَّل في الدفتر قبل أن يُعدّ ناجحا (D-008)', async () => {
    const postId = await seedInstagram()
    await publishPost({ ...deps(net()), bucket, baseUrl: BASE }, { postId })
    const row = db.raw
      .prepare("SELECT operation, total FROM cost_ledger WHERE provider = 'instagram'")
      .get() as { operation: string; total: number }
    expect(row.operation).toContain('price_unverified')
    expect(row.total).toBe(0)
  })
})

/**
 * D-159 · سقوطٌ قبل الإرسال يُكتب كما يُكتب سقوطٌ بعده.
 */
describe('ما يسقط قبل الإرسال يترك أثرًا (D-159)', () => {
  it('بلا رمز محفوظ: محاولة failed بعلامة preflight والمنشور failed', async () => {
    const postId = await seedPost({ platform: 'x' })
    db.raw.prepare('DELETE FROM tokens').run()
    const outcome = await publishPost(deps(fakeFetch(X_OK)), { postId })
    expect(outcome).toMatchObject({ kind: 'failed', reason: 'no_tokens' })
    const attempt = db.raw
      .prepare('SELECT status, response_json, attempt_no FROM publish_attempts WHERE post_id = ?')
      .get(postId) as { status: string; response_json: string; attempt_no: number }
    expect(attempt.status).toBe('failed')
    expect(JSON.parse(attempt.response_json)).toEqual({ error: 'no_tokens', preflight: true })
    expect(attempt.attempt_no).toBe(1)
    const post = db.raw.prepare('SELECT status FROM posts WHERE id = ?').get(postId) as { status: string }
    expect(post.status).toBe('failed')
  })

  it('ورمز منته بلا تجديد كذلك، أمّا القابل للإعادة فلا صفّ له', async () => {
    const postId = await seedPost({ platform: 'x' })
    db.raw.prepare(`UPDATE tokens SET expires_at = '2026-09-08T09:01:00Z'`).run()
    await publishPost(deps(fakeFetch(X_OK)), { postId })
    const rows = db.raw.prepare('SELECT status FROM publish_attempts WHERE post_id = ?').all(postId) as { status: string }[]
    expect(rows).toEqual([{ status: 'failed' }])

    const retryId = await seedPost({ platform: 'linkedin' })
    await saveTokens(db, KEY, 'linkedin:member:abc', {
      ...LIVE_TOKENS, refreshToken: 'live-refresh', expiresAt: '2026-09-08T09:01:00Z',
      scopes: scopeSet('linkedin').join(' '),
    })
    const out = await publishPost(deps(fakeFetch(X_OK)), { postId: retryId })
    expect(out).toMatchObject({ kind: 'failed', reason: 'token_expired_retry', retryable: true })
    expect(db.raw.prepare('SELECT count(*) AS n FROM publish_attempts WHERE post_id = ?').get(retryId)).toEqual({ n: 0 })
  })

  it('ونقص النطاق يُكتب باسم الناقص', async () => {
    const postId = await seedPost({ platform: 'x' })
    db.raw.prepare(`UPDATE tokens SET scopes = 'users.read'`).run()
    const outcome = await publishPost(deps(fakeFetch(X_OK)), { postId })
    expect(outcome.kind).toBe('failed')
    const attempt = db.raw
      .prepare('SELECT response_json FROM publish_attempts WHERE post_id = ?')
      .get(postId) as { response_json: string }
    expect(JSON.parse(attempt.response_json).error).toContain('missing_publish_scope')
  })
})

/**
 * **حارسُ «حساب الصفحة» لـ LinkedIn وحدها.** YouTube يحفظ قناتَه بنوع
 * `org`، فكان كلُّ رفعٍ إليها يُردّ بسببٍ يخصّ صفحاتِ LinkedIn.
 */
describe('حساب الصفحة', () => {
  /** ‏صفحةٌ رقمُها 12345 وإذنُها من التطبيق الثاني (D-422) — أو بنطاقات الشخص حين `scopes` يُمرَّر. */
  async function seedPage(scopes = 'w_organization_social r_organization_social', externalId = '12345'): Promise<string> {
    const accountId = await upsertAccount(db, 'org_owner', { platform: 'linkedin', kind: 'org', externalId, displayName: 'صدى للنشر' })
    await saveTokens(db, KEY, accountId, { ...LIVE_TOKENS, scopes })
    db.raw.prepare(
      `INSERT INTO posts (id, account_id, platform, type, text, scheduled_at, status, idempotency_key, approved_by, approved_at)
       VALUES ('p-page', ?, 'linkedin', 'text', 'نص الصفحة', '2026-09-08T09:00:00Z', 'queued', 'draft:src:linkedin:p-page', 'omar', '2026-09-07T10:00:00Z')`,
    ).run(accountId)
    return 'p-page'
  }

  it('صفحة LinkedIn بإذنها تُنشَر باسمها: urn:li:organization في الجسم، ومفتاحُها مسجّل (D-422)', async () => {
    const post = await seedPage()
    let author = ''
    const impl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      expect(input.toString()).toBe(LINKEDIN.postUrl)
      author = (JSON.parse(String(init?.body)) as { author: string }).author
      return new Response('{}', { status: 201, headers: { 'x-restli-id': 'urn:li:share:77' } })
    }
    const outcome = await publishPost(deps(impl as unknown as typeof fetch), { postId: post })
    expect(outcome).toEqual({ kind: 'published', platformPostId: 'urn:li:share:77' })
    expect(author).toBe('urn:li:organization:12345')
    const attempt = db.raw.prepare('SELECT idempotency_key, status FROM publish_attempts WHERE post_id = ?').get(post) as { idempotency_key: string; status: string }
    expect(attempt).toEqual({ idempotency_key: 'draft:src:linkedin:p-page', status: 'succeeded' })
    // ‏ونشرُ LinkedIn بلا ثمن (`estimatePostCost`) فلا صفَّ في الدفتر — كالحساب الشخصيّ تمامًا (D-008 حيث يُدفع)
    const cost = db.raw.prepare("SELECT COUNT(*) AS n FROM cost_ledger WHERE ref_id = ?").get(post) as { n: number }
    expect(cost.n).toBe(0)
  })

  it('وصفحةٌ بلا w_organization_social تُردّ قبل الإرسال بسببٍ عربيٍّ يُقرأ', async () => {
    const post = await seedPage(scopeSet('linkedin').join(' '))
    const f = fakeFetch({})
    const outcome = await publishPost(deps(f), { postId: post })
    expect(outcome).toMatchObject({ kind: 'failed', retryable: false })
    expect(f.calls).toHaveLength(0)
    const row = db.raw.prepare('SELECT response_json FROM publish_attempts WHERE post_id = ?').get(post) as { response_json: string }
    expect(row.response_json).toContain('لا يشمل w_organization_social')
  })

  it('ومعرّفُ صفحةٍ ليس رقمًا يُردّ ولا يُرسَل', async () => {
    const post = await seedPage(undefined, 'not-a-number')
    const f = fakeFetch({})
    const outcome = await publishPost(deps(f), { postId: post })
    expect(outcome.kind).toBe('failed')
    expect(f.calls).toHaveLength(0)
  })

  it('وحساب من نوع org على منصّة أخرى لا يُردّ بسبب LinkedIn', async () => {
    const post = await seedPost({ platform: 'x', kind: 'org' })
    const outcome = await publishPost(deps(fakeFetch(X_OK)), { postId: post })
    expect(outcome).toEqual({ kind: 'published', platformPostId: 'tweet-1' })
  })
})


/**
 * ‏**D-004 في القاعدة: تسليمان متزامنان لا ينشران مرّتين** (D-320).
 *
 * ‏كان الحارسُ فحصًا ثمّ إدخالًا: يُسأل عن `succeeded` ثمّ `sent`، ثمّ تُكتب `sent` بعد خطوات. والطابورُ «مرّةً على الأقلّ»:
 * ‏رسالتان للمنشور نفسِه تمرّان من السؤالين معًا قبل أن يكتب أيٌّ منهما، فيُرسَل مرّتين ويُدفع لـX مرّتين. والمحفّزُ
 * ‏(0047) يردّ الحجزَ الثاني، والناشرُ يقرأ ردَّه «سبقه غيرُه» فيخرج بلا نداء.
 */
describe('تسليمان متزامنان (D-320)', () => {
  /**
   * ‏قاعدةٌ توقف التسليمَ الثاني بعد سؤاله عن `sent` حتّى يكتب الأوّلُ حجزَه — أضيقُ نافذةٍ كانت تفتح النشرَ المزدوج،
   * ‏مثبَّتةً لا متروكةً لترتيب الوعود.
   */
  function racing(inner: FakeDb) {
    let release: () => void = () => undefined
    const firstReserved = new Promise<void>((r) => { release = r })
    let sentChecks = 0
    const db = {
      batch: inner.batch!,
      prepare(query: string) {
        const statement = inner.prepare(query)
        const asksSent = /status = 'sent' LIMIT 1/.test(query)
        const reserves = /INSERT INTO publish_attempts[\s\S]*'sent'/.test(query)
        const wrap = (s: typeof statement): typeof statement => ({
          bind: (...v: unknown[]) => wrap(s.bind(...v)),
          all: s.all.bind(s),
          async first<T>() {
            const out = await s.first<T>()
            if (asksSent) {
              sentChecks += 1
              if (sentChecks === 2) await firstReserved
            }
            return out
          },
          async run() {
            const out = await s.run()
            if (reserves) release()
            return out
          },
        })
        return wrap(statement)
      },
    }
    return db
  }

  it('رسالتان للمنشور نفسِه معًا: نداءٌ واحدٌ إلى X، ومحاولةٌ ناجحةٌ واحدة', async () => {
    const postId = await seedPost({ platform: 'x' })
    const f = fakeFetch(X_OK)
    const shared = { db: racing(db), encKey: KEY, fetchImpl: f, now: NOW }
    const [a, b] = await Promise.all([publishPost(shared, { postId }), publishPost(shared, { postId })])
    expect(f.calls.filter((c) => c.url === X.postUrl)).toHaveLength(1)
    expect([a.kind, b.kind].sort()).toEqual(['published', 'skipped_duplicate'])
    const rows = db.raw.prepare('SELECT status FROM publish_attempts WHERE post_id = ? ORDER BY attempt_no').all(postId) as { status: string }[]
    expect(rows.map((r) => r.status)).toEqual(['succeeded'])
    // ‏والكلفةُ مرّةً واحدة: الحجزُ قبل الدفتر
    const cost = db.raw.prepare("SELECT count(*) AS n FROM cost_ledger WHERE ref_id = ?").get(postId) as { n: number }
    expect(cost.n).toBe(1)
    expect((db.raw.prepare('SELECT status FROM posts WHERE id = ?').get(postId) as { status: string }).status).toBe('published')
  })

  it('والقاعدةُ نفسُها تردّ ناجحةً ثانيةً بالمفتاح نفسِه، ومحاولةً مفتوحةً فوق مفتوحة', async () => {
    const postId = await seedPost({ platform: 'x' })
    const key = `draft:src:x:${postId}`
    db.raw.prepare(`INSERT INTO publish_attempts (id, post_id, idempotency_key, attempt_no, request_json, status) VALUES ('a1', ?, ?, 1, '{}', 'sent')`).run(postId, key)
    expect(() => db.raw.prepare(`INSERT INTO publish_attempts (id, post_id, idempotency_key, attempt_no, request_json, status) VALUES ('a2', ?, ?, 2, '{}', 'sent')`).run(postId, key)).toThrow(/d004_once/)
    db.raw.prepare(`UPDATE publish_attempts SET status = 'succeeded' WHERE id = 'a1'`).run()
    expect(() => db.raw.prepare(`INSERT INTO publish_attempts (id, post_id, idempotency_key, attempt_no, request_json, status) VALUES ('a3', ?, ?, 3, '{}', 'succeeded')`).run(postId, key)).toThrow(/d004_once/)
    // ‏والفاشلةُ تُكتب كما كانت: هي أثرٌ لا حجز
    db.raw.prepare(`INSERT INTO publish_attempts (id, post_id, idempotency_key, attempt_no, request_json, status) VALUES ('a4', ?, ?, 4, '{}', 'failed')`).run(postId, key)
    expect(() => db.raw.prepare(`UPDATE publish_attempts SET status = 'succeeded' WHERE id = 'a4'`).run()).toThrow(/d004_once/)
  })
})

/**
 * ‏**عطلٌ بين الحجز والإرسال لا يصير «أُرسلت ولم يُعرَف جوابُها»** (D-320).
 *
 * ‏كان `recordCost` بعد كتابة `sent` وخارجَ `try`: عطلُ D1 فيه يرمي من الناشر، فيبقى الصفُّ `sent` ولم يُرسَل شيء، وأوّلُ
 * ‏إعادةٍ من الطابور تجده فتُفشل المنشورَ نهائيًّا بـ«تحقّق على المنصّة» — **عطلٌ في دفترنا يصير سؤالًا للمالك عن X**.
 */
describe('عطلٌ قبل الإرسال (D-320)', () => {
  it('الدفترُ يسقط بعد الحجز: يُفكّ الحجز، ويُعاد، والإعادةُ تنشر', async () => {
    const postId = await seedPost({ platform: 'x' })
    let ledgerDown = true
    const flaky = {
      batch: db.batch!,
      prepare(query: string) {
        if (ledgerDown && /INSERT INTO cost_ledger/.test(query)) throw new Error('D1_ERROR: network connection lost')
        return db.prepare(query)
      },
    }
    const f = fakeFetch(X_OK)
    const first = await publishPost({ db: flaky, encKey: KEY, fetchImpl: f, now: NOW }, { postId })
    expect(first).toMatchObject({ kind: 'failed', retryable: true })
    expect(f.calls).toHaveLength(0)
    const held = db.raw.prepare('SELECT status FROM publish_attempts WHERE post_id = ?').all(postId) as { status: string }[]
    expect(held.map((r) => r.status)).toEqual(['failed'])

    ledgerDown = false
    const second = await publishPost({ db: flaky, encKey: KEY, fetchImpl: f, now: NOW }, { postId })
    expect(second).toEqual({ kind: 'published', platformPostId: 'tweet-1' })
  })
})

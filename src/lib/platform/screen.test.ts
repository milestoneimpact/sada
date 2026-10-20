/**
 * شاشةُ المنصّة — ما تقرؤه، وما تحسبه، وما ترفض أن تخترعه.
 *
 * والقاعدةُ هنا حقيقيّةٌ بقيودها: ما يمرّ في هذه الاختبارات يمرّ على
 * المخطّط نفسه الذي في الإنتاج — بما فيه قيدُ D-009 الذي يمنع النشرَ بلا
 * اعتماد. فصفٌّ يُبذَر «منشورا» بلا `approved_at` **ترفضه القاعدة**، لا
 * الاختبار.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { fakeDb, type FakeDb } from '../../test/fakes'
import { markNeedsReauth, upsertAccount } from '../tokens'
import { accountHealth, grantedScopes, permalink, platformPosts, platformTally } from './screen'

let db: FakeDb

beforeEach(() => {
  db = fakeDb()
})

async function seedAccount(platform: 'linkedin' | 'x'): Promise<string> {
  return upsertAccount(db, 'org_owner', {
    platform,
    kind: 'member',
    externalId: platform === 'x' ? '4242' : 'abc',
    displayName: platform === 'x' ? '@omar' : 'عمر',
  })
}

interface SeedOptions {
  readonly id: string
  readonly platform: 'linkedin' | 'x'
  readonly accountId: string | null
  readonly status: string
  readonly text?: string
  readonly cost?: number
  readonly scheduledAt?: string | null
}

function seedPost(o: SeedOptions): void {
  const needsApproval = o.status === 'queued' || o.status === 'published'
  db.raw
    .prepare(
      `INSERT INTO posts (id, account_id, platform, type, text, cost_usd,
                          scheduled_at, status, idempotency_key, approved_by, approved_at)
       VALUES (?, ?, ?, 'text', ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      o.id,
      o.accountId,
      o.platform,
      o.text ?? 'نصّ',
      o.cost ?? 0,
      o.scheduledAt === undefined ? '2026-09-06T09:00:00Z' : o.scheduledAt,
      o.status,
      `key-${o.id}`,
      needsApproval ? 'omar' : null,
      needsApproval ? '2026-09-05T10:00:00Z' : null,
    )
}

function seedAttempt(
  postId: string,
  status: 'succeeded' | 'failed',
  extra: { platformPostId?: string; response?: string; at?: string; no?: number } = {},
): void {
  db.raw
    .prepare(
      `INSERT INTO publish_attempts
         (id, post_id, idempotency_key, attempt_no, request_json,
          response_json, platform_post_id, status, at)
       VALUES (?, ?, ?, ?, '{}', ?, ?, ?, ?)`,
    )
    .run(
      `a-${postId}-${extra.no ?? 1}`,
      postId,
      `key-${postId}`,
      extra.no ?? 1,
      extra.response ?? null,
      extra.platformPostId ?? null,
      status,
      extra.at ?? '2026-09-06T10:00:00Z',
    )
}

describe('المنظّمة (D-231)', () => {
  it('شاشة المنصّة لا ترى منشورات منظّمة أخرى ولا حساباتها', async () => {
    db.raw.exec(`INSERT INTO orgs (id, name, kind) VALUES ('org_b', 'ب', 'team')`)
    const account = await seedAccount('linkedin')
    seedPost({ id: 'p1', platform: 'linkedin', accountId: account, status: 'draft' })
    expect(await platformPosts(db, 'org_b', 'linkedin')).toEqual([])
    expect((await platformTally(db, 'org_b', 'linkedin')).drafts).toBe(0)
    expect(await accountHealth(db, 'org_b', 'linkedin')).toEqual({})
    expect(await platformPosts(db, 'org_owner', 'linkedin')).toHaveLength(1)
  })
})

describe('الرابط — يُبنى ولا يُخزَّن', () => {
  it('LinkedIn يُبنى من URN', () => {
    expect(permalink('linkedin', 'urn:li:share:99')).toContain('linkedin.com/feed/update/')
    expect(permalink('linkedin', 'urn:li:share:99')).toContain('urn%3Ali%3Ashare%3A99')
  })

  it('و X من رقم محض', () => {
    expect(permalink('x', '1874')).toBe('https://x.com/i/web/status/1874')
  })

  /**
   * ما لا يُعرف شكلُه لا يُخمَّن.
   *
   * **وغيابُ الرابط أصدقُ من كسره**: رابطٌ مبنيٌّ على تخمينٍ يفتح صفحةَ
   * خطأ عند المنصّة، فيظنّ المالكُ أنّ منشوره حُذف.
   */
  it('وما لا يوافق الشكل يعيد لا شيء — لا رابطا مخمَّنا', () => {
    expect(permalink('linkedin', '99')).toBeNull()
    expect(permalink('linkedin', 'share:99')).toBeNull()
    expect(permalink('x', 'urn:li:share:99')).toBeNull()
    expect(permalink('x', 'abc')).toBeNull()
    expect(permalink('x', null)).toBeNull()
    expect(permalink('x', '   ')).toBeNull()
  })

  it('ورقم Instagram لا يُفتَح على x.com', () => {
    expect(permalink('instagram', '17912345678901234')).toBeNull()
    expect(permalink('tiktok', '7312345678901234567')).toBeNull()
  })

  it('و YouTube من معرّف المقطع', () => {
    expect(permalink('youtube', 'dQw4w9WgXcQ')).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    expect(permalink('youtube', '1874')).toBeNull()
  })
})

describe('المنشورات — تُقرأ من محاولاتها', () => {
  it('الوقت والرابط من آخر محاولة ناجحة', async () => {
    const account = await seedAccount('linkedin')
    seedPost({ id: 'p1', platform: 'linkedin', accountId: account, status: 'published' })
    seedAttempt('p1', 'succeeded', {
      platformPostId: 'urn:li:share:7',
      at: '2026-09-06T11:00:00Z',
    })

    const [post] = await platformPosts(db, 'org_owner', 'linkedin')
    expect(post!.platformPostId).toBe('urn:li:share:7')
    expect(post!.publishedAt).toBe('2026-09-06T11:00:00Z')
    expect(post!.accountName).toBe('عمر')
  })

  /**
   * منشورٌ فشل ثمّ نجح يحمل الاثنين.
   *
   * وهذا ما يقع فعلا: أوّلُ محاولةٍ تُردّ، ويُصلَح الضبط، وتنجح الثانية.
   * فلو قُرئ الفشلُ وحده لبدا المنشورُ فاشلا وهو منشور، ولو قُرئ النجاحُ
   * وحده لضاع سببٌ يُحتاج إليه.
   */
  it('ويحمل الفشل والنجاح معا حين اجتمعا', async () => {
    const account = await seedAccount('linkedin')
    seedPost({ id: 'p1', platform: 'linkedin', accountId: account, status: 'published' })
    seedAttempt('p1', 'failed', {
      no: 1,
      response: JSON.stringify({ message: 'Not enough permissions' }),
      at: '2026-09-06T09:00:00Z',
    })
    seedAttempt('p1', 'succeeded', {
      no: 2,
      platformPostId: 'urn:li:share:7',
      at: '2026-09-06T11:00:00Z',
    })

    const [post] = await platformPosts(db, 'org_owner', 'linkedin')
    expect(post!.publishedAt).toBe('2026-09-06T11:00:00Z')
    expect(post!.lastError).toBe('Not enough permissions')
  })

  it('وسبب الفشل يُختصَر ولا يُعرَض جسم جواب كامل', async () => {
    const account = await seedAccount('x')
    seedPost({ id: 'p1', platform: 'x', accountId: account, status: 'failed' })
    seedAttempt('p1', 'failed', { response: JSON.stringify({ detail: 'ن'.repeat(600) }) })
    const [post] = await platformPosts(db, 'org_owner', 'x')
    expect(post!.lastError!.length).toBeLessThanOrEqual(240)
  })

  it('وجواب ليس JSON يُؤخذ كما هو لا يُبتلَع', async () => {
    const account = await seedAccount('x')
    seedPost({ id: 'p1', platform: 'x', accountId: account, status: 'failed' })
    seedAttempt('p1', 'failed', { response: 'Bad Gateway' })
    const [post] = await platformPosts(db, 'org_owner', 'x')
    expect(post!.lastError).toBe('Bad Gateway')
  })

  it('ولا يخلط منصّةً بأخرى', async () => {
    const li = await seedAccount('linkedin')
    const x = await seedAccount('x')
    seedPost({ id: 'p1', platform: 'linkedin', accountId: li, status: 'draft' })
    seedPost({ id: 'p2', platform: 'x', accountId: x, status: 'draft' })

    expect((await platformPosts(db, 'org_owner', 'linkedin')).map((p) => p.id)).toEqual(['p1'])
    expect((await platformPosts(db, 'org_owner', 'x')).map((p) => p.id)).toEqual(['p2'])
  })

  it('ومسوّدة بلا حساب تُعرَض — الكتابة تسبق الربط', async () => {
    seedPost({ id: 'p1', platform: 'linkedin', accountId: null, status: 'draft' })
    const [post] = await platformPosts(db, 'org_owner', 'linkedin')
    expect(post!.accountName).toBeNull()
  })
})

describe('الحصاد — يُحسَب من كلّ الصفوف لا من الصفحة', () => {
  /**
   * الشاشةُ تعرض ستّين وتعدّ الكلّ.
   *
   * وعدٌّ من المعروض يقول «نُشر ثلاثة» وقد نُشرت مئة — وهو رقمٌ يُبنى
   * عليه قرار.
   */
  it('يعدّ ما هو أبعد من حدّ العرض', async () => {
    const account = await seedAccount('x')
    for (let i = 0; i < 70; i += 1) {
      seedPost({ id: `p${i}`, platform: 'x', accountId: account, status: 'published' })
      seedAttempt(`p${i}`, 'succeeded', { platformPostId: String(1000 + i) })
    }
    expect(await platformPosts(db, 'org_owner', 'x')).toHaveLength(60)
    expect((await platformTally(db, 'org_owner', 'x')).published).toBe(70)
  })

  it('ويفرز الحالات ويجمع الكلفة', async () => {
    const account = await seedAccount('linkedin')
    seedPost({ id: 'a', platform: 'linkedin', accountId: account, status: 'published', cost: 0.02 })
    seedPost({ id: 'b', platform: 'linkedin', accountId: account, status: 'queued', cost: 0.03 })
    seedPost({ id: 'c', platform: 'linkedin', accountId: account, status: 'failed', cost: 0.01 })
    seedPost({ id: 'd', platform: 'linkedin', accountId: null, status: 'draft', cost: 0.04 })

    const tally = await platformTally(db, 'org_owner', 'linkedin')
    expect(tally).toMatchObject({ published: 1, queued: 1, failed: 1, drafts: 1 })
    expect(tally.spend).toBeCloseTo(0.1)
  })

  it('وآخر نشر من المحاولات لا من الصفوف', async () => {
    const account = await seedAccount('x')
    seedPost({ id: 'p1', platform: 'x', accountId: account, status: 'published' })
    seedAttempt('p1', 'succeeded', { platformPostId: '1', at: '2026-09-01T08:00:00Z' })
    seedPost({ id: 'p2', platform: 'x', accountId: account, status: 'published' })
    seedAttempt('p2', 'succeeded', { platformPostId: '2', at: '2026-09-04T08:00:00Z' })

    expect((await platformTally(db, 'org_owner', 'x')).lastPublishedAt).toBe('2026-09-04T08:00:00Z')
  })

  it('ومنصّة بلا صفوف تعطي أصفارا لا عطلا', async () => {
    expect(await platformTally(db, 'org_owner', 'x')).toMatchObject({
      published: 0, queued: 0, failed: 0, drafts: 0, lastPublishedAt: null,
    })
    expect(await platformPosts(db, 'org_owner', 'x')).toEqual([])
  })
})

describe('النطاقات الممنوحة — تُقرأ بلا مفتاح تشفير', () => {
  it('تُعاد لكلّ حساب بمعرّفه', async () => {
    const account = await seedAccount('linkedin')
    db.raw
      .prepare(
        `INSERT INTO tokens (account_id, access_enc, access_iv, expires_at, scopes)
         VALUES (?, 'x', 'y', '2026-12-01T00:00:00Z', 'openid profile')`,
      )
      .run(account)
    expect(await grantedScopes(db, 'org_owner', 'linkedin')).toEqual({ [account]: 'openid profile' })
  })

  it('وحساب بلا رمز لا يظهر — ولا يُختلَق له نطاق', async () => {
    await seedAccount('linkedin')
    expect(await grantedScopes(db, 'org_owner', 'linkedin')).toEqual({})
  })
})

/**
 * سجلُّ صحّة الحساب (D-129) — **من صفوفه، ولا محطّةَ تُخترَع**.
 */
describe('accountHealth', () => {
  it('حساب بلا رمز يُقال فيه ذلك، وبرمز يُقرأ موعدُه وتجديدُه وتنبيهاتُه', async () => {
    const id = await seedAccount('linkedin')
    const bare = await accountHealth(db, 'org_owner', 'linkedin')
    expect(bare[id]).toMatchObject({ status: 'active', expiresAt: null, refreshedAt: null, alerts: [] })

    db.raw.exec(
      `INSERT INTO tokens (account_id, access_enc, access_iv, expires_at, refresh_expires_at, scopes, refreshed_at)
       VALUES ('${id}', 'e', 'i', '2026-10-01 00:00:00', '2027-01-01 00:00:00', 'openid', '2026-09-10 03:00:00')`,
    )
    db.raw.exec(
      `INSERT INTO token_alerts (account_id, kind, threshold, expires_at, at)
       VALUES ('${id}', 'access', 7, '2026-10-01 00:00:00', '2026-09-24 03:00:00'),
              ('${id}', 'refresh', 1, '2027-01-01 00:00:00', '2026-12-31 03:00:00')`,
    )
    const h = (await accountHealth(db, 'org_owner', 'linkedin'))[id]!
    expect(h.expiresAt).toBe('2026-10-01 00:00:00')
    expect(h.refreshExpiresAt).toBe('2027-01-01 00:00:00')
    expect(h.refreshedAt).toBe('2026-09-10 03:00:00')
    expect(h.alerts.map((a) => `${a.kind}:${a.threshold}`)).toEqual(['refresh:1', 'access:7'])
    expect(await accountHealth(db, 'org_owner', 'x')).toEqual({})
  })
})

/**
 * ختمُ السقوط (D-131): يُختَم مرّةً عند التعليم، ويُمحى عند إعادة الربط.
 */
describe('needs_reauth_at', () => {
  it('يُختَم عند أوّل تعليم ولا يتبدّل بتعليم ثان، ويُمحى بإعادة الربط', async () => {
    const id = await seedAccount('linkedin')
    expect((await accountHealth(db, 'org_owner', 'linkedin'))[id]!.needsReauthAt).toBeNull()

    await markNeedsReauth(db, id)
    const first = (await accountHealth(db, 'org_owner', 'linkedin'))[id]!
    expect(first.status).toBe('needs_reauth')
    expect(first.needsReauthAt).not.toBeNull()

    db.raw.exec(`UPDATE accounts SET needs_reauth_at = '2026-09-01 00:00:00' WHERE id = '${id}'`)
    await markNeedsReauth(db, id)
    expect((await accountHealth(db, 'org_owner', 'linkedin'))[id]!.needsReauthAt).toBe('2026-09-01 00:00:00')

    const row = db.raw.prepare('SELECT platform, kind, external_id, display_name FROM accounts WHERE id = ?').get(id) as
      { platform: 'linkedin'; kind: 'member' | 'org'; external_id: string; display_name: string }
    await upsertAccount(db, 'org_owner', { id, platform: row.platform, kind: row.kind, externalId: row.external_id, displayName: row.display_name } as never)
    const back = (await accountHealth(db, 'org_owner', 'linkedin'))[id]!
    expect(back.status).toBe('active')
    expect(back.needsReauthAt).toBeNull()
  })
})


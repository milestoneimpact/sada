/**
 * دورةُ القياس — القاعدةُ حقيقيّةٌ بقيودها، والشبكةُ مزيّفة.
 *
 * وما يُثبَت هنا ثلاثة: أنّ **`null` لا تصير صفرا**، وأنّ ما قِيس لا
 * يُقاس ثانيةً (و X يحاسب على كلّ قراءة)، وأنّ منشورا حُذف **لا يدور
 * إلى الأبد**.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { fakeDb, fakeFetch, type FakeDb } from '../../test/fakes'
import { toBase64 } from '../crypto'
import { saveTokens, upsertAccount } from '../tokens'
import { scopeSet } from '../oauth/scopes'
import { fetchLinkedInMetrics, fetchXMetrics, MetricsError } from './platforms'
import { dueWindows, metricsFor, pullDue, pullOne, widest, WINDOWS } from './job'

const KEY = toBase64(crypto.getRandomValues(new Uint8Array(32)))
const NOW = new Date('2026-09-20T12:00:00.000Z')

let db: FakeDb

beforeEach(() => {
  db = fakeDb()
})

const sql = (t: string): string => t

async function seedPublished(o: {
  id: string
  platform: 'linkedin' | 'x'
  platformPostId: string
  /** كم ساعةً مضت على نشره. */
  agoHours: number
  scopes?: string
}): Promise<string> {
  const accountId = await upsertAccount(db, 'org_owner', {
    platform: o.platform,
    kind: 'member',
    externalId: o.platform === 'x' ? '4242' : 'abc',
    displayName: 'عمر',
  })
  await saveTokens(db, KEY, accountId, {
    accessToken: 'live-access',
    refreshToken: null,
    expiresAt: '2026-12-01T00:00:00.000Z',
    refreshExpiresAt: null,
    scopes: o.scopes ?? scopeSet(o.platform).join(' '),
  })
  const at = new Date(NOW.getTime() - o.agoHours * 3600_000)
    .toISOString().slice(0, 19).replace('T', ' ')

  db.raw
    .prepare(
      sql(`INSERT INTO posts (id, account_id, platform, type, text, scheduled_at,
                              status, idempotency_key, approved_by, approved_at)
           VALUES (?, ?, ?, 'text', 'نصّ', ?, 'published', ?, 'omar', ?)`),
    )
    .run(o.id, accountId, o.platform, at, `k-${o.id}`, at)

  db.raw
    .prepare(
      sql(`INSERT INTO publish_attempts
             (id, post_id, idempotency_key, attempt_no, request_json,
              platform_post_id, status, at)
           VALUES (?, ?, ?, 1, '{}', ?, 'succeeded', ?)`),
    )
    .run(`a-${o.id}`, o.id, `k-${o.id}`, o.platformPostId, at)

  return accountId
}

const X_OK = {
  'https://api.x.com/2/tweets/1874?tweet.fields=public_metrics': {
    json: {
      data: {
        public_metrics: {
          impression_count: 5120, like_count: 43, reply_count: 7,
          retweet_count: 5, quote_count: 2,
        },
      },
    },
  },
}

const LI_URL = `https://api.linkedin.com/rest/socialActions/${encodeURIComponent('urn:li:share:99')}`
const LI_OK = {
  [LI_URL]: {
    json: {
      likesSummary: { totalLikes: 31 },
      commentsSummary: { aggregatedTotalComments: 4 },
    },
  },
}

describe('سائقُ المنصّة — والفراغُ ليس صفرا', () => {
  it('X: يقرأ الظهورَ والتفاعل، ويجمع المشاركتين', async () => {
    const m = await fetchXMetrics('t', '1874', fakeFetch(X_OK))
    expect(m.impressions).toBe(5120)
    expect(m.reactions).toBe(43)
    expect(m.comments).toBe(7)
    // إعادةُ نشرٍ واقتباسٌ كلاهما مشاركة
    expect(m.shares).toBe(7)
  })

  /**
   * **هذا هو الاختبارُ الذي يمنع اللوحةَ من الكذب.**
   *
   * LinkedIn لا يعطي الظهورَ لمنشور عضو. فلو حُوِّل الغيابُ إلى صفر
   * لعُرض «٠ ظهور» على منشورٍ رآه ألف — فيُحكَم عليه بالفشل وهو ناجح.
   */
  it('LinkedIn: الظهورُ null لا صفر — لأنّه لا يُقاس أصلا', async () => {
    const m = await fetchLinkedInMetrics('t', 'urn:li:share:99', fakeFetch(LI_OK))
    expect(m.impressions).toBeNull()
    expect(m.shares).toBeNull()
    expect(m.reactions).toBe(31)
    expect(m.comments).toBe(4)
  })

  it('و URN يُرمَّز في المسار — وبلا ترميزٍ يُقطَع عند أوّل نقطتين', async () => {
    const f = fakeFetch(LI_OK)
    await fetchLinkedInMetrics('t', 'urn:li:share:99', f)
    expect(f.calls[0]!.url).toContain('urn%3Ali%3Ashare%3A99')
    expect(f.calls[0]!.url).not.toContain('urn:li:share:99')
  })

  it('وحقلٌ غائبٌ يبقى null ولا يُصفَّر', async () => {
    const m = await fetchXMetrics(
      't', '1874',
      fakeFetch({
        'https://api.x.com/2/tweets/1874?tweet.fields=public_metrics': {
          json: { data: { public_metrics: { like_count: 3 } } },
        },
      }),
    )
    expect(m.reactions).toBe(3)
    expect(m.impressions).toBeNull()
    expect(m.shares).toBeNull()
  })

  it('و X يردّ 200 بلا data على منشورٍ محذوف — فيُعدّ غيرَ موجود ولا يُعاد', async () => {
    const f = fakeFetch({
      'https://api.x.com/2/tweets/1874?tweet.fields=public_metrics': {
        json: { errors: [{ title: 'Not Found Error' }] },
      },
    })
    await expect(fetchXMetrics('t', '1874', f)).rejects.toMatchObject({
      status: 404, retryable: false,
    })
  })

  it('و 429 يُعاد، و 403 لا يُعاد', async () => {
    const bad = (status: number): typeof fetch =>
      fakeFetch({
        'https://api.x.com/2/tweets/1874?tweet.fields=public_metrics': { status, json: {} },
      })
    await expect(fetchXMetrics('t', '1874', bad(429))).rejects.toMatchObject({ retryable: true })
    await expect(fetchXMetrics('t', '1874', bad(403))).rejects.toMatchObject({ retryable: false })
  })
})

describe('ما حان قياسُه', () => {
  it('منشورٌ عمرُه ساعةٌ لا نافذةَ له بعد', async () => {
    await seedPublished({ id: 'p1', platform: 'x', platformPostId: '1874', agoHours: 1 })
    expect(await dueWindows(db, NOW)).toEqual([])
  })

  it('وعمرُ يومٍ يفتح نافذةً واحدة', async () => {
    await seedPublished({ id: 'p1', platform: 'x', platformPostId: '1874', agoHours: 25 })
    const due = await dueWindows(db, NOW)
    expect(due.map((d) => d.window)).toEqual(['24h'])
  })

  it('وعمرُ أسبوعين يفتح الثلاثَ معا', async () => {
    await seedPublished({ id: 'p1', platform: 'x', platformPostId: '1874', agoHours: 24 * 14 })
    const due = await dueWindows(db, NOW)
    expect(due.map((d) => d.window).sort()).toEqual(['24h', '72h', '7d'])
  })

  it('ومسوّدةٌ لا تُقاس — القياسُ لما نُشر', async () => {
    db.raw
      .prepare(
        sql(`INSERT INTO posts (id, platform, type, text, status, idempotency_key)
             VALUES ('d1', 'x', 'text', 'ن', 'draft', 'kd1')`),
      )
      .run()
    expect(await dueWindows(db, NOW)).toEqual([])
  })

  it('ومنشورٌ بلا معرّفٍ عند المنصّة لا يُقاس — لا شيءَ يُسأل عنه', async () => {
    const accountId = await upsertAccount(db, 'org_owner', {
      platform: 'x', kind: 'member', externalId: '4242', displayName: 'عمر',
    })
    db.raw
      .prepare(
        sql(`INSERT INTO posts (id, account_id, platform, type, text, scheduled_at,
                                status, idempotency_key, approved_by, approved_at)
             VALUES ('p1', ?, 'x', 'text', 'ن', '2026-09-01 00:00:00', 'published',
                     'k1', 'omar', '2026-09-01 00:00:00')`),
      )
      .run(accountId)
    db.raw
      .prepare(
        sql(`INSERT INTO publish_attempts (id, post_id, idempotency_key, attempt_no,
                                           request_json, status, at)
             VALUES ('a1', 'p1', 'k1', 1, '{}', 'succeeded', '2026-09-01 00:00:00')`),
      )
      .run()
    expect(await dueWindows(db, NOW)).toEqual([])
  })
})

describe('الدورة', () => {
  it('تقيس وتكتب، وتسجّل كلفةَ القراءة عند X', async () => {
    await seedPublished({ id: 'p1', platform: 'x', platformPostId: '1874', agoHours: 25 })
    const summary = await pullDue({ db, encKey: KEY, fetchImpl: fakeFetch(X_OK), now: () => NOW })

    expect(summary).toMatchObject({ due: 1, measured: 1, deferred: 0, closed: 0 })
    const row = db.raw
      .prepare(sql('SELECT window, impressions, reactions FROM metrics WHERE post_id = ?'))
      .get('p1') as { window: string; impressions: number; reactions: number }
    expect(row).toMatchObject({ window: '24h', impressions: 5120, reactions: 43 })

    const cost = db.raw
      .prepare(sql('SELECT operation, provider, total FROM cost_ledger'))
      .get() as { operation: string; provider: string; total: number }
    expect(cost.provider).toBe('x')
    expect(cost.operation).toBe('read_metrics:24h')
  })

  /**
   * **و X يحاسب على كلّ قراءة.**
   *
   * فلو أعادت الدورةُ قياسَ ما قِيس، لقُرئت منشوراتُ الشهر كلَّ ساعة —
   * ودُفع ثمنُ ذلك كلَّه بلا معرفةٍ جديدة.
   */
  it('ولا تعيد قياسَ نافذةٍ قِيست — والقراءةُ مدفوعة', async () => {
    await seedPublished({ id: 'p1', platform: 'x', platformPostId: '1874', agoHours: 25 })
    const first = fakeFetch(X_OK)
    await pullDue({ db, encKey: KEY, fetchImpl: first, now: () => NOW })
    const second = fakeFetch(X_OK)
    const summary = await pullDue({ db, encKey: KEY, fetchImpl: second, now: () => NOW })

    expect(summary.due).toBe(0)
    expect(second.calls).toHaveLength(0)
    const n = db.raw.prepare(sql('SELECT count(*) AS n FROM cost_ledger')).get() as { n: number }
    expect(n.n).toBe(1)
  })

  it('و LinkedIn لا يُسجَّل له صفرٌ يزحم الدفتر', async () => {
    await seedPublished({
      id: 'p1', platform: 'linkedin', platformPostId: 'urn:li:share:99', agoHours: 25,
    })
    await pullDue({ db, encKey: KEY, fetchImpl: fakeFetch(LI_OK), now: () => NOW })
    const n = db.raw.prepare(sql('SELECT count(*) AS n FROM cost_ledger')).get() as { n: number }
    expect(n.n).toBe(0)
  })

  /**
   * الحارسُ قبل النداء (D-019 · D-045): رمزٌ بلا نطاق قراءةٍ **لا يُنادى
   * به ولا تُحسَب كلفتُه**.
   */
  it('ورمزٌ بلا نطاقِ قراءةٍ يُؤجَّل ولا يُنفَق عليه', async () => {
    await seedPublished({
      id: 'p1', platform: 'x', platformPostId: '1874', agoHours: 25,
      scopes: 'users.read tweet.write',
    })
    const f = fakeFetch(X_OK)
    const summary = await pullDue({ db, encKey: KEY, fetchImpl: f, now: () => NOW })

    expect(summary).toMatchObject({ due: 1, measured: 0, deferred: 1 })
    expect(f.calls).toHaveLength(0)
    const n = db.raw.prepare(sql('SELECT count(*) AS n FROM cost_ledger')).get() as { n: number }
    expect(n.n).toBe(0)
  })

  /**
   * **ومنشورٌ حُذف لا يدور إلى الأبد.**
   *
   * بلا ختمٍ، تختاره كلُّ دورةٍ ساعيّة فتُنادي وتدفع وتُردّ — إلى الأبد.
   * فيُختَم بصفٍّ كلُّه فراغ: المفتاحُ يمنع اختيارَه، والفراغُ لا يكذب.
   */
  it('ومنشورٌ حُذف يُختَم بفراغٍ فلا يُعاد — ولا يُقرأ صفرا', async () => {
    await seedPublished({ id: 'p1', platform: 'x', platformPostId: '1874', agoHours: 25 })
    const gone = fakeFetch({
      'https://api.x.com/2/tweets/1874?tweet.fields=public_metrics': { status: 404, json: {} },
    })
    const summary = await pullDue({ db, encKey: KEY, fetchImpl: gone, now: () => NOW })
    expect(summary).toMatchObject({ closed: 1 })

    const row = db.raw
      .prepare(sql('SELECT impressions, reactions FROM metrics WHERE post_id = ?'))
      .get('p1') as { impressions: number | null; reactions: number | null }
    expect(row.impressions).toBeNull()
    expect(row.reactions).toBeNull()

    // ولا تعود الدورةُ إليه
    expect(await dueWindows(db, NOW)).toEqual([])
  })

  it('وعطلٌ عابرٌ يُؤجَّل ولا يُختَم — فتلتقطه الدورةُ التالية', async () => {
    await seedPublished({ id: 'p1', platform: 'x', platformPostId: '1874', agoHours: 25 })
    const flaky = fakeFetch({
      'https://api.x.com/2/tweets/1874?tweet.fields=public_metrics': { status: 503, json: {} },
    })
    await pullDue({ db, encKey: KEY, fetchImpl: flaky, now: () => NOW })

    const n = db.raw.prepare(sql('SELECT count(*) AS n FROM metrics')).get() as { n: number }
    expect(n.n).toBe(0)
    expect((await dueWindows(db, NOW)).length).toBe(1)
  })

  it('وصفٌّ يفشل لا يُسقط ما بعده', async () => {
    await seedPublished({ id: 'p1', platform: 'x', platformPostId: '1874', agoHours: 25 })
    await seedPublished({
      id: 'p2', platform: 'linkedin', platformPostId: 'urn:li:share:99', agoHours: 25,
    })
    // X يفشل، و LinkedIn ينجح
    const mixed = fakeFetch({
      'https://api.x.com/2/tweets/1874?tweet.fields=public_metrics': { status: 503, json: {} },
      ...LI_OK,
    })
    const summary = await pullDue({ db, encKey: KEY, fetchImpl: mixed, now: () => NOW })
    expect(summary).toMatchObject({ measured: 1, deferred: 1 })
  })

  it('وحسابٌ بلا رمزٍ يُؤجَّل ولا يُنادى', async () => {
    await seedPublished({ id: 'p1', platform: 'x', platformPostId: '1874', agoHours: 25 })
    db.raw.prepare(sql('DELETE FROM tokens')).run()
    const f = fakeFetch(X_OK)
    const summary = await pullDue({ db, encKey: KEY, fetchImpl: f, now: () => NOW })
    expect(summary).toMatchObject({ deferred: 1 })
    expect(f.calls).toHaveLength(0)
  })
})

describe('القراءةُ للعرض', () => {
  it('تجمع نوافذَ كلّ منشورٍ تحت معرّفه', async () => {
    await seedPublished({ id: 'p1', platform: 'x', platformPostId: '1874', agoHours: 24 * 14 })
    await pullDue({ db, encKey: KEY, fetchImpl: fakeFetch(X_OK), now: () => NOW })

    const map = await metricsFor(db, ['p1'])
    expect(map['p1']).toHaveLength(3)
  })

  it('وبلا معرّفاتٍ لا استعلام', async () => {
    expect(await metricsFor(db, [])).toEqual({})
  })

  /** التفاعلُ يتراكم، فالأوسعُ عمرا أصدقُ من الأحدث قياسا. */
  it('والأوسعُ نافذةً هو الذي يُعرَض', () => {
    const rows = WINDOWS.map((w) => ({
      window: w.name, impressions: w.hours, reactions: null,
      comments: null, shares: null, pulledAt: '',
    }))
    expect(widest(rows)!.window).toBe('7d')
    expect(widest([])).toBeNull()
  })
})

describe('صنفُ الخطأ', () => {
  it('يحمل حالتَه وأيُعاد', () => {
    const e = new MetricsError('x', 429, true)
    expect(e.name).toBe('MetricsError')
    expect(e.retryable).toBe(true)
  })
})

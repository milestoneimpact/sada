/**
 * «صحّح المنشور» (D-391): القاعدةُ حقيقيّةٌ بقيودها، والتشفيرُ حقيقيّ، والشبكةُ مُحاكاة تسجّل كلَّ نداءٍ بترتيبه.
 * ‏يُثبت هنا: لا نداءَ قبل قيد الدفتر، ولا منشورَ بلا مفتاح، ولا حذفَ ثانٍ، والنصُّ السابقُ محفوظ، والمنظّمةُ قيدٌ في كلّ قراءة.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { scopeSet } from '../oauth/scopes'
import { toBase64 } from '../crypto'
import { saveTokens, upsertAccount } from '../tokens'
import { fakeDb, type FakeDb } from '../../test/fakes'
import { correctPost, retryReplacement, correctable, readOriginal, SAY } from './correct'
import { mayDo } from '../plan/rights'

const KEY = toBase64(crypto.getRandomValues(new Uint8Array(32)))
const NOW = () => new Date('2026-11-24T09:00:00.000Z')
let db: FakeDb

interface Call { method: string; url: string; body: string | null; ledgerBefore: number }
type Reply = { status: number; json?: unknown; headers?: Record<string, string> } | 'network'

/** شبكةٌ مُحاكاة: كلُّ نداءٍ يُسجَّل ومعه عددُ قيود الدفتر لحظتَه — فيُثبت أنّ القيدَ سبقه. */
function net(replies: Reply[]): { f: typeof fetch; calls: Call[] } {
  const calls: Call[] = []
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const ledgerBefore = (db.raw.prepare('SELECT count(*) AS n FROM cost_ledger').get() as { n: number }).n
    calls.push({ method: init?.method ?? 'GET', url: String(input), body: typeof init?.body === 'string' ? init.body : null, ledgerBefore })
    const r = replies.shift() ?? { status: 500 }
    if (r === 'network') throw new TypeError('fetch failed')
    return new Response(r.json === undefined ? null : JSON.stringify(r.json), { status: r.status, headers: r.headers ?? {} })
  }) as typeof fetch
  return { f, calls }
}

async function seed(platform: 'x' | 'linkedin', org = 'org_owner', opts: { scopes?: string; expired?: boolean; remote?: string | null } = {}): Promise<string> {
  const account = await upsertAccount(db, org, { platform, kind: 'member', externalId: platform === 'x' ? '4242' : 'abc', displayName: 'عمر' })
  await saveTokens(db, KEY, account, {
    accessToken: 'live-access', refreshToken: null,
    expiresAt: opts.expired === true ? '2026-11-24T09:00:30.000Z' : '2027-01-01T00:00:00.000Z',
    refreshExpiresAt: null, scopes: opts.scopes ?? scopeSet(platform).join(' '),
  })
  const id = `0a1b2c3d-${platform === 'x' ? '0001' : '0002'}-4000-8000-00000000000${org === 'org_owner' ? '1' : '2'}`
  db.raw.prepare(`INSERT INTO posts (id, org_id, account_id, platform, type, text, scheduled_at, status, idempotency_key, approved_by, approved_at)
                  VALUES (?, ?, ?, ?, 'text', 'نصٌّ فيه خطأ', '2026-11-20 09:00:00', 'published', ?, 'omar', '2026-11-19 09:00:00')`)
    .run(id, org, account, platform, 'k-' + id)
  const remote = opts.remote === undefined ? (platform === 'x' ? '1800000000000000001' : 'urn:li:share:7000') : opts.remote
  if (remote !== null) {
    db.raw.prepare(`INSERT INTO publish_attempts (id, post_id, idempotency_key, attempt_no, request_json, status, platform_post_id, org_id) VALUES (?, ?, ?, 1, '{}', 'succeeded', ?, ?)`)
      .run(crypto.randomUUID(), id, 'k-' + id, remote, org)
  }
  return id
}

const deps = (f: typeof fetch) => ({ db, encKey: KEY, fetchImpl: f, now: NOW })
const k = () => crypto.randomUUID()
const ledger = () => db.raw.prepare('SELECT provider, operation, unit_cost, org_id FROM cost_ledger ORDER BY rowid').all() as Array<{ provider: string; operation: string; unit_cost: number; org_id: string }>

beforeEach(() => {
  db = fakeDb()
})

describe('الحقّ (mayDo)', () => {
  it('المحرّر فأعلى يصحّح المنشور وحده، والقارئ لا', () => {
    expect(mayDo('editor', 'correct', 'posted').ok).toBe(true)
    expect(mayDo('owner', 'correct', 'posted').ok).toBe(true)
    expect(mayDo('viewer', 'correct', 'posted').ok).toBe(false)
    expect(mayDo('editor', 'correct', 'scheduled').ok).toBe(false)
  })
})

describe('LinkedIn: تعديلٌ في مكانه', () => {
  it('PARTIAL_UPDATE بالنسخة المثبّتة، والدفترُ قبل النداء، والنصُّ السابقُ محفوظ', async () => {
    const id = await seed('linkedin')
    const { f, calls } = net([{ status: 204 }])
    const r = await correctPost(deps(f), 'org_owner', { postId: id, kind: 'edit', text: 'نصٌّ مصحَّح', key: k(), by: 'o@example.com' })
    expect(r.ok).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.method).toBe('POST')
    expect(calls[0]!.url).toBe('https://api.linkedin.com/rest/posts/' + encodeURIComponent('urn:li:share:7000'))
    expect(JSON.parse(calls[0]!.body!)).toEqual({ patch: { $set: { commentary: 'نصٌّ مصحَّح' } } })
    expect(calls[0]!.ledgerBefore).toBe(1)
    expect(ledger()[0]).toMatchObject({ provider: 'linkedin', operation: 'edit_post', org_id: 'org_owner' })
    const post = db.raw.prepare('SELECT text, rev, corrected_at FROM posts WHERE id = ?').get(id) as { text: string; rev: number; corrected_at: string | null }
    expect(post.text).toBe('نصٌّ مصحَّح')
    expect(post.rev).toBe(2)
    expect(post.corrected_at).not.toBeNull()
    const c = db.raw.prepare('SELECT status, old_text, new_text FROM post_corrections WHERE post_id = ?').get(id) as { status: string; old_text: string; new_text: string }
    expect(c).toEqual({ status: 'succeeded', old_text: 'نصٌّ فيه خطأ', new_text: 'نصٌّ مصحَّح' })
  })

  it('الرأسان: X-RestLi-Method وLinkedIn-Version', async () => {
    const id = await seed('linkedin')
    let headers: Headers | null = null
    const f = (async (_u: RequestInfo | URL, init?: RequestInit) => { headers = new Headers(init?.headers); return new Response(null, { status: 204 }) }) as typeof fetch
    await correctPost(deps(f), 'org_owner', { postId: id, kind: 'edit', text: 'جديد', key: k(), by: null })
    expect(headers!.get('X-RestLi-Method')).toBe('PARTIAL_UPDATE')
    expect(headers!.get('LinkedIn-Version')).toMatch(/^\d{6}$/)
  })

  it.each([
    [401, 'انتهى إذنُ الحساب'],
    [403, 'ردّت LinkedIn 403'],
    [404, 'محذوفٌ على LinkedIn'],
    [429, '429'],
    [500, 'لم يُؤكَّد'],
  ])('فشل %i يُقال بالعربيّة ولا يتغيّر النصّ', async (status, say) => {
    const id = await seed('linkedin')
    const { f } = net([{ status, json: { message: 'x' } }])
    const r = await correctPost(deps(f), 'org_owner', { postId: id, kind: 'edit', text: 'جديد', key: k(), by: null })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain(say)
    expect((db.raw.prepare('SELECT text FROM posts WHERE id = ?').get(id) as { text: string }).text).toBe('نصٌّ فيه خطأ')
    expect((db.raw.prepare('SELECT status FROM post_corrections WHERE post_id = ?').get(id) as { status: string }).status).toBe('failed')
  })

  it('انقطاعُ الشبكة: «لم يُؤكَّد»', async () => {
    const id = await seed('linkedin')
    const { f } = net(['network'])
    const r = await correctPost(deps(f), 'org_owner', { postId: id, kind: 'edit', text: 'جديد', key: k(), by: null })
    expect(!r.ok && r.reason.includes('لم يُؤكَّد')).toBe(true)
  })
})

describe('X: ردٌّ تصحيحيّ', () => {
  it('ردٌّ في in_reply_to_tweet_id، ومنشورٌ مرتبطٌ بمفتاحه، والدفترُ قبل النداء', async () => {
    const id = await seed('x')
    const { f, calls } = net([{ status: 201, json: { data: { id: '1800000000000000009' } } }])
    const r = await correctPost(deps(f), 'org_owner', { postId: id, kind: 'reply', text: 'تصحيح: الرقم 30 لا 13.', key: k(), by: 'o@example.com' })
    expect(r.ok).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe('https://api.x.com/2/tweets')
    expect(JSON.parse(calls[0]!.body!)).toEqual({ text: 'تصحيح: الرقم 30 لا 13.', reply: { in_reply_to_tweet_id: '1800000000000000001' } })
    expect(calls[0]!.ledgerBefore).toBe(1)
    expect(ledger()[0]).toMatchObject({ provider: 'x', operation: 'correction_reply', unit_cost: 0.015, org_id: 'org_owner' })
    const linked = db.raw.prepare('SELECT id, status, idempotency_key, corrects_post_id, correction_kind, org_id FROM posts WHERE corrects_post_id = ?').get(id) as Record<string, string>
    expect(linked).toMatchObject({ status: 'published', corrects_post_id: id, correction_kind: 'reply', org_id: 'org_owner' })
    expect(linked['idempotency_key']).toMatch(/^correct:reply:/)
    const att = db.raw.prepare('SELECT status, idempotency_key, platform_post_id FROM publish_attempts WHERE post_id = ?').get(linked['id']!) as Record<string, string>
    expect(att).toEqual({ status: 'succeeded', idempotency_key: linked['idempotency_key'], platform_post_id: '1800000000000000009' })
  })

  it('المفتاحُ نفسُه مرّتين: طلبٌ واحد', async () => {
    const id = await seed('x')
    const { f, calls } = net([{ status: 201, json: { data: { id: '9' } } }, { status: 201, json: { data: { id: '10' } } }])
    const key = k()
    await correctPost(deps(f), 'org_owner', { postId: id, kind: 'reply', text: 'تصحيح', key, by: null })
    const again = await correctPost(deps(f), 'org_owner', { postId: id, kind: 'reply', text: 'تصحيح', key, by: null })
    expect(calls).toHaveLength(1)
    expect(again.ok && again.duplicate).toBe(true)
  })

  it('بلا مفتاح: لا نداءَ ولا قيد', async () => {
    const id = await seed('x')
    const { f, calls } = net([])
    const r = await correctPost(deps(f), 'org_owner', { postId: id, kind: 'reply', text: 'تصحيح', key: '', by: null })
    expect(r).toEqual({ ok: false, reason: SAY.key })
    expect(calls).toHaveLength(0)
    expect(ledger()).toHaveLength(0)
  })

  it('الأصلُ محذوفٌ على X خارجيًّا: رسالةٌ واضحة', async () => {
    const id = await seed('x')
    const { f } = net([{ status: 403, json: { detail: 'You attempted to reply to a Tweet that is deleted or not visible to you.' } }])
    const r = await correctPost(deps(f), 'org_owner', { postId: id, kind: 'reply', text: 'تصحيح', key: k(), by: null })
    expect(!r.ok && r.reason.includes('حُذف خارج صدى')).toBe(true)
  })

  it('رمزٌ منتهٍ بلا تجديد: لا نداء، والحسابُ يُعلَّم', async () => {
    const id = await seed('x', 'org_owner', { expired: true })
    const { f, calls } = net([])
    const r = await correctPost(deps(f), 'org_owner', { postId: id, kind: 'reply', text: 'تصحيح', key: k(), by: null })
    expect(r).toMatchObject({ ok: false, reason: SAY.token })
    expect(calls).toHaveLength(0)
    expect(ledger()).toHaveLength(0)
  })

  it('X لا يُعدَّل في مكانه', async () => {
    const id = await seed('x')
    const { f, calls } = net([])
    const r = await correctPost(deps(f), 'org_owner', { postId: id, kind: 'edit', text: 'جديد', key: k(), by: null })
    expect(r.ok).toBe(false)
    expect(calls).toHaveLength(0)
  })
})

describe('X: احذف وأعد النشر', () => {
  it('بلا تأكيد: لا شيء يقع', async () => {
    const id = await seed('x')
    const { f, calls } = net([])
    const r = await correctPost(deps(f), 'org_owner', { postId: id, kind: 'replace', text: 'البديل', key: k(), by: null })
    expect(r).toEqual({ ok: false, reason: SAY.confirm })
    expect(calls).toHaveLength(0)
  })

  it('الحذفُ ثمّ النشرُ بمفتاحٍ جديد، وكلاهما في الدفتر قبل ندائه', async () => {
    const id = await seed('x')
    const { f, calls } = net([{ status: 200, json: { data: { deleted: true } } }, { status: 201, json: { data: { id: '77' } } }])
    const r = await correctPost(deps(f), 'org_owner', { postId: id, kind: 'replace', text: 'البديل', key: k(), confirmed: true, by: null })
    expect(r.ok).toBe(true)
    expect(calls.map((c) => c.method + ' ' + c.url)).toEqual(['DELETE https://api.x.com/2/tweets/1800000000000000001', 'POST https://api.x.com/2/tweets'])
    expect(calls[0]!.ledgerBefore).toBe(1)
    expect(calls[1]!.ledgerBefore).toBe(2)
    expect(ledger().map((l) => l.operation)).toEqual(['delete_post:price_unverified', 'correction_replace'])
    expect(JSON.parse(calls[1]!.body!)).toEqual({ text: 'البديل' })
    const orig = db.raw.prepare('SELECT platform_deleted_at FROM posts WHERE id = ?').get(id) as { platform_deleted_at: string | null }
    expect(orig.platform_deleted_at).not.toBeNull()
    const repl = db.raw.prepare('SELECT idempotency_key, status FROM posts WHERE corrects_post_id = ?').get(id) as { idempotency_key: string; status: string }
    expect(repl.status).toBe('published')
    expect(repl.idempotency_key).not.toBe('k-' + id)
    expect(correctable(await readOriginal(db, 'org_owner', id))).toEqual({ ok: false, reason: SAY.deletedHere })
  })

  it('نجح الحذفُ وفشل النشر: الحالُ «deleted»، و«أعد المحاولة» ينشر بلا حذفٍ ثانٍ وبالمفتاح نفسِه', async () => {
    const id = await seed('x')
    const first = net([{ status: 200, json: { data: { deleted: true } } }, { status: 403, json: { detail: 'duplicate content' } }])
    const r = await correctPost(deps(first.f), 'org_owner', { postId: id, kind: 'replace', text: 'البديل', key: k(), confirmed: true, by: null })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.retry).toBe(true)
    expect(r.reason).toContain('حُذف الأصلُ ولم يُنشر البديل')
    const c = db.raw.prepare('SELECT id, status FROM post_corrections WHERE post_id = ?').get(id) as { id: string; status: string }
    expect(c.status).toBe('deleted')
    const keyBefore = (db.raw.prepare('SELECT idempotency_key FROM posts WHERE corrects_post_id = ?').get(id) as { idempotency_key: string }).idempotency_key

    const second = net([{ status: 201, json: { data: { id: '88' } } }])
    const again = await retryReplacement(deps(second.f), 'org_owner', c.id)
    expect(again.ok).toBe(true)
    expect(second.calls.map((x) => x.method)).toEqual(['POST'])
    expect(second.calls[0]!.ledgerBefore).toBe(3)
    const rows = db.raw.prepare('SELECT idempotency_key, status FROM posts WHERE corrects_post_id = ?').all(id) as Array<{ idempotency_key: string; status: string }>
    expect(rows).toEqual([{ idempotency_key: keyBefore, status: 'published' }])
    expect((db.raw.prepare('SELECT status FROM post_corrections WHERE id = ?').get(c.id) as { status: string }).status).toBe('succeeded')
    // ‏ولا يُعاد ما نجح
    const third = net([])
    expect((await retryReplacement(deps(third.f), 'org_owner', c.id)).ok).toBe(false)
    expect(third.calls).toHaveLength(0)
  })

  it('فشلُ الحذف: لا نشر', async () => {
    const id = await seed('x')
    const { f, calls } = net([{ status: 403, json: { detail: 'forbidden' } }])
    const r = await correctPost(deps(f), 'org_owner', { postId: id, kind: 'replace', text: 'البديل', key: k(), confirmed: true, by: null })
    expect(!r.ok && r.reason.includes('403')).toBe(true)
    expect(calls).toHaveLength(1)
    expect(db.raw.prepare('SELECT count(*) AS n FROM posts WHERE corrects_post_id = ?').get(id)).toEqual({ n: 0 })
  })
})

describe('org_id', () => {
  it('منظّمةٌ لا تصحّح منشورَ أخرى، ولا تعيد تصحيحَها', async () => {
    const id = await seed('x', 'org_other')
    const { f, calls } = net([])
    const r = await correctPost(deps(f), 'org_owner', { postId: id, kind: 'reply', text: 'تصحيح', key: k(), by: null })
    expect(r).toEqual({ ok: false, reason: SAY.notFound })
    expect(calls).toHaveLength(0)
    expect(await readOriginal(db, 'org_owner', id)).toBeNull()
  })
})

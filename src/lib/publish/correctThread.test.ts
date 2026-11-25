/**
 * «صحّح المنشور» للسلاسل وصفحات LinkedIn (D-396): القاعدةُ حقيقيّةٌ بترحيلاتها (ومنها 0067)، والشبكةُ مُحاكاة تسجّل كلَّ نداء.
 * ‏يُثبت: الردُّ تحت آخر تغريدة، والحذفُ لكلّ تغريدةٍ مرّةً واحدة ولو أُعيد، والبديلُ سلسلة، وتعديلُ منشور الصفحة، وردُّ النطاق الناقص.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { scopeSet } from '../oauth/scopes'
import { toBase64 } from '../crypto'
import { saveTokens, upsertAccount } from '../tokens'
import { fakeDb, type FakeDb } from '../../test/fakes'
import { correctable, correctPost, linkedInAuthor, readOriginal, retryReplacement, SAY } from './correct'

const KEY = toBase64(crypto.getRandomValues(new Uint8Array(32)))
const NOW = () => new Date('2026-11-25T09:00:00.000Z')
const IDS = ['1900000000000000001', '1900000000000000002', '1900000000000000003']
let db: FakeDb

interface Call { method: string; url: string; body: string | null; ledgerBefore: number }
type Reply = { status: number; json?: unknown } | 'network'

function net(replies: Reply[]): { f: typeof fetch; calls: Call[] } {
  const calls: Call[] = []
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const ledgerBefore = (db.raw.prepare('SELECT count(*) AS n FROM cost_ledger').get() as { n: number }).n
    calls.push({ method: init?.method ?? 'GET', url: String(input), body: typeof init?.body === 'string' ? init.body : null, ledgerBefore })
    const r = replies.shift() ?? { status: 500 }
    if (r === 'network') throw new TypeError('fetch failed')
    return new Response(r.json === undefined ? null : JSON.stringify(r.json), { status: r.status })
  }) as typeof fetch
  return { f, calls }
}

async function seedThread(): Promise<string> {
  const account = await upsertAccount(db, 'org_owner', { platform: 'x', kind: 'member', externalId: '4242', displayName: 'عمر' })
  await saveTokens(db, KEY, account, { accessToken: 'live-access', refreshToken: null, expiresAt: '2027-01-01T00:00:00.000Z', refreshExpiresAt: null, scopes: scopeSet('x').join(' ') })
  const id = '0a1b2c3d-0003-4000-8000-000000000001'
  db.raw.prepare(`INSERT INTO posts (id, org_id, account_id, platform, type, text, scheduled_at, status, idempotency_key, approved_by, approved_at)
                  VALUES (?, 'org_owner', ?, 'x', 'thread', ?, '2026-11-20 09:00:00', 'published', ?, 'omar', '2026-11-19 09:00:00')`)
    .run(id, account, 'أوّلٌ\n---\nثانٍ فيه خطأ\n---\nثالث', 'k-' + id)
  db.raw.prepare(`INSERT INTO publish_attempts (id, post_id, idempotency_key, attempt_no, request_json, response_json, status, platform_post_id, org_id)
                  VALUES (?, ?, ?, 1, '{"thread":3}', ?, 'succeeded', ?, 'org_owner')`)
    .run(crypto.randomUUID(), id, 'k-' + id, JSON.stringify({ thread: IDS }), IDS[0]!)
  return id
}

async function seedPage(scopes: string): Promise<string> {
  const account = await upsertAccount(db, 'org_owner', { platform: 'linkedin', kind: 'org', externalId: '98765', displayName: 'صفحة الشركة' })
  await saveTokens(db, KEY, account, { accessToken: 'live-access', refreshToken: null, expiresAt: '2027-01-01T00:00:00.000Z', refreshExpiresAt: null, scopes })
  const id = '0a1b2c3d-0004-4000-8000-000000000001'
  db.raw.prepare(`INSERT INTO posts (id, org_id, account_id, platform, type, text, scheduled_at, status, idempotency_key, approved_by, approved_at)
                  VALUES (?, 'org_owner', ?, 'linkedin', 'text', 'نصُّ الصفحة فيه خطأ', '2026-11-20 09:00:00', 'published', ?, 'omar', '2026-11-19 09:00:00')`)
    .run(id, account, 'k-' + id)
  db.raw.prepare(`INSERT INTO publish_attempts (id, post_id, idempotency_key, attempt_no, request_json, status, platform_post_id, org_id) VALUES (?, ?, ?, 1, '{}', 'succeeded', 'urn:li:share:8000', 'org_owner')`)
    .run(crypto.randomUUID(), id, 'k-' + id)
  return id
}

const deps = (f: typeof fetch) => ({ db, encKey: KEY, fetchImpl: f, now: NOW })
const k = () => crypto.randomUUID()
const deletes = (calls: Call[]) => calls.filter((c) => c.method === 'DELETE').map((c) => c.url.split('/').pop())
const ok = (id: string): Reply => ({ status: 201, json: { data: { id } } })
const gone: Reply = { status: 200, json: { data: { deleted: true } } }

beforeEach(() => {
  db = fakeDb()
})

describe('سلسلة X: ردٌّ تصحيحيّ تحت آخر تغريدة', () => {
  it('تُصحَّح، والردُّ في in_reply_to_tweet_id بآخر معرّف، والدفترُ قبله', async () => {
    const id = await seedThread()
    expect(correctable(await readOriginal(db, 'org_owner', id))).toEqual({ ok: true })
    const { f, calls } = net([ok('1900000000000000009')])
    const r = await correctPost(deps(f), 'org_owner', { postId: id, kind: 'reply', text: 'تصحيح: الرقم 30.', key: k(), by: null })
    expect(r.ok).toBe(true)
    expect(calls).toHaveLength(1)
    expect(JSON.parse(calls[0]!.body!)).toEqual({ text: 'تصحيح: الرقم 30.', reply: { in_reply_to_tweet_id: IDS[2] } })
    expect(calls[0]!.ledgerBefore).toBe(1)
  })

  it('ردٌّ فيه «---» يُردّ بلا نداء', async () => {
    const id = await seedThread()
    const { f, calls } = net([])
    const r = await correctPost(deps(f), 'org_owner', { postId: id, kind: 'reply', text: 'أ\n---\nب', key: k(), by: null })
    expect(r).toEqual({ ok: false, reason: SAY.threadReply })
    expect(calls).toHaveLength(0)
  })

  it('سلسلةٌ بلا معرّفاتها المحفوظة تُردّ بسببها', async () => {
    const id = await seedThread()
    db.raw.prepare(`UPDATE publish_attempts SET response_json = '{}' WHERE post_id = ?`).run(id)
    expect(correctable(await readOriginal(db, 'org_owner', id))).toEqual({ ok: false, reason: SAY.thread })
  })
})

describe('سلسلة X: احذف وأعد النشر', () => {
  it('يحذف التغريداتِ الثلاث من الآخر، كلٌّ بقيدٍ قبله، ثمّ ينشر البديلَ سلسلةً بتغريداتها', async () => {
    const id = await seedThread()
    const { f, calls } = net([gone, gone, gone, ok('31'), ok('32')])
    const r = await correctPost(deps(f), 'org_owner', { postId: id, kind: 'replace', text: 'أوّلٌ مصحَّح\n---\nثانٍ مصحَّح', key: k(), confirmed: true, by: null })
    expect(r.ok).toBe(true)
    expect(deletes(calls)).toEqual([IDS[2], IDS[1], IDS[0]])
    calls.forEach((c, i) => expect(c.ledgerBefore).toBe(i + 1))
    expect(JSON.parse(calls[4]!.body!)).toMatchObject({ text: 'ثانٍ مصحَّح', reply: { in_reply_to_tweet_id: '31' } })
    const repl = db.raw.prepare('SELECT type, status FROM posts WHERE corrects_post_id = ?').get(id)
    expect(repl).toEqual({ type: 'thread', status: 'published' })
  })

  it('انقطع الحذفُ في المنتصف: التصحيحُ التالي لا يحذف ما حُذف', async () => {
    const id = await seedThread()
    const first = net([gone, { status: 503, json: { detail: 'busy' } }])
    const r = await correctPost(deps(first.f), 'org_owner', { postId: id, kind: 'replace', text: 'بديلٌ\n---\nثانٍ', key: k(), confirmed: true, by: null })
    expect(r.ok).toBe(false)
    expect(deletes(first.calls)).toEqual([IDS[2], IDS[1]])
    if (!r.ok) expect(r.reason).toContain('حُذف 1 من 3')

    const second = net([gone, gone, ok('41'), ok('42')])
    const again = await correctPost(deps(second.f), 'org_owner', { postId: id, kind: 'replace', text: 'بديلٌ\n---\nثانٍ', key: k(), confirmed: true, by: null })
    expect(again.ok).toBe(true)
    expect(deletes(second.calls)).toEqual([IDS[1], IDS[0]])
  })

  it('نجح الحذفُ وفشل النشرُ في التغريدة الثانية: «أعد المحاولة» بلا حذفٍ ولا إعادةِ الأولى', async () => {
    const id = await seedThread()
    const first = net([gone, gone, gone, ok('51'), { status: 403, json: { detail: 'duplicate content' } }])
    const r = await correctPost(deps(first.f), 'org_owner', { postId: id, kind: 'replace', text: 'بديلٌ\n---\nثانٍ', key: k(), confirmed: true, by: null })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.retry).toBe(true)
    const c = db.raw.prepare('SELECT id, status FROM post_corrections WHERE post_id = ?').get(id) as { id: string; status: string }
    expect(c.status).toBe('deleted')

    const second = net([ok('52')])
    const again = await retryReplacement(deps(second.f), 'org_owner', c.id)
    expect(again.ok).toBe(true)
    expect(deletes(second.calls)).toEqual([])
    expect(second.calls).toHaveLength(1)
    expect(JSON.parse(second.calls[0]!.body!)).toMatchObject({ text: 'ثانٍ', reply: { in_reply_to_tweet_id: '51' } })
    expect((db.raw.prepare('SELECT status FROM post_corrections WHERE id = ?').get(c.id) as { status: string }).status).toBe('succeeded')
  })
})

describe('صفحة LinkedIn', () => {
  it('مؤلّفُها urn:li:organization، وPARTIAL_UPDATE يعدّلها بالنطاق', async () => {
    const id = await seedPage([...scopeSet('linkedin'), 'w_organization_social'].join(' '))
    const o = await readOriginal(db, 'org_owner', id)
    expect(linkedInAuthor(o!)).toBe('urn:li:organization:98765')
    const { f, calls } = net([{ status: 204 }])
    const r = await correctPost(deps(f), 'org_owner', { postId: id, kind: 'edit', text: 'نصُّ الصفحة مصحَّحًا', key: k(), by: null })
    expect(r.ok).toBe(true)
    expect(calls[0]!.url).toBe('https://api.linkedin.com/rest/posts/' + encodeURIComponent('urn:li:share:8000'))
    expect(calls[0]!.ledgerBefore).toBe(1)
    expect((db.raw.prepare('SELECT text FROM posts WHERE id = ?').get(id) as { text: string }).text).toBe('نصُّ الصفحة مصحَّحًا')
  })

  it('بلا w_organization_social: سببٌ يسمّي النطاقَ وما يُعاد ربطُه، ولا نداءَ ولا قيد', async () => {
    const id = await seedPage(scopeSet('linkedin').join(' '))
    const { f, calls } = net([])
    const r = await correctPost(deps(f), 'org_owner', { postId: id, kind: 'edit', text: 'جديد', key: k(), by: null })
    expect(r).toMatchObject({ ok: false, reason: SAY.pageScope })
    expect(SAY.pageScope).toContain('w_organization_social')
    expect(SAY.pageScope).toContain('أعد ربط الصفحة')
    expect(calls).toHaveLength(0)
    expect(db.raw.prepare('SELECT count(*) AS n FROM cost_ledger').get()).toEqual({ n: 0 })
  })
})

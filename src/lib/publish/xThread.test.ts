/**
 * ‏**سلسلةُ X تُنشَر تغريدةً تغريدة** (D-324): كلٌّ ردٌّ على التي قبلها، ولكلٍّ مفتاحُها (D-004) وصفُّها في الدفتر قبل
 * ‏أن تُعدّ (D-008)، **وما نجح لا يُرسَل ثانيةً أبدًا** — الإعادةُ تبدأ من أوّل ما لم ينجح.
 *
 * ‏كان الناشرُ يرسل نصَّ X كلَّه تغريدةً واحدة: سلسلةٌ من ثلاثٍ تُردّ «النصّ أطول من 280»، أو تخرج تغريدةً بفواصلها.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { scopeSet } from '../oauth/scopes'
import { toBase64 } from '../crypto'
import { saveTokens, upsertAccount } from '../tokens'
import { X } from '../oauth/providers'
import { fakeDb, type FakeDb } from '../../test/fakes'
import { publishPost } from './publisher'
import { requeue } from '../schedule/job'

const KEY = toBase64(crypto.getRandomValues(new Uint8Array(32)))
const NOW = () => new Date('2026-09-08T09:00:00.000Z')
const THREAD = 'الأولى: الحوكمة لا تبطئ القرار.\n---\nالثانية: بل تحميه من العجلة.\n---\nالثالثة: فاسأل قبل أن تقرّر.'

let db: FakeDb

async function seedThread(text = THREAD): Promise<string> {
  const accountId = await upsertAccount(db, 'org_owner', { platform: 'x', kind: 'member', externalId: '4242', displayName: 'عمر' })
  await saveTokens(db, KEY, accountId, {
    accessToken: 'live-access', refreshToken: null, expiresAt: '2026-11-02T10:00:00.000Z', refreshExpiresAt: null,
    scopes: scopeSet('x').join(' '),
  })
  db.raw.prepare(
    `INSERT INTO posts (id, account_id, platform, type, text, scheduled_at, status, idempotency_key, approved_by, approved_at)
     VALUES ('p-t', ?, 'x', 'thread', ?, '2026-09-08 09:00:00', 'queued', 'own:abc:x', 'omar', '2026-09-07 10:00:00')`,
  ).run(accountId, text)
  return 'p-t'
}

interface Sent { readonly text: string; readonly reply: string | null }

/** ‏X مزيَّفةٌ بتسلسل: كلُّ تغريدةٍ بمعرّفٍ جديد، و`fail` يردّ الطلبَ الذي رقمُه فيها بحالته. */
function x(fail: Readonly<Record<number, number>> = {}, start = 1) {
  const sent: Sent[] = []
  let n = start - 1
  const impl = (async (url: string, init?: RequestInit) => {
    if (url !== X.postUrl) throw new Error(`نداء غير متوقّع: ${url}`)
    const body = JSON.parse(String(init?.body)) as { text: string; reply?: { in_reply_to_tweet_id: string } }
    sent.push({ text: body.text, reply: body.reply?.in_reply_to_tweet_id ?? null })
    const status = fail[sent.length]
    if (status !== undefined) return Response.json({ title: status === 429 ? 'Too Many Requests' : 'Invalid Request' }, { status })
    n += 1
    return Response.json({ data: { id: `tw-${n}` } })
  }) as unknown as typeof fetch
  return { impl, sent }
}

const deps = (fetchImpl: typeof fetch) => ({ db, encKey: KEY, fetchImpl, now: NOW })

/** علاماتُ التغريدات في آخر محاولةٍ للمنشور — مفتاحٌ وحالٌ ومعرّفٌ لكلٍّ. */
const items = () => {
  const row = db.raw.prepare("SELECT request_json FROM publish_attempts WHERE post_id = 'p-t' ORDER BY attempt_no DESC LIMIT 1").get() as { request_json: string } | undefined
  const marks = (JSON.parse(row?.request_json ?? '{}') as { tweets?: { no: number; key: string; status: string; id?: string }[] }).tweets ?? []
  return marks.map((m) => ({ item_no: m.no, idempotency_key: m.key, status: m.status, platform_post_id: m.id ?? null }))
}
const ledger = () => (db.raw.prepare("SELECT COUNT(*) AS n, coalesce(sum(total), 0) AS total FROM cost_ledger WHERE provider = 'x'").get() as { n: number; total: number })

beforeEach(() => {
  db = fakeDb()
})

describe('سلسلة X', () => {
  it('ثلاثُ تغريداتٍ بترتيبها، كلٌّ ردٌّ على التي قبلها، ومفتاحٌ وصفُّ كلفةٍ لكلٍّ', async () => {
    const id = await seedThread()
    const net = x()
    const out = await publishPost(deps(net.impl), { postId: id })
    expect(out).toEqual({ kind: 'published', platformPostId: 'tw-1' })
    expect(net.sent).toEqual([
      { text: 'الأولى: الحوكمة لا تبطئ القرار.', reply: null },
      { text: 'الثانية: بل تحميه من العجلة.', reply: 'tw-1' },
      { text: 'الثالثة: فاسأل قبل أن تقرّر.', reply: 'tw-2' },
    ])
    expect(items()).toEqual([
      { item_no: 1, idempotency_key: 'own:abc:x#1', status: 'succeeded', platform_post_id: 'tw-1' },
      { item_no: 2, idempotency_key: 'own:abc:x#2', status: 'succeeded', platform_post_id: 'tw-2' },
      { item_no: 3, idempotency_key: 'own:abc:x#3', status: 'succeeded', platform_post_id: 'tw-3' },
    ])
    expect(ledger().n).toBe(3)
    expect(ledger().total).toBeCloseTo(0.045)
    // ‏وللمنشور محاولتُه الواحدة: التقاريرُ تعدّه منشورًا واحدًا لا ثلاثة
    const attempts = db.raw.prepare("SELECT status, platform_post_id FROM publish_attempts WHERE post_id = 'p-t'").all()
    expect(attempts).toEqual([{ status: 'succeeded', platform_post_id: 'tw-1' }])
    expect((db.raw.prepare("SELECT status FROM posts WHERE id = 'p-t'").get() as { status: string }).status).toBe('published')
  })

  it('رفضٌ في الثانية يوقفها وكلفتُها مسجّلة — و«أعده» يكمل منها ولا يعيد الأولى', async () => {
    const id = await seedThread()
    const first = x({ 2: 400 })
    const out = await publishPost(deps(first.impl), { postId: id })
    expect(out.kind).toBe('failed')
    if (out.kind === 'failed') {
      expect(out.retryable).toBe(false)
      expect(out.reason).toContain('التغريدة 2 من 3')
      expect(out.reason).toContain('نُشرت قبلها 1')
    }
    expect(first.sent).toHaveLength(2)
    expect(ledger().n).toBe(2)
    expect(items().map((r) => r.status)).toEqual(['succeeded', 'failed'])
    expect((db.raw.prepare("SELECT status FROM posts WHERE id = 'p-t'").get() as { status: string }).status).toBe('failed')

    // ‏«أعده» ثمّ موعدٌ جديد — كما يفعل المالك
    expect((await requeue(db, id, NOW(), 'org_owner')).ok).toBe(true)
    db.raw.prepare("UPDATE posts SET status = 'queued', account_id = (SELECT id FROM accounts LIMIT 1), scheduled_at = '2026-09-08 10:00:00' WHERE id = 'p-t'").run()
    const second = x({}, 2)
    const again = await publishPost(deps(second.impl), { postId: id })
    expect(again).toEqual({ kind: 'published', platformPostId: 'tw-1' })
    expect(second.sent).toEqual([
      { text: 'الثانية: بل تحميه من العجلة.', reply: 'tw-1' },
      { text: 'الثالثة: فاسأل قبل أن تقرّر.', reply: 'tw-2' },
    ])
    expect(ledger().n).toBe(4)
    expect(items().map((r) => r.status)).toEqual(['succeeded', 'succeeded', 'succeeded'])
  })

  it('و429 في الثالثة يُعاد من الطابور وحده: تبقى مجدولة، والإعادةُ ترسل الثالثةَ وحدها', async () => {
    const id = await seedThread()
    const first = x({ 3: 429 })
    const out = await publishPost(deps(first.impl), { postId: id })
    expect(out).toMatchObject({ kind: 'failed', retryable: true })
    expect((db.raw.prepare("SELECT status FROM posts WHERE id = 'p-t'").get() as { status: string }).status).toBe('queued')
    const retry = x({}, 3)
    expect(await publishPost(deps(retry.impl), { postId: id })).toEqual({ kind: 'published', platformPostId: 'tw-1' })
    expect(retry.sent).toEqual([{ text: 'الثالثة: فاسأل قبل أن تقرّر.', reply: 'tw-2' }])
  })

  it('ونصٌّ تبدّل بعد أن نُشر بعضُه لا يُخلَط: يُقال، ولا يُرسَل شيء', async () => {
    const id = await seedThread()
    await publishPost(deps(x({ 2: 400 }).impl), { postId: id })
    await requeue(db, id, NOW(), 'org_owner')
    db.raw.prepare(`UPDATE posts SET status = 'queued', text = ?, account_id = (SELECT id FROM accounts LIMIT 1),
      scheduled_at = '2026-09-08 10:00:00' WHERE id = 'p-t'`).run(THREAD.replace('الأولى', 'البداية'))
    const net = x()
    const out = await publishPost(deps(net.impl), { postId: id })
    expect(net.sent).toHaveLength(0)
    expect(out.kind).toBe('failed')
    if (out.kind === 'failed') expect(out.reason).toMatch(/^thread_changed/)
  })

  it('وتغريدةٌ واحدةٌ بلا فاصلٍ تُنشَر كما كانت: لا صفَّ تغريدات، وكلفةٌ واحدة', async () => {
    const id = await seedThread('تغريدة واحدة بلا فاصل، كما كانت قبل السلاسل.')
    const net = x()
    expect(await publishPost(deps(net.impl), { postId: id })).toEqual({ kind: 'published', platformPostId: 'tw-1' })
    expect(net.sent).toEqual([{ text: 'تغريدة واحدة بلا فاصل، كما كانت قبل السلاسل.', reply: null }])
    expect(items()).toEqual([])
    expect(ledger().n).toBe(1)
  })
})

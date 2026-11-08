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
import { requeue, schedulePost } from '../schedule/job'
import { settleTweet } from './xThread'

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

/**
 * ‏**مراجعة D-324: تغريدةٌ لم يُعرَف جوابُها لا تُعاد وحدَها** (D-269). كانت المهلةُ وانقطاعُ الشبكة و5xx وجوابٌ بلا `data.id`
 * ‏تُعلَّم `failed` ويُقال «لم تُنشَر … والإعادةُ تُكمل منها»، فيرسل «أعده» تغريدةً قد تكون على X فتتكرّر وتُدفع مرّتين.
 */
describe('سلسلة X: ما لم يُعرَف جوابُه (مراجعة D-324)', () => {
  /** ‏X مزيَّفةٌ تنشر ثمّ ترمي في الطلب الذي رقمُه `at` — كأنّ الجوابَ ضاع بعد أن نُشرت. */
  function lost(at: number, how: 'timeout' | 'network' | 503 | 'no-id') {
    const sent: Sent[] = []
    const impl = (async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { text: string; reply?: { in_reply_to_tweet_id: string } }
      sent.push({ text: body.text, reply: body.reply?.in_reply_to_tweet_id ?? null })
      if (sent.length === at) {
        if (how === 'timeout') throw new DOMException('The operation timed out.', 'TimeoutError')
        if (how === 'network') throw new TypeError('network connection lost')
        if (how === 503) return Response.json({ title: 'Service Unavailable' }, { status: 503 })
        return Response.json({ data: {} })
      }
      return Response.json({ data: { id: `tw-${sent.length}` } })
    }) as unknown as typeof fetch
    return { impl, sent }
  }

  for (const how of ['timeout', 'network', 503, 'no-id'] as const) {
    it(`${String(how)} في الثانية: تبقى «أُرسلت»، والسببُ «لم يُؤكَّد» لا «لم تُنشَر»، و«أعده» يُردّ حتّى تقول ما وجدت`, async () => {
      const id = await seedThread()
      const out = await publishPost(deps(lost(2, how).impl), { postId: id })
      expect(out.kind).toBe('failed')
      if (out.kind === 'failed') {
        expect(out.retryable).toBe(false)
        expect(out.reason).toMatch(/^thread_unconfirmed: التغريدة 2 من 3/)
        expect(out.reason).not.toContain('لم تُنشَر')
      }
      expect(items().map((r) => r.status)).toEqual(['succeeded', 'sent'])
      const again = await requeue(db, id, NOW(), 'org_owner')
      expect(again.ok).toBe(false)
      if (!again.ok) expect(again.reason).toContain('التغريدة 2')
    })
  }

  it('«لم أجدها على X»: تُعلَّم فاشلةً بيد المالك، ثمّ «أعده» يكمل منها وحدها', async () => {
    const id = await seedThread()
    await publishPost(deps(lost(2, 'timeout').impl), { postId: id })
    expect(await settleTweet(db, 'org_owner', id, null)).toEqual({ ok: true, no: 2 })
    expect((await requeue(db, id, NOW(), 'org_owner')).ok).toBe(true)
    db.raw.prepare("UPDATE posts SET status = 'queued', account_id = (SELECT id FROM accounts LIMIT 1), scheduled_at = '2026-09-08 10:00:00' WHERE id = 'p-t'").run()
    const net = x({}, 2)
    expect(await publishPost(deps(net.impl), { postId: id })).toEqual({ kind: 'published', platformPostId: 'tw-1' })
    expect(net.sent).toEqual([
      { text: 'الثانية: بل تحميه من العجلة.', reply: 'tw-1' },
      { text: 'الثالثة: فاسأل قبل أن تقرّر.', reply: 'tw-2' },
    ])
  })

  it('«وجدتُها» برابطها: تُعلَّم ناجحةً بمعرّفها، فالإعادةُ لا ترسلها وتردّ الثالثةَ عليها', async () => {
    const id = await seedThread()
    await publishPost(deps(lost(2, 503).impl), { postId: id })
    expect(await settleTweet(db, 'org_owner', id, { link: 'https://x.com/omar/status/1890000000000000002?s=20' })).toEqual({ ok: true, no: 2 })
    expect((await requeue(db, id, NOW(), 'org_owner')).ok).toBe(true)
    db.raw.prepare("UPDATE posts SET status = 'queued', account_id = (SELECT id FROM accounts LIMIT 1), scheduled_at = '2026-09-08 10:00:00' WHERE id = 'p-t'").run()
    const net = x({}, 3)
    expect(await publishPost(deps(net.impl), { postId: id })).toEqual({ kind: 'published', platformPostId: 'tw-1' })
    expect(net.sent).toEqual([{ text: 'الثالثة: فاسأل قبل أن تقرّر.', reply: '1890000000000000002' }])
  })

  it('ورابطٌ لا يُقرأ معرّفُه يُردّ ولا يغيّر شيئًا، ولا تسويةَ لمنشورٍ لا تغريدةَ معلّقةً فيه', async () => {
    const id = await seedThread()
    await publishPost(deps(lost(2, 'network').impl), { postId: id })
    const bad = await settleTweet(db, 'org_owner', id, { link: 'https://example.com/omar' })
    expect(bad.ok).toBe(false)
    expect(items().map((r) => r.status)).toEqual(['succeeded', 'sent'])
    expect((await settleTweet(db, 'org_other', id, null)).ok).toBe(false)
    expect((await settleTweet(db, 'org_owner', id, null)).ok).toBe(true)
    expect((await settleTweet(db, 'org_owner', id, null)).ok).toBe(false)
  })

  it('وتحديثُ العلامة بعد نجاحٍ إن سقط: «لم يُؤكَّد» بمعرّفها، لا «أعده» يعيدها', async () => {
    const id = await seedThread()
    // ‏القاعدةُ تسقط عند كتابة علامة الثانية ناجحةً — الثالثةُ من نداءات `request_json` لهذه المحاولة
    const realPrepare = db.prepare.bind(db)
    let writes = 0
    db.prepare = ((query: string) => {
      if (query.includes('SET request_json')) {
        writes += 1
        if (writes === 4) throw new Error('D1_ERROR: network connection lost')
      }
      return realPrepare(query)
    }) as typeof db.prepare
    const out = await publishPost(deps(x().impl), { postId: id })
    db.prepare = realPrepare
    expect(out.kind).toBe('failed')
    if (out.kind === 'failed') expect(out.reason).toMatch(/^thread_unconfirmed: التغريدة 2 من 3/)
    expect((await requeue(db, id, NOW(), 'org_owner')).ok).toBe(false)
  })
})

/** ‏**والسلسلةُ تُكمَل من الحساب الذي بدأها** (مراجعة D-324): «أعده» يمحو الحساب، وجدولتُها على حسابٍ آخر كانت تشقّها بين حسابين. */
describe('سلسلة X على حسابٍ آخر (مراجعة D-324)', () => {
  it('تُردّ الجدولةُ على حسابٍ غيرِ الذي نشر أوّلَها، والنشرُ إن وصل يُردّ thread_account ولا يُرسَل شيء', async () => {
    const id = await seedThread()
    await publishPost(deps(x({ 2: 400 }).impl), { postId: id })
    expect((await requeue(db, id, NOW(), 'org_owner')).ok).toBe(true)
    const other = await upsertAccount(db, 'org_owner', { platform: 'x', kind: 'member', externalId: '9999', displayName: 'حسابٌ آخر' })
    await saveTokens(db, KEY, other, {
      accessToken: 'other-access', refreshToken: null, expiresAt: '2026-11-02T10:00:00.000Z', refreshExpiresAt: null,
      scopes: scopeSet('x').join(' '),
    })
    const refused = await schedulePost(db, id, other, '2026-09-08T12:00', NOW(), 'org_owner')
    expect(refused.ok).toBe(false)
    if (!refused.ok) expect(refused.reason).toContain('عمر')
    // ‏ولو وصلت إلى الناشر من طريقٍ آخر: لا تغريدةَ من الحساب الآخر
    db.raw.prepare("UPDATE posts SET status = 'queued', account_id = ?, scheduled_at = '2026-09-08 10:00:00' WHERE id = 'p-t'").run(other)
    const net = x({}, 2)
    const out = await publishPost(deps(net.impl), { postId: id })
    expect(net.sent).toHaveLength(0)
    expect(out.kind).toBe('failed')
    if (out.kind === 'failed') expect(out.reason).toMatch(/^thread_account/)
    // ‏وعلى حسابها تُجدوَل
    const own = (db.raw.prepare("SELECT id FROM accounts WHERE external_id = '4242'").get() as { id: string }).id
    expect((await requeue(db, id, NOW(), 'org_owner')).ok).toBe(true)
    expect((await schedulePost(db, id, own, '2026-09-08T12:00', NOW(), 'org_owner')).ok).toBe(true)
  })
})

/** ‏**والنوعُ المعتمَد هو الحَكَم** (مراجعة D-324): منشورُ X اعتُمد تغريدةً واحدةً قبل السلاسل وفي نصّه سطر `---` لا يُشقّ. */
describe('سلسلة X: النوعُ لا النصّ (مراجعة D-324)', () => {
  it('نوعُه text وفي نصّه سطرُ الفاصل، فتغريدةٌ واحدة وصفٌّ واحدٌ في الدفتر', async () => {
    const id = await seedThread('عنوان قبل الفاصل.\n---\nسطر بعد الفاصل.')
    db.raw.prepare("UPDATE posts SET type = 'text' WHERE id = 'p-t'").run()
    const net = x()
    expect(await publishPost(deps(net.impl), { postId: id })).toEqual({ kind: 'published', platformPostId: 'tw-1' })
    expect(net.sent).toEqual([{ text: 'عنوان قبل الفاصل.\n---\nسطر بعد الفاصل.', reply: null }])
    expect(ledger().n).toBe(1)
  })
})

/**
 * ‏**تحقّق D-320 على main: عطلُ D1 قبل إرسال تغريدةٍ لم يُرسِل شيئًا، فيُعاد من الطابور.** كانت علامتُها تُحفَظ `sent` ثمّ
 * ‏يُكتب الدفتر، فسقوطُ الدفتر يرمي خطأً عاديًّا يصنّفه الناشرُ «unconfirmed_send» نهائيًّا، و«أعده» يُردّ حتّى يسوّي المالكُ
 * ‏تغريدةً لم تبلغ X قطّ. والتغريدةُ الواحدةُ في الحال نفسِها `pre_send` تُعاد.
 */
describe('سلسلة X: عطلُ القاعدة قبل الإرسال (تحقّق D-320 على main)', () => {
  /** ‏القاعدةُ تسقط مرّةً في الاستعلام رقم `at` ممّا يطابق `pattern`، وما سواه يمضي. */
  function blip(pattern: RegExp, at: number): () => void {
    const realPrepare = db.prepare.bind(db)
    let seen = 0
    db.prepare = ((query: string) => {
      if (pattern.test(query)) {
        seen += 1
        if (seen === at) throw new Error('D1_ERROR: Network connection lost.')
      }
      return realPrepare(query)
    }) as typeof db.prepare
    return () => { db.prepare = realPrepare }
  }
  const status = () => (db.raw.prepare("SELECT status FROM posts WHERE id = 'p-t'").get() as { status: string }).status

  for (const [what, pattern, at, no] of [
    ['الدفترُ يسقط عند الأولى', /INSERT INTO cost_ledger/, 1, 1],
    ['الدفترُ يسقط عند الثانية', /INSERT INTO cost_ledger/, 2, 2],
    // ‏كتاباتُ العلامة: ١ «أُرسلت» للأولى، ٢ «نجحت» لها، ٣ «أُرسلت» للثانية
    ['علامةُ «أُرسلت» للثانية لا تُحفَظ', /SET request_json/, 3, 2],
  ] as const) {
    it(`${what}: لا يُرسَل منها شيء، والمنشورُ يبقى مجدولًا يعيده الطابور، والإعادةُ تكمل منها`, async () => {
      const id = await seedThread()
      const net = x()
      const restore = blip(pattern, at)
      const out = await publishPost(deps(net.impl), { postId: id })
      restore()
      expect(out.kind).toBe('failed')
      if (out.kind === 'failed') {
        expect(out.retryable).toBe(true)
        expect(out.reason).toMatch(new RegExp(`^pre_send: التغريدة ${no} من 3`))
      }
      // ‏ما قبلها أُرسل مرّةً، وهي لم تُرسَل
      expect(net.sent).toHaveLength(no - 1)
      expect(status()).toBe('queued')
      expect(items().filter((m) => m.status === 'sent')).toEqual([])

      const retry = x({}, no)
      expect(await publishPost(deps(retry.impl), { postId: id })).toEqual({ kind: 'published', platformPostId: 'tw-1' })
      // ‏والإعادةُ ترسل من التي لم تُرسَل، ولا تُرسَل تغريدةٌ مرّتين
      expect([...net.sent, ...retry.sent].map((s) => s.text)).toEqual(THREAD.split('\n---\n'))
      // ‏وكلُّ ما أُرسل في الدفتر (D-008)، ولا أقلّ
      expect(ledger().n).toBeGreaterThanOrEqual(3)
    })
  }
})

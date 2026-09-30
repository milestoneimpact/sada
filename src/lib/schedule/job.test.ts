/**
 * الجدولةُ والإرسال — **والحارسُ هو ما يُختبَر لا المسار الناجح.**
 *
 * منشورٌ يُجدول إلى حسابٍ من منصّةٍ أخرى، أو إلى قناةٍ إذنُها منتهٍ، أو
 * بموعدٍ مضى — ثلاثةٌ تنجح صامتةً ثمّ تفشل بعد أيّام في الطابور، حيث
 * لا أحد ينظر. فتُمنع هنا، ويُقطع منعُها.
 *
 * والقاعدةُ حقيقيّةٌ في كلّ ما يلي، فقيودُ `posts` الثلاثة تُقطَع فعلا.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { fakeDb, type FakeDb } from '../../test/fakes'
import {
  dbNow, dispatchDue, dueNow, markDispatched, parseWhen, requeue, schedulePost, unschedule,
} from './job'
import { writeSetting } from '../settings'

let db: FakeDb

const NOW = new Date('2026-09-08T08:00:00Z')
const SOON = '2026-09-08T09:00'
const PAST = '2026-09-08T07:00'

/** طابورٌ مزيَّف يحفظ ما أُرسل إليه. */
function fakeQueue() {
  const sent: string[] = []
  return {
    sent,
    async sendBatch(messages: { body: { postId: string } }[]) {
      for (const m of messages) sent.push(m.body.postId)
    },
  }
}

async function seedAccount(options: {
  platform?: 'linkedin' | 'x'
  status?: string
  name?: string
} = {}): Promise<string> {
  const id = crypto.randomUUID()
  await db
    .prepare(
      'INSERT INTO accounts (id, platform, kind, external_id, display_name, status) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .bind(
      id,
      options.platform ?? 'linkedin',
      'member',
      id.slice(0, 8),
      options.name ?? 'عمر',
      options.status ?? 'active',
    )
    .run()
  return id
}

async function seedPost(options: {
  platform?: 'linkedin' | 'x'
  status?: string
  approved?: boolean
} = {}): Promise<string> {
  const id = crypto.randomUUID()
  const approved = options.approved ?? true
  await db
    .prepare(
      `INSERT INTO posts (id, platform, type, text, status, idempotency_key, approved_by, approved_at)
       VALUES (?, ?, 'text', ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      options.platform ?? 'linkedin',
      'ن'.repeat(300),
      options.status ?? 'approved',
      `k-${id}`,
      approved ? 'panel:passkey' : null,
      approved ? '2026-09-08T07:00:00Z' : null,
    )
    .run()
  return id
}

async function readPost(id: string): Promise<Record<string, unknown> | null> {
  return db
    .prepare('SELECT status, account_id, scheduled_at, dispatched_at FROM posts WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>()
}

beforeEach(() => {
  db = fakeDb()
})

describe('قراءةُ الموعد', () => {
  it('تقرأ صيغة datetime-local وتحوّلها إلى صيغة القاعدة', () => {
    expect(parseWhen('2026-09-08T09:00')).toBe('2026-09-08 09:00:00')
    expect(parseWhen('2026-09-08T09:00:30')).toBe('2026-09-08 09:00:30')
  })

  it('تردّ ما ليس موعدا ولا تخمّنه', () => {
    for (const bad of ['', 'غدا', '2026-09-08', '08/09/2026 09:00', '2026-13-40T99:99']) {
      expect(parseWhen(bad)).toBeNull()
    }
  })

  it('صيغةُ «الآن» هي صيغةُ القاعدة نفسها — فالمقارنةُ النصّيّة تصحّ', () => {
    expect(dbNow(NOW)).toBe('2026-09-08 08:00:00')
    expect(parseWhen(SOON)! > dbNow(NOW)).toBe(true)
    expect(parseWhen(PAST)! > dbNow(NOW)).toBe(false)
  })
})

describe('الجدولة', () => {
  it('تكتب الحساب والموعد وتحوّل الحال إلى queued', async () => {
    const post = await seedPost()
    const account = await seedAccount()
    const out = await schedulePost(db, post, account, SOON, NOW)

    expect(out.ok).toBe(true)
    const row = await readPost(post)
    expect(row?.['status']).toBe('queued')
    expect(row?.['account_id']).toBe(account)
    expect(row?.['scheduled_at']).toBe('2026-09-08 09:00:00')
    // لم يُرسَل بعد: الختمُ فارغٌ حتّى تأتي دورةُ الربع
    expect(row?.['dispatched_at']).toBeNull()
  })

  it('المسوّدةُ لا تُجدول — والاعتمادُ شرطٌ لا تفصيل', async () => {
    const post = await seedPost({ status: 'draft', approved: false })
    const account = await seedAccount()
    const out = await schedulePost(db, post, account, SOON, NOW)

    expect(out.ok).toBe(false)
    expect((await readPost(post))?.['status']).toBe('draft')
  })

  it('حسابٌ من منصّةٍ أخرى يُردّ — ونصُّ X لا يُنشر في LinkedIn', async () => {
    const post = await seedPost({ platform: 'x' })
    const account = await seedAccount({ platform: 'linkedin' })
    const out = await schedulePost(db, post, account, SOON, NOW)

    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.reason).toContain('linkedin')
    expect((await readPost(post))?.['status']).toBe('approved')
  })

  it('قناةٌ إذنُها منتهٍ تُردّ — فلا تفشل بعد أيّامٍ صامتة', async () => {
    const post = await seedPost()
    const account = await seedAccount({ status: 'needs_reauth', name: 'بصائر' })
    const out = await schedulePost(db, post, account, SOON, NOW)

    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.reason).toContain('بصائر')
  })

  it('موعدٌ في الماضي يُردّ — وذاك إرسالٌ فوريّ لا جدولة', async () => {
    const post = await seedPost()
    const account = await seedAccount()
    expect((await schedulePost(db, post, account, PAST, NOW)).ok).toBe(false)
  })

  it('موعدٌ غير مفهوم يُردّ ولا يُخمَّن', async () => {
    const post = await seedPost()
    const account = await seedAccount()
    expect((await schedulePost(db, post, account, 'غدا صباحا', NOW)).ok).toBe(false)
  })

  it('المعتمَدُ بعد تعديل يُجدول كالمعتمَد سواء', async () => {
    const post = await seedPost({ status: 'edited' })
    const account = await seedAccount()
    expect((await schedulePost(db, post, account, SOON, NOW)).ok).toBe(true)
  })
})

describe('السحب', () => {
  it('قبل الإرسال يعود approved — والاعتمادُ لا يُمحى بسحب موعد', async () => {
    const post = await seedPost()
    const account = await seedAccount()
    await schedulePost(db, post, account, SOON, NOW)

    expect((await unschedule(db, post)).ok).toBe(true)
    const row = await readPost(post)
    expect(row?.['status']).toBe('approved')
    expect(row?.['scheduled_at']).toBeNull()
    expect(row?.['account_id']).toBeNull()
  })

  it('بعد الإرسال يُردّ — ولا يُستردّ من الطابور', async () => {
    const post = await seedPost()
    const account = await seedAccount()
    await schedulePost(db, post, account, SOON, NOW)
    await markDispatched(db, [post], NOW)

    const out = await unschedule(db, post)
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.reason).toContain('الطابور')
    expect((await readPost(post))?.['status']).toBe('queued')
  })

  it('ما ليس مجدولا لا يُسحب', async () => {
    const post = await seedPost()
    expect((await unschedule(db, post)).ok).toBe(false)
  })
})

/**
 * إعادةُ الفاشل أو العالق — **ولا يُعاد ما قد يكون نُشر** (D-004).
 */
describe('الإعادة', () => {
  async function attempt(post: string, status: string, at: string, no = 1): Promise<void> {
    await db
      .prepare(
        `INSERT INTO publish_attempts (id, post_id, idempotency_key, attempt_no, request_json, status, at)
         VALUES (?, ?, ?, ?, '{}', ?, ?)`,
      )
      .bind(crypto.randomUUID(), post, `k-${post}`, no, status, at)
      .run()
  }
  async function failedPost(): Promise<string> {
    const post = await seedPost()
    const account = await seedAccount()
    await schedulePost(db, post, account, SOON, NOW)
    await db.prepare("UPDATE posts SET status = 'failed' WHERE id = ?").bind(post).run()
    await attempt(post, 'failed', '2026-09-08 09:00:05')
    return post
  }
  const LATER = new Date('2026-09-08T12:00:00Z')

  it('الفاشلُ يعود معتمَدا بلا موعدٍ ولا حساب، ومفتاحُه كما هو', async () => {
    const post = await failedPost()
    expect((await requeue(db, post, LATER)).ok).toBe(true)
    const row = await readPost(post)
    expect(row?.['status']).toBe('approved')
    expect(row?.['scheduled_at']).toBeNull()
    expect(row?.['account_id']).toBeNull()
    const key = await db.prepare('SELECT idempotency_key FROM posts WHERE id = ?').bind(post).first<{ idempotency_key: string }>()
    expect(key?.idempotency_key).toBe(`k-${post}`)
  })

  it('ويُردّ إن كانت له محاولةٌ ناجحة', async () => {
    const post = await failedPost()
    await attempt(post, 'succeeded', '2026-09-08 09:10:00', 2)
    const out = await requeue(db, post, LATER)
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.reason).toContain('مرّتين')
    expect((await readPost(post))?.['status']).toBe('failed')
  })

  it('ويُردّ إن كانت له محاولةٌ أُرسلت بلا جواب', async () => {
    const post = await failedPost()
    await attempt(post, 'sent', '2026-09-08 09:10:00', 2)
    const out = await requeue(db, post, LATER)
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.reason).toContain('تحقّق على المنصّة')
  })

  it('والعالقُ منذ ساعةٍ بلا محاولةٍ يعود، وما دونها يُردّ', async () => {
    const post = await seedPost()
    const account = await seedAccount()
    await schedulePost(db, post, account, SOON, NOW)
    await markDispatched(db, [post], new Date('2026-09-08T09:00:00Z'))
    expect((await requeue(db, post, new Date('2026-09-08T09:30:00Z'))).ok).toBe(false)
    expect((await requeue(db, post, new Date('2026-09-08T10:30:00Z'))).ok).toBe(true)
    expect((await readPost(post))?.['status']).toBe('approved')
  })

  it('والمجدولُ الذي ينتظر موعدَه لا يُعاد', async () => {
    const post = await seedPost()
    const account = await seedAccount()
    await schedulePost(db, post, account, SOON, NOW)
    expect((await requeue(db, post, NOW)).ok).toBe(false)
  })

  it('وطلبان متتاليان: الأوّلُ يقلب الحال والثاني يُردّ', async () => {
    const post = await failedPost()
    const [a, b] = await Promise.all([requeue(db, post, LATER), requeue(db, post, LATER)])
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1)
  })
})

describe('ما حلّ موعدُه', () => {
  async function scheduled(when: string): Promise<string> {
    const post = await seedPost()
    const account = await seedAccount()
    const out = await schedulePost(db, post, account, when, new Date('2026-09-08T00:00:00Z'))
    expect(out.ok).toBe(true)
    return post
  }

  it('لا يعيد ما لم يحلّ موعدُه', async () => {
    await scheduled('2026-09-08T10:00')
    expect(await dueNow(db, new Date('2026-09-08T09:00:00Z'))).toHaveLength(0)
  })

  it('يعيده حين يحلّ', async () => {
    const post = await scheduled('2026-09-08T10:00')
    const due = await dueNow(db, new Date('2026-09-08T10:00:00Z'))
    expect(due.map((d) => d.id)).toEqual([post])
  })

  it('لا يعيد ما أُرسل — والختمُ يفصل المعنيين', async () => {
    const post = await scheduled('2026-09-08T10:00')
    await markDispatched(db, [post], new Date('2026-09-08T10:00:00Z'))
    expect(await dueNow(db, new Date('2026-09-08T11:00:00Z'))).toHaveLength(0)
  })

  it('يفرز بالموعد ويقصّ على السقف — فلا تُغرق دورةٌ الطابور', async () => {
    await scheduled('2026-09-08T12:00')
    const first = await scheduled('2026-09-08T09:00')
    const due = await dueNow(db, new Date('2026-09-08T13:00:00Z'), 1)
    expect(due.map((d) => d.id)).toEqual([first])
  })
})

describe('دورةُ الإرسال', () => {
  async function due(): Promise<string> {
    const post = await seedPost()
    const account = await seedAccount()
    await schedulePost(db, post, account, '2026-09-08T09:00', new Date('2026-09-08T00:00:00Z'))
    return post
  }

  it('ترسل المستحقّ وتختمه', async () => {
    const post = await due()
    const queue = fakeQueue()
    const report = await dispatchDue({ db, queue, now: () => new Date('2026-09-08T09:05:00Z') })

    expect(report.kind).toBe('sent')
    expect(queue.sent).toEqual([post])
    expect((await readPost(post))?.['dispatched_at']).not.toBeNull()
  })

  it('**الدورةُ الثانية لا ترسل ما أرسلته الأولى**', async () => {
    await due()
    const now = () => new Date('2026-09-08T09:05:00Z')
    const q1 = fakeQueue()
    const q2 = fakeQueue()
    await dispatchDue({ db, queue: q1, now })
    const second = await dispatchDue({ db, queue: q2, now })

    expect(q1.sent).toHaveLength(1)
    expect(q2.sent).toHaveLength(0)
    expect(second.kind).toBe('none')
  })

  it('الإيقافُ يوقف النشر كما يوقف النداء — ولا رسالةَ تخرج', async () => {
    const post = await due()
    await writeSetting(db, 'paused', 'true', 'test')
    const queue = fakeQueue()
    const report = await dispatchDue({ db, queue, now: () => new Date('2026-09-08T09:05:00Z') })

    expect(report.kind).toBe('blocked')
    expect(queue.sent).toHaveLength(0)
    // ولا يُختم ما لم يُرسَل: يخرج في أوّل دورةٍ بعد الاستئناف
    expect((await readPost(post))?.['dispatched_at']).toBeNull()
  })

  it('**بلوغُ سقف التحليل أو سقف الإنفاق لا يوقف نشرَ ما اعتمده المالك** (D-169)', async () => {
    const post = await due()
    await writeSetting(db, 'daily_analysis_cap', '0', 'test')
    await writeSetting(db, 'daily_spend_cap_usd', '0', 'test')
    const queue = fakeQueue()
    const report = await dispatchDue({ db, queue, now: () => new Date('2026-09-08T09:05:00Z') })
    // ‏كان الحارسُ واحدًا فيردّ النشرَ بـ«بلغ سقف التحليل اليوميّ»
    expect(report.kind).toBe('sent')
    expect(queue.sent).toEqual([post])
  })

  it('بلا مستحقٍّ لا شيء', async () => {
    const queue = fakeQueue()
    expect((await dispatchDue({ db, queue, now: () => NOW })).kind).toBe('none')
  })
})

describe('D-009 · القيدُ في القاعدة لا في الشيفرة', () => {
  it('SQL مباشر: طابورٌ بلا حساب يُردّ', async () => {
    const post = await seedPost()
    await expect(
      db
        .prepare("UPDATE posts SET status = 'queued', scheduled_at = '2026-09-09 09:00:00' WHERE id = ?")
        .bind(post)
        .run(),
    ).rejects.toThrow()
  })

  it('SQL مباشر: طابورٌ بلا اعتماد يُردّ وإن كملت البقيّة', async () => {
    const post = await seedPost({ approved: false, status: 'draft' })
    const account = await seedAccount()
    await expect(
      db
        .prepare(
          "UPDATE posts SET status = 'queued', account_id = ?, scheduled_at = '2026-09-09 09:00:00' WHERE id = ?",
        )
        .bind(account, post)
        .run(),
    ).rejects.toThrow()
  })
})

/**
 * منشورٌ بصورة.
 *
 * كان يُمنَع من الجدولة حتّى يُبنى الرفع (D-039). وقد بُني (D-040)،
 * **فالمنعُ رُفع** — والحارسُ الباقي في الناشر: هو الذي يمنع فعلا،
 * ورسالةٌ في الطابور تجده قائما.
 */
describe('منشورٌ بصورة', () => {
  async function withImage(): Promise<{ post: string; account: string }> {
    const post = await seedPost()
    const account = await seedAccount()
    await db
      .prepare(
        `INSERT INTO media (id, post_id, r2_key, mime, bytes, prompt, model, idempotency_key)
         VALUES (?, ?, ?, 'image/png', 100, 'وصف', 'gemini', ?)`,
      )
      .bind(crypto.randomUUID(), post, `img/${post}/a.png`, `image:${post}:aa`)
      .run()
    return { post, account }
  }

  it('يُجدول كغيره — والرفعُ يقع عند النشر لا عند الجدولة', async () => {
    const { post, account } = await withImage()
    const out = await schedulePost(db, post, account, SOON, NOW)

    expect(out.ok).toBe(true)
    expect((await readPost(post))?.['status']).toBe('queued')
  })
})

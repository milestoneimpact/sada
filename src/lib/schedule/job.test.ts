/**
 * الجدولةُ والإرسال — **والحارسُ هو ما يُختبَر لا المسار الناجح.**
 *
 * منشورٌ يُجدول إلى حسابٍ من منصّةٍ أخرى، أو إلى قناةٍ إذنُها منتهٍ، أو
 * بموعدٍ مضى — ثلاثةٌ تنجح صامتةً ثمّ تفشل بعد أيّام في الطابور، حيث
 * لا أحد ينظر. فتُمنع هنا، ويُقطع منعُها.
 *
 * والقاعدةُ حقيقيّةٌ في كلّ ما يلي، فقيودُ `posts` الثلاثة تُقطَع فعلا.
 */
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import { fakeDb, type FakeDb } from '../../test/fakes'
import {
  claimDelivery, DISPATCH_HORIZON_SECONDS,
  dbNow, dispatchDue, dueNow, markDispatched, parseWhen, requeue, reschedulePost, schedulePost, sweepStuck, unmarkDispatched, unschedule, restoreSchedule,
  UNDO_WINDOW_SECONDS, undoSchedule, undoUntil,
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
  platform?: 'linkedin' | 'x' | 'tiktok' | 'youtube' | 'instagram'
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
  platform?: 'linkedin' | 'x' | 'tiktok' | 'youtube' | 'instagram'
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

describe('قراءة الموعد', () => {
  it('تقرأ صيغة datetime-local وتحوّلها إلى صيغة القاعدة', () => {
    expect(parseWhen('2026-09-08T09:00')).toBe('2026-09-08 09:00:00')
    expect(parseWhen('2026-09-08T09:00:30')).toBe('2026-09-08 09:00:30')
  })

  it('تردّ ما ليس موعدا ولا تخمّنه', () => {
    for (const bad of ['', 'غدا', '2026-09-08', '08/09/2026 09:00', '2026-13-40T99:99']) {
      expect(parseWhen(bad)).toBeNull()
    }
  })

  it('صيغة «الآن» هي صيغة القاعدة نفسها — فالمقارنة النصّيّة تصحّ', () => {
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

  it('المسوّدة لا تُجدول — والاعتماد شرط لا تفصيل', async () => {
    const post = await seedPost({ status: 'draft', approved: false })
    const account = await seedAccount()
    const out = await schedulePost(db, post, account, SOON, NOW)

    expect(out.ok).toBe(false)
    expect((await readPost(post))?.['status']).toBe('draft')
  })

  it('حساب من منصّة أخرى يُردّ — ونصّ X لا يُنشر في LinkedIn', async () => {
    const post = await seedPost({ platform: 'x' })
    const account = await seedAccount({ platform: 'linkedin' })
    const out = await schedulePost(db, post, account, SOON, NOW)

    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.reason).toContain('linkedin')
    expect((await readPost(post))?.['status']).toBe('approved')
  })

  it('قناة إذنُها منته تُردّ — فلا تفشل بعد أيّام صامتة', async () => {
    const post = await seedPost()
    const account = await seedAccount({ status: 'needs_reauth', name: 'بصائر' })
    const out = await schedulePost(db, post, account, SOON, NOW)

    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.reason).toContain('بصائر')
  })

  it('موعد في الماضي يُردّ — وذاك إرسال فوريّ لا جدولة', async () => {
    const post = await seedPost()
    const account = await seedAccount()
    expect((await schedulePost(db, post, account, PAST, NOW)).ok).toBe(false)
  })

  it('موعد غير مفهوم يُردّ ولا يُخمَّن', async () => {
    const post = await seedPost()
    const account = await seedAccount()
    expect((await schedulePost(db, post, account, 'غدا صباحا', NOW)).ok).toBe(false)
  })

  it('المعتمَد بعد تعديل يُجدول كالمعتمَد سواء', async () => {
    const post = await seedPost({ status: 'edited' })
    const account = await seedAccount()
    expect((await schedulePost(db, post, account, SOON, NOW)).ok).toBe(true)
  })
})

describe('السحب', () => {
  it('قبل الإرسال يعود approved — والاعتماد لا يُمحى بسحب موعد', async () => {
    const post = await seedPost()
    const account = await seedAccount()
    await schedulePost(db, post, account, SOON, NOW)

    expect((await unschedule(db, post)).ok).toBe(true)
    const row = await readPost(post)
    expect(row?.['status']).toBe('approved')
    expect(row?.['scheduled_at']).toBeNull()
    expect(row?.['account_id']).toBeNull()
  })

  it('ويعود الموعدُ والحسابُ مع النتيجة، والاستعادةُ تردّهما ما دامت معتمَدةً بلا موعد (D-303)', async () => {
    const post = await seedPost()
    const account = await seedAccount()
    await schedulePost(db, post, account, SOON, NOW)
    const before = await readPost(post)
    const pulled = await unschedule(db, post)
    expect(pulled.ok).toBe(true)
    if (!pulled.ok) return
    expect(pulled.at).toBe(before?.['scheduled_at'])
    expect(pulled.account).toBe(account)
    expect((await restoreSchedule(db, post, pulled.at, pulled.account, 'org_owner')).ok).toBe(true)
    const after = await readPost(post)
    expect(after?.['status']).toBe('queued')
    expect(after?.['scheduled_at']).toBe(before?.['scheduled_at'])
    expect(after?.['account_id']).toBe(account)
    // ‏ومرّةً ثانية لا تُستعاد: الحالُ تبدّلت
    expect((await restoreSchedule(db, post, pulled.at, pulled.account, 'org_owner')).ok).toBe(false)
    expect((await restoreSchedule(db, post, '', '', 'org_owner')).ok).toBe(false)
  })

  it('بعد الإرسال يُردّ — ولا يُستردّ بعد الإرسال', async () => {
    const post = await seedPost()
    const account = await seedAccount()
    await schedulePost(db, post, account, SOON, NOW)
    await markDispatched(db, [post], NOW)

    const out = await unschedule(db, post)
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.reason).toContain('بعد الإرسال')
    expect((await readPost(post))?.['status']).toBe('queued')
  })

  it('ما ليس مجدولا لا يُسحب', async () => {
    const post = await seedPost()
    expect((await unschedule(db, post)).ok).toBe(false)
  })

  /*
   * ‏**تحقّق D-320 على main**: «اسحب الموعد» يقرأ ثمّ يكتب، ورسالةٌ مؤجَّلةٌ تصل في الدقيقة نفسِها تختمه بين الاثنين. كان التحديثُ
   * ‏بلا حارسٍ فيقول للمالك «سُحب» والمنشورُ خارجٌ إلى المنصّة. فالحارسُ في جملة التحديث نفسِها كما في `undoSchedule`.
   */
  it('رسالةٌ مؤجَّلةٌ تختمه بين قراءة السحب وكتابته: يُردّ السحب ويبقى مختومًا في الطابور', async () => {
    const post = await seedPost()
    const account = await seedAccount()
    await schedulePost(db, post, account, SOON, NOW)
    const due = String((await readPost(post))?.['scheduled_at'])
    const racing = {
      batch: db.batch,
      prepare(query: string) {
        const statement = db.prepare(query)
        if (!/SET status = 'approved'/.test(query)) return statement
        // ‏الرسالةُ تختم قبل أن تُنفَّذ كتابةُ السحب، أيًّا كانت صيغتُها
        const claimFirst = async () => { expect(await claimDelivery(db, post, 'org_owner', due)).toEqual({ kind: 'claimed' }) }
        return {
          bind(...values: unknown[]) { statement.bind(...values); return this },
          all: statement.all,
          async first<T>() { await claimFirst(); return statement.first<T>() },
          async run() { await claimFirst(); return statement.run() },
        } as never
      },
    } as unknown as FakeDb
    const out = await unschedule(racing, post)
    expect(out.ok).toBe(false)
    const row = await readPost(post)
    expect(row?.['status']).toBe('queued')
    expect(row?.['dispatched_at']).not.toBeNull()
    expect(row?.['account_id']).toBe(account)
  })

  it('والاستعادةُ لا تعيد إلى الطابور منشورًا مختومًا، فلا يبقى «مجدولًا» لا تراه الدورةُ ولا الكنّاس', async () => {
    const post = await seedPost()
    const account = await seedAccount()
    await db.prepare("UPDATE posts SET dispatched_at = '2026-09-08 09:00:00' WHERE id = ?").bind(post).run()
    const out = await restoreSchedule(db, post, '2026-09-08 09:00:00', account, 'org_owner')
    expect(out.ok).toBe(false)
    expect((await readPost(post))?.['status']).toBe('approved')
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

  it('الفاشل يعود معتمَدا بلا موعد ولا حساب، ومفتاحُه كما هو', async () => {
    const post = await failedPost()
    expect((await requeue(db, post, LATER)).ok).toBe(true)
    const row = await readPost(post)
    expect(row?.['status']).toBe('approved')
    expect(row?.['scheduled_at']).toBeNull()
    expect(row?.['account_id']).toBeNull()
    const key = await db.prepare('SELECT idempotency_key FROM posts WHERE id = ?').bind(post).first<{ idempotency_key: string }>()
    expect(key?.idempotency_key).toBe(`k-${post}`)
  })

  it('ويُردّ إن كانت له محاولة ناجحة', async () => {
    const post = await failedPost()
    await attempt(post, 'succeeded', '2026-09-08 09:10:00', 2)
    const out = await requeue(db, post, LATER)
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.reason).toContain('مرّتين')
    expect((await readPost(post))?.['status']).toBe('failed')
  })

  it('ويُردّ إن كانت له محاولة أُرسلت بلا جواب', async () => {
    const post = await failedPost()
    await attempt(post, 'sent', '2026-09-08 09:10:00', 2)
    const out = await requeue(db, post, LATER)
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.reason).toContain('تحقّق على المنصّة')
  })

  it('والعالق منذ ساعة بلا محاولة يعود، وما دونها يُردّ', async () => {
    const post = await seedPost()
    const account = await seedAccount()
    await schedulePost(db, post, account, SOON, NOW)
    await markDispatched(db, [post], new Date('2026-09-08T09:00:00Z'))
    expect((await requeue(db, post, new Date('2026-09-08T09:30:00Z'))).ok).toBe(false)
    expect((await requeue(db, post, new Date('2026-09-08T10:30:00Z'))).ok).toBe(true)
    expect((await readPost(post))?.['status']).toBe('approved')
  })

  it('والمجدول الذي ينتظر موعدَه لا يُعاد', async () => {
    const post = await seedPost()
    const account = await seedAccount()
    await schedulePost(db, post, account, SOON, NOW)
    expect((await requeue(db, post, NOW)).ok).toBe(false)
  })

  it('وطلبان متتاليان: الأوّل يقلب الحال والثاني يُردّ', async () => {
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

  it('لا يعيد ما أُرسل — والختم يفصل المعنيين', async () => {
    const post = await scheduled('2026-09-08T10:00')
    await markDispatched(db, [post], new Date('2026-09-08T10:00:00Z'))
    expect(await dueNow(db, new Date('2026-09-08T11:00:00Z'))).toHaveLength(0)
  })

  it('يفرز بالموعد ويقصّ على السقف — فلا تُغرق دورة الطابور', async () => {
    await scheduled('2026-09-08T12:00')
    const first = await scheduled('2026-09-08T09:00')
    const due = await dueNow(db, new Date('2026-09-08T13:00:00Z'), 1)
    expect(due.map((d) => d.id)).toEqual([first])
  })
})

describe('دورة الإرسال', () => {
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

  it('**الدورة الثانية لا ترسل ما أرسلته الأولى**', async () => {
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

  it('الإيقاف يوقف النشر كما يوقف النداء — ولا رسالة تخرج', async () => {
    const post = await due()
    await writeSetting(db, 'paused', 'true', 'test')
    const queue = fakeQueue()
    const report = await dispatchDue({ db, queue, now: () => new Date('2026-09-08T09:05:00Z') })

    expect(report.kind).toBe('blocked')
    expect(queue.sent).toHaveLength(0)
    // ولا يُختم ما لم يُرسَل: يخرج في أوّل دورةٍ بعد الاستئناف
    expect((await readPost(post))?.['dispatched_at']).toBeNull()
  })

  it('**بلوغ سقف التحليل أو سقف الإنفاق لا يوقف نشر ما اعتمده المالك** (D-169)', async () => {
    const post = await due()
    await writeSetting(db, 'daily_analysis_cap', '0', 'test')
    await writeSetting(db, 'daily_spend_cap_usd', '0', 'test')
    const queue = fakeQueue()
    const report = await dispatchDue({ db, queue, now: () => new Date('2026-09-08T09:05:00Z') })
    // ‏كان الحارسُ واحدًا فيردّ النشرَ بـ«بلغ سقف التحليل اليوميّ»
    expect(report.kind).toBe('sent')
    expect(queue.sent).toEqual([post])
  })

  it('بلا مستحقّ لا شيء', async () => {
    const queue = fakeQueue()
    expect((await dispatchDue({ db, queue, now: () => NOW })).kind).toBe('none')
  })
})

describe('D-009 · القيد في القاعدة لا في الشيفرة', () => {
  it('SQL مباشر: طابور بلا حساب يُردّ', async () => {
    const post = await seedPost()
    await expect(
      db
        .prepare("UPDATE posts SET status = 'queued', scheduled_at = '2026-09-09 09:00:00' WHERE id = ?")
        .bind(post)
        .run(),
    ).rejects.toThrow()
  })

  it('SQL مباشر: طابور بلا اعتماد يُردّ وإن كملت البقيّة', async () => {
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
describe('منشور بصورة', () => {
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

  it('يُجدول كغيره — والرفع يقع عند النشر لا عند الجدولة', async () => {
    const { post, account } = await withImage()
    const out = await schedulePost(db, post, account, SOON, NOW)

    expect(out.ok).toBe(true)
    expect((await readPost(post))?.['status']).toBe('queued')
  })
})

/**
 * **ومنشورٌ يعرف الناشرُ أنّه سيردّه لا يُجدوَل** (رحلتا R-2 وR-4).
 *
 * مسوّدةُ TikTok من مصدرٍ اعتُمدت وجُدولت بلا مقطع: «✓ جُدولت» على البطاقة، ثمّ ردّها
 * الناشرُ عند موعدها بـ `no_clip`. فالسؤالُ نفسُه يُسأل الآن بمنصّات الناشر نفسِها.
 */
describe('منصّات المقطع وInstagram تحتاج وسيطها', () => {
  async function withMedia(post: string, mime: string, status = 'ready'): Promise<void> {
    await db
      .prepare(
        `INSERT INTO media (id, post_id, r2_key, mime, bytes, prompt, model, idempotency_key, status)
         VALUES (?, ?, ?, ?, 100, '', 'm', ?, ?)`,
      )
      .bind(crypto.randomUUID(), post, `m/${post}/${mime}`, mime, `m:${post}:${mime}:${status}`, status)
      .run()
  }

  it('TikTok بلا مقطع تُردّ بسبب يقول ما يُفعَل — وتبقى معتمَدة', async () => {
    const post = await seedPost({ platform: 'tiktok' })
    const account = await seedAccount({ platform: 'tiktok' })
    const out = await schedulePost(db, post, account, SOON, NOW)
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.reason).toContain('TikTok تحتاج مقطعًا')
    expect((await readPost(post))?.['status']).toBe('approved')
  })

  it('وYouTube بصورة وحدَها تُردّ كذلك، وبمقطع جاهز تُجدوَل', async () => {
    const post = await seedPost({ platform: 'youtube' })
    const account = await seedAccount({ platform: 'youtube' })
    await withMedia(post, 'image/png')
    await withMedia(post, 'video/mp4', 'rejected')
    expect((await schedulePost(db, post, account, SOON, NOW)).ok).toBe(false)

    await withMedia(post, 'video/mp4')
    const out = await schedulePost(db, post, account, SOON, NOW)
    expect(out).toMatchObject({ ok: true, platform: 'youtube' })
  })

  it('وInstagram بلا وسيط تُردّ، وبصورة أو مقطع تُجدوَل', async () => {
    const bare = await seedPost({ platform: 'instagram' })
    const account = await seedAccount({ platform: 'instagram' })
    const out = await schedulePost(db, bare, account, SOON, NOW)
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.reason).toContain('Instagram تحتاج صورةً أو مقطعًا')

    const pictured = await seedPost({ platform: 'instagram' })
    await withMedia(pictured, 'image/png')
    expect((await schedulePost(db, pictured, account, SOON, NOW)).ok).toBe(true)
  })

  it('وLinkedIn وX نصّ يكفي — لا وسيط يُشترَط', async () => {
    const post = await seedPost({ platform: 'x' })
    const account = await seedAccount({ platform: 'x' })
    expect((await schedulePost(db, post, account, SOON, NOW)).ok).toBe(true)
  })
})


/*
 * ‏**الختمُ ذرّيّ** (D-269): دورتان تلتقيان لا تختمان الصفَّ نفسَه مرّتين، وما سقط
 * ‏إرسالُه إلى الطابور يُرفَع ختمُه فتجده الدورةُ التالية.
 */
describe('الختم الذرّيّ (D-269)', () => {
  it('يعيد ما ختمه هو وحده — والثانية تجد لا شيء', async () => {
    const post = await seedPost()
    const account = await seedAccount()
    await schedulePost(db, post, account, SOON, NOW)
    expect(await markDispatched(db, [post], NOW)).toEqual([{ id: post, org: 'org_owner' }])
    expect(await markDispatched(db, [post], NOW)).toEqual([])
  })

  it('ولا يختم ما ليس في الطابور', async () => {
    const post = await seedPost()
    expect(await markDispatched(db, [post], NOW)).toEqual([])
    expect((await readPost(post))?.['dispatched_at']).toBeNull()
  })

  it('حين يرمي الطابور يُرفَع الختم ويُرمى الخطأ', async () => {
    const post = await seedPost()
    const account = await seedAccount()
    await schedulePost(db, post, account, SOON, NOW)
    const later = () => new Date('2026-09-08T09:05:00Z')
    const queue = { async sendBatch(): Promise<never> { throw new Error('queue down') } }
    await expect(dispatchDue({ db, queue, now: later })).rejects.toThrow('queue down')
    expect((await readPost(post))?.['dispatched_at']).toBeNull()
    // والدورةُ التالية ترسله
    const q2 = fakeQueue()
    const out = await dispatchDue({ db, queue: q2, now: later })
    expect(out).toMatchObject({ kind: 'sent', count: 1 })
  })

  it('رفعُ الختم لا يمسّ ختما وضعته دورةٌ أخرى', async () => {
    const post = await seedPost()
    const account = await seedAccount()
    await schedulePost(db, post, account, SOON, NOW)
    const other = new Date('2026-09-08T09:06:00Z')
    await markDispatched(db, [post], other)
    await unmarkDispatched(db, [{ id: post, org: 'org_owner' }], new Date('2026-09-08T09:05:00Z'))
    expect((await readPost(post))?.['dispatched_at']).not.toBeNull()
  })
})


/** ‏الكنّاس (D-270): العالقُ فوق ساعةٍ بلا جوابٍ يُعلَّم `failed` بأثر، وما له `sent` لا يُمسّ. */
describe('الكنّاس (D-270)', () => {
  const T0 = new Date('2026-09-08T09:05:00Z')
  const LATER = new Date('2026-09-08T10:30:00Z')

  async function stuckPost(): Promise<string> {
    const post = await seedPost()
    const account = await seedAccount()
    await schedulePost(db, post, account, SOON, NOW)
    await markDispatched(db, [post], T0)
    return post
  }

  it('يعلّم العالق failed ويكتب محاولةً بسببها', async () => {
    const post = await stuckPost()
    const swept = await sweepStuck(db, LATER)
    expect(swept.map((s) => s.id)).toEqual([post])
    expect((await readPost(post))?.['status']).toBe('failed')
    const attempt = db.raw.prepare('SELECT status, response_json FROM publish_attempts WHERE post_id = ?').get(post) as { status: string; response_json: string }
    expect(attempt.status).toBe('failed')
    expect(attempt.response_json).toContain('stuck')
  })

  it('ولا يمسّ ما أُرسل قبل أقلّ من ساعة', async () => {
    const post = await stuckPost()
    expect(await sweepStuck(db, new Date('2026-09-08T09:50:00Z'))).toEqual([])
    expect((await readPost(post))?.['status']).toBe('queued')
  })

  it('ولا يمسّ ما له محاولةٌ sent — ذاك للمالك', async () => {
    const post = await stuckPost()
    db.raw.prepare(`INSERT INTO publish_attempts (id, post_id, idempotency_key, attempt_no, request_json, status)
      VALUES ('a1', ?, 'k', 1, '{}', 'sent')`).run(post)
    expect(await sweepStuck(db, LATER)).toEqual([])
    expect((await readPost(post))?.['status']).toBe('queued')
  })

  it('ولا يمسّ ما حاول الطابورُ فيه منذ أقلّ من ساعة', async () => {
    const post = await stuckPost()
    db.raw.prepare(`INSERT INTO publish_attempts (id, post_id, idempotency_key, attempt_no, request_json, status, at)
      VALUES ('a1', ?, 'k', 1, '{}', 'failed', '2026-09-08 10:00:00')`).run(post)
    expect(await sweepStuck(db, LATER)).toEqual([])
  })

  it('وبعد الكنس يقبله «أعده»', async () => {
    const post = await stuckPost()
    await sweepStuck(db, LATER)
    const out = await requeue(db, post, new Date('2026-09-08T12:00:00Z'))
    expect(out.ok).toBe(true)
  })
})


/** ‏منظّمةُ الجلسة تُفرَض على أفعال اللوحة (D-277): منشورُ منظّمةٍ أخرى «لا منشور». */
describe('منظّمة الجلسة على أفعال الجدولة (D-277)', () => {
  it('schedulePost وunschedule وreschedulePost وrequeue تردّ منشورَ منظّمةٍ أخرى', async () => {
    const post = await seedPost()
    const account = await seedAccount()
    expect((await schedulePost(db, post, account, SOON, NOW, 'org_other')).ok).toBe(false)
    expect((await schedulePost(db, post, account, SOON, NOW, 'org_owner')).ok).toBe(true)
    expect((await reschedulePost(db, post, '2026-09-08T11:00', NOW, 'org_other')).ok).toBe(false)
    expect((await unschedule(db, post, 'org_other')).ok).toBe(false)
    expect((await unschedule(db, post, 'org_owner')).ok).toBe(true)
    expect((await requeue(db, post, NOW, 'org_other')).ok).toBe(false)
  })
})

/**
 * ‏**«تراجَع» بعد «اعتمد وجدوِل» وبعد «جدوِل»** (D-324 · نمط D-303): كان الإشعارُ يقول «اعتُمدت وجُدولت» ويُغلَق، ولا طريقَ
 * ‏من المجدولة إلى المسوّدة إلّا سحبُ الموعد ثمّ التراجعُ عن الاعتماد في مكانين. **ولا يُنشَر شيءٌ في نافذة التراجع**:
 * ‏أقربُ موعدٍ من اللوحة بعد النافذة، والدورةُ لا ترسل ما لم يحلّ موعدُه.
 */
describe('التراجع عن الجدولة (D-324)', () => {
  it('موعدٌ داخل نافذة التراجع يُردّ حين يُطلب الإمساك، ويُقبل بلا إمساك كما كان', async () => {
    const post = await seedPost()
    const account = await seedAccount()
    const inMinute = '2026-09-08T08:01'
    const held = await schedulePost(db, post, account, inMinute, NOW, null, UNDO_WINDOW_SECONDS)
    expect(held).toEqual({ ok: false, reason: 'الموعد بعد أقلّ من دقيقتين، ولا يُنشَر شيءٌ في دقيقتي التراجع — اختر موعدًا أبعد قليلًا' })
    expect((await schedulePost(db, post, account, inMinute, NOW)).ok).toBe(true)
  })

  it('ولا تُرسله الدورةُ داخل النافذة: أقربُ موعدٍ مقبولٍ بعدها', async () => {
    const post = await seedPost()
    const account = await seedAccount()
    const done = await schedulePost(db, post, account, '2026-09-08T08:02', NOW, null, UNDO_WINDOW_SECONDS)
    expect(done.ok).toBe(true)
    for (let s = 0; s < UNDO_WINDOW_SECONDS; s += 15) {
      expect(await dueNow(db, new Date(NOW.getTime() + s * 1000))).toEqual([])
    }
  })

  it('«تراجَع» بعد «اعتمد وجدوِل» يعيدها مسوّدةً بلا موعدٍ ولا حسابٍ ولا اعتماد', async () => {
    const post = await seedPost()
    const account = await seedAccount()
    const done = await schedulePost(db, post, account, SOON, NOW, 'org_owner', UNDO_WINDOW_SECONDS)
    expect(done.ok).toBe(true)
    const until = undoUntil(NOW)
    const back = await undoSchedule(db, post, 'org_owner', { at: (done as { at: string }).at, until, to: 'draft' }, NOW)
    expect(back).toEqual({ ok: true, at: '', account: '', platform: 'linkedin' })
    const row = await db.prepare('SELECT status, scheduled_at, account_id, approved_at, approved_by FROM posts WHERE id = ?').bind(post).first()
    expect(row).toEqual({ status: 'draft', scheduled_at: null, account_id: null, approved_at: null, approved_by: null })
  })

  it('و«تراجَع» بعد «جدوِل» يعيدها معتمَدةً تنتظر موعدًا', async () => {
    const post = await seedPost()
    const account = await seedAccount()
    const done = await schedulePost(db, post, account, SOON, NOW, 'org_owner', UNDO_WINDOW_SECONDS)
    const back = await undoSchedule(db, post, 'org_owner', { at: (done as { at: string }).at, until: undoUntil(NOW), to: 'approved' }, NOW)
    expect(back.ok).toBe(true)
    const row = await db.prepare('SELECT status, scheduled_at, approved_at FROM posts WHERE id = ?').bind(post).first()
    expect(row).toEqual({ status: 'approved', scheduled_at: null, approved_at: '2026-09-08T07:00:00Z' })
  })

  it('ولا يُتراجَع بعد النافذة، ولا عمّا غادر إلى الطابور، ولا عن موعدٍ تبدّل بعده', async () => {
    const post = await seedPost()
    const account = await seedAccount()
    const done = await schedulePost(db, post, account, SOON, NOW, 'org_owner', UNDO_WINDOW_SECONDS) as { at: string }
    const until = undoUntil(NOW)
    const late = new Date(NOW.getTime() + (UNDO_WINDOW_SECONDS + 1) * 1000)
    expect(await undoSchedule(db, post, 'org_owner', { at: done.at, until, to: 'draft' }, late))
      .toEqual({ ok: false, reason: 'مضت دقيقتا التراجع — اسحب موعدَها من بطاقتها إن أردت' })
    expect(await undoSchedule(db, post, 'org_owner', { at: '2026-09-08 10:00:00', until, to: 'draft' }, NOW))
      .toEqual({ ok: false, reason: 'تبدّل موعدُها أو حالُها بعد الإشعار — أعد تحميل الصفحة' })
    await markDispatched(db, [post], new Date('2026-09-08T09:00:00Z'))
    expect(await undoSchedule(db, post, 'org_owner', { at: done.at, until, to: 'draft' }, NOW))
      .toEqual({ ok: false, reason: 'تبدّل موعدُها أو حالُها بعد الإشعار — أعد تحميل الصفحة' })
    expect((await db.prepare('SELECT status FROM posts WHERE id = ?').bind(post).first<{ status: string }>())?.status).toBe('queued')
  })

  it('ومنظّمةٌ أخرى لا تتراجع عن منشورٍ ليس لها', async () => {
    const post = await seedPost()
    const account = await seedAccount()
    const done = await schedulePost(db, post, account, SOON, NOW, 'org_owner', UNDO_WINDOW_SECONDS) as { at: string }
    expect((await undoSchedule(db, post, 'org_other', { at: done.at, until: undoUntil(NOW), to: 'draft' }, NOW)).ok).toBe(false)
  })
})

/**
 * ‏**النشرُ في دقيقته** (D-320).
 *
 * ‏كانت الدورةُ (‏:00 و‏:07 و‏:15 و‏:30 و‏:45) ترسل ما حلّ موعدُه وحدَه، فمنشورٌ موعدُه ‏:16 يخرج ‏:30 — أربعَ عشرةَ دقيقةً
 * ‏بعد ما وُعد، ومتوسّطُ التأخّر ستُّ دقائقَ ونصف. فصارت ترسل ما يحلّ قبل الدورة التالية برسالةٍ مؤجَّلةٍ إلى دقيقته
 * ‏(`delaySeconds`)، **ولا تختمه «أُرسل»**: الختمُ عند وصول الرسالة في موعدها (`claimDelivery`)، فيبقى يُسحب ويُغيَّر حتّى دقيقته.
 */
describe('النشر في دقيقته (D-320)', () => {
  type Sent = { body: { postId: string; org?: string; due?: string }; delaySeconds?: number }
  function recordingQueue(max = 100) {
    const sent: Sent[] = []
    const batches: number[] = []
    return {
      sent, batches,
      async sendBatch(messages: Sent[]) {
        if (messages.length > max) throw new Error(`batch of ${messages.length} exceeds ${max}`)
        batches.push(messages.length)
        sent.push(...messages)
      },
    }
  }
  async function scheduledAt(when: string, from = new Date('2026-09-08T00:00:00Z')): Promise<string> {
    const post = await seedPost()
    const account = await seedAccount()
    const out = await schedulePost(db, post, account, when, from)
    expect(out.ok).toBe(true)
    return post
  }
  const at = (iso: string) => () => new Date(iso)

  it('ما يحلّ قبل الدورة التالية يُرسَل مؤجَّلًا إلى دقيقته ولا يُختَم', async () => {
    const post = await scheduledAt('2026-09-08T09:12')
    const q = recordingQueue()
    const report = await dispatchDue({ db, queue: q, now: at('2026-09-08T09:00:00Z') })
    expect(report).toMatchObject({ kind: 'sent', count: 0, ahead: 1 })
    expect(q.sent).toEqual([{ body: { postId: post, org: 'org_owner', due: '2026-09-08 09:12:00' }, delaySeconds: 720 }])
    expect((await readPost(post))?.['dispatched_at']).toBeNull()
    // ‏والدورةُ التالية (‏:07) لا ترسله ثانية
    const again = recordingQueue()
    expect((await dispatchDue({ db, queue: again, now: at('2026-09-08T09:07:00Z') })).kind).toBe('none')
    expect(again.sent).toEqual([])
  })

  it('وما بعد الأفق ينتظر دورتَه، وما حلّ يُرسَل فورًا كما كان', async () => {
    const far = await scheduledAt('2026-09-08T09:30')
    const now = await scheduledAt('2026-09-08T08:55')
    const q = recordingQueue()
    const report = await dispatchDue({ db, queue: q, now: at('2026-09-08T09:00:00Z') })
    expect(report).toMatchObject({ kind: 'sent', count: 1, ahead: 0 })
    expect(q.sent).toEqual([{ body: { postId: now } }])
    expect((await readPost(far))?.['dispatched_at']).toBeNull()
    expect((await readPost(now))?.['dispatched_at']).not.toBeNull()
  })

  it('والأفقُ يغطّي أوسعَ فجوةٍ بين دورتين في wrangler.toml', () => {
    const toml = readFileSync(new URL('../../../wrangler.toml', import.meta.url), 'utf8')
    for (const line of toml.split('\n').filter((l) => /^\s*crons\s*=/.test(l))) {
      const minutes = new Set<number>()
      for (const cron of [...line.matchAll(/"([^"]+)"/g)].map((m) => m[1]!)) {
        const [min, hour] = cron.split(' ')
        if (hour !== '*') continue
        if (min!.startsWith('*/')) for (let m = 0; m < 60; m += Number(min!.slice(2))) minutes.add(m)
        else minutes.add(Number(min))
      }
      const ticks = [...minutes].sort((a, b) => a - b)
      const gaps = ticks.map((m, i) => (ticks[i + 1] ?? ticks[0]! + 60) - m)
      expect(Math.max(...gaps) * 60).toBeLessThan(DISPATCH_HORIZON_SECONDS)
    }
  })

  it('أسوأُ تأخّرٍ صفرٌ لما جُدول قبل دورته: كلُّ دقيقةٍ من الساعة تخرج في دقيقتها', async () => {
    // ‏دوراتُ الساعة كما في wrangler.toml: ‏*/15 ومعها ‏:07
    const ticks = [0, 7, 15, 30, 45]
    const posts = new Map<string, number>()
    for (let minute = 0; minute < 60; minute += 1) {
      posts.set(await scheduledAt(`2026-09-08T10:${String(minute).padStart(2, '0')}`), minute)
    }
    const delivered = new Map<string, number>()
    for (const tick of [...ticks.map((t) => t - 60), ...ticks]) {
      const q = recordingQueue()
      const base = Date.parse('2026-09-08T10:00:00Z') + tick * 60_000
      await dispatchDue({ db, queue: q, now: () => new Date(base) })
      for (const m of q.sent) {
        const arrives = base + (m.delaySeconds ?? 0) * 1000
        delivered.set(m.body.postId, arrives)
        // ‏والمستهلكُ يختمها حين تصل (`claimDelivery`): الدورةُ التالية لا تجدها
        await db.prepare('UPDATE posts SET dispatched_at = ? WHERE id = ?').bind(dbNow(new Date(arrives)), m.body.postId).run()
      }
    }
    const lateness = [...posts].map(([id, minute]) => (delivered.get(id)! - (Date.parse('2026-09-08T10:00:00Z') + minute * 60_000)) / 1000)
    expect(lateness).toHaveLength(60)
    expect(Math.max(...lateness)).toBe(0)
    expect(Math.min(...lateness)).toBe(0)
  })

  it('وسقفُ العشرين رُفع: مئتان وخمسون مستحقّة تخرج في دورةٍ واحدة، ودفعاتٌ دون المئة', async () => {
    const account = await seedAccount()
    for (let i = 0; i < 250; i += 1) {
      const post = await seedPost()
      await schedulePost(db, post, account, '2026-09-08T08:30', new Date('2026-09-08T00:00:00Z'))
    }
    const q = recordingQueue()
    const report = await dispatchDue({ db, queue: q, now: at('2026-09-08T09:00:00Z') })
    expect(report).toMatchObject({ kind: 'sent', count: 250 })
    expect(Math.max(...q.batches)).toBeLessThanOrEqual(100)
    expect(new Set(q.sent.map((m) => m.body.postId)).size).toBe(250)
  })

  it('ورسالةٌ مؤجَّلةٌ لم تصل بعد عشر دقائقَ من موعدها تُرسَل فورًا', async () => {
    const post = await scheduledAt('2026-09-08T09:12')
    await dispatchDue({ db, queue: recordingQueue(), now: at('2026-09-08T09:00:00Z') })
    const soon = recordingQueue()
    expect((await dispatchDue({ db, queue: soon, now: at('2026-09-08T09:15:00Z') })).kind).toBe('none')
    const late = recordingQueue()
    const report = await dispatchDue({ db, queue: late, now: at('2026-09-08T09:23:00Z') })
    expect(report).toMatchObject({ kind: 'sent', count: 1 })
    expect(late.sent).toEqual([{ body: { postId: post } }])
  })

  it('وطابورٌ يرمي يرفع علامةَ المؤجَّل فتعيدها الدورةُ التالية', async () => {
    const post = await scheduledAt('2026-09-08T09:12')
    const down = { async sendBatch(): Promise<never> { throw new Error('queue down') } }
    await expect(dispatchDue({ db, queue: down, now: at('2026-09-08T09:00:00Z') })).rejects.toThrow('queue down')
    const q = recordingQueue()
    await dispatchDue({ db, queue: q, now: at('2026-09-08T09:07:00Z') })
    expect(q.sent).toEqual([{ body: { postId: post, org: 'org_owner', due: '2026-09-08 09:12:00' }, delaySeconds: 300 }])
  })

  it('والسحبُ وتغييرُ الموعد والتراجعُ تبقى ممكنةً حتّى الدقيقة: المؤجَّلُ لم يُختَم', async () => {
    const post = await scheduledAt('2026-09-08T09:12')
    await dispatchDue({ db, queue: recordingQueue(), now: at('2026-09-08T09:00:00Z') })
    expect((await reschedulePost(db, post, '2026-09-08T09:40', new Date('2026-09-08T09:01:00Z'))).ok).toBe(true)
    // ‏وموعدٌ جديدٌ داخل الأفق يُرسَل له من جديد
    const q = recordingQueue()
    await dispatchDue({ db, queue: q, now: at('2026-09-08T09:30:00Z') })
    expect(q.sent).toEqual([{ body: { postId: post, org: 'org_owner', due: '2026-09-08 09:40:00' }, delaySeconds: 600 }])
    expect((await unschedule(db, post)).ok).toBe(true)
  })
})

/**
 * ‏**الختمُ عند الوصول** (D-320): الرسالةُ المؤجَّلةُ تختم منشورَها حين تصل في دقيقته وما زال كما أُرسلت له — بالجملة نفسِها
 * ‏وبساعة القاعدة، فتسحبٌ أو تغييرٌ قبل الدقيقة يغلب، وما بعدها يُردّ. والمواعيدُ هنا من ساعة القاعدة الحقيقيّة (`datetime('now')`).
 */
describe('الختمُ عند الوصول (D-320)', () => {
  async function queuedFor(offsetSeconds: number): Promise<{ id: string; due: string }> {
    const post = await seedPost()
    const account = await seedAccount()
    const due = dbNow(new Date(Date.now() + offsetSeconds * 1000))
    await db.prepare(`UPDATE posts SET status = 'queued', account_id = ?, scheduled_at = ?, enqueued_for = ? WHERE id = ?`)
      .bind(account, due, due, post).run()
    return { id: post, due }
  }

  it('حلّ موعدُه وما زال كما أُرسل له: يُختَم مرّةً واحدة', async () => {
    const { id, due } = await queuedFor(-1)
    expect(await claimDelivery(db, id, 'org_owner', due)).toEqual({ kind: 'claimed' })
    expect((await readPost(id))?.['dispatched_at']).not.toBeNull()
    expect(await claimDelivery(db, id, 'org_owner', due)).toEqual({ kind: 'stale' })
  })

  it('وصل قبل دقيقته: يُعاد بما بقي', async () => {
    const { id, due } = await queuedFor(120)
    const out = await claimDelivery(db, id, 'org_owner', due)
    expect(out.kind).toBe('early')
    if (out.kind === 'early') expect(out.seconds).toBeGreaterThanOrEqual(119)
    expect((await readPost(id))?.['dispatched_at']).toBeNull()
  })

  it('وتغيّر موعدُه أو سُحب: لا يفعل شيئًا', async () => {
    const moved = await queuedFor(-1)
    await db.prepare(`UPDATE posts SET scheduled_at = datetime('now', '+1 hour') WHERE id = ?`).bind(moved.id).run()
    expect(await claimDelivery(db, moved.id, 'org_owner', moved.due)).toEqual({ kind: 'stale' })
    const pulled = await queuedFor(-1)
    expect((await unschedule(db, pulled.id)).ok).toBe(true)
    expect(await claimDelivery(db, pulled.id, 'org_owner', pulled.due)).toEqual({ kind: 'stale' })
  })

  it('مراجعة D-320: وإعادةُ الرسالة نفسِها بعد ختمها تمضي بالختم الأوّل، والتسليمُ المكرَّرُ الأوّلُ لا', async () => {
    const { id, due } = await queuedFor(-1)
    expect(await claimDelivery(db, id, 'org_owner', due)).toEqual({ kind: 'claimed' })
    await db.prepare(`UPDATE posts SET dispatched_at = '2026-01-01 00:00:00' WHERE id = ?`).bind(id).run()
    expect(await claimDelivery(db, id, 'org_owner', due, true)).toEqual({ kind: 'claimed' })
    // ‏لا يُختَم ثانية: الكنّاسُ يعدّ من الختم الأوّل
    expect((await readPost(id))?.['dispatched_at']).toBe('2026-01-01 00:00:00')
    expect(await claimDelivery(db, id, 'org_owner', due, false)).toEqual({ kind: 'stale' })
    // ‏ونُشر: لا تمضي إعادة
    await db.prepare(`UPDATE posts SET status = 'published' WHERE id = ?`).bind(id).run()
    expect(await claimDelivery(db, id, 'org_owner', due, true)).toEqual({ kind: 'stale' })
  })

  it('مراجعة D-320: وختمُ الدورة الفوريّ يمحو العلامة، فإعادةُ رسالةٍ مؤجَّلةٍ تأخّرت بعده لا تمضي', async () => {
    const { id, due } = await queuedFor(-1)
    expect(await markDispatched(db, [id], new Date())).toEqual([{ id, org: 'org_owner' }])
    expect(await db.prepare('SELECT enqueued_for FROM posts WHERE id = ?').bind(id).first()).toEqual({ enqueued_for: null })
    expect(await claimDelivery(db, id, 'org_owner', due, true)).toEqual({ kind: 'stale' })
  })

  it('مراجعة D-320: والإيقافُ على إعادةٍ بعد الختم يرفع الختمَ والعلامة، وعلى تسليمٍ مكرَّرٍ أوّل لا يمسّ ختمَ أخيه', async () => {
    const twin = await queuedFor(-1)
    await claimDelivery(db, twin.id, 'org_owner', twin.due)
    const again = await queuedFor(-1)
    await claimDelivery(db, again.id, 'org_owner', again.due)
    await writeSetting(db, 'paused', 'true', 'test')
    expect((await claimDelivery(db, twin.id, 'org_owner', twin.due, false)).kind).toBe('paused')
    expect((await readPost(twin.id))?.['dispatched_at']).not.toBeNull()
    expect((await claimDelivery(db, again.id, 'org_owner', again.due, true)).kind).toBe('paused')
    const row = await db.prepare('SELECT dispatched_at, enqueued_for FROM posts WHERE id = ?').bind(again.id).first()
    expect(row).toEqual({ dispatched_at: null, enqueued_for: null })
  })

  it('والإيقافُ يغلب: لا يُختَم، وتُرفع علامتُه فتعيده الدورةُ بعد الاستئناف', async () => {
    const { id, due } = await queuedFor(-1)
    await writeSetting(db, 'paused', 'true', 'test')
    expect((await claimDelivery(db, id, 'org_owner', due)).kind).toBe('paused')
    const row = await db.prepare('SELECT dispatched_at, enqueued_for FROM posts WHERE id = ?').bind(id).first()
    expect(row).toEqual({ dispatched_at: null, enqueued_for: null })
  })
})

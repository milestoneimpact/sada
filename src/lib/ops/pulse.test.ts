/**
 * ‏**النبضُ من الخارج** (D-320): `/pulse` يقول ‏200 أو ‏503 بلا تفصيل، و«نبضٌ تأخّر» يخرج إلى قناة المالك.
 *
 * ‏كان النبضُ يُحكَم عليه في اللوحة وحدَها، والتنبيهاتُ من الـ Cron نفسِه: وقف الـ Cron فوقف مَن يقول إنّه وقف.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ScheduledController } from '@cloudflare/workers-types'
import { fakeDb, type FakeDb } from '../../test/fakes'
import { CONSUMER_GRACE_SECONDS, pulseReport } from './pulse'
import { collectAlerts } from '../alerts/collect'
import { looksSecret } from '../alerts/outbox'
import { saveWebhook } from '../alerts/webhook'
import { toBase64 } from '../crypto'
import worker, { app } from '../../index'

let db: FakeDb
beforeEach(() => { db = fakeDb() })

const NOW = new Date('2026-11-06T12:00:00Z')
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString().slice(0, 19).replace('T', ' ')

function beatAt(job: string, minutesAgo: number, outcome = 'ok'): void {
  db.raw.prepare(`INSERT INTO heartbeats (job, at, outcome) VALUES (?, ?, ?)
    ON CONFLICT(job) DO UPDATE SET at = excluded.at, outcome = excluded.outcome`).run(job, ago(minutesAgo), outcome)
}

async function handedToConsumer(minutesAgo: number, how: 'dispatched' | 'delayed'): Promise<string> {
  const id = crypto.randomUUID()
  const account = crypto.randomUUID()
  db.raw.prepare(`INSERT INTO accounts (id, platform, kind, external_id, display_name, status) VALUES (?, 'x', 'member', ?, 'عمر', 'active')`).run(account, `e-${account}`)
  const at = ago(minutesAgo)
  db.raw.prepare(`INSERT INTO posts (id, platform, type, text, status, idempotency_key, approved_by, approved_at, account_id, scheduled_at, dispatched_at, enqueued_for)
    VALUES (?, 'x', 'text', 'نصّ', 'queued', ?, 'panel', '2026-11-01T07:00:00Z', ?, ?, ?, ?)`)
    .run(id, `k-${id}`, account, at, how === 'dispatched' ? at : null, how === 'delayed' ? at : null)
  return id
}

describe('الحكم (D-320)', () => {
  it('الإرسالُ والتجديدُ دارا منذ دقائق ولا عملَ في يد المستهلك: سليم', async () => {
    beatAt('dispatch', 5)
    beatAt('renew', 5)
    expect(await pulseReport(db, NOW)).toEqual({ healthy: true, late: [] })
  })

  it('الإرسالُ لم يدُر منذ أربعين دقيقة: متأخّر', async () => {
    beatAt('dispatch', 40)
    beatAt('renew', 5)
    const r = await pulseReport(db, NOW)
    expect(r.healthy).toBe(false)
    expect(r.late.map((l) => [l.job, l.state])).toEqual([['dispatch', 'late']])
  })

  it('ولم يدُر قطّ، أو سقط في آخر مرّة: ليس سليمًا', async () => {
    beatAt('renew', 5)
    expect((await pulseReport(db, NOW)).late.map((l) => [l.job, l.state])).toEqual([['dispatch', 'never']])
    beatAt('dispatch', 5, 'failed')
    expect((await pulseReport(db, NOW)).late.map((l) => [l.job, l.state])).toEqual([['dispatch', 'failed']])
  })

  it('والمستهلكُ يُحكَم عليه بما سُلّم إليه: طابورٌ فارغٌ ليس تأخّرًا، وعملٌ مضت عليه نصفُ ساعةٍ بلا دورةٍ تأخّر', async () => {
    beatAt('dispatch', 5)
    beatAt('renew', 5)
    // ‏لم يدُر المستهلكُ منذ يومين، ولا شيءَ في يده: سليم
    beatAt('publish', 48 * 60)
    expect((await pulseReport(db, NOW)).healthy).toBe(true)
    // ‏ورسالةٌ خُتمت منذ عشرين دقيقة: لم تبلغ المهلة
    await handedToConsumer(20, 'dispatched')
    expect((await pulseReport(db, NOW)).healthy).toBe(true)
    // ‏ومؤجَّلةٌ حلّ موعدُها منذ أربعين دقيقةً ولم يدُر بعدها: متأخّر
    await handedToConsumer(40, 'delayed')
    const r = await pulseReport(db, NOW)
    expect(r.late.map((l) => l.job)).toEqual(['publish'])
    expect(r.late[0]!.lateBy).toBe(40 * 60 - CONSUMER_GRACE_SECONDS)
    // ‏ودار بعدها (إعادةٌ تنتظر): سليم
    beatAt('publish', 10)
    expect((await pulseReport(db, NOW)).healthy).toBe(true)
  })

  /*
   * ‏**تحقّق D-320 على main**: كان الحكمُ على أقدم ما سُلّم وحدَه، فمنشورٌ قديمٌ بقي في الطابور بعد دورةٍ للمستهلك (إعادةٌ
   * ‏تنتظر) يجعل «دار بعده» صادقًا أبدًا، ويُخفي ما سُلّم بعد آخر دورةٍ ولم يصله.
   */
  it('ومنشورٌ قديمٌ بقي في الطابور بعد آخر دورةٍ للمستهلك لا يُخفي ما سُلّم بعدها ولم يصله', async () => {
    beatAt('dispatch', 5)
    beatAt('renew', 5)
    // ‏دار المستهلكُ قبل خمسين دقيقة، وبقي بعدها منشورٌ سُلّم قبل سبعين (إعادةٌ تنتظر): ليس ركودًا
    beatAt('publish', 50)
    await handedToConsumer(70, 'dispatched')
    expect((await pulseReport(db, NOW)).healthy).toBe(true)
    // ‏ثمّ سُلّم منشورٌ قبل أربعين دقيقةً، بعد آخر دورة، ولم يدُر المستهلكُ بعده: ركود
    await handedToConsumer(40, 'delayed')
    const r = await pulseReport(db, NOW)
    expect(r.late.map((l) => [l.job, l.state])).toEqual([['publish', 'late']])
    expect(r.late[0]!.lateBy).toBe(40 * 60 - CONSUMER_GRACE_SECONDS)
    expect((await app.request('/pulse', {}, { DB: db } as never)).status).toBe(503)
  })

  it('وقاعدةٌ لا تُقرأ: ليس سليمًا', async () => {
    db.raw.exec('DROP TABLE heartbeats')
    expect((await pulseReport(db, NOW)).healthy).toBe(false)
  })
})

describe('/pulse (D-320)', () => {
  it('‏200 حين يسلم و‏503 حين يتأخّر، بلا تفصيلٍ ولا مصادقةٍ ولا تخبئة', async () => {
    db.raw.prepare(`INSERT INTO heartbeats (job, at, outcome) VALUES ('dispatch', datetime('now', '-5 minutes'), 'ok'), ('renew', datetime('now', '-5 minutes'), 'ok')`).run()
    const ok = await app.request('/pulse', {}, { DB: db } as never)
    expect(ok.status).toBe(200)
    expect(await ok.json()).toEqual({ ok: true })
    expect(ok.headers.get('Cache-Control')).toBe('no-store')

    db.raw.prepare(`UPDATE heartbeats SET at = datetime('now', '-50 minutes') WHERE job = 'dispatch'`).run()
    const late = await app.request('/pulse', {}, { DB: db } as never)
    expect(late.status).toBe(503)
    const body = await late.text()
    // ‏لا اسمَ دورةٍ ولا وقت: ما يتأخّر يُقرأ في اللوحة
    expect(JSON.parse(body)).toEqual({ ok: false })
    expect(body).not.toMatch(/dispatch|renew|publish|إرسال/)
  })
})

describe('«نبضٌ تأخّر» في قناة المالك (D-320)', () => {
  it('تنبيهٌ لكلّ تأخّر، بمفتاحٍ من آخر نبضٍ فلا يُعاد كلَّ ساعة، وبلا سرّ', async () => {
    beatAt('dispatch', 45)
    beatAt('renew', 5)
    const first = (await collectAlerts(db, NOW, 0)).filter((a) => a.kind === 'heartbeat')
    expect(first).toHaveLength(1)
    expect(first[0]!.ref).toBe(`heartbeat:dispatch:${ago(45)}`)
    expect(first[0]!.org).toBe('org_owner')
    expect(first[0]!.body).toContain('إرسال المجدول')
    expect(looksSecret(first[0]!.body)).toBe(false)
    // ‏ساعةٌ أخرى من التأخّر نفسِه (والتجديدُ دار في موعده): المفتاحُ نفسُه، فالقيدُ في `alert_outbox` يمنع التكرار
    beatAt('renew', -55)
    const later = (await collectAlerts(db, new Date(NOW.getTime() + 3600_000), 0)).filter((a) => a.kind === 'heartbeat')
    expect(later.map((a) => a.ref)).toEqual([`heartbeat:dispatch:${ago(45)}`])
    // ‏والقاعدةُ تقبل النوعَ الخامس
    db.raw.prepare(`INSERT INTO alert_outbox (ref, kind, body) VALUES (?, 'heartbeat', ?)`).run(first[0]!.ref, first[0]!.body)
  })

  it('ولا تنبيهَ لما سقط في آخر مرّة ودار في موعده: ذاك في اللوحة والسجلّ', async () => {
    beatAt('dispatch', 5, 'failed')
    beatAt('renew', 5)
    expect((await collectAlerts(db, NOW, 0)).filter((a) => a.kind === 'heartbeat')).toEqual([])
  })
})

/**
 * ‏**مراجعة D-320: السقوطُ المتّصلُ يُقال، والمستهلكُ لا يُرى سليمًا وقاعدتُه لا تُقرأ.**
 *
 * ‏تنبيهُ الساعة يُحسَب في `scheduled()` بعد دورتي التجديد والإرسال في الاستدعاء نفسِه، وكلٌّ منهما ينبض في كلّ فرع — فعمرُ
 * ‏نبضيهما ثوانٍ و«تأخّر» لا يقع لهما، و`failed` (وهو ما يقع) كان يُستبعَد. فالإرسالُ يسقط في كلّ دورةٍ ولا يصل المالكَ شيء.
 */
describe('مراجعة D-320: السقوطُ المتّصل', () => {
  const KEY = toBase64(crypto.getRandomValues(new Uint8Array(32)))
  afterEach(() => { vi.unstubAllGlobals() })

  function failedSince(job: string, minutesAgo: number, sinceMinutes: number): void {
    db.raw.prepare(`INSERT INTO heartbeats (job, at, outcome, failed_since) VALUES (?, ?, 'failed', ?)
      ON CONFLICT(job) DO UPDATE SET at = excluded.at, outcome = excluded.outcome, failed_since = excluded.failed_since`).run(job, ago(minutesAgo), ago(sinceMinutes))
  }

  it('بترتيب scheduled() الحقيقيّ: الطابورُ يرمي في كلّ دورة، فتنبيهٌ واحدٌ للسقوط كلِّه في قناة المالك', async () => {
    await saveWebhook(db, KEY, 'https://hooks.slack.com/services/T00/B00/zz9part', 'panel')
    const account = crypto.randomUUID()
    db.raw.prepare(`INSERT INTO accounts (id, platform, kind, external_id, display_name, status) VALUES (?, 'x', 'member', 'e1', 'عمر', 'active')`).run(account)
    db.raw.prepare(`INSERT INTO posts (id, platform, type, text, status, idempotency_key, approved_by, approved_at, account_id, scheduled_at)
      VALUES ('p1', 'x', 'text', 'نصّ', 'queued', 'k1', 'panel', '2026-11-01T07:00:00Z', ?, datetime('now', '-1 minute'))`).run(account)
    const posted: string[] = []
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).startsWith('https://hooks.slack.com/')) posted.push(String((JSON.parse(String(init?.body)) as { text: string }).text))
      return new Response('{}', { status: 200 })
    })
    const env = { SADA_ENV: 'staging', DB: db, TOKEN_ENC_KEY: KEY, PUBLISH_QUEUE: { async sendBatch(): Promise<never> { throw new Error('queue down') } } }
    const hourly = () => worker.scheduled({ cron: '7 * * * *' } as ScheduledController, env as never)
    // ‏أوّلُ سقوط: لا تنبيه — دورةٌ واحدةٌ تسقط تُرى في اللوحة والسجلّ
    await hourly()
    expect(posted.filter((p) => p.includes('إرسال المجدول'))).toEqual([])
    // ‏ثمّ مضت خمسٌ وأربعون دقيقةً من السقوط (ثلاثُ دوراتٍ ساقطة)
    db.raw.exec("UPDATE heartbeats SET at = datetime('now', '-15 minutes'), failed_since = datetime('now', '-45 minutes') WHERE job = 'dispatch'")
    await hourly()
    const alerts = posted.filter((p) => p.includes('إرسال المجدول'))
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toContain('تسقط')
    expect(looksSecret(alerts[0]!)).toBe(false)
    // ‏ودورةٌ أخرى من السقوط نفسِه: أوّلُه لم يتغيّر، فلا يُعاد
    await hourly()
    expect(posted.filter((p) => p.includes('إرسال المجدول'))).toHaveLength(1)
  })

  it('مفتاحُه أوّلُ السقوط: سقوطٌ دام يُقال مرّةً، وسقوطٌ جديدٌ بعد أن دارت مفتاحُه جديد، ودورةٌ واحدةٌ لا', async () => {
    failedSince('dispatch', 5, 45)
    beatAt('renew', 5)
    const first = (await collectAlerts(db, NOW, 0)).filter((a) => a.kind === 'heartbeat')
    expect(first.map((a) => a.ref)).toEqual([`heartbeat:dispatch:failed:${ago(45)}`])
    expect(first[0]!.body).toContain('إرسال المجدول')
    failedSince('dispatch', 5, 105)
    expect((await collectAlerts(db, new Date(NOW.getTime()), 0)).filter((a) => a.kind === 'heartbeat').map((a) => a.ref))
      .toEqual([`heartbeat:dispatch:failed:${ago(105)}`])
    // ‏التجديدُ كذلك
    failedSince('renew', 5, 40)
    expect((await collectAlerts(db, NOW, 0)).filter((a) => a.kind === 'heartbeat').map((a) => a.ref))
      .toContain(`heartbeat:renew:failed:${ago(40)}`)
    // ‏وسقوطٌ بدأ منذ عشر دقائق: لا
    failedSince('dispatch', 5, 10)
    failedSince('renew', 5, 10)
    expect((await collectAlerts(db, NOW, 0)).filter((a) => a.kind === 'heartbeat')).toEqual([])
  })

  it('وسؤالُ المستهلك يسقط: ليس سليمًا (لا يُرى سليمًا ما لا يُرى)، ولا يُخترَع له تنبيهُ ركود', async () => {
    beatAt('dispatch', 5)
    beatAt('renew', 5)
    const blind = {
      batch: db.batch,
      prepare(query: string) {
        // ‏سؤالُ المستهلك وحدَه (`consumerStall`): ما سواه يُقرأ
        if (/min\(coalesce\(dispatched_at, scheduled_at\)\)/.test(query)) throw new Error('D1_ERROR: overloaded')
        return db.prepare(query)
      },
    } as unknown as FakeDb
    const r = await pulseReport(blind, NOW)
    expect(r.healthy).toBe(false)
    expect(r.late.map((l) => [l.job, l.state])).toEqual([['publish', 'failed']])
    expect((await collectAlerts(blind, NOW, 0)).filter((a) => a.kind === 'heartbeat')).toEqual([])
    const res = await app.request('/pulse', {}, { DB: blind } as never)
    expect(res.status).toBe(503)
  })
})

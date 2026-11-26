/**
 * خيارا العميل للوكالة (D-412): موافقتُه تُمسك الجدولة حتّى يقول «موافق»، وتقريرُ الشهر يصل البريدَ آليًّا مرّةً للشهر —
 * وكلاهما مطفأٌ حتّى يُفتح.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { fakeDb, type FakeDb } from '../test/fakes'
import { fakeMailer } from '../test/emailLogin'
import { createLink, findLink, recordVerdict } from './clientReview'
import { readClientOptions, writeClientOptions } from './clientOptions'
import { dispatchDue, reschedulePost, restoreSchedule, schedulePost, unschedule } from './schedule/job'
import { scheduleDestinations } from './schedule/destinations'
import { mailMonthlyReports } from './report/mail'

const NOW = new Date('2098-12-20T10:00:00Z')
const KEY = 's1|linkedin|2099-01-04|07:00'
let db: FakeDb

beforeEach(() => {
  db = fakeDb()
  db.raw.exec(`INSERT INTO sources (id, drive_file_id, name, mime, content_hash) VALUES ('s1', 's1', 'تقرير', 'text/plain', 'md5:a')`)
  db.raw.exec(`INSERT INTO accounts (id, platform, kind, external_id, display_name, status) VALUES ('a1', 'linkedin', 'member', 'e1', 'عمر', 'active')`)
  const items = [{ sourceId: 's1', platform: 'linkedin', kind: 'text', angle: 'زاوية', day: '2099-01-04', time: '07:00', why: 'ل' }]
  db.raw.prepare(`INSERT INTO plans (id, week_start, plan_json, model, status, span, choices_json) VALUES ('pl1', '2099-01-04', ?, 'm', 'approved', 'week', ?)`)
    .run(JSON.stringify({ rationale: 'ر', items }), JSON.stringify({ channels: ['linkedin'], autoImage: false }))
  db.raw.exec(`INSERT INTO posts (id, platform, type, text, status, idempotency_key, plan_id, source_id, approved_by, approved_at) VALUES
    ('p1', 'linkedin', 'text', 'نصُّ المنشور', 'approved', 'k1', 'pl1', 's1', 'owner', '2098-12-01'),
    ('p2', 'linkedin', 'text', 'منشورٌ خارج الخطّة', 'approved', 'k2', NULL, NULL, 'owner', '2098-12-01')`)
})

async function say(verdict: 'approve' | 'changes', key = KEY): Promise<void> {
  const { token } = await createLink(db, 'org_owner', 'pl1', 'owner')
  const link = await findLink(db, token, new Date())
  await recordVerdict(db, link!, key, verdict, '')
}

const schedule = (id: string) => schedulePost(db, id, 'a1', '2099-01-04T04:00', NOW, 'org_owner')

describe('موافقةُ العميل قبل النشر (D-412)', () => {
  it('مطفأةٌ افتراضًا: يُجدوَل المعتمَدُ كما كان', async () => {
    expect(await readClientOptions(db, 'org_owner')).toEqual({ approvalRequired: false, reportMail: false })
    expect((await schedule('p1')).ok).toBe(true)
  })

  it('مفتوحةً: لا يُجدوَل قبل «موافق»، ولا بعد «أطلب تعديلًا»، ولا ما خرج عن الخطّة', async () => {
    await writeClientOptions(db, 'org_owner', { approvalRequired: true, reportMail: false })
    const none = await schedule('p1')
    expect(none).toMatchObject({ ok: false })
    expect(!none.ok && none.reason).toContain('لم يوافق')
    await say('changes')
    const changes = await schedule('p1')
    expect(!changes.ok && changes.reason).toContain('طلب العميلُ تعديل')
    const outside = await schedule('p2')
    expect(!outside.ok && outside.reason).toContain('خارج الخطّة')
    expect((db.raw.prepare("SELECT status FROM posts WHERE id = 'p1'").get() as { status: string }).status).toBe('approved')
  })

  it('«موافق» يفتح الجدولة، وموافقةٌ على موعدٍ آخر لا تُحسب', async () => {
    await writeClientOptions(db, 'org_owner', { approvalRequired: true, reportMail: false })
    await say('approve', 's1|linkedin|2099-01-05|07:00')
    expect((await schedule('p1')).ok).toBe(false)
    await say('approve')
    expect((await schedule('p1')).ok).toBe(true)
  })
})

describe('حارسُ الموافقة في كلّ أبواب الطابور (مراجعة D-425)', () => {
  const status = (id: string) => (db.raw.prepare('SELECT status, scheduled_at FROM posts WHERE id = ?').get(id) as { status: string; scheduled_at: string | null })

  beforeEach(async () => {
    await writeClientOptions(db, 'org_owner', { approvalRequired: true, reportMail: false })
    await say('approve')
    expect((await schedule('p1')).ok).toBe(true)
  })

  it('«غيّر الموعد» لمنشورٍ وافق العميلُ على موعده يُردّ بسببٍ مقروء، وبعد «أطلب تعديلًا» يُردّ بسببه', async () => {
    const moved = await reschedulePost(db, 'p1', '2099-01-05T04:00', NOW, 'org_owner')
    expect(!moved.ok && moved.reason).toContain('انقل البندَ في الخطّة')
    await say('changes')
    const held = await reschedulePost(db, 'p1', '2099-01-05T04:00', NOW, 'org_owner', true)
    expect(!held.ok && held.reason).toContain('طلب العميلُ تعديل')
    expect(status('p1').scheduled_at).toBe('2099-01-04 04:00:00')
  })

  it('التراجعُ عن السحب لا يعيد إلى الطابور ما طلب العميلُ تعديلَه بعد السحب', async () => {
    const pulled = await unschedule(db, 'p1', 'org_owner')
    expect(pulled.ok).toBe(true)
    await say('changes')
    const back = await restoreSchedule(db, 'p1', pulled.ok ? pulled.at : '', 'a1', 'org_owner')
    expect(!back.ok && back.reason).toContain('طلب العميلُ تعديل')
    expect(status('p1').status).toBe('approved')
  })

  it('رأيٌ تبدّل بعد الجدولة يُمسك المنشورَ عند الإرسال: يعود معتمَدًا بلا موعدٍ ويُكتب سببُه، ولا يُرسَل', async () => {
    await say('changes')
    const sent: unknown[] = []
    const out = await dispatchDue({ db, queue: { async sendBatch(m) { sent.push(...m) } }, now: () => new Date('2099-01-04T04:05:00Z') })
    expect(out.kind).toBe('none')
    expect(sent).toHaveLength(0)
    expect(status('p1')).toEqual({ status: 'approved', scheduled_at: null })
    const why = db.raw.prepare("SELECT detail FROM audit_log WHERE action = 'post.client_hold' AND target = 'p1'").all() as { detail: string }[]
    expect(why.map((w) => w.detail)).toEqual([expect.stringContaining('طلب العميلُ تعديل')])
  })

  it('ونسخةُ الوجهة الثانية يُحكم عليها برأي أصلها، فتُجدوَل ولا تُحذف', async () => {
    db.raw.exec(`INSERT INTO accounts (id, platform, kind, external_id, display_name, status) VALUES ('a2', 'linkedin', 'org', '111', 'صفحة', 'active')`)
    db.raw.exec(`INSERT INTO posts (id, platform, type, text, status, idempotency_key, plan_id, source_id, approved_by, approved_at) VALUES
      ('p3', 'linkedin', 'text', 'نصّ', 'approved', 'k3', 'pl1', 's1', 'owner', '2098-12-01')`)
    db.raw.exec(`DELETE FROM posts WHERE id = 'p1'`)
    const out = await scheduleDestinations(db, 'p3', ['a1', 'a2'], '2099-01-04T04:00', NOW, 'org_owner')
    expect(out.map((o) => o.result.ok)).toEqual([true, true])
    // ‏والنسخةُ لا تحمل الخطّة: «جدوِل الخطّة» لا يراها فلا يجدولها على حسابٍ آخر
    const copy = db.raw.prepare("SELECT plan_id FROM posts WHERE idempotency_key = 'k3:dest:a2'").get() as { plan_id: string | null }
    expect(copy.plan_id).toBeNull()
  })
})

describe('تقريرُ الشهر إلى البريد آليًّا (D-412)', () => {
  const NOV = new Date('2099-12-02T03:03:00Z')

  it('مطفأٌ افتراضًا: لا يُرسَل شيء', async () => {
    const mail = fakeMailer()
    expect(await mailMonthlyReports(db, mail, NOV, null)).toEqual([])
    expect(mail.sent).toHaveLength(0)
  })

  it('مفتوحًا: تقريرُ الشهر الذي انقضى مرّةً واحدة، إلى بريد المالك، بلا رمز', async () => {
    db.raw.exec(`INSERT INTO tokens (account_id, access_enc, access_iv, expires_at, scopes) VALUES ('a1', 'SECRET-CIPHER', 'SECRET-IV', '2100-01-01', 'w')`)
    await writeClientOptions(db, 'org_owner', { approvalRequired: false, reportMail: true })
    const mail = fakeMailer()
    expect(await mailMonthlyReports(db, mail, NOV, null)).toEqual([{ org: 'org_owner', month: '2099-11', sent: true }])
    expect(mail.sent).toHaveLength(1)
    expect(mail.sent[0]!.to).toBe('milestonesimpact@gmail.com')
    expect(mail.sent[0]!.raw).not.toContain('SECRET')
    expect(await mailMonthlyReports(db, mail, new Date('2099-12-03T03:03:00Z'), null)).toEqual([])
    expect(mail.sent).toHaveLength(1)
  })

  it('والشهرُ الذي انقضى بمنطقة المالك: فجرُ الأوّل بـ UTC آخرُ يومٍ في لوس أنجلوس، فلا يُرسَل شهرٌ لم ينقضِ (مراجعة D-425)', async () => {
    await writeClientOptions(db, 'org_owner', { approvalRequired: false, reportMail: true })
    const mail = fakeMailer()
    expect(await mailMonthlyReports(db, mail, NOV, 'America/Los_Angeles')).toEqual([{ org: 'org_owner', month: '2099-11', sent: true }])
    expect(await mailMonthlyReports(db, mail, new Date('2100-01-01T03:03:00Z'), 'America/Los_Angeles')).toEqual([])
  })

  it('بريدٌ لم يُرسَل يُعيد الحجز فيُعاد في الغد', async () => {
    await writeClientOptions(db, 'org_owner', { approvalRequired: false, reportMail: true })
    const out = await mailMonthlyReports(db, undefined, NOV, null)
    expect(out[0]).toMatchObject({ sent: false })
    const mail = fakeMailer()
    expect(await mailMonthlyReports(db, mail, NOV, null)).toEqual([{ org: 'org_owner', month: '2099-11', sent: true }])
  })

  it('تقريرٌ تعثّر بناؤه يُعيد الحجز ويُسجَّل غيرَ مُرسَل، فيُعاد في الغد (D-413)', async () => {
    await writeClientOptions(db, 'org_owner', { approvalRequired: false, reportMail: true })
    const broken = new Proxy(db, { get: (t, k) => k === 'prepare'
      ? (sql: string) => { if (sql.includes('FROM cost_ledger')) throw new Error('D1 timeout'); return t.prepare(sql) }
      : Reflect.get(t, k) as unknown }) as FakeDb
    const mail = fakeMailer()
    const out = await mailMonthlyReports(broken, mail, NOV, null)
    expect(out).toEqual([{ org: 'org_owner', month: '2099-11', sent: false, reason: 'D1 timeout' }])
    expect(mail.sent).toHaveLength(0)
    const row = db.raw.prepare('SELECT report_mailed_month AS m FROM client_options WHERE org_id = ?').get('org_owner') as { m: string | null }
    expect(row.m).toBeNull()
    const audit = db.raw.prepare("SELECT detail FROM audit_log WHERE action = 'report.mail.unsent' AND org_id = ?").all('org_owner') as { detail: string }[]
    expect(audit.map((a) => a.detail)).toEqual(['D1 timeout'])
    expect(await mailMonthlyReports(db, mail, new Date('2099-12-04T03:03:00Z'), null)).toEqual([{ org: 'org_owner', month: '2099-11', sent: true }])
    expect(mail.sent).toHaveLength(1)
  })
})

describe('بطاقةُ الخيارين في رحلة العميل (D-412)', () => {
  it('تُرسم مطفأةً، ويحفظها النموذج، ومربّعٌ غائبٌ يُطفئ', async () => {
    const { app } = await import('../index')
    const { emailLogin } = await import('../test/emailLogin')
    const { fakeKv } = await import('../test/fakes')
    const { toBase64 } = await import('./crypto')
    const env = {
      SADA_ENV: 'staging', PUBLIC_BASE_URL: 'https://sada2.basserh.com', DRIVE_FOLDER_ID: 'folder',
      DB: db, KV: fakeKv(), TOKEN_ENC_KEY: toBase64(new Uint8Array(32).fill(5)), ADMIN_TOKEN: 'Yk3pQ9vX2mLsA7nR4tWfZ8cB6dH1jG0e',
    }
    const cookie = ((await emailLogin(app, env)).headers.get('Set-Cookie') ?? '').split(';')[0]!
    const html = await (await app.request('/panel/client', { headers: { Cookie: cookie } }, env)).text()
    expect(html).toContain('id="options"')
    expect(html).not.toMatch(/name="approval_required" value="1" checked/)
    const csrf = /name="_csrf" value="([^"]+)"/.exec(html)?.[1] ?? ''
    const post = (fields: Record<string, string>) => {
      const f = new FormData()
      for (const [k, v] of Object.entries({ _csrf: csrf, ...fields })) f.set(k, v)
      return app.request('/panel/client/options', { method: 'POST', headers: { Cookie: cookie }, body: f }, env)
    }
    expect((await post({ approval_required: '1', report_mail: '1' })).status).toBe(303)
    expect(await readClientOptions(db, 'org_owner')).toEqual({ approvalRequired: true, reportMail: true })
    await post({ report_mail: '1' })
    expect(await readClientOptions(db, 'org_owner')).toEqual({ approvalRequired: false, reportMail: true })
  })
})

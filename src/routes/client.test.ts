/** رحلةُ العميل (D-257): الباب، والمحطّات، وحفظُ الموجز بحارسه. */
import { beforeEach, describe, expect, it } from 'vitest'
import { emailLogin } from '../test/emailLogin'
import { toBase64 } from '../lib/crypto'
import { COOKIE } from '../lib/session'
import { fakeDb, fakeKv, type FakeDb } from '../test/fakes'
import { app } from '../index'

let db: FakeDb
let env: Record<string, unknown>

beforeEach(() => {
  db = fakeDb()
  env = {
    SADA_ENV: 'staging', PUBLIC_BASE_URL: 'https://sada2.basserh.com', DRIVE_FOLDER_ID: 'folder',
    DB: db, KV: fakeKv(), TOKEN_ENC_KEY: toBase64(crypto.getRandomValues(new Uint8Array(32))), ADMIN_TOKEN: 'Yk3pQ9vX2mLsA7nR4tWfZ8cB6dH1jG0e',
  }
})

async function session(): Promise<{ cookie: string; csrf: string }> {
  const cookie = ((await emailLogin(app, env)).headers.get('Set-Cookie') ?? '').split(';')[0]!
  const html = await (await app.request('/panel/client', { headers: { Cookie: cookie } }, env)).text()
  return { cookie, csrf: /name="_csrf" value="([^"]+)"/.exec(html)?.[1] ?? '' }
}

describe('رحلةُ العميل', () => {
  it('لا تُفتح بلا جلسة', async () => {
    expect((await app.request('/panel/client', { headers: { Cookie: `${COOKIE}=gone` } }, env)).status).toBe(401)
  })

  it('المحطّاتُ السبع، والموجزُ أوّلُ ما ينقص', async () => {
    const { cookie } = await session()
    const html = await (await app.request('/panel/client', { headers: { Cookie: cookie } }, env)).text()
    for (const s of ['العميل', 'الموجز', 'القنوات', 'الخطّة', 'المحتوى', 'الكلفة', 'التحليل']) expect(html).toContain(` · ${s}</div>`)
    expect(html).toContain('لم يُكتب بعد')
    // ‏والتقدّمُ والتالي في سطرٍ واحد فوق البلاطات
    expect(html).toContain('<b>اكتمل 1 من 7</b> — التالي: <b>الموجز</b>.')
    expect(html).toContain('action="/panel/client/brief"')
  })

  it('الموجزُ يُحفظ بحارسه، والقنواتُ والإيقاعُ يقدّران الشهر', async () => {
    const { cookie, csrf } = await session()
    const body = new FormData()
    body.set('_csrf', csrf)
    body.set('goal', 'أن يُعرف خبيرًا في الحوكمة')
    body.append('channel', 'linkedin')
    body.append('channel', 'x')
    body.set('per_week', '3')
    const res = await app.request('/panel/client/brief', { method: 'POST', body, headers: { Cookie: cookie } }, env)
    expect(res.status).toBe(303)
    const html = await (await app.request('/panel/client?saved=1', { headers: { Cookie: cookie } }, env)).text()
    expect(html).toContain('حُفظ الموجز')
    expect(html).toContain('أن يُعرف خبيرًا في الحوكمة')
    expect(html).toContain('24 منشورًا')
    expect(html).toContain('ولا تقدير قبل أوّل مسوّدة')
    expect(html).toContain('بقي ربطُ LinkedIn وX')

    // ‏وبلا رمز النموذج لا يُحفظ شيء
    const bad = new FormData()
    bad.set('goal', 'تلاعب')
    expect((await app.request('/panel/client/brief', { method: 'POST', body: bad, headers: { Cookie: cookie } }, env)).status).toBe(403)
  })
})

describe('«ابدأ الخطّة» (D-258)', () => {
  function seedPlan(status: 'draft' | 'approved' = 'draft'): void {
    db.raw.exec(`INSERT INTO sources (id, drive_file_id, name, mime, content_hash) VALUES ('s1', 's1', 'تقرير', 'text/plain', 'md5:a')`)
    const items = [
      { sourceId: 's1', platform: 'linkedin', angle: 'زاوية أولى طويلة', day: '2026-10-25', time: '07:00', why: 'ل' },
      { sourceId: 's1', platform: 'linkedin', angle: 'زاوية مكرّرة طويلة', day: '2026-10-26', time: '07:00', why: 'ل' },
      { sourceId: 's1', platform: 'x', angle: 'زاوية ثالثة طويلة', day: '2026-10-27', time: '07:00', why: 'ل' },
    ]
    db.raw.prepare(`INSERT INTO plans (id, week_start, plan_json, model, status) VALUES ('pl1', '2026-10-25', ?, 'm', ?)`)
      .run(JSON.stringify({ rationale: 'ر', items }), status)
  }

  it('يعتمد الخطّة ويرسل كلَّ بندٍ مرّةً إلى الطابور، ولا يُنشر شيء', async () => {
    seedPlan()
    const sent: unknown[] = []
    env['GENERATE_QUEUE'] = { async sendBatch(b: { body: unknown }[]) { sent.push(...b.map((x) => x.body)) } }
    const { cookie, csrf } = await session()
    const html0 = await (await app.request('/panel/client', { headers: { Cookie: cookie } }, env)).text()
    expect(html0).toContain('action="/panel/plan/start"')
    const body = new FormData()
    body.set('_csrf', csrf)
    body.set('id', 'pl1')
    expect((await app.request('/panel/plan/start', { method: 'POST', body, headers: { Cookie: cookie } }, env)).status).toBe(303)
    expect(sent).toEqual([
      { draft: { sourceId: 's1', platform: 'linkedin', org: 'org_owner' } },
      { draft: { sourceId: 's1', platform: 'x', org: 'org_owner' } },
    ])
    expect(db.raw.prepare("SELECT status FROM plans WHERE id = 'pl1'").get()).toEqual({ status: 'approved' })
    expect(db.raw.prepare("SELECT count(*) AS n FROM posts").get()).toEqual({ n: 0 })
    const html = await (await app.request('/panel/client', { headers: { Cookie: cookie } }, env)).text()
    expect(html).toContain('بدأ العمل: 2 مسوّدات تُكتب في الخلفيّة')
  })

  it('ومعرّفٌ لغير خطّة العميل لا يُرسل شيئًا', async () => {
    seedPlan()
    const sent: unknown[] = []
    env['GENERATE_QUEUE'] = { async sendBatch(b: unknown[]) { sent.push(...b) } }
    const { cookie, csrf } = await session()
    const body = new FormData()
    body.set('_csrf', csrf)
    body.set('id', 'other')
    await app.request('/panel/plan/start', { method: 'POST', body, headers: { Cookie: cookie } }, env)
    expect(sent).toEqual([])
  })
})

describe('الخطّةُ لوحةً أو قائمة (D-259)', () => {
  it('أعمدةُ الأسبوع سبعة وبطاقاتُها بأسماء مصادرها، والنقلُ بـ JSON يحفظ', async () => {
    db.raw.exec(`INSERT INTO sources (id, drive_file_id, name, mime, content_hash) VALUES ('s1', 's1', 'تقرير الأثر', 'text/plain', 'md5:a')`)
    db.raw.prepare(`INSERT INTO plans (id, week_start, plan_json, model, status) VALUES ('pl1', '2026-10-25', ?, 'm', 'draft')`)
      .run(JSON.stringify({ rationale: 'ر', items: [{ sourceId: 's1', platform: 'linkedin', angle: 'زاوية الأسبوع', day: '2026-10-25', time: '07:00', why: 'ل' }] }))
    const { cookie, csrf } = await session()
    const html = await (await app.request('/panel/client', { headers: { Cookie: cookie } }, env)).text()
    const days = html.slice(html.indexOf('data-pv="days"'), html.indexOf('data-pv="platforms"'))
    expect(days.match(/class="pb-col"/g)).toHaveLength(7)
    expect(html).toContain('تقرير الأثر')
    // ‏خمسةُ عروضٍ للبنود نفسِها، وأوّلُها ظاهرٌ والباقي مخفيّ حتّى يُختار
    for (const v of ['days', 'platforms', 'calendar', 'list', 'table']) expect(html).toContain(`data-view="${v}"`)
    expect(html).toContain('data-pv="platforms" hidden')
    expect(html).toContain('data-set-platform="x"')
    expect(html.slice(html.indexOf('data-pv="calendar"')).match(/class="pb-col pb-cell"/g)).toHaveLength(7)
    const body = new FormData()
    body.set('_csrf', csrf); body.set('id', 'pl1'); body.set('index', '0'); body.set('day', '2026-10-27')
    const res = await app.request('/panel/plan/item', { method: 'POST', body, headers: { Cookie: cookie, Accept: 'application/json' } }, env)
    expect(await res.json()).toEqual({ ok: true })
    const bad = new FormData()
    bad.set('_csrf', csrf); bad.set('id', 'pl1'); bad.set('index', '0'); bad.set('day', '2027-01-01')
    expect((await app.request('/panel/plan/item', { method: 'POST', body: bad, headers: { Cookie: cookie, Accept: 'application/json' } }, env)).status).toBe(400)
  })
})

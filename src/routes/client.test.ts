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
      { draft: { sourceId: 's1', platform: 'linkedin', org: 'org_owner', planId: 'pl1', imageStyle: 'infographic' } },
      { draft: { sourceId: 's1', platform: 'x', org: 'org_owner', planId: 'pl1', imageStyle: 'infographic' } },
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

describe('محتوى البند والأصول (D-260)', () => {
  function seedPlan(): void {
    db.raw.exec(`INSERT INTO sources (id, drive_file_id, name, mime, content_hash) VALUES ('s1', 's1', 'تقرير', 'text/plain', 'md5:a')`)
    db.raw.prepare(`INSERT INTO plans (id, week_start, plan_json, model, status) VALUES ('pl1', '2026-10-25', ?, 'm', 'draft')`)
      .run(JSON.stringify({ rationale: 'ر', items: [{ sourceId: 's1', platform: 'linkedin', angle: 'زاوية', day: '2026-10-25', time: '07:00', why: 'ل' }] }))
  }

  it('الرحلةُ في ستّ خطوات، والبندُ بثلاثة أزرار: ولّد وارفع والأصول', async () => {
    seedPlan()
    const { cookie } = await session()
    const html = await (await app.request('/panel/client', { headers: { Cookie: cookie } }, env)).text()
    for (const s of ['قسّم', 'اختر', 'ولّد', 'عدّل وانقل', 'اعتمد', 'شكرًا']) expect(html).toContain(s)
    expect(html).toContain('aria-current="step"')
    expect(html).toContain('href="/panel/assets?plan=pl1&amp;index=0#upload"')
    expect(html).toContain('action="/panel/plan/item/remove"')
  })

  it('رفعُ صورةٍ من البند يحفظها في الأصول ويربطها به، والأصولُ تعرضها مصنَّفة', async () => {
    seedPlan()
    const store = new Map<string, ArrayBuffer>()
    env['MEDIA'] = {
      async put(k: string, v: ArrayBuffer) { store.set(k, v) },
      async get(k: string) { const v = store.get(k); return v === undefined ? null : { body: new Blob([v]).stream(), size: v.byteLength } },
    }
    const { cookie, csrf } = await session()
    const body = new FormData()
    body.set('_csrf', csrf); body.set('id', 'pl1'); body.set('index', '0')
    body.set('file', new File([new Uint8Array([1, 2, 3])], 'شعار.png', { type: 'image/png' }))
    const res = await app.request('/panel/assets/upload', { method: 'POST', body, headers: { Cookie: cookie } }, env)
    expect(res.headers.get('Location')).toBe('/panel/client#board')
    expect(store.size).toBe(1)
    const plan = JSON.parse((db.raw.prepare("SELECT plan_json FROM plans WHERE id = 'pl1'").get() as { plan_json: string }).plan_json) as { items: { asset?: string }[] }
    expect(plan.items[0]!.asset).toMatch(/^f:/)
    const page = await (await app.request('/panel/assets?plan=pl1&index=0', { headers: { Cookie: cookie } }, env)).text()
    expect(page).toContain('صور › مرفوعة ›')
    expect(page).toContain('اختر لهذا البند')
    const raw = await app.request(`/panel/assets/raw/${plan.items[0]!.asset!}`, { headers: { Cookie: cookie } }, env)
    expect(raw.status).toBe(200)
    expect(raw.headers.get('Content-Type')).toBe('image/png')
  })
})

describe('جدولةُ الخطّة من رحلة العميل (D-261)', () => {
  it('الشريطُ يقول «اعتمد» وزرَّ الجدولة، والجدولةُ تضع المعتمَد في طابوره', async () => {
    db.raw.exec(`INSERT INTO sources (id, drive_file_id, name, mime, content_hash) VALUES ('s1', 's1', 'تقرير', 'text/plain', 'md5:a')`)
    db.raw.exec(`INSERT INTO accounts (id, platform, kind, external_id, display_name, status) VALUES ('a1', 'linkedin', 'member', 'e1', 'عمر', 'active')`)
    db.raw.prepare(`INSERT INTO plans (id, week_start, plan_json, model, status) VALUES ('pl1', '2099-01-04', ?, 'm', 'approved')`)
      .run(JSON.stringify({ rationale: 'ر', items: [{ sourceId: 's1', platform: 'linkedin', angle: 'ز', day: '2099-01-05', time: '07:00', why: 'ل' }] }))
    db.raw.exec(`INSERT INTO posts (id, platform, type, text, status, idempotency_key, plan_id, source_id, approved_by, approved_at)
      VALUES ('p1', 'linkedin', 'text', 'نص', 'approved', 'k1', 'pl1', 's1', 'owner', datetime('now'))`)
    const { cookie, csrf } = await session()
    const html = await (await app.request('/panel/client', { headers: { Cookie: cookie } }, env)).text()
    expect(html).toContain('action="/panel/plan/schedule"')
    const body = new FormData()
    body.set('_csrf', csrf); body.set('id', 'pl1')
    expect((await app.request('/panel/plan/schedule', { method: 'POST', body, headers: { Cookie: cookie } }, env)).status).toBe(303)
    expect(db.raw.prepare("SELECT status, scheduled_at FROM posts WHERE id = 'p1'").get()).toEqual({ status: 'queued', scheduled_at: '2099-01-05 07:00:00' })
    const after = await (await app.request('/panel/client', { headers: { Cookie: cookie } }, env)).text()
    expect(after).toContain('وجُدولت')
  })
})

describe('تقريرُ الشهر (D-262)', () => {
  it('يُفتح من رحلة العميل بأرقامه الأربعة وزرّ الطباعة', async () => {
    const { cookie } = await session()
    const res = await app.request('/panel/client/report?month=2026-10', { headers: { Cookie: cookie } }, env)
    expect(res.status).toBe(200)
    const html = await res.text()
    for (const k of ['خرج', 'التفاعل', 'أُنفق', 'قادم']) expect(html).toContain(`<div class="kv-k">${k}</div>`)
    expect(html).toContain('data-print')
    expect(html).toContain('month=2026-09')
    expect(await (await app.request('/panel/client', { headers: { Cookie: cookie } }, env)).text()).toContain('href="/panel/client/report"')
  })
})

describe('أضف بندًا (D-264)', () => {
  it('النموذجُ بمصادر العميل، والإضافةُ تظهر على اللوحة', async () => {
    db.raw.exec(`INSERT INTO sources (id, drive_file_id, name, mime, content_hash) VALUES ('s1', 's1', 'تقرير الأثر', 'text/plain', 'md5:a')`)
    db.raw.prepare(`INSERT INTO plans (id, week_start, plan_json, model, status) VALUES ('pl1', '2026-10-25', ?, 'm', 'draft')`)
      .run(JSON.stringify({ rationale: 'ر', items: [] }))
    const { cookie, csrf } = await session()
    const html = await (await app.request('/panel/client', { headers: { Cookie: cookie } }, env)).text()
    expect(html).toContain('action="/panel/plan/item/add"')
    const body = new FormData()
    body.set('_csrf', csrf); body.set('id', 'pl1'); body.set('source', 's1'); body.set('platform', 'linkedin')
    body.set('day', '2026-10-26'); body.set('time', '09:00'); body.set('angle', 'زاوية أضفتُها بيدي')
    expect((await app.request('/panel/plan/item/add', { method: 'POST', body, headers: { Cookie: cookie } }, env)).status).toBe(303)
    expect(await (await app.request('/panel/client', { headers: { Cookie: cookie } }, env)).text()).toContain('زاوية أضفتُها بيدي')
  })
})

describe('«أرسله إلى بريدي» (D-268)', () => {
  it('إلى بريد المالك وحدَه، وبلا ربط EMAIL يُقال السببُ ولا يُدّعى الإرسال', async () => {
    const { cookie, csrf } = await session()
    const mailer = env['EMAIL']
    delete env['EMAIL']
    const body = new FormData()
    body.set('_csrf', csrf); body.set('month', '2026-10')
    const res = await app.request('/panel/client/report/send', { method: 'POST', body, headers: { Cookie: cookie } }, env)
    expect(res.headers.get('Location')).toBe('/panel/client/report?month=2026-10')
    expect(await (await app.request('/panel/client/report?month=2026-10', { headers: { Cookie: cookie } }, env)).text()).toContain('لم يُرسَل')
    // ‏ومع الربط يُرسَل
    const sent: unknown[] = []
    env['EMAIL'] = { async send(m: unknown) { sent.push(m) } }
    const again = new FormData()
    again.set('_csrf', csrf); again.set('month', '2026-10')
    await app.request('/panel/client/report/send', { method: 'POST', body: again, headers: { Cookie: cookie } }, env)
    expect(sent).toHaveLength(1)
    expect(await (await app.request('/panel/client/report?month=2026-10', { headers: { Cookie: cookie } }, env)).text()).toContain('أُرسل تقريرُ 2026-10')
    void mailer
  })
})

describe('المحفظة (D-273)', () => {
  it('تُفتح بفلاترها، وصفُّ كلّ شركةٍ بزرّ «افتحها»', async () => {
    const { cookie } = await session()
    const html = await (await app.request('/panel/portfolio?days=7&p=x', { headers: { Cookie: cookie } }, env)).text()
    expect(html).toContain('كلُّ شركاتك')
    // ‏شريطُ الفلتر الواحد: الفترةُ مختارة، وX مضغوطٌ بشعاره، والأرقامُ الأربعة باتّجاهها
    expect(html).toContain('class="fbar"')
    expect(html).toMatch(/aria-pressed="true" title="X"/)
    expect(html.match(/class="card kpi"/g)).toHaveLength(4)
    expect(html).toContain('action="/panel/orgs/switch"')
    expect(html).toContain('href="/panel/portfolio?days=90&amp;p=x"')
  })
})

/**
 * **الخطّةُ محورَ المنصّة** (D-282): «اعتمد الخطّة كاملةً» يعتمد مسوّداتِ هذه الخطّة لهذا العميل وحدها ولا ينشر،
 * و«ابنِ الخطّة» يردّ قناةً لا حسابَ لها، و«ابدأ» يحمل الفكرةَ واختيارَ الصورة إلى الطابور ويقول إنّ المقطعَ يُنتظر.
 */
describe('الخطّةُ محورَ المنصّة (D-282)', () => {
  function seedPlan(status: 'draft' | 'approved' = 'draft', choices: Record<string, unknown> = {}): void {
    db.raw.exec(`INSERT INTO sources (id, drive_file_id, name, mime, content_hash) VALUES ('s1', 's1', 'تقرير', 'text/plain', 'md5:a')`)
    const items = [
      { sourceId: 's1', platform: 'linkedin', kind: 'text', angle: 'زاوية أولى طويلة', day: '2026-11-01', time: '07:00', why: 'ل' },
      { sourceId: 'idea:1', platform: 'x', kind: 'text', angle: 'زاوية الفكرة طويلة', day: '2026-11-02', time: '07:00', why: 'ل' },
      { sourceId: 's1', platform: 'tiktok', kind: 'video', angle: 'زاوية المقطع طويلة', day: '2026-11-03', time: '07:00', why: 'ل' },
    ]
    db.raw.prepare(`INSERT INTO plans (id, week_start, plan_json, model, status, span, choices_json) VALUES ('pl1', '2026-11-01', ?, 'm', ?, 'week', ?)`)
      .run(JSON.stringify({ rationale: 'ر', items }), status, JSON.stringify({ channels: ['linkedin', 'x', 'tiktok'], ideas: ['فكرةٌ عن الوقف'], autoImage: true, ...choices }))
  }
  const post = (id: string, org: string, plan: string | null, status = 'draft'): void => {
    db.raw.prepare(`INSERT INTO posts (id, platform, type, text, status, idempotency_key, plan_id, source_id, org_id)
      VALUES (?, 'linkedin', 'text', 'نصٌّ يكفي لأن يكون منشورًا يُقرأ ويُعتمد كما كُتب', ?, ?, ?, 's1', ?)`).run(id, status, id, plan, org)
  }

  it('«اعتمد الخطّة كاملةً» يعتمد مسوّداتِ هذه الخطّة لهذا العميل وحدها، ولا يُنشر شيء', async () => {
    seedPlan('approved')
    db.raw.exec("INSERT INTO orgs (id, name, kind) VALUES ('org_b', 'عميل', 'agency')")
    post('p1', 'org_owner', 'pl1'); post('p2', 'org_owner', 'pl1'); post('p3', 'org_owner', null); post('p4', 'org_b', 'pl1'); post('p5', 'org_owner', 'pl1', 'rejected')
    const { cookie, csrf } = await session()
    const before = await (await app.request('/panel/client', { headers: { Cookie: cookie } }, env)).text()
    expect(before).toContain('action="/panel/plan/approve-all"')
    expect(before).toContain('اعتمد 2 مسوّدات من الخطّة')
    const body = new FormData()
    body.set('_csrf', csrf); body.set('id', 'pl1')
    expect((await app.request('/panel/plan/approve-all', { method: 'POST', body, headers: { Cookie: cookie } }, env)).status).toBe(303)
    const rows = db.raw.prepare('SELECT id, status, approved_by, approved_at FROM posts ORDER BY id').all() as { id: string; status: string; approved_by: string | null; approved_at: string | null }[]
    expect(rows.map((r) => [r.id, r.status])).toEqual([['p1', 'approved'], ['p2', 'approved'], ['p3', 'draft'], ['p4', 'draft'], ['p5', 'rejected']])
    expect(rows.filter((r) => r.status === 'approved').every((r) => r.approved_by !== null && r.approved_at !== null)).toBe(true)
    expect(db.raw.prepare("SELECT count(*) AS n FROM posts WHERE status IN ('queued', 'published')").get()).toEqual({ n: 0 })
    expect(db.raw.prepare("SELECT detail FROM audit_log WHERE action = 'plan.approve_all'").get()).toEqual({ detail: '2 اعتُمدت · 0 تعثّرت' })
    const after = await (await app.request('/panel/client', { headers: { Cookie: cookie } }, env)).text()
    expect(after).toContain('اعتُمدت مسوّدتان من الخطّة كما كُتبت')
    expect(after).toContain('action="/panel/plan/schedule"')
    expect(after).not.toContain('action="/panel/plan/approve-all"')
  })

  it('«ابنِ الخطّة» يردّ قناةً لا حسابَ لها قبل أيّ نداء، ويقبل المربوطة', async () => {
    const { cookie, csrf } = await session()
    const body = new FormData()
    body.set('_csrf', csrf); body.set('span', '2weeks'); body.append('channel', 'instagram')
    expect((await app.request('/panel/plan/generate', { method: 'POST', body, headers: { Cookie: cookie } }, env)).status).toBe(303)
    const html = await (await app.request('/panel', { headers: { Cookie: cookie } }, env)).text()
    expect(html).toContain('لا حسابَ مربوطًا على Instagram')
    expect(db.raw.prepare("SELECT count(*) AS n FROM audit_log WHERE action = 'plan.generate'").get()).toEqual({ n: 0 })
    // ‏واللوحةُ تحمل الطريقَ إلى «خطّة جديدة» لا النموذجَ نفسَه (D-283)
    expect(html).toContain('href="/panel/plan/new"')
    expect(html).not.toContain('name="ideas"')
    // ‏والشاشةُ بأمدائها الثلاثة ويوم بدايتها وأفكارها وصورتها — والشهران يقبلهما الخادمُ ولا يُعرَضان
    const screen = await (await app.request('/panel/plan/new', { headers: { Cookie: cookie } }, env)).text()
    for (const s of ['value="week"', 'value="2weeks"', 'value="month"', 'name="start"', 'name="ideas"', 'name="image_style" value="illustration"', 'name="source" value="all"', 'action="/panel/plan/generate"']) expect(screen).toContain(s)
    expect(screen).not.toContain('value="2months"')
    // ‏والمربوطُ وحدَه يُرى: لا خانةَ لمنصّةٍ غيرِ مربوطة ولا لما ليس في الخطّة اليوم
    expect(screen).not.toContain('value="instagram"')
    expect(screen).not.toContain('value="tiktok"')
  })

  it('«خطّة جديدة» (D-283): المربوطُ من LinkedIn وX وحدَه، والإيقاعُ مستوياتٌ تُختار، والزرُّ لا يظهر قبل أن يكتمل ما يلزم', async () => {
    db.raw.exec(`INSERT INTO accounts (id, platform, kind, external_id, display_name, status) VALUES
      ('a1', 'linkedin', 'member', 'e1', 'عمر', 'active'), ('a2', 'tiktok', 'member', 'e2', 'عمر', 'active')`)
    const { cookie } = await session()
    const screen = await (await app.request('/panel/plan/new', { headers: { Cookie: cookie } }, env)).text()
    expect(screen).toContain('name="channel" value="linkedin" checked')
    // ‏TikTok مربوطةٌ لكنّها ليست في خطّة اليوم، وX غيرُ مربوطة فتُذكَر برابطها لا بخانةٍ معطّلة
    expect(screen).not.toContain('value="tiktok"')
    expect(screen).not.toContain('name="channel" value="x"')
    expect(screen).toContain('X غير مربوطة')
    for (const n of ['2', '3', '5', 'custom']) expect(screen).toContain(`name="cadence_linkedin" value="${n}"`)
    expect(screen).toContain('name="cadence_custom_linkedin"')
    // ‏بلا مزوّدٍ ولا مصدرَين محلَّلين: السببُ وزرُّ علاجه، لا زرُّ بناءٍ يُضغط فيُردّ
    expect(screen).toContain('مزوّدُ الكتابة غير مضبوط بعد')
    expect(screen).not.toContain('حلّل وابنِ الخطّة')
  })

  it('«ابدأ» يحمل الفكرةَ واختيارَ الصورة إلى الطابور، ويقول إنّ بندَ المقطع ينتظر مقطعًا', async () => {
    seedPlan()
    const sent: unknown[] = []
    env['GENERATE_QUEUE'] = { async sendBatch(b: { body: unknown }[]) { sent.push(...b.map((x) => x.body)) } }
    const { cookie, csrf } = await session()
    const body = new FormData()
    body.set('_csrf', csrf); body.set('id', 'pl1')
    await app.request('/panel/plan/start', { method: 'POST', body, headers: { Cookie: cookie } }, env)
    expect(sent).toEqual([
      { draft: { sourceId: 's1', platform: 'linkedin', org: 'org_owner', planId: 'pl1', autoImage: true, imageStyle: 'infographic' } },
      { draft: { sourceId: 'idea:1', platform: 'x', org: 'org_owner', planId: 'pl1', idea: 'فكرةٌ عن الوقف', autoImage: true, imageStyle: 'infographic' } },
      { draft: { sourceId: 's1', platform: 'tiktok', org: 'org_owner', planId: 'pl1', autoImage: true, imageStyle: 'infographic' } },
    ])
    const html = await (await app.request('/panel/client', { headers: { Cookie: cookie } }, env)).text()
    expect(html).toContain('مع صورها')
    expect(html).toContain('بندُ مقطعٍ ينتظر مقطعًا')
    // ‏واللوحةُ ترسم رقاقةَ نوع البند
    expect(html).toContain('<span class="chip">مقطع</span>')
  })
})

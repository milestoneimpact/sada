/**
 * سطحُ الهجوم (D-318) من طرفه إلى طرفه: قناةُ التنبيهات سرٌّ للمالك وحدَه، وجردُ الأجهزة لصاحبه، وواجهةُ الإدارة بحدٍّ
 * وسجلٍّ ومفتاحٍ يفتحه المالك، و«/ready» و«/health» بلا أسماء، وحالةُ OAuth مربوطةٌ بالمتصفّح الذي بدأها، والمحرّرُ لا
 * يبدأ فعلًا مدفوعًا.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { emailLogin, fakeMailer } from '../test/emailLogin'
import { toBase64 } from '../lib/crypto'
import { fakeDb, fakeKv, type FakeDb } from '../test/fakes'
import { readWebhookUrl } from '../lib/alerts/webhook'
import { record, recentAudit } from '../lib/audit'
import { ROLE_LABEL } from '../lib/team'
import { app } from '../index'

const TOKEN = 'Yk3pQ9vX2mLsA7nR4tWfZ8cB6dH1jG0e'
const HOOK = 'https://hooks.slack.com/services/T00/B00/zz9Q7hookTOKENpart'
let db: FakeDb
let env: Record<string, unknown>

beforeEach(() => {
  db = fakeDb()
  env = {
    SADA_ENV: 'staging', PUBLIC_BASE_URL: 'https://sada2.basserh.com', DRIVE_FOLDER_ID: 'folder',
    DB: db, KV: fakeKv(), TOKEN_ENC_KEY: toBase64(crypto.getRandomValues(new Uint8Array(32))),
    ADMIN_TOKEN: TOKEN, EMAIL: fakeMailer(),
  }
})

const cookieOf = (res: Response): string => (res.headers.get('Set-Cookie') ?? '').split(';')[0]!

async function page(cookie: string, path: string): Promise<string> {
  return await (await app.request(path, { headers: { Cookie: cookie } }, env)).text()
}

async function post(cookie: string, path: string, fields: Record<string, string>): Promise<Response> {
  const csrf = /name="_csrf" value="([^"]+)"/.exec(await page(cookie, '/panel'))?.[1] ?? ''
  expect(csrf, 'رمز النموذج').not.toBe('')
  const body = new FormData()
  body.set('_csrf', csrf)
  for (const [k, v] of Object.entries(fields)) body.set(k, v)
  return app.request(path, { method: 'POST', body, headers: { Cookie: cookie } }, env)
}

/** عضوٌ مدعوٌّ بدوره، يدخل برمز بريده ومفتاح مروره كما يدخل. */
async function member(email: string, role: 'admin' | 'publisher' | 'editor' | 'viewer'): Promise<string> {
  db.raw.prepare("INSERT INTO members (email, role, orgs, invited_by) VALUES (?, ?, '*', 'owner')").run(email, role)
  const res = await emailLogin(app, env, { email })
  expect(res.status, `دخول ${email}`).toBe(303)
  return cookieOf(res)
}

describe('قناةُ التنبيهات سرٌّ للمالك وحدَه (D-318)', () => {
  it('يُحفَظ مشفَّرًا، والسجلُّ والإشعارُ والصفحةُ لا تحمل إلّا قناعَه', async () => {
    const owner = cookieOf(await emailLogin(app, env))
    const saved = await post(owner, '/panel/settings', { key: 'alert_webhook', value: HOOK })
    expect(saved.status).toBe(303)
    expect(await readWebhookUrl(db, String(env['TOKEN_ENC_KEY']))).toBe(HOOK)

    const raw = db.raw.prepare("SELECT value FROM settings WHERE key = 'alert_webhook'").get() as { value: string }
    expect(raw.value).not.toContain('hookTOKEN')
    const audit = db.raw.prepare("SELECT detail FROM audit_log WHERE action = 'settings.write' AND target = 'alert_webhook'").get() as { detail: string }
    expect(audit.detail).toBe('← https://hooks.slack.com/…part')

    const html = await page(owner, '/panel/settings')
    expect(html).toContain('https://hooks.slack.com/…part')
    expect(html).not.toContain('hookTOKEN')
    expect(html).toContain('أزل القناة')
  })

  it('والحقلُ الفارغُ لا يمحو القناة، و«أزل القناة» يمحوها', async () => {
    const owner = cookieOf(await emailLogin(app, env))
    await post(owner, '/panel/settings', { key: 'alert_webhook', value: HOOK })
    await post(owner, '/panel/settings', { key: 'alert_webhook', value: '' })
    expect(await readWebhookUrl(db, String(env['TOKEN_ENC_KEY']))).toBe(HOOK)
    await post(owner, '/panel/settings', { key: 'alert_webhook', value: '', clear: '1' })
    expect(await readWebhookUrl(db, String(env['TOKEN_ENC_KEY']))).toBe('')
  })

  it('والمديرُ يفتح الإعدادات فلا يرى القناةَ ولا قناعَها ولا ما خرج إليها، ولا يغيّرها', async () => {
    const owner = cookieOf(await emailLogin(app, env))
    await post(owner, '/panel/settings', { key: 'alert_webhook', value: HOOK })
    const admin = await member('sara@example.com', 'admin')
    const html = await page(admin, '/panel/settings')
    expect(html).toContain('قناة التنبيهات')
    expect(html).toContain('يضبطها المالك وحده')
    expect(html).not.toContain('hooks.slack.com')
    expect(html).not.toContain('value="alert_webhook"')
    const res = await post(admin, '/panel/settings', { key: 'alert_webhook', value: 'https://evil.example/x' })
    expect(res.status).toBe(303)
    expect(await readWebhookUrl(db, String(env['TOKEN_ENC_KEY']))).toBe(HOOK)
  })
})

describe('جردُ الأجهزة لصاحبه (D-318)', () => {
  it('المالكُ يرى أجهزةَ الأعضاء ببريد كلٍّ منها، والعضوُ لا يُحمَل له جردُ غيره', async () => {
    const owner = cookieOf(await emailLogin(app, env, { headers: { 'CF-Connecting-IP': '203.0.113.9' } }))
    await member('sara@example.com', 'admin')
    const html = await page(owner, '/panel/settings')
    expect(html).toContain('<bdi dir="ltr">sara@example.com</bdi>')

    // ‏والمديرُ لا يُرسَم له قسمُ الأجهزة، ولا يُحمَل له عنوانُ المالك
    const admin = cookieOf(await emailLogin(app, env, { email: 'sara@example.com' }))
    const theirs = await page(admin, '/panel/settings')
    expect(theirs).not.toContain('203.0.113.9')
  })
})

describe('أبوابُ التشغيل بلا أسماء (D-318)', () => {
  it('«/health» و«/ready» يقولان الحالَ وحدَها: لا اسمَ سرٍّ ولا خزانةٍ ولا بيئة', async () => {
    const health = await (await app.request('/health', {}, env)).json() as Record<string, unknown>
    expect(health).toEqual({ ok: true, service: 'sada-api' })

    const res = await app.request('/ready', {}, env)
    expect(res.status).toBe(503)
    const body = await res.json() as Record<string, unknown>
    // ‏(D-319) و`version` معه: معرّفُ النسخة المخدومة، و`null` حيث لا ربطَ له (هنا) — لا اسمَ سرٍّ ولا بيئة
    expect(body).toEqual({ ready: false, service: 'sada-api', database: 'ok', version: null })
    expect(JSON.stringify(body)).not.toMatch(/SECRET|CLIENT_ID|vault|staging/i)
  })

  it('«/ready» يقول أيَّ نسخةٍ يخدم (D-319): معرّفُها من ربط `version_metadata` كما هو، ولا يُخترَع بدونه', async () => {
    const id = '8d4b5f0e-2a1c-4e7b-9f3d-6c5a1b2e3f40'
    const meta = { id, tag: '', timestamp: '2026-11-07T00:00:00.000Z' }
    const served = await app.request('/ready', {}, { ...env, CF_VERSION_METADATA: meta })
    expect(served.status).toBe(503)
    expect(await served.json()).toEqual({ ready: false, service: 'sada-api', database: 'ok', version: id })

    // ‏ومعرّفٌ ليس نصًّا (ربطٌ تالف أو غيرُ ما يُنتظَر) لا يُكتب كما وصل: `null` لا `[object Object]`
    const odd = await app.request('/ready', {}, { ...env, CF_VERSION_METADATA: { id: 42 } })
    expect((await odd.json() as { version: unknown }).version).toBeNull()

    // ‏وتفصيلُ الإدارة يحمله كذلك، بالمعرّف نفسِه
    const detail = await app.request('/admin/ready', { headers: { Authorization: `Bearer ${TOKEN}` } }, { ...env, CF_VERSION_METADATA: meta })
    expect((await detail.json() as { version: unknown }).version).toBe(id)
  })

  it('والتفصيلُ خلف كلمة الإدارة، والإخفاقُ ردٌّ واحدٌ لا يقول شيئًا', async () => {
    const detail = await app.request('/admin/ready', { headers: { Authorization: `Bearer ${TOKEN}` } }, env)
    const body = await detail.json() as { missing_secrets: string[]; keys: { kid: string; previous: string | null; pending: number; legacy: number; recovery: number } }
    expect(body.missing_secrets).toContain('LINKEDIN_CLIENT_SECRET')
    // ‏وحالُ المفاتيح: أيُّها يعمل، ولا سابق، ولا شيءَ على غيره
    expect(body.keys).toEqual({ kid: expect.stringMatching(/^[0-9a-f]{8}$/), previous: null, pending: 0, legacy: 0, recovery: 0 })

    const bodies = new Set<string>()
    for (const [headers, extra] of [
      [{}, {}],
      [{ Authorization: 'Bearer wrong' }, {}],
      [{ Authorization: `Bearer <${TOKEN}>` }, {}],
      [{ Authorization: `Bearer ${TOKEN}` }, { ADMIN_TOKEN: '' }],
    ] as const) {
      const res = await app.request('/admin/ready', { headers }, { ...env, ...extra })
      expect(res.status).toBe(401)
      bodies.add(await res.text())
    }
    expect([...bodies]).toEqual(['{"error":"unauthorized"}'])
  })
})

describe('واجهةُ الإدارة برمزها (D-318)', () => {
  const auth = { Authorization: `Bearer ${TOKEN}` }

  it('كلُّ نداءٍ صفٌّ في سجلّ النشاط — والمردودُ بسببه — ولا رمزَ في صفّ', async () => {
    await app.request('/admin/ready', { headers: auth }, env)
    await app.request('/admin/ready', { headers: { Authorization: 'Bearer wrong-token-value' } }, env)
    const rows = db.raw.prepare("SELECT actor, action, target, detail FROM audit_log WHERE actor = 'admin_token' ORDER BY id").all()
    expect(rows).toEqual([
      { actor: 'admin_token', action: 'admin.call', target: '/admin/ready', detail: 'GET ← 503' },
      { actor: 'admin_token', action: 'admin.denied', target: '/admin/ready', detail: 'كلمة إدارة مخالفة بطول 17' },
    ])
    expect(JSON.stringify(db.raw.prepare('SELECT * FROM audit_log').all())).not.toContain(TOKEN)
  })

  it('وحدٌّ لكلّ مصدر: الحادي والثلاثون في ربع ساعةٍ يُردّ، ويُكتب صفٌّ واحد', async () => {
    const from = { ...auth, 'CF-Connecting-IP': '198.51.100.20' }
    for (let i = 0; i < 30; i += 1) expect((await app.request('/admin/ready', { headers: from }, env)).status).not.toBe(429)
    const over = await app.request('/admin/ready', { headers: from }, env)
    expect(over.status).toBe(429)
    expect(over.headers.get('Retry-After')).toBe('900')
    expect((await app.request('/admin/ready', { headers: from }, env)).status).toBe(429)
    expect(db.raw.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'admin.limited'").get()).toEqual({ n: 1 })
    // ‏ومصدرٌ آخرُ لا يُحاسَب بما فعل غيره
    expect((await app.request('/admin/ready', { headers: { ...auth, 'CF-Connecting-IP': '198.51.100.21' } }, env)).status).not.toBe(429)
  })

  it('والأبوابُ التي لا يناديها أحدٌ مغلقةٌ حتّى يفتحها المالك، والمسحُ والجاهزيّةُ مفتوحان', async () => {
    for (const [method, path] of [['GET', '/admin/providers'], ['GET', '/admin/sources'], ['POST', '/admin/analyze/s1']] as const) {
      const res = await app.request(path, { method, headers: auth }, env)
      expect(res.status, path).toBe(403)
      expect((await res.json() as { error: string }).error).toBe('endpoint_off')
    }
    expect((await app.request('/admin/ready', { headers: auth }, env)).status).toBe(503)
    expect((await app.request('/admin/scan', { method: 'POST', headers: auth }, { ...env, GOOGLE_SA_JSON: 'ليس json' })).status).toBe(502)

    db.raw.prepare("INSERT INTO settings (key, value, updated_by, org_id) VALUES ('admin_api', 'true', 'panel', 'org_owner')").run()
    expect((await app.request('/admin/providers', { headers: auth }, env)).status).toBe(200)
    expect((await app.request('/admin/sources', { headers: auth }, env)).status).toBe(200)
  })

  it('والمسارُ المرمَّز لا يتخطّى البابَ ولا الحدَّ ولا الرمز (D-315): الوسيطُ والموجِّهُ يقرآن المسارَ نفسَه', async () => {
    for (const path of ['/%61dmin/providers', '/admin/%70roviders', '/admin/sourc%65s']) {
      const off = await app.request(path, { headers: auth }, env)
      expect(off.status, path).toBe(403)
      expect((await off.json() as { error: string }).error, path).toBe('endpoint_off')
      expect((await app.request(path, {}, env)).status, path + ' بلا رمز').toBe(401)
    }
    expect(db.raw.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'admin.off'").get()).toEqual({ n: 3 })
  })

  it('والتحليلُ بكلمة الإدارة يقف عند سقف الإنفاق نفسِه قبل أيّ نداء، ولا يُكتب في الدفتر', async () => {
    db.raw.prepare("INSERT INTO settings (key, value, updated_by, org_id) VALUES ('admin_api', 'true', 'panel', 'org_owner')").run()
    db.raw.prepare("INSERT INTO sources (id, drive_file_id, name, mime, content_hash) VALUES ('s1', 'd1', 'تقرير', 'text/plain', 'md5:a')").run()
    db.raw.prepare("INSERT INTO cost_ledger (id, provider, operation, units, unit_cost, total) VALUES ('c0', 'anthropic', 'draft', 1, 9, 9)").run()
    let calls = 0
    const before = globalThis.fetch
    globalThis.fetch = (() => { calls += 1; return Promise.resolve(new Response('{}')) }) as typeof fetch
    try {
      const res = await app.request('/admin/analyze/s1', { method: 'POST', headers: auth }, { ...env, ANTHROPIC_API_KEY: 'sk-ant-test' })
      expect(res.status).toBe(423)
      expect((await res.json() as { reason: string }).reason).toContain('سقف الإنفاق')
    } finally {
      globalThis.fetch = before
    }
    expect(calls).toBe(0)
    expect(db.raw.prepare('SELECT COUNT(*) AS n FROM cost_ledger').get()).toEqual({ n: 1 })
  })
})

describe('المالكُ يفتح أبوابَ الطرفيّة من «للمطوّر» (D-318)', () => {
  it('البطاقةُ تقول إنّها مغلقة، وفتحُها يفتح الثلاثة، وإغلاقُها يردّها', async () => {
    const owner = cookieOf(await emailLogin(app, env))
    const html = await page(owner, '/panel/settings')
    expect(html).toContain('id="admin-api"')
    expect(html).toContain('الثلاثة الأخرى <b>مغلقة</b>')
    // ‏(مراجعة D-325) **والبابُ زرٌّ لا نصّ**: نُقل إلى `button()` داخل قالب `html` فهُرِّب، فصار النموذجُ بلا زرّ إرسال
    // ‏وظهر الوسمُ نصًّا — ومالكٌ فتح الأبوابَ قبل النشر لا يغلقها من اللوحة. والاختبارُ كان يرسل POST بيده فلا يرى ذلك
    const toggle = (page: string): string => {
      const card = page.slice(page.indexOf('id="admin-api"'), page.indexOf('</form>', page.indexOf('id="admin-api"')))
      expect(card).toContain('name="key" value="admin_api"')
      return card
    }
    expect(toggle(html)).toContain('<button class="btn btn-secondary" type="submit"><span>افتحها</span></button>')
    expect(html).not.toContain('&lt;button')
    const auth = { Authorization: `Bearer ${TOKEN}` }
    expect((await app.request('/admin/sources', { headers: auth }, env)).status).toBe(403)

    expect((await post(owner, '/panel/settings', { key: 'admin_api', value: 'true' })).status).toBe(303)
    expect((await app.request('/admin/sources', { headers: auth }, env)).status).toBe(200)
    const opened = await page(owner, '/panel/settings')
    expect(opened).toContain('الثلاثة الأخرى <b>مفتوحة</b>')
    expect(toggle(opened)).toContain('<input type="hidden" name="value" value="false">')
    expect(toggle(opened)).toContain('<button class="btn btn-secondary" type="submit"><span>أغلقها</span></button>')
    expect(opened).not.toContain('&lt;button')

    await post(owner, '/panel/settings', { key: 'admin_api', value: 'false' })
    expect((await app.request('/admin/sources', { headers: auth }, env)).status).toBe(403)
  })
})

/*
 * ‏(D-318) كانت حالةُ OAuth مربوطةً بمنظّمة من بدأ وحدَها (في KV)، فرابطُ الموافقة الذي يُرسَل إلى شخصٍ آخر يُكمل الدورة
 * ‏إن وافق: مديرٌ يرسل رابطَ LinkedIn إلى المالك فيُربَط حسابُ المالك في منظّمة المدير. فصار البدءُ يكتب كعكةً قصيرة
 * ‏`__Host-` بقيمةٍ عشوائيّة، وبصمتُها في الحالة، والعودةُ لا تُكمل إلّا من المتصفّح الذي يحملها.
 */
describe('حالةُ OAuth مربوطةٌ بالمتصفّح الذي بدأها (D-318)', () => {
  const LI = { LINKEDIN_CLIENT_ID: 'li-id', LINKEDIN_CLIENT_SECRET: 'li-secret-long-enough' }

  function stubLinkedIn(): () => void {
    const before = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('accessToken')) {
        return Response.json({ access_token: 'li-access', expires_in: 5_184_000, scope: 'openid profile w_member_social' })
      }
      return Response.json({ sub: 'urn:li:person:owner', name: 'المالك' })
    }) as typeof fetch
    return () => { globalThis.fetch = before }
  }

  async function begin(cookie: string): Promise<{ state: string; binding: string; setCookie: string }> {
    const res = await app.request('/oauth/linkedin/start', { headers: { Cookie: cookie } }, { ...env, ...LI })
    expect(res.status).toBe(302)
    const setCookie = res.headers.get('Set-Cookie') ?? ''
    return {
      state: new URL(res.headers.get('Location') ?? '').searchParams.get('state') ?? '',
      binding: setCookie.split(';')[0]!,
      setCookie,
    }
  }

  it('البدءُ يكتب كعكةً قصيرةً __Host- لا يقرؤها سكربت، وتعبر العودةَ من المنصّة', async () => {
    const owner = cookieOf(await emailLogin(app, env))
    const { setCookie } = await begin(owner)
    expect(setCookie).toMatch(/^__Host-sada-oauth-linkedin=[A-Za-z0-9_-]{43}; /)
    expect(setCookie).toContain('Path=/')
    expect(setCookie).toContain('Secure')
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('SameSite=Lax')
    expect(setCookie).toContain('Max-Age=600')
    expect(setCookie).not.toContain('Domain')
  })

  it('العودةُ من المتصفّح نفسِه تربط، ومن متصفّحٍ آخر تُردّ ولا يُحفَظ شيء', async () => {
    const restore = stubLinkedIn()
    try {
      const owner = cookieOf(await emailLogin(app, env))
      // ‏رابطُ موافقةٍ بدأه المالكُ ثمّ فُتح في متصفّحٍ آخر (أُرسل إلى شخصٍ آخر)
      const sent = await begin(owner)
      const other = await app.request(`/oauth/linkedin/callback?code=c&state=${sent.state}`, {}, { ...env, ...LI })
      expect(other.status).toBe(400)
      expect(await other.text()).toContain('بدأ في متصفّحٍ آخر')
      expect(db.raw.prepare('SELECT COUNT(*) AS n FROM accounts').get()).toEqual({ n: 0 })
      expect(db.raw.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'oauth.state.mismatch'").get()).toEqual({ n: 1 })
      // ‏والحالةُ استُهلكت: لا يُعاد بها من المتصفّح الصحيح بعد ذلك
      expect((await app.request(`/oauth/linkedin/callback?code=c&state=${sent.state}`, { headers: { Cookie: sent.binding } }, { ...env, ...LI })).status).toBe(400)

      // ‏وكعكةُ دورةٍ أخرى لا تكفي: البصمةُ لكلّ دورة
      const a = await begin(owner)
      const b = await begin(owner)
      expect((await app.request(`/oauth/linkedin/callback?code=c&state=${a.state}`, { headers: { Cookie: b.binding } }, { ...env, ...LI })).status).toBe(400)

      const mine = await begin(owner)
      const ok = await app.request(`/oauth/linkedin/callback?code=c&state=${mine.state}`, { headers: { Cookie: mine.binding } }, { ...env, ...LI })
      expect(ok.status).toBe(200)
      expect(ok.headers.get('Set-Cookie') ?? '').toMatch(/^__Host-sada-oauth-linkedin=; .*Max-Age=0/)
      expect(db.raw.prepare('SELECT COUNT(*) AS n FROM accounts').get()).toEqual({ n: 1 })
    } finally {
      restore()
    }
  })

  it('وربطان لمنصّتين في وقتٍ واحد لا يُسقط أحدُهما الآخر: لكلّ منصّةٍ كعكتُها', async () => {
    const restore = stubLinkedIn()
    try {
      const owner = cookieOf(await emailLogin(app, env))
      // ‏المالكُ يضغط «اربط» لـLinkedIn ثمّ لـX في لسانٍ آخر قبل أن يُكمل الأوّل — والمتصفّحُ يحمل الكعكتين
      const li = await begin(owner)
      const x = await app.request('/oauth/x/start', { headers: { Cookie: owner } }, { ...env, ...LI, X_CLIENT_ID: 'x-id', X_CLIENT_SECRET: 'x-secret-long-enough' })
      expect(x.status).toBe(302)
      const xCookie = (x.headers.get('Set-Cookie') ?? '').split(';')[0]!
      expect(xCookie.split('=')[0]).not.toBe(li.binding.split('=')[0])
      const jar = [owner, li.binding, xCookie].join('; ')
      const ok = await app.request(`/oauth/linkedin/callback?code=c&state=${li.state}`, { headers: { Cookie: jar } }, { ...env, ...LI })
      expect(ok.status).toBe(200)
      expect(db.raw.prepare('SELECT COUNT(*) AS n FROM accounts').get()).toEqual({ n: 1 })
    } finally {
      restore()
    }
  })
})

/*
 * ‏(D-318) كان المحرّرُ — وهو لا يعتمد — يبدأ كلَّ فعلٍ مدفوع: توليدَ الخطّة والكتابةَ بالذكاء والصورَ وتحريكَها فيديو،
 * ‏والسقوفُ وحدَها تحدّه. فصار الإنفاقُ للناشر فما فوق على الخادم، والمحرّرُ يرى السببَ مكتوبًا تحت الزرّ.
 */
describe('الإنفاقُ لمن يعتمد: المحرّرُ يكتب ويعدّل ولا يبدأ نداءً مدفوعًا (D-318)', () => {
  it('الخادمُ يردّ أفعالَه المدفوعة قبل أيّ نداء، ولا يُكتب في الدفتر', async () => {
    const editor = await member('ed@example.com', 'editor')
    for (const [path, fields] of [
      ['/panel/drafts/idea', { idea: 'فكرةٌ قصيرة للاختبار', platform: 'linkedin' }],
      ['/panel/drafts/write', { id: 's1', platform: 'linkedin' }],
      ['/panel/plan/generate', { span: 'week' }],
      ['/panel/media/generate', { id: 'p1', style: 'infographic' }],
      ['/panel/media/animate', { id: 'p1' }],
      ['/panel/uploads/u1/captions', { about: 'مقطع' }],
    ] as const) {
      const res = await post(editor, path, fields)
      expect(res.status, path).toBe(303)
      expect(res.headers.get('Location'), path).toBe('/panel')
    }
    expect(db.raw.prepare('SELECT COUNT(*) AS n FROM cost_ledger').get()).toEqual({ n: 0 })
    expect(db.raw.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action IN ('draft.idea', 'draft.write', 'plan.generate', 'media.generate', 'media.animate', 'upload.captions')").get()).toEqual({ n: 0 })
    // ‏والناشرُ يمرّ الحارسَ إلى المسار نفسِه (يردّه المسارُ بسببه، لا الدور)
    const publisher = await member('pub@example.com', 'publisher')
    const res = await post(publisher, '/panel/drafts/idea', { idea: 'فكرةٌ قصيرة للاختبار', platform: 'linkedin' })
    expect(res.headers.get('Location')).not.toBe('/panel')
  })

  it('والمُنشئُ يقول له لماذا — سببٌ مكتوبٌ تحت الزرّ، لا زرٌّ رماديٌّ صامت', async () => {
    const editor = await member('ed@example.com', 'editor')
    const html = await page(editor, '/panel')
    expect(html).toContain('aria-disabled="true" aria-describedby="di-why"')
    expect(html).toContain('<small class="btn-why" id="di-why">يبدؤه الناشر أو المدير أو المالك')

    const publisher = await member('pub@example.com', 'publisher')
    const theirs = await page(publisher, '/panel')
    expect(theirs).not.toContain('يبدؤه الناشر أو المدير أو المالك')
  })
})

/*
 * ‏**مراجعةُ D-318** — بوّابةُ الطرفيّة: المجهولُ لا يدفع أحداثَ الأمان خارج «سجلّ النشاط»، ولا يُغلق القاطعُ العامُّ الطرفيّةَ على
 * ‏صاحب الرمز، ولكلّ حدٍّ يردّ صفُّه في السجلّ.
 */
describe('مراجعة D-318 · بوّابةُ الطرفيّة', () => {
  const auth = { Authorization: `Bearer ${TOKEN}` }
  const call = async (ip: string, headers: Record<string, string> = {}): Promise<Response> =>
    await app.request('/admin/ready', { headers: { ...headers, 'CF-Connecting-IP': ip } }, env)
  const count = (where: string): unknown => db.raw.prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE ${where}`).get()

  it('المردودُ يُكتب عند أوّله ثمّ عند كلّ ضعف، و«سجلّ النشاط» يطويه سطرًا فلا يدفع ما سواه خارج العرض', async () => {
    await record(db, { actor: 'panel', action: 'settings.write', target: 'paused', detail: '← true' })
    for (const ip of ['198.51.100.7', '203.0.113.7', '192.0.2.7']) {
      for (let i = 0; i < 30; i += 1) expect((await call(ip)).status).toBe(401)
    }
    // ‏ثلاثون مردودًا من كلّ مصدر: صفٌّ عند 1 و2 و4 و8 و16 — خمسةٌ لا ثلاثون
    expect(count("action = 'admin.denied'")).toEqual({ n: 15 })
    const latest = db.raw.prepare("SELECT detail FROM audit_log WHERE action = 'admin.denied' ORDER BY id DESC LIMIT 1").get() as { detail: string }
    expect(latest.detail).toContain('16')

    const shown = await recentAudit(db, 'org_owner', 50)
    expect(shown.filter((a) => a.action === 'admin.denied')).toHaveLength(1)
    expect(shown.find((a) => a.action === 'admin.denied')?.detail).toContain('و14 مثلُه قبله')
    expect(shown.some((a) => a.action === 'settings.write')).toBe(true)
  })

  it('والقاطعُ العامُّ يعدّ المردودَ وحدَه: عشرةُ عناوين لا تُغلق الطرفيّةَ على صاحب الرمز، وللقاطع صفُّه', async () => {
    for (let a = 1; a <= 10; a += 1) {
      for (let i = 0; i < 30; i += 1) await call(`198.51.${a}.9`)
    }
    expect((await call('198.51.77.9')).status).toBe(429)
    expect((await call('198.51.88.9', auth)).status).not.toBe(429)
    expect(count("action = 'admin.limited' AND detail LIKE '%عناوين شتّى%'")).toEqual({ n: 1 })
  })

  it('ولـIPv4 شبكتُه /24 في المردود: ستّون منها ثمّ يُردّ ما بعدها، وصاحبُ الرمز منها يمرّ', async () => {
    for (let a = 1; a <= 3; a += 1) {
      for (let i = 0; i < 20; i += 1) expect((await call(`203.0.113.${a}`)).status).toBe(401)
    }
    expect((await call('203.0.113.4')).status).toBe(429)
    expect((await call('203.0.113.5', auth)).status).not.toBe(429)
    expect(count("action = 'admin.limited' AND detail LIKE '%شبكة%'")).toEqual({ n: 1 })
  })

  it('وشبكةُ IPv6 /48 تردّ ما فوق ستّين، ولردّها صفٌّ في السجلّ كما لحدّ العنوان', async () => {
    const codes: number[] = []
    for (const net of ['2001:db8:1:1::5', '2001:db8:1:2::5', '2001:db8:1:3::5']) {
      for (let i = 0; i < 21; i += 1) codes.push((await call(net, auth)).status)
    }
    expect(codes.filter((s) => s === 429)).toHaveLength(3)
    expect(count("action = 'admin.limited' AND detail LIKE '%شبكة%'")).toEqual({ n: 1 })
  })
})

describe('مراجعة D-318 · ما يُقال للمحرّر يطابق ما يفتحه الخادم', () => {
  it('لا يُوعَد بكتابة مسوّدةٍ لا بابَ لها: السببُ يقول ما يفتحه فعلًا', async () => {
    const editor = await member('ed@example.com', 'editor')
    const html = await page(editor, '/panel')
    expect(html).not.toContain('وكتابة المسوّدة وتعديلها مفتوحان لك')
    expect(html).toContain('وتعديل المسوّدات القائمة')
    // ‏ومنذ D-324 للمحرّر بابٌ يكتب منه بلا كلفة، فالسببُ يدلّه عليه
    expect(html).toContain('واكتب أنت «بنفسي» بلا كلفة')
    expect(ROLE_LABEL.editor.can).toContain('«بنفسي»')
    expect(ROLE_LABEL.editor.can).not.toMatch(/^يكتب/)
  })
})


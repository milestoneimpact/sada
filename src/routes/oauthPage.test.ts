/**
 * ‏ربطُ صفحة LinkedIn بالتطبيق الثاني (D-423 · M-03): بلا سرّين حالٌ عربيّة لا عطل، وبهما اختيارُ الصفحات التي يديرها
 * ‏المالكُ وحفظُ كلٍّ حسابًا بنوع `org` ورمزُها مشفّرٌ (D-005).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { toBase64 } from '../lib/crypto'
import { loadTokens } from '../lib/tokens'
import { LINKEDIN } from '../lib/oauth/providers'
import { fakeDb, fakeFetch, fakeKv, type FakeDb } from '../test/fakes'
import { app } from '../index'
import { emailLogin } from '../test/emailLogin'
import { bindingCookieName } from '../lib/oauth/state'
import { allows, requiredRole } from '../lib/access'

const KEY = toBase64(crypto.getRandomValues(new Uint8Array(32)))
const ADMIN_TOKEN = 'admin-token-for-oauth-tests-0123456789'
const realFetch = globalThis.fetch
const ACLS = 'https://api.linkedin.com/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED&count=100'

let db: FakeDb
let env: Record<string, unknown>

beforeEach(() => {
  db = fakeDb()
  env = {
    SADA_ENV: 'staging', PUBLIC_BASE_URL: 'https://sada2.basserh.com', DRIVE_FOLDER_ID: 'f', DB: db, KV: fakeKv(), TOKEN_ENC_KEY: KEY,
    LINKEDIN_CLIENT_ID: 'li-id', LINKEDIN_CLIENT_SECRET: 'li-secret', X_CLIENT_ID: 'x', X_CLIENT_SECRET: 'x', ADMIN_TOKEN,
  }
})
afterEach(() => { globalThis.fetch = realFetch })

async function session(): Promise<string> {
  const r = await emailLogin(app, env)
  return (r.headers.get('Set-Cookie') ?? '').split(';')[0]!
}

describe('صفحة LinkedIn بلا سرّي التطبيق الثاني', () => {
  it('«اربط صفحة LinkedIn» يعود إلى الإعداد، والشاشةُ تقول «بانتظار موافقة LinkedIn»', async () => {
    const cookie = await session()
    const r = await app.request('/oauth/linkedin-page/start', { headers: { Cookie: cookie } }, env)
    expect(r.status).toBe(303)
    expect(r.headers.get('location')).toBe('/panel/channels/linkedin?tab=setup')
    const page = await (await app.request('/panel/channels/linkedin?tab=setup', { headers: { Cookie: cookie } }, env)).text()
    expect(page).toContain('بانتظار موافقة LinkedIn على Community Management API (M-03)')
    expect(page).not.toContain('href="/oauth/linkedin-page/start"')
  })

  it('و/admin/ready يذكرهما اختياريّين ولا يمنع الجاهزيّة بهما', async () => {
    const r = await app.request('/admin/ready', { headers: { Authorization: `Bearer ${ADMIN_TOKEN}` } }, env)
    const body = await r.json() as { missing_secrets: string[]; missing_optional_secrets: string[] }
    expect(body.missing_optional_secrets).toEqual(['LINKEDIN_ORG_CLIENT_ID', 'LINKEDIN_ORG_CLIENT_SECRET'])
    expect(body.missing_secrets).not.toContain('LINKEDIN_ORG_CLIENT_ID')
  })
})

describe('صفحة LinkedIn بالتطبيق الثاني', () => {
  beforeEach(() => {
    env['LINKEDIN_ORG_CLIENT_ID'] = 'org-id'
    env['LINKEDIN_ORG_CLIENT_SECRET'] = 'org-secret'
  })

  it('يطلب نطاقَي الصفحة بمعرّف التطبيق الثاني وعودةٍ على النطاق نفسِه، ثمّ يختار المالكُ الصفحات فتُحفظ مشفّرة', async () => {
    const cookie = await session()
    const page = await (await app.request('/panel/channels/linkedin?tab=setup', { headers: { Cookie: cookie } }, env)).text()
    expect(page).toContain('href="/oauth/linkedin-page/start"')

    const start = await app.request('/oauth/linkedin-page/start', { headers: { Cookie: cookie } }, env)
    expect(start.status).toBe(302)
    const url = new URL(start.headers.get('location')!)
    expect(url.searchParams.get('client_id')).toBe('org-id')
    expect(url.searchParams.get('scope')).toBe('w_organization_social r_organization_social')
    expect(url.searchParams.get('redirect_uri')).toBe('https://sada2.basserh.com/oauth/linkedin-page/callback')
    const state = url.searchParams.get('state')!
    const binding = (start.headers.get('Set-Cookie') ?? '').split(';')[0]!
    expect(binding.startsWith(bindingCookieName('linkedin-page') + '=')).toBe(true)

    globalThis.fetch = fakeFetch({
      [LINKEDIN.tokenUrl]: { json: { access_token: 'page-access-secret', refresh_token: 'page-refresh', expires_in: 5_184_000, scope: 'w_organization_social,r_organization_social' } },
      [ACLS]: { json: { elements: [
        { organization: 'urn:li:organization:111', role: 'ADMINISTRATOR', state: 'APPROVED' },
        { organization: 'urn:li:organization:222', role: 'ADMINISTRATOR', state: 'APPROVED' },
      ] } },
      'https://api.linkedin.com/rest/organizations/111': { json: { localizedName: 'بصيرة' } },
      'https://api.linkedin.com/rest/organizations/222': { json: { localizedName: 'صدى' } },
    })
    const back = await app.request(`/oauth/linkedin-page/callback?code=c&state=${encodeURIComponent(state)}`, { headers: { Cookie: binding } }, env)
    expect(back.status).toBe(200)
    const found = await back.text()
    expect(found).toContain('بصيرة')
    expect(found).not.toContain('page-access-secret')
    // ‏ولا حسابَ قبل الاختيار
    expect((db.raw.prepare("SELECT COUNT(*) AS n FROM accounts WHERE kind = 'org'").get() as { n: number }).n).toBe(0)
    const pickHref = /href="(\/panel\/linkedin-pages\?pick=[^"]+)"/.exec(found)![1]!.replace(/&amp;/g, '&')

    const screen = await (await app.request(pickHref, { headers: { Cookie: cookie } }, env)).text()
    expect(screen).toContain('LinkedIn · صفحة صدى</label>')
    const csrf = /name="_csrf" value="([^"]+)"/.exec(screen)![1]!
    const pick = /name="pick" value="([^"]+)"/.exec(screen)![1]!
    const form = new URLSearchParams({ _csrf: csrf, pick })
    form.append('org', '111')
    form.append('org', '222')
    const saved = await app.request('/panel/linkedin-pages/pick', {
      method: 'POST', body: form, headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'https://sada2.basserh.com' },
    }, env)
    expect(saved.status).toBe(303)

    const rows = db.raw.prepare("SELECT id, kind, external_id, display_name FROM accounts WHERE platform = 'linkedin' ORDER BY external_id").all() as { id: string; kind: string; external_id: string; display_name: string }[]
    expect(rows.map((r) => [r.kind, r.external_id, r.display_name])).toEqual([['org', '111', 'بصيرة'], ['org', '222', 'صدى']])
    // ‏الرمزُ مشفّرٌ في القاعدة (D-005): لا يُقرأ نصًّا، ويُفكّ بالمفتاح وحده
    const raw = db.raw.prepare('SELECT access_enc, refresh_enc FROM tokens WHERE account_id = ?').get(rows[0]!.id) as { access_enc: string; refresh_enc: string }
    expect(raw.access_enc).not.toContain('page-access-secret')
    expect(raw.refresh_enc).not.toContain('page-refresh')
    expect((await loadTokens(db, KEY, rows[0]!.id))?.accessToken).toBe('page-access-secret')
    // ‏والاختيارُ لا يُعاد: مُحي بعد الحفظ
    const again = await app.request(pickHref, { headers: { Cookie: cookie } }, env)
    expect(again.status).toBe(303)
  })

  it('ورمزٌ بلا w_organization_social لا يُحفظ منه شيء', async () => {
    const cookie = await session()
    const start = await app.request('/oauth/linkedin-page/start', { headers: { Cookie: cookie } }, env)
    const state = new URL(start.headers.get('location')!).searchParams.get('state')!
    const binding = (start.headers.get('Set-Cookie') ?? '').split(';')[0]!
    globalThis.fetch = fakeFetch({ [LINKEDIN.tokenUrl]: { json: { access_token: 'a', expires_in: 100, scope: 'r_organization_social' } } })
    const back = await app.request(`/oauth/linkedin-page/callback?code=c&state=${encodeURIComponent(state)}`, { headers: { Cookie: binding } }, env)
    expect(back.status).toBe(400)
    expect(await back.text()).toContain('بلا w_organization_social')
    expect((db.raw.prepare('SELECT COUNT(*) AS n FROM accounts').get() as { n: number }).n).toBe(0)
  })

  /** يبدأ الدورةَ بكعكة `cookie` ويعود بصفحتين، ويعيد رابطَ الاختيار. */
  async function startAndReturn(cookie: string): Promise<string> {
    const start = await app.request('/oauth/linkedin-page/start', { headers: { Cookie: cookie } }, env)
    expect(start.status).toBe(302)
    const state = new URL(start.headers.get('location')!).searchParams.get('state')!
    const binding = (start.headers.get('Set-Cookie') ?? '').split(';')[0]!
    globalThis.fetch = fakeFetch({
      [LINKEDIN.tokenUrl]: { json: { access_token: 'page-access-secret', refresh_token: 'r', expires_in: 5_184_000, scope: 'w_organization_social,r_organization_social' } },
      [ACLS]: { json: { elements: [{ organization: 'urn:li:organization:111', role: 'ADMINISTRATOR', state: 'APPROVED' }] } },
      'https://api.linkedin.com/rest/organizations/111': { json: { localizedName: 'بصيرة' } },
    })
    const back = await app.request(`/oauth/linkedin-page/callback?code=c&state=${encodeURIComponent(state)}`, { headers: { Cookie: binding } }, env)
    expect(back.status).toBe(200)
    return /href="(\/panel\/linkedin-pages\?pick=[^"]+)"/.exec(await back.text())![1]!.replace(/&amp;/g, '&')
  }

  async function member(email: string, role: 'admin' | 'editor'): Promise<string> {
    db.raw.prepare("INSERT INTO members (email, role, orgs, invited_by) VALUES (?, ?, '*', 'owner')").run(email, role)
    const r = await emailLogin(app, env, { email })
    return (r.headers.get('Set-Cookie') ?? '').split(';')[0]!
  }

  async function submit(cookie: string, pickHref: string): Promise<Response> {
    const screen = await app.request(pickHref, { headers: { Cookie: cookie } }, env)
    const text = await screen.text()
    const csrf = /name="_csrf" value="([^"]+)"/.exec(text)?.[1] ?? 'x'
    const pick = new URL('https://h' + pickHref).searchParams.get('pick')!
    const form = new URLSearchParams({ _csrf: csrf, pick })
    form.append('org', '111')
    return app.request('/panel/linkedin-pages/pick', {
      method: 'POST', body: form, headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'https://sada2.basserh.com' },
    }, env)
  }

  const pages = (): number => (db.raw.prepare("SELECT COUNT(*) AS n FROM accounts WHERE kind = 'org'").get() as { n: number }).n

  it('والمديرُ الذي بدأ الربطَ يُكمله: يختار صفحتَه فتُحفظ (D-430)', async () => {
    const admin = await member('sara@example.com', 'admin')
    const saved = await submit(admin, await startAndReturn(admin))
    expect(saved.status).toBe(303)
    expect(pages()).toBe(1)
  })

  it('والمحرّرُ لا يختار — ولو حمل رابطَ الاختيار', async () => {
    const editor = await member('ed@example.com', 'editor')
    const owner = await session()
    const href = await startAndReturn(owner)
    expect(requiredRole('POST', '/panel/linkedin-pages/pick')).toBe('admin')
    expect(allows('editor', 'admin')).toBe(false)
    const r = await submit(editor, href)
    expect(r.status).toBe(303)
    expect(pages()).toBe(0)
  })

  it('والاختيارُ لمن بدأ وحده: مديرٌ آخرُ في المنظّمة نفسِها لا يفتحه', async () => {
    const owner = await session()
    const href = await startAndReturn(owner)
    const admin = await member('sara@example.com', 'admin')
    // ‏شاشةُ الاختيار نفسُها تردّه إلى الإعداد، والحفظُ لا يمضي
    expect((await app.request(href, { headers: { Cookie: admin } }, env)).headers.get('location')).toBe('/panel/channels/linkedin?tab=setup')
    await submit(admin, href)
    expect(pages()).toBe(0)
  })
})

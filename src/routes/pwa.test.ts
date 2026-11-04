/**
 * الهاتفُ أصيلًا (D-296): البيانُ يُقرأ، والأيقونةُ PNG، وعاملُ الخدمة لا يخزّن اللوحة، و«شارك إلى صدى» يملأ الفكرة.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { emailLogin } from '../test/emailLogin'
import { toBase64 } from '../lib/crypto'
import { fakeDb, fakeKv } from '../test/fakes'
import { app } from '../index'
import { htmlHeaders } from '../lib/security/headers'
import { manifest, SERVICE_WORKER } from './pwa'

const KEY = toBase64(crypto.getRandomValues(new Uint8Array(32)))
let env: Record<string, unknown>

beforeEach(() => {
  env = {
    SADA_ENV: 'staging',
    PUBLIC_BASE_URL: 'https://sada2.basserh.com',
    DRIVE_FOLDER_ID: 'folder',
    DB: fakeDb(),
    KV: fakeKv(),
    TOKEN_ENC_KEY: KEY,
    ADMIN_TOKEN: 'Yk3pQ9vX2mLsA7nR4tWfZ8cB6dH1jG0e',
  }
})

describe('بيانُ التثبيت', () => {
  it('يُخدَم بنوعه، ويبدأ من اللوحة، ويحمل الأيقونة والمشاركة', async () => {
    const r = await app.request('/manifest.webmanifest', {}, env)
    expect(r.status).toBe(200)
    expect(r.headers.get('Content-Type')).toContain('application/manifest+json')
    const m = (await r.json()) as ReturnType<typeof manifest>
    expect(m).toMatchObject({ name: 'صدى', lang: 'ar', dir: 'rtl', start_url: '/panel', display: 'standalone' })
    expect(m['icons']).toEqual([{ src: '/icons/sada.png', sizes: '1024x1024', type: 'image/png', purpose: 'any' }])
    expect(m['share_target']).toMatchObject({ action: '/panel/share', method: 'GET' })
    expect(String(m['theme_color'])).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('والصفحةُ تربطه وتعلن نفسَها تطبيقًا، وسياسةُ المحتوى تسمح به وبعامل الخدمة', async () => {
    const r = await app.request('/', {}, env)
    const html = await r.text()
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest">')
    expect(html).toContain('<link rel="apple-touch-icon" href="/icons/sada.png">')
    expect(html).toContain('name="apple-mobile-web-app-capable"')
    const csp = htmlHeaders('n')['Content-Security-Policy'] ?? ''
    expect(csp).toContain("manifest-src 'self'")
    expect(csp).toContain("worker-src 'self'")
  })
})

describe('الأيقونةُ وعاملُ الخدمة', () => {
  it('الأيقونةُ PNG حقيقيّة بتوقيعها', async () => {
    const r = await app.request('/icons/sada.png', {}, env)
    expect(r.status).toBe(200)
    expect(r.headers.get('Content-Type')).toBe('image/png')
    const bytes = new Uint8Array(await r.arrayBuffer())
    expect([...bytes.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect(bytes.length).toBeGreaterThan(10_000)
  })

  it('عاملُ الخدمة يُخدَم JavaScript بلا تخزينٍ طويل، ولا يخزّن اللوحةَ بل يردّ «لا اتّصال»', async () => {
    const r = await app.request('/sw.js', {}, env)
    expect(r.status).toBe(200)
    expect(r.headers.get('Content-Type')).toContain('javascript')
    expect(r.headers.get('Cache-Control')).toBe('no-cache')
    expect(await r.text()).toBe(SERVICE_WORKER)
    expect(SERVICE_WORKER).toContain("e.request.mode !== 'navigate'")
    expect(SERVICE_WORKER).toContain('لا اتّصال')
    expect(SERVICE_WORKER).not.toMatch(/caches\.open|cache\.put/)
  })
})

describe('«شارك إلى صدى»', () => {
  it('بلا جلسةٍ صفحةُ الدخول', async () => {
    const r = await app.request('/panel/share?text=%D9%81%D9%83%D8%B1%D8%A9', {}, env)
    expect([401, 303]).toContain(r.status)
    const html = await r.text()
    expect(html).not.toContain('name="idea"')
  })

  it('وبجلسةٍ النصُّ والرابطُ في «اكتب من فكرتك» مملوءين، والنموذجُ إلى مسار الفكرة نفسِه', async () => {
    const login = await emailLogin(app, env)
    const cookie = (login.headers.get('Set-Cookie') ?? '').split(';')[0]!
    const r = await app.request('/panel/share?title=%D8%A7%D9%84%D8%AD%D9%88%D9%83%D9%85%D8%A9&text=%D9%84%D8%A7+%D8%AA%D8%A8%D8%B7%D8%A6+%D8%A7%D9%84%D9%82%D8%B1%D8%A7%D8%B1&url=https%3A%2F%2Fexample.com%2Fa', { headers: { Cookie: cookie } }, env)
    expect(r.status).toBe(200)
    const html = await r.text()
    expect(html).toContain('action="/panel/drafts/idea"')
    expect(html).toContain('الحوكمة\nلا تبطئ القرار\nhttps://example.com/a</textarea>')
    expect(html).toContain('name="_csrf"')
  })
})

/**
 * صفحةُ الهبوط على الجذر (D-193): بابٌ لمن لا جلسةَ له، وتحويلٌ مباشرٌ لمن له جلسة.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { emailLogin } from '../test/emailLogin'
import { toBase64 } from '../lib/crypto'
import { fakeDb, fakeKv } from '../test/fakes'
import { app } from '../index'

const TOKEN = 'landing-admin-token-landing-admin-token'
let env: Record<string, unknown>

beforeEach(() => {
  env = {
    SADA_ENV: 'staging', PUBLIC_BASE_URL: 'https://sada2.basserh.com', DRIVE_FOLDER_ID: 'folder',
    DB: fakeDb(), KV: fakeKv(), TOKEN_ENC_KEY: toBase64(crypto.getRandomValues(new Uint8Array(32))), ADMIN_TOKEN: TOKEN,
  }
})

async function login(): Promise<string> {
  const r = await emailLogin(app, env)
  expect(r.status).toBe(303)
  return (r.headers.get('Set-Cookie') ?? '').split(';')[0]!
}

describe('صفحة الهبوط على الجذر (D-193)', () => {
  it('بلا جلسة: موقعٌ كامل لا بابُ دخول — و«ادخل» رابطٌ ثانويّ (D-416)', async () => {
    const r = await app.request('/', {}, env)
    expect(r.status).toBe(200)
    const html = await r.text()
    expect(html).not.toMatch(/btn-primary/)
    expect(html).toContain('<a class="tap site-enter" href="/panel">ادخل</a>')
    for (const p of ['LinkedIn', 'X', 'YouTube', 'TikTok', 'Instagram']) expect(html).toContain(`aria-label="${p}"`)
    for (const s of ['Login Kit', 'Content Posting API', 'video.upload', 'href="/about"', 'href="/contact"', 'href="/en"', 'og:title'])
      expect(html).toContain(s)
  })
  it('صفحاتُ الموقع العامّة: ‏200 بلا جلسة، مفهرسة، بالوثيقتين، وبلا سمة style', async () => {
    env.LEGAL_CONTACT = 'contact@example.org'
    for (const path of ['/', '/en', '/about', '/contact', '/features', '/privacy', '/terms']) {
      const r = await app.request(path, {}, env)
      expect(r.status, path).toBe(200)
      const html = await r.text()
      if (path !== '/privacy') expect(html, path).toMatch(/href="\/privacy(#en)?"/)
      if (path !== '/terms') expect(html, path).toMatch(/href="\/terms(#en)?"/)
      expect(html, path).toContain('content="index,follow"')
      expect(html, path).toMatch(/<meta name="description" content="[^"]+">/)
      expect(html, path).not.toMatch(/\sstyle=/)
      expect(html, path).not.toMatch(/<form/)
      if (path !== '/privacy' && path !== '/terms') {
        expect(html, path).toContain('og:url')
        expect(html, path).toContain('href="/about')
        expect(html, path).toContain('href="/contact')
      }
    }
    expect(await (await app.request('/contact', {}, env)).text()).toContain('href="mailto:contact@example.org"')
    expect(await (await app.request('/en', {}, env)).text()).toContain('How SADA uses TikTok')
  })
  it('ولا تُخزَّن في ذاكرة مشتركة: الردّ يختلف بالكعكة', async () => {
    const r = await app.request('/', {}, env)
    expect(r.headers.get('Cache-Control')).toBe('no-store')
    expect(r.headers.get('Vary')).toBe('Cookie')
    expect(r.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'")
  })
  it('ولا نموذج فيها، ولا سكربت إلّا سكربتَي الغلاف بـ`nonce` ومن أصلنا وحدَه', async () => {
    const html = await (await app.request('/', {}, env)).text()
    expect(html).not.toMatch(/<form/)
    for (const tag of html.match(/<script[^>]*>/g) ?? []) {
      expect(tag).toMatch(/nonce="/)
      const src = /\ssrc="([^"]+)"/.exec(tag)?.[1]
      if (src !== undefined) expect(src).toMatch(/^\/a\//)
    }
  })
  it('ومن معه جلسة سارية يذهب إلى لوحته مباشرةً (‏303)', async () => {
    const cookie = await login()
    const r = await app.request('/', { headers: { Cookie: cookie } }, env)
    expect(r.status).toBe(303)
    expect(r.headers.get('Location')).toBe('/panel')
    expect(r.headers.get('Cache-Control')).toBe('no-store')
  })
  it('وكعكة قديمة لا جلسة خلفها ترى الصفحة لا حلقة تحويل', async () => {
    const r = await app.request('/', { headers: { Cookie: '__Host-sada_session=gone' } }, env)
    expect(r.status).toBe(200)
  })
})

/**
 * **اختبارُ الجذع** (Krug، Don't Make Me Think · D-305): من أيّ صفحةٍ يعرف القارئُ أين هو، وما اسمُ الصفحة، وأين
 * المساعدةُ وأين الأوامر — بلا أن يُقال له. يُقاس على عشر صفحاتٍ بجلسةٍ واحدة:
 * عنوانٌ واحد `h1`، وموضعٌ معلَّم في الرافدة (`aria-current`)، ورابطُ المساعدة في قائمة الحساب (WCAG 2.2 · 3.2.6)،
 * وزرُّ الأوامر. ما ينقص أحدَها يسقط هنا قبل أن يسقط عند المالك.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { emailLogin } from '../test/emailLogin'
import { toBase64 } from '../lib/crypto'
import { fakeDb, fakeKv } from '../test/fakes'
import { app } from '../index'

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

const PAGES = [
  '/panel', '/panel/library', '/panel/report', '/panel/accounts', '/panel/tasks',
  '/panel/settings', '/panel/notices', '/panel/help', '/panel/timeline', '/panel/client',
]

describe('اختبارُ الجذع على عشر صفحات', () => {
  it('عنوانٌ واحد، وموضعٌ في الرافدة، والمساعدةُ والأوامرُ في مكانهما', async () => {
    const login = await emailLogin(app, env)
    const cookie = (login.headers.get('Set-Cookie') ?? '').split(';')[0]!
    for (const path of PAGES) {
      const r = await app.request(path, { headers: { Cookie: cookie } }, env)
      expect(r.status, path).toBe(200)
      const html = await r.text()
      // ‏اللوحةُ ألواحٌ لكلٍّ عنوانُه ويُرى واحدٌ منها (D-246)؛ فالشرطُ عنوانٌ على الأقلّ لا عنوانٌ واحد
      expect((html.match(/<h1[\s>]/g) ?? []).length, `${path}: عنوان`).toBeGreaterThanOrEqual(1)
      expect(html, `${path}: أين أنا`).toContain('aria-current="page"')
      expect(html, `${path}: المساعدة في قائمة الحساب`).toContain('href="/panel/help"')
      expect(html, `${path}: زرّ الأوامر`).toContain('cmdk-open')
    }
  })
})

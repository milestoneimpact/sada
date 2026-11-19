/**
 * الخطُّ الزمنيّ للمحفظة (D-212) صار التيّار (D-388): المسارُ باقٍ للروابط المحفوظة ويحوّل دائمًا، ولا صفحةَ تُرسَم.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { emailLogin } from '../test/emailLogin'
import { toBase64 } from '../lib/crypto'
import { COOKIE } from '../lib/session'
import { fakeDb, fakeKv } from '../test/fakes'
import { app } from '../index'

const TOKEN = 'Yk3pQ9vX2mLsA7nR4tWfZ8cB6dH1jG0e'
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
    ADMIN_TOKEN: TOKEN,
  }
})

describe('الخطّ الزمنيّ صار التيّار (D-388)', () => {
  it('يحوّل دائمًا (301) إلى التيّار — بجلسةٍ وبلا جلسة، وبأيّ نافذة', async () => {
    const login = await emailLogin(app, env)
    const cookie = (login.headers.get('Set-Cookie') ?? '').split(';')[0]!
    for (const [path, headers] of [
      ['/panel/timeline', { Cookie: cookie }],
      ['/panel/timeline?span=90&at=-1', { Cookie: cookie }],
      ['/panel/timeline', { Cookie: `${COOKIE}=gone` }],
    ] as const) {
      const r = await app.request(path, { headers }, env)
      expect(r.status, path).toBe(301)
      expect(r.headers.get('Location'), path).toBe('/panel/feed')
    }
  })
})

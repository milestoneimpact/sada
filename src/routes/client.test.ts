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
    for (const s of ['العميل', 'الموجز', 'القنوات', 'الخطّة', 'المحتوى', 'الكلفة', 'التحليل']) expect(html).toContain(`· ${s}</b>`)
    expect(html).toContain('لم يُكتب بعد')
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

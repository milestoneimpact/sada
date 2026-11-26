/**
 * دخولُ الاختبار لا يُنادى متوازيًا على بيئةٍ واحدة (D-424).
 *
 * كان `panelHtml` يدخل خمسَ مرّاتٍ معًا (لكلّ صفحةٍ من `everyPane` دخول)، فيُبطل رمزُ كلِّ دخولٍ رمزَ أخيه، ويُردّ أحدُها
 * 401 بحسب ترتيب الوعود — متقطّعًا، وأكثرَ تحت حِمل CI.
 */
import { describe, expect, it } from 'vitest'
import { emailLogin, requestCode } from './emailLogin'
import { toBase64 } from '../lib/crypto'
import { fakeDb, fakeKv } from './fakes'
import { app } from '../index'

function freshEnv(): Record<string, unknown> {
  return {
    SADA_ENV: 'staging',
    PUBLIC_BASE_URL: 'https://sada2.basserh.com',
    DRIVE_FOLDER_ID: 'folder',
    DB: fakeDb(),
    KV: fakeKv(),
    TOKEN_ENC_KEY: toBase64(crypto.getRandomValues(new Uint8Array(32))),
    ADMIN_TOKEN: 'Yk3pQ9vX2mLsA7nR4tWfZ8cB6dH1jG0e',
  }
}

async function submit(env: Record<string, unknown>, code: string): Promise<Response> {
  const body = new FormData()
  body.set('code', code)
  return app.request('/panel/login', { method: 'POST', body }, env)
}

describe('دخول الاختبار والتوازي (D-424)', () => {
  it('السبب بترتيبٍ ثابت: رمزٌ ثانٍ يُبطل الأوّل، فإرسالُ الأوّل 401 — وهذا مقصودٌ في المنتج', async () => {
    const env = freshEnv()
    const first = await requestCode(app, env)
    const second = await requestCode(app, env)
    expect(first).toMatch(/^\d{6}$/)
    expect(second).toMatch(/^\d{6}$/)
    expect((await submit(env, first)).status).toBe(401)
  })

  it('دخولان متوازيان على بيئةٍ واحدة يُرفضان بخطأٍ صريح لا بـ401 متقطّع', async () => {
    const env = freshEnv()
    await expect(Promise.all([emailLogin(app, env), emailLogin(app, env)])).rejects.toThrow(/D-424/)
  })

  it('والدخولُ المتتالي على البيئة نفسِها يمضي', async () => {
    const env = freshEnv()
    expect((await emailLogin(app, env)).status).toBe(303)
    expect((await emailLogin(app, env)).status).toBe(303)
  })
})

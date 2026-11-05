/**
 * إرسالٌ رُدّ يُعَدّ (D-302): الردُّ لعيبٍ في المُدخَل يكتب `form.reject` بمساره وحقله ومفتاحه، والجملةُ من الكتالوج (ما وقع وما
 * تفعل)، و«ما عليك» تعرض العدّ.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { emailLogin } from '../test/emailLogin'
import { toBase64 } from '../lib/crypto'
import { fakeDb, fakeKv, type FakeDb } from '../test/fakes'
import { app } from '../index'
import { say } from '../lib/errors/catalog'

const KEY = toBase64(crypto.getRandomValues(new Uint8Array(32)))
let env: Record<string, unknown>
let db: FakeDb

beforeEach(() => {
  db = fakeDb()
  env = {
    SADA_ENV: 'staging',
    PUBLIC_BASE_URL: 'https://sada2.basserh.com',
    DRIVE_FOLDER_ID: 'folder',
    DB: db,
    KV: fakeKv(),
    TOKEN_ENC_KEY: KEY,
    ADMIN_TOKEN: 'Yk3pQ9vX2mLsA7nR4tWfZ8cB6dH1jG0e',
  }
})

describe('form.reject', () => {
  it('عيّنةٌ لا تُقرأ تُردّ بجملة الكتالوج وتُعَدّ، و«ما عليك» تعرض العدّ', async () => {
    const login = await emailLogin(app, env)
    const cookie = (login.headers.get('Set-Cookie') ?? '').split(';')[0]!
    const tasks0 = await (await app.request('/panel/tasks', { headers: { Cookie: cookie } }, env)).text()
    const csrf = /data-csrf="([^"]+)"/.exec(tasks0)?.[1] ?? ''
    expect(tasks0).toContain('لم يُردّ إرسالٌ هذا الأسبوع')
    const r = await app.request('/panel/vitals', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ _csrf: csrf, metric: 'FID', value: '1', page: '/panel', device: 'phone' }).toString(),
    }, env)
    expect(r.status).toBe(400)
    expect(((await r.json()) as { detail: string }).detail).toBe(say('bad_sample'))
    const row = await db
      .prepare("SELECT target, detail, org_id FROM audit_log WHERE action = 'form.reject'")
      .first<{ target: string; detail: string; org_id: string }>()
    expect(row).toEqual({ target: '/panel/vitals', detail: 'metric: bad_sample', org_id: 'org_owner' })
    const tasks1 = await (await app.request('/panel/tasks', { headers: { Cookie: cookie } }, env)).text()
    expect(tasks1).toContain('رُدّ إرسالٌ واحد هذا الأسبوع')
  })

  it('ورمزُ نموذجٍ لا يطابق يُردّ بجملة الكتالوج نفسِها', async () => {
    const login = await emailLogin(app, env)
    const cookie = (login.headers.get('Set-Cookie') ?? '').split(';')[0]!
    const r = await app.request('/panel/vitals', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'metric=LCP&value=1&page=%2Fpanel&device=phone&_csrf=x',
    }, env)
    expect(r.status).toBe(403)
    expect(((await r.json()) as { detail: string }).detail).toBe(say('csrf_failed'))
  })
})

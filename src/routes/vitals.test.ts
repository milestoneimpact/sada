/**
 * القياسُ الميدانيّ على المسارات نفسِها (D-299): البوّابةُ تطلب جلسةً ورمزَ نموذج، وتردّ ما لا يُقرأ، وتحفظ بلا هويّة؛
 * وبطاقةُ «سرعةُ اللوحة عندك» في «ما عليك» تقول «لم تُقَس» ثمّ تقول الرقم؛ وسكربتُ الواجهة يحمل القياسَ بلا طلبٍ خارجيّ.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { emailLogin } from '../test/emailLogin'
import { toBase64 } from '../lib/crypto'
import { fakeDb, fakeKv, type FakeDb } from '../test/fakes'
import { app } from '../index'
import { uiScript } from '../lib/ui/asset'

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

async function session(): Promise<{ cookie: string; csrf: string }> {
  const login = await emailLogin(app, env)
  const cookie = (login.headers.get('Set-Cookie') ?? '').split(';')[0]!
  const html = await (await app.request('/panel/tasks', { headers: { Cookie: cookie } }, env)).text()
  const csrf = /data-csrf="([^"]+)"/.exec(html)?.[1] ?? ''
  expect(csrf).not.toBe('')
  return { cookie, csrf }
}

async function beacon(cookie: string, body: Record<string, string>): Promise<Response> {
  const p = new URLSearchParams(body)
  return await app.request('/panel/vitals', {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: p.toString(),
  }, env)
}

describe('POST /panel/vitals', () => {
  it('بلا جلسةٍ لا يُحفَظ شيء', async () => {
    const r = await app.request('/panel/vitals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'metric=LCP&value=1200&page=%2Fpanel&device=phone',
    }, env)
    expect([401, 303]).toContain(r.status)
    const n = await db.prepare('SELECT count(*) AS n FROM web_vitals').first<{ n: number }>()
    expect(n?.n).toBe(0)
  })

  it('رمزُ نموذجٍ لا يطابق يُردّ، وعيّنةٌ لا تُقرأ تُردّ 400، والصالحةُ تُحفَظ بلا هويّة وتُردّ 204', async () => {
    const { cookie, csrf } = await session()
    const bad = await beacon(cookie, { _csrf: 'x', metric: 'LCP', value: '1200', page: '/panel', device: 'phone' })
    expect(bad.status).toBe(403)
    const junk = await beacon(cookie, { _csrf: csrf, metric: 'FID', value: '12', page: '/panel', device: 'phone' })
    expect(junk.status).toBe(400)
    const outside = await beacon(cookie, { _csrf: csrf, metric: 'LCP', value: '1200', page: '/login', device: 'phone' })
    expect(outside.status).toBe(400)
    const ok = await beacon(cookie, { _csrf: csrf, metric: 'LCP', value: '1840.5', page: '/panel/drafts/8f2a9c1d4e?x=1', device: 'phone' })
    expect(ok.status).toBe(204)
    const row = await db.prepare('SELECT * FROM web_vitals').first<Record<string, unknown>>()
    expect(row).toMatchObject({ org_id: 'org_owner', metric: 'LCP', value: 1840.5, page: '/panel/drafts/:id', device: 'phone' })
    expect(Object.keys(row ?? {})).not.toContain('email')
    const audit = await db.prepare("SELECT count(*) AS n FROM audit_log WHERE action LIKE 'vital%'").first<{ n: number }>()
    expect(audit?.n).toBe(0)
  })
})

describe('بطاقةُ «سرعةُ اللوحة عندك» في «ما عليك»', () => {
  it('بلا عيّناتٍ تقول «لم تُقَس بعد»، وبعشرٍ تقول المئينَ وحكمَه وأبطأَ صفحة', async () => {
    const { cookie } = await session()
    const empty = await (await app.request('/panel/tasks', { headers: { Cookie: cookie } }, env)).text()
    expect(empty).toContain('سرعةُ اللوحة عندك')
    expect(empty).toContain('لم تُقَس بعد')
    for (let i = 0; i < 10; i += 1) {
      await db
        .prepare("INSERT INTO web_vitals (org_id, metric, value, page, device) VALUES ('org_owner', 'INP', ?, '/panel', 'phone')")
        .bind(150 + i * 10)
        .run()
      await db
        .prepare("INSERT INTO web_vitals (org_id, metric, value, page, device) VALUES ('org_owner', 'LCP', ?, '/panel/library', 'phone')")
        .bind(3000 + i * 100)
        .run()
    }
    const html = await (await app.request('/panel/tasks', { headers: { Cookie: cookie } }, env)).text()
    expect(html).not.toContain('لم تُقَس بعد')
    expect(html).toContain('220 ملّي ثانية')
    expect(html).toContain('يحتاج تحسينًا')
    expect(html).toContain('3.7 ثانية')
    expect(html).toContain('/panel/library')
    expect(html).toContain('20 عيّنة')
  })
})

describe('سكربتُ الواجهة', () => {
  it('يحمل web-vitals ويُرسل بـ sendBeacon إلى المسار الداخليّ بلا عنوانٍ خارجيّ، ومعه رمزُ النموذج', () => {
    const body = uiScript().body
    expect(body).toContain('var webVitals=')
    expect(body).toContain("navigator.sendBeacon('/panel/vitals'")
    expect(body).toContain("querySelector('[data-csrf]')")
    expect(body).toContain('webVitals.onINP(')
    expect(body).not.toMatch(/https?:\/\//)
  })
})

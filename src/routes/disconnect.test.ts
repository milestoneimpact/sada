/**
 * «افصل الحساب» (D-197) من طرفه إلى طرفه: الجلسةُ ورمزُ النموذج، وحذفُ الرموز ولو
 * فشل الإبطال، والمنشوراتُ المجدولة، وسجلُّ التدقيق بلا قيمة رمز، والزرُّ في الصفحة.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toBase64 } from '../lib/crypto'
import { saveTokens } from '../lib/tokens'
import { fakeDb, fakeKv, type FakeDb } from '../test/fakes'
import { app } from '../index'
import { publishPost } from '../lib/publish/publisher'

const TOKEN = 'Yk3pQ9vX2mLsA7nR4tWfZ8cB6dH1jG0e'
const KEY = toBase64(crypto.getRandomValues(new Uint8Array(32)))
const ACCESS = 'ACCESS-SECRET-VALUE-123'
const REFRESH = 'REFRESH-SECRET-VALUE-456'

let db: FakeDb
let env: Record<string, unknown>
let csrf = ''
let calls: Request[] = []

beforeEach(() => {
  db = fakeDb()
  env = {
    SADA_ENV: 'staging',
    PUBLIC_BASE_URL: 'https://sada2.basserh.com',
    DRIVE_FOLDER_ID: 'folder',
    DB: db,
    KV: fakeKv(),
    TOKEN_ENC_KEY: KEY,
    ADMIN_TOKEN: TOKEN,
    X_CLIENT_ID: 'xid',
    X_CLIENT_SECRET: 'xsecret',
  }
  calls = []
})

afterEach(() => vi.unstubAllGlobals())

function stubFetch(status: number | 'throw'): void {
  vi.stubGlobal('fetch', async (input: Request) => {
    calls.push(input)
    if (status === 'throw') throw new Error('network down')
    return new Response('{}', { status })
  })
}

async function login(): Promise<string> {
  const body = new FormData()
  body.set('token', TOKEN)
  const response = await app.request('/panel/login', { method: 'POST', body }, env)
  const cookie = (response.headers.get('Set-Cookie') ?? '').split(';')[0]!
  const page = await app.request('/panel', { headers: { Cookie: cookie } }, env)
  csrf = /name="_csrf" value="([^"]+)"/.exec(await page.text())?.[1] ?? ''
  expect(csrf).not.toBe('')
  return cookie
}

async function seedLinked(platform: 'x' | 'youtube' = 'x'): Promise<string> {
  const id = `${platform}:member:42`
  await db
    .prepare('INSERT INTO accounts (id, platform, kind, external_id, display_name, status) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, platform, 'member', '42', 'عمر', 'active')
    .run()
  await saveTokens(db, KEY, id, {
    accessToken: ACCESS, refreshToken: REFRESH, expiresAt: '2099-01-01T00:00:00Z',
    refreshExpiresAt: null, scopes: 'tweet.write offline.access',
  })
  return id
}

async function seedQueued(account: string, platform = 'x'): Promise<string> {
  const id = crypto.randomUUID()
  await db
    .prepare(
      `INSERT INTO posts (id, account_id, platform, type, text, status, idempotency_key, approved_by, approved_at, scheduled_at)
       VALUES (?, ?, ?, 'text', 'نصّ', 'queued', ?, 'panel:token', '2026-09-08T07:00:00Z', '2099-01-01T07:00:00Z')`,
    )
    .bind(id, account, platform, `k-${id}`)
    .run()
  return id
}

function post(cookie: string, fields: Record<string, string>, withCsrf = true): Promise<Response> {
  const body = new FormData()
  for (const [k, v] of Object.entries(fields)) body.set(k, v)
  if (withCsrf) body.set('_csrf', csrf)
  return app.request('/panel/channels/disconnect', { method: 'POST', body, headers: { Cookie: cookie } }, env) as Promise<Response>
}

async function tokenRows(account: string): Promise<number> {
  const row = await db.prepare('SELECT count(*) AS n FROM tokens WHERE account_id = ?').bind(account).first<{ n: number }>()
  return row?.n ?? 0
}

describe('افصل الحساب', () => {
  it('بلا جلسة لا يُفصَل شيء', async () => {
    stubFetch(200)
    const account = await seedLinked()
    const body = new FormData()
    body.set('platform', 'x')
    body.set('account', account)
    const response = await app.request('/panel/channels/disconnect', { method: 'POST', body }, env)
    expect(response.status).toBe(401)
    expect(await tokenRows(account)).toBe(1)
    expect(calls).toHaveLength(0)
  })

  it('بلا رمز النموذج يُردّ 403 ولا يُفصَل شيء', async () => {
    stubFetch(200)
    const account = await seedLinked()
    const cookie = await login()
    const response = await post(cookie, { platform: 'x', account }, false)
    expect(response.status).toBe(403)
    expect(await tokenRows(account)).toBe(1)
    expect(calls).toHaveLength(0)
  })

  it('يحذف الرموز ويُعلّم الحساب مفصولًا ويُبطل عند X ويعود إلى الإعداد', async () => {
    stubFetch(200)
    const account = await seedLinked()
    const cookie = await login()
    const response = await post(cookie, { platform: 'x', account, return: 'platform:x:setup' })
    expect(response.status).toBe(303)
    expect(response.headers.get('Location')).toBe('/panel/channels/x?tab=setup')
    expect(await tokenRows(account)).toBe(0)
    const row = await db.prepare('SELECT status FROM accounts WHERE id = ?').bind(account).first<{ status: string }>()
    expect(row?.status).toBe('revoked')
    expect(calls.map((r) => r.url)).toEqual(['https://api.x.com/2/oauth2/revoke', 'https://api.x.com/2/oauth2/revoke'])
    // ‏الرمزُ في الجسد لا في العنوان
    for (const r of calls) expect(r.url).not.toContain('SECRET')
  })

  it('فشلُ الإبطال عند المنصّة لا يُبقي الرموز، والإشعارُ يقول ما بقي على المالك', async () => {
    stubFetch('throw')
    const account = await seedLinked()
    const cookie = await login()
    const response = await post(cookie, { platform: 'x', account, return: 'platform:x:setup' })
    expect(response.status).toBe(303)
    expect(await tokenRows(account)).toBe(0)
    const page = await (await app.request('/panel/channels/x?tab=setup', { headers: { Cookie: cookie } }, env)).text()
    expect(page).toContain('تعذّر إبطالُ الإذن عند X')
    expect(page).toContain('حُذفت رموزُه')
  })

  it('المنشوراتُ المجدولة تصير «فشل» بسبب الفصل ولا يُنشَر منها شيء', async () => {
    stubFetch(500)
    const account = await seedLinked()
    const queued = await seedQueued(account)
    const cookie = await login()
    await post(cookie, { platform: 'x', account })
    const row = await db.prepare('SELECT status FROM posts WHERE id = ?').bind(queued).first<{ status: string }>()
    expect(row?.status).toBe('failed')
    const attempt = await db
      .prepare('SELECT response_json FROM publish_attempts WHERE post_id = ?')
      .bind(queued)
      .first<{ response_json: string }>()
    expect(attempt?.response_json).toContain('account_disconnected')

    // ‏ورسالةٌ كانت في الطابور قبل الفصل تُردّ ولا تُعيد الحسابَ «جدّد الإذن»
    calls = []
    const outcome = await publishPost(
      { db, encKey: KEY, fetchImpl: fetch } as unknown as Parameters<typeof publishPost>[0],
      { postId: queued } as Parameters<typeof publishPost>[1],
    )
    expect(outcome.kind).toBe('failed')
    expect(calls.filter((r) => r.url.includes('/2/tweets'))).toHaveLength(0)
    const acct = await db.prepare('SELECT status FROM accounts WHERE id = ?').bind(account).first<{ status: string }>()
    expect(acct?.status).toBe('revoked')
  })

  it('سجلُّ التدقيق يحمل الفصلَ بلا قيمة رمز', async () => {
    stubFetch(200)
    const account = await seedLinked()
    const cookie = await login()
    await post(cookie, { platform: 'x', account })
    const rows = await db
      .prepare("SELECT target, detail FROM audit_log WHERE action = 'account.disconnect'")
      .all<{ target: string; detail: string }>()
    expect(rows.results).toHaveLength(1)
    const text = JSON.stringify(rows.results)
    expect(text).not.toContain(ACCESS)
    expect(text).not.toContain(REFRESH)
    expect(text).not.toContain('xsecret')
    expect(rows.results[0]!.detail).toContain('remote=revoked')
  })

  it('معرّفٌ على غير منصّته يُردّ ولا يُفصَل', async () => {
    stubFetch(200)
    const account = await seedLinked('x')
    const cookie = await login()
    const response = await post(cookie, { platform: 'youtube', account })
    expect(response.status).toBe(303)
    expect(await tokenRows(account)).toBe(1)
    expect(calls).toHaveLength(0)
  })

  it('حقلُ العودة الحرّ لا يصنع تحويلةً مفتوحة', async () => {
    stubFetch(200)
    const account = await seedLinked()
    const cookie = await login()
    const response = await post(cookie, { platform: 'x', account, return: 'https://evil.example/' })
    expect(response.headers.get('Location')).toBe('/panel#channels')
  })

  it('YouTube يُبطل عند Google برمز التجديد', async () => {
    stubFetch(200)
    const account = await seedLinked('youtube')
    const cookie = await login()
    await post(cookie, { platform: 'youtube', account })
    expect(calls.map((r) => r.url)).toEqual(['https://oauth2.googleapis.com/revoke'])
    expect(await calls[0]!.text()).toContain(`token=${REFRESH}`)
  })
})

describe('زرُّ الفصل في الصفحة', () => {
  it('لكلّ حسابٍ مربوطٍ زرٌّ خطِرٌ وحوارٌ يقول ما سيقع', async () => {
    const account = await seedLinked()
    const cookie = await login()
    const page = await (await app.request('/panel/channels/x?tab=setup', { headers: { Cookie: cookie } }, env)).text()
    expect(page).toContain('action="/panel/channels/disconnect"')
    expect(page).toContain(`name="account" value="${account}"`)
    expect(page).toMatch(/class="btn btn-danger btn-sm"[^>]*data-dialog-open="dc-x-0"/)
    expect(page).toContain('<dialog class="dlg" id="dc-x-0"')
    expect(page).toContain('form="dc-x-0-f"')
    expect(page).toContain('تُحذف رموزُ الوصول والتجديد')
    expect(page).toContain('https://x.com/settings/connected_apps')
    // ‏والنموذجُ يحمل رمزَ CSRF كأيّ نموذجٍ في الصفحة
    expect(page).toMatch(/id="dc-x-0-f"[^>]*>\s*<input type="hidden" name="_csrf"/)
  })

  it('الحسابُ المفصول لا يظهر بعد الفصل', async () => {
    stubFetch(200)
    const account = await seedLinked()
    const cookie = await login()
    await post(cookie, { platform: 'x', account })
    const page = await (await app.request('/panel/channels/x?tab=setup', { headers: { Cookie: cookie } }, env)).text()
    expect(page).not.toContain(`name="account" value="${account}"`)
  })
})

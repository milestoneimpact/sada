/** الفريقُ من الدعوة إلى الإلغاء (D-272): المالكُ يدعو، والمحرّرُ يدخل برمزه، ودورُه وشركتُه يُفحصان على الخادم. */
import { beforeEach, describe, expect, it } from 'vitest'
import { codeFrom, emailLogin, fakeMailer, type FakeMailer } from '../test/emailLogin'
import { toBase64 } from '../lib/crypto'
import { fakeDb, fakeKv, type FakeDb } from '../test/fakes'
import { app } from '../index'

let db: FakeDb
let env: Record<string, unknown>

beforeEach(() => {
  db = fakeDb()
  db.raw.exec(`INSERT INTO orgs (id, name, kind) VALUES ('org_a', 'شركة أ', 'team'), ('org_b', 'شركة ب', 'team')`)
  env = {
    SADA_ENV: 'staging', PUBLIC_BASE_URL: 'https://sada2.basserh.com', DRIVE_FOLDER_ID: 'folder',
    DB: db, KV: fakeKv(), TOKEN_ENC_KEY: toBase64(crypto.getRandomValues(new Uint8Array(32))),
    ADMIN_TOKEN: 'Yk3pQ9vX2mLsA7nR4tWfZ8cB6dH1jG0e', EMAIL: fakeMailer(),
  }
})

const cookieOf = (res: Response): string => (res.headers.get('Set-Cookie') ?? '').split(';')[0]!
const csrfOf = async (cookie: string, path = '/panel/client'): Promise<string> =>
  /name="_csrf" value="([^"]+)"/.exec(await (await app.request(path, { headers: { Cookie: cookie } }, env)).text())?.[1] ?? ''

async function post(path: string, cookie: string, fields: Record<string, string | string[]>): Promise<Response> {
  const body = new FormData()
  for (const [k, v] of Object.entries(fields)) for (const x of [v].flat()) body.append(k, x)
  return app.request(path, { method: 'POST', body, headers: { Cookie: cookie } }, env)
}

async function memberLogin(email: string): Promise<Response> {
  const ask = new FormData()
  ask.set('email', email)
  await app.request('/panel/login/code', { method: 'POST', body: ask }, env)
  const mail = (env['EMAIL'] as FakeMailer).sent.filter((m) => m.to === email).at(-1)
  const body = new FormData()
  body.set('email', email)
  body.set('code', mail === undefined ? '000000' : codeFrom(mail))
  return app.request('/panel/login', { method: 'POST', body }, env)
}

describe('الفريق (D-272)', () => {
  it('المالكُ يدعو محرّرًا لشركةٍ واحدة، فيدخل برمزه ويُقصَر على دوره وشركته، ثمّ يُلغى فتسقط جلستُه', async () => {
    const owner = cookieOf(await emailLogin(app, env))
    expect((await app.request('/panel/team', { headers: { Cookie: owner } }, env)).status).toBe(200)
    const ownerCsrf = await csrfOf(owner, '/panel/team')
    expect((await post('/panel/team/invite', owner, { _csrf: ownerCsrf, email: 'Sara@Example.com', role: 'editor', org: 'org_a' })).status).toBe(303)
    // ‏ورسالةُ الدعوة إلى بريده
    expect((env['EMAIL'] as FakeMailer).sent.some((m) => m.to === 'sara@example.com')).toBe(true)

    // ‏غيرُ المدعوّ لا يُرسَل إليه شيء، ولا يدخل
    expect((await memberLogin('nobody@example.com')).status).toBe(401)

    const login = await memberLogin('sara@example.com')
    expect(login.status).toBe(303)
    const sara = cookieOf(login)

    // ‏يرى رحلة العميل، ولا يرى الفريقَ ولا الإعدادات
    expect((await app.request('/panel/client', { headers: { Cookie: sara } }, env)).status).toBe(200)
    expect((await app.request('/panel/team', { headers: { Cookie: sara } }, env)).headers.get('Location')).toBe('/panel')
    expect((await app.request('/panel/settings', { headers: { Cookie: sara } }, env)).headers.get('Location')).toBe('/panel')

    const csrf = await csrfOf(sara)
    // ‏يكتب الموجز (محرّر) — والنموذجُ يُقرأ مرّتين: في الحارس ثمّ في المسار
    expect((await post('/panel/client/brief', sara, { _csrf: csrf, goal: 'هدفٌ من المحرّر', per_week: '2' })).headers.get('Location')).toBe('/panel/client?saved=1#brief')
    expect(db.raw.prepare("SELECT goal FROM briefs WHERE org_id = 'org_a'").get()).toEqual({ goal: 'هدفٌ من المحرّر' })
    // ‏ويُكتب بريدُه في التدقيق
    expect(db.raw.prepare("SELECT by_email FROM audit_log WHERE action = 'brief.write'").get()).toEqual({ by_email: 'sara@example.com' })

    // ‏ولا يبدأ الخطّة (ناشر)، ولا ينتقل إلى شركةٍ ليست له، ولا يدعو
    expect((await post('/panel/plan/start', sara, { _csrf: csrf, id: 'x' })).headers.get('Location')).toBe('/panel')
    expect((await post('/panel/orgs/switch', sara, { _csrf: csrf, org: 'org_b' })).headers.get('Location')).toBe('/panel')
    expect((await post('/panel/team/invite', sara, { _csrf: csrf, email: 'x@y.com', role: 'admin', all: '1' })).headers.get('Location')).toBe('/panel')
    expect(db.raw.prepare("SELECT count(*) AS n FROM members").get()).toEqual({ n: 1 })

    // ‏والإلغاءُ يُسقط جلستَه في طلبه التالي
    await post('/panel/team/revoke', owner, { _csrf: ownerCsrf, email: 'sara@example.com' })
    const after = await app.request('/panel/client', { headers: { Cookie: sara } }, env)
    expect(after.status).not.toBe(200)
  })

  it('المديرُ يقرأ الإعدادات بلا «الأمان» ولا «متقدّم»: لا أجهزةَ ولا مفاتيحَ ولا سجلَّ تدقيق (D-272)', async () => {
    const owner = cookieOf(await emailLogin(app, env))
    const ownerCsrf = await csrfOf(owner, '/panel/team')
    await post('/panel/team/invite', owner, { _csrf: ownerCsrf, email: 'admin@example.com', role: 'admin', all: '1' })
    const admin = cookieOf(await memberLogin('admin@example.com'))
    const res = await app.request('/panel/settings', { headers: { Cookie: admin } }, env)
    expect(res.status).toBe(200)
    const html = await res.text()
    for (const mark of ['security-all', 'data-sub id="advanced"', 'revoke-all', 'totp-confirm', 'passkey'])
      expect(html).not.toContain(mark)
    expect(html).toContain('data-sub id="limits"')
    // ‏والمالكُ يراها كما كانت
    const mine = await (await app.request('/panel/settings', { headers: { Cookie: owner } }, env)).text()
    for (const mark of ['security-all', 'data-sub id="advanced"', 'revoke-all']) expect(mine).toContain(mark)
  })
})

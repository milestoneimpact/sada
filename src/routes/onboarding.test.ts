/** تهيئةُ العميل والفريق (D-418): من «أنشئ المنظّمة» إلى جاهزيّتها، ودعوةٌ بأدنى دورٍ وبالشركة النشطة. */
import { beforeEach, describe, expect, it } from 'vitest'
import { emailLogin, fakeMailer } from '../test/emailLogin'
import { toBase64 } from '../lib/crypto'
import { fakeDb, fakeKv, type FakeDb } from '../test/fakes'
import { app } from '../index'

let db: FakeDb
let env: Record<string, unknown>

beforeEach(() => {
  db = fakeDb()
  db.raw.exec(`INSERT INTO orgs (id, name, kind) VALUES ('org_a', 'شركة أ', 'team')`)
  env = {
    SADA_ENV: 'staging', PUBLIC_BASE_URL: 'https://sada2.basserh.com', DRIVE_FOLDER_ID: 'folder',
    DB: db, KV: fakeKv(), TOKEN_ENC_KEY: toBase64(crypto.getRandomValues(new Uint8Array(32))),
    ADMIN_TOKEN: 'Yk3pQ9vX2mLsA7nR4tWfZ8cB6dH1jG0e', EMAIL: fakeMailer(),
  }
})

const cookieOf = (res: Response): string => (res.headers.get('Set-Cookie') ?? '').split(';')[0]!
const get = async (path: string, cookie: string): Promise<string> => (await app.request(path, { headers: { Cookie: cookie } }, env)).text()
const csrfOf = async (cookie: string, path = '/panel/client'): Promise<string> => /name="_csrf" value="([^"]+)"/.exec(await get(path, cookie))?.[1] ?? ''

async function post(path: string, cookie: string, fields: Record<string, string | string[]>): Promise<Response> {
  const body = new FormData()
  for (const [k, v] of Object.entries(fields)) for (const x of [v].flat()) body.append(k, x)
  return app.request(path, { method: 'POST', body, headers: { Cookie: cookie } }, env)
}

describe('إنشاءُ منظّمةٍ والانتقالُ إليها (D-418)', () => {
  it('مع switch=1 تصير النشطةَ ويُحوَّل إلى جاهزيّتها برسالةٍ تسمّيها', async () => {
    const owner = cookieOf(await emailLogin(app, env))
    const res = await post('/panel/orgs', owner, { _csrf: await csrfOf(owner), name: 'وكالة الأفق', kind: 'agency', switch: '1' })
    expect(res.status).toBe(303)
    expect(res.headers.get('Location')).toBe('/panel/client#setup')
    const page = await get('/panel/client', owner)
    expect(page).toContain('أُنشئ «وكالة الأفق» — ابدأ بربط حساباته.')
    expect(page).toContain('<bdi>وكالة الأفق</bdi>')
  })

  it('بلا switch تبقى في القائمة كما كانت', async () => {
    const owner = cookieOf(await emailLogin(app, env))
    const res = await post('/panel/orgs', owner, { _csrf: await csrfOf(owner), name: 'جمعيّة', kind: 'team' })
    expect(res.headers.get('Location')).not.toBe('/panel/client#setup')
  })

  it('النموذجُ: الاسمُ autofocus، والنوعُ «وكالة» افتراضًا، و«انتقل إليها» مؤشَّر — والحذفُ بمطابقة الاسم', async () => {
    const owner = cookieOf(await emailLogin(app, env))
    const html = await get('/panel/settings', owner)
    expect(html).toMatch(/id="org-name"[^>]*autofocus/)
    expect(html).toContain('<option value="agency" selected>')
    expect(html).toMatch(/name="switch" value="1" checked/)
    expect(html).toContain('data-match-confirm')
    expect(html).toContain('data-name="شركة أ"')
    expect(html).toContain('اكتب: «<span data-match-name>شركة أ</span>»')
    expect(html).toContain('بين 0 و500 بخطوة 1')
  })
})

describe('جاهزيّةُ العميل (D-418)', () => {
  it('ثلاثةُ بنودٍ قبل الرحلة، والقناةُ الناقصةُ الخطوةُ الحاليّة، و«خطّط» ثانويٌّ إلى /panel/plan', async () => {
    const owner = cookieOf(await emailLogin(app, env))
    const html = await get('/panel/client', owner)
    const at = html.indexOf('id="setup"')
    expect(at).toBeGreaterThan(-1)
    // ‏قبل شريط الرحلة: شريطُها أوّلُ ‹ol.flow› بعد قسم الجاهزيّة
    const end = html.indexOf('</ol>', at)
    expect(html.indexOf('class="flow"', end)).toBeGreaterThan(end)
    const setup = html.slice(at, end)
    expect(setup.match(/<li data-state="(done|now)"/g)?.length).toBe(3)
    expect(setup).toMatch(/<li data-state="now" aria-current="step">/)
    expect(html).not.toContain('#sub-plan')
    expect(html).toContain('class="btn btn-secondary btn-sm" href="/panel/plan">خطّط')
  })
})

describe('دعوةُ عضو (D-418)', () => {
  it('الدورُ الافتراضيُّ «قارئ»، والشركةُ النشطةُ مؤشَّرة، و«كلّ الشركات» لا', async () => {
    const owner = cookieOf(await emailLogin(app, env))
    const html = await get('/panel/team', owner)
    expect(html).toMatch(/name="role" value="viewer" checked/)
    expect(html).not.toMatch(/name="role" value="editor" checked/)
    expect(html).toMatch(/name="all" value="1">/)
    expect(html.match(/name="org" value="[^"]+" checked/g)?.length).toBe(1)
    expect(html).not.toMatch(/name="org" value="org_a" checked/)
    expect(html).toContain('data-pick-msg')
    expect(html).toContain('form[data-invite]')
  })

  it('بلا «all» تُقبل الشركاتُ بعينها، وبلا شيءٍ يُردّ بسببه', async () => {
    const owner = cookieOf(await emailLogin(app, env))
    const csrf = await csrfOf(owner, '/panel/team')
    expect((await post('/panel/team/invite', owner, { _csrf: csrf, email: 'a@example.com', role: 'viewer', org: ['org_a', 'org_a'] })).headers.get('Location')).toBe('/panel/team')
    const row = db.raw.prepare("SELECT orgs FROM members WHERE email = 'a@example.com'").get() as { orgs: string }
    expect(row.orgs).toBe('org_a')
    const none = await post('/panel/team/invite', owner, { _csrf: csrf, email: 'b@example.com', role: 'viewer' })
    expect(none.headers.get('Location')).toBe('/panel/team#invite')
  })
})

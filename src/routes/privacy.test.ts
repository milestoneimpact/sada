/**
 * الحذفُ والتصديرُ من اللوحة (D-322) — **عبر التطبيق نفسِه**: الحارسُ والدورُ و«تحقّق للتوّ» والإشعارُ بزرّه.
 *
 * - المسوّدةُ تُحذف بلا سؤال وتعود بـ«تراجَع» من الإشعار، والمحرّرُ لا يحذف.
 * - تصديرُ عميلٍ وحذفُه للمالك وحدَه وبتحقّقٍ حديث: جلسةٌ تحقّقت قبل ستّ دقائق تُحوَّل إلى «تحقّق للتوّ» ولا يُحذف شيء،
 *   ومديرٌ مدعوٌّ يُردّ، ومنظّمةُ المالك لا تُحذف، والحذفُ قبل التصدير يُردّ بسببه.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { emailLogin, fakeMailer } from '../test/emailLogin'
import { toBase64 } from '../lib/crypto'
import { fakeDb, fakeKv, type FakeDb } from '../test/fakes'
import { app } from '../index'

let db: FakeDb
let kv: ReturnType<typeof fakeKv>
let env: Record<string, unknown>

beforeEach(() => {
  db = fakeDb()
  kv = fakeKv()
  db.raw.exec(`INSERT INTO orgs (id, name, kind) VALUES ('org_a', 'شركة أ', 'agency')`)
  db.raw.exec(`INSERT INTO posts (id, platform, type, text, status, idempotency_key) VALUES
    ('0a0a0a0a-0000-4000-8000-000000000001', 'linkedin', 'text', 'مسوّدةٌ للحذف', 'draft', 'k1')`)
  db.raw.exec(`INSERT INTO posts (id, platform, type, text, status, idempotency_key, org_id) VALUES
    ('0a0a0a0a-0000-4000-8000-0000000000aa', 'x', 'text', 'منشور العميل', 'draft', 'ka', 'org_a')`)
  env = {
    SADA_ENV: 'staging', PUBLIC_BASE_URL: 'https://sada2.basserh.com', DRIVE_FOLDER_ID: 'folder',
    DB: db, KV: kv, TOKEN_ENC_KEY: toBase64(crypto.getRandomValues(new Uint8Array(32))),
    ADMIN_TOKEN: 'Yk3pQ9vX2mLsA7nR4tWfZ8cB6dH1jG0e', EMAIL: fakeMailer(),
  }
})

const POST = '0a0a0a0a-0000-4000-8000-000000000001'
const cookieOf = (res: Response): string => (res.headers.get('Set-Cookie') ?? '').split(';')[0]!
const csrfOf = async (cookie: string, path = '/panel/client'): Promise<string> =>
  /name="_csrf" value="([^"]+)"/.exec(await (await app.request(path, { headers: { Cookie: cookie } }, env)).text())?.[1] ?? ''

async function post(path: string, cookie: string, fields: Record<string, string>): Promise<Response> {
  const body = new FormData()
  for (const [k, v] of Object.entries(fields)) body.append(k, v)
  return app.request(path, { method: 'POST', body, headers: { Cookie: cookie } }, env)
}

/** يقدّم «تحقّقتَ للتوّ» دقائقَ — كأنّ المالكَ فتح الجلسة ثمّ عاد بعدها. */
async function age(cookie: string, minutes: number): Promise<void> {
  const key = `session:${cookie.split('=')[1]!}`
  const record = JSON.parse((await kv.get(key))!) as Record<string, unknown>
  record['fresh'] = new Date(Date.now() - minutes * 60_000).toISOString()
  await kv.put(key, JSON.stringify(record))
}

const count = (sql: string): number => (db.raw.prepare(sql).get() as { n: number }).n

async function invite(owner: string, email: string, role: string): Promise<string> {
  await post('/panel/team/invite', owner, { _csrf: await csrfOf(owner, '/panel/team'), email, role, all: '1' })
  return cookieOf(await emailLogin(app, env, { email }))
}

describe('المسوّدة: احذفها ثمّ «تراجَع»', () => {
  it('تُحذف بلا سؤال، والإشعارُ يحمل «تراجَع» برمزٍ لا بالصفّ، فتعود كما كانت', async () => {
    const owner = cookieOf(await emailLogin(app, env))
    const csrf = await csrfOf(owner)
    const res = await post('/panel/drafts/delete', owner, { _csrf: csrf, id: POST })
    expect(res.status).toBe(303)
    expect(count('SELECT COUNT(*) AS n FROM posts WHERE org_id = \'org_owner\'')).toBe(0)

    const page = await (await app.request(res.headers.get('Location') ?? '/panel', { headers: { Cookie: owner } }, env)).text()
    expect(page).toContain('حُذفت المسوّدة')
    const form = /<form[^>]*action="\/panel\/trash\/restore"[\s\S]*?<\/form>/.exec(page)?.[0] ?? ''
    const token = /name="id" value="([^"]+)"/.exec(form)?.[1] ?? ''
    expect(token).toMatch(/^[0-9a-f-]{36}$/)
    // ‏الزرُّ لا يحمل النصَّ ولا الحالَ: لا يُصنع منه منشورٌ معتمَد. ويُرسَل بتحميلٍ لا بتبديل: ما يعود ليس في الصفحة
    expect(form).not.toContain('مسوّدةٌ للحذف')
    expect(form).not.toContain('data-swap')

    const back = await post('/panel/trash/restore', owner, { _csrf: csrf, id: token })
    expect(back.status).toBe(303)
    expect(db.raw.prepare('SELECT text, status FROM posts WHERE id = ?').get(POST)).toEqual({ text: 'مسوّدةٌ للحذف', status: 'draft' })
    const actions = (db.raw.prepare("SELECT action, target FROM audit_log WHERE action IN ('post.delete', 'trash.restore') ORDER BY id").all() as { action: string; target: string }[])
    expect(actions).toEqual([{ action: 'post.delete', target: POST }, { action: 'trash.restore', target: POST }])
  })

  it('**والمحرّرُ لا يحذف** — الحذفُ لمن يعتمد', async () => {
    const owner = cookieOf(await emailLogin(app, env))
    const editor = await invite(owner, 'ed@example.com', 'editor')
    const res = await post('/panel/drafts/delete', editor, { _csrf: await csrfOf(editor), id: POST })
    expect(res.headers.get('Location')).toBe('/panel')
    expect(count('SELECT COUNT(*) AS n FROM posts')).toBe(2)
  })

  it('ومسوّدةُ عميلٍ آخر لا تُحذف من جلسةٍ في غيره', async () => {
    const owner = cookieOf(await emailLogin(app, env))
    await post('/panel/drafts/delete', owner, { _csrf: await csrfOf(owner), id: '0a0a0a0a-0000-4000-8000-0000000000aa' })
    expect(count("SELECT COUNT(*) AS n FROM posts WHERE org_id = 'org_a'")).toBe(1)
  })
})

describe('تصديرُ عميلٍ وحذفُه: المالكُ وحدَه وبتحقّقٍ للتوّ', () => {
  it('المالكُ يصدّر ملفًّا يُنزَّل، ويُكتب سطرُه في سجلّه', async () => {
    const owner = cookieOf(await emailLogin(app, env))
    const res = await app.request('/panel/orgs/export?org=org_a', { headers: { Cookie: owner } }, env)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Disposition')).toMatch(/^attachment; filename="sada-org_a-\d{4}-\d{2}-\d{2}\.json"$/)
    expect(res.headers.get('Cache-Control')).toContain('no-store')
    const data = await res.json() as { format: string; tables: { posts: { id: string }[] } }
    expect(data.format).toBe('sada-org-export')
    expect(data.tables.posts.map((p) => p.id)).toEqual(['0a0a0a0a-0000-4000-8000-0000000000aa'])
    expect(db.raw.prepare("SELECT org_id, target FROM audit_log WHERE action = 'org.export'").get()).toEqual({ org_id: 'org_owner', target: 'org_a' })
  })

  it('**وجلسةٌ تحقّقت قبل ستّ دقائق تُحوَّل إلى «تحقّق للتوّ»** — للتصدير وللحذف — ولا يقع شيء', async () => {
    const owner = cookieOf(await emailLogin(app, env))
    const csrf = await csrfOf(owner)
    await age(owner, 6)
    const exp = await app.request('/panel/orgs/export?org=org_a', { headers: { Cookie: owner } }, env)
    expect(exp.status).toBe(303)
    expect(exp.headers.get('Location')).toBe(`/panel/stepup?next=${encodeURIComponent('/panel/orgs/export?org=org_a')}`)
    const del = await post('/panel/orgs/delete', owner, { _csrf: csrf, org: 'org_a', confirm: 'شركة أ' })
    expect(del.headers.get('Location') ?? '').toContain('/panel/stepup')
    expect(count("SELECT COUNT(*) AS n FROM orgs WHERE id = 'org_a'")).toBe(1)
    expect(count("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'org.export'")).toBe(0)
  })

  it('**والمديرُ المدعوُّ لا يصدّر ولا يحذف** — ولو بمسارٍ مرمَّز', async () => {
    const owner = cookieOf(await emailLogin(app, env))
    const admin = await invite(owner, 'admin@example.com', 'admin')
    expect((await app.request('/panel/orgs/export?org=org_a', { headers: { Cookie: admin } }, env)).headers.get('Location')).toBe('/panel')
    const csrf = await csrfOf(admin)
    for (const path of ['/panel/orgs/delete', '/panel/orgs/%64elete']) {
      expect((await post(path, admin, { _csrf: csrf, org: 'org_a', confirm: 'شركة أ' })).headers.get('Location'), path).toBe('/panel')
    }
    expect(count("SELECT COUNT(*) AS n FROM orgs WHERE id = 'org_a'")).toBe(1)
  })

  it('الحذفُ قبل التصدير يُردّ بسببه، وبعده يقع — ومنظّمةُ المالك لا تُحذف أبدًا', async () => {
    const owner = cookieOf(await emailLogin(app, env))
    const csrf = await csrfOf(owner)
    await post('/panel/orgs/delete', owner, { _csrf: csrf, org: 'org_a', confirm: 'شركة أ' })
    expect(count("SELECT COUNT(*) AS n FROM orgs WHERE id = 'org_a'")).toBe(1)
    expect(db.raw.prepare("SELECT detail FROM audit_log WHERE action = 'org.delete' ORDER BY id DESC").get()).toMatchObject({ detail: expect.stringContaining('صدّر') })

    await app.request('/panel/orgs/export?org=org_a', { headers: { Cookie: owner } }, env)
    const done = await post('/panel/orgs/delete', owner, { _csrf: csrf, org: 'org_a', confirm: 'شركة أ' })
    expect(done.status).toBe(303)
    expect(count("SELECT COUNT(*) AS n FROM orgs WHERE id = 'org_a'")).toBe(0)
    expect(count("SELECT COUNT(*) AS n FROM posts WHERE org_id = 'org_a'")).toBe(0)
    expect(count("SELECT COUNT(*) AS n FROM posts WHERE org_id = 'org_owner'")).toBe(1)
    // ‏وسطرُ الحذف في سجلّ المالك يبقى بعد أن ذهب العميل
    expect(db.raw.prepare("SELECT org_id, target FROM audit_log WHERE action = 'org.delete' ORDER BY id DESC").get()).toEqual({ org_id: 'org_owner', target: 'org_a' })

    await app.request('/panel/orgs/export?org=org_owner', { headers: { Cookie: owner } }, env)
    const name = (db.raw.prepare("SELECT name FROM orgs WHERE id = 'org_owner'").get() as { name: string }).name
    await post('/panel/orgs/delete', owner, { _csrf: csrf, org: 'org_owner', confirm: name })
    expect(count("SELECT COUNT(*) AS n FROM orgs WHERE id = 'org_owner'")).toBe(1)
  })

  it('والإعداداتُ تعرض «صدّر» لكلّ عميل، ونموذجَ الحذف بلا منظّمة المالك', async () => {
    const owner = cookieOf(await emailLogin(app, env))
    const html = await (await app.request('/panel/settings', { headers: { Cookie: owner } }, env)).text()
    expect(html).toContain('href="/panel/orgs/export?org=org_a"')
    expect(html).toContain('href="/panel/orgs/export?org=org_owner"')
    const form = /<form method="POST" action="\/panel\/orgs\/delete"[\s\S]*?<\/form>/.exec(html)?.[0] ?? ''
    expect(form).toContain('value="org_a"')
    expect(form).not.toContain('value="org_owner"')
  })
})

describe('الأبوابُ في اللوحة', () => {
  it('«احذفها» في قائمة المسوّدة، و«احذف» للمصدر المرفوع وللمقطع ولصورة الأصول — بلا «أتمضي؟»', async () => {
    db.raw.exec(`INSERT INTO sources (id, drive_file_id, name, mime, content_hash, kind) VALUES ('src:upload:h', 'upload:h', 'ملفّي.txt', 'text/plain', 'h', 'upload'),
      ('src:drive', 'drive-1', 'في المجلّد.txt', 'text/plain', 'h', 'drive')`)
    db.raw.exec(`INSERT INTO uploads (id, r2_key, name, mime, bytes, status) VALUES ('u1', 'upload/u1.mp4', 'مقطعي.mp4', 'video/mp4', 9, 'ready')`)
    db.raw.exec(`INSERT INTO library_files (id, r2_key, name, mime, bytes) VALUES ('f1', 'library/org_owner/f1.png', 'شعار.png', 'image/png', 9)`)
    const owner = cookieOf(await emailLogin(app, env))
    const posts = await (await app.request('/panel', { headers: { Cookie: owner } }, env)).text()
    const del = /<form class="menu-form" method="POST" action="\/panel\/drafts\/delete"[\s\S]*?<\/form>/.exec(posts)?.[0] ?? ''
    expect(del).toContain(`value="${POST}"`)
    expect(del).not.toContain('data-confirm')
    const library = await (await app.request('/panel/library', { headers: { Cookie: owner } }, env)).text()
    const forms = library.match(/<form[^>]*action="\/panel\/sources\/delete"[\s\S]*?<\/form>/g) ?? []
    // ‏وملفُّ Drive الذي رآه المسحُ للتوّ لا زرَّ له: يُحذف من المجلّد أوّلًا
    expect(forms.map((f) => /name="id" value="([^"]+)"/.exec(f)?.[1])).toEqual(['src:upload:h'])
    expect(library).toContain('action="/panel/uploads/u1/delete"')
    const assets = await (await app.request('/panel/assets', { headers: { Cookie: owner } }, env)).text()
    expect(assets).toContain('action="/panel/assets/delete"')
    expect(assets).toContain('value="f:f1"')
  })
})

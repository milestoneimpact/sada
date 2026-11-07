/**
 * ‏**«بنفسي» و«تراجَع» بعد الجدولة** (D-324) — من الشاشة إلى القاعدة.
 *
 * ‏كان كلُّ بابٍ إلى مسوّدةٍ يمرّ بنموذجٍ مدفوع («من فكرة» و«من مصدر»)، فنصٌّ كتبه المالكُ بيده لا يصل إلى اللوحة إلّا مكتوبًا
 * ‏من جديد. وكان إشعارُ «اعتُمدت وجُدولت» و«جُدولت» يُغلَق بلا «تراجَع».
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { emailLogin } from '../test/emailLogin'
import { toBase64 } from '../lib/crypto'
import { fakeDb, fakeKv, type FakeDb } from '../test/fakes'
import { app } from '../index'

const TOKEN = 'Yk3pQ9vX2mLsA7nR4tWfZ8cB6dH1jG0e'
const KEY = toBase64(crypto.getRandomValues(new Uint8Array(32)))

let db: FakeDb
let env: Record<string, unknown>
let csrf = ''

beforeEach(() => {
  db = fakeDb()
  env = {
    SADA_ENV: 'staging', PUBLIC_BASE_URL: 'https://sada2.basserh.com', DRIVE_FOLDER_ID: 'folder',
    DB: db, KV: fakeKv(), TOKEN_ENC_KEY: KEY, ADMIN_TOKEN: TOKEN,
  }
})

async function login(): Promise<string> {
  const response = await emailLogin(app, env)
  const cookie = (response.headers.get('Set-Cookie') ?? '').split(';')[0]!
  const page = await app.request('/panel', { headers: { Cookie: cookie } }, env)
  csrf = /name="_csrf" value="([^"]+)"/.exec(await page.text())?.[1] ?? ''
  return cookie
}

async function post(cookie: string, path: string, fields: Record<string, string>): Promise<Response> {
  const body = new FormData()
  for (const [k, v] of Object.entries(fields)) body.set(k, v)
  body.set('_csrf', csrf)
  return app.request(path, { method: 'POST', body, headers: { Cookie: cookie } }, env)
}

const where = (r: Response): string => r.headers.get('Location') ?? ''
const panel = async (cookie: string): Promise<string> => (await app.request('/panel', { headers: { Cookie: cookie } }, env)).text()

const MINE = 'الحوكمة لا تبطئ القرار، تحميه — (وهذا قولي كما كتبته) #الحوكمة'

describe('«بنفسي» (D-324)', () => {
  it('المُنشئ بابٌ ثالث «بنفسي»: نصٌّ ومنصّةٌ وزرٌّ أوّليٌّ واحد، وسطرُ «بلا نموذج ولا كلفة»', async () => {
    const html = await panel(await login())
    expect(html).toContain('<label><input type="radio" name="cmp" value="own">بنفسي</label>')
    const own = html.slice(html.indexOf('<div id="own">'), html.indexOf('</form>', html.indexOf('<div id="own">')))
    expect(own).toContain('action="/panel/drafts/own"')
    expect(own).toContain('name="text"')
    expect(own).toContain('<input type="radio" name="platform" value="linkedin" checked')
    expect(own).toContain('<input type="radio" name="platform" value="x"')
    expect(own).toContain('بلا نموذج ولا كلفة')
    expect(own.match(/btn-primary/g)).toHaveLength(1)
    // ‏وفي «منشور جديد» بابٌ إليه
    expect(html).toContain('href="/panel#own"')
  })

  it('يحفظ النصَّ كما كُتب مسوّدةً (model=owner، صفر) ولا صفَّ في الدفتر، ويعود إلى بطاقتها', async () => {
    const cookie = await login()
    const r = await post(cookie, '/panel/drafts/own', { platform: 'linkedin', text: `${MINE}\r\n` })
    const row = await db.prepare('SELECT id, text, model, cost_usd, status FROM posts').first<{ id: string; text: string; model: string; cost_usd: number; status: string }>()
    expect(row).toMatchObject({ text: MINE, model: 'owner', cost_usd: 0, status: 'draft' })
    expect(where(r)).toBe(`/panel#d-${row!.id}`)
    expect((await db.prepare('SELECT COUNT(*) AS n FROM cost_ledger').first<{ n: number }>())?.n).toBe(0)
    const html = await panel(cookie)
    expect(html).toContain('حُفظ نصّك مسوّدةً كما كتبته، بلا نموذج ولا كلفة.')
    expect(html).toContain('كتبها أنت')
    const audit = await db.prepare("SELECT action, detail FROM audit_log WHERE action = 'draft.own'").first()
    expect(audit).toEqual({ action: 'draft.own', detail: 'linkedin:drafted' })
  })

  it('وسلسلةُ X تُقال بعددها، وما فوق الحدّ يُردّ إلى «بنفسي» بسببه، ومنصّةٌ لا نعرفها تُردّ', async () => {
    const cookie = await login()
    const thread = `${'ن'.repeat(200)}\n---\n${'م'.repeat(200)}\n---\nوالثالثة قصيرة.`
    await post(cookie, '/panel/drafts/own', { platform: 'x', text: thread })
    expect(await panel(cookie)).toContain('سلسلة X من 3 تغريدات')
    const long = await post(cookie, '/panel/drafts/own', { platform: 'x', text: 'ن'.repeat(281) })
    expect(where(long)).toBe('/panel#own')
    expect(await panel(cookie)).toContain('لم يُحفظ: النصّ 281 محرفا بحساب X وهي تقبل 280')
    expect(where(await post(cookie, '/panel/drafts/own', { platform: 'tiktok', text: MINE }))).toBe('/panel#own')
    expect((await db.prepare('SELECT COUNT(*) AS n FROM posts').first<{ n: number }>())?.n).toBe(1)
  })
})

async function seedAccount(platform = 'linkedin'): Promise<string> {
  const id = crypto.randomUUID()
  await db.prepare("INSERT INTO accounts (id, platform, kind, external_id, display_name, status) VALUES (?, ?, 'member', ?, 'عمر', 'active')")
    .bind(id, platform, id.slice(0, 8)).run()
  return id
}

async function seedPost(status = 'draft'): Promise<string> {
  const id = crypto.randomUUID()
  await db.prepare(
    `INSERT INTO posts (id, platform, type, text, status, idempotency_key, model, approved_by, approved_at)
     VALUES (?, 'linkedin', 'text', ?, ?, ?, 'claude-opus-5', ?, ?)`,
  ).bind(id, 'ن'.repeat(300), status, `k-${id}`, status === 'draft' ? null : 'omar', status === 'draft' ? null : '2026-09-07 10:00:00').run()
  return id
}

/** حقولُ زرّ «تراجَع» كما رسمها الإشعار. */
function undoFields(html: string): Record<string, string> {
  const form = /<form class="inline" method="POST" action="\/panel\/drafts\/undo-schedule"[\s\S]*?<\/form>/.exec(html)?.[0] ?? ''
  const out: Record<string, string> = {}
  for (const m of form.matchAll(/<input type="hidden" name="([a-z]+)" value="([^"]*)">/g)) out[m[1]!] = m[2]!
  return out
}

describe('«تراجَع» بعد الجدولة (D-324)', () => {
  it('«اعتمد وجدوِل» ثمّ «تراجَع» من الإشعار: تعود مسوّدةً تنتظر القرار، بلا موعدٍ ولا حساب', async () => {
    const id = await seedPost()
    const account = await seedAccount()
    const cookie = await login()
    await post(cookie, '/panel/drafts/decide', { id, do: 'approve-schedule', account, when: '2030-03-04T06:00' })
    const html = await panel(cookie)
    expect(html).toContain('اعتُمدت وجُدولت على LinkedIn')
    const fields = undoFields(html)
    expect(fields).toMatchObject({ id, at: '2030-03-04 06:00:00', to: 'draft' })
    expect(fields['until']).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    const r = await post(cookie, '/panel/drafts/undo-schedule', fields)
    expect(where(r)).toBe(`/panel#d-${id}`)
    const row = await db.prepare('SELECT status, scheduled_at, account_id, approved_at FROM posts WHERE id = ?').bind(id).first()
    expect(row).toEqual({ status: 'draft', scheduled_at: null, account_id: null, approved_at: null })
    expect(await panel(cookie)).toContain('عادت مسوّدةً تنتظر قرارك، بلا موعد.')
  })

  it('«جدوِل» ثمّ «تراجَع»: تعود معتمَدةً تنتظر موعدًا', async () => {
    const id = await seedPost('approved')
    const account = await seedAccount()
    const cookie = await login()
    await post(cookie, '/panel/drafts/schedule', { id, account, when: '2030-03-04T06:00' })
    const fields = undoFields(await panel(cookie))
    expect(fields).toMatchObject({ id, at: '2030-03-04 06:00:00', to: 'approved' })
    await post(cookie, '/panel/drafts/undo-schedule', fields)
    const row = await db.prepare('SELECT status, scheduled_at FROM posts WHERE id = ?').bind(id).first()
    expect(row).toEqual({ status: 'approved', scheduled_at: null })
    expect(await panel(cookie)).toContain('سُحب الموعد، وتبقى معتمَدةً تنتظر موعدًا.')
  })

  it('وموعدٌ داخل دقيقتي التراجع يُردّ من اللوحة بسببه — فلا يُنشَر شيءٌ والزرُّ قائم', async () => {
    const id = await seedPost('approved')
    const account = await seedAccount()
    const cookie = await login()
    const soon = new Date(Date.now() + 60_000).toISOString().slice(0, 16)
    await post(cookie, '/panel/drafts/schedule', { id, account, when: soon })
    expect(await panel(cookie)).toContain('الموعد بعد أقلّ من دقيقتين')
    expect((await db.prepare('SELECT status FROM posts WHERE id = ?').bind(id).first<{ status: string }>())?.status).toBe('approved')
  })

  it('وزرٌّ شاخ بعد النافذة يُقال سببه ولا يقلب شيئًا', async () => {
    const id = await seedPost('approved')
    const account = await seedAccount()
    const cookie = await login()
    await post(cookie, '/panel/drafts/schedule', { id, account, when: '2030-03-04T06:00' })
    const fields = { ...undoFields(await panel(cookie)), until: '2020-01-01T00:00:00.000Z' }
    await post(cookie, '/panel/drafts/undo-schedule', fields)
    expect((await db.prepare('SELECT status FROM posts WHERE id = ?').bind(id).first<{ status: string }>())?.status).toBe('queued')
    expect(await panel(cookie)).toContain('تعذّر التراجع: مضت دقيقتا التراجع')
  })
})

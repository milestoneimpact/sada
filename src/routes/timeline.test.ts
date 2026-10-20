/**
 * شاشةُ الخطّ الزمنيّ (D-212) — من طرفها إلى طرفها: البابُ، والاستعلامُ على القاعدة
 * المزيّفة، وأنّ كلَّ شريطٍ رابطٌ إلى رحلته، وأنّ العنوانَ لا يُسقط الصفحة.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { toBase64 } from '../lib/crypto'
import { COOKIE } from '../lib/session'
import { fakeDb, fakeKv, type FakeDb } from '../test/fakes'
import { app } from '../index'

const TOKEN = 'Yk3pQ9vX2mLsA7nR4tWfZ8cB6dH1jG0e'
const KEY = toBase64(crypto.getRandomValues(new Uint8Array(32)))

let db: FakeDb
let env: Record<string, unknown>

/** لحظةٌ بصيغة القاعدة قبل الآن أو بعده بأيّام. */
function at(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 19).replace('T', ' ')
}

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
  }
  db.raw.exec(
    `INSERT INTO accounts (id, platform, kind, external_id, display_name)
     VALUES ('a-li', 'linkedin', 'member', 'e1', 'عمر على LinkedIn'),
            ('a-x', 'x', 'member', 'e2', '@omar')`,
  )
  // ‏منشورٌ نُشر قبل ثلاثة أيّام، وآخرُ مجدولٌ بعد أسبوع، ومسوّدةٌ بلا قرارٍ منذ أربعين يومًا، وقديمٌ خارجَ النافذة
  db.raw.exec(
    `INSERT INTO posts (id, account_id, platform, type, text, scheduled_at, status, idempotency_key,
                        approved_by, approved_at, created_at)
     VALUES ('pub', 'a-li', 'linkedin', 'text', 'ثلاثة دروس من مراجعة المحفظة', '${at(-3)}', 'published', 'k1',
             'omar', '${at(-4)}', '${at(-6)}'),
            ('next', 'a-x', 'x', 'text', 'جملة حادّة عن الأثر', '${at(7)}', 'queued', 'k2',
             'omar', '${at(-1)}', '${at(-2)}'),
            ('old', 'a-x', 'x', 'text', 'منشور قديم', '${at(-80)}', 'published', 'k4',
             'omar', '${at(-81)}', '${at(-82)}')`,
  )
  db.raw.exec(
    `INSERT INTO posts (id, account_id, platform, type, text, status, idempotency_key, created_at)
     VALUES ('wait', NULL, 'linkedin', 'text', 'مسوّدة <تنتظر>', 'draft', 'k3', '${at(-40)}')`,
  )
  db.raw.exec(
    `INSERT INTO publish_attempts (id, post_id, idempotency_key, attempt_no, request_json, status, at)
     VALUES ('t1', 'pub', 'k1', 1, '{}', 'succeeded', '${at(-3)}'),
            ('t2', 'old', 'k4', 1, '{}', 'succeeded', '${at(-80)}')`,
  )
})

async function login(): Promise<string> {
  const body = new FormData()
  body.set('token', TOKEN)
  const response = await app.request('/panel/login', { method: 'POST', body }, env)
  return (response.headers.get('Set-Cookie') ?? '').split(';')[0]!
}

describe('الخطّ الزمنيّ', () => {
  it('لا يُفتَح بلا جلسة', async () => {
    const response = await app.request('/panel/timeline', { headers: { Cookie: `${COOKIE}=gone` } }, env)
    expect(response.status).toBe(401)
  })

  it('يرسم المحفظة: المنصّات وحساباتُها، وكلّ شريط رابط إلى رحلته', async () => {
    const cookie = await login()
    const response = await app.request('/panel/timeline', { headers: { Cookie: cookie } }, env)
    expect(response.status).toBe(200)
    const html = await response.text()
    expect(html).toContain('<h1>الخطّ الزمنيّ</h1>')
    expect(html).toContain('aria-current="page"><span>الخطّ الزمنيّ</span>')
    expect(html).toContain('<h3 class="gt-gh">LinkedIn</h3>')
    expect(html).toContain('<h3 class="gt-gh">X</h3>')
    expect(html).toContain('href="/panel/journey/pub"')
    expect(html).toContain('href="/panel/journey/next"')
    // ‏والمسوّدةُ القديمةُ بلا قرارٍ تُرى — وهي أهمُّ ما يُرى — بلا حسابٍ ومهرَّبة
    expect(html).toContain('href="/panel/journey/wait"')
    expect(html).toContain('لم يُربَط بحساب')
    expect(html).toContain('مسوّدة &lt;تنتظر&gt;')
    expect(html).not.toContain('مسوّدة <تنتظر>')
    // ‏وما انتهى قبل النافذة لا يدخلها
    expect(html).not.toContain('/panel/journey/old')
    expect(html).toMatch(/<b>3<\/b>في النافذة/)
  })

  it('المدى والنافذة من العنوان، وما لا يُعرَف يعود إلى افتراضه', async () => {
    const cookie = await login()
    const back = await (await app.request('/panel/timeline?span=90&at=-1', { headers: { Cookie: cookie } }, env)).text()
    expect(back).toContain('/panel/journey/old')
    expect(back).toContain('<option value="90" selected>')
    expect(back).toContain('href="/panel/timeline?span=90">إلى اليوم</a>')
    const junk = await app.request("/panel/timeline?span=7'&at=x", { headers: { Cookie: cookie } }, env)
    expect(junk.status).toBe(200)
    expect(await junk.text()).toContain('<option value="30" selected>')
  })
})

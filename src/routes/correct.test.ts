/**
 * «صحّح المنشور» من اللوحة (D-391): الزرُّ على بطاقة المنشور في التيّار وصفحتِه للمحرّر فأعلى وحده، وCSRF، وصفحةُ التأكيد
 * ‏بلا سكربت لـ«احذف وأعد النشر»، والحالُ «صُحّح» بعد التصحيح.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { emailLogin } from '../test/emailLogin'
import { toBase64 } from '../lib/crypto'
import { fakeDb, fakeKv, type FakeDb } from '../test/fakes'
import { app } from '../index'

let db: FakeDb
let env: Record<string, unknown>
const ID = '0a1b2c3d-0009-4000-8000-000000000001'

beforeEach(() => {
  db = fakeDb()
  env = {
    SADA_ENV: 'staging', PUBLIC_BASE_URL: 'https://sada2.basserh.com', DRIVE_FOLDER_ID: 'folder',
    DB: db, KV: fakeKv(), TOKEN_ENC_KEY: toBase64(crypto.getRandomValues(new Uint8Array(32))), ADMIN_TOKEN: 'Yk3pQ9vX2mLsA7nR4tWfZ8cB6dH1jG0e',
  }
  db.raw.exec(`INSERT INTO accounts (id, platform, kind, external_id, display_name, status) VALUES ('a1', 'x', 'member', '4242', 'عمر', 'active')`)
  db.raw.exec(`INSERT INTO posts (id, platform, type, text, status, idempotency_key, account_id, scheduled_at, approved_by, approved_at) VALUES
    ('${ID}', 'x', 'text', 'تغريدةٌ فيها خطأ', 'published', 'k1', 'a1', datetime('now', '-1 day'), 'owner', datetime('now', '-2 days'))`)
  db.raw.exec(`INSERT INTO publish_attempts (id, post_id, idempotency_key, attempt_no, request_json, status, platform_post_id) VALUES ('t1', '${ID}', 'k1', 1, '{}', 'succeeded', '1800000000000000001')`)
})

async function session(email?: string): Promise<{ cookie: string; csrf: string }> {
  const cookie = ((await emailLogin(app, env, email === undefined ? {} : { email })).headers.get('Set-Cookie') ?? '').split(';')[0]!
  const html = await (await app.request(`/panel/posts/${ID}/correct`, { headers: { Cookie: cookie } }, env)).text()
  return { cookie, csrf: /name="_csrf" value="([^"]+)"/.exec(html)?.[1] ?? '' }
}

const form = (fields: Record<string, string>): FormData => {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

describe('«صحّح المنشور» (D-391)', () => {
  it('المالكُ يرى الزرَّ على بطاقة المنشور وفي صفحته، وصفحةُ التصحيح بخيارَي X ومفتاحٍ في النموذج', async () => {
    const { cookie } = await session()
    const feed = await (await app.request('/panel/feed', { headers: { Cookie: cookie } }, env)).text()
    expect(feed).toContain(`href="/panel/posts/${ID}/correct">صحّح المنشور</a>`)
    const journey = await (await app.request(`/panel/journey/${ID}`, { headers: { Cookie: cookie } }, env)).text()
    expect(journey).toContain(`/panel/posts/${ID}/correct`)
    const page = await (await app.request(`/panel/posts/${ID}/correct`, { headers: { Cookie: cookie } }, env)).text()
    expect(page).toContain('ردٌّ تصحيحيّ')
    expect(page).toContain('احذف وأعد النشر')
    expect(page).toMatch(/name="key" value="[0-9a-f-]{36}"/)
    expect(page).not.toContain('<script src')
  })

  it('القارئُ بلا زرّ، ومسارُه مردود', async () => {
    db.raw.prepare("INSERT INTO members (email, role, orgs, invited_by) VALUES ('v@example.com', 'viewer', '*', 'owner')").run()
    const { cookie, csrf } = await session('v@example.com')
    const feed = await (await app.request('/panel/feed', { headers: { Cookie: cookie } }, env)).text()
    expect(feed).not.toContain('صحّح المنشور')
    const res = await app.request(`/panel/posts/${ID}/correct`, { method: 'POST', headers: { Cookie: cookie }, body: form({ _csrf: csrf, how: 'reply', text: 'ت', key: crypto.randomUUID() }) }, env)
    expect(res.status).not.toBe(200)
    expect(db.raw.prepare('SELECT count(*) AS n FROM post_corrections').get()).toEqual({ n: 0 })
    expect(db.raw.prepare('SELECT count(*) AS n FROM audit_log WHERE action LIKE ?').get('post.correct_%')).toEqual({ n: 0 })
  })

  it('بلا رمز CSRF: 403 ولا شيء يُكتب', async () => {
    const { cookie } = await session()
    const res = await app.request(`/panel/posts/${ID}/correct`, { method: 'POST', headers: { Cookie: cookie }, body: form({ how: 'reply', text: 'ت', key: crypto.randomUUID() }) }, env)
    expect(res.status).toBe(403)
    expect(db.raw.prepare('SELECT count(*) AS n FROM post_corrections').get()).toEqual({ n: 0 })
  })

  it('«احذف وأعد النشر» يمضي إلى صفحة تأكيدٍ بتحذيرٍ مكتوب، وبلا تأكيدٍ لا يقع شيء', async () => {
    const { cookie, csrf } = await session()
    const key = crypto.randomUUID()
    const review = await app.request(`/panel/posts/${ID}/correct/review`, { method: 'POST', headers: { Cookie: cookie }, body: form({ _csrf: csrf, text: 'البديل', key }) }, env)
    const html = await review.text()
    expect(html).toContain('تضيع إعجاباتُها وردودُها')
    expect(html).toContain('يتغيّر الرابط')
    expect(html).toContain('name="confirm" value="yes"')
    const bare = await app.request(`/panel/posts/${ID}/correct`, { method: 'POST', headers: { Cookie: cookie }, body: form({ _csrf: csrf, how: 'replace', text: 'البديل', key }) }, env)
    expect(bare.status).toBe(303)
    expect(db.raw.prepare('SELECT count(*) AS n FROM cost_ledger').get()).toEqual({ n: 0 })
    expect((db.raw.prepare('SELECT platform_deleted_at FROM posts WHERE id = ?').get(ID) as { platform_deleted_at: string | null }).platform_deleted_at).toBeNull()
  })

  it('بعد التصحيح: البطاقةُ «صُحّح» وتربط بالتصحيح، والردُّ يربط بالأصل', async () => {
    db.raw.exec(`UPDATE posts SET corrected_at = datetime('now') WHERE id = '${ID}'`)
    db.raw.exec(`INSERT INTO posts (id, platform, type, text, status, idempotency_key, account_id, scheduled_at, approved_by, approved_at, corrects_post_id, correction_kind) VALUES
      ('0a1b2c3d-0009-4000-8000-000000000002', 'x', 'text', 'تصحيح', 'published', 'correct:reply:1', 'a1', datetime('now', '-1 hour'), 'owner', datetime('now', '-1 hour'), '${ID}', 'reply')`)
    const { cookie } = await session()
    const feed = await (await app.request('/panel/feed', { headers: { Cookie: cookie } }, env)).text()
    expect(feed).toContain('صُحّح')
    expect(feed).toContain('href="/panel/journey/0a1b2c3d-0009-4000-8000-000000000002">التصحيح</a>')
    expect(feed).toContain(`ردٌّ تصحيحيّ · <a class="tap" href="/panel/journey/${ID}">الأصل</a>`)
  })
})

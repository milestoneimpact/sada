/**
 * «اعتمد الخطّة وجدولها» من الشاشة (D-382): تأكيدٌ بلا سكربت يقول العدد والموعدين، ونموذجٌ خلف CSRF، وإشعارٌ بعده، وسجلٌّ.
 */
import { describe, expect, it } from 'vitest'
import { emailLogin, fakeMailer } from '../test/emailLogin'
import { toBase64 } from '../lib/crypto'
import { fakeDb, fakeKv } from '../test/fakes'
import { saveSource } from '../lib/package/sync'
import { app } from '../index'

const TEXT = 'لوحة مؤشرات خضراء بالكامل لا تعني أنّ المشروع بخير، فالمؤشّر يقيس ما اخترنا أن نقيسه.'

function setup() {
  const db = fakeDb()
  const env = {
    SADA_ENV: 'staging', PUBLIC_BASE_URL: 'https://sada2.basserh.com', DRIVE_FOLDER_ID: 'folder', DB: db, KV: fakeKv(),
    TOKEN_ENC_KEY: toBase64(new Uint8Array(32).fill(3)), ADMIN_TOKEN: 'Yk3pQ9vX2mLsA7nR4tWfZ8cB6dH1jG0e', EMAIL: fakeMailer(),
    GENERATE_QUEUE: { send: async () => undefined },
  }
  db.raw.exec(`INSERT INTO accounts (id, platform, kind, external_id, display_name, status) VALUES ('acc-x', 'x', 'member', 'e1', 'صدى', 'active')`)
  const due = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10)
  for (const [id, item, text] of [['p1', '03', TEXT], ['p2', '04', TEXT + ' ثانية'], ['p3', '05', '']] as const) {
    db.raw.prepare(`INSERT INTO posts (id, platform, type, text, status, idempotency_key, org_id, package_item_no, copy_origin, package_due)
      VALUES (?, 'x', 'text', ?, 'draft', ?, 'org_owner', ?, 'package', ?)`).run(id, text, 'pkg:' + id, item, due + ' 09:00')
  }
  return { db, env }
}

describe('اعتمد الخطّة وجدولها — الشاشة', () => {
  it('التأكيدُ قبل، والجدولةُ بعد، والضغطةُ الثانية لا تغيّر شيئًا', async () => {
    const { db, env } = setup()
    await saveSource(db, 'org_owner', { owner: 'o', repo: 'r', branch: 'b', root: '' })
    const cookie = ((await emailLogin(app, env)).headers.get('Set-Cookie') ?? '').split(';')[0]!
    const plan = await (await app.request('/panel/plan/package', { headers: { Cookie: cookie } }, env)).text()
    expect(plan).toContain('href="/panel/plan/package/schedule"')
    const confirm = await (await app.request('/panel/plan/package/schedule', { headers: { Cookie: cookie } }, env)).text()
    expect(confirm).toContain('نعم، اعتمد 2 وجدولها')
    expect(confirm).toContain('بلا نصّ: 1')
    expect(confirm).toContain('X 2')
    const csrf = /name="_csrf" value="([^"]+)"/.exec(confirm)![1]!

    const bare = await app.request('/panel/plan/package/schedule', { method: 'POST', body: new FormData(), headers: { Cookie: cookie } }, env)
    expect(bare.status).toBe(403)
    expect(db.raw.prepare("SELECT count(*) AS n FROM posts WHERE status = 'queued'").get()).toEqual({ n: 0 })

    const form = new FormData()
    form.set('_csrf', csrf)
    const res = await app.request('/panel/plan/package/schedule', { method: 'POST', body: form, headers: { Cookie: cookie } }, env)
    expect(res.status).toBe(303)
    expect(db.raw.prepare("SELECT count(*) AS n FROM posts WHERE status = 'queued' AND scheduled_at IS NOT NULL AND approved_at IS NOT NULL").get()).toEqual({ n: 2 })
    expect(db.raw.prepare("SELECT count(*) AS n FROM audit_log WHERE action = 'package.schedule'").get()).toEqual({ n: 1 })
    const again = await app.request('/panel/plan/package/schedule', { method: 'POST', body: form, headers: { Cookie: cookie } }, env)
    expect(again.status).toBe(303)
    expect(db.raw.prepare("SELECT count(*) AS n FROM posts WHERE status = 'queued'").get()).toEqual({ n: 2 })
  })
})

/**
 * رابطُ موافقة العميل (D-353) من طرفه إلى طرفه: المالكُ ينشئه، والعميلُ يفتحه بلا جلسة ويقول رأيه، والرأيُ على البطاقة وفي
 * الإشعارات — والرابطُ لا يفتح بعد إلغائه ولا لخطّةٍ أحدث، والقاعدةُ لا تحفظ رمزَه.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { emailLogin } from '../test/emailLogin'
import { toBase64 } from '../lib/crypto'
import { fakeDb, fakeKv, type FakeDb } from '../test/fakes'
import { createLink, findLink, hashToken } from '../lib/clientReview'
import { app } from '../index'

let db: FakeDb
let env: Record<string, unknown>

beforeEach(() => {
  db = fakeDb()
  env = {
    SADA_ENV: 'staging', PUBLIC_BASE_URL: 'https://sada2.basserh.com', DRIVE_FOLDER_ID: 'folder',
    DB: db, KV: fakeKv(), TOKEN_ENC_KEY: toBase64(crypto.getRandomValues(new Uint8Array(32))), ADMIN_TOKEN: 'Yk3pQ9vX2mLsA7nR4tWfZ8cB6dH1jG0e',
  }
  db.raw.exec(`INSERT INTO sources (id, drive_file_id, name, mime, content_hash) VALUES ('s1', 's1', 'تقرير', 'text/plain', 'md5:a')`)
  db.raw.exec(`INSERT INTO accounts (id, platform, kind, external_id, display_name, status) VALUES ('a1', 'linkedin', 'member', 'e1', 'عمر', 'active')`)
  const items = [{ sourceId: 's1', platform: 'linkedin', kind: 'text', angle: 'زاوية أولى', day: '2099-01-04', time: '07:00', why: 'ل' }]
  db.raw.prepare(`INSERT INTO plans (id, week_start, plan_json, model, status, span, choices_json) VALUES ('pl1', '2099-01-04', ?, 'm', 'approved', 'week', ?)`)
    .run(JSON.stringify({ rationale: 'ر', items }), JSON.stringify({ channels: ['linkedin'], autoImage: true }))
  db.raw.exec(`INSERT INTO posts (id, platform, type, text, status, idempotency_key, plan_id, source_id) VALUES
    ('p1', 'linkedin', 'text', 'نصُّ المنشور الأوّل كما كُتب ليراه العميل ويقول رأيه فيه قبل أن يُعتمَد ويُنشر.', 'draft', 'k1', 'pl1', 's1')`)
})

async function owner(): Promise<{ cookie: string; csrf: string }> {
  const cookie = ((await emailLogin(app, env)).headers.get('Set-Cookie') ?? '').split(';')[0]!
  const html = await (await app.request('/panel/plan/review', { headers: { Cookie: cookie } }, env)).text()
  return { cookie, csrf: /name="_csrf" value="([^"]+)"/.exec(html)?.[1] ?? '' }
}

const form = (fields: Record<string, string>): FormData => {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

describe('رابطُ موافقة العميل (D-353)', () => {
  it('المالكُ ينشئه ويُعرض مرّةً، والقاعدةُ تحفظ بصمتَه لا رمزَه', async () => {
    const s = await owner()
    const res = await app.request('/panel/plan/share', { method: 'POST', headers: { Cookie: s.cookie }, body: form({ _csrf: s.csrf, id: 'pl1' }) }, env)
    expect(res.status).toBe(303)
    const page = await (await app.request('/panel/plan/review', { headers: { Cookie: s.cookie } }, env)).text()
    const token = /\/r\/([A-Za-z0-9_-]{43})/.exec(page)?.[1] ?? ''
    expect(token).not.toBe('')
    const row = db.raw.prepare('SELECT token_hash FROM review_links').get() as { token_hash: string }
    expect(row.token_hash).toBe(await hashToken(token))
    expect(JSON.stringify(db.raw.prepare('SELECT * FROM review_links').all())).not.toContain(token)
  })

  it('العميلُ يرى المنشورَ بلا جلسة، ويقول رأيه، فيظهر على البطاقة وفي الإشعارات', async () => {
    const { token } = await createLink(db, 'org_owner', 'pl1', 'owner')
    const view = await app.request('/r/' + token, {}, env)
    expect(view.status).toBe(200)
    expect(view.headers.get('Referrer-Policy')).toBe('no-referrer')
    const html = await view.text()
    expect(html).toContain('نصُّ المنشور الأوّل')
    expect(html).not.toContain('_csrf')
    const key = /name="key" value="([^"]+)"/.exec(html)?.[1] ?? ''
    const said = await app.request('/r/' + token, { method: 'POST', body: form({ key, verdict: 'changes', note: 'غيّروا الافتتاحيّة', at: 'i0' }) }, env)
    expect(said.status).toBe(303)
    expect(said.headers.get('Location')).toBe('/r/' + token + '?saved=1#i0')
    expect(await (await app.request('/r/' + token + '?saved=1', {}, env)).text()).toContain('طلبتَ تعديله')

    const s = await owner()
    const review = await (await app.request('/panel/plan/review', { headers: { Cookie: s.cookie } }, env)).text()
    expect(review).toContain('العميل: يطلب تعديلًا')
    expect(review).toContain('غيّروا الافتتاحيّة')
    const notices = await (await app.request('/panel/notices', { headers: { Cookie: s.cookie } }, env)).text()
    expect(notices).toContain('يطلب العميل تعديل منشور')
  })

  it('رمزٌ خاطئ أو ملغى أو لخطّةٍ أحدث: جوابٌ واحد، ولا يُكتب رأي', async () => {
    expect((await app.request('/r/' + 'A'.repeat(43), {}, env)).status).toBe(404)
    expect((await app.request('/r/short', {}, env)).status).toBe(404)
    const { token } = await createLink(db, 'org_owner', 'pl1', 'owner')
    const s = await owner()
    await app.request('/panel/plan/share/revoke', { method: 'POST', headers: { Cookie: s.cookie }, body: form({ _csrf: s.csrf, id: 'pl1' }) }, env)
    expect(await findLink(db, token)).toBeNull()
    const res = await app.request('/r/' + token, { method: 'POST', body: form({ key: 'x', verdict: 'approve' }) }, env)
    expect(res.status).toBe(404)
    expect(db.raw.prepare('SELECT COUNT(*) AS n FROM review_verdicts').get()).toEqual({ n: 0 })

    const fresh = await createLink(db, 'org_owner', 'pl1', 'owner')
    db.raw.prepare(`INSERT INTO plans (id, week_start, plan_json, model, status, span, choices_json) VALUES ('pl2', '2099-02-01', '{"rationale":"ر","items":[]}', 'm', 'draft', 'week', '{}')`).run()
    expect((await app.request('/r/' + fresh.token, {}, env)).status).toBe(404)
  })

  it('بندٌ ليس في الخطّة أو قرارٌ غير معروف يُردّ', async () => {
    const { token } = await createLink(db, 'org_owner', 'pl1', 'owner')
    expect((await app.request('/r/' + token, { method: 'POST', body: form({ key: 'غريب', verdict: 'approve' }) }, env)).status).toBe(400)
    expect((await app.request('/r/' + token, { method: 'POST', body: form({ key: 'x', verdict: 'publish' }) }, env)).status).toBe(400)
  })
})

/**
 * **التيّار** (D-386): العرضُ بكلّ حال، وترتيبُ القسمين، والمنطقةُ (06:00Z تُقرأ 9:00 ص بالرياض)، والاعتمادُ من البطاقة يعود
 * إليها بإشعاره والبطاقةُ مجدولة، والقارئُ يرى بلا أزرار، و«اعتمد كلّ ما ينتظر» يمضي بالخطّة ويعود.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { emailLogin } from '../test/emailLogin'
import { toBase64 } from '../lib/crypto'
import { fakeDb, fakeKv, type FakeDb } from '../test/fakes'
import { app } from '../index'

let db: FakeDb
let env: Record<string, unknown>

const TEXT = 'نصُّ منشورٍ فيه ما يكفي من الكلام ليكون منشورًا حقيقيًّا يقرؤه الناس ويعتمده المالك قبل أن يُنشر.'

beforeEach(() => {
  db = fakeDb()
  env = {
    SADA_ENV: 'staging', PUBLIC_BASE_URL: 'https://sada2.basserh.com', DRIVE_FOLDER_ID: 'folder',
    DB: db, KV: fakeKv(), TOKEN_ENC_KEY: toBase64(crypto.getRandomValues(new Uint8Array(32))), ADMIN_TOKEN: 'Yk3pQ9vX2mLsA7nR4tWfZ8cB6dH1jG0e',
  }
  db.raw.exec(`INSERT INTO sources (id, drive_file_id, name, mime, content_hash) VALUES ('s1', 's1', 'تقرير', 'text/plain', 'md5:a'), ('s2', 's2', 'مراجعة', 'text/plain', 'md5:b'), ('s3', 's3', 'عرض', 'text/plain', 'md5:c')`)
  db.raw.exec(`INSERT INTO accounts (id, platform, kind, external_id, display_name, status) VALUES ('a1', 'linkedin', 'member', 'e1', 'عمر', 'active')`)
  const items = [
    { id: 'i1', sourceId: 's1', platform: 'linkedin', kind: 'text', angle: 'زاوية أولى', day: '2099-01-04', time: '09:00', why: 'ل' },
    { id: 'i2', sourceId: 's2', platform: 'linkedin', kind: 'text', angle: 'زاوية ثانية', day: '2099-01-05', time: '09:00', why: 'ل' },
    { id: 'i3', sourceId: 's3', platform: 'linkedin', kind: 'text', angle: 'بندٌ لم يُكتب بعد', day: '2099-01-06', time: '09:00', why: 'ل' },
  ]
  db.raw.prepare(`INSERT INTO plans (id, week_start, plan_json, model, status, span, choices_json) VALUES ('pl1', '2099-01-04', ?, 'm', 'approved', 'week', ?)`)
    .run(JSON.stringify({ rationale: 'ر', items }), JSON.stringify({ channels: ['linkedin'], autoImage: false }))
  // ‏مسوّدةٌ من الخطّة تنتظر، ومجدولٌ في 06:00Z، ومنشورٌ، وفاشل
  db.raw.exec(`INSERT INTO posts (id, platform, type, text, status, idempotency_key, plan_id, source_id, source_refs, account_id, scheduled_at, approved_by, approved_at, created_at) VALUES
    ('0a1b2c3d-0001-4000-8000-000000000001', 'linkedin', 'text', '${TEXT} الأوّل', 'draft', 'k1', 'pl1', 's1', '["item:i1"]', 'a1', NULL, NULL, NULL, '2026-01-01 10:00:00'),
    ('p2', 'linkedin', 'text', '${TEXT} الثاني', 'queued', 'k2', 'pl1', 's2', '["item:i2"]', 'a1', '2099-01-05 06:00:00', 'owner', datetime('now'), '2026-01-01 11:00:00'),
    ('p3', 'linkedin', 'text', '${TEXT} المنشور', 'published', 'k3', NULL, NULL, '[]', 'a1', datetime('now', '-3 days'), 'owner', datetime('now'), '2026-01-01 12:00:00'),
    ('p4', 'x', 'text', '${TEXT} الفاشل', 'failed', 'k4', NULL, NULL, '[]', 'a1', datetime('now', '-1 day'), 'owner', datetime('now'), '2026-01-01 13:00:00')`)
})

async function session(email?: string): Promise<{ cookie: string; csrf: string }> {
  const cookie = ((await emailLogin(app, env, email === undefined ? {} : { email })).headers.get('Set-Cookie') ?? '').split(';')[0]!
  const html = await (await app.request('/panel/feed', { headers: { Cookie: cookie } }, env)).text()
  return { cookie, csrf: /name="_csrf" value="([^"]+)"/.exec(html)?.[1] ?? '' }
}

const form = (fields: Record<string, string>): FormData => {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

describe('التيّار (D-386)', () => {
  it('بطاقةٌ لكلّ حال، و«ما سيُنشر» قبل «الآن» قبل «ما نُشر»، والمجدولُ 06:00Z يُقرأ 9:00 ص بالرياض', async () => {
    const { cookie } = await session()
    const res = await app.request('/panel/feed', { headers: { Cookie: cookie } }, env)
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('<h1>التيّار</h1>')
    expect(html).toContain('ينتظر اعتمادك')
    // ‏الحالاتُ من مصدرها الواحد (D-340)، والبندُ الذي لم يُكتب «يُكتب الآن»
    for (const s of ['تنتظر قرارك', 'مجدولة', 'نُشرت', 'فشل النشر', 'يُكتب الآن', 'بندٌ لم يُكتب بعد']) expect(html).toContain(s)
    // ‏ترتيبُ القسمين وخطُّ الآن بينهما
    const up = html.indexOf('id="fd-up"')
    const now = html.indexOf('class="fd-now"')
    const past = html.indexOf('id="fd-past"')
    expect(up).toBeGreaterThan(0)
    expect(now).toBeGreaterThan(up)
    expect(past).toBeGreaterThan(now)
    // ‏المنشورُ في قسمه: المجدولُ والفاشلُ والمسوّدةُ قبل «الآن»، والمنشورُ بعده
    for (const id of ['f-0a1b2c3d-0001-4000-8000-000000000001', 'f-p2', 'f-p4']) expect(html.indexOf(`id="${id}"`)).toBeLessThan(now)
    expect(html.indexOf('id="f-p3"')).toBeGreaterThan(now)
    // ‏والمنطقة: 2099-01-05 06:00Z هو الاثنين 5 يناير 9:00 ص بالرياض (المنطقةُ الاحتياطيّة، D-201)
    expect(html).toContain('الاثنين 5 يناير 2099 · 9:00 ص')
    // ‏وما لا موعدَ له (ينتظر قرارك) قبل المجدول
    expect(html.indexOf('id="f-0a1b2c3d-0001-4000-8000-000000000001"')).toBeLessThan(html.indexOf('id="f-p2"'))
    // ‏والفعلُ بالحال: «اعتمد» من مسار المراجعة لمسوّدة الخطّة، و«افتح» للمجدول، و«أعد المحاولة» للفاشل، و«النتائج» للمنشور
    expect(html).toContain('action="/panel/plan/review/approve"')
    expect(html).toContain('href="/panel/plan/post/p2"')
    expect(html).toContain('action="/panel/drafts/requeue"')
    expect(html).toContain('href="/panel/journey/p3">النتائج</a>')
    // ‏وزرٌّ أوّليٌّ واحد في الرأس: كلُّ ما ينتظر من الخطّة فاعتمادُها
    expect(html).toContain('action="/panel/plan/approve-all"')
    expect(html).toContain('اعتمد كلّ ما ينتظر (1)')
    // ‏والرافدةُ تعلّم التيّار
    expect(html).toContain('href="/panel/feed" aria-current="page"')
  })

  it('«اعتمد» على بطاقةٍ تنتظر يجدولها في موعد بندها ويعود إلى بطاقتها في التيّار بإشعاره — فتصير مجدولة', async () => {
    const { cookie, csrf } = await session()
    const res = await app.request('/panel/plan/review/approve', { method: 'POST', body: form({ _csrf: csrf, id: 'pl1', post: '0a1b2c3d-0001-4000-8000-000000000001', back: 'feed' }), headers: { Cookie: cookie } }, env)
    expect(res.status).toBe(303)
    expect(res.headers.get('Location')).toBe('/panel/feed#f-0a1b2c3d-0001-4000-8000-000000000001')
    // ‏09:00 بالرياض تُخزَّن 06:00Z (D-384)
    expect(db.raw.prepare("SELECT status, scheduled_at FROM posts WHERE id = '0a1b2c3d-0001-4000-8000-000000000001'").get()).toEqual({ status: 'queued', scheduled_at: '2099-01-04 06:00:00' })
    const html = await (await app.request('/panel/feed', { headers: { Cookie: cookie } }, env)).text()
    const card = html.slice(html.indexOf('id="f-0a1b2c3d-0001-4000-8000-000000000001"'), html.indexOf('id="f-p2"'))
    expect(card).toContain('مجدولة')
    expect(card).not.toContain('تنتظر قرارك')
    expect(html).toContain('اعتُمدت وجُدولت في موعدها')
    // ‏ولا شيءَ ينتظر، فلا زرَّ في الرأس
    expect(html).not.toContain('action="/panel/plan/approve-all"')
  })

  it('«اعتمد كلّ ما ينتظر» من التيّار يعود إليه، و«اعتمد المحدّد» حين يخالط مسوّداتِ الخطّة غيرُها', async () => {
    db.raw.exec(`INSERT INTO posts (id, platform, type, text, status, idempotency_key, account_id, created_at) VALUES ('0a1b2c3d-0005-4000-8000-000000000005', 'linkedin', 'text', '${TEXT} بنفسي', 'draft', 'k5', 'a1', '2026-01-02 10:00:00')`)
    const { cookie, csrf } = await session()
    const html = await (await app.request('/panel/feed', { headers: { Cookie: cookie } }, env)).text()
    expect(html).toContain('action="/panel/drafts/approve-many"')
    expect(html).toContain('اعتمد كلّ ما ينتظر (2)')
    // ‏ومسوّدةٌ من خارج الخطّة تُعتمَد بقرار المسوّدات وتعود إلى بطاقتها
    const one = await app.request('/panel/drafts/decide', { method: 'POST', body: form({ _csrf: csrf, id: '0a1b2c3d-0005-4000-8000-000000000005', do: 'approve', back: 'feed' }), headers: { Cookie: cookie } }, env)
    expect(one.headers.get('Location')).toBe('/panel/feed#f-0a1b2c3d-0005-4000-8000-000000000005')
    expect(db.raw.prepare("SELECT status FROM posts WHERE id = '0a1b2c3d-0005-4000-8000-000000000005'").get()).toEqual({ status: 'approved' })
    const f = form({ _csrf: csrf, id: '0a1b2c3d-0001-4000-8000-000000000001', back: 'feed' })
    const all = await app.request('/panel/drafts/approve-many', { method: 'POST', body: f, headers: { Cookie: cookie } }, env)
    expect(all.headers.get('Location')).toBe('/panel/feed#feed')
    const res = await app.request('/panel/plan/approve-all', { method: 'POST', body: form({ _csrf: csrf, id: 'pl1', back: 'feed' }), headers: { Cookie: cookie } }, env)
    expect(res.headers.get('Location')).toBe('/panel/feed')
  })

  it('القارئُ يرى التيّار بلا زرّ اعتماد، ومن لا جلسةَ له يُردّ إلى الدخول', async () => {
    db.raw.prepare("INSERT INTO members (email, role, orgs, invited_by) VALUES ('v@example.com', 'viewer', '*', 'owner')").run()
    const { cookie } = await session('v@example.com')
    const html = await (await app.request('/panel/feed', { headers: { Cookie: cookie } }, env)).text()
    expect(html).toContain('<h1>التيّار</h1>')
    expect(html).not.toContain('action="/panel/plan/review/approve"')
    expect(html).not.toContain('action="/panel/plan/approve-all"')
    expect(html).not.toContain('action="/panel/drafts/requeue"')
    expect(html).not.toContain('اعتمد كلّ ما ينتظر')
    expect(html).toContain('href="/panel/plan/post/0a1b2c3d-0001-4000-8000-000000000001">افتح</a>')
    expect((await app.request('/panel/feed', {}, env)).status).toBe(401)
  })

  it('«ما نُشر» ستّون يومًا، و?before يفتح ما قبلها، والعنوانُ الفاسدُ يُهمَل', async () => {
    db.raw.exec(`INSERT INTO posts (id, platform, type, text, status, idempotency_key, account_id, scheduled_at, approved_by, approved_at, created_at) VALUES
      ('p9', 'x', 'text', '${TEXT} القديم', 'published', 'k9', 'a1', datetime('now', '-100 days'), 'owner', datetime('now'), '2025-01-01 10:00:00')`)
    const { cookie } = await session()
    const html = await (await app.request('/panel/feed', { headers: { Cookie: cookie } }, env)).text()
    expect(html).toContain('id="f-p3"')
    expect(html).not.toContain('id="f-p9"')
    const older = /href="\/panel\/feed\?before=(\d{4}-\d{2}-\d{2})">أقدم<\/a>/.exec(html)
    expect(older).not.toBeNull()
    const prev = await (await app.request('/panel/feed?before=' + older![1]!, { headers: { Cookie: cookie } }, env)).text()
    expect(prev).toContain('id="f-p9"')
    expect(prev).not.toContain('id="f-p3"')
    expect((await app.request('/panel/feed?before=x', { headers: { Cookie: cookie } }, env)).status).toBe(200)
  })
})

/**
 * **«منشورات جديدة»** (D-387): المختارُ ثلاثُ بطاقاتٍ إلى الطرق الثلاثة القائمة، وللمحرّر فأعلى (القارئُ يُردّ إلى التيّار)؛
 * والاعتمادُ من المراجعة يهبط في التيّار؛ و«اعتمد فقط» غائبٌ عن المراجعة والتيّار والرئيسيّة؛ والتيّارُ في شريط الهاتف.
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
  db.raw.exec(`INSERT INTO sources (id, drive_file_id, name, mime, content_hash) VALUES ('s1', 's1', 'تقرير', 'text/plain', 'md5:a')`)
  db.raw.exec(`INSERT INTO accounts (id, platform, kind, external_id, display_name, status) VALUES ('a1', 'linkedin', 'member', 'e1', 'عمر', 'active')`)
  const items = [{ id: 'i1', sourceId: 's1', platform: 'linkedin', kind: 'text', angle: 'زاوية أولى', day: '2099-01-04', time: '09:00', why: 'ل' }]
  db.raw.prepare(`INSERT INTO plans (id, week_start, plan_json, model, status, span, choices_json) VALUES ('pl1', '2099-01-04', ?, 'm', 'approved', 'week', ?)`)
    .run(JSON.stringify({ rationale: 'ر', items }), JSON.stringify({ channels: ['linkedin'], autoImage: false }))
  db.raw.exec(`INSERT INTO posts (id, platform, type, text, status, idempotency_key, plan_id, source_id, source_refs, account_id, created_at) VALUES
    ('0a1b2c3d-0001-4000-8000-000000000001', 'linkedin', 'text', '${TEXT} الأوّل', 'draft', 'k1', 'pl1', 's1', '["item:i1"]', 'a1', '2026-01-01 10:00:00'),
    ('0a1b2c3d-0002-4000-8000-000000000002', 'linkedin', 'text', '${TEXT} بنفسي', 'draft', 'k2', NULL, NULL, '[]', 'a1', '2026-01-02 10:00:00')`)
})

async function session(email?: string): Promise<{ cookie: string; csrf: string }> {
  const cookie = ((await emailLogin(app, env, email === undefined ? {} : { email })).headers.get('Set-Cookie') ?? '').split(';')[0]!
  const html = await (await app.request('/panel/plan/review', { headers: { Cookie: cookie } }, env)).text()
  return { cookie, csrf: /name="_csrf" value="([^"]+)"/.exec(html)?.[1] ?? '' }
}

const form = (fields: Record<string, string>): FormData => {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

describe('«منشورات جديدة» (D-387)', () => {
  it('المختارُ ثلاثُ بطاقاتٍ إلى المعالج والملفّ والحزمة، بزرٍّ واحدٍ في كلٍّ وسطرِ كلفة', async () => {
    const { cookie } = await session()
    const res = await app.request('/panel/new', { headers: { Cookie: cookie } }, env)
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('<h1>منشورات جديدة</h1>')
    expect(html.match(/class="card nw-way"/g)).toHaveLength(3)
    for (const t of ['يكتبها المساعد', 'من ملفّ', 'من GitHub']) expect(html).toContain('<h2 class="nw-t">' + t + '</h2>')
    // ‏وتحت زرّ «من GitHub» رابطا الضبط (D-388): الاستيراداتُ وقواعدُ الجدولة — وهما في الإعدادات «المصادر والقواعد»
    const github = html.slice(html.indexOf('id="nw-github"'), html.indexOf('</li>', html.indexOf('id="nw-github"')))
    expect(github).toContain('href="/panel/plan/imports">الاستيرادات</a>')
    expect(github).toContain('href="/panel/plan-rules">قواعد الجدولة</a>')
    expect(html.slice(0, html.indexOf('id="nw-github"'))).not.toContain('/panel/plan-rules')
    expect(html).toContain('href="/panel/plan/new"')
    expect(html).toContain('href="/panel/plan/import"')
    expect(html).toContain('href="/panel/package"')
    expect(html.match(/class="nw-cost m-0"/g)).toHaveLength(3)
    // ‏وزرٌّ أوّليٌّ رابعٌ هو «منشور جديد» في رأس الصفحة (D-419)، والبطاقاتُ ثلاثٌ في المحتوى
    expect(html.slice(html.indexOf('</header>')).match(/btn btn-primary/g)).toHaveLength(3)
    expect((await app.request('/panel/new', {}, env)).status).toBe(401)
  })

  it('القارئُ لا يفتح المختار: يُردّ إلى التيّار بسببه، ولا بابَ «منشورات جديدة» في رأسه', async () => {
    db.raw.prepare("INSERT INTO members (email, role, orgs, invited_by) VALUES ('v@example.com', 'viewer', '*', 'owner')").run()
    const { cookie } = await session('v@example.com')
    const res = await app.request('/panel/new', { headers: { Cookie: cookie } }, env)
    expect(res.status).toBe(303)
    expect(res.headers.get('Location')).toBe('/panel/feed')
    const feed = await (await app.request('/panel/feed', { headers: { Cookie: cookie } }, env)).text()
    expect(feed).toContain('للمحرّر فأعلى')
    // ‏(لوحةُ الأوامر تحمل الرابطَ نصًّا لكلّ دور؛ الزرُّ وحدَه يُخفى)
    expect(feed).not.toMatch(/class="btn btn-(?:primary|secondary)[^"]*" href="\/panel\/new"/)
  })

  it('الاعتمادُ من المراجعة يهبط في التيّار: البطاقةُ إلى بطاقتها، والجملةُ إلى رأسه — والتأخيرُ يبقى في الورشة', async () => {
    const { cookie, csrf } = await session()
    const review = await (await app.request('/panel/plan/review', { headers: { Cookie: cookie } }, env)).text()
    // ‏نماذجُ المراجعة تحمل back=feed سلفًا، وزرُّ الذيل واحد «اعتمد الأسبوع»
    expect(review).toContain('action="/panel/plan/review/approve"')
    expect(review.match(/name="back" value="feed"/g)!.length).toBeGreaterThanOrEqual(3)
    expect(review).toContain('اعتمد الأسبوع (1)')
    expect(review).toContain('>اعتمد المحدّد</button>')
    expect(review).not.toContain('اعتمد الخطّة كاملة')
    expect(review).not.toContain('اعتمد فقط')
    const key = /name="sel" form="rv-bulk" value="0\|([^|"]+)\|/.exec(review)?.[1] ?? ''
    const one = await app.request('/panel/plan/review/approve', { method: 'POST', body: form({ _csrf: csrf, id: 'pl1', index: '0', key, post: '0a1b2c3d-0001-4000-8000-000000000001', back: 'feed' }), headers: { Cookie: cookie } }, env)
    expect(one.headers.get('Location')).toBe('/panel/feed#f-0a1b2c3d-0001-4000-8000-000000000001')
    expect(db.raw.prepare("SELECT status FROM posts WHERE id = '0a1b2c3d-0001-4000-8000-000000000001'").get()).toEqual({ status: 'queued' })
    const bulk = form({ _csrf: csrf, id: 'pl1', do: 'approve', back: 'feed' })
    bulk.append('sel', `0|${key}|0a1b2c3d-0001-4000-8000-000000000001`)
    const all = await app.request('/panel/plan/review/bulk', { method: 'POST', body: bulk, headers: { Cookie: cookie } }, env)
    expect(all.headers.get('Location')).toBe('/panel/feed')
    // ‏وما كان مبتوتًا من قبل يُعدّ بجملة D-384 ولا يُقال «تعذّر»
    const feed = await (await app.request('/panel/feed', { headers: { Cookie: cookie } }, env)).text()
    expect(feed).toContain('اعتُمد 0 · 1 مجدولة من قبل فتُركت.')
    const delay = form({ _csrf: csrf, id: 'pl1', do: 'delay', back: 'feed' })
    delay.append('sel', `0|${key}|0a1b2c3d-0001-4000-8000-000000000001`)
    const later = await app.request('/panel/plan/review/bulk', { method: 'POST', body: delay, headers: { Cookie: cookie } }, env)
    expect(later.headers.get('Location')).toMatch(/^\/panel\/plan\/review/)
  })

  it('«اعتمد» من الرئيسيّة يهبط في التيّار، و«اعتمد فقط» غائبٌ عن الرئيسيّة والتيّار، والتيّارُ في شريط الهاتف', async () => {
    const { cookie, csrf } = await session()
    const home = await (await app.request('/panel', { headers: { Cookie: cookie } }, env)).text()
    expect(home).not.toContain('اعتمد فقط')
    expect(home).toMatch(/name="id" value="0a1b2c3d-0002-4000-8000-000000000002"><input type="hidden" name="back" value="feed">/)
    expect(home).toMatch(/<a href="\/panel\/feed" data-bar aria-label="[^"]*التيّار/)
    expect(home).not.toMatch(/<a href="#posts" data-bar/)
    const res = await app.request('/panel/drafts/decide', { method: 'POST', body: form({ _csrf: csrf, id: '0a1b2c3d-0002-4000-8000-000000000002', do: 'approve', back: 'feed' }), headers: { Cookie: cookie } }, env)
    expect(res.headers.get('Location')).toBe('/panel/feed#f-0a1b2c3d-0002-4000-8000-000000000002')
    const feed = await (await app.request('/panel/feed', { headers: { Cookie: cookie } }, env)).text()
    expect(feed).not.toContain('اعتمد فقط')
    expect(feed).toContain('<h1>التيّار</h1>')
  })
})

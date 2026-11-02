/** مراجعةُ الخطّة وتثبيتُها بإصدار (D-286): البطاقة، و«ما ينقص»، والأفعالُ الأربعة، والجملة، والتثبيت، والإصدارُ بعد التعديل. */
import { beforeEach, describe, expect, it } from 'vitest'
import { emailLogin } from '../test/emailLogin'
import { toBase64 } from '../lib/crypto'
import { fakeDb, fakeKv, type FakeDb } from '../test/fakes'
import { app } from '../index'

let db: FakeDb
let env: Record<string, unknown>

beforeEach(() => {
  db = fakeDb()
  env = {
    SADA_ENV: 'staging', PUBLIC_BASE_URL: 'https://sada2.basserh.com', DRIVE_FOLDER_ID: 'folder',
    DB: db, KV: fakeKv(), TOKEN_ENC_KEY: toBase64(crypto.getRandomValues(new Uint8Array(32))), ADMIN_TOKEN: 'Yk3pQ9vX2mLsA7nR4tWfZ8cB6dH1jG0e',
  }
  db.raw.exec(`INSERT INTO sources (id, drive_file_id, name, mime, content_hash) VALUES ('s1', 's1', 'تقرير', 'text/plain', 'md5:a'), ('s2', 's2', 'مراجعة', 'text/plain', 'md5:b')`)
  db.raw.exec(`INSERT INTO accounts (id, platform, kind, external_id, display_name, status) VALUES ('a1', 'linkedin', 'member', 'e1', 'عمر', 'active')`)
  const items = [
    { sourceId: 's1', platform: 'linkedin', kind: 'text', angle: 'زاوية أولى', day: '2099-01-04', time: '07:00', why: 'ل' },
    { sourceId: 's2', platform: 'linkedin', kind: 'text', angle: 'زاوية ثانية', day: '2099-01-04', time: '07:00', why: 'ل' },
    { sourceId: 's2', platform: 'x', kind: 'text', angle: 'زاوية ثالثة', day: '2099-01-06', time: '09:00', why: 'ل' },
  ]
  db.raw.prepare(`INSERT INTO plans (id, week_start, plan_json, model, status, span, choices_json) VALUES ('pl1', '2099-01-04', ?, 'm', 'approved', 'week', ?)`)
    .run(JSON.stringify({ rationale: 'ر', items }), JSON.stringify({ channels: ['linkedin', 'x'], autoImage: true }))
  db.raw.exec(`INSERT INTO posts (id, platform, type, text, status, idempotency_key, plan_id, source_id, approved_by, approved_at) VALUES
    ('p1', 'linkedin', 'text', 'نصُّ المنشور الأوّل كما كُتب ليُعتمَد، وفيه ما يكفي من الكلام ليكون منشورًا حقيقيًّا يقرؤه الناس ويعتمده المالك.', 'draft', 'k1', 'pl1', 's1', NULL, NULL),
    ('p2', 'linkedin', 'text', 'نصُّ المنشور الثاني كما كُتب ليُعتمَد، وفيه ما يكفي من الكلام ليكون منشورًا حقيقيًّا يقرؤه الناس ويعتمده المالك.', 'approved', 'k2', 'pl1', 's2', 'owner', datetime('now'))`)
})

async function session(): Promise<{ cookie: string; csrf: string }> {
  const cookie = ((await emailLogin(app, env)).headers.get('Set-Cookie') ?? '').split(';')[0]!
  const html = await (await app.request('/panel/plan/review', { headers: { Cookie: cookie } }, env)).text()
  return { cookie, csrf: /name="_csrf" value="([^"]+)"/.exec(html)?.[1] ?? '' }
}

const keyOf = (html: string, index: number): string => new RegExp(`name="index" value="${index}"><input type="hidden" name="key" value="([^"]+)"`).exec(html)?.[1] ?? ''
const form = (fields: Record<string, string>): FormData => {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

describe('مراجعةُ الخطّة (D-286)', () => {
  it('البطاقةُ بندٌ ومسوّدتُه، و«ما ينقص» يعدّ ما يمنع التثبيت ويربط بأوّل بطاقة', async () => {
    const { cookie } = await session()
    const html = await (await app.request('/panel/plan/review', { headers: { Cookie: cookie } }, env)).text()
    expect(html).toContain('نصُّ المنشور الأوّل')
    expect(html).toContain('مسوّدة · الإصدار ١')
    // ‏بندٌ لم يُكتب، وواحدٌ ينتظر، واثنان بلا صورة، وموعدان مكرَّران لـ LinkedIn
    for (const s of ['١ لم تُكتب بعد', '١ تنتظر اعتمادك', '٢ بلا صورة', '٢ موعدٌ مكرَّر']) expect(html).toContain(s)
    expect(html).toContain('href="#c-2">١ لم تُكتب بعد')
    expect(html).toContain('action="/panel/plan/pin"')
  })

  it('اعتمد · أخّر · احذف — والبصمةُ تردّ فعلًا من صفحةٍ قديمة', async () => {
    const { cookie, csrf } = await session()
    const html = await (await app.request('/panel/plan/review', { headers: { Cookie: cookie } }, env)).text()
    await app.request('/panel/plan/review/approve', { method: 'POST', body: form({ _csrf: csrf, id: 'pl1', index: '0', key: keyOf(html, 0), post: 'p1' }), headers: { Cookie: cookie } }, env)
    expect(db.raw.prepare("SELECT status FROM posts WHERE id = 'p1'").get()).toEqual({ status: 'approved' })
    await app.request('/panel/plan/review/delay', { method: 'POST', body: form({ _csrf: csrf, id: 'pl1', index: '2', key: keyOf(html, 2), days: '1' }), headers: { Cookie: cookie } }, env)
    const plan = JSON.parse((db.raw.prepare("SELECT plan_json FROM plans WHERE id = 'pl1'").get() as { plan_json: string }).plan_json) as { items: { day: string }[] }
    expect(plan.items[2]!.day).toBe('2099-01-07')
    // ‏بصمةُ البند ٢ تغيّرت بالتأخير: الحذفُ ببصمته القديمة يُردّ ولا يُصيب شيئًا
    await app.request('/panel/plan/review/drop', { method: 'POST', body: form({ _csrf: csrf, id: 'pl1', index: '2', key: keyOf(html, 2) }), headers: { Cookie: cookie } }, env)
    expect((JSON.parse((db.raw.prepare("SELECT plan_json FROM plans WHERE id = 'pl1'").get() as { plan_json: string }).plan_json) as { items: unknown[] }).items).toHaveLength(3)
    // ‏والتأخيرُ أسبوعًا يُخرجه من المدى فيُردّ
    const fresh = await (await app.request('/panel/plan/review', { headers: { Cookie: cookie } }, env)).text()
    await app.request('/panel/plan/review/delay', { method: 'POST', body: form({ _csrf: csrf, id: 'pl1', index: '2', key: keyOf(fresh, 2), days: '7' }), headers: { Cookie: cookie } }, env)
    expect((JSON.parse((db.raw.prepare("SELECT plan_json FROM plans WHERE id = 'pl1'").get() as { plan_json: string }).plan_json) as { items: { day: string }[] }).items[2]!.day).toBe('2099-01-07')
    // ‏والحذفُ ببصمته الصحيحة: البندُ يخرج ومسوّدةُ البند الأوّل لا تُمسّ
    await app.request('/panel/plan/review/drop', { method: 'POST', body: form({ _csrf: csrf, id: 'pl1', index: '2', key: keyOf(fresh, 2) }), headers: { Cookie: cookie } }, env)
    expect((JSON.parse((db.raw.prepare("SELECT plan_json FROM plans WHERE id = 'pl1'").get() as { plan_json: string }).plan_json) as { items: unknown[] }).items).toHaveLength(2)
  })

  it('ثبّت: صورةُ الإصدار ١ تُحفظ ويُجدوَل المعتمَد، وأوّلُ تعديلٍ بعده يفتح الإصدار ٢ والأوّلُ باقٍ', async () => {
    const { cookie, csrf } = await session()
    const pinRes = await app.request('/panel/plan/pin', { method: 'POST', body: form({ _csrf: csrf, id: 'pl1' }), headers: { Cookie: cookie } }, env)
    expect(pinRes.status).toBe(303)
    expect(db.raw.prepare("SELECT status FROM posts WHERE id = 'p2'").get()).toEqual({ status: 'queued' })
    expect(db.raw.prepare("SELECT status FROM posts WHERE id = 'p1'").get()).toEqual({ status: 'draft' })
    expect(db.raw.prepare('SELECT version, scheduled FROM plan_versions').all()).toEqual([{ version: 1, scheduled: 1 }])
    const pinned = await (await app.request('/panel/plan/review', { headers: { Cookie: cookie } }, env)).text()
    expect(pinned).toContain('مثبَّتة · الإصدار ١')
    // ‏تأخيرُ بندٍ مجدول: يفتح الإصدار ٢، ويتحرّك موعدُ منشوره، والإصدارُ ١ في السجلّ كما ثُبّت
    await app.request('/panel/plan/review/delay', { method: 'POST', body: form({ _csrf: csrf, id: 'pl1', index: '1', key: keyOf(pinned, 1), days: '1' }), headers: { Cookie: cookie } }, env)
    expect(db.raw.prepare("SELECT version, locked_at FROM plans WHERE id = 'pl1'").get()).toEqual({ version: 2, locked_at: null })
    expect((db.raw.prepare("SELECT scheduled_at FROM posts WHERE id = 'p2'").get() as { scheduled_at: string }).scheduled_at.slice(0, 10)).toBe('2099-01-05')
    const v1 = JSON.parse((db.raw.prepare('SELECT plan_json FROM plan_versions WHERE version = 1').get() as { plan_json: string }).plan_json) as { items: { day: string }[] }
    expect(v1.items[1]!.day).toBe('2099-01-04')
    const after = await (await app.request('/panel/plan/review', { headers: { Cookie: cookie } }, env)).text()
    expect(after).toContain('عُدّلت بعد التثبيت · الإصدار ٢ غير مثبَّت')
    expect(after).toContain('الإصدار ١ — ثُبّت')
    // ‏ومنشورٌ مجدولٌ لا يُحذف من المراجعة
    await app.request('/panel/plan/review/drop', { method: 'POST', body: form({ _csrf: csrf, id: 'pl1', index: '1', key: keyOf(after, 1) }), headers: { Cookie: cookie } }, env)
    expect(db.raw.prepare("SELECT status FROM posts WHERE id = 'p2'").get()).toEqual({ status: 'queued' })
  })

  it('الجملة: اعتمادُ المحدَّد، والحذفُ من الآخر إلى الأوّل فلا يتبدّل فهرسٌ', async () => {
    const { cookie, csrf } = await session()
    const html = await (await app.request('/panel/plan/review', { headers: { Cookie: cookie } }, env)).text()
    const sel = (i: number, post: string) => `${i}|${keyOf(html, i)}|${post}`
    const approve = form({ _csrf: csrf, id: 'pl1', do: 'approve' })
    approve.append('sel', sel(0, 'p1'))
    await app.request('/panel/plan/review/bulk', { method: 'POST', body: approve, headers: { Cookie: cookie } }, env)
    expect(db.raw.prepare("SELECT status FROM posts WHERE id = 'p1'").get()).toEqual({ status: 'approved' })
    const drop = form({ _csrf: csrf, id: 'pl1', do: 'drop' })
    drop.append('sel', sel(0, 'p1')); drop.append('sel', sel(2, ''))
    await app.request('/panel/plan/review/bulk', { method: 'POST', body: drop, headers: { Cookie: cookie } }, env)
    const left = JSON.parse((db.raw.prepare("SELECT plan_json FROM plans WHERE id = 'pl1'").get() as { plan_json: string }).plan_json) as { items: { angle: string }[] }
    expect(left.items.map((i) => i.angle)).toEqual(['زاوية ثانية'])
    expect(db.raw.prepare("SELECT status FROM posts WHERE id = 'p1'").get()).toEqual({ status: 'rejected' })
  })

  it('بلا خطّةٍ يُرسَل إلى «خطّة جديدة»، والمعالجُ يطلب المراجعةَ بعد البناء', async () => {
    db.raw.exec("UPDATE plans SET status = 'superseded'")
    const { cookie } = await session()
    const res = await app.request('/panel/plan/review', { headers: { Cookie: cookie } }, env)
    expect(res.headers.get('Location')).toBe('/panel/plan/new')
    const wizard = await (await app.request('/panel/plan/new', { headers: { Cookie: cookie } }, env)).text()
    expect(wizard).toContain('name="then" value="review"')
  })
})

describe('«عندي خطّة» (D-287)', () => {
  it('CSV يُسكَّن ويُفتح في المراجعة بلا جدولة، ونصٌّ بلا مزوّدٍ يُردّ بسببه', async () => {
    db.raw.exec("UPDATE plans SET status = 'superseded'")
    const { cookie } = await session()
    const screen = await (await app.request('/panel/plan/import', { headers: { Cookie: cookie } }, env)).text()
    const csrf = /name="_csrf" value="([^"]+)"/.exec(screen)?.[1] ?? ''
    expect(screen).toContain('action="/panel/plan/import" enctype="multipart/form-data"')
    expect(screen).toContain('name="pasted"')
    const csv = 'التاريخ,الوقت,المنصة,النص\n2099-02-01,09:00,LinkedIn,قيادةُ القيمة لا تُقاس بالمخرجات بل بالمعالم: ثلاثةُ أرقامٍ من تقرير الأثر.\n2099-02-03,,X,سؤالٌ واحد قبل أيّ تمويل'
    const body = new FormData()
    body.set('_csrf', csrf); body.set('image_style', 'none')
    body.set('file', new File([csv], 'خطتي.csv', { type: 'text/csv' }))
    const res = await app.request('/panel/plan/import', { method: 'POST', body, headers: { Cookie: cookie } }, env)
    expect(res.headers.get('Location')).toBe('/panel/plan/review')
    const review = await (await app.request('/panel/plan/review', { headers: { Cookie: cookie } }, env)).text()
    expect(review).toContain('سُكّن 2 منشورًا في خطّتك')
    expect(review).toContain('ملاحظة: ')
    expect(review).toContain('الساعةُ أرجحُ ساعات المنصّة')
    expect(db.raw.prepare("SELECT count(*) AS n FROM posts WHERE status = 'queued'").get()).toEqual({ n: 0 })
    const paste = new FormData()
    paste.set('_csrf', csrf); paste.set('pasted', 'الأحد: منشورٌ عن الحوكمة على LinkedIn')
    const refused = await app.request('/panel/plan/import', { method: 'POST', body: paste, headers: { Cookie: cookie } }, env)
    expect(refused.headers.get('Location')).toBe('/panel/plan/import')
  })
})

describe('عرضُ الخطّة (D-288)', () => {
  it('الغلافُ بالمنظّمة والمدّة والأرقام، والمنشورُ بشكل منصّته، وزرُّ الطباعة — وبلا خطّةٍ إلى «خطّة جديدة»', async () => {
    const { cookie } = await session()
    const html = await (await app.request('/panel/plan/view', { headers: { Cookie: cookie } }, env)).text()
    expect(html).toContain('class="pd-hero"')
    expect(html).toContain('خطّةُ النشر · أسبوع')
    expect(html).toContain('<b>٣</b><span>منشورًا</span>')
    expect(html).toContain('class="np np-li')
    expect(html).toContain('نصُّ المنشور الأوّل')
    expect(html).toContain('id="pd-print"')
    expect(html).toContain('الأسبوع ١')
    const review = await (await app.request('/panel/plan/review', { headers: { Cookie: cookie } }, env)).text()
    expect(review).toContain('href="/panel/plan/view"')
    db.raw.exec("UPDATE plans SET status = 'superseded'")
    expect((await app.request('/panel/plan/view', { headers: { Cookie: cookie } }, env)).headers.get('Location')).toBe('/panel/plan/new')
  })
})

/** مراجعةُ الخطّة وتثبيتُها بإصدار (D-286): البطاقة، و«ما ينقص»، والأفعالُ الأربعة، والجملة، والتثبيت، والإصدارُ بعد التعديل. */
import { beforeEach, describe, expect, it } from 'vitest'
import { emailLogin } from '../test/emailLogin'
import { toBase64 } from '../lib/crypto'
import { fakeDb, fakeKv, type FakeDb } from '../test/fakes'
import { app } from '../index'
import { runPlanBuild } from './panel/plan'

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
    expect(html).toContain('مسوّدة · الإصدار 1')
    // ‏بندٌ لم يُكتب، وواحدٌ ينتظر، واثنان بلا صورة، وموعدان مكرَّران لـ LinkedIn
    for (const s of ['1 لم تُكتب بعد', '1 تنتظر اعتمادك', '2 بلا صورة', '2 موعدٌ مكرَّر']) expect(html).toContain(s)
    expect(html).toContain('href="?w=1#c-2">1 لم تُكتب بعد')
    // ‏والمنشورُ بشكل منصّته، وأزرارُ الصورة على بطاقته، ولا «ثبّت»: الاعتمادُ يجدول (D-327)
    expect(html).toContain('class="np np-li')
    expect(html).toContain('action="/panel/media/generate"')
    expect(html).not.toContain('action="/panel/plan/pin"')
    expect(html).toContain('اعتمد الأسبوع (1)')
  })

  it('اعتمد · أخّر · احذف — والبصمةُ تردّ فعلًا من صفحةٍ قديمة', async () => {
    const { cookie, csrf } = await session()
    const html = await (await app.request('/panel/plan/review', { headers: { Cookie: cookie } }, env)).text()
    await app.request('/panel/plan/review/approve', { method: 'POST', body: form({ _csrf: csrf, id: 'pl1', index: '0', key: keyOf(html, 0), post: 'p1' }), headers: { Cookie: cookie } }, env)
    // ‏«اعتمد» يجدول في موعد بنده (D-327) — ومعه ما كان معتمَدًا بلا موعد، والإصدارُ يُحفظ ويُختم
    expect(db.raw.prepare("SELECT status, scheduled_at FROM posts WHERE id = 'p1'").get()).toEqual({ status: 'queued', scheduled_at: '2099-01-04 04:00:00' })
    expect(db.raw.prepare("SELECT status FROM posts WHERE id = 'p2'").get()).toEqual({ status: 'queued' })
    expect(db.raw.prepare('SELECT version, scheduled FROM plan_versions').all()).toEqual([{ version: 1, scheduled: 2 }])
    expect((db.raw.prepare("SELECT locked_at FROM plans WHERE id = 'pl1'").get() as { locked_at: string | null }).locked_at).not.toBeNull()
    // ‏و«تراجَع»: يُسحب الموعدُ وتعود مسوّدةً
    await app.request('/panel/plan/review/undo', { method: 'POST', body: form({ _csrf: csrf, id: 'pl1', index: '0', post: 'p1' }), headers: { Cookie: cookie } }, env)
    expect(db.raw.prepare("SELECT status, scheduled_at FROM posts WHERE id = 'p1'").get()).toEqual({ status: 'draft', scheduled_at: null })
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

  it('ثبّت: صورةُ الإصدار 1 تُحفظ ويُجدوَل المعتمَد، وأوّلُ تعديلٍ بعده يفتح الإصدار 2 والأوّلُ باقٍ', async () => {
    const { cookie, csrf } = await session()
    const pinRes = await app.request('/panel/plan/pin', { method: 'POST', body: form({ _csrf: csrf, id: 'pl1' }), headers: { Cookie: cookie } }, env)
    expect(pinRes.status).toBe(303)
    expect(db.raw.prepare("SELECT status FROM posts WHERE id = 'p2'").get()).toEqual({ status: 'queued' })
    expect(db.raw.prepare("SELECT status FROM posts WHERE id = 'p1'").get()).toEqual({ status: 'draft' })
    expect(db.raw.prepare('SELECT version, scheduled FROM plan_versions').all()).toEqual([{ version: 1, scheduled: 1 }])
    const pinned = await (await app.request('/panel/plan/review', { headers: { Cookie: cookie } }, env)).text()
    expect(pinned).toContain('مثبَّتة · الإصدار 1')
    // ‏تأخيرُ بندٍ مجدول: يفتح الإصدار ٢، ويتحرّك موعدُ منشوره، والإصدارُ ١ في السجلّ كما ثُبّت
    await app.request('/panel/plan/review/delay', { method: 'POST', body: form({ _csrf: csrf, id: 'pl1', index: '1', key: keyOf(pinned, 1), days: '1' }), headers: { Cookie: cookie } }, env)
    expect(db.raw.prepare("SELECT version, locked_at FROM plans WHERE id = 'pl1'").get()).toEqual({ version: 2, locked_at: null })
    expect((db.raw.prepare("SELECT scheduled_at FROM posts WHERE id = 'p2'").get() as { scheduled_at: string }).scheduled_at.slice(0, 10)).toBe('2099-01-05')
    const v1 = JSON.parse((db.raw.prepare('SELECT plan_json FROM plan_versions WHERE version = 1').get() as { plan_json: string }).plan_json) as { items: { day: string }[] }
    expect(v1.items[1]!.day).toBe('2099-01-04')
    const after = await (await app.request('/panel/plan/review', { headers: { Cookie: cookie } }, env)).text()
    expect(after).toContain('عُدّلت بعد التثبيت · الإصدار 2 غير مثبَّت')
    expect(after).toContain('الإصدار 1 — ثُبّت')
    // ‏و«أزِل» على مجدول (D-327): يُسحب موعدُه ويُرفض ويخرج بندُه — وما أُرسل للنشر لا يُزال
    db.raw.exec("UPDATE posts SET dispatched_at = datetime('now') WHERE id = 'p2'")
    await app.request('/panel/plan/review/drop', { method: 'POST', body: form({ _csrf: csrf, id: 'pl1', index: '1', key: keyOf(after, 1) }), headers: { Cookie: cookie } }, env)
    expect(db.raw.prepare("SELECT status FROM posts WHERE id = 'p2'").get()).toEqual({ status: 'queued' })
    db.raw.exec("UPDATE posts SET dispatched_at = NULL WHERE id = 'p2'")
    await app.request('/panel/plan/review/drop', { method: 'POST', body: form({ _csrf: csrf, id: 'pl1', index: '1', key: keyOf(after, 1) }), headers: { Cookie: cookie } }, env)
    expect(db.raw.prepare("SELECT status, scheduled_at FROM posts WHERE id = 'p2'").get()).toEqual({ status: 'rejected', scheduled_at: null })
    expect((JSON.parse((db.raw.prepare("SELECT plan_json FROM plans WHERE id = 'pl1'").get() as { plan_json: string }).plan_json) as { items: unknown[] }).items).toHaveLength(2)
  })

  it('ما اعتُمد بعد التثبيت يُجدوَل (D-327) — كان يبقى معتمَدًا بلا موعدٍ إلى الأبد', async () => {
    const { cookie, csrf } = await session()
    await app.request('/panel/plan/pin', { method: 'POST', body: form({ _csrf: csrf, id: 'pl1' }), headers: { Cookie: cookie } }, env)
    expect(db.raw.prepare("SELECT status FROM posts WHERE id = 'p1'").get()).toEqual({ status: 'draft' })
    const html = await (await app.request('/panel/plan/review', { headers: { Cookie: cookie } }, env)).text()
    const res = await app.request('/panel/plan/review/approve', { method: 'POST', body: form({ _csrf: csrf, id: 'pl1', index: '0', key: keyOf(html, 0), post: 'p1', w: '1' }), headers: { Cookie: cookie } }, env)
    expect(res.headers.get('Location')).toBe('/panel/plan/review?w=1#c-0')
    expect(db.raw.prepare("SELECT status FROM posts WHERE id = 'p1'").get()).toEqual({ status: 'queued' })
    // ‏والإصدارُ الواحدُ صفٌّ واحدٌ بعدّاده
    expect(db.raw.prepare('SELECT version, scheduled FROM plan_versions').all()).toEqual([{ version: 1, scheduled: 2 }])
    const after = await (await app.request('/panel/plan/review', { headers: { Cookie: cookie } }, env)).text()
    expect(after).toContain('action="/panel/plan/review/undo"')
    expect(after).toContain('2 مجدولةً من 3')
  })

  it('«اعتمد الخطّة كاملة» من شاشة الخطّة: تُعتمَد وتُجدوَل وتنتقل إلى المتابعة (ابنِ ← راجع ← اعتمد ← تابع)', async () => {
    const { cookie, csrf } = await session()
    const res = await app.request('/panel/plan/approve-all', { method: 'POST', body: form({ _csrf: csrf, id: 'pl1', back: 'review' }), headers: { Cookie: cookie } }, env)
    expect(res.headers.get('Location')).toBe('/panel/plan/follow')
    expect(db.raw.prepare("SELECT id, status FROM posts ORDER BY id").all()).toEqual([{ id: 'p1', status: 'queued' }, { id: 'p2', status: 'queued' }])
    expect(db.raw.prepare("SELECT detail FROM audit_log WHERE action = 'plan.approve_all'").get()).toEqual({ detail: '1 اعتُمدت · 0 تعثّرت · 2 جُدولت' })
  })

  it('والنظامُ موقوف: يُعتمَد ولا يُجدوَل ويُقال، ثمّ «جدوِل» على البطاقة بعد رفع الإيقاف', async () => {
    const { cookie, csrf } = await session()
    db.raw.exec("DELETE FROM settings WHERE key = 'paused'; INSERT INTO settings (key, value) VALUES ('paused', 'true')")
    const html = await (await app.request('/panel/plan/review', { headers: { Cookie: cookie } }, env)).text()
    await app.request('/panel/plan/review/approve', { method: 'POST', body: form({ _csrf: csrf, id: 'pl1', index: '0', key: keyOf(html, 0), post: 'p1' }), headers: { Cookie: cookie } }, env)
    expect(db.raw.prepare("SELECT status FROM posts WHERE id = 'p1'").get()).toEqual({ status: 'approved' })
    const held = await (await app.request('/panel/plan/review', { headers: { Cookie: cookie } }, env)).text()
    expect(held).toContain('موقوفٌ مؤقّتًا')
    expect(held).toContain('معتمَدة بلا موعد')
    db.raw.exec("UPDATE settings SET value = 'false' WHERE key = 'paused'")
    await app.request('/panel/plan/review/approve', { method: 'POST', body: form({ _csrf: csrf, id: 'pl1', index: '0', key: keyOf(held, 0), post: 'p1' }), headers: { Cookie: cookie } }, env)
    expect(db.raw.prepare("SELECT status FROM posts WHERE id = 'p1'").get()).toEqual({ status: 'queued' })
  })

  it('الجملة: اعتمادُ المحدَّد، والحذفُ من الآخر إلى الأوّل فلا يتبدّل فهرسٌ', async () => {
    const { cookie, csrf } = await session()
    const html = await (await app.request('/panel/plan/review', { headers: { Cookie: cookie } }, env)).text()
    const sel = (i: number, post: string) => `${i}|${keyOf(html, i)}|${post}`
    const approve = form({ _csrf: csrf, id: 'pl1', do: 'approve' })
    approve.append('sel', sel(0, 'p1'))
    await app.request('/panel/plan/review/bulk', { method: 'POST', body: approve, headers: { Cookie: cookie } }, env)
    // ‏والمعتمَدُ بالجملة يُجدوَل (D-327)، و«أزِلها» يسحب موعدَه ويرفضه
    expect(db.raw.prepare("SELECT status FROM posts WHERE id = 'p1'").get()).toEqual({ status: 'queued' })
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

/**
 * **منشوران في اليوم على المنصّة نفسِها من المصدر نفسِه** (D-329): البندُ يطابق مسوّدتَه بمعرّفه لا بمصدره ومنصّته، ولكلّ
 * منصّةٍ صورتُها — و«ابدأ» يرسل لكلّ بندٍ معرّفَه وزاويتَه ونوعَ صورة منصّته.
 */
describe('بندٌ بمعرّفه، ولكلّ منصّةٍ صورتُها (D-329)', () => {
  beforeEach(() => {
    db.raw.exec("UPDATE plans SET status = 'superseded'; DELETE FROM posts")
    db.raw.exec(`INSERT INTO accounts (id, platform, kind, external_id, display_name, status) VALUES ('a2', 'x', 'member', 'e2', 'عمر', 'active')`)
    // ‏بنودُ المعالج بتوقيت المالك كما يكتبها الآن (D-384) — كانت 06:00 و15:30 و12:00 بـ UTC، وهو ما سبّب التحويلَ مرّتين
    const items = [
      { id: 'aaaaaaaaaa', sourceId: 's1', platform: 'linkedin', kind: 'text', angle: 'زاويةُ الصباح من التقرير', day: '2099-02-01', time: '09:00', why: 'ل' },
      { id: 'bbbbbbbbbb', sourceId: 's1', platform: 'linkedin', kind: 'text', angle: 'زاويةُ المساء من التقرير', day: '2099-02-01', time: '18:30', why: 'ل' },
      { id: 'cccccccccc', sourceId: 's1', platform: 'x', kind: 'text', angle: 'جملةٌ واحدةٌ من التقرير', day: '2099-02-01', time: '15:00', why: 'ل' },
    ]
    db.raw.prepare(`INSERT INTO plans (id, week_start, plan_json, model, status, span, choices_json) VALUES ('pl2', '2099-02-01', ?, 'm', 'approved', 'week', ?)`)
      .run(JSON.stringify({ rationale: 'ر', items }), JSON.stringify({ channels: ['linkedin', 'x'], autoImage: true, imageStyle: 'infographic',
        imageStyles: { linkedin: 'illustration', x: 'none' }, times: { linkedin: ['09:00', '18:30'] }, zone: 'Asia/Riyadh' }))
    const text = (n: string): string => `نصُّ منشور ${n} كما كُتب من زاويته ليُعتمَد، وفيه ما يكفي من الكلام ليكون منشورًا حقيقيًّا يقرؤه الناس.`
    const ins = db.raw.prepare(`INSERT INTO posts (id, platform, type, text, status, idempotency_key, plan_id, source_id, source_refs) VALUES (?, ?, 'text', ?, 'draft', ?, 'pl2', 's1', ?)`)
    ins.run('q2', 'linkedin', text('المساء'), 'draft:s1:linkedin:h:i:bbbbbbbbbb', JSON.stringify(['s1', 'item:bbbbbbbbbb']))
    ins.run('q1', 'linkedin', text('الصباح'), 'draft:s1:linkedin:h:i:aaaaaaaaaa', JSON.stringify(['s1', 'item:aaaaaaaaaa']))
    ins.run('q3', 'x', 'جملةُ X من زاويتها.', 'draft:s1:x:h:i:cccccccccc', JSON.stringify(['s1', 'item:cccccccccc']))
  })

  it('كلُّ بندٍ ببطاقة مسوّدته، و«اعتمد» على أحدهما يجدوله في موعده وحدَه — والآخرُ ينتظر', async () => {
    const { cookie, csrf } = await session()
    const html = await (await app.request('/panel/plan/review', { headers: { Cookie: cookie } }, env)).text()
    // ‏ترتيبُ الإدراج عكسُ ترتيب البنود: المطابقةُ بالمعرّف لا بأوّل مسوّدةٍ للمصدر والمنصّة
    expect(html.indexOf('نصُّ منشور الصباح')).toBeLessThan(html.indexOf('نصُّ منشور المساء'))
    expect(html.indexOf('id="c-0"')).toBeLessThan(html.indexOf('نصُّ منشور الصباح'))
    expect(html.indexOf('نصُّ منشور الصباح')).toBeLessThan(html.indexOf('id="c-1"'))
    // ‏«بلا صورة» لـ X لا تُعَدّ نقصًا، ورسمُ LinkedIn الفنّيُّ يُطلب بنوعه من زرّ البطاقة
    expect(html).toContain('2 بلا صورة')
    expect(html).toContain('name="style" value="illustration"')
    expect(html).toContain('name="style" value="infographic"')
    await app.request('/panel/plan/review/approve', { method: 'POST', body: form({ _csrf: csrf, id: 'pl2', index: '1', key: keyOf(html, 1), post: 'q2' }), headers: { Cookie: cookie } }, env)
    // ‏والوقتُ وقتُ البند (اختاره المالكُ لمنصّته) لا أرجحُ الساعات، فلا يلتقي منشورا اليوم في ساعةٍ واحدة.
    // ‏18:30 الرياض = 15:30Z (D-384) — وكان هنا 12:30Z: التحويلُ مرّتين نفسُه مكتوبًا في التوقّع
    expect(db.raw.prepare('SELECT id, status, scheduled_at FROM posts ORDER BY id').all()).toEqual([
      { id: 'q1', status: 'draft', scheduled_at: null }, { id: 'q2', status: 'queued', scheduled_at: '2099-02-01 15:30:00' }, { id: 'q3', status: 'draft', scheduled_at: null },
    ])
    // ‏و«أزِل» على البند الأوّل يرفض مسوّدتَه هو، لا مسوّدةَ جاره من المصدر نفسِه
    const fresh = await (await app.request('/panel/plan/review', { headers: { Cookie: cookie } }, env)).text()
    await app.request('/panel/plan/review/drop', { method: 'POST', body: form({ _csrf: csrf, id: 'pl2', index: '0', key: keyOf(fresh, 0) }), headers: { Cookie: cookie } }, env)
    expect(db.raw.prepare("SELECT id, status FROM posts WHERE platform = 'linkedin' ORDER BY id").all()).toEqual([{ id: 'q1', status: 'rejected' }, { id: 'q2', status: 'queued' }])
  })

  it('«ابدأ» يرسل لكلّ بندٍ معرّفَه وزاويتَه وصورةَ منصّته — وبندا المصدر الواحد رسالتان لا واحدة', async () => {
    const sent: { draft: Record<string, unknown> }[] = []
    env['GENERATE_QUEUE'] = { async sendBatch(b: { body: { draft: Record<string, unknown> } }[]) { sent.push(...b.map((x) => x.body)) } }
    const { cookie, csrf } = await session()
    await app.request('/panel/plan/start', { method: 'POST', body: form({ _csrf: csrf, id: 'pl2' }), headers: { Cookie: cookie } }, env)
    expect(sent.map((m) => [m.draft['platform'], m.draft['itemId'], m.draft['angle'], m.draft['autoImage'], m.draft['imageStyle']])).toEqual([
      ['linkedin', 'aaaaaaaaaa', 'زاويةُ الصباح من التقرير', true, 'illustration'],
      ['linkedin', 'bbbbbbbbbb', 'زاويةُ المساء من التقرير', true, 'illustration'],
      ['x', 'cccccccccc', 'جملةٌ واحدةٌ من التقرير', false, 'infographic'],
    ])
  })

  it('لوحةُ الشهر بمصغَّراتها، ولوحُ البطاقة جزءُ صفحةٍ بنماذجها وCSRF — ورقمٌ لا بندَ له 404 (D-330)', async () => {
    const { cookie, csrf } = await session()
    const html = await (await app.request('/panel/plan/review', { headers: { Cookie: cookie } }, env)).text()
    expect(html).toContain('id="rv-root"')
    expect(html).toContain('class="rv-cal is-board"')
    expect(html).toMatch(/<a class="rv-mini" href="\?w=1#c-0" data-sheet="0" data-st="wait" draggable="true" data-move="0" data-key="aaaaaaaaaa\|linkedin\|2099-02-01\|09:00">/)
    expect(html).toContain('<dialog class="rv-sheet" id="rv-sheet"')
    const card = await app.request('/panel/plan/review/card?i=1&w=1', { headers: { Cookie: cookie } }, env)
    expect(card.status).toBe(200)
    const sheet = await card.text()
    expect(sheet).not.toContain('<html')
    for (const s of ['نصُّ منشور المساء', 'action="/panel/plan/review/text"', 'action="/panel/plan/review/move"', 'name="day" value="2099-02-01"', 'name="time" value="18:30"',
      'action="/panel/plan/review/approve"', 'data-sheet="2"', `name="_csrf" value="${csrf}"`]) expect(sheet).toContain(s)
    // ‏والسابقُ بترتيب الموعد لا بترتيب البنود: قبل منشور المساء منشورُ X عند الظهر، ولا تاليَ له في يومه
    expect(sheet).not.toContain('data-sheet="0"')
    expect((await app.request('/panel/plan/review/card?i=9', { headers: { Cookie: cookie } }, env)).status).toBe(404)
    expect((await app.request('/panel/plan/review/card?i=1', {}, env)).status).toBe(401)
  })

  it('«احفظ النصّ» يكتب ولا يعتمد، و«انقل» بيومٍ وساعةٍ بتوقيت المالك — ومجدولٌ يتحرّك موعدُه، وخارجُ المدى يُردّ (D-330)', async () => {
    const { cookie, csrf } = await session()
    const html = await (await app.request('/panel/plan/review', { headers: { Cookie: cookie } }, env)).text()
    const text = 'نصٌّ كتبه المالكُ في لوح البطاقة بدل ما كتبه النموذج، وفيه ما يكفي ليكون منشورًا يُقرأ ويُعتمد.'
    await app.request('/panel/plan/review/text', { method: 'POST', body: form({ _csrf: csrf, id: 'pl2', index: '0', key: keyOf(html, 0), post: 'q1', text }), headers: { Cookie: cookie } }, env)
    expect(db.raw.prepare("SELECT text, status FROM posts WHERE id = 'q1'").get()).toEqual({ text, status: 'draft' })
    // ‏بندٌ مجدول يُنقل: 2099-02-03 الساعة 10:15 بتوقيت الرياض — يُحفظ في البند كما هو (D-384)، والموعدُ 07:15 بـ UTC
    await app.request('/panel/plan/review/approve', { method: 'POST', body: form({ _csrf: csrf, id: 'pl2', index: '0', key: keyOf(html, 0), post: 'q1' }), headers: { Cookie: cookie } }, env)
    const moved = await app.request('/panel/plan/review/move', { method: 'POST', body: form({ _csrf: csrf, id: 'pl2', index: '0', key: keyOf(html, 0), day: '2099-02-03', time: '10:15', w: '1' }), headers: { Cookie: cookie } }, env)
    expect(moved.headers.get('Location')).toBe('/panel/plan/review?w=1')
    const items = (): { day: string; time: string }[] => (JSON.parse((db.raw.prepare("SELECT plan_json FROM plans WHERE id = 'pl2'").get() as { plan_json: string }).plan_json) as { items: { day: string; time: string }[] }).items
    expect(items()[0]).toMatchObject({ day: '2099-02-03', time: '10:15' })
    // ‏وكان 04:15Z: اللوحُ حوّل إلى UTC و`moveItem` حوّل ثانيةً
    expect(db.raw.prepare("SELECT status, scheduled_at FROM posts WHERE id = 'q1'").get()).toEqual({ status: 'queued', scheduled_at: '2099-02-03 07:15:00' })
    // ‏والسحبُ يرسل اليومَ وحدَه: الساعةُ تبقى كما هي بتوقيت المالك
    const after = await (await app.request('/panel/plan/review', { headers: { Cookie: cookie } }, env)).text()
    await app.request('/panel/plan/review/move', { method: 'POST', body: form({ _csrf: csrf, id: 'pl2', index: '2', key: keyOf(after, 2), day: '2099-02-05' }), headers: { Cookie: cookie } }, env)
    expect(items()[2]).toMatchObject({ day: '2099-02-05', time: '15:00' })
    // ‏وخارجُ المدى يُردّ ولا يتبدّل شيء
    const last = await (await app.request('/panel/plan/review', { headers: { Cookie: cookie } }, env)).text()
    await app.request('/panel/plan/review/move', { method: 'POST', body: form({ _csrf: csrf, id: 'pl2', index: '2', key: keyOf(last, 2), day: '2099-03-01' }), headers: { Cookie: cookie } }, env)
    expect(items()[2]).toMatchObject({ day: '2099-02-05' })
  })

  it('المعالجُ يحمل لكلّ منصّةٍ إيقاعَها حتّى ثلاثٍ في اليوم وأوقاتَها وصورتَها', async () => {
    const { cookie } = await session()
    const html = await (await app.request('/panel/plan/new', { headers: { Cookie: cookie } }, env)).text()
    for (const s of ['name="cadence_linkedin" value="14"', 'name="cadence_x" value="21"', 'name="time_linkedin" value="09:00"', 'name="time_x" value="18:30"',
      'name="image_linkedin"', '<option value="illustration">رسمٌ فنّيّ</option>', '<option value="none">بلا صورة</option>']) expect(html).toContain(s)
    expect((html.match(/name="time_linkedin"/g) ?? []).length).toBe(3)
  })
})

/**
 * **«أضف منشورًا»** (D-336): بندٌ بيد المالك يدخل الخطّةَ بمعرّفه ويُرسَل إلى الكتابة — والحدودُ تُردّ بأسبابها ولا يُكتب شيء.
 */
describe('«أضف منشورًا» إلى يومٍ في الخطّة (D-336)', () => {
  const items = (): { id?: string; platform: string; day: string; time: string; angle: string; sourceId: string }[] =>
    (JSON.parse((db.raw.prepare("SELECT plan_json FROM plans WHERE id = 'pl1'").get() as { plan_json: string }).plan_json) as { items: never[] }).items
  let sent: { draft: Record<string, unknown> }[]
  beforeEach(() => {
    sent = []
    env['GENERATE_QUEUE'] = { async send(b: { draft: Record<string, unknown> }) { sent.push(b) }, async sendBatch() { /* لا يُنادى هنا */ } }
  })
  const add = async (fields: Record<string, string>): Promise<Response> => {
    const { cookie, csrf } = await session()
    return app.request('/panel/plan/review/add', { method: 'POST', body: form({ _csrf: csrf, id: 'pl1', w: '1', ...fields }), headers: { Cookie: cookie } }, env)
  }

  it('النموذجُ على الشاشة بقنوات الخطّة ومداها، والإضافةُ تكتب بندًا بمعرّفه من مصدر منصّته وترسله إلى الكتابة', async () => {
    const { cookie } = await session()
    const html = await (await app.request('/panel/plan/review', { headers: { Cookie: cookie } }, env)).text()
    expect(html).toContain('action="/panel/plan/review/add"')
    expect(html).toMatch(/name="day" value="2099-01-04" min="2099-01-04" max="2099-01-10"/)
    const res = await add({ platform: 'x', day: '2099-01-05', time: '10:30', angle: '  إعلانُ   الورشة القادمة ' })
    expect(res.status).toBe(303)
    const added = items()[3]!
    // ‏الساعةُ بتوقيت المالك (الرياض) تُحفظ كما كُتبت (D-384) — كانت تُحفظ 07:30 بـ UTC
    expect(added).toMatchObject({ platform: 'x', day: '2099-01-05', time: '10:30', angle: 'إعلانُ الورشة القادمة', sourceId: 's2' })
    expect(added.id).toMatch(/^a[0-9a-f]{11}$/)
    expect(sent).toHaveLength(1)
    expect(sent[0]!.draft).toMatchObject({ platform: 'x', sourceId: 's2', planId: 'pl1', itemId: added.id, angle: 'إعلانُ الورشة القادمة' })
  })

  it('خارجُ المدى، ومنصّةٌ ليست من القنوات، وجملةٌ فارغة، وساعةٌ مشغولة، وبلا CSRF — تُردّ ولا بندَ ولا رسالة', async () => {
    await add({ platform: 'x', day: '2099-02-01', time: '10:30', angle: 'خارج المدى' })
    await add({ platform: 'tiktok', day: '2099-01-05', time: '10:30', angle: 'منصّةٌ أخرى' })
    await add({ platform: 'x', day: '2099-01-05', time: '10:30', angle: ' ' })
    // ‏بندُ X في 2099-01-06 الساعة 09:00 بتوقيت المالك (D-384؛ كان 12:00 لمّا قُرئ البندُ UTC)
    await add({ platform: 'x', day: '2099-01-06', time: '09:00', angle: 'ساعةٌ مشغولة' })
    const { cookie } = await session()
    await app.request('/panel/plan/review/add', { method: 'POST', body: form({ id: 'pl1', platform: 'x', day: '2099-01-05', time: '10:30', angle: 'بلا رمز' }), headers: { Cookie: cookie } }, env)
    expect(items()).toHaveLength(3)
    expect(sent).toHaveLength(0)
  })

  it('لوحُ المسوّدة يحمل موضعَ رقائق الهاشتاق فارغًا — يملؤه السكربتُ من النصّ، ولا نصَّ مستخدمٍ يُكتب فيه من الخادم', async () => {
    const { cookie } = await session()
    const sheet = await (await app.request('/panel/plan/review/card?i=0', { headers: { Cookie: cookie } }, env)).text()
    expect(sheet).toContain('<div class="rv-tags" id="rv-sh-tags" role="group"')
    expect(sheet).toMatch(/id="rv-sh-tags"[^>]*><\/div>/)
  })

  it('عرضُ القائمة (D-337): المعروضُ جدولًا بصفٍّ لكلّ بندٍ يفتح لوحَه، ومبدّلُ المنظار مخفيٌّ حتّى يُظهره السكربت', async () => {
    const { cookie } = await session()
    const html = await (await app.request('/panel/plan/review?w=all', { headers: { Cookie: cookie } }, env)).text()
    expect(html).toContain('<div class="scroll rv-list"><table>')
    expect((html.match(/<tr><td><span class="ago">/g) ?? []).length).toBe(3)
    expect(html).toMatch(/<a href="#c-0" data-sheet="0">نصُّ المنشور الأوّل/)
    expect(html).toContain('<span class="rv-vw" hidden><div class="seg" role="group" aria-label="طريقة العرض">')
    expect(html).toContain('<button type="button" data-view="cards" aria-pressed="true">بطاقات</button>')
  })

  it('من المنشور إلى أصله (D-345): لوحُ البطاقة يسمّي مصدرَها برابطٍ إلى المكتبة، ورحلتُه بعد أن يُجدول', async () => {
    const { cookie, csrf } = await session()
    const draft = await (await app.request('/panel/plan/review/card?i=0', { headers: { Cookie: cookie } }, env)).text()
    expect(draft).toContain('كُتب من <a href="/panel/library#sources">تقرير</a>')
    expect(draft).not.toContain('رحلةُ المنشور')
    const html = await (await app.request('/panel/plan/review', { headers: { Cookie: cookie } }, env)).text()
    await app.request('/panel/plan/review/approve', { method: 'POST', body: form({ _csrf: csrf, id: 'pl1', index: '0', key: keyOf(html, 0), post: 'p1' }), headers: { Cookie: cookie } }, env)
    const queued = await (await app.request('/panel/plan/review/card?i=0', { headers: { Cookie: cookie } }, env)).text()
    expect(queued).toContain('<a href="/panel/journey/p1">رحلةُ المنشور</a>')
  })

  it('ثلاثةٌ في اليوم على المنصّة حدٌّ: الرابعُ يُردّ', async () => {
    for (const time of ['10:00', '11:00']) await add({ platform: 'x', day: '2099-01-06', time, angle: 'منشورٌ إضافيّ' })
    expect(items()).toHaveLength(5)
    await add({ platform: 'x', day: '2099-01-06', time: '15:00', angle: 'الرابع' })
    expect(items()).toHaveLength(5)
    expect(sent).toHaveLength(2)
  })
})

/**
 * **«من المكتبة» على بطاقة المنشور** (D-334): صورةٌ في الأصول تُربط بمنشورٍ مكتوب — الكائنُ نفسُه بلا نسخ، والصورةُ السابقةُ تُرفض،
 * وعدّادُ الاستعمال يُرى في المكتبة. والمجدولُ وغيرُ الصورة يُردّان بسببهما.
 */
describe('«من المكتبة» على بطاقة المنشور (D-334)', () => {
  const A = 'aaaaaaaa-0000-4000-8000-000000000001'
  const B = 'bbbbbbbb-0000-4000-8000-000000000002'
  beforeEach(() => {
    db.raw.exec(`INSERT INTO posts (id, platform, type, text, status, idempotency_key, approved_by, approved_at, account_id, scheduled_at) VALUES
      ('${A}', 'linkedin', 'text', 'منشورٌ أوّل', 'draft', 'kA', NULL, NULL, NULL, NULL), ('${B}', 'linkedin', 'text', 'منشورٌ ثانٍ', 'queued', 'kB', 'o', '2099-01-01 00:00:00', 'a1', '2099-02-01 00:00:00')`)
    db.raw.exec(`INSERT INTO library_files (id, org_id, r2_key, name, mime, bytes) VALUES ('f1', 'org_owner', 'lib/one', 'شعار.png', 'image/png', 5)`)
    db.raw.exec(`INSERT INTO media (id, post_id, r2_key, mime, bytes, prompt, model, idempotency_key) VALUES ('m-old', '${A}', 'gen/old', 'image/png', 5, 'و', 'm', 'k-old')`)
  })
  const ready = (post: string): string[] => (db.raw.prepare("SELECT r2_key FROM media WHERE post_id = ? AND status = 'ready'").all(post) as { r2_key: string }[]).map((r) => r.r2_key)

  it('الرابطُ على البطاقة، ووجهُ الاختيار في الأصول بزرّه للصور وحدَها — والربطُ يبدّل الصورةَ ويعود إلى البطاقة، والعدّادُ يُرى', async () => {
    const { cookie, csrf } = await session()
    const review = await (await app.request('/panel/plan/review', { headers: { Cookie: cookie } }, env)).text()
    expect(review).toMatch(/href="\/panel\/assets\?kind=image&amp;post=p1&amp;index=0[^"]*"><span>من المكتبة/)
    const lib = await (await app.request(`/panel/assets?post=${A}&index=1&w=1`, { headers: { Cookie: cookie } }, env)).text()
    expect(lib).toContain('اختر صورةً لهذا المنشور')
    expect(lib).toContain('action="/panel/plan/review/image"')
    expect(lib.split('استعملها لهذا المنشور').length - 1).toBe(2) // ‏الصورتان: المولَّدةُ والمرفوعة
    expect(lib).toContain('في منشورٍ واحد')
    const res = await app.request('/panel/plan/review/image', { method: 'POST', body: form({ _csrf: csrf, post: A, ref: 'f:f1', index: '1', w: '1' }), headers: { Cookie: cookie } }, env)
    expect(res.status).toBe(303)
    expect(res.headers.get('Location')).toBe('/panel/plan/review?w=1#c-1')
    expect(ready(A)).toEqual(['lib/one'])
    // ‏وإعادةُ الاختيار لا تُكثّر الصفوف، والعودةُ إلى السابقة بعد رفضها تعمل
    await app.request('/panel/plan/review/image', { method: 'POST', body: form({ _csrf: csrf, post: A, ref: 'f:f1', index: '1' }), headers: { Cookie: cookie } }, env)
    expect(ready(A)).toEqual(['lib/one'])
  })

  it('المكتبةُ ببحثها وعلاماتها (D-347): «فضّلها» و«احفظ الوسوم» يعودان إلى العرض نفسِه، والبحثُ يحصر، وبلا CSRF لا يُكتب', async () => {
    const { cookie, csrf } = await session()
    const page = await (await app.request('/panel/assets?kind=image', { headers: { Cookie: cookie } }, env)).text()
    expect(page).toContain('<form method="GET" action="/panel/assets" class="lib-find" role="search">')
    expect(page).toContain('action="/panel/assets/mark"')
    const fav = await app.request('/panel/assets/mark', { method: 'POST', body: form({ _csrf: csrf, ref: 'f:f1', fav: '1', back: 'kind=image' }), headers: { Cookie: cookie } }, env)
    expect(fav.status).toBe(303)
    expect(fav.headers.get('Location')).toBe('/panel/assets?kind=image')
    await app.request('/panel/assets/mark', { method: 'POST', body: form({ _csrf: csrf, ref: 'f:f1', tags: 'هويّة، شعار', back: '"><script>' }), headers: { Cookie: cookie } }, env)
    const found = await (await app.request('/panel/assets?q=' + encodeURIComponent('هويّة') + '&fav=1', { headers: { Cookie: cookie } }, env)).text()
    expect(found).toContain('<span class="chip">هويّة</span>')
    expect(found).toContain('aria-pressed="true"')
    expect((found.match(/<article class="card card-inset tile">/g) ?? []).length).toBe(1)
    await app.request('/panel/assets/mark', { method: 'POST', body: form({ ref: 'f:f1', fav: '0' }), headers: { Cookie: cookie } }, env)
    expect((db.raw.prepare('SELECT favourite FROM asset_marks').get() as { favourite: number }).favourite).toBe(1)
  })

  it('المجدولُ يُردّ بسببه، وما ليس في المكتبة، ومنشورٌ لا وجودَ له — ولا صفَّ يُكتب', async () => {
    const { cookie, csrf } = await session()
    const send = (fields: Record<string, string>): Promise<Response> =>
      Promise.resolve(app.request('/panel/plan/review/image', { method: 'POST', body: form({ _csrf: csrf, index: '0', ...fields }), headers: { Cookie: cookie } }, env))
    await send({ post: B, ref: 'f:f1' })
    expect(ready(B)).toEqual([])
    await send({ post: A, ref: 'f:nope' })
    await send({ post: 'cccccccc-0000', ref: 'f:f1' })
    expect(ready(A)).toEqual(['gen/old'])
    // ‏وبلا CSRF لا يمضي
    const bare = await app.request('/panel/plan/review/image', { method: 'POST', body: form({ post: A, ref: 'f:f1' }), headers: { Cookie: cookie } }, env)
    expect(bare.status).not.toBe(303)
    expect(ready(A)).toEqual(['gen/old'])
  })
})

/**
 * **بناءُ الخطّة في الخلفيّة** (D-332): «حلّل وابنِ» لا ينادي النموذجَ في طلب الصفحة — يكتب حالَ البناء ويرسل رسالةً ويفتح شاشتَه.
 */
describe('بناءُ الخطّة في الخلفيّة وحالُه يُرى (D-332)', () => {
  const wizard = (csrf: string): FormData => {
    const f = form({ _csrf: csrf, span: 'month', then: 'review', image_style: 'none', cadence_linkedin: '14', start: '2099-03-01' })
    f.append('channel', 'linkedin'); f.append('time_linkedin', '09:00'); f.append('time_linkedin', '18:30')
    return f
  }

  it('الضغطةُ تكتب الحالَ وترسل رسالةً واحدةً باختيارات المعالج وتفتح شاشةَ البناء — ولا نداءَ في الطلب', async () => {
    const sent: { planBuild: { org: string; jobId: string; params: Record<string, unknown> } }[] = []
    env['GENERATE_QUEUE'] = { async sendBatch(b: { body: (typeof sent)[number] }[]) { sent.push(...b.map((x) => x.body)) } }
    const { cookie, csrf } = await session()
    const res = await app.request('/panel/plan/generate', { method: 'POST', body: wizard(csrf), headers: { Cookie: cookie } }, env)
    expect(res.headers.get('Location')).toBe('/panel/plan/building')
    expect(sent).toHaveLength(1)
    expect(sent[0]!.planBuild.params).toMatchObject({ span: 'month', channels: ['linkedin'], cadence: { linkedin: 14 }, times: { linkedin: ['09:00', '18:30'] }, startDay: '2099-03-01', autoImage: false })
    expect(db.raw.prepare("SELECT count(*) AS n FROM cost_ledger").get()).toEqual({ n: 0 })
    expect(db.raw.prepare("SELECT detail FROM audit_log WHERE action = 'plan.generate'").get()).toEqual({ detail: 'queued' })
    // ‏منشوران في اليوم لشهر: 14 في الأسبوع × 4 = 56 ≤ سقف النداء، فجزءٌ واحد؛ والشاشةُ تقول ما يجري
    const screen = await (await app.request('/panel/plan/building', { headers: { Cookie: cookie } }, env)).text()
    for (const s of ['صدى يبني خطّتك', 'id="pb-plan"', 'id="pb-prog" max="1" value="0"', 'لك أن تغادر الصفحة', 'href="/panel/plan/building"']) expect(screen).toContain(s)
    expect(await (await app.request('/panel/plan/build.json', { headers: { Cookie: cookie } }, env)).json()).toMatchObject({ state: 'queued', done: 0, total: 1 })
    // ‏وضغطةٌ ثانيةٌ والأوّلُ يجري: شاشتُه لا رسالةٌ ثانيةٌ مدفوعة — و«الخطّة» في الرافدة تفتحها أيضًا
    const again = await app.request('/panel/plan/generate', { method: 'POST', body: wizard(csrf), headers: { Cookie: cookie } }, env)
    expect(again.headers.get('Location')).toBe('/panel/plan/building')
    expect(sent).toHaveLength(1)
    expect((await app.request('/panel/plan', { headers: { Cookie: cookie } }, env)).headers.get('Location')).toBe('/panel/plan/building')
  })

  it('المستهلكُ بلا مزوّدٍ جاهز: الحالُ «فشل» بسببه، والشاشةُ تقوله وتعيد إلى المعالج — ورسالةُ بناءٍ استُبدل تُترك', async () => {
    const sent: { planBuild: { org: string; jobId: string; params: never } }[] = []
    env['GENERATE_QUEUE'] = { async sendBatch(b: { body: (typeof sent)[number] }[]) { sent.push(...b.map((x) => x.body)) } }
    const { cookie, csrf } = await session()
    await app.request('/panel/plan/generate', { method: 'POST', body: wizard(csrf), headers: { Cookie: cookie } }, env)
    await runPlanBuild(env as never, { ...sent[0]!.planBuild, jobId: 'ليس-الجاري' })
    expect(await (await app.request('/panel/plan/build.json', { headers: { Cookie: cookie } }, env)).json()).toMatchObject({ state: 'queued' })
    await runPlanBuild(env as never, sent[0]!.planBuild)
    expect(await (await app.request('/panel/plan/build.json', { headers: { Cookie: cookie } }, env)).json()).toMatchObject({ state: 'failed' })
    const screen = await (await app.request('/panel/plan/building', { headers: { Cookie: cookie } }, env)).text()
    for (const s of ['تعذّر بناءُ الخطّة', '<b>السبب:</b>', 'href="/panel/plan/new"']) expect(screen).toContain(s)
    // ‏وبعد الفشل «الخطّة» تعود إلى شاشتها، والمعالجُ يبدأ بناءً جديدًا
    expect((await app.request('/panel/plan', { headers: { Cookie: cookie } }, env)).headers.get('Location')).toBe('/panel/plan/review')
    await app.request('/panel/plan/generate', { method: 'POST', body: wizard(csrf), headers: { Cookie: cookie } }, env)
    expect(sent).toHaveLength(2)
  })

  it('بلا بناءٍ لا شاشةَ له، وبلا جلسةٍ لا حال', async () => {
    const { cookie } = await session()
    expect((await app.request('/panel/plan/building', { headers: { Cookie: cookie } }, env)).headers.get('Location')).toBe('/panel/plan')
    expect((await app.request('/panel/plan/build.json', {}, env)).status).toBe(401)
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
    const to = res.headers.get('Location') ?? ''
    expect(to).toMatch(/^\/panel\/plan\/import\/preview\?k=/)
    // ‏«هذا ما فهمته»: لا يُسكَّن شيءٌ قبل الزرّ
    expect(db.raw.prepare("SELECT count(*) AS n FROM plans WHERE status <> 'superseded'").get()).toEqual({ n: 0 })
    const preview = await (await app.request(to, { headers: { Cookie: cookie } }, env)).text()
    expect(preview).toContain('هذا ما فهمته')
    expect(preview).toContain('2099-02-01 إلى 2099-02-03')
    expect(preview).toContain('الساعةُ أرجحُ ساعات المنصّة')
    expect(preview).toContain('ابنِ كما هي')
    const k = new URL(to, 'http://x').searchParams.get('k') ?? ''
    const ok = new FormData(); ok.set('_csrf', csrf); ok.set('k', k)
    const built = await app.request('/panel/plan/import/confirm', { method: 'POST', body: ok, headers: { Cookie: cookie } }, env)
    expect(built.headers.get('Location')).toBe('/panel/plan/review')
    const review = await (await app.request('/panel/plan/review', { headers: { Cookie: cookie } }, env)).text()
    expect(review).toContain('سُكّن 2 منشورًا في خطّتك')
    expect(review).toContain('ملاحظة: ')
    expect(review).toContain('الساعةُ أرجحُ ساعات المنصّة')
    expect(db.raw.prepare("SELECT count(*) AS n FROM posts WHERE status = 'queued'").get()).toEqual({ n: 0 })
    // ‏والمفتاحُ لا يُبنى مرّتين
    const again = await app.request('/panel/plan/import/confirm', { method: 'POST', body: ok, headers: { Cookie: cookie } }, env)
    expect(again.headers.get('Location')).toBe('/panel/plan/import')
    const paste = new FormData()
    paste.set('_csrf', csrf); paste.set('pasted', 'الأحد: منشورٌ عن الحوكمة على LinkedIn')
    const refused = await app.request('/panel/plan/import', { method: 'POST', body: paste, headers: { Cookie: cookie } }, env)
    expect(refused.headers.get('Location')).toBe('/panel/plan/import')
  })
})

describe('«اكتب الخطّة من أفكارها» (D-361)', () => {
  it('لا يسكّن نصًّا: كلُّ صفٍّ فكرةٌ في الطابور بقواعد منصّته، ولا منشورَ قبل الكتابة', async () => {
    db.raw.exec("UPDATE plans SET status = 'superseded'")
    const { cookie } = await session()
    const screen = await (await app.request('/panel/plan/import', { headers: { Cookie: cookie } }, env)).text()
    const csrf = /name="_csrf" value="([^"]+)"/.exec(screen)?.[1] ?? ''
    const sent: { draft: Record<string, unknown> }[] = []
    env['GENERATE_QUEUE'] = { async sendBatch(b: { body: { draft: Record<string, unknown> } }[]) { sent.push(...b.map((x) => x.body)) } }
    const csv = 'التاريخ,العنوان / الفكرة,X: الصيغة,X: الوقت,LinkedIn: الصيغة,LinkedIn: الوقت\n2099-03-01,المَعلَم نقطة قرار,اقتباس,8:00 م,منشور طويل,9:00 ص'
    const body = new FormData(); body.set('_csrf', csrf); body.set('image_style', 'none')
    body.set('file', new File([csv], 'خطة.csv', { type: 'text/csv' }))
    const to = (await app.request('/panel/plan/import', { method: 'POST', body, headers: { Cookie: cookie } }, env)).headers.get('Location') ?? ''
    const preview = await (await app.request(to, { headers: { Cookie: cookie } }, env)).text()
    expect(preview).toContain('اكتب الخطّة من أفكارها')
    expect(preview).toContain('ابنِ كما هي')
    const k = new URL(to, 'http://x').searchParams.get('k') ?? ''
    const before = (db.raw.prepare('SELECT count(*) AS n FROM posts').get() as { n: number }).n
    const ok = new FormData(); ok.set('_csrf', csrf); ok.set('k', k); ok.set('write', '1')
    const res = await app.request('/panel/plan/import/confirm', { method: 'POST', body: ok, headers: { Cookie: cookie } }, env)
    expect(res.headers.get('Location')).toBe('/panel/plan/review')
    expect((db.raw.prepare('SELECT count(*) AS n FROM posts').get() as { n: number }).n).toBe(before)
    expect(sent.map((m) => [m.draft['platform'], m.draft['sourceId'], m.draft['idea']])).toEqual([
      ['x', 'idea:i1', 'المَعلَم نقطة قرار (الصيغة: اقتباس)'],
      ['linkedin', 'idea:i2', 'المَعلَم نقطة قرار (الصيغة: منشور طويل)'],
    ])
  })
})

describe('عرضُ الخطّة (D-288)', () => {
  it('الغلافُ بالمنظّمة والمدّة والأرقام، والمنشورُ بشكل منصّته، وزرُّ الطباعة — وبلا خطّةٍ إلى «خطّة جديدة»', async () => {
    const { cookie } = await session()
    const html = await (await app.request('/panel/plan/view', { headers: { Cookie: cookie } }, env)).text()
    expect(html).toContain('class="pd-hero"')
    expect(html).toContain('خطّةُ النشر · أسبوع')
    expect(html).toContain('<b>3</b><span>منشورًا</span>')
    expect(html).toContain('class="np np-li')
    expect(html).toContain('نصُّ المنشور الأوّل')
    expect(html).toContain('id="pd-print"')
    expect(html).toContain('الأسبوع 1')
    const review = await (await app.request('/panel/plan/review', { headers: { Cookie: cookie } }, env)).text()
    expect(review).toContain('href="/panel/plan/view"')
    db.raw.exec("UPDATE plans SET status = 'superseded'")
    expect((await app.request('/panel/plan/view', { headers: { Cookie: cookie } }, env)).headers.get('Location')).toBe('/panel/plan/new')
  })
})

describe('«خطّةُ الشهر» في الرئيسيّة (D-289)', () => {
  it('حالُها وتقدّمُ اعتمادها وأقربُ منشوراتها، والزرُّ يتبع الحال — وبلا خطّةٍ «ابنِ خطّة»', async () => {
    const { cookie } = await session()
    const html = await (await app.request('/panel', { headers: { Cookie: cookie } }, env)).text()
    expect(html).toContain('class="card home-plan"')
    expect(html).toContain('مسوّدة · الإصدار 1')
    expect(html).toContain('<b>1</b> من 3 معتمَدة')
    expect(html).not.toContain('خطّة منتهية')
    expect(html).toContain('href="/panel/plan/review">تابع الكتابة</a>')
    expect(html).toContain('class="hp-next"')
    // ‏و«اليوم بالأرقام» في المطويّ لا أعلى الرئيسيّة
    expect(html.indexOf('اليوم بالأرقام</h2>')).toBeGreaterThan(html.indexOf('id="ops"'))
    db.raw.exec("UPDATE plans SET status = 'superseded'")
    const none = await (await app.request('/panel', { headers: { Cookie: cookie } }, env)).text()
    expect(none).toContain('href="/panel/plan/new">ابنِ خطّة</a>')
  })

  it('إذنٌ انتهى: الشريطُ يقوله، والرئيسيّةُ زرٌّ صغيرٌ بجانب التحيّة لا بطاقةٌ حمراء', async () => {
    db.raw.exec("UPDATE accounts SET status = 'needs_reauth'")
    const { cookie } = await session()
    const html = await (await app.request('/panel', { headers: { Cookie: cookie } }, env)).text()
    // ‏‏D-381 (§4.4): التنبيهُ الواحدُ أعلى الصفحة يحمل الزرّ، فلا يُعاد بجانب التحيّة ولا صفًّا في «ما ينتظرك»
    expect(html).not.toContain('class="todo-next" data-tone="bad"')
    expect(html.match(/class="sys-banner /g)).toHaveLength(1)
    expect(html).not.toContain('href="/oauth/linkedin/start">جدّد إذن LinkedIn</a>')
    expect(html).not.toContain('card-alert next is-slim" data-tone="bad"')
  })
})

describe('«الخطّة» وجهةٌ واحدة (D-289)', () => {
  it('تفتح شاشةَ الخطّة مسوّدةً ومثبَّتةً (D-327: فيها الاعتماد)، و«خطّة جديدة» بلا خطّة', async () => {
    const { cookie } = await session()
    const go = async () => (await app.request('/panel/plan', { headers: { Cookie: cookie } }, env)).headers.get('Location')
    expect(await go()).toBe('/panel/plan/review')
    db.raw.exec("UPDATE plans SET locked_at = datetime('now')")
    expect(await go()).toBe('/panel/plan/review')
    db.raw.exec("UPDATE plans SET status = 'superseded'")
    expect(await go()).toBe('/panel/plan/new')
  })
})

/**
 * **نظامُ أرقامٍ واحد في وحدة الخطّة** (D-323 · GLOSSARY): كانت المراجعةُ والعرضُ والمعالجُ وبطاقةُ الرئيسيّة تكتب
 * بـ`toLocaleString('ar-EG')` فتُرسَم «١ معتمَدةً من ٣» و«الأحد، ٤ يناير» بجوار «07:00».
 */
describe('أرقامُ الخطّة غربيّة (D-323)', () => {
  it('المراجعةُ والعرضُ والمعالجُ والرئيسيّةُ بلا رقمٍ هنديّ', async () => {
    const { cookie } = await session()
    for (const path of ['/panel/plan/review', '/panel/plan/new', '/panel']) {
      const html = (await (await app.request(path, { headers: { Cookie: cookie } }, env)).text())
        .replace(/<(script|style)\b[\s\S]*?<\/\1>/g, '')
      const hits = [...html.matchAll(/[^<>]{0,30}[\u0660-\u0669\u06F0-\u06F9]+[^<>]{0,30}/g)].map((m) => m[0].trim())
      expect(hits, path).toEqual([])
    }
  })
})

describe('ما تعذّرت كتابتُه يُقال ولا يُنتظر (PL-23)', () => {
  it('بندٌ سقطت كتابتُه: سببُه على بطاقته وفي سطر التقدّم، ولا تحديثَ حيًّا له، و«أعد كتابة ما تعذّر» يرسله ثانيةً', async () => {
    db.raw.exec(`INSERT INTO audit_log (org_id, actor, action, target, detail) VALUES ('org_owner', 'system', 'plan.draft.failed', 'pl1|s2:x', 'مفتاحُ خدمة الكتابة مرفوض')`)
    const { cookie, csrf } = await session()
    const html = await (await app.request('/panel/plan/review', { headers: { Cookie: cookie } }, env)).text()
    expect(html).toContain('تعذّرت كتابتُه: مفتاحُ خدمة الكتابة مرفوض')
    // ‏والعدُّ «كُتب س من ص» في سطر الحالة وحدَه (§6.2)، وسطرُ التقدّم يقول ما تعذّر وسببَه
    expect(html).toContain('تعذّرت كتابةُ 1: مفتاحُ خدمة الكتابة مرفوض')
    expect(html).not.toContain('صدى يكتب الباقي الآن')
    expect(html).not.toContain('data-live="write"')
    expect(html).toContain('أعد كتابة ما تعذّر (1)')
    const sent: unknown[] = []
    env['GENERATE_QUEUE'] = { send: async (b: unknown) => { sent.push(b) }, sendBatch: async (b: { body: unknown }[]) => { for (const m of b) sent.push(m.body) } }
    const r = await app.request('/panel/plan/review/redraft', { method: 'POST', body: form({ _csrf: csrf, id: 'pl1' }), headers: { Cookie: cookie } }, env)
    expect(r.status).toBe(303)
    expect(sent).toHaveLength(1)
    expect(JSON.stringify(sent[0])).toContain('"platform":"x"')
  })
})

describe('شاشاتُ الخطّة الأربع: أفعالُ الخطّة والمتابعةُ والإلغاء', () => {
  it('المراجعةُ فيها «أفعال الخطّة» (تابع · اعرض · أعد البناء · ألغِ)، والمتابعةُ تجمع المجدولَ والمنشور، والإلغاءُ يرفض المسوّدات ويُبقي المجدول', async () => {
    const { cookie, csrf } = await session()
    const html = await (await app.request('/panel/plan/review', { headers: { Cookie: cookie } }, env)).text()
    for (const s of ['أفعال الخطّة', 'href="/panel/plan/follow"', 'أعد بناء الخطّة', 'action="/panel/plan/cancel"']) expect(html).toContain(s)
    db.raw.exec("UPDATE posts SET status = 'queued', account_id = 'a1', scheduled_at = '2099-01-04 07:00:00' WHERE id = 'p2'")
    const follow = await (await app.request('/panel/plan/follow', { headers: { Cookie: cookie } }, env)).text()
    expect(follow).toContain('متابعةُ الخطّة')
    expect(follow).toContain('href="/panel/journey/p2"')
    expect(follow).toContain('تنتظر قرارك في المراجعة')
    const r = await app.request('/panel/plan/cancel', { method: 'POST', body: form({ _csrf: csrf, id: 'pl1' }), headers: { Cookie: cookie } }, env)
    expect(r.headers.get('Location')).toBe('/panel/plan/new')
    expect(db.raw.prepare("SELECT status FROM posts WHERE id = 'p1'").get()).toEqual({ status: 'rejected' })
    expect(db.raw.prepare("SELECT status FROM posts WHERE id = 'p2'").get()).toEqual({ status: 'queued' })
    expect(db.raw.prepare("SELECT status FROM plans WHERE id = 'pl1'").get()).toEqual({ status: 'superseded' })
  })
})

/**
 * **بندُ الخطّة بتوقيت المالك في كلّ مكان** (D-384): خطّةُ معالجٍ بأوقات 09:00 لـ LinkedIn و20:00 لـ X في الرياض كانت تُحفظ
 * بـ UTC ثمّ تُحوَّل ثانيةً عند الجدولة، فخرج المنشوران في 03:00Z و14:00Z، وقال الفحصُ «06:00 داخل ساعات الهدوء».
 */
describe('أوقاتُ الخطّة بتوقيت المالك (D-384)', () => {
  beforeEach(() => {
    db.raw.exec("UPDATE plans SET status = 'superseded'; DELETE FROM posts")
    db.raw.exec(`INSERT INTO accounts (id, platform, kind, external_id, display_name, status) VALUES ('a2', 'x', 'member', 'e2', 'عمر', 'active')`)
    db.raw.exec(`INSERT INTO settings (key, value, updated_by, updated_at, org_id) VALUES ('owner_tz', 'Asia/Riyadh', 'browser', datetime('now'), 'org_owner')`)
    const items = [
      { id: 'llllllllll', sourceId: 's1', platform: 'linkedin', kind: 'text', angle: 'زاويةُ LinkedIn', day: '2099-11-22', time: '09:00', why: 'ل' },
      { id: 'xxxxxxxxxx', sourceId: 's2', platform: 'x', kind: 'text', angle: 'زاويةُ X', day: '2099-11-22', time: '20:00', why: 'ل' },
    ]
    db.raw.prepare(`INSERT INTO plans (id, week_start, plan_json, model, status, span, choices_json) VALUES ('pl9', '2099-11-22', ?, 'm', 'draft', 'week', ?)`)
      .run(JSON.stringify({ rationale: 'ر', items }), JSON.stringify({ channels: ['linkedin', 'x'], times: { linkedin: ['09:00'], x: ['20:00'] }, zone: 'Asia/Riyadh' }))
    const text = (n: string): string => `نصُّ منشور ${n} كما كُتب من زاويته ليُعتمَد، وفيه ما يكفي من الكلام ليكون منشورًا حقيقيًّا يقرؤه الناس.`
    const ins = db.raw.prepare(`INSERT INTO posts (id, platform, type, text, status, idempotency_key, plan_id, source_id, source_refs) VALUES (?, ?, 'text', ?, 'draft', ?, 'pl9', ?, ?)`)
    ins.run('w1', 'linkedin', text('LinkedIn'), 'draft:s1:linkedin:h:i:llllllllll', 's1', JSON.stringify(['s1', 'item:llllllllll']))
    ins.run('w2', 'x', 'جملةُ X من زاويتها، وفيها ما يكفي ليُقرأ ويُعتمَد.', 'draft:s2:x:h:i:xxxxxxxxxx', 's2', JSON.stringify(['s2', 'item:xxxxxxxxxx']))
  })

  it('المراجعةُ تُري 09:00 و20:00، ولا «ساعات هدوء» لـ 09:00، والاعتمادُ يجدول في 06:00Z و17:00Z', async () => {
    const { cookie, csrf } = await session()
    const html = await (await app.request('/panel/plan/review?w=all', { headers: { Cookie: cookie } }, env)).text()
    expect(html).toContain('09:00')
    expect(html).toContain('20:00')
    expect(html).not.toContain('06:00')
    expect(html).not.toContain('داخل ساعات الهدوء')
    const approve = form({ _csrf: csrf, id: 'pl9', do: 'approve' })
    approve.append('sel', `0|${keyOf(html, 0)}|w1`); approve.append('sel', `1|${keyOf(html, 1)}|w2`)
    await app.request('/panel/plan/review/bulk', { method: 'POST', body: approve, headers: { Cookie: cookie } }, env)
    expect(db.raw.prepare('SELECT id, status, scheduled_at FROM posts ORDER BY id').all()).toEqual([
      { id: 'w1', status: 'queued', scheduled_at: '2099-11-22 06:00:00' },
      { id: 'w2', status: 'queued', scheduled_at: '2099-11-22 17:00:00' },
    ])
  })

  it('«اعتمد المحدّد» يترك ما بُتّ فيه من قبل ويعدّه وحدَه — لا «تعذّر»، والنبرةُ سليمة', async () => {
    db.raw.exec("UPDATE posts SET status = 'queued', scheduled_at = '2099-11-22 06:00:00', account_id = 'a1', approved_by = 'owner', approved_at = datetime('now') WHERE id = 'w1'")
    const { cookie, csrf } = await session()
    const html = await (await app.request('/panel/plan/review?w=all', { headers: { Cookie: cookie } }, env)).text()
    const approve = form({ _csrf: csrf, id: 'pl9', do: 'approve' })
    approve.append('sel', `0|${keyOf(html, 0)}|w1`); approve.append('sel', `1|${keyOf(html, 1)}|w2`)
    await app.request('/panel/plan/review/bulk', { method: 'POST', body: approve, headers: { Cookie: cookie } }, env)
    const after = await (await app.request('/panel/plan/review?w=all', { headers: { Cookie: cookie } }, env)).text()
    expect(after).toContain('اعتُمد 1 · 1 مجدولة من قبل فتُركت.')
    expect(after).not.toMatch(/اعتُمد [^<]*تعذّر/)
    expect(after).not.toContain('والبَتّ للمسوّدة وحدها')
  })

  it('خطّةٌ قديمةٌ بـ UTC (قبل 0064) تُحوَّل إلى توقيت المالك مرّةً واحدة', async () => {
    db.raw.exec("UPDATE plans SET time_basis = 'utc', plan_json = replace(replace(plan_json, '\"09:00\"', '\"06:00\"'), '\"20:00\"', '\"17:00\"') WHERE id = 'pl9'")
    const { cookie } = await session()
    await app.request('/panel/plan/review?w=all', { headers: { Cookie: cookie } }, env)
    await app.request('/panel/plan/review?w=all', { headers: { Cookie: cookie } }, env)
    const row = db.raw.prepare("SELECT time_basis, plan_json FROM plans WHERE id = 'pl9'").get() as { time_basis: string; plan_json: string }
    expect(row.time_basis).toBe('local')
    expect((JSON.parse(row.plan_json) as { items: { time: string }[] }).items.map((i) => i.time)).toEqual(['09:00', '20:00'])
  })
})

/** مصدرٌ يُضاف الآن (D-284): الرفعُ والرابطُ والتنزيلُ من المسارات، بقاعدةٍ حقيقيّةٍ وR2 مزيّف. */
import { beforeEach, describe, expect, it } from 'vitest'
import { emailLogin } from '../test/emailLogin'
import { toBase64 } from '../lib/crypto'
import { fakeDb, fakeKv, type FakeDb } from '../test/fakes'
import { PLAN_NEW_SCRIPT } from './ui/planNewView'
import { app } from '../index'

let db: FakeDb
let env: Record<string, unknown>
let objects: Map<string, Uint8Array>

const TEXT = 'فقرةٌ عن قيادة المحافظ وقياس الأثر في المؤسّسات غير الربحيّة. '.repeat(10)

beforeEach(() => {
  db = fakeDb()
  objects = new Map()
  env = {
    SADA_ENV: 'staging', PUBLIC_BASE_URL: 'https://sada2.basserh.com', DRIVE_FOLDER_ID: 'folder',
    DB: db, KV: fakeKv(), TOKEN_ENC_KEY: toBase64(crypto.getRandomValues(new Uint8Array(32))), ADMIN_TOKEN: 'Yk3pQ9vX2mLsA7nR4tWfZ8cB6dH1jG0e',
    MEDIA: {
      async put(key: string, value: string | Uint8Array | ArrayBuffer) {
        objects.set(key, typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value as ArrayBuffer))
        return null
      },
      async get(key: string) {
        const v = objects.get(key)
        return v === undefined ? null : { body: v, text: async () => new TextDecoder().decode(v) }
      },
    },
  }
})

async function session(): Promise<{ cookie: string; csrf: string }> {
  const cookie = ((await emailLogin(app, env)).headers.get('Set-Cookie') ?? '').split(';')[0]!
  const html = await (await app.request('/panel/plan/new', { headers: { Cookie: cookie } }, env)).text()
  return { cookie, csrf: /name="_csrf" value="([^"]+)"/.exec(html)?.[1] ?? '' }
}

function upload(csrf: string, name: string, content: string, ret = 'plan'): FormData {
  const body = new FormData()
  body.set('_csrf', csrf); body.set('return', ret)
  body.set('file', new File([content], name, { type: 'text/plain' }))
  return body
}

describe('رفعُ ملفٍّ من المعالج', () => {
  it('يُحفظ ويُعاد JSON بحاله — وبلا مزوّدٍ «حُفظ ولم يُحلَّل» لا نجاحٌ مدّعى', async () => {
    const { cookie, csrf } = await session()
    const res = await app.request('/panel/sources/upload', { method: 'POST', body: upload(csrf, 'ملاحظات.txt', TEXT), headers: { Cookie: cookie, Accept: 'application/json' } }, env)
    expect(res.status).toBe(200)
    const out = await res.json() as { ok: boolean; id: string; name: string; ready: boolean; note: string }
    expect(out).toMatchObject({ ok: true, name: 'ملاحظات.txt', ready: false })
    expect(out.note).toContain('حُفظ')
    expect(db.raw.prepare("SELECT kind, org_id FROM sources WHERE id = ?").get(out.id)).toEqual({ kind: 'upload', org_id: 'org_owner' })
    expect((db.raw.prepare("SELECT detail FROM audit_log WHERE action = 'source.upload'").get() as { detail: string }).detail).toMatch(/^added · (failed|blocked)$/)
  })

  it('بلا سكربت: يعود إلى المعالج برسالة، والرفضُ يُقال بسببه', async () => {
    const { cookie, csrf } = await session()
    const ok = await app.request('/panel/sources/upload', { method: 'POST', body: upload(csrf, 'ملاحظات.txt', TEXT), headers: { Cookie: cookie } }, env)
    expect(ok.status).toBe(303)
    expect(ok.headers.get('Location')).toMatch(/^\/panel\/plan\/new\?picked=src%3Aupload%3A/)
    const bad = await app.request('/panel/sources/upload', { method: 'POST', body: upload(csrf, 'برنامج.exe', 'x'), headers: { Cookie: cookie, Accept: 'application/json' } }, env)
    expect(bad.status).toBe(422)
    expect(((await bad.json()) as { reason: string }).reason).toContain('لا تُقرأ')
    // ‏و`return` لا يقبل عنوانًا يكتبه أحد
    const odd = await app.request('/panel/sources/upload', { method: 'POST', body: upload(csrf, 'ب.txt', TEXT + 'ب', 'https://evil.example'), headers: { Cookie: cookie } }, env)
    expect(odd.headers.get('Location')).toBe('/panel/library#sources')
  })

  it('الأصلُ يُنزَّل كما رُفع، ومن منظّمته وحدَها', async () => {
    const { cookie, csrf } = await session()
    const res = await app.request('/panel/sources/upload', { method: 'POST', body: upload(csrf, 'تقرير.txt', TEXT), headers: { Cookie: cookie, Accept: 'application/json' } }, env)
    const { id } = await res.json() as { id: string }
    const file = await app.request(`/panel/sources/${encodeURIComponent(id)}/file`, { headers: { Cookie: cookie } }, env)
    expect(file.status).toBe(200)
    expect(file.headers.get('Content-Disposition')).toContain(encodeURIComponent('تقرير.txt'))
    expect(await file.text()).toBe(TEXT)
    db.raw.prepare("UPDATE sources SET org_id = 'org_other' WHERE id = ?").run(id)
    expect((await app.request(`/panel/sources/${encodeURIComponent(id)}/file`, { headers: { Cookie: cookie } }, env)).status).toBe(404)
  })
})

describe('رابطٌ من المعالج', () => {
  it('يردّ ما ليس https قبل أيّ نداء', async () => {
    const { cookie, csrf } = await session()
    const body = new FormData()
    body.set('_csrf', csrf); body.set('url', 'http://example.com/a')
    const res = await app.request('/panel/sources/link', { method: 'POST', body, headers: { Cookie: cookie, Accept: 'application/json' } }, env)
    expect(res.status).toBe(422)
    expect(db.raw.prepare('SELECT count(*) AS n FROM sources').get()).toEqual({ n: 0 })
  })
})

describe('مجموعةُ مصادر في طلبٍ واحد (D-327)', () => {
  it('ملفّان معًا بلا سكربت: كلٌّ يُحفظ بطريقه، والمرفوضُ يُسمّى ولا يُسقط غيرَه', async () => {
    const { cookie, csrf } = await session()
    const body = upload(csrf, 'أوّل.txt', TEXT)
    body.append('file', new File([TEXT + ' ثانٍ'], 'ثانٍ.txt', { type: 'text/plain' }))
    body.append('file', new File(['x'], 'برنامج.exe', { type: 'application/octet-stream' }))
    const res = await app.request('/panel/sources/upload', { method: 'POST', body, headers: { Cookie: cookie } }, env)
    expect(res.status).toBe(303)
    expect(res.headers.get('Location')).toBe('/panel/plan/new')
    expect(db.raw.prepare("SELECT name FROM sources ORDER BY name").all()).toEqual([{ name: 'أوّل.txt' }, { name: 'ثانٍ.txt' }])
    expect(db.raw.prepare("SELECT count(*) AS n FROM audit_log WHERE action = 'source.upload'").get()).toEqual({ n: 3 })
    const back = await (await app.request('/panel/plan/new', { headers: { Cookie: cookie } }, env)).text()
    // ‏بلا مزوّدِ تحليلٍ في الاختبار: حُفظ الملفّان ولم يُحلَّلا، والثالثُ رُفض — والعددُ وأوّلُ سببين يُقالان في المعالج نفسِه
    expect(back).toContain('أُضيف 0 من 3')
    expect(back).toContain('وتعذّر 3')
    expect(back).toContain('«أوّل.txt»')
  })

  it('روابطُ بسطرٍ لكلٍّ: كلٌّ يُفحص وحدَه، والمكرَّرُ مرّةً، وما ليس https يُردّ بسببه', async () => {
    const { cookie, csrf } = await session()
    const body = new FormData()
    body.set('_csrf', csrf); body.set('return', 'plan'); body.set('url', 'http://example.com/a\nhttp://example.com/b\nhttp://example.com/a')
    const res = await app.request('/panel/sources/link', { method: 'POST', body, headers: { Cookie: cookie } }, env)
    expect(res.headers.get('Location')).toBe('/panel/plan/new')
    expect(db.raw.prepare("SELECT count(*) AS n FROM audit_log WHERE action = 'source.link'").get()).toEqual({ n: 2 })
    expect(db.raw.prepare('SELECT count(*) AS n FROM sources').get()).toEqual({ n: 0 })
  })

  it('المعالجُ يقبل عدّةَ ملفّاتٍ وعدّةَ روابط، ويذكر الموقعَ والمقطع', async () => {
    const { cookie } = await session()
    const html = await (await app.request('/panel/plan/new', { headers: { Cookie: cookie } }, env)).text()
    expect(html).toMatch(/<input type="file" name="file" form="pn-up"[^>]* multiple>/)
    expect(html).toMatch(/<textarea id="pn-url" name="url" form="pn-link"/)
    for (const s of ['.srt', 'مقطع YouTube', 'موقعٌ (يُقرأ مع صفحاته التعريفيّة)']) expect(html).toContain(s)
  })

  it('المعاينةُ الحيّة بجانب المعالج (D-331): مخفيّةٌ بلا سكربت، وقوالبُ شعاراتها من الخادم، ونموذجا الإضافة خارج شبكتها', async () => {
    db.raw.exec(`INSERT INTO accounts (id, platform, kind, external_id, display_name, status) VALUES ('a9', 'linkedin', 'member', 'e9', 'عمر', 'active')`)
    const { cookie } = await session()
    const html = await (await app.request('/panel/plan/new', { headers: { Cookie: cookie } }, env)).text()
    expect(html).toMatch(/<div class="wz-grid"><form method="POST" action="\/panel\/plan\/generate"/)
    expect(html).toContain('<div class="wz-pv" id="pn-pv" hidden>')
    expect(html).toContain('<template id="pn-logo-linkedin">')
    // ‏نموذجا الإضافة بعد الشبكة لا فيها: كلٌّ منهما كان خانةً تُنزل المعاينةَ تحت المعالج
    expect(html.indexOf('id="pn-up"')).toBeGreaterThan(html.indexOf('id="pn-pv"'))
    // ‏ومتغيّرُ شبكة المعاينة باسمه: كان «grid» فاصطدم بقائمة المصادر في السكربت نفسِه، ومحاها عند كلّ اختيار
    expect(PLAN_NEW_SCRIPT.match(/[ ,]grid=/g)).toHaveLength(1)
    expect(PLAN_NEW_SCRIPT).toContain("pvGrid=document.getElementById('pn-pv-grid')")
  })
})

describe('المعالج', () => {
  it('يحمل بابَي الإضافة بنموذجين مستقلّين، وشاراتِ الأنواع، والمصدرُ المضافُ للتوّ محدَّد', async () => {
    db.raw.exec(`INSERT INTO sources (id, drive_file_id, name, mime, content_hash, kind) VALUES
      ('src:upload:u1', 'upload:u1', 'تقرير.pdf', 'application/pdf', 'sha256:a', 'upload'),
      ('src:url:l1', 'url:l1', 'مقال', 'text/html', 'sha256:b', 'url')`)
    db.raw.exec(`INSERT INTO content_items (id, source_id, summary, themes_json, worth_score) VALUES
      ('c1', 'src:upload:u1', 'خ', '{"hash":"sha256:a"}', 0.7), ('c2', 'src:url:l1', 'خ', '{"hash":"sha256:b"}', 0.6)`)
    const { cookie } = await session()
    const html = await (await app.request('/panel/plan/new?picked=src%3Aupload%3Au1', { headers: { Cookie: cookie } }, env)).text()
    expect(html).toContain('id="pn-up"')
    expect(html).toContain('action="/panel/sources/upload" enctype="multipart/form-data"')
    expect(html).toContain('form="pn-link"')
    expect(html).toContain('name="source" value="src:upload:u1" checked')
    expect(html).toContain('data-start="3"')
    for (const s of ['>مرفوع<', '>رابط<']) expect(html).toContain(s)
    // ‏ومعرّفٌ ليس من المحلَّل لا يُحدَّد ولا يُفتح عليه
    const odd = await (await app.request('/panel/plan/new?picked=x', { headers: { Cookie: cookie } }, env)).text()
    expect(odd).not.toContain('data-start="3"')
  })
})

describe('نفدت الحصّةُ المجّانيّة — والقرارُ للمالك (D-285)', () => {
  it('البطاقةُ بعددها وكلفتها، و«انتظر» يُسجَّل فتصير سطرًا، و«ادفع» إذنٌ لليوم', async () => {
    db.raw.exec(`INSERT INTO posts (id, platform, type, text, status, idempotency_key) VALUES ('p1', 'linkedin', 'text', 'نص', 'draft', 'k1')`)
    db.raw.exec(`INSERT INTO audit_log (actor, action, target, detail, org_id) VALUES ('system', 'image.quota_wait', 'p1', 'final · 1364', 'org_owner')`)
    const { cookie, csrf } = await session()
    const before = await (await app.request('/panel', { headers: { Cookie: cookie } }, env)).text()
    expect(before).toContain('نفدت حصّةُ الصور المجّانيّة اليوم')
    expect(before).toContain('0.015$')
    const wait = new FormData(); wait.set('_csrf', csrf); wait.set('decision', 'wait')
    expect((await app.request('/panel/images/quota', { method: 'POST', body: wait, headers: { Cookie: cookie } }, env)).status).toBe(303)
    const after = await (await app.request('/panel', { headers: { Cookie: cookie } }, env)).text()
    expect(after).not.toContain('نفدت حصّةُ الصور المجّانيّة اليوم')
    expect(after).toContain('تنتظر تجدّدَ حصّة Cloudflare')
    const pay = new FormData(); pay.set('_csrf', csrf); pay.set('decision', 'pay')
    await app.request('/panel/images/quota', { method: 'POST', body: pay, headers: { Cookie: cookie } }, env)
    expect(db.raw.prepare("SELECT action FROM audit_log WHERE action LIKE 'image.overage.%' ORDER BY id").all()).toEqual([
      { action: 'image.overage.wait' }, { action: 'image.overage.approve' },
    ])
  })

  it('المعالجُ يعرض الأنواعَ الثلاثة بكلفتها وما بقي مجّانيًّا', async () => {
    const { cookie } = await session()
    const html = await (await app.request('/panel/plan/new', { headers: { Cookie: cookie } }, env)).text()
    for (const v of ['none', 'infographic', 'illustration']) expect(html).toContain(`name="image_style" value="${v}"`)
    expect(html).toContain('بقي 173 اليوم')
    expect(html).toContain('بقي 7 اليوم، ثمّ')
    expect(html).toContain('0.015$')
  })
})

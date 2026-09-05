/**
 * اللوحة تُختبَر من طرفها إلى طرفها: القاعدة حقيقيّة و KV حقيقيّ،
 * والصفحة تُقرأ كنصٍّ كما يراها المتصفّح.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { toBase64 } from '../lib/crypto'
import { readSettings } from '../lib/settings'
import { COOKIE } from '../lib/session'
import { fakeDb, fakeKv, type FakeDb } from '../test/fakes'
import { app } from '../index'

const TOKEN = 'Yk3pQ9vX2mLsA7nR4tWfZ8cB6dH1jG0e'
const KEY = toBase64(crypto.getRandomValues(new Uint8Array(32)))

let db: FakeDb
let kv: ReturnType<typeof fakeKv>
let env: Record<string, unknown>

beforeEach(() => {
  db = fakeDb()
  kv = fakeKv()
  env = {
    SADA_ENV: 'staging',
    PUBLIC_BASE_URL: 'https://sada2.basserh.com',
    DRIVE_FOLDER_ID: 'folder',
    DB: db,
    KV: kv,
    TOKEN_ENC_KEY: KEY,
    ADMIN_TOKEN: TOKEN,
  }
})

async function login(): Promise<string> {
  const body = new FormData()
  body.set('token', TOKEN)
  const response = await app.request('/panel/login', { method: 'POST', body }, env)
  expect(response.status).toBe(303)
  const cookie = response.headers.get('Set-Cookie') ?? ''
  return cookie.split(';')[0]!
}

function withSession(cookie: string, init: RequestInit = {}): RequestInit {
  return { ...init, headers: { ...(init.headers ?? {}), Cookie: cookie } }
}

async function seedSource(name: string, hash = 'md5:a'): Promise<string> {
  const id = crypto.randomUUID()
  await db
    .prepare('INSERT INTO sources (id, drive_file_id, name, mime, content_hash) VALUES (?, ?, ?, ?, ?)')
    .bind(id, `drive-${id.slice(0, 5)}`, name, 'application/vnd.google-apps.document', hash)
    .run()
  return id
}

describe('الدخول', () => {
  it('بلا جلسة تُعرض صفحة الدخول لا اللوحة', async () => {
    const response = await app.request('/panel', {}, env)
    expect(response.status).toBe(200)
    const html = await response.text()
    expect(html).toContain('رمز الإدارة')
    expect(html).not.toContain('لوحة التحكّم')
  })

  it('رمزٌ خطأ يردّ 401 ولا يُنشئ جلسة', async () => {
    const body = new FormData()
    body.set('token', 'wrong')
    const response = await app.request('/panel/login', { method: 'POST', body }, env)
    expect(response.status).toBe(401)
    expect(response.headers.get('Set-Cookie')).toBeNull()
    expect(kv.size()).toBe(0)
  })

  it('بلا ADMIN_TOKEN اللوحة مقفلة لا مفتوحة', async () => {
    const body = new FormData()
    body.set('token', 'anything')
    const response = await app.request('/panel/login', { method: 'POST', body }, { ...env, ADMIN_TOKEN: '' })
    expect(response.status).toBe(401)
    expect(await response.text()).toContain('مقفلة')
  })

  it('الرمز الصحيح يعطي كعكة بقيودها الثلاثة', async () => {
    const body = new FormData()
    body.set('token', TOKEN)
    const response = await app.request('/panel/login', { method: 'POST', body }, env)
    const cookie = response.headers.get('Set-Cookie') ?? ''
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Strict')
    expect(cookie).toContain('Secure')
    expect(cookie).toContain('Path=/panel')
  })

  it('الخروج يُبطل الجلسة فورا', async () => {
    const cookie = await login()
    await app.request('/panel/logout', withSession(cookie, { method: 'POST' }), env)
    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).toContain('رمز الإدارة')
  })
})

describe('اللوحة لا تسرّب', () => {
  it('لا رمز إدارةٍ ولا مفتاح مزوّدٍ في الصفحة', async () => {
    const cookie = await login()
    const html = await (
      await app.request('/panel', withSession(cookie), {
        ...env,
        ANTHROPIC_API_KEY: 'sk-ant-قيمة-سرّية',
        GEMINI_API_KEY: 'AIzaSyسرّ',
      })
    ).text()
    expect(html).not.toContain(TOKEN)
    expect(html).not.toContain('sk-ant-قيمة')
    expect(html).not.toContain('AIzaSy')
  })

  it('اسم ملفٍّ يحمل HTML يُهرَب ولا يُحقَن', async () => {
    await seedSource('<img src=x onerror=alert(1)>تقرير')
    const cookie = await login()
    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).not.toContain('<img src=x onerror')
    expect(html).toContain('&lt;img src=x onerror')
  })
})

describe('ما تعرضه اللوحة', () => {
  it('تعرض حال «يعمل» وتقرأ السقوف من القاعدة', async () => {
    const cookie = await login()
    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).toContain('يعمل')
    expect(html).toContain('لوحة التحكّم')
    expect(html).toContain('سقف التحليل اليوميّ')
  })

  it('تعرض المصادر وحالها', async () => {
    await seedSource('تقرير الأثر')
    const cookie = await login()
    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).toContain('تقرير الأثر')
    expect(html).toContain('ينتظر')
  })

  it('تُعلّم ما تغيّر بعد تحليله بائتا', async () => {
    const id = await seedSource('تقرير', 'md5:جديد')
    await db
      .prepare('INSERT INTO content_items (id, source_id, summary, themes_json, worth_score) VALUES (?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), id, 'خلاصة', JSON.stringify({ hash: 'md5:قديم', themes: [] }), 0.8)
      .run()
    const cookie = await login()
    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).toContain('تغيّر بعد التحليل')
  })

  it('تعرض الخلاصة وسبب الدرجة — لا الرقم وحده', async () => {
    const id = await seedSource('تقرير', 'md5:a')
    await db
      .prepare('INSERT INTO content_items (id, source_id, summary, themes_json, worth_score) VALUES (?, ?, ?, ?, ?)')
      .bind(
        crypto.randomUUID(),
        id,
        'خلاصةٌ عربية للمصدر',
        JSON.stringify({ hash: 'md5:a', themes: ['الوقف'], reason: 'رقمٌ من الميدان' }),
        0.82,
      )
      .run()
    const cookie = await login()
    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).toContain('خلاصةٌ عربية للمصدر')
    expect(html).toContain('رقمٌ من الميدان')
    expect(html).toContain('الوقف')
    expect(html).toContain('0.82')
  })

  it('تقول إنّ طبقة الكتابة لم تُبنَ — لا تعرض جدولا فارغا يُظنّ عطلا', async () => {
    const cookie = await login()
    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).toContain('طبقة الكتابة لم تُبنَ بعد')
  })

  it('تسمّي السرّ الناقص لمزوّدٍ غير مضبوط', async () => {
    const cookie = await login()
    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).toContain('ANTHROPIC_API_KEY')
    expect(html).toContain('مفتاحه ناقص')
  })

  it('صفٌّ بتحليلٍ فاسد لا يُسقط اللوحة', async () => {
    const id = await seedSource('تقرير')
    await db
      .prepare('INSERT INTO content_items (id, source_id, summary, themes_json, worth_score) VALUES (?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), id, 'خلاصة', 'ليس json', 0.5)
      .run()
    const response = await app.request('/panel', withSession(await login()), env)
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('تقرير')
  })
})

describe('الأزرار تغيّر القاعدة فعلا', () => {
  async function submit(cookie: string, key: string, value: string): Promise<Response> {
    const body = new FormData()
    body.set('key', key)
    body.set('value', value)
    return app.request('/panel/settings', withSession(cookie, { method: 'POST', body }), env)
  }

  it('زرّ الإيقاف يرفع المفتاح في القاعدة', async () => {
    const cookie = await login()
    expect((await submit(cookie, 'paused', 'true')).status).toBe(303)
    expect((await readSettings(db)).paused).toBe(true)

    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).toContain('موقوف مؤقتا')
    expect(html).toContain('استئناف العمل')
  })

  it('السقف يُحفظ ويُقرأ', async () => {
    const cookie = await login()
    await submit(cookie, 'daily_analysis_cap', '25')
    expect((await readSettings(db)).dailyAnalysisCap).toBe(25)
  })

  it('قيمةٌ فوق الحدّ تُقصّ ولا تُرفض — فلا يضيع قصد المالك كلّه', async () => {
    const cookie = await login()
    await submit(cookie, 'daily_analysis_cap', '999999')
    expect((await readSettings(db)).dailyAnalysisCap).toBe(500)
  })

  it('مفتاحٌ غير مسموحٍ به يُرفض — قائمة سماحٍ لا منع', async () => {
    const cookie = await login()
    const response = await submit(cookie, 'token_enc_key', 'سرقة')
    expect(response.status).toBe(400)
    const row = db.raw.prepare("SELECT * FROM settings WHERE key = 'token_enc_key'").get()
    expect(row).toBeUndefined()
  })

  it('بلا جلسة لا يُغيَّر شيء', async () => {
    const body = new FormData()
    body.set('key', 'paused')
    body.set('value', 'true')
    const response = await app.request('/panel/settings', { method: 'POST', body }, env)
    expect(response.status).toBe(401)
    expect((await readSettings(db)).paused).toBe(false)
  })

  it('كعكةٌ مزوّرة لا تُغيّر شيئا', async () => {
    const body = new FormData()
    body.set('key', 'paused')
    body.set('value', 'true')
    const response = await app.request(
      '/panel/settings',
      { method: 'POST', body, headers: { Cookie: `${COOKIE}=${crypto.randomUUID()}` } },
      env,
    )
    expect(response.status).toBe(401)
    expect((await readSettings(db)).paused).toBe(false)
  })
})

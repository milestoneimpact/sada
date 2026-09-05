/**
 * اللوحة تُختبَر من طرفها إلى طرفها: القاعدة حقيقيّة و KV حقيقيّ،
 * والصفحة تُقرأ كنصٍّ كما يراها المتصفّح.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { toBase64 } from '../lib/crypto'
import { readSettings } from '../lib/settings'
import { readRecord, resolveKey } from '../lib/providerKeys'
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
    // يُفحص السلوك لا الصياغة: حقلُ رمزٍ حاضر، وتنقّلُ اللوحة غائب
    expect(html).toContain('name="token"')
    expect(html).not.toContain('nav class="tabs"')
    expect(html).not.toContain('/panel/settings')
  })

  it('رمزٌ خطأ يردّ 401 ولا يُنشئ جلسة', async () => {
    const body = new FormData()
    body.set('token', 'wrong')
    const response = await app.request('/panel/login', { method: 'POST', body }, env)
    expect(response.status).toBe(401)
    expect(response.headers.get('Set-Cookie')).toBeNull()
    // ما في KV عدّادُ محاولةٍ لا جلسة
    expect(kv.ttlOf('login-attempts:unknown')).not.toBeNull()
  })

  it('يعدّ المحاولات ويحظر بعد خمس', async () => {
    const attempt = async (): Promise<Response> => {
      const body = new FormData()
      body.set('token', 'wrong')
      return app.request('/panel/login', { method: 'POST', body }, env)
    }
    for (let i = 0; i < 4; i += 1) expect((await attempt()).status).toBe(401)
    expect((await attempt()).status).toBe(401)

    const blocked = await attempt()
    expect(blocked.status).toBe(429)
    expect(await blocked.text()).toContain('حدّ المحاولات')
  })

  it('الحظر يمنع حتّى الرمز الصحيح — ولا يُنشئ جلسة', async () => {
    for (let i = 0; i < 5; i += 1) {
      const bad = new FormData()
      bad.set('token', 'wrong')
      await app.request('/panel/login', { method: 'POST', body: bad }, env)
    }
    const good = new FormData()
    good.set('token', TOKEN)
    const response = await app.request('/panel/login', { method: 'POST', body: good }, env)
    expect(response.status).toBe(429)
    expect(response.headers.get('Set-Cookie')).toBeNull()
  })

  it('النجاح يمحو العدّ — مَن أخطأ ثمّ أصاب لا يبقى محسوبا', async () => {
    const bad = new FormData()
    bad.set('token', 'wrong')
    await app.request('/panel/login', { method: 'POST', body: bad }, env)
    await login()
    expect(kv.ttlOf('login-attempts:unknown')).toBeNull()
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
    expect(html).toContain('سقف التحليل')
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

describe('الأفعال — واللوحة ليست طريقا جانبيّا حول الحارس', () => {
  async function post(cookie: string, path: string, fields: Record<string, string>): Promise<Response> {
    const body = new FormData()
    for (const [k, v] of Object.entries(fields)) body.set(k, v)
    return app.request(path, withSession(cookie, { method: 'POST', body }), env)
  }

  it('«حلّل الآن» يمرّ بالإيقاف — فيُمنع ولا يُلمس شيء', async () => {
    const id = await seedSource('تقرير')
    const cookie = await login()
    await post(cookie, '/panel/settings', { key: 'paused', value: 'true' })

    const response = await post(cookie, '/panel/analyze', { id })
    expect(response.status).toBe(303)

    // لا كلفة ولا تحليل: الحارس منع قبل أيّ عمل
    const cost = db.raw.prepare('SELECT count(*) AS n FROM cost_ledger').get() as { n: number }
    expect(cost.n).toBe(0)

    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).toContain('موقوف')
  })

  it('«حلّل الآن» يمرّ بالسقف أيضا', async () => {
    const id = await seedSource('تقرير')
    const cookie = await login()
    await post(cookie, '/panel/settings', { key: 'daily_analysis_cap', value: '0' })
    await post(cookie, '/panel/analyze', { id })
    const cost = db.raw.prepare('SELECT count(*) AS n FROM cost_ledger').get() as { n: number }
    expect(cost.n).toBe(0)
  })

  it('بلا جلسة لا فعل — لا مسحا ولا تحليلا', async () => {
    const body = new FormData()
    body.set('id', 'x')
    expect((await app.request('/panel/analyze', { method: 'POST', body }, env)).status).toBe(401)
    expect((await app.request('/panel/scan', { method: 'POST' }, env)).status).toBe(401)
  })

  it('فشلُ المسح يُبلَّغ ولا يُسقط اللوحة', async () => {
    const cookie = await login()
    // بلا GOOGLE_SA_JSON صالح يفشل المسح
    const response = await app.request('/panel/scan', withSession(cookie, { method: 'POST' }), env)
    expect(response.status).toBe(303)
    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).toContain('تعذّر المسح')
  })
})

describe('الإشعار — يقول ما وقع لا ما طُلب', () => {
  async function save(cookie: string, key: string, value: string): Promise<void> {
    const body = new FormData()
    body.set('key', key)
    body.set('value', value)
    await app.request('/panel/settings', withSession(cookie, { method: 'POST', body }), env)
  }

  it('يظهر بعد الحفظ ويذكر القيمة المحفوظة', async () => {
    const cookie = await login()
    await save(cookie, 'daily_analysis_cap', '25')
    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).toContain('حُفظ 25')
  })

  it('القيمة المقصوصة تُذكر بقصّها — لا يُقال «حُفظ» لما لم يُحفظ', async () => {
    const cookie = await login()
    await save(cookie, 'daily_analysis_cap', '999999')
    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).toContain('خارج المدى')
    expect(html).toContain('500')
  })

  it('يُقرأ مرّة ثمّ يُمحى — فلا يبقى معلّقا في كلّ تحميل', async () => {
    const cookie = await login()
    await save(cookie, 'daily_analysis_cap', '25')
    const first = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(first).toContain('حُفظ 25')
    const second = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(second).not.toContain('حُفظ 25')
  })

  it('لا يُقرأ من عنوان الصفحة — فلا يُلفَّق برابط', async () => {
    const cookie = await login()
    const html = await (
      await app.request('/panel?msg=تم%20الحذف&kind=ok', withSession(cookie), env)
    ).text()
    expect(html).not.toContain('تم الحذف')
  })
})

describe('نضج العرض', () => {
  it('الوقت نسبيّ والدقيق في title — لا طابعٌ خام وحده', async () => {
    await seedSource('تقرير')
    const cookie = await login()
    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).toMatch(/الآن|قبل /)
    expect(html).toContain('UTC')
  })

  it('الحالة تحمل رمزا ونصّا — لا لونا وحده', async () => {
    await seedSource('تقرير')
    const cookie = await login()
    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).toContain('class="g"')
    expect(html).toContain('ينتظر')
  })

  it('حالة الفراغ تحمل الفعل لا وصف الغياب وحده', async () => {
    const cookie = await login()
    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).toContain('لا مصادر بعد')
    expect(html).toContain('/panel/scan')
  })

  it('الإيقاف يسأل قبل أن يقع', async () => {
    const cookie = await login()
    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).toContain('data-confirm')
  })

  it('فيها تخطٍّ إلى المحتوى وتنقّلٌ مسمّى', async () => {
    const cookie = await login()
    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).toContain('تخطّي إلى المحتوى')
    expect(html).toContain('aria-label="أقسام اللوحة"')
    expect(html).toContain('aria-live="polite"')
  })
})

describe('اللون يتبع المرجع لا الذوق', () => {
  it('المقياس هيئةٌ واحدة — لا كهرمان فيه (يقع من الذهب على ΔE 7.2)', async () => {
    const cookie = await login()
    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    // لا صنف تحذيرٍ في المقياس؛ الأحمر وحده هو القفزة المسموحة
    expect(html).not.toContain('<i class="w"')
    expect(html).toContain('.bar i.f{background:var(--bad)}')
  })

  it('بلوغُ السقف يحمل نصّا لا لونا وحده', async () => {
    const cookie = await login()
    const body = new FormData()
    body.set('key', 'daily_analysis_cap')
    body.set('value', '0')
    await app.request('/panel/settings', withSession(cookie, { method: 'POST', body }), env)
    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).toContain('بلغ السقف')
  })
})

describe('مفتاح الإدراج الآليّ في اللوحة', () => {
  it('يظهر مطفأ ويشرح ما يقع إن رُفع', async () => {
    const cookie = await login()
    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).toContain('الإدراج الآليّ')
    expect(html).toContain('رفع الإدراج الآليّ')
    expect(html).toContain('مطفأ')
  })

  it('يسأل قبل رفعه ويذكر الحدّ في السؤال — فلا يُرفع بلا علم', async () => {
    const cookie = await login()
    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).toContain('سيبدأ إنفاقٌ يوميّ بلا أمرٍ منك')
    expect(html).toContain('data-confirm')
  })

  it('رفعُه يُحفظ ويُبلَّغ عنه', async () => {
    const cookie = await login()
    const body = new FormData()
    body.set('key', 'auto_enqueue')
    body.set('value', 'true')
    await app.request('/panel/settings', withSession(cookie, { method: 'POST', body }), env)
    expect((await readSettings(db)).autoEnqueue).toBe(true)

    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).toContain('رُفع الإدراج الآليّ')
    expect(html).toContain('إطفاء')
  })
})

describe('خزانة المفاتيح في اللوحة', () => {
  const GEMINI = 'AIzaSyZZZZZZZZZZZZZZZZZZZZZZZZZZZZ9x1c'

  async function post(cookie: string, path: string, fields: Record<string, string>): Promise<Response> {
    const body = new FormData()
    for (const [k, v] of Object.entries(fields)) body.set(k, v)
    return app.request(path, withSession(cookie, { method: 'POST', body }), env)
  }

  it('يحفظ المفتاح ويسترجعه — ولا يظهر في الصفحة', async () => {
    const cookie = await login()
    const response = await post(cookie, '/panel/providers/key', { provider: 'gemini', key: GEMINI })
    expect(response.status).toBe(303)
    expect((await resolveKey(db, KEY, 'gemini', undefined)).key).toBe(GEMINI)

    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).not.toContain(GEMINI)
    expect(html).not.toContain(GEMINI.slice(8, 24))
    // التلميح وحده
    expect(html).toContain('AIzaSyZ…9x1c')
  })

  it('**الإشعار لا يذكر المفتاح** — التلميح فقط', async () => {
    const cookie = await login()
    await post(cookie, '/panel/providers/key', { provider: 'gemini', key: GEMINI })
    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).not.toContain(GEMINI)
    expect(html).toContain('اختبره قبل أن تعتمد عليه')
  })

  it('اسمُ مزوّدٍ لا سائق له يُرفض — قائمةُ سماحٍ لا منع', async () => {
    const cookie = await login()
    const response = await post(cookie, '/panel/providers/key', { provider: 'openai', key: 'sk-whatever-long' })
    expect(response.status).toBe(400)
    const rows = db.raw.prepare('SELECT count(*) AS n FROM provider_keys').get() as { n: number }
    expect(rows.n).toBe(0)
  })

  it('بلا جلسة لا يُحفظ ولا يُحذف مفتاح', async () => {
    const body = new FormData()
    body.set('provider', 'gemini')
    body.set('key', GEMINI)
    expect((await app.request('/panel/providers/key', { method: 'POST', body }, env)).status).toBe(401)

    const del = new FormData()
    del.set('provider', 'gemini')
    expect((await app.request('/panel/providers/delete', { method: 'POST', body: del }, env)).status).toBe(401)
  })

  it('التعطيل يمنع الاستعمال ويُبقي المفتاح', async () => {
    const cookie = await login()
    await post(cookie, '/panel/providers/key', { provider: 'gemini', key: GEMINI })
    await post(cookie, '/panel/providers/toggle', { provider: 'gemini', enabled: 'false' })
    expect((await resolveKey(db, KEY, 'gemini', undefined)).key).toBeNull()

    await post(cookie, '/panel/providers/toggle', { provider: 'gemini', enabled: 'true' })
    expect((await resolveKey(db, KEY, 'gemini', undefined)).key).toBe(GEMINI)
  })

  it('السقف الخاصّ يُحفظ ويُزال', async () => {
    const cookie = await login()
    await post(cookie, '/panel/providers/key', { provider: 'gemini', key: GEMINI })
    await post(cookie, '/panel/providers/cap', { provider: 'gemini', cap: '2.5' })
    expect((await readRecord(db, 'gemini'))?.dailyCap).toBe(2.5)

    await post(cookie, '/panel/providers/cap', { provider: 'gemini', cap: '' })
    expect((await readRecord(db, 'gemini'))?.dailyCap).toBeNull()
  })

  it('الحذف يسأل قبل أن يقع', async () => {
    const cookie = await login()
    await post(cookie, '/panel/providers/key', { provider: 'gemini', key: GEMINI })
    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).toContain('لا يُسترجَع')
  })

  it('سرُّ Worker لا يُدار من اللوحة — ولا يُقنَّع ولا يُعرض', async () => {
    const cookie = await login()
    const withSecret = { ...env, ANTHROPIC_API_KEY: 'sk-ant-سرّ-في-الورَكر' }
    const html = await (await app.request('/panel', withSession(cookie), withSecret)).text()
    expect(html).toContain('سرّ Worker')
    expect(html).toContain('لا يُبدَّل ولا يُعطَّل من هنا')
    expect(html).not.toContain('sk-ant-سرّ')
  })

  it('بلا TOKEN_ENC_KEY لا تعمل الخزانة — ويُقال ذلك لا يُبتلَع', async () => {
    const cookie = await login()
    const body = new FormData()
    body.set('provider', 'gemini')
    body.set('key', GEMINI)
    await app.request(
      '/panel/providers/key',
      withSession(cookie, { method: 'POST', body }),
      { ...env, TOKEN_ENC_KEY: '' },
    )
    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).toContain('TOKEN_ENC_KEY غير مضبوط')
  })
})

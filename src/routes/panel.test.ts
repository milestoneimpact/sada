/**
 * اللوحة تُختبَر من طرفها إلى طرفها: القاعدة حقيقيّة و KV حقيقيّ،
 * والصفحة تُقرأ كنصٍّ كما يراها المتصفّح.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { toBase64 } from '../lib/crypto'
import { readSettings, writeSetting } from '../lib/settings'
import { getProvider, resolveKey } from '../lib/providers'
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

/** رمز CSRF للجلسة الجارية — يُقرأ من الصفحة كما يقرؤه المتصفّح. */
let csrf = ''

async function login(): Promise<string> {
  const body = new FormData()
  body.set('token', TOKEN)
  const response = await app.request('/panel/login', { method: 'POST', body }, env)
  expect(response.status).toBe(303)
  const cookie = (response.headers.get('Set-Cookie') ?? '').split(';')[0]!

  const page = await app.request('/panel', { headers: { Cookie: cookie } }, env)
  csrf = /name="_csrf" value="([^"]+)"/.exec(await page.text())?.[1] ?? ''
  expect(csrf).not.toBe('')
  return cookie
}

/**
 * كعكةُ الجلسة ورمزُ النموذج معا — كما يرسلهما المتصفّح.
 *
 * والرمز يُحقن هنا لا في كلّ اختبار: اختبارٌ يُغفله يفشل لسببٍ لا علاقة
 * له بما يفحصه، فيُخفي العطل الحقيقيّ بضجيج.
 */
function withSession(cookie: string, init: RequestInit = {}): RequestInit {
  if (init.body instanceof FormData && !init.body.has('_csrf')) init.body.set('_csrf', csrf)
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
    // بادئة __Host- تشترط Path=/ — ومنعُ نطاقٍ شقيقٍ من زرع كعكة أولى
    expect(cookie).toContain('Path=/')
    expect(cookie).not.toContain('Domain=')
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

  it('تعرض قسم الكتابة، وتقول إنّ الاعتماد لا ينشر', async () => {
    const cookie = await login()
    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).toContain('الكتابة من مصدر')
    // الوعدُ المكتوب في الصفحة هو الوعدُ المنفَّذ في القاعدة (D-009)
    expect(html).toContain('لا يُنشر منشورٌ بلا موافقةٍ مسجّلة')
    // ولا زرَّ نشرٍ هنا: الاعتمادُ يفتح البابَ ولا يعبره
    expect(html).not.toContain('action="/panel/drafts/publish"')
  })

  it('تسمّي السرّ الناقص لمزوّدٍ غير مضبوط', async () => {
    const cookie = await login()
    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).toContain('ANTHROPIC_API_KEY')
    expect(html).toContain('لا مفتاح')
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
    const response = await app.request(
      '/panel/scan',
      withSession(cookie, { method: 'POST', body: new FormData() }),
      env,
    )
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

  it('مزوّدٌ غير مضاف يُرفض حفظُ مفتاحه — يُضاف أوّلا', async () => {
    const cookie = await login()
    const response = await post(cookie, '/panel/providers/key', { provider: 'deepseek', key: 'sk-whatever-long' })
    expect(response.status).toBe(400)
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

  it('السقف والسعر يُحفظان ويُزالان', async () => {
    const cookie = await login()
    await post(cookie, '/panel/providers/add', {
      name: 'gemini', label: 'Gemini', daily_cap: '2.5', price_in: '0.3', price_out: '2.5',
    })
    const saved = await getProvider(db, 'gemini')
    expect(saved?.dailyCap).toBe(2.5)
    expect(saved?.priceIn).toBe(0.3)

    await post(cookie, '/panel/providers/add', { name: 'gemini', label: 'Gemini' })
    expect((await getProvider(db, 'gemini'))?.dailyCap).toBeNull()
  })

  /**
   * فهرسُ النماذج (D-081).
   *
   * وكان الاسمُ يُكتب يدويّا، فحرفٌ خطأ لا يُكتشَف إلّا في أوّل مهمّةٍ
   * حقيقيّة. والفهرسُ يُجلَب من عند المزوّد لحظةَ الطلب — **ولا يُخزَّن**:
   * قائمةٌ محفوظةٌ تتقادم بصمت.
   */
  describe('فهرسُ النماذج — يُجلَب ولا يُكتب', () => {
    const real = globalThis.fetch

    function stub(payload: unknown, status = 200): string[] {
      const urls: string[] = []
      globalThis.fetch = (async (input: unknown): Promise<Response> => {
        urls.push(input instanceof Request ? input.url : String(input))
        return new Response(JSON.stringify(payload), {
          status,
          headers: { 'Content-Type': 'application/json' },
        })
      }) as unknown as typeof fetch
      return urls
    }

    afterEach(() => {
      globalThis.fetch = real
    })

    it('بلا جلسة لا يُجلَب شيء', async () => {
      const body = new FormData()
      body.set('provider', 'gemini')
      const response = await app.request('/panel/providers/models', { method: 'POST', body }, env)
      expect(response.status).toBe(401)
    })

    it('ولا مفتاحَ يعني جوابا يقول لماذا — لا عطلا', async () => {
      const cookie = await login()
      const response = await post(cookie, '/panel/providers/models', { provider: 'gemini' })
      expect(response.status).toBe(200)
      const body = (await response.json()) as { ok: boolean; detail: string }
      expect(body.ok).toBe(false)
      expect(body.detail).toContain('لا مفتاح')
    })

    it('يجلب المعرّفات من عند المزوّد', async () => {
      const cookie = await login()
      await post(cookie, '/panel/providers/key', { provider: 'gemini', key: GEMINI })
      const urls = stub({ models: [{ name: 'models/gemini-2.5-flash', displayName: 'Flash' }] })

      const response = await post(cookie, '/panel/providers/models', { provider: 'gemini' })
      const body = (await response.json()) as { ok: boolean; models: { id: string }[] }
      expect(body.ok).toBe(true)
      expect(body.models[0]!.id).toBe('gemini-2.5-flash')
      expect(urls[0]).toContain('generativelanguage.googleapis.com')
    })

    it('و**المفتاحُ لا يظهر في الجواب ولا في العنوان**', async () => {
      const cookie = await login()
      await post(cookie, '/panel/providers/key', { provider: 'gemini', key: GEMINI })
      const urls = stub({ models: [{ name: 'models/gemini-2.5-flash' }] })

      const text = await (await post(cookie, '/panel/providers/models', { provider: 'gemini' })).text()
      expect(text).not.toContain(GEMINI)
      expect(urls[0]).not.toContain(GEMINI)
    })

    it('ومزوّدٌ لا وجودَ له يُردّ لا يُخترَع', async () => {
      const cookie = await login()
      const response = await post(cookie, '/panel/providers/models', { provider: 'لا-أحد' })
      expect(response.status).toBe(400)
    })
  })

  it('**المدمَج لا يُحذف** — يُعطَّل بدل ذلك', async () => {
    const cookie = await login()
    const response = await post(cookie, '/panel/providers/delete', { provider: 'gemini' })
    expect(response.status).toBe(303)
    expect(await getProvider(db, 'gemini')).not.toBeNull()

    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).toContain('مدمَج ولا يُحذف')
  })

  it('سرُّ Worker لا يُدار من اللوحة — ولا يُقنَّع ولا يُعرض', async () => {
    const cookie = await login()
    const withSecret = { ...env, ANTHROPIC_API_KEY: 'sk-ant-سرّ-في-الورَكر' }
    const html = await (await app.request('/panel', withSession(cookie), withSecret)).text()
    expect(html).toContain('سرّ Worker')
    expect(html).toContain('لا يُبدَّل من هنا')
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

describe('**مزوّدٌ يُضاف من اللوحة كاملا**', () => {
  async function post(cookie: string, path: string, fields: Record<string, string>): Promise<Response> {
    const body = new FormData()
    for (const [k, v] of Object.entries(fields)) body.set(k, v)
    return app.request(path, withSession(cookie, { method: 'POST', body }), env)
  }

  it('DeepSeek يُضاف بمفتاحه ويُحفظ مشفَّرا', async () => {
    const cookie = await login()
    await post(cookie, '/panel/providers/add', {
      name: 'deepseek', label: 'DeepSeek',
      base_url: 'https://api.deepseek.com/v1', model: 'deepseek-chat',
      price_in: '0.27', price_out: '1.1',
    })
    const provider = await getProvider(db, 'deepseek')
    expect(provider?.kind).toBe('openai_compat')
    expect(provider?.baseUrl).toBe('https://api.deepseek.com/v1')
    expect(provider?.builtin).toBe(false)

    await post(cookie, '/panel/providers/key', { provider: 'deepseek', key: 'sk-deepseek-secret-value' })
    expect((await resolveKey(db, KEY, 'deepseek', undefined)).key).toBe('sk-deepseek-secret-value')

    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).toContain('DeepSeek')
    expect(html).not.toContain('sk-deepseek-secret-value')
  })

  it('**عنوانٌ داخليّ يُرفض قبل أن يُحفظ**', async () => {
    const cookie = await login()
    await post(cookie, '/panel/providers/add', {
      name: 'evil', label: 'Evil', base_url: 'https://169.254.169.254/latest',
    })
    expect(await getProvider(db, 'evil')).toBeNull()

    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).toContain('العنوان مرفوض')
  })

  it('http يُرفض — المفتاح لا يُرسل على اتّصالٍ غير مشفَّر', async () => {
    const cookie = await login()
    await post(cookie, '/panel/providers/add', {
      name: 'plain', label: 'Plain', base_url: 'http://api.example.com/v1',
    })
    expect(await getProvider(db, 'plain')).toBeNull()
  })

  it('اسمٌ غير صالح يُرفض — يُستعمل مفتاحا وسياقَ تشفير وقيمةً في الدفتر', async () => {
    const cookie = await login()
    for (const name of ['دييب سيك', '9start', 'a', 'bad!name', 'x'.repeat(40)]) {
      await post(cookie, '/panel/providers/add', {
        name, label: 'X', base_url: 'https://api.example.com/v1',
      })
    }
    const rows = db.raw.prepare('SELECT count(*) AS n FROM providers').get() as { n: number }
    expect(rows.n).toBe(2) // المدمَجان وحدهما
  })

  it('المسافة تُطبَّع شرطة — تسهيلٌ مقصود لا تساهل', async () => {
    const cookie = await login()
    await post(cookie, '/panel/providers/add', {
      name: 'Deep Seek', label: 'DeepSeek', base_url: 'https://api.deepseek.com/v1',
    })
    expect(await getProvider(db, 'deep-seek')).not.toBeNull()
  })

  it('المضاف يُحذف — بخلاف المدمَج', async () => {
    const cookie = await login()
    await post(cookie, '/panel/providers/add', {
      name: 'groq', label: 'Groq', base_url: 'https://api.groq.com/openai/v1',
    })
    await post(cookie, '/panel/providers/delete', { provider: 'groq' })
    expect(await getProvider(db, 'groq')).toBeNull()
  })

  it('التأكيد يعرض ما سيُرسَل قبل أن يُرسَل', async () => {
    const cookie = await login()
    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).toContain('سيُرسَل مفتاحك ونصّ مستنداتك إلى هذا العنوان')
  })
})

describe('توجيه المهامّ يصير للمالك', () => {
  async function post(cookie: string, path: string, fields: Record<string, string>): Promise<Response> {
    const body = new FormData()
    for (const [k, v] of Object.entries(fields)) body.set(k, v)
    return app.request(path, withSession(cookie, { method: 'POST', body }), env)
  }

  it('يوجّه الفهم إلى مزوّدٍ أضافه المالك', async () => {
    const cookie = await login()
    await post(cookie, '/panel/providers/add', {
      name: 'deepseek', label: 'DeepSeek', base_url: 'https://api.deepseek.com/v1',
    })
    const response = await post(cookie, '/panel/routes', {
      task: 'analyze', provider: 'deepseek', model: 'deepseek-chat',
    })
    expect(response.status).toBe(303)

    const row = db.raw.prepare("SELECT provider, model FROM task_routes WHERE task='analyze'").get() as
      { provider: string; model: string }
    expect(row.provider).toBe('deepseek')
    expect(row.model).toBe('deepseek-chat')
  })

  it('مهمّةٌ غير معروفة أو مزوّدٌ غير موجود يُرفضان', async () => {
    const cookie = await login()
    expect((await post(cookie, '/panel/routes', { task: 'hack', provider: 'anthropic', model: 'x' })).status).toBe(400)
    expect((await post(cookie, '/panel/routes', { task: 'analyze', provider: 'ghost', model: 'x' })).status).toBe(400)
  })

  it('بلا جلسة لا يُغيَّر توجيه', async () => {
    const body = new FormData()
    body.set('task', 'analyze')
    body.set('provider', 'anthropic')
    body.set('model', 'x')
    expect((await app.request('/panel/routes', { method: 'POST', body }, env)).status).toBe(401)
  })
})

describe('ترويسات الأمان — والقفل على بابٍ جدارُه زجاج ليس أمنا', () => {
  it('صفحة اللوحة تمنع التأطير بالطريقتين', async () => {
    const cookie = await login()
    const response = await app.request('/panel', withSession(cookie), env)
    const csp = response.headers.get('Content-Security-Policy') ?? ''
    expect(csp).toContain("frame-ancestors 'none'")
    expect(response.headers.get('X-Frame-Options')).toBe('DENY')
  })

  it('السياسة قائمةُ سماحٍ من العدم', async () => {
    const cookie = await login()
    const csp =
      (await app.request('/panel', withSession(cookie), env)).headers.get(
        'Content-Security-Policy',
      ) ?? ''
    expect(csp).toContain("default-src 'none'")
    expect(csp).toContain("base-uri 'none'")
    expect(csp).toContain("form-action 'self'")
    // ولا تُفتَح بابا يُبطلها كلَّها
    expect(csp).not.toContain('unsafe-inline')
    expect(csp).not.toContain('unsafe-eval')
  })

  it('كلّ وسمٍ داخليّ يحمل nonce الصفحة — وإلّا لما نُفّذ', async () => {
    const cookie = await login()
    const response = await app.request('/panel', withSession(cookie), env)
    const html = await response.text()
    const nonce = /nonce-([A-Za-z0-9+/]+)/.exec(
      response.headers.get('Content-Security-Policy') ?? '',
    )?.[1]
    expect(nonce).toBeTruthy()
    expect(html).toContain(`<style nonce="${nonce}">`)
    expect(html).toContain(`<script nonce="${nonce}">`)
  })

  it('nonce يتبدّل مع كلّ ردّ — وثابتٌ مشترك يُبطل السياسة', async () => {
    const cookie = await login()
    const first = await app.request('/panel', withSession(cookie), env)
    const second = await app.request('/panel', withSession(cookie), env)
    expect(first.headers.get('Content-Security-Policy')).not.toBe(
      second.headers.get('Content-Security-Policy'),
    )
  })

  it('صفحةُ الدخول محروسةٌ كاللوحة — لا تُترك لأنّها قبل الجلسة', async () => {
    const response = await app.request('/panel', {}, env)
    expect(response.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'")
    expect(response.headers.get('X-Frame-Options')).toBe('DENY')
  })

  it('اللوحة لا تُخزَّن في متصفّحٍ مشترك', async () => {
    const cookie = await login()
    const response = await app.request('/panel', withSession(cookie), env)
    expect(response.headers.get('Cache-Control')).toContain('no-store')
  })

  it('الترويسات الأساس على كلّ ردّ — JSON كان أو HTML', async () => {
    for (const path of ['/health', '/ready', '/panel']) {
      const response = await app.request(path, {}, env)
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
      expect(response.headers.get('Referrer-Policy')).toBe('no-referrer')
      expect(response.headers.get('Strict-Transport-Security')).toContain('includeSubDomains')
    }
  })
})

describe('CSRF — طبقةٌ في الخادم لا في المتصفّح وحده', () => {
  it('كلّ نموذج POST في اللوحة يحمل الرمز — بلا استثناء', async () => {
    const cookie = await login()
    await seedSource('مستند')
    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    // يُفحص كلّ موضعٍ على حدة لا كلّ نصٍّ فريد: نموذجان متطابقان نصّا
    // موضعان اثنان، ولو فُحص الأوّل مرّتين لمرّ ثانٍ ناقص
    const pattern = /<form\b[^>]*method="POST"[^>]*>/gi
    let seen = 0
    for (let m = pattern.exec(html); m !== null; m = pattern.exec(html)) {
      seen += 1
      expect(html.slice(pattern.lastIndex, pattern.lastIndex + 90)).toContain('name="_csrf"')
    }
    expect(seen).toBeGreaterThan(5)
  })

  it('طلبٌ بلا رمز يُرفض ٤٠٣ ولا يغيّر القاعدة', async () => {
    const cookie = await login()
    const body = new FormData()
    body.set('key', 'paused')
    body.set('value', 'true')
    // بلا `_csrf` — كما يرسله موقعٌ آخر
    const response = await app.request(
      '/panel/settings',
      { method: 'POST', body, headers: { Cookie: cookie } },
      env,
    )
    expect(response.status).toBe(403)
    expect((await readSettings(db)).paused).toBe(false)
  })

  it('رمزٌ ملفَّق يُرفض كذلك', async () => {
    const cookie = await login()
    const body = new FormData()
    body.set('key', 'paused')
    body.set('value', 'true')
    body.set('_csrf', 'a'.repeat(64))
    const response = await app.request(
      '/panel/settings',
      { method: 'POST', body, headers: { Cookie: cookie } },
      env,
    )
    expect(response.status).toBe(403)
    expect((await readSettings(db)).paused).toBe(false)
  })

  it('رمزُ جلسةٍ أخرى لا يعمل في هذه', async () => {
    const first = await login()
    const stolen = csrf
    const second = await login()
    expect(csrf).not.toBe(stolen)

    const body = new FormData()
    body.set('key', 'paused')
    body.set('value', 'true')
    body.set('_csrf', stolen)
    const response = await app.request(
      '/panel/settings',
      { method: 'POST', body, headers: { Cookie: second } },
      env,
    )
    expect(response.status).toBe(403)
    expect(first).not.toBe(second)
  })

  it('الخروج لا يحتاج رمزا — بابُ الخروج لا يُقفَل', async () => {
    const cookie = await login()
    const response = await app.request(
      '/panel/logout',
      { method: 'POST', headers: { Cookie: cookie } },
      env,
    )
    expect(response.status).toBe(303)
    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).toContain('name="token"')
  })
})

describe('تدويرُ ADMIN_TOKEN يُبطل الجلسات', () => {
  it('جلسةٌ قائمة تسقط حين يُبدَّل الرمز — لا تنتظر انتهاء مهلتها', async () => {
    const cookie = await login()
    expect(await (await app.request('/panel', withSession(cookie), env)).text()).toContain(
      'nav class="tabs"',
    )

    const rotated = { ...env, ADMIN_TOKEN: 'Zz9qW8vY1nMtB6oS3uXgA7dC5eI2kH0f' }
    const html = await (await app.request('/panel', withSession(cookie), rotated)).text()
    expect(html).toContain('name="token"')
    expect(html).not.toContain('nav class="tabs"')
  })

  it('ولا يغيّر شيئا بجلسةٍ سقطت', async () => {
    const cookie = await login()
    const rotated = { ...env, ADMIN_TOKEN: 'Zz9qW8vY1nMtB6oS3uXgA7dC5eI2kH0f' }
    const body = new FormData()
    body.set('key', 'paused')
    body.set('value', 'true')
    body.set('_csrf', csrf)
    const response = await app.request(
      '/panel/settings',
      { method: 'POST', body, headers: { Cookie: cookie } },
      rotated,
    )
    expect(response.status).toBe(401)
    expect((await readSettings(db)).paused).toBe(false)
  })
})

describe('جرد الأجهزة في اللوحة', () => {
  it('يعرض الجلسات ويعلّم الحاليّة', async () => {
    const cookie = await login()
    await login()
    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).toContain('الأجهزة المفتوحة')
    expect(html).toContain('هذا الجهاز')
    expect(html).toContain('/panel/sessions/revoke')
  })

  it('«أخرِج الأجهزة الأخرى» يُبقي جلسة الفاعل', async () => {
    const other = await login()
    const mine = await login()
    const response = await app.request(
      '/panel/sessions/revoke-all',
      withSession(mine, { method: 'POST', body: new FormData() }),
      env,
    )
    expect(response.status).toBe(303)

    expect(await (await app.request('/panel', withSession(mine), env)).text()).toContain(
      'nav class="tabs"',
    )
    expect(await (await app.request('/panel', { headers: { Cookie: other } }, env)).text()).toContain(
      'name="token"',
    )
  })

  it('إبطالُ جلستك من الجرد يُردّ إلى زرّ الخروج — لا يترك صفحةً ميّتة', async () => {
    const cookie = await login()
    const id = cookie.split('=')[1]!
    const body = new FormData()
    body.set('id', id)
    await app.request('/panel/sessions/revoke', withSession(cookie, { method: 'POST', body }), env)
    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).toContain('nav class="tabs"')
    expect(html).toContain('استعمل زرّ «خروج»')
  })
})

describe('سجلّ التدقيق — من فعل ماذا', () => {
  async function actions(): Promise<string[]> {
    const { results } = await db
      .prepare('SELECT action FROM audit_log ORDER BY id')
      .all<{ action: string }>()
    return results.map((r) => r.action)
  }

  it('يسجّل الدخول وتغيير الإعداد', async () => {
    const cookie = await login()
    const body = new FormData()
    body.set('key', 'daily_analysis_cap')
    body.set('value', '7')
    await app.request('/panel/settings', withSession(cookie, { method: 'POST', body }), env)
    expect(await actions()).toContain('session.open')
    expect(await actions()).toContain('settings.write')
  })

  it('يسجّل المحاولة المرفوضة — وتكرارُها هو ما يُقرأ لاحقا', async () => {
    const body = new FormData()
    body.set('token', 'wrong')
    await app.request('/panel/login', { method: 'POST', body }, env)
    expect(await actions()).toContain('login.denied')
  })

  it('**لا يُذكر مفتاحٌ في السجلّ** — التلميح وحده', async () => {
    const cookie = await login()
    const secret = 'sk-super-secret-value-2b7f'
    const add = new FormData()
    add.set('name', 'deepseek')
    add.set('label', 'DeepSeek')
    add.set('base_url', 'https://api.deepseek.com/v1')
    add.set('model', 'deepseek-chat')
    await app.request('/panel/providers/add', withSession(cookie, { method: 'POST', body: add }), env)

    const key = new FormData()
    key.set('provider', 'deepseek')
    key.set('key', secret)
    await app.request('/panel/providers/key', withSession(cookie, { method: 'POST', body: key }), env)

    const { results } = await db
      .prepare('SELECT detail FROM audit_log')
      .all<{ detail: string | null }>()
    const all = results.map((r) => r.detail ?? '').join(' | ')
    expect(all).not.toContain(secret)
    expect(await actions()).toContain('provider.key')
  })

  it('يظهر في اللوحة بأسمائه العربيّة', async () => {
    const cookie = await login()
    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).toContain('سجلّ التدقيق')
    expect(html).toContain('فُتحت جلسة')
  })

  it('عطلٌ في السجلّ لا يُسقط الفعل — الإعدادُ يُحفظ ولو لم يُسجَّل', async () => {
    const cookie = await login()
    db.raw.exec('DROP TABLE audit_log')
    const body = new FormData()
    body.set('key', 'daily_analysis_cap')
    body.set('value', '9')
    const response = await app.request(
      '/panel/settings',
      withSession(cookie, { method: 'POST', body }),
      env,
    )
    expect(response.status).toBe(303)
    expect((await readSettings(db)).dailyAnalysisCap).toBe(9)
  })
})

describe('القنوات — سجلٌّ صادق لا وعدٌ بما لا يقع', () => {
  async function seedAccount(platform: string, status = 'active'): Promise<void> {
    await db
      .prepare(
        `INSERT INTO accounts (id, platform, kind, external_id, display_name, status)
         VALUES (?, ?, 'member', ?, 'عمر عبدالحميد', ?)`,
      )
      .bind(crypto.randomUUID(), platform, crypto.randomUUID(), status)
      .run()
  }

  it('يعرض المبنيَّ وغيرَ المبنيّ معا', async () => {
    const cookie = await login()
    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).toContain('data-pane="channels"')
    for (const name of ['LinkedIn', 'Snapchat', 'Instagram', 'TikTok', 'YouTube']) {
      expect(html).toContain(name)
    }
  })

  it('**لا زرَّ ربطٍ لما لم يُبنَ** — وزرٌّ يقول «غير مدعوم» أسوأ من غيابه', async () => {
    const cookie = await login()
    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    for (const id of ['snapchat', 'instagram', 'tiktok', 'threads', 'youtube']) {
      expect(html).not.toContain(`/oauth/${id}/start`)
    }
    expect(html).toContain('يحتاج سائقا')
  })

  it('بلا أسرار: تُسمّى الأسرار الناقصة ومهمّتها، ولا يُعرض زرّ', async () => {
    const cookie = await login()
    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).toContain('LINKEDIN_CLIENT_ID')
    // صار الضبطُ من اللوحة (D-042)، فالبطاقةُ تعرض النموذجَ لا رقمَ مهمّة
    expect(html).toContain('دليلُ ضبط التطبيق')
    expect(html).not.toContain('/oauth/linkedin/start')
  })

  it('بالأسرار: زرُّ الربط يظهر ويشير إلى مسارٍ قائم', async () => {
    const withSecrets = {
      ...env,
      LINKEDIN_CLIENT_ID: 'id',
      LINKEDIN_CLIENT_SECRET: 'secret',
    }
    const body = new FormData()
    body.set('token', TOKEN)
    const login2 = await app.request('/panel/login', { method: 'POST', body }, withSecrets)
    const cookie = (login2.headers.get('Set-Cookie') ?? '').split(';')[0]!
    const html = await (
      await app.request('/panel', { headers: { Cookie: cookie } }, withSecrets)
    ).text()
    expect(html).toContain('/oauth/linkedin/start')
  })

  it('الحسابُ المربوط يُعرض باسمه', async () => {
    await seedAccount('linkedin')
    const cookie = await login()
    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).toContain('عمر عبدالحميد')
    expect(html).toContain('مربوطة')
  })

  it('**رمزٌ انتهى يظهر في «ما ينتظرك»** — فلا يقف النشر صامتا', async () => {
    await seedAccount('x', 'needs_reauth')
    const cookie = await login()
    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).toContain('انتهى الإذن')
  })

  it('اسمٌ يحمل HTML يُهرَّب ولا يُحقَن', async () => {
    await db
      .prepare(
        `INSERT INTO accounts (id, platform, kind, external_id, display_name, status)
         VALUES (?, 'x', 'member', 'e1', ?, 'active')`,
      )
      .bind(crypto.randomUUID(), '<script>alert(1)</script>')
      .run()
    const cookie = await login()
    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })
})

describe('الثيم النهاريّ', () => {
  it('الرموز تُعرَّف على :root كاملةً — فلا تسقط بسقوط شرط', async () => {
    const cookie = await login()
    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    const root = html.slice(html.indexOf(':root{'), html.indexOf('}', html.indexOf(':root{')))
    for (const token of ['--bg', '--surface', '--ink', '--brand', '--ok', '--warn', '--bad']) {
      expect(root).toContain(token)
    }
  })

  it('مفتاحُ الثيم حاضرٌ بخياراته الثلاثة', async () => {
    const cookie = await login()
    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).toContain('id="theme"')
    expect(html).toContain('data-theme="light"')
    expect(html).toContain('data-theme="dark"')
    expect(html).toContain('data-theme="system"')
  })

  it('**سكربتُ الثيم في الرأس** — فلا يومض الثيمُ الخطأ قبل الرسم', async () => {
    const cookie = await login()
    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    const head = html.slice(0, html.indexOf('</head>'))
    expect(head).toContain('sada-theme')
  })

  it('وهو يحمل nonce الصفحة كغيره — وإلّا لما نُفّذ', async () => {
    const cookie = await login()
    const response = await app.request('/panel', withSession(cookie), env)
    const html = await response.text()
    const nonce = /nonce-([A-Za-z0-9+/]+)/.exec(
      response.headers.get('Content-Security-Policy') ?? '',
    )?.[1]
    const head = html.slice(0, html.indexOf('</head>'))
    expect(head).toContain(`<script nonce="${nonce}">`)
  })

  it('صفحةُ الدخول تتبع الثيم أيضا', async () => {
    const html = await (await app.request('/panel', {}, env)).text()
    expect(html.slice(0, html.indexOf('</head>'))).toContain('sada-theme')
  })
})

describe('الجاهزيّة تفرز ما سدّته الخزانة', () => {
  it('مفتاحٌ في الخزانة لا يُعدّ ناقصا — ويُذكر على حدة', async () => {
    const cookie = await login()
    await readSettings(db)
    const body = new FormData()
    body.set('_csrf', csrf)
    body.set('provider', 'anthropic')
    body.set('key', 'sk-ant-test-value-0001')
    await app.request(
      '/panel/providers/key',
      { method: 'POST', body, headers: { Cookie: cookie } },
      env,
    )

    const ready = (await (await app.request('/ready', {}, env)).json()) as {
      missing_secrets: string[]
      configured_in_vault: string[]
    }
    expect(ready.configured_in_vault).toContain('ANTHROPIC_API_KEY')
    expect(ready.missing_secrets).not.toContain('ANTHROPIC_API_KEY')
  })

  it('وما لا خزانةَ له يبقى ناقصا', async () => {
    const ready = (await (await app.request('/ready', {}, env)).json()) as {
      missing_secrets: string[]
      configured_in_vault: string[]
    }
    expect(ready.missing_secrets).toContain('LINKEDIN_CLIENT_ID')
    expect(ready.configured_in_vault).toEqual([])
  })
})

/**
 * الكتابةُ والبَتُّ من اللوحة.
 *
 * ما يُفحَص هنا ليس أنّ الزرّ يعمل، بل أنّه **يمرّ بالحارس نفسه**: زرٌّ
 * في صفحةٍ ليس طريقا جانبيّا حول الإيقاف والسقوف (D-019). ولا شبكةَ
 * تُزيَّف في هذا الملفّ، فما يُختبر هو المنعُ الذي يقع قبل النداء.
 */
describe('الكتابة من اللوحة', () => {
  async function seedAnalyzed(): Promise<string> {
    const id = await seedSource('تقرير الأثر')
    await db
      .prepare(
        'INSERT INTO content_items (id, source_id, summary, themes_json, worth_score) VALUES (?, ?, ?, ?, ?)',
      )
      .bind(
        crypto.randomUUID(),
        id,
        'خلاصةٌ عربية عن أثر الوقف.',
        JSON.stringify({ hash: 'md5:a', themes: ['الوقف'] }),
        0.8,
      )
      .run()
    return id
  }

  it('لا تعرض مصدرا غير محلَّل في قائمة الكتابة — بلا خلاصةٍ لا مادّة', async () => {
    await seedSource('لم يُحلَّل')
    const cookie = await login()
    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    const form = html.slice(html.indexOf('id="dw-src"'), html.indexOf('id="dw-pf"'))
    expect(form).not.toContain('لم يُحلَّل')
  })

  it('الإيقافُ يمنع الكتابة — والزرُّ ليس طريقا حوله', async () => {
    const id = await seedAnalyzed()
    const cookie = await login()
    await writeSetting(db, 'paused', 'true', 'test')

    const body = new FormData()
    body.set('id', id)
    body.set('platform', 'linkedin')
    await app.request('/panel/drafts/write', withSession(cookie, { method: 'POST', body }), env)

    const { results } = await db.prepare('SELECT id FROM posts').all()
    expect(results).toHaveLength(0)
    const ledger = await db.prepare('SELECT id FROM cost_ledger').all()
    expect(ledger.results).toHaveLength(0)
  })

  it('منصّةٌ غير معروفة تُردّ ولا تصل إلى القاعدة', async () => {
    const id = await seedAnalyzed()
    const cookie = await login()
    const body = new FormData()
    body.set('id', id)
    body.set('platform', 'snapchat')
    const response = await app.request(
      '/panel/drafts/write',
      withSession(cookie, { method: 'POST', body }),
      env,
    )
    expect(response.status).toBe(303)
    const { results } = await db.prepare('SELECT id FROM posts').all()
    expect(results).toHaveLength(0)
  })

  it('البَتُّ يكتب صاحبَ القرار في السجلّ — وموافقةٌ بلا أثرٍ لا تُراجَع', async () => {
    const sourceId = await seedAnalyzed()
    const postId = crypto.randomUUID()
    const text = 'ن'.repeat(300)
    await db
      .prepare(
        `INSERT INTO posts (id, platform, source_id, source_hash, model, cost_usd, type, text, status, idempotency_key)
         VALUES (?, 'linkedin', ?, 'md5:a', 'claude-opus-5', 0.01, 'text', ?, 'draft', ?)`,
      )
      .bind(postId, sourceId, text, `k-${postId}`)
      .run()

    const cookie = await login()
    const body = new FormData()
    body.set('id', postId)
    body.set('do', 'approve')
    body.set('text', text)
    await app.request('/panel/drafts/decide', withSession(cookie, { method: 'POST', body }), env)

    const row = await db
      .prepare('SELECT status, approved_by, approved_at FROM posts WHERE id = ?')
      .bind(postId)
      .first<Record<string, unknown>>()
    expect(row?.['status']).toBe('approved')
    expect(row?.['approved_by']).toBe('panel:token')
    expect(row?.['approved_at']).not.toBeNull()

    const audit = await db
      .prepare("SELECT action, detail FROM audit_log WHERE action = 'draft.decide'")
      .all<{ action: string; detail: string }>()
    expect(audit.results).toHaveLength(1)
    expect(audit.results[0]?.detail).toBe('approved')
  })

  it('البَتُّ بلا رمز CSRF يُردّ ولا يغيّر حالا', async () => {
    const sourceId = await seedAnalyzed()
    const postId = crypto.randomUUID()
    await db
      .prepare(
        `INSERT INTO posts (id, platform, source_id, model, cost_usd, type, text, status, idempotency_key)
         VALUES (?, 'linkedin', ?, 'm', 0, 'text', ?, 'draft', ?)`,
      )
      .bind(postId, sourceId, 'ن'.repeat(300), `k-${postId}`)
      .run()

    const cookie = await login()
    const body = new FormData()
    body.set('id', postId)
    body.set('do', 'approve')
    body.set('text', 'ن'.repeat(300))
    // بلا `withSession`: الكعكةُ وحدها بلا رمزِ النموذج
    const response = await app.request(
      '/panel/drafts/decide',
      { method: 'POST', body, headers: { Cookie: cookie } },
      env,
    )
    expect(response.status).toBe(403)

    const row = await db.prepare('SELECT status FROM posts WHERE id = ?').bind(postId).first<{ status: string }>()
    expect(row?.status).toBe('draft')
  })
})

/**
 * الجدولةُ من اللوحة (D-037).
 *
 * الحارسُ مقطوعٌ في `schedule/job.test.ts`؛ وما هنا أنّ الزرّ **يمرّ به**
 * ولا يلتفّ حوله، وأنّ القرار يُسجَّل بصاحبه.
 */
describe('الجدولة من اللوحة', () => {
  async function seedApproved(platform: 'linkedin' | 'x' = 'linkedin'): Promise<string> {
    const id = crypto.randomUUID()
    await db
      .prepare(
        `INSERT INTO posts (id, platform, type, text, status, idempotency_key, approved_by, approved_at)
         VALUES (?, ?, 'text', ?, 'approved', ?, 'panel:token', '2026-09-08T07:00:00Z')`,
      )
      .bind(id, platform, 'ن'.repeat(300), `k-${id}`)
      .run()
    return id
  }

  async function seedAccount(platform: 'linkedin' | 'x' = 'linkedin', status = 'active'): Promise<string> {
    const id = crypto.randomUUID()
    await db
      .prepare(
        'INSERT INTO accounts (id, platform, kind, external_id, display_name, status) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .bind(id, platform, 'member', id.slice(0, 8), 'عمر', status)
      .run()
    return id
  }

  function future(): string {
    return new Date(Date.now() + 3600_000).toISOString().slice(0, 16)
  }

  it('تجدول وتسجّل الموعد في السجلّ', async () => {
    const post = await seedApproved()
    const account = await seedAccount()
    const cookie = await login()

    const body = new FormData()
    body.set('id', post)
    body.set('account', account)
    body.set('when', future())
    await app.request('/panel/drafts/schedule', withSession(cookie, { method: 'POST', body }), env)

    const row = await db
      .prepare('SELECT status, account_id, scheduled_at, dispatched_at FROM posts WHERE id = ?')
      .bind(post)
      .first<Record<string, unknown>>()
    expect(row?.['status']).toBe('queued')
    expect(row?.['account_id']).toBe(account)
    expect(row?.['dispatched_at']).toBeNull()

    const audit = await db
      .prepare("SELECT detail FROM audit_log WHERE action = 'draft.schedule'")
      .all<{ detail: string }>()
    expect(audit.results).toHaveLength(1)
  })

  it('حسابٌ من منصّةٍ أخرى يُردّ — والزرُّ ليس طريقا حول الحارس', async () => {
    const post = await seedApproved('x')
    const account = await seedAccount('linkedin')
    const cookie = await login()

    const body = new FormData()
    body.set('id', post)
    body.set('account', account)
    body.set('when', future())
    await app.request('/panel/drafts/schedule', withSession(cookie, { method: 'POST', body }), env)

    expect(
      (await db.prepare('SELECT status FROM posts WHERE id = ?').bind(post).first<{ status: string }>())
        ?.status,
    ).toBe('approved')
  })

  it('الجدولةُ بلا رمز CSRF تُردّ ولا تغيّر حالا', async () => {
    const post = await seedApproved()
    const account = await seedAccount()
    const cookie = await login()

    const body = new FormData()
    body.set('id', post)
    body.set('account', account)
    body.set('when', future())
    const response = await app.request(
      '/panel/drafts/schedule',
      { method: 'POST', body, headers: { Cookie: cookie } },
      env,
    )
    expect(response.status).toBe(403)
  })

  it('لا نموذجَ جدولةٍ حيث لا قناة — بل جملةٌ تقول لماذا', async () => {
    await seedApproved()
    const cookie = await login()
    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).toContain('لا قناةَ LinkedIn مربوطة')
    expect(html).not.toContain('action="/panel/drafts/schedule"')
  })

  it('وقناةٌ إذنُها منتهٍ ليست وجهة — فلا تُعرض في القائمة', async () => {
    await seedApproved()
    await seedAccount('linkedin', 'needs_reauth')
    const cookie = await login()
    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).toContain('لا قناةَ LinkedIn مربوطة')
  })
})

/**
 * لا Markdown في مخرَج HTML — على اللوحة كما على الوثائق.
 *
 * العلّةُ وقعت مرّتين: في `/privacy` (D-038) وفي دليل ضبط التطبيق
 * (D-042). ونصُّ الإرشاد يُدرَج بلا تهريبٍ ليعمل `<b>` فيه، **فنجمتان
 * تُطبَعان حرفا**. واختبارُ محتوًى يجد الكلمةَ فيمرّ — فيُفحَص الشكل.
 */
describe('لا Markdown في مخرَج اللوحة', () => {
  // والمسارُ يُعدَّد لا يُكتب واحدا: صفحةٌ جديدة تُضاف هنا فتُفحَص معها،
  // ولا تُترك لأنّ أحدا نسي نسخَ الاختبار — وهي العلّةُ التي وقعت ثلاثا
  const PAGES = ['/panel', '/panel/channels/linkedin', '/panel/channels/x',
    '/panel/channels/instagram']

  it.each(PAGES)('%s لا تحمل نجوما ولا شرطاتِ قوائم حرفيّة', async (path) => {
    const cookie = await login()
    const html = await (await app.request(path, withSession(cookie), env)).text()
    const body = html.slice(html.indexOf('<body>'))
    expect(body).not.toMatch(/\*\*/)
    // والعلامةُ المائلة للشيفرة تُستبدَل بـ mono، فلا تبقى حرفا
    expect(body).not.toMatch(/`[^`\n]{2,40}`/)
  })
})

/**
 * شاشةُ المنصّة (D-046) — `/panel/channels/:platform`.
 *
 * وثلاثةُ أشياءَ تُثبَت هنا: أنّها محروسةٌ كاللوحة، وأنّها تعرض ما نُشر
 * برابطه، وأنّ ما لم يُبنَ له سائقٌ **يُقال سببُه لا «قريبا»**.
 */
describe('شاشةُ المنصّة', () => {
  it('لا تُفتَح بلا جلسة — والحارسُ هو حارسُ اللوحة نفسه', async () => {
    const response = await app.request('/panel/channels/linkedin', {}, env)
    expect(response.status).toBe(401)
  })

  it('ومنصّةٌ لا وجودَ لها ٤٠٤ — لا صفحةٌ فارغة', async () => {
    const cookie = await login()
    const response = await app.request(
      '/panel/channels/myspace', withSession(cookie), env,
    )
    expect(response.status).toBe(404)
  })

  it('تعرض المنشورَ برابطه عند المنصّة', async () => {
    const cookie = await login()
    db.raw
      .prepare(
        `INSERT INTO accounts (id, platform, kind, external_id, display_name, status)
         VALUES ('linkedin:member:abc', 'linkedin', 'member', 'abc', 'عمر', 'active')`,
      )
      .run()
    db.raw
      .prepare(
        `INSERT INTO posts (id, account_id, platform, type, text, scheduled_at,
                            status, idempotency_key, approved_by, approved_at)
         VALUES ('p1', 'linkedin:member:abc', 'linkedin', 'text', 'نصُّ المنشور',
                 '2026-09-01T09:00:00Z', 'published', 'k1', 'omar', '2026-09-01T08:00:00Z')`,
      )
      .run()
    db.raw
      .prepare(
        `INSERT INTO publish_attempts
           (id, post_id, idempotency_key, attempt_no, request_json,
            platform_post_id, status)
         VALUES ('a1', 'p1', 'k1', 1, '{}', 'urn:li:share:99', 'succeeded')`,
      )
      .run()

    const html = await (
      await app.request('/panel/channels/linkedin', withSession(cookie), env)
    ).text()
    expect(html).toContain('نصُّ المنشور')
    expect(html).toContain('linkedin.com/feed/update/')
  })

  it('وما لم يُبنَ يقول سببَه لا «قريبا»', async () => {
    const cookie = await login()
    const html = await (
      await app.request('/panel/channels/snapchat', withSession(cookie), env)
    ).text()
    expect(html).toContain('منصّةٌ لم تُبنَ')
    // السببُ يُصدَّق، والوعدُ يُنتظَر ثمّ يُنسى
    expect(html).not.toContain('قريبا')
    expect(html).toContain('سائقا يُكتب لها وحدها')
  })

  it('ولا زرَّ ربطٍ لما لم يُبنَ — ولو فُتحت شاشتُه', async () => {
    const cookie = await login()
    const html = await (
      await app.request('/panel/channels/snapchat', withSession(cookie), env)
    ).text()
    expect(html).not.toContain('/oauth/snapchat/start')
  })

  /**
   * **المرتبةُ الثالثة تُقال ولا تُخفى** (D-056).
   *
   * منصّةٌ تُربَط ولا تنشر: زرُّ ربطها يعمل، **ويجب أن يعرف مالكُها
   * ذلك قبل أن يربط** لا بعد أوّل جدولةٍ تُردّ.
   */
  it('وما يُربَط ولا ينشر يقول الاثنين معا', async () => {
    const cookie = await login()
    // **و TikTok خرجت من هذه المرتبة** بسائقها (D-092)، فبقيت YouTube
    for (const platform of ['youtube']) {
      const html = await (
        await app.request(`/panel/channels/${platform}`, withSession(cookie), env)
      ).text()
      expect(html, platform).toContain('تُربَط ولا تنشر')
      // ولا يُعرَض حصادُ نشرٍ لمنصّةٍ لا تنشر — أصفارٌ تُقرأ فشلا
      expect(html, platform).not.toContain('لم يُنشر شيءٌ بعد')
    }
  })

  /** **وما صار ينشر لا يبقى يقول إنّه لا ينشر** — الشاشةُ تتبع السائق. */
  it('و TikTok لم تعد تقول «تُربَط ولا تنشر»', async () => {
    const cookie = await login()
    const html = await (
      await app.request('/panel/channels/tiktok', withSession(cookie), env)
    ).text()
    expect(html).not.toContain('تُربَط ولا تنشر')
  })

  it('وتقول ما نقص من النطاقات بالاسم ومَن يمنحه', async () => {
    const cookie = await login()
    db.raw
      .prepare(
        `INSERT INTO accounts (id, platform, kind, external_id, display_name, status)
         VALUES ('linkedin:member:abc', 'linkedin', 'member', 'abc', 'عمر', 'active')`,
      )
      .run()
    // رمزٌ بالهويّة وحدها — وهي الحالُ بعد مخرج النجاة في D-045
    db.raw
      .prepare(
        `INSERT INTO tokens (account_id, access_enc, access_iv, expires_at, scopes)
         VALUES ('linkedin:member:abc', 'e', 'i', '2026-12-01T00:00:00Z', 'openid profile')`,
      )
      .run()

    const html = await (
      await app.request('/panel/channels/linkedin', withSession(cookie), env)
    ).text()
    expect(html).toContain('w_member_social')
    expect(html).toContain('Share on LinkedIn')
    expect(html).toContain('نطاقا ناقصا')
  })
})

/**
 * ضبطُ تطبيقَي OAuth من اللوحة (D-042).
 *
 * وأخطرُ ما يُختبَر: **أنّ السرَّ لا يعود إلى الشاشة بعد حفظه**.
 */
describe('ضبطُ التطبيق من اللوحة', () => {
  async function save(cookie: string, id = '78k4gm3yw1g18e', secret = 'WPL_AP1.سرّيّةٌ.طويلة') {
    const body = new FormData()
    body.set('platform', 'linkedin')
    body.set('client_id', id)
    body.set('client_secret', secret)
    return app.request('/panel/channels/app', withSession(cookie, { method: 'POST', body }), env)
  }

  it('يحفظ مشفَّرا، ولا يُخزَّن السرُّ خاما', async () => {
    const cookie = await login()
    await save(cookie)

    const row = db.raw
      .prepare('SELECT client_id, secret_enc, hint FROM oauth_apps WHERE platform = ?')
      .get('linkedin') as { client_id: string; secret_enc: string; hint: string }
    expect(row.client_id).toBe('78k4gm3yw1g18e')
    expect(row.secret_enc).not.toContain('سرّيّةٌ')
    expect(row.hint).not.toContain('سرّيّةٌ')
  })

  it('**ولا يعود السرُّ إلى الشاشة** — قناعُه وحده', async () => {
    const cookie = await login()
    await save(cookie)
    const html = await (await app.request('/panel', withSession(cookie), env)).text()

    expect(html).not.toContain('سرّيّةٌ')
    expect(html).not.toContain('WPL_AP1')
    // والمعرّفُ علنيٌّ فيظهر
    expect(html).toContain('78k4gm3yw1g18e')
  })

  it('ويصير الربطُ ممكنا — بعد أن كان «تنتظرك»', async () => {
    const cookie = await login()
    const before = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(before).toContain('دليلُ ضبط التطبيق')

    await save(cookie)
    const after = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(after).toContain('/oauth/linkedin/start')
  })

  it('ويُعدّ مسدودا في /ready بدل أن يبقى ناقصا', async () => {
    const cookie = await login()
    await save(cookie)
    const ready = (await (await app.request('/ready', {}, env)).json()) as {
      missing_secrets: string[]
      configured_in_vault: string[]
    }
    expect(ready.configured_in_vault).toContain('LINKEDIN_CLIENT_SECRET')
    expect(ready.missing_secrets).not.toContain('LINKEDIN_CLIENT_SECRET')
    // و X ما زال ناقصا: كلٌّ على حدة
    expect(ready.missing_secrets).toContain('X_CLIENT_SECRET')
  })

  it('والسجلُّ يحفظ مَن بدّل ولأيّ منصّة — ولا يحفظ القيمة', async () => {
    const cookie = await login()
    await save(cookie)
    const audit = db.raw
      .prepare("SELECT target, detail FROM audit_log WHERE action = 'oauth_app.save'")
      .all() as { target: string; detail: string }[]
    expect(audit).toHaveLength(1)
    expect(audit[0]?.target).toBe('linkedin')
    expect(JSON.stringify(audit)).not.toContain('سرّيّةٌ')
  })

  it('والسرُّ نفسه يُقال إنّه لم يتغيّر — فلا يُوهَم المالك', async () => {
    const cookie = await login()
    await save(cookie)
    await save(cookie)
    const audit = db.raw
      .prepare("SELECT detail FROM audit_log WHERE action = 'oauth_app.save' ORDER BY rowid")
      .all() as { detail: string }[]
    expect(audit.map((a) => a.detail)).toEqual(['saved', 'unchanged'])
  })

  it('ومنصّةٌ غير معروفة تُردّ ولا تصل إلى القاعدة', async () => {
    const cookie = await login()
    const body = new FormData()
    body.set('platform', 'snapchat')
    body.set('client_id', 'a')
    body.set('client_secret', 'b')
    await app.request('/panel/channels/app', withSession(cookie, { method: 'POST', body }), env)

    const rows = db.raw.prepare('SELECT platform FROM oauth_apps').all()
    expect(rows).toHaveLength(0)
  })

  it('وبلا رمز CSRF لا يُحفَظ شيء', async () => {
    const cookie = await login()
    const body = new FormData()
    body.set('platform', 'linkedin')
    body.set('client_id', 'a')
    body.set('client_secret', 'b')
    const response = await app.request(
      '/panel/channels/app',
      { method: 'POST', body, headers: { Cookie: cookie } },
      env,
    )
    expect(response.status).toBe(403)
    expect(db.raw.prepare('SELECT platform FROM oauth_apps').all()).toHaveLength(0)
  })
})

/**
 * **الشريطُ فيه روابطُ صفحاتٍ حقيقيّة** (D-087).
 *
 * وهذا ما يجعل تصفيةَ المراسي في السكربت شرطا لا تحسينا: لو خلا الشريطُ
 * منها لما ظهر العطل. فيُحرَس الطرفان — الشاشةُ التي تعرضها، والسكربتُ
 * الذي لا يخطفها.
 */
describe('روابطُ الشريط — والصفحاتُ منها تُفتَح فعلا', () => {
  it('في الشريط روابطُ صفحاتٍ لا مراسيَ فقط', async () => {
    const cookie = await login()
    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    const nav = /<nav class="tabs"[\s\S]*?<\/nav>/.exec(html)?.[0] ?? ''
    const hrefs = [...nav.matchAll(/<a href="([^"]+)"/g)].map((m) => m[1]!)
    expect(hrefs.filter((h) => !h.startsWith('#')).length).toBeGreaterThan(0)
    expect(hrefs).toContain('/panel/tasks')
  })

  it('و«ما عليك» تُفتَح صفحةً — لا تُعيد إلى اللوحة', async () => {
    const cookie = await login()
    const response = await app.request('/panel/tasks', withSession(cookie), env)
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('مهامُّ المالك')
  })

  it('وشاشةُ المنصّة كذلك', async () => {
    const cookie = await login()
    const response = await app.request('/panel/channels/linkedin', withSession(cookie), env)
    expect(response.status).toBe(200)
  })
})

/**
 * **التوزيعُ يُعرَض ثمّ يقع** (D-089).
 *
 * قال المالك: «تسهيل عمليّة الجدولة، حيث إنّ استخدامها صعب». وأثقلُ ما
 * فيها تكرارُ الاستمارة: عشرُ مسوّداتٍ معتمَدةٍ = عشرُ استماراتٍ يدويّة.
 *
 * وأخطرُ ما في علاجها **أن يُعرض جدولٌ ويقع غيرُه**. فالمعاينةُ لا تكتب
 * شيئا، والتنفيذُ لا يتجاوز `schedulePost` ولا يخترع وجهةً من النموذج.
 */
describe('توزيعُ المعتمَد على أيّام', () => {
  async function seedApproved(platform: 'linkedin' | 'x' = 'linkedin'): Promise<string> {
    const id = crypto.randomUUID()
    await db
      .prepare(
        `INSERT INTO posts (id, platform, type, text, status, idempotency_key, approved_by, approved_at)
         VALUES (?, ?, 'text', ?, 'approved', ?, 'panel:token', '2026-09-08T07:00:00Z')`,
      )
      .bind(id, platform, `منشورٌ ${id.slice(0, 6)}\nوسطرٌ ثانٍ`, `k-${id}`)
      .run()
    return id
  }

  async function seedAccount(
    platform: 'linkedin' | 'x' = 'linkedin',
    kind = 'member',
  ): Promise<string> {
    const id = crypto.randomUUID()
    await db
      .prepare(
        'INSERT INTO accounts (id, platform, kind, external_id, display_name, status) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .bind(id, platform, kind, id.slice(0, 8), 'عمر', 'active')
      .run()
    return id
  }

  function soon(): string {
    return new Date(Date.now() + 3600_000).toISOString().slice(0, 16)
  }

  async function preview(cookie: string, gap = '24'): Promise<Response> {
    const body = new FormData()
    body.set('start', soon())
    body.set('gap', gap)
    return await app.request('/panel/drafts/spread', withSession(cookie, { method: 'POST', body }), env)
  }

  it('**المعاينةُ لا تكتب شيئا** — ولا منشورَ يصير مجدولا بعرضه', async () => {
    const posts = [await seedApproved(), await seedApproved(), await seedApproved()]
    await seedAccount()
    const cookie = await login()

    const response = await preview(cookie)
    expect(response.status).toBe(200)
    const html = await response.text()
    expect(html).toContain('اعتمد التوزيع')
    expect(html).toContain('ولا يقع منه شيءٌ حتّى تضغط')

    for (const id of posts) {
      const row = await db.prepare('SELECT status FROM posts WHERE id = ?').bind(id).first<{ status: string }>()
      expect(row?.status).toBe('approved')
    }
  })

  it('وتعرض كلَّ خانةٍ بموعدها — لا عددا مجرّدا', async () => {
    await seedApproved()
    await seedApproved()
    await seedAccount()
    const cookie = await login()

    const html = await (await preview(cookie, '6')).text()
    // موعدان اثنان بصيغةٍ تُقرأ، وفاصلٌ يُقال
    expect((html.match(/data-utc="/g) ?? []).length).toBe(2)
    expect(html).toContain('كلُّ 6 ساعةً')
  })

  it('**والتنفيذُ يجدول ما عُرض** — بحالةٍ ومواعيدَ متتابعة', async () => {
    const posts = [await seedApproved(), await seedApproved()]
    const account = await seedAccount()
    const cookie = await login()

    const body = new FormData()
    body.set('start', soon())
    body.set('gap', '24')
    for (const id of posts) body.append('post', id)
    await app.request(
      '/panel/drafts/spread/apply',
      withSession(cookie, { method: 'POST', body }),
      env,
    )

    const { results } = await db
      .prepare('SELECT id, status, account_id, scheduled_at FROM posts ORDER BY scheduled_at')
      .all<{ id: string; status: string; account_id: string; scheduled_at: string }>()
    expect(results.filter((r) => r.status === 'queued')).toHaveLength(2)
    for (const row of results) expect(row.account_id).toBe(account)
    // أربعٌ وعشرون ساعةً بينهما بالضبط
    const gap =
      new Date(`${results[1]!.scheduled_at.replace(' ', 'T')}Z`).getTime() -
      new Date(`${results[0]!.scheduled_at.replace(' ', 'T')}Z`).getTime()
    expect(gap).toBe(24 * 3600_000)
  })

  it('**وما لم يُعرَض لا يُنفَّذ** — منشورٌ خارجَ النموذج يبقى معتمَدا', async () => {
    const shown = await seedApproved()
    const hidden = await seedApproved()
    await seedAccount()
    const cookie = await login()

    const body = new FormData()
    body.set('start', soon())
    body.set('gap', '24')
    body.append('post', shown)
    await app.request(
      '/panel/drafts/spread/apply',
      withSession(cookie, { method: 'POST', body }),
      env,
    )

    const one = await db.prepare('SELECT status FROM posts WHERE id = ?').bind(shown).first<{ status: string }>()
    const two = await db.prepare('SELECT status FROM posts WHERE id = ?').bind(hidden).first<{ status: string }>()
    expect(one?.status).toBe('queued')
    expect(two?.status).toBe('approved')
  })

  it('**ولا يلتفّ حول حارس الجدولة** — صفحةٌ ليست وجهةً تُنشَر باسمها', async () => {
    await seedApproved()
    await seedApproved()
    await seedAccount('linkedin', 'org')
    const cookie = await login()

    const html = await (await preview(cookie)).text()
    expect(html).toContain('لا شيءَ يُوزَّع')
    expect(html).toContain('لا قناة')
  })

  it('وفاصلٌ خارجَ المدى يُقصّ ولا تُردّ الاستمارة', async () => {
    await seedApproved()
    await seedApproved()
    await seedAccount()
    const cookie = await login()

    const response = await preview(cookie, '99999')
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('كلُّ 168 ساعةً')
  })

  it('والشريطُ لا يظهر على معتمَدةٍ واحدة — التوزيعُ لاثنتين فصاعدا', async () => {
    await seedApproved()
    await seedAccount()
    const cookie = await login()

    const one = await (await app.request('/panel', { headers: { Cookie: cookie } }, env)).text()
    expect(one).not.toContain('وزّع المعتمَد')

    await seedApproved()
    const two = await (await app.request('/panel', { headers: { Cookie: cookie } }, env)).text()
    expect(two).toContain('وزّع المعتمَد')
  })

  it('ويُسجَّل في الدفتر ما وقع — لا ما طُلب', async () => {
    const posts = [await seedApproved(), await seedApproved()]
    await seedAccount()
    const cookie = await login()

    const body = new FormData()
    body.set('start', soon())
    body.set('gap', '24')
    for (const id of posts) body.append('post', id)
    await app.request(
      '/panel/drafts/spread/apply',
      withSession(cookie, { method: 'POST', body }),
      env,
    )

    const audit = await db
      .prepare("SELECT target, detail FROM audit_log WHERE action = 'draft.spread'")
      .first<{ target: string; detail: string }>()
    expect(audit?.target).toBe('2')
    expect(audit?.detail).toBe('done:2')
  })
})

/**
 * **مراجعةُ الكلمات تُعرَض ولا تمنع** (D-090).
 *
 * قال المالك: «ولا تعتمد على عدد حروفٍ معيّنة، يجب أن تكون متغيّرة،
 * ومراجعةٌ للكلمات».
 */
describe('لوحُ المراجعة في اللوحة', () => {
  async function seedDraft(text: string, status = 'draft'): Promise<string> {
    const id = crypto.randomUUID()
    await db
      .prepare(
        `INSERT INTO posts (id, platform, type, text, status, idempotency_key, approved_by, approved_at)
         VALUES (?, 'linkedin', 'text', ?, ?, ?, ?, ?)`,
      )
      .bind(
        id, text, status, `k-${id}`,
        status === 'draft' ? null : 'panel:token',
        status === 'approved' || status === 'edited' ? '2026-09-07T07:00:00Z' : null,
      )
      .run()
    return id
  }

  const DIRTY =
    'ومما لا شك فيه ان الحوكمةَ تبدأ بالحوكمة، ولا حوكمةَ بلا قرار. والحوكمةُ قرار.\n\nما رأيكم؟'
  const CLEAN =
    'البرنامجُ الذي لا صاحبَ له لا يفشل — يذبل.\n\nولا أحد يعلن ذبوله. وهذا أخطر من السقوط الصريح.'

  it('يعرض الملحوظات ولا يمنع الاعتماد', async () => {
    const id = await seedDraft(DIRTY)
    const cookie = await login()

    const html = await (await app.request('/panel', { headers: { Cookie: cookie } }, env)).text()
    expect(html).toContain('ملحوظةً على الصياغة')
    expect(html).toContain('تُقرأ ولا تمنع')

    // والاعتمادُ يمرّ كما هو — الملحوظةُ ليست حارسا
    const body = new FormData()
    body.set('id', id)
    body.set('text', DIRTY)
    body.set('do', 'approve')
    await app.request('/panel/drafts/decide', withSession(cookie, { method: 'POST', body }), env)

    const row = await db.prepare('SELECT status FROM posts WHERE id = ?').bind(id).first<{ status: string }>()
    // «معتمَدة» أو «عُدّلت ثمّ اعتُمدت» — كلتاهما مرّت، والملحوظةُ لم تمنع
    expect(['approved', 'edited']).toContain(row?.status)
  })

  it('**ونصٌّ نظيفٌ بلا لوح** — ملحوظةٌ كاذبةٌ تُفقِد الباقيَ ثقتَه', async () => {
    await seedDraft(CLEAN)
    const cookie = await login()
    const html = await (await app.request('/panel', { headers: { Cookie: cookie } }, env)).text()
    expect(html).not.toContain('ملحوظةً على الصياغة')
  })

  it('ولا لوحَ على ما بُتّ فيه ورُفض — فات وقتُ تعديله', async () => {
    await seedDraft(DIRTY, 'rejected')
    const cookie = await login()
    const html = await (await app.request('/panel', { headers: { Cookie: cookie } }, env)).text()
    expect(html).not.toContain('ملحوظةً على الصياغة')
  })
})

/**
 * **ما يُعرَض في جدول التوجيه يُقبَل حفظُه** (D-091).
 *
 * كانت `KNOWN_TASKS` ثلاثا مكتوبةً حرفا و`readRoutes` تعرض مفاتيحَ
 * `ROUTES` كلَّها — **فيُعرَض `plan` ويُردّ عند الحفظ**. والمالكُ يبدّل
 * نموذجَه فيسمع «مهمّةٌ غير معروفة» على مهمّةٍ يراها أمامه.
 */
describe('توجيهُ كلِّ مهمّةٍ يُحفَظ لا يُعرَض وحسب', () => {
  async function post(cookie: string, path: string, fields: Record<string, string>): Promise<Response> {
    const body = new FormData()
    for (const [k, v] of Object.entries(fields)) body.set(k, v)
    return await app.request(path, withSession(cookie, { method: 'POST', body }), env)
  }

  it('كلُّ مهمّةٍ معروضةٍ تُقبَل — الخطّةُ والفيديو معهما', async () => {
    const cookie = await login()
    for (const task of ['analyze', 'draft', 'plan', 'image', 'video']) {
      const response = await post(cookie, '/panel/routes', {
        task, provider: 'anthropic', model: 'claude-opus-5',
      })
      expect([200, 303], task).toContain(response.status)
      const row = await db
        .prepare('SELECT model FROM task_routes WHERE task = ?')
        .bind(task)
        .first<{ model: string }>()
      expect(row?.model, task).toBe('claude-opus-5')
    }
  })

  it('وما ليس مهمّةً يُردّ — القائمةُ لم تنفتح على كلّ شيء', async () => {
    const cookie = await login()
    const response = await post(cookie, '/panel/routes', {
      task: 'publish', provider: 'anthropic', model: 'claude-opus-5',
    })
    expect(response.status).toBe(400)
  })

  it('ويُعرَض لكلِّ مهمّةٍ اسمٌ عربيّ — لا مفتاحٌ خام', async () => {
    const cookie = await login()
    const html = await (await app.request('/panel', { headers: { Cookie: cookie } }, env)).text()
    expect(html).toContain('الخطّة — منطقُ الأسبوع')
    expect(html).toContain('الفيديو — تحريكُ الصورة')
  })
})

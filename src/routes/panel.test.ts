/**
 * اللوحة تُختبَر من طرفها إلى طرفها: القاعدة حقيقيّة و KV حقيقيّ،
 * والصفحة تُقرأ كنصٍّ كما يراها المتصفّح.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { toBase64 } from '../lib/crypto'
import { readSettings } from '../lib/settings'
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

  it('تقول إنّ طبقة الكتابة لم تُبنَ — لا تعرض جدولا فارغا يُظنّ عطلا', async () => {
    const cookie = await login()
    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).toContain('طبقة الكتابة لم تُبنَ بعد')
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

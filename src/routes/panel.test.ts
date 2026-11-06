/**
 * اللوحة تُختبَر من طرفها إلى طرفها: القاعدة حقيقيّة و KV حقيقيّ،
 * والصفحة تُقرأ كنصٍّ كما يراها المتصفّح.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { codeFrom, emailLogin, fakeMailer, requestCode } from '../test/emailLogin'
import { CODE_SENT_NOTE } from './panelView'
import { everyPane, PANEL_PAGES } from '../test/panelPages'
import { anchorPath } from '../lib/nav/panes'
import { toBase64 } from '../lib/crypto'
import { fingerprint } from '../lib/security/digest'
import { readSettings, writeSetting } from '../lib/settings'
import { getProvider, resolveKey, setEnabled, upsertProvider } from '../lib/providers'
import { recordCost } from '../lib/cost'
import { writeRoute } from '../lib/ai/routes'
import { weekStart } from '../lib/plan/prompt'
import { COOKIE } from '../lib/session'
import { fakeDb, fakeKv, type FakeDb } from '../test/fakes'
import { app } from '../index'
import { CHANNELS } from '../lib/channels'
import { ideaKey } from '../lib/draft/job'

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
  const response = await emailLogin(app, env)
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
    expect(html).toContain('name="email"')
    expect(html).not.toContain('name="token"')
    expect(html).not.toContain('nav class="tabs"')
    expect(html).not.toContain('/panel/settings')
  })

  it('رمز خطأ يردّ 401 ولا يُنشئ جلسة', async () => {
    await requestCode(app, env)
    const body = new FormData()
    body.set('code', '000000x')
    const response = await app.request('/panel/login', { method: 'POST', body }, env)
    expect(response.status).toBe(401)
    expect(response.headers.get('Set-Cookie')).toBeNull()
    // ما في KV عدّادُ محاولةٍ لا جلسة
    expect(kv.ttlOf('login-attempts:unknown')).not.toBeNull()
  })

  it('يعدّ المحاولات ويحظر بعد خمس', async () => {
    const attempt = async (): Promise<Response> => {
      const body = new FormData()
      body.set('code', 'wrong')
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
      bad.set('code', 'wrong')
      await app.request('/panel/login', { method: 'POST', body: bad }, env)
    }
    const response = await emailLogin(app, env)
    expect(response.status).toBe(429)
    expect(response.headers.get('Set-Cookie')).toBeNull()
  })

  it('النجاح يمحو العدّ — مَن أخطأ ثمّ أصاب لا يبقى محسوبا', async () => {
    const bad = new FormData()
    bad.set('code', 'wrong')
    await app.request('/panel/login', { method: 'POST', body: bad }, env)
    await login()
    expect(kv.ttlOf('login-attempts:unknown')).toBeNull()
  })

  it('بلا ADMIN_TOKEN اللوحة مقفلة لا مفتوحة', async () => {
    const response = await emailLogin(app, { ...env, ADMIN_TOKEN: '' })
    expect(response.status).toBe(401)
    expect(await response.text()).toContain('مقفلة')
  })

  it('الرمز الصحيح يعطي كعكة بقيودها الثلاثة', async () => {
    const response = await emailLogin(app, env)
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
    expect(html).toContain('اكتب بريدك ليصلك رمز الدخول')
  })
  /*
   * ‏**ويعود المالكُ إلى ما طلبه لا إلى الرئيسيّة** (ر-11، الخطّة 7.11): كان كلُّ توجيهٍ بعد
   * ‏الدخول `/panel` ثابتًا، فمن فتح «التقرير» من رابطٍ محفوظ ضغط مرّةً ثانية.
   */
  describe('العودة إلى الصفحة المطلوبة', () => {
    async function signIn(next: string | null, path = '/panel/login'): Promise<Response> {
      return await emailLogin(app, env, { path, ...(next === null ? {} : { next }) })
    }

    // ‏والمرساةُ تعود (D-210): سكربتُ الدخول يُلحقها بـ«next»، والخادمُ يوجّه إليها كما هي
    it('«next» بمرساة بطاقة يعود إليها بعد الدخول، والسكربت يُلحقها', async () => {
      const response = await signIn('/panel#d-0f6c1d2e-aaaa-bbbb-cccc-1234567890ab')
      expect(response.headers.get('Location')).toBe('/panel#d-0f6c1d2e-aaaa-bbbb-cccc-1234567890ab')
      // ‏وإلحاقُ المرساة في المتصفّح يقيسه `npm run swap` (الجلسةُ انتهت وسط فعل)
    })

    it('صفحة تُطلَب بلا جلسة تحمل مسارَها في نموذج الدخول — ولا تقول «انتهت» لمن لم يدخل', async () => {
      const response = await app.request('/panel/report?week=2026-09-28', {}, env)
      expect(response.status).toBe(401)
      const html = await response.text()
      expect(html).toContain('name="next" id="login-next" value="/panel/report?week=2026-09-28"')
      expect(html).toContain('action="/panel/login/code?next=%2Fpanel%2Freport%3Fweek%3D2026-09-28"')
      expect(html).not.toContain('انتهت الجلسة')
    })

    it('ومن سقطت جلستُه يُقال له ذلك', async () => {
      const html = await (await app.request('/panel/report', { headers: { Cookie: `${COOKIE}=gone` } }, env)).text()
      expect(html).toContain('انتهت الجلسة. ادخل لتكمل من حيث توقّفت.')
    })

    it('والدخول يوجّه إليها، ومرساتُها معها', async () => {
      expect((await signIn('/panel/report')).headers.get('Location')).toBe('/panel/report')
      expect((await signIn('/panel#posts')).headers.get('Location')).toBe('/panel#posts')
      // ‏ومن عنوان النموذج حين يغيب الحقل
      expect((await signIn(null, '/panel/login?next=%2Fpanel%2Ftasks')).headers.get('Location')).toBe('/panel/tasks')
      expect((await signIn(null)).headers.get('Location')).toBe('/panel')
    })

    it('**ولا توجيه خارج اللوحة** — الوجهة مدخل من المتصفّح', async () => {
      for (const evil of ['https://evil.example/panel', '//evil.example', '/\\evil.example', '/panel//evil.example', '/panelx']) {
        expect((await signIn(evil)).headers.get('Location')).toBe('/panel')
      }
    })

    it('ورمز خاطئ يعيد رسم الصفحة بوجهتها — فالمحاولة الثانية لا تفقدها', async () => {
      const body = new FormData()
      body.set('code', 'wrong')
      body.set('next', '/panel/report')
      const html = await (await app.request('/panel/login', { method: 'POST', body }, env)).text()
      expect(html).toContain('value="/panel/report"')
    })

    /*
     * ‏**و`GET /panel/login` لا يردّ JSON خامًّا** (ر-11): صفحةُ الكلمة الخاطئة تبقى على هذا
     * ‏العنوان، وإعادةُ تحميلها على الهاتف تطلبه `GET`. فيعود إلى وجهته، ولا تُرسَل الكلمةُ ثانيةً.
     */
    it('وإعادة تحميل صفحة الدخول تعود إلى الوجهة لا إلى سطر JSON', async () => {
      const plain = await app.request('/panel/login', {}, env)
      expect(plain.status).toBe(303)
      expect(plain.headers.get('Location')).toBe('/panel')
      const back = await app.request('/panel/login?next=%2Fpanel%2Freport', {}, env)
      expect(back.headers.get('Location')).toBe('/panel/report')
      const evil = await app.request('/panel/login?next=%2F%2Fevil.example', {}, env)
      expect(evil.headers.get('Location')).toBe('/panel')
    })
  })
})

describe('اللوحة لا تسرّب', () => {
  it('لا رمز إدارة ولا مفتاح مزوّد في الصفحة', async () => {
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

  it('اسم ملفّ يحمل HTML يُهرَب ولا يُحقَن', async () => {
    await seedSource('<img src=x onerror=alert(1)>تقرير')
    const cookie = await login()
    const html = await (await everyPane((p) => app.request(p, withSession(cookie), env)))
    expect(html).not.toContain('<img src=x onerror')
    expect(html).toContain('&lt;img src=x onerror')
  })
})

describe('ما تعرضه اللوحة', () => {
  it('تعرض حال «يعمل» وتقرأ السقوف من القاعدة', async () => {
    const cookie = await login()
    const html = await (await everyPane((p) => app.request(p, withSession(cookie), env)))
    expect(html).toContain('يعمل')
    expect(html).toContain('لوحة التحكّم')
    expect(html).toContain('سقف التحليل')
  })

  it('تعرض المصادر وحالها', async () => {
    await seedSource('تقرير الأثر')
    const cookie = await login()
    const html = await (await everyPane((p) => app.request(p, withSession(cookie), env)))
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
    const html = await (await everyPane((p) => app.request(p, withSession(cookie), env)))
    expect(html).toContain('تغيّر بعد التحليل')
  })

  it('تعرض الخلاصة وسبب الدرجة — لا الرقم وحده', async () => {
    const id = await seedSource('تقرير', 'md5:a')
    await db
      .prepare('INSERT INTO content_items (id, source_id, summary, themes_json, worth_score) VALUES (?, ?, ?, ?, ?)')
      .bind(
        crypto.randomUUID(),
        id,
        'خلاصة عربية للمصدر',
        JSON.stringify({ hash: 'md5:a', themes: ['الوقف'], reason: 'رقم من الميدان' }),
        0.82,
      )
      .run()
    const cookie = await login()
    const html = await (await everyPane((p) => app.request(p, withSession(cookie), env)))
    expect(html).toContain('خلاصة عربية للمصدر')
    expect(html).toContain('رقم من الميدان')
    expect(html).toContain('الوقف')
    expect(html).toContain('0.82')
  })

  it('تعرض قسم الكتابة، وتقول إنّ الاعتماد لا ينشر', async () => {
    const cookie = await login()
    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).toContain('<h2>منشور جديد</h2>')
    expect(html).toContain('<input type="radio" name="cmp" value="write">من مصدر')
    // الوعدُ المكتوب في الصفحة هو الوعدُ المنفَّذ في القاعدة (D-009)
    expect(html).toContain('لا يُنشر منشور بلا موافقة مسجّلة')
    // ولا زرَّ نشرٍ هنا: الاعتمادُ يفتح البابَ ولا يعبره
    expect(html).not.toContain('action="/panel/drafts/publish"')
  })

  it('تسمّي السرّ الناقص لمزوّد غير مضبوط', async () => {
    const cookie = await login()
    const html = await (await everyPane((p) => app.request(p, withSession(cookie), env)))
    expect(html).toContain('ANTHROPIC_API_KEY')
    expect(html).toContain('لا مفتاح')
  })

  it('صفّ بتحليل فاسد لا يُسقط اللوحة', async () => {
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

describe('اللوح المحوريّ (D-120)', () => {
  /** منشورٌ حقيقيٌّ في القاعدة — **والجدولُ يُقرأ من الصفحة كما تُعرَض**. */
  function seed(): void {
    db.raw.exec(
      `INSERT INTO accounts (id, platform, kind, external_id, display_name, status)
       VALUES ('a1','linkedin','member','e1','شخصيّ','active'),
              ('a2','x','member','e2','حساب X','active')`,
    )
    db.raw.exec(
      // **والمنشورُ يحمل موافقتَه** (D-009): قيدٌ في القاعدة يمنع
      // «منشورٌ» بلا `approved_at` — فالبذرةُ تحترمه كما يحترمه الناشر
      `INSERT INTO posts (id, account_id, platform, type, text, scheduled_at,
                          status, idempotency_key, approved_by, approved_at)
       VALUES ('p1','a1','linkedin','text','نصّ',datetime('now','-2 days'),
               'published','i1','panel',datetime('now','-2 days')),
              ('p2','a1','linkedin','text','نصّ',datetime('now','-1 days'),
               'published','i2','panel',datetime('now','-1 days')),
              ('p3','a2','x','text','نصّ',datetime('now','-1 days'),
               'failed','i3',NULL,NULL),
              -- **ومسوّدة بلا حساب**: تُكتب قبل الربط، وهي أهمّ ما ينتظر
              ('p4',NULL,'x','text','نصّ',datetime('now'),'draft','i4',NULL,NULL)`,
    )
    db.raw.exec(
      `INSERT INTO publish_attempts (id, post_id, idempotency_key, attempt_no,
                                     request_json, status)
       VALUES ('t1','p1','k1',1,'{}','succeeded'),
              ('t2','p3','k3',1,'{}','failed')`,
    )
  }

  it('يبني الجدول من القاعدة ويعرضه', async () => {
    const cookie = await login()
    seed()
    const html = await (await everyPane((p) => app.request(p, withSession(cookie), env)))
    expect(html).toContain('data-pane="results"')
    expect(html).toContain('<div data-sub id="pivot">')
    expect(html).toContain('table class="card card-inset pv"')
    // صفّان: منصّتان — **والاسمُ كما يُقرأ لا كما في القاعدة** (D-123):
    // كان الاختبارُ يثبّت `linkedin` خاما، فثبّت العيبَ الذي كان يجب أن يمسكه
    // ورأسُ الصفّ بابٌ إلى شاشة المنصّة منذ D-132
    expect(html).toContain('<th scope="row"><a href="/panel/channels/linkedin" data-tip="شاشة LinkedIn">LinkedIn</a></th>')
    expect(html).toContain('<th scope="row"><a href="/panel/channels/x" data-tip="شاشة X">X</a></th>')
    expect(html).not.toContain('>linkedin<')
  })

  /**
   * **ما يُعرَض يُنزَّل** (D-126): الرابطُ يحمل العرضَ نفسَه، والملفُّ يُكتب في
   * الخادم بالأسماء التي تُرسَم — ولا يُفتَح لغير صاحب الجلسة.
   */
  it('ويُنزَّل CSV بالعرض نفسِه، ولصاحب الجلسة وحدَه', async () => {
    const cookie = await login()
    seed()
    const html = await (await app.request('/panel/analysis?rows=platform&cols=status', withSession(cookie), env)).text()
    expect(html).toContain('href="/panel/pivot.csv?rows=platform&amp;cols=status&amp;m=count&amp;days=30" download')

    const res = await app.request('/panel/pivot.csv?rows=platform&cols=status&m=count&days=30', withSession(cookie), env)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('text/csv; charset=utf-8')
    expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="sada-platform-status-count-30d.csv"')
    // و`text()` يقصّ علامةَ BOM وفق مواصفة Fetch — فتُقرأ البايتاتُ نفسُها
    const bytes = new Uint8Array(await res.clone().arrayBuffer())
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    const csv = await res.text()
    expect(csv).toContain('LinkedIn')
    expect(csv).toContain('نُشرت')
    expect(csv).not.toContain('linkedin')
    expect(csv).not.toContain('published')

    const anon = await app.request('/panel/pivot.csv?rows=platform', {}, env)
    expect(anon.status).toBe(303)
    expect(anon.headers.get('Location')).toBe('/panel')
  })

  /**
   * **ومسوّدةٌ بلا حسابٍ تدخل الجدول** — وهي التي تنتظر قرارَ المالك.
   *
   * وأوّلُ صياغةٍ ضمّت `accounts` ضمّا داخليّا **فأسقطتها صامتةً**:
   * `account_id` يقبل الفراغ منذ الترحيل ‏٠٠٠٨، والمنصّةُ على الصفّ.
   */
  it('ومسوّدة لم تُربَط بعد لا تسقط من الجدول', async () => {
    const cookie = await login()
    seed()
    const url = '/panel/analysis?rows=status&cols=none&m=count&days=30'
    const html = await (await app.request(url, withSession(cookie), env)).text()
    expect(html).toContain('<th scope="row">تنتظر قرارك</th>')
  })

  /** **والعنوانُ يحمل العرضَ**: يُنسَخ ويُرسَل ويُحفَظ في المفضّلة. */
  it('والعنوان يغيّر محاورَه', async () => {
    const cookie = await login()
    seed()
    const url = '/panel/analysis?rows=status&cols=none&m=success_rate&days=90'
    const html = await (await app.request(url, withSession(cookie), env)).text()
    expect(html).toContain('<option value="status" selected>')
    expect(html).toContain('<option value="success_rate" selected>')
    expect(html).toContain('<option value="90" selected>')
    // محورٌ واحدٌ فلا عمودَ مجموع
    expect(html).not.toContain('pv-t')
  })

  /**
   * **وقيمةٌ لا تُعرَف تعود إلى افتراضها ولا تُسقط الصفحة.**
   *
   * القيمُ تأتي من الشبكة، **ومدى «‏٩٩٩٩٩ يوما» يمسح الجدولَ كلَّه** في
   * كلّ فتحة. فالمدى قائمةُ سماحٍ لا رقمٌ يُمرَّر.
   */
  it('وقيمة مخترَعة في العنوان لا تُسقط اللوحة', async () => {
    const cookie = await login()
    seed()
    const url = '/panel/analysis?rows=DROP+TABLE&cols=%27%3B--&m=؟&days=99999'
    const response = await app.request(url, withSession(cookie), env)
    expect(response.status).toBe(200)
    const html = await response.text()
    // الافتراضاتُ: منصّةٌ · بلا أعمدة · عدد · ٣٠ يوما
    expect(html).toContain('<option value="platform" selected>')
    expect(html).toContain('<option value="count" selected>')
    expect(html).toContain('<option value="30" selected>')
  })

  /** وجدولٌ فارغٌ يقول لماذا — **لا «لا نتائج» وحدَها**. */
  it('ولا منشور يعطي سببا لا صمتا', async () => {
    const cookie = await login()
    const html = await (await everyPane((p) => app.request(p, withSession(cookie), env)))
    expect(html).toContain('لا منشور في هذا المدى')
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

    const html = await (await everyPane((p) => app.request(p, withSession(cookie), env)))
    expect(html).toContain('موقوف مؤقتا')
    expect(html).toContain('استئناف العمل')
  })

  /*
   * ── لوحُ المالك: من الضغطة إلى الشاشة (D-119) ─────────────────────
   *
   * **ولا يكفي أن يُحفَظ في القاعدة**: المقصودُ أن تتغيّر الشاشةُ التي
   * يفتحها. فيُقرأ `/panel` بعد الحفظ ويُفحَص ما فيه ومـا **ليس** فيه.
   */
  async function submitTiles(cookie: string, ids: readonly string[]): Promise<Response> {
    const body = new FormData()
    body.set('key', 'dashboard_tiles')
    for (const id of ids) body.append('tile', id)
    return app.request('/panel/settings', withSession(cookie, { method: 'POST', body }), env)
  }

  it('اختيار البطاقات يغيّر صدر اللوحة', async () => {
    const cookie = await login()
    /*
     * **ويُفحَص وسمُ البطاقة لا اسمُها.** كلُّ الأسماء الأربعةَ عشرَ
     * مكتوبةٌ في شاشة الاختيار، **فنصٌّ موجودٌ لا يعني بطاقةً معروضة** —
     * وأوّلُ صياغةٍ لهذا الاختبار سقطت بهذا بالذات.
     */
    const k = (label: string): string => `<div class="kv-k">${label}</div>`
    const before = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(before).toContain(k('تحليلات اليوم'))
    expect(before).not.toContain(k('ذروة الإنفاق'))

    expect((await submitTiles(cookie, ['drafts_waiting', 'peak_spend_day', 'live_targets'])).status)
      .toBe(303)
    expect((await readSettings(db)).dashboardTiles)
      .toBe('drafts_waiting,peak_spend_day,live_targets')

    const after = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(after).toContain(k('ذروة الإنفاق'))
    expect(after).toContain(k('مسوّدات تنتظرك'))
    // **وما لم يُختَر يغيب**: لوحٌ يضيف ولا يحذف ليس اختيارا
    expect(after).not.toContain(k('تحليلات اليوم'))
  })

  /** **ومعرِّفٌ مخترَعٌ لا يُخزَّن** — قائمةُ سماحٍ لا منع، كما في D-110. */
  it('ومعرِّف لا يعرفه الكتالوج يُطرَح عند الحفظ', async () => {
    const cookie = await login()
    await submitTiles(cookie, ['drafts_waiting', 'لا_وجود_لها', 'live_targets'])
    expect((await readSettings(db)).dashboardTiles).toBe('drafts_waiting,live_targets')
  })

  /** وما دون الأدنى يعود إلى الأربع — **ولا شاشةَ بيضاء**. */
  it('وواحدة وحدَها تعيد الأربع الأصليّة', async () => {
    const cookie = await login()
    await submitTiles(cookie, ['drafts_waiting'])
    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).toContain('<div class="kv-k">تحليلات اليوم</div>')
    expect(html).toContain('<div class="kv-k">إنفاق هذا الشهر</div>')
  })

  it('السقف يُحفظ ويُقرأ', async () => {
    const cookie = await login()
    await submit(cookie, 'daily_analysis_cap', '25')
    expect((await readSettings(db)).dailyAnalysisCap).toBe(25)
  })

  it('قيمة فوق الحدّ تُقصّ ولا تُرفض — فلا يضيع قصد المالك كلّه', async () => {
    const cookie = await login()
    await submit(cookie, 'daily_analysis_cap', '999999')
    expect((await readSettings(db)).dailyAnalysisCap).toBe(500)
  })

  it('مفتاح غير مسموح به يُرفض — قائمة سماح لا منع', async () => {
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

  it('كعكة مزوّرة لا تُغيّر شيئا', async () => {
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

  it('والحدود تُحفظ وحدَها (D-233): «auto=1» يُجاب بالقيمة المحفوظة، مقصوصةً إلى المدى', async () => {
    const cookie = await login()
    const ok = await post(cookie, '/panel/settings', { key: 'daily_spend_cap_usd', value: '7.5', auto: '1' })
    expect(ok.status).toBe(200)
    expect(await ok.json()).toMatchObject({ ok: true, stored: '7.5' })
    const big = await post(cookie, '/panel/settings', { key: 'daily_spend_cap_usd', value: '9999', auto: '1' })
    expect(((await big.json()) as { stored: string }).stored).toBe('100')
    const html = await (await app.request('/panel/settings', withSession(cookie), env)).text()
    expect(html).toContain('<form class="row" method="POST" action="/panel/settings" data-autosave>')
  })

  it('وسكربت التبديل يجلب «المنشورات» وحدَها (D-233)', async () => {
    const cookie = await login()
    const html = await (await app.request('/panel?swap=posts', withSession(cookie), env)).text()
    expect(html).toContain('<section data-pane="posts"')
    expect(html).not.toContain('<section data-pane="overview"')
    expect(html).toContain('id="flash"')
  })

  it('بلا جلسة لا فعل — لا مسحا ولا تحليلا', async () => {
    const body = new FormData()
    body.set('id', 'x')
    expect((await app.request('/panel/analyze', { method: 'POST', body }, env)).status).toBe(401)
    expect((await app.request('/panel/scan', { method: 'POST' }, env)).status).toBe(401)
  })

  it('فشل المسح يُبلَّغ ولا يُسقط اللوحة', async () => {
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
  it('الوقت نسبيّ والدقيق في title — لا طابع خام وحده', async () => {
    await seedSource('تقرير')
    const cookie = await login()
    const html = await (await everyPane((p) => app.request(p, withSession(cookie), env)))
    expect(html).toMatch(/الآن|قبل /)
    // ‏والدقيقُ في التلميح (data-tip منذ D-312) بتوقيت الرياض لا UTC (D-201)
    expect(html).toMatch(/data-tip="\d{4}-\d\d-\d\d \d\d:\d\d بتوقيت الرياض"/)
  })

  it('الحالة تحمل رمزا ونصّا — لا لونا وحده', async () => {
    await seedSource('تقرير')
    const cookie = await login()
    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).toContain('class="st-ic"')
    expect(html).toContain('ينتظر')
  })

  it('حالة الفراغ تحمل الفعل لا وصف الغياب وحده', async () => {
    const cookie = await login()
    const html = await (await everyPane((p) => app.request(p, withSession(cookie), env)))
    expect(html).toContain('لا مصادر بعد')
    expect(html).toContain('/panel/scan')
  })

  it('الإيقاف يسأل قبل أن يقع', async () => {
    const cookie = await login()
    const html = await (await everyPane((p) => app.request(p, withSession(cookie), env)))
    expect(html).toContain('data-confirm')
  })

  it('فيها تخطّ إلى المحتوى وتنقّل مسمّى', async () => {
    const cookie = await login()
    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).toContain('تخطّي إلى المحتوى')
    expect(html).toContain('aria-label="أقسام اللوحة"')
    expect(html).toContain('aria-live="polite"')
  })
})

/**
 * ورقةُ الأنماط كما يجلبها المتصفّح (D-101).
 *
 * خرجت من الوثيقة إلى `/a/…`، **فاختبارٌ يفتّش عنها في الوثيقة يمرّ على
 * غيابها لا على حضورها**. فيُقرأ المسارُ من الوثيقة ثمّ تُطلَب — وهذا ما
 * يفعله المتصفّح، فهو ما يُختبَر.
 */
async function stylesheet(cookie: string): Promise<string> {
  const html = await (await app.request('/panel', withSession(cookie), env)).text()
  const href = /<link rel="stylesheet" href="([^"]+)"/.exec(html)
  expect(href).not.toBeNull()
  const sheet = await app.request(href![1]!, {}, env)
  expect(sheet.status).toBe(200)
  return sheet.text()
}

describe('اللون يتبع المرجع لا الذوق', () => {
  it('المقياس هيئة واحدة — لا كهرمان فيه (يقع من الذهب على ΔE 7.2)', async () => {
    const cookie = await login()
    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    // لا صنف تحذيرٍ في المقياس؛ الأحمر وحده هو القفزة المسموحة
    expect(html).not.toContain('<i class="w"')
    expect(await stylesheet(cookie)).toContain('.bar i.full{background:var(--bad)}')
  })

  it('بلوغ السقف يحمل نصّا لا لونا وحده', async () => {
    const cookie = await login()
    const body = new FormData()
    body.set('key', 'daily_analysis_cap')
    body.set('value', '0')
    await app.request('/panel/settings', withSession(cookie, { method: 'POST', body }), env)
    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).toContain('بلغ السقف')
  })
})

/**
 * **عمودان يُملآن لا يُمدّان** (D-136): بطاقةُ الإنفاق كانت تُمدّ لتساوي
 * القائمةَ فتترك ‏٥٢١px بيضاء. فالمالُ رصّةٌ في عمودٍ، والقائمةُ في الآخر،
 * وصفُّ المؤشّرات موسومٌ ليصير زوجين في الجوّال.
 */
/**
 * **شريطُ المؤشّرات واحدٌ في كلّ لوح** (D-146): D-143 جعلته سطحًا واحدًا في
 * نظرة عامّة وبقيت ثلاثةُ أشرطةٍ بطاقاتًا منفصلة. فالصنفُ على الأربعة، ولا
 * شريطَ مؤشّراتٍ بلا الصنف.
 */
/**
 * **رقمٌ واحدٌ في الواجهة** (D-147): القيمُ المحسوبة تُطبَع بالأرقام الغربيّة
 * (`toFixed` وأخواتها)، وكانت اللصائقُ الثابتة تكتب «٣٠ يوما» بالهنديّة إلى
 * جانب «23.41$». فالواجهةُ كلُّها غربيّة؛ وأسماءُ المراحل («المرحلة ٠») أسماءٌ
 * لا كمّيّات فتبقى، والوثائقُ القانونيّةُ نثرٌ لا واجهة.
 */
describe('رقم واحد في الواجهة (D-147)', () => {
  it('لا رقمًا هنديًّا في اللوحة ولا في شاشة المنصّة سوى أسماء المراحل', async () => {
    const cookie = await login()
    for (const path of ['/panel', '/panel/channels/linkedin', '/panel/tasks']) {
      const html = await (await app.request(path, withSession(cookie), env)).text()
      const body = html
        .replace(/<style[\s\S]*?<\/style>/g, '')
        .replace(/المرحلة [٠-٩]/g, '')
        .replace(/المراحل [٠-٩ و]+/g, '')
      const hits = [...body.matchAll(/[^<>]{0,30}[٠-٩]+[^<>]{0,30}/g)].map((m) => m[0].trim())
      expect(hits, path).toEqual([])
    }
  })
})

describe('شريط المؤشّرات واحد (D-146)', () => {
  it('القنوات والمزوّدون وشاشة المنصّة يحملون tiles، ولا شريط بلاه', async () => {
    const cookie = await login()
    const html = await (await everyPane((p) => app.request(p, withSession(cookie), env)))
    // ‏والهامشُ صنفٌ من السلّم لا سِمةُ «style» (D-189)
    // ‏و«الحسابات» ثلاثُ بلاطات (D-205): متّصلة · تحتاج إعادةَ ربط · تحتاج إعدادًا
    expect(html).toContain('<div class="card grid tiles c3 mb-4">')
    expect(html).toContain('<div class="card grid tiles c3 mb-3">')
    // ‏وشاشةُ المنصّة صارت صفحةَ حساب (D-172): أعدادُها في رأسها بصيغة المنصّة، لا شريطَ مؤشّرات
    const screen = await (await app.request('/panel/channels/linkedin', withSession(cookie), env)).text()
    expect(screen).toContain('<header class="card acct acct-linkedin">')
    // ‏ومنصّةٌ بلا حسابٍ لا تُكتب لها أصفار (ر-1): العدّاداتُ لحسابٍ قائم
    expect(screen).not.toContain('<ul class="acct-counts">')
    for (const page of [html, screen]) {
      for (const m of page.matchAll(/<div class="grid (c[234])[^"]*">\s*<div class="card tile">/g)) {
        expect(m[0], 'شريط مؤشّرات بلا tiles').toBe('')
      }
    }
  })
})

describe('هندسة نظرة عامّة (D-136 · D-233)', () => {
  it('«ما ينتظرك» وحدَه بعرض اللوح، والسجلّ والمال مطويّان معًا، والمؤشّرات موسومة', async () => {
    const cookie = await login()
    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).toContain('<div class="card grid tiles c4">')
    const waiting = html.indexOf('<h2>ما ينتظرك</h2>')
    const ops = html.indexOf('id="ops"', waiting)
    const happened = html.indexOf('<h2>ما وقع اليوم</h2>', ops)
    const spend = html.indexOf('الإنفاق — 14 يومًا', happened)
    const money = html.indexOf('أين يذهب المال', spend)
    expect(waiting).toBeGreaterThan(0)
    // ‏قاعدةُ الحذف (D-233): السجلُّ لا قرار، فهو تحت «الكلفة وما وقع» المطويّة لا بجوار «ما ينتظرك»
    expect(ops).toBeGreaterThan(waiting)
    expect(happened).toBeGreaterThan(ops)
    expect(spend).toBeGreaterThan(happened)
    expect(money).toBeGreaterThan(spend)
    expect(html.slice(waiting, ops)).not.toContain('ما وقع اليوم')
    expect(html).not.toContain('<h3 class="sec">ما وقع اليوم</h3>')
  })
})

/**
 * **رأسٌ لكلّ لوحٍ سوى «نظرة عامّة»** (D-137): كان الجدولُ المحوريُّ وحدَه
 * بلا رأس. والحارسُ يعدّ `h1` في كلّ `section[data-pane]`.
 */
describe('رؤوس الألواح (D-137)', () => {
  it('لكلّ لوح h1 واحد، ونظرة عامّة بلا رأس قصدًا', async () => {
    const cookie = await login()
    // ‏**كلُّ مسارٍ يحمل ألواحَه وحدَها** (D-211): الرئيسيّةُ والمنشوراتُ في «/panel»، وكلُّ لوحٍ آخر في مساره
    const PAGES: Record<string, string[]> = {
      '/panel': ['overview', 'posts'], '/panel/library': ['library'], '/panel/accounts': ['accounts'],
      '/panel/settings': ['settings'], '/panel/analysis': ['results'],
    }
    for (const [path, want] of Object.entries(PAGES)) {
      const page = await (await app.request(path, withSession(cookie), env)).text()
      expect([...page.matchAll(/<section data-pane="([a-z]+)"/g)].map((m) => m[1]), path).toEqual(want)
    }
    const html = await (await everyPane((p) => app.request(p, withSession(cookie), env)))
    // ‏والرأسُ يُعدّ في كلّ صفحةٍ على حدة: آخرُ لوحٍ في صفحةٍ لا يمتدّ إلى رأس التي بعدها
    for (const path of Object.keys(PAGES)) {
      const page = await (await app.request(path, withSession(cookie), env)).text()
      const body = page.slice(0, page.indexOf('<footer>'))
      for (const p of body.split('<section data-pane="').slice(1)) {
        const name = p.slice(0, p.indexOf('"'))
        const h1s = (p.match(/<h1[\s>]/g) ?? []).length
        expect(h1s, `${path} ${name}`).toBe(name === 'overview' ? 0 : 1)
      }
    }
    expect(html).toContain('<h1>النتائج</h1>')
    // ‏والمراسي القديمةُ أقسامٌ في ألواحها الجديدة — فالروابطُ المحفوظةُ تصل
    // ‏و«المكتبة» ثلاثةُ تبويبات (D-206)، والفيديو فيها لا في «المنشورات»
    const lib = html.slice(html.indexOf('id="library-sub"'), html.indexOf('</nav>', html.indexOf('id="library-sub"')))
    expect([...lib.matchAll(/<span>([^<]+)<\/span>/g)].map((m) => m[1])).toEqual(['المصادر', 'الفيديو', 'الصور'])
    const libPane = html.slice(html.indexOf('<section data-pane="library"'), html.indexOf('</section>', html.indexOf('<section data-pane="library"')))
    expect(libPane).toContain('<div data-sub id="sub-videos">')
    expect(libPane).toContain('<div data-sub id="sub-images">')
    // ‏و«منشور جديد» العائمُ بأبواب الكتابة الأربعة (D-208)، ومراسيها في اللوحة نفسِها
    const fab = html.slice(html.indexOf('<details class="fab">'), html.indexOf('</details>', html.indexOf('<details class="fab">')))
    expect([...fab.matchAll(/<a href="([^"]+)"/g)].map((m) => m[1])).toEqual(['/panel#idea', '/panel#write', '/panel/library#videos', '/panel#plan-import'])
    for (const a of ['idea', 'write', 'videos', 'plan-import']) expect(html, a).toContain(`id="${a}"`)
    // ‏و«للمطوّر» (D-209): رابطُ العودة لكلّ منصّة وأسماءُ الأسرار الناقصة — أسماءٌ لا قيَم
    const dev = html.slice(html.indexOf('id="dev"'), html.indexOf('</section>', html.indexOf('id="dev"')))
    expect(dev).toMatch(/\/oauth\/linkedin\/callback/)
    expect(dev).toContain('LINKEDIN_CLIENT_ID')
    expect(dev).not.toMatch(/secret[^<]*=/i)
    for (const old of ['sources', 'channels', 'pivot', 'limits']) {
      expect(html, old).toContain(`<div data-sub id="${old}">`)
    }
    // ‏و«الخدمات» و«الأمان» معرّفان داخل قسميهما الجديدين (EASE-PLAN ز): المرساةُ تصل، والتبويبُ قسمُه
    for (const old of ['providers', 'security']) expect(html, old).toContain(`<div id="${old}"`)
  })
})

describe('مفتاح الإدراج الآليّ في اللوحة', () => {
  it('يظهر مطفأ ويشرح ما يقع إن رُفع', async () => {
    const cookie = await login()
    const html = await (await everyPane((p) => app.request(p, withSession(cookie), env)))
    expect(html).toContain('الإدراج الآليّ')
    expect(html).toContain('رفع الإدراج الآليّ')
    expect(html).toContain('مطفأ')
  })

  it('يسأل قبل رفعه ويذكر الحدّ في السؤال — فلا يُرفع بلا علم', async () => {
    const cookie = await login()
    const html = await (await everyPane((p) => app.request(p, withSession(cookie), env)))
    expect(html).toContain('سيبدأ إنفاق يوميّ بلا أمر منك')
    expect(html).toContain('data-confirm')
  })

  it('رفعُه يُحفظ ويُبلَّغ عنه', async () => {
    const cookie = await login()
    const body = new FormData()
    body.set('key', 'auto_enqueue')
    body.set('value', 'true')
    await app.request('/panel/settings', withSession(cookie, { method: 'POST', body }), env)
    expect((await readSettings(db)).autoEnqueue).toBe(true)

    const html = await (await everyPane((p) => app.request(p, withSession(cookie), env)))
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

  it('مزوّد غير مضاف يُرفض حفظ مفتاحه — يُضاف أوّلا', async () => {
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
  describe('فهرس النماذج — يُجلَب ولا يُكتب', () => {
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

    it('ولا مفتاح يعني جوابا يقول لماذا — لا عطلا', async () => {
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

    it('ويحمل لكلّ معرّف اسمًا يقرؤه المالك (D-203)، والمعرّف قيمة لا نصّ', async () => {
      const cookie = await login()
      await post(cookie, '/panel/providers/key', { provider: 'gemini', key: GEMINI })
      stub({ models: [{ name: 'models/gemini-2.5-flash', displayName: 'Flash' }] })
      const body = (await (await post(cookie, '/panel/providers/models', { provider: 'gemini' })).json()) as { models: { id: string; name: string }[] }
      expect(body.models[0]).toMatchObject({ id: 'gemini-2.5-flash', name: 'Gemini · السريع (2.5 Flash)' })
      const html = await (await everyPane((p) => app.request(p, withSession(cookie), env)))
      expect(html).toContain('<option value="claude-opus-5" title="claude-opus-5" selected>Claude · الأقوى (Opus 5)</option>')
      expect(html).not.toMatch(/<option value="claude-opus-5"[^>]*>claude-opus-5</)
    })

    it('و**المفتاح لا يظهر في الجواب ولا في العنوان**', async () => {
      const cookie = await login()
      await post(cookie, '/panel/providers/key', { provider: 'gemini', key: GEMINI })
      const urls = stub({ models: [{ name: 'models/gemini-2.5-flash' }] })

      const text = await (await post(cookie, '/panel/providers/models', { provider: 'gemini' })).text()
      expect(text).not.toContain(GEMINI)
      expect(urls[0]).not.toContain(GEMINI)
    })

    it('ومزوّد لا وجود له يُردّ لا يُخترَع', async () => {
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

  it('سرّ Worker لا يُدار من اللوحة — ولا يُقنَّع ولا يُعرض', async () => {
    const cookie = await login()
    const withSecret = { ...env, ANTHROPIC_API_KEY: 'sk-ant-سرّ-في-الورَكر' }
    const html = await (await everyPane((p) => app.request(p, withSession(cookie), withSecret)))
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

describe('**مزوّد يُضاف من اللوحة كاملا**', () => {
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

  it('**عنوان داخليّ يُرفض قبل أن يُحفظ**', async () => {
    const cookie = await login()
    await post(cookie, '/panel/providers/add', {
      name: 'evil', label: 'Evil', base_url: 'https://169.254.169.254/latest',
    })
    expect(await getProvider(db, 'evil')).toBeNull()

    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).toContain('العنوان مرفوض')
  })

  it('http يُرفض — المفتاح لا يُرسل على اتّصال غير مشفَّر', async () => {
    const cookie = await login()
    await post(cookie, '/panel/providers/add', {
      name: 'plain', label: 'Plain', base_url: 'http://api.example.com/v1',
    })
    expect(await getProvider(db, 'plain')).toBeNull()
  })

  it('اسم غير صالح يُرفض — يُستعمل مفتاحا وسياق تشفير وقيمةً في الدفتر', async () => {
    const cookie = await login()
    for (const name of ['دييب سيك', '9start', 'a', 'bad!name', 'x'.repeat(40)]) {
      await post(cookie, '/panel/providers/add', {
        name, label: 'X', base_url: 'https://api.example.com/v1',
      })
    }
    const rows = db.raw.prepare('SELECT count(*) AS n FROM providers').get() as { n: number }
    expect(rows.n).toBe(2) // المدمَجان وحدهما
  })

  it('المسافة تُطبَّع شرطة — تسهيل مقصود لا تساهل', async () => {
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
    const html = await (await everyPane((p) => app.request(p, withSession(cookie), env)))
    expect(html).toContain('سيُرسَل مفتاحك ونصّ مستنداتك إلى هذا العنوان')
  })
})

describe('توجيه المهامّ يصير للمالك', () => {
  async function post(cookie: string, path: string, fields: Record<string, string>): Promise<Response> {
    const body = new FormData()
    for (const [k, v] of Object.entries(fields)) body.set(k, v)
    return app.request(path, withSession(cookie, { method: 'POST', body }), env)
  }

  it('يوجّه الفهم إلى مزوّد أضافه المالك', async () => {
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

  it('مهمّة غير معروفة أو مزوّد غير موجود يُرفضان', async () => {
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

describe('ترويسات الأمان — والقفل على باب جدارُه زجاج ليس أمنا', () => {
  it('صفحة اللوحة تمنع التأطير بالطريقتين', async () => {
    const cookie = await login()
    const response = await app.request('/panel', withSession(cookie), env)
    const csp = response.headers.get('Content-Security-Policy') ?? ''
    expect(csp).toContain("frame-ancestors 'none'")
    expect(response.headers.get('X-Frame-Options')).toBe('DENY')
  })

  it('السياسة قائمة سماح من العدم', async () => {
    const cookie = await login()
    const csp =
      (await app.request('/panel', withSession(cookie), env)).headers.get(
        'Content-Security-Policy',
      ) ?? ''
    expect(csp).toContain("default-src 'none'")
    expect(csp).toContain("base-uri 'none'")
    expect(csp).toContain("form-action 'self'")
    // ولا تُفتَح بابا يُبطلها كلَّها
    // unsafe-inline على السِّمة وحدَها (D-150): الوسمُ والبرمجةُ خلف nonce
    expect(csp.split(';').filter((d) => d.includes('unsafe-inline')).map((d) => d.trim())).toEqual(["style-src-attr 'unsafe-inline'"])
    expect(csp).not.toContain('unsafe-eval')
  })

  it('كلّ وسم داخليّ يحمل nonce الصفحة — وإلّا لما نُفّذ', async () => {
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

  it('nonce يتبدّل مع كلّ ردّ — وثابت مشترك يُبطل السياسة', async () => {
    const cookie = await login()
    const first = await app.request('/panel', withSession(cookie), env)
    const second = await app.request('/panel', withSession(cookie), env)
    expect(first.headers.get('Content-Security-Policy')).not.toBe(
      second.headers.get('Content-Security-Policy'),
    )
  })

  it('صفحة الدخول محروسة كاللوحة — لا تُترك لأنّها قبل الجلسة', async () => {
    const response = await app.request('/panel', {}, env)
    expect(response.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'")
    expect(response.headers.get('X-Frame-Options')).toBe('DENY')
  })

  it('اللوحة لا تُخزَّن في متصفّح مشترك', async () => {
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

describe('CSRF — طبقة في الخادم لا في المتصفّح وحده', () => {
  it('كلّ نموذج POST في اللوحة يحمل الرمز — بلا استثناء', async () => {
    const cookie = await login()
    await seedSource('مستند')
    // ‏وشاشةُ «خطّة جديدة» معها (D-283): نموذجُها خرج من اللوحة إليها
    const html = (await (await app.request('/panel', withSession(cookie), env)).text()) +
      (await (await app.request('/panel/plan/new', withSession(cookie), env)).text())
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

  it('طلب بلا رمز يُرفض ٤٠٣ ولا يغيّر القاعدة', async () => {
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

  it('رمز ملفَّق يُرفض كذلك', async () => {
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

  it('رمز جلسة أخرى لا يعمل في هذه', async () => {
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

  it('الخروج لا يحتاج رمزا — باب الخروج لا يُقفَل', async () => {
    const cookie = await login()
    const response = await app.request(
      '/panel/logout',
      { method: 'POST', headers: { Cookie: cookie } },
      env,
    )
    expect(response.status).toBe(303)
    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).toContain('name="email"')
    expect(html).not.toContain('name="token"')
  })
})

describe('تدوير ADMIN_TOKEN يُبطل الجلسات', () => {
  it('جلسة قائمة تسقط حين يُبدَّل الرمز — لا تنتظر انتهاء مهلتها', async () => {
    const cookie = await login()
    expect(await (await app.request('/panel', withSession(cookie), env)).text()).toContain(
      'nav class="tabs"',
    )

    const rotated = { ...env, ADMIN_TOKEN: 'Zz9qW8vY1nMtB6oS3uXgA7dC5eI2kH0f' }
    const html = await (await app.request('/panel', withSession(cookie), rotated)).text()
    expect(html).toContain('name="email"')
    expect(html).not.toContain('name="token"')
    expect(html).not.toContain('nav class="tabs"')
  })

  it('ولا يغيّر شيئا بجلسة سقطت', async () => {
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
    const html = await (await everyPane((p) => app.request(p, withSession(cookie), env)))
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
      'name="email"',
    )
  })

  /**
   * **سرُّ الجهاز الآخر لا يُطبَع** (D-150). كان الجردُ يضع قيمةَ كعكة كلّ
   * جلسةٍ في `<input type="hidden" name="id">`، فمن قرأ الصفحةَ ملك الأجهزةَ
   * كلَّها. البصمةُ تُطبَع، والإبطالُ بها يعمل، والسرُّ لا يُقبَل.
   */
  it('الجرد يحمل بصمة الجلسة لا سرَّها — والإبطال بالبصمة يعمل', async () => {
    const other = await login()
    const mine = await login()
    const otherId = other.split('=')[1]!
    const html = await (await everyPane((p) => app.request(p, withSession(mine), env)))
    expect(html).not.toContain(otherId)
    expect(html).toContain(`name="handle" value="${await fingerprint(otherId)}"`)

    const bySecret = new FormData()
    bySecret.set('id', otherId)
    const refused = await app.request(
      '/panel/sessions/revoke',
      withSession(mine, { method: 'POST', body: bySecret }),
      env,
    )
    expect(refused.status).toBe(400)

    const body = new FormData()
    body.set('handle', await fingerprint(otherId))
    await app.request('/panel/sessions/revoke', withSession(mine, { method: 'POST', body }), env)
    expect(await (await everyPane((p) => app.request(p, { headers: { Cookie: other } }, env)))).toContain(
      'name="email"',
    )
    const { results } = await db
      .prepare("SELECT target FROM audit_log WHERE action = 'session.revoke'")
      .all<{ target: string }>()
    expect(results.map((r) => r.target)).toEqual([await fingerprint(otherId)])
  })

  it('إبطال جلستك من الجرد يُردّ إلى زرّ الخروج — لا يترك صفحةً ميّتة', async () => {
    const cookie = await login()
    const body = new FormData()
    body.set('handle', await fingerprint(cookie.split('=')[1]!))
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
    body.set('code', 'wrong')
    await app.request('/panel/login', { method: 'POST', body }, env)
    expect(await actions()).toContain('login.denied')
  })

  it('**لا يُذكر مفتاح في السجلّ** — التلميح وحده', async () => {
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
    const html = await (await everyPane((p) => app.request(p, withSession(cookie), env)))
    // ‏في تبويب «سجلّ النشاط» من «الإعدادات» (خطّة التصميم 5.8 · D-206)
    const log = html.slice(html.indexOf('<div id="activity"'))
    expect(log).toContain('<h2>سجلّ النشاط</h2>')
    expect(log).toContain('فُتحت جلسة')
  })

  it('عطل في السجلّ لا يُسقط الفعل — الإعداد يُحفظ ولو لم يُسجَّل', async () => {
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

describe('القنوات — سجلّ صادق لا وعد بما لا يقع', () => {
  async function seedAccount(platform: string, status = 'active'): Promise<void> {
    await db
      .prepare(
        `INSERT INTO accounts (id, platform, kind, external_id, display_name, status)
         VALUES (?, ?, 'member', ?, 'عمر عبدالحميد', ?)`,
      )
      .bind(crypto.randomUUID(), platform, crypto.randomUUID(), status)
      .run()
  }

  it('يعرض المبنيّ وغير المبنيّ معا', async () => {
    const cookie = await login()
    const html = await (await everyPane((p) => app.request(p, withSession(cookie), env)))
    expect(html).toContain('data-pane="accounts"')
    expect(html).toContain('<div data-sub id="channels">')
    for (const name of ['LinkedIn', 'Snapchat', 'Instagram', 'TikTok', 'YouTube']) {
      expect(html).toContain(name)
    }
  })

  it('**لا زرّ ربط لما لم يُبن** — وزرّ يقول «غير مدعوم» أسوأ من غيابه', async () => {
    const cookie = await login()
    const html = await (await everyPane((p) => app.request(p, withSession(cookie), env)))
    for (const id of ['snapchat', 'instagram', 'tiktok', 'threads', 'youtube']) {
      expect(html).not.toContain(`/oauth/${id}/start`)
    }
    // ‏وما لم يُبنَ سطرُ «قريبًا» في آخر «الحسابات» (D-205)
    expect(html).toContain('<p class="hint mt-5">قريبًا: ')
  })

  it('بلا أسرار: تُسمّى الأسرار الناقصة ومهمّتها، ولا يُعرض زرّ', async () => {
    const cookie = await login()
    const html = await (await everyPane((p) => app.request(p, withSession(cookie), env)))
    // ‏وأسماءُ أسرار Worker خلف «للمطوّر» في شاشة المنصّة، لا على البطاقة (خطّة التصميم 5.7 · D-205)
    expect(html).toContain('aria-label="أكمل الإعداد LinkedIn"')
    /*
     * **واللوحُ يُسمّي المانعَ ويفتح بابَه** (D-111).
     *
     * كان يحمل الدليلَ كاملا فيُمزّق شبكتَه (‏٧٨٪ من البطاقة وثيقة).
     * فانتقل الدليلُ إلى شاشة المنصّة، **وبقي على البطاقة أن تقود إليه**
     * — وشارةٌ تصف المانعَ ولا تفتحه أسوأُ من غيابها.
     */
    expect(html).toContain('/panel/channels/linkedin')
    expect(html).not.toContain('/oauth/linkedin/start')
  })

  it('بالأسرار: زرّ الربط يظهر ويشير إلى مسار قائم', async () => {
    const withSecrets = {
      ...env,
      LINKEDIN_CLIENT_ID: 'id',
      LINKEDIN_CLIENT_SECRET: 'secret',
    }
    const login2 = await emailLogin(app, withSecrets)
    const cookie = (login2.headers.get('Set-Cookie') ?? '').split(';')[0]!
    // ‏وزرُّ الربط في «الحسابات» (D-309): لا بطاقةَ منصّاتٍ في الرئيسيّة
    const html = await (
      await app.request('/panel/accounts', { headers: { Cookie: cookie } }, withSecrets)
    ).text()
    expect(html).toContain('/oauth/linkedin/start')
  })

  it('الحساب المربوط يُعرض باسمه', async () => {
    await seedAccount('linkedin')
    const cookie = await login()
    const html = await (await everyPane((p) => app.request(p, withSession(cookie), env)))
    expect(html).toContain('عمر عبدالحميد')
    expect(html).toContain('مربوطة')
  })

  it('**رمز انتهى يظهر في «ما ينتظرك»** — فلا يقف النشر صامتا', async () => {
    await seedAccount('x', 'needs_reauth')
    const cookie = await login()
    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).toContain('انتهى الإذن')
  })

  it('اسم يحمل HTML يُهرَّب ولا يُحقَن', async () => {
    await db
      .prepare(
        `INSERT INTO accounts (id, platform, kind, external_id, display_name, status)
         VALUES (?, 'x', 'member', 'e1', ?, 'active')`,
      )
      .bind(crypto.randomUUID(), '<script>alert(1)</script>')
      .run()
    const cookie = await login()
    const html = await (await app.request('/panel/accounts', withSession(cookie), env)).text()
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })
})

describe('الثيم النهاريّ', () => {
  it('الرموز تُعرَّف على :root كاملةً — فلا تسقط بسقوط شرط', async () => {
    const css = await stylesheet(await login())
    const root = css.slice(css.indexOf(':root{'), css.indexOf('}', css.indexOf(':root{')))
    for (const token of ['--bg', '--surface', '--ink', '--brand', '--ok', '--warn', '--bad']) {
      expect(root).toContain(token)
    }
  })

  it('مفتاح الثيم حاضر بخياراته الثلاثة', async () => {
    const cookie = await login()
    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).toContain('id="theme"')
    expect(html).toContain('data-theme="light"')
    expect(html).toContain('data-theme="dark"')
    expect(html).toContain('data-theme="system"')
  })

  it('**سكربت الثيم في الرأس** — فلا يومض الثيم الخطأ قبل الرسم', async () => {
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

  /** **مبدّلُ الكثافة له سكربت** (D-150): كان `DENSITY_SCRIPT` يُستورَد ولا يُلحَق. */
  it('وسكربت الكثافة يُلحَق بالصفحة لا يُستورَد وحسب', async () => {
    const cookie = await login()
    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).toContain('id="density"')
    // السكربتُ صار في الأصل العامّ (D-153)، والصفحةُ تربطه
    const { uiScript } = await import('../lib/ui/asset')
    expect(uiScript().body).toContain("getElementById('density')")
    expect(html).toContain(`src="${uiScript().path}"`)
  })

  /**
   * **العلامةُ «صدى» وحدها** (D-203): كانت «SADA · STAGING» في القفل. والتجريبيّةُ وحدها تحمل شارةً
   * عربيّةً بجانب الاسم من SADA_ENV (D-151)، والإنتاجُ بلا شارة.
   */
  it('العلامة «صدى» وحدها، وشارة «تجريبيّ» في التجريبيّة وحدها', async () => {
    const cookie = await login()
    const staging = await (await app.request('/panel', withSession(cookie), env)).text()
    const brandOf = (html: string): string => /<div class="brand">([\s\S]*?)<\/div>/.exec(html)?.[1] ?? ''
    expect(brandOf(staging)).toContain('<span>تجريبيّ</span>')
    expect(staging).not.toContain('SADA')
    const production = await (
      await app.request('/panel', withSession(cookie), { ...env, SADA_ENV: 'production' })
    ).text()
    expect(brandOf(production)).not.toContain('<span')
    expect(production).not.toMatch(/SADA|STAGING|PRODUCTION|تجريبيّ<\/span>/)
  })

  /** **سببُ فشل الخطّة يُحفَظ ويُقرأ** (D-157): «failed» وحدَها كانت في السجلّ، والفلاشُ يزول. */
  it('محاولة تخطيط بلا مادّة تُسجَّل بسببها وتظهر في لوح المنشورات', async () => {
    const cookie = await login()
    const res = await app.request('/panel/plan/generate', withSession(cookie, { method: 'POST', body: new FormData() }), env)
    expect(res.status).toBe(303)
    const { results } = await db
      .prepare("SELECT detail FROM audit_log WHERE action = 'plan.generate' ORDER BY id DESC LIMIT 1")
      .all<{ detail: string }>()
    expect(results[0]?.detail).toMatch(/^not_enough: /)
    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).toContain('آخر محاولة لم تكف المادّة')
    expect(html).toContain('والخطّة تحتاج 2 على الأقلّ')
  })

  /**
   * **«وحدة» لا «رمز»** (D-155، D-164): إشعارُ الخطّة كان يقول «2600 رمزا
   * بلا سعرٍ مضبوط»، والرمزُ في اللوحة رمزُ التطبيق والاسترداد. ولا يُرى
   * إلّا بخطّةٍ نجحت على مزوّدٍ بلا سعر — فيُبلَغ بـGemini المدمَج.
   */
  it('خطّة على مزوّد بلا سعر تقول «وحدةً» لا «رمزا»', async () => {
    const cookie = await login()
    const ids = [await seedSource('تقرير الأثر'), await seedSource('مراجعة المحفظة')]
    for (const id of ids) {
      await db
        .prepare('INSERT INTO content_items (id, source_id, summary, themes_json, worth_score) VALUES (?, ?, ?, ?, ?)')
        .bind(crypto.randomUUID(), id, 'خلاصة عن الوقف', JSON.stringify({ themes: ['الوقف'] }), 0.8)
        .run()
    }
    await writeRoute(db, 'plan', 'gemini', 'gemini-2.5-flash', 'test')
    const week = weekStart(new Date())
    const plan = {
      rationale: 'أسبوع بمصدرين.',
      items: [{ source_id: ids[0], platform: 'linkedin', angle: 'زاوية الأثر لا زاوية المبلغ', day: week, time: '07:30', why: 'الأثقل.' }],
    }
    const real = globalThis.fetch
    globalThis.fetch = (async (): Promise<Response> =>
      new Response(
        JSON.stringify({
          model: 'gemini-2.5-flash',
          choices: [{ message: { content: JSON.stringify(plan) }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 2000, completion_tokens: 600 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )) as unknown as typeof fetch
    try {
      const withKey = { ...env, GEMINI_API_KEY: 'g-test' }
      const res = await app.request('/panel/plan/generate', withSession(cookie, { method: 'POST', body: new FormData() }), withKey)
      expect(res.status).toBe(303)
      const html = await (await app.request('/panel', withSession(cookie), withKey)).text()
      expect(html).toContain('و2600 وحدةً بلا سعر مضبوط للمزوّد')
      expect(html).not.toContain('رمزا بلا سعر')
    } finally {
      globalThis.fetch = real
    }
  })

  /** **الثابتُ أصلٌ ببصمة** (D-153): لا يبقى سطرًا إلّا إقلاعُ الثيم وما يتبدّل بالطلب. */
  it('اللوحة تحمل سكربتَيها أصلَين بـnonce وسطرًا واحدًا للإقلاع', async () => {
    const cookie = await login()
    const response = await app.request('/panel', withSession(cookie), env)
    const html = await response.text()
    const nonce = /nonce-([A-Za-z0-9+/]+)/.exec(response.headers.get('Content-Security-Policy') ?? '')?.[1]
    // nonce فيه + و/ فلا يدخل تعبيرًا نمطيًّا بلا تهريب
    const { uiScript, panelScript } = await import('../lib/ui/asset')
    expect(html).toContain(`<script nonce="${nonce}" src="${uiScript().path}"></script>`)
    expect(html).toContain(`<script nonce="${nonce}" src="${panelScript().path}"></script>`)
    expect((html.match(/<script nonce="[^"]+">/g) ?? []).length).toBe(1)
    expect(html).not.toContain('sadaB64=')
    const doc = await (await app.request('/privacy', {}, env)).text()
    expect(doc).toMatch(/src="\/a\/u\.[0-9a-f]{8}\.js"/)
    expect(doc).not.toMatch(/src="\/a\/p\./)
  })

  /**
   * **وجوهُ Plex الثلاثة تُسبَق في كلّ صفحة** (D-185): خرج الكوفيُّ من الواجهة (وكان
   * لا يُسبَق في الوثيقة العامّة، D-152)، والوجهُ الثخينُ عناوينُ كلِّ صفحة. **ولا وجهَ
   * قديمٌ يُسبَق أو يُعلَن**: Beiruti وInter وReem Kufi بقيت لخطوط الصور وحدها.
   */
  it('اللوحة والوثيقة العامّة تسبقان أوجه Plex الثلاثة، ولا وجه قديم', async () => {
    const cookie = await login()
    const panel = await (await app.request('/panel', withSession(cookie), env)).text()
    const doc = await (await app.request('/privacy', {}, env)).text()
    const preloads = (html: string): number => (html.match(/rel="preload" as="font"/g) ?? []).length
    for (const html of [panel, doc]) {
      expect(preloads(html)).toBe(3)
      expect(html).not.toMatch(/beiruti|reem|'Inter'/i)
      expect(html).toContain("font-family:'Plex Arabic'")
    }
  })

  it('صفحة الدخول تتبع الثيم أيضا', async () => {
    const html = await (await app.request('/panel', {}, env)).text()
    expect(html.slice(0, html.indexOf('</head>'))).toContain('sada-theme')
  })
})

describe('الجاهزيّة تفرز ما سدّته الخزانة', () => {
  it('مفتاح في الخزانة لا يُعدّ ناقصا — ويُذكر على حدة', async () => {
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

  it('وما لا خزانة له يبقى ناقصا', async () => {
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
        'خلاصة عربية عن أثر الوقف.',
        JSON.stringify({ hash: 'md5:a', themes: ['الوقف'] }),
        0.8,
      )
      .run()
    return id
  }

  it('لا تعرض مصدرا غير محلَّل في قائمة الكتابة — بلا خلاصة لا مادّة', async () => {
    await seedSource('لم يُحلَّل')
    const cookie = await login()
    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    const form = html.slice(html.indexOf('id="dw-src"'), html.indexOf('id="dw-pf"'))
    expect(form).not.toContain('لم يُحلَّل')
  })

  it('الإيقاف يمنع الكتابة — والزرّ ليس طريقا حوله', async () => {
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

  it('منصّة غير معروفة تُردّ ولا تصل إلى القاعدة', async () => {
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

  /** مسوّدةٌ جاهزةٌ للبَتّ — تُعاد بمعرّفها. */
  async function seedPost(status = 'draft', text = 'ن'.repeat(300)): Promise<string> {
    const sourceId = await seedAnalyzed()
    const postId = crypto.randomUUID()
    await db
      .prepare(
        `INSERT INTO posts (id, platform, source_id, source_hash, model, cost_usd, type,
                            text, status, idempotency_key)
         VALUES (?, 'linkedin', ?, 'md5:a', 'm', 0.01, 'text', ?, ?, ?)`,
      )
      .bind(postId, sourceId, text, status, `k-${postId}`)
      .run()
    return postId
  }

  async function statusOf(id: string): Promise<string | undefined> {
    const row = await db
      .prepare('SELECT status FROM posts WHERE id = ?')
      .bind(id)
      .first<{ status: string }>()
    return row?.status
  }

  /**
   * التراجعُ عن الرفض (D-100) — **ومسارٌ ينقل ولا يقرّر.**
   *
   * الحكمُ في `undoReject`، وهذا يُثبت أنّ البابَ محروسٌ كسائر الأبواب:
   * لا جلسةَ فلا مرور، ولا رمزَ نموذجٍ فلا مرور — **وزرٌّ في إشعارٍ ليس
   * طريقا جانبيّا حول الحارس** (D-019).
   */
  describe('التراجع عن الرفض', () => {
    it('يعيدها مسوّدةً ويكتب أثرا في السجلّ', async () => {
      const postId = await seedPost('rejected')
      const cookie = await login()
      const body = new FormData()
      body.set('id', postId)

      const response = await app.request(
        '/panel/drafts/undo-reject',
        withSession(cookie, { method: 'POST', body }),
        env,
      )
      expect(response.status).toBe(303)
      expect(await statusOf(postId)).toBe('draft')

      const { results } = await db
        .prepare("SELECT action FROM audit_log WHERE action = 'draft.undo_reject'")
        .all()
      expect(results).toHaveLength(1)
    })

    it('بلا رمز نموذج لا يمرّ — والحال يبقى', async () => {
      const postId = await seedPost('rejected')
      const cookie = await login()
      const body = new FormData()
      body.set('id', postId)

      const response = await app.request(
        '/panel/drafts/undo-reject',
        { method: 'POST', body, headers: { Cookie: cookie } },
        env,
      )
      expect(response.status).toBe(403)
      expect(await statusOf(postId)).toBe('rejected')
    })

    it('وبلا جلسة ٤٠١', async () => {
      const body = new FormData()
      body.set('id', 'أيّا كان')
      const response = await app.request('/panel/drafts/undo-reject', { method: 'POST', body }, env)
      expect(response.status).toBe(401)
    })
  })

  /**
   * البَتُّ الجماعيّ (D-100).
   *
   * وأهمُّ ما يُثبَت هنا **أنّ المعرّفاتِ تُقرأ كلُّها**: `form.get` تعطي
   * الأوّلَ وحدَه، فصندوقان محدَّدان يمرّ منهما واحدٌ **بلا خطأ ولا أثر**
   * — علّةٌ يراها المالكُ «اعتُمدت واحدةٌ من خمس» ولا يعرف لماذا.
   */
  describe('البَتّ الجماعيّ', () => {
    it('يعتمد كلّ ما أُرسِل لا أوّلَه', async () => {
      const one = await seedPost()
      const two = await seedPost()
      const three = await seedPost()
      const cookie = await login()
      const body = new FormData()
      body.append('id', one)
      body.append('id', two)
      body.append('id', three)

      const response = await app.request(
        '/panel/drafts/approve-many',
        withSession(cookie, { method: 'POST', body }),
        env,
      )
      expect(response.status).toBe(303)
      for (const id of [one, two, three]) expect(await statusOf(id)).toBe('approved')
    })

    it('وسقف يمنع طلبا يحمل أكثر من خمس وعشرين — ولا يُعتمَد منه شيء', async () => {
      const postId = await seedPost()
      const cookie = await login()
      const body = new FormData()
      for (let i = 0; i < 26; i += 1) body.append('id', postId)

      const response = await app.request(
        '/panel/drafts/approve-many',
        withSession(cookie, { method: 'POST', body }),
        env,
      )
      expect(response.status).toBe(303)
      expect(await statusOf(postId)).toBe('draft')
    })

    it('وطلب بلا معرّف واحد لا يرمي', async () => {
      const cookie = await login()
      const response = await app.request(
        '/panel/drafts/approve-many',
        withSession(cookie, { method: 'POST', body: new FormData() }),
        env,
      )
      expect(response.status).toBe(303)
    })

    it('وبلا رمز نموذج لا يمرّ', async () => {
      const postId = await seedPost()
      const cookie = await login()
      const body = new FormData()
      body.append('id', postId)

      const response = await app.request(
        '/panel/drafts/approve-many',
        { method: 'POST', body, headers: { Cookie: cookie } },
        env,
      )
      expect(response.status).toBe(403)
      expect(await statusOf(postId)).toBe('draft')
    })
  })

  it('البَتّ يكتب صاحب القرار في السجلّ — وموافقة بلا أثر لا تُراجَع', async () => {
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
    expect(row?.['approved_by']).toBe('panel:email')
    expect(row?.['approved_at']).not.toBeNull()

    const audit = await db
      .prepare("SELECT action, detail FROM audit_log WHERE action = 'draft.decide'")
      .all<{ action: string; detail: string }>()
    expect(audit.results).toHaveLength(1)
    expect(audit.results[0]?.detail).toBe('approved')
  })

  it('البَتّ بلا رمز CSRF يُردّ ولا يغيّر حالا', async () => {
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

  it('حساب من منصّة أخرى يُردّ — والزرّ ليس طريقا حول الحارس', async () => {
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

  it('الفاشل يعود معتمَدا بضغطة، ويعود المالك إلى بطاقته', async () => {
    const post = await seedApproved()
    const account = await seedAccount()
    await db
      .prepare("UPDATE posts SET status = 'failed', account_id = ?, scheduled_at = '2026-09-01 09:00:00' WHERE id = ?")
      .bind(account, post)
      .run()
    const cookie = await login()
    const body = new FormData()
    body.set('id', post)
    const response = await app.request('/panel/drafts/requeue', withSession(cookie, { method: 'POST', body }), env)
    expect(response.status).toBe(303)
    // ‏إلى شريط جدولته لا إلى رأس بطاقته: صار معتمَدًا ينتظر موعدًا (رحلة R-8)
    expect(response.headers.get('Location')).toBe(`/panel#s-${post}`)
    expect(
      (await db.prepare('SELECT status FROM posts WHERE id = ?').bind(post).first<{ status: string }>())?.status,
    ).toBe('approved')
    const audit = await db
      .prepare("SELECT detail FROM audit_log WHERE action = 'draft.requeue'")
      .all<{ detail: string }>()
    expect(audit.results.map((r) => r.detail)).toEqual(['requeued'])
    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).toContain(`id="d-${post}"`)
    expect(html).toMatch(new RegExp(`<form class="card card-inset sched" id="s-${post}"`))
  })

  it('الجدولة بلا رمز CSRF تُردّ ولا تغيّر حالا', async () => {
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

  it('أوّل زيارة: الحقل «بتوقيت الرياض» ويُقرأ بالرياض وإن وصلت كعكة منطقة أخرى (D-202)', async () => {
    const post = await seedApproved()
    const account = await seedAccount()
    const cookie = await login()
    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).toContain('اليوم والساعة بتوقيت الرياض')
    expect(html).not.toContain('اليوم والساعة بتوقيتك')
    expect(html).toContain('<input type="hidden" name="tz" value="Asia/Riyadh">')

    const year = new Date().getUTCFullYear() + 1
    const body = new FormData()
    body.set('id', post)
    body.set('account', account)
    body.set('tz', 'Asia/Riyadh')
    body.set('local', `${year}-03-10T09:00`)
    // ‏المتصفّحُ كتب كعكتَه بين العرض والإرسال، واللصيقةُ قالت الرياض
    await app.request('/panel/drafts/schedule', withSession(`${cookie}; sada_tz=America%2FNew_York`, { method: 'POST', body }), env)
    const row = await db.prepare('SELECT scheduled_at FROM posts WHERE id = ?').bind(post).first<{ scheduled_at: string }>()
    expect(row?.scheduled_at.slice(0, 16)).toBe(`${year}-03-10 06:00`)
  })

  it('ومنطقة معروفة: «بتوقيتك» والحقل يحملها', async () => {
    await seedApproved()
    await seedAccount()
    const cookie = `${await login()}; sada_tz=Europe%2FLondon`
    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).toContain('اليوم والساعة بتوقيتك')
    expect(html).toContain('<input type="hidden" name="tz" value="Europe/London">')
  })

  it('لا نموذج جدولة حيث لا قناة — بل جملة تقول لماذا', async () => {
    await seedApproved()
    const cookie = await login()
    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).toContain('لا قناة LinkedIn مربوطة')
    expect(html).not.toContain('action="/panel/drafts/schedule"')
  })

  it('وقناة إذنُها منته ليست وجهة — فلا تُعرض في القائمة', async () => {
    await seedApproved()
    await seedAccount('linkedin', 'needs_reauth')
    const cookie = await login()
    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).toContain('لا قناة LinkedIn مربوطة')
  })
})

/**
 * **الفعلُ على بطاقةٍ يعود إليها، والموعدُ بتوقيت المالك** (رحلات R-0 وR-2 وR-3 وR-4
 * وR-6 وR-8 وR-9).
 *
 * كان كلُّ فعلٍ على بطاقة يعيد `#posts`، فيبحث المالكُ عن بطاقته من جديد: ‏8467px
 * تمريرًا في رحلة R-4 على الهاتف. وكان إشعارُ الجدولة «06:00:00 UTC» لمن ضغط «غدا 9ص».
 */
describe('الفعل يعود إلى بطاقته، والموعد بتوقيت المالك', () => {
  type P = 'linkedin' | 'x' | 'tiktok' | 'youtube' | 'instagram'

  async function seedPost(platform: P, status: string, text = 'ن'.repeat(300), key?: string): Promise<string> {
    const id = crypto.randomUUID()
    const approved = status !== 'draft' && status !== 'rejected'
    await db
      .prepare(
        `INSERT INTO posts (id, platform, type, text, status, idempotency_key, approved_by, approved_at)
         VALUES (?, ?, 'text', ?, ?, ?, ?, ?)`,
      )
      .bind(id, platform, text, status, key ?? `k-${id}`, approved ? 'panel:token' : null, approved ? '2026-09-08 07:00:00' : null)
      .run()
    return id
  }

  async function seedAccount(platform: P, name: string): Promise<string> {
    const id = crypto.randomUUID()
    await db
      .prepare(
        'INSERT INTO accounts (id, platform, kind, external_id, display_name, status) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .bind(id, platform, 'member', id.slice(0, 8), name, 'active')
      .run()
    return id
  }

  async function withMedia(post: string, mime: string, model = 'upload'): Promise<string> {
    const id = crypto.randomUUID()
    await db
      .prepare(
        `INSERT INTO media (id, post_id, r2_key, mime, bytes, prompt, model, idempotency_key, status, width, height)
         VALUES (?, ?, ?, ?, 2048, '', ?, ?, 'ready', 1080, 1920)`,
      )
      .bind(id, post, `m/${id}`, mime, model, `m:${id}`)
      .run()
    return id
  }

  async function post(cookie: string, path: string, fields: Record<string, string | string[]>): Promise<Response> {
    const body = new FormData()
    for (const [k, v] of Object.entries(fields)) for (const one of [v].flat()) body.append(k, one)
    return app.request(path, withSession(cookie, { method: 'POST', body }), env)
  }

  /** بطاقةُ المنشور من الصفحة — من رأسها إلى البطاقة التي تليها. */
  function cardOf(html: string, id: string): string {
    const start = html.indexOf(`id="d-${id}"`)
    expect(start).toBeGreaterThan(-1)
    const next = /<div class="card draft pc(?: done)?" id="d-/g
    next.lastIndex = start
    const end = next.exec(html)?.index
    return html.slice(start, end)
  }

  const where = (r: Response): string | null => r.headers.get('Location')

  it('«اعتمد» إلى شريط جدولتها ومعه «تراجَع»، والتراجع يعيدها مسوّدةً إلى رأسها، و«ارفض» إلى رأسها', async () => {
    const id = await seedPost('linkedin', 'draft')
    await seedAccount('linkedin', 'عمر')
    const cookie = await login()

    // ‏والمربّعُ يصل بأسطر CRLF كما يرسله المتصفّح — ولا يصير ذلك «تعديلًا» (R-0)
    const approved = await post(cookie, '/panel/drafts/decide', { id, do: 'approve', text: `${'ن'.repeat(300)}\r\n` })
    expect(where(approved)).toBe(`/panel#s-${id}`)
    let html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).toContain('اعتُمدت كما كُتبت')
    expect(html).toContain('action="/panel/drafts/undo-approve"')
    expect(html).toMatch(new RegExp(`<form class="card card-inset sched" id="s-${id}"`))

    const undone = await post(cookie, '/panel/drafts/undo-approve', { id })
    expect(where(undone)).toBe(`/panel#d-${id}`)
    const row = await db.prepare('SELECT status, approved_at FROM posts WHERE id = ?').bind(id).first<Record<string, unknown>>()
    expect(row).toEqual({ status: 'draft', approved_at: null })
    html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).toContain('عادت مسوّدةً تنتظر قرارك')

    const rejected = await post(cookie, '/panel/drafts/decide', { id, do: 'reject' })
    expect(where(rejected)).toBe(`/panel#d-${id}`)
    const audit = await db
      .prepare("SELECT action FROM audit_log WHERE action LIKE 'draft.%' ORDER BY rowid")
      .all<{ action: string }>()
    expect(audit.results.map((r) => r.action)).toEqual(['draft.decide', 'draft.undo_approve', 'draft.decide'])
  })

  it('«جدوِل» إلى رأس بطاقتها والإشعار بتوقيت المالك ثمّ UTC، و«اسحب الموعد» إلى شريط جدولتها', async () => {
    const id = await seedPost('linkedin', 'approved')
    const account = await seedAccount('linkedin', 'عمر')
    const cookie = await login()
    const riyadh = `${cookie}; sada_tz=Asia%2FRiyadh`

    // ‏الاثنين ‏4 مارس ‏2030 الساعةَ ‏06:00 UTC هي ‏09:00 في الرياض
    const done = await app.request('/panel/drafts/schedule', withSession(riyadh, {
      method: 'POST',
      body: (() => { const b = new FormData(); b.set('id', id); b.set('account', account); b.set('when', '2030-03-04T06:00'); return b })(),
    }), env)
    expect(where(done)).toBe(`/panel#d-${id}`)
    let html = await (await app.request('/panel', withSession(riyadh), env)).text()
    expect(html).toContain('جُدولت على LinkedIn (عمر) الاثنين 4 مارس 2030 9:00 ص.')
    expect(html).not.toContain('أوّل دورة')

    const pulled = await post(cookie, '/panel/drafts/unschedule', { id })
    expect(where(pulled)).toBe(`/panel#s-${id}`)
    // ‏والتراجعُ بدل السؤال (D-303): الإشعارُ يحمل الموعدَ والحساب، والزرُّ يعيدهما
    html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).toContain('action="/panel/drafts/undo-unschedule"')
    const undoAt = /name="at" value="([^"]+)"/.exec(html)?.[1] ?? ''
    const undoAccount = /name="account" value="([^"]+)"/.exec(html)?.[1] ?? ''
    expect(undoAt).toBe('2030-03-04 06:00:00')
    await post(cookie, '/panel/drafts/undo-unschedule', { id, at: undoAt, account: undoAccount })
    const restored = await db.prepare('SELECT status, scheduled_at FROM posts WHERE id = ?').bind(id).first<{ status: string; scheduled_at: string }>()
    expect(restored).toEqual({ status: 'queued', scheduled_at: '2030-03-04 06:00:00' })
    html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).toContain('عاد الموعدُ كما كان.')
    await post(cookie, '/panel/drafts/unschedule', { id })

    // ‏وبلا كعكة المنطقة تُقرأ المنطقةُ التي حُفظت من آخر كعكة (D-200)، لا «UTC»
    await post(cookie, '/panel/drafts/schedule', { id, account, when: '2030-03-04T06:00' })
    html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).toContain('جُدولت على LinkedIn (عمر) الاثنين 4 مارس 2030 9:00 ص.')
    // ‏وحين لم تُعرف منطقةٌ قطّ فبتوقيت الرياض معلنًا (D-201): 06:00Z هي 09:00 بالرياض
    await db.prepare("DELETE FROM settings WHERE key = 'owner_tz'").run()
    await post(cookie, '/panel/drafts/unschedule', { id })
    await post(cookie, '/panel/drafts/schedule', { id, account, when: '2030-03-04T06:00' })
    html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).toContain('جُدولت على LinkedIn (عمر) الاثنين 4 مارس 2030 9:00 ص بتوقيت الرياض.')

    // ‏والمردودةُ إلى نموذجها حيث يُصلَح ما رُدّ
    await post(cookie, '/panel/drafts/unschedule', { id })
    const past = await post(cookie, '/panel/drafts/schedule', { id, account, when: '2020-01-01T06:00' })
    expect(where(past)).toBe(`/panel#s-${id}`)
  })

  it('«أعده إلى المعتمَد» من صفحة المنصّة إلى نموذج جدولته في المنشورات، والردّ إلى حيث كان', async () => {
    const id = await seedPost('linkedin', 'approved')
    const account = await seedAccount('linkedin', 'عمر')
    await db
      .prepare("UPDATE posts SET status = 'failed', account_id = ?, scheduled_at = '2026-09-01 09:00:00' WHERE id = ?")
      .bind(account, id)
      .run()
    const cookie = await login()

    const ok = await post(cookie, '/panel/drafts/requeue', { id, return: 'platform:linkedin:waiting' })
    expect(where(ok)).toBe(`/panel#s-${id}`)
    const again = await post(cookie, '/panel/drafts/requeue', { id, return: 'platform:linkedin:waiting' })
    expect(where(again)).toBe('/panel/channels/linkedin?tab=waiting')
  })

  /*
   * ‏مراجعة ر-8: **لا نزولَ إلى بطاقةٍ لم تُرسَم.** اللوحةُ ترسم أحدثَ ستّين منشورًا، و«فشل قبل
   * ‏أسبوعٍ فأكثر» في صفحة المنصّة يُري ما هو أقدم. كانت الإعادةُ تنزل إلى `#s-<id>` فلا تجده
   * ‏`show()` وترتدّ إلى الرئيسيّة، وإشعارُها «اختر له موعدًا» ولا نموذج.
   */
  async function outOfBoard(id: string): Promise<void> {
    await db.prepare("UPDATE posts SET created_at = '2026-08-01 00:00:00' WHERE id = ?").bind(id).run()
    for (let i = 0; i < 60; i += 1) await seedPost('linkedin', 'rejected', `حشو ${i}`)
  }

  it('إعادة منشور خارج الستّين إلى `return` حيث يُرى، وبلا `return` إلى رحلته — لا إلى الرئيسيّة', async () => {
    const id = await seedPost('linkedin', 'approved')
    const account = await seedAccount('linkedin', 'عمر')
    await db
      .prepare("UPDATE posts SET status = 'failed', account_id = ?, scheduled_at = '2026-08-01 09:00:00' WHERE id = ?")
      .bind(account, id)
      .run()
    await outOfBoard(id)
    const cookie = await login()
    expect(await (await app.request('/panel', withSession(cookie), env)).text()).not.toContain(`id="d-${id}"`)

    const ok = await post(cookie, '/panel/drafts/requeue', { id, return: 'platform:linkedin:waiting' })
    expect(where(ok)).toBe('/panel/channels/linkedin?tab=waiting')
    const waiting = await (await app.request('/panel/channels/linkedin?tab=waiting', withSession(cookie), env)).text()
    expect(waiting).toContain('عاد معتمَدًا بنصّه كما هو')

    // ‏وبلا `return`: رحلتُه تُرسَم لكلّ منشور، ولا يُكتب إشعارٌ لا تقرؤه فيظهر بعدها في غير موضعه
    await db.prepare("UPDATE posts SET status = 'failed' WHERE id = ?").bind(id).run()
    const bare = await post(cookie, '/panel/drafts/requeue', { id })
    expect(where(bare)).toBe(`/panel/journey/${id}`)
    expect((await db.prepare('SELECT status FROM posts WHERE id = ?').bind(id).first<{ status: string }>())?.status).toBe('approved')
    expect(await (await app.request('/panel', withSession(cookie), env)).text()).not.toContain('عاد معتمَدًا')
  })

  it('و«اكتب مسوّدة» لنسخة سُوّدت قبل الستّين إلى رحلة مسوّدتها، بلا إنفاق', async () => {
    const source = await seedSource('تقرير الأثر')
    await db
      .prepare('INSERT INTO content_items (id, source_id, summary, themes_json, worth_score) VALUES (?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), source, 'خلاصة.', JSON.stringify({ hash: 'md5:a', themes: [] }), 0.8)
      .run()
    const existing = await seedPost('linkedin', 'draft', 'ن'.repeat(300), `draft:${source}:linkedin:md5:a`)
    await outOfBoard(existing)
    const cookie = await login()
    const wrote = await post(cookie, '/panel/drafts/write', { id: source, platform: 'linkedin' })
    expect(where(wrote)).toBe(`/panel/journey/${existing}`)
    expect((await db.prepare('SELECT id FROM cost_ledger').all()).results).toHaveLength(0)
  })

  // ‏واسم المزوّد يطابَق على صفّ قائم ولا يمرَّر (D-244): اسم مخترَع يسقط ويعود
  // ‏التوجيه المحفوظ بمفتاحه القديم، فلا كتابة ولا إنفاق باسم يكتبه المرسل
  it('ومزوّد مخترَع في «اكتب مسوّدة» يسقط إلى التوجيه المحفوظ', async () => {
    const source = await seedSource('تقرير الأثر')
    await db
      .prepare('INSERT INTO content_items (id, source_id, summary, themes_json, worth_score) VALUES (?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), source, 'خلاصة.', JSON.stringify({ hash: 'md5:a', themes: [] }), 0.8)
      .run()
    const existing = await seedPost('linkedin', 'draft', 'ن'.repeat(300), `draft:${source}:linkedin:md5:a`)
    const cookie = await login()
    const wrote = await post(cookie, '/panel/drafts/write', { id: source, platform: 'linkedin', provider: 'ghost' })
    expect(where(wrote)).toBe(`/panel#d-${existing}`)
    expect((await db.prepare('SELECT id FROM cost_ledger').all()).results).toHaveLength(0)
    expect(await (await app.request('/panel', withSession(cookie), env)).text()).not.toContain('ghost')
  })

  it('«اكتب مسوّدة» لنسخة سُوّدت إلى بطاقتها بلا إنفاق، و«ارفض الصورة» إلى بطاقة منشورها', async () => {
    const source = await seedSource('تقرير الأثر')
    await db
      .prepare('INSERT INTO content_items (id, source_id, summary, themes_json, worth_score) VALUES (?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), source, 'خلاصة.', JSON.stringify({ hash: 'md5:a', themes: [] }), 0.8)
      .run()
    // ‏مفتاحُ المسوّدة كما يكتبه `draftKey`: المصدرُ والمنصّةُ وبصمةُ النسخة
    const existing = await seedPost('linkedin', 'draft', 'ن'.repeat(300), `draft:${source}:linkedin:md5:a`)
    const cookie = await login()

    const wrote = await post(cookie, '/panel/drafts/write', { id: source, platform: 'linkedin' })
    expect(where(wrote)).toBe(`/panel#d-${existing}`)
    expect((await db.prepare('SELECT id FROM cost_ledger').all()).results).toHaveLength(0)
    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).toContain('موجودة وهي هذه — لم يُنفَق شيء')

    const picture = await withMedia(existing, 'image/png', 'infographic:steps')
    const dropped = await post(cookie, '/panel/media/reject', { id: picture })
    expect(where(dropped)).toBe(`/panel#d-${existing}`)

    // ‏وما لم يُكتب يعود إلى نموذج الكتابة لا إلى رأس اللوح
    const unknown = await post(cookie, '/panel/drafts/write', { id: source, platform: 'snapchat' })
    expect(where(unknown)).toBe('/panel#write')
  })

  /*
   * **منشورُ Instagram يُعرَض باسمه ويُجدوَل إلى حسابه** (رحلة R-4): كان يُعرَض «LinkedIn»
   * بحدّ ‏3000، ولا يُعرَض له إلّا حسابُ LinkedIn، ويسنده «وزّع المعتمَد» إليه.
   */
  it('منشور Instagram من «فيديوهاتك»: باسمه وحسابه وحدَه، ويُجدوَل، ويوزّعه التوزيع على حسابه', async () => {
    const ig = await seedPost('instagram', 'approved', 'وصف المقطع')
    await withMedia(ig, 'video/mp4')
    const li = await seedPost('linkedin', 'approved', 'منشور مكتوب\nوسطر ثان')
    const igAccount = await seedAccount('instagram', 'omar.sada')
    const liAccount = await seedAccount('linkedin', 'عمر')
    const cookie = await login()

    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    const card = cardOf(html, ig)
    expect(card).toContain('Instagram')
    expect(card).not.toContain('LinkedIn')
    // ‏والعدّادُ لا يظهر على البطاقة إلّا قربَ الحدّ (D-215)، فالمنصّةُ من سمتها
    expect(card).toContain('data-platform="instagram"')
    expect(card).toContain(`value="${igAccount}"`)
    expect(card).not.toContain(`value="${liAccount}"`)

    // ‏والمعاينةُ والتنفيذُ يسندانه إلى حسابه
    const shown = await (await post(cookie, '/panel/drafts/spread', { start: '2030-03-04T06:00', gap: '24' })).text()
    expect(shown).not.toContain('لا قناة مربوطةً لمنصّته')
    // ‏والمعاينةُ بـ GET هي نفسُها (EASE-PLAN ب): التحديثُ لا يسأل «أعيد الإرسال؟»، ولا يكتب شيئًا
    const viaGet = await (await app.request('/panel/drafts/spread?start=2030-03-04T06%3A00&gap=24', withSession(cookie), env)).text()
    expect(viaGet).toContain('هذا ما سيقع')
    expect(viaGet).not.toContain('لا قناة مربوطةً لمنصّته')
    expect((await db.prepare("SELECT COUNT(*) AS n FROM posts WHERE status = 'queued'").first<{ n: number }>())?.n).toBe(0)
    expect((await app.request('/panel/drafts/spread?gap=24', {}, env)).status).not.toBe(200)
    await post(cookie, '/panel/drafts/spread/apply', { start: '2030-03-04T06:00', gap: '24', post: [ig, li] })
    const rows = await db
      .prepare('SELECT id, status, account_id FROM posts ORDER BY scheduled_at')
      .all<{ id: string; status: string; account_id: string }>()
    expect(rows.results).toEqual([
      { id: ig, status: 'queued', account_id: igAccount },
      { id: li, status: 'queued', account_id: liAccount },
    ])
    const flash = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(flash).toContain('جُدول منشوران، أوّلُها الاثنين 4 مارس 2030 9:00 ص بتوقيت الرياض.')
  })

  /*
   * **ومنصّةُ المقطع بلا مقطعٍ لا يُعرَض لها نموذجُ جدولة** (رحلتا R-2 وR-4): كانت
   * مسوّدةُ TikTok تُجدوَل فيُقال «مجدولة»، ثمّ يردّها الناشرُ عند موعدها بـ `no_clip`.
   */
  it('TikTok معتمَدة بلا مقطع تقول ما ينقصها مكان النموذج، وقائمة الكتابة تقول «يحتاج مقطعًا»', async () => {
    const tt = await seedPost('tiktok', 'approved', 'وصف قصير')
    await seedAccount('tiktok', 'omar.sada')
    const source = await seedSource('تقرير الأثر')
    await db
      .prepare('INSERT INTO content_items (id, source_id, summary, themes_json, worth_score) VALUES (?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), source, 'خلاصة.', JSON.stringify({ hash: 'md5:a', themes: [] }), 0.8)
      .run()
    const cookie = await login()

    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    const card = cardOf(html, tt)
    expect(card).toContain('TikTok تحتاج مقطعًا')
    expect(card).toContain(`id="s-${tt}"`)
    expect(card).not.toContain('action="/panel/drafts/schedule"')
    expect(html).toContain('TikTok — وصف مقطع (يحتاج مقطعًا)')
    expect(html).toContain('LinkedIn — حتّى 3000 محرفا')
  })

  /*
   * **والفاشلُ في «المنشورات» يقول سببَه وما يُفعَل** (رحلة R-8): كانت بطاقتُه «فشل
   * النشر» بلا سببٍ ولا زرّ، ومخلوطةً تحت «غادرت» بالمنشور الذي نُشر.
   */
  it('الفاشل بسببه و«أعده إلى المعتمَد» في بطاقته، وتبويبُه «فشلت» لا «غادرت»', async () => {
    const id = await seedPost('linkedin', 'approved')
    const account = await seedAccount('linkedin', 'عمر')
    await db
      .prepare("UPDATE posts SET status = 'failed', account_id = ?, scheduled_at = '2026-09-01 09:00:00' WHERE id = ?")
      .bind(account, id)
      .run()
    await db
      .prepare(
        `INSERT INTO publish_attempts (id, post_id, idempotency_key, attempt_no, request_json, response_json, status)
         VALUES (?, ?, ?, 1, '{}', ?, 'failed')`,
      )
      .bind(crypto.randomUUID(), id, `k-${id}`, JSON.stringify({ error: 'unexpected_error', preflight: true }))
      .run()
    const relinked = await seedPost('x', 'approved', 'منشور على X')
    const xAccount = await seedAccount('x', '@omar')
    await db
      .prepare("UPDATE posts SET status = 'failed', account_id = ?, scheduled_at = '2026-09-01 09:00:00' WHERE id = ?")
      .bind(xAccount, relinked)
      .run()
    await db
      .prepare(
        `INSERT INTO publish_attempts (id, post_id, idempotency_key, attempt_no, request_json, response_json, status)
         VALUES (?, ?, ?, 1, '{}', ?, 'failed')`,
      )
      .bind(crypto.randomUUID(), relinked, `k-${relinked}`, JSON.stringify({ error: 'token_expired', preflight: true }))
      .run()
    const cookie = await login()

    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    const card = cardOf(html, id)
    expect(card).toContain('data-status="failed"')
    expect(card).toContain('عطل لم يُتوقَّع عندنا قبل الإرسال')
    expect(card).toContain('action="/panel/drafts/requeue"')
    // ‏وحيث سقط الإذنُ فالفعلُ الأوّلُ «أعد الربط»، والإعادةُ بعده
    const x = cardOf(html, relinked)
    expect(x).toContain('انتهى الإذن قبل الإرسال')
    expect(x).toContain('href="/oauth/x/start"')
    expect(x).toContain('action="/panel/drafts/requeue"')
    expect(html).toMatch(/data-filter="draft-bucket" value="failed"[^>]*>فشلت<span class="count">2</)
    expect(html).toMatch(/data-filter="draft-bucket" value="archive"[^>]*>الأرشيف<span class="count">0</)
    expect(html).not.toContain('>غادرت<')

    const back = await post(cookie, '/panel/drafts/requeue', { id })
    expect(where(back)).toBe(`/panel#s-${id}`)
  })

  /*
   * **وشريطُ البطاقة يلتصق حيث فيه قرار** (رحلات R-3 وR-6 وR-9): كان صفُّ البطاقة
   * المقروءة يلتصق بأسفل الهاتف بلا زرٍّ فيه، ويغطّي رأسَ البطاقة وحبّةَ حالها.
   */
  it('البطاقة المختصرة (D-198): «اعتمد» و«عدّل» على المسوّدة وحدَها، والمقروءة «افتح» بلا اعتماد', async () => {
    const open = await seedPost('linkedin', 'draft')
    const read = await seedPost('x', 'rejected', 'نصّ رُفض على X')
    const cookie = await login()
    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    const draft = cardOf(html, open)
    expect(draft).toContain('<div class="pc-foot">')
    expect(draft).toContain('value="approve"')
    expect(draft).toMatch(new RegExp(`href="/panel\\?open=${open}#ed" data-edit\\s+aria-label="عدّل: [^"]+">عدّل</a>`))
    // ‏والنصُّ ثلاثةُ أسطرٍ تُقرأ، لا مربّعٌ يُحرَّر: التحريرُ في المحرّر
    expect(draft).toContain('class="pc-text"')
    expect(draft).not.toContain('<textarea')
    const done = cardOf(html, read)
    expect(done).not.toContain('value="approve"')
    expect(done).toMatch(/aria-label="افتح: نصّ رُفض على X \(X، [^"]+\)">افتح<\/a>/)
  })

  /**
   * **المحرّرُ المركّز** (D-198): `?open=<id>` يرسمه في قسم «المسوّدات» نفسِه بجوار القائمة، والتبويباتُ
   * الأربعةُ كما هي (D-195). والإغلاقُ رابطٌ إلى بطاقته، و«التفاصيل» مطويّة، والمعرّفُ يُفحَص قبل أن يُسأل عنه.
   */
  it('المحرّر يُفتح بـ?open= ويُغلق إلى بطاقته، والتبويبات الثلاثة باقية، والتفاصيل مطويّة', async () => {
    const id = await seedPost('linkedin', 'draft')
    await db.prepare("UPDATE posts SET model = 'claude-opus-5', approved_by = NULL WHERE id = ?").bind(id).run()
    await seedAccount('linkedin', 'عمر')
    const cookie = await login()
    const html = await (await app.request(`/panel?open=${id}`, withSession(cookie), env)).text()
    expect(html).toContain('<div class="posts-split">')
    expect(html).toContain(`<aside class="card ed" id="ed" aria-labelledby="ed-t" data-post="${id}">`)
    // ‏والمحرّرُ داخل «المسوّدات» لا تبويبٌ خامس
    const list = html.slice(html.indexOf('id="sub-list"'), html.indexOf('id="sub-write"'))
    expect(list).toContain('id="ed"')
    // ‏ثلاثةُ تبويباتٍ في «المنشورات» بعد أن صار الفيديو في «المكتبة» (D-206)
    const bar = html.slice(html.indexOf('id="posts-sub"'), html.indexOf('</nav>', html.indexOf('id="posts-sub"')))
    expect((bar.match(/href="#sub-/g) ?? []).length).toBe(3)
    expect(html).toContain(`href="/panel#d-${id}" aria-label="أغلق المنشور وارجع إلى القائمة"`)
    expect(html).toContain('<details class="ed-more" id="ed-details"><summary>التفاصيل</summary>')
    expect(html).not.toMatch(/<details class="ed-more"[^>]*\sopen/)
    // ‏ومن كتبها باسم الخدمة، والمعرّفُ تحت «التفاصيل» وحدَها لا في الرأس
    const details = html.slice(html.indexOf('id="ed-details"'))
    expect(details).toContain('Claude')
    const head = html.slice(html.indexOf('<div class="ed-head">'), html.indexOf('<div class="ed-body">'))
    expect(head).not.toContain('claude-opus-5')
    // ‏وبطاقتُه في القائمة معلَّمةٌ وبلا طيّة: ما فيها في المحرّر، ولا معرّفَ يتكرّر
    expect(cardOf(html, id)).toContain('aria-current="true"')
    expect(cardOf(html, id)).not.toContain('draft-more')
    expect(html).toContain('<textarea id="ed-txt" name="text" form="ed-form"')
    expect(html).toContain('value="approve-schedule"')
    expect(html).toContain('value="save"')

    // ‏ومعرّفٌ لا يصحّ لا يُسأل عنه، ولا محرّر
    const bad = await (await app.request('/panel?open=%3Cscript%3E', withSession(cookie), env)).text()
    expect(bad).not.toContain('id="ed"')
    expect(bad).not.toContain('<script>')
    const none = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(none).not.toContain('posts-split')
  })

  it('«احفظ» يكتب النصّ ولا يعتمده ويعود إلى المحرّر، ثمّ «اعتمد» منه يعتمده «بعد تعديل» إلى موعده', async () => {
    const id = await seedPost('linkedin', 'draft')
    const cookie = await login()
    const edited = `${'م'.repeat(120)}\r\nسطر أُضيف`
    const saved = await post(cookie, '/panel/drafts/decide', { id, do: 'save', from: 'editor', text: edited })
    expect(where(saved)).toBe(`/panel?open=${id}#ed`)
    let row = await db.prepare('SELECT status, text, original_text, approved_at FROM posts WHERE id = ?').bind(id).first<Record<string, unknown>>()
    expect(row).toEqual({ status: 'draft', text: `${'م'.repeat(120)}\nسطر أُضيف`, original_text: 'ن'.repeat(300), approved_at: null })

    // ‏ونصٌّ قصيرٌ يُردّ بفحص الاعتماد نفسِه، ولا يُكتب
    const short = await post(cookie, '/panel/drafts/decide', { id, do: 'save', from: 'editor', text: 'قصير' })
    expect(where(short)).toBe(`/panel?open=${id}#ed`)
    expect((await db.prepare('SELECT text FROM posts WHERE id = ?').bind(id).first<{ text: string }>())?.text).toContain('سطر أُضيف')

    // ‏والاعتمادُ بالمحفوظ نفسِه «بعد تعديل»: المقارنةُ بالأصل لا بالمحفوظ
    const approved = await post(cookie, '/panel/drafts/decide', { id, do: 'approve', from: 'editor', text: edited })
    expect(where(approved)).toBe(`/panel?open=${id}#ed-when`)
    row = await db.prepare('SELECT status, original_text FROM posts WHERE id = ?').bind(id).first<Record<string, unknown>>()
    expect(row).toEqual({ status: 'edited', original_text: 'ن'.repeat(300) })
  })

  it('والحفظ التلقائيّ (D-233): «auto=1» يُجاب بسطر لا بتحويل، وبفحص الاعتماد نفسِه', async () => {
    const id = await seedPost('linkedin', 'draft')
    const cookie = await login()
    const ok = await post(cookie, '/panel/drafts/decide', { id, do: 'save', from: 'editor', auto: '1', text: 'م'.repeat(150) })
    expect(ok.status).toBe(200)
    expect(await ok.json()).toEqual({ ok: true })
    expect((await db.prepare('SELECT status, text FROM posts WHERE id = ?').bind(id).first<Record<string, string>>())).toEqual({ status: 'draft', text: 'م'.repeat(150) })
    const short = await post(cookie, '/panel/drafts/decide', { id, do: 'save', from: 'editor', auto: '1', text: 'قصير' })
    expect(short.status).toBe(422)
    expect(((await short.json()) as { ok: boolean }).ok).toBe(false)
    expect((await db.prepare('SELECT text FROM posts WHERE id = ?').bind(id).first<{ text: string }>())?.text).toBe('م'.repeat(150))
  })

  it('«اعتمد» على البطاقة المختصرة بلا مربّع يعتمد المحفوظ كما كُتب ويعود إلى شريط جدولتها', async () => {
    const id = await seedPost('x', 'draft', 'نصّ كما كتبه النموذج على X، وطولُه يكفي ليكون منشورًا يُقرأ.')
    const cookie = await login()
    const r = await post(cookie, '/panel/drafts/decide', { id, do: 'approve' })
    expect(where(r)).toBe(`/panel#s-${id}`)
    const row = await db.prepare('SELECT status, text FROM posts WHERE id = ?').bind(id).first<Record<string, unknown>>()
    expect(row).toEqual({ status: 'approved', text: 'نصّ كما كتبه النموذج على X، وطولُه يكفي ليكون منشورًا يُقرأ.' })
  })

  it('«اعتمد وجدوِل» بتوقيت المالك: «غدًا 9:00 ص» في الرياض السادسة UTC، ويعود إلى بطاقته', async () => {
    const id = await seedPost('linkedin', 'draft')
    const account = await seedAccount('linkedin', 'عمر')
    const cookie = `${await login()}; sada_tz=Asia/Riyadh`
    // ‏والمحرّرُ يقول المنطقةَ ويحسب الأزرارَ بها
    const html = await (await app.request(`/panel?open=${id}`, withSession(cookie), env)).text()
    expect(html).not.toContain('بتوقيت الرياض.</p>')
    expect(html).toContain('<input type="radio" name="preset" value="tomorrow" form="ed-form" checked>')
    expect(html).not.toContain('الموعد (UTC)')

    const r = await post(cookie, '/panel/drafts/decide', { id, do: 'approve-schedule', from: 'editor', account, preset: 'tomorrow', text: 'ن'.repeat(300) })
    expect(where(r)).toBe(`/panel#d-${id}`)
    const row = await db.prepare('SELECT status, account_id, scheduled_at FROM posts WHERE id = ?').bind(id).first<Record<string, string>>()
    expect(row?.['status']).toBe('queued')
    expect(row?.['account_id']).toBe(account)
    expect(row?.['scheduled_at']).toMatch(/ 06:00:00$/)

    // ‏و«غيّر الموعد» يبدّل الموعدَ وحدَه بيومٍ وساعةٍ بتوقيته
    const moved = await post(cookie, '/panel/drafts/reschedule', { id, from: 'editor', preset: 'custom', local: '2031-01-05T21:30' })
    expect(where(moved)).toBe(`/panel#d-${id}`)
    const after = await db.prepare('SELECT status, scheduled_at FROM posts WHERE id = ?').bind(id).first<Record<string, string>>()
    expect(after).toEqual({ status: 'queued', scheduled_at: '2031-01-05 18:30:00' })
    // ‏وموعدٌ لا يُفهم يعود إلى موعده في المحرّر ولا يُمسّ المحفوظ
    const bad = await post(cookie, '/panel/drafts/reschedule', { id, from: 'editor', preset: 'custom', local: '' })
    expect(where(bad)).toBe(`/panel?open=${id}#ed-when`)
    expect((await db.prepare('SELECT scheduled_at FROM posts WHERE id = ?').bind(id).first<{ scheduled_at: string }>())?.scheduled_at).toBe('2031-01-05 18:30:00')
  })

  it('والسحب في الخطّ الزمنيّ (D-233): المجدول قابل للسحب، والنقل يعود إلى نافذته', async () => {
    const id = await seedPost('linkedin', 'draft')
    const account = await seedAccount('linkedin', 'عمر')
    const cookie = `${await login()}; sada_tz=Asia/Riyadh`
    const soon = new Date(Date.now() + 2 * 864e5)
    const local = new Date(soon.getTime() + 3 * 3600e3).toISOString().slice(0, 16)
    await post(cookie, '/panel/drafts/decide', { id, do: 'approve-schedule', from: 'editor', account, preset: 'custom', local, text: 'ن'.repeat(300) })
    const html = await (await app.request('/panel/timeline?span=14', withSession(cookie), env)).text()
    expect(html).toContain(`data-move="${id}"`)
    expect(html).toContain('<form id="gt-move" method="POST" action="/panel/drafts/reschedule" hidden><input type="hidden" name="_csrf"')
    const when = new Date(soon.getTime() + 864e5).toISOString().slice(0, 16)
    const r = await post(cookie, '/panel/drafts/reschedule', { id, when, from: 'timeline', back: '/panel/timeline?span=14' })
    expect(where(r)).toBe('/panel/timeline?span=14')
    expect((await db.prepare('SELECT scheduled_at FROM posts WHERE id = ?').bind(id).first<{ scheduled_at: string }>())?.scheduled_at)
      .toBe(`${when.replace('T', ' ')}:00`)
    // ‏ورجوعٌ إلى غير الخطّ الزمنيّ لا يُتّبع
    const odd = await post(cookie, '/panel/drafts/reschedule', { id, when, from: 'timeline', back: 'https://evil.example/' })
    expect(where(odd)).toBe(`/panel#d-${id}`)
  })

  it('«انقلها إلى» على بطاقة المجدولة: ضغطة واحدة تغيّر الموعد بتوقيت المالك (D-200)', async () => {
    const id = await seedPost('linkedin', 'draft')
    const account = await seedAccount('linkedin', 'عمر')
    const cookie = `${await login()}; sada_tz=Asia/Riyadh`
    await post(cookie, '/panel/drafts/decide', { id, do: 'approve-schedule', from: 'editor', account, preset: 'custom', local: '2031-01-05T21:30', text: 'ن'.repeat(300) })
    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    const card = html.slice(html.indexOf(`id="d-${id}"`))
    expect(card.slice(0, 3000)).toContain('action="/panel/drafts/reschedule"')
    expect(card.slice(0, 3000)).toContain('name="preset" value="sunday">الأحد 9:00 ص</button>')
    const r = await post(cookie, '/panel/drafts/reschedule', { id, preset: 'tomorrow' })
    expect(where(r)).toBe(`/panel#d-${id}`)
    const row = await db.prepare('SELECT status, account_id, scheduled_at FROM posts WHERE id = ?').bind(id).first<Record<string, string>>()
    expect(row?.['status']).toBe('queued')
    expect(row?.['account_id']).toBe(account)
    expect(row?.['scheduled_at']).toMatch(/ 06:00:00$/)
  })

  it('وبلا كعكة تُقرأ المنطقة المحفوظة، وأوّل زيارة حقًّا بتوقيت الرياض لا غرينتش (D-200 · D-201)', async () => {
    const id = await seedPost('linkedin', 'draft')
    await seedAccount('linkedin', 'عمر')
    const bare = await login()
    // ‏أوّلُ زيارةٍ حقًّا: لا كعكةَ ولا منطقةَ عُرفت
    const first = await (await app.request(`/panel?open=${id}`, withSession(bare), env)).text()
    expect(first).toContain('<p class="hint m-0">بتوقيت الرياض.</p>')
    expect(first).toContain('اليوم والساعة (بتوقيت الرياض)')
    expect(first).not.toContain('غرينتش')
    expect(first).not.toContain('لم تصل منطقتُك')
    // ‏ثمّ تصل الكعكةُ مرّة، فتُحفظ وتُقرأ حين تغيب
    await app.request('/panel', withSession(`${bare}; sada_tz=Asia%2FRiyadh`), env)
    const later = await (await app.request(`/panel?open=${id}`, withSession(bare), env)).text()
    expect(later).not.toContain('بتوقيت الرياض.</p>')
    expect(later).not.toContain('غرينتش')
  })

  it('ومردود «اعتمد وجدوِل» بلا حساب يبقى معتمَدًا ويعود إلى موعده في المحرّر', async () => {
    const id = await seedPost('linkedin', 'draft')
    const cookie = await login()
    const r = await post(cookie, '/panel/drafts/decide', { id, do: 'approve-schedule', from: 'editor', account: '', preset: 'tomorrow', text: 'ن'.repeat(300) })
    expect(where(r)).toBe(`/panel?open=${id}#ed-when`)
    expect((await db.prepare('SELECT status FROM posts WHERE id = ?').bind(id).first<{ status: string }>())?.status).toBe('approved')
    const html = await (await app.request(`/panel?open=${id}`, withSession(cookie), env)).text()
    expect(html).toContain('اعتُمدت، وتعذّرت جدولتُها')
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

  it.each(PAGES)('%s لا تحمل نجوما ولا شرطات قوائم حرفيّة', async (path) => {
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
describe('شاشة المنصّة', () => {
  it('لا تُفتَح بلا جلسة — والحارس هو حارس اللوحة نفسه', async () => {
    const response = await app.request('/panel/channels/linkedin', {}, env)
    expect(response.status).toBe(401)
  })

  /*
   * **كلُّ نموذجٍ في الشاشة يحمل رمزَه.** نموذجا ضبط التطبيق كانا يُرسَلان
   * بلا `_csrf` فيُردّان بـ403 — والاختباراتُ تحقن الرمزَ بنفسها فلم تره.
   */
  it('كلّ نموذج POST فيها يحمل رمز CSRF', async () => {
    const cookie = await login()
    for (const id of ['linkedin', 'x', 'youtube', 'tiktok', 'instagram']) {
      let seen = 0
      for (const tab of ['', '?tab=setup', '?tab=waiting']) {
        const html = await (await app.request(`/panel/channels/${id}${tab}`, withSession(cookie), env)).text()
        const forms = html.match(/<form\b[^>]*method="POST"[^>]*>\s*<input type="hidden" name="_csrf"|<form\b[^>]*method="POST"[^>]*>/gi) ?? []
        seen += forms.length
        for (const f of forms) expect(f, `${id}${tab}`).toContain('_csrf')
      }
      expect(seen, id).toBeGreaterThan(0)
    }
  })

  it('ومنصّة لا وجود لها ٤٠٤ — لا صفحة فارغة', async () => {
    const cookie = await login()
    const response = await app.request(
      '/panel/channels/myspace', withSession(cookie), env,
    )
    expect(response.status).toBe(404)
  })

  it('تعرض المنشور برابطه عند المنصّة', async () => {
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
         VALUES ('p1', 'linkedin:member:abc', 'linkedin', 'text', 'نصّ المنشور',
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
    expect(html).toContain('نصّ المنشور')
    expect(html).toContain('linkedin.com/feed/update/')
  })

  it('وما لم يُبن يقول سببَه لا «قريبا»', async () => {
    const cookie = await login()
    const html = await (
      await app.request('/panel/channels/snapchat', withSession(cookie), env)
    ).text()
    expect(html).toContain('منصّة لم تُبن')
    // السببُ يُصدَّق، والوعدُ يُنتظَر ثمّ يُنسى
    expect(html).not.toContain('قريبا')
    expect(html).toContain('سائقا يُكتب لها وحدها')
  })

  it('ولا زرّ ربط لما لم يُبن — ولو فُتحت شاشتُه', async () => {
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
    // **والقائمةُ من السجلّ لا مكتوبةٌ حرفا**: منصّةٌ تنتقل مرتبةً
    // تُنسى في إحدى القائمتين، وهي علّةُ `KNOWN_TASKS` نفسُها (D-091).
    // والمرتبةُ فارغةٌ اليوم بعد D-092 و D-096 — **ويبقى الحارسُ
    // مبنيّا**: تُملأ حين تُربَط منصّةٌ قبل أن يُبنى سائقُها.
    const linkOnly = CHANNELS.filter((c) => c.stage === 'link')
    for (const spec of linkOnly) {
      const html = await (
        await app.request(`/panel/channels/${spec.id}`, withSession(cookie), env)
      ).text()
      expect(html, spec.id).toContain('تُربَط ولا تنشر')
      // ولا يُعرَض حصادُ نشرٍ لمنصّةٍ لا تنشر — أصفارٌ تُقرأ فشلا
      expect(html, spec.id).not.toContain('لم يُنشر شيء بعد')
    }
  })

  /** **وما صار ينشر لا يبقى يقول إنّه لا ينشر** — الشاشةُ تتبع السائق. */
  it('وكلّ ما بُني سائقُه لا يقول «تُربَط ولا تنشر»', async () => {
    const cookie = await login()
    for (const spec of CHANNELS.filter((c) => c.stage === 'publish')) {
      const html = await (
        await app.request(`/panel/channels/${spec.id}`, withSession(cookie), env)
      ).text()
      expect(html, spec.id).not.toContain('تُربَط ولا تنشر')
    }
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
      await app.request('/panel/channels/linkedin?tab=setup', withSession(cookie), env)
    ).text()
    expect(html).toContain('w_member_social')
    expect(html).toContain('Share on LinkedIn')
    // ‏والعددُ بمعدوده (D-183): نطاقٌ واحدٌ ناقص — كان «1 نطاقا ناقصا»
    expect(html).toContain('ينقص نطاق واحد')
  })
})

/**
 * ضبطُ تطبيقَي OAuth من اللوحة (D-042).
 *
 * وأخطرُ ما يُختبَر: **أنّ السرَّ لا يعود إلى الشاشة بعد حفظه**.
 */
describe('ضبط التطبيق من اللوحة', () => {
  async function save(cookie: string, id = '78k4gm3yw1g18e', secret = 'WPL_AP1.سرّيّة.طويلة') {
    const body = new FormData()
    body.set('platform', 'linkedin')
    body.set('client_id', id)
    body.set('client_secret', secret)
    return app.request('/panel/channels/app', withSession(cookie, { method: 'POST', body }), env)
  }

  /*
   * **المعرّفُ يُرى كما لُصق** — لاتينيٌّ في صفحةٍ عربيّة. معرّفُ Google
   * `147…-k2b….apps.googleusercontent.com` يبدأ بأرقامٍ ثمّ شرطة، وفي حقلٍ
   * يرث اتّجاهَ الصفحة تنتقل الأرقامُ إلى آخره فيُقرأ معكوسًا والقيمةُ سليمة.
   * فكلُّ حقلٍ تقنيٍّ لاتينيُّ الاتّجاه بسمته، في كلّ صفحةٍ يُكتب فيها.
   */
  it('حقول المعرّف والسرّ والمفتاح والعنوان لاتينيّة الاتّجاه — ومعرّف Google يُحفَظ كما لُصق', async () => {
    const cookie = await login()
    const googleId = '147369989995-k2baktqm1upbht37cn4inclce251au8j.apps.googleusercontent.com'
    const body = new FormData()
    body.set('platform', 'youtube')
    body.set('client_id', googleId)
    body.set('client_secret', 'GOCSPX-سرّ-للاختبار')
    await app.request('/panel/channels/app', withSession(cookie, { method: 'POST', body }), env)
    const row = db.raw.prepare('SELECT client_id FROM oauth_apps WHERE platform = ?').get('youtube') as { client_id: string }
    expect(row.client_id).toBe(googleId)

    const TECH = /\bname="(client_id|client_secret|key|base_url|model|token|code)"/
    const pages = [
      await (await everyPane((p) => app.request(p, withSession(cookie), env))),
      await (await app.request('/panel/channels/youtube?tab=setup', withSession(cookie), env)).text(),
    ]
    const inputs = pages.flatMap((html) => [...html.matchAll(/<input\b[^>]*>/g)].map((m) => m[0]))
      .filter((tag) => TECH.test(tag) && !tag.includes('type="hidden"'))
    expect(inputs.map((tag) => TECH.exec(tag)?.[1])).toEqual(expect.arrayContaining(['client_id', 'client_secret', 'key', 'base_url', 'model']))
    for (const tag of inputs) expect(tag).toContain('dir="ltr"')
    expect(pages[1]).toContain(`value="${googleId}"`)
    // ‏ونهايةُ المعرّف في الدليل معزولةٌ: نقطتُها الأولى لا تقفز إلى آخر السطر
    expect(pages[1]).toContain('<span class="mono">.apps.googleusercontent.com</span>')
    expect(pages[1]).toContain('<b>Audience</b>')
  })

  it('يحفظ مشفَّرا، ولا يُخزَّن السرّ خاما', async () => {
    const cookie = await login()
    await save(cookie)

    const row = db.raw
      .prepare('SELECT client_id, secret_enc, hint FROM oauth_apps WHERE platform = ?')
      .get('linkedin') as { client_id: string; secret_enc: string; hint: string }
    expect(row.client_id).toBe('78k4gm3yw1g18e')
    expect(row.secret_enc).not.toContain('سرّيّة')
    expect(row.hint).not.toContain('سرّيّة')
  })

  it('**ولا يعود السرّ إلى الشاشة** — قناعُه وحده', async () => {
    const cookie = await login()
    await save(cookie)
    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    const screen = await (await app.request(
      '/panel/channels/linkedin?tab=setup', withSession(cookie), env,
    )).text()

    // **ولا يعود السرُّ إلى شاشةٍ قطُّ** — لا اللوح ولا شاشةُ المنصّة
    for (const page of [html, screen]) {
      expect(page).not.toContain('سرّيّة')
      expect(page).not.toContain('WPL_AP1')
    }
    // والمعرّفُ علنيٌّ فيظهر حيث يسكن الضبط (D-111)
    expect(screen).toContain('78k4gm3yw1g18e')
  })

  it('ويصير الربط ممكنا — بعد أن كان «تنتظرك»', async () => {
    const cookie = await login()
    const before = await (await app.request('/panel/accounts', withSession(cookie), env)).text()
    expect(before).toContain('/panel/channels/linkedin')

    await save(cookie)
    const after = await (await app.request('/panel/accounts', withSession(cookie), env)).text()
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

  it('والسجلّ يحفظ مَن بدّل ولأيّ منصّة — ولا يحفظ القيمة', async () => {
    const cookie = await login()
    await save(cookie)
    const audit = db.raw
      .prepare("SELECT target, detail FROM audit_log WHERE action = 'oauth_app.save'")
      .all() as { target: string; detail: string }[]
    expect(audit).toHaveLength(1)
    expect(audit[0]?.target).toBe('linkedin')
    expect(JSON.stringify(audit)).not.toContain('سرّيّة')
  })

  it('والسرّ نفسه يُقال إنّه لم يتغيّر — فلا يُوهَم المالك', async () => {
    const cookie = await login()
    await save(cookie)
    await save(cookie)
    const audit = db.raw
      .prepare("SELECT detail FROM audit_log WHERE action = 'oauth_app.save' ORDER BY rowid")
      .all() as { detail: string }[]
    expect(audit.map((a) => a.detail)).toEqual(['saved', 'unchanged'])
  })

  /**
   * **الخزانةُ لكلّ منصّةٍ لها سرّان** (D-142): كانت مقصورةً على LinkedIn وX،
   * فشاشةُ YouTube تعد بدليلٍ أسفلَها ولا شيءَ أسفلَها، والحفظُ لها يُردّ.
   */
  it('وYouTube تُحفَظ أسرارُها وتُقرأ حالُها كغيرها', async () => {
    const cookie = await login()
    const before = await (await app.request('/panel/channels/youtube?tab=setup', withSession(cookie), env)).text()
    expect(before).toContain('ضبط التطبيق ودليلُه')
    expect(before).toContain('id="setup"')
    // ‏وزرُّ الرأس يذهب إليه من أيّ تبويب (D-172)
    expect(before).toContain('href="/panel/channels/youtube?tab=setup#ci-youtube"')
    expect(before).toContain('oauth/youtube/callback')

    const body = new FormData()
    body.set('platform', 'youtube')
    body.set('client_id', '1234567890-abc.apps.googleusercontent.com')
    body.set('client_secret', 'GOCSPX-سرّ-طويل-لا-يُعرَض')
    await app.request('/panel/channels/app', withSession(cookie, { method: 'POST', body }), env)
    const rows = db.raw.prepare('SELECT platform FROM oauth_apps').all() as { platform: string }[]
    expect(rows.map((r) => r.platform)).toEqual(['youtube'])

    const after = await (await app.request('/panel/channels/youtube?tab=setup', withSession(cookie), env)).text()
    expect(after).toContain('محفوظ.')
    expect(after).not.toContain('GOCSPX-سرّ')
  })

  it('ومنصّة غير معروفة تُردّ ولا تصل إلى القاعدة', async () => {
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

/*
 * ‏**ر-1 · ضبطُ التطبيق يعود إلى موضعه** (خطّ الأساس، 2026-10-04): «احفظ» و«افحص الزوج»
 * ‏و«احذف» كانت ترمي المالكَ إلى لوح القنوات، والإشعارُ باسم المنصّة الصغير «tiktok»،
 * ‏ورسائلُ الفحص تقول «تبويب Auth» لكلّ منصّةٍ وتكتب «**تعرفه**» وTypeError خامًّا.
 */
describe('ضبط التطبيق يعود إلى تبويب الإعداد (ر-1)', () => {
  const realFetch = globalThis.fetch
  afterEach(() => { globalThis.fetch = realFetch })

  function form(over: Record<string, string> = {}): FormData {
    const body = new FormData()
    body.set('platform', 'tiktok')
    body.set('return', 'platform:tiktok:setup')
    body.set('client_id', 'tt-key-123')
    body.set('client_secret', 'tt-secret-سرّيّ')
    for (const [k, v] of Object.entries(over)) body.set(k, v)
    return body
  }

  it('«احفظ» يعود إلى الإعداد، والإشعار باسم المنصّة، و«اربط TikTok» أوّل ما في الرأس', async () => {
    const cookie = await login()
    const saved = await app.request('/panel/channels/app', withSession(cookie, { method: 'POST', body: form() }), env)
    expect(saved.status).toBe(303)
    expect(saved.headers.get('location')).toBe('/panel/channels/tiktok?tab=setup')
    const page = await (await app.request('/panel/channels/tiktok?tab=setup', withSession(cookie), env)).text()
    expect(page).toContain('حُفظت أسرار TikTok مشفَّرة')
    expect(page).not.toContain('أسرار tiktok')
    expect(page).toContain('<a class="btn btn-primary" href="/oauth/tiktok/start">اربط TikTok</a>')
    expect(page).not.toContain('tt-secret')
  })

  it('والفراغ يُردّ في الإعداد نفسِه، والحقلان على الصفحة التي يعود إليها', async () => {
    const cookie = await login()
    const saved = await app.request('/panel/channels/app',
      withSession(cookie, { method: 'POST', body: form({ client_id: '   ' }) }), env)
    expect(saved.headers.get('location')).toBe('/panel/channels/tiktok?tab=setup')
    const page = await (await app.request('/panel/channels/tiktok?tab=setup', withSession(cookie), env)).text()
    expect(page).toContain('class="toast-note bad"')
    expect(page).toContain('id="ci-tiktok"')
    expect(page).toContain('pattern="\\S.*"')
  })

  it('و«افحص الزوج» بلا شبكة يقول «لم نصل» لا TypeError، ويعود إلى الإعداد', async () => {
    const cookie = await login()
    await app.request('/panel/channels/app', withSession(cookie, { method: 'POST', body: form() }), env)
    await app.request('/panel/channels/tiktok?tab=setup', withSession(cookie), env)
    globalThis.fetch = (async () => { throw new TypeError('network disabled for https://open.tiktokapis.com') }) as unknown as typeof fetch
    const probed = await app.request('/panel/channels/app/verify', withSession(cookie, { method: 'POST', body: form() }), env)
    expect(probed.headers.get('location')).toBe('/panel/channels/tiktok?tab=setup')
    const page = await (await app.request('/panel/channels/tiktok?tab=setup', withSession(cookie), env)).text()
    expect(page).toContain('لم نصل إلى TikTok الآن، فلم يُحسَم الفحص. أعد الفحص بعد دقيقة.')
    expect(page).not.toContain('TypeError')
  })

  it('و«السرّ مرفوض» بلغة بوّابة المنصّة، بلا «تبويب Auth» ولا نجمتين', async () => {
    const cookie = await login()
    await app.request('/panel/channels/app', withSession(cookie, { method: 'POST', body: form() }), env)
    await app.request('/panel/channels/tiktok?tab=setup', withSession(cookie), env)
    globalThis.fetch = (async () => Response.json({ error: 'invalid_client', error_description: 'bad secret' }, { status: 401 })) as unknown as typeof fetch
    await app.request('/panel/channels/app/verify', withSession(cookie, { method: 'POST', body: form() }), env)
    const page = await (await app.request('/panel/channels/tiktok?tab=setup', withSession(cookie), env)).text()
    const flash = page.slice(page.indexOf('class="toast-note'), page.indexOf('</div>', page.indexOf('class="toast-note')))
    expect(flash).toContain('السرّ مرفوض: TikTok تعرف المعرّف tt-key-123')
    expect(flash).toContain('TikTok for Developers')
    expect(flash).not.toContain('تبويب Auth')
    expect(flash).not.toContain('**')
    // ‏والدليلُ مفتوحٌ بعد الرفض: الحقلان و«افحص الزوج» لا يختبئان خلف ضغطة
    expect(page).toMatch(/<details class="card card-inset guide" open>/)
  })

  it('و«احذف» يعود إلى الإعداد كذلك', async () => {
    const cookie = await login()
    await app.request('/panel/channels/app', withSession(cookie, { method: 'POST', body: form() }), env)
    const gone = await app.request('/panel/channels/app/delete', withSession(cookie, { method: 'POST', body: form() }), env)
    expect(gone.headers.get('location')).toBe('/panel/channels/tiktok?tab=setup')
    expect(db.raw.prepare('SELECT platform FROM oauth_apps').all()).toHaveLength(0)
  })

  it('و«return» حرّ لا يصنع تحويلةً مفتوحة', async () => {
    const cookie = await login()
    const saved = await app.request('/panel/channels/app',
      withSession(cookie, { method: 'POST', body: form({ return: '//evil.example' }) }), env)
    expect(saved.headers.get('location')).toBe('/panel/accounts#channels')
  })
})

/**
 * **الشريطُ فيه روابطُ صفحاتٍ حقيقيّة** (D-087).
 *
 * وهذا ما يجعل تصفيةَ المراسي في السكربت شرطا لا تحسينا: لو خلا الشريطُ
 * منها لما ظهر العطل. فيُحرَس الطرفان — الشاشةُ التي تعرضها، والسكربتُ
 * الذي لا يخطفها.
 */
describe('روابط الشريط — والصفحات منها تُفتَح فعلا', () => {
  it('في الشريط روابط صفحات لا مراسي فقط', async () => {
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
    // ‏واسمُها اسمُها في الرافدة (D-166): كانت «مهامُّ المالك» والرابطُ «ما عليك»
    expect(await response.text()).toContain('<h1>ما عليك</h1>')
  })

  it('وشاشة المنصّة كذلك', async () => {
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
describe('توزيع المعتمَد على أيّام', () => {
  async function seedApproved(platform: 'linkedin' | 'x' = 'linkedin'): Promise<string> {
    const id = crypto.randomUUID()
    await db
      .prepare(
        `INSERT INTO posts (id, platform, type, text, status, idempotency_key, approved_by, approved_at)
         VALUES (?, ?, 'text', ?, 'approved', ?, 'panel:token', '2026-09-08T07:00:00Z')`,
      )
      .bind(id, platform, `منشور ${id.slice(0, 6)}\nوسطر ثان`, `k-${id}`)
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

  it('**المعاينة لا تكتب شيئا** — ولا منشور يصير مجدولا بعرضه', async () => {
    const posts = [await seedApproved(), await seedApproved(), await seedApproved()]
    await seedAccount()
    const cookie = await login()

    const response = await preview(cookie)
    expect(response.status).toBe(200)
    const html = await response.text()
    expect(html).toContain('اعتمد التوزيع')
    expect(html).toContain('ولا يقع منه شيء حتّى تضغط')

    for (const id of posts) {
      const row = await db.prepare('SELECT status FROM posts WHERE id = ?').bind(id).first<{ status: string }>()
      expect(row?.status).toBe('approved')
    }
  })

  it('وتعرض كلّ خانة بموعدها — لا عددا مجرّدا', async () => {
    await seedApproved()
    await seedApproved()
    await seedAccount()
    const cookie = await login()

    const html = await (await preview(cookie, '6')).text()
    // موعدان اثنان بصيغةٍ تُقرأ، وفاصلٌ يُقال
    // المواعيدُ بوسم whenTag الواحد لا بسكربتٍ خاصّ (D-151)
    expect((html.match(/<td class="when"><time class="when-t"/g) ?? []).length).toBe(2)
    expect(html).not.toContain('data-utc=')
    expect(html).toContain('كلّ 6 ساعةً')
  })

  it('**والتنفيذ يجدول ما عُرض** — بحالة ومواعيد متتابعة', async () => {
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

  it('**وما لم يُعرَض لا يُنفَّذ** — منشور خارج النموذج يبقى معتمَدا', async () => {
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

  it('**ولا يلتفّ حول حارس الجدولة** — صفحة ليست وجهةً تُنشَر باسمها', async () => {
    await seedApproved()
    await seedApproved()
    await seedAccount('linkedin', 'org')
    const cookie = await login()

    const html = await (await preview(cookie)).text()
    expect(html).toContain('لا شيء يُوزَّع')
    expect(html).toContain('لا قناة')
  })

  it('وفاصل خارج المدى يُقصّ ولا تُردّ الاستمارة', async () => {
    await seedApproved()
    await seedApproved()
    await seedAccount()
    const cookie = await login()

    const response = await preview(cookie, '99999')
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('كلّ 168 ساعةً')
  })

  it('والشريط لا يظهر على معتمَدة واحدة — التوزيع لاثنتين فصاعدا', async () => {
    await seedApproved()
    await seedAccount()
    const cookie = await login()

    const one = await (await app.request('/panel', { headers: { Cookie: cookie } }, env)).text()
    expect(one).not.toContain('id="spread"')

    await seedApproved()
    const two = await (await app.request('/panel', { headers: { Cookie: cookie } }, env)).text()
    // ‏سطرٌ مطويٌّ لا نموذجٌ مفتوح (D-199)
    expect(two).toContain('<details class="card card-inset spread" id="spread">')
    expect(two).toContain('2 جاهزة للتوزيع')
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

  /*
   * ‏**مطويّةٌ، والأساسُ أوّلًا** (D-199): المحرّرُ لا يُفتَح إلّا بـ«?open=»، و«وزّع المعتمَد» سطرٌ مطويّ،
   * ‏والفرزُ قبله، ولا UTC ولا ‹mm/dd› فيما يراه المالكُ قبل أن يفتح شيئًا.
   */
  describe('الطيّ (D-199)', () => {
    /** ما يُرى من قسم «المسوّدات» قبل أيّ نقرة: بلا طيّاتٍ مغلقة ولا مخفيٍّ ولا سكربت ولا وسوم. */
    function seen(html: string): string {
      let part = html.slice(html.indexOf('id="sub-list"'), html.indexOf('id="sub-write"'))
      part = part.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '')
      const shut = /<details(?![^>]*\sopen)[^>]*>(?:(?!<details)[\s\S])*?<\/details>/g
      for (let before = ''; before !== part;) { before = part; part = part.replace(shut, '') }
      return part
    }

    it('المحرّر مغلق ما لم يُطلَب بـ«?open=»', async () => {
      const id = await seedApproved()
      await seedAccount()
      const cookie = await login()
      const plain = await (await app.request('/panel', withSession(cookie), env)).text()
      expect(plain).not.toContain('id="ed"')
      expect(plain).not.toContain('posts-split')
      const asked = await (await app.request(`/panel?open=${id}`, withSession(cookie), env)).text()
      expect(asked).toContain('id="ed"')
    })

    it('و«?open=» يُرفَع من العنوان بعد الرسم، والمحرّر يُطوى بالتنقّل عنه', async () => {
      const { SCRIPT } = await import('./ui/panelScript')
      expect(SCRIPT).toContain('function shutEditor()')
      expect(SCRIPT).toContain('if(focus&&!/^ed(-|$)/.test(id))shutEditor();')
      expect(SCRIPT).toMatch(/history\.replaceState\(null,'',location\.pathname\+location\.search\.replace\(\/\(\[\?&\]\)open=/)
    })

    it('و«وزّع المعتمَد» سطر مطويّ تحت الفرز، ونموذجُه لا يُرى قبل فتحه', async () => {
      await seedApproved()
      await seedApproved()
      await seedAccount()
      const cookie = await login()
      const html = await (await app.request('/panel', withSession(cookie), env)).text()
      const fold = html.slice(html.indexOf('id="spread"'), html.indexOf('</details>', html.indexOf('id="spread"')))
      expect(html).toContain('<details class="card card-inset spread" id="spread">')
      expect(fold).toContain('وزّعها')
      expect(fold).toContain('name="preset"')
      expect(html.indexOf('id="draft-filter"')).toBeLessThan(html.indexOf('id="spread"'))
      expect(seen(html)).not.toContain('action="/panel/drafts/spread"')
    })

    it('ولا UTC ولا ‹mm/dd› ولا حقل تاريخ فيما يُرى قبل الفتح', async () => {
      await seedApproved()
      await seedApproved()
      await seedAccount()
      const cookie = await login()
      const view = seen(await (await app.request('/panel', withSession(cookie), env)).text())
      expect(view).toContain('جدوِل')
      expect(view).not.toContain('UTC')
      expect(view.toLowerCase()).not.toContain('mm/dd')
      expect(view).not.toContain('type="datetime-local"')
    })

    it('والطيّ يُفتَح ولا يُسقط شيئًا: الحقل الحرّ في «موعد آخر» بتوقيت المالك', async () => {
      const id = await seedApproved()
      await seedAccount()
      const cookie = await login()
      const html = await (await app.request('/panel', withSession(cookie), env)).text()
      const form = html.slice(html.indexOf(`id="s-${id}"`), html.indexOf('</form>', html.indexOf(`id="s-${id}"`)))
      expect(form).toContain('<details class="sched-more"><summary>موعد آخر</summary>')
      expect(form).toContain('name="local" type="datetime-local"')
      expect(form).not.toContain('(UTC)')
      expect(form).toContain('name="_csrf"')
    })

    it('والتوزيع يقرأ أوّل موعد زرًّا بتوقيت المالك', async () => {
      await seedApproved()
      await seedApproved()
      await seedAccount()
      const cookie = await login()
      const body = new FormData()
      body.set('preset', 'tomorrow')
      body.set('gap', '24')
      const res = await app.request('/panel/drafts/spread', withSession(cookie, { method: 'POST', body }), env)
      expect(res.status).toBe(200)
      expect(await res.text()).toContain('كلّ 24 ساعةً')
    })
  })
})

/**
 * **مراجعةُ الكلمات تُعرَض ولا تمنع** (D-090).
 *
 * قال المالك: «ولا تعتمد على عدد حروفٍ معيّنة، يجب أن تكون متغيّرة،
 * ومراجعةٌ للكلمات».
 */
describe('لوح المراجعة في اللوحة', () => {
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
    'ومما لا شك فيه ان الحوكمة تبدأ بالحوكمة، ولا حوكمة بلا قرار. والحوكمة قرار.\n\nما رأيكم؟'
  const CLEAN =
    'البرنامج الذي لا صاحب له لا يفشل — يذبل.\n\nولا أحد يعلن ذبوله. وهذا أخطر من السقوط الصريح.'

  it('يعرض الملحوظات ولا يمنع الاعتماد', async () => {
    const id = await seedDraft(DIRTY)
    const cookie = await login()

    // ‏والملحوظاتُ في المحرّر المركّز تحت مربّعه (D-198)، لا على البطاقة المختصرة
    const html = await (await app.request(`/panel?open=${id}`, { headers: { Cookie: cookie } }, env)).text()
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

  it('**ونصّ نظيف بلا لوح** — ملحوظة كاذبة تُفقِد الباقي ثقتَه', async () => {
    await seedDraft(CLEAN)
    const cookie = await login()
    const html = await (await app.request('/panel', { headers: { Cookie: cookie } }, env)).text()
    expect(html).not.toContain('ملحوظةً على الصياغة')
  })

  it('ولا لوح على ما بُتّ فيه ورُفض — فات وقت تعديله', async () => {
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
describe('توجيه كلّ مهمّة يُحفَظ لا يُعرَض وحسب', () => {
  async function post(cookie: string, path: string, fields: Record<string, string>): Promise<Response> {
    const body = new FormData()
    for (const [k, v] of Object.entries(fields)) body.set(k, v)
    return await app.request(path, withSession(cookie, { method: 'POST', body }), env)
  }

  it('كلّ مهمّة معروضة تُقبَل — الخطّة والفيديو معهما', async () => {
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

  it('وما ليس مهمّةً يُردّ — القائمة لم تنفتح على كلّ شيء', async () => {
    const cookie = await login()
    const response = await post(cookie, '/panel/routes', {
      task: 'publish', provider: 'anthropic', model: 'claude-opus-5',
    })
    expect(response.status).toBe(400)
  })

  it('ويُعرَض لكلّ مهمّة اسم عربيّ — لا مفتاح خام', async () => {
    const cookie = await login()
    const html = await (await everyPane((p) => app.request(p, { headers: { Cookie: cookie } }, env)))
    expect(html).toContain('الخطّة — منطق الأسبوع')
    expect(html).toContain('الفيديو — تحريك الصورة')
  })
})

/**
 * **ترتيبُ الحدود بالخطورة** (D-126): ما يوقف النظامَ أوّلًا، ثمّ ما يحدّ
 * إنفاقَه، ثمّ ما يطلقه بلا أمر، ثمّ ما يُخبر عنه، ثمّ الشكل.
 */
describe('ترتيب بطاقات الحدود (D-126)', () => {
  it('الإيقاف ثمّ السقوف ثمّ الإدراج ثمّ التنبيهات ثمّ البطاقات ثمّ الصورة', async () => {
    const cookie = await login()
    const html = await (await everyPane((p) => app.request(p, withSession(cookie), env)))
    const pane = html.slice(html.indexOf('<section data-pane="settings"'))
    const at = (marker: string): number => {
      const i = pane.indexOf(marker)
      expect(i, marker).toBeGreaterThan(-1)
      return i
    }
    const order = [
      'value="paused"', 'value="daily_analysis_cap"', 'value="daily_video_cap"', 'value="weekly_promo_cap_usd"',
      'value="auto_enqueue"', 'value="alert_webhook"', 'value="image_overlay"',
    ].map(at)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    // ‏وبطاقاتُ اللوح انتقلت إلى «المظهر» قبل الحدود (D-221)
    expect(at('value="dashboard_tiles"')).toBeLessThan(at('<div data-sub id="limits">'))
  })
})

/**
 * «ما وقع اليوم» (D-127): يُروى ممّا قُرئ — ولا يُفتَح له استعلام.
 */
describe('ما وقع اليوم (D-127)', () => {
  it('الترويسة ثابتة، ويوم بلا شيء يُقال، وما وقع يُروى بالاسم', async () => {
    const cookie = await login()
    const empty = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(empty).toContain('<h2>ما وقع اليوم</h2>')
    const at = new Date().toISOString().slice(0, 19).replace('T', ' ')
    db.raw.exec(
      `INSERT INTO audit_log (actor, action, target, detail, ip, ua)
       VALUES ('panel', 'provider.key', 'anthropic', NULL, NULL, NULL)`,
    )
    db.raw.exec(`UPDATE audit_log SET at = '${at}'`)
    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).toContain('تبديل مفتاح — Anthropic')
    expect(html).not.toContain('لم يقع شيء بعد')
  })
})

/**
 * نقاطُ الجاهزيّة تحت زرَّي الصورة والمقطع (D-163) — **من البيئة والقاعدة كما
 * يقرؤهما النداءُ عند الضغط**، والأسرارُ تُسأل عن وجودها ولا تُطبَع.
 */
describe('نقاط الجاهزيّة في اللوحة (D-163)', () => {
  async function seedDraft(): Promise<string> {
    const id = crypto.randomUUID()
    await db
      .prepare(`INSERT INTO posts (id, platform, type, text, status, idempotency_key) VALUES (?, 'linkedin', 'text', ?, 'draft', ?)`)
      .bind(id, 'نصّ ينتظر صورة', `k-${id}`)
      .run()
    return id
  }
  /** صورةٌ جاهزةٌ على المسوّدة — فيُرسَم تحتها زرُّ «حرّكها فيديو» وسطرُه. */
  async function seedImage(postId: string): Promise<void> {
    const id = crypto.randomUUID()
    await db
      .prepare(
        `INSERT INTO media (id, post_id, r2_key, mime, bytes, prompt, model, cost_usd, status, idempotency_key)
         VALUES (?, ?, ?, 'image/png', 2048, 'وصف', 'gemini-2.5-flash-image', 0.04, 'ready', ?)`,
      )
      .bind(id, postId, `image/${postId}/${id}`, `image:${postId}:${id}`)
      .run()
  }
  // ‏والتوجيهُ والمزوّدون في «الإعدادات» (D-211)، ونقاطُ الجاهزيّة في «/panel»
  const panelHtml = async (): Promise<string> =>
    everyPane(async (p) => app.request(p, withSession(await login()), env))
  /** صفُّ المهمّة في جدول التوجيه — من اسمها إلى آخر خليّته. */
  const routeRow = (html: string, label: string): string => {
    const at = html.indexOf(`<div class="nm">${label}</div>`)
    expect(at).toBeGreaterThan(-1)
    return html.slice(at, html.indexOf('</tr>', at))
  }
  /** رقمُ «مهامٌّ جاهزة» في شريط المزوّدين. */
  const tasksReady = (html: string): number =>
    Number(/مهامّ جاهزة<\/div>\s*<div class="kv-v">(\d+)<em>/.exec(html)?.[1] ?? NaN)
  const IMAGE_BUTTON_OFF = '<button class="btn btn-secondary btn-sm" type="submit" disabled>ولّد صورةً فنّيّة</button>'
  const IMAGE_BUTTON_ON = '<button class="btn btn-secondary btn-sm" type="submit">ولّد صورةً فنّيّة</button>'
  const INFO_BUTTON_OFF = '<button class="btn btn-secondary btn-sm" type="submit" disabled>ولّد إنفوجرافيك</button>'
  const INFO_BUTTON_ON = '<button class="btn btn-secondary btn-sm" type="submit">ولّد إنفوجرافيك</button>'

  it('صور إلى Cloudflare بمفتاح `CF_AI_TOKEN`: نقطة المزوّد تامّة، والجدول «جاهز»، والقيمة لا تظهر', async () => {
    await upsertProvider(db, {
      name: 'cloudflare', label: 'Cloudflare', kind: 'openai_compat',
      baseUrl: 'https://api.cloudflare.com/client/v4/accounts/acc-1234/ai/v1',
    }, 'test')
    await writeRoute(db, 'image', 'cloudflare', '@cf/black-forest-labs/flux-1-schnell', 'test')
    await seedDraft()
    env['CF_AI_TOKEN'] = 'cf-ai-secret-value-0001'
    const html = await panelHtml()
    expect(html).toContain('data-tip="تامّة — Cloudflare"')
    expect(html).not.toContain('لا مفتاح لـ Cloudflare')
    const row = html.slice(html.indexOf('الصورة — التوليد البصريّ'), html.indexOf('</tr>', html.indexOf('الصورة — التوليد البصريّ')))
    expect(row).toContain('جاهز')
    expect(row).not.toContain('مزوّده غير جاهز')
    expect(html).not.toContain('cf-ai-secret-value-0001')
  })

  it('مفتاح المتصفّح بلا معرّف الحساب: «ينقصك» المعرّف لا المفتاح — والسرّ لا يظهر', async () => {
    await seedDraft()
    // مزوّدُ الصورة الافتراضيُّ بمفتاحه، فأوّلُ ما ينتظرك هو الشريحة
    env['GEMINI_API_KEY'] = 'AIza-test-0001'
    env['CF_BROWSER_TOKEN'] = 'سرّ-المتصفّح-0001'
    const html = await panelHtml()
    expect(html).toContain('<span class="ago">بلا معرّف حساب Cloudflare</span>')
    expect(html).toContain('<span class="kv-v">\n          معرّفُ الحساب،')
    expect(html).toContain('<span class="mono">CF_AI_ACCOUNT_ID</span> في متغيّرات Worker')
    expect(html).not.toContain('<span class="mono">CF_BROWSER_TOKEN</span> في أسرار')
    expect(html).not.toContain('مضبوطان')
    expect(html).not.toContain('سرّ-المتصفّح-0001')
  })

  it('وبطاقة «النصّ فوق الصورة» بفروعها الثلاثة — لا تقول «مضبوط» إلّا للاثنين', async () => {
    const none = await panelHtml()
    expect(none).toContain('مفتاحُ المتصفّح ومعرّفُ الحساب،')
    // ‏والأسماءُ تحت «للمطوّر» لا في وجه المالك
    expect(none).toMatch(/<summary>للمطوّر<\/summary>\s*<p class="hint"><span class="mono">CF_BROWSER_TOKEN<\/span>/)

    env['CF_BROWSER_TOKEN'] = 'b-0001'
    env['CF_AI_ACCOUNT_ID'] = 'acc-1234'
    expect(await panelHtml()).toContain('مفتاح المتصفّح ومعرّف الحساب مضبوطان.')

    // ومسافاتٌ وحدها غيابٌ كما هي عند `composeSlide`
    env['CF_BROWSER_TOKEN'] = '   '
    const blank = await panelHtml()
    expect(blank).toContain('<span class="mono">CF_BROWSER_TOKEN</span> في أسرار Worker')
    expect(blank).not.toContain('مضبوطان')
  })

  it('والإيقاف يعطّل زرَّي الصورة وسببُه بجانبهما — والحارس في الدالّة باق', async () => {
    await seedDraft()
    const cookie = await login()
    await writeSetting(db, 'paused', 'true', 'test')
    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).toContain(IMAGE_BUTTON_OFF)
    expect(html).toContain(INFO_BUTTON_OFF)
    expect(html).toContain('<span class="ago">موقوف بقرارك</span><a class="tap" href="#limits">افتح الحدود</a>')
  })

  /*
   * **ومن GET /panel إلى النقطة** — الحقائقُ تُجمَع هنا وحدَه. والدوالُّ
   * النقيّةُ مختبَرةٌ بما يُمرَّر إليها؛ **وما يُمرَّر هو الذي يفترق**: حارسٌ
   * يُستبدَل بـ`null`، أو موجزٌ يُفرَض جاهزًا، أو حسابٌ يُفرَض حاضرًا، فتقول
   * النقطةُ «تامّة» والدالّةُ تردّ عند الضغط. فكلُّ حقيقةٍ بحالٍ تُسقطها.
   */
  it('Gemini معطَّل ومفتاحُه في البيئة: النقطة تسقط بقرارك، والزرّ معطَّل', async () => {
    await seedDraft()
    env['GEMINI_API_KEY'] = 'AIza-test-0001'
    await setEnabled(db, 'gemini', false, 'test')
    const html = await panelHtml()
    expect(html).toContain('<span class="ago">Gemini معطَّل بقرارك</span><a class="tap" href="#providers">افتح المزوّدين</a>')
    expect(html).toContain(IMAGE_BUTTON_OFF)
    expect(routeRow(html, 'الصورة — التوليد البصريّ')).toContain('مزوّده غير جاهز')
  })

  it('Gemini بلغ سقفَه اليوميّ: النقطة من الدفتر، والزرّ معطَّل', async () => {
    await seedDraft()
    env['GEMINI_API_KEY'] = 'AIza-test-0001'
    db.raw.exec(`UPDATE providers SET daily_cap = 0.05 WHERE name = 'gemini'`)
    // تحت السقف: تامّةٌ والزرُّ يعمل — فالسقوطُ بعده من الدفتر لا من السقف وحدَه
    await recordCost(db, { provider: 'gemini', operation: 'image', units: 1, unitCost: 0.04 })
    const under = await panelHtml()
    expect(under).toContain('data-tip="تامّة — Gemini"')
    expect(under).toContain(IMAGE_BUTTON_ON)

    await recordCost(db, { provider: 'gemini', operation: 'image', units: 1, unitCost: 0.04 })
    const over = await panelHtml()
    expect(over).toContain('<span class="ago">بلغ Gemini سقفَه اليوميّ</span>')
    expect(over).toContain(IMAGE_BUTTON_OFF)
  })

  it('مزوّد الكتابة معطَّل والشريحة مضبوطة: «لا مزوّد يصوغ العنوان» ينتظرك ولا يُعطِّل', async () => {
    await seedDraft()
    env['GEMINI_API_KEY'] = 'AIza-test-0001'
    env['ANTHROPIC_API_KEY'] = 'sk-ant-test-0001'
    env['CF_BROWSER_TOKEN'] = 'b-0001'
    env['CF_AI_ACCOUNT_ID'] = 'acc-1234'
    const ready = await panelHtml()
    expect(ready).toContain('data-tip="تامّة — يُركَّب العنوان"')
    expect(ready).not.toContain('لا مزوّد يصوغ العنوان')

    await setEnabled(db, 'anthropic', false, 'test')
    const off = await panelHtml()
    expect(off).toContain('<span class="ago">لا مزوّد يصوغ العنوان</span><a class="tap" href="#providers">افتح المزوّدين</a>')
    // الصورةُ تخرج بلا عنوان — فالزرُّ يعمل
    expect(off).toContain(IMAGE_BUTTON_ON)
    expect(off).not.toContain('sk-ant-test-0001')
  })

  /*
   * **والإنفوجرافيك يُصوَّر بالمتصفّح** (D-174): المفتاحُ والحسابُ من البيئة
   * كما تقرؤهما `generateForPost`، ونموذجُ الكتابة الغائبُ لا يُعطِّله.
   */
  it('الإنفوجرافيك: بلا مفتاح المتصفّح معطَّل، وبه وبالحساب يعمل — والسرّ لا يظهر', async () => {
    await seedDraft()
    const none = await panelHtml()
    expect(none).toContain(INFO_BUTTON_OFF)
    expect(none).toContain('data-tip="فشلت — بلا مفتاح المتصفّح"')

    env['CF_BROWSER_TOKEN'] = 'سرّ-المتصفّح-0002'
    env['CF_AI_ACCOUNT_ID'] = 'acc-1234'
    const ready = await panelHtml()
    expect(ready).toContain(INFO_BUTTON_ON)
    expect(ready).toContain('data-tip="تامّة — يصوّر الصفحة"')
    expect(ready).not.toContain('سرّ-المتصفّح-0002')
  })

  it('الحساب والمفتاح في أسرار Worker: نقطة المقطع «من أسرار Worker»، والجدول «جاهز»', async () => {
    await seedImage(await seedDraft())
    env['CF_AI_ACCOUNT_ID'] = 'acc-1234'
    env['CF_AI_TOKEN'] = 'cf-ai-secret-value-0002'
    const html = await panelHtml()
    expect(html).toContain('data-tip="تامّة — من أسرار Worker"')
    expect(html).toContain('<button class="btn btn-secondary btn-sm" type="submit">حرّكها فيديو</button>')
    expect(routeRow(html, 'الفيديو — تحريك الصورة')).toContain('جاهز')
    expect(html).not.toContain('cf-ai-secret-value-0002')
  })

  it('صور إلى بطاقة Cloudflare بلا حساب في عنوانها ولا في البيئة: النقطة تسقط، والزرّ معطَّل', async () => {
    await upsertProvider(db, {
      name: 'cloudflare', label: 'Cloudflare', kind: 'openai_compat',
      baseUrl: 'https://gateway.ai.cloudflare.com/v1/compat',
    }, 'test')
    await writeRoute(db, 'image', 'cloudflare', '@cf/black-forest-labs/flux-1-schnell', 'test')
    await seedDraft()
    // والمفتاحُ حاضرٌ: فالسقوطُ بالحساب وحدَه لا بالمفتاح قبله
    env['CF_AI_TOKEN'] = 'cf-ai-secret-value-0003'
    const html = await panelHtml()
    expect(html).toContain('<span class="ago">لا معرّف حساب لـ Cloudflare</span>')
    expect(html).toContain(IMAGE_BUTTON_OFF)
    expect(routeRow(html, 'الصورة — التوليد البصريّ')).toContain('مزوّده غير جاهز')
  })

  /*
   * **ورابطُ Worker وحدَه ليس «جاهزًا»**: يبلغ حسابَ الـ Worker لا حسابَ
   * Workers AI — وهو حالُ المالك، والرابطُ معرَّفٌ في البيئتين. فكان الجدولُ
   * يقول «● جاهز» والنقطةُ تحت الزرّ «تنتظرك»: التناقضُ نفسُه معكوسًا.
   */
  it('رابط `env.AI` وحده: النقطة تنتظرك، والجدول ينتظرك مثلَها، ولا يُعدّ في المهامّ الجاهزة', async () => {
    await seedImage(await seedDraft())
    env['AI'] = { run: async () => ({}) }
    const html = await panelHtml()
    expect(html).toContain('data-tip="تنتظرك — برابط Worker وحده"')
    // ينتظرك ولا يسقط: الزرُّ يعمل
    expect(html).toContain('<button class="btn btn-secondary btn-sm" type="submit">حرّكها فيديو</button>')
    const row = routeRow(html, 'الفيديو — تحريك الصورة')
    expect(row).not.toContain('st ok')
    expect(row).not.toContain('مزوّده غير جاهز')
    expect(row).toContain('<span class="st warn"')
    expect(row).toContain('برابط Worker وحده')
    expect(tasksReady(html)).toBe(0)

    // والبيئةُ تكفيه: يصير «جاهزًا» ويُعدّ
    env['CF_AI_ACCOUNT_ID'] = 'acc-1234'
    env['CF_AI_TOKEN'] = 'cf-ai-secret-value-0004'
    const envHtml = await panelHtml()
    expect(routeRow(envHtml, 'الفيديو — تحريك الصورة')).toContain('<span class="st ok"')
    expect(tasksReady(envHtml)).toBe(1)
  })
})


describe('مربوطة بلا إذن تُقال في كلّ موضع (D-166)', () => {
  /**
   * حسابٌ محفوظٌ بلا صفٍّ في `tokens` — حالُ LinkedIn على staging. كانت بطاقةُ
   * القناة وحدها تقولها (D-159)، وشارةُ شاشة المنصّة ونقطةُ الرافدة و«ما ينتظرك»
   * تقول «مربوطة» خضراء، فيقرأ المالكُ الأخضرَ ويسقط أوّلُ منشورٍ مجدول.
   */
  beforeEach(() => {
    db.raw.exec(
      `INSERT INTO accounts (id, platform, kind, external_id, display_name, status)
       VALUES ('a1', 'linkedin', 'member', 'e1', 'شخصيّ', 'active')`,
    )
  })

  it('الرافدة حمراء ونظرة عامّة تقول ما ينتظرك', async () => {
    const cookie = await login()
    const html = await (await everyPane((p) => app.request(p, { headers: { Cookie: cookie } }, env)))
    // ‏والرافدةُ تعدّها على «الحسابات» من الحكم الواحد (D-205)، والبطاقةُ تقول «منقطعة»
    expect(html).toMatch(/<a href="\/panel\/accounts"[^>]*>[\s\S]*?<span>الحسابات<\/span><span class="count">1<\/span><\/a>/)
    expect(html).toContain('id="ch-linkedin" data-health="broken"')
    expect(html).toContain('LinkedIn: الحساب محفوظ بلا إذن')
    expect(html).toContain('href="/panel/channels/linkedin"')
  })

  it('وشاشة المنصّة: الشارة والزرّ الأوّل «أعد الربط»', async () => {
    const cookie = await login()
    const html = await (await app.request('/panel/channels/linkedin', { headers: { Cookie: cookie } }, env)).text()
    expect(html).toContain('منقطعة') // ‏حكم بطاقة «الحسابات» نفسُه (D-205)
    expect(html).toContain('>أعد الربط</a>')
    expect(html).not.toContain('>اربط حسابا آخر</a>')
  })

  it('ومتى حُفظ الإذن عادت خضراء في المواضع كلّها', async () => {
    db.raw.exec(
      `INSERT INTO tokens (account_id, access_enc, access_iv, expires_at, scopes)
       VALUES ('a1', 'x', 'iv', datetime('now', '+30 days'), 'w_member_social')`,
    )
    const cookie = await login()
    const panelHtml = await (await app.request('/panel', { headers: { Cookie: cookie } }, env)).text()
    expect(panelHtml).not.toContain('مربوطة بلا إذن')
    expect(panelHtml).not.toContain('الحساب محفوظ بلا إذن')
    const screen = await (await app.request('/panel/channels/linkedin', { headers: { Cookie: cookie } }, env)).text()
    expect(screen).not.toContain('مربوطة بلا إذن')
  })
})

describe('رأس كلّ لوح اسمُه في الرافدة (D-166)', () => {
  it('كلّ لوح في الصفحة رأسُه من SECTIONS، وشاشة «ما عليك» كذلك', async () => {
    const { SECTIONS } = await import('./ui/command')
    const cookie = await login()
    const html = await (await everyPane((p) => app.request(p, { headers: { Cookie: cookie } }, env)))
    const panes = [...html.matchAll(/<section data-pane="([a-z]+)"[^>]*>([\s\S]*?)<\/section>/g)]
    expect(panes.length).toBeGreaterThan(5)
    for (const [, id, body] of panes) {
      const section = SECTIONS.find((s) => s.id === id)
      if (section === undefined || id === 'overview') continue
      expect(/<h1>([^<]+)<\/h1>/.exec(body!)?.[1], id).toBe(section.label)
    }
    const tasks = await (await app.request('/panel/tasks', { headers: { Cookie: cookie } }, env)).text()
    expect(tasks).toContain('<h1>ما عليك</h1>')
    expect(tasks).toContain('<title>صدى — ما عليك</title>')
  })
})
/**
 * **سقفُ المقاطع اليوميّ** (D-168) — من الدفتر إلى النقطة تحت «حرّكها فيديو»،
 * ومن الضغطة إلى الإشعار. **والحكمُ واحد**: `videoCapGate` في الدالّة وفي اللوح.
 */
describe('سقف المقاطع اليوميّ في اللوحة (D-168)', () => {
  async function seedPictured(): Promise<string> {
    const id = crypto.randomUUID()
    await db
      .prepare(`INSERT INTO posts (id, platform, type, text, status, idempotency_key) VALUES (?, 'linkedin', 'image', ?, 'draft', ?)`)
      .bind(id, 'نصّ بصورته', `k-${id}`)
      .run()
    await db
      .prepare(
        `INSERT INTO media (id, post_id, r2_key, mime, bytes, prompt, model, cost_usd, status, idempotency_key)
         VALUES (?, ?, ?, 'image/png', 2048, 'وصف', 'gemini-2.5-flash-image', 0.04, 'ready', ?)`,
      )
      .bind(`img-${id}`, id, `image/${id}/x`, `image:${id}:x`)
      .run()
    return id
  }
  /** مقطعٌ في دفتر اليوم كما تكتبه `animateForPost`: صفرٌ موسوم. */
  const clipToday = (): Promise<string> =>
    recordCost(db, {
      provider: 'cloudflare', operation: 'video:alibaba/hh1-i2v:price_unverified', units: 1, unitCost: 0,
    })
  const OFF = '<button class="btn btn-secondary btn-sm" type="submit" disabled>حرّكها فيديو</button>'
  const ON = '<button class="btn btn-secondary btn-sm" type="submit">حرّكها فيديو</button>'

  beforeEach(() => {
    env['CF_AI_ACCOUNT_ID'] = 'acc-1234'
    env['CF_AI_TOKEN'] = 'cf-ai-secret-value-0005'
  })

  it('تحت السقف تقول كم بقي، وعند البلوغ تسقط والزرّ معطَّل — والرقمان في الحدود', async () => {
    await seedPictured()
    const cookie = await login()
    await clipToday()
    const under = await (await everyPane((p) => app.request(p, withSession(cookie), env)))
    expect(under).toContain('data-tip="تامّة — بقي 1 من 2 اليوم"')
    expect(under).toContain(ON)

    await clipToday()
    const over = await (await everyPane((p) => app.request(p, withSession(cookie), env)))
    expect(over).toContain(OFF)
    expect(over).toContain('<span class="ago">بلغ سقف المقاطع اليوميّ</span><a class="tap" href="#limits">افتح الحدود</a>')
    const pane = over.slice(over.indexOf('<section data-pane="settings"'))
    const form = pane.slice(pane.indexOf('value="daily_video_cap"'), pane.indexOf('</form>', pane.indexOf('value="daily_video_cap"')))
    expect(form).toContain('value="2"')
    expect(form).toContain('max="20"')
    expect(form).toContain('المستهلَك اليوم: 2')
    expect(over).not.toContain('cf-ai-secret-value-0005')
  })

  it('والضغطة فوق السقف تُردّ بسببها في الإشعار — ولا تبلغ المزوّد ولا الدفتر', async () => {
    const id = await seedPictured()
    const cookie = await login()
    await clipToday()
    await clipToday()
    let calls = 0
    // ‏ولا حسابَ في البيئة: الوجهُ رابطُ Worker، فكلُّ نداءٍ يُعَدّ هنا
    delete env['CF_AI_ACCOUNT_ID']
    delete env['CF_AI_TOKEN']
    env['AI'] = { run: async () => { calls += 1; return {} } }

    const body = new FormData()
    body.set('id', id)
    const res = await app.request('/panel/media/animate', withSession(cookie, { method: 'POST', body }), env)
    expect(res.status).toBe(303)
    expect(calls).toBe(0)
    const n = db.raw.prepare(`SELECT count(*) AS n FROM cost_ledger WHERE operation LIKE 'video:%'`).get() as { n: number }
    expect(n.n).toBe(2)

    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(html).toContain('بلغ سقف المقاطع اليوميّ: 2 من 2 — يُفتح غدًا، أو ارفعه من «الحدود»')
  })

  it('ورفع السقف من الحدود يُعيد الزرّ — والإشعار يقول ما حُفظ فعلًا', async () => {
    await seedPictured()
    const cookie = await login()
    await clipToday()
    await clipToday()
    const save = async (value: string): Promise<string> => {
      const body = new FormData()
      body.set('key', 'daily_video_cap')
      body.set('value', value)
      await app.request('/panel/settings', withSession(cookie, { method: 'POST', body }), env)
      return (await app.request('/panel', withSession(cookie), env)).text()
    }
    const raised = await save('3')
    expect(raised).toContain('سقف المقاطع اليوميّ: حُفظ 3.')
    expect(raised).toContain(ON)
    expect(raised).toContain('data-tip="تامّة — بقي 1 من 3 اليوم"')

    const clamped = await save('500')
    expect(clamped).toContain('سقف المقاطع اليوميّ: القيمة 500 خارج المدى — حُفظت 20.')
    expect((await readSettings(db)).dailyVideoCap).toBe(20)
  })
})


describe('الرئيسيّة: خطوتُك، ثمّ الرحلة، ثمّ المنصّات (D-177)', () => {
  async function seedPost(status: string, platform = 'linkedin'): Promise<void> {
    const id = crypto.randomUUID()
    await db
      .prepare(`INSERT INTO posts (id, platform, type, text, status, idempotency_key) VALUES (?, ?, 'text', 'نصّ', ?, ?)`)
      .bind(id, platform, status, `k-${id}`)
      .run()
  }

  it('الرحلة تُعدّ من القاعدة، والمسوّدات بعربيّة صحيحة، ولا بطاقةَ منصّاتٍ في الرئيسيّة (D-309)', async () => {
    await seedPost('draft')
    await seedPost('draft')
    const html = await (await app.request('/panel', withSession(await login()), env)).text()
    const home = html.slice(html.indexOf('<section data-pane="overview"'), html.indexOf('<div class="ov mt-3">'))
    expect(home).toContain('خطوتُك التالية')
    // ‏لا منصّةَ متّصلة: الفعلُ الأوّلُ الربطُ لا المسوّدات
    expect(home).toContain('اربط أوّل منصّة')
    expect(home).toContain('تنتظر قرارك مسوّدتان')
    expect(home).toContain('<ol class="funnel">')
    expect((home.match(/<li data-state=/g) ?? []).length).toBe(7)
    // ‏والمنصّاتُ في صفحتها «الحسابات» (D-309 · خطّة التصميم 5.5)، لا بطاقةً تعيدها في الرئيسيّة
    expect(home).not.toContain('<h2>المنصّات</h2>')
    expect(home).not.toContain('class="pfgrid"')
    const accounts = await (await app.request('/panel/accounts', withSession(await login()), env)).text()
    for (const label of ['LinkedIn', 'X', 'Instagram', 'TikTok', 'YouTube']) expect(accounts).toContain(label)
  })
  /*
   * ‏**المحطّةُ تنزل إلى البطاقة التي تعدّها، والبطاقةُ مرسومةٌ بمرساتها** (ر-0، ر-3، ر-6).
   * ‏كانت المحطّاتُ كلُّها `#posts` والمسوّدةُ المنتظرةُ ثانيةُ اللوح بعد منشورٍ مجدول.
   */
  it('محطّتا «الاعتماد» و«الصورة» إلى المسوّدة نفسِها، و«المسوّدة» إلى بطاقة الكتابة', async () => {
    await seedPost('draft')
    const html = await (await app.request('/panel', withSession(await login()), env)).text()
    const id = (await db.prepare(`SELECT id FROM posts WHERE status = 'draft'`).first<{ id: string }>())!.id
    const trip = html.slice(html.indexOf('<ol class="funnel">'), html.indexOf('</ol>', html.indexOf('<ol class="funnel">')))
    expect(trip).toContain(`href="#d-${id}"`)
    expect(trip).toContain(`href="#i-${id}"`)
    expect(trip).toContain('href="#write"')
    // ‏والمراسي موجودةٌ في اللوح: البطاقةُ ولوحُ صورتها وبطاقةُ الكتابة
    expect(html).toContain(`id="d-${id}"`)
    expect(html).toContain(`id="i-${id}"`)
    expect(html).toContain('id="write"')
  })

  it('والمحطّة المميَّزة ما يقوله الفعل — «فشلت» لا «المصدر» قبلها', async () => {
    await seedSource('لم يُحلَّل')
    const id = crypto.randomUUID()
    await db
      .prepare(`INSERT INTO posts (id, platform, type, text, status, idempotency_key, approved_by, approved_at, scheduled_at)
                VALUES (?, 'x', 'text', 'نصّ', 'failed', ?, 'omar', datetime('now'), datetime('now'))`)
      .bind(id, `k-${id}`)
      .run()
    const html = await (await app.request('/panel', withSession(await login()), env)).text()
    const focused = /<li data-state="(\w+)" data-focus>[\s\S]*?<b>([^<]+)<\/b>/.exec(html)
    expect(focused?.[1]).toBe('failed')
    expect(focused?.[2]).toBe('النشر')
    expect(html).toContain('فشلت')
    expect(html).not.toContain('ساقطة</span>')
    // ‏والفعلُ إلى صفّ الفشل بسببه وزرّه (ر-8)
    expect(html).toContain('href="/panel/channels/x?filter=failed#history">أصلح المنشور</a>')
  })

  it('وحبّة النظام من النبض: إرسال توقّف منذ أيّام يُقال في الرأس وفي «خطوتك التالية»', async () => {
    db.raw.exec(`INSERT INTO heartbeats (job, at, outcome) VALUES ('dispatch', datetime('now', '-3 days'), 'ok')`)
    const html = await (await app.request('/panel', withSession(await login()), env)).text()
    expect(html).toMatch(/<a class="pill bad" href="\/panel\/settings#machine"[^>]*><i class="led"><\/i>النشر متوقّف<\/a>/)
    // ‏والبطاقةُ في «النظام» بالإعدادات (D-221)، والمرساةُ تُتبَع إليها
    expect(html).not.toContain('id="machine"')
    expect(await (await app.request('/panel/settings', withSession(await login()), env)).text()).toContain('id="machine"')
    const next = html.slice(html.indexOf('<div class="card card-alert next"'), html.indexOf('<div class="card home-card">'))
    expect(next).toContain('href="#machine"')
    expect(next).toContain('قبل 3 أيّام')
  })

  it('وسقف اليوم: الفعل إلى حقل السقف، وزرّ الكتابة معطَّل وسببُه تحته (ر-10)', async () => {
    const source = await seedSource('تقرير الأثر')
    await db
      .prepare('INSERT INTO content_items (id, source_id, summary, themes_json, worth_score) VALUES (?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), source, 'خلاصة.', JSON.stringify({ hash: 'md5:a', themes: [] }), 0.8)
      .run()
    await recordCost(db, { provider: 'anthropic', operation: 'draft:x', units: 1, unitCost: 6.06 })
    const html = await (await everyPane(async (p) => app.request(p, withSession(await login()), env)))
    const next = html.slice(html.indexOf('<div class="card card-alert next"'), html.indexOf('<div class="card home-card">'))
    expect(next).toContain('href="#c2"')
    expect(next).toContain('⁦6.06$⁩ من ⁦5.00$⁩')
    expect(html).toContain('id="c2"')
    // ‏والزرُّ لا يُضغَط فيُردّ: معطَّلٌ، وسببُه مربوطٌ به وفيه موضعُ إصلاحه
    expect(html).toMatch(/<button class="btn btn-primary" type="submit" aria-disabled="true" aria-describedby="dw-why"><span>اكتب مسوّدة<\/span><\/button>/)
    const why = html.slice(html.indexOf('id="dw-why"'), html.indexOf('</form>', html.indexOf('id="dw-why"')))
    expect(why).toContain('بلغت سقف الإنفاق اليوم: ⁦6.06$⁩ من ⁦5.00$⁩')
    expect(why).toContain('href="#c2"')
  })

  it('ورأس «المنشورات» باب واحد يفتح البدايات الأربع إلى بطاقاتها (D-233)', async () => {
    const html = await (await everyPane(async (p) => app.request(p, withSession(await login()), env)))
    const at = html.indexOf('<section data-pane="posts"')
    const head = html.slice(at, html.indexOf('</details>', html.indexOf('data-head-new', at)))
    expect(head.match(/class="btn btn-primary/g) ?? []).toHaveLength(1)
    for (const [anchor, label] of [['idea', 'من فكرة'], ['write', 'من مصدر'], ['videos', 'فيديو'], ['plan-import', 'خطّة من ملفّ']] as const) {
      // ‏و«فيديو» إلى «المكتبة» بمسارها (D-211)، والبقيّةُ مراسٍ في «/panel»
      expect(head).toContain(`href="${anchor === 'videos' ? '/panel/library#videos' : `#${anchor}`}"`)
      expect(head).toContain(`<b>${label}</b>`)
      expect(html).toContain(`id="${anchor}"`)
    }
  })
})

describe('فيديوهاتك: من الملفّ إلى منشورات على المنصّات الثلاث (D-180)', () => {
  function multipartBucket() {
    const stored = new Map<string, number>()
    return {
      stored,
      async createMultipartUpload(key: string) {
        return this.resumeMultipartUpload(key, `mp-${key}`)
      },
      resumeMultipartUpload(key: string, uploadId: string) {
        return {
          uploadId,
          async uploadPart(n: number, value: ArrayBuffer) { return { partNumber: n, etag: `e${n}-${value.byteLength}` } },
          async complete(parts: unknown[]) { stored.set(key, parts.length); return {} },
          async abort() {},
        }
      },
    }
  }

  it('ابدأ ثمّ قطعة ثمّ أكمل — ثمّ منشور معتمَد لكلّ منصّة، وكلُّها خلف الجلسة وCSRF', async () => {
    const bucket = multipartBucket()
    env['MEDIA'] = bucket
    const cookie = await login()
    const form = (fields: Record<string, string | Blob>): FormData => {
      const f = new FormData()
      for (const [k, v] of Object.entries(fields)) f.set(k, v)
      return f
    }

    // ‏بلا رمزٍ يُردّ قبل أن يُفتح رفع
    const naked = new FormData()
    naked.set('_csrf', 'wrong')
    naked.set('name', 'x.mp4')
    expect((await app.request('/panel/uploads/start', withSession(cookie, { method: 'POST', body: naked }), env)).status).toBe(403)

    const started = await (await app.request('/panel/uploads/start', withSession(cookie, {
      method: 'POST', body: form({ name: 'قيادة.mp4', mime: 'video/mp4', bytes: '12', width: '1080', height: '1920', duration_ms: '42000' }),
    }), env)).json() as { ok: boolean; id: string; parts: number }
    expect(started).toMatchObject({ ok: true, parts: 1 })

    const part = await (await app.request(`/panel/uploads/${started.id}/part`, withSession(cookie, {
      method: 'POST', body: form({ n: '1', chunk: new Blob([new Uint8Array(12)]) }),
    }), env)).json() as { ok: boolean; part: { partNumber: number; etag: string } }
    expect(part.ok).toBe(true)

    const done = await app.request(`/panel/uploads/${started.id}/complete`, withSession(cookie, {
      method: 'POST', body: form({ parts: JSON.stringify([part.part]) }),
    }), env)
    expect(done.status).toBe(200)
    expect(bucket.stored.get(`upload/${started.id}.mp4`)).toBe(1)

    const page = await (await everyPane((p) => app.request(p, withSession(cookie), env)))
    expect(page).toContain('<div class="card mt-3" id="videos"')
    expect(page).toContain('قيادة.mp4')
    expect(page).toContain('<bdi dir="ltr">0:42</bdi> · <bdi dir="ltr">1080×1920</bdi>')

    const posts = await app.request(`/panel/uploads/${started.id}/posts`, withSession(cookie, {
      method: 'POST',
      body: (() => {
        const f = form({ caption: 'المعلم نقطة قرار', approve: 'on' })
        for (const p of ['youtube', 'tiktok', 'instagram']) f.append('platform', p)
        return f
      })(),
    }), env)
    expect(posts.status).toBe(303)
    // ‏ويعود إلى صفّ المقطع نفسِه لا إلى رأس القسم
    expect(posts.headers.get('Location')).toBe(`/panel/library#v-${started.id}`)
    const rows = db.raw.prepare(
      `SELECT p.platform, p.status FROM posts p JOIN media m ON m.post_id = p.id WHERE m.upload_id = ? ORDER BY p.platform`,
    ).all(started.id) as { platform: string; status: string }[]
    expect(rows).toEqual([
      { platform: 'instagram', status: 'approved' },
      { platform: 'tiktok', status: 'approved' },
      { platform: 'youtube', status: 'approved' },
    ])
  })

  /** يرفع مقطعًا رأسيًّا قصيرًا عبر المسارات الثلاثة ويعيد معرّفَه. */
  async function uploaded(cookie: string): Promise<string> {
    env['MEDIA'] = multipartBucket()
    const form = (fields: Record<string, string | Blob>): FormData => {
      const f = new FormData()
      for (const [k, v] of Object.entries(fields)) f.set(k, v)
      return f
    }
    const started = await (await app.request('/panel/uploads/start', withSession(cookie, {
      method: 'POST', body: form({ name: 'قيادة.mp4', mime: 'video/mp4', bytes: '12', width: '1080', height: '1920', duration_ms: '42000' }),
    }), env)).json() as { id: string }
    const part = await (await app.request(`/panel/uploads/${started.id}/part`, withSession(cookie, {
      method: 'POST', body: form({ n: '1', chunk: new Blob([new Uint8Array(12)]) }),
    }), env)).json() as { part: unknown }
    await app.request(`/panel/uploads/${started.id}/complete`, withSession(cookie, {
      method: 'POST', body: form({ parts: JSON.stringify([part.part]) }),
    }), env)
    return started.id
  }

  async function create(cookie: string, id: string, caption: string, platforms = ['youtube', 'tiktok', 'instagram']): Promise<void> {
    const f = new FormData()
    f.set('caption', caption)
    f.set('approve', 'on')
    for (const p of platforms) f.append('platform', p)
    await app.request(`/panel/uploads/${id}/posts`, withSession(cookie, { method: 'POST', body: f }), env)
  }

  it('YouTube وTikTok يُقالان خاصَّين تحت المنصّة قبل الإنشاء، لا «Short ●» بالأخضر (ر-4 · D-190)', async () => {
    // ‏المتّصلُ وحدَه يُقال مَن يرى ما يُنشر عليه — وغيرُ المتّصل «غير متّصل» أوّلًا
    await db.prepare(`INSERT INTO accounts (id, platform, kind, external_id, display_name, status) VALUES
      ('acc-yt', 'youtube', 'org', 'yt', 'قناة عمر', 'active'),
      ('acc-tt', 'tiktok', 'member', 'tt', 'omar', 'active')`).run()
    const cookie = await login()
    await uploaded(cookie)
    const page = await (await everyPane((p) => app.request(p, withSession(cookie), env)))
    expect(page).toContain('متّصل · يصل خاصًّا')
    expect(page).toContain('Google لم تُجِز تطبيقك بعد — تنشره أنت من YouTube Studio.')
    expect(page).toContain('متّصل · لا يراه غيرك')
    expect(page).toContain('TikTok لم تُجِز تطبيقك بعد — تنشره أنت من تطبيق TikTok.')
    // ‏والـ Short يقرّره YouTube وحدَه، فيُقال ما سيكون وسببُه
    expect(page).toContain('يصير Short وحده لأنّه رأسيّ وأقصر من ثلاث دقائق')
    // ‏والعنوانُ يُقال فوق الحقل ويُعَدّ تحته
    expect(page).toContain('سطرُه الأوّل عنوان YouTube حتّى 100 محرف')
    expect(page).toMatch(/<textarea id="vc-[^"]+" name="caption"[^>]*data-yt-title="100"/)
    expect(page).toContain('data-yt-count hidden')
  })

  it('بعد الإنشاء: رابط لكلّ منشور إلى بطاقته، و«أُنشئت كلُّها»، وجدولتُها معًا بتوقيت المالك (ر-4)', async () => {
    await db.prepare(`INSERT INTO accounts (id, platform, kind, external_id, display_name, status) VALUES
      ('acc-yt', 'youtube', 'org', 'yt', 'قناة عمر', 'active'),
      ('acc-ig', 'instagram', 'member', 'ig', 'omar', 'active')`).run()
    const cookie = await login()
    const id = await uploaded(cookie)
    await create(cookie, id, 'المعلم نقطة قرار')
    const posts = db.raw.prepare(
      `SELECT p.id, p.platform FROM posts p JOIN media m ON m.post_id = p.id WHERE m.upload_id = ? ORDER BY p.platform`,
    ).all(id) as { id: string; platform: string }[]

    const page = await (await everyPane((p) => app.request(p, withSession(cookie), env)))
    const row = page.slice(page.indexOf(`id="v-${id}"`), page.indexOf('</form>', page.indexOf(`/panel/uploads/${id}/schedule`)))
    for (const p of posts) expect(row).toContain(`href="#d-${p.id}"`)
    expect(row).toContain('معتمَد بلا موعد')
    expect(row).toContain('أُنشئت كلُّها')
    expect(row).not.toContain('وما بقي لا يوافق')
    // ‏بلا كعكةٍ ولا منطقةٍ محفوظة: الأزرارُ بتوقيت الرياض وتقوله (D-202)
    expect(row).toContain('جدوِل منشورات YouTube وTikTok وInstagram معًا بتوقيت الرياض:')
    expect(row).toContain('name="preset" value="tomorrow"')
    expect(row).toContain('YouTube وTikTok لا يُنشران للعامّة')

    // ‏«غدًا 9:00 ص» بتوقيت الرياض: كلٌّ إلى حساب منصّته، وما بلا حسابٍ يُسمّى ولا يُسقط غيرَه
    const f = new FormData()
    for (const p of posts) f.append('post', p.id)
    f.set('preset', 'tomorrow')
    const done = await app.request(`/panel/uploads/${id}/schedule`, withSession(`${cookie}; sada_tz=Asia%2FRiyadh`, { method: 'POST', body: f }), env)
    expect(done.status).toBe(303)
    expect(done.headers.get('Location')).toBe(`/panel/library#v-${id}`)
    const after = db.raw.prepare(`SELECT platform, status, account_id, scheduled_at FROM posts ORDER BY platform`).all() as
      { platform: string; status: string; account_id: string | null; scheduled_at: string | null }[]
    expect(after.map((r) => [r.platform, r.status, r.account_id])).toEqual([
      ['instagram', 'queued', 'acc-ig'], ['tiktok', 'approved', null], ['youtube', 'queued', 'acc-yt'],
    ])
    // ‏التاسعةُ صباحًا بالرياض السادسةُ بـ UTC — أيًّا كانت ساعةُ الاختبار
    expect(after[0]!.scheduled_at).toMatch(/ 06:00:00$/)
    expect(after[0]!.scheduled_at).toBe(after[2]!.scheduled_at)
    const flash = await (await everyPane((p) => app.request(p, withSession(cookie), env)))
    expect(flash).toMatch(/جُدول على YouTube وInstagram [^<]* 9:00 ص\./)
    expect(flash).toContain('وتعذّر TikTok: لا حساب متّصلًا — اربطه أوّلًا.')
    expect(flash).toContain('YouTube لا يُنشر للعامّة')
    expect(flash).not.toContain('UTC.')
  })

  it('«متى؟» مع «اعتمده الآن»: يُنشأ ويُجدوَل في ضغطة واحدة، ولمنصّات هذا الإنشاء وحدها (D-218)', async () => {
    await db.prepare(`INSERT INTO accounts (id, platform, kind, external_id, display_name, status) VALUES
      ('acc-yt', 'youtube', 'org', 'yt', 'قناة عمر', 'active'),
      ('acc-ig', 'instagram', 'member', 'ig', 'omar', 'active')`).run()
    const cookie = await login()
    const id = await uploaded(cookie)
    const page = await (await everyPane((p) => app.request(p, withSession(cookie), env)))
    expect(page).toContain('<option value="">لاحقًا</option>')
    // ‏معتمَدٌ قبلُ على Instagram بلا موعد: لا يجرّه إنشاءُ YouTube إلى موعده
    await create(cookie, id, 'قبل', ['instagram'])
    const f = new FormData()
    f.set('caption', 'المعلم نقطة قرار')
    f.set('approve', 'on')
    f.set('preset', 'tomorrow')
    f.set('tz', 'Asia/Riyadh')
    f.append('platform', 'youtube')
    await app.request(`/panel/uploads/${id}/posts`, withSession(cookie, { method: 'POST', body: f }), env)
    const rows = db.raw.prepare(`SELECT platform, status, account_id, scheduled_at FROM posts ORDER BY platform`).all() as
      { platform: string; status: string; account_id: string | null; scheduled_at: string | null }[]
    expect(rows.map((r) => [r.platform, r.status, r.account_id])).toEqual([
      ['instagram', 'approved', null], ['youtube', 'queued', 'acc-yt'],
    ])
    expect(rows[1]!.scheduled_at).toMatch(/ 06:00:00$/)
    const flash = await (await everyPane((p) => app.request(p, withSession(cookie), env)))
    expect(flash).toMatch(/أُنشئ على YouTube وجُدول [^<]*9:00 ص/)
  })

  it('«متى؟» بلا اعتماد لا يجدول شيئًا (D-218)', async () => {
    await db.prepare(`INSERT INTO accounts (id, platform, kind, external_id, display_name, status) VALUES
      ('acc-yt', 'youtube', 'org', 'yt', 'قناة عمر', 'active')`).run()
    const cookie = await login()
    const id = await uploaded(cookie)
    const f = new FormData()
    f.set('caption', 'نصّ')
    f.set('preset', 'tomorrow')
    f.append('platform', 'youtube')
    await app.request(`/panel/uploads/${id}/posts`, withSession(cookie, { method: 'POST', body: f }), env)
    const row = db.raw.prepare(`SELECT status, scheduled_at FROM posts`).get() as { status: string; scheduled_at: string | null }
    expect(row).toEqual({ status: 'draft', scheduled_at: null })
  })

  it('عنوان YouTube فوق حدّه يُقال بما سيُرفع بعد الإنشاء (ر-4)', async () => {
    const cookie = await login()
    const id = await uploaded(cookie)
    await create(cookie, id, `${'كلمة '.repeat(30)}\nوصف`, ['youtube'])
    const page = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(page).toContain('وعنوان YouTube أطول ممّا تقبله فيُرفع مقصوصًا: «')
  })

  it('والجدولة من بطاقة المنشور تقول إنّ YouTube يصل خاصًّا، وInstagram لا (ر-4)', async () => {
    await db.prepare(`INSERT INTO accounts (id, platform, kind, external_id, display_name, status) VALUES
      ('acc-yt', 'youtube', 'org', 'yt', 'قناة عمر', 'active'),
      ('acc-ig', 'instagram', 'member', 'ig', 'omar', 'active')`).run()
    const cookie = await login()
    const id = await uploaded(cookie)
    await create(cookie, id, 'المعلم نقطة قرار', ['youtube', 'instagram'])
    const when = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 16)
    const flashFor = async (platform: string, account: string): Promise<string> => {
      const post = db.raw.prepare(`SELECT id FROM posts WHERE platform = ?`).get(platform) as { id: string }
      const f = new FormData()
      f.set('id', post.id)
      f.set('account', account)
      f.set('when', when)
      await app.request('/panel/drafts/schedule', withSession(cookie, { method: 'POST', body: f }), env)
      const html = await (await app.request('/panel', withSession(cookie), env)).text()
      // ‏الإشعارُ وحده لا الصفحة: نصُّ «جُدولت…» يُختبَر في موضعه، وهنا ما يُلحَق به
      const at = html.indexOf('<div id="flash"')
      return html.slice(at, html.indexOf('</div>', html.indexOf('جُدولت', at)))
    }
    // ‏وقناةُ YouTube (`org` كما يحفظها الربط) وجهةٌ في نموذج بطاقتها، لا «الصفحةُ مربوطة» (D-087)
    const ytPost = db.raw.prepare(`SELECT id FROM posts WHERE platform = 'youtube'`).get() as { id: string }
    const board = await (await app.request('/panel', withSession(cookie), env)).text()
    const ytCard = board.slice(board.indexOf(`id="d-${ytPost.id}"`), board.indexOf('</form>', board.indexOf(`id="s-${ytPost.id}"`)))
    // ‏وحسابٌ واحدٌ سطرٌ لا قائمة (D-199)
    expect(ytCard).toContain('<input type="hidden" name="account" value="acc-yt">')
    expect(ytCard).toContain('على <bdi>قناة عمر · YouTube</bdi>')
    expect(ytCard).not.toContain('Community Management API')
    const yt = await flashFor('youtube', 'acc-yt')
    expect(yt).toContain('جُدولت')
    expect(yt).toContain('YouTube لا يُنشر للعامّة: يصل قناتك خاصًّا')
    const ig = await flashFor('instagram', 'acc-ig')
    expect(ig).toContain('جُدولت')
    expect(ig).not.toContain('لا يُنشر للعامّة')
  })

  it('موعد لا تعرفه الأزرار لا يجدول شيئًا', async () => {
    const cookie = await login()
    const id = await uploaded(cookie)
    await create(cookie, id, 'نصّ', ['instagram'])
    const f = new FormData()
    f.set('preset', 'yesterday')
    const r = await app.request(`/panel/uploads/${id}/schedule`, withSession(cookie, { method: 'POST', body: f }), env)
    expect(r.status).toBe(303)
    expect((db.raw.prepare(`SELECT COUNT(*) AS n FROM posts WHERE status = 'queued'`).get() as { n: number }).n).toBe(0)
    expect(await (await app.request('/panel', withSession(cookie), env)).text()).toContain('موعد لا أعرفه')
  })
})

describe('خطّتُك من ملفّ: اقرأ، عاين، اعتمد وجدوِل (D-181)', () => {
  it('الملفّ يُعاين صفًّا صفًّا، ولا يُجدوَل إلّا بالضغطة، والمعاينة تُستهلَك', async () => {
    await db.prepare(`INSERT INTO accounts (id, platform, kind, external_id, display_name, status) VALUES ('acc-li', 'linkedin', 'member', 'sub', 'عمر', 'active')`).run()
    const cookie = await login()
    const future = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10)
    const csv = `date,time,platform,text\n${future},09:30,linkedin,"المعلم نقطة قرار"\n${future},10:00,tiktok,بلا حساب\n`
    const body = new FormData()
    body.set('file', new Blob([csv], { type: 'text/csv' }), 'plan.csv')
    const read = await app.request('/panel/plan-import', withSession(cookie, { method: 'POST', body }), env)
    expect(read.status).toBe(303)
    const to = read.headers.get('Location')!
    expect(to).toMatch(/^\/panel\/plan-import\/[0-9a-f-]{36}$/)

    // ‏المعاينةُ لا تكتب شيئًا
    const preview = await (await app.request(to, withSession(cookie), env)).text()
    expect(preview).toContain('معاينة الخطّة')
    expect(preview).toContain('لا حساب متّصلًا على TikTok')
    expect(preview).toContain('اعتمد وجدوِل منشورًا واحدًا')
    expect(preview).toContain('<input type="hidden" name="lines" value="2">')
    expect(preview).toContain('<aside class="rail">')
    expect((db.raw.prepare('SELECT COUNT(*) AS n FROM posts').get() as { n: number }).n).toBe(0)

    // ‏نموذجٌ بلا سطورٍ معروضة (معاينةٌ قديمة) لا يُجدوِل شيئًا ويعيد إلى المعاينة
    const stale = await app.request(`${to}/approve`, withSession(cookie, { method: 'POST', body: new FormData() }), env)
    expect(stale.headers.get('Location')).toBe(to)
    expect((db.raw.prepare('SELECT COUNT(*) AS n FROM posts').get() as { n: number }).n).toBe(0)

    // ‏وسطرٌ لم يُعرَض جاهزًا (3: TikTok بلا حساب) لا يُجدوَل ولو أُضيف إلى النموذج
    const approve = new FormData()
    approve.set('lines', '2,3')
    const done = await app.request(`${to}/approve`, withSession(cookie, { method: 'POST', body: approve }), env)
    expect(done.status).toBe(303)
    const rows = db.raw.prepare('SELECT platform, status, account_id FROM posts').all()
    expect(rows).toEqual([{ platform: 'linkedin', status: 'queued', account_id: 'acc-li' }])

    // ‏والمعاينةُ استُهلكت: الضغطةُ الثانيةُ لا تجد ما تعيده
    expect((await app.request(to, withSession(cookie), env)).status).toBe(404)
  })

  it('حقل الملفّ موصول بسكربت القراءة الفوريّة، وزرّ «اقرأ الخطّة» باق لمن لا سكربت عنده (ر-5)', async () => {
    const cookie = await login()
    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    const card = html.slice(html.indexOf('action="/panel/plan-import"'), html.indexOf('</form>', html.indexOf('action="/panel/plan-import"')))
    expect(card).toContain('<span data-plan-name>اختر ملفّ الخطّة (CSV)</span>')
    expect(card).toMatch(/<input type="file" name="file"[^>]*data-plan-file>/)
    // ‏الاختيارُ هو الفعل؛ والزرُّ لمن لا سكربتَ عنده وحده، فلا يُضغط زرٌّ داكنٌ قبل اختيار الملفّ
    expect(card).toContain('<noscript><button class="btn btn-secondary" type="submit">اقرأ الخطّة</button></noscript>')
    expect(card).toContain('<label class="btn btn-primary vpick">')
  })

  it('معاينة انتهت مهلتُها صفحة بالرافدة وزرّ إلى الرفع، لا نصّ خامّ (ر-5)', async () => {
    const cookie = await login()
    const r = await app.request(`/panel/plan-import/${crypto.randomUUID()}`, withSession(cookie), env)
    expect(r.status).toBe(404)
    expect(r.headers.get('Content-Type')).toContain('text/html')
    const html = await r.text()
    expect(html).toContain('<aside class="rail">')
    expect(html).toContain('انتهت مهلة هذه المعاينة')
    expect(html).toContain('<a class="btn btn-primary" href="/panel#plan-import">ارفع الملفّ من جديد</a>')
  })

  it('المعاينة على الهاتف: لكلّ خليّة لصيقتُها، والمنصّة باسمها، والموعد كما فُهم، والاعتماد ملتصق بالأسفل (ر-5)', async () => {
    await db.prepare(`INSERT INTO accounts (id, platform, kind, external_id, display_name, status) VALUES ('acc-li', 'linkedin', 'member', 'sub', 'عمر', 'active')`).run()
    const cookie = await login()
    const csv = 'التاريخ,الوقت,المنصة,النص\n10/9/2027,9:30 AM,linkedin,أوّل\n10/13/2027,9:30,لينكدإن,ثان\n'
    const body = new FormData()
    body.set('file', new Blob([csv], { type: 'text/csv' }), 'plan.csv')
    const to = (await app.request('/panel/plan-import', withSession(cookie, { method: 'POST', body }), env)).headers.get('Location')!
    const preview = await (await app.request(to, withSession(`${cookie}; sada_tz=Asia%2FRiyadh`), env)).text()
    for (const label of ['الموعد', 'المنصّة', 'النصّ', 'المقطع', 'الحال']) expect(preview).toContain(`data-label="${label}"`)
    // ‏«10/9» في ملفٍّ فيه «10/13» أكتوبرُ لا سبتمبر — ويُقال بالعربيّة
    expect(preview).toContain('السبت 9 أكتوبر 2027 9:30 ص')
    expect(preview).toContain('<span class="ago">السطر 2</span>')
    expect(preview).toContain('>LinkedIn<span class="ago">')
    expect(preview).not.toContain('>linkedin<')
    expect(preview).not.toContain('Asia/Riyadh')
    expect(preview).toContain('<div class="row pi-bar">')
    expect(preview).toContain('اعتمد وجدوِل منشورَين')
  })

  it('ملفّ بغير UTF-8 (Windows-1256 من Excel) يُردّ باسم الصيغة التي تُصلحه ولا يُعايَن', async () => {
    const cookie = await login()
    const body = new FormData()
    // ‏«نص» بـ Windows-1256: ‏0xE4 0xD5 — بايتاتٌ لا تكون UTF-8 صالحة
    body.set('file', new Blob([new Uint8Array([0x64, 0x61, 0x74, 0x65, 0x0a, 0xe4, 0xd5])], { type: 'text/csv' }), 'plan.csv')
    const r = await app.request('/panel/plan-import', withSession(cookie, { method: 'POST', body }), env)
    expect(r.status).toBe(303)
    expect(r.headers.get('Location')).toBe('/panel#plan-import')
    const page = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(page).toContain('CSV UTF-8')
  })

  it('النموذج يُنزَّل CSV خلف الجلسة', async () => {
    expect((await app.request('/panel/plan-import/template.csv', {}, env)).headers.get('Content-Type')).not.toContain('text/csv')
    const cookie = await login()
    const r = await app.request('/panel/plan-import/template.csv', withSession(cookie), env)
    expect(r.headers.get('Content-Type')).toBe('text/csv; charset=utf-8')
    // ‏والعناوينُ بالعربيّة: يقرؤها المالكُ في جدوله، والقراءةُ تقبلها
    expect(await r.text()).toContain('التاريخ,الوقت,المنصة,النص,المقطع')
  })
})

describe('الوسيط يُبثّ بمداه (D-182)', () => {
  const BYTES = new Uint8Array(Array.from({ length: 100 }, (_, i) => i))
  function rangedBucket() {
    return {
      async head() { return { size: BYTES.length } },
      async get(_key: string, opts?: { range?: { offset?: number; length?: number; suffix?: number } }) {
        const r = opts?.range
        const start = r === undefined ? 0 : r.suffix !== undefined ? BYTES.length - r.suffix : r.offset ?? 0
        const end = r === undefined || r.suffix !== undefined || r.length === undefined ? BYTES.length : start + r.length
        return { size: BYTES.length, body: BYTES.slice(start, Math.min(end, BYTES.length)) }
      },
    }
  }
  async function seedVideo(): Promise<string> {
    const postId = crypto.randomUUID()
    await db.prepare(`INSERT INTO posts (id, platform, type, text, status, idempotency_key) VALUES (?, 'youtube', 'text', 'نصّ', 'draft', ?)`)
      .bind(postId, `k-${postId}`).run()
    const id = crypto.randomUUID()
    await db.prepare(
      `INSERT INTO media (id, post_id, r2_key, mime, bytes, prompt, model, cost_usd, status, idempotency_key)
       VALUES (?, ?, 'upload/u.mp4', 'video/mp4', 100, '', 'upload', 0, 'ready', ?)`,
    ).bind(id, postId, `upload:u:${postId}`).run()
    return id
  }

  it('بلا Range: ‏200 والكائن كلُّه. وبمدًى: ‏206 بحدوده. وخارجَه: ‏416 بحجمه', async () => {
    env['MEDIA'] = rangedBucket()
    const id = await seedVideo()
    const cookie = await login()
    const whole = await app.request(`/panel/media/${id}`, withSession(cookie), env)
    expect(whole.status).toBe(200)
    expect(whole.headers.get('Content-Length')).toBe('100')
    expect(whole.headers.get('Accept-Ranges')).toBe('bytes')

    const part = await app.request(`/panel/media/${id}`, withSession(cookie, { headers: { Range: 'bytes=10-19' } }), env)
    expect(part.status).toBe(206)
    expect(part.headers.get('Content-Range')).toBe('bytes 10-19/100')
    expect(part.headers.get('Content-Length')).toBe('10')
    expect([...new Uint8Array(await part.arrayBuffer())]).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19])

    const tail = await app.request(`/panel/media/${id}`, withSession(cookie, { headers: { Range: 'bytes=90-' } }), env)
    expect(tail.headers.get('Content-Range')).toBe('bytes 90-99/100')

    const out = await app.request(`/panel/media/${id}`, withSession(cookie, { headers: { Range: 'bytes=500-' } }), env)
    expect(out.status).toBe(416)
    expect(out.headers.get('Content-Range')).toBe('bytes */100')
  })
})

/**
 * ‏صفحةٌ لا نصٌّ خامّ (D-189): رابطٌ قديمٌ إلى منصّةٍ أو أسبوعٍ أو منشورٍ لا وجودَ له يفتح صفحةَ
 * ‏٤٠٤ بالرافدة وبابِ الرئيسيّة، وجملتُه تقول ما لم يُوجَد.
 */
describe('‏٤٠٤ داخل اللوحة صفحة لا نصّ (D-189)', () => {
  it('منصّة وأسبوع ومنشور لا وجود لها', async () => {
    const cookie = await login()
    const html = { Accept: 'text/html' }
    for (const [path, said] of [
      ['/panel/channels/myspace', 'لا منصّة بهذا الاسم'],
      ['/panel/report/1999-01-04', 'لا تقرير لهذا الأسبوع'],
      ['/panel/journey/nope', 'لا منشور بهذا المعرّف'],
    ] as const) {
      const res = await app.request(path, withSession(cookie, { headers: html }), env)
      expect(res.status, path).toBe(404)
      expect(res.headers.get('Content-Type'), path).toContain('text/html')
      const page = await res.text()
      expect(page, path).toContain(said)
      expect(page, path).toContain('<h1 class="empty-t">هذه الصفحة غير موجودة</h1>')
    }
  })
})

/*
 * ‏**الكتابةُ أسهل، والمقطعُ يُكتب له، والمنصّةُ غيرُ المتّصلة تُقال** (D-190).
 *
 * ‏قال المالك: «يُفترض أن تكون الكتابةُ أسهل، وتنشأ من نصٍّ أو كلماتٍ بسيطة وشرحِ المقطع، ويكون
 * ‏موائمًا مع المنصّة. ولماذا لا أستطيع أن أنشر في YouTube؟ وTikTok غيرُ متّصلٍ يجب أن يكون واضحًا.»
 */
describe('الكتابة من فكرة ومن وصف المقطع، والربط والعلنيّة حيث تُختار المنصّة (D-190)', () => {
  const realFetch = globalThis.fetch
  afterEach(() => { globalThis.fetch = realFetch })

  /** ‏Anthropic وحده — والجوابُ بحسب ما يُطلب: نصوصُ مقطعٍ أو منشور. */
  function anthropic(answer: (body: string) => unknown): { calls: string[] } {
    const calls: string[] = []
    globalThis.fetch = (async (input: unknown, init?: RequestInit): Promise<Response> => {
      const request = input instanceof Request ? input : null
      const url = request !== null ? request.url : String(input)
      if (!url.includes('api.anthropic.com')) throw new Error(`نداء غير متوقّع: ${url}`)
      const body = request !== null ? await request.clone().text() : String(init?.body ?? '')
      calls.push(body)
      return new Response(JSON.stringify({
        id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5', stop_reason: 'end_turn',
        content: [{ type: 'text', text: JSON.stringify(answer(body)) }],
        usage: { input_tokens: 800, output_tokens: 300 },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }) as unknown as typeof fetch
    return { calls }
  }

  async function post(cookie: string, path: string, fields: Record<string, string | string[]>): Promise<Response> {
    const body = new FormData()
    for (const [k, v] of Object.entries(fields)) {
      for (const one of Array.isArray(v) ? v : [v]) body.append(k, one)
    }
    return app.request(path, withSession(cookie, { method: 'POST', body }), env)
  }
  const where = (r: Response): string | null => r.headers.get('Location')
  const ledger = (): { operation: string; ref_id: string | null }[] =>
    db.raw.prepare('SELECT operation, ref_id FROM cost_ledger ORDER BY at').all() as { operation: string; ref_id: string | null }[]

  function multipartBucket() {
    return {
      async createMultipartUpload(key: string) { return this.resumeMultipartUpload(key, `mp-${key}`) },
      resumeMultipartUpload(_key: string, uploadId: string) {
        return {
          uploadId,
          async uploadPart(n: number, value: ArrayBuffer) { return { partNumber: n, etag: `e${n}-${value.byteLength}` } },
          async complete() { return {} },
          async abort() {},
        }
      },
    }
  }

  async function uploaded(cookie: string): Promise<string> {
    env['MEDIA'] = multipartBucket()
    const form = (fields: Record<string, string | Blob>): FormData => {
      const f = new FormData()
      for (const [k, v] of Object.entries(fields)) f.set(k, v)
      return f
    }
    const started = await (await app.request('/panel/uploads/start', withSession(cookie, {
      method: 'POST', body: form({ name: 'قيادة.mp4', mime: 'video/mp4', bytes: '12', width: '1080', height: '1920', duration_ms: '42000' }),
    }), env)).json() as { id: string }
    const part = await (await app.request(`/panel/uploads/${started.id}/part`, withSession(cookie, {
      method: 'POST', body: form({ n: '1', chunk: new Blob([new Uint8Array(12)]) }),
    }), env)).json() as { part: unknown }
    await app.request(`/panel/uploads/${started.id}/complete`, withSession(cookie, {
      method: 'POST', body: form({ parts: JSON.stringify([part.part]) }),
    }), env)
    return started.id
  }

  const POST_TEXT = { text: 'الحوكمة لا تبطئ القرار، تحميه. '.repeat(4), rationale: 'زاوية الحماية لا البطء.' }

  describe('«اكتب من فكرتك»', () => {
    it('الرأس يفتح البطاقة، والبطاقة تقول LinkedIn متّصلًا وX غير متّصل بلا تأشير', async () => {
      await db.prepare(`INSERT INTO accounts (id, platform, kind, external_id, display_name, status) VALUES ('acc-li', 'linkedin', 'member', 'sub', 'عمر', 'active')`).run()
      env['ANTHROPIC_API_KEY'] = 'sk-ant-test-0001'
      const html = await (await app.request('/panel', withSession(await login()), env)).text()
      const head = html.slice(html.indexOf('<section data-pane="posts"'), html.indexOf('</div>', html.indexOf('<div class="aside">', html.indexOf('<section data-pane="posts"'))))
      expect(head).toContain('href="#idea"')
      const card = html.slice(html.indexOf('id="idea"'), html.indexOf('id="write"'))
      expect(html).toContain('<h2>منشور جديد</h2>')
      expect(card).toContain('<label for="di-text">فكرتك</label>')
      expect(card).toContain('<legend>اكتب لـ</legend>')
      expect(card).toContain('<input type="checkbox" name="platform" value="linkedin" checked>')
      expect(card).toContain('<input type="checkbox" name="platform" value="x">')
      expect(card).toContain('غير متّصل')
      expect(card).toContain('href="/panel/channels/x"')
      expect(card).toMatch(/<button class="btn btn-primary" type="submit"><span>اكتب المسوّدات<\/span><\/button>/)
    })

    it('ضغطة واحدة: مسوّدة لكلّ منصّة، والكلفة قبلها، والعودة إلى أوّل بطاقة جديدة — وما لا يُجدوَل يُقال', async () => {
      await db.prepare(`INSERT INTO accounts (id, platform, kind, external_id, display_name, status) VALUES ('acc-li', 'linkedin', 'member', 'sub', 'عمر', 'active')`).run()
      env['ANTHROPIC_API_KEY'] = 'sk-ant-test-0001'
      const net = anthropic((body) => (body.includes('منشور X') ? { text: 'الحوكمة تحمي القرار ولا تبطئه، وتُريك ما تقرّر قبل أن تقرّره.', rationale: 'ر' } : POST_TEXT))
      const cookie = await login()
      const r = await post(cookie, '/panel/drafts/idea', { idea: 'الحوكمة لا تبطئ القرار، تحميه', platform: ['linkedin', 'x'] })
      expect(net.calls).toHaveLength(2)
      expect(net.calls[0]).toContain('الحوكمة لا تبطئ القرار، تحميه')
      const rows = db.raw.prepare(`SELECT id, platform, status, source_id, idempotency_key FROM posts ORDER BY platform`).all() as
        { id: string; platform: string; status: string; source_id: string | null; idempotency_key: string }[]
      expect(rows.map((x) => [x.platform, x.status, x.source_id])).toEqual([['linkedin', 'draft', null], ['x', 'draft', null]])
      expect(rows.every((x) => /^idea:[0-9a-f]{32}:(linkedin|x)$/.test(x.idempotency_key))).toBe(true)
      expect(ledger().map((x) => x.operation)).toEqual(['draft:linkedin:claude-opus-5', 'draft:x:claude-opus-5'])
      const linkedin = rows.find((x) => x.platform === 'linkedin')!
      expect(where(r)).toBe(`/panel#d-${linkedin.id}`)
      const page = await (await app.request('/panel', withSession(cookie), env)).text()
      expect(page).toContain('كُتبت من فكرتك مسوّدتا LinkedIn وX')
      expect(page).toContain('ولا حساب متّصلًا على X: تُعتمَد ولا تُجدوَل حتّى تربطه.')

      // ‏والضغطةُ الثانيةُ بالفكرة نفسِها لا تُنادي ولا تُكلّف
      const again = await post(cookie, '/panel/drafts/idea', { idea: 'الحوكمة  لا تبطئ القرار، تحميه ', platform: 'linkedin' })
      expect(net.calls).toHaveLength(2)
      expect(ledger()).toHaveLength(2)
      expect(where(again)).toBe(`/panel#d-${linkedin.id}`)
    })

    it('وصورةٌ مع كلّ مسوّدة إن رُفع (D-255): مطفأٌ أوّلًا، وبسقفه اليوميّ', async () => {
      await db.prepare(`INSERT INTO accounts (id, platform, kind, external_id, display_name, status) VALUES ('acc-li', 'linkedin', 'member', 'sub', 'عمر', 'active')`).run()
      env['ANTHROPIC_API_KEY'] = 'sk-ant-test-0001'
      anthropic(() => POST_TEXT)
      const cookie = await login()
      const flash = async (idea: string): Promise<string> => {
        await post(cookie, '/panel/drafts/idea', { idea, platform: 'linkedin' })
        return (await app.request('/panel', withSession(cookie), env)).text()
      }
      // ‏مطفأٌ: لا صورة تُذكر
      expect(await flash('فكرة أولى عن الأثر')).not.toContain('وتُرسم صورتُها الآن')
      // ‏مرفوعٌ: تبدأ صورتُها وتُقال
      await db.prepare("INSERT INTO settings (key, value, updated_by) VALUES ('auto_image', 'true', 'test')").run()
      expect(await flash('فكرة ثانية عن الحوكمة')).toContain('وتُرسم صورتُها الآن')
      // ‏والسقفُ صفرٌ يُغلقها
      await db.prepare("INSERT INTO settings (key, value, updated_by) VALUES ('daily_image_cap', '0', 'test')").run()
      expect(await flash('فكرة ثالثة عن القرار')).not.toContain('وتُرسم صورتُها الآن')
      // ‏والبطاقةُ في «الإنفاق والحدود» تقول حالَها
      const settings = await (await app.request('/panel/settings', withSession(cookie), env)).text()
      expect(settings).toContain('id="auto-image"')
      expect(settings).toContain('<input type="hidden" name="key" value="auto_image">')
    })

    it('بلا منصّة أو بفكرة فارغة يُردّ قبل أيّ نداء، والإيقاف يحجز — والزرّ معطَّل وسببُه تحته', async () => {
      env['ANTHROPIC_API_KEY'] = 'sk-ant-test-0001'
      const net = anthropic(() => POST_TEXT)
      const cookie = await login()
      expect(where(await post(cookie, '/panel/drafts/idea', { idea: 'فكرة كاملة' }))).toBe('/panel#idea')
      expect(where(await post(cookie, '/panel/drafts/idea', { idea: ' ', platform: 'linkedin' }))).toBe('/panel#idea')
      await writeSetting(db, 'paused', 'true', 'test')
      expect(where(await post(cookie, '/panel/drafts/idea', { idea: 'فكرة كاملة', platform: ['linkedin', 'x'] }))).toBe('/panel#idea')
      expect(net.calls).toHaveLength(0)
      expect(ledger()).toHaveLength(0)
      const html = await (await app.request('/panel', withSession(cookie), env)).text()
      const card = html.slice(html.indexOf('id="idea"'), html.indexOf('id="write"'))
      expect(card).toContain('aria-disabled="true" aria-describedby="di-why"')
      expect(card).toContain('النظام موقوف بقرارك')
    })

    it('ومزوّد الكتابة غير مضبوط: الزرّ معطَّل ويقول أين يُضبط', async () => {
      const html = await (await app.request('/panel', withSession(await login()), env)).text()
      const card = html.slice(html.indexOf('id="idea"'), html.indexOf('id="write"'))
      expect(card).toContain('مزوّد مهمّة الكتابة غير جاهز.')
      expect(card).toContain('href="#providers"')
    })
  })

  describe('«اكتب النصوص» لمقطع، ونصّ لكلّ منصّة', () => {
    const CAPTIONS = {
      youtube_title: 'القيادة في أوّل مئة يوم',
      youtube_description: 'ما يقرّره القائد أوّلًا.\n\n#قيادة #Shorts',
      tiktok: 'أوّل مئة يوم تكتب ما بعدها. #قيادة #إدارة #حوكمة',
      instagram: 'من أين يبدأ القائد؟\n\n#قيادة #إدارة #حوكمة',
    }

    it('صفّ المقطع يقول من لم يُربط بلا تأشير، ويعرض «صف المقطع بجملة» — ونصًّا واحدًا بيدك كما كان', async () => {
      env['ANTHROPIC_API_KEY'] = 'sk-ant-test-0001'
      const cookie = await login()
      const id = await uploaded(cookie)
      const page = await (await everyPane((p) => app.request(p, withSession(cookie), env)))
      const row = page.slice(page.indexOf(`id="v-${id}"`), page.indexOf('</form>', page.indexOf(`/panel/uploads/${id}/posts`)))
      expect(row).toContain(`action="/panel/uploads/${id}/captions"`)
      expect(row).toContain('صف المقطع بجملة')
      for (const p of ['youtube', 'tiktok', 'instagram']) {
        expect(row).toContain(`<input type="checkbox" name="platform" value="${p}">`)
        expect(row).toContain(`href="/panel/channels/${p}"`)
      }
      expect(row).toContain('غير متّصل')
      expect(row).toContain('Reel')
      expect(row).toContain('name="caption"')
      expect(row).not.toContain('name="per_platform"')
    })

    it('نداء واحد ← حقول المنصّات مملوءة، والكلفة قبلها — ثمّ «أنشئ» بنصّ كلّ منصّة، والضغطة الثانية لا تُكلّف', async () => {
      await db.prepare(`INSERT INTO accounts (id, platform, kind, external_id, display_name, status) VALUES ('acc-yt', 'youtube', 'org', 'yt', 'قناة عمر', 'active')`).run()
      env['ANTHROPIC_API_KEY'] = 'sk-ant-test-0001'
      const net = anthropic(() => CAPTIONS)
      const cookie = await login()
      const id = await uploaded(cookie)
      const wrote = await post(cookie, `/panel/uploads/${id}/captions`, { about: 'لقاء عن القيادة في أوّل مئة يوم' })
      expect(where(wrote)).toBe(`/panel/library#v-${id}`)
      expect(net.calls).toHaveLength(1)
      expect(ledger()).toEqual([{ operation: 'captions:claude-opus-5', ref_id: id }])
      expect(kv.ttlOf(`captions:${id}`)).toBe(86_400)

      const page = await (await everyPane((p) => app.request(p, withSession(cookie), env)))
      expect(page).toContain('كُتبت نصوص YouTube وTikTok وInstagram — الكلفة')
      const row = page.slice(page.indexOf(`id="v-${id}"`), page.indexOf('</form>', page.indexOf(`/panel/uploads/${id}/posts`)))
      expect(row).toContain('value="لقاء عن القيادة في أوّل مئة يوم"')
      expect(row).toContain('<input type="hidden" name="per_platform" value="1">')
      expect(row).toContain('name="title_youtube" maxlength="100" value="القيادة في أوّل مئة يوم"')
      expect(row).toContain('أوّل مئة يوم تكتب ما بعدها. #قيادة #إدارة #حوكمة</textarea>')
      expect(row).toContain('اعتمده الآن — راجعت النصوص')
      expect(row).toContain('أعد كتابتها')
      // ‏المتّصلُ مؤشَّر، وغيرُ المتّصل لا
      expect(row).toContain('<input type="checkbox" name="platform" value="youtube" checked>')
      expect(row).toContain('<input type="checkbox" name="platform" value="tiktok">')

      // ‏الضغطةُ الثانيةُ بالوصف نفسِه: لا نداءَ ولا كلفة
      await post(cookie, `/panel/uploads/${id}/captions`, { about: 'لقاء عن القيادة في أوّل مئة يوم' })
      expect(net.calls).toHaveLength(1)
      expect(ledger()).toHaveLength(1)

      const made = await post(cookie, `/panel/uploads/${id}/posts`, {
        per_platform: '1', platform: ['youtube', 'tiktok'], approve: 'on',
        title_youtube: 'القيادة في أوّل مئة يوم', caption_youtube: 'ما يقرّره القائد أوّلًا.\r\n\r\n#قيادة #Shorts',
        caption_tiktok: 'نصّ TikTok بعد أن عدّلتُه', caption_instagram: CAPTIONS.instagram,
      })
      expect(where(made)).toBe(`/panel/library#v-${id}`)
      const posts = db.raw.prepare(`SELECT platform, text, model, status FROM posts ORDER BY platform`).all() as
        { platform: string; text: string; model: string; status: string }[]
      expect(posts).toEqual([
        { platform: 'tiktok', text: 'نصّ TikTok بعد أن عدّلتُه', model: 'claude-opus-5', status: 'approved' },
        { platform: 'youtube', text: 'القيادة في أوّل مئة يوم\n\nما يقرّره القائد أوّلًا.\n\n#قيادة #Shorts', model: 'claude-opus-5', status: 'approved' },
      ])
      const after = await (await everyPane((p) => app.request(p, withSession(cookie), env)))
      expect(after).toContain('ولا حساب متّصلًا على TikTok: لا يُجدوَل حتّى تربطه.')
      // ‏وInstagram باقٍ بنصّه المكتوب لا يضيع
      const left = after.slice(after.indexOf(`id="v-${id}"`), after.indexOf('</form>', after.indexOf(`/panel/uploads/${id}/posts`)))
      expect(left).toContain('من أين يبدأ القائد؟')
      expect(left).not.toContain('name="title_youtube"')
    })

    it('وإنشاء رُدّ يُبقي ما حرّره المالك في حقوله', async () => {
      env['ANTHROPIC_API_KEY'] = 'sk-ant-test-0001'
      anthropic(() => CAPTIONS)
      const cookie = await login()
      const id = await uploaded(cookie)
      await post(cookie, `/panel/uploads/${id}/captions`, { about: 'لقاء عن القيادة' })
      await post(cookie, `/panel/uploads/${id}/posts`, {
        per_platform: '1', platform: ['tiktok'], approve: 'on',
        title_youtube: 'عنواني أنا', caption_youtube: 'وصفي', caption_tiktok: '', caption_instagram: 'نصّي',
      })
      expect(db.raw.prepare('SELECT COUNT(*) AS n FROM posts').get()).toEqual({ n: 0 })
      const page = await (await everyPane((p) => app.request(p, withSession(cookie), env)))
      expect(page).toContain('لم يُنشأ منشور: TikTok: النصّ فارغ')
      expect(page).toContain('value="عنواني أنا"')
      expect(page).toContain('نصّي</textarea>')
    })

    it('والإيقاف يحجز «اكتب النصوص» قبل النداء', async () => {
      env['ANTHROPIC_API_KEY'] = 'sk-ant-test-0001'
      const net = anthropic(() => CAPTIONS)
      const cookie = await login()
      const id = await uploaded(cookie)
      await writeSetting(db, 'paused', 'true', 'test')
      await post(cookie, `/panel/uploads/${id}/captions`, { about: 'لقاء عن القيادة' })
      expect(net.calls).toHaveLength(0)
      expect(ledger()).toHaveLength(0)
      const page = await (await everyPane((p) => app.request(p, withSession(cookie), env)))
      const row = page.slice(page.indexOf(`id="v-${id}"`), page.indexOf(`/panel/uploads/${id}/posts`))
      expect(row).toContain(`aria-describedby="vw-${id}"`)
    })
  })

  describe('«انشر للعامّة» بعد الإجازة', () => {
    it('في إعداد YouTube: خاصّ بالافتراض، وقلبُه يعود إلى الصفحة نفسِها ويُسكت «يصل خاصًّا» في صفّ المقطع', async () => {
      await db.prepare(`INSERT INTO accounts (id, platform, kind, external_id, display_name, status) VALUES ('acc-yt', 'youtube', 'org', 'yt', 'قناة عمر', 'active')`).run()
      const cookie = await login()
      const setup = await (await app.request('/panel/channels/youtube?tab=setup', withSession(cookie), env)).text()
      expect(setup).toContain('id="reach"')
      expect(setup).toContain('النشر العلنيّ — بعد إجازة Google')
      expect(setup).toContain('<input type="hidden" name="key" value="youtube_public">')
      expect(setup).toContain('<input type="hidden" name="value" value="true">')
      expect(setup).toContain('انشر للعامّة')

      const r = await post(cookie, '/panel/settings', { key: 'youtube_public', value: 'true', return: 'platform:youtube:setup' })
      expect(where(r)).toBe('/panel/channels/youtube?tab=setup')
      expect((await readSettings(db)).youtubePublic).toBe(true)
      const after = await (await app.request('/panel/channels/youtube?tab=setup', withSession(cookie), env)).text()
      expect(after).toContain('صار النشر على YouTube للعامّة')
      expect(after).toContain('أعده خاصًّا')
      // ‏ومحطّةُ «النشر» في صفحة المنصّة لا تبقى «خاصًّا ثمّ تنشره بيدك»
      const posts = await (await app.request('/panel/channels/youtube', withSession(cookie), env)).text()
      expect(posts).not.toContain('يُرفع إلى قناتك خاصًّا')

      const id = await uploaded(cookie)
      const page = await (await everyPane((p) => app.request(p, withSession(cookie), env)))
      const row = page.slice(page.indexOf(`id="v-${id}"`), page.indexOf('</form>', page.indexOf(`/panel/uploads/${id}/posts`)))
      expect(row).toContain('متّصل · يُنشر للعامّة')
      expect(row).not.toContain('يصل خاصًّا')
      // ‏وصفحةُ Instagram لا مفتاحَ فيها: تنشر للعامّة دائمًا
      const ig = await (await app.request('/panel/channels/instagram?tab=setup', withSession(cookie), env)).text()
      expect(ig).not.toContain('id="reach"')
    })

    it('وإشعار جدولة المقطع يسكت عن YouTube بعد القلب، ويبقى لـ TikTok', async () => {
      await db.prepare(`INSERT INTO accounts (id, platform, kind, external_id, display_name, status) VALUES
        ('acc-yt', 'youtube', 'org', 'yt', 'قناة عمر', 'active'),
        ('acc-tt', 'tiktok', 'member', 'tt', 'omar', 'active')`).run()
      await writeSetting(db, 'youtube_public', 'true', 'test')
      const cookie = await login()
      const id = await uploaded(cookie)
      await post(cookie, `/panel/uploads/${id}/posts`, { caption: 'المعلم نقطة قرار', approve: 'on', platform: ['youtube', 'tiktok'] })
      const shown = (db.raw.prepare('SELECT id FROM posts').all() as { id: string }[]).map((x) => x.id)
      await post(cookie, `/panel/uploads/${id}/schedule`, { preset: 'tomorrow', post: shown })
      const page = await (await app.request('/panel', withSession(cookie), env)).text()
      expect(page).toContain('جُدول على YouTube وTikTok')
      expect(page).not.toContain('YouTube لا يُنشر للعامّة')
      expect(page).toContain('TikTok لا يُنشر للعامّة')
    })
  })

  /*
   * ‏**مراجعةُ D-190** — ما وُجد بعد البناء: «أعد كتابتها» لا تكتب، والاعتمادُ مؤشَّرٌ على نصّ
   * ‏النموذج، ومَن كتبها يضيع بانتهاء يومها، وكلفتُها لا تصل منشوراتها، وTikTok «للعامّة» وهو
   * ‏صندوق، والحدودُ لا تُقال قبل «أنشئ»، وإشعارُ الفكرة يضيع، وما دُفع في المردود لا يُقال.
   */
  describe('مراجعة D-190', () => {
    const CAPTIONS = {
      youtube_title: 'القيادة في أوّل مئة يوم',
      youtube_description: 'ما يقرّره القائد أوّلًا.\n\n#قيادة #Shorts',
      tiktok: 'أوّل مئة يوم تكتب ما بعدها. #قيادة #إدارة #حوكمة',
      instagram: 'من أين يبدأ القائد؟\n\n#قيادة #إدارة #حوكمة',
    }
    const rowOf = (page: string, id: string): string =>
      page.slice(page.indexOf(`id="v-${id}"`), page.indexOf('</form>', page.indexOf(`/panel/uploads/${id}/posts`)))
    const tiktokAccount = async (scopes: string): Promise<void> => {
      await db.prepare(`INSERT INTO accounts (id, platform, kind, external_id, display_name, status) VALUES ('acc-tt', 'tiktok', 'member', 'tt', 'omar', 'active')`).run()
      db.raw.prepare(`INSERT INTO tokens (account_id, access_enc, access_iv, expires_at, scopes) VALUES ('acc-tt', 'e', 'i', '2026-12-01T00:00:00Z', ?)`).run(scopes)
    }

    it('«أعد كتابتها» تحمل at ما على الشاشة فتكتب مرّةً — وإعادتُها لا تُكلّف، والاعتماد غير مؤشَّر', async () => {
      env['ANTHROPIC_API_KEY'] = 'sk-ant-test-0001'
      const net = anthropic(() => ({ ...CAPTIONS, tiktok: '' }))
      const cookie = await login()
      const id = await uploaded(cookie)
      await post(cookie, `/panel/uploads/${id}/captions`, { about: 'لقاء عن القيادة' })
      const at = (JSON.parse((await kv.get(`captions:${id}`))!) as { at: string }).at
      const row = rowOf(await (await everyPane((p) => app.request(p, withSession(cookie), env))), id)
      expect(row).toContain(`<input type="hidden" name="replace" value="${at}">`)
      expect(row).toContain('<input type="hidden" name="caption_model" value="claude-opus-5">')
      // ‏ونصُّ النموذج لا يُعتمَد بالافتراض (D-009): المربّعُ يؤشّره المالكُ بيده
      expect(row).toContain('<input type="checkbox" name="approve"> اعتمده الآن — راجعت النصوص')

      net.calls.length = 0
      anthropic(() => CAPTIONS)
      const again = anthropic(() => CAPTIONS)
      await post(cookie, `/panel/uploads/${id}/captions`, { about: 'لقاء عن القيادة', replace: at })
      expect(again.calls).toHaveLength(1)
      expect(ledger()).toHaveLength(2)
      expect((JSON.parse((await kv.get(`captions:${id}`))!) as { tiktok: string }).tiktok).toBe(CAPTIONS.tiktok)
      // ‏والنموذجُ نفسُه مرّةً ثانية: `at` قديمٌ فلا نداء
      await post(cookie, `/panel/uploads/${id}/captions`, { about: 'لقاء عن القيادة', replace: at })
      expect(again.calls).toHaveLength(1)
      expect(ledger()).toHaveLength(2)
      expect(await (await everyPane((p) => app.request(p, withSession(cookie), env)))).toContain('ولنصوص أخرى «أعد كتابتها» من صفّ المقطع')
    })

    it('والمنشورات من النصوص تحمل حصّتَها من كلفة كتابتها، ومحطّة الكتابة تقولها', async () => {
      env['ANTHROPIC_API_KEY'] = 'sk-ant-test-0001'
      anthropic(() => CAPTIONS)
      const cookie = await login()
      const id = await uploaded(cookie)
      await post(cookie, `/panel/uploads/${id}/captions`, { about: 'لقاء عن القيادة' })
      const paid = (db.raw.prepare('SELECT total FROM cost_ledger').get() as { total: number }).total
      await post(cookie, `/panel/uploads/${id}/posts`, {
        per_platform: '1', platform: ['youtube', 'tiktok', 'instagram'],
        title_youtube: CAPTIONS.youtube_title, caption_youtube: CAPTIONS.youtube_description,
        caption_tiktok: CAPTIONS.tiktok, caption_instagram: CAPTIONS.instagram, caption_model: 'claude-opus-5',
      })
      const rows = db.raw.prepare('SELECT id, model, cost_usd, status FROM posts').all() as { id: string; model: string; cost_usd: number; status: string }[]
      expect(rows).toHaveLength(3)
      // ‏بلا تأشيرٍ تُنشأ مسوّداتٍ تنتظر قرارَه
      expect(rows.every((r) => r.status === 'draft' && r.model === 'claude-opus-5')).toBe(true)
      const sum = rows.reduce((n, r) => n + r.cost_usd, 0)
      expect(sum).toBeCloseTo(paid, 9)
      expect(rows[0]!.cost_usd).toBeGreaterThan(0)
      const journey = await (await app.request(`/panel/journey/${rows[0]!.id}`, withSession(cookie), env)).text()
      expect(journey).toContain('claude-opus-5')
    })

    it('ويوم النصوص إن انتهى قبل «أنشئ»: المردود يبقى في حقوله، والمنشأ منسوب إلى النموذج لا إلى المالك', async () => {
      env['ANTHROPIC_API_KEY'] = 'sk-ant-test-0001'
      anthropic(() => CAPTIONS)
      const cookie = await login()
      const id = await uploaded(cookie)
      await post(cookie, `/panel/uploads/${id}/captions`, { about: 'لقاء عن القيادة' })
      await kv.delete(`captions:${id}`)
      await post(cookie, `/panel/uploads/${id}/posts`, {
        per_platform: '1', platform: ['tiktok'], caption_model: 'claude-opus-5',
        title_youtube: 'عنواني أنا', caption_youtube: 'وصفي', caption_tiktok: '', caption_instagram: 'نصّي',
      })
      expect(db.raw.prepare('SELECT COUNT(*) AS n FROM posts').get()).toEqual({ n: 0 })
      const row = rowOf(await (await everyPane((p) => app.request(p, withSession(cookie), env))), id)
      expect(row).toContain('value="عنواني أنا"')
      expect(row).toContain('نصّي</textarea>')

      await kv.delete(`captions:${id}`)
      await post(cookie, `/panel/uploads/${id}/posts`, {
        per_platform: '1', platform: ['tiktok'], caption_model: 'claude-opus-5', caption_tiktok: 'نصّ TikTok',
      })
      expect(db.raw.prepare('SELECT platform, model FROM posts').all()).toEqual([{ platform: 'tiktok', model: 'claude-opus-5' }])
      // ‏واسمٌ لا يُقبل لا يصير «owner»
      await kv.delete(`captions:${id}`)
      await post(cookie, `/panel/uploads/${id}/posts`, {
        per_platform: '1', platform: ['instagram'], caption_model: '<script>', caption_instagram: 'نصّ Instagram',
      })
      expect(db.raw.prepare(`SELECT model FROM posts WHERE platform = 'instagram'`).get()).toEqual({ model: 'captions:unknown' })
    })

    it('ونصوص فوق حدودها: الإشعار تحذير، والسبب تحت حقله، و«أنشئ» يُردّ بالسببين — والحدّ والعدّاد في كلّ حقل', async () => {
      env['ANTHROPIC_API_KEY'] = 'sk-ant-test-0001'
      anthropic(() => ({ ...CAPTIONS, youtube_title: 'ع'.repeat(120), tiktok: 'ن'.repeat(2300) }))
      const cookie = await login()
      const id = await uploaded(cookie)
      await post(cookie, `/panel/uploads/${id}/captions`, { about: 'لقاء عن القيادة' })
      const page = await (await everyPane((p) => app.request(p, withSession(cookie), env)))
      expect(page).toContain('وفي بعضها ما يُصلَح قبل الإنشاء')
      const row = rowOf(page, id)
      const title = row.slice(row.indexOf(`for="vyt-${id}"`), row.indexOf(`for="vyd-${id}"`))
      expect(title).toContain('YouTube تقبل 100')
      expect(title).toContain('aria-invalid="true"')
      const tiktok = row.slice(row.indexOf(`for="vtt-${id}"`), row.indexOf(`for="vig-${id}"`))
      expect(tiktok).toContain('TikTok تقبل 2200')
      expect(tiktok).toContain('حتّى 2200 محرف')
      expect(tiktok).toContain('data-cap-limit="2200" data-cap-unit="chars"')
      expect(row).toContain('data-cap-limit="5000" data-cap-unit="bytes"')
      expect(row).toContain('data-cap-count')

      await post(cookie, `/panel/uploads/${id}/posts`, {
        per_platform: '1', platform: ['youtube', 'tiktok'],
        title_youtube: 'ع'.repeat(120), caption_youtube: 'وصف', caption_tiktok: 'ن'.repeat(2300),
      })
      expect(db.raw.prepare('SELECT COUNT(*) AS n FROM posts').get()).toEqual({ n: 0 })
      const after = await (await everyPane((p) => app.request(p, withSession(cookie), env)))
      expect(after).toContain('YouTube تقبل 100')
      expect(after).toMatch(/لم يُنشأ منشور: [^<]*YouTube تقبل 100[^<]*TikTok: النصّ 2300 محرفًا/)
    })

    it('وجواب مردود بعد أن دُفع: الإشعار يقول كلفتَه وأنّ الإعادة تدفع', async () => {
      env['ANTHROPIC_API_KEY'] = 'sk-ant-test-0001'
      anthropic(() => 'ليس كائنا')
      const cookie = await login()
      const id = await uploaded(cookie)
      await post(cookie, `/panel/uploads/${id}/captions`, { about: 'لقاء عن القيادة' })
      expect(ledger()).toHaveLength(1)
      const page = await (await app.request('/panel', withSession(cookie), env)).text()
      expect(page).toContain('تعذّرت كتابة النصوص')
      expect(page).toContain('وكلّفت المحاولة')
      expect(page).toContain('والإعادة تدفع ثانيةً')
    })

    /*
     * ‏**وTikTok بحكم الناشر** (مراجعة D-190): قلبُ العلنيّ وحسابٌ بلا `video.publish` يُرسَل
     * ‏مقطعُه إلى الصندوق — وكانت أربعةُ مواضع تقول «يُنشر للعامّة» وإشعارُ الجدولة يسكت.
     */
    it('علنيّ TikTok المقلوب بلا video.publish يقول الصندوق في كلّ موضع — وبالنطاق يقول «للعامّة»', async () => {
      await tiktokAccount('user.info.basic,video.upload')
      const cookie = await login()
      const flip = await post(cookie, '/panel/settings', { key: 'tiktok_public', value: 'true', return: 'platform:tiktok:setup' })
      expect(where(flip)).toBe('/panel/channels/tiktok?tab=setup')
      const setup = await (await app.request('/panel/channels/tiktok?tab=setup', withSession(cookie), env)).text()
      expect(setup).toContain('حسابُك المربوط بلا video.publish')
      expect(setup).toContain('يصل الصندوق')
      expect(setup).toContain('أعده خاصًّا')
      const needs = await (await app.request('/panel/channels/tiktok', withSession(cookie), env)).text()
      expect(needs).toContain('يصل صندوق تطبيقك ثمّ تنشره بيدك')
      expect(needs).not.toContain('علنيّ فور موعده')

      const id = await uploaded(cookie)
      const row = rowOf(await (await everyPane((p) => app.request(p, withSession(cookie), env))), id)
      expect(row).not.toContain('يُنشر للعامّة')
      expect(row).toContain('متّصل · يصل صندوقَك')
      expect(row).toContain('href="/panel/channels/tiktok?tab=setup"')
      // ‏والنصُّ لا يصل الصندوق: يُقال تحت الحقل الواحد
      expect(row).toContain('وTikTok يصله المقطع بلا النصّ')

      await post(cookie, `/panel/uploads/${id}/posts`, { caption: 'المعلم نقطة قرار', approve: 'on', platform: ['tiktok'] })
      const shown = (db.raw.prepare('SELECT id FROM posts').all() as { id: string }[]).map((x) => x.id)
      await post(cookie, `/panel/uploads/${id}/schedule`, { preset: 'tomorrow', post: shown })
      const scheduled = await (await everyPane((p) => app.request(p, withSession(cookie), env)))
      expect(scheduled).toContain('جُدول على TikTok')
      expect(scheduled).toContain('قلبت النشر العلنيّ وحسابُك المربوط بلا video.publish')

      // ‏وبالنطاق: «للعامّة» كما قرّر، ولا ملاحظةَ صندوق
      db.raw.prepare(`UPDATE tokens SET scopes = 'user.info.basic video.upload video.publish' WHERE account_id = 'acc-tt'`).run()
      const id2 = await uploaded(cookie)
      const direct = rowOf(await (await everyPane((p) => app.request(p, withSession(cookie), env))), id2)
      expect(direct).toContain('متّصل · يُنشر للعامّة')
      expect(direct).not.toContain('بلا النصّ')
    })

    it('وقلب العلنيّ بلا النطاق يُقال تحذيرًا عند القلب نفسِه', async () => {
      await tiktokAccount('user.info.basic video.upload')
      const cookie = await login()
      await post(cookie, '/panel/settings', { key: 'tiktok_public', value: 'true', return: 'platform:tiktok:setup' })
      const page = await (await app.request('/panel/channels/tiktok?tab=setup', withSession(cookie), env)).text()
      expect(page).toContain('قُلب النشر على TikTok للعامّة، وحسابُك المربوط بلا video.publish')
      expect(page).not.toContain('صار النشر على TikTok للعامّة')
    })

    it('ونصّ TikTok المكتوب يُقال إنّه لا يصل الصندوق، ومعه زرّ نسخه', async () => {
      env['ANTHROPIC_API_KEY'] = 'sk-ant-test-0001'
      anthropic(() => CAPTIONS)
      await tiktokAccount('user.info.basic video.upload')
      const cookie = await login()
      const id = await uploaded(cookie)
      await post(cookie, `/panel/uploads/${id}/captions`, { about: 'لقاء عن القيادة' })
      const row = rowOf(await (await everyPane((p) => app.request(p, withSession(cookie), env))), id)
      const tiktok = row.slice(row.indexOf(`for="vtt-${id}"`), row.indexOf(`for="vig-${id}"`))
      expect(tiktok).toContain('يصل المقطع صندوق تطبيق TikTok بلا هذا النصّ')
      expect(tiktok).toContain(`data-copy="vtt-${id}"`)
    })

    it('وما يُختار بلا تأشير: السطر يقول الحكم قبل الضغط، وموضع السبب في النموذجين', async () => {
      env['ANTHROPIC_API_KEY'] = 'sk-ant-test-0001'
      const cookie = await login()
      const id = await uploaded(cookie)
      const page = await (await everyPane((p) => app.request(p, withSession(cookie), env)))
      const card = page.slice(page.indexOf('id="idea"'), page.indexOf('id="write"'))
      expect(card).toContain('غير المتّصلة تُكتب مسوّدتُها ولا تُجدوَل حتّى تربطها.')
      expect(card).toContain('data-pick-msg')
      const row = rowOf(page, id)
      expect(row).toContain('اختر منصّةً — وغير المتّصلة يُنشأ منشورُها ولا يُجدوَل حتّى تربطها.')
      expect(row).toContain('data-pick-msg')
    })

    /*
     * ‏**وإشعارُ الفكرة لا يضيع** (مراجعة D-190): مسوّدةُ LinkedIn القديمةُ خارجَ اللوح كانت تُرسل
     * ‏المالكَ إلى رحلتها قبل أن يُكتب الإشعار، فيضيع فشلُ X المدفوعُ معها.
     */
    it('فكرة مسوّدتُها القديمة خارج اللوح وX رُدّ بعد أن دُفع: الإشعار يُقرأ ويقول الكلفة', async () => {
      env['ANTHROPIC_API_KEY'] = 'sk-ant-test-0001'
      const idea = 'الحوكمة لا تبطئ القرار، تحميه'
      const old = '00000000-0000-4000-8000-000000000001'
      await db.prepare(`INSERT INTO accounts (id, platform, kind, external_id, display_name, status) VALUES ('acc-li', 'linkedin', 'member', 'sub', 'عمر', 'active')`).run()
      db.raw.prepare(`INSERT INTO posts (id, account_id, platform, type, text, status, idempotency_key, approved_by, approved_at, scheduled_at, created_at)
        VALUES (?, 'acc-li', 'linkedin', 'text', 'قديم', 'published', ?, 'o', '2026-01-01 00:00:00', '2026-01-02 00:00:00', '2026-01-01 00:00:00')`).run(old, await ideaKey(idea, 'linkedin'))
      for (let i = 0; i < 61; i++) {
        db.raw.prepare(`INSERT INTO posts (id, platform, type, text, status, idempotency_key) VALUES (?, 'x', 'text', 'ن', 'draft', ?)`)
          .run(`fill-${i}`, `fill:${i}`)
      }
      const net = anthropic(() => ({ text: 'ن'.repeat(400), rationale: 'ر' }))
      const cookie = await login()
      const r = await post(cookie, '/panel/drafts/idea', { idea, platform: ['linkedin', 'x'] })
      expect(net.calls).toHaveLength(1)
      expect(ledger()).toHaveLength(1)
      expect(where(r)).toBe('/panel#idea')
      const page = await (await app.request('/panel', withSession(cookie), env)).text()
      expect(page).toContain('تعذّرت X')
      expect(page).toContain('ودُفع ثمن المحاولة المردودة')
    })
  })
})

describe('«المظهر» و«النظام» في الإعدادات (D-221)', () => {
  it('أربعة أقسام (EASE-PLAN ز)، والمبدّلان بلا معرّف ثان، والآلة في «النظام» تحت «متقدّم»', async () => {
    const html = await (await app.request('/panel/settings', withSession(await login()), env)).text()
    const order = ['#appearance', '#limits', '#security-all', '#advanced'].map((h) => html.indexOf(`href="${h}"`))
    expect(order.every((i) => i > -1)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    const appearance = html.slice(html.indexOf('<div data-sub id="appearance">'), html.indexOf('<div data-sub id="limits">'))
    expect(appearance).toContain('data-theme="dark"')
    expect(appearance).toContain('data-density="compact"')
    expect(appearance).toContain('value="dashboard_tiles"')
    expect((html.match(/id="theme"/g) ?? []).length).toBeLessThanOrEqual(1)
    // ‏والأقسامُ القديمةُ معرّفاتٌ داخل أقسامها الجديدة، فمراسيها تصل
    const advanced = html.slice(html.indexOf('<div data-sub id="advanced">'))
    for (const id of ['system', 'providers', 'orgs']) expect(advanced, id).toContain(`<div id="${id}"`)
    expect(advanced).toContain('<details class="setup mt-5" id="dev"><summary>للمطوّر</summary>')
    const system = advanced.slice(advanced.indexOf('<div id="system"'), advanced.indexOf('<div id="providers"'))
    expect(system).toContain('id="machine"')
    expect(html.slice(html.indexOf('<div data-sub id="security-all">'))).toContain('<div id="activity"')
  })
})

/**
 * حسابُ الدخول يدير كلَّ المنظّمات (D-225): يرى قائمتَها، وينشئ منظّمةً بعلامتها
 * الأولى، وينتقل إليها — **ولا ينتقل إلى معرّفٍ لا يوجد**.
 */
describe('المنظّمات من حساب الدخول', () => {
  it('منظّمة المالك ظاهرة ونشطة', async () => {
    const cookie = await login()
    const html = await everyPane((p) => app.request(p, withSession(cookie), env))
    expect(html).toContain('منظّماتك')
    expect(html).toContain('منظّمتي')
    expect(html).toContain('النشطة')
  })

  it('ينشئ منظّمةً ومعها علامتُها، ثمّ ينتقل إليها', async () => {
    const cookie = await login()
    const body = new FormData()
    body.set('name', 'وكالة الأفق')
    body.set('kind', 'agency')
    const made = await app.request('/panel/orgs', withSession(cookie, { method: 'POST', body }), env)
    expect(made.status).toBe(303)
    const org = db.raw.prepare("SELECT id FROM orgs WHERE name = 'وكالة الأفق'").get() as { id: string }
    const brands = db.raw.prepare('SELECT COUNT(*) AS n FROM brands WHERE org_id = ?').get(org.id) as { n: number }
    expect(brands.n).toBe(1)

    const to = new FormData()
    to.set('org', org.id)
    const switched = await app.request('/panel/orgs/switch', withSession(cookie, { method: 'POST', body: to }), env)
    expect(switched.status).toBe(303)
    const id = cookie.split('=')[1]!
    expect(JSON.parse((await kv.get(`session:${id}`))!).org).toBe(org.id)
  })

  it('منظّمةٌ واحدةٌ بلا مبدّل، وبمنظّمتين يظهر المبدّلُ أعلى الرافدة ويعود الانتقالُ إلى الصفحة نفسِها', async () => {
    const cookie = await login()
    expect(await (await app.request('/panel', withSession(cookie), env)).text()).not.toContain('id="scope"')
    const body = new FormData()
    body.set('name', 'جمعيّة كفالة')
    body.set('kind', 'team')
    await app.request('/panel/orgs', withSession(cookie, { method: 'POST', body }), env)
    const org = db.raw.prepare("SELECT id FROM orgs WHERE name = 'جمعيّة كفالة'").get() as { id: string }

    const html = await (await app.request('/panel', withSession(cookie), env)).text()
    const scope = html.slice(html.indexOf('id="scope"'), html.indexOf('</details>', html.indexOf('id="scope"')))
    expect(scope).toContain('<b>منظّمتي</b>')
    expect(scope).toContain(`name="org" value="${org.id}"`)
    expect(scope).toContain('name="next" value="/panel"')
    expect(html).toContain('<span>المنظّمة</span><b>منظّمتي</b>')

    const to = new FormData()
    to.set('org', org.id)
    to.set('next', '/panel/posts#posts')
    const switched = await app.request('/panel/orgs/switch', withSession(cookie, { method: 'POST', body: to }), env)
    expect(switched.status).toBe(303)
    expect(switched.headers.get('Location')).toBe('/panel/posts#posts')
    // ‏ووجهةٌ خارج اللوحة لا تُتبَع
    to.set('next', 'https://evil.example/')
    const away = await app.request('/panel/orgs/switch', withSession(cookie, { method: 'POST', body: to }), env)
    expect(away.headers.get('Location')).toBe('/panel')
  })

  it('لا ينتقل إلى منظّمة غير موجودة', async () => {
    const cookie = await login()
    const to = new FormData()
    to.set('org', 'org_missing')
    await app.request('/panel/orgs/switch', withSession(cookie, { method: 'POST', body: to }), env)
    const id = cookie.split('=')[1]!
    expect(JSON.parse((await kv.get(`session:${id}`))!).org).toBeUndefined()
  })

  it('يرفض اسمًا فارغًا', async () => {
    const cookie = await login()
    const body = new FormData()
    body.set('name', '   ')
    body.set('kind', 'agency')
    await app.request('/panel/orgs', withSession(cookie, { method: 'POST', body }), env)
    expect((db.raw.prepare('SELECT COUNT(*) AS n FROM orgs').get() as { n: number }).n).toBe(1)
  })
})

describe('شريط اليوم الأوّل (D-227)', () => {
  it('أعلى الرئيسيّة حتّى يُفهَم أوّل مصدر، ثمّ يختفي', async () => {
    const cookie = await login()
    const before = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(before).toContain('<div class="first-band" aria-hidden="true">')
    expect(before).toContain('data-echo="deep"')
    const source = await seedSource('تقرير الأثر')
    await db.prepare('INSERT INTO content_items (id, source_id, summary, themes_json, worth_score) VALUES (?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), source, 'ملخّص', JSON.stringify({ hash: 'md5:a', themes: [] }), 7).run()
    const after = await (await app.request('/panel', withSession(cookie), env)).text()
    expect(after).not.toContain('class="first-band"')
  })
})

describe('الدخول برمز البريد (D-245)', () => {
  it('عنوان غير المالك يرى الردّ نفسه ولا يُرسَل إليه شيء', async () => {
    const mailer = fakeMailer()
    const scoped = { ...env, EMAIL: mailer }
    const ask = async (email: string): Promise<string> => {
      const body = new FormData()
      body.set('email', email)
      return (await app.request('/panel/login/code', { method: 'POST', body }, scoped)).text()
    }
    const stranger = await ask('stranger@example.com')
    expect(mailer.sent).toHaveLength(0)
    expect(stranger).toContain(CODE_SENT_NOTE)
    const owner = await ask('MilestonesImpact@gmail.com')
    expect(mailer.sent).toHaveLength(1)
    expect(owner).toContain(CODE_SENT_NOTE)
    expect(mailer.sent[0]!.to).toBe('milestonesimpact@gmail.com')
    expect(mailer.sent[0]!.from).toBe('noreply@basserh.com')
    // ‏والرمزُ لا يُكتب في سجلّ التدقيق
    const code = codeFrom(mailer.sent[0]!)
    const rows = await db.prepare('SELECT detail FROM audit_log').all<{ detail: string | null }>()
    expect(JSON.stringify(rows.results)).not.toContain(code)
  })

  /** ‏سقفٌ للعنوان قبل الرمز (D-270): عناوينُ بريدٍ شتّى من عنوانٍ واحد لا تفلت من سقف البريد الواحد. */
  it('وبعد عشرين طلبا من عنوان واحد يُردّ 429 ولا يُرسَل شيء', async () => {
    const mailer = fakeMailer()
    const scoped = { ...env, EMAIL: mailer }
    let last = 0
    for (let i = 0; i < 21; i += 1) {
      const body = new FormData()
      body.set('email', `s${i}@example.com`)
      last = (await app.request('/panel/login/code', { method: 'POST', body, headers: { 'CF-Connecting-IP': '203.0.113.9' } }, scoped)).status
    }
    expect(last).toBe(429)
    expect(mailer.sent).toHaveLength(0)
  })

  it('وطلب ثان في الدقيقة نفسها لا يرسل', async () => {
    const mailer = fakeMailer()
    const scoped = { ...env, EMAIL: mailer }
    for (let i = 0; i < 2; i += 1) {
      const body = new FormData()
      body.set('email', 'milestonesimpact@gmail.com')
      await app.request('/panel/login/code', { method: 'POST', body }, scoped)
    }
    expect(mailer.sent).toHaveLength(1)
  })

  it('وبعد عشرِ محاولاتٍ في اليوم يُغلق بابُ الرمز ولو صحّ (D-247)', async () => {
    await db.prepare("INSERT INTO auth_attempts (bucket, n, window_start) VALUES ('code:milestonesimpact@gmail.com', 10, datetime('now', '-2 hours'))").run()
    const response = await emailLogin(app, env)
    expect(response.status).toBe(429)
    expect(response.headers.get('Set-Cookie') ?? '').not.toContain('sada_session=')
    expect(await response.text()).toContain('ادخل بمفتاح المرور')
    const rows = await db.prepare("SELECT action FROM audit_log WHERE action = 'login.code.locked'").all()
    expect(rows.results).toHaveLength(1)
    await db.prepare("DELETE FROM auth_attempts WHERE bucket = 'code:milestonesimpact@gmail.com'").run()
  })

  it('والجلسة ثلاثة أيّام', async () => {
    const response = await emailLogin(app, env)
    expect(response.headers.get('Set-Cookie')).toContain(`Max-Age=${3 * 24 * 60 * 60}`)
  })
})

describe('لا رابطَ ميّتًا داخل اللوحة (EASE-PLAN أ-1)', () => {
  it('كلُّ مرساةٍ في كلّ صفحةٍ تصل إلى معرّفٍ موجود — في صفحتها أو في الصفحة التي انتقل إليها', async () => {
    const cookie = await login()
    const pages = [...PANEL_PAGES, '/panel/report', '/panel/tasks', '/panel/timeline']
    const html = new Map<string, string>()
    for (const p of pages) html.set(p, await (await app.request(p, withSession(cookie), env)).text())
    const ids = (page: string): Set<string> =>
      new Set([...(html.get(page) ?? '').matchAll(/\s(?:id|data-pane)="([^"]+)"/g)].map((m) => m[1]!))

    const dead: string[] = []
    for (const [page, body] of html) {
      for (const m of body.matchAll(/href="((?:\/panel[^"#?]*)?)(?:\?[^"#]*)?#([^"]+)"/g)) {
        const [, path, anchor] = m
        if (anchor === undefined || anchor === 'main') continue
        const here = path === '' || path === undefined ? page : path
        // ‏مرساةٌ في /panel انتقلت إلى صفحةٍ أخرى تُتبَع كما يتبعها الخادمُ والمتصفّح
        const target = here === '/panel' && !ids('/panel').has(anchor) ? (anchorPath(anchor) ?? here) : here
        if (!html.has(target)) continue
        if (!ids(target).has(anchor)) dead.push(`${page}: href="${path ?? ''}#${anchor}" ← لا #${anchor} في ${target}`)
      }
    }
    expect(dead).toEqual([])
  })
})

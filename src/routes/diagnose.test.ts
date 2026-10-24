/**
 * ثلاثةُ عيوبٍ ظهرت عند مالكٍ حقيقيّ — واختبارٌ لكلٍّ منها.
 *
 * **وكلُّها تُصنَّف «تجميلا» حتّى تُقاس**: سطرُ JSON يفهمه الكاتب،
 * وحظرٌ في الكونسول لا يُسقط صفحة، ومزوّدٌ يُضاف بالكتابة اليدويّة.
 * والثلاثةُ معا تجعل مالكا يقف بلا ما يفعل.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { emailLogin } from '../test/emailLogin'
import { toBase64 } from '../lib/crypto'
import { checkProviderUrl } from '../lib/ai/urlGuard'
import { OAuthError } from '../lib/oauth/exchange'
import { LINKEDIN } from '../lib/oauth/providers'
import { fakeDb, fakeFetch, fakeKv, type FakeDb } from '../test/fakes'
import { app } from '../index'

const TOKEN = 'Yk3pQ9vX2mLsA7nR4tWfZ8cB6dH1jG0e'
const KEY = toBase64(crypto.getRandomValues(new Uint8Array(32)))
const realFetch = globalThis.fetch

let db: FakeDb
let env: Record<string, unknown>
let csrf = ''

/** ‏البدءُ يشترط جلسةً كاملة (D-269)، فتُنشأ قبله كما يفعل المتصفّح. */
async function startWithSession(path: string): Promise<Response> {
  const login = await emailLogin(app, env)
  const cookie = (login.headers.get('Set-Cookie') ?? '').split(';')[0]!
  return await app.request(path, { headers: { Cookie: cookie } }, env)
}

beforeEach(() => {
  db = fakeDb()
  env = {
    SADA_ENV: 'staging',
    PUBLIC_BASE_URL: 'https://sada2.basserh.com',
    DRIVE_FOLDER_ID: 'folder',
    DB: db,
    KV: fakeKv(),
    TOKEN_ENC_KEY: KEY,
    ADMIN_TOKEN: TOKEN,
    LINKEDIN_CLIENT_ID: 'li-id',
    LINKEDIN_CLIENT_SECRET: 'li-secret',
  }
})

describe('١ · رفض نهاية الرمز يُشخَّص في صفحة', () => {
  /**
   * **أشدُّ العُطل إرباكا: نصفُ الدورة نجح.**
   *
   * شاشةُ الإذن مرّت، والمنصّةُ أعطت `code` — ثمّ ردّت تبديلَه بـ
   * `invalid_client`. وكان الجوابُ سطرَ JSON في متصفّح، **فلا يعرف
   * المالكُ أين يفتّش** — ويفتّش في المنتَجات والنطاقات، وليس فيها
   * العطل.
   */
  it('invalid_client يُعرَض صفحةً تسمّي السبب وتقول ما يُفعَل', async () => {
    globalThis.fetch = fakeFetch({
      [LINKEDIN.tokenUrl]: { status: 401, json: { error: 'invalid_client' } },
    })
    try {
      const start = await startWithSession('/oauth/linkedin/start')
      const state = new URL(start.headers.get('location') ?? '').searchParams.get('state') ?? ''
      const response = await app.request(
        `/oauth/linkedin/callback?code=c&state=${encodeURIComponent(state)}`,
        {},
        env,
      )

      expect(response.status).toBe(502)
      expect(response.headers.get('Content-Type')).toContain('text/html')
      const body = await response.text()
      expect(body).toContain('invalid_client')
      // يسمّي السببَ الأشيع صراحةً
      expect(body).toContain('أأُعيد إنشاء التطبيق؟')
      // **ويصرف عن التفتيش في الموضع الخطأ**
      expect(body).toContain('لا تفتّش في تبويب Products')
      // ولا يُعرَض سطرُ JSON
      expect(body).not.toContain('"oauth_failed"')
    } finally {
      globalThis.fetch = realFetch
    }
  })

  /**
   * **D-054 التقط الوصفَ في ساق الإذن وحدها.**
   *
   * وساقُ تبديل الرمز بقيت تقرأ `error` وتُهمل `error_description` —
   * **وهي الساقُ التي تفشل بعد أن ينجح كلُّ شيءٍ قبلها**، فأحوجُ ما
   * تكون إلى بيان. وبلا وصفٍ لا يُفرَّق بين سرٍّ خاطئ ومعرّفٍ خاطئ.
   */
  it('ووصف المنصّة يُعرَض حرفا — وكان يُرمى', async () => {
    globalThis.fetch = fakeFetch({
      [LINKEDIN.tokenUrl]: {
        status: 401,
        json: {
          error: 'invalid_client',
          error_description: 'Client authentication failed',
        },
      },
    })
    try {
      const start = await startWithSession('/oauth/linkedin/start')
      const state = new URL(start.headers.get('location') ?? '').searchParams.get('state') ?? ''
      const body = await (
        await app.request(
          `/oauth/linkedin/callback?code=c&state=${encodeURIComponent(state)}`,
          {},
          env,
        )
      ).text()
      expect(body).toContain('Client authentication failed')
    } finally {
      globalThis.fetch = realFetch
    }
  })

  /**
   * **يحسم سؤالا لا يُحسَم بغيره**: أهو تطبيقٌ آخرُ أصلا؟
   *
   * والقيمتان علنيّتان — المعرّفُ معروضٌ في بوّابة المنصّة، والرابطُ
   * يظهر في شريط العنوان عند كلّ دورة.
   */
  it('ويُعرَض ما أُرسل: المعرّف ورابط العودة', async () => {
    globalThis.fetch = fakeFetch({
      [LINKEDIN.tokenUrl]: { status: 401, json: { error: 'invalid_client' } },
    })
    try {
      const start = await startWithSession('/oauth/linkedin/start')
      const state = new URL(start.headers.get('location') ?? '').searchParams.get('state') ?? ''
      const body = await (
        await app.request(
          `/oauth/linkedin/callback?code=c&state=${encodeURIComponent(state)}`,
          {},
          env,
        )
      ).text()
      expect(body).toContain('li-id')
      expect(body).toContain('https://sada2.basserh.com/oauth/linkedin/callback')
    } finally {
      globalThis.fetch = realFetch
    }
  })

  /**
   * **ولا يُعرَض السرُّ ولا قناعُه ولا بصمتُه.**
   *
   * هذه الصفحةُ ليست خلف جلسة: **من أتمّ إذنا عند المنصّة يبلغها**.
   * وقناعُ السرّ يكشف أوّلَه وآخرَه، فموضعُه لوحُ القنوات خلف الدخول.
   */
  it('ولا يظهر السرّ ولا قناعُه في صفحة ليست خلف دخول', async () => {
    globalThis.fetch = fakeFetch({
      [LINKEDIN.tokenUrl]: { status: 401, json: { error: 'invalid_client' } },
    })
    try {
      const start = await startWithSession('/oauth/linkedin/start')
      const state = new URL(start.headers.get('location') ?? '').searchParams.get('state') ?? ''
      const body = await (
        await app.request(
          `/oauth/linkedin/callback?code=c&state=${encodeURIComponent(state)}`,
          {},
          env,
        )
      ).text()
      expect(body).not.toContain('li-secret')
      // ولا قناعُه: أوّلُ أربعةٍ وآخرُ أربعة
      expect(body).not.toContain('li-s…cret')
    } finally {
      globalThis.fetch = realFetch
    }
  })

  it('ورمز المزوّد يُحمَل حقلا لا يُستخرَج من نصّ عربيّ', () => {
    const error = new OAuthError('linkedin: رفض نهاية الرمز (invalid_client)', 401, 'invalid_client')
    expect(error.code).toBe('invalid_client')
  })

  /** سرٌّ غيرُ مضبوطٍ عطلُ تشغيلٍ لا رفضُ منصّة — ويبقى JSON بحالته. */
  it('وسرّ ناقص يبقى 503 ولا يُلبَس ثوب الرفض', async () => {
    const response = await app.request(
      '/oauth/linkedin/callback?code=c&state=s',
      {},
      { ...env, LINKEDIN_CLIENT_SECRET: '' },
    )
    expect(response.status).not.toBe(502)
  })
})

describe('٢ · رمز التبويب', () => {
  /**
   * **الصيغةُ كانت `data:image/svg+xml;utf8,` — و«;utf8» ليست معاملا.**
   *
   * فرفضها فايرفوكس وسقط إلى `/favicon.ico`، ولا مسارَ له — فردَّ
   * الخادمُ ٤٠٤ يحمل `Cross-Origin-Resource-Policy: same-origin`،
   * **فظهر في الكونسول حظرٌ يبدو عطلَ أمنٍ وهو حرفان في نصّ**.
   */
  it('الوثيقة تحمل data URI بمعامل charset صحيح', async () => {
    const body = await (await app.request('/panel', {}, env)).text()
    expect(body).toContain('data:image/svg+xml;charset=utf-8,')
    expect(body).not.toContain('svg+xml;utf8,')
  })

  it('و/favicon.ico له مسار يردّ صورةً لا 404', async () => {
    const response = await app.request('/favicon.ico', {}, env)
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toContain('image/svg+xml')
    expect(await response.text()).toContain('<svg')
  })

  /** والرمزُ علامةٌ عامّة — فيُسمَح بها عبر الأصول، كمسار الوسائط. */
  it('ويحمل CORP يسمح — والتوسعة على هذا المسار وحده', async () => {
    const icon = await app.request('/favicon.ico', {}, env)
    expect(icon.headers.get('Cross-Origin-Resource-Policy')).toBe('cross-origin')

    const health = await app.request('/health', {}, env)
    expect(health.headers.get('Cross-Origin-Resource-Policy')).toBe('same-origin')
  })
})

describe('وعطب أكبر كشفه الاختبار نفسُه', () => {
  /**
   * **الطبقةُ العامّة كانت تدهس ما يضعه المسار.**
   *
   * ومسارُ الوسائط الموقَّع (D-050) يضع
   * `Cross-Origin-Resource-Policy: cross-origin` **منذ كُتب — ولم
   * تخرج مرّةً واحدة**. ولا اختبارَ كان يقرؤها، **فبدا أنّها تعمل**:
   * لا عطل، ولا سطرَ في السجلّ — سطرُ شيفرةٍ يوهم بأنّه يفعل شيئا.
   *
   * والاختبارُ هنا لا يفحص الوسائط، **يفحص أنّ المسار يغلب الطبقة** —
   * فأيُّ ترويسةٍ يضعها مسارٌ من بعدُ تخرج كما وُضعت.
   */
  it('ما يضعه المسار يغلب ما تملؤه الطبقة العامّة', async () => {
    const icon = await app.request('/favicon.ico', {}, env)
    expect(icon.headers.get('Cross-Origin-Resource-Policy')).toBe('cross-origin')
  })

  it('وما لا يضعه مسار يُملأ من الطبقة كما كان', async () => {
    const health = await app.request('/health', {}, env)
    expect(health.headers.get('Strict-Transport-Security')).toContain('max-age=31536000')
    expect(health.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(health.headers.get('Referrer-Policy')).toBe('no-referrer')
    expect(health.headers.get('Cross-Origin-Resource-Policy')).toBe('same-origin')
  })

  /** و٤٠٤ ليست بابا مفتوحا: الترويساتُ تصلها كما تصل غيرَها. */
  it('و٤٠٤ تحمل ترويسات الأمان', async () => {
    const missing = await app.request('/لا-شيء', {}, env)
    expect(missing.status).toBe(404)
    expect(missing.headers.get('X-Content-Type-Options')).toBe('nosniff')
  })
})

describe('٣ · عنوان فيه قالب لم يُملأ', () => {
  /**
   * **يمرّ الحارسَ ثمّ يفشل عند أوّل نداء.**
   *
   * `https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/v1`
   * مضيفُه صحيحٌ وبروتوكولُه https — **فلا شيءَ في الحارس يردّه**،
   * ويُحفَظ، ويُرسَل المفتاحُ إلى مسارٍ لا وجودَ له.
   */
  it('يُردّ ولا يُحفَظ', () => {
    const verdict = checkProviderUrl(
      'https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/v1',
    )
    expect(verdict.ok).toBe(false)
    if (verdict.ok) return
    expect(verdict.reason).toContain('قالب لم يُملأ')
  })

  it('والعنوان نفسُه مملوءا يمرّ', () => {
    const verdict = checkProviderUrl(
      'https://api.cloudflare.com/client/v4/accounts/c6ea7ba30984d494a1a78efea6ddc9a0/ai/v1',
    )
    expect(verdict.ok).toBe(true)
    if (!verdict.ok) return
    expect(verdict.host).toBe('api.cloudflare.com')
  })

  it('ولا يُردّ عنوان سليم بلا قوسين', () => {
    expect(checkProviderUrl('https://api.groq.com/openai/v1').ok).toBe(true)
  })
})

describe('ونموذج Cloudflare في اللوحة', () => {
  async function panelBody(cfAccount?: string): Promise<string> {
    const scoped = cfAccount === undefined ? env : { ...env, CF_AI_ACCOUNT_ID: cfAccount }
    const login = await emailLogin(app, scoped)
    const cookie = (login.headers.get('Set-Cookie') ?? '').split(';')[0]!
    return (await app.request('/panel/settings', { headers: { Cookie: cookie } }, scoped)).text()
  }

  it('يُعرَض، ومعرّف الحساب يُملأ وحده حين يُعرَف', async () => {
    const body = await panelBody('acc-123')
    expect(body).toContain('Cloudflare')
    expect(body).toContain('accounts/acc-123/ai/v1')
    expect(body).toContain('Workers AI')
  })

  /** واللوحةُ تعرف المعرّف — فلا يُطلَب من المالك أن يبحث عنه. */
  it('وبلا معرّف يبقى القالب ظاهرا ويُقال إنّه لن يُحفَظ', async () => {
    const body = await panelBody()
    expect(body).toContain('{ACCOUNT_ID}')
    expect(body).toContain('لن يُحفَظ')
  })

  /** والمفتاحُ رمزُ Cloudflare لا مفتاحُ مزوّدٍ آخر — ويُقال. */
  it('ويُقال أيّ مفتاح يلزم', async () => {
    expect(await panelBody('acc-123')).toContain('Workers AI · Read')
  })
})

describe('فحص الزوج من اللوحة — الأداة التي تُنهي التخمين', () => {
  async function login(): Promise<string> {
    const response = await emailLogin(app, env)
    const cookie = (response.headers.get('Set-Cookie') ?? '').split(';')[0]!
    const page = await app.request('/panel', { headers: { Cookie: cookie } }, env)
    csrf = /name="_csrf" value="([^"]+)"/.exec(await page.text())?.[1] ?? ''
    return cookie
  }

  async function probe(cookie: string): Promise<string> {
    const form = new FormData()
    form.set('platform', 'linkedin')
    form.set('_csrf', csrf)
    await app.request(
      '/panel/channels/app/verify',
      { method: 'POST', body: form, headers: { Cookie: cookie } },
      env,
    )
    // الإشعارُ يُقرأ من الصفحة التالية كما يقرؤه المالك
    return (await app.request('/panel/settings', { headers: { Cookie: cookie } }, env)).text()
  }

  it('«السرّ مرفوض» حين تردّ المنصّة invalid_client — ومعه المعرّف', async () => {
    globalThis.fetch = fakeFetch({
      [LINKEDIN.tokenUrl]: {
        status: 401,
        json: { error: 'invalid_client', error_description: 'Client authentication failed' },
      },
    })
    try {
      const body = await probe(await login())
      expect(body).toContain('السرّ مرفوض')
      expect(body).toContain('Client authentication failed')
      expect(body).toContain('li-id')
    } finally {
      globalThis.fetch = realFetch
    }
  })

  /** **والمعرّفُ يُفرَد عن السرّ** — فلا يفتّش المالكُ في الحقلين معا. */
  it('و«المعرّف مجهول» حين تردّ invalid_client_id', async () => {
    globalThis.fetch = fakeFetch({
      [LINKEDIN.tokenUrl]: {
        status: 400,
        json: {
          error: 'invalid_client_id',
          error_description: 'The passed in client_id is invalid "li-id"',
        },
      },
    })
    try {
      const body = await probe(await login())
      expect(body).toContain('المعرّف نفسُه مجهول')
    } finally {
      globalThis.fetch = realFetch
    }
  })

  /** وهذا هو الجوابُ الذي يبرّئ الزوجَ ويوجّه البحثَ إلى غيره. */
  it('و«مقبول» حين يجوز التوثيق', async () => {
    globalThis.fetch = fakeFetch({
      [LINKEDIN.tokenUrl]: { status: 200, json: { access_token: 'app-token' } },
    })
    try {
      const body = await probe(await login())
      expect(body).toContain('الزوج مقبول')
      expect(body).toContain('ليست في المعرّف ولا في السرّ')
    } finally {
      globalThis.fetch = realFetch
    }
  })

  it('ولا يُدَّعى حكم حين لا يُفهَم الجواب', async () => {
    globalThis.fetch = (async () =>
      new Response('<html>', { status: 502 })) as unknown as typeof fetch
    try {
      expect(await probe(await login())).toContain('لم يُحسَم الفحص')
    } finally {
      globalThis.fetch = realFetch
    }
  })

  /** **ولا يُسرَّب السرُّ في إشعارٍ يُعرَض ويُسجَّل** (D-005). */
  it('ولا يظهر السرّ في الإشعار', async () => {
    globalThis.fetch = fakeFetch({
      [LINKEDIN.tokenUrl]: { status: 401, json: { error: 'invalid_client' } },
    })
    try {
      expect(await probe(await login())).not.toContain('li-secret')
    } finally {
      globalThis.fetch = realFetch
    }
  })

  it('وبلا أسرار محفوظة يُقال ذلك ولا يُنادى أحد', async () => {
    const bare = { ...env, LINKEDIN_CLIENT_ID: '', LINKEDIN_CLIENT_SECRET: '' }
    const login = await emailLogin(app, bare)
    const cookie = (login.headers.get('Set-Cookie') ?? '').split(';')[0]!
    const page = await app.request('/panel', { headers: { Cookie: cookie } }, bare)
    const token = /name="_csrf" value="([^"]+)"/.exec(await page.text())?.[1] ?? ''

    const form = new FormData()
    form.set('platform', 'linkedin')
    form.set('_csrf', token)
    await app.request(
      '/panel/channels/app/verify',
      { method: 'POST', body: form, headers: { Cookie: cookie } },
      bare,
    )
    const after = await (await app.request('/panel', { headers: { Cookie: cookie } }, bare)).text()
    expect(after).toContain('لا أسرار محفوظة')
  })
})

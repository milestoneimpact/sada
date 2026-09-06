/**
 * اختبار المسار كاملا: من التحويل إلى شاشة الموافقة، إلى تخزين رمز مشفر.
 * الشبكة مزيفة، وما عداها حقيقي — المسار نفسه، والقاعدة نفسها، والتشفير نفسه.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { toBase64 } from '../lib/crypto'
import { loadTokens } from '../lib/tokens'
import { LINKEDIN, X } from '../lib/oauth/providers'
import { IMPLEMENTED, PROVIDERS, ROUTES, type TaskName } from '../lib/ai/registry'
import { fakeDb, fakeFetch, fakeKv, type FakeDb } from '../test/fakes'
import { app } from '../index'

const KEY = toBase64(crypto.getRandomValues(new Uint8Array(32)))
const realFetch = globalThis.fetch

let db: FakeDb
let kv: ReturnType<typeof fakeKv>
let env: Record<string, unknown>

beforeEach(() => {
  db = fakeDb()
  kv = fakeKv()
  env = {
    SADA_ENV: 'staging',
    PUBLIC_BASE_URL: 'https://sada2.basserh.com',
    DRIVE_FOLDER_ID: 'folder-test',
    DB: db,
    KV: kv,
    TOKEN_ENC_KEY: KEY,
    LINKEDIN_CLIENT_ID: 'li-id',
    LINKEDIN_CLIENT_SECRET: 'li-secret',
    X_CLIENT_ID: 'x-id',
    X_CLIENT_SECRET: 'x-secret',
  }
})

afterEach(() => {
  globalThis.fetch = realFetch
})

/** يمرّ بـ start ويعيد قيمة state التي أصدرها الخادم. */
async function startAndCaptureState(
  platform: 'linkedin' | 'x',
  scope?: 'identity',
): Promise<{
  state: string
  location: URL
}> {
  const response = await app.request(
    `/oauth/${platform}/start${scope === undefined ? '' : `?scope=${scope}`}`,
    {},
    env,
  )
  expect(response.status).toBe(302)
  const location = new URL(response.headers.get('location') ?? '')
  return { state: location.searchParams.get('state') ?? '', location }
}

describe('GET /oauth/:platform/start', () => {
  it('يحوّل إلى شاشة موافقة المنصة بكل ما يلزم', async () => {
    const { location } = await startAndCaptureState('linkedin')
    expect(`${location.origin}${location.pathname}`).toBe(LINKEDIN.authorizeUrl)
    expect(location.searchParams.get('response_type')).toBe('code')
    expect(location.searchParams.get('client_id')).toBe('li-id')
    expect(location.searchParams.get('code_challenge_method')).toBe('S256')
    expect(location.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(location.searchParams.get('scope')).toBe('openid profile w_member_social')
  })

  it('يبني رابط العودة من نطاق البيئة لا من ثابت', async () => {
    const { location } = await startAndCaptureState('x')
    expect(location.searchParams.get('redirect_uri')).toBe(
      'https://sada2.basserh.com/oauth/x/callback',
    )
    expect(`${location.origin}${location.pathname}`).toBe(X.authorizeUrl)
  })

  it('لا يضع verifier في الرابط — الخادم وحده يحتفظ به', async () => {
    const { location } = await startAndCaptureState('x')
    expect(location.search).not.toContain('code_verifier')
  })

  it('يعطي state جديدا في كل مرة', async () => {
    const first = await startAndCaptureState('x')
    const second = await startAndCaptureState('x')
    expect(first.state).not.toBe(second.state)
  })

  it('يرد 404 لمنصة غير معروفة', async () => {
    const response = await app.request('/oauth/facebook/start', {}, env)
    expect(response.status).toBe(404)
  })

  it('يرد 503 حين ينقص سر، ولا يذكر قيمة', async () => {
    const response = await app.request('/oauth/x/start', {}, { ...env, X_CLIENT_SECRET: '' })
    expect(response.status).toBe(503)
    const body = await response.text()
    expect(body).not.toContain('x-secret')
  })
})

describe('GET /oauth/:platform/callback', () => {
  function stubNetwork(): void {
    globalThis.fetch = fakeFetch({
      [LINKEDIN.tokenUrl]: {
        json: {
          access_token: 'li-access',
          refresh_token: 'li-refresh',
          expires_in: 5_184_000,
          refresh_token_expires_in: 31_536_000,
          scope: 'openid profile w_member_social',
        },
      },
      [LINKEDIN.identityUrl]: { json: { sub: 'urn:li:person:abc', name: 'عمر' } },
      [X.tokenUrl]: { json: { access_token: 'x-access', expires_in: 7200 } },
      [X.identityUrl]: { json: { data: { id: '4242', name: 'Omar', username: 'omar' } } },
    })
  }

  it('يربط الحساب ويخزن الرمز مشفرا', async () => {
    stubNetwork()
    const { state } = await startAndCaptureState('linkedin')
    const response = await app.request(
      `/oauth/linkedin/callback?code=the-code&state=${encodeURIComponent(state)}`,
      {},
      env,
    )
    expect(response.status).toBe(200)
    // صفحةٌ لا سطرُ JSON (D-045): من يصل هنا إنسانٌ ينظر لا برنامجٌ يقرأ
    const body = await response.text()
    expect(response.headers.get('Content-Type')).toContain('text/html')
    expect(body).toContain('عمر')
    // وما مُنح معروضٌ بالاسم — لا يُترك ليُكتشَف عند أوّل نشرٍ يُردّ
    expect(body).toContain('w_member_social')

    const stored = await loadTokens(db, KEY, 'linkedin:member:urn:li:person:abc')
    expect(stored?.accessToken).toBe('li-access')
    expect(stored?.refreshToken).toBe('li-refresh')
  })

  it('لا يعيد رمزا في الاستجابة إطلاقا', async () => {
    stubNetwork()
    const { state } = await startAndCaptureState('x')
    const response = await app.request(`/oauth/x/callback?code=c&state=${state}`, {}, env)
    const body = await response.text()
    expect(body).not.toContain('x-access')
    expect(body).not.toContain('x-secret')
  })

  it('يرفض إعادة استعمال نفس state — الحاجز أمام الإعادة', async () => {
    stubNetwork()
    const { state } = await startAndCaptureState('x')
    const first = await app.request(`/oauth/x/callback?code=c&state=${state}`, {}, env)
    expect(first.status).toBe(200)
    const second = await app.request(`/oauth/x/callback?code=c&state=${state}`, {}, env)
    expect(second.status).toBe(400)
    expect((await second.json()) as unknown).toEqual({ error: 'invalid_state' })
  })

  it('يرفض state لم يصدر منا', async () => {
    stubNetwork()
    const response = await app.request('/oauth/x/callback?code=c&state=مزور', {}, env)
    expect(response.status).toBe(400)
  })

  it('يرفض state أصدر لمنصة أخرى', async () => {
    stubNetwork()
    const { state } = await startAndCaptureState('x')
    const response = await app.request(`/oauth/linkedin/callback?code=c&state=${state}`, {}, env)
    expect(response.status).toBe(400)
    expect((await response.json()) as unknown).toEqual({ error: 'state_platform_mismatch' })
  })

  it('يبلغ رفض المستخدم للموافقة كما هو، لا كعطل', async () => {
    const response = await app.request(
      '/oauth/x/callback?error=access_denied&state=s',
      {},
      env,
    )
    expect(response.status).toBe(400)
    const body = await response.text()
    // ورفضُ المستخدم يُقال قرارا لا عطلا: لا تشخيصَ ولا خطوات
    expect(body).toContain('أُلغي')
    expect(body).toContain('لم يُحفَظ شيء')
    expect(body).not.toContain('نطاقٌ لم يُمنَح')
  })

  it('ورفضُ نطاقٍ يُشخَّص بالاسم ومصدرِه — لا يُخلَط برفض المستخدم', async () => {
    // العلّةُ التي وُلد منها D-045: الجوابُ كان
    // { error: consent_denied, reason: unauthorized_scope_error } وحده
    const { state } = await startAndCaptureState('linkedin')
    const response = await app.request(
      `/oauth/linkedin/callback?error=unauthorized_scope_error&state=${encodeURIComponent(state)}`,
      {},
      env,
    )
    expect(response.status).toBe(400)
    const body = await response.text()
    expect(body).toContain('unauthorized_scope_error')
    // النطاقُ ومَن يمنحه بالاسم كما يُرى في البوّابة
    expect(body).toContain('w_member_social')
    expect(body).toContain('Share on LinkedIn')
    // ومخرجٌ لا شاشةُ عطلٍ مغلقة
    expect(body).toContain('/oauth/linkedin/start?scope=identity')
    // ولا يُتّهم السرُّ وهو بريء
    expect(body).toContain('لا تُعِد توليدَ السرّ')
  })

  it('ولا يُعرَض مخرجُ الهويّة إن كانت هي التي رُفضت', async () => {
    const { state } = await startAndCaptureState('linkedin', 'identity')
    const response = await app.request(
      `/oauth/linkedin/callback?error=unauthorized_scope_error&state=${encodeURIComponent(state)}`,
      {},
      env,
    )
    const body = await response.text()
    expect(body).not.toContain('scope=identity')
  })

  it('يرد 400 حين يغيب code', async () => {
    const response = await app.request('/oauth/x/callback?state=s', {}, env)
    expect(response.status).toBe(400)
  })

  it('يرد 502 حين ترفض المنصة الرمز، ولا يخزن شيئا', async () => {
    const { state } = await startAndCaptureState('x')
    globalThis.fetch = fakeFetch({
      [X.tokenUrl]: { status: 400, json: { error: 'invalid_grant' } },
    })
    const response = await app.request(`/oauth/x/callback?code=c&state=${state}`, {}, env)
    expect(response.status).toBe(502)
    const count = db.raw.prepare('SELECT count(*) AS n FROM tokens').get() as { n: number }
    expect(count.n).toBe(0)
  })

  it('يستهلك state حتى حين يفشل التبديل — لا يعاد استعماله', async () => {
    const { state } = await startAndCaptureState('x')
    globalThis.fetch = fakeFetch({
      [X.tokenUrl]: { status: 400, json: { error: 'invalid_grant' } },
    })
    await app.request(`/oauth/x/callback?code=c&state=${state}`, {}, env)
    expect(kv.size()).toBe(0)
  })

  it('يربط حساب X بمعرفه لا باسمه', async () => {
    stubNetwork()
    const { state } = await startAndCaptureState('x')
    const response = await app.request(`/oauth/x/callback?code=c&state=${state}`, {}, env)
    const body = await response.text()
    expect(body).toContain('Omar')
  })

  it('إعادة الربط لا تنشئ حسابا ثانيا', async () => {
    stubNetwork()
    for (let i = 0; i < 2; i += 1) {
      const { state } = await startAndCaptureState('linkedin')
      stubNetwork()
      await app.request(`/oauth/linkedin/callback?code=c&state=${state}`, {}, env)
    }
    const count = db.raw.prepare('SELECT count(*) AS n FROM accounts').get() as { n: number }
    expect(count.n).toBe(1)
  })
})

describe('POST /admin/scan — الحارس قبل أيّ عمل', () => {
  const TOKEN = 'Yk3pQ9vX2mLsA7nR4tWfZ8cB6dH1jG0e'

  /** يرصد أيّ خروج إلى الشبكة: الحارس يجب أن يمنعه قبل وقوعه. */
  function watchNetwork(): { calls: number } {
    const seen = { calls: 0 }
    globalThis.fetch = ((): Promise<Response> => {
      seen.calls += 1
      return Promise.resolve(new Response('{}'))
    }) as typeof fetch
    return seen
  }

  it('يرد 503 ولا ينادي Google حين لا ADMIN_TOKEN — مغلق افتراضا', async () => {
    const net = watchNetwork()
    const response = await app.request('/admin/scan', { method: 'POST' }, env)
    expect(response.status).toBe(503)
    expect((await response.json()) as Record<string, unknown>).toMatchObject({
      error: 'admin_disabled',
    })
    expect(net.calls).toBe(0)
  })

  it('يرد 401 لرمز خطأ ولا ينادي Google', async () => {
    const net = watchNetwork()
    const response = await app.request(
      '/admin/scan',
      { method: 'POST', headers: { Authorization: 'Bearer wrong-token-entirely' } },
      { ...env, ADMIN_TOKEN: TOKEN },
    )
    expect(response.status).toBe(401)
    expect(net.calls).toBe(0)
  })

  it('يميّز غياب الترويسة عن مخالفة الرمز — الأول لا يعطي طولا', async () => {
    const bare = await app.request(
      '/admin/scan',
      { method: 'POST' },
      { ...env, ADMIN_TOKEN: TOKEN },
    )
    expect(bare.status).toBe(401)
    const bareBody = (await bare.json()) as Record<string, unknown>
    expect(bareBody['error']).toBe('no_authorization_header')
    expect(bareBody['presented_length']).toBeUndefined()
  })

  it('يعيد طول ما أرسله المنادي ليكشف القوسين والمسافة', async () => {
    const response = await app.request(
      '/admin/scan',
      { method: 'POST', headers: { Authorization: `Bearer <${TOKEN}>` } },
      { ...env, ADMIN_TOKEN: TOKEN },
    )
    expect(response.status).toBe(401)
    const body = (await response.json()) as Record<string, unknown>
    expect(body['error']).toBe('unauthorized')
    expect(body['presented_length']).toBe(TOKEN.length + 2)
  })

  it('لا يذكر قيمة الرمز في أيّ ردّ', async () => {
    const denied = await app.request(
      '/admin/scan',
      { method: 'POST', headers: { Authorization: 'Bearer wrong' } },
      { ...env, ADMIN_TOKEN: TOKEN },
    )
    expect(await denied.text()).not.toContain(TOKEN)
  })

  it('يمرّر الرمز الصحيح إلى المسح — فيتجاوز الحارس ويعطل على المصدر', async () => {
    // بلا GOOGLE_SA_JSON صالح يفشل المسح بـ 502 لا بـ 401: دليل أن
    // الحارس اجتيز فعلا، وأن ما بعده هو ما تعطّل
    const response = await app.request(
      '/admin/scan',
      { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` } },
      { ...env, ADMIN_TOKEN: TOKEN, GOOGLE_SA_JSON: 'ليس json' },
    )
    expect(response.status).toBe(502)
    expect((await response.json()) as Record<string, unknown>).toMatchObject({
      error: 'scan_failed',
    })
  })
})

describe('POST /admin/analyze/:sourceId — الحارس نفسه', () => {
  const TOKEN = 'Yk3pQ9vX2mLsA7nR4tWfZ8cB6dH1jG0e'

  it('يرد 503 بلا ADMIN_TOKEN — النداء يكلّف مالا فلا يُترك مفتوحا', async () => {
    const response = await app.request('/admin/analyze/s1', { method: 'POST' }, env)
    expect(response.status).toBe(503)
  })

  it('يرد 401 لرمز خطأ', async () => {
    const response = await app.request(
      '/admin/analyze/s1',
      { method: 'POST', headers: { Authorization: 'Bearer wrong' } },
      { ...env, ADMIN_TOKEN: TOKEN },
    )
    expect(response.status).toBe(401)
  })

  it('بالرمز الصحيح يمضي إلى التحليل — ومصدرٌ مفقود ليس عطل خادم', async () => {
    const response = await app.request(
      '/admin/analyze/لا-وجود-له',
      { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` } },
      { ...env, ADMIN_TOKEN: TOKEN },
    )
    expect(response.status).toBe(502)
    const body = (await response.json()) as Record<string, unknown>
    expect(body['kind']).toBe('failed')
    expect(body['retryable']).toBe(false)
  })
})

describe('GET /admin/providers — لوحة قراءة لا إدخال', () => {
  const TOKEN = 'Yk3pQ9vX2mLsA7nR4tWfZ8cB6dH1jG0e'
  const KEY = 'sk-ant-قيمة-سرّ-حقيقيّة-لا-يجوز-أن-تظهر'

  function ctx(extra: Record<string, unknown> = {}): Record<string, unknown> {
    return { ...env, ADMIN_TOKEN: TOKEN, ...extra }
  }
  function auth(): RequestInit {
    return { headers: { Authorization: `Bearer ${TOKEN}` } }
  }

  interface Body {
    window_days: number
    ledger: string
    total_spend: number
    providers: Array<{
      name: string
      configured: boolean
      secret_name: string
      models_in_use: string[]
      calls: number
      spend: number
    }>
    routing: Array<{ task: string; provider: string; model: string; why: string; ready: boolean }>
    blocked: Array<{ task: string; missing_secret: string }>
  }

  async function read(extra: Record<string, unknown> = {}): Promise<Body> {
    const response = await app.request('/admin/providers', auth(), ctx(extra))
    expect(response.status).toBe(200)
    return (await response.json()) as Body
  }

  it('محروس كسائر مسارات الإدارة', async () => {
    expect((await app.request('/admin/providers', {}, env)).status).toBe(503)
    expect((await app.request('/admin/providers', {}, ctx())).status).toBe(401)
  })

  it('**لا يعيد قيمة مفتاحٍ ولا جزءا منها**', async () => {
    const response = await app.request(
      '/admin/providers',
      auth(),
      ctx({ ANTHROPIC_API_KEY: KEY, GEMINI_API_KEY: 'AIzaSyقيمة-أخرى' }),
    )
    const text = await response.text()
    expect(text).not.toContain(KEY)
    expect(text).not.toContain('AIzaSy')
    expect(text).not.toContain(KEY.slice(0, 8))
    // ولا رمز الإدارة نفسه
    expect(text).not.toContain(TOKEN)
  })

  it('يقول اسم السرّ لا قيمته — ليعرف المالك ما يضبط', async () => {
    const body = await read()
    const anthropic = body.providers.find((p) => p.name === 'anthropic')!
    expect(anthropic.secret_name).toBe('ANTHROPIC_API_KEY')
    expect(anthropic.configured).toBe(false)
  })

  it('يعلن المزوّد مضبوطا حين يوجد سرّه', async () => {
    const body = await read({ ANTHROPIC_API_KEY: KEY })
    expect(body.providers.find((p) => p.name === 'anthropic')!.configured).toBe(true)
    expect(body.providers.find((p) => p.name === 'gemini')!.configured).toBe(false)
  })

  it('يعطي لكلّ مهمّة نموذجها وسببه', async () => {
    const body = await read()
    const analyze = body.routing.find((r) => r.task === 'analyze')!
    expect(analyze.provider).toBe('anthropic')
    expect(analyze.model).toBe('claude-opus-5')
    expect(analyze.why.length).toBeGreaterThan(10)
  })

  /**
   * كُتب هذا بقائمةٍ ثابتة، **فكسرته كلُّ مهمّةٍ جديدة ثلاثَ مرّات** —
   * وكسرٌ متكرّرٌ في اختبارٍ منطقُه صحيح يُغري بتأجيل ما يلزم بناؤه.
   * فصار يثبّت **القاعدة**: كلُّ مهمّةٍ مبنيّةٍ ينقص سرُّ مزوّدها تُسمَّى،
   * وما لم يُبنَ لا يُشتكى منه — أيّا كانت المهامّ يومَ يُقرأ هذا.
   */
  it('يسمّي ما يعطّل مهمّةً مبنيّة، ولا يشكو ممّا لم يُبنَ', async () => {
    const body = await read()
    const tasks = Object.keys(ROUTES) as TaskName[]

    expect(body.blocked.map((b) => b.task)).toEqual(tasks.filter((t) => IMPLEMENTED.has(t)))
    for (const entry of body.blocked) {
      // ويُسمَّى السرُّ باسمه: «مزوّدٌ ناقص» لا يقول للمالك ماذا يضبط
      expect(entry.missing_secret).toBe(PROVIDERS[ROUTES[entry.task as TaskName].provider].secret)
    }
    // ولا مهمّةَ تُسمَّى مرّتين
    expect(new Set(body.blocked.map((b) => b.task)).size).toBe(body.blocked.length)
  })

  it('يفرز الإنفاق بالمزوّد من الدفتر نفسه', async () => {
    await db
      .prepare(
        "INSERT INTO cost_ledger (id, provider, operation, units, unit_cost, total) VALUES (?, 'anthropic', 'analyze', 100, 0.01, 1.0)",
      )
      .bind(crypto.randomUUID())
      .run()
    const body = await read()
    const anthropic = body.providers.find((p) => p.name === 'anthropic')!
    expect(anthropic.calls).toBe(1)
    expect(anthropic.spend).toBe(1)
    expect(body.total_spend).toBe(1)
    expect(body.ledger).toBe('ok')
    expect(body.window_days).toBe(30)
  })

  it('دفترٌ لا يُقرأ لا يُسقط اللوحة — التوجيه يبقى مقروءا', async () => {
    const broken = {
      prepare: () => ({
        bind: () => ({
          all: () => Promise.reject(new Error('D1 معطّلة')),
        }),
      }),
    }
    const response = await app.request('/admin/providers', auth(), ctx({ DB: broken }))
    expect(response.status).toBe(200)
    const body = (await response.json()) as Body
    expect(body.ledger).toBe('unreachable')
    expect(body.routing.length).toBeGreaterThan(0)
    expect(body.total_spend).toBe(0)
  })
})

describe('GET /admin/sources — الجسر الذي كان مفقودا', () => {
  const TOKEN = 'Yk3pQ9vX2mLsA7nR4tWfZ8cB6dH1jG0e'

  function withToken(): Record<string, unknown> {
    return { ...env, ADMIN_TOKEN: TOKEN }
  }
  function auth(): RequestInit {
    return { headers: { Authorization: `Bearer ${TOKEN}` } }
  }

  async function seed(hash: string): Promise<string> {
    const id = crypto.randomUUID()
    await db
      .prepare('INSERT INTO sources (id, drive_file_id, name, mime, content_hash) VALUES (?, ?, ?, ?, ?)')
      .bind(id, `drive-${id.slice(0, 6)}`, 'تقرير', 'application/vnd.google-apps.document', hash)
      .run()
    return id
  }

  interface Body {
    count: number
    pending: number
    sources: Array<{
      id: string
      drive_file_id: string
      analyzed: boolean
      stale: boolean
      worth_score: number | null
    }>
  }

  it('محروس كسائر مسارات الإدارة', async () => {
    expect((await app.request('/admin/sources', {}, env)).status).toBe(503)
    expect((await app.request('/admin/sources', {}, withToken())).status).toBe(401)
  })

  it('يعطي معرّف الصفّ ومعرّف Drive معا — فيُوصل تقرير المسح بالتحليل', async () => {
    const id = await seed('md5:a')
    const body = (await (await app.request('/admin/sources', auth(), withToken())).json()) as Body
    expect(body.count).toBe(1)
    expect(body.sources[0]!.id).toBe(id)
    expect(body.sources[0]!.drive_file_id).toMatch(/^drive-/)
  })

  it('غير المحلَّل يُعدّ منتظرا', async () => {
    await seed('md5:a')
    const body = (await (await app.request('/admin/sources', auth(), withToken())).json()) as Body
    expect(body.sources[0]!.analyzed).toBe(false)
    expect(body.pending).toBe(1)
  })

  it('المحلَّل ببصمته الحاليّة ليس منتظرا', async () => {
    const id = await seed('md5:a')
    await db
      .prepare('INSERT INTO content_items (id, source_id, summary, themes_json, worth_score) VALUES (?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), id, 'خلاصة', JSON.stringify({ hash: 'md5:a', themes: [] }), 0.7)
      .run()
    const body = (await (await app.request('/admin/sources', auth(), withToken())).json()) as Body
    expect(body.sources[0]!.analyzed).toBe(true)
    expect(body.sources[0]!.stale).toBe(false)
    expect(body.sources[0]!.worth_score).toBe(0.7)
    expect(body.pending).toBe(0)
  })

  it('تحليلٌ لبصمةٍ قديمة يُعلَّم بائتا ويعود منتظرا', async () => {
    const id = await seed('md5:جديد')
    await db
      .prepare('INSERT INTO content_items (id, source_id, summary, themes_json, worth_score) VALUES (?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), id, 'خلاصة', JSON.stringify({ hash: 'md5:قديم', themes: [] }), 0.7)
      .run()
    const body = (await (await app.request('/admin/sources', auth(), withToken())).json()) as Body
    expect(body.sources[0]!.stale).toBe(true)
    expect(body.pending).toBe(1)
  })

  it('themes_json فاسد لا يُسقط المسار كلّه', async () => {
    const id = await seed('md5:a')
    await db
      .prepare('INSERT INTO content_items (id, source_id, summary, themes_json, worth_score) VALUES (?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), id, 'خلاصة', 'ليس json', 0.5)
      .run()
    const response = await app.request('/admin/sources', auth(), withToken())
    expect(response.status).toBe(200)
    const body = (await response.json()) as Body
    expect(body.sources[0]!.analyzed).toBe(false)
  })

  it('لا يذكر قيمة رمزٍ في أيّ ردّ', async () => {
    await seed('md5:a')
    const text = await (await app.request('/admin/sources', auth(), withToken())).text()
    expect(text).not.toContain(TOKEN)
  })
})

describe('/health و /ready', () => {
  it('health يجيب بلا شرط', async () => {
    const response = await app.request('/health', {}, env)
    expect(response.status).toBe(200)
  })

  interface ReadyBody {
    ready: boolean
    database: string
    phase_0: boolean
    phase_1: boolean
    drive_folder: boolean
    missing_secrets: string[]
  }

  it('ready يرد 503 ويسمي الناقص بلا قيمته', async () => {
    const response = await app.request('/ready', {}, { ...env, X_CLIENT_SECRET: '' })
    expect(response.status).toBe(503)
    const body = (await response.json()) as ReadyBody
    expect(body.missing_secrets).toContain('X_CLIENT_SECRET')
    expect(body.phase_0).toBe(false)
    expect(body.database).toBe('ok')
    // لا قيمة سر في الجواب، الاسم وحده
    expect(JSON.stringify(body)).not.toContain('x-secret')
  })

  it('ready يرد 200 بأسرار المرحلة صفر وحدها — المرحلة ١ ليست شرط بوابة', async () => {
    const response = await app.request('/ready', {}, env)
    expect(response.status).toBe(200)
    const body = (await response.json()) as ReadyBody
    expect(body.phase_0).toBe(true)
    expect(body.phase_1).toBe(false)
    expect(body.missing_secrets).toEqual(['GOOGLE_SA_JSON', 'ANTHROPIC_API_KEY'])
  })

  it('ready يعلن المرحلة ١ جاهزة حين تكتمل أسرارها ومجلدها', async () => {
    const full = {
      ...env,
      GOOGLE_SA_JSON: '{"client_email":"a@b.com","private_key":"-----BEGIN PRIVATE KEY-----"}',
      ANTHROPIC_API_KEY: 'sk-ant-fake',
      DRIVE_FOLDER_ID: 'folder-1',
    }
    const body = (await (await app.request('/ready', {}, full)).json()) as ReadyBody
    expect(body.phase_1).toBe(true)
    expect(body.missing_secrets).toEqual([])
  })

  it('المرحلة ١ ليست جاهزة بلا مجلد ولو اكتملت أسرارها', async () => {
    const noFolder = {
      ...env,
      GOOGLE_SA_JSON: '{"client_email":"a@b.com","private_key":"-----BEGIN PRIVATE KEY-----"}',
      ANTHROPIC_API_KEY: 'sk-ant-fake',
      DRIVE_FOLDER_ID: '',
    }
    const body = (await (await app.request('/ready', {}, noFolder)).json()) as ReadyBody
    expect(body.phase_1).toBe(false)
    expect(body.drive_folder).toBe(false)
  })
})

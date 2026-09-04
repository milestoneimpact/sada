/**
 * اختبار المسار كاملا: من التحويل إلى شاشة الموافقة، إلى تخزين رمز مشفر.
 * الشبكة مزيفة، وما عداها حقيقي — المسار نفسه، والقاعدة نفسها، والتشفير نفسه.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { toBase64 } from '../lib/crypto'
import { loadTokens } from '../lib/tokens'
import { LINKEDIN, X } from '../lib/oauth/providers'
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
async function startAndCaptureState(platform: 'linkedin' | 'x'): Promise<{
  state: string
  location: URL
}> {
  const response = await app.request(`/oauth/${platform}/start`, {}, env)
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
    const body = (await response.json()) as Record<string, unknown>
    expect(body['connected']).toBe(true)
    expect(body['account_id']).toBe('linkedin:member:urn:li:person:abc')
    expect(body['display_name']).toBe('عمر')
    expect(body['has_refresh']).toBe(true)

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
    const body = (await response.json()) as Record<string, unknown>
    expect(body['error']).toBe('consent_denied')
    expect(body['reason']).toBe('access_denied')
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
    const body = (await response.json()) as Record<string, unknown>
    expect(body['account_id']).toBe('x:member:4242')
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

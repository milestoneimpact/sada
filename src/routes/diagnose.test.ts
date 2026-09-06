/**
 * ثلاثةُ عيوبٍ ظهرت عند مالكٍ حقيقيّ — واختبارٌ لكلٍّ منها.
 *
 * **وكلُّها تُصنَّف «تجميلا» حتّى تُقاس**: سطرُ JSON يفهمه الكاتب،
 * وحظرٌ في الكونسول لا يُسقط صفحة، ومزوّدٌ يُضاف بالكتابة اليدويّة.
 * والثلاثةُ معا تجعل مالكا يقف بلا ما يفعل.
 */
import { beforeEach, describe, expect, it } from 'vitest'
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

describe('١ · رفضُ نهاية الرمز يُشخَّص في صفحة', () => {
  /**
   * **أشدُّ العُطل إرباكا: نصفُ الدورة نجح.**
   *
   * شاشةُ الإذن مرّت، والمنصّةُ أعطت `code` — ثمّ ردّت تبديلَه بـ
   * `invalid_client`. وكان الجوابُ سطرَ JSON في متصفّح، **فلا يعرف
   * المالكُ أين يفتّش** — ويفتّش في المنتَجات والنطاقات، وليس فيها
   * العطل.
   */
  it('invalid_client يُعرَض صفحةً تسمّي السببَ وتقول ما يُفعَل', async () => {
    globalThis.fetch = fakeFetch({
      [LINKEDIN.tokenUrl]: { status: 401, json: { error: 'invalid_client' } },
    })
    try {
      const start = await app.request('/oauth/linkedin/start', {}, env)
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
      expect(body).toContain('أأُعيد إنشاءُ التطبيق؟')
      // **ويصرف عن التفتيش في الموضع الخطأ**
      expect(body).toContain('لا تفتّش في تبويب Products')
      // ولا يُعرَض سطرُ JSON
      expect(body).not.toContain('"oauth_failed"')
    } finally {
      globalThis.fetch = realFetch
    }
  })

  it('ورمزُ المزوّد يُحمَل حقلا لا يُستخرَج من نصّ عربيّ', () => {
    const error = new OAuthError('linkedin: رفض نهاية الرمز (invalid_client)', 401, 'invalid_client')
    expect(error.code).toBe('invalid_client')
  })

  /** سرٌّ غيرُ مضبوطٍ عطلُ تشغيلٍ لا رفضُ منصّة — ويبقى JSON بحالته. */
  it('وسرٌّ ناقصٌ يبقى 503 ولا يُلبَس ثوبَ الرفض', async () => {
    const response = await app.request(
      '/oauth/linkedin/callback?code=c&state=s',
      {},
      { ...env, LINKEDIN_CLIENT_SECRET: '' },
    )
    expect(response.status).not.toBe(502)
  })
})

describe('٢ · رمزُ التبويب', () => {
  /**
   * **الصيغةُ كانت `data:image/svg+xml;utf8,` — و«;utf8» ليست معاملا.**
   *
   * فرفضها فايرفوكس وسقط إلى `/favicon.ico`، ولا مسارَ له — فردَّ
   * الخادمُ ٤٠٤ يحمل `Cross-Origin-Resource-Policy: same-origin`،
   * **فظهر في الكونسول حظرٌ يبدو عطلَ أمنٍ وهو حرفان في نصّ**.
   */
  it('الوثيقةُ تحمل data URI بمعامل charset صحيح', async () => {
    const body = await (await app.request('/panel', {}, env)).text()
    expect(body).toContain('data:image/svg+xml;charset=utf-8,')
    expect(body).not.toContain('svg+xml;utf8,')
  })

  it('و/favicon.ico له مسارٌ يردّ صورةً لا 404', async () => {
    const response = await app.request('/favicon.ico', {}, env)
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toContain('image/svg+xml')
    expect(await response.text()).toContain('<svg')
  })

  /** والرمزُ علامةٌ عامّة — فيُسمَح بها عبر الأصول، كمسار الوسائط. */
  it('ويحمل CORP يسمح — والتوسعةُ على هذا المسار وحده', async () => {
    const icon = await app.request('/favicon.ico', {}, env)
    expect(icon.headers.get('Cross-Origin-Resource-Policy')).toBe('cross-origin')

    const health = await app.request('/health', {}, env)
    expect(health.headers.get('Cross-Origin-Resource-Policy')).toBe('same-origin')
  })
})

describe('وعطبٌ أكبرُ كشفه الاختبارُ نفسُه', () => {
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
  it('ما يضعه المسارُ يغلب ما تملؤه الطبقةُ العامّة', async () => {
    const icon = await app.request('/favicon.ico', {}, env)
    expect(icon.headers.get('Cross-Origin-Resource-Policy')).toBe('cross-origin')
  })

  it('وما لا يضعه مسارٌ يُملأ من الطبقة كما كان', async () => {
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

describe('٣ · عنوانٌ فيه قالبٌ لم يُملأ', () => {
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
    expect(verdict.reason).toContain('قالبٌ لم يُملأ')
  })

  it('والعنوانُ نفسُه مملوءا يمرّ', () => {
    const verdict = checkProviderUrl(
      'https://api.cloudflare.com/client/v4/accounts/c6ea7ba30984d494a1a78efea6ddc9a0/ai/v1',
    )
    expect(verdict.ok).toBe(true)
    if (!verdict.ok) return
    expect(verdict.host).toBe('api.cloudflare.com')
  })

  it('ولا يُردّ عنوانٌ سليمٌ بلا قوسين', () => {
    expect(checkProviderUrl('https://api.groq.com/openai/v1').ok).toBe(true)
  })
})

describe('ونموذجُ Cloudflare في اللوحة', () => {
  async function panelBody(cfAccount?: string): Promise<string> {
    const body = new FormData()
    body.set('token', TOKEN)
    const scoped = cfAccount === undefined ? env : { ...env, CF_AI_ACCOUNT_ID: cfAccount }
    const login = await app.request('/panel/login', { method: 'POST', body }, scoped)
    const cookie = (login.headers.get('Set-Cookie') ?? '').split(';')[0]!
    return (await app.request('/panel', { headers: { Cookie: cookie } }, scoped)).text()
  }

  it('يُعرَض، ومعرّفُ الحساب يُملأ وحده حين يُعرَف', async () => {
    const body = await panelBody('acc-123')
    expect(body).toContain('Cloudflare')
    expect(body).toContain('accounts/acc-123/ai/v1')
    expect(body).toContain('Workers AI')
  })

  /** واللوحةُ تعرف المعرّف — فلا يُطلَب من المالك أن يبحث عنه. */
  it('وبلا معرّفٍ يبقى القالبُ ظاهرا ويُقال إنّه لن يُحفَظ', async () => {
    const body = await panelBody()
    expect(body).toContain('{ACCOUNT_ID}')
    expect(body).toContain('لن يُحفَظ')
  })

  /** والمفتاحُ رمزُ Cloudflare لا مفتاحُ مزوّدٍ آخر — ويُقال. */
  it('ويُقال أيُّ مفتاحٍ يلزم', async () => {
    expect(await panelBody('acc-123')).toContain('Workers AI · Read')
  })
})

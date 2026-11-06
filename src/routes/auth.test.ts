/**
 * العاملُ الثاني من طرفه إلى طرفه: قاعدةٌ حقيقيّة، و KV حقيقيّ، ومتوثِّقٌ
 * يوقّع توقيعا حقيقيّا بـ ECDSA.
 *
 * ومنذ D-317: **العاملُ الثاني إلزاميٌّ للمالك**، فدخولُه برمز البريد وحده جلسةُ تسجيلٍ لا لوحة. والاختبارُ يمشي
 * ما يمشيه المالك: يدخل، فيسجّل عاملَه (فتصير جلسته كاملةً بمعرّفٍ جديد)، ثمّ يدخل ثانيةً بعاملين.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { emailLogin, fakeMailer, requestCode, type FakeMailer } from '../test/emailLogin'
import { toBase64 } from '../lib/crypto'
import { readSettings } from '../lib/settings'
import { addPasskey, countRecoveryCodes, issueRecoveryCodes, listPasskeys, totpState } from '../lib/security/factors'
import { codeAt, counterFor } from '../lib/security/totp'
import { fakeAuthenticator, type FakeAuthenticator } from '../test/authenticator'
import { fakeDb, fakeKv, type FakeDb } from '../test/fakes'
import { OWNER_EMAIL } from '../lib/ownerEmail'
import { app } from '../index'

const TOKEN = 'Yk3pQ9vX2mLsA7nR4tWfZ8cB6dH1jG0e'
const ENC = toBase64(crypto.getRandomValues(new Uint8Array(32)))
const RP_ID = 'sada2.basserh.com'
const ORIGIN = 'https://sada2.basserh.com'

let db: FakeDb
let kv: ReturnType<typeof fakeKv>
let env: Record<string, unknown>
let csrf = ''

beforeEach(() => {
  db = fakeDb()
  kv = fakeKv()
  csrf = ''
  env = {
    SADA_ENV: 'staging',
    PUBLIC_BASE_URL: ORIGIN,
    DRIVE_FOLDER_ID: 'folder',
    DB: db,
    KV: kv,
    TOKEN_ENC_KEY: ENC,
    ADMIN_TOKEN: TOKEN,
    EMAIL: fakeMailer(),
  }
})

/** جلسةٌ في يد الاختبار — وكعكتُها تتبدّل حين تُرقّى (D-317: أوّلُ عاملٍ يرقّي جلسةَ التسجيل بمعرّفٍ جديد). */
interface S {
  cookie: string
  location: string
}

const cookieOf = (response: Response): string => (response.headers.get('Set-Cookie') ?? '').split(';')[0]!

/** يدخل برمز البريد وحده — بلا مفتاحٍ مزروع — ويعيد الكعكة ووجهةَ إعادة التوجيه. */
async function loginWithToken(): Promise<S> {
  const response = await emailLogin(app, env, { secondFactor: false })
  expect(response.status).toBe(303)
  return { cookie: cookieOf(response), location: response.headers.get('Location') ?? '' }
}

/** يقرأ رمز CSRF من الصفحة التي يفتحها هذا الكعك — ويتبع تحويلةً واحدة (اللوحةُ تحوّل جلسةَ التسجيل إلى صفحتها). */
async function readCsrf(cookie: string, path = '/panel'): Promise<string> {
  let response = await app.request(path, { headers: { Cookie: cookie } }, env)
  const to = response.headers.get('Location')
  if (response.status === 303 && to !== null && to.startsWith('/panel')) {
    response = await app.request(to, { headers: { Cookie: cookie } }, env)
  }
  const value = /name="_csrf" value="([^"]+)"/.exec(await response.text())?.[1] ?? ''
  csrf = value
  return value
}

function form(fields: Record<string, string>): FormData {
  const body = new FormData()
  body.set('_csrf', csrf)
  for (const [k, v] of Object.entries(fields)) body.set(k, v)
  return body
}

async function post(
  path: string,
  cookie: string,
  fields: Record<string, string> = {},
  headers: Record<string, string> = {},
): Promise<Response> {
  return await app.request(
    path,
    { method: 'POST', body: form(fields), headers: { ...headers, Cookie: cookie } },
    env,
  )
}

/** يتبنّى كعكةً جديدةً إن رقّى الردُّ الجلسة، ويقرأ رمزَ نموذجها. */
async function adopt(s: S, response: Response): Promise<void> {
  const next = cookieOf(response)
  if (next.startsWith('__Host-sada_session=') && next !== '__Host-sada_session=') {
    s.cookie = next
    await readCsrf(s.cookie)
  }
}

/** يسجّل مفتاح مرورٍ كاملا: تحدٍّ ثمّ `attestationObject` ثمّ حفظ — ويتبنّى الجلسةَ المرقّاة. */
async function enrollPasskey(s: S, label = 'هاتفي'): Promise<FakeAuthenticator & { codes: string[] }> {
  const key = await fakeAuthenticator()
  const challengeResponse = await post('/panel/security/passkey/challenge', s.cookie)
  expect(challengeResponse.status).toBe(200)
  const { challenge } = (await challengeResponse.json()) as { challenge: string }

  const made = await key.register({ challenge, origin: ORIGIN, rpId: RP_ID })
  const response = await post('/panel/security/passkey/register', s.cookie, {
    label,
    credential: JSON.stringify(made),
  })
  expect(response.status).toBe(200)
  const { codes } = (await response.clone().json()) as { codes: string[] }
  await adopt(s, response)
  return Object.assign(key, { codes })
}

/** يضبط رمز التطبيق ويؤكّده، ويعيد سرَّه — ويتبنّى الجلسةَ المرقّاة. */
async function enrollTotp(s: S): Promise<string> {
  const started = await post('/panel/security/totp/start', s.cookie)
  expect(started.status).toBe(200)
  const { secret } = (await started.json()) as { secret: string }
  const code = await codeAt(secret, counterFor() - 1n)
  const confirmed = await post('/panel/security/totp/confirm', s.cookie, { code })
  expect(confirmed.status).toBe(200)
  await adopt(s, confirmed)
  return secret
}

/** المالكُ بمفتاح مرورٍ سجّله من جلسة التسجيل — وجلستُه بعده كاملة. */
async function ownerWithPasskey(label = 'هاتفي'): Promise<{ s: S; key: FakeAuthenticator & { codes: string[] } }> {
  const s = await loginWithToken()
  await readCsrf(s.cookie)
  const key = await enrollPasskey(s, label)
  return { s, key }
}

/** يقدّم «تحقّقتَ للتوّ» ستَّ دقائق — كأنّ المالكَ فتح الجلسة ثمّ عاد بعدها. */
async function age(cookie: string, field: 'fresh' | 'seen' | 'at', minutes: number): Promise<void> {
  const id = cookie.split('=')[1]!
  const raw = await kv.get(`session:${id}`)
  const record = JSON.parse(raw!) as Record<string, unknown>
  record[field] = new Date(Date.now() - minutes * 60_000).toISOString()
  await kv.put(`session:${id}`, JSON.stringify(record))
}

/** يفتح شاشةَ العامل الثاني بجلسةٍ معلَّقة ويعيد ما يلزم لإتمامها. */
async function pendingScreen(headers: Record<string, string> = {}): Promise<{ cookie: string; csrf: string; challenge: string }> {
  const { cookie, location } = await loginWithToken()
  expect(location).toBe('/panel/2fa')
  const page = await (await app.request('/panel/2fa', { headers: { ...headers, Cookie: cookie } }, env)).text()
  return {
    cookie,
    csrf: /name="_csrf" value="([^"]+)"/.exec(page)?.[1] ?? '',
    challenge: /data-challenge="([^"]+)"/.exec(page)?.[1] ?? '',
  }
}

/** نصُّ رسالةٍ في الصندوق الصوريّ: الموضوعُ والجسدُ مفكوكَين. */
function mailText(mailer: FakeMailer, to: string): string[] {
  return mailer.sent.filter((m) => m.to === to).map((m) => {
    const [head = '', body = ''] = m.raw.split('\r\n\r\n')
    const subject = /Subject: =\?UTF-8\?B\?([^?]+)\?=/.exec(head)?.[1] ?? ''
    const dec = (b64: string): string => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s+/g, '')), (ch) => ch.charCodeAt(0)))
    return `${dec(subject)}\n${dec(body)}`
  })
}

describe('بلا عامل ثانٍ — المالكُ يسجّل عاملَه أوّلًا (D-317)', () => {
  /*
   * ‏‏D-317: كان «الدخول بالرمز يفتح اللوحة مباشرة» للمالك بلا عامل — أي أنّ رمزَ البريد وحده يفتح كلَّ شيء. والعاملُ
   * ‏الثاني إلزاميٌّ للمالك والمدير والناشر الآن، فالرمزُ وحده جلسةُ تسجيلٍ لا تفتح إلّا صفحتَه.
   */
  it('الدخول بالرمز وحده لا يفتح اللوحة: جلسةُ تسجيلٍ تقول لماذا', async () => {
    const { location, cookie } = await loginWithToken()
    expect(location).toBe('/panel/enrol')
    const panel = await app.request('/panel', { headers: { Cookie: cookie } }, env)
    expect(panel.status).toBe(303)
    expect(panel.headers.get('Location')).toBe('/panel/enrol')
    const page = await (await app.request('/panel/enrol', { headers: { Cookie: cookie } }, env)).text()
    expect(page).toContain('سجّل عاملك الثاني')
    expect(page).toContain('«المالك»')
    expect(page).toContain('id="pk-add"')
    expect(page).toContain('id="totp-start"')
  })

  it('وجلسةُ التسجيل لا تغيّر إعدادًا ولا تفتح الفريقَ ولا الربط', async () => {
    const { cookie } = await loginWithToken()
    await readCsrf(cookie)
    expect(csrf).not.toBe('')
    const write = await post('/panel/settings', cookie, { key: 'paused', value: 'true' })
    expect(write.status).toBe(403)
    expect(await write.json()).toMatchObject({ error: 'enrol_required' })
    expect((await readSettings(db)).paused).toBe(false)
    for (const path of ['/panel/team', '/panel/settings', '/oauth/linkedin/start', '/panel/plan-import/template.csv']) {
      const res = await app.request(path, { headers: { Cookie: cookie } }, env)
      expect(res.headers.get('Location'), path).toBe('/panel/enrol')
    }
  })

  it('وتفتح المساعدةَ والخروج', async () => {
    const { cookie } = await loginWithToken()
    expect((await app.request('/panel/help', { headers: { Cookie: cookie } }, env)).status).toBe(200)
    const out = await app.request('/panel/logout', { method: 'POST', headers: { Cookie: cookie } }, env)
    expect(out.status).toBe(303)
    expect(await kv.get(`session:${cookie.split('=')[1]}`)).toBeNull()
  })

  it('أوّلُ عاملٍ يرقّيها بمعرّفٍ جديد ويُصدر رموزَ الاسترداد معه', async () => {
    const s = await loginWithToken()
    const before = s.cookie
    await readCsrf(s.cookie)
    const key = await enrollPasskey(s)
    expect(key.codes).toHaveLength(8)
    expect((await countRecoveryCodes(db, OWNER_EMAIL)).unused).toBe(8)
    expect(s.cookie).not.toBe(before)
    expect((await app.request('/panel', { headers: { Cookie: before } }, env)).headers.get('Location')).not.toBe('/panel/enrol')
    expect(await (await app.request('/panel', { headers: { Cookie: s.cookie } }, env)).text()).toContain('nav class="tabs"')
  })

  it('صفحة الدخول لا تعرض باب مفتاح المرور', async () => {
    const html = await (await app.request('/panel', {}, env)).text()
    expect(html).not.toContain('pk-login')
  })

  it('والمديرُ والناشرُ كالمالك؛ والمحرّرُ والقارئُ بلا عاملٍ يدخلان كما كانا', async () => {
    db.raw.exec(`INSERT INTO members (email, role, orgs, invited_by) VALUES
      ('a@example.com', 'admin', '*', 'x'), ('p@example.com', 'publisher', '*', 'x'),
      ('e@example.com', 'editor', '*', 'x'), ('v@example.com', 'viewer', '*', 'x')`)
    const where = async (email: string): Promise<string> =>
      (await emailLogin(app, env, { email, secondFactor: false })).headers.get('Location') ?? ''
    expect(await where('a@example.com')).toBe('/panel/enrol')
    expect(await where('p@example.com')).toBe('/panel/enrol')
    expect(await where('e@example.com')).toBe('/panel')
    expect(await where('v@example.com')).toBe('/panel')
  })

  it('والمدعوُّ يسجّل عاملَه لنفسه — ولا يصير مفتاحُه مفتاحَ المالك', async () => {
    db.raw.exec(`INSERT INTO members (email, role, orgs, invited_by) VALUES ('a@example.com', 'admin', '*', 'x')`)
    const s: S = { cookie: cookieOf(await emailLogin(app, env, { email: 'a@example.com', secondFactor: false })), location: '' }
    await readCsrf(s.cookie)
    await enrollPasskey(s, 'هاتف المدير')
    expect(await listPasskeys(db, RP_ID, 'a@example.com')).toHaveLength(1)
    expect(await listPasskeys(db, RP_ID, OWNER_EMAIL)).toHaveLength(0)
    // ‏وجلستُه الآن كاملةٌ بدوره: الإعداداتُ نعم، والفريقُ لا
    expect((await app.request('/panel/settings', { headers: { Cookie: s.cookie } }, env)).status).toBe(200)
    expect((await app.request('/panel/team', { headers: { Cookie: s.cookie } }, env)).headers.get('Location')).toBe('/panel')
  })
})

describe('رمزُ التطبيق للمدعوّ (D-317)', () => {
  it('المديرُ يضبط رمزَ تطبيقه في جلسة التسجيل، ثمّ يُسأل عنه في دخوله التالي ويُتمّه به', async () => {
    db.raw.exec(`INSERT INTO members (email, role, orgs, invited_by) VALUES ('a@example.com', 'admin', '*', 'x')`)
    const s: S = { cookie: cookieOf(await emailLogin(app, env, { email: 'a@example.com', secondFactor: false })), location: '' }
    await readCsrf(s.cookie)
    const secret = await enrollTotp(s)
    expect((await totpState(db, 'a@example.com')).confirmed).toBe(true)
    // ‏ورمزُ المالك لم يُمَسّ — لكلّ حسابٍ صفُّه وسياقُ تشفيره
    expect((await totpState(db, OWNER_EMAIL)).enrolled).toBe(false)
    expect(db.raw.prepare('SELECT COUNT(*) AS n FROM member_totp').get()).toEqual({ n: 1 })

    const again = await emailLogin(app, env, { email: 'a@example.com', secondFactor: false })
    expect(again.headers.get('Location')).toBe('/panel/2fa')
    const cookie = cookieOf(again)
    const token = await readCsrf(cookie, '/panel/2fa')
    const body = new FormData()
    body.set('_csrf', token)
    body.set('code', await codeAt(secret, counterFor()))
    const done = await app.request('/panel/2fa/totp', { method: 'POST', body, headers: { Cookie: cookie } }, env)
    expect(done.status).toBe(303)
    expect((await app.request('/panel/settings', { headers: { Cookie: cookieOf(done) } }, env)).status).toBe(200)
  })

  it('و«تحقّق للتوّ» يعيد العضوَ إلى «أمان حسابك» لا إلى إعداداتٍ لا يفتحها', async () => {
    db.raw.exec(`INSERT INTO members (email, role, orgs, invited_by) VALUES ('p@example.com', 'publisher', '*', 'x')`)
    const s: S = { cookie: cookieOf(await emailLogin(app, env, { email: 'p@example.com', secondFactor: false })), location: '' }
    await readCsrf(s.cookie)
    await enrollPasskey(s)
    await age(s.cookie, 'fresh', 6)
    await readCsrf(s.cookie, '/panel/enrol')
    const blocked = await post('/panel/security/passkey/challenge', s.cookie)
    expect(((await blocked.json()) as { to: string }).to).toBe(`/panel/stepup?next=${encodeURIComponent('/panel/enrol')}`)
  })
})

describe('تسجيل مفتاح مرور', () => {
  it('يُسجَّل ويظهر في اللوحة', async () => {
    const { s } = await ownerWithPasskey('مفتاح المكتب')
    expect(await listPasskeys(db, RP_ID)).toHaveLength(1)
    const html = await (await app.request('/panel/settings', { headers: { Cookie: s.cookie } }, env)).text()
    expect(html).toContain('مفتاح المكتب')
  })

  it('**تحدّ ملفَّق يُرفض** — التحدّي يجيء من الخادم لا من العميل', async () => {
    const { cookie } = await loginWithToken()
    await readCsrf(cookie)
    await post('/panel/security/passkey/challenge', cookie)

    const key = await fakeAuthenticator()
    const made = await key.register({ challenge: 'aW52ZW50ZWQtY2hhbGxlbmdl', origin: ORIGIN, rpId: RP_ID })
    const response = await post('/panel/security/passkey/register', cookie, {
      label: 'مزوّر',
      credential: JSON.stringify(made),
    })
    expect(response.status).toBe(400)
    expect(await listPasskeys(db, RP_ID)).toHaveLength(0)
  })

  it('التحدّي يُستهلَك مرّةً واحدة', async () => {
    const { s, key } = await ownerWithPasskey()
    // إعادةُ الإرسال نفسه لا تجد تحدّيا
    const response = await post('/panel/security/passkey/register', s.cookie, {
      label: 'ثان',
      credential: JSON.stringify({ credentialId: key.credentialId }),
    })
    expect(response.status).toBe(400)
  })

  /*
   * ‏‏D-317 · البند ٩: كان المفتاحُ العامُّ ومعرّفُ الاعتماد يُؤخذان من جسد النموذج كما أرسلهما العميل. والآن من
   * ‏`attestationObject` وحده: مفتاحٌ يرسله العميلُ بجانبه لا يُحفظ، ومعرّفٌ لا يطابق ما قاله المتوثِّق يُردّ.
   */
  it('D-317: المفتاحُ العامُّ من بيانات الاعتماد المشهودة لا ممّا يرسله العميل', async () => {
    const { cookie } = await loginWithToken()
    await readCsrf(cookie)
    const { challenge } = (await (await post('/panel/security/passkey/challenge', cookie)).json()) as { challenge: string }
    const real = await fakeAuthenticator()
    const other = await fakeAuthenticator()
    const made = await real.register({ challenge, origin: ORIGIN, rpId: RP_ID })
    const response = await post('/panel/security/passkey/register', cookie, {
      label: 'هاتفي',
      credential: JSON.stringify({ ...made, publicKey: other.publicKey, alg: -7 }),
    })
    expect(response.status).toBe(200)
    const [stored] = await listPasskeys(db, RP_ID)
    expect(stored?.publicKey).toBe(real.publicKey)
    expect(stored?.publicKey).not.toBe(other.publicKey)
  })

  it('D-317: ومعرّفٌ لا يطابق ما قاله المتوثِّق يُردّ، وتسجيلٌ بلا بيانات إقرار يُردّ بسببه', async () => {
    const { cookie } = await loginWithToken()
    await readCsrf(cookie)
    const { challenge } = (await (await post('/panel/security/passkey/challenge', cookie)).json()) as { challenge: string }
    const key = await fakeAuthenticator()
    const made = await key.register({ challenge, origin: ORIGIN, rpId: RP_ID })
    const forged = await post('/panel/security/passkey/register', cookie, {
      label: 'x', credential: JSON.stringify({ ...made, credentialId: 'c29tZXRoaW5nLWVsc2U' }),
    })
    expect(forged.status).toBe(400)

    await post('/panel/security/passkey/challenge', cookie)
    const bare = await post('/panel/security/passkey/register', cookie, {
      label: 'x', credential: JSON.stringify({ credentialId: key.credentialId, clientDataJSON: made.clientDataJSON }),
    })
    expect(bare.status).toBe(400)
    expect(await bare.json()).toMatchObject({ error: 'no_attestation' })
    expect(await listPasskeys(db, RP_ID)).toHaveLength(0)
  })

  it('بلا جلسة لا يُسجَّل شيء', async () => {
    const response = await app.request(
      '/panel/security/passkey/challenge',
      { method: 'POST', body: new FormData() },
      env,
    )
    expect(response.status).toBe(401)
  })

  it('بلا رمز CSRF لا يُسجَّل شيء', async () => {
    const { cookie } = await loginWithToken()
    const response = await app.request(
      '/panel/security/passkey/challenge',
      { method: 'POST', body: new FormData(), headers: { Cookie: cookie } },
      env,
    )
    expect(response.status).toBe(403)
  })
})

describe('الإلزام — والعامل الثاني ليس سؤالا يُتخطّى', () => {
  it('بعد تسجيل مفتاح، الرمز وحده يعطي جلسةً معلَّقة', async () => {
    await ownerWithPasskey()
    const second = await loginWithToken()
    expect(second.location).toBe('/panel/2fa')
  })

  it('والجلسة المعلَّقة تُردّ من اللوحة إلى الشاشة — ومن كلّ مسار، لا من المسارات التي تسأل وحدها', async () => {
    await ownerWithPasskey()
    const { cookie } = await loginWithToken()
    for (const path of ['/panel', '/panel/plan-import/template.csv', '/panel/settings', '/panel/enrol', '/panel/stepup']) {
      const response = await app.request(path, { headers: { Cookie: cookie } }, env)
      expect(response.status, path).toBe(303)
      expect(response.headers.get('Location'), path).toBe('/panel/2fa')
    }
  })

  it('**ولا تغيّر إعدادا ولو نُودي المسار مباشرة**', async () => {
    await ownerWithPasskey()
    const { cookie } = await loginWithToken()
    const pendingCsrf = await readCsrf(cookie, '/panel/2fa')
    expect(pendingCsrf).not.toBe('')

    const body = new FormData()
    body.set('_csrf', pendingCsrf)
    body.set('key', 'paused')
    body.set('value', 'true')
    const response = await app.request(
      '/panel/settings',
      { method: 'POST', body, headers: { Cookie: cookie } },
      env,
    )
    expect(response.status).toBe(403)
    expect((await readSettings(db)).paused).toBe(false)
  })

  it('ولا تُسجّل مفتاحا جديدا — فلا تُثبّت نفسها', async () => {
    await ownerWithPasskey()
    const { cookie } = await loginWithToken()
    await readCsrf(cookie, '/panel/2fa')
    const response = await post('/panel/security/passkey/challenge', cookie)
    expect(response.status).toBe(403)
  })

  it('ولا تظهر في جرد الأجهزة — ليست بابا مفتوحا', async () => {
    const { s } = await ownerWithPasskey()
    await loginWithToken()

    const html = await (await app.request('/panel/settings', { headers: { Cookie: s.cookie } }, env)).text()
    const rows = html.match(/\/panel\/sessions\/revoke"/g) ?? []
    expect(rows).toHaveLength(0)
  })

  it('D-317: والمعلَّقةُ عشرُ دقائق لا ثلاثةُ أيّام', async () => {
    await ownerWithPasskey()
    const { cookie } = await loginWithToken()
    expect(kv.ttlOf(`session:${cookie.split('=')[1]}`)).toBe(600)
    await age(cookie, 'at', 11)
    expect((await app.request('/panel/2fa', { headers: { Cookie: cookie } }, env)).headers.get('Location')).toBe('/panel')
  })
})

describe('إتمام العامل الثاني بمفتاح مرور', () => {
  it('يرقّي الجلسة ويفتح اللوحة', async () => {
    const { key } = await ownerWithPasskey()
    const { cookie, csrf: pendingCsrf, challenge } = await pendingScreen()
    expect(challenge).not.toBe('')

    const signed = await key.sign({ challenge, origin: ORIGIN, rpId: RP_ID, signCount: 5 })
    const body = new FormData()
    body.set('_csrf', pendingCsrf)
    body.set('assertion', JSON.stringify(signed))
    const response = await app.request(
      '/panel/2fa/passkey',
      { method: 'POST', body, headers: { Cookie: cookie } },
      env,
    )
    expect(response.status).toBe(303)
    expect(response.headers.get('Location')).toBe('/panel')

    const promoted = cookieOf(response)
    expect(await (await app.request('/panel', { headers: { Cookie: promoted } }, env)).text())
      .toContain('nav class="tabs"')
  })

  it('**المعرّف يتبدّل عند الترقية** — فلا تُثبَّت الجلسة', async () => {
    const { key } = await ownerWithPasskey()
    const { cookie, csrf: pendingCsrf, challenge } = await pendingScreen()

    const body = new FormData()
    body.set('_csrf', pendingCsrf)
    body.set('assertion', JSON.stringify(await key.sign({ challenge, origin: ORIGIN, rpId: RP_ID, signCount: 5 })))
    const response = await app.request(
      '/panel/2fa/passkey',
      { method: 'POST', body, headers: { Cookie: cookie } },
      env,
    )
    const promoted = cookieOf(response)
    expect(promoted).not.toBe(cookie)
    // والمعرّفُ القديم بطل: لا يفتح شيئا
    expect(await (await app.request('/panel', { headers: { Cookie: cookie } }, env)).text())
      .toContain('name="email"')
  })

  it('D-317: ومفتاحُ حسابٍ آخر لا يُتمّ عاملَ المالك', async () => {
    await ownerWithPasskey()
    const stranger = await fakeAuthenticator()
    await addPasskey(db, {
      credentialId: stranger.credentialId, publicKey: stranger.publicKey, alg: -7, signCount: 0,
      label: 'مفتاح المدير', rpId: RP_ID, email: 'a@example.com',
    })
    const { cookie, csrf: pendingCsrf, challenge } = await pendingScreen()
    const body = new FormData()
    body.set('_csrf', pendingCsrf)
    body.set('assertion', JSON.stringify(await stranger.sign({ challenge, origin: ORIGIN, rpId: RP_ID })))
    const response = await app.request('/panel/2fa/passkey', { method: 'POST', body, headers: { Cookie: cookie } }, env)
    expect(response.status).toBe(401)
    expect(await response.text()).toContain('مفتاحٌ لحسابٍ آخر')
  })
})

describe('الدخول بمفتاح المرور من صفحة الدخول', () => {
  async function passkeyLogin(key: FakeAuthenticator, signCount = 5, headers: Record<string, string> = {}): Promise<Response> {
    const ticketResponse = await app.request('/panel/passkey/challenge', { method: 'POST', headers }, env)
    expect(ticketResponse.status).toBe(200)
    const { ticket, challenge } = (await ticketResponse.json()) as { ticket: string; challenge: string }
    const signed = await key.sign({ challenge, origin: ORIGIN, rpId: RP_ID, signCount })
    return app.request('/panel/passkey/login', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket, ...signed }),
    }, env)
  }

  it('يفتح جلسةً كاملةً بلا رمز إداريّ', async () => {
    const { key } = await ownerWithPasskey()
    const response = await passkeyLogin(key)
    expect(response.status).toBe(200)

    const cookie = cookieOf(response)
    const html = await (await app.request('/panel/settings', { headers: { Cookie: cookie } }, env)).text()
    expect(html).toContain('nav class="tabs"')
    // وتُعلَّم في الجرد بأنّها بمفتاح مرور
    expect(html).toContain('مفتاح مرور')
  })

  /*
   * ‏‏D-317: كانت جلسةُ مفتاح المرور «المالكَ» أيًّا كان من سجّله — فمدعوٌّ يصل إلى تسجيل مفتاحٍ يدخل به مالكًا.
   */
  it('D-317: ومفتاحُ المدعوّ يفتح جلستَه بدوره لا جلسةَ مالك', async () => {
    db.raw.exec(`INSERT INTO members (email, role, orgs, invited_by) VALUES ('e@example.com', 'editor', '*', 'x')`)
    const key = await fakeAuthenticator()
    await addPasskey(db, { credentialId: key.credentialId, publicKey: key.publicKey, alg: -7, signCount: 0, label: 'م', rpId: RP_ID, email: 'e@example.com' })
    const response = await passkeyLogin(key)
    expect(response.status).toBe(200)
    const cookie = cookieOf(response)
    const record = JSON.parse((await kv.get(`session:${cookie.split('=')[1]}`))!) as { email: string; role: string }
    expect(record).toMatchObject({ email: 'e@example.com', role: 'editor' })
    expect((await app.request('/panel/team', { headers: { Cookie: cookie } }, env)).headers.get('Location')).toBe('/panel')
  })

  it('D-317: ومفتاحُ مدعوٍّ أُلغيت دعوتُه لا يفتح شيئًا', async () => {
    db.raw.exec(`INSERT INTO members (email, role, orgs, invited_by, revoked_at) VALUES ('gone@example.com', 'admin', '*', 'x', datetime('now'))`)
    const key = await fakeAuthenticator()
    await addPasskey(db, { credentialId: key.credentialId, publicKey: key.publicKey, alg: -7, signCount: 0, label: 'م', rpId: RP_ID, email: 'gone@example.com' })
    const response = await passkeyLogin(key)
    expect(response.status).toBe(401)
    expect(response.headers.get('Set-Cookie')).toBeNull()
  })

  /*
   * ‏‏D-317 · البند ٨: كان دلوٌ عامٌّ واحدٌ (ثلاثون فشلًا في ربع ساعة) وحدُّ العنوان في KV يردّان توقيعًا صحيحًا — فستّةُ
   * ‏عناوين تُخمّن رموزَ بريدٍ تُخرج المالكَ من مفتاحه أيضًا.
   */
  it('D-317: توقيعٌ صحيحٌ لا تردّه دلاءُ رمز البريد ولو امتلأت', async () => {
    const { key } = await ownerWithPasskey()
    const ip = { 'CF-Connecting-IP': '203.0.113.5' }
    db.raw.exec(`INSERT OR REPLACE INTO auth_attempts (bucket, n, window_start) VALUES ('global', 5000, datetime('now')), ('ip:203.0.113.5', 50, datetime('now'))`)
    for (let i = 0; i < 6; i += 1) await kv.put('login-attempts:203.0.113.5', String(i + 1))
    const response = await passkeyLogin(key, 7, ip)
    expect(response.status).toBe(200)
    expect(cookieOf(response)).toContain('__Host-sada_session=')
  })

  it('D-317: والدخولُ بالمفتاح بجلسةٍ قائمة يُقرأ جسدُه JSON — الحارسُ لا يقرؤه نموذجًا', async () => {
    const { s, key } = await ownerWithPasskey()
    const ticketResponse = await app.request('/panel/passkey/challenge', { method: 'POST', headers: { Cookie: s.cookie } }, env)
    const { ticket, challenge } = (await ticketResponse.json()) as { ticket: string; challenge: string }
    const signed = await key.sign({ challenge, origin: ORIGIN, rpId: RP_ID, signCount: 5 })
    const response = await app.request('/panel/passkey/login', {
      method: 'POST', headers: { Cookie: s.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ ticket, ...signed }),
    }, env)
    expect(response.status).toBe(200)
  })

  it('صفحة الدخول تعرض بابَه حين يوجد مفتاح', async () => {
    await ownerWithPasskey()
    const html = await (await app.request('/panel', {}, env)).text()
    expect(html).toContain('pk-login')
  })

  it('توقيع بمفتاح غير مسجَّل يُرفض', async () => {
    await ownerWithPasskey()
    const stranger = await fakeAuthenticator()
    const response = await passkeyLogin(stranger)
    expect(response.status).toBe(401)
    expect(response.headers.get('Set-Cookie')).toBeNull()
    // ‏والسببُ لا يُعاد إلى طالبٍ مجهول (D-160) — يبقى في سجلّ التدقيق وحده
    expect(await response.json()).toEqual({ error: 'denied' })
    const logged = db.raw.prepare(
      "SELECT detail FROM audit_log WHERE action = 'passkey.denied'",
    ).get() as { detail: string } | undefined
    expect(logged?.detail).toBe('مفتاح غير مسجَّل')
  })

  it('والتذكرة تُستهلَك — لا يُعاد إرسال التوقيع نفسه', async () => {
    const { key } = await ownerWithPasskey()
    const ticketResponse = await app.request('/panel/passkey/challenge', { method: 'POST' }, env)
    const { ticket, challenge } = (await ticketResponse.json()) as { ticket: string; challenge: string }
    const signed = await key.sign({ challenge, origin: ORIGIN, rpId: RP_ID, signCount: 5 })
    const body = JSON.stringify({ ticket, ...signed })
    const headers = { 'Content-Type': 'application/json' }

    expect((await app.request('/panel/passkey/login', { method: 'POST', headers, body }, env)).status).toBe(200)
    expect((await app.request('/panel/passkey/login', { method: 'POST', headers, body }, env)).status).toBe(400)
  })

  it('بلا مفاتيح مسجَّلة لا تحدّ أصلا', async () => {
    const response = await app.request('/panel/passkey/challenge', { method: 'POST' }, env)
    expect(response.status).toBe(404)
  })
})

describe('رمز التطبيق', () => {
  it('يُضبَط ويُؤكَّد ويُلزِم', async () => {
    const s = await loginWithToken()
    await readCsrf(s.cookie)
    await enrollTotp(s)

    expect((await totpState(db, OWNER_EMAIL)).confirmed).toBe(true)
    expect((await loginWithToken()).location).toBe('/panel/2fa')
  })

  /*
   * ‏‏D-317: كان الدخولُ التالي بعد سرٍّ غير مؤكَّد يفتح اللوحة (`/panel`) — والمالكُ بلا عاملٍ مؤكَّد صار يُطلب منه
   * ‏التسجيل. والقاعدةُ نفسُها باقية: سرٌّ لم يُؤكَّد لا يُلزِم (لا يصير الدخولُ معلَّقًا بسرٍّ لم يثبت).
   */
  it('**سرّ بدأ ولم يُؤكَّد لا يُلزِم** — فلا يُقفَل المالكُ بسرٍّ لم يثبت أنّه في يده', async () => {
    const { cookie } = await loginWithToken()
    await readCsrf(cookie)
    await post('/panel/security/totp/start', cookie)

    expect((await totpState(db, OWNER_EMAIL)).enrolled).toBe(true)
    expect((await totpState(db, OWNER_EMAIL)).confirmed).toBe(false)
    expect((await loginWithToken()).location).toBe('/panel/enrol')
  })

  it('رمز خطأ لا يؤكّد', async () => {
    const { cookie } = await loginWithToken()
    await readCsrf(cookie)
    await post('/panel/security/totp/start', cookie)
    const response = await post('/panel/security/totp/confirm', cookie, { code: '000000' })
    expect(response.status).toBe(401)
    expect((await totpState(db, OWNER_EMAIL)).confirmed).toBe(false)
  })

  it('السرّ لا يوجد مقروءا في القاعدة', async () => {
    const s = await loginWithToken()
    await readCsrf(s.cookie)
    const secret = await enrollTotp(s)
    const row = await db
      .prepare('SELECT secret_cipher FROM totp WHERE id = 1')
      .first<{ secret_cipher: string }>()
    expect(row?.secret_cipher).not.toContain(secret)
  })

  /*
   * ‏‏D-317 · البند ٤: كان `totp/start` يكتب فوق الرمز المؤكَّد سرًّا غيرَ مؤكَّد، فجلسةٌ مسروقةٌ بلا مفتاحٍ تُطفئ الإلزامَ
   * ‏بنداءٍ واحد. والمؤكَّدُ الآن يُزال أوّلًا (بتحقّقٍ حديث) ثمّ يُضبط غيرُه.
   */
  it('D-317: لا يُدهَس رمزٌ مؤكَّد — ضبطٌ جديدٌ يُردّ ويبقى المؤكَّد', async () => {
    const s = await loginWithToken()
    await readCsrf(s.cookie)
    await enrollTotp(s)
    const again = await post('/panel/security/totp/start', s.cookie)
    expect(again.status).toBe(409)
    expect(await again.json()).toMatchObject({ error: 'totp_confirmed' })
    expect((await totpState(db, OWNER_EMAIL)).confirmed).toBe(true)
  })

  it('يُتمّ العامل الثاني ويفتح اللوحة', async () => {
    const setup = await loginWithToken()
    await readCsrf(setup.cookie)
    const secret = await enrollTotp(setup)

    const { cookie } = await loginWithToken()
    const pendingCsrf = await readCsrf(cookie, '/panel/2fa')
    const body = new FormData()
    body.set('_csrf', pendingCsrf)
    body.set('code', await codeAt(secret, counterFor()))
    const response = await app.request(
      '/panel/2fa/totp',
      { method: 'POST', body, headers: { Cookie: cookie } },
      env,
    )
    expect(response.status).toBe(303)
    const promoted = cookieOf(response)
    expect(await (await app.request('/panel', { headers: { Cookie: promoted } }, env)).text())
      .toContain('nav class="tabs"')
  })

  it('**رمز استُعمل لا يُقبل ثانية** — ولو بقي من نافذته ثوان', async () => {
    const setup = await loginWithToken()
    await readCsrf(setup.cookie)
    const secret = await enrollTotp(setup)
    const code = await codeAt(secret, counterFor())

    const attempt = async (): Promise<number> => {
      const { cookie } = await loginWithToken()
      const pendingCsrf = await readCsrf(cookie, '/panel/2fa')
      const body = new FormData()
      body.set('_csrf', pendingCsrf)
      body.set('code', code)
      const response = await app.request(
        '/panel/2fa/totp',
        { method: 'POST', body, headers: { Cookie: cookie } },
        env,
      )
      return response.status
    }
    expect(await attempt()).toBe(303)
    expect(await attempt()).toBe(401)
  })

  /*
   * ‏‏D-317 · البند ٤: لم يكن لرمز التطبيق سقفٌ للحساب، والمعلَّقةُ تعيش ثلاثة أيّام — فمن ملك العاملَ الأوّل وبدّل
   * ‏عناوينه خمّن نحو ألفين وثمانمئة مرّةٍ في اليوم. والآن خمسٌ للجلسة المعلَّقة، والسادسةُ تُسقطها.
   */
  it('D-317: خمسُ محاولاتٍ خاطئة من عناوين شتّى تُسقط الجلسةَ المعلَّقة', async () => {
    const setup = await loginWithToken()
    await readCsrf(setup.cookie)
    await enrollTotp(setup)
    const { cookie, csrf: pendingCsrf } = await pendingScreen()
    const statuses: number[] = []
    for (let i = 0; i < 6; i += 1) {
      const body = new FormData()
      body.set('_csrf', pendingCsrf)
      body.set('code', '000000')
      statuses.push((await app.request('/panel/2fa/totp', {
        method: 'POST', body, headers: { Cookie: cookie, 'CF-Connecting-IP': `198.51.100.${i}` },
      }, env)).status)
    }
    expect(statuses).toEqual([401, 401, 401, 401, 401, 429])
    expect(await kv.get(`session:${cookie.split('=')[1]}`)).toBeNull()
    expect((await app.request('/panel/2fa', { headers: { Cookie: cookie } }, env)).headers.get('Location')).toBe('/panel')
  })
})

describe('رموز الاسترداد', () => {
  it('تُولَّد مع أوّل تأكيد لرمز التطبيق — فلا يصير الفقد قفلا', async () => {
    const { cookie } = await loginWithToken()
    await readCsrf(cookie)
    const started = await post('/panel/security/totp/start', cookie)
    const { secret } = (await started.json()) as { secret: string }
    const confirmed = await post('/panel/security/totp/confirm', cookie, {
      code: await codeAt(secret, counterFor()),
    })
    const { codes } = (await confirmed.json()) as { codes: string[] }
    expect(codes.length).toBeGreaterThan(0)
    expect((await countRecoveryCodes(db, OWNER_EMAIL)).unused).toBe(codes.length)
  })

  it('لا تُخزَّن نصّا', async () => {
    const { s } = await ownerWithPasskey()
    const response = await post('/panel/security/recovery/issue', s.cookie)
    const { codes } = (await response.json()) as { codes: string[] }

    const { results } = await db.prepare('SELECT hash FROM recovery_codes').all<{ hash: string }>()
    const stored = results.map((r) => r.hash).join(' ')
    for (const code of codes) expect(stored).not.toContain(code.replace('-', ''))
  })

  async function useCode(code: string): Promise<number> {
    const { cookie } = await loginWithToken()
    const pendingCsrf = await readCsrf(cookie, '/panel/2fa')
    const body = new FormData()
    body.set('_csrf', pendingCsrf)
    body.set('code', code)
    return (await app.request('/panel/2fa/recovery', { method: 'POST', body, headers: { Cookie: cookie } }, env)).status
  }

  it('تفتح اللوحة، وتُستهلَك مرّةً واحدة', async () => {
    const { key } = await ownerWithPasskey()
    const codes = key.codes

    expect(await useCode(codes[0]!)).toBe(303)
    expect(await useCode(codes[0]!)).toBe(401)
    expect(await useCode(codes[1]!)).toBe(303)
    expect((await countRecoveryCodes(db, OWNER_EMAIL)).unused).toBe(codes.length - 2)
  })

  it('D-317: ورمزُ استرداد حسابٍ آخر لا يفتح بابَ المالك', async () => {
    await ownerWithPasskey()
    const theirs = await issueRecoveryCodes(db, 'a@example.com')
    expect(await useCode(theirs[0]!)).toBe(401)
  })

  /*
   * ‏**والوجهةُ تعبر العاملَ الثاني** (ر-11) — إلّا في هذا الباب (مراجعة ر-11). التحذيرُ
   * ‏«دخلتَ برمز استرداد — بقي N» وميضٌ لا يقرؤه إلّا `/panel` وصفحةُ المنصّة، فكانت العودةُ
   * ‏إلى التقرير تُسقطه بعد دقيقةٍ بلا أن يُرى. **فالتحذيرُ أولى من الصفحة المطلوبة.**
   */
  it('وتعود باللوحة لا بالصفحة المطلوبة — فيُرى «بقي N» ولا يسقط', async () => {
    const { key } = await ownerWithPasskey()
    const codes = key.codes

    const first = await emailLogin(app, env, { next: '/panel/report', secondFactor: false })
    expect(first.headers.get('Location')).toBe('/panel/2fa')
    const cookie = cookieOf(first)
    const pendingCsrf = await readCsrf(cookie, '/panel/2fa')
    const second = new FormData()
    second.set('_csrf', pendingCsrf)
    second.set('code', codes[0]!)
    const done = await app.request('/panel/2fa/recovery', { method: 'POST', body: second, headers: { Cookie: cookie } }, env)
    expect(done.status).toBe(303)
    expect(done.headers.get('Location')).toBe('/panel')
    const promoted = cookieOf(done)
    const panel = await (await app.request('/panel', { headers: { Cookie: promoted } }, env)).text()
    expect(panel).toContain(`دخلت برمز استرداد — بقي ${codes.length - 1} منها`)
  })

  it('ورمز التطبيق يعود إلى الصفحة المطلوبة كما كان (ر-11)', async () => {
    const setup = await loginWithToken()
    await readCsrf(setup.cookie)
    const secret = await enrollTotp(setup)

    const first = await emailLogin(app, env, { next: '/panel/report', secondFactor: false })
    const cookie = cookieOf(first)
    const pendingCsrf = await readCsrf(cookie, '/panel/2fa')
    const second = new FormData()
    second.set('_csrf', pendingCsrf)
    second.set('code', await codeAt(secret, counterFor()))
    const done = await app.request('/panel/2fa/totp', { method: 'POST', body: second, headers: { Cookie: cookie } }, env)
    expect(done.status).toBe(303)
    expect(done.headers.get('Location')).toBe('/panel/report')
  })

  it('تُقرأ بلا حساسيّة للشرطة وحالة الأحرف', async () => {
    const { key } = await ownerWithPasskey()
    expect(await useCode(key.codes[0]!.toLowerCase().replace('-', ' '))).toBe(303)
  })

  it('التوليد الجديد يُبطل القديمة كلَّها', async () => {
    const { s, key } = await ownerWithPasskey()
    await post('/panel/security/recovery/issue', s.cookie)
    expect(await useCode(key.codes[0]!)).toBe(401)
  })
})

describe('لا يُقفَل المالك خارج لوحته', () => {
  it('حذف آخر عامل ثان يُمنع ويُقال السبب', async () => {
    const { s } = await ownerWithPasskey()
    const [key] = await listPasskeys(db, RP_ID)

    const response = await post('/panel/security/passkey/delete', s.cookie, { id: key!.id })
    expect(response.status).toBe(409)
    expect(await listPasskeys(db, RP_ID)).toHaveLength(1)
  })

  it('ويُسمح به إن بقي عامل آخر', async () => {
    const { s } = await ownerWithPasskey()
    await enrollTotp(s)
    const [key] = await listPasskeys(db, RP_ID)

    const response = await post('/panel/security/passkey/delete', s.cookie, { id: key!.id })
    expect(response.status).toBe(200)
    expect(await listPasskeys(db, RP_ID)).toHaveLength(0)
  })

  it('وإزالة رمز التطبيق تُمنع إن كان الأخير', async () => {
    const s = await loginWithToken()
    await readCsrf(s.cookie)
    await enrollTotp(s)
    expect((await post('/panel/security/totp/remove', s.cookie)).status).toBe(409)
  })

  it('D-317: ومعرّفُ مفتاحِ حسابٍ آخر لا يحذف شيئًا', async () => {
    const { s } = await ownerWithPasskey()
    await enrollTotp(s)
    const other = await fakeAuthenticator()
    const theirs = await addPasskey(db, { credentialId: other.credentialId, publicKey: other.publicKey, alg: -7, signCount: 0, label: 'م', rpId: RP_ID, email: 'a@example.com' })
    const response = await post('/panel/security/passkey/delete', s.cookie, { id: theirs })
    expect(await response.json()).toEqual({ ok: false })
    expect(await listPasskeys(db, RP_ID, 'a@example.com')).toHaveLength(1)
  })
})

describe('تدوير الرمز يُبطل جلسة مفتاح المرور أيضا', () => {
  it('الجلسة مربوطة بالرمز وإن لم تُفتح به', async () => {
    const { key } = await ownerWithPasskey()

    const ticketResponse = await app.request('/panel/passkey/challenge', { method: 'POST' }, env)
    const { ticket, challenge } = (await ticketResponse.json()) as {
      ticket: string
      challenge: string
    }
    const response = await app.request(
      '/panel/passkey/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket, ...(await key.sign({ challenge, origin: ORIGIN, rpId: RP_ID, signCount: 5 })) }),
      },
      env,
    )
    const cookie = cookieOf(response)

    const rotated = { ...env, ADMIN_TOKEN: 'Zz9qW8vY1nMtB6oS3uXgA7dC5eI2kH0f' }
    const html = await (await app.request('/panel', { headers: { Cookie: cookie } }, rotated)).text()
    expect(html).toContain('name="email"')
  })
})

describe('D-161 — إحكام باب الدخول', () => {
  it('**ألف طلب متزامن لا يفحص إلّا خمسة رموز**: الحجز قبل الفحص', async () => {
    const setup = await loginWithToken()
    await readCsrf(setup.cookie)
    await enrollTotp(setup)
    const { cookie, csrf: pendingCsrf } = await pendingScreen()

    const statuses = await Promise.all(Array.from({ length: 12 }, async () => {
      const body = new FormData()
      body.set('_csrf', pendingCsrf)
      body.set('code', '000000')
      const response = await app.request(
        '/panel/2fa/totp',
        { method: 'POST', body, headers: { Cookie: cookie } },
        env,
      )
      return response.status
    }))
    // ‏على الشيفرة القديمة قرأت الاثنا عشرَ «صفرًا» من KV قبل أن تكتب واحدةٌ، ففُحصت كلُّها
    const checked = db.raw
      .prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = '2fa.denied' AND detail = 'totp'")
      .get() as { n: number }
    expect(checked.n).toBeLessThanOrEqual(5)
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThanOrEqual(7)
  })

  it('المفتاح وحدَه لا يفتح اللوحة بلا تحقّق من صاحبه (UV)', async () => {
    const { key } = await ownerWithPasskey()

    const ticketResponse = await app.request('/panel/passkey/challenge', { method: 'POST' }, env)
    const { ticket, challenge } = (await ticketResponse.json()) as { ticket: string; challenge: string }
    const signed = await key.sign({ challenge, origin: ORIGIN, rpId: RP_ID, userVerified: false, signCount: 5 })
    const response = await app.request(
      '/panel/passkey/login',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticket, ...signed }) },
      env,
    )
    expect(response.status).toBe(401)
    expect(response.headers.get('Set-Cookie')).toBeNull()
    expect(await response.json()).toEqual({ error: 'uv_required' })
  })

  it('والمفتاح نفسُه بلا UV يبقى عاملًا ثانيًا بعد رمز البريد', async () => {
    const { key } = await ownerWithPasskey()
    const { cookie, csrf: pendingCsrf, challenge } = await pendingScreen()

    const body = new FormData()
    body.set('_csrf', pendingCsrf)
    body.set('assertion', JSON.stringify(
      await key.sign({ challenge, origin: ORIGIN, rpId: RP_ID, userVerified: false, signCount: 5 })))
    const response = await app.request(
      '/panel/2fa/passkey',
      { method: 'POST', body, headers: { Cookie: cookie } },
      env,
    )
    expect(response.status).toBe(303)
    expect(response.headers.get('Location')).toBe('/panel')
  })

  it('تحدّ انتهت مهلتُه في شاشة العامل الثاني: صفحة عربيّة بتحدّ جديد لا سطر JSON', async () => {
    const { key } = await ownerWithPasskey()
    const { cookie, csrf: pendingCsrf, challenge } = await pendingScreen()
    // ‏مرّت خمسُ دقائق: التحدّي غاب من KV والصفحةُ ما زالت مفتوحة
    const { keys } = await kv.list!({ prefix: 'webauthn:' })
    for (const { name } of keys) await kv.delete(name)

    const body = new FormData()
    body.set('_csrf', pendingCsrf)
    body.set('assertion', JSON.stringify(await key.sign({ challenge, origin: ORIGIN, rpId: RP_ID, signCount: 5 })))
    const response = await app.request(
      '/panel/2fa/passkey',
      { method: 'POST', body, headers: { Cookie: cookie } },
      env,
    )
    const html = await response.text()
    expect(response.headers.get('Content-Type') ?? '').toContain('text/html')
    expect(html).not.toContain('"error"')
    expect(html).toMatch(/انتهت مهلة الصفحة|لم يُقبَل المفتاح/)
    expect(html).toMatch(/data-challenge="[^"]+"/)
  })

  it('نموذج العامل الثاني بلا جلسة يعود إلى الدخول، وبرمز نموذج قديم يُعاد رسمُه', async () => {
    const orphan = await app.request('/panel/2fa/totp', { method: 'POST', body: new FormData() }, env)
    expect(orphan.status).toBe(303)
    expect(orphan.headers.get('Location')).toBe('/panel')

    const setup = await loginWithToken()
    await readCsrf(setup.cookie)
    await enrollTotp(setup)
    const { cookie } = await pendingScreen()
    const body = new FormData()
    body.set('_csrf', 'stale')
    body.set('code', '000000')
    const stale = await app.request('/panel/2fa/totp', { method: 'POST', body, headers: { Cookie: cookie } }, env)
    expect(stale.status).toBe(403)
    expect(await stale.text()).toContain('انتهت صلاحية الصفحة')
  })

  it('رمز بريد خاطئ يقول ما بقي بعربيّة صحيحة، وباب المفتاح في خطوة البريد', async () => {
    await ownerWithPasskey()

    await requestCode(app, env)
    const body = new FormData()
    body.set('code', '000000')
    const response = await app.request('/panel/login', { method: 'POST', body }, env)
    const html = await response.text()
    expect(response.status).toBe(401)
    expect(html).toMatch(/الرمز غير صحيح — بقيت 4 محاولات\.|الرمز غير صحيح أو انتهت مهلته/)
    const again = new FormData()
    again.set('again', '1')
    const back = await (await app.request('/panel/login/code', { method: 'POST', body: again }, env)).text()
    expect(back).toContain('id="pk-login"')
  })

  it('وجلسة انتهت في منتصف عمل تعيد صفحة دخول ببابه كذلك', async () => {
    await ownerWithPasskey()
    // ‏كعكةُ جلسةٍ سقطت — لا كعكةٌ غريبة: من لم يدخل قطّ لا يُقال له «انتهت» (ر-11)
    const html = await (await app.request('/panel/channels/x', { headers: { Cookie: '__Host-sada_session=gone' } }, env)).text()
    expect(html).toContain('انتهت الجلسة')
    expect(html).toContain('id="pk-login"')
  })

  /*
   * ‏مراجعة D-317: كان «إصدار التحدّيات لمجهول له سقف: كلّ تحدّ كتابة مدفوعة في KV» يتوقّع 429 بعد العشرين — والسقفُ
   * ‏نفسُه هو ما ملأته كتلةُ `/48` فردّت تحدّي المالك. والتحدّي الآن موقَّعٌ بلا حالة: لا كتابةَ فلا سقف.
   */
  it('إصدار التحدّيات لمجهول بلا كتابةٍ في KV — فلا سقفَ يُملأ', async () => {
    await ownerWithPasskey()
    const statuses: number[] = []
    for (let i = 0; i < 22; i += 1) {
      statuses.push((await app.request('/panel/passkey/challenge', { method: 'POST' }, env)).status)
    }
    expect(statuses.every((s) => s === 200)).toBe(true)
    expect((await kv.list!({ prefix: 'webauthn' })).keys).toEqual([])
  })

  it('سبب الرفض في السجلّ لا يحمل مليون بايت أرسلها مجهول، وجسد ضخم لا يُقرأ', async () => {
    const { key } = await ownerWithPasskey()
    const ticketResponse = await app.request('/panel/passkey/challenge', { method: 'POST' }, env)
    const { ticket } = (await ticketResponse.json()) as { ticket: string }
    const clientDataJSON = Buffer.from(JSON.stringify({ type: 'X'.repeat(9000), challenge: 'c', origin: ORIGIN }))
      .toString('base64url')
    await app.request('/panel/passkey/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket, credentialId: key.credentialId, authenticatorData: 'AA', clientDataJSON, signature: 'AA' }),
    }, env)
    const row = db.raw
      .prepare("SELECT detail FROM audit_log WHERE action = 'passkey.denied' ORDER BY id DESC LIMIT 1")
      .get() as { detail: string }
    expect(row.detail.length).toBeLessThanOrEqual(300)

    const huge = await app.request('/panel/passkey/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': String(64 * 1024) },
      body: JSON.stringify({ pad: 'x'.repeat(64 * 1024) }),
    }, env)
    expect(huge.status).toBe(413)
  })
})

/*
 * ‏‏D-317 · البند ١: كانت قراءةُ العوامل تبلع خطأ القاعدة فتقول «لا عامل»، فرمزُ بريدٍ صحيحٌ مع عثرةٍ في D1 يفتح جلسةَ
 * ‏مالكٍ كاملة. على الشيفرة القديمة يردّ هذا الاختبارُ 303 إلى `/panel` بكعكة جلسة.
 */
describe('D-317 · قاعدةٌ لا تردّ لا تفتح جلسة', () => {
  it('رمزٌ صحيحٌ والعواملُ لا تُقرأ ← لا جلسة، و«أعد المحاولة»، والرمزُ لم يُستهلك', async () => {
    await ownerWithPasskey()
    const code = await requestCode(app, env)
    db.raw.exec('ALTER TABLE passkeys RENAME TO passkeys_away')
    const body = new FormData()
    body.set('code', code)
    const response = await app.request('/panel/login', { method: 'POST', body }, env)
    expect(response.status).toBe(503)
    expect(response.headers.get('Set-Cookie') ?? '').not.toContain('__Host-sada_session=')
    expect(await response.text()).toContain('لم تُفتح جلسة')

    db.raw.exec('ALTER TABLE passkeys_away RENAME TO passkeys')
    const retry = new FormData()
    retry.set('code', code)
    const again = await app.request('/panel/login', { method: 'POST', body: retry }, env)
    expect(again.headers.get('Location')).toBe('/panel/2fa')
  })

  it('وشاشةُ العامل الثاني على قاعدةٍ لا تردّ تقول ذلك ولا تُرقّي', async () => {
    await ownerWithPasskey()
    const { cookie } = await loginWithToken()
    db.raw.exec('ALTER TABLE passkeys RENAME TO passkeys_away')
    const response = await app.request('/panel/2fa', { headers: { Cookie: cookie } }, env)
    expect(response.status).toBe(503)
    expect(await response.text()).toContain('القاعدةُ لم تردّ')
  })
})

describe('D-317 · تحقّق للتوّ قبل الأفعال الحسّاسة', () => {
  /** يُتحقَّق بالمفتاح من صفحة «تحقّق للتوّ» — كما يفعل المالك. */
  async function stepUp(s: S, key: FakeAuthenticator, next: string, signCount: number): Promise<Response> {
    const page = await (await app.request(`/panel/stepup?next=${encodeURIComponent(next)}`, { headers: { Cookie: s.cookie } }, env)).text()
    const challenge = /data-challenge="([^"]+)"/.exec(page)?.[1] ?? ''
    const token = /name="_csrf" value="([^"]+)"/.exec(page)?.[1] ?? ''
    const body = new FormData()
    body.set('_csrf', token)
    body.set('next', next)
    body.set('assertion', JSON.stringify(await key.sign({ challenge, origin: ORIGIN, rpId: RP_ID, signCount })))
    return app.request('/panel/stepup/passkey', { method: 'POST', body, headers: { Cookie: s.cookie } }, env)
  }

  it('إضافةُ مفتاحٍ بعد خمس دقائق تُردّ إلى «تحقّق للتوّ»، ثمّ تمضي بعده', async () => {
    const { s, key } = await ownerWithPasskey()
    await age(s.cookie, 'fresh', 6)
    const blocked = await post('/panel/security/passkey/challenge', s.cookie)
    expect(blocked.status).toBe(403)
    const reply = (await blocked.json()) as { error: string; to: string }
    expect(reply.error).toBe('step_up')
    expect(reply.to).toBe(`/panel/stepup?next=${encodeURIComponent('/panel/settings#factors')}`)

    const done = await stepUp(s, key, '/panel/settings#factors', 5)
    expect(done.status).toBe(303)
    expect(done.headers.get('Location')).toBe('/panel/settings#factors')
    expect((await post('/panel/security/passkey/challenge', s.cookie)).status).toBe(200)
  })

  it('والدعوةُ بلا تحقّقٍ حديث تُحفظ وتُعاد رسمًا بعد التحقّق — لا تُرسَل بلا ضغطة', async () => {
    const { s, key } = await ownerWithPasskey()
    await age(s.cookie, 'fresh', 6)
    await readCsrf(s.cookie, '/panel/team')
    const held = await post('/panel/team/invite', s.cookie, { email: 'new@example.com', role: 'admin', all: '1' })
    expect(held.status).toBe(303)
    expect(held.headers.get('Location')).toBe(`/panel/stepup?next=${encodeURIComponent('/panel/stepup/resume')}`)
    expect(db.raw.prepare('SELECT COUNT(*) AS n FROM members').get()).toEqual({ n: 0 })

    const done = await stepUp(s, key, '/panel/stepup/resume', 5)
    expect(done.headers.get('Location')).toBe('/panel/stepup/resume')
    const page = await (await app.request('/panel/stepup/resume', { headers: { Cookie: s.cookie } }, env)).text()
    expect(page).toContain('action="/panel/team/invite"')
    expect(page).toContain('value="new@example.com"')
    expect(page).not.toContain('name="_csrf" value=""')
    // ‏لم يُرسَل شيءٌ بعد — والضغطةُ عليه
    expect(db.raw.prepare('SELECT COUNT(*) AS n FROM members').get()).toEqual({ n: 0 })
    const token = /name="_csrf" value="([^"]+)"/.exec(page)?.[1] ?? ''
    const body = new FormData()
    for (const [, name, value] of page.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)">/g)) body.set(name!, value!)
    body.set('_csrf', token)
    const sent = await app.request('/panel/team/invite', { method: 'POST', body, headers: { Cookie: s.cookie } }, env)
    expect(sent.status).toBe(303)
    expect(db.raw.prepare('SELECT email, role FROM members').get()).toEqual({ email: 'new@example.com', role: 'admin' })
  })

  it('ومفتاحُ المزوّد لا يُحفظ في الطريق: يُطلب ثانيةً بعد التحقّق', async () => {
    const { s } = await ownerWithPasskey()
    await age(s.cookie, 'fresh', 6)
    await readCsrf(s.cookie, '/panel/settings')
    await post('/panel/providers/key', s.cookie, { provider: 'anthropic', key: 'sk-ant-SECRET-1234567890abcdef' })
    const saved = await kv.get(`stepup-form:${s.cookie.split('=')[1]}`)
    expect(saved).not.toBeNull()
    expect(saved).not.toContain('SECRET')
    expect(JSON.parse(saved!)).toMatchObject({ action: '/panel/providers/key', secrets: ['key'] })
  })

  it('وقناةُ التنبيهات وفصلُ الحساب وإخراجُ الأجهزة كذلك، والإعدادُ العاديّ يمضي', async () => {
    const { s } = await ownerWithPasskey()
    await age(s.cookie, 'fresh', 6)
    await readCsrf(s.cookie, '/panel/settings')
    const hook = await post('/panel/settings', s.cookie, { key: 'alert_webhook', value: 'https://hooks.example.com/x' })
    expect(hook.headers.get('Location') ?? '').toContain('/panel/stepup')
    expect((await readSettings(db)).alertWebhook).toBe('')
    const out = await post('/panel/sessions/revoke-all', s.cookie)
    expect(out.headers.get('Location') ?? '').toContain('/panel/stepup')
    const cut = await post('/panel/channels/disconnect', s.cookie, { platform: 'x', account: 'x:1' })
    expect(cut.headers.get('Location') ?? '').toContain('/panel/stepup')
    const plain = await post('/panel/settings', s.cookie, { key: 'paused', value: 'true' })
    expect(plain.headers.get('Location') ?? '').not.toContain('/panel/stepup')
    expect((await readSettings(db)).paused).toBe(true)
  })

  it('وبدءُ الربط يُردّ إلى «تحقّق للتوّ» بوجهته', async () => {
    const { s } = await ownerWithPasskey()
    await age(s.cookie, 'fresh', 6)
    const res = await app.request('/oauth/linkedin/start?scope=post', { headers: { Cookie: s.cookie } }, env)
    expect(res.status).toBe(303)
    expect(res.headers.get('Location')).toBe(`/panel/stepup?next=${encodeURIComponent('/oauth/linkedin/start?scope=post')}`)
  })

  it('ورمزُ البريد في «تحقّق للتوّ» لمن لا عاملَ له وحده', async () => {
    const enrol = await loginWithToken()
    const page = await (await app.request('/panel/stepup?next=/panel/enrol', { headers: { Cookie: enrol.cookie } }, env)).text()
    expect(page).toContain('أرسل الرمز إلى بريدي')
    expect(page).not.toContain('id="pk-btn"')

    const { s } = await ownerWithPasskey()
    const withKey = await (await app.request('/panel/stepup?next=/panel', { headers: { Cookie: s.cookie } }, env)).text()
    expect(withKey).not.toContain('أرسل الرمز إلى بريدي')
    expect(withKey).toContain('id="pk-btn"')
  })

  it('ومن لا عاملَ له يتحقّق برمز البريد، ورمزُ الدخول لا يصلح له', async () => {
    const enrol = await loginWithToken()
    await age(enrol.cookie, 'fresh', 6)
    await readCsrf(enrol.cookie, '/panel/enrol')
    expect((await post('/panel/security/passkey/challenge', enrol.cookie)).status).toBe(403)
    const mailer = env['EMAIL'] as FakeMailer
    const before = mailer.sent.length
    const sent = await post('/panel/stepup/code/send', enrol.cookie, { next: '/panel/enrol' })
    expect(sent.headers.get('Location')).toBe(`/panel/stepup?next=${encodeURIComponent('/panel/enrol')}&sent=1`)
    expect(mailer.sent.length).toBe(before + 1)
    const code = /\b(\d{6})\b/.exec(mailText(mailer, OWNER_EMAIL).at(-1) ?? '')?.[1] ?? ''
    const ok = await post('/panel/stepup/code', enrol.cookie, { next: '/panel/enrol', code })
    expect(ok.headers.get('Location')).toBe('/panel/enrol')
    expect((await post('/panel/security/passkey/challenge', enrol.cookie)).status).toBe(200)
  })

  it('ووجهةٌ إلى خارج اللوحة تُردّ إلى الرئيسيّة', async () => {
    const { s, key } = await ownerWithPasskey()
    const done = await stepUp(s, key, 'https://evil.example/x', 5)
    expect(done.headers.get('Location')).toBe('/panel')
  })
})

describe('D-317 · إشعاراتُ الأمان خارج القاعدة', () => {
  it('دخولٌ جديد: بريدٌ إلى صاحبه بلا رمز، وصفٌّ في القناة، وإشعارٌ في لوحة جلسته الأخرى', async () => {
    const { s, key } = await ownerWithPasskey()
    const mailer = env['EMAIL'] as FakeMailer
    const ticket = (await (await app.request('/panel/passkey/challenge', { method: 'POST' }, env)).json()) as { ticket: string; challenge: string }
    const login = await app.request('/panel/passkey/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (iPhone) Safari/605' },
      body: JSON.stringify({ ticket: ticket.ticket, ...(await key.sign({ challenge: ticket.challenge, origin: ORIGIN, rpId: RP_ID, signCount: 9 })) }),
    }, env)
    expect(login.status).toBe(200)

    const mails = mailText(mailer, OWNER_EMAIL).filter((m) => m.startsWith('صدى — دخولٌ جديد'))
    expect(mails.length).toBeGreaterThanOrEqual(1)
    const last = mails.at(-1)!
    expect(last).toContain('Safari · iOS')
    expect(last).not.toMatch(/\b\d{6}\b(?!\s*UTC)/)
    expect(last).not.toContain('__Host-sada_session')

    const rows = db.raw.prepare("SELECT body FROM alert_outbox WHERE kind = 'security'").all() as { body: string }[]
    expect(rows.some((r) => r.body.includes('دخولٌ جديد'))).toBe(true)

    // ‏والإشعارُ في جلسته الأولى — لا في الجلسة التي فُتحت به
    const first = await (await app.request('/panel/notices', { headers: { Cookie: s.cookie } }, env)).text()
    expect(first).toContain('دخولٌ جديد إلى حسابك')
    const fresh = await (await app.request('/panel/notices', { headers: { Cookie: cookieOf(login) } }, env)).text()
    expect((fresh.match(/دخولٌ جديد إلى حسابك/g) ?? []).length).toBeLessThan((first.match(/دخولٌ جديد إلى حسابك/g) ?? []).length)
  })

  it('عاملٌ أُضيف وأُزيل، ورمزُ استرداد، وإخراجُ الأجهزة: كلٌّ له صفٌّ في القناة وفي التدقيق', async () => {
    const { s, key } = await ownerWithPasskey()
    await enrollTotp(s)
    await post('/panel/security/totp/remove', s.cookie)
    await post('/panel/sessions/revoke-all', s.cookie)
    const pending = await loginWithToken()
    const token = await readCsrf(pending.cookie, '/panel/2fa')
    const body = new FormData()
    body.set('_csrf', token)
    body.set('code', key.codes[0]!)
    expect((await app.request('/panel/2fa/recovery', { method: 'POST', body, headers: { Cookie: pending.cookie } }, env)).status).toBe(303)

    const kinds = (db.raw.prepare("SELECT detail FROM audit_log WHERE action = 'security.notice' AND by_email = ?").all(OWNER_EMAIL) as { detail: string }[])
      .map((r) => r.detail.split(' ')[0])
    // ‏ورمزُ الاسترداد حدثٌ واحدٌ يقول الدخولَ معه — لا رسالتان لدخولٍ واحد
    for (const k of ['factor.add', 'factor.remove', 'sessions.revoke_all', 'recovery.used']) expect(kinds).toContain(k)
    const outbox = db.raw.prepare("SELECT COUNT(*) AS n FROM alert_outbox WHERE kind = 'security'").get() as { n: number }
    expect(outbox.n).toBe(kinds.length)
    // ‏ولا سرَّ في أيٍّ منها
    for (const r of db.raw.prepare("SELECT body FROM alert_outbox WHERE kind = 'security'").all() as { body: string }[]) {
      expect(r.body).not.toMatch(/[A-Z0-9]{5}-[A-Z0-9]{5}/)
    }
  })
})

/*
 * ‏**مراجعةُ D-317** — كلُّ بندٍ هنا سقط على الشيفرة قبل إصلاحه (أرقامُه في القرار، «المراجعة»).
 */
describe('D-317 · المراجعة', () => {
  /** قاعدةٌ ترمي على أوّل قراءةٍ لصفّ `members` بعد التسليح — عثرةٌ عابرةٌ واحدة، وما سواها يمضي. */
  function blip(): { arm(): void; hits(): number } {
    let armed = false
    let hits = 0
    const real = db.prepare.bind(db)
    ;(db as unknown as { prepare: (q: string) => unknown }).prepare = (q: string) => {
      if (armed && /FROM members WHERE email/.test(q)) {
        armed = false
        hits += 1
        const boom = { bind: () => boom, first: () => Promise.reject(new Error('D1_ERROR: transient')) }
        return boom
      }
      return real(q)
    }
    return { arm: () => { armed = true }, hits: () => hits }
  }

  it('المراجعة ١: عثرةُ D1 في قراءة الدور عند الدخول لا تفتح جلسةَ مديرٍ بلا عامل — 503 بلا جلسة، والرمزُ باقٍ', async () => {
    db.raw.exec(`INSERT INTO members (email, role, orgs, invited_by) VALUES ('a@example.com', 'admin', '*', 'x')`)
    const code = await requestCode(app, env, 'a@example.com')
    const d1 = blip()
    d1.arm()
    const body = new FormData()
    body.set('email', 'a@example.com')
    body.set('code', code)
    const res = await app.request('/panel/login', { method: 'POST', body }, env)
    expect(d1.hits()).toBe(1)
    expect(res.status).toBe(503)
    expect(res.headers.get('Set-Cookie') ?? '').not.toContain('__Host-sada_session=')
    // ‏والرمزُ لم يُستهلك: يعيده صاحبُه بعد دقيقة فيصل إلى صفحة التسجيل لا إلى اللوحة
    const again = new FormData()
    again.set('email', 'a@example.com')
    again.set('code', code)
    expect((await app.request('/panel/login', { method: 'POST', body: again }, env)).headers.get('Location')).toBe('/panel/enrol')
  })

  it('المراجعة ١: وطلبُ الرمز على قاعدةٍ لا تردّ يقول ذلك ولا يُرسل شيئًا', async () => {
    db.raw.exec(`INSERT INTO members (email, role, orgs, invited_by) VALUES ('a@example.com', 'admin', '*', 'x')`)
    const mailer = env['EMAIL'] as FakeMailer
    const before = mailer.sent.length
    blip().arm()
    const body = new FormData()
    body.set('email', 'a@example.com')
    const res = await app.request('/panel/login/code', { method: 'POST', body }, env)
    expect(res.status).toBe(503)
    expect(mailer.sent.length).toBe(before)
  })

  it('المراجعة ١: وعثرةُ D1 في الحارس لا تُمرّر الطلبَ ولا تُسقط جلسةَ العضو', async () => {
    db.raw.exec(`INSERT INTO members (email, role, orgs, invited_by) VALUES ('e@example.com', 'editor', '*', 'x')`)
    const cookie = cookieOf(await emailLogin(app, env, { email: 'e@example.com', secondFactor: false }))
    blip().arm()
    const res = await app.request('/panel', { headers: { Cookie: cookie, Accept: 'text/html' } }, env)
    expect(res.status).toBe(500)
    expect(await res.text()).toContain('حدث خطأ من جهتنا')
    expect(await kv.get(`session:${cookie.split('=')[1]}`)).not.toBeNull()
    expect((await app.request('/panel', { headers: { Cookie: cookie } }, env)).status).toBe(200)
  })

  it('المراجعة ٢: محرّرٌ بلا عاملٍ رُقّي مديرًا وجلستُه مفتوحة يُردّ إلى الدخول، ودخولُه التالي جلسةُ تسجيل', async () => {
    db.raw.exec(`INSERT INTO members (email, role, orgs, invited_by) VALUES ('e@example.com', 'editor', '*', 'x')`)
    const res = await emailLogin(app, env, { email: 'e@example.com', secondFactor: false })
    expect(res.headers.get('Location')).toBe('/panel')
    const cookie = cookieOf(res)
    db.raw.exec(`UPDATE members SET role = 'admin' WHERE email = 'e@example.com'`)
    const settings = await app.request('/panel/settings', { headers: { Cookie: cookie } }, env)
    expect(settings.status).not.toBe(200)
    expect(await settings.text()).toContain('يلزمه عاملٌ ثانٍ')
    expect(await kv.get(`session:${cookie.split('=')[1]}`)).toBeNull()
    // ‏وفعلٌ بالجلسة نفسِها لا يمرّ
    const oauth = await app.request('/oauth/linkedin/start', { headers: { Cookie: cookie } }, env)
    expect(oauth.headers.get('Location') ?? '').not.toContain('linkedin.com')
    expect((await emailLogin(app, env, { email: 'e@example.com', secondFactor: false })).headers.get('Location')).toBe('/panel/enrol')
  })

  it('المراجعة ٢: ومن أثبت عاملًا في دخوله تبقى جلستُه بعد ترقيته', async () => {
    db.raw.exec(`INSERT INTO members (email, role, orgs, invited_by) VALUES ('e@example.com', 'editor', '*', 'x')`)
    const res = await emailLogin(app, env, { email: 'e@example.com' })
    const cookie = cookieOf(res)
    db.raw.exec(`UPDATE members SET role = 'admin' WHERE email = 'e@example.com'`)
    expect((await app.request('/panel/settings', { headers: { Cookie: cookie } }, env)).status).toBe(200)
  })

  it('المراجعة ٦: طلبُ HEAD لبدء الربط بلا تحقّقٍ حديث يُردّ إلى «تحقّق للتوّ» ولا يكتب حالة OAuth', async () => {
    env['LINKEDIN_CLIENT_ID'] = 'li-id'
    env['LINKEDIN_CLIENT_SECRET'] = 'li-secret-long-enough-xxxxxxxx'
    const { s } = await ownerWithPasskey()
    await age(s.cookie, 'fresh', 10)
    const head = await app.request('/oauth/linkedin/start', { method: 'HEAD', headers: { Cookie: s.cookie } }, env)
    expect(head.status).toBe(303)
    expect(head.headers.get('Location')).toBe(`/panel/stepup?next=${encodeURIComponent('/oauth/linkedin/start')}`)
    const keys = (await kv.list!({ prefix: '' })).keys.map((k) => k.name)
    expect(keys.filter((k) => k.startsWith('oauth:state'))).toEqual([])
  })

  it('المراجعة ١٠: ستُّ محاولاتٍ خاطئة لرمز التطبيق من عنوانٍ واحد تُسقط الجلسةَ المعلَّقة برسالتها', async () => {
    const setup = await loginWithToken()
    await readCsrf(setup.cookie)
    await enrollTotp(setup)
    const { cookie, csrf: pendingCsrf } = await pendingScreen()
    const replies: Response[] = []
    for (let i = 0; i < 6; i += 1) {
      const body = new FormData()
      body.set('_csrf', pendingCsrf)
      body.set('code', '000000')
      replies.push(await app.request('/panel/2fa/totp', {
        method: 'POST', body, headers: { Cookie: cookie, 'CF-Connecting-IP': '198.51.100.7' },
      }, env))
    }
    expect(replies.map((r) => r.status)).toEqual([401, 401, 401, 401, 401, 429])
    expect(await replies[5]!.text()).toContain('أُغلقت هذه المحاولة')
    expect(await kv.get(`session:${cookie.split('=')[1]}`)).toBeNull()
  })

  it('المراجعة ٥: تحدّي مفتاح المرور بلا حالة — لا كتابةَ في KV، ولا قاطعَ عامًّا يردّه', async () => {
    const { key } = await ownerWithPasskey()
    db.raw.exec(`INSERT OR REPLACE INTO auth_attempts (bucket, n, window_start) VALUES
      ('challenge:global', 99999, datetime('now')), ('global', 99999, datetime('now'))`)
    const statuses: number[] = []
    for (let i = 0; i < 25; i += 1) {
      statuses.push((await app.request('/panel/passkey/challenge', { method: 'POST', headers: { 'CF-Connecting-IP': '198.51.100.9' } }, env)).status)
    }
    expect(statuses.every((s) => s === 200)).toBe(true)
    expect((await kv.list!({ prefix: 'webauthn:' })).keys).toEqual([])
    // ‏والتذكرةُ تُقبل مرّةً واحدة — ومزوَّرةٌ لا تُقبل أصلًا
    const t = (await (await app.request('/panel/passkey/challenge', { method: 'POST' }, env)).json()) as { ticket: string; challenge: string }
    const signed = await key.sign({ challenge: t.challenge, origin: ORIGIN, rpId: RP_ID, signCount: 20 })
    const send = (ticket: string): Promise<Response> => Promise.resolve(app.request('/panel/passkey/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticket, ...signed }),
    }, env))
    const forged = t.ticket.replace(/.$/, (ch) => (ch === 'A' ? 'B' : 'A'))
    expect((await send(forged)).status).toBe(400)
    expect((await send(t.ticket)).status).toBe(200)
    expect((await send(t.ticket)).status).toBe(400)
  })

  it('المراجعة ٣ و٥: جهازٌ دخل من قبل لا يُقفله مجهول — لا القاطعُ العامّ ولا سقفُ الحساب', async () => {
    const { s } = await ownerWithPasskey()
    void s
    // ‏دخولٌ كاملٌ بمفتاح المرور يترك على الجهاز كعكتَه
    const first = await emailLogin(app, env)
    const device = (first.headers.get('Set-Cookie') ?? '').split(/,\s*(?=__Host-)/).find((c) => c.startsWith('__Host-sada_device='))
    expect(device).toBeDefined()
    const deviceCookie = device!.split(';')[0]!
    // ‏ثمّ يملأ مجهولٌ القاطعَ العامّ وسقفَ رمز الحساب من مصادر شتّى
    db.raw.exec(`INSERT OR REPLACE INTO auth_attempts (bucket, n, window_start) VALUES
      ('global', 99999, datetime('now')), ('code-issue:global', 99999, datetime('now')),
      ('code:${OWNER_EMAIL}', 99999, datetime('now'))`)
    const code = await requestCodeWith(deviceCookie)
    const body = new FormData()
    body.set('code', code)
    const trusted = await app.request('/panel/login', { method: 'POST', body, headers: { Cookie: deviceCookie } }, env)
    expect(trusted.headers.get('Location')).toBe('/panel/2fa')
    // ‏وجهازٌ لم يدخل من قبل يبقى مردودًا: الحدُّ يحرس الحسابَ من المجهول
    const stranger = new FormData()
    stranger.set('code', '123456')
    expect((await app.request('/panel/login', { method: 'POST', body: stranger }, env)).status).toBe(429)
  })

  /** يطلب رمزًا بكعكة الجهاز — كما يطلبه المالكُ من هاتفه. */
  async function requestCodeWith(deviceCookie: string): Promise<string> {
    await kv.delete(`logincode-gap:${OWNER_EMAIL}`)
    await kv.delete(`logincode-hour:${OWNER_EMAIL}`)
    const body = new FormData()
    body.set('email', OWNER_EMAIL)
    const res = await app.request('/panel/login/code', { method: 'POST', body, headers: { Cookie: deviceCookie } }, env)
    expect(res.status).toBe(200)
    const mails = mailText(env['EMAIL'] as FakeMailer, OWNER_EMAIL).filter((m) => m.includes('رمز الدخول'))
    return /\b(\d{6})\b/.exec(mails.at(-1) ?? '')?.[1] ?? ''
  }

  it('المراجعة ١٥: «تحقّق للتوّ» على قاعدةٍ لا تردّ لا يقول لصاحب الجلسة إنّه لا جلسةَ له', async () => {
    const { s } = await ownerWithPasskey()
    db.raw.exec('ALTER TABLE passkeys RENAME TO passkeys_away')
    const res = await app.request('/panel/stepup?next=/panel', { headers: { Cookie: s.cookie } }, env)
    expect(res.status).toBe(503)
    const html = await res.text()
    expect(html).not.toContain('لم تُفتح جلسة')
    expect(html).toContain('لم يُنفَّذ شيء')
  })

  it('المراجعة ١٢: مهلةُ «تحقّق للتوّ» تسمّي الزرَّ كما يُرى', async () => {
    const { s } = await ownerWithPasskey()
    const token = await readCsrf(s.cookie, '/panel/stepup?next=/panel')
    await kv.delete(`webauthn:up:${s.cookie.split('=')[1]}`)
    const body = new FormData()
    body.set('_csrf', token)
    body.set('next', '/panel')
    body.set('assertion', '{}')
    const html = await (await app.request('/panel/stepup/passkey', { method: 'POST', body, headers: { Cookie: s.cookie } }, env)).text()
    expect(html).toContain('«المس مفتاح المرور»')
  })

  it('المراجعة ١٣: «أكمل ما بدأته» يقول الدورَ باسمه لا بمفتاحه', async () => {
    const { s, key } = await ownerWithPasskey()
    await age(s.cookie, 'fresh', 6)
    await readCsrf(s.cookie, '/panel/team')
    await post('/panel/team/invite', s.cookie, { email: 'new@example.com', role: 'publisher', all: '1' })
    const page = await (await app.request('/panel/stepup?next=/panel/stepup/resume', { headers: { Cookie: s.cookie } }, env)).text()
    const challenge = /data-challenge="([^"]+)"/.exec(page)?.[1] ?? ''
    const body = new FormData()
    body.set('_csrf', /name="_csrf" value="([^"]+)"/.exec(page)?.[1] ?? '')
    body.set('next', '/panel/stepup/resume')
    body.set('assertion', JSON.stringify(await key.sign({ challenge, origin: ORIGIN, rpId: RP_ID, signCount: 30 })))
    await app.request('/panel/stepup/passkey', { method: 'POST', body, headers: { Cookie: s.cookie } }, env)
    const resume = await (await app.request('/panel/stepup/resume', { headers: { Cookie: s.cookie } }, env)).text()
    expect(resume).toContain('<bdi>ناشر</bdi>')
    expect(resume).not.toContain('<bdi>publisher</bdi>')
  })

  it('المراجعة ١٤: العضوُ يجد «أمان حسابك» في قائمة الحساب', async () => {
    db.raw.exec(`INSERT INTO members (email, role, orgs, invited_by) VALUES ('e@example.com', 'editor', '*', 'x')`)
    const cookie = cookieOf(await emailLogin(app, env, { email: 'e@example.com', secondFactor: false }))
    const html = await (await app.request('/panel', { headers: { Cookie: cookie } }, env)).text()
    expect(html).toContain('<a class="menu-item" href="/panel/enrol"><span class="menu-t"><b>أمان حسابك</b>')
    expect(html).not.toContain('href="/panel/settings#security"')
  })
})

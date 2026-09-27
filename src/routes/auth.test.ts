/**
 * العاملُ الثاني من طرفه إلى طرفه: قاعدةٌ حقيقيّة، و KV حقيقيّ، ومتوثِّقٌ
 * يوقّع توقيعا حقيقيّا بـ ECDSA.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { toBase64 } from '../lib/crypto'
import { readSettings } from '../lib/settings'
import { countRecoveryCodes, listPasskeys, totpState } from '../lib/security/factors'
import { codeAt, counterFor } from '../lib/security/totp'
import { fakeAuthenticator, type FakeAuthenticator } from '../test/authenticator'
import { fakeDb, fakeKv, type FakeDb } from '../test/fakes'
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
  }
})

/** يدخل بالرمز ويعيد الكعكة ووجهةَ إعادة التوجيه. */
async function loginWithToken(): Promise<{ cookie: string; location: string }> {
  const body = new FormData()
  body.set('token', TOKEN)
  const response = await app.request('/panel/login', { method: 'POST', body }, env)
  expect(response.status).toBe(303)
  return {
    cookie: (response.headers.get('Set-Cookie') ?? '').split(';')[0]!,
    location: response.headers.get('Location') ?? '',
  }
}

/** يقرأ رمز CSRF من الصفحة التي يفتحها هذا الكعك. */
async function readCsrf(cookie: string, path = '/panel'): Promise<string> {
  const response = await app.request(path, { headers: { Cookie: cookie } }, env)
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
): Promise<Response> {
  return await app.request(
    path,
    { method: 'POST', body: form(fields), headers: { Cookie: cookie } },
    env,
  )
}

/** يسجّل مفتاح مرورٍ كاملا: تحدٍّ ثمّ توقيعٌ ثمّ حفظ. */
async function enrollPasskey(
  cookie: string,
  label = 'هاتفي',
): Promise<FakeAuthenticator> {
  const key = await fakeAuthenticator()
  const challengeResponse = await post('/panel/security/passkey/challenge', cookie)
  expect(challengeResponse.status).toBe(200)
  const { challenge } = (await challengeResponse.json()) as { challenge: string }

  const signed = await key.sign({
    challenge,
    origin: ORIGIN,
    rpId: RP_ID,
    type: 'webauthn.create',
    signCount: 0,
  })
  const response = await post('/panel/security/passkey/register', cookie, {
    label,
    credential: JSON.stringify({
      credentialId: key.credentialId,
      clientDataJSON: signed.clientDataJSON,
      authenticatorData: signed.authenticatorData,
      publicKey: key.publicKey,
      alg: key.alg,
    }),
  })
  expect(response.status).toBe(200)
  return key
}

/** يضبط رمز التطبيق ويؤكّده، ويعيد سرَّه. */
async function enrollTotp(cookie: string): Promise<string> {
  const started = await post('/panel/security/totp/start', cookie)
  const { secret } = (await started.json()) as { secret: string }
  const code = await codeAt(secret, counterFor() - 1n)
  const confirmed = await post('/panel/security/totp/confirm', cookie, { code })
  expect(confirmed.status).toBe(200)
  return secret
}

describe('بلا عاملٍ ثانٍ — لا يتغيّر شيء', () => {
  it('الدخول بالرمز يفتح اللوحة مباشرة', async () => {
    const { location, cookie } = await loginWithToken()
    expect(location).toBe('/panel')
    expect(await (await app.request('/panel', { headers: { Cookie: cookie } }, env)).text())
      .toContain('nav class="tabs"')
  })

  it('صفحة الدخول لا تعرض بابَ مفتاح المرور', async () => {
    const html = await (await app.request('/panel', {}, env)).text()
    expect(html).not.toContain('pk-login')
  })
})

describe('تسجيلُ مفتاح مرور', () => {
  it('يُسجَّل ويظهر في اللوحة', async () => {
    const { cookie } = await loginWithToken()
    await readCsrf(cookie)
    await enrollPasskey(cookie, 'مفتاح المكتب')

    expect(await listPasskeys(db, RP_ID)).toHaveLength(1)
    const html = await (await app.request('/panel', { headers: { Cookie: cookie } }, env)).text()
    expect(html).toContain('مفتاح المكتب')
  })

  it('**تحدٍّ ملفَّق يُرفض** — التحدّي يجيء من الخادم لا من العميل', async () => {
    const { cookie } = await loginWithToken()
    await readCsrf(cookie)
    await post('/panel/security/passkey/challenge', cookie)

    const key = await fakeAuthenticator()
    const signed = await key.sign({
      challenge: 'aW52ZW50ZWQtY2hhbGxlbmdl',
      origin: ORIGIN,
      rpId: RP_ID,
      type: 'webauthn.create',
    })
    const response = await post('/panel/security/passkey/register', cookie, {
      label: 'مزوّر',
      credential: JSON.stringify({
        credentialId: key.credentialId,
        clientDataJSON: signed.clientDataJSON,
        authenticatorData: signed.authenticatorData,
        publicKey: key.publicKey,
        alg: key.alg,
      }),
    })
    expect(response.status).toBe(400)
    expect(await listPasskeys(db, RP_ID)).toHaveLength(0)
  })

  it('التحدّي يُستهلَك مرّةً واحدة', async () => {
    const { cookie } = await loginWithToken()
    await readCsrf(cookie)
    const key = await enrollPasskey(cookie)
    // إعادةُ الإرسال نفسه لا تجد تحدّيا
    const response = await post('/panel/security/passkey/register', cookie, {
      label: 'ثانٍ',
      credential: JSON.stringify({ credentialId: key.credentialId, publicKey: key.publicKey }),
    })
    expect(response.status).toBe(400)
  })

  it('بلا جلسةٍ لا يُسجَّل شيء', async () => {
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

describe('الإلزام — والعاملُ الثاني ليس سؤالا يُتخطّى', () => {
  it('بعد تسجيل مفتاح، الرمزُ وحده يعطي جلسةً معلَّقة', async () => {
    const first = await loginWithToken()
    await readCsrf(first.cookie)
    await enrollPasskey(first.cookie)

    const second = await loginWithToken()
    expect(second.location).toBe('/panel/2fa')
  })

  it('والجلسةُ المعلَّقة تُردّ من اللوحة إلى الشاشة', async () => {
    const first = await loginWithToken()
    await readCsrf(first.cookie)
    await enrollPasskey(first.cookie)

    const { cookie } = await loginWithToken()
    const response = await app.request('/panel', { headers: { Cookie: cookie } }, env)
    expect(response.status).toBe(303)
    expect(response.headers.get('Location')).toBe('/panel/2fa')
  })

  it('**ولا تغيّر إعدادا ولو نُودي المسار مباشرة**', async () => {
    const first = await loginWithToken()
    await readCsrf(first.cookie)
    await enrollPasskey(first.cookie)

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
    const first = await loginWithToken()
    await readCsrf(first.cookie)
    await enrollPasskey(first.cookie)

    const { cookie } = await loginWithToken()
    await readCsrf(cookie, '/panel/2fa')
    const response = await post('/panel/security/passkey/challenge', cookie)
    expect(response.status).toBe(403)
  })

  it('ولا تظهر في جرد الأجهزة — ليست بابا مفتوحا', async () => {
    const first = await loginWithToken()
    await readCsrf(first.cookie)
    await enrollPasskey(first.cookie)
    await loginWithToken()

    const html = await (await app.request('/panel', { headers: { Cookie: first.cookie } }, env)).text()
    const rows = html.match(/\/panel\/sessions\/revoke"/g) ?? []
    expect(rows).toHaveLength(0)
  })
})

describe('إتمامُ العامل الثاني بمفتاح مرور', () => {
  it('يرقّي الجلسة ويفتح اللوحة', async () => {
    const first = await loginWithToken()
    await readCsrf(first.cookie)
    const key = await enrollPasskey(first.cookie)

    const { cookie } = await loginWithToken()
    const pendingCsrf = await readCsrf(cookie, '/panel/2fa')
    const page = await (await app.request('/panel/2fa', { headers: { Cookie: cookie } }, env)).text()
    const challenge = /data-challenge="([^"]+)"/.exec(page)?.[1] ?? ''
    expect(challenge).not.toBe('')

    const signed = await key.sign({ challenge, origin: ORIGIN, rpId: RP_ID })
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

    const promoted = (response.headers.get('Set-Cookie') ?? '').split(';')[0]!
    expect(await (await app.request('/panel', { headers: { Cookie: promoted } }, env)).text())
      .toContain('nav class="tabs"')
  })

  it('**المعرّف يتبدّل عند الترقية** — فلا تُثبَّت الجلسة', async () => {
    const first = await loginWithToken()
    await readCsrf(first.cookie)
    const key = await enrollPasskey(first.cookie)

    const { cookie } = await loginWithToken()
    const pendingCsrf = await readCsrf(cookie, '/panel/2fa')
    const page = await (await app.request('/panel/2fa', { headers: { Cookie: cookie } }, env)).text()
    const challenge = /data-challenge="([^"]+)"/.exec(page)?.[1] ?? ''

    const body = new FormData()
    body.set('_csrf', pendingCsrf)
    body.set('assertion', JSON.stringify(await key.sign({ challenge, origin: ORIGIN, rpId: RP_ID })))
    const response = await app.request(
      '/panel/2fa/passkey',
      { method: 'POST', body, headers: { Cookie: cookie } },
      env,
    )
    const promoted = (response.headers.get('Set-Cookie') ?? '').split(';')[0]!
    expect(promoted).not.toBe(cookie)
    // والمعرّفُ القديم بطل: لا يفتح شيئا
    expect(await (await app.request('/panel', { headers: { Cookie: cookie } }, env)).text())
      .toContain('name="token"')
  })
})

describe('الدخول بمفتاح المرور من صفحة الدخول', () => {
  it('يفتح جلسةً كاملةً بلا رمزٍ إداريّ', async () => {
    const first = await loginWithToken()
    await readCsrf(first.cookie)
    const key = await enrollPasskey(first.cookie)

    const ticketResponse = await app.request(
      '/panel/passkey/challenge',
      { method: 'POST' },
      env,
    )
    expect(ticketResponse.status).toBe(200)
    const { ticket, challenge } = (await ticketResponse.json()) as {
      ticket: string
      challenge: string
    }

    const signed = await key.sign({ challenge, origin: ORIGIN, rpId: RP_ID })
    const response = await app.request(
      '/panel/passkey/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket, ...signed }),
      },
      env,
    )
    expect(response.status).toBe(200)

    const cookie = (response.headers.get('Set-Cookie') ?? '').split(';')[0]!
    const html = await (await app.request('/panel', { headers: { Cookie: cookie } }, env)).text()
    expect(html).toContain('nav class="tabs"')
    // وتُعلَّم في الجرد بأنّها بمفتاح مرور
    expect(html).toContain('مفتاح مرور')
  })

  it('صفحةُ الدخول تعرض بابَه حين يوجد مفتاح', async () => {
    const first = await loginWithToken()
    await readCsrf(first.cookie)
    await enrollPasskey(first.cookie)

    const html = await (await app.request('/panel', {}, env)).text()
    expect(html).toContain('pk-login')
  })

  it('توقيعٌ بمفتاحٍ غير مسجَّل يُرفض', async () => {
    const first = await loginWithToken()
    await readCsrf(first.cookie)
    await enrollPasskey(first.cookie)

    const stranger = await fakeAuthenticator()
    const ticketResponse = await app.request('/panel/passkey/challenge', { method: 'POST' }, env)
    const { ticket, challenge } = (await ticketResponse.json()) as {
      ticket: string
      challenge: string
    }
    const signed = await stranger.sign({ challenge, origin: ORIGIN, rpId: RP_ID })
    const response = await app.request(
      '/panel/passkey/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket, ...signed }),
      },
      env,
    )
    expect(response.status).toBe(401)
    expect(response.headers.get('Set-Cookie')).toBeNull()
    // ‏والسببُ لا يُعاد إلى طالبٍ مجهول (D-160) — يبقى في سجلّ التدقيق وحده
    expect(await response.json()).toEqual({ error: 'denied' })
    const logged = db.raw.prepare(
      "SELECT detail FROM audit_log WHERE action = 'passkey.denied'",
    ).get() as { detail: string } | undefined
    expect(logged?.detail).toBe('مفتاحٌ غير مسجَّل')
  })

  it('والتذكرةُ تُستهلَك — لا يُعاد إرسالُ التوقيع نفسه', async () => {
    const first = await loginWithToken()
    await readCsrf(first.cookie)
    const key = await enrollPasskey(first.cookie)

    const ticketResponse = await app.request('/panel/passkey/challenge', { method: 'POST' }, env)
    const { ticket, challenge } = (await ticketResponse.json()) as {
      ticket: string
      challenge: string
    }
    const signed = await key.sign({ challenge, origin: ORIGIN, rpId: RP_ID, signCount: 5 })
    const body = JSON.stringify({ ticket, ...signed })
    const headers = { 'Content-Type': 'application/json' }

    expect((await app.request('/panel/passkey/login', { method: 'POST', headers, body }, env)).status).toBe(200)
    expect((await app.request('/panel/passkey/login', { method: 'POST', headers, body }, env)).status).toBe(400)
  })

  it('بلا مفاتيحَ مسجَّلة لا تحدٍّ أصلا', async () => {
    const response = await app.request('/panel/passkey/challenge', { method: 'POST' }, env)
    expect(response.status).toBe(404)
  })
})

describe('رمز التطبيق', () => {
  it('يُضبَط ويُؤكَّد ويُلزِم', async () => {
    const { cookie } = await loginWithToken()
    await readCsrf(cookie)
    await enrollTotp(cookie)

    expect((await totpState(db)).confirmed).toBe(true)
    expect((await loginWithToken()).location).toBe('/panel/2fa')
  })

  it('**سرٌّ بدأ ولم يُؤكَّد لا يُلزِم** — وإلّا أقفل المالكَ خارج لوحته', async () => {
    const { cookie } = await loginWithToken()
    await readCsrf(cookie)
    await post('/panel/security/totp/start', cookie)

    expect((await totpState(db)).enrolled).toBe(true)
    expect((await totpState(db)).confirmed).toBe(false)
    expect((await loginWithToken()).location).toBe('/panel')
  })

  it('رمزٌ خطأ لا يؤكّد', async () => {
    const { cookie } = await loginWithToken()
    await readCsrf(cookie)
    await post('/panel/security/totp/start', cookie)
    const response = await post('/panel/security/totp/confirm', cookie, { code: '000000' })
    expect(response.status).toBe(401)
    expect((await totpState(db)).confirmed).toBe(false)
  })

  it('السرُّ لا يوجد مقروءا في القاعدة', async () => {
    const { cookie } = await loginWithToken()
    await readCsrf(cookie)
    const secret = await enrollTotp(cookie)
    const row = await db
      .prepare('SELECT secret_cipher FROM totp WHERE id = 1')
      .first<{ secret_cipher: string }>()
    expect(row?.secret_cipher).not.toContain(secret)
  })

  it('يُتمّ العامل الثاني ويفتح اللوحة', async () => {
    const setup = await loginWithToken()
    await readCsrf(setup.cookie)
    const secret = await enrollTotp(setup.cookie)

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
    const promoted = (response.headers.get('Set-Cookie') ?? '').split(';')[0]!
    expect(await (await app.request('/panel', { headers: { Cookie: promoted } }, env)).text())
      .toContain('nav class="tabs"')
  })

  it('**رمزٌ استُعمل لا يُقبل ثانية** — ولو بقي من نافذته ثوانٍ', async () => {
    const setup = await loginWithToken()
    await readCsrf(setup.cookie)
    const secret = await enrollTotp(setup.cookie)
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
})

describe('رموز الاسترداد', () => {
  it('تُولَّد مع أوّل تأكيدٍ لرمز التطبيق — فلا يصير الفقدُ قفلا', async () => {
    const { cookie } = await loginWithToken()
    await readCsrf(cookie)
    const started = await post('/panel/security/totp/start', cookie)
    const { secret } = (await started.json()) as { secret: string }
    const confirmed = await post('/panel/security/totp/confirm', cookie, {
      code: await codeAt(secret, counterFor()),
    })
    const { codes } = (await confirmed.json()) as { codes: string[] }
    expect(codes.length).toBeGreaterThan(0)
    expect((await countRecoveryCodes(db)).unused).toBe(codes.length)
  })

  it('لا تُخزَّن نصّا', async () => {
    const { cookie } = await loginWithToken()
    await readCsrf(cookie)
    const response = await post('/panel/security/recovery/issue', cookie)
    const { codes } = (await response.json()) as { codes: string[] }

    const { results } = await db.prepare('SELECT hash FROM recovery_codes').all<{ hash: string }>()
    const stored = results.map((r) => r.hash).join(' ')
    for (const code of codes) expect(stored).not.toContain(code.replace('-', ''))
  })

  it('تفتح اللوحة، وتُستهلَك مرّةً واحدة', async () => {
    const setup = await loginWithToken()
    await readCsrf(setup.cookie)
    await enrollPasskey(setup.cookie)
    const issued = await post('/panel/security/recovery/issue', setup.cookie)
    const { codes } = (await issued.json()) as { codes: string[] }

    const use = async (code: string): Promise<number> => {
      const { cookie } = await loginWithToken()
      const pendingCsrf = await readCsrf(cookie, '/panel/2fa')
      const body = new FormData()
      body.set('_csrf', pendingCsrf)
      body.set('code', code)
      return (
        await app.request(
          '/panel/2fa/recovery',
          { method: 'POST', body, headers: { Cookie: cookie } },
          env,
        )
      ).status
    }

    expect(await use(codes[0]!)).toBe(303)
    expect(await use(codes[0]!)).toBe(401)
    expect(await use(codes[1]!)).toBe(303)
    expect((await countRecoveryCodes(db)).unused).toBe(codes.length - 2)
  })

  it('تُقرأ بلا حساسيّةٍ للشرطة وحالة الأحرف', async () => {
    const setup = await loginWithToken()
    await readCsrf(setup.cookie)
    await enrollPasskey(setup.cookie)
    const issued = await post('/panel/security/recovery/issue', setup.cookie)
    const { codes } = (await issued.json()) as { codes: string[] }

    const { cookie } = await loginWithToken()
    const pendingCsrf = await readCsrf(cookie, '/panel/2fa')
    const body = new FormData()
    body.set('_csrf', pendingCsrf)
    body.set('code', codes[0]!.toLowerCase().replace('-', ' '))
    const response = await app.request(
      '/panel/2fa/recovery',
      { method: 'POST', body, headers: { Cookie: cookie } },
      env,
    )
    expect(response.status).toBe(303)
  })

  it('التوليدُ الجديد يُبطل القديمة كلَّها', async () => {
    const setup = await loginWithToken()
    await readCsrf(setup.cookie)
    await enrollPasskey(setup.cookie)
    const first = (await (await post('/panel/security/recovery/issue', setup.cookie)).json()) as {
      codes: string[]
    }
    await post('/panel/security/recovery/issue', setup.cookie)

    const { cookie } = await loginWithToken()
    const pendingCsrf = await readCsrf(cookie, '/panel/2fa')
    const body = new FormData()
    body.set('_csrf', pendingCsrf)
    body.set('code', first.codes[0]!)
    const response = await app.request(
      '/panel/2fa/recovery',
      { method: 'POST', body, headers: { Cookie: cookie } },
      env,
    )
    expect(response.status).toBe(401)
  })
})

describe('لا يُقفَل المالك خارج لوحته', () => {
  it('حذفُ آخر عاملٍ ثانٍ يُمنع ويُقال السبب', async () => {
    const { cookie } = await loginWithToken()
    await readCsrf(cookie)
    await enrollPasskey(cookie)
    const [key] = await listPasskeys(db, RP_ID)

    const response = await post('/panel/security/passkey/delete', cookie, { id: key!.id })
    expect(response.status).toBe(409)
    expect(await listPasskeys(db, RP_ID)).toHaveLength(1)
  })

  it('ويُسمح به إن بقي عاملٌ آخر', async () => {
    const { cookie } = await loginWithToken()
    await readCsrf(cookie)
    await enrollPasskey(cookie)
    await enrollTotp(cookie)
    const [key] = await listPasskeys(db, RP_ID)

    const response = await post('/panel/security/passkey/delete', cookie, { id: key!.id })
    expect(response.status).toBe(200)
    expect(await listPasskeys(db, RP_ID)).toHaveLength(0)
  })

  it('وإزالةُ رمز التطبيق تُمنع إن كان الأخير', async () => {
    const { cookie } = await loginWithToken()
    await readCsrf(cookie)
    await enrollTotp(cookie)
    expect((await post('/panel/security/totp/remove', cookie)).status).toBe(409)
  })
})

describe('تدويرُ الرمز يُبطل جلسة مفتاح المرور أيضا', () => {
  it('الجلسةُ مربوطةٌ بالرمز وإن لم تُفتح به', async () => {
    const first = await loginWithToken()
    await readCsrf(first.cookie)
    const key = await enrollPasskey(first.cookie)

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
        body: JSON.stringify({ ticket, ...(await key.sign({ challenge, origin: ORIGIN, rpId: RP_ID })) }),
      },
      env,
    )
    const cookie = (response.headers.get('Set-Cookie') ?? '').split(';')[0]!

    const rotated = { ...env, ADMIN_TOKEN: 'Zz9qW8vY1nMtB6oS3uXgA7dC5eI2kH0f' }
    const html = await (await app.request('/panel', { headers: { Cookie: cookie } }, rotated)).text()
    expect(html).toContain('name="token"')
  })
})

import { describe, expect, it } from 'vitest'
import { fakeFetch } from '../../test/fakes'
import { exchangeCode, isExpiring, OAuthError, refreshToken } from './exchange'
import { LINKEDIN, redirectUri, X } from './providers'

const CREDS = { clientId: 'cid', clientSecret: 'csecret' }
const NOW = new Date('2026-09-03T10:00:00.000Z')

describe('redirectUri', () => {
  it('يبني رابط العودة من قاعدة البيئة', () => {
    expect(redirectUri('https://sada2.basserh.com', 'linkedin')).toBe(
      'https://sada2.basserh.com/oauth/linkedin/callback',
    )
    expect(redirectUri('https://sada.basserh.com', 'x')).toBe(
      'https://sada.basserh.com/oauth/x/callback',
    )
  })

  it('لا يضاعف الشرطة حين تنتهي القاعدة بها', () => {
    expect(redirectUri('https://sada.basserh.com/', 'x')).toBe(
      'https://sada.basserh.com/oauth/x/callback',
    )
  })

  it('يفصل البيئتين: نطاقان يعطيان رابطين مختلفين', () => {
    expect(redirectUri('https://sada2.basserh.com', 'x')).not.toBe(
      redirectUri('https://sada.basserh.com', 'x'),
    )
  })
})

describe('exchangeCode', () => {
  it('يحسب expires_at من expires_in ولحظة الرد', async () => {
    const f = fakeFetch({
      [LINKEDIN.tokenUrl]: {
        json: { access_token: 'a1', expires_in: 5_184_000, scope: 'openid profile w_member_social' },
      },
    })
    const tokens = await exchangeCode(
      LINKEDIN,
      CREDS,
      { code: 'c', redirectUri: 'https://sada2.basserh.com/oauth/linkedin/callback', verifier: 'v' },
      NOW,
      f,
    )
    // ستون يوما
    expect(tokens.expiresAt).toBe('2026-11-02T10:00:00.000Z')
    expect(tokens.accessToken).toBe('a1')
    expect(tokens.refreshToken).toBeNull()
  })

  it('يرسل code_verifier — بلا PKCE يرفض X', async () => {
    const f = fakeFetch({ [X.tokenUrl]: { json: { access_token: 'a', expires_in: 7200 } } })
    await exchangeCode(X, CREDS, { code: 'c', redirectUri: 'r', verifier: 'the-verifier' }, NOW, f)
    expect(f.calls[0]!.body).toContain('code_verifier=the-verifier')
    expect(f.calls[0]!.body).toContain('grant_type=authorization_code')
  })

  it('X يصادق بترويسة Basic، و LinkedIn بالجسم', async () => {
    const fx = fakeFetch({ [X.tokenUrl]: { json: { access_token: 'a', expires_in: 7200 } } })
    await exchangeCode(X, CREDS, { code: 'c', redirectUri: 'r', verifier: 'v' }, NOW, fx)
    expect(fx.calls[0]!.headers['Authorization']).toBe(`Basic ${btoa('cid:csecret')}`)
    expect(fx.calls[0]!.body).not.toContain('client_secret')

    const fl = fakeFetch({ [LINKEDIN.tokenUrl]: { json: { access_token: 'a', expires_in: 60 } } })
    await exchangeCode(LINKEDIN, CREDS, { code: 'c', redirectUri: 'r', verifier: 'v' }, NOW, fl)
    expect(fl.calls[0]!.headers['Authorization']).toBeUndefined()
    expect(fl.calls[0]!.body).toContain('client_secret=csecret')
  })

  it('يحفظ refresh ومهلته حين تردهما المنصة', async () => {
    const f = fakeFetch({
      [LINKEDIN.tokenUrl]: {
        json: {
          access_token: 'a',
          refresh_token: 'r',
          expires_in: 5_184_000,
          refresh_token_expires_in: 31_536_000,
        },
      },
    })
    const tokens = await exchangeCode(LINKEDIN, CREDS, { code: 'c', redirectUri: 'r', verifier: 'v' }, NOW, f)
    expect(tokens.refreshToken).toBe('r')
    expect(tokens.refreshExpiresAt).toBe('2027-09-03T10:00:00.000Z')
  })

  it('يعوّض scope الغائب بما طلبناه', async () => {
    const f = fakeFetch({ [X.tokenUrl]: { json: { access_token: 'a', expires_in: 7200 } } })
    const tokens = await exchangeCode(X, CREDS, { code: 'c', redirectUri: 'r', verifier: 'v' }, NOW, f)
    expect(tokens.scopes).toBe('tweet.read tweet.write users.read offline.access')
  })
})

describe('ما يجب أن يفشل', () => {
  it('استجابة بلا access_token', async () => {
    const f = fakeFetch({ [X.tokenUrl]: { json: { expires_in: 7200 } } })
    await expect(
      exchangeCode(X, CREDS, { code: 'c', redirectUri: 'r', verifier: 'v' }, NOW, f),
    ).rejects.toBeInstanceOf(OAuthError)
  })

  it('استجابة بلا expires_in', async () => {
    const f = fakeFetch({ [X.tokenUrl]: { json: { access_token: 'a' } } })
    await expect(
      exchangeCode(X, CREDS, { code: 'c', redirectUri: 'r', verifier: 'v' }, NOW, f),
    ).rejects.toBeInstanceOf(OAuthError)
  })

  it('رفض المنصة يحمل حالتها ولا يحمل جسم الاستجابة', async () => {
    const f = fakeFetch({
      [X.tokenUrl]: {
        status: 400,
        json: { error: 'invalid_grant', error_description: 'a-secret-looking-value' },
      },
    })
    let failure: unknown
    try {
      await exchangeCode(X, CREDS, { code: 'c', redirectUri: 'r', verifier: 'v' }, NOW, f)
    } catch (error) {
      failure = error
    }
    expect(failure).toBeInstanceOf(OAuthError)
    const oauthError = failure as OAuthError
    expect(oauthError.status).toBe(400)
    expect(oauthError.message).toContain('invalid_grant')
    expect(oauthError.message).not.toContain('a-secret-looking-value')
  })
})

describe('refreshToken', () => {
  it('يرسل grant_type=refresh_token', async () => {
    const f = fakeFetch({ [X.tokenUrl]: { json: { access_token: 'a2', expires_in: 7200 } } })
    const tokens = await refreshToken(X, CREDS, 'old-refresh', NOW, f)
    expect(f.calls[0]!.body).toContain('grant_type=refresh_token')
    expect(f.calls[0]!.body).toContain('refresh_token=old-refresh')
    expect(tokens.accessToken).toBe('a2')
  })
})

describe('isExpiring', () => {
  it('يعدّ الرمز موشكا داخل هامش الخمس دقائق', () => {
    expect(isExpiring('2026-09-03T10:04:00.000Z', NOW)).toBe(true)
    expect(isExpiring('2026-09-03T10:06:00.000Z', NOW)).toBe(false)
  })

  it('يعدّ المنتهي موشكا', () => {
    expect(isExpiring('2026-09-03T09:00:00.000Z', NOW)).toBe(true)
  })

  it('يعدّ التاريخ التالف موشكا — الاحتياط لا التخمين', () => {
    expect(isExpiring('ليس تاريخا', NOW)).toBe(true)
  })
})

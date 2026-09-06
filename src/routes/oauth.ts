/**
 * مسارا OAuth للمنصتين — مسار واحد بمعاملات، لا نسختان متشعبتان.
 *
 *   GET /oauth/:platform/start      يحوّل إلى شاشة الموافقة
 *   GET /oauth/:platform/callback   يبدّل code برمز ويخزنه مشفرا
 *
 * ما لا يفعله هذا الملف: لا يعيد رمزا في استجابة، ولا يكتب رمزا في سجل،
 * ولا يقبل `state` مرتين.
 */
import { Hono } from 'hono'
import type { Env } from '../env'
import { createPkce, randomToken } from '../lib/pkce'
import { exchangeCode, OAuthError, type ClientCredentials } from '../lib/oauth/exchange'
import { fetchIdentity } from '../lib/oauth/identity'
import { PROVIDERS, redirectUri, type Platform } from '../lib/oauth/providers'
import { readApp } from '../lib/oauth/apps'
import { consumeState, saveState, StateError } from '../lib/oauth/state'
import { saveTokens, upsertAccount } from '../lib/tokens'

export const oauth = new Hono<{ Bindings: Env }>()

function platformOf(value: string): Platform | null {
  return value === 'linkedin' || value === 'x' ? value : null
}

/**
 * يحوّل أخطاء OAuth المعروفة إلى استجابة بحالتها الصحيحة.
 *
 * لا يُترك الخطأ ليصعد فيصير 500: «سرّ غير مضبوط» حالته 503، ورفض المنصة
 * 502، و`state` باطل 400. ومن لم يُعرف يُعاد رميه ليظهر في السجل كما هو.
 */
function oauthFailure(error: unknown): { body: Record<string, string>; status: 400 | 502 | 503 } {
  if (error instanceof StateError) return { body: { error: 'invalid_state' }, status: 400 }
  if (error instanceof OAuthError) {
    if (error.status === 503) {
      return { body: { error: 'not_configured', detail: error.message }, status: 503 }
    }
    return { body: { error: 'oauth_failed', detail: error.message }, status: 502 }
  }
  throw error
}

/**
 * أسرارُ التطبيق — من البيئة أوّلا ثمّ الخزانة (D-030 · D-042).
 *
 * والرسالةُ تسمّي ولا تكشف: «غير مضبوطة» لا تُذكر معها قيمةٌ ولو وُجدت.
 */
async function credentialsFor(env: Env, platform: Platform): Promise<ClientCredentials> {
  const app = await readApp(
    env.DB,
    env.TOKEN_ENC_KEY,
    platform,
    env as unknown as Record<string, string | undefined>,
  )
  if (app === null) {
    throw new OAuthError(`أسرار ${platform} غير مضبوطة — اضبطها من لوحة القنوات`, 503)
  }
  return { clientId: app.clientId, clientSecret: app.clientSecret }
}

oauth.get('/oauth/:platform/start', async (c) => {
  const platform = platformOf(c.req.param('platform'))
  if (platform === null) return c.json({ error: 'unknown_platform' }, 404)

  const provider = PROVIDERS[platform]
  let creds
  try {
    creds = await credentialsFor(c.env, platform) // يفشل مبكرا إن نقص سر
  } catch (error) {
    const failure = oauthFailure(error)
    return c.json(failure.body, failure.status)
  }

  const uri = redirectUri(c.env.PUBLIC_BASE_URL, platform)
  const pkce = await createPkce()
  const state = randomToken()

  await saveState(c.env.KV, state, {
    platform,
    verifier: pkce.verifier,
    redirectUri: uri,
    createdAt: new Date().toISOString(),
  })

  const url = new URL(provider.authorizeUrl)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', creds.clientId)
  url.searchParams.set('redirect_uri', uri)
  url.searchParams.set('scope', provider.scopes.join(' '))
  url.searchParams.set('state', state)
  url.searchParams.set('code_challenge', pkce.challenge)
  url.searchParams.set('code_challenge_method', pkce.method)

  return c.redirect(url.toString(), 302)
})

oauth.get('/oauth/:platform/callback', async (c) => {
  const platform = platformOf(c.req.param('platform'))
  if (platform === null) return c.json({ error: 'unknown_platform' }, 404)

  // رفض المستخدم للموافقة ليس عطلا: يُقال كما هو
  const denied = c.req.query('error')
  if (typeof denied === 'string' && denied.length > 0) {
    return c.json({ error: 'consent_denied', platform, reason: denied }, 400)
  }

  const code = c.req.query('code') ?? ''
  const state = c.req.query('state') ?? ''
  if (code.length === 0) return c.json({ error: 'missing_code' }, 400)

  try {
    const saved = await consumeState(c.env.KV, state)
    if (saved.platform !== platform) {
      return c.json({ error: 'state_platform_mismatch' }, 400)
    }

    const provider = PROVIDERS[platform]
    const creds = await credentialsFor(c.env, platform)
    const tokens = await exchangeCode(provider, creds, {
      code,
      redirectUri: saved.redirectUri,
      verifier: saved.verifier,
    })

    const identity = await fetchIdentity(provider, tokens.accessToken)
    const id = await upsertAccount(c.env.DB, identity)
    await saveTokens(c.env.DB, c.env.TOKEN_ENC_KEY, id, tokens)

    // لا رمز في الجواب. ما يُعاد يكفي للوحة ولا يكفي لمنتحل
    return c.json({
      connected: true,
      account_id: id,
      platform,
      display_name: identity.displayName,
      expires_at: tokens.expiresAt,
      has_refresh: tokens.refreshToken !== null,
    })
  } catch (error) {
    const failure = oauthFailure(error)
    return c.json(failure.body, failure.status)
  }
})

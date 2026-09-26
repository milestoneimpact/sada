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
import { parseGranted, scopeSet, type ScopeMode } from '../lib/oauth/scopes'
import { consumeState, saveState, StateError } from '../lib/oauth/state'
import { saveTokens, upsertAccount } from '../lib/tokens'
import { htmlHeaders, makeNonce } from '../lib/security/headers'
import { soloPage } from './ui/shell'
import { buildCommands } from './ui/command'
import { connectedBody, refusedBody } from './ui/oauthResult'

/**
 * صفحةٌ لا سطرُ JSON.
 *
 * كان الردُّ هنا JSON عاريا، **وهذه نهايةُ تحويلٍ من متصفّح**: من يصل
 * إليها إنسانٌ ينظر، لا برنامجٌ يقرأ. وسطرٌ فيه
 * <span dir="ltr">unauthorized_scope_error</span> يقول له أنّ شيئا فشل
 * ولا يقول أيَّ نطاقٍ ولا مَن يمنحه — فأعاد توليدَ سرِّه، وهي أوّلُ
 * حركةٍ خاطئة.
 */
function resultPage(title: string, body: string, status: 200 | 400 | 502 | 503): Response {
  // القالبُ الواحد (D-151): علامةٌ وعودةٌ و⌘K وثيمٌ كسائر الشاشات المستقلّة
  const nonce = makeNonce()
  const html = soloPage(title, { href: '/panel#channels', label: 'القنوات' }, body, nonce, '',
    buildCommands({ onPanel: false }))
  return new Response(html, { status, headers: htmlHeaders(nonce) })
}

export const oauth = new Hono<{ Bindings: Env }>()

/** الأربعُ التي تُربَط — والسجلُّ هو الحكم، لا قائمةٌ منسوخة. */
function platformOf(value: string): Platform | null {
  return Object.prototype.hasOwnProperty.call(PROVIDERS, value)
    ? (value as Platform)
    : null
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

/**
 * وضعُ النطاقات — الكاملُ هو الأصل، و`identity` مخرجُ نجاة.
 *
 * ولا يُقدَّم خيارا ابتداءً: مالكٌ يُخيَّر بين «كامل» و«هويّةٍ وحدها»
 * قبل أن يفشل شيء **يختار الأضيق ظنّا أنّه الأحوط**، ثمّ يسأل لماذا لا
 * ينشر النظام. فيُعرَض بعد الرفض وحده، من صفحة التشخيص.
 */
function scopeModeOf(raw: string | undefined): ScopeMode {
  return raw === 'identity' ? 'identity' : 'full'
}

oauth.get('/oauth/:platform/start', async (c) => {
  const platform = platformOf(c.req.param('platform'))
  if (platform === null) return c.json({ error: 'unknown_platform' }, 404)

  const provider = PROVIDERS[platform]
  const mode = scopeModeOf(c.req.query('scope'))
  const scopes = scopeSet(platform, mode)
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
    // ما طُلب في **هذه** الدورة يُحفظ معها: صفحةُ التشخيص تعرضه، وما
    // يُسجَّل في القاعدة يُبنى عليه — والحارسُ يقرأ من القاعدة
    scopes: scopes.join(' '),
  })

  const url = new URL(provider.authorizeUrl)
  url.searchParams.set('response_type', 'code')
  // **واسمُ حقل المعرّف ليس واحدا**: TikTok يسمّيه `client_key`، ورابطٌ
  // بالاسم المعياريّ يُردّ بخطأٍ لا يذكر السبب
  url.searchParams.set(provider.clientIdParam ?? 'client_id', creds.clientId)
  url.searchParams.set('redirect_uri', uri)
  url.searchParams.set('scope', scopes.join(' '))
  url.searchParams.set('state', state)
  // **ولا يُرسَل PKCE إلى مَن لا يدعمه** (D-075): حقلٌ لبروتوكولٍ لا
  // يجري عند المستقبِل ليس حيادا — وإسقاطُه يضيّق دائرةَ الشكّ
  if (provider.pkce) {
    url.searchParams.set('code_challenge', pkce.challenge)
    url.searchParams.set('code_challenge_method', pkce.method)
  }
  // ومعاملاتُ المزوّد الخاصّة آخرا: Google لا يعطي رمزَ تجديدٍ بلا
  // `access_type=offline`، فيُربَط الحسابُ ثمّ يسقط بعد ساعة
  for (const [key, value] of Object.entries(provider.extraAuthorize ?? {})) {
    url.searchParams.set(key, value)
  }

  return c.redirect(url.toString(), 302)
})

oauth.get('/oauth/:platform/callback', async (c) => {
  const platform = platformOf(c.req.param('platform'))
  if (platform === null) return c.json({ error: 'unknown_platform' }, 404)

  // رفضُ المستخدم ورفضُ المنصّة للنطاق يصلان من الباب نفسه، ويفترقان
  // في العلاج — فيُشخَّصان في صفحةٍ واحدةٍ تفرزهما
  const denied = c.req.query('error')
  if (typeof denied === 'string' && denied.length > 0) {
    // ما طُلب يُقرأ من الحالة المحفوظة إن أمكن؛ وإلّا فالكامل
    let requested = scopeSet(platform)
    let wasIdentityOnly = false
    try {
      const saved = await consumeState(c.env.KV, c.req.query('state') ?? '')
      if (typeof saved.scopes === 'string' && saved.scopes.length > 0) {
        requested = parseGranted(saved.scopes)
        wasIdentityOnly = requested.length === scopeSet(platform, 'identity').length
      }
    } catch {
      // حالةٌ منتهيةٌ أو مستهلَكة: يُشخَّص بالكامل — وهو الأصل
    }
    return resultPage(
      `صدى — لم يكتمل الربط`,
      refusedBody({
        platform,
        reason: denied,
        // وصفُ المنصّة يحمل اسمَ النطاق المرفوض غالبا — وكان يُهمَل
        description: c.req.query('error_description') ?? '',
        requested,
        // ولا يُعرَض مخرجُ الهويّة إن كانت هي التي رُفضت: زرٌّ يعيد
        // المحاولةَ نفسها التي فشلت يَعِد بما لا يقع
        identityRetry: !wasIdentityOnly,
      }),
      400,
    )
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
    const requested =
      typeof saved.scopes === 'string' && saved.scopes.length > 0
        ? parseGranted(saved.scopes)
        : provider.scopes
    const tokens = await exchangeCode(provider, creds, {
      code,
      redirectUri: saved.redirectUri,
      verifier: saved.verifier,
      requestedScopes: requested,
    })

    const identity = await fetchIdentity(provider, tokens.accessToken)
    const id = await upsertAccount(c.env.DB, identity)
    await saveTokens(c.env.DB, c.env.TOKEN_ENC_KEY, id, tokens)

    // لا رمزَ في الصفحة ولا في عنوانها: اسمٌ وحالُ نطاقاتٍ لا أكثر
    return resultPage(
      `صدى — رُبط ${identity.displayName}`,
      connectedBody({
        platform,
        displayName: identity.displayName,
        grantedScopes: parseGranted(tokens.scopes),
        hasRefresh: tokens.refreshToken !== null,
        expiresAt: tokens.expiresAt,
      }),
      200,
    )
  } catch (error) {
    // **من وصل هنا إنسانٌ ينظر، لا برنامجٌ يقرأ** (D-046).
    //
    // ورفضُ نهاية الرمز كان يعود سطرَ JSON: `oauth_failed` ومعه نصٌّ
    // عربيٌّ في متصفّح. **وهو أسوأُ موضعٍ يقع فيه ذلك**: نصفُ الدورة
    // نجح — شاشةُ الإذن مرّت — فالمالكُ لا يعرف أين يفتّش.
    //
    // و`StateError` يبقى JSON: حالةٌ منتهيةٌ أو مزوَّرة ليست عطلَ ضبطٍ
    // يُشخَّص، وصفحةٌ لها تدعو إلى إعادةٍ لا تنفع.
    if (error instanceof OAuthError && error.status !== 503) {
      // ما أُرسل فعلا — يُقرأ من المصدر نفسِه لا يُعاد بناؤه.
      // **وقراءةٌ ثانيةٌ قد تُخالف الأولى** لو بُدّل السرُّ بين اللحظتين،
      // فتُعرَض قيمةٌ لم تُرسَل ويُطارَد وهم. ولا يُقرأ السرُّ أصلا.
      let sent: { clientId: string; redirectUri: string } | undefined
      try {
        const creds = await credentialsFor(c.env, platform)
        sent = { clientId: creds.clientId, redirectUri: redirectUri(c.env.PUBLIC_BASE_URL, platform) }
      } catch {
        // تعذّرت القراءة: تُعرَض الصفحةُ بلا المقارنة، ولا تسقط
      }
      return resultPage(
        'صدى — لم يكتمل الربط',
        refusedBody({
          platform,
          reason: error.code ?? 'token_exchange_failed',
          ...(error.description === undefined ? {} : { description: error.description }),
          ...(sent === undefined ? {} : { sent }),
          requested: scopeSet(platform),
          // ودورةُ الهويّة وحدها لا تُعرَض: العطلُ في زوج المفاتيح،
          // **ودورةٌ أضيق تُردّ بالرمز نفسه** فتضيف محاولةً تفشل
          identityRetry: false,
        }),
        502,
      )
    }
    const failure = oauthFailure(error)
    return c.json(failure.body, failure.status)
  }
})

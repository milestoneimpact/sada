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
import { panelHref } from '../lib/nav/panes'
import type { Env } from '../env'
import { createPkce, randomToken } from '../lib/pkce'
import { exchangeCode, OAuthError, type ClientCredentials } from '../lib/oauth/exchange'
import { fetchIdentity } from '../lib/oauth/identity'
import { platformLabel, PROVIDERS, redirectUri, type Platform } from '../lib/oauth/providers'
import { readApp } from '../lib/oauth/apps'
import { parseGranted, scopeSet, type ScopeMode } from '../lib/oauth/scopes'
import { bindingCookie, bindingCookieName, bindingHash, clearedBindingCookie, consumeState, sameBrowser, saveState, StateError } from '../lib/oauth/state'
import { AccountElsewhere, saveTokens, upsertAccount } from '../lib/tokens'
import { loadSession, readCookie } from '../lib/session'
import { record } from '../lib/audit'
import { activeOrg, OWNER_ORG } from '../lib/tenancy'
import { htmlHeaders, makeNonce } from '../lib/security/headers'
import { soloPage } from './ui/shell'
import { soloNav } from './ui/rail'
import { buildCommands, sectionLabel } from './ui/command'
import { connectedBody, elsewhereBody, otherBrowserBody, refusedBody, unconfiguredBody, unreachedBody } from './ui/oauthResult'
import { setFlash } from './panel'
import { ownerZone } from '../lib/time/ownerZone'

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
  const html = soloPage(title, { href: panelHref('channels'), label: sectionLabel('accounts') }, body, nonce, '',
    buildCommands({ onPanel: false }), soloNav('accounts'))
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
 * ‏**بلا سرّين لا يبدأ الربط — فيُعاد المالكُ إلى حقليهما لا إلى سطر JSON** (ر-1).
 *
 * ‏كان «اربط» و«جرّب من جديد» و«أعد المحاولة» بعد حذف السرّين، أو من تبويبٍ قديم،
 * ‏ينتهي بـ `{"error":"not_configured",…}` في المتصفّح (خطّة التصميم 7.11: لا JSON في وجه
 * ‏المالك). فالوميضُ يقول لماذا، والتحويلُ إلى تبويب الإعداد حيث يُضبَطان — كما يعود
 * ‏كلُّ فعلٍ إلى موضعه.
 */
async function toSetup(env: Env, request: Request, platform: Platform): Promise<Response> {
  const label = platformLabel(platform)
  await setFlash(env, request, {
    kind: 'warn',
    text: `لم يبدأ الربط: ينقص معرّف تطبيق ${label} وسرُّه. اضبطهما هنا، ثمّ «اربط ${label}».`,
  })
  return new Response(null, {
    status: 303,
    headers: { Location: `/panel/channels/${encodeURIComponent(platform)}?tab=setup` },
  })
}

/**
 * ‏ما يُعرَض للمطوّر من عطلٍ لم نعرفه — **بلا ما يلي «?» في رابط**.
 *
 * ‏نصُّ `TypeError` من `fetch` يحمل الرابطَ أحيانًا، ورابطُ منصّةٍ قد يحمل رمزًا في
 * ‏استعلامه؛ وهذه الصفحةُ ليست خلف دخول، والسجلُّ لا يحمل رمزًا (D-005).
 */
function devDetail(error: unknown): string {
  const name = error instanceof Error ? error.name : typeof error
  const message = error instanceof Error ? error.message : String(error)
  return `${name}: ${message.replace(/\?\S*/g, '?…')}`.slice(0, 200)
}

/**
 * ‏**سرّا التطبيق غيرُ مضبوطين — نوعٌ بذاته لا رقمُ حالة** (مراجعة ر-1).
 *
 * ‏كان يُرمى `OAuthError` بحالة 503 ويُعرَف من رقمه، **و503 من نهاية الرمز أو الهويّة
 * ‏عند المنصّة يحمل الرقمَ نفسَه** (`postForm` و`fetchIdentity` يرميان حالةَ الردّ). فعطلٌ
 * ‏عند LinkedIn أو X كان يُقال «ينقص السرّان» ويُرسَل المالكُ يعيد لصقَ سرّين سليمين —
 * ‏وهي أوّلُ حركةٍ خاطئة. ولا يرث `OAuthError`: ليس ردًّا من منصّة.
 */
class NotConfigured extends Error {
  override readonly name = 'NotConfigured'
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
    throw new NotConfigured(`أسرار ${platform} غير مضبوطة — اضبطها من لوحة القنوات`)
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

/**
 * **لا بدءَ ربطٍ بلا جلسةٍ كاملة** (D-269).
 *
 * كان البدءُ مفتوحا، والمنظّمةُ تسقط إلى المالك حين لا كعكة (D-229) —
 * فمَن عرف العنوانَ العامّ يبدأ دورةً ويوافق **بحسابه هو** على المنصّة،
 * فيُحفَظ حسابُه ورموزُه تحت منظّمة المالك ويظهر في لوحته. ولا يُعرَف
 * من هنا من يملك الحساب: المنصّةُ تعيد ما وافق عليه المتصفّحُ الذي فتح الرابط.
 *
 * والعودةُ (`callback`) تبقى بلا جلسة بالضرورة: كعكةُ `SameSite=Strict`
 * لا تعبر التحويلَ من المنصّة. **وحارسُها حالتُها**: صفُّ `state` لا يُكتب
 * إلّا هنا، بعد الجلسة، فمَن لا يملك جلسةً لا يملك حالةً تُقبَل عند العودة.
 */
async function startingOrg(env: Env, request: Request): Promise<string | null> {
  const session = await loadSession(env.KV, request, env.ADMIN_TOKEN)
  // ‏والمعلَّقةُ وجلسةُ التسجيل لا تصلان هنا: يردّهما حارسُ الجلسات قبل كلّ مسار (D-317)
  if (session === null) return null
  return activeOrg(session.record)
}

oauth.get('/oauth/:platform/start', async (c) => {
  const platform = platformOf(c.req.param('platform'))
  if (platform === null) return c.json({ error: 'unknown_platform' }, 404)

  const org = await startingOrg(c.env, c.req.raw)
  if (org === null) {
    return c.redirect(`/panel/login?next=${encodeURIComponent(`/panel/channels/${platform}`)}`, 303)
  }

  const provider = PROVIDERS[platform]
  const mode = scopeModeOf(c.req.query('scope'))
  const scopes = scopeSet(platform, mode)
  let creds
  try {
    creds = await credentialsFor(c.env, platform) // يفشل مبكرا إن نقص سر
  } catch (error) {
    // ‏والطلبُ من اللوحة نفسِها فالكعكةُ تصل، والوميضُ يُقرأ في تبويب الإعداد
    if (error instanceof NotConfigured) return toSetup(c.env, c.req.raw, platform)
    // ‏والخزانةُ لا تُقرأ (قاعدةٌ أو مفتاح): صفحةٌ تقول ذلك، لا «Internal Server Error»
    console.error({ route: 'oauth.start', platform, failed: devDetail(error) })
    return resultPage('صدى — لم يبدأ الربط',
      unreachedBody({ platform, stage: 'start', detail: devDetail(error) }), 502)
  }

  const uri = redirectUri(c.env.PUBLIC_BASE_URL, platform)
  const pkce = await createPkce()
  const state = randomToken()
  // ‏والدورةُ مربوطةٌ بهذا المتصفّح (D-318): قيمةٌ في كعكةٍ قصيرة، وبصمتُها في الحالة
  const nonce = randomToken(32)

  await saveState(c.env.KV, state, {
    platform,
    verifier: pkce.verifier,
    redirectUri: uri,
    createdAt: new Date().toISOString(),
    // ما طُلب في **هذه** الدورة يُحفظ معها: صفحةُ التشخيص تعرضه، وما
    // يُسجَّل في القاعدة يُبنى عليه — والحارسُ يقرأ من القاعدة
    scopes: scopes.join(' '),
    org,
    binding: await bindingHash(nonce),
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
  // ومعاملاتُ المزوّد الخاصّة آخرا: Google لا يعطي إذنَ تجديدٍ بلا
  // `access_type=offline`، فيُربَط الحسابُ ثمّ يسقط بعد ساعة
  for (const [key, value] of Object.entries(provider.extraAuthorize ?? {})) {
    url.searchParams.set(key, value)
  }

  return new Response(null, { status: 302, headers: { Location: url.toString(), 'Set-Cookie': bindingCookie(platform, nonce) } })
})

/** كعكةُ المنصّة تُمحى مع كلّ ردٍّ على العودة: الدورةُ انتهت نجحت أم لا. */
function cleared(response: Response, platform: Platform): Response {
  response.headers.append('Set-Cookie', clearedBindingCookie(platform))
  return response
}

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

  // ‏أين وقف: قبل الحفظ لم يُكتب شيء، وبعده قد يكون الحسابُ حُفظ بلا إذنه
  let stage: 'reach' | 'save' = 'reach'
  try {
    const saved = await consumeState(c.env.KV, state)
    if (saved.platform !== platform) {
      return c.json({ error: 'state_platform_mismatch' }, 400)
    }
    /*
     * ‏**والعودةُ من المتصفّح الذي بدأ** (D-318) — قبل أن يُبدَّل الرمز. الحالةُ استُهلكت فلا تُعاد، ولا يُنادى المزوّد،
     * ‏ولا يُحفَظ حساب. وصفٌّ في سجلّ النشاط لمنظّمة البدء: رابطٌ أُرسل إلى غير صاحبه يُرى.
     */
    if (!(await sameBrowser(saved, readCookie(c.req.header('Cookie') ?? null, bindingCookieName(platform))))) {
      await record(c.env.DB, { actor: 'oauth', action: 'oauth.state.mismatch', target: platform, org: saved.org ?? OWNER_ORG }, c.req.raw)
      return cleared(resultPage('صدى — لم يكتمل الربط', otherBrowserBody(platform), 400), platform)
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
    stage = 'save'
    const id = await upsertAccount(c.env.DB, saved.org ?? OWNER_ORG, identity)
    await saveTokens(c.env.DB, c.env.TOKEN_ENC_KEY, id, tokens)

    // لا رمزَ في الصفحة ولا في عنوانها: اسمٌ وحالُ نطاقاتٍ لا أكثر
    return cleared(resultPage(
      `صدى — رُبط ${identity.displayName}`,
      connectedBody({
        platform,
        displayName: identity.displayName,
        grantedScopes: parseGranted(tokens.scopes),
        hasRefresh: tokens.refreshToken !== null,
        expiresAt: tokens.expiresAt,
        // ‏الكعكةُ على /panel وحدها، فالمحفوظةُ هنا (D-378)
        zone: await ownerZone(c.env.DB, c.req.header('Cookie') ?? null),
      }),
      200,
    ), platform)
  } catch (error) {
    // **من وصل هنا إنسانٌ ينظر، لا برنامجٌ يقرأ** (D-046).
    //
    // ورفضُ نهاية الرمز كان يعود سطرَ JSON: `oauth_failed` ومعه نصٌّ
    // عربيٌّ في متصفّح. **وهو أسوأُ موضعٍ يقع فيه ذلك**: نصفُ الدورة
    // نجح — شاشةُ الإذن مرّت — فالمالكُ لا يعرف أين يفتّش.
    //
    // و`StateError` يبقى JSON: حالةٌ منتهيةٌ أو مزوَّرة ليست عطلَ ضبطٍ
    // يُشخَّص، وصفحةٌ لها تدعو إلى إعادةٍ لا تنفع.
    //
    // ‏**وسرّان حُذفا بين الذهاب والعودة: صفحةٌ لا وميض** (مراجعة ر-1). العودةُ تحويلٌ من
    // ‏نطاق المنصّة، وكعكةُ الجلسة `SameSite=Strict` لا تعبره — فوميضٌ هنا لا يُكتب، وتبويبُ
    // ‏الإعداد بعده يُفتح بلا كعكةٍ على صفحة الدخول. والسببُ في السجلّ بلا قيمة.
    if (error instanceof AccountElsewhere) {
      console.warn({ route: 'oauth.callback', platform, stage, failed: 'account_elsewhere' })
      return resultPage('صدى — لم يكتمل الربط', elsewhereBody(platform, error.displayName), 400)
    }
    if (error instanceof NotConfigured) {
      console.error({ route: 'oauth.callback', platform, stage, failed: 'not_configured' })
      return resultPage('صدى — لم يكتمل الربط', unconfiguredBody(platform), 503)
    }
    // ‏**وما فوق 499 من المنصّة عطلٌ عندها لا رفضٌ لمفتاحينا** — 503 من نهاية الرمز أو الهويّة،
    // ‏أو ردٌّ لا يُقرأ: صفحةُ «لم نصل» بمحاولةٍ جديدة، لا مقارنةُ معرّفٍ تتّهم سرًّا سليمًا
    if (error instanceof OAuthError && error.status < 500) {
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
    // ‏وحالةٌ منتهيةٌ أو مزوَّرة تبقى ردًّا لا صفحة: ليست عطلَ ضبطٍ يُشخَّص (D-046)
    if (error instanceof StateError) return c.json({ error: 'invalid_state' }, 400)
    /*
     * ‏**وما لم نعرفه صفحةٌ لا «Internal Server Error»** (ر-1).
     *
     * ‏`TypeError` من `fetch` حين لا تُبلَغ نهايةُ الرمز أو الهويّة، أو 5xx منهما، أو عطلٌ في القاعدة:
     * ‏كان يُعاد رميُه فيصل المالكَ سطرٌ نصّيٌّ بلا رابطٍ ولا رجوع — بعد أن وافق عند المنصّة،
     * ‏والحالةُ استُهلكت فلا يُصلحه تحديث. فصفحةٌ تقول ما وقع وأين، وزرُّ محاولةٍ جديدة،
     * ‏والتفصيلُ للمطوّر تحتها وفي السجلّ.
     */
    console.error({ route: 'oauth.callback', platform, stage, failed: devDetail(error) })
    return resultPage('صدى — لم يكتمل الربط',
      unreachedBody({ platform, stage, detail: devDetail(error) }), 502)
  }
})

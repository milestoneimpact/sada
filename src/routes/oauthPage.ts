/**
 * ‏**ربطُ صفحة LinkedIn بالتطبيق الثاني** (D-423 · M-03).
 *
 *   GET  /oauth/linkedin-page/start       يحوّل إلى شاشة الموافقة بنطاقَي الصفحة وسرّي «SADA Pages»
 *   GET  /oauth/linkedin-page/callback    يبدّل code برمز، ويسأل عن الصفحات التي يديرها، ويحفظها مختومةً عشرَ دقائق
 *   GET  /panel/linkedin-pages?pick=…     شاشةُ الاختيار — خلف الجلسة
 *   POST /panel/linkedin-pages/pick       يحفظ كلَّ صفحةٍ مختارةٍ حسابًا بنوع `org`، ورمزَها مشفّرًا (D-005)
 *
 * ‏**ولماذا يُختار في اللوحة لا في صفحة العودة**: كعكةُ الجلسة `SameSite=Strict` لا تعبر التحويلَ من LinkedIn، فلا
 * ‏رمزَ CSRF هناك. فتُختم الدورةُ برمز المالك (AES-GCM بـ TOKEN_ENC_KEY، نطاقُ منظّمته) في KV، والاختيارُ بضغطةٍ من صفحة
 * ‏العودة إلى اللوحة — وهي من الموقع نفسِه فتصل الكعكة.
 *
 * ‏**وبلا سرّي التطبيق الثاني لا يبدأ شيء**: يعود المالكُ إلى إعداد LinkedIn وعليه «بانتظار موافقة LinkedIn».
 */
import { Hono } from 'hono'
import type { Env } from '../env'
import { createPkce, randomToken } from '../lib/pkce'
import { exchangeCode, OAuthError } from '../lib/oauth/exchange'
import { LINKEDIN } from '../lib/oauth/providers'
import { parseGranted } from '../lib/oauth/scopes'
import { bindingCookie, bindingCookieName, bindingHash, clearedBindingCookie, consumeState, sameBrowser, saveState, StateError } from '../lib/oauth/state'
import { AccountElsewhere, saveTokens, tokenScope, upsertAccount } from '../lib/tokens'
import type { TokenResponse } from '../lib/oauth/exchange'
import { LEGACY_RAW, openScoped, sealScoped } from '../lib/crypto'
import { loadSession, readCookie } from '../lib/session'
import { record } from '../lib/audit'
import { activeOrg } from '../lib/tenancy'
import { grantIdOf, listAdminOrgs, PAGE_CALLBACK_PATH, PAGE_SAY, PAGE_SCOPES, pageApp, pageCanPublish, type AdminOrg } from '../lib/linkedinPage'
import { pagesFoundBody, pagesPickBody, pagesRefusedBody, unreachedBody } from './ui/oauthResult'
import { devDetail, resultPage } from './oauth'
import { guardPost, loginResponse, setFlash } from './panel/shared'

export const oauthPage = new Hono<{ Bindings: Env }>()

/** ‏كعكةُ الربط باسمٍ غير اسم الحساب الشخصيّ — فلا يُبطل أحدُ الربطين الآخر. */
const COOKIE = 'linkedin-page'
const PICK_PREFIX = 'li-page-pick:'
const PICK_TTL = 600

const callbackOf = (base: string): string => base.replace(/\/+$/, '') + PAGE_CALLBACK_PATH
const SETUP = '/panel/channels/linkedin?tab=setup'

interface PickBlob { readonly tokens: TokenResponse; readonly orgs: readonly AdminOrg[] }

/** ‏يختم الدورةَ في KV برمز المالك — **مشفّرةً بنطاق منظّمته** (D-005)، ولا شيءَ منها نصًّا. */
export async function stashPick(env: Pick<Env, 'KV' | 'TOKEN_ENC_KEY'>, org: string, blob: PickBlob): Promise<string> {
  const id = randomToken()
  const sealed = await sealScoped(env.TOKEN_ENC_KEY, tokenScope(org), JSON.stringify(blob), PICK_PREFIX + id)
  await env.KV.put(PICK_PREFIX + id, JSON.stringify({ org, sealed }), { expirationTtl: PICK_TTL })
  return id
}

/** ‏يفتح ما خُتم — لمنظّمة الجلسة وحدها، وإلّا `null`. */
export async function readPick(env: Pick<Env, 'KV' | 'TOKEN_ENC_KEY'>, id: string, org: string): Promise<PickBlob | null> {
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(id)) return null
  const raw = await env.KV.get(PICK_PREFIX + id)
  if (raw === null) return null
  try {
    const row = JSON.parse(raw) as { org: string; sealed: { ciphertext: string; iv: string } }
    if (row.org !== org) return null
    return JSON.parse(await openScoped(env.TOKEN_ENC_KEY, tokenScope(org), row.sealed, PICK_PREFIX + id, LEGACY_RAW)) as PickBlob
  } catch {
    return null
  }
}

oauthPage.get('/oauth/linkedin-page/start', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return c.redirect('/panel/login?next=' + (encodeURIComponent(SETUP)), 303)
  const app = pageApp(c.env as unknown as Record<string, unknown>)
  if (app === null) {
    await setFlash(c.env, c.req.raw, { kind: 'warn', text: PAGE_SAY.pending + '. أضف LINKEDIN_ORG_CLIENT_ID وLINKEDIN_ORG_CLIENT_SECRET في أسرار Worker بعد الموافقة.' })
    return new Response(null, { status: 303, headers: { Location: SETUP } })
  }
  const uri = callbackOf(c.env.PUBLIC_BASE_URL)
  const state = randomToken()
  const nonce = randomToken(32)
  await saveState(c.env.KV, state, {
    platform: 'linkedin',
    // ‏LinkedIn لا تدعم PKCE (D-075) — والحقلُ مطلوبٌ في الحالة فيُملأ ولا يُرسَل
    verifier: (await createPkce()).verifier,
    redirectUri: uri,
    createdAt: new Date().toISOString(),
    scopes: PAGE_SCOPES.join(' '),
    org: activeOrg(session.record),
    binding: await bindingHash(nonce),
  })
  const url = new URL(LINKEDIN.authorizeUrl)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', app.clientId)
  url.searchParams.set('redirect_uri', uri)
  url.searchParams.set('scope', PAGE_SCOPES.join(' '))
  url.searchParams.set('state', state)
  return new Response(null, { status: 302, headers: { Location: url.toString(), 'Set-Cookie': bindingCookie(COOKIE, nonce) } })
})

oauthPage.get('/oauth/linkedin-page/callback', async (c) => {
  const done = (r: Response): Response => { r.headers.append('Set-Cookie', clearedBindingCookie(COOKIE)); return r }
  const denied = c.req.query('error')
  if (typeof denied === 'string' && denied !== '') {
    return done(resultPage('صدى — لم تُربَط صفحة', pagesRefusedBody('ردّ LinkedIn: ' + (c.req.query('error_description') ?? denied) + '.'), 400))
  }
  const code = c.req.query('code') ?? ''
  if (code === '') return c.json({ error: 'missing_code' }, 400)
  try {
    const saved = await consumeState(c.env.KV, c.req.query('state') ?? '')
    // ‏حالةُ الربط الشخصيّ لا تُقبل هنا: عنوانُ عودتها غيرُ هذا
    if (saved.platform !== 'linkedin' || !saved.redirectUri.endsWith(PAGE_CALLBACK_PATH)) return c.json({ error: 'state_platform_mismatch' }, 400)
    if (!(await sameBrowser(saved, readCookie(c.req.header('Cookie') ?? null, bindingCookieName(COOKIE))))) {
      return done(resultPage('صدى — لم تُربَط صفحة', pagesRefusedBody('عاد LinkedIn في متصفّحٍ غير الذي ضُغط فيه «اربط».'), 400))
    }
    const app = pageApp(c.env as unknown as Record<string, unknown>)
    if (app === null) return done(resultPage('صدى — لم تُربَط صفحة', pagesRefusedBody(PAGE_SAY.pending + '.'), 503))
    const tokens = await exchangeCode(LINKEDIN, app, { code, redirectUri: saved.redirectUri, verifier: saved.verifier, requestedScopes: PAGE_SCOPES })
    if (!pageCanPublish(tokens.scopes)) {
      return done(resultPage('صدى — لم تُربَط صفحة', pagesRefusedBody('منح LinkedIn «' + (parseGranted(tokens.scopes).join('، ') || 'لا شيء') + '» بلا w_organization_social.'), 400))
    }
    const orgs = await listAdminOrgs(tokens.accessToken)
    if (orgs.length === 0) return done(resultPage('صدى — لم تُربَط صفحة', pagesRefusedBody(PAGE_SAY.none), 400))
    const pick = await stashPick(c.env, saved.org ?? 'org_owner', { tokens, orgs })
    return done(resultPage('صدى — اختر صفحاتك', pagesFoundBody(orgs.map((o) => o.name), '/panel/linkedin-pages?pick=' + (pick)), 200))
  } catch (error) {
    if (error instanceof StateError) return c.json({ error: 'invalid_state' }, 400)
    if (error instanceof OAuthError && error.status < 500) {
      return done(resultPage('صدى — لم تُربَط صفحة', pagesRefusedBody('ردّ LinkedIn الرمزَ: ' + (error.code ?? error.status) + '.'), 502))
    }
    console.error({ route: 'oauth.linkedin-page.callback', failed: devDetail(error) })
    return done(resultPage('صدى — لم تُربَط صفحة', unreachedBody({ platform: 'linkedin', stage: 'reach', detail: devDetail(error) }), 502))
  }
})

oauthPage.get('/panel/linkedin-pages', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return loginResponse(c.env, c.req.raw)
  const pick = c.req.query('pick') ?? ''
  const blob = await readPick(c.env, pick, activeOrg(session.record))
  if (blob === null) {
    await setFlash(c.env, c.req.raw, { kind: 'warn', text: 'انتهت مهلة اختيار الصفحات — «اربط صفحة LinkedIn» من جديد.' })
    return new Response(null, { status: 303, headers: { Location: SETUP } })
  }
  return resultPage('صدى — اختر صفحاتك', pagesPickBody({ pick, csrf: session.record.csrf, orgs: blob.orgs }), 200)
})

/**
 * ‏**كلُّ صفحةٍ حسابُها** (`linkedin:org:<رقم>`) ورمزُها مشفّرًا (D-005). والرمزُ واحدٌ لها جميعًا — رمزُ مديرها —
 * ‏ويُحفظ لكلٍّ منها ليتجدّد ويُفصل وحدَه.
 */
oauthPage.post('/panel/linkedin-pages/pick', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const org = activeOrg(gate.session.record)
  const pick = String(gate.form.get('pick') ?? '')
  const blob = await readPick(c.env, pick, org)
  if (blob === null) {
    await setFlash(c.env, c.req.raw, { kind: 'warn', text: 'انتهت مهلة اختيار الصفحات — «اربط صفحة LinkedIn» من جديد.' })
    return new Response(null, { status: 303, headers: { Location: SETUP } })
  }
  const wanted = new Set(gate.form.getAll('org').map(String))
  const chosen = blob.orgs.filter((o) => wanted.has(o.id))
  if (chosen.length === 0) {
    await setFlash(c.env, c.req.raw, { kind: 'bad', text: 'اختر صفحةً واحدةً على الأقلّ.' })
    return new Response(null, { status: 303, headers: { Location: '/panel/linkedin-pages?pick=' + (encodeURIComponent(pick)) } })
  }
  const saved: string[] = []
  const elsewhere: string[] = []
  // ‏بصمةُ هذه الموافقة لكلّ صفحاتها (مراجعة D-425): بها يعرف الفصلُ أنّ رمزَ المدير مشترك ولو تجدّدت الرموزُ كلٌّ وحدها
  const grant = await grantIdOf(blob.tokens)
  for (const o of chosen) {
    try {
      const id = await upsertAccount(c.env.DB, org, { platform: 'linkedin', kind: 'org', externalId: o.id, displayName: o.name })
      await saveTokens(c.env.DB, c.env.TOKEN_ENC_KEY, id, blob.tokens)
      await c.env.DB.prepare('UPDATE accounts SET grant_id = ? WHERE id = ? AND org_id = ?').bind(grant, id, org).run()
      saved.push(o.name)
    } catch (error) {
      if (error instanceof AccountElsewhere) elsewhere.push(o.name)
      else throw error
    }
  }
  await c.env.KV.delete(PICK_PREFIX + pick)
  await record(c.env.DB, { actor: 'panel', action: 'oauth.linkedin_page.pick', target: chosen.map((o) => o.id).join(','), detail: String(saved.length) + ' حُفظت', org }, c.req.raw)
  const parts = [saved.length > 0 ? 'رُبطت ' + (saved.map((n) => '«LinkedIn · صفحة ' + (n) + '»').join(' و')) + ' — تظهر خيارًا للنشر في المحرّر والخطّة.' : '']
  if (elsewhere.length > 0) parts.push('و' + (elsewhere.join(' و')) + ' مربوطةٌ في منظّمةٍ أخرى فلم تُنقل.')
  await setFlash(c.env, c.req.raw, { kind: saved.length > 0 ? 'ok' : 'warn', text: parts.filter((p) => p !== '').join(' ') })
  return new Response(null, { status: 303, headers: { Location: SETUP } })
})

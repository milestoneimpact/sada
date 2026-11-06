/**
 * مسارات العامل الثاني: مفاتيحُ المرور، ورمزُ التطبيق، ورموزُ الاسترداد، و«تحقّق للتوّ»، وصفحةُ التسجيل.
 *
 * منفصلةٌ عن `panel.ts` لأنّ حارسَها مختلف: أكثرُها يُنادى **بجلسةٍ
 * معلَّقة** — جلسةٍ أثبت صاحبُها الرمزَ ولم يُثبت العامل الثاني بعد —
 * أو **بجلسة تسجيلٍ وحده** (D-317). والسؤالُ «أمعلَّقةٌ هي؟ أتسجيلٌ وحده؟» في حارسٍ واحدٍ قبل كلّ مسار
 * (`routes/access.ts`)، لا في كلّ مسار.
 *
 * ## لكلّ حسابٍ عواملُه (D-317)
 *
 * كانت العواملُ للمالك الواحد، والدخولُ بمفتاحٍ يفتح جلسةَ مالكٍ أيًّا كان من سجّله. فصار كلُّ فعلٍ هنا على **بريد
 * الجلسة** وحده: يسجّل لصاحبها، ويحذف من عواملها، ويتحقّق بعواملها؛ والدخولُ بمفتاحٍ جلسةُ صاحبه بدوره.
 */
import { Hono } from 'hono'
import type { Context } from 'hono'
import type { Env } from '../env'
import { record } from '../lib/audit'
import { fromBase64Url, toBase64Url } from '../lib/security/bytes'
import {
  addPasskey, confirmTotp, countRecoveryCodes, deletePasskey, factorState, findPasskey,
  issueRecoveryCodes, listPasskeys, markTotpStep, readTotpSecret, removeTotp, startTotp,
  totpState, touchPasskey, useRecoveryCode, type FactorState,
} from '../lib/security/factors'
import { htmlHeaders, makeNonce } from '../lib/security/headers'
import { relyingParty } from '../lib/security/rp'
import { newSecret, otpauthUrl, verifyTotp } from '../lib/security/totp'
import {
  CHALLENGE_TTL_SECONDS, newChallenge, verifyAssertion, verifyRegistration,
} from '../lib/security/webauthn'
import {
  checkCsrf, clearedCookie, createPasskeySession, destroySession, isFresh, loadSession, markFresh,
  promoteSession, safeNext, sessionCookie, type Session,
} from '../lib/session'
import { attemptState, clearAttempts, delayMs, recordFailure } from '../lib/rateLimit'
import {
  GATE_UNAVAILABLE_TEXT, releaseCodeGuesses, releaseFactorGuess, reserveChallenge, reserveCodeGuess,
  reserveCodeIssue, reserveFactorGuess,
} from '../lib/security/gate'
import { digest, fingerprint } from '../lib/security/digest'
import { issueCode, verifyCode } from '../lib/security/loginCode'
import { sendText } from '../lib/mail/send'
import { deviceName, securityEvent } from '../lib/security/events'
import { isOwnerEmail, normalizeEmail, OWNER_EMAIL } from '../lib/ownerEmail'
import { activeMember, OWNER_WHO, ROLE_LABEL, type Who } from '../lib/team'
import { say } from '../lib/errors/catalog'
import { enrolPage, resumePage, secondFactorPage, stepUpPage } from './authView'
import { loginPage } from './panelView'
import { stepUpFormKey, stepUpUrl, type SavedForm } from './access'

export const auth = new Hono<{ Bindings: Env }>()

function page(render: (nonce: string) => string, status = 200): Response {
  const nonce = makeNonce()
  return new Response(render(nonce), { status, headers: htmlHeaders(nonce) })
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status })
}

/** أكبرُ جسدٍ يُقرأ لتوقيع مفتاح: الحقولُ الأربعةُ بـbase64url دون كيلوبايتين. */
const MAX_ASSERTION_BYTES = 16 * 1024

/** التحدّي في KV بمهلةٍ قصيرة، ومربوطٌ بالجلسة إن وُجدت. */
function challengeKey(scope: string): string {
  return 'webauthn:' + scope
}

/** رمزُ بريد «تحقّق للتوّ» في مفتاحٍ غير مفتاح الدخول: رمزُ الدخول لا يصلح هنا ولا العكس. */
function stepUpCodeKey(email: string): string {
  return 'stepup:' + email
}

/** بريدُ صاحب الجلسة — والجلسةُ القديمةُ بلا بريدٍ للمالك. */
function emailOf(session: Session): string {
  return normalizeEmail(session.record.email ?? OWNER_EMAIL)
}

/** من صاحبُ هذا البريد الآن: المالكُ، أو مدعوٌّ قائم، أو لا أحد (أُلغيت دعوتُه). */
async function whoIs(env: Env, email: string): Promise<Who | null> {
  if (isOwnerEmail(email)) return OWNER_WHO
  const member = await activeMember(env.DB, email)
  return member === null ? null : { email: member.email, role: member.role, orgs: member.orgs }
}

/** يقرأ عواملَ الحساب — أو `null` إن لم تردّ القاعدة (D-317): من يقرّر على `null` لا يفتح شيئًا. */
async function factorsOf(env: Env, email: string): Promise<FactorState | null> {
  try {
    return await factorState(env.DB, relyingParty(env.PUBLIC_BASE_URL).id, email)
  } catch (error) {
    console.warn({ job: 'factors', failed: String(error) })
    return null
  }
}

/**
 * وجهةُ «تحقّق للتوّ» — **مسارٌ في اللوحة (`safeNext`) أو بدءُ ربطٍ** (`/oauth/<منصّة>/start`). وما سواهما الرئيسيّة.
 */
export function safeStepUpNext(raw: string | null | undefined): string {
  if (typeof raw === 'string' && /^\/oauth\/[a-z]+\/start(\?[A-Za-z0-9=&_-]{0,80})?$/.test(raw)) return raw
  return safeNext(raw)
}

/**
 * حارسٌ لمسارٍ يُنادى بجلسةٍ **كاملة أو جلسة تسجيل** — إعدادُ العامل الثاني وحذفُه.
 *
 * ورمزُ CSRF مفحوصٌ هنا كما في اللوحة: إضافةُ مفتاحِ مرورٍ فعلٌ يغيّر من
 * يملك الدخول، فهو أولى بالحراسة لا أهون. والمعلَّقةُ لا تصل أصلًا: يردّها الحارسُ قبل كلّ مسار (D-317).
 */
async function guardFull(
  c: { env: Env; req: { raw: Request; formData: () => Promise<FormData> } },
): Promise<{ denied: Response } | { session: Session; form: FormData }> {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return { denied: json({ error: 'no_session' }, 401) }

  let form: FormData
  try {
    form = await c.req.formData()
  } catch {
    form = new FormData()
  }
  if (!(await checkCsrf(session, String(form.get('_csrf') ?? '')))) {
    return { denied: json({ error: 'csrf_failed' }, 403) }
  }
  return { session, form }
}

/**
 * حارسٌ لمسارٍ يُنادى بجلسةٍ **معلَّقة** — إتمامُ العامل الثاني.
 *
 * ونماذجُه نماذجُ صفحةٍ لا نداءاتُ سكربت: ما يُردّ هنا يفتحه المتصفّحُ صفحةً
 * كاملة. فكان «جلسةٌ انتهت» و«رمزُ النموذج لا يطابق» يُريان المالكَ سطرَ JSON
 * إنجليزيًّا (D-161). الجلسةُ الغائبة تعود إلى الدخول، والرمزُ الخاطئ يعيد
 * رسمَ الشاشة برسالة.
 */
async function guardPending(
  c: { env: Env; req: { raw: Request; formData: () => Promise<FormData> } },
): Promise<{ denied: Response } | { session: Session; form: FormData }> {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) {
    return { denied: new Response(null, { status: 303, headers: { Location: '/panel' } }) }
  }

  let form: FormData
  try {
    form = await c.req.formData()
  } catch {
    form = new FormData()
  }
  if (!(await checkCsrf(session, String(form.get('_csrf') ?? '')))) {
    return { denied: await failSecondFactor(c, 'انتهت صلاحية الصفحة — أعد المحاولة.', 403) }
  }
  return { session, form }
}

// ── شاشة العامل الثاني ───────────────────────────────────────────────

/** يرسم شاشة العامل الثاني بعوامل صاحب الجلسة وحده — وبتحدٍّ جديد. */
async function renderSecondFactor(env: Env, session: Session, error: string | null, status: number): Promise<Response> {
  const rp = relyingParty(env.PUBLIC_BASE_URL)
  const state = await factorsOf(env, emailOf(session))
  const challenge = newChallenge()
  await env.KV.put(challengeKey(session.id), challenge, { expirationTtl: CHALLENGE_TTL_SECONDS })
  return page(
    (nonce) =>
      secondFactorPage(
        {
          csrf: session.record.csrf,
          challenge,
          rpId: rp.id,
          hasPasskey: (state?.passkeys.length ?? 0) > 0,
          hasTotp: state?.totp.confirmed ?? false,
          hasRecovery: (state?.recovery.unused ?? 0) > 0,
          error: state === null ? say('factor_unavailable') : error,
        },
        nonce,
      ),
    state === null ? 503 : status,
  )
}

/**
 * الشاشةُ التي تلي الرمزَ الصحيح حين يكون ثمّة عاملٌ ثانٍ.
 *
 * وهي المكانُ **الوحيد** الذي تفتحه جلسةٌ معلَّقة.
 */
auth.get('/panel/2fa', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return c.redirect('/panel', 303)
  if (!session.record.pending) return c.redirect('/panel', 303)
  return renderSecondFactor(c.env, session, null, 200)
})

// ── الدخول بمفتاح مرور — من صفحة الدخول مباشرة ───────────────────────

/**
 * تحدٍّ للدخول قبل أيّ جلسة.
 *
 * ويُخزَّن تحت مفتاحٍ عشوائيّ يُعاد إلى العميل — لا تحت عنوان الـ IP: عدّةُ
 * أجهزةٍ خلف عنوانٍ واحد تدوس تحدّياتِ بعضها فيفشل الدخولُ بلا تفسير.
 *
 * **ولا يُردّ بدلاء رمز البريد** (D-317): كان «عنوانُك أخطأ خمسًا في رمز البريد» أو «ثلاثون فشلًا من أيّ مكان» يغلق
 * هذا البابَ أيضًا، والتوقيعُ لا يُخمَّن. فسقفُه سقفُ التحدّيات وحده (كتابةٌ مدفوعةٌ في KV لكلّ تحدٍّ).
 */
auth.post('/panel/passkey/challenge', async (c) => {
  const rp = relyingParty(c.env.PUBLIC_BASE_URL)
  let keys
  try {
    keys = await listPasskeys(c.env.DB, rp.id)
  } catch {
    return json({ error: 'unavailable' }, 503)
  }
  if (keys.length === 0) return json({ error: 'no_passkeys' }, 404)

  // ‏كلُّ تحدٍّ كتابةٌ في KV تُدفَع، والطالبُ مجهول: سقفٌ للعنوان وللجميع قبل الكتابة (D-161)
  const challengeSlot = await reserveChallenge(c.env.DB, c.req.raw)
  if (!challengeSlot.allowed) {
    // ‏قاعدةٌ لا تردّ ليست حدًّا (D-291): 503 لا 429، فالعميلُ يعيد بعد قليل ولا يُعدّ محظورًا
    return json({ error: challengeSlot.why === 'db' ? 'unavailable' : 'rate_limited' }, challengeSlot.why === 'db' ? 503 : 429)
  }

  const ticket = crypto.randomUUID()
  const challenge = newChallenge()
  await c.env.KV.put(challengeKey(ticket), challenge, {
    expirationTtl: CHALLENGE_TTL_SECONDS,
  })

  return json({
    ticket,
    challenge,
    rpId: rp.id,
    // تُرسَل المعرّفات ليعرف المتصفّح أيّ مفتاحٍ يطلب. **وهي ليست سرّا**:
    // معرّفُ اعتمادٍ لا يوقّع شيئا بلا مفتاحه الخاصّ الذي لا يغادر الجهاز
    allowCredentials: keys.map((k) => k.credentialId),
  })
})

/**
 * إتمامُ الدخول بمفتاح مرور — جلسةٌ كاملة من أوّلها، **لصاحب المفتاح بدوره** (D-317).
 *
 * **ولا يمرّ ببدلاء رمز البريد**: توقيعٌ صحيحٌ لا يردّه أنّ مجهولًا خمّن رموزَ بريدٍ من العنوان نفسِه أو من غيره. وكلُّ
 * محاولةٍ هنا تستهلك تذكرةً لا تُصدَر إلّا تحت سقف التحدّيات، فالتخمينُ محدودٌ من هناك.
 */
auth.post('/panel/passkey/login', async (c) => {
  // ‏توقيعُ مفتاحٍ بضعُ مئاتٍ من البايتات: جسدٌ أكبرُ لا يُقرأ أصلًا (D-161)
  if (Number(c.req.header('Content-Length') ?? '0') > MAX_ASSERTION_BYTES) {
    return json({ error: 'bad_request' }, 413)
  }

  const body = await c.req.json<{
    ticket?: string
    credentialId?: string
    authenticatorData?: string
    clientDataJSON?: string
    signature?: string
  }>().catch(() => null)
  if (body === null) return json({ error: 'bad_request' }, 400)

  const ticket = String(body.ticket ?? '')
  const challenge = ticket === '' ? null : await c.env.KV.get(challengeKey(ticket))
  if (challenge === null) return json({ error: 'challenge_expired' }, 400)
  // التحدّي يُستهلَك مرّةً واحدة، نجح أو فشل: إعادةُ إرسالٍ لا تجد ما تردّ به
  await c.env.KV.delete(challengeKey(ticket))

  const verdict = await completeAssertion(c.env, body, challenge, null)
  if (verdict.ok && !verdict.userVerified) {
    /*
     * **والمفتاحُ وحدَه بابٌ كامل، فيلزمه أن يعرف صاحبَه** (D-161).
     *
     * مفتاحُ أمانٍ بلا بصمةٍ ولا PIN يُثبت الحيازةَ لا الهويّة: من التقطه لمسه
     * فدخل، ولا كلمةَ إدارةٍ ولا رمزَ تطبيق. فالدخولُ به وحدَه يشترط راية UV،
     * ويبقى صالحًا عاملًا ثانيًا بعد الكلمة (`/panel/2fa/passkey`).
     */
    await record(
      c.env.DB,
      { actor: 'anonymous', action: 'passkey.denied', detail: 'لم يتحقّق المفتاح من صاحبه (لا بصمة ولا PIN)' },
      c.req.raw,
    )
    return json({ error: 'uv_required' }, 401)
  }
  if (!verdict.ok) {
    await record(
      c.env.DB,
      { actor: 'anonymous', action: 'passkey.denied', detail: verdict.reason },
      c.req.raw,
    )
    // ‏والسببُ في سجلّ التدقيق لا في الردّ (D-160): الطالبُ هنا مجهول، و«مفتاحٌ
    // ‏غير مسجَّل» أو «تراجع العدّاد» يقول له ما الذي يجرّبه بعدها
    return json({ error: 'denied' }, 401)
  }

  // ‏صاحبُ المفتاح ودورُه الآن (D-317): مدعوٌّ أُلغيت دعوتُه لا يفتح مفتاحُه شيئًا
  const who = await whoIs(c.env, verdict.email)
  if (who === null) {
    await record(c.env.DB, { actor: 'anonymous', action: 'passkey.denied', detail: 'مفتاحٌ لدعوةٍ أُلغيت' }, c.req.raw)
    return json({ error: 'denied' }, 401)
  }
  const session = await createPasskeySession(c.env.KV, c.env.ADMIN_TOKEN, { email: who.email, role: who.role }, c.req.raw)
  if ('error' in session) {
    return json({ error: 'admin_disabled', detail: 'ADMIN_TOKEN غير مضبوط' }, 503)
  }

  await clearAttempts(c.env.KV, c.req.raw)
  await record(
    c.env.DB,
    { actor: 'passkey', action: 'session.open', target: verdict.label, by: who.email },
    c.req.raw,
  )
  await securityEvent(c.env, c.req.raw, { kind: 'session.new', email: who.email, detail: 'بمفتاح «' + verdict.label + '»', sessionId: session.id })
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': sessionCookie(session.id) },
  })
})

interface AssertionBody {
  credentialId?: string
  authenticatorData?: string
  clientDataJSON?: string
  signature?: string
}

/**
 * التحقّق المشترك بين الدخول والعامل الثاني و«تحقّق للتوّ» — منطقٌ واحد لا نسخ.
 *
 * و`owner` حين يُعرَف صاحبُ الجلسة: **مفتاحُ غيره يُردّ** (D-317)، فلا يُتمّ مدعوٌّ عاملَ المالك بمفتاحه.
 */
async function completeAssertion(
  env: Env,
  body: AssertionBody,
  challenge: string,
  owner: string | null,
): Promise<{ ok: true; label: string; email: string; userVerified: boolean } | { ok: false; reason: string }> {
  const rp = relyingParty(env.PUBLIC_BASE_URL)
  const credentialId = String(body.credentialId ?? '')
  if (credentialId === '') return { ok: false, reason: 'لا معرّف اعتماد' }

  let stored
  try {
    stored = await findPasskey(env.DB, credentialId)
  } catch {
    return { ok: false, reason: 'القاعدة لم تردّ' }
  }
  if (stored === null) return { ok: false, reason: 'مفتاح غير مسجَّل' }
  if (stored.rpId !== rp.id) return { ok: false, reason: 'مفتاح سُجّل على بيئة أخرى' }
  if (owner !== null && normalizeEmail(stored.email) !== owner) return { ok: false, reason: 'مفتاحٌ لحسابٍ آخر' }

  let assertion
  try {
    assertion = {
      authenticatorData: fromBase64Url(String(body.authenticatorData ?? '')),
      clientDataJSON: fromBase64Url(String(body.clientDataJSON ?? '')),
      signature: fromBase64Url(String(body.signature ?? '')),
    }
  } catch {
    return { ok: false, reason: 'حقول مشوّهة' }
  }

  const verdict = await verifyAssertion(
    assertion,
    { publicKey: stored.publicKey, alg: stored.alg, signCount: stored.signCount },
    { challenge, origin: rp.origin, rpId: rp.id },
  )
  if (!verdict.ok) return { ok: false, reason: verdict.reason }

  await touchPasskey(env.DB, stored.id, verdict.signCount)
  return { ok: true, label: stored.label, email: normalizeEmail(stored.email), userVerified: verdict.userVerified }
}

function parseAssertion(raw: string): AssertionBody | null {
  try {
    return JSON.parse(raw) as AssertionBody
  } catch {
    return null
  }
}

/** يرقّي المعلَّقة بعد عاملٍ ثانٍ صحيح، ويُخبر صاحبَها بالدخول الجديد خارج القاعدة (D-317). */
async function promoted(
  c: { env: Env; req: { raw: Request } },
  session: Session,
  how: string,
  to: string,
): Promise<Response> {
  const next = await promoteSession(c.env.KV, session)
  const email = emailOf(session)
  await record(c.env.DB, { actor: 'panel', action: 'session.open', detail: how, by: email }, c.req.raw)
  await securityEvent(c.env, c.req.raw, { kind: 'session.new', email, detail: how, sessionId: next.id })
  return new Response(null, {
    status: 303,
    headers: { Location: to, 'Set-Cookie': sessionCookie(next.id) },
  })
}

// ── إتمامُ العامل الثاني على جلسةٍ معلَّقة ────────────────────────────

auth.post('/panel/2fa/passkey', async (c) => {
  const gate = await guardPending(c)
  if ('denied' in gate) return gate.denied
  if (!gate.session.record.pending) return c.redirect('/panel', 303)

  const challenge = await c.env.KV.get(challengeKey(gate.session.id))
  if (challenge === null) {
    return failSecondFactor(c, 'انتهت مهلة الصفحة — اضغط «الدخول بمفتاح المرور» مرّةً أخرى.', 400)
  }
  await c.env.KV.delete(challengeKey(gate.session.id))

  const body = parseAssertion(String(gate.form.get('assertion') ?? ''))
  if (body === null) return failSecondFactor(c, 'لم يصل توقيع المفتاح — أعد المحاولة.', 400)

  const verdict = await completeAssertion(c.env, body, challenge, emailOf(gate.session))
  if (!verdict.ok) {
    await record(
      c.env.DB,
      { actor: 'panel', action: '2fa.denied', detail: verdict.reason, by: emailOf(gate.session) },
      c.req.raw,
    )
    return failSecondFactor(c, 'لم يُقبَل المفتاح: ' + verdict.reason, 401)
  }

  await record(c.env.DB, { actor: 'panel', action: '2fa.passkey', by: emailOf(gate.session) }, c.req.raw)
  // ‏إلى الصفحة التي طُلبت قبل الدخول، وقد حُفظت في الجلسة المعلَّقة (ر-11)
  return promoted(c, gate.session, 'بمفتاح «' + verdict.label + '»', safeNext(gate.session.record.next))
})

/**
 * يحجز تخمينَ عاملٍ ثانٍ (رمز تطبيق أو استرداد) — **والسادسُ في الجلسة يُسقطها** (D-317).
 * يعيد ردًّا جاهزًا إن رُدّ، أو `null` ليمضي التحقّق.
 */
async function reserveGuess(
  c: { env: Env; req: { raw: Request } },
  session: Session,
  onDenied: (text: string, status: number) => Promise<Response> | Response,
): Promise<Response | null> {
  const handle = await fingerprint(session.id)
  const slot = await reserveFactorGuess(c.env.DB, emailOf(session), handle, c.req.raw)
  if (slot.allowed) return null
  if (slot.why === 'db') return onDenied(GATE_UNAVAILABLE_TEXT, 503)
  if (slot.dropSession === true) {
    await destroySession(c.env.KV, c.req.raw)
    await record(c.env.DB, { actor: 'panel', action: '2fa.denied', detail: 'خمسُ محاولاتٍ خاطئة — أُسقطت الجلسة', by: emailOf(session) }, c.req.raw)
    return redirectCleared()
  }
  return onDenied(slot.why === 'global'
    ? 'محاولاتٌ خاطئة كثيرة اليوم على هذا الحساب — ادخل بمفتاح المرور أو انتظر يومًا.'
    : 'تجاوزت حدّ المحاولات. انتظر ربع ساعة.', 429)
}

/** خروجٌ بعد إسقاط الجلسة: الكعكةُ تُمحى، والدخولُ يعرض سببه. */
function redirectCleared(): Response {
  const nonce = makeNonce()
  const headers = new Headers(htmlHeaders(nonce))
  headers.set('Set-Cookie', clearedCookie())
  return new Response(
    loginPage({ error: 'خمس محاولات خاطئة للعامل الثاني — أُغلقت هذه المحاولة. ادخل من جديد.' }, nonce),
    { status: 429, headers },
  )
}

auth.post('/panel/2fa/totp', async (c) => {
  const gate = await guardPending(c)
  if ('denied' in gate) return gate.denied
  if (!gate.session.record.pending) return c.redirect('/panel', 303)
  const email = emailOf(gate.session)

  const state = await attemptState(c.env.KV, c.req.raw)
  if (state.blocked) {
    return failSecondFactor(c, 'تجاوزت حدّ المحاولات. انتظر ربع ساعة.', 429)
  }
  // ‏والحجزُ قبل الفحص (D-161): ألفُ طلبٍ متزامنٍ يقرأ «صفرًا» من KV قبل أن
  // ‏يكتب أحدُها، والعدّادُ الذرّيُّ في D1 يردّ السادسَ قبل أن يُقارَن رمزُه
  const denied = await reserveGuess(c, gate.session, (text, status) => failSecondFactor(c, text, status))
  if (denied !== null) return denied

  let secret: string | null
  let stored
  try {
    secret = await readTotpSecret(c.env.DB, c.env.TOKEN_ENC_KEY, email)
    stored = await totpState(c.env.DB, email)
  } catch {
    return failSecondFactor(c, say('factor_unavailable'), 503)
  }
  if (secret === null || !stored.confirmed) {
    return failSecondFactor(c, 'لا رمز تطبيق مضبوطا لهذا الحساب.', 400)
  }

  const result = await verifyTotp(secret, String(gate.form.get('code') ?? ''), {
    ...(stored.lastStep === null ? {} : { lastStep: stored.lastStep }),
  })
  if (!result.ok) {
    const after = await recordFailure(c.env.KV, c.req.raw)
    await record(c.env.DB, { actor: 'panel', action: '2fa.denied', detail: 'totp', by: email }, c.req.raw)
    const wait = delayMs(after.attempts)
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
    return failSecondFactor(c, result.reason, 401)
  }

  // الخطوةُ تُسجَّل قبل الترقية: رمزٌ قُبل لا يُقبل ثانيةً ولو تعثّر ما بعده
  await markTotpStep(c.env.DB, result.step, email)
  await clearAttempts(c.env.KV, c.req.raw)
  await releaseFactorGuess(c.env.DB, email, await fingerprint(gate.session.id), c.req.raw)
  await record(c.env.DB, { actor: 'panel', action: '2fa.totp', by: email }, c.req.raw)
  // ‏إلى الصفحة التي طُلبت قبل الدخول، وقد حُفظت في الجلسة المعلَّقة (ر-11)
  return promoted(c, gate.session, 'برمز التطبيق', safeNext(gate.session.record.next))
})

/**
 * الدخولُ برمز استرداد — آخرُ الأبواب.
 *
 * والرمزُ يُستهلك، ويُنبَّه صاحبُه إلى ما بقي: من نفدت رموزُه ثمّ فقد جهازه
 * لا باب له. **ويُخبَر خارج القاعدة** (D-317): رمزُ استردادٍ استُعمل حدثٌ لا يمرّ صامتًا.
 */
auth.post('/panel/2fa/recovery', async (c) => {
  const gate = await guardPending(c)
  if ('denied' in gate) return gate.denied
  if (!gate.session.record.pending) return c.redirect('/panel', 303)
  const email = emailOf(gate.session)

  const state = await attemptState(c.env.KV, c.req.raw)
  if (state.blocked) {
    return failSecondFactor(c, 'تجاوزت حدّ المحاولات. انتظر ربع ساعة.', 429)
  }

  const denied = await reserveGuess(c, gate.session, (text, status) => failSecondFactor(c, text, status))
  if (denied !== null) return denied

  let used: boolean
  try {
    used = await useRecoveryCode(c.env.DB, String(gate.form.get('code') ?? ''), email)
  } catch {
    return failSecondFactor(c, say('factor_unavailable'), 503)
  }
  if (!used) {
    const after = await recordFailure(c.env.KV, c.req.raw)
    await record(c.env.DB, { actor: 'panel', action: '2fa.denied', detail: 'recovery', by: email }, c.req.raw)
    const wait = delayMs(after.attempts)
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
    return failSecondFactor(c, 'رمز استرداد غير صحيح أو مستهلَك.', 401)
  }

  await clearAttempts(c.env.KV, c.req.raw)
  await releaseFactorGuess(c.env.DB, email, await fingerprint(gate.session.id), c.req.raw)
  const left = await countRecoveryCodes(c.env.DB, email).catch(() => ({ total: 0, unused: 0 }))
  const remaining = 'بقي ' + String(left.unused)
  const next = await promoteSession(c.env.KV, gate.session)
  await record(
    c.env.DB,
    { actor: 'panel', action: '2fa.recovery', detail: remaining, by: email },
    c.req.raw,
  )
  await securityEvent(c.env, c.req.raw, { kind: 'recovery.used', email, detail: remaining, sessionId: next.id })
  await c.env.KV.put(
    'flash:' + next.id,
    JSON.stringify({
      kind: 'warn',
      text: 'دخلت برمز استرداد — ' + remaining + ' منها. ولّد مجموعةً جديدة من قسم الأمان.',
    }),
    { expirationTtl: 60 },
  )
  return new Response(null, {
    status: 303,
    /*
     * ‏**إلى اللوحة لا إلى الصفحة المطلوبة — في هذا الباب وحده** (مراجعة ر-11).
     *
     * ‏التحذيرُ أعلاه وميض، ولا يقرؤه إلّا `/panel` وصفحةُ المنصّة؛ و`safeNext` يقبل
     * ‏التقريرَ و«ما عليك» ورحلةَ منشورٍ وملفَّ القالب، فكان يصل المالكَ ما طلب ويسقط
     * ‏التحذيرُ بعد دقيقةٍ بلا أن يُرى. **ومن فقد جهازه أحوجُ إلى «بقي N» منه إلى صفحته**:
     * ‏يعرف كم بقي قبل أن ينفد آخرُ باب. والعاملان الآخران يعودان إلى ما طُلب.
     */
    headers: { Location: '/panel', 'Set-Cookie': sessionCookie(next.id) },
  })
})

/** يعيد رسم شاشة العامل الثاني برسالةٍ — بتحدٍّ جديد. */
async function failSecondFactor(
  c: { env: Env; req: { raw: Request } },
  error: string,
  status: number,
): Promise<Response> {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) {
    return new Response(null, { status: 303, headers: { Location: '/panel' } })
  }
  return renderSecondFactor(c.env, session, error, status)
}

// ── إدارةُ العوامل: لصاحب الجلسة وحده ──────────────────────────────────

/**
 * معرّفُ المستخدم في المتوثِّق: الثابتُ القديمُ للمالك (فلا يصير له حسابان في جهازه)، وللمدعوّ بصمةُ بريده — **لا
 * البريدُ نفسُه**: المعرّفُ يُحفظ في المتوثِّق ويُرسَل مع كلّ دخول.
 */
async function webauthnUser(email: string): Promise<{ id: string; name: string; displayName: string }> {
  if (isOwnerEmail(email)) {
    return { id: toBase64Url(new TextEncoder().encode('sada-owner')), name: 'owner', displayName: 'مالك صدى' }
  }
  return { id: toBase64Url(await digest('sada-user:' + email)), name: email, displayName: email }
}

/**
 * بعد أوّل عاملٍ لحساب: رموزُ استرداده إن لم تكن (D-317: «تُصدَر بعد العامل الأوّل»)، وجلسةُ التسجيل تصير كاملةً
 * **بمعرّفٍ جديد**. ويُخبَر صاحبُه بالعامل الجديد خارج القاعدة.
 */
async function afterFactorAdded(
  c: { env: Env; req: { raw: Request } },
  session: Session,
  hadRecovery: boolean,
  what: string,
): Promise<{ codes: string[]; cookie: string | null }> {
  const email = emailOf(session)
  const codes = hadRecovery ? [] : await issueRecoveryCodes(c.env.DB, email)
  let cookie: string | null = null
  let id = session.id
  if (session.record.enrol === true) {
    const next = await promoteSession(c.env.KV, session)
    cookie = sessionCookie(next.id)
    id = next.id
    await record(c.env.DB, { actor: 'panel', action: 'session.open', detail: 'بعد تسجيل ' + what, by: email }, c.req.raw)
  }
  await securityEvent(c.env, c.req.raw, { kind: 'factor.add', email, detail: what, sessionId: id })
  return { codes, cookie }
}

function jsonWithCookie(body: unknown, cookie: string | null, status = 200): Response {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (cookie !== null) headers['Set-Cookie'] = cookie
  return new Response(JSON.stringify(body), { status, headers })
}

/** تحدٍّ لتسجيل مفتاحٍ جديد — بجلسةٍ كاملة أو جلسة تسجيل، وبتحقّقٍ حديث (الحارس). */
auth.post('/panel/security/passkey/challenge', async (c) => {
  const gate = await guardFull(c)
  if ('denied' in gate) return gate.denied
  const email = emailOf(gate.session)

  const rp = relyingParty(c.env.PUBLIC_BASE_URL)
  let existing
  try {
    existing = await listPasskeys(c.env.DB, rp.id, email)
  } catch {
    return json({ error: 'unavailable' }, 503)
  }
  const challenge = newChallenge()
  await c.env.KV.put(challengeKey('reg:' + gate.session.id), challenge, {
    expirationTtl: CHALLENGE_TTL_SECONDS,
  })

  return json({
    challenge,
    rp: { id: rp.id, name: rp.name },
    user: await webauthnUser(email),
    // كي لا يُسجَّل الجهازُ نفسه مرّتين فيظنّ صاحبُه أنّ له مفتاحين
    excludeCredentials: existing.map((k) => k.credentialId),
  })
})

auth.post('/panel/security/passkey/register', async (c) => {
  const gate = await guardFull(c)
  if ('denied' in gate) return gate.denied
  const email = emailOf(gate.session)

  const key = challengeKey('reg:' + gate.session.id)
  const challenge = await c.env.KV.get(key)
  if (challenge === null) return json({ error: 'challenge_expired' }, 400)
  await c.env.KV.delete(key)

  const raw = String(gate.form.get('credential') ?? '')
  let body: { credentialId?: string; clientDataJSON?: string; attestationObject?: string }
  try {
    body = JSON.parse(raw) as typeof body
  } catch {
    return json({ error: 'bad_request' }, 400)
  }

  const rp = relyingParty(c.env.PUBLIC_BASE_URL)
  let parsed
  try {
    parsed = {
      clientDataJSON: fromBase64Url(String(body.clientDataJSON ?? '')),
      attestationObject: typeof body.attestationObject === 'string' && body.attestationObject !== ''
        ? fromBase64Url(body.attestationObject)
        : null,
    }
  } catch {
    return json({ error: 'bad_request' }, 400)
  }
  if (parsed.attestationObject === null) return json({ error: 'no_attestation' }, 400)

  /*
   * ‏**المعرّفُ والمفتاحُ من بيانات الاعتماد المشهودة** (D-317) — لا كما أرسلهما العميل. كان يُحفظ ما يقوله النموذج،
   * ‏فيُسجَّل معرّفٌ لا يطابق مفتاحَه أو مفتاحٌ لم يقله المتوثِّق. والآن يُحفظ ما في `attestationObject` وحده.
   */
  const verdict = await verifyRegistration(parsed, { challenge, origin: rp.origin, rpId: rp.id })
  if (!verdict.ok) {
    await record(
      c.env.DB,
      { actor: 'panel', action: 'passkey.rejected', detail: verdict.reason },
      c.req.raw,
    )
    return json({ error: 'rejected', detail: verdict.reason }, 400)
  }
  if (typeof body.credentialId === 'string' && body.credentialId !== '' && body.credentialId !== verdict.credentialId) {
    await record(c.env.DB, { actor: 'panel', action: 'passkey.rejected', detail: 'المعرّف لا يطابق بيانات الاعتماد' }, c.req.raw)
    return json({ error: 'rejected', detail: 'معرّف الاعتماد لا يطابق ما قاله المتوثِّق' }, 400)
  }

  // ‏واسمُه ما كتبه صاحبُه، وإلّا فجهازُه كما عرّف نفسَه (D-317: صفحةُ التسجيل بلا حقلٍ يؤخّر الزرّ)
  const label = String(gate.form.get('label') ?? '').trim().slice(0, 60) || deviceName(c.req.header('User-Agent') ?? null)
  let before: FactorState
  try {
    if ((await findPasskey(c.env.DB, verdict.credentialId)) !== null) {
      return json({ error: 'already_registered', detail: 'هذا المفتاح مسجَّل بالفعل' }, 409)
    }
    before = await factorState(c.env.DB, rp.id, email)
  } catch {
    return json({ error: 'unavailable' }, 503)
  }

  await addPasskey(c.env.DB, {
    credentialId: verdict.credentialId,
    publicKey: verdict.publicKey,
    alg: verdict.alg,
    signCount: verdict.signCount,
    label,
    rpId: rp.id,
    email,
  })
  await record(c.env.DB, { actor: 'panel', action: 'passkey.add', target: label }, c.req.raw)
  const done = await afterFactorAdded(c, gate.session, before.recovery.unused > 0, 'مفتاح «' + label + '»')
  return jsonWithCookie({ ok: true, label, codes: done.codes, promoted: done.cookie !== null }, done.cookie)
})

/** هل هذا آخرُ عاملٍ لحسابٍ يلزمه عامل؟ — فلا يُقفَل صاحبُه خارج لوحته. */
function lastFactorText(): string {
  return 'هذا آخر عامل ثانٍ لحسابك. سجّل غيره أوّلًا ثمّ احذف هذا.'
}

auth.post('/panel/security/passkey/delete', async (c) => {
  const gate = await guardFull(c)
  if ('denied' in gate) return gate.denied
  const email = emailOf(gate.session)

  const id = String(gate.form.get('id') ?? '')
  const rp = relyingParty(c.env.PUBLIC_BASE_URL)

  /**
   * حذفُ آخر مفتاحٍ والجلسةُ نفسها فُتحت به يُقفل الباب على صاحبه.
   *
   * فيُمنع إن لم يبق عاملٌ آخر. وهذا ليس تضييقا: هو الفرق بين حذفٍ
   * يُراجَع وحذفٍ يستدعي `wrangler` من هاتفٍ في مطار.
   */
  const state = await factorsOf(c.env, email)
  if (state === null) return json({ error: 'unavailable' }, 503)
  const isLast = state.passkeys.length === 1 && state.passkeys[0]?.id === id
  if (isLast && !state.totp.confirmed) {
    return json({ error: 'last_factor', detail: lastFactorText() }, 409)
  }

  const removed = await deletePasskey(c.env.DB, id, email)
  if (removed) {
    const label = state.passkeys.find((k) => k.id === id)?.label ?? id
    await record(c.env.DB, { actor: 'panel', action: 'passkey.delete', target: id }, c.req.raw)
    await securityEvent(c.env, c.req.raw, { kind: 'factor.remove', email, detail: 'مفتاح «' + label + '»', sessionId: gate.session.id })
  }
  return json({ ok: removed })
})

/**
 * يبدأ ضبط رمز التطبيق — سرٌّ جديد غيرُ مؤكَّد.
 *
 * **ولا يُبدَّل رمزٌ مؤكَّدٌ من هنا** (D-317): كان النداءُ يكتب فوقه سرًّا غيرَ مؤكَّد، فجلسةٌ مسروقةٌ بلا مفتاح مرورٍ تُطفئ
 * الإلزامَ بنداءٍ واحد. فالمؤكَّدُ يُزال أوّلًا («أزل رمز التطبيق»، بتحقّقٍ حديث) ثمّ يُضبط غيرُه.
 */
auth.post('/panel/security/totp/start', async (c) => {
  const gate = await guardFull(c)
  if ('denied' in gate) return gate.denied
  const email = emailOf(gate.session)

  if (c.env.TOKEN_ENC_KEY.length === 0) {
    return json({ error: 'no_enc_key', detail: 'TOKEN_ENC_KEY غير مضبوط' }, 503)
  }
  const confirmedText = 'رمز التطبيق مضبوط ومؤكَّد — أزله أوّلًا ثمّ اضبط غيره.'
  try {
    if ((await totpState(c.env.DB, email)).confirmed) return json({ error: 'totp_confirmed', detail: confirmedText }, 409)
  } catch {
    return json({ error: 'unavailable' }, 503)
  }

  const rp = relyingParty(c.env.PUBLIC_BASE_URL)
  const secret = newSecret()
  if (!(await startTotp(c.env.DB, c.env.TOKEN_ENC_KEY, secret, email))) {
    return json({ error: 'totp_confirmed', detail: confirmedText }, 409)
  }
  await record(c.env.DB, { actor: 'panel', action: 'totp.start' }, c.req.raw)

  // السرُّ يُعرض مرّةً واحدةً هنا ليُمسح، ولا يُسجَّل في سجلّ التدقيق
  return json({ secret, url: otpauthUrl(secret, isOwnerEmail(email) ? 'owner' : email, rp.id) })
})

auth.post('/panel/security/totp/confirm', async (c) => {
  const gate = await guardFull(c)
  if ('denied' in gate) return gate.denied
  const email = emailOf(gate.session)

  let secret: string | null
  let before: FactorState
  try {
    secret = await readTotpSecret(c.env.DB, c.env.TOKEN_ENC_KEY, email)
    before = await factorState(c.env.DB, relyingParty(c.env.PUBLIC_BASE_URL).id, email)
  } catch {
    return json({ error: 'unavailable' }, 503)
  }
  if (secret === null) return json({ error: 'not_started' }, 400)
  if (before.totp.confirmed) return json({ error: 'totp_confirmed', detail: 'رمز التطبيق مؤكَّد من قبل.' }, 409)

  const result = await verifyTotp(secret, String(gate.form.get('code') ?? ''))
  if (!result.ok) return json({ error: 'denied', detail: result.reason }, 401)

  await confirmTotp(c.env.DB, result.step, email)
  await record(c.env.DB, { actor: 'panel', action: 'totp.confirm' }, c.req.raw)

  // أوّلُ عاملٍ ثانٍ يُؤكَّد يولّد رموزَ استرداد: بلا طريق رجوعٍ يصير
  // فقدُ الهاتف قفلا نهائيّا
  const done = await afterFactorAdded(c, gate.session, before.recovery.unused > 0, 'رمز التطبيق')
  return jsonWithCookie({ ok: true, codes: done.codes, promoted: done.cookie !== null }, done.cookie)
})

auth.post('/panel/security/totp/remove', async (c) => {
  const gate = await guardFull(c)
  if ('denied' in gate) return gate.denied
  const email = emailOf(gate.session)

  const state = await factorsOf(c.env, email)
  if (state === null) return json({ error: 'unavailable' }, 503)
  if (state.totp.confirmed && state.passkeys.length === 0) {
    return json({ error: 'last_factor', detail: 'هذا آخر عامل ثانٍ لحسابك. سجّل مفتاح مرور أوّلًا.' }, 409)
  }

  await removeTotp(c.env.DB, email)
  await record(c.env.DB, { actor: 'panel', action: 'totp.remove' }, c.req.raw)
  if (state.totp.confirmed) {
    await securityEvent(c.env, c.req.raw, { kind: 'factor.remove', email, detail: 'رمز التطبيق', sessionId: gate.session.id })
  }
  return json({ ok: true })
})

auth.post('/panel/security/recovery/issue', async (c) => {
  const gate = await guardFull(c)
  if ('denied' in gate) return gate.denied

  const codes = await issueRecoveryCodes(c.env.DB, emailOf(gate.session))
  await record(
    c.env.DB,
    { actor: 'panel', action: 'recovery.issue', detail: String(codes.length) + ' رمزا' },
    c.req.raw,
  )
  return json({ codes })
})

/** خروجٌ من جلسةٍ معلَّقة — ليعود صاحبُها إلى صفحة الدخول. */
auth.post('/panel/2fa/cancel', async (c) => {
  await destroySession(c.env.KV, c.req.raw)
  return new Response(null, {
    status: 303,
    headers: { Location: '/panel', 'Set-Cookie': clearedCookie() },
  })
})

// ── صفحةُ التسجيل و«أمان حسابك» (D-317) ───────────────────────────────

/**
 * `GET /panel/enrol` — **لماذا وكيف**: حسابٌ يلزمه عاملٌ ثانٍ ولا عاملَ له لا يرى غيرَ هذه الصفحة (والمساعدةَ والخروج).
 * والعضوُ بجلسةٍ كاملةٍ يرى فيها عواملَه («أمان حسابك»)، والمالكُ يُحال إلى قسم الأمان في الإعدادات.
 */
auth.get('/panel/enrol', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return c.redirect('/panel/login', 303)
  const email = emailOf(session)
  const required = session.record.enrol === true
  if (!required && isOwnerEmail(email)) return c.redirect('/panel/settings#factors', 303)
  const state = await factorsOf(c.env, email)
  const rp = relyingParty(c.env.PUBLIC_BASE_URL)
  return page((nonce) => enrolPage({
    csrf: session.record.csrf,
    rpId: rp.id,
    required,
    roleName: ROLE_LABEL[session.record.role ?? 'owner'].name,
    email,
    passkeys: (state?.passkeys ?? []).map((k) => ({ id: k.id, label: k.label })),
    totpConfirmed: state?.totp.confirmed ?? false,
    recoveryLeft: state?.recovery.unused ?? 0,
    error: state === null ? say('factor_unavailable') : null,
  }, nonce), state === null ? 503 : 200)
})

// ── «تحقّق للتوّ» (D-317) ────────────────────────────────────────────

/** يرسم صفحة «تحقّق للتوّ» بعوامل صاحب الجلسة — وبتحدٍّ مربوطٍ بها. */
async function renderStepUp(
  c: { env: Env },
  session: Session,
  next: string,
  error: string | null,
  status: number,
  sent = false,
): Promise<Response> {
  const rp = relyingParty(c.env.PUBLIC_BASE_URL)
  const email = emailOf(session)
  const state = await factorsOf(c.env, email)
  const challenge = newChallenge()
  await c.env.KV.put(challengeKey('up:' + session.id), challenge, { expirationTtl: CHALLENGE_TTL_SECONDS })
  const hasFactor = state?.enforced ?? false
  return page((nonce) => stepUpPage({
    csrf: session.record.csrf,
    challenge,
    rpId: rp.id,
    hasPasskey: (state?.passkeys.length ?? 0) > 0,
    hasTotp: state?.totp.confirmed ?? false,
    // ‏رمزُ البريد لمن لا عاملَ له وحده — ولا شيءَ حين لم تردّ القاعدة
    emailCode: state === null || hasFactor ? 'none' : sent ? 'sent' : 'ask',
    email,
    next,
    error: state === null ? say('factor_unavailable') : error,
  }, nonce), state === null ? 503 : status)
}

/** حارسُ نماذج «تحقّق للتوّ»: جلسةٌ (كاملةٌ أو تسجيل) ورمزُ نموذجٍ صحيح، ووجهةٌ مُتحقَّقٌ منها. */
async function guardStepUp(c: Context<{ Bindings: Env }>): Promise<
  { denied: Response } | { session: Session; form: FormData; next: string }
> {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return { denied: c.redirect('/panel', 303) }
  const form = await c.req.formData().catch(() => new FormData())
  const next = safeStepUpNext(String(form.get('next') ?? ''))
  if (!(await checkCsrf(session, String(form.get('_csrf') ?? '')))) {
    return { denied: await renderStepUp(c, session, next, 'انتهت صلاحية الصفحة — أعد المحاولة.', 403) }
  }
  return { session, form, next }
}

/** نجح التحقّق: «للتوّ» في الجلسة نفسِها، ثمّ إلى حيث كان. */
async function steppedUp(c: { env: Env; req: { raw: Request } }, session: Session, how: string, next: string): Promise<Response> {
  await markFresh(c.env.KV, session)
  await record(c.env.DB, { actor: 'panel', action: 'stepup.ok', detail: how, by: emailOf(session) }, c.req.raw)
  return new Response(null, { status: 303, headers: { Location: next } })
}

auth.get('/panel/stepup', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return c.redirect('/panel', 303)
  return renderStepUp(c, session, safeStepUpNext(c.req.query('next')), null, 200, c.req.query('sent') === '1')
})

auth.post('/panel/stepup/passkey', async (c) => {
  const gate = await guardStepUp(c)
  if ('denied' in gate) return gate.denied
  const key = challengeKey('up:' + gate.session.id)
  const challenge = await c.env.KV.get(key)
  if (challenge === null) return renderStepUp(c, gate.session, gate.next, 'انتهت مهلة الصفحة — اضغط «تحقّق بمفتاح المرور» مرّةً أخرى.', 400)
  await c.env.KV.delete(key)
  const body = parseAssertion(String(gate.form.get('assertion') ?? ''))
  if (body === null) return renderStepUp(c, gate.session, gate.next, 'لم يصل توقيع المفتاح — أعد المحاولة.', 400)
  const verdict = await completeAssertion(c.env, body, challenge, emailOf(gate.session))
  if (!verdict.ok) {
    await record(c.env.DB, { actor: 'panel', action: 'stepup.denied', detail: verdict.reason }, c.req.raw)
    return renderStepUp(c, gate.session, gate.next, 'لم يُقبَل المفتاح: ' + verdict.reason, 401)
  }
  return steppedUp(c, gate.session, 'مفتاح «' + verdict.label + '»', gate.next)
})

auth.post('/panel/stepup/totp', async (c) => {
  const gate = await guardStepUp(c)
  if ('denied' in gate) return gate.denied
  const email = emailOf(gate.session)
  const denied = await reserveGuess(c, gate.session, (text, status) => renderStepUp(c, gate.session, gate.next, text, status))
  if (denied !== null) return denied
  let secret: string | null
  let stored
  try {
    secret = await readTotpSecret(c.env.DB, c.env.TOKEN_ENC_KEY, email)
    stored = await totpState(c.env.DB, email)
  } catch {
    return renderStepUp(c, gate.session, gate.next, say('factor_unavailable'), 503)
  }
  if (secret === null || !stored.confirmed) return renderStepUp(c, gate.session, gate.next, 'لا رمز تطبيق مضبوطا لهذا الحساب.', 400)
  const result = await verifyTotp(secret, String(gate.form.get('code') ?? ''), {
    ...(stored.lastStep === null ? {} : { lastStep: stored.lastStep }),
  })
  if (!result.ok) {
    await record(c.env.DB, { actor: 'panel', action: 'stepup.denied', detail: 'totp' }, c.req.raw)
    return renderStepUp(c, gate.session, gate.next, result.reason, 401)
  }
  await markTotpStep(c.env.DB, result.step, email)
  await releaseFactorGuess(c.env.DB, email, await fingerprint(gate.session.id), c.req.raw)
  return steppedUp(c, gate.session, 'رمز التطبيق', gate.next)
})

/**
 * رمزُ بريدٍ لـ«تحقّق للتوّ» — **لمن لا عاملَ ثانيًا له وحده**. ومن له عاملٌ لا يتحقّق بما هو أضعفُ منه.
 * والرمزُ في مفتاحٍ غير مفتاح الدخول: رمزُ الدخول لا يصلح هنا ولا العكس.
 */
auth.post('/panel/stepup/code/send', async (c) => {
  const gate = await guardStepUp(c)
  if ('denied' in gate) return gate.denied
  const email = emailOf(gate.session)
  const state = await factorsOf(c.env, email)
  if (state === null) return renderStepUp(c, gate.session, gate.next, say('factor_unavailable'), 503)
  if (state.enforced) return renderStepUp(c, gate.session, gate.next, 'لحسابك عاملٌ ثانٍ — تحقّق به.', 400)
  const slot = await reserveCodeIssue(c.env.DB, c.req.raw)
  if (!slot.allowed) {
    return renderStepUp(c, gate.session, gate.next, slot.why === 'db' ? GATE_UNAVAILABLE_TEXT : 'طلباتٌ كثيرة — انتظر ربع ساعة.', slot.why === 'db' ? 503 : 429)
  }
  const issued = await issueCode(c.env.KV, stepUpCodeKey(email))
  if (issued.ok) {
    const sent = await sendText(c.env.EMAIL, email, 'رمز التحقّق في صدى',
      ['رمز التحقّق في صدى: ' + issued.code, '', 'طلبتَه لتغيّر شيئًا في حسابك. صالح عشر دقائق ولمرّة واحدة.',
        'إن لم تطلبه فادخل وغيّر عواملك الآن، فجلستُك مفتوحةٌ على جهازٍ ما.', '', c.env.PUBLIC_BASE_URL].join('\n'))
    await record(c.env.DB, sent.sent
      ? { actor: 'panel', action: 'stepup.code.sent' }
      : { actor: 'panel', action: 'stepup.code.unsent', detail: sent.reason }, c.req.raw)
  }
  return c.redirect(stepUpUrl(gate.next) + '&sent=1', 303)
})

auth.post('/panel/stepup/code', async (c) => {
  const gate = await guardStepUp(c)
  if ('denied' in gate) return gate.denied
  const email = emailOf(gate.session)
  const state = await factorsOf(c.env, email)
  if (state === null) return renderStepUp(c, gate.session, gate.next, say('factor_unavailable'), 503)
  if (state.enforced) return renderStepUp(c, gate.session, gate.next, 'لحسابك عاملٌ ثانٍ — تحقّق به.', 400)
  const guess = await reserveCodeGuess(c.env.DB, email, c.req.raw)
  if (!guess.allowed) {
    return renderStepUp(c, gate.session, gate.next, guess.why === 'db' ? GATE_UNAVAILABLE_TEXT : 'محاولاتٌ خاطئة كثيرة — انتظر.', guess.why === 'db' ? 503 : 429, true)
  }
  const verdict = await verifyCode(c.env.KV, stepUpCodeKey(email), String(gate.form.get('code') ?? ''))
  if (!verdict.ok) {
    await record(c.env.DB, { actor: 'panel', action: 'stepup.denied', detail: 'code · ' + verdict.reason }, c.req.raw)
    return renderStepUp(c, gate.session, gate.next, 'الرمز غير صحيح أو انتهت مهلته.', 401, verdict.reason === 'wrong')
  }
  await releaseCodeGuesses(c.env.DB, email, c.req.raw)
  return steppedUp(c, gate.session, 'رمز البريد', gate.next)
})

/** عناوينُ الأفعال كما تُقرأ في «أكمل ما بدأته». */
const ACTION_TITLE: Readonly<Record<string, string>> = {
  '/panel/team/invite': 'دعوة عضو',
  '/panel/team/revoke': 'إلغاء دخول عضو',
  '/panel/providers/add': 'خدمة كتابة وصور',
  '/panel/providers/key': 'مفتاح خدمة الكتابة',
  '/panel/providers/delete': 'حذف خدمة الكتابة',
  '/panel/settings': 'قناة التنبيهات',
  '/panel/channels/disconnect': 'فصل حساب',
  '/panel/sessions/revoke-all': 'إخراج الأجهزة الأخرى',
}

/** أين يعود من ألغى. */
const ACTION_BACK: Readonly<Record<string, string>> = {
  '/panel/team/invite': '/panel/team',
  '/panel/team/revoke': '/panel/team',
  '/panel/channels/disconnect': '/panel/accounts',
}

/**
 * `GET /panel/stepup/resume` — **النموذجُ الذي أوقفه «تحقّق للتوّ» يُعاد رسمُه** ليضغط صاحبُه «أكمل» بنفسه، ولا يُعاد
 * إرسالُه بلا علمه. ويُقرأ مرّةً ويُمحى.
 */
auth.get('/panel/stepup/resume', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return c.redirect('/panel', 303)
  if (!isFresh(session.record)) return c.redirect(stepUpUrl('/panel/stepup/resume'), 303)
  const raw = await c.env.KV.get(stepUpFormKey(session.id))
  if (raw === null) return c.redirect('/panel', 303)
  await c.env.KV.delete(stepUpFormKey(session.id))
  let saved: SavedForm
  try {
    saved = JSON.parse(raw) as SavedForm
  } catch {
    return c.redirect('/panel', 303)
  }
  const title = ACTION_TITLE[saved.action]
  if (title === undefined) return c.redirect('/panel', 303)
  return page((nonce) => resumePage({
    csrf: session.record.csrf,
    action: saved.action,
    title,
    fields: saved.fields,
    secrets: saved.secrets,
    back: ACTION_BACK[saved.action] ?? '/panel/settings',
  }, nonce))
})

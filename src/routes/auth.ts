/**
 * مسارات العامل الثاني: مفاتيحُ المرور، ورمزُ التطبيق، ورموزُ الاسترداد.
 *
 * منفصلةٌ عن `panel.ts` لأنّ حارسَها مختلف: أكثرُها يُنادى **بجلسةٍ
 * معلَّقة** — جلسةٍ أثبت صاحبُها الرمزَ ولم يُثبت العامل الثاني بعد. ولو
 * خُلطت بمسارات اللوحة لصار على كلّ مسارٍ هناك أن يسأل «أمعلَّقةٌ هي؟»،
 * ومسارٌ ينسى السؤال يصير الطريقَ الجانبيّ الذي يُبطل العامل الثاني كلَّه.
 */
import { Hono } from 'hono'
import type { Env } from '../env'
import { record } from '../lib/audit'
import { fromBase64Url, toBase64Url } from '../lib/security/bytes'
import {
  addPasskey, confirmTotp, countRecoveryCodes, deletePasskey, factorState, findPasskey,
  issueRecoveryCodes, listPasskeys, markTotpStep, readTotpSecret, removeTotp, startTotp,
  totpState, touchPasskey, useRecoveryCode,
} from '../lib/security/factors'
import { htmlHeaders, makeNonce } from '../lib/security/headers'
import { relyingParty } from '../lib/security/rp'
import { newSecret, otpauthUrl, verifyTotp } from '../lib/security/totp'
import {
  CHALLENGE_TTL_SECONDS, newChallenge, verifyAssertion, verifyRegistration,
} from '../lib/security/webauthn'
import {
  checkCsrf, clearedCookie, createPasskeySession, destroySession, loadSession,
  promoteSession, sessionCookie, type Session,
} from '../lib/session'
import { attemptState, clearAttempts, delayMs, recordFailure } from '../lib/rateLimit'
import { secondFactorPage } from './authView'

export const auth = new Hono<{ Bindings: Env }>()

function page(render: (nonce: string) => string, status = 200): Response {
  const nonce = makeNonce()
  return new Response(render(nonce), { status, headers: htmlHeaders(nonce) })
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status })
}

/** التحدّي في KV بمهلةٍ قصيرة، ومربوطٌ بالجلسة إن وُجدت. */
function challengeKey(scope: string): string {
  return `webauthn:${scope}`
}

/**
 * حارسٌ لمسارٍ يُنادى بجلسةٍ **كاملة** — إعدادُ العامل الثاني وحذفُه.
 *
 * ورمزُ CSRF مفحوصٌ هنا كما في اللوحة: إضافةُ مفتاحِ مرورٍ فعلٌ يغيّر من
 * يملك الدخول، فهو أولى بالحراسة لا أهون.
 */
async function guardFull(
  c: { env: Env; req: { raw: Request; formData: () => Promise<FormData> } },
): Promise<{ denied: Response } | { session: Session; form: FormData }> {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return { denied: json({ error: 'no_session' }, 401) }
  if (session.record.pending) {
    return { denied: json({ error: 'pending_second_factor' }, 403) }
  }

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

/** حارسٌ لمسارٍ يُنادى بجلسةٍ **معلَّقة** — إتمامُ العامل الثاني. */
async function guardPending(
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

// ── شاشة العامل الثاني ───────────────────────────────────────────────

/**
 * الشاشةُ التي تلي الرمزَ الصحيح حين يكون ثمّة عاملٌ ثانٍ.
 *
 * وهي المكانُ **الوحيد** الذي تفتحه جلسةٌ معلَّقة.
 */
auth.get('/panel/2fa', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return c.redirect('/panel', 303)
  if (!session.record.pending) return c.redirect('/panel', 303)

  const rp = relyingParty(c.env.PUBLIC_BASE_URL)
  const [state, recovery] = await Promise.all([
    factorState(c.env.DB, rp.id),
    countRecoveryCodes(c.env.DB),
  ])

  // تحدٍّ للدخول بمفتاح مرور، مربوطٌ بهذه الجلسة المعلَّقة وحدها
  const challenge = newChallenge()
  await c.env.KV.put(challengeKey(session.id), challenge, {
    expirationTtl: CHALLENGE_TTL_SECONDS,
  })

  return page((nonce) =>
    secondFactorPage(
      {
        csrf: session.record.csrf,
        challenge,
        rpId: rp.id,
        hasPasskey: state.passkeys.length > 0,
        hasTotp: state.totp.confirmed,
        hasRecovery: recovery.unused > 0,
        error: null,
      },
      nonce,
    ),
  )
})

// ── الدخول بمفتاح مرور — من صفحة الدخول مباشرة ───────────────────────

/**
 * تحدٍّ للدخول قبل أيّ جلسة.
 *
 * ويُخزَّن تحت مفتاحٍ عشوائيّ يُعاد إلى العميل — لا تحت عنوان الـ IP: عدّةُ
 * أجهزةٍ خلف عنوانٍ واحد تدوس تحدّياتِ بعضها فيفشل الدخولُ بلا تفسير.
 */
auth.post('/panel/passkey/challenge', async (c) => {
  const rp = relyingParty(c.env.PUBLIC_BASE_URL)
  const keys = await listPasskeys(c.env.DB, rp.id)
  if (keys.length === 0) return json({ error: 'no_passkeys' }, 404)

  const state = await attemptState(c.env.KV, c.req.raw)
  if (state.blocked) return json({ error: 'rate_limited' }, 429)

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
 * إتمامُ الدخول بمفتاح مرور — جلسةٌ كاملة من أوّلها.
 *
 * والحدُّ مفروضٌ هنا كما على الرمز: بابٌ بلا مزلاج يبقى بلا مزلاج، ولو
 * كان ما وراءه توقيعا لا يُخمَّن.
 */
auth.post('/panel/passkey/login', async (c) => {
  const state = await attemptState(c.env.KV, c.req.raw)
  if (state.blocked) return json({ error: 'rate_limited' }, 429)

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

  const verdict = await completeAssertion(c.env, body, challenge)
  if (!verdict.ok) {
    await recordFailure(c.env.KV, c.req.raw)
    await record(
      c.env.DB,
      { actor: 'anonymous', action: 'passkey.denied', detail: verdict.reason },
      c.req.raw,
    )
    const wait = delayMs(state.attempts + 1)
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
    // ‏والسببُ في سجلّ التدقيق لا في الردّ (D-160): الطالبُ هنا مجهول، و«مفتاحٌ
    // ‏غير مسجَّل» أو «تراجع العدّاد» يقول له ما الذي يجرّبه بعدها
    return json({ error: 'denied' }, 401)
  }

  const session = await createPasskeySession(c.env.KV, c.env.ADMIN_TOKEN, c.req.raw)
  if ('error' in session) {
    return json({ error: 'admin_disabled', detail: 'ADMIN_TOKEN غير مضبوط' }, 503)
  }

  await clearAttempts(c.env.KV, c.req.raw)
  await record(
    c.env.DB,
    { actor: 'passkey', action: 'session.open', target: verdict.label },
    c.req.raw,
  )
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

/** التحقّق المشترك بين الدخول والعامل الثاني — منطقٌ واحد لا نسختان. */
async function completeAssertion(
  env: Env,
  body: AssertionBody,
  challenge: string,
): Promise<{ ok: true; label: string } | { ok: false; reason: string }> {
  const rp = relyingParty(env.PUBLIC_BASE_URL)
  const credentialId = String(body.credentialId ?? '')
  if (credentialId === '') return { ok: false, reason: 'لا معرّف اعتماد' }

  const stored = await findPasskey(env.DB, credentialId)
  if (stored === null) return { ok: false, reason: 'مفتاحٌ غير مسجَّل' }
  if (stored.rpId !== rp.id) return { ok: false, reason: 'مفتاحٌ سُجّل على بيئةٍ أخرى' }

  let assertion
  try {
    assertion = {
      authenticatorData: fromBase64Url(String(body.authenticatorData ?? '')),
      clientDataJSON: fromBase64Url(String(body.clientDataJSON ?? '')),
      signature: fromBase64Url(String(body.signature ?? '')),
    }
  } catch {
    return { ok: false, reason: 'حقولٌ مشوّهة' }
  }

  const verdict = await verifyAssertion(
    assertion,
    { publicKey: stored.publicKey, alg: stored.alg, signCount: stored.signCount },
    { challenge, origin: rp.origin, rpId: rp.id },
  )
  if (!verdict.ok) return { ok: false, reason: verdict.reason }

  await touchPasskey(env.DB, stored.id, verdict.signCount)
  return { ok: true, label: stored.label }
}

// ── إتمامُ العامل الثاني على جلسةٍ معلَّقة ────────────────────────────

auth.post('/panel/2fa/passkey', async (c) => {
  const gate = await guardPending(c)
  if ('denied' in gate) return gate.denied
  if (!gate.session.record.pending) return c.redirect('/panel', 303)

  const challenge = await c.env.KV.get(challengeKey(gate.session.id))
  if (challenge === null) return json({ error: 'challenge_expired' }, 400)
  await c.env.KV.delete(challengeKey(gate.session.id))

  const raw = String(gate.form.get('assertion') ?? '')
  const body = (() => {
    try {
      return JSON.parse(raw) as AssertionBody
    } catch {
      return null
    }
  })()
  if (body === null) return json({ error: 'bad_request' }, 400)

  const verdict = await completeAssertion(c.env, body, challenge)
  if (!verdict.ok) {
    await record(
      c.env.DB,
      { actor: 'panel', action: '2fa.denied', detail: verdict.reason },
      c.req.raw,
    )
    return json({ error: 'denied', detail: verdict.reason }, 401)
  }

  const promoted = await promoteSession(c.env.KV, gate.session)
  await record(c.env.DB, { actor: 'panel', action: '2fa.passkey' }, c.req.raw)
  return new Response(null, {
    status: 303,
    headers: { Location: '/panel', 'Set-Cookie': sessionCookie(promoted.id) },
  })
})

auth.post('/panel/2fa/totp', async (c) => {
  const gate = await guardPending(c)
  if ('denied' in gate) return gate.denied
  if (!gate.session.record.pending) return c.redirect('/panel', 303)

  const state = await attemptState(c.env.KV, c.req.raw)
  if (state.blocked) {
    return failSecondFactor(c, 'تجاوزتَ حدّ المحاولات. انتظر ربع ساعة.', 429)
  }

  const secret = await readTotpSecret(c.env.DB, c.env.TOKEN_ENC_KEY)
  const stored = await totpState(c.env.DB)
  if (secret === null || !stored.confirmed) {
    return failSecondFactor(c, 'لا رمزَ تطبيقٍ مضبوطا على هذا النظام.', 400)
  }

  const result = await verifyTotp(secret, String(gate.form.get('code') ?? ''), {
    ...(stored.lastStep === null ? {} : { lastStep: stored.lastStep }),
  })
  if (!result.ok) {
    const after = await recordFailure(c.env.KV, c.req.raw)
    await record(c.env.DB, { actor: 'panel', action: '2fa.denied', detail: 'totp' }, c.req.raw)
    const wait = delayMs(after.attempts)
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
    return failSecondFactor(c, result.reason, 401)
  }

  // الخطوةُ تُسجَّل قبل الترقية: رمزٌ قُبل لا يُقبل ثانيةً ولو تعثّر ما بعده
  await markTotpStep(c.env.DB, result.step)
  await clearAttempts(c.env.KV, c.req.raw)
  const promoted = await promoteSession(c.env.KV, gate.session)
  await record(c.env.DB, { actor: 'panel', action: '2fa.totp' }, c.req.raw)
  return new Response(null, {
    status: 303,
    headers: { Location: '/panel', 'Set-Cookie': sessionCookie(promoted.id) },
  })
})

/**
 * الدخولُ برمز استرداد — آخرُ الأبواب.
 *
 * والرمزُ يُستهلك، ويُنبَّه المالك إلى ما بقي: من نفدت رموزُه ثمّ فقد جهازه
 * لا باب له.
 */
auth.post('/panel/2fa/recovery', async (c) => {
  const gate = await guardPending(c)
  if ('denied' in gate) return gate.denied
  if (!gate.session.record.pending) return c.redirect('/panel', 303)

  const state = await attemptState(c.env.KV, c.req.raw)
  if (state.blocked) {
    return failSecondFactor(c, 'تجاوزتَ حدّ المحاولات. انتظر ربع ساعة.', 429)
  }

  const used = await useRecoveryCode(c.env.DB, String(gate.form.get('code') ?? ''))
  if (!used) {
    const after = await recordFailure(c.env.KV, c.req.raw)
    await record(c.env.DB, { actor: 'panel', action: '2fa.denied', detail: 'recovery' }, c.req.raw)
    const wait = delayMs(after.attempts)
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
    return failSecondFactor(c, 'رمزُ استردادٍ غير صحيح أو مستهلَك.', 401)
  }

  await clearAttempts(c.env.KV, c.req.raw)
  const left = await countRecoveryCodes(c.env.DB)
  const promoted = await promoteSession(c.env.KV, gate.session)
  await record(
    c.env.DB,
    { actor: 'panel', action: '2fa.recovery', detail: `بقي ${left.unused}` },
    c.req.raw,
  )
  await c.env.KV.put(
    `flash:${promoted.id}`,
    JSON.stringify({
      kind: 'warn',
      text: `دخلتَ برمز استرداد — بقي ${left.unused} منها. ولّد مجموعةً جديدة من قسم الأمان.`,
    }),
    { expirationTtl: 60 },
  )
  return new Response(null, {
    status: 303,
    headers: { Location: '/panel', 'Set-Cookie': sessionCookie(promoted.id) },
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
  const rp = relyingParty(c.env.PUBLIC_BASE_URL)
  const [state, recovery] = await Promise.all([
    factorState(c.env.DB, rp.id),
    countRecoveryCodes(c.env.DB),
  ])
  const challenge = newChallenge()
  await c.env.KV.put(challengeKey(session.id), challenge, {
    expirationTtl: CHALLENGE_TTL_SECONDS,
  })
  return page(
    (nonce) =>
      secondFactorPage(
        {
          csrf: session.record.csrf,
          challenge,
          rpId: rp.id,
          hasPasskey: state.passkeys.length > 0,
          hasTotp: state.totp.confirmed,
          hasRecovery: recovery.unused > 0,
          error,
        },
        nonce,
      ),
    status,
  )
}

// ── إدارةُ العوامل من قسم الأمان ──────────────────────────────────────

/** تحدٍّ لتسجيل مفتاحٍ جديد — بجلسةٍ كاملة وحدها. */
auth.post('/panel/security/passkey/challenge', async (c) => {
  const gate = await guardFull(c)
  if ('denied' in gate) return gate.denied

  const rp = relyingParty(c.env.PUBLIC_BASE_URL)
  const challenge = newChallenge()
  await c.env.KV.put(challengeKey(`reg:${gate.session.id}`), challenge, {
    expirationTtl: CHALLENGE_TTL_SECONDS,
  })
  const existing = await listPasskeys(c.env.DB, rp.id)

  return json({
    challenge,
    rp: { id: rp.id, name: rp.name },
    // معرّفٌ ثابتٌ للمالك الواحد: نظامٌ بمالكٍ واحد لا يحتاج هويّاتٍ متعدّدة
    user: { id: toBase64Url(new TextEncoder().encode('sada-owner')), name: 'owner', displayName: 'مالك صدى' },
    // كي لا يُسجَّل الجهازُ نفسه مرّتين فيظنّ المالك أنّ له مفتاحين
    excludeCredentials: existing.map((k) => k.credentialId),
  })
})

auth.post('/panel/security/passkey/register', async (c) => {
  const gate = await guardFull(c)
  if ('denied' in gate) return gate.denied

  const key = challengeKey(`reg:${gate.session.id}`)
  const challenge = await c.env.KV.get(key)
  if (challenge === null) return json({ error: 'challenge_expired' }, 400)
  await c.env.KV.delete(key)

  const raw = String(gate.form.get('credential') ?? '')
  let body: {
    credentialId?: string
    clientDataJSON?: string
    authenticatorData?: string
    publicKey?: string
    alg?: number
  }
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
      authenticatorData: fromBase64Url(String(body.authenticatorData ?? '')),
      publicKey:
        typeof body.publicKey === 'string' && body.publicKey !== ''
          ? fromBase64Url(body.publicKey)
          : null,
      alg: Number(body.alg ?? 0),
    }
  } catch {
    return json({ error: 'bad_request' }, 400)
  }

  const verdict = await verifyRegistration(parsed, {
    challenge,
    origin: rp.origin,
    rpId: rp.id,
  })
  if (!verdict.ok) {
    await record(
      c.env.DB,
      { actor: 'panel', action: 'passkey.rejected', detail: verdict.reason },
      c.req.raw,
    )
    return json({ error: 'rejected', detail: verdict.reason }, 400)
  }

  /**
   * معرّفُ الاعتماد يُؤخَذ كما أرسله العميل ولا يُستخرَج من `authenticatorData`.
   *
   * واستخراجُه يعني تفكيك «بيانات الاعتماد المشهودة» — وهي ما تجنّبناه
   * عمدا (انظر رأس `webauthn.ts`). **ولا تصعيدَ في تركه**: هذا المسار
   * لا يُنادى إلّا بجلسةٍ كاملة، أي بالمالك نفسه وهو يسجّل مفتاحه. وأسوأُ
   * ما يقع أن يسجّل معرّفا لا يطابق مفتاحه، فلا يعمل عند أوّل دخول —
   * خطأٌ يظهر له فورا، لا بابٌ يُفتح لغيره.
   */
  const label = String(gate.form.get('label') ?? '').trim().slice(0, 60) || 'مفتاح بلا اسم'
  const credentialId = String(body.credentialId ?? '')
  if (credentialId === '') return json({ error: 'bad_request' }, 400)
  if ((await findPasskey(c.env.DB, credentialId)) !== null) {
    return json({ error: 'already_registered', detail: 'هذا المفتاح مسجَّل بالفعل' }, 409)
  }

  await addPasskey(c.env.DB, {
    credentialId,
    publicKey: String(body.publicKey ?? ''),
    alg: parsed.alg,
    signCount: verdict.signCount,
    label,
    rpId: rp.id,
  })
  await record(c.env.DB, { actor: 'panel', action: 'passkey.add', target: label }, c.req.raw)
  return json({ ok: true, label })
})

auth.post('/panel/security/passkey/delete', async (c) => {
  const gate = await guardFull(c)
  if ('denied' in gate) return gate.denied

  const id = String(gate.form.get('id') ?? '')
  const rp = relyingParty(c.env.PUBLIC_BASE_URL)

  /**
   * حذفُ آخر مفتاحٍ والجلسةُ نفسها فُتحت به يُقفل الباب على صاحبه.
   *
   * فيُمنع إن لم يبق عاملٌ آخر. وهذا ليس تضييقا: هو الفرق بين حذفٍ
   * يُراجَع وحذفٍ يستدعي `wrangler` من هاتفٍ في مطار.
   */
  const state = await factorState(c.env.DB, rp.id)
  const isLast = state.passkeys.length === 1 && state.passkeys[0]?.id === id
  if (isLast && !state.totp.confirmed) {
    return json(
      { error: 'last_factor', detail: 'هذا آخرُ عاملٍ ثانٍ. اضبط رمز تطبيقٍ أوّلا أو أزل الإلزام.' },
      409,
    )
  }

  const removed = await deletePasskey(c.env.DB, id)
  if (removed) {
    await record(c.env.DB, { actor: 'panel', action: 'passkey.delete', target: id }, c.req.raw)
  }
  return json({ ok: removed })
})

/** يبدأ ضبط رمز التطبيق — سرٌّ جديد غيرُ مؤكَّد. */
auth.post('/panel/security/totp/start', async (c) => {
  const gate = await guardFull(c)
  if ('denied' in gate) return gate.denied

  if (c.env.TOKEN_ENC_KEY.length === 0) {
    return json({ error: 'no_enc_key', detail: 'TOKEN_ENC_KEY غير مضبوط' }, 503)
  }

  const rp = relyingParty(c.env.PUBLIC_BASE_URL)
  const secret = newSecret()
  await startTotp(c.env.DB, c.env.TOKEN_ENC_KEY, secret)
  await record(c.env.DB, { actor: 'panel', action: 'totp.start' }, c.req.raw)

  // السرُّ يُعرض مرّةً واحدةً هنا ليُمسح، ولا يُسجَّل في سجلّ التدقيق
  return json({ secret, url: otpauthUrl(secret, 'owner', rp.id) })
})

auth.post('/panel/security/totp/confirm', async (c) => {
  const gate = await guardFull(c)
  if ('denied' in gate) return gate.denied

  const secret = await readTotpSecret(c.env.DB, c.env.TOKEN_ENC_KEY)
  if (secret === null) return json({ error: 'not_started' }, 400)

  const result = await verifyTotp(secret, String(gate.form.get('code') ?? ''))
  if (!result.ok) return json({ error: 'denied', detail: result.reason }, 401)

  await confirmTotp(c.env.DB, result.step)
  await record(c.env.DB, { actor: 'panel', action: 'totp.confirm' }, c.req.raw)

  // أوّلُ عاملٍ ثانٍ يُؤكَّد يولّد رموزَ استرداد: بلا طريق رجوعٍ يصير
  // فقدُ الهاتف قفلا نهائيّا
  const existing = await countRecoveryCodes(c.env.DB)
  const codes = existing.unused === 0 ? await issueRecoveryCodes(c.env.DB) : []
  return json({ ok: true, codes })
})

auth.post('/panel/security/totp/remove', async (c) => {
  const gate = await guardFull(c)
  if ('denied' in gate) return gate.denied

  const rp = relyingParty(c.env.PUBLIC_BASE_URL)
  const state = await factorState(c.env.DB, rp.id)
  if (state.totp.confirmed && state.passkeys.length === 0) {
    return json(
      { error: 'last_factor', detail: 'هذا آخرُ عاملٍ ثانٍ. سجّل مفتاح مرورٍ أوّلا.' },
      409,
    )
  }

  await removeTotp(c.env.DB)
  await record(c.env.DB, { actor: 'panel', action: 'totp.remove' }, c.req.raw)
  return json({ ok: true })
})

auth.post('/panel/security/recovery/issue', async (c) => {
  const gate = await guardFull(c)
  if ('denied' in gate) return gate.denied

  const codes = await issueRecoveryCodes(c.env.DB)
  await record(
    c.env.DB,
    { actor: 'panel', action: 'recovery.issue', detail: `${codes.length} رمزا` },
    c.req.raw,
  )
  return json({ codes })
})

/** خروجٌ من جلسةٍ معلَّقة — ليعود المالك إلى صفحة الدخول. */
auth.post('/panel/2fa/cancel', async (c) => {
  await destroySession(c.env.KV, c.req.raw)
  return new Response(null, {
    status: 303,
    headers: { Location: '/panel', 'Set-Cookie': clearedCookie() },
  })
})

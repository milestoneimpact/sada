/**
 * مسارات اللوحة — الدخول والخروج والجلسات والمنظّمات.
 *
 * جزءٌ من `panel.ts` قُسم على أقسامه (D-278) بلا تغييرٍ في سلوك.
 */
import { Hono } from 'hono'
import type { Env } from '../../env'
import { attemptsLeft } from '../../lib/format'
import { attemptState, clearAttempts, delayMs, recordFailure } from '../../lib/rateLimit'
import {
  GATE_UNAVAILABLE_TEXT, releaseAttempt, releaseCodeGuesses, reserveAttempt, reserveCodeGuess, reserveCodeIssue,
} from '../../lib/security/gate'
import { issueCode, verifyCode } from '../../lib/security/loginCode'
import { normalizeEmail, OWNER_EMAIL } from '../../lib/ownerEmail'
import { whoCanReceive } from '../../lib/team'
import { sendText } from '../../lib/mail/send'
import { createOrg, listOrgs, orgExists } from '../../lib/tenancy'
import {
  clearedCookie, createEmailSession, destroySession, revokeSessions, safeNext, sessionCookie, setActiveOrg,
} from '../../lib/session'
import { factorState, type FactorState } from '../../lib/security/factors'
import { fingerprint } from '../../lib/security/digest'
import { relyingParty } from '../../lib/security/rp'
import { record } from '../../lib/audit'
import { factorRequired } from '../../lib/access'
import { say } from '../../lib/errors/catalog'
import { securityEvent } from '../../lib/security/events'
import { trustedDevice, withDevice } from '../../lib/security/device'
import type { Who } from '../../lib/team'
import { loginPage } from '../panelView'
import { page, hasPasskeys, setFlash, guardPost, back } from './shared'

export const session = new Hono<{ Bindings: Env }>()

/**
 * ‏`GET /panel/login` — **صفحةُ رمزٍ خاطئٍ أُعيد تحميلُها**.
 *
 * تُرسَم صفحةُ الدخول ردًّا على `POST /panel/login`، فيبقى عنوانُها في الشريط. وإعادةُ
 * تحميلها على الهاتف، أو فتحُ التبويب من جديد، تطلبه `GET` — وكان `{"error":"not_found"}`
 * خامًّا. فيعود إلى الصفحة التي طُلبت (`?next=` في عنوان النموذج)، أو إلى الرئيسيّة —
 * وهناك صفحةُ الدخول إن لم تكن جلسة. ولا يُعاد إرسالُ كلمةٍ بإعادة التحميل.
 */
session.get('/panel/login', (c) => c.redirect(safeNext(c.req.query('next')), 303))

/**
 * طلبُ رمز الدخول (D-245) — **الردُّ واحدٌ لكلّ عنوان**.
 *
 * من كتب عنوانًا غيرَ عنوان المالك يرى ما يراه المالك: «إن كان بريدَ المالك
 * فقد أُرسل». فلا يُعرف من الردّ أيُّ العناوين يفتح، ولا يُرسَل إليه شيء.
 * والسقفُ (رسالةٌ في الدقيقة، خمسٌ في الساعة) صامتٌ كذلك، ويُسجَّل في التدقيق.
 */
session.post('/panel/login/code', async (c) => {
  const form = await c.req.formData().catch(() => new FormData())
  const next = safeNext(String(form.get('next') ?? '') || (c.req.query('next') ?? ''))
  const passkeys = await hasPasskeys(c.env)
  // ‏«عنوان آخر أو رمز جديد» يعود إلى خطوة البريد
  if (form.get('again') !== null) {
    return page((nonce) => loginPage({ passkeys, next }, nonce), 200)
  }

  const state = await attemptState(c.env.KV, c.req.raw)
  if (state.blocked) {
    return page(
      (nonce) => loginPage({ error: 'تجاوزت حدّ المحاولات. انتظر ربع ساعة ثمّ أعد المحاولة.', blocked: true, next }, nonce),
      429,
    )
  }

  /*
   * ‏**سقفٌ للعنوان وللجميع قبل أن يُصدَر رمز** (D-270): كلُّ طلبٍ هنا كتابةٌ في KV
   * ‏وبريدٌ وصفُّ تدقيق، والطالبُ مجهول — في دلوٍ مستقلّ عن محاولات الدخول. وسقفُ البريد
   * ‏الواحد (`issueCode`) لا يحرس عناوينَ شتّى. **والجهازُ الذي دخل منه صاحبُ هذا البريد لا يمرّ بالقاطع العامّ**
   * ‏(مراجعة D-317): ثلاثةُ آلاف طلبٍ من مصادر شتّى كانت تمنع الرمزَ عن المالك نفسِه.
   */
  const typed = normalizeEmail(String(form.get('email') ?? ''))
  const device = await trustedDevice(c.req.raw, c.env.ADMIN_TOKEN, typed)
  const issue = await reserveCodeIssue(c.env.DB, c.req.raw, device)
  if (!issue.allowed) {
    // ‏وقاعدةٌ لا تردّ ليست حدًّا (D-291): تُقال بسببها ولا تُحسَب على العنوان
    if (issue.why === 'db') return page((nonce) => loginPage({ error: GATE_UNAVAILABLE_TEXT, next }, nonce), 503)
    await record(c.env.DB, { actor: 'anonymous', action: 'login.code.capped', detail: 'ip_or_global' }, c.req.raw)
    return page(
      (nonce) => loginPage({ error: 'طلباتٌ كثيرة من هذا العنوان. انتظر ربع ساعة ثمّ أعد المحاولة.', blocked: true, next }, nonce),
      429,
    )
  }

  // ‏المالكُ أو مدعوٌّ قائم (D-278) — ولغيرهما الصفحةُ نفسُها بلا رسالة (لا تعداد). **وقاعدةٌ لا تردّ تُقال**
  // ‏(مراجعة D-317): العطلُ لا يتعلّق بالعنوان المكتوب، فقولُه لا يكشف أيَّ العناوين مدعوّ
  let who: Who | null
  try {
    who = await whoCanReceive(c.env.DB, typed)
  } catch (error) {
    console.warn({ job: 'login', step: 'member', failed: String(error) })
    return page((nonce) => loginPage({ error: GATE_UNAVAILABLE_TEXT, next }, nonce), 503)
  }
  if (who !== null) {
    const issued = await issueCode(c.env.KV, who.email)
    if (issued.ok) {
      const sent = await sendText(
        c.env.EMAIL,
        who.email,
        'رمز الدخول إلى صدى',
        `رمز الدخول إلى صدى: ${issued.code}\n\nصالح عشر دقائق ولمرّة واحدة.\n` +
          `إن لم تطلبه فتجاهل الرسالة، ولا يدخل أحد بلا الرمز.\n\n${c.env.PUBLIC_BASE_URL}`,
      )
      // ‏والرمزُ لا يُكتب في التدقيق: ما أُرسل وما لم يُرسَل وسببُه وحده
      await record(
        c.env.DB,
        sent.sent
          ? { actor: 'anonymous', action: 'login.code.sent' }
          : { actor: 'anonymous', action: 'login.code.unsent', detail: sent.reason },
        c.req.raw,
      )
    } else {
      await record(c.env.DB, { actor: 'anonymous', action: 'login.code.capped', detail: issued.reason }, c.req.raw)
    }
  }
  return page((nonce) => loginPage({ step: 'code', next, email: typed }, nonce), 200)
})

/**
 * الدخول برمز البريد — بحدٍّ للمحاولات.
 *
 * والتأخير قبل الردّ متصاعد لا رفضٌ فوريّ: زمنُ الردّ نفسه يخبر المخمّن
 * أنّه مُنع فيبدّل عنوانه ويستأنف. وفوقه الرمزُ نفسُه يسقط بعد خمسٍ خاطئة.
 */
session.post('/panel/login', async (c) => {
  const blockedText = (global: boolean): string =>
    global
      ? 'الدخول موقوف مؤقتا: محاولات كثيرة من عناوين شتّى. انتظر ربع ساعة.'
      : 'تجاوزت حدّ المحاولات. انتظر ربع ساعة ثمّ أعد المحاولة.'

  // ‏والوجهةُ قبل كلّ ردّ: كلُّ صفحةِ دخولٍ تُرسَم ثانيةً تحملها، فلا تضيع برمزٍ خاطئ (ر-11)
  const form = await c.req.formData().catch(() => new FormData())
  const next = safeNext(String(form.get('next') ?? '') || (c.req.query('next') ?? ''))

  const state = await attemptState(c.env.KV, c.req.raw)
  if (state.blocked) {
    return page(
      (nonce) => loginPage({ error: blockedText(state.globalBlock), blocked: true, step: 'code', next }, nonce),
      429,
    )
  }

  // ‏صاحبُ الرمز من خطوة البريد (D-278)، وجهازُه إن كان دخل منه من قبل (مراجعة D-317): الموثوقُ لا يمرّ بالقاطع العامّ
  // ‏ولا بسقف الحساب، فلا يُقفله مجهولٌ ملأهما
  const claimed = normalizeEmail(String(form.get('email') ?? '') || OWNER_EMAIL)
  const device = await trustedDevice(c.req.raw, c.env.ADMIN_TOKEN, claimed)

  // ‏والحجزُ قبل الفحص (D-161): طلباتٌ متزامنةٌ تمرّ كلُّها من قراءة KV قبل أن
  // ‏تكتب واحدةٌ منها، والعدّادُ الذرّيُّ في D1 يردّ السادسةَ قبل أن يُقارَن رمزُها
  const reserved = await reserveAttempt(c.env.DB, c.req.raw, device)
  if (!reserved.allowed) {
    if (reserved.why === 'db') return page((nonce) => loginPage({ error: GATE_UNAVAILABLE_TEXT, step: 'code', next }, nonce), 503)
    return page(
      (nonce) => loginPage({ error: blockedText(reserved.why === 'global'), blocked: true, step: 'code', next }, nonce),
      429,
    )
  }

  /*
   * ‏المالكُ أو مدعوٌّ قائم. وغيرُهما لا رمزَ مخزّنًا له فيسقط في `verifyCode` كرمزٍ خاطئ — **ويُعدّ في سقف اليوم مثلَه**،
   * ‏فلا يكشف الفرقُ أيَّ العناوين مدعوّ.
   *
   * ‏**وقاعدةٌ لا تردّ ليست «لا أحد»** (مراجعة D-317). كان الخطأ يُبلَع فيصير «لا أحد»، ثمّ يُجعل «لا أحد» دورَ «قارئ»،
   * ‏ثمّ يُحسب منه أنّ العاملَ لا يلزم: عثرةٌ واحدةٌ في D1 فتحت لمديرٍ بلا عاملٍ جلسةً كاملة. والآن: عطلٌ ← 503 بلا جلسة
   * ‏والرمزُ لم يُستهلك؛ **والدورُ الذي تُبنى عليه الجلسةُ من الصفّ نفسِه** (`found`) لا من البديل.
   */
  let found: Who | null
  try {
    found = await whoCanReceive(c.env.DB, claimed)
  } catch (error) {
    console.warn({ job: 'login', step: 'member', failed: String(error) })
    await record(c.env.DB, { actor: 'anonymous', action: 'login.member_unavailable' }, c.req.raw)
    return page((nonce) => loginPage({ error: GATE_UNAVAILABLE_TEXT, step: 'code', next, email: claimed }, nonce), 503)
  }
  const who = found ?? { email: claimed, role: 'viewer' as const, orgs: [] as string[] }
  // ‏وسقفُ اليوم على الرمز نفسِه (D-247): حدُّ العنوان يُعدّ بربع الساعة، والتخمينُ يتراكم.
  // ‏ولكلّ (حسابٍ، مصدر) لا للحساب وحده (D-317): من خمّن عشرًا أغلق على نفسه، لا على المالك
  const guess = await reserveCodeGuess(c.env.DB, who.email, c.req.raw, device)
  if (!guess.allowed) {
    if (guess.why === 'db') return page((nonce) => loginPage({ error: GATE_UNAVAILABLE_TEXT, step: 'code', next }, nonce), 503)
    await record(c.env.DB, { actor: 'anonymous', action: 'login.code.locked', detail: guess.why === 'global' ? 'account' : 'source' }, c.req.raw)
    const passkeys = await hasPasskeys(c.env)
    return page(
      (nonce) =>
        loginPage(
          {
            error: 'الدخول بالرمز موقوف يوما بعد محاولات خاطئة كثيرة. ادخل بمفتاح المرور.',
            blocked: true,
            passkeys,
            next,
          },
          nonce,
        ),
      429,
    )
  }

  /*
   * ‏**عواملُ الحساب قبل الرمز، ومن قاعدةٍ تردّ** (D-317). كانت قراءتُها تبلع الخطأ فتقول «لا عامل»، فرمزٌ صحيحٌ مع
   * ‏عثرةٍ في D1 يفتح جلسةَ مالكٍ كاملة. والآن: قاعدةٌ لا تردّ ← لا جلسة، ورسالةُ «أعد المحاولة»، **والرمزُ لم يُستهلك**
   * ‏(يُقرأ الحالُ قبل التحقّق منه)، فيعيده صاحبُه بعد دقيقة ولا يطلب غيره.
   */
  let factors: FactorState
  try {
    factors = await factorState(c.env.DB, c.env.TOKEN_ENC_KEY, relyingParty(c.env.PUBLIC_BASE_URL).id, who.email)
  } catch (error) {
    console.warn({ job: 'login', step: 'factors', failed: String(error) })
    await record(c.env.DB, { actor: 'anonymous', action: 'login.factors_unavailable' }, c.req.raw)
    return page((nonce) => loginPage({ error: say('factor_unavailable'), step: 'code', next, email: who.email }, nonce), 503)
  }
  const verdict = await verifyCode(c.env.KV, who.email, String(form.get('code') ?? ''))
  if (!verdict.ok) {
    const after = await recordFailure(c.env.KV, c.req.raw)
    await record(
      c.env.DB,
      { actor: 'anonymous', action: 'login.denied', detail: `${verdict.reason} · المحاولة ${after.attempts}` },
      c.req.raw,
    )
    const wait = delayMs(after.attempts)
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
    return page(
      (nonce) =>
        loginPage(
          {
            error: after.blocked
              ? blockedText(after.globalBlock)
              : verdict.reason === 'wrong'
                ? `الرمز غير صحيح — ${attemptsLeft(after.remaining)}.`
                : 'الرمز غير صحيح أو انتهت مهلته. اطلب رمزًا جديدًا.',
            blocked: after.blocked,
            step: 'code',
            next,
          },
          nonce,
        ),
      401,
    )
  }

  // ‏ورمزٌ صحيحٌ لدعوةٍ أُلغيت بين الطلب والإدخال لا يفتح شيئًا
  if (found === null) {
    return page((nonce) => loginPage({ error: 'الرمز غير صحيح أو انتهت مهلته. اطلب رمزًا جديدًا.', step: 'code', next }, nonce), 401)
  }

  /*
   * ‏يُقرأ حالُ العوامل **قبل** فتح الجلسة: جلسةٌ تُفتح كاملةً ثمّ تُعلَّق بعد ذلك تكون قد وُجدت كاملةً لحظةً — ولحظةٌ
   * ‏تكفي. **ولكلّ حسابٍ عواملُه** (D-317): من سجّل عاملًا يُسأل عنه أيًّا كان دورُه، **ومن يلزمه عاملٌ ولا عاملَ له**
   * ‏(المالكُ والمديرُ والناشر) يدخل جلسةَ تسجيلٍ وحده: صفحةُ التسجيل لا غير. والمحرّرُ والقارئُ بلا عاملٍ يدخلان كما كانا.
   */
  const pending = factors.enforced
  const enrol = !pending && factorRequired(found.role)
  const result = await createEmailSession(c.env.KV, c.env.ADMIN_TOKEN, { email: found.email, role: found.role }, c.req.raw, {
    pending,
    enrol,
    next,
  })
  if ('error' in result) {
    const passkeys = await hasPasskeys(c.env)
    return page(
      (nonce) =>
        loginPage(
          {
            error: '`ADMIN_TOKEN` غير مضبوط على هذه البيئة — اللوحة مقفلة لا مفتوحة.',
            passkeys,
            next,
          },
          nonce,
        ),
      401,
    )
  }

  await clearAttempts(c.env.KV, c.req.raw)
  await releaseAttempt(c.env.DB, c.req.raw, device)
  await releaseCodeGuesses(c.env.DB, who.email, c.req.raw, device)
  await record(
    c.env.DB,
    {
      actor: 'panel',
      action: pending ? 'session.pending' : enrol ? 'session.enrol' : 'session.open',
      detail: pending ? 'ينتظر العامل الثاني' : (enrol ? 'يلزمه تسجيل عامل · ' : 'برمز البريد · ') + who.email,
      by: who.email,
    },
    c.req.raw,
  )
  // ‏جلسةٌ كاملةٌ جديدة تُقال لصاحبها خارج القاعدة (D-317)؛ والمعلَّقةُ وجلسةُ التسجيل ليستا بابًا مفتوحًا بعد
  // ‏والوجهةُ بعد العامل الثاني في الجلسة المعلَّقة نفسِها (`createEmailSession`)، لا في العنوان
  const headers = new Headers({ Location: pending ? '/panel/2fa' : enrol ? '/panel/enrol' : next, 'Set-Cookie': sessionCookie(result.id) })
  if (!pending && !enrol) {
    await securityEvent(c.env, c.req.raw, { kind: 'session.new', email: who.email, detail: 'برمز البريد', sessionId: result.id })
    // ‏ودخولٌ كاملٌ يترك على الجهاز كعكتَه (مراجعة D-317)؛ والمعلَّقةُ وجلسةُ التسجيل لم تُثبتا شيئًا بعد
    await withDevice(headers, c.env.ADMIN_TOKEN, who.email)
  }
  return new Response(null, { status: 303, headers })
})

/**
 * الخروج — بلا فحص CSRF.
 *
 * ولذلك عذر: أسوأُ ما يصنعه طلبُ خروجٍ مزوَّر أن يُخرجك، وهو أذًى لا
 * خطر. وفحصُه يعني أنّ جلسةً سقط رمزُها لا تُغلَق — فيبقى البابُ مفتوحا
 * حتّى تنتهي مهلته. **بابُ الخروج لا يُقفَل.**
 */
session.post('/panel/logout', async (c) => {
  await destroySession(c.env.KV, c.req.raw)
  await record(c.env.DB, { actor: 'panel', action: 'session.close' }, c.req.raw)
  return new Response(null, {
    status: 303,
    headers: { Location: '/panel', 'Set-Cookie': clearedCookie() },
  })
})

// ── الجلسات ─────────────────────────────────────────────────────────

/** إبطالُ جلسةٍ بعينها من الجرد. */
session.post('/panel/sessions/revoke', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied

  // البصمةُ لا السرّ (D-150): النموذجُ لا يحمل كعكةَ جهازٍ آخر ولا يقبلها
  const handle = String(gate.form.get('handle') ?? '')
  if (handle === '') return c.json({ error: 'missing_handle' }, 400)

  if (handle === (await fingerprint(gate.session.id))) {
    // إبطالُ جلستك من هنا يتركك في صفحةٍ ميّتة بلا كعكةٍ مُمحاة. للخروج زرّه.
    await setFlash(c.env, c.req.raw, {
      kind: 'warn',
      text: 'هذه جلستك — استعمل زرّ «خروج» لإغلاقها.',
    })
    return back('security')
  }

  await revokeSessions(c.env.KV, { onlyHandle: handle })
  await record(c.env.DB, { actor: 'panel', action: 'session.revoke', target: handle }, c.req.raw)
  await setFlash(c.env, c.req.raw, { kind: 'ok', text: 'أُبطلت الجلسة.' })
  return back('security')
})

/**
 * منظّمةٌ جديدة (D-225) — **من حساب الدخول الحاليّ، وهو حسابُ المشغّل**.
 * تُنشأ ومعها علامتُها الأولى. ومع «switch=1» (D-418) تصير النشطةَ ويُحوَّل إلى جاهزيّتها، وبدونه تبقى في القائمة.
 */
session.post('/panel/orgs', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const result = await createOrg(c.env.DB, {
    name: String(gate.form.get('name') ?? ''),
    kind: String(gate.form.get('kind') ?? ''),
  })
  if (!result.ok) {
    await setFlash(c.env, c.req.raw, {
      kind: 'bad',
      text: result.reason === 'name' ? 'اكتب اسمًا للمنظّمة، ثمانين حرفًا أو أقلّ.' : 'اختر نوع المنظّمة من القائمة.',
    })
    return back('orgs')
  }
  await record(c.env.DB, { actor: 'panel', action: 'org.create', target: result.id, org: result.id }, c.req.raw)
  // ‏«انتقل إليها وابدأ تهيئتها» (D-418): مؤشَّرٌ افتراضًا، فالعميلُ الجديدُ يُفتح على جاهزيّته لا على قائمة المنظّمات
  if (gate.form.get('switch') === '1') {
    await setActiveOrg(c.env.KV, gate.session, result.id)
    const name = String(gate.form.get('name') ?? '').trim()
    await setFlash(c.env, c.req.raw, { kind: 'ok', text: 'أُنشئ «' + name + '» — ابدأ بربط حساباته.' })
    return new Response(null, { status: 303, headers: { Location: '/panel/client#setup' } })
  }
  await setFlash(c.env, c.req.raw, { kind: 'ok', text: 'أُنشئت المنظّمة. انتقل إليها حين تريد العمل فيها.' })
  return back('orgs')
})

/** الانتقالُ إلى منظّمة — **ولا يُقبَل معرّفٌ لا يوجد**. */
session.post('/panel/orgs/switch', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const org = String(gate.form.get('org') ?? '')
  if (!(await orgExists(c.env.DB, org))) {
    await setFlash(c.env, c.req.raw, { kind: 'bad', text: 'لم أجد هذه المنظّمة.' })
    return back('orgs')
  }
  await setActiveOrg(c.env.KV, gate.session, org)
  await record(c.env.DB, { actor: 'panel', action: 'org.switch', target: org, org }, c.req.raw)
  const name = (await listOrgs(c.env.DB)).find((o) => o.id === org)?.name
  await setFlash(c.env, c.req.raw, { kind: 'ok', text: name === undefined ? 'انتقلت إلى المنظّمة.' : `انتقلت إلى «${name}».` })
  // ‏ومن مبدّل الرافدة يعود إلى الصفحة التي بدأ منها (‏scope.ts)، ومن الإعدادات إليها
  const next = gate.form.get('next')
  if (typeof next === 'string' && next !== '') return new Response(null, { status: 303, headers: { Location: safeNext(next) } })
  return back('orgs')
})

/** إبطالُ كلّ الجلسات إلّا جلسةَ الفاعل. */
session.post('/panel/sessions/revoke-all', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied

  const removed = await revokeSessions(c.env.KV, { keepId: gate.session.id })
  await record(
    c.env.DB,
    { actor: 'panel', action: 'session.revoke_all', detail: `${removed} جلسة` },
    c.req.raw,
  )
  // ‏«أخرِج الأجهزة الأخرى» يُقال خارج القاعدة (D-317): من سرق جلسةً فأخرج صاحبَها لا يمرّ صامتًا
  await securityEvent(c.env, c.req.raw, {
    kind: 'sessions.revoke_all', email: gate.session.record.email ?? OWNER_EMAIL, detail: String(removed) + ' جلسة', sessionId: gate.session.id,
  })
  await setFlash(c.env, c.req.raw, {
    kind: removed === 0 ? 'ok' : 'warn',
    text: removed === 0 ? 'لا جلسات أخرى مفتوحة.' : `أُبطلت ${removed} جلسة. جلستك هذه باقية.`,
  })
  return back('security')
})

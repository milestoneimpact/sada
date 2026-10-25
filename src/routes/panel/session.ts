/**
 * مسارات اللوحة — الدخول والخروج والجلسات والمنظّمات.
 *
 * جزءٌ من `panel.ts` قُسم على أقسامه (D-272) بلا تغييرٍ في سلوك.
 */
import { Hono } from 'hono'
import type { Env } from '../../env'
import { attemptsLeft } from '../../lib/format'
import { attemptState, clearAttempts, delayMs, recordFailure } from '../../lib/rateLimit'
import {
  releaseAttempt, releaseCodeGuesses, reserveAttempt, reserveCodeGuess, reserveCodeIssue,
} from '../../lib/security/gate'
import { issueCode, verifyCode } from '../../lib/security/loginCode'
import { normalizeEmail, OWNER_EMAIL } from '../../lib/ownerEmail'
import { whoCanReceive } from '../../lib/team'
import { sendText } from '../../lib/mail/send'
import { createOrg, listOrgs, orgExists } from '../../lib/tenancy'
import {
  clearedCookie, createEmailSession, destroySession, revokeSessions, safeNext, sessionCookie, setActiveOrg,
} from '../../lib/session'
import { factorState } from '../../lib/security/factors'
import { fingerprint } from '../../lib/security/digest'
import { relyingParty } from '../../lib/security/rp'
import { record } from '../../lib/audit'
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
   * ‏وبريدٌ وصفُّ تدقيق، والطالبُ مجهول — كسقف تحدّي المفتاح (D-161) في دلوٍ مستقلّ. وسقفُ البريد
   * ‏الواحد (`issueCode`) لا يحرس عناوينَ شتّى.
   */
  if (!(await reserveCodeIssue(c.env.DB, c.req.raw)).allowed) {
    await record(c.env.DB, { actor: 'anonymous', action: 'login.code.capped', detail: 'ip_or_global' }, c.req.raw)
    return page(
      (nonce) => loginPage({ error: 'طلباتٌ كثيرة من هذا العنوان. انتظر ربع ساعة ثمّ أعد المحاولة.', blocked: true, next }, nonce),
      429,
    )
  }

  // ‏المالكُ أو مدعوٌّ قائم (D-272) — ولغيرهما الصفحةُ نفسُها بلا رسالة (لا تعداد)
  const typed = normalizeEmail(String(form.get('email') ?? ''))
  const who = await whoCanReceive(c.env.DB, typed)
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

  // ‏والحجزُ قبل الفحص (D-161): طلباتٌ متزامنةٌ تمرّ كلُّها من قراءة KV قبل أن
  // ‏تكتب واحدةٌ منها، والعدّادُ الذرّيُّ في D1 يردّ السادسةَ قبل أن يُقارَن رمزُها
  const reserved = await reserveAttempt(c.env.DB, c.req.raw)
  if (!reserved.allowed) {
    return page(
      (nonce) => loginPage({ error: blockedText(false), blocked: true, step: 'code', next }, nonce),
      429,
    )
  }

  // ‏صاحبُ الرمز من خطوة البريد (D-272): المالكُ أو مدعوٌّ قائم. وغيرُهما لا رمزَ مخزّنًا له فيسقط في `verifyCode`
  // ‏كرمزٍ خاطئ — **ويُعدّ في سقف اليوم مثلَه**، فلا يكشف الفرقُ أيَّ العناوين مدعوّ
  const claimed = normalizeEmail(String(form.get('email') ?? '') || OWNER_EMAIL)
  const who = (await whoCanReceive(c.env.DB, claimed)) ?? { email: claimed, role: 'viewer' as const, orgs: [] as string[] }
  // ‏وسقفُ اليوم على الرمز نفسِه (D-247): حدُّ العنوان يُعدّ بربع الساعة، والتخمينُ يتراكم
  if (!(await reserveCodeGuess(c.env.DB, who.email)).allowed) {
    await record(c.env.DB, { actor: 'anonymous', action: 'login.code.locked' }, c.req.raw)
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
  if ((await whoCanReceive(c.env.DB, who.email)) === null) {
    return page((nonce) => loginPage({ error: 'الرمز غير صحيح أو انتهت مهلته. اطلب رمزًا جديدًا.', step: 'code', next }, nonce), 401)
  }

  // يُقرأ حالُ العوامل **قبل** فتح الجلسة: جلسةٌ تُفتح كاملةً ثمّ تُعلَّق
  // بعد ذلك تكون قد وُجدت كاملةً لحظةً — ولحظةٌ تكفي
  const rp = relyingParty(c.env.PUBLIC_BASE_URL)
  const factors = await factorState(c.env.DB, rp.id)
  // ‏العاملُ الثاني عاملُ المالك (مفاتيحُه ورمزُ تطبيقه)، فلا يُطلب من المدعوّ ما لا يملكه
  const pending = factors.enforced && who.role === 'owner'
  const result = await createEmailSession(c.env.KV, c.env.ADMIN_TOKEN, { email: who.email, role: who.role }, c.req.raw, {
    pending,
    next,
  })
  if ('error' in result) {
    return page(
      (nonce) =>
        loginPage(
          {
            error: '`ADMIN_TOKEN` غير مضبوط على هذه البيئة — اللوحة مقفلة لا مفتوحة.',
            passkeys: factors.passkeys.length > 0,
            next,
          },
          nonce,
        ),
      401,
    )
  }

  await clearAttempts(c.env.KV, c.req.raw)
  await releaseAttempt(c.env.DB, c.req.raw)
  await releaseCodeGuesses(c.env.DB, who.email)
  await record(
    c.env.DB,
    {
      actor: 'panel',
      action: pending ? 'session.pending' : 'session.open',
      detail: pending ? 'ينتظر العامل الثاني' : `برمز البريد · ${who.email}`,
    },
    c.req.raw,
  )
  return new Response(null, {
    status: 303,
    headers: {
      // ‏والوجهةُ بعد العامل الثاني في الجلسة المعلَّقة نفسِها (`createEmailSession`)، لا في العنوان
      Location: pending ? '/panel/2fa' : next,
      'Set-Cookie': sessionCookie(result.id),
    },
  })
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
 * تُنشأ ومعها علامتُها الأولى، ولا تُفتح تلقائيًّا: الانتقالُ إليها فعلٌ مستقلّ.
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
  await setFlash(c.env, c.req.raw, {
    kind: removed === 0 ? 'ok' : 'warn',
    text: removed === 0 ? 'لا جلسات أخرى مفتوحة.' : `أُبطلت ${removed} جلسة. جلستك هذه باقية.`,
  })
  return back('security')
})

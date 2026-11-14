/**
 * **حارسُ الأدوار والجلسات** (D-272 · D-317) — قبل كلِّ مسارٍ في `/panel` و`/oauth`، مرّةً واحدة.
 *
 * - **المالكُ** يمرّ كما كان، ويُكتب بريدُه في التدقيق.
 * - **المدعوّ** يُقرأ صفُّه في كلّ طلب: الإلغاءُ يسري في الطلب التالي لا بعد انتهاء الجلسة. ودورُه يُقارَن بما يطلبه المسار
 *   (`requiredRole`)، وشركتُه النشطةُ تُقصَر على شركاته — فإن لم تكن منها نُقل إلى أوّلها.
 * - **وبلا جلسةٍ** يمرّ الطلبُ إلى مساره، وهو يردّ بالدخول كما كان: الحارسُ لا يكرّر ما يفعله غيره.
 *
 * ## والجلسةُ الناقصةُ تُردّ هنا لا في كلّ مسار (D-317)
 *
 * كان كلُّ مسارٍ يسأل «أمعلَّقةٌ هي؟» بنفسه، ومسارٌ نسي السؤالَ (ملفُّ القالب في `plan.ts`) فتحته جلسةٌ لم تُتمّ عاملَها.
 * فصار السؤالُ هنا مرّةً قبل كلّ مسار:
 *
 * - **المعلَّقة** (رمزُ البريد بلا العامل الثاني) لا تفتح إلّا شاشتَه وأبوابَ الدخول والخروج (`pendingMayOpen`).
 * - **جلسةُ التسجيل وحده** (حسابٌ يلزمه عاملٌ ولا عاملَ له) لا تفتح إلّا صفحةَ التسجيل والمساعدةَ والخروج (`enrolMayOpen`).
 * - **والفعلُ الحسّاس** (`needsStepUp`) لا يجري إلّا بتحقّقٍ في آخر خمس دقائق، وإلّا فإلى «تحقّق للتوّ» ثمّ العودة —
 *   **ولا يُمرَّر إلى مساره بلا تحقّقٍ حديثٍ أبدًا** (مراجعة D-317): كان `HEAD` يمرّ لأنّ الفرعَ يعدّ `GET` وحده.
 * - **والدورُ الذي صار يلزمه عامل** (مراجعة D-317): يُقرأ الدورُ من `members` في كلّ طلب، فمحرّرٌ دخل برمز بريده وحده ثمّ
 *   رُقّي مديرًا أو ناشرًا لا تبقى جلستُه كاملةً بلا عامل — تسقط، ويُسأل في دخوله التالي عن عامله أو يسجّله.
 * - **والخمولُ** اثنتا عشرة ساعة تُحسَب في `loadSession`، ويُؤرَّخ آخرُ طلبٍ هنا (`touchSession`).
 */
import type { Context, Next } from 'hono'
import type { Env } from '../env'
import {
  checkCsrf, clearedCookie, destroySession, isFresh, loadSession, safeNext, setActiveOrg, touchSession, type Session,
} from '../lib/session'
import { activeOrg, OWNER_ORG } from '../lib/tenancy'
import {
  allows, enrolMayOpen, factorRequired, needsStepUp, orgAllowed, pendingMayOpen, requiredRole, runAs, stepUpReturn, stepUpSecretFields,
} from '../lib/access'
import { activeMember, OWNER_WHO, ROLE_LABEL, touchMember, type Who } from '../lib/team'
import { OWNER_EMAIL } from '../lib/ownerEmail'
import { say } from '../lib/errors/catalog'
import { record } from '../lib/audit'
import { htmlHeaders, makeNonce } from '../lib/security/headers'
import { loginPage } from './panelView'
import { hasPasskeys, setFlash } from './panel/shared'

function denied(c: Context<{ Bindings: Env }>, text: string): Response | Promise<Response> {
  const wantsJson = (c.req.header('Accept') ?? '').includes('application/json')
  if (wantsJson) return c.json({ ok: false, reason: text }, 403)
  return setFlash(c.env, c.req.raw, { kind: 'bad', text }).then(() => c.redirect('/panel', 303))
}

/** إلى حيث تكتمل الجلسة: صفحةٌ تُفتح تُحوَّل، وفعلٌ يُردّ بسببه ووجهتِه. */
function toComplete(c: Context<{ Bindings: Env }>, to: string, error: 'pending_second_factor' | 'enrol_required'): Response {
  if (c.req.method === 'GET' || c.req.method === 'HEAD') return c.redirect(to, 303)
  return Response.json({ error, detail: say(error) }, { status: 403, headers: { Location: to } })
}

/**
 * **الجلسةُ تسقط ويُعاد صاحبُها إلى الدخول بسببه** (مراجعة D-317) — صفحةُ الدخول نفسُها برسالتها، والكعكةُ ممحوّة؛
 * ونداءُ سكربتٍ يُجاب بسببه. والوجهةُ تبقى لصفحةٍ تُفتح، فيعود إليها بعد الدخول.
 */
async function toSignIn(c: Context<{ Bindings: Env }>, text: string): Promise<Response> {
  await destroySession(c.env.KV, c.req.raw)
  if ((c.req.header('Accept') ?? '').includes('application/json')) {
    return Response.json({ error: 'enrol_required', detail: text }, { status: 401, headers: { 'Set-Cookie': clearedCookie() } })
  }
  // ‏وصفحةٌ تُفتح يعود إليها بعد الدخول؛ ونموذجٌ أُرسل لا يُعاد إرسالُه — إلى الرئيسيّة
  const url = new URL(c.req.url)
  const opened = c.req.method === 'GET' || c.req.method === 'HEAD'
  const passkeys = await hasPasskeys(c.env)
  const nonce = makeNonce()
  const headers = new Headers(htmlHeaders(nonce))
  headers.set('Set-Cookie', clearedCookie())
  return new Response(loginPage({ error: text, passkeys, next: opened ? safeNext(url.pathname + url.search) : '/panel' }, nonce),
    { status: 401, headers })
}

/** مفتاحُ النموذج المحفوظ بين الفعل و«تحقّق للتوّ» — لجلسته وحدها، عشرَ دقائق. */
export function stepUpFormKey(sessionId: string): string {
  return 'stepup-form:' + sessionId
}

/** عنوانُ «تحقّق للتوّ» بوجهته بعد التحقّق. */
export function stepUpUrl(next: string): string {
  return '/panel/stepup?next=' + encodeURIComponent(next)
}

/** ما يُحفظ من نموذج فعلٍ حسّاس ليُعاد رسمُه بعد التحقّق — **بلا رمز النموذج وبلا الأسرار**. */
export interface SavedForm {
  readonly action: string
  readonly fields: readonly (readonly [string, string])[]
  readonly secrets: readonly string[]
}

/**
 * **«تحقّق للتوّ»** (D-317). الصفحةُ تُفتح بعد التحقّق كما طُلبت؛ ونداءُ سكربتٍ يُجاب بسببه ووجهتِه ليفتحها؛ ونموذجٌ
 * يُحفظ (بلا أسراره) ويُعاد رسمُه بعد التحقّق ليضغط صاحبُه «أكمل» بنفسه — **لا يُعاد إرسالُ جسدٍ بلا علمه**.
 */
async function toStepUp(c: Context<{ Bindings: Env }>, session: Session, who: Who, path: string, form: FormData | null): Promise<Response> {
  const url = new URL(c.req.url)
  if (c.req.method === 'GET' || c.req.method === 'HEAD') {
    // ‏وملفٌّ يُنزَّل يعود بعده إلى صفحته لا إليه (`stepUpReturn`، مراجعة D-322)
    return c.redirect(stepUpUrl(stepUpReturn(path) + url.search), 303)
  }
  const json = path.startsWith('/panel/security/') || form?.get('auto') === '1'
    || (c.req.header('Accept') ?? '').includes('application/json')
  if (json) {
    // ‏ويعود إلى حيث تُدار عواملُه: المالكُ إلى الإعدادات، والعضوُ وجلسةُ التسجيل إلى «أمان حسابك»
    const own = session.record.enrol === true || who.role !== 'owner' ? '/panel/enrol' : '/panel/settings#factors'
    const to = stepUpUrl(path.startsWith('/panel/security/') ? own : '/panel/settings')
    return Response.json({ error: 'step_up', detail: say('step_up'), to }, { status: 403 })
  }
  const secrets = stepUpSecretFields(path, form)
  const fields: [string, string][] = []
  form?.forEach((value, name) => {
    if (name === '_csrf' || secrets.includes(name) || typeof value !== 'string') return
    fields.push([name.slice(0, 64), value.slice(0, 2000)])
  })
  const saved: SavedForm = { action: path, fields: fields.slice(0, 60), secrets }
  await c.env.KV.put(stepUpFormKey(session.id), JSON.stringify(saved), { expirationTtl: 600 })
  return c.redirect(stepUpUrl('/panel/stepup/resume'), 303)
}

export async function accessGuard(c: Context<{ Bindings: Env }>, next: Next): Promise<Response | void> {
  /*
   * ‏**المسارُ كما يوجّهه Hono لا كما وصل** (D-315). كان الحارسُ يقرأ `new URL(c.req.url).pathname` — المسارَ بترميزه —
   * ‏وHono يوجّه على المسار مفكوكَ الترميز (`decodeURI`). فـ«/p%61nel/team/invite» يصل مسارَ الدعوة والحارسُ يراه خارج
   * ‏«/panel» فيمرّره، و«/panel/%74eam» يُقرأ «عرضًا» لا «للمالك»: مدعوٌّ بدور «مشاهد» كان يدعو مديرًا ويقرأ الفريق.
   * ‏فالحارسُ والموجِّهُ يقرآن السلسلةَ نفسَها: `c.req.path`.
   */
  const path = c.req.path
  if (!path.startsWith('/panel') && !path.startsWith('/oauth/')) return next()
  const loaded = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (loaded === null) return next()

  // ‏المعلَّقةُ لا تفتح إلّا شاشةَ عاملها (D-317) — ولا تُؤرَّخ: عمرُها عشرُ دقائق من فتحها لا من آخر طلب
  if (loaded.record.pending) {
    return pendingMayOpen(path) ? next() : toComplete(c, '/panel/2fa', 'pending_second_factor')
  }
  const session = await touchSession(c.env.KV, loaded)

  const email = session.record.email ?? OWNER_EMAIL
  const role = session.record.role ?? 'owner'
  let who: Who
  if (role === 'owner' && email === OWNER_EMAIL) {
    who = OWNER_WHO
  } else {
    // ‏وقاعدةٌ لا تردّ **ترمي** (مراجعة D-317): صفحةُ «حدث خطأ من جهتنا، أعد المحاولة» — لا جلسةٌ تسقط بعثرة، ولا طلبٌ يمرّ
    const member = await activeMember(c.env.DB, email)
    if (member === null) {
      // ‏أُلغيت دعوتُه: الجلسةُ تسقط الآن لا بعد ثلاثة أيّام
      await destroySession(c.env.KV, c.req.raw)
      return c.redirect('/panel', 303)
    }
    who = { email: member.email, role: member.role, orgs: member.orgs }
  }

  /*
   * ‏**دورٌ يلزمه عاملٌ وجلسةٌ لم تُثبت عاملًا** (مراجعة D-317). قرارُ «جلسة التسجيل» يُتّخذ عند الدخول من دور تلك اللحظة،
   * ‏والدورُ يُقرأ هنا من القاعدة في كلّ طلب: محرّرٌ دخل برمز بريده وحده ثمّ رقّاه المالكُ مديرًا كان يبقى مديرًا كاملًا بلا عامل
   * ‏حتّى ثلاثة أيّام، ويتحقّق «للتوّ» برمز البريد نفسِه. فالجلسةُ تسقط، ودخولُه التالي يسأله عن عامله أو يسجّله. **ولا تُرقّى
   * ‏هنا إلى جلسة تسجيلٍ «حديثة»**: من سرق كعكةَ المحرّر لا يُعطى بالترقية بابًا يسجّل منه مفتاحَه.
   */
  if (factorRequired(who.role) && session.record.enrol !== true && session.record.factor !== true) {
    await record(c.env.DB, { actor: 'panel', action: 'session.drop', detail: 'دورٌ يلزمه عاملٌ ثانٍ · ' + who.role, by: who.email }, c.req.raw)
    // ‏نصٌّ يُهرَّب في صفحة الدخول (`noticeText`)، لا قالبٌ يُقحَم
    return toSignIn(c, 'دورُك صار «' + ROLE_LABEL[who.role].name + '» ويلزمه عاملٌ ثانٍ — ادخل من جديد لتسجّله.')
  }

  // ‏جلسةُ التسجيل وحده (D-317): صفحةُ التسجيل وما يلزمها، وما سواها إليها
  if (session.record.enrol === true && !enrolMayOpen(c.req.method, path)) {
    return toComplete(c, '/panel/enrol', 'enrol_required')
  }

  /*
   * ‏والنموذجُ يُقرأ حين يكون نموذجًا وحدَه: Hono يحفظ أوّلَ قراءةٍ للجسد، **وقراءةٌ فاشلةٌ تُحفَظ فاشلةً** فيسقط بعدها
   * ‏`c.req.json()` في المسار (الدخولُ بمفتاح المرور جسدُه JSON). فجسدٌ ليس نموذجًا لا يُمَسّ هنا.
   */
  const isForm = /^(multipart\/form-data|application\/x-www-form-urlencoded)/i.test(c.req.header('Content-Type') ?? '')
  const form = c.req.method === 'POST' && isForm ? await c.req.formData().catch(() => null) : null

  if (who.role !== 'owner') {
    // ‏الشركةُ النشطةُ من شركاته — وإلّا فأوّلُها
    const org = activeOrg(session.record)
    if (!orgAllowed(who, org)) {
      const first = who.orgs === '*' ? OWNER_ORG : who.orgs[0]
      if (first === undefined) return denied(c, 'لا شركةَ في دعوتك — اطلب من المالك أن يضيفك إلى شركة.')
      await setActiveOrg(c.env.KV, session, first)
    }

    const need = requiredRole(c.req.method, path, form?.get('do')?.toString() ?? null)
    if (need !== null && !allows(who.role, need)) {
      return denied(c, `دورُك «${ROLE_LABEL[who.role].name}» لا يملك هذا — يحتاج «${ROLE_LABEL[need].name}» فأعلى.`)
    }
    // ‏والانتقالُ إلى شركةٍ ليست له يُردّ هنا، قبل أن يصل مسارَه
    if (path === '/panel/orgs/switch' && !orgAllowed(who, String(form?.get('org') ?? ''))) {
      return denied(c, 'هذه الشركةُ ليست في دعوتك.')
    }
  }

  /*
   * ‏**الفعلُ الحسّاسُ بتحقّقٍ حديث** (D-317) — **ولا يُمرَّر إلى مساره بلا تحقّقٍ حديثٍ أبدًا** (مراجعة D-317). كان الفرعُ
   * ‏يعدّ `GET` وحده فيمرّ `HEAD` (وHono يوجّهه إلى معالج `GET`) فيكتب حالةَ OAuth ويحوّل إلى المزوّد بكعكةٍ قديمة. والآن:
   * ‏صفحةٌ تُفتح (`GET`/`HEAD`) إلى «تحقّق للتوّ»، ونموذجٌ برمزٍ صحيحٍ يُحفظ ويُعاد بعده، **ونموذجٌ برمزٍ لا يطابق يُردّ هنا**
   * ‏بسببه — لا يُحفظ ما أرسله غيرُ صاحب الجلسة ليُعرض عليه، ولا يمضي إلى مساره.
   */
  if (needsStepUp(c.req.method, path, form?.get('key')?.toString() ?? null) && !isFresh(session.record)) {
    const opened = c.req.method === 'GET' || c.req.method === 'HEAD'
    if (opened || (form !== null && await checkCsrf(session, String(form.get('_csrf') ?? '')))) {
      return toStepUp(c, session, who, path, form)
    }
    await record(c.env.DB, { actor: 'panel', action: 'csrf.reject', target: path }, c.req.raw)
    return Response.json({ error: 'csrf_failed', detail: say('csrf_failed') }, { status: 403 })
  }

  if (who.role !== 'owner') await touchMember(c.env.DB, who.email)
  return runAs(who, next)
}

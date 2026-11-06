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
 * - **والفعلُ الحسّاس** (`needsStepUp`) لا يجري إلّا بتحقّقٍ في آخر خمس دقائق، وإلّا فإلى «تحقّق للتوّ» ثمّ العودة.
 * - **والخمولُ** اثنتا عشرة ساعة تُحسَب في `loadSession`، ويُؤرَّخ آخرُ طلبٍ هنا (`touchSession`).
 */
import type { Context, Next } from 'hono'
import type { Env } from '../env'
import { checkCsrf, destroySession, isFresh, loadSession, setActiveOrg, touchSession, type Session } from '../lib/session'
import { activeOrg, OWNER_ORG } from '../lib/tenancy'
import {
  allows, enrolMayOpen, needsStepUp, orgAllowed, pendingMayOpen, requiredRole, runAs, STEP_UP_SECRET_FIELDS,
} from '../lib/access'
import { activeMember, OWNER_WHO, ROLE_LABEL, touchMember, type Who } from '../lib/team'
import { OWNER_EMAIL } from '../lib/ownerEmail'
import { say } from '../lib/errors/catalog'
import { setFlash } from './panel'

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
    return c.redirect(stepUpUrl(path + url.search), 303)
  }
  const json = path.startsWith('/panel/security/') || form?.get('auto') === '1'
    || (c.req.header('Accept') ?? '').includes('application/json')
  if (json) {
    // ‏ويعود إلى حيث تُدار عواملُه: المالكُ إلى الإعدادات، والعضوُ وجلسةُ التسجيل إلى «أمان حسابك»
    const own = session.record.enrol === true || who.role !== 'owner' ? '/panel/enrol' : '/panel/settings#factors'
    const to = stepUpUrl(path.startsWith('/panel/security/') ? own : '/panel/settings')
    return Response.json({ error: 'step_up', detail: say('step_up'), to }, { status: 403 })
  }
  const secrets = STEP_UP_SECRET_FIELDS[path] ?? []
  const fields: [string, string][] = []
  form?.forEach((value, name) => {
    if (name === '_csrf' || secrets.includes(name) || typeof value !== 'string') return
    fields.push([name.slice(0, 64), value.slice(0, 2000)])
  })
  const saved: SavedForm = { action: path, fields: fields.slice(0, 60), secrets: secrets.filter((n) => form?.has(n) === true) }
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
    const member = await activeMember(c.env.DB, email)
    if (member === null) {
      // ‏أُلغيت دعوتُه: الجلسةُ تسقط الآن لا بعد ثلاثة أيّام
      await destroySession(c.env.KV, c.req.raw)
      return c.redirect('/panel', 303)
    }
    who = { email: member.email, role: member.role, orgs: member.orgs }
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
   * ‏**الفعلُ الحسّاسُ بتحقّقٍ حديث** (D-317). ونموذجٌ برمزٍ لا يطابق يمضي إلى مساره فيُردّ هناك كما كان: لا يُحفظ ما
   * ‏أرسله غيرُ صاحب الجلسة ليُعرض عليه بعد التحقّق.
   */
  if (needsStepUp(c.req.method, path, form?.get('key')?.toString() ?? null) && !isFresh(session.record)) {
    const csrfOk = c.req.method === 'GET' || (form !== null && await checkCsrf(session, String(form.get('_csrf') ?? '')))
    if (csrfOk) return toStepUp(c, session, who, path, form)
  }

  if (who.role !== 'owner') await touchMember(c.env.DB, who.email)
  return runAs(who, next)
}

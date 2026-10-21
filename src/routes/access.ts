/**
 * **حارسُ الأدوار** (D-270) — قبل كلِّ مسارٍ في `/panel` و`/oauth`، مرّةً واحدة.
 *
 * - **المالكُ** يمرّ كما كان، ويُكتب بريدُه في التدقيق.
 * - **المدعوّ** يُقرأ صفُّه في كلّ طلب: الإلغاءُ يسري في الطلب التالي لا بعد انتهاء الجلسة. ودورُه يُقارَن بما يطلبه المسار
 *   (`requiredRole`)، وشركتُه النشطةُ تُقصَر على شركاته — فإن لم تكن منها نُقل إلى أوّلها.
 * - **وبلا جلسةٍ أو بجلسةٍ معلَّقة** يمرّ الطلبُ إلى مساره، وهو يردّ بالدخول كما كان: الحارسُ لا يكرّر ما يفعله غيره.
 */
import type { Context, Next } from 'hono'
import type { Env } from '../env'
import { destroySession, loadSession, setActiveOrg } from '../lib/session'
import { activeOrg, OWNER_ORG } from '../lib/tenancy'
import { allows, orgAllowed, requiredRole, runAs } from '../lib/access'
import { activeMember, OWNER_WHO, ROLE_LABEL, touchMember, type Who } from '../lib/team'
import { OWNER_EMAIL } from '../lib/ownerEmail'
import { setFlash } from './panel'

function denied(c: Context<{ Bindings: Env }>, text: string): Response | Promise<Response> {
  const wantsJson = (c.req.header('Accept') ?? '').includes('application/json')
  if (wantsJson) return c.json({ ok: false, reason: text }, 403)
  return setFlash(c.env, c.req.raw, { kind: 'bad', text }).then(() => c.redirect('/panel', 303))
}

export async function accessGuard(c: Context<{ Bindings: Env }>, next: Next): Promise<Response | void> {
  const path = new URL(c.req.url).pathname
  if (!path.startsWith('/panel') && !path.startsWith('/oauth/')) return next()
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null || session.record.pending) return next()

  const email = session.record.email ?? OWNER_EMAIL
  const role = session.record.role ?? 'owner'
  if (role === 'owner' && email === OWNER_EMAIL) return runAs(OWNER_WHO, next)

  const member = await activeMember(c.env.DB, email)
  if (member === null) {
    // ‏أُلغيت دعوتُه: الجلسةُ تسقط الآن لا بعد ثلاثة أيّام
    await destroySession(c.env.KV, c.req.raw)
    return c.redirect('/panel', 303)
  }
  const who: Who = { email: member.email, role: member.role, orgs: member.orgs }

  // ‏الشركةُ النشطةُ من شركاته — وإلّا فأوّلُها
  const org = activeOrg(session.record)
  if (!orgAllowed(who, org)) {
    const first = who.orgs === '*' ? OWNER_ORG : who.orgs[0]
    if (first === undefined) return denied(c, 'لا شركةَ في دعوتك — اطلب من المالك أن يضيفك إلى شركة.')
    await setActiveOrg(c.env.KV, session, first)
  }

  const form = c.req.method === 'POST' ? await c.req.formData().catch(() => null) : null
  const need = requiredRole(c.req.method, path, form?.get('do')?.toString() ?? null)
  if (need !== null && !allows(who.role, need)) {
    return denied(c, `دورُك «${ROLE_LABEL[who.role].name}» لا يملك هذا — يحتاج «${ROLE_LABEL[need].name}» فأعلى.`)
  }
  // ‏والانتقالُ إلى شركةٍ ليست له يُردّ هنا، قبل أن يصل مسارَه
  if (path === '/panel/orgs/switch' && !orgAllowed(who, String(form?.get('org') ?? ''))) {
    return denied(c, 'هذه الشركةُ ليست في دعوتك.')
  }
  await touchMember(c.env.DB, who.email)
  return runAs(who, next)
}

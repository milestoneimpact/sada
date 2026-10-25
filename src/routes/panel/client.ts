/**
 * مسارات اللوحة — العميل والمحفظة والفريق و«ما ينجح» وملفّات CSV.
 *
 * جزءٌ من `panel.ts` قُسم على أقسامه (D-278) بلا تغييرٍ في سلوك.
 */
import { Hono, type Context } from 'hono'
import type { Env } from '../../env'
import { platformLabel, PLATFORM_IDS } from '../../lib/oauth/providers'
import { soloNav } from '../ui/rail'
import { buildCommands, sectionLabel } from '../ui/command'
import { latestPlan } from '../../lib/plan/job'
import { money } from '../../lib/format'
import { OWNER_EMAIL } from '../../lib/ownerEmail'
import { inviteMember, listMembers, revokeMember, ROLE_LABEL, type MemberRole } from '../../lib/team'
import { teamScreen } from '../ui/teamView'
import { PERIODS, portfolio, previousWindow, type Period } from '../../lib/portfolio'
import { portfolioScreen } from '../ui/portfolioView'
import { sendText } from '../../lib/mail/send'
import { readSettings } from '../../lib/settings'
import { pivot, readCols, readDimension, readMeasure, toCsv } from '../../lib/pivot'
import { loadFacts } from '../../lib/pivotStore'
import { activeOrg, listOrgs } from '../../lib/tenancy'
import { loadSession } from '../../lib/session'
import { waiting } from '../../lib/platform/timeline'
import { ownerZone } from '../../lib/time/ownerZone'
import { insightsCsv, insightsScreen } from '../ui/insightsView'
import { clientScreen } from '../ui/clientView'
import { PLAN_BOARD_SCRIPT } from '../ui/planBoard'
import { monthlyReport, monthOf, reportText } from '../../lib/report/monthly'
import { MONTHLY_SCRIPT, monthlyScreen } from '../ui/monthlyView'
import { planProgress } from '../../lib/plan/schedule'
import { readBrief, writeBrief } from '../../lib/brief'
import { estimateMonth, unitCosts } from '../../lib/estimate'
import { readFacts, whatWorks } from '../../lib/insights/whatWorks'
import { injectCsrf, soloPage } from '../ui/shell'
import { record } from '../../lib/audit'
import { readSpan, page, loginResponse, setFlash, takeFlash, guardPost } from './shared'

export const client = new Hono<{ Bindings: Env }>()

/**
 * الجدولُ ملفًّا (D-126) — **المسارُ نفسُه بلاحقة، والقراءةُ نفسُها**.
 *
 * تُقرأ المعاملاتُ بقوائم السماح نفسِها التي يقرأ بها اللوح، ويُحمَّل ما
 * يحمّله، **فلا يُنزَّل غيرُ ما يُعرَض**. ولا مكتبةَ في المتصفّح: `CSV`
 * يُكتب في الخادم من الجدول نفسِه.
 */
/**
 * «ما ينجح» (D-253): أرجحُ موعدٍ وأفضلُ شكلٍ وطولٍ من تاريخ الحساب — **بلا نداءٍ مدفوع**، قراءةٌ لما قِيس.
 * والمنصّةُ من `?p=` بقائمة سماح (ما له منشوراتٌ مقيسة)، فلا يُبنى استعلامٌ من نصٍّ مجهول.
 */
async function insightsInput(c: Context<{ Bindings: Env }>, org: string) {
  const all = await readFacts(c.env.DB, org, null)
  const platforms = [...new Set(all.map((f) => f.platform))]
  const asked = new URL(c.req.url).searchParams.get('p')
  const platform = asked !== null && platforms.includes(asked) ? asked : null
  const facts = platform === null ? all : all.filter((f) => f.platform === platform)
  const zone = await ownerZone(c.env.DB, c.req.header('Cookie') ?? null)
  return { facts, platform, platforms, zone }
}

/**
 * رحلةُ العميل (D-257 · AGENCY-PLAN): المحطّاتُ السبع لعميلِ الجلسة، والموجزُ يُكتب فيها. **قراءةٌ لا نداء**:
 * التقديرُ ممّا أُنفق فعلًا، ولا يُنفَق شيءٌ من هنا.
 */
/** أسماءُ المصادر لبطاقات اللوحة — للعميل وحدَه، وبعددٍ محدود. */
async function sourceNames(db: Env['DB'], org: string, ids: readonly string[]): Promise<Record<string, string>> {
  const uniq = [...new Set(ids)].slice(0, 60)
  if (uniq.length === 0) return {}
  const { results } = await db
    .prepare(`SELECT id, name FROM sources WHERE org_id = ? AND id IN (${uniq.map(() => '?').join(',')})`)
    .bind(org, ...uniq)
    .all<{ id: string; name: string }>()
    .catch(() => ({ results: [] as { id: string; name: string }[] }))
  return Object.fromEntries(results.map((r) => [r.id, r.name]))
}

client.get('/panel/client', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return loginResponse(c.env, c.req.raw)
  if (session.record.pending) return c.redirect('/panel/2fa', 303)
  const org = activeOrg(session.record)
  const [orgRow, brief, linkedRows, plan, settings, units, spent, facts] = await Promise.all([
    c.env.DB.prepare('SELECT name FROM orgs WHERE id = ?').bind(org).first<{ name: string }>().catch(() => null),
    readBrief(c.env.DB, org),
    c.env.DB.prepare("SELECT platform, count(*) AS n FROM accounts WHERE org_id = ? AND status = 'active' GROUP BY platform")
      .bind(org).all<{ platform: string; n: number }>().catch(() => ({ results: [] as { platform: string; n: number }[] })),
    latestPlan(c.env.DB, org),
    readSettings(c.env.DB),
    unitCosts(c.env.DB, org),
    c.env.DB.prepare("SELECT COALESCE(SUM(total), 0) AS t FROM cost_ledger WHERE org_id = ? AND at >= strftime('%Y-%m-01 00:00:00', 'now')")
      .bind(org).first<{ t: number }>().catch(() => null),
    readFacts(c.env.DB, org, null),
  ])
  const waiting = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM posts WHERE org_id = ? AND status = 'draft'")
    .bind(org).first<{ n: number }>().catch(() => null)
  const body = clientScreen({
    waiting: waiting?.n ?? 0,
    ...(plan === null ? {} : await planProgress(c.env.DB, org, plan.id)),
    sources: plan === null ? [] : (await c.env.DB.prepare('SELECT id, name FROM sources WHERE org_id = ? ORDER BY last_seen_at DESC LIMIT 60')
      .bind(org).all<{ id: string; name: string }>().catch(() => ({ results: [] as { id: string; name: string }[] }))).results,
    orgName: orgRow?.name ?? 'منظّمتي',
    brief,
    linked: Object.fromEntries(linkedRows.results.map((r) => [r.platform, r.n])),
    plan,
    autoImage: settings.autoImage,
    estimate: estimateMonth({ perWeek: brief.perWeek, channels: brief.channels.length, autoImage: settings.autoImage, ...units }),
    spentMonth: spent?.t ?? 0,
    measured: facts.length,
    saved: c.req.query('saved') === '1',
    flash: await takeFlash(c.env, c.req.raw),
    names: plan === null ? {} : await sourceNames(c.env.DB, org, plan.plan.items.map((i) => i.sourceId)),
  })
  return page((nonce) =>
    soloPage('صدى — رحلة العميل', { href: '/panel', label: 'اللوحة' }, injectCsrf(body, session.record.csrf), nonce, PLAN_BOARD_SCRIPT,
      buildCommands({ onPanel: false }), soloNav('accounts')),
  )
})

client.post('/panel/client/brief', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const f = gate.form
  await writeBrief(c.env.DB, activeOrg(gate.session.record), {
    goal: f.get('goal'), audience: f.get('audience'), tone: f.get('tone'), avoid: f.get('avoid'),
    channels: f.getAll('channel'), perWeek: f.get('per_week'),
  })
  await record(c.env.DB, { actor: 'panel', action: 'brief.write' }, c.req.raw)
  return c.redirect('/panel/client?saved=1#brief', 303)
})

/** تقريرُ الشهر لكلّ عميل (D-262 · AGENCY-PLAN و-٦) — يُطبع PDF من المتصفّح. */
client.get('/panel/client/report', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return loginResponse(c.env, c.req.raw)
  if (session.record.pending) return c.redirect('/panel/2fa', 303)
  const org = activeOrg(session.record)
  const [orgRow, zone] = await Promise.all([
    c.env.DB.prepare('SELECT name FROM orgs WHERE id = ?').bind(org).first<{ name: string }>().catch(() => null),
    ownerZone(c.env.DB, c.req.header('Cookie') ?? null),
  ])
  const report = await monthlyReport(c.env.DB, org, monthOf(c.req.query('month'), new Date()), zone)
  const flash = await takeFlash(c.env, c.req.raw)
  return page((nonce) =>
    soloPage(`صدى — تقرير ${report.month}`, { href: '/panel/client', label: 'رحلة العميل' },
      injectCsrf(monthlyScreen(report, orgRow?.name ?? 'منظّمتي', flash), session.record.csrf), nonce, MONTHLY_SCRIPT,
      buildCommands({ onPanel: false }), soloNav('results')),
  )
})

/**
 * **«أرسله إلى بريدي»** (D-268): التقريرُ نصًّا إلى بريد المالك وحدَه (`OWNER_EMAIL`)، لا إلى عنوانٍ يُكتب في نموذج.
 * ويقف على M-31 (Email Routing): قبلها يُقال السببُ ولا يُدّعى الإرسال.
 */
client.post('/panel/client/report/send', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const org = activeOrg(gate.session.record)
  const month = monthOf(String(gate.form.get('month') ?? ''), new Date())
  const [orgRow, zone] = await Promise.all([
    c.env.DB.prepare('SELECT name FROM orgs WHERE id = ?').bind(org).first<{ name: string }>().catch(() => null),
    ownerZone(c.env.DB, c.req.header('Cookie') ?? null),
  ])
  const name = orgRow?.name ?? 'منظّمتي'
  const report = await monthlyReport(c.env.DB, org, month, zone)
  const sent = await sendText(c.env.EMAIL, OWNER_EMAIL, `صدى — تقرير ${month} · ${name}`,
    reportText(report, name, (p) => platformLabel(p as never), money))
  await record(c.env.DB, { actor: 'panel', action: sent.sent ? 'report.mail.sent' : 'report.mail.unsent', target: month,
    detail: sent.sent ? '' : sent.reason }, c.req.raw)
  await setFlash(c.env, c.req.raw, sent.sent
    ? { kind: 'ok', text: `أُرسل تقريرُ ${month} إلى بريدك.` }
    : { kind: 'warn', text: `لم يُرسَل: ${sent.reason} — اطبعه PDF، أو أتمّ M-31 (Email Routing).` })
  return c.redirect(`/panel/client/report?month=${month}`, 303)
})

/** **المحفظة** (D-273): كلُّ الشركات في جدولٍ واحد، تُفلتَر بالفترة والمنصّة والشركة، وتُقصَر على شركات من يراها. */
client.get('/panel/portfolio', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return loginResponse(c.env, c.req.raw)
  if (session.record.pending) return c.redirect('/panel/2fa', 303)
  const days = Number(c.req.query('days'))
  const p = c.req.query('p') ?? ''
  const orgs = await listOrgs(c.env.DB)
  const wanted = c.req.query('org') ?? ''
  const filter = {
    period: (PERIODS as readonly number[]).includes(days) ? (days as Period) : 30,
    platform: (PLATFORM_IDS as readonly string[]).includes(p) ? p : null,
    org: orgs.some((o) => o.id === wanted) ? wanted : null,
  }
  const now = new Date()
  const [rows, before] = await Promise.all([portfolio(c.env.DB, filter, now), portfolio(c.env.DB, filter, previousWindow(now, filter.period))])
  const body = portfolioScreen(rows, orgs, filter, activeOrg(session.record), before)
  return page((nonce) =>
    soloPage('صدى — المحفظة', { href: '/panel', label: 'اللوحة' }, injectCsrf(body, session.record.csrf), nonce, '',
      buildCommands({ onPanel: false }), soloNav('overview')),
  )
})

// ── الفريق (D-278) ─────────────────────────────────────────────────

client.get('/panel/team', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return loginResponse(c.env, c.req.raw)
  if (session.record.pending) return c.redirect('/panel/2fa', 303)
  const body = teamScreen({ members: await listMembers(c.env.DB), orgs: await listOrgs(c.env.DB), flash: await takeFlash(c.env, c.req.raw) })
  return page((nonce) =>
    soloPage('صدى — الفريق', { href: '/panel/settings', label: 'الإعدادات' }, injectCsrf(body, session.record.csrf), nonce, '',
      buildCommands({ onPanel: false }), soloNav('settings')),
  )
})

/**
 * **الدعوة** — بريدٌ ودورٌ وشركات. والرسالةُ إلى المدعوّ تقول كيف يدخل؛ وقبل التحقّق من بريده عند Cloudflare (M-33) يُقال
 * السببُ ولا يُدّعى الإرسال، **والدعوةُ قائمةٌ** يدخل بها متى وصل الرمز.
 */
client.post('/panel/team/invite', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const f = gate.form
  const result = await inviteMember(c.env.DB, {
    email: String(f.get('email') ?? ''), role: String(f.get('role') ?? ''),
    orgs: f.get('all') === '1' ? '*' : f.getAll('org').map(String), by: gate.session.record.email ?? OWNER_EMAIL,
  })
  if (!result.ok) {
    await setFlash(c.env, c.req.raw, { kind: 'bad', text: result.reason })
    return c.redirect('/panel/team#invite', 303)
  }
  const sent = await sendText(c.env.EMAIL, result.email, 'دعوة إلى صدى',
    `دُعيت إلى صدى بدور «${ROLE_LABEL[String(f.get('role')) as MemberRole].name}».\n\n` +
    `ادخل من ${c.env.PUBLIC_BASE_URL}/panel واكتب بريدك هذا، فيصلك رمزٌ من ستّة أرقام.\n` +
    'لا كلمةَ مرورٍ تُحفظ، ولا يدخل أحدٌ بلا الرمز.')
  await record(c.env.DB, { actor: 'panel', action: 'team.invite', target: result.email, detail: `${String(f.get('role'))}${sent.sent ? '' : ` · لم تُرسَل: ${sent.reason}`}` }, c.req.raw)
  await setFlash(c.env, c.req.raw, sent.sent
    ? { kind: 'ok', text: `دُعي ${result.email} ووصلته رسالةُ الدعوة.` }
    : { kind: 'warn', text: `دُعي ${result.email}، ولم تُرسَل الرسالة: ${sent.reason}. يدخل متى تحقّق من بريده عند Cloudflare (M-33).` })
  return c.redirect('/panel/team', 303)
})

client.post('/panel/team/revoke', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const email = String(gate.form.get('email') ?? '')
  const done = await revokeMember(c.env.DB, email)
  await record(c.env.DB, { actor: 'panel', action: 'team.revoke', target: email, detail: done ? 'revoked' : 'not_found' }, c.req.raw)
  await setFlash(c.env, c.req.raw, done ? { kind: 'ok', text: `أُلغي دخولُ ${email}، وتسقط جلستُه في طلبه التالي.` } : { kind: 'bad', text: 'لا عضوَ بهذا البريد.' })
  return c.redirect('/panel/team', 303)
})

client.get('/panel/insights', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return loginResponse(c.env, c.req.raw)
  if (session.record.pending) return c.redirect('/panel/2fa', 303)
  const input = await insightsInput(c, activeOrg(session.record))
  const body = insightsScreen({ ...input, works: whatWorks(input.facts, input.zone) })
  return page((nonce) =>
    soloPage(`صدى — ${sectionLabel('results')} · ما ينجح`, { href: '/panel', label: 'اللوحة' }, body, nonce, '',
      buildCommands({ onPanel: false }), soloNav('results')),
  )
})

client.get('/panel/insights.csv', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return c.redirect('/panel', 303)
  if (session.record.pending) return c.redirect('/panel/2fa', 303)
  const input = await insightsInput(c, activeOrg(session.record))
  return new Response(insightsCsv(input.facts, input.zone), {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="sada-log${input.platform === null ? '' : `-${input.platform}`}.csv"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
})

client.get('/panel/pivot.csv', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return c.redirect('/panel', 303)
  if (session.record.pending) return c.redirect('/panel/2fa', 303)

  const q = new URL(c.req.url).searchParams
  const spec = {
    rows: readDimension(q.get('rows') ?? undefined, 'platform'),
    cols: readCols(q.get('cols') ?? undefined),
    measure: readMeasure(q.get('m') ?? undefined, 'count'),
  }
  const days = readSpan(q.get('days'))
  const loaded = await loadFacts(c.env.DB, activeOrg(session.record), days)
  const body = toCsv(pivot(loaded.facts, spec), spec)
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="sada-${spec.rows}${
        spec.cols === null ? '' : `-${spec.cols}`}-${spec.measure}-${days}d.csv"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
})

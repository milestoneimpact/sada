/**
 * مسارات اللوحة — المهامّ والتقارير والخطّ الزمنيّ ورحلةُ المنشور.
 *
 * جزءٌ من `panel.ts` قُسم على أقسامه (D-278) بلا تغييرٍ في سلوك.
 */
import { Hono } from 'hono'
import type { Env } from '../../env'
import { spendThisMonth } from '../../lib/ai/spend'
import { decide } from '../../lib/draft/store'
import { soloNav } from '../ui/rail'
import { buildCommands, sectionLabel } from '../ui/command'
import { readJourney } from '../../lib/journey'
import { journeyBody } from '../ui/journeyView'
import { readSettings } from '../../lib/settings'
import { activeOrg } from '../../lib/tenancy'
import { loadSession } from '../../lib/session'
import { ownerZone } from '../../lib/time/ownerZone'
import { listReports, readReport } from '../../lib/report/weekly'
import { decide as decidePromotion, openSuggestions } from '../../lib/report/promote'
import { reportScreen } from '../ui/reportView'
import { TIMELINE_SCRIPT, timelineScreen, timelineTitle } from '../ui/timelineView'
import { gantt, readShift, readSpan as readGanttSpan, windowOf } from '../../lib/gantt'
import { GANTT_CAP, loadGantt } from '../../lib/ganttStore'
import { ownerRows } from '../../lib/owner'
import { tasksScreen } from '../ui/tasksView'
import { currentPhase, gatesOf, readGateFacts } from '../../lib/gates'
import { injectCsrf, soloPage } from '../ui/shell'
import { notFoundResponse } from '../errors'
import { record } from '../../lib/audit'
import { page, loginResponse, setFlash, takeFlash, guardPost, ownerFacts } from './shared'

export const reports = new Hono<{ Bindings: Env }>()

/**
 * شاشةُ «ما عليك» — **وثيقةٌ تقول الخطوات، وشاشةٌ تقول أين أنت منها.**
 */
reports.get('/panel/tasks', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return loginResponse(c.env, c.req.raw)
  if (session.record.pending) return c.redirect('/panel/2fa', 303)

  const gates = gatesOf(await readGateFacts(c.env.DB, activeOrg(session.record)))
  const body = tasksScreen({
    rows: ownerRows(await ownerFacts(c, activeOrg(session.record))),
    gates,
    phase: currentPhase(gates),
    env: c.env.SADA_ENV,
  })

  return page((nonce) =>
    soloPage(`صدى — ${sectionLabel('tasks')}`, { href: '/panel', label: 'اللوحة' },
      injectCsrf(body, session.record.csrf), nonce, '',
      buildCommands({ onPanel: false }), soloNav('tasks')),
  )
})

/**
 * شاشةُ التقرير الأسبوعيّ — **تقرأ ما كُتب ولا تحسبه.**
 *
 * ولا زرَّ «ولّد الآن»: التقريرُ شهادةٌ على أسبوعٍ مضى، وزرٌّ يكتبه
 * قبل أوانه يثبّت أرقاما لم تكتمل نوافذُها — **ثمّ لا يُعاد حسابُها
 * أبدا**، لأنّ أوّلَ كتابةٍ هي الشهادة (D-058).
 */
/*
 * **نموذجُ «أقبل/أرفض» كان بلا `_csrf`** (D-150): `reportScreen` يرسم
 * النموذجَ، و`injectCsrf` كانت تُطبَّق على اللوحة وحدَها. فكان `guardPost`
 * يردّ كلَّ بتٍّ بـ`csrf_failed` — والزرُّ ظاهرٌ ولا يعمل. والحقنُ هنا لا
 * في `reportScreen` لأنّ الرمزَ من الجلسة والعرضُ لا يعرفها.
 */
reports.get('/panel/report', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return loginResponse(c.env, c.req.raw)
  if (session.record.pending) return c.redirect('/panel/2fa', 303)

  const reports = await listReports(c.env.DB, activeOrg(session.record))
  const settings = await readSettings(c.env.DB)
  const body = reportScreen({
    reports,
    current: reports[0] ?? null,
    suggestions: await openSuggestions(c.env.DB, activeOrg(session.record)),
    promoCapUsd: settings.weeklyPromoCapUsd,
    now: new Date(),
    // ‏ما أُنفق هذا الشهر حتّى اليوم، تحت الرأس (ر-10) — حيٌّ من الدفتر لا من التقرير
    month: await spendThisMonth(c.env.DB, await ownerZone(c.env.DB, c.req.header('Cookie') ?? null), new Date()),
  })

  return page((nonce) =>
    soloPage(`صدى — ${sectionLabel('results')}`, { href: '/panel', label: 'اللوحة' }, injectCsrf(body, session.record.csrf), nonce, '',
      buildCommands({ onPanel: false }), soloNav('results')),
  )
})

/**
 * الخطُّ الزمنيّ للمحفظة (D-212) — **تبويبٌ ثالثٌ في «النتائج»**.
 *
 * المدى والنافذةُ من العنوان بقوائم سماح (`readSpan` و`readShift`)، **فما لا يُعرَف يعود
 * إلى افتراضه** ولا يُسقط الصفحة. والأيّامُ بمنطقة المالك (D-201): يومُ الرياض يبدأ قبل
 * يوم غرينتش بثلاث ساعات، ومنشورُ الثانية فجرًا يقع في يومه لا في أمسه.
 */
reports.get('/panel/timeline', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return loginResponse(c.env, c.req.raw)
  if (session.record.pending) return c.redirect('/panel/2fa', 303)

  const q = new URL(c.req.url).searchParams
  const span = readGanttSpan(q.get('span'))
  const shift = readShift(q.get('at'))
  const zone = await ownerZone(c.env.DB, c.req.header('Cookie') ?? null)
  const now = new Date()
  const win = windowOf(now, zone, span, shift)
  const loaded = await loadGantt(c.env.DB, activeOrg(session.record), win.from, win.to)
  const body = timelineScreen({
    chart: gantt(loaded, win, now, zone),
    span, shift, capped: loaded.capped, cap: GANTT_CAP, zone, now,
    flash: await takeFlash(c.env, c.req.raw),
  })

  return page((nonce) =>
    soloPage(timelineTitle(), { href: '/panel', label: 'اللوحة' }, injectCsrf(body, session.record.csrf), nonce, TIMELINE_SCRIPT,
      buildCommands({ onPanel: false }), soloNav('results')),
  )
})

/**
 * رحلةُ منشور (D-104) — `‎/panel/journey/:id`.
 *
 * **ومعرّفٌ لا وجودَ له ‏٤٠٤ لا صفحةٌ فارغة**: صفحةٌ تُفتَح بلا محطّاتٍ
 * تُقرأ عطلا، و‏٤٠٤ تقول ما وقع (D-046).
 */
reports.get('/panel/journey/:id', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return loginResponse(c.env, c.req.raw)
  if (session.record.pending) return c.redirect('/panel/2fa', 303)

  const journey = await readJourney(c.env.DB, activeOrg(session.record), c.req.param('id'))
  if (journey === null) return notFoundResponse(c.req.raw, 'لا منشور بهذا المعرّف')

  const body = journeyBody(journey, new Date())
  return page((nonce) =>
    soloPage('صدى — رحلة منشور', { href: '/panel#posts', label: 'المنشورات' },
      injectCsrf(body, session.record.csrf), nonce, '',
      buildCommands({ onPanel: false }), soloNav('posts')),
  )
})

/** تقريرُ أسبوعٍ بعينه — بمفتاحه، وهو أوّلُ يومٍ فيه. */
reports.get('/panel/report/:week', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return loginResponse(c.env, c.req.raw)
  if (session.record.pending) return c.redirect('/panel/2fa', 303)

  const stored = await readReport(c.env.DB, activeOrg(session.record), c.req.param('week'))
  if (stored === null) return notFoundResponse(c.req.raw, 'لا تقرير لهذا الأسبوع')

  const settings = await readSettings(c.env.DB)
  const body = reportScreen({
    reports: await listReports(c.env.DB, activeOrg(session.record)),
    current: stored,
    suggestions: await openSuggestions(c.env.DB, activeOrg(session.record)),
    promoCapUsd: settings.weeklyPromoCapUsd,
    now: new Date(),
    month: await spendThisMonth(c.env.DB, await ownerZone(c.env.DB, c.req.header('Cookie') ?? null), new Date()),
  })

  return page((nonce) =>
    soloPage(`صدى — تقرير ${stored.id}`, { href: '/panel/report', label: sectionLabel('results') }, injectCsrf(body, session.record.csrf), nonce, '',
      buildCommands({ onPanel: false }), soloNav('results')),
  )
})

/**
 * بتُّ توصيةِ ترويج — **تسجيلُ رأيٍ لا أمرُ إنفاق.**
 *
 * «أقبل» تعني: هذا يستحقّ ترويجا. **ولا يقع منه إنفاق** — لا عميلَ
 * إعلاناتٍ في المستودع ولا مفتاحَ يُطلَب (D-006). وما يفعله المالكُ
 * بالمبلغ يفعله في لوحة المنصّة بيده.
 */
reports.post('/panel/report/promote', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied

  const postId = String(gate.form.get('post_id') ?? '')
  const raw = String(gate.form.get('decision') ?? '')
  if (raw !== 'accepted' && raw !== 'rejected') {
    return c.json({ error: 'unknown_decision' }, 400)
  }
  if (postId === '') return c.json({ error: 'missing_post' }, 400)

  const changed = await decidePromotion(c.env.DB, activeOrg(gate.session.record), postId, raw)
  await record(
    c.env.DB,
    { actor: 'panel', action: 'promotion.decide', target: postId, detail: raw },
    c.req.raw,
  )

  await setFlash(c.env, c.req.raw, changed
    ? {
        kind: raw === 'accepted' ? 'warn' : 'ok',
        text: raw === 'accepted'
          ? 'سُجّل قبولُك. ولم يُنفَق شيء — الترويج يقع في لوحة المنصّة بيدك.'
          : 'سُجّل رفضُك، ولا يُقترَح هذا المنشور ثانيةً.',
      }
    : { kind: 'warn', text: 'لا توصية تنتظر لهذا المنشور — أو بُتّ فيها قبلا.' })

  return new Response(null, { status: 303, headers: { Location: '/panel/report' } })
})

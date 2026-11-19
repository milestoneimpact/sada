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
import { successThisMonth } from '../../lib/report/success'
import { decide as decidePromotion, openSuggestions } from '../../lib/report/promote'
import { reportScreen } from '../ui/reportView'
import { ownerRows, TASKS_LATER, TASKS_PAGE } from '../../lib/owner'
import { gatesScreen, laterScreen, laterTitle, tasksScreen } from '../ui/tasksView'
import { vitalsSummary } from '../../lib/vitals'
import { rejectsLately } from '../../lib/forms'
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

  const org = activeOrg(session.record)
  const [gateFacts, facts, vitals, rejects] = await Promise.all([
    readGateFacts(c.env.DB, org),
    ownerFacts(c, org),
    // ‏ما قِيس من المتصفّح لا ما قُدّر (D-299) — وقراءةٌ تفشل لا تُسقط الصفحة
    vitalsSummary(c.env.DB, org).catch(() => null),
    // ‏وإرسالاتٌ رُدّت لعيبٍ في المُدخَل (D-302)
    rejectsLately(c.env.DB, org).catch(() => 0),
  ])
  const body = tasksScreen({
    rows: ownerRows(facts),
    // ‏والبوّاباتُ في صفحتها (`/panel/gates`)، وهنا سطرُها يقول المرحلة: فالحقائقُ تُقرأ لها وحدَها
    phase: currentPhase(gatesOf(gateFacts)),
    env: c.env.SADA_ENV,
    vitals,
    rejects,
  })

  return page((nonce) =>
    soloPage(`صدى — ${sectionLabel('tasks')}`, { href: '/panel', label: 'اللوحة', at: '/panel/tasks' },
      injectCsrf(body, session.record.csrf), nonce, '',
      buildCommands({ onPanel: false }), soloNav('tasks')),
  )
})

/**
 * ‏شاشةُ «تفتح قدرة» (متابعة D-324) — مهامُّ القدرة خرجت من «ما عليك» لوزنها (‏14.0KB مضغوطًا من ‏14KB، والمهمّةُ نحو ‏0.19KB،
 * ‏ومهامُّ قرارين قادمة). **وهي جزءٌ منها في كلّ شيءٍ إلّا الصفحة**، كما خرجت البوّابات: الجلسةُ نفسُها، والدورُ نفسُه (`requiredRole`
 * ‏يُبقي كلَّ ما تحت `/panel/tasks/` للمدير)، والرافدةُ على «ما عليك»، والعودةُ إليها. والحقائقُ نفسُها، فالعددُ في سطرها هناك
 * ‏عددُها هنا.
 */
// ‏والمسارُ نصًّا لا `TASKS_LATER`: `audit_links` يقرأ المسجَّلَ من `x.get('…')` حرفًا
reports.get('/panel/tasks/later', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return loginResponse(c.env, c.req.raw)

  const facts = await ownerFacts(c, activeOrg(session.record))
  const body = laterScreen({ rows: ownerRows(facts), env: c.env.SADA_ENV })

  return page((nonce) =>
    // ‏و`at` يرسم شريطَ عائلتها (D-342): «المهامّ · تفتح قدرة · البوّابات · المساعدة»، وهي الحاليّة
    soloPage(laterTitle(), { href: TASKS_PAGE, label: sectionLabel('tasks'), at: TASKS_LATER },
      injectCsrf(body, session.record.csrf), nonce, '',
      buildCommands({ onPanel: false }), soloNav('tasks')),
  )
})

/**
 * ‏شاشةُ «بوّابات المراحل» (دمجُ D-318 مع D-324) — كانت طيّةً في آخر «ما عليك»، ومهامُّ القرارين رفعت تلك فوق سقف وزنها
 * ‏(`audit_size`: يُقسَم ما تجاوز ولا يُرفع السقف). **فهي جزءٌ منها في كلّ شيءٍ إلّا الصفحة**: الجلسةُ نفسُها، والدورُ نفسُه
 * ‏(`requiredRole` يسمّي البابين معًا)، والرافدةُ على «ما عليك»، والعودةُ إليها.
 */
reports.get('/panel/gates', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return loginResponse(c.env, c.req.raw)

  const gates = gatesOf(await readGateFacts(c.env.DB, activeOrg(session.record)))
  const body = gatesScreen({ gates, phase: currentPhase(gates) })

  return page((nonce) =>
    soloPage('صدى — بوّابات المراحل', { href: '/panel/tasks', label: sectionLabel('tasks'), at: '/panel/gates' },
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

  const reports = await listReports(c.env.DB, activeOrg(session.record))
  const settings = await readSettings(c.env.DB)
  const zone = await ownerZone(c.env.DB, c.req.header('Cookie') ?? null)
  const body = reportScreen({
    reports,
    current: reports[0] ?? null,
    suggestions: await openSuggestions(c.env.DB, activeOrg(session.record)),
    promoCapUsd: settings.weeklyPromoCapUsd,
    now: new Date(),
    // ‏ما أُنفق هذا الشهر حتّى اليوم، تحت الرأس (ر-10) — حيٌّ من الدفتر لا من التقرير
    month: await spendThisMonth(c.env.DB, zone, new Date()),
    // ‏ومقاييسُ النجاح هذا الشهر (D-324) — والقراءةُ تفشل فتسكت البطاقةُ ولا تسقط الصفحة
    ...(await successOrNothing(c.env.DB, activeOrg(session.record), zone)),
  })

  return page((nonce) =>
    soloPage(`صدى — ${sectionLabel('results')}`, { href: '/panel', label: 'اللوحة', at: '/panel/report' }, injectCsrf(body, session.record.csrf), nonce, '',
      buildCommands({ onPanel: false }), soloNav('results')),
  )
})

/**
 * **الخطُّ الزمنيّ للمحفظة صار التيّار** (D-388): كانت أشرطةُ غانت (D-212) صفحةً ثامنةً يظهر فيها المنشور، والتيّارُ (D-386)
 * يقول الشيءَ نفسَه عمودًا واحدًا بفعلٍ على كلّ بطاقة. فالمسارُ يبقى للروابط المحفوظة ويحوّل دائمًا (301) إلى التيّار.
 */
reports.get('/panel/timeline', (c) => c.redirect('/panel/feed', 301))

/**
 * رحلةُ منشور (D-104) — `‎/panel/journey/:id`.
 *
 * **ومعرّفٌ لا وجودَ له ‏٤٠٤ لا صفحةٌ فارغة**: صفحةٌ تُفتَح بلا محطّاتٍ
 * تُقرأ عطلا، و‏٤٠٤ تقول ما وقع (D-046).
 */
reports.get('/panel/journey/:id', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return loginResponse(c.env, c.req.raw)

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

  const stored = await readReport(c.env.DB, activeOrg(session.record), c.req.param('week'))
  if (stored === null) return notFoundResponse(c.req.raw, 'لا تقرير لهذا الأسبوع')

  const settings = await readSettings(c.env.DB)
  const zone = await ownerZone(c.env.DB, c.req.header('Cookie') ?? null)
  const body = reportScreen({
    reports: await listReports(c.env.DB, activeOrg(session.record)),
    current: stored,
    suggestions: await openSuggestions(c.env.DB, activeOrg(session.record)),
    promoCapUsd: settings.weeklyPromoCapUsd,
    now: new Date(),
    month: await spendThisMonth(c.env.DB, zone, new Date()),
    ...(await successOrNothing(c.env.DB, activeOrg(session.record), zone)),
  })

  return page((nonce) =>
    soloPage(`صدى — تقرير ${stored.id}`, { href: '/panel/report', label: sectionLabel('results') }, injectCsrf(body, session.record.csrf), nonce, '',
      buildCommands({ onPanel: false }), soloNav('results')),
  )
})

/** مقاييسُ النجاح هذا الشهر (D-324) — أو لا شيء إن فشلت القراءة: البطاقةُ تسكت والتقريرُ يُقرأ. */
async function successOrNothing(db: Env['DB'], org: string, zone: string | null): Promise<{ success?: Awaited<ReturnType<typeof successThisMonth>> }> {
  try {
    return { success: await successThisMonth(db, org, zone, new Date()) }
  } catch (error) {
    console.warn({ job: 'success-metrics', failed: String(error) })
    return {}
  }
}

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

/**
 * مسارات اللوحة — الخطّة الشهريّة واستيرادُها من ملفّ.
 *
 * جزءٌ من `panel.ts` قُسم على أقسامه (D-278) بلا تغييرٍ في سلوك.
 */
import { statusBadge } from '../ui/components/badge'
import { awaitingCount, awaitingRevision } from '../../lib/package/revision'
import { sourceNames } from './client'
import { PLAN_DOC_SCRIPT, planDocScreen } from '../ui/planDocView'
import { fillGaps, seatPlan, previewSeat, seatedPosts, toTable } from '../../lib/plan/seat'
import { PLAN_SEAT_SCRIPT, planSeatScreen } from '../ui/planSeatView'
import { planPreviewScreen } from '../ui/planPreviewView'
import { versionsScreen } from '../ui/planVersionsView'
import { diffVersions, readPlanVersions, type PlanVersion } from '../../lib/plan/versions'
import { widenPlan } from '../../lib/plan/widen'
import { rulesSection, type PlanRules } from '../../lib/plan/guidelines'
import type { PlanImageStyle } from '../../lib/plan/prompt'
import { generateForPost } from '../../lib/image/job'
import { autoImageRoom } from '../../lib/image/auto'
import { reviewModel, addItem, delayItem, dropItem, moveItem, pinPlan, settlePlan, undoItem } from '../../lib/plan/review'
import { PLAN_REVIEW_SCRIPT, planReviewScreen, planSheet } from '../ui/planReviewView'
import { postEditScreen } from '../ui/postEditView'
import { COUNT_SCRIPT } from '../ui/scripts'
import { vtName } from '../ui/parts'
import { copyToDraft, holdPost, postHistory, restoreEdit, revisePost, type ReviseResult } from '../../lib/plan/revise'
import { stageOf } from '../../lib/plan/rights'
import { localToUtc } from '../../lib/time/local'
import { checksStrip, rulesScreen } from '../ui/checksView'
import { blockedKeys, hhmm, parseRulesForm, planChecks, planFix, RULE_LABEL, type RuleId } from '../../lib/plan/checks'
import { readRules, reviewCheckInput, writeRules } from '../../lib/plan/checkStore'
import { itemKey } from '../../lib/plan/review'
import { dayLabel, localParts } from '../../lib/time/zone'
import { approveMany, decide, saveText } from '../../lib/draft/store'
import { notice, toastRegion } from '../ui/components/toast'
import { escapeHtml } from '../ui/escape'
import { DRAFT_IMAGE_MODEL, FINAL_IMAGE_MODEL, freeImagesLeft, imageNeurons, neuronsUsedToday } from '../../lib/ai/imagePricing'
import { PAGE_PLATFORM } from '../../lib/linkedinPage'
import { Hono, type Context } from 'hono'
import type { Env } from '../../env'
import { readDriveMedia } from '../../lib/drive/media'
import { currentPicks, readPackageMedia, readSource } from '../../lib/package/sync'
import {
  applyPlan, DEFAULT_ZONE, MAX_PLAN_BYTES, PLAN_TEMPLATE, readPlan, type PlanFacts,
} from '../../lib/plan/import'
import { mediaLine, planImportExpired, planImportScreen } from '../ui/planImportView'
import { PLAN_NEW_SCRIPT, planNewScreen } from '../ui/planNewView'
import { taskReadyAlone } from './home'
import { allows, SPEND_LOCKED, SPEND_ROLE } from '../../lib/access'
import { seatedIdeaPosts } from '../../lib/plan/seatedWrite'
import { counted, NOUNS, money } from '../../lib/format'
import { platformLabel } from '../../lib/oauth/providers'
import { estimateLine, estimatePlan, unitCosts } from '../../lib/estimate'
import { buildEstimateLine, estimateBuild } from '../../lib/buildCost'
import { planBuildCalls } from '../../lib/buildCostInputs'
import { readBrief } from '../../lib/brief'
import { IDEA_MAX } from '../../lib/draft/job'
import { asImageChoice, asImageStyle, asSpan, asTimes, imageFor, weekStart, CLIP_CHANNELS, isPlanPlatform, type Cadence, type PlanChoices, type PlanPlatform } from '../../lib/plan/prompt'
import { sayDecided, sayPlanned, sayStarted, sayUnlinked } from '../../lib/plan/say'
import { listUploads } from '../../lib/media/uploads'
import { soloNav } from '../ui/rail'
import { buildCommands } from '../ui/command'
import { panelHref } from '../../lib/nav/panes'
import { approvePlan, ideaOf, latestPlan, planForId, planForPeriod, planSpan, planWindows } from '../../lib/plan/job'
import { approvePlanVersion, reopenVersion, unscheduleMonth } from '../../lib/plan/approve'
import { attachToPost, listLibrary } from '../../lib/library'
import { rejectMedia } from '../../lib/image/job'
import { approvalLine, isPeriod, localDay, monthJourney, nextPeriod, prevPeriod } from '../../lib/plan/month'
import { calendarItems, itemsPerDay, monthFacts, readDiff, readImports } from '../../lib/plan/monthStore'
import { bulkPick, parseCalQuery, spanPeriods } from '../../lib/plan/calendar'
import { PLATFORM_IDS } from '../../lib/oauth/providers'
import { importsScreen, monthJourneyCard, monthScreen } from '../ui/planMonthView'
import { d1BuildStore, readBuild, running, shownBuild, writeBuild, type PlanBuild } from '../../lib/plan/build'
import { PLAN_BUILD_SCRIPT, planBuildScreen, planningLine } from '../ui/planBuildView'
import type { PlanDeps } from '../../lib/plan/job'
import { readSettings } from '../../lib/settings'
import { activeOrg } from '../../lib/tenancy'
import { loadSession } from '../../lib/session'
import { CHANNELS, listAccounts } from '../../lib/channels'
import { PLAN_BASE, readPlanFlags } from '../../lib/plan/platforms'
import { ownerZone, storedZone } from '../../lib/time/ownerZone'
import { addDays, nextSunday, renderTemplate, shortTemplate, templateReadme } from '../../lib/plan/template'
import { addPlanItem, editPlanItem, removePlanItem } from '../../lib/plan/edit'
import { approvePlanDrafts, schedulePlan } from '../../lib/plan/schedule'
import { activeLinks, createLink, revokeLinks, verdictsFor } from '../../lib/clientReview'
import { injectCsrf, soloPage } from '../ui/shell'
import { record } from '../../lib/audit'
import { type PanelFlash } from '../panelView'
import { deciderOf, finalizeLater, page, loginResponse, setFlash, takeFlash, guardPost, reachNow, back, toFeed, POST_ID } from './shared'
import type { PlanSchedule } from '../../lib/plan/schedule'

export const plan = new Hono<{ Bindings: Env }>()

// ── الخطّة الأسبوعيّة ─────────────────────────────────────────────────

/**
 * توليدُ خطّة الأسبوع — نداءٌ واحدٌ مدفوع، بحارسه.
 *
 * **ولا يكتب منشورا ولا يجدول.** يقترح، والكتابةُ زرٌّ لكلّ بند يمرّ
 * بـ `/panel/drafts/write` نفسه — لا طريقا ثانيا حول الحارس.
 */
plan.post('/panel/plan/generate', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const org = activeOrg(gate.session.record)
  const f = gate.form

  /*
   * ‏اختياراتُ المالك (D-282): المدى من أربعة، ويومُ البداية، والقنواتُ **من حساباته المربوطة لا غير**،
   * ‏وإيقاعُ كلٍّ منها (وافتراضُه إيقاعُ الموجز)، والمصادرُ أو «الكلّ»، والأفكارُ سطرًا سطرًا حتّى عشرين،
   * ‏والصورةُ مع كلّ منشور. وما لم يُرسَل يأخذ افتراضَه فلا يُكسر نموذجٌ قديم يرسل المدى وحده.
   */
  const span = asSpan(f.get('span'))
  const linked = new Set((await listAccounts(c.env.DB, org)).filter((a) => a.status === 'active').map((a) => a.platform as string))
  const brief = await readBrief(c.env.DB, org)
  const asked = f.getAll('channel').map(String).filter((x) => x !== '')
  const unknown = asked.filter((x) => !isPlanPlatform(x))
  const unlinked = asked.filter((x) => isPlanPlatform(x) && !linked.has(x))
  if (unknown.length > 0 || unlinked.length > 0) {
    await setFlash(c.env, c.req.raw, {
      kind: 'bad',
      text: unknown.length > 0
        ? 'قناةٌ لا ينشر لها صدى — اختر من القائمة.'
        : sayUnlinked(unlinked.map((p) => platformLabel(p as never))),
    })
    return back('posts')
  }
  // ‏بلا اختيار: قنواتُ الموجز، ثمّ ما رُبط، ثمّ افتراضُ المخطِّط (القناتان النصّيّتان)
  const channels: PlanPlatform[] = asked.length > 0
    ? asked.filter(isPlanPlatform)
    : brief.channels.length > 0
      ? brief.channels.filter(isPlanPlatform)
      : [...linked].filter(isPlanPlatform)
  const cadence: Partial<Record<PlanPlatform, number>> = {}
  // ‏ولكلّ منصّةٍ صورتُها وأوقاتُها (D-329): «رسمٌ فنّيٌّ لـ LinkedIn وإنفوجرافيك لـ X»، ووقتٌ لهذه ووقتٌ لتلك في اليوم نفسِه
  const imageStyles: Partial<Record<PlanPlatform, NonNullable<ReturnType<typeof asImageChoice>>>> = {}
  const times: Partial<Record<PlanPlatform, readonly string[]>> = {}
  for (const ch of channels) {
    const image = asImageChoice(f.get('image_' + ch))
    if (image !== null) imageStyles[ch] = image
    const at = asTimes(f.getAll('time_' + ch).map(String))
    if (at.length > 0) times[ch] = at
    // ‏«مخصّص» في شاشة الخطّة الجديدة (D-283) يحمل رقمَه في حقلٍ بجانبه
    const picked = f.get('cadence_' + ch)
    const raw = picked === 'custom' ? f.get('cadence_custom_' + ch) : picked
    const n = raw === null ? brief.perWeek : Math.floor(Number(raw))
    cadence[ch] = Number.isFinite(n) ? Math.min(28, Math.max(0, n)) : brief.perWeek
  }
  const picked = f.getAll('source').map(String).filter((x) => x !== '')
  const sources: readonly string[] | 'all' = picked.length === 0 || picked.includes('all') ? 'all' : picked
  const ideas = String(f.get('ideas') ?? '').split('\n').map((l) => l.trim()).filter((l) => l !== '').slice(0, 20).map((l) => l.slice(0, IDEA_MAX))
  // ‏نوعُ الصورة من المعالج (D-285): «بلا صورة» أو إنفوجرافيك أو رسمٌ فنّيّ — ونموذجٌ قديمٌ يرسل `auto_image` وحده كما كان
  const styleRaw = f.get('image_style')
  const autoImage = styleRaw !== null
    ? styleRaw !== 'none'
    : f.has('auto_image') ? f.getAll('auto_image').map(String).includes('1') : undefined
  const imageStyle = asImageStyle(styleRaw)
  const startRaw = String(f.get('start') ?? '')

  /*
   * ‏**بناءٌ في الخلفيّة بحالٍ يُرى** (D-332): من المعالج («حلّل وابنِ») تُكتب حالُ البناء وتُرسَل رسالةٌ إلى طابور التوليد وتُفتح
   * ‏شاشتُه — فلا ينتظر المالكُ صفحةً بيضاء، ولا يُقطع النداءُ بمهلة الصفحة. وبناءٌ يجري يفتح شاشتَه ولا يبدأ نداءً مدفوعًا ثانيًا.
   * ‏وبلا طابور (بيئةٌ لم يُربط فيها) أو من زرٍّ قديم: الطريقُ المباشرُ كما كان.
   */
  const queue = c.env.GENERATE_QUEUE as Env['GENERATE_QUEUE'] | undefined
  if (f.get('then') === 'review' && queue !== undefined && !(await readSettings(c.env.DB)).paused) {
    if (running(await readBuild(d1BuildStore(c.env.DB), org), new Date())) return c.redirect('/panel/plan/building', 303)
    const params: PlanBuildParams = {
      span, channels, cadence: cadence as Cadence, sources, ideas, imageStyle, imageStyles: imageStyles as PlanChoices['imageStyles'], times,
      zone: await ownerZone(c.env.DB, c.req.header('Cookie') ?? null),
      ...(autoImage === undefined ? {} : { autoImage }),
      ...(/^\d{4}-\d{2}-\d{2}$/.test(startRaw) ? { startDay: startRaw } : {}),
    }
    const build: PlanBuild = { id: crypto.randomUUID(), state: 'queued', done: 0, total: planWindows(/^\d{4}-\d{2}-\d{2}$/.test(startRaw) ? startRaw : weekStart(new Date()), span, cadence as Cadence).length, startedAt: new Date().toISOString() }
    await writeBuild(d1BuildStore(c.env.DB), org, build)
    await queue.sendBatch([{ body: { planBuild: { org, jobId: build.id, params } } }])
    await record(c.env.DB, { actor: 'panel', action: 'plan.generate', target: build.id, detail: 'queued' }, c.req.raw)
    return c.redirect('/panel/plan/building', 303)
  }

  const outcome = await planSpan({
    db: c.env.DB,
    encKey: c.env.TOKEN_ENC_KEY,
    workerSecrets: c.env as unknown as Record<string, string | undefined>,
    org,
    span,
    channels,
    cadence: cadence as Cadence,
    sources,
    ideas,
    ...(autoImage === undefined ? {} : { autoImage }),
    imageStyle,
    imageStyles: imageStyles as PlanChoices['imageStyles'],
    times,
    zone: await ownerZone(c.env.DB, c.req.header('Cookie') ?? null),
    ...(/^\d{4}-\d{2}-\d{2}$/.test(startRaw) ? { startDay: startRaw } : {}),
  })

  // ‏والتقديرُ قبل «ابدأ» (D-257 · D-282): ما سيُكتب وما سيُرسم، بوسيط ما أُنفق فعلًا — فلا إنفاقَ قبل أن يرى المالكُ الرقم
  const wanted = Object.values(imageStyles).some((x) => x !== 'none') || (autoImage ?? (await readSettings(c.env.DB)).autoImage)
  const written = outcome.kind === 'planned' ? await latestPlan(c.env.DB, org) : null
  const estimate = written === null ? '' : estimateLine(estimatePlan({ items: written.plan.items, autoImage: wanted, ...(await unitCosts(c.env.DB, org)) }))

  const flash: PanelFlash =
    outcome.kind === 'planned'
      // ‏الجملةُ في `lib/plan/say.ts`: العددُ وما أُسقط والكلفةُ بنداءاتها والتقديرُ قبل «ابدأ» (D-008 · D-155)
      ? { kind: 'ok', text: sayPlanned(outcome, span, estimate) }
      : outcome.kind === 'not_enough'
        ? { kind: 'warn', text: outcome.reason }
        : outcome.kind === 'blocked'
          ? { kind: 'warn', text: outcome.reason }
          : { kind: 'bad', text: `تعذّر التخطيط: ${outcome.reason}` }

  // السببُ مع النوع (D-157): «failed» وحدَها كانت تُقرأ في السجلّ بلا سبب
  await record(
    c.env.DB,
    {
      actor: 'panel',
      action: 'plan.generate',
      target: null,
      detail: outcome.kind === 'planned' ? outcome.kind : `${outcome.kind}: ${outcome.reason}`.slice(0, 200),
    },
    c.req.raw,
  )
  // ‏ومن المعالج (D-286): «حلّل وابنِ» يكتب المسوّداتِ وصورَها الآن ويفتح المراجعة — التقديرُ قيل قبل الضغط
  if (outcome.kind === 'planned' && f.get('then') === 'review' && !(await readSettings(c.env.DB)).paused) {
    const built = await latestPlan(c.env.DB, org)
    if (built !== null) {
      const started = await enqueuePlan(c.env, org, built)
      await record(c.env.DB, { actor: 'panel', action: 'plan.start', target: built.id, detail: String(started.items) + ' بندًا' }, c.req.raw)
      await setFlash(c.env, c.req.raw, { kind: 'ok', text: flash.text + ' وبدأت كتابةُ المنشورات وصورها — تظهر هنا تباعًا.' })
      return c.redirect('/panel/plan/review', 303)
    }
  }
  await setFlash(c.env, c.req.raw, flash)
  return back('posts')
})

/**
 * **شاشةُ «خطّة جديدة»** (D-283): الفترةُ ثمّ المنصّاتُ المربوطةُ بإيقاعها ثمّ المحتوى اختيارًا، وملخّصٌ وزرٌّ واحد.
 * تُرسل إلى `/panel/plan/generate` نفسِه. وما تقرؤه هنا ما يقرؤه قسمُ الخطّة: الحساباتُ النشطة، والموجز،
 * والمصادرُ المحلَّلة، ووسيطُ الكلفة، وجاهزيّةُ مزوّد الخطّة.
 */
plan.get('/panel/plan/new', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return loginResponse(c.env, c.req.raw)
  const org = activeOrg(session.record)
  // ‏حزمةٌ مربوطة: «من حزمتك في GitHub» هو الطريقُ الافتراضيّ (D-377)، و«ابنِ لي خطّة» بطلبه صراحةً
  const pkgSource = await readSource(c.env.DB, org).catch(() => null)
  // ‏والتحويلُ لـ«خطّة جديدة» العاريةِ وحدها: رابطٌ بمعاملات («ابنِ خطّةً منه» من المصادر، أو فكرةٌ، أو `?way=build`) يفتح كما كان
  if (pkgSource !== null && new URL(c.req.url).search === '') return c.redirect('/panel/plan/package', 302)
  const [accounts, brief, analyzed, units, settings, current, ready] = await Promise.all([
    listAccounts(c.env.DB, org),
    readBrief(c.env.DB, org),
    c.env.DB.prepare(`SELECT s.id, s.name, s.kind FROM sources s JOIN content_items i ON i.source_id = s.id AND i.org_id = s.org_id
                       WHERE s.org_id = ? ORDER BY s.last_seen_at DESC LIMIT 60`)
      .bind(org).all<{ id: string; name: string; kind: string }>().catch(() => ({ results: [] as { id: string; name: string; kind: string }[] })),
    unitCosts(c.env.DB, org),
    readSettings(c.env.DB),
    latestPlan(c.env.DB, org),
    taskReadyAlone(c, 'plan'),
  ])
  const used = await neuronsUsedToday(c.env.DB)
  // ‏Instagram وTikTok خلف بوّابة (D-399): ما فُتح علمُه للمنظّمة يدخل الخطّة
  const flagged = await readPlanFlags(c.env.DB, org)
  // ‏وما قيل بعد إضافة مصدرٍ بلا سكربت يُرى هنا حيث عاد المالك (D-327)، لا في أوّل صفحةٍ يفتحها بعدها
  const flash = await takeFlash(c.env, c.req.raw)
  const body = (flash === null ? '' : toastRegion(notice({ tone: flash.kind, html: escapeHtml(flash.text), alert: flash.kind === 'bad' }))) + planNewScreen({
    now: new Date(),
    linked: [...new Set(accounts.filter((a) => a.status === 'active').map((a) => a.platform as string))],
    perWeek: brief.perWeek,
    sources: analyzed.results,
    perDraft: units.perDraft,
    perImage: units.perImage,
    perInfographic: units.perInfographic,
    // ‏ما بقي من حصّة Cloudflare اليوم بنموذجَي المستويين (D-285) — والحصّةُ واحدةٌ يقتسمانها
    freeLeft: {
      draft: freeImagesLeft(imageNeurons(DRAFT_IMAGE_MODEL, 1024, 1024) ?? 0, used),
      final: freeImagesLeft(imageNeurons(FINAL_IMAGE_MODEL, 1344, 704) ?? 0, used),
    },
    // ‏والصورةُ مع كلّ منشورٍ افتراضُ المعالج (D-327 بقرار المالك): إنفوجرافيك رسمُه مجّانيّ، و«بلا صورة» اختيارٌ يُرى
    autoImage: true,
    ready,
    replacing: current !== null,
    // ‏ما أُضيف للتوّ بلا سكربت يُحدَّد (D-284) — ومن المحلَّل وحدَه، لا معرّفًا يكتبه أحد
    picked: analyzed.results.some((s) => s.id === c.req.query('picked')) ? c.req.query('picked') ?? null : null,
    // ‏إضافةُ مصدرٍ تحليلٌ مدفوع: للمدير فأعلى كزرّ «حلّل» (D-272)
    canAdd: allows(session.record.role ?? 'owner', 'admin'),
    hasPackage: pkgSource !== null,
    flagged,
  })
  return page((nonce) =>
    soloPage('صدى — خطّة جديدة', { href: panelHref('posts'), label: 'المنشورات', at: '/panel/plan/new' }, injectCsrf(body, session.record.csrf), nonce,
      PLAN_NEW_SCRIPT, buildCommands({ onPanel: false }), soloNav('plan')),
  )
})

/**
 * **رابطُ العميل** (D-353): يُنشأ لأحدث خطّة، ويُعرض في الرسالة مرّةً واحدة — القاعدةُ تحفظ بصمتَه لا رمزَه، فلا يُستعاد.
 * ومن لا يعتمد (المحرّر والقارئ) لا يفتح للعميل باب رأيٍ في خطّة: الحارسُ في `lib/access.ts` (الناشرُ فما فوق).
 */
plan.post('/panel/plan/share', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const org = activeOrg(gate.session.record)
  const current = await latestPlan(c.env.DB, org)
  if (current === null || current.id !== String(gate.form.get('id') ?? '')) {
    await setFlash(c.env, c.req.raw, { kind: 'bad', text: 'صارت للخطّة نسخةٌ أحدث — افتح المراجعة من جديد.' })
    return reviewBack()
  }
  const link = await createLink(c.env.DB, org, current.id, gate.session.record.email ?? 'owner')
  await record(c.env.DB, { actor: 'panel', action: 'review.share', target: current.id, detail: link.expiresAt.slice(0, 10) }, c.req.raw)
  const url = (c.env.PUBLIC_BASE_URL ?? new URL(c.req.url).origin) + '/r/' + link.token
  await setFlash(c.env, c.req.raw, { kind: 'ok', text: 'رابطُ العميل — انسخه الآن، فلا يُعرض مرّةً أخرى: ' + url })
  return reviewBack()
})

plan.post('/panel/plan/share/revoke', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const org = activeOrg(gate.session.record)
  const id = String(gate.form.get('id') ?? '')
  const n = await revokeLinks(c.env.DB, org, id)
  await record(c.env.DB, { actor: 'panel', action: 'review.revoke', target: id, detail: String(n) }, c.req.raw)
  await setFlash(c.env, c.req.raw, { kind: 'ok', text: n === 0 ? 'لا رابطَ نافذ.' : 'أُلغيت روابطُ العميل، ولم يعد أيٌّ منها يفتح.' })
  return reviewBack()
})

function reviewBack(): Response {
  return new Response(null, { status: 303, headers: { Location: '/panel/plan/review' } })
}

/** اعتمادُ منطق الخطّة — علامةٌ لا تنفيذ. */
plan.post('/panel/plan/approve', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const id = String(gate.form.get('id') ?? '')

  const done = await approvePlan(c.env.DB, id, activeOrg(gate.session.record))
  await record(
    c.env.DB,
    { actor: 'panel', action: 'plan.approve', target: id, detail: done ? 'approved' : 'refused' },
    c.req.raw,
  )
  await setFlash(c.env, c.req.raw, {
    kind: done ? 'ok' : 'bad',
    text: done
      ? 'اعتُمد منطق الأسبوع. ولا يُكتب منه حرف حتّى تضغط «اكتب منه» لبند.'
      : 'لا خطّة بهذه الحال.',
  })
  return back('posts')
})

/**
 * **«ابدأ الخطّة»** (D-258 · AGENCY-PLAN و-٥): تُعتمَد الخطّة إن كانت مسوّدة، ويُرسَل كلُّ بندٍ إلى طابور التوليد
 * فيُكتب بـ `draftPost` نفسِها (حرّاسُها وسقوفُها ومفتاحُها) وتُرسَم صورتُه إن رُفعت الصورةُ الآليّة.
 *
 * **ولا يُنشر شيء**: المسوّداتُ تظهر في «تنتظر قرارك» وتُعتمَد واحدةً واحدةً كما كانت. والبندُ المكرّرُ (المصدرُ والمنصّةُ نفسُهما)
 * يُرسَل مرّة: مفتاحُ المسوّدة واحدٌ لهما، والثانيةُ «كُتبت من قبل». والإيقافُ يُقال هنا قبل أن يُرسَل شيء.
 */
/**
 * **«ابدأ»: كلُّ بندٍ مرّةً إلى الطابور** — مسوّدتُه وصورتُه باختيار الخطّة (D-258 · D-282 · D-285). مشتركٌ بين زرّ «ابدأ»
 * و«حلّل وابنِ» في المعالج (D-286)، فالطريقُ واحدٌ بحرّاسه.
 */
/** رسالةُ كتابة بندٍ واحد — بصورته باختيار منصّته (D-329). مشتركةٌ بين «ابدأ» و«أضف منشورًا» (D-336). */
function draftMessage(plan: NonNullable<Awaited<ReturnType<typeof latestPlan>>>, i: import('../../lib/plan/prompt').PlanItem, org: string) {
  const legacy = plan.choices.channels.length === 0
  const idea = ideaOf(i.sourceId, plan.choices)
  const image = imageFor(plan.choices, i.platform)
  return {
    body: { draft: {
      sourceId: i.sourceId, platform: i.platform, org, planId: plan.id,
      ...(i.asset === undefined ? {} : { asset: i.asset }),
      ...(idea === null ? {} : { idea }),
      ...(rulesSection(plan.choices.rules, i.platform) === '' ? {} : { rules: rulesSection(plan.choices.rules, i.platform) }),
      ...(legacy ? {} : { autoImage: image !== 'none' }),
      imageStyle: image === 'none' ? plan.choices.imageStyle : image,
      ...(i.id === undefined ? {} : { itemId: i.id, angle: i.angle }),
      ...(i.kind === 'thread' && i.platform === 'x' ? { shape: 'thread' as const } : {}),
    } },
  }
}

export async function enqueuePlan(env: Env, org: string, plan: NonNullable<Awaited<ReturnType<typeof latestPlan>>>): Promise<{ items: number; clips: number; autoImage: boolean | undefined }> {
  if (plan.status === 'draft') await approvePlan(env.DB, plan.id, org)
  const seen = new Set<string>()
  const items = plan.plan.items.filter((i) => {
    // ‏والسلسلةُ بندٌ غيرُ التغريدة من المصدر نفسِه (D-324): مفتاحُ مسوّدتها غيرُ مفتاحها. وبندٌ بمعرّفه (D-329) مسوّدةٌ مستقلّة —
    // ‏إلّا بندَ الفكرة: مفتاحُ مسوّدتها الفكرةُ والمنصّة، فالمكرَّرُ منه «كُتبت من قبل»
    const k = i.id !== undefined && !i.sourceId.startsWith('idea:') ? 'item:' + i.id : `${i.sourceId}:${i.platform}${i.kind === 'thread' ? ':thread' : ''}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  // ‏واختيارُ الصورة من الخطّة (D-282) — وما قبل 0037 بلا اختيارٍ فيُترك للإعداد العامّ. ولكلّ منصّةٍ اختيارُها (D-329)
  const legacy = plan.choices.channels.length === 0
  const autoImage = legacy ? undefined : plan.choices.channels.some((ch) => imageFor(plan.choices, ch) !== 'none')
  if (items.length > 0) {
    await env.GENERATE_QUEUE.sendBatch(items.map((i) => draftMessage(plan, i, org)))
  }
  // ‏بندُ مقطعٍ بلا أصل لا يفشل ولا يُرسَم له شيء: مسوّدتُه تنتظر مقطعًا — يُقال الآن لا عند الجدولة
  const clips = items.filter((i) => CLIP_CHANNELS.has(i.platform) && i.asset === undefined).length
  return { items: items.length, clips, autoImage }
}

/**
 * تعديلُ بندٍ في الخطّة (D-259): يومُه بالسحب في اللوحة، ومنصّتُه وساعتُه بالقائمة. **والسكربتُ يطلب JSON** فتبقى الصفحةُ
 * في مكانها، وبلا سكربتٍ نموذجٌ عاديٌّ يعود إلى اللوحة بإشعاره. والتحقّقُ كلُّه في `editPlanItem`.
 */
plan.post('/panel/plan/item', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const f = gate.form
  const opt = (k: string): string | undefined => { const v = f.get(k); return v === null || v === '' ? undefined : String(v) }
  const result = await editPlanItem(c.env.DB, activeOrg(gate.session.record), String(f.get('id') ?? ''), Number(f.get('index')), {
    ...(opt('day') === undefined ? {} : { day: opt('day')! }),
    ...(opt('platform') === undefined ? {} : { platform: opt('platform')! }),
    ...(opt('time') === undefined ? {} : { time: opt('time')! }),
    // ‏«ولّد أنت» يرسل `asset` فارغًا فيمحو المختار، و«من المكتبة» يرسل مرجعَه (D-260)
    ...(f.has('asset') ? { asset: String(f.get('asset') ?? '') } : {}),
    ...(opt('angle') === undefined ? {} : { angle: opt('angle')! }),
  })
  if ((c.req.header('Accept') ?? '').includes('application/json')) {
    return c.json(result, result.ok ? 200 : 400)
  }
  const said = !f.has('asset') ? 'حُفظ البند.' : f.get('asset') === '' ? 'سيُولَّد محتوى البند.' : 'اختير ملفُّ البند من الأصول.'
  await setFlash(c.env, c.req.raw, result.ok ? { kind: 'ok', text: said } : { kind: 'bad', text: result.reason })
  return c.redirect('/panel/client#board', 303)
})

plan.post('/panel/plan/start', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const org = activeOrg(gate.session.record)
  const id = String(gate.form.get('id') ?? '')
  const plan = await latestPlan(c.env.DB, org)
  const settings = await readSettings(c.env.DB)
  if (plan === null || plan.id !== id) {
    await setFlash(c.env, c.req.raw, { kind: 'bad', text: 'لا خطّة بهذا المعرّف لهذا العميل.' })
    return c.redirect('/panel/client', 303)
  }
  if (settings.paused) {
    await setFlash(c.env, c.req.raw, { kind: 'warn', text: 'صدى موقوفٌ مؤقّتًا — لا يُكتب شيءٌ حتّى يُرفع الإيقاف.' })
    return c.redirect('/panel/client', 303)
  }
  const { items, clips, autoImage } = await enqueuePlan(c.env, org, plan)
  const images = autoImage ?? settings.autoImage
  await record(c.env.DB, { actor: 'panel', action: 'plan.start', target: plan.id, detail: String(items) + ' بندًا' }, c.req.raw)
  await setFlash(c.env, c.req.raw, { kind: 'ok', text: sayStarted(items, images, clips) })
  return c.redirect('/panel/client', 303)
})

/**
 * **اعتمادُ الخطّة كاملةً** (D-282): كلُّ مسوّدةٍ من هذه الخطّة تنتظر القرار تُعتمَد مرّةً واحدة بالفحص نفسِه الذي يفحص به
 * الاعتمادُ الفرديّ. **ولا يُنشر شيء**: ما اعتُمد ينتظر «جدول المعتمَد» فيُوضع في موعده.
 */
plan.post('/panel/plan/approve-all', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const org = activeOrg(gate.session.record)
  const plan = await latestPlan(c.env.DB, org)
  if (plan === null || plan.id !== String(gate.form.get('id') ?? '')) {
    await setFlash(c.env, c.req.raw, { kind: 'bad', text: 'لا خطّة بهذا المعرّف لهذا العميل.' })
    return c.redirect('/panel/client', 303)
  }
  const done = await approvePlanDrafts(c.env.DB, org, plan.id, deciderOf(gate.session.record.via))
  finalizeLater(c, org, done.ids ?? [])
  // ‏والمعتمَدُ يُجدوَل في موعد بنده الآن (D-327) — لا خطوةَ ثانيةً بعد الاعتماد
  const settled = done.done === 0 ? null : await settleNow(c.env, org, plan, deciderOf(gate.session.record.via))
  await record(c.env.DB, { actor: 'panel', action: 'plan.approve_all', target: plan.id, detail: String(done.done) + ' اعتُمدت · ' + String(done.failed.length) + ' تعثّرت · ' + String(settled === null || settled === 'paused' ? 0 : settled.scheduled) + ' جُدولت' }, c.req.raw)
  await setFlash(c.env, c.req.raw, {
    kind: done.done === 0 && done.failed.length === 0 ? 'warn' : done.failed.length === 0 ? 'ok' : done.done === 0 ? 'bad' : 'warn',
    text: sayDecided('اعتُمد', done.done, [], done.failed) + (settled === null ? '' : ' ' + saySettled(settled)),
  })
  // ‏وبعد اعتماد الخطّة كلِّها من المراجعة تنتقل إلى المتابعة (ابنِ ← راجع ← اعتمد ← تابع)
  // ‏ومن التيّار إليه (D-386)
  if (gate.form.get('back') === 'feed') return feedNext(gate.form, '')
  // ‏ومن المراجعة إلى التيّار حين لا فشل (D-388: لا «متابعة»)، وإلى المراجعة حين تعثّر شيء
  return c.redirect(gate.form.get('back') === 'review' ? (done.failed.length === 0 ? '/panel/feed' : '/panel/plan/review') : '/panel/client', 303)
})

/**
 * **جدولةُ ما اعتُمد من الخطّة** (D-261 · AGENCY-PLAN و-٥): كلُّ مسوّدةٍ معتمَدةٍ من الخطّة إلى يوم بندها وأرجح ساعات منصّتها.
 * والمرفوضُ بسببه يُقال، والإيقافُ يمنع قبل أن يُجدوَل شيء.
 */
plan.post('/panel/plan/schedule', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const org = activeOrg(gate.session.record)
  const plan = await latestPlan(c.env.DB, org)
  if (plan === null || plan.id !== String(gate.form.get('id') ?? '')) {
    await setFlash(c.env, c.req.raw, { kind: 'bad', text: 'لا خطّة بهذا المعرّف لهذا العميل.' })
    return c.redirect('/panel/client', 303)
  }
  if ((await readSettings(c.env.DB)).paused) {
    await setFlash(c.env, c.req.raw, { kind: 'warn', text: 'صدى موقوفٌ مؤقّتًا — لا يُجدوَل شيءٌ حتّى يُرفع الإيقاف.' })
    return c.redirect('/panel/client', 303)
  }
  const done = await schedulePlan(c.env.DB, org, plan, new Date())
  await record(c.env.DB, { actor: 'panel', action: 'plan.schedule', target: plan.id, detail: `${done.scheduled} جُدول · ${done.skipped.length} لم يُجدوَل` }, c.req.raw)
  const first = done.skipped[0]
  await setFlash(c.env, c.req.raw, done.skipped.length === 0
    ? { kind: 'ok', text: `جُدول ${done.scheduled} — كلٌّ في يوم بنده وأرجح ساعات منصّته. شكرًا.` }
    : { kind: done.scheduled > 0 ? 'warn' : 'bad', text: `جُدول ${done.scheduled}، وبقي ${done.skipped.length}: ${first?.reason ?? ''}` })
  return c.redirect('/panel/client', 303)
})

/** إضافةُ بندٍ إلى الخطّة (D-264) — والتحقّقُ كلُّه في `addPlanItem`. */
plan.post('/panel/plan/item/add', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const f = gate.form
  const result = await addPlanItem(c.env.DB, activeOrg(gate.session.record), String(f.get('id') ?? ''), {
    sourceId: String(f.get('source') ?? ''), platform: String(f.get('platform') ?? ''),
    day: String(f.get('day') ?? ''), time: String(f.get('time') ?? ''), angle: String(f.get('angle') ?? ''),
  })
  await setFlash(c.env, c.req.raw, result.ok ? { kind: 'ok', text: 'أُضيف البند إلى الخطّة.' } : { kind: 'bad', text: result.reason })
  return c.redirect('/panel/client#board', 303)
})

/** حذفُ بندٍ من الخطّة (D-260) — قبل أن يُكتب، والصفحةُ تُعاد بفهارسها الجديدة. */
plan.post('/panel/plan/item/remove', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const result = await removePlanItem(c.env.DB, activeOrg(gate.session.record), String(gate.form.get('id') ?? ''), Number(gate.form.get('index')))
  await setFlash(c.env, c.req.raw, result.ok ? { kind: 'ok', text: 'حُذف البند من الخطّة.' } : { kind: 'bad', text: result.reason })
  return c.redirect('/panel/client#board', 303)
})

// ── خطّتُك من ملفّ (D-181) ────────────────────────────────────────────
//
// ثلاثُ خطوات: «اقرأ» يحفظ الملفَّ في KV ساعتين ويفتح معاينته، والمعاينةُ تقرؤه من
// جديد بحقائق اللحظة (الحساباتُ والمقاطعُ والآن)، و«اعتمد وجدوِل» يقرؤه مرّةً ثالثة
// ثمّ يمرّر سليمَه من حرّاس الجدولة. **فما يُجدوَل ما رآه المالكُ بحاله ساعةَ الضغط**،
// لا صورةً منه خُزّنت قبل أن يسقط حسابٌ أو يمضي موعد.

const PLAN_TTL = 2 * 60 * 60

async function planFacts(env: Env, org: string, cookie: string | null, now: Date): Promise<PlanFacts> {
  const { results: scheduled } = await env.DB
    .prepare(`SELECT platform, text, scheduled_at AS at FROM posts WHERE org_id = ? AND status = 'queued' AND scheduled_at IS NOT NULL LIMIT 1000`)
    .bind(org)
    .all<{ platform: string; text: string; at: string }>()
  return {
    accounts: await listAccounts(env.DB, org),
    uploads: await listUploads(env.DB, org, 200),
    now,
    zone: (await ownerZone(env.DB, cookie)) ?? DEFAULT_ZONE,
    publishable: new Set(CHANNELS.filter((c) => c.stage === 'publish').map((c) => c.id)),
    scheduled,
    // ‏وسائطُ المالك من مجلّد Drive (D-363): المعاينةُ تقول لكلّ صفٍّ وسيطتَه، والاعتمادُ يربطها
    library: await readDriveMedia(env.DB, org),
    // ‏والمعتمدُ من حزمة المحتوى (D-366) يغلبها: مطابقٌ برقم المادّة واللون
    package: currentPicks(await readPackageMedia(env.DB, org)),
  }
}

plan.get('/panel/plan-import/template.csv', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return loginResponse(c.env, c.req.raw)
  return new Response(PLAN_TEMPLATE, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="sada-plan.csv"',
      'Cache-Control': 'no-store',
    },
  })
})

/**
 * ‏**قالبُ الشهر القادم** (D-390): `plans/YYYY-MM.md` (أو `.csv` أو README الصيغة) معبّأً بأيّام الشهر وأوقاتٍ مقترحة بتوقيت
 * ‏المالك — يُدفع إلى المستودع فتقرؤه الحزمة، أو يُرفع في «من ملفّ». و`?p=YYYY-MM` لشهرٍ بعينه.
 */
plan.get('/panel/plan/month-template', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return loginResponse(c.env, c.req.raw)
  const asked = c.req.query('p')
  const zone = await ownerZone(c.env.DB, c.req.header('Cookie') ?? null)
  const today = localDay(localParts(new Date(), zone ?? DEFAULT_ZONE))
  const period = isPeriod(asked) ? asked : nextPeriod(today.slice(0, 7))
  const f = c.req.query('f')
  // ‏قالبا الأسبوع واليوم (D-408): `k=week` من الأحد القادم، و`k=day` للغد — و`d=YYYY-MM-DD` ليومٍ بعينه.
  const k = c.req.query('k')
  const d = c.req.query('d')
  const day = d !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(d) && addDays(d, 0) === d ? d : null
  const short = k === 'week' || k === 'day' ? shortTemplate(k, day ?? (k === 'week' ? nextSunday(today) : addDays(today, 1)), f === 'csv' ? 'csv' : 'md') : null
  const [body, type, name] = f === 'readme' ? [templateReadme(), 'text/markdown; charset=utf-8', 'README.md']
    : short !== null ? [short.body, short.type, short.name]
    : f === 'csv' ? [renderTemplate(period, 'csv'), 'text/csv; charset=utf-8', period + '.csv']
    : [renderTemplate(period, 'md'), 'text/markdown; charset=utf-8', period + '.md']
  return new Response(body, { headers: { 'Content-Type': type, 'Content-Disposition': 'attachment; filename="' + name + '"', 'Cache-Control': 'no-store' } })
})

plan.post('/panel/plan-import', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const file = gate.form.get('file')
  if (!(file instanceof Blob) || file.size === 0) {
    await setFlash(c.env, c.req.raw, { kind: 'bad', text: 'لم يصل ملفّ — اختر ملفّ CSV ثمّ «اقرأ الخطّة».' })
    return back('plan-import')
  }
  if (file.size > MAX_PLAN_BYTES) {
    await setFlash(c.env, c.req.raw, { kind: 'bad', text: `الملفّ أكبر من ${MAX_PLAN_BYTES / 1024}KB — قسّمه ملفّين.` })
    return back('plan-import')
  }
  /*
   * **UTF-8 أو لا شيء** (D-182). «CSV (Comma delimited)» في Excel العربيّ يحفظ بـ Windows-1256،
   * و`file.text()` يقلب كلَّ حرفٍ عربيٍّ إلى U+FFFD بصمت — فيُعرض الصفُّ «جاهزًا» ونصُّه علاماتُ
   * استفهام. ففكٌّ صارمٌ يردّ الملفَّ باسم الصيغة التي تُصلحه.
   */
  let csv: string
  try {
    csv = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(await file.arrayBuffer())
  } catch {
    await setFlash(c.env, c.req.raw, {
      kind: 'bad',
      text: 'الملفّ ليس UTF-8 — احفظه من Excel بصيغة «CSV UTF-8 (Comma delimited)»، أو نزّله من Google Sheets بصيغة CSV، ثمّ ارفعه.',
    })
    return back('plan-import')
  }
  const id = crypto.randomUUID()
  await c.env.KV.put(`plan-import:${id}`, csv, { expirationTtl: PLAN_TTL })
  await record(c.env.DB, { actor: 'panel', action: 'plan.import.read', target: id, detail: `${file.size} bytes` }, c.req.raw)
  return new Response(null, { status: 303, headers: { Location: `/panel/plan-import/${id}` } })
})

plan.get('/panel/plan-import/:id', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return loginResponse(c.env, c.req.raw)
  const id = c.req.param('id')
  const csv = await c.env.KV.get(`plan-import:${id}`)
  if (csv === null) {
    // ‏معاينةٌ تُركت مفتوحةً أكثرَ من ساعتين ثمّ حُدّثت: صفحةٌ بالرافدة وطريقٍ إلى الرفع، لا نصٌّ خامّ (7.11)
    return page((nonce) =>
      soloPage('صدى — معاينة الخطّة', { href: panelHref('plan-import'), label: 'المنشورات' },
        planImportExpired(), nonce, '', buildCommands({ onPanel: false }), soloNav('plan')), 404)
  }
  const read = readPlan(csv, await planFacts(c.env, activeOrg(session.record), c.req.header('Cookie') ?? null, new Date()))
  const reach = await reachNow(c.env.DB, activeOrg(session.record))
  // ‏«بتوقيت الرياض» حين لا منطقةَ عُرفت: هي ما قرأ به `planFacts` الأيّامَ (D-202)
  const fallback = (await ownerZone(c.env.DB, c.req.header('Cookie') ?? null)) === null
  return page((nonce) =>
    soloPage('صدى — معاينة الخطّة', { href: panelHref('plan-import'), label: 'المنشورات' },
      injectCsrf(planImportScreen(id, read, new Date(), reach, fallback), session.record.csrf), nonce, '',
      buildCommands({ onPanel: false }), soloNav('plan')),
  )
})

plan.post('/panel/plan-import/:id/approve', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const id = c.req.param('id')
  const csv = await c.env.KV.get(`plan-import:${id}`)
  if (csv === null) {
    await setFlash(c.env, c.req.raw, { kind: 'bad', text: 'انتهت مهلة المعاينة — ارفع الملفّ من جديد.' })
    return back('plan-import')
  }
  const now = new Date()
  const read = readPlan(csv, await planFacts(c.env, activeOrg(gate.session.record), c.req.header('Cookie') ?? null, now))
  const by = deciderOf(gate.session.record.via)
  // ‏ما عرضته المعاينةُ جاهزًا وحده (D-182) — والزرُّ وعدَ بعدده
  const shown = new Set(String(gate.form.get('lines') ?? '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 1))
  if (shown.size === 0) {
    await setFlash(c.env, c.req.raw, { kind: 'bad', text: 'هذه المعاينة قديمة — افتحها من جديد ثمّ اعتمد.' })
    return new Response(null, { status: 303, headers: { Location: `/panel/plan-import/${id}` } })
  }
  const outcomes = await applyPlan(c.env.DB, activeOrg(gate.session.record), read.rows, by, now, shown)
  // ‏المعاينةُ استُهلكت: ضغطةٌ ثانيةٌ على «اعتمد» من نافذةٍ قديمةٍ لا تجد ما تعيده
  await c.env.KV.delete(`plan-import:${id}`)
  const scheduled = outcomes.filter((o) => o.result === 'scheduled').length
  const exists = outcomes.filter((o) => o.result === 'exists').length
  const failed = outcomes.filter((o) => o.result === 'failed')
  await record(c.env.DB, {
    actor: 'panel', action: 'plan.import.approve', target: id,
    detail: `scheduled:${scheduled} exists:${exists} failed:${failed.length} blocked:${read.rows.length - outcomes.length}`,
  }, c.req.raw)
  // ‏كلُّ صفٍّ لم يُجدوَل يُسمّى بسطره وسببه — ثلاثةٌ أوّلًا، فالرسالةُ تُقرأ لا تُمرَّر
  const named = (list: readonly { line: number; reason?: string }[]): string =>
    list.slice(0, 3).map((o) => `السطر ${o.line} (${o.reason ?? ''})`).join('، ') + (list.length > 3 ? ' وغيرُها' : '')
  const existing = outcomes.filter((o) => o.result === 'exists')
  const parts = [
    scheduled === 0 ? '' : scheduled === 1 ? 'جُدول منشور واحد في موعده' : `جُدول ${counted(scheduled, NOUNS.post)} كلّ في موعده`,
    exists > 0 ? `ولم يُكرَّر ما كان موجودًا: ${named(existing)}` : '',
    failed.length > 0 ? `وتعذّر ${counted(failed.length, NOUNS.row)}: ${named(failed)}` : '',
  ].filter((p) => p !== '')
  await setFlash(c.env, c.req.raw, {
    kind: scheduled > 0 && failed.length === 0 ? 'ok' : 'bad',
    text: parts.length === 0 ? 'لا صفّ جاهزًا في الملفّ — لم يُجدوَل شيء.' : `${parts.join('، ')}.`,
  })
  return back('posts')
})

// ── مراجعةُ الخطّة وتثبيتُها (D-286) ──────────────────────────────────

/**
 * **«اعتمد» يجدول** (D-327): ما اعتُمد من الخطّة يُوضع في موعد بنده بعد الاعتماد نفسِه (`settlePlan`). والإيقافُ المؤقّتُ يمنع
 * الجدولةَ لا الاعتماد — فيُقال، ويُجدوَل المعتمَدُ عند أوّل اعتمادٍ بعد رفعه.
 */
async function settleNow(env: Env, org: string, plan: NonNullable<Awaited<ReturnType<typeof latestPlan>>>, by: string): Promise<(PlanSchedule & { readonly version: number }) | 'paused'> {
  if ((await readSettings(env.DB)).paused) return 'paused'
  return settlePlan(env.DB, org, plan, by, new Date())
}

/** جملةُ ما جُدول بعد الاعتماد — وما تعذّر بسببه الأوّل. */
function saySettled(settled: PlanSchedule | 'paused'): string {
  if (settled === 'paused') return 'وصدى موقوفٌ مؤقّتًا، فلا يُجدوَل شيءٌ حتّى يُرفع الإيقاف.'
  const first = settled.skipped[0]
  return (settled.scheduled === 0 ? 'ولم يُجدوَل شيء' : settled.scheduled === 1 ? 'وجُدول منشورٌ في موعده' : 'وجُدول ' + String(settled.scheduled) + ' في مواعيدها') +
    (first === undefined ? '.' : '، وتعذّر ' + String(settled.skipped.length) + ': ' + first.reason + '.')
}

plan.get('/panel/plan/review', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return loginResponse(c.env, c.req.raw)
  const org = activeOrg(session.record)
  // ‏`?id=` خطّةٌ بعينها (من شاشة الشهر)، في منظّمتها وما لم تُستبدل؛ وبلا معرّفٍ أحدثُ خطّة
  const asked = c.req.query('id')
  const current = asked !== undefined && asked !== '' ? await planForId(c.env.DB, org, asked) ?? await latestPlan(c.env.DB, org) : await latestPlan(c.env.DB, org)
  if (current === null) return c.redirect('/panel/plan/new', 303)
  const [model, zone, flash, orgRow, accounts, share, verdicts, waiting] = await Promise.all([
    reviewModel(c.env.DB, org, current),
    ownerZone(c.env.DB, c.req.header('Cookie') ?? null),
    takeFlash(c.env, c.req.raw),
    c.env.DB.prepare('SELECT name FROM orgs WHERE id = ?').bind(org).first<{ name: string }>().catch(() => null),
    c.env.DB.prepare("SELECT platform, display_name FROM accounts WHERE org_id = ? AND status = 'active' ORDER BY id")
      .bind(org).all<{ platform: string; display_name: string | null }>().then((r) => r.results).catch(() => []),
    activeLinks(c.env.DB, org, current.id),
    verdictsFor(c.env.DB, org, current.id),
    awaitingCount(c.env.DB, org),
  ])
  // ‏الشارةُ إلى الدفعة التي فيها القرار، لا إلى صفحة الحزمة
  const waitingAt = waiting === 0 ? null : await awaitingRevision(c.env.DB, org)
  const authors: Record<string, string> = {}
  for (const a of accounts) if (authors[a.platform] === undefined && a.display_name !== null) authors[a.platform] = a.display_name
  // ‏شارةُ الحزمة (D-372): تحديثٌ يمسّ معتمدًا أو مجدولًا لا يُطبَّق بصمت — يُقال هنا ويُقرَّر هناك
  const pkgBadge = waiting === 0 ? '' : '<p class="m-0"><a href="' + (waitingAt === null ? '/panel/package' : '/panel/package/changes/' + encodeURIComponent(waitingAt)) + '">' + statusBadge('warn', '!', 'في حزمتك تحديث ينتظرك (' + String(waiting) + ')') + '</a></p>'
  // ‏بوّابةُ الفحص (D-383 · المرحلة ٥): التعارضُ والازدحامُ قبل الاعتماد، والإصلاحُ بضغطة لمن يجدول
  const checked = planChecks(await reviewCheckInput(c.env.DB, org, model, await storedZone(c.env.DB), new Date()), await readRules(c.env.DB, org))
  const strip = checksStrip({ findings: checked, planId: current.id, w: c.req.query('w') ?? '', canFix: allows(session.record.role ?? 'owner', 'publisher') })
  const body = pkgBadge + strip + planReviewScreen(model, zone ?? null, { week: c.req.query('w') ?? null, now: new Date(), orgName: orgRow?.name ?? 'خطّتي', authors, share, verdicts, seatedIdeas: (await seatedIdeaPosts(c.env.DB, org, current.id)).length }) +
    (flash === null ? '' : toastRegion(notice({ tone: flash.kind, html: escapeHtml(flash.text), alert: flash.kind === 'bad' })))
  return page((nonce) =>
    soloPage('صدى — راجع الخطّة', { href: panelHref('posts'), label: 'المنشورات', at: '/panel/plan/review' }, injectCsrf(body, session.record.csrf), nonce,
      PLAN_REVIEW_SCRIPT, buildCommands({ onPanel: false }), soloNav('plan')),
  )
})

/** الأسبوعُ المعروض كما أرسله النموذج — رقمٌ أو «all»، وما سواهما لا يُكتب في العنوان. */
const weekOf = (form: FormData): string => {
  const w = String(form.get('w') ?? '')
  return /^(?:\d{1,2}|all)$/.test(w) ? '?w=' + w : ''
}

/**
 * ‏**ومن التيّار إلى البطاقة التالية التي تنتظر** (D-417): حقلُ `next` يملؤه التيّارُ بترتيب `awaitingIds`، فيُعتمَد
 * ‏أسبوعٌ بلا فقد الموضع. ولا يُكتب في العنوان إلّا معرّفٌ بنمط `vtName` (`toFeed` يفحصه)، وما سواه إلى البطاقة نفسِها.
 */
const feedNext = (form: FormData, id: string): Response => {
  const next = String(form.get('next') ?? '')
  if (POST_ID.test(next)) return toFeed(next)
  // ‏وما ليس على بطاقةٍ (اعتمادُ الكلّ) يعود إلى رأس التيّار كما كان
  return id === '' ? new Response(null, { status: 303, headers: { Location: '/panel/feed' } }) : toFeed(id)
}

/** العودةُ إلى البطاقة نفسِها في أسبوعها، لا إلى رأس الصفحة — ومن التيّار (D-386) إلى بطاقته فيه. */
const toCard = (form: FormData, anchor = true): Response => {
  if (form.get('back') === 'feed') return feedNext(form, String(form.get('post') ?? ''))
  const index = form.get('index')
  return new Response(null, { status: 303, headers: { Location: '/panel/plan/review' + weekOf(form) + (anchor && index !== null && Number.isInteger(Number(index)) ? '#c-' + String(Number(index)) : '') } })
}

/**
 * **«المتابعة» صارت التيّار** (D-388): كانت الشاشةَ الرابعة (ابنِ ← راجع ← اعتمد ← تابع) تجمع ما جُدول ونُشر من الخطّة، والتيّارُ
 * يفعله لكلّ المنشورات بموعده ونتيجته. فالمسارُ يحوّل إليه (303) للروابط المحفوظة.
 */
plan.get('/panel/plan/follow', (c) => c.redirect('/panel/feed', 303))

/**
 * **«ألغِ الخطّة»**: تصير الخطّةُ مستبدَلة (`superseded`) فلا تفتحها «الخطّة» بعدها، وتُرفض مسوّداتُها التي لم تُجدوَل.
 * وما جُدول يبقى في موعده — يُسحب من «المنشورات» بيد المالك إن شاء، فالإلغاءُ لا يسحب نشرًا بلا علمه.
 */
plan.post('/panel/plan/cancel', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const org = activeOrg(gate.session.record)
  const id = String(gate.form.get('id') ?? '')
  const current = await latestPlan(c.env.DB, org)
  if (current === null || current.id !== id) {
    await setFlash(c.env, c.req.raw, { kind: 'bad', text: 'صارت للخطّة نسخةٌ أحدث — افتح المراجعة من جديد.' })
    return c.redirect('/panel/plan/review', 303)
  }
  const [drafts] = await c.env.DB.batch([
    c.env.DB.prepare("UPDATE posts SET status = 'rejected' WHERE org_id = ? AND plan_id = ? AND status IN ('draft', 'approved')").bind(org, id),
    c.env.DB.prepare("UPDATE plans SET status = 'superseded' WHERE org_id = ? AND id = ?").bind(org, id),
  ])
  const rejected = drafts?.meta?.changes ?? 0
  await record(c.env.DB, { actor: 'panel', action: 'plan.cancel', target: id, detail: String(rejected) }, c.req.raw)
  await setFlash(c.env, c.req.raw, { kind: 'ok', text: 'أُلغيت الخطّة، ورُفضت ' + String(rejected) + ' من مسوّداتها. ابنِ خطّةً جديدة متى شئت.' })
  return c.redirect('/panel/plan/new', 303)
})

/**
 * **«أعد كتابة ما تعذّر»** (PL-23): يرسل رسالةَ كتابةٍ لكلّ بندٍ بلا مسوّدةٍ قيل سببُ تعذّره، بضغطة المالك لا وحدَه — نداءٌ مدفوع
 * يُرى زرُّه وعددُه قبل الضغط (D-006 · D-008)، والسقفُ وسقفُ الإنفاق في الكتابة نفسِها كما هما.
 */
plan.post('/panel/plan/review/redraft', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const org = activeOrg(gate.session.record)
  const id = String(gate.form.get('id') ?? '')
  const current = await latestPlan(c.env.DB, org)
  if (current === null || current.id !== id) {
    await setFlash(c.env, c.req.raw, { kind: 'bad', text: 'صارت للخطّة نسخةٌ أحدث — افتح المراجعة من جديد.' })
    return c.redirect('/panel/plan/review', 303)
  }
  const model = await reviewModel(c.env.DB, org, current)
  const items = model.cards.filter((x) => x.post === null && x.failed !== undefined).map((x) => x.item)
  if (items.length > 0) await c.env.GENERATE_QUEUE.sendBatch(items.map((i) => draftMessage(current, i, org)))
  await record(c.env.DB, { actor: 'panel', action: 'plan.review.redraft', target: id, detail: String(items.length) }, c.req.raw)
  await setFlash(c.env, c.req.raw, items.length === 0
    ? { kind: 'ok', text: 'لا بندَ تعذّرت كتابتُه الآن.' }
    : { kind: 'ok', text: 'أُعيدت كتابةُ ' + String(items.length) + ' — تظهر في مكانها حين تُكتب.' })
  return c.redirect('/panel/plan/review', 303)
})

/**
 * **«اكتب المسكَّن من أفكاره»** (D-393): مسوّداتُ «ابنِ كما هي» نصُّها فكرتُها؛ يرسل لكلٍّ رسالةَ كتابةٍ تكتبها في مكانها بقواعد
 * منصّتها من ورقة «الإرشادات» المحفوظة مع الخطّة. نداءٌ مدفوعٌ لكلّ بند، **لمن يعتمد** (`SPEND_PATHS`، D-318) ويُسأل الدورُ هنا
 * أيضًا، والعددُ على الزرّ قبل الضغط (D-006)، والدفترُ والسقوفُ في `writeOnce` (D-008).
 */
plan.post('/panel/plan/review/write-seated', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const org = activeOrg(gate.session.record)
  if (!allows(gate.session.record.role ?? 'owner', SPEND_ROLE)) {
    await setFlash(c.env, c.req.raw, { kind: 'bad', text: SPEND_LOCKED })
    return c.redirect('/panel/plan/review', 303)
  }
  const id = String(gate.form.get('id') ?? '')
  const current = await latestPlan(c.env.DB, org)
  if (current === null || current.id !== id) {
    await setFlash(c.env, c.req.raw, { kind: 'bad', text: 'صارت للخطّة نسخةٌ أحدث — افتح المراجعة من جديد.' })
    return c.redirect('/panel/plan/review', 303)
  }
  const ids = await seatedIdeaPosts(c.env.DB, org, id)
  const msgs = ids.map((postId) => ({ body: { seatedWrite: { org, postId, planId: id } } }))
  for (let at = 0; at < msgs.length; at += 100) await c.env.GENERATE_QUEUE.sendBatch(msgs.slice(at, at + 100))
  await record(c.env.DB, { actor: 'panel', action: 'plan.review.write_seated', target: id, detail: String(ids.length) }, c.req.raw)
  await setFlash(c.env, c.req.raw, ids.length === 0
    ? { kind: 'ok', text: 'لا مسوّدةَ نصُّها فكرتُها في هذه الخطّة.' }
    : { kind: 'ok', text: 'تُكتب ' + String(ids.length) + ' من أفكارها بقواعد كلّ منصّة — تتبدّل نصوصُها في مكانها كلّما كُتبت.' })
  return c.redirect('/panel/plan/review', 303)
})

plan.post('/panel/plan/review/approve', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const org = activeOrg(gate.session.record)
  const id = String(gate.form.get('post') ?? '')
  const by = deciderOf(gate.session.record.via)
  const row = await c.env.DB.prepare('SELECT text, status FROM posts WHERE id = ? AND org_id = ?').bind(id, org).first<{ text: string; status: string }>()
  // ‏ومعتمَدٌ بلا موعد (اعتُمد والنظامُ موقوف، أو تعذّرت جدولتُه) يُجدوَل بالزرّ نفسِه بلا اعتمادٍ ثانٍ
  const result = row === null
    ? { ok: false as const, reason: 'لا مسوّدة بهذا المعرّف' }
    : row.status === 'approved' || row.status === 'edited'
      ? { ok: true as const }
      : await decide(c.env.DB, org, id, { kind: 'approve', text: row.text }, by)
  if (!result.ok) {
    await setFlash(c.env, c.req.raw, { kind: 'bad', text: result.reason })
    return toCard(gate.form)
  }
  finalizeLater(c, org, [id])
  const current = await latestPlan(c.env.DB, org)
  const settled = current === null ? null : await settleNow(c.env, org, current, by)
  const missed = settled === null || settled === 'paused' ? undefined : settled.skipped.find((x) => x.postId === id)
  await record(c.env.DB, { actor: 'panel', action: 'plan.review.approve', target: id, detail: settled === null ? 'approved' : settled === 'paused' ? 'approved · paused' : missed === undefined ? 'approved · scheduled' : ('approved · ' + missed.reason).slice(0, 200) }, c.req.raw)
  await setFlash(c.env, c.req.raw, settled === 'paused'
    ? { kind: 'warn', text: 'اعتُمدت. ' + saySettled(settled).slice(1) }
    : missed !== undefined
      ? { kind: 'warn', text: 'اعتُمدت ولم تُجدوَل: ' + missed.reason }
      : { kind: 'ok', text: 'اعتُمدت وجُدولت في موعدها — وتُنشر وحدَها. «تراجَع» على بطاقتها ما دامت لم تُرسَل.' })
  return toCard(gate.form)
})

/** **تراجَع** (D-327): المجدولُ يُسحب موعدُه ويعود مسوّدةً تنتظر القرار — والحكمُ في `undoItem`. */
plan.post('/panel/plan/review/undo', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const id = String(gate.form.get('post') ?? '')
  const result = await undoItem(c.env.DB, activeOrg(gate.session.record), String(gate.form.get('id') ?? ''), id)
  await record(c.env.DB, { actor: 'panel', action: 'plan.review.undo', target: id, detail: result.ok ? 'restored' : ('refused:' + result.reason).slice(0, 200) }, c.req.raw)
  await setFlash(c.env, c.req.raw, result.ok ? { kind: 'ok', text: 'سُحب موعدُها وعادت مسوّدةً تنتظر قرارك.' } : { kind: 'bad', text: 'تعذّر التراجع: ' + result.reason })
  return toCard(gate.form)
})

plan.post('/panel/plan/review/delay', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const f = gate.form
  const days = Number(f.get('days'))
  const result = await delayItem(c.env.DB, activeOrg(gate.session.record), String(f.get('id') ?? ''), Number(f.get('index')), String(f.get('key') ?? ''), days, new Date())
  await setFlash(c.env, c.req.raw, result.ok
    ? { kind: result.note === undefined ? 'ok' : 'warn', text: result.note ?? (days === 7 ? 'أُخّر أسبوعًا.' : 'أُخّر يومًا.') }
    : { kind: 'bad', text: result.reason })
  return toCard(f)
})

/**
 * **انقل البند** (D-330): يومٌ بتوقيت المالك (من السحب في اللوحة أو من لوح البطاقة) وساعةٌ إن ذُكرت — وإلّا ساعتُه كما هي بتوقيته.
 * يُمرَّران كما هما (البندُ محلّيّ · D-384)، والتحويلُ إلى UTC والحكمُ كلُّه في `moveItem`.
 */
plan.post('/panel/plan/review/move', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const org = activeOrg(gate.session.record)
  const f = gate.form
  const current = await latestPlan(c.env.DB, org)
  const item = current === null || current.id !== String(f.get('id') ?? '') ? undefined : current.plan.items[Number(f.get('index'))]
  const day = String(f.get('day') ?? '')
  let result: Awaited<ReturnType<typeof moveItem>> = { ok: false, reason: 'تغيّرت الخطّة منذ فتحت الصفحة — أعد تحميلها' }
  if (item !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(day)) {
    // ‏البندُ بتوقيت المالك (D-384)، فاليومُ والساعةُ يُمرَّران كما هما، و`moveItem` يحوّل الموعدَ وحدَه
    const asked = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(f.get('time') ?? '')) ? String(f.get('time')) : item.time
    result = await moveItem(c.env.DB, org, current!.id, Number(f.get('index')), String(f.get('key') ?? ''), { day, time: asked }, new Date())
  }
  await record(c.env.DB, { actor: 'panel', action: 'plan.review.move', target: String(f.get('id') ?? ''), detail: result.ok ? day : ('refused:' + result.reason).slice(0, 200) }, c.req.raw)
  await setFlash(c.env, c.req.raw, result.ok ? { kind: 'ok', text: 'نُقل البند — ومنشورُه المجدولُ معه.' } : { kind: 'bad', text: result.reason })
  return toCard(f, false)
})

/**
 * **الإصلاحُ بضغطة** (D-383 · المرحلة ٥): «أزِح» و«وزّع» و«ادمج» ونقلُ الهدوء والموعدِ الماضي. **الخادمُ يعيد الفحصَ** ويطابق
 * ما أُرسل (القاعدةُ والبنود) بما وجده الآن، فصفحةٌ قديمة لا تُصلح ما زال. ثمّ تُطبَّق النقلاتُ بـ `moveItem` (فيتحرّك المجدولُ معها)
 * والدمجُ بـ `removePlanItem` من آخر بندٍ إلى أوّله، فلا يتغيّر موضعُ ما لم يُحذف بعد.
 */
plan.post('/panel/plan/check/fix', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const org = activeOrg(gate.session.record)
  const f = gate.form
  const now = new Date()
  // ‏الخطّةُ بمعرّفها المرسَل (في المنظّمة وما لم تُستبدل)، لا أحدثُ خطّة: شاشةُ الشهر تُصلح أيَّ شهرٍ وخطّةَ الحزمة
  const current = await planForId(c.env.DB, org, String(f.get('id') ?? ''))
  let said: PanelFlash = { kind: 'bad', text: 'تغيّرت الخطّة منذ فتحت الصفحة. أعد تحميلها.' }
  if (current !== null) {
    const zone = await storedZone(c.env.DB)
    const [model, rules] = await Promise.all([reviewModel(c.env.DB, org, current), readRules(c.env.DB, org)])
    const input = await reviewCheckInput(c.env.DB, org, model, zone, now)
    const keys = String(f.get('keys') ?? '').split('\n').filter((k) => k !== '')
    const rule = String(f.get('rule') ?? '') as RuleId
    const finding = planChecks(input, rules).find((x) => x.rule === rule && x.keys.join('\n') === keys.join('\n') && (x.day ?? '') === String(f.get('day') ?? ''))
    const plan = finding === undefined ? null : planFix(input, rules, finding)
    const indexOf = new Map(current.plan.items.map((it, i) => [itemKey(it), i]))
    if (finding === undefined) said = { kind: 'warn', text: 'زال هذا التحذير، أو تغيّر. هذه الصفحة بعد الفحص من جديد.' }
    else if (plan!.kind === 'none') said = { kind: 'warn', text: plan!.reason + '.' }
    else if (plan!.kind === 'remove') {
      let n = 0
      for (const i of plan!.keys.map((k) => indexOf.get(k)).filter((i): i is number => i !== undefined).sort((a, b) => b - a)) {
        if ((await removePlanItem(c.env.DB, org, current.id, i)).ok) n += 1
      }
      said = n === 0 ? { kind: 'bad', text: 'لم يُحذف المكرَّر. أعد تحميل الصفحة.' } : { kind: 'ok', text: 'دُمج: بقي بندٌ واحد وحُذف ' + String(n) + '.' }
    } else {
      let n = 0
      let why = ''
      for (const m of plan!.moves) {
        const i = indexOf.get(m.key)
        if (i === undefined) continue
        const r = await moveItem(c.env.DB, org, current.id, i, m.key, { day: m.to.day, time: hhmm(m.to.minutes) }, now)
        if (r.ok) n += 1
        else why = r.reason
      }
      said = n === 0 ? { kind: 'bad', text: why === '' ? 'لم يُنقل شيء.' : why } : { kind: 'ok', text: 'نُقل ' + String(n) + (n === 1 ? ' بند' : ' بنود') + ' إلى خانةٍ فارغة.' + (why === '' ? '' : ' وتعذّر غيرُه: ' + why) }
    }
    await record(c.env.DB, { actor: 'panel', action: 'plan.check.fix', target: current.id, detail: (rule + ':' + (plan?.kind ?? 'gone')).slice(0, 200) }, c.req.raw)
  }
  await setFlash(c.env, c.req.raw, said)
  const back = String(f.get('back') ?? '')
  if (isPeriod(back)) return c.redirect('/panel/plan/month?p=' + back, 303)
  return toCard(f, false)
})

/**
 * **«اعتمد وجدول» من شاشة الشهر** (D-383 · الاعتماد): يقفل إصدارَ الخطّة ويولّد منشوراتِ بنودها بـ`approvePlanVersion`،
 * ثمّ يجدول بالمُجدوِل الواحد ما لا يمنعه الفحص. والممنوعُ يبقى معتمَدًا بلا موعد ويُقال عددُه وسببُه.
 */
plan.post('/panel/plan/month/approve', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const org = activeOrg(gate.session.record)
  const f = gate.form
  const period = String(f.get('p') ?? '')
  const to = isPeriod(period) ? '/panel/plan/month?p=' + period : '/panel/plan/month'
  const stored = await planForId(c.env.DB, org, String(f.get('id') ?? ''))
  if (stored === null) {
    await setFlash(c.env, c.req.raw, { kind: 'bad', text: 'تغيّرت الخطّة منذ فتحت الصفحة. أعد تحميلها.' })
    return c.redirect(to, 303)
  }
  const now = new Date()
  const zone = await storedZone(c.env.DB)
  const [model, rules] = await Promise.all([reviewModel(c.env.DB, org, stored), readRules(c.env.DB, org)])
  const findings = planChecks(await reviewCheckInput(c.env.DB, org, model, zone, now), rules)
  const blocked = blockedKeys(findings)
  // ‏«اعتمد ما في الفرز» (D-410): البنودُ المنتظرة المطابقة وحدَها، والخطّةُ تبقى مسوّدةً لما بقي
  let only: string[] | undefined
  if (String(f.get('scope') ?? '') === 'filter') {
    const fq = new URLSearchParams()
    for (const k of ['v', 'p', 'd', 'pf', 'st']) fq.set(k, String(f.get(k) ?? ''))
    only = bulkPick(await calendarItems(c.env.DB, org, stored.id), parseCalQuery(fq, period + '-01', [...PLATFORM_IDS, PAGE_PLATFORM]))
    if (only.length === 0) {
      await setFlash(c.env, c.req.raw, { kind: 'warn', text: 'لا بند ينتظر الاعتماد في هذا الفرز.' })
      return c.redirect(to, 303)
    }
  }
  const done = await approvePlanVersion(c.env.DB, org, stored.id, gate.session.record.email ?? 'owner', now, only)
  if (!done.ok) {
    await setFlash(c.env, c.req.raw, { kind: 'bad', text: done.reason })
    return c.redirect(to, 303)
  }
  // ‏ولا يُقال «اعتُمد» على صفر (D-411): الفرزُ يعدّ ما يُعتمد فعلًا، وهذا حارسُ ما تغيّر بين الفتح والإرسال
  if (only !== undefined && done.approved + done.created === 0) {
    await setFlash(c.env, c.req.raw, { kind: 'warn', text: 'لم يُعتمد شيء: بنودُ هذا الفرز بلا نصٍّ أو تعثّر نشرُها. افتح اليومَ وراجعها.' })
    return c.redirect(to, 303)
  }
  if (stored.status === 'draft' && only === undefined) await approvePlan(c.env.DB, stored.id, org)
  const fresh = await planForId(c.env.DB, org, stored.id) ?? stored
  const settled = await schedulePlan(c.env.DB, org, fresh, now, blocked, only === undefined ? undefined : new Set(only))
  await record(c.env.DB, { actor: 'panel', action: 'plan.month.approve', target: stored.id, detail: 'v' + String(done.version) + ':' + String(settled.scheduled) }, c.req.raw)
  const held = settled.skipped.length
  // ‏بجملة D-384: ما اعتُمد وما بقي بلا موعدٍ وسببُه — ثمّ التيّارُ (D-387) حيث يُرى المجدولُ في مواعيده
  await setFlash(c.env, c.req.raw, {
    kind: held === 0 ? 'ok' : 'warn',
    // ‏والفرزُ يُقال بعدده (مراجعة D-425): ما اعتُمد منه هو ما جُدول، لا ما في الخطّة كلِّها
    text: (only === undefined ? 'اعتُمد الإصدار ' + String(done.version) + '. '
      : 'اعتُمد من الفرز ' + String(done.approved + done.created) + ' من ' + String(only.length) + ' في الإصدار ' + String(done.version) + '. ') + saySettled(settled),
  })
  return c.redirect('/panel/feed', 303)
})

/** «ألغِ جدولة الشهر»: كلُّ مجدوَلٍ لم يُرسَل من خطّة الشهر وحزمته يعود معتمَدًا بلا موعد، وما أُرسل يُقال. */
plan.post('/panel/plan/month/unschedule', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const org = activeOrg(gate.session.record)
  const period = String(gate.form.get('p') ?? '')
  if (!isPeriod(period)) return c.redirect('/panel/plan/month', 303)
  const r = await unscheduleMonth(c.env.DB, org, period)
  await record(c.env.DB, { actor: 'panel', action: 'plan.month.unschedule', target: period, detail: String(r.pulled) + ':' + String(r.kept.length) }, c.req.raw)
  await setFlash(c.env, c.req.raw, {
    kind: r.kept.length === 0 ? 'ok' : 'warn',
    text: (r.pulled === 0 ? 'لا مجدوَلَ يُلغى في ' + period : 'أُلغيت جدولة ' + String(r.pulled) + ' وعادت معتمَدةً بلا موعد') +
      (r.kept.length === 0 ? '.' : '، وبقي ' + String(r.kept.length) + ': ' + r.kept[0]!.reason + '.'),
  })
  return c.redirect('/panel/plan/month?p=' + period, 303)
})

/** «افتح الإصدار»: إصدارٌ جديد مسوّدة، والمقفلُ يبقى سجلًّا. والمجدوَلُ يُلغى أوّلًا. */
plan.post('/panel/plan/month/reopen', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const org = activeOrg(gate.session.record)
  const period = String(gate.form.get('p') ?? '')
  const id = String(gate.form.get('id') ?? '')
  const r = await reopenVersion(c.env.DB, org, id)
  if (r.ok) {
    await c.env.DB.prepare("UPDATE plans SET status = 'draft' WHERE id = ? AND org_id = ? AND status <> 'superseded'").bind(id, org).run()
    await record(c.env.DB, { actor: 'panel', action: 'plan.month.reopen', target: id, detail: 'v' + String(r.version) }, c.req.raw)
  }
  await setFlash(c.env, c.req.raw, r.ok
    ? { kind: 'ok', text: 'فُتح الإصدار ' + String(r.version) + ' مسوّدةً، ورجع ' + String(r.reverted) + ' إلى المسوّدات.' }
    : { kind: 'bad', text: r.reason })
  return c.redirect(isPeriod(period) ? '/panel/plan/month?p=' + period : '/panel/plan/month', 303)
})

/**
 * **شاشةُ الشهر** (D-383 · المرحلة ٨): رحلةُ الشهرين، وشريطُ الفحص بأزرار الإصلاح، والتقويمُ بشارات الحمل، والفرقُ، وسطرُ الاعتماد.
 * للقراءة لكلّ دور، والاعتمادُ والإصلاحُ للناشر فأعلى (`access.ts`).
 */
plan.get('/panel/plan/month', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return loginResponse(c.env, c.req.raw)
  const org = activeOrg(session.record)
  const zone = await storedZone(c.env.DB)
  const now = new Date()
  const today = localDay(localParts(now, zone))
  const current = today.slice(0, 7)
  const calQ = parseCalQuery(new URL(c.req.url).searchParams, today, [...PLATFORM_IDS, PAGE_PLATFORM])
  const period = calQ.period
  const canFix = allows(session.record.role ?? 'owner', 'publisher')
  const [stored, rules, diff, facts] = await Promise.all([
    planForPeriod(c.env.DB, org, period), readRules(c.env.DB, org), readDiff(c.env.DB, org, period),
    Promise.all([monthFacts(c.env.DB, org, current), monthFacts(c.env.DB, org, nextPeriod(current))]),
  ])
  let findings: ReturnType<typeof planChecks> = []
  let total = 0
  if (stored !== null) {
    const model = await reviewModel(c.env.DB, org, stored)
    findings = planChecks(await reviewCheckInput(c.env.DB, org, model, zone, now), rules)
    total = model.cards.length
  }
  const blocked = blockedKeys(findings)
  // ‏الأسبوعُ العابرُ يقرأ خطّةَ الشهر المجاور لأيّامه (D-411)، عرضًا فقط: الاعتمادُ بالفرز يبقى لخطّة هذا الشهر
  const own = stored === null ? [] : await calendarItems(c.env.DB, org, stored.id)
  const others = await Promise.all(spanPeriods(calQ).filter((x) => x !== period).map(async (x) => {
    const pl = await planForPeriod(c.env.DB, org, x)
    return pl === null ? [] : (await calendarItems(c.env.DB, org, pl.id)).map((i) => ({ ...i, ready: false }))
  }))
  const calItems = [...own, ...others.flat()]
  const firstBlock = findings.find((f) => f.severity === 'block')
  const body = monthJourneyCard(facts.map((f) => monthJourney(f, today))) + '<div class="mt-3"></div>' + monthScreen({
    period, planId: stored?.id ?? null,
    perDay: stored === null ? {} : await itemsPerDay(c.env.DB, org, stored.id),
    dailyCap: rules.dailyTotalCap,
    checks: stored === null ? { findings, canFix } : { findings, planId: stored.id, canFix, back: period },
    diff,
    approval: approvalLine({ total, blocked: blocked.size, reason: firstBlock === undefined ? null : RULE_LABEL[firstBlock.rule] }),
    canApprove: canFix && stored?.status === 'draft',
    canRollback: canFix && stored !== null,
    prev: prevPeriod(period), next: nextPeriod(period),
    cal: { q: calQ, canWrite: allows(session.record.role ?? 'owner', 'editor'), items: calItems, platforms: [...new Set([...PLAN_BASE, ...calItems.map((i) => i.platform)])] },
  })
  // ‏وتقويمُ الشهر عرضٌ ثانٍ يُبلَغ من رأس التيّار (D-388)، فرافدتُه تعلِّم التيّارَ أبًا
  return page((nonce) => soloPage('صدى — شهر ' + period, { href: '/panel/feed', label: 'التيّار' }, injectCsrf(body, session.record.csrf), nonce,
    '', buildCommands({ onPanel: false }), soloNav('plan')))
})

/** **سجلُّ الاستيرادات** (D-383 · المرحلة ٨): كلُّ `import_job` بحاله وبصمته وشهره وما غيّر، وزرُّ «إعادة الفحص» إلى شهره. */
plan.get('/panel/plan/imports', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return loginResponse(c.env, c.req.raw)
  const rows = await readImports(c.env.DB, activeOrg(session.record))
  const body = importsScreen(rows, allows(session.record.role ?? 'owner', 'publisher'))
  return page((nonce) => soloPage('صدى — الاستيرادات', { href: '/panel/plan/month', label: 'الشهر' }, body, nonce,
    '', buildCommands({ onPanel: false }), soloNav('posts')))
})

/** **«قارن الإصدارات»** (D-406): إصداران من خطّةٍ مرفوعة متجاوران — صورُ `plan_versions` والإصدارُ القائم. */
plan.get('/panel/plan/versions', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return loginResponse(c.env, c.req.raw)
  const planId = c.req.query('plan') ?? ''
  const versions = /^[0-9a-f-]{36}$/.test(planId) ? await readPlanVersions(c.env.DB, activeOrg(session.record), planId) : []
  if (versions.length === 0) return c.redirect('/panel/plan/imports', 303)
  const pick = (q: string | undefined, fallback: PlanVersion): PlanVersion => versions.find((v) => String(v.version) === q) ?? fallback
  const b = pick(c.req.query('b'), versions[versions.length - 1]!)
  const a = pick(c.req.query('a'), versions[Math.max(0, versions.length - 2)]!)
  const body = versionsScreen({ planId, versions, a, b, changes: diffVersions(a, b) })
  return page((nonce) => soloPage('صدى — قارن الإصدارات', { href: '/panel/plan/imports', label: 'الاستيرادات' }, body, nonce,
    '', buildCommands({ onPanel: false }), soloNav('posts')))
})

plan.get('/panel/plan-rules', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return loginResponse(c.env, c.req.raw)
  const [rules, flash] = await Promise.all([readRules(c.env.DB, activeOrg(session.record)), takeFlash(c.env, c.req.raw)])
  const body = rulesScreen(rules, allows(session.record.role ?? 'owner', 'admin')) +
    (flash === null ? '' : toastRegion(notice({ tone: flash.kind, html: escapeHtml(flash.text), alert: flash.kind === 'bad' })))
  return page((nonce) => soloPage('صدى — قواعد الجدولة', { href: '/panel/settings#limits', label: 'الإعدادات' }, injectCsrf(body, session.record.csrf), nonce,
    '', buildCommands({ onPanel: false }), soloNav('settings')))
})

/**
 * **قواعد الجدولة** (D-383 · المرحلة ٥): عتباتُ الفحص لهذه المنظّمة في `schedule_rules`. للمدير فأعلى (`access.ts`).
 */
plan.post('/panel/plan-rules', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const org = activeOrg(gate.session.record)
  const parsed = parseRulesForm(gate.form)
  if (parsed.ok) await writeRules(c.env.DB, org, parsed.rules, gate.session.record.email ?? 'panel')
  await record(c.env.DB, { actor: 'panel', action: 'settings.schedule_rules', target: org, detail: parsed.ok ? JSON.stringify(parsed.rules).slice(0, 200) : 'refused:' + parsed.reason }, c.req.raw)
  await setFlash(c.env, c.req.raw, parsed.ok ? { kind: 'ok', text: 'حُفظت قواعد الجدولة. يُعاد الفحص بها في كلّ مراجعة.' } : { kind: 'bad', text: parsed.reason + '.' })
  return c.redirect('/panel/plan-rules', 303)
})

/**
 * **«أضف منشورًا»** (D-336): بندٌ بيد المالك في يومٍ وساعةٍ بتوقيته، يُكتب فورًا كسائر البنود. والحكمُ في `addItem`؛ والإيقافُ المؤقّتُ
 * يُقال قبل أن يُكتب شيء — فلا بندَ بلا مسوّدةٍ تأتيه.
 */
plan.post('/panel/plan/review/add', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const org = activeOrg(gate.session.record)
  const f = gate.form
  const id = String(f.get('id') ?? '')
  const day = String(f.get('day') ?? '')
  const time = String(f.get('time') ?? '')
  let result: Awaited<ReturnType<typeof addItem>> = { ok: false, reason: 'يومٌ أو ساعةٌ غير صالحة' }
  if ((await readSettings(c.env.DB)).paused) result = { ok: false, reason: 'صدى موقوفٌ مؤقّتًا — لا يُكتب شيءٌ حتّى يُرفع الإيقاف' }
  else if (/^\d{4}-\d{2}-\d{2}$/.test(day) && /^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    // ‏بتوقيت المالك كما كُتب (D-384)
    result = await addItem(c.env.DB, org, id, { day, time, platform: String(f.get('platform') ?? ''), angle: String(f.get('angle') ?? '') })
  }
  if (result.ok) {
    const current = await latestPlan(c.env.DB, org)
    if (current !== null && current.id === id) await c.env.GENERATE_QUEUE.send(draftMessage(current, result.item, org).body)
  }
  await record(c.env.DB, { actor: 'panel', action: 'plan.review.add', target: id, detail: result.ok ? result.item.platform + ' ' + day : ('refused:' + result.reason).slice(0, 200) }, c.req.raw)
  await setFlash(c.env, c.req.raw, result.ok ? { kind: 'ok', text: 'أُضيف المنشور — صدى يكتبه الآن ويظهر في يومه.' } : { kind: 'bad', text: result.reason })
  return toCard(f, false)
})

/** **نصُّ المسوّدة من لوح البطاقة** (D-330): «احفظ» يكتب ولا يعتمد — والحكمُ في `saveText` (المسوّدةُ وحدَها، وحدُّ المنصّة). */
plan.post('/panel/plan/review/text', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const id = String(gate.form.get('post') ?? '')
  const result = await saveText(c.env.DB, activeOrg(gate.session.record), id, String(gate.form.get('text') ?? ''))
  await record(c.env.DB, { actor: 'panel', action: 'plan.review.text', target: id, detail: result.ok ? 'saved' : ('refused:' + result.reason).slice(0, 200) }, c.req.raw)
  await setFlash(c.env, c.req.raw, result.ok ? { kind: 'ok', text: 'حُفظ النصّ — ويبقى مسوّدةً حتّى تعتمده.' } : { kind: 'bad', text: result.reason })
  return toCard(gate.form)
})

/**
 * **لوحُ البطاقة** (D-330): جزءُ صفحةٍ لبندٍ واحد — معاينتُه ونصُّه وصورتُه وموعدُه وأفعالُه — يطلبه سكربتُ الشاشة حين تُضغط
 * مصغَّرة. خلف الجلسة كالشاشة، ونماذجُه بـ CSRF الجلسة، **ولا يفعل شيئًا**: الأفعالُ نماذجُ إلى مساراتها بحرّاسها.
 */
plan.get('/panel/plan/review/card', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return c.text('انتهت الجلسة', 401)
  const org = activeOrg(session.record)
  const current = await latestPlan(c.env.DB, org)
  if (current === null) return c.text('لا خطّة', 404)
  const [model, zone, orgRow, accounts] = await Promise.all([
    reviewModel(c.env.DB, org, current),
    ownerZone(c.env.DB, c.req.header('Cookie') ?? null),
    c.env.DB.prepare('SELECT name FROM orgs WHERE id = ?').bind(org).first<{ name: string }>().catch(() => null),
    c.env.DB.prepare("SELECT platform, display_name FROM accounts WHERE org_id = ? AND status = 'active' ORDER BY id")
      .bind(org).all<{ platform: string; display_name: string | null }>().then((r) => r.results).catch(() => []),
  ])
  const authors: Record<string, string> = {}
  for (const a of accounts) if (authors[a.platform] === undefined && a.display_name !== null) authors[a.platform] = a.display_name
  const body = planSheet(model, Number(c.req.query('i')), zone ?? null, { week: c.req.query('w') ?? null, orgName: orgRow?.name ?? 'خطّتي', authors })
  if (body === null) return c.text('لا بند بهذا الرقم', 404)
  return new Response(injectCsrf(body, session.record.csrf), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store' } })
})

plan.post('/panel/plan/review/drop', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const f = gate.form
  const result = await dropItem(c.env.DB, activeOrg(gate.session.record), String(f.get('id') ?? ''), Number(f.get('index')), String(f.get('key') ?? ''), deciderOf(gate.session.record.via))
  await setFlash(c.env, c.req.raw, result.ok ? { kind: 'ok', text: 'أُزيل البند من الخطّة.' } : { kind: 'bad', text: result.reason })
  return toCard(f, false)
})

/** حالُ ما بُتّ فيه من قبل، بكلمته في الرسالة — و`undefined` لمسوّدةٍ أو ما يُبتّ فيه. */
function decidedWord(status: string): string | undefined {
  if (status === 'approved') return 'معتمَدة'
  if (status === 'queued') return 'مجدولة'
  if (status === 'published') return 'منشورة'
  return undefined
}

/**
 * **فعلٌ واحدٌ على المحدَّد**: اعتمادٌ أو تأخيرٌ يومًا أو حذف. والحذفُ والتأخيرُ من آخر البنود إلى أوّلها فلا يتبدّل فهرسُ ما بعدُ،
 * وكلُّ بندٍ ببصمته — فما تغيّر منذ فُتحت الصفحة يُردّ وحدَه ويُسمّى.
 */
plan.post('/panel/plan/review/bulk', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const org = activeOrg(gate.session.record)
  const f = gate.form
  const planId = String(f.get('id') ?? '')
  const act = String(f.get('do') ?? '')
  const picked = f.getAll('sel').map(String).map((v) => {
    const [index, ...rest] = v.split('|')
    const post = rest.pop() ?? ''
    return { index: Number(index), key: rest.join('|'), post }
  }).filter((p) => Number.isInteger(p.index)).sort((a, b) => b.index - a.index)
  if (picked.length === 0) {
    await setFlash(c.env, c.req.raw, { kind: 'warn', text: 'لم يُحدَّد بند.' })
    return toCard(f, false)
  }
  let done = 0
  let tail = ''
  const failed: string[] = []
  // ‏ما بُتّ فيه من قبل (معتمَدٌ أو مجدولٌ أو منشور) يُترك ويُعدّ وحدَه — ليس «تعذّرًا» (D-384)
  const already: string[] = []
  if (act === 'approve') {
    const all = picked.map((p) => p.post).filter((x) => x !== '')
    const status = new Map<string, string>()
    for (const id of all) {
      const row = await c.env.DB.prepare('SELECT status FROM posts WHERE id = ? AND org_id = ?').bind(id, org).first<{ status: string }>()
      if (row !== null) status.set(id, row.status)
    }
    const ids = all.filter((id) => { const w = decidedWord(status.get(id) ?? ''); if (w === undefined) return true; already.push(w); return false })
    const r = ids.length === 0 ? { done: [], failed: [] } : await approveMany(c.env.DB, org, ids, deciderOf(gate.session.record.via))
    done = r.done.length
    failed.push(...r.failed.map((x) => x.reason))
    finalizeLater(c, org, r.done)
    // ‏والمعتمَدُ يُجدوَل في مواعيد بنوده الآن (D-327)
    const current = done === 0 ? null : await latestPlan(c.env.DB, org)
    if (current !== null && current.id === planId) tail = ' ' + saySettled(await settleNow(c.env, org, current, deciderOf(gate.session.record.via)))
  } else if (act === 'delay' || act === 'drop') {
    for (const p of picked) {
      const r = act === 'delay'
        ? await delayItem(c.env.DB, org, planId, p.index, p.key, 1, new Date())
        : await dropItem(c.env.DB, org, planId, p.index, p.key, deciderOf(gate.session.record.via))
      if (r.ok) done += 1
      else failed.push(r.reason)
    }
  }
  const verb = act === 'approve' ? 'اعتُمد' : act === 'delay' ? 'أُخّر' : 'حُذف'
  await setFlash(c.env, c.req.raw, {
    kind: failed.length === 0 ? 'ok' : done === 0 ? 'bad' : 'warn',
    text: sayDecided(verb, done, already, failed) + tail,
  })
  // ‏والاعتمادُ يهبط في التيّار (D-387)؛ والتأخيرُ والحذفُ يبقيان في الورشة
  if (act === 'approve' && f.get('back') === 'feed') return feedNext(f, '')
  f.delete('back')
  return toCard(f, false)
})

plan.post('/panel/plan/pin', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const org = activeOrg(gate.session.record)
  const current = await latestPlan(c.env.DB, org)
  if (current === null || current.id !== String(gate.form.get('id') ?? '')) {
    await setFlash(c.env, c.req.raw, { kind: 'bad', text: 'لا خطّة بهذا المعرّف لهذا العميل.' })
    return c.redirect('/panel/plan/review', 303)
  }
  const pinned = await pinPlan(c.env.DB, org, current, deciderOf(gate.session.record.via), new Date())
  await record(c.env.DB, { actor: 'panel', action: 'plan.pin', target: current.id, detail: 'v' + String(pinned.version) + ' · ' + String(pinned.scheduled) + ' جُدولت · ' + String(pinned.skipped.length) + ' تعذّرت' }, c.req.raw)
  await setFlash(c.env, c.req.raw, pinned.already
    ? { kind: 'warn', text: 'هذا الإصدارُ مثبَّتٌ من قبل.' }
    : {
      kind: pinned.skipped.length === 0 ? 'ok' : 'warn',
      text: 'ثُبّت الإصدار ' + String(pinned.version) + ' وجُدول ' + String(pinned.scheduled) + ' منشورًا في مواعيده' +
        (pinned.skipped.length === 0 ? '.' : '، وتعذّر ' + String(pinned.skipped.length) + ': ' + pinned.skipped.slice(0, 2).map((x) => x.reason).join('، ')),
    })
  return c.redirect('/panel/plan/review', 303)
})

// ── «عندي خطّة»: تُقرأ أيًّا كانت صيغتُها وتُسكَّن في المراجعة (D-287) ─────────

plan.get('/panel/plan/import', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return loginResponse(c.env, c.req.raw)
  const hasPackage = (await readSource(c.env.DB, activeOrg(session.record)).catch(() => null)) !== null
  const body = planSeatScreen({ canRead: allows(session.record.role ?? 'owner', 'admin'), hasPackage })
  return page((nonce) =>
    soloPage('صدى — عندي خطّة', { href: panelHref('posts'), label: 'المنشورات' }, injectCsrf(body, session.record.csrf), nonce,
      PLAN_SEAT_SCRIPT, buildCommands({ onPanel: false }), soloNav('plan')),
  )
})

plan.post('/panel/plan/import', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const org = activeOrg(gate.session.record)
  const f = gate.form
  const file = f.get('file')
  const pasted = String(f.get('pasted') ?? '')
  const styleRaw = String(f.get('image_style') ?? 'none')
  const imageStyle = styleRaw === 'none' ? null : asImageStyle(styleRaw)
  const bad = async (text: string): Promise<Response> => {
    await setFlash(c.env, c.req.raw, { kind: 'bad', text })
    return c.redirect('/panel/plan/import', 303)
  }
  if (file instanceof File && file.size > MAX_PLAN_BYTES * 20) return bad('الملفّ أكبر من 10MB — قسّمه أو ارفعه جدولًا.')
  const toMarkdown = c.env.AI?.toMarkdown
  const table = await toTable(
    {
      db: c.env.DB,
      writer: { db: c.env.DB, encKey: c.env.TOKEN_ENC_KEY, workerSecrets: c.env as unknown as Record<string, string | undefined> },
      toMarkdown: toMarkdown === undefined ? undefined : (doc) => toMarkdown.call(c.env.AI, doc),
    },
    file instanceof File && file.size > 0 ? { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) } : { pasted },
    org,
  )
  if (table.kind === 'error') return bad(table.reason)
  // ‏«هذا ما فهمته»: يُقرأ ويُكمَّل ولا يُسكَّن شيء — يُحفظ ساعةً ويُعرض، والبناءُ بزرٍّ بعده
  const now = new Date()
  const facts = await planFacts(c.env, org, c.req.header('Cookie') ?? null, now)
  const wide = widenPlan(table.csv)
  const { csv, filled } = await fillGaps(c.env.DB, org, wide.csv, weekStart(now), facts.zone)
  const key = crypto.randomUUID()
  await c.env.KV.put('plan-preview:' + key, JSON.stringify({
    org, csv, filled: Object.fromEntries([...filled].map(([l, n]) => [String(l), n])),
    via: table.via, widened: wide.widened, cost: table.cost, imageStyle, rules: table.rules ?? null,
  }), { expirationTtl: 3600 })
  return c.redirect('/panel/plan/import/preview?k=' + key, 303)
})

interface StoredPreview { org: string; csv: string; filled: Record<string, string>; via: string; widened: boolean; cost: number; imageStyle: PlanImageStyle | null; rules?: PlanRules | null }

async function loadPreview(kv: Env['KV'], key: string, org: string): Promise<StoredPreview | null> {
  if (!/^[0-9a-f-]{36}$/.test(key)) return null
  const raw = await kv.get('plan-preview:' + key)
  if (raw === null) return null
  const p = JSON.parse(raw) as StoredPreview
  return p.org === org ? p : null
}

plan.get('/panel/plan/import/preview', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return loginResponse(c.env, c.req.raw)
  const key = c.req.query('k') ?? ''
  const p = await loadPreview(c.env.KV, key, activeOrg(session.record))
  if (p === null) {
    await setFlash(c.env, c.req.raw, { kind: 'warn', text: 'انتهت القراءة أو لم توجد — ارفع الملفّ ثانية.' })
    return c.redirect('/panel/plan/import', 303)
  }
  // ‏ووسيطةُ كلّ صفٍّ من مكتبة Drive (D-363): «وسيطته من مكتبتك» أو «تنقصه وسيطة» — قراءةٌ بلا كتابة
  const facts = await planFacts(c.env, activeOrg(session.record), c.req.header('Cookie') ?? null, new Date())
  const media: Record<string, string> = {}
  for (const r of readPlan(p.csv, facts).rows) { const line = mediaLine(r); if (line !== '') media[String(r.line)] = line }
  // ‏وتقديرُ الزرّين بالدولار قبل الضغط (D-395): كلُّ نداءٍ بسعره من الجدول الذي يكتب به الدفتر، وما لا سعرَ له يُقال
  const rows = readPlan(p.csv, facts).rows
  const room = p.imageStyle === null ? 0 : await autoImageRoom(c.env.DB, activeOrg(session.record), true)
  const used = await neuronsUsedToday(c.env.DB)
  const lineFor = async (write: boolean): Promise<string> => buildEstimateLine(estimateBuild(await planBuildCalls(c.env.DB, activeOrg(session.record), {
    platforms: rows.map((r) => r.platform), write, imageStyle: p.imageStyle, imageRoom: room,
  }), used))
  const estimate = { write: await lineFor(true), seat: p.imageStyle === null ? null : await lineFor(false) }
  // ‏وما سيفعله «ابنِ» بكلّ صفّ (D-406): جديدٌ أو معدَّلٌ أو مجدولٌ أو منشورٌ سابقًا، وما في الخطّة وغاب عن الملفّ
  const seat = await previewSeat(c.env.DB, activeOrg(session.record), p.csv, facts, p.via === 'model' ? 'text' : 'csv')
  const importedLabel = seat.importedAt === null ? null : dayLabel(new Date(seat.importedAt.replace(' ', 'T') + 'Z'), facts.zone)
  const body = planPreviewScreen({ key, csv: p.csv, filled: p.filled, via: p.via, widened: p.widened, cost: p.cost, rules: p.rules ?? null, media, estimate, seat: { ...seat, importedLabel } })
  return page((nonce) =>
    soloPage('صدى — هذا ما فهمته', { href: '/panel/plan/import', label: 'عندي خطّة' }, injectCsrf(body, session.record.csrf), nonce,
      '', buildCommands({ onPanel: false }), soloNav('plan')),
  )
})

plan.post('/panel/plan/import/confirm', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const org = activeOrg(gate.session.record)
  const key = String(gate.form.get('k') ?? '')
  const bad = async (text: string): Promise<Response> => {
    await setFlash(c.env, c.req.raw, { kind: 'bad', text })
    return c.redirect('/panel/plan/import', 303)
  }
  const p = await loadPreview(c.env.KV, key, org)
  if (p === null) return bad('انتهت القراءة أو لم توجد — ارفع الملفّ ثانية.')
  await c.env.KV.delete('plan-preview:' + key)
  const table = { via: p.via }
  const imageStyle = p.imageStyle
  const csv = p.csv
  const filled = new Map(Object.entries(p.filled).map(([l, n]) => [Number(l), n]))
  const facts = await planFacts(c.env, org, c.req.header('Cookie') ?? null, new Date())
  // ‏«اكتب من الفكرة» (D-361): نداءٌ مدفوعٌ لكلّ بند، بضغطة المالك وعددُه على الزرّ (D-006 · D-008)
  const write = gate.form.get('write') === '1'
  // ‏ومصدرُه في `import_jobs` (D-383): الجدولُ ملفٌّ، وما استخرجه النموذجُ نصّ
  const seated = await seatPlan(c.env.DB, org, csv, facts, filled, imageStyle, p.rules ?? null, write, { kind: table.via === 'model' ? 'text' : 'csv' })
  await record(c.env.DB, {
    actor: 'panel', action: write ? 'plan.import.write' : 'plan.import.seat', target: seated.planId,
    detail: table.via + ' · ' + String(seated.seated) + ' سُكّنت · ' + String(seated.skipped.length) + ' تعذّرت',
  }, c.req.raw)
  if (seated.unchanged === true) {
    await setFlash(c.env, c.req.raw, { kind: 'warn', text: 'هذه الخطّةُ نفسُها سُكّنت من قبل، فلم يتغيّر شيء. عدّل الملفّ ثمّ ارفعه، أو راجع خطّتك.' })
    return c.redirect('/panel/plan/review', 303)
  }
  if (seated.planId === null) {
    return bad('لم يُسكَّن شيء: ' + seated.skipped.slice(0, 3).map((x) => (x.line > 1 ? 'السطر ' + String(x.line) + ' ' : '') + '(' + x.reason + ')').join('، '))
  }
  if (write) {
    // ‏كلُّ بندٍ رسالةُ كتابةٍ في الطابور بقواعد منصّته، والمراجعةُ تعدّ ما كُتب وما تعذّر (PL-23)
    const current = await latestPlan(c.env.DB, org)
    if (current !== null && current.id === seated.planId) {
      const msgs = current.plan.items.map((i) => draftMessage(current, i, org))
      for (let at = 0; at < msgs.length; at += 100) await c.env.GENERATE_QUEUE.sendBatch(msgs.slice(at, at + 100))
    }
    await setFlash(c.env, c.req.raw, {
      kind: seated.skipped.length === 0 ? 'ok' : 'warn',
      text: 'تُكتب ' + String(seated.seated) + ' منشورًا من أفكار خطّتك بقواعد كلّ منصّة — تظهر في المراجعة كلّما كُتبت' +
        (seated.skipped.length === 0 ? '.' : '. وتعذّر ' + String(seated.skipped.length) + '.'),
    })
    return c.redirect('/panel/plan/review', 303)
  }
  // ‏والصورُ إن اختيرت تُرسم في الخلفيّة بحرّاسها وسقفها اليوميّ (D-255 · D-285)، والمراجعةُ تقول «بلا صورة» حتّى تصل
  if (imageStyle !== null) {
    const ids = (await seatedPosts(c.env.DB, org, seated.planId)).slice(0, await autoImageRoom(c.env.DB, org, true))
    const deps = { db: c.env.DB, bucket: c.env.MEDIA, encKey: c.env.TOKEN_ENC_KEY, workerSecrets: c.env as unknown as Record<string, string | undefined> }
    const job = (async () => { for (const id of ids) await generateForPost(deps, id, { style: imageStyle, org }).catch(() => null) })()
    try { c.executionCtx.waitUntil(job) } catch { /* لا سياقَ تنفيذٍ خارج Worker */ }
  }
  const named = seated.skipped.slice(0, 3).map((x) => 'السطر ' + String(x.line) + ' (' + x.reason + ')').join('، ')
  await setFlash(c.env, c.req.raw, {
    kind: seated.skipped.length === 0 ? 'ok' : 'warn',
    text: 'سُكّن ' + String(seated.seated) + ' منشورًا في خطّتك — راجعها واعتمدها ثمّ ثبّتها' +
      (seated.skipped.length === 0 ? '.' : '. وتعذّر ' + String(seated.skipped.length) + ': ' + named + (seated.skipped.length > 3 ? ' وغيرُها.' : '.')),
  })
  return c.redirect('/panel/plan/review', 303)
})

// ── عرضُ الخطّة (D-288): الخطّةُ كما تُقدَّم — الغلافُ والمنصّاتُ والتقويمُ والمحتوى بشكل منصّاته ──

plan.get('/panel/plan/view', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return loginResponse(c.env, c.req.raw)
  const org = activeOrg(session.record)
  const current = await latestPlan(c.env.DB, org)
  if (current === null) return c.redirect('/panel/plan/new', 303)
  const [model, zone, orgRow, accounts, names] = await Promise.all([
    reviewModel(c.env.DB, org, current),
    ownerZone(c.env.DB, c.req.header('Cookie') ?? null),
    c.env.DB.prepare('SELECT name FROM orgs WHERE id = ?').bind(org).first<{ name: string }>().catch(() => null),
    c.env.DB.prepare("SELECT platform, display_name FROM accounts WHERE org_id = ? AND status = 'active' ORDER BY id")
      .bind(org).all<{ platform: string; display_name: string | null }>().then((r) => r.results).catch(() => []),
    sourceNames(c.env.DB, org, current.plan.items.map((i) => i.sourceId)),
  ])
  const authors: Record<string, string> = {}
  for (const a of accounts) if (authors[a.platform] === undefined && a.display_name !== null) authors[a.platform] = a.display_name
  const body = planDocScreen({ model, orgName: orgRow?.name ?? 'خطّتي', authors, sources: names, zone: zone ?? null })
  return page((nonce) =>
    soloPage('صدى — خطّةُ النشر', { href: '/panel/plan/review', label: 'المراجعة', at: '/panel/plan/view' }, body, nonce,
      PLAN_DOC_SCRIPT, buildCommands({ onPanel: false }), soloNav('plan')),
  )
})

// ── بناءُ الخطّة في الخلفيّة (D-332) ──────────────────────────────────

/** ما يحمله طلبُ البناء إلى المستهلك: اختياراتُ المعالج كما قُرئت وفُحصت في المسار. */
export type PlanBuildParams = Pick<PlanDeps, 'span' | 'channels' | 'cadence' | 'sources' | 'ideas' | 'autoImage' | 'imageStyle' | 'imageStyles' | 'times' | 'zone' | 'startDay'>

export interface PlanBuildMessage {
  readonly planBuild: { readonly org: string; readonly jobId: string; readonly params: PlanBuildParams }
}

/**
 * **مستهلكُ بناء الخطّة** — يُنادى من طابور التوليد (`index.ts`). يخطّط بـ`planSpan` نفسِها بحرّاسها وسقوفها ودفترها، ويحدّث الحالَ
 * عند كلّ جزء، ثمّ يرسل بنودَ الخطّة للكتابة بـ`enqueuePlan` نفسِها. **والرسالةُ لا تُعاد**: النداءُ مدفوع، وإعادتُه دفعٌ ثانٍ — فالفشلُ
 * يُكتب في الحال بسببه ويُقرأ في شاشته. ورسالةٌ لبناءٍ استُبدل (معرّفٌ غيرُ الجاري) تُترك.
 */
export async function runPlanBuild(env: Env, body: PlanBuildMessage['planBuild']): Promise<void> {
  const { org, jobId, params } = body
  const current = await readBuild(d1BuildStore(env.DB), org)
  if (current === null || current.id !== jobId || current.state === 'done' || current.state === 'failed') return
  const save = (patch: Partial<PlanBuild>): Promise<void> => writeBuild(d1BuildStore(env.DB), org, { ...current, ...patch })
  try {
    await save({ state: 'planning' })
    const outcome = await planSpan({
      db: env.DB, encKey: env.TOKEN_ENC_KEY, workerSecrets: env as unknown as Record<string, string | undefined>, org, ...params,
      onProgress: (done, total) => save({ state: 'planning', done, total }),
    })
    if (outcome.kind !== 'planned') {
      await save({ state: 'failed', note: outcome.reason })
      await record(env.DB, { actor: 'system', action: 'plan.build', target: jobId, detail: (outcome.kind + ': ' + outcome.reason).slice(0, 200) })
      return
    }
    const built = await latestPlan(env.DB, org)
    const started = built === null || (await readSettings(env.DB)).paused ? null : await enqueuePlan(env, org, built)
    await save({ state: 'done', done: outcome.calls, total: outcome.calls, planId: outcome.planId, note: sayPlanned(outcome, params.span ?? 'week', '') })
    await record(env.DB, { actor: 'system', action: 'plan.build', target: outcome.planId, detail: 'planned · ' + String(started?.items ?? 0) + ' بندًا للكتابة' })
  } catch (error) {
    await save({ state: 'failed', note: error instanceof Error ? error.message.slice(0, 200) : 'عطلٌ غير متوقّع' }).catch(() => undefined)
  }
}

plan.get('/panel/plan/building', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return loginResponse(c.env, c.req.raw)
  const found = await readBuild(d1BuildStore(c.env.DB), activeOrg(session.record))
  if (found === null) return c.redirect('/panel/plan', 303)
  const body = planBuildScreen(shownBuild(found, new Date()), new Date())
  return page((nonce) =>
    soloPage('صدى — بناء الخطّة', { href: panelHref('posts'), label: 'المنشورات' }, body, nonce,
      PLAN_BUILD_SCRIPT, buildCommands({ onPanel: false }), soloNav('plan')),
  )
})

/** حالُ البناء JSON لسكربت شاشته — خلف الجلسة، ولا يحمل إلّا الحالَ وعدَّه وسطرَه. */
plan.get('/panel/plan/build.json', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return c.json({ state: 'none' }, 401)
  const found = await readBuild(d1BuildStore(c.env.DB), activeOrg(session.record))
  if (found === null) return c.json({ state: 'none' }, 404)
  const b = shownBuild(found, new Date())
  return c.json({ state: b.state, done: b.done, total: b.total, line: planningLine(b.done, b.total) }, 200, { 'Cache-Control': 'private, no-store' })
})

/**
 * **«الخطّة» غلافُ الورشة** (D-388، بعد D-289 · D-327): المسارُ يحوّل إلى المراجعة `/panel/plan/review` — وهي التي تردّ إلى
 * «خطّة جديدة» حين لا خطّة. وبناءٌ يجري يفتح شاشتَه (D-332) فلا تُرى خطّةٌ قديمةٌ والجديدةُ تُبنى. والخطّةُ ورشةٌ لا وجهةَ
 * رافدة: بابُها «ورشة الخطّة» في رأس التيّار و«افتح الخطّة» على ما يُكتب.
 */
plan.get('/panel/plan', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return loginResponse(c.env, c.req.raw)
  if (running(await readBuild(d1BuildStore(c.env.DB), activeOrg(session.record)), new Date())) return c.redirect('/panel/plan/building', 303)
  return c.redirect('/panel/plan/review', 303)
})

/**
 * **تعديلُ المنشور وسجلُّه** (D-383 المرحلة ٧): الشاشةُ تسأل `mayDo` لتخفي ما لا يُتاح، والأبوابُ الأربعة تسأله ثانيةً على
 * الخادم. والدورُ من الجلسة، فلا يُقبل من النموذج.
 */
plan.get('/panel/plan/post/:id', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return loginResponse(c.env, c.req.raw)
  const org = activeOrg(session.record)
  const id = c.req.param('id')
  const row = await c.env.DB.prepare('SELECT id, platform, status, text, scheduled_at, dispatched_at, rev, edited_in_sada FROM posts WHERE id = ? AND org_id = ?')
    .bind(id, org).first<{ id: string; platform: string; status: string; text: string; scheduled_at: string | null; dispatched_at: string | null; rev: number; edited_in_sada: number }>()
  if (row === null) return c.redirect('/panel/feed', 303)
  const [history, zone, flash, library] = await Promise.all([
    postHistory(c.env.DB, org, id),
    ownerZone(c.env.DB, c.req.header('Cookie') ?? null),
    takeFlash(c.env, c.req.raw),
    listLibrary(c.env.DB, org, 60).catch(() => []),
  ])
  const media = library.filter((a) => a.kind === 'image' && a.origin !== 'drive').slice(0, 30).map((a) => ({ ref: a.ref, name: a.name }))
  const body = postEditScreen({
    id: row.id, platform: row.platform, text: row.text, scheduledAt: row.scheduled_at, rev: row.rev, edited: row.edited_in_sada === 1,
    stage: stageOf(row, new Date()), role: session.record.role ?? 'owner', history, media,
  }, zone ?? null) + (flash === null ? '' : toastRegion(notice({ tone: flash.kind, html: escapeHtml(flash.text), alert: flash.kind === 'bad' })))
  return page((nonce) => soloPage('صدى — تعديل المنشور', { href: '/panel/feed#' + vtName(row.id), label: 'التيّار' }, injectCsrf(body, session.record.csrf), nonce,
    COUNT_SCRIPT, buildCommands({ onPanel: false }), soloNav('plan')))
})

async function editDone(c: Context<{ Bindings: Env }>, id: string, result: ReviseResult | { ok: true; id: string } | { ok: false; reason: string }, to = id): Promise<Response> {
  if ((c.req.header('Accept') ?? '').includes('application/json')) return c.json(result, result.ok ? 200 : 'conflict' in result && result.conflict === true ? 409 : 400)
  const text = result.ok ? ('say' in result ? result.say : 'نُسخ مسوّدةً جديدة.') : result.reason
  await setFlash(c.env, c.req.raw, { kind: result.ok ? 'ok' : 'bad', text })
  return c.redirect('/panel/plan/post/' + encodeURIComponent(to), 303)
}

plan.post('/panel/plan/post/revise', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const f = gate.form
  const id = String(f.get('id') ?? '')
  const org = activeOrg(gate.session.record)
  const text = f.get('text')
  // ‏الموعدُ بساعة المالك من الحقل، ويُحوَّل إلى UTC بمنطقته؛ وما لم يتغيّر لا يُرسل فلا يُفحص كأنّه جديد
  const local = String(f.get('scheduled_local') ?? '')
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local)
  const zone = await storedZone(c.env.DB)
  const utc = m === null ? null : localToUtc(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]), zone)
  if (local !== '' && utc === null) return editDone(c, id, { ok: false, reason: 'الموعد غير مفهوم' })
  const was = await c.env.DB.prepare('SELECT scheduled_at FROM posts WHERE id = ? AND org_id = ?').bind(id, org).first<{ scheduled_at: string | null }>()
  const at = utc === null ? null : utc.toISOString()
  const moved = at !== null && (was?.scheduled_at == null || Date.parse(was.scheduled_at.replace(' ', 'T') + (/[Z+]/.test(was.scheduled_at) ? '' : 'Z')) !== utc!.getTime())
  const mediaRef = String(f.get('media_ref') ?? '')
  const r = await revisePost(c.env.DB, org, id, {
    ...(typeof text === 'string' ? { text } : {}),
    ...(moved ? { scheduledAt: at! } : {}),
  }, Number(f.get('rev')), gate.session.record.email ?? 'owner', gate.session.record.role ?? 'owner', new Date())
  // ‏والوسيطُ بعد الحفظ بطريق المكتبة نفسِه: ما رُبط قبله يُرفض ويُطلق حجزُه، والمنشورُ قد رجع من الطابور فيُقبل
  let out: ReviseResult = r
  if (r.ok && mediaRef !== '') {
    const linked = await attachToPost(c.env.DB, org, id, mediaRef, (x) => rejectMedia(c.env.DB, org, x))
    out = { ...r, say: r.say + (linked.ok ? ' ورُبط الوسيط «' + linked.name + '».' : ' ولم يُربط الوسيط: ' + linked.reason + '.') }
  }
  if (r.ok) await record(c.env.DB, { actor: 'panel', action: 'plan.post.revise', target: id, detail: r.after }, c.req.raw)
  return editDone(c, id, out)
})

plan.post('/panel/plan/post/restore', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const f = gate.form
  const id = String(f.get('id') ?? '')
  const r = await restoreEdit(c.env.DB, activeOrg(gate.session.record), String(f.get('edit') ?? ''), Number(f.get('rev')),
    gate.session.record.email ?? 'owner', gate.session.record.role ?? 'owner', new Date(), id)
  // ‏السجلُّ والعودةُ على المنشور الذي استُعيد فعلًا (`target_id` من النسخة)، لا على ما أرسله النموذج
  const target = r.ok ? r.target : id
  if (r.ok) await record(c.env.DB, { actor: 'panel', action: 'plan.post.restore', target, detail: String(f.get('edit') ?? '').slice(0, 64) }, c.req.raw)
  return editDone(c, target, r)
})

plan.post('/panel/plan/post/hold', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const f = gate.form
  const id = String(f.get('id') ?? '')
  const how = String(f.get('how') ?? '')
  const r = await holdPost(c.env.DB, activeOrg(gate.session.record), id, how === 'pause' ? { pause: true } : { minutes: Number(how) },
    gate.session.record.email ?? 'owner', gate.session.record.role ?? 'owner', new Date())
  if (r.ok) await record(c.env.DB, { actor: 'panel', action: 'plan.post.hold', target: id, detail: how.slice(0, 16) }, c.req.raw)
  return editDone(c, id, r)
})

plan.post('/panel/plan/post/copy', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const id = String(gate.form.get('id') ?? '')
  const r = await copyToDraft(c.env.DB, activeOrg(gate.session.record), id, gate.session.record.email ?? 'owner', gate.session.record.role ?? 'owner', new Date())
  if (r.ok) await record(c.env.DB, { actor: 'panel', action: 'plan.post.copy', target: id, detail: r.id }, c.req.raw)
  return editDone(c, id, r, r.ok ? r.id : id)
})

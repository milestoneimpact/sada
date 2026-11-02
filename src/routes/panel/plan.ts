/**
 * مسارات اللوحة — الخطّة الشهريّة واستيرادُها من ملفّ.
 *
 * جزءٌ من `panel.ts` قُسم على أقسامه (D-278) بلا تغييرٍ في سلوك.
 */
import { DRAFT_IMAGE_MODEL, FINAL_IMAGE_MODEL, freeImagesLeft, imageNeurons, neuronsUsedToday } from '../../lib/ai/imagePricing'
import { Hono } from 'hono'
import type { Env } from '../../env'
import {
  applyPlan, DEFAULT_ZONE, MAX_PLAN_BYTES, PLAN_TEMPLATE, readPlan, type PlanFacts,
} from '../../lib/plan/import'
import { planImportExpired, planImportScreen } from '../ui/planImportView'
import { PLAN_NEW_SCRIPT, planNewScreen } from '../ui/planNewView'
import { taskReadyAlone } from './home'
import { allows } from '../../lib/access'
import { counted, NOUNS, money } from '../../lib/format'
import { platformLabel } from '../../lib/oauth/providers'
import { estimateLine, estimatePlan, unitCosts } from '../../lib/estimate'
import { readBrief } from '../../lib/brief'
import { IDEA_MAX } from '../../lib/draft/job'
import { asImageStyle, asSpan, CLIP_CHANNELS, isPlanPlatform, type Cadence, type PlanPlatform } from '../../lib/plan/prompt'
import { sayApprovedAll, sayPlanned, sayStarted, sayUnlinked } from '../../lib/plan/say'
import { listUploads } from '../../lib/media/uploads'
import { soloNav } from '../ui/rail'
import { buildCommands } from '../ui/command'
import { panelHref } from '../../lib/nav/panes'
import { approvePlan, ideaOf, latestPlan, planSpan } from '../../lib/plan/job'
import { readSettings } from '../../lib/settings'
import { activeOrg } from '../../lib/tenancy'
import { loadSession } from '../../lib/session'
import { CHANNELS, listAccounts } from '../../lib/channels'
import { ownerZone } from '../../lib/time/ownerZone'
import { addPlanItem, editPlanItem, removePlanItem } from '../../lib/plan/edit'
import { approvePlanDrafts, schedulePlan } from '../../lib/plan/schedule'
import { injectCsrf, soloPage } from '../ui/shell'
import { record } from '../../lib/audit'
import { type PanelFlash } from '../panelView'
import { deciderOf, finalizeLater, page, loginResponse, setFlash, guardPost, reachNow, back } from './shared'

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
  for (const ch of channels) {
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
    ...(/^\d{4}-\d{2}-\d{2}$/.test(startRaw) ? { startDay: startRaw } : {}),
  })

  // ‏والتقديرُ قبل «ابدأ» (D-257 · D-282): ما سيُكتب وما سيُرسم، بوسيط ما أُنفق فعلًا — فلا إنفاقَ قبل أن يرى المالكُ الرقم
  const wanted = autoImage ?? (await readSettings(c.env.DB)).autoImage
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
  if (session.record.pending) return c.redirect('/panel/2fa', 303)
  const org = activeOrg(session.record)
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
  const body = planNewScreen({
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
    autoImage: settings.autoImage,
    ready,
    replacing: current !== null,
    // ‏ما أُضيف للتوّ بلا سكربت يُحدَّد (D-284) — ومن المحلَّل وحدَه، لا معرّفًا يكتبه أحد
    picked: analyzed.results.some((s) => s.id === c.req.query('picked')) ? c.req.query('picked') ?? null : null,
    // ‏إضافةُ مصدرٍ تحليلٌ مدفوع: للمدير فأعلى كزرّ «حلّل» (D-272)
    canAdd: allows(session.record.role ?? 'owner', 'admin'),
  })
  return page((nonce) =>
    soloPage('صدى — خطّة جديدة', { href: panelHref('posts'), label: 'المنشورات' }, injectCsrf(body, session.record.csrf), nonce,
      PLAN_NEW_SCRIPT, buildCommands({ onPanel: false }), soloNav('posts')),
  )
})

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
  if (plan.status === 'draft') await approvePlan(c.env.DB, plan.id, org)
  const seen = new Set<string>()
  const items = plan.plan.items.filter((i) => {
    const k = `${i.sourceId}:${i.platform}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  // ‏واختيارُ الصورة من الخطّة (D-282) — وما قبل 0037 بلا اختيارٍ فيُترك للإعداد العامّ
  const autoImage = plan.choices.channels.length === 0 ? undefined : plan.choices.autoImage
  if (items.length > 0) {
    await c.env.GENERATE_QUEUE.sendBatch(items.map((i) => {
      const idea = ideaOf(i.sourceId, plan.choices)
      return {
        body: { draft: {
          sourceId: i.sourceId, platform: i.platform, org, planId: plan.id,
          ...(i.asset === undefined ? {} : { asset: i.asset }),
          ...(idea === null ? {} : { idea }),
          ...(autoImage === undefined ? {} : { autoImage }),
          imageStyle: plan.choices.imageStyle,
        } },
      }
    }))
  }
  // ‏بندُ مقطعٍ بلا أصل لا يفشل ولا يُرسَم له شيء: مسوّدتُه تنتظر مقطعًا — يُقال الآن لا عند الجدولة
  const clips = items.filter((i) => CLIP_CHANNELS.has(i.platform) && i.asset === undefined).length
  const images = autoImage ?? settings.autoImage
  await record(c.env.DB, { actor: 'panel', action: 'plan.start', target: plan.id, detail: `${items.length} بندًا` }, c.req.raw)
  await setFlash(c.env, c.req.raw, { kind: 'ok', text: sayStarted(items.length, images, clips) })
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
  await record(c.env.DB, { actor: 'panel', action: 'plan.approve_all', target: plan.id, detail: `${done.done} اعتُمدت · ${done.failed.length} تعثّرت` }, c.req.raw)
  await setFlash(c.env, c.req.raw, {
    kind: done.done === 0 && done.failed.length === 0 ? 'warn' : done.failed.length === 0 ? 'ok' : done.done === 0 ? 'bad' : 'warn',
    text: sayApprovedAll(done.done, done.failed),
  })
  return c.redirect('/panel/client', 303)
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
  if (session.record.pending) return c.redirect('/panel/2fa', 303)
  const id = c.req.param('id')
  const csv = await c.env.KV.get(`plan-import:${id}`)
  if (csv === null) {
    // ‏معاينةٌ تُركت مفتوحةً أكثرَ من ساعتين ثمّ حُدّثت: صفحةٌ بالرافدة وطريقٍ إلى الرفع، لا نصٌّ خامّ (7.11)
    return page((nonce) =>
      soloPage('صدى — معاينة الخطّة', { href: panelHref('plan-import'), label: 'المنشورات' },
        planImportExpired(), nonce, '', buildCommands({ onPanel: false }), soloNav('posts')), 404)
  }
  const read = readPlan(csv, await planFacts(c.env, activeOrg(session.record), c.req.header('Cookie') ?? null, new Date()))
  const reach = await reachNow(c.env.DB, activeOrg(session.record))
  // ‏«بتوقيت الرياض» حين لا منطقةَ عُرفت: هي ما قرأ به `planFacts` الأيّامَ (D-202)
  const fallback = (await ownerZone(c.env.DB, c.req.header('Cookie') ?? null)) === null
  return page((nonce) =>
    soloPage('صدى — معاينة الخطّة', { href: panelHref('plan-import'), label: 'المنشورات' },
      injectCsrf(planImportScreen(id, read, new Date(), reach, fallback), session.record.csrf), nonce, '',
      buildCommands({ onPanel: false }), soloNav('posts')),
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

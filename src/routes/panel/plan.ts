/**
 * مسارات اللوحة — الخطّة الشهريّة واستيرادُها من ملفّ.
 *
 * جزءٌ من `panel.ts` قُسم على أقسامه (D-272) بلا تغييرٍ في سلوك.
 */
import { Hono } from 'hono'
import type { Env } from '../../env'
import {
  applyPlan, DEFAULT_ZONE, MAX_PLAN_BYTES, PLAN_TEMPLATE, readPlan, type PlanFacts,
} from '../../lib/plan/import'
import { planImportExpired, planImportScreen } from '../ui/planImportView'
import { counted, NOUNS, money } from '../../lib/format'
import { listUploads } from '../../lib/media/uploads'
import { soloNav } from '../ui/rail'
import { buildCommands } from '../ui/command'
import { panelHref } from '../../lib/nav/panes'
import { approvePlan, latestPlan, planWeek } from '../../lib/plan/job'
import { readSettings } from '../../lib/settings'
import { activeOrg } from '../../lib/tenancy'
import { loadSession } from '../../lib/session'
import { CHANNELS, listAccounts } from '../../lib/channels'
import { ownerZone } from '../../lib/time/ownerZone'
import { addPlanItem, editPlanItem, removePlanItem } from '../../lib/plan/edit'
import { schedulePlan } from '../../lib/plan/schedule'
import { injectCsrf, soloPage } from '../ui/shell'
import { record } from '../../lib/audit'
import { type PanelFlash } from '../panelView'
import { deciderOf, page, loginResponse, setFlash, guardPost, reachNow, back } from './shared'

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

  // ‏لعميلِ الجلسة، وأسبوعًا أو شهرًا من قائمةٍ مغلقة (D-256)
  const span = gate.form.get('span') === 'month' ? 'month' : 'week'
  const outcome = await planWeek({
    db: c.env.DB,
    encKey: c.env.TOKEN_ENC_KEY,
    workerSecrets: c.env as unknown as Record<string, string | undefined>,
    org: activeOrg(gate.session.record),
    span,
  })

  const flash: PanelFlash =
    outcome.kind === 'planned'
      ? {
          kind: 'ok',
          text: `خطّة ${span === 'month' ? 'شهر يبدأ' : 'أسبوع'} ${outcome.week}: ${outcome.items} بندا${
            outcome.dropped === 0 ? '' : ` (وأُسقط ${outcome.dropped}: ${outcome.droppedWhy})`
          }، ${
            // وصفرٌ مع وحداتٍ مستهلَكةٍ ليس مجّانا بل سعرٌ لم يُضبط (D-008).
            // و«وحدة» لا «رمز» (D-155): الرمزُ في اللوحة رمزُ التطبيق والاسترداد
            outcome.cost === 0 && outcome.units > 0
              ? `و${outcome.units} وحدةً بلا سعر مضبوط للمزوّد — سُجّلت صفرا موسوما`
              : `الكلفة ${money(outcome.cost)}`
          }.`,
        }
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
  if (items.length > 0) {
    await c.env.GENERATE_QUEUE.sendBatch(items.map((i) => ({
      body: { draft: { sourceId: i.sourceId, platform: i.platform as 'linkedin' | 'x', org, planId: plan.id, ...(i.asset === undefined ? {} : { asset: i.asset }) } },
    })))
  }
  await record(c.env.DB, { actor: 'panel', action: 'plan.start', target: plan.id, detail: `${items.length} بندًا` }, c.req.raw)
  await setFlash(c.env, c.req.raw, {
    kind: 'ok',
    text: `بدأ العمل: ${items.length} ${items.length === 1 ? 'مسوّدة تُكتب' : 'مسوّدات تُكتب'} في الخلفيّة${
      settings.autoImage ? ' مع صورها' : ''}، وتظهر في «تنتظر قرارك» خلال دقائق. ولا يُنشر منها شيءٌ قبل اعتمادك.`,
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

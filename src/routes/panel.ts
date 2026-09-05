/**
 * مسارات اللوحة.
 *
 * منفصلةٌ عن `/admin/*` عمدا: تلك تُنادى برمزٍ في ترويسة من طرفيّة، وهذه
 * بكعكة جلسةٍ من متصفّح. وخلطُ آليّتي مصادقة في مسارٍ واحد يصنع بابا لا
 * يُفحَص إلا في إحداهما.
 *
 * **وكلّ فعلٍ هنا يمرّ بالقيود نفسها** التي يمرّ بها نداءُ الطرفيّة: زرٌّ
 * في صفحةٍ ليس طريقا جانبيّا حول الحارس.
 */
import { Hono } from 'hono'
import type { Env } from '../env'
import { isConfigured, PROVIDERS, routeStatuses, type ProviderName } from '../lib/ai/registry'
import { dailySpend, spendByProvider } from '../lib/ai/spend'
import { analyzeSource } from '../lib/analyze/job'
import { scanDrive } from '../lib/drive/job'
import { money } from '../lib/format'
import { checkAllowance } from '../lib/limits'
import { attemptState, clearAttempts, delayMs, recordFailure } from '../lib/rateLimit'
import { writeSetting, type SettingKey } from '../lib/settings'
import {
  clearedCookie, COOKIE, createSession, destroySession, readCookie,
  sessionCookie, validSession,
} from '../lib/session'
import { loginPage, panelPage, type PanelFlash, type PanelSource } from './panelView'

export const panel = new Hono<{ Bindings: Env }>()

const HTML = { 'Content-Type': 'text/html; charset=utf-8' } as const

/**
 * الإشعار يُخزَّن في KV بمفتاح الجلسة لا في عنوان الصفحة.
 *
 * لو حُمل في `?msg=` لصنع رابطا يعرض رسالةً ملفّقة لمن يفتحه — «تمّ
 * الحذف» مثلا. وهنا لا يكتبه إلا الخادم، ويُقرأ مرّةً ويُمحى.
 */
async function setFlash(env: Env, request: Request, flash: PanelFlash): Promise<void> {
  const id = readCookie(request.headers.get('Cookie'), COOKIE)
  if (id === null) return
  await env.KV.put(`flash:${id}`, JSON.stringify(flash), { expirationTtl: 60 })
}

async function takeFlash(env: Env, request: Request): Promise<PanelFlash | null> {
  const id = readCookie(request.headers.get('Cookie'), COOKIE)
  if (id === null) return null
  const key = `flash:${id}`
  const raw = await env.KV.get(key)
  if (raw === null) return null
  await env.KV.delete(key)
  try {
    return JSON.parse(raw) as PanelFlash
  } catch {
    return null
  }
}

/** كلّ فعلٍ يعود إلى القسم الذي انطلق منه — لا إلى رأس الصفحة. */
function back(hash: string): Response {
  return new Response(null, { status: 303, headers: { Location: `/panel#${hash}` } })
}

interface SourceRow {
  id: string
  drive_file_id: string
  name: string
  content_hash: string
  last_seen_at: string
  worth_score: number | null
  summary: string | null
  themes_json: string | null
}

function toPanelSource(row: SourceRow): PanelSource {
  let hash: string | null = null
  let themes: string[] = []
  let reason: string | null = null
  if (row.themes_json !== null) {
    try {
      const parsed = JSON.parse(row.themes_json) as { hash?: string; themes?: unknown; reason?: string }
      hash = parsed.hash ?? null
      themes = Array.isArray(parsed.themes) ? parsed.themes.map(String) : []
      reason = parsed.reason ?? null
    } catch {
      hash = null
    }
  }
  const analyzed = hash !== null
  return {
    id: row.id,
    driveFileId: row.drive_file_id,
    name: row.name,
    analyzed,
    stale: analyzed && hash !== row.content_hash,
    worth: analyzed ? row.worth_score : null,
    summary: analyzed ? row.summary : null,
    reason,
    themes,
    lastSeenAt: row.last_seen_at,
  }
}

panel.get('/panel', async (c) => {
  if (!(await validSession(c.env.KV, c.req.raw))) {
    return c.html(loginPage(), 200, HTML)
  }

  const allowance = await checkAllowance(c.env.DB)

  let sources: PanelSource[] = []
  try {
    const { results } = await c.env.DB.prepare(
      `SELECT s.id, s.drive_file_id, s.name, s.content_hash, s.last_seen_at,
              i.worth_score, i.summary, i.themes_json
         FROM sources s
         LEFT JOIN content_items i ON i.source_id = s.id
        ORDER BY s.last_seen_at DESC
        LIMIT 200`,
    ).all<SourceRow>()
    sources = results.map(toPanelSource)
  } catch {
    sources = []
  }

  let spend: Awaited<ReturnType<typeof spendByProvider>> = {}
  try {
    spend = await spendByProvider(c.env.DB, 30)
  } catch {
    spend = {}
  }
  const series = (await dailySpend(c.env.DB, 14)).map((d) => ({ day: d.day, total: d.total }))

  return c.html(
    panelPage({
      paused: allowance.settings.paused,
      analysisCap: allowance.settings.dailyAnalysisCap,
      spendCap: allowance.settings.dailySpendCapUsd,
      // لانهاية تعني دفترا لا يُقرأ — تُعرض صفرا لا `Infinity` في الشاشة
      usedAnalyses: Number.isFinite(allowance.usage.analyses) ? allowance.usage.analyses : 0,
      usedSpend: Number.isFinite(allowance.usage.spend) ? allowance.usage.spend : 0,
      spend30d: Object.values(spend).reduce((sum, e) => sum + (e?.total ?? 0), 0),
      series,
      sources,
      providers: (Object.keys(PROVIDERS) as ProviderName[]).map((name) => ({
        name,
        label: PROVIDERS[name].label,
        configured: isConfigured(c.env, name),
        secretName: String(PROVIDERS[name].secret),
        howToGet: PROVIDERS[name].docs,
        calls: spend[name]?.calls ?? 0,
        spend: spend[name]?.total ?? 0,
      })),
      routing: routeStatuses(c.env).map((r) => ({
        task: r.task, model: r.model, why: r.why, ready: r.ready, implemented: r.implemented,
      })),
      postsBuilt: false,
      flash: await takeFlash(c.env, c.req.raw),
      now: new Date(),
    }),
    200,
    HTML,
  )
})

/**
 * الدخول — بحدٍّ للمحاولات.
 *
 * والتأخير قبل الردّ متصاعد لا رفضٌ فوريّ: زمنُ الردّ نفسه يخبر المخمّن
 * أنّه مُنع فيبدّل عنوانه ويستأنف.
 */
panel.post('/panel/login', async (c) => {
  const state = await attemptState(c.env.KV, c.req.raw)
  if (state.blocked) {
    return c.html(
      loginPage({ error: 'تجاوزتَ حدّ المحاولات. انتظر ربع ساعة ثمّ أعد المحاولة.', blocked: true }),
      429,
      HTML,
    )
  }

  const form = await c.req.formData()
  const result = await createSession(c.env.KV, c.env.ADMIN_TOKEN, String(form.get('token') ?? ''))

  if ('error' in result) {
    if (result.error === 'disabled') {
      return c.html(
        loginPage({ error: 'ADMIN_TOKEN غير مضبوط على هذه البيئة — اللوحة مقفلة لا مفتوحة.' }),
        401,
        HTML,
      )
    }
    const after = await recordFailure(c.env.KV, c.req.raw)
    const wait = delayMs(after.attempts)
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
    return c.html(
      loginPage({
        error: after.blocked
          ? 'تجاوزتَ حدّ المحاولات. انتظر ربع ساعة ثمّ أعد المحاولة.'
          : `رمزٌ غير صحيح — بقيت ${after.remaining} محاولات.`,
        blocked: after.blocked,
      }),
      401,
      HTML,
    )
  }

  await clearAttempts(c.env.KV, c.req.raw)
  return new Response(null, {
    status: 303,
    headers: { Location: '/panel', 'Set-Cookie': sessionCookie(result.id) },
  })
})

panel.post('/panel/logout', async (c) => {
  await destroySession(c.env.KV, c.req.raw)
  return new Response(null, {
    status: 303,
    headers: { Location: '/panel', 'Set-Cookie': clearedCookie() },
  })
})

const WRITABLE: ReadonlySet<string> = new Set<SettingKey>([
  'paused', 'daily_analysis_cap', 'daily_spend_cap_usd',
])

const LABEL: Readonly<Record<string, string>> = {
  daily_analysis_cap: 'سقف التحليل اليوميّ',
  daily_spend_cap_usd: 'سقف الإنفاق اليوميّ',
}

/**
 * تغيير إعداد.
 *
 * الحماية من CSRF هي `SameSite=Strict` على الكعكة: المتصفّح لا يرسلها مع
 * طلبٍ نشأ في موقعٍ آخر، فلا يصل الطلب مصادَقا أصلا.
 *
 * ومفاتيح الكتابة **قائمةُ سماحٍ لا منع**: مفتاحٌ جديد في القاعدة لا
 * يصير قابلا للكتابة من الشبكة لمجرّد وجوده.
 */
panel.post('/panel/settings', async (c) => {
  if (!(await validSession(c.env.KV, c.req.raw))) {
    return c.html(loginPage({ error: 'انتهت الجلسة — أعد الدخول.' }), 401, HTML)
  }

  const form = await c.req.formData()
  const key = String(form.get('key') ?? '')
  const value = String(form.get('value') ?? '')
  if (!WRITABLE.has(key)) return c.json({ error: 'unknown_setting' }, 400)

  const result = await writeSetting(c.env.DB, key as SettingKey, value, 'panel')

  // الإشعار يقول ما وقع **فعلا** لا ما طُلب: قيمةٌ قُصّت تُذكر بقصّها
  let flash: PanelFlash
  if (key === 'paused') {
    flash = result.stored === 'true'
      ? { kind: 'warn', text: 'أُوقف النظام. لا نداء مدفوع ولا مسح ولا نشر حتّى تستأنفه.' }
      : { kind: 'ok', text: 'استُؤنف العمل.' }
  } else if (result.clamped) {
    flash = {
      kind: 'warn',
      text: `${LABEL[key] ?? key}: القيمة ${value} خارج المدى — حُفظت ${result.stored}.`,
    }
  } else {
    flash = { kind: 'ok', text: `${LABEL[key] ?? key}: حُفظ ${result.stored}.` }
  }

  await setFlash(c.env, c.req.raw, flash)
  return back('settings')
})

/** مسح Drive من اللوحة — المسار نفسه الذي يشغّله Cron، لا نسخةٌ ثانية. */
panel.post('/panel/scan', async (c) => {
  if (!(await validSession(c.env.KV, c.req.raw))) {
    return c.html(loginPage({ error: 'انتهت الجلسة — أعد الدخول.' }), 401, HTML)
  }

  try {
    const report = await scanDrive({
      db: c.env.DB,
      serviceAccountJson: c.env.GOOGLE_SA_JSON,
      folderId: c.env.DRIVE_FOLDER_ID,
    })
    const parts = [`رأى ${report.seen}`]
    if (report.added.length > 0) parts.push(`جديد ${report.added.length}`)
    if (report.changed.length > 0) parts.push(`تغيّر ${report.changed.length}`)
    if (report.missing.length > 0) parts.push(`مفقود ${report.missing.length}`)
    await setFlash(c.env, c.req.raw, {
      kind: 'ok',
      text: `تمّ المسح — ${parts.join(' · ')}. ${report.toAnalyze.length} تنتظر تحليلا.`,
    })
  } catch (error) {
    await setFlash(c.env, c.req.raw, {
      kind: 'bad',
      text: `تعذّر المسح: ${error instanceof Error ? error.message : 'عطل غير متوقّع'}`,
    })
  }
  return back('sources')
})

/**
 * تحليل مصدر من اللوحة.
 *
 * يمرّ بـ `analyzeSource` نفسه — بسقوفه وإيقافه: **زرٌّ في صفحةٍ ليس
 * طريقا جانبيّا حول الحارس.**
 */
panel.post('/panel/analyze', async (c) => {
  if (!(await validSession(c.env.KV, c.req.raw))) {
    return c.html(loginPage({ error: 'انتهت الجلسة — أعد الدخول.' }), 401, HTML)
  }

  const form = await c.req.formData()
  const outcome = await analyzeSource(
    {
      db: c.env.DB,
      serviceAccountJson: c.env.GOOGLE_SA_JSON,
      anthropicKey: c.env.ANTHROPIC_API_KEY,
    },
    String(form.get('id') ?? ''),
  )

  const flash: PanelFlash =
    outcome.kind === 'analyzed'
      ? { kind: 'ok', text: `تمّ التحليل — الاستحقاق ${outcome.worth.toFixed(2)}، الكلفة ${money(outcome.cost)}.` }
      : outcome.kind === 'already'
        ? { kind: 'ok', text: 'محلَّل بالفعل بنسخته الحاليّة — لم يُنفَق شيء.' }
        : outcome.kind === 'blocked'
          ? { kind: 'warn', text: outcome.reason }
          : outcome.kind === 'skipped'
            ? { kind: 'warn', text: `تُخطّي: ${outcome.reason}` }
            : { kind: 'bad', text: `تعذّر التحليل: ${outcome.reason}` }

  await setFlash(c.env, c.req.raw, flash)
  return back('sources')
})

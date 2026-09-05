/**
 * مسارات اللوحة.
 *
 * منفصلةٌ عن `/admin/*` عمدا: تلك تُنادى برمزٍ في ترويسة من طرفيّة أو
 * سكربت، وهذه بكعكة جلسةٍ من متصفّح. وخلطُ آليّتي مصادقة في مسارٍ واحد
 * يصنع بابا لا يُفحَص إلا في إحداهما.
 */
import { Hono } from 'hono'
import type { Env } from '../env'
import { isConfigured, PROVIDERS, routeStatuses, type ProviderName } from '../lib/ai/registry'
import { spendByProvider } from '../lib/ai/spend'
import { checkAllowance } from '../lib/limits'
import { writeSetting, type SettingKey } from '../lib/settings'
import {
  clearedCookie,
  createSession,
  destroySession,
  sessionCookie,
  validSession,
} from '../lib/session'
import { loginPage, panelPage, type PanelSource } from './panelView'

export const panel = new Hono<{ Bindings: Env }>()

const HTML = { 'Content-Type': 'text/html; charset=utf-8' } as const

/** يُقرأ من `sources` مع تحليلها في استعلامٍ واحد. */
interface SourceRow {
  id: string
  drive_file_id: string
  name: string
  mime: string
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
      const parsed = JSON.parse(row.themes_json) as {
        hash?: string
        themes?: unknown
        reason?: string
      }
      hash = parsed.hash ?? null
      themes = Array.isArray(parsed.themes) ? parsed.themes.map(String) : []
      reason = parsed.reason ?? null
    } catch {
      // تحليلٌ فاسدٌ في صفٍّ واحد لا يُسقط اللوحة كلّها
      hash = null
    }
  }
  const analyzed = hash !== null
  return {
    id: row.id,
    driveFileId: row.drive_file_id,
    name: row.name,
    mime: row.mime,
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
      `SELECT s.id, s.drive_file_id, s.name, s.mime, s.content_hash, s.last_seen_at,
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

  const providers = (Object.keys(PROVIDERS) as ProviderName[]).map((name) => ({
    name,
    label: PROVIDERS[name].label,
    configured: isConfigured(c.env, name),
    secretName: String(PROVIDERS[name].secret),
    howToGet: PROVIDERS[name].docs,
    calls: spend[name]?.calls ?? 0,
    spend: spend[name]?.total ?? 0,
  }))

  return c.html(
    panelPage({
      paused: allowance.settings.paused,
      analysisCap: allowance.settings.dailyAnalysisCap,
      spendCap: allowance.settings.dailySpendCapUsd,
      // لانهاية تعني دفترا لا يُقرأ — تُعرض صفرا لا `Infinity` في الشاشة
      usedAnalyses: Number.isFinite(allowance.usage.analyses) ? allowance.usage.analyses : 0,
      usedSpend: Number.isFinite(allowance.usage.spend) ? allowance.usage.spend : 0,
      spend30d: Object.values(spend).reduce((sum, e) => sum + (e?.total ?? 0), 0),
      sources,
      providers,
      routing: routeStatuses(c.env).map((r) => ({
        task: r.task,
        model: r.model,
        why: r.why,
        ready: r.ready,
        implemented: r.implemented,
      })),
      /** لا طبقة كتابة بعد — يُقال صراحةً لا يُعرض جدولٌ فارغ */
      postsBuilt: false,
    }),
    200,
    HTML,
  )
})

panel.post('/panel/login', async (c) => {
  const form = await c.req.formData()
  const token = String(form.get('token') ?? '')
  const result = await createSession(c.env.KV, c.env.ADMIN_TOKEN, token)

  if ('error' in result) {
    const message =
      result.error === 'disabled'
        ? 'ADMIN_TOKEN غير مضبوط على هذه البيئة — اللوحة مقفلة لا مفتوحة.'
        : 'رمزٌ غير صحيح.'
    // 401 لا 200: الردّ يقول الحقيقة للآلة كما للإنسان
    return c.html(loginPage(message), 401, HTML)
  }

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
  'paused',
  'daily_analysis_cap',
  'daily_spend_cap_usd',
])

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
    return c.html(loginPage('انتهت الجلسة — أعد الدخول.'), 401, HTML)
  }

  const form = await c.req.formData()
  const key = String(form.get('key') ?? '')
  const value = String(form.get('value') ?? '')

  if (!WRITABLE.has(key)) {
    return c.json({ error: 'unknown_setting' }, 400)
  }

  await writeSetting(c.env.DB, key as SettingKey, value, 'panel')
  return new Response(null, { status: 303, headers: { Location: '/panel' } })
})

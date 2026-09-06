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
import type { TaskName } from '../lib/ai/registry'

/** أسماء أسرار المدمَجين — سرٌّ في البيئة يغلب ما في الجدول. */
const BUILTIN_SECRET: Readonly<Record<string, string>> = {
  anthropic: 'ANTHROPIC_API_KEY',
  gemini: 'GEMINI_API_KEY',
}
const BUILTIN_DOCS: Readonly<Record<string, string>> = {
  anthropic: 'console.anthropic.com ← API Keys',
  gemini: 'aistudio.google.com/apikey',
}
import { dailySpend, spendByProvider, spendTodayFor } from '../lib/ai/spend'
import { verifyKey } from '../lib/ai/verify'
import { analyzeSource } from '../lib/analyze/job'
import { draftPost } from '../lib/draft/job'
import type { Platform } from '../lib/draft/prompt'
import { decide, listDrafts } from '../lib/draft/store'
import { generateForPost, mediaFor, rejectMedia } from '../lib/image/job'
import { animateForPost, pickBinding } from '../lib/media/video'
import { approvePlan, latestPlan, planWeek } from '../lib/plan/job'
import { appStatuses, deleteApp, readApp, recordVerification, saveApp } from '../lib/oauth/apps'
import { verifyAppCredentials } from '../lib/oauth/verify'
import { PROVIDERS, redirectUri as callbackUri } from '../lib/oauth/providers'
import { schedulePost, unschedule } from '../lib/schedule/job'
import { scanDrive } from '../lib/drive/job'
import { money } from '../lib/format'
import { checkAllowance } from '../lib/limits'
import { attemptState, clearAttempts, delayMs, recordFailure } from '../lib/rateLimit'
import {
  costOf, deleteProvider, getProvider, listProviders, markVerified,
  normalizeName, resolveKey, saveKey, setEnabled, upsertProvider,
  type Provider,
} from '../lib/providers'
import { checkProviderUrl } from '../lib/ai/urlGuard'
import { verifyCompat } from '../lib/ai/openaiCompat'
import { readRoutes, writeRoute } from '../lib/ai/routes'
import { readSettings, writeSetting, type SettingKey } from '../lib/settings'
import {
  checkCsrf, clearedCookie, COOKIE, createSession, destroySession, listSessions,
  loadSession, readCookie, revokeSessions, sessionCookie, type Session,
} from '../lib/session'
import { htmlHeaders, makeNonce } from '../lib/security/headers'
import { factorState } from '../lib/security/factors'
import { CHANNELS, listAccounts, viewChannels } from '../lib/channels'
import { grantedScopes, platformPosts, platformTally } from '../lib/platform/screen'
import { metricsFor } from '../lib/metrics/job'
import { listReports, readReport } from '../lib/report/weekly'
import { decide as decidePromotion, openSuggestions } from '../lib/report/promote'
import { reportScreen } from './ui/reportView'
import { ownerRows, pendingCount, type OwnerFacts } from '../lib/owner'
import { tasksScreen } from './ui/tasksView'
import { currentPhase, gatesOf, readGateFacts } from '../lib/gates'
import { expiringTokens } from '../lib/token/expiry'
import { platformScreen, showOf } from './ui/platformView'
import { shell, themeSwitch, THEME_SCRIPT } from './ui/shell'
import { relyingParty } from '../lib/security/rp'
import { record, recentAudit } from '../lib/audit'
import { loginPage, panelPage, type PanelFlash, type PanelSource } from './panelView'

export const panel = new Hono<{ Bindings: Env }>()

/**
 * صفحةُ HTML بترويساتها كاملةً.
 *
 * الـ `nonce` يُولَّد **قبل** الرسم لأنّه يدخل في الوسوم نفسها، ويخرج في
 * الترويسة. فلا سبيل إلى رسم صفحةٍ بلا سياسةٍ تحرسها: من نادى هذه الدالّة
 * نال الاثنين معا.
 */
function page(render: (nonce: string) => string, status = 200): Response {
  const nonce = makeNonce()
  return new Response(render(nonce), { status, headers: htmlHeaders(nonce) })
}

/** صفحةُ دخولٍ برسالة. تُستعمل حين تسقط الجلسة في منتصف عمل. */
function loginResponse(error: string, status = 401): Response {
  return page((nonce) => loginPage({ error }, nonce), status)
}

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

/**
 * بوّابةُ كلّ فعلٍ في اللوحة: جلسةٌ صالحة، ثمّ رمزُ CSRF.
 *
 * **وهي تقرأ النموذج بنفسها وتردّه.** ولو تركتُ كلّ مسارٍ يقرأ نموذجه ثمّ
 * ينادي حارسا، لأمكن أن يُكتب مسارٌ يقرأ ولا ينادي — والجسدُ لا يُقرأ
 * مرّتين فلا سبيل إلى حارسٍ يسبق. فمن أراد النموذج مرّ من هنا، ومن لم
 * يمرّ لا نموذج له.
 *
 * وترتيبُ الفحصين مقصود: الجلسةُ أوّلا لأنّ رمز CSRF يُقرأ منها.
 */
async function guardPost(c: {
  env: Env
  req: { raw: Request; formData: () => Promise<FormData> }
}): Promise<{ denied: Response } | { form: FormData; session: Session }> {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) {
    return { denied: loginResponse('انتهت الجلسة — أعد الدخول.') }
  }
  // **وهذا هو ما يجعل العامل الثاني عاملا لا سؤالا يُتخطّى**: جلسةٌ لم
  // تُتمّه لا تغيّر شيئا، ولو نُودي المسار مباشرةً بلا مرورٍ بالشاشة
  if (session.record.pending) {
    return {
      denied: Response.json(
        { error: 'pending_second_factor', detail: 'أتمّ العامل الثاني أوّلا.' },
        { status: 403, headers: { Location: '/panel/2fa' } },
      ),
    }
  }

  // جسدٌ غائبٌ أو مشوَّه ليس عطلا في الخادم: هو طلبٌ لا رمز فيه. ولو تُرك
  // يرمي لردّ 500 — فيبدو خللا في صدى وهو طلبٌ مرفوض
  let form: FormData
  try {
    form = await c.req.formData()
  } catch {
    form = new FormData()
  }

  if (!(await checkCsrf(session, String(form.get('_csrf') ?? '')))) {
    // 403 لا 401: الجلسةُ قائمة، والطلبُ هو المرفوض. ولا يُعاد رسمُ صفحةِ
    // دخولٍ هنا فيظنّ المالك أنّ جلسته سقطت وهي لم تسقط.
    await record(
      c.env.DB,
      { actor: 'panel', action: 'csrf.reject', target: new URL(c.req.raw.url).pathname },
      c.req.raw,
    )
    return {
      denied: Response.json(
        { error: 'csrf_failed', detail: 'رمز النموذج لا يطابق الجلسة. أعد تحميل اللوحة.' },
        { status: 403 },
      ),
    }
  }

  return { form, session }
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
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) {
    const rp = relyingParty(c.env.PUBLIC_BASE_URL)
    const factors = await factorState(c.env.DB, rp.id)
    return page((nonce) => loginPage({ passkeys: factors.passkeys.length > 0 }, nonce), 200)
  }
  // الجلسةُ المعلَّقة لا تفتح اللوحة — ولا تُبنى لها بياناتُها أصلا
  if (session.record.pending) return c.redirect('/panel/2fa', 303)

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

  // حال كلّ مزوّد: مدمَجا كان أو مضافا من اللوحة
  const stored = await listProviders(c.env.DB)
  const providerCards = await Promise.all(
    stored.map(async (p) => {
      // السرّ يخصّ المدمَجين وحدهم: المضاف لا سرّ له في البيئة
      const secretName = p.builtin ? (BUILTIN_SECRET[p.name] ?? null) : null
      const workerSecret =
        secretName === null ? undefined : (c.env[secretName as keyof Env] as string | undefined)
      const resolved = await resolveKey(c.env.DB, c.env.TOKEN_ENC_KEY, p.name, workerSecret)
      const today = await spendTodayFor(c.env.DB, p.name)
      return {
        name: p.name,
        label: p.label,
        kind: p.kind,
        baseUrl: p.baseUrl,
        model: p.model,
        builtin: p.builtin,
        configured: resolved.key !== null,
        secretName,
        howToGet: p.builtin ? (BUILTIN_DOCS[p.name] ?? '') : '',
        calls: spend[p.name]?.calls ?? 0,
        spend: spend[p.name]?.total ?? 0,
        source: resolved.source,
        // سرّ Worker لا يُقنَّع ولا يُعرض منه شيء
        hint: resolved.source === 'worker_secret' ? null : p.hint,
        enabled: p.enabled,
        dailyCap: p.dailyCap,
        priceIn: p.priceIn,
        priceOut: p.priceOut,
        spendToday: Number.isFinite(today) ? today : 0,
        verifiedAt: p.verifiedAt,
        updatedAt: p.updatedAt,
      }
    }),
  )
  const routes = await readRoutes(c.env.DB)
  const drafts = await listDrafts(c.env.DB, 60)
  const media = await mediaFor(c.env.DB, drafts.map((d) => d.id))
  const plan = await latestPlan(c.env.DB)
  const sessions = await listSessions(c.env.KV, session.id)
  const audit = await recentAudit(c.env.DB, 50)
  const rp = relyingParty(c.env.PUBLIC_BASE_URL)
  const factors = await factorState(c.env.DB, rp.id)
  const apps = await appStatuses(c.env.DB, c.env as unknown as Record<string, string | undefined>)

  /**
   * أمتاحٌ هذا السرّ؟ — **ومصدرانِ لا واحد** (D-042).
   *
   * سرُّ Worker يُفحص بوجوده لا بقيمته، والقيمةُ لا تغادر البيئة. وما
   * حُفظ في الخزانة يُعدّ متاحا كذلك — وإلّا لبقيت البطاقةُ تقول
   * «تنتظرك» بعد أن ضبطها المالك من اللوحة نفسها.
   */
  const configured = new Set(
    apps.filter((a) => a.source !== 'none').flatMap((a) => a.secretNames),
  )
  const channels = viewChannels(await listAccounts(c.env.DB), (name) => {
    if (configured.has(name)) return true
    const value = c.env[name as keyof Env]
    return typeof value === 'string' && value.length > 0
  })

  const flash = await takeFlash(c.env, c.req.raw)
  // عددٌ على رابط التقرير — والمالكُ لا يفتح شاشةً ليكتشف أنّ فيها ما ينتظره
  const openCount = (await openSuggestions(c.env.DB)).length
  const ownerPending = pendingCount(await ownerFacts(c))
  // **يُحسَب عند العرض لا يُقرأ من الصفّ**: الصفُّ أثرُ ما وقع،
  // والشريطُ حالٌ الآن — ودورةٌ سقطت لا تُخفي رمزا يوشك (D-065)
  const expiring = (await expiringTokens(c.env.DB, new Date())).map((e) => ({
    platform: e.platform, displayName: e.displayName, kind: e.kind, daysLeft: e.daysLeft,
  }))
  return page((nonce) =>
    panelPage({
      paused: allowance.settings.paused,
      autoEnqueue: allowance.settings.autoEnqueue,
      analysisCap: allowance.settings.dailyAnalysisCap,
      spendCap: allowance.settings.dailySpendCapUsd,
      // لانهاية تعني دفترا لا يُقرأ — تُعرض صفرا لا `Infinity` في الشاشة
      usedAnalyses: Number.isFinite(allowance.usage.analyses) ? allowance.usage.analyses : 0,
      usedSpend: Number.isFinite(allowance.usage.spend) ? allowance.usage.spend : 0,
      spend30d: Object.values(spend).reduce((sum, e) => sum + (e?.total ?? 0), 0),
      series,
      sources,
      providers: providerCards,
      routing: routes.map((r) => ({
        task: r.task,
        provider: r.provider,
        model: r.model,
        why: r.why,
        implemented: r.implemented,
        ready: r.implemented && providerCards.some((p) => p.name === r.provider && p.configured && p.enabled),
      })),
      knownProviders: providerCards.map((p) => ({ name: p.name, label: p.label })),
      drafts,
      media: media.map((m) => ({
        id: m.id,
        postId: m.postId,
        mime: m.mime,
        bytes: m.bytes,
        prompt: m.prompt,
        cost: m.cost,
        status: m.status,
      })),
      plan,
      planReady: routes.some(
        (r) =>
          r.task === 'plan' &&
          providerCards.some((p) => p.name === r.provider && p.configured && p.enabled),
      ),
      // الوجهاتُ من الحسابات الحيّة: قناةٌ إذنُها منتهٍ ليست وجهة، وعرضُها
      // في القائمة يجعل الجدولة تنجح ثمّ يفشل النشر بعد أيّامٍ صامتا
      targets: channels.flatMap((c) =>
        c.spec.built
          ? c.accounts
              .filter((a) => a.status === 'active')
              .map((a) => ({
                id: a.id,
                platform: c.spec.id as 'linkedin' | 'x',
                label: `${a.displayName} · ${c.spec.label}`,
              }))
          : [],
      ),
      writableSources: sources
        .filter((x) => x.analyzed)
        .map((x) => ({ id: x.id, name: x.name })),
      // زرٌّ لا ينادي أحدا لا يُعرض عاملا: الطريقُ جاهزٌ إن كان مزوّدُه
      // مضبوطا ومفعَّلا — وإلّا فالضغطةُ تنتهي إلى رسالةِ عطل
      draftReady: routes.some(
        (r) =>
          r.task === 'draft' &&
          providerCards.some((p) => p.name === r.provider && p.configured && p.enabled),
      ),
      flash,
      now: new Date(),
      csrf: session.record.csrf,
      nonce,
      sessions,
      audit,
      rpId: rp.id,
      via: session.record.via,
      factors: {
        passkeys: factors.passkeys.map((k) => ({
          id: k.id,
          label: k.label,
          createdAt: k.createdAt,
          lastUsedAt: k.lastUsedAt,
        })),
        totpConfirmed: factors.totp.confirmed,
        recoveryLeft: factors.recovery.unused,
        enforced: factors.enforced,
      },
      channels,
      apps,
      baseUrl: c.env.PUBLIC_BASE_URL,
      openSuggestions: openCount,
      promoCap: allowance.settings.weeklyPromoCapUsd,
      ownerPending,
      expiring,
      cfAccountId: (c.env.CF_AI_ACCOUNT_ID ?? '') === '' ? null : (c.env.CF_AI_ACCOUNT_ID ?? null),
    }),
  )
})

/**
 * الدخول — بحدٍّ للمحاولات.
 *
 * والتأخير قبل الردّ متصاعد لا رفضٌ فوريّ: زمنُ الردّ نفسه يخبر المخمّن
 * أنّه مُنع فيبدّل عنوانه ويستأنف.
 */
panel.post('/panel/login', async (c) => {
  const blockedText = (global: boolean): string =>
    global
      ? 'الدخول موقوف مؤقتا: محاولاتٌ كثيرة من عناوين شتّى. انتظر ربع ساعة.'
      : 'تجاوزتَ حدّ المحاولات. انتظر ربع ساعة ثمّ أعد المحاولة.'

  const state = await attemptState(c.env.KV, c.req.raw)
  if (state.blocked) {
    return page(
      (nonce) => loginPage({ error: blockedText(state.globalBlock), blocked: true }, nonce),
      429,
    )
  }

  const form = await c.req.formData()
  // يُقرأ حالُ العوامل **قبل** فتح الجلسة: جلسةٌ تُفتح كاملةً ثمّ تُعلَّق
  // بعد ذلك تكون قد وُجدت كاملةً لحظةً — ولحظةٌ تكفي
  const rp = relyingParty(c.env.PUBLIC_BASE_URL)
  const factors = await factorState(c.env.DB, rp.id)
  const result = await createSession(
    c.env.KV,
    c.env.ADMIN_TOKEN,
    String(form.get('token') ?? ''),
    c.req.raw,
    { pending: factors.enforced },
  )

  if ('error' in result) {
    if (result.error === 'disabled') {
      return page(
        (nonce) =>
          loginPage(
            { error: 'ADMIN_TOKEN غير مضبوط على هذه البيئة — اللوحة مقفلة لا مفتوحة.' },
            nonce,
          ),
        401,
      )
    }
    const after = await recordFailure(c.env.KV, c.req.raw)
    // المحاولةُ المرفوضة تُسجَّل: تكرارُها من عنوانٍ واحد هو ما يُقرأ لاحقا
    await record(
      c.env.DB,
      { actor: 'anonymous', action: 'login.denied', detail: `المحاولة ${after.attempts}` },
      c.req.raw,
    )
    const wait = delayMs(after.attempts)
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
    return page(
      (nonce) =>
        loginPage(
          {
            error: after.blocked
              ? blockedText(after.globalBlock)
              : `رمزٌ غير صحيح — بقيت ${after.remaining} محاولات.`,
            blocked: after.blocked,
          },
          nonce,
        ),
      401,
    )
  }

  await clearAttempts(c.env.KV, c.req.raw)
  await record(
    c.env.DB,
    {
      actor: 'panel',
      action: factors.enforced ? 'session.pending' : 'session.open',
      detail: factors.enforced ? 'ينتظر العامل الثاني' : 'بعاملٍ واحد',
    },
    c.req.raw,
  )
  return new Response(null, {
    status: 303,
    headers: {
      Location: factors.enforced ? '/panel/2fa' : '/panel',
      'Set-Cookie': sessionCookie(result.id),
    },
  })
})

/**
 * الخروج — بلا فحص CSRF.
 *
 * ولذلك عذر: أسوأُ ما يصنعه طلبُ خروجٍ مزوَّر أن يُخرجك، وهو أذًى لا
 * خطر. وفحصُه يعني أنّ جلسةً سقط رمزُها لا تُغلَق — فيبقى البابُ مفتوحا
 * حتّى تنتهي مهلته. **بابُ الخروج لا يُقفَل.**
 */
panel.post('/panel/logout', async (c) => {
  await destroySession(c.env.KV, c.req.raw)
  await record(c.env.DB, { actor: 'panel', action: 'session.close' }, c.req.raw)
  return new Response(null, {
    status: 303,
    headers: { Location: '/panel', 'Set-Cookie': clearedCookie() },
  })
})

// ── الجلسات ─────────────────────────────────────────────────────────

/** إبطالُ جلسةٍ بعينها من الجرد. */
panel.post('/panel/sessions/revoke', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied

  const id = String(gate.form.get('id') ?? '')
  if (id === '') return c.json({ error: 'missing_id' }, 400)

  if (id === gate.session.id) {
    // إبطالُ جلستك من هنا يتركك في صفحةٍ ميّتة بلا كعكةٍ مُمحاة. للخروج زرّه.
    await setFlash(c.env, c.req.raw, {
      kind: 'warn',
      text: 'هذه جلستك — استعمل زرّ «خروج» لإغلاقها.',
    })
    return back('security')
  }

  await revokeSessions(c.env.KV, { only: id })
  await record(c.env.DB, { actor: 'panel', action: 'session.revoke', target: id }, c.req.raw)
  await setFlash(c.env, c.req.raw, { kind: 'ok', text: 'أُبطلت الجلسة.' })
  return back('security')
})

/** إبطالُ كلّ الجلسات إلّا جلسةَ الفاعل. */
panel.post('/panel/sessions/revoke-all', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied

  const removed = await revokeSessions(c.env.KV, { keepId: gate.session.id })
  await record(
    c.env.DB,
    { actor: 'panel', action: 'session.revoke_all', detail: `${removed} جلسة` },
    c.req.raw,
  )
  await setFlash(c.env, c.req.raw, {
    kind: removed === 0 ? 'ok' : 'warn',
    text: removed === 0 ? 'لا جلسات أخرى مفتوحة.' : `أُبطلت ${removed} جلسة. جلستك هذه باقية.`,
  })
  return back('security')
})

const KNOWN_TASKS: ReadonlySet<string> = new Set(['analyze', 'draft', 'image'])

const WRITABLE: ReadonlySet<string> = new Set<SettingKey>([
  'paused', 'daily_analysis_cap', 'daily_spend_cap_usd', 'auto_enqueue',
  'weekly_promo_cap_usd',
])

const LABEL: Readonly<Record<string, string>> = {
  daily_analysis_cap: 'سقف التحليل اليوميّ',
  daily_spend_cap_usd: 'سقف الإنفاق اليوميّ',
  weekly_promo_cap_usd: 'سقف الترويج الأسبوعيّ',
}

/**
 * تغيير إعداد.
 *
 * الحمايةُ من CSRF طبقتان: `SameSite=Strict` في المتصفّح، ورمزٌ في
 * النموذج يفرضه الخادم. والثانية أُضيفت لأنّ الأولى — على قوّتها — تعيش
 * في المتصفّح وحده، وما يعيش هناك لا نملك ضمانه.
 *
 * ومفاتيح الكتابة **قائمةُ سماحٍ لا منع**: مفتاحٌ جديد في القاعدة لا
 * يصير قابلا للكتابة من الشبكة لمجرّد وجوده.
 */
panel.post('/panel/settings', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const form = gate.form

  const key = String(form.get('key') ?? '')
  const value = String(form.get('value') ?? '')
  if (!WRITABLE.has(key)) return c.json({ error: 'unknown_setting' }, 400)

  const result = await writeSetting(c.env.DB, key as SettingKey, value, 'panel')
  await record(
    c.env.DB,
    { actor: 'panel', action: 'settings.write', target: key, detail: `← ${result.stored}` },
    c.req.raw,
  )

  // الإشعار يقول ما وقع **فعلا** لا ما طُلب: قيمةٌ قُصّت تُذكر بقصّها
  let flash: PanelFlash
  if (key === 'auto_enqueue') {
    flash = result.stored === 'true'
      ? { kind: 'warn', text: 'رُفع الإدراج الآليّ. المسح اليوميّ سيحلّل ما تغيّر ضمن حدّ اليوم.' }
      : { kind: 'ok', text: 'أُطفئ الإدراج الآليّ. لا تحليل إلا بأمرك.' }
  } else if (key === 'paused') {
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
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied

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
    await record(
      c.env.DB,
      { actor: 'panel', action: 'drive.scan', detail: parts.join(' · ') },
      c.req.raw,
    )
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
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const form = gate.form

  const outcome = await analyzeSource(
    {
      db: c.env.DB,
      serviceAccountJson: c.env.GOOGLE_SA_JSON,
      anthropicKey: c.env.ANTHROPIC_API_KEY,
      encKey: c.env.TOKEN_ENC_KEY,
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

  await record(
    c.env.DB,
    {
      actor: 'panel',
      action: 'source.analyze',
      target: String(form.get('id') ?? ''),
      detail: outcome.kind,
    },
    c.req.raw,
  )
  await setFlash(c.env, c.req.raw, flash)
  return back('sources')
})

// ── تطبيقا OAuth ─────────────────────────────────────────────────────

/** المنصّاتُ التي لها سائقٌ مبنيّ — وما عداها لا يُقبل في مسار. */
function platformParam(raw: string): 'linkedin' | 'x' | null {
  return raw === 'linkedin' || raw === 'x' ? raw : null
}

/**
 * حفظُ أسرار تطبيقٍ من اللوحة (D-042).
 *
 * **ولا يُسجَّل السرُّ في السجلّ ولا يُعاد في ردّ.** ما يُسجَّل: مَن بدّل،
 * ولأيّ منصّة، وهل تغيّرت القيمة — لا القيمةُ نفسها.
 */
panel.post('/panel/channels/app', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const form = gate.form

  const platform = platformParam(String(form.get('platform') ?? ''))
  if (platform === null) {
    await setFlash(c.env, c.req.raw, { kind: 'bad', text: 'منصّةٌ غير معروفة' })
    return back('channels')
  }

  const by = gate.session.record.via === 'passkey' ? 'panel:passkey' : 'panel:token'
  let flash: PanelFlash
  let detail: string
  try {
    const result = await saveApp(
      c.env.DB,
      c.env.TOKEN_ENC_KEY,
      platform,
      String(form.get('client_id') ?? ''),
      String(form.get('client_secret') ?? ''),
      by,
    )
    detail = result.unchanged ? 'unchanged' : 'saved'
    flash = {
      kind: 'ok',
      text: result.unchanged
        ? `أسرارُ ${platform} محفوظةٌ كما هي — السرُّ نفسه لم يتغيّر.`
        : `حُفظت أسرارُ ${platform} مشفَّرة (${result.hint}). جرّب «اربط» الآن.`,
    }
  } catch (error) {
    detail = 'failed'
    flash = { kind: 'bad', text: error instanceof Error ? error.message : 'تعذّر الحفظ' }
  }

  await record(
    c.env.DB,
    { actor: 'panel', action: 'oauth_app.save', target: platform, detail },
    c.req.raw,
  )
  await setFlash(c.env, c.req.raw, flash)
  return back('channels')
})

/** حذفُ التطبيق من الخزانة — ولا يمسّ ما في أسرار Worker. */
/**
 * فحصُ زوج الأسرار — **قبل الربط، لا بعد أن يفشل.**
 *
 * `invalid_client` يصل بعد أن ينجح كلُّ شيءٍ قبله، **فلا يُعرَف أهو
 * السرُّ أم علّةٌ أخرى** إلّا بدورةِ إذنٍ كاملةٍ في كلّ مرّة. وهذا
 * الفحصُ يسأل السؤالَ وحده: **أيَقبل المزوّدُ هذا الزوج؟** (D-060)
 *
 * ولا يُنتَج رمزُ وصول: المرسَلُ رمزٌ باطلٌ عمدا. ولا تكلفة، فلا صفَّ
 * في الدفتر (D-008 يوجب التسجيل على المدفوع).
 */
panel.post('/panel/channels/app/verify', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied

  const platform = platformParam(String(gate.form.get('platform') ?? ''))
  if (platform === null) {
    await setFlash(c.env, c.req.raw, { kind: 'bad', text: 'منصّةٌ غير معروفة' })
    return back('channels')
  }

  const creds = await readApp(
    c.env.DB,
    c.env.TOKEN_ENC_KEY,
    platform,
    c.env as unknown as Record<string, string | undefined>,
  )
  if (creds === null) {
    await setFlash(c.env, c.req.raw, {
      kind: 'bad',
      text: `لا أسرارَ محفوظةً لـ ${platform} — احفظها أوّلا ثمّ افحص.`,
    })
    return back('channels')
  }

  const verdict = await verifyAppCredentials(
    PROVIDERS[platform],
    { clientId: creds.clientId, clientSecret: creds.clientSecret },
  )

  // **ونصُّ المزوّد يُعرَض ولا يُبنى عليه حكم** (D-054)
  const said =
    verdict.kind === 'unsupported' || verdict.kind === 'inconclusive'
      ? verdict.detail
      : verdict.description === undefined
        ? verdict.code
        : `${verdict.code} — ${verdict.description}`

  let flash: PanelFlash
  if (verdict.kind === 'bad_secret') {
    flash = {
      kind: 'bad',
      text:
        `السرُّ مرفوض. المعرّفُ ${creds.clientId} **تعرفه** ${platform}، ` +
        `والسرُّ لا يوافقه — ردّت «${said}». ` +
        'ولّد سرّا جديدا في تبويب Auth والصقه في اللحظة التي يظهر فيها.',
    }
  } else if (verdict.kind === 'bad_client_id') {
    flash = {
      kind: 'bad',
      text:
        `المعرّفُ نفسُه مجهولٌ عند ${platform}: أُرسل ${creds.clientId} وردّت «${said}». ` +
        'فهو تطبيقٌ آخرُ أو حرفٌ ساقط — انسخه من تبويب Auth.',
    }
  } else if (verdict.kind === 'accepted') {
    flash = {
      kind: 'ok',
      text:
        `الزوجُ مقبولٌ عند ${platform} — جاز التوثيق («${said}»). ` +
        'فإن بقي الربطُ يفشل فالعلّةُ ليست في المعرّف ولا في السرّ.',
    }
  } else if (verdict.kind === 'unsupported') {
    flash = { kind: 'warn', text: `لا فحصَ لهذه المنصّة: ${said}` }
  } else {
    flash = { kind: 'warn', text: `لم يُحسَم الفحص: ${said}. ولا يُدَّعى حكمٌ بلا دليل.` }
  }

  // **والأثرُ يُحفَظ ليقرأه المعالج** — نتيجةٌ تُنسى عند كلّ فتحةٍ
  // ليست نتيجة، ويُسأل المالكُ أن يفحص مرّةً بعد مرّة (D-061)
  await recordVerification(c.env.DB, platform, verdict.kind)
  await record(
    c.env.DB,
    { actor: 'panel', action: 'oauth_app.verify', target: platform, detail: verdict.kind },
    c.req.raw,
  )
  await setFlash(c.env, c.req.raw, flash)
  return back('channels')
})

panel.post('/panel/channels/app/delete', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied

  const platform = platformParam(String(gate.form.get('platform') ?? ''))
  if (platform === null) {
    await setFlash(c.env, c.req.raw, { kind: 'bad', text: 'منصّةٌ غير معروفة' })
    return back('channels')
  }

  const done = await deleteApp(c.env.DB, platform)
  await record(
    c.env.DB,
    { actor: 'panel', action: 'oauth_app.delete', target: platform, detail: done ? 'deleted' : 'absent' },
    c.req.raw,
  )
  await setFlash(c.env, c.req.raw, {
    kind: done ? 'ok' : 'bad',
    text: done ? `حُذفت أسرارُ ${platform} من الخزانة.` : 'لا أسرارَ محفوظةً لهذه المنصّة.',
  })
  return back('channels')
})

// ── الخطّة الأسبوعيّة ─────────────────────────────────────────────────

/**
 * توليدُ خطّة الأسبوع — نداءٌ واحدٌ مدفوع، بحارسه.
 *
 * **ولا يكتب منشورا ولا يجدول.** يقترح، والكتابةُ زرٌّ لكلّ بند يمرّ
 * بـ `/panel/drafts/write` نفسه — لا طريقا ثانيا حول الحارس.
 */
panel.post('/panel/plan/generate', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied

  const outcome = await planWeek({
    db: c.env.DB,
    encKey: c.env.TOKEN_ENC_KEY,
    workerSecrets: c.env as unknown as Record<string, string | undefined>,
  })

  const flash: PanelFlash =
    outcome.kind === 'planned'
      ? {
          kind: 'ok',
          text: `خطّةُ أسبوع ${outcome.week}: ${outcome.items} بندا${
            outcome.dropped === 0 ? '' : ` (وأُسقط ${outcome.dropped} لمصدرٍ لا نعرفه)`
          }، الكلفة ${money(outcome.cost)}.`,
        }
      : outcome.kind === 'not_enough'
        ? { kind: 'warn', text: outcome.reason }
        : outcome.kind === 'blocked'
          ? { kind: 'warn', text: outcome.reason }
          : { kind: 'bad', text: `تعذّر التخطيط: ${outcome.reason}` }

  await record(
    c.env.DB,
    { actor: 'panel', action: 'plan.generate', target: null, detail: outcome.kind },
    c.req.raw,
  )
  await setFlash(c.env, c.req.raw, flash)
  return back('posts')
})

/** اعتمادُ منطق الخطّة — علامةٌ لا تنفيذ. */
panel.post('/panel/plan/approve', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const id = String(gate.form.get('id') ?? '')

  const done = await approvePlan(c.env.DB, id)
  await record(
    c.env.DB,
    { actor: 'panel', action: 'plan.approve', target: id, detail: done ? 'approved' : 'refused' },
    c.req.raw,
  )
  await setFlash(c.env, c.req.raw, {
    kind: done ? 'ok' : 'bad',
    text: done
      ? 'اعتُمد منطقُ الأسبوع. ولا يُكتب منه حرفٌ حتّى تضغط «اكتب منه» لبند.'
      : 'لا خطّةَ بهذه الحال.',
  })
  return back('posts')
})

// ── الصور ────────────────────────────────────────────────────────────

/**
 * توليدُ صورةٍ لمنشور.
 *
 * يمرّ بـ `generateForPost` نفسه — بسقوفه وإيقافه وسقفِ مزوّده. **وهو
 * نداءٌ مدفوعٌ بضغطة**، فالزرُّ يُعطَّل بعد الأولى ومفتاحُ عدم التكرار
 * يمنع الثانية إن سبقت.
 */
panel.post('/panel/media/generate', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const id = String(gate.form.get('id') ?? '')

  const outcome = await generateForPost(
    {
      db: c.env.DB,
      bucket: c.env.MEDIA,
      encKey: c.env.TOKEN_ENC_KEY,
      workerSecrets: c.env as unknown as Record<string, string | undefined>,
    },
    id,
  )

  const flash: PanelFlash =
    outcome.kind === 'generated'
      ? {
          kind: 'ok',
          text: `وُلّدت صورة — ${Math.round(outcome.bytes / 1024)}KB، الكلفة ${money(outcome.cost)}.`,
        }
      : outcome.kind === 'already'
        ? { kind: 'ok', text: 'وُلّدت صورةٌ لهذا النصّ — لم يُنفَق شيء.' }
        : outcome.kind === 'in_progress'
          ? {
              kind: 'warn',
              text: `توليدٌ جارٍ لهذه الصورة منذ ${outcome.since} — انتظره ولا تنقر ثانيةً.`,
            }
          : outcome.kind === 'blocked'
            ? { kind: 'warn', text: outcome.reason }
            : { kind: 'bad', text: `تعذّر التوليد: ${outcome.reason}` }

  await record(
    c.env.DB,
    { actor: 'panel', action: 'media.generate', target: id, detail: outcome.kind },
    c.req.raw,
  )
  await setFlash(c.env, c.req.raw, flash)
  return back('posts')
})

/**
 * تحريكُ الصورة إلى مقطعٍ رأسيّ (D-052).
 *
 * **ولا يُنادى إلّا على صورةٍ معتمَدة**: الفيديو أغلى ما يُنادى في
 * النظام، وتحريكُ ما رُفض إنفاقٌ على ما لن يُنشَر. والحارسُ في الدالّة
 * لا هنا — فمسارٌ ثانٍ ينسخه ينسى شرطا (D-019).
 */
panel.post('/panel/media/animate', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const id = String(gate.form.get('id') ?? '')

  const outcome = await animateForPost(
    {
      db: c.env.DB,
      bucket: c.env.MEDIA,
      ai: pickBinding(c.env),
      encKey: c.env.TOKEN_ENC_KEY,
      baseUrl: c.env.PUBLIC_BASE_URL,
    },
    id,
  )

  const flash: PanelFlash =
    outcome.kind === 'generated'
      ? {
          kind: 'ok',
          text: `وُلّد مقطعٌ رأسيّ — ${Math.round(outcome.bytes / 1024)}KB. ` +
            'والسعرُ لم يُقرأ من لوحة Cloudflare بعد، فسُجّل صفرا موسوما.',
        }
      : outcome.kind === 'already'
        ? { kind: 'ok', text: 'لهذا المنشور مقطعٌ من قبل — لم يُنفَق شيء.' }
        : outcome.kind === 'in_progress'
          // **وليس عطلا**: نداءٌ سابقٌ لم يفرغ بعد، والتوليدُ دقائق
          ? {
              kind: 'warn',
              text: `توليدٌ جارٍ لهذا المقطع منذ ${outcome.since} — ` +
                'انتظره ولا تنقر ثانيةً، فالنقرةُ الثانيةُ كانت تدفع ثانيةً.',
            }
          : outcome.kind === 'blocked'
            ? { kind: 'warn', text: outcome.reason }
            : { kind: 'bad', text: `تعذّر التحريك: ${outcome.reason}` }

  await record(
    c.env.DB,
    { actor: 'panel', action: 'media.animate', target: id, detail: outcome.kind },
    c.req.raw,
  )
  await setFlash(c.env, c.req.raw, flash)
  return back('posts')
})

/** رفضُ صورة — تبقى بكلفتها ولا تُحذف بايتاتُها. */
panel.post('/panel/media/reject', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const id = String(gate.form.get('id') ?? '')

  const done = await rejectMedia(c.env.DB, id)
  await record(
    c.env.DB,
    { actor: 'panel', action: 'media.reject', target: id, detail: done ? 'rejected' : 'refused' },
    c.req.raw,
  )
  await setFlash(c.env, c.req.raw, {
    kind: done ? 'ok' : 'bad',
    text: done ? 'رُفضت الصورة — وتبقى بكلفتها، فما دُفع ثمنُه يُرى.' : 'لا صورةَ بهذه الحال.',
  })
  return back('posts')
})

/**
 * شاشةُ منصّةٍ واحدة — `/panel/channels/:platform`.
 *
 * ## لماذا صفحةٌ لا تبويبٌ في اللوحة
 *
 * أقسامُ اللوحة تُبنى كلُّها في كلّ تحميلٍ ثمّ تُخفى بـ `hidden`. وهذا
 * يصحّ لسبعةِ أقسامٍ ثابتة، **ولا يصحّ لسبعِ منصّاتٍ لكلٍّ ستّون منشورا**:
 * تحميلُ اللوحة يصير أربعَ مئةِ صفٍّ لا يُقرأ منها إلّا ما فُتح.
 *
 * وصفحةٌ لها عنوانُها يُشارَك ويُحفظ في المفضّلة ويُفتَح في تبويبٍ ثانٍ —
 * وشظيّةُ `#channels` لا تفعل شيئا من ذلك.
 *
 * ## والحارسُ هو حارسُ اللوحة نفسه
 *
 * لا نسخةَ منه: مسارٌ جديد بحارسٍ منسوخٍ هو الثغرةُ التي كشفها D-019.
 * والجلسةُ المعلَّقة تُردّ إلى العامل الثاني كما تُردّ من `/panel`.
 */
panel.get('/panel/channels/:platform', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return loginResponse('انتهت الجلسة. ادخل من جديد.')
  if (session.record.pending) return c.redirect('/panel/2fa', 303)

  const id = c.req.param('platform')
  const spec = CHANNELS.find((ch) => ch.id === id)
  if (spec === undefined) return c.text('لا منصّةَ بهذا الاسم', 404)

  const accounts = await listAccounts(c.env.DB)
  const apps = await appStatuses(
    c.env.DB,
    c.env as unknown as Record<string, string | undefined>,
    ['linkedin', 'x'],
  )
  const present = new Set(apps.filter((a) => a.source !== 'none').flatMap((a) => a.secretNames))
  const views = viewChannels(accounts, (name) =>
    present.has(name) || (c.env[name as keyof Env] as string | undefined) !== undefined,
  )
  const view = views.find((v) => v.spec.id === id)
  if (view === undefined) return c.text('لا منصّةَ بهذا الاسم', 404)

  const now = new Date()

  // **والمنشوراتُ لما ينشر وحده**: منصّةٌ تُربَط ولا تنشر تُسأل عن
  // نطاقاتها لا عن حصادها — وأصفارُ نشرٍ على شاشتها تُقرأ فشلا لا
  // «لم يُبنَ بعد» (D-056)
  const publishes = spec.stage === 'publish'
  const posts = publishes ? await platformPosts(c.env.DB, id as 'linkedin' | 'x', 60) : []
  const tally = publishes
    ? await platformTally(c.env.DB, id as 'linkedin' | 'x')
    : { published: 0, queued: 0, failed: 0, drafts: 0, spend: 0, lastPublishedAt: null }
  // والنطاقاتُ تُقرأ لكلّ ما يُربَط: هي جوابُ «ماذا يستطيع هذا الحساب»
  const scopes =
    spec.stage === 'none' ? {} : await grantedScopes(c.env.DB, id as Platform)

  // ما قِيس — للمنشورة وحدها: مسوّدةٌ لا مقياسَ لها (D-048)
  const metrics = await metricsFor(c.env.DB, posts.map((p) => p.id))

  // والوسائطُ تُعرَض لا يُقال إنّ هناك وسيطا (D-062) — استعلامٌ واحدٌ
  // لكلّ الصفحة لا واحدٌ لكلّ بطاقة
  const mediaRows = await mediaFor(c.env.DB, posts.map((p) => p.id))
  const media: Record<string, { id: string; mime: string; status: 'ready' | 'rejected' }[]> = {}
  for (const row of mediaRows) {
    const list = media[row.postId] ?? []
    list.push({ id: row.id, mime: row.mime, status: row.status })
    media[row.postId] = list
  }

  const body = platformScreen({
    view, posts, tally, scopes, metrics, media, now,
    // حالُ الصفحة في عنوانها: يُشارَك رابطٌ فيُرى ما رآه صاحبُه
    show: showOf(c.req.query('show')),
  })

  return page((nonce) =>
    shell(
      `صدى — ${spec.label}`,
      `<a class="skip" href="#main">تخطّي إلى المحتوى</a>
       <div class="wrap">
         <nav class="back" aria-label="مسارُ العودة">
           <a href="/panel#channels">← القنوات</a>
           <span class="grow"></span>${themeSwitch()}
         </nav>
         <main id="main">${body}</main>
       </div>`,
      nonce,
      THEME_SCRIPT,
    ),
  )
})

/**
 * حقائقُ المالك — **تُجمَع من البيئة والقاعدة، ولا تُكتب بيد.**
 *
 * ولا يُقرأ سرٌّ ولا يُفكّ تشفير: **أسماءٌ وحالٌ فقط** (D-005).
 */
async function ownerFacts(c: {
  env: Env
}): Promise<OwnerFacts> {
  const env = c.env as unknown as Record<string, string | undefined>
  const has = (name: string): boolean => {
    const v = env[name]
    return typeof v === 'string' && v.trim() !== ''
  }

  const accounts = await listAccounts(c.env.DB)
  const apps = await appStatuses(c.env.DB, env, ['linkedin', 'x', 'youtube', 'tiktok'])

  let anyPublished = false
  try {
    const row = await c.env.DB
      .prepare("SELECT 1 AS n FROM publish_attempts WHERE status = 'succeeded' LIMIT 1")
      .first<{ n: number }>()
    anyPublished = row !== null
  } catch {
    // جدولٌ لا يُقرأ: تبقى `false` — **ولا يُدَّعى نجاحٌ لم يُقرأ**
  }

  let videoPriced = false
  try {
    const row = await c.env.DB
      .prepare(
        `SELECT 1 AS n FROM cost_ledger
          WHERE operation LIKE '%video%' AND unit_cost > 0 LIMIT 1`,
      )
      .first<{ n: number }>()
    videoPriced = row !== null
  } catch {
    // كما سبق
  }

  return {
    secrets: new Set(
      ['TOKEN_ENC_KEY', 'ADMIN_TOKEN', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY',
       'GOOGLE_SA_JSON', 'CF_AI_TOKEN'].filter(has),
    ),
    vars: new Set(['LEGAL_ENTITY', 'LEGAL_CONTACT', 'CF_AI_ACCOUNT_ID'].filter(has)),
    linked: new Set(accounts.filter((a) => a.status !== 'revoked').map((a) => a.platform)),
    appsConfigured: new Set(apps.filter((a) => a.source !== 'none').map((a) => a.platform)),
    appsVerified: new Set(
      apps.filter((a) => a.verifiedKind === 'accepted').map((a) => a.platform),
    ),
    anyPublished,
    videoPriced,
  }
}

/**
 * شاشةُ «ما عليك» — **وثيقةٌ تقول الخطوات، وشاشةٌ تقول أين أنت منها.**
 */
panel.get('/panel/tasks', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return loginResponse('انتهت الجلسة. ادخل من جديد.')
  if (session.record.pending) return c.redirect('/panel/2fa', 303)

  const gates = gatesOf(await readGateFacts(c.env.DB))
  const body = tasksScreen({
    rows: ownerRows(await ownerFacts(c)),
    gates,
    phase: currentPhase(gates),
  })

  return page((nonce) =>
    shell(
      'صدى — مهامُّ المالك',
      `<a class="skip" href="#main">تخطّي إلى المحتوى</a>
       <div class="wrap">
         <nav class="back" aria-label="مسارُ العودة">
           <a href="/panel">← اللوحة</a>
           <span class="grow"></span>${themeSwitch()}
         </nav>
         <main id="main">${body}</main>
       </div>`,
      nonce,
      THEME_SCRIPT,
    ),
  )
})

/**
 * شاشةُ التقرير الأسبوعيّ — **تقرأ ما كُتب ولا تحسبه.**
 *
 * ولا زرَّ «ولّد الآن»: التقريرُ شهادةٌ على أسبوعٍ مضى، وزرٌّ يكتبه
 * قبل أوانه يثبّت أرقاما لم تكتمل نوافذُها — **ثمّ لا يُعاد حسابُها
 * أبدا**، لأنّ أوّلَ كتابةٍ هي الشهادة (D-058).
 */
panel.get('/panel/report', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return loginResponse('انتهت الجلسة. ادخل من جديد.')
  if (session.record.pending) return c.redirect('/panel/2fa', 303)

  const reports = await listReports(c.env.DB)
  const settings = await readSettings(c.env.DB)
  const body = reportScreen({
    reports,
    current: reports[0] ?? null,
    suggestions: await openSuggestions(c.env.DB),
    promoCapUsd: settings.weeklyPromoCapUsd,
    now: new Date(),
  })

  return page((nonce) =>
    shell(
      'صدى — التقرير الأسبوعيّ',
      `<a class="skip" href="#main">تخطّي إلى المحتوى</a>
       <div class="wrap">
         <nav class="back" aria-label="مسارُ العودة">
           <a href="/panel">← اللوحة</a>
           <span class="grow"></span>${themeSwitch()}
         </nav>
         <main id="main">${body}</main>
       </div>`,
      nonce,
      THEME_SCRIPT,
    ),
  )
})

/** تقريرُ أسبوعٍ بعينه — بمفتاحه، وهو أوّلُ يومٍ فيه. */
panel.get('/panel/report/:week', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return loginResponse('انتهت الجلسة. ادخل من جديد.')
  if (session.record.pending) return c.redirect('/panel/2fa', 303)

  const stored = await readReport(c.env.DB, c.req.param('week'))
  if (stored === null) return c.text('لا تقريرَ لهذا الأسبوع', 404)

  const settings = await readSettings(c.env.DB)
  const body = reportScreen({
    reports: await listReports(c.env.DB),
    current: stored,
    suggestions: await openSuggestions(c.env.DB),
    promoCapUsd: settings.weeklyPromoCapUsd,
    now: new Date(),
  })

  return page((nonce) =>
    shell(
      `صدى — تقريرُ ${stored.id}`,
      `<a class="skip" href="#main">تخطّي إلى المحتوى</a>
       <div class="wrap">
         <nav class="back" aria-label="مسارُ العودة">
           <a href="/panel/report">← التقارير</a>
           <span class="grow"></span>${themeSwitch()}
         </nav>
         <main id="main">${body}</main>
       </div>`,
      nonce,
      THEME_SCRIPT,
    ),
  )
})

/**
 * بتُّ توصيةِ ترويج — **تسجيلُ رأيٍ لا أمرُ إنفاق.**
 *
 * «أقبل» تعني: هذا يستحقّ ترويجا. **ولا يقع منه إنفاق** — لا عميلَ
 * إعلاناتٍ في المستودع ولا مفتاحَ يُطلَب (D-006). وما يفعله المالكُ
 * بالمبلغ يفعله في لوحة المنصّة بيده.
 */
panel.post('/panel/report/promote', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied

  const postId = String(gate.form.get('post_id') ?? '')
  const raw = String(gate.form.get('decision') ?? '')
  if (raw !== 'accepted' && raw !== 'rejected') {
    return c.json({ error: 'unknown_decision' }, 400)
  }
  if (postId === '') return c.json({ error: 'missing_post' }, 400)

  const changed = await decidePromotion(c.env.DB, postId, raw)
  await record(
    c.env.DB,
    { actor: 'panel', action: 'promotion.decide', target: postId, detail: raw },
    c.req.raw,
  )

  await setFlash(c.env, c.req.raw, changed
    ? {
        kind: raw === 'accepted' ? 'warn' : 'ok',
        text: raw === 'accepted'
          ? 'سُجّل قبولُك. ولم يُنفَق شيء — الترويجُ يقع في لوحة المنصّة بيدك.'
          : 'سُجّل رفضُك، ولا يُقترَح هذا المنشورُ ثانيةً.',
      }
    : { kind: 'warn', text: 'لا توصيةَ تنتظر لهذا المنشور — أو بُتَّ فيها قبلا.' })

  return new Response(null, { status: 303, headers: { Location: '/panel/report' } })
})

/**
 * تسليمُ بايتات الصورة — **خلف الجلسة**.
 *
 * R2 ليس له عنوانٌ عامّ هنا، وهذا مقصود: صورةٌ لمنشورٍ لم يُنشر بعد
 * تكشف ما يُعدّه المالك قبل أن يعلنه. فتُقرأ من الدلو ويُسلَّمها من
 * يملك جلسةً، ولا رابطَ يُشارَك.
 *
 * والمفتاحُ يُقرأ من القاعدة لا من المسار: مسارٌ يُبنى من مدخلٍ يفتح
 * الدلوَ كلَّه لمن يخمّن مفتاحا.
 */
panel.get('/panel/media/:id', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null || session.record.pending) return c.text('غير مصرَّح', 403)

  const row = await c.env.DB
    .prepare('SELECT r2_key, mime FROM media WHERE id = ?')
    .bind(c.req.param('id'))
    .first<{ r2_key: string; mime: string }>()
  if (row === null) return c.text('لا صورة', 404)

  const object = await c.env.MEDIA.get(row.r2_key)
  if (object === null) return c.text('البايتات مفقودة', 404)

  return new Response(await object.arrayBuffer(), {
    headers: {
      'Content-Type': row.mime,
      // خاصّةٌ لا عامّة: وسيطٌ مشترك لا يخزّن ما يخصّ جلسة
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  })
})

// ── الكتابة والبَتّ ──────────────────────────────────────────────────

/**
 * كتابةُ مسوّدة من اللوحة.
 *
 * يمرّ بـ `draftPost` نفسه — بسقوفه وإيقافه وسقفِ مزوّده: **زرٌّ في صفحةٍ
 * ليس طريقا جانبيّا حول الحارس** (D-019). ولا يُنشئ شيئا بحالةٍ غير
 * `draft`، فلا يمسّ D-009 من قريبٍ ولا بعيد.
 */
panel.post('/panel/drafts/write', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const form = gate.form

  const id = String(form.get('id') ?? '')
  const raw = String(form.get('platform') ?? '')
  // منصّةٌ لا نعرفها لا تُمرَّر إلى القاعدة لتردَّها بقيدٍ غامض
  if (raw !== 'linkedin' && raw !== 'x') {
    await setFlash(c.env, c.req.raw, { kind: 'bad', text: 'منصّةٌ غير معروفة' })
    return back('posts')
  }
  const platform: Platform = raw

  const outcome = await draftPost(
    { db: c.env.DB, encKey: c.env.TOKEN_ENC_KEY, workerSecrets: c.env as unknown as Record<string, string | undefined> },
    id,
    platform,
  )

  const flash: PanelFlash =
    outcome.kind === 'drafted'
      ? {
          kind: 'ok',
          text: `كُتبت مسوّدة ${platform === 'x' ? 'X' : 'LinkedIn'} — ${outcome.length} محرفا، الكلفة ${money(outcome.cost)}.`,
        }
      : outcome.kind === 'already'
        ? { kind: 'ok', text: 'سُوّدت هذه النسخةُ لهذه المنصّة — لم يُنفَق شيء.' }
        : outcome.kind === 'blocked'
          ? { kind: 'warn', text: outcome.reason }
          : outcome.kind === 'not_analyzed'
            ? { kind: 'warn', text: outcome.reason }
            : { kind: 'bad', text: `تعذّرت الكتابة: ${outcome.reason}` }

  await record(
    c.env.DB,
    { actor: 'panel', action: 'draft.write', target: `${id}:${platform}`, detail: outcome.kind },
    c.req.raw,
  )
  await setFlash(c.env, c.req.raw, flash)
  return back('posts')
})

/**
 * البَتُّ في مسوّدة — **وهو القرار الذي يفتح بابَ النشر.**
 *
 * يُسجَّل في `audit_log` بمعرّف المسوّدة وحالتها الجديدة: D-009 يشترط
 * موافقةً بشريّة، وموافقةٌ بلا أثرٍ يُقرأ لا تُراجَع بعد شهر.
 */
panel.post('/panel/drafts/decide', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const form = gate.form

  const id = String(form.get('id') ?? '')
  const wants = String(form.get('do') ?? '')
  // النصُّ المرسَل هو المعروض: تُقارنه `decide` بالمحفوظ فتعرف
  // أعُتمد كما كُتب أم بعد تعديل — والحالةُ تُستنتَج ولا تُسأل
  const result = await decide(
    c.env.DB,
    id,
    wants === 'reject' ? { kind: 'reject' } : { kind: 'approve', text: String(form.get('text') ?? '') },
    gate.session.record.via === 'passkey' ? 'panel:passkey' : 'panel:token',
  )

  const flash: PanelFlash = !result.ok
    ? { kind: 'bad', text: result.reason }
    : result.status === 'rejected'
      ? { kind: 'ok', text: 'رُفضت — وتبقى معروضةً بكلفتها، فما دُفع ثمنُه يُرى.' }
      : {
          kind: 'ok',
          text:
            result.status === 'edited'
              ? 'اعتُمدت بنصّك بعد التعديل. ولا تُنشر حتّى تُربَط قناتُها ويُبنى الطابور.'
              : 'اعتُمدت كما كُتبت. ولا تُنشر حتّى تُربَط قناتُها ويُبنى الطابور.',
        }

  await record(
    c.env.DB,
    {
      actor: 'panel',
      action: 'draft.decide',
      target: id,
      detail: result.ok ? result.status : `refused:${result.reason}`,
    },
    c.req.raw,
  )
  await setFlash(c.env, c.req.raw, flash)
  return back('posts')
})

/**
 * الجدولة — **القرارُ الذي يُخرج المنشور من اللوحة إلى العالم.**
 *
 * والحارسُ في `schedulePost` لا هنا: المنصّةُ والحسابُ والموعدُ تُفحص في
 * موضعٍ واحد يشترك فيه هذا الزرّ وأيُّ منادٍ آخر. وزرٌّ في صفحةٍ ليس
 * طريقا جانبيّا حول الحارس (D-019).
 */
panel.post('/panel/drafts/schedule', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const form = gate.form

  const id = String(form.get('id') ?? '')
  const result = await schedulePost(
    c.env.DB,
    id,
    String(form.get('account') ?? ''),
    String(form.get('when') ?? ''),
    new Date(),
  )

  const flash: PanelFlash = result.ok
    ? {
        kind: 'ok',
        text: `جُدولت إلى ${result.account} في ${result.at} UTC. وتخرج في أوّل دورةٍ بعد موعدها.`,
      }
    : { kind: 'bad', text: `تعذّرت الجدولة: ${result.reason}` }

  await record(
    c.env.DB,
    {
      actor: 'panel',
      action: 'draft.schedule',
      target: id,
      detail: result.ok ? result.at : `refused:${result.reason}`,
    },
    c.req.raw,
  )
  await setFlash(c.env, c.req.raw, flash)
  return back('posts')
})

/** سحبُ الموعد — قبل مغادرة الرسالة وحده. */
panel.post('/panel/drafts/unschedule', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied

  const id = String(gate.form.get('id') ?? '')
  const result = await unschedule(c.env.DB, id)

  const flash: PanelFlash = result.ok
    ? { kind: 'ok', text: 'سُحب الموعد — وتبقى معتمَدةً تنتظر موعدا جديدا.' }
    : { kind: 'bad', text: `تعذّر السحب: ${result.reason}` }

  await record(
    c.env.DB,
    {
      actor: 'panel',
      action: 'draft.unschedule',
      target: id,
      detail: result.ok ? 'withdrawn' : `refused:${result.reason}`,
    },
    c.req.raw,
  )
  await setFlash(c.env, c.req.raw, flash)
  return back('posts')
})

// ── إدارة المزوّدين ──────────────────────────────────────────────────

/**
 * حارسُ أفعال المزوّدين: البوّابةُ الموحّدة، ثمّ وجودُ المزوّد.
 *
 * يبني على `guardPost` ولا ينسخه: فحصُ الجلسة و CSRF يبقى في موضعٍ واحد.
 */
async function providerGuard(
  c: { env: Env; req: { raw: Request; formData: () => Promise<FormData> } },
): Promise<{ denied: Response } | { provider: Provider; form: FormData; session: Session }> {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate

  const provider = await getProvider(c.env.DB, String(gate.form.get('provider') ?? ''))
  if (provider === null) {
    return { denied: Response.json({ error: 'unknown_provider' }, { status: 400 }) }
  }
  return { provider, form: gate.form, session: gate.session }
}

function num(form: FormData, field: string): number | null {
  const raw = String(form.get(field) ?? '').trim()
  if (raw === '') return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

/**
 * إضافة مزوّد — أو تعديل بياناته.
 *
 * والعنوان يمرّ بحارسه: الخادم سيرسل **مفتاح المالك ونصّ مستنداته** إلى
 * ما كُتب، فعنوانٌ داخليّ أو `http` يُرفض قبل أن يُحفظ.
 */
panel.post('/panel/providers/add', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const form = gate.form

  const name = normalizeName(String(form.get('name') ?? ''))
  if (name === null) {
    await setFlash(c.env, c.req.raw, {
      kind: 'bad',
      text: 'الاسم يجب أن يبدأ بحرف لاتينيّ ويحوي حروفا صغيرة وأرقاما وشرطة (مثل deepseek).',
    })
    return back('providers')
  }

  const existing = await getProvider(c.env.DB, name)
  const label = String(form.get('label') ?? '').trim() || name
  const model = String(form.get('model') ?? '').trim()
  const rawUrl = String(form.get('base_url') ?? '')

  // المدمَج لا يُبدَّل عنوانه: عنوانه في الشيفرة
  let baseUrl: string | null = existing?.baseUrl ?? null
  if (existing === null || !existing.builtin) {
    const verdict = checkProviderUrl(rawUrl)
    if (!verdict.ok) {
      await setFlash(c.env, c.req.raw, { kind: 'bad', text: `العنوان مرفوض: ${verdict.reason}` })
      return back('providers')
    }
    baseUrl = verdict.url
  }

  await upsertProvider(
    c.env.DB,
    {
      name,
      label,
      kind: existing?.kind ?? 'openai_compat',
      baseUrl,
      model: model === '' ? (existing?.model ?? null) : model,
      priceIn: num(form, 'price_in'),
      priceOut: num(form, 'price_out'),
      dailyCap: num(form, 'daily_cap'),
    },
    'panel',
  )

  await record(
    c.env.DB,
    {
      actor: 'panel',
      action: 'provider.upsert',
      target: name,
      detail: existing === null ? 'جديد' : 'تعديل',
    },
    c.req.raw,
  )
  await setFlash(c.env, c.req.raw, {
    kind: 'ok',
    text: existing === null
      ? `أُضيف ${label}. ضع مفتاحه ثمّ اختبره.`
      : `حُدّثت بيانات ${label}.`,
  })
  return back('providers')
})

panel.post('/panel/providers/key', async (c) => {
  const guard = await providerGuard(c)
  if ('denied' in guard) return guard.denied
  const form = guard.form

  const raw = String(form.get('key') ?? '')
  if (raw.trim().length === 0) {
    await setFlash(c.env, c.req.raw, { kind: 'bad', text: 'المفتاح فارغ — لم يُحفظ شيء.' })
    return back('providers')
  }
  if (c.env.TOKEN_ENC_KEY.length === 0) {
    await setFlash(c.env, c.req.raw, {
      kind: 'bad',
      text: 'TOKEN_ENC_KEY غير مضبوط — والخزانة لا تعمل بلا مفتاح تشفير.',
    })
    return back('providers')
  }

  try {
    const result = await saveKey(c.env.DB, c.env.TOKEN_ENC_KEY, guard.provider.name, raw, 'panel')
    // **ولا في السجلّ**: التلميحُ وحده — وهو أوّلُ المفتاح وآخرُه لا نصُّه
    await record(
      c.env.DB,
      {
        actor: 'panel',
        action: 'provider.key',
        target: guard.provider.name,
        detail: result.unchanged ? `لم يتغيّر (${result.hint})` : `بُدّل إلى ${result.hint}`,
      },
      c.req.raw,
    )
    // **لا يُذكر المفتاح في الإشعار** — التلميح وحده
    await setFlash(c.env, c.req.raw, {
      kind: result.unchanged ? 'ok' : 'warn',
      text: result.unchanged
        ? `${guard.provider.label}: المفتاح نفسه لم يتغيّر (${result.hint}).`
        : `${guard.provider.label}: حُفظ المفتاح ${result.hint} — اختبره قبل أن تعتمد عليه.`,
    })
  } catch (error) {
    await setFlash(c.env, c.req.raw, {
      kind: 'bad',
      text: `تعذّر الحفظ: ${error instanceof Error ? error.message : 'عطل غير متوقّع'}`,
    })
  }
  return back('providers')
})

/** الاختبار يمرّ بلهجة المزوّد: لكلٍّ نقطةُ تحقّقها. */
panel.post('/panel/providers/verify', async (c) => {
  const guard = await providerGuard(c)
  if ('denied' in guard) return guard.denied
  const provider = guard.provider

  const secretName = provider.builtin ? BUILTIN_SECRET[provider.name] : undefined
  const resolved = await resolveKey(
    c.env.DB,
    c.env.TOKEN_ENC_KEY,
    provider.name,
    secretName === undefined ? undefined : (c.env[secretName as keyof Env] as string | undefined),
  )
  if (resolved.key === null) {
    await setFlash(c.env, c.req.raw, { kind: 'bad', text: `${provider.label}: لا مفتاح لاختباره.` })
    return back('providers')
  }

  const result =
    provider.kind === 'anthropic'
      ? await verifyKey('anthropic', resolved.key)
      : provider.baseUrl === null
        ? { ok: false as const, detail: 'لا عنوان لهذا المزوّد', status: null }
        : await verifyCompat(provider.baseUrl, resolved.key)

  await record(
    c.env.DB,
    {
      actor: 'panel',
      action: 'provider.verify',
      target: provider.name,
      detail: result.ok ? 'نجح' : `فشل — ${result.detail}`,
    },
    c.req.raw,
  )

  if (result.ok) {
    await markVerified(c.env.DB, provider.name)
    await setFlash(c.env, c.req.raw, { kind: 'ok', text: `${provider.label}: ${result.detail}.` })
  } else {
    // لا تُمحى شهادةٌ سابقة على فشلٍ قد يكون من الخدمة لا المفتاح
    await setFlash(c.env, c.req.raw, { kind: 'bad', text: `${provider.label}: ${result.detail}.` })
  }
  return back('providers')
})

panel.post('/panel/providers/toggle', async (c) => {
  const guard = await providerGuard(c)
  if ('denied' in guard) return guard.denied
  const form = guard.form

  const enabled = String(form.get('enabled') ?? '') === 'true'
  await setEnabled(c.env.DB, guard.provider.name, enabled, 'panel')
  await record(
    c.env.DB,
    {
      actor: 'panel',
      action: 'provider.toggle',
      target: guard.provider.name,
      detail: enabled ? 'فُعّل' : 'عُطّل',
    },
    c.req.raw,
  )
  await setFlash(c.env, c.req.raw, {
    kind: enabled ? 'ok' : 'warn',
    text: enabled ? `${guard.provider.label}: فُعّل.` : `${guard.provider.label}: عُطّل — ومفتاحه محفوظ.`,
  })
  return back('providers')
})

panel.post('/panel/providers/delete', async (c) => {
  const guard = await providerGuard(c)
  if ('denied' in guard) return guard.denied

  const removed = await deleteProvider(c.env.DB, guard.provider.name)
  await record(
    c.env.DB,
    {
      actor: 'panel',
      action: 'provider.delete',
      target: guard.provider.name,
      detail: removed ? 'حُذف' : 'مدمَج — رُفض الحذف',
    },
    c.req.raw,
  )
  await setFlash(c.env, c.req.raw, {
    kind: removed ? 'warn' : 'bad',
    text: removed
      ? `${guard.provider.label}: حُذف.`
      : `${guard.provider.label}: مدمَج ولا يُحذف — عطّله بدل ذلك.`,
  })
  return back('providers')
})

/** توجيه مهمّة إلى مزوّدٍ ونموذج — قرارُ المالك لا الشيفرة. */
panel.post('/panel/routes', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const form = gate.form

  const task = String(form.get('task') ?? '')
  const provider = String(form.get('provider') ?? '')
  const model = String(form.get('model') ?? '').trim()

  if (!KNOWN_TASKS.has(task)) return c.json({ error: 'unknown_task' }, 400)
  if ((await getProvider(c.env.DB, provider)) === null) {
    return c.json({ error: 'unknown_provider' }, 400)
  }
  if (model === '') {
    await setFlash(c.env, c.req.raw, { kind: 'bad', text: 'اسم النموذج مطلوب.' })
    return back('providers')
  }

  await writeRoute(c.env.DB, task as TaskName, provider, model, 'panel')
  await record(
    c.env.DB,
    { actor: 'panel', action: 'route.write', target: task, detail: `${provider} / ${model}` },
    c.req.raw,
  )
  await setFlash(c.env, c.req.raw, { kind: 'ok', text: `${task} ← ${provider} / ${model}.` })
  return back('providers')
})

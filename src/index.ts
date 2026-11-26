/**
 * sada-api — نقطة الدخول.
 *
 * المرحلة صفر: الصحة والجاهزية، وربط الحسابات عبر OAuth.
 * لوحة الاعتماد والنشر المجدول في المرحلة الأولى.
 */
import { revisePackage } from './lib/package/revision'
import { draftRef, recordDraftFailure } from './lib/plan/draftFail'
import { accessGuard } from './routes/access'
import { Hono } from 'hono'
import type { MessageBatch, ScheduledController } from '@cloudflare/workers-types'
import { adminGate } from './routes/adminGate'
import { previousKey, registerKeyring } from './lib/crypto'
import { rotateKeys } from './lib/security/rotate'
import { BASE_HEADERS } from './lib/security/headers'
import { afterVault, readiness, type Env } from './env'
import { analyzeSource } from './lib/analyze/job'
import { OWNER_ORG } from './lib/tenancy'
import { isConfigured, PROVIDERS, routeStatuses, type ProviderName } from './lib/ai/registry'
import { resolveKey } from './lib/providers'
import { spendByProvider } from './lib/ai/spend'
import { blockerReason, checkAllowance } from './lib/limits'
import { enqueueForAnalysis, scanDrive } from './lib/drive/job'
import { scanDriveMedia } from './lib/drive/media'
import { publishPost, type PublishMessage } from './lib/publish/publisher'
import { claimDelivery, dispatchDue, sweepStuck } from './lib/schedule/job'
import { expireStaleUploads } from './lib/media/uploads'
import { pullDue } from './lib/metrics/job'
import { runWeeklyAll } from './lib/report/job'
import { collectAlerts } from './lib/alerts/collect'
import { readSettings } from './lib/settings'
import { sendAlerts } from './lib/alerts/outbox'
import { readWebhookUrl } from './lib/alerts/webhook'
import { expiringTokens, recordAlerts } from './lib/token/expiry'
import { renewDue, renewStalled } from './lib/token/renew'
import { PROVIDERS as OAUTH_PROVIDERS } from './lib/oauth/providers'
import { readApp, SECRET_NAMES } from './lib/oauth/apps'
import { PAGE_SECRET_NAMES, pageApp } from './lib/linkedinPage'
import { ICON_BYTES } from './routes/ui/shell'
import { assets } from './routes/assets'
import { pwa } from './routes/pwa'
import { review } from './routes/review'
import { fonts } from './routes/fonts'
import { legal } from './routes/legal'
import { landing } from './routes/landing'
import { verify } from './routes/verify'
import { media } from './routes/media'
import { oauth } from './routes/oauth'
import { oauthPage } from './routes/oauthPage'
import { panel } from './routes/panel'
import { beat } from './lib/ops/heartbeat'
import { mailMonthlyReports } from './lib/report/mail'
import { ownerZone } from './lib/time/ownerZone'
import { sweepRetention } from './lib/privacy/retention'
import { purgeDeleted } from './lib/privacy/trash'
import { record } from './lib/audit'
import { pulseReport } from './lib/ops/pulse'
import { snapshotDue, takeSnapshot } from './lib/ops/backup'
import { snapshotKid } from './lib/ops/snapshot'
import { prunePulseSlots, recordProbe } from './lib/ops/slo'
import { auth } from './routes/auth'
import { notFoundResponse, serverErrorResponse } from './routes/errors'
import { draftFromIdea, draftPost } from './lib/draft/job'
import { generateForPost, resumeWaiting } from './lib/image/job'
import { compareKlein, kleinLedgerRows, parseCheckQuery, type KleinCheck } from './lib/image/priceCheck'
import { attachStatement } from './lib/library'
import { autoImageRoom } from './lib/image/auto'
import { CLIP_CHANNELS, type PlanPlatform } from './lib/plan/prompt'
import { runPlanBuild, type PlanBuildMessage } from './routes/panel/plan'
import type { PackageSyncMessage } from './routes/panel/package'
import { writeSeatedPost, type SeatedWriteMessage } from './lib/plan/seatedWrite'
import { readSource, sourceById, syncPackage, tokenFor } from './lib/package/sync'
import { flushRepoStatus } from './lib/package/statusFile'
import { providerKey } from './routes/panel/channels'
import { dailyChecks } from './lib/ai/health'

/** يُصدَّر للاختبار: `app.request` يشغّل المسارات بلا شبكة ولا Worker. */
export const app = new Hono<{ Bindings: Env }>()

/**
 * ترويسات الأمان على **كلّ** ردّ — لا على صفحات اللوحة وحدها.
 *
 * وُضعت وسيطا لا في كلّ مسار للسبب نفسه الذي وُضع له حارسُ `/admin/*` في
 * موضعٍ واحد: مسارٌ جديد يُكتب بلا ترويسات ولا يلحظه أحد، فردُّ JSON بلا
 * `nosniff` يصير موضعا يُفسَّر فيه ما لُقّم على أنّه HTML.
 *
 * و`set` لا `append`: ردُّ HTML من اللوحة يحمل سياستَه بـ `nonce` — ولا
 * تُدهس هنا، لأنّ هذه القائمة لا تحمل `Content-Security-Policy` أصلا.
 */
app.use('*', async (c, next) => {
  await next()
  for (const [name, value] of Object.entries(BASE_HEADERS)) {
    /**
     * **يملأ ما نقص، ولا يدهس ما قيل عمدا.**
     *
     * كانت `set` تدهس، **فترويسةٌ يضعها مسارٌ لسببٍ لا أثرَ لها** —
     * وهذا ما وقع فعلا: مسارُ الوسائط الموقَّع (D-050) يضع
     * `Cross-Origin-Resource-Policy: cross-origin` منذ كُتب، **ولم
     * تخرج مرّةً واحدة**. ولا اختبارَ كان يقرؤها، فبدا أنّها تعمل.
     *
     * والعطبُ من هذا النوع لا يُرى: لا عطل، ولا سطرَ في السجلّ —
     * سطرُ شيفرةٍ يبدو أنّه يفعل شيئا وهو لا يفعل.
     *
     * وما في `BASE_HEADERS` لا يضعه مسارٌ من تلقائه (HSTS، `nosniff`،
     * `Referrer-Policy`)، **فالملءُ عند الغياب يساوي الدهسَ لها** —
     * ويفترق عنه حيث يجب أن يفترق وحده.
     */
    if (!c.res.headers.has(name)) c.res.headers.set(name, value)
  }
})

/**
 * **حلقةُ المفاتيح من البيئة قبل أيّ عمل** (D-318): `TOKEN_ENC_KEY_PREV` يُقرأ هنا وفي `queue` و`scheduled`، فيفكّ كلُّ
 * مسارٍ ما شُفِّر بالمفتاح السابق أثناء التدوير بلا أن يُمرَّر إليه.
 */
app.use('*', async (c, next) => {
  registerKeyring(c.env)
  await next()
})

/**
 * **الحالُ وحدَها لمن لا يُعرَف** (D-318): كان يردّ اسمَ البيئة. والتفصيلُ خلف كلمة الإدارة (`/admin/ready`).
 */
app.get('/health', (c) =>
  c.json({ ok: true, service: 'sada-api' }),
)

/**
 * جاهزيّةُ التشغيل لمن لا يُعرَف — **الحالُ وحدَها** (D-318): جاهزٌ أم لا، والقاعدةُ موصولةٌ أم لا، واسمُ الخدمة ليعرف
 * سيرُ النشر أنّ الرادَّ صدى. وكان يردّ أسماءَ الأسرار الناقصة وما سدّته الخزانةُ لأيّ أحد: خريطةٌ لما ينقص البيئةَ ولأيّ
 * منصّةٍ تُدار بالخزانة. **والتفصيلُ كما كان خلف كلمة الإدارة** (`/admin/ready`).
 *
 * ‏**ومعرّفُ النسخة المخدومة** (D-319): كان سيرُ النشر يفحص الجوابَ ولا يعرف أهو من البناء الذي نشره للتوّ أم من قديمٍ لم
 * ‏يُستبدَل — فبناءٌ عالقٌ يمرّ بكلّ فحص. والمعرّفُ من ربط `version_metadata` كما هو (لا سرَّ فيه ولا اسمَ بيئة)، و`null` بدونه.
 */
app.get('/ready', async (c) => {
  const { ready, database } = await readinessDetail(c.env)
  return c.json({ ready, service: 'sada-api', database, version: servedVersion(c.env) }, ready ? 200 : 503)
})

/** ‏معرّفُ النسخة من ربطها — نصًّا غيرَ فارغٍ وإلّا فـ`null`: ربطٌ غائبٌ أو تالفٌ لا يُكتب في الجواب كما وصل (D-319). */
function servedVersion(env: Env): string | null {
  const id: unknown = env.CF_VERSION_METADATA?.id
  return typeof id === 'string' && id !== '' ? id : null
}

/**
 * ‏**النبضُ لمراقبٍ من الخارج** (D-320) — بلا مصادقةٍ ولا تفصيل: ‏200 حين دار الإرسالُ والتجديدُ في موعدهما ولم يتأخّر مستهلكُ
 * ‏النشر عمّا سُلّم إليه، و‏503 حين تأخّر أحدُها أو لم يُقرأ النبض. **ولا يقول أيُّها ولا متى**: ما يتأخّر يُقرأ في «هل الآلة تعمل؟»
 * ‏في اللوحة، وخريطةُ الدورات لمن لا يُعرَف لا تُعطى (D-318). وكان التنبيهُ يخرج من الـ Cron نفسِه، فإن وقف وقف معه مَن يقول
 * ‏إنّه وقف — فيسأله مراقبٌ خارج Cloudflare (M-47). ولا تخبئة: جوابُ دقيقةٍ مضت ليس نبضًا.
 */
app.get('/pulse', async (c) => {
  const now = new Date()
  const report = await pulseReport(c.env.DB, now).catch(() => ({ healthy: false }))
  // ‏**وكلُّ سؤالٍ يُعدّ في خانته** (D-321): منه «التوافرُ من الخارج» في «صحّة صدى». مرّةً للخانة في كلّ نسخة، ولا يرمي
  await recordProbe(c.env.DB, now, report.healthy)
  c.header('Cache-Control', 'no-store')
  return c.json({ ok: report.healthy }, report.healthy ? 200 : 503)
})

/**
 * حارس `/admin/*` في موضعٍ واحد — **وسيطٌ قبل المسارات لا نداءٌ في كلٍّ منها** (D-318).
 *
 * تكرارُه في كلّ مسار يعني أنّ مسارا جديدا قد يُكتب بلا حارس ولا يلحظه
 * أحد — وهي الثغرة نفسها التي كشفها D-019. والوسيطُ يجمع الحدَّ والرمزَ
 * والبابَ وسطرَ السجلّ (`routes/adminGate.ts`)، فمسارٌ يُضاف تحت `/admin/`
 * يمرّ به شاء كاتبُه أم نسي.
 */
app.use('/admin/*', adminGate)

/**
 * جاهزية التشغيل بتفصيلها — **خلف كلمة الإدارة** (D-318): يقول ما الناقص بالاسم، ولا يكشف قيمة سر.
 * يرد 503 ما دام شيء ناقصا، حتى لا يبدو النظام جاهزا وهو ليس كذلك.
 *
 * **ومفتاحٌ في الخزانة ليس مفتاحا ناقصا.** كان `/ready` يقرأ أسرار
 * Worker وحدها، فيقول «ANTHROPIC_API_KEY ناقص» واللوحةُ تقول «حُفظ» —
 * وكلاهما صادقٌ في مصدره، والمالكُ يرى تناقضا فيشكّ في أيّهما يصدّق.
 * فصار الناقصُ يُفرز: ما لا وجود له، وما وُجد في الخزانة. والجاهزيّةُ
 * لا تُحجب على الثاني.
 */
app.get('/admin/ready', async (c) => {
  const detail = await readinessDetail(c.env)
  // ‏وحالُ المفاتيح (D-318): أيُّ مفتاحٍ يعمل، وأثمّة سابق، وكم حقلًا ليس على الحاليّ — ومنه قرارُ حذف السابق
  // ‏(مراجعة D-318) و«القديمُ» قبل D-318 على حدة، ورموزُ الاسترداد على غير الحاليّ — والسابقُ لا يُحذف قبل أن يصيرا صفرًا
  let keys: { kid: string; previous: string | null; pending: number; legacy: number; recovery: number } | 'unreadable' = 'unreadable'
  try {
    const report = await rotateKeys(c.env.DB, c.env.TOKEN_ENC_KEY, { apply: false })
    keys = { kid: report.kid, previous: report.previous, pending: report.pending, legacy: report.legacy, recovery: report.recovery }
  } catch {
    keys = 'unreadable'
  }
  // ‏وسعرُ klein 9B المقيس (D-398): الدفترُ بالجدول، وباللوحة إن مرّر المالكُ عددها — قراءةٌ لا تُسقط الجاهزيّة
  const q = parseCheckQuery(c.req.query('day'), c.req.query('klein_dashboard_neurons'), new Date().toISOString().slice(0, 10))
  let imagePrice: KleinCheck | 'unreadable' = 'unreadable'
  try {
    imagePrice = compareKlein(q.day, await kleinLedgerRows(c.env.DB, q.day), q.dashboard)
  } catch {
    imagePrice = 'unreadable'
  }
  return c.json({ ...detail, version: servedVersion(c.env), keys, image_price: imagePrice }, detail.ready ? 200 : 503)
})

async function readinessDetail(env: Env): Promise<{
  readonly ready: boolean
  readonly database: 'ok' | 'unreachable'
  readonly phase_0: boolean
  readonly phase_1: boolean
  readonly drive_folder: boolean
  readonly missing_secrets: readonly string[]
  readonly configured_in_vault: readonly string[]
  /** ‏أسرارٌ اختياريّة ناقصة (D-423): لا تمنع الجاهزيّة — سرّا تطبيق صفحة LinkedIn بانتظار M-03. */
  readonly missing_optional_secrets: readonly string[]
}> {
  const state = readiness(env)
  let database: 'ok' | 'unreachable' = 'unreachable'
  try {
    await env.DB.prepare('SELECT 1').first()
    database = 'ok'
  } catch {
    database = 'unreachable'
  }
  // ما سُدّ من الخزانة يُذكر على حدة — لا في «ناقص» ولا مسكوتا عنه
  let inVault: string[] = []
  if (database === 'ok' && state.missing.length > 0) {
    inVault = await vaultCovered(env, state.missing)
  }
  // **والحكمُ يُعاد بعد أن يُعرَف ما سُدّ** (D-095): كان يُحسَب من بيئة
  // Worker وحدَها، فيخرج جوابٌ يقول «لا شيءَ ناقص» و«غيرُ جاهز» معا
  const sealed = afterVault(state, inVault)

  // البوابة هي المرحلة صفر: نظام ينشر ولا يفهم ليس معطلا
  const ready = sealed.phase0 && database === 'ok'
  return {
    ready,
    database,
    phase_0: sealed.phase0,
    phase_1: sealed.phase1,
    drive_folder: sealed.driveFolder,
    missing_secrets: sealed.missing,
    configured_in_vault: inVault,
    missing_optional_secrets: PAGE_SECRET_NAMES.filter((n) => {
      const v = (env as unknown as Record<string, unknown>)[n]
      return typeof v !== 'string' || v.trim() === ''
    }),
  }
}

/**
 * أيُّ الأسرار الناقصة سدّته خزانةُ المزوّدين.
 *
 * والربطُ باسم السرّ لا بالمزوّد: `ANTHROPIC_API_KEY` هو سرُّ `anthropic`،
 * وهذا ما تعرفه `PROVIDERS`. **ولا تُقرأ قيمةُ مفتاحٍ هنا** — وجودُه
 * وحده يُسأل عنه.
 */
async function vaultCovered(env: Env, missing: readonly string[]): Promise<string[]> {
  const covered: string[] = []
  for (const name of missing) {
    const provider = (Object.keys(PROVIDERS) as ProviderName[]).find(
      (p) => PROVIDERS[p].secret === name,
    )
    if (provider === undefined) continue
    try {
      const resolved = await resolveKey(env.DB, env.TOKEN_ENC_KEY, provider, undefined)
      if (resolved.key !== null) covered.push(name)
    } catch {
      // خزانةٌ لا تُقرأ تعني «لم يُسدّ» — والصمتُ هنا لا يخفي شيئا
    }
  }

  // وأسرارُ تطبيقَي OAuth كذلك (D-042): سُدّت من اللوحة فلا تُعدّ ناقصة
  for (const platform of ['linkedin', 'x'] as const) {
    const [idName, secretName] = SECRET_NAMES[platform]
    if (!missing.includes(idName) && !missing.includes(secretName)) continue
    try {
      // بلا بيئة: يُسأل عن الخزانة وحدها — والبيئةُ محسوبةٌ أصلا في `missing`
      const app = await readApp(env.DB, env.TOKEN_ENC_KEY, platform, {})
      if (app === null) continue
      for (const name of [idName, secretName]) {
        if (missing.includes(name)) covered.push(name)
      }
    } catch {
      // كسابقتها: ما لا يُقرأ لا يُعدّ مسدودا
    }
  }
  return covered
}

/**
 * لوحة المزوّدين — قراءةٌ محضة.
 *
 * تجيب في نداءٍ واحد: أيّ مزوّدٍ مضبوط، وأيّ نموذجٍ ينفّذ كلّ مهمّة ولمَ،
 * وكم أنفق كلٌّ منهم. وكان ذلك يُعرف بقراءة الشيفرة وحدها.
 *
 * **ولا تعيد قيمة مفتاحٍ قطّ** — ولا جزءا منها. أسماءٌ وحالٌ وأرقام.
 * ومفاتيح المزوّدين تبقى في أسرار Worker: لا تمرّ بهذه الشيفرة ولا
 * تُقرأ منها.
 */
app.get('/admin/providers', async (c) => {

  const days = 30
  let spend: Awaited<ReturnType<typeof spendByProvider>> = {}
  let ledger: 'ok' | 'unreachable' = 'unreachable'
  try {
    spend = await spendByProvider(c.env.DB, days)
    ledger = 'ok'
  } catch {
    // دفترٌ لا يُقرأ لا يُسقط اللوحة: التوجيه والحال يُقالان بلا أرقام
    ledger = 'unreachable'
  }

  const routes = routeStatuses(c.env)
  const providers = (Object.keys(PROVIDERS) as ProviderName[]).map((name) => {
    const used = routes.filter((r) => r.provider === name)
    const entry = spend[name]
    return {
      name,
      label: PROVIDERS[name].label,
      configured: isConfigured(c.env, name),
      // اسم السرّ لا قيمته — ليعرف المالك ما يضبط
      secret_name: PROVIDERS[name].secret,
      how_to_get: PROVIDERS[name].docs,
      tasks: used.map((r) => r.task),
      models_in_use: [...new Set(used.filter((r) => r.implemented).map((r) => r.model))],
      calls: entry?.calls ?? 0,
      spend: entry?.total ?? 0,
    }
  })

  const totalSpend = Object.values(spend).reduce((sum, e) => sum + (e?.total ?? 0), 0)

  return c.json({
    window_days: days,
    ledger,
    currency: 'USD',
    total_spend: totalSpend,
    providers,
    routing: routes,
    /** ما ينقص لتعمل مهمّةٌ مبنيّة — لا لتعمل مهمّةٌ لم تُبنَ بعد. */
    blocked: routes
      .filter((r) => r.implemented && !r.ready)
      .map((r) => ({ task: r.task, missing_secret: PROVIDERS[r.provider].secret })),
  })
})

/**
 * ما في القاعدة الآن: معرّف كلّ مصدر وحاله.
 *
 * وُجد لأنّ `/admin/scan` يعيد معرّفات Drive، والتحليل كان يطلب معرّف
 * الصفّ — فلا سبيل للمالك إلى الثاني. ونقصٌ كهذا يجعل ما بُني غير قابل
 * للاستعمال وإن كان سليما.
 */
app.get('/admin/sources', async (c) => {

  const { results } = await c.env.DB.prepare(
    `SELECT s.id, s.drive_file_id, s.name, s.mime, s.content_hash, s.last_seen_at,
            i.worth_score, i.summary, i.themes_json
       FROM sources s
       LEFT JOIN content_items i ON i.source_id = s.id AND i.org_id = s.org_id
      WHERE s.org_id = ?
      ORDER BY s.last_seen_at DESC`,
  )
    // ‏مسارُ المشرف بلا جلسة، ومصادرُ Drive تسكن منظّمةَ المالك (D-233 · D-277)
    .bind(OWNER_ORG)
    .all<{
    id: string
    drive_file_id: string
    name: string
    mime: string
    content_hash: string
    last_seen_at: string
    worth_score: number | null
    summary: string | null
    themes_json: string | null
  }>()

  const sources = results.map((row) => {
    // البصمة محفوظة مع التحليل: يُقارَن بها ليُعرف أهو للنسخة الحاليّة
    let analyzedHash: string | null = null
    if (row.themes_json !== null) {
      try {
        analyzedHash = (JSON.parse(row.themes_json) as { hash?: string }).hash ?? null
      } catch {
        analyzedHash = null
      }
    }
    return {
      id: row.id,
      drive_file_id: row.drive_file_id,
      name: row.name,
      mime: row.mime,
      last_seen_at: row.last_seen_at,
      analyzed: analyzedHash !== null,
      stale: analyzedHash !== null && analyzedHash !== row.content_hash,
      worth_score: row.worth_score,
      summary: row.summary,
    }
  })

  return c.json({
    count: sources.length,
    pending: sources.filter((s) => !s.analyzed || s.stale).length,
    sources,
  })
})

/**
 * تشغيل المسح يدويا — للتحقق قبل أن يحين موعد Cron.
 * لا يفعل شيئا لا يفعله Cron: المسار نفسه، فما يُختبر هنا هو ما يجري هناك.
 */
app.post('/admin/scan', async (c) => {
  // الحارس قبل أيّ عمل (`adminGate`): لا نداء Google ولا كتابة في D1 لطلبٍ غير مأذون
  try {
    const report = await scanDrive({
      db: c.env.DB,
      serviceAccountJson: c.env.GOOGLE_SA_JSON,
      folderId: c.env.DRIVE_FOLDER_ID,
    })
    return c.json(report)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unexpected_error'
    return c.json({ error: 'scan_failed', detail: message }, 502)
  }
})

/**
 * تحليل مصدرٍ واحد يدويا — للتحقق قبل أن يتولّاه الطابور.
 *
 * يقبل معرّف الصفّ أو معرّف Drive: تقرير المسح يعيد الثاني.
 * وخلف الحارس نفسه: النداء يكلّف مالا، فلا يُترك مفتوحا (D-019).
 */
app.post('/admin/analyze/:sourceRef', async (c) => {
  const outcome = await analyzeSource(
    {
      db: c.env.DB,
      media: c.env.MEDIA,
      serviceAccountJson: c.env.GOOGLE_SA_JSON,
      anthropicKey: c.env.ANTHROPIC_API_KEY,
      encKey: c.env.TOKEN_ENC_KEY,
      geminiKey: c.env.GEMINI_API_KEY,
    },
    c.req.param('sourceRef'),
  )
  // 423 Locked: مُنع بقرارٍ قائم لا بعطل. و 502 لعطلٍ حقيقيّ.
  if (outcome.kind === 'blocked') return c.json(outcome, 423)
  return c.json(outcome, outcome.kind === 'failed' ? 502 : 200)
})

// **والخطُّ قبل الجميع**: تطلبه صفحةُ الدخول نفسُها، فحارسٌ يردّه يُخرج
// شاشةَ دخولٍ بخطٍّ بديل — ولا جلسةَ بعدُ ليُحرَس بها (D-099)
// ‏حارسُ الأدوار قبل كلّ مسار (D-272): المدعوّ يُفحَص دورُه وشركتُه، والمالكُ يمرّ ويُكتب بريدُه في التدقيق
app.use('*', accessGuard)
app.route('/', assets)
app.route('/', pwa)
app.route('/', fonts)
// الوثيقتان العامّتان قبل كلّ حارس: تُقرآن من الخارج بلا جلسة
app.route('/', legal)
app.route('/', landing)
app.route('/', verify)
app.route('/', media)
app.route('/', oauthPage)
app.route('/', oauth)
// قبل اللوحة: مسارات العامل الثاني أخصّ، ولها حارسُها الذي يقبل المعلَّقة
app.route('/', auth)
app.route('/', review)
app.route('/', panel)

/**
 * رمزُ التبويب — **مسارٌ حقيقيّ، لا لأنّ الوثيقة تحتاجه**.
 *
 * الوثيقةُ تحمل الرمزَ في `data:` وتكفيها. **لكنّ المتصفّح يطلب
 * `/favicon.ico` بغير ذلك**: للتاريخ، وللإشارات المرجعيّة، ولطلبٍ
 * سابقٍ للوثيقة أحيانا. وبلا مسارٍ يردّ الخادمُ ٤٠٤ يحمل
 * `Cross-Origin-Resource-Policy: same-origin` — **فيظهر في الكونسول
 * حظرٌ يقرأه القارئُ عطلَ أمن**، وهو أثرُ صفحةٍ لا وجودَ لها.
 *
 * و`cross-origin` على هذا المسار وحده: **الرمزُ علامةٌ عامّة**، وهو ما
 * فُعل بمسار الوسائط الموقَّع (D-050). ولا يُوسَّع إلى غيره.
 *
 * وSVG لا ICO: المتصفّحاتُ الحيّةُ كلُّها تقرؤه، وهو يعمل عند كلّ قياس.
 */
app.get('/favicon.ico', (c) =>
  c.body(ICON_BYTES, 200, {
    'Content-Type': 'image/svg+xml; charset=utf-8',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'X-Content-Type-Options': 'nosniff',
    // علامةٌ لا تتبدّل — ويومٌ كاملٌ يمنع نداءً في كلّ فتحة
    'Cache-Control': 'public, max-age=86400',
  }),
)

/**
 * ‏٤٠٤ و‏٥٠٠ (خطّة التصميم 7.11 · D-189) — **صفحةٌ بالقالب نفسِه لمن يطلب HTML**، وJSON لغيره.
 * كان كلُّ مسارٍ لا وجودَ له يردّ `{"error":"not_found"}` في وجه المالك، وكلُّ استثناءٍ يردّ
 * «Internal Server Error» بالإنجليزيّة. والحكمُ بترويسة `Accept` في `routes/errors.ts`.
 */
app.notFound((c) => notFoundResponse(c.req.raw))
app.onError((error, c) => serverErrorResponse(c.req.raw, error))

/**
 * مستهلك طابور النشر.
 *
 * `ack` للنجاح وللفشل الذي لا تُصلحه إعادة المحاولة — رفضُ منصةٍ لمنشور
 * مخالف لا يصلحه تكرارُه، وتركُه في الطابور يعني دفعا متكررا بلا فائدة.
 * `retry` لما قد ينجح لاحقا وحده: 429 و 5xx وانقطاع الشبكة.
 *
 * والمفتاح يحمي في الحالتين: إعادة المحاولة تجد محاولة ناجحة بالمفتاح
 * نفسه فتخرج بلا طلب ثان.
 */
/** ما يحمله طابور التوليد: معرّف مصدرٍ يُفهَم، لا نصّه. */
export interface AnalyzeMessage {
  readonly sourceId: string
}

/**
 * **وبندُ خطّةٍ يُكتب** (D-258 · «ابدأ»): المصدرُ والمنصّةُ والعميل. يُكتب بـ `draftPost` نفسِها بحرّاسها ومفتاحها،
 * ثمّ صورتُه إن رُفعت الصورةُ الآليّة وبقي من سقفها. **ولا جدولة**: المسوّدةُ تنتظر اعتمادَ المالك كما تنتظر كلُّ مسوّدة.
 */
export interface PlanDraftMessage {
  readonly draft: {
    readonly sourceId: string
    /** كلُّ قناةٍ ينشر لها صدى (D-282). */
    readonly platform: PlanPlatform
    readonly org: string
    readonly asset?: string
    readonly planId?: string
    /** نصُّ الفكرة حين يكون المصدرُ `idea:<n>` — يُكتب منها بـ `draftFromIdea`. */
    readonly idea?: string
    /** قواعدُ منصّتها من ورقة الإرشادات (D-361)، قسمًا جاهزًا للموجّه. */
    readonly rules?: string
    /** اختيارُ الخطّة: صورةٌ مع كلّ منشور؟ وغيابُه الإعدادُ العامّ كما كان. */
    readonly autoImage?: boolean
    /** ونوعُها (D-285) — وغيابُه إنفوجرافيك كما كان. */
    readonly imageStyle?: 'infographic' | 'illustration'
    /** ‏بندٌ طُلب سلسلةً على X (D-324) — وغيابُه منشورٌ واحدٌ كما كان. */
    readonly shape?: 'thread'
    /** ‏معرّفُ بند الخطّة وزاويتُه (D-329): تُكتب المسوّدةُ من الزاوية وتُربط ببندها — وغيابُهما خطّةٌ قبل D-329. */
    readonly itemId?: string
    readonly angle?: string
  }
}

/**
 * مستهلك طابور الفهم.
 *
 * `retry` لما قد ينجح وحده (429 · 5xx · انقطاع)، و `ack` لما لا يصلحه
 * التكرار: نوعٌ غير مدعوم، أو رفضُ سياسة، أو مصدرٌ لا وجود له. وتركُ
 * الثاني في الطابور يعني نداءً مدفوعا يتكرّر بلا أمل.
 */
async function planDraft(message: QueueMessage<PlanDraftMessage>, env: Env): Promise<void> {
  const { sourceId, platform, org, idea } = message.body.draft
  const shape = message.body.draft.shape === 'thread' ? 'thread' : 'single'
  const itemId = /^[0-9a-f]{6,32}$/.test(message.body.draft.itemId ?? '') ? message.body.draft.itemId : undefined
  const secrets = env as unknown as Record<string, string | undefined>
  const deps = { db: env.DB, encKey: env.TOKEN_ENC_KEY, workerSecrets: secrets, org }
  // ‏فكرةُ المالك (D-282) تُكتب بباب «اكتب من فكرتك» نفسِه، لا بطريقٍ ثانٍ حول حرّاسه
  const outcome = sourceId.startsWith('idea:')
    ? idea === undefined || idea === ''
      ? { kind: 'failed' as const, reason: 'بندُ فكرةٍ بلا نصّها', retryable: false }
      : await draftFromIdea(deps, idea, platform, shape, (message.body.draft.rules ?? '').slice(0, 2400))
    : await draftPost(deps, sourceId, platform, undefined, shape, itemId === undefined ? undefined : { id: itemId, text: message.body.draft.angle ?? '' })
  console.info({ job: 'plan-draft', source: sourceId, platform, kind: outcome.kind })
  // ‏ما يصلحه الوقتُ يُعاد، وما مُنع بسقفٍ أو كُتب من قبل يُقَرّ (كالنشر)
  const planId = message.body.draft.planId
  // ‏ما تعذّر نهائيًّا يُكتب سببُه (PL-23): المراجعةُ تقوله بدل «يكتب الآن» إلى الأبد. والإعادةُ الأخيرة قبل طابور الأعطال نهائيّةٌ أيضًا
  const why = outcome.kind === 'blocked' || outcome.kind === 'not_analyzed' ? outcome.reason
    : outcome.kind === 'failed' && (!outcome.retryable || message.attempts >= 3) ? outcome.reason : null
  if (why !== null && planId !== undefined) await recordDraftFailure(env.DB, org, planId, draftRef(itemId, sourceId, platform), why)
  if (outcome.kind === 'failed' && outcome.retryable && message.attempts < 3) return retryLater(message, outcome.kind)
  message.ack()
  // ‏والمسوّدةُ تعرف خطّتها (D-261): منها يُقرأ يومُ البند حين تُجدوَل الخطّة
  if (outcome.kind === 'drafted' && planId !== undefined) {
    // ‏ومسوّدةُ الفكرة تحمل معرّفَ بندها في `source_refs`، فتجدها جدولةُ الخطّة كما تجد مسوّدةَ المصدر
    // ‏ومعرّفُ البند فيها أيضًا (D-329): به تطابق المراجعةُ والجدولةُ البندَ بمسوّدته حين يتكرّر المصدرُ على المنصّة
    const refs = itemId !== undefined ? JSON.stringify([sourceId, `item:${itemId}`]) : sourceId.startsWith('idea:') ? JSON.stringify([sourceId]) : null
    await env.DB.prepare('UPDATE posts SET plan_id = ?, source_refs = coalesce(?, source_refs) WHERE id = ? AND org_id = ? AND plan_id IS NULL')
      .bind(planId, refs, outcome.postId, org).run()
      .catch((error: unknown) => console.warn({ job: 'plan-draft-link', post: outcome.postId, failed: String(error) }))
  }
  // ‏ما اختير من المكتبة (D-260) يُربط بالمسوّدة بلا كلفة، ولا تُرسم لها صورةٌ آليّة فوقه
  const asset = message.body.draft.asset
  if (outcome.kind === 'drafted' && asset !== undefined) {
    const linked = attachStatement(env.DB, org, outcome.postId, asset)
    if (linked !== null) await linked.run().catch((error: unknown) => console.warn({ job: 'plan-draft-asset', post: outcome.postId, failed: String(error) }))
    return
  }
  // ‏قناةُ مقاطع بلا أصل: لا صورةَ تُرسم ولا فشل — المسوّدةُ تنتظر مقطعًا يرفعه المالك، كما يشرح فحصُ الناشر
  if (outcome.kind === 'drafted' && CLIP_CHANNELS.has(platform)) return
  // ‏واختيارُ الخطّة (D-282) يغلب الإعدادَ العامّ، والسقفُ اليوميُّ وسقفُ الإنفاق في `autoImageRoom` و`generateForPost` كما هما
  if (outcome.kind === 'drafted' && (await autoImageRoom(env.DB, org, message.body.draft.autoImage)) > 0) {
    await generateForPost({ db: env.DB, bucket: env.MEDIA, encKey: env.TOKEN_ENC_KEY, workerSecrets: secrets }, outcome.postId, { style: message.body.draft.imageStyle ?? 'infographic' })
      .catch((error: unknown) => console.warn({ job: 'plan-draft-image', post: outcome.postId, failed: String(error) }))
  }
}

/**
 * ‏**بندٌ مسكَّنٌ يُكتب من فكرته في مكانه** (D-393): بقواعد خطّته، وبحرّاس `writeOnce` ودفترها. والعابرُ يُعاد ثلاثًا، وما سواه يُقَرّ.
 */
async function seatedWrite(message: QueueMessage<SeatedWriteMessage>, env: Env): Promise<void> {
  const { org, postId } = message.body.seatedWrite
  const outcome = await writeSeatedPost({ db: env.DB, encKey: env.TOKEN_ENC_KEY, workerSecrets: env as unknown as Record<string, string | undefined>, org }, postId)
  console.info({ job: 'seated-write', post: postId, kind: outcome.kind })
  if (outcome.kind === 'failed' && outcome.retryable && message.attempts < 3) return retryLater(message, outcome.kind)
  message.ack()
}

async function analyzeQueue(batch: MessageBatch<AnalyzeMessage | PlanDraftMessage | PlanBuildMessage | PackageSyncMessage | SeatedWriteMessage>, env: Env): Promise<void> {
  for (const message of batch.messages) {
    // ‏كلُّ رسالةٍ في `try` وحدَها (D-320): عطلٌ يُرمى يُعاد بتباعد ولا يُسقط الدفعة
    await guarded(message, 'analyze', async (m) => {
      if ('seatedWrite' in m.body) {
        await seatedWrite(m as QueueMessage<SeatedWriteMessage>, env)
        return
      }
      if ('draft' in m.body) {
        await planDraft(m as QueueMessage<PlanDraftMessage>, env)
        return
      }
      // ‏بناءُ الخطّة في الخلفيّة (D-332): يُقَرّ قبل أن يبدأ — نداءُ التخطيط مدفوع، وإعادةُ الرسالة دفعٌ ثانٍ؛ والفشلُ يُكتب في حاله
      // ‏مزامنةُ حزمة المحتوى (D-366): من الويب هوك أو الاستكمال — مجّانيّة، والتكرارُ ينتهي إلى «لا جديد» بالتزامه
      if ('packageSync' in m.body) {
        m.ack()
        await packageTick(env, (m.body as PackageSyncMessage).packageSync)
        return
      }
      if ('planBuild' in m.body) {
        m.ack()
        await runPlanBuild(env, (m.body as PlanBuildMessage).planBuild)
        return
      }
      const outcome = await analyzeSource(
        {
          db: env.DB,
          media: env.MEDIA,
          serviceAccountJson: env.GOOGLE_SA_JSON,
          anthropicKey: env.ANTHROPIC_API_KEY,
          encKey: env.TOKEN_ENC_KEY,
          geminiKey: env.GEMINI_API_KEY,
        },
        (m.body as AnalyzeMessage).sourceId,
      )
      console.info({ job: 'analyze', ...outcome })
      if (outcome.kind === 'failed' && outcome.retryable) {
        retryLater(m, outcome.kind)
      } else {
        m.ack()
      }
    })
  }
}

/**
 * إعادةٌ بتباعد لا فورا (D-269).
 *
 * `message.retry()` بلا مهلة كانت تعيد الرسالةَ في ثوانٍ، فتُستنفَد
 * المحاولاتُ الثلاث قبل أن يتغيّر شيء: `429` تعود `429`، ورمزٌ منتهٍ لا
 * يُجدَّد قبل دورة التجديد (كلَّ ربع ساعة). فالمهلةُ تتصاعد بالمحاولة،
 * **وانتهاءُ الرمز ينتظر دورةَ تجديدٍ كاملة** قبل أن يُسأل ثانية.
 */
const RETRY_DELAYS_SECONDS = [60, 300, 900] as const
const RENEW_TICK_SECONDS = 15 * 60

export function retryLater(message: { attempts: number; retry(options?: { delaySeconds?: number }): void }, reason: string): void {
  const step = Math.min(Math.max(message.attempts, 1), RETRY_DELAYS_SECONDS.length) - 1
  const delaySeconds = reason === 'token_expired_retry'
    ? Math.max(RENEW_TICK_SECONDS, RETRY_DELAYS_SECONDS[step]!)
    : RETRY_DELAYS_SECONDS[step]!
  message.retry({ delaySeconds })
}

/** ‏ما يكفي من رسالة الطابور: جسدُها ورقمُ تسليمها، وإقرارُها أو إعادتُها. */
export interface QueueMessage<B> {
  readonly body: B
  readonly attempts: number
  ack(): void
  retry(options?: { delaySeconds?: number }): void
}

/**
 * ‏**كلُّ رسالةٍ في `try` وحدَها** (D-320).
 *
 * ‏كان عطلٌ يُرمى من الناشر أو الفهم (D1 تعطّل ثواني) يخرج من `queue()` كلِّها: Cloudflare يعيد الدفعةَ فورًا، فتُستنفَد
 * ‏المحاولاتُ الثلاث في ثوانٍ قبل أن يعود D1، ويسقط ما بعدها في الدفعة معها، ولا يُكتب نبضُ الطابور. فالعطلُ يُسجَّل ويُعاد
 * ‏بتباعد `retryLater` (دقيقةٌ ثمّ خمسٌ ثمّ خمسَ عشرة)، **وما أُقرّ قبل العطل لا يُعاد فوقه**: الإقرارُ أو الإعادةُ الأولى هي الحكم.
 * ‏ويعيد `true` حين رُمي.
 */
export async function guarded<B>(message: QueueMessage<B>, job: string, work: (m: QueueMessage<B>) => Promise<void>): Promise<boolean> {
  let decided = false
  const tracked: QueueMessage<B> = {
    get body() { return message.body },
    get attempts() { return message.attempts },
    ack() { decided = true; message.ack() },
    retry(options) { decided = true; message.retry(options) },
  }
  try {
    await work(tracked)
    return false
  } catch (error) {
    console.error({ job, failed: error instanceof Error ? error.message : 'unexpected_error', attempts: message.attempts })
    if (!decided) retryLater(message, 'infra')
    return true
  }
}

async function publishQueue(batch: MessageBatch<PublishMessage>, env: Env): Promise<void> {
  let failed = 0
  try {
    for (const message of batch.messages) {
      // ‏كلُّ رسالةٍ في `try` وحدَها (D-320): عطلُ D1 يُعاد بتباعد، والإعادةُ آمنة — حجزُ المحاولة (0047) يمنع إرسالًا ثانيًا
      const threw = await guarded(message, 'publish', async (m) => {
        // ‏**الرسالةُ المؤجَّلةُ تختم منشورَها عند وصولها** (D-320): إن بقي كما أُرسلت له وحلّ موعدُه. وصلت قبله؟ تُعاد بما بقي.
        // ‏سُحب أو تغيّر موعدُه أو أُوقف النظام؟ تُقَرّ بلا نشر — والدورةُ ترسل له من جديد إن عاد مجدولًا.
        // ‏**وإعادتُها بعد ختمها تمضي إلى الناشر** (مراجعة D-320): رقمُ التسليم فوق الأوّل، وحرّاسُ الناشر تمنع الإرسالَ المزدوج
        if (m.body.due !== undefined) {
          const claim = await claimDelivery(env.DB, m.body.postId, m.body.org ?? OWNER_ORG, m.body.due, m.attempts > 1)
          if (claim.kind === 'early') return m.retry({ delaySeconds: claim.seconds })
          if (claim.kind !== 'claimed') {
            console.info({ job: 'publish', post: m.body.postId, delivery: claim.kind })
            return m.ack()
          }
        }
        const outcome = await publishPost(
          // والدلوُ يُمرَّر دائما: منشورٌ بصورةٍ لا يُنشر نصّا وحده، ومنشورٌ
          // بلا صورةٍ لا يمسّه (D-040)
          // ‏**وأصلُ الموقع يُمرَّر** (D-182): Instagram تسحب الوسيطَ من رابطٍ موقَّعٍ عندنا
          // (D-121)، وبلا أصلٍ كان كلُّ منشورٍ لها يسقط في الطابور بلا نداءٍ واحد إلى Meta
          // ‏ورقمُ المحاولة من الطابور يُكتب في الصفّ (D-270): بلا هذا لا يُعرَف من اللوحة أيُّ إعادةٍ هذه
          { db: env.DB, encKey: env.TOKEN_ENC_KEY, bucket: env.MEDIA, baseUrl: env.PUBLIC_BASE_URL, queueAttempt: m.attempts },
          m.body,
        )
        // `blocked` تُقَرّ لا تُعاد: إعادةُ ما مُنع بسقفٍ تدور حتّى ينتهي
        // اليوم وتستنزف حصّة الطابور بلا نداءٍ واحد ينجح
        if (outcome.kind === 'failed' && outcome.retryable) {
          retryLater(m, outcome.reason)
        } else {
          m.ack()
        }
        if (outcome.kind === 'failed') failed += 1
      })
      if (threw) failed += 1
    }
  } finally {
    // نبضُ الطابور (D-158): الدفعةُ وقعت، وكم منها سقط — **ولو سقطت كلُّها** (D-320)
    await beat(
      env.DB, 'publish', failed === batch.messages.length ? 'failed' : 'ok',
      failed === 0 ? `${batch.messages.length} رسالة` : `${failed} من ${batch.messages.length} سقط`,
    )
  }
}

/**
 * دورةُ الربع: ترسل ما حلّ موعدُه إلى طابور النشر.
 *
 * رخيصةٌ حين لا شيء يستحقّ: استعلامٌ واحدٌ على فهرس `idx_posts_due` ثمّ
 * خروج. ولذلك تدور كلَّ ربع ساعة بلا حرج — والبديلُ دورةٌ يوميّةٌ تجعل
 * «في موعده» تعني «في مكانٍ ما من اليوم التالي».
 */
/**
 * دورةُ التجديد — **قبل الطابور، كما وعد تعليقُ الناشر.**
 *
 * `publisher.ts` يقول: «التجديد يقع قبل الطابور لا داخله؛ هنا نعلّم
 * ونتوقف بدل أن ننشر برمزٍ ميت». **ولم يكن يقع** — و`refreshToken()`
 * مبنيٌّ منذ المرحلة ٠ ولا يناديه أحد (D-066).
 *
 * وتقع **في كلّ دورة** لا في جدولٍ خاصّ: استعلامٌ على فهرس
 * `idx_tokens_expires` ثمنُه لا يُذكر، **وجدولٌ خامسٌ يزيد ما يُنسى
 * مقابلتُه بـ`wrangler.toml`** (D-058).
 *
 * وعطلُها لا يُرمى: حارسُ الناشر يمنع النشرَ برمزٍ ميت على كلّ حال —
 * **فسقوطُ التجديد يؤخّر ولا يُفسد.** ‏**لكنّه يُنبَض `failed`** (تحقّق D-320 على main): سؤالُ المستحقّ إن سقط، أو ما استحقّ
 * ‏وسقط كلُّه عابرًا (`renewStalled`)، فيقوله `/pulse` وقناةُ المالك.
 */
async function renewTick(env: Env): Promise<void> {
  try {
    const summary = await renewDue({
      db: env.DB,
      encKey: env.TOKEN_ENC_KEY,
      providerFor: (platform) => OAUTH_PROVIDERS[platform],
      // ‏صفحةُ LinkedIn بتطبيقها الثاني (D-423)، وما عداها بالأوّل
      credentialsFor: async (platform, kind) => platform === 'linkedin' && kind === 'org'
        ? pageApp(env as unknown as Record<string, unknown>)
        : readApp(
          env.DB,
          env.TOKEN_ENC_KEY,
          platform,
          env as unknown as Record<string, string | undefined>,
        ),
    })
    if (summary.due > 0) console.info({ job: 'renew', ...summary })
    // النبضُ بعد العمل (D-158): صفٌّ يقول إنّ الدورةَ دارت ولو لم تجد شيئا
    // ‏**وما استحقّ وسقط كلُّه عابرًا دورةٌ ساقطة** (تحقّق D-320 على main): كان ينبض `ok` والرموزُ تقترب من موتها
    if (renewStalled(summary)) {
      await beat(env.DB, 'renew', 'failed', `${summary.due} مستحقّ، ولم يتجدّد منها شيء: ${summary.deferred} عابر`)
      return
    }
    await beat(env.DB, 'renew', 'ok', summary.due > 0 ? `${summary.due} مستحقّ` : 'لا مستحقّ')
  } catch (error) {
    console.error({ job: 'renew', failed: String(error) })
    await beat(env.DB, 'renew', 'failed', String(error))
  }
}

/** رفعٌ تُرك في منتصفه يُلغى ويُعلَّم فاشلًا (D-182) — ولا يُنبَض: ليس عملًا يُنتظر. */
async function uploadsTick(env: Env): Promise<void> {
  try {
    const expired = await expireStaleUploads(env.DB, env.MEDIA, new Date())
    if (expired > 0) console.info({ job: 'uploads', expired })
  } catch (error) {
    console.error({ job: 'uploads', failed: error instanceof Error ? error.message : 'unexpected_error' })
  }
}

async function dispatchTick(env: Env): Promise<void> {
  try {
    // ‏الكنّاسُ قبل الإرسال (D-270): ما علق فوق ساعةٍ يُعلَّم `failed` فيراه التنبيهُ واللوحة
    const swept = await sweepStuck(env.DB, new Date()).catch((error: unknown) => {
      console.error({ job: 'sweep', failed: String(error) })
      return []
    })
    if (swept.length > 0) console.error({ job: 'sweep', failed_posts: swept.map((s) => s.id) })
    const report = await dispatchDue({ db: env.DB, queue: env.PUBLISH_QUEUE })
    if (report.kind === 'sent') {
      console.info({ job: 'dispatch', sent: report.count, ids: report.ids, ahead: report.ahead })
      // ‏و«إلى موعده» ما أُرسل مؤجَّلًا إلى دقيقته (D-320)
      await beat(env.DB, 'dispatch', 'ok', report.ahead > 0 ? `أُرسل ${report.count} · إلى موعده ${report.ahead}` : `أُرسل ${report.count}`)
    } else if (report.kind === 'blocked') {
      console.info({ job: 'dispatch', skipped: report.reason })
      await beat(env.DB, 'dispatch', 'skipped', report.reason)
    } else {
      // `none` لا يُسجَّل في السجلّ: سطرٌ كلَّ ربع ساعة يغرقه — **ويُنبَض**
      // في القاعدة: صفٌّ واحدٌ يُستبدَل، والسؤالُ «أدارت؟» يُجاب (D-158)
      await beat(env.DB, 'dispatch', 'ok', 'لا مستحقّ')
    }
  } catch (error) {
    console.error({
      job: 'dispatch',
      failed: error instanceof Error ? error.message : 'unexpected_error',
    })
    await beat(env.DB, 'dispatch', 'failed', error instanceof Error ? error.message : 'unexpected_error')
  }
}

/**
 * Cron اليومي: يمسح Drive ويوفّقه مع `sources`.
 *
 * لا يحلل ولا ينادي Claude — المسح رخيص، والتحليل يقع على ما تغيّر وحده
 * في خطوة تالية. وفشل المسح يُسجَّل ولا يُرمى: Cron لا يعيد المحاولة،
 * ورمي الخطأ يضيّع السجل بلا فائدة.
 */
async function scanTick(env: Env): Promise<void> {
  try {
    // الإيقاف يوقف المسح أيضا: المسح لا يكلّف مالا، لكن «موقوف مؤقتا»
    // تعني موقوفا — ونظامٌ يواصل عملا وقد أُوقف يُفقِد المفتاح معناه
    const allowance = await checkAllowance(env.DB, 'scan')
    if (allowance.blocker !== null) {
      console.info({ job: 'drive-scan', skipped: blockerReason(allowance.blocker) })
      await beat(env.DB, 'scan', 'skipped', blockerReason(allowance.blocker))
      return
    }
    const report = await scanDrive({
      db: env.DB,
      serviceAccountJson: env.GOOGLE_SA_JSON,
      folderId: env.DRIVE_FOLDER_ID,
    })

    /**
     * الإدراج الآليّ — بمفتاح المالك، وبما بقي من السقف لا بما وجد المسح.
     *
     * **يُقصّ على المتبقّي قبل الإرسال لا بعده.** ولو أُرسل الكلّ لاعتمدنا
     * على حارس المستهلك وحده: يمنع النداء نعم، لكنّ الرسائل تدخل الطابور
     * وتُقرأ وتُقَرّ — فتُستهلك حصّتُه اليوميّة على رسائل لن ينجح منها
     * شيء. والحدّ الذي يُطبَّق بعد الإنفاق ليس حدّا.
     */
    let enqueued = 0
    if (allowance.settings.autoEnqueue && report.toAnalyze.length > 0) {
      const room = Math.max(0, allowance.settings.dailyAnalysisCap - allowance.usage.analyses)
      // ‏مئةً مئة (D-320): الطابورُ يردّ الدفعةَ فوق مئة، والسقفُ يبلغ خمسمئة
      enqueued = await enqueueForAnalysis(env.GENERATE_QUEUE, report.toAnalyze, room)
    }

    console.info({
      job: 'drive-scan',
      seen: report.seen,
      added: report.added.length,
      changed: report.changed.length,
      unchanged: report.unchanged.length,
      missing: report.missing.length,
      to_analyze: report.toAnalyze.length,
      auto_enqueue: allowance.settings.autoEnqueue,
      enqueued,
      // ما تُرك لغدٍ: يُسجَّل ليُعرف أنّ السقف قصّ لا أنّ المسح أخفق
      deferred: report.toAnalyze.length - enqueued,
    })
    await beat(env.DB, 'scan', 'ok', `رأى ${report.seen} · جديد ${report.added.length} · تغيّر ${report.changed.length}`)
    // ‏ووسائطُ المالك من مجلّد «04-media» (D-363) بالدورة نفسِها — بلا نداءٍ مدفوع، وعطلُها لا يُسقط مسحَ المصادر
    const media = await scanDriveMedia({
      db: env.DB, org: OWNER_ORG, serviceAccountJson: env.GOOGLE_SA_JSON, rootFolderId: env.DRIVE_FOLDER_ID, bucket: env.MEDIA,
    })
    console.info({ job: 'drive-media', ok: media.ok, ...(media.ok ? { seen: media.seen, added: media.added, fetched: media.fetched, deferred: media.deferred } : { reason: media.reason }) })
  } catch (error) {
    console.error({
      job: 'drive-scan',
      failed: error instanceof Error ? error.message : 'unexpected_error',
    })
    await beat(env.DB, 'scan', 'failed', error instanceof Error ? error.message : 'unexpected_error')
  }
}

/**
 * Cloudflare يسلّم كلّ الطوابير إلى دالّة واحدة، فيُفرَّق بينها بالاسم.
 * والاسم غير المعروف يُقَرّ لا يُعاد: رسالةٌ لطابور لا نعرفه لن تُفهَم
 * بإعادة المحاولة، وتركها تدور يستهلك حصّة الطابور بلا فائدة.
 */
/**
 * طابورُ الأعطال له مستهلك (D-270).
 *
 * كانت الرسالةُ التي استنفدت محاولاتها تسقط في `sada-publish-dlq` **ولا أحدَ يقرؤه**:
 * المنشورُ يبقى «في الطابور» بلا جواب، والتنبيهُ لا يرى إلّا `failed`. فهنا يُعلَّم `failed`
 * بأثرٍ يقول «فرغ منه الطابور»، ويُقَرّ. **ولا يُعاد النشرُ من هنا**: الإعادةُ قرارُ المالك.
 */
async function publishDeadLetters(batch: MessageBatch<PublishMessage>, env: Env): Promise<void> {
  for (const message of batch.messages) {
    const postId = message.body.postId
    try {
      const row = await env.DB
        .prepare(`UPDATE posts SET status = 'failed' WHERE id = ? AND status = 'queued' RETURNING org_id, idempotency_key`)
        .bind(postId)
        .first<{ org_id: string; idempotency_key: string }>()
      if (row !== null) {
        const no = await env.DB
          .prepare('SELECT coalesce(max(attempt_no), 0) AS n FROM publish_attempts WHERE post_id = ? AND org_id = ?')
          .bind(postId, row.org_id)
          .first<{ n: number }>()
        await env.DB
          .prepare(
            `INSERT INTO publish_attempts (id, post_id, idempotency_key, attempt_no, request_json, response_json, status, org_id, queue_attempt)
             VALUES (?, ?, ?, ?, ?, ?, 'failed', ?, ?)`,
          )
          .bind(
            crypto.randomUUID(), postId, row.idempotency_key, (no?.n ?? 0) + 1,
            JSON.stringify({ dead_letter: true, queue_attempts: message.attempts }),
            JSON.stringify({ error: 'dead_letter: استنفد الطابورُ محاولاتَه ولم يُنشَر', dead_letter: true }),
            row.org_id,
            message.attempts,
          )
          .run()
      }
      console.error({ job: 'publish-dlq', post: postId, marked: row !== null })
    } catch (error) {
      console.error({ job: 'publish-dlq', post: postId, failed: String(error) })
    }
    message.ack()
  }
}

async function queue(
  batch: MessageBatch<PublishMessage | AnalyzeMessage | PlanDraftMessage>,
  env: Env,
): Promise<void> {
  // ‏حلقةُ المفاتيح قبل أيّ فكّ (D-318)
  registerKeyring(env)
  // ‏طوابيرُ الأعطال أوّلا: اسمُها يبدأ باسم أصلها فلا تُترك لمستهلكه
  if (batch.queue.startsWith('sada-publish-dlq')) {
    return publishDeadLetters(batch as MessageBatch<PublishMessage>, env)
  }
  if (batch.queue.startsWith('sada-generate-dlq')) {
    // ‏التوليدُ يُعاد بزرٍّ أو بالمسح التالي، فيُسجَّل ويُقَرّ
    for (const message of batch.messages) {
      console.error({ job: 'generate-dlq', body: message.body, attempts: message.attempts })
      // ‏وبندُ خطّةٍ سقط هنا يُقال في المراجعة (PL-23)، لا يبقى «يُكتب الآن»
      const body = message.body as Partial<PlanDraftMessage>
      if (body.draft?.planId !== undefined) {
        const d = body.draft
        await recordDraftFailure(env.DB, d.org, d.planId!, draftRef(d.itemId, d.sourceId, d.platform), 'تعذّرت الكتابة بعد ثلاث محاولات')
      }
      message.ack()
    }
    return
  }
  if (batch.queue.startsWith('sada-generate')) {
    return analyzeQueue(batch as MessageBatch<AnalyzeMessage | PlanDraftMessage>, env)
  }
  if (batch.queue.startsWith('sada-publish')) {
    return publishQueue(batch as MessageBatch<PublishMessage>, env)
  }
  console.error({ job: 'queue', unknown: batch.queue, messages: batch.messages.length })
  for (const message of batch.messages) message.ack()
}

/**
 * دورةُ القياس (D-048).
 *
 * ولا تُسقط دورةَ الإرسال إن سقطت: القياسُ معرفةٌ، والنشرُ التزامٌ
 * بموعد. فتُغلَّف بـ try، ويُسجَّل عطلُها ولا يُرمى.
 */
/**
 * ‏دورةُ حزمةٍ واحدة (D-366) — رسالةُ الطابور تُكمل نفسَها برسالةٍ تالية ما بقي نقلٌ مؤجَّل، **بسقف ثلاثين رسالة** للدفعة الواحدة.
 */
async function packageTick(env: Env, job: PackageSyncMessage['packageSync'] & { readonly hop?: number }): Promise<void> {
  const source = await sourceById(env.DB, job.sourceId)
  if (source === null) return
  const token = await tokenFor(source, env.TOKEN_ENC_KEY, env.GITHUB_CONTENT_TOKEN)
  if (token === null) return
  const out = await syncPackage({ db: env.DB, bucket: env.MEDIA, token }, source, {
    ...(job.after === undefined ? {} : { after: job.after }), ...(job.force === true ? { force: true } : {}),
  })
  console.info({ job: 'package-sync', kind: out.kind, ...(out.kind === 'synced' ? { stored: out.stored, deferred: out.deferred } : {}) })
  const hop = job.hop ?? 0
  if (out.kind === 'synced' && out.deferred > 0 && hop < 30) {
    await env.GENERATE_QUEUE.send({ packageSync: { sourceId: source.id, force: true, hop: hop + 1 } })
  }
  // ‏اكتمل النقلُ (أو بلغ السقف): الدفعةُ مراجعةٌ برقمها (D-370) — والتكرارُ ينتهي إلى صفٍّ واحد بمفتاح الالتزام
  // ‏ولا جديد في الفرع: مراجعةُ آخر التزامٍ تُعاد إن تعثّرت بعطلٍ عابر — وإلّا فهي «موجودة» بقراءةٍ واحدة من D1
  const commit = out.kind === 'synced' && (out.deferred === 0 || hop >= 30) ? out.commit : out.kind === 'unchanged' ? source.lastCommit : null
  if (commit !== null) {
    const fresh = (await sourceById(env.DB, source.id)) ?? source
    const rev = await revisePackage({ db: env.DB, token }, fresh, commit)
    console.info({ job: 'package-revision', kind: rev.kind, ...(rev.kind === 'applied' ? { changes: rev.changes, awaiting: rev.awaiting } : {}) })
  }
}

/** ‏الفحصُ الاحتياطيّ الساعيّ (D-366): ETag على الفرع، و304 لا يكتب شيئًا — فلا يفوت دفعٌ ضاع إشعارُه. */
/** جدولُ الطابور ربعُ الساعيّ — ومنه كتابةُ ملفّ حال الخطّة (D-390). */
const QUARTER_CRON = '*/15 * * * *'

/**
 * ملفُّ حال الخطّة في المستودع (D-390) — **بعد النشر لا قبله، ولا يرمي**: عطلُ GitHub يُسجَّل في `repo_status_sync` ولا يمسّ
 * طابورًا ولا منشورًا. والكتابةُ مجمَّعة: الحالُ الذي لم يتغيّر لا يُكتب، وما تغيّر يُكتب مرّةً كلّ `MIN_GAP_MINUTES` على الأكثر.
 */
async function repoStatusTick(env: Env): Promise<void> {
  try {
    const source = await readSource(env.DB, OWNER_ORG)
    if (source === null) return
    const token = await tokenFor(source, env.TOKEN_ENC_KEY, env.GITHUB_CONTENT_TOKEN)
    if (token === null) return
    const out = await flushRepoStatus({
      db: env.DB, org: source.org, root: source.root, now: new Date(),
      repo: { owner: source.owner, repo: source.repo, branch: source.branch, token },
    })
    if (out.written.length + out.failed.length > 0) console.log({ job: 'repo-status', written: out.written, failed: out.failed, waiting: out.waiting })
  } catch (error) {
    console.warn({ job: 'repo-status', failed: error instanceof Error ? error.message : 'unexpected_error' })
  }
}

async function packageHourly(env: Env): Promise<void> {
  const source = await readSource(env.DB, OWNER_ORG)
  if (source === null) return
  await packageTick(env, { sourceId: source.id }).catch((error: unknown) => console.warn({ job: 'package-sync', failed: String(error) }))
}

async function metricsTick(env: Env): Promise<void> {
  try {
    const summary = await pullDue({ db: env.DB, encKey: env.TOKEN_ENC_KEY })
    if (summary.due > 0) console.log({ job: 'metrics', ...summary })
    await beat(env.DB, 'metrics', 'ok', summary.due > 0 ? `${summary.due} مستحقّ` : 'لا مستحقّ')
  } catch (error) {
    console.log({ job: 'metrics', failed: String(error) })
    await beat(env.DB, 'metrics', 'failed', String(error))
  }
}

/**
 * دورةُ التقرير — **أسبوعيّة، وتكتب مرّةً لا تُعيد الحساب.**
 *
 * وعطلُها لا يُرمى كسابقتها: دورةٌ تسقط لا تُفسد نشرا، ومفتاحُ الأسبوع
 * يجعل الدورةَ التالية تكتب ما فات إن كان في مدّته — وإلّا بقي أسبوعٌ
 * بلا تقرير، **وغيابُه يُرى في القائمة** (D-058).
 */
async function reportTick(env: Env): Promise<void> {
  try {
    // ‏لكلّ منظّمةٍ تقريرُها (D-234)
    const all = await runWeeklyAll(env.DB, new Date())
    const written = all.filter((out) => out.written)
    for (const out of written) {
      console.log({
        job: 'report', week: out.id,
        published: out.report.published, measured: out.report.measured,
        promotion: out.promotion.kind,
      })
    }
    await beat(env.DB, 'report', 'ok', written.length > 0 ? `كُتب ${written.map((o) => o.id).join('، ')}` : 'لا جديد')
  } catch (error) {
    console.log({ job: 'report', failed: String(error) })
    await beat(env.DB, 'report', 'failed', String(error))
  }
}

/**
 * دورةُ تنبيه الرموز — **تُلحَق بالمسح اليوميّ لا بجدولٍ ثالث.**
 *
 * فالسؤالُ يوميٌّ بطبعه («أبقي أقلُّ من سبعةِ أيّام؟»)، وجدولٌ رابعٌ
 * يزيد ما يُنسى مقابلتُه بـ`wrangler.toml` (D-058).
 *
 * وعطلُها لا يُرمى: **التنبيهُ يُعرَض في اللوحة من الحساب المباشر لا
 * من الصفّ** — فسقوطُ الكتابة يُفقد الأثرَ ولا يُفقد التنبيه.
 */
async function alertTick(env: Env, scope: 'daily' | 'hourly' = 'daily'): Promise<void> {
  // ‏الساعيُّ (D-270) يُخرج ما سُجّل ولا يعيد حسابَ الأذونات: ذاك يوميُّ الأثر
  if (scope === 'daily') await tokenAlertTick(env)
  await outboxTick(env)
}

async function tokenAlertTick(env: Env): Promise<void> {
  try {
    const items = await expiringTokens(env.DB, new Date())
    if (items.length === 0) {
      await beat(env.DB, 'alerts', 'ok', 'لا إذن يقترب')
      return
    }
    const out = await recordAlerts(env.DB, items)
    if (out.written > 0) console.log({ job: 'token-alerts', ...out })
    await beat(env.DB, 'alerts', 'ok', `${items.length} يقترب`)
  } catch (error) {
    console.log({ job: 'token-alerts', failed: String(error) })
    await beat(env.DB, 'alerts', 'failed', String(error))
  }

  /*
   * **والخروجُ بعد التسجيل لا معه** (D-109).
   *
   * `recordAlerts` تكتب الحدثَ، وهذه تخرج به. **وفصلُهما مقصود**: تسجيلٌ
   * ينجح وقناةٌ تسقط لا يُضيّع الحدثَ — الدورةُ التالية تجده مسجَّلا
   * وغيرَ مُرسَل فتعيد النداءَ وحدَه.
   *
   * **ويقع كلَّ ساعةٍ أيضا** (D-270): نشرٌ فشل التاسعةَ صباحا كان يُقال
   * الثالثةَ فجرا. والقيدُ على `ref` يمنع التكرار، **فساعيٌّ لا يُغرِق**.
   */
}

async function outboxTick(env: Env): Promise<void> {
  try {
    const settings = await readSettings(env.DB)
    if (settings.alertWebhook === '') return
    // ‏‏`alertWebhook` قناعٌ لا عنوان (D-318): العنوانُ كاملًا يُفكّ هنا بالمفتاح، والقديمُ المقروءُ يُشفَّر في مكانه
    const hook = await readWebhookUrl(env.DB, env.TOKEN_ENC_KEY)
    if (hook === '') return
    const alerts = await collectAlerts(env.DB, new Date(), settings.dailySpendCapUsd)
    if (alerts.length === 0) return
    const sent = await sendAlerts(env.DB, hook, alerts)
    // ‏والعدّاداتُ وحدَها في السجلّ: «why» تحمل مضيفَ القناة، وهو من
    // ‏اعتمادها. **ولا سرَّ في سجلّ** (CLAUDE.md · D-110)
    console.log({ job: 'alert-outbox', sent: sent.sent, skipped: sent.skipped, failed: sent.failed })
  } catch (error) {
    console.log({
      job: 'alert-outbox',
      failed: String(error).replace(/https?:\/\/\S+/gi, '«عنوان مُزال»'),
    })
  }
}

/** جدولُ المسح — يُعرَّف هنا وفي `wrangler.toml`، ويُقارَن نصّا. */
const SCAN_CRON = '3 3 * * *'

/**
 * جدولُ القياس — ساعيٌّ عند الدقيقة السابعة.
 *
 * ولم يوضع في كلّ دورةٍ كالإرسال، **والفرقُ في ثمن الإخفاق**: دورةٌ
 * تُنسى تعني أرقاما تشيخ، **وشيخوختُها تُرى** — كلُّ رقمٍ في الشاشة
 * يحمل «قِيس منذ…». أمّا إرسالٌ يُنسى فمنشورٌ وُعد بموعده ولا يخرج،
 * ولا شيء يشتكي.
 *
 * والسابعةُ لا الصفر: عند الصفر تلتقي الجداولُ كلُّها فتزدحم، وإزاحةُ
 * دقائقَ تفرّقها بلا أثرٍ على المعنى.
 */
const METRICS_CRON = '7 * * * *'

/**
 * جدولُ التقرير — **الاثنينُ فجرا، بعد أن تكون نوافذُ الأسبوع قد قِيست.**
 *
 * والاثنينُ لأنّ الأسبوع يُغلَق عليه (`weekBounds`)، والرابعةَ عشرةَ
 * دقيقةً بعد الرابعة لا عند الصفر: **عند الصفر تلتقي الجداولُ فتزدحم**،
 * وإزاحةٌ تفرّقها بلا أثرٍ على المعنى — كما فُعل بجدول القياس.
 *
 * وبعد الثالثة فجرا عمدا: المسحُ اليوميّ يسبقه، ودورةُ القياس السابقة
 * تكون قد ختمت نوافذَ آخرِ يومٍ في الأسبوع.
 */
const REPORT_CRON = '14 4 * * 1' 

/**
 * موزّعُ الدورات — **والإرسالُ يقع في كلّ دورة، لا في دورةٍ نعرفها.**
 *
 * Cloudflare يسلّم كلّ الجداول إلى دالّة واحدة ويعطي جدولَ الدورة في
 * `controller.cron`. والقسمةُ الساذجة — «هذا الجدول للمسح وذاك للإرسال»
 * — تجعل **تغييرا في `wrangler.toml` نُسي هنا يوقف النشر صامتا**:
 * منشوراتٌ اعتمدها المالك ووُعد بمواعيدها لا تخرج، ولا شيء يشتكي.
 *
 * فالإرسالُ يقع دائما — استعلامٌ واحدٌ على فهرس، وثمنُه لا يُذكر — والمسحُ
 * وحده هو الذي يحتاج أن يُعرَف جدولُه. وأسوأُ ما يفعله جدولٌ مجهول عندئذٍ
 * تأجيلُ مسحٍ للمالك زرٌّ يشغّله بيده، لا نشرٌ يسقط بلا صوت.
 *
 * وفي الثالثة فجرا يلتقي الجدولان فيدور الإرسال مرّتين — **وذاك لا يضرّ**:
 * `dispatched_at` يجعل الثانية تجد الطابور فارغا (D-037).
 */
/**
 * **ما انتظر الحصّةَ أمسِ يُرسَم اليوم** (D-285): المسحُ يجري 03:03 UTC، بعد تجدّد حصّة Cloudflare (00:00 UTC).
 * وبلا إذنٍ بالدفع: الحارسُ نفسُه يقف حين تنفد ثانيةً، والباقي ينتظر ويُسأل عنه المالك.
 */
async function quotaTick(env: Env): Promise<void> {
  const { results } = await env.DB
    .prepare("SELECT DISTINCT org_id FROM audit_log WHERE action = 'image.quota_wait' AND at >= date('now', '-1 day')")
    .all<{ org_id: string }>()
    .catch(() => ({ results: [] as { org_id: string }[] }))
  const secrets = env as unknown as Record<string, string | undefined>
  for (const { org_id } of results) {
    const done = await resumeWaiting({ db: env.DB, bucket: env.MEDIA, encKey: env.TOKEN_ENC_KEY, workerSecrets: secrets }, org_id, 'yesterday', false)
      .catch(() => 0)
    console.info({ job: 'image-quota-resume', org: org_id, done })
  }
}

/**
 * **حراسةُ المفاتيح** (D-348) — مع مسح الفجر: كلُّ مزوّدٍ مفعَّلٍ له مفتاح يُختبر بنداءٍ لا يكلّف رموزًا، ويُكتب صفُّه.
 * ومن آخر صفٍّ فاشلٍ يُشتقّ الإشعار والتنبيه، فيعرف المالكُ قبل أن تفشل به مهمّة.
 */
async function providersTick(env: Env): Promise<void> {
  try {
    const checks = await dailyChecks(env.DB, (p) => providerKey(env, p))
    console.info({ job: 'provider-checks', tested: checks.length, failed: checks.filter((c) => !c.ok).map((c) => c.provider) })
  } catch (error) {
    console.warn({ job: 'provider-checks', failed: String(error) })
  }
}

/**
 * ‏**النسخةُ الاحتياطيّة** (D-321) — تُسأل في الدورة اليوميّة وتُؤخذ كلَّ سبعة أيّام (`snapshotDue`)، أو في الفجر التالي لتدوير
 * ‏المفتاح، فما يسقط اليومَ يُعاد غدًا لا بعد أسبوع، ولا جدولَ خامسٌ في `wrangler.toml`. وبلا دلوٍ خاصّ (`BACKUP`، M-51) تنبض
 * ‏`skipped` بسببها ولا تكتب في غيره.
 */
async function backupTick(env: Env): Promise<void> {
  if (env.BACKUP === undefined) {
    // ‏والسببُ بلا رمز مهمّة: يُرى في «هل الآلة تعمل؟»، والمهمّةُ بعنوانها في «ما عليك» (`audit_copy`)
    await beat(env.DB, 'backup', 'skipped', 'لا دلو خاصّ مربوط بعد — بابُه في «ما عليك»')
    return
  }
  const now = new Date()
  try {
    // ‏ومفتاحٌ دُوّر بعد آخر نسخة (M-40) يُستحقّ به نسخةٌ في هذا الفجر: ما قبله لا يفكّه الجديد (مراجعة D-321)
    if (!(await snapshotDue(env.DB, now, await snapshotKid(env.TOKEN_ENC_KEY)))) return
    const out = await takeSnapshot({ db: env.DB, bucket: env.BACKUP, encKey: env.TOKEN_ENC_KEY, env: env.SADA_ENV, now })
    if (out.ok) {
      console.info({ job: 'backup', tables: out.tables, rows: out.rows, bytes: out.bytes, ms: out.ms, pruned: out.pruned })
      await beat(env.DB, 'backup', 'ok', `${out.tables} جدولًا · ${out.rows} صفًّا · ${Math.ceil(out.bytes / 1024)}KB`)
    } else {
      console.error({ job: 'backup', failed: out.detail })
      await beat(env.DB, 'backup', 'failed', out.detail)
    }
  } catch (error) {
    console.error({ job: 'backup', failed: error instanceof Error ? error.message : 'unexpected_error' })
    await beat(env.DB, 'backup', 'failed', error instanceof Error ? error.message : 'unexpected_error')
  }
}

/**
 * **دورةُ التدوير** (D-318) — في كلّ دورةٍ ما دام `TOKEN_ENC_KEY_PREV` مضبوطًا، وإلّا لا تعمل أصلًا. دفعةٌ في كلّ جدول،
 * والتالية تُكمل؛ وما بقي يُقرأ في `/admin/ready` (`keys.pending`).
 */
async function rotateTick(env: Env): Promise<void> {
  if (previousKey(env.TOKEN_ENC_KEY) === null) return
  try {
    const report = await rotateKeys(env.DB, env.TOKEN_ENC_KEY)
    console.info({
      job: 'key-rotation', kid: report.kid, previous: report.previous, rotated: report.rotated, failed: report.failed,
      pending: report.pending, legacy: report.legacy, recovery: report.recovery,
    })
  } catch (error) {
    console.error({ job: 'key-rotation', failed: String(error) })
  }
}

/**
 * **الكنسُ اليوميّ** (D-322) — مع المسح في جدوله (`3 3 * * *`) لا في جدولٍ خامس: ما فات مدّتَه من سجلّ النشاط والصندوق وتنبيهات
 * الأذونات وعدّادات الدخول يُمحى، وعنوانُ IP يُقصَّر، وبايتاتُ ما حُذف من اللوحة تُمحى من R2 بعد مهلة «تراجَع».
 *
 * **وعطلُه لا يُوقف ما بعده**: يُقال في السجلّ ويُعاد غدًا. وأثرُه سطرٌ في سجلّ نشاط المالك بأعداده — بلا نصٍّ ولا عنوان.
 */
/**
 * ‏**تقريرُ الشهر إلى البريد** (D-412): لمن فُتح له الخيار، في المسح اليوميّ — والشهرُ لا يُرسَل مرّتين، وما تعثّر يُعاد غدًا.
 */
async function reportMailTick(env: Env): Promise<void> {
  try {
    const zone = await ownerZone(env.DB, null).catch(() => null)
    const out = await mailMonthlyReports(env.DB, env.EMAIL, new Date(), zone)
    if (out.length > 0) console.info({ job: 'report-mail', sent: out.filter((o) => o.sent).length, unsent: out.filter((o) => !o.sent).map((o) => o.org) })
  } catch (error) {
    console.error({ job: 'report-mail', failed: error instanceof Error ? error.message : 'unexpected_error' })
  }
}

async function retentionTick(env: Env): Promise<void> {
  // ‏الكنسُ والمحوُ مستقلّان: R2 أو KV لا يردّ لا يُبقي سجلَّ النشاط بلا كنس، ولا العكس
  const swept = await sweepRetention(env.DB)
    .catch((error: unknown) => { console.error({ job: 'retention', failed: String(error) }); return null })
  const purged = await purgeDeleted({ db: env.DB, kv: env.KV, bucket: env.MEDIA })
    .catch((error: unknown) => { console.error({ job: 'retention-purge', failed: String(error) }); return null })
  console.info({ job: 'retention', ...(swept ?? {}), ...(purged ?? {}) })
  const detail = [
    swept === null ? 'الكنس تعذّر' : [
      `نشاط ${swept.audit + swept.formRejects}`, `IP ${swept.ips}`, `صندوق ${swept.outbox}`, `أذونات ${swept.tokenAlerts}`, `دخول ${swept.authAttempts}`,
    ].join(' · '),
    purged === null ? 'المحو تعذّر' : `ملفّات ${purged.objects}`,
  ].join(' · ')
  await record(env.DB, { actor: 'cron', action: 'retention.sweep', detail, org: OWNER_ORG })
}

async function scheduled(controller: ScheduledController, env: Env): Promise<void> {
  // ‏حلقةُ المفاتيح قبل أيّ فكّ (D-318)
  registerKeyring(env)
  await rotateTick(env)
  // **والتجديدُ قبل الطابور** — منشورٌ ينتظر رمزا انتهى يُجدَّد رمزُه
  // في هذه الدورة نفسِها، فلا يفشل فشلا نهائيّا لأجل دقائق (D-066)
  await renewTick(env)
  await dispatchTick(env)
  await uploadsTick(env)
  if (controller.cron === QUARTER_CRON) await repoStatusTick(env)
  if (controller.cron === SCAN_CRON) {
    await scanTick(env)
    // ‏قبل التنبيهات: فمفتاحٌ سقط الليلةَ يصل تنبيهُه في الدورة نفسِها
    await providersTick(env)
    await alertTick(env)
    await quotaTick(env)
    await retentionTick(env)
    await reportMailTick(env)
    // ‏آخرًا (D-321): النسخةُ تقرأ ما كتبه المسحُ، ولا تؤخّر ما يُنتظر
    await backupTick(env)
    await prunePulseSlots(env.DB, new Date()).catch((error: unknown) => {
      console.error({ job: 'pulse-prune', failed: error instanceof Error ? error.message : 'unexpected_error' })
    })
  }
  if (controller.cron === METRICS_CRON) {
    await metricsTick(env)
    await alertTick(env, 'hourly')
    await packageHourly(env)
  }
  if (controller.cron === REPORT_CRON) await reportTick(env)
}

export default { fetch: app.fetch, queue, scheduled }

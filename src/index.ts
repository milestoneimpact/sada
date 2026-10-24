/**
 * sada-api — نقطة الدخول.
 *
 * المرحلة صفر: الصحة والجاهزية، وربط الحسابات عبر OAuth.
 * لوحة الاعتماد والنشر المجدول في المرحلة الأولى.
 */
import { Hono } from 'hono'
import type { MessageBatch, ScheduledController } from '@cloudflare/workers-types'
import { authorizeAdmin } from './lib/adminAuth'
import { BASE_HEADERS } from './lib/security/headers'
import { afterVault, readiness, type Env } from './env'
import { analyzeSource } from './lib/analyze/job'
import { isConfigured, PROVIDERS, routeStatuses, type ProviderName } from './lib/ai/registry'
import { resolveKey } from './lib/providers'
import { spendByProvider } from './lib/ai/spend'
import { blockerReason, checkAllowance } from './lib/limits'
import { scanDrive } from './lib/drive/job'
import { publishPost, type PublishMessage } from './lib/publish/publisher'
import { dispatchDue, sweepStuck } from './lib/schedule/job'
import { expireStaleUploads } from './lib/media/uploads'
import { pullDue } from './lib/metrics/job'
import { runWeeklyAll } from './lib/report/job'
import { collectAlerts } from './lib/alerts/collect'
import { readSettings } from './lib/settings'
import { sendAlerts } from './lib/alerts/outbox'
import { expiringTokens, recordAlerts } from './lib/token/expiry'
import { renewDue } from './lib/token/renew'
import { PROVIDERS as OAUTH_PROVIDERS } from './lib/oauth/providers'
import { readApp, SECRET_NAMES } from './lib/oauth/apps'
import { ICON_BYTES } from './routes/ui/shell'
import { assets } from './routes/assets'
import { fonts } from './routes/fonts'
import { legal } from './routes/legal'
import { landing } from './routes/landing'
import { verify } from './routes/verify'
import { media } from './routes/media'
import { oauth } from './routes/oauth'
import { panel } from './routes/panel'
import { beat } from './lib/ops/heartbeat'
import { auth } from './routes/auth'
import { notFoundResponse, serverErrorResponse } from './routes/errors'
import { draftPost } from './lib/draft/job'
import { generateForPost } from './lib/image/job'
import { attachStatement } from './lib/library'
import { autoImageRoom } from './lib/image/auto'

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

app.get('/health', (c) =>
  c.json({ ok: true, service: 'sada-api', env: c.env.SADA_ENV }),
)

/**
 * جاهزية التشغيل: يقول ما الناقص بالاسم، ولا يكشف قيمة سر.
 * يرد 503 ما دام شيء ناقصا، حتى لا يبدو النظام جاهزا وهو ليس كذلك.
 *
 * **ومفتاحٌ في الخزانة ليس مفتاحا ناقصا.** كان `/ready` يقرأ أسرار
 * Worker وحدها، فيقول «ANTHROPIC_API_KEY ناقص» واللوحةُ تقول «حُفظ» —
 * وكلاهما صادقٌ في مصدره، والمالكُ يرى تناقضا فيشكّ في أيّهما يصدّق.
 * فصار الناقصُ يُفرز: ما لا وجود له، وما وُجد في الخزانة. والجاهزيّةُ
 * لا تُحجب على الثاني.
 */
app.get('/ready', async (c) => {
  const state = readiness(c.env)
  let database: 'ok' | 'unreachable' = 'unreachable'
  try {
    await c.env.DB.prepare('SELECT 1').first()
    database = 'ok'
  } catch {
    database = 'unreachable'
  }
  // ما سُدّ من الخزانة يُذكر على حدة — لا في «ناقص» ولا مسكوتا عنه
  let inVault: string[] = []
  if (database === 'ok' && state.missing.length > 0) {
    inVault = await vaultCovered(c.env, state.missing)
  }
  // **والحكمُ يُعاد بعد أن يُعرَف ما سُدّ** (D-095): كان يُحسَب من بيئة
  // Worker وحدَها، فيخرج جوابٌ يقول «لا شيءَ ناقص» و«غيرُ جاهز» معا
  const sealed = afterVault(state, inVault)

  // البوابة هي المرحلة صفر: نظام ينشر ولا يفهم ليس معطلا
  const ready = sealed.phase0 && database === 'ok'
  return c.json(
    {
      ready,
      database,
      phase_0: sealed.phase0,
      phase_1: sealed.phase1,
      drive_folder: sealed.driveFolder,
      missing_secrets: sealed.missing,
      configured_in_vault: inVault,
    },
    ready ? 200 : 503,
  )
})

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
 * حارس `/admin/*` في موضعٍ واحد.
 *
 * تكرارُه في كلّ مسار يعني أنّ مسارا جديدا قد يُكتب بلا حارس ولا يلحظه
 * أحد — وهي الثغرة نفسها التي كشفها D-019، فلا تُترك لتتكرّر بالنسخ.
 */
async function guardAdmin(c: {
  env: Env
  req: { raw: Request }
}): Promise<Response | null> {
  const verdict = await authorizeAdmin(c.env.ADMIN_TOKEN, c.req.raw)
  if (verdict.kind === 'ok') return null
  if (verdict.kind === 'disabled') {
    return Response.json({ error: 'admin_disabled', detail: 'ADMIN_TOKEN غير مضبوط' }, { status: 503 })
  }
  if (verdict.kind === 'no_header') {
    return Response.json(
      { error: 'no_authorization_header', detail: 'الترويسة المتوقّعة: Authorization: Bearer <token>' },
      { status: 401 },
    )
  }
  return Response.json(
    {
      error: 'unauthorized',
      presented_length: verdict.presentedLength,
      hint: 'طول ما أرسلتَه أعلاه. رمز openssl rand -hex 32 طوله 64، و base64 طوله 44.',
    },
    { status: 401 },
  )
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
  const denied = await guardAdmin(c)
  if (denied !== null) return denied

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
  const denied = await guardAdmin(c)
  if (denied !== null) return denied

  const { results } = await c.env.DB.prepare(
    `SELECT s.id, s.drive_file_id, s.name, s.mime, s.content_hash, s.last_seen_at,
            i.worth_score, i.summary, i.themes_json
       FROM sources s
       LEFT JOIN content_items i ON i.source_id = s.id
      ORDER BY s.last_seen_at DESC`,
  ).all<{
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
  // الحارس قبل أيّ عمل: لا نداء Google ولا كتابة في D1 لطلبٍ غير مأذون
  const denied = await guardAdmin(c)
  if (denied !== null) return denied
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
  const denied = await guardAdmin(c)
  if (denied !== null) return denied
  const outcome = await analyzeSource(
    {
      db: c.env.DB,
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
app.route('/', assets)
app.route('/', fonts)
// الوثيقتان العامّتان قبل كلّ حارس: تُقرآن من الخارج بلا جلسة
app.route('/', legal)
app.route('/', landing)
app.route('/', verify)
app.route('/', media)
app.route('/', oauth)
// قبل اللوحة: مسارات العامل الثاني أخصّ، ولها حارسُها الذي يقبل المعلَّقة
app.route('/', auth)
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
  readonly draft: { readonly sourceId: string; readonly platform: 'linkedin' | 'x'; readonly org: string; readonly asset?: string; readonly planId?: string }
}

/**
 * مستهلك طابور الفهم.
 *
 * `retry` لما قد ينجح وحده (429 · 5xx · انقطاع)، و `ack` لما لا يصلحه
 * التكرار: نوعٌ غير مدعوم، أو رفضُ سياسة، أو مصدرٌ لا وجود له. وتركُ
 * الثاني في الطابور يعني نداءً مدفوعا يتكرّر بلا أمل.
 */
async function planDraft(message: MessageBatch<PlanDraftMessage>['messages'][number], env: Env): Promise<void> {
  const { sourceId, platform, org } = message.body.draft
  const secrets = env as unknown as Record<string, string | undefined>
  const outcome = await draftPost({ db: env.DB, encKey: env.TOKEN_ENC_KEY, workerSecrets: secrets, org }, sourceId, platform)
  console.info({ job: 'plan-draft', source: sourceId, platform, kind: outcome.kind })
  // ‏ما يصلحه الوقتُ يُعاد، وما مُنع بسقفٍ أو كُتب من قبل يُقَرّ (كالنشر)
  if (outcome.kind === 'failed' && outcome.retryable) return retryLater(message, outcome.kind)
  message.ack()
  // ‏والمسوّدةُ تعرف خطّتها (D-261): منها يُقرأ يومُ البند حين تُجدوَل الخطّة
  const planId = message.body.draft.planId
  if (outcome.kind === 'drafted' && planId !== undefined) {
    await env.DB.prepare('UPDATE posts SET plan_id = ? WHERE id = ? AND org_id = ? AND plan_id IS NULL')
      .bind(planId, outcome.postId, org).run()
      .catch((error: unknown) => console.warn({ job: 'plan-draft-link', post: outcome.postId, failed: String(error) }))
  }
  // ‏ما اختير من المكتبة (D-260) يُربط بالمسوّدة بلا كلفة، ولا تُرسم لها صورةٌ آليّة فوقه
  const asset = message.body.draft.asset
  if (outcome.kind === 'drafted' && asset !== undefined) {
    const linked = attachStatement(env.DB, org, outcome.postId, asset)
    if (linked !== null) await linked.run().catch((error: unknown) => console.warn({ job: 'plan-draft-asset', post: outcome.postId, failed: String(error) }))
    return
  }
  if (outcome.kind === 'drafted' && (await autoImageRoom(env.DB, org)) > 0) {
    await generateForPost({ db: env.DB, bucket: env.MEDIA, encKey: env.TOKEN_ENC_KEY, workerSecrets: secrets }, outcome.postId, { style: 'infographic' })
      .catch((error: unknown) => console.warn({ job: 'plan-draft-image', post: outcome.postId, failed: String(error) }))
  }
}

async function analyzeQueue(batch: MessageBatch<AnalyzeMessage | PlanDraftMessage>, env: Env): Promise<void> {
  for (const message of batch.messages) {
    if ('draft' in message.body) {
      await planDraft(message as MessageBatch<PlanDraftMessage>['messages'][number], env)
      continue
    }
    const outcome = await analyzeSource(
      {
        db: env.DB,
        serviceAccountJson: env.GOOGLE_SA_JSON,
        anthropicKey: env.ANTHROPIC_API_KEY,
        encKey: env.TOKEN_ENC_KEY,
        geminiKey: env.GEMINI_API_KEY,
      },
      (message.body as AnalyzeMessage).sourceId,
    )
    console.info({ job: 'analyze', ...outcome })
    if (outcome.kind === 'failed' && outcome.retryable) {
      retryLater(message, outcome.kind)
    } else {
      message.ack()
    }
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

async function publishQueue(batch: MessageBatch<PublishMessage>, env: Env): Promise<void> {
  let failed = 0
  for (const message of batch.messages) {
    const outcome = await publishPost(
      // والدلوُ يُمرَّر دائما: منشورٌ بصورةٍ لا يُنشر نصّا وحده، ومنشورٌ
      // بلا صورةٍ لا يمسّه (D-040)
      // ‏**وأصلُ الموقع يُمرَّر** (D-182): Instagram تسحب الوسيطَ من رابطٍ موقَّعٍ عندنا
      // (D-121)، وبلا أصلٍ كان كلُّ منشورٍ لها يسقط في الطابور بلا نداءٍ واحد إلى Meta
      // ‏ورقمُ المحاولة من الطابور يُكتب في الصفّ (D-270): بلا هذا لا يُعرَف من اللوحة أيُّ إعادةٍ هذه
      { db: env.DB, encKey: env.TOKEN_ENC_KEY, bucket: env.MEDIA, baseUrl: env.PUBLIC_BASE_URL, queueAttempt: message.attempts },
      message.body,
    )
    // `blocked` تُقَرّ لا تُعاد: إعادةُ ما مُنع بسقفٍ تدور حتّى ينتهي
    // اليوم وتستنزف حصّة الطابور بلا نداءٍ واحد ينجح
    if (outcome.kind === 'failed' && outcome.retryable) {
      retryLater(message, outcome.reason)
    } else {
      message.ack()
    }
    if (outcome.kind === 'failed') failed += 1
  }
  // نبضُ الطابور (D-158): الدفعةُ وقعت، وكم منها سقط
  await beat(
    env.DB, 'publish', failed === batch.messages.length ? 'failed' : 'ok',
    failed === 0 ? `${batch.messages.length} رسالة` : `${failed} من ${batch.messages.length} سقط`,
  )
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
 * **فسقوطُ التجديد يؤخّر ولا يُفسد.**
 */
async function renewTick(env: Env): Promise<void> {
  try {
    const summary = await renewDue({
      db: env.DB,
      encKey: env.TOKEN_ENC_KEY,
      providerFor: (platform) => OAUTH_PROVIDERS[platform],
      credentialsFor: async (platform) =>
        readApp(
          env.DB,
          env.TOKEN_ENC_KEY,
          platform,
          env as unknown as Record<string, string | undefined>,
        ),
    })
    if (summary.due > 0) console.info({ job: 'renew', ...summary })
    // النبضُ بعد العمل (D-158): صفٌّ يقول إنّ الدورةَ دارت ولو لم تجد شيئا
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
      console.info({ job: 'dispatch', sent: report.count, ids: report.ids })
      await beat(env.DB, 'dispatch', 'ok', `أُرسل ${report.count}`)
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
      const batch = report.toAnalyze.slice(0, room)
      if (batch.length > 0) {
        await env.GENERATE_QUEUE.sendBatch(batch.map((sourceId) => ({ body: { sourceId } })))
        enqueued = batch.length
      }
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
            `INSERT INTO publish_attempts (id, post_id, idempotency_key, attempt_no, request_json, response_json, status, org_id)
             VALUES (?, ?, ?, ?, ?, ?, 'failed', ?)`,
          )
          .bind(
            crypto.randomUUID(), postId, row.idempotency_key, (no?.n ?? 0) + 1,
            JSON.stringify({ dead_letter: true, queue_attempts: message.attempts }),
            JSON.stringify({ error: 'dead_letter: استنفد الطابورُ محاولاتَه ولم يُنشَر', dead_letter: true }),
            row.org_id,
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
  // ‏طوابيرُ الأعطال أوّلا: اسمُها يبدأ باسم أصلها فلا تُترك لمستهلكه
  if (batch.queue.startsWith('sada-publish-dlq')) {
    return publishDeadLetters(batch as MessageBatch<PublishMessage>, env)
  }
  if (batch.queue.startsWith('sada-generate-dlq')) {
    // ‏التوليدُ يُعاد بزرٍّ أو بالمسح التالي، فيُسجَّل ويُقَرّ
    for (const message of batch.messages) {
      console.error({ job: 'generate-dlq', body: message.body, attempts: message.attempts })
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
    const alerts = await collectAlerts(env.DB, new Date(), settings.dailySpendCapUsd)
    if (alerts.length === 0) return
    const sent = await sendAlerts(env.DB, settings.alertWebhook, alerts)
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
async function scheduled(controller: ScheduledController, env: Env): Promise<void> {
  // **والتجديدُ قبل الطابور** — منشورٌ ينتظر رمزا انتهى يُجدَّد رمزُه
  // في هذه الدورة نفسِها، فلا يفشل فشلا نهائيّا لأجل دقائق (D-066)
  await renewTick(env)
  await dispatchTick(env)
  await uploadsTick(env)
  if (controller.cron === SCAN_CRON) {
    await scanTick(env)
    await alertTick(env)
  }
  if (controller.cron === METRICS_CRON) {
    await metricsTick(env)
    await alertTick(env, 'hourly')
  }
  if (controller.cron === REPORT_CRON) await reportTick(env)
}

export default { fetch: app.fetch, queue, scheduled }

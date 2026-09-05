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
import { readiness, type Env } from './env'
import { analyzeSource } from './lib/analyze/job'
import { isConfigured, PROVIDERS, routeStatuses, type ProviderName } from './lib/ai/registry'
import { resolveKey } from './lib/providers'
import { spendByProvider } from './lib/ai/spend'
import { blockerReason, checkAllowance } from './lib/limits'
import { scanDrive } from './lib/drive/job'
import { publishPost, type PublishMessage } from './lib/publish/publisher'
import { oauth } from './routes/oauth'
import { panel } from './routes/panel'
import { auth } from './routes/auth'

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
    c.res.headers.set(name, value)
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
  const stillMissing = state.missing.filter((name) => !inVault.includes(name))

  // البوابة هي المرحلة صفر: نظام ينشر ولا يفهم ليس معطلا
  const ready = state.phase0 && database === 'ok'
  return c.json(
    {
      ready,
      database,
      phase_0: state.phase0,
      phase_1: state.phase1,
      drive_folder: state.driveFolder,
      missing_secrets: stillMissing,
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
    },
    c.req.param('sourceRef'),
  )
  // 423 Locked: مُنع بقرارٍ قائم لا بعطل. و 502 لعطلٍ حقيقيّ.
  if (outcome.kind === 'blocked') return c.json(outcome, 423)
  return c.json(outcome, outcome.kind === 'failed' ? 502 : 200)
})

app.route('/', oauth)
// قبل اللوحة: مسارات العامل الثاني أخصّ، ولها حارسُها الذي يقبل المعلَّقة
app.route('/', auth)
app.route('/', panel)

app.notFound((c) => c.json({ error: 'not_found' }, 404))

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
 * مستهلك طابور الفهم.
 *
 * `retry` لما قد ينجح وحده (429 · 5xx · انقطاع)، و `ack` لما لا يصلحه
 * التكرار: نوعٌ غير مدعوم، أو رفضُ سياسة، أو مصدرٌ لا وجود له. وتركُ
 * الثاني في الطابور يعني نداءً مدفوعا يتكرّر بلا أمل.
 */
async function analyzeQueue(batch: MessageBatch<AnalyzeMessage>, env: Env): Promise<void> {
  for (const message of batch.messages) {
    const outcome = await analyzeSource(
      {
        db: env.DB,
        serviceAccountJson: env.GOOGLE_SA_JSON,
        anthropicKey: env.ANTHROPIC_API_KEY,
        encKey: env.TOKEN_ENC_KEY,
      },
      message.body.sourceId,
    )
    console.info({ job: 'analyze', ...outcome })
    if (outcome.kind === 'failed' && outcome.retryable) {
      message.retry()
    } else {
      message.ack()
    }
  }
}

async function publishQueue(batch: MessageBatch<PublishMessage>, env: Env): Promise<void> {
  for (const message of batch.messages) {
    const outcome = await publishPost(
      { db: env.DB, encKey: env.TOKEN_ENC_KEY },
      message.body,
    )
    // `blocked` تُقَرّ لا تُعاد: إعادةُ ما مُنع بسقفٍ تدور حتّى ينتهي
    // اليوم وتستنزف حصّة الطابور بلا نداءٍ واحد ينجح
    if (outcome.kind === 'failed' && outcome.retryable) {
      message.retry()
    } else {
      message.ack()
    }
  }
}

/**
 * Cron اليومي: يمسح Drive ويوفّقه مع `sources`.
 *
 * لا يحلل ولا ينادي Claude — المسح رخيص، والتحليل يقع على ما تغيّر وحده
 * في خطوة تالية. وفشل المسح يُسجَّل ولا يُرمى: Cron لا يعيد المحاولة،
 * ورمي الخطأ يضيّع السجل بلا فائدة.
 */
async function scheduled(_controller: ScheduledController, env: Env): Promise<void> {
  try {
    // الإيقاف يوقف المسح أيضا: المسح لا يكلّف مالا، لكن «موقوف مؤقتا»
    // تعني موقوفا — ونظامٌ يواصل عملا وقد أُوقف يُفقِد المفتاح معناه
    const allowance = await checkAllowance(env.DB)
    if (allowance.blocker !== null) {
      console.info({ job: 'drive-scan', skipped: blockerReason(allowance.blocker) })
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
  } catch (error) {
    console.error({
      job: 'drive-scan',
      failed: error instanceof Error ? error.message : 'unexpected_error',
    })
  }
}

/**
 * Cloudflare يسلّم كلّ الطوابير إلى دالّة واحدة، فيُفرَّق بينها بالاسم.
 * والاسم غير المعروف يُقَرّ لا يُعاد: رسالةٌ لطابور لا نعرفه لن تُفهَم
 * بإعادة المحاولة، وتركها تدور يستهلك حصّة الطابور بلا فائدة.
 */
async function queue(
  batch: MessageBatch<PublishMessage | AnalyzeMessage>,
  env: Env,
): Promise<void> {
  if (batch.queue.startsWith('sada-generate')) {
    return analyzeQueue(batch as MessageBatch<AnalyzeMessage>, env)
  }
  if (batch.queue.startsWith('sada-publish')) {
    return publishQueue(batch as MessageBatch<PublishMessage>, env)
  }
  console.error({ job: 'queue', unknown: batch.queue, messages: batch.messages.length })
  for (const message of batch.messages) message.ack()
}

export default { fetch: app.fetch, queue, scheduled }

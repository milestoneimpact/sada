/**
 * sada-api — نقطة الدخول.
 *
 * المرحلة صفر: الصحة والجاهزية، وربط الحسابات عبر OAuth.
 * لوحة الاعتماد والنشر المجدول في المرحلة الأولى.
 */
import { Hono } from 'hono'
import type { MessageBatch, ScheduledController } from '@cloudflare/workers-types'
import { authorizeAdmin } from './lib/adminAuth'
import { readiness, type Env } from './env'
import { scanDrive } from './lib/drive/job'
import { publishPost, type PublishMessage } from './lib/publish/publisher'
import { oauth } from './routes/oauth'

/** يُصدَّر للاختبار: `app.request` يشغّل المسارات بلا شبكة ولا Worker. */
export const app = new Hono<{ Bindings: Env }>()

app.get('/health', (c) =>
  c.json({ ok: true, service: 'sada-api', env: c.env.SADA_ENV }),
)

/**
 * جاهزية التشغيل: يقول ما الناقص بالاسم، ولا يكشف قيمة سر.
 * يرد 503 ما دام شيء ناقصا، حتى لا يبدو النظام جاهزا وهو ليس كذلك.
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
  // البوابة هي المرحلة صفر: نظام ينشر ولا يفهم ليس معطلا
  const ready = state.phase0 && database === 'ok'
  return c.json(
    {
      ready,
      database,
      phase_0: state.phase0,
      phase_1: state.phase1,
      drive_folder: state.driveFolder,
      missing_secrets: state.missing,
    },
    ready ? 200 : 503,
  )
})

/**
 * تشغيل المسح يدويا — للتحقق قبل أن يحين موعد Cron.
 * لا يفعل شيئا لا يفعله Cron: المسار نفسه، فما يُختبر هنا هو ما يجري هناك.
 */
app.post('/admin/scan', async (c) => {
  // الحارس قبل أيّ عمل: لا نداء Google ولا كتابة في D1 لطلبٍ غير مأذون
  const verdict = await authorizeAdmin(c.env.ADMIN_TOKEN, c.req.raw)
  if (verdict === 'disabled') {
    return c.json({ error: 'admin_disabled', detail: 'ADMIN_TOKEN غير مضبوط' }, 503)
  }
  if (verdict === 'denied') {
    return c.json({ error: 'unauthorized' }, 401)
  }
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

app.route('/', oauth)

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
async function queue(batch: MessageBatch<PublishMessage>, env: Env): Promise<void> {
  for (const message of batch.messages) {
    const outcome = await publishPost(
      { db: env.DB, encKey: env.TOKEN_ENC_KEY },
      message.body,
    )
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
    const report = await scanDrive({
      db: env.DB,
      serviceAccountJson: env.GOOGLE_SA_JSON,
      folderId: env.DRIVE_FOLDER_ID,
    })
    console.info({
      job: 'drive-scan',
      seen: report.seen,
      added: report.added.length,
      changed: report.changed.length,
      unchanged: report.unchanged.length,
      missing: report.missing.length,
      to_analyze: report.toAnalyze.length,
    })
  } catch (error) {
    console.error({
      job: 'drive-scan',
      failed: error instanceof Error ? error.message : 'unexpected_error',
    })
  }
}

export default { fetch: app.fetch, queue, scheduled }

/**
 * sada-api — نقطة الدخول.
 *
 * المرحلة صفر: الصحة والجاهزية، وربط الحسابات عبر OAuth.
 * لوحة الاعتماد والنشر المجدول في المرحلة الأولى.
 */
import { Hono } from 'hono'
import type { MessageBatch } from '@cloudflare/workers-types'
import { missingSecrets, type Env } from './env'
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
  const missing = missingSecrets(c.env)
  let database: 'ok' | 'unreachable' = 'unreachable'
  try {
    await c.env.DB.prepare('SELECT 1').first()
    database = 'ok'
  } catch {
    database = 'unreachable'
  }
  const ready = missing.length === 0 && database === 'ok'
  return c.json({ ready, missing_secrets: missing, database }, ready ? 200 : 503)
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

export default { fetch: app.fetch, queue }

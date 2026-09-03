/**
 * sada-api — نقطة الدخول.
 *
 * المرحلة صفر: الصحة والجاهزية، وربط الحسابات عبر OAuth.
 * لوحة الاعتماد والنشر المجدول في المرحلة الأولى.
 */
import { Hono } from 'hono'
import { missingSecrets, type Env } from './env'
import { oauth } from './routes/oauth'

const app = new Hono<{ Bindings: Env }>()

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

export default app

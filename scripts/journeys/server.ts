/**
 * نسخةٌ محلّيّةٌ حيّةٌ من اللوحة يقودها متصفّحٌ حقيقيّ.
 *
 *     npm run journeys:serve        ← الخادمُ وحده على http://localhost:8787
 *
 * ## لماذا Node لا `wrangler dev`
 *
 * القاعدةُ هنا هي `fakeDb` نفسُها التي تمرّ عليها الاختبارات: SQLite حقيقيّ بكلّ
 * الترحيلات بترتيبها — فما يمرّ هنا يمرّ على المخطّط الحقيقيّ بقيوده. ومعها KV
 * بمهلته، وR2 بمداه وقطعه، وطابوران يحفظان ولا ينشران. **والمزوّدون المدفوعون
 * مزيَّفون بجوابٍ حتميّ**، وكلُّ عنوانٍ خارجيٍّ آخر يُردّ: لا طلبَ يغادر الجهاز.
 *
 * ## لماذا `localhost` لا `127.0.0.1`
 *
 * الكعكةُ `__Host-` بـ `Secure`، والدخولُ بمفتاح المرور يحتاج نطاقًا (`rp.id`)،
 * و`upgrade-insecure-requests` في CSP. و`localhost` وحده يجمع الثلاثة على HTTP:
 * أصلٌ موثوقٌ عند Chromium، ونطاقٌ يقبله WebAuthn. والخادمُ يستمع على 127.0.0.1.
 *
 * **ولا سرَّ حقيقيًّا هنا**: `ADMIN_TOKEN` ثابتٌ للاختبار، و`TOKEN_ENC_KEY` يُولَّد
 * في كلّ تشغيل، ومفاتيحُ المزوّدين نصوصٌ مزيَّفة لا تفتح شيئًا.
 */
import { registerHooks } from 'node:module'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { pathToFileURL } from 'node:url'
import { chromium, type Browser } from 'playwright'
import worker from '../../src/index'
import { toBase64 } from '../../src/lib/crypto'
import { fakeDb, fakeKv, type FakeDb } from '../../src/test/fakes'
import { fakeAi, heldQueue, installNetwork, memoryBucket, type NetCall } from './fakes'
import { seed, type Seeded } from './seed'
import type { EmailMessage } from '../../src/test/cloudflareEmail'

// ‏`cloudflare:email` وحدةٌ في Worker وحدَه (D-245): يُستبدَل ببديل الاختبار نفسِه الذي في `vitest.config.ts`،
// ‏فرمزُ الدخول يُبنى ويُحفظ في `stack.mail` ولا يُرسَل
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'cloudflare:email') {
      return { url: new URL('../../src/test/cloudflareEmail.ts', import.meta.url).href, shortCircuit: true }
    }
    return next(specifier, context)
  },
})

/** كلمةُ الإدارة المحلّيّة — للاختبار وحده، ولا تصلح لبيئةٍ حقيقيّة. */
export const LOCAL_ADMIN_TOKEN = 'local-journeys-admin-7Qm2Xc9Lp4Vt8Rb'

export const CHROMIUM = process.env['CHROMIUM_PATH'] ?? '/opt/pw-browsers/chromium'

export interface Stack {
  readonly url: string
  readonly port: number
  db: FakeDb
  kv: ReturnType<typeof fakeKv>
  bucket: ReturnType<typeof memoryBucket>
  publishQueue: ReturnType<typeof heldQueue>
  generateQueue: ReturnType<typeof heldQueue>
  seeded: Seeded
  /** ما «أُرسل» من بريد — ومنه يُقرأ رمزُ الدخول كما يقرؤه المالك من صندوقه. */
  readonly mail: EmailMessage[]
  readonly calls: NetCall[]
  /** أخطاءُ الخادم (500) — تُعرض في التقرير ولا تُبتلَع. */
  readonly errors: { at: string; path: string; message: string }[]
  /** قاعدةٌ جديدةٌ وبذرةٌ جديدة: كلُّ رحلةٍ تبدأ من الحال نفسِه. */
  reset(): Promise<void>
  close(): Promise<void>
}

export interface StartOptions {
  readonly port?: number
  readonly host?: string
  readonly aiDelayMs?: number
  /** مقطعُ البذرة. بلا قيمة: بايتاتٌ رمزيّة بأبعادٍ حقيقيّة. */
  readonly video?: { bytes: Uint8Array; mime: string; width: number; height: number; durationMs: number }
  readonly quiet?: boolean
}

/** يصوّر HTML بمتصفّحٍ محلّيّ — بديلُ Browser Rendering. يُطلق عند أوّل حاجة. */
function localRenderer(): { shoot: (html: string, w: number, h: number) => Promise<Uint8Array | null>; close: () => Promise<void> } {
  let browser: Promise<Browser | null> | null = null
  const get = () => {
    browser ??= chromium.launch({ executablePath: CHROMIUM }).catch(() => null)
    return browser
  }
  return {
    async shoot(html, width, height) {
      const b = await get()
      if (b === null) return null
      const page = await b.newPage({ viewport: { width, height } })
      try {
        await page.setContent(html, { waitUntil: 'networkidle', timeout: 20_000 })
        return new Uint8Array(await page.screenshot({ type: 'jpeg', quality: 88 }))
      } catch {
        return null
      } finally {
        await page.close().catch(() => undefined)
      }
    },
    async close() {
      const b = browser === null ? null : await browser
      await b?.close().catch(() => undefined)
    },
  }
}

function toRequest(req: IncomingMessage, origin: string): Request {
  const headers = new Headers()
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined) continue
    for (const v of Array.isArray(value) ? value : [value]) headers.append(name, v)
  }
  // ‏عنوانُ العميل كما يضعه Cloudflare — يعدّ به حارسُ المحاولات
  headers.set('CF-Connecting-IP', req.socket.remoteAddress ?? '127.0.0.1')
  const method = req.method ?? 'GET'
  const init: RequestInit & { duplex?: 'half' } = { method, headers, redirect: 'manual' }
  if (method !== 'GET' && method !== 'HEAD') {
    init.body = Readable.toWeb(req) as unknown as ReadableStream
    init.duplex = 'half'
  }
  return new Request(new URL(req.url ?? '/', origin), init)
}

async function send(res: ServerResponse, response: Response): Promise<void> {
  const headers: Record<string, string | string[]> = {}
  response.headers.forEach((value, name) => {
    if (name !== 'set-cookie') headers[name] = value
  })
  const cookies = response.headers.getSetCookie()
  if (cookies.length > 0) headers['set-cookie'] = cookies
  res.writeHead(response.status, headers)
  if (response.body === null) {
    res.end()
    return
  }
  await new Promise<void>((resolve, reject) => {
    Readable.fromWeb(response.body as never).on('error', reject).pipe(res).on('finish', resolve).on('error', reject)
  })
}

/** ثلاثُ ثوانٍ رأسيّةٌ رمزيّة — البايتاتُ لا تُشغَّل، والأبعادُ حقيقيّة. */
function placeholderVideo() {
  const bytes = new Uint8Array(180_000)
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = (i * 31) % 251
  return { bytes, mime: 'video/mp4', width: 1080, height: 1920, durationMs: 42_000 }
}

export async function startServer(options: StartOptions = {}): Promise<Stack> {
  const port = options.port ?? 8787
  const host = options.host ?? '127.0.0.1'
  const origin = `http://localhost:${port}`
  const encKey = toBase64(crypto.getRandomValues(new Uint8Array(32)))
  const renderer = localRenderer()
  const network = installNetwork({
    aiDelayMs: options.aiDelayMs ?? 800,
    screenshot: renderer.shoot,
    allowOrigins: [origin, `http://127.0.0.1:${port}`],
  })
  const video = options.video ?? placeholderVideo()
  const errors: Stack['errors'] = []

  const fresh = async () => {
    const db = fakeDb()
    const kv = fakeKv()
    const bucket = memoryBucket()
    const publishQueue = heldQueue('publish')
    const generateQueue = heldQueue('generate')
    const seeded = await seed(db, encKey, bucket, video)
    return { db, kv, bucket, publishQueue, generateQueue, seeded }
  }

  const state = await fresh()
  const stack: Stack = {
    url: origin,
    port,
    ...state,
    mail: [],
    calls: network.calls,
    errors,
    async reset() {
      Object.assign(stack, await fresh())
      network.calls.length = 0
      stack.mail.length = 0
    },
    async close() {
      await new Promise<void>((resolve) => server.close(() => resolve()))
      await renderer.close()
    },
  }

  const envOf = () => ({
    SADA_ENV: 'staging',
    PUBLIC_BASE_URL: origin,
    DRIVE_FOLDER_ID: 'local-drive-folder',
    DB: stack.db,
    KV: stack.kv,
    EMAIL: { async send(message: EmailMessage) { stack.mail.push(message) } },
    MEDIA: stack.bucket,
    PUBLISH_QUEUE: stack.publishQueue,
    GENERATE_QUEUE: stack.generateQueue,
    AI: fakeAi(options.aiDelayMs ?? 800),
    TOKEN_ENC_KEY: encKey,
    ADMIN_TOKEN: LOCAL_ADMIN_TOKEN,
    // ‏مفاتيحُ مزيَّفة: تُفتح بها البوّابات، و`fetch` المزيَّف يجيب عنها
    ANTHROPIC_API_KEY: 'local-journeys-fake-key',
    CF_AI_ACCOUNT_ID: '0123456789abcdef0123456789abcdef',
    CF_BROWSER_TOKEN: 'local-journeys-fake-browser-token',
    LEGAL_ENTITY: '',
    LEGAL_CONTACT: '',
  })

  const ctx = { waitUntil() {}, passThroughOnException() {}, props: {} }

  const server: Server = createServer((req, res) => {
    void (async () => {
      try {
        const request = toRequest(req, origin)
        const response = (await worker.fetch(request as never, envOf() as never, ctx as never)) as Response
        if (response.status >= 500) {
          errors.push({ at: new Date().toISOString(), path: `${req.method} ${req.url}`, message: `HTTP ${response.status}` })
        }
        await send(res, response)
      } catch (error) {
        const message = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error)
        errors.push({ at: new Date().toISOString(), path: `${req.method} ${req.url}`, message })
        if (!options.quiet) console.error('[journeys] 500', req.method, req.url, message)
        if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('local server error')
      }
    })()
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => resolve())
  })
  return stack
}

// ── التشغيل المباشر ─────────────────────────────────────────────────────
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const port = Number(process.env['PORT'] ?? 8787)
  const stack = await startServer({ port })
  console.log(`صدى — نسخة محلّيّة: ${stack.url}/panel`)
  console.log('الدخول: milestonesimpact@gmail.com ثمّ «أرسل الرمز» — والرمزُ يُطبع هنا')
  const push = stack.mail.push.bind(stack.mail)
  stack.mail.push = (...m) => { for (const x of m) console.log(`رمز الدخول: ${/\b(\d{6})\b/.exec(new TextDecoder().decode(Uint8Array.from(atob((x.raw.split('\r\n\r\n')[1] ?? '').replace(/\s+/g, '')), (c) => c.charCodeAt(0))))?.[1] ?? '؟'}`); return push(...m) }
  console.log('المزوّدون مزيَّفون، والشبكة الخارجيّة مقطوعة. Ctrl+C للإيقاف.')
  const stop = () => {
    void stack.close().then(() => process.exit(0))
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
}

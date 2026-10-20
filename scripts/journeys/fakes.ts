/**
 * بدائلُ موارد Cloudflare والمزوّدين المدفوعين — **لنسخةٍ محلّيّةٍ حيّة** من اللوحة.
 *
 * ليست للاختبار (تلك في `src/test/fakes.ts` ويُعاد استعمالُ قاعدتها هنا)، بل لخادمٍ
 * يقوده متصفّحٌ حقيقيّ: R2 في الذاكرة بمداه وقطعه، وطابوران يحفظان ما أُرسل ولا
 * ينشران، ورابطُ Workers AI مزيَّف، و`fetch` عامٌّ **يجيب عن المزوّدين المدفوعين
 * بجوابٍ حتميّ ويردّ كلَّ عنوانٍ آخر** — فلا يخرج طلبٌ من الجهاز ولا يُدفع سنت.
 *
 * والكلفةُ تُسجَّل كما تسجّلها الشيفرةُ الحقيقيّة (D-008): الجوابُ المزيَّف يحمل
 * `usage` بأرقامٍ معقولة، فيمرّ في `recordCost` نفسِه بسعر المزوّد المضبوط.
 */
import { crc32, deflateSync } from 'node:zlib'

// ── PNG بلا اعتماديّة ─────────────────────────────────────────────────

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body) >>> 0)
  return Buffer.concat([length, body, crc])
}

/**
 * صورةُ PNG بلونين متدرّجين — حتميّةٌ من أبعادها ولونها، **وأبعادُها حقيقيّة**
 * (تُقرأ من IHDR كما تقرؤها `imageSize`).
 */
export function solidPng(width: number, height: number, rgb: readonly [number, number, number] = [32, 44, 58]): Uint8Array {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8 // عمق اللون
  header[9] = 2 // RGB
  const row = Buffer.alloc(1 + width * 3)
  const rows: Buffer[] = []
  for (let y = 0; y < height; y += 1) {
    const shade = Math.round((y / Math.max(1, height - 1)) * 40)
    for (let x = 0; x < width; x += 1) {
      row[1 + x * 3] = Math.min(255, rgb[0] + shade)
      row[2 + x * 3] = Math.min(255, rgb[1] + shade)
      row[3 + x * 3] = Math.min(255, rgb[2] + shade)
    }
    rows.push(Buffer.from(row))
  }
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ])
  return new Uint8Array(png)
}

// ── R2 ────────────────────────────────────────────────────────────────

interface Stored {
  bytes: Uint8Array
  contentType: string
}

type Range = { offset?: number; length?: number; suffix?: number }

function bodyOf(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
}

async function toBytes(value: unknown): Promise<Uint8Array> {
  if (value instanceof Uint8Array) return value
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  if (typeof value === 'string') return new TextEncoder().encode(value)
  if (value instanceof Blob) return new Uint8Array(await value.arrayBuffer())
  if (value instanceof ReadableStream) return new Uint8Array(await new Response(value).arrayBuffer())
  return new Uint8Array(0)
}

/** R2 في الذاكرة: `put/get/head/delete`، والمدى، والرفعُ بالقطع. */
export function memoryBucket() {
  const objects = new Map<string, Stored>()
  const pending = new Map<string, Map<number, Uint8Array>>()

  const objectOf = (key: string, stored: Stored, bytes: Uint8Array) => ({
    key,
    size: stored.bytes.length,
    body: bodyOf(bytes),
    httpMetadata: { contentType: stored.contentType },
    writeHttpMetadata(headers: Headers) {
      headers.set('Content-Type', stored.contentType)
    },
    async arrayBuffer() {
      return bytes.slice().buffer
    },
  })

  const multipart = (key: string, uploadId: string) => ({
    uploadId,
    key,
    async uploadPart(partNumber: number, value: unknown) {
      const bytes = await toBytes(value)
      const parts = pending.get(uploadId) ?? new Map<number, Uint8Array>()
      parts.set(partNumber, bytes)
      pending.set(uploadId, parts)
      return { partNumber, etag: `etag-${partNumber}-${bytes.length}` }
    },
    async complete(parts: { partNumber: number; etag: string }[]) {
      const held = pending.get(uploadId) ?? new Map<number, Uint8Array>()
      const ordered = [...parts].sort((a, b) => a.partNumber - b.partNumber)
      const total = ordered.reduce((n, p) => n + (held.get(p.partNumber)?.length ?? 0), 0)
      const out = new Uint8Array(total)
      let at = 0
      for (const p of ordered) {
        const piece = held.get(p.partNumber) ?? new Uint8Array(0)
        out.set(piece, at)
        at += piece.length
      }
      objects.set(key, { bytes: out, contentType: contentTypes.get(uploadId) ?? 'application/octet-stream' })
      pending.delete(uploadId)
      return { key, size: out.length }
    },
    async abort() {
      pending.delete(uploadId)
    },
  })
  const contentTypes = new Map<string, string>()

  return {
    objects,
    async put(key: string, value: unknown, options?: { httpMetadata?: { contentType?: string } }) {
      const bytes = await toBytes(value)
      objects.set(key, { bytes, contentType: options?.httpMetadata?.contentType ?? 'application/octet-stream' })
      return { key, size: bytes.length }
    },
    async head(key: string) {
      const stored = objects.get(key)
      return stored === undefined ? null : { key, size: stored.bytes.length, httpMetadata: { contentType: stored.contentType } }
    },
    async get(key: string, options?: { range?: Range }) {
      const stored = objects.get(key)
      if (stored === undefined) return null
      const r = options?.range
      const size = stored.bytes.length
      const start = r === undefined ? 0 : r.suffix !== undefined ? Math.max(0, size - r.suffix) : r.offset ?? 0
      const end = r === undefined || r.suffix !== undefined || r.length === undefined ? size : Math.min(size, start + r.length)
      return objectOf(key, stored, stored.bytes.slice(start, end))
    },
    async delete(key: string) {
      objects.delete(key)
    },
    async createMultipartUpload(key: string, options?: { httpMetadata?: { contentType?: string } }) {
      const uploadId = `mp-${crypto.randomUUID()}`
      contentTypes.set(uploadId, options?.httpMetadata?.contentType ?? 'application/octet-stream')
      return multipart(key, uploadId)
    },
    resumeMultipartUpload(key: string, uploadId: string) {
      return multipart(key, uploadId)
    },
  }
}

// ── الطوابير ──────────────────────────────────────────────────────────

/** طابورٌ يحفظ ما أُرسل ولا يستهلكه: لا نشرَ من نسخةٍ محلّيّة. */
export function heldQueue(name: string) {
  const sent: { body: unknown; at: string }[] = []
  return {
    name,
    sent,
    async send(body: unknown) {
      sent.push({ body, at: new Date().toISOString() })
    },
    async sendBatch(messages: readonly { body: unknown }[]) {
      for (const message of messages) sent.push({ body: message.body, at: new Date().toISOString() })
    },
  }
}

// ── الشبكة ────────────────────────────────────────────────────────────

export interface NetCall {
  readonly at: string
  readonly method: string
  readonly url: string
  /** مَن أجاب: مزوّدٌ مزيَّف بالاسم، أو `blocked` لعنوانٍ لا يُسمح به. */
  readonly answeredBy: string
  readonly status: number
}

/** ما يُقصّ به النصّ العربيّ في الجواب المزيَّف دون أن تنكسر كلمة. */
function clipWords(text: string, max: number): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const space = cut.lastIndexOf(' ')
  return (space > max * 0.6 ? cut.slice(0, space) : cut).trim()
}

function sentencesOf(text: string): string[] {
  return text
    .replace(/#\S+/g, '')
    .split(/[\n.!؟?،:]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 6)
}

const LINKEDIN_DRAFT = [
  'الإطار الأوّل ليس وثيقةً تُحفظ في درج؛ هو اتّفاق على ما يعنيه «تمّ» قبل أن يبدأ العمل.',
  '',
  'في كلّ مشروع تعثّر رأيتُه، لم يكن السبب نقص الجهد، بل غياب تعريف مشترك للمعلَم: متى نعدّه منجزًا، ومن يشهد على ذلك، وما الذي يُسلَّم معه.',
  '',
  'ثلاثة أسئلة نطرحها اليوم عند كلّ معلَم:',
  'ما المخرَج الذي يُرى ويُقاس؟',
  'من يملك قرار القبول؟',
  'وما الذي يتوقّف إن تأخّر؟',
  '',
  'حين أجبنا عنها كتابةً قبل التنفيذ، صار الاجتماع الأسبوعيّ عشر دقائق بدل ساعة، لأنّ الخلاف حُسم قبل أن يقع.',
  '',
  'كيف تعرّفون «تمّ» في فرقكم؟',
  '',
  '#إدارة_المشاريع #الحوكمة #القيادة',
].join('\n')

const X_DRAFT =
  'المعلَم ليس تاريخًا في الجدول، بل اتّفاق مكتوب على معنى «تمّ»: ما المخرَج، ومن يقبله، وما الذي يتوقّف إن تأخّر. ' +
  'ثلاثة أسئلة قبل التنفيذ توفّر ساعةً كلّ أسبوع. #إدارة_المشاريع'

const VIDEO_DRAFT =
  'الإطار الأوّل في دقيقة: ثلاثة أسئلة تحسم معنى «تمّ» قبل أن يبدأ العمل — المخرَج، ومن يقبله، وما يتوقّف إن تأخّر. ' +
  'شاهد حتى النهاية، واكتب لنا كيف تعرّفون المعلَم في فرقكم. #إدارة_المشاريع #الحوكمة'

/** مسوّدةٌ عربيّةٌ واقعيّة بحسب المنصّة التي يذكرها الوصفُ النظاميّ. */
function draftFor(system: string): { text: string; rationale: string } {
  const rationale = 'بُني المنشور على فكرة المصدر المركزيّة: تعريف المعلَم قبل التنفيذ، بأسئلته الثلاثة كما وردت.'
  if (/TikTok|YouTube|مقطع/i.test(system) && !/LinkedIn/.test(system)) return { text: VIDEO_DRAFT, rationale }
  if (/منشور LinkedIn|LinkedIn/.test(system) && !/\bX\b|تغريدة/.test(system)) return { text: LINKEDIN_DRAFT, rationale }
  if (/\bX\b|تغريدة|280/.test(system)) return { text: X_DRAFT, rationale }
  return { text: LINKEDIN_DRAFT, rationale }
}

/** محتوى الإنفوجرافيك **من نصّ المنشور نفسِه** — كما يُطلب من النموذج. */
function infographicFor(user: string): Record<string, unknown> {
  const parts = sentencesOf(user)
  const title = clipWords(parts[0] ?? 'تعريف المعلَم قبل التنفيذ', 56)
  const items = (parts.length >= 4 ? parts.slice(1, 4) : ['المخرَج الذي يُقاس', 'من يملك القبول', 'ما يتوقّف إن تأخّر'])
    .map((s) => ({ label: clipWords(s, 24), value: '', note: clipWords(s, 76) }))
  return {
    kind: 'pillars',
    kicker: 'Milestone Governance',
    title,
    items,
    secondary: null,
    takeaway: clipWords(parts[parts.length - 1] ?? 'اتّفقوا على معنى «تمّ» قبل أن يبدأ العمل', 100),
  }
}

/** يملأ مخطّط JSON بأصغر قيمةٍ توافقه — لأيّ مهمّةٍ لم يُخصَّص لها جواب. */
export function fillSchema(schema: unknown): unknown {
  const s = (schema ?? {}) as Record<string, unknown>
  if (Array.isArray(s['enum']) && s['enum'].length > 0) return s['enum'][0]
  const type = Array.isArray(s['type']) ? s['type'][0] : s['type']
  switch (type) {
    case 'object': {
      const props = (s['properties'] ?? {}) as Record<string, unknown>
      const out: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(props)) out[key] = fillSchema(value)
      return out
    }
    case 'array': {
      const min = typeof s['minItems'] === 'number' ? s['minItems'] : 3
      return Array.from({ length: Math.max(1, min) }, () => fillSchema(s['items']))
    }
    case 'number':
      return typeof s['minimum'] === 'number' ? s['minimum'] : 0.7
    case 'integer':
      return typeof s['minimum'] === 'number' ? s['minimum'] : 3
    case 'boolean':
      return true
    case 'null':
      return null
    default: {
      const min = typeof s['minLength'] === 'number' ? s['minLength'] : 0
      const base = 'المعلَم اتّفاق مكتوب على معنى «تمّ» قبل أن يبدأ العمل'
      return base.length >= min ? base : base.padEnd(min, ' ـ')
    }
  }
}

interface AnthropicBody {
  model?: string
  system?: string | { text?: string }[]
  messages?: { content?: string | { text?: string }[] }[]
  output_config?: { format?: { schema?: Record<string, unknown> } }
}

function textOf(value: string | { text?: string }[] | undefined): string {
  if (value === undefined) return ''
  return typeof value === 'string' ? value : value.map((b) => b.text ?? '').join('\n')
}

/** جوابُ `messages.create` بشكله الحقيقيّ — نصٌّ واحدٌ واستهلاكٌ معقول. */
function anthropicAnswer(body: AnthropicBody): Record<string, unknown> {
  const system = textOf(body.system)
  const user = textOf(body.messages?.[0]?.content)
  const schema = body.output_config?.format?.schema
  const props = Object.keys((schema?.['properties'] ?? {}) as Record<string, unknown>)

  let payload: unknown
  if (props.includes('text') && props.includes('rationale')) payload = draftFor(system)
  else if (/infographic/i.test(system)) payload = infographicFor(user)
  else if (schema !== undefined) payload = fillSchema(schema)
  else payload = { text: clipWords(user, 200) }

  const text = JSON.stringify(payload)
  return {
    id: `msg_local_${crypto.randomUUID().slice(0, 8)}`,
    type: 'message',
    role: 'assistant',
    model: body.model ?? 'claude-opus-5',
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: {
      // أرقامٌ بقدر النصّ: تُسعَّر في `costOf` بسعر المزوّد المضبوط
      input_tokens: Math.max(400, Math.round((system.length + user.length) / 3)),
      output_tokens: Math.max(120, Math.round(text.length / 2)),
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
  }
}

export interface NetworkOptions {
  /** تأخيرُ النموذج المزيَّف بالمللي ثانية — ليُرى حالُ الانتظار كما يُرى حقًّا. */
  readonly aiDelayMs: number
  /** يصوّر صفحة HTML ويعيد JPEG — متصفّحٌ محلّيّ إن وُجد. */
  readonly screenshot?: (html: string, width: number, height: number) => Promise<Uint8Array | null>
  /** العناوين المحلّيّة التي يُسمح بها (الخادم نفسه). */
  readonly allowOrigins: readonly string[]
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** بايتاتٌ في `ArrayBuffer` خاصّ — جسمُ `Response` كما تقبله الأنواع. */
function arrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(out).set(bytes)
  return out
}

/**
 * يبدّل `fetch` العامّ. **ولا يُستعاد**: العمليّةُ كلّها نسخةٌ محلّيّة، وطلبٌ
 * يفلت إلى الشبكة أخطرُ من أيّ راحة.
 */
export function installNetwork(options: NetworkOptions): { readonly calls: NetCall[] } {
  const original = globalThis.fetch.bind(globalThis)
  const calls: NetCall[] = []
  const log = (method: string, url: string, answeredBy: string, status: number) =>
    calls.push({ at: new Date().toISOString(), method, url: url.slice(0, 200), answeredBy, status })

  const json = (value: unknown, status = 200) =>
    new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : null
    const url = request?.url ?? (typeof input === 'string' ? input : input.toString())
    const method = (init?.method ?? request?.method ?? 'GET').toUpperCase()
    const parsed = new URL(url)

    if (options.allowOrigins.includes(parsed.origin)) return original(input, init)

    const readBody = async (): Promise<string> => {
      if (init?.body !== undefined && init.body !== null) return typeof init.body === 'string' ? init.body : await new Response(init.body).text()
      if (request !== null) return await request.clone().text()
      return ''
    }

    // Anthropic — الكتابة والإنفوجرافيك والموجز والتحليل
    if (parsed.hostname === 'api.anthropic.com' && parsed.pathname === '/v1/messages' && method === 'POST') {
      await sleep(options.aiDelayMs)
      const body = JSON.parse(await readBody()) as AnthropicBody
      log(method, url, 'anthropic(fake)', 200)
      return json(anthropicAnswer(body))
    }

    // Browser Rendering — لقطةُ الإنفوجرافيك
    if (parsed.hostname === 'api.cloudflare.com' && parsed.pathname.endsWith('/browser-rendering/screenshot')) {
      const body = JSON.parse(await readBody()) as { html?: string; viewport?: { width?: number; height?: number } }
      const width = body.viewport?.width ?? 1080
      const height = body.viewport?.height ?? 1350
      const shot = options.screenshot === undefined ? null : await options.screenshot(body.html ?? '', width, height)
      log(method, url, shot === null ? 'browser-rendering(fake-png)' : 'browser-rendering(local-chromium)', 200)
      return shot === null
        ? new Response(arrayBuffer(solidPng(width, height)), { headers: { 'Content-Type': 'image/png' } })
        : new Response(arrayBuffer(shot), { headers: { 'Content-Type': 'image/jpeg' } })
    }

    // Workers AI عبر REST — صورةٌ فنّيّة
    if (parsed.hostname === 'api.cloudflare.com' && parsed.pathname.includes('/ai/run/')) {
      await sleep(options.aiDelayMs)
      log(method, url, 'workers-ai(fake)', 200)
      return json({ success: true, result: { image: Buffer.from(solidPng(1024, 1024, [70, 52, 30])).toString('base64') } })
    }

    // Gemini — صورةٌ فنّيّة
    if (parsed.hostname === 'generativelanguage.googleapis.com' && parsed.pathname.endsWith(':generateContent')) {
      await sleep(options.aiDelayMs)
      log(method, url, 'gemini(fake)', 200)
      return json({
        candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: Buffer.from(solidPng(1024, 1024, [30, 60, 52])).toString('base64') } }] } }],
        usageMetadata: { promptTokenCount: 300, candidatesTokenCount: 1290 },
      })
    }

    // كلُّ ما سواه: لا شبكة. رميٌ كانقطاعٍ حقيقيّ، والشيفرةُ تعرف كيف تقوله
    log(method, url, 'blocked', 0)
    throw new TypeError(`journeys: network disabled for ${parsed.origin}`)
  }) as typeof fetch

  return { calls }
}

/** رابطُ Workers AI مزيَّف — للتحريك والصور إن وُجّهت إليه. */
export function fakeAi(delayMs: number) {
  return {
    async run(model: string): Promise<unknown> {
      await sleep(delayMs)
      if (/video|veo|wan|ltx/i.test(model)) {
        throw new Error('journeys: تحريك الفيديو غير مُحاكى في النسخة المحلّيّة')
      }
      return { image: Buffer.from(solidPng(1024, 1024, [70, 52, 30])).toString('base64') }
    },
  }
}

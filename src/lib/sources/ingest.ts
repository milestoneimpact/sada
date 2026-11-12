/**
 * مصادرُ من غير Drive (D-284): ملفٌّ يُرفع الآن، ورابطُ صفحة.
 *
 * ## لماذا
 *
 * كان الطريقُ الوحيد إلى خطّةٍ مجلّدَ Drive: من عنده ملفٌّ على جهازه يذهب إلى Drive ويرفعه وينتظر المسح، ومن عنده
 * مقالٌ على موقعٍ ينسخه في مستندٍ أوّلًا. **والمالكُ يريد أن يرفع الآن، من حيث هو، ويبقى الملفُّ في ملفّاته.**
 *
 * ## الاستخراجُ عند الاستلام لا عند التحليل
 *
 * PDF وWord وExcel لا تُقرأ داخل الـ Worker (D-016: سقفُ المعالجة). **و`env.AI.toMarkdown` يقرؤها في Cloudflare**
 * بلا كلفةٍ للمستندات. فيُستخرَج النصُّ لحظةَ الرفع ويُحفظ في R2 بجانب الأصل:
 *
 * - المالكُ يرى «لا نصّ فيه — صورةٌ ممسوحة؟» **في لحظته** لا بعد تحليلٍ فشل في الخلفيّة.
 * - والتحليلُ (`analyzeSource`) يقرأ نصًّا جاهزًا بطريقٍ واحدٍ لكلّ نوع، فلا يعرف من أين جاء.
 *
 * ## الرابط: قراءةٌ ساكنةٌ أوّلًا، ثمّ متصفّح
 *
 * تُجلب الصفحةُ وتُحوَّل نصًّا (مجّانًا). فإن خرج النصُّ هزيلًا — صفحةٌ يرسمها JavaScript — يُسأل Browser Rendering
 * (`/markdown`) إن ضُبط `CF_BROWSER_TOKEN`، وتُسجَّل مدّتُه في `cost_ledger` (D-008). وما خلف تسجيل الدخول يُقال
 * إنّه خلفه، لا يُعاد نصًّا فارغًا.
 */
import type { Db } from '../tokens'
import { recordCost } from '../cost'
import { nonPublicHost, parseIPv4 } from '../net/ipGuard'
import { withTimeout } from '../net/timeout'
import { MAX_TEXT_BYTES } from '../drive/export'

/** أكبرُ ملفٍّ يُرفع — سقفُ تحويل PDF في Workers AI بلا OCR أقلُّ منه، والزائدُ يُرَدّ بسببه. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
/** أكبرُ ما يُقرأ من صفحة — صفحةُ مقالٍ أصغرُ منه بكثير، والأكبرُ ليس مقالًا. */
export const MAX_PAGE_BYTES = 5 * 1024 * 1024
/** دون هذا من المحارف تُعَدّ الصفحةُ بلا نصّ: قوائمُ وتذييلٌ لا مقال. */
export const THIN_TEXT = 400

/** ما يُقبل رفعُه، بامتداده — والنوعُ الذي يرسله المتصفّح قد يكون `application/octet-stream`. */
const EXT_MIME: Readonly<Record<string, string>> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  csv: 'text/csv',
  txt: 'text/plain',
  md: 'text/markdown',
  html: 'text/html',
  htm: 'text/html',
  // ‏ملفُّ ترجمة المقطع (D-327): نصُّ ما قيل فيه — يُقرأ نصًّا بعد نزع أرقامه ومواقيته
  srt: 'text/plain',
  vtt: 'text/plain',
}
/** ما يُقرأ نصًّا كما هو، بلا تحويل. */
const PLAIN = new Set(['text/plain', 'text/markdown', 'text/csv'])

/** الامتداداتُ المقبولة — لسطر الشرح وحقل `accept` في المتصفّح. */
export const UPLOAD_EXTENSIONS: readonly string[] = Object.keys(EXT_MIME)

export interface Bucket {
  put(key: string, value: ArrayBuffer | Uint8Array | string, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>
  get(key: string): Promise<{ text(): Promise<string> } | null>
}

export interface ConvertResult {
  readonly format: 'markdown' | 'text' | 'error'
  readonly data?: string
  readonly error?: string
  readonly tokens?: number
}

/** `env.AI.toMarkdown` — الشكلُ الذي يلزمنا منه وحدَه. */
export type ToMarkdown = (doc: { name: string; blob: Blob }) => Promise<ConvertResult | ConvertResult[]>

export interface IngestDeps {
  readonly db: Db
  readonly media: Bucket
  readonly toMarkdown?: ToMarkdown | undefined
  /** Browser Rendering للصفحات التي يرسمها JavaScript — اختياريٌّ، وغيابُه ليس عطلًا. */
  readonly browser?: { readonly accountId: string; readonly token: string } | null
  readonly fetchImpl?: typeof fetch
}

export type IngestOutcome =
  | { readonly kind: 'added' | 'exists' | 'updated'; readonly id: string; readonly name: string }
  | { readonly kind: 'rejected'; readonly reason: string }

const reject = (reason: string): IngestOutcome => ({ kind: 'rejected', reason })

async function sha256(bytes: Uint8Array | string): Promise<string> {
  const data = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(data)))
  return [...hash].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function extOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase()
}

/**
 * يُنظَّف ما يُرجعه التحويل: قسمُ «Metadata» في PDF (المنتِجُ والإصدار) ليس محتوى، ويُحاسَب عليه التحليلُ إن بقي.
 */
export function cleanConverted(text: string): string {
  return text
    .replace(/^## Metadata\n(?:- .*\n?)*/m, '')
    .replace(/^## Contents\n/m, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * ملفُّ ترجمةٍ (SRT أو WebVTT) نصًّا يُقرأ (D-327): بلا رأسٍ ولا أرقامِ مقاطعَ ولا مواقيتَ ولا وسوم، والسطرُ المكرَّرُ
 * (ترجمةٌ متدحرجةٌ تعيد آخرَ سطرٍ) مرّةً واحدة.
 */
export function cleanCaptions(raw: string): string {
  const out: string[] = []
  for (const line of raw.replace(/\r/g, '').split('\n')) {
    const t = line.replace(/<[^>]+>/g, '').trim()
    if (t === '' || t === 'WEBVTT' || /^\d+$/.test(t) || /-->/.test(t) || /^(?:NOTE|STYLE|Kind:|Language:)/.test(t)) continue
    if (out[out.length - 1] !== t) out.push(t)
  }
  return out.join('\n')
}

/** المحارفُ التي تحمل معنًى — بلا علامات Markdown ولا فراغ. */
function meaningful(text: string): number {
  return text.replace(/[#*_\u0060>\-|\s]/g, '').length
}

async function convert(deps: IngestDeps, name: string, bytes: Uint8Array, mime: string): Promise<string | { error: string }> {
  if (PLAIN.has(mime)) {
    try {
      const plain = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes)
      return /\.(?:srt|vtt)$/i.test(name) ? cleanCaptions(plain) : plain
    } catch {
      return { error: 'الملفّ ليس UTF-8 — احفظه بترميز UTF-8 ثمّ ارفعه.' }
    }
  }
  if (deps.toMarkdown === undefined) {
    return { error: 'قارئُ المستندات (Workers AI) غير مربوط في هذه البيئة — ارفع ملفًّا نصّيًّا (txt أو md أو csv).' }
  }
  const out = await deps.toMarkdown({ name, blob: new Blob([new Uint8Array(bytes)], { type: mime }) })
  const one = Array.isArray(out) ? out[0] : out
  if (one === undefined || one.format === 'error' || one.data === undefined) {
    return { error: `تعذّرت قراءة الملفّ${one?.error === undefined ? '' : ` (${one.error.slice(0, 120)})`}.` }
  }
  return cleanConverted(one.data)
}

/** الصفُّ وملفّاه في R2 — والنصُّ قبل الصفّ، فلا يوجد صفٌّ يشير إلى نصٍّ لم يُكتب. */
async function store(
  deps: IngestDeps,
  org: string,
  row: { kind: 'upload' | 'url'; ref: string; name: string; mime: string; hash: string; text: string; url?: string; original?: Uint8Array },
): Promise<string> {
  const id = `src:${row.kind}:${row.ref}`
  const base = `sources/${org}/${row.kind}-${row.ref}`
  const textKey = `${base}/text.md`
  await deps.media.put(textKey, row.text, { httpMetadata: { contentType: 'text/markdown; charset=utf-8' } })
  let fileKey: string | null = null
  if (row.original !== undefined) {
    fileKey = `${base}/original.${extOf(row.name) || 'bin'}`
    await deps.media.put(fileKey, row.original, { httpMetadata: { contentType: row.mime } })
  }
  await deps.db
    .prepare(
      `INSERT INTO sources (id, drive_file_id, name, mime, content_hash, org_id, kind, origin_url, file_key, text_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, `${row.kind}:${row.ref}`, row.name, row.mime, `sha256:${row.hash}`, org, row.kind, row.url ?? null, fileKey, textKey)
    .run()
  return id
}

/**
 * ملفٌّ يُرفع الآن. **والملفُّ نفسُه مرّتين مصدرٌ واحد**: البصمةُ تُقارَن داخل المنظّمة قبل أيّ تحويلٍ أو كتابة.
 */
export async function ingestFile(
  deps: IngestDeps,
  org: string,
  file: { readonly name: string; readonly type: string; readonly bytes: Uint8Array },
): Promise<IngestOutcome> {
  const name = file.name.trim().slice(0, 200) || 'ملفّ'
  const ext = extOf(name)
  const mime = EXT_MIME[ext]
  if (mime === undefined) {
    return reject(`الصيغة .${ext || '؟'} لا تُقرأ — المقبول: ${UPLOAD_EXTENSIONS.join(' · ')}.`)
  }
  if (file.bytes.byteLength === 0) return reject('الملفّ فارغ.')
  if (file.bytes.byteLength > MAX_UPLOAD_BYTES) {
    return reject(`الملفّ أكبر من ${MAX_UPLOAD_BYTES / 1024 / 1024}MB — قسّمه أو ارفع نسخةً أخفّ.`)
  }
  const hash = await sha256(file.bytes)
  const prior = await deps.db
    .prepare("SELECT id, name FROM sources WHERE org_id = ? AND kind = 'upload' AND content_hash = ?")
    .bind(org, `sha256:${hash}`)
    .first<{ id: string; name: string }>()
  if (prior !== null) return { kind: 'exists', id: prior.id, name: prior.name }

  const text = await convert(deps, name, file.bytes, mime)
  if (typeof text !== 'string') return reject(text.error)
  if (meaningful(text) < 40) {
    return reject(mime === 'application/pdf'
      ? 'لا نصّ في الملفّ — يبدو PDF ممسوحًا ضوئيًّا. ارفع نسخةً نصّيّة منه.'
      : 'لا نصّ في الملفّ يُبنى عليه.')
  }
  if (new TextEncoder().encode(text).byteLength > MAX_TEXT_BYTES) {
    return reject(`نصُّ الملفّ أطول من ${MAX_TEXT_BYTES / 1024}KB — قسّمه ملفّين.`)
  }
  const ref = crypto.randomUUID()
  const id = await store(deps, org, { kind: 'upload', ref, name, mime, hash, text, original: file.bytes })
  // ‏تحويلُ المستند بلا كلفة، ويُكتب صفرًا ليُرى في الدفتر أنّه وقع (D-008)
  if (!PLAIN.has(mime)) await recordCost(deps.db, { provider: 'workers-ai', operation: `tomarkdown:${ext}`, units: 1, unitCost: 0, refId: id, org })
  return { kind: 'added', id, name }
}

/**
 * عنوانٌ يُقبل: https، واسمُ مضيفٍ لا عنوانُ IP ولا اسمٌ محلّيّ — **ويُفحص به كلُّ تحويلٍ لا الأوّلُ وحدَه** (D-318).
 *
 * والعنوانُ العدديُّ يُردّ كلُّه (مقالٌ على عنوانٍ عدديٍّ نادرٌ)، والمحلّيُّ والخاصُّ والمحجوزُ يُعرَف بأيّ كتابة
 * (`nonPublicHost`): ستّ عشريّةٌ أو ثُمانيّةٌ أو مختصرةٌ أو مُعيَّنةُ IPv4.
 */
export function parseLink(raw: string): URL | string {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return 'هذا ليس رابطًا — الصق العنوان كاملًا يبدأ بـ https://'
  }
  if (url.protocol !== 'https:') return 'الرابطُ يبدأ بـ https:// وحدَه.'
  const host = url.hostname.toLowerCase()
  if (nonPublicHost(host) !== null || parseIPv4(host) !== null || host.startsWith('[')) {
    return 'هذا العنوانُ ليس موقعًا عامًّا.'
  }
  if (url.username !== '' || url.password !== '') return 'رابطٌ يحمل اسمَ دخولٍ أو كلمةَ سرّ لا يُقبل.'
  url.hash = ''
  return url
}

/** عنوانُ الصفحة من `og:title` ثمّ `<title>` — أقربُ إلى ما يعرفه المالكُ من اسم المضيف. */
export function pageTitle(html: string): string | null {
  const og = /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i.exec(html)?.[1]
  const title = og ?? /<title[^>]*>([^<]+)<\/title>/i.exec(html)?.[1]
  if (title === undefined) return null
  const clean = title.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim()
  return clean === '' ? null : clean.slice(0, 160)
}

/** بديلٌ بلا Workers AI: النصُّ بين الوسوم، بلا سكربتٍ ولا نمط. */
function stripHtml(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim()
}

async function readCapped(response: Response, cap: number): Promise<Uint8Array | null> {
  const reader = response.body?.getReader()
  if (reader === undefined) return new Uint8Array(await response.arrayBuffer())
  const parts: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > cap) {
      await reader.cancel()
      return null
    }
    parts.push(value)
  }
  const out = new Uint8Array(size)
  let at = 0
  for (const p of parts) { out.set(p, at); at += p.byteLength }
  return out
}

/** سعرُ ساعة المتصفّح بعد العشر المجّانيّة في الشهر (Workers Paid) — يُكتب على كلّ قراءة، والدفترُ لا يطرح المجّانيّ. */
const BROWSER_HOUR = 0.09

async function viaBrowser(deps: IngestDeps, url: URL, org: string): Promise<string | null> {
  const b = deps.browser
  if (b === null || b === undefined || b.accountId.trim() === '' || b.token.trim() === '') return null
  const call = withTimeout(deps.fetchImpl ?? fetch, 45_000)
  const response = await call(`https://api.cloudflare.com/client/v4/accounts/${b.accountId.trim()}/browser-rendering/markdown`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${b.token.trim()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: url.toString(), gotoOptions: { waitUntil: 'networkidle0', timeout: 20_000 } }),
  })
  // ‏المدّةُ من ترويسة المنصّة؛ وغيابُها يُكتب صفرًا موسومًا لا تقديرًا مخترَعًا
  const ms = Number(response.headers.get('X-Browser-Ms-Used'))
  const known = Number.isFinite(ms) && ms > 0
  await recordCost(deps.db, {
    provider: 'cloudflare-browser',
    operation: known ? 'browser:markdown' : 'browser:markdown:price_unverified',
    units: known ? ms : 0,
    unitCost: BROWSER_HOUR / 3_600_000,
    org,
  })
  if (!response.ok) return null
  const body = await response.json().catch(() => null) as { success?: boolean; result?: unknown } | null
  return body?.success === true && typeof body.result === 'string' ? cleanConverted(body.result) : null
}

/** كم تحويلًا يُتبَع (D-318): نطاقٌ إلى آخر، ثمّ نسخةٌ للهاتف، ثمّ متتبِّعُ نقرات — وما فوق الخمس سلسلةٌ لا يقصدها مقال. */
export const MAX_LINK_HOPS = 5

/**
 * **التحويلُ يُتبَع يدًا ويُفحص في كلّ قفزة** (D-318).
 *
 * كان `fetch` يتبعه من تحتنا (`redirect: 'follow'`) بعد أن فُحص الرابطُ الأوّل وحدَه: صفحةٌ عامّةٌ تردّ ‏302 إلى
 * `169.254.169.254` أو `0x7f.1` أو `http://` تصل إليه. فصار كلُّ `Location` يُحَلّ على ما سبقه ثمّ يمرّ بـ `parseLink`
 * نفسِها، وخمسُ قفزاتٍ على الأكثر. **وما يبقى**: Workers لا يحلّ الاسمَ قبل النداء، فاسمٌ عامٌّ يشير سجلُّه إلى عنوانٍ
 * داخليٍّ لا يُرى هنا (`net/ipGuard.ts`).
 */
async function followLink(deps: IngestDeps, first: URL, extra: Readonly<Record<string, string>> = {}): Promise<Response | string> {
  const call = withTimeout(deps.fetchImpl ?? fetch, 30_000)
  let target = first
  for (let hop = 0; hop <= MAX_LINK_HOPS; hop += 1) {
    let response: Response
    try {
      response = await call(target.toString(), {
        redirect: 'manual',
        headers: { Accept: 'text/html,application/xhtml+xml,application/pdf;q=0.9,text/plain;q=0.8', 'User-Agent': 'Sada/1.0 (content reader)', ...extra },
      })
    } catch {
      return 'تعذّر الوصول إلى الصفحة — تحقّق من الرابط أو جرّب بعد قليل.'
    }
    if (response.status < 300 || response.status > 399) return response
    const location = response.headers.get('Location')
    // ‏‏304 وأخواتُها بلا وجهة: ردٌّ يُحكَم عليه كما هو
    if (location === null || location.trim() === '') return response
    if (hop === MAX_LINK_HOPS) break
    let next: URL | string
    try {
      next = parseLink(new URL(location, target).toString())
    } catch {
      next = 'هذا ليس رابطًا'
    }
    if (typeof next === 'string') return `الصفحةُ تحوِّل إلى عنوانٍ لا يُقرأ (${next.replace(/\.$/, '')}) — الصق رابطَ المقال نفسِه.`
    target = next
  }
  return `الصفحةُ تحوِّل أكثرَ من ${MAX_LINK_HOPS} مرّات — الصق رابطَ المقال نفسِه (خمس قفزاتٍ على الأكثر).`
}

/** نصُّ صفحةٍ HTML — بـ Workers AI إن رُبط، وإلّا ما بين الوسوم. */
async function htmlText(deps: IngestDeps, bytes: Uint8Array, html: string): Promise<string> {
  if (deps.toMarkdown === undefined) return stripHtml(html)
  const out = await convert(deps, 'page.html', bytes, 'text/html')
  return typeof out === 'string' ? out : stripHtml(html)
}

// ── رابطُ موقعٍ كامل (D-327) ──────────────────────────────────────────

/** كم صفحةً داخليّةً تُقرأ مع الرئيسيّة — أربعٌ تكفي «من نحن» و«خدماتنا» وأختيهما، وكلُّ صفحةٍ نداءٌ يُنتظَر. */
export const MAX_SITE_PAGES = 4

/** ما يدلّ على صفحةٍ تعرّف بالجهة وما تقدّمه — يُقدَّم على غيره. */
const SITE_HINTS = /about|who-we-are|services|solutions|products|programs|projects|work|impact|vision|mission|story|عن|من-نحن|نحن|خدمات|حلول|منتجات|برامج|مشاريع|رؤية|رسالة|أثر/i
/** ما لا يحمل محتوى يُبنى عليه. */
const SITE_SKIP = /login|signin|sign-in|signup|register|cart|checkout|account|privacy|terms|cookie|contact|wp-admin|feed|tag\/|category\/|\.(?:png|jpe?g|gif|svg|webp|css|js|zip|mp4|mp3)$|تسجيل|دخول|سلة|خصوصية|شروط|اتصل/i

/**
 * روابطُ الرئيسيّة الداخليّة التي تستحقّ القراءة: المضيفُ نفسُه، ومسارٌ قصير (جزءٌ أو جزءان)، بلا مكرَّرٍ ولا ما في `SITE_SKIP`.
 * وما يطابق `SITE_HINTS` أوّلًا، ثمّ بترتيب ورودها في الصفحة (القائمةُ العليا قبل التذييل).
 */
export function siteLinks(html: string, home: URL, cap = MAX_SITE_PAGES): URL[] {
  const seen = new Set<string>([home.pathname.replace(/\/+$/, '')])
  const found: { url: URL; hint: boolean; at: number }[] = []
  let at = 0
  for (const m of html.matchAll(/<a\b[^>]*\bhref=["']([^"'#]+)["']/gi)) {
    at += 1
    let url: URL
    try { url = new URL(m[1]!.trim(), home) } catch { continue }
    if (url.protocol !== 'https:' || url.hostname !== home.hostname) continue
    url.hash = ''
    url.search = ''
    const path = url.pathname.replace(/\/+$/, '')
    let readable = path
    try { readable = decodeURIComponent(path) } catch { /* مسارٌ بترميزٍ فاسد يُقرأ كما هو */ }
    if (path === '' || seen.has(path) || path.split('/').length > 3 || SITE_SKIP.test(readable)) continue
    seen.add(path)
    found.push({ url, hint: SITE_HINTS.test(readable), at })
  }
  return found.sort((a, b) => Number(b.hint) - Number(a.hint) || a.at - b.at).slice(0, cap).map((f) => f.url)
}

/**
 * **رابطُ الموقع يُقرأ موقعًا لا صفحة** (D-327): الرئيسيّةُ وحدَها شعارٌ وعناوين، وما يُبنى عليه في «من نحن» و«خدماتنا».
 * فحين يكون الرابطُ جذرَ الموقع تُقرأ معه أربعُ صفحاتٍ داخليّةٍ على الأكثر، كلٌّ بحرّاس الرابط نفسِها (`followLink`)، وتُضمّ
 * إلى نصّ المصدر تحت عناوينها. **وصفحةٌ تعذّرت لا تُسقط المصدر**: يُبنى على ما قُرئ.
 */
async function siteExtras(deps: IngestDeps, home: URL, html: string): Promise<string> {
  const parts: string[] = []
  for (const link of siteLinks(html, home)) {
    const checked = parseLink(link.toString())
    if (typeof checked === 'string') continue
    const response = await followLink(deps, checked).catch(() => null)
    if (response === null || typeof response === 'string' || !response.ok) continue
    const type = (response.headers.get('Content-Type') ?? '').split(';')[0]!.trim().toLowerCase()
    if (type !== 'text/html' && type !== 'application/xhtml+xml' && type !== '') continue
    const bytes = await readCapped(response, MAX_PAGE_BYTES).catch(() => null)
    if (bytes === null) continue
    const page = new TextDecoder().decode(bytes)
    const text = await htmlText(deps, bytes, page)
    if (meaningful(text) < THIN_TEXT) continue
    parts.push(`## ${pageTitle(page) ?? link.pathname}\n\n${text}`)
  }
  return parts.join('\n\n')
}

// ── رابطُ مقطع (D-327) ────────────────────────────────────────────────

/** معرّفُ مقطع YouTube من رابطه: `watch?v=` · `youtu.be/` · `shorts/` · `live/` · `embed/` — وما سواها `null`. */
export function videoId(url: URL): string | null {
  const host = url.hostname.toLowerCase().replace(/^(?:www|m|music)\./, '')
  let id: string | null = null
  if (host === 'youtu.be') id = url.pathname.split('/')[1] ?? null
  else if (host === 'youtube.com') {
    const seg = url.pathname.split('/')
    id = url.pathname === '/watch' ? url.searchParams.get('v') : ['shorts', 'live', 'embed'].includes(seg[1] ?? '') ? seg[2] ?? null : null
  }
  return id !== null && /^[A-Za-z0-9_-]{6,20}$/.test(id) ? id : null
}

/** سلسلةُ JSON من داخل صفحة (`"key":"…"`) بقيمتها المفكوكة. */
function jsonString(html: string, key: string): string | null {
  const m = new RegExp(`"${key}":"((?:[^"\\\\]|\\\\.)*)"`).exec(html)
  if (m === null) return null
  try { return JSON.parse(`"${m[1]!}"`) as string } catch { return null }
}

const decodeEntities = (t: string): string => t
  .replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')

/** نصُّ مسار الترجمة: JSON (`fmt=json3`) أو XML — وما لم يُقرأ فارغ. */
export function captionText(body: string): string {
  const lines: string[] = []
  try {
    const parsed = JSON.parse(body) as { events?: { segs?: { utf8?: string }[] }[] }
    for (const e of parsed.events ?? []) {
      const t = (e.segs ?? []).map((x) => x.utf8 ?? '').join('').replace(/\s+/g, ' ').trim()
      if (t !== '' && lines[lines.length - 1] !== t) lines.push(t)
    }
  } catch {
    for (const m of body.matchAll(/<(?:text|p)\b[^>]*>([\s\S]*?)<\/(?:text|p)>/g)) {
      const t = decodeEntities(decodeEntities(m[1]!.replace(/<[^>]+>/g, ''))).replace(/\s+/g, ' ').trim()
      if (t !== '' && lines[lines.length - 1] !== t) lines.push(t)
    }
  }
  return lines.join('\n')
}

/** متصفّحٌ عاديّ: صفحةُ المقطع تُرجع لقارئٍ آليٍّ هيكلًا بلا بياناته. */
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  'Accept-Language': 'ar,en;q=0.8',
} as const

/**
 * **رابطُ مقطعٍ يُقرأ نصًّا** (D-327): عنوانُه ووصفُه من صفحته، ونصُّ ما قيل فيه من مسار الترجمة إن أتاحه صاحبُه (العربيّةُ
 * أوّلًا، ثمّ المكتوبةُ باليد قبل الآليّة). **بلا نداءٍ مدفوع**: لا يُنزَّل المقطعُ ولا يُفرَّغ صوتُه. فمقطعٌ بلا ترجمةٍ ولا وصفٍ
 * كافٍ يُردّ بما يفعله المالك: يرفع ملفَّ ترجمته (srt · vtt) أو نصَّه.
 */
async function videoText(deps: IngestDeps, id: string): Promise<{ text: string; title: string | null } | string> {
  const none = 'لا نصَّ مكتوبًا متاحًا لهذا المقطع (بلا ترجمةٍ ولا وصفٍ كافٍ) — ارفع ملفَّ ترجمته (srt أو vtt) أو نصَّه في ملفّ.'
  const page = await followLink(deps, new URL(`https://www.youtube.com/watch?v=${id}&hl=ar`), BROWSER_HEADERS)
  if (typeof page === 'string') return page
  if (!page.ok) return `صفحةُ المقطع ردّت ${page.status} — تحقّق من الرابط، أو ارفع ملفَّ ترجمته (srt أو vtt).`
  const bytes = await readCapped(page, MAX_PAGE_BYTES)
  if (bytes === null) return none
  const html = new TextDecoder().decode(bytes)
  const title = jsonString(html, 'title') ?? pageTitle(html)?.replace(/\s*-\s*YouTube\s*$/, '') ?? null
  const description = jsonString(html, 'shortDescription') ?? ''

  let spoken = ''
  const tracks = /"captionTracks":(\[[\s\S]*?\])/.exec(html)?.[1]
  if (tracks !== undefined) {
    try {
      const list = (JSON.parse(tracks) as { baseUrl?: string; languageCode?: string; kind?: string }[]).filter((t) => typeof t.baseUrl === 'string')
      const rank = (t: { languageCode?: string; kind?: string }): number => (t.languageCode?.startsWith('ar') === true ? 0 : 2) + (t.kind === 'asr' ? 1 : 0)
      const best = [...list].sort((a, b) => rank(a) - rank(b))[0]
      // ‏عنوانُ المسار من الصفحة: يُفحص كأيّ رابط، ولا يُتبَع إلى غير مضيف المقاطع
      const track = best === undefined ? 'no' : parseLink(best.baseUrl!)
      if (typeof track !== 'string' && /(?:^|\.)youtube\.com$/.test(track.hostname)) {
        track.searchParams.set('fmt', 'json3')
        const got = await followLink(deps, track, BROWSER_HEADERS)
        if (typeof got !== 'string' && got.ok) {
          const body = await readCapped(got, MAX_PAGE_BYTES)
          if (body !== null) spoken = captionText(new TextDecoder().decode(body))
        }
      }
    } catch {
      // ‏قائمةُ مساراتٍ لا تُقرأ: يُبنى على الوصف إن كفى
    }
  }
  if (meaningful(spoken) + meaningful(description) < THIN_TEXT) return none
  const text = [`# ${title ?? 'مقطع'}`, description.trim() === '' ? '' : `## وصفُ المقطع\n\n${description.trim()}`, spoken === '' ? '' : `## ما قيل في المقطع\n\n${spoken}`]
    .filter((x) => x !== '').join('\n\n')
  return { text, title }
}

/**
 * رابطُ صفحة. **والرابطُ نفسُه مرّتين مصدرٌ واحد**: يُعاد قراءتُه، فإن تغيّر نصُّه حُدّث الصفُّ وبصمتُه فيُعاد تحليلُه،
 * وإن لم يتغيّر قيل «موجود» ولم يُكتب شيء.
 */
export async function ingestLink(deps: IngestDeps, org: string, raw: string): Promise<IngestOutcome> {
  const url = parseLink(raw)
  if (typeof url === 'string') return reject(url)
  // ‏رابطُ مقطع (D-327): يُقرأ عنوانُه ووصفُه وما قيل فيه، لا صفحةُ المشغّل
  const clip = videoId(url)
  if (clip !== null) {
    const video = await videoText(deps, clip)
    if (typeof video === 'string') return reject(video)
    return keepLink(deps, org, new URL(`https://www.youtube.com/watch?v=${clip}`), video.text, video.title ?? `مقطع ${clip}`, 'text/html')
  }
  const fetched = await followLink(deps, url)
  if (typeof fetched === 'string') return reject(fetched)
  const response = fetched
  if (response.status === 401 || response.status === 403) {
    return reject('الصفحةُ خلف تسجيل دخول أو تمنع القراءة الآليّة — انسخ نصَّها في ملفٍّ وارفعه.')
  }
  if (!response.ok) return reject(`الصفحة ردّت ${response.status} — تحقّق من الرابط.`)
  const type = (response.headers.get('Content-Type') ?? '').split(';')[0]!.trim().toLowerCase()
  const bytes = await readCapped(response, MAX_PAGE_BYTES)
  if (bytes === null) return reject(`الصفحة أكبر من ${MAX_PAGE_BYTES / 1024 / 1024}MB — ليست مقالًا يُقرأ.`)

  let text = ''
  let title: string | null = null
  let mime = 'text/html'
  if (type === 'application/pdf') {
    mime = type
    const out = await convert(deps, `${url.hostname}.pdf`, bytes, type)
    if (typeof out !== 'string') return reject(out.error)
    text = out
  } else if (type === 'text/plain' || type === 'text/markdown') {
    mime = type
    text = new TextDecoder().decode(bytes)
  } else if (type === 'text/html' || type === 'application/xhtml+xml' || type === '') {
    const html = new TextDecoder().decode(bytes)
    title = pageTitle(html)
    text = await htmlText(deps, bytes, html)
    // ‏جذرُ الموقع (D-327): تُقرأ معه صفحاتُه التعريفيّة فيُبنى على الموقع لا على رئيسيّته وحدَها
    if (url.pathname.replace(/\/+$/, '') === '' && url.search === '') {
      const more = await siteExtras(deps, url, html).catch(() => '')
      if (more !== '') text = `## ${title ?? url.hostname}\n\n${text}\n\n${more}`
    }
  } else {
    return reject(`نوعُ المحتوى ${type} لا يُقرأ — الرابطُ صفحةٌ أو PDF.`)
  }

  // ‏صفحةٌ يرسمها JavaScript تُرجع هيكلًا بلا نصّ: يُسأل المتصفّح إن ضُبط
  if (meaningful(text) < THIN_TEXT && mime === 'text/html') {
    const rendered = await viaBrowser(deps, url, org).catch(() => null)
    if (rendered !== null && meaningful(rendered) > meaningful(text)) text = rendered
  }
  if (meaningful(text) < THIN_TEXT) {
    return reject(deps.browser === null || deps.browser === undefined
      ? 'الصفحةُ بلا نصٍّ كافٍ — قد تُرسَم بـ JavaScript (يحتاج CF_BROWSER_TOKEN) أو تكون خلف تسجيل دخول.'
      : 'الصفحةُ بلا نصٍّ كافٍ — قد تكون خلف تسجيل دخول. انسخ نصَّها في ملفٍّ وارفعه.')
  }
  return keepLink(deps, org, url, text, title ?? `${url.hostname}${url.pathname === '/' ? '' : url.pathname}`, mime)
}

/** يحفظ نصَّ الرابط مصدرًا — جديدًا، أو محدَّثًا إن تغيّر نصُّه، أو «موجود» إن لم يتغيّر. */
async function keepLink(deps: IngestDeps, org: string, url: URL, raw: string, title: string, mime: string): Promise<IngestOutcome> {
  let text = raw
  if (new TextEncoder().encode(text).byteLength > MAX_TEXT_BYTES) text = text.slice(0, MAX_TEXT_BYTES / 4)

  const name = title.slice(0, 160)
  const ref = (await sha256(url.toString())).slice(0, 24)
  const hash = await sha256(text)
  const prior = await deps.db
    .prepare("SELECT id, name, content_hash, text_key FROM sources WHERE org_id = ? AND kind = 'url' AND origin_url = ?")
    .bind(org, url.toString())
    .first<{ id: string; name: string; content_hash: string; text_key: string | null }>()
  if (prior !== null) {
    if (prior.content_hash === `sha256:${hash}`) return { kind: 'exists', id: prior.id, name: prior.name }
    await deps.media.put(prior.text_key ?? `sources/${org}/url-${ref}/text.md`, text, { httpMetadata: { contentType: 'text/markdown; charset=utf-8' } })
    await deps.db
      .prepare("UPDATE sources SET name = ?, content_hash = ?, last_seen_at = datetime('now') WHERE id = ? AND org_id = ?")
      .bind(name, `sha256:${hash}`, prior.id, org)
      .run()
    return { kind: 'updated', id: prior.id, name }
  }
  const id = await store(deps, org, { kind: 'url', ref, name, mime, hash, text, url: url.toString() })
  return { kind: 'added', id, name }
}

/** نصُّ مصدرٍ من غير Drive، كما حُفظ عند الاستلام — لـ `analyzeSource`. */
export async function readSourceText(media: Bucket, textKey: string | null): Promise<string | null> {
  if (textKey === null) return null
  const object = await media.get(textKey)
  return object === null ? null : await object.text()
}

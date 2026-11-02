/** مصادرُ من غير Drive (D-284): الرفعُ والرابط، بقاعدةٍ حقيقيّة وR2 وشبكةٍ مزيّفين. */
import { beforeEach, describe, expect, it } from 'vitest'
import { fakeDb, type FakeDb } from '../../test/fakes'
import { cleanConverted, ingestFile, ingestLink, pageTitle, parseLink, type IngestDeps, type ToMarkdown } from './ingest'

let db: FakeDb
let objects: Map<string, string | Uint8Array>

const media = {
  async put(key: string, value: ArrayBuffer | Uint8Array | string) {
    objects.set(key, typeof value === 'string' ? value : new Uint8Array(value as ArrayBuffer))
    return null
  },
  async get(key: string) {
    const v = objects.get(key)
    return v === undefined ? null : { text: async () => (typeof v === 'string' ? v : new TextDecoder().decode(v)) }
  },
}

const ARTICLE = 'فقرةٌ من مقالٍ عن قيادة المحافظ وقياس الأثر. '.repeat(30)
const toMd: ToMarkdown = async (doc) => ({
  format: 'markdown',
  data: doc.name.endsWith('.html') ? `# مقال\n\n${ARTICLE}` : `# ${doc.name}\n## Metadata\n- Producer=X\n- Title=T\n## Contents\n### Page 1\n${ARTICLE}`,
})

function deps(over: Partial<IngestDeps> = {}): IngestDeps {
  return { db, media, toMarkdown: toMd, ...over }
}

const bytes = (s: string): Uint8Array => new TextEncoder().encode(s)

beforeEach(() => {
  db = fakeDb()
  objects = new Map()
})

describe('رفعُ ملفّ', () => {
  it('النصُّ يُحفظ في R2 مع الأصل، والصفُّ upload بلا رابط Drive', async () => {
    const out = await ingestFile(deps(), 'org_owner', { name: 'ملاحظات.txt', type: 'text/plain', bytes: bytes(ARTICLE) })
    expect(out.kind).toBe('added')
    const row = db.raw.prepare("SELECT kind, mime, file_key, text_key, origin_url, org_id FROM sources").get() as Record<string, string | null>
    expect(row).toMatchObject({ kind: 'upload', mime: 'text/plain', origin_url: null, org_id: 'org_owner' })
    expect(objects.get(row['text_key']!)).toBe(ARTICLE)
    expect(objects.has(row['file_key']!)).toBe(true)
  })

  it('الملفُّ نفسُه مرّتين مصدرٌ واحد — ولا تحويلَ ثانٍ', async () => {
    let converted = 0
    const counting: ToMarkdown = async (d) => { converted += 1; return toMd(d) }
    const file = { name: 'تقرير.pdf', type: 'application/pdf', bytes: bytes('%PDF-1.4 x') }
    expect((await ingestFile(deps({ toMarkdown: counting }), 'org_owner', file)).kind).toBe('added')
    expect((await ingestFile(deps({ toMarkdown: counting }), 'org_owner', file)).kind).toBe('exists')
    expect(converted).toBe(1)
    expect(db.raw.prepare('SELECT count(*) AS n FROM sources').get()).toEqual({ n: 1 })
  })

  it('PDF يُقرأ بـ toMarkdown ويُنزع منه قسمُ Metadata، ويُكتب صفرٌ في الدفتر', async () => {
    await ingestFile(deps(), 'org_owner', { name: 'تقرير.pdf', type: 'application/octet-stream', bytes: bytes('%PDF') })
    const key = (db.raw.prepare('SELECT text_key FROM sources').get() as { text_key: string }).text_key
    const text = objects.get(key) as string
    expect(text).not.toContain('Producer')
    expect(text).toContain('قيادة المحافظ')
    expect(db.raw.prepare('SELECT provider, operation, total FROM cost_ledger').get()).toEqual({ provider: 'workers-ai', operation: 'tomarkdown:pdf', total: 0 })
  })

  it('يردّ بسببه: صيغةٌ لا تُقرأ، وPDF ممسوح، وبلا قارئ، وفارغ', async () => {
    const no = async (name: string, d = deps(), content = 'x') => ingestFile(d, 'org_owner', { name, type: '', bytes: bytes(content) })
    expect(await no('صورة.exe')).toMatchObject({ kind: 'rejected', reason: expect.stringContaining('لا تُقرأ') })
    const scanned: ToMarkdown = async () => ({ format: 'markdown', data: '## Metadata\n- Producer=Scanner\n## Contents\n### Page 1\n' })
    expect(await no('ممسوح.pdf', deps({ toMarkdown: scanned }))).toMatchObject({ kind: 'rejected', reason: expect.stringContaining('ممسوحًا') })
    expect(await no('تقرير.docx', deps({ toMarkdown: undefined }))).toMatchObject({ kind: 'rejected', reason: expect.stringContaining('Workers AI') })
    expect(await no('فارغ.txt', deps(), '')).toMatchObject({ kind: 'rejected', reason: 'الملفّ فارغ.' })
    expect(db.raw.prepare('SELECT count(*) AS n FROM sources').get()).toEqual({ n: 0 })
    expect(objects.size).toBe(0)
  })
})

describe('رابطُ صفحة', () => {
  const page = (body: string, status = 200, type = 'text/html; charset=utf-8') =>
    (async () => new Response(body, { status, headers: { 'Content-Type': type } })) as unknown as typeof fetch

  it('يقبل https لموقعٍ عامّ وحدَه', () => {
    expect(parseLink('http://example.com')).toContain('https')
    expect(parseLink('https://127.0.0.1/x')).toBe('هذا العنوانُ ليس موقعًا عامًّا.')
    expect(parseLink('https://localhost/x')).toBe('هذا العنوانُ ليس موقعًا عامًّا.')
    expect(parseLink('https://a:b@example.com')).toContain('كلمةَ سرّ')
    expect(String(parseLink('https://example.com/a#b'))).toBe('https://example.com/a')
  })

  it('صفحةُ مقالٍ تُقرأ بعنوانها، ومرّةً ثانيةً بلا تغيير «موجودة»، وبنصٍّ جديدٍ تُحدَّث', async () => {
    const html = `<html><head><title>قيادة المحافظ &amp; الأثر</title></head><body><article>${ARTICLE}</article></body></html>`
    const first = await ingestLink(deps({ fetchImpl: page(html) }), 'org_owner', 'https://example.com/post')
    expect(first).toMatchObject({ kind: 'added', name: 'قيادة المحافظ & الأثر' })
    expect(db.raw.prepare('SELECT kind, origin_url FROM sources').get()).toEqual({ kind: 'url', origin_url: 'https://example.com/post' })
    expect((await ingestLink(deps({ fetchImpl: page(html) }), 'org_owner', 'https://example.com/post#top')).kind).toBe('exists')
    const changed: ToMarkdown = async () => ({ format: 'markdown', data: `${ARTICLE} وفقرةٌ أُضيفت.` })
    expect((await ingestLink(deps({ fetchImpl: page(html), toMarkdown: changed }), 'org_owner', 'https://example.com/post')).kind).toBe('updated')
    expect(db.raw.prepare('SELECT count(*) AS n FROM sources').get()).toEqual({ n: 1 })
  })

  it('صفحةٌ هزيلةٌ تُسأل عنها المتصفّح، وتُسجَّل مدّتُه في الدفتر', async () => {
    const calls: string[] = []
    const net = (async (input: RequestInfo | URL) => {
      const url = String(input)
      calls.push(url)
      if (url.includes('browser-rendering/markdown')) {
        return new Response(JSON.stringify({ success: true, result: ARTICLE }), { headers: { 'Content-Type': 'application/json', 'X-Browser-Ms-Used': '3600' } })
      }
      return new Response('<html><head><title>تطبيق</title></head><body><div id="root"></div></body></html>', { headers: { 'Content-Type': 'text/html' } })
    }) as unknown as typeof fetch
    const thin: ToMarkdown = async () => ({ format: 'markdown', data: '# تطبيق' })
    const out = await ingestLink(deps({ fetchImpl: net, toMarkdown: thin, browser: { accountId: 'acc', token: 'tok' } }), 'org_owner', 'https://app.example.com')
    expect(out.kind).toBe('added')
    expect(calls[1]).toBe('https://api.cloudflare.com/client/v4/accounts/acc/browser-rendering/markdown')
    const row = db.raw.prepare('SELECT provider, operation, units FROM cost_ledger').get()
    expect(row).toEqual({ provider: 'cloudflare-browser', operation: 'browser:markdown', units: 3600 })
  })

  it('ويردّ بسببه: بلا متصفّح، وخلف دخول، ونوعٌ لا يُقرأ', async () => {
    const thin: ToMarkdown = async () => ({ format: 'markdown', data: '# فارغ' })
    expect(await ingestLink(deps({ fetchImpl: page('<div></div>'), toMarkdown: thin }), 'org_owner', 'https://x.example.com'))
      .toMatchObject({ kind: 'rejected', reason: expect.stringContaining('CF_BROWSER_TOKEN') })
    expect(await ingestLink(deps({ fetchImpl: page('', 403) }), 'org_owner', 'https://x.example.com'))
      .toMatchObject({ kind: 'rejected', reason: expect.stringContaining('تسجيل دخول') })
    expect(await ingestLink(deps({ fetchImpl: page('{}', 200, 'application/json') }), 'org_owner', 'https://x.example.com'))
      .toMatchObject({ kind: 'rejected', reason: expect.stringContaining('application/json') })
    expect(db.raw.prepare('SELECT count(*) AS n FROM sources').get()).toEqual({ n: 0 })
  })
})

describe('مساعدات', () => {
  it('عنوانُ og:title يغلب <title>، والفارغُ null', () => {
    expect(pageTitle('<meta property="og:title" content="أ"><title>ب</title>')).toBe('أ')
    expect(pageTitle('<title>  </title>')).toBeNull()
  })
  it('تنظيفُ التحويل يُبقي المحتوى وحدَه', () => {
    expect(cleanConverted('# f.pdf\n## Metadata\n- A=1\n- B=2\n## Contents\n### Page 1\nنصّ')).toBe('# f.pdf\n### Page 1\nنصّ')
  })
})

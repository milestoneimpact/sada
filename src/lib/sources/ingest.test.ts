/** مصادرُ من غير Drive (D-284): الرفعُ والرابط، بقاعدةٍ حقيقيّة وR2 وشبكةٍ مزيّفين. */
import { beforeEach, describe, expect, it } from 'vitest'
import { fakeDb, type FakeDb } from '../../test/fakes'
import { captionText, cleanCaptions, cleanConverted, ingestFile, ingestLink, pageTitle, parseLink, siteLinks, videoId, type IngestDeps, type ToMarkdown } from './ingest'

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

/*
 * ‏(D-318) كان الرابطُ يُفحص في أوّله وحده ثمّ يُتبَع تحويلُه من تحت `fetch` (`redirect: 'follow'`): صفحةٌ عامّةٌ تردّ ‏302 إلى
 * ‏عنوانٍ داخليٍّ تصل إليه. فصار التحويلُ يُتبَع يدًا، خمسَ قفزاتٍ على الأكثر، وكلُّ قفزةٍ تُفحص كما تُفحص الأولى.
 */
describe('رابطُ صفحة — التحويلُ يُفحص في كلّ قفزة (D-318)', () => {
  const ARTICLE_HTML = `<html><head><title>مقال</title></head><body><p>${ARTICLE}</p></body></html>`

  /** شبكةٌ تتبع التحويلَ بنفسها ما لم يُطلب `manual` — كما يفعل `fetch` في Workers. */
  function chain(hops: Record<string, string>): { net: typeof fetch; seen: string[]; modes: (string | undefined)[] } {
    const seen: string[] = []
    const modes: (string | undefined)[] = []
    const net = (async (input: RequestInfo | URL, init?: RequestInit) => {
      let url = String(input)
      modes.push(init?.redirect)
      for (let i = 0; i < 20; i += 1) {
        seen.push(url)
        const next = hops[url]
        if (next === undefined) break
        if (init?.redirect === 'manual') return new Response(null, { status: 302, headers: { Location: next } })
        url = new URL(next, url).toString()
      }
      return new Response(ARTICLE_HTML, { headers: { 'Content-Type': 'text/html' } })
    }) as unknown as typeof fetch
    return { net, seen, modes }
  }

  it('تحويلٌ إلى عنوانٍ داخليٍّ يُردّ ولا يُنادى — ولو بكتابةٍ ستّ عشريّة أو مُعيَّنةِ IPv4', async () => {
    for (const inner of ['https://169.254.169.254/latest/meta-data', 'https://0x7f.1/admin', 'https://[::ffff:10.0.0.1]/x', 'http://example.org/a', 'https://localhost/']) {
      const { net, seen } = chain({ 'https://example.com/post': inner })
      const out = await ingestLink(deps({ fetchImpl: net }), 'org_owner', 'https://example.com/post')
      expect(out, inner).toMatchObject({ kind: 'rejected' })
      expect(seen, inner).toEqual(['https://example.com/post'])
    }
    expect(db.raw.prepare('SELECT count(*) AS n FROM sources').get()).toEqual({ n: 0 })
  })

  it('والتحويلُ العامُّ يُتبَع يدًا — نسبيًّا على ما سبقه — حتّى خمس قفزات', async () => {
    const { net, seen, modes } = chain({
      'https://example.com/a': '/b',
      'https://example.com/b': 'https://www.example.com/c',
    })
    expect((await ingestLink(deps({ fetchImpl: net }), 'org_owner', 'https://example.com/a')).kind).toBe('added')
    expect(seen).toEqual(['https://example.com/a', 'https://example.com/b', 'https://www.example.com/c'])
    expect(new Set(modes)).toEqual(new Set(['manual']))
  })

  it('والسادسةُ تُردّ', async () => {
    const hops: Record<string, string> = {}
    for (let i = 0; i < 6; i += 1) hops[`https://example.com/${i}`] = `https://example.com/${i + 1}`
    const { net, seen } = chain(hops)
    expect(await ingestLink(deps({ fetchImpl: net }), 'org_owner', 'https://example.com/0'))
      .toMatchObject({ kind: 'rejected', reason: expect.stringContaining('خمس') })
    expect(seen).toHaveLength(6)
  })
})



/** ‏مصادرُ D-327: الموقعُ كاملًا، ورابطُ المقطع، وملفُّ الترجمة. */
describe('رابطُ موقعٍ ورابطُ مقطعٍ وملفُّ ترجمة (D-327)', () => {
  const htmlRes = (body: string): Response => new Response(body, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  /** شبكةٌ مزيّفة: عنوانٌ إلى جوابه، وما سواه ٤٠٤ — وتُسجَّل العناوينُ المطلوبة. */
  function net(pages: Record<string, () => Response>): { fetchImpl: typeof fetch; asked: string[] } {
    const asked: string[] = []
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input)
      asked.push(url)
      return (pages[url] ?? (() => new Response('لا', { status: 404 })))()
    }) as typeof fetch
    return { fetchImpl, asked }
  }
  const body = (t: string): string => `<html><head><title>${t}</title></head><body><p>${'نصُّ ' + t + ' بما يكفي ليُبنى عليه منشورٌ يُقرأ. '.repeat(30)}</p></body></html>`

  it('روابطُ الرئيسيّة: المضيفُ نفسُه، والتعريفيُّ أوّلًا، وبلا دخولٍ ولا خصوصيّةٍ ولا مضيفٍ آخر', () => {
    const home = new URL('https://example.org/')
    const html = `<a href="/blog/2024/long/path">عميق</a><a href="/news">أخبار</a><a href="https://other.org/about">غريب</a>
      <a href="/login">دخول</a><a href="/privacy">خصوصيّة</a><a href="/about#team">من نحن</a><a href="/about">مكرَّر</a><a href="/services/">خدمات</a><a href="#top">أعلى</a>`
    expect(siteLinks(html, home).map((u) => u.pathname)).toEqual(['/about', '/services/', '/news'])
  })

  it('جذرُ الموقع يُقرأ مع صفحاته التعريفيّة مصدرًا واحدًا، وصفحةٌ تعذّرت لا تُسقطه', async () => {
    const { fetchImpl, asked } = net({
      'https://example.org/': () => htmlRes(`<html><head><title>مؤسّسة الأثر</title></head><body><p>${'رئيسيّةُ المؤسّسة وما تعمل عليه في قياس الأثر. '.repeat(12)}</p>
        <a href="/about">من نحن</a><a href="/services">خدماتنا</a><a href="/gone">صفحةٌ زالت</a></body></html>`),
      'https://example.org/about': () => htmlRes(body('من نحن')),
      'https://example.org/services': () => htmlRes(body('خدماتنا')),
    })
    const out = await ingestLink(deps({ toMarkdown: undefined, fetchImpl }), 'org_owner', 'https://example.org')
    expect(out).toMatchObject({ kind: 'added', name: 'مؤسّسة الأثر' })
    expect(asked).toEqual(['https://example.org/', 'https://example.org/about', 'https://example.org/services', 'https://example.org/gone'])
    const text = objects.get((db.raw.prepare('SELECT text_key FROM sources').get() as { text_key: string }).text_key) as string
    for (const part of ['## مؤسّسة الأثر', '## من نحن', '## خدماتنا', 'نصُّ خدماتنا']) expect(text).toContain(part)
    expect(db.raw.prepare('SELECT count(*) AS n FROM sources').get()).toEqual({ n: 1 })
  })

  it('رابطُ مقالٍ (ليس جذرًا) يُقرأ وحدَه — لا زحفَ على الموقع', async () => {
    const { fetchImpl, asked } = net({ 'https://example.org/blog/post': () => htmlRes(body('المقال') + '<a href="/about">من نحن</a>') })
    expect((await ingestLink(deps({ toMarkdown: undefined, fetchImpl }), 'org_owner', 'https://example.org/blog/post')).kind).toBe('added')
    expect(asked).toEqual(['https://example.org/blog/post'])
  })

  it('معرّفُ المقطع من صيغ الرابط، وما ليس مقطعًا null', () => {
    const id = (u: string): string | null => videoId(new URL(u))
    expect(id('https://www.youtube.com/watch?v=jNQXAC9IVRw&t=3')).toBe('jNQXAC9IVRw')
    expect(id('https://youtu.be/jNQXAC9IVRw')).toBe('jNQXAC9IVRw')
    expect(id('https://m.youtube.com/shorts/jNQXAC9IVRw')).toBe('jNQXAC9IVRw')
    expect(id('https://www.youtube.com/channel/abc')).toBeNull()
    expect(id('https://example.org/watch?v=jNQXAC9IVRw')).toBeNull()
  })

  it('مسارُ الترجمة يُقرأ JSON وXML، والمكرَّرُ مرّةً', () => {
    expect(captionText(JSON.stringify({ events: [{ segs: [{ utf8: 'أهلًا ' }, { utf8: 'بكم' }] }, { segs: [{ utf8: 'أهلًا بكم' }] }, { segs: [{ utf8: 'في الحلقة' }] }, {}] })))
      .toBe('أهلًا بكم\nفي الحلقة')
    expect(captionText('<transcript><text start="0" dur="1">قيادةُ &amp;amp; قياس</text><text start="1" dur="1">الأثر</text></transcript>')).toBe('قيادةُ & قياس\nالأثر')
  })

  it('رابطُ مقطع: العنوانُ والوصفُ وما قيل فيه — والعربيّةُ المكتوبةُ قبل الآليّة — مصدرٌ واحدٌ بعنوانه القانونيّ', async () => {
    const tracks = JSON.stringify([
      { baseUrl: 'https://www.youtube.com/api/timedtext?v=abcdefghijk&lang=en&kind=asr', languageCode: 'en', kind: 'asr' },
      { baseUrl: 'https://www.youtube.com/api/timedtext?v=abcdefghijk&lang=ar', languageCode: 'ar' },
    ])
    const spoken = { events: Array.from({ length: 30 }, (_, i) => ({ segs: [{ utf8: `جملةٌ رقم ${i} ممّا قيل في المقطع عن قياس الأثر` }] })) }
    const { fetchImpl, asked } = net({
      'https://www.youtube.com/watch?v=abcdefghijk&hl=ar': () => htmlRes(`<title>حلقة الأثر - YouTube</title><script>var x={"title":"حلقةُ الأثر","shortDescription":"وصفٌ قصير\\nبسطرين","captionTracks":${tracks},"other":1}</script>`),
      'https://www.youtube.com/api/timedtext?v=abcdefghijk&lang=ar&fmt=json3': () => new Response(JSON.stringify(spoken), { headers: { 'Content-Type': 'application/json' } }),
    })
    const out = await ingestLink(deps({ fetchImpl }), 'org_owner', 'https://youtu.be/abcdefghijk?si=xyz')
    expect(out).toMatchObject({ kind: 'added', name: 'حلقةُ الأثر' })
    expect(asked[1]).toBe('https://www.youtube.com/api/timedtext?v=abcdefghijk&lang=ar&fmt=json3')
    const row = db.raw.prepare('SELECT origin_url, text_key FROM sources').get() as { origin_url: string; text_key: string }
    expect(row.origin_url).toBe('https://www.youtube.com/watch?v=abcdefghijk')
    const text = objects.get(row.text_key) as string
    for (const part of ['# حلقةُ الأثر', '## وصفُ المقطع', 'بسطرين', '## ما قيل في المقطع', 'جملةٌ رقم 29']) expect(text).toContain(part)
    // ‏والرابطُ نفسُه بصيغةٍ أخرى مصدرٌ واحد
    expect((await ingestLink(deps({ fetchImpl }), 'org_owner', 'https://www.youtube.com/watch?v=abcdefghijk')).kind).toBe('exists')
  })

  it('مقطعٌ بلا ترجمةٍ ولا وصفٍ كافٍ يُردّ بما يفعله المالك، ولا يُكتب مصدر', async () => {
    const { fetchImpl } = net({ 'https://www.youtube.com/watch?v=abcdefghijk&hl=ar': () => htmlRes('<title>مقطع - YouTube</title><script>var x={"shortDescription":"قصير"}</script>') })
    const out = await ingestLink(deps({ fetchImpl }), 'org_owner', 'https://www.youtube.com/watch?v=abcdefghijk')
    expect(out).toMatchObject({ kind: 'rejected' })
    expect((out as { reason: string }).reason).toContain('srt')
    expect(db.raw.prepare('SELECT count(*) AS n FROM sources').get()).toEqual({ n: 0 })
  })

  it('ملفُّ ترجمةٍ (srt · vtt) يُرفع نصًّا بلا أرقامٍ ولا مواقيت', async () => {
    expect(cleanCaptions('WEBVTT\n\n1\n00:00:01.000 --> 00:00:03.000\n<v عمر>أهلًا بكم</v>\n\n2\n00:00:03.000 --> 00:00:05.000\nأهلًا بكم\nفي الحلقة\n')).toBe('أهلًا بكم\nفي الحلقة')
    const srt = Array.from({ length: 12 }, (_, i) => `${i + 1}\n00:00:0${i % 9},000 --> 00:00:0${(i % 9) + 1},000\nسطرٌ رقم ${i} ممّا قيل في اللقاء عن الحوكمة`).join('\n\n')
    const out = await ingestFile(deps(), 'org_owner', { name: 'لقاء.srt', type: 'application/x-subrip', bytes: bytes(srt) })
    expect(out.kind).toBe('added')
    const text = objects.get((db.raw.prepare('SELECT text_key FROM sources').get() as { text_key: string }).text_key) as string
    expect(text).not.toContain('-->')
    expect(text.split('\n')[0]).toBe('سطرٌ رقم 0 ممّا قيل في اللقاء عن الحوكمة')
  })
})

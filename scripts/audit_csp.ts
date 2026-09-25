/**
 * حارسُ السياسة — **العيّنةُ تُفتَح خلف الترويسة نفسِها التي يراها المالك** (D-150).
 *
 * كلُّ مدقّقٍ قبل هذا فتح العيّنةَ من الملفّ، **والملفُّ بلا ترويسة**: فما
 * تمنعه `Content-Security-Policy` في الإنتاج كان يُرسَم في كلّ قياسٍ محلّيّ.
 * هكذا بقيت ‏١٥٦ سِمةَ `style=""` ممنوعةً على sada.basserh.com منذ D-039
 * وخضراءَ في كلّ حارس.
 *
 * ## ما يُقاس
 *
 * تُخدَم كلُّ عيّنةٍ من خادمٍ محلّيٍّ بترويسات `htmlHeaders()` بعينها (لا نسخةٍ
 * منها)، بعد أن يُعطى كلُّ `<script>` و`<style>` داخليٍّ الـ`nonce` الذي تحمله
 * الترويسة — لأنّ العيّنةَ تحمل `demoNonce123` ووسمَ أنماطٍ يحقنه
 * `writeAudited` للقياس وحدَه. ثمّ يُعَدّ كلُّ سطرِ «Refused …» يطبعه المتصفّح.
 * **والحدُّ صفر.**
 *
 *     npm run csp
 */
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { chromium } from 'playwright'
import { htmlHeaders } from '../src/lib/security/headers'

const NONCE = 'auditNonce0000'
const files = process.argv.slice(2)
if (files.length === 0) {
  console.error('usage: tsx scripts/audit_csp.ts <fixture.html> …')
  process.exit(2)
}

const pages = new Map(files.map((f, i) => [`/${i}`, f]))
/*
 * العيّنةُ تضمّن الخطوطَ `data:` لتُفتَح من الملفّ، والإنتاجُ يخدمها من أصله
 * (`font-src 'self'`). فتُنقَل هنا إلى مساراتٍ محلّيّة بدل أن تُفتَح السياسة.
 */
const fonts = new Map<string, Buffer>()
const server = createServer((req, res) => {
  const url = req.url ?? ''
  const font = fonts.get(url)
  if (font !== undefined) {
    res.writeHead(200, { 'Content-Type': 'font/woff2' }).end(font)
    return
  }
  const file = pages.get(url)
  if (file === undefined) {
    res.writeHead(404).end()
    return
  }
  const html = readFileSync(file, 'utf8')
    .replace(/nonce="[^"]*"/g, `nonce="${NONCE}"`)
    .replace(/<(script|style)(?![^>]*\bnonce=)(?![^>]*\bsrc=)/g, `<$1 nonce="${NONCE}"`)
    .replace(/data:font\/woff2;base64,([A-Za-z0-9+/=]+)/g, (_m, b64: string) => {
      const path = `/f/${fonts.size}.woff2`
      fonts.set(path, Buffer.from(b64, 'base64'))
      return path
    })
  const headers = { ...htmlHeaders(NONCE), 'Content-Type': 'text/html; charset=utf-8' }
  res.writeHead(200, headers).end(html)
})
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
const address = server.address()
const port = typeof address === 'object' && address !== null ? address.port : 0

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
let total = 0
for (const [path, file] of pages) {
  const page = await browser.newPage()
  const refused: string[] = []
  page.on('console', (m) => {
    const text = m.text()
    if (/Refused to|Content Security Policy/.test(text)) refused.push(text.split('\n')[0] ?? text)
  })
  await page.goto(`http://127.0.0.1:${port}${path}`, { waitUntil: 'load' })
  await page.waitForTimeout(200)
  const kinds = new Map<string, number>()
  for (const line of refused) {
    const kind = /Refused to ([a-z ]+?) (because|from|the)/.exec(line)?.[1] ?? 'other'
    kinds.set(kind, (kinds.get(kind) ?? 0) + 1)
  }
  const summary = [...kinds].map(([k, n]) => `${k}=${n}`).join(' ')
  console.log(`${refused.length === 0 ? 'ok  ' : 'FAIL'} ${file} refused=${refused.length}${summary ? ` (${summary})` : ''}`)
  if (refused.length > 0) console.log(`      ${(refused[0] ?? '').slice(0, 160)}`)
  total += refused.length
  await page.close()
}
await browser.close()
server.close()
console.log(total === 0 ? 'csp: لا شيءَ ممنوع' : `csp: ${total} ممنوعًا — يراه المالك مكسورًا ولا يراه أيُّ حارسٍ آخر`)
process.exit(total === 0 ? 0 : 1)

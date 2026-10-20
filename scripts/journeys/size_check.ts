/**
 * وزنُ صفحة اللوحة كما تصل (خطّة التصميم 11.5: ‏90KB أو أقلّ غيرَ مضغوط و‏25KB مضغوطًا للصفحة الأولى).
 *
 *     npx tsx scripts/journeys/size_check.ts
 */
import { gzipSync } from 'node:zlib'
import { chromium } from 'playwright'
import { CHROMIUM, startServer } from './server'
import { login } from './journeys'

const stack = await startServer({ port: 8792 })
const browser = await chromium.launch({ executablePath: CHROMIUM })
try {
  const page = await browser.newPage()
  await login(page, stack)
  for (const path of ['/panel', '/panel/library', '/panel/accounts', '/panel/settings', '/panel/analysis', '/panel/report', '/panel/tasks']) {
    const res = await page.request.get(`${stack.url}${path}`)
    const body = await res.body()
    const html = body.toString('utf8')
    const parts: Record<string, number> = {}
    for (const m of html.matchAll(/<section data-pane="([a-z]+)"/g)) {
      const next = html.indexOf('<section data-pane="', m.index! + 10)
      const end = next > 0 ? next : html.indexOf('<footer>', m.index!)
      parts[m[1]!] = Buffer.byteLength(html.slice(m.index!, end))
    }
    const cmdk = html.indexOf('id="cmdk"')
    console.log(JSON.stringify({ path, kb: +(body.length / 1024).toFixed(1), gzKb: +(gzipSync(body).length / 1024).toFixed(1),
      panes: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, +(v / 1024).toFixed(1)])),
      cmdkKb: cmdk < 0 ? 0 : +(Buffer.byteLength(html.slice(cmdk, html.indexOf('</dialog>', cmdk))) / 1024).toFixed(1) }))
  }
} finally {
  await browser.close()
  await stack.close()
}

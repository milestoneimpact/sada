/**
 * بصمةُ الأنماط المحسوبة — حَكَمُ إعادة ترتيب ورقة الأنماط (D-148).
 *
 * يرسم عيّناتِ `npm run render` في أربعة أنماط (‏١٤٤٠ نهاريًّا وليليًّا،
 * و‏٣٩٠، و‏٢٠٠٠) ويسجّل لكلّ عنصرٍ بصمةَ `getComputedStyle` كاملةً مع صندوقه.
 * فتُؤخذ بصمةٌ قبل التغيير وأخرى بعده وتُقارنان بـ`diff_snapshots.mjs`:
 * إن اختلف عنصرٌ في خاصّيّةٍ واحدة فالتغييرُ ليس إعادةَ ترتيب.
 *
 *   npm run render && node scripts/snapshot_styles.mjs /tmp/before.json
 *   … (التغيير) …
 *   npm run render && node scripts/snapshot_styles.mjs /tmp/after.json
 *   node scripts/diff_snapshots.mjs /tmp/before.json /tmp/after.json
 *
 * وبـ`full` وسيطًا ثالثًا تُحفَظ الخصائصُ نصًّا لا بصمةً (كبيرٌ، لصفحةٍ أو
 * اثنتين عبر `ONLY=panel@1440/light`). **وليس في `ci`**: دقيقتان ونصف ومتصفّح؛
 * يُشغَّل يدًا عند كلّ دمجٍ أو نقلٍ في `styles.ts`.
 */
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'
const out = process.argv[2]
if (!out) { console.error('الاستعمال: node scripts/snapshot_styles.mjs <out.json> [full]'); process.exit(2) }
const FULL = process.argv[3] === 'full'
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean)
const pages0 = ['panel','panel-first','screen-tasks','screen-wizard','screen-report','screen-linkedin','screen-refused','screen-journey','screen-spread','screen-login','screen-2fa','privacy','screen-x','screen-connected','screen-link-only','screen-unbuilt','login','login-err','2fa','doc']
const pages = ONLY.length ? pages0.filter((p) => ONLY.some((o) => o.split('@')[0] === p)) : pages0
const modes0 = [[1440,'light'],[1440,'dark'],[390,'light'],[2000,'light']]
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const snap = {}
for (const name of pages) {
  for (const [w, theme] of modes0) {
    if (ONLY.length && !ONLY.includes(`${name}@${w}/${theme}`)) continue
    const p = await b.newPage({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1 })
    await p.addInitScript((t) => { document.documentElement.dataset.theme = t }, theme)
    await p.goto(`file:///tmp/${name}.html`)
    await p.waitForTimeout(700)
    const rows = await p.evaluate((process_full) => {
      const skip = new Set(['accent-color','transition','transition-duration','transition-property','transition-timing-function','transition-delay'])
      const out = []
      const all = document.querySelectorAll('*')
      all.forEach((el, i) => {
        const cs = getComputedStyle(el)
        const parts = []
        for (let k = 0; k < cs.length; k++) { const p = cs[k]; if (!skip.has(p)) parts.push(p + ':' + cs.getPropertyValue(p)) }
        const r = el.getBoundingClientRect()
        const str = parts.join(';'); let h = 0x811c9dc5
        for (let c = 0; c < str.length; c++) { h ^= str.charCodeAt(c); h = Math.imul(h, 0x01000193) >>> 0 }
        out.push(i + ' ' + el.tagName + '.' + (el.className && el.className.baseVal === undefined ? el.className : '') + ' ' + [r.x,r.y,r.width,r.height].map(Math.round).join(',') + ' ' + h.toString(16) + (process_full ? ' ' + str : ''))
      })
      return out
    }, FULL)
    snap[`${name}@${w}/${theme}`] = rows
    await p.close()
  }
}
await b.close()
writeFileSync(out, JSON.stringify(snap))
console.log('pages', Object.keys(snap).length)

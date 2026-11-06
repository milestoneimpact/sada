/**
 * زرٌّ أوّليٌّ واحدٌ ظاهرٌ في كلّ منطقة (خطّة التصميم 7.1 · D-313).
 *
 * أزرارٌ أوّليّةٌ متجاورة تسأل المالكَ «أيُّها؟» (Hick)، وكانت خمسُ بطاقاتٍ تُظهر اثنين أو
 * أكثر معًا ولا يراها مدقّقٌ: التباينُ صحيح وهدفُ اللمس صحيح، والسؤالُ قائم. فيُعَدّ هنا
 * الأوّليُّ **الظاهرُ** في كلّ منطقة: المنطقةُ أقربُ بطاقةٍ أو صفٍّ (`li` و`article` و`tr`)،
 * (وصفُّ منشورٍ في الخطّ الزمنيّ `.np-row`)، والظاهرُ ما له موضعٌ في التخطيط وليس في طيّةٍ مغلقة. وتُفتح ألواحُ اللوحة لوحًا لوحًا
 * (المخفيُّ منها ليس ظاهرًا)، وأقسامُها كلُّها.
 *
 * **وما يكشفه السكربتُ بعد نقرةٍ لا يراه** (مراجعة D-313): يعدّ الحالَ المرسوم؛ وحالُ «اضبط رمز التطبيق» مثبَّتٌ
 * في `panelScript.test.ts`.
 *
 * **والحارسُ يُزرَع قبل أن يُصدَّق**: `--self-test` يزرع بطاقةً بزرّين فيُشترَط أن تُمسَك،
 * وقائمةً صفوفُها بزرٍّ لكلٍّ فيُشترَط ألّا تُمسَك (كلُّ صفٍّ منطقة)، وتمرّ الصفحةُ بلا زرعٍ نظيفة.
 *
 * الاستعمال: node scripts/audit_primary.mjs [--self-test] <ملف.html> [...]
 */
import { chromium } from 'playwright'
import { basename } from 'node:path'

const selfTest = process.argv.includes('--self-test')
const pages = process.argv.slice(2).filter((a) => a !== '--self-test')
if (pages.length === 0) {
  console.error('استعمال: audit_primary.mjs [--self-test] <ملف.html> [...]')
  process.exit(2)
}

/** تُنقَل إلى المتصفّح نصًّا: المناطقُ التي تُظهر زرّين أوّليّين أو أكثر معًا. */
const PROBE = () => {
  // ‏والصفُّ منطقة: عنصرُ قائمةٍ أو مقالٌ أو صفُّ جدولٍ أو صفُّ منشورٍ في الخطّ الزمنيّ (`.np-row`)
  const regionOf = (el) => el.closest('li, article, tr, .card, .np-row') ?? el.closest('section, main') ?? document.body
  const label = (el) => {
    const h = el.querySelector('h1, h2, h3, summary, b')
    const t = (h ? h.textContent : el.textContent) ?? ''
    return `${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).trim().split(/\s+/)[0] : ''} «${t.trim().replace(/\s+/g, ' ').slice(0, 28)}»`
  }
  // ‏ورأسُ الطيّة (`summary`) يُرى وطيّتُه مغلقة: يُبدأ الفحصُ من خارج طيّته هو
  const visible = (b) => {
    const from = b.tagName === 'SUMMARY' ? b.parentElement?.parentElement : b
    return b.offsetParent !== null && getComputedStyle(b).visibility !== 'hidden' && (from?.closest('details:not([open])') ?? null) === null
  }
  const seen = new Map()
  for (const b of document.querySelectorAll('.btn-primary')) {
    if (!visible(b)) continue
    const r = regionOf(b)
    if (!seen.has(r)) seen.set(r, [])
    seen.get(r).push((b.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 24))
  }
  return [...seen].filter(([, btns]) => btns.length >= 2).map(([r, btns]) => `${label(r)}: ${btns.join(' ‖ ')}`)
}

const browser = await chromium.launch()

/** يفتح الألواحَ لوحًا لوحًا ويجمع الملاحظات بأسماء ألواحها. */
async function audit(page) {
  const panes = await page.evaluate(() => [...document.querySelectorAll('section[data-pane]')].map((s) => s.dataset.pane))
  const notes = []
  for (const id of panes.length > 0 ? panes : [null]) {
    if (id !== null) {
      await page.evaluate((id) => {
        document.querySelectorAll('section[data-pane]').forEach((s) => { s.hidden = s.dataset.pane !== id })
        document.querySelectorAll('[data-sub]').forEach((s) => { s.hidden = false })
      }, id)
    }
    for (const n of await page.evaluate(PROBE)) notes.push(id === null ? n : `[${id}] ${n}`)
  }
  return notes
}

if (selfTest) {
  const base = pages[0]
  const BTN = (t) => `<button class="btn btn-primary" type="button">${t}</button>`
  const plants = [
    ['بلا زرع', '', (n) => n.length === 0],
    ['بطاقةٌ بزرّين أوّليّين', `<div class="card"><h2>زرع</h2>${BTN('أ')}${BTN('ب')}</div>`, (n) => n.length === 1 && n[0].includes('أ ‖ ب')],
    ['قائمةٌ صفوفُها بزرٍّ لكلٍّ (كلُّ صفٍّ منطقة)', `<div class="card"><ul><li>${BTN('أ')}</li><li>${BTN('ب')}</li></ul></div>`, (n) => n.length === 0],
    ['زرّان أحدُهما في طيّةٍ مغلقة', `<div class="card">${BTN('أ')}<details><summary>أكثر</summary>${BTN('ب')}</details></div>`, (n) => n.length === 0],
    ['زرٌّ ورأسُ قائمةٍ أوّليّان (رأسُ الطيّة يُرى)', `<div class="card"><h2>زرع</h2>${BTN('أ')}<details class="menu"><summary class="btn btn-primary">ب</summary><div>ج</div></details></div>`, (n) => n.length === 1 && n[0].includes('أ ‖ ب')],
  ]
  let missed = 0
  for (const [name, html, ok] of plants) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    await page.goto(`file://${base}`)
    await page.evaluate((h) => { (document.querySelector('main') ?? document.body).insertAdjacentHTML('beforeend', h) }, html)
    await page.waitForTimeout(100)
    // ‏الزرعُ خارج الألواح فيُرى مع كلّ لوح: يُعدّ مرّةً بلا اسم لوحه
    const found = [...new Set((await audit(page)).map((n) => n.replace(/^\[[^\]]+\] /, '')))]
    const caught = ok(html === '' ? found : found.filter((n) => /«زرع»|أ ‖ ب/.test(n)))
    if (!caught) missed += 1
    console.log(`  ${caught ? '✓' : '✕'} ${name}`)
    await page.close()
  }
  if (missed > 0) {
    await browser.close()
    console.log(`\n✕ self-test: ${missed} من ${plants.length} لم يقع كما يجب`)
    process.exit(1)
  }
  console.log(`✓ self-test: ${plants.length - 1} مزروعًا حُكم عليه كما يجب، والصفحةُ بلا زرعٍ نظيفة`)
}

let total = 0
for (const file of pages) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  await page.goto(`file://${file}`)
  await page.waitForTimeout(150)
  const notes = await audit(page)
  await page.close()
  total += notes.length
  console.log(`\n═══ ${basename(file)} ═══`)
  if (notes.length === 0) console.log('  ✓ زرٌّ أوّليٌّ واحد في كلّ منطقة')
  for (const n of notes) console.log(`  ✕ زرّان أوّليّان ظاهران معًا — ${n}`)
}
await browser.close()
console.log(`\nالمجموع: ${total} ${total === 1 ? 'منطقة' : 'مناطق'} بأكثر من زرٍّ أوّليّ`)
process.exit(total === 0 ? 0 : 1)

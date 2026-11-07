/**
 * زرٌّ معطَّلٌ يقول لماذا، **نصًّا يُرى** (خطّة التصميم 7.1 · D-325).
 *
 * عقدُ العُدّة (`components/button.ts`، D-189): المعطَّلُ `aria-disabled` وسببُه سطرٌ تحته مربوطٌ بـ`aria-describedby`،
 * **فزرٌّ رماديٌّ بلا سبب يُضغَط مرّاتٍ ثمّ يُترَك**. لكنّ العقدَ في دالّة، والوسمُ المكتوبُ باليد يتخطّاه: قاس تقييمُ النضج
 * ثمانيةَ أزرارٍ معطَّلةٍ بـ`disabled` الأصليّ بلا سبب («ثبّت الخطّة» في مراجعة الخطّة، وأزرارُ الصورة والفيديو في المسوّدة،
 * وأزرارُ الدخول حين يُوقَف)، وواحدًا سببُه في تلميحٍ على زرٍّ لا يأخذ التركيز فلا تصله لوحةُ المفاتيح. ولا حارسَ يعدّها:
 * `audit_primary` يعدّ الأوّليّ، وaxe يقبل الزرَّ المعطَّل بلا وصف.
 *
 * **فالقاعدة**: كلُّ زرٍّ ظاهرٍ معطَّلٍ (`:disabled` أو `aria-disabled="true"` لغير المشغول) له `aria-describedby` يشير إلى
 * عنصرٍ **موجودٍ ظاهرٍ بنصٍّ** — لا مخفيٍّ (`.vh` أو `hidden` أو في طيّةٍ مغلقة) ولا فارغ ولا تلميح. ويُقاس على كلّ عيّنةٍ
 * مرسومةٍ مرّتين: كما تُفتح، ثمّ وكلُّ طيّةٍ فيها مفتوحة؛ وتُفتح ألواحُ اللوحة لوحًا لوحًا كما في `audit_primary`.
 *
 * **ووجهٌ ثانٍ لكلّ عيّنة: بلا شبكةٍ ولا مفاتيح مرور** (مراجعة D-325). الوسمُ الساكنُ لا يرى ما يعطّله السكربت: عند انقطاع
 * الشبكة يُعطَّل كلُّ زرّ إرسالٍ وكان سببُه `title` وحدَه، وزرُّ مفتاح المرور في متصفّحٍ بلا WebAuthn معطَّلٌ وسببُه في
 * `#pk-note` بلا ربط — ولم يقسهما شيء. فتُفتح العيّنةُ ثانيةً وقد مُحي `PublicKeyCredential` قبل سكربتها وقُطعت الشبكة،
 * ثمّ يُقاس كلُّ ما سبق. **وأزرارُ الوسم المهرَّب** تُعَدّ كذلك: `&lt;button` أو `&lt;a class=&quot;btn` في الصفحة المرسومة
 * زرٌّ صار نصًّا لا يُضغط (زرُّ «أبواب الطرفيّة» بعد نقله إلى `button()` في قالب `html`).
 *
 * `--self-test` يزرع ستّةً قبل أن يُصدَّق: معطَّلٌ بلا سبب، وسببُه تلميح، وسببُه مخفيٌّ عن العين، وسببُه معرّفٌ لا عنصرَ له
 * (تُمسَك كلُّها)، ومعطَّلٌ بسببٍ ظاهر، ومشغولٌ (`aria-busy`) لا سببَ له (لا يُمسَكان)، والصفحةُ بلا زرعٍ نظيفة؛ وفي الوجه
 * الثاني زرَّ إرسالٍ يعطّله انقطاعُ الشبكة (يُعطَّل حقًّا، ولا يُمسَك ما دام موصوفًا، ويُمسَك إن نُزع وصفُه)؛ وزرًّا مهرَّبًا.
 *
 * الاستعمال: node scripts/audit_disabled.mjs [--self-test] <ملف.html> [...]
 */
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'

const selfTest = process.argv.includes('--self-test')
const pages = process.argv.slice(2).filter((a) => a !== '--self-test')
if (pages.length === 0) {
  console.error('استعمال: audit_disabled.mjs [--self-test] <ملف.html> [...]')
  process.exit(2)
}

/** تُنقَل إلى المتصفّح نصًّا: الأزرارُ المعطَّلةُ الظاهرةُ التي لا يُرى سببُها. */
const PROBE = () => {
  const folded = (el) => {
    for (let d = el.closest('details:not([open])'); d; d = d.parentElement?.closest('details:not([open])') ?? null) {
      if (!d.querySelector(':scope > summary')?.contains(el)) return true
    }
    return false
  }
  const shown = (el) => {
    if (folded(el) || el.closest('[hidden]')) return false
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none') return false
    const r = el.getBoundingClientRect()
    return r.width > 1 && r.height > 1
  }
  // ‏والسببُ «يُرى»: ظاهرٌ بنصٍّ، لا مقصوصٌ لقارئ الشاشة وحدَه (‏.vh بـ clip-path)
  const legible = (el) => {
    if (!shown(el)) return false
    for (let p = el; p; p = p.parentElement) {
      const cs = getComputedStyle(p)
      if (cs.clipPath !== 'none' && /inset\(50%/.test(cs.clipPath)) return false
    }
    return (el.textContent ?? '').trim().length > 1
  }
  const name = (b) => `«${((b.textContent || b.getAttribute('aria-label') || b.value) ?? '').trim().replace(/\s+/g, ' ').slice(0, 28)}»`
  const out = []
  for (const b of document.querySelectorAll('button, input[type=submit], input[type=button], [role=button], a.btn')) {
    const native = b.matches(':disabled')
    const aria = b.getAttribute('aria-disabled') === 'true' && b.getAttribute('aria-busy') !== 'true'
    if (!native && !aria) continue
    if (!shown(b)) continue
    const ids = (b.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean)
    if (ids.length === 0) { out.push(`${name(b)} معطَّلٌ${native ? ' (disabled)' : ''} بلا aria-describedby${b.hasAttribute('data-tip') ? ' — وسببُه في تلميح' : ''}`); continue }
    const targets = ids.map((id) => document.getElementById(id))
    if (targets.every((t) => t === null)) { out.push(`${name(b)} يصف بـ«${ids.join(' ')}» ولا عنصرَ بهذا المعرّف`); continue }
    if (!targets.some((t) => t !== null && legible(t))) out.push(`${name(b)} سببُه «${ids.join(' ')}» لا يُرى`)
  }
  return out
}

const browser = await chromium.launch()
const VIEW = { viewport: { width: 1440, height: 1000 } }

/** زرٌّ مهرَّب: وسمُه نصٌّ في الصفحة المرسومة — يُرى ولا يُضغط. */
const ESCAPED = /&lt;(?:button\b|a class=&quot;btn\b|small class=&quot;btn-why)/g
const escapedButtons = (text) => (text.match(ESCAPED) ?? []).length

/**
 * يفتح العيّنةَ في وجهها: كما تُرسَم، أو **بلا شبكةٍ ولا مفاتيح مرور** — `PublicKeyCredential` يُمحى قبل كلّ سكربت، ثمّ تُقطع
 * الشبكة فيقع حدثُ «offline» كما يقع على الهاتف. ويعيد الصفحةَ وسياقَها ليُغلَقا.
 */
async function openFace(file, offline, plant = '') {
  const ctx = await browser.newContext(VIEW)
  if (offline) await ctx.addInitScript(() => { try { delete window.PublicKeyCredential } catch { /* ‏لا شيء */ } })
  const page = await ctx.newPage()
  await page.goto(`file://${file}`)
  if (plant !== '') await page.evaluate((h) => { (document.querySelector('main') ?? document.body).insertAdjacentHTML('beforeend', h) }, plant)
  if (offline) await ctx.setOffline(true)
  await page.waitForTimeout(offline ? 250 : 150)
  return { page, ctx }
}

/** يفتح الألواحَ لوحًا لوحًا، ثمّ يفتح الطيّاتِ كلَّها ويعيد — ويجمع الملحوظات بأسماء ألواحها. */
async function audit(page) {
  const panes = await page.evaluate(() => [...document.querySelectorAll('section[data-pane]')].map((s) => s.dataset.pane))
  const notes = new Set()
  for (const unfold of [false, true]) {
    if (unfold) await page.evaluate(() => { document.querySelectorAll('details').forEach((d) => { d.open = true }) })
    for (const id of panes.length > 0 ? panes : [null]) {
      if (id !== null) {
        await page.evaluate((id) => {
          document.querySelectorAll('section[data-pane]').forEach((s) => { s.hidden = s.dataset.pane !== id })
          document.querySelectorAll('[data-sub]').forEach((s) => { s.hidden = false })
        }, id)
      }
      for (const n of await page.evaluate(PROBE)) notes.add(id === null ? n : `[${id}] ${n}`)
    }
  }
  return [...notes]
}

if (selfTest) {
  const base = pages[0]
  const plants = [
    ['بلا زرع', '', (n) => n.length === 0],
    ['معطَّلٌ بلا سبب', '<div class="card"><button class="btn btn-secondary" type="submit" disabled>زرعأ</button></div>', (n) => n.length === 1],
    ['وسببُه تلميحٌ على زرٍّ لا يأخذ التركيز', '<div class="card"><button class="btn btn-secondary" disabled data-tip="لأنّ">زرعب</button></div>', (n) => n.length === 1 && n[0].includes('تلميح')],
    ['وسببُه مخفيٌّ عن العين', '<div class="card"><button class="btn btn-secondary" aria-disabled="true" aria-describedby="zr-c">زرعج</button><span class="vh" id="zr-c">لأنّ المزوّد غير جاهز</span></div>', (n) => n.length === 1],
    ['وسببُه معرّفٌ لا عنصرَ له', '<div class="card"><button class="btn btn-secondary" disabled aria-describedby="zr-missing">زرعد</button></div>', (n) => n.length === 1],
    ['معطَّلٌ بسببٍ ظاهر', '<div class="card"><button class="btn btn-secondary" disabled aria-describedby="zr-e">زرعه</button><small class="btn-why" id="zr-e">اعتمد بندًا أوّلًا</small></div>', (n) => n.length === 0],
    ['مشغولٌ بلا سبب (الدوّارةُ تقول حالَه)', '<div class="card"><button class="btn btn-secondary" aria-busy="true" aria-disabled="true">زرعو</button></div>', (n) => n.length === 0],
  ]
  let missed = 0
  for (const [label, html, ok] of plants) {
    const { page, ctx } = await openFace(base, false, html)
    const found = [...new Set((await audit(page)).map((n) => n.replace(/^\[[^\]]+\] /, '')))]
    const caught = ok(html === '' ? found : found.filter((n) => n.includes('زرع')))
    if (!caught) missed += 1
    console.log(`  ${caught ? '✓' : '✕'} ${label}`)
    await ctx.close()
  }
  // ‏والوجهُ الثاني: زرُّ إرسالٍ يعطّله انقطاعُ الشبكة — يُعطَّل حقًّا (فالوجهُ لا يمرّ فارغًا)، ولا يُمسَك ما دام موصوفًا بالشريط،
  // ‏ويُمسَك إن نُزع وصفُه (ما كان قبل المراجعة: سببُه «title» وحدَه)
  {
    const plant = '<div class="card"><form method="POST" action="/x"><button class="btn btn-secondary" type="submit" id="zr-off">زرعز</button></form></div>'
    const { page, ctx } = await openFace(base, true, plant)
    const disabled = await page.evaluate(() => document.getElementById('zr-off')?.disabled === true)
    const clean = (await audit(page)).filter((n) => n.includes('زرع')).length === 0
    await page.evaluate(() => { document.getElementById('zr-off')?.removeAttribute('aria-describedby') })
    const bare = (await audit(page)).filter((n) => n.includes('زرع')).length > 0
    const ok = disabled && clean && bare
    if (!ok) missed += 1
    console.log(`  ${ok ? '✓' : '✕'} بلا شبكة: زرُّ الإرسال يُعطَّل (${disabled}) موصوفًا بالشريط (${clean})، وبلا وصفه يُمسَك (${bare})`)
    await ctx.close()
  }
  {
    const ok = escapedButtons('<p>&lt;button class=&quot;btn btn-secondary&quot; type=&quot;submit&quot;&gt;</p>') === 1 &&
      escapedButtons('<p>&lt;a class=&quot;btn btn-sm&quot;</p><button class="btn">أ</button>') === 1 && escapedButtons('<p>&lt;b&gt;</p>') === 0
    if (!ok) missed += 1
    console.log(`  ${ok ? '✓' : '✕'} زرٌّ مهرَّبٌ في الصفحة يُعَدّ، والوسمُ الحقُّ لا يُعَدّ`)
  }
  if (missed > 0) {
    await browser.close()
    console.log(`\n✕ self-test: ${missed} من ${plants.length} لم يقع كما يجب`)
    process.exit(1)
  }
  console.log(`✓ self-test: ${plants.length - 1} مزروعًا حُكم عليه كما يجب، والصفحةُ بلا زرعٍ نظيفة، والوجهُ بلا شبكةٍ والزرُّ المهرَّب كما يجب`)
}

let total = 0
for (const file of pages) {
  const notes = []
  for (const offline of [false, true]) {
    const { page, ctx } = await openFace(file, offline)
    for (const n of await audit(page)) if (!notes.includes(n) && !notes.includes(`بلا شبكة: ${n}`)) notes.push(offline ? `بلا شبكة: ${n}` : n)
    await ctx.close()
  }
  const escaped = escapedButtons(readFileSync(file, 'utf8'))
  if (escaped > 0) notes.push(`${escaped} زرًّا مهرَّبًا: وسمُه نصٌّ في الصفحة («&lt;button» أو «&lt;a class=&quot;btn») — يُرى ولا يُضغط`)
  total += notes.length
  console.log(`\n═══ ${basename(file)} ═══`)
  if (notes.length === 0) console.log('  ✓ كلُّ زرٍّ معطَّلٍ ظاهرٍ سببُه نصٌّ يُرى (بالشبكة وبلاها)، ولا زرَّ مهرَّبًا')
  for (const n of notes) console.log(`  ✕ ${n}`)
}
await browser.close()
console.log(`\nالمجموع: ${total} ${total === 1 ? 'زرٌّ معطَّلٌ' : 'أزرارٍ معطَّلة'} بلا سببٍ يُرى`)
process.exit(total === 0 ? 0 : 1)

/**
 * تدقيقُ الألوان القسريّة — **وضعُ التباين العالي شاشةٌ لم يقسها مدقّق** (D-397).
 *
 * D-365 صحّح في هذا الوضع حدًّا سقط من كلّ زرّ ونصًّا اختفى عند التمرير، وقال
 * «ما لم يُبنَ: لقطةُ `forced-colors:active` آليّةٌ في `audit`». فهذه هي: كلُّ
 * شاشةٍ مصيَّرة تُفتح في Chromium بـ`emulateMedia({ forcedColors: 'active' })`
 * في النظامين الفاتح والداكن، وتُقاس ثلاثةُ أشياء — هندسةٌ وألوانٌ محسوبة لا حكم:
 *
 * | ما يُقاس | كيف |
 * |---|---|
 * | **النصُّ يُرى** | تباينُ كلِّ نصٍّ مرئيٍّ على أرضه المحسوبة ≥ ‏3:1 (الوضعُ يفرض ألوانَ النظام، فما دونه أرضٌ أو لونٌ هرب بـ`forced-color-adjust:none`) |
 * | **الحقلُ والزرُّ لهما حدّ** | `input/select/textarea/.btn` حدُّه أو خطُّه الخارجيّ ظاهرٌ بلونٍ غير لون أرضه، أو أرضُه نفسُها تخالف ما حوله — فالأرضُ تُمحى في هذا الوضع، وزرٌّ لا يُعرف إلّا بأرضه يصير كلمةً عائمة. `.btn-quiet` و`.btn-icon` بلا حدٍّ عمدًا (D-365: زرُّ نصٍّ وزرُّ أيقونة) فلا يُطالَبان |
 * | **التركيزُ يُرى** | كلُّ عنصرٍ يأخذ التركيز يُركَّز بلوحة المفاتيح فيُقاس `outline` (الظلُّ يُمحى في هذا الوضع): خطٌّ ظاهرٌ بعرضٍ ≥ ‏1px بلونٍ غير لون الأرض |
 *
 *     node scripts/audit_forced.mjs [--self-test] <ملف.html> [...]
 *
 * `--self-test` يزرع في الصفحة الأولى ثلاثَ تراجعاتٍ (نصٌّ بلون أرضه بعد
 * `forced-color-adjust:none`، وزرٌّ بلا حدٍّ يعرفه لونُ أرضه وحدَه، وحقلٌ
 * تركيزُه `outline:none` وظلّ) ويفشل إن نجا أحدُها، أو إن أُمسك شيءٌ بلا زرع.
 */
import { chromium } from 'playwright'

const selfTest = process.argv.includes('--self-test')
const files = process.argv.slice(2).filter((a) => a !== '--self-test')
if (files.length === 0) {
  console.error('الاستعمال: node scripts/audit_forced.mjs [--self-test] <ملفّ.html>…')
  process.exit(2)
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })

const PROBE = () => {
  const rgb = (v) => { const m = (v || '').match(/[\d.]+/g); return m && m.length >= 3 ? m.slice(0, 3).map(Number) : null }
  const alpha = (v) => { const m = (v || '').match(/[\d.]+/g); return m && m.length >= 4 ? Number(m[3]) : 1 }
  const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
  const contrast = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05) }
  const canvas = rgb(getComputedStyle(document.documentElement).backgroundColor) ?? rgb(getComputedStyle(document.body).backgroundColor) ?? [255, 255, 255]
  // ‏الأرضُ مركّبةً طبقةً فوق طبقة: Chromium يحاكي «Highlight» بشفافيّة ‏0.8، ونظامٌ حقيقيٌّ يرسمه صلبًا
  const groundOf = (el) => {
    const layers = []
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const bg = getComputedStyle(n).backgroundColor
      const c = rgb(bg)
      if (c && alpha(bg) > 0.05) { layers.push([c, alpha(bg)]); if (alpha(bg) > 0.99) break }
    }
    let g = canvas
    for (const [c, a] of layers.reverse()) g = g.map((v, i) => c[i] * a + v * (1 - a))
    return g
  }
  const seen = (el) => {
    const b = el.getBoundingClientRect()
    if (b.width <= 0 || b.height <= 0) return false
    const st = getComputedStyle(el)
    return st.visibility !== 'hidden' && Number(st.opacity) >= 0.15
  }
  const name = (el) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${String(el.className).split(/\s+/).slice(0, 2).join('.')}`.slice(0, 40)
  const notes = []

  // ١ · النصُّ يُرى
  for (const el of document.querySelectorAll('body *')) {
    if (!seen(el)) continue
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join('')
    if (own.length < 2) continue
    if (el.closest('.vh, [aria-hidden="true"]')) continue
    const st = getComputedStyle(el)
    const fg = rgb(st.color)
    if (fg === null || alpha(st.color) < 0.5) continue
    const v = contrast(fg, groundOf(el))
    if (v < 3) notes.push(`نصٌّ لا يُرى ${name(el)} — ${Math.round(v * 100) / 100}:1 «${own.slice(0, 20)}»`)
  }

  // ٢ · الحقلُ والزرُّ لهما حدّ
  const edge = (st, side) => Number.parseFloat(st[`border${side}Width`]) >= 1 && st[`border${side}Style`] !== 'none' && alpha(st[`border${side}Color`]) > 0.5 ? rgb(st[`border${side}Color`]) : null
  for (const el of document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]), select, textarea, .btn')) {
    if (!seen(el) || el.matches('.btn-quiet, .btn-icon')) continue
    const st = getComputedStyle(el)
    const around = groundOf(el.parentElement ?? el)
    const lines = ['Top', 'Right', 'Bottom', 'Left'].map((s) => edge(st, s)).filter((c) => c !== null && contrast(c, around) >= 3)
    const outline = st.outlineStyle !== 'none' && Number.parseFloat(st.outlineWidth) >= 1 && rgb(st.outlineColor) && contrast(rgb(st.outlineColor), around) >= 3
    const fill = alpha(st.backgroundColor) > 0.5 && rgb(st.backgroundColor) && contrast(rgb(st.backgroundColor), around) >= 3
    if (lines.length < 2 && !outline && !fill) notes.push(`أداةٌ بلا حدّ ${name(el)} «${(el.textContent || el.getAttribute('placeholder') || '').trim().slice(0, 20)}»`)
  }
  return notes
}

const FOCUSABLE = 'a[href], button:not(:disabled), input:not([type=hidden]):not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex]:not([tabindex="-1"])'

async function focusNotes(page) {
  const count = await page.evaluate((sel) => {
    const all = [...document.querySelectorAll(sel)].filter((el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0 && getComputedStyle(el).visibility !== 'hidden' })
    all.forEach((el, i) => { el.dataset.fcProbe = String(i) })
    return all.length
  }, FOCUSABLE)
  const notes = []
  // ‏لوحةُ المفاتيح أوّلًا، فيصير التركيزُ البرمجيُّ بعدها «focus-visible» كما يراه من يتنقّل بـTab
  await page.keyboard.press('Shift')
  for (let i = 0; i < count; i++) {
    const n = await page.evaluate((i) => {
      const el = document.querySelector(`[data-fc-probe="${i}"]`)
      if (!el) return null
      el.focus({ preventScroll: true })
      if (document.activeElement !== el) return null
      const rgb = (v) => { const m = (v || '').match(/[\d.]+/g); return m && m.length >= 3 ? m.slice(0, 3).map(Number) : null }
      const alpha = (v) => { const m = (v || '').match(/[\d.]+/g); return m && m.length >= 4 ? Number(m[3]) : 1 }
      const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
      const contrast = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05) }
      let ground = rgb(getComputedStyle(document.documentElement).backgroundColor) ?? [255, 255, 255]
      for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
        const bg = getComputedStyle(p).backgroundColor
        if (alpha(bg) > 0.85 && rgb(bg)) { ground = rgb(bg); break }
      }
      // ‏والحلقةُ قد تُرسم على «::after» الممدود فوق البطاقة (رابطُ البطاقة كلِّها، «.ch-go») — فتُقاس هناك أيضًا
      const ring = (st) => { const c = rgb(st.outlineColor); return st.outlineStyle !== 'none' && Number.parseFloat(st.outlineWidth) >= 1 && c !== null && alpha(st.outlineColor) > 0.5 && contrast(c, ground) >= 3 }
      const st = getComputedStyle(el)
      const ok = ring(st) || ring(getComputedStyle(el, '::after')) || ring(getComputedStyle(el, '::before'))
      el.blur()
      return ok ? null : `تركيزٌ لا يُرى ${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${String(el.className).split(/\s+/).slice(0, 2).join('.')} (outline: ${st.outlineStyle} ${st.outlineWidth}) «${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 20)}»`
    }, i)
    if (n) notes.push(n)
  }
  return notes
}

async function audit(file, scheme, plant = '') {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: scheme, forcedColors: 'active' })
  const page = await ctx.newPage()
  await page.goto(`file://${file}`)
  await page.emulateMedia({ forcedColors: 'active', colorScheme: scheme })
  if (plant !== '') await page.evaluate((h) => { const d = document.createElement('div'); d.innerHTML = h; (document.querySelector('main') ?? document.body).prepend(d) }, plant)
  // ‏الأقسامُ المطويّة تُفتح فيُقاس ما فيها
  await page.evaluate(() => { document.querySelectorAll('details').forEach((d) => { d.open = true }) })
  await page.waitForTimeout(150)
  const notes = [...await page.evaluate(PROBE), ...await focusNotes(page)]
  await ctx.close()
  return [...new Set(notes)]
}

if (selfTest) {
  const base = files[0]
  const plants = [
    ['بلا زرع', '', (n) => n.length === 0],
    ['نصٌّ بلون أرضه', '<p style="forced-color-adjust:none;background:#000;color:#111">زرعأ نصٌّ خافت</p>', (n) => n.length === 1 && n[0].startsWith('نصٌّ')],
    ['زرٌّ تعرفه أرضُه وحدها', '<button class="btn" style="border:0!important;outline:0">زرعب</button>', (n) => n.some((x) => x.startsWith('أداةٌ'))],
    ['حقلٌ تركيزُه ظلٌّ', '<style>#zr-c:focus{outline:none!important;box-shadow:0 0 0 3px blue}</style><input id="zr-c" placeholder="زرعج">', (n) => n.length === 1 && n[0].startsWith('تركيزٌ')],
  ]
  let missed = 0
  for (const [label, html, ok] of plants) {
    const all = await audit(base, 'light', html)
    const found = html === '' ? all : all.filter((n) => n.includes('زرع') || n.includes('zr-'))
    const caught = ok(found)
    if (!caught) { missed += 1; console.log(`      ${found.join(' | ') || '—'}`) }
    console.log(`  ${caught ? '✓' : '✕'} ${label}`)
  }
  if (missed > 0) {
    await browser.close()
    console.log(`\n✕ self-test: ${missed} من ${plants.length} لم يقع كما يجب`)
    process.exit(1)
  }
  console.log(`✓ self-test: ${plants.length - 1} تراجعاتٍ مزروعةً أُمسكت، والصفحةُ بلا زرعٍ نظيفة`)
  await browser.close()
  process.exit(0)
}

let failed = 0
for (const file of files) {
  for (const scheme of ['light', 'dark']) {
    const notes = await audit(file, scheme)
    failed += notes.length
    const label = `${file.split('/').pop()} · ألوانٌ قسريّة ${scheme === 'light' ? 'فاتحة' : 'داكنة'}`
    if (notes.length === 0) { console.log(`✓ ${label}`); continue }
    console.log(`\n═══ ${label} — ${notes.length} ═══`)
    for (const n of notes.slice(0, 12)) console.log(`  ✕ ${n}`)
  }
}
await browser.close()
console.log(`\nالمجموع: ${failed} ملحوظة`)
process.exit(failed > 0 ? 1 : 0)

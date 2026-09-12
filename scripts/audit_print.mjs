/**
 * تدقيقُ الطباعة — **الورقةُ شاشةٌ لم يقسها أحد** (D-125).
 *
 * طبقةُ `@media print` كُتبت في D-044 ولم تُشغَّل في مدقّقٍ قطّ: الوثيقةُ
 * تُطبَع لمراجعة المنصّة، والتقريرُ يُطبَع ليُقرأ على الورق. **وقاعدةٌ لا
 * تُرى إلّا حين يضغط أحدٌ «اطبع» قاعدةٌ بلا حارس.**
 *
 * ## ما يُقاس — وكلُّه هندسةٌ لا حكم
 *
 * | ما يُقاس | كيف | مصدرُه |
 * |---|---|---|
 * | **لا أداةَ على الورق** | الرافدةُ والشريطُ والأزرارُ والنماذجُ صندوقُها صفر | D-044 |
 * | **الرابطُ بعنوانه** | `a[href^=http]` له `::after` يحمل العنوان | WCAG 2.4.4 على الورق |
 * | **لا فيضانَ على A4** | `scrollWidth ≤ 794px` (‏٢١٠mm عند ‏٩٦dpi) | كالشاشة |
 * | **حبرٌ على ورقٍ أبيض** | تباينُ كلِّ نصٍّ مرئيٍّ محسوبا على أرض الطباعة | WCAG 1.4.3 |
 * | **الترويسةُ مع جسدها** | `h1..h3` تحمل `break-after:avoid` | D-044 |
 *
 * ## والليليُّ يُطبَع أيضا
 *
 * الورقُ أبيضُ في الثيمين، **والرموزُ لا تعرف الورق**: من يطبع من الثيم
 * الليليّ يحمل `--ink:#e8f1eb` إلى ورقٍ أبيض. فيُقاس الوضعان، والحبرُ
 * على أرض الطباعة لا على أرض الشاشة.
 *
 *     node scripts/audit_print.mjs /tmp/privacy.html /tmp/screen-report.html
 */
import { chromium } from 'playwright'

const A4 = 794
const files = process.argv.slice(2)
if (files.length === 0) {
  console.error('الاستعمال: node scripts/audit_print.mjs <ملفّ.html>…')
  process.exit(2)
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
let failed = 0

for (const file of files) {
  for (const theme of [null, 'dark']) {
    const page = await browser.newPage({ viewport: { width: A4, height: 1123 } })
    await page.goto(`file://${file}`)
    if (theme !== null) {
      await page.evaluate((t) => { document.documentElement.dataset.theme = t }, theme)
    }
    await page.emulateMedia({ media: 'print' })
    await page.waitForTimeout(400)

    const r = await page.evaluate(() => {
      const seen = (el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0 }
      const norm = (s) => s.replace(/\s+/g, ' ').trim()

      // ١ · أداةٌ تُطبَع
      const chrome = []
      for (const el of document.querySelectorAll('.rail, .topbar, .theme, .skip, nav.tabs, button, .btn, form, footer:not(.doc footer)')) {
        if (seen(el)) chrome.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 20)}`)
      }

      // ٢ · رابطٌ خارجيٌّ بلا عنوانه
      const bare = []
      for (const a of document.querySelectorAll('a[href^="http"]')) {
        if (!seen(a)) continue
        const after = getComputedStyle(a, '::after').content
        if (!after.includes('attr(href)') && !after.includes(a.getAttribute('href'))) {
          bare.push(norm(a.textContent).slice(0, 30))
        }
      }

      // ٣ · فيضان
      const overflow = document.documentElement.scrollWidth > window.innerWidth + 1

      // ٤ · حبرٌ على الورق — محسوبا
      const rgb = (v) => { const m = (v || '').match(/[\d.]+/g); return m && m.length >= 3 ? m.slice(0, 3).map(Number) : null }
      const alpha = (v) => { const m = (v || '').match(/[\d.]+/g); return m && m.length >= 4 ? Number(m[3]) : 1 }
      const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
      const contrast = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05) }
      const paper = rgb(getComputedStyle(document.body).backgroundColor) ?? [255, 255, 255]
      const groundOf = (el) => {
        for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
          const bg = getComputedStyle(n).backgroundColor
          if (alpha(bg) > 0.85) { const c = rgb(bg); if (c) return c }
        }
        return paper
      }
      const faint = []
      for (const el of document.querySelectorAll('body *')) {
        if (!seen(el)) continue
        const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join('')
        if (own.length < 2) continue
        const st = getComputedStyle(el)
        if (st.visibility === 'hidden' || Number(st.opacity) < 0.15) continue
        const fg = rgb(st.color)
        if (fg === null || alpha(st.color) < 0.5) continue
        const size = Number.parseFloat(st.fontSize)
        const min = size >= 18.66 || (Number(st.fontWeight) >= 700 && size >= 14) ? 3 : 4.5
        const v = contrast(fg, groundOf(el))
        if (v < min) faint.push({ cls: (el.className || el.tagName.toLowerCase()).toString().slice(0, 24), ratio: Math.round(v * 100) / 100, text: own.slice(0, 24) })
      }

      // ٥ · ترويسةٌ تنفصل عن جسدها
      const loose = []
      for (const h of document.querySelectorAll('h1, h2, h3')) {
        if (!seen(h)) continue
        const st = getComputedStyle(h)
        if (st.breakAfter !== 'avoid' && st.breakAfter !== 'avoid-page') loose.push(norm(h.textContent).slice(0, 24))
      }

      const bodyBg = getComputedStyle(document.body).backgroundColor
      return { chrome, bare, overflow, scrollWidth: document.documentElement.scrollWidth, faint, loose, paper: bodyBg }
    })
    await page.close()

    const issues = r.chrome.length + r.bare.length + (r.overflow ? 1 : 0) + r.faint.length + r.loose.length
    failed += issues
    console.log(`\n═══ ${file.split('/').pop()} · طباعة${theme === null ? '' : ' من الليليّ'} (${A4}px) ═══`)
    if (issues === 0) { console.log(`  ✓ نظيف · الورقُ ${r.paper}`); continue }
    if (r.chrome.length > 0) console.log(`  ✕ ${r.chrome.length} أداةً تُطبَع: ${[...new Set(r.chrome)].slice(0, 8).join(' · ')}`)
    if (r.bare.length > 0) console.log(`  ✕ ${r.bare.length} رابطا خارجيّا بلا عنوانه: ${r.bare.slice(0, 5).map((t) => `«${t}»`).join(' · ')}`)
    if (r.overflow) console.log(`  ✕ فيضانٌ أفقيّ: ${r.scrollWidth}px > ${A4}px`)
    if (r.faint.length > 0) {
      console.log(`  ✕ ${r.faint.length} نصّا دون حدّ التباين على الورق:`)
      for (const f of r.faint.slice(0, 8)) console.log(`      ${f.cls} — ${f.ratio}:1 «${f.text}»`)
    }
    if (r.loose.length > 0) console.log(`  ✕ ${r.loose.length} ترويسةً بلا break-after:avoid: ${r.loose.slice(0, 5).map((t) => `«${t}»`).join(' · ')}`)
  }
}
await browser.close()
console.log(`\nالمجموع: ${failed} ملحوظة`)
process.exit(failed > 0 ? 1 : 0)

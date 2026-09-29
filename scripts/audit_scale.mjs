#!/usr/bin/env node
/**
 * مدقّقُ السلّم — **يمسك ما يُبنى خارج النظام**.
 *
 * ## لماذا وُجد
 *
 * D-043 بنى سلّمَ حرفٍ ومسافة، **ثمّ لم تستعمله الأنماط**. وقيس ذلك
 * فوُجد: ‏٥٧ قياسَ حرفٍ حرفيّا في ‏١٦ قيمة، و‏١٠٦ مسافةً من ‏١٥٨ خارجَ
 * سلّم الأربعة، و‏١٢ نسبةَ سطر.
 *
 * **والرموزُ لا تنفع إن لم تُستعمَل.** ومدقّقُ التباين يفحص القيَم،
 * والمدقّقُ البصريّ يفحص الأحجام — **ولا واحدَ منهما يسأل: أهذا القياسُ
 * من السلّم أصلا؟**
 *
 * ## وما يُمسَك هنا لا تمسكه عينٌ
 *
 * الفرقُ بين ‏١٣ و‏١٣٫٥ لا يُرى، **ويُدرَك تشويشا لا رتبة** (قانون
 * Weber: ما دون ‏٥٪ لا يُقرأ فرقا). فثمانيةُ قياساتٍ متقاربةٍ تؤدّي عملَ
 * اثنين، وتكلّف قارئَها جهدَ فرزٍ بلا معنى.
 *
 * ويُقاس **من المتصفّح** لا من الشيفرة: قيمةٌ تصل بالوراثة أو بمحدّدٍ
 * لم يُصِب لا تظهر في `grep`. وهكذا كُشف أنّ `.card > h2` لا يصيب
 * `.card-head h2`، فورث ‏٢١px من المتصفّح.
 *
 * ## ومقاسان لا واحد (D-167)
 *
 * كان يرسم عند ‏١٤٤٠ وحدَه، **وشريطُ الجوّال لا يوجد عند ‏١٤٤٠**: لصائقُه
 * ‏١٠px وعدُّه ‏٩px — خارجَ السلّم كلِّه — ولم يرَهما مدقّقُ السلّم قطّ لأنّه
 * لم يفتح الشاشةَ التي يُرسَمان فيها. فصار يرسم ‏٣٩٠ بإصبعٍ كذلك: جوّالٌ
 * لمسيٌّ يلبس قواعدَ «pointer:coarse» و«max-width:720px» معًا.
 */
import { chromium } from 'playwright'

/** السلّمُ المعلَن — يقابل ما في `tokens.ts`. */
const FONTS = [11, 12.5, 14, 16, 20, 26, 42, 56]
const SPACES = [2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64]
const WEIGHTS = [400, 500, 600, 700]
const LEADS = [1.35, 1.7, 1.95]

const files = process.argv.slice(2)
if (files.length === 0) {
  console.error('الاستعمال: node scripts/audit_scale.mjs <ملفّ.html> …')
  process.exit(2)
}

/** الحاسوبُ بفأرة، والجوّالُ بإصبع — والثاني يلبس طبقةَ اللمس وشريطَ الإبهام. */
const VIEWS = [
  { label: '1440', viewport: { width: 1440, height: 1000 } },
  { label: '390', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
]

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
let failed = 0

for (const view of VIEWS) {
  const { label, ...options } = view
  const page = await browser.newPage(options)
  for (const file of files) {
    await page.goto(`file://${file}`)
    // ما هو مخفيٌّ لا يُقاس، وعللُه تبقى
    await page.evaluate(() => {
      document.querySelectorAll('section[data-pane]').forEach((s) => { s.hidden = false })
      document.querySelectorAll('details').forEach((d) => { d.open = true })
    })
    await page.waitForTimeout(400)

    const hits = await page.evaluate(({ FONTS, SPACES, WEIGHTS, LEADS }) => {
      const near = (v, list) => list.some((x) => Math.abs(x - v) < 0.26)
      const out = []

      // مَن أُعلن له هامشٌ `auto` في الورقة — يُجمَع مرّةً ثمّ يُستثنى
      const autoMargin = new Set()
      for (const sheet of document.styleSheets) {
        let rules
        try { rules = sheet.cssRules } catch { continue }
        for (const rule of rules) {
          if (rule.style === undefined) continue
          const declares = ['margin', 'margin-top', 'margin-bottom', 'margin-block-start']
            .some((p) => (rule.style.getPropertyValue(p) || '').includes('auto'))
          if (!declares) continue
          try {
            document.querySelectorAll(rule.selectorText).forEach((el) => autoMargin.add(el))
          } catch { /* محدّدٌ لا يُستعلَم به — يُتخطّى */ }
        }
      }
      for (const el of document.querySelectorAll('body *')) {
        const box = el.getBoundingClientRect()
        if (box.width === 0 || box.height === 0) continue
        const cs = getComputedStyle(el)
        const own = [...el.childNodes]
          .filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join('')
        const name = `${el.tagName.toLowerCase()}${el.className ? '.' + el.className : ''}`

        if (own.length > 1) {
          const fs = Math.round(parseFloat(cs.fontSize) * 10) / 10
          if (!near(fs, FONTS)) out.push(`${name} — قياسٌ خارج السلّم: ${fs}px «${own.slice(0, 20)}»`)
          const w = Number(cs.fontWeight)
          if (!WEIGHTS.includes(w)) out.push(`${name} — وزنٌ غيرُ محمَّل: ${w} «${own.slice(0, 20)}»`)
          const lh = parseFloat(cs.lineHeight) / parseFloat(cs.fontSize)
          // نسبةٌ محسوبةٌ من ارتفاعٍ بالبكسل تُستثنى: شبكةُ المسوّدة مقصودة
          if (Number.isFinite(lh) && lh > 1.05 && !near(lh, LEADS.map((x) => x))) {
            const r = Math.round(lh * 100) / 100
            if (!LEADS.some((x) => Math.abs(x - r) < 0.08)) {
              out.push(`${name} — نسبةُ سطرٍ خارج الثلاث: ${r}`)
            }
          }
        }
        for (const prop of ['marginTop', 'marginBottom', 'paddingTop', 'paddingBottom', 'gap']) {
          // **`auto` تُحسَب رقما**: getComputedStyle تحلّها إلى بكسل،
          // فلا تُعرَف منها. وهي ليست قرارَ مسافةٍ بل دفعٌ إلى الطرف —
          // فتُقرأ من الورقة نفسها لا من المحسوب
          if (autoMargin.has(el)) continue
          const v = Math.round(parseFloat(cs[prop]))
          if (v > 1 && !SPACES.includes(v)) out.push(`${name} — ${prop}: ${v}px`)
        }
      }
      return [...new Set(out)]
    }, { FONTS, SPACES, WEIGHTS, LEADS })

    console.log(`\n═══ ${file.split('/').pop()} @${label} ═══`)
    if (hits.length === 0) { console.log('  ✓ كلُّه من السلّم'); continue }
    failed += hits.length
    for (const h of hits.slice(0, 14)) console.log(`  ✕ ${h}`)
    if (hits.length > 14) console.log(`  … و${hits.length - 14} غيرُها`)
  }
  await page.close()
}

await browser.close()
console.log(`\nالمجموع: ${failed} خارجَ السلّم`)
process.exit(failed > 0 ? 1 : 0)

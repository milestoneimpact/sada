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
 * لمسيٌّ يلبس قواعدَ «pointer:coarse» وما دون «sm» و«md» معًا (D-187).
 *
 * ## والنمطُ لا الحجمُ وحده (D-185 · خطّة التصميم 4.3 و10.2)
 *
 * قِيس قبل المرحلة ١ فوُجد ثمانيةٌ وستّون نمطًا نصّيًّا (الحجمُ والسطرُ والوزنُ معًا)،
 * و‏٣٦٪ من الحروف تحت ‏١٤px، و‏٦٢٪ من النصوص ثخينة. **والسلّمُ صار قائمةً مغلقة**:
 * أربعةَ عشرَ نمطًا للحاسوب ومثلُها للجوّال، ووزنان. فيُسقط هذا المدقّق:
 *
 * | ما يُقاس | الحدّ |
 * |---|---|
 * | حجمٌ خارج الاثني عشر، أو تحت ‏١٣ | صفر |
 * | وزنٌ غيرُ ‏٤٠٠ و‏٦٠٠ | صفر |
 * | نمطٌ (حجم/سطر/وزن) خارج القائمة لعرضه | صفر |
 * | حروفٌ تحت ‏١٤px | ‏١٠٪ من حروف الصفحة أو أقلّ |
 * | فقرةٌ أو بندٌ يلتفّ سطرين و`max-width` له فوق ‏30em | صفر |
 * | نصٌّ تحت ‏١٥px بحبر `--ink-3` | صفر |
 *
 * ويطبع ولا يردّ: عددَ الأنماط، ونسبةَ الثخين (هدفُها ‏٣٥٪ في المرحلة ٢ مع المكوّنات).
 */
import { chromium } from 'playwright'

/** السلّمُ المعلَن — يقابل ما في `tokens.ts` (D-185): اتّحادُ سلّمَي الحاسوب والجوّال. */
const FONTS = [13, 14, 15, 16, 17, 18, 20, 22, 24, 28, 32, 40]
const SPACES = [2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64]
const WEIGHTS = [400, 600]

/**
 * الأنماطُ الأربعةَ عشر — «حجم/سطر/وزن» — لكلّ عرض (خطّة التصميم 4.3). **وقائمتان
 * لا واحدة**: ‏17/30/400 متنُ الجوّال، وعلى الحاسوب نمطٌ لا وجودَ له.
 */
const STYLES = {
  desktop: {
    display: '40/48/400', h1: '28/36/600', kpi: '28/36/400', h2: '22/30/600', h3: '18/26/600',
    body: '16/28/400', 'body-strong': '16/28/600', ui: '15/24/600', 'ui-regular': '15/24/400',
    input: '16/24/400', small: '14/24/400', 'small-strong': '14/24/600', caption: '13/20/600', code: '14/22/400',
  },
  mobile: {
    display: '32/40/400', h1: '24/32/600', kpi: '24/32/400', h2: '20/28/600', h3: '18/26/600',
    body: '17/30/400', 'body-strong': '17/30/600', ui: '16/24/600', 'ui-regular': '16/24/400',
    input: '16/24/400', small: '15/24/400', 'small-strong': '15/24/600', caption: '13/20/600', code: '14/22/400',
  },
}
/** الحروفُ تحت ‏١٤px — سقفٌ معلَنٌ ليُحرَس (خطّة التصميم 10.2؛ كانت ‏٣٦٪). */
const MAX_SMALL_SHARE = 0.10
/**
 * ‏**ويُحرَس على صفحةٍ فيها ما يُقاس**: على عيّنةٍ من ستّمئة حرف يقلب رأسُ جدولٍ واحدٍ أو
 * ‏ثلاثُ شاراتٍ النسبةَ نقطتين إلى خمس — ضجيجٌ لا تراتب. فالصفحةُ من ألفي حرفٍ فأكثر تُحرَس
 * ‏وحدَها، وما دونها يُطبَع ويدخل المجموع، **والمجموعُ لكلّ عرضٍ يُحرَس بالسقف نفسِه**.
 */
const MIN_PAGE_CHARS = 2000
/** طولُ السطر: ‏30em («--measure») لكلّ ما يلتفّ سطرين (خطّة التصميم 4.4/3). */
const MEASURE_EM = 30

const files = process.argv.slice(2)
if (files.length === 0) {
  console.error('الاستعمال: node scripts/audit_scale.mjs <ملفّ.html> …')
  process.exit(2)
}

/** الحاسوبُ بفأرة، والجوّالُ بإصبع — والثاني يلبس طبقةَ اللمس وشريطَ الإبهام. */
const VIEWS = [
  { label: '1440', scale: 'desktop', viewport: { width: 1440, height: 1000 } },
  { label: '390', scale: 'mobile', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
]

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
let failed = 0
/** ما يُطبَع في الختام: لكلّ صفحةٍ وعرضٍ أرقامُها، والمجموعُ للتقرير. */
const totals = { chars: 0, small: 0, nodes: 0, bold: 0, faint: 0, styles: new Map(), view: {} }

for (const view of VIEWS) {
  const { label, scale, ...options } = view
  const allowed = new Set(Object.values(STYLES[scale]))
  const page = await browser.newPage(options)
  for (const file of files) {
    await page.goto(`file://${file}`)
    // ما هو مخفيٌّ لا يُقاس، وعللُه تبقى
    await page.evaluate(() => {
      document.querySelectorAll('section[data-pane]').forEach((s) => { s.hidden = false })
      document.querySelectorAll('details').forEach((d) => { d.open = true })
    })
    await page.waitForTimeout(400)

    const { hits, stats } = await page.evaluate(({ FONTS, SPACES, WEIGHTS, allowed, MEASURE_EM }) => {
      const near = (v, list) => list.some((x) => Math.abs(x - v) < 0.26)
      const out = []
      const stats = { chars: 0, small: 0, nodes: 0, bold: 0, faint: 0, styles: {} }
      // ‏حبرُ «--ink-3» محسوبًا: يُقرأ من الجذر ويُقارَن باللون المحسوب لكلّ نصّ
      const probe = document.createElement('span')
      probe.style.color = 'var(--ink-3)'
      document.body.appendChild(probe)
      const ink3 = getComputedStyle(probe).color
      probe.remove()
      /*
       * ‏ما لا يُرى لا يُعَدّ حروفًا: رأسُ الجدول على الجوّال مقصوصٌ إلى ‏1px لقارئ الشاشة
       * ‏(«table:not(.pv) thead»)، ورابطُ التخطّي كذلك. والسلّمُ يُفحَص فيهما كغيرهما
       */
      const unseen = (el) => {
        for (let a = el; a !== null && a !== document.body; a = a.parentElement) {
          const r = a.getBoundingClientRect()
          const s = getComputedStyle(a)
          if ((r.width <= 1 || r.height <= 1) && (s.overflow !== 'visible' || s.clipPath !== 'none' || s.clip !== 'auto')) return true
        }
        return false
      }
      /*
       * ‏**والإطارُ لا يُعَدّ في نسبة الصفحة** (D-185): الرافدةُ وشريطُ الجوّال والشريطُ العلويّ
       * ‏ثابتةٌ في كلّ صفحة، ولصائقُ الشريط ‏١٣px بنصّ الخطّة (5.3) — فعلى صفحةٍ من خمسمئة حرفٍ
       * ‏تكون وحدَها ‏٩٪. والنسبةُ للمحتوى، والإطارُ يُفحَص نمطًا كغيره
       */
      const CHROME = '.rail, .topbar, nav.back, nav.tabs'

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
          if (!WEIGHTS.includes(w)) out.push(`${name} — وزنٌ غيرُ ‏٤٠٠ و‏٦٠٠: ${w} «${own.slice(0, 20)}»`)
          // ‏والنمطُ كاملًا: الحجمُ والسطرُ والوزن. والسطرُ بالبكسل يُكتب لا يُورَث (4.4/2)
          const style = `${Math.round(fs)}/${Math.round(parseFloat(cs.lineHeight))}/${w}`
          if (!allowed.includes(style)) out.push(`${name} — نمطٌ خارج القائمة: ${style} «${own.slice(0, 20)}»`)
          stats.styles[style] = (stats.styles[style] ?? 0) + own.length
          stats.nodes += 1
          if (el.closest(CHROME) === null && !unseen(el)) {
            stats.chars += own.length
            if (fs < 14) stats.small += own.length
          }
          if (w >= 600) stats.bold += 1
          if (fs < 15 && cs.color === ink3) {
            stats.faint += 1
            out.push(`${name} — حبرٌ ثالثٌ تحت ‏١٥px «${own.slice(0, 20)}»`)
          }
        }
        // ‏طولُ السطر بنيويًّا (4.4/3): فقرةٌ أو بندٌ يلتفّ سطرين وحدُّه فوق ‏30em
        if ((el.tagName === 'P' || el.tagName === 'LI') && own.length > 1) {
          const lines = Math.round(box.height / parseFloat(cs.lineHeight))
          const max = parseFloat(cs.maxWidth)
          const limit = MEASURE_EM * parseFloat(cs.fontSize) + 0.5
          if (lines >= 2 && !(max <= limit)) {
            out.push(`${name} — يلتفّ ${lines} أسطر وحدُّه ${cs.maxWidth} (فوق ${MEASURE_EM}em) «${own.slice(0, 20)}»`)
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
      return { hits: [...new Set(out)], stats }
    }, { FONTS, SPACES, WEIGHTS, allowed: [...allowed], MEASURE_EM })

    console.log(`\n═══ ${file.split('/').pop()} @${label} ═══`)
    const share = stats.chars === 0 ? 0 : stats.small / stats.chars
    const kinds = Object.keys(stats.styles).length
    console.log(`  · ${kinds} نمطًا · تحت ‏١٤px ${(share * 100).toFixed(1)}٪ من ${stats.chars} حرفًا · ` +
      `ثخينٌ ${stats.nodes === 0 ? 0 : ((stats.bold / stats.nodes) * 100).toFixed(0)}٪ من ${stats.nodes} نصًّا · ` +
      `«--ink-3» تحت ‏١٥px: ${stats.faint}`)
    if (share > MAX_SMALL_SHARE && stats.chars >= MIN_PAGE_CHARS) {
      hits.push(`الحروفُ تحت ‏١٤px ${(share * 100).toFixed(1)}٪ — والسقفُ ${MAX_SMALL_SHARE * 100}٪`)
    }
    const v = (totals.view[label] ??= { chars: 0, small: 0 })
    v.chars += stats.chars; v.small += stats.small
    totals.chars += stats.chars; totals.small += stats.small; totals.nodes += stats.nodes
    totals.bold += stats.bold; totals.faint += stats.faint
    for (const [k, n] of Object.entries(stats.styles)) totals.styles.set(`${scale} ${k}`, (totals.styles.get(`${scale} ${k}`) ?? 0) + n)
    if (hits.length === 0) { console.log('  ✓ كلُّه من السلّم'); continue }
    failed += hits.length
    for (const h of hits.slice(0, 14)) console.log(`  ✕ ${h}`)
    if (hits.length > 14) console.log(`  … و${hits.length - 14} غيرُها`)
  }
  await page.close()
}

await browser.close()
for (const [label, v] of Object.entries(totals.view)) {
  const share = v.chars === 0 ? 0 : v.small / v.chars
  console.log(`\n═══ العيّناتُ كلُّها @${label}: تحت ‏١٤px ${(share * 100).toFixed(1)}٪ من ${v.chars} حرفًا ═══`)
  if (share > MAX_SMALL_SHARE) {
    console.log(`  ✕ فوق السقف ${MAX_SMALL_SHARE * 100}٪`)
    failed += 1
  }
}
const perScale = (s) => [...totals.styles.keys()].filter((k) => k.startsWith(s)).length
console.log(`\nالأنماطُ المستعمَلة: ${perScale('desktop')} على الحاسوب و${perScale('mobile')} على الجوّال (القائمةُ ١٤) · ` +
  `تحت ‏١٤px ${totals.chars === 0 ? 0 : ((totals.small / totals.chars) * 100).toFixed(1)}٪ من ${totals.chars} حرفًا · ` +
  `ثخينٌ ${totals.nodes === 0 ? 0 : ((totals.bold / totals.nodes) * 100).toFixed(1)}٪ من ${totals.nodes} نصًّا · «--ink-3» تحت ‏١٥px: ${totals.faint}`)
console.log(`المجموع: ${failed} خارجَ السلّم`)
process.exit(failed > 0 ? 1 : 0)

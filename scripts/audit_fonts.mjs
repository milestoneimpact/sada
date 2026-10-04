#!/usr/bin/env node
/**
 * مدقّقُ الخطّ — **يسأل المتصفّحَ بأيّ خطٍّ رسم كلَّ نصّ** (D-185 · خطّة التصميم 10.2).
 *
 * ## لماذا وُجد
 *
 * قِيس قبل المرحلة ١ فوُجد ‏575 نصًّا من ‏1,179 يخلط Beiruti وInter في السطر الواحد،
 * و‏106 نصوصٍ تسقط إلى خطوط النظام (DejaVu Sans وLiberation Serif) — ومنها رموزٌ مثل
 * «✓» و«←» و«⌘» ليست في أيّ وجهٍ مضمَّن. **والورقةُ لا تقول ذلك**: `font-family`
 * المحسوبُ هو نفسُه في الحالين، والمتصفّحُ يسقط إلى البديل حرفًا حرفًا بلا خطأ.
 *
 * فالسؤالُ للمحرّك نفسِه: `CSS.getPlatformFontsForNode` في بروتوكول DevTools يعيد لكلّ
 * عنصرٍ الخطوطَ التي رُسمت بها نصوصُه المباشرة، **وعددَ الحروف من كلٍّ منها**، وأهو
 * خطٌّ مضمَّنٌ أم خطُّ نظام.
 *
 * ## وما يُردّ
 *
 * | ما يُقاس | الحدّ |
 * |---|---|
 * | نصٌّ رُسم بخطٍّ غيرِ زوج Plex | صفر |
 * | نصٌّ رُسم بخطّ نظام (ولو حرفًا) | صفر |
 * | رمزٌ من قائمة 3.4 (✓ ✕ ← → ▲ ▼ ◐ ▾ ⋯ ⌘ …) نصًّا في الصفحة | صفر — يُرسَم SVG |
 * | منطقةُ الأسنان العربيّة عند DPR ‏1 و‏1.25 و‏2 | المتنُ ‏5.5px فأكثر، وأصغرُ حجمٍ ‏4.9px فأكثر |
 *
 * **ومنطقةُ الأسنان** ارتفاعُ جسم الحرف العربيّ فوق خطّ القاعدة — بلا صاعدٍ ولا نقطة —
 * وهي ما يحمل شكلَ الكلمة، وPlex أقصرُ فيها من غيره (‏0.38em، خطّة التصميم 4.1). وتُقاس
 * بالواو الأخيرة «ـو»: جسمُها هو المنطقةُ نفسُها في Plex (‏0.379em) وفي Beiruti (‏0.388em)،
 * وأسنانُ السين أقصرُ منها في Plex (‏0.289em) فلا تصلح مقياسًا بين خطّين. والحكمُ على
 * الهندسة («actualBoundingBoxAscent» بالوزن الذي يُرسَم به الدور)، ويُطبَع معها ما يقع
 * على البكسل عند كلّ كثافة (أعلى سطرٍ فيه نصفُ تغطيةٍ فأكثر) ليُرى أثرُ التنعيم.
 *
 * ## وحدُّه يُقال
 *
 * يرى النصوصَ المباشرةَ في العناصر الظاهرة، والحقولَ النصّيّة متعدّدةَ الأسطر. **ولا
 * يرى** نصَّ العناصر الزائفة (`::before` بـ `attr()`) ولا قيمةَ `<input>` — وكلاهما
 * يرث `font-family` نفسَه، فلا طريقَ لهما إلى خطٍّ آخر إلّا حرفٌ ليس في Plex.
 *
 * الاستعمال:  node scripts/audit_fonts.mjs /tmp/panel.html …
 */
import { chromium } from 'playwright'

/**
 * زوجُ Plex كما يسمّيه الملفّ نفسُه — لا كما تسمّيه الورقة («Plex Arabic» و«Plex Sans»):
 * الوجهُ العربيُّ الثخينُ ملفٌّ مستقلٌّ اسمُه «IBM Plex Sans Arabic SemiBold».
 */
const PAIR = /^IBM Plex Sans( Arabic)?( SemiBold)?$/

/** رموزُ خطّة التصميم 3.4 وجدولُ الحال القديم: ليست في Plex، **ولا تُكتب نصًّا**. */
const ICON_GLYPHS = /[✓✕←→▲▼◐◍◔●○◆■▾▸⋯⌘]/u

/** منطقةُ الأسنان: حدّا الخطّة (10.2) بالبكسل المنطقيّ، وكثافاتُ الشاشة الثلاث. */
const TEETH = { body: 5.5, smallest: 4.9 }
const DPRS = [1, 1.25, 2]

const files = process.argv.slice(2)
if (files.length === 0) {
  console.error('الاستعمال: node scripts/audit_fonts.mjs <ملفّ.html> …')
  process.exit(2)
}

const VIEWS = [
  { label: '1440', viewport: { width: 1440, height: 1000 } },
  { label: '390', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
]

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
let failed = 0
const seen = new Map()
let nodes = 0

for (const view of VIEWS) {
  const { label, ...options } = view
  const context = await browser.newContext(options)
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)
  for (const file of files) {
    await page.goto(`file://${file}`)
    await page.evaluate(() => {
      document.querySelectorAll('section[data-pane]').forEach((s) => { s.hidden = false })
      document.querySelectorAll('details').forEach((d) => { d.open = true })
    })
    // ‏الخطُّ يُحمَّل بـ «swap»: يُنتظَر حتّى يجهز، وإلّا قِيس البديلُ المؤقّت
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(300)

    // ‏كلُّ عنصرٍ ظاهرٍ له نصٌّ مباشر يُعلَّم، ثمّ يُسأل عنه المحرّك بمعرّفه
    const texts = await page.evaluate((src) => {
      const icon = new RegExp(src, 'u')
      const out = []
      let i = 0
      for (const el of document.querySelectorAll('body *')) {
        const box = el.getBoundingClientRect()
        if (box.width === 0 || box.height === 0) continue
        const own = el.tagName === 'TEXTAREA'
          ? el.value.trim()
          : [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join('')
        if (own.length === 0) continue
        el.setAttribute('data-af', String(i))
        out.push({ i, name: `${el.tagName.toLowerCase()}${typeof el.className === 'string' && el.className ? '.' + el.className.split(' ')[0] : ''}`, text: own.slice(0, 24), icon: icon.test(own) })
        i += 1
      }
      return out
    }, ICON_GLYPHS.source)

    await cdp.send('DOM.enable')
    await cdp.send('CSS.enable')
    const { root } = await cdp.send('DOM.getDocument', { depth: -1 })
    const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: '[data-af]' })
    const hits = []
    for (const nodeId of nodeIds) {
      const { attributes } = await cdp.send('DOM.getAttributes', { nodeId })
      const at = attributes.indexOf('data-af')
      const t = texts[Number(attributes[at + 1])]
      if (t === undefined) continue
      const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId })
      nodes += 1
      for (const f of fonts) seen.set(`${f.familyName}${f.isCustomFont ? '' : ' (نظام)'}`, (seen.get(`${f.familyName}${f.isCustomFont ? '' : ' (نظام)'}`) ?? 0) + f.glyphCount)
      const system = fonts.filter((f) => !f.isCustomFont)
      const foreign = fonts.filter((f) => f.isCustomFont && !PAIR.test(f.familyName))
      if (system.length > 0) hits.push(`${t.name} — خطُّ نظام: ${system.map((f) => `${f.familyName} ×${f.glyphCount}`).join('، ')} «${t.text}»`)
      if (foreign.length > 0) hits.push(`${t.name} — خطٌّ غيرُ زوج Plex: ${foreign.map((f) => f.familyName).join('، ')} «${t.text}»`)
      if (t.icon) hits.push(`${t.name} — رمزٌ من قائمة 3.4 نصًّا لا رسمًا «${t.text}»`)
    }
    await cdp.send('CSS.disable')
    await cdp.send('DOM.disable')

    console.log(`\n═══ ${file.split('/').pop()} @${label} · ${nodeIds.length} نصًّا ═══`)
    if (hits.length === 0) { console.log('  ✓ كلُّه من زوج Plex، ولا رمزَ نصًّا'); continue }
    failed += hits.length
    for (const h of [...new Set(hits)].slice(0, 14)) console.log(`  ✕ ${h}`)
    if (hits.length > 14) console.log(`  … و${hits.length - 14} غيرُها`)
  }
  await context.close()
}

/*
 * ── منطقةُ الأسنان (خطّة التصميم 4.1 و10.2) ─────────────────────────────
 * ‏على صفحةٍ تحمل خطَّ اللوحة نفسَه (أوّلُ العيّنات)، بالأحجام التي يرسم بها المتنُ
 * ‏على الحاسوب والجوّال وأصغرُ حجمٍ في السلّم. والأسنانُ من «ـسـ»: لا صاعدَ فيها ولا نقطة.
 */
console.log('\n═══ منطقةُ الأسنان العربيّة ═══')
for (const dpr of DPRS) {
  for (const [label, width] of [['الحاسوب', 1440], ['الجوّال', 390]]) {
    const context = await browser.newContext({ viewport: { width, height: 600 }, deviceScaleFactor: dpr })
    const page = await context.newPage()
    await page.goto(`file://${files[0]}`)
    await page.evaluate(() => document.fonts.ready)
    // ‏الأدوارُ من رموز العرض نفسِه: المتنُ ‏٤٠٠، وأصغرُ حجمٍ في السلّم بوزنه (اللصيقةُ ‏٦٠٠)
    const roles = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement)
      const px = (n) => Number.parseFloat(root.getPropertyValue(n))
      return [
        { role: 'body', size: px('--t-body'), weight: 400 },
        { role: 'smallest', size: px('--t-caption'), weight: 600 },
      ]
    })
    for (const { role, size, weight } of roles) {
      // ‏ورمزٌ غائبٌ علّةٌ تُقال لا انهيار: صفحةٌ بلا سلّم D-185 لا تُقاس أسنانُها
      if (!Number.isFinite(size)) {
        failed += 1
        console.log(`  ✕ DPR ${dpr} · ${label} · ${role}: رمزُ الحجم غائبٌ من الصفحة`)
        continue
      }
      const m = await page.evaluate(async ({ size, weight, dpr }) => {
        const font = `${weight} ${size}px "Plex Arabic"`
        await document.fonts.load(font, 'ـو')
        const c = document.createElement('canvas')
        const w = Math.ceil(size * 4 * dpr)
        const h = Math.ceil(size * 3 * dpr)
        c.width = w; c.height = h
        const ctx = c.getContext('2d')
        ctx.scale(dpr, dpr)
        ctx.font = font
        ctx.textBaseline = 'alphabetic'
        // ‏والهندسةُ بحجمٍ كبيرٍ ثمّ بالنسبة: المحرّكُ يقرّب صندوقَ الحبر إلى بكسلٍ صحيح،
        // ‏فـ ‏6.06 تُقرأ ‏7 عند ‏16px — والنسبةُ عند ‏1000px دقيقةٌ إلى جزءٍ من ألف
        ctx.font = `${weight} 1000px "Plex Arabic"`
        const geometric = ctx.measureText('ـو').actualBoundingBoxAscent * size / 1000
        ctx.font = font
        const base = size * 2
        ctx.fillText('ـو', size, base)
        const data = ctx.getImageData(0, 0, w, h).data
        let raster = 0
        for (let y = 0; y < h && raster === 0; y += 1) {
          for (let x = 0; x < w; x += 1) {
            if (data[(y * w + x) * 4 + 3] >= 128) { raster = (base * dpr - y) / dpr; break }
          }
        }
        return { geometric, raster }
      }, { size, weight, dpr })
      const min = TEETH[role]
      const ok = m.geometric >= min
      if (!ok) failed += 1
      console.log(`  ${ok ? '✓' : '✕'} DPR ${dpr} · ${label} · ${role === 'body' ? 'المتن' : 'أصغرُ حجم'} ${size}px/${weight}: ` +
        `${m.geometric.toFixed(2)}px (الحدّ ${min}) · على البكسل ${m.raster.toFixed(2)}px`)
    }
    await context.close()
  }
}

await browser.close()
console.log(`\nالخطوطُ المرسومةُ بها (حروفًا) في ${nodes} نصًّا:`)
for (const [name, n] of [...seen].sort((a, b) => b[1] - a[1])) console.log(`  · ${name}: ${n}`)
console.log(`المجموع: ${failed} ملحوظة`)
process.exit(failed > 0 ? 1 : 0)

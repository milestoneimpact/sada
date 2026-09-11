/*
 * مقاييسُ اللوحة — ملفٌّ يُشغَّل، لا رقمٌ يُدَّعى.
 *
 * ثلاثةٌ هنا، **وكلُّها تُقرأ ولا تُطاع**: الشرحُ (D-113) وتجانسُ
 * البطاقات وكثافةُ الحبر (D-118). وكلُّ واحدٍ منها سُمّي يوما بوّابةً
 * في `UI-REBUILD.md` ثمّ **سقطت مقدّمتُه عند القياس**.
 *
 * كُتب لأنّ خارطةَ `UI-REBUILD.md` بنت بوّاباتِها على «نسبة الشرح إلى
 * البيان» **بمصنِّفٍ لم يُحفَظ**، فلم يُعَد اشتقاقُ أرقامِها (D-113).
 *
 * ولا يَحرُس هذا الملفُّ شيئا: يقيس ويطبع. **وحارسٌ يقوم على تصنيفٍ
 * متنازَعٍ فيه يكذب مرّة، ثمّ لا يُقرَأ أبدا.**
 */
import { chromium } from 'playwright'

const files = process.argv.slice(2)
if (files.length === 0) {
  console.error('الاستعمال: node scripts/measure_prose.mjs <ملفّ.html>…')
  process.exit(2)
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

for (const file of files) {
  await page.goto(`file://${file}`)
  await page.waitForTimeout(600)

  /*
   * **ما يلتفّ سطرين فأكثرَ جملةٌ تُقرأ، وما يسع سطرا واحدا رمزٌ يُلتقَط.**
   *
   * ولا قائمةَ أصنافٍ هنا ولا حدَّ كلمات: جُرِّب الاثنان فكذبا. قائمةُ
   * الأصناف أغفلت `.who` و`.ago` و`.st` في بطاقة القناة **فقالت بيانَها
   * ‏١٦٩ حرفا وهو أضعافُها**؛ وحدُّ الكلمات لم يجد في التوزيع واديا
   * يُوضَع فيه — والرقمُ يُنتقى حينئذٍ ليوافق الجواب.
   *
   * **فالمتصفّحُ هو الذي يقسم الأسطر**، وقسمتُه لا رأيَ لي فيها.
   */
  const panes = await page.evaluate(() => {
    const out = []
    for (const s of document.querySelectorAll('section[data-pane]')) {
      const was = s.hidden
      s.hidden = false
      let ink = 0
      let runs = 0
      const range = document.createRange()
      for (const el of s.querySelectorAll('*')) {
        for (const n of el.childNodes) {
          if (n.nodeType !== 3 || n.textContent.trim().length < 12) continue
          /*
           * **ونصُّ الآلة يلتفّ ولا يُقرأ جملةً** (D-116).
           *
           * قِيس لوحُ المزوّدين فقيل فيه ‏١١ جملة، **وثلاثٌ منها عنوانُ
           * `API` ومساران في لوحة مزوّد**: طولُها يلفّها سطرين، وليست
           * كلاما. **ولو صُدِّق لاختُصر عنوانٌ لا يجوز اختصارُه.**
           *
           * والفرقُ **يقوله المتصفّح لا أنا**: هذه الشيفرةُ تسم نصَّ
           * الآلة بخطٍّ ثابت العرض قصدا، **فـ`font-family` المحسوبةُ
           * تفصلهما** — ولا قائمةَ أصنافٍ تشيخ.
           */
          const font = getComputedStyle(el).fontFamily
          if (/\bmonospace\b|ui-monospace|SFMono/i.test(font)) continue
          range.selectNodeContents(n)
          const boxes = [...range.getClientRects()].filter((r) => r.height > 0)
          if (boxes.length === 0) continue
          // سطرٌ واحدٌ قد يُقطَّع صناديقَ عدّة، فتُجمَع بموضعها الرأسيّ
          const byLine = new Map(boxes.map((r) => [Math.round(r.top), r.height]))
          if (byLine.size < 2) continue
          ink += [...byLine.values()].reduce((a, c) => a + c, 0)
          runs++
        }
      }
      const height = s.scrollHeight
      out.push({ pane: s.dataset.pane, height, ink: Math.round(ink), runs,
                 pct: Math.round((ink / height) * 100) })
      s.hidden = was
    }
    return out
  })

  /*
   * **وأوّلُ جوابٍ في الصفحة**: صدرُ المؤشّر `.tile .v` — وهو الرقمُ الذي
   * جاء المالكُ من أجله. ولا يُحتسَب كلُّ نصٍّ رقميّ: شارةُ عدٍّ في
   * الشريط الجانبيّ رقمٌ ولا تجيب شيئا.
   */
  const answer = await page.evaluate(() => {
    const tiles = [...document.querySelectorAll('section[data-pane]:not([hidden]) .tile .v')]
    if (tiles.length === 0) return null
    const at = () => ({
      top: Math.round(tiles[0].getBoundingClientRect().top + scrollY),
      fold: tiles.filter((e) => e.getBoundingClientRect().top + scrollY < 900).length,
    })
    /*
     * **ويُقاس الحالان.** البلاغُ فوق اللوح عارضٌ يزول، **وقياسٌ يشمله
     * وحدَه يقول رقما لا يراه المالكُ في يومه العاديّ؛ وقياسٌ يسقطه
     * وحدَه يُخفي أسوأَ ما يقع.** فيُقالان معا ويُسمّى كلٌّ بشرطه.
     */
    const withFlash = at()
    const flashes = [...document.querySelectorAll('.flash')]
    for (const f of flashes) f.style.display = 'none'
    const bare = at()
    for (const f of flashes) f.style.display = ''
    return { text: tiles[0].textContent.trim().slice(0, 18), flashes: flashes.length,
             withFlash, bare }
  })

  /*
   * **تجانسُ البطاقات** — مقدّمةُ `E-4`: «حقولٌ متجانسةٌ في ثلاثةِ
   * عناصرَ فأكثرَ تُقارَن ولا تُفرَد، فيُستبدَل بها جدول».
   *
   * وقِيست كلُّ شبكةٍ في اللوحة وفي شاشات `render_screens`، **فلم تُوجَد
   * شبكةٌ واحدةٌ من ثلاثةٍ متطابقةِ التشريح**: أقربُها اثنان من أربعة.
   * وبطاقةُ القناة تختلف بحالها قصدا (D-111)، **وذلك هو عملُها**.
   *
   * **والصنفُ الأوّلُ وحدَه يُقارَن**: «st ok» و«st idle» تشريحٌ واحدٌ
   * بحالين، ومن قارن سلسلةَ الأصناف كاملةً عدَّهما مختلفين.
   */
  const grids = await page.evaluate(() => {
    const sig = (el) => [...el.querySelectorAll('*')]
      .map((x) => `${x.tagName}.${String(x.className).split(/\s+/)[0] || ''}`).join('>')
    const out = []
    for (const s of document.querySelectorAll('section[data-pane], body')) {
      const was = s.hidden === true
      if (was) s.hidden = false
      for (const g of s.querySelectorAll(':scope > * .grid, :scope > .grid')) {
        const kids = [...g.children].filter((e) => e.getBoundingClientRect().height > 0)
        if (kids.length < 3) continue
        const uniq = new Set(kids.map(sig)).size
        if (uniq === 1) out.push({ where: s.dataset?.pane ?? '—', n: kids.length })
      }
      if (was) s.hidden = true
    }
    return out
  })

  /*
   * **كثافةُ الحبر** — مقدّمةُ `E-5`: «التمريرُ ليس عيبا؛ التمريرُ
   * الفارغُ عيب»، ولوحُ المنشورات ‏٤١٧٠px.
   *
   * ويُقاس بالهندسة لا بتصنيف: **كم سطرا رأسيّا من اللوح يمرّ فيه نصٌّ
   * أو أداة**. وجاء ‏٥٨٪ … ‏٧٤٪ في الألواح كلِّها — **وأطولُها أكثفُها**.
   */
  const ink = await page.evaluate(() => {
    const out = []
    for (const s of document.querySelectorAll('section[data-pane]')) {
      const was = s.hidden
      s.hidden = false
      const R = s.getBoundingClientRect()
      const H = Math.max(s.scrollHeight, 1)
      const rows = new Uint8Array(H)
      for (const el of s.querySelectorAll('*')) {
        const own = [...el.childNodes].filter((n) => n.nodeType === 3)
          .map((n) => n.textContent.trim()).join('')
        if (own.length === 0 && !el.matches('input,select,textarea,button,a.btn,svg,img,canvas')) continue
        const r = el.getBoundingClientRect()
        if (r.height === 0) continue
        const top = Math.max(0, Math.round(r.top - R.top))
        const bot = Math.min(H, Math.round(r.bottom - R.top))
        for (let y = top; y < bot; y++) rows[y] = 1
      }
      let on = 0
      for (const v of rows) on += v
      out.push({ pane: s.dataset.pane, h: H, pct: Math.round((on / H) * 100) })
      s.hidden = was
    }
    return out
  })

  console.log(`\n═══ ${file.split('/').pop()} ═══`)
  for (const p of panes.sort((a, b) => b.pct - a.pct)) {
    console.log(`  ${String(p.pane).padEnd(11)} ${String(p.pct).padStart(3)}٪ شرحا` +
      ` — ${String(p.ink).padStart(4)}px من ${String(p.height).padStart(4)}px · ${p.runs} جملةً`)
  }
  if (answer !== null) {
    console.log(`  أوّلُ مؤشّرٍ «${answer.text}» — بلا بلاغ ${answer.bare.top}px` +
      ` · ${answer.bare.fold} في أوّل شاشة`)
    if (answer.flashes > 0) {
      console.log(`  ومع ${answer.flashes} بلاغا فوقه: ${answer.withFlash.top}px` +
        ` · ${answer.withFlash.fold} في أوّل شاشة`)
    }
  } else {
    console.log('  لا مؤشّرَ في اللوح الظاهر')
  }
  console.log(`  \u062a\u062c\u0627\u0646\u0633\u064f \u0627\u0644\u0628\u0637\u0627\u0642\u0627\u062a: ${
    grids.length === 0
      ? '\u0644\u0627 \u0634\u0628\u0643\u0629\u064e \u0645\u0646 \u062b\u0644\u0627\u062b\u0629\u064d \u0645\u062a\u0637\u0627\u0628\u0642\u0629\u0650 \u0627\u0644\u062a\u0634\u0631\u064a\u062d \u2014 \u0641\u0644\u0627 \u0645\u0648\u0636\u0639\u064e \u062c\u062f\u0648\u0644'
      : grids.map((g) => `${g.where} (${g.n})`).join(' \u00b7 ')}`)
  const lo = ink.reduce((a, c) => (c.pct < a.pct ? c : a), ink[0])
  const hi = ink.reduce((a, c) => (c.pct > a.pct ? c : a), ink[0])
  if (lo !== undefined) {
    console.log(`  \u0643\u062b\u0627\u0641\u0629\u064f \u0627\u0644\u062d\u0628\u0631: ${lo.pct}\u066a (${lo.pane}) \u2026 ${hi.pct}\u066a (${hi.pane})`)
  }
}
await browser.close()

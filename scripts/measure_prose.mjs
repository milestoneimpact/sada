/*
 * قياسُ الشرح والجواب — ملفٌّ يُشغَّل، لا رقمٌ يُدَّعى.
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
}
await browser.close()

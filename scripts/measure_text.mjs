/*
 * نصُّ الواجهة يُقاس — **كلُّ سلسلةٍ في كلّ لوح** (D-122).
 *
 * ## ولماذا هذا غيرُ `measure_prose`
 *
 * ذاك يقيس **الحبر**: كم بكسلا من اللوح يشغله كلامٌ يلتفّ سطرين. وهذا
 * يقيس **النصَّ نفسَه**: ما يتكرّر، وما يخالف أخاه، وما لا يُقرأ.
 *
 * ## وأربعةٌ تُقاس ولا تُستفتى
 *
 * | ما يُقاس | لماذا يهمّ |
 * |---|---|
 * | **تكرارٌ حرفيّ** | جملةٌ في موضعين تُعدَّل في واحدٍ فتفترقان |
 * | **لصيقةُ فعلٍ مكرّرة** | زرّان باسمٍ واحدٍ يفعلان شيئين |
 * | **ترويسةٌ مكرّرة** | عنوانان متطابقان في شاشةٍ واحدة |
 * | **نصٌّ مقصوص** | ما لا يُقرأ كلُّه لا يُقرأ |
 *
 * **ولا واحدٌ منها رأيٌ**: كلُّها مقارنةُ نصٍّ بنصّ، أو قياسُ صندوقٍ
 * بصندوق. وهو الفرقُ الذي رُفض من أجله حَرسُ نسبة الشرح (D-113).
 *
 * ## وحدُّه يُقال ولا يُخفى
 *
 * **يفرّق بين نصّ الواجهة ونصّ المالك بقدر ما تقوله البنية.** فنصُّ
 * مسوّدةٍ في `textarea` بيانٌ يُحرَّر لا نسخةٌ ثانية — ويُستثنى. **أمّا
 * محتوًى يُعرَض مرّتين بدورين** — أفضلُ منشورٍ في بطاقة الصدارة ثمّ في
 * قائمة المنشورات — **فلا تفرّقه بنيةٌ ولا أداة**، فيبقى ملحوظةً تُراجَع
 * بالعين مرّةً وتُترَك.
 *
 * **ولذلك يقيس ويطبع ولا يردّ** — كـ`measure_prose` وللسبب نفسِه.
 */
import { chromium } from 'playwright'

const files = process.argv.slice(2)
if (files.length === 0) {
  console.error('الاستعمال: node scripts/measure_text.mjs <ملفّ.html>…')
  process.exit(2)
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

let findings = 0

for (const file of files) {
  await page.goto(`file://${file}`)
  await page.waitForTimeout(500)

  const report = await page.evaluate(() => {
    const panes = [...document.querySelectorAll('section[data-pane]')]
    const seps = [...document.querySelectorAll('h2.sec, h3.sec')]
    const scopes = panes.length > 0
      ? panes.map((p) => ({ name: p.dataset.pane ?? '—', el: p }))
      : [{ name: 'الصفحة', el: document.body }]

    /*
     * **وشاشةُ حالاتٍ ليست شاشةً واحدة.**
     *
     * بعضُ ملفّات `render_screens` تضمّ أربعَ حالاتٍ من المكوّن نفسِه في
     * صفحةٍ واحدة، يفصل بينها `h2.sec`. **فترويسةُ «القنوات المبنيّة»
     * أربعُ مرّاتٍ ليست تكرارا** — بل أربعُ لقطاتٍ لشاشةٍ واحدة.
     *
     * فتُنسَب كلُّ ترويسةٍ إلى الفاصل الذي قبلها، **ولا تُقارَن إلّا
     * بأخواتها في الحالة نفسِها**. ولا يُقسَّم الشجرُ ولا يُنقَل عنصر.
     */
    const caseOf = (node) => {
      let n = -1
      for (const [i, h] of seps.entries()) {
        if (h.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) n = i
      }
      return n
    }

    const norm = (s) => s.replace(/\s+/g, ' ').trim()

    const out = { panes: [], totals: { strings: 0, words: 0 } }

    for (const { name, el } of scopes) {
      const was = el.hidden === true
      if (was) el.hidden = false

      /*
       * **والنصُّ المباشرُ وحدَه.** عقدةُ نصٍّ داخل عنصر، لا
       * `textContent` الذي يجمع الأبناءَ فيعدّ الجملةَ مرّاتٍ بعدد
       * أجدادها.
       */
      const strings = []
      for (const node of el.querySelectorAll('*')) {
        if (node.closest('script, style, svg, template') !== null) continue
        for (const child of node.childNodes) {
          if (child.nodeType !== 3) continue
          const text = norm(child.textContent ?? '')
          if (text.length < 4) continue
          strings.push({ text, tag: node.tagName.toLowerCase(), cls: node.className || '' })
        }
      }

      const count = (list) => {
        const m = new Map()
        for (const x of list) m.set(x, (m.get(x) ?? 0) + 1)
        return m
      }

      /*
       * ١ · تكرارٌ حرفيّ — **وما تكرّر في بنيتين متوازيتين ليس تكرارا**.
       *
       * لكلّ مسوّدةٍ تلميحُها، ولكلّ قناةٍ سببُ تعطّلها: **ثلاثُ بطاقاتٍ
       * تقول الجملةَ نفسَها تصميمٌ صحيح**، وعدُّه عيبا يجعل المقياسَ
       * يصيح على الصواب ثمّ لا يُقرَأ (D-113).
       *
       * **فيُبنى لكلّ نصٍّ مسارُ أوعيته** من عنصره إلى اللوح —
       * `SPAN>LI>OL>DIV` — **ونصّان مسارُهما واحدٌ يشغلان الموضعَ نفسَه
       * في بنيةٍ تتكرّر**: صفٌّ في جدول، أو بطاقةٌ في شبكة، أو تنبيهٌ في
       * قائمة.
       *
       * ## وثلاثُ صياغاتٍ سبقتها، كلٌّ أدقُّ ممّا قبله
       *
       * **أ · قائمةُ أصنافٍ (`.card`)** — فجمعت بطاقاتِ القنوات كلَّها في
       * دلوٍ واحد **لأنّ صنفَها `.ch`**. وقائمةُ أصنافٍ تشيخ (D-113).
       *
       * **ب · مقارنةُ الأشقّاء** — أدنى جدٍّ يجمع النصّين، فإن نزلا من
       * ابنين شقيقين فهما متوازيان. **فأخطأت بنيتين متوازيتين على عمقين
       * مختلفين**: مهمّتان في مرحلتين، لكلٍّ شارةُ بوّابةٍ وشرحُها.
       *
       * **ج · مسارٌ يحمل الصنف** — فصار `TR.urgent` غيرَ `TR`، **وهما
       * موضعٌ واحدٌ بحالين**. وهي علّةُ `st ok` و`st idle` في D-118:
       * **صنفُ حالٍ لا صنفُ بنية**.
       *
       * **فاستقرّ المسارُ على الوسم وحدَه.**
       */
      const sig = (node) => node.tagName

      const pathOf = (node) => {
        const parts = []
        for (let x = node; x && x !== el; x = x.parentElement) parts.push(sig(x))
        return parts.join('>')
      }

      const nodesByText = new Map()
      for (const node of el.querySelectorAll('*')) {
        if (node.closest('script, style, svg, template') !== null) continue
        for (const child of node.childNodes) {
          if (child.nodeType !== 3) continue
          const text = norm(child.textContent ?? '')
          if (text.split(' ').length < 7) continue
          // **وما يُحرَّر ليس نسخةً**: نصُّ مسوّدةٍ في محرّرها بيانٌ لا كلام
          if (node.closest('textarea, input, [data-palette]') !== null) continue
          const bag = nodesByText.get(text) ?? []
          bag.push(pathOf(node))
          nodesByText.set(text, bag)
        }
      }
      const repeated = []
      for (const [text, paths] of nodesByText) {
        if (paths.length < 2) continue
        // ومسارٌ واحدٌ لكلِّها يعني بنيةً تتكرّر — لا نصّا مكرّرا
        if (new Set(paths).size > 1) repeated.push({ text: text.slice(0, 64), n: paths.length })
      }

      /*
       * ٢ · لصيقةُ فعلٍ مكرّرة — **زرّان باسمٍ واحدٍ يفعلان شيئين**.
       *
       * **والاسمُ المقروءُ لا النصُّ المرئيّ**: قارئُ الشاشة يسرد
       * الروابطَ باسمها المتاح — `aria-label` إن وُجد، وإلّا النصّ.
       * فزرٌّ نصُّه «اضبط سرّيه» ولصيقتُه «اضبط سرّي TikTok» **يُميَّز
       * عند من لا يرى البطاقةَ حوله**.
       *
       * وأوّلُ صياغةٍ قرأت `textContent` وحدَه، **فبقيت تصيح بعد أن
       * أُصلح العطل**.
       */
      const actions = [...el.querySelectorAll('button, a.btn')]
        .filter((b) => b.getBoundingClientRect().height > 0)
        .map((b) => ({
          label: norm(b.getAttribute('aria-label') ?? b.textContent ?? ''),
          href: b.getAttribute('href') ?? '',
        }))
        .filter((b) => b.label.length > 1)
      const byLabel = new Map()
      for (const a of actions) {
        const set = byLabel.get(a.label) ?? new Set()
        set.add(a.href)
        byLabel.set(a.label, set)
      }
      const clashes = [...byLabel].filter(([, hrefs]) => hrefs.size > 1)
        .map(([label, hrefs]) => ({ label, to: hrefs.size }))

      // ٣ · ترويسةٌ مكرّرةٌ **في الحالة الواحدة** — لا عبر لقطاتٍ متجاورة
      const heads = [...el.querySelectorAll('h1, h2, h3')]
        .filter((h) => h.getBoundingClientRect().height > 0)
        .filter((h) => !h.classList.contains('sec'))
        .map((h) => `${caseOf(h)}\u0000${norm(h.textContent ?? '')}`)
      const dupHeads = [...count(heads)].filter(([, n]) => n > 1)
        .map(([key, n]) => ({ t: key.split('\u0000')[1] ?? key, n }))

      // ٤ · نصٌّ مقصوص — **وما لا يُقرأ كلُّه لا يُقرأ**
      const clipped = []
      for (const node of el.querySelectorAll('*')) {
        const r = node.getBoundingClientRect()
        if (r.height === 0 || node.children.length > 0) continue
        const style = getComputedStyle(node)
        const hidden = style.overflow === 'hidden' || style.overflowX === 'hidden'
        if (!hidden) continue
        if (node.scrollWidth > node.clientWidth + 1) {
          clipped.push({
            cls: `${node.tagName.toLowerCase()}.${String(node.className).slice(0, 18)}`,
            text: norm(node.textContent ?? '').slice(0, 40),
            over: node.scrollWidth - node.clientWidth,
          })
        }
      }

      const words = strings.reduce((a, s) => a + s.text.split(' ').length, 0)
      out.totals.strings += strings.length
      out.totals.words += words
      out.panes.push({
        name, strings: strings.length, words,
        repeated, clashes, dupHeads,
        clipped: clipped.slice(0, 6),
        clippedCount: clipped.length,
      })
      if (was) el.hidden = true
    }
    return out
  })

  console.log(`\n═══ ${file.split('/').pop()} ═══`)
  console.log(`  ${report.totals.strings} سلسلةً · ${report.totals.words} كلمة\n`)
  for (const p of report.panes.sort((a, b) => b.words - a.words)) {
    const issues = p.repeated.length + p.clashes.length + p.dupHeads.length + p.clippedCount
    const head = `  ${String(p.name).padEnd(11)} ${String(p.strings).padStart(4)} سلسلة`
      + ` · ${String(p.words).padStart(5)} كلمة`
    if (issues === 0) { console.log(`${head}  ✓`); continue }
    findings += issues
    console.log(head)
    for (const r of p.repeated) console.log(`      ✕ تكرارٌ ×${r.n}: «${r.text}»`)
    for (const c of p.clashes) console.log(`      ✕ «${c.label}» تذهب إلى ${c.to} وجهات`)
    for (const h of p.dupHeads) console.log(`      ✕ ترويسةٌ ×${h.n}: «${h.t}»`)
    for (const c of p.clipped) console.log(`      ✕ مقصوصٌ ${c.over}px: ${c.cls} «${c.text}»`)
    if (p.clippedCount > p.clipped.length) {
      console.log(`      … و${p.clippedCount - p.clipped.length} مقصوصا غيرَها`)
    }
  }
}
await browser.close()
console.log(`\nالمجموع: ${findings} ملحوظة`)

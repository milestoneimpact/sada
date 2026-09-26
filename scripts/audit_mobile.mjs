#!/usr/bin/env node
/**
 * مدقّقُ الجوّال — **يمسك ما لا تمسكه عينٌ على شاشةِ حاسوب** (D-086).
 *
 * ## لماذا وُجد
 *
 * سأل المالك: «أيعمل التطبيق باحترافيةٍ على الجوّال؟» فقِيس، فوُجدت ستُّ
 * عللٍ تُلمَس بالإصبع — **ولا واحدةَ منها يمسكها مدقّق**.
 *
 * و`audit_design` يعمل عند ‏٣٩٠px، **لكنّه لا يسأل**: أهذا الهدفُ يسع
 * إصبعا؟ أيُقرِّب iOS هذا الحقل؟ أهذه `vh` أم `dvh`؟ فبقيت هذه الطبقةُ
 * بلا حارس — **وما لا يُحرَس يشيخ صامتا** (وهو درسُ D-067 حتّى D-073).
 *
 * ## والمعاييرُ مسمّاةٌ لا مُلمَّحٌ إليها
 *
 * | ما يُفحَص | الحدّ | المرجع |
 * |---|---|---|
 * | أهدافُ اللمس | ‏٤٤×٤٤ | Apple HIG · و WCAG 2.5.8 يقبل ‏٢٤ |
 * | خطُّ الحقول | ≥ ‏١٦px | سلوكُ Safari: ما دونه يُقرِّب الصفحة |
 * | التمريرُ الأفقيّ | صفر عند ‏٣٢٠px | WCAG 1.4.10 (Reflow) |
 * | `100vh` مكشوفة | ممنوعة | ارتفاعُ iOS يشمل شريطَ المتصفّح |
 * | `:hover` بلا حراسة | ممنوعة | لا hover على اللمس — فيعلق |
 * | وزنُ الصفحة | سقفٌ مُعلَن | Core Web Vitals |
 *
 * ## ويُقاس من المتصفّح لا من الشيفرة
 *
 * قياسٌ يصل بالوراثة أو بمحدّدٍ لم يُصِب لا يظهر في `grep`. **والحدُّ
 * الذي يُفحَص في الشيفرة يُفحَص فيها** (`vh` و`hover` والوزن)، وما عداه
 * يُقاس على أربعة مقاسات.
 *
 * الاستعمال:  node scripts/audit_mobile.mjs <ملفّ.html> …
 */
import { chromium } from 'playwright'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

/** ‏٣٢٠ حدُّ WCAG · ‏٣٦٠ أندرويد شائع · ‏٣٩٠ آيفون · ‏٤٣٠ آيفون Max. */
const WIDTHS = [320, 360, 390, 430]

/** أدنى هدفِ لمس — Apple HIG. وهو أشدُّ من ‏٢٤ عند WCAG 2.5.8، وهو المراد. */
const TAP = 44

/** ما دونه يُقرِّب Safari الصفحةَ عند لمس الحقل. */
const MIN_FIELD_FONT = 16

/** سقفُ وزن الصفحة — **يُعلَن ليُحرَس، لا ليُرضي**. */
const MAX_PAGE_KB = 260
/*
 * **والوزنُ الذي يعبر الشبكة مضغوط** (D-152): الخامُ رقمٌ يُطبَع، والبوّابةُ
 * على gzip لأنّ حافّةَ Cloudflare تضغط HTML قبل أن يصل. اللوحةُ كاملةً
 * ‏٣٦KB مضغوطةً و‏١٧١KB خامًا؛ والسقفُ ‏٦٠ يترك للنموّ ويمسك تضاعفًا.
 */
const MAX_PAGE_GZ_KB = 60

/**
 * ما يُعفى — **وبسطرٍ يقول لماذا**، كما في كلّ مدقّقٍ عندنا.
 *
 * ولا يُعفى شيءٌ لأنّه «صعبُ الإصلاح»: يُعفى لأنّ القاعدةَ لا تنطبق عليه.
 */
const ALLOWED = new Map([
  // رابطُ التخطّي لا يُرى إلّا بلوحة المفاتيح، ولا إصبعَ يقصده أصلا
  ['a.skip', 'رابطُ تخطٍّ لا يظهر إلّا عند التركيز بلوحة المفاتيح'],
])

const files = process.argv.slice(2)
if (files.length === 0) {
  console.error('الاستعمال: node scripts/audit_mobile.mjs <ملفّ.html> …')
  process.exit(2)
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
let failed = 0

for (const file of files) {
  const name = file.split('/').pop()
  /**
   * **والوزنُ من المجرَّد لا من المضموم** (D-099).
   *
   * ملفُّ التدقيق يحمل الخطَّ `base64` ليُقاس بخطّه الحقيقيّ — **وذاك
   * ليس ما يُشحَن**: الخطُّ في الإنتاج مسارٌ يُخبَّأ للأبد. فقياسُ
   * المضموم يتّهم صفحةً وزنُها الحقيقيُّ دونه بمئةِ كيلوبايت.
   *
   * و`writeAudited` يكتب الاثنين، والمجرَّدُ `.bare.html` بجانبه.
   * وإن غاب — رُسمت الصفحةُ بأداةٍ أخرى — قِيس الموجودُ ولا يُخترَع رقم.
   */
  const bare = file.replace(/\.html$/, '.bare.html')
  const weighed = existsSync(bare) ? bare : file
  const kb = Math.round(statSync(weighed).size / 1024)
  const gz = Math.round(gzipSync(readFileSync(weighed)).length / 1024)
  const notes = []

  for (const width of WIDTHS) {
    const page = await browser.newPage({
      viewport: { width, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    })
    await page.goto(`file://${file}`)
    // ما هو مخفيٌّ لا يُقاس، وعللُه تبقى — كما في `audit_scale`
    await page.evaluate(() => {
      document.querySelectorAll('section[data-pane]').forEach((s) => { s.hidden = false })
    })
    await page.waitForTimeout(250)

    const hits = await page.evaluate(
      ({ width, TAP, MIN_FIELD_FONT }) => {
        const out = []
        const key = (el) => {
          const cls = String(el.className || '').split(' ').filter(Boolean)[0]
          return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}`
        }
        // منظورٌ حقّا: ما في `details` مطويّ لا يُلمَس
        const shown = (el) => {
          if (el.closest('details:not([open])')) return false
          const b = el.getBoundingClientRect()
          return b.width > 0 && b.height > 0
        }

        // ١ · تمريرٌ أفقيّ — الوثيقةُ كلُّها، لا عنصرٌ مقصوصٌ بأبيه
        const over = document.documentElement.scrollWidth - width
        if (over > 1) out.push({ kind: 'overflow', what: 'الصفحة', detail: `تفيض ${Math.round(over)}px` })

        // ٢ · أهدافُ اللمس
        /*
         * **منطقةُ اللمس ليست صندوقَ العنصر وحده.**
         *
         * طبقةٌ مطلقةٌ في `::after` تُوسّعها فعلا — يُصيبها الإصبعُ
         * ويصل الحدثُ إلى الرابط — **ولا تظهر في `getBoundingClientRect`**.
         * فمدقّقٌ يقرأ الصندوقَ وحده يتّهم هدفا سليما.
         *
         * فتُقاس الطبقتان معه، بشرطين: أن تكون مطلقةً (فتخرج عن الصندوق)
         * وألّا تكون `pointer-events: none` (فتلك تُرى ولا تُلمَس).
         */
        /*
         * **واللصيقةُ الحاضنةُ هدفٌ كذلك** (D-100).
         *
         * صندوقُ الاختيار يرسمه المتصفّح ثلاثةَ عشرَ بكسلا، **ولا
         * يُكبَّر إلّا بأن يُرسَم من جديد** — وإعادةُ رسمه تفقده سلوكَ
         * النظام في قارئ الشاشة وفي التباين العالي.
         *
         * والطريقُ المعياريُّ أن يُلَفّ بـ`<label>`: **ضغطةٌ في أيّ موضعٍ
         * منها تُفعّل الصندوق** — وهذا سلوكُ HTML لا حيلةَ أنماط. فمنطقةُ
         * اللمس منطقتُها لا منطقتُه.
         *
         * وهي عينُ علّة `::after` في D-086: المدقّقُ يقرأ صندوقَ العنصر
         * وحدَه **فيتّهم هدفا سليما**. والفرقُ أنّ تلك طبقةٌ فوقه وهذه
         * حاضنةٌ حولَه.
         *
         * **وبشرطِ الضبط**: لصيقةٌ لغيره (`for` إلى عنصرٍ آخر) لا تُحتسَب،
         * فتلك تُفعّل شيئا ثالثا.
         */
        const owningLabel = (el) => {
          const lab = el.closest('label')
          if (lab === null) return null
          if (lab.htmlFor !== '' && lab.htmlFor !== el.id) return null
          return lab
        }

        const reach = (el) => {
          const b = el.getBoundingClientRect()
          let w = b.width
          let h = b.height
          for (const which of ['::before', '::after']) {
            const cs = getComputedStyle(el, which)
            if (cs.content === 'none' || cs.position !== 'absolute') continue
            if (cs.pointerEvents === 'none') continue
            w = Math.max(w, parseFloat(cs.width) || 0)
            h = Math.max(h, parseFloat(cs.height) || 0)
          }
          const lab = owningLabel(el)
          if (lab !== null) {
            const lb = lab.getBoundingClientRect()
            w = Math.max(w, lb.width)
            h = Math.max(h, lb.height)
          }
          return { w, h, box: b }
        }

        const seen = new Set()
        for (const el of document.querySelectorAll(
          'button,a[href],select,input:not([type=hidden]),textarea,summary,[role=button]',
        )) {
          if (!shown(el)) continue
          const { w, h, box: b } = reach(el)
          const min = Math.min(w, h)
          if (min >= TAP) continue
          const k = key(el)
          const id = `${k}|${Math.round(w)}x${Math.round(h)}`
          if (seen.has(id)) continue
          seen.add(id)
          out.push({
            kind: 'tap',
            what: k,
            detail: `${Math.round(w)}×${Math.round(h)} · «${(el.textContent || '').trim().slice(0, 18)}»`,
          })
        }

        /*
         * ٣ · حقولٌ يُقرِّبها iOS
         *
         * **والتقريبُ يقع عند الكتابة لا عند اللمس** (D-100): Safari
         * يقرّب حين يفتح لوحَ المفاتيح على حقلٍ خطُّه دون ستّةَ عشر.
         * **وصندوقُ اختيارٍ لا يفتح لوحَ مفاتيحَ ولا يعرض حرفا** — فلا
         * يُقرَّب، ومقاسُ خطِّه لا معنى له.
         *
         * وكانت القاعدةُ على كلّ `input`، فاتّهمت صندوقا لا نصَّ فيه.
         * **ومدقّقٌ يكذب مرّةً لا يُقرأ ثانيةً** (D-070).
         */
        const TYPELESS = new Set(['checkbox', 'radio', 'range', 'color', 'file', 'submit', 'button', 'reset', 'image'])
        const fields = new Set()
        for (const el of document.querySelectorAll('input:not([type=hidden]),select,textarea')) {
          if (!shown(el)) continue
          if (el.tagName === 'INPUT' && TYPELESS.has(el.type)) continue
          const fs = parseFloat(getComputedStyle(el).fontSize)
          if (fs >= MIN_FIELD_FONT) continue
          const k = key(el)
          if (fields.has(k)) continue
          fields.add(k)
          out.push({ kind: 'zoom', what: k, detail: `خطُّه ${fs}px` })
        }
        // ٤ · حرفٌ داخل SVG يتمدّد مع الرسم (D-153): ما دون ‏١١px لا يُقرأ
        for (const t of document.querySelectorAll('svg text')) {
          if (!shown(t)) continue
          const box = t.getBoundingClientRect()
          const fs = parseFloat(getComputedStyle(t).fontSize)
          const ratio = t.ownerSVGElement ? box.height / Math.max(1, t.getBBox().height) : 1
          const drawn = Math.round(fs * ratio)
          if (drawn < 11) out.push({ kind: 'svgtext', what: key(t), detail: `حرفُه ${drawn}px مرسومًا` })
        }
        return out
      },
      { width, TAP, MIN_FIELD_FONT },
    )

    for (const hit of hits) {
      if (ALLOWED.has(hit.what)) continue
      notes.push({ ...hit, width })
    }
    await page.close()
  }

  // ٤ و٥ · ما يُفحَص في الورقة لا في الصندوق
  const sheet = await browser.newPage()
  await sheet.goto(`file://${file}`)
  const css = await sheet.evaluate(() => {
    const rules = []
    const walk = (list) => {
      for (const r of list) {
        rules.push(r)
        if (r.cssRules) walk(r.cssRules)
      }
    }
    for (const s of document.styleSheets) {
      try { walk(s.cssRules) } catch { /* ورقةٌ لا تُقرأ — تُتخطّى */ }
    }
    const bare = []
    const vh = []
    for (const r of rules) {
      if (r.type !== 1) continue
      const text = r.cssText
      // `100vh` بلا احتياطِ `dvh` في القاعدة نفسِها
      if (/\b100vh\b/.test(text) && !/dvh/.test(text)) vh.push(r.selectorText)
      if (!/:hover/.test(r.selectorText ?? '')) continue
      // أهي داخل `@media (hover…)`؟ يُصعَد في السلسلة
      let node = r.parentRule
      let guarded = false
      while (node) {
        if (node.type === 4 && /\(\s*hover/.test(node.conditionText ?? node.media?.mediaText ?? '')) guarded = true
        node = node.parentRule
      }
      if (!guarded) bare.push(r.selectorText)
    }
    return { bare: [...new Set(bare)], vh: [...new Set(vh)] }
  })
  await sheet.close()

  for (const s of css.vh) notes.push({ kind: 'vh', what: s, detail: '`100vh` بلا احتياطِ `dvh`', width: 0 })
  for (const s of css.bare) notes.push({ kind: 'hover', what: s, detail: '`:hover` خارج `@media (hover)`', width: 0 })
  if (kb > MAX_PAGE_KB) notes.push({ kind: 'weight', what: name, detail: `${kb}KB فوق سقف ${MAX_PAGE_KB}KB`, width: 0 })
  if (gz > MAX_PAGE_GZ_KB) notes.push({ kind: 'weight', what: name, detail: `${gz}KB مضغوطةً فوق سقف ${MAX_PAGE_GZ_KB}KB`, width: 0 })

  const LABEL = {
    overflow: 'تمريرٌ أفقيّ',
    tap: 'هدفُ لمسٍ أصغرُ من ٤٤px',
    zoom: 'حقلٌ يُقرِّبه iOS',
    vh: 'ارتفاعٌ ثابتٌ لا ديناميّ',
    hover: 'تعليقٌ يعلق على اللمس',
    weight: 'وزنٌ فوق السقف',
    svgtext: 'حرفٌ في SVG يُقلَّص مع الرسم',
  }

  console.log(`\n═══ ${name} · ${kb}KB خامًا · ${gz}KB gzip ═══`)
  if (notes.length === 0) {
    console.log('  ✓ نظيف')
    continue
  }
  // يُجمَع بالصنف: عشرون سطرا متشابهًا لا تُقرأ، وصنفٌ بعدده يُقرأ
  const byKind = new Map()
  for (const n of notes) {
    const list = byKind.get(n.kind) ?? []
    list.push(n)
    byKind.set(n.kind, list)
  }
  for (const [kind, list] of byKind) {
    const uniq = [...new Map(list.map((n) => [`${n.what}|${n.detail}`, n])).values()]
    console.log(`  ✕ ${LABEL[kind]} — ${uniq.length}`)
    for (const n of uniq.slice(0, 8)) {
      console.log(`      ${n.what}  ${n.detail}${n.width ? `  @${n.width}px` : ''}`)
    }
    if (uniq.length > 8) console.log(`      … و${uniq.length - 8} غيرها`)
    failed += uniq.length
  }
}

await browser.close()

console.log(`\nالمجموع: ${failed} ملحوظة`)
if (failed > 0) {
  console.log(`
وكلٌّ منها **يُلمَس بالإصبع**: هدفٌ دون ٤٤px يُصاب بالمصادفة لا بالقصد،
وحقلٌ خطُّه دون ١٦px يقفز بالصفحة عند كلّ لمسة. ولا يُسكَت عنه، ولا
يُضاف إلى ALLOWED إلّا **بسطرٍ يقول لماذا لا تنطبق القاعدة**.`)
  process.exit(1)
}

/**
 * تدقيقُ التصميم — **بالقياس لا بالرأي.**
 *
 * ثلاثةُ معاييرَ تُقاس من المتصفّح نفسه، ولكلٍّ مصدرُه:
 *
 *   ١ · **حجمُ الهدف** ≥ 44×44 — WCAG 2.5.5 (AAA) و Apple HIG.
 *       وزرٌّ أصغرُ منه يُخطئه الإصبعُ على الجوّال، فيُضغط ما بجانبه.
 *   ٢ · **طولُ السطر** ≤ 75 محرفا — Bringhurst وقواعدُ الطباعة.
 *       والعينُ تفقد بدايةَ السطر التالي فيما هو أطول.
 *   ٣ · **لا فيضان أفقيّ** على 390px — صفحةٌ تُسحَب جانبا لا تُقرأ.
 *
 * ويُشغَّل على اللوحة والوثيقة معا، وفي المقاسين.
 *
 * ## ولماذا ليس في `npm run ci`
 *
 * يحتاج متصفّحا. وإضافةُ Playwright تبعيّةً تُبطئ كلَّ نشرٍ بعشرات
 * الميغابايتات **لأجل فحصٍ لا يُغيّره إلّا تعديلُ أنماط**. فيُشغَّل حين
 * تُمَسّ الأنماط، ومدقّقُ التباين — وهو خالصُ JS — يبقى في البوّابة.
 *
 *     npx tsx scripts/render_panel.ts /tmp/panel.html
 *     npx tsx scripts/render_legal.ts /tmp/privacy.html /privacy
 *     node scripts/audit_design.mjs /tmp/panel.html /tmp/privacy.html
 */
import { chromium } from 'playwright'

/**
 * أقصى فرقٍ مقبولٍ بين بطاقتين في صفٍّ واحد.
 *
 * **و‏٢٤px ليست ذوقا**: هي `--s-6`، أدنى مسافةٍ في السلّم تُقرأ فصلا
 * مقصودا. وما دونها يُقرأ اهتزازا. */
const MAX_TEAR = 24

const MIN_TARGET = 44
const MAX_LINE = 75

const pages = process.argv.slice(2)
if (pages.length === 0) {
  console.error('استعمال: audit_design.mjs <ملف.html> [...]')
  process.exit(2)
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const findings = []

for (const file of pages) {
  /*
   * **والوضعان يُدقَّقان معا** (D-102).
   *
   * الكثافةُ تضرب المسافاتِ في ‏٠٫٧٢، **وهدفُ اللمس ‏٤٤px لا يُمَسّ** — لكنّ
   * حشوا أضيق قد يُقرّب هدفين حتّى يلتقيا، أو يُسقط زرّا دون الحدّ بطريقٍ
   * غير مباشر. **ووضعٌ يُشحَن ولا يُدقَّق وضعٌ بلا حارس.**
   *
   * وتُضاف الشاشةُ العريضةُ كذلك: الرتبةُ الخامسةُ تُفتَح فوق ‏١٩٢٠ ولم
   * يكن يُقاس عندها شيء.
   */
  /*
   * **والليليُّ يُدقَّق مرسوما لا مقروءا من الرموز** (D-125).
   *
   * مدقّقُ التباين الثابت يفحص أزواجَ الرموز في الثيمين **ولا يرى عنصرا
   * يلبس ثيما غيرَ ثيم صفحته** — وقد وقع: زرُّ «ليليّ» بحبر الليل على أرض
   * النهار في كلّ صفحةٍ خارج اللوحة (D-124)، وكشفته عيّنةٌ لا رمز. فيُشغَّل
   * الوضعُ الأوّلُ مرّةً ثانيةً و`data-theme="dark"` على الجذر، **فيُقاس
   * التباينُ المحسوبُ والهندسةُ كلُّها بألوان الليل**.
   */
  for (const [label, width, density, theme] of [
    ['شاشة', 1440, null, null], ['عريضة', 2000, null, null],
    ['مضغوط', 1440, 'compact', null], ['جوّال', 390, null, null],
    ['ليليّ', 1440, null, 'dark'],
  ]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } })
    await page.goto(`file://${file}`)
    if (theme !== null) {
      await page.evaluate((t) => { document.documentElement.dataset.theme = t }, theme)
    }
    await page.waitForTimeout(700)
    /*
     * **لفظُ الطَيِّ يقول حالا واحدا** (D-112).
     *
     * وسمُ `summary` لا يُعلن لقارئ الشاشة أمفتوحٌ هو أم مطويّ، فالنّصُّ
     * يقوله: «افتح» مطويّاً و«أغلق» مفتوحاً. وكانت قاعدةُ التبديل
     * **مقصورةً على `.guide` و`.prow`** — فلمّا وُلِدَ مطويٌّ ثالثٌ يستعير
     * الوسمَ نفسَه ظهرت الكلمتان معاً، وسقط السهمُ كذلك.
     *
     * ولا يمسكها مدقّقُ تباينٍ ولا هدفُ لمس: الكلمتان **مقروءتان
     * وكبيرتان**، وإنّما هما متناقضتان. فتُقاس بقلب الحال: مطويّاً ثمّ
     * مفتوحاً، **ويُشترَط لفظٌ واحدٌ مرئيٌّ في كلٍّ**.
     *
     * وتُقاس قبل فتح الألواح أدناه، لأنّ الفتح يمحو الحالَ الذي تفحصه.
     */
    const labels = await page.evaluate(() => {
      const out = []
      for (const d of document.querySelectorAll('details')) {
        const sum = d.querySelector(':scope > summary')
        if (sum === null || sum.querySelector('.lbl-open') === null) continue
        const was = d.open
        const seenNow = () => [...sum.querySelectorAll('.lbl-open, .lbl-close')]
          .filter((e) => getComputedStyle(e).display !== 'none')
          .map((e) => e.textContent.trim())
        for (const open of [false, true]) {
          d.open = open
          const vis = seenNow()
          if (vis.length !== 1) {
            out.push({ cls: String(d.className).slice(0, 26), open, vis: vis.join('/') || '\u2014' })
          }
        }
        // والسهمُ زينةٌ، لكنّ غيابَه يقول إنّ النمطَ لم يبلغ هذا المطويّ
        const tog = sum.querySelector('.g-tog, .ptog')
        if (tog !== null && getComputedStyle(tog, '::after').content === 'none') {
          out.push({ cls: String(d.className).slice(0, 26), open: null, vis: '\u0628\u0644\u0627 \u0633\u0647\u0645' })
        }
        d.open = was
      }
      return out
    })

    // كلُّ الألواح تُفتح: ما هو مخفيٌّ لا يُقاس، وعللُه تبقى
    await page.evaluate(() => {
      document.querySelectorAll('section[data-pane]').forEach((s) => { s.hidden = false })
      document.querySelectorAll('details').forEach((d) => { d.open = true })
    })
    if (density !== null) {
      await page.evaluate((d) => { document.documentElement.dataset.density = d }, density)
    }
    await page.waitForTimeout(300)

    /*
     * **صفٌّ ممزَّقٌ يُقرأ عشوائيّةً** (D-111).
     *
     * قِيست شبكةُ القنوات فوُجدت بطاقاتٍ ‏٢٩٤ و‏٢١٦ و‏١٨١ في صفٍّ ارتفاعُه
     * ‏٢٩٤ — **فأزرارُ الفعل على ثلاثة خطوطٍ مختلفة**. ولا تمسكها عينٌ
     * تقرأ الشيفرة، ولا مدقّقُ تباينٍ ولا هدفُ لمس.
     *
     * **والقياسُ داخل الصفّ لا بين الصفوف**: شبكةٌ من أربعةٍ في عمودين
     * صفّاها مختلفان بطبيعتهما، **وفرقُهما ليس تمزّقا**. فتُجمَع العناصرُ
     * بموضعها الرأسيّ ثمّ يُقاس كلُّ صفٍّ وحدَه.
     *
     * **و`ragged` استثناءٌ مُعلَّل**: المسوّدةُ طولُها نصُّها وقد يزيد
     * بأضعاف، ومطُّها يفتح فراغا بقدر الفرق. فتُستثنى بصنفها لا بالصمت.
     */
    const torn = await page.evaluate((TEAR) => {
      const out = []
      /*
       * **والإعفاءُ يُعَدّ ولا يُصمَت عنه.**
       *
       * أوّلُ صياغةٍ استثنت `.ragged` بصمت، **فجُرِّبت بإعادة الصنف إلى
       * شبكةٍ ممزَّقةٍ فلم يسقط الحارس** — أي أنّ صنفا واحدا يُطفئه.
       * فصار عددُ المُعفاة يُطبَع مع النتيجة: **إعفاءٌ يُرى يُراجَع،
       * وإعفاءٌ يُصمَت عنه يشيخ.**
       */
      out.exempt = document.querySelectorAll('.grid.ragged').length
      for (const g of document.querySelectorAll('.grid:not(.ragged)')) {
        const kids = [...g.children].filter((e) => e.getBoundingClientRect().height > 0)
        const rows = new Map()
        for (const e of kids) {
          const r = e.getBoundingClientRect()
          const key = Math.round(r.top)
          rows.set(key, [...(rows.get(key) ?? []), { h: Math.round(r.height), cls: e.className }])
        }
        for (const items of rows.values()) {
          if (items.length < 2) continue
          const hs = items.map((x) => x.h)
          const gap = Math.max(...hs) - Math.min(...hs)
          if (gap > TEAR) {
            out.push({ gap, cls: String(items[0].cls).slice(0, 30), heights: hs.join('·') })
          }
        }
      }
      return { rows: out, exempt: out.exempt }
    }, MAX_TEAR)

    /*
     * **رقمٌ أوّلٌ واحدٌ في كلّ صفِّ مؤشّرات** (D-117).
     *
     * وفي الشيفرة قاعدةٌ قديمة: **الذهبُ للأوّل وحدَه** — «ندرةٌ تصنع
     * مرتبة، وذهبٌ على الأربعة يُلغي معنى الأوّل» (D-103). **وكان
     * القياسُ يخالف اللون**: أربعةُ أرقامٍ عند ‏٤٢px في صفٍّ واحد،
     * فتُقرأ الشاشةُ لوحةَ عدّاداتٍ لا شاشةَ عمل.
     *
     * **وهذه تُحرَس ولا تُستفتى**: تقارن قياسَ خطٍّ بقياسِ خطّ داخل
     * صنفٍ واحد (`.tile .v`) — **ولا رأيَ لأحدٍ في أيُّهما أكبر**. وهو
     * الفرقُ عن نسبة الشرح التي رُفض حَرسُها (D-113).
     */
    const ranks = await page.evaluate(() => {
      const out = []
      for (const s of document.querySelectorAll('section[data-pane]')) {
        const was = s.hidden
        s.hidden = false
        const vs = [...s.querySelectorAll('.tile .v')]
          .filter((e) => e.getBoundingClientRect().height > 0)
          .map((e) => Math.round(Number.parseFloat(getComputedStyle(e).fontSize)))
        s.hidden = was
        if (vs.length < 2) continue
        const top = Math.max(...vs)
        const tied = vs.filter((v) => v === top).length
        if (tied > 1) out.push({ pane: s.dataset.pane, tied, total: vs.length, top })
      }
      return out
    })

    /*
     * **عمودٌ فارغٌ في صفّ مؤشّرات، وترويسةٌ بلا جسد** (D-124).
     *
     * كلاهما رُئي بالعين بعد أن قال المدقّقُ «صفرا» (لاحقةُ D-123):
     * أربعُ بطاقاتٍ في خمسة أعمدة، وعنوانُ «ضبطُ التطبيق» تحته لا شيء.
     * **وكلاهما هندسةٌ لا حكم**: عددُ الأعمدة المحسوبة مقابلَ عدد
     * الأبناء، وعنوانٌ لا يليه في أبيه ما له نصٌّ أو أداة.
     *
     * والصفُّ يُحاسَب حين يكون كلُّ أبنائه `.tile`: شبكةُ المسوّدات تنقص
     * أبناؤها بالمحتوى لا بالتصميم، وشبكةُ المؤشّرات لا تنقص إلّا بعيب.
     * ويُستثنى الجوّالُ: الأعمدةُ هناك واحدةٌ قصدا.
     */
    const shape = await page.evaluate((width) => {
      const holes = []
      const orphans = []
      const panes = [...document.querySelectorAll('section[data-pane]')]
      const was = panes.map((s) => s.hidden)
      panes.forEach((s) => { s.hidden = false })
      if (width > 720) {
        for (const g of document.querySelectorAll('.grid')) {
          const kids = [...g.children]
          if (kids.length < 2 || !kids.every((k) => k.classList.contains('tile'))) continue
          const cols = getComputedStyle(g).gridTemplateColumns.split(' ').filter((c) => c !== '').length
          if (cols > kids.length) holes.push({ cls: g.className, cols, kids: kids.length })
        }
      }
      /*
       * **بطاقةٌ فارغةُ الذيل** (D-136): شبكةٌ تمدّ بطاقةً لتساوي جارتَها،
       * فيبقى تحت رسم الإنفاق نصفُ متر أبيض. رُئي بالعين في نظرةٍ عامّة على
       * ‏١٤٤٠ بعد أن قال المدقّق «صفرا». والقياسُ هندسة: أسفلُ آخر محتوًى
       * مقابلَ أسفل البطاقة بعد حشوتها، **وذيلٌ أطولُ من ‏١٢٠px فراغٌ لا
       * تنفّس** (ثلاثةُ أسطرٍ من النصّ).
       */
      const tails = []
      if (width > 720) {
        for (const c of document.querySelectorAll('.card')) {
          const r = c.getBoundingClientRect()
          if (r.height < 200) continue
          let last = r.top
          for (const el of c.querySelectorAll('*')) {
            if (el.closest('script,style,template') !== null) continue
            const b = el.getBoundingClientRect()
            if (b.height === 0) continue
            const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim() !== '')
            if (own || /^(svg|table|button|input|select|textarea|img|canvas)$/i.test(el.tagName)) last = Math.max(last, b.bottom)
          }
          const pad = parseFloat(getComputedStyle(c).paddingBottom) || 0
          const tail = Math.round(r.bottom - pad - last)
          if (tail > 120) tails.push({ head: (c.querySelector('h2,h3')?.textContent ?? '').trim().slice(0, 30), tail, height: Math.round(r.height) })
        }
      }
      /*
       * **بطاقةٌ جوفاءُ العرض** (D-137): بطاقةٌ عريضةٌ طويلةٌ محتواها في نصفها،
       * ونصفُها الآخر أبيض — كلوح اليوم الأوّل على ‏١٤٤٠: خمسُ خطواتٍ في
       * ‏٤٥٪ من عرضها. والقياسُ هندسةٌ كسابقه: مدى المحتوى أفقيًّا مقابلَ
       * عرض البطاقة بعد حشوتها، **ودون ‏٥٥٪ في بطاقةٍ فوق ‏٣٠٠px علّة**.
       * وتُستثنى بطاقةٌ قصيرة: فقرةٌ واحدةٌ بمقياسها المقروء ليست جوفاء.
       */
      const hollow = []
      if (width > 900) {
        for (const c of document.querySelectorAll('.card')) {
          const r = c.getBoundingClientRect()
          if (r.height < 300 || r.width < 700) continue
          let left = Infinity, right = -Infinity
          for (const el of c.querySelectorAll('*')) {
            if (el.closest('script,style,template') !== null) continue
            const b = el.getBoundingClientRect()
            if (b.height === 0 || b.width === 0) continue
            const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim() !== '')
            if (!own && !/^(svg|table|button|input|select|textarea|img|canvas)$/i.test(el.tagName)) continue
            left = Math.min(left, b.left); right = Math.max(right, b.right)
          }
          if (left === Infinity) continue
          const cs = getComputedStyle(c)
          const inner = r.width - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0)
          const share = (right - left) / inner
          if (share < 0.55) hollow.push({ head: (c.querySelector('h1,h2,h3')?.textContent ?? '').trim().slice(0, 30), share: Math.round(share * 100), height: Math.round(r.height) })
        }
      }
      for (const h of document.querySelectorAll('h2.sec, h3.sec')) {
        let sib = h.nextElementSibling
        let fed = false
        while (sib !== null) {
          if (sib.textContent.trim() !== '' || sib.querySelector('svg,img,input,table,button') !== null) { fed = true; break }
          sib = sib.nextElementSibling
        }
        if (!fed) orphans.push({ text: h.textContent.trim().slice(0, 30) })
      }
      panes.forEach((s, i) => { s.hidden = was[i] })
      return { holes, orphans, tails, hollow }
    }, width)

    /*
     * **الرحلةُ بلوحة المفاتيح** (D-125).
     *
     * إمكانيّةُ الوصول الوحيدةُ التي لم تُقَس: التباينُ يُقاس، والهدفُ
     * يُقاس، **وترتيبُ `Tab` لم يضغطه أحدٌ في مدقّق**. فيُضغَط هنا فعلا —
     * ضغطةً ضغطةً حتّى يخرج التركيزُ من الصفحة — ويُقاس ثلاثةٌ، وكلُّها
     * وجودٌ مقابلَ غياب:
     *
     * | ما يُقاس | الحكم |
     * |---|---|
     * | عنصرٌ تفاعليٌّ مرئيٌّ لا يبلغه `Tab` | يُتخطّى — ولا يصل إليه من لا فأرةَ له |
     * | تركيزٌ يقع على عنصرٍ بلا صندوق | يضيع — يضغط المالكُ ولا يرى أين |
     * | عنصرٌ مركَّزٌ بلا حلقةٍ مرئيّة | `outline` و`box-shadow` كلاهما `none` |
     * | التركيزُ يعود إلى عنصرٍ مرّ به | مصيدة |
     *
     * وأوّلُ ضغطةٍ تبلغ رابطَ التخطّي حيث وُجد (WCAG 2.4.1).
     *
     * **وتُقاس في الوضع الأوّل وحدَه**: الترتيبُ ترتيبُ الشجر، ولا يبدّله
     * عرضٌ ولا كثافةٌ ولا ثيم. وضغطُ ثلاثمئة `Tab` خمسَ مرّاتٍ لا يقيس شيئا
     * جديدا.
     */
    let keyboard = { unreached: [], blind: [], ringless: [], trapped: false, skipFirst: true, reached: 0, expected: 0 }
    if (label === 'شاشة') {
      /*
       * **والهويّةُ تُعلَّق على العنصر لا تُحسَب من موضعه.** أوّلُ صياغةٍ
       * عرّفت العنصرَ بترتيبه في الشجرة، **والنصُّ يبدّل الشجرةَ وهي
       * تُضغَط** — فقرأ عنصرا جديدا بمفتاح عنصرٍ مرّ به وصاح «مصيدة».
       */
      // وما رُكِّز عند التحميل (`autofocus`) بُلغ بلا ضغطة — يُعَدّ مبلوغا،
      // **ويُوصَف قبل أن يُرفَع عنه التركيز**: ظلُّ سكونه يُقاس بلا تركيز،
      // وإلّا قُرئت حلقتُه ظلَّ سكونٍ فقيل «بلا حلقة» — وقد قيل مرّةً
      const describe = () => {
        const el = document.activeElement
        if (el === null || el === document.body || el === document.documentElement) return null
        if (el.__kb === undefined) el.__kb = `x${Math.random().toString(36).slice(2, 8)}`
        const st = getComputedStyle(el)
        const r = el.getBoundingClientRect()
        // الحلقةُ: خطٌّ خارجيٌّ ظاهر، **أو ظلٌّ تغيّر عن ظلّ السكون**
        const outlined = st.outlineStyle !== 'none' && Number.parseFloat(st.outlineWidth) > 0
        const ring = outlined || (el.__rest !== undefined ? st.boxShadow !== el.__rest : st.boxShadow !== 'none')
        return { key: el.__kb, tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 24),
          text: (el.textContent || el.value || el.getAttribute('aria-label') || '').trim().slice(0, 24),
          box: r.width > 0 && r.height > 0, ring,
          // وحقلُ التاريخ أجزاءٌ يمشي `Tab` بينها والعنصرُ واحد — ليس مصيدة
          parts: /^(date|time|datetime-local|month|week)$/.test(el.type ?? '') }
      }
      const initial = await page.evaluate(describe)
      const expected = await page.evaluate(() => {
        // **والحركةُ تُطفأ قبل القياس**: ظلُّ التركيز ينتقل في ‏١٥٠ms، وقراءةٌ
        // في منتصف الانتقال تعطي ظلَّ السكون ظلَّ تركيز — فيُقرأ ما يستقرّ عليه
        const still = document.createElement('style')
        still.textContent = '*{transition:none!important}'
        document.head.appendChild(still)
        document.activeElement?.blur?.()
        window.scrollTo(0, 0)
        const sel = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [tabindex]'
        const out = []
        let n = 0
        for (const el of document.querySelectorAll(sel)) {
          if (el.__kb === undefined) el.__kb = `e${n += 1}`
          if (el.disabled || el.closest('[inert], [hidden], [data-palette]') !== null) continue
          const r = el.getBoundingClientRect()
          // ورابطُ التخطّي مقصوصٌ حتّى يُركَّز — مرئيٌّ بالقصد لا بالصندوق
          if (!(r.width > 0 && r.height > 0) && !el.classList.contains('skip')) continue
          if (getComputedStyle(el).visibility === 'hidden') continue
          // وظلُّ السكون يُحفَظ: **ظلٌّ زينةٌ على زرٍّ ليس حلقةَ تركيز** —
          // أوّلُ صياغةٍ قرأت «box-shadow ≠ none» فرأت حلقةً في كلّ زرٍّ له ظلّ
          el.__rest = getComputedStyle(el).boxShadow
          out.push({ key: el.__kb, tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 24),
            text: (el.textContent || el.value || el.getAttribute('aria-label') || '').trim().slice(0, 24),
            neg: el.getAttribute('tabindex') === '-1' })
        }
        return out
      })
      const reached = new Map()
      let trapped = false
      let skipFirst = true
      let last = null
      let stay = 0
      /*
       * **والمشيُ من أوّل الصفحة لا من حيث وقف التركيز.** `blur()` لا يعيد
       * نقطةَ البدء: المتصفّح يحفظها عند آخر عنصرٍ رُكِّز، فـ`Tab` بعد
       * `autofocus` يقفز فوق كلّ ما قبله — وقرأ المدقّقُ زرَّ مفتاح المرور
       * «لا يُبلَغ» وهو قبل الحقل. فتُعاد نقطةُ البدء إلى رأس الجسد بعنصرٍ
       * مؤقّتٍ يُركَّز ثمّ يُرفَع.
       */
      await page.evaluate(() => {
        const s = document.createElement('span')
        s.tabIndex = -1
        document.body.prepend(s)
        s.focus()
        s.remove()
      })
      for (let i = 0; i <= expected.length * 2 + 8; i += 1) {
        await page.keyboard.press('Tab')
        const cur = await page.evaluate(describe)
        if (cur === null) break
        if (i === 0) skipFirst = cur.cls.includes('skip') || expected.every((e) => !e.cls.includes('skip'))
        if (reached.has(cur.key)) {
          if (cur.parts && cur.key === last && (stay += 1) < 8) continue
          trapped = true
          break
        }
        stay = 0
        last = cur.key
        reached.set(cur.key, cur)
      }
      if (initial !== null && !reached.has(initial.key)) reached.set(initial.key, initial)
      keyboard = {
        expected: expected.length, reached: reached.size, trapped, skipFirst,
        unreached: expected.filter((e) => !reached.has(e.key)),
        blind: [...reached.values()].filter((c) => !c.box && !c.cls.includes('skip')),
        ringless: [...reached.values()].filter((c) => !c.ring),
      }
    }

    const result = await page.evaluate(({ MIN_TARGET, MAX_LINE }) => {
      const seen = (el) => {
        const r = el.getBoundingClientRect()
        return r.width > 0 && r.height > 0
      }

      /*
       * **واللصيقةُ الحاضنةُ هي الهدف** (D-100).
       *
       * صندوقُ الاختيار يرسمه المتصفّح ثلاثةَ عشرَ بكسلا ولا يُكبَّر إلّا
       * بإعادة رسمه — وإعادةُ رسمه تفقده سلوكَ النظام في قارئ الشاشة.
       * فيُلَفّ بـ`<label>`، **وضغطةٌ في أيّ موضعٍ منها تُفعّله**: سلوكُ
       * HTML لا حيلةُ أنماط.
       *
       * فمدقّقٌ يقرأ صندوقَ العنصر وحدَه يتّهم هدفا سليما — وهي علّةُ
       * `::after` في D-086 معكوسةً: تلك طبقةٌ فوقه، وهذه حاضنةٌ حولَه.
       * **ولصيقةٌ لغيره (`for` إلى عنصرٍ آخر) لا تُحتسَب.**
       */
      const target = (el) => {
        const r = el.getBoundingClientRect()
        const lab = el.closest('label')
        if (lab === null || (lab.htmlFor !== '' && lab.htmlFor !== el.id)) return r
        const lr = lab.getBoundingClientRect()
        return { width: Math.max(r.width, lr.width), height: Math.max(r.height, lr.height) }
      }

      const small = []
      for (const el of document.querySelectorAll('button, a.btn, input:not([type=hidden]), select, textarea, summary')) {
        if (!seen(el)) continue
        const r = target(el)
        if (r.height < MIN_TARGET || r.width < MIN_TARGET) {
          small.push({
            tag: el.tagName.toLowerCase(),
            cls: el.className || '',
            text: (el.textContent || el.value || '').trim().slice(0, 28),
            w: Math.round(r.width), h: Math.round(r.height),
          })
        }
      }

      // طولُ السطر: عرضُ الصندوق مقسوما على عرض المحرف الفعليّ
      const long = []
      const probe = document.createElement('span')
      probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre'
      document.body.appendChild(probe)
      for (const el of document.querySelectorAll('p, li, .sub, .ch-note, .lede-note, .hint')) {
        if (!seen(el)) continue
        const text = (el.textContent || '').trim()
        if (text.length < 90) continue
        const style = getComputedStyle(el)
        probe.style.font = style.font
        probe.textContent = 'م'.repeat(50)
        const charWidth = probe.getBoundingClientRect().width / 50
        const chars = Math.round(el.getBoundingClientRect().width / charWidth)
        if (chars > MAX_LINE) {
          long.push({ cls: el.className || el.tagName.toLowerCase(), chars, text: text.slice(0, 34) })
        }
      }
      probe.remove()

      // ── التباينُ **محسوبا** لا مقروءا من الرموز ────────────────────
      //
      // ومدقّقُ الرموز يفحص القيَم، وهي قد تكون كلُّها صحيحة ويقع العطل
      // مع ذلك: المتغيّراتُ تُورَث، أمّا اللونُ فيُورَث محسوبا. فعنصرٌ
      // يعيد تعريف الرموز على نفسه (الرافدةُ الداكنة في الثيم النهاريّ)
      // **لا يغيّر لونا ورثه أبناؤه من الجسد** — فيقع حبرٌ داكنٌ على
      // أرضٍ داكنة، والقيَمُ كلُّها سليمة.
      //
      // فيُقاس ما يراه المتصفّح: لونُ النصّ الفعليّ في مقابل أقربِ
      // خلفيّةٍ غيرِ شفّافة فوقه.
      const rgb = (v) => {
        const m = (v || '').match(/[\d.]+/g)
        return m && m.length >= 3 ? m.slice(0, 3).map(Number) : null
      }
      const alpha = (v) => {
        const m = (v || '').match(/[\d.]+/g)
        return m && m.length >= 4 ? Number(m[3]) : 1
      }
      const lum = ([r, g, b]) => {
        const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
      }
      const contrast = (a, b) => {
        const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
        return (hi + 0.05) / (lo + 0.05)
      }
      const groundOf = (el) => {
        for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
          const bg = getComputedStyle(n).backgroundColor
          if (alpha(bg) > 0.85) { const c = rgb(bg); if (c) return c }
        }
        // ولا أرضَ مفترَضة: ما لم يُوجَد أرضٌ كثيفةٌ فأرضُ الجذر — وهي في الليل ليلٌ
        const root = rgb(getComputedStyle(document.documentElement).backgroundColor)
        return root ?? [255, 255, 255]
      }

      const faint = []
      for (const el of document.querySelectorAll('body *')) {
        if (!seen(el)) continue
        // نصٌّ مباشرٌ فقط: الحاوياتُ تُقاس بأبنائها لا بنفسها
        const own = [...el.childNodes]
          .filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join('')
        if (own.length < 2) continue
        const style = getComputedStyle(el)
        if (style.visibility === 'hidden' || Number(style.opacity) < 0.15) continue
        const fg = rgb(style.color)
        if (fg === null || alpha(style.color) < 0.5) continue
        const size = Number.parseFloat(style.fontSize)
        const bold = Number(style.fontWeight) >= 700
        // حدُّ WCAG AA: 3:1 للكبير (18.66px فأكبر، أو 14px عريض)
        const min = size >= 18.66 || (bold && size >= 14) ? 3 : 4.5
        const value = contrast(fg, groundOf(el))
        if (value < min) {
          faint.push({
            cls: el.className || el.tagName.toLowerCase(),
            text: own.slice(0, 26),
            ratio: Math.round(value * 100) / 100, min,
          })
        }
      }

      const overflow = document.documentElement.scrollWidth > window.innerWidth + 1
      return { small, long, faint, overflow, scrollWidth: document.documentElement.scrollWidth }
    }, { MIN_TARGET, MAX_LINE })

    findings.push({ file: file.split('/').pop(), label, width, ...result })
    findings[findings.length - 1].torn = torn.rows
    findings[findings.length - 1].exempt = torn.exempt
    findings[findings.length - 1].labels = labels
    findings[findings.length - 1].ranks = ranks
    findings[findings.length - 1].holes = shape.holes
    findings[findings.length - 1].orphans = shape.orphans
    findings[findings.length - 1].tails = shape.tails
    findings[findings.length - 1].hollow = shape.hollow
    findings[findings.length - 1].keyboard = keyboard
    await page.close()
  }
}
await browser.close()

let failed = 0
for (const f of findings) {
  const issues = f.small.length + f.long.length + f.faint.length +
    (f.torn ?? []).length + (f.labels ?? []).length + (f.ranks ?? []).length +
    (f.holes ?? []).length + (f.orphans ?? []).length + (f.tails ?? []).length + (f.hollow ?? []).length +
    (f.keyboard?.unreached.length ?? 0) + (f.keyboard?.blind.length ?? 0) + (f.keyboard?.ringless.length ?? 0) +
    (f.keyboard?.trapped ? 1 : 0) + (f.keyboard?.skipFirst === false ? 1 : 0) +
    (f.overflow ? 1 : 0)
  failed += issues
  console.log(`\n═══ ${f.file} · ${f.label} (${f.width}px) ═══`)
  const kb = f.keyboard
  const kbNote = kb !== undefined && f.label === 'شاشة' ? ` · Tab بلغ ${kb.reached} من ${kb.expected}` : ''
  if (issues === 0) {
    console.log(`  ✓ نظيف${(f.exempt ?? 0) > 0 ? ` · ${f.exempt} شبكةً معفاةً بـ ragged` : ''}${kbNote}`)
    continue
  }
  if (kb !== undefined && kb.trapped) console.log('  ✕ مصيدةُ تركيز: Tab عاد إلى عنصرٍ مرّ به')
  if (kb !== undefined && kb.skipFirst === false) console.log('  ✕ أوّلُ Tab لا يبلغ رابطَ التخطّي')
  if (kb !== undefined && kb.unreached.length > 0) {
    console.log(`  ✕ ${kb.unreached.length} عنصرا تفاعليّا لا يبلغه Tab${kbNote}:`)
    for (const u of kb.unreached.slice(0, 8)) console.log(`      ${u.tag}.${u.cls}${u.neg ? ' [tabindex=-1]' : ''} «${u.text}»`)
  }
  if (kb !== undefined && kb.blind.length > 0) {
    console.log(`  ✕ ${kb.blind.length} تركيزا على عنصرٍ بلا صندوق:`)
    for (const b of kb.blind.slice(0, 8)) console.log(`      ${b.tag}.${b.cls} «${b.text}»`)
  }
  if (kb !== undefined && kb.ringless.length > 0) {
    console.log(`  ✕ ${kb.ringless.length} عنصرا مركَّزا بلا حلقةٍ مرئيّة:`)
    for (const b of kb.ringless.slice(0, 8)) console.log(`      ${b.tag}.${b.cls} «${b.text}»`)
  }
  if (f.overflow) console.log(`  ✕ فيضانٌ أفقيّ: ${f.scrollWidth}px > ${f.width}px`)
  if (f.small.length > 0) {
    console.log(`  ✕ ${f.small.length} هدفا دون ${MIN_TARGET}px:`)
    const byClass = new Map()
    for (const s of f.small) {
      const k = `${s.tag}.${s.cls}`.slice(0, 44)
      const prev = byClass.get(k)
      if (prev === undefined || s.h < prev.h) byClass.set(k, s)
    }
    for (const [k, s] of [...byClass].slice(0, 12)) console.log(`      ${k} — ${s.w}×${s.h} «${s.text}»`)
  }
  if (f.long.length > 0) {
    console.log(`  ✕ ${f.long.length} كتلةً فوق ${MAX_LINE} محرفا:`)
    for (const l of f.long.slice(0, 8)) console.log(`      ${l.cls} — ${l.chars} محرفا «${l.text}»`)
  }
  if ((f.torn ?? []).length > 0) {
    console.log(`  ✕ ${f.torn.length} صفّا ممزَّقا (فوق ${MAX_TEAR}px):`)
    for (const t of f.torn.slice(0, 8)) {
      console.log(`      ${t.cls} — فرقٌ ${t.gap}px · ارتفاعات ${t.heights}`)
    }
  }
  if ((f.labels ?? []).length > 0) {
    console.log(`  \u2715 ${f.labels.length} \u0645\u0637\u0648\u064a\u0651\u0627\u064b \u0644\u0641\u0638\u064f \u0637\u064e\u064a\u0651\u0650\u0647 \u0644\u0627 \u064a\u0642\u0648\u0644 \u062d\u0627\u0644\u0627\u064b \u0648\u0627\u062d\u062f\u0627\u064b:`)
    for (const l of f.labels.slice(0, 8)) {
      const st = l.open === null ? '' : ` \u00b7 ${l.open ? '\u0645\u0641\u062a\u0648\u062d' : '\u0645\u0637\u0648\u064a\u0651'}`
      console.log(`      .${l.cls}${st} \u2014 \u0627\u0644\u0645\u0631\u0626\u064a\u0651: ${l.vis}`)
    }
  }
  if ((f.ranks ?? []).length > 0) {
    console.log(`  \u2715 ${f.ranks.length} \u0635\u0641\u0651\u064e \u0645\u0624\u0634\u0651\u0631\u0627\u062a\u064d \u0628\u0644\u0627 \u0631\u0642\u0645\u064d \u0623\u0648\u0651\u0644:`)
    for (const r of f.ranks) {
      console.log(`      ${r.pane} \u2014 ${r.tied} \u0645\u0646 ${r.total} \u0639\u0646\u062f ${r.top}px`)
    }
  }
  if ((f.holes ?? []).length > 0) {
    console.log(`  ✕ ${f.holes.length} صفَّ مؤشّراتٍ فيه عمودٌ فارغ:`)
    for (const h of f.holes) console.log(`      .${h.cls} — ${h.kids} بطاقاتٍ في ${h.cols} أعمدة`)
  }
  if ((f.orphans ?? []).length > 0) {
    console.log(`  ✕ ${f.orphans.length} ترويسةً بلا جسد:`)
    for (const o of f.orphans) console.log(`      «${o.text}»`)
  }
  if ((f.tails ?? []).length > 0) {
    console.log(`  ✕ ${f.tails.length} بطاقةً فارغةَ الذيل:`)
    for (const t of f.tails) console.log(`      «${t.head}» — ${t.tail}px فراغٌ من ${t.height}px`)
  }
  if ((f.hollow ?? []).length > 0) {
    console.log(`  ✕ ${f.hollow.length} بطاقةً جوفاءَ العرض:`)
    for (const h of f.hollow) console.log(`      «${h.head}» — المحتوى في ${h.share}٪ من عرضها، وطولُها ${h.height}px`)
  }
  if (f.faint.length > 0) {
    console.log(`  ✕ ${f.faint.length} نصّا دون حدّ التباين (محسوبا لا من الرموز):`)
    for (const c of f.faint.slice(0, 10)) {
      console.log(`      ${String(c.cls).slice(0, 34)} — ${c.ratio}:1 (الحدّ ${c.min}) «${c.text}»`)
    }
  }
}
console.log(`\nالمجموع: ${failed} ملحوظة`)
process.exit(failed > 0 ? 1 : 0)

/**
 * مدقّقُ الوصول بمحرّكٍ لم نكتبه — **axe-core** من Deque.
 *
 * ## لماذا وُجد
 *
 * مدقّقاتُ صدى السبعةَ عشرَ كتبناها نحن، **فهي تمسك ما فكّرنا فيه**: التباينَ والمسَّ
 * والاتّجاهَ والسلّم. وما لم نفكّر فيه لا يمسكه أحد. فشُغّل axe-core على الشاشات
 * الثلاثين في الوضعين، فوجد ثمانيةَ أنواعٍ لم يمسكها مدقّقٌ واحد، **منها اثنان خطيران**:
 * نقاطُ الأسبوع في الرئيسيّة تحمل `aria-label` على `span` بلا دور فلا يُنطَق، وقائمةُ
 * الهبوط فيها ما ليس `li`. والتباينُ نجح كلُّه — فالمحرّكُ يؤكّد ما قسناه ويزيد عليه.
 *
 * ## ما يُفحَص
 *
 * | الوسوم | ما تعني |
 * |---|---|
 * | `wcag2a` · `wcag2aa` · `wcag21a` · `wcag21aa` · `wcag22aa` | معاييرُ WCAG 2.2 حتى AA |
 * | `best-practice` | قواعدُ Deque فوق المعيار: معلمٌ رئيسيٌّ واحد، و`h1`، وترتيبُ العناوين |
 *
 * **ولا استثناءَ بالقاعدة.** قاعدةٌ تُطفأ هنا تُطفأ في كلّ شاشةٍ تأتي بعدها؛ والمخالفةُ
 * التي لا تُصلَح تُصلَح في الوسم أو تُكتب قرارًا. والمحرّكُ يمسك نحوَ نصف ما يجده
 * المدقّقُ البشريّ (دراسةُ Deque على ٢٠٠٠ تدقيق) — **فلا يُغني عن جلسات التجربة**.
 *
 * ## والليليُّ يُفحَص أيضا
 *
 * كما في `audit_print`: `data-theme="dark"` على الجذر، والألواحُ المخفيّةُ تُظهَر
 * كما في `audit_mobile` — ما هو مخفيٌّ لا يُفحَص، وعللُه تبقى.
 *
 * ## والهاتفُ والمفتوحُ أيضًا (D-323)
 *
 * كان يُفحَص مقاسٌ واحدٌ (‏1280) وصفحاتٌ ساكنة: الطيّاتُ مغلقة، والحوارُ لم يُفتح، ولوحُ الاختصارات مخفيّ — **فما
 * داخلها لم يُفحَص قطّ**، والمالكُ على الهاتف. فلكلّ عيّنةٍ أربعةُ مرورٍ لا اثنان:
 *
 * | المرور | ما يُفتح |
 * |---|---|
 * | ‏1280 · نهاريّ وليليّ | كما كان |
 * | ‏390 لمسًا · نهاريّ | الهاتف: الشريطُ السفليّ وورقةُ «المزيد» والأعمدةُ المكدّسة |
 * | مفتوح · ‏1280 · نهاريّ | كلُّ `<details>` مفتوحة (والقوائمُ المنسدلة)، ولوحُ الاختصارات ظاهرًا |
 * | التلميح · ‏1280 | التلميحُ ظاهرًا بالتركيز على أوّل هدف، ويُفحَص وحدَه |
 * | كلُّ حوار · ‏1280 | كلُّ `<dialog>` يُفتح وحدَه (وحوارُ التأكيد منها)، ولوحةُ الأوامر (⌘K)، ويُفحَص ما فيه وحدَه |
 * | كلُّ طافية · ‏1280 | القائمةُ المنسدلة وورقةُ «المزيد» والزرُّ العائم، كلٌّ وحدَها ويُفحَص ما فيها |
 *
 * **وهدفُ التلميح يُعَدّ** (D-323 · WCAG 1.4.13): كلُّ `[data-tip]` لا يأخذ التركيزَ ولا فيه ما يأخذه يُسقط الفحص —
 * تلميحٌ لا تصله لوحةُ المفاتيح ولا اللمسُ معلومةٌ بالفأرة وحدها.
 *
 *     node scripts/audit_a11y.mjs /tmp/panel.html /tmp/screen-login.html …
 */
import { chromium } from 'playwright'
import { AxeBuilder } from '@axe-core/playwright'

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']
const DESKTOP = { viewport: { width: 1280, height: 900 } }
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }

const files = process.argv.slice(2)
if (files.length === 0) {
  console.error('الاستعمال: node scripts/audit_a11y.mjs <ملفّ.html>…')
  process.exit(2)
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
let failed = 0
let runs = 0
let unreachable = 0

/** يفتح العيّنةَ بمقاسها وثيمها، ويُظهر الألواح، ويُنهي الصعود. */
async function open(file, device, theme) {
  const context = await browser.newContext(device)
  const page = await context.newPage()
  await page.goto(`file://${file}`)
  await page.evaluate((t) => {
    if (t !== null) document.documentElement.dataset.theme = t
    document.querySelectorAll('section[data-pane]').forEach((s) => { s.hidden = false })
  }, theme)
  await page.waitForTimeout(250)
  // ‏**والصعودُ يُنهى قبل الفحص** (D-246): بطاقةٌ في منتصف صعودها نصفُ شفّافة، فيقرأ axe تباينَ ما فيها
  // ‏أقلَّ ممّا يستقرّ عليه. فيُفحَص الحالُ الأخير، والوميضُ المتكرّر يبقى كما هو
  await page.evaluate(() => { for (const a of document.getAnimations()) if (a.effect?.getTiming().iterations !== Infinity) a.finish() })
  return { context, page }
}

function report(name, violations) {
  runs += 1
  if (violations.length === 0) {
    console.log(`✓ ${name}`)
    return
  }
  console.log(`✕ ${name}`)
  for (const v of violations) {
    failed += v.nodes.length
    console.log(`  ✕ ${v.id} [${v.impact}] — ${v.nodes.length}: ${v.help}`)
    for (const n of v.nodes.slice(0, 3)) console.log(`      ${n.target.join(' ')}`)
  }
}

const settle = (page) => page.evaluate(() => { for (const a of document.getAnimations()) if (a.effect?.getTiming().iterations !== Infinity) a.finish() })

for (const file of files) {
  const base = file.split('/').pop()
  for (const [device, theme, tag] of [[DESKTOP, null, ''], [DESKTOP, 'dark', ' · ليليّ'], [PHONE, null, ' · ‏390']]) {
    const { context, page } = await open(file, device, theme)
    report(`${base}${tag}`, (await new AxeBuilder({ page }).withTags(TAGS).analyze()).violations)
    if (device === DESKTOP && theme === null) {
      // ‏هدفُ التلميح بلا تركيز (D-323)
      const lost = await page.evaluate(() => {
        const FOCUS = 'a[href],button:not([disabled]),input:not([type=hidden]):not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])'
        return [...document.querySelectorAll('[data-tip]')]
          .filter((el) => !(el.matches(FOCUS) && !el.matches(':disabled')) && el.querySelector(FOCUS) === null)
          .map((el) => `${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(' ')[0] : ''} «${(el.getAttribute('data-tip') ?? '').slice(0, 30)}»`)
      })
      if (lost.length > 0) {
        unreachable += lost.length
        console.log(`✕ ${base} · تلميحٌ لا يصله التركيز — ${lost.length}`)
        for (const l of lost.slice(0, 5)) console.log(`      ${l}`)
      }
    }
    await context.close()
  }

  // ‏المفتوح: الطيّاتُ والقوائمُ ولوحُ الاختصارات والتلميح
  {
    const { context, page } = await open(file, DESKTOP, null)
    const opened = await page.evaluate(() => {
      let n = 0
      // ‏والطافيةُ (القائمةُ وورقةُ «المزيد» والزرُّ العائم) تُفتح كلٌّ وحدَها أدناه: فوق ما تحتها تحجبه، فيُقرأ هدفُ لمسٍ صغيرًا ما ليس كذلك
      for (const d of document.querySelectorAll('details:not(.menu):not(.more-sheet):not(.fab)')) { if (!d.open) { d.open = true; n += 1 } }
      const keys = document.getElementById('keys')
      if (keys && keys.hidden) { keys.hidden = false; n += 1 }
      return n
    })
    await page.waitForTimeout(150)
    await settle(page)
    if (opened > 0) report(`${base} · مفتوح (${opened})`, (await new AxeBuilder({ page }).withTags(TAGS).analyze()).violations)
    // ‏والتلميحُ ظاهرًا على أوّل هدفٍ بالتركيز — ويُفحَص وحدَه: فوق ما تحته يحجبه، فيُقرأ هدفُ لمسٍ صغيرًا ما ليس كذلك
    const tip = await page.evaluate(() => {
      const t = document.querySelector('[data-tip][tabindex="0"],button[data-tip],a[data-tip]')
      if (!t) return false
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
      t.focus()
      const s = document.getElementById('sada-tip')
      return !!s && !s.hidden
    })
    if (tip) {
      await page.waitForTimeout(150)
      await settle(page)
      report(`${base} · تلميح`, (await new AxeBuilder({ page }).include('#sada-tip').withTags(TAGS).analyze()).violations)
    }
    await context.close()
  }

  // ‏كلُّ حوارٍ وحدَه، وحوارُ التأكيد يُبنى بالسكربت حين يُطلب
  {
    const { context, page } = await open(file, DESKTOP, null)
    const ids = await page.evaluate(() => {
      if (typeof window.sadaAsk === 'function') {
        window.sadaAsk('أتحذف هذا؟ لا يُسترجَع.', 'احذف', true, null, () => undefined)
        const d = document.getElementById('sada-cf')
        if (d && d.open) d.close()
      }
      return [...document.querySelectorAll('dialog[id]')].map((d) => d.id)
    })
    for (const id of ids) {
      await page.evaluate((x) => {
        document.querySelectorAll('dialog[open]').forEach((d) => d.close())
        const d = document.getElementById(x)
        d.hidden = false
        d.showModal()
      }, id)
      await page.waitForTimeout(120)
      await settle(page)
      report(`${base} · حوار #${id}`, (await new AxeBuilder({ page }).include(`#${id}`).withTags(TAGS).analyze()).violations)
    }
    await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()))
    // ‏ولوحةُ الأوامر (⌘K) حوارٌ بدورٍ لا بوسم (`role="dialog"` داخل ستارةٍ مخفيّة): تُظهَر ويُفحَص ما فيها
    if (await page.evaluate(() => { const v = document.getElementById('cmdk'); if (!v) return false; v.hidden = false; return true })) {
      await page.waitForTimeout(80)
      await settle(page)
      report(`${base} · لوحة الأوامر`, (await new AxeBuilder({ page }).include('#cmdk').withTags(TAGS).analyze()).violations)
      await page.evaluate(() => { document.getElementById('cmdk').hidden = true })
    }
    // ‏والطافيةُ كلٌّ وحدَها: تُعلَّم بفهرسها وتُفتح ويُفحَص ما فيها
    const floats = await page.evaluate(() => {
      const all = [...document.querySelectorAll('details.menu,details.more-sheet,details.fab')]
      all.forEach((d, i) => d.setAttribute('data-a11y-float', String(i)))
      return all.length
    })
    for (let i = 0; i < floats; i += 1) {
      await page.evaluate((k) => {
        document.querySelectorAll('[data-a11y-float]').forEach((d) => { d.open = d.getAttribute('data-a11y-float') === String(k) })
      }, i)
      await page.waitForTimeout(80)
      await settle(page)
      report(`${base} · طافية ${i + 1}`, (await new AxeBuilder({ page }).include(`[data-a11y-float="${i}"]`).withTags(TAGS).analyze()).violations)
    }
    await context.close()
  }
}

await browser.close()
console.log(`\nالمجموع: ${failed} ملحوظة في ${runs} فحصًا · ${unreachable} تلميحٌ لا يصله التركيز`)
process.exit(failed + unreachable > 0 ? 1 : 0)

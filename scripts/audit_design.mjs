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
  for (const [label, width, density] of [
    ['شاشة', 1440, null], ['عريضة', 2000, null],
    ['مضغوط', 1440, 'compact'], ['جوّال', 390, null],
  ]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } })
    await page.goto(`file://${file}`)
    await page.waitForTimeout(700)
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
        return [255, 255, 255]
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
    await page.close()
  }
}
await browser.close()

let failed = 0
for (const f of findings) {
  const issues = f.small.length + f.long.length + f.faint.length +
    (f.torn ?? []).length + (f.overflow ? 1 : 0)
  failed += issues
  console.log(`\n═══ ${f.file} · ${f.label} (${f.width}px) ═══`)
  if (issues === 0) {
    console.log(`  ✓ نظيف${(f.exempt ?? 0) > 0 ? ` · ${f.exempt} شبكةً معفاةً بـ ragged` : ''}`)
    continue
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
  if (f.faint.length > 0) {
    console.log(`  ✕ ${f.faint.length} نصّا دون حدّ التباين (محسوبا لا من الرموز):`)
    for (const c of f.faint.slice(0, 10)) {
      console.log(`      ${String(c.cls).slice(0, 34)} — ${c.ratio}:1 (الحدّ ${c.min}) «${c.text}»`)
    }
  }
}
console.log(`\nالمجموع: ${failed} ملحوظة`)
process.exit(failed > 0 ? 1 : 0)

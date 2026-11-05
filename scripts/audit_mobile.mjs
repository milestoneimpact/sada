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
 * | التمريرُ الأفقيّ | صفر عند ‏٣٢٠px وحتّى ‏٩٦٠ | WCAG 1.4.10 (Reflow) |
 * | فعلٌ مقصوصٌ في حاويةٍ تقصّ | صفر | يُرى ولا يُضغَط — والصفحةُ لا تفيض (مراجعة D-187) |
 * | نصٌّ خارج صندوقه أو تحت جاره في شريط العودة | صفر | «المنشو» تحت مبدّل الثيم (مراجعة D-189) |
 * | تبويبٌ أو حلقةُ تركيزه خارج ما يُرى | صفر | WCAG 2.4.7 و2.4.11 — وشريطٌ مخفيٌّ لا يُرى (مراجعة D-189) |
 * | مقياسُ الاستحقاق بطول رقمه | ±1٪ | ‏0.61 رُسمت ممتلئة (مراجعة D-189) |
 * | الاسمُ المرسومُ بنسبة رسمه | ±5٪ | «صدى» ‏16×16 في شريط العودة (مراجعة D-196) |
 * | حرفٌ لاتينيٌّ في العلامة | صفر في اللحظة وعلامة الرافدة | «SADA · STAGING» والسطرُ الإنجليزيّ (D-203) |
 * | الفعلُ الأوّلُ وحقلُه في الشاشة الأولى | ‏375×548 · ‏320×568 · ‏844×390 · ‏667×375 | الحقلُ تحت الطيّة على iPhone SE (مراجعة D-196) |
 * | رمزُ اللحظة واسمُها في الألوان القسريّة | ‏3:1 على الأرض تحتهما | أسودُ على العمق ‏1.46:1 (مراجعة D-196) |
 * | `100vh` مكشوفة | ممنوعة | ارتفاعُ iOS يشمل شريطَ المتصفّح |
 * | `:hover` بلا حراسة | ممنوعة | لا hover على اللمس — فيعلق |
 * | وزنُ الصفحة | سقفٌ مُعلَن | Core Web Vitals |
 *
 * ## ويُقاس من المتصفّح لا من الشيفرة
 *
 * قياسٌ يصل بالوراثة أو بمحدّدٍ لم يُصِب لا يظهر في `grep`. **والحدُّ
 * الذي يُفحَص في الشيفرة يُفحَص فيها** (`vh` و`hover` والوزن)، وما عداه
 * يُقاس على خمسة مقاساتٍ للهاتف واللوح، وأربعةٍ بنافذة حاسوبٍ للفيض والقصّ (`WIDE`).
 *
 * الاستعمال:  node scripts/audit_mobile.mjs <ملفّ.html> …
 */
import { chromium } from 'playwright'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

/**
 * ‏٣٢٠ حدُّ WCAG · ‏٣٦٠ أندرويد شائع · ‏٣٩٠ آيفون · ‏٤٣٠ آيفون Max · ‏٧٦٨ لوحٌ لمسيّ.
 *
 * **والأخيرُ نطاقٌ لا مقاس** (D-167): كان بين ‏٧٢١ و‏٩٦٠ شريطَ تبويبٍ أفقيًّا لا
 * شريطَ إبهام — نطاقٌ ثالثٌ بقواعده، وفيه وُجد شريطُ التبويب ‏٣٧٠px يدفع المحتوى
 * إلى ‏٧٥٠ (D-151)، **وجده القياسُ يدًا لا المدقّق**: أربعةُ مقاساته كلُّها تحت ‏٧٢٠.
 * وصار منذ D-187 ما دون «md» (‏٩٠٠) كلُّه شريطَ الإبهام، و‏٧٦٨ هو اللوحيُّ فيه: الرتبةُ
 * بين «sm» و«md» بسلّم الحاسوب وشريط الهاتف.
 */
const WIDTHS = [320, 360, 390, 430, 768]

/**
 * ‏**وعرضُ الحافّة والرافدة يُقاس فيضًا وقصًّا** (مراجعة D-187): ‏٦٠٠ أوّلُ الحافّة ‏٣٢،
 * و‏٧٢٠ اللوحُ الأوسع، و‏٩٠٠ أوّلُ الرافدة الجانبيّة (‏256px)، و‏٩٦٠ بعدها. **ولم يكن بين ‏٧٦٨
 * و‏١٤٤٠ مقاسٌ واحد** — فمرّ فيضُ صفحات المنصّات ‏154px عند ‏900 و‏960، وقصُّ «تفاصيل» في صفّ
 * المزوّد ‏67px عند ‏600، ولم يرهما مدقّق. وتُرسَم بنافذةِ حاسوبٍ لا بلمس: المؤشّرُ الدقيق
 * أشدُّ على الفيض (حقلُ اللمس يُقيَّد بعرض أبيه)، وأهدافُ اللمس وخطُّ الحقول تبقى للهاتف.
 * **و‏١٠٢٤ و‏١٤٤٠ للتبويب** (مراجعة D-189): فرزُ المسوّدات كان يغيب خلف حافّةٍ مخفيّةٍ من ‏900
 * إلى ‏1030، و‏١٤٤٠ العرضُ الذي يُرسَم عليه كلُّ شيءٍ في `audit_design`.
 */
const WIDE = [600, 720, 900, 960, 1024, 1440]

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

const args = process.argv.slice(2)
/** ‏الدرجةُ الأكبر (D-306): `--size large` يقيس الهاتفَ بالخطّ الأكبر — فهدفُ اللمس والفيضانُ يُحرَسان عليه أيضًا. */
const SIZE = args.includes('--size') ? args[args.indexOf('--size') + 1] : 'normal'
const files = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--size')
if (files.length === 0) {
  console.error('الاستعمال: node scripts/audit_mobile.mjs [--size large] <ملفّ.html> …')
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

  for (const width of [...WIDTHS, ...WIDE]) {
    const touch = WIDTHS.includes(width)
    const page = await browser.newPage(touch
      ? { viewport: { width, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
      : { viewport: { width, height: 900 } })
    await page.goto(`file://${file}`)
    // ما هو مخفيٌّ لا يُقاس، وعللُه تبقى — كما في `audit_scale`
    await page.evaluate((size) => {
      if (size === 'large') document.documentElement.dataset.size = 'large'
      document.querySelectorAll('section[data-pane]').forEach((s) => { s.hidden = false })
    }, SIZE)
    await page.waitForTimeout(250)
    // ‏والصعودُ يُنهى قبل القياس (D-246): صندوقٌ في منتصفه كسرٌ من بكسل يُقرأ دون ‏44
    await page.evaluate(() => { for (const a of document.getAnimations()) if (a.effect?.getTiming().iterations !== Infinity) a.finish() })

    const hits = await page.evaluate(
      ({ width, touch, TAP, MIN_FIELD_FONT }) => {
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

        // ١ · تمريرٌ أفقيّ — الوثيقةُ كلُّها، لا عنصرٌ مقصوصٌ بأبيه. وفي نافذة الحاسوب
        // ‏يُقاس على عرضها بلا شريط التمرير: الشريطُ الرأسيّ ليس فيضًا
        const over = document.documentElement.scrollWidth - (touch ? width : document.documentElement.clientWidth)
        if (over > 1) out.push({ kind: 'overflow', what: 'الصفحة', detail: `تفيض ${Math.round(over)}px` })

        /*
         * ٦ · **فعلٌ مقصوصٌ في حاويةٍ تقصّ** (مراجعة D-187).
         *
         * الحاويةُ بـ«overflow:hidden» تبتلع ما يفيض منها **فلا تفيض الصفحةُ ولا يقول
         * التمريرُ شيئًا**: «تفاصيل» في صفّ المزوّد كان خارج «.plist» بـ‏67px عند ‏600 — مختفيًا
         * كلُّه والصفحةُ نظيفة. فيُقاس كلُّ فعلٍ ظاهرٍ وما يُرسَم داخله على أقرب حاويةٍ تقصّ
         * فوقه أفقيًّا. **وما يتمرّر لا يُقصّ** (حاويةٌ بـ«auto» تبلغها الإصبع)، فيقف الصعودُ
         * عندها؛ **وما يقصّه الفعلُ نفسُه بقصد** (اسمُ النموذج بنقاطه) لا يُعدّ من أجزائه.
         */
        // ‏ومرسومٌ حقًّا: عنوانُ «details» المطويّ ظاهرٌ وهو بابُها — و«shown» تُسقطه مع ما تحته
        const painted = (el) => {
          for (let d = el.closest('details:not([open])'); d; d = d.parentElement?.closest('details:not([open])')) {
            if (!d.querySelector(':scope > summary')?.contains(el)) return false
          }
          const b = el.getBoundingClientRect()
          return b.width > 0 && b.height > 0
        }
        for (const el of document.querySelectorAll(
          'button,a[href],select,input:not([type=hidden]),textarea,summary,[role=button]',
        )) {
          if (!painted(el)) continue
          let box = el.parentElement
          let fixed = getComputedStyle(el).position === 'fixed'
          while (box && box !== document.body && getComputedStyle(box).overflowX === 'visible') {
            fixed ||= getComputedStyle(box).position === 'fixed'
            box = box.parentElement
          }
          if (!box || box === document.body || fixed) continue
          const bcs = getComputedStyle(box)
          if (bcs.overflowX !== 'hidden' && bcs.overflowX !== 'clip') continue
          const parts = [el, ...el.querySelectorAll('*')].filter((d) => {
            if (d === el) return true
            const r = d.getBoundingClientRect()
            if (r.width === 0 || r.height === 0 || getComputedStyle(d).visibility === 'hidden') return false
            for (let p = d.parentElement; p && p !== el; p = p.parentElement) {
              if (getComputedStyle(p).overflowX !== 'visible') return false
            }
            return true
          })
          const r = box.getBoundingClientRect()
          const left = r.left + parseFloat(bcs.borderLeftWidth)
          const right = r.right - parseFloat(bcs.borderRightWidth)
          let cut = 0
          for (const d of parts) {
            const b = d.getBoundingClientRect()
            cut = Math.max(cut, left - b.left, b.right - right)
          }
          if (cut > 1) {
            out.push({
              kind: 'cut',
              what: key(el),
              detail: `«${(el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 18)}» خارج ${key(box)} بـ${Math.round(cut)}px`,
            })
          }
        }

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
        // ‏والإصبعُ وتقريبُ iOS للّمس وحدَه: نافذةُ الحاسوب بلا إصبع
        for (const el of touch ? document.querySelectorAll(
          'button,a[href],select,input:not([type=hidden]),textarea,summary,[role=button]',
        ) : []) {
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
        /*
         * **والحقلُ المخفيُّ يُقاس كذلك** (D-167): حقلُ لوحة الأوامر يُرسَم
         * «hidden» حتّى تُفتَح، **فتخطّاه المدقّقُ منذ بُنيت (D-105)** وهو
         * ‏١٤px على اللمس. والخطُّ المحسوبُ لا يحتاج صندوقا: «getComputedStyle»
         * تحسبه لعنصرٍ لا يُرسَم. فما يمكن أن يظهر يُقاس.
         */
        for (const el of touch ? document.querySelectorAll('input:not([type=hidden]),select,textarea') : []) {
          if (el.tagName === 'INPUT' && TYPELESS.has(el.type)) continue
          const fs = parseFloat(getComputedStyle(el).fontSize)
          if (fs >= MIN_FIELD_FONT) continue
          const k = key(el)
          if (fields.has(k)) continue
          fields.add(k)
          out.push({ kind: 'zoom', what: k, detail: `خطُّه ${fs}px` })
        }
        /*
         * ٥ · **تسميةٌ مقصوصةٌ في شريط الإبهام** (D-185 · خطّة التصميم 5.3 و10.2).
         *
         * التسميةُ تُقصّ بنقاطٍ حين لا تسع خانتَها («text-overflow:ellipsis»)، **فلا
         * يفيض شيءٌ ولا يقول التمريرُ الأفقيُّ شيئا**: «المنشو…» تُقرأ عطلًا ولا تُرى في
         * أيّ مقياسٍ غيرِ هذا. فيُقارَن عرضُ الحرف بعرض حيّزه في كلّ تسميةٍ ظاهرة.
         */
        for (const s of document.querySelectorAll('nav.tabs > a[data-bar] span:not(.count), nav.tabs > .cmdk-open span')) {
          if (!shown(s)) continue
          const cut = s.scrollWidth - s.clientWidth
          if (cut > 0) out.push({ kind: 'clip', what: `«${s.textContent.trim()}»`, detail: `مقصوصةٌ ${cut}px` })
        }
        /*
         * ٧ · **نصٌّ يخرج من صندوقه أو يغطّيه جارُه في شريط العودة** (مراجعةُ D-189).
         *
         * اتّسع مقطعُ الثيم في ٢ب فانكمش رابطُ العودة عند ‏٣٢٠ إلى ‏٤٩px ونصُّه ‏٨٦: خرج النصُّ
         * من صندوقه إلى اليسار **فرُسم تحت المبدّل** — «المنشو» — والصفحةُ لا تفيض، ولا شيءَ
         * يقصّ، والرابطُ نفسُه داخل الشريط. فلم يره (١) ولا (٦) ولا (٥). فيُقاس نصُّ كلِّ ابنٍ
         * ظاهرٍ في الشريط على صندوقه، وكلُّ ابنين على تقاطعهما.
         */
        for (const nav of document.querySelectorAll('nav.back')) {
          const kids = [...nav.children].filter((k) => shown(k) && !k.classList.contains('grow'))
          for (const k of kids) {
            if ((k.textContent || '').trim() === '') continue
            const range = document.createRange()
            range.selectNodeContents(k)
            const t = range.getBoundingClientRect()
            const b = k.getBoundingClientRect()
            const spill = Math.max(b.left - t.left, t.right - b.right)
            if (spill > 1) {
              out.push({ kind: 'spill', what: `«${k.textContent.trim().replace(/\s+/g, ' ').slice(0, 18)}»`, detail: `نصُّه خارج صندوقه بـ${Math.round(spill)}px` })
            }
          }
          for (let i = 0; i < kids.length; i++) {
            for (let j = i + 1; j < kids.length; j++) {
              const a = kids[i].getBoundingClientRect()
              const c = kids[j].getBoundingClientRect()
              const w = Math.min(a.right, c.right) - Math.max(a.left, c.left)
              const h = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top)
              if (w > 1 && h > 1) {
                out.push({ kind: 'spill', what: `${key(kids[i])} × ${key(kids[j])}`, detail: `يتراكبان ${Math.round(w)}px` })
              }
            }
          }
        }
        /*
         * ٨ · **تبويبٌ أو حلقةُ تركيزه مقصوصة** (مراجعةُ D-189).
         *
         * كان «.tab-bar» حاويةَ تمريرٍ بشريطٍ مخفيّ: «الإعداد !» خارج الهاتف بلا أثر، و«فشلت»
         * و«مرفوضة» خلف حافّةٍ لا تبلغها عجلةُ الفأرة على ‏900، وحلقةُ التركيز خطّان (حاويةُ
         * التمرير تقصّ المحورين). **ولم يره (٦)**: يقف عند أوّل حاويةٍ تتمرّر، فما يتمرّر عنده
         * لا يُقصّ. فهنا يُقاس كلُّ تبويبٍ وحلقتُه — مركَّزًا كما تركّزه لوحةُ المفاتيح، وبسُمكها المحسوب —
         * على كلّ حاويةٍ تقصّ فوقه أيًّا كانت، وعلى عرض النافذة. والتبويبُ في ترتيب التركيز.
         */
        // ‏سُمكُ الحلقة خارج الصندوق: الخطُّ بإزاحته، والظلُّ الخارجيُّ بانتشاره وتغبيشه
        const ringOf = (el) => {
          const cs = getComputedStyle(el)
          const outline = cs.outlineStyle === 'none' ? 0 : parseFloat(cs.outlineOffset) + parseFloat(cs.outlineWidth)
          const shadows = cs.boxShadow === 'none' ? [] : cs.boxShadow.split(/,(?![^(]*\))/)
          const spread = shadows.filter((x) => !/inset/.test(x)).map((x) => {
            const n = [...x.matchAll(/(-?[\d.]+)px/g)].map((m) => Number(m[1]))
            return Math.max(Math.abs(n[0] ?? 0), Math.abs(n[1] ?? 0)) + (n[2] ?? 0) + (n[3] ?? 0)
          })
          return Math.max(outline, 0, ...spread)
        }
        const was = document.activeElement
        let tabsSeen = 0
        let ringsMeasured = 0
        for (const it of document.querySelectorAll('.tab-bar .tab-item')) {
          if (!shown(it)) continue
          tabsSeen += 1
          const label = `«${(it.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 18)}»`
          if (it.tabIndex < 0 && it.closest('[role=tablist]') === null) {
            out.push({ kind: 'tabcut', what: label, detail: 'خارج ترتيب التركيز' })
          }
          let L = 0
          let R = document.documentElement.clientWidth
          let T = -Infinity
          let B = Infinity
          for (let p = it.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
            const cs = getComputedStyle(p)
            if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue
            const pr = p.getBoundingClientRect()
            // ‏والمحورُ بقيمته المحسوبة: «overflow-x:auto» يُحسَب معه الآخرُ «auto» فيقصّ المحورين
            // ‏(وهذا ما قصّ الحلقةَ أعلاه وأسفلَه)، و«clip» وحدَه لا يمسّ الآخر
            if (cs.overflowX !== 'visible') {
              L = Math.max(L, pr.left + parseFloat(cs.borderLeftWidth))
              R = Math.min(R, pr.right - parseFloat(cs.borderRightWidth))
            }
            if (cs.overflowY !== 'visible') {
              T = Math.max(T, pr.top + parseFloat(cs.borderTopWidth))
              B = Math.min(B, pr.bottom - parseFloat(cs.borderBottomWidth))
            }
          }
          const r = it.getBoundingClientRect()
          const cut = Math.max(L - r.left, r.right - R, T - r.top, r.bottom - B)
          if (cut > 1) {
            out.push({ kind: 'tabcut', what: label, detail: `خارج ما يُرى بـ${Math.round(cut)}px` })
            continue
          }
          it.focus({ focusVisible: true, preventScroll: true })
          if (document.activeElement !== it || !it.matches(':focus-visible')) {
            out.push({ kind: 'tabcut', what: label, detail: 'لا يأخذ التركيزَ أو لا يُظهر حلقته' })
            continue
          }
          ringsMeasured += 1
          const ring = ringOf(it)
          const ringCut = Math.max(L - (r.left - ring), r.right + ring - R, T - (r.top - ring), r.bottom + ring - B)
          if (ring > 0 && ringCut > 1) {
            out.push({ kind: 'tabcut', what: label, detail: `حلقةُ تركيزه مقصوصةٌ ${Math.round(ringCut)}px من ${Math.round(ring)}` })
          }
        }
        if (was instanceof HTMLElement) was.focus()
        else document.activeElement?.blur?.()
        // ‏ومقياسٌ لم يَقِس لا يقول «نظيف» (درسُ المحدّدات الشائخة): تبويبٌ ظاهرٌ بلا حلقةٍ مقيسة يردّ
        if (tabsSeen > 0 && ringsMeasured === 0) out.push({ kind: 'tabcut', what: 'tab-bar', detail: `${tabsSeen} تبويبًا ولم تُقَس حلقةٌ واحدة` })
        /*
         * ٩ · **مقياسٌ يرسم غيرَ رقمه** (مراجعةُ D-189): صنفُ تخطيطٍ اسمُه «fill» بحدٍّ أدنى
         * «!important» لبس عنصرَ مقياس الاستحقاق، فرُسمت ‏0.61 ممتلئةً على ‏1440 و‏76٪ على ‏390 —
         * والرقمُ بجانبها صحيح. فيُقاس الطولُ المرسومُ على المسار مقابلَ الرقم المكتوب.
         */
        for (const w of document.querySelectorAll('.worth')) {
          const track = w.querySelector('.track')
          const fill = w.querySelector('.fill')
          const val = Number.parseFloat(w.querySelector('.val')?.textContent ?? '')
          if (!track || !fill || !Number.isFinite(val) || !shown(track)) continue
          const tw = track.getBoundingClientRect().width
          const drawn = fill.getBoundingClientRect().width
          if (Math.abs(drawn - val * tw) > Math.max(1.5, tw * 0.01)) {
            out.push({ kind: 'meter', what: `«${val.toFixed(2)}»`, detail: `مرسومٌ ${Math.round(drawn)} من ${Math.round(tw)}px والمطلوبُ ${Math.round(val * tw)}` })
          }
        }
        /*
         * ١٠ · **اسمٌ مسحوق** (مراجعة D-196): «nav.back a>svg» طابق «.wordmark» في باب اللوحة فرُسم ‏16×16 —
         * مسارٌ نسبتُه ‏3.2:1 شريطًا ارتفاعُه ‏5px بين ‏600 و‏899. فكلُّ اسمٍ مرسومٍ بنسبة رسمه (±5٪).
         */
        for (const w of document.querySelectorAll('svg.wordmark')) {
          if (!shown(w)) continue
          const vb = w.viewBox?.baseVal
          if (!vb || vb.height === 0) continue
          const b = w.getBoundingClientRect()
          const want = vb.width / vb.height
          const got = b.width / b.height
          if (Math.abs(got - want) / want > 0.05) {
            out.push({ kind: 'mark', what: `${w.parentElement ? key(w.parentElement) : ''} svg.wordmark`, detail: `${Math.round(b.width)}×${Math.round(b.height)} بنسبة ${got.toFixed(2)} والرسمُ ${want.toFixed(2)}` })
          }
        }
        /*
         * ١١ · **العلامةُ «صدى» وحدها** (D-203، قرارُ المالك): لا حرفَ لاتينيٌّ ظاهرٌ في لحظة العلامة ولا في
         * علامة الرافدة. كان فيهما «SADA» و«SADA · STAGING» والسطرُ الإنجليزيّ بعد الشعار العربيّ.
         */
        for (const box of document.querySelectorAll('.moment, .rail .brand')) {
          if (!shown(box)) continue
          const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT)
          for (let t = walker.nextNode(); t; t = walker.nextNode()) {
            const el = t.parentElement
            if (!el || !shown(el) || el.closest('svg')) continue
            if (/[A-Za-z]/.test(t.textContent ?? '')) {
              out.push({ kind: 'moment', what: key(el), detail: `حرفٌ لاتينيٌّ في العلامة: «${(t.textContent ?? '').trim().slice(0, 40)}»` })
            }
          }
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
      { width, touch, TAP, MIN_FIELD_FONT },
    )

    for (const hit of hits) {
      if (ALLOWED.has(hit.what)) continue
      notes.push({ ...hit, width })
    }
    await page.close()
  }

  /*
   * ١٢ · **الفعلُ الأوّلُ وحقلُه في الشاشة الأولى** على الشاشات القصيرة (مراجعة D-196): شريطُ اللحظة ‏256px
   * دفع حقلَ الدخول وزرَّه تحت الطيّة في ‏375×548 (iPhone SE بشريط Safari)، والهاتفُ أفقيًّا (‏844×390) لم
   * يُظهر إلّا الشريطَ والعنوان — ولا مقاسَ هنا كان أقصرَ من ‏844. ففي صفحات «.auth»: أوّلُ زرٍّ أوّليٍّ ظاهر،
   * وحقلُ نموذجه إن كان يُرسله، في الشاشة الأولى بلا تمرير؛ **وفي القائم كذلك أوّلُ حقلٍ وزرُّ إرساله**.
   */
  for (const [w, h] of [[375, 548], [320, 568], [844, 390], [667, 375]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
    await page.goto(`file://${file}`)
    await page.waitForTimeout(150)
    const misses = await page.evaluate((portrait) => {
      const auth = document.querySelector('.auth')
      if (auth === null) return []
      window.scrollTo(0, 0)
      const visible = (el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0 }
      const inFirst = (el) => { const b = el.getBoundingClientRect(); return b.top >= 0 && b.bottom <= innerHeight }
      const label = (el) => el.id ? `#${el.id}` : `«${(el.textContent || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 24)}»`
      const FIELD = 'input:not([type=hidden]):not([disabled]),select,textarea'
      const want = []
      const primary = [...auth.querySelectorAll('.btn-primary')].find(visible)
      if (primary) {
        want.push(primary)
        const form = primary.type === 'submit' ? primary.form : null
        const field = form ? [...form.querySelectorAll(FIELD)].find(visible) : undefined
        if (field) want.push(field)
      }
      if (portrait) {
        const field = [...auth.querySelectorAll(FIELD)].find((f) => visible(f) && !f.closest('details:not([open])'))
        const submit = field?.form ? [...field.form.querySelectorAll('[type=submit]')].find(visible) : undefined
        if (field) want.push(field)
        if (submit) want.push(submit)
      }
      return [...new Set(want)].filter((el) => !inFirst(el)).map((el) => `${label(el)} عند ${Math.round(el.getBoundingClientRect().top)}–${Math.round(el.getBoundingClientRect().bottom)} من ${innerHeight}`)
    }, h > w)
    for (const m of misses) notes.push({ kind: 'fold', what: `${w}×${h}`, detail: m, width: w })
    await page.close()
  }

  /*
   * ١٣ · **لحظةُ العلامة في الألوان القسريّة** (مراجعة D-196): أرضُ النقش سمةُ «fill» لا تُفرَض، وأرضُ «.moment»
   * ورمزُها يُفرَضان — فرُسم الرمزُ أسودَ على الأرض العميقة ‏1.46:1 في التباين العالي الفاتح. فيُقاس الرمزُ
   * والاسمُ على الأرض التي تحتهما فعلًا (أرضُ النقش الظاهر، أو أرضُ اللحظة) في الوضعين: ‏3:1 للرسم.
   */
  for (const [scheme, width] of [['light', 390], ['light', 1440], ['dark', 390], ['dark', 1440]]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    await page.emulateMedia({ forcedColors: 'active', colorScheme: scheme })
    await page.goto(`file://${file}`)
    await page.waitForTimeout(150)
    const low = await page.evaluate(() => {
      const m = document.querySelector('.moment')
      if (m === null) return []
      const rgbOf = (v) => (v.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number)
      const lum = ([r, g, b]) => [r, g, b].map((c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 })
        .reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0)
      const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
      const shownEcho = [...m.querySelectorAll('.echo')].find((e) => e.getBoundingClientRect().width > 0)
      const rect = shownEcho?.querySelector('rect')
      const ground = rect ? getComputedStyle(rect).fill : getComputedStyle(m).backgroundColor
      const out = []
      const glyph = m.querySelector('.moment-glyph path')
      if (glyph) out.push(['الرمز', getComputedStyle(glyph).stroke])
      const word = m.querySelector('.wordmark path')
      if (word) out.push(['الاسم', getComputedStyle(word).fill])
      return out.map(([what, c]) => [what, ratio(rgbOf(c), rgbOf(ground)), c, ground]).filter(([, r]) => r < 3)
        .map(([what, r, c, g]) => `${what} ${r.toFixed(2)}:1 (${c} على ${g})`)
    })
    for (const l of low) notes.push({ kind: 'forced', what: `${scheme} ${width}`, detail: l, width })
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
    cut: 'فعلٌ مقصوصٌ في حاويةٍ تقصّ',
    clip: 'تسميةٌ مقصوصةٌ في شريط الإبهام',
    spill: 'نصٌّ خارج صندوقه أو تحت جاره في شريط العودة',
    tabcut: 'تبويبٌ أو حلقةُ تركيزه مقصوصة',
    meter: 'مقياسٌ يرسم غيرَ رقمه',
    tap: 'هدفُ لمسٍ أصغرُ من ٤٤px',
    zoom: 'حقلٌ يُقرِّبه iOS',
    vh: 'ارتفاعٌ ثابتٌ لا ديناميّ',
    hover: 'تعليقٌ يعلق على اللمس',
    weight: 'وزنٌ فوق السقف',
    svgtext: 'حرفٌ في SVG يُقلَّص مع الرسم',
    mark: 'اسمٌ مرسومٌ بغير نسبته',
    moment: 'حرفٌ لاتينيٌّ في العلامة',
    fold: 'الفعلُ الأوّلُ أو حقلُه تحت الطيّة على شاشةٍ قصيرة',
    forced: 'لحظةُ العلامة دون ‏3:1 في الألوان القسريّة',
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

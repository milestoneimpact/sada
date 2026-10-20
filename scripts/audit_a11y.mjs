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
 *     node scripts/audit_a11y.mjs /tmp/panel.html /tmp/screen-login.html …
 */
import { chromium } from 'playwright'
import { AxeBuilder } from '@axe-core/playwright'

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']

const files = process.argv.slice(2)
if (files.length === 0) {
  console.error('الاستعمال: node scripts/audit_a11y.mjs <ملفّ.html>…')
  process.exit(2)
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
let failed = 0

for (const file of files) {
  for (const theme of [null, 'dark']) {
    // ‏axe يفتح صفحتَه الخاصّة لينهي الفحص — فيحتاج سياقًا لا صفحةً يتيمة
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
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

    const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze()
    const name = `${file.split('/').pop()}${theme === null ? '' : ' · ليليّ'}`
    if (violations.length === 0) {
      console.log(`✓ ${name}`)
    } else {
      console.log(`✕ ${name}`)
      for (const v of violations) {
        failed += v.nodes.length
        console.log(`  ✕ ${v.id} [${v.impact}] — ${v.nodes.length}: ${v.help}`)
        for (const n of v.nodes.slice(0, 3)) console.log(`      ${n.target.join(' ')}`)
      }
    }
    await context.close()
  }
}

await browser.close()
console.log(`\nالمجموع: ${failed} ملحوظة`)
process.exit(failed > 0 ? 1 : 0)

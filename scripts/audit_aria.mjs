/**
 * لقطةُ الدلالات (D-301 · Pickering، Inclusive Components · WAI-ARIA APG): **شجرةُ الوصول كما يقرؤها قارئُ الشاشة**،
 * لصفحة العُدّة كلِّها، تُقارَن بخطّ أساسٍ محفوظ.
 *
 * ## لماذا
 *
 * `audit_a11y` (axe) يمسك المخالفةَ: زرًّا بلا اسم، ولونًا بلا تباين. ولا يمسك **التبدّلَ الصامت**: قائمةٌ كانت
 * `menu` فصارت `div`، أو تبويبٌ فقد `aria-selected`، أو حوارٌ فقد عنوانَه — كلُّها «صالحةٌ» عند axe وأعمى عندها قارئُ
 * الشاشة. فتُحفَظ الشجرةُ نصًّا (`aria-baseline.yaml`) ويُسقِط الفحصُ أيَّ فرقٍ لم يُكتب بـ `--write` عمدًا.
 *
 * ## ما يُقرأ
 *
 * `locator.ariaSnapshot()` من Playwright على `body` بعد كشف الألواح المطويّة، في الثيم الفاتح على ‏1280px
 * (الشجرةُ لا تتبدّل بالثيم ولا بالعرض إلّا حيث يُخفي التخطيطُ عنصرًا — وذاك يُقاس في `audit_mobile`).
 *
 * ## والحارسُ يُجرَّب على عيبٍ مزروع
 *
 * `--self-test` يمحو دورَ أوّل تبويبٍ أو قائمةٍ أو حوار (دورٌ تُظهره الشجرة) ويتحقّق أنّ اللقطة اختلفت؛ حارسٌ لا يرى الزرعَ لا يُوثَق بصفره.
 *
 * الاستعمال:  node scripts/audit_aria.mjs /tmp/screen-kit.html [--write] [--self-test]
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const BASELINE = new URL('./aria-baseline.yaml', import.meta.url).pathname
const args = process.argv.slice(2)
const write = args.includes('--write')
const selfTest = args.includes('--self-test')
const files = args.filter((a) => !a.startsWith('--'))
if (files.length !== 1) {
  console.error('الاستعمال: node scripts/audit_aria.mjs <screen-kit.html> [--write] [--self-test]')
  process.exit(2)
}
const file = files[0]

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })

async function snapshot(mutate) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  await page.goto(`file://${file}`)
  await page.evaluate(() => {
    document.querySelectorAll('section[data-pane]').forEach((s) => { s.hidden = false })
  })
  if (mutate !== undefined) await page.evaluate(mutate)
  const snap = await page.locator('body').ariaSnapshot()
  await context.close()
  return snap.trim() + '\n'
}

function diff(a, b) {
  const al = a.split('\n')
  const bl = b.split('\n')
  const out = []
  const n = Math.max(al.length, bl.length)
  for (let i = 0; i < n && out.length < 12; i += 1) {
    if (al[i] !== bl[i]) out.push(`  سطر ${i + 1}:\n    كان: ${al[i] ?? '∅'}\n    صار: ${bl[i] ?? '∅'}`)
  }
  return out.join('\n')
}

try {
  const now = await snapshot()
  if (selfTest) {
    const mutated = await snapshot(() => {
      // ‏دورٌ يُرى في الشجرة (تبويبٌ أو قائمةٌ أو حوار)، لا دورٌ زخرفيّ تُسقطه اللقطةُ أصلًا
      const el = document.querySelector('[role="tablist"],[role="tab"],[role="menu"],[role="dialog"],[role="status"],[role="alert"]')
      if (el) el.removeAttribute('role')
      else document.querySelector('h2').textContent = 'زرع'
    })
    if (mutated === now) {
      console.error('audit_aria --self-test: العيبُ المزروع لم يُمسَك')
      process.exit(1)
    }
    console.log('audit_aria --self-test: العيبُ المزروع أُمسك ✓')
  }
  if (write) {
    writeFileSync(BASELINE, now)
    console.log(`✓ كُتب خطُّ الأساس: ${now.split('\n').length} سطرًا من شجرة الوصول`)
  } else {
    if (!existsSync(BASELINE)) {
      console.error('لا خطَّ أساسٍ بعد: شغّل node scripts/audit_aria.mjs <kit> --write')
      process.exit(1)
    }
    const base = readFileSync(BASELINE, 'utf8')
    if (base !== now) {
      console.log('✕ شجرةُ الوصول تبدّلت عمّا كُتب — إن كان عمدًا فاكتبها بـ --write:')
      console.log(diff(base, now))
      process.exit(1)
    }
    console.log(`✓ شجرةُ الوصول كما كُتبت (${now.split('\n').length} سطرًا)`)
  }
} finally {
  await browser.close()
}

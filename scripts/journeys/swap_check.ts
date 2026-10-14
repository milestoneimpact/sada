/**
 * فحصُ D-207 في متصفّحٍ حقيقيّ: «اعتمد» ثمّ «تراجَع» على بطاقةٍ في «المنشورات» **بلا تحميل صفحة**.
 *
 *     npx tsx scripts/journeys/swap_check.ts
 *
 * يعدّ تحميلاتِ الصفحة (`load`) بعد الدخول، ويقرأ حالَ المسوّدة من القاعدة بعد كلّ ضغطة. ويخرج بغير صفر إن
 * حُمّلت الصفحة، أو لم تتبدّل الحال، أو لم يظهر «تراجَع» في الإشعار.
 */
import { chromium } from 'playwright'
import { CHROMIUM, startServer } from './server'
import { login } from './journeys'

const stack = await startServer({ port: 8791 })
const browser = await chromium.launch({ executablePath: CHROMIUM })
let failed = false
const check = (ok: boolean, what: string): void => { console.log(`${ok ? '✓' : '✕'} ${what}`); if (!ok) failed = true }
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  page.on('console', (m) => { if (m.type() !== 'log') console.log('[console]', m.type(), m.text()) })
  page.on('pageerror', (e) => console.log('[pageerror]', e.message))
  await login(page, stack.url)
  const draft = stack.db.raw.prepare("SELECT id FROM posts WHERE status = 'draft' ORDER BY created_at LIMIT 1").get() as { id: string }
  const status = (): string => (stack.db.raw.prepare('SELECT status FROM posts WHERE id = ?').get(draft.id) as { status: string }).status
  await page.goto(`${stack.url}/panel#d-${draft.id}`)
  await page.waitForLoadState('networkidle')
  let loads = 0
  page.on('load', () => { loads += 1 })

  const card = page.locator(`#d-${draft.id}`)
  await card.locator('form[data-swap] button[value="approve"]').click()
  await page.locator('#flash .toast-note').waitFor()
  await page.waitForLoadState('networkidle')
  check(status() === 'approved', `اعتمد: الحالُ في القاعدة ${status()}`)
  check(loads === 0, `اعتمد: تحميلاتُ الصفحة ${loads}`)
  check(!(await card.locator('button[value="approve"]').count()), 'اعتمد: البطاقةُ تبدّلت (لا زرَّ «اعتمد»)')
  const undo = page.locator('#flash form[data-swap] button')
  check((await undo.count()) === 1, 'الإشعارُ يحمل «تراجَع»')

  await undo.click()
  await page.locator(`#d-${draft.id} button[value="approve"]`).waitFor()
  check(status() === 'draft', `تراجَع: الحالُ في القاعدة ${status()}`)
  check(loads === 0, `تراجَع: تحميلاتُ الصفحة ${loads}`)
  check(await page.evaluate((id) => document.activeElement?.id === `d-${id}`, draft.id), 'التركيزُ على البطاقة')

  // ‏و«ارفض» من قائمة «أفعالٌ أخرى» ثمّ «تراجَع» — النموذجُ من `menuAction` بـ`swap`
  await card.locator('details.menu > summary').click()
  await card.locator('form[data-swap] input[name="do"][value="reject"]').locator('xpath=..').locator('button').click()
  await page.locator('#flash form[data-swap][action="/panel/drafts/undo-reject"]').waitFor()
  check(status() === 'rejected', `ارفض: الحالُ في القاعدة ${status()}`)
  check(loads === 0, `ارفض: تحميلاتُ الصفحة ${loads}`)
  await page.locator('#flash form[data-swap] button').click()
  await page.locator(`#d-${draft.id} button[value="approve"]`).waitFor()
  check(status() === 'draft', `تراجَع عن الرفض: الحالُ في القاعدة ${status()}`)
  check(loads === 0, `تراجَع عن الرفض: تحميلاتُ الصفحة ${loads}`)
} finally {
  await browser.close()
  await stack.close()
}
process.exit(failed ? 1 : 0)

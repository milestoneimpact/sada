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

  // ‏ثمّ الجدولةُ من البطاقة المبدَّلة نفسِها: «غدًا 9ص» زرٌّ يربطه السكربت، فإن لم يُعَد ربطُه على
  // ‏البطاقة الجديدة لم يملأ الحقلَ ورُدّت «جدوِل» (D-207: wire)
  await card.locator('form[data-swap] button[value="approve"]').click()
  const sched = page.locator(`form[action="/panel/drafts/schedule"]:has(input[name="id"][value="${draft.id}"])`)
  await sched.waitFor({ state: 'attached' })
  await page.evaluate((id) => { for (let el = document.querySelector(`form[action="/panel/drafts/schedule"]:has(input[name="id"][value="${id}"])`)?.parentElement; el; el = el.parentElement) if (el.tagName === 'DETAILS') (el as HTMLDetailsElement).open = true }, draft.id)
  await sched.locator('[data-preset]').first().click()
  const filled = await sched.locator('input[type="datetime-local"]').inputValue()
  check(filled !== '', `«${await sched.locator('[data-preset]').first().textContent()}» يملأ الحقلَ على البطاقة المبدَّلة (${filled})`)
  await sched.locator('button[type="submit"]').last().click()
  await page.locator(`#d-${draft.id} form[action="/panel/drafts/reschedule"]`).waitFor()
  const at1 = (stack.db.raw.prepare('SELECT scheduled_at FROM posts WHERE id = ?').get(draft.id) as { scheduled_at: string | null }).scheduled_at
  check(status() === 'queued' && at1 !== null, `جدوِل: ${status()} ${at1}`)
  check(loads === 0, `جدوِل: تحميلاتُ الصفحة ${loads}`)

  const move = page.locator(`#d-${draft.id} form[action="/panel/drafts/reschedule"] button[name="preset"]`).last()
  await move.click()
  await page.waitForFunction((args) => !!document.querySelector(`#d-${args.id}`) && args.before !== null, { id: draft.id, before: at1 })
  await page.waitForLoadState('networkidle')
  const at2 = (stack.db.raw.prepare('SELECT scheduled_at FROM posts WHERE id = ?').get(draft.id) as { scheduled_at: string | null }).scheduled_at
  check(at2 !== null && at2 !== at1, `انقلها: ${at1} ← ${at2}`)
  check(loads === 0, `انقلها: تحميلاتُ الصفحة ${loads}`)

  page.once('dialog', (d) => { void d.accept() })
  // ‏و«اسحب الموعد» في طيّة البطاقة — تُفتح كما يفتحها المالك
  await page.locator(`#d-${draft.id} details.draft-more > summary`).click()
  await page.locator(`#d-${draft.id} form[action="/panel/drafts/unschedule"] button`).click()
  await page.locator(`#d-${draft.id} form[action="/panel/drafts/schedule"]`).waitFor({ state: 'attached' })
  check(status() === 'approved', `اسحب الموعد: ${status()}`)
  check(loads === 0, `اسحب الموعد: تحميلاتُ الصفحة ${loads}`)
  // ‏والفرزُ بعد التبديل لا يعيد البطاقةَ القديمة: «reorder» تُلحق ما في قائمتها
  const sorter = page.locator('#draft-order')
  if (await sorter.count()) {
    await page.evaluate(() => { const s = document.getElementById('draft-order') as HTMLSelectElement; s.value = 'old'; s.dispatchEvent(new Event('change')) })
  } else check(false, 'لا منتقيَ فرزٍ بالمعرّف draft-order')
  check((await page.locator(`[id="d-${draft.id}"]`).count()) === 1, 'بعد الفرز: بطاقةٌ واحدةٌ بمعرّفها، لا نسخةٌ قديمةٌ معها')

  // ‏**بلا اتّصال** (7.11): شريطٌ واحد، وأزرارُ الإرسال معطَّلة، ثمّ «عاد الاتّصال» وتعود
  await page.context().setOffline(true)
  await page.locator('#main > .outcome[role="status"]').waitFor()
  const off = await page.locator('form[method="POST"] button[type="submit"][data-off]').count()
  check(off > 0, `بلا اتّصال: الشريطُ ظاهر، و${off} زرًّا معطَّلًا`)
  await page.context().setOffline(false)
  await page.locator('#flash .toast-note.ok').filter({ hasText: 'عاد الاتّصال' }).waitFor()
  check((await page.locator('button[data-off]').count()) === 0 && (await page.locator('#main > .outcome[role="status"]').count()) === 0,
    'عاد الاتّصال: الشريطُ ذهب والأزرارُ عادت')

  // ‏**نصُّ المحرّر محفوظٌ على الجهاز** (7.11): يُكتب، ويُعاد التحميل بلا حفظ، فيُعرض «استعده»
  // ‏والمحرّرُ يكتب في المسوّدة وحدها: تُعاد العيّنةُ مسوّدةً في القاعدة المحلّيّة قبل الخطوة
  const other = { id: draft.id }
  stack.db.raw.prepare("UPDATE posts SET status = 'draft' WHERE id = ?").run(other.id)
  await page.goto(`${stack.url}/panel?open=${other.id}#ed`)
  await page.waitForLoadState('networkidle')
  const typed = 'نصٌّ كُتب ولم يُحفظ — اختبار الجهاز'
  await page.locator('textarea#ed-txt').fill(typed)
  await page.waitForTimeout(2300)
  await page.goto(`${stack.url}/panel?open=${other.id}#ed`)
  await page.waitForLoadState('networkidle')
  const restore = page.getByRole('button', { name: 'استعده' })
  check(await restore.isVisible(), 'بعد إعادة التحميل: «لديك نصٌّ لم يُحفظ» و«استعده»')
  await restore.click()
  check(await page.locator('textarea#ed-txt').inputValue() === typed, 'استعده: النصُّ عاد إلى الحقل')
  check(await page.evaluate((k) => localStorage.getItem(k) !== null, `sada-draft:${other.id}`), 'ويبقى في الجهاز حتّى يُحفظ')

  // ‏**الجلسةُ انتهت وسط فعل** (7.11 · D-210): يُفتح الدخولُ، و«next» يحمل مرساةَ البطاقة فيعود إليها
  stack.db.raw.prepare("UPDATE posts SET status = 'draft' WHERE id = ?").run(draft.id)
  await page.goto(`${stack.url}/panel#d-${draft.id}`)
  await page.waitForLoadState('networkidle')
  await page.context().clearCookies()
  await page.locator(`#d-${draft.id} form[data-swap] button[value="approve"]`).click()
  await page.locator('#login-next').waitFor({ state: 'attached' })
  const nextVal = await page.locator('#login-next').inputValue()
  check(nextVal.endsWith(`#d-${draft.id}`), `انتهت الجلسة: الدخولُ يعيد إلى البطاقة (next=${nextVal.slice(0, 24)}…)`)
  check(status() === 'draft', `ولم يقع الفعلُ بلا جلسة: ${status()}`)

  // ‏**المراسي القديمة تصل إلى صفحاتها** (D-211): رابطٌ محفوظٌ «/panel#providers» يُفتح في «/panel/settings»
  await page.goto(`${stack.url}/panel/login`)
  await page.locator('input[name="token"]').fill((await import('./server')).LOCAL_ADMIN_TOKEN)
  await page.locator('form button[type="submit"]').first().click()
  await page.waitForLoadState('networkidle')
  for (const [from, to, shown] of [
    ['/panel#providers', '/panel/settings', '#providers'], ['/panel#ch-x', '/panel/accounts', '#ch-x'],
    ['/panel#sources', '/panel/library', '#sources'], ['/panel#pivot', '/panel/analysis', '#pivot'],
  ] as const) {
    await page.goto(`${stack.url}${from}`)
    await page.waitForURL((u) => u.pathname === to, { timeout: 10000 }).catch(() => undefined)
    await page.waitForLoadState('networkidle')
    const u = new URL(page.url())
    check(u.pathname === to && await page.locator(shown).isVisible(), `«${from}» ← ${u.pathname}${u.hash} وقسمُه ظاهر`)
  }
  // ‏ورابطٌ داخل «/panel» إلى لوحٍ انتقل («مراجعة المصادر» في الرئيسيّة) ينقل إليه
  await page.goto(`${stack.url}/panel`)
  await page.waitForLoadState('networkidle')
  await page.locator('a[href="#sources"]').first().click()
  await page.waitForURL((u) => u.pathname === '/panel/library', { timeout: 10000 }).catch(() => undefined)
  check(new URL(page.url()).pathname === '/panel/library', `«مراجعة المصادر» ← ${new URL(page.url()).pathname}`)
} finally {
  await browser.close()
  await stack.close()
}
process.exit(failed ? 1 : 0)

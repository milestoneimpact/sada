/**
 * الرحلاتُ الاثنتا عشرة (DESIGN-PLAN §6) ورحلتا الخطّة (ر-12 · ر-13، D-293) — كما يؤدّيها مالكٌ يفتحها أوّلَ مرّة.
 *
 * **لا روابطَ عميقة**: كلُّ رحلةٍ تبدأ من الرئيسيّة، وتبلغ هدفَها بما يُرى في الشاشة —
 * بطاقةٌ في الرئيسيّة، أو الشريطُ السفليّ على الهاتف، أو الرافدةُ على الحاسوب. والنجاحُ
 * يُقرأ من القاعدة لا من رسالةٍ في الصفحة.
 *
 * ‏**وكلُّ رحلةٍ في §6 تسلك طريقَ هدفها** (D-326): ر-0 «اعتمد» في «ينتظر قرارك» على الرئيسيّة، ور-2 ور-5 ور-14 من «منشور
 * ‏جديد ▾» (الترويسةُ على الحاسوب، وسطرُ التحيّة على الهاتف). كان بعضُها يدخل من محطّةٍ أو من «المنشورات» فيعدّ خطوةً ليست في
 * ‏الهدف. **والهدفُ مصدرُه مكتوبٌ معه** (`plan.target`)، والعتبةُ التي تُسقط التشغيلَ في `thresholds.json`. ولا جملةَ ثابتةً في
 * ‏الملاحظات: ما يُكتب فيها يُقرأ من الصفحة أو من القاعدة في التشغيل نفسِه.
 */
import { readFileSync } from 'node:fs'
import type { Locator, Page } from 'playwright'
import { Blocked, Meter } from './meter'
import type { Stack } from './server'
import { codeFrom } from '../../src/test/emailLogin'
import { ownerPasskey } from './seed'
import { saveApp } from '../../src/lib/oauth/apps'
import { saveTokens, upsertAccount } from '../../src/lib/tokens'
import { confirmTotp, startTotp } from '../../src/lib/security/factors'
import { codeAt, counterFor, newSecret } from '../../src/lib/security/totp'
import { OWNER_EMAIL } from '../../src/lib/ownerEmail'
import { monthStart } from '../../src/lib/time/zone'
import { money } from '../../src/lib/format'

export interface Verdict {
  readonly success: boolean
  readonly verified: string
}

export interface JourneyContext {
  readonly page: Page
  readonly m: Meter
  readonly stack: Stack
  readonly assets: { readonly clip: string; readonly plan: string }
  /** العناوينُ الخارجيّة التي غادر إليها المتصفّح (OAuth). */
  readonly leftSite: string[]
}

export interface Journey {
  readonly id: string
  readonly title: string
  /** الهدفُ ومصدرُه: صفُّ §6، أو قاعدةٌ مكتوبةٌ حيث لا صفّ (D-326) — لا رقمٌ قيس أوّلَ مرّةٍ فصار هدفًا. */
  readonly plan: { readonly target: string }
  /** تعديلٌ على البذرة قبل الرحلة — يُقال في الملاحظات. */
  readonly prepare?: (stack: Stack) => Promise<string | null>
  /** بلا دخولٍ مسبق: الرحلةُ تبدأ من صفحة الدخول (ر-11). */
  readonly startLoggedOut?: boolean
  readonly run: (j: JourneyContext) => Promise<Verdict>
}

// ── عونٌ ──────────────────────────────────────────────────────────────

const visible = (l: Locator) => l.filter({ visible: true })

function q<T>(stack: Stack, sql: string, ...values: unknown[]): T | undefined {
  return stack.db.raw.prepare(sql).get(...(values as never[])) as T | undefined
}

function all<T>(stack: Stack, sql: string, ...values: unknown[]): T[] {
  return stack.db.raw.prepare(sql).all(...(values as never[])) as T[]
}

/** بندٌ في الرافدة (الحاسوب) أو في الشريط السفليّ (الهاتف) — كما يُرى. */
function navItem(page: Page, label: string): Locator {
  return visible(page.locator('aside.rail nav.tabs a').filter({ hasText: label })).first()
}

/**
 * وجهةٌ ليست في شريط الهاتف (D-289: المكتبةُ والحساباتُ والإعداداتُ في «المزيد»): يُفتح «المزيد» لمسةً تُعدّ، ثمّ الوجهة.
 * وعلى الحاسوب الرافدةُ تحملها كلَّها فلا لمسةَ زائدة. **فالمقياسُ يقول ثمنَ القرار لا يخفيه.**
 */
async function goSection(page: Page, m: Meter, label: string): Promise<void> {
  const direct = navItem(page, label)
  if ((await direct.count()) > 0) {
    await m.tap(direct, `«${label}» في التنقّل`)
    return
  }
  await m.tap(visible(page.locator('details.more-sheet > summary')).first(), '«المزيد» في شريط الهاتف')
  await m.tap(visible(page.locator('details.more-sheet .more-panel a').filter({ hasText: label })).first(), `«${label}» في «المزيد»`)
}

function button(scope: Page | Locator, name: string | RegExp): Locator {
  return visible(scope.getByRole('button', { name, exact: typeof name === 'string' })).first()
}

function link(scope: Page | Locator, name: string | RegExp): Locator {
  return visible(scope.getByRole('link', { name })).first()
}

/**
 * ‏**«منشور جديد ▾» كما يُرى** (D-326): زرُّ الترويسة على الحاسوب (`data-tb-new`)، وعلى الهاتف قائمةُ سطر التحيّة في الرئيسيّة
 * ‏(`data-home-new`) أو الزرُّ العائمُ في «المكتبة». أوّلُ ظاهرٍ منها يُفتح لمسةً تُعدّ، ثمّ يُختار البابُ باسمه لمسةً ثانية.
 */
async function newPost(page: Page, m: Meter, item: RegExp, label: string): Promise<void> {
  const head = visible(page.locator('[data-home-new], [data-tb-new], details.fab').locator(':scope > summary')).first()
  await m.tap(head, '«منشور جديد»')
  const menu = page.locator('[data-home-new][open], [data-tb-new][open], details.fab[open]')
  await m.tap(visible(menu.locator('.menu-item, .fab-menu a').filter({ hasText: item })).first(), `«${label}» في قائمة «منشور جديد»`)
}

/**
 * ‏**بابُ الكتابة في الرئيسيّة كما يُرى** — يُقرأ من الصفحة لا يُكتب سلفًا: كلُّ عنصرٍ ظاهرٍ يُضغط (زرٌّ أو رابطٌ أو رأسُ
 * ‏قائمة) اسمُه المقروء (نصُّه أو اسمُه لقارئ الشاشة) فيه «منشور جديد» أو «اكتب»، وأين يقع: في الشاشة الأولى أو تحتها.
 */
async function writeDoors(page: Page): Promise<{ first: string[]; below: string[] }> {
  return page.evaluate(() => {
    const vh = window.innerHeight
    const name = (el: Element): string => (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().replace(/\s+/g, ' ')
    const out = { first: [] as string[], below: [] as string[] }
    for (const el of Array.from(document.querySelectorAll('a, button, summary'))) {
      const r = el.getBoundingClientRect()
      const s = getComputedStyle(el)
      if (r.width === 0 || r.height === 0 || s.visibility === 'hidden' || el.closest('details:not([open]) > :not(summary)') !== null) continue
      const n = name(el)
      if (!/منشور جديد|اكتب/.test(n) || n.length > 40) continue
      const where = el.closest('header, .topbar') !== null ? 'الترويسة' : el.closest('details.fab') !== null ? 'الزرّ العائم' : el.closest('[data-home-new]') !== null ? 'سطر التحيّة' : 'المحتوى'
      ;(r.bottom <= vh ? out.first : out.below).push(`«${n}» (${where})`)
    }
    return out
  })
}

/**
 * محطّةٌ في «رحلةُ المنشور» على الرئيسيّة — **بعنوانها كما يُرى**، لا بعنوانٍ تشير إليه.
 * كانت كلُّ محطّةٍ تشير إلى `#posts`، وصارت تشير إلى البطاقة نفسِها (`#d-…` و`#s-…`
 * و`#i-…`): والمالكُ يقرأ «الاعتماد» ولا يقرأ الرابط.
 */
function station(page: Page, title: string): Locator {
  const trip = page.locator('.card').filter({ has: page.getByRole('heading', { name: 'رحلة المنشور' }) })
  return visible(trip.getByRole('link', { name: new RegExp(`^${title}(\\s|$)`) })).first()
}

/**
 * زرُّ «خطوتُك التالية» أعلى الرئيسيّة — بنصّه، أيًّا كان ما يشير إليه. وهو أوّلُ رابطٍ
 * ظاهرٍ بهذا الاسم في الصفحة (الشريطُ فوق الرحلة)، فلا يُربط بشكل الشريط.
 */
function nextStep(page: Page, name: RegExp): Locator {
  return visible(page.getByRole('link', { name })).first()
}

/** جملةُ «خطوتُك التالية» كما يقرؤها المالك — تُسجَّل في الملاحظات. */
async function nextStepText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const k = Array.from(document.querySelectorAll('span, p, b, h2, h3')).find((el) => (el.textContent ?? '').trim() === 'خطوتُك التالية')
    const box = k?.parentElement?.parentElement
    return (box?.textContent ?? '').trim().replace(/\s+/g, ' ')
  })
}

function draftForm(page: Page, postId: string): Locator {
  return page.locator(`form[action="/panel/drafts/decide"]:has(input[name="id"][value="${postId}"])`)
}

function scheduleForm(page: Page, postId: string): Locator {
  return page.locator(`form[action="/panel/drafts/schedule"]:has(input[name="id"][value="${postId}"])`)
}

/** آخرُ رمز دخولٍ وصل «الصندوق» — يُقرأ من الرسالة كما يقرؤه المالك (D-245). */
export function lastCode(stack: Pick<Stack, 'mail'>): string {
  const last = stack.mail[stack.mail.length - 1]
  return last === undefined ? '' : codeFrom(last)
}

/**
 * **متوثِّقٌ افتراضيٌّ في Chromium يحمل مفتاحَ المالك** (D-317) — كهاتف المالك: يتحقّق منه (UV) ويوقّع بلا نافذة.
 * لكلّ صفحةٍ متوثِّقُها، والعدّادُ يبدأ ممّا في القاعدة (`passkeys.sign_count`) فلا يُرفض توقيعٌ بعدّادٍ لم يتقدّم.
 */
const WITH_KEY = new WeakSet<Page>()

export async function ownerAuthenticator(page: Page, stack: Pick<Stack, 'db'>): Promise<void> {
  if (WITH_KEY.has(page)) return
  const key = await ownerPasskey()
  const row = await stack.db.prepare('SELECT sign_count FROM passkeys WHERE credential_id = ?').bind(key.credentialId).first<{ sign_count: number }>()
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true,
      isUserVerified: true, automaticPresenceSimulation: true },
  })
  await cdp.send('WebAuthn.addCredential', {
    authenticatorId,
    credential: { credentialId: key.credentialIdB64, isResidentCredential: false, rpId: 'localhost',
      privateKey: key.privateKeyB64, signCount: row?.sign_count ?? 0 },
  })
  WITH_KEY.add(page)
}

/**
 * الدخولُ — تمهيدٌ لا يُعدّ إلّا في ر-11. **ومنذ D-317 بمفتاح المرور**: العاملُ الثاني إلزاميٌّ للمالك، والزرُّ الأوّليُّ في
 * صفحة الدخول «الدخول بمفتاح المرور» (لمسةٌ ثمّ بصمةٌ على الهاتف). ورمزُ البريد بعده يطلب العاملَ نفسَه على كلّ حال.
 */
export async function login(page: Page, stack: Pick<Stack, 'url' | 'mail' | 'kv' | 'db'>): Promise<void> {
  await ownerAuthenticator(page, stack)
  if (!/\/panel/.test(page.url())) await page.goto(`${stack.url}/panel`)
  await page.locator('#pk-login').click()
  // ‏والصفحةُ تُحمَّل من جديد على عنوانها نفسِه: الشريطُ يظهر حين تُفتح اللوحة
  await page.locator('nav.tabs').first().waitFor({ timeout: 15_000 })
  await page.waitForLoadState('networkidle')
}

/** يجدول منشورًا معتمَدًا من بطاقته: «غدًا 9ص» ثمّ «جدوِل» — كما يفعل المالك. */
async function scheduleTomorrow(j: JourneyContext, postId: string, label: string, key = false): Promise<void> {
  const form = scheduleForm(j.page, postId)
  await j.m.tap(button(form, 'غدًا 9:00 ص'), `${label}: «غدًا 9:00 ص»`, { key })
  await j.m.tap(button(form, 'جدوِل'), `${label}: «جدوِل»`)
}

/**
 * اعتمادٌ بلا تعديلٍ يجب أن يُكتب `approved`. والمتصفّحُ يرسل نصَّ ‹textarea› بأسطرٍ
 * `CRLF` (معيارُ HTML) والقاعدةُ حفظته بـ `LF` — فإن خرج `edited` والنصُّ لم يُمسّ
 * سوى بـ `\r` فهو هذا، ويُقال عطلًا لا نجاحًا صامتًا.
 */
function crlf(m: Meter, stack: Stack, id: string): void {
  const row = q<{ status: string; text: string; original_text: string | null }>(stack, 'SELECT status, text, original_text FROM posts WHERE id = ?', id)
  if (row?.status === 'edited' && row.original_text !== null && row.text.replace(/\r\n/g, '\n') === row.original_text.trim()) {
    m.note('⚠ عطل: اعتُمدت بلا أيّ تعديل فكُتبت posts.status = edited، ونصُّها يساوي original_text بعد توحيد أسطر CRLF')
  }
}

const status = (stack: Stack, id: string) =>
  q<{ status: string; scheduled_at: string | null }>(stack, 'SELECT status, scheduled_at FROM posts WHERE id = ?', id)

// ── الرحلات ───────────────────────────────────────────────────────────

const R0: Journey = {
  id: 'R-0',
  title: 'مراجعة ما ينتظر قرارك: اعتماد مسوّدة',
  plan: { target: '1 (§6: [اعتمد] في «تنتظر قرارك» على الرئيسيّة)' },
  async run({ page, m, stack }) {
    const id = stack.seeded.posts.draft
    // ‏**طريقُ §6** (D-326): «اعتمد» على صفّها في «ينتظر قرارك» على الرئيسيّة نفسِها (D-216) — كانت الرحلةُ تنزل من محطّة
    // ‏«الاعتماد» إلى بطاقتها في «المنشورات» فتعدّ خطوةً ليست في الهدف
    const desk = page.locator('#desk li.desk-row').filter({ has: page.locator(`input[name="id"][value="${id}"]`) })
    await m.tap(button(desk, /^اعتمد/), '«اعتمد» في «ينتظر قرارك» على الرئيسيّة', { key: true })
    const row = status(stack, id)
    crlf(m, stack, id)
    return { success: row?.status === 'approved' || row?.status === 'edited' || row?.status === 'queued', verified: `posts.status = ${row?.status ?? '—'}` }
  },
}

/**
 * ‏**ر-0·تراجع** (D-324): اعتمادٌ وجدولةٌ بضغطةٍ ثمّ «تراجَع» من الإشعار — والمسوّدةُ تعود تنتظر القرار بلا موعد. كان الإشعارُ
 * ‏ينتهي بـ«أغلق» وحدَه، والرجوعُ «اسحب الموعد» على بطاقة المجدولة ثمّ «أعدها مسوّدة» في قائمة المعتمَدة: لا طريقَ من الإشعار.
 */
const R0undo: Journey = {
  id: 'R-0·تراجع',
  title: 'اعتماد مسوّدة بموعدها ثمّ «تراجَع» من الإشعار',
  plan: { target: 'خطوةٌ واحدة بعد الاعتماد (D-324 · §5.9)' },
  async run({ page, m, stack }) {
    const id = stack.seeded.posts.draft
    await m.tap(station(page, 'الاعتماد'), 'محطّة «الاعتماد» في الرئيسيّة')
    await m.tap(button(draftForm(page, id), /^اعتمد/), '«اعتمد» على المسوّدة')
    const queued = status(stack, id)
    m.mark('approved')
    await m.tap(button(page.locator('#flash'), 'تراجَع'), '«تراجَع» في الإشعار', { key: true })
    const row = status(stack, id)
    return {
      success: queued?.status === 'queued' && row?.status === 'draft' && row.scheduled_at === null,
      verified: `بعد «اعتمد»: ${queued?.status ?? '—'} · بعد «تراجَع»: posts.status = ${row?.status ?? '—'} · scheduled_at = ${row?.scheduled_at ?? 'NULL'}`,
    }
  },
}

/**
 * ‏**ر-1 بنطاق خطّة التصميم §6** (D-314): ربطُ منصّةٍ ضُبط تطبيقُها (كما بعد مهمّة المالك M-24 أو بعد ر-1·ضبط) حتّى مغادرة
 * ‏الموقع إلى OAuth. والسرّان مزيَّفان يُزرعان بالدالّة الحقيقيّة وبمفتاح هذا التشغيل العشوائيّ، كما تزرع البذرةُ غيرَهما.
 */
const R1: Journey = {
  id: 'R-1',
  title: 'ربط Instagram بعد ضبط تطبيقها (§6) — حتّى مغادرة الموقع إلى OAuth',
  plan: { target: '2 · الهاتف 3 حتّى المغادرة (§6: 5 حتّى «ارجع»)' },
  async prepare(stack) {
    await saveApp(stack.db, stack.encKey, 'instagram', '1234567890123456', 'local0fake0instagram0secret00000', 'journey')
    return 'سرّا Instagram المزيَّفان في الخزانة قبل الرحلة (كما بعد ر-1·ضبط أو مهمّة المالك)'
  },
  async run({ page, m, leftSite }) {
    await goSection(page, m, 'الحسابات')
    // ‏ومنصّةٌ ضُبط تطبيقُها ظاهرةٌ منذ D-314؛ فإن عادت الطيّةُ يوماً ظهر ثمنُها لمسةً هنا
    const connect = visible(page.locator('a[href="/oauth/instagram/start"]')).first()
    if ((await connect.count()) === 0) {
      await m.tap(visible(page.locator('details.fold > summary').filter({ hasText: 'لاحقة' })).first(), '«منصّاتٌ لاحقة» في «الحسابات»')
    }
    await m.tap(visible(page.locator('a[href="/oauth/instagram/start"]')).first(), '«اربط» على بطاقة Instagram', { key: true })
    const left = leftSite.find((u) => /^https:\/\/www\.instagram\.com\/oauth\/authorize/.test(u))
    return {
      success: left !== undefined,
      verified: left === undefined ? `لم يغادر إلى Instagram (${leftSite.join(' · ') || '—'})` : `غادر إلى ${new URL(left).origin}${new URL(left).pathname}`,
    }
  },
}

const R1setup: Journey = {
  id: 'R-1·ضبط',
  title: 'ضبط تطبيق Instagram أوّل مرّة ثمّ ربطها — حتّى مغادرة الموقع',
  plan: { target: 'لا هدف في §6 لإضافة منصّةٍ رابعة · والأولى من الرئيسيّة الخالية ≤5 (ر-1·أوّل)' },
  async run({ page, m, stack, leftSite }) {
    // ‏بطاقاتُ المنصّات في «الحسابات» وحدَها منذ D-309 (لا في الرئيسيّة): لمسةُ التنقّل تُعدّ
    await goSection(page, m, 'الحسابات')
    // ‏ومنصّةٌ لم تُضبط بعدُ تحت طيّة «منصّاتٌ لاحقة» (D-289): فتحُها لمسةٌ تُعدّ — ثمنُ هدوء الرئيسيّة على رحلةٍ تقع مرّةً
    const setup = visible(page.locator('a[href^="/panel/channels/instagram?tab=setup"]')).first()
    if ((await setup.count()) === 0) {
      await m.tap(visible(page.locator('details.fold > summary').filter({ hasText: 'لاحقة' })).first(), '«منصّاتٌ لاحقة» في «الحسابات»')
    }
    // ‏و«أكمل الإعداد» ينزل إلى حقل المعرّف نفسِه (D-205: `setupHref`)، فلا تُضغط «اضبط التطبيق» إلّا إن لم يظهر
    await m.tap(visible(page.locator('a[href^="/panel/channels/instagram?tab=setup"]')).first(), 'بطاقة Instagram «أكمل الإعداد»')
    const id = page.locator('#ci-instagram')
    if (!(await id.isVisible())) await m.tap(link(page.locator('main, body'), 'اضبط التطبيق'), '«اضبط التطبيق»')
    await m.type(id, '1234567890123456', 'لصق «Client ID» (من Meta)', { pasted: true })
    await m.type(page.locator('#cs-instagram'), 'local0fake0instagram0secret00000', 'لصق «Client Secret»', { pasted: true })
    // ‏و«احفظ» في شريط المساعد الملتصق، للنموذج بسِمة «form» (D-218)
    await m.tap(visible(page.locator('button[form="app-instagram"]').filter({ hasText: 'احفظ' })).first(), '«احفظ»')
    m.mark('app_saved')
    const saved = q<{ n: number }>(stack, "SELECT COUNT(*) AS n FROM oauth_apps WHERE platform = 'instagram'")?.n ?? 0
    if (saved === 0) return { success: false, verified: 'oauth_apps: لا صفّ لـ instagram بعد «احفظ»' }

    // ‏بعد الحفظ: أين يجد زرَّ الربط؟ أوّلًا حيث أعاده الخادم
    m.note(`بعد «احفظ» أُعيد إلى: ${new URL(page.url()).pathname}${new URL(page.url()).hash}`)
    const connect = visible(page.locator('a[href="/oauth/instagram/start"]')).first()
    if ((await connect.count()) === 0) {
      // ‏ليس هنا — يعود إلى صفحة Instagram من حيث جاء
      const toPage = visible(page.locator('a[href^="/panel/channels/instagram"]')).first()
      await m.tap(toPage, 'العودة إلى صفحة Instagram')
    }
    await m.tap(visible(page.locator('a[href="/oauth/instagram/start"]')).first(), '«اربط Instagram»', { key: true })
    const left = leftSite.find((u) => /instagram\.com|facebook\.com/.test(u))
    return {
      success: left !== undefined,
      verified: left === undefined ? 'لم يغادر إلى Meta' : `غادر إلى ${new URL(left).origin}${new URL(left).pathname} (client_id في الرابط: ${new URL(left).searchParams.get('client_id') ?? '—'})`,
    }
  },
}

/**
 * ‏ر-2 **بطريق §6** (D-326): «منشور جديد ▾» ← «من مصدر» ← «اكتب مسوّدة» ← «اعتمد». كانت تدخل من «المنشورات» ثمّ تبويب «اكتب»
 * ‏ثمّ مقطع «من مصدر» — ثلاثُ لمساتٍ لبابٍ واحد تعدّها الرحلةُ ولا يعدّها الهدف.
 */
const R2: Journey = {
  id: 'R-2',
  title: 'كتابة منشور من مصدر واعتماده',
  plan: { target: '4 (§6: «منشور جديد ▾» ← «من مصدر» ← «اكتب» ← «اعتمد»)' },
  async run({ page, m, stack }) {
    const before = new Set(all<{ id: string }>(stack, 'SELECT id FROM posts').map((r) => r.id))
    await newPost(page, m, /من مصدر/, 'من مصدر')
    const card = page.locator('form[action="/panel/drafts/write"]')
    const sources = await card.locator('select[name="id"] option').allTextContents()
    const drive = all<{ name: string; n: number; done: number }>(stack, 'SELECT s.name, COUNT(*) AS n, SUM(EXISTS (SELECT 1 FROM content_items c WHERE c.source_id = s.id)) AS done FROM sources s GROUP BY s.name')
    m.note(`قائمة المصدر فيها ${sources.length} خيار: ${sources.join(' · ')} · وفي القاعدة: ${drive.map((d) => `«${d.name}» ${d.n} (${d.done} محلَّل)`).join(' · ')}`)
    const platform = await card.locator('select[name="platform"]').inputValue()
    m.note(`المنصّة المختارة سلفًا: ${platform}`)
    await m.tap(button(card, 'اكتب مسوّدة'), '«اكتب مسوّدة»', { key: true })
    m.mark('drafted')
    const fresh = all<{ id: string; status: string }>(stack, "SELECT id, status FROM posts WHERE status = 'draft'").filter((r) => !before.has(r.id))
    if (fresh.length === 0) return { success: false, verified: 'لم تُكتب مسوّدة' }
    const id = fresh[0]!.id
    await m.tap(button(draftForm(page, id), /^اعتمد/), '«اعتمد» على المسوّدة الجديدة')
    const row = status(stack, id)
    crlf(m, stack, id)
    const cost = q<{ n: number }>(stack, "SELECT COUNT(*) AS n FROM cost_ledger WHERE operation LIKE 'draft:linkedin:%' AND at >= datetime('now', '-5 minutes')")?.n ?? 0
    return { success: row?.status === 'approved' || row?.status === 'edited' || row?.status === 'queued', verified: `مسوّدة جديدة ${id.slice(0, 8)} · status = ${row?.status ?? '—'} · cost_ledger +${cost}` }
  },
}

/**
 * ر-2 كما وقع: مالكٌ على الهاتف يمرّر «المنشورات» من أعلاها بحثًا عن «اكتب»، **ويضغط أوّلَ
 * زرٍّ رئيسيٍّ أو تبويبٍ في شريط القسم يوافق مقصده** (التبويبُ بابٌ منذ D-313) — ويُسجَّل كلُّ شاشةٍ مرّ بها وما فيها.
 */
const R2stop: Journey = {
  id: 'R-2·stop',
  title: 'كتابة منشور من مصدر — حيث يقف مالك يمرّر بحثًا عن «اكتب»',
  plan: { target: '4 (§6 ر-2)' },
  async run({ page, m, stack }) {
    // ‏ما في الشاشة الأولى من الرئيسيّة: أفيها بابٌ إلى «اكتب»؟ — يُقرأ من الصفحة (D-326): كانت الجملةُ بعده ثابتةً تنفي
    // ‏البابَ في الرئيسيّة كلّها، والفحصُ يقرأ الشاشةَ الأولى وحدَها ويتخطّى رأسَ القائمة والزرَّ العائم
    const homeCtas = await page.evaluate(() => Array.from(document.querySelectorAll('a.btn, button.btn-primary, a.btn-primary, summary.btn'))
      .filter((el) => { const r = el.getBoundingClientRect(); return r.height > 0 && r.top >= 0 && r.bottom <= window.innerHeight })
      .map((el) => (el.textContent ?? '').trim().replace(/\s+/g, ' ')).filter((t) => t !== ''))
    const doors = await writeDoors(page)
    m.note(`أزرار الشاشة الأولى في الرئيسيّة: ${homeCtas.join(' · ') || '—'}`)
    m.note(`أبواب الكتابة في الرئيسيّة: في الشاشة الأولى ${doors.first.join(' · ') || 'لا شيء'} · وتحتها ${doors.below.join(' · ') || 'لا شيء'}`)
    const drafts = () => q<{ n: number }>(stack, "SELECT COUNT(*) AS n FROM posts WHERE (idempotency_key LIKE 'draft:%' OR idempotency_key LIKE 'idea:%') AND status IN ('draft','approved','edited') AND created_at >= datetime('now','-5 minutes')")?.n ?? 0
    await m.tap(navItem(page, 'المنشورات'), '«المنشورات» في التنقّل')
    const goal = /اكتب|أنشئ|جديد|اعتمد/
    const screens: string[] = []
    let writeAt: number | null = null
    let stopAt: { screen: number; label: string } | null = null
    const { top, bottom, vh } = await m.insets()
    const step = Math.round((vh - top - bottom) * 0.85)
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }))
    for (let screen = 1; screen <= 14; screen += 1) {
      const seen: { text: string; disabled: boolean }[] = await page.evaluate(({ top, bottom, marked }) => {
        const vh = window.innerHeight
        const goal = /اكتب|أنشئ|جديد|اعتمد/
        // ‏و«منشور جديد» قائمةٌ رأسُها `<summary>` بهيئة الزرّ الرئيسيّ (D-232): يراه المالكُ زرًّا فيُعدّ زرًّا
        return Array.from(document.querySelectorAll('button.btn-primary, a.btn-primary, summary.btn-primary, button[type="submit"], nav.tab-bar a'))
          .filter((el) => {
            const r = el.getBoundingClientRect()
            return r.height > 0 && r.top >= top && r.bottom <= vh - bottom && getComputedStyle(el).visibility !== 'hidden'
          })
          .map((el) => {
            const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ')
            const disabled = (el as HTMLButtonElement).disabled === true
            // ‏أوّلُ ما يوافق المقصد يُوسَم ليُضغط هو بعينه لا شبيهُه
            if (!marked && !disabled && goal.test(text) && document.querySelector('[data-journey-hit]') === null) {
              el.setAttribute('data-journey-hit', '1')
            }
            return { text, disabled }
          })
      }, { top, bottom, marked: stopAt !== null })
      const names = seen.map((s) => `${s.text}${s.disabled ? ' (معطَّل)' : ''}`)
      screens.push(`شاشة ${screen}: ${names.length === 0 ? '—' : names.join(' · ')}`)
      await m.shot(`شاشة-${screen}`)
      if (writeAt === null && seen.some((s) => s.text === 'اكتب مسوّدة')) writeAt = screen
      const hit = seen.find((s) => !s.disabled && goal.test(s.text))
      if (hit !== undefined && stopAt === null) stopAt = { screen, label: hit.text }
      const moved = await page.evaluate((dy) => {
        const y = window.scrollY
        window.scrollBy({ top: dy, behavior: 'instant' as ScrollBehavior })
        return window.scrollY - y
      }, step)
      if (moved <= 0) break
      if (stopAt !== null && writeAt !== null) break
    }
    for (const s of screens) m.note(s)
    m.note(`«اكتب مسوّدة» تظهر في الشاشة ${writeAt ?? '—'} من أعلى «المنشورات»`)
    if (stopAt === null) return { success: false, verified: 'لا زرّ يوافق المقصد في الشاشات' }
    m.note(`أوّل زرّ رئيسيّ يوافق المقصد: «${stopAt.label}» في الشاشة ${stopAt.screen}`)
    // ‏يعود إلى حيث وقف ويضغطه
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }))
    const target = page.locator('[data-journey-hit]').first()
    await m.tap(target, `«${stopAt.label}» — أوّل ما وافق المقصد`, { key: true })
    /*
     * ‏منذ D-195 أوّلُ ما يوافق المقصدَ بابٌ لا فعل: «اكتب من فكرة» ينزل إلى نموذجها. فيمضي المالكُ
     * ‏فيما وصل إليه، يكتب فكرتَه ويضغط زرَّه — ولا يُحسَب نجاحًا إن ضغط «اعتمد» على مسوّدةٍ قديمة.
     */
    // ‏والقائمةُ تُفتح فيختار منها بابَ مقصدِه: «من فكرة» أوّلُها
    if ((await page.locator('details[open] > summary[data-journey-hit]').count()) > 0) {
      await m.tap(link(page.locator('details[open]'), /من فكرة/), '«من فكرة» في القائمة')
    }
    const idea = visible(page.locator('form[action="/panel/drafts/idea"]')).first()
    if ((await idea.count()) > 0) {
      await m.type(idea.locator('textarea[name="idea"]'), 'الحوكمة لا تبطئ القرار، تحميه', 'كتابة الفكرة')
      await m.tap(button(idea, 'اكتب المسوّدات'), '«اكتب المسوّدات»')
    }
    const made = drafts()
    const approvedOld = status(stack, stack.seeded.posts.draft)?.status
    return {
      success: made > 0 && approvedOld === 'draft',
      verified: `مسوّدات جديدة (من مصدر أو فكرة): ${made} · والمسوّدة القديمة (قبل 5 ساعات) صارت: ${approvedOld ?? '—'}`,
    }
  },
}

const R3: Journey = {
  id: 'R-3',
  title: 'إضافة صورة إلى منشور (إنفوجرافيك)',
  plan: { target: '2 (§6)' },
  async run({ page, m, stack }) {
    const id = stack.seeded.posts.draft
    await m.tap(station(page, 'الصورة'), 'محطّة «الصورة» في الرئيسيّة')
    const gen = page.locator(`form[action="/panel/media/generate"]:has(input[name="id"][value="${id}"])`).filter({ hasText: 'ولّد إنفوجرافيك' })
    await m.tap(button(gen, 'ولّد إنفوجرافيك'), '«ولّد إنفوجرافيك»', { key: true })
    const media = q<{ n: number; bytes: number }>(stack, "SELECT COUNT(*) AS n, MAX(bytes) AS bytes FROM media WHERE post_id = ? AND status = 'ready'", id)
    const shown = await visible(page.locator(`img[src^="/panel/media/"]`)).count()
    return { success: (media?.n ?? 0) > 0, verified: `media ready = ${media?.n ?? 0} (${media?.bytes ?? 0} بايت) · صور معروضة ${shown}` }
  },
}

const R4: Journey = {
  id: 'R-4',
  title: 'رفع فيديو ونشره على YouTube وTikTok وInstagram',
  plan: { target: '6 · KLM ≤40ث (§6 · EASE-PLAN-2 §٥)' },
  async prepare(stack) {
    // ‏staging لا تربط TikTok ولا Instagram — ورحلةُ «الثلاث» تفترضهما مربوطين
    for (const [platform, ext, name] of [['tiktok', 'tt-local', 'omar.sada'], ['instagram', 'ig-local', 'omar.sada']] as const) {
      stack.db.raw.prepare(`INSERT INTO accounts (id, platform, kind, external_id, display_name, status) VALUES (?, ?, 'member', ?, ?, 'active')`)
        .run(`${platform}:member:${ext}`, platform, ext, name)
    }
    return 'أُضيف حسابا TikTok وInstagram (غير مربوطين في staging) لتُقاس رحلة الثلاث كاملة'
  },
  async run({ page, m, stack, assets }) {
    const known = new Set(all<{ id: string }>(stack, 'SELECT id FROM uploads').map((r) => r.id))
    /*
     * ‏**يقيس الطريقَ المبنيّ** (D-314): «منشور جديد» ← «فيديو» ← الملفّ ← النصّ ← «أنشئ وجدوِل · غدًا 9:00 ص»: يُنشأ
     * ‏ويُعتمَد ويُجدوَل في ضغطةٍ واحدة (D-218). **والموعدُ افتراضيٌّ مكتوبٌ على الزرّ** (D-326): كان «متى؟» يبدأ «لاحقًا» فيلزم
     * ‏اختيارٌ قبل الإنشاء، وصار يبدأ بموعد بطاقة المسوّدة نفسِه، و«لاحقًا» باقٍ اختيارًا في «متى؟» (ولا زرَّ ثانيًا بجواره). ولا
     * ‏رجوعَ صامتًا: إن غاب البابُ فشلت الرحلةُ علنًا.
     */
    await newPost(page, m, /فيديو/, 'فيديو')
    await m.look(visible(page.getByRole('heading', { name: 'فيديوهاتك' })), 'عنوان «فيديوهاتك»')
    const pick = visible(page.locator('label').filter({ has: page.locator('#vfile') })).first()
    // ‏بالاسم العربيّ كما يرفعه المالك — والبايتاتُ تُمرَّر لا المسار (Playwright يُسقط مسارًا غيرَ لاتينيّ)
    const clip = { name: 'الإطار_الأول.mp4', mimeType: 'video/mp4', buffer: readFileSync(assets.clip) }
    await m.file(pick, page.locator('#vfile'), clip, '«اختر مقطعًا وارفعه» ← الملفّ', { key: true })
    // ‏ويعود الرفعُ إلى صفّ المقطع الجديد عند حقل نصّه (D-326) — كان يعود إلى رأس «فيديوهاتك» والحقلُ تحته بشاشة
    const uploaded = await m.wait(async () => {
      const row = all<{ id: string; status: string }>(stack, 'SELECT id, status FROM uploads').find((r) => !known.has(r.id))
      return row?.status === 'ready' && /#(videos|vc-)/.test(page.url())
    }, 60_000)
    if (!uploaded) {
      const msg = await page.locator('#vup-msg').textContent().catch(() => '')
      return { success: false, verified: `لم يكتمل الرفع: ${msg ?? ''}` }
    }
    m.mark('uploaded')
    const upload = all<{ id: string; width: number | null; height: number | null; duration_ms: number | null }>(stack, 'SELECT id, width, height, duration_ms FROM uploads').find((r) => !known.has(r.id))!
    m.note(`المقطع: ${upload.width ?? '?'}×${upload.height ?? '?'} · المدّة ${upload.duration_ms ?? 'غير مقروءة'}`)
    const form = page.locator(`form[action="/panel/uploads/${upload.id}/posts"]`)
    for (const p of ['youtube', 'tiktok', 'instagram']) {
      const box = form.locator(`input[name="platform"][value="${p}"]`)
      if ((await box.count()) === 0) continue
      if (await box.isDisabled()) m.note(`مربّع ${p} معطَّل`)
      else if (!(await box.isChecked())) await m.tap(box, `تعليم ${p}`)
    }
    await m.type(form.locator('textarea[name="caption"]'), 'الإطار الأوّل في دقيقة: كيف نعرّف المعلَم قبل أن يبدأ العمل', 'نصّ المنشور (سطره الأوّل عنوان YouTube)')
    const approve = form.locator('input[name="approve"]')
    if ((await approve.count()) > 0 && !(await approve.isChecked())) await m.tap(approve, '«اعتمده الآن»')
    // ‏الموعدُ كما يُرى على الزرّ الأوّليّ — يُقرأ ولا يُختار
    const go = visible(form.locator('button.btn-primary[type="submit"]')).first()
    const goLabel = ((await go.textContent().catch(() => '')) ?? '').trim().replace(/\s+/g, ' ')
    await m.tap(go, `«${goLabel || 'أنشئ'}»`)
    m.mark('posts_created')
    const posts = all<{ id: string; platform: string; status: string }>(stack,
      `SELECT p.id, p.platform, p.status FROM posts p JOIN media me ON me.post_id = p.id WHERE me.upload_id = ? ORDER BY p.platform`, upload.id)
    m.note(`منشورات أُنشئت: ${posts.map((p) => `${p.platform}:${p.status}`).join(' · ') || '—'}`)
    m.mark('scheduled')
    const after = posts.map((p) => `${p.platform}:${status(stack, p.id)?.status ?? '—'}`)
    const queued = posts.filter((p) => status(stack, p.id)?.status === 'queued').length
    if (queued < posts.length) m.note(`الإشعار: ${await m.readFlash()}`)
    // ‏X وLinkedIn مُعلَّمان افتراضًا منذ D-379: الرحلةُ تنجح إن جُدولت الثلاثُ وكلُّ ما أُنشئ معها
    const three = ['instagram', 'tiktok', 'youtube'].every((p) => posts.some((x) => x.platform === p))
    return { success: three && posts.length >= 3 && queued === posts.length, verified: `${posts.length} منشورات · مجدولة ${queued} (${after.join(' · ')})` }
  },
}

const R5: Journey = {
  id: 'R-5',
  title: 'استيراد خطّة من ملفّ CSV',
  plan: { target: '4 (§6: «منشور جديد ▾» ← «خطّة من ملفّ» ← الملفّ ← «اعتمد وجدوِل»)' },
  async run({ page, m, stack, assets }) {
    const before = q<{ n: number }>(stack, "SELECT COUNT(*) AS n FROM posts WHERE status = 'queued'")?.n ?? 0
    // ‏**بطريق §6 من الرئيسيّة** (D-326): «منشور جديد ▾» ← «خطّة من ملفّ» — كانت الرحلةُ تفتح «المنشورات» أوّلًا فتعدّ لمسةً
    // ‏ليست في الهدف
    await newPost(page, m, /خطّة من ملفّ/, 'خطّة من ملفّ')
    const form = page.locator('form[action="/panel/plan-import"]')
    const pick = visible(form.locator('label').filter({ has: page.locator('input[name="file"]') })).first()
    await m.file(pick, form.locator('input[name="file"]'), assets.plan, '«اختر ملفّ الخطّة (CSV)» ← الملفّ', { key: true })
    // ‏الملفُّ يُقرأ حين يُختار؛ و«اقرأ الخطّة» تُضغط إن بقيت ظاهرةً بعده لا قبله
    const read = button(form, 'اقرأ الخطّة')
    if ((await read.count()) > 0) await m.tap(read, '«اقرأ الخطّة»')
    else m.note('قُرئ الملفّ حين اختير — بلا «اقرأ الخطّة»')
    m.mark('previewed')
    const approve = visible(page.locator('form[action$="/approve"] button[type="submit"]')).first()
    const label = ((await approve.textContent().catch(() => '')) ?? '').trim()
    await m.tap(approve, `«${label || 'اعتمد وجدوِل'}»`)
    const after = q<{ n: number }>(stack, "SELECT COUNT(*) AS n FROM posts WHERE status = 'queued'")?.n ?? 0
    return { success: after - before === 3, verified: `منشورات مجدولة جديدة: ${after - before} من 3 أسطر` }
  },
}

const R6: Journey = {
  id: 'R-6',
  title: 'جدولة منشور معتمَد',
  plan: { target: '2 (§6)' },
  async run(j) {
    const { page, m, stack } = j
    const id = stack.seeded.posts.youtubeEdited
    await m.tap(station(page, 'الموعد'), 'محطّة «الموعد» في الرئيسيّة')
    await scheduleTomorrow(j, id, 'YouTube المعتمَد', true)
    const row = status(stack, id)
    return { success: row?.status === 'queued', verified: `status = ${row?.status ?? '—'} · scheduled_at = ${row?.scheduled_at ?? '—'} (UTC)` }
  },
}

const R7: Journey = {
  id: 'R-7',
  title: 'رؤية النتائج (تقرير الأسبوع)',
  plan: { target: '1 (§6)' },
  async run({ page, m, stack }) {
    await m.tap(navItem(page, 'النتائج'), '«النتائج» في التنقّل')
    const report = q<{ id: string; body_json: string }>(stack, 'SELECT id, body_json FROM reports ORDER BY id DESC LIMIT 1')
    // ‏الرقمُ الذي يُقرأ: مرّاتُ الظهور في التقرير
    const impressions = report === undefined ? null : JSON.stringify(JSON.parse(report.body_json)).match(/"impressions":(\d+)/)?.[1] ?? null
    const figure = impressions === null ? null : visible(page.getByText(new RegExp(`${Number(impressions).toLocaleString('en-US').replace(/,/g, '[,٬]?')}`))).first()
    const seen = figure === null ? false : await m.look(figure, `رقم الظهور (${impressions})`, { key: true })
    if (!seen) await m.look(visible(page.locator('h1')).first(), 'عنوان الصفحة', { key: true })
    return { success: seen, verified: report === undefined ? 'لا تقرير في القاعدة' : `تقرير ${report.id} · الظهور ${impressions ?? '—'} ${seen ? 'معروض' : 'غير معروض'}` }
  },
}

const R8: Journey = {
  id: 'R-8',
  title: 'إصلاح منشور فشل وإعادته إلى الطابور',
  plan: { target: '3 (§6)' },
  async run(j) {
    const { page, m, stack } = j
    const id = stack.seeded.posts.failed
    const attempts = () => all<{ idempotency_key: string }>(stack, 'SELECT idempotency_key FROM publish_attempts WHERE post_id = ?', id)
    const keyBefore = q<{ k: string }>(stack, 'SELECT idempotency_key AS k FROM posts WHERE id = ?', id)?.k
    const ledgerBefore = q<{ n: number }>(stack, 'SELECT COUNT(*) AS n FROM cost_ledger')?.n
    // ‏«خطوتُك التالية» تقول الفشلَ وفيها زرُّه — يُضغط باسمه («أصلح المنشور» اليوم، «افتح LinkedIn» قبل)
    m.note(`«خطوتُك التالية»: ${await nextStepText(page)}`)
    const fix = nextStep(page, /^(أصلح المنشور|افتح LinkedIn)/)
    const fixLabel = ((await fix.textContent().catch(() => '')) ?? '').trim().replace(/\s+/g, ' ')
    await m.tap(fix, `«${fixLabel || 'أصلح المنشور'}» في «خطوتك التالية»`)
    const requeue = page.locator(`form[action="/panel/drafts/requeue"]:has(input[name="id"][value="${id}"])`)
    await m.tap(button(requeue, /أعده/), '«أعده إلى المعتمَد»', { key: true })
    m.mark('requeued')
    m.note(`بعد «أعده» أُعيد إلى: ${new URL(page.url()).pathname}${new URL(page.url()).hash} · الحال: ${status(stack, id)?.status ?? '—'}`)
    // ‏المعتمَدُ بلا موعدٍ لا يُنشر: يُجدوَل من «المنشورات»
    if (status(stack, id)?.status === 'approved') {
      if ((await visible(scheduleForm(page, id)).count()) === 0) await m.tap(navItem(page, 'المنشورات'), '«المنشورات» للجدولة')
      await scheduleTomorrow(j, id, 'المنشور المُعاد')
    }
    const row = status(stack, id)
    const keyAfter = q<{ k: string }>(stack, 'SELECT idempotency_key AS k FROM posts WHERE id = ?', id)?.k
    const ledgerAfter = q<{ n: number }>(stack, 'SELECT COUNT(*) AS n FROM cost_ledger')?.n
    return {
      success: row?.status === 'queued' && keyAfter === keyBefore && ledgerAfter === ledgerBefore,
      verified: `status = ${row?.status ?? '—'} · idempotency_key ${keyAfter === keyBefore ? 'لم يتغيّر' : 'تغيّر!'} · cost_ledger ${ledgerAfter === ledgerBefore ? 'لم يتغيّر' : 'تغيّر!'} · محاولات ${attempts().length}`,
    }
  },
}

const R9: Journey = {
  id: 'R-9',
  title: 'تغيير موعد منشور مجدول (بعد أكثر من 48 ساعة)',
  plan: { target: '3 (§6)' },
  async run(j) {
    const { page, m, stack } = j
    const id = stack.seeded.posts.queued
    const was = status(stack, id)?.scheduled_at
    await m.tap(navItem(page, 'المنشورات'), '«المنشورات» في التنقّل')
    await m.tap(button(page.locator('#posts, main'), /^مجدولة/), 'تبويب «مجدولة»')
    // ‏«انقلها إلى» على بطاقتها نفسِها (D-200): «الأحد 9:00 ص» بتوقيت المالك ضغطةً واحدة، بلا فتح المحرّر
    await m.tap(button(page.locator(`#d-${id}`), 'الأحد 9:00 ص'), '«الأحد 9:00 ص» على بطاقة المجدولة', { key: true })
    m.mark('rescheduled')
    const row = status(stack, id)
    return {
      success: row?.status === 'queued' && row.scheduled_at !== was,
      verified: `status = ${row?.status ?? '—'} · الموعد ${was ?? '—'} ← ${row?.scheduled_at ?? '—'} (UTC)`,
    }
  },
}

/**
 * ‏**ر-10 تسلك «النتائج»** (D-314): الجوابُ المصمَّم في خطّة التصميم §6 والمبنيُّ تحت رأسها («هذا الشهر حتّى اليوم»).
 * ‏والنجاحُ أن يطابق الرقمُ المعروضُ الدفترَ بشهر منطقة المالك، بالحساب نفسِه الذي في الخادم (`monthStart` و`spendSince`).
 * ‏وثمنُ طريق الرئيسيّة (الطيّة «الكلفة وما وقع») يُسجَّل ملاحظةً للشفافية لا يُعدّ.
 */
const R10: Journey = {
  id: 'R-10',
  title: 'معرفة ما أُنفق هذا الشهر',
  plan: { target: '1 والرقمُ في الشاشة الأولى (§6)' },
  async run({ page, m, stack }) {
    const fold = visible(page.locator('details#ops > summary')).first()
    if ((await fold.count()) > 0) {
      // ‏بالمقياس نفسِه الذي يعدّ به Meter التمرير (حافّةُ الطيّة السفلى فوق ما يغطّيه الشريطُ السفليّ بهامش 24px)، لا بموضعها في الصفحة
      const { bottom, vh } = await m.insets()
      const need = await fold.evaluate((el, edge) => Math.max(0, Math.round(el.getBoundingClientRect().bottom + window.scrollY - edge + 24)), vh - bottom)
      m.note(`على الرئيسيّة: «الكلفة وما وقع» مطويّة، ويلزم ${need}px تمريرًا إليها ثمّ لمسةٌ لفتحها`)
    }
    await m.tap(navItem(page, 'النتائج'), '«النتائج» في التنقّل')
    const figure = visible(page.locator('.sub').filter({ hasText: 'هذا الشهر حتّى اليوم' }).locator('a.tap')).first()
    const seen = await m.look(figure, 'رقم «هذا الشهر حتّى اليوم»', { key: true })
    const zone = q<{ v: string }>(stack, "SELECT value AS v FROM settings WHERE key = 'owner_tz' LIMIT 1")?.v ?? 'Asia/Riyadh'
    const since = monthStart(new Date(), zone).toISOString().slice(0, 19).replace('T', ' ')
    const t = q<{ t: number }>(stack, 'SELECT COALESCE(SUM(total),0) AS t FROM cost_ledger WHERE org_id IN (SELECT id FROM orgs) AND at >= ?', since)?.t ?? 0
    const strip = (x: string): string => x.replace(/[\u2066-\u2069\s]/g, '')
    const shown = seen ? ((await figure.textContent()) ?? '') : ''
    return {
      success: seen && strip(shown) === strip(money(t)),
      verified: `المعروض ${strip(shown) || '—'} · الدفتر ${strip(money(t))} منذ ${since} UTC (${zone})`,
    }
  },
}

const R11: Journey = {
  id: 'R-11',
  title: 'الدخول من الهاتف (من رابط محفوظ إلى «التقرير»)',
  plan: { target: '2 (§6: الزرّ الأوّليّ ثمّ بصمة الجهاز)' },
  startLoggedOut: true,
  /*
   * ‏‏D-317: العاملُ الثاني إلزاميٌّ للمالك، فالمالكُ الذي سجّل مفتاحَه يدخل بالزرّ الأوّليّ في صفحة الدخول — لمسةٌ وبصمة —
   * ‏بدل أربع خطواتٍ بالبريد (البريد، «أرسل الرمز»، لصقُ الرمز، «ادخل») تليها الآن خطوةُ العامل الثاني.
   */
  async run({ page, m, stack }) {
    await ownerAuthenticator(page, stack)
    await m.tap(page.locator('#pk-login'), '«الدخول بمفتاح المرور» (بصمة الوجه)', { key: true })
    await page.waitForURL((u) => u.pathname === '/panel/report', { timeout: 15_000 }).catch(() => undefined)
    const landed = new URL(page.url())
    m.note(`بعد الدخول: ${landed.pathname}${landed.search}${landed.hash} (طُلب /panel/report)`)
    const session = (await page.context().cookies()).some((c) => c.name === '__Host-sada_session')
    if (session && landed.pathname !== '/panel/report') {
      await m.tap(navItem(page, 'النتائج'), '«النتائج» — لأنّ الدخول لم يُعِد إلى الصفحة المطلوبة')
    }
    const at = new URL(page.url()).pathname
    return { success: session && at === '/panel/report', verified: `جلسة ${session ? 'مفتوحة' : 'لا'} · الصفحة ${at}` }
  },
}

/**
 * ر-12 · «خطّة جديدة» من الرئيسيّة إلى «حلّل وابنِ» (D-293): الخطّةُ محورُ المنصّة منذ D-282، ولم تكن لها رحلةٌ تُقاس.
 * أربعُ خطواتٍ في المعالج وزرٌّ واحد، والنجاحُ خطّةُ شهرٍ في القاعدة ورسائلُ الكتابة في الطابور (لا تُستهلك محلّيًّا).
 */
const R12: Journey = {
  id: 'R-12',
  title: 'خطّة جديدة: من الرئيسيّة إلى «حلّل وابنِ الخطّة»',
  plan: { target: '5 = البابُ وخطواتُ المعالج الأربع كما تَعِد البطاقة («في أربع خطوات»)، والرحلةُ تختار «بلا صورة» فوقها (D-326)' },
  async prepare(stack) {
    // ‏الخطّةُ تحتاج مصدرين محلَّلين، وstaging حلّلت المستندَ وحدَه — فيُحلَّل العرضُ هنا
    stack.db.raw.prepare(`INSERT INTO content_items (id, source_id, summary, themes_json, worth_score, extracted_at) VALUES (?, ?, ?, ?, ?, datetime('now'))`)
      .run(crypto.randomUUID(), stack.seeded.sources.slides,
        'عرضٌ من اثنتي عشرة شريحة يختصر الإطار: تعريفُ المعلَم قبل التنفيذ، ومراجعةٌ أسبوعيّة قصيرة.',
        JSON.stringify({ hash: 'md5:9a8b7c6d5e4f30211203f4e5d6c7b8a9', themes: ['المراجعة الأسبوعيّة', 'تعريف المعلَم'], audience: 'قادة الفرق', angles: ['من الاجتماع الطويل إلى المراجعة القصيرة'], reason: 'شرائح تصلح منشورًا بصريًّا' }),
        0.74)
    return 'حُلّل العرضُ أيضًا: الخطّةُ تحتاج مصدرين محلَّلين'
  },
  async run({ page, m, stack }) {
    await m.tap(link(page, 'ابنِ خطّة'), '«ابنِ خطّة» في بطاقة «خطّةُ الشهر»')
    // ‏على الشاشة العريضة المنشئُ شاشةٌ واحدة (D-338): الخطواتُ كلُّها ظاهرةٌ ولا «التالي» — وعلى الهاتف خطوةٌ في كلّ شاشة
    const stepped = async (label: string): Promise<void> => { if (await page.locator('#wz-next').isVisible()) await m.tap(button(page, 'التالي'), label) }
    await stepped('«التالي» — الفترة: شهر، مختارةٌ سلفًا')
    await stepped('«التالي» — المنصّات المربوطة بإيقاعها، مختارةٌ سلفًا')
    await m.tap(visible(page.locator('label.wz-opt').filter({ has: page.locator('input[name="image_style"][value="none"]') })).first(), '«بلا صورة»')
    await stepped('«التالي» — المراجعة: العددُ والكلفة')
    await m.tap(button(page, 'حلّل وابنِ الخطّة'), '«حلّل وابنِ الخطّة»', { key: true })
    // ‏البناءُ في الخلفيّة (D-332): شاشةُ «صدى يبني خطّتك» بخطواتها، ثمّ تنتقل وحدَها إلى الخطّة حين يكتمل التخطيط
    await page.waitForURL(/\/panel\/plan\/review/, { timeout: 30_000 })
    const plans = q<{ n: number }>(stack, "SELECT COUNT(*) AS n FROM plans WHERE span = 'month' AND status <> 'superseded'")?.n ?? 0
    const queued = stack.generateQueue.sent.length
    const at = new URL(page.url()).pathname
    return {
      success: plans === 1 && queued > 0 && at === '/panel/plan/review',
      verified: `خطّة شهر في القاعدة: ${plans} · رسائل الكتابة في الطابور: ${queued} · الصفحة ${at}`,
    }
  },
}

/**
 * ر-13 · شاشةُ الخطّة: «اعتمد» على بندٍ يجدوله (D-293 · D-327). البذرةُ خطّةُ شهرٍ ببندين ومسوّدتيهما تنتظران
 * القرار، والنجاحُ الإصدارُ ١ في `plan_versions` والمعتمَدُ مجدولًا و`locked_at` مختومًا — **بلا «ثبّت الخطّة»**: كانت خطوةً
 * ثانيةً بحوار تأكيدها، وما اعتُمد بعدها لا يُجدوَل.
 */
let r13Plan = ''
const R13: Journey = {
  id: 'R-13',
  title: 'شاشة الخطّة: «اعتمد» على بندٍ يجدوله في موعده',
  plan: { target: '2 = البابُ و«اعتمد» — الاعتمادُ يجدول، و«تراجَع» على البطاقة بدل التأكيد (D-327)' },
  async prepare(stack) {
    const { doc, slides } = stack.seeded.sources
    const day = (plus: number): string => { const d = new Date(); d.setUTCDate(d.getUTCDate() + plus); return d.toISOString().slice(0, 10) }
    r13Plan = crypto.randomUUID()
    const items = [
      { sourceId: doc, platform: 'linkedin', kind: 'text', angle: 'ثلاثة أسئلة قبل كلّ معلَم', day: day(1), time: '07:00', why: 'لم يخرج منه شيء' },
      { sourceId: slides, platform: 'linkedin', kind: 'text', angle: 'من الاجتماع الطويل إلى المراجعة القصيرة', day: day(3), time: '07:00', why: 'يكمّل الأوّل' },
    ]
    stack.db.raw.prepare(`INSERT INTO plans (id, week_start, plan_json, model, status, org_id, span, choices_json, version) VALUES (?, ?, ?, 'claude-opus-5', 'approved', 'org_owner', 'month', ?, 1)`)
      .run(r13Plan, day(0), JSON.stringify({ rationale: 'بندان على يومين', items }),
        JSON.stringify({ channels: ['linkedin'], cadence: { linkedin: 1 }, sources: 'all', ideas: [], assets: [], autoImage: false, imageStyle: 'infographic', startDay: day(0) }))
    const texts = [
      'قبل كلّ معلَم ثلاثة أسئلة: ما المخرَج الذي يُرى؟ ومن يملك قرار القبول؟ وما أثر التأخّر؟\n\n#إدارة_المشاريع',
      'الاجتماع الطويل لا يصنع اتّفاقًا؛ المراجعة القصيرة على تعريفٍ مكتوب تصنعه.\n\n#الحوكمة',
    ]
    items.forEach((it, i) => {
      stack.db.raw.prepare(`INSERT INTO posts (id, plan_id, platform, account_id, source_id, source_refs, model, cost_usd, type, text, rationale, status, idempotency_key, created_at)
        VALUES (?, ?, 'linkedin', ?, ?, ?, 'claude-opus-5', 0.0412, 'text', ?, 'من الخطّة', 'draft', ?, datetime('now'))`)
        .run(crypto.randomUUID(), r13Plan, stack.seeded.accounts.linkedin, it.sourceId, JSON.stringify([it.sourceId]), texts[i]!, `plan:${r13Plan}:${i}`)
    })
    return 'خطّةُ شهرٍ ببندين ومسوّدتيهما تنتظران الاعتماد'
  },
  async run({ page, m, stack }) {
    await m.tap(link(page, /راجع واعتمد/), '«راجع واعتمد (2)» في بطاقة «خطّةُ الشهر»')
    await m.tap(visible(page.locator('form[action="/panel/plan/review/approve"] button[type="submit"]')).first(), '«اعتمد» على البند الأوّل')
    // ‏ولا «ثبّت الخطّة» بعدها (D-327): الاعتمادُ نفسُه يجدول ويحفظ الإصدار
    await page.waitForURL(/\/panel\/plan\/review/)
    const versions = q<{ n: number }>(stack, 'SELECT COUNT(*) AS n FROM plan_versions WHERE plan_id = ? AND version = 1', r13Plan)?.n ?? 0
    const queued = q<{ n: number }>(stack, "SELECT COUNT(*) AS n FROM posts WHERE plan_id = ? AND status = 'queued'", r13Plan)?.n ?? 0
    const locked = q<{ locked_at: string | null }>(stack, 'SELECT locked_at FROM plans WHERE id = ?', r13Plan)?.locked_at ?? null
    return {
      success: versions === 1 && queued === 1 && locked !== null,
      verified: `الإصدار 1 محفوظ: ${versions} · مجدول من الخطّة: ${queued} من بندٍ معتمَد · ثُبّتت ${locked === null ? 'لا' : 'نعم'}`,
    }
  },
}

/**
 * ‏**ر-16 · لوحُ البطاقة** (D-330، بقرار D-328): من مصغَّرةٍ في لوحة الشهر يُفتح اللوح، ويُعتمَد المنشورُ منه **بلا إعادة تحميل**.
 * ‏البذرةُ بذرةُ ر-13، والنجاحُ من القاعدة (المنشورُ مجدول) ومن الصفحة (اللوحُ يعرض «تراجَع عن الاعتماد»، ومصغَّرتُه بحال المجدول).
 * ‏وهو اختبارُ السكربت في متصفّحٍ حيّ: ما لا يراه اختبارٌ يرسل نموذجًا ويقرأ صفحة.
 */
const R16: Journey = {
  id: 'R-16',
  title: 'لوح البطاقة: من مصغَّرةٍ في لوحة الشهر إلى «اعتمد وجدوِل» بلا إعادة تحميل',
  plan: { target: '3 = البابُ والمصغَّرةُ و«اعتمد وجدوِل» في اللوح (D-330)' },
  prepare: (stack) => R13.prepare!(stack),
  async run({ page, m, stack }) {
    await m.tap(link(page, /راجع واعتمد/), '«راجع واعتمد (2)» في بطاقة «خطّةُ الشهر»')
    // ‏على العريض مصغَّرةُ اللوحة، وعلى الهاتف (المصغَّراتُ مطويّةٌ هناك) «عدّل» على البطاقة — كلاهما يفتح اللوحَ نفسَه
    await m.tap(visible(page.locator('.rv-mini[data-sheet], .rv-acts a[data-sheet]')).first(), 'المنشورُ الأوّل: مصغَّرتُه في اللوحة، أو «عدّل» على بطاقته في الهاتف')
    const sheet = page.locator('#rv-sheet[open]')
    await sheet.waitFor({ timeout: 8000 })
    await m.tap(sheet.locator('form[action="/panel/plan/review/approve"] button[type="submit"]'), '«اعتمد وجدوِل» في اللوح', { key: true })
    await sheet.locator('form[action="/panel/plan/review/undo"]').waitFor({ timeout: 8000 })
    const queued = q<{ n: number }>(stack, "SELECT COUNT(*) AS n FROM posts WHERE plan_id = ? AND status = 'queued'", r13Plan)?.n ?? 0
    const set = await page.locator('.rv-mini[data-st="set"]').count()
    return {
      success: queued === 1 && set === 1,
      verified: `مجدولٌ من الخطّة: ${queued} · مصغَّراتٌ بحال المجدول: ${set} · اللوحُ يعرض «تراجَع عن الاعتماد»`,
    }
  },
}

/**
 * ‏**ر-14 «بنفسي»** (D-324): المالكُ يكتب منشورَه ويعتمده — بلا نموذجٍ ولا كلفة. كان كلُّ بابٍ إلى مسوّدةٍ يمرّ بنموذجٍ مدفوع،
 * ‏فلا هدفَ له في §6 ولا «قبل»: الطريقُ لم يكن. والنصُّ يُلصق (خطوةٌ واحدة) كما يُلصق في ر-1، والنجاحُ من القاعدة: نصُّه حرفًا،
 * ‏و`model = owner`، ولا صفَّ في الدفتر، والحالُ بعد «اعتمد».
 */
const OWN_TEXT = 'الحوكمة لا تبطئ القرار، تحميه. (كتبتُها بنفسي، كما هي)\n\n#الحوكمة'
const R14: Journey = {
  id: 'R-14',
  title: 'منشورٌ تكتبه بنفسك ثمّ تعتمده — بلا نموذج ولا كلفة',
  plan: { target: '5 = §6 ر-2 ببابه «بنفسي»: «منشور جديد ▾» ← «بنفسي» ← النصّ ← «احفظ مسوّدة» ← «اعتمد» (D-326)' },
  async run({ page, m, stack }) {
    const ledger = (): number => q<{ n: number }>(stack, 'SELECT COUNT(*) AS n FROM cost_ledger')?.n ?? 0
    const spent = ledger()
    // ‏من الرئيسيّة بـ«منشور جديد ▾» كسائر أبواب الكتابة (D-326)، لا «المنشورات» ثمّ تبويب «اكتب» ثمّ المقطع
    await newPost(page, m, /بنفسي/, 'بنفسي')
    const form = page.locator('form[action="/panel/drafts/own"]')
    await m.type(form.locator('textarea[name="text"]'), OWN_TEXT, 'لصق النصّ في «نصّك»', { pasted: true })
    await m.tap(button(form, 'احفظ مسوّدة'), '«احفظ مسوّدة»', { key: true })
    m.mark('saved')
    const row = q<{ id: string; text: string; model: string }>(stack, "SELECT id, text, model FROM posts WHERE model = 'owner' AND text = ?", OWN_TEXT)
    if (row === undefined) return { success: false, verified: 'لم تُحفظ مسوّدةٌ بالنصّ كما كُتب' }
    await m.tap(button(draftForm(page, row.id), /^اعتمد/), '«اعتمد» على المسوّدة')
    const after = status(stack, row.id)
    const paid = ledger() - spent
    return {
      success: (after?.status === 'approved' || after?.status === 'queued') && paid === 0,
      verified: `النصّ حرفًا · model = ${row.model} · status = ${after?.status ?? '—'} · cost_ledger +${paid}`,
    }
  },
}

/**
 * ‏**الرئيسيّةُ الخالية** (D-326 · خطّة التصميم 5.5 «أوّل تشغيل»): ما تزرعه البذرةُ من حساباتٍ وتطبيقاتٍ ومصادرَ ومنشوراتٍ
 * ‏وكلفةٍ وتقاريرَ يُمحى، ويبقى المالكُ ومفتاحُ مروره وإعداداتُه ونبضُ الدورات — كمن فتح لوحتَه أوّلَ مرّة. والجداولُ بترتيب
 * ‏الأبناء قبل الآباء، والقيودُ موقوفةٌ أثناء المحو وحدَه (قاعدةٌ محلّيّةٌ للقياس، لا ترحيل).
 */
const ZERO_TABLES = [
  'publish_attempts', 'metrics', 'promotion_suggestions', 'media_claims', 'media', 'plan_versions', 'posts', 'plans', 'briefs',
  'analysis_claims', 'content_items', 'library_files', 'sources', 'uploads', 'token_alerts', 'tokens', 'accounts', 'oauth_apps',
  'cost_ledger', 'reports', 'alert_outbox',
] as const

function zero(stack: Stack): string {
  const raw = stack.db.raw
  raw.exec('PRAGMA foreign_keys = OFF')
  try {
    for (const t of ZERO_TABLES) {
      try { raw.exec(`DELETE FROM ${t}`) } catch { /* ‏جدولٌ لم يُرحَّل بعدُ لا يُمحى */ }
    }
  } finally {
    raw.exec('PRAGMA foreign_keys = ON')
  }
  const left = ZERO_TABLES.filter((t) => { try { return (q<{ n: number }>(stack, `SELECT COUNT(*) AS n FROM ${t}`)?.n ?? 0) > 0 } catch { return false } })
  return `رئيسيّةٌ خالية: مُحي ${ZERO_TABLES.length} جدولًا (الحساباتُ والتطبيقاتُ والمصادرُ والمقاطعُ والمنشوراتُ والكلفةُ والتقارير)${left.length === 0 ? '' : ` — وبقي في ${left.join('، ')}`}، وبقي المالكُ ومفتاحُه`
}

/** ‏قائمةُ البدء كما تُقرأ: «الخطوة 1 من 3» وما بعدها — من الصفحة. */
async function firstRunText(page: Page): Promise<string> {
  const box = page.locator('#first-run')
  if ((await box.count()) === 0) return 'لا قائمةَ بدءٍ في الرئيسيّة'
  return ((await box.locator('[data-fr-count]').textContent().catch(() => '')) ?? '').trim()
}

/**
 * ‏**ر-1·أوّل** (D-326): أوّلُ منصّةٍ من رئيسيّةٍ خالية **من «خطوتك التالية» نفسِها** — زرُّها الأوّليّ «اربط أوّل منصّة» إلى مساعد
 * ‏ضبط تطبيق أوّل منصّةٍ عند حقل المعرّف ودليلُه مفتوح (`setupHref`، أو إلى ربطها إن ضُبط). كان `#channels` فيُحوَّل إلى «الحسابات»
 * ‏ثمّ «أكمل الإعداد» على البطاقة ثمّ الحقل، وكانت الرحلةُ تضغط رابطَ Instagram في قائمة البدء فتقيس طريقًا غيرَ الذي يضغطه
 * ‏المالكُ أوّلًا (مراجعة D-326). والمنصّةُ تُقرأ من المساعد الذي نزل إليه، لا تُكتب هنا.
 */
const R1first: Journey = {
  id: 'R-1·أوّل',
  title: 'أوّل منصّة من رئيسيّةٍ خالية: «خطوتك التالية» ← ضبط التطبيق وربطه — حتّى مغادرة الموقع',
  plan: { target: '≤5 (§6 ر-1 والضبطُ معه: «اربط أوّل منصّة» ← المعرّف ← السرّ ← «احفظ» ← «اربط» · EASE-PLAN-2 §٥)' },
  async prepare(stack) {
    return zero(stack)
  },
  async run({ page, m, stack, leftSite }) {
    m.note(`قائمة البدء في الرئيسيّة: ${await firstRunText(page)}`)
    const go = visible(page.locator('.card.next a.btn-primary')).first()
    const goLabel = ((await go.textContent().catch(() => '')) ?? '').trim()
    await m.tap(go, `«${goLabel || 'الزرّ الأوّليّ'}» في «خطوتك التالية»`, { key: true })
    const at = new URL(page.url())
    const platform = /^\/panel\/channels\/([a-z]+)$/.exec(at.pathname)?.[1] ?? null
    if (platform === null) return { success: false, verified: `«خطوتك التالية» أنزلت إلى ${at.pathname}${at.hash} لا إلى مساعد منصّة` }
    m.note(`«خطوتك التالية» أنزلت إلى: ${at.pathname}${at.search}${at.hash}`)
    const id = page.locator(`#ci-${platform}`)
    if (!(await id.isVisible())) await m.tap(link(page.locator('main, body'), 'اضبط التطبيق'), '«اضبط التطبيق»')
    const clientId = `local0fake0${platform}0client`
    await m.type(id, clientId, 'لصق «Client ID» (من بوّابة مطوّري المنصّة)', { pasted: true })
    await m.type(page.locator(`#cs-${platform}`), `local0fake0${platform}0secret0000000`, 'لصق «Client Secret»', { pasted: true })
    await m.tap(visible(page.locator(`button[form="app-${platform}"]`).filter({ hasText: 'احفظ' })).first(), '«احفظ»')
    m.mark('app_saved')
    const saved = q<{ n: number }>(stack, 'SELECT COUNT(*) AS n FROM oauth_apps WHERE platform = ?', platform)?.n ?? 0
    if (saved === 0) return { success: false, verified: `oauth_apps: لا صفّ لـ ${platform} بعد «احفظ»` }
    m.note(`بعد «احفظ» أُعيد إلى: ${new URL(page.url()).pathname}${new URL(page.url()).hash}`)
    const connect = visible(page.locator(`a[href="/oauth/${platform}/start"]`)).first()
    if ((await connect.count()) === 0) await m.tap(visible(page.locator(`a[href^="/panel/channels/${platform}"]`)).first(), 'العودة إلى صفحة المنصّة')
    await m.tap(visible(page.locator(`a[href="/oauth/${platform}/start"]`)).first(), '«اربط»')
    // ‏غادر إلى المنصّة بالمعرّف الذي لُصق نفسِه — لا أيُّ مغادرة
    const left = leftSite.find((u) => new URL(u).searchParams.get('client_id') === clientId)
    return {
      success: left !== undefined,
      verified: left === undefined
        ? `لم يغادر بالمعرّف الملصوق (${leftSite.join(' · ') || '—'})`
        : `${platform}: غادر إلى ${new URL(left).origin}${new URL(left).pathname} بالمعرّف الملصوق`,
    }
  },
}

/**
 * ‏**ر-11·رمز** (D-326): المالكُ على جهازٍ لا يحمل مفتاحَ مروره — رمزُ البريد ثمّ الرقمُ من تطبيق المصادقة (العاملُ الثاني إلزاميٌّ منذ
 * ‏D-317، والرقمُ أحدُ بابيه). كانت ر-11 تقيس مفتاحَ المرور وحدَه، وهذا الطريقُ لا يُقاس. والرقمُ يُحسب بالدالّة التي يتحقّق بها
 * ‏الخادم (`codeAt`) من سرٍّ يُزرع بدالّة التسجيل نفسِها (`startTotp` ثمّ `confirmTotp`)، والبريدُ يُقرأ من «الصندوق».
 */
let totpSecret = ''
const R11code: Journey = {
  id: 'R-11·رمز',
  title: 'الدخول برمز البريد ثمّ رقم تطبيق المصادقة (جهازٌ بلا مفتاح المرور)',
  plan: { target: '6 = البريدُ وزرُّه، والرمزُ وزرُّه، والرقمُ وزرُّه (لا هدف في §6 لهذا الطريق · D-326)' },
  startLoggedOut: true,
  async prepare(stack) {
    totpSecret = newSecret()
    await startTotp(stack.db, stack.encKey, totpSecret, OWNER_EMAIL)
    // ‏مؤكَّدٌ بخطوةٍ قديمة: رقمُ اللحظة بعدها يُقبل، ولا يُعاد رقمٌ قُبل
    await confirmTotp(stack.db, counterFor(new Date()) - 4n, OWNER_EMAIL)
    return 'رقمُ تطبيق المصادقة مضبوطٌ ومؤكَّدٌ للمالك، ولا مفتاحَ مرورٍ في هذا المتصفّح'
  },
  async run({ page, m, stack }) {
    await m.type(page.locator('#e'), OWNER_EMAIL, '«البريد» (من اقتراح لوحة المفاتيح)', { pasted: true })
    await m.tap(page.locator('#login-send'), '«أرسل الرمز»')
    const code = lastCode(stack)
    if (code === '') return { success: false, verified: 'لم يصل رمزٌ إلى البريد' }
    await m.type(page.locator('#c'), code, 'لصق «رمز الدخول» من البريد', { pasted: true })
    await m.tap(button(page, 'دخول'), '«دخول»')
    m.note(`بعد الرمز: ${new URL(page.url()).pathname}`)
    const app = await codeAt(totpSecret, counterFor(new Date()))
    await m.type(page.locator('#code'), app, 'الرقم من تطبيق المصادقة (ستّة أرقام)')
    await m.tap(button(page.locator('form[action="/panel/2fa/totp"]'), 'تأكيد'), '«تأكيد»', { key: true })
    await page.waitForURL((u) => u.pathname === '/panel/report', { timeout: 15_000 }).catch(() => undefined)
    const landed = new URL(page.url())
    m.note(`بعد الرقم: ${landed.pathname}${landed.search}${landed.hash} (طُلب /panel/report)`)
    const session = (await page.context().cookies()).some((c) => c.name === '__Host-sada_session')
    if (session && landed.pathname !== '/panel/report' && landed.pathname !== '/panel/2fa') {
      await m.tap(navItem(page, 'النتائج'), '«النتائج» — لأنّ الدخول لم يُعِد إلى الصفحة المطلوبة')
    }
    const at = new URL(page.url()).pathname
    const step = q<{ s: string | null }>(stack, 'SELECT last_step AS s FROM totp WHERE id = 1')?.s ?? null
    return {
      success: session && at === '/panel/report',
      verified: `جلسة ${session ? 'مفتوحة' : 'لا'} · الصفحة ${at} · totp.last_step ${step === null ? '—' : 'تقدّم'}`,
    }
  },
}

/**
 * ‏**ر-15 · أوّلُ منشور** (D-326): حسابٌ واحدٌ مربوطٌ ولا شيءَ غيره — قائمةُ البدء «الخطوة 2 من 3» ← «اكتب فكرتك» ← الفكرة ←
 * ‏«اكتب المسوّدات» ← «اعتمد» حتّى يُجدوَل. **والنجاحُ أوّلُ منشورٍ في الطابور بموعده، ثمّ لا قائمةَ بدءٍ في الرئيسيّة** (اكتملت)؛
 * ‏كان «معتمَدٌ بلا موعد» يُحسب نجاحًا، ولا يُنظر في القائمة بعده (مراجعة D-326). والرئيسيّةُ تُقرأ بطلبٍ من الصفحة نفسِها
 * ‏(بكعكتها) لا بتحميلٍ يُعدّ خطوة.
 */
const R15: Journey = {
  id: 'R-15',
  title: 'أوّل منشور من قائمة البدء: فكرةٌ ثمّ اعتمادٌ حتّى الطابور',
  plan: { target: '4 = §6 ر-2 من قائمة البدء: البابُ ← الفكرة ← «اكتب» ← «اعتمد» (D-326)' },
  async prepare(stack) {
    const note = zero(stack)
    await saveApp(stack.db, stack.encKey, 'linkedin', '86local0linkedin', 'local-fake-linkedin-secret-0000', 'journey')
    const id = await upsertAccount(stack.db, 'org_owner', { platform: 'linkedin', kind: 'member', externalId: 'li-local-omar', displayName: 'عمر' })
    await saveTokens(stack.db, stack.encKey, id, {
      accessToken: `local-fake-access-${id}`,
      refreshToken: null,
      expiresAt: new Date(Date.now() + 55 * 86_400_000).toISOString(),
      refreshExpiresAt: null,
      scopes: 'openid profile w_member_social',
    } as Parameters<typeof saveTokens>[3])
    return `${note} — ثمّ رُبط LinkedIn «عمر» وحده`
  },
  async run({ page, m, stack }) {
    m.note(`قائمة البدء في الرئيسيّة: ${await firstRunText(page)}`)
    const before = new Set(all<{ id: string }>(stack, 'SELECT id FROM posts').map((r) => r.id))
    const go = visible(page.locator('#first-run li.at a.btn')).first()
    const goLabel = ((await go.textContent().catch(() => '')) ?? '').trim()
    await m.tap(go, `«${goLabel || 'زرّ الخطوة'}» في قائمة البدء`)
    const idea = visible(page.locator('form[action="/panel/drafts/idea"]')).first()
    await m.type(idea.locator('textarea[name="idea"]'), 'الحوكمة لا تبطئ القرار، تحميه', 'كتابة الفكرة')
    await m.tap(button(idea, /^اكتب/), '«اكتب المسوّدات»', { key: true })
    m.mark('drafted')
    const fresh = all<{ id: string }>(stack, "SELECT id FROM posts WHERE status = 'draft'").filter((r) => !before.has(r.id))
    if (fresh.length === 0) return { success: false, verified: 'لم تُكتب مسوّدة من الفكرة' }
    await m.tap(button(draftForm(page, fresh[0]!.id), /^اعتمد/), '«اعتمد» على المسوّدة الأولى')
    const row = status(stack, fresh[0]!.id)
    const cost = q<{ n: number }>(stack, 'SELECT COUNT(*) AS n FROM cost_ledger')?.n ?? 0
    const home = await page.evaluate(async () => (await fetch('/panel', { credentials: 'same-origin' })).text())
    const drawn = home.includes('data-pane="overview"')
    const listed = home.includes('id="first-run"')
    return {
      success: row?.status === 'queued' && row.scheduled_at !== null && drawn && !listed,
      verified: `مسوّدات من الفكرة: ${fresh.length} · الأولى: ${row?.status ?? '—'}${row?.scheduled_at == null ? ' بلا موعد' : ` (${row.scheduled_at} UTC)`} · قائمةُ البدء بعدها: ${!drawn ? 'لم تُرسم الرئيسيّة' : listed ? 'باقية' : 'اختفت'} · cost_ledger ${cost} صفّ`,
    }
  },
}

export const JOURNEYS: readonly Journey[] = [R0, R0undo, R1, R1setup, R1first, R2, R2stop, R3, R4, R5, R6, R7, R8, R9, R10, R11, R11code, R12, R13, R14, R15, R16]

export { Blocked }

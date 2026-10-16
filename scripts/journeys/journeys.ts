/**
 * الرحلاتُ الاثنتا عشرة (DESIGN-PLAN §6) — كما يؤدّيها مالكٌ يفتحها أوّلَ مرّة.
 *
 * **لا روابطَ عميقة**: كلُّ رحلةٍ تبدأ من الرئيسيّة، وتبلغ هدفَها بما يُرى في الشاشة —
 * بطاقةٌ في الرئيسيّة، أو الشريطُ السفليّ على الهاتف، أو الرافدةُ على الحاسوب. والنجاحُ
 * يُقرأ من القاعدة لا من رسالةٍ في الصفحة.
 */
import { readFileSync } from 'node:fs'
import type { Locator, Page } from 'playwright'
import { Blocked, Meter } from './meter'
import type { Stack } from './server'
import { LOCAL_ADMIN_TOKEN } from './server'

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
  /** ما في جدول §6: الخطواتُ اليوم والهدف. */
  readonly plan: { readonly today: string; readonly target: string }
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

/** تبويبٌ داخل وجهة (D-195 · D-204 · D-206): المنشورات والمكتبة والنتائج والإعدادات — شريطُ اللوح الظاهر. */
function subTab(page: Page, label: string): Locator {
  return visible(page.locator('section[data-pane]:not([hidden]) > nav.tab-bar a').filter({ hasText: label })).first()
}

function button(scope: Page | Locator, name: string | RegExp): Locator {
  return visible(scope.getByRole('button', { name, exact: typeof name === 'string' })).first()
}

function link(scope: Page | Locator, name: string | RegExp): Locator {
  return visible(scope.getByRole('link', { name })).first()
}

/**
 * محطّةٌ في «رحلةُ المنشور» على الرئيسيّة — **بعنوانها كما يُرى**، لا بعنوانٍ تشير إليه.
 * كانت كلُّ محطّةٍ تشير إلى `#posts`، وصارت تشير إلى البطاقة نفسِها (`#d-…` و`#s-…`
 * و`#i-…`): والمالكُ يقرأ «الاعتماد» ولا يقرأ الرابط.
 */
function station(page: Page, title: string): Locator {
  const trip = page.locator('.card').filter({ has: page.getByRole('heading', { name: 'رحلةُ المنشور' }) })
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

/** الدخولُ بكلمة الإدارة — تمهيدٌ لا يُعدّ إلّا في ر-11. */
export async function login(page: Page, url: string): Promise<void> {
  await page.goto(`${url}/panel`)
  await page.locator('input[name="token"]').fill(LOCAL_ADMIN_TOKEN)
  await page.locator('form button[type="submit"]').first().click()
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
    m.note('⚠ عطل: اعتُمدت بلا أيّ تعديل فكُتبت «edited» وحُفظ «original_text» — النصُّ عاد من ‹textarea› بأسطر CRLF ولا يُوحَّد قبل المقارنة في decide() (src/lib/draft/store.ts). والإشعار يقول «بنصّك بعد التعديل»')
  }
}

const status = (stack: Stack, id: string) =>
  q<{ status: string; scheduled_at: string | null }>(stack, 'SELECT status, scheduled_at FROM posts WHERE id = ?', id)

// ── الرحلات ───────────────────────────────────────────────────────────

const R0: Journey = {
  id: 'R-0',
  title: 'مراجعة ما ينتظر قرارك: اعتماد مسوّدة',
  plan: { today: 'يُقاس', target: '1' },
  async run({ page, m, stack }) {
    const id = stack.seeded.posts.draft
    // ‏من الرئيسيّة: محطّةُ «الاعتماد» في رحلة المنشور تقول «تنتظر قرارك» — وتنزل إلى البطاقة
    await m.tap(station(page, 'الاعتماد'), 'محطّة «الاعتماد» في الرئيسيّة')
    await m.tap(button(draftForm(page, id), 'اعتمد'), '«اعتمد» على المسوّدة', { key: true })
    const row = status(stack, id)
    crlf(m, stack, id)
    return { success: row?.status === 'approved' || row?.status === 'edited', verified: `posts.status = ${row?.status ?? '—'}` }
  },
}

const R1: Journey = {
  id: 'R-1',
  title: 'ربط منصّة جديدة (Instagram أوّل مرّة) — حتّى مغادرة الموقع إلى OAuth',
  plan: { today: '16', target: '5' },
  async run({ page, m, stack, leftSite }) {
    // ‏و«أكمل الإعداد» ينزل إلى حقل المعرّف نفسِه (D-205: `setupHref`)، فلا تُضغط «اضبط التطبيق» إلّا إن لم يظهر
    await m.tap(visible(page.locator('a[href^="/panel/channels/instagram?tab=setup"]')).first(), 'بطاقة Instagram «أكمل الإعداد»')
    const id = page.locator('#ci-instagram')
    if (!(await id.isVisible())) await m.tap(link(page.locator('main, body'), 'اضبط التطبيق'), '«اضبط التطبيق»')
    await m.type(id, '1234567890123456', 'لصق «Client ID» (من Meta)', { pasted: true })
    await m.type(page.locator('#cs-instagram'), 'local0fake0instagram0secret00000', 'لصق «Client Secret»', { pasted: true })
    await m.tap(button(page.locator('form[action="/panel/channels/app"]').filter({ has: id }), 'احفظ'), '«احفظ»')
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

/** ر-2 كما ينبغي: يبحث عن بطاقة «الكتابة من مصدر» حتّى يجدها، ثمّ يعتمد المسوّدةَ الجديدة. */
const R2: Journey = {
  id: 'R-2',
  title: 'كتابة منشور من مصدر واعتماده (المسار الذي يعمل)',
  plan: { today: '8', target: '4' },
  async run({ page, m, stack }) {
    const before = new Set(all<{ id: string }>(stack, 'SELECT id FROM posts').map((r) => r.id))
    await m.tap(navItem(page, 'المنشورات'), '«المنشورات» في التنقّل')
    await m.tap(subTab(page, 'اكتب'), 'تبويبُ «اكتب»')
    const card = page.locator('form[action="/panel/drafts/write"]')
    await m.look(visible(page.getByRole('heading', { name: 'الكتابة من مصدر' })), 'عنوان «الكتابة من مصدر»')
    const sources = await card.locator('select[name="id"] option').allTextContents()
    m.note(`قائمةُ المصدر فيها ${sources.length} خيار: ${sources.join(' · ')} — والمصدران في Drive بالاسم نفسه، والمحلَّلُ وحده يظهر`)
    const platform = await card.locator('select[name="platform"]').inputValue()
    m.note(`المنصّةُ المختارةُ سلفًا: ${platform} — فلا اختيارَ يلزم لـ LinkedIn`)
    await m.tap(button(card, 'اكتب مسوّدة'), '«اكتب مسوّدة»', { key: true })
    m.mark('drafted')
    const fresh = all<{ id: string; status: string }>(stack, "SELECT id, status FROM posts WHERE status = 'draft'").filter((r) => !before.has(r.id))
    if (fresh.length === 0) return { success: false, verified: 'لم تُكتب مسوّدة' }
    const id = fresh[0]!.id
    await m.tap(button(draftForm(page, id), 'اعتمد'), '«اعتمد» على المسوّدة الجديدة')
    const row = status(stack, id)
    crlf(m, stack, id)
    const cost = q<{ n: number }>(stack, "SELECT COUNT(*) AS n FROM cost_ledger WHERE operation LIKE 'draft:linkedin:%' AND at >= datetime('now', '-5 minutes')")?.n ?? 0
    return { success: row?.status === 'approved' || row?.status === 'edited', verified: `مسوّدةٌ جديدة ${id.slice(0, 8)} · status = ${row?.status ?? '—'} · cost_ledger +${cost}` }
  },
}

/**
 * ر-2 كما وقع: مالكٌ على الهاتف يمرّر «المنشورات» من أعلاها بحثًا عن «اكتب»، **ويضغط أوّلَ
 * زرٍّ رئيسيٍّ يوافق مقصده** — ويُسجَّل كلُّ شاشةٍ مرّ بها وما فيها.
 */
const R2stop: Journey = {
  id: 'R-2·stop',
  title: 'كتابة منشور من مصدر — حيث يقف مالكٌ يمرّر بحثًا عن «اكتب»',
  plan: { today: '8', target: '4' },
  async run({ page, m, stack }) {
    // ‏ما في الشاشة الأولى من الرئيسيّة: أفيها بابٌ إلى «اكتب»؟
    const homeCtas = await page.evaluate(() => Array.from(document.querySelectorAll('a.btn, button.btn-primary, a.btn-primary'))
      .filter((el) => { const r = el.getBoundingClientRect(); return r.height > 0 && r.top >= 0 && r.bottom <= window.innerHeight })
      .map((el) => (el.textContent ?? '').trim().replace(/\s+/g, ' ')).filter((t) => t !== ''))
    m.note(`أزرارُ الشاشة الأولى في الرئيسيّة: ${homeCtas.join(' · ') || '—'} — ولا «منشور جديد» ولا «اكتب» في الرئيسيّة كلّها`)
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
        return Array.from(document.querySelectorAll('button.btn-primary, a.btn-primary, button[type="submit"]'))
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
    if (stopAt === null) return { success: false, verified: 'لا زرَّ يوافق المقصد في الشاشات' }
    m.note(`أوّلُ زرٍّ رئيسيٍّ يوافق المقصد: «${stopAt.label}» في الشاشة ${stopAt.screen}`)
    // ‏يعود إلى حيث وقف ويضغطه
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }))
    const target = page.locator('[data-journey-hit]').first()
    await m.tap(target, `«${stopAt.label}» — أوّلُ ما وافق المقصد`, { key: true })
    /*
     * ‏منذ D-195 أوّلُ ما يوافق المقصدَ بابٌ لا فعل: «اكتب من فكرة» ينزل إلى نموذجها. فيمضي المالكُ
     * ‏فيما وصل إليه، يكتب فكرتَه ويضغط زرَّه — ولا يُحسَب نجاحًا إن ضغط «اعتمد» على مسوّدةٍ قديمة.
     */
    const idea = visible(page.locator('form[action="/panel/drafts/idea"]')).first()
    if ((await idea.count()) > 0) {
      await m.type(idea.locator('textarea[name="idea"]'), 'الحوكمةُ لا تبطئ القرار، تحميه', 'كتابة الفكرة')
      await m.tap(button(idea, 'اكتب المسوّدات'), '«اكتب المسوّدات»')
    }
    const made = drafts()
    const approvedOld = status(stack, stack.seeded.posts.draft)?.status
    return {
      success: made > 0 && approvedOld === 'draft',
      verified: `مسوّداتٌ جديدة (من مصدرٍ أو فكرة): ${made} · والمسوّدةُ القديمة (قبل 5 ساعات) صارت: ${approvedOld ?? '—'}`,
    }
  },
}

const R3: Journey = {
  id: 'R-3',
  title: 'إضافة صورة إلى منشور (إنفوجرافيك)',
  plan: { today: '3 (توليدٌ فقط)', target: '2' },
  async run({ page, m, stack }) {
    const id = stack.seeded.posts.draft
    await m.tap(station(page, 'الصورة'), 'محطّة «الصورة» في الرئيسيّة')
    const gen = page.locator(`form[action="/panel/media/generate"]:has(input[name="id"][value="${id}"])`).filter({ hasText: 'ولّد إنفوجرافيك' })
    await m.tap(button(gen, 'ولّد إنفوجرافيك'), '«ولّد إنفوجرافيك»', { key: true })
    const media = q<{ n: number; bytes: number }>(stack, "SELECT COUNT(*) AS n, MAX(bytes) AS bytes FROM media WHERE post_id = ? AND status = 'ready'", id)
    const shown = await visible(page.locator(`img[src^="/panel/media/"]`)).count()
    return { success: (media?.n ?? 0) > 0, verified: `media ready = ${media?.n ?? 0} (${media?.bytes ?? 0} بايت) · صورٌ معروضة ${shown}` }
  },
}

const R4: Journey = {
  id: 'R-4',
  title: 'رفع فيديو ونشره على YouTube وTikTok وInstagram',
  plan: { today: '13', target: '6' },
  async prepare(stack) {
    // ‏staging لا تربط TikTok ولا Instagram — ورحلةُ «الثلاث» تفترضهما مربوطين
    for (const [platform, ext, name] of [['tiktok', 'tt-local', 'omar.sada'], ['instagram', 'ig-local', 'omar.sada']] as const) {
      stack.db.raw.prepare(`INSERT INTO accounts (id, platform, kind, external_id, display_name, status) VALUES (?, ?, 'member', ?, ?, 'active')`)
        .run(`${platform}:member:${ext}`, platform, ext, name)
    }
    return 'أُضيف حسابا TikTok وInstagram (غيرُ مربوطين في staging) لتُقاس رحلةُ الثلاث كاملة'
  },
  async run({ page, m, stack, assets }) {
    const known = new Set(all<{ id: string }>(stack, 'SELECT id FROM uploads').map((r) => r.id))
    await m.tap(navItem(page, 'المكتبة'), '«المكتبة» في التنقّل')
    await m.tap(subTab(page, 'الفيديو'), 'تبويبُ «الفيديو»')
    await m.look(visible(page.getByRole('heading', { name: 'فيديوهاتك' })), 'عنوان «فيديوهاتك»')
    const pick = visible(page.locator('label').filter({ has: page.locator('#vfile') })).first()
    // ‏بالاسم العربيّ كما يرفعه المالك — والبايتاتُ تُمرَّر لا المسار (Playwright يُسقط مسارًا غيرَ لاتينيّ)
    const clip = { name: 'الإطار_الأول.mp4', mimeType: 'video/mp4', buffer: readFileSync(assets.clip) }
    await m.file(pick, page.locator('#vfile'), clip, '«اختر مقطعًا وارفعه» ← الملفّ', { key: true })
    const uploaded = await m.wait(async () => {
      const row = all<{ id: string; status: string }>(stack, 'SELECT id, status FROM uploads').find((r) => !known.has(r.id))
      return row?.status === 'ready' && page.url().includes('#videos')
    }, 60_000)
    if (!uploaded) {
      const msg = await page.locator('#vup-msg').textContent().catch(() => '')
      return { success: false, verified: `لم يكتمل الرفع: ${msg ?? ''}` }
    }
    m.mark('uploaded')
    const upload = all<{ id: string; width: number | null; height: number | null; duration_ms: number | null }>(stack, 'SELECT id, width, height, duration_ms FROM uploads').find((r) => !known.has(r.id))!
    m.note(`المقطع: ${upload.width ?? '?'}×${upload.height ?? '?'} · المدّة ${upload.duration_ms ?? 'غيرُ مقروءة'}`)
    const form = page.locator(`form[action="/panel/uploads/${upload.id}/posts"]`)
    for (const p of ['youtube', 'tiktok', 'instagram']) {
      const box = form.locator(`input[name="platform"][value="${p}"]`)
      if ((await box.count()) === 0) continue
      if (await box.isDisabled()) m.note(`مربّعُ ${p} معطَّل`)
      else if (!(await box.isChecked())) await m.tap(box, `تعليم ${p}`)
    }
    await m.type(form.locator('textarea[name="caption"]'), 'الإطار الأوّل في دقيقة: كيف نعرّف المعلَم قبل أن يبدأ العمل', 'نصّ المنشور (سطره الأوّل عنوانُ YouTube)')
    const approve = form.locator('input[name="approve"]')
    if ((await approve.count()) > 0 && !(await approve.isChecked())) await m.tap(approve, '«اعتمده الآن»')
    await m.tap(button(form, 'أنشئ المنشورات'), '«أنشئ المنشورات»')
    m.mark('posts_created')
    const posts = all<{ id: string; platform: string; status: string }>(stack,
      `SELECT p.id, p.platform, p.status FROM posts p JOIN media me ON me.post_id = p.id WHERE me.upload_id = ? ORDER BY p.platform`, upload.id)
    m.note(`منشوراتٌ أُنشئت: ${posts.map((p) => `${p.platform}:${p.status}`).join(' · ') || '—'}`)
    // ‏ثمّ يجدول كلَّ واحدٍ من بطاقته — لا «جدوِل للثلاث»
    await m.tap(navItem(page, 'المنشورات'), '«المنشورات» للجدولة')
    for (const p of posts) {
      if ((await scheduleForm(page, p.id).count()) === 0) {
        m.note(`لا نموذجَ جدولةٍ لـ ${p.platform}`)
        continue
      }
      await scheduleTomorrow({ page, m, stack, assets, leftSite: [] }, p.id, p.platform)
    }
    const after = posts.map((p) => `${p.platform}:${status(stack, p.id)?.status ?? '—'}`)
    const queued = posts.filter((p) => status(stack, p.id)?.status === 'queued').length
    const ig = posts.find((p) => p.platform === 'instagram')
    if (ig !== undefined && status(stack, ig.id)?.status !== 'queued') {
      const offered = await scheduleForm(page, ig.id).locator('select[name="account"] option').allTextContents().catch(() => [])
      m.note(`⚠ عطل: منشورُ Instagram (من المقطع) لا يُجدوَل من بطاقته — قائمةُ «الحساب» فيها ${offered.join(' · ') || '—'}، والخادمُ يردّ «المنشور لـ instagram والحساب في linkedin». السبب: platformOf() في src/lib/draft/store.ts تقرأ كلَّ منصّةٍ ليست في PLATFORMS (ومنها instagram) LinkedIn، فتُعرض البطاقةُ LinkedIn ويُعرض حسابُ LinkedIn — و«وزّع المعتمَد» يقرأ القائمةَ نفسَها`)
    }
    return { success: posts.length === 3 && queued === 3, verified: `${posts.length} منشورات · مجدولة ${queued} (${after.join(' · ')})` }
  },
}

const R5: Journey = {
  id: 'R-5',
  title: 'استيراد خطّة من ملفّ CSV',
  plan: { today: '8', target: '4' },
  async run({ page, m, stack, assets }) {
    const before = q<{ n: number }>(stack, "SELECT COUNT(*) AS n FROM posts WHERE status = 'queued'")?.n ?? 0
    await m.tap(navItem(page, 'المنشورات'), '«المنشورات» في التنقّل')
    // ‏رأسُ «المنشورات» فيه بابُ الخطّة باسمه — والمالكُ يضغطه ولا يمرّر إلى آخر اللوح بحثًا عنه
    await m.tap(link(page, 'خطّة من ملفّ'), '«خطّة من ملفّ» في رأس «المنشورات»')
    const form = page.locator('form[action="/panel/plan-import"]')
    const pick = visible(form.locator('label').filter({ has: page.locator('input[name="file"]') })).first()
    await m.file(pick, form.locator('input[name="file"]'), assets.plan, '«اختر ملفّ الخطّة (CSV)» ← الملفّ', { key: true })
    // ‏الملفُّ يُقرأ حين يُختار؛ و«اقرأ الخطّة» تُضغط إن بقيت ظاهرةً بعده لا قبله
    const read = button(form, 'اقرأ الخطّة')
    if ((await read.count()) > 0) await m.tap(read, '«اقرأ الخطّة»')
    else m.note('قُرئ الملفُّ حين اختير — بلا «اقرأ الخطّة»')
    m.mark('previewed')
    const approve = visible(page.locator('form[action$="/approve"] button[type="submit"]')).first()
    const label = ((await approve.textContent().catch(() => '')) ?? '').trim()
    await m.tap(approve, `«${label || 'اعتمد وجدوِل'}»`)
    const after = q<{ n: number }>(stack, "SELECT COUNT(*) AS n FROM posts WHERE status = 'queued'")?.n ?? 0
    return { success: after - before === 3, verified: `منشوراتٌ مجدولةٌ جديدة: ${after - before} من 3 أسطر` }
  },
}

const R6: Journey = {
  id: 'R-6',
  title: 'جدولة منشور معتمَد',
  plan: { today: '4', target: '2' },
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
  plan: { today: '4', target: '1' },
  async run({ page, m, stack }) {
    await m.tap(navItem(page, 'النتائج'), '«النتائج» في التنقّل')
    const report = q<{ id: string; body_json: string }>(stack, 'SELECT id, body_json FROM reports ORDER BY id DESC LIMIT 1')
    // ‏الرقمُ الذي يُقرأ: مرّاتُ الظهور في التقرير
    const impressions = report === undefined ? null : JSON.stringify(JSON.parse(report.body_json)).match(/"impressions":(\d+)/)?.[1] ?? null
    const figure = impressions === null ? null : visible(page.getByText(new RegExp(`${Number(impressions).toLocaleString('en-US').replace(/,/g, '[,٬]?')}`))).first()
    const seen = figure === null ? false : await m.look(figure, `رقم الظهور (${impressions})`, { key: true })
    if (!seen) await m.look(visible(page.locator('h1')).first(), 'عنوان الصفحة', { key: true })
    return { success: seen, verified: report === undefined ? 'لا تقرير في القاعدة' : `تقرير ${report.id} · الظهور ${impressions ?? '—'} ${seen ? 'معروضٌ' : 'غيرُ معروض'}` }
  },
}

const R8: Journey = {
  id: 'R-8',
  title: 'إصلاح منشور فشل وإعادته إلى الطابور',
  plan: { today: '9', target: '3' },
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
  plan: { today: 'يُقاس', target: '3' },
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

const R10: Journey = {
  id: 'R-10',
  title: 'معرفة ما أُنفق هذا الشهر',
  plan: { today: 'يُقاس', target: '1' },
  async run({ page, m, stack }) {
    const month = q<{ t: number }>(stack, "SELECT ROUND(COALESCE(SUM(total),0), 2) AS t FROM cost_ledger WHERE at >= strftime('%Y-%m-01 00:00:00','now')")?.t ?? 0
    const d30 = q<{ t: number }>(stack, "SELECT ROUND(COALESCE(SUM(total),0), 2) AS t FROM cost_ledger WHERE at >= datetime('now','-30 days')")?.t ?? 0
    m.note(`في القاعدة: هذا الشهر $${month.toFixed(2)} · آخر 30 يومًا $${d30.toFixed(2)}`)
    // ‏أوّلًا: هل في الصفحة «هذا الشهر» أصلًا؟
    const monthText = visible(page.getByText(/هذا الشهر|الشهر الحاليّ|شهر (أكتوبر|سبتمبر)/)).first()
    if ((await monthText.count()) > 0) {
      const ok = await m.look(monthText, '«هذا الشهر»', { key: true })
      return { success: ok, verified: `وُجد «هذا الشهر» · القاعدة $${month.toFixed(2)}` }
    }
    // ‏وإلّا: أقربُ ما في الرئيسيّة — بلاطةُ «إنفاق 30 يومًا»
    const tile = visible(page.locator('.card.tile').filter({ has: page.locator('.kv-k', { hasText: /إنفاق 30/ }) })).first()
    const seen = await m.look(tile, 'بلاطة «إنفاق 30 يوما» (أقربُ ما يوجد)', { key: true })
    const shown = seen ? ((await tile.locator('.kv-v').textContent()) ?? '').replace(/\s+/g, ' ').trim() : '—'
    const today = ((await visible(page.locator('.card.tile').filter({ has: page.locator('.kv-k', { hasText: 'إنفاق اليوم' }) })).first().locator('.kv-v').textContent().catch(() => '')) ?? '').replace(/\s+/g, ' ').trim()
    m.note(`المعروض: «إنفاق 30 يوما» = ${shown} · «إنفاق اليوم» = ${today} · ولا سقفَ شهريّ يُقارَن به`)
    return {
      success: false,
      verified: `لا رقمَ «هذا الشهر» في اللوحة — أقربُه «30 يومًا» ($${d30.toFixed(2)}) وهو غيرُ الشهر ($${month.toFixed(2)})`,
    }
  },
}

const R11: Journey = {
  id: 'R-11',
  title: 'الدخول من الهاتف (من رابطٍ محفوظ إلى «التقرير»)',
  plan: { today: 'يُقاس', target: '2' },
  startLoggedOut: true,
  async run({ page, m, stack }) {
    await m.type(page.locator('input[name="token"]'), LOCAL_ADMIN_TOKEN, 'لصق كلمة الإدارة', { pasted: true })
    await m.tap(page.locator('form button[type="submit"]').first(), '«ادخل»', { key: true })
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

export const JOURNEYS: readonly Journey[] = [R0, R1, R2, R2stop, R3, R4, R5, R6, R7, R8, R9, R10, R11]

export { Blocked }

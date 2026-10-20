/**
 * عدّادُ الرحلة — يقيس ما يفعله المالكُ لا ما تفعله الشيفرة.
 *
 * كلُّ فعلٍ يمرّ من هنا: نقرةٌ أو اختيارٌ أو كتابةٌ أو ملفّ. وقبل كلّ فعلٍ يُبحث عن
 * الهدف **كما يبحث الإنسان**: إن لم يكن في الشاشة مُرِّرت الصفحةُ إليه، ويُعدّ ما
 * مُرِّر بالبكسل وبالسحبات. ويُصوَّر ما يراه المالكُ والهدفُ مؤطَّر، ثمّ يُفعل.
 *
 * **والشاشةُ ما يُرى لا ما يُرسم**: الشريطُ السفليُّ الثابت على الهاتف يغطّي
 * أسفلها، فهدفٌ تحته ليس «في الشاشة» ولو وقع داخل النافذة.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Locator, Page } from 'playwright'

export interface Viewport {
  readonly name: 'phone' | 'desktop'
  readonly width: number
  readonly height: number
  readonly touch: boolean
  readonly dpr: number
}

export const VIEWPORTS: readonly Viewport[] = [
  { name: 'phone', width: 390, height: 844, touch: true, dpr: 2 },
  { name: 'desktop', width: 1440, height: 900, touch: false, dpr: 1 },
]

export type StepKind = 'tap' | 'choose' | 'type' | 'file' | 'confirm' | 'look'

export interface StepRecord {
  readonly n: number
  readonly kind: StepKind
  readonly label: string
  /** العنوانُ قبل الفعل — الصفحةُ التي وُجد فيها الهدف. */
  readonly url: string
  /** أكان الهدفُ في الشاشة قبل أيّ تمرير؟ */
  readonly inView: boolean
  readonly scrolledPx: number
  readonly swipes: number
  readonly disabled: boolean
  readonly loaded: boolean
  readonly flash: string | null
  readonly ms: number
  readonly shot: string
}

/** خطأٌ يقف به المسار: زرٌّ معطَّل، أو هدفٌ لا يوجد. ويُسجَّل سببُه ولا يُبتلَع. */
export class Blocked extends Error {
  override readonly name = 'Blocked'
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export class Meter {
  readonly steps: StepRecord[] = []
  readonly notes: string[] = []
  readonly flashes: string[] = []
  readonly disabledSeen = new Set<string>()
  readonly shots: string[] = []
  readonly milestones: Record<string, number> = {}
  readonly dialogs: string[] = []
  private readonly pendingDialogs: string[] = []
  /** ارتفاعُ ما يُرى من الشاشة (بلا الرأس والشريط الثابتين) — به تُقاس «الشاشات». */
  usableHeight = 0
  loads = 0
  /** طلباتُ تنقّلٍ بدأت في الإطار الرئيس — بها يُعرف أنّ الفعلَ فتح صفحة. */
  private navs = 0
  scrollPx = 0
  swipes = 0
  taps = 0
  typedChars = 0
  /** أكان الهدفُ الحاسمُ في الشاشة الأولى من صفحته؟ */
  firstScreen: boolean | null = null
  keyLabel: string | null = null
  private t0 = 0
  private shotN = 0
  private counting = false
  private lastFlash = ''

  constructor(
    readonly page: Page,
    readonly vp: Viewport,
    readonly dir: string,
    readonly rel: string,
  ) {
    mkdirSync(dir, { recursive: true })
    page.on('load', () => {
      if (this.counting) this.loads += 1
    })
    page.on('request', (request) => {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) this.navs += 1
    })
    // ‏الحوارُ نقرةٌ يدفعها المالك: يُقبَل ويُعدّ خطوةً بعد الفعل الذي فتحه، ولا يُرفض صامتًا
    page.on('dialog', (dialog) => {
      this.dialogs.push(dialog.message())
      if (this.counting) this.pendingDialogs.push(dialog.message())
      void dialog.accept()
    })
  }

  /** يبدأ العدّ من حيث المالك الآن (الرئيسيّة عادةً) ويصوّر نقطةَ البدء. */
  async start(label = 'البداية'): Promise<void> {
    this.counting = true
    this.loads = 0
    this.t0 = Date.now()
    const { top, bottom, vh } = await this.insets()
    this.usableHeight = vh - top - bottom
    this.lastFlash = await this.readFlash()
    await this.shot(label)
  }

  elapsed(): number {
    return Date.now() - this.t0
  }

  note(text: string): void {
    this.notes.push(text)
  }

  mark(name: string): void {
    this.milestones[name] = this.steps.filter((s) => s.kind !== 'look').length
  }

  /** عددُ الأفعال (بلا النظر). */
  get actions(): number {
    return this.steps.filter((s) => s.kind !== 'look').length
  }

  /** حدودُ ما يُرى: ما تغطّيه العناصرُ الثابتة أعلى النافذة وأسفلها. */
  async insets(): Promise<{ top: number; bottom: number; vh: number }> {
    return this.page.evaluate(() => {
      const vh = window.innerHeight
      let top = 0
      let bottom = 0
      for (const el of Array.from(document.querySelectorAll('body *'))) {
        const s = getComputedStyle(el)
        if (s.position !== 'fixed' && s.position !== 'sticky') continue
        if (s.display === 'none' || s.visibility === 'hidden') continue
        const r = el.getBoundingClientRect()
        if (r.height === 0 || r.width < window.innerWidth * 0.6 || r.height > vh / 3) continue
        if (r.top <= 1 && r.bottom > 0) top = Math.max(top, r.bottom)
        if (r.bottom >= vh - 1 && r.top < vh) bottom = Math.max(bottom, vh - r.top)
      }
      return { top, bottom, vh }
    })
  }

  /**
   * يُظهر الهدفَ كما يُظهره الإنسان: إن كان في الشاشة لم يُمسّ شيء، وإلّا مُرِّرت
   * الصفحةُ حتّى يقع فوق الشريط السفليّ بهامشٍ صغير.
   */
  async reveal(target: Locator): Promise<{ inView: boolean; scrolled: number; swipes: number }> {
    await target.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {
      throw new Blocked('الهدف غير ظاهر في الصفحة')
    })
    const { top, bottom, vh } = await this.insets()
    const usable = vh - top - bottom
    const where = () =>
      target.evaluate((el, { top, bottom }) => {
        const r = el.getBoundingClientRect()
        // ‏ما في شريطٍ ثابت (الشريطُ السفليّ، الرأس) يُرى دائمًا ولا يُمرَّر إليه
        let fixed = false
        for (let a: Element | null = el; a !== null; a = a.parentElement) {
          if (getComputedStyle(a).position === 'fixed') fixed = true
        }
        const vh = window.innerHeight
        const seen = fixed ? r.top >= 0 && r.bottom <= vh : r.top >= top && r.bottom <= vh - bottom
        const need = r.top < top ? r.top - top - 24 : r.bottom - (vh - bottom) + 24
        return { seen, fixed, need }
      }, { top, bottom })
    const first = await where()
    if (first.seen) return { inView: true, scrolled: 0, swipes: 0 }

    /*
     * **سحبةً بعد سحبة كما يفعل الإبهام** — لا قفزةٌ إلى موضع العنصر: الشريطُ اللاصق
     * (`sticky`) يظهر قبل موضعه الساكن، وقفزةٌ إلى الساكن تعدّ ما لم يُحتَج إليه.
     */
    let moved = 0
    const swipe = Math.max(80, Math.round(usable * 0.7))
    for (let i = 0; i < 80; i += 1) {
      const now = await where()
      if (now.seen) break
      if (now.fixed) {
        // ‏ثابتٌ خارج النافذة (رافدةٌ أطولُ منها): يُمرَّر داخل حاويته
        moved += await target.evaluate((el) => {
          const before = el.getBoundingClientRect().top
          el.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior })
          return Math.abs(el.getBoundingClientRect().top - before)
        })
        break
      }
      const dy = Math.sign(now.need) * Math.min(Math.abs(now.need), swipe)
      const step = await this.page.evaluate((dy) => {
        const before = window.scrollY
        window.scrollBy({ top: dy, behavior: 'instant' as ScrollBehavior })
        return Math.abs(window.scrollY - before)
      }, dy)
      if (step === 0) {
        // ‏الصفحةُ لا تتحرّك والعنصرُ في حاويةٍ تُمرَّر وحدها
        moved += await target.evaluate((el) => {
          const before = el.getBoundingClientRect().top
          el.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior })
          return Math.abs(el.getBoundingClientRect().top - before)
        })
        break
      }
      moved += step
    }
    const swipes = Math.ceil(moved / swipe)
    this.scrollPx += moved
    this.swipes += swipes
    await sleep(60)
    return { inView: false, scrolled: moved, swipes }
  }

  /** الأزرارُ المعطَّلة الظاهرة في الشاشة الآن — يراها المالكُ ولا يستطيعها. */
  private async disabledInView(): Promise<string[]> {
    return this.page.evaluate(() => {
      const vh = window.innerHeight
      return Array.from(document.querySelectorAll('button:disabled, input:disabled, select:disabled, [aria-disabled="true"]'))
        .filter((el) => {
          const r = el.getBoundingClientRect()
          const s = getComputedStyle(el)
          return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < vh && s.visibility !== 'hidden'
        })
        .map((el) => {
          const own = (el.textContent ?? '').trim().replace(/\s+/g, ' ')
          const label = own !== '' ? own : el.getAttribute('aria-label') ?? el.closest('label')?.textContent?.trim().replace(/\s+/g, ' ') ?? el.getAttribute('name') ?? el.tagName
          return label.slice(0, 50)
        })
    })
  }

  async readFlash(): Promise<string> {
    return this.page
      .evaluate(() =>
        Array.from(document.querySelectorAll('#flash .toast-note, .toast-note[role="alert"]'))
          .map((el) => (el.textContent ?? '').trim().replace(/\s+/g, ' '))
          .filter((t) => t !== '')
          .join(' | '),
      )
      .catch(() => '')
  }

  /** لقطةُ ما يراه المالك، والهدفُ مؤطَّرٌ إن وُجد. */
  async shot(label: string, target?: Locator): Promise<string> {
    this.shotN += 1
    const name = `${String(this.shotN).padStart(2, '0')}-${label.replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 40)}.png`
    if (target !== undefined) {
      await target.evaluate((el) => {
        ;(el as HTMLElement).dataset['journeyRing'] = '1'
        ;(el as HTMLElement).style.outline = '4px solid #e0218a'
        ;(el as HTMLElement).style.outlineOffset = '3px'
      }).catch(() => undefined)
    }
    await this.page.screenshot({ path: join(this.dir, name) }).catch(() => undefined)
    if (target !== undefined) {
      await target.evaluate((el) => {
        ;(el as HTMLElement).style.outline = ''
        ;(el as HTMLElement).style.outlineOffset = ''
        delete (el as HTMLElement).dataset['journeyRing']
      }).catch(() => undefined)
    }
    const rel = join(this.rel, name)
    this.shots.push(rel)
    return rel
  }

  /** ما ينتظره المالكُ من التطبيق بعد أفعاله — بلا زمن الأداة ولقطاتها. */
  systemMs = 0

  /**
   * ينتظر ما بدأه الفعل: إن بدأ تنقّلٌ خلال ثانيةٍ انتُظر تحميلُه كاملًا (والخادمُ قد
   * يفكّر قبل أن يجيب)، وإلّا فهدوءُ الشبكة وحده.
   */
  private async settle(navsBefore = this.navs, loadsBefore = this.loads): Promise<void> {
    const t = Date.now()
    const deadline = t + 1_000
    while (this.navs === navsBefore && Date.now() < deadline) await sleep(50)
    if (this.navs > navsBefore) {
      const end = Date.now() + 60_000
      while (this.loads === loadsBefore && Date.now() < end) await sleep(50)
    }
    await this.page.waitForLoadState('load', { timeout: 30_000 }).catch(() => undefined)
    await this.page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => undefined)
    this.systemMs += Date.now() - t
  }

  private async after(kind: StepKind, label: string, url: string, seen: { inView: boolean; scrolled: number; swipes: number }, disabled: boolean, loadsBefore: number, shot: string): Promise<void> {
    const flash = await this.readFlash()
    const fresh = flash !== '' && (flash !== this.lastFlash || this.loads > loadsBefore) ? flash : null
    if (fresh !== null) this.flashes.push(fresh)
    this.lastFlash = flash
    this.steps.push({
      n: this.steps.length + 1, kind, label, url, inView: seen.inView, scrolledPx: Math.round(seen.scrolled),
      swipes: seen.swipes, disabled, loaded: this.loads > loadsBefore, flash: fresh, ms: this.elapsed(), shot,
    })
    for (const message of this.pendingDialogs.splice(0)) {
      this.taps += 1
      this.steps.push({
        n: this.steps.length + 1, kind: 'confirm', label: `حوار «${message.slice(0, 60)}» ← موافق`,
        url, inView: true, scrolledPx: 0, swipes: 0, disabled: false, loaded: false, flash: null, ms: this.elapsed(), shot: '',
      })
    }
  }

  private async prepare(target: Locator, label: string, key: boolean) {
    const url = this.page.url()
    const seen = await this.reveal(target)
    if (key) {
      this.firstScreen = seen.inView
      this.keyLabel = label
    }
    for (const d of await this.disabledInView()) this.disabledSeen.add(d)
    const disabled = await target.isDisabled().catch(() => false)
    const shot = await this.shot(label, target)
    return { url, seen, disabled, shot }
  }

  /** نقرةٌ (أو لمسةٌ على الهاتف). `key`: هذا هو الفعلُ الحاسمُ في الرحلة. */
  async tap(target: Locator, label: string, options: { key?: boolean } = {}): Promise<void> {
    const { url, seen, disabled, shot } = await this.prepare(target, label, options.key === true)
    if (disabled) {
      await this.after('tap', `${label} (معطَّل)`, url, seen, true, this.loads, shot)
      throw new Blocked(`«${label}» معطَّل`)
    }
    const before = this.loads
    const navs = this.navs
    this.taps += 1
    if (this.vp.touch) await target.tap()
    else await target.click()
    await this.settle(navs, before)
    await this.after('tap', label, url, seen, false, before, shot)
  }

  /** اختيارٌ من قائمة: خطوةٌ واحدة، ولمستان على الهاتف (تفتح القائمة ثمّ تختار). */
  async choose(target: Locator, option: { label?: string; value?: string }, label: string): Promise<void> {
    const { url, seen, disabled, shot } = await this.prepare(target, label, false)
    if (disabled) throw new Blocked(`«${label}» معطَّل`)
    const before = this.loads
    const navs = this.navs
    this.taps += 2
    await target.selectOption(option)
    await this.settle(navs, before)
    await this.after('choose', label, url, seen, false, before, shot)
  }

  /** كتابةٌ في حقل: لمسةٌ للتركيز ثمّ النصّ (يُعدّ بمحارفه). */
  async type(target: Locator, text: string, label: string, options: { pasted?: boolean } = {}): Promise<void> {
    const { url, seen, disabled, shot } = await this.prepare(target, label, false)
    if (disabled) throw new Blocked(`«${label}» معطَّل`)
    const before = this.loads
    this.taps += options.pasted === true ? 2 : 1
    if (this.vp.touch) await target.tap()
    else await target.click()
    await target.fill(text)
    if (options.pasted !== true) this.typedChars += text.length
    await this.after('type', label, url, seen, false, before, shot)
  }

  /** اختيارُ ملفّ: لمسةٌ على الزرّ، ثمّ الملفُّ من منتقي الجهاز. */
  async file(
    button: Locator,
    input: Locator,
    file: string | { name: string; mimeType: string; buffer: Buffer },
    label: string,
    options: { key?: boolean } = {},
  ): Promise<void> {
    const { url, seen, disabled, shot } = await this.prepare(button, label, options.key === true)
    if (disabled) throw new Blocked(`«${label}» معطَّل`)
    const before = this.loads
    const navs = this.navs
    this.taps += 2
    await input.setInputFiles(file)
    await this.settle(navs, before)
    await this.after('file', label, url, seen, false, before, shot)
  }

  /** نظرٌ لا فعل: يُبحث عن المعلومة ويُعدّ ما مُرِّر إليها، ولا يُحسب خطوة. */
  async look(target: Locator, label: string, options: { key?: boolean } = {}): Promise<boolean> {
    try {
      const { url, seen, shot } = await this.prepare(target, label, options.key === true)
      await this.after('look', label, url, seen, false, this.loads, shot)
      return true
    } catch (error) {
      if (error instanceof Blocked) return false
      throw error
    }
  }

  /** ينتظر حدثًا لا يصنعه المالك (رفعٌ يكتمل، صفحةٌ تُعاد). */
  async wait(condition: () => Promise<boolean>, timeoutMs: number): Promise<boolean> {
    const t = Date.now()
    const end = t + timeoutMs
    while (Date.now() < end) {
      if (await condition().catch(() => false)) {
        this.systemMs += Date.now() - t
        await this.settle()
        return true
      }
      await sleep(200)
    }
    this.systemMs += Date.now() - t
    return false
  }

  /**
   * تقديرُ الزمن البشريّ بنموذج KLM (Card · Moran · Newell): لكلّ فعلٍ تفكيرٌ (1.35ث)
   * وإشارة (1.1ث)، ولكلّ لمسةٍ زائدةٍ إشارة، ولكلّ سحبةٍ 0.8ث، ولكلّ محرفٍ 0.3ث،
   * ولكلّ نظرةٍ 1.35ث، ثمّ زمنُ النظام المقيس. **تقديرٌ يُقارَن لا ساعةُ مختبر.**
   */
  klmSeconds(systemMs: number = this.systemMs): number {
    const acts = this.actions
    const looks = this.steps.length - acts
    const extraTaps = Math.max(0, this.taps - acts)
    return Math.round((acts * 2.45 + extraTaps * 1.1 + this.swipes * 0.8 + this.typedChars * 0.3 + looks * 1.35 + systemMs / 1000) * 10) / 10
  }
}

/**
 * **الوصولُ كما يعيشه المالك** (D-323): ما كان يُرى بالفأرة وحدَها، وما كان يُسأل بنافذة المتصفّح، والأرقامُ بنظامين.
 *
 * كلُّ «describe» هنا علّةٌ قِيست قبل أن تُصلَح: سطرُ الجاهزيّة يقول حالَه بلونٍ ورمزٍ مخفيٍّ عن قارئ الشاشة والكلمةُ في
 * تلميحٍ لا يصله الهاتف؛ وخطأُ التنبيه مقصوصٌ إلى ‏28 حرفًا وباقيه في تلميح؛ والتأكيدُ `window.confirm()` بزرّين «موافق ·
 * إلغاء»؛ والتلميحُ يختفي حين يُحرَّك المؤشّرُ إليه؛ والاختصاراتُ لا تُطفأ؛ وحلقةُ التركيز بربع شفافيّةٍ ‏1.46:1.
 * والسكربتُ يُقيَّم **كما يُشحَن** (`uiScript().body` و`panelScript().body`) في وثيقة `happy-dom`.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { Window } from 'happy-dom'
import { panelScript, uiScript } from '../../lib/ui/asset'
import { STYLE } from './styles'
import { sheet } from '../../test/css'
import { alertChannel } from './parts'
import { draftsSection } from './sections/drafts'
import { homeTop } from './sections/home'
import { dayLabel } from './planReviewView'
import { loginPage } from '../panelView'
import { dayBars } from './chart'
import { planReviewScreen } from './planReviewView'
import { dialog } from './components/dialog'
import { infographicReadiness, imageReadiness, videoReadiness } from '../../lib/media/readiness'
import { videoCapGate } from '../../lib/limits'
import { slideGate } from '../../lib/image/gate'
import { viewChannels } from '../../lib/channels'
import type { HomeFacts } from '../../lib/home'
import type { DraftRow } from '../../lib/draft/store'

type Win = InstanceType<typeof Window>
const open: Win[] = []
afterEach(async () => {
  for (const w of open.splice(0)) await w.happyDOM.close()
})

/** وثيقةٌ يُقيَّم فيها ما يُشحَن: سكربتُ كلّ صفحةٍ وحده، أو ومعه سكربتُ اللوحة. */
function boot(body: string, opts: { panel?: boolean; hash?: string } = {}): Win {
  const w = new Window({ url: `https://sada2.basserh.com/panel${opts.hash ?? ''}` })
  open.push(w)
  w.document.body.innerHTML = body
  const ev = (code: string): void => (w as unknown as { eval(c: string): void }).eval(code)
  ev(uiScript().body)
  if (opts.panel === true) ev(panelScript().body)
  return w
}
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

const READY = {
  infographic: infographicReadiness({ blocker: null, browser: { key: false, account: true }, briefReady: true }),
  image: imageReadiness({
    blocker: null, provider: { label: 'Gemini', refusal: null },
    slide: slideGate({ overlay: true, hasBrowserKey: true, hasAccount: true }), briefReady: true,
  }),
  video: videoReadiness({ face: 'env', blocker: null, clips: videoCapGate(0, 2) }),
}
const draft = (over: Partial<DraftRow> = {}): DraftRow => ({
  id: 'd1', platform: 'linkedin', text: 'نصّ', rationale: null, status: 'draft', model: null,
  cost: 0, sourceId: null, sourceName: null, stale: false, approvedBy: null,
  approvedAt: null, createdAt: '2026-09-05 09:00:00', scheduledAt: null,
  accountName: null, dispatchedAt: null, publishCost: 0, originalText: null, ...over,
})
const section = (drafts: DraftRow[]): string => draftsSection({
  drafts, media: [], targets: [], earliest: '2026-09-06T09:15',
  writable: [], now: new Date('2026-09-06T09:00:00Z'), ready: true, pageOnly: [], peaks: {}, mediaReady: READY,
})

describe('لا معلومةَ بالتمرير وحده (WCAG 1.4.13 · 1.3.1)', () => {
  it('شارةُ الجاهزيّة تكتب حالَها نصًّا («تامّة» أو «تنتظرك») لا رمزًا ولونًا وتلميحًا', () => {
    const html = section([draft()])
    const line = html.slice(html.indexOf('<p class="hint ready"'), html.indexOf('</p>', html.indexOf('<p class="hint ready"')))
    expect(line).toMatch(/<\/span>الحدود: تامّة<\/span>/)
    expect(line).toMatch(/<\/span>المتصفّح: فشلت<\/span>/)
  })

  it('وكلُّ هدفِ تلميحٍ لا يأخذ التركيزَ وحدَه يأخذه (tabindex=0)', () => {
    const html = section([draft()])
    for (const m of html.matchAll(/<(span|bdi|div|time)\b[^>]*\bdata-tip="[^"]*"[^>]*>/g)) {
      expect(m[0], m[0]).toContain('tabindex="0"')
    }
  })

  it('خطأُ التنبيه الطويل يُقرأ كاملًا بلا تمرير: سطرٌ يُفتح لا تلميحٌ على رقاقةٍ مقصوصة', () => {
    const long = 'HTTP 404 من العنوان المضبوط: لا مستمع على هذا المسار، والقناةُ ميتة منذ أمس'
    const html = alertChannel('https://example.com/hook', [{ kind: 'publish', body: 'نشر فشل', status: 404, error: long, at: '2026-09-06 08:00:00' }])
    expect(html).toContain('<details class="ax-err">')
    expect(html).toContain(long)
    expect(html).not.toMatch(/<span class="chip bad" data-tip=/)
  })

  it('ونقاطُ الأسبوع تسمّي منصّاتها بأسمائها لا بمعرّفها الخام', () => {
    const NOW = new Date('2026-10-04T12:00:00Z')
    const f: HomeFacts = {
      channels: viewChannels([], () => true), counts: { perPlatform: {}, publishedWeek: 0 }, paused: false,
      sources: { total: 2, analyzed: 2 }, withoutImage: 0, withImage: 0, openSuggestions: 0,
      firsts: { waiting: null, unscheduled: null, withoutImage: null }, pulses: [], blocker: null, zone: null,
      scheduled: [{ platform: 'linkedin', at: '2026-10-04 14:00:00' }, { platform: 'x', at: '2026-10-04 15:00:00' }],
    }
    const wk = homeTop(f, NOW)
    expect(wk).not.toContain('data-tip="linkedin"')
    expect(wk).not.toContain('data-tip="x"')
    expect(wk).toContain('LinkedIn · X')
  })
})

describe('نظامُ أرقامٍ واحد (GLOSSARY · D-147)', () => {
  it('يومُ الخطّة بأرقامٍ غربيّة: «الأحد، 13 سبتمبر» لا «١٣»', () => {
    expect(dayLabel('2026-09-13')).toBe('الأحد، 13 سبتمبر')
    expect(dayLabel('2026-09-13', 'short')).toBe('13')
  })
})

describe('لا نافذةَ تأكيدٍ من المتصفّح (D-303)', () => {
  it('السكربتان المشحونان بلا confirm()', () => {
    expect(uiScript().body).not.toMatch(/(^|[^.\w])confirm\(/)
    expect(panelScript().body).not.toMatch(/(^|[^.\w])confirm\(/)
  })

  it('نموذجٌ بـ«data-confirm» يفتح حوارًا في الصفحة بفعله، و«إلغاء» لا يرسل، والفعلُ يرسل بزرّه', () => {
    const w = boot(`<form id="f" method="POST" action="/panel/plan/pin" data-confirm="ثبّت الإصدار 2؟">
      <button class="btn btn-primary" type="submit" name="do" value="pin">ثبّت الخطّة</button></form>`)
    const d = w.document
    let sent = 0
    let by = ''
    d.getElementById('f')!.addEventListener('submit', (e) => {
      sent += 1
      by = ((e as unknown as { submitter?: { value: string } }).submitter?.value) ?? ''
      e.preventDefault()
    })
    ;(d.querySelector('button') as unknown as { click(): void }).click()
    expect(sent).toBe(0)
    const dlg = d.getElementById('sada-cf') as unknown as { open: boolean; querySelector(s: string): { textContent: string; click(): void } | null }
    expect(dlg.open).toBe(true)
    expect(dlg.querySelector('.dlg-t')?.textContent).toBe('ثبّت الإصدار 2؟')
    expect(dlg.querySelector('[data-cf=ok]')?.textContent).toBe('ثبّت الخطّة')
    dlg.querySelector('[data-cf=no]')!.click()
    expect(dlg.open).toBe(false)
    expect(sent).toBe(0)
    ;(d.querySelector('button') as unknown as { click(): void }).click()
    dlg.querySelector('[data-cf=ok]')!.click()
    expect(sent).toBe(1)
    expect(by).toBe('pin')
  })

  it('وزرٌّ بـ«data-confirm» (بلا نموذج) يُضغط بعد «نعم» وحدها', () => {
    const w = boot(`<button type="button" class="btn btn-danger" id="b" data-confirm="حذف المفتاح «هاتفي»؟">احذف</button>`)
    const d = w.document
    let pressed = 0
    d.getElementById('b')!.addEventListener('click', () => { pressed += 1 })
    ;(d.getElementById('b') as unknown as { click(): void }).click()
    expect(pressed).toBe(0)
    const ok = d.querySelector('#sada-cf [data-cf=ok]') as unknown as { className: string; click(): void }
    expect(ok.className).toContain('btn-danger')
    ok.click()
    expect(pressed).toBe(1)
  })
})

describe('التلميحُ يُمسَك ويُركَّز ويُلمَس (WCAG 1.4.13)', () => {
  const page = `<p><span id="t" tabindex="0" data-tip="2026-09-06 09:00 بتوقيت الرياض">قبل ساعة</span> <a id="far" href="#">بعيد</a></p>`
  const over = (w: Win, el: unknown, type: string, related: unknown = null, pointerType = 'mouse'): void => {
    const e = new w.PointerEvent(type, { bubbles: true, pointerType, relatedTarget: related as never })
    ;(el as { dispatchEvent(e: unknown): boolean }).dispatchEvent(e)
  }

  it('يظهر بعد المهلة، ويبقى والمؤشّرُ ينتقل إليه، ويذهب حين يغادرهما', async () => {
    const w = boot(page)
    const d = w.document
    const t = d.getElementById('t')
    const tip = d.getElementById('sada-tip') as unknown as { hidden: boolean; textContent: string }
    over(w, t, 'pointerover')
    await sleep(500)
    expect(tip.hidden).toBe(false)
    expect(tip.textContent).toBe('2026-09-06 09:00 بتوقيت الرياض')
    over(w, t, 'pointerout', tip)
    over(w, tip, 'pointerover', t)
    await sleep(500)
    expect(tip.hidden).toBe(false)
    over(w, tip, 'pointerout', d.getElementById('far'))
    await sleep(500)
    expect(tip.hidden).toBe(true)
  })

  it('ولوحةُ المفاتيح تُظهره فورًا ويُربط وصفًا، وEsc يخفيه', () => {
    const w = boot(page)
    const d = w.document
    const t = d.getElementById('t') as unknown as HTMLElement
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    t.focus()
    const tip = d.getElementById('sada-tip') as unknown as { hidden: boolean }
    expect(tip.hidden).toBe(false)
    expect(t.getAttribute('aria-describedby')).toBe('sada-tip')
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(tip.hidden).toBe(true)
    expect(t.hasAttribute('aria-describedby')).toBe(false)
  })

  it('واللمسُ يُظهره، واللمسُ خارجه يخفيه', () => {
    const w = boot(page)
    const d = w.document
    const t = d.getElementById('t') as unknown as { click(): void }
    const tip = d.getElementById('sada-tip') as unknown as { hidden: boolean }
    over(w, t, 'pointerdown', null, 'touch')
    over(w, t, 'pointerup', null, 'touch')
    expect(tip.hidden).toBe(false)
    over(w, d.body, 'pointerdown', null, 'touch')
    over(w, d.body, 'pointerup', null, 'touch')
    expect(tip.hidden).toBe(true)
  })
})

describe('اختصاراتُ الحرف الواحد تُطفأ (WCAG 2.1.4)', () => {
  const cards = `<nav class="tabs"><a href="#posts"><span>المنشورات</span></a></nav><h1 id="pane-title"></h1>
    <main id="main"><section data-pane="posts"><h2>المنشورات</h2>
      <div class="card draft" id="d-1" data-draft="1" data-status="waiting"><button type="submit" value="approve">اعتمد</button></div>
      <div class="card draft" id="d-2" data-draft="2" data-status="waiting"></div>
      <details id="keys" hidden><summary>الاختصارات</summary>
        <div class="seg" role="group" aria-label="اختصارات الحرف الواحد"><button type="button" data-shortcuts="on" aria-pressed="true">تعمل</button><button type="button" data-shortcuts="off" aria-pressed="false">معطّلة</button></div></details>
      <div contenteditable="true" id="ce">نصّ</div>
      <dialog id="dl"><button id="in-dl">زرّ</button></dialog>
    </section></main><div id="flash"></div>`
  const key = (w: Win, code: string, target?: unknown): void => {
    ;((target ?? w.document) as { dispatchEvent(e: unknown): boolean }).dispatchEvent(new w.KeyboardEvent('keydown', { code, key: 'x', bubbles: true, cancelable: true }))
  }
  const here = (w: Win): string | null => w.document.querySelector('[data-draft].here')?.id ?? null

  it('زرُّ «معطّلة» في لوح الاختصارات يُسكتها ويُحفظ في المتصفّح، و«تعمل» يعيدها', () => {
    const w = boot(cards, { panel: true, hash: '#posts' })
    ;(w.document.querySelector('button[data-shortcuts=off]') as unknown as { click(): void }).click()
    expect(w.localStorage.getItem('sada-shortcuts')).toBe('off')
    expect(w.document.querySelector('button[data-shortcuts=off]')?.getAttribute('aria-pressed')).toBe('true')
    key(w, 'KeyJ')
    expect(here(w)).toBeNull()
    ;(w.document.querySelector('button[data-shortcuts=on]') as unknown as { click(): void }).click()
    key(w, 'KeyJ')
    expect(here(w)).toBe('d-1')
  })

  it('والمحفوظُ يُقرأ عند التحميل', () => {
    const w = new Window({ url: 'https://sada2.basserh.com/panel#posts' })
    open.push(w)
    w.localStorage.setItem('sada-shortcuts', 'off')
    w.document.body.innerHTML = cards
    ;(w as unknown as { eval(c: string): void }).eval(uiScript().body)
    ;(w as unknown as { eval(c: string): void }).eval(panelScript().body)
    key(w, 'KeyJ')
    expect(here(w)).toBeNull()
  })

  it('ولا تعمل داخل نصٍّ قابلٍ للتحرير ولا داخل حوار', () => {
    const w = boot(cards, { panel: true, hash: '#posts' })
    key(w, 'KeyJ', w.document.getElementById('ce'))
    expect(here(w)).toBeNull()
    key(w, 'KeyJ', w.document.getElementById('in-dl'))
    expect(here(w)).toBeNull()
  })

  it('وJ وK لا تمرّر بانزلاقٍ مع تقليل الحركة', () => {
    const w = new Window({ url: 'https://sada2.basserh.com/panel#posts' })
    open.push(w)
    w.document.body.innerHTML = cards
    const seen: unknown[] = []
    ;(w as unknown as { matchMedia(q: string): unknown }).matchMedia = (q: string) =>
      ({ matches: /reduce/.test(q), media: q, addEventListener() {}, removeEventListener() {} })
    ;(w.HTMLElement.prototype as unknown as { scrollIntoView(o: unknown): void }).scrollIntoView = function (o: unknown) { seen.push(o) }
    ;(w as unknown as { eval(c: string): void }).eval(uiScript().body)
    ;(w as unknown as { eval(c: string): void }).eval(panelScript().body)
    seen.length = 0
    key(w, 'KeyJ')
    expect(seen.at(-1)).toMatchObject({ behavior: 'auto' })
  })
})

describe('انتقالُ الألواح لا يرمي (View Transitions)', () => {
  const page = `<nav class="tabs"><a href="#a"><span>أ</span></a><a href="#b"><span>ب</span></a></nav><h1 id="pane-title"></h1>
    <main id="main"><section data-pane="a"><h2>أ</h2></section><section data-pane="b"><h2>ب</h2></section></main><div id="flash"></div>`

  it('انتقالٌ جارٍ يُتمَّ قبل الثاني، ورفضُ وعوده يُلتقَط', async () => {
    const w = new Window({ url: 'https://sada2.basserh.com/panel#a' })
    open.push(w)
    w.document.body.innerHTML = page
    const started: { skipped: boolean }[] = []
    let unhandled = 0
    ;(w as unknown as { matchMedia(q: string): unknown }).matchMedia = (q: string) => ({ matches: false, media: q })
    ;(w.document as unknown as { startViewTransition(fn: () => void): unknown }).startViewTransition = (fn: () => void) => {
      fn()
      const t = { skipped: false } as { skipped: boolean; ready: Promise<void>; finished: Promise<void>; updateCallbackDone: Promise<void>; skipTransition(): void }
      const fail = (): Promise<void> => {
        const p = Promise.reject(new Error('Transition was aborted because of invalid state'))
        const c = p.catch.bind(p)
        let caught = false
        ;(p as unknown as { catch: unknown }).catch = (f: (e: unknown) => unknown) => { caught = true; return c(f) }
        ;(p as unknown as { then: unknown }).then = ((t0) => (a: unknown, b: unknown) => { if (b !== undefined) caught = true; return t0(a as never, b as never) })(p.then.bind(p))
        setTimeout(() => { if (!caught) unhandled += 1 }, 0)
        c(() => undefined)
        return p
      }
      t.ready = fail()
      t.finished = Promise.resolve()
      t.updateCallbackDone = Promise.resolve()
      t.skipTransition = () => { t.skipped = true }
      started.push(t)
      return t
    }
    ;(w as unknown as { eval(c: string): void }).eval(panelScript().body)
    const tab = (h: string): { click(): void } => w.document.querySelector(`a[href="${h}"]`) as unknown as { click(): void }
    tab('#b').click()
    tab('#a').click()
    await sleep(20)
    expect(started).toHaveLength(2)
    expect(started[0]!.skipped).toBe(true)
    expect(unhandled).toBe(0)
  })
})

describe('حلقةُ التركيز تُرى (WCAG 1.4.11 · 2.4.13)', () => {
  const css = sheet(STYLE)
  it('المقطعُ («من فكرة · من مصدر») وشريطُ الخطّ الزمنيّ بحبر التركيز الصلب لا بالهالة', () => {
    expect(css.rule('.seg label:has(input:focus-visible)').outline).toBe('var(--stroke) solid var(--focus)')
    expect(css.rule('.gt-bar:focus-visible').outline).toBe('var(--stroke) solid var(--focus)')
  })
  it('والحقلُ المركَّز بخطٍّ صلبٍ ‏2px يبقى في الألوان القسريّة', () => {
    expect(css.rule('input:focus').outline).toBe('var(--stroke) solid var(--focus)')
    expect(css.rule('textarea:focus', '@media(forced-colors:active)').outline).toBe('var(--stroke) solid Highlight')
  })
  it('ولا مؤشّرَ تركيزٍ في الورقة كلِّها بالهالة وحدها', () => {
    const weak = css.rules().filter((r) => r.selectors.some((s) => /focus/.test(s)) &&
      Object.values(r.decls).some((v) => /var\(--ring\)/.test(v)) &&
      !Object.values(r.decls).some((v) => /var\(--focus\)|Highlight/.test(v)))
    expect(weak.map((r) => r.selectors.join(','))).toEqual([])
  })
})

describe('انتقالٌ أُسقط لا يُخلّف خطأَ صفحة (View Transitions بين المستندات)', () => {
  /**
   * ‏قِيس في الرحلات بعد التقاط الوعود الثلاثة: بقي الخطأُ في ‏6 من ‏32 رحلة — كلُّها تنقّلٌ قُطع (OAuth يغادر الموقع فيُمنع،
   * ‏وصفحةٌ تُعاد قبل أن تُرسم). فالمتصفّحُ يُنشئ الانتقالَ ثمّ يُسقطه قبل أن يُطلق «pageswap»، فلا كائنَ يُلتقَط وعدُه.
   * ‏فسكربتُ الرأس يكتم رفضَ «Transition was aborted/skipped» وحدَه، وما سواه يبقى خطأً يُرى.
   */
  const boot = (): string => /<script nonce="n">([\s\S]*?)<\/script>/.exec(loginPage({}, 'n'))?.[1] ?? ''

  it('رفضُ انتقالٍ أُسقط يُكتم، وغيرُه لا', async () => {
    const w = new Window({ url: 'https://sada2.basserh.com/panel' })
    open.push(w)
    ;(w as unknown as { eval(c: string): void }).eval(boot())
    const fire = (name: string, message: string): boolean => {
      const e = new w.Event('unhandledrejection', { cancelable: true }) as unknown as { reason: unknown; defaultPrevented: boolean }
      Object.defineProperty(e, 'reason', { value: { name, message } })
      w.dispatchEvent(e as never)
      return e.defaultPrevented
    }
    expect(fire('InvalidStateError', 'Transition was aborted because of invalid state. ViewTransition opt-in disabled')).toBe(true)
    expect(fire('AbortError', 'Transition was skipped')).toBe(true)
    expect(fire('TypeError', 'x is not a function')).toBe(false)
  })
})

/**
 * ‏**مراجعةُ D-323**: ما أمسكه المراجعون بعد البناء، وكلُّ حالةٍ هنا سقطت على الشيفرة قبل إصلاحها.
 */
describe('مراجعةُ D-323', () => {
  const css = sheet(STYLE)
  const over = (w: Win, el: unknown, type: string, related: unknown = null, pointerType = 'mouse'): void => {
    const e = new w.PointerEvent(type, { bubbles: true, pointerType, relatedTarget: related as never })
    ;(el as { dispatchEvent(e: unknown): boolean }).dispatchEvent(e)
  }
  const esc = (w: Win): void => { w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) }
  type Tip = { hidden: boolean; textContent: string }

  it('التلميحُ يُثبَّت بإحداثيّاتٍ فيزيائيّة: «left» الذي يكتبه السكربت لا يُسقطه «inset-inline-start» (‏right:0 في RTL)', () => {
    // ‏قِيس في Chromium: كلُّ تلميحٍ لصق الحافّة اليمنى (tipR=1280) أيًّا كان موضعُ هدفه — «left» و«width» و«right» معًا
    // ‏فوق القيد، والمتصفّحُ يُسقط «left» في كتلةٍ اتّجاهُها RTL
    const r = css.rule('.tip')
    expect(r['inset-inline-start']).toBeUndefined()
    expect(r['inset-inline-end']).toBeUndefined()
    expect(r['inset-inline']).toBe('auto')
    expect(uiScript().body).toMatch(/tip\.style\.left=/)
  })

  it('وEsc يُبقيه مخفيًّا والمؤشّرُ يتنقّل بين أبناء الهدف نفسِه، ويعود حين يخرج المؤشّرُ ثمّ يدخل', async () => {
    const w = boot(`<p><span id="b" tabindex="0" data-tip="مفتوحة اليوم"><span id="b1">●</span><span id="b2">الحدود: تامّة</span></span> <a id="far" href="#">بعيد</a></p>`)
    const d = w.document
    const [b1, b2, far] = [d.getElementById('b1'), d.getElementById('b2'), d.getElementById('far')]
    const tip = d.getElementById('sada-tip') as unknown as Tip
    over(w, b1, 'pointerover')
    await sleep(500)
    expect(tip.hidden).toBe(false)
    esc(w)
    expect(tip.hidden).toBe(true)
    over(w, b1, 'pointerout', b2)
    over(w, b2, 'pointerover', b1)
    await sleep(500)
    expect(tip.hidden).toBe(true)
    over(w, b2, 'pointerout', far)
    over(w, far, 'pointerover', b2)
    over(w, far, 'pointerout', b1)
    over(w, b1, 'pointerover', far)
    await sleep(500)
    expect(tip.hidden).toBe(false)
  })

  it('والتركيزُ بلا ضغطة مفتاح (قارئُ شاشةٍ على الهاتف) يربط نصَّ التلميح وصفًا ولا يُظهره', () => {
    const w = boot(`<p><time id="t" datetime="2026-09-06T06:00:00Z" tabindex="0" data-tip="2026-09-06 09:00 بتوقيت الرياض">قبل 3 ساعات</time> <a id="far" href="#">بعيد</a></p>`)
    const d = w.document
    const t = d.getElementById('t') as unknown as HTMLElement
    const tip = d.getElementById('sada-tip') as unknown as Tip
    over(w, d.getElementById('far'), 'pointerdown', null, 'touch')
    over(w, d.getElementById('far'), 'pointerup', null, 'touch')
    t.focus()
    expect(tip.hidden).toBe(true)
    expect(tip.textContent).toBe('2026-09-06 09:00 بتوقيت الرياض')
    expect(t.getAttribute('aria-describedby')).toBe('sada-tip')
    ;(d.getElementById('far') as unknown as HTMLElement).focus()
    expect(t.hasAttribute('aria-describedby')).toBe(false)
  })

  it('ونقرةُ الفأرة على هدفٍ تلميحُه ظاهرٌ بالتمرير لا تخفيه', async () => {
    const w = boot(`<p><span id="t" tabindex="0" data-tip="كلفة الكتابة">0.012$</span></p>`)
    const d = w.document
    const t = d.getElementById('t') as unknown as HTMLElement
    const tip = d.getElementById('sada-tip') as unknown as Tip
    over(w, t, 'pointerover')
    await sleep(500)
    expect(tip.hidden).toBe(false)
    over(w, t, 'pointerdown')
    t.focus()
    expect(tip.hidden).toBe(false)
  })

  it('ورموزُ الاسترداد بعد أن تُولَّد في الصفحة يُسأل قبل تجديدها (توليدُها ثانيةً يُبطل ما حُفظ للتوّ)', async () => {
    const w = boot(`<input type="hidden" name="_csrf" value="c">
      <button class="btn btn-primary" id="rc-issue" type="button" data-renew-ask="أتولّد مجموعةً جديدة؟ تُبطل القديمةَ كلَّها، فلا يصلح رمزٌ منها بعد اليوم." data-renew-ok="ولّد مجموعةً جديدة">ولّد رموز استرداد</button>
      <div id="rc-box" hidden><div class="codes" id="rc-list"></div></div><div class="note" id="rc-msg"></div>`, { panel: true })
    const d = w.document
    let calls = 0
    ;(w as unknown as { fetch: unknown }).fetch = async () => {
      calls += 1
      return { ok: true, status: 200, json: async () => ({ codes: ['aaaa-bbbb', 'cccc-dddd'] }) }
    }
    const rc = d.getElementById('rc-issue') as unknown as { click(): void; getAttribute(n: string): string | null }
    rc.click()
    await sleep(20)
    expect(calls).toBe(1)
    expect((d.getElementById('rc-box') as unknown as { hidden: boolean }).hidden).toBe(false)
    expect(rc.getAttribute('data-confirm')).toMatch(/تُبطل القديمةَ/)
    rc.click()
    await sleep(20)
    expect(calls).toBe(1)
    const dlg = d.getElementById('sada-cf') as unknown as { open: boolean; querySelector(s: string): { textContent: string; click(): void } | null }
    expect(dlg.open).toBe(true)
    expect(dlg.querySelector('[data-cf=ok]')?.textContent).toBe('ولّد مجموعةً جديدة')
    dlg.querySelector('[data-cf=ok]')!.click()
    await sleep(20)
    expect(calls).toBe(2)
  })

  it('وإزالةُ البند في مراجعة الخطّة هادمة: زرُّه أحمر، والحوارُ بفعلٍ أحمر والتركيزُ على «إلغاء»', () => {
    const items = [{ sourceId: 's1', platform: 'linkedin', kind: 'text', angle: 'زاوية', day: '2026-11-08', time: '06:00', why: 'ل' }]
    const m = {
      plan: { id: 'pl1', week: '2026-11-08', plan: { rationale: '', items }, model: 'm', status: 'approved', createdAt: '2026-11-02 08:00:00', span: 'week',
        choices: { channels: ['linkedin'], cadence: {}, sources: 'all', ideas: [], assets: [], autoImage: true, imageStyle: 'illustration', startDay: '2026-11-08' } },
      version: 1, lockedAt: null, versions: [], gaps: { unwritten: 0, no_image: 0, pending: 1, clash: 0 },
      cards: [{ index: 0, key: 'k0', item: items[0], post: { id: 'p0', status: 'draft', text: 'نصّ', scheduledAt: null }, mediaId: null, gaps: ['pending'] }],
    } as never
    const html = planReviewScreen(m, null)
    // ‏«أزِل» في «أفعال أخرى» على البطاقة (D-351 · كان زرًّا في صفّها، D-327) بندًا أحمر، و«أزِلها» في شريط المحدَّد
    expect(html).toMatch(/<form class="menu-form" method="POST" action="\/panel\/plan\/review\/drop"[^>]*>.*?<button class="menu-item menu-danger" type="submit"><span class="menu-t"><b>أزِل<\/b>/s)
    expect(html).toMatch(/<button class="btn btn-danger btn-sm"[^>]*>أزِلها<\/button>/)
    const w = boot(html)
    const d = w.document
    ;(d.querySelector('form[action="/panel/plan/review/drop"] button') as unknown as { click(): void }).click()
    const ok = d.querySelector('#sada-cf [data-cf=ok]') as unknown as { className: string; textContent: string }
    expect(ok.textContent).toBe('أزِل')
    expect(ok.className).toContain('btn-danger')
    expect((d.activeElement as unknown as { getAttribute(n: string): string | null }).getAttribute('data-cf')).toBe('no')
  })

  it('وزرُّ الرجوع في حوار التأكيد اسمُه اسمُ زرّ حوار العُدّة: الشيءُ الواحدُ باسمٍ واحد', () => {
    const kit = /<button class="btn btn-secondary" value="cancel">([^<]+)<\/button>/.exec(dialog({ id: 'x', title: 'ت', body: '' }))?.[1]
    expect(kit).toBe('إلغاء')
    const w = boot(`<button type="button" class="btn btn-danger" id="b" data-confirm="أتفصل الحساب؟">افصل</button>`)
    ;(w.document.getElementById('b') as unknown as { click(): void }).click()
    expect(w.document.querySelector('#sada-cf [data-cf=no]')?.textContent).toBe(kit)
  })

  it('وإتمامُ الانتقال الأوّل لا يكتب «done» والثاني ما زال جاريًا: يبقى انزلاقُه من جهته', async () => {
    const w = new Window({ url: 'https://sada2.basserh.com/panel#a' })
    open.push(w)
    w.document.body.innerHTML = `<nav class="tabs"><a href="#a"><span>أ</span></a><a href="#b"><span>ب</span></a></nav><h1 id="pane-title"></h1>
      <main id="main"><section data-pane="a"><h2>أ</h2></section><section data-pane="b"><h2>ب</h2></section></main><div id="flash"></div>`
    ;(w as unknown as { matchMedia(q: string): unknown }).matchMedia = (q: string) => ({ matches: false, media: q })
    const ends: (() => void)[] = []
    ;(w.document as unknown as { startViewTransition(fn: () => void): unknown }).startViewTransition = (fn: () => void) => {
      fn()
      let end: () => void = () => undefined
      const finished = new Promise<void>((r) => { end = r })
      ends.push(end)
      return { ready: Promise.resolve(), updateCallbackDone: Promise.resolve(), finished, skipTransition: end }
    }
    ;(w as unknown as { eval(c: string): void }).eval(panelScript().body)
    const root = w.document.documentElement
    const tab = (h: string): { click(): void } => w.document.querySelector(`a[href="${h}"]`) as unknown as { click(): void }
    tab('#b').click()
    expect(root.getAttribute('data-nav')).toBe('forward')
    tab('#a').click()
    expect(root.getAttribute('data-nav')).toBe('back')
    await sleep(10)
    expect(root.getAttribute('data-nav')).toBe('back')
    ends[1]!()
    await sleep(10)
    expect(root.getAttribute('data-nav')).toBe('done')
  })

  it('ورفضُ الانتقال المكتومُ يُعَدّ (console.debug بعلامته) فيراه مقياسُ الرحلات بجوار أخطاء الصفحة', () => {
    const w = new Window({ url: 'https://sada2.basserh.com/panel' })
    open.push(w)
    const seen: string[] = []
    ;(w.console as unknown as { debug(...a: unknown[]): void }).debug = (...a: unknown[]) => { seen.push(a.map(String).join(' ')) }
    const code = /<script nonce="n">([\s\S]*?)<\/script>/.exec(loginPage({}, 'n'))?.[1] ?? ''
    ;(w as unknown as { eval(c: string): void }).eval(code)
    const fire = (name: string, message: string): void => {
      const e = new w.Event('unhandledrejection', { cancelable: true }) as unknown as { reason: unknown }
      Object.defineProperty(e, 'reason', { value: { name, message } })
      w.dispatchEvent(e as never)
    }
    fire('InvalidStateError', 'Transition was aborted because of invalid state. ViewTransition opt-in disabled')
    fire('TypeError', 'x is not a function')
    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatch(/^sada:vt-muted /)
  })

  it('وحقلُ لوحة الأوامر (⌘K) لا يُطفئ حلقتَه: لا حقلَ في الورقة بـ«outline:none»', () => {
    const off = css.rules().filter((r) => r.at === '' && r.selectors.some((s) => /(^|[\s>+~])(input|textarea|select)\b/.test(s)) && r.decls.outline === 'none')
    expect(off.map((r) => r.selectors.join(','))).toEqual([])
    expect(css.rule('.cmdk-in input').outline).toBeUndefined()
  })

  it('وعددُ كلّ يومٍ في «ما كُتب في أسبوعين» مكتوبٌ فوق عموده، لا في عنوان SVG يظهر بالفأرة وحدها', () => {
    const html = dayBars([{ label: '1/9', value: 0 }, { label: '2/9', value: 3 }, { label: 'اليوم', value: 12 }], { title: 'لا شيء', html: '' })
    expect(html).not.toContain('<title>')
    const vals = /<ol class="db-vals"[^>]*>([\s\S]*?)<\/ol>/.exec(html)?.[1] ?? ''
    expect([...vals.matchAll(/<li>(?:<span[^>]*>)?([^<]*)(?:<\/span>)?<\/li>/g)].map((x) => x[1])).toEqual(['', '3', '12'])
  })
})

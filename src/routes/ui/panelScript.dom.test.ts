/**
 * سكربتُ اللوحة **يجري في وثيقةٍ لا يُقرأ نصًّا** (D-281).
 *
 * اختبارُ `panelScript.test.ts` ينتزع العدّادَ من النصّ ويقارنه بالخادم، ويتحقّق أنّ النصَّ يُبنى بلا
 * خطأ صياغة. **ولا يقول شيئًا عمّا يفعله السكربت**: تبديلُ الألواح (D-149)، والمرساةُ العميقةُ التي
 * تنزل إلى بطاقتها (D-046)، والصفحةُ بلا ألواحٍ التي لا تُسقِط ما بعدها (D-160)، والاختصاراتُ بموضع
 * المفتاح لا بحرفه. فهنا وثيقةٌ صغيرةٌ في `happy-dom` تحمل ما يبحث عنه السكربتُ وحدَه، ويُقيَّم فيها
 * **النصُّ المُشحَن** (`panelScript().body` بعد نزع التعليقات) لا المصدر.
 *
 * وبيئةُ الاختبارات تبقى `node`: النافذةُ تُبنى في الاختبار وتُغلَق بعده.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { Window } from 'happy-dom'
import { panelScript } from '../../lib/ui/asset'

type Win = InstanceType<typeof Window>

const NAV = `<nav class="tabs">
  <a href="#overview"><span>نظرة عامّة</span></a>
  <a href="#posts"><span>المنشورات</span></a>
  <a href="/panel/tasks"><span>ما عليك</span></a>
</nav><h1 id="pane-title"></h1>`

const PANES = `<main id="main">
  <section data-pane="overview"><h2>نظرة عامّة</h2></section>
  <section data-pane="posts"><h2>المنشورات</h2>
    <div class="card draft" id="d-42" data-draft="42" data-status="waiting" data-platform="x">
      <textarea class="draft-text"></textarea>
      <button type="submit" value="approve">اعتمد</button>
    </div>
    <div class="card draft" id="d-43" data-draft="43" data-status="waiting" data-platform="x"></div>
    <details class="card keys" id="keys" hidden><summary>الاختصارات</summary></details>
  </section>
</main><div id="flash"></div>`

const open: Win[] = []
afterEach(async () => {
  for (const w of open.splice(0)) await w.happyDOM.close()
})

/** وثيقةٌ على عنوانٍ، يُقيَّم فيها السكربتُ المُشحَن — ويُعاد ما رمى إن رمى. */
function boot(hash: string, body = NAV + PANES): { readonly w: Win; readonly thrown: unknown } {
  const w = new Window({ url: `https://sada2.basserh.com/panel${hash}` })
  open.push(w)
  w.document.body.innerHTML = body
  let thrown: unknown = null
  try { (w as unknown as { eval(code: string): void }).eval(panelScript().body) } catch (e) { thrown = e }
  return { w, thrown }
}

const hidden = (w: Win): readonly boolean[] =>
  Array.from(w.document.querySelectorAll('section[data-pane]')).map((p) => (p as unknown as { hidden: boolean }).hidden)
const current = (w: Win): string | null => w.document.querySelector('nav.tabs a[aria-current="page"]')?.getAttribute('href') ?? null

describe('تبديلُ الألواح (D-149)', () => {
  it('المرساةُ عند التحميل تفتح لوحَها وتعلّم تبويبَه وتكتب عنوانَ الشريط والوثيقة — بلا نقل تركيز', () => {
    const { w, thrown } = boot('#posts')
    expect(thrown).toBeNull()
    expect(hidden(w)).toEqual([true, false])
    expect(current(w)).toBe('#posts')
    expect(w.document.getElementById('pane-title')?.textContent).toBe('المنشورات')
    expect(w.document.title).toBe('المنشورات — صدى')
    expect(w.document.body.getAttribute('data-pane')).toBe('posts')
    // ‏التحميلُ ليس فعلًا من المالك: التركيزُ يبقى حيث كان
    expect(w.document.activeElement?.tagName).not.toBe('H2')
  })

  it('وبلا مرساةٍ يُفتَح الأوّل', () => {
    const { w } = boot('')
    expect(hidden(w)).toEqual([false, true])
    expect(current(w)).toBe('#overview')
  })

  it('النقرُ على تبويبٍ يبدّل اللوحَ وينقل التركيزَ إلى رأسه ويكتب المرساة', () => {
    const { w } = boot('#posts')
    ;(w.document.querySelector('a[href="#overview"]') as unknown as { click(): void }).click()
    expect(hidden(w)).toEqual([false, true])
    expect(current(w)).toBe('#overview')
    expect(w.location.hash).toBe('#overview')
    const head = w.document.querySelector('section[data-pane="overview"] h2')
    expect(w.document.activeElement).toBe(head)
    expect(head?.getAttribute('tabindex')).toBe('-1')
    // ‏والتبويبُ الآخر لا يحمل العلامة
    expect(w.document.querySelectorAll('a[aria-current]').length).toBe(1)
  })

  it('ورابطُ صفحةٍ حقيقيّةٍ في الشريط لا يُخطَف (D-087)', () => {
    const { w } = boot('#posts')
    const real = w.document.querySelector('a[href="/panel/tasks"]') as unknown as { click(): void }
    real.click()
    // ‏لو خُطف لارتدّ إلى الأوّل «نظرة عامّة»؛ اللوحُ المفتوحُ يبقى
    expect(hidden(w)).toEqual([true, false])
    expect(current(w)).toBe('#posts')
  })

  it('وتبديلُ المرساة من أيّ مكان (لوحةُ الأوامر، زرُّ الرجوع) يبدّل اللوحَ (D-105)', async () => {
    const { w } = boot('#posts')
    w.location.hash = '#overview'
    w.dispatchEvent(new w.Event('hashchange'))
    expect(hidden(w)).toEqual([false, true])
    expect(current(w)).toBe('#overview')
  })
})

describe('المرساةُ العميقة تنزل إلى البطاقة (D-046)', () => {
  it.each(['#s-42', '#i-42'])('«%s» بلا عنصرٍ بهذا المعرّف تنزل إلى «#d-42» لا ترتدّ إلى الرئيسيّة', (hash) => {
    const { w, thrown } = boot(hash)
    expect(thrown).toBeNull()
    expect(w.document.getElementById(hash.slice(1))).toBeNull()
    expect(hidden(w)).toEqual([true, false])
    expect(current(w)).toBe('#posts')
    const card = w.document.getElementById('d-42')
    expect(card?.getAttribute('tabindex')).toBe('-1')
    expect(w.document.activeElement).toBe(card)
  })

  it('و«#d-…» نفسُها تفتح لوحَها وتُركّز البطاقة', () => {
    const { w } = boot('#d-43')
    expect(hidden(w)).toEqual([true, false])
    expect(w.document.activeElement).toBe(w.document.getElementById('d-43'))
  })

  it('ومرساةٌ لا لوحَ لها ولا بطاقةَ ولا صفحةَ أخرى ترتدّ إلى الأوّل', () => {
    const { w } = boot('#nothing-here')
    expect(hidden(w)).toEqual([false, true])
    expect(current(w)).toBe('#overview')
  })

  it('ومرساةٌ لوحُها في صفحةٍ أخرى (D-211) تنتقل إليها بمرساتها', () => {
    const { w } = boot('#security')
    expect(w.location.pathname).toBe('/panel/settings')
    expect(w.location.hash).toBe('#security')
  })
})

describe('صفحةٌ بلا ألواح لا تُسقِط ما بعدها (D-160)', () => {
  it('لا يرمي، وما بعد كتلة الألواح يعمل: شريطُ الاختصارات يظهر', () => {
    const page = `${NAV}<main id="main"><div class="card draft" id="d-1" data-draft="1" data-status="waiting"></div>
      <details id="keys" hidden></details></main><div id="flash"></div>`
    const { w, thrown } = boot('#posts', page)
    expect(thrown).toBeNull()
    expect((w.document.getElementById('keys') as unknown as { hidden: boolean }).hidden).toBe(false)
  })

  it('ولا شريطَ ولا ألواحَ ولا بطاقات: يُقيَّم بلا رمي', () => {
    const { thrown } = boot('', '<main id="main"><p>فارغ</p></main>')
    expect(thrown).toBeNull()
  })
})

describe('الاختصاراتُ بموضع المفتاح لا بحرفه', () => {
  const key = (w: Win, init: { code: string; key: string }, target?: { dispatchEvent(e: unknown): boolean }): void => {
    const e = new w.KeyboardEvent('keydown', { ...init, bubbles: true, cancelable: true })
    ;(target ?? w.document).dispatchEvent(e)
  }
  const here = (w: Win): string | null => w.document.querySelector('[data-draft].here')?.id ?? null

  it('«KeyJ» بحرفٍ عربيّ (تخطيطٌ عربيّ) يُعلّم البطاقةَ التالية، و«KeyK» يعود', () => {
    const { w } = boot('#posts')
    expect(here(w)).toBeNull()
    key(w, { code: 'KeyJ', key: 'ت' })
    expect(here(w)).toBe('d-42')
    key(w, { code: 'KeyJ', key: 'ت' })
    expect(here(w)).toBe('d-43')
    key(w, { code: 'KeyK', key: 'ن' })
    expect(here(w)).toBe('d-42')
  })

  it('والحرفُ «j» على موضعٍ آخر لا يفعل شيئًا — فالمقارنةُ على «code»', () => {
    const { w } = boot('#posts')
    key(w, { code: 'KeyT', key: 'j' })
    expect(here(w)).toBeNull()
  })

  it('و«Slash» يفتح شريطَ الاختصارات ويغلقه', () => {
    const { w } = boot('#posts')
    const help = w.document.getElementById('keys') as unknown as { open: boolean; hidden: boolean }
    expect(help.hidden).toBe(false)
    key(w, { code: 'Slash', key: '/' })
    expect(help.open).toBe(true)
    key(w, { code: 'Slash', key: '/' })
    expect(help.open).toBe(false)
  })

  it('ومَن يكتب في حقلٍ يملك مفاتيحَه: «KeyJ» داخل textarea لا يُعلّم', () => {
    const { w } = boot('#posts')
    const box = w.document.querySelector('textarea') as unknown as { dispatchEvent(e: unknown): boolean }
    key(w, { code: 'KeyJ', key: 'j' }, box)
    expect(here(w)).toBeNull()
  })

  it('و«KeyA» على البطاقة المعلَّمة يضغط «اعتمد»، ولا بطاقةَ معلَّمةً فلا شيء', () => {
    const { w } = boot('#posts')
    let pressed = 0
    w.document.querySelector('button[value="approve"]')?.addEventListener('click', (e) => { pressed += 1; e.preventDefault() })
    key(w, { code: 'KeyA', key: 'ش' })
    expect(pressed).toBe(0)
    key(w, { code: 'KeyJ', key: 'ت' })
    key(w, { code: 'KeyA', key: 'ش' })
    expect(pressed).toBe(1)
  })
})

/**
 * ‏**«بنفسي» في المتصفّح** (D-324): العدّادُ يتبع المنصّةَ المختارة ويعدّ سلسلةَ X تغريدةً تغريدة، والإرسالُ يُمسَك بسببه
 * ‏في موضعه حين يُعرف قبله، **وما كُتب لا يضيع** — ويُستعاد ما رُدّ مرّةً واحدة.
 */
describe('«بنفسي» (D-324)', () => {
  const OWN = `<main id="main"><section data-pane="posts"><h2>المنشورات</h2>
    <form method="POST" action="/panel/drafts/own" data-own>
      <div class="field"><textarea name="text" class="draft-text" data-limit="3000" data-target="2760" data-count="linkedin"></textarea>
        <span class="draft-len"><b>0</b> / <span data-lim>3000</span></span></div>
      <input type="radio" name="platform" value="linkedin" checked data-limit="3000" data-count="linkedin">
      <input type="radio" name="platform" value="x" data-limit="280" data-count="x">
      <span class="st bad" data-own-msg hidden></span>
      <button type="submit">احفظ مسوّدة</button>
    </form></section></main><div id="flash"></div>`

  type El = { value: string; checked: boolean; hidden: boolean; textContent: string; dispatchEvent(e: unknown): boolean }
  const $ = (w: Win, sel: string): El => w.document.querySelector(sel) as unknown as El

  it('X تعدّ كلَّ تغريدةٍ وحدَها بحدّ 280، والإرسالُ فوق الحدّ يُمسَك ويُقال برقم التغريدة', () => {
    const { w, thrown } = boot('#posts', NAV + OWN)
    expect(thrown).toBeNull()
    const t = $(w, 'textarea')
    const x = $(w, 'input[value=x]')
    x.checked = true
    x.dispatchEvent(new w.Event('change', { bubbles: true }))
    expect($(w, '[data-lim]').textContent).toBe('280')
    t.value = `${'ن'.repeat(50)}\n---\n${'م'.repeat(281)}`
    t.dispatchEvent(new w.Event('input'))
    expect($(w, '.draft-len b').textContent).toBe('50 · 281')
    const ev = new w.Event('submit', { cancelable: true })
    w.document.querySelector('form')!.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(true)
    expect($(w, '[data-own-msg]').hidden).toBe(false)
    expect($(w, '[data-own-msg]').textContent).toBe('التغريدة 2 من 2 فوق حدّها: 281 من 280.')
  })

  it('وما كُتب يُحفظ في المتصفّح ويعود في الزيارة التالية، وما رُدّ يعود مرّةً مع «#own» وإشعارِ رفض', () => {
    const first = boot('#posts', NAV + OWN)
    const t = $(first.w, 'textarea')
    t.value = 'نصٌّ لم يُرسَل بعد'
    t.dispatchEvent(new first.w.Event('input'))
    const kept = first.w.localStorage.getItem('sada-own')
    expect(JSON.parse(kept ?? '{}')).toEqual({ t: 'نصٌّ لم يُرسَل بعد', p: 'linkedin' })

    // ‏زيارةٌ تالية في متصفّحٍ حفظ ما كُتب: يعود إلى الحقل
    const later = new Window({ url: 'https://sada2.basserh.com/panel#posts' })
    open.push(later)
    later.localStorage.setItem('sada-own', kept ?? '')
    later.document.body.innerHTML = NAV + OWN
    ;(later as unknown as { eval(code: string): void }).eval(panelScript().body)
    expect($(later, 'textarea').value).toBe('نصٌّ لم يُرسَل بعد')

    const refused = new Window({ url: 'https://sada2.basserh.com/panel#own' })
    open.push(refused)
    refused.sessionStorage.setItem('sada-own', JSON.stringify({ t: 'ردّه الخادم', p: 'x' }))
    refused.document.body.innerHTML = NAV + OWN.replace('<div id="flash"></div>', '<div id="flash"><div class="toast-note bad">لم يُحفظ</div></div>')
    ;(refused as unknown as { eval(code: string): void }).eval(panelScript().body)
    expect($(refused, 'textarea').value).toBe('ردّه الخادم')
    expect($(refused, 'input[value=x]').checked).toBe(true)
    expect(refused.sessionStorage.getItem('sada-own')).toBeNull()
  })
})

/**
 * عُدّةُ المكوّنات (D-189) — **الوسمُ والوصولُ قبل الشكل**.
 *
 * لكلّ مكوّنٍ صنفُه ودورُه واسمُه وحالُه: الزرُّ المشغولُ `aria-busy` والمعطّلُ `aria-disabled`
 * بسببٍ مربوط، والتبويبُ `aria-current` أو `role="tab"`، والحقلُ تلميحُه وخطؤه مربوطان به،
 * والإشعارُ يُعلَن، والحوارُ عنوانُه اسمُه. **والورقةُ تُسأل قواعدَ** (`src/test/css`): التركيزُ
 * مرئيّ، والضغطُ بلا إزاحة، والدوّارةُ تقف مع تقليل الحركة، والمؤشّراتُ حدودٌ في الألوان القسريّة.
 */
import { describe, expect, it } from 'vitest'
import { sheet } from '../../../test/css'
import { STYLE } from '../styles'
import { KIT_SCRIPT } from '../scripts'
import { ICON } from '../icons'
import { button, btnClass } from './button'
import { count, statusBadge } from './badge'
import { card, cardClass } from './card'
import { segmented, tabs } from './tabs'
import { field } from './field'
import { notice, noticeText, toastRegion } from './toast'
import { dialog } from './dialog'
import { emptyState } from './empty'

const css = sheet(STYLE)

describe('الزرّ (7.1)', () => {
  it('أربعُ درجاتٍ ومقاسان، وصنفٌ واحدٌ بادئتُه «btn»', () => {
    expect(btnClass('primary')).toBe('btn btn-primary')
    expect(btnClass('secondary', 'sm')).toBe('btn btn-secondary btn-sm')
    for (const v of ['primary', 'secondary', 'quiet', 'danger', 'icon'] as const) {
      expect(Object.keys(css.rule(`.btn-${v}`)).length, v).toBeGreaterThan(0)
    }
    // ‏ولا أصنافَ من حرفٍ واحد في الورقة بعد اليوم
    for (const old of ['.p', '.g', '.d', '.sm']) expect(css.where(old), old).toEqual([])
  })

  it('زرٌّ أو رابطٌ بهيئته، والنوعُ «button» ما لم يُطلَب الإرسال، والنصُّ مهرَّب', () => {
    expect(button({ label: 'احفظ <b>' })).toBe('<button class="btn btn-secondary" type="button"><span>احفظ &lt;b&gt;</span></button>')
    expect(button({ label: 'اعتمد', variant: 'primary', type: 'submit', name: 'decision', value: 'ok' }))
      .toBe('<button class="btn btn-primary" type="submit" name="decision" value="ok"><span>اعتمد</span></button>')
    expect(button({ label: 'الرئيسيّة', variant: 'quiet', href: '/panel?a=1&b=2' }))
      .toBe('<a class="btn btn-quiet" href="/panel?a=1&amp;b=2"><span>الرئيسيّة</span></a>')
  })

  it('زرُّ الأيقونة اسمُه في «aria-label» وتلميحُه في «title»، ولا نصَّ ظاهرًا', () => {
    const html = button({ label: 'أغلق الإشعار', variant: 'icon', icon: ICON.more })
    expect(html).toContain('aria-label="أغلق الإشعار" title="أغلق الإشعار"')
    expect(html).not.toContain('<span>')
    expect(html).toContain('aria-hidden="true"')
    // ‏ومربّعُه هدفُ اللمس نفسُه (‏٤٤)، والرمزُ ‏٢٠
    expect(css.rule('.btn-icon').width).toBe('var(--tap)')
    expect(css.rule('.btn-icon svg')).toMatchObject({ width: 'var(--icon-md)', height: 'var(--icon-md)' })
  })

  it('المشغولُ «aria-busy» ونصُّه يقول الحال، والدوّارةُ ‏١٦ وتقف مع تقليل الحركة', () => {
    const html = button({ label: 'احفظ', variant: 'primary', type: 'submit', busy: 'جارٍ الحفظ…' })
    expect(html).toContain('aria-busy="true" aria-disabled="true"')
    expect(html).toContain('<span>جارٍ الحفظ…</span>')
    const spin = css.rule('.btn[aria-busy="true"]::after')
    expect(spin).toMatchObject({ width: 'var(--icon-sm)', height: 'var(--icon-sm)' })
    expect(spin.animation).toContain('spin')
    expect(css.rule('.btn[aria-busy="true"]::after', '@media(prefers-reduced-motion:reduce)').animation).toBe('none')
    // ‏والمشغولُ لا يبهت: الدوّارةُ والنصُّ يقولان حالَه
    expect(css.rule('.btn[aria-disabled="true"]:not([aria-busy="true"])').opacity).toBe('.5')
  })

  it('المعطّلُ «aria-disabled» يبقى في ترتيب التركيز، وسببُه نصٌّ تحته مربوطٌ به', () => {
    const html = button({ label: 'اكتب', variant: 'primary', type: 'submit', disabled: { id: 'w-why', reason: 'بلغ السقفُ حدَّه اليوم' } })
    expect(html).toContain('aria-disabled="true" aria-describedby="w-why"')
    expect(html).not.toMatch(/\sdisabled[\s>]/)
    expect(html).toContain('<small class="btn-why" id="w-why">بلغ السقفُ حدَّه اليوم</small>')
  })

  it('الضغطُ بلا إزاحةِ بكسل، والتركيزُ حلقةٌ مرئيّةٌ بحبر التركيز', () => {
    expect(css.decls().filter((d) => d.selectors.some((s) => /:active/.test(s)) && d.prop === 'transform')).toEqual([])
    expect(css.rule(':focus-visible')).toMatchObject({ outline: 'var(--stroke) solid var(--focus)', 'outline-offset': 'var(--stroke)' })
    expect(css.rule('.btn-primary:active:not(:disabled)').background).toBe('var(--brand-press)')
  })

  it('والهادئُ خطٌّ تحته دائمًا (لا باللون وحدَه)، يثخن عند التمرير', () => {
    expect(css.rule('.btn-quiet')).toMatchObject({ color: 'var(--link)', 'text-decoration': 'underline', background: 'transparent' })
    expect(css.rule('.btn-quiet:hover', '@media(hover:hover)')['text-decoration-thickness']).toBe('var(--stroke)')
  })
})

describe('الشارةُ والعدد (7.2)', () => {
  it('شارةُ الحال: نغمةٌ ورمزٌ مرسومٌ مخفيٌّ عن قارئ الشاشة وكلمة', () => {
    const html = statusBadge('warn', '!', 'تنتظرك', 'title="x"')
    expect(html).toMatch(/^<span class="st warn" title="x"><span class="st-ic"><svg [^>]*aria-hidden="true"/)
    expect(html.endsWith('تنتظرك</span>')).toBe(true)
    expect(statusBadge('', '○', 'لا')).toMatch(/^<span class="st">/)
    // ‏والنغماتُ الخمس في الورقة، والمحايدان يفترقان بالرمز لا باللون
    for (const t of ['ok', 'warn', 'bad', 'idle', 'pending']) expect(Object.keys(css.rule(`.st.${t}`)).length, t).toBeGreaterThan(0)
    expect(css.rule('.st.pending')).toEqual(css.rule('.st.idle'))
  })

  it('العدد: رقمٌ ‏١٣ بوزن ‏٦٠٠ على السطح الثالث، والفاشلُ بنغمته، وباسمٍ لقارئ الشاشة إن طُلب', () => {
    expect(count(3)).toBe('<span class="count">3</span>')
    expect(count(2, { tone: 'bad', label: 'فشل اثنان' })).toBe('<span class="count bad" aria-label="فشل اثنان">2</span>')
    expect(css.rule('.count')).toMatchObject({
      background: 'var(--surface-3)', color: 'var(--ink-2)', 'font-size': 'var(--t-caption)', 'font-weight': '600',
      'border-radius': 'var(--r-pill)',
    })
    expect(css.rule('.count.bad')).toMatchObject({ background: 'var(--bad-wash)', color: 'var(--bad)' })
  })
})

describe('البطاقة بصيغها الأربع (7.3)', () => {
  it('card · interactive · inset · alert — والرأسُ عنوانٌ ووصفٌ وفعلٌ في الطرف', () => {
    expect(cardClass()).toBe('card')
    expect(cardClass('inset')).toBe('card card-inset')
    const html = card({ title: 'ما ينتظرك', desc: 'جملةٌ واحدة.', action: '<a href="#x">الكلّ</a>', body: '<p>…</p>' })
    expect(html).toBe('<div class="card"><div class="card-head"><h2>ما ينتظرك</h2><span class="grow"></span><a href="#x">الكلّ</a></div>' +
      '<p class="card-desc">جملةٌ واحدة.</p><p>…</p></div>')
    expect(card({ title: 'ت', level: 3, body: '' })).toContain('<h3>ت</h3>')
  })

  it('البطاقةُ التفاعليّةُ رابطٌ واحدٌ يحمل الكلّ، وتمريرُها حدٌّ وظلٌّ بلا قفزة', () => {
    expect(card({ variant: 'interactive', href: '/panel/channels/x', body: 'X' }))
      .toBe('<a class="card card-interactive" href="/panel/channels/x">X</a>')
    expect(css.rule('.card-interactive:hover', '@media(hover:hover)')).toMatchObject({ 'box-shadow': 'var(--sh-2)', 'border-color': 'var(--field)' })
    expect(css.rule('.card-interactive:hover', '@media(hover:hover)').transform).toBeUndefined()
  })

  it('الداخليّةُ سطحٌ ثانٍ بلا حدٍّ ولا ظلّ، والتنبيهُ حافّةٌ ‏٤px بلون الحال', () => {
    expect(css.rule('.card-inset')).toMatchObject({ background: 'var(--surface-2)', 'box-shadow': 'none' })
    expect(card({ variant: 'alert', tone: 'bad', body: 'x' })).toBe('<div class="card card-alert" data-tone="bad">x</div>')
    expect(css.rule('.card-alert')['border-inline-start']).toBe('var(--s-1) solid var(--ok)')
    expect(css.rule('.card-alert[data-tone=bad]')['border-inline-start-color']).toBe('var(--bad)')
  })
})

describe('التبويبُ والمقطع — لغتا التحديد (7.4)', () => {
  it('التبويبُ رابطٌ بـ«aria-current» في «nav» مسمّاة، ومعه العددُ والفشلُ بنغمته', () => {
    const html = tabs('أقسامُ الصفحة', [
      { label: 'المنشورات', href: '/p', current: true, count: 4 },
      { label: 'الإعداد', href: '/p?tab=setup', count: '!', bad: true },
    ])
    expect(html).toBe('<nav class="tab-bar" aria-label="أقسامُ الصفحة">' +
      '<a class="tab-item" href="/p" aria-current="page"><span>المنشورات</span><span class="count">4</span></a>' +
      '<a class="tab-item" href="/p?tab=setup"><span>الإعداد</span><span class="count bad">!</span></a></nav>')
    expect(tabs('ف', [{ label: 'ك', href: '/' }], { sub: true, id: 'f' })).toMatch(/^<nav class="tab-bar tab-sub" aria-label="ف" id="f">/)
  })

  it('وداخل الصفحة «tablist»: «tab» و«aria-selected» و«aria-controls»، والمختارُ وحدَه في ترتيب Tab', () => {
    const html = tabs('اللوح', [{ label: 'أ', controls: 'pa', current: true }, { label: 'ب', controls: 'pb' }])
    expect(html).toContain('<div class="tab-bar" role="tablist" aria-label="اللوح">')
    expect(html).toContain('role="tab" aria-selected="true" aria-controls="pa">')
    expect(html).toContain('role="tab" aria-selected="false" aria-controls="pb" tabindex="-1">')
  })

  it('المحدَّدُ في التنقّل حبرٌ وخطٌّ ‏٢px تحته **بحدٍّ لا بظلّ**، والمقطعُ المختارُ سطحٌ بظلّ', () => {
    const on = css.rule('.tab-item[aria-current=page]')
    expect(on).toMatchObject({ color: 'var(--ink)', 'border-bottom-color': 'var(--ink)' })
    expect(css.rule('.tab-item')['border-bottom']).toBe('var(--stroke) solid transparent')
    expect(css.rule('.seg button[aria-pressed=true]')).toMatchObject({ background: 'var(--surface)', 'box-shadow': 'var(--sh-1)' })
    expect(css.rule('.seg')).toMatchObject({ background: 'var(--surface-2)', 'border-radius': 'var(--r-control)' })
  })

  it('المقطعُ مجموعةٌ مسمّاةٌ من أزرارٍ بـ«aria-pressed»، وسمةُ البيانات اسمُه', () => {
    const html = segmented('سمة العرض', 'theme', [{ value: 'light', label: 'نهاريّ' }, { value: 'system', label: 'النظام', pressed: true }], 'theme')
    expect(html).toContain('<div class="seg" id="theme" role="group" aria-label="سمة العرض">')
    expect(html).toContain('<button type="button" data-theme="light" aria-pressed="false">نهاريّ</button>')
    expect(html).toContain('<button type="button" data-theme="system" aria-pressed="true">النظام</button>')
  })
})

describe('الحقل (7.6)', () => {
  const control = '<input name="cap" type="number" class="w-xs">'

  it('لصيقةٌ ثمّ تلميحٌ فوق الحقل ثمّ الحقل — والتلميحُ مربوطٌ به', () => {
    const html = field({ id: 'cap', label: 'السقف', hint: 'بالدولار في اليوم', control })
    expect(html.indexOf('<label for="cap">السقف</label>')).toBeLessThan(html.indexOf('<p class="field-hint" id="cap-hint">'))
    expect(html.indexOf('field-hint')).toBeLessThan(html.indexOf('<input'))
    expect(html).toContain('<input name="cap" type="number" class="w-xs" id="cap" aria-describedby="cap-hint">')
    expect(html).not.toContain('aria-invalid')
  })

  it('والخطأُ تحت الحقل برمزٍ ونصٍّ ثخين، معلَنٌ ومربوط، والحقلُ «aria-invalid» بحدٍّ أحمر', () => {
    const html = field({ id: 'cap', label: 'السقف', hint: 'بالدولار', error: 'السقفُ رقمٌ موجب', control })
    expect(html).toContain('aria-describedby="cap-hint cap-err" aria-invalid="true"')
    expect(html).toMatch(/<p class="field-err" id="cap-err" role="alert"><span class="field-err-ic"><svg [^>]*aria-hidden="true"/)
    expect(html.indexOf('<input')).toBeLessThan(html.indexOf('field-err'))
    expect(css.rule('input[aria-invalid="true"]')['border-color']).toBe('var(--bad)')
    expect(css.rule('.field-err')).toMatchObject({ color: 'var(--bad)', 'font-weight': '600', 'font-size': 'var(--t-small)' })
  })

  it('الاختياريُّ «(اختياريّ)» ولا نجمةَ للإلزاميّ، وسِمةٌ مكتوبةٌ لا تُكرَّر', () => {
    const html = field({ id: 'n', label: 'الاسم', optional: true, control: '<input id="n" name="n">' })
    expect(html).toContain('<label for="n">الاسم <span class="field-opt">(اختياريّ)</span></label>')
    expect(html).not.toContain('*')
    expect(html.match(/id="n"/g)).toHaveLength(1)
  })

  it('والعرضُ بطول ما يُكتب لا بالبكسل', () => {
    expect(css.rule('.w-xs').width).toBe('calc(5ch + var(--s-8))')
    expect(css.rule('.w-m').width).toBe('calc(20ch + var(--s-8))')
    expect(css.rule('.w-full').width).toBe('100%')
  })
})

describe('الإشعار (7.8)', () => {
  it('منطقةٌ حيّةٌ معلَنة، والإشعارُ بنغمته ورمزه، والخطأُ تنبيه', () => {
    expect(toastRegion('x')).toBe('<div id="flash" role="status" aria-live="polite">x</div>')
    const ok = notice({ tone: 'ok', html: 'حُفظ' })
    expect(ok).toMatch(/^<div class="toast-note ok"><span class="toast-ic"><svg /)
    expect(ok).not.toContain('role="alert"')
    expect(noticeText('bad', 'لم <يُحفظ>')).toMatch(/^<div class="toast-note bad" role="alert">.*لم &lt;يُحفظ&gt;/)
    const undo = notice({ tone: 'ok', html: 'اعتُمدت', action: '<form class="inline"><button>تراجَع</button></form>' })
    expect(undo).toContain('<span class="grow"></span><form class="inline">')
  })

  it('شكلُه «card-alert» يطفو بالظلّ الثالث، تحت الشريط على الجوّال وفي الزاوية على الحاسوب', () => {
    expect(css.rule('.toast-note')['border-inline-start']).toBe('var(--s-1) solid var(--line)')
    expect(css.rule('.toast .toast-note')['box-shadow']).toBe('var(--sh-3)')
    expect(css.rule('.toast').top).toBe('calc(var(--topbar) + var(--s-3))')
    expect(css.rule('.toast', '@media(min-width:900px)')).toMatchObject({ top: 'auto', bottom: 'var(--s-6)' })
  })
})

describe('الحوارُ والورقة (7.9)', () => {
  it('«<dialog>» أصليٌّ اسمُه عنوانُه، وإلغاؤه نموذجٌ «method=dialog»', () => {
    const html = dialog({ id: 'pub', title: 'انشر الآن؟', body: '<p>لا يُستردّ.</p>', actions: '<button class="btn btn-primary" value="ok">انشر</button>' })
    expect(html).toContain('<dialog class="dlg" id="pub" aria-labelledby="pub-t">')
    expect(html).toContain('<h3 class="dlg-t" id="pub-t">انشر الآن؟</h3>')
    expect(html).toContain('<form class="dlg-foot" method="dialog"><button class="btn btn-primary" value="ok">انشر</button>' +
      '<button class="btn btn-secondary" value="cancel">إلغاء</button></form>')
    expect(html).not.toContain('dlg-grip')
  })

  it('والورقةُ على الجوّال بمقبضٍ ونصفِ قطر ‏١٦ في زاويتيها العلويّتين، فوق الستارة', () => {
    const html = dialog({ id: 'more', title: 'المزيد', body: '', sheet: true })
    expect(html).toContain('<dialog class="dlg sheet" id="more"')
    expect(html).toContain('<span class="dlg-grip" aria-hidden="true"></span>')
    expect(html).toContain('>أغلق</button>')
    const phone = '@media(max-width:599px)'
    expect(css.rule('.dlg.sheet', phone)['border-radius']).toBe('var(--r-sheet) var(--r-sheet) 0 0')
    expect(css.rule(':root')['--r-sheet']).toBe('16px')
    expect(css.rule('.dlg::backdrop').background).toBe('var(--scrim)')
    expect(css.rule('.dlg')).toMatchObject({ 'max-width': '30em', 'box-shadow': 'var(--sh-3)', 'border-radius': 'var(--r-card)' })
  })
})

describe('الحالةُ الفارغة (7.7)', () => {
  it('عنوانٌ ثمّ جملةٌ ثمّ فعلٌ واحد — والعنوانُ «h1» حين تكون الحالةُ هي الصفحة', () => {
    expect(emptyState({ title: 'لا مسوّدات بعد', html: 'اكتب واحدة.', action: '<a class="btn btn-primary" href="#w">اكتب</a>' }))
      .toBe('<div class="empty"><p class="empty-t">لا مسوّدات بعد</p><p class="empty-p">اكتب واحدة.</p><a class="btn btn-primary" href="#w">اكتب</a></div>')
    expect(emptyState({ title: '<x>', heading: 1 })).toBe('<div class="empty"><h1 class="empty-t">&lt;x&gt;</h1></div>')
    expect(emptyState({ title: 'ت', id: 'none', hidden: true })).toMatch(/^<div class="empty" id="none" hidden>/)
    expect(emptyState({ title: 'ت', icon: ICON.search })).toContain('<span class="empty-ic" aria-hidden="true"><svg')
    expect(css.rule('.empty-ic svg')).toMatchObject({ width: 'var(--icon-lg)', height: 'var(--icon-lg)' })
  })
})

describe('الألوانُ القسريّة والتباينُ الأعلى (9)', () => {
  const FORCED = '@media(forced-colors:active)'
  it('كلُّ مؤشّرِ تحديدٍ أو حالٍ بحدٍّ أو حلقةٍ بألوان النظام — لا بظلٍّ ولا بأرض', () => {
    expect(css.rule('.seg button[aria-pressed=true]', FORCED).outline).toBe('var(--stroke) solid Highlight')
    expect(css.rule('.tab-item[aria-current=page]', FORCED)['border-bottom-color']).toBe('Highlight')
    expect(css.rule('nav.tabs a[aria-current=page]', FORCED).outline).toBe('var(--ul) solid Highlight')
    expect(css.rule('nav.tabs a[aria-current=page]::before', FORCED)).toMatchObject({ 'forced-color-adjust': 'none', background: 'CanvasText' })
    expect(css.rule(':focus-visible', FORCED)['outline-color']).toBe('Highlight')
  })

  it('والتباينُ الأعلى يرفع الحبرَ الثالث والحدَّ إلى درجتيهما الوظيفيّتين في الثيمات الثلاثة', () => {
    for (const s of [':root', ':root:not([data-theme="light"])', ':root[data-theme="dark"]']) {
      expect(css.rule(s, '@media(prefers-contrast:more)'), s).toMatchObject({ '--ink-3': 'var(--ink-2)', '--line': 'var(--field)' })
    }
  })
})

/**
 * سلوكُ العُدّة يُنتزَع من النصّ المُرسَل ويُشغَّل على وثيقةٍ مصغّرة — المعطّلُ لا يُضغَط،
 * والحوارُ يُفتَح من زرّه ويعود التركيزُ إليه.
 */
describe('سلوكُ العُدّة (KIT_SCRIPT)', () => {
  function run() {
    const doc: Record<string, (e: unknown) => void> = {}
    const opened: string[] = []
    let focused = false
    const dlgOn: Record<string, (e: unknown) => void> = {}
    const dlg = {
      showModal: () => { opened.push('pub') },
      close: (v: string) => { opened.push(`close:${v}`); dlgOn['close']?.({}) },
      addEventListener: (ev: string, fn: (e: unknown) => void) => { dlgOn[ev] = fn },
    }
    const opener: Record<string, unknown> = {
      getAttribute: () => 'pub',
      addEventListener: (ev: string, fn: () => void) => { opener[`on${ev}`] = fn },
      focus: () => { focused = true },
    }
    const document = {
      addEventListener: (ev: string, fn: (e: unknown) => void) => { doc[ev] = fn },
      querySelectorAll: () => [opener],
      getElementById: (id: string) => (id === 'pub' ? dlg : null),
    }
    new Function('document', KIT_SCRIPT)(document)
    return { doc, opened, opener, dlg, dlgOn, focused: () => focused }
  }

  it('النقرُ على «aria-disabled» يُمنع قبل أن يبلغ مستمعًا آخر، والإرسالُ منه كذلك', () => {
    const t = run()
    let prevented = 0
    let stopped = 0
    const ev = (dead: boolean) => ({
      target: { closest: () => (dead ? {} : null) },
      submitter: { getAttribute: () => (dead ? 'true' : null) },
      preventDefault: () => { prevented += 1 },
      stopImmediatePropagation: () => { stopped += 1 },
    })
    t.doc['click']!(ev(false))
    expect([prevented, stopped]).toEqual([0, 0])
    t.doc['click']!(ev(true))
    t.doc['submit']!(ev(true))
    expect([prevented, stopped]).toEqual([2, 2])
  })

  it('الحوارُ يُفتَح بـ«showModal» من زرّه، والستارةُ تغلقه، والتركيزُ يعود إلى الزرّ', () => {
    const t = run()
    ;(t.opener['onclick'] as () => void)()
    expect(t.opened).toEqual(['pub'])
    t.dlgOn['click']!({ target: t.dlg })
    expect(t.opened).toEqual(['pub', 'close:cancel'])
    expect(t.focused()).toBe(true)
  })
})

describe('نقلُ الأقسام إلى البطاقة (٢ج)', () => {
  // ‏السطحُ وحدُّه ونصفُ قطره وظلُّه من صيغة البطاقة، لا من قاعدة المكوّن — فقاعدةٌ تعيد
  // إعلانَها تعيد السطحَ الثلاثين، و«audit_classes» يعدّها
  const MOVED = ['.next', '.pf', '.ch', '.draft', '.vrow', '.tpick', '.sched', '.keys', '.unbuilt', '.ax-r', '.acct']
  it.each(MOVED)('%s لا يعيد إعلانَ السطح ولا نصفِ القطر ولا الظلّ', (sel) => {
    const r = css.rule(sel)
    expect(Object.keys(r).length).toBeGreaterThan(0)
    for (const p of ['background', 'background-color', 'border-radius', 'box-shadow']) expect(r[p]).toBeUndefined()
  })
  it('بطاقةُ لوحك المختارةُ تُرى بمربّعها لا بصنفٍ من الخادم', () => {
    expect(css.where('.tpick.on')).toEqual([])
    expect(css.rule('.tpick:has(input:checked)')['border-color']).toBeDefined()
  })
})

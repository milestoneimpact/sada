/** سلوكُ التهيئة في وثيقة (D-418): حذفٌ بمطابقة الاسم، وحفظٌ تلقائيٌّ يقول المدى، ودعوةٌ لا تُرسَل بلا شركة. */
import { afterEach, describe, expect, it } from 'vitest'
import { Window } from 'happy-dom'
import { panelScript } from '../../lib/ui/asset'
import { TEAM_SCRIPT } from './teamView'

type Win = InstanceType<typeof Window>
const open: Win[] = []
afterEach(async () => { for (const w of open.splice(0)) await w.happyDOM.close() })

function boot(body: string, code: string): Win {
  const w = new Window({ url: 'https://sada2.basserh.com/panel/settings' })
  open.push(w)
  w.document.body.innerHTML = body
  ;(w as unknown as { eval(c: string): void }).eval(code)
  return w
}
const q = <T,>(w: Win, s: string): T => w.document.querySelector(s) as unknown as T

describe('حذفُ العميل بكتابة اسمه', () => {
  const FORM = `<form method="POST" action="/panel/orgs/delete" data-match-confirm>
    <select name="org"><option value="a" data-name="شركة أ">شركة أ</option><option value="b" data-name="شركة ب">شركة ب</option></select>
    <p>اكتب: «<span data-match-name>شركة أ</span>»</p><input name="confirm"><button type="submit">احذف</button></form>`
  it('معطَّلٌ حتّى يطابق، ويُعاد الفحصُ عند تبديل الخيار', () => {
    const w = boot(FORM, panelScript().body)
    const b = q<{ disabled: boolean; getAttribute(n: string): string | null }>(w, 'button')
    const t = q<{ value: string; dispatchEvent(e: unknown): void }>(w, 'input[name=confirm]')
    const sel = q<{ value: string; selectedIndex: number; dispatchEvent(e: unknown): void }>(w, 'select')
    expect(b.disabled).toBe(true)
    expect(b.getAttribute('aria-disabled')).toBe('true')
    t.value = 'شركة أ'; t.dispatchEvent(new w.Event('input'))
    expect(b.disabled).toBe(false)
    sel.selectedIndex = 1; sel.dispatchEvent(new w.Event('change'))
    expect(b.disabled).toBe(true)
    expect(q<{ textContent: string }>(w, '[data-match-name]').textContent).toBe('شركة ب')
  })
})

describe('الحفظُ التلقائيّ', () => {
  it('خارجُ المدى يقول المدى ويعيد المحفوظ ويعلّم الحقل', () => {
    const w = boot(`<form method="POST" action="/panel/settings" data-autosave>
      <p id="c1-hint">بين 0 و500 بخطوة 1</p><input id="c1" type="number" name="value" min="0" max="500" step="1" value="5" aria-describedby="c1-hint">
      <button type="submit">حفظ</button></form>`, panelScript().body)
    const inp = q<{ value: string; getAttribute(n: string): string | null; dispatchEvent(e: unknown): void }>(w, '#c1')
    expect(inp.getAttribute('aria-describedby')).toBe('c1-hint c1-st')
    inp.value = '900'; inp.dispatchEvent(new w.Event('change'))
    expect(inp.getAttribute('aria-invalid')).toBe('true')
    expect(inp.value).toBe('5')
    expect(q<{ textContent: string }>(w, '#c1-st').textContent).toContain('بين 0 و500 بخطوة 1. أُعيدت القيمة المحفوظة.')
  })
})

describe('دعوةُ عضو', () => {
  const FORM = `<form method="POST" action="/panel/team/invite" data-invite>
    <input type="radio" name="role" value="admin"><input type="radio" name="role" value="viewer" checked>
    <input type="checkbox" name="all" value="1"><input type="checkbox" name="org" value="a">
    <p data-pick-msg hidden></p><button type="submit">ادعُ</button></form>`
  it('«الكلّ» يعطّل الشركات ويطلب تأكيدًا، والمديرُ كذلك، وبلا اختيارٍ يُمنع الإرسالُ بسببه', () => {
    const w = boot(FORM, TEAM_SCRIPT)
    const f = q<{ getAttribute(n: string): string | null; hasAttribute(n: string): boolean; dispatchEvent(e: unknown): boolean }>(w, 'form')
    const all = q<{ checked: boolean; dispatchEvent(e: unknown): void }>(w, 'input[name=all]')
    const org = q<{ disabled: boolean }>(w, 'input[name=org]')
    expect(f.hasAttribute('data-confirm')).toBe(false)
    const ev = new w.Event('submit', { bubbles: true, cancelable: true })
    f.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(true)
    expect(q<{ hidden: boolean }>(w, '[data-pick-msg]').hidden).toBe(false)
    all.checked = true; all.dispatchEvent(new w.Event('change', { bubbles: true }))
    expect(org.disabled).toBe(true)
    expect(f.getAttribute('data-confirm')).toContain('كلّ الشركات')
    all.checked = false; all.dispatchEvent(new w.Event('change', { bubbles: true }))
    const admin = q<{ checked: boolean; dispatchEvent(e: unknown): void }>(w, 'input[value=admin]')
    admin.checked = true; admin.dispatchEvent(new w.Event('change', { bubbles: true }))
    expect(f.getAttribute('data-confirm')).toContain('مدير')
  })
})

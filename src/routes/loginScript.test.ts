/**
 * سكربتُ الدخول بمفتاح المرور يُشغَّل فعلًا — لا يُقرأ نصًّا (الجلسة ب، المهمّة ١).
 *
 * صفحةُ الدخول تُرسَم على عنوان الوجهة نفسِه، فكان «location.href» إلى العنوان نفسِه بمرساةٍ
 * انتقالًا داخل الوثيقة: الكعكةُ مكتوبة والدوّارةُ باقيةٌ حتّى يُحدِّث المالكُ بيده.
 */
import { describe, expect, it, vi } from 'vitest'
import { loginPage } from './panelView'

interface Run { reload: number; replaced: string[]; note: () => string; btn: () => string; tick: () => void }

async function run(next: string, path: string, search = ''): Promise<Run> {
  const html = loginPage({ passkeys: true, next })
  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]!)
  const code = scripts.find((s) => s.includes('pk-login'))!
  let click: (() => void) | undefined
  const el = (id: string): Record<string, unknown> => ({
    id, textContent: id === 'pk-login' ? 'الدخول بمفتاح المرور' : '', value: next, disabled: false,
    children: [] as unknown[],
    setAttribute() {}, removeAttribute() {}, focus() {},
    appendChild(c: { textContent: string }) { this.textContent = String(this.textContent) + c.textContent },
    addEventListener(_: string, f: () => void) { click = f },
  })
  const els: Record<string, Record<string, unknown>> = { 'pk-login': el('pk-login'), 'pk-note': el('pk-note'), 'login-next': el('login-next') }
  const timers: (() => void)[] = []
  const out: Run = {
    reload: 0, replaced: [],
    note: () => String(els['pk-note']!.textContent), btn: () => String(els['pk-login']!.textContent),
    tick: () => { for (const t of timers.splice(0)) t() },
  }
  const buf = new Uint8Array([1, 2, 3]).buffer
  const env = {
    window: { PublicKeyCredential: function () {} },
    navigator: { credentials: { get: async () => ({ id: 'cid', response: { authenticatorData: buf, clientDataJSON: buf, signature: buf } }) } },
    document: { getElementById: (id: string) => els[id] ?? null, createElement: () => ({ href: '', textContent: '' }) },
    location: {
      pathname: path, search, hash: '',
      reload: () => { out.reload += 1 },
      replace: (u: string) => { out.replaced.push(u) },
      set href(_: string) { throw new Error('href لا يُستعمل للانتقال') },
    },
    fetch: async (u: string) => u.endsWith('/challenge')
      ? { ok: true, json: async () => ({ challenge: 'AQID', rpId: 'x', allowCredentials: ['AQID'], ticket: 't' }) }
      : { ok: true, status: 200, json: async () => ({}) },
    setTimeout: (f: () => void) => { timers.push(f) },
    atob, btoa,
  }
  new Function(...Object.keys(env), code)(...Object.values(env))
  click!()
  await vi.waitFor(() => { if (out.reload + out.replaced.length === 0) throw new Error('لم ينتقل') })
  return out
}

describe('الدخول بمفتاح المرور ينتقل فعلًا (الجلسة ب)', () => {
  it('الوجهة هي الصفحة نفسُها بمرساة ← إعادة تحميل، لا انتقال داخل الوثيقة', async () => {
    const r = await run('/panel#drafts', '/panel')
    expect(r.reload).toBe(1)
    expect(r.replaced).toEqual([])
    expect(r.note()).toBe('تمّ — تُفتح لوحتك…')
  })
  it('والصفحة نفسُها بلا مرساة ← إعادة تحميل', async () => {
    expect((await run('/panel', '/panel')).reload).toBe(1)
  })
  it('ووجهة أخرى تحلّ محلّ الدخول في السجلّ', async () => {
    const r = await run('/panel/channels/x', '/panel/login', '?next=%2Fpanel%2Fchannels%2Fx')
    expect(r.replaced).toEqual(['/panel/channels/x'])
  })
  it('ووجهة لا تبدأ بـ«/» وحدها أو تبدأ بـ«//» ← الرئيسيّة', async () => {
    expect((await run('//evil.example', '/panel/login')).replaced).toEqual(['/panel'])
  })
  it('وبعد ثماني ثوان بلا انتقال رابط لا دوّارة', async () => {
    const r = await run('/panel', '/panel')
    expect(r.btn()).toBe('تمّ')
    r.tick()
    expect(r.note()).toBe('لم تُفتح؟ افتح لوحتك')
  })
})

/**
 * ‏ومتصفّحٌ بلا مفاتيح مرور (مراجعة D-313): كان الأوّليُّ الوحيد في البطاقة زرًّا معطَّلًا، والطريقُ الذي تدلّ
 * ‏عليه الرسالةُ («ادخل برمز البريد») ثانويًّا. فيُشغَّل السكربتُ بلا PublicKeyCredential ويُقرأ الصنفان.
 */
describe('متصفّحٌ بلا مفاتيح مرور (D-313)', () => {
  it('زرُّ المفتاح يصير ثانويًّا معطَّلًا، و«أرسل الرمز» الأوّليَّ والتركيزُ في البريد', () => {
    const html = loginPage({ passkeys: true, next: '/panel' })
    expect(html).toContain('id="login-send"')
    expect(html).toMatch(/class="btn btn-secondary" id="login-send"/)
    const code = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]!).find((s) => s.includes('pk-login'))!
    let focused = ''
    const attrs: Record<string, string> = {}
    const els: Record<string, Record<string, unknown>> = {
      'pk-login': { className: 'btn btn-primary', disabled: false, textContent: 'الدخول بمفتاح المرور', addEventListener() {}, focus() {},
        setAttribute(n: string, v: string) { attrs[n] = v } },
      'pk-note': { textContent: '' },
      'login-next': { value: '/panel' },
      'login-send': { className: 'btn btn-secondary' },
      e: { focus() { focused = 'e' } },
    }
    const env = {
      window: {}, navigator: {},
      document: { getElementById: (id: string) => els[id] ?? null, createElement: () => ({}) },
      location: { pathname: '/panel/login', search: '', hash: '' },
      fetch: async () => ({ ok: true }), setTimeout: () => {}, atob, btoa,
    }
    new Function(...Object.keys(env), code)(...Object.values(env))
    expect(els['pk-login']!.disabled).toBe(true)
    expect(els['pk-login']!.className).toBe('btn btn-secondary')
    expect(els['login-send']!.className).toBe('btn btn-primary')
    expect(focused).toBe('e')
    expect(els['pk-note']!.textContent).toBe('متصفّحك لا يدعم مفاتيح المرور — ادخل برمز البريد.')
    // ‏(مراجعة D-325) والزرُّ المعطَّلُ موصوفٌ بسببه الظاهر تحته — كان السببُ في «#pk-note» بلا رابطٍ يصله به قارئُ الشاشة
    expect(attrs['aria-describedby']).toBe('pk-note')
    expect(html).toMatch(/<div class="note" id="pk-note"[^>]*><\/div>/)
  })
})

/*
 * ‏(مراجعة D-325) **وصفحتا العامل الثاني والتحقّق للتوّ كذلك**: زرُّ المفتاح يُعطَّل في متصفّحٍ بلا مفاتيح مرور وسببُه في «#pk-note»
 * ‏بلا رابطٍ إليه. و`audit_disabled` يقيس الوسمَ الساكن، فيُشغَّل السكربتُ هنا بلا PublicKeyCredential.
 */
describe('صفحتا العامل الثاني والتحقّق: المفتاحُ المعطَّلُ موصوفٌ بسببه (مراجعة D-325)', () => {
  it('زرُّ «المس مفتاح المرور» معطَّلٌ وموصوفٌ بـ«#pk-note» الظاهر', async () => {
    const { stepUpPage } = await import('./authView')
    const html = stepUpPage({ csrf: 'c', challenge: 'x', rpId: 'sada2.basserh.com', hasPasskey: true, hasTotp: true, next: '/panel', error: null } as never, 'n')
    expect(html).toMatch(/<div class="note" id="pk-note"[^>]*><\/div>/)
    const code = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]!).find((s) => s.includes('pk-btn'))!
    const attrs: Record<string, string> = {}
    const els: Record<string, Record<string, unknown>> = {
      'pk-form': { dataset: {} },
      'pk-btn': { disabled: false, textContent: 'المس مفتاح المرور', addEventListener() {}, setAttribute(n: string, v: string) { attrs[n] = v } },
      'pk-note': { textContent: '' },
    }
    const env = {
      window: {}, navigator: {},
      document: { getElementById: (id: string) => els[id] ?? null, createElement: () => ({}) },
      location: { pathname: '/panel/stepup', search: '', hash: '' }, fetch: async () => ({ ok: true }), setTimeout: () => {}, atob, btoa,
    }
    new Function(...Object.keys(env), code)(...Object.values(env))
    expect(els['pk-btn']!.disabled).toBe(true)
    expect(els['pk-note']!.textContent).toBe('متصفّحك لا يدعم مفاتيح المرور.')
    expect(attrs['aria-describedby']).toBe('pk-note')
  })
})

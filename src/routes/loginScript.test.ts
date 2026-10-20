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

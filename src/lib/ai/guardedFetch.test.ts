/**
 * النداءُ المحروسُ عند كلّ قفزة (D-110).
 *
 * **والثغرةُ التي وُجدت بالقراءة تُثبَت هنا بالتشغيل**: حارسٌ يفحص العنوانَ
 * الأوّلَ وحدَه و`fetch` يتبع التحويل — **فعنوانٌ عامٌّ يمرّ ثمّ يردّ ‏٣٠٢
 * إلى `169.254.169.254` يصل إليها**، وهي بعينها الحالُ التي كُتب الحارسُ
 * ليمنعها.
 */
import { describe, expect, it, vi } from 'vitest'
import { guardedFetch } from './urlGuard'

/** ردٌّ يحوّل إلى `to`. */
const hop = (to: string, status = 302): Response =>
  new Response(null, { status, headers: { location: to } })

const okRes = (): Response => new Response('{"ok":true}', { status: 200 })

describe('النداءُ المحروس — والحارسُ يُفحَص عند كلّ قفزة', () => {
  it('عنوانٌ سليمٌ بلا تحويلٍ يمرّ', async () => {
    const f = vi.fn(async () => okRes()) as unknown as typeof fetch
    const res = await guardedFetch('https://api.example.com/v1', {}, f)
    expect(res.status).toBe(200)
  })

  /**
   * **وهذا هو الاختبارُ الذي وُجد الحارسُ لأجله.**
   *
   * قبل D-110 كان `fetch` يتبع هذا التحويلَ ولا يُسأل الحارسُ ثانيةً.
   */
  it('**وتحويلٌ إلى خدمة البيانات الوصفيّة يُردّ**', async () => {
    const f = vi.fn(async () => hop('http://169.254.169.254/latest/meta-data')) as unknown as typeof fetch
    await expect(guardedFetch('https://api.example.com/v1', {}, f))
      .rejects.toThrow(/تحويلٌ إلى عنوانٍ مرفوض/)
  })

  it.each([
    ['http://localhost:8787/x'],
    ['http://10.0.0.5/x'],
    ['http://192.168.1.1/x'],
    ['https://metadata/x'],
  ])('ويُردّ التحويلُ إلى %s', async (to) => {
    const f = vi.fn(async () => hop(to)) as unknown as typeof fetch
    await expect(guardedFetch('https://api.example.com/v1', {}, f)).rejects.toThrow()
  })

  /** **ولا تُرفَض التحويلاتُ كلُّها**: نطاقٌ قديمٌ إلى جديدٍ يقصده مزوّدٌ جادّ. */
  it('وتحويلٌ إلى عنوانٍ عامٍّ يُتبَع', async () => {
    let n = 0
    const f = vi.fn(async () => (n++ === 0 ? hop('https://new.example.com/v1') : okRes())) as unknown as typeof fetch
    const res = await guardedFetch('https://old.example.com/v1', {}, f)
    expect(res.status).toBe(200)
    expect(f).toHaveBeenCalledTimes(2)
  })

  /**
   * **والنسبيُّ يُحلّ على ما سبقه لا على الأصل.**
   *
   * وحلُّه على الأوّل بعد قفزتين يعطي مضيفا غيرَ الذي حوّل — **فيُفحَص
   * مضيفٌ ويُنادى آخر**.
   */
  it('**والتحويلُ النسبيُّ يُحلّ على المضيف الذي حوّل**', async () => {
    const seen: string[] = []
    const f = vi.fn(async (u: string) => {
      seen.push(String(u))
      return seen.length === 1 ? hop('https://second.example.com/a') : seen.length === 2 ? hop('/b') : okRes()
    }) as unknown as typeof fetch
    await guardedFetch('https://first.example.com/v1', {}, f)
    expect(seen[2]).toBe('https://second.example.com/b')
  })

  it('وسلسلةٌ لا تنتهي تُقطَع', async () => {
    const f = vi.fn(async () => hop('https://loop.example.com/x')) as unknown as typeof fetch
    await expect(guardedFetch('https://loop.example.com/x', {}, f)).rejects.toThrow(/يزيد على/)
  })

  it('وتحويلٌ بلا عنوانٍ يُتبَع يُردّ ولا يُبتلَع', async () => {
    const f = vi.fn(async () => new Response(null, { status: 302 })) as unknown as typeof fetch
    await expect(guardedFetch('https://api.example.com/v1', {}, f)).rejects.toThrow(/بلا عنوانٍ/)
  })

  /** **و`manual` يجعل الردَّ يعود بالتحويل** بدل أن يُتبَع من تحتنا. */
  it('ويُطلَب التحويلُ يدويّا لا يُترَك للمتصفّح', async () => {
    const f = vi.fn(async () => okRes()) as unknown as typeof fetch
    await guardedFetch('https://api.example.com/v1', { method: 'POST' }, f)
    const init = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]![1]!
    expect(init.redirect).toBe('manual')
    expect(init.method).toBe('POST')
  })

  it('والعنوانُ الأوّلُ المرفوض يُردّ بلا نداء', async () => {
    const f = vi.fn(async () => okRes()) as unknown as typeof fetch
    await expect(guardedFetch('http://169.254.169.254/x', {}, f)).rejects.toThrow(/العنوان مرفوض/)
    expect(f).not.toHaveBeenCalled()
  })
})

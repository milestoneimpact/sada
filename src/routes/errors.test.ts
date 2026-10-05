/**
 * ‏٤٠٤ و‏٥٠٠ (خطّة التصميم 7.11 · D-189) — **صفحةٌ لمن يطلب HTML، وJSON لمن يبرمج**.
 *
 * كان كلُّ مسارٍ لا وجودَ له يردّ `{"error":"not_found"}` في وجه المالك، وكلُّ استثناءٍ يردّ
 * «Internal Server Error». والحكمُ بترويسة `Accept`، و`/api/` JSON دائمًا. **ورسالةُ الاستثناء
 * لا تصل الصفحة**: رقمُ الطلب وحدَه تحت «للمطوّر»، والرسالةُ في سجلّ Worker.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { app } from '../index'
import { notFoundResponse, serverErrorResponse, wantsHtml } from './errors'

const HTML = { headers: { Accept: 'text/html,application/xhtml+xml,*/*;q=0.8' } }
const env = { SADA_ENV: 'staging' } as unknown as Record<string, unknown>

afterEach(() => { vi.restoreAllMocks() })

describe('‏٤٠٤ — صفحةٌ بالقالب نفسِه لا JSON', () => {
  it('المتصفّحُ يرى صفحةً عربيّةً بالرافدة وبابِ الرئيسيّة، وبسياسة المحتوى', async () => {
    const res = await app.request('/panel/old-anchor-page', HTML, env)
    expect(res.status).toBe(404)
    expect(res.headers.get('Content-Type')).toContain('text/html')
    expect(res.headers.get('Content-Security-Policy')).toMatch(/script-src 'nonce-/)
    expect(res.headers.get('Cache-Control')).toContain('no-store')
    const html = await res.text()
    expect(html).toContain('<html lang="ar" dir="rtl">')
    expect(html).toContain('<h1 class="empty-t">هذه الصفحة غير موجودة</h1>')
    expect(html).toContain('<bdi class="mono">/panel/old-anchor-page</bdi>')
    expect(html).toContain('<a class="btn btn-primary" href="/panel"><span>الرئيسيّة</span></a>')
    expect(html).toContain('<aside class="rail">')
    expect(html).not.toContain('not_found')
  })

  it('ومن لا يطلب HTML يأخذ JSON كما كان — و«/api/» JSON ولو طلبه', async () => {
    for (const [path, init] of [['/nope', {}], ['/nope', { headers: { Accept: 'application/json' } }], ['/api/nope', HTML]] as const) {
      const res = await app.request(path, init, env)
      expect(res.status, path).toBe(404)
      expect(await res.json(), path).toEqual({ error: 'not_found' })
    }
    expect(wantsHtml(new Request('https://x/a', HTML))).toBe(true)
    expect(wantsHtml(new Request('https://x/api/a', HTML))).toBe(false)
  })

  it('وجملةُ المسار الذي عرف ما لم يجده تُقال مع الرابط', async () => {
    const html = await notFoundResponse(new Request('https://x/panel/channels/zz', HTML), 'لا منصّةَ بهذا الاسم').text()
    expect(html).toContain('لا منصّةَ بهذا الاسم. ربّما نُقلت')
  })
})

describe('‏٥٠٠ — هادئةٌ برقم الطلب، ولا رسالةَ استثناءٍ في الوجه', () => {
  function boom(): Hono {
    const mini = new Hono()
    mini.get('/x', () => { throw new Error('D1_ERROR: no such column secret_path') })
    mini.post('/x', () => { throw new Error('boom') })
    mini.onError((error, c) => serverErrorResponse(c.req.raw, error))
    return mini
  }

  it('المتصفّحُ يرى «حدث خطأ من جهتنا، لا منك» و«أعد المحاولة» إلى المسار نفسِه، ورقمَ الطلب تحت «للمطوّر»', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await boom().request('/x?tab=setup', { headers: { ...HTML.headers, 'cf-ray': '8f1e2d3c4b5a6978-FRA' } })
    expect(res.status).toBe(500)
    expect(res.headers.get('Content-Security-Policy')).toMatch(/script-src 'nonce-/)
    const html = await res.text()
    expect(html).toContain('<h1 class="empty-t">حدث خطأ من جهتنا، لا منك</h1>')
    expect(html).toContain('<a class="btn btn-primary" href="/x?tab=setup"><span>أعد المحاولة</span></a>')
    // ‏والقراءةُ تُعاد بلا وعدٍ عمّا حُفظ — الخادمُ لا يعرفه (مراجعةُ D-189)
    expect(html).toContain('<p class="empty-p">أعد المحاولة بعد دقيقة، فإن تكرّر فأرسل إليّ ما تحت «للمطوّر» كما هو.</p>')
    expect(html).not.toContain('لم يُحفَظ')
    expect(html).not.toContain('ربّما تمّ')
    expect(html).toContain('<summary>للمطوّر</summary>')
    expect(html).toContain('<span class="mono">8f1e2d3c4b5a6978-FRA</span>')
    expect(html).not.toContain('secret_path')
    expect(html).not.toContain('D1_ERROR')
    // ‏والرسالةُ في السجلّ برقم الطلب نفسِه
    const line = JSON.parse(String(log.mock.calls[0]?.[0])) as Record<string, string>
    expect(line).toMatchObject({ event: 'unhandled_error', id: '8f1e2d3c4b5a6978-FRA', path: '/x', message: 'D1_ERROR: no such column secret_path' })
  })

  it('ونموذجٌ سقط لا يُعاد بضغطة (قد يُرسَل مرّتين): البابُ إلى الرئيسيّة', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const html = await (await boom().request('/x', { method: 'POST', ...HTML })).text()
    expect(html).toContain('<a class="btn btn-primary" href="/panel"><span>الرئيسيّة</span></a>')
    expect(html).not.toContain('أعد المحاولة</span>')
  })

  /*
   * ‏ولا تقول «لم يُحفَظ شيء» بعد كتابة (مراجعةُ D-189): نموذجٌ يكتب صفًّا صفًّا (`applyPlan`)
   * ‏أو يكتب ثمّ يسقط في `setFlash` قد تمّ بعضُه قبل الاستثناء. **وهنا يكتب فعلًا ثمّ يسقط.**
   */
  it('ونموذجٌ كتب بعضَ ما طلب ثمّ سقط: «ربّما تمّ بعضُ ما طلبتَ» وتحقّق قبل أن تعيد — لا «لم يُحفَظ»', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const written: string[] = []
    const mini = new Hono()
    mini.post('/panel/plan-import/p1/approve', () => { written.push('row-1'); throw new Error('D1_ERROR on row 2') })
    for (const method of ['POST', 'PUT', 'DELETE'] as const) mini.on(method, '/y', () => { throw new Error('boom') })
    mini.onError((error, c) => serverErrorResponse(c.req.raw, error))

    const res = await mini.request('/panel/plan-import/p1/approve', { method: 'POST', ...HTML })
    expect(res.status).toBe(500)
    expect(written).toEqual(['row-1'])
    const html = await res.text()
    expect(html).toContain('<p class="empty-p"><b>ربّما تمّ بعضُ ما طلبتَ قبل الخطأ.</b> افتح الصفحةَ التي كنتَ فيها وتحقّق ممّا حُفظ قبل أن تعيده، فإن تكرّر فأرسل إليّ ما تحت «للمطوّر» كما هو.</p>')
    expect(html).not.toContain('لم يُحفَظ')
    expect(html).not.toContain('أعد المحاولة بعد دقيقة')
    for (const method of ['PUT', 'DELETE'] as const) {
      const other = await (await mini.request('/y', { method, ...HTML })).text()
      expect(other, method).toContain('ربّما تمّ بعضُ ما طلبتَ')
      expect(other, method).not.toContain('لم يُحفَظ')
    }
  })

  it('وما رُمي بحاله عمدًا («HTTPException») يمرّ بحاله — لا ‏٥٠٠ ولا سطرَ عطلٍ في السجلّ', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const mini = new Hono()
    mini.get('/big', () => { throw new HTTPException(413, { message: 'كبير' }) })
    mini.onError((error, c) => serverErrorResponse(c.req.raw, error))
    const res = await mini.request('/big', HTML)
    expect(res.status).toBe(413)
    expect(log).not.toHaveBeenCalled()
  })

  it('ومن لا يطلب HTML يأخذ JSON برقم الطلب', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await boom().request('/x', { headers: { 'cf-ray': 'r-1' } })
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'internal_error', id: 'r-1' })
  })
})

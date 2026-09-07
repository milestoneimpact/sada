/**
 * تصويرُ الشريحة — Browser Rendering بلهجة REST (D-085).
 *
 * **ولم تُنادَ هذه النهايةُ من بيئة البناء قطّ**: `api.cloudflare.com`
 * محجوبٌ عنها. فما هنا مبنيٌّ على وثيقة Cloudflare، **والاختبارُ يحرس
 * ما نرسله وما نقرؤه** لا ما تفعله هي.
 */
import { describe, expect, it } from 'vitest'
import { MAX_HTML_BYTES, screenshotSlide, SlideError } from './render'

const CALL = {
  accountId: 'c6ea7ba30984d494a1a78efea6ddc9a0',
  apiToken: 'cfut_secret',
  html: '<html></html>',
  width: 1200,
  height: 628,
}

let sent: { url: string; body: Record<string, unknown>; auth: string | null }[] = []

function net(status: number, body: BodyInit, type: string): typeof fetch {
  sent = []
  return (async (url: unknown, init?: RequestInit): Promise<Response> => {
    sent.push({
      url: String(url),
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      auth: new Headers(init?.headers).get('Authorization'),
    })
    return new Response(body, { status, headers: { 'Content-Type': type } })
  }) as unknown as typeof fetch
}

describe('ما يُرسَل', () => {
  it('ينادي نهايةَ التصوير على حساب المالك', async () => {
    await screenshotSlide({ ...CALL, fetchImpl: net(200, new Uint8Array([1, 2]), 'image/jpeg') })
    expect(sent[0]!.url).toBe(
      `https://api.cloudflare.com/client/v4/accounts/${CALL.accountId}/browser-rendering/screenshot`,
    )
  })

  it('و**الرمزُ في الترويسة لا في العنوان** — فلا يُسجَّل في وسيط', async () => {
    await screenshotSlide({ ...CALL, fetchImpl: net(200, new Uint8Array([1]), 'image/jpeg') })
    expect(sent[0]!.auth).toBe('Bearer cfut_secret')
    expect(sent[0]!.url).not.toContain('cfut_secret')
  })

  it('ويرسل المقاسَ المطلوب لا يترك المتصفّحَ يختاره', async () => {
    await screenshotSlide({ ...CALL, fetchImpl: net(200, new Uint8Array([1]), 'image/jpeg') })
    expect(sent[0]!.body['viewport']).toEqual({ width: 1200, height: 628 })
  })
})

describe('ما يُقرأ — شكلان لا واحد', () => {
  it('بايتاتٌ خامّةٌ تُقبَل', async () => {
    const out = await screenshotSlide({
      ...CALL,
      fetchImpl: net(200, new Uint8Array([137, 80]), 'image/jpeg'),
    })
    expect(out.bytes.length).toBe(2)
    expect(out.mime).toBe('image/jpeg')
  })

  it('وغلافُ Cloudflare يُفَضّ إلى `screenshot`', async () => {
    const out = await screenshotSlide({
      ...CALL,
      fetchImpl: net(200, JSON.stringify({ success: true, result: { screenshot: 'AQI=' } }), 'application/json'),
    })
    expect(out.bytes.length).toBe(2)
  })

  it('و`success: false` فشلٌ ولو كانت ٢٠٠', async () => {
    await expect(
      screenshotSlide({
        ...CALL,
        fetchImpl: net(200, JSON.stringify({ success: false, errors: [] }), 'application/json'),
      }),
    ).rejects.toThrow(SlideError)
  })

  it('ولقطةٌ فارغةٌ لا تُقبَل صورةً', async () => {
    await expect(
      screenshotSlide({ ...CALL, fetchImpl: net(200, new Uint8Array(), 'image/jpeg') }),
    ).rejects.toThrow('فارغة')
  })
})

describe('الفشلُ يُصنَّف بالرمز لا بالنصّ', () => {
  it('٤٠٣ تقول الصلاحيّةَ المطلوبة بالاسم — وهي غيرُ صلاحيّة Workers AI', async () => {
    await expect(
      screenshotSlide({ ...CALL, fetchImpl: net(403, '{}', 'application/json') }),
    ).rejects.toThrow('Browser Rendering · Edit')
  })

  it('و٥٠٠ تُعاد، و٤٠٠ لا', async () => {
    await screenshotSlide({ ...CALL, fetchImpl: net(500, '{}', 'application/json') }).catch(
      (e: SlideError) => expect(e.retryable).toBe(true),
    )
    await screenshotSlide({ ...CALL, fetchImpl: net(400, '{}', 'application/json') }).catch(
      (e: SlideError) => expect(e.retryable).toBe(false),
    )
  })

  it('وبلا حسابٍ أو رمزٍ لا نداء', async () => {
    const fetchImpl = net(200, new Uint8Array([1]), 'image/jpeg')
    await expect(screenshotSlide({ ...CALL, apiToken: ' ', fetchImpl })).rejects.toThrow('غيرُ مضبوط')
    expect(sent).toHaveLength(0)
  })

  it('و**صفحةٌ فوق الحدّ تُردّ عندنا** — لا تُرسَل لتُردّ بخطأٍ لا يقول السبب', async () => {
    const fetchImpl = net(200, new Uint8Array([1]), 'image/jpeg')
    await expect(
      screenshotSlide({ ...CALL, html: 'x'.repeat(MAX_HTML_BYTES + 1), fetchImpl }),
    ).rejects.toThrow('أكبر من الحدّ')
    expect(sent).toHaveLength(0)
  })

  it('وعطلُ الشبكة يُعاد', async () => {
    const fail = (async () => {
      throw new Error('reset')
    }) as unknown as typeof fetch
    await screenshotSlide({ ...CALL, fetchImpl: fail }).catch((e: SlideError) => {
      expect(e.retryable).toBe(true)
    })
  })
})

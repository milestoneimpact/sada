import { describe, expect, it } from 'vitest'
import { BASE_HEADERS, htmlHeaders, makeNonce } from './headers'

describe('makeNonce', () => {
  it('لا يتكرّر — وثابتٌ مشترك يُبطل السياسة كلَّها', () => {
    const seen = new Set(Array.from({ length: 200 }, () => makeNonce()))
    expect(seen.size).toBe(200)
  })

  it('من محارف base64 وحدها — فلا يكسر قيمة الترويسة', () => {
    for (let i = 0; i < 50; i += 1) expect(makeNonce()).toMatch(/^[A-Za-z0-9+/]+$/)
  })

  it('لا يقلّ عن ١٢٨ بتّا من العشوائيّة', () => {
    // ستّةَ عشرَ بايتا تُكتب اثنين وعشرين محرفا بـ base64 بلا حشو
    expect(makeNonce().length).toBeGreaterThanOrEqual(22)
  })
})

describe('السياسة — قائمةُ سماحٍ من العدم', () => {
  const csp = (): string => htmlHeaders('N0NCE')['Content-Security-Policy'] ?? ''

  it('تبدأ بالمنع الكامل ثمّ تفتح بالاسم', () => {
    expect(csp()).toContain("default-src 'none'")
  })

  it.each([
    ['البرمجة', "script-src 'nonce-N0NCE'"],
    ['الأنماط', "style-src 'self' 'nonce-N0NCE'"],
    ['الخطوط', "font-src 'self'"],
    ['التأطير', "frame-ancestors 'none'"],
    ['وجهة النماذج', "form-action 'self'"],
    ['العنوان الأساس', "base-uri 'none'"],
    ['الكائنات', "object-src 'none'"],
  ])('%s', (_name, directive) => {
    expect(csp()).toContain(directive)
  })

  it('لا تفتح unsafe-inline ولا unsafe-eval', () => {
    expect(csp()).not.toContain('unsafe-inline')
    expect(csp()).not.toContain('unsafe-eval')
  })

  /**
   * **ولا أصلَ خارجيًّا واحد** (D-089).
   *
   * والفحصُ على الشكل لا على اسمٍ بعينه: اختبارٌ يقول «لا fonts.gstatic»
   * يمرّ على سياسةٍ فُتح فيها أصلٌ آخرُ غدا. **وما يُحرَس هو القاعدة، لا
   * المثالُ الذي كسرها.**
   */
  it('**لا أصلَ خارجيًّا**: كلُّ ما استُثني من none هو self أو data', () => {
    expect(csp()).not.toMatch(/https?:\/\//)
  })

  it('الـ nonce يدخل في التوجيهين معا لا في واحد', () => {
    const value = csp()
    expect(value.match(/nonce-N0NCE/g)).toHaveLength(2)
  })
})

describe('ترويسات الصفحة', () => {
  it('تمنع التأطير بالمعيار وبما يسبقه', () => {
    const headers = htmlHeaders('x')
    expect(headers['X-Frame-Options']).toBe('DENY')
    expect(headers['Content-Security-Policy']).toContain("frame-ancestors 'none'")
  })

  it('لا تُخزَّن في متصفّحٍ مشترك', () => {
    expect(htmlHeaders('x')['Cache-Control']).toContain('no-store')
  })

  it('تحمل الأساس كلَّه معها', () => {
    const headers = htmlHeaders('x')
    for (const [name, value] of Object.entries(BASE_HEADERS)) {
      expect(headers[name]).toBe(value)
    }
  })
})

describe('الترويسات الأساس', () => {
  it('HSTS بسنةٍ وبالنطاقات الفرعيّة', () => {
    const hsts = BASE_HEADERS['Strict-Transport-Security'] ?? ''
    expect(hsts).toContain('max-age=31536000')
    expect(hsts).toContain('includeSubDomains')
  })

  it('**بلا preload** — التزامٌ لا يُتَّخذ عرَضا، ولا يُقبل من نطاقٍ فرعيّ', () => {
    expect(BASE_HEADERS['Strict-Transport-Security']).not.toContain('preload')
  })

  it('nosniff — فردُّ JSON لا يُفسَّر HTML', () => {
    expect(BASE_HEADERS['X-Content-Type-Options']).toBe('nosniff')
  })

  it('لا مُحيل يُسرَّب إلى موقعٍ خارجيّ', () => {
    expect(BASE_HEADERS['Referrer-Policy']).toBe('no-referrer')
  })

  it('أبوابٌ لا تُستعمل تُغلق', () => {
    const policy = BASE_HEADERS['Permissions-Policy'] ?? ''
    for (const feature of ['camera', 'microphone', 'geolocation', 'payment']) {
      expect(policy).toContain(`${feature}=()`)
    }
  })

  it('**لا تحمل سياسةً** — فلا تدهس سياسة الصفحة بـ nonce حين تُطبَّق بعدها', () => {
    expect(BASE_HEADERS['Content-Security-Policy']).toBeUndefined()
  })
})

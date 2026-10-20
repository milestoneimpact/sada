import { describe, expect, it } from 'vitest'
import { checkProviderUrl } from './urlGuard'

describe('ما يُقبل', () => {
  it.each([
    ['https://api.deepseek.com/v1', 'https://api.deepseek.com/v1'],
    ['https://api.openai.com/v1/', 'https://api.openai.com/v1'],
    ['  https://api.groq.com/openai/v1  ', 'https://api.groq.com/openai/v1'],
    ['https://openrouter.ai/api/v1///', 'https://openrouter.ai/api/v1'],
  ])('%s', (input, expected) => {
    const verdict = checkProviderUrl(input)
    expect(verdict.ok).toBe(true)
    if (verdict.ok) expect(verdict.url).toBe(expected)
  })

  it('يعيد المضيف ليُعرض في التأكيد', () => {
    const verdict = checkProviderUrl('https://api.deepseek.com/v1')
    if (!verdict.ok) throw new Error('توقّعنا قبولا')
    expect(verdict.host).toBe('api.deepseek.com')
  })
})

describe('**ما يُمنع — وهو ما يجعل الطلب الخارجيّ بابا إلى الداخل**', () => {
  it.each([
    ['خدمة البيانات الوصفيّة', 'https://169.254.169.254/latest/meta-data/'],
    ['الخادم نفسه', 'https://localhost/v1'],
    ['حلقة محلّية', 'https://127.0.0.1/v1'],
    ['شبكة خاصّة 10', 'https://10.0.0.5/v1'],
    ['شبكة خاصّة 192.168', 'https://192.168.1.1/v1'],
    ['شبكة خاصّة 172.16', 'https://172.16.0.1/v1'],
    ['نطاق داخليّ', 'https://db.internal/v1'],
    ['نطاق local', 'https://printer.local/v1'],
    ['IPv6 محلّي', 'https://[::1]/v1'],
    ['مضيف بلا نقطة', 'https://metadata/v1'],
  ])('%s', (_name, url) => {
    expect(checkProviderUrl(url).ok).toBe(false)
  })

  it('172.32 ليست خاصّة — لا يُمنع ما ليس داخليّا', () => {
    expect(checkProviderUrl('https://172.32.0.1/v1').ok).toBe(true)
  })

  it('http يُرفض — المفتاح لا يُرسل على اتّصال غير مشفَّر', () => {
    const verdict = checkProviderUrl('http://api.deepseek.com/v1')
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.reason).toContain('https')
  })

  it.each(['ftp://x.com', 'file:///etc/passwd', 'javascript:alert(1)'])(
    'بروتوكول آخر يُرفض: %s',
    (url) => {
      expect(checkProviderUrl(url).ok).toBe(false)
    },
  )

  it('اعتمادات في العنوان تُرفض — المفتاح يُرسل في ترويسة', () => {
    expect(checkProviderUrl('https://user:pass@api.deepseek.com/v1').ok).toBe(false)
  })

  it('الفارغ وغير الصالح يُرفضان برسالة تُقرأ', () => {
    expect(checkProviderUrl('  ').ok).toBe(false)
    const verdict = checkProviderUrl('ليس عنوانا')
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.reason).toContain('https://')
  })
})

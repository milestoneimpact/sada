import { describe, expect, it } from 'vitest'
import { verifyKey } from './verify'

function reply(status: number, body: unknown = {}): typeof fetch {
  return (async (input: unknown): Promise<Response> => {
    const request = input as Request
    calls.push(request)
    return new Response(JSON.stringify(body), { status })
  }) as unknown as typeof fetch
}
let calls: Request[] = []

describe('نداء التحقّق نفسه', () => {
  it('لا يكلّف رموزا: قائمةُ نماذجَ لا توليد', async () => {
    calls = []
    await verifyKey('anthropic', 'sk-ant-x', reply(200))
    expect(calls[0]!.url).toContain('/v1/models')
    expect(calls[0]!.method).toBe('GET')
  })

  it('يرسل الترويسة التي يفهمها كلّ مزوّد — لا ترويسةً واحدة للجميع', async () => {
    calls = []
    await verifyKey('anthropic', 'sk-ant-x', reply(200))
    expect(calls[0]!.headers.get('x-api-key')).toBe('sk-ant-x')
    expect(calls[0]!.headers.get('anthropic-version')).toBe('2023-06-01')

    calls = []
    await verifyKey('gemini', 'AIza-y', reply(200))
    expect(calls[0]!.url).toContain('generativelanguage.googleapis.com')
    expect(calls[0]!.headers.get('x-goog-api-key')).toBe('AIza-y')
  })

  it('يقلّم المفتاح — سطرٌ لصق معه لا يُرسل', async () => {
    calls = []
    await verifyKey('gemini', '  AIza-y\n', reply(200))
    expect(calls[0]!.headers.get('x-goog-api-key')).toBe('AIza-y')
  })
})

describe('يميّز «مفتاح خطأ» من «خدمة متعبة»', () => {
  it('يقبل حين تردّ الخدمة 200', async () => {
    const result = await verifyKey('gemini', 'AIza-y', reply(200))
    expect(result.ok).toBe(true)
  })

  it.each([
    [401, 'مرفوض'],
    [403, 'مرفوض'],
    [429, 'الحدّ بلغ'],
    [500, 'الخدمة متعبة'],
    [503, 'الخدمة متعبة'],
    [404, 'الواجهة تغيّرت'],
  ])('%i → %s', async (status, expected) => {
    const result = await verifyKey('gemini', 'AIza-y', reply(status))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.detail).toContain(expected)
      expect(result.status).toBe(status)
    }
  })

  it('429 لا يقول «المفتاح خطأ» — وعلاجهما مختلف', async () => {
    const result = await verifyKey('gemini', 'AIza-y', reply(429))
    if (result.ok) throw new Error('توقّعنا رفضا')
    expect(result.detail).not.toContain('مرفوض')
  })

  it('عطلُ شبكةٍ يُبلَّغ ولا يُرمى', async () => {
    const boom = (async () => {
      throw new Error('تعذّر الاتّصال')
    }) as unknown as typeof fetch
    const result = await verifyKey('gemini', 'AIza-y', boom)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBeNull()
  })

  it('مفتاحٌ فارغ لا يُرسل نداء أصلا', async () => {
    calls = []
    const result = await verifyKey('gemini', '  ', reply(200))
    expect(result.ok).toBe(false)
    expect(calls).toHaveLength(0)
  })
})

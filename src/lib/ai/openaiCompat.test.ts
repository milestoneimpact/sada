import { describe, expect, it } from 'vitest'
import { chatCompletion, CompatError, verifyCompat } from './openaiCompat'

let sent: { url: string; body: Record<string, unknown>; headers: Headers }[] = []

function net(status: number, payload: unknown): typeof fetch {
  sent = []
  return (async (url: unknown, init?: RequestInit): Promise<Response> => {
    sent.push({
      url: String(url),
      body: init?.body === undefined ? {} : (JSON.parse(String(init.body)) as Record<string, unknown>),
      headers: new Headers(init?.headers),
    })
    return new Response(JSON.stringify(payload), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as unknown as typeof fetch
}

const OK = {
  model: 'deepseek-chat',
  choices: [{ message: { content: '{"summary":"خلاصة"}' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 900, completion_tokens: 120 },
}

const REQ = {
  baseUrl: 'https://api.deepseek.com/v1',
  apiKey: 'sk-deep',
  model: 'deepseek-chat',
  system: 'أنت طبقة الفهم',
  user: 'النصّ',
}

describe('ما يُرسل — لهجة واحدة لكلّ المزوّدين', () => {
  it('ينادي chat/completions على عنوان المزوّد', async () => {
    await chatCompletion(REQ, net(200, OK))
    expect(sent[0]!.url).toBe('https://api.deepseek.com/v1/chat/completions')
  })

  it('يرسل المفتاح في Bearer لا في العنوان', async () => {
    await chatCompletion(REQ, net(200, OK))
    expect(sent[0]!.headers.get('Authorization')).toBe('Bearer sk-deep')
    expect(sent[0]!.url).not.toContain('sk-deep')
  })

  it('يبني رسالتين: نظاميّة ومستخدم', async () => {
    await chatCompletion(REQ, net(200, OK))
    const messages = sent[0]!.body['messages'] as { role: string; content: string }[]
    expect(messages[0]!.role).toBe('system')
    expect(messages[1]!.content).toBe('النصّ')
  })

  it('**يطلب الأضعف الذي يفهمه الجميع** — json_object لا مخطّطا كاملا', async () => {
    await chatCompletion({ ...REQ, json: true }, net(200, OK))
    expect(sent[0]!.body['response_format']).toEqual({ type: 'json_object' })
  })

  it('ولا يطلبه حين لا يُراد', async () => {
    await chatCompletion(REQ, net(200, OK))
    expect(sent[0]!.body['response_format']).toBeUndefined()
  })

  it('يقلّم المفتاح — سطر لصق معه لا يُرسل', async () => {
    await chatCompletion({ ...REQ, apiKey: '  sk-deep\n' }, net(200, OK))
    expect(sent[0]!.headers.get('Authorization')).toBe('Bearer sk-deep')
  })
})

describe('ما يُقرأ', () => {
  it('يعيد النصّ والاستهلاك والنموذج', async () => {
    const result = await chatCompletion(REQ, net(200, OK))
    expect(result.text).toContain('خلاصة')
    expect(result.usage).toEqual({ inputTokens: 900, outputTokens: 120 })
    expect(result.model).toBe('deepseek-chat')
  })

  it('**استهلاك غائب يُقرأ صفرا لا يُفترَض**', async () => {
    const result = await chatCompletion(REQ, net(200, { ...OK, usage: undefined }))
    expect(result.usage).toEqual({ inputTokens: 0, outputTokens: 0 })
  })

  it('استهلاك فاسد لا يُسقط النداء', async () => {
    const result = await chatCompletion(REQ, net(200, { ...OK, usage: { prompt_tokens: 'كثير' } }))
    expect(result.usage.inputTokens).toBe(0)
  })

  it('يعود إلى النموذج المطلوب حين لا يعيده المزوّد', async () => {
    const result = await chatCompletion(REQ, net(200, { ...OK, model: undefined }))
    expect(result.model).toBe('deepseek-chat')
  })
})

describe('الأخطاء — تُقرأ من الرمز لا من نصّ الرسالة', () => {
  it.each([
    [401, false, 'مرفوض'],
    [403, false, 'مرفوض'],
    [404, false, 'غير موجود'],
    [400, false, 'اسم النموذج'],
    [429, true, 'حدّ المزوّد'],
    [500, true, 'متعب'],
    [503, true, 'متعب'],
  ])('%i → retryable=%s', async (status, retryable, expected) => {
    try {
      await chatCompletion(REQ, net(status, { error: 'x' }))
      throw new Error('توقّعنا عطلا')
    } catch (error) {
      expect(error).toBeInstanceOf(CompatError)
      expect((error as CompatError).retryable).toBe(retryable)
      expect((error as CompatError).message).toContain(expected)
    }
  })

  it('مفتاح فارغ 503 ولا ينادي الشبكة', async () => {
    const f = net(200, OK)
    await expect(chatCompletion({ ...REQ, apiKey: '  ' }, f)).rejects.toBeInstanceOf(CompatError)
    expect(sent).toHaveLength(0)
  })

  it('جواب بلا نصّ يُعطَّل ولا يُعاد فارغا', async () => {
    await expect(chatCompletion(REQ, net(200, { choices: [] }))).rejects.toBeInstanceOf(CompatError)
  })

  it('جواب مبتور يُعاد — قد يتمّ في محاولة ثانية', async () => {
    const truncated = { ...OK, choices: [{ message: { content: '{' }, finish_reason: 'length' }] }
    try {
      await chatCompletion(REQ, net(200, truncated))
      throw new Error('توقّعنا عطلا')
    } catch (error) {
      expect((error as CompatError).retryable).toBe(true)
    }
  })

  it('عطل شبكة يُعاد', async () => {
    const boom = (async () => {
      throw new Error('انقطاع')
    }) as unknown as typeof fetch
    try {
      await chatCompletion(REQ, boom)
      throw new Error('توقّعنا عطلا')
    } catch (error) {
      expect((error as CompatError).retryable).toBe(true)
    }
  })
})

/**
 * **جوابٌ وصل ثمّ رُدّ يحمل استهلاكَه** (D-164).
 *
 * فارغًا أو مبتورًا أو مرفوضًا بعد 2xx: النداءُ وقع وحوسِب عليه. وكان
 * الخطأُ يُرمى بلا استهلاك، فيعود المنادي `failed` قبل خطوة الكلفة — نداءٌ
 * مدفوعٌ لا يراه الدفتر.
 */
describe('D-164 · ما استُهلك في جواب رُدّ', () => {
  const SPENT = { inputTokens: 900, outputTokens: 120, cachedInputTokens: 0, model: 'deepseek-chat' }

  async function thrown(payload: unknown, status = 200): Promise<CompatError> {
    try {
      await chatCompletion(REQ, net(status, payload))
    } catch (error) {
      expect(error).toBeInstanceOf(CompatError)
      return error as CompatError
    }
    throw new Error('توقّعنا عطلا')
  }

  it('المبتور يحمل الاستهلاك والنموذج، ويبقى قابلًا للإعادة', async () => {
    const error = await thrown({ ...OK, choices: [{ message: { content: '{"a":' }, finish_reason: 'length' }] })
    expect(error.spent).toEqual(SPENT)
    expect(error.retryable).toBe(true)
  })

  it('والفارغ يحمله كذلك', async () => {
    const error = await thrown({ ...OK, choices: [{ message: { content: '' }, finish_reason: 'stop' }] })
    expect(error.spent).toEqual(SPENT)
  })

  it('**والرفض حقل يُقرأ**: 422 لا يُعاد — وإعادتُه تدفع ثمن الجواب نفسه مرّتين', async () => {
    const error = await thrown({
      ...OK,
      choices: [{ message: { content: null, refusal: 'I can’t help with that.' }, finish_reason: 'stop' }],
    })
    expect(error.status).toBe(422)
    expect(error.retryable).toBe(false)
    expect(error.message).toContain('رفض')
    expect(error.spent).toEqual(SPENT)
    // ونصُّ الرفض لا يصل إلى رسالة الخطأ: ما يقوله المزوّد لا يُعرَض
    expect(error.message).not.toContain('help')
  })

  it('ورفض فارغ النصّ ليس رفضًا — يبقى «لا نصّ» ويُعاد', async () => {
    const error = await thrown({ ...OK, choices: [{ message: { content: null, refusal: '  ' }, finish_reason: 'stop' }] })
    expect(error.retryable).toBe(true)
    expect(error.status).toBe(502)
  })

  it('والنموذج المطلوب حين لا يعيده المزوّد', async () => {
    const error = await thrown({ ...OK, model: undefined, choices: [{ message: { content: '{' }, finish_reason: 'length' }] })
    expect(error.spent?.model).toBe('deepseek-chat')
  })

  it('**وما لم يصل لا استهلاك فيه**: الرمز غير الناجح بلا spent', async () => {
    const error = await thrown({ usage: { prompt_tokens: 5, completion_tokens: 0 } }, 500)
    expect(error.spent).toBeUndefined()
  })

  it('ولا عطل الشبكة', async () => {
    const boom = (async () => {
      throw new Error('انقطاع')
    }) as unknown as typeof fetch
    const error = await chatCompletion(REQ, boom).then(() => null, (caught: unknown) => caught)
    expect(error).toBeInstanceOf(CompatError)
    expect((error as CompatError).spent).toBeUndefined()
  })
})

describe('التحقّق من المفتاح', () => {
  it('ينادي models على العنوان نفسه', async () => {
    await verifyCompat('https://api.deepseek.com/v1', 'sk-deep', net(200, { data: [] }))
    expect(sent[0]!.url).toBe('https://api.deepseek.com/v1/models')
  })

  it('404 لا يُتّهم به مفتاح صحيح — يُميَّز عن الرفض', async () => {
    const result = await verifyCompat('https://x.com/v1', 'k', net(404, {}))
    expect(result.ok).toBe(false)
    expect(result.detail).not.toContain('مرفوض')
    expect(result.detail).toContain('لا يدعم قائمة النماذج')
  })

  it('401 يقول «مرفوض»', async () => {
    const result = await verifyCompat('https://x.com/v1', 'k', net(401, {}))
    expect(result.detail).toContain('مرفوض')
  })

  it('200 يقبل', async () => {
    expect((await verifyCompat('https://x.com/v1', 'k', net(200, {}))).ok).toBe(true)
  })
})

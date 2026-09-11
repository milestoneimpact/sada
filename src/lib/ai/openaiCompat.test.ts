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

describe('ما يُرسل — لهجةٌ واحدة لكلّ المزوّدين', () => {
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

  it('يقلّم المفتاح — سطرٌ لصق معه لا يُرسل', async () => {
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

  it('**استهلاكٌ غائب يُقرأ صفرا لا يُفترَض**', async () => {
    const result = await chatCompletion(REQ, net(200, { ...OK, usage: undefined }))
    expect(result.usage).toEqual({ inputTokens: 0, outputTokens: 0 })
  })

  it('استهلاكٌ فاسد لا يُسقط النداء', async () => {
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

  it('مفتاحٌ فارغ 503 ولا ينادي الشبكة', async () => {
    const f = net(200, OK)
    await expect(chatCompletion({ ...REQ, apiKey: '  ' }, f)).rejects.toBeInstanceOf(CompatError)
    expect(sent).toHaveLength(0)
  })

  it('جوابٌ بلا نصّ يُعطَّل ولا يُعاد فارغا', async () => {
    await expect(chatCompletion(REQ, net(200, { choices: [] }))).rejects.toBeInstanceOf(CompatError)
  })

  it('جوابٌ مبتور يُعاد — قد يتمّ في محاولةٍ ثانية', async () => {
    const truncated = { ...OK, choices: [{ message: { content: '{' }, finish_reason: 'length' }] }
    try {
      await chatCompletion(REQ, net(200, truncated))
      throw new Error('توقّعنا عطلا')
    } catch (error) {
      expect((error as CompatError).retryable).toBe(true)
    }
  })

  it('عطلُ شبكةٍ يُعاد', async () => {
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

describe('التحقّق من المفتاح', () => {
  it('ينادي models على العنوان نفسه', async () => {
    await verifyCompat('https://api.deepseek.com/v1', 'sk-deep', net(200, { data: [] }))
    expect(sent[0]!.url).toBe('https://api.deepseek.com/v1/models')
  })

  it('404 لا يُتّهم به مفتاحٌ صحيح — يُميَّز عن الرفض', async () => {
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

/**
 * الرؤية — **اللهجةُ نفسُها لا سائقٌ ثانٍ** (D-124).
 */
describe('صورةٌ مع النصّ', () => {
  function capture(): { impl: typeof fetch; bodies: string[] } {
    const bodies: string[] = []
    const impl = (async (_u: RequestInfo | URL, init?: RequestInit) => {
      bodies.push(String(init?.body ?? ''))
      return Response.json({
        choices: [{ message: { content: 'عرضٌ فيه أربعُ شرائح' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 900, completion_tokens: 20 },
        model: 'deepseek-vision',
      })
    }) as typeof fetch
    return { impl, bodies }
  }

  const base = {
    baseUrl: 'https://api.deepseek.com/v1',
    apiKey: 'k',
    model: 'm',
    system: 'صف',
    user: 'ماذا في الصورة؟',
  }

  it('يلفّ الرسالةَ أجزاءً حين تحمل صورة', async () => {
    const { impl, bodies } = capture()
    const out = await chatCompletion({ ...base, imageUrl: 'https://x/m/t.png' }, impl)
    expect(out.text).toBe('عرضٌ فيه أربعُ شرائح')

    const sent = JSON.parse(bodies[0] ?? '{}') as {
      messages: { role: string; content: unknown }[]
    }
    const user = sent.messages[1]
    expect(Array.isArray(user?.content)).toBe(true)
    expect(user?.content).toEqual([
      { type: 'text', text: 'ماذا في الصورة؟' },
      { type: 'image_url', image_url: { url: 'https://x/m/t.png' } },
    ])
  })

  /**
   * **والنصُّ وحدَه يبقى نصّا.**
   *
   * بعضُ المزوّدين يردّ المصفوفةَ على نموذجٍ نصّيٍّ صِرف، **فلفُّها
   * دائما يكسر ما يعمل اليوم** — وهو كلُّ مسوّدةٍ وكلُّ تحليل.
   */
  it('ولا يلفُّها حين لا صورة', async () => {
    const { impl, bodies } = capture()
    await chatCompletion(base, impl)
    const sent = JSON.parse(bodies[0] ?? '{}') as { messages: { content: unknown }[] }
    expect(sent.messages[1]?.content).toBe('ماذا في الصورة؟')
  })

  it('وعنوانٌ فارغٌ كغيابه', async () => {
    const { impl, bodies } = capture()
    await chatCompletion({ ...base, imageUrl: '' }, impl)
    const sent = JSON.parse(bodies[0] ?? '{}') as { messages: { content: unknown }[] }
    expect(sent.messages[1]?.content).toBe('ماذا في الصورة؟')
  })

  /** و`data:` يُقبَل — **ولا يوجب نافذةً عامّةً على وسيطنا**. */
  it('ويقبل data: كما يقبل عنوانا', async () => {
    const { impl, bodies } = capture()
    await chatCompletion({ ...base, imageUrl: 'data:image/png;base64,AAAA' }, impl)
    const sent = JSON.parse(bodies[0] ?? '{}') as {
      messages: { content: { type: string; image_url?: { url: string } }[] }[]
    }
    expect(sent.messages[1]?.content[1]?.image_url?.url).toBe('data:image/png;base64,AAAA')
  })
})

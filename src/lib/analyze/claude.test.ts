import { describe, expect, it } from 'vitest'
import { analyzeText, AnalyzeError, MODEL } from './claude'

interface Captured {
  url: string
  body: Record<string, unknown>
  headers: Record<string, string>
}

/**
 * `fetch` مزيّف يفهم شكل نداء Anthropic.
 *
 * لا يستعمل `fakeFetch` العامّ: ذاك يوجّه بالعنوان الحرفيّ، و SDK قد
 * يمرّر `Request` لا نصّا. فيُلتقط الشكلان هنا صراحةً.
 */
function fakeAnthropic(
  reply: { status?: number; body: unknown },
): typeof fetch & { calls: Captured[] } {
  const calls: Captured[] = []
  const impl = async (input: unknown, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : null
    const url = request !== null ? request.url : String(input)
    const rawBody = request !== null ? await request.text() : String(init?.body ?? '{}')
    const headers: Record<string, string> = {}
    const source = request !== null ? request.headers : new Headers(init?.headers)
    source.forEach((value, key) => {
      headers[key.toLowerCase()] = value
    })
    calls.push({ url, body: JSON.parse(rawBody) as Record<string, unknown>, headers })
    return new Response(JSON.stringify(reply.body), {
      status: reply.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return Object.assign(impl as unknown as typeof fetch, { calls })
}

const ANALYSIS = {
  summary: 'خلاصة المصدر بالعربية.',
  themes: ['الوقف', 'الأثر'],
  worth_score: 0.72,
  worth_reason: 'رقم من الميدان لا يتكرّر.',
  audience: 'مديرو الجمعيات',
  angles: ['من الرقم إلى القرار'],
}

function okReply(overrides: Record<string, unknown> = {}): { body: unknown } {
  return {
    body: {
      id: 'msg_1',
      type: 'message',
      role: 'assistant',
      model: MODEL,
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: JSON.stringify(ANALYSIS) }],
      usage: { input_tokens: 1200, output_tokens: 300, cache_read_input_tokens: 900 },
      ...overrides,
    },
  }
}

const INPUT = { name: 'تقرير الأثر', text: 'نصّ المستند الكامل', now: new Date('2026-09-05T10:00:00Z') }

describe('analyzeText — ما يُرسل', () => {
  it('يستعمل النموذج المعتمد ولا يخترع اسما', async () => {
    const f = fakeAnthropic(okReply())
    await analyzeText({ apiKey: 'sk-test', fetchImpl: f }, INPUT)
    expect(f.calls[0]!.body['model']).toBe('claude-opus-5')
  })

  it('يقيّد المخرَج بمخطّط لا برجاء في التلقين', async () => {
    const f = fakeAnthropic(okReply())
    await analyzeText({ apiKey: 'sk-test', fetchImpl: f }, INPUT)
    const config = f.calls[0]!.body['output_config'] as Record<string, unknown>
    const format = config['format'] as Record<string, unknown>
    expect(format['type']).toBe('json_schema')
    const schema = format['schema'] as Record<string, unknown>
    expect(schema['additionalProperties']).toBe(false)
    expect(schema['required']).toContain('worth_score')
  })

  it('يخبّئ التلقين النظاميّ — فلا يُدفع ثمنه في كلّ مصدر', async () => {
    const f = fakeAnthropic(okReply())
    await analyzeText({ apiKey: 'sk-test', fetchImpl: f }, INPUT)
    const system = f.calls[0]!.body['system'] as Array<Record<string, unknown>>
    expect(system[0]!['cache_control']).toEqual({ type: 'ephemeral' })
  })

  it('يضع سياق الموسم في رسالة المستخدم لا في النظاميّ — فلا يُبطل الخبيئة', async () => {
    const f = fakeAnthropic(okReply())
    await analyzeText({ apiKey: 'sk-test', fetchImpl: f }, INPUT)
    const system = JSON.stringify(f.calls[0]!.body['system'])
    const messages = JSON.stringify(f.calls[0]!.body['messages'])
    expect(system).not.toContain('هـ')
    expect(messages).toContain('هـ')
    expect(messages).toContain('نصّ المستند الكامل')
  })

  it('لا يعيد المحاولة داخل النداء — الطابور يتولّاها', async () => {
    const f = fakeAnthropic(okReply())
    await analyzeText({ apiKey: 'sk-test', fetchImpl: f }, INPUT)
    expect(f.calls).toHaveLength(1)
  })
})

describe('analyzeText — ما يُقرأ', () => {
  it('يعيد التحليل والاستهلاك معا', async () => {
    const f = fakeAnthropic(okReply())
    const out = await analyzeText({ apiKey: 'sk-test', fetchImpl: f }, INPUT)
    expect(out.analysis.worth_score).toBe(0.72)
    expect(out.analysis.themes).toEqual(['الوقف', 'الأثر'])
    expect(out.usage).toEqual({ inputTokens: 1200, outputTokens: 300, cachedInputTokens: 900 })
    expect(out.model).toBe(MODEL)
  })

  it('يقرأ الخبيئة صفرا حين لا يعيدها المزوّد — لا يخمّنها', async () => {
    const f = fakeAnthropic(
      okReply({ usage: { input_tokens: 10, output_tokens: 5 } }),
    )
    const out = await analyzeText({ apiKey: 'sk-test', fetchImpl: f }, INPUT)
    expect(out.usage.cachedInputTokens).toBe(0)
  })
})

describe('analyzeText — ما يُعاد وما لا يُعاد', () => {
  it('غياب المفتاح 503 ولا ينادي الشبكة', async () => {
    const f = fakeAnthropic(okReply())
    await expect(analyzeText({ apiKey: '', fetchImpl: f }, INPUT)).rejects.toBeInstanceOf(AnalyzeError)
    expect(f.calls).toHaveLength(0)
  })

  it.each([
    ['تجاوز الحدّ', 429, true],
    ['عطل المزوّد', 500, true],
    ['طلب فاسد', 400, false],
  ])('%s → retryable=%s', async (_name, status, retryable) => {
    const f = fakeAnthropic({ status, body: { type: 'error', error: { type: 'x', message: 'x' } } })
    try {
      await analyzeText({ apiKey: 'sk-test', fetchImpl: f }, INPUT)
      throw new Error('توقّعنا عطلا')
    } catch (error) {
      expect(error).toBeInstanceOf(AnalyzeError)
      expect((error as AnalyzeError).retryable).toBe(retryable)
    }
  })

  it('رفض السياسة لا يُعاد — تكرارُه يُنفق بلا أمل', async () => {
    const f = fakeAnthropic(okReply({ stop_reason: 'refusal', content: [] }))
    try {
      await analyzeText({ apiKey: 'sk-test', fetchImpl: f }, INPUT)
      throw new Error('توقّعنا عطلا')
    } catch (error) {
      expect((error as AnalyzeError).retryable).toBe(false)
      expect((error as AnalyzeError).status).toBe(422)
    }
  })

  it('جواب مبتور يُعاد — قد يتمّ في المحاولة التالية', async () => {
    const f = fakeAnthropic(okReply({ stop_reason: 'max_tokens' }))
    try {
      await analyzeText({ apiKey: 'sk-test', fetchImpl: f }, INPUT)
      throw new Error('توقّعنا عطلا')
    } catch (error) {
      expect((error as AnalyzeError).retryable).toBe(true)
    }
  })

  it('جواب ليس JSON رغم المخطّط يُعطَّل ولا يُكتب نصّا خاما', async () => {
    const f = fakeAnthropic(okReply({ content: [{ type: 'text', text: 'ليس json' }] }))
    await expect(analyzeText({ apiKey: 'sk-test', fetchImpl: f }, INPUT)).rejects.toBeInstanceOf(
      AnalyzeError,
    )
  })
})

/**
 * **جوابٌ وصل ثمّ رُدّ يحمل استهلاكَه** (D-164) — السائقُ الثالث.
 *
 * البترُ والرفضُ وغيابُ النصّ والـJSON الفاسد كلُّها جوابٌ بـ200 فيه
 * `usage`، وقد حوسِب عليه. وكان الخطأُ يُرمى بلا استهلاكه، فيعود المنادي
 * `failed` قبل خطوة الكلفة ولا يرى الدفترُ شيئا.
 */
describe('D-164 · الخطأ بعد 200 يحمل استهلاكَه', () => {
  const SPENT = { inputTokens: 1200, outputTokens: 300, cachedInputTokens: 900, model: MODEL }

  async function thrown(f: typeof fetch): Promise<AnalyzeError> {
    const error = await analyzeText({ apiKey: 'sk-test', fetchImpl: f }, INPUT).then(
      () => null,
      (caught: unknown) => caught,
    )
    expect(error).toBeInstanceOf(AnalyzeError)
    return error as AnalyzeError
  }

  it.each([
    ['البتر عند max_tokens', { stop_reason: 'max_tokens' }],
    ['والرفض لسياسة المحتوى', { stop_reason: 'refusal', content: [] }],
    ['وجواب بلا كتلة نصّ', { content: [] }],
    ['والـJSON الفاسد رغم المخطّط', { content: [{ type: 'text', text: '{"summary":"' }] }],
  ])('%s: معه ما استُهلك', async (_name, overrides) => {
    const error = await thrown(fakeAnthropic(okReply(overrides)))
    expect(error.spent).toEqual(SPENT)
  })

  it('**وما لم يصل لا استهلاك فيه**: 500 بلا spent', async () => {
    const error = await thrown(fakeAnthropic({ status: 500, body: { type: 'error', error: { type: 'x', message: 'x' } } }))
    expect(error.spent).toBeUndefined()
  })

  it('وغياب المفتاح لم يُرسل شيئا: بلا spent', async () => {
    const error = await analyzeText({ apiKey: '', fetchImpl: fakeAnthropic(okReply()) }, INPUT).then(
      () => null,
      (caught: unknown) => caught,
    )
    expect(error).toBeInstanceOf(AnalyzeError)
    expect((error as AnalyzeError).spent).toBeUndefined()
  })
})

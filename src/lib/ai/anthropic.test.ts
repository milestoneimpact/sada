/**
 * سائقُ Anthropic — **ما يحمله الخطأُ حين وصل الجوابُ ثمّ رُدّ** (D-164).
 *
 * `stop_reason` بـ`refusal` أو `max_tokens` جوابٌ بـ200 فيه `usage`. وكان
 * الخطأُ يُرمى بلا استهلاكه، والمنادي يعود قبل خطوة الكلفة.
 */
import { describe, expect, it } from 'vitest'
import { anthropicChat, AnthropicError } from './anthropic'

let bodies: Record<string, unknown>[] = []

function net(options: { stop?: string; status?: number; content?: unknown[] } = {}): typeof fetch {
  bodies = []
  return (async (input: unknown, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : null
    bodies.push(JSON.parse(String(request !== null ? await request.clone().text() : (init?.body ?? '{}'))) as Record<string, unknown>)
    if ((options.status ?? 200) !== 200) {
      return new Response(JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'لا' } }), {
        status: options.status ?? 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return new Response(
      JSON.stringify({
        id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5',
        stop_reason: options.stop ?? 'end_turn',
        content: options.content ?? [{ type: 'text', text: '{"a":1}' }],
        usage: { input_tokens: 2000, output_tokens: 600, cache_read_input_tokens: 300 },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }) as unknown as typeof fetch
}

const CALL = { apiKey: 'sk-test', model: 'claude-opus-5', system: 'س', user: 'ن' }
const SPENT = { inputTokens: 2000, outputTokens: 600, cachedInputTokens: 300, model: 'claude-opus-5' }

async function thrown(fetchImpl: typeof fetch): Promise<AnthropicError> {
  const error = await anthropicChat({ ...CALL, fetchImpl }).then(() => null, (caught: unknown) => caught)
  expect(error).toBeInstanceOf(AnthropicError)
  return error as AnthropicError
}

describe('D-164 · الخطأ بعد 200 يحمل استهلاكَه', () => {
  it('البتر عند max_tokens: يُعاد، ومعه ما استُهلك', async () => {
    const error = await thrown(net({ stop: 'max_tokens' }))
    expect(error.retryable).toBe(true)
    expect(error.spent).toEqual(SPENT)
  })

  it('والرفض: لا يُعاد، ومعه ما استُهلك', async () => {
    const error = await thrown(net({ stop: 'refusal' }))
    expect(error.status).toBe(422)
    expect(error.retryable).toBe(false)
    expect(error.spent).toEqual(SPENT)
  })

  it('وجواب بلا كتلة نصّ', async () => {
    const error = await thrown(net({ content: [] }))
    expect(error.spent).toEqual(SPENT)
  })

  it('**وما لم يصل لا استهلاك فيه**: 500 بلا spent', async () => {
    const error = await thrown(net({ status: 500 }))
    expect(error.spent).toBeUndefined()
  })

  it('والنجاح يعيد الأسماء نفسها', async () => {
    const result = await anthropicChat({ ...CALL, fetchImpl: net() })
    expect(result).toEqual({ text: '{"a":1}', ...SPENT })
  })
})

describe('المخطّط', () => {
  it('يصل كما أُعطي في output_config.format — والتحميل شأن المنادي', async () => {
    const schema = { type: 'object', properties: {}, required: [], additionalProperties: false }
    await anthropicChat({ ...CALL, schema, fetchImpl: net() })
    const config = bodies[0]?.['output_config'] as { format?: { type: string; schema: unknown } }
    expect(config.format).toEqual({ type: 'json_schema', schema })
  })
})

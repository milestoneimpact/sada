/**
 * سائقُ لهجة Anthropic — الثانية من اثنتين.
 *
 * D-031 قرّر أنّ السائقَ **للهجة لا للشركة**: أكثرُ المزوّدين يتكلّمون
 * `chat/completions` فسائقٌ واحد يغطّيهم، و Anthropic لهجةٌ ثانية.
 * وكان سائقُها الوحيدُ `analyze/claude.ts` — **وهو مربوطٌ بمخطّط
 * التحليل ونموذجِه ووصفِه**، فلا يصلح لمهمّةٍ أخرى.
 *
 * فهذا نداءٌ عامّ بالمعاملات نفسها التي يقبلها `chatCompletion`: وصفٌ
 * ونصٌّ ونموذجٌ ومخطَّط. **وتوقيعُه مطابقٌ عمدا** — فمن يستدعي أحدهما
 * يستدعي الآخر بلا فرعٍ في المنطق سوى اختيار السائق.
 */
import Anthropic from '@anthropic-ai/sdk'

export interface AnthropicCall {
  readonly apiKey: string
  readonly model: string
  readonly system: string
  readonly user: string
  /** مخطَّطُ الجواب — يُفرض على النموذج لا يُرجى منه. */
  readonly schema?: Record<string, unknown>
  /** الجهدُ: `medium` لحكمٍ على نصّ، و `high` لما يحتاج برهانا. */
  readonly effort?: 'low' | 'medium' | 'high'
  readonly fetchImpl?: typeof fetch
}

export interface AnthropicResult {
  readonly text: string
  readonly inputTokens: number
  readonly outputTokens: number
  readonly cachedInputTokens: number
  readonly model: string
}

export class AnthropicError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** أيُرجى من إعادة المحاولة نفعٌ؟ 429 و 5xx نعم، 4xx لا. */
    readonly retryable: boolean,
  ) {
    super(message)
    this.name = 'AnthropicError'
  }
}

/**
 * نداءٌ واحد.
 *
 * والوصفُ النظاميّ مخبّأ (`cache_control`): ثابتٌ عبر كلّ النداءات،
 * وبلا تخبئةٍ يُدفع ثمنُه كاملا في كلّ مرّة. والمتغيّرُ في رسالة
 * المستخدم وحدها، فلا يُبطل تبدّلُه الخبيئةَ.
 */
export async function anthropicChat(call: AnthropicCall): Promise<AnthropicResult> {
  if (call.apiKey.length === 0) {
    throw new AnthropicError('لا مفتاح لـ Anthropic', 503, false)
  }

  const client = new Anthropic({
    apiKey: call.apiKey,
    ...(call.fetchImpl === undefined ? {} : { fetch: call.fetchImpl }),
    // الطابور يعيد المحاولة، فإعادةٌ داخل النداء تضاعف الكلفة بلا علم
    maxRetries: 0,
  })

  let message: Anthropic.Message
  try {
    message = await client.messages.create({
      model: call.model,
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      output_config: {
        effort: call.effort ?? 'medium',
        ...(call.schema === undefined
          ? {}
          : { format: { type: 'json_schema' as const, schema: call.schema } }),
      },
      system: [{ type: 'text', text: call.system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: call.user }],
    })
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      throw new AnthropicError('anthropic: تجاوز الحدّ', 429, true)
    }
    if (error instanceof Anthropic.APIError) {
      const status = error.status ?? 502
      throw new AnthropicError(`anthropic: ${error.message}`, status, status >= 500)
    }
    throw new AnthropicError(
      error instanceof Error ? error.message : 'anthropic: عطل غير متوقّع',
      502,
      true,
    )
  }

  // رفضٌ لسياسة المحتوى ليس عطلا يُعاد: يُبلَّغ ولا يُكرَّر
  if (message.stop_reason === 'refusal') {
    throw new AnthropicError('anthropic: رُفض الطلب لسياسة المحتوى', 422, false)
  }
  if (message.stop_reason === 'max_tokens') {
    throw new AnthropicError('anthropic: بُتر الجواب قبل تمامه', 502, true)
  }

  const block = message.content.find((part) => part.type === 'text')
  if (block === undefined) {
    throw new AnthropicError('anthropic: لا نصّ في الجواب', 502, true)
  }

  return {
    text: block.text,
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
    cachedInputTokens: message.usage.cache_read_input_tokens ?? 0,
    model: message.model,
  }
}

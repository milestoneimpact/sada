/**
 * نداء Claude — الطبقة الوحيدة التي تخاطب Anthropic.
 *
 * تعيد التحليل **ومعه استهلاك الرموز**، لأنّ المنادي يحتاج الثاني ليكتب
 * في `cost_ledger` (D-008). ودالّةٌ تعيد النتيجة وتكتم الكلفة تجعل
 * التسجيل اختياريّا، والاختياريّ يُنسى.
 */
import Anthropic from '@anthropic-ai/sdk'
import { ROUTES } from '../ai/registry'
import type { Spent } from '../ai/spent'
import { ANALYSIS_SCHEMA, SYSTEM_PROMPT, userPrompt, type Analysis } from './prompt'

/** ما يُقرأ من استجابة المزوّد لا ما يُقدَّر. */
export interface Usage {
  readonly inputTokens: number
  readonly outputTokens: number
  readonly cachedInputTokens: number
}

export interface AnalyzeResult {
  readonly analysis: Analysis
  readonly usage: Usage
  readonly model: string
}

export class AnalyzeError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** أيُرجى من إعادة المحاولة نفعٌ؟ 429 و 5xx نعم، 400 لا. */
    readonly retryable: boolean,
    /**
     * ما استُهلك في جوابٍ وصل ثمّ رُدّ — رفضًا أو بترًا أو بلا نصٍّ أو بـJSON
     * فاسد (D-164). `message.usage` حاضرٌ في الأربعة، فلا عذرَ لإسقاطه.
     */
    readonly spent?: Spent,
  ) {
    super(message)
    this.name = 'AnalyzeError'
  }
}

/**
 * من السجلّ لا من ثابتٍ هنا: نموذجٌ مكتوبٌ في موضعين يفترق أحدهما يوما،
 * فتقول اللوحة غير ما يجري فعلا — وهو أسوأ من ألّا تقول شيئا.
 */
export const MODEL = ROUTES.analyze.model

export interface AnalyzeDeps {
  readonly apiKey: string
  /** النموذجُ المختار في «توجيه المهامّ» — وغيابُه يعني افتراضَ السجلّ. */
  readonly model?: string
  readonly fetchImpl?: typeof fetch
}

export interface AnalyzeInput {
  readonly name: string
  readonly text: string
  readonly now: Date
}

function toUsage(raw: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null }): Usage {
  return {
    inputTokens: raw.input_tokens,
    outputTokens: raw.output_tokens,
    cachedInputTokens: raw.cache_read_input_tokens ?? 0,
  }
}

/**
 * يحلّل مصدرا واحدا.
 *
 * التلقين النظاميّ مخبّأ (`cache_control`) لأنّه ثابتٌ عبر كلّ المصادر:
 * بلا ذلك يُدفع ثمنه كاملا في كلّ ملفّ. وسياق الموسم في رسالة المستخدم
 * لا في النظاميّ، حتّى لا يُبطل تغيّرُ اليوم الخبيئةَ كلّها.
 */
export async function analyzeText(
  deps: AnalyzeDeps,
  input: AnalyzeInput,
): Promise<AnalyzeResult> {
  if (deps.apiKey.length === 0) {
    throw new AnalyzeError('ANTHROPIC_API_KEY غير مضبوط', 503, false)
  }

  const client = new Anthropic({
    apiKey: deps.apiKey,
    ...(deps.fetchImpl === undefined ? {} : { fetch: deps.fetchImpl }),
    maxRetries: 0, // الطابور يعيد المحاولة، فإعادة داخل النداء تضاعف الكلفة بلا علم
    timeout: 120_000, // ‏مهلةٌ صريحة (D-269): الافتراضُ عشرُ دقائق، أطولُ من استدعاء الطابور نفسِه
  })

  let message: Anthropic.Message
  try {
    message = await client.messages.create({
      model: deps.model ?? MODEL,
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      output_config: {
        effort: 'medium', // حكم على نصّ، لا برهان: `high` ينفق بلا مقابل هنا
        format: { type: 'json_schema', schema: ANALYSIS_SCHEMA },
      },
      system: [
        { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
      ],
      messages: [{ role: 'user', content: userPrompt(input) }],
    })
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      throw new AnalyzeError('anthropic: تجاوز الحدّ', 429, true)
    }
    if (error instanceof Anthropic.APIError) {
      const status = error.status ?? 502
      throw new AnalyzeError(`anthropic: ${error.message}`, status, status >= 500)
    }
    throw new AnalyzeError(
      error instanceof Error ? error.message : 'anthropic: عطل غير متوقّع',
      502,
      true,
    )
  }

  // ما بعد هذا جوابٌ وصل وحوسِب عليه: كلُّ رفضٍ منه يحمل استهلاكه (D-164).
  // وهنا أغلى بترٍ في النظام — حتّى 16000 وحدةِ خروج — فإسقاطُه أغلى إسقاط
  const usage = toUsage(message.usage)
  const spent: Spent = { ...usage, model: message.model }

  // رفضٌ لسياسة المحتوى ليس عطلا يُعاد: يُبلَّغ ولا يُكرَّر
  if (message.stop_reason === 'refusal') {
    throw new AnalyzeError('anthropic: رُفض المصدر لسياسة المحتوى', 422, false, spent)
  }
  if (message.stop_reason === 'max_tokens') {
    throw new AnalyzeError('anthropic: بُتر الجواب قبل تمامه', 502, true, spent)
  }

  const text = message.content.find((block) => block.type === 'text')
  if (text === undefined) {
    throw new AnalyzeError('anthropic: لا نصّ في الجواب', 502, true, spent)
  }

  let analysis: Analysis
  try {
    analysis = JSON.parse(text.text) as Analysis
  } catch {
    throw new AnalyzeError('anthropic: الجواب ليس JSON رغم المخطّط', 502, true, spent)
  }

  return { analysis, usage, model: message.model }
}

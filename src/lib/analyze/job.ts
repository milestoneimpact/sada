/**
 * مهمّة الفهم: من صفٍّ في `sources` إلى صفٍّ في `content_items`.
 *
 * **الترتيب هو الحوكمة، لا تعليقٌ عليها:**
 *
 *   ١ · اقرأ المصدر من القاعدة
 *   ٢ · إن كان محلَّلا ببصمته الحاليّة — اخرج بلا نداء (D-008: لا يُدفع مرّتين)
 *   ٣ · **افحص الإيقاف والسقفين** — قبل أن يُلمس Drive
 *   ٤ · صدّر النصّ من Drive
 *   ٥ · نادِ Claude
 *   ٦ · **سجّل الكلفة**
 *   ٧ · اكتب التحليل
 *
 * والسادسة قبل السابعة عمدا: النداء وقع وحوسِب عليه سواء نجحت الكتابة أم
 * لا. وسجلٌّ أقلّ من الحقيقة أسوأ من سجلٍّ أعلى منها — الأوّل يُطمئن كذبا.
 */
import { recordCost } from '../cost'
import { blockerReason, checkAllowance, checkProvider } from '../limits'
import { costOf, getProvider, resolveKey, type Provider } from '../providers'
import type { Db } from '../tokens'
import { accessToken, parseServiceAccount } from '../drive/client'
import { extractText } from '../drive/export'
import { analyzeText, AnalyzeError, type AnalyzeDeps } from './claude'
import { describeImage, type VisionDeps } from './vision'
import { routeFor } from '../ai/routes'

/**
 * أسعار Claude Opus 5 لكلّ مليون رمز (2026-06-24).
 * تتغيّر، فتُراجَع مع كلّ تحديث. والمقروء من الخبيئة عُشر الداخل.
 */
export const OPUS_5_INPUT_PER_TOKEN = 5 / 1_000_000
export const OPUS_5_OUTPUT_PER_TOKEN = 25 / 1_000_000
export const OPUS_5_CACHED_INPUT_PER_TOKEN = 0.5 / 1_000_000

export function analysisCost(usage: {
  inputTokens: number
  outputTokens: number
  cachedInputTokens: number
}): number {
  return (
    usage.inputTokens * OPUS_5_INPUT_PER_TOKEN +
    usage.cachedInputTokens * OPUS_5_CACHED_INPUT_PER_TOKEN +
    usage.outputTokens * OPUS_5_OUTPUT_PER_TOKEN
  )
}

export type AnalyzeOutcome =
  | { readonly kind: 'analyzed'; readonly sourceId: string; readonly worth: number; readonly cost: number }
  /**
   * منعه الإيقاف أو أحد السقفين. ليس فشلا: قرارٌ نُفِّذ.
   * ولا يُعاد في الطابور — إعادةُ ما مُنع بسقفٍ تدور بلا نهاية حتّى
   * ينتهي اليوم، وتستنزف حصّة الطابور بلا نداءٍ واحد ينجح.
   */
  | { readonly kind: 'blocked'; readonly sourceId: string; readonly reason: string }
  /** مُحلَّل ببصمته الحاليّة — لا نداء ولا كلفة. */
  | { readonly kind: 'already'; readonly sourceId: string }
  /** نوعٌ لا يُصدَّر، أو نصٌّ أكبر من السقف. لا يُعاد ولا يُرمى. */
  | { readonly kind: 'skipped'; readonly sourceId: string; readonly reason: string }
  | { readonly kind: 'failed'; readonly sourceId: string; readonly reason: string; readonly retryable: boolean }

export interface AnalyzeJobDeps {
  readonly db: Db
  readonly serviceAccountJson: string
  /** سرّ Worker. يغلب الخزانة دائما — والخزانة تُستعمل حين يغيب. */
  readonly anthropicKey: string
  /** مفتاح التشفير، لازمٌ لقراءة الخزانة. */
  readonly encKey?: string
  readonly now?: Date
  readonly fetchImpl?: typeof fetch
}

interface SourceRow {
  readonly id: string
  readonly drive_file_id: string
  readonly name: string
  readonly mime: string
  readonly content_hash: string
}

/**
 * بصمةُ ما حُلِّل تُحفظ في `content_items.summary`? لا — في جدولها.
 * والقيد هنا: صفُّ تحليلٍ واحدٌ لكلّ مصدر، يُستبدل حين تتغيّر البصمة.
 * فالسؤال «أحُلِّل هذا؟» يُجاب من القاعدة لا من ذاكرةٍ في العملية.
 */
async function alreadyAnalyzed(db: Db, sourceId: string, hash: string): Promise<boolean> {
  const row = await db
    .prepare('SELECT id FROM content_items WHERE source_id = ? AND themes_json LIKE ?')
    .bind(sourceId, `%"hash":"${hash}"%`)
    .first<{ id: string }>()
  return row !== null
}

/** يحلّل مصدرا واحدا. لا يرمي — يعيد ما وقع ليُسجَّل ويُقرَّر. */
/**
 * قارئُ الصور — **يُحَلّ مرّةً، ويُقال أموجودٌ هو** (D-124).
 *
 * ويُردّ `null` حين **لا مزوّدَ أو لا مفتاحَ أو لا عنوان**: فتبقى الصورةُ
 * «غيرَ مدعومة» كما كانت، **ولا تُنزَّل بايتاتُها أصلا**.
 *
 * **ولا يقرأ Anthropic هنا**: صياغتُها غيرُ لهجة `chat/completions`،
 * **ووعدُها بلا شيفرةٍ تحته وعدٌ يكذب**.
 */
async function visionReader(deps: AnalyzeJobDeps): Promise<
  { deps: VisionDeps; provider: Provider; providerName: string } | null
> {
  try {
    const route = await routeFor(deps.db, 'vision')
    const provider = await getProvider(deps.db, route.provider)
    if (provider === null || provider.kind === 'anthropic' || provider.baseUrl === null) return null

    const resolved = await resolveKey(
      deps.db,
      deps.encKey ?? '',
      provider.name,
      provider.name === 'anthropic' ? deps.anthropicKey : undefined,
    )
    if (resolved.key === null || resolved.key.length === 0) return null

    return {
      provider,
      providerName: provider.name,
      deps: {
        baseUrl: provider.baseUrl,
        apiKey: resolved.key,
        model: route.model,
        ...(deps.fetchImpl === undefined ? {} : { fetchImpl: deps.fetchImpl }),
      },
    }
  } catch {
    // **وعطلٌ في حلّ الطريق لا يُسقط تحليلَ نصٍّ سليم**
    return null
  }
}

export async function analyzeSource(
  deps: AnalyzeJobDeps,
  sourceId: string,
): Promise<AnalyzeOutcome> {
  const now = deps.now ?? new Date()
  // يُقبل معرّف الصفّ أو معرّف Drive: تقرير المسح يعيد الثاني، وإلزام
  // المالك بترجمته يدويا عبءٌ صنعناه نحن ولا يخدم شيئا
  const source = await deps.db
    .prepare(
      'SELECT id, drive_file_id, name, mime, content_hash FROM sources WHERE id = ? OR drive_file_id = ?',
    )
    .bind(sourceId, sourceId)
    .first<SourceRow>()

  if (source === null) {
    return { kind: 'failed', sourceId, reason: 'المصدر غير موجود', retryable: false }
  }

  // ٢ · لا يُدفع ثمن نداءٍ لمحتوى لم يتغيّر
  if (await alreadyAnalyzed(deps.db, source.id, source.content_hash)) {
    return { kind: 'already', sourceId: source.id }
  }

  // ٣ · الإيقاف والسقفان — قبل أن يُلمس Drive، فضلا عن Claude.
  // وموضعه بعد فحص «محلَّل بالفعل» عمدا: ما لا يكلّف شيئا لا يُمنع بسقف.
  const allowance = await checkAllowance(deps.db)
  if (allowance.blocker !== null) {
    return { kind: 'blocked', sourceId: source.id, reason: blockerReason(allowance.blocker) }
  }
  // ثمّ حارس المزوّد: تفصيلٌ تحت الجملة لا فوقها
  const providerBlocker = await checkProvider(deps.db, 'anthropic')
  if (providerBlocker !== null) {
    return { kind: 'blocked', sourceId: source.id, reason: blockerReason(providerBlocker) }
  }

  try {
    // ٤ · التصدير
    const sa = parseServiceAccount(deps.serviceAccountJson)
    const token = await accessToken(sa, now, deps.fetchImpl ?? fetch)
    /*
     * **والصورةُ تُنزَّل إن كان لها قارئ** (D-124).
     *
     * فيُقرأ طريقُ «الرؤية» أوّلا: مزوّدُه موجودٌ ومفتاحُه مضبوط؟ **وبلا
     * ذلك تبقى الصورةُ «غيرَ مدعومة» كما كانت** — ولا تُنزَّل بايتاتُها،
     * فلا نقلَ بلا فائدة.
     */
    const vision = await visionReader(deps)
    const extracted = await extractText(
      token,
      source.drive_file_id,
      source.mime,
      deps.fetchImpl ?? fetch,
      vision !== null,
    )
    if (extracted.kind === 'unsupported') {
      return { kind: 'skipped', sourceId: source.id, reason: extracted.reason }
    }
    if (extracted.kind === 'too_large') {
      return { kind: 'skipped', sourceId: source.id, reason: `النصّ ${extracted.bytes} بايت — فوق السقف` }
    }
    /*
     * **والصورةُ تصير نصّا، ثمّ يجري عليها ما يجري على كلّ نصّ.**
     *
     * فلا مسارَ تحليلٍ ثانٍ يشيخ وحدَه: الوصفُ يدخل النموذجَ نفسَه،
     * **والحكمُ على الجدوى يبقى عند نموذج التحليل** لا عند قارئ الصور.
     */
    let text: string
    if (extracted.kind === 'image') {
      if (vision === null) {
        // لا يقع — `wantsImage` كان `false` — ويُقال ولا يُفترَض
        return { kind: 'skipped', sourceId: source.id, reason: 'لا مزوّدَ رؤية' }
      }
      const seen = await describeImage(vision.deps, extracted.dataUrl, source.name)
      // **والنداءُ يُسجَّل قبل أن يُعَدّ ناجحا** (D-008)
      const visionUnits = seen.inputTokens + seen.outputTokens
      /*
       * **وسعرٌ لم يُقرأ يُسجَّل صفرا موسوما لا يُخترَع** (D-008).
       *
       * فمزوّدٌ بلا سعرٍ في جدوله يردّ `priced: false`، **والنداءُ وقع**
       * — وسكوتٌ عنه يجعل الدفترَ أقلَّ من الحقيقة.
       */
      const priced = costOf(vision.provider, seen)
      await recordCost(deps.db, {
        provider: vision.providerName,
        operation: priced.priced ? `vision:${seen.model}` : `vision:${seen.model}:price_unverified`,
        units: visionUnits,
        unitCost: visionUnits === 0 ? 0 : priced.total / visionUnits,
        refId: source.id,
      })
      text = seen.text
    } else {
      text = extracted.text
    }

    if (text.trim().length === 0) {
      return { kind: 'skipped', sourceId: source.id, reason: 'المستند فارغ' }
    }

    // ٥ · النداء — بالمفتاح المحلول: سرّ Worker أوّلا ثمّ الخزانة
    const resolved =
      deps.encKey === undefined || deps.encKey.length === 0
        ? { key: deps.anthropicKey, source: 'worker_secret' as const }
        : await resolveKey(deps.db, deps.encKey, 'anthropic', deps.anthropicKey)
    const claudeDeps: AnalyzeDeps = {
      apiKey: resolved.key ?? '',
      ...(deps.fetchImpl === undefined ? {} : { fetchImpl: deps.fetchImpl }),
    }
    const result = await analyzeText(claudeDeps, {
      name: source.name,
      text,
      now,
    })

    // ٦ · الكلفة **قبل** الكتابة (D-008)
    const cost = analysisCost(result.usage)
    const units = result.usage.inputTokens + result.usage.cachedInputTokens + result.usage.outputTokens
    await recordCost(deps.db, {
      provider: 'anthropic',
      operation: `analyze:${result.model}`,
      units,
      unitCost: units === 0 ? 0 : cost / units,
      refId: source.id,
    })

    // ٧ · الكتابة — والبصمة معها، فيُعرف ما حُلِّل ولأيّ نسخة
    const { analysis } = result
    const themes = JSON.stringify({
      hash: source.content_hash,
      themes: analysis.themes,
      audience: analysis.audience,
      angles: analysis.angles,
      reason: analysis.worth_reason,
    })
    await deps.db
      .prepare(
        `INSERT INTO content_items (id, source_id, summary, themes_json, worth_score)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(crypto.randomUUID(), source.id, analysis.summary, themes, analysis.worth_score)
      .run()

    return { kind: 'analyzed', sourceId: source.id, worth: analysis.worth_score, cost }
  } catch (error) {
    if (error instanceof AnalyzeError) {
      return { kind: 'failed', sourceId: source.id, reason: error.message, retryable: error.retryable }
    }
    const reason = error instanceof Error ? error.message : 'عطل غير متوقّع'
    // عطل Drive أو القاعدة: قد ينجح لاحقا وحده
    return { kind: 'failed', sourceId: source.id, reason, retryable: true }
  }
}

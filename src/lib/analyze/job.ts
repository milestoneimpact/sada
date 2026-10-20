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
 * **والسادسةُ تقع في الفشل أيضًا** (D-164) حين وصل جوابٌ ثمّ رُدّ: مبتورًا
 * أو مرفوضًا أو بلا نصٍّ أو بـJSON فاسد. وما لم يصل لا يُكتب له صفّ.
 */
import { recordCost } from '../cost'
import { blockerReason, checkAllowance, checkProvider } from '../limits'
import { resolveKey } from '../providers'
import type { Db } from '../tokens'
import { accessToken, parseServiceAccount } from '../drive/client'
import { extractText } from '../drive/export'
import { spentOf, type Spent } from '../ai/spent'
import { analyzeText, AnalyzeError, type AnalyzeDeps } from './claude'

/**
 * أسعار Claude Opus 5 لكلّ مليون وحدة (2026-06-24).
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
  const allowance = await checkAllowance(deps.db, 'analyze')
  if (allowance.blocker !== null) {
    return { kind: 'blocked', sourceId: source.id, reason: blockerReason(allowance.blocker) }
  }
  // ثمّ حارس المزوّد: تفصيلٌ تحت الجملة لا فوقها
  const providerBlocker = await checkProvider(deps.db, 'anthropic')
  if (providerBlocker !== null) {
    return { kind: 'blocked', sourceId: source.id, reason: blockerReason(providerBlocker) }
  }

  // خطوةُ الكلفة (٦) تُعرَّف قبل النداء لأنّ مسارين يحتاجانها: الجوابُ
  // الناجح، والجوابُ الذي وصل ثمّ رُدّ (D-164). صفٌّ واحدٌ بشكلٍ واحد
  const charge = async (spent: Spent): Promise<number> => {
    const cost = analysisCost(spent)
    const units = spent.inputTokens + spent.cachedInputTokens + spent.outputTokens
    await recordCost(deps.db, {
      provider: 'anthropic',
      operation: `analyze:${spent.model}`,
      units,
      unitCost: units === 0 ? 0 : cost / units,
      refId: source.id,
    })
    return cost
  }

  try {
    // ٤ · التصدير
    const sa = parseServiceAccount(deps.serviceAccountJson)
    const token = await accessToken(sa, now, deps.fetchImpl ?? fetch)
    const extracted = await extractText(
      token,
      source.drive_file_id,
      source.mime,
      deps.fetchImpl ?? fetch,
    )
    if (extracted.kind === 'unsupported') {
      return { kind: 'skipped', sourceId: source.id, reason: extracted.reason }
    }
    if (extracted.kind === 'too_large') {
      return { kind: 'skipped', sourceId: source.id, reason: `النصّ ${extracted.bytes} بايت — فوق السقف` }
    }
    if (extracted.text.trim().length === 0) {
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
      text: extracted.text,
      now,
    })

    // ٦ · الكلفة **قبل** الكتابة (D-008)
    const cost = await charge({ ...result.usage, model: result.model })

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
        `INSERT INTO content_items (id, source_id, summary, themes_json, worth_score, org_id, brand_id)
         VALUES (?1, ?2, ?3, ?4, ?5, (SELECT org_id FROM sources WHERE id = ?2), (SELECT brand_id FROM sources WHERE id = ?2))`,
      )
      .bind(crypto.randomUUID(), source.id, analysis.summary, themes, analysis.worth_score)
      .run()

    return { kind: 'analyzed', sourceId: source.id, worth: analysis.worth_score, cost }
  } catch (error) {
    // جوابٌ وصل ثمّ رُدّ حوسِب عليه: يُكتب قبل أن يُعاد الفشل (D-164).
    // ومستهلكُ الطابور يعيد المبتور، فكلُّ إعادةٍ صفٌّ — ويراه السقفُ في التالية
    const late = spentOf(error)
    if (late !== null) await charge(late)
    if (error instanceof AnalyzeError) {
      return { kind: 'failed', sourceId: source.id, reason: error.message, retryable: error.retryable }
    }
    const reason = error instanceof Error ? error.message : 'عطل غير متوقّع'
    // عطل Drive أو القاعدة: قد ينجح لاحقا وحده
    return { kind: 'failed', sourceId: source.id, reason, retryable: true }
  }
}

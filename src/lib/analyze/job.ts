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
import { candidates, nextFrom, runChain } from '../ai/chain'
import { modelFor } from '../ai/textCall'
import { recordCost } from '../cost'
import { blockerReason, checkAllowance, checkProvider } from '../limits'
import { costOf, getProvider, resolveKey, type Provider } from '../providers'
import type { Db } from '../tokens'
import { accessToken, parseServiceAccount } from '../drive/client'
import { extractText, type ExtractOutcome } from '../drive/export'
import { readSourceText, type Bucket } from '../sources/ingest'
import { spentOf, type Spent } from '../ai/spent'
import { analyzeText, AnalyzeError, type AnalyzeDeps } from './claude'
import { describeImage, type VisionDeps } from './vision'
import { routeFor } from '../ai/routes'
import { chatCompletion, CompatError } from '../ai/openaiCompat'
import { ANALYSIS_SCHEMA, SYSTEM_PROMPT, userPrompt, type Analysis } from './prompt'
import { withTimeout } from '../net/timeout'

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
  /** سرّ Worker — احتياطٌ يُستعمل حين تخلو الخزانة (D-346). */
  readonly anthropicKey: string
  /** مفتاح التشفير، لازمٌ لقراءة الخزانة. */
  readonly encKey?: string
  /** سرّ Gemini في Worker — لقارئ الصور حين يوجَّه إليه (D-243). */
  readonly geminiKey?: string
  readonly now?: Date
  readonly fetchImpl?: typeof fetch
  /** R2 — نصُّ المرفوع والرابط محفوظٌ فيه منذ الاستلام (D-284). وبلا رابطٍ لا يُقرأ إلّا Drive. */
  readonly media?: Bucket
}

interface SourceRow {
  readonly id: string
  readonly org_id: string
  readonly drive_file_id: string
  readonly name: string
  readonly mime: string
  readonly content_hash: string
  readonly kind: string
  readonly text_key: string | null
}

/**
 * بصمةُ ما حُلِّل تُحفظ في `content_items.summary`? لا — في جدولها.
 * والقيد هنا: صفُّ تحليلٍ واحدٌ لكلّ مصدر، يُستبدل حين تتغيّر البصمة.
 * فالسؤال «أحُلِّل هذا؟» يُجاب من القاعدة لا من ذاكرةٍ في العملية.
 */
const CLAIM_STALE_MINUTES = 10

async function claimAnalysis(db: Db, sourceId: string, hash: string): Promise<boolean> {
  try {
    const row = await db
      .prepare(
        `INSERT INTO analysis_claims (source_id, content_hash, claimed_at, org_id)
         VALUES (?1, ?2, datetime('now'), (SELECT org_id FROM sources WHERE id = ?1))
         ON CONFLICT(source_id) DO UPDATE SET
           content_hash = excluded.content_hash, claimed_at = datetime('now')
         WHERE analysis_claims.content_hash <> excluded.content_hash
            OR analysis_claims.claimed_at <= datetime('now', ?3)
         RETURNING source_id`,
      )
      .bind(sourceId, hash, `-${CLAIM_STALE_MINUTES} minutes`)
      .first<{ source_id: string }>()
    return row !== null
  } catch (error) {
    // ‏**مغلقٌ عند العطل**: جدولٌ لا يُقرأ لا يعني «لك النداء» — النداءُ يكلّف، والمسحُ التالي يعيد
    console.warn({ job: 'analyze-claim', failed: String(error) })
    return false
  }
}

/** يُحرَّر الحجزُ حين لا يُكتب صفُّ تحليل، فلا يُقفَل المصدرُ عشرَ دقائق على عطلٍ عابر. */
async function releaseAnalysis(db: Db, sourceId: string): Promise<void> {
  await db
    .prepare('DELETE FROM analysis_claims WHERE source_id = ?1 AND org_id = (SELECT org_id FROM sources WHERE id = ?1)')
    .bind(sourceId).run().catch(() => undefined)
}

async function alreadyAnalyzed(db: Db, source: SourceRow, hash: string): Promise<boolean> {
  const row = await db
    .prepare('SELECT id FROM content_items WHERE source_id = ? AND org_id = ? AND themes_json LIKE ?')
    .bind(source.id, source.org_id, `%"hash":"${hash}"%`)
    .first<{ id: string }>()
  return row !== null
}

/**
 * قارئ الصور (D-243) — أو `null` حين لا مزوّد أو لا مفتاح أو لا عنوان أو
 * سقفه مبلوغ: فتبقى الصورة «غير مدعومة» ولا تُنزَّل بايتاتها أصلا. ولا يقرأ
 * Anthropic هنا: صياغتها غير لهجة `chat/completions`.
 */
async function visionReader(deps: AnalyzeJobDeps): Promise<
  { readonly deps: VisionDeps; readonly provider: Provider } | null
> {
  try {
    const route = await routeFor(deps.db, 'vision')
    const provider = await getProvider(deps.db, route.provider)
    if (provider === null || !provider.enabled || provider.kind === 'anthropic' || provider.baseUrl === null) {
      return null
    }
    if ((await checkProvider(deps.db, provider.name)) !== null) return null
    const resolved = await resolveKey(
      deps.db,
      deps.encKey ?? '',
      provider.name,
      provider.name === 'gemini' ? deps.geminiKey : undefined,
    )
    if (resolved.key === null || resolved.key.length === 0) return null
    return {
      provider,
      deps: {
        baseUrl: provider.baseUrl,
        apiKey: resolved.key,
        model: route.model,
        ...(deps.fetchImpl === undefined ? {} : { fetchImpl: deps.fetchImpl }),
      },
    }
  } catch {
    // ‏وعطل في حلّ الطريق لا يُسقط تحليل نصّ سليم
    return null
  }
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
      // ‏المنظّمةُ تُقرأ مع الصفّ وتُحمَل إلى كلّ ما بعده (D-277)
      'SELECT id, org_id, drive_file_id, name, mime, content_hash, kind, text_key FROM sources WHERE id = ? OR drive_file_id = ?',
    )
    .bind(sourceId, sourceId)
    .first<SourceRow>()

  if (source === null) {
    return { kind: 'failed', sourceId, reason: 'المصدر غير موجود', retryable: false }
  }

  // ٢ · لا يُدفع ثمن نداءٍ لمحتوى لم يتغيّر
  if (await alreadyAnalyzed(deps.db, source, source.content_hash)) {
    return { kind: 'already', sourceId: source.id }
  }

  /*
   * ‏٢ب · حجزٌ قبل الدفع (D-270): رسالتان للمصدر نفسِه (مسحٌ مرّتين، أو زرٌّ وآليّ) كانتا
   * ‏تدفعان مرّتين. الحجزُ بالمصدر، ويُؤخَذ من حجزٍ شاخ (فوق عشر دقائق) أو ببصمةٍ أخرى.
   * ‏**ومشغولٌ ليس فشلا**: يُقَرّ ولا يُعاد، فالحاجزُ يكتب أو يحرّر.
   */
  const claimed = await claimAnalysis(deps.db, source.id, source.content_hash)
  if (!claimed) return { kind: 'already', sourceId: source.id }

  // ٣ · الإيقاف والسقفان — قبل أن يُلمس Drive، فضلا عن Claude.
  // وموضعه بعد فحص «محلَّل بالفعل» عمدا: ما لا يكلّف شيئا لا يُمنع بسقف.
  const allowance = await checkAllowance(deps.db, 'analyze', source.org_id)
  if (allowance.blocker !== null) {
    await releaseAnalysis(deps.db, source.id)
    return { kind: 'blocked', sourceId: source.id, reason: blockerReason(allowance.blocker) }
  }
  /*
   * ‏ثمّ المزوّدون **من «توجيه المهامّ»** لا من ثابت (علّة D-079/D-091) — **بسلسلة مفاتيح «الفهم»** (D-349): الأرخصُ أوّلًا افتراضًا،
   * ‏والمتعذّرُ يُتخطّى. ولا مرشّحَ مفعَّلًا: يُقال قبل أن يُلمس Drive.
   */
  const list = await candidates(deps.db, 'analyze', now)
  if (list.length === 0) {
    await releaseAnalysis(deps.db, source.id)
    return { kind: 'failed', sourceId: source.id, reason: 'لا مزوّدَ مفعَّلًا لـ«الفهم»', retryable: false }
  }

  // خطوةُ الكلفة (٦) تُعرَّف قبل النداء لأنّ مسارين يحتاجانها: الجوابُ
  // الناجح، والجوابُ الذي وصل ثمّ رُدّ (D-164). صفٌّ واحدٌ بشكلٍ واحد
  const chargeWith = (provider: Provider) => async (spent: Spent): Promise<number> => {
    const priced = provider.kind === 'anthropic' ? { total: analysisCost(spent), priced: true } : costOf(provider, spent)
    const cost = priced.total
    const units = spent.inputTokens + spent.cachedInputTokens + spent.outputTokens
    await recordCost(deps.db, {
      provider: provider.name,
      operation: priced.priced ? `analyze:${spent.model}` : `analyze:${spent.model}:price_unverified`,
      units,
      unitCost: units === 0 ? 0 : cost / units,
      refId: source.id,
      org: source.org_id,
    })
    return cost
  }

  try {
    // ٤أ · مرفوعٌ أو رابط (D-284): نصُّه استُخرج عند الاستلام وحُفظ في R2 — لا Drive ولا تصدير
    const stored = source.kind === 'drive' ? null : deps.media === undefined ? undefined : await readSourceText(deps.media, source.text_key)
    if (stored === undefined || (source.kind !== 'drive' && stored === null)) {
      await releaseAnalysis(deps.db, source.id)
      return { kind: 'failed', sourceId: source.id, reason: 'نصُّ المصدر غير موجود في التخزين — أعد رفعه', retryable: false }
    }
    // ٤ · التصدير
    // ‏والصورة لا تُنزَّل إلّا إن كان لها قارئ (D-243)
    const vision = stored === null && source.mime.startsWith('image/') ? await visionReader(deps) : null
    const extracted: ExtractOutcome = stored !== null
      ? { kind: 'text', text: stored, bytes: new TextEncoder().encode(stored).byteLength }
      : await extractText(
        await accessToken(parseServiceAccount(deps.serviceAccountJson), now, withTimeout(deps.fetchImpl ?? fetch, 30_000)),
        source.drive_file_id,
        source.mime,
        withTimeout(deps.fetchImpl ?? fetch, 30_000),
        vision !== null,
      )
    if (extracted.kind === 'unsupported') {
      return { kind: 'skipped', sourceId: source.id, reason: extracted.reason }
    }
    if (extracted.kind === 'too_large') {
      return { kind: 'skipped', sourceId: source.id, reason: `النصّ ${extracted.bytes} بايت — فوق السقف` }
    }
    /*
     * والصورة تصير نصّا، ثمّ يجري عليها ما يجري على كلّ نصّ (D-243). ونداؤها
     * يُسجَّل قبل أن يُعدّ ناجحا (D-008)، وفي الفشل حين وصل جواب ثمّ رُدّ (D-164)،
     * باسم مزوّد الرؤية لا باسم Anthropic. وسعر غير مضبوط يُكتب موسوما.
     */
    let text: string
    if (extracted.kind === 'image') {
      if (vision === null) return { kind: 'skipped', sourceId: source.id, reason: 'لا مزوّد رؤية' }
      const reader = vision
      const chargeVision = async (spent: { inputTokens: number; outputTokens: number; model: string }): Promise<void> => {
        const units = spent.inputTokens + spent.outputTokens
        const priced = costOf(reader.provider, spent)
        await recordCost(deps.db, {
          provider: reader.provider.name,
          operation: priced.priced ? `vision:${spent.model}` : `vision:${spent.model}:price_unverified`,
          units,
          unitCost: units === 0 ? 0 : priced.total / units,
          refId: source.id,
          org: source.org_id,
        })
      }
      try {
        const seen = await describeImage(reader.deps, extracted.dataUrl, source.name)
        await chargeVision(seen)
        text = seen.text
      } catch (error) {
        const late = spentOf(error)
        if (late !== null) await chargeVision(late)
        const reason = error instanceof Error ? error.message : 'تعذّرت قراءة الصورة'
        const retryable = error instanceof CompatError ? error.retryable : true
        await releaseAnalysis(deps.db, source.id)
        return { kind: 'failed', sourceId: source.id, reason, retryable }
      }
    } else {
      text = extracted.text
    }

    if (text.trim().length === 0) {
      return { kind: 'skipped', sourceId: source.id, reason: 'المستند فارغ' }
    }

    // ٥ · النداء — بسلسلة المفاتيح (D-349): لكلّ مفتاحٍ سقفُه ومفتاحُه (سرُّ Worker للمدمَج ثمّ الخزانة) ونداؤه بلهجته،
    // ‏و**الكلفةُ قبل الكتابة** (D-008) باسم مفتاحها — وفي الفشل حين وصل جوابٌ ثمّ رُدّ (D-164)
    const done = await runChain<{ analysis: Analysis; cost: number }>(deps.db, list, now, async (c) => {
      const provider = c.provider
      const blocked = await checkProvider(deps.db, provider.name)
      if (blocked !== null) return { kind: 'next', why: 'cap', reason: blockerReason(blocked) }
      if (provider.kind !== 'anthropic' && provider.baseUrl === null) return { kind: 'next', why: 'nokey', reason: `لا عنوان لـ ${provider.label}` }
      const workerSecret = provider.builtin
        ? provider.name === 'anthropic' ? deps.anthropicKey : provider.name === 'gemini' ? deps.geminiKey : undefined
        : undefined
      const resolved =
        deps.encKey === undefined || deps.encKey.length === 0
          ? { key: workerSecret ?? null }
          : await resolveKey(deps.db, deps.encKey, provider.name, workerSecret)
      if (resolved.key === null || resolved.key.length === 0) return { kind: 'next', why: 'nokey', reason: `لا مفتاح لـ ${provider.label}` }
      const model = c.model !== '' ? c.model : provider.model ?? (await modelFor(deps.db, provider.name, list[0]!.model))
      const charge = chargeWith(provider)
      try {
        const result = provider.kind === 'anthropic'
          ? await analyzeText(
            { apiKey: resolved.key, model, ...(deps.fetchImpl === undefined ? {} : { fetchImpl: deps.fetchImpl }) } satisfies AnalyzeDeps,
            { name: source.name, text, now },
          )
          : await analyzeCompat(provider, resolved.key, model, { name: source.name, text, now }, deps.fetchImpl)
        // ٦ · الكلفة **قبل** الكتابة (D-008)
        return { kind: 'ok', value: { analysis: result.analysis, cost: await charge({ ...result.usage, model: result.model }) } }
      } catch (error) {
        const late = spentOf(error)
        const paid = late === null ? 0 : await charge(late)
        const why = late === null ? nextFrom(error) : null
        if (why !== null) return { kind: 'next', why, reason: error instanceof Error ? error.message : 'نداء فشل' }
        if (error instanceof AnalyzeError || error instanceof CompatError) return { kind: 'stop', reason: error.message, retryable: error.retryable, cost: paid }
        throw error
      }
    })
    if (done.kind === 'failed') {
      await releaseAnalysis(deps.db, source.id)
      return { kind: 'failed', sourceId: source.id, reason: done.reason, retryable: done.retryable }
    }
    const { analysis, cost } = done.value

    // ٧ · الكتابة — والبصمة معها، فيُعرف ما حُلِّل ولأيّ نسخة
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
    // ‏(وكلفةُ النداء سُجّلت داخل محاولته — هنا أعطالُ ما قبله: Drive والقاعدة)
    if (error instanceof AnalyzeError || error instanceof CompatError) {
      await releaseAnalysis(deps.db, source.id)
      return { kind: 'failed', sourceId: source.id, reason: error.message, retryable: error.retryable }
    }
    const reason = error instanceof Error ? error.message : 'عطل غير متوقّع'
    // عطل Drive أو القاعدة: قد ينجح لاحقا وحده
    await releaseAnalysis(deps.db, source.id)
    return { kind: 'failed', sourceId: source.id, reason, retryable: true }
  }
}

/**
 * ‏التحليلُ عند مزوّدٍ بلهجة `chat/completions` (DeepSeek وGemini وCloudflare وغيرُها).
 * ‏والمخطّطُ يُكتب في التلقين لأنّ `json_object` هو الأضعفُ الذي يفهمه الجميع —
 * ‏ثمّ يُفحص الشكلُ هنا، فجوابٌ ناقصٌ يُرَدّ بكلفته لا يُكتب تحليلًا.
 */
async function analyzeCompat(
  provider: Provider,
  apiKey: string,
  model: string,
  input: { name: string; text: string; now: Date },
  fetchImpl?: typeof fetch,
): Promise<{ analysis: Analysis; usage: Spent; model: string }> {
  const result = await chatCompletion(
    {
      baseUrl: provider.baseUrl ?? '',
      apiKey,
      model,
      system: `${SYSTEM_PROMPT}\n\nأعِد كائن JSON واحدًا فقط، بلا نصٍّ قبله ولا بعده، يطابق هذا المخطّط:\n${JSON.stringify(ANALYSIS_SCHEMA)}`,
      user: userPrompt(input),
      json: true,
      maxTokens: 8000,
      timeoutMs: 120_000,
    },
    fetchImpl,
  )
  const spent: Spent = { ...result.usage, cachedInputTokens: 0, model: result.model }
  let parsed: unknown
  try {
    parsed = JSON.parse(stripFence(result.text))
  } catch {
    throw new CompatError(`${provider.label}: الجواب ليس JSON صالحًا`, 502, true, spent)
  }
  const a = parsed as Partial<Analysis> | null
  if (a === null || typeof a !== 'object' || typeof a.summary !== 'string' || typeof a.worth_score !== 'number') {
    throw new CompatError(`${provider.label}: الجواب لا يطابق مخطّط التحليل`, 502, true, spent)
  }
  return { analysis: a as Analysis, usage: spent, model: result.model }
}

/** ‏بعضُ النماذج يلفّ JSON بسياج ```json رغم الطلب. */
function stripFence(text: string): string {
  const t = text.trim()
  const m = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(t)
  return m === null ? t : m[1]!
}

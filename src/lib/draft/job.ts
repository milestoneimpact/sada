/**
 * مهمّة الكتابة: من صفٍّ في `content_items` إلى مسوّدةٍ في `posts`.
 *
 * **الترتيب هو الحوكمة، لا تعليقٌ عليها:**
 *
 *   ١ · اقرأ المصدر وخلاصته
 *   ٢ · إن لم يُحلَّل — لا مادّة تُكتب منها
 *   ٣ · إن سُوِّدت هذه النسخةُ لهذه المنصّة — اخرج بلا نداء (D-008)
 *   ٤ · **افحص الإيقاف والسقفين وسقفَ المزوّد** — قبل أيّ نداء
 *   ٥ · نادِ المزوّد الموجَّه لمهمّة `draft`
 *   ٦ · **سجّل الكلفة**
 *   ٧ · اكتب المسوّدة بحالة `draft`
 *
 * والسادسة قبل السابعة عمدا: النداء وقع وحوسِب عليه سواء نجحت الكتابة أم
 * لا. وسجلٌّ أقلّ من الحقيقة أسوأ من سجلٍّ أعلى منها — الأوّل يُطمئن كذبا.
 * **والسادسةُ تقع في الفشل أيضًا** (D-164) حين وصل جوابٌ ثمّ رُدّ: مبتورًا
 * أو مرفوضًا أو فارغًا.
 *
 * **ولا تُنشَر مسوّدةٌ من هنا ولا تُجدوَل.** الحالةُ `draft` وحدها،
 * والقاعدةُ نفسها ترفض `queued` بلا `approved_at` — فلو أخطأتُ في كلّ
 * سطرٍ هنا لبقي ذلك القيدُ قائما.
 */
import { recordCost } from '../cost'
import { blockerReason, checkAllowance, checkProvider } from '../limits'
import { costOf, getProvider, resolveKey } from '../providers'
import { routeFor } from '../ai/routes'
import { containsUrl } from '../idempotency'
import { chatCompletion } from '../ai/openaiCompat'
import { anthropicChat } from '../ai/anthropic'
import { portableSchema } from '../ai/portableSchema'
import { spentOf, type Spent } from '../ai/spent'
import type { Db } from '../tokens'
import {
  DRAFT_SCHEMA, parseDraft, PLATFORMS, systemPrompt, userPrompt,
  type Platform, type SourceBrief,
} from './prompt'

export type DraftOutcome =
  | {
      readonly kind: 'drafted'
      readonly postId: string
      readonly platform: Platform
      readonly length: number
      readonly cost: number
    }
  /** سُوِّدت هذه النسخةُ لهذه المنصّة — لا نداء ولا كلفة. */
  | { readonly kind: 'already'; readonly postId: string }
  /** منعه الإيقاف أو سقف. قرارٌ نُفِّذ لا فشل. */
  | { readonly kind: 'blocked'; readonly reason: string }
  /** لا خلاصةَ لهذا المصدر بعد — يُحلَّل أوّلا. */
  | { readonly kind: 'not_analyzed'; readonly reason: string }
  | { readonly kind: 'failed'; readonly reason: string; readonly retryable: boolean }

export interface DraftDeps {
  readonly db: Db
  readonly encKey: string
  /** أسرارُ Worker — تغلب الخزانة دائما (D-030). */
  readonly workerSecrets: Readonly<Record<string, string | undefined>>
  /** للاختبار وحده: نداءٌ مزيَّف بدل الشبكة. */
  readonly fetchImpl?: typeof fetch
}

interface SourceRow {
  id: string
  name: string
  content_hash: string
  summary: string | null
  themes_json: string | null
  worth_score: number | null
}

/** يقرأ الخلاصة ومحاورها وبصمةَ النسخة التي حُلِّلت. */
function toBrief(row: SourceRow): { brief: SourceBrief; hash: string | null } {
  let themes: string[] = []
  let hash: string | null = null
  if (row.themes_json !== null) {
    try {
      const parsed = JSON.parse(row.themes_json) as { hash?: string; themes?: unknown }
      hash = parsed.hash ?? null
      themes = Array.isArray(parsed.themes) ? parsed.themes.map(String) : []
    } catch {
      hash = null
    }
  }
  return {
    brief: {
      name: row.name,
      summary: row.summary ?? '',
      themes,
      worth: row.worth_score ?? 0,
    },
    hash,
  }
}

/**
 * مفتاحُ عدم التكرار.
 *
 * يجمع المصدر والمنصّة وبصمة النسخة — فطلبان متزامنان على المصدر نفسه
 * لا ينجح منهما إلّا واحد، والقاعدةُ هي التي تفصل (`UNIQUE`) لا الشيفرة.
 * ونسخةٌ جديدة من المستند تعطي مفتاحا جديدا، فتُسوَّد من جديد بحقّ.
 */
export function draftKey(sourceId: string, platform: Platform, hash: string): string {
  return `draft:${sourceId}:${platform}:${hash}`
}

/** يكتب مسوّدةً واحدة لمنصّةٍ واحدة. */
export async function draftPost(
  deps: DraftDeps,
  sourceRef: string,
  platform: Platform,
): Promise<DraftOutcome> {
  const spec = PLATFORMS[platform]

  // ١ · المصدر وخلاصته
  const row = await deps.db
    .prepare(
      `SELECT s.id, s.name, s.content_hash, i.summary, i.themes_json, i.worth_score
         FROM sources s LEFT JOIN content_items i ON i.source_id = s.id
        WHERE s.id = ? OR s.drive_file_id = ?`,
    )
    .bind(sourceRef, sourceRef)
    .first<SourceRow>()

  if (row === null) return { kind: 'failed', reason: 'لا مصدر بهذا المعرّف', retryable: false }

  const { brief, hash } = toBrief(row)

  // ٢ · بلا خلاصةٍ لا مادّة
  if (hash === null || brief.summary === '') {
    return { kind: 'not_analyzed', reason: 'المصدر لم يُحلَّل بعد — حلّله أوّلا' }
  }

  // ٣ · أسُوِّدت هذه النسخةُ لهذه المنصّة؟
  const key = draftKey(row.id, platform, hash)
  const existing = await deps.db
    .prepare('SELECT id FROM posts WHERE idempotency_key = ?')
    .bind(key)
    .first<{ id: string }>()
  if (existing !== null) return { kind: 'already', postId: existing.id }

  // ٤ · الحارس العامّ قبل أيّ نداء
  const allowance = await checkAllowance(deps.db, 'draft')
  if (allowance.blocker !== null) {
    return { kind: 'blocked', reason: blockerReason(allowance.blocker) }
  }

  // المزوّد من توجيه المالك لا من ثابتٍ في الشيفرة
  const route = await routeFor(deps.db, 'draft')

  const provider = await getProvider(deps.db, route.provider)
  if (provider === null) {
    return { kind: 'failed', reason: `مزوّدٌ غير موجود: ${route.provider}`, retryable: false }
  }

  // وسقفُ المزوّد بعد الحارس العامّ لا قبله: مَن قدّم التفصيل على الجملة
  // قال «المزوّد متاح» ونظامُه موقوف
  const perProvider = await checkProvider(deps.db, provider.name)
  if (perProvider !== null) return { kind: 'blocked', reason: blockerReason(perProvider) }

  const secretName = provider.builtin
    ? provider.name === 'anthropic'
      ? 'ANTHROPIC_API_KEY'
      : provider.name === 'gemini'
        ? 'GEMINI_API_KEY'
        : undefined
    : undefined
  const resolved = await resolveKey(
    deps.db,
    deps.encKey,
    provider.name,
    secretName === undefined ? undefined : deps.workerSecrets[secretName],
  )
  if (resolved.key === null) {
    return { kind: 'failed', reason: `لا مفتاح لـ ${provider.label}`, retryable: false }
  }

  // خطوةُ الكلفة (٦) تُعرَّف قبل النداء: يحتاجها الجوابُ الناجح، والجوابُ
  // الذي وصل ثمّ رُدّ (D-164). صفٌّ واحدٌ بشكلٍ واحد
  const charge = async (spent: Spent): Promise<number> => {
    const priced = costOf(provider, spent)
    const units = spent.inputTokens + spent.cachedInputTokens + spent.outputTokens
    await recordCost(deps.db, {
      provider: provider.name,
      operation: `draft:${platform}:${spent.model}`,
      units,
      // سعرُ الوحدة مشتقٌّ لا مفترَض: مزوّدٌ بلا سعرٍ مضبوط يعطي صفرا
      unitCost: units === 0 ? 0 : priced.total / units,
      refId: row.id,
    })
    return priced.total
  }

  // ٥ · النداء — بلهجة المزوّد
  let text: string
  let spent: Spent
  try {
    if (provider.kind === 'anthropic') {
      const result = await anthropicChat({
        apiKey: resolved.key,
        model: route.model,
        system: systemPrompt(spec),
        user: userPrompt(brief),
        // المحمولُ لا الخامّ (D-164): `minLength` يُطوى وصفًا، وحدُّه في `parseDraft`
        schema: portableSchema(DRAFT_SCHEMA),
        ...(deps.fetchImpl === undefined ? {} : { fetchImpl: deps.fetchImpl }),
      })
      text = result.text
      spent = result
    } else {
      if (provider.baseUrl === null) {
        return { kind: 'failed', reason: 'لا عنوان لهذا المزوّد', retryable: false }
      }
      const result = await chatCompletion(
        {
          baseUrl: provider.baseUrl,
          apiKey: resolved.key,
          model: route.model,
          system: systemPrompt(spec),
          user: userPrompt(brief),
          json: true,
        },
        deps.fetchImpl ?? fetch,
      )
      text = result.text
      spent = { ...result.usage, cachedInputTokens: 0, model: result.model }
    }
  } catch (error) {
    // جوابٌ وصل ثمّ رُدّ حوسِب عليه: يُكتب قبل أن يُعاد الفشل (D-164)
    const late = spentOf(error)
    if (late !== null) await charge(late)
    const retryable =
      typeof error === 'object' && error !== null && 'retryable' in error
        ? Boolean((error as { retryable: unknown }).retryable)
        : true
    return {
      kind: 'failed',
      reason: error instanceof Error ? error.message : 'نداءٌ فشل',
      retryable,
    }
  }

  // ٦ · **الكلفة قبل الكتابة** — النداءُ وقع وحوسِب عليه
  const cost = await charge(spent)
  const ran = spent.model

  // القراءةُ بعد التسجيل: نصٌّ مشوَّه لا يُلغي كلفةً وقعت
  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(text)
  } catch {
    return { kind: 'failed', reason: 'جوابُ النموذج ليس JSON صالحا', retryable: true }
  }
  const draft = parseDraft(parsedJson, spec)
  if (!draft.ok) return { kind: 'failed', reason: draft.reason, retryable: true }

  // ٧ · المسوّدة — `draft` وحدها، بلا حسابٍ وبلا موعد
  const postId = crypto.randomUUID()
  try {
    await deps.db
      .prepare(
        `INSERT INTO posts
           (id, platform, source_id, source_hash, model, cost_usd, type, text,
            source_refs, rationale, has_url, status, idempotency_key)
         VALUES (?, ?, ?, ?, ?, ?, 'text', ?, ?, ?, ?, 'draft', ?)`,
      )
      .bind(
        postId,
        platform,
        row.id,
        hash,
        ran,
        cost,
        draft.draft.text,
        JSON.stringify([row.id]),
        draft.draft.rationale,
        // **صفرٌ كان مكتوبا هنا حرفا** — و`ARCHITECTURE.md §٤` تقول إنّه
        // «يُحسَب بالشيفرة لا بالنموذج ويُعرَض في اللوحة مع تكلفته على
        // X». فكان يُحسَب عند النشر (بعد الاعتماد) ولا يُعرَض قطّ (D-069)
        containsUrl(draft.draft.text) ? 1 : 0,
        key,
      )
      .run()
  } catch (error) {
    // سباقٌ على المفتاح نفسه: الآخرُ سبق، وهذا ليس فشلا
    const message = error instanceof Error ? error.message : ''
    if (message.includes('UNIQUE')) {
      const won = await deps.db
        .prepare('SELECT id FROM posts WHERE idempotency_key = ?')
        .bind(key)
        .first<{ id: string }>()
      if (won !== null) return { kind: 'already', postId: won.id }
    }
    return { kind: 'failed', reason: `تعذّرت كتابة المسوّدة: ${message}`, retryable: false }
  }

  return {
    kind: 'drafted',
    postId,
    platform,
    length: draft.draft.text.length,
    cost,
  }
}

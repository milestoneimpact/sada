/**
 * مهمّة الكتابة: من صفٍّ في `content_items` إلى مسوّدةٍ في `posts`.
 *
 * **الترتيب هو الحوكمة، لا تعليقٌ عليها:**
 *
 *   ١ · اقرأ المصدر وخلاصته
 *   ٢ · إن لم يُحلَّل — لا مادّة تُكتب منها
 *   ٣ · إن سُوِّدت هذه النسخةُ لهذه المنصّة ولم تُرفَض — اخرج بلا نداء (D-008)
 *   ٤ · **افحص الإيقاف والسقفين وسقفَ المزوّد** — قبل أيّ نداء
 *   ٥ · نادِ المزوّد الموجَّه لمهمّة `draft`
 *   ٦ · **سجّل الكلفة**
 *   ٧ · اكتب المسوّدة بحالة `draft`
 *
 * والرابعةُ إلى السادسة في `writer.ts` مرّةً لا هنا (D-190): **وبابٌ ثانٍ يقرؤها** —
 * `draftFromIdea`، المسوّدةُ من فكرة المالك بكلماته بدل خلاصة مصدر.
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
import { readBrief, voiceSection } from '../brief'
import { containsUrl } from '../idempotency'
import { digest } from '../security/digest'
import { atomically, type Db, type DbStatement } from '../tokens'
import {
  DRAFT_SCHEMA, ideaPrompt, parseDraft, PLATFORMS, systemPrompt, userPrompt,
  type Draft, type Platform, type PlatformSpec, type SourceBrief,
} from './prompt'
import { writeOnce, type WriterDeps } from './writer'

export type DraftOutcome =
  | {
      readonly kind: 'drafted'
      readonly postId: string
      readonly platform: Platform
      readonly length: number
      readonly cost: number
    }
  /** سُوِّدت هذه النسخةُ لهذه المنصّة ولم تُرفَض — لا نداء ولا كلفة. */
  | { readonly kind: 'already'; readonly postId: string }
  /** منعه الإيقاف أو سقف. قرارٌ نُفِّذ لا فشل. */
  | { readonly kind: 'blocked'; readonly reason: string }
  /** لا خلاصةَ لهذا المصدر بعد — يُحلَّل أوّلا. */
  | { readonly kind: 'not_analyzed'; readonly reason: string }
  /** و`cost` ما دُفع في الدفتر قبل أن يُردّ الجواب (D-164) — يُقال في الإشعار ولا يُسكَت عنه. */
  | { readonly kind: 'failed'; readonly reason: string; readonly retryable: boolean; readonly cost?: number }

/** ما تحتاجه الكتابة — وهو ما يحتاجه نداؤها الواحد (`writer.ts`). */
/** والمنظّمةُ اختياريّة (D-257): منها موجزُ العميل وصوتُه. وغيابُها المالك. */
export type DraftDeps = WriterDeps & { readonly org?: string }

interface SourceRow {
  id: string
  name: string
  content_hash: string
  summary: string | null
  themes_json: string | null
  worth_score: number | null
  org_id: string | null
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
export function draftKey(
  sourceId: string,
  platform: Platform,
  hash: string,
  /**
   * مزوّد اختاره المالك لهذه الكتابة، للمقارنة (D-244). وغيابه يُبقي المفتاح
   * كما كان حرفا: ما كُتب قبل اليوم يبقى معروفا ولا تُدفَع كلفته مرّتين.
   * وحضوره يفتح نسخة واحدة لكلّ مزوّد، والثانية بالمزوّد نفسه `already`.
   */
  provider?: string,
): string {
  const base = `draft:${sourceId}:${platform}:${hash}`
  return provider === undefined || provider === '' ? base : `${base}:${provider}`
}

/** يكتب مسوّدةً واحدة لمنصّةٍ واحدة. */
export async function draftPost(
  deps: DraftDeps,
  sourceRef: string,
  platform: Platform,
  /** مزوّد يغلب التوجيه لهذه الكتابة وحدها (D-244) — مقارنة لا تبديل. */
  provider?: string,
): Promise<DraftOutcome> {
  const spec = PLATFORMS[platform]

  // ١ · المصدر وخلاصته
  const row = await deps.db
    .prepare(
      `SELECT s.id, s.name, s.content_hash, i.summary, i.themes_json, i.worth_score, s.org_id
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
  /*
   * **والمرفوضةُ لا تُعدّ** — كما في الصور (D-087 · D-088) ومقاطع المالك.
   *
   * كان المفتاحُ يُطابَق أيًّا كانت حالُ المنشور: من رفض مسوّدةً ثمّ ضغط «اكتب مسوّدة»
   * قيل له «✓ سُوّدت هذه النسخة — لم يُنفَق شيء» ولم يُكتب شيء، **ولا طريقَ إلى صياغةٍ
   * أخرى إلّا بتعديل المستند في Drive**. فالمرفوضُ يبقى صفًّا بكلفته، ويُحرَّر مفتاحُه
   * لحظةَ تُكتب البديلة (الخطوة ٧) لا قبلها. **وحارسُ النقرة المزدوجة باقٍ**: ما دامت
   * البديلةُ قائمةً بالمفتاح نفسه، فالضغطةُ التالية `already`.
   */
  // ‏والمسوّدةُ في منظّمة مصدرها (D-271): بها يُسأل عن المفتاح وبها يُكتب الصفّ
  const org = row.org_id ?? 'org_owner'
  const key = draftKey(row.id, platform, hash, provider)
  const existing = await deps.db
    .prepare('SELECT id, status FROM posts WHERE idempotency_key = ? AND org_id = ?')
    .bind(key, org)
    .first<{ id: string; status: string }>()
  if (existing !== null && existing.status !== 'rejected') return { kind: 'already', postId: existing.id }

  // ٤ إلى ٦ · الحارسُ والمزوّدُ والنداءُ والكلفة — في موضعها الواحد (`writer.ts`)
  const out = await writeOnce(deps, {
    // ‏وصوتُ العميل من موجز منظّمة المصدر (D-257) — وفارغٌ إن لم يُكتب، فالموجّهُ كما كان
    system: systemPrompt(spec, 'source', voiceSection(await readBrief(deps.db, org))),
    user: userPrompt(brief),
    schema: DRAFT_SCHEMA,
    operation: `draft:${platform}`,
    refId: row.id,
    ...(provider === undefined || provider === '' ? {} : { provider }),
  })
  if (out.kind !== 'written') return out

  // القراءةُ بعد التسجيل: نصٌّ مشوَّه لا يُلغي كلفةً وقعت — ويُقال ما دُفع فيه
  const draft = readDraft(out.text, spec)
  if (!draft.ok) return { kind: 'failed', reason: draft.reason, retryable: true, cost: out.cost }

  // ٧ · المسوّدة — `draft` وحدها، بلا حسابٍ وبلا موعد
  return insertDraft(deps.db, org, {
    platform, key, existing, sourceId: row.id, sourceHash: hash, refs: [row.id],
    model: out.model, cost: out.cost, draft: draft.draft,
  })
}
/** يقرأ جوابَ النموذج منشورًا — **بعد أن سُجّلت كلفتُه**، فنصٌّ مشوَّهٌ لا يُلغي ما وقع. */
function readDraft(text: string, spec: PlatformSpec): { ok: true; draft: Draft } | { ok: false; reason: string } {
  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(text)
  } catch {
    return { ok: false, reason: 'جواب النموذج ليس JSON صالحا' }
  }
  return parseDraft(parsedJson, spec)
}

interface NewDraft {
  readonly platform: Platform
  readonly key: string
  /** صفٌّ بالمفتاح نفسِه — مرفوضٌ يُحرَّر مفتاحُه في المعاملة نفسِها، أو `null`. */
  readonly existing: { readonly id: string; readonly status: string } | null
  readonly sourceId: string | null
  readonly sourceHash: string | null
  readonly refs: readonly string[]
  readonly model: string
  readonly cost: number
  readonly draft: Draft
}

/**
 * ٧ · المسوّدة — `draft` وحدها، بلا حسابٍ وبلا موعد. **ومشتركةٌ بين البابين**: المصدرُ
 * والفكرة يكتبان الصفَّ نفسَه بالقيود نفسِها، فلا يفترق ما يُحرَّر به المرفوضُ بينهما.
 */
async function insertDraft(db: Db, org: string, input: NewDraft): Promise<DraftOutcome> {
  const postId = crypto.randomUUID()
  const statements: DbStatement[] = []
  if (input.existing !== null) {
    // ‏المرفوضُ يُحرِّر مفتاحَه في المعاملة نفسِها — **وشرطُ الحال فيها**: مرفوضةٌ أُعيدت
    // ‏بـ «تراجَع» بين القراءة والكتابة تبقى بمفتاحها، فيصطدم الإدراجُ بالقيد ويُقال `already`
    statements.push(db
      .prepare(`UPDATE posts SET idempotency_key = idempotency_key || ':rejected:' || id
                 WHERE id = ? AND org_id = ? AND status = 'rejected'`)
      .bind(input.existing.id, org))
  }
  try {
    statements.push(db
      .prepare(
        `INSERT INTO posts
           (id, platform, source_id, source_hash, model, cost_usd, type, text,
            source_refs, rationale, has_url, status, idempotency_key, org_id, brand_id)
         VALUES (?, ?, ?, ?, ?, ?, 'text', ?, ?, ?, ?, 'draft', ?,
                 -- ‏المسوّدة لمنظّمة مصدرها — أو منظّمة الجلسة لفكرةٍ بلا مصدر (D-271) — وعلامته
                 ?,
                 coalesce((SELECT brand_id FROM sources WHERE id = ?), 'brand_owner'))`,
      )
      .bind(
        postId,
        input.platform,
        input.sourceId,
        input.sourceHash,
        input.model,
        input.cost,
        input.draft.text,
        JSON.stringify(input.refs),
        input.draft.rationale,
        // **صفرٌ كان مكتوبا هنا حرفا** — و`ARCHITECTURE.md §٤` تقول إنّه
        // «يُحسَب بالشيفرة لا بالنموذج ويُعرَض في اللوحة مع تكلفته على
        // X». فكان يُحسَب عند النشر (بعد الاعتماد) ولا يُعرَض قطّ (D-069)
        containsUrl(input.draft.text) ? 1 : 0,
        input.key,
        org,
        input.sourceId,
      ))
    await atomically(db, statements)
  } catch (error) {
    // سباقٌ على المفتاح نفسه: الآخرُ سبق، وهذا ليس فشلا
    const message = error instanceof Error ? error.message : ''
    if (message.includes('UNIQUE')) {
      const won = await db
        .prepare('SELECT id FROM posts WHERE idempotency_key = ? AND org_id = ?')
        .bind(input.key, org)
        .first<{ id: string }>()
      if (won !== null) return { kind: 'already', postId: won.id }
    }
    return { kind: 'failed', reason: `تعذّرت كتابة المسوّدة: ${message}`, retryable: false, cost: input.cost }
  }

  return {
    kind: 'drafted',
    postId,
    platform: input.platform,
    length: input.draft.text.length,
    cost: input.cost,
  }
}

// ── من فكرة المالك (D-190) ─────────────────────────────────────────────

/** أقصرُ فكرةٍ تُكتب منها مسوّدة، وأطولُها — بالمحرف بعد طيّ الفراغ. */
export const IDEA_MIN = 4
export const IDEA_MAX = 1000

/**
 * الفكرةُ كما تُوزَن — **مطويّةَ الفراغ**: «الحوكمة  تحمي» و«الحوكمة تحمي» فكرةٌ واحدة،
 * وضغطةٌ ثانيةٌ بمسافةٍ زائدة لا تصنع نداءً ثانيًا ولا مسوّدةً ثانية.
 */
export function normalizeIdea(raw: string): string {
  return raw.normalize('NFC').replace(/\s+/gu, ' ').trim()
}

/** ما يمنع الفكرةَ قبل أيّ نداء — أو `null`. ويقرؤه المسارُ قبل أن يدور على المنصّات. */
export function ideaProblem(raw: string): string | null {
  const idea = normalizeIdea(raw)
  if (idea.length < IDEA_MIN) return 'اكتب فكرتك بجملة أو كلمات قليلة أوّلًا'
  if (idea.length > IDEA_MAX) return `الفكرة أطول من ${IDEA_MAX} محرف — اختصرها في جمل قليلة`
  return null
}

/**
 * مفتاحُ عدم التكرار للفكرة (D-004) — **بصمتُها ومنصّتُها**، لا نصُّها.
 *
 * فالفكرةُ نفسُها للمنصّة نفسِها لا تُكتب مرّتين ما دامت مسوّدتُها قائمة، والقاعدةُ هي
 * التي تفصل (`UNIQUE`). وبصمةٌ لا نصّ: المفتاحُ يُقرأ في سجلّ النشر وصفوف المحاولات،
 * وفكرةُ المالك لا تُنسَخ إلى كلّ موضعٍ يُطبَع فيه المفتاح.
 */
export async function ideaKey(idea: string, platform: Platform): Promise<string> {
  const bytes = await digest(normalizeIdea(idea))
  const hex = Array.from(bytes.slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('')
  return `idea:${hex}:${platform}`
}

/**
 * مسوّدةٌ من فكرة المالك — **البابُ نفسُه بمادّةٍ أخرى** (D-190).
 *
 * قال المالك: «يُفترض أن تكون الكتابةُ أسهل، وتنشأ من نصٍّ أو كلماتٍ بسيطة». وكانت لا تبدأ
 * إلّا من مستندٍ في Drive حُلّل. فالفكرةُ هنا مادّةُ الكتابة بدل الخلاصة، **وكلُّ ما سواها
 * كما هو**: وصفُ المنصّة وحدُّها، والحارسُ وسقفاه وسقفُ المزوّد، والكلفةُ قبل المسوّدة،
 * والحالُ `draft` وحدها، والمرفوضُ يُحرِّر مفتاحَه.
 */
export async function draftFromIdea(
  deps: DraftDeps,
  rawIdea: string,
  platform: Platform,
): Promise<DraftOutcome> {
  const spec = PLATFORMS[platform]
  const idea = normalizeIdea(rawIdea)
  const problem = ideaProblem(idea)
  if (problem !== null) return { kind: 'failed', reason: problem, retryable: false }

  // أكُتبت هذه الفكرةُ لهذه المنصّة ولم تُرفَض؟ — لا نداءَ ولا كلفة
  // ‏وفكرةٌ بلا مصدرٍ تُكتب في منظّمة الجلسة (D-271)
  const org = deps.org ?? 'org_owner'
  const key = await ideaKey(idea, platform)
  const existing = await deps.db
    .prepare('SELECT id, status FROM posts WHERE idempotency_key = ? AND org_id = ?')
    .bind(key, org)
    .first<{ id: string; status: string }>()
  if (existing !== null && existing.status !== 'rejected') return { kind: 'already', postId: existing.id }

  // ‏والدفترُ يُنسَب إلى الفكرة ببصمتها لا إلى المنشور (كالمصدر): كلفةُ الكتابة في
  // ‏`cost_usd` على الصفّ، ونسبتُها إلى المنشور في الدفتر أيضًا تعدّها مرّتين على شاشته
  const out = await writeOnce(deps, {
    system: systemPrompt(spec, 'idea', voiceSection(await readBrief(deps.db, org))),
    user: ideaPrompt(idea),
    schema: DRAFT_SCHEMA,
    operation: `draft:${platform}`,
    refId: key.slice(0, key.lastIndexOf(':')),
  })
  if (out.kind !== 'written') return out

  const draft = readDraft(out.text, spec)
  if (!draft.ok) return { kind: 'failed', reason: draft.reason, retryable: true, cost: out.cost }

  return insertDraft(deps.db, org, {
    platform, key, existing, sourceId: null, sourceHash: null, refs: [],
    model: out.model, cost: out.cost, draft: draft.draft,
  })
}

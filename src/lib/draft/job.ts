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
import type { Role } from '../ownerEmail'
import {
  DRAFT_SCHEMA, ideaPrompt, parseDraft, PLATFORMS, systemPrompt, userPrompt,
  type Draft, type Platform, type PlatformSpec, type SourceBrief,
} from './prompt'
import { writeOnce, type WriterDeps } from './writer'
import { textProblem } from './store'
import { isThread, threadProblem, tweetsOf } from './thread'

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

/**
 * ‏شكلُ ما يُكتب (D-324): منشورٌ واحد، أو **سلسلةُ X** لبندٍ في الخطّة طُلب سلسلة. والسلسلةُ لـ X وحدها، ومفتاحُها غيرُ
 * ‏مفتاح التغريدة (`:thread`) فالبندان من المصدر نفسِه لا يلتقيان.
 */
export type DraftShape = 'single' | 'thread'

/** يكتب مسوّدةً واحدة لمنصّةٍ واحدة. */
export async function draftPost(
  deps: DraftDeps,
  sourceRef: string,
  platform: Platform,
  /** مزوّد يغلب التوجيه لهذه الكتابة وحدها (D-244) — مقارنة لا تبديل. */
  provider?: string,
  shape: DraftShape = 'single',
  /**
   * بندُ الخطّة الذي تُكتب له (D-329): معرّفُه يدخل المفتاحَ (`:i:<id>`) فمسوّدتان من المصدر نفسِه على المنصّة نفسِها لا تلتقيان،
   * وزاويتُه تدخل الموجّه فلا تُكتبان نصًّا واحدًا. وغيابُه الكتابةُ من المصدر كما كانت، بمفتاحها كما كان حرفًا.
   */
  angle?: { readonly id: string; readonly text: string },
): Promise<DraftOutcome> {
  const spec = PLATFORMS[platform]
  const thread = shape === 'thread' && platform === 'x'

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
  // ‏والمسوّدةُ في منظّمة مصدرها (D-277): بها يُسأل عن المفتاح وبها يُكتب الصفّ
  const org = row.org_id ?? 'org_owner'
  const key = `${draftKey(row.id, platform, hash, provider)}${angle === undefined ? '' : `:i:${angle.id}`}${thread ? ':thread' : ''}`
  const existing = await deps.db
    .prepare('SELECT id, status FROM posts WHERE idempotency_key = ? AND org_id = ?')
    .bind(key, org)
    .first<{ id: string; status: string }>()
  if (existing !== null && existing.status !== 'rejected') return { kind: 'already', postId: existing.id }

  // ٤ إلى ٦ · الحارسُ والمزوّدُ والنداءُ والكلفة — في موضعها الواحد (`writer.ts`)
  const out = await writeOnce(deps, {
    org,
    // ‏وصوتُ العميل من موجز منظّمة المصدر (D-257) — وفارغٌ إن لم يُكتب، فالموجّهُ كما كان
    system: systemPrompt(spec, 'source', voiceSection(await readBrief(deps.db, org)), thread),
    user: userPrompt(brief, thread, angle?.text ?? ''),
    schema: DRAFT_SCHEMA,
    operation: `draft:${platform}`,
    refId: row.id,
    ...(provider === undefined || provider === '' ? {} : { provider }),
  })
  if (out.kind !== 'written') return out

  // القراءةُ بعد التسجيل: نصٌّ مشوَّه لا يُلغي كلفةً وقعت — ويُقال ما دُفع فيه
  const draft = readDraft(out.text, spec, thread)
  if (!draft.ok) return { kind: 'failed', reason: draft.reason, retryable: true, cost: out.cost }

  // ٧ · المسوّدة — `draft` وحدها، بلا حسابٍ وبلا موعد
  return insertDraft(deps.db, org, {
    platform, key, existing, sourceId: row.id, sourceHash: hash, refs: [row.id],
    model: out.model, cost: out.cost, draft: draft.draft,
  })
}
/**
 * يقرأ جوابَ النموذج منشورًا — **بعد أن سُجّلت كلفتُه**، فنصٌّ مشوَّهٌ لا يُلغي ما وقع.
 * ‏**والسلسلةُ تغريدةً تغريدة** (D-324): تغريدتان فأكثر، وكلٌّ بحدّها — لا النصُّ كلُّه على 280.
 */
function readDraft(text: string, spec: PlatformSpec, thread = false): { ok: true; draft: Draft } | { ok: false; reason: string } {
  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(text)
  } catch {
    return { ok: false, reason: 'جواب النموذج ليس JSON صالحا' }
  }
  if (!thread) return parseDraft(parsedJson, spec)
  const value = (typeof parsedJson === 'object' && parsedJson !== null ? parsedJson : {}) as Partial<Draft>
  const body = typeof value.text === 'string' ? value.text.replace(/\r\n?/g, '\n').trim() : ''
  if (body.length < 40) return { ok: false, reason: 'النصّ فارغ أو أقصر من أن يكون منشورا' }
  if (tweetsOf('x', body).length < 2) return { ok: false, reason: 'طُلبت سلسلة فجاء الجوابُ تغريدةً واحدة' }
  const problem = threadProblem(body)
  if (problem !== null) return { ok: false, reason: problem }
  return { ok: true, draft: { text: body, rationale: typeof value.rationale === 'string' ? value.rationale.trim() : '' } }
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
  /** ‏والسببُ `null` لنصّ المالك (D-324): لا زاويةَ اختارها نموذج. */
  readonly draft: { readonly text: string; readonly rationale: string | null }
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
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?,
                 -- ‏المسوّدة لمنظّمة مصدرها — أو منظّمة الجلسة لفكرةٍ بلا مصدر — وعلامته
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
        // ‏ونصُّ X بفاصل `---` سلسلة (D-324) — النوعُ يتبع النصّ كما في «احفظ» و«اعتمد»
        isThread(input.platform, input.draft.text) ? 'thread' : 'text',
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
      // ‏**ولا يُقال خطأُ القاعدة كما هو** (مراجعة D-324): مفتاحٌ مأخوذٌ خارجَ المنظّمة خبرٌ عن غيرها لا يُعرض
      return { kind: 'failed', reason: 'تعذّرت كتابة المسوّدة — أعد المحاولة', retryable: false, cost: input.cost }
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
export async function ideaKey(idea: string, platform: Platform, org = 'org_owner'): Promise<string> {
  // ‏**والمنظّمةُ في البصمة** (مراجعة D-324): المفتاحُ فريدٌ على الجدول كلّه (0022)، فالفكرةُ نفسُها في منظّمتين كانت تصطدم —
  // ‏بعد النداء المدفوع — ويُقال للثانية خطأُ القاعدة كما هو، وهو يخبرها أنّ أخرى كتبت هذه الفكرة
  const bytes = await digest(`${org}\n${normalizeIdea(idea)}`)
  return `idea:${hex16(bytes)}:${platform}`
}

/** ‏مفتاحُ الفكرة قبل مراجعة D-324 — بلا منظّمة. يُسأل عنه مع الجديد فلا تُكتب فكرةٌ قديمةٌ ثانيةً ولا يُدفع نداؤها مرّتين. */
async function legacyIdeaKey(idea: string, platform: Platform): Promise<string> {
  return `idea:${hex16(await digest(normalizeIdea(idea)))}:${platform}`
}

function hex16(bytes: Uint8Array): string {
  return Array.from(bytes.slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('')
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
  /** ‏سلسلةُ X لبندٍ في الخطّة (D-324) — كما في `draftPost`. */
  shape: DraftShape = 'single',
): Promise<DraftOutcome> {
  const spec = PLATFORMS[platform]
  const thread = shape === 'thread' && platform === 'x'
  const idea = normalizeIdea(rawIdea)
  const problem = ideaProblem(idea)
  if (problem !== null) return { kind: 'failed', reason: problem, retryable: false }

  // أكُتبت هذه الفكرةُ لهذه المنصّة ولم تُرفَض؟ — لا نداءَ ولا كلفة
  // ‏وفكرةٌ بلا مصدرٍ تُكتب في منظّمة الجلسة (D-277)
  const org = deps.org ?? 'org_owner'
  const base = await ideaKey(idea, platform, org)
  const key = `${base}${thread ? ':thread' : ''}`
  const legacy = `${await legacyIdeaKey(idea, platform)}${thread ? ':thread' : ''}`
  // ‏والمفتاحُ القديم يُسأل عنه في المنظّمة نفسِها: ما كُتب قبل المراجعة لا يُكتب ثانيةً ولا يُدفع نداؤه مرّتين
  const existing = await deps.db
    .prepare(`SELECT id, status FROM posts WHERE idempotency_key IN (?1, ?2) AND org_id = ?3
               ORDER BY (status = 'rejected'), (idempotency_key = ?1) DESC LIMIT 1`)
    .bind(key, legacy, org)
    .first<{ id: string; status: string }>()
  if (existing !== null && existing.status !== 'rejected') return { kind: 'already', postId: existing.id }

  // ‏والدفترُ يُنسَب إلى الفكرة ببصمتها لا إلى المنشور (كالمصدر): كلفةُ الكتابة في
  // ‏`cost_usd` على الصفّ، ونسبتُها إلى المنشور في الدفتر أيضًا تعدّها مرّتين على شاشته
  const out = await writeOnce(deps, {
    org,
    system: systemPrompt(spec, 'idea', voiceSection(await readBrief(deps.db, org)), thread),
    user: ideaPrompt(idea, thread),
    schema: DRAFT_SCHEMA,
    operation: `draft:${platform}`,
    refId: base.slice(0, base.lastIndexOf(':')),
  })
  if (out.kind !== 'written') return out

  const draft = readDraft(out.text, spec, thread)
  if (!draft.ok) return { kind: 'failed', reason: draft.reason, retryable: true, cost: out.cost }

  return insertDraft(deps.db, org, {
    platform, key, existing, sourceId: null, sourceHash: null, refs: [],
    model: out.model, cost: out.cost, draft: draft.draft,
  })
}

// ── «بنفسي» — نصُّ المالك كما كتبه (D-324) ─────────────────────────────

/** المنصّاتُ التي يُكتب لها بنفسك — المكتوبةُ وحدَها، كما في «من فكرة»: نصُّ المقطع له صفُّ المقطع. */
export const OWN_PLATFORMS = ['linkedin', 'x'] as const
export type OwnPlatform = (typeof OWN_PLATFORMS)[number]

/**
 * ‏مفتاحُ عدم التكرار لنصّ المالك (D-004) — **بصمتُه ومنصّتُه** لا نصُّه، كمفتاح الفكرة: ضغطةٌ ثانيةٌ بالنصّ نفسِه لا تصنع
 * ‏مسوّدةً ثانية، والنصُّ لا يُنسَخ إلى كلّ موضعٍ يُطبَع فيه المفتاح.
 */
export async function ownKey(org: string, text: string, platform: OwnPlatform): Promise<string> {
  // ‏**والمنظّمةُ في البصمة** (مراجعة D-324): وكالةٌ تكتب الإعلانَ نفسَه لعميلين كانت مسوّدةُ الثاني تُردّ بخطأ القاعدة
  return `own:${hex16(await digest(`${org}\n${platform}\n${text}`))}:${platform}`
}

/**
 * ‏**«بنفسي»** (D-324) — المالكُ يكتب منشورَه، فيُحفَظ مسوّدةً **كما كتبه**: بلا نداءٍ ولا كلفةٍ ولا صفٍّ في الدفتر
 * ‏(`model = 'owner'`، كما يكتب «أنت» على ما رفعه). والفحصُ فحصُ «احفظ» و«اعتمد» نفسُه (`textProblem`) بحدّ كلّ منصّة —
 * ‏وسلسلةُ X تغريدةً تغريدة — والحالُ `draft` وحدها، فيمرّ بالاعتماد كأيّ مسوّدة (D-009). والأسطرُ توحَّد وتُقصّ الأطرافُ
 * ‏كما في الاعتماد، **وما سوى ذلك حرفُه**.
 *
 * ‏**ولا حارسَ إنفاق هنا ولا ينبغي**: لا شيءَ يُنفَق. فلا يمرّ بـ `checkAllowance`، ولا يتبع ما يُقيَّد من الكتابة المدفوعة.
 */
export async function draftFromOwner(
  db: Db,
  org: string,
  platform: OwnPlatform,
  raw: string,
  /** ‏دورُ من كتبها (مراجعة D-324): «بنفسي» للمحرّر أيضًا، فيُحفظ في مراجعها `by:<الدور>` ويُقال «كتبها المحرّر» لا «أنت». */
  by?: Role,
): Promise<DraftOutcome> {
  const text = raw.replace(/\r\n?/g, '\n').trim()
  const problem = textProblem(platform, text)
  if (problem !== null) return { kind: 'failed', reason: problem, retryable: false }
  const key = await ownKey(org, text, platform)
  const existing = await db
    .prepare('SELECT id, status FROM posts WHERE idempotency_key = ? AND org_id = ?')
    .bind(key, org)
    .first<{ id: string; status: string }>()
  if (existing !== null && existing.status !== 'rejected') return { kind: 'already', postId: existing.id }
  return insertDraft(db, org, {
    platform, key, existing, sourceId: null, sourceHash: null,
    // ‏والمالكُ «أنت» كما في كلّ اللوحة (`deciderText`)، فلا يُكتب دورُه
    refs: by === undefined || by === 'owner' ? [] : [`by:${by}`],
    model: 'owner', cost: 0, draft: { text, rationale: null },
  })
}

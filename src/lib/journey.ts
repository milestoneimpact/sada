/**
 * رحلةُ المنشور — **من الملفّ إلى الأثر** (D-104).
 *
 * ## لماذا شاشة
 *
 * صدى **يُنفق**. والمالكُ يسأل عن منشورٍ واحد أسئلةً بسيطة: من أين جاء؟
 * وكم كلّف؟ وماذا أعاد؟
 *
 * **والجوابُ اليومَ في ستّة جداول**: `sources` و `content_items` و
 * `posts` و `media` و `publish_attempts` و `metrics` و `cost_ledger`.
 * ولا شاشةَ تجمعها. **والبياناتُ كلُّها موجودة — الناقصُ روايتُها.**
 *
 * ## وكلُّ محطّةٍ مشتقّةٌ من صفٍّ حقيقيّ
 *
 * **ولا محطّةَ تُخترَع لتكتمل الصورة.** فمنشورٌ لم يُنشَر ليس له محطّةُ
 * نشرٍ فارغة — **له غيابُها**، وذاك خبرٌ في نفسه.
 *
 * ## و«لا يُقاس» ليست صفرا
 *
 * قاعدةُ D-048 و D-058 تُوَرَّث حرفا: LinkedIn لا يعطي الظهورَ لمنشور
 * عضو، **فعمودُه `null` لا صفر**. وصفرٌ يقول «قِيس فكان لا شيء»، و`null`
 * تقول «لا يُقاس أصلا» — **والفرقُ بينهما هو الفرقُ بين منشورٍ فاشلٍ
 * ومنشورٍ لا نعرف عنه**.
 */
import { deciderText } from './decider'
import type { Db } from './tokens'
import { kb } from './format'

/** محطّةٌ في الرحلة — **ولا تُنشأ إلّا من صفّ**. */
export interface Station {
  /** مفتاحٌ ثابت — تعرفه الواجهةُ لترسم له أيقونتَه. */
  readonly kind:
    | 'source' | 'analysis' | 'draft' | 'image'
    | 'decision' | 'schedule' | 'publish' | 'metrics'
  readonly title: string
  /** متى وقعت — بصيغة القاعدة (UTC)، أو `null` إن لم يُختَم لها وقت. */
  readonly at: string | null
  /** سطرٌ يقول ما وقع — لا وصفٌ عامّ. */
  readonly detail: string
  /** ما دُفع في هذه المحطّة — و`null` أنّها لا تكلّف، لا أنّها مجّانيّة. */
  readonly cost: number | null
  /** النموذجُ الذي نفّذها إن كان لها نموذج. */
  readonly model: string | null
  readonly state: 'done' | 'failed' | 'pending'
}

export interface Journey {
  readonly postId: string
  readonly platform: string
  readonly text: string
  readonly status: string
  readonly stations: readonly Station[]
  /** مجموعُ ما دُفع — **من الدفتر لا من جمع المحطّات**. */
  readonly spent: number
}

interface PostRow {
  id: string
  platform: string
  text: string
  status: string
  model: string | null
  cost_usd: number
  rationale: string | null
  created_at: string
  approved_by: string | null
  approved_at: string | null
  scheduled_at: string | null
  dispatched_at: string | null
  source_id: string | null
  source_name: string | null
  last_seen_at: string | null
  summary: string | null
  worth_score: number | null
  extracted_at: string | null
  account_name: string | null
}

/** حالُ المسوّدة بلسانٍ يفهمه المالك — لا باسم العمود. */
const DECISION: Readonly<Record<string, { title: string; detail: string }>> = {
  approved: { title: 'اعتمدتَها', detail: 'كما كُتبت، بلا تعديل' },
  edited: { title: 'اعتمدتَها بعد تعديل', detail: 'النصّ المعتمَد نصُّك أنت' },
  rejected: { title: 'رفضتَها', detail: 'وتبقى بكلفتها — فما دُفع ثمنُه يُرى' },
}

/**
 * حالُ المحاولة بلسانٍ يفهمه المالك — **واسمُ العمود ليس جوابا**.
 *
 * و«أُرسلت» ليست فشلا: طلبٌ غادر ولم يعد جوابُه بعد. **وعرضُها حمراءَ
 * يقول إنّ شيئا انكسر** — ولم ينكسر شيء.
 */
const ATTEMPT: Readonly<Record<string, { title: string; detail: string }>> = {
  succeeded: { title: 'نُشرت', detail: '' },
  sent: { title: 'أُرسلت ولم يعد الجواب', detail: 'طلب غادر إلى المنصّة، وردُّها لم يُسجَّل' },
  failed: { title: 'لم تنجح', detail: 'ردّت المنصّة بخطأ — وصدى يعيد المحاولة' },
  skipped_duplicate: {
    title: 'تُخطّيت — مكرَّرة',
    detail: 'المفتاح نفسُه نُشر من قبل، فلم يُدفَع ثمنُه مرّتين',
  },
}

/**
 * ما قيل عن الشريحة — **ذيلٌ لسطر الصورة، أو لا شيء** (D-162).
 *
 * والرحلةُ قارئٌ ثانٍ لـ`media.note` بعد البطاقة: من يسأل «لماذا خرجت
 * صورتي بلا عنوان» بعد أسبوعٍ يجد الجوابَ في المحطّة لا في سجلّ الأمان.
 * و`null` لا ذيلَ لها: صفٌّ أقدمُ من الحفظ، أو مقطعٌ لا شريحةَ له.
 */
function slideSaid(note: string | null, headline: string | null): string {
  if (note === null) return ''
  if (note === '') return headline === null ? '' : ` · وعليها «${headline}»`
  return ` · بلا نصّ فوقها: ${note}`
}

/**
 * يقرأ رحلةَ منشورٍ واحد.
 *
 * **وسبعةُ استعلاماتٍ لا واحد**: ضمُّها في وصلةٍ واحدة يضرب الصفوفَ بعضَها
 * في بعض (منشورٌ له ثلاثُ صورٍ وأربعُ محاولاتٍ يعطي اثنتَي عشرةَ صفّا)،
 * **ثمّ يُفكّ الضربُ في الشيفرة** — وذاك أطولُ وأخطأ.
 */
/**
 * سطرُ النشر الناجح — معرّفُه، **ومستوى الخصوصيّة الذي طُلب فعلًا وملاحظةُ ما لم يقع كما
 * قُرّر** (D-190). يحفظهما الناشرُ في جواب المحاولة، و«رحلةُ المنشور» هي ما تحيل إليه M-29
 * حين يُسأل «لماذا لم يظهر للعامّة».
 */
function published(id: string | null, json: string | null): string {
  const parts = [id ?? 'بلا معرّف من المنصّة']
  if (json !== null) {
    try {
      const v = JSON.parse(json) as { request?: { privacy_level?: unknown; privacy?: unknown; direct?: unknown }; note?: unknown }
      const level = v.request?.privacy_level ?? v.request?.privacy
      if (typeof level === 'string' && level !== '') parts.push(`طُلب ${level}`)
      else if (v.request?.direct === false) parts.push('إلى صندوق التطبيق')
      if (typeof v.note === 'string' && v.note !== '') parts.push(v.note)
    } catch {
      // ‏جوابٌ لا يُقرأ لا يُسقط الرحلة: يبقى المعرّفُ وحدَه
    }
  }
  return parts.join(' · ')
}

export async function readJourney(db: Db, org: string, postId: string): Promise<Journey | null> {
  const post = await db
    .prepare(
      `SELECT p.id, p.platform, p.text, p.status, p.model, p.cost_usd, p.rationale,
              p.created_at, p.approved_by, p.approved_at, p.scheduled_at, p.dispatched_at,
              p.source_id,
              s.name AS source_name, s.last_seen_at,
              c.summary, c.worth_score, c.extracted_at,
              a.display_name AS account_name
         FROM posts p
         LEFT JOIN sources s ON s.id = p.source_id
         LEFT JOIN content_items c ON c.id = (
                SELECT id FROM content_items
                 WHERE source_id = p.source_id ORDER BY extracted_at DESC LIMIT 1)
         LEFT JOIN accounts a ON a.id = p.account_id
        WHERE p.id = ? AND p.org_id = ?`,
    )
    .bind(postId, org)
    .first<PostRow>()
    .catch(() => null)
  if (post === null) return null

  const stations: Station[] = []

  // ── ١ · المصدر ─────────────────────────────────────────────────────
  // **ومنشورٌ بلا مصدرٍ يُقال ذلك فيه**: كُتب بيدٍ أو من خطّةٍ حُذف مصدرُها،
  // ولا يُصطنَع له أصلٌ ليكتمل الخطّ
  if (post.source_name !== null) {
    stations.push({
      kind: 'source', title: 'ملفّ في Drive', at: post.last_seen_at,
      detail: post.source_name, cost: null, model: null, state: 'done',
    })
  }

  // ── ٢ · التحليل ────────────────────────────────────────────────────
  if (post.summary !== null) {
    const worth = post.worth_score === null
      ? 'بلا درجة'
      : `درجة الاستحقاق ${Math.round(post.worth_score * 100)}٪`
    stations.push({
      kind: 'analysis', title: 'قُرئ وحُلّل', at: post.extracted_at,
      detail: worth, cost: null, model: null, state: 'done',
    })
  }

  // ── ٣ · الكتابة ────────────────────────────────────────────────────
  stations.push({
    kind: 'draft', title: 'كُتبت المسوّدة', at: post.created_at,
    detail: post.rationale ?? 'بلا تعليل مسجَّل',
    cost: post.cost_usd, model: post.model, state: 'done',
  })

  // ── ٤ · الصور ──────────────────────────────────────────────────────
  const { results: media } = await db
    .prepare(
      `SELECT mime, bytes, cost_usd, status, model, note, headline, created_at FROM media
        WHERE post_id = ? AND org_id = ? ORDER BY rowid`,
    )
    .bind(postId, org)
    .all<{
      mime: string; bytes: number; cost_usd: number; status: string; model: string | null
      note: string | null; headline: string | null; created_at: string
    }>()
    .catch(() => ({ results: [] as never[] }))

  for (const m of media) {
    const clip = m.mime.startsWith('video/')
    stations.push({
      kind: 'image',
      title: clip ? 'وُلّد مقطع' : 'وُلّدت صورة',
      at: m.created_at,
      detail: m.status === 'rejected'
        ? 'رفضتَها — وتبقى بكلفتها'
        : `${kb(m.bytes)}${slideSaid(m.note, m.headline)}`,
      cost: m.cost_usd, model: m.model,
      state: m.status === 'rejected' ? 'failed' : 'done',
    })
  }

  // ── ٥ · القرار ─────────────────────────────────────────────────────
  const decided = DECISION[post.status]
  if (decided !== undefined || post.approved_at !== null) {
    const shape = decided ?? { title: 'بُتّ فيها', detail: post.status }
    stations.push({
      kind: 'decision', title: shape.title,
      at: post.approved_at,
      detail: post.approved_by === null ? shape.detail : `${shape.detail} · ${deciderText(post.approved_by)}`,
      cost: null, model: null,
      state: post.status === 'rejected' ? 'failed' : 'done',
    })
  }

  // ── ٦ · الجدولة ────────────────────────────────────────────────────
  if (post.scheduled_at !== null) {
    stations.push({
      kind: 'schedule',
      title: post.dispatched_at === null ? 'مجدولة' : 'قيد النشر',
      at: post.dispatched_at ?? post.scheduled_at,
      detail: post.account_name === null ? 'بلا حساب' : `إلى ${post.account_name}`,
      cost: null, model: null,
      state: post.dispatched_at === null ? 'pending' : 'done',
    })
  }

  // ── ٧ · النشر ──────────────────────────────────────────────────────
  // **والمحاولاتُ كلُّها تُعرَض لا آخرُها**: منشورٌ نجح من الثالثة قصّتُه
  // في الأولَيَين، وهي التي تُقرأ حين يُسأل «لماذا تأخّر»
  const { results: attempts } = await db
    .prepare(
      `SELECT attempt_no, status, platform_post_id, at,
              CASE WHEN status = 'succeeded' THEN response_json END AS response_json
         FROM publish_attempts
        WHERE post_id = ? AND org_id = ? ORDER BY attempt_no`,
    )
    .bind(postId, org)
    .all<{ attempt_no: number; status: string; platform_post_id: string | null; at: string; response_json: string | null }>()
    .catch(() => ({ results: [] as never[] }))

  for (const a of attempts) {
    const ok = a.status === 'succeeded'
    const shape = ATTEMPT[a.status] ?? { title: 'محاولة بحال غير معروف', detail: a.status }
    stations.push({
      kind: 'publish',
      title: ok ? shape.title : `محاولة ${a.attempt_no} — ${shape.title}`,
      at: a.at,
      detail: ok ? published(a.platform_post_id, a.response_json) : shape.detail,
      cost: null, model: null,
      state: ok ? 'done' : a.status === 'sent' ? 'pending' : 'failed',
    })
  }

  // ── ٨ · القياس ─────────────────────────────────────────────────────
  const { results: windows } = await db
    .prepare(
      `SELECT window, impressions, reactions, comments, shares, pulled_at
         FROM metrics WHERE post_id = ? AND org_id = ? ORDER BY pulled_at`,
    )
    .bind(postId, org)
    .all<{
      window: string; impressions: number | null; reactions: number | null
      comments: number | null; shares: number | null; pulled_at: string
    }>()
    .catch(() => ({ results: [] as never[] }))

  for (const w of windows) {
    /*
     * **و«لا يُقاس» ليست صفرا** (D-048 · D-058).
     *
     * LinkedIn لا يعطي الظهورَ لمنشور عضو، فالعمودُ `null`. **وعرضُها
     * صفرا يقول «نُشرت فلم يرها أحد»** — وهو اتّهامٌ للمنشور بما لا
     * يُعرَف عنه.
     */
    const say = (label: string, v: number | null): string | null =>
      v === null ? null : `${label} ${v}`
    const parts = [
      say('ظهور', w.impressions), say('تفاعل', w.reactions),
      say('تعليق', w.comments), say('مشاركة', w.shares),
    ].filter((x): x is string => x !== null)

    stations.push({
      kind: 'metrics', title: `قياس ${w.window}`, at: w.pulled_at,
      detail: parts.length === 0 ? 'لا تُقاس من هذه المنصّة' : parts.join(' · '),
      cost: null, model: null, state: 'done',
    })
  }

  /*
   * **والمجموعُ من الدفتر لا من جمع المحطّات.**
   *
   * `cost_ledger` هو السجلُّ الحاكم (D-008): يُكتَب قبل أن يُعدَّ النداءُ
   * ناجحا. **ونداءٌ دُفع ثمنُه ثمّ فشل يبقى فيه ولا صفَّ له في `media`**
   * — فجمعُ المحطّات يُنقص ما دُفع فعلا.
   */
  const spent = await db
    // ‏والدفترُ يحمل منظّمةَ منشوره (`recordCost`)، فيُسأل بها (D-277)
    .prepare(`SELECT COALESCE(SUM(total), 0) AS s FROM cost_ledger WHERE ref_id = ? AND org_id = ?`)
    .bind(postId, org)
    .first<{ s: number }>()
    .catch(() => null)

  return {
    postId: post.id,
    platform: post.platform,
    text: post.text,
    status: post.status,
    stations,
    spent: spent?.s ?? 0,
  }
}

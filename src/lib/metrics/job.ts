/**
 * دورةُ القياس — ما نُشر، كيف صار بعده.
 *
 * ## لماذا ثلاثُ نوافذَ لا رقمٌ واحد
 *
 * منشورٌ يُقاس مرّةً واحدةً يُظلَم أو يُمدَح بلا وجه: أوّلُ ساعةٍ تعطي
 * الظهورَ ولا تعطي التفاعل، والأسبوعُ يعطي النهائيّ ويخفي **سرعةَ**
 * الانتشار — وهي التي تفرّق منشورا اشتعل من منشورٍ تراكم.
 *
 * فثلاث: ٢٤ ساعة و ٧٢ و ٧ أيّام. وهي التي في `0001_init` منذ اليوم
 * الأوّل — **والجدولُ كان موجودا ولا شيء يكتب فيه.** هذا الملفّ هو ما
 * كان ناقصا.
 *
 * ## ونافذةٌ تُقاس مرّةً واحدةً إلى الأبد
 *
 * مفتاحُ `metrics` هو `(post_id, window)`. فما قِيس لا يُعاد قياسُه:
 * الدورةُ تدور كلَّ ستّ ساعات، **وبلا هذا القيد تُقرأ منشوراتُ الشهر
 * كلَّ دورة** — و X يحاسب على كلّ قراءة.
 *
 * ## والحارسُ قبل النداء لا بعده (D-019 · D-045)
 *
 * رمزٌ لا يملك نطاقَ القراءة يُردّ 403 **بعد** أن تُحسَب تكلفتُه. فيُسأل
 * قبلها، ويُترك المنشورُ لدورةٍ تالية بعد أن يُجدَّد الإذن.
 */
import { recordCost, X_PRICE_PER_OWNED_READ } from '../cost'
import { hasScope } from '../oauth/scopes'
import { loadTokens, type Db } from '../tokens'
import { fetchLinkedInMetrics, fetchXMetrics, MetricsError, type PostMetrics } from './platforms'

/** النوافذُ الثلاث وأعمارُها بالساعات. الأسماءُ تقابل `CHECK` في المخطّط. */
export const WINDOWS = [
  { name: '24h', hours: 24 },
  { name: '72h', hours: 72 },
  { name: '7d', hours: 168 },
] as const

export type WindowName = (typeof WINDOWS)[number]['name']

/**
 * اسمُ النافذة كما يُقرأ — **والمفتاحُ يبقى في القاعدة** (D-124).
 *
 * كان التقريرُ يقول «الأوّلُ في نافذة 24h» وشاشةُ المنصّة «نافذةُ 7d»:
 * **مفتاحُ `CHECK` في جملةٍ عربيّة** — وهي علّةُ ترويسات اللوح المحوريّ
 * (D-123) بعينها في موضعٍ ثالث. وما ليس في القاموس يُعرَض بحرفه.
 */
const WINDOW_LABEL: Readonly<Record<WindowName, string>> = {
  '24h': '‏٢٤ ساعة',
  '72h': '‏٧٢ ساعة',
  '7d': '‏٧ أيّام',
}

export function windowLabel(name: string): string {
  return (WINDOW_LABEL as Readonly<Record<string, string>>)[name] ?? name
}

/** نطاقُ القراءة لكلّ منصّة — يُسأل عنه قبل النداء. */
const READ_SCOPE: Readonly<Record<string, string>> = {
  linkedin: 'w_member_social',
  x: 'tweet.read',
}

export interface DueRow {
  readonly postId: string
  readonly platform: 'linkedin' | 'x'
  readonly accountId: string
  readonly platformPostId: string
  readonly window: WindowName
  readonly publishedAt: string
}

interface RawDue {
  post_id: string
  platform: string
  account_id: string
  platform_post_id: string
  published_at: string
}

/**
 * ما حان قياسُه — بالسؤال في SQL لا بالفرز في الذاكرة.
 *
 * وجلبُ كلّ المنشورات ثمّ فرزُها هنا يعني قراءةَ آلافِ صفوفٍ في Worker
 * له حدُّ ذاكرةٍ وزمن. والقاعدةُ تعرف كيف تفرز.
 */
export async function dueWindows(db: Db, now: Date, limit = 50): Promise<DueRow[]> {
  const rows: DueRow[] = []

  for (const w of WINDOWS) {
    // «نُشر قبل أكثرَ من عمر النافذة» — والوقتُ من المحاولة الناجحة
    const cutoff = new Date(now.getTime() - w.hours * 3600_000)
      .toISOString().slice(0, 19).replace('T', ' ')

    let results: RawDue[] = []
    try {
      const out = await db
        .prepare(
          `SELECT p.id AS post_id, p.platform, p.account_id,
                  pa.platform_post_id, pa.at AS published_at
             FROM posts p
             JOIN publish_attempts pa
               ON pa.post_id = p.id AND pa.status = 'succeeded'
            WHERE p.status = 'published'
              AND pa.platform_post_id IS NOT NULL
              AND p.account_id IS NOT NULL
              AND pa.at <= ?
              AND NOT EXISTS (
                    SELECT 1 FROM metrics m
                     WHERE m.post_id = p.id AND m.window = ?)
            ORDER BY pa.at DESC
            LIMIT ?`,
        )
        .bind(cutoff, w.name, limit)
        .all<RawDue>()
      results = out.results
    } catch {
      // جدولٌ لا يُقرأ لا يُسقط الدورة: تُترك نافذتُه لدورةٍ تالية
      results = []
    }

    for (const r of results) {
      if (r.platform !== 'linkedin' && r.platform !== 'x') continue
      rows.push({
        postId: r.post_id,
        platform: r.platform,
        accountId: r.account_id,
        platformPostId: r.platform_post_id,
        window: w.name,
        publishedAt: r.published_at,
      })
    }
  }
  return rows
}

/** يكتب القياسَ — ويستبدل ما كان للنافذة نفسها إن أُعيد القياسُ يدا. */
export async function saveMetrics(
  db: Db,
  postId: string,
  window: WindowName,
  m: PostMetrics,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO metrics (post_id, window, impressions, reactions, comments, shares, clicks, pulled_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT (post_id, window) DO UPDATE SET
         impressions = excluded.impressions,
         reactions   = excluded.reactions,
         comments    = excluded.comments,
         shares      = excluded.shares,
         clicks      = excluded.clicks,
         pulled_at   = datetime('now')`,
    )
    .bind(postId, window, m.impressions, m.reactions, m.comments, m.shares, m.clicks)
    .run()
}

export interface PullDeps {
  readonly db: Db
  readonly encKey: string
  readonly fetchImpl?: typeof fetch
  readonly now?: () => Date
}

export type PullOutcome =
  | { readonly kind: 'measured'; readonly postId: string; readonly window: WindowName }
  /** لم يُقَس، ويُعاد في دورةٍ تالية. */
  | { readonly kind: 'deferred'; readonly postId: string; readonly reason: string }
  /** لم يُقَس، **ولا يُعاد أبدا** — منشورٌ حُذف مثلا. فيُختَم بفراغٍ لئلّا يدور. */
  | { readonly kind: 'closed'; readonly postId: string; readonly reason: string }

/**
 * يقيس صفّا واحدا.
 *
 * والفشلُ نوعان، والفرقُ بينهما هو الذي يمنع دورةً لا تنتهي:
 * **ما يُعاد** يُترك بلا صفّ، فتلتقطه الدورةُ التالية.
 * **وما لا يُعاد** — منشورٌ حُذف من المنصّة — **يُختَم بصفٍّ كلُّه فراغ**:
 * فالمفتاحُ `(post_id, window)` يمنع اختيارَه ثانيةً، ولا يُكذَب بصفر.
 */
export async function pullOne(deps: PullDeps, row: DueRow): Promise<PullOutcome> {
  const fetchImpl = deps.fetchImpl ?? fetch

  const tokens = await loadTokens(deps.db, deps.encKey, row.accountId)
  if (tokens === null) {
    return { kind: 'deferred', postId: row.postId, reason: 'no_tokens' }
  }

  // الحارسُ قبل النداء: رمزٌ بلا نطاقِ قراءةٍ يُردّ بعد أن تُحسَب كلفتُه
  const needed = READ_SCOPE[row.platform]
  if (needed !== undefined && !hasScope(tokens.scopes, needed)) {
    return { kind: 'deferred', postId: row.postId, reason: 'missing_read_scope' }
  }

  // والتكلفةُ تُسجَّل قبل أن يُعدّ النداءُ ناجحا (D-008).
  // و LinkedIn لا يحاسب على القراءة، فلا يُسجَّل له صفرٌ يزحم الدفتر
  if (row.platform === 'x') {
    await recordCost(deps.db, {
      provider: 'x',
      operation: `read_metrics:${row.window}`,
      units: 1,
      unitCost: X_PRICE_PER_OWNED_READ,
      refId: row.postId,
    })
  }

  let measured: PostMetrics
  try {
    measured =
      row.platform === 'linkedin'
        ? await fetchLinkedInMetrics(tokens.accessToken, row.platformPostId, fetchImpl)
        : await fetchXMetrics(tokens.accessToken, row.platformPostId, fetchImpl)
  } catch (error) {
    if (error instanceof MetricsError && !error.retryable) {
      // ختمٌ بفراغ: لا يُعاد، ولا يُقرأ صفرا
      await saveMetrics(deps.db, row.postId, row.window, {
        impressions: null, reactions: null, comments: null, shares: null, clicks: null,
      })
      return { kind: 'closed', postId: row.postId, reason: error.message }
    }
    return {
      kind: 'deferred',
      postId: row.postId,
      reason: error instanceof Error ? error.message : 'عطل',
    }
  }

  await saveMetrics(deps.db, row.postId, row.window, measured)
  return { kind: 'measured', postId: row.postId, window: row.window }
}

export interface PullSummary {
  readonly due: number
  readonly measured: number
  readonly deferred: number
  readonly closed: number
}

/**
 * الدورةُ كلُّها.
 *
 * **وصفٌّ يفشل لا يُسقط ما بعده**: منشورٌ حُذف أو حسابٌ انتهى إذنُه لا
 * يمنع قياسَ التسعةِ الباقية. وهذا ما يجعل دورةً آليّةً تُوثَق.
 */
export async function pullDue(deps: PullDeps, limit = 50): Promise<PullSummary> {
  const now = (deps.now ?? (() => new Date()))()
  const rows = await dueWindows(deps.db, now, limit)

  let measured = 0
  let deferred = 0
  let closed = 0

  for (const row of rows) {
    try {
      const outcome = await pullOne(deps, row)
      if (outcome.kind === 'measured') measured += 1
      else if (outcome.kind === 'closed') closed += 1
      else deferred += 1
    } catch {
      deferred += 1
    }
  }

  return { due: rows.length, measured, deferred, closed }
}

export interface PostMetricRow {
  readonly window: WindowName
  readonly impressions: number | null
  readonly reactions: number | null
  readonly comments: number | null
  readonly shares: number | null
  readonly pulledAt: string
}

/** ما قِيس لمنشوراتٍ بعينها — مفتاحُ الخريطة معرّفُ المنشور. */
export async function metricsFor(
  db: Db,
  postIds: readonly string[],
): Promise<Record<string, PostMetricRow[]>> {
  if (postIds.length === 0) return {}
  const out: Record<string, PostMetricRow[]> = {}
  try {
    const marks = postIds.map(() => '?').join(',')
    const { results } = await db
      .prepare(
        `SELECT post_id, window, impressions, reactions, comments, shares, pulled_at
           FROM metrics WHERE post_id IN (${marks})`,
      )
      .bind(...postIds)
      .all<{
        post_id: string
        window: string
        impressions: number | null
        reactions: number | null
        comments: number | null
        shares: number | null
        pulled_at: string
      }>()

    for (const r of results) {
      const list = out[r.post_id] ?? []
      list.push({
        window: r.window as WindowName,
        impressions: r.impressions,
        reactions: r.reactions,
        comments: r.comments,
        shares: r.shares,
        pulledAt: r.pulled_at,
      })
      out[r.post_id] = list
    }
  } catch {
    return {}
  }
  return out
}

/**
 * أحدثُ نافذةٍ قِيست لمنشور — وهي التي تُعرض في القائمة.
 *
 * والترتيبُ من الأوسع: صفٌّ لسبعةِ أيّامٍ أصدقُ من صفٍّ لأربعٍ وعشرين
 * ساعة، **لأنّ التفاعلَ يتراكم**. فيُعرض الأحدثُ عمرا لا الأحدثُ قياسا.
 */
export function widest(rows: readonly PostMetricRow[]): PostMetricRow | null {
  const order: Record<WindowName, number> = { '24h': 1, '72h': 2, '7d': 3 }
  let best: PostMetricRow | null = null
  for (const r of rows) {
    if (best === null || (order[r.window] ?? 0) > (order[best.window] ?? 0)) best = r
  }
  return best
}

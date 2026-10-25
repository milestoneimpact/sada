/**
 * التقريرُ الأسبوعيّ — **يشهد على أسبوعٍ مضى، فيُكتب مرّةً ويُقرأ كما كُتب.**
 *
 * ## قاعدةٌ واحدةٌ تحكم كلَّ رقمٍ هنا
 *
 * **ما لم يُقَس لا يُجمَع صفرا.** LinkedIn لا يعطي ظهورا لمنشور عضو،
 * فـ`impressions` تعود `null` — وجمعُها كصفرٍ يعطي «٠ ظهور» ويُقرأ
 * فشلا، **وهو ليس فشلا بل غيابَ قياس**. فكلُّ مجموعٍ هنا يحمل معه
 * **كم صفّا دخل فيه**، والشاشةُ تقول «من ٧ منشورات، قِيس ٤».
 *
 * ## ولا تُقارَن نافذةٌ بنافذة
 *
 * منشورٌ قِيس بعد ٢٤ ساعةٍ وآخرُ قِيس بعد سبعةِ أيّام **ليسا في مضمار
 * واحد**: التفاعلُ يتراكم، فالأقدمُ يفوز بعمره لا بجودته. فالترتيبُ
 * يقع **داخل النافذة الواحدة**، والنافذةُ تُقال في الشاشة.
 */
import type { Db } from '../tokens'
import { changedRows } from '../dbResult'
import type { PublishPlatform } from '../oauth/providers'
import { type PostMetricRow, type WindowName, metricsFor, widest } from '../metrics/job'
import { dbNow } from '../schedule/job'

/** نسخةُ البنية — تُحفظ مع الصفّ، فقارئٌ قديمٌ يعرف أنّه قديم. */
export const REPORT_VERSION = 1

export interface ReportPost {
  readonly id: string
  readonly platform: PublishPlatform
  readonly text: string
  readonly publishedAt: string
  readonly window: WindowName | null
  readonly impressions: number | null
  readonly interactions: number | null
}

export interface PlatformSlice {
  readonly platform: PublishPlatform
  readonly published: number
  /** كم منها له صفُّ قياسٍ أصلا. */
  readonly measured: number
  /** مجموعُ الظهور — و`null` حين لم يُقَس ولو واحد. */
  readonly impressions: number | null
  /** كم صفّا دخل في مجموع الظهور — والشاشةُ تعرضه بجانبه. */
  readonly impressionsFrom: number
  readonly interactions: number | null
  readonly interactionsFrom: number
}

export interface TopPost {
  readonly post: ReportPost
  /** النافذةُ التي وقع فيها الترتيب — ولا يُقارَن خارجَها. */
  readonly window: WindowName
  /** بمَ رُتِّب: بنسبةِ تفاعلٍ إلى ظهور، أم بعددِ تفاعلٍ وحده. */
  readonly basis: 'rate' | 'count'
  readonly cohort: number
}

export interface WeeklyReport {
  readonly version: number
  readonly from: string
  readonly to: string
  readonly published: number
  readonly measured: number
  readonly platforms: readonly PlatformSlice[]
  readonly top: TopPost | null
  /**
   * المنشورُ الوحيد حين لم يخرج غيرُه — **فلا ترتيبَ، لكنّ صاحبَ الرقم يُرى.**
   * كان التقريرُ يقول «لا ترتيب» ويسكت، والمالكُ لا يعرف أيُّ منشورٍ جلب
   * ظهورَ أسبوعه. وقاعدةُ `top` كما هي: واحدٌ وحده ليس ترتيبا. والحقلُ
   * اختياريٌّ فتقريرٌ كُتب قبله يُقرأ كما كُتب.
   */
  readonly only?: ReportPost
  readonly spendUsd: number
  /** ما لا يقوله الرقمُ وحده — يُكتب نصّا ولا يُترك ليُستنتَج. */
  readonly notes: readonly string[]
}

/** مجموعُ التفاعل — و`null` تبقى `null` ولا تصير صفرا. */
function interactionsOf(row: PostMetricRow | null): number | null {
  if (row === null) return null
  const parts = [row.reactions, row.comments, row.shares]
  if (parts.every((p) => p === null)) return null
  return parts.reduce<number>((sum, p) => sum + (p ?? 0), 0)
}

/**
 * حدُّ الأسبوع — **يبدأ الاثنين** ويُحسب بالتوقيت العالميّ.
 *
 * والاثنين لا الأحد: التقريرُ يُقرأ في أوّل يومِ عمل، فيغطّي الأسبوعَ
 * الذي سبقه كاملا لا نصفَه.
 */
export function weekBounds(now: Date): { from: Date; to: Date; id: string } {
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  // 0 = الأحد عند JS، فيُزاح ليصير الاثنين أوّلا
  const back = (to.getUTCDay() + 6) % 7
  to.setUTCDate(to.getUTCDate() - back)
  const from = new Date(to)
  from.setUTCDate(from.getUTCDate() - 7)
  return { from, to, id: from.toISOString().slice(0, 10) }
}

interface PublishedRow {
  id: string
  platform: string
  text: string
  published_at: string
}

/**
 * المنشوراتُ التي **خرجت فعلا** في المدّة.
 *
 * ولا تُقرأ من `posts.status`: صفٌّ حالتُه `published` يقول إنّه نُشر
 * ولا يقول **متى**. والوقتُ يُقرأ من `publish_attempts` — من المحاولة
 * التي نجحت، وهي الأثرُ الذي لا يُبدَّل (D-004).
 *
 * **والحدّان بصيغة القاعدة** (`dbNow`) لا بـ `toISOString()`: العمودُ يكتبه
 * `datetime('now')` بمسافةٍ، والمقارنةُ نصّيّة، وحرفُ `T` بعد المسافة. فكان
 * «2026-09-21T00:00:00.000Z» يُخرج كلَّ ما وقع يومَ الاثنين الأوّل ويُدخل
 * ما وقع يومَ الاثنين التالي — فمنشوراتُ الاثنين وكلفتُه بعد الرابعة فجرًا لا
 * تدخل تقريرًا قطّ. والتقاريرُ التي كُتبت قبل الإصلاح تبقى كما كُتبت.
 */
async function publishedIn(db: Db, org: string, from: Date, to: Date): Promise<ReportPost[]> {
  try {
    const { results } = await db
      .prepare(
        `SELECT p.id AS id, p.platform AS platform, p.text AS text,
                min(pa.at) AS published_at
           FROM posts p
           JOIN publish_attempts pa ON pa.post_id = p.id AND pa.status = 'succeeded'
          WHERE p.org_id = ?
          GROUP BY p.id
         HAVING published_at >= ? AND published_at < ?
          ORDER BY published_at ASC`,
      )
      .bind(org, dbNow(from), dbNow(to))
      .all<PublishedRow>()
    return results.map((r) => ({
      id: r.id,
      platform: r.platform as PublishPlatform,
      text: r.text,
      publishedAt: r.published_at,
      window: null,
      impressions: null,
      interactions: null,
    }))
  } catch {
    return []
  }
}

/** ما أُنفق في المدّة — من الدفتر وحده (D-008)، وبحدَّي `publishedIn` نفسِهما. */
async function spendIn(db: Db, org: string, from: Date, to: Date): Promise<number> {
  try {
    const row = await db
      .prepare('SELECT coalesce(sum(total), 0) AS total FROM cost_ledger WHERE org_id = ? AND at >= ? AND at < ?')
      .bind(org, dbNow(from), dbNow(to))
      .first<{ total: number | null }>()
    return row?.total ?? 0
  } catch {
    return 0
  }
}

function sliceOf(platform: PublishPlatform, posts: readonly ReportPost[]): PlatformSlice {
  const mine = posts.filter((p) => p.platform === platform)
  const withImpressions = mine.filter((p) => p.impressions !== null)
  const withInteractions = mine.filter((p) => p.interactions !== null)
  return {
    platform,
    published: mine.length,
    measured: mine.filter((p) => p.window !== null).length,
    impressions:
      withImpressions.length === 0
        ? null
        : withImpressions.reduce((s, p) => s + (p.impressions ?? 0), 0),
    impressionsFrom: withImpressions.length,
    interactions:
      withInteractions.length === 0
        ? null
        : withInteractions.reduce((s, p) => s + (p.interactions ?? 0), 0),
    interactionsFrom: withInteractions.length,
  }
}

/**
 * أفضلُ منشور — **داخل نافذةٍ واحدة، وبأصدقِ مقياسٍ تسمح به بياناتُها.**
 *
 * تُختار أوسعُ نافذةٍ فيها **اثنان فأكثر**: ترتيبٌ بين واحدٍ ووحده ليس
 * ترتيبا. وإن كان لكلِّ من في النافذة ظهورٌ مقيس رُتِّبوا **بالنسبة**؛
 * وإلّا **بعدد التفاعل**، ويُقال ذلك — فنسبةٌ تُحسب على ظهورٍ ناقصٍ
 * تكافئ من لم يُقَس.
 */
export function topOf(posts: readonly ReportPost[]): TopPost | null {
  const order: WindowName[] = ['7d', '72h', '24h']
  for (const window of order) {
    const cohort = posts.filter((p) => p.window === window && p.interactions !== null)
    if (cohort.length < 2) continue
    const everyHasReach = cohort.every((p) => p.impressions !== null && p.impressions > 0)
    const score = (p: ReportPost): number =>
      everyHasReach ? (p.interactions ?? 0) / (p.impressions ?? 1) : (p.interactions ?? 0)
    let best = cohort[0]!
    for (const p of cohort) if (score(p) > score(best)) best = p
    return {
      post: best,
      window,
      basis: everyHasReach ? 'rate' : 'count',
      cohort: cohort.length,
    }
  }
  return null
}

/**
 * صفوفُ الأسبوع مقيسةً — **وهي المادّةُ التي يُلخَّص منها ويُرشَّح.**
 *
 * وتُعاد قائمةً لا تُطوى في التقرير: التقريرُ **يلخّص**، والترشيحُ
 * يحتاج الصفَّ نفسَه (D-058). فتُقرأ مرّةً ويُبنى عليها الاثنان — لا
 * قراءتين تفترقان في اللحظة فتختلفان في الرقم.
 */
export async function collectWeek(db: Db, org: string, from: Date, to: Date): Promise<ReportPost[]> {
  const bare = await publishedIn(db, org, from, to)
  const measurements = await metricsFor(db, org, bare.map((p) => p.id))
  return bare.map((p) => {
    const row = widest(measurements[p.id] ?? [])
    return {
      ...p,
      window: row?.window ?? null,
      impressions: row?.impressions ?? null,
      interactions: interactionsOf(row),
    }
  })
}

/** يلخّص صفوفا جُمعت — دالّةٌ خالصةٌ تُختبَر بلا قاعدة. */
export function summarize(
  posts: readonly ReportPost[],
  from: Date,
  to: Date,
  spendUsd: number,
): WeeklyReport {
  const platforms = (['linkedin', 'x'] as const)
    .map((id) => sliceOf(id, posts))
    .filter((s) => s.published > 0)

  const measured = posts.filter((p) => p.window !== null).length
  const notes: string[] = []
  if (posts.length === 0) {
    notes.push('لا منشور خرج في هذه المدّة — والتقرير يقولها ولا يعرض أصفارا.')
  } else if (measured < posts.length) {
    notes.push(
      `${posts.length - measured} من ${posts.length} لم يُقَس بعد: ` +
        'أقرب نافذة أربع وعشرون ساعة، وما نُشر قبيل نهاية الأسبوع يُقاس في الذي يليه.',
    )
  }
  if (platforms.some((s) => s.platform === 'linkedin' && s.impressions === null)) {
    notes.push('LinkedIn لا يعطي ظهورا لمنشور عضو — والفراغ هنا غياب قياس لا صفر ظهور.')
  }

  return {
    version: REPORT_VERSION,
    from: from.toISOString(),
    to: to.toISOString(),
    published: posts.length,
    measured,
    platforms,
    top: topOf(posts),
    ...(posts.length === 1 ? { only: posts[0]! } : {}),
    spendUsd,
    notes,
  }
}

/** يبني تقريرَ أسبوعٍ من القاعدة — ولا يكتب شيئا. */
export async function buildWeekly(
  db: Db,
  org: string,
  from: Date,
  to: Date,
): Promise<{ report: WeeklyReport; posts: readonly ReportPost[] }> {
  const posts = await collectWeek(db, org, from, to)
  const spendUsd = await spendIn(db, org, from, to)
  return { report: summarize(posts, from, to, spendUsd), posts }
}

/**
 * يحفظ التقرير — **ومفتاحُه الأسبوع، فالإعادةُ تكتب الصفَّ نفسه.**
 *
 * `ON CONFLICT DO NOTHING`: أوّلُ كتابةٍ هي الشهادة. ودورةٌ تعمل مرّةً
 * ثانيةً بعد أن تراكمت مقاييسُ أكثرَ **لا تبدّل رقما شُهد به** — وإلّا
 * لم يُعرَف أنَما الحصادُ أم أُعيد الحساب.
 */
export async function saveWeekly(
  db: Db,
  org: string,
  id: string,
  report: WeeklyReport,
): Promise<boolean> {
  const result = await db
    .prepare(
      `INSERT INTO reports (id, org_id, from_at, to_at, version, body_json)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
    )
    .bind(id, org, report.from, report.to, report.version, JSON.stringify(report))
    .run()
  return changedRows(result)
}

export interface StoredReport {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly createdAt: string
  readonly body: WeeklyReport
}

function parse(row: {
  id: string
  from_at: string
  to_at: string
  body_json: string
  created_at: string
}): StoredReport | null {
  try {
    const body = JSON.parse(row.body_json) as WeeklyReport
    if (typeof body.published !== 'number') return null
    return { id: row.id, from: row.from_at, to: row.to_at, createdAt: row.created_at, body }
  } catch {
    // جسدٌ فاسدٌ يُسقَط وحده ولا يُسقط القائمة (D-041)
    return null
  }
}

/** تقاريرُ المنظّمة وحدها (D-227): منظّمةٌ لا ترى أسابيعَ غيرها. */
export async function listReports(db: Db, org: string, limit = 12): Promise<StoredReport[]> {
  try {
    const { results } = await db
      .prepare(
        `SELECT id, from_at, to_at, body_json, created_at
           FROM reports WHERE org_id = ? ORDER BY from_at DESC LIMIT ?`,
      )
      .bind(org, limit)
      .all<{ id: string; from_at: string; to_at: string; body_json: string; created_at: string }>()
    return results.map(parse).filter((r): r is StoredReport => r !== null)
  } catch {
    return []
  }
}

export async function readReport(db: Db, org: string, id: string): Promise<StoredReport | null> {
  try {
    const row = await db
      .prepare(
        `SELECT id, from_at, to_at, body_json, created_at FROM reports WHERE id = ? AND org_id = ?`,
      )
      .bind(id, org)
      .first<{ id: string; from_at: string; to_at: string; body_json: string; created_at: string }>()
    return row === null ? null : parse(row)
  } catch {
    return null
  }
}

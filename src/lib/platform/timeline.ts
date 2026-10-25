/**
 * الخطُّ الزمنيّ لمنصّةٍ واحدة — **القادمُ تصاعديًّا، ثمّ «الآن»، ثمّ ما نُشر
 * تنازليًّا** (D-172).
 *
 * كانت الشاشةُ تخلط الثلاثة في قائمةٍ واحدة مرتّبةٍ بـ «الموعد أو وقت الكتابة»،
 * فيقع منشورٌ مجدولٌ للغد بين منشورين نُشرا الأسبوعَ الماضي، ويقع أوّلُ منشورٍ
 * بعد ‏٢٤٤٠ بكسلًا من السلّم وجداول النطاقات. والمالكُ يسأل سؤالين لا واحدا:
 * **ماذا سيُنشر ومتى، وماذا نُشر ومتى وبأيّ نتيجة.**
 *
 * **والتواريخُ بصيغة القاعدة** (`YYYY-MM-DD HH:MM:SS` من `dbNow`) لا بـ
 * `toISOString()`: المقارنةُ نصّيّة، وحرفُ `T` يقع بعد المسافة فيكذب الترتيب.
 */
import type { Db } from '../tokens'
import type { Platform } from '../oauth/providers'
import { dbNow } from '../schedule/job'
import { briefError } from './screen'

export interface TimelineRow {
  readonly id: string
  readonly text: string
  readonly status: string
  readonly scheduledAt: string | null
  readonly createdAt: string
  readonly dispatchedAt: string | null
  readonly accountName: string | null
  readonly accountKind: string | null
  readonly sourceName: string | null
  /** معرّفُ المنشور عند المنصّة من أوّل محاولةٍ ناجحة. */
  readonly platformPostId: string | null
  /** لحظةُ بدء الإرسال الناجح (`publish_attempts.at`) — وهي «وقتُ النشر». */
  readonly publishedAt: string | null
  readonly failedAt: string | null
  /** نصُّ آخر فشلٍ مختصرا، أو رمزُ الحارس كما كتبه الناشر. */
  readonly failure: string | null
  readonly tries: number
  readonly lastTryAt: string | null
  /** محاولاتٌ أُرسلت ولم يُعرف جوابُها. */
  readonly openTries: number
  readonly hasMedia: boolean
  readonly costUsd: number
  /** مفتاحُ الترتيب والمؤشّر. */
  readonly sortAt: string
}

interface Raw {
  id: string
  text: string
  status: string
  scheduled_at: string | null
  created_at: string
  dispatched_at: string | null
  account_name: string | null
  account_kind: string | null
  source_name: string | null
  platform_post_id: string | null
  published_at: string | null
  failed_at: string | null
  fail_json: string | null
  tries: number | null
  last_try_at: string | null
  open_tries: number | null
  media_json: string | null
  cost_usd: number | null
  sort_at: string | null
}

const COLUMNS = `
  p.id, p.text, p.status, p.scheduled_at, p.created_at, p.dispatched_at, p.media_json, p.cost_usd,
  a.display_name AS account_name, a.kind AS account_kind, s.name AS source_name,
  ok.platform_post_id, ok.at AS published_at,
  bad.at AS failed_at, bad.response_json AS fail_json,
  (SELECT count(*) FROM publish_attempts t WHERE t.post_id = p.id AND t.org_id = p.org_id) AS tries,
  (SELECT max(t.at) FROM publish_attempts t WHERE t.post_id = p.id AND t.org_id = p.org_id) AS last_try_at,
  (SELECT count(*) FROM publish_attempts t WHERE t.post_id = p.id AND t.org_id = p.org_id AND t.status = 'sent') AS open_tries,
  coalesce(ok.at, bad.at, p.scheduled_at, p.created_at) AS sort_at`

const JOINS = `
  FROM posts p
  LEFT JOIN accounts a ON a.id = p.account_id AND a.org_id = p.org_id
  LEFT JOIN sources s ON s.id = p.source_id AND s.org_id = p.org_id
  LEFT JOIN publish_attempts ok ON ok.id = (SELECT id FROM publish_attempts
       WHERE post_id = p.id AND org_id = p.org_id AND status = 'succeeded' ORDER BY at ASC LIMIT 1)
  LEFT JOIN publish_attempts bad ON bad.id = (SELECT id FROM publish_attempts
       WHERE post_id = p.id AND org_id = p.org_id AND status = 'failed' ORDER BY attempt_no DESC LIMIT 1)`

function hasMedia(json: string | null): boolean {
  if (json === null || json === '') return false
  try {
    const parsed = JSON.parse(json) as unknown
    return Array.isArray(parsed) && parsed.length > 0
  } catch {
    return false
  }
}

function toRow(r: Raw): TimelineRow {
  return {
    id: r.id,
    text: r.text,
    status: r.status,
    scheduledAt: r.scheduled_at,
    createdAt: r.created_at,
    dispatchedAt: r.dispatched_at,
    accountName: r.account_name,
    accountKind: r.account_kind,
    sourceName: r.source_name,
    platformPostId: r.platform_post_id,
    publishedAt: r.published_at,
    failedAt: r.failed_at,
    failure: briefError(r.fail_json),
    tries: r.tries ?? 0,
    lastTryAt: r.last_try_at,
    openTries: r.open_tries ?? 0,
    hasMedia: hasMedia(r.media_json),
    costUsd: r.cost_usd ?? 0,
    sortAt: r.sort_at ?? r.created_at,
  }
}

async function rows(db: Db, sql: string, ...binds: unknown[]): Promise<TimelineRow[]> {
  try {
    const { results } = await db.prepare(sql).bind(...binds).all<Raw>()
    return results.map(toRow)
  } catch (error) {
    // ‏قاعدةٌ متعبةٌ تُرسم شاشةً فارغةً تقول ذلك، لا خطأً يُسقطها
    console.error({ job: 'timeline', failed: String(error) })
    return []
  }
}

/** المجدولُ بموعده تصاعديًّا — **الأقربُ أوّلا**. */
export function upcoming(db: Db, org: string, platform: Platform, limit = 60): Promise<TimelineRow[]> {
  return rows(
    db,
    `SELECT ${COLUMNS} ${JOINS}
      WHERE p.platform = ? AND p.org_id = ? AND p.status = 'queued'
      ORDER BY p.scheduled_at ASC, p.id ASC LIMIT ?`,
    platform, org, limit,
  )
}

/** ما ينتظر المالك: مسوّداتٌ تنتظر القرار، ومعتمَدٌ بلا موعد — الأقدمُ أوّلا. */
export function waiting(db: Db, org: string, platform: Platform, limit = 40): Promise<TimelineRow[]> {
  return rows(
    db,
    `SELECT ${COLUMNS} ${JOINS}
      WHERE p.platform = ? AND p.org_id = ?
        AND (p.status = 'draft' OR (p.status IN ('approved', 'edited') AND p.scheduled_at IS NULL))
      ORDER BY CASE p.status WHEN 'draft' THEN 0 ELSE 1 END, p.created_at ASC LIMIT ?`,
    platform, org, limit,
  )
}

export type HistoryFilter = 'all' | 'published' | 'failed'

/** مؤشّرُ «أقدم»: `<sort_at>|<id>` بصيغة القاعدة — وما لا يوافقها يُهمَل. */
export function readCursor(raw: string | undefined): { at: string; id: string } | null {
  if (raw === undefined) return null
  const m = /^(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?Z?)\|([A-Za-z0-9_-]{1,64})$/.exec(raw)
  return m === null ? null : { at: m[1]!, id: m[2]! }
}

export interface HistoryPage {
  readonly rows: readonly TimelineRow[]
  /** مؤشّرُ الصفحة التالية إن كان في الأرشيف أقدم. */
  readonly next: string | null
}

/**
 * ما نُشر وما فشل — **تنازليًّا بوقت وقوعه**، عشرون في الصفحة.
 *
 * ووقتُ الفاشل وقتُ آخر فشل، والمنشورِ وقتُ أوّل نجاح: منشورٌ فشل ثمّ نجح
 * يُعرض «نُشر» في لحظة نجاحه، لا في لحظة فشله.
 */
export async function history(
  db: Db,
  org: string,
  platform: Platform,
  filter: HistoryFilter,
  cursor: { at: string; id: string } | null,
  limit = 20,
): Promise<HistoryPage> {
  const statuses = filter === 'published' ? "('published')" : filter === 'failed' ? "('failed')" : "('published', 'failed')"
  const found = await rows(
    db,
    `SELECT * FROM (SELECT ${COLUMNS} ${JOINS}
        WHERE p.platform = ? AND p.org_id = ? AND p.status IN ${statuses})
      WHERE ? IS NULL OR sort_at < ? OR (sort_at = ? AND id < ?)
      ORDER BY sort_at DESC, id DESC LIMIT ?`,
    platform, org, cursor?.at ?? null, cursor?.at ?? null, cursor?.at ?? null, cursor?.id ?? null, limit + 1,
  )
  const page = found.slice(0, limit)
  const last = page[page.length - 1]
  return { rows: page, next: found.length > limit && last !== undefined ? `${last.sortAt}|${last.id}` : null }
}

export type QueueState =
  | { readonly kind: 'upcoming' }
  | { readonly kind: 'late'; readonly minutes: number }
  | { readonly kind: 'sending' }
  | { readonly kind: 'stuck'; readonly minutes: number }

/** ما يُعَدّ عالقًا: غادر منذ ساعةٍ ولم تُكتب له محاولةٌ نهائيّة. */
const STUCK_AFTER_MINUTES = 60

/**
 * حالُ المجدول: آتٍ، أو متأخّرٌ لم يُرسَل وقد حلّ موعدُه، أو في الطريق، أو عالق.
 *
 * **والعالقُ يُقال**: طابورُ الرسائل الميّتة لا مستهلكَ له، فرسالةٌ سقطت
 * تترك المنشورَ «مجدولًا» إلى الأبد. ومعه في الشاشة «أعده إلى المعتمَد».
 */
export function classifyQueued(row: TimelineRow, now: Date): QueueState {
  const stamp = dbNow(now)
  const minutesSince = (value: string): number => {
    const at = Date.parse(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`)
    return Number.isNaN(at) ? 0 : Math.max(0, Math.floor((now.getTime() - at) / 60_000))
  }
  if (row.dispatchedAt === null) {
    const due = row.scheduledAt
    if (due === null || due.replace('T', ' ') > stamp) return { kind: 'upcoming' }
    return { kind: 'late', minutes: minutesSince(due) }
  }
  const since = minutesSince(row.dispatchedAt)
  return since >= STUCK_AFTER_MINUTES ? { kind: 'stuck', minutes: since } : { kind: 'sending' }
}

export interface PlatformCounts {
  readonly waiting: number
  readonly ready: number
  readonly queued: number
  readonly published: number
  readonly failed: number
  /** منشوراتٌ لم تُنشر بعد وليس لها ما تطلبه المنصّةُ من صورةٍ أو مقطع. */
  readonly missingMedia: number
}

/** أعدادُ المنصّة في استعلامٍ واحد — لشريط «ما تطلبه» والتبويبات. */
export async function platformCounts(db: Db, org: string, platform: Platform, clip: boolean): Promise<PlatformCounts> {
  try {
    const row = await db
      .prepare(
        `SELECT coalesce(sum(status = 'draft'), 0) AS waiting,
                coalesce(sum(status IN ('approved', 'edited') AND scheduled_at IS NULL), 0) AS ready,
                coalesce(sum(status = 'queued'), 0) AS queued,
                coalesce(sum(status = 'published'), 0) AS published,
                coalesce(sum(status = 'failed'), 0) AS failed,
                coalesce(sum(status IN ('draft', 'approved', 'edited', 'queued') AND NOT EXISTS (
                  SELECT 1 FROM media m WHERE m.post_id = posts.id AND m.status = 'ready'
                     AND m.mime LIKE ?)), 0) AS missing_media
           FROM posts WHERE platform = ? AND org_id = ?`,
      )
      .bind(clip ? 'video/%' : 'image/%', platform, org)
      .first<Record<string, number>>()
    return {
      waiting: row?.['waiting'] ?? 0,
      ready: row?.['ready'] ?? 0,
      queued: row?.['queued'] ?? 0,
      published: row?.['published'] ?? 0,
      failed: row?.['failed'] ?? 0,
      missingMedia: row?.['missing_media'] ?? 0,
    }
  } catch {
    return { waiting: 0, ready: 0, queued: 0, published: 0, failed: 0, missingMedia: 0 }
  }
}

/**
 * كلفةُ كلّ منشور — **ما في عموده وما في الدفتر باسمه** معا.
 *
 * `posts.cost_usd` كلفةُ الكتابة وحدها، والصورةُ والموجزُ والنشرُ في الدفتر
 * بمعرّف المنشور. فالعمودُ وحده يقول «0.01$» لمنشورٍ كلّف أربعةَ أضعافها.
 */
export async function postCosts(db: Db, org: string, ids: readonly string[]): Promise<Readonly<Record<string, number>>> {
  if (ids.length === 0) return {}
  try {
    const marks = ids.map(() => '?').join(', ')
    const { results } = await db
      .prepare(`SELECT ref_id, sum(total) AS total FROM cost_ledger WHERE org_id = ? AND ref_id IN (${marks}) GROUP BY ref_id`)
      .bind(org, ...ids)
      .all<{ ref_id: string; total: number }>()
    const out: Record<string, number> = {}
    for (const r of results) out[r.ref_id] = r.total
    return out
  } catch {
    return {}
  }
}

/**
 * **التيّار** (D-386 · المرحلة الأولى من «صفحةٍ واحدة»): كلُّ ما سيُنشر وما نُشر في تيّارٍ زمنيٍّ واحد، كما يرى
 * المالكُ ملفَّه على منصّة.
 *
 * كانت رحلةُ المنشور موزَّعةً على ثماني شاشات (المراجعةُ والشهرُ والمتابعةُ والحزمةُ والاستيراداتُ والمنشوراتُ والخطُّ
 * الزمنيُّ والنتائج)، ولا شاشةَ تقول «ما حالُ الشهر الآن» في عمودٍ واحد. فهنا نموذجُ قراءةٍ **لا يكتب شيئًا**:
 * المنشوراتُ من `posts` بحالها، وبنودُ الخطّة التي لم تُكتب من `reviewModel` نفسِه، وما وجده الفحصُ (`planChecks`)
 * شارةً على بطاقته، والمقاييسُ من `metrics` حيث قيست. **والاعتمادُ لا يُعاد بناؤه**: الصفحةُ تُرسل إلى مسارات
 * الاعتماد القائمة وتعود.
 *
 * - **«ما سيُنشر»** الأقربُ أوّلًا: ما لا موعدَ له (ينتظر قرارًا أو موعدًا) يتقدّم لأنّه يحتاج يدًا، ثمّ المجدولُ والبنودُ
 *   بترتيب موعدها بتوقيت المالك (بندُ الخطّة محلّيٌّ منذ D-384، والمنشورُ UTC يُحوَّل).
 * - **«ما نُشر»** الأحدثُ أوّلًا، ستّون يومًا، و`before` يفتح ما قبلها.
 */
import type { Db } from './tokens'
import { latestPlan } from './plan/job'
import { reviewModel } from './plan/review'
import { planChecks, RULE_LABEL, type Finding } from './plan/checks'
import { readRules, reviewCheckInput } from './plan/checkStore'
import { metricsFor, widest } from './metrics/job'
import { dayKey, localParts } from './time/zone'
import { parseSqliteUtc } from './format'

export interface FeedMedia {
  readonly id: string
  readonly mime: string
  readonly width: number | null
  readonly height: number | null
}

export interface FeedMetrics {
  readonly impressions: number | null
  readonly reactions: number | null
  readonly comments: number | null
  readonly shares: number | null
}

export interface FeedCard {
  /** معرّفُ المنشور، أو `item:<key>` لبندٍ لم يُكتب. */
  readonly id: string
  readonly kind: 'post' | 'item'
  readonly platform: string
  /** حالُ المنشور كما في `posts`، و`writing` لبندٍ لم يُكتب. */
  readonly status: string
  readonly text: string
  /** لحظةٌ UTC بصيغة القاعدة: الموعدُ للمجدول، ولحظةُ النشر لما نُشر. */
  readonly at: string | null
  /** يومُ البند وساعتُه بتوقيت المالك حين لا لحظةَ UTC (بندٌ لم يُكتب، أو مسوّدةٌ من الخطّة بلا موعد). */
  readonly local: { readonly day: string; readonly time: string } | null
  readonly planId: string | null
  readonly media: FeedMedia | null
  readonly metrics: FeedMetrics | null
  /** أوّلُ ما وجده الفحصُ على هذا البند: ممنوعٌ أحمر، وتحذيرٌ كهرمانيّ. */
  readonly warning: { readonly tone: 'warn' | 'bad'; readonly label: string } | null
  readonly edited: boolean
}

export interface FeedCounts {
  readonly published: number
  readonly queued: number
  readonly awaiting: number
  readonly writing: number
}

export interface FeedModel {
  readonly upcoming: readonly FeedCard[]
  readonly past: readonly FeedCard[]
  readonly counts: FeedCounts
  /** الخطّةُ الحاليّة ومسوّداتُها التي تنتظر — بها يُرسَل «اعتمد كلّ ما ينتظر» إلى اعتماد الخطّة. */
  readonly plan: { readonly id: string; readonly awaiting: number } | null
  /** كلُّ ما ينتظر الاعتماد (من الخطّة وخارجها). */
  readonly awaitingIds: readonly string[]
  /** نافذةُ «ما نُشر»: أوّلُ يومٍ فيها، وآخرُه، ويومٌ يُفتح به ما قبلها إن بقي شيء. */
  readonly window: { readonly from: string; readonly to: string; readonly older: string | null }
  /**
   * الشهرُ المختار «YYYY-MM» بتوقيت المالك (D-389): الأعدادُ والتقويمُ له دائمًا. و`explicit` حين جاء بـ`?m=`: فالبطاقتان
   * أيضًا له وحدَه (ما نُشر فيه كلُّه لا نافذةُ الستّين). وبلا `?m=` يبقى التيّارُ تيّارًا كما في D-386.
   */
  readonly period?: string
  readonly explicit?: boolean
}

/** **مرشِّحاتُ رحلة الشهر** (D-389) — خمسٌ بأسمائها في العنوان، وكلٌّ حالاتُه من `posts` (ومعناها من `postStatus`، D-340). */
export const FEED_FILTERS = ['pending', 'approved', 'queued', 'published', 'failed'] as const
export type FeedFilter = (typeof FEED_FILTERS)[number]

export const FILTER_STATUSES: Readonly<Record<FeedFilter, readonly string[]>> = {
  pending: ['draft'], approved: ['approved', 'edited'], queued: ['queued'], published: ['published'], failed: ['failed'],
}

export function isFeedFilter(v: unknown): v is FeedFilter {
  return typeof v === 'string' && (FEED_FILTERS as readonly string[]).includes(v)
}

export function matchesFilter(c: Pick<FeedCard, 'status'>, f: FeedFilter | null): boolean {
  return f === null || FILTER_STATUSES[f].includes(c.status)
}

/** يومُ البطاقة المحلّيّ «YYYY-MM-DD»، و`null` لما لا موعدَ له. */
export function cardDay(c: Pick<FeedCard, 'at' | 'local'>, zone: string | null): string | null {
  const k = sortKey(c, zone)
  return k === '' ? null : k.slice(0, 10)
}

/** شهرُ البطاقة: شهرُ يومها، وما لا موعدَ له في شهر اليوم — يحتاج يدًا الآن. */
export function cardMonth(c: Pick<FeedCard, 'at' | 'local'>, zone: string | null, today: string): string {
  return (cardDay(c, zone) ?? today).slice(0, 7)
}

/** أعدادُ رحلة الشهر الخمسة من البطاقات — قبل أيّ مرشِّح، فالعددُ يقول ما وراء الرابط. */
export function monthTally(cards: readonly FeedCard[], zone: string | null, today: string, period: string): Readonly<Record<FeedFilter, number>> {
  const out: Record<FeedFilter, number> = { pending: 0, approved: 0, queued: 0, published: 0, failed: 0 }
  for (const c of cards) {
    if (c.kind !== 'post' || cardMonth(c, zone, today) !== period) continue
    for (const f of FEED_FILTERS) if (FILTER_STATUSES[f].includes(c.status)) out[f]++
  }
  return out
}

/** ستّون يومًا من «ما نُشر» في الصفحة. */
export const PAST_DAYS = 60

/** سقفُ ما يُقرأ من كلّ قسم — صفحةٌ لا أرشيف. */
const LIMIT = 200

interface PostRow {
  id: string
  platform: string
  text: string
  status: string
  scheduled_at: string | null
  plan_id: string | null
  created_at: string
  edited_in_sada: number | null
  published_at: string | null
}

/** يومٌ محلّيٌّ `YYYY-MM-DD` قبل `day` بـ`n` يومًا — حسابٌ على التقويم لا على اللحظة. */
function daysBefore(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  const t = Date.UTC(y, m - 1, d) - n * 86_400_000
  return new Date(t).toISOString().slice(0, 10)
}

/** مفتاحُ ترتيب البطاقة بتوقيت المالك «YYYY-MM-DD HH:MM»، وفارغٌ لما لا موعدَ له. */
export function sortKey(card: Pick<FeedCard, 'at' | 'local'>, zone: string | null): string {
  if (card.at !== null) {
    const d = parseSqliteUtc(card.at)
    if (d !== null) {
      const p = localParts(d, zone)
      return `${dayKey(d, zone)} ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
    }
  }
  return card.local === null ? '' : `${card.local.day} ${card.local.time}`
}

/** المنشوراتُ بمعرّفاتها على دفعاتٍ لا تتجاوز سقفَ D1 للمعامِلات. */
async function mediaOf(db: Db, org: string, ids: readonly string[]): Promise<Map<string, FeedMedia>> {
  const out = new Map<string, FeedMedia>()
  for (let i = 0; i < ids.length; i += 90) {
    const chunk = ids.slice(i, i + 90)
    const rows = await db
      .prepare(`SELECT id, post_id, mime, width, height FROM media WHERE org_id = ? AND status = 'ready' AND post_id IN (${chunk.map(() => '?').join(',')}) ORDER BY created_at DESC`)
      .bind(org, ...chunk)
      .all<{ id: string; post_id: string; mime: string; width: number | null; height: number | null }>()
      .then((r) => r.results).catch(() => [])
    for (const m of rows) if (!out.has(m.post_id)) out.set(m.post_id, { id: m.id, mime: m.mime, width: m.width, height: m.height })
  }
  return out
}

/** أوّلُ ما وجده الفحصُ على مفتاح بند: الممنوعُ قبل التحذير. */
function warningOf(findings: readonly Finding[], key: string): FeedCard['warning'] {
  const mine = findings.filter((f) => f.keys.includes(key))
  if (mine.length === 0) return null
  const first = mine.find((f) => f.severity === 'block') ?? mine[0]!
  return { tone: first.severity === 'block' ? 'bad' : 'warn', label: RULE_LABEL[first.rule] }
}

export async function feedModel(db: Db, org: string, zone: string | null, now: Date, before: string | null = null, month: string | null = null): Promise<FeedModel> {
  const today = dayKey(now, zone)
  const period = month ?? today.slice(0, 7)
  // ‏النافذةُ: ستّون يومًا تنتهي بـ`before` (مفتوحةً عنده) أو باليوم
  const to = before ?? today
  const from = daysBefore(to, PAST_DAYS)

  const [upcomingRows, pastRows, plan, rules] = await Promise.all([
    db.prepare(`SELECT id, platform, text, status, scheduled_at, plan_id, created_at, edited_in_sada, NULL AS published_at FROM posts
                 WHERE org_id = ? AND status IN ('draft', 'approved', 'edited', 'queued', 'failed') ORDER BY created_at DESC LIMIT ${LIMIT}`)
      .bind(org).all<PostRow>().then((r) => r.results).catch(() => []),
    db.prepare(`SELECT p.id, p.platform, p.text, p.status, p.scheduled_at, p.plan_id, p.created_at, p.edited_in_sada,
                       coalesce((SELECT max(t.at) FROM publish_attempts t WHERE t.post_id = p.id AND t.org_id = p.org_id AND t.status = 'succeeded'), p.scheduled_at) AS published_at
                  FROM posts p WHERE p.org_id = ? AND p.status = 'published' ORDER BY published_at DESC LIMIT ${LIMIT * 2}`)
      .bind(org).all<PostRow>().then((r) => r.results).catch(() => []),
    latestPlan(db, org).catch(() => null),
    readRules(db, org),
  ])

  // ‏بنودُ الخطّة الحاليّة: ما لم يُكتب بطاقةً، وما وجده الفحصُ شارةً على مسوّدته
  const warnings = new Map<string, FeedCard['warning']>()
  const items: FeedCard[] = []
  const localOf = new Map<string, { day: string; time: string }>()
  if (plan !== null && plan.status !== 'superseded') {
    const model = await reviewModel(db, org, plan)
    const findings = planChecks(await reviewCheckInput(db, org, model, zone, now), rules)
    for (const c of model.cards) {
      const w = warningOf(findings, c.key)
      if (c.post === null) {
        items.push({
          id: 'item:' + c.key, kind: 'item', platform: c.item.platform, status: 'writing', text: c.item.angle,
          at: null, local: { day: c.item.day, time: c.item.time }, planId: plan.id, media: null, metrics: null, warning: w, edited: false,
        })
      } else {
        if (w !== null) warnings.set(c.post.id, w)
        localOf.set(c.post.id, { day: c.item.day, time: c.item.time })
      }
    }
  }

  const upcomingIds = upcomingRows.map((r) => r.id)
  const pubDay = (r: PostRow): string | null => {
    const d = r.published_at === null ? null : parseSqliteUtc(r.published_at)
    return d === null ? null : dayKey(d, zone)
  }
  // ‏شهرٌ مختار (D-389): ما نُشر فيه كلُّه، ولا «أقدم»؛ وإلّا نافذةُ الستّين (D-386)
  const inWindow = pastRows.filter((r) => {
    const k = pubDay(r)
    if (k === null) return false
    if (month !== null) return k.startsWith(month)
    return k >= from && (before === null ? true : k < before)
  })
  const olderRow = month !== null ? undefined : pastRows.find((r) => {
    const k = pubDay(r)
    return k !== null && k < from
  })
  const [media, metrics] = await Promise.all([
    mediaOf(db, org, [...upcomingIds, ...inWindow.map((r) => r.id)]),
    metricsFor(db, org, inWindow.map((r) => r.id)),
  ])

  const toCard = (r: PostRow, at: string | null): FeedCard => {
    const m = widest(metrics[r.id] ?? [])
    return {
      id: r.id, kind: 'post', platform: r.platform, status: r.status, text: r.text, at,
      local: at === null ? localOf.get(r.id) ?? null : null,
      planId: r.plan_id, media: media.get(r.id) ?? null,
      metrics: m === null ? null : { impressions: m.impressions, reactions: m.reactions, comments: m.comments, shares: m.shares },
      warning: warnings.get(r.id) ?? null, edited: r.edited_in_sada === 1,
    }
  }
  const upcoming = [...upcomingRows.map((r) => toCard(r, r.status === 'queued' || r.status === 'failed' ? r.scheduled_at : null)), ...items]
    .filter((c) => month === null || cardMonth(c, zone, today) === month)
    .sort((a, b) => {
      const ka = sortKey(a, zone)
      const kb = sortKey(b, zone)
      // ‏ما لا موعدَ له أوّلًا: يحتاج يدًا. ثمّ الأقربُ فالأبعد
      if (ka === '' || kb === '') return ka === kb ? 0 : ka === '' ? -1 : 1
      return ka.localeCompare(kb)
    })
  const past = inWindow.map((r) => toCard(r, r.published_at)).sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))

  const awaitingIds = upcomingRows.filter((r) => r.status === 'draft').map((r) => r.id)
  return {
    upcoming, past,
    counts: {
      published: pastRows.filter((r) => r.published_at !== null && dayKey(parseSqliteUtc(r.published_at) ?? now, zone).startsWith(period)).length,
      queued: upcomingRows.filter((r) => r.status === 'queued').length,
      awaiting: awaitingIds.length,
      writing: items.length,
    },
    plan: plan === null ? null : { id: plan.id, awaiting: upcomingRows.filter((r) => r.status === 'draft' && r.plan_id === plan.id).length },
    awaitingIds,
    window: { from, to, older: olderRow === undefined ? null : from },
    period, explicit: month !== null,
  }
}

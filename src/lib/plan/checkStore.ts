/**
 * **ما تقرؤه بوّابةُ الفحص وما تكتبه** (D-383 · المرحلة ٥): عتباتُ `schedule_rules`، ومُدخَلُ `planChecks` لخطّةٍ في المراجعة
 * أو لنسخة حزمةٍ قبل البناء — منشوراتُ المنظّمة في الأيّام نفسِها بتوقيت المالك، والحساباتُ النشطة.
 */
import type { Db } from '../tokens'
import { localParts } from '../time/zone'
import { DEFAULT_RULES, minutesOf, rulesFromRow, type CheckInput, type CheckItem, type LocalAt, type OtherPost, type ScheduleRules } from './checks'
import type { ReviewModel } from './review'
import type { SnapshotEntry } from '../package/diff'

export async function readRules(db: Db, org: string): Promise<ScheduleRules> {
  const row = await db.prepare('SELECT platform_caps_json, daily_total_cap, min_gap_minutes, quiet_start, quiet_end, jitter_minutes FROM schedule_rules WHERE org_id = ?')
    .bind(org)
    .first<{ platform_caps_json: string; daily_total_cap: number; min_gap_minutes: number; quiet_start: string; quiet_end: string; jitter_minutes: number }>()
    .catch(() => null)
  return row === null ? DEFAULT_RULES : rulesFromRow(row)
}

export async function writeRules(db: Db, org: string, rules: ScheduleRules, by: string): Promise<void> {
  await db.prepare(`INSERT INTO schedule_rules (org_id, platform_caps_json, daily_total_cap, min_gap_minutes, quiet_start, quiet_end, jitter_minutes, updated_by, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
                    ON CONFLICT(org_id) DO UPDATE SET platform_caps_json = excluded.platform_caps_json, daily_total_cap = excluded.daily_total_cap,
                      min_gap_minutes = excluded.min_gap_minutes, quiet_start = excluded.quiet_start, quiet_end = excluded.quiet_end,
                      jitter_minutes = excluded.jitter_minutes, updated_by = excluded.updated_by, updated_at = excluded.updated_at`)
    .bind(org, JSON.stringify(rules.platformCaps), rules.dailyTotalCap, rules.minGapMinutes, rules.quietStart, rules.quietEnd, rules.jitterMinutes, by)
    .run()
}

/** لحظةٌ بـ UTC إلى يومٍ ودقيقةٍ بتوقيت المالك. */
export function toLocal(at: Date, zone: string | null): LocalAt {
  const p = localParts(at, zone)
  return { day: String(p.year) + '-' + String(p.month).padStart(2, '0') + '-' + String(p.day).padStart(2, '0'), minutes: p.hour * 60 + p.minute }
}

const localOf = (day: string, time: string): LocalAt | null => {
  const m = minutesOf(time)
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && m !== null ? { day, minutes: m } : null
}

const isoUtc = (s: string): Date => new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s.replace(' ', 'T') + 'Z')

/** منشوراتُ المنظّمة غير المرفوضة حول هذه الأيّام، ما عدا ما يُستثنى (منشوراتُ الخطّة نفسِها). */
async function othersAround(db: Db, org: string, days: readonly string[], zone: string | null, exclude: (r: { id: string; plan_id: string | null; package_item_no: string | null }) => boolean): Promise<OtherPost[]> {
  if (days.length === 0) return []
  const sorted = [...days].sort()
  // ‏يومٌ قبل الأوّل ويومٌ بعد الآخر: فرقُ المنطقة عن UTC لا يُسقط منشورًا على حافّة اليوم
  const from = new Date(Date.parse(sorted[0]! + 'T00:00:00Z') - 86_400_000).toISOString().slice(0, 16)
  const to = new Date(Date.parse(sorted[sorted.length - 1]! + 'T00:00:00Z') + 2 * 86_400_000).toISOString().slice(0, 16)
  const rows = await db.prepare(`SELECT id, platform, plan_id, package_item_no, scheduled_at, text FROM posts
                                   WHERE org_id = ? AND status IN ('approved', 'queued', 'published') AND scheduled_at IS NOT NULL
                                     AND scheduled_at >= ? AND scheduled_at < ? LIMIT 500`)
    .bind(org, from, to)
    .all<{ id: string; platform: string; plan_id: string | null; package_item_no: string | null; scheduled_at: string; text: string }>()
    .then((r) => r.results).catch(() => [])
  const want = new Set(days)
  return rows.filter((r) => !exclude(r)).map((r) => ({ id: r.id, platform: r.platform, planId: r.plan_id, at: toLocal(isoUtc(r.scheduled_at), zone) }))
    .filter((o) => want.has(o.at.day))
}

async function activePlatforms(db: Db, org: string): Promise<string[]> {
  return db.prepare("SELECT DISTINCT platform FROM accounts WHERE org_id = ? AND status = 'active'").bind(org)
    .all<{ platform: string }>().then((r) => r.results.map((x) => x.platform)).catch(() => [])
}

/** نوعُ وسيط البطاقة من `mediaMime` — لما كُتبت مسوّدتُه وحدَه؛ وما لم يُكتب لا يُحكم عليه (مراجعة D-399). */
export function cardMedia(c: { readonly post: unknown; readonly mediaMime?: string | null }): { media?: 'image' | 'video' | 'none' } {
  if (c.post === null) return {}
  const m = c.mediaMime ?? null
  return { media: m === null ? 'none' : m.startsWith('video/') ? 'video' : 'image' }
}

/** مُدخَلُ الفحص لخطّة المراجعة: البطاقةُ بندٌ، وساعتُه بتوقيت المالك (D-383 · المرحلة ١). */
export async function reviewCheckInput(db: Db, org: string, model: ReviewModel, zone: string | null, now: Date): Promise<CheckInput> {
  const items: CheckItem[] = model.cards.map((c) => ({
    key: c.key,
    platform: c.item.platform,
    at: c.post?.scheduledAt != null && c.post.status === 'queued' ? toLocal(isoUtc(c.post.scheduledAt), zone) : localOf(c.item.day, c.item.time),
    // ‏ما لم تُكتب مسوّدتُه يُكتب قبل الجدولة — فالزاويةُ نصُّه في الفحص، ولا يُمنع لأنّه لم يُكتب بعد
    text: c.post?.text ?? c.item.angle,
    mediaMissing: c.gaps.includes('no_image'),
    // ‏ونوعُ الوسيط لما كُتبت مسوّدتُه (مراجعة D-399): TikTok بلا مقطعٍ وInstagram بلا وسيطٍ يُمنعان قبل الجدولة
    ...cardMedia(c),
    kind: c.item.kind ?? null,
    status: c.post?.status ?? null,
    contentKey: c.post === null ? 'none:' + c.key : 't:' + c.post.text.replace(/\s+/g, ' ').trim(),
  }))
  const ids = new Set(model.cards.flatMap((c) => (c.post === null ? [] : [c.post.id])))
  const days = [...new Set(items.flatMap((i) => (i.at === null ? [] : [i.at.day])))]
  const [others, active] = await Promise.all([
    othersAround(db, org, days, zone, (r) => ids.has(r.id) || r.plan_id === model.plan.id),
    activePlatforms(db, org),
  ])
  return { planId: model.plan.id, items, others, activePlatforms: active, now: toLocal(now, zone) }
}

/** بصمةُ صفّ الحزمة: رقمُ مادّته ومنصّتُه ويومُه — كما يراها المالك في جدول «الصفوف». */
export const packageRowKey = (r: Pick<SnapshotEntry, 'item' | 'platform' | 'date'>): string => r.date + '|' + r.item + '|' + r.platform

/** مُدخَلُ الفحص لنسخة حزمةٍ قبل البناء: الصفوفُ بندودٌ بتوقيت المالك، ومنشوراتُ الحزمة نفسِها لا تُعدّ «قائمةً» عليها. */
export async function packageCheckInput(db: Db, org: string, rows: readonly (SnapshotEntry & { readonly shown?: { readonly kind: string } })[], zone: string | null, now: Date): Promise<CheckInput> {
  const items: CheckItem[] = rows.map((r) => ({
    key: packageRowKey(r),
    platform: r.platform,
    at: localOf(r.date, r.time),
    // ‏ما ينقصه نصُّه يُكتب من فكرته وفق الإرشادات قبل الجدولة، فلا يُمنع هنا بل يُقال في «نصٌّ جاهز»
    text: r.text ?? r.idea,
    contentKey: 'item:' + r.item,
    mediaMissing: r.shown?.kind === 'none',
    // ‏ونوعُه لمنصّةٍ تحتاج وسيطًا (D-399): صفُّ Instagram بلا صورةٍ أو صفُّ TikTok بلا مقطعٍ يُمنع
    ...(r.shown === undefined ? {} : { media: r.shown.kind === 'video' ? 'video' as const : r.shown.kind === 'none' ? 'none' as const : 'image' as const }),
    kind: /سلسلة|thread/i.test(r.format) ? 'thread' : null,
  }))
  const days = [...new Set(items.flatMap((i) => (i.at === null ? [] : [i.at.day])))]
  const [others, active] = await Promise.all([
    othersAround(db, org, days, zone, (r) => r.package_item_no !== null),
    activePlatforms(db, org),
  ])
  return { planId: null, items, others, activePlatforms: active, now: toLocal(now, zone) }
}

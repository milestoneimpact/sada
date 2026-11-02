/**
 * **مراجعةُ الخطّة وتثبيتُها بإصدار** (D-286) — الطلبُ ب من «الخطّةُ محورَ المنصّة».
 *
 * ## بندٌ ومسوّدتُه في بطاقةٍ واحدة
 *
 * الخطّةُ بنودٌ (يومٌ ومنصّةٌ وزاوية)، و«ابدأ» يكتب لكلّ بندٍ مسوّدةً بصورتها. وكان المالكُ يرى البنودَ في «رحلة العميل»
 * والمسوّداتِ في «المنشورات» — شاشتان لشيءٍ واحد. فالمراجعةُ تضمّهما: **البطاقةُ بندٌ، وفيها نصُّ مسوّدته وصورتُها وحالُها**،
 * والأفعالُ عليها أربعة: اعتمد · عدّل · أخّر · احذف.
 *
 * ## «ما ينقص» قبل «ثبّت»
 *
 * سطرٌ واحدٌ فوق البطاقات يعدّ ما يمنع خطّةً جاهزة: بندٌ لم تُكتب مسوّدتُه، ومسوّدةٌ بلا صورة (حين اختيرت صورة)، وما ينتظر
 * اعتمادَك، وموعدان لمنصّةٍ واحدةٍ في الساعة نفسِها. **وكلُّ رقمٍ رابطٌ إلى أوّل بطاقةٍ فيه.**
 *
 * ## التثبيتُ إصدار (بقرار المالك: «تعديلٌ بإصدارٍ جديد، والأصلُ لا يُمسح»)
 *
 * «ثبّت» يحفظ صورةَ البنود في `plan_versions` ويجدول المعتمَدَ بـ `schedulePlan` نفسِها. وأوّلُ تعديلٍ بعده يرفع رقمَ الإصدار
 * ويُفرغ `locked_at` — **والإصدارُ المثبَّتُ باقٍ كما ثُبّت**، والمنشوراتُ المجدولةُ لا تتحرّك إلّا بفعلٍ على بطاقتها.
 */
import type { Db } from '../tokens'
import { decide, undoApprove } from '../draft/store'
import { reschedulePost } from '../schedule/job'
import { schedulePlan, type PlanSchedule } from './schedule'
import { dayWithin, touchPlan } from './edit'
import { asSpan, type PlanItem } from './prompt'
import type { StoredPlan } from './job'

export interface ReviewCard {
  /** موضعُ البند في الخطّة — وبصمتُه (`key`) تُرسَل معه فلا يُصيب فعلٌ من صفحةٍ قديمةٍ بندًا آخر. */
  readonly index: number
  readonly key: string
  readonly item: PlanItem
  readonly post: { readonly id: string; readonly text: string; readonly status: string; readonly scheduledAt: string | null } | null
  readonly mediaId: string | null
  /** نوعُ الوسيط — للمعاينة بشكل المنصّة (D-288). */
  readonly mediaMime?: string | null
  /** ما ينقص هذه البطاقةَ وحدَها. */
  readonly gaps: readonly Gap[]
}

export type Gap = 'unwritten' | 'no_image' | 'pending' | 'clash'

export const GAP_LABEL: Readonly<Record<Gap, string>> = {
  unwritten: 'لم تُكتب بعد',
  no_image: 'بلا صورة',
  pending: 'تنتظر اعتمادك',
  clash: 'موعدٌ مكرَّر',
}

export interface PlanVersion {
  readonly version: number
  readonly lockedAt: string
  readonly lockedBy: string | null
  readonly scheduled: number
  readonly items: number
}

export interface ReviewModel {
  readonly plan: StoredPlan
  readonly version: number
  readonly lockedAt: string | null
  readonly cards: readonly ReviewCard[]
  readonly gaps: Readonly<Record<Gap, number>>
  readonly versions: readonly PlanVersion[]
}

/** بصمةُ البند: مصدرُه ومنصّتُه ويومُه وساعتُه — ما يتغيّر بفعلٍ عليه أو على غيره. */
export function itemKey(item: PlanItem): string {
  return `${item.sourceId}|${item.platform}|${item.day}|${item.time}`
}

function refsOf(raw: string | null): string[] {
  try {
    const parsed = JSON.parse(raw ?? '[]') as unknown
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export async function reviewModel(db: Db, org: string, plan: StoredPlan): Promise<ReviewModel> {
  const [meta, posts, media, versions] = await Promise.all([
    db.prepare('SELECT version, locked_at FROM plans WHERE id = ? AND org_id = ?').bind(plan.id, org)
      .first<{ version: number; locked_at: string | null }>().catch(() => null),
    db.prepare(`SELECT id, platform, text, status, scheduled_at, source_id, source_refs FROM posts
                 WHERE org_id = ? AND plan_id = ? AND status <> 'rejected' ORDER BY created_at`)
      .bind(org, plan.id)
      .all<{ id: string; platform: string; text: string; status: string; scheduled_at: string | null; source_id: string | null; source_refs: string | null }>()
      .then((r) => r.results).catch(() => []),
    db.prepare(`SELECT m.id, m.post_id, m.mime FROM media m JOIN posts p ON p.id = m.post_id AND p.org_id = m.org_id
                 WHERE m.org_id = ? AND p.plan_id = ? AND m.status = 'ready' ORDER BY m.created_at DESC`)
      .bind(org, plan.id)
      .all<{ id: string; post_id: string; mime: string }>().then((r) => r.results).catch(() => []),
    db.prepare('SELECT version, plan_json, scheduled, locked_by, locked_at FROM plan_versions WHERE org_id = ? AND plan_id = ? ORDER BY version DESC')
      .bind(org, plan.id)
      .all<{ version: number; plan_json: string; scheduled: number; locked_by: string | null; locked_at: string }>()
      .then((r) => r.results).catch(() => []),
  ])
  const wantsImage = plan.choices.autoImage
  const latestMedia = new Map<string, string>()
  const mimeOf = new Map<string, string>()
  for (const m of media) if (!latestMedia.has(m.post_id)) { latestMedia.set(m.post_id, m.id); mimeOf.set(m.id, m.mime) }
  const slots = new Map<string, number>()
  for (const i of plan.plan.items) slots.set(`${i.platform}|${i.day}|${i.time}`, (slots.get(`${i.platform}|${i.day}|${i.time}`) ?? 0) + 1)

  const cards: ReviewCard[] = plan.plan.items.map((item, index) => {
    const row = posts.find((p) => p.platform === item.platform && (p.source_id === item.sourceId || refsOf(p.source_refs).includes(item.sourceId))) ?? null
    const mediaId = row === null ? null : latestMedia.get(row.id) ?? null
    const gaps: Gap[] = []
    if (row === null) gaps.push('unwritten')
    else {
      if (wantsImage && mediaId === null && item.kind !== 'video') gaps.push('no_image')
      if (row.status === 'draft') gaps.push('pending')
    }
    if ((slots.get(`${item.platform}|${item.day}|${item.time}`) ?? 0) > 1) gaps.push('clash')
    return {
      index, key: itemKey(item), item, mediaId, mediaMime: mediaId === null ? null : mimeOf.get(mediaId) ?? null, gaps,
      post: row === null ? null : { id: row.id, text: row.text, status: row.status, scheduledAt: row.scheduled_at },
    }
  })
  const gaps: Record<Gap, number> = { unwritten: 0, no_image: 0, pending: 0, clash: 0 }
  for (const c of cards) for (const g of c.gaps) gaps[g] += 1
  return {
    plan,
    version: meta?.version ?? 1,
    lockedAt: meta?.locked_at ?? null,
    cards,
    gaps,
    versions: versions.map((v) => {
      let items = 0
      try { items = (JSON.parse(v.plan_json) as { items?: unknown[] }).items?.length ?? 0 } catch { items = 0 }
      return { version: v.version, lockedAt: v.locked_at, lockedBy: v.locked_by, scheduled: v.scheduled, items }
    }),
  }
}

type Act = { readonly ok: true; readonly note?: string } | { readonly ok: false; readonly reason: string }

async function itemAt(db: Db, org: string, planId: string, index: number, key: string): Promise<{ plan: { items: PlanItem[] }; start: string; span: string } | string> {
  const row = await db
    .prepare("SELECT plan_json, week_start, span, status FROM plans WHERE id = ? AND org_id = ?")
    .bind(planId, org)
    .first<{ plan_json: string; week_start: string; span: string; status: string }>()
  if (row === null || row.status === 'superseded') return 'لا خطّة بهذا المعرّف'
  const plan = JSON.parse(row.plan_json) as { items: PlanItem[] }
  const item = Number.isInteger(index) ? plan.items[index] : undefined
  // ‏والبصمةُ تمنع فعلًا من صفحةٍ قديمةٍ يُصيب بندًا تبدّل موضعُه
  if (item === undefined || itemKey(item) !== key) return 'تغيّرت الخطّة منذ فتحت الصفحة — أعد تحميلها'
  return { plan, start: row.week_start, span: row.span }
}

function shiftDay(day: string, days: number): string {
  const at = new Date(`${day}T00:00:00Z`)
  at.setUTCDate(at.getUTCDate() + days)
  return at.toISOString().slice(0, 10)
}

/**
 * **أخّر**: يومًا أو أسبوعًا، داخل مدى الخطّة. ومسوّدةٌ جُدولت يتحرّك موعدُها معه بـ `reschedulePost` وحرّاسِه.
 */
export async function delayItem(db: Db, org: string, planId: string, index: number, key: string, days: number, now: Date): Promise<Act> {
  if (days !== 1 && days !== 7) return { ok: false, reason: 'التأخيرُ يومٌ أو أسبوع' }
  const at = await itemAt(db, org, planId, index, key)
  if (typeof at === 'string') return { ok: false, reason: at }
  const item = at.plan.items[index]!
  const day = shiftDay(item.day, days)
  if (!dayWithin(day, at.start, asSpan(at.span))) return { ok: false, reason: 'التأخيرُ يُخرجه من مدى الخطّة — احذفه أو انقله إلى خطّةٍ تالية' }
  at.plan.items[index] = { ...item, day }
  await db.prepare('UPDATE plans SET plan_json = ? WHERE id = ? AND org_id = ?').bind(JSON.stringify(at.plan), planId, org).run()
  await touchPlan(db, org, planId)
  const queued = await db
    .prepare("SELECT id, scheduled_at FROM posts WHERE org_id = ? AND plan_id = ? AND platform = ? AND (source_id = ? OR source_refs LIKE ?) AND status = 'queued'")
    .bind(org, planId, item.platform, item.sourceId, `%"${item.sourceId}"%`)
    .first<{ id: string; scheduled_at: string | null }>()
  if (queued !== null && queued.scheduled_at !== null) {
    const moved = new Date(queued.scheduled_at.replace(' ', 'T') + 'Z')
    moved.setUTCDate(moved.getUTCDate() + days)
    const r = await reschedulePost(db, queued.id, moved.toISOString().slice(0, 16), now, org)
    if (!r.ok) return { ok: true, note: `أُخّر البند، ولم يتحرّك موعدُ منشوره: ${r.reason}` }
  }
  return { ok: true }
}

/**
 * **احذف**: البندُ يخرج من الخطّة، ومسوّدتُه تُرفض (تبقى بكلفتها، فما دُفع ثمنُه يُرى). ومنشورٌ جُدول لا يُحذف من هنا:
 * يُلغى موعدُه من بطاقته أوّلًا، فلا يختفي منشورٌ مجدولٌ بضغطةٍ في مراجعة.
 */
export async function dropItem(db: Db, org: string, planId: string, index: number, key: string, by: string): Promise<Act> {
  const at = await itemAt(db, org, planId, index, key)
  if (typeof at === 'string') return { ok: false, reason: at }
  const item = at.plan.items[index]!
  const post = await db
    .prepare("SELECT id, status FROM posts WHERE org_id = ? AND plan_id = ? AND platform = ? AND (source_id = ? OR source_refs LIKE ?) AND status <> 'rejected'")
    .bind(org, planId, item.platform, item.sourceId, `%"${item.sourceId}"%`)
    .first<{ id: string; status: string }>()
  if (post !== null && (post.status === 'queued' || post.status === 'published')) {
    return { ok: false, reason: post.status === 'queued' ? 'منشورُه مجدول — ألغِ موعدَه من بطاقته أوّلًا' : 'نُشر منشورُه — لا يُحذف من الخطّة' }
  }
  at.plan.items.splice(index, 1)
  await db.prepare('UPDATE plans SET plan_json = ? WHERE id = ? AND org_id = ?').bind(JSON.stringify(at.plan), planId, org).run()
  await touchPlan(db, org, planId)
  // ‏والمعتمَدُ يُردّ مسوّدةً أوّلًا بـ`undoApprove` نفسِها، ثمّ يُرفض — فلا يبقى منشورٌ معتمَدٌ بلا بندٍ يجدوله «ثبّت»
  if (post !== null && (post.status === 'approved' || post.status === 'edited')) await undoApprove(db, org, post.id)
  if (post !== null) await decide(db, org, post.id, { kind: 'reject' }, by)
  return { ok: true }
}

/**
 * **ثبّت الخطّة**: صورةُ البنود في `plan_versions` بإصدارها، ثمّ جدولةُ المعتمَد بـ `schedulePlan`. وما لم يُعتمد يبقى مسوّدةً
 * تنتظر، يُقال عددُه ولا يُجدوَل. وتثبيتُ إصدارٍ مثبَّتٍ من قبل لا يكتب صورةً ثانية.
 */
export async function pinPlan(db: Db, org: string, plan: StoredPlan, by: string, now: Date): Promise<PlanSchedule & { readonly version: number; readonly already: boolean }> {
  const meta = await db
    .prepare('SELECT version, locked_at, plan_json FROM plans WHERE id = ? AND org_id = ?')
    .bind(plan.id, org)
    .first<{ version: number; locked_at: string | null; plan_json: string }>()
  const version = meta?.version ?? 1
  if (meta !== null && meta.locked_at !== null) return { scheduled: 0, skipped: [], version, already: true }
  const result = await schedulePlan(db, org, plan, now)
  await db
    .prepare(`INSERT INTO plan_versions (id, plan_id, version, plan_json, scheduled, locked_by, org_id) VALUES (?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT (plan_id, version) DO NOTHING`)
    .bind(crypto.randomUUID(), plan.id, version, meta?.plan_json ?? JSON.stringify(plan.plan), result.scheduled, by, org)
    .run()
  await db.prepare("UPDATE plans SET locked_at = datetime('now'), status = 'approved' WHERE id = ? AND org_id = ?").bind(plan.id, org).run()
  return { ...result, version, already: false }
}

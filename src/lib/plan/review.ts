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
import { draftFailures, draftRef } from './draftFail'
import { decide, undoApprove } from '../draft/store'
import { reschedulePost, unschedule } from '../schedule/job'
import { itemOwns, schedulePlan, type PlanSchedule } from './schedule'
import { localToUtc } from '../time/local'
import { storedZone } from '../time/ownerZone'
import { dayWithin, touchPlan } from './edit'
import { asSpan, imageFor, type PlanItem } from './prompt'
import type { StoredPlan } from './job'

export interface ReviewCard {
  /** موضعُ البند في الخطّة — وبصمتُه (`key`) تُرسَل معه فلا يُصيب فعلٌ من صفحةٍ قديمةٍ بندًا آخر. */
  readonly index: number
  readonly key: string
  readonly item: PlanItem
  readonly post: { readonly id: string; readonly text: string; readonly status: string; readonly scheduledAt: string | null; readonly edited?: boolean } | null
  readonly mediaId: string | null
  /** نوعُ الوسيط — للمعاينة بشكل المنصّة (D-288). */
  readonly mediaMime?: string | null
  /** أبعادُه كما حُفظت — يُحجز بها مكانُ الصورة قبل أن تصل (D-333). */
  readonly mediaWidth?: number | null
  readonly mediaHeight?: number | null
  /** ما ينقص هذه البطاقةَ وحدَها. */
  readonly gaps: readonly Gap[]
  /** سببُ تعذّر كتابتها (PL-23) — لبطاقةٍ بلا مسوّدة وحدها. */
  readonly failed?: string
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
  /** الاستيرادُ الذي صنع الإصدار (D-383 · 0061)، وغيابُه إصدارٌ من المعالج أو قبل 0061. */
  readonly importJobId?: string
}

export interface ReviewModel {
  readonly plan: StoredPlan
  readonly version: number
  readonly lockedAt: string | null
  readonly cards: readonly ReviewCard[]
  readonly gaps: Readonly<Record<Gap, number>>
  readonly versions: readonly PlanVersion[]
  /** اسمُ كلّ مصدرٍ في الخطّة بمعرّفه (D-345) — به يدلّ المنشورُ على أصله. وغيابُه (فكرةٌ، أو مصدرٌ حُذف) لا يُرسم. */
  readonly sourceNames?: Readonly<Record<string, string>>
}

/** بصمةُ البند: مصدرُه ومنصّتُه ويومُه وساعتُه — ما يتغيّر بفعلٍ عليه أو على غيره. */
export function itemKey(item: PlanItem): string {
  return `${item.id ?? item.sourceId}|${item.platform}|${item.day}|${item.time}`
}

export async function reviewModel(db: Db, org: string, plan: StoredPlan): Promise<ReviewModel> {
  const [meta, posts, media, versions, failures] = await Promise.all([
    db.prepare('SELECT version, locked_at FROM plans WHERE id = ? AND org_id = ?').bind(plan.id, org)
      .first<{ version: number; locked_at: string | null }>().catch(() => null),
    db.prepare(`SELECT id, platform, text, status, scheduled_at, source_id, source_refs, idempotency_key, edited_in_sada FROM posts
                 WHERE org_id = ? AND plan_id = ? AND status <> 'rejected' ORDER BY created_at`)
      .bind(org, plan.id)
      .all<{ id: string; platform: string; text: string; status: string; scheduled_at: string | null; source_id: string | null; source_refs: string | null; idempotency_key: string; edited_in_sada?: number }>()
      .then((r) => r.results).catch(() => []),
    db.prepare(`SELECT m.id, m.post_id, m.mime, m.width, m.height FROM media m JOIN posts p ON p.id = m.post_id AND p.org_id = m.org_id
                 WHERE m.org_id = ? AND p.plan_id = ? AND m.status = 'ready' ORDER BY m.created_at DESC`)
      .bind(org, plan.id)
      .all<{ id: string; post_id: string; mime: string; width: number | null; height: number | null }>().then((r) => r.results).catch(() => []),
    db.prepare('SELECT version, plan_json, scheduled, locked_by, locked_at, import_job_id FROM plan_versions WHERE org_id = ? AND plan_id = ? ORDER BY version DESC')
      .bind(org, plan.id)
      .all<{ version: number; plan_json: string; scheduled: number; locked_by: string | null; locked_at: string; import_job_id?: string | null }>()
      .then((r) => r.results).catch(() => []),
    draftFailures(db, org, plan.id),
  ])
  const latestMedia = new Map<string, string>()
  const mimeOf = new Map<string, string>()
  const dimsOf = new Map<string, { width: number | null; height: number | null }>()
  for (const m of media) if (!latestMedia.has(m.post_id)) { latestMedia.set(m.post_id, m.id); mimeOf.set(m.id, m.mime); dimsOf.set(m.id, { width: m.width, height: m.height }) }
  const slots = new Map<string, number>()
  for (const i of plan.plan.items) slots.set(`${i.platform}|${i.day}|${i.time}`, (slots.get(`${i.platform}|${i.day}|${i.time}`) ?? 0) + 1)

  const cards: ReviewCard[] = plan.plan.items.map((item, index) => {
    // ‏وبندُ السلسلة لمسوّدة السلسلة (مراجعة D-324): المصدرُ والمنصّةُ وحدهما يجمعان البندين على مسوّدةٍ واحدة
    const row = posts.find((p) => itemOwns(item, p)) ?? null
    const mediaId = row === null ? null : latestMedia.get(row.id) ?? null
    const gaps: Gap[] = []
    if (row === null) gaps.push('unwritten')
    else {
      // ‏والصورةُ تُطلب بمنصّتها (D-329): «بلا صورة» لـ X لا تجعل منشوراتِها ناقصة
      if (imageFor(plan.choices, item.platform) !== 'none' && mediaId === null && item.kind !== 'video') gaps.push('no_image')
      if (row.status === 'draft') gaps.push('pending')
    }
    if ((slots.get(`${item.platform}|${item.day}|${item.time}`) ?? 0) > 1) gaps.push('clash')
    return {
      index, key: itemKey(item), item, mediaId, mediaMime: mediaId === null ? null : mimeOf.get(mediaId) ?? null, gaps,
      mediaWidth: mediaId === null ? null : dimsOf.get(mediaId)?.width ?? null, mediaHeight: mediaId === null ? null : dimsOf.get(mediaId)?.height ?? null,
      post: row === null ? null : { id: row.id, text: row.text, status: row.status, scheduledAt: row.scheduled_at, edited: row.edited_in_sada === 1 },
      ...(row === null && failures.has(draftRef(item.id, item.sourceId, item.platform)) ? { failed: failures.get(draftRef(item.id, item.sourceId, item.platform))! } : {}),
    }
  })
  const named = await db.prepare('SELECT id, name FROM sources WHERE org_id = ? LIMIT 500').bind(org)
    .all<{ id: string; name: string }>().then((r) => r.results).catch(() => [])
  const inPlan = new Set(plan.plan.items.map((i) => i.sourceId))
  const sourceNames = Object.fromEntries(named.filter((s) => inPlan.has(s.id)).map((s) => [s.id, s.name]))
  const gaps: Record<Gap, number> = { unwritten: 0, no_image: 0, pending: 0, clash: 0 }
  for (const c of cards) for (const g of c.gaps) gaps[g] += 1
  return {
    plan,
    version: meta?.version ?? 1,
    lockedAt: meta?.locked_at ?? null,
    sourceNames,
    cards,
    gaps,
    versions: versions.map((v) => {
      let items = 0
      try { items = (JSON.parse(v.plan_json) as { items?: unknown[] }).items?.length ?? 0 } catch { items = 0 }
      return { version: v.version, lockedAt: v.locked_at, lockedBy: v.locked_by, scheduled: v.scheduled, items, ...(v.import_job_id == null ? {} : { importJobId: v.import_job_id }) }
    }),
  }
}

/**
 * مسوّدةُ البند في خطّته — بالمطابقة نفسِها التي تقرأ بها المراجعةُ والجدولة (`itemOwns`)، فلا يُصيب فعلٌ على بندٍ مسوّدةَ
 * بندٍ آخر من المصدر نفسِه. و`where` شرطُ الحال، ثابتٌ من الشيفرة لا من مدخل.
 */
async function postOf(
  db: Db, org: string, planId: string, item: PlanItem, where: "status = 'queued'" | "status <> 'rejected'",
): Promise<{ id: string; status: string; scheduled_at: string | null } | null> {
  const { results } = await db
    .prepare(`SELECT id, status, scheduled_at, platform, source_id, source_refs, idempotency_key FROM posts
               WHERE org_id = ? AND plan_id = ? AND platform = ? AND ${where} ORDER BY created_at`)
    .bind(org, planId, item.platform)
    .all<{ id: string; status: string; scheduled_at: string | null; platform: string; source_id: string | null; source_refs: string | null; idempotency_key: string }>()
  return results.find((p) => itemOwns(item, p)) ?? null
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
  const queued = await postOf(db, org, planId, item, "status = 'queued'")
  if (queued !== null && queued.scheduled_at !== null) {
    const moved = new Date(queued.scheduled_at.replace(' ', 'T') + 'Z')
    moved.setUTCDate(moved.getUTCDate() + days)
    const r = await reschedulePost(db, queued.id, moved.toISOString().slice(0, 16), now, org)
    if (!r.ok) return { ok: true, note: `أُخّر البند، ولم يتحرّك موعدُ منشوره: ${r.reason}` }
  }
  return { ok: true }
}

/**
 * **انقل** (D-330): البندُ إلى يومٍ وساعةٍ (بتوقيت المالك، D-383) داخل مدى الخطّة — بالسحب في اللوحة أو من لوح البطاقة. ومسوّدتُه المجدولةُ
 * يتحرّك موعدُها معه بـ `reschedulePost` وحرّاسِه (لا ماضٍ، ولا ما أُرسل للنشر)؛ **وإن رُدّ تحريكُها لم يتحرّك البندُ**، فلا
 * يقول التقويمُ يومًا والمنشورُ يخرج في غيره. وما نُشر لا يُنقل.
 */
export async function moveItem(db: Db, org: string, planId: string, index: number, key: string, to: { readonly day: string; readonly time: string }, now: Date): Promise<Act> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(to.day) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(to.time)) return { ok: false, reason: 'يومٌ أو ساعةٌ غير صالحة' }
  const at = await itemAt(db, org, planId, index, key)
  if (typeof at === 'string') return { ok: false, reason: at }
  const item = at.plan.items[index]!
  if (item.day === to.day && item.time === to.time) return { ok: true }
  if (!dayWithin(to.day, at.start, asSpan(at.span))) return { ok: false, reason: 'اليومُ خارج مدى الخطّة' }
  const post = await postOf(db, org, planId, item, "status <> 'rejected'")
  if (post !== null && post.status === 'published') return { ok: false, reason: 'نُشر منشورُه — لا يُنقل' }
  if (post !== null && post.status === 'queued') {
    // ‏ساعةُ البند بتوقيت المالك، والتخزينُ بـ UTC (D-383) — كما تفعل `slotFor`
    const [y, mo, d] = to.day.split('-').map(Number) as [number, number, number]
    const [h, mi] = to.time.split(':').map(Number) as [number, number]
    const utc = localToUtc(y, mo, d, h, mi, await storedZone(db))
    if (utc === null) return { ok: false, reason: 'هذه الساعةُ لا وجودَ لها بتوقيتك' }
    const r = await reschedulePost(db, post.id, utc.toISOString().slice(0, 16), now, org)
    if (!r.ok) return { ok: false, reason: `لم يُنقل: ${r.reason}` }
  }
  at.plan.items[index] = { ...item, day: to.day, time: to.time }
  await db.prepare('UPDATE plans SET plan_json = ? WHERE id = ? AND org_id = ?').bind(JSON.stringify(at.plan), planId, org).run()
  await touchPlan(db, org, planId)
  return { ok: true }
}

/** أكثرُ ما يحمله يومٌ واحدٌ على منصّةٍ واحدة — كما في إيقاع المعالج (D-329). */
export const MAX_PER_DAY = 3

/**
 * **أضف منشورًا** (D-336): بندٌ يكتبه المالك بيده في يومٍ من الخطّة — منصّتُه من قنواتها، وزاويتُه جملتُه، ومصدرُه مصدرُ بندٍ فيها
 * (فالمسوّدةُ تُكتب من مادّةٍ قرأها صدى لا من فراغ). يُعاد البندُ بمعرّفه ليُرسَل إلى الكتابة. والخطّةُ المثبَّتةُ تصير «عُدّلت بعد التثبيت»
 * بـ`touchPlan` كأيّ تعديل.
 */
export async function addItem(
  db: Db, org: string, planId: string,
  input: { readonly day: string; readonly time: string; readonly platform: string; readonly angle: string },
): Promise<{ readonly ok: true; readonly item: PlanItem } | { readonly ok: false; readonly reason: string }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.day) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time)) return { ok: false, reason: 'يومٌ أو ساعةٌ غير صالحة' }
  const angle = input.angle.replace(/\s+/g, ' ').trim()
  if (angle.length < 3) return { ok: false, reason: 'اكتب في جملةٍ ما يقوله المنشور' }
  if (angle.length > 200) return { ok: false, reason: 'الجملةُ أطولُ من 200 حرف' }
  const row = await db
    .prepare('SELECT plan_json, week_start, span, status, choices_json FROM plans WHERE id = ? AND org_id = ?')
    .bind(planId, org)
    .first<{ plan_json: string; week_start: string; span: string; status: string; choices_json: string | null }>()
  if (row === null || row.status === 'superseded') return { ok: false, reason: 'لا خطّة بهذا المعرّف' }
  if (!dayWithin(input.day, row.week_start, asSpan(row.span))) return { ok: false, reason: 'اليومُ خارج مدى الخطّة' }
  const plan = JSON.parse(row.plan_json) as { items: PlanItem[] }
  const channels = new Set<string>([...plan.items.map((i) => i.platform), ...(((JSON.parse(row.choices_json ?? '{}') as { channels?: unknown }).channels as string[] | undefined) ?? [])])
  if (!channels.has(input.platform)) return { ok: false, reason: 'هذه المنصّةُ ليست من قنوات الخطّة' }
  const sameDay = plan.items.filter((i) => i.platform === input.platform && i.day === input.day)
  if (sameDay.length >= MAX_PER_DAY) return { ok: false, reason: 'في هذا اليوم ' + String(MAX_PER_DAY) + ' منشوراتٍ على هذه المنصّة — وهو الحدّ' }
  if (sameDay.some((i) => i.time === input.time)) return { ok: false, reason: 'في هذه الساعة منشورٌ على المنصّة نفسِها — اختر ساعةً أخرى' }
  // ‏المصدر: بندُ المنصّة نفسِها أوّلًا، ثمّ أيُّ بند — والفكرةُ (`idea:`) مفتاحُ مسوّدتها غيرُ البند فلا تصلح أصلًا لبندٍ جديد
  const real = plan.items.filter((i) => !i.sourceId.startsWith('idea:'))
  const from = real.find((i) => i.platform === input.platform) ?? real[0]
  if (from === undefined) return { ok: false, reason: 'لا مصدرَ في هذه الخطّة يُكتب منه — أضف مصدرًا وابنِ خطّةً منه' }
  const item: PlanItem = {
    id: 'a' + crypto.randomUUID().replace(/-/g, '').slice(0, 11),
    sourceId: from.sourceId, platform: input.platform as PlanItem['platform'], angle,
    day: input.day, time: input.time, why: 'أضافه المالك بيده', kind: 'text',
  }
  plan.items.push(item)
  await db.prepare('UPDATE plans SET plan_json = ? WHERE id = ? AND org_id = ?').bind(JSON.stringify(plan), planId, org).run()
  await touchPlan(db, org, planId)
  return { ok: true, item }
}

/**
 * **احذف**: البندُ يخرج من الخطّة، ومسوّدتُه تُرفض (تبقى بكلفتها، فما دُفع ثمنُه يُرى). ومنشورٌ جُدول يُسحب موعدُه أوّلًا
 * (D-327: «أزِل» على البطاقة يُزيل المنصّةَ من يومها)، وما أُرسل للنشر أو نُشر لا يُحذف.
 */
export async function dropItem(db: Db, org: string, planId: string, index: number, key: string, by: string): Promise<Act> {
  const at = await itemAt(db, org, planId, index, key)
  if (typeof at === 'string') return { ok: false, reason: at }
  const item = at.plan.items[index]!
  const post = await postOf(db, org, planId, item, "status <> 'rejected'")
  if (post !== null && post.status === 'published') return { ok: false, reason: 'نُشر منشورُه — لا يُحذف من الخطّة' }
  // ‏والمجدولُ يُسحب موعدُه أوّلًا بـ`unschedule` وحارسِها (D-327): ما أُرسل للنشر لا يُستردّ، فيُردّ الحذفُ بسببه
  if (post !== null && post.status === 'queued') {
    const pulled = await unschedule(db, post.id, org)
    if (!pulled.ok) return { ok: false, reason: `منشورُه مجدول وتعذّر سحبُ موعده: ${pulled.reason}` }
    post.status = 'approved'
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
 * **«اعتمد» يجدول** (D-327): كلُّ ما اعتُمد من الخطّة ولم يُجدوَل يُوضع في موعد بنده بـ `schedulePlan` نفسِها، وتُحفظ صورةُ
 * الإصدار الجاري في `plan_versions` (تُحدَّث إن كانت، فالإصدارُ الواحدُ صفٌّ واحدٌ بعدّاده) ويُختم `locked_at`.
 *
 * كان الاعتمادُ علامةً والجدولةُ زرًّا ثانيًا في آخر الصفحة («ثبّت الخطّة»)، **وما اعتُمد بعد التثبيت لا يُجدوَل أبدًا**:
 * التثبيتُ الثاني يردّ «مثبَّتٌ من قبل». فصار الاعتمادُ نفسُه يسوّي الخطّة، ولا منشورَ معتمَدًا يبقى بلا موعد.
 */
export async function settlePlan(db: Db, org: string, plan: StoredPlan, by: string, now: Date): Promise<PlanSchedule & { readonly version: number }> {
  const result = await schedulePlan(db, org, plan, now)
  const meta = await db
    .prepare('SELECT version, plan_json FROM plans WHERE id = ? AND org_id = ?')
    .bind(plan.id, org)
    .first<{ version: number; plan_json: string }>()
  const version = meta?.version ?? 1
  if (result.scheduled > 0) {
    await db
      .prepare(`INSERT INTO plan_versions (id, plan_id, version, plan_json, scheduled, locked_by, org_id) VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (plan_id, version) DO UPDATE SET scheduled = plan_versions.scheduled + excluded.scheduled, plan_json = excluded.plan_json`)
      .bind(crypto.randomUUID(), plan.id, version, meta?.plan_json ?? JSON.stringify(plan.plan), result.scheduled, by, org)
      .run()
    await db.prepare("UPDATE plans SET locked_at = COALESCE(locked_at, datetime('now')), status = 'approved' WHERE id = ? AND org_id = ?").bind(plan.id, org).run()
  }
  return { ...result, version }
}

/**
 * **تراجَع** (D-327): منشورٌ جُدول من الخطّة ولم يُرسَل يُسحب موعدُه ويعود مسوّدةً تنتظر القرار — بـ `unschedule` و`undoApprove`
 * وحرّاسِهما. والمعتمَدُ بلا موعدٍ يعود مسوّدةً وحدَه.
 */
export async function undoItem(db: Db, org: string, planId: string, postId: string): Promise<Act> {
  const post = await db
    .prepare('SELECT status FROM posts WHERE id = ? AND org_id = ? AND plan_id = ?')
    .bind(postId, org, planId)
    .first<{ status: string }>()
  if (post === null) return { ok: false, reason: 'لا منشور بهذا المعرّف في الخطّة' }
  if (post.status === 'queued') {
    const pulled = await unschedule(db, postId, org)
    if (!pulled.ok) return { ok: false, reason: pulled.reason }
  }
  const back = await undoApprove(db, org, postId)
  return back.ok ? { ok: true } : { ok: false, reason: back.reason }
}

/**
 * **ثبّت الخطّة** — الطريقُ القديم إلى `settlePlan`، يبقى لنموذجٍ مفتوحٍ في تبويبٍ قديم. و`already` حين لا شيءَ جديدًا يُجدوَل
 * والإصدارُ مثبَّت.
 */
export async function pinPlan(db: Db, org: string, plan: StoredPlan, by: string, now: Date): Promise<PlanSchedule & { readonly version: number; readonly already: boolean }> {
  const before = await db.prepare('SELECT locked_at FROM plans WHERE id = ? AND org_id = ?').bind(plan.id, org).first<{ locked_at: string | null }>()
  const result = await settlePlan(db, org, plan, by, now)
  return { ...result, already: before !== null && before.locked_at !== null && result.scheduled === 0 }
}

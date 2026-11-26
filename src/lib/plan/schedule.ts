/**
 * **جدولةُ الخطّة على أرجح الأوقات** (D-261 · AGENCY-PLAN و-٥) — ما اعتمده المالكُ من مسوّدات الخطّة يُجدوَل بضغطةٍ واحدة.
 *
 * الموعدُ يومُ البند كما في اللوحة (بعد السحب والنقل)، **والساعةُ أرجحُ ساعات المنصّة إن قِيست** (`readPeaks`: ثمانيةُ منشوراتٍ
 * فأكثر)، وإلّا ساعةُ البند كما كتبها المخطِّط. وموعدٌ مضى يُرحَّل يومًا فيومًا إلى أوّل موعدٍ قادمٍ بالساعة نفسِها.
 *
 * **ولا يُجدوَل إلّا المعتمَد**: `schedulePost` نفسُها بحرّاسها (الحال، والوسيط، والحساب النشط، والموعد في المستقبل). والمسوّدةُ
 * التي لم تُعتمد تبقى تنتظر، ولا شيءَ يُنشر لم يقرأه المالك.
 */
import type { Db } from '../tokens'
import { schedulePost } from '../schedule/job'
import { approveMany } from '../draft/store'
import { readPeaks } from '../schedule/peak'
import { localToUtc } from '../time/local'
import { storedZone } from '../time/ownerZone'
import type { StoredPlan } from './job'
import type { PlanItem } from './prompt'
import { readRules, toLocal } from './checkStore'
import { arrangeSlots, HELD_SAY, type SlotIn } from './scheduler'

export interface PlanSchedule {
  readonly scheduled: number
  readonly skipped: readonly { readonly postId: string; readonly reason: string }[]
}

/**
 * الموعدُ `YYYY-MM-DDTHH:MM` بـ UTC — في المستقبل دائمًا (D-383).
 *
 * **ساعةُ البند بتوقيت المالك** (`localToUtc` بمنطقته، و`null` الرياض): «09:00» في الرياض تُخزَّن 06:00Z، كما تفعل الحزمة. وأرجحُ
 * الساعات قيست بـ UTC فتبقى بـ UTC. ويومٌ مضى يُرحَّل يومًا محلّيًّا فيومًا بالساعة نفسِها.
 */
export function slotFor(day: string, time: string, peakHour: number | null, now: Date, zone: string | null): string {
  const [y, mo, d] = day.split('-').map(Number) as [number, number, number]
  const [h, mi] = time.split(':').map(Number) as [number, number]
  for (let k = 0; k < 400; k++) {
    let at: Date | null
    if (peakHour !== null) at = new Date(Date.UTC(y, mo - 1, d + k, peakHour))
    else {
      const c = new Date(Date.UTC(y, mo - 1, d + k))
      at = localToUtc(c.getUTCFullYear(), c.getUTCMonth() + 1, c.getUTCDate(), h, mi, zone)
    }
    if (at !== null && at.getTime() > now.getTime()) return at.toISOString().slice(0, 16)
  }
  return new Date(now.getTime() + 86_400_000).toISOString().slice(0, 16)
}

/**
 * أين الخطّةُ من الرحلة: كم مسوّدةً كُتبت منها، وكم منها معتمَدٌ لم يُجدوَل — يقرؤها شريطُ الرحلة وزرُّه.
 * **وصفرٌ مكتوبٌ بعد «ابدأ» يعني «يُكتب الآن»** لا «انتهى».
 */
export async function planProgress(db: Db, org: string, planId: string): Promise<{ readonly written: number; readonly ready: number; readonly pending: number }> {
  const row = await db
    .prepare(`SELECT COUNT(*) AS written, COALESCE(SUM(status IN ('approved', 'edited')), 0) AS ready,
                     COALESCE(SUM(status = 'draft'), 0) AS pending
                FROM posts WHERE org_id = ? AND plan_id = ?`)
    .bind(org, planId)
    .first<{ written: number; ready: number; pending: number }>()
    .catch(() => null)
  // ‏و`pending` ما ينتظر قرارَ المالك من هذه الخطّة — عدُّ «اعتمد الخطّة كاملةً» (D-282)
  return { written: row?.written ?? 0, ready: row?.ready ?? 0, pending: row?.pending ?? 0 }
}

/**
 * **اعتمادُ الخطّة كاملةً** (D-282): كلُّ مسوّدةٍ من هذه الخطّة تنتظر القرار تُعتمَد بـ`approveMany` نفسِها (فحصُها
 * و`approved_by` و`approved_at` كما في الاعتماد الفرديّ). **ولا يُنشر شيء**: الجدولةُ خطوةٌ بعدها.
 */
export async function approvePlanDrafts(db: Db, org: string, planId: string, by: string): Promise<{ readonly done: number; readonly ids?: readonly string[]; readonly failed: readonly string[] }> {
  const { results } = await db
    .prepare("SELECT id FROM posts WHERE org_id = ? AND plan_id = ? AND status = 'draft' ORDER BY created_at")
    .bind(org, planId)
    .all<{ id: string }>()
  if (results.length === 0) return { done: 0, failed: [] }
  const result = await approveMany(db, org, results.map((r) => r.id), by)
  return { done: result.done.length, ids: result.done, failed: result.failed.map((f) => f.reason) }
}

/**
 * ‏**أبندُ السلسلة هذا أم بندُ التغريدة؟** (مراجعة D-324) — «ابدأ» يكتب لبندَي السلسلة والتغريدة من المصدر نفسِه مسوّدتين،
 * ‏ومفتاحُ مسوّدة السلسلة المكتوبة (`draft:` و`idea:`) يُختَم بـ`:thread`. فالبندُ يطابق منشورَه بنوعه أيضًا، **والمفتاحُ هو
 * ‏الحَكَم لا نوعُ النصّ**: سلسلةٌ عدّلها المالكُ تغريدةً تبقى لبندها. وما سوى ذلك (المُسكَّنُ من ملفّ) مرجعُه وحده لبنده فلا يُفرَّق.
 */
export function kindFits(kind: string | undefined, key: string): boolean {
  if (!/^(draft|idea):/.test(key)) return true
  return (kind === 'thread') === key.endsWith(':thread')
}

/**
 * **أهذه مسوّدةُ هذا البند؟** — موضعٌ واحدٌ للمطابقة (D-329). بندٌ بمعرّفٍ تطابقه المسوّدةُ التي تحمل `item:<id>` في مراجعها وحدَها،
 * فبندان من المصدر نفسِه على المنصّة نفسِها لا يتنازعان مسوّدة. وبندٌ بلا معرّف (خطّةٌ قبل D-329، أو مُسكَّنةٌ من ملفّ) كما كان:
 * المصدرُ والمنصّةُ ونوعُ البند.
 */
export function itemOwns(
  item: PlanItem,
  post: { readonly platform: string; readonly source_id: string | null; readonly source_refs: string | null; readonly idempotency_key: string },
): boolean {
  if (post.platform !== item.platform) return false
  const refs = readRefs(post.source_refs)
  if (item.id !== undefined) return refs.includes(`item:${item.id}`)
  return (post.source_id === item.sourceId || refs.includes(item.sourceId)) && kindFits(item.kind, post.idempotency_key)
}

function readRefs(raw: string | null): string[] {
  try {
    const parsed = JSON.parse(raw ?? '[]') as unknown
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

/**
 * **المُجدوِلُ الواحد للخطّة** (D-383 · المرحلة ٦): كلُّ معتمَدٍ من الخطّة إلى موعد بنده بمنطقة المالك، ثمّ `arrangeSlots`
 * (التباعد والتذبذب وساعات الهدوء)، ثمّ `schedulePost` بحرّاسها. **وموعدٌ مضى يُعرض ولا يُرحَّل** صامتًا.
 */
export async function schedulePlan(
  db: Db, org: string, plan: StoredPlan, now: Date,
  /** مفاتيحُ بنودٍ منعها الفحص (`blockedKeys`، بصيغة `itemKey` في review.ts): تبقى معتمَدةً بلا موعد ويُقال سببُها. */
  blocked: ReadonlySet<string> = new Set(),
  /**
   * ‏بنودُ الفرز وحدَها (`plan_items.id`، مراجعة D-425): «اعتمد ما في الفرز» يجدول ما رآه الناشرُ في الفرز لا كلَّ معتمَدٍ في
   * ‏الخطّة — فما سُحب موعدُه عمدًا أو كان في منصّةٍ أو أسبوعٍ آخر يبقى كما هو. والغيابُ يعني الخطّةَ كلَّها.
   */
  onlyItems?: ReadonlySet<string>,
): Promise<PlanSchedule> {
  const { results: all } = await db
    .prepare("SELECT id, platform, source_id, source_refs, idempotency_key, plan_item_id FROM posts WHERE org_id = ? AND plan_id = ? AND status IN ('approved', 'edited')")
    .bind(org, plan.id)
    .all<{ id: string; platform: string; source_id: string | null; source_refs: string | null; idempotency_key: string; plan_item_id: string | null }>()
  const posts = onlyItems === undefined ? all : all.filter((p) => p.plan_item_id !== null && onlyItems.has(p.plan_item_id))
  const peaks = new Map<string, number | null>()
  const accounts = new Map<string, string | null>()
  const skipped: { postId: string; reason: string }[] = []
  const slots: SlotIn[] = []
  const zone = posts.length > 0 ? await storedZone(db) : null
  for (const post of posts) {
    // ‏ومسوّدةُ فكرةٍ بلا مصدر (D-282): معرّفُ بندها `idea:<n>` في `source_refs`
    const item = plan.plan.items.find((i) => itemOwns(i, post))
    if (item === undefined) { skipped.push({ postId: post.id, reason: 'بندُه حُذف من الخطّة — جدوِله من بطاقته' }); continue }
    if (blocked.size > 0 && blocked.has(`${item.id ?? item.sourceId}|${item.platform}|${item.day}|${item.time}`)) { skipped.push({ postId: post.id, reason: 'منعه الفحص، فأصلحه من شريط التحذيرات' }); continue }
    if (!peaks.has(post.platform)) peaks.set(post.platform, (await readPeaks(db, org, post.platform)).hours[0]?.hour ?? null)
    if (!accounts.has(post.platform)) {
      const acc = await db
        .prepare("SELECT id FROM accounts WHERE org_id = ? AND platform = ? AND status = 'active' ORDER BY id LIMIT 1")
        .bind(org, post.platform)
        .first<{ id: string }>()
      accounts.set(post.platform, acc?.id ?? null)
    }
    const account = accounts.get(post.platform) ?? null
    if (account === null) { skipped.push({ postId: post.id, reason: `لا حسابَ ${post.platform} مربوطًا لهذا العميل` }); continue }
    // ‏وأرجحُ الساعات لا يغلب وقتًا اختاره المالكُ للمنصّة، ولا يجمع منشورَي اليوم الواحد في ساعةٍ واحدة (D-329)
    const chosen = (plan.choices?.times?.[item.platform]?.length ?? 0) > 0
    const sameDay = plan.plan.items.filter((i) => i.platform === item.platform && i.day === item.day).length
    const peak = chosen || sameDay > 1 ? null : peaks.get(post.platform) ?? null
    // ‏الموعدُ بلا ترحيل: «الآن» يومَ البند يجعل `slotFor` يردّ موعدَه نفسَه، فما مضى يبقى ماضيًا ويُعرض
    const at = slotFor(item.day, item.time, peak, new Date(0), zone)
    slots.push({ id: post.id, account, at, local: localText(at, zone), exact: peak === null })
  }
  const arranged = arrangeSlots(slots, await readRules(db, org), now)
  for (const h of arranged.held) skipped.push({ postId: h.id, reason: HELD_SAY[h.reason] })
  let scheduled = 0
  for (const slot of arranged.placed) {
    const result = await schedulePost(db, slot.id, slot.account, slot.at, now)
    if (result.ok) scheduled += 1
    else skipped.push({ postId: slot.id, reason: result.reason })
  }
  return { scheduled, skipped }
}

function localText(at: string, zone: string | null): string {
  const l = toLocal(new Date(at + ':00Z'), zone)
  return l.day + ' ' + String(Math.floor(l.minutes / 60)).padStart(2, '0') + ':' + String(l.minutes % 60).padStart(2, '0')
}

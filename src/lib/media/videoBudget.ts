/**
 * ميزانيّةُ المقاطع الشهريّة بالدولار (D-414) — حجزٌ ثمّ نداءٌ ثمّ إعادةٌ إن لم يقع.
 *
 * سقفُ العدد (D-168) يحرس من حلقة إعادة، ولا يقول للمالك كم أنفق في الشهر.
 * فلكلّ عميلٍ سقفٌ شهريٌّ بالمال (`monthly_video_cap_usd`، يغلب العامَّ إن كُتب له — D-295)،
 * والمقطعُ يُحسب بتقدير المالك لكلفته (`video_clip_usd`) لأنّ سعرَ النموذج لم يُقرأ بعد (M-16).
 *
 * ## الحجزُ صفُّ الدفتر نفسُه
 *
 * لا جدولَ حجزٍ موازٍ ولا ترحيل: صفُّ `cost_ledger` الذي يُكتب قبل النداء (D-008) **هو الحجز**،
 * ويُكتب بجملةٍ واحدةٍ شرطيّة — `INSERT … SELECT … WHERE مجموعُ الشهر + المقطع <= السقف`.
 * وD1 ينفّذ الجملةَ الواحدةَ كاملةً قبل غيرها، فطلبان متزامنان لا يمرّان معًا على آخر ما بقي.
 *
 * ## والإعادةُ لما لم يبلغ المزوّد وحده
 *
 * نداءٌ ردّه المزوّد يُصفَّر صفُّه ويوسَم `:released` — يبقى أثرُه، ويعود مالُه إلى الميزانيّة.
 * وما سقط **بعد** أن ولّد المزوّدُ المقطع (السحبُ أو R2) لا يُعاد: المالُ أُنفق.
 */
import type { Db } from '../tokens'
import { STALE_MINUTES } from './claim'

/** ميزانيّةُ الشهر كما تُقرأ تحت الزرّ وفي رسالة الردّ. */
export interface VideoBudget {
  readonly cap: number
  readonly spent: number
  /** تقديرُ كلفة المقطع الواحد. */
  readonly clip: number
  readonly remaining: number
  /** أيتّسع ما بقي لمقطعٍ آخر؟ */
  readonly fits: boolean
}

/** بدايةُ الشهر بـ UTC كما يكتب الدفترُ `at` — من SQL لا من ساعة Worker، فلا يفترقان. */
const MONTH_START = `strftime('%Y-%m-01 00:00:00', 'now')`

const round = (n: number): number => Math.round(n * 100) / 100

/** حكمٌ نقيٌّ من أرقامه — يناديه اللوحُ والحجزُ معًا. */
export function videoBudget(cap: number, spent: number, clip: number): VideoBudget {
  const remaining = round(Math.max(cap - spent, 0))
  return { cap, spent: round(spent), clip, remaining, fits: round(spent + clip) <= cap }
}

/** ما أُنفق على المقاطع لهذا العميل منذ أوّل الشهر — من الدفتر لا من عدّادٍ موازٍ. */
export async function videoSpendThisMonth(db: Db, org: string): Promise<number> {
  const row = await db
    .prepare(
      `SELECT coalesce(sum(total), 0) AS total FROM cost_ledger
        WHERE org_id = ? AND operation LIKE 'video:%' AND at >= ${MONTH_START}`,
    )
    .bind(org)
    .first<{ total: number }>()
    .catch(() => null)
  return row?.total ?? 0
}

export type VideoClaim =
  | { readonly kind: 'claimed'; readonly ledgerId: string }
  | { readonly kind: 'cap'; readonly budget: VideoBudget }

/**
 * يحجز كلفةَ مقطعٍ في الدفتر **إن اتّسعت لها الميزانيّة** — جملةٌ واحدةٌ ذرّيّة.
 * والصفُّ هو قيدُ D-008 نفسُه: لا يُعدّ النداءُ ناجحًا قبله.
 */
export async function claimVideoSpend(
  db: Db,
  c: { readonly org: string; readonly cap: number; readonly clip: number; readonly operation: string; readonly refId: string },
): Promise<VideoClaim> {
  const id = crypto.randomUUID()
  const res = await db
    .prepare(
      `INSERT INTO cost_ledger (id, provider, operation, units, unit_cost, total, ref_id, org_id)
       SELECT ?1, 'cloudflare', ?2, 1, ?3, ?3, ?4, ?5
        WHERE (SELECT coalesce(sum(total), 0) FROM cost_ledger
                WHERE org_id = ?5 AND operation LIKE 'video:%' AND at >= ${MONTH_START}) + ?3 <= ?6 + 0.000001`,
    )
    .bind(id, c.operation, c.clip, c.refId, c.org, c.cap)
    .run()
  // ‏‏D1 يعيد `meta.changes` و`node:sqlite` يعيدها مسطّحة — **وما لا يُعرَف لا يُعدّ حجزًا**: السقفُ يمنع حين يشكّ
  const shaped = res as { meta?: { changes?: number }; changes?: number }
  if ((shaped?.meta?.changes ?? shaped?.changes ?? 0) > 0) return { kind: 'claimed', ledgerId: id }
  return { kind: 'cap', budget: videoBudget(c.cap, await videoSpendThisMonth(db, c.org), c.clip) }
}

/** وسمُ صفٍّ ولّد مزوّدُه المقطع (D-415): مالُه أُنفق، فلا يعيده الكنّاسُ أبدًا. */
export const GENERATED_TAG = ':generated'
/** وسمُ صفٍّ أُعيد مالُه — ردّه المزوّد، أو علق بلا نتيجة حتّى كنسه الكنّاس. */
export const RELEASED_TAG = ':released'

/** نداءٌ لم يبلغ المزوّدَ يعيد مالَه — ويبقى صفُّه موسومًا أثرًا. **وفشلُ الإعادة يُسجَّل لا يُبلَع** (D-415). */
export async function releaseVideoSpend(db: Db, org: string, ledgerId: string): Promise<void> {
  await db
    .prepare(
      `UPDATE cost_ledger SET unit_cost = 0, total = 0, operation = operation || '${RELEASED_TAG}'
        WHERE id = ? AND org_id = ? AND operation NOT LIKE '%${RELEASED_TAG}' AND operation NOT LIKE '%${GENERATED_TAG}'`,
    )
    .bind(ledgerId, org)
    .run()
    // ‏‏المعرّفُ وحده في السجلّ — لا رمزَ ولا سرّ؛ والكنّاسُ يعيده بعد مهلة الحجز
    .catch((error: unknown) => { console.error({ job: 'video_release', ledger: ledgerId, failed: String(error) }) })
}

/**
 * ولّد المزوّدُ المقطع: يُوسَم صفُّه فلا يعيده الكنّاس (D-415).
 * والفشلُ هنا يُسجَّل ولا يُسقط المقطع — ما أُنفق أُنفق، والصفُّ يبقى بكلفته حتّى يكنسه الكنّاس.
 */
export async function markVideoGenerated(db: Db, org: string, ledgerId: string): Promise<void> {
  await db
    .prepare(
      `UPDATE cost_ledger SET operation = operation || '${GENERATED_TAG}'
        WHERE id = ? AND org_id = ? AND operation NOT LIKE '%${RELEASED_TAG}' AND operation NOT LIKE '%${GENERATED_TAG}'`,
    )
    .bind(ledgerId, org)
    .run()
    .catch((error: unknown) => { console.error({ job: 'video_mark', ledger: ledgerId, failed: String(error) }) })
}

/**
 * الكنّاسُ (D-415): حجزٌ بلا نتيجةٍ بعد مهلة حجز التوليد (`STALE_MINUTES.video`) يعود مالُه.
 *
 * Worker مات بين الحجز وعودة المزوّد — فلا وسمَ «وُلّد» ولا «أُعيد»، والتقديرُ يبقى محسوبًا أبدًا.
 * **وبعد المهلة نفسِها** التي يُفتح بها حجزُ التوليد: ما لم يعد فيها لن يُنتظر.
 * وما وُسم `:generated` لا يُلمس — مالُه أُنفق. يعيد عددَ ما أُعيد.
 */
export async function reclaimStuckVideoSpend(db: Db, now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - STALE_MINUTES.video * 60_000).toISOString().slice(0, 19).replace('T', ' ')
  const res = await db
    .prepare(
      `UPDATE cost_ledger SET unit_cost = 0, total = 0, operation = operation || '${RELEASED_TAG}'
        -- الكنّاسُ عامّ لكلّ المنظّمات: حجزٌ عالقٌ عند أيّ عميلٍ يعود مالُه
        WHERE org_id IN (SELECT id FROM orgs) AND operation LIKE 'video:%' AND operation NOT LIKE '%${RELEASED_TAG}'
          AND operation NOT LIKE '%${GENERATED_TAG}' AND at < ?`,
    )
    .bind(cutoff)
    .run()
  const shaped = res as { meta?: { changes?: number }; changes?: number }
  return shaped?.meta?.changes ?? shaped?.changes ?? 0
}

/** رسالةُ البلوغ — عربيّةٌ بأرقامها، وتقول أين يُرفع. */
export function videoBudgetReason(b: VideoBudget, scope: 'org' | 'global'): string {
  const who = scope === 'org' ? 'ميزانيّة مقاطع هذا العميل' : 'ميزانيّة المقاطع الشهريّة'
  if (b.cap === 0) return `${who} صفر بقرار المالك — لا تحريك`
  return `بلغت ${who}: أُنفق $${b.spent.toFixed(2)} من $${b.cap.toFixed(2)}، والمقطع يكلّف نحو $${b.clip.toFixed(2)} — تُفتح أوّل الشهر، أو ارفعها من «الحدود»`
}

/**
 * ‏**مستوياتُ الخدمة** (D-321 · `docs/SLO.md`) — ثلاثةُ مؤشّراتٍ على ثمانيةٍ وعشرين يومًا من صفوف D1، وهامشُ خطأ كلٍّ منها.
 *
 * ## ما كان
 *
 * ‏لا مؤشّرَ ولا هدفَ ولا هامش: «هل الآلة تعمل؟» يقول آخرَ نبضٍ لكلّ دورة، و«نُشر في موعده» (D-324) لكلّ عميلٍ في شهره، ولا رقمَ
 * ‏يقول هل صدى أوفى بوعده للجميع في الأسابيع الأربعة الأخيرة، ولا متى يقف بناءُ الجديد ليُصلَح القديم.
 *
 * ## المؤشّراتُ الثلاثة
 *
 * ١ · **في موعده** (الهدفُ ‏99٪): ممّا حلّ موعدُه في النافذة وجاوزه بدورة (مجدولًا أو منشورًا أو فاشلًا)، ما نجح أوّلُ نشرٍ له
 *     خلال `ON_TIME_MINUTES` من موعده. **وما ردّته المنصّةُ لمحتواه لا يُعدّ** (لا تأخّرَ فيه منّا). وهو غيرُ «نُشر في موعده بلا
 *     تدخّل» في «النتائج»: ذاك لعميلٍ في شهره ولا يقبل إعادةً قبل النجاح، وهذا للآلة كلِّها ويقيس الوقتَ وحدَه.
 * ٢ · **نجاحُ النشر** (الهدفُ ‏99٪): لكلّ منشورٍ آخرُ محاولةٍ حُسمت في النافذة (نجحت أو فشلت): نجح ÷ (نجح + فشل منّا). **وفشلٌ
 *     منّا** كلُّ ما ليس ردًّا من المنصّة لما أُرسل إليها: ‏5xx، ومهلةٌ وانقطاع (`status` صفر)، وطابورٌ استنفد محاولاته، وإذنٌ
 *     انتهى (‏401)، وحدُّ المعدّل (‏429). **وما ردّته المنصّةُ ‏4xx سواها** (محتوًى أو حسابٌ أو صلاحيّة) يُعرَض عددُه ولا يُعدّ.
 * ٣ · **التوافرُ من الخارج** (الهدفُ ‏99.5٪): خاناتُ عشرِ دقائق ردّ فيها `/pulse` ‏200 على سؤال المراقب (M-47) ÷ الخاناتُ كلُّها
 *     منذ أوّل سؤال. والخانةُ بلا سؤالٍ غيابٌ لا حضور.
 *
 * ‏**والهامشُ** ما يجوز من السيّئ (`(1 − الهدف) × الكلّ`) وما بقي منه. ومقامٌ صفرٌ يُقال «لا قياس» لا ‏100٪.
 */
import type { Db } from '../tokens'
import { ON_TIME_MINUTES } from '../report/success'

export const SLO_WINDOW_DAYS = 28
export const SLOT_MINUTES = 10
/** ‏ما يبقى من خانات المراقب: النافذةُ وأسبوعٌ فوقها، ثمّ يُمحى في الدورة اليوميّة. */
export const PULSE_KEEP_DAYS = 35

export type SliKey = 'on_time' | 'success' | 'availability'

export const SLO_TARGET: Readonly<Record<SliKey, number>> = { on_time: 0.99, success: 0.99, availability: 0.995 }

export interface Sli {
  readonly key: SliKey
  readonly target: number
  readonly good: number
  readonly total: number
  /** ‏`good / total`، و`null` حين لا مقام. */
  readonly ratio: number | null
  /** ‏ما بقي من الهامش بين ‏1 (لم يُمسّ) وما دون الصفر (تجاوزه)، و`null` حين لا مقام. */
  readonly budgetLeft: number | null
  /** ‏ما لا يُعدّ ويُقال عدُّه: ما ردّته المنصّةُ لمحتواه. */
  readonly excluded: number
}

/** ‏ردُّ المنصّة لما أُرسل إليها (‏4xx) — إلّا الإذنَ المنتهي والمهلةَ وحدَّ المعدّل: تلك منّا. */
const REJECTED = `(json_valid(pa.response_json)
    AND CAST(json_extract(pa.response_json, '$.status') AS INTEGER) BETWEEN 400 AND 499
    AND CAST(json_extract(pa.response_json, '$.status') AS INTEGER) NOT IN (401, 408, 425, 429))`

const dbTime = (d: Date): string => d.toISOString().slice(0, 19).replace('T', ' ')

/** ‏بدءُ خانة العشر دقائق: `YYYY-MM-DD HH:M0` بتوقيت UTC. */
export function slotOf(d: Date): string {
  const t = new Date(Math.floor(d.getTime() / (SLOT_MINUTES * 60_000)) * SLOT_MINUTES * 60_000)
  return t.toISOString().slice(0, 16).replace('T', ' ')
}

export function sli(key: SliKey, good: number, total: number, excluded = 0): Sli {
  const target = SLO_TARGET[key]
  if (total <= 0) return { key, target, good: 0, total: 0, ratio: null, budgetLeft: null, excluded }
  const allowed = total * (1 - target)
  const bad = total - good
  return { key, target, good, total, ratio: good / total, budgetLeft: allowed <= 0 ? (bad === 0 ? 1 : -1) : 1 - bad / allowed, excluded }
}

/** ‏١ · في موعده — للآلة كلِّها (`org_id IN orgs`، كما يُسأل المستهلكُ في `/pulse`). ‏`?1` بدءُ النافذة و`?2` الآن. */
const ON_TIME = `SELECT json_object(
           'total', coalesce(sum(CASE WHEN rejected = 0 THEN 1 ELSE 0 END), 0),
           'good', coalesce(sum(CASE WHEN rejected = 0 AND first_ok IS NOT NULL
                                      AND first_ok <= datetime(scheduled_at, '+${ON_TIME_MINUTES} minutes') THEN 1 ELSE 0 END), 0),
           'excluded', coalesce(sum(rejected), 0))
      FROM (SELECT p.scheduled_at,
                   (SELECT min(datetime(pa.at)) FROM publish_attempts pa
                     WHERE pa.post_id = p.id AND pa.org_id = p.org_id AND pa.status = 'succeeded') AS first_ok,
                   CASE WHEN p.status = 'failed' AND EXISTS (
                          SELECT 1 FROM publish_attempts pa
                           WHERE pa.post_id = p.id AND pa.org_id = p.org_id AND pa.status = 'failed' AND ${REJECTED}
                             AND pa.attempt_no = (SELECT max(x.attempt_no) FROM publish_attempts x
                                                   WHERE x.post_id = p.id AND x.org_id = p.org_id))
                        THEN 1 ELSE 0 END AS rejected
              FROM posts p
             WHERE p.org_id IN (SELECT id FROM orgs)
               AND p.scheduled_at IS NOT NULL AND p.status IN ('queued', 'published', 'failed')
               AND datetime(p.scheduled_at) >= ?1
               AND datetime(p.scheduled_at, '+${ON_TIME_MINUTES} minutes') <= ?2)`

/** ‏٢ · نجاحُ النشر — آخرُ محاولةٍ حُسمت لكلّ منشور. */
const SUCCESS = `SELECT json_object(
           'good', coalesce(sum(CASE WHEN status = 'succeeded' THEN 1 ELSE 0 END), 0),
           'bad', coalesce(sum(CASE WHEN status = 'failed' AND rejected = 0 THEN 1 ELSE 0 END), 0),
           'excluded', coalesce(sum(rejected), 0))
      FROM (SELECT pa.status, CASE WHEN pa.status = 'failed' AND ${REJECTED} THEN 1 ELSE 0 END AS rejected
              FROM publish_attempts pa
             WHERE pa.org_id IN (SELECT id FROM orgs) AND pa.status IN ('succeeded', 'failed')
               AND datetime(pa.at) >= ?1
               AND pa.attempt_no = (SELECT max(x.attempt_no) FROM publish_attempts x
                                     WHERE x.post_id = pa.post_id AND x.org_id = pa.org_id
                                       AND x.status IN ('succeeded', 'failed')))`

/** ‏٣ · التوافرُ من الخارج — خاناتُ النافذة (‏`?3` إلى الجارية `?4`، ولا تُعدّ) وأوّلُ خانةٍ سُئل فيها `/pulse` أصلًا. */
const AVAILABILITY = `SELECT json_object('good', coalesce(sum(ok), 0), 'first', (SELECT min(slot) FROM pulse_slots))
      FROM pulse_slots WHERE slot >= ?3 AND slot < ?4`

const parse = (v: unknown): Record<string, unknown> => {
  try { return typeof v === 'string' ? (JSON.parse(v) as Record<string, unknown>) : {} } catch { return {} }
}
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

/** ‏أعمدةُ المؤشّرات الثلاثة في `SELECT` واحد — تقرؤها `readSlis` وحدَها، و«صحّة صدى» مع سجلّ النسخ (`ops/health.ts`). */
export const SLI_COLUMNS = `(${ON_TIME}) AS on_time, (${SUCCESS}) AS success, (${AVAILABILITY}) AS availability`

/** ‏معاملاتُها بترتيبها: بدءُ النافذة، والآن، وخانةُ بدء النافذة، والخانةُ الجارية. */
export function sliBinds(now: Date): readonly string[] {
  const start = new Date(now.getTime() - SLO_WINDOW_DAYS * 86_400_000)
  return [dbTime(start), dbTime(now), slotOf(start), slotOf(now)]
}

/** ‏المؤشّراتُ من صفّها — و`null` (جملةٌ سقطت) «لا قياس» للثلاثة. */
export function slisOf(row: { readonly on_time?: unknown; readonly success?: unknown; readonly availability?: unknown } | null, now: Date): readonly Sli[] {
  const t = parse(row?.on_time)
  const s = parse(row?.success)
  const a = parse(row?.availability)
  const good = num(s.good)
  const [, , windowStart, current] = sliBinds(now)
  return [
    sli('on_time', num(t.good), num(t.total), num(t.excluded)),
    sli('success', good, good + num(s.bad), num(s.excluded)),
    availabilityOf(num(a.good), typeof a.first === 'string' ? a.first : null, windowStart!, current!),
  ]
}

/**
 * ‏المؤشّراتُ الثلاثة **في جملةٍ واحدة**: رحلةٌ واحدةٌ إلى D1. وجملةٌ تسقط تُقال «لا قياس» للثلاثة ولا تُسقط ما يرسمها.
 */
export async function readSlis(db: Db, now: Date): Promise<readonly Sli[]> {
  try {
    const row = await db.prepare(`SELECT ${SLI_COLUMNS}`).bind(...sliBinds(now))
      .first<{ on_time: unknown; success: unknown; availability: unknown }>()
    return slisOf(row, now)
  } catch (error) {
    console.error({ job: 'slo', failed: error instanceof Error ? error.message : 'unexpected_error' })
    return slisOf(null, now)
  }
}

/** ‏الخاناتُ المنتظَرة منذ أوّل سؤالٍ أو بدءِ النافذة، أيّهما أحدث، إلى الخانة الجارية — وما لم يُسأل فيها غياب. */
function availabilityOf(good: number, first: string | null, windowStart: string, current: string): Sli {
  if (first === null) return sli('availability', 0, 0)
  const from = first > windowStart ? first : windowStart
  const start = Date.parse(`${from.replace(' ', 'T')}:00Z`)
  const end = Date.parse(`${current.replace(' ', 'T')}:00Z`)
  const total = Math.max(0, Math.round((end - start) / (SLOT_MINUTES * 60_000)))
  return sli('availability', Math.min(good, total), total)
}

/**
 * ‏ما كتبته هذه النسخةُ من الـ Worker لكلّ خانة — **مفتاحُه القاعدةُ نفسُها** فلا تختلط بيئتان ولا اختباران. `/pulse` بابٌ بلا
 * ‏مصادقة: كتابةٌ لكلّ سؤالٍ تجعل كلَّ طارقٍ كاتبًا في D1، فيُكتب للخانة مرّةً، وثانيةً إن ساءت (‏200 ثمّ ‏503) — لا أكثر.
 */
const written = new WeakMap<Db, Map<string, 0 | 1>>()

/** ‏يسجّل سؤالَ المراقب في خانته — ولا يرمي: سجلٌّ يسقط يصير غيابًا في الخانة، وهو ما يجب أن يُعدّ. */
export async function recordProbe(db: Db, now: Date, healthy: boolean): Promise<void> {
  const slot = slotOf(now)
  const ok: 0 | 1 = healthy ? 1 : 0
  try {
    // ‏داخل `try`: بيئةٌ بلا ربط D1 (`db` غائب) لا تُسقط `/pulse` — يُقال ‏503 كما يُقال، والخانةُ غياب
    let seen = written.get(db)
    if (seen === undefined) { seen = new Map(); written.set(db, seen) }
    const prior = seen.get(slot)
    if (prior !== undefined && prior <= ok) return
    await db
      .prepare(
        `INSERT INTO pulse_slots (slot, ok) VALUES (?1, ?2)
         ON CONFLICT(slot) DO UPDATE SET ok = min(pulse_slots.ok, excluded.ok), at = datetime('now')`,
      )
      .bind(slot, ok)
      .run()
    if (seen.size > 32) seen.clear()
    seen.set(slot, ok)
  } catch (error) {
    console.error({ job: 'pulse', record_failed: error instanceof Error ? error.message : 'unexpected_error' })
  }
}

/** ‏يمحو خاناتٍ أقدمَ من خمسةٍ وثلاثين يومًا — في الدورة اليوميّة. */
export async function prunePulseSlots(db: Db, now: Date): Promise<number> {
  const before = slotOf(new Date(now.getTime() - PULSE_KEEP_DAYS * 86_400_000))
  const res = (await db.prepare('DELETE FROM pulse_slots WHERE slot < ?').bind(before).run()) as { meta?: { changes?: number }; changes?: number }
  return Number(res?.meta?.changes ?? res?.changes ?? 0)
}

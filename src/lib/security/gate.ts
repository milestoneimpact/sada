/**
 * بوّابةُ المحاولات الذرّيّة — **تُحجَز المحاولةُ قبل التحقّق لا بعده** (D-161).
 *
 * حدُّ KV (`rateLimit.ts`) يقرأ ثمّ يتحقّق ثمّ يكتب، فطلباتٌ متزامنةٌ تمرّ كلُّها
 * من القراءة قبل أن تكتب واحدةٌ منها. وهنا تُزاد المحاولةُ في D1 بعبارةٍ واحدة
 * (`INSERT … ON CONFLICT … RETURNING`) **قبل** فحص الرمز أو التوقيع، فالطلبُ
 * السادسُ يرى ستّةً ولو وصلت الستّةُ معًا، ويُردّ بلا تحقّق.
 *
 * ## والنجاحُ يُعيد ما حجز
 *
 * المحاولةُ الناجحة حُجزت كالخاطئة، فتُمحى حصّةُ العنوان وتُنقَص حصّةُ الجميع
 * واحدًا: المالكُ الذي يدخل بالكلمة ثمّ برمز التطبيق لا يأكل من حصّةٍ لم يخطئ فيها.
 *
 * ## وعطلُ القاعدة لا يقفل الباب
 *
 * جدولٌ لم يُرحَّل أو قاعدةٌ متعبة تعيد «مسموح» مع تحذير: الحدُّ القديم في KV
 * باقٍ، فالسقوطُ إلى ما كان لا إلى لوحةٍ لا يدخلها صاحبُها.
 */
import type { Db } from '../tokens'
import { MAX_ATTEMPTS, MAX_GLOBAL_ATTEMPTS } from '../rateLimit'

/** إصدارُ التحدّيات: كلُّ تحدٍّ كتابةٌ في KV تُدفَع، فللمجهول سقف. */
export const MAX_CHALLENGES = 20
export const MAX_GLOBAL_CHALLENGES = 300

const WINDOW = '-15 minutes'

export interface Reservation {
  readonly allowed: boolean
  readonly count: number
}

function ipOf(request: Request): string {
  return request.headers.get('CF-Connecting-IP') ?? 'unknown'
}

async function bump(db: Db, bucket: string): Promise<number | null> {
  try {
    const row = await db
      .prepare(
        `INSERT INTO auth_attempts (bucket, n, window_start) VALUES (?, 1, datetime('now'))
         ON CONFLICT(bucket) DO UPDATE SET
           n = CASE WHEN window_start <= datetime('now', ?) THEN 1 ELSE n + 1 END,
           window_start = CASE WHEN window_start <= datetime('now', ?)
                               THEN datetime('now') ELSE window_start END
         RETURNING n`,
      )
      .bind(bucket, WINDOW, WINDOW)
      .first<{ n: number }>()
    return row?.n ?? null
  } catch (error) {
    console.warn({ job: 'gate', bucket, failed: String(error) })
    return null
  }
}

async function both(
  db: Db,
  local: string,
  global: string,
  limits: readonly [number, number],
): Promise<Reservation> {
  const [mine, all] = await Promise.all([bump(db, local), bump(db, global)])
  if (mine === null || all === null) return { allowed: true, count: 0 }
  return { allowed: mine <= limits[0] && all <= limits[1], count: mine }
}

/** يحجز محاولةَ تحقّقٍ (كلمة، رمزُ تطبيق، رمزُ استرداد، توقيعُ مفتاح). */
export function reserveAttempt(db: Db, request: Request): Promise<Reservation> {
  return both(db, `ip:${ipOf(request)}`, 'global', [MAX_ATTEMPTS, MAX_GLOBAL_ATTEMPTS])
}

/** يحجز إصدارَ تحدٍّ لمجهول — قبل أن يُكتب في KV. */
export function reserveChallenge(db: Db, request: Request): Promise<Reservation> {
  return both(
    db,
    `challenge:${ipOf(request)}`,
    'challenge:global',
    [MAX_CHALLENGES, MAX_GLOBAL_CHALLENGES],
  )
}

/** النجاحُ يعيد ما حجز: حصّةُ العنوان تُمحى، وحصّةُ الجميع تنقص واحدًا. */
export async function releaseAttempt(db: Db, request: Request): Promise<void> {
  try {
    await db.prepare('DELETE FROM auth_attempts WHERE bucket = ?').bind(`ip:${ipOf(request)}`).run()
    await db
      .prepare("UPDATE auth_attempts SET n = MAX(n - 1, 0) WHERE bucket = 'global'")
      .run()
  } catch (error) {
    console.warn({ job: 'gate', failed: String(error) })
  }
}

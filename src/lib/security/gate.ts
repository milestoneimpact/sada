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
 * ## وعطلُ القاعدة يغلق الباب لحظةً — لا يفتحه (D-291)
 *
 * كان العطلُ يعيد «مسموح» بحجّة حدّ KV الباقي. لكنّ حدَّ KV يقرأ ثمّ يكتب، وهو ما
 * بُنيت هذه البوّابةُ لتسدّه (D-161)؛ وسقفُ اليوم على رمز البريد (D-247) لا نظيرَ له
 * في KV أصلًا. والجلسةُ نفسُها تُكتب في D1: قاعدةٌ لا تردّ لا تُدخل أحدًا على كلّ حال،
 * فالبابُ المفتوحُ عندها يبيع التخمينَ ولا يشتري دخولًا. فيُردّ الطلبُ **بسببٍ يقول
 * «أعد المحاولة»** لا «كثرت المحاولات»، ولا يُحسَب على صاحبه.
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
  /** `db` حين رُدّ لأنّ القاعدةَ لم تردّ لا لأنّ الحدَّ بلغ (D-291). */
  readonly why?: 'db'
}

/** ردُّ البوّابة حين لا تردّ القاعدة: ليس حدًّا، فلا يُقال «انتظر ربع ساعة». */
export const GATE_UNAVAILABLE: Reservation = { allowed: false, count: 0, why: 'db' }

/** نصُّ الردّ على المستخدم حين تُردّ المحاولةُ لعطلٍ لا لحدّ. */
export const GATE_UNAVAILABLE_TEXT = 'تعذّر التحقّق الآن: القاعدة لم تردّ. أعد المحاولة بعد دقيقة.'

function ipOf(request: Request): string {
  return request.headers.get('CF-Connecting-IP') ?? 'unknown'
}

async function bump(db: Db, bucket: string, window = WINDOW): Promise<number | null> {
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
      .bind(bucket, window, window)
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
  if (mine === null || all === null) return GATE_UNAVAILABLE
  return { allowed: mine <= limits[0] && all <= limits[1], count: mine }
}

/** يحجز محاولةَ تحقّقٍ (كلمة، رمزُ تطبيق، رمزُ استرداد، توقيعُ مفتاح). */
export function reserveAttempt(db: Db, request: Request): Promise<Reservation> {
  return both(db, `ip:${ipOf(request)}`, 'global', [MAX_ATTEMPTS, MAX_GLOBAL_ATTEMPTS])
}

/**
 * سقفُ التخمين على رمز البريد في اليوم (D-247) — **للباب لا للعنوان**.
 *
 * حدُّ العنوان وحدُّ الجميع يُعدّان بربع الساعة: ثلاثون تخمينًا فيه، ومئةٌ وعشرون
 * في الساعة، والمهاجمُ يطلب للمالك رمزًا جديدًا متى شاء. فاحتمالُ إصابة ستّة أرقامٍ
 * يقارب ‏8٪ في الشهر. وهنا عشرُ محاولاتٍ في اليوم على الرمز كلِّه، فلا يزيد على ‏0.4٪
 * في السنة. والثمنُ: من يخطئ عشرًا يُغلق بابَ الرمز يومًا، **ويبقى مفتاحُ المرور**.
 */
export const MAX_CODE_GUESSES_PER_DAY = 10

export async function reserveCodeGuess(db: Db, email: string): Promise<Reservation> {
  const n = await bump(db, `code:${email}`, '-24 hours')
  if (n === null) return GATE_UNAVAILABLE
  return { allowed: n <= MAX_CODE_GUESSES_PER_DAY, count: n }
}

/** الدخولُ بالرمز يمحو عدَّ يومه: المالكُ الذي أخطأ مرّةً ثمّ أصاب لا يحمل خطأه. */
export async function releaseCodeGuesses(db: Db, email: string): Promise<void> {
  try {
    await db.prepare('DELETE FROM auth_attempts WHERE bucket = ?').bind(`code:${email}`).run()
  } catch (error) {
    console.warn({ job: 'gate', failed: String(error) })
  }
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
/**
 * إصدارُ رمز البريد لمجهول (D-270): سقفُ التحدّيات نفسُه، **في دلوٍ مستقلّ** —
 * دخولُ المالك بالرمز لا ينقص رصيدَ تحدّيات مفتاحه، ولا العكس.
 */
export function reserveCodeIssue(db: Db, request: Request): Promise<Reservation> {
  return both(
    db,
    `code-issue:${ipOf(request)}`,
    'code-issue:global',
    [MAX_CHALLENGES, MAX_GLOBAL_CHALLENGES],
  )
}

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

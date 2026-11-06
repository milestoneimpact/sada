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
 *
 * ## ولا يُقفَل الجميعُ بيد مجهول (D-317)
 *
 * كان دلوٌ عامٌّ واحدٌ (ثلاثون في ربع ساعة) يُغلق الدخولَ على كلّ أحد — **ومفتاحُ المرور معه** — وكان يُزاد ولو
 * استنفد العنوانُ حصّتَه، فدفعةٌ من عنوانٍ واحدٍ تكفي. وكانت عشرُ تخميناتٍ لرمز المالك من أيّ مكانٍ تُغلق بابَ الرمز
 * يومًا كاملًا. فصار:
 *
 * - **العنوانُ أوّلًا**، و`/64` لـ IPv6 (`ipBucket`)؛ وما ردّه العنوانُ لا يُزاد به العامّ؛
 * - **والعامُّ قاطعُ دائرةٍ** بسقفٍ أعلى بكثير (`MAX_GLOBAL_ATTEMPTS`)؛
 * - **ورمزُ البريد لكلّ (حسابٍ، مصدر)** عشرًا في اليوم، **وللحساب كلِّه** ثلاثين: من خمّن عشرًا أغلق على نفسه؛
 * - **ومفتاحُ المرور لا يمرّ بهذه الدلاء أصلًا**: التوقيعُ لا يُخمَّن، وتذكرتُه محدودةٌ بسقف التحدّيات.
 */
import type { Db } from '../tokens'
import { ipBucket, MAX_ATTEMPTS, MAX_GLOBAL_ATTEMPTS } from '../rateLimit'

/**
 * إصدارُ التحدّيات: كلُّ تحدٍّ كتابةٌ في KV تُدفَع، فللمجهول سقف.
 * والعامُّ قاطعُ دائرة (D-317): ثلاثةُ آلافٍ في ربع ساعة ≈ ‏1.4$ في اليوم أسوأَ حال، لا بابٌ يُغلقه خمسةَ عشرَ عنوانًا.
 */
export const MAX_CHALLENGES = 20
export const MAX_GLOBAL_CHALLENGES = 3000

const WINDOW = '-15 minutes'

export interface Reservation {
  readonly allowed: boolean
  readonly count: number
  /**
   * `db` حين رُدّ لأنّ القاعدةَ لم تردّ لا لأنّ الحدَّ بلغ (D-291)، و`global` حين انقطع القاطعُ العامّ لا حصّةُ
   * الطالب (D-317) — فيُقال له «محاولاتٌ كثيرةٌ من عناوين شتّى» لا «أخطأتَ كثيرًا».
   */
  readonly why?: 'db' | 'global'
}

/** ردُّ البوّابة حين لا تردّ القاعدة: ليس حدًّا، فلا يُقال «انتظر ربع ساعة». */
export const GATE_UNAVAILABLE: Reservation = { allowed: false, count: 0, why: 'db' }

/** نصُّ الردّ على المستخدم حين تُردّ المحاولةُ لعطلٍ لا لحدّ. */
export const GATE_UNAVAILABLE_TEXT = 'تعذّر التحقّق الآن: القاعدة لم تردّ. أعد المحاولة بعد دقيقة.'

function ipOf(request: Request): string {
  return ipBucket(request)
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

/**
 * الحصّةُ المحلّيّةُ أوّلًا ثمّ العامّة (D-317) — **وما ردّته المحلّيّةُ لا يُزاد به العامّ**: عنوانٌ واحدٌ لا يحمل إلى
 * القاطع العامّ أكثرَ من حصّته، ولو أرسل ألفًا.
 */
async function both(
  db: Db,
  local: string,
  global: string,
  limits: readonly [number, number],
): Promise<Reservation> {
  const mine = await bump(db, local)
  if (mine === null) return GATE_UNAVAILABLE
  if (mine > limits[0]) return { allowed: false, count: mine }
  const all = await bump(db, global)
  if (all === null) return GATE_UNAVAILABLE
  return all <= limits[1] ? { allowed: true, count: mine } : { allowed: false, count: mine, why: 'global' }
}

/** يحجز محاولةَ تحقّقٍ (كلمة، رمزُ تطبيق، رمزُ استرداد، توقيعُ مفتاح). */
export function reserveAttempt(db: Db, request: Request): Promise<Reservation> {
  return both(db, `ip:${ipOf(request)}`, 'global', [MAX_ATTEMPTS, MAX_GLOBAL_ATTEMPTS])
}

/**
 * سقفُ التخمين على رمز البريد في اليوم (D-247) — **لكلّ (حسابٍ، مصدر)، وللحساب كلِّه فوقه** (D-317).
 *
 * حدُّ العنوان يُعدّ بربع الساعة، والمهاجمُ يطلب للمالك رمزًا جديدًا متى شاء، فبلا سقفٍ يوميٍّ يقارب احتمالُ إصابة ستّة
 * أرقامٍ ‏8٪ في الشهر. وكان السقفُ عشرًا في اليوم للحساب كلِّه (‏0.4٪ في السنة) — **وعشرُ تخميناتٍ من مجهولٍ تُغلق
 * بابَ الرمز على المالك يومًا**. فصار:
 *
 * - عشرٌ في اليوم لكلّ (حسابٍ، عنوانٍ أو `/64`): من خمّن عشرًا أغلق على نفسه وحده؛
 * - وثلاثون في اليوم للحساب من كلّ المصادر: إغلاقُه يحتاج ثلاثةَ مصادرَ مستقلّةً لا طلبًا واحدًا. وسقفُ الاحتمال يصير
 *   ثلاثين في المليون في اليوم (‏≈1.1٪ في السنة على العامل الأوّل وحده) — **والعاملُ الأوّل وحده لم يعد يفتح جلسةَ
 *   مالكٍ ولا مديرٍ ولا ناشر** (العاملُ الثاني إلزاميّ لهم).
 */
export const MAX_CODE_GUESSES_PER_DAY = 10
export const MAX_ACCOUNT_CODE_GUESSES_PER_DAY = 30

export async function reserveCodeGuess(db: Db, email: string, request: Request): Promise<Reservation> {
  const mine = await bump(db, `code:${email}:${ipOf(request)}`, '-24 hours')
  if (mine === null) return GATE_UNAVAILABLE
  if (mine > MAX_CODE_GUESSES_PER_DAY) return { allowed: false, count: mine }
  const all = await bump(db, `code:${email}`, '-24 hours')
  if (all === null) return GATE_UNAVAILABLE
  return all <= MAX_ACCOUNT_CODE_GUESSES_PER_DAY ? { allowed: true, count: mine } : { allowed: false, count: mine, why: 'global' }
}

/**
 * الدخولُ بالرمز يمحو عدَّ مصدره، **ويعيد إلى الحساب محاولتَه وحدَها** (D-317): لو مُحي عدُّ الحساب كلُّه لصار دخولُ
 * المالك الناجح أداةً تُنعش حملةً جارية من مصادرَ أخرى.
 */
export async function releaseCodeGuesses(db: Db, email: string, request: Request): Promise<void> {
  try {
    await db.prepare('DELETE FROM auth_attempts WHERE bucket = ?').bind(`code:${email}:${ipOf(request)}`).run()
    await db.prepare('UPDATE auth_attempts SET n = MAX(n - 1, 0) WHERE bucket = ?').bind(`code:${email}`).run()
  } catch (error) {
    console.warn({ job: 'gate', failed: String(error) })
  }
}

/**
 * **العاملُ الثاني المخمَّن** (D-317) — رمزُ التطبيق ورمزُ الاسترداد، في الدخول وفي «تحقّق للتوّ».
 *
 * كان رمزُ التطبيق بلا سقفٍ للحساب: من ملك العاملَ الأوّلَ وبدّل عناوينه خمّن نحو ألفين وثمانمئة مرّةٍ في اليوم تحت
 * السقف العامّ (‏≈0.9٪ في اليوم)، والجلسةُ المعلَّقةُ تعيش ثلاثة أيّام. فصار:
 *
 * - **خمسٌ لكلّ جلسةٍ معلَّقة** (`2fa:s:<بصمتها>`) — والسادسةُ تُسقط الجلسة، فيعود إلى رمز البريد من أوّله؛
 * - **وعشرٌ في اليوم للحساب** (`2fa:<بريده>`) كسقف رمز البريد؛ ومفتاحُ المرور لا يُعدّ هنا؛
 * - وحصّةُ العنوان والقاطعُ العامُّ فوقهما (`reserveAttempt`).
 */
export const MAX_FACTOR_GUESSES_PER_SESSION = 5
export const MAX_FACTOR_GUESSES_PER_DAY = 10

export async function reserveFactorGuess(
  db: Db, email: string, sessionHandle: string, request: Request,
): Promise<Reservation & { readonly dropSession?: boolean }> {
  const inSession = await bump(db, `2fa:s:${sessionHandle}`, '-10 minutes')
  if (inSession === null) return GATE_UNAVAILABLE
  if (inSession > MAX_FACTOR_GUESSES_PER_SESSION) return { allowed: false, count: inSession, dropSession: true }
  const today = await bump(db, `2fa:${email}`, '-24 hours')
  if (today === null) return GATE_UNAVAILABLE
  if (today > MAX_FACTOR_GUESSES_PER_DAY) return { allowed: false, count: today, why: 'global' }
  return await reserveAttempt(db, request)
}

/** نجاحُ العامل الثاني يمحو عدَّ جلسته ويعيد إلى الحساب محاولتَه، كما يُعاد للعنوان. */
export async function releaseFactorGuess(db: Db, email: string, sessionHandle: string, request: Request): Promise<void> {
  try {
    await db.prepare('DELETE FROM auth_attempts WHERE bucket = ?').bind(`2fa:s:${sessionHandle}`).run()
    await db.prepare('UPDATE auth_attempts SET n = MAX(n - 1, 0) WHERE bucket = ?').bind(`2fa:${email}`).run()
  } catch (error) {
    console.warn({ job: 'gate', failed: String(error) })
  }
  await releaseAttempt(db, request)
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

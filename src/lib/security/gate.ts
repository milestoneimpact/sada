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
 * - **العنوانُ أوّلًا**، و`/64` لـ IPv6 (`ipBucket`)؛ **ثمّ شبكتُه `/48`** (`netBucket`، مراجعة D-317)؛ وما ردّه
 *   أحدُهما لا يُزاد به ما فوقه؛
 * - **والعامُّ قاطعُ دائرةٍ** بسقفٍ أعلى بكثير (`MAX_GLOBAL_ATTEMPTS`)؛
 * - **ورمزُ البريد لكلّ (حسابٍ، مصدر)** عشرًا في اليوم، **وللحساب كلِّه** ثلاثين: من خمّن عشرًا أغلق على نفسه؛
 * - **ومفتاحُ المرور لا يمرّ بهذه الدلاء أصلًا**، وتحدّيه بلا حالةٍ (`security/challenge.ts`) فلا سقفَ له يُملأ.
 *
 * ## والجهازُ الذي دخل من قبل لا يُقفله مجهول (مراجعة D-317)
 *
 * القاطعُ العامّ وسقفُ الحساب حدّان على «الجميع» وعلى «الحساب»، فكلُّ من ملك مصادرَ كافيةً يملؤهما — والمراجعةُ
 * ملأتهما بكتلة `/48` واحدةٍ وبثلاثة مصادر. فالجهازُ الذي يحمل **كعكةَ جهازٍ موثوق** لهذا البريد (`security/device.ts`،
 * تُكتب بعد دخولٍ كاملٍ ناجح) لا يمرّ بهما: له حصّةُ مصدره، وحصّتُه هو في اليوم بدل حصّة الحساب. وهذا نمطُ OWASP
 * «Device Cookies»: الإقفالُ يقع على العملاء المجهولين وحدهم، فالمهاجمُ يُقفل نفسَه ومن لم يدخل قطّ، ولا يُقفل المالك.
 */
import type { Db } from '../tokens'
import { ipBucket, MAX_ATTEMPTS, MAX_GLOBAL_ATTEMPTS, netBucket } from '../rateLimit'

/**
 * إصدارُ رمز البريد لمجهول: كلُّ إصدارٍ كتابةٌ في KV وبريدٌ وصفُّ تدقيق، فللمجهول سقف.
 * والعامُّ قاطعُ دائرة (D-317): ثلاثةُ آلافٍ في ربع ساعة، لا بابٌ يُغلقه خمسةَ عشرَ عنوانًا.
 */
export const MAX_CODE_ISSUES = 20
export const MAX_GLOBAL_CODE_ISSUES = 3000

/** حصّةُ الشبكة `/48` (مراجعة D-317): خمسُ شبكاتٍ `/64` بحصّتها كاملة — لا مئتان. */
export const MAX_NET_ATTEMPTS = 5 * MAX_ATTEMPTS
export const MAX_NET_CODE_ISSUES = 3 * MAX_CODE_ISSUES

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
 * الحصّةُ المحلّيّةُ أوّلًا، ثمّ الشبكةُ `/48` لـ IPv6، ثمّ العامّة (D-317) — **وما ردّه دلوٌ لا يُزاد به ما فوقه**:
 * عنوانٌ واحدٌ لا يحمل إلى القاطع العامّ أكثرَ من حصّته ولو أرسل ألفًا، وكتلةُ `/48` لا تحمل أكثرَ من حصّة شبكتها ولو
 * بدّلت `/64` مئتي مرّة (مراجعة D-317).
 *
 * **والجهازُ الموثوقُ** (`device`، مراجعة D-317) لا يمرّ بالشبكة ولا بالعامّ: حصّةُ مصدره وحدَها. فلا يردّه قاطعٌ ملأه
 * غيرُه، **ولا يُزاد به** فلا يُنقَص منه عند نجاحه.
 */
async function tiered(
  db: Db,
  request: Request,
  prefix: { readonly local: string; readonly net: string; readonly global: string },
  limits: { readonly local: number; readonly net: number; readonly global: number },
  device: string | null,
): Promise<Reservation> {
  const mine = await bump(db, `${prefix.local}${ipOf(request)}`)
  if (mine === null) return GATE_UNAVAILABLE
  if (mine > limits.local) return { allowed: false, count: mine }
  if (device !== null) return { allowed: true, count: mine }
  const net = netBucket(request)
  if (net !== null) {
    const wide = await bump(db, `${prefix.net}${net}`)
    if (wide === null) return GATE_UNAVAILABLE
    if (wide > limits.net) return { allowed: false, count: mine }
  }
  const all = await bump(db, prefix.global)
  if (all === null) return GATE_UNAVAILABLE
  return all <= limits.global ? { allowed: true, count: mine } : { allowed: false, count: mine, why: 'global' }
}

const ATTEMPT = { local: 'ip:', net: 'net:', global: 'global' } as const

/**
 * يحجز محاولةَ تحقّقٍ (رمزُ بريد، رمزُ تطبيق، رمزُ استرداد).
 * و`device` معرّفُ جهازٍ موثوقٍ لهذا البريد (`trustedDevice`) أو `null`.
 */
export function reserveAttempt(db: Db, request: Request, device: string | null = null): Promise<Reservation> {
  return tiered(db, request, ATTEMPT, { local: MAX_ATTEMPTS, net: MAX_NET_ATTEMPTS, global: MAX_GLOBAL_ATTEMPTS }, device)
}

/**
 * سقفُ التخمين على رمز البريد في اليوم (D-247) — **لكلّ (حسابٍ، مصدر)، وللحساب كلِّه فوقه** (D-317).
 *
 * حدُّ العنوان يُعدّ بربع الساعة، والمهاجمُ يطلب للمالك رمزًا جديدًا متى شاء، فبلا سقفٍ يوميٍّ يقارب احتمالُ إصابة ستّة
 * أرقامٍ ‏8٪ في الشهر. وكان السقفُ عشرًا في اليوم للحساب كلِّه (‏0.4٪ في السنة) — **وعشرُ تخميناتٍ من مجهولٍ تُغلق
 * بابَ الرمز على المالك يومًا**. فصار:
 *
 * - عشرٌ في اليوم لكلّ (حسابٍ، عنوانٍ أو `/64`): من خمّن عشرًا أغلق على نفسه وحده؛
 * - وثلاثون في اليوم للحساب من كلّ المصادر **المجهولة**: إغلاقُه يحتاج ثلاثةَ مصادرَ مستقلّة. وسقفُ الاحتمال يصير ثلاثين في
 *   المليون في اليوم (‏≈1.1٪ في السنة على العامل الأوّل وحده) — **والعاملُ الأوّل وحده لم يعد يفتح جلسةَ مالكٍ ولا
 *   مديرٍ ولا ناشر** (العاملُ الثاني إلزاميّ لهم)؛
 * - **والجهازُ الموثوقُ لا يمرّ بسقف الحساب** (مراجعة D-317): ثلاثةُ مصادر كانت تُقفل المالكَ يومًا من كلّ أجهزته؛ فله
 *   عشرٌ في اليوم له وحده (`code:<بريد>:dev:<جهاز>`) بدل الثلاثين المشتركة.
 */
export const MAX_CODE_GUESSES_PER_DAY = 10
export const MAX_ACCOUNT_CODE_GUESSES_PER_DAY = 30

export async function reserveCodeGuess(db: Db, email: string, request: Request, device: string | null = null): Promise<Reservation> {
  const mine = await bump(db, `code:${email}:${ipOf(request)}`, '-24 hours')
  if (mine === null) return GATE_UNAVAILABLE
  if (mine > MAX_CODE_GUESSES_PER_DAY) return { allowed: false, count: mine }
  if (device !== null) {
    const own = await bump(db, `code:${email}:dev:${device}`, '-24 hours')
    if (own === null) return GATE_UNAVAILABLE
    return own <= MAX_CODE_GUESSES_PER_DAY ? { allowed: true, count: mine } : { allowed: false, count: own }
  }
  const all = await bump(db, `code:${email}`, '-24 hours')
  if (all === null) return GATE_UNAVAILABLE
  return all <= MAX_ACCOUNT_CODE_GUESSES_PER_DAY ? { allowed: true, count: mine } : { allowed: false, count: mine, why: 'global' }
}

/**
 * الدخولُ بالرمز يمحو عدَّ مصدره (وعدَّ جهازه إن كان موثوقًا)، **ويعيد إلى الحساب محاولتَه وحدَها** (D-317): لو مُحي عدُّ
 * الحساب كلُّه لصار دخولُ المالك الناجح أداةً تُنعش حملةً جارية من مصادرَ أخرى. والموثوقُ لم يُزَد به الحسابُ فلا يُنقَص.
 */
export async function releaseCodeGuesses(db: Db, email: string, request: Request, device: string | null = null): Promise<void> {
  try {
    await db.prepare('DELETE FROM auth_attempts WHERE bucket = ?').bind(`code:${email}:${ipOf(request)}`).run()
    if (device !== null) {
      await db.prepare('DELETE FROM auth_attempts WHERE bucket = ?').bind(`code:${email}:dev:${device}`).run()
    } else {
      await db.prepare('UPDATE auth_attempts SET n = MAX(n - 1, 0) WHERE bucket = ?').bind(`code:${email}`).run()
    }
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
 * - **وعشرٌ في اليوم للحساب** (`2fa:<بريده>`) كسقف رمز البريد — ولا يملؤه إلّا من ملك العاملَ الأوّل؛ ومفتاحُ المرور لا
 *   يُعدّ هنا؛
 * - وحصّةُ العنوان والشبكةِ والقاطعُ العامُّ فوقهما (`reserveAttempt`)، **والجهازُ الموثوقُ لا يمرّ بالشبكة ولا بالعامّ**.
 */
export const MAX_FACTOR_GUESSES_PER_SESSION = 5
export const MAX_FACTOR_GUESSES_PER_DAY = 10

export async function reserveFactorGuess(
  db: Db, email: string, sessionHandle: string, request: Request, device: string | null = null,
): Promise<Reservation & { readonly dropSession?: boolean }> {
  const inSession = await bump(db, `2fa:s:${sessionHandle}`, '-10 minutes')
  if (inSession === null) return GATE_UNAVAILABLE
  if (inSession > MAX_FACTOR_GUESSES_PER_SESSION) return { allowed: false, count: inSession, dropSession: true }
  const today = await bump(db, `2fa:${email}`, '-24 hours')
  if (today === null) return GATE_UNAVAILABLE
  if (today > MAX_FACTOR_GUESSES_PER_DAY) return { allowed: false, count: today, why: 'global' }
  return await reserveAttempt(db, request, device)
}

/** نجاحُ العامل الثاني يمحو عدَّ جلسته ويعيد إلى الحساب محاولتَه، كما يُعاد للعنوان. */
export async function releaseFactorGuess(
  db: Db, email: string, sessionHandle: string, request: Request, device: string | null = null,
): Promise<void> {
  try {
    await db.prepare('DELETE FROM auth_attempts WHERE bucket = ?').bind(`2fa:s:${sessionHandle}`).run()
    await db.prepare('UPDATE auth_attempts SET n = MAX(n - 1, 0) WHERE bucket = ?').bind(`2fa:${email}`).run()
  } catch (error) {
    console.warn({ job: 'gate', failed: String(error) })
  }
  await releaseAttempt(db, request, device)
}

/**
 * إصدارُ رمز البريد لمجهول (D-270) — **في دلوٍ مستقلّ** عن محاولات الدخول، بشبكته وقاطعه العامّ، والجهازُ الموثوقُ لا
 * يمرّ بهما (مراجعة D-317): كان ثلاثةُ آلاف طلبٍ من مئةٍ وخمسين مصدرًا تمنع الرمزَ عن المالك نفسِه.
 */
export function reserveCodeIssue(db: Db, request: Request, device: string | null = null): Promise<Reservation> {
  return tiered(
    db,
    request,
    { local: 'code-issue:', net: 'code-issue-net:', global: 'code-issue:global' },
    { local: MAX_CODE_ISSUES, net: MAX_NET_CODE_ISSUES, global: MAX_GLOBAL_CODE_ISSUES },
    device,
  )
}

/** النجاحُ يعيد ما حجز: حصّةُ العنوان تُمحى، وحصّتا الشبكة والجميع تنقصان واحدًا — إلّا للموثوق، فلم يُزَد بهما. */
export async function releaseAttempt(db: Db, request: Request, device: string | null = null): Promise<void> {
  try {
    await db.prepare('DELETE FROM auth_attempts WHERE bucket = ?').bind(`ip:${ipOf(request)}`).run()
    if (device !== null) return
    const net = netBucket(request)
    if (net !== null) await db.prepare('UPDATE auth_attempts SET n = MAX(n - 1, 0) WHERE bucket = ?').bind(`net:${net}`).run()
    await db
      .prepare("UPDATE auth_attempts SET n = MAX(n - 1, 0) WHERE bucket = 'global'")
      .run()
  } catch (error) {
    console.warn({ job: 'gate', failed: String(error) })
  }
}

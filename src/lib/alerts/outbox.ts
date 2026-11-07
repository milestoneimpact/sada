/**
 * ما لا يُكتشَف بالدخول (D-109) — **قناةٌ واحدةٌ لثلاثةِ أحداثٍ فقط**.
 *
 * ## ما كان مبنيّا وما كان ناقصا
 *
 * `token_alerts` (الترحيل 0016) يسجّل أنّ رمزا يقترب من الانتهاء، **ولا
 * قناةَ إخراجٍ له**: يُكتَب الصفُّ ولا يعلم به أحدٌ حتّى يدخل المالكُ
 * اللوحة. **وما لا يُكتشَف إلّا بالدخول ليس تنبيها** — هو سجلٌّ يُقرأ.
 *
 * ## وثلاثةٌ لا رابعَ لها
 *
 * | الحدث | لماذا لا يحتمل الانتظار |
 * |---|---|
 * | اقترابُ انتهاءِ رمز | سقوطُه **يوجب يدَ المالك** (D-065 · D-066) |
 * | فشلُ نشرٍ نهائيّ | المحتوى فات موعدَه، **ولا يُعاد** |
 * | بلوغُ سقفِ الإنفاق | مالٌ يقف، أو يكاد |
 *
 * **ولا رابع.** إشعارٌ يكثر يُطفَأ، **وحين يُطفَأ تسقط الثلاثةُ معه** —
 * فالثمنُ ليس ضجيجا زائدا، هو **فقدُ الثلاثة**.
 *
 * ## ولا سرَّ في المتن — حدٌّ لا اجتهاد
 *
 * `CLAUDE.md` تمنع رمزا في بريدٍ أو سجلّ، و`D-005` توجب تشفيرَ الرموز في
 * القاعدة. **فالإشعارُ يقول ما وقع ويُحيل إلى اللوحة**: لا رمزَ ولا سرَّ
 * ولا رابطا موقَّعا ولا معرّفَ جلسة. **والقناةُ خارجُ سيطرتنا** — سجلُّ
 * Slack يُقرأ بعد سنة، وبريدٌ يُعاد توجيهُه.
 *
 * ## و`webhook` لا بريد
 *
 * البريدُ يوجب خدمةً ثالثةً ومفتاحا وكلفة، **و`webhook` عنوانٌ واحدٌ
 * يلصقه المالك**: يعمل مع Slack و Discord و Telegram وما يكتبه بيده.
 * وسطحُ الأمان أصغر: **لا مفتاحَ يُخزَّن أصلا**.
 *
 * **والعنوانُ يُحرَس بحارس المزوّدين نفسِه** (`checkProviderUrl`): يمنع
 * `localhost` والشبكاتِ الخاصّة و`169.254` — خدمةَ البيانات الوصفيّة.
 * **وعنوانٌ يُلصَق بلا حارسٍ بابُ SSRF من داخل الـ Worker.**
 */
import { checkProviderUrl, guardedFetch } from '../ai/urlGuard'
import type { Db } from '../tokens'
import { counted, duration, NOUNS } from '../format'
import type { LateJob } from '../ops/pulse'
import { OWNER_ORG } from '../tenancy'

/**
 * حدثٌ يستحقّ أن يُوقظ المالك — **ثلاثةٌ في العمل، ورابعُها أمانُ الحساب** (D-317): دخولٌ جديد، وعاملٌ ثانٍ أُضيف أو أُزيل،
 * ورمزُ استرداد استُعمل، وإخراجُ الأجهزة. يُكتب صفُّه عند الحدث (`security/events.ts`) وتُرسله الدورةُ كالثلاثة.
 */
export interface Alert {
  readonly kind: 'token' | 'publish' | 'budget' | 'security' | 'heartbeat'
  /**
   * مفتاحٌ يُبنى من الحدث نفسِه لا من وقت الإرسال (D-004).
   *
   * **فدورةٌ تُعاد بعد فشلٍ في الشبكة لا تُغرِق قناةَ المالك بما رآه.**
   */
  readonly ref: string
  readonly body: string
  /** منظّمةُ الحدث (D-277): حسابُه أو منشورُه، والسقفُ العامُّ لمنظّمة المالك. */
  readonly org: string
}

export interface SendResult {
  readonly sent: number
  readonly skipped: number
  readonly failed: number
  /** سببٌ يُقرأ حين لا تُرسَل — لا صمتٌ يُظنّ نجاحا. */
  readonly why: string | null
}

/**
 * يبني نصَّ التنبيه — **ويُحرَس هنا أن لا سرَّ فيه**.
 *
 * والحدُّ يُفرَض بالبناء لا بالمراجعة: **لا يُمرَّر إلى هذه الدالّة إلّا
 * ما وُصف**، ولا تُقبَل قطعةٌ حرّةٌ من نداءٍ خارجيّ.
 */
export function tokenAlert(account: string, days: number, kind: string, org: string): Alert {
  const which = kind === 'refresh' ? 'إذن التجديد' : 'إذن الوصول'
  return {
    kind: 'token',
    org,
    ref: `token:${account}:${kind}:${days}`,
    // ‏العتبةُ صفرٌ لإذنٍ انتهى فعلًا (`thresholdFor`) — فيُقال «انتهى» لا «ينتهي خلال 0 يومًا»،
    // كما تقوله صفحةُ المنصّة للعتبة نفسِها
    body: (days <= 0
      ? `صدى — ${which} لحساب «${account}» انتهى.`
      : `صدى — ${which} لحساب «${account}» ينتهي خلال ${counted(days, NOUNS.day, 'gen')}.`) +
      ' وسقوطُه يوقف النشر من هذا الحساب. أعد الإذن من لوحة صدى.',
  }
}

export function publishAlert(postId: string, platform: string, attempts: number, org: string): Alert {
  return {
    kind: 'publish',
    org,
    ref: `publish:${postId}`,
    body: `صدى — منشور على ${platform} لم يُنشَر بعد ${attempts} محاولات،` +
      ' وفات موعدُه ولا يُعاد. راجعه في لوحة صدى.',
  }
}

export function budgetAlert(day: string, spent: number, cap: number): Alert {
  return {
    kind: 'budget',
    // ‏السقفُ اليوميُّ عامٌّ لكلّ المنظّمات، فتنبيهُه يسكن منظّمةَ المالك (D-277)
    org: OWNER_ORG,
    ref: `budget:${day}`,
    body: `صدى — بلغ إنفاق اليوم ${spent.toFixed(2)}$ من سقف ${cap.toFixed(2)}$.` +
      ' وما بعده يُردّ حتّى الثالثة فجرًا بتوقيت الرياض أو حتّى تَرفع السقف.',
  }
}

/**
 * ‏**نبضٌ تأخّر** (D-320) — الخامس: دورةُ الإرسال أو التجديد تسقط منذ نصف ساعة، أو مستهلكُ النشر لم يأخذ ما سُلّم إليه.
 *
 * ‏**ومفتاحُه من الحدث لا من الساعة**: السقوطُ من أوّله (`failedSince`) والتأخّرُ من آخر نبضٍ رآه — فالسقوطُ نفسُه يُقال مرّةً ولو
 * ‏دام يومًا، وسقوطٌ جديدٌ بعد أن دارت مفتاحُه جديد. ويسكن منظّمةَ المالك: الآلةُ واحدةٌ لكلّ العملاء. **ولا يحمل سببَ السقوط**:
 * ‏نصُّ العطل في السجلّ واللوحة، وقد يحمل ما لا يُرسَل. **وما يوقف الـ Cron كلَّه لا يقوله هذا** — ذاك لمراقب `/pulse` (M-47).
 */
export function heartbeatAlert(late: LateJob): Alert {
  const failing = late.state === 'failed' && late.failedSince !== undefined
  const since = duration(failing ? late.failingFor ?? 0 : late.waited, 'gen')
  const effect = late.job === 'dispatch' ? ' المنشوراتُ المجدولة لا تخرج في مواعيدها.' : ' الأذوناتُ القريبةُ من الانتهاء لا تُجدَّد.'
  const body = late.job === 'publish'
    ? `صدى — في طابور النشر منشورٌ صار في يده منذ ${since} ولم يأخذه. المنشوراتُ المجدولة قد لا تخرج.`
    : failing
      ? `صدى — دورة «${late.label}» تسقط في كلّ مرّةٍ منذ ${since}، وموعدُها كلَّ ربع ساعة.${effect}`
      : `صدى — دورة «${late.label}» لم تدُر منذ ${since}، وموعدُها كلَّ ربع ساعة.${effect}`
  return {
    kind: 'heartbeat',
    org: OWNER_ORG,
    ref: failing ? `heartbeat:${late.job}:failed:${late.failedSince}` : `heartbeat:${late.job}:${late.lastAt ?? 'never'}`,
    body: `${body} افتح «هل الآلة تعمل؟» في لوحة صدى.`,
  }
}

/**
 * أفي المتن سرٌّ؟ — **حارسٌ يُفرَض قبل النداء لا بعده**.
 *
 * ولا يُفحَص «هل نسينا؟» بالمراجعة: **رسالةٌ تخرج مرّةً لا تُستردّ**، وسجلُّ
 * القناة يبقى بعد أن يُحذَف السرّ.
 */
const SECRETISH = [
  /\bey[A-Za-z0-9_-]{16,}\b/,          // JWT
  /\b[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{20,}/, // رمز منقوط
  /\bsk-[A-Za-z0-9]{12,}/i,            // مفاتيح المزوّدين
  /\bBearer\s+\S+/i,
  /client_secret|refresh_token|access_token|ADMIN_TOKEN|TOKEN_ENC_KEY/i,
]

export function looksSecret(body: string): boolean {
  return SECRETISH.some((re) => re.test(body))
}

/**
 * يرسل ما لم يُرسَل.
 *
 * **ولا يُرسَل حدثٌ مرّتين**: القيدُ في القاعدة هو الحاكم لا الشيفرة —
 * `ref` مفتاحٌ أوّليّ، فإدخالٌ مكرَّرٌ يُردّ ولو تسابقت دورتان.
 */
export async function sendAlerts(
  db: Db,
  webhook: string,
  alerts: readonly Alert[],
  /** ‏والمهلةُ في `guardedFetch` عند كلّ قفزة (D-320). */
  fetchImpl?: typeof fetch,
): Promise<SendResult> {
  if (webhook.trim() === '') {
    return { sent: 0, skipped: alerts.length, failed: 0, why: 'لا عنوان قناة مضبوط' }
  }
  const verdict = checkProviderUrl(webhook)
  if (!verdict.ok) {
    return { sent: 0, skipped: alerts.length, failed: 0, why: `العنوان مرفوض: ${verdict.reason}` }
  }

  let sent = 0, skipped = 0, failed = 0
  for (const a of alerts) {
    /*
     * **والسرُّ يُمنَع قبل النداء لا بعده.**
     *
     * ولا يُعدّ فشلا يُعاد: هو علّةُ بناءٍ في نصّ التنبيه، **وإعادةُ
     * المحاولة تُعيد إرسالَ السرّ**. فيُسجَّل ولا يُنادى.
     */
    if (looksSecret(a.body)) {
      await mark(db, a, null, 'المتن يحمل ما يشبه سرّا — لم يُناد')
      failed += 1
      continue
    }

    // ‏والقيدُ يمنع المكرَّر: إدخالٌ أوّلا، فإن رُدّ فقد أُرسل من قبل
    const fresh = await db
      .prepare(
        `INSERT INTO alert_outbox (ref, kind, body, org_id) VALUES (?, ?, ?, ?)
         ON CONFLICT(ref) DO NOTHING`,
      )
      .bind(a.ref, a.kind, a.body, a.org)
      .run()
      .then(() => true)
      .catch(() => false)
    if (!fresh) { skipped += 1; continue }

    /*
     * **وما ردّته القناةُ بغير نجاحٍ يُعاد — بحدّ** (D-270).
     *
     * كان الرمزُ يُكتب (502 مثلا) ثمّ يُعدّ الصفُّ «أُرسل» فلا يُعاد أبدا، خلافا
     * لما وعد به تعليقُ الدورة. فيُعاد ما لم ينجح حتّى `MAX_TRIES`، ويبقى
     * المكرّرُ ممنوعا بالقيد نفسِه: صفٌّ ناجح لا يُعاد.
     */
    const already = await db
      .prepare('SELECT status, tries FROM alert_outbox WHERE ref = ? AND org_id = ?')
      .bind(a.ref, a.org)
      .first<{ status: number | null; tries: number }>()
      .catch(() => null)
    if (already !== null && already.status !== null) {
      const ok = already.status >= 200 && already.status < 300
      if (ok || already.tries >= MAX_TRIES) { skipped += 1; continue }
    }

    try {
      /*
       * **والحارسُ يُفحَص عند كلّ قفزة** (D-110).
       *
       * فحصٌ للعنوان الأوّل وحدَه يُهزَم بـ‏٣٠٢: عنوانٌ عامٌّ يمرّ ثمّ
       * يحوّل إلى `169.254.169.254`، **و`fetch` يتبعه من تحتنا**.
       */
      const res = await guardedFetch(verdict.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // ‏«text» هو الحقلُ الذي يقرؤه Slack وDiscord وأكثرُ ما سواهما
        body: JSON.stringify({ text: a.body }),
      }, fetchImpl)
      await mark(db, a, res.status, res.ok ? null : `ردّت القناة ${res.status}`)
      if (res.ok) sent += 1
      else failed += 1
    } catch (e) {
      await mark(db, a, null, e instanceof Error ? e.message : 'نداء لم يعد بجواب')
      failed += 1
    }
  }
  return { sent, skipped, failed, why: null }
}

/**
 * يمحو أيَّ عنوانٍ من نصّ عطل (D-110).
 *
 * **وعنوانُ القناة اعتمادٌ لا عنوان**: رمزُ Slack في مساره
 * (`/services/T00/B00/xxxx`)، **ومن ملكه أرسل باسمك**. و`CLAUDE.md` تمنع
 * سرّا في سجلّ، ونصُّ العطل **يُخزَّن ويُعرَض في اللوحة**.
 *
 * **وقِيس على Node فلم يحمل نصُّ الخطأ العنوانَ** — لا في الرسالة ولا في
 * سببها. **والشيفرةُ تعمل على Workers، ولا أملك قياسَه من هنا** (D-076:
 * لا يُدَّعى قياسٌ لم يقع).
 *
 * **فالمحوُ لا يقوم على قياسٍ يقول إنّه لازم — يقوم على أنّه بلا ثمن.**
 * وسطران يُغلقان بابا لا أستطيع أن أشهد أنّه مغلق.
 */
function redact(text: string): string {
  return text.replace(/https?:\/\/\S+/gi, '«عنوان مُزال»')
}

/** كم مرّةً يُعاد تنبيهٌ ردّته القناةُ بغير نجاح (D-270). */
export const MAX_TRIES = 3

async function mark(
  db: Db, a: Alert, status: number | null, error: string | null,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO alert_outbox (ref, kind, body, status, error, tries, org_id) VALUES (?, ?, ?, ?, ?, 1, ?)
       ON CONFLICT(ref) DO UPDATE SET status = excluded.status, error = excluded.error, tries = alert_outbox.tries + 1`,
    )
    .bind(a.ref, a.kind, a.body, status, error === null ? null : redact(error), a.org)
    .run()
    .catch(() => undefined)
}

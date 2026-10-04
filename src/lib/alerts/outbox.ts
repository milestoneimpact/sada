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
import { counted, NOUNS } from '../format'

/** حدثٌ يستحقّ أن يُوقظ المالك — **وثلاثةٌ لا رابعَ لها**. */
export interface Alert {
  readonly kind: 'token' | 'publish' | 'budget'
  /**
   * مفتاحٌ يُبنى من الحدث نفسِه لا من وقت الإرسال (D-004).
   *
   * **فدورةٌ تُعاد بعد فشلٍ في الشبكة لا تُغرِق قناةَ المالك بما رآه.**
   */
  readonly ref: string
  readonly body: string
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
export function tokenAlert(account: string, days: number, kind: string): Alert {
  const which = kind === 'refresh' ? 'إذنُ التجديد' : 'إذنُ الوصول'
  return {
    kind: 'token',
    ref: `token:${account}:${kind}:${days}`,
    // ‏العتبةُ صفرٌ لإذنٍ انتهى فعلًا (`thresholdFor`) — فيُقال «انتهى» لا «ينتهي خلال 0 يومًا»،
    // كما تقوله صفحةُ المنصّة للعتبة نفسِها
    body: (days <= 0
      ? `صدى — ${which} لحساب «${account}» انتهى.`
      : `صدى — ${which} لحساب «${account}» ينتهي خلال ${counted(days, NOUNS.day, 'gen')}.`) +
      ' وسقوطُه يوقف النشرَ من هذا الحساب. أعد الإذنَ من لوحة صدى.',
  }
}

export function publishAlert(postId: string, platform: string, attempts: number): Alert {
  return {
    kind: 'publish',
    ref: `publish:${postId}`,
    body: `صدى — منشورٌ على ${platform} لم يُنشَر بعد ${attempts} محاولات،` +
      ' وفات موعدُه ولا يُعاد. راجعه في لوحة صدى.',
  }
}

export function budgetAlert(day: string, spent: number, cap: number): Alert {
  return {
    kind: 'budget',
    ref: `budget:${day}`,
    body: `صدى — بلغ إنفاقُ اليوم ${spent.toFixed(2)}$ من سقف ${cap.toFixed(2)}$.` +
      ' وما بعده يُردّ حتّى منتصف الليل UTC أو حتّى تَرفع السقف.',
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
  /\b[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{20,}/, // رمزٌ منقوط
  /\bsk-[A-Za-z0-9]{12,}/i,            // مفاتيحُ المزوّدين
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
  fetchImpl: typeof fetch = fetch,
): Promise<SendResult> {
  if (webhook.trim() === '') {
    return { sent: 0, skipped: alerts.length, failed: 0, why: 'لا عنوانَ قناةٍ مضبوط' }
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
      await mark(db, a, null, 'المتنُ يحمل ما يشبه سرّا — لم يُنادَ')
      failed += 1
      continue
    }

    // ‏والقيدُ يمنع المكرَّر: إدخالٌ أوّلا، فإن رُدّ فقد أُرسل من قبل
    const fresh = await db
      .prepare(
        `INSERT INTO alert_outbox (ref, kind, body) VALUES (?, ?, ?)
         ON CONFLICT(ref) DO NOTHING`,
      )
      .bind(a.ref, a.kind, a.body)
      .run()
      .then(() => true)
      .catch(() => false)
    if (!fresh) { skipped += 1; continue }

    const already = await db
      .prepare('SELECT status FROM alert_outbox WHERE ref = ?')
      .bind(a.ref)
      .first<{ status: number | null }>()
      .catch(() => null)
    if (already !== null && already.status !== null) { skipped += 1; continue }

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
      await mark(db, a, res.status, res.ok ? null : `ردّت القناةُ ${res.status}`)
      if (res.ok) sent += 1
      else failed += 1
    } catch (e) {
      await mark(db, a, null, e instanceof Error ? e.message : 'نداءٌ لم يعد بجواب')
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
  return text.replace(/https?:\/\/\S+/gi, '«عنوانٌ مُزال»')
}

async function mark(
  db: Db, a: Alert, status: number | null, error: string | null,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO alert_outbox (ref, kind, body, status, error) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(ref) DO UPDATE SET status = excluded.status, error = excluded.error`,
    )
    .bind(a.ref, a.kind, a.body, status, error === null ? null : redact(error))
    .run()
    .catch(() => undefined)
}

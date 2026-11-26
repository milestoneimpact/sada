/**
 * تجديدُ الرموز — **قبل الطابور، لا داخله.**
 *
 * ## الوعدُ الذي لم يُنفَّذ
 *
 * `publisher.ts` يقول في تعليقه: **«التجديد يقع قبل الطابور لا داخله؛
 * هنا نعلّم ونتوقف بدل أن ننشر برمزٍ ميت»**.
 *
 * **ولم يكن يقع.** `refreshToken()` مبنيٌّ منذ المرحلة ٠ **ولا يناديه
 * أحد**. فالنتيجةُ التي تقع فعلا:
 *
 * > بعد ستّين يوما ينتهي رمزُ وصول LinkedIn، **فيفشل كلُّ منشورٍ
 * > مجدولٍ فشلا نهائيّا** (`retryable: false`)، ويُعلَّم الحسابُ
 * > `needs_reauth` — **وإذنُ التجديد صالحٌ عشرةَ أشهرٍ أخرى**.
 *
 * وهي علّةُ «بُني ولم يُستعمَل» للمرّة الرابعة: السلّم (D-057)، وجدولُ
 * المقاييس (D-058)، وترويسةُ الوسائط (D-059) — **وهذه أغلاها ثمنا**.
 *
 * ## وفخٌّ في الردّ لا يُرى إلّا بالقراءة
 *
 * بعضُ المزوّدين يعيد `refresh_token` جديدا مع التجديد (تدويرا)،
 * **وبعضُهم لا يعيده أصلا**. و`parseToken` يجعله `null` حين يغيب —
 * **فحفظُ الردّ كما هو يمحو الرمزَ الذي كان يعمل**، ويحوّل تجديدا
 * ناجحا إلى عطلٍ دائم.
 *
 * فما نقص **يُورَث من المحفوظ**، ولا يُكتب فراغا فوق قيمة.
 */
import type { Db, StoredTokens } from '../tokens'
import { loadTokens, markActive, markNeedsReauth, markRefreshed, saveTokens } from '../tokens'
import type { Platform, Provider } from '../oauth/providers'
import type { ClientCredentials, TokenResponse } from '../oauth/exchange'
import { isExpiring, OAuthError, refreshToken } from '../oauth/exchange'
import { parseGranted } from '../oauth/scopes'
import { withTimeout } from '../net/timeout'

/**
 * كم يبقى على الانتهاء فيُجدَّد — **ساعتان لا خمسُ دقائق.**
 *
 * هامشُ `isExpiring` الافتراضيّ (خمسُ دقائق) يصلح **حارسا عند النشر**:
 * «أهذا الرمزُ ميتٌ الآن؟». ولا يصلح **جدولا للتجديد**: دورةٌ تسقط
 * مرّةً تترك الرمزَ يموت بين دورتين.
 *
 * وساعتان تحتملان ثمانيَ دوراتٍ ساقطة.
 */
export const RENEW_MARGIN_SECONDS = 7200

/**
 * ‏**مهلةُ نداء التجديد** (D-320) — كان `fetch` عاريًا، والتجديدُ يقع في الدورة **قبل الإرسال**: نهايةُ OAuth تعلق كانت
 * ‏تؤخّر كلَّ منشورٍ مستحقٍّ حتّى يُقتَل الاستدعاء. وخمسَ عشرةَ ثانيةً أضعافُ ما تحتاجه نهايةٌ سليمة.
 */
export const RENEW_TIMEOUT_MS = 15_000

/**
 * ‏**ميزانيّةُ الدورة** (D-320): التجديدُ قبل الإرسال في الدورة نفسِها، فخمسةٌ وعشرون نداءً بمهلة خمسَ عشرةَ ثانية تؤخّر
 * ‏الإرسالَ ستَّ دقائق في أسوأ حال. فبعد دقيقةٍ يقف، **وما بقي ينتظر الدورةَ التالية بلا عقوبة** — والهامشُ ساعتان (ثماني دورات).
 */
export const RENEW_BUDGET_MS = 60_000

/**
 * ‏**التباعدُ بعد الرفض النهائيّ** (D-320): حسابٌ ردّ المزوّدُ تجديدَه أو انتهى إذنُ تجديده ينتظر نصفَ ساعة، ثمّ ضعفَ ما انتظر،
 * ‏حتّى يومٍ لا أكثر. والسليمُ لا ينتظر.
 *
 * ‏كان الساقطُ أقدمَ الرموز انتهاءً، فيُختار أوّلًا في كلّ دورة (ستًّا وتسعين مرّةً في اليوم)، **وخمسةٌ وعشرون منه تملأ الدفعةَ
 * ‏فلا يصل السليمَ دورُه حتّى يموت رمزُه**.
 *
 * ‏**والعابرُ لا يتباعد** (مراجعة D-320): ‏5xx والشبكةُ والمهلةُ وسرُّ التطبيق الناقص يُكتب سقوطُها فتتأخّر خلف السليم
 * ‏(`ORDER BY renew_retry_at IS NOT NULL`)، ولا تنتظر: رمزٌ في هامش الساعتين يُحاوَل في كلّ دورةٍ حتّى يعود المزوّد أو يُحفَظ السرّ. كان كلُّ
 * ‏سقوطٍ يتباعد، فمزوّدٌ تعطّل ساعةً ونصفًا ترك رمزًا يموت ساعتين بعد عودته. **وحفظُ التطبيق أو فحصُه الناجح يمحو تباعدَ منصّته**
 * ‏(`releaseRenewalHolds`): ‏401 `invalid_client` لسرٍّ خاطئ نهائيٌّ حتّى يُصحَّح السرّ، ثمّ لا.
 *
 * ‏**والأُسُّ عددُ الرفض وحدَه** (تحقّق D-320 على main): كان العابرُ يزيد `renew_failures` كما يزيده الرفض، فأوّلُ رفضٍ بعد
 * ‏عطلٍ دام دوراتٍ ينتظر نصفَ ساعةٍ مضروبةً في ‏2 أُسُّها كلُّ ما سقط. فصار `renew_failures` عددَ ما رُفض متتاليًا، والعابرُ
 * ‏يكتب `renew_retry_at` لحظتَه (أو ما قالته `Retry-After`) فيتأخّر خلف السليم ولا يُعدّ. **و‏408 و‏425 و‏429 عابرة** لا رفض:
 * ‏«أبطئ» ليس حكمًا على الإذن.
 */
export const RENEW_BACKOFF_BASE_MS = 30 * 60_000
export const RENEW_BACKOFF_MAX_MS = 24 * 3600_000

/**
 * ‏**أطولُ ما تُطاع فيه `Retry-After`** (تحقّق D-320 على main): نصفُ ساعة. هامشُ التجديد ساعتان، ومهلةٌ أطولُ يطيعها كلُّها
 * ‏تترك الرمزَ يموت قبلها؛ فيُسأل المزوّدُ بعد نصف ساعةٍ ولو قال أكثر، ومرّتين في الساعة لا أربعًا.
 */
export const RENEW_RETRY_AFTER_MAX_MS = RENEW_BACKOFF_BASE_MS

/** ‏ردودُ «أبطئ» و«انقضت المهلة» من نهاية الرمز: ‏4xx لكنّها لا تحكم على الإذن (تحقّق D-320 على main). */
const TRANSIENT_4XX: ReadonlySet<number> = new Set([408, 425, 429])

/** موعدُ المحاولة التالية بعد رفضٍ رقمُه `failures + 1`. */
export function nextRenewAt(failures: number, now: Date): string {
  const wait = Math.min(RENEW_BACKOFF_BASE_MS * 2 ** Math.max(0, failures), RENEW_BACKOFF_MAX_MS)
  return new Date(now.getTime() + wait).toISOString()
}

export interface RenewDeps {
  readonly db: Db
  readonly encKey: string
  /** أسرارُ التطبيق لكلّ منصّة — تُقرأ مرّةً لا لكلّ حساب. */
  /** ‏والنوعُ معه (D-417): صفحةُ LinkedIn تتجدّد بسرّي تطبيقها الثاني لا الأوّل. */
  readonly credentialsFor: (platform: Platform, kind?: string) => Promise<ClientCredentials | null>
  readonly providerFor: (platform: Platform) => Provider
  readonly fetchImpl?: typeof fetch
  readonly now?: () => Date
}

export type RenewOutcome =
  /** جُدِّد وحُفظ. */
  | { readonly kind: 'renewed'; readonly accountId: string }
  /** لا إذنَ تجديدٍ أو انتهى هو كذلك — **ولا سبيلَ إلّا يدُ المالك**. */
  | { readonly kind: 'needs_owner'; readonly accountId: string; readonly why: string }
  /** عطلٌ عابر — يُترك للدورة التالية ولا يُعلَّم الحساب. و`retryAfterSeconds` ما قاله المزوّدُ في `Retry-After`. */
  | { readonly kind: 'deferred'; readonly accountId: string; readonly why: string; readonly retryAfterSeconds?: number }
  /** لم يحن وقتُه. */
  | { readonly kind: 'skipped'; readonly accountId: string }

interface DueRow {
  account_id: string
  platform: string
  /** منظّمةُ الحساب — تُحمَل إلى كلّ ما يلي من كتابة (D-277). */
  org_id: string
  /** ‏نوعُ الحساب — `org` لصفحة LinkedIn تتجدّد بتطبيقها الثاني (D-417). */
  kind?: string
  /** ‏كم رُفض تجديدُه متتاليًا (D-320 · تحقّق D-320 على main: الرفضُ وحدَه لا العابر) — صفرٌ للسليم، وغيابُه صفر. */
  renew_failures?: number
}

/**
 * الحساباتُ التي يقترب رمزُها — **وقد يُجدَّد بعد**.
 *
 * ويُستثنى `revoked` وحده: `needs_reauth` **يُحاوَل مرّةً أخرى** —
 * فقد عُلّم بخطأٍ عابر، ورمزُ تجديدِه قد يكون سليما.
 *
 * ‏**والسليمُ أوّلًا** (D-320): ما لم يسقط قبلُ (`renew_retry_at IS NULL`) يتقدّم على ما سقط، ثمّ أقلُّ رفضًا، ثمّ أقدمُ سقوطًا
 * ‏فيدور الساقطون بينهم، وما سقط لا يُختار قبل موعده (`renew_retry_at`). فلا تملأ الدفعةَ حساباتٌ لا تتجدّد.
 *
 * ‏**وعطلُ هذا السؤال يُرمى** (تحقّق D-320 على main): كان يُبلَع فيعيد فراغًا، فتنبض الدورةُ «دارت، لا مستحقّ» و`/pulse` ‏200
 * ‏والرموزُ تموت. فيصل `renewTick` فينبض `failed`.
 */
export async function dueForRenewal(
  db: Db,
  now: Date,
  marginSeconds = RENEW_MARGIN_SECONDS,
): Promise<DueRow[]> {
  const cutoff = new Date(now.getTime() + marginSeconds * 1000).toISOString()
  const { results } = await db
    .prepare(
      `SELECT t.account_id, a.platform, a.kind, a.org_id, t.renew_failures
         FROM tokens t JOIN accounts a ON a.id = t.account_id AND a.org_id = t.org_id
        WHERE a.status != 'revoked'
          AND t.refresh_enc IS NOT NULL
          AND t.expires_at <= ?1
          AND (t.renew_retry_at IS NULL OR t.renew_retry_at <= ?2)
        ORDER BY t.renew_retry_at IS NOT NULL, t.renew_failures ASC, t.renew_retry_at ASC, t.expires_at ASC
        LIMIT 25`,
    )
    .bind(cutoff, now.toISOString())
    .all<DueRow>()
  return results
}

/**
 * يدمج ردَّ التجديد بما هو محفوظ — **ولا يمحو بالفراغ**.
 *
 * والنطاقاتُ كذلك: تجديدٌ **لا يوسّع نطاقا**، وردٌّ بلا `scope` لا
 * يعني أنّ النطاقاتِ سقطت (D-045).
 */
export function mergeRenewed(fresh: TokenResponse, stored: StoredTokens): TokenResponse {
  return {
    accessToken: fresh.accessToken,
    expiresAt: fresh.expiresAt,
    // **ما نقص يُورَث** — وردٌّ بلا رمز تجديدٍ يعني «كما هو» لا «لا شيء»
    refreshToken: fresh.refreshToken ?? stored.refreshToken,
    refreshExpiresAt: fresh.refreshExpiresAt ?? stored.refreshExpiresAt,
    scopes: fresh.scopes.length > 0 ? fresh.scopes : stored.scopes,
  }
}

/** يجدّد حسابا واحدا. */
export async function renewOne(deps: RenewDeps, row: DueRow): Promise<RenewOutcome> {
  const now = (deps.now ?? (() => new Date()))()
  const stored = await loadTokens(deps.db, deps.encKey, row.account_id, row.org_id)
  if (stored === null) {
    await markNeedsReauth(deps.db, row.account_id, row.org_id)
    return { kind: 'needs_owner', accountId: row.account_id, why: 'لا إذن محفوظ' }
  }
  if (!isExpiring(stored.expiresAt, now, RENEW_MARGIN_SECONDS)) {
    return { kind: 'skipped', accountId: row.account_id }
  }
  if (stored.refreshToken === null) {
    // **ولا يُعلَّم هنا**: منصّةٌ لا تعطي إذنَ تجديدٍ أصلا (X أحيانا)
    // ليست حسابا معطوبا — والحارسُ عند النشر يمنع النشرَ برمزٍ ميت
    return { kind: 'needs_owner', accountId: row.account_id, why: 'لا إذن تجديد لهذا الحساب' }
  }
  if (stored.refreshExpiresAt !== null && Date.parse(stored.refreshExpiresAt) <= now.getTime()) {
    await markNeedsReauth(deps.db, row.account_id, row.org_id)
    return { kind: 'needs_owner', accountId: row.account_id, why: 'انتهى إذن التجديد نفسُه' }
  }

  const platform = row.platform as Platform
  let creds: ClientCredentials | null
  try {
    creds = await deps.credentialsFor(platform, row.kind)
  } catch {
    creds = null
  }
  if (creds === null) {
    // **سرٌّ ناقصٌ عطلُ ضبطٍ لا عطلُ حساب** — ولا يُعلَّم الحسابُ به
    return { kind: 'deferred', accountId: row.account_id, why: 'أسرار التطبيق غير مضبوطة' }
  }

  try {
    const fresh = await refreshToken(
      deps.providerFor(platform),
      creds,
      stored.refreshToken,
      now,
      withTimeout(deps.fetchImpl ?? fetch, RENEW_TIMEOUT_MS),
      parseGranted(stored.scopes),
    )
    await saveTokens(deps.db, deps.encKey, row.account_id, mergeRenewed(fresh, stored))
    await markRefreshed(deps.db, row.account_id, row.org_id)
    // والحسابُ المعلَّمُ ساقطًا بخطأٍ عابرٍ يعود فعّالًا بتجديدٍ ناجح (D-157)
    await markActive(deps.db, row.account_id, row.org_id)
    return { kind: 'renewed', accountId: row.account_id }
  } catch (error) {
    /**
     * **٤٠٠ من نهاية الرمز حكمٌ نهائيّ، و٥٠٠ عابر.**
     *
     * ورمزُ تجديدٍ رُدّ لا يُصلحه انتظار — فيُعلَّم الحساب. وعطلُ شبكةٍ
     * أو ٥٠٣ يُترك للدورة التالية، **ولا يُطلَب من المالك إذنٌ لعطلٍ
     * عند المزوّد**.
     */
    const status = error instanceof OAuthError ? error.status : 0
    // ‏و«أبطئ» (‏429) و«انقضت المهلة» (‏408) و«مبكّر» (‏425) عابرةٌ لا حكم (تحقّق D-320 على main)
    const permanent = status >= 400 && status < 500 && !TRANSIENT_4XX.has(status)
    if (permanent) {
      await markNeedsReauth(deps.db, row.account_id, row.org_id)
      return {
        kind: 'needs_owner',
        accountId: row.account_id,
        why: `ردّ المزوّد التجديد (${status})`,
      }
    }
    const retryAfterSeconds = error instanceof OAuthError ? error.retryAfterSeconds : undefined
    return {
      kind: 'deferred',
      accountId: row.account_id,
      why: String(error).slice(0, 120),
      ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
    }
  }
}

export interface RenewSummary {
  readonly due: number
  readonly renewed: number
  readonly needsOwner: number
  readonly deferred: number
}

/**
 * سببُ آخر تجديدٍ لم يتمّ على صفّ الحساب (D-291) — و`null` يمحوه حين ينجح.
 *
 * الدورةُ كانت تعدّ وتُلقي `why`، فيرى المالكُ «يحتاج تجديدًا» بلا سبب. وصفٌّ لكلّ
 * دورةٍ ضجيج، فالأخيرُ وحدَه على الحساب، **ولا يُسقط الدورةَ إن لم يُكتب**.
 */
export async function noteRenewal(db: Db, accountId: string, org: string, note: string | null): Promise<void> {
  try {
    await db
      .prepare(
        `UPDATE accounts SET renew_note = ?, renew_noted_at = CASE WHEN ? IS NULL THEN NULL ELSE datetime('now') END
          WHERE id = ? AND org_id = ?`,
      )
      .bind(note, note, accountId, org)
      .run()
  } catch (error) {
    console.warn({ job: 'renew-note', account: accountId, failed: String(error) })
  }
}

/**
 * ‏يعلّم حسابًا لم يتجدّد (D-320). **الرفضُ** (`permanent`) يُعدّ ويؤجَّل: موعدُ المحاولة التالية من عدد ما رُفض. **والعابرُ لا
 * ‏يُعدّ** (تحقّق D-320 على main): يكتب لحظتَه في `renew_retry_at` فيتأخّر خلف السليم ويُحاوَل في الدورة التالية، أو بعد ما
 * ‏قالته `Retry-After` إلى نصف ساعة. **ولا يُسقط الدورةَ إن لم يُكتب**: أسوأُ ما يقع أن يُحاوَل الحسابُ في الدورة التالية كما كان.
 */
export async function holdRenewal(db: Db, row: DueRow, now: Date, permanent: boolean, retryAfterSeconds?: number): Promise<void> {
  try {
    if (permanent) {
      await db
        .prepare('UPDATE tokens SET renew_failures = renew_failures + 1, renew_retry_at = ? WHERE account_id = ? AND org_id = ?')
        .bind(nextRenewAt(row.renew_failures ?? 0, now), row.account_id, row.org_id)
        .run()
      return
    }
    const wait = Math.min(Math.max(0, retryAfterSeconds ?? 0) * 1000, RENEW_RETRY_AFTER_MAX_MS)
    await db
      .prepare('UPDATE tokens SET renew_retry_at = ? WHERE account_id = ? AND org_id = ?')
      .bind(new Date(now.getTime() + wait).toISOString(), row.account_id, row.org_id)
      .run()
  } catch (error) {
    console.warn({ job: 'renew-hold', account: row.account_id, failed: String(error) })
  }
}

/** دورةُ التجديد — **تقع قبل الطابور**، كما وعد تعليقُ الناشر. */
export async function renewDue(deps: RenewDeps): Promise<RenewSummary> {
  const clock = deps.now ?? (() => new Date())
  const now = clock()
  const rows = await dueForRenewal(deps.db, now)
  let renewed = 0
  let needsOwner = 0
  let deferred = 0
  for (const row of rows) {
    // ‏ميزانيّةُ الدورة (D-320): ما بقي ينتظر التالية — والإرسالُ بعد هذه في الدورة نفسِها
    if (clock().getTime() - now.getTime() >= RENEW_BUDGET_MS) break
    try {
      const out = await renewOne(deps, row)
      if (out.kind === 'renewed') renewed += 1
      else if (out.kind === 'needs_owner') needsOwner += 1
      else if (out.kind === 'deferred') deferred += 1
      // ‏والسببُ يبقى على الحساب لا في العدّ وحدَه (D-291)
      if (out.kind === 'renewed') await noteRenewal(deps.db, row.account_id, row.org_id, null)
      else if (out.kind !== 'skipped') await noteRenewal(deps.db, row.account_id, row.org_id, out.why)
      // ‏وما لم يتجدّد يتأخّر خلف السليم (D-320)، **والنهائيُّ وحدَه يُعدّ ويتباعد** (مراجعة D-320 · تحقّق D-320 على main):
      // ‏العابرُ يُحاوَل في الدورة التالية، أو بعد `Retry-After`
      if (out.kind === 'needs_owner') await holdRenewal(deps.db, row, now, true)
      else if (out.kind === 'deferred') await holdRenewal(deps.db, row, now, false, out.retryAfterSeconds)
    } catch (error) {
      // **حسابٌ يسقط لا يُسقط البقيّة** — دورةٌ تتوقّف عند أوّل عطلٍ
      // تترك حساباتٍ سليمةً تموت رموزُها
      deferred += 1
      await noteRenewal(deps.db, row.account_id, row.org_id, String(error).slice(0, 120))
      await holdRenewal(deps.db, row, now, false)
    }
  }
  return { due: rows.length, renewed, needsOwner, deferred }
}

/**
 * ‏**دورةٌ استحقّ فيها شيءٌ وسقط كلُّه عابرًا** (تحقّق D-320 على main): لم يتجدّد شيءٌ ولم يُرفَض شيء، فالرموزُ تقترب من موتها
 * ‏والدورةُ «دارت». فينبض `renewTick` لها `failed`، فيقول `/pulse` ‏503 وتنبيهُ «يسقط منذ…» بعد نصف ساعة. ورفضٌ أو تجديدٌ ولو
 * ‏واحدٌ ليس سقوطًا للدورة: الرفضُ يُقال للمالك على حسابه.
 */
export function renewStalled(summary: RenewSummary): boolean {
  return summary.deferred > 0 && summary.renewed === 0 && summary.needsOwner === 0
}

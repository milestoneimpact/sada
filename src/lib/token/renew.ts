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

export interface RenewDeps {
  readonly db: Db
  readonly encKey: string
  /** أسرارُ التطبيق لكلّ منصّة — تُقرأ مرّةً لا لكلّ حساب. */
  readonly credentialsFor: (platform: Platform) => Promise<ClientCredentials | null>
  readonly providerFor: (platform: Platform) => Provider
  readonly fetchImpl?: typeof fetch
  readonly now?: () => Date
}

export type RenewOutcome =
  /** جُدِّد وحُفظ. */
  | { readonly kind: 'renewed'; readonly accountId: string }
  /** لا إذنَ تجديدٍ أو انتهى هو كذلك — **ولا سبيلَ إلّا يدُ المالك**. */
  | { readonly kind: 'needs_owner'; readonly accountId: string; readonly why: string }
  /** عطلٌ عابر — يُترك للدورة التالية ولا يُعلَّم الحساب. */
  | { readonly kind: 'deferred'; readonly accountId: string; readonly why: string }
  /** لم يحن وقتُه. */
  | { readonly kind: 'skipped'; readonly accountId: string }

interface DueRow {
  account_id: string
  platform: string
}

/**
 * الحساباتُ التي يقترب رمزُها — **وقد يُجدَّد بعد**.
 *
 * ويُستثنى `revoked` وحده: `needs_reauth` **يُحاوَل مرّةً أخرى** —
 * فقد عُلّم بخطأٍ عابر، ورمزُ تجديدِه قد يكون سليما.
 */
export async function dueForRenewal(
  db: Db,
  now: Date,
  marginSeconds = RENEW_MARGIN_SECONDS,
): Promise<DueRow[]> {
  const cutoff = new Date(now.getTime() + marginSeconds * 1000).toISOString()
  try {
    const { results } = await db
      .prepare(
        `SELECT t.account_id, a.platform
           FROM tokens t JOIN accounts a ON a.id = t.account_id
          WHERE a.status != 'revoked'
            AND t.refresh_enc IS NOT NULL
            AND t.expires_at <= ?
          ORDER BY t.expires_at ASC
          LIMIT 25`,
      )
      .bind(cutoff)
      .all<DueRow>()
    return results
  } catch {
    return []
  }
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
  const stored = await loadTokens(deps.db, deps.encKey, row.account_id)
  if (stored === null) {
    await markNeedsReauth(deps.db, row.account_id)
    return { kind: 'needs_owner', accountId: row.account_id, why: 'لا إذنَ محفوظ' }
  }
  if (!isExpiring(stored.expiresAt, now, RENEW_MARGIN_SECONDS)) {
    return { kind: 'skipped', accountId: row.account_id }
  }
  if (stored.refreshToken === null) {
    // **ولا يُعلَّم هنا**: منصّةٌ لا تعطي إذنَ تجديدٍ أصلا (X أحيانا)
    // ليست حسابا معطوبا — والحارسُ عند النشر يمنع النشرَ برمزٍ ميت
    return { kind: 'needs_owner', accountId: row.account_id, why: 'لا إذنَ تجديدٍ لهذا الحساب' }
  }
  if (stored.refreshExpiresAt !== null && Date.parse(stored.refreshExpiresAt) <= now.getTime()) {
    await markNeedsReauth(deps.db, row.account_id)
    return { kind: 'needs_owner', accountId: row.account_id, why: 'انتهى إذنُ التجديد نفسُه' }
  }

  const platform = row.platform as Platform
  let creds: ClientCredentials | null
  try {
    creds = await deps.credentialsFor(platform)
  } catch {
    creds = null
  }
  if (creds === null) {
    // **سرٌّ ناقصٌ عطلُ ضبطٍ لا عطلُ حساب** — ولا يُعلَّم الحسابُ به
    return { kind: 'deferred', accountId: row.account_id, why: 'أسرارُ التطبيق غير مضبوطة' }
  }

  try {
    const fresh = await refreshToken(
      deps.providerFor(platform),
      creds,
      stored.refreshToken,
      now,
      deps.fetchImpl ?? fetch,
      parseGranted(stored.scopes),
    )
    await saveTokens(deps.db, deps.encKey, row.account_id, mergeRenewed(fresh, stored))
    await markRefreshed(deps.db, row.account_id)
    // والحسابُ المعلَّمُ ساقطًا بخطأٍ عابرٍ يعود فعّالًا بتجديدٍ ناجح (D-157)
    await markActive(deps.db, row.account_id)
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
    const permanent = status >= 400 && status < 500
    if (permanent) {
      await markNeedsReauth(deps.db, row.account_id)
      return {
        kind: 'needs_owner',
        accountId: row.account_id,
        why: `ردّ المزوّدُ التجديد (${status})`,
      }
    }
    return { kind: 'deferred', accountId: row.account_id, why: String(error).slice(0, 120) }
  }
}

export interface RenewSummary {
  readonly due: number
  readonly renewed: number
  readonly needsOwner: number
  readonly deferred: number
}

/** دورةُ التجديد — **تقع قبل الطابور**، كما وعد تعليقُ الناشر. */
export async function renewDue(deps: RenewDeps): Promise<RenewSummary> {
  const now = (deps.now ?? (() => new Date()))()
  const rows = await dueForRenewal(deps.db, now)
  let renewed = 0
  let needsOwner = 0
  let deferred = 0
  for (const row of rows) {
    try {
      const out = await renewOne(deps, row)
      if (out.kind === 'renewed') renewed += 1
      else if (out.kind === 'needs_owner') needsOwner += 1
      else if (out.kind === 'deferred') deferred += 1
    } catch {
      // **حسابٌ يسقط لا يُسقط البقيّة** — دورةٌ تتوقّف عند أوّل عطلٍ
      // تترك حساباتٍ سليمةً تموت رموزُها
      deferred += 1
    }
  }
  return { due: rows.length, renewed, needsOwner, deferred }
}

/**
 * مخزن الرموز — الطبقة الوحيدة التي تلمس جدول `tokens`.
 *
 * لا رمز خام يعبر من هنا إلى D1، ولا رمز مشفر يعبر إلى خارج هذه الوحدة إلا
 * مفكوكا لمن طلبه صراحة (D-005). ولا تُسجل قيمة رمز في أي مسار.
 */
import { legacyOrgKey, openScoped, sealScoped, tokenContext } from './crypto'
import type { TokenResponse } from './oauth/exchange'
import type { Platform } from './oauth/providers'
import { changedRows } from './dbResult'

/** ما يكفي D1 من واجهة، حتى تُختبر الوحدة على SQLite حقيقي. */
export interface Db {
  prepare(query: string): DbStatement
  /** معاملةٌ واحدة في D1 — كلُّها أو لا شيء. واختياريّةٌ لأنّ غيرَ D1 قد لا يملكها. */
  batch?(statements: DbStatement[]): Promise<unknown>
}

/**
 * يكتب الصفوفَ معًا أو لا يكتب منها شيئًا (D-182) — `batch` في D1 معاملةٌ واحدة.
 *
 * كان منشورٌ يُدرَج ثمّ وسيطُه في طلبين؛ وخطأٌ عابرٌ بينهما يترك منشورًا بلا مقطعه
 * ومفتاحُه محجوز، فلا يُصلَح بضغطةٍ ثانية. وقاعدةٌ بلا `batch` تُكتب صفًّا صفًّا كما كانت.
 */
export async function atomically(db: Db, statements: DbStatement[]): Promise<void> {
  if (db.batch !== undefined) {
    await db.batch(statements)
    return
  }
  for (const statement of statements) await statement.run()
}

/** ‏كم عبارةً في الدفعة الواحدة (D-320) — دون كلّ حدٍّ لـD1 على حجم الطلب، وألفُ ملفٍّ في عشرين نداءً لا ألف. */
export const DB_BATCH_SIZE = 50

/**
 * ‏**عباراتٌ كثيرة في دفعاتٍ لا في نداءاتٍ** (D-320): D1 يقبل ألفَ نداءٍ في الاستدعاء الواحد (Workers Paid)، **والدفعةُ نداءٌ
 * ‏واحد**. وكلُّ دفعةٍ معاملةٌ وحدَها — لا الكلُّ معًا كـ`atomically`: ما كُتب في دفعةٍ يبقى إن سقطت التي بعدها، فلا يُستعمل
 * ‏هذا لما يجب أن يقع كلُّه أو لا شيء. وقاعدةٌ بلا `batch` تُكتب صفًّا صفًّا.
 */
export async function inBatches(db: Db, statements: readonly DbStatement[], size = DB_BATCH_SIZE): Promise<void> {
  for (let i = 0; i < statements.length; i += size) {
    const chunk = statements.slice(i, i + size)
    if (db.batch !== undefined) await db.batch(chunk)
    else for (const statement of chunk) await statement.run()
  }
}

/**
 * ‏**تطبيقٌ حُفظ أو فُحص فنجح: تباعدُ تجديد منصّته يُمحى** (مراجعة D-320). ‏401 `invalid_client` من نهاية الرمز رفضٌ نهائيٌّ يتباعد
 * ‏حتّى يوم (`token/renew.ts`)، وسببُه سرُّ التطبيق — فإن صُحّح لم يكن ما ينتظره الحساب. والتطبيقُ إعدادٌ عامٌّ يخدم كلَّ
 * ‏المنظّمات، فيُمحى في كلّ منظّمةٍ وحسابُ الرمز من منظّمته. **ولا يُسقط الحفظَ إن لم يُكتب**: أسوأُ ما يقع أن ينتظر الحسابُ موعدَه.
 */
export async function releaseRenewalHolds(db: Db, platform: Platform): Promise<void> {
  try {
    await db
      .prepare(
        `UPDATE tokens SET renew_failures = 0, renew_retry_at = NULL
          WHERE (renew_failures > 0 OR renew_retry_at IS NOT NULL)
            AND account_id IN (SELECT a.id FROM accounts a WHERE a.platform = ? AND a.org_id = tokens.org_id)`,
      )
      .bind(platform)
      .run()
  } catch (error) {
    console.warn({ job: 'renew-release', platform, failed: String(error) })
  }
}

export interface DbStatement {
  bind(...values: unknown[]): DbStatement
  first<T = unknown>(): Promise<T | null>
  /** D1 يعيد غلافا لا مصفوفة: { results, success, meta } */
  all<T = unknown>(): Promise<{ results: T[] }>
  run(): Promise<unknown>
}

export interface StoredTokens {
  readonly accessToken: string
  readonly refreshToken: string | null
  readonly expiresAt: string
  readonly refreshExpiresAt: string | null
  readonly scopes: string
}

export interface AccountIdentity {
  readonly platform: Platform
  readonly kind: 'member' | 'org'
  readonly externalId: string
  readonly displayName: string
}

/** معرف حساب مشتق من هويته، فربط الحساب نفسه مرتين لا ينشئ صفين. */
export function accountId(identity: AccountIdentity): string {
  return `${identity.platform}:${identity.kind}:${identity.externalId}`
}

/** الحسابُ مربوطٌ في منظّمةٍ أخرى: لا يُنقَل منها صامتًا (D-229). */
export class AccountElsewhere extends Error {
  override readonly name = 'AccountElsewhere'
  constructor(readonly displayName: string) {
    super(`${displayName} مربوط في منظّمة أخرى`)
  }
}

/**
 * يربط الحسابَ بالمنظّمة. **والحسابُ الخارجيُّ لمنظّمةٍ واحدة**: ربطُه من
 * منظّمةٍ أخرى يُرفَض ولا يُنقَل، وإلّا انتقلت رموزُه ومنشوراتُه المجدولة
 * إلى من ربطه أخيرًا بلا علم الأولى.
 */
export async function upsertAccount(
  db: Db,
  org: string,
  identity: AccountIdentity,
): Promise<string> {
  const id = accountId(identity)
  const result = await db
    .prepare(
      `INSERT INTO accounts (id, org_id, platform, kind, external_id, display_name, status)
       VALUES (?, ?, ?, ?, ?, ?, 'active')
       ON CONFLICT (platform, kind, external_id)
       DO UPDATE SET display_name = excluded.display_name, status = 'active',
                     needs_reauth_at = NULL
        WHERE accounts.org_id = excluded.org_id`,
    )
    .bind(id, org, identity.platform, identity.kind, identity.externalId, identity.displayName)
    .run()
  if (!changedRows(result)) throw new AccountElsewhere(identity.displayName)
  return id
}

/**
 * نطاقُ رموز المنظّمة (D-238 · D-318): **كلُّ منظّمةٍ مفتاحُها مشتقٌّ باسمها — المالكُ معها**، والنصُّ الجديدُ موسومٌ
 * بمعرّف مفتاحه. والقديمُ يُقرأ بطريقته (`legacyOrgKey`): المالكُ بالخام، والعميلُ بالمشتقّ القديم.
 */
export function tokenScope(org: string): string {
  return `tokens:${org}`
}

/** يشفر الرموز ويكتبها. يستبدل ما كان للحساب نفسه. */
export async function saveTokens(
  db: Db,
  encKey: string,
  id: string,
  tokens: TokenResponse,
): Promise<void> {
  // ‏منظّمةُ الحساب تُكتب مع الرمز، فالفكُّ يقرأ المفتاحَ الذي شُفِّر به
  const owner = await db
    .prepare('SELECT org_id FROM accounts WHERE id = ?')
    .bind(id)
    .first<{ org_id: string }>()
  const org = owner?.org_id ?? 'org_owner'
  const access = await sealScoped(encKey, tokenScope(org), tokens.accessToken, tokenContext(id, 'access'))
  const refresh =
    tokens.refreshToken === null
      ? null
      : await sealScoped(encKey, tokenScope(org), tokens.refreshToken, tokenContext(id, 'refresh'))

  // ‏ورمزٌ حُفظ — تجديدٌ نجح أو ربطٌ من جديد — يمحو تباعدَ ما سقط قبله (D-320): `renew_failures` و`renew_retry_at`
  await db
    .prepare(
      `INSERT INTO tokens
         (account_id, access_enc, access_iv, refresh_enc, refresh_iv,
          expires_at, refresh_expires_at, scopes, updated_at, org_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
       ON CONFLICT (account_id) DO UPDATE SET
         org_id = excluded.org_id,
         access_enc = excluded.access_enc,
         access_iv = excluded.access_iv,
         refresh_enc = excluded.refresh_enc,
         refresh_iv = excluded.refresh_iv,
         expires_at = excluded.expires_at,
         refresh_expires_at = excluded.refresh_expires_at,
         scopes = excluded.scopes,
         updated_at = datetime('now'),
         renew_failures = 0,
         renew_retry_at = NULL`,
    )
    .bind(
      id,
      access.ciphertext,
      access.iv,
      refresh?.ciphertext ?? null,
      refresh?.iv ?? null,
      tokens.expiresAt,
      tokens.refreshExpiresAt,
      tokens.scopes,
      org,
    )
    .run()
}

interface TokenRow {
  access_enc: string
  access_iv: string
  refresh_enc: string | null
  refresh_iv: string | null
  expires_at: string
  refresh_expires_at: string | null
  scopes: string
  org_id: string
}

/**
 * يقرأ الرموز ويفك تشفيرها. يعيد `null` إن لم يكن للحساب رمز.
 *
 * و`org` حين يُمرَّر **شرطٌ يُفرَض** (D-277): رمزُ حسابٍ في منظّمةٍ أخرى يعود
 * `null` كأنّه لا رمز. والمعاملُ اختياريٌّ لمن لا يملك المنظّمة بعد (الناشر يمرّر
 * `post.org_id`)، لا رخصةً لإغفالها.
 */
export async function loadTokens(
  db: Db,
  encKey: string,
  id: string,
  org?: string,
): Promise<StoredTokens | null> {
  const row = await (org === undefined
    ? db
        .prepare(
          `SELECT access_enc, access_iv, refresh_enc, refresh_iv,
                  expires_at, refresh_expires_at, scopes, org_id
             FROM tokens WHERE account_id = ?`,
        )
        .bind(id)
    : db
        .prepare(
          `SELECT access_enc, access_iv, refresh_enc, refresh_iv,
                  expires_at, refresh_expires_at, scopes, org_id
             FROM tokens WHERE account_id = ? AND org_id = ?`,
        )
        .bind(id, org)
  ).first<TokenRow>()
  if (row === null) return null

  const scope = tokenScope(row.org_id)
  const legacy = legacyOrgKey(row.org_id)
  const accessToken = await openScoped(
    encKey,
    scope,
    { ciphertext: row.access_enc, iv: row.access_iv },
    tokenContext(id, 'access'),
    legacy,
  )
  const refreshToken =
    row.refresh_enc !== null && row.refresh_iv !== null
      ? await openScoped(
          encKey,
          scope,
          { ciphertext: row.refresh_enc, iv: row.refresh_iv },
          tokenContext(id, 'refresh'),
          legacy,
        )
      : null

  return {
    accessToken,
    refreshToken,
    expiresAt: row.expires_at,
    refreshExpiresAt: row.refresh_expires_at,
    scopes: row.scopes,
  }
}

/** يختم تجديدا ناجحا — **وحدَه**، فالربطُ الأوّل ليس تجديدا (D-129). والمنظّمةُ منظّمةُ الحساب (D-277). */
export async function markRefreshed(db: Db, id: string, org: string): Promise<void> {
  await db
    .prepare("UPDATE tokens SET refreshed_at = datetime('now') WHERE account_id = ? AND org_id = ?")
    .bind(id, org)
    .run()
}

/**
 * **تجديدٌ ناجحٌ يعيد الحسابَ فعّالًا** (D-157). كان `needs_reauth` يبقى بعد أن
 * ينجح التجديدُ التالي: على staging حسابُ X مجدَّدٌ اليوم وإذنُه صالحٌ وحالُه
 * «يحتاج تجديدًا» منذ أمس — فيُطلَب من المالك ربطٌ لا حاجةَ إليه.
 */
export async function markActive(db: Db, id: string, org: string): Promise<void> {
  await db
    .prepare(
      `UPDATE accounts SET status = 'active', needs_reauth_at = NULL
        WHERE id = ? AND org_id = ? AND status = 'needs_reauth'`,
    )
    .bind(id, org)
    .run()
}

/**
 * يعلّم حسابا بأنه يحتاج إعادة ربط — بلا حذف، فالجدولة لا تضيع.
 *
 * و`org` حين يُمرَّر شرطٌ يُفرَض (D-277)؛ وبلا منظّمةٍ يُعلَّم الحسابُ بمعرّفه وحده
 * (`? IS NULL`)، والمعاملُ اختياريٌّ للناشر حتى يمرّر `post.org_id`.
 */
export async function markNeedsReauth(db: Db, id: string, org?: string): Promise<void> {
  // ‏وحسابٌ فصله المالكُ يبقى مفصولًا (D-197): لا يعود «جدّد الإذن» برسالةٍ متأخّرة
  // **ويُختَم وقتُ السقوط مرّةً** (D-131): تعليمٌ ثانٍ لحسابٍ ساقطٍ لا يبدّل التاريخ
  const scope = org ?? null
  await db
    .prepare(
      `UPDATE accounts SET status = 'needs_reauth',
              needs_reauth_at = COALESCE(needs_reauth_at, datetime('now'))
        WHERE id = ? AND (? IS NULL OR org_id = ?) AND status != 'revoked'`,
    )
    .bind(id, scope, scope)
    .run()
}

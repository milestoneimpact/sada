/**
 * مخزن الرموز — الطبقة الوحيدة التي تلمس جدول `tokens`.
 *
 * لا رمز خام يعبر من هنا إلى D1، ولا رمز مشفر يعبر إلى خارج هذه الوحدة إلا
 * مفكوكا لمن طلبه صراحة (D-005). ولا تُسجل قيمة رمز في أي مسار.
 */
import { deriveKey, importKey, open, seal, tokenContext } from './crypto'
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
 * مفتاحُ رموز المنظّمة (D-238): المالكُ بالمفتاح الأصل فلا يُعاد تشفيرُ رمزٍ قائم،
 * وغيرُه بمفتاحٍ مشتقٍّ باسمه. والاسمُ حرفيٌّ هنا لا من `tenancy`، وإلّا دارت الحلقة.
 */
async function orgKey(encKey: string, org: string): Promise<CryptoKey> {
  return org === 'org_owner' ? importKey(encKey) : deriveKey(encKey, org)
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
  const key = await orgKey(encKey, org)
  const access = await seal(key, tokens.accessToken, tokenContext(id, 'access'))
  const refresh =
    tokens.refreshToken === null
      ? null
      : await seal(key, tokens.refreshToken, tokenContext(id, 'refresh'))

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
         updated_at = datetime('now')`,
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

/** يقرأ الرموز ويفك تشفيرها. يعيد `null` إن لم يكن للحساب رمز. */
export async function loadTokens(
  db: Db,
  encKey: string,
  id: string,
): Promise<StoredTokens | null> {
  const row = await db
    .prepare(
      `SELECT access_enc, access_iv, refresh_enc, refresh_iv,
              expires_at, refresh_expires_at, scopes, org_id
         FROM tokens WHERE account_id = ?`,
    )
    .bind(id)
    .first<TokenRow>()
  if (row === null) return null

  const key = await orgKey(encKey, row.org_id)
  const accessToken = await open(
    key,
    { ciphertext: row.access_enc, iv: row.access_iv },
    tokenContext(id, 'access'),
  )
  const refreshToken =
    row.refresh_enc !== null && row.refresh_iv !== null
      ? await open(
          key,
          { ciphertext: row.refresh_enc, iv: row.refresh_iv },
          tokenContext(id, 'refresh'),
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

/** يعلّم حسابا بأنه يحتاج إعادة ربط — بلا حذف، فالجدولة لا تضيع. */
/** يختم تجديدا ناجحا — **وحدَه**، فالربطُ الأوّل ليس تجديدا (D-129). */
export async function markRefreshed(db: Db, id: string): Promise<void> {
  await db.prepare("UPDATE tokens SET refreshed_at = datetime('now') WHERE account_id = ?").bind(id).run()
}

/**
 * **تجديدٌ ناجحٌ يعيد الحسابَ فعّالًا** (D-157). كان `needs_reauth` يبقى بعد أن
 * ينجح التجديدُ التالي: على staging حسابُ X مجدَّدٌ اليوم وإذنُه صالحٌ وحالُه
 * «يحتاج تجديدًا» منذ أمس — فيُطلَب من المالك ربطٌ لا حاجةَ إليه.
 */
export async function markActive(db: Db, id: string): Promise<void> {
  await db
    .prepare("UPDATE accounts SET status = 'active', needs_reauth_at = NULL WHERE id = ? AND status = 'needs_reauth'")
    .bind(id)
    .run()
}

export async function markNeedsReauth(db: Db, id: string): Promise<void> {
  // ‏وحسابٌ فصله المالكُ يبقى مفصولًا (D-197): لا يعود «جدّد الإذن» برسالةٍ متأخّرة
  // **ويُختَم وقتُ السقوط مرّةً** (D-131): تعليمٌ ثانٍ لحسابٍ ساقطٍ لا يبدّل التاريخ
  await db
    .prepare(
      `UPDATE accounts SET status = 'needs_reauth',
              needs_reauth_at = COALESCE(needs_reauth_at, datetime('now'))
        WHERE id = ? AND status != 'revoked'`,
    )
    .bind(id)
    .run()
}

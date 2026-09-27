/**
 * مخزن الرموز — الطبقة الوحيدة التي تلمس جدول `tokens`.
 *
 * لا رمز خام يعبر من هنا إلى D1، ولا رمز مشفر يعبر إلى خارج هذه الوحدة إلا
 * مفكوكا لمن طلبه صراحة (D-005). ولا تُسجل قيمة رمز في أي مسار.
 */
import { importKey, open, seal, tokenContext } from './crypto'
import type { TokenResponse } from './oauth/exchange'
import type { Platform } from './oauth/providers'

/** ما يكفي D1 من واجهة، حتى تُختبر الوحدة على SQLite حقيقي. */
export interface Db {
  prepare(query: string): DbStatement
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

export async function upsertAccount(db: Db, identity: AccountIdentity): Promise<string> {
  const id = accountId(identity)
  await db
    .prepare(
      `INSERT INTO accounts (id, platform, kind, external_id, display_name, status)
       VALUES (?, ?, ?, ?, ?, 'active')
       ON CONFLICT (platform, kind, external_id)
       DO UPDATE SET display_name = excluded.display_name, status = 'active',
                     needs_reauth_at = NULL`,
    )
    .bind(id, identity.platform, identity.kind, identity.externalId, identity.displayName)
    .run()
  return id
}

/** يشفر الرموز ويكتبها. يستبدل ما كان للحساب نفسه. */
export async function saveTokens(
  db: Db,
  encKey: string,
  id: string,
  tokens: TokenResponse,
): Promise<void> {
  const key = await importKey(encKey)
  const access = await seal(key, tokens.accessToken, tokenContext(id, 'access'))
  const refresh =
    tokens.refreshToken === null
      ? null
      : await seal(key, tokens.refreshToken, tokenContext(id, 'refresh'))

  await db
    .prepare(
      `INSERT INTO tokens
         (account_id, access_enc, access_iv, refresh_enc, refresh_iv,
          expires_at, refresh_expires_at, scopes, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT (account_id) DO UPDATE SET
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
              expires_at, refresh_expires_at, scopes
         FROM tokens WHERE account_id = ?`,
    )
    .bind(id)
    .first<TokenRow>()
  if (row === null) return null

  const key = await importKey(encKey)
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
  // **ويُختَم وقتُ السقوط مرّةً** (D-131): تعليمٌ ثانٍ لحسابٍ ساقطٍ لا يبدّل التاريخ
  await db
    .prepare(
      `UPDATE accounts SET status = 'needs_reauth',
              needs_reauth_at = COALESCE(needs_reauth_at, datetime('now'))
        WHERE id = ?`,
    )
    .bind(id)
    .run()
}

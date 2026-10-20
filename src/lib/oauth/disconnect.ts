/**
 * فصلُ حسابٍ مربوط (D-197): **الرموزُ تُحذف أوّلًا، والإبطالُ عند المنصّة محاولةٌ بعده.**
 *
 * وعدت صفحةُ الخصوصيّة بأنّ المشغّل يفصل أيَّ حسابٍ من اللوحة فتُحذف رموزُه، ولم يكن
 * في اللوحة زرٌّ ولا مسار. فالترتيبُ هنا هو الوعد نفسُه:
 *
 *   ١ · تُفكّ الرموزُ في الذاكرة إن أمكن، لنداء الإبطال وحده.
 *   ٢ · في معاملةٍ واحدة: يُحذف صفُّ `tokens`، ويصير الحسابُ `revoked`، ويُردّ كلُّ منشورٍ
 *       مجدولٍ عليه `failed` بسبب `account_disconnected` ومحاولةٍ تقول ذلك (D-159).
 *   ٣ · ثمّ يُنادى الإبطالُ عند المنصّة. **وفشلُه لا يُعيد شيئًا**: الحذفُ وقع قبله.
 *
 * ونداءُ الإبطال مجّانيٌّ عند المنصّات كلّها، فلا يُكتب في `cost_ledger` (D-008).
 * ولا تُكتب قيمةُ رمزٍ في سجلٍّ ولا ردٍّ ولا عنوان: الرمزُ في جسد الطلب أو ترويسته وحدهما.
 */
import { atomically, loadTokens, type Db, type StoredTokens } from '../tokens'
import type { ClientCredentials } from './exchange'
import type { Platform } from './providers'

/** ما وقع عند المنصّة: أُبطل، أو تعذّر، أو لا نهايةَ إبطالٍ تُنادى. */
export type RevokeOutcome = 'revoked' | 'failed' | 'unsupported' | 'no_tokens'

/** أين يسحب المالكُ الإذنَ بيده: الصفحةُ نفسُها لا وصفُها. */
export const REVOKE_PAGE: Readonly<Record<Platform, { readonly url: string; readonly label: string }>> = {
  youtube: { url: 'https://security.google.com/settings/security/permissions', label: 'أذونات حساب Google' },
  linkedin: { url: 'https://www.linkedin.com/mypreferences/d/permitted-services', label: 'الخدمات المسموح بها في LinkedIn' },
  x: { url: 'https://x.com/settings/connected_apps', label: 'التطبيقات المتّصلة في X' },
  tiktok: { url: 'https://www.tiktok.com/setting', label: 'إعدادات TikTok ثمّ الأمان ثمّ التطبيقات' },
  instagram: { url: 'https://www.instagram.com/accounts/manage_access/', label: 'مواقع وتطبيقات Instagram' },
}

const TIMEOUT_MS = 5000

function form(fields: Record<string, string>): string {
  return new URLSearchParams(fields).toString()
}

const FORM_HEADERS = { 'Content-Type': 'application/x-www-form-urlencoded' }

/**
 * طلباتُ الإبطال لكلّ منصّة. **والرمزُ في الجسد أو الترويسة، لا في العنوان قطّ**:
 * العنوانُ يُسجَّل في الوسطاء، والجسدُ لا.
 */
function revokeRequests(
  platform: Platform,
  tokens: StoredTokens,
  app: ClientCredentials | null,
): Request[] | null {
  switch (platform) {
    case 'youtube':
      // ‏Google: إبطالُ رمز التجديد يُسقط رموزَ الوصول المشتقّة منه معه
      return [new Request('https://oauth2.googleapis.com/revoke', {
        method: 'POST', headers: FORM_HEADERS,
        body: form({ token: tokens.refreshToken ?? tokens.accessToken }),
      })]
    case 'x': {
      if (app === null) return null
      const auth = { ...FORM_HEADERS, Authorization: `Basic ${btoa(`${app.clientId}:${app.clientSecret}`)}` }
      const list = [new Request('https://api.x.com/2/oauth2/revoke', {
        method: 'POST', headers: auth,
        body: form({ token: tokens.accessToken, token_type_hint: 'access_token' }),
      })]
      if (tokens.refreshToken !== null) {
        list.push(new Request('https://api.x.com/2/oauth2/revoke', {
          method: 'POST', headers: auth,
          body: form({ token: tokens.refreshToken, token_type_hint: 'refresh_token' }),
        }))
      }
      return list
    }
    case 'linkedin':
      if (app === null) return null
      return [new Request('https://www.linkedin.com/oauth/v2/revoke', {
        method: 'POST', headers: FORM_HEADERS,
        body: form({ client_id: app.clientId, client_secret: app.clientSecret, token: tokens.accessToken }),
      })]
    case 'tiktok':
      if (app === null) return null
      return [new Request('https://open.tiktokapis.com/v2/oauth/revoke/', {
        method: 'POST', headers: FORM_HEADERS,
        body: form({ client_key: app.clientId, client_secret: app.clientSecret, token: tokens.accessToken }),
      })]
    case 'instagram':
      // ‏الطريقُ عبر صفحة فيسبوك رمزُه رمزُ Graph، فيُسحب بـ DELETE /me/permissions.
      // ‏وInstagram Business Login لا نهايةَ إبطالٍ موثّقةً له، فيُقال ذلك ولا يُخترَع نداء
      if (!/\bpages_show_list\b/.test(tokens.scopes)) return null
      return [new Request('https://graph.facebook.com/v21.0/me/permissions', {
        method: 'DELETE', headers: { Authorization: `Bearer ${tokens.accessToken}` },
      })]
  }
}

/** يُنادي الإبطال. لا يرمي، ولا يُسجّل جسدَ الردّ: قد يردّ بعضُها ما أُرسل إليه. */
export async function revokeRemote(
  platform: Platform,
  tokens: StoredTokens | null,
  app: ClientCredentials | null,
  fetchImpl: typeof fetch = fetch,
): Promise<RevokeOutcome> {
  if (tokens === null) return 'no_tokens'
  // ‏منصّةٌ تطلب سرَّ التطبيق للإبطال، والسرُّ غائب: تعذّر، لا «لا نهاية»
  if (app === null && (platform === 'x' || platform === 'linkedin' || platform === 'tiktok')) return 'failed'
  const requests = revokeRequests(platform, tokens, app)
  if (requests === null) return 'unsupported'
  let ok = true
  for (const request of requests) {
    try {
      const response = await fetchImpl(request, { signal: AbortSignal.timeout(TIMEOUT_MS) })
      if (!response.ok) ok = false
    } catch {
      ok = false
    }
  }
  return ok ? 'revoked' : 'failed'
}

export interface DisconnectTarget {
  readonly id: string
  readonly platform: Platform
  readonly displayName: string
  /** منظّمةُ الحساب: لا يُفصَل حسابُ منظّمةٍ من شاشة غيرها (D-229). */
  readonly org: string
}

/**
 * حسابٌ يُفصَل **بمعرّفه ومنصّته معًا**، وغيرُ مفصولٍ قبلُ. فمعرّفٌ لحسابٍ على منصّةٍ
 * غيرِ الصفحة التي ضُغط فيها الزرّ يُردّ، ولا يُفصَل حسابٌ لم يُقصَد.
 */
export async function findLinked(
  db: Db,
  org: string,
  id: string,
  platform: Platform,
): Promise<DisconnectTarget | null> {
  const row = await db
    .prepare(
      `SELECT id, platform, display_name FROM accounts
        WHERE id = ? AND platform = ? AND org_id = ? AND status != 'revoked'`,
    )
    .bind(id, platform, org)
    .first<{ id: string; platform: Platform; display_name: string }>()
  return row === null ? null : { id: row.id, platform: row.platform, displayName: row.display_name, org }
}

export interface DisconnectResult {
  /** كم منشورًا مجدولًا رُدّ `failed`. */
  readonly stopped: number
  readonly remote: RevokeOutcome
}

/** الفصلُ كلُّه. الحذفُ المحلّيّ لا يتوقّف على شيءٍ عند المنصّة. */
export async function disconnectAccount(
  db: Db,
  encKey: string,
  target: DisconnectTarget,
  app: ClientCredentials | null,
  fetchImpl: typeof fetch = fetch,
): Promise<DisconnectResult> {
  // ‏رمزٌ لا يُفكّ (مفتاحٌ بُدّل) لا يمنع الحذف: يُفصَل الحسابُ ولا يُنادى إبطال
  let tokens: StoredTokens | null = null
  try {
    tokens = await loadTokens(db, encKey, target.id)
  } catch {
    tokens = null
  }

  const queued = await db
    .prepare(`SELECT id, idempotency_key FROM posts WHERE account_id = ? AND status = 'queued'`)
    .bind(target.id)
    .all<{ id: string; idempotency_key: string }>()

  const statements = [
    db.prepare('DELETE FROM tokens WHERE account_id = ?').bind(target.id),
    db
      .prepare(`UPDATE accounts SET status = 'revoked', needs_reauth_at = NULL WHERE id = ? AND org_id = ?`)
      .bind(target.id, target.org),
  ]
  for (const post of queued.results) {
    statements.push(
      db
        .prepare(
          `INSERT INTO publish_attempts
             (id, post_id, idempotency_key, attempt_no, request_json, response_json, status, org_id)
           VALUES (?, ?, ?,
             (SELECT coalesce(max(attempt_no), 0) + 1 FROM publish_attempts WHERE post_id = ?),
             ?, ?, 'failed', ?)`,
        )
        .bind(
          crypto.randomUUID(), post.id, post.idempotency_key, post.id,
          JSON.stringify({ platform: target.platform, preflight: true }),
          JSON.stringify({ error: 'account_disconnected', preflight: true }),
          target.org,
        ),
      db.prepare(`UPDATE posts SET status = 'failed' WHERE id = ? AND status = 'queued'`).bind(post.id),
    )
  }
  await atomically(db, statements)

  const remote = await revokeRemote(target.platform, tokens, app, fetchImpl)
  return { stopped: queued.results.length, remote }
}

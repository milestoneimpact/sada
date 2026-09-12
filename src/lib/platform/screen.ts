/**
 * شاشةُ المنصّة — ما نُشر عليها، وما ينتظر، وما تستطيعه.
 *
 * ## لماذا شاشةٌ لكلّ منصّة، والقنواتُ لها لوحٌ أصلا
 *
 * لوحُ القنوات يجيب سؤالا واحدا: **أمربوطةٌ أم لا.** وهو سؤالُ الضبط،
 * يُسأل مرّةً ثمّ لا يُعاد.
 *
 * والأسئلةُ التي تُسأل كلَّ يومٍ ليست منه: ماذا نُشر على LinkedIn هذا
 * الأسبوع؟ وأين رابطُ المنشور؟ وما الذي فشل ولماذا؟ وهل يستطيع هذا
 * الرمزُ رفعَ صورة أصلا؟ — **ولا موضعَ لأيٍّ منها في بطاقةٍ عرضُها
 * نصفُ شاشة.**
 *
 * ## والمنشورُ يُقرأ من محاولاته لا من عموده
 *
 * ليس في `posts` عمودُ `published_at` ولا `permalink`. وهذا ليس نقصا:
 * `publish_attempts` يكتب كلَّ محاولةٍ بوقتها وجوابها ومعرّف المنشور عند
 * المنصّة (D-004) — **فهو الأصل، وعمودٌ ثانٍ في `posts` نسخةٌ تفترق عنه
 * عند أوّل إعادة محاولة.**
 *
 * فيُقرأ الوقتُ والرابطُ من آخر محاولةٍ ناجحة، ويُقرأ سببُ الفشل من آخر
 * محاولةٍ فاشلة — والاثنان قد يجتمعان على منشورٍ واحد، وهذا ما وقع فعلا.
 */
import type { Db } from '../tokens'
import type { Platform } from '../oauth/providers'

export interface PlatformPost {
  readonly id: string
  readonly text: string
  readonly status: string
  readonly scheduledAt: string | null
  readonly createdAt: string
  readonly accountName: string | null
  /** معرّفُ المنشور عند المنصّة — منه يُبنى الرابط. */
  readonly platformPostId: string | null
  readonly publishedAt: string | null
  /** آخرُ فشلٍ إن كان — نصّا مختصرا لا جسمَ جوابٍ كاملا. */
  readonly lastError: string | null
  readonly hasMedia: boolean
  readonly costUsd: number
}

interface PostRow {
  id: string
  text: string
  status: string
  scheduled_at: string | null
  created_at: string
  account_name: string | null
  platform_post_id: string | null
  published_at: string | null
  last_error: string | null
  media_json: string
  cost_usd: number
}

/**
 * رابطُ المنشور عند المنصّة.
 *
 * ويُبنى من المعرّف لا يُخزَّن: صيغةُ الرابط تتبدّل عند صاحبها — و X
 * نقل نطاقَه من `twitter.com` إلى `x.com` — **ورابطٌ محفوظٌ في صفٍّ من
 * سنةٍ يبقى على النطاق القديم**، فيُفتَح على تحويلةٍ أو على لا شيء.
 *
 * ويعيد `null` حين لا يُعرف الشكل: رابطٌ مبنيٌّ على تخمينٍ يفتح صفحةَ
 * خطأ، **وغيابُه أصدق من كسره**.
 */
export function permalink(platform: Platform, platformPostId: string | null): string | null {
  if (platformPostId === null || platformPostId.trim().length === 0) return null
  const id = platformPostId.trim()

  if (platform === 'linkedin') {
    // LinkedIn يعيد URN لا رقما: urn:li:share:123 أو urn:li:ugcPost:123
    if (!id.startsWith('urn:li:')) return null
    return `https://www.linkedin.com/feed/update/${encodeURIComponent(id)}/`
  }

  // و X يعيد رقما محضا. والمسارُ `i/web/status` يعمل بلا معرفة المُعرّف
  if (!/^[0-9]+$/.test(id)) return null
  return `https://x.com/i/web/status/${id}`
}

/** نصٌّ مختصرٌ من جواب المنصّة — لا جسمَ جوابٍ كامل في شاشة. */
function briefError(raw: string | null): string | null {
  if (raw === null) return null
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    for (const key of ['detail', 'message', 'error_description', 'error', 'title']) {
      const value = parsed[key]
      if (typeof value === 'string' && value.length > 0) return value.slice(0, 240)
    }
  } catch {
    // ليس JSON: يُؤخذ أوّلُه كما هو
  }
  return raw.slice(0, 240)
}

/**
 * منشوراتُ منصّةٍ واحدة — بكلّ حالاتها لا المنشورةَ وحدها.
 *
 * والفاشلةُ تُعرض مع الناجحة، ولا تُخفى في تبويبٍ ثانٍ: **فشلٌ لا يُرى
 * لا يُعالَج**، ومنشورٌ خرج من الطابور صامتا هو أسوأُ ما يقع في نظامٍ
 * يُفترض أنّه ينشر عنك.
 */
export async function platformPosts(
  db: Db,
  platform: Platform,
  limit = 60,
): Promise<PlatformPost[]> {
  try {
    const { results } = await db
      .prepare(
        `SELECT p.id, p.text, p.status, p.scheduled_at, p.created_at,
                p.media_json, p.cost_usd,
                a.display_name AS account_name,
                (SELECT pa.platform_post_id FROM publish_attempts pa
                  WHERE pa.post_id = p.id AND pa.status = 'succeeded'
                  ORDER BY pa.at DESC LIMIT 1) AS platform_post_id,
                (SELECT pa.at FROM publish_attempts pa
                  WHERE pa.post_id = p.id AND pa.status = 'succeeded'
                  ORDER BY pa.at DESC LIMIT 1) AS published_at,
                (SELECT pa.response_json FROM publish_attempts pa
                  WHERE pa.post_id = p.id AND pa.status = 'failed'
                  ORDER BY pa.at DESC LIMIT 1) AS last_error
           FROM posts p
           LEFT JOIN accounts a ON a.id = p.account_id
          WHERE p.platform = ?
          ORDER BY coalesce(p.scheduled_at, p.created_at) DESC
          LIMIT ?`,
      )
      .bind(platform, limit)
      .all<PostRow>()

    return results.map((row) => ({
      id: row.id,
      text: row.text,
      status: row.status,
      scheduledAt: row.scheduled_at,
      createdAt: row.created_at,
      accountName: row.account_name,
      platformPostId: row.platform_post_id,
      publishedAt: row.published_at,
      lastError: briefError(row.last_error),
      hasMedia: row.media_json !== '[]' && row.media_json.trim().length > 2,
      costUsd: row.cost_usd,
    }))
  } catch {
    // جدولٌ لا يُقرأ لا يُسقط الشاشة: تُعرض فارغةً وتبقى بقيّتُها
    return []
  }
}

export interface PlatformTally {
  readonly published: number
  readonly queued: number
  readonly failed: number
  readonly drafts: number
  /** ما أُنفق على كتابة منشورات هذه المنصّة — من الصفوف لا من الدفتر. */
  readonly spend: number
  readonly lastPublishedAt: string | null
}

/**
 * الحصادُ — يُحسَب في SQL لا في الذاكرة.
 *
 * فالشاشةُ تعرض ستّين منشورا وتعدّ **كلَّ** ما مضى: عدٌّ من الصفحة
 * المعروضة يقول «نُشر ثلاثة» وقد نُشرت مئة.
 */
export async function platformTally(db: Db, platform: Platform): Promise<PlatformTally> {
  const empty: PlatformTally = {
    published: 0, queued: 0, failed: 0, drafts: 0, spend: 0, lastPublishedAt: null,
  }
  try {
    const row = await db
      .prepare(
        `SELECT
           sum(CASE WHEN status = 'published' THEN 1 ELSE 0 END) AS published,
           sum(CASE WHEN status = 'queued'    THEN 1 ELSE 0 END) AS queued,
           sum(CASE WHEN status = 'failed'    THEN 1 ELSE 0 END) AS failed,
           sum(CASE WHEN status IN ('draft','approved','edited') THEN 1 ELSE 0 END) AS drafts,
           coalesce(sum(cost_usd), 0) AS spend,
           (SELECT max(pa.at) FROM publish_attempts pa
              JOIN posts p2 ON p2.id = pa.post_id
             WHERE p2.platform = ? AND pa.status = 'succeeded') AS last_published_at
         FROM posts WHERE platform = ?`,
      )
      .bind(platform, platform)
      .first<{
        published: number | null
        queued: number | null
        failed: number | null
        drafts: number | null
        spend: number | null
        last_published_at: string | null
      }>()
    if (row === null) return empty
    return {
      published: row.published ?? 0,
      queued: row.queued ?? 0,
      failed: row.failed ?? 0,
      drafts: row.drafts ?? 0,
      spend: row.spend ?? 0,
      lastPublishedAt: row.last_published_at,
    }
  } catch {
    return empty
  }
}

/**
 * نطاقاتُ كلِّ حسابٍ كما مُنحت — من `tokens.scopes` لا من طلبنا.
 *
 * ولا يُفَكّ رمزٌ هنا ولا يُقرأ: العمودُ `scopes` نصٌّ صريحٌ بجانب
 * المشفَّرَين، **وقراءتُه لا تحتاج مفتاحَ التشفير** — فشاشةٌ تعرض
 * القدرات لا تُعطى ما تُعطاه دالّةُ النشر.
 */
export async function grantedScopes(
  db: Db,
  platform: Platform,
): Promise<Record<string, string>> {
  try {
    const { results } = await db
      .prepare(
        `SELECT t.account_id AS id, t.scopes AS scopes
           FROM tokens t JOIN accounts a ON a.id = t.account_id
          WHERE a.platform = ?`,
      )
      .bind(platform)
      .all<{ id: string; scopes: string }>()
    return Object.fromEntries(results.map((r) => [r.id, r.scopes ?? '']))
  } catch {
    return {}
  }
}

/** سجلُّ صحّة حسابٍ واحد — من `accounts` و`tokens` و`token_alerts` (D-129). */
export interface AccountHealth {
  readonly status: string
  readonly expiresAt: string | null
  readonly refreshExpiresAt: string | null
  /** آخرُ تجديدٍ ناجح — و`null` لحسابٍ لم يُجدَّد قطّ. */
  readonly refreshedAt: string | null
  /** متى سقط الإذن — و`null` لحسابٍ قائم (D-131). */
  readonly needsReauthAt: string | null
  /** ما سُجّل من اقترابٍ أو انتهاء — الأحدثُ أوّلا. */
  readonly alerts: readonly { readonly kind: 'access' | 'refresh'; readonly threshold: number; readonly at: string }[]
}

/**
 * سجلُّ صحّة حسابات منصّةٍ — **استعلامان لا واحد**، كما في الرحلة (D-104):
 * وصلُ التنبيهات بالرموز يضرب الصفوفَ بعضَها في بعض.
 */
export async function accountHealth(
  db: Db,
  platform: Platform,
): Promise<Record<string, AccountHealth>> {
  try {
    const { results: rows } = await db
      .prepare(
        `SELECT a.id, a.status, a.needs_reauth_at, t.expires_at, t.refresh_expires_at, t.refreshed_at
           FROM accounts a
           LEFT JOIN tokens t ON t.account_id = a.id
          WHERE a.platform = ?`,
      )
      .bind(platform)
      .all<{ id: string; status: string; needs_reauth_at: string | null; expires_at: string | null; refresh_expires_at: string | null; refreshed_at: string | null }>()
    const out: Record<string, AccountHealth> = {}
    for (const r of rows) {
      out[r.id] = {
        status: r.status, expiresAt: r.expires_at ?? null, refreshExpiresAt: r.refresh_expires_at ?? null,
        refreshedAt: r.refreshed_at ?? null, needsReauthAt: r.needs_reauth_at ?? null, alerts: [],
      }
    }
    if (rows.length === 0) return out
    const { results: alerts } = await db
      .prepare(
        `SELECT al.account_id, al.kind, al.threshold, al.at
           FROM token_alerts al JOIN accounts a ON a.id = al.account_id
          WHERE a.platform = ?
          ORDER BY al.at DESC
          LIMIT 40`,
      )
      .bind(platform)
      .all<{ account_id: string; kind: 'access' | 'refresh'; threshold: number; at: string }>()
    for (const al of alerts) {
      const h = out[al.account_id]
      if (h === undefined) continue
      out[al.account_id] = { ...h, alerts: [...h.alerts, { kind: al.kind, threshold: al.threshold, at: al.at }] }
    }
    return out
  } catch {
    return {}
  }
}


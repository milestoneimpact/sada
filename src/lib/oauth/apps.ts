/**
 * أسرارُ تطبيقَي LinkedIn و X — خزانةٌ في القاعدة، وسرُّ Worker فوقها.
 *
 * ## لماذا صار يُقبل حفظُها هنا
 *
 * كانت في بيئة Worker وحدها، فضبطُها يوجب لوحةَ Cloudflare. وهذا حاجزٌ
 * بلا مقابل أمنيّ: **رمزُ الوصول الذي يُنشَر به محفوظٌ في هذه القاعدة
 * مشفَّرا منذ D-005**، وهو أخطرُ من سرّ التطبيق لا أدنى — بسرّ التطبيق
 * وحده لا يُنشر حرف، وبرمز الوصول يُنشر كلُّ شيء.
 *
 * فالحاجزُ كان يحمي الأضعف ويترك الأقوى، ويؤخّر المالكَ بلا سبب.
 *
 * ## وسرُّ Worker يغلب دائما (D-030)
 *
 * الأضعفُ لا يعلو على الأقوى. وما في البيئة يُقرأ أوّلا، **واللوحةُ تقول
 * إنّه الغالب** بدل أن تتظاهر بأنّ ما فيها هو المستعمَل.
 *
 * ## وسياقُ التشفير لكلّ منصّة
 *
 * `oauth:linkedin:secret` ليس `oauth:x:secret`. فنصٌّ مشفَّرٌ يُنقَل بين
 * الصفّين لا يُفكّ — وهو ما تعنيه AAD في AES-GCM.
 */
import { importKey, open, seal, toBase64 } from '../crypto'
import type { Db } from '../tokens'
import type { Platform } from './providers'

export function secretContext(platform: Platform): string {
  return `oauth:${platform}:secret`
}

/** أوّلُه وآخرُه. والقصيرُ يُقنَّع كلُّه: لا يبقى منه ما يُعرض بأمان. */
export function mask(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length < 12) return '•'.repeat(Math.max(4, trimmed.length))
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`
}

export async function fingerprint(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value.trim()))
  return toBase64(new Uint8Array(bytes)).slice(0, 12)
}

export type AppSource = 'worker_secret' | 'vault' | 'none'

export interface AppCredentials {
  readonly clientId: string
  readonly clientSecret: string
  readonly source: AppSource
}

/** أسماءُ السرّين في البيئة — اسمان لا قيمتان. */
export const SECRET_NAMES: Readonly<Record<Platform, readonly [string, string]>> = {
  linkedin: ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'],
  x: ['X_CLIENT_ID', 'X_CLIENT_SECRET'],
  youtube: ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET'],
  tiktok: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET'],
}

function fromEnv(
  env: Readonly<Record<string, string | undefined>>,
  platform: Platform,
): AppCredentials | null {
  const [idName, secretName] = SECRET_NAMES[platform]
  const id = env[idName]
  const secret = env[secretName]
  if (typeof id !== 'string' || id.trim() === '') return null
  if (typeof secret !== 'string' || secret.trim() === '') return null
  return { clientId: id.trim(), clientSecret: secret.trim(), source: 'worker_secret' }
}

/** **البيئةُ أوّلا ودائما**، ثمّ الخزانة. */
export async function readApp(
  db: Db,
  encKey: string,
  platform: Platform,
  env: Readonly<Record<string, string | undefined>>,
): Promise<AppCredentials | null> {
  const inEnv = fromEnv(env, platform)
  if (inEnv !== null) return inEnv

  let row: { client_id: string; secret_enc: string; secret_iv: string } | null
  try {
    row = await db
      .prepare('SELECT client_id, secret_enc, secret_iv FROM oauth_apps WHERE platform = ?')
      .bind(platform)
      .first<{ client_id: string; secret_enc: string; secret_iv: string }>()
  } catch {
    return null
  }
  if (row === null) return null

  try {
    const key = await importKey(encKey)
    const secret = await open(
      key,
      { ciphertext: row.secret_enc, iv: row.secret_iv },
      secretContext(platform),
    )
    return { clientId: row.client_id, clientSecret: secret, source: 'vault' }
  } catch {
    // مفتاحُ تشفيرٍ بُدّل، أو صفٌّ تالف. ولا يُعدّ مضبوطا ما لا يُفكّ
    return null
  }
}

export interface AppStatus {
  readonly platform: Platform
  readonly source: AppSource
  /** معرّفُ التطبيق — علنيٌّ يُعرض كاملا. */
  readonly clientId: string | null
  /** قناعُ السرّ — ولا يُعرض السرُّ كاملا في أيّ حال. */
  readonly hint: string | null
  readonly updatedAt: string | null
  readonly updatedBy: string | null
  /** أسماءُ السرّين في البيئة — للإرشاد لا للقيم. */
  readonly secretNames: readonly [string, string]
}

/** حالُ التطبيقين للعرض — بلا فكّ تشفيرٍ ولا كشفِ قيمة. */
export async function appStatuses(
  db: Db,
  env: Readonly<Record<string, string | undefined>>,
  platforms: readonly Platform[] = ['linkedin', 'x'],
): Promise<AppStatus[]> {
  let rows: Record<string, string>[] = []
  try {
    const result = await db
      .prepare('SELECT platform, client_id, hint, updated_at, updated_by FROM oauth_apps')
      .all<Record<string, string>>()
    rows = result.results
  } catch {
    rows = []
  }
  const saved = new Map(rows.map((r) => [String(r['platform']), r]))

  return platforms.map((platform) => {
    const names = SECRET_NAMES[platform]
    const inEnv = fromEnv(env, platform)
    const row = saved.get(platform)
    if (inEnv !== null) {
      // السرُّ في البيئة: لا قناعَ له ولا يُقرأ منه شيء
      return {
        platform,
        source: 'worker_secret' as const,
        clientId: inEnv.clientId,
        hint: null,
        updatedAt: null,
        updatedBy: null,
        secretNames: names,
      }
    }
    if (row === undefined) {
      return {
        platform,
        source: 'none' as const,
        clientId: null,
        hint: null,
        updatedAt: null,
        updatedBy: null,
        secretNames: names,
      }
    }
    return {
      platform,
      source: 'vault' as const,
      clientId: String(row['client_id']),
      hint: String(row['hint']),
      updatedAt: String(row['updated_at']),
      updatedBy: String(row['updated_by']),
      secretNames: names,
    }
  })
}

export interface SaveResult {
  readonly hint: string
  readonly unchanged: boolean
}

/**
 * حفظُ التطبيق.
 *
 * ولا يُسجَّل السرُّ في سجلٍّ ولا يُعاد في ردّ: يُعاد قناعُه وحده.
 * والبصمةُ تجيب «أهو نفسه؟» بلا فكّ تشفير — فبديلٌ بالقيمة نفسها يُقال
 * إنّه لم يتغيّر، ولا يُوهَم المالك بأنّه بدّل شيئا.
 */
export async function saveApp(
  db: Db,
  encKey: string,
  platform: Platform,
  clientId: string,
  clientSecret: string,
  by: string,
): Promise<SaveResult> {
  const id = clientId.trim()
  const secret = clientSecret.trim()
  if (id.length === 0) throw new Error('معرّفُ التطبيق فارغ')
  if (secret.length === 0) throw new Error('سرُّ التطبيق فارغ')

  const before = await db
    .prepare('SELECT fingerprint FROM oauth_apps WHERE platform = ?')
    .bind(platform)
    .first<{ fingerprint: string }>()

  const print = await fingerprint(secret)
  const hint = mask(secret)
  const sealed = await seal(await importKey(encKey), secret, secretContext(platform))

  await db
    .prepare(
      `INSERT INTO oauth_apps (platform, client_id, secret_enc, secret_iv, hint, fingerprint, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(platform) DO UPDATE SET
         client_id = excluded.client_id, secret_enc = excluded.secret_enc,
         secret_iv = excluded.secret_iv, hint = excluded.hint,
         fingerprint = excluded.fingerprint, updated_by = excluded.updated_by,
         updated_at = datetime('now')`,
    )
    .bind(platform, id, sealed.ciphertext, sealed.iv, hint, print, by)
    .run()

  return { hint, unchanged: before?.fingerprint === print }
}

/** حذفُ التطبيق من الخزانة — ولا يمسّ ما في البيئة. */
export async function deleteApp(db: Db, platform: Platform): Promise<boolean> {
  const row = await db
    .prepare('SELECT platform FROM oauth_apps WHERE platform = ?')
    .bind(platform)
    .first<{ platform: string }>()
  if (row === null) return false
  await db.prepare('DELETE FROM oauth_apps WHERE platform = ?').bind(platform).run()
  return true
}

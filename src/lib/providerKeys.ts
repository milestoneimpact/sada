/**
 * خزانة مفاتيح المزوّدين.
 *
 * **القاعدة الحاكمة: أسرار Worker تغلب الخزانة دائما.** فالمفتاح
 * الأساسيّ يبقى حيث لا تقرؤه شيفرتنا ولا تعيده Cloudflare، والخزانة
 * للتجريب والتبديل السريع من اللوحة.
 *
 * ولو كان العكس — الخزانة تغلب — لصار خللٌ في اللوحة قادرا على تبديل
 * مفتاح الإنتاج. والأضعف لا يعلو على الأقوى.
 *
 * والمفتاح لا يُخزَّن مقروءا في أيّ عمود: مشفَّر بربطٍ سياقيّ، ومعه
 * تلميحٌ (أوّله وآخره) وبصمة. ولا يُعاد كاملا في أيّ ردّ أبدا.
 */
import { importKey, open, seal, toBase64, type Sealed } from './crypto'
import type { Db } from './tokens'

export type KeySource = 'worker_secret' | 'vault' | 'none'

export interface KeyRecord {
  readonly provider: string
  readonly hint: string
  readonly fingerprint: string
  readonly enabled: boolean
  readonly dailyCap: number | null
  readonly updatedAt: string
  readonly updatedBy: string | null
  readonly verifiedAt: string | null
}

/** سياقٌ موحَّد — يُكتب هنا لا في موضعين فيختلف. */
export function keyContext(provider: string): string {
  return `provider:${provider}:key`
}

/**
 * تلميحٌ يُعرض بدل المفتاح.
 *
 * سبعةٌ من أوّله وأربعةٌ من آخره. والأوّل يميّز المزوّد (`sk-ant-` ·
 * `AIzaSy`)، والآخر يميّز نسخةً من أخرى. **ومفتاحٌ أقصر من ستّة عشر
 * محرفا يُقنَّع كلّه** — قصيرٌ لا يبقى منه ما يُعرض بأمان.
 */
export function maskKey(key: string): string {
  const trimmed = key.trim()
  if (trimmed.length < 16) return '•'.repeat(Math.max(4, trimmed.length))
  return `${trimmed.slice(0, 7)}…${trimmed.slice(-4)}`
}

/** بصمةٌ مقتطعة: تُقارَن نسختان بلا كشف أيّهما. */
export async function fingerprint(key: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key.trim()))
  return toBase64(new Uint8Array(bytes)).slice(0, 12)
}

export interface SaveResult {
  readonly hint: string
  readonly fingerprint: string
  /** أكان في الخزانة مفتاحٌ بالبصمة نفسها؟ فلا حاجة لإعادة الاختبار. */
  readonly unchanged: boolean
}

export async function saveKey(
  db: Db,
  encKey: string,
  provider: string,
  rawKey: string,
  updatedBy: string,
): Promise<SaveResult> {
  const value = rawKey.trim()
  if (value.length === 0) throw new Error('المفتاح فارغ')

  const previous = await readRecord(db, provider)
  const print = await fingerprint(value)
  const hint = maskKey(value)

  const key = await importKey(encKey)
  const sealed = await seal(key, value, keyContext(provider))

  await db
    .prepare(
      `INSERT INTO provider_keys
         (provider, key_enc, key_iv, hint, fingerprint, enabled, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, datetime('now'))
       ON CONFLICT(provider) DO UPDATE SET
         key_enc = excluded.key_enc,
         key_iv = excluded.key_iv,
         hint = excluded.hint,
         fingerprint = excluded.fingerprint,
         updated_by = excluded.updated_by,
         updated_at = datetime('now'),
         -- مفتاحٌ جديد لم يُختبر بعد: التحقّق السابق لا يشهد له
         verified_at = CASE WHEN provider_keys.fingerprint = excluded.fingerprint
                            THEN provider_keys.verified_at ELSE NULL END`,
    )
    .bind(provider, sealed.ciphertext, sealed.iv, hint, print, updatedBy)
    .run()

  return { hint, fingerprint: print, unchanged: previous?.fingerprint === print }
}

export async function readRecord(db: Db, provider: string): Promise<KeyRecord | null> {
  try {
    const row = await db
      .prepare(
        `SELECT provider, hint, fingerprint, enabled, daily_cap, updated_at, updated_by, verified_at
           FROM provider_keys WHERE provider = ?`,
      )
      .bind(provider)
      .first<{
        provider: string
        hint: string
        fingerprint: string
        enabled: number
        daily_cap: number | null
        updated_at: string
        updated_by: string | null
        verified_at: string | null
      }>()
    if (row === null) return null
    return {
      provider: row.provider,
      hint: row.hint,
      fingerprint: row.fingerprint,
      enabled: row.enabled === 1,
      dailyCap: row.daily_cap,
      updatedAt: row.updated_at,
      updatedBy: row.updated_by,
      verifiedAt: row.verified_at,
    }
  } catch {
    // جدولٌ غير موجود (ترحيل لم يُطبَّق): لا مفتاح — لا عطل
    return null
  }
}

export async function listRecords(db: Db): Promise<KeyRecord[]> {
  try {
    const { results } = await db
      .prepare(
        `SELECT provider, hint, fingerprint, enabled, daily_cap, updated_at, updated_by, verified_at
           FROM provider_keys`,
      )
      .all<{
        provider: string
        hint: string
        fingerprint: string
        enabled: number
        daily_cap: number | null
        updated_at: string
        updated_by: string | null
        verified_at: string | null
      }>()
    return results.map((row) => ({
      provider: row.provider,
      hint: row.hint,
      fingerprint: row.fingerprint,
      enabled: row.enabled === 1,
      dailyCap: row.daily_cap,
      updatedAt: row.updated_at,
      updatedBy: row.updated_by,
      verifiedAt: row.verified_at,
    }))
  } catch {
    return []
  }
}

export interface ResolvedKey {
  readonly key: string | null
  readonly source: KeySource
}

/**
 * يحلّ المفتاح المستعمَل فعلا.
 *
 * **سرّ Worker أوّلا ودائما.** ثمّ الخزانة، وبشرط أن يكون مفعَّلا:
 * تعطيلٌ في اللوحة يعني تعطيلا، لا مجرّد علامةٍ في شاشة.
 *
 * وفشلُ فكّ التشفير **لا يُبتلَع صامتا ولا يرمي**: يُعاد `none`، فيقول
 * النظام «لا مفتاح» بدل أن ينهار — والسبب يظهر في اللوحة بأنّه غير
 * مُتحقَّق منه.
 */
export async function resolveKey(
  db: Db,
  encKey: string,
  provider: string,
  workerSecret: string | undefined,
): Promise<ResolvedKey> {
  if (typeof workerSecret === 'string' && workerSecret.trim().length > 0) {
    return { key: workerSecret.trim(), source: 'worker_secret' }
  }

  let row: { key_enc: string; key_iv: string; enabled: number } | null
  try {
    row = await db
      .prepare('SELECT key_enc, key_iv, enabled FROM provider_keys WHERE provider = ?')
      .bind(provider)
      .first<{ key_enc: string; key_iv: string; enabled: number }>()
  } catch {
    return { key: null, source: 'none' }
  }
  if (row === null || row.enabled !== 1) return { key: null, source: 'none' }

  try {
    const key = await importKey(encKey)
    const sealed: Sealed = { ciphertext: row.key_enc, iv: row.key_iv }
    return { key: await open(key, sealed, keyContext(provider)), source: 'vault' }
  } catch {
    return { key: null, source: 'none' }
  }
}

export async function setEnabled(db: Db, provider: string, enabled: boolean, by: string): Promise<void> {
  await db
    .prepare(
      `UPDATE provider_keys SET enabled = ?, updated_by = ?, updated_at = datetime('now')
        WHERE provider = ?`,
    )
    .bind(enabled ? 1 : 0, by, provider)
    .run()
}

/** سقفٌ خاصّ بمزوّد. `null` يزيله فيعود إلى السقف العامّ. */
export async function setDailyCap(db: Db, provider: string, cap: number | null, by: string): Promise<void> {
  const value = cap === null ? null : Math.min(Math.max(cap, 0), 100)
  await db
    .prepare(
      `UPDATE provider_keys SET daily_cap = ?, updated_by = ?, updated_at = datetime('now')
        WHERE provider = ?`,
    )
    .bind(value, by, provider)
    .run()
}

export async function markVerified(db: Db, provider: string): Promise<void> {
  await db
    .prepare("UPDATE provider_keys SET verified_at = datetime('now') WHERE provider = ?")
    .bind(provider)
    .run()
}

export async function deleteKey(db: Db, provider: string): Promise<void> {
  await db.prepare('DELETE FROM provider_keys WHERE provider = ?').bind(provider).run()
}

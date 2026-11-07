/**
 * مستودع المزوّدين.
 *
 * يحلّ محلّ خزانة `provider_keys`: صار الصفّ يحمل **كلّ ما يلزم لنداء
 * مزوّدٍ لم نسمع به** — لهجتُه وعنوانُه ونموذجُه وسعرُه ومفتاحُه. فمزوّدٌ
 * يظهر بعد سنة يُضاف من اللوحة بلا نشرٍ ولا شيفرة.
 *
 * **وسرّ Worker يغلب المفتاح المحفوظ دائما** (D-030): الأضعف لا يعلو
 * على الأقوى. والمدمَجون (`builtin`) لا يُحذفون ولا تُبدَّل لهجتُهم.
 */
import { LEGACY_RAW, openScoped, sealScoped, toBase64 } from './crypto'
import type { Db } from './tokens'
import { OWNER_ORG } from './tenancy'

export type ProviderKind = 'anthropic' | 'openai_compat'

export interface Provider {
  readonly name: string
  readonly label: string
  readonly kind: ProviderKind
  readonly baseUrl: string | null
  readonly model: string | null
  readonly hint: string | null
  readonly fingerprint: string | null
  readonly enabled: boolean
  readonly dailyCap: number | null
  readonly priceIn: number | null
  readonly priceOut: number | null
  readonly builtin: boolean
  readonly verifiedAt: string | null
  readonly updatedAt: string | null
  readonly updatedBy: string | null
}

/** نطاقُ خزانة المزوّدين (D-318): مفتاحٌ مشتقٌّ باسمه، والقديمُ بالخام يُقرأ كما هو. */
export const VAULT_SCOPE = 'vault:providers'

export function keyContext(provider: string): string {
  return `provider:${provider}:key`
}

/** أوّلُه وآخرُه. والقصير يُقنَّع كلّه: لا يبقى منه ما يُعرض بأمان. */
export function maskKey(key: string): string {
  const trimmed = key.trim()
  if (trimmed.length < 16) return '•'.repeat(Math.max(4, trimmed.length))
  return `${trimmed.slice(0, 7)}…${trimmed.slice(-4)}`
}

export async function fingerprint(key: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key.trim()))
  return toBase64(new Uint8Array(bytes)).slice(0, 12)
}

/**
 * اسمٌ صالح: حروفٌ لاتينيّة صغيرة وأرقامٌ وشرطة.
 *
 * يُستعمل مفتاحا أوّليّا وسياقَ تشفيرٍ وقيمةً في `cost_ledger`، فاسمٌ فيه
 * محارف غريبة يُفسد الثلاثة. والتقييد هنا أرخص من مطاردته لاحقا.
 */
export function normalizeName(raw: string): string | null {
  const slug = raw.trim().toLowerCase().replace(/[\s_]+/g, '-')
  return /^[a-z][a-z0-9-]{1,30}$/.test(slug) ? slug : null
}

interface Row {
  name: string
  label: string
  kind: string
  base_url: string | null
  model: string | null
  hint: string | null
  fingerprint: string | null
  enabled: number
  daily_cap: number | null
  price_in: number | null
  price_out: number | null
  builtin: number
  verified_at: string | null
  updated_at: string | null
  updated_by: string | null
}

const COLUMNS = `name, label, kind, base_url, model, hint, fingerprint, enabled,
                 daily_cap, price_in, price_out, builtin, verified_at, updated_at, updated_by`

function toProvider(row: Row): Provider {
  return {
    name: row.name,
    label: row.label,
    kind: row.kind === 'anthropic' ? 'anthropic' : 'openai_compat',
    baseUrl: row.base_url,
    model: row.model,
    hint: row.hint,
    fingerprint: row.fingerprint,
    enabled: row.enabled === 1,
    dailyCap: row.daily_cap,
    priceIn: row.price_in,
    priceOut: row.price_out,
    builtin: row.builtin === 1,
    verifiedAt: row.verified_at,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  }
}

export async function listProviders(db: Db): Promise<Provider[]> {
  try {
    // إعدادٌ عامّ: يسكن منظّمةَ المالك (D-277)
    const { results } = await db
      .prepare(`SELECT ${COLUMNS} FROM providers WHERE org_id = ? ORDER BY builtin DESC, name`)
      .bind(OWNER_ORG)
      .all<Row>()
    return results.map(toProvider)
  } catch {
    // ترحيلٌ لم يُطبَّق: لا مزوّدين محفوظين — لا عطل
    return []
  }
}

export async function getProvider(db: Db, name: string): Promise<Provider | null> {
  try {
    // إعدادٌ عامّ: يسكن منظّمةَ المالك (D-277)
    const row = await db
      .prepare(`SELECT ${COLUMNS} FROM providers WHERE name = ? AND org_id = ?`)
      .bind(name, OWNER_ORG)
      .first<Row>()
    return row === null ? null : toProvider(row)
  } catch {
    return null
  }
}

export interface UpsertInput {
  readonly name: string
  readonly label: string
  readonly kind: ProviderKind
  readonly baseUrl?: string | null
  readonly model?: string | null
  readonly priceIn?: number | null
  readonly priceOut?: number | null
  readonly dailyCap?: number | null
}

/** يضيف مزوّدا أو يعدّل بياناته. لا يمسّ المفتاح — لذاك `saveKey`. */
export async function upsertProvider(db: Db, input: UpsertInput, by: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO providers (name, label, kind, base_url, model, price_in, price_out, daily_cap, updated_by, updated_at, org_id)
       -- إعدادٌ عامّ: يسكن منظّمةَ المالك
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
       ON CONFLICT(name) DO UPDATE SET
         label = excluded.label,
         -- اللهجة والعنوان لا يُبدَّلان لمدمَج: عناوينه في الشيفرة
         kind = CASE WHEN providers.builtin = 1 THEN providers.kind ELSE excluded.kind END,
         base_url = CASE WHEN providers.builtin = 1 THEN providers.base_url ELSE excluded.base_url END,
         model = excluded.model,
         price_in = excluded.price_in,
         price_out = excluded.price_out,
         daily_cap = excluded.daily_cap,
         updated_by = excluded.updated_by,
         updated_at = datetime('now')`,
    )
    .bind(
      input.name,
      input.label,
      input.kind,
      input.baseUrl ?? null,
      input.model ?? null,
      input.priceIn ?? null,
      input.priceOut ?? null,
      input.dailyCap ?? null,
      by,
      OWNER_ORG,
    )
    .run()
}

export interface SaveKeyResult {
  readonly hint: string
  readonly fingerprint: string
  readonly unchanged: boolean
}

export async function saveKey(
  db: Db,
  encKey: string,
  provider: string,
  rawKey: string,
  by: string,
): Promise<SaveKeyResult> {
  const value = rawKey.trim()
  if (value.length === 0) throw new Error('المفتاح فارغ')

  const before = await getProvider(db, provider)
  if (before === null) throw new Error('لا مزوّد بهذا الاسم')

  const print = await fingerprint(value)
  const hint = maskKey(value)
  const sealed = await sealScoped(encKey, VAULT_SCOPE, value, keyContext(provider))

  await db
    .prepare(
      `UPDATE providers SET
         key_enc = ?, key_iv = ?, hint = ?, fingerprint = ?,
         updated_by = ?, updated_at = datetime('now'),
         -- مفتاح جديد لم يُختبر: الشهادة السابقة لا تشهد له
         verified_at = CASE WHEN fingerprint = ? THEN verified_at ELSE NULL END
       -- إعدادٌ عامّ: يسكن منظّمةَ المالك
       WHERE name = ? AND org_id = ?`,
    )
    .bind(sealed.ciphertext, sealed.iv, hint, print, by, print, provider, OWNER_ORG)
    .run()

  return { hint, fingerprint: print, unchanged: before.fingerprint === print }
}

export type KeySource = 'worker_secret' | 'vault' | 'none'

export interface ResolvedKey {
  readonly key: string | null
  readonly source: KeySource
}

/** **سرّ Worker أوّلا ودائما.** ثمّ المحفوظ، وبشرط أن يكون مفعَّلا. */
export async function resolveKey(
  db: Db,
  encKey: string,
  provider: string,
  workerSecret: string | undefined,
): Promise<ResolvedKey> {
  if (typeof workerSecret === 'string' && workerSecret.trim().length > 0) {
    return { key: workerSecret.trim(), source: 'worker_secret' }
  }

  let row: { key_enc: string | null; key_iv: string | null; enabled: number } | null
  try {
    row = await db
      // إعدادٌ عامّ: يسكن منظّمةَ المالك (D-277)
      .prepare('SELECT key_enc, key_iv, enabled FROM providers WHERE name = ? AND org_id = ?')
      .bind(provider, OWNER_ORG)
      .first<{ key_enc: string | null; key_iv: string | null; enabled: number }>()
  } catch {
    return { key: null, source: 'none' }
  }
  if (row === null || row.enabled !== 1 || row.key_enc === null || row.key_iv === null) {
    return { key: null, source: 'none' }
  }

  try {
    return {
      key: await openScoped(encKey, VAULT_SCOPE, { ciphertext: row.key_enc, iv: row.key_iv }, keyContext(provider), LEGACY_RAW),
      source: 'vault',
    }
  } catch {
    return { key: null, source: 'none' }
  }
}

export async function setEnabled(db: Db, provider: string, enabled: boolean, by: string): Promise<void> {
  await db
    // إعدادٌ عامّ: يسكن منظّمةَ المالك (D-277)
    .prepare("UPDATE providers SET enabled = ?, updated_by = ?, updated_at = datetime('now') WHERE name = ? AND org_id = ?")
    .bind(enabled ? 1 : 0, by, provider, OWNER_ORG)
    .run()
}

export async function markVerified(db: Db, provider: string): Promise<void> {
  await db
    // إعدادٌ عامّ: يسكن منظّمةَ المالك (D-277)
    .prepare("UPDATE providers SET verified_at = datetime('now') WHERE name = ? AND org_id = ?")
    .bind(provider, OWNER_ORG)
    .run()
}

/** المدمَج لا يُحذف: عنوانه في الشيفرة، وحذفه يترك توجيها بلا هدف. */
export async function deleteProvider(db: Db, provider: string): Promise<boolean> {
  const existing = await getProvider(db, provider)
  if (existing === null || existing.builtin) return false
  // إعدادٌ عامّ: يسكن منظّمةَ المالك (D-277)
  await db.prepare('DELETE FROM providers WHERE name = ? AND org_id = ?').bind(provider, OWNER_ORG).run()
  return true
}

/**
 * كلفةُ نداء.
 *
 * **سعرٌ غير مضبوط يعطي صفرا ويُعلَّم** — ولا يُخمَّن رقمٌ يُظنّ حقيقة.
 * وصفرٌ معلومٌ أصدق من تقديرٍ مجهول المصدر.
 */
export function costOf(
  provider: Pick<Provider, 'priceIn' | 'priceOut'>,
  usage: { inputTokens: number; outputTokens: number },
): { total: number; priced: boolean } {
  if (provider.priceIn === null && provider.priceOut === null) {
    return { total: 0, priced: false }
  }
  const total =
    (usage.inputTokens * (provider.priceIn ?? 0)) / 1_000_000 +
    (usage.outputTokens * (provider.priceOut ?? 0)) / 1_000_000
  return { total, priced: true }
}

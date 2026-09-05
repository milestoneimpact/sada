/**
 * خزانةُ العامل الثاني: مفاتيحُ المرور، وسرُّ TOTP، ورموزُ الاسترداد.
 *
 * وثلاثُ قواعدَ تحكمها:
 *
 * ١ · **المفتاحُ العامّ لا يُشفَّر.** عامٌّ بطبعه، ونشرُه لا يضرّ؛ وتشفيرُه
 *     يوهم بسرّيّةٍ ليست فيه فيُتساهَل في غيره.
 * ٢ · **سرُّ TOTP يُشفَّر بربطٍ سياقيّ.** فمن نسخ الصفّ لم ينفعه، ومن
 *     نقله إلى صفٍّ آخر لم يُفكّ.
 * ٣ · **رموزُ الاسترداد تُهشَّم.** تُعرض مرّةً حين تُولَّد ثمّ لا تُقرأ من
 *     القاعدة أبدا — لا لنا ولا لمن سرق نسخةً منها.
 */
import { importKey, open, seal } from '../crypto'
import { randomBytes, toBase64Url } from './bytes'
import { digest, sameBytes } from './digest'
import type { Db } from '../tokens'

const TOTP_CONTEXT = 'totp:secret'

// ── مفاتيح المرور ────────────────────────────────────────────────────

export interface Passkey {
  readonly id: string
  readonly credentialId: string
  readonly publicKey: string
  readonly alg: number
  readonly signCount: number
  readonly label: string
  readonly createdAt: string
  readonly lastUsedAt: string | null
  readonly rpId: string
}

interface PasskeyRow {
  id: string
  credential_id: string
  public_key: string
  alg: number
  sign_count: number
  label: string
  created_at: string
  last_used_at: string | null
  rp_id: string
}

function toPasskey(row: PasskeyRow): Passkey {
  return {
    id: row.id,
    credentialId: row.credential_id,
    publicKey: row.public_key,
    alg: row.alg,
    signCount: row.sign_count,
    label: row.label,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    rpId: row.rp_id,
  }
}

/**
 * مفاتيحُ نطاقٍ بعينه.
 *
 * والترشيح بـ `rp_id` ليس تنظيما: مفتاحٌ سُجّل على `sada2` **لا يوقّع**
 * على `sada` أصلا، فعرضُه في لوحة الإنتاج يعِد بما لا يقع.
 */
export async function listPasskeys(db: Db, rpId: string): Promise<Passkey[]> {
  try {
    const { results } = await db
      .prepare('SELECT * FROM passkeys WHERE rp_id = ? ORDER BY created_at')
      .bind(rpId)
      .all<PasskeyRow>()
    return results.map(toPasskey)
  } catch {
    return []
  }
}

export async function findPasskey(db: Db, credentialId: string): Promise<Passkey | null> {
  const row = await db
    .prepare('SELECT * FROM passkeys WHERE credential_id = ?')
    .bind(credentialId)
    .first<PasskeyRow>()
  return row === null ? null : toPasskey(row)
}

export async function addPasskey(
  db: Db,
  key: {
    credentialId: string
    publicKey: string
    alg: number
    signCount: number
    label: string
    rpId: string
  },
): Promise<string> {
  const id = crypto.randomUUID()
  await db
    .prepare(
      `INSERT INTO passkeys
         (id, credential_id, public_key, alg, sign_count, label, rp_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, key.credentialId, key.publicKey, key.alg, key.signCount, key.label, key.rpId)
    .run()
  return id
}

/** يُقدّم العدّاد ويؤرّخ الاستعمال — والعدّادُ هو ما يكشف الاستنساخ. */
export async function touchPasskey(db: Db, id: string, signCount: number): Promise<void> {
  await db
    .prepare("UPDATE passkeys SET sign_count = ?, last_used_at = datetime('now') WHERE id = ?")
    .bind(signCount, id)
    .run()
}

export async function deletePasskey(db: Db, id: string): Promise<boolean> {
  const before = await db.prepare('SELECT id FROM passkeys WHERE id = ?').bind(id).first()
  if (before === null) return false
  await db.prepare('DELETE FROM passkeys WHERE id = ?').bind(id).run()
  return true
}

// ── TOTP ─────────────────────────────────────────────────────────────

export interface TotpState {
  readonly enrolled: boolean
  readonly confirmed: boolean
  readonly lastStep: bigint | null
}

interface TotpRow {
  secret_cipher: string
  secret_iv: string
  confirmed_at: string | null
  last_step: string | null
}

async function totpRow(db: Db): Promise<TotpRow | null> {
  try {
    return await db.prepare('SELECT * FROM totp WHERE id = 1').first<TotpRow>()
  } catch {
    return null
  }
}

export async function totpState(db: Db): Promise<TotpState> {
  const row = await totpRow(db)
  if (row === null) return { enrolled: false, confirmed: false, lastStep: null }
  return {
    enrolled: true,
    confirmed: row.confirmed_at !== null,
    lastStep: row.last_step === null ? null : BigInt(row.last_step),
  }
}

/**
 * يحفظ سرّا جديدا **غير مؤكَّد**.
 *
 * والتأكيدُ شرطٌ لا زينة: مالكٌ يمسح الرمز ثمّ يُغلق التبويب قبل أن يجرّبه
 * يكون قد أقفل على نفسه بابا لا يفتحه. فالسرُّ لا يُعتدّ به حتّى يُثبت
 * المالك أنّه في يده.
 */
export async function startTotp(db: Db, encKey: string, secret: string): Promise<void> {
  const key = await importKey(encKey)
  const sealed = await seal(key, secret, TOTP_CONTEXT)
  await db
    .prepare(
      `INSERT INTO totp (id, secret_cipher, secret_iv, confirmed_at, last_step)
       VALUES (1, ?, ?, NULL, NULL)
       ON CONFLICT(id) DO UPDATE SET
         secret_cipher = excluded.secret_cipher,
         secret_iv = excluded.secret_iv,
         confirmed_at = NULL,
         last_step = NULL`,
    )
    .bind(sealed.ciphertext, sealed.iv)
    .run()
}

/** يقرأ السرّ. يرجع `null` إن لم يوجد أو تعذّر فكّه. */
export async function readTotpSecret(db: Db, encKey: string): Promise<string | null> {
  const row = await totpRow(db)
  if (row === null) return null
  try {
    const key = await importKey(encKey)
    return await open(key, { ciphertext: row.secret_cipher, iv: row.secret_iv }, TOTP_CONTEXT)
  } catch {
    return null
  }
}

export async function confirmTotp(db: Db, step: bigint): Promise<void> {
  await db
    .prepare("UPDATE totp SET confirmed_at = datetime('now'), last_step = ? WHERE id = 1")
    .bind(String(step))
    .run()
}

/** يسجّل آخر خطوةٍ قُبلت — فرمزٌ استُعمل لا يُقبل ثانية. */
export async function markTotpStep(db: Db, step: bigint): Promise<void> {
  await db.prepare('UPDATE totp SET last_step = ? WHERE id = 1').bind(String(step)).run()
}

export async function removeTotp(db: Db): Promise<void> {
  await db.prepare('DELETE FROM totp WHERE id = 1').run()
}

// ── رموز الاسترداد ───────────────────────────────────────────────────

/**
 * رمزٌ من عشرة محارف بأربع مجموعات — يُقرأ ويُكتب على ورق.
 *
 * ولا يُستعمل `randomToken` الستّينيّ عشر: أربعةٌ وستّون محرفا لا تُنسَخ
 * من ورقةٍ بلا خطأ، ورمزٌ يُخطئ المالكُ في نسخه ليس رمزَ استرداد.
 */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function oneCode(): string {
  const bytes = randomBytes(10)
  const chars = Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]!)
  return `${chars.slice(0, 5).join('')}-${chars.slice(5).join('')}`
}

/** يُطبّع ما كتبه المالك: حالةُ الأحرف والشرطة والمسافات لا تُحاسَب. */
export function normalizeCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

async function hashCode(code: string): Promise<string> {
  return toBase64Url(await digest(`recovery:${normalizeCode(code)}`))
}

/**
 * يولّد مجموعةً جديدة ويستبدل القديمة كاملةً.
 *
 * والاستبدالُ كاملٌ عمدا: مجموعتان قائمتان تعنيان أنّ ورقةً ظنّ المالك
 * أنّه أبطلها ما تزال تفتح.
 */
export async function issueRecoveryCodes(db: Db, count = 8): Promise<string[]> {
  const codes = Array.from({ length: count }, () => oneCode())
  await db.prepare('DELETE FROM recovery_codes').run()
  for (const code of codes) {
    await db.prepare('INSERT INTO recovery_codes (hash) VALUES (?)').bind(await hashCode(code)).run()
  }
  return codes
}

export async function countRecoveryCodes(db: Db): Promise<{ total: number; unused: number }> {
  try {
    const row = await db
      .prepare(
        'SELECT COUNT(*) AS total, SUM(CASE WHEN used_at IS NULL THEN 1 ELSE 0 END) AS unused FROM recovery_codes',
      )
      .first<{ total: number; unused: number | null }>()
    return { total: row?.total ?? 0, unused: row?.unused ?? 0 }
  } catch {
    return { total: 0, unused: 0 }
  }
}

/**
 * يستهلك رمزَ استرداد.
 *
 * والمقارنةُ على التهشيم بمساواةٍ ثابتة الزمن، والاستهلاكُ **مشروطٌ في
 * جملة SQL نفسها** (`used_at IS NULL`): طلبان متزامنان بالرمز نفسه لا
 * ينجح منهما إلّا واحد — والقاعدةُ هي التي تفصل لا الشيفرة.
 */
export async function useRecoveryCode(db: Db, presented: string): Promise<boolean> {
  const normalized = normalizeCode(presented)
  if (normalized.length < 8) return false

  const target = await hashCode(normalized)
  const targetBytes = await digest(target)

  const { results } = await db
    .prepare('SELECT hash FROM recovery_codes WHERE used_at IS NULL')
    .all<{ hash: string }>()

  let match: string | null = null
  for (const row of results) {
    // تُفحص كلُّ الصفوف بلا خروجٍ مبكر: موضعُ الرمز في القائمة لا يُستدلّ
    // عليه من زمن الردّ
    if (sameBytes(await digest(row.hash), targetBytes)) match = row.hash
  }
  if (match === null) return false

  const result = await db
    .prepare("UPDATE recovery_codes SET used_at = datetime('now') WHERE hash = ? AND used_at IS NULL")
    .bind(match)
    .run()

  const changes = (result as { meta?: { changes?: number }; changes?: number }).meta?.changes ??
    (result as { changes?: number }).changes
  return changes === undefined ? true : changes > 0
}

// ── الحال المجمَّع ───────────────────────────────────────────────────

export interface FactorState {
  readonly passkeys: Passkey[]
  readonly totp: TotpState
  readonly recovery: { total: number; unused: number }
  /** أثمّة عاملٌ ثانٍ مفعَّل؟ وهو ما يقرّر أنّ الرمز وحده لا يكفي. */
  readonly enforced: boolean
}

/**
 * حالُ العوامل مجتمعةً.
 *
 * **وقاعدةٌ لا تُقرأ تُعيد «لا عامل ثانٍ» — وهذا انفتاحٌ مقصود، لا سهو.**
 *
 * والبديلُ إغلاقٌ عند العطل: قاعدةٌ تتعثّر دقيقةً تُقفل المالكَ خارج لوحته
 * وهو يريد إيقاف النظام. والانفتاحُ هنا لا يهبط إلى الصفر: `ADMIN_TOKEN`
 * ما يزال مطلوبا، فالحالُ تعود إلى ما كانت عليه قبل هذه الدفعة لا إلى
 * بابٍ مفتوح. وهي مقايضةٌ تُذكر لتُراجَع، لا تُخفى.
 */
export async function factorState(db: Db, rpId: string): Promise<FactorState> {
  const [passkeys, totp, recovery] = await Promise.all([
    listPasskeys(db, rpId),
    totpState(db),
    countRecoveryCodes(db),
  ])
  return {
    passkeys,
    totp,
    recovery,
    // **المؤكَّد وحده يُلزِم.** سرٌّ بدأ تسجيلُه ولم يُؤكَّد لو أُلزم به
    // لأقفل المالكَ خارج لوحته بسرٍّ لم يثبت أنّه في يده
    enforced: passkeys.length > 0 || totp.confirmed,
  }
}

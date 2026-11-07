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
 *
 * ## لكلّ حسابٍ عواملُه (D-317)
 *
 * كانت الخزانةُ للمالك الواحد: مفتاحُ مرورٍ بلا صاحب، فالدخولُ به جلسةُ مالكٍ أيًّا كان من سجّله. فصار كلُّ صفٍّ
 * لبريد (`email`)، **والغائبُ صفٌّ للمالك** كُتب قبل 0044. ورمزُ تطبيق المالك في `totp` كما كان، والمدعوّون في
 * `member_totp` بسياق تشفيرٍ يحمل البريد.
 *
 * ## وقاعدةٌ لا تُقرأ لا تقول «لا عامل» (D-317)
 *
 * كانت القراءةُ تبلع الخطأ فتعيد «لا مفاتيح» و«لا رمز»، فيُفتح لصاحب رمز البريد وحده جلسةٌ كاملة. فصارت تقرأ أو
 * ترمي: **من يقرّر الدخولَ يقرّر على جوابٍ لا على صمت**، والعرضُ وحده (صفحةُ الدخول) يلتقط الخطأ بنفسه.
 */
import { hmacKeyFor, keyId, keyring, LEGACY_RAW, openScoped, sealScoped } from '../crypto'
import { fromBase64Url, randomBytes, toBase64Url } from './bytes'
import { digest, sameBytes } from './digest'
import type { Db } from '../tokens'
import { changedRows } from '../dbResult'
import { isOwnerEmail, normalizeEmail, OWNER_EMAIL } from '../ownerEmail'

const TOTP_CONTEXT = 'totp:secret'
/** نطاقُ سرّ رمز التطبيق (D-318): مفتاحٌ مشتقٌّ باسمه، والقديمُ بالخام يُقرأ كما هو. */
export const TOTP_SCOPE = 'factors:totp'

/** بريدُ الحساب مطبَّعًا — والمالكُ ببريده الثابت (D-245). */
function who(email: string): string {
  return normalizeEmail(email)
}

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
  /** صاحبُ المفتاح (D-317) — والصفُّ القديمُ بلا صاحب للمالك. */
  readonly email: string
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
  email: string | null
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
    email: row.email === null ? OWNER_EMAIL : row.email,
  }
}

/**
 * مفاتيحُ نطاقٍ بعينه — ولصاحبٍ بعينه إن سُمّي.
 *
 * والترشيح بـ `rp_id` ليس تنظيما: مفتاحٌ سُجّل على `sada2` **لا يوقّع**
 * على `sada` أصلا، فعرضُه في لوحة الإنتاج يعِد بما لا يقع.
 *
 * **ويرمي إن لم تردّ القاعدة** (D-317): «لا مفاتيح» جوابٌ يُبنى عليه دخول، فلا يُقال عن صمت.
 * وبلا بريدٍ تُعاد مفاتيحُ النطاق كلُّها — لتحدّي الدخول وحده، حيث لا يُعرَف الطالبُ بعد.
 */
export async function listPasskeys(db: Db, rpId: string, email?: string): Promise<Passkey[]> {
  const { results } = email === undefined
    ? await db.prepare('SELECT * FROM passkeys WHERE rp_id = ? ORDER BY created_at').bind(rpId).all<PasskeyRow>()
    : await db
      .prepare('SELECT * FROM passkeys WHERE rp_id = ? AND COALESCE(email, ?) = ? ORDER BY created_at')
      .bind(rpId, OWNER_EMAIL, who(email))
      .all<PasskeyRow>()
  return results.map(toPasskey)
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
    /** صاحبُه (D-317) — بريدُ الجلسة التي سجّلته، لا ما يرسله النموذج. */
    email: string
  },
): Promise<string> {
  const id = crypto.randomUUID()
  await db
    .prepare(
      `INSERT INTO passkeys
         (id, credential_id, public_key, alg, sign_count, label, rp_id, email)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, key.credentialId, key.publicKey, key.alg, key.signCount, key.label, key.rpId, who(key.email))
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

/** يحذف مفتاحًا **لصاحبه وحده** (D-317): معرّفُ مفتاحِ غيره من النموذج لا يحذف شيئًا. */
export async function deletePasskey(db: Db, id: string, email: string): Promise<boolean> {
  const before = await db
    .prepare('SELECT id FROM passkeys WHERE id = ? AND COALESCE(email, ?) = ?')
    .bind(id, OWNER_EMAIL, who(email))
    .first()
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

/**
 * أين يسكن رمزُ تطبيق هذا الحساب (D-317): المالكُ في خانة `totp` كما كان، والمدعوّ في `member_totp` بصفّه.
 * **وسياقُ التشفير يحمل البريد** للمدعوّ: سرٌّ يُنسَخ إلى صفّ غيره لا يُفكّ.
 */
function totpHome(email: string): { readonly owner: boolean; readonly email: string; readonly context: string } {
  const e = who(email)
  return isOwnerEmail(e)
    ? { owner: true, email: e, context: TOTP_CONTEXT }
    : { owner: false, email: e, context: `${TOTP_CONTEXT}:${e}` }
}

/** سياقُ تشفير رمز تطبيق هذا الحساب — لدورة التدوير (D-318) تعيد التشفيرَ بالسياق نفسِه. */
export function totpContext(email: string): string {
  return totpHome(email).context
}

/** يقرأ الصفّ أو يرمي — لا «لا رمز» عن قاعدةٍ صامتة (D-317). */
async function totpRow(db: Db, email: string): Promise<TotpRow | null> {
  const home = totpHome(email)
  return home.owner
    ? await db.prepare('SELECT * FROM totp WHERE id = 1').first<TotpRow>()
    : await db.prepare('SELECT * FROM member_totp WHERE email = ?').bind(home.email).first<TotpRow>()
}

export async function totpState(db: Db, email: string): Promise<TotpState> {
  const row = await totpRow(db, email)
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
 *
 * **ولا يدهس رمزًا مؤكَّدًا** (D-317): كان يكتب `confirmed_at = NULL` فوق الرمز القائم، فجلسةٌ مسروقةٌ بلا مفتاح
 * مرورٍ تُطفئ إلزامَ العامل الثاني بنداءٍ واحد. فالمؤكَّدُ يبقى حتّى يُزال بفعلٍ مستقلّ (`removeTotp` بعد تحقّقٍ حديث).
 * ويُعاد `false` حين وُجد مؤكَّدٌ فلم يُكتب شيء.
 */
export async function startTotp(db: Db, encKey: string, secret: string, email: string): Promise<boolean> {
  const home = totpHome(email)
  const sealed = await sealScoped(encKey, TOTP_SCOPE, secret, home.context)
  const result = home.owner
    ? await db
      .prepare(
        `INSERT INTO totp (id, secret_cipher, secret_iv, confirmed_at, last_step)
         VALUES (1, ?, ?, NULL, NULL)
         ON CONFLICT(id) DO UPDATE SET
           secret_cipher = excluded.secret_cipher,
           secret_iv = excluded.secret_iv,
           confirmed_at = NULL,
           last_step = NULL
         WHERE totp.confirmed_at IS NULL`,
      )
      .bind(sealed.ciphertext, sealed.iv)
      .run()
    : await db
      .prepare(
        `INSERT INTO member_totp (email, secret_cipher, secret_iv, confirmed_at, last_step)
         VALUES (?, ?, ?, NULL, NULL)
         ON CONFLICT(email) DO UPDATE SET
           secret_cipher = excluded.secret_cipher,
           secret_iv = excluded.secret_iv,
           confirmed_at = NULL,
           last_step = NULL
         WHERE member_totp.confirmed_at IS NULL`,
      )
      .bind(home.email, sealed.ciphertext, sealed.iv)
      .run()
  return changedRows(result)
}

/** يقرأ السرّ. يرجع `null` إن لم يوجد أو تعذّر فكّه — ويرمي إن لم تردّ القاعدة. */
export async function readTotpSecret(db: Db, encKey: string, email: string): Promise<string | null> {
  const row = await totpRow(db, email)
  if (row === null) return null
  try {
    return await openScoped(encKey, TOTP_SCOPE, { ciphertext: row.secret_cipher, iv: row.secret_iv }, totpHome(email).context, LEGACY_RAW)
  } catch {
    return null
  }
}

export async function confirmTotp(db: Db, step: bigint, email: string): Promise<void> {
  const home = totpHome(email)
  if (home.owner) {
    await db
      .prepare("UPDATE totp SET confirmed_at = datetime('now'), last_step = ? WHERE id = 1")
      .bind(String(step))
      .run()
  } else {
    await db
      .prepare("UPDATE member_totp SET confirmed_at = datetime('now'), last_step = ? WHERE email = ?")
      .bind(String(step), home.email)
      .run()
  }
}

/** يسجّل آخر خطوةٍ قُبلت — فرمزٌ استُعمل لا يُقبل ثانية. */
export async function markTotpStep(db: Db, step: bigint, email: string): Promise<void> {
  const home = totpHome(email)
  if (home.owner) {
    await db.prepare('UPDATE totp SET last_step = ? WHERE id = 1').bind(String(step)).run()
  } else {
    await db.prepare('UPDATE member_totp SET last_step = ? WHERE email = ?').bind(String(step), home.email).run()
  }
}

export async function removeTotp(db: Db, email: string): Promise<void> {
  const home = totpHome(email)
  if (home.owner) await db.prepare('DELETE FROM totp WHERE id = 1').run()
  else await db.prepare('DELETE FROM member_totp WHERE email = ?').bind(home.email).run()
}

// ── رموز الاسترداد ───────────────────────────────────────────────────

/**
 * رمزٌ من عشرين محرفًا بأربع مجموعات — يُقرأ ويُكتب على ورق.
 *
 * ولا يُستعمل `randomToken` الستّينيّ عشر: أربعةٌ وستّون محرفا لا تُنسَخ
 * من ورقةٍ بلا خطأ، ورمزٌ يُخطئ المالكُ في نسخه ليس رمزَ استرداد.
 *
 * **ومئةُ بتٍّ لا خمسون** (D-318): كان عشرةَ محارف (‏≈50 بتًّا) بتهشيم SHA-256 بلا ملح، فمن سرق نسخةً من الجدول
 * عكسها بالقوّة على حاسوبٍ واحد. وأبجديّةُ الاثنين والثلاثين تقسم البايتَ بلا انحياز (256 ÷ 32)، فكلُّ محرفٍ خمسةُ بتّات.
 */
export const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const RECOVERY_CHARS = 20
const RECOVERY_INFO = 'recovery-v1'
const RECOVERY_SCHEME = 'r1'

function oneCode(): string {
  const bytes = randomBytes(RECOVERY_CHARS)
  const chars = Array.from(bytes, (b) => RECOVERY_ALPHABET[b % RECOVERY_ALPHABET.length]!).join('')
  return (chars.match(/.{5}/g) ?? [chars]).join('-')
}

/** يُطبّع ما كتبه المالك: حالةُ الأحرف والشرطة والمسافات لا تُحاسَب. */
export function normalizeCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** التهشيمُ القديم (قبل D-318): SHA-256 بلا ملح — يُقرأ لرموزٍ صدرت قبله حتّى تُستعمَل أو تُجدَّد. */
async function legacyHash(code: string): Promise<string> {
  return toBase64Url(await digest(`recovery:${normalizeCode(code)}`))
}

/**
 * HMAC-SHA256 بمفتاحٍ مشتقٍّ بـ HKDF من `TOKEN_ENC_KEY` (‏`info = recovery-v1`)، على **ملح الرمز** ثمّ نصِّه. فنسخةُ
 * الجدول وحدَها لا تكفي لتخمين رمز: بلا المفتاح لا يُحسَب تهشيمٌ يُقارَن، ومع الملح لا يُحسَب جدولٌ مرّةً لكلّ الرموز.
 */
async function macOf(keyMaterial: string, salt: Uint8Array, code: string): Promise<Uint8Array> {
  const key = await hmacKeyFor(keyMaterial, RECOVERY_INFO)
  const text = new TextEncoder().encode(normalizeCode(code))
  const message = new Uint8Array(salt.byteLength + text.byteLength)
  message.set(salt, 0)
  message.set(text, salt.byteLength)
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, message as BufferSource))
}

/** الصفُّ: `r1.<معرّف المفتاح>.<الملح>.<التهشيم>` — والمعرّفُ يقول بأيّ مفتاحٍ في الحلقة يُعاد الحساب. */
async function sealCode(encKey: string, code: string): Promise<string> {
  const salt = randomBytes(16)
  return [RECOVERY_SCHEME, await keyId(encKey), toBase64Url(salt), toBase64Url(await macOf(encKey, salt, code))].join('.')
}

/** شرطُ صاحب الرموز في الجملة — والغائبُ (`NULL`) للمالك. */
const RECOVERY_OWNER = 'COALESCE(email, ?) = ?'

/**
 * يولّد مجموعةً جديدة ويستبدل القديمة كاملةً.
 *
 * والاستبدالُ كاملٌ عمدا: مجموعتان قائمتان تعنيان أنّ ورقةً ظنّ المالك
 * أنّه أبطلها ما تزال تفتح.
 */
export async function issueRecoveryCodes(db: Db, encKey: string, email: string, count = 8): Promise<string[]> {
  const owner = who(email)
  const codes = Array.from({ length: count }, () => oneCode())
  const hashes = await Promise.all(codes.map((code) => sealCode(encKey, code)))
  await db.prepare(`DELETE FROM recovery_codes WHERE ${RECOVERY_OWNER}`).bind(OWNER_EMAIL, owner).run()
  for (const hash of hashes) {
    await db.prepare('INSERT INTO recovery_codes (hash, email) VALUES (?, ?)').bind(hash, owner).run()
  }
  return codes
}

/** معرّفُ مفتاح الصفّ `r1.<kid>.…`، أو `null` لتهشيمٍ قديم (SHA-256 بلا مفتاح). */
function codeKid(hash: string): string | null {
  const parts = hash.split('.')
  return parts[0] === RECOVERY_SCHEME && parts.length === 4 ? parts[1]! : null
}

export interface RecoveryCount {
  readonly total: number
  /** ما يفتح الآن: غيرُ مستهلَكٍ **ويُتحقَّق منه بمفتاحٍ في الحلقة** — والقديمُ بلا مفتاحٍ معه. */
  readonly unused: number
  /**
   * غيرُ مستهلَكٍ هُشِّم بمفتاحٍ غير الحاليّ (مراجعة D-318): في التدوير يفتح ما دام السابقُ مضبوطًا ثمّ يبطل، وبعده لا
   * يفتح أصلًا. فيُقال لصاحبه «ولّد غيرها» ولا يُعدّ في `unused` ما لا يفتح.
   */
  readonly stale: number
}

/**
 * كم رمزًا لهذا الحساب، وكم يفتح — ويرمي إن لم تردّ القاعدة (D-317).
 *
 * **ولا يُعدّ صالحًا ما لا تتحقّق منه الحلقة** (مراجعة D-318): كان العدُّ على `used_at` وحده، فبعد حذف `TOKEN_ENC_KEY_PREV`
 * تقول الصفحةُ «بقي 8» والرموزُ الثمانية لا تفتح، وتسجيلُ عاملٍ جديد لا يُصدر غيرها لأنّ «عنده رموز».
 */
export async function countRecoveryCodes(db: Db, encKey: string, email: string): Promise<RecoveryCount> {
  const { results } = await db
    .prepare(`SELECT hash, used_at FROM recovery_codes WHERE ${RECOVERY_OWNER}`)
    .bind(OWNER_EMAIL, who(email))
    .all<{ hash: string; used_at: string | null }>()
  const current = await keyId(encKey)
  const ring = new Set(await Promise.all(keyring(encKey).map((k) => keyId(k))))
  let unused = 0
  let stale = 0
  for (const row of results) {
    if (row.used_at !== null) continue
    const kid = codeKid(row.hash)
    if (kid === null || ring.has(kid)) unused += 1
    if (kid !== null && kid !== current) stale += 1
  }
  return { total: results.length, unused, stale }
}

/**
 * رموزٌ غيرُ مستهلَكة على غير المفتاح الحاليّ، في كلّ الحسابات (مراجعة D-318) — لدورة التدوير و`/admin/ready`. لا يُعاد
 * تهشيمُها (الرمزُ نفسُه لا يُعرَف)، فلا يُحذف السابقُ قبل أن يجدّدها أصحابُها أو يُقبَل أنّها تبطل.
 */
export async function countStaleRecoveryCodes(db: Db, encKey: string): Promise<number> {
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM recovery_codes WHERE used_at IS NULL AND hash LIKE ? AND hash NOT LIKE ?`)
    .bind(`${RECOVERY_SCHEME}.%`, `${RECOVERY_SCHEME}.${await keyId(encKey)}.%`)
    .first<{ n: number }>()
  return row?.n ?? 0
}

/**
 * أيطابق هذا الصفُّ الرمزَ المكتوب؟ — والمقارنةُ على بايتاتٍ متساوية الطول بزمنٍ ثابت.
 * صفٌّ بمعرّف مفتاحٍ ليس في الحلقة لا يطابق شيئًا (التدويرُ انتهى ولم يُجدَّد).
 */
async function matches(row: string, presented: string, ring: readonly string[], legacy: Uint8Array): Promise<boolean> {
  const parts = row.split('.')
  if (parts[0] !== RECOVERY_SCHEME) return sameBytes(await digest(row), legacy)
  if (parts.length !== 4) return false
  const [, kid, salt, mac] = parts as [string, string, string, string]
  for (const material of ring) {
    if ((await keyId(material)) !== kid) continue
    try {
      return sameBytes(await macOf(material, fromBase64Url(salt), presented), fromBase64Url(mac))
    } catch {
      return false
    }
  }
  return false
}

/**
 * يستهلك رمزَ استرداد.
 *
 * والمقارنةُ بمساواةٍ ثابتة الزمن على كلّ صفوف الحساب بلا خروجٍ مبكر، والاستهلاكُ **مشروطٌ في جملة SQL نفسها**
 * (`used_at IS NULL`): طلبان متزامنان بالرمز نفسه لا ينجح منهما إلّا واحد — والقاعدةُ هي التي تفصل لا الشيفرة.
 * والقديمُ (D-317 وما قبله) يُقارَن بتهشيمه القديم حتّى يُستعمَل أو يُجدَّد.
 */
export async function useRecoveryCode(db: Db, encKey: string, presented: string, email: string): Promise<boolean> {
  const normalized = normalizeCode(presented)
  if (normalized.length < 8) return false

  const legacy = await digest(await legacyHash(normalized))
  const ring = keyring(encKey)

  // ‏رموزُ هذا الحساب وحدَه (D-317): رمزُ غيره لا يفتح بابه
  const { results } = await db
    .prepare(`SELECT hash FROM recovery_codes WHERE used_at IS NULL AND ${RECOVERY_OWNER}`)
    .bind(OWNER_EMAIL, who(email))
    .all<{ hash: string }>()

  let match: string | null = null
  for (const row of results) {
    // تُفحص كلُّ الصفوف بلا خروجٍ مبكر: موضعُ الرمز في القائمة لا يُستدلّ عليه من زمن الردّ
    if (await matches(row.hash, normalized, ring, legacy)) match = row.hash
  }
  if (match === null) return false

  const result = await db
    .prepare("UPDATE recovery_codes SET used_at = datetime('now') WHERE hash = ? AND used_at IS NULL")
    .bind(match)
    .run()

  return changedRows(result)
}

// ── الحال المجمَّع ───────────────────────────────────────────────────

export interface FactorState {
  readonly passkeys: Passkey[]
  readonly totp: TotpState
  readonly recovery: RecoveryCount
  /** أثمّة عاملٌ ثانٍ مفعَّل؟ وهو ما يقرّر أنّ الرمز وحده لا يكفي. */
  readonly enforced: boolean
}

/**
 * حالُ عوامل حسابٍ مجتمعةً.
 *
 * **وقاعدةٌ لا تُقرأ ترمي — لا تقول «لا عامل ثانٍ»** (D-317).
 *
 * كان الانفتاحُ هنا مقصودًا بحجّة «`ADMIN_TOKEN` ما يزال مطلوبًا»، وسقطت الحجّةُ مع كلمة الإدارة في D-245: صار رمزُ
 * البريد الصحيح مع عثرةٍ في D1 جلسةَ مالكٍ كاملة. فمن يسأل هنا ليقرّر دخولًا يلتقط الخطأ ويردّ «أعد المحاولة» **ولا
 * يفتح جلسة**، ومن يسأل ليعرض صفحةً يلتقطه ويعرض ما يقدر.
 */
export async function factorState(db: Db, encKey: string, rpId: string, email: string): Promise<FactorState> {
  const [passkeys, totp, recovery] = await Promise.all([
    listPasskeys(db, rpId, email),
    totpState(db, email),
    countRecoveryCodes(db, encKey, email),
  ])
  return {
    passkeys,
    totp,
    recovery,
    // **المؤكَّد وحده يُلزِم.** سرٌّ بدأ تسجيلُه ولم يُؤكَّد لو أُلزم به
    // لأقفل صاحبَه خارج لوحته بسرٍّ لم يثبت أنّه في يده
    enforced: passkeys.length > 0 || totp.confirmed,
  }
}

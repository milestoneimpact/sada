/**
 * تشفير الرموز — AES-GCM (D-005).
 *
 * القاعدة في CLAUDE.md: لا `access_token` ولا `refresh_token` خاماً في D1.
 * المفتاح `TOKEN_ENC_KEY` يعيش في أسرار Worker وحدها، ولا يمرّ في متغيّر
 * عاديّ ولا في `wrangler.toml` ولا في سجلّ.
 *
 * لكلّ عمليّة تشفير `iv` جديد بـ 12 بايت — إعادة استخدام الـ iv مع المفتاح
 * نفسه تكسر AES-GCM تماماً.
 *
 * ويُربَط كلّ نصّ مشفَّر بسياقه (`context`) عبر AAD، فلا يصلح نصّ مشفَّر
 * لحساب أو حقل غير الذي شُفّر له: نقلُ `refresh` مكان `access`، أو نقلُ رموز
 * حسابٍ إلى آخر، يفشل في فكّ التشفير بدل أن يمرّ صامتاً.
 */

/** نصّ مشفَّر مع الـ iv الخاصّ به. كلاهما base64. */
export interface Sealed {
  readonly ciphertext: string
  readonly iv: string
}

export class CryptoError extends Error {
  override readonly name = 'CryptoError'
}

const IV_BYTES = 12
const KEY_BYTES = 32

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export function fromBase64(value: string): Uint8Array {
  let binary: string
  try {
    binary = atob(value)
  } catch {
    throw new CryptoError('قيمة base64 غير صالحة')
  }
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/**
 * يستورد `TOKEN_ENC_KEY` — نصّ base64 لمفتاح 32 بايت.
 * يُولَّد بـ: `openssl rand -base64 32`
 */
export async function importKey(keyMaterial: string): Promise<CryptoKey> {
  const raw = fromBase64(keyMaterial)
  if (raw.byteLength !== KEY_BYTES) {
    throw new CryptoError(
      `TOKEN_ENC_KEY يجب أن يكون ${KEY_BYTES} بايت، ووُجد ${raw.byteLength}`,
    )
  }
  return crypto.subtle.importKey('raw', raw as BufferSource, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ])
}

/**
 * يشفّر `plaintext` ويربطه بـ `context`.
 *
 * @param context معرّف الحقل وصاحبه، مثل `account:lnkd_7:access`.
 *                القيمة نفسها مطلوبة عند فكّ التشفير.
 */
/**
 * مفتاحُ منظّمةٍ مشتقٌّ من المفتاح الأصل (D-238) — HKDF-SHA256 والمنظّمةُ في `info`.
 * فرمزٌ شُفِّر لمنظّمةٍ لا يُفكّ بمفتاح غيرها ولو اتّحد الأصل، ولا سرَّ جديدًا يُدار.
 */
export async function deriveKey(keyMaterial: string, label: string): Promise<CryptoKey> {
  const raw = fromBase64(keyMaterial)
  if (raw.byteLength !== KEY_BYTES) {
    throw new CryptoError(
      `TOKEN_ENC_KEY يجب أن يكون ${KEY_BYTES} بايت، ووُجد ${raw.byteLength}`,
    )
  }
  if (label.length === 0) throw new CryptoError('اسم المفتاح المشتقّ مطلوب')
  const base = await crypto.subtle.importKey('raw', raw as BufferSource, 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: encoder.encode('sada:org-key:v1') as BufferSource,
      info: encoder.encode(label) as BufferSource,
    },
    base,
    { name: 'AES-GCM', length: KEY_BYTES * 8 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function seal(
  key: CryptoKey,
  plaintext: string,
  context: string,
): Promise<Sealed> {
  if (context.length === 0) throw new CryptoError('السياق مطلوب ولا يكون فارغاً')
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(context) },
    key,
    encoder.encode(plaintext),
  )
  return { ciphertext: toBase64(new Uint8Array(ciphertext)), iv: toBase64(iv) }
}

/**
 * يفكّ ما شُفّر بـ `seal`. يرمي `CryptoError` إن اختلف المفتاح أو السياق
 * أو الـ iv، أو إن عُبث بالنصّ — ولا يعيد قيمة جزئية أبداً.
 */
export async function open(
  key: CryptoKey,
  sealed: Sealed,
  context: string,
): Promise<string> {
  if (context.length === 0) throw new CryptoError('السياق مطلوب ولا يكون فارغاً')
  const iv = fromBase64(sealed.iv)
  if (iv.byteLength !== IV_BYTES) {
    throw new CryptoError(`iv يجب أن يكون ${IV_BYTES} بايت، ووُجد ${iv.byteLength}`)
  }
  let plaintext: ArrayBuffer
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource, additionalData: encoder.encode(context) },
      key,
      fromBase64(sealed.ciphertext) as BufferSource,
    )
  } catch {
    throw new CryptoError('فشل فكّ التشفير: مفتاح أو سياق أو نصّ غير مطابق')
  }
  return decoder.decode(plaintext)
}

/** سياق موحَّد لحقول الرموز، حتى لا يُكتَب يدوياً في موضعين فيختلف. */
export function tokenContext(
  accountId: string,
  field: 'access' | 'refresh',
): string {
  return `account:${accountId}:${field}`
}

// ── حلقةُ المفاتيح وإصدارُها (D-318) ────────────────────────────────

/**
 * ## ما كان
 *
 * المفتاحُ الخامُ نفسُه مفتاحُ AES لمنظّمة المالك ولخزانة المزوّدين وتطبيقات OAuth ورمز التطبيق، **وهو نفسُه مادّةُ
 * HKDF** لمنظّمات العملاء (D-238) — مفتاحٌ واحدٌ في دورين يُضعف الفصل بينهما. ولا يحمل النصُّ المشفَّر ما يقول بأيّ مفتاحٍ
 * شُفِّر، فتدويرُ `TOKEN_ENC_KEY` يُسقط كلَّ إذنٍ وسرٍّ محفوظ دفعةً بلا طريقٍ إلى الوراء.
 *
 * ## ما صار
 *
 * - **كلُّ نطاقٍ مفتاحُه مشتقٌّ بـ HKDF** — منظّمةُ المالك معها (`tokens:org_owner`)، والخزانةُ والتطبيقاتُ ورمزُ التطبيق
 *   وقناةُ التنبيهات كلٌّ باسمه. والخامُ لا يشفّر شيئًا جديدًا.
 * - **والنصُّ الجديدُ يحمل معرّفَ مفتاحه**: `v2:<kid>:<base64>`، و`kid` ثمانيةُ محارف من بصمةٍ للمفتاح لا تُعكَس إليه.
 * - **والقديمُ يُقرأ كما شُفِّر** (`LegacyKey`): الخامُ للمالك والخزانة، والمشتقُّ القديمُ للعملاء — ولا يُعاد تشفيرُه إلّا
 *   في تدويرٍ معلَن، فرجوعُ الشيفرة إلى ما قبل D-318 لا يُسقط ما لم يُكتب بعدها.
 * - **و`TOKEN_ENC_KEY_PREV` اختياريّ**: حين يُضبَط يُقرأ به ما شُفِّر بالسابق، والكتابةُ بالحاليّ وحده، ودورةُ التدوير
 *   (`security/rotate.ts`) تعيد تشفيرَ ما بقي على غيره حتّى لا يبقى شيء.
 */
const SCOPED = 'v2'
const scopedSalt = encoder.encode('sada:key:v2')
const hmacSalt = encoder.encode('sada:hmac:v1')

function rawKey(keyMaterial: string): Uint8Array {
  const raw = fromBase64(keyMaterial)
  if (raw.byteLength !== KEY_BYTES) {
    throw new CryptoError(`TOKEN_ENC_KEY يجب أن يكون ${KEY_BYTES} بايت، ووُجد ${raw.byteLength}`)
  }
  return raw
}

/**
 * المفتاحُ السابقُ لكلّ حاليّ — يُملأ من البيئة عند كلّ مدخلٍ للعامل (`registerKeyring`). البيئةُ ثابتةٌ في عمر النسخة،
 * فهذه خريطةُ إعدادٍ لا حالُ طلب؛ ومفتاحُها المفتاحُ الحاليّ، فبيئتان بمفتاحين لا تختلطان.
 */
const previousOf = new Map<string, string>()

/** يقرأ `TOKEN_ENC_KEY_PREV` من البيئة — يُنادى في `fetch` و`queue` و`scheduled` قبل أيّ عمل. */
export function registerKeyring(env: { readonly TOKEN_ENC_KEY?: string; readonly TOKEN_ENC_KEY_PREV?: string }): void {
  const current = env.TOKEN_ENC_KEY
  if (typeof current !== 'string' || current.trim() === '') return
  const previous = typeof env.TOKEN_ENC_KEY_PREV === 'string' ? env.TOKEN_ENC_KEY_PREV.trim() : ''
  if (previous === '' || previous === current.trim()) previousOf.delete(current)
  else previousOf.set(current, previous)
}

/** المفتاحُ السابقُ المسجَّلُ لهذا الحاليّ، أو `null` خارج التدوير. */
export function previousKey(encKey: string): string | null {
  return previousOf.get(encKey) ?? null
}

/** الحلقة: الحاليّ أوّلًا ثمّ السابق إن كان. */
export function keyring(encKey: string): readonly string[] {
  const previous = previousKey(encKey)
  return previous === null ? [encKey] : [encKey, previous]
}

const kidCache = new Map<string, string>()

/**
 * معرّفُ المفتاح: ثمانيةُ محارف ستّينيّة من SHA-256 على المفتاح مسبوقًا باسم الغرض. اثنان وثلاثون بتًّا من بصمةٍ لمفتاحٍ
 * بمئتين وستّةٍ وخمسين لا تقرّب أحدًا منه، وتكفي لتمييز الحاليّ من السابق.
 */
export async function keyId(keyMaterial: string): Promise<string> {
  const cached = kidCache.get(keyMaterial)
  if (cached !== undefined) return cached
  const raw = rawKey(keyMaterial)
  const label = encoder.encode('sada:key-id:v2:')
  const joined = new Uint8Array(label.byteLength + raw.byteLength)
  joined.set(label, 0)
  joined.set(raw, label.byteLength)
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', joined as BufferSource))
  const kid = Array.from(hash.slice(0, 4), (b) => b.toString(16).padStart(2, '0')).join('')
  kidCache.set(keyMaterial, kid)
  return kid
}

async function scopedKey(keyMaterial: string, scope: string): Promise<CryptoKey> {
  if (scope.length === 0) throw new CryptoError('اسم النطاق مطلوب')
  const base = await crypto.subtle.importKey('raw', rawKey(keyMaterial) as BufferSource, 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: scopedSalt as BufferSource, info: encoder.encode(`aes:${scope}`) as BufferSource },
    base,
    { name: 'AES-GCM', length: KEY_BYTES * 8 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/**
 * مفتاحُ HMAC-SHA256 مشتقٌّ بـ HKDF لغرضٍ مسمّى (`info`) — رموزُ الاسترداد (`recovery-v1`). ولا يشفّر شيئًا.
 */
export async function hmacKeyFor(keyMaterial: string, info: string): Promise<CryptoKey> {
  if (info.length === 0) throw new CryptoError('اسم الغرض مطلوب')
  const base = await crypto.subtle.importKey('raw', rawKey(keyMaterial) as BufferSource, 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: hmacSalt as BufferSource, info: encoder.encode(info) as BufferSource },
    base,
    { name: 'HMAC', hash: 'SHA-256', length: 256 },
    false,
    ['sign'],
  )
}

/** كيف شُفِّر القديمُ (قبل D-318) لهذا الحقل: بالخام، أو بالمشتقّ القديم لمنظّمة عميل (D-238). */
export type LegacyKey = (keyMaterial: string) => Promise<CryptoKey>

export const LEGACY_RAW: LegacyKey = (keyMaterial) => importKey(keyMaterial)

/** مفتاحُ رموز المنظّمة قبل D-318: المالكُ بالخام، وغيرُه بالمشتقّ القديم باسمه. */
export function legacyOrgKey(org: string): LegacyKey {
  return (keyMaterial) => (org === 'org_owner' ? importKey(keyMaterial) : deriveKey(keyMaterial, org))
}

/** يشفّر بالمفتاح الحاليّ مشتقًّا للنطاق، ويَسِم النصَّ بمعرّف مفتاحه. */
export async function sealScoped(encKey: string, scope: string, plaintext: string, context: string): Promise<Sealed> {
  const sealed = await seal(await scopedKey(encKey, scope), plaintext, context)
  return { ciphertext: `${SCOPED}:${await keyId(encKey)}:${sealed.ciphertext}`, iv: sealed.iv }
}

/**
 * يفكّ ما شُفِّر بـ `sealScoped` بمفتاح الحلقة الذي يسمّيه النصّ، أو ما شُفِّر قبل D-318 بطريقته القديمة (`legacy`) —
 * بالحاليّ ثمّ بالسابق. ويرمي `CryptoError` إن لم يفتحه مفتاحٌ في الحلقة؛ ولا يعيد قيمةً جزئيّة أبدًا.
 */
export async function openScoped(
  encKey: string,
  scope: string,
  sealed: Sealed,
  context: string,
  legacy: LegacyKey,
): Promise<string> {
  const ring = keyring(encKey)
  if (sealed.ciphertext.startsWith(`${SCOPED}:`)) {
    const [, kid, body] = sealed.ciphertext.split(':')
    if (kid === undefined || body === undefined || body === '') throw new CryptoError('نصٌّ مشفَّرٌ بصيغةٍ تالفة')
    for (const material of ring) {
      if ((await keyId(material)) === kid) return await open(await scopedKey(material, scope), { ciphertext: body, iv: sealed.iv }, context)
    }
    throw new CryptoError('النصُّ مشفَّرٌ بمفتاحٍ ليس في الحلقة')
  }
  for (const material of ring) {
    try {
      return await open(await legacy(material), sealed, context)
    } catch {
      // ‏المفتاحُ التالي في الحلقة — والأخيرُ يرمي أدناه
    }
  }
  throw new CryptoError('فشل فكّ التشفير: مفتاح أو سياق أو نصّ غير مطابق')
}

/** أهذا النصُّ مشفَّرٌ بالمفتاح الحاليّ في الصيغة الجديدة؟ — ما سواه تعيد دورةُ التدوير تشفيرَه. */
export async function sealedWithCurrent(encKey: string, ciphertext: string): Promise<boolean> {
  return ciphertext.startsWith(`${SCOPED}:${await keyId(encKey)}:`)
}

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

/**
 * `base64url` وقراءةُ البايتات.
 *
 * WebAuthn يتكلّم `base64url` في كلّ حقولها — لا `base64` العاديّة. والفرق
 * ثلاثةُ محارف (`+/=` مقابل `-_`) وهو كافٍ ليفشل التحقّق فشلا صامتا:
 * التوقيعُ سليم، والمقارنةُ تقول «لا يطابق». فيُكتب التحويل مرّةً هنا
 * ويُستعمل في الطرفين.
 */

export function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * يقرأ `base64url` — ويتسامح مع الحشو الغائب.
 *
 * ويرمي على مدخلٍ فاسد: مفتاحٌ مشوّه يجب أن يُوقف التحقّق، لا أن يصير
 * بايتاتٍ عشوائيّةً يُقارَن بها فتُرفض لسببٍ آخر يُخفي السبب الحقيقيّ.
 */
export function fromBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** بايتاتٌ عشوائيّة — تحدّياتٌ وأسرار. */
export function randomBytes(count: number): Uint8Array {
  const bytes = new Uint8Array(count)
  crypto.getRandomValues(bytes)
  return bytes
}

/** يقارن مصفوفتين بزمنٍ ثابت. */
export function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a[i]! ^ b[i]!
  return diff === 0
}

export async function sha256(data: Uint8Array | string): Promise<Uint8Array> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource))
}

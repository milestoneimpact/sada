/**
 * TOTP — رمزٌ من تطبيقِ مصادقة (RFC 6238).
 *
 * وهو **دون Passkey** درجةً: رمزٌ يُقرأ من شاشةٍ يمكن أن يُملى على صفحةٍ
 * مزوّرة، والمفتاحُ الموقِّع على النطاق لا يمكن. فموضعُه هنا طريقُ رجوعٍ
 * لا بابٌ رئيس: جهازُ المفاتيح يُفقد أو يُنسى في بلدٍ آخر، والمالكُ
 * الواحد لا أحدَ يفتح له.
 *
 * و SHA-1 مقصودة لا سهوا: المواصفة عليها، وكلُّ تطبيقٍ يقرؤها. وضعفُ
 * SHA-1 في **التصادم** لا في HMAC، و HMAC-SHA1 لا يزال سليما لهذا الغرض.
 */
import { randomBytes } from './bytes'

/** ثلاثون ثانية — ما تفترضه كلّ التطبيقات. */
export const STEP_SECONDS = 30
export const DIGITS = 6

/**
 * نافذةُ التسامح: خطوةٌ قبل وخطوةٌ بعد.
 *
 * فساعةُ الهاتف تنحرف ثوانيَ، ورمزٌ يُكتب في الثانية التاسعة والعشرين
 * يصل بعد أن تبدّل. وتوسيعُها أكثر يضاعف مساحةَ التخمين بلا داعٍ.
 */
export const DRIFT_STEPS = 1

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/** يكتب البايتات بـ base32 — وهي ما تقرؤه تطبيقات المصادقة. */
export function toBase32(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let output = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) output += ALPHABET[(value << (5 - bits)) & 31]
  return output
}

/** يقرأ base32. يتجاهل الحشو والمسافات، ويرمي على محرفٍ غريب. */
export function fromBase32(value: string): Uint8Array {
  const clean = value.toUpperCase().replace(/[\s=-]/g, '')
  let bits = 0
  let acc = 0
  const bytes: number[] = []
  for (const char of clean) {
    const index = ALPHABET.indexOf(char)
    if (index < 0) throw new Error(`محرف غير صالح في base32: ${char}`)
    acc = (acc << 5) | index
    bits += 5
    if (bits >= 8) {
      bytes.push((acc >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return new Uint8Array(bytes)
}

/** سرٌّ جديد — عشرون بايتا، وهو ما توصي به المواصفة لـ SHA-1. */
export function newSecret(): string {
  return toBase32(randomBytes(20))
}

async function hmac(secret: Uint8Array, counter: bigint): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    secret as BufferSource,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  )
  const message = new Uint8Array(8)
  new DataView(message.buffer).setBigUint64(0, counter, false)
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, message as BufferSource))
}

/**
 * الرمز عند خطوةٍ بعينها.
 *
 * والاقتطاعُ الديناميكيّ من المواصفة: البايتُ الأخير يدلّ على موضع
 * الأربعة التي تُقرأ. وقناعُ `0x7f` يمسح بتّ الإشارة — وبدونه يصير الرقم
 * سالبا على بعض الأنظمة.
 */
export async function codeAt(secret: string, counter: bigint): Promise<string> {
  const digest = await hmac(fromBase32(secret), counter)
  const offset = digest[digest.length - 1]! & 0x0f
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    (digest[offset + 1]! << 16) |
    (digest[offset + 2]! << 8) |
    digest[offset + 3]!
  return String(binary % 10 ** DIGITS).padStart(DIGITS, '0')
}

export function counterFor(now: Date = new Date()): bigint {
  return BigInt(Math.floor(now.getTime() / 1000 / STEP_SECONDS))
}

/**
 * يتحقّق من رمزٍ أدخله المالك.
 *
 * ويردّ **الخطوةَ التي صحّ عندها** لا `true` وحدها: الخطوةُ تُحفظ، فرمزٌ
 * صحيحٌ لا يُقبل مرّتين. وبلا هذا يستطيع من قرأ الرمزَ من فوق كتفٍ أن
 * يستعمله في الثواني الباقية من نافذته.
 */
export async function verifyTotp(
  secret: string,
  presented: string,
  options: { readonly now?: Date; readonly lastStep?: bigint } = {},
): Promise<{ ok: true; step: bigint } | { ok: false; reason: string }> {
  const digits = presented.replace(/\s/g, '')
  if (!/^\d{6}$/.test(digits)) return { ok: false, reason: 'الرمز ستّةُ أرقام' }

  const current = counterFor(options.now ?? new Date())
  for (let drift = -DRIFT_STEPS; drift <= DRIFT_STEPS; drift += 1) {
    const step = current + BigInt(drift)
    if (options.lastStep !== undefined && step <= options.lastStep) continue
    // لا خروجَ مبكر عند التطابق: الحلقةُ تكمل لئلّا يدلّ زمنُ الردّ على
    // أيّ خطوةٍ صحّت — والفرقُ ثلاثةُ نداءات HMAC لا أكثر
    if (await matches(secret, step, digits)) return { ok: true, step }
  }
  return { ok: false, reason: 'الرمز غير صحيح أو استُعمل من قبل' }
}

async function matches(secret: string, step: bigint, digits: string): Promise<boolean> {
  const expected = await codeAt(secret, step)
  let diff = 0
  for (let i = 0; i < DIGITS; i += 1) diff |= expected.charCodeAt(i) ^ digits.charCodeAt(i)
  return diff === 0
}

/**
 * عنوانُ `otpauth://` — ما يُقرأ في تطبيق المصادقة.
 *
 * والمُصدِر يحمل اسمَ النطاق لا «صدى» وحدها: مالكٌ له إنتاجٌ وتجريب يرى
 * سطرين متمايزين في التطبيق لا سطرين متطابقين يُخلط بينهما.
 */
export function otpauthUrl(secret: string, account: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`)
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  })
  return `otpauth://totp/${label}?${params.toString()}`
}

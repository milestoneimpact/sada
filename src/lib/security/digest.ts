/**
 * بصمةٌ ومقارنةٌ بزمنٍ ثابت — في موضعٍ واحد.
 *
 * كان منطقُ المقارنة في `adminAuth` وحده، ثمّ احتاجته الجلسةُ ورمزُ CSRF.
 * ونسخُه ثالثةً يعني ثلاثةَ مواضع تُخطئ في أحدها يوما — وخطأٌ في مقارنةِ
 * سرٍّ لا يظهر في اختبارٍ وظيفيّ: النظام يعمل، والتسريب في زمن الردّ.
 */

/** ملخّص SHA-256 من Web Crypto — تعمل في Worker وفي بيئة الاختبار معا. */
export async function digest(value: string): Promise<Uint8Array> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return new Uint8Array(bytes)
}

/** يقارن مصفوفتين بزمنٍ ثابت — لا خروج مبكر عند أوّل اختلاف. */
export function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a[i]! ^ b[i]!
  return diff === 0
}

/**
 * يقارن نصّين سرّيّين بزمنٍ ثابت.
 *
 * على البصمتين لا على النصّين: طولُ السرّ وأوّلُ محارفه لا يُستدلّ عليهما
 * من زمن الردّ.
 */
export async function sameSecret(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([digest(a), digest(b)])
  return sameBytes(x, y)
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * بصمةٌ قصيرة تُخزَّن بدل السرّ.
 *
 * ستّةَ عشرَ محرفا من ستّينيّ عشر — أربعةٌ وستّون بتّا. لا تُعكَس إلى
 * السرّ، وتكفي لتمييزِ سرٍّ من آخر تمييزا لا يقع فيه تصادم عمليّا.
 */
export async function fingerprint(secret: string): Promise<string> {
  return toHex(await digest(secret.trim())).slice(0, 16)
}

/** سرٌّ عشوائيّ بستّةَ عشرَ بايتا — مئةٌ وثمانيةٌ وعشرون بتّا. */
export function randomToken(bytes = 16): string {
  const buffer = new Uint8Array(bytes)
  crypto.getRandomValues(buffer)
  return toHex(buffer)
}

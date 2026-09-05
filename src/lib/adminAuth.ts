/**
 * حراسة مسارات الإدارة.
 *
 * `/admin/scan` يستهلك حصّة Google ويكتب في D1، وهو منشورٌ على نطاقٍ عامّ.
 * فبلا حارسٍ يشغّله من عرف العنوان، ويستنزف الحصّة والصفوف بلا حساب.
 *
 * **مغلقٌ افتراضاً.** بلا `ADMIN_TOKEN` لا يعمل المسار أصلاً: غياب السرّ
 * يُغلق لا يفتح. وهذا عكس ما تفعله أنظمة كثيرة — «لم يُضبط بعد» فيها
 * يعني «بلا حراسة»، وهو أسوأ ما يكون افتراضاً.
 *
 * والمقارنة على بصمتين لا على النصّين: طول الرمز وأوّل محارفه لا
 * يُستدلّ عليهما من زمن الردّ. و SHA-256 من Web Crypto تعمل في Worker
 * وفي بيئة الاختبار معاً، بخلاف `crypto.subtle.timingSafeEqual` الخاصّة
 * بـ Cloudflare وحدها.
 */

export type AdminVerdict = 'ok' | 'disabled' | 'denied'

async function digest(value: string): Promise<Uint8Array> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return new Uint8Array(bytes)
}

/** يقارن بصمتين بزمنٍ ثابت — لا خروج مبكر عند أوّل اختلاف. */
function sameDigest(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a[i]! ^ b[i]!
  return diff === 0
}

/** يستخرج الرمز من `Authorization: Bearer <token>`. */
function bearer(header: string | null): string | null {
  if (header === null) return null
  const match = /^Bearer (.+)$/.exec(header.trim())
  return match === null ? null : match[1]!
}

/**
 * يحكم في طلب إدارة.
 *
 * `disabled` ليست `denied`: الأولى تقول «المسار مقفل هنا» والثانية تقول
 * «رمزك خطأ». والتفريق مقصود — صاحب النظام يحتاج أن يعرف أيّهما وقع.
 */
export async function authorizeAdmin(
  expected: string | undefined,
  request: Request,
): Promise<AdminVerdict> {
  if (typeof expected !== 'string' || expected.length === 0) return 'disabled'
  const presented = bearer(request.headers.get('Authorization'))
  if (presented === null) return 'denied'
  const [a, b] = await Promise.all([digest(presented), digest(expected)])
  return sameDigest(a, b) ? 'ok' : 'denied'
}

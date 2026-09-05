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

export type AdminVerdict =
  | { readonly kind: 'ok' }
  /** لا `ADMIN_TOKEN` — المسار مقفل، لا مفتوح. */
  | { readonly kind: 'disabled' }
  /** لا ترويسة `Authorization: Bearer` أصلا، أو صيغتها ليست كذلك. */
  | { readonly kind: 'no_header' }
  /**
   * ترويسةٌ سليمة الصيغة ورمزٌ مخالف.
   *
   * `presentedLength` طول ما أرسله المنادي هو نفسه — يعرفه أصلا، فلا
   * يُسرَّب به شيء. وهو ما يكشف الخطأ الشائع: قوسان زائدان، أو مسافةٌ
   * لصقت مع الرمز، أو سطرٌ جديد. ولا يُذكر طول المحفوظ قطّ.
   */
  | { readonly kind: 'denied'; readonly presentedLength: number }

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

/**
 * يستخرج الرمز من `Authorization: Bearer <token>`.
 * ويُقلَّم الناتج: مسافةٌ لصقت مع الرمز عطلٌ شائع لا يستحقّ رفضا.
 */
function bearer(header: string | null): string | null {
  if (header === null) return null
  const match = /^Bearer (.+)$/.exec(header.trim())
  if (match === null) return null
  const token = match[1]!.trim()
  return token.length === 0 ? null : token
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
  // يُقلَّم المحفوظ أيضا: سطرٌ جديد يتسلّل مع `echo … | wrangler secret put`
  // فيجعل رمزا صحيحا يُرفض أبدا، بلا أثرٍ يدلّ على السبب
  const secret = typeof expected === 'string' ? expected.trim() : ''
  if (secret.length === 0) return { kind: 'disabled' }

  const presented = bearer(request.headers.get('Authorization'))
  if (presented === null) return { kind: 'no_header' }

  const [a, b] = await Promise.all([digest(presented), digest(secret)])
  return sameDigest(a, b)
    ? { kind: 'ok' }
    : { kind: 'denied', presentedLength: presented.length }
}

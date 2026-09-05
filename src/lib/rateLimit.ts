/**
 * حدّ محاولات الدخول.
 *
 * `/panel/login` كان يقبل محاولاتٍ بلا سقف. و `ADMIN_TOKEN` عشوائيّ
 * أربعةٌ وستّون محرفا فتخمينه عمليّا مستحيل — **لكنّ غياب الحدّ ليس
 * عذره وجودُ رمزٍ قويّ**: الرمز قد يُبدَّل يوما بأضعف، وبابٌ بلا مزلاج
 * يبقى بلا مزلاج.
 *
 * والعدّ في KV بمهلةٍ ذاتيّة: لا صفوف تُنظَّف، ولا جدول ينمو، والنافذة
 * تنتهي وحدها.
 */

export interface AttemptStore {
  get(key: string): Promise<string | null>
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
  delete(key: string): Promise<void>
}

export const MAX_ATTEMPTS = 5
export const WINDOW_SECONDS = 15 * 60

export interface AttemptState {
  readonly blocked: boolean
  readonly attempts: number
  readonly remaining: number
}

/**
 * مفتاح العدّ.
 *
 * `CF-Connecting-IP` تضعها Cloudflare نفسها ولا تُزوَّر من العميل، بخلاف
 * `X-Forwarded-For`. وغيابها يعني بيئة اختبار أو نداءً داخليّا — يُعدّ
 * تحت مفتاحٍ واحد لا يُترك بلا عدّ.
 */
function keyFor(request: Request): string {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'
  return `login-attempts:${ip}`
}

export async function attemptState(store: AttemptStore, request: Request): Promise<AttemptState> {
  const raw = await store.get(keyFor(request))
  const attempts = raw === null ? 0 : Number.parseInt(raw, 10) || 0
  return {
    blocked: attempts >= MAX_ATTEMPTS,
    attempts,
    remaining: Math.max(0, MAX_ATTEMPTS - attempts),
  }
}

/** يسجّل محاولةً فاشلة. النافذة تُجدَّد مع كلّ فشل: إلحاحٌ يطيل المنع. */
export async function recordFailure(store: AttemptStore, request: Request): Promise<AttemptState> {
  const current = await attemptState(store, request)
  const attempts = current.attempts + 1
  await store.put(keyFor(request), String(attempts), { expirationTtl: WINDOW_SECONDS })
  return {
    blocked: attempts >= MAX_ATTEMPTS,
    attempts,
    remaining: Math.max(0, MAX_ATTEMPTS - attempts),
  }
}

/** نجاحٌ يمحو العدّ: المالك الذي أخطأ مرّتين ثمّ أصاب لا يُحاسَب. */
export async function clearAttempts(store: AttemptStore, request: Request): Promise<void> {
  await store.delete(keyFor(request))
}

/**
 * تأخيرٌ متصاعد قبل الردّ على فشل.
 *
 * لا رفضَ فوريّ: زمنُ الردّ نفسه يخبر المخمِّن أنّه مُنع، فيبدّل عنوانه
 * ويستأنف. والتأخير يجعل التخمين مكلفا حتّى قبل بلوغ الحدّ.
 */
export function delayMs(attempts: number): number {
  if (attempts <= 1) return 0
  return Math.min(2000, 2 ** (attempts - 1) * 100)
}

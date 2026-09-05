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

/**
 * سقفٌ عامّ فوق سقف العنوان.
 *
 * العدُّ لكلّ IP وحده يوقف مخمّنا واحدا، ولا يوقف من يوزّع محاولاته على
 * مئة عنوان — وهذا ما تفعله كلّ أداةِ تخمينٍ جادّة. فالسقف العامّ هو ما
 * يمنع الحملة، وسقفُ العنوان هو ما يمنع الملحّ.
 *
 * وثلاثون في ربع ساعة سخيّ لمالكٍ واحد: من أخطأ ثلاثين مرّةً في ربع ساعة
 * ليس مالكا يكتب رمزه.
 */
export const MAX_GLOBAL_ATTEMPTS = 30

export interface AttemptState {
  readonly blocked: boolean
  readonly attempts: number
  readonly remaining: number
  /** أمُنع لأنّ الحملةَ عامّة لا لأنّ عنوانه أخطأ؟ يُقال في الرسالة. */
  readonly globalBlock: boolean
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

const GLOBAL_KEY = 'login-attempts:global'

async function countOf(store: AttemptStore, key: string): Promise<number> {
  const raw = await store.get(key)
  return raw === null ? 0 : Number.parseInt(raw, 10) || 0
}

function verdict(attempts: number, global: number): AttemptState {
  const globalBlock = global >= MAX_GLOBAL_ATTEMPTS
  return {
    blocked: attempts >= MAX_ATTEMPTS || globalBlock,
    attempts,
    remaining: Math.max(0, MAX_ATTEMPTS - attempts),
    globalBlock,
  }
}

export async function attemptState(store: AttemptStore, request: Request): Promise<AttemptState> {
  const [attempts, global] = await Promise.all([
    countOf(store, keyFor(request)),
    countOf(store, GLOBAL_KEY),
  ])
  return verdict(attempts, global)
}

/** يسجّل محاولةً فاشلة. النافذة تُجدَّد مع كلّ فشل: إلحاحٌ يطيل المنع. */
export async function recordFailure(store: AttemptStore, request: Request): Promise<AttemptState> {
  const [attempts, global] = await Promise.all([
    countOf(store, keyFor(request)),
    countOf(store, GLOBAL_KEY),
  ])
  await Promise.all([
    store.put(keyFor(request), String(attempts + 1), { expirationTtl: WINDOW_SECONDS }),
    store.put(GLOBAL_KEY, String(global + 1), { expirationTtl: WINDOW_SECONDS }),
  ])
  return verdict(attempts + 1, global + 1)
}

/**
 * نجاحٌ يمحو عدّ العنوان: المالك الذي أخطأ مرّتين ثمّ أصاب لا يُحاسَب.
 *
 * **ولا يمحو العدّ العامّ.** لو محاه لصار الدخولُ الناجح أداةً تُصفّر
 * الحملةَ الجارية: يخمّن المهاجم تسعا وعشرين، ثمّ يدخل المالكُ فيُعاد
 * العدّاد إلى الصفر ويستأنف. والعدّ العامّ ينتهي بمهلته وحدها.
 */
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

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
 * **السقفُ العامُّ قاطعُ دائرةٍ في D1 لا مفتاحٌ في KV** (D-317).
 *
 * كان هنا مفتاحٌ واحدٌ `login-attempts:global` يُكتب مع كلّ فشلٍ، وثلاثون فشلًا في ربع ساعةٍ من أيّ مكانٍ تُغلق
 * الدخولَ على الجميع — **ومفتاحُ المرور معه**. فكان ستّةُ عناوين (أو دفعةٌ متزامنةٌ من عنوانٍ واحد) تُخرج المالكَ
 * ربعَ ساعةٍ تتجدّد ما تجدّدت. ومفتاحٌ واحدٌ يُكتب مع كلّ فشلٍ يصطدم بحدّ KV (كتابةٌ في الثانية للمفتاح الواحد) فيردّ
 * 500 تحت الدفعة نفسِها.
 *
 * فصار KV للعنوان وحده (ما يقوله للمالك: «بقيت محاولتان»، والتأخيرُ المتصاعد)، والقاطعُ العامُّ في D1 بعدٍّ ذرّيٍّ
 * وسقفٍ أعلى بكثير (`gate.ts`)، **ولا يمسّ مفتاحَ المرور**.
 */
export const MAX_GLOBAL_ATTEMPTS = 1000

export interface AttemptState {
  readonly blocked: boolean
  readonly attempts: number
  readonly remaining: number
  /** أمُنع لأنّ القاطعَ العامّ انقطع لا لأنّ عنوانه أخطأ؟ يُقال في الرسالة — والقاطعُ في `gate.ts` لا هنا. */
  readonly globalBlock: boolean
}

/**
 * العنوانُ الذي يُعدّ عليه (D-317): IPv4 كما هو، و**IPv6 بشبكته `/64`**.
 *
 * كلُّ مشتركٍ في IPv6 يملك `/64` كاملةً — ثمانيةَ عشرَ مليونَ مليونِ عنوان — فالعدُّ بالعنوان الكامل لا يوقف أحدًا:
 * يبدّل الخانةَ الأخيرة ويستأنف. و`CF-Connecting-IP` تضعها Cloudflare ولا يزوّرها العميل.
 */
export function ipBucket(request: Request): string {
  const ip = (request.headers.get('CF-Connecting-IP') ?? 'unknown').trim().toLowerCase()
  if (!ip.includes(':')) return ip
  const [head = '', tail = ''] = ip.split('::')
  const left = head === '' ? [] : head.split(':')
  const right = tail === '' ? [] : tail.split(':')
  const groups = ip.includes('::')
    ? [...left, ...Array.from({ length: Math.max(0, 8 - left.length - right.length) }, () => '0'), ...right]
    : left
  return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, '')).join(':')}::/64`
}

/**
 * مفتاح العدّ.
 *
 * `CF-Connecting-IP` تضعها Cloudflare نفسها ولا تُزوَّر من العميل، بخلاف
 * `X-Forwarded-For`. وغيابها يعني بيئة اختبار أو نداءً داخليّا — يُعدّ
 * تحت مفتاحٍ واحد لا يُترك بلا عدّ.
 */
function keyFor(request: Request): string {
  return `login-attempts:${ipBucket(request)}`
}

async function countOf(store: AttemptStore, key: string): Promise<number> {
  const raw = await store.get(key)
  return raw === null ? 0 : Number.parseInt(raw, 10) || 0
}

function verdict(attempts: number): AttemptState {
  return {
    blocked: attempts >= MAX_ATTEMPTS,
    attempts,
    remaining: Math.max(0, MAX_ATTEMPTS - attempts),
    globalBlock: false,
  }
}

export async function attemptState(store: AttemptStore, request: Request): Promise<AttemptState> {
  return verdict(await countOf(store, keyFor(request)))
}

/**
 * يسجّل محاولةً فاشلة **على عنوانها وحده** (D-317). النافذة تُجدَّد مع كلّ فشل: إلحاحٌ يطيل المنع.
 *
 * و**لا يرمي**: KV يردّ الكتابةَ الثانية في الثانية على المفتاح نفسِه، وفشلُ العدّ لا يصير 500 بدل صفحة الدخول —
 * العدُّ الحاكمُ ذرّيٌّ في D1 (`gate.ts`)، وهذا لما يُقال للمالك.
 */
export async function recordFailure(store: AttemptStore, request: Request): Promise<AttemptState> {
  const attempts = await countOf(store, keyFor(request)).catch(() => 0)
  await store.put(keyFor(request), String(attempts + 1), { expirationTtl: WINDOW_SECONDS }).catch((error: unknown) => {
    console.warn({ job: 'rateLimit', failed: String(error) })
  })
  return verdict(attempts + 1)
}

/** نجاحٌ يمحو عدّ العنوان: المالك الذي أخطأ مرّتين ثمّ أصاب لا يُحاسَب. */
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

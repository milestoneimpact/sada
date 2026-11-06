/**
 * **كعكةُ الجهاز الموثوق** (مراجعة D-317) — نمطُ OWASP «Device Cookies» لإقفالٍ لا يُقفل صاحبَ الحساب.
 *
 * ## ما كان
 *
 * القاطعُ العامّ (ألفُ محاولةٍ في ربع ساعة) وسقفُ الحساب على رمز البريد (ثلاثون في اليوم) حدّان «على الجميع» و«على
 * الحساب»: يملؤهما من ملك مصادرَ كافية. والمراجعةُ ملأت الأوّلَ بكتلة IPv6 واحدة (`/48`) والثانيَ بثلاثة مصادر، فرُدّ
 * رمزُ المالك الصحيح من عنوانٍ نظيف يومًا كاملًا — ومالكٌ عاملُه رمزُ تطبيقٍ وحدَه يُقفَل تمامًا.
 *
 * ## ما صار
 *
 * كلُّ دخولٍ كاملٍ ناجح يترك على الجهاز كعكةً موقَّعةً لبريد صاحبها (`<انتهاء>.<معرّف>.<توقيع>`، تسعون يومًا، `HttpOnly`
 * و`Secure` و`SameSite=Strict` و`__Host-`). ومن يحملها لهذا البريد **لا يمرّ بالقاطع العامّ ولا بشبكة `/48` ولا بسقف
 * الحساب**: حصّةُ مصدره وحصّتُه هو. فالمهاجمُ المجهولُ يُقفل نفسَه ومن لم يدخل قطّ — **لا المالكَ على هاتفه**.
 *
 * ولا تفتح الكعكةُ شيئًا وحدَها: لا جلسةَ ولا عاملَ — تُعفي من حدٍّ لا من سؤال. ولا تحمل البريدَ نفسَه: يُعاد حسابُ
 * توقيعها على البريد المكتوب في النموذج، فلا يُقرأ منها لمن هي. ولا صفَّ لها في القاعدة.
 */
import { normalizeEmail } from '../ownerEmail'
import { readCookie } from '../session'
import { randomToken } from './digest'
import { macMatches, macOf, signingSecret } from './signed'

export const DEVICE_COOKIE = '__Host-sada_device'
/** تسعون يومًا: جهازٌ لم يدخل منه صاحبُه ثلاثة أشهرٍ يعود مجهولًا. */
export const DEVICE_TTL_SECONDS = 90 * 24 * 60 * 60

const PURPOSE = 'sada-device'

/** ترويسةُ `Set-Cookie` لجهازٍ دخل صاحبُه للتوّ دخولًا كاملًا — أو `null` على بيئةٍ بلا سرّ. */
export async function deviceCookie(adminToken: string | undefined, email: string, now = Date.now()): Promise<string | null> {
  const secret = signingSecret(adminToken)
  if (secret === null) return null
  const exp = String(Math.floor(now / 1000) + DEVICE_TTL_SECONDS)
  const id = randomToken(12)
  const mac = await macOf(secret, PURPOSE, [normalizeEmail(email), exp, id])
  return [`${DEVICE_COOKIE}=${exp}.${id}.${mac}`, 'Path=/', 'HttpOnly', 'Secure', 'SameSite=Strict', `Max-Age=${DEVICE_TTL_SECONDS}`].join('; ')
}

/**
 * معرّفُ الجهاز إن كان موثوقًا **لهذا البريد**، وإلّا `null` — كعكةٌ غائبة، أو منتهية، أو لبريدٍ آخر، أو مزوَّرة.
 */
export async function trustedDevice(
  request: Request, adminToken: string | undefined, email: string, now = Date.now(),
): Promise<string | null> {
  const secret = signingSecret(adminToken)
  if (secret === null) return null
  const raw = readCookie(request.headers.get('Cookie'), DEVICE_COOKIE)
  if (raw === null) return null
  const [exp = '', id = '', mac = '', ...rest] = raw.split('.')
  if (rest.length > 0 || !/^\d{1,12}$/.test(exp) || !/^[0-9a-f]{24}$/.test(id)) return null
  if (Number(exp) * 1000 <= now) return null
  return (await macMatches(secret, PURPOSE, [normalizeEmail(email), exp, id], mac)) ? id : null
}

/** يضيف كعكةَ الجهاز إلى ردٍّ يفتح جلسةً كاملة — بعد كعكة الجلسة لا بدلها. */
export async function withDevice(headers: Headers, adminToken: string | undefined, email: string): Promise<Headers> {
  const cookie = await deviceCookie(adminToken, email)
  if (cookie !== null) headers.append('Set-Cookie', cookie)
  return headers
}

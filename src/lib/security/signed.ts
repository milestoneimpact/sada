/**
 * **ما يحمله المتصفّحُ موقَّعًا لا مخزَّنًا عندنا** (مراجعة D-317) — توقيعُ HMAC-SHA256 بسرّ الخادم.
 *
 * تحدّي الدخول بمفتاح المرور كان كتابةً في KV لكلّ طالبٍ مجهول، فاحتاج سقفًا عامًّا يملؤه مجهولٌ فيُغلق المفتاحَ على
 * الجميع؛ وكعكةُ الجهاز الموثوق تحتاج ما يُثبت أنّ صدى كتبها لهذا البريد. والجوابُ واحد: قيمةٌ يحملها المتصفّح ومعها
 * توقيعُها، **فلا صفَّ يُكتب ولا سقفَ يُملأ**، ولا يُزوِّرها من لا يملك السرّ.
 *
 * والسرُّ `ADMIN_TOKEN` — بصمةُ الاعتماد التي تُربط بها الجلسات: تدويرُه يُبطل التحدّياتِ والأجهزةَ الموثوقةَ مع الجلسات،
 * فيبقى المفتاحَ الواحد الذي يُغلق كلَّ الأبواب دفعةً. و`purpose` يفصل الاستعمالين: توقيعُ تحدٍّ لا يصلح كعكةَ جهاز.
 */
import { toBase64Url } from './bytes'
import { sameSecret } from './digest'

/** السرُّ مقصوصًا، أو `null` حين لا سرّ: لا توقيعَ على بيئةٍ مقفلة (الغيابُ يُغلق لا يفتح). */
export function signingSecret(adminToken: string | undefined): string | null {
  const secret = typeof adminToken === 'string' ? adminToken.trim() : ''
  return secret.length === 0 ? null : secret
}

/** توقيعُ الأجزاء لغرضٍ بعينه — base64url. */
export async function macOf(secret: string, purpose: string, parts: readonly string[]): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode([purpose, ...parts].join('|')))
  return toBase64Url(new Uint8Array(sig))
}

/** يطابق التوقيعَ بزمنٍ ثابت. */
export async function macMatches(secret: string, purpose: string, parts: readonly string[], presented: string): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(presented)) return false
  return await sameSecret(await macOf(secret, purpose, parts), presented)
}

/**
 * **تحدّي الدخول بمفتاح المرور بلا حالة** (مراجعة D-317).
 *
 * ## ما كان
 *
 * كلُّ تحدٍّ لمجهولٍ كتابةٌ في KV تُدفَع، فاحتاج سقفًا للعنوان وقاطعًا عامًّا (ثلاثة آلاف في ربع ساعة). والقاطعُ يُعدّ على
 * `/64`، فمئةٌ وخمسون شبكةً من كتلة `/48` واحدة ملأته وردّت تحدّي المالك من عنوانٍ نظيف (429) — **والمفتاحُ هو البابُ الذي
 * قيل إنّه لا يُردّ**.
 *
 * ## ما صار
 *
 * التذكرةُ هي التحدّي نفسُه ومعه انتهاؤه وتوقيعُه (`<تحدٍّ>.<انتهاء>.<توقيع>`): لا كتابةَ عند الإصدار فلا سقفَ يُملأ،
 * ولا يُزوِّرها من لا يملك السرّ. **وتُستهلك مرّةً**: بعد توقيعٍ صحيحٍ وحده يُكتب «استُعملت» في KV حتّى انتهائها —
 * فالكتابةُ بعددِ الدخولات الحقيقيّة لا بعددِ الطالبين، ولا يُعاد توقيعٌ التُقط.
 */
import { CHALLENGE_TTL_SECONDS, newChallenge } from './webauthn'
import { macMatches, macOf, signingSecret } from './signed'

const PURPOSE = 'sada-login-challenge'

/** مفتاحُ «استُعملت» في KV — بالتحدّي نفسِه، ويعيش حتّى انتهاء التذكرة. */
export function usedTicketKey(challenge: string): string {
  return 'webauthn-used:' + challenge
}

/** تذكرةٌ وتحدّيها — أو `null` على بيئةٍ بلا سرّ. */
export async function issueTicket(adminToken: string | undefined, now = Date.now()): Promise<{ ticket: string; challenge: string } | null> {
  const secret = signingSecret(adminToken)
  if (secret === null) return null
  const challenge = newChallenge()
  const exp = String(Math.floor(now / 1000) + CHALLENGE_TTL_SECONDS)
  return { ticket: `${challenge}.${exp}.${await macOf(secret, PURPOSE, [challenge, exp])}`, challenge }
}

/** يفتح التذكرة: التحدّي وكم بقي من عمرها بالثواني، أو `null` إن كانت مزوَّرةً أو منتهية. */
export async function openTicket(
  adminToken: string | undefined, ticket: string, now = Date.now(),
): Promise<{ challenge: string; ttl: number } | null> {
  const secret = signingSecret(adminToken)
  if (secret === null || ticket.length > 200) return null
  const [challenge = '', exp = '', mac = '', ...rest] = ticket.split('.')
  if (rest.length > 0 || !/^[A-Za-z0-9_-]{43}$/.test(challenge) || !/^\d{1,12}$/.test(exp)) return null
  const ttl = Number(exp) - Math.floor(now / 1000)
  if (ttl <= 0 || ttl > CHALLENGE_TTL_SECONDS) return null
  return (await macMatches(secret, PURPOSE, [challenge, exp], mac)) ? { challenge, ttl } : null
}

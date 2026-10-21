/**
 * بريدُ مالك المنصّة — **ثابتٌ في الشيفرة لا إعداد** (D-245).
 *
 * لا مسارَ يكتبه ولا شاشةَ تحذفه: ما يُعدَّل من اللوحة يُعدَّل بجلسةٍ مسروقة
 * أيضا، وبريدُ الدخول هو الباب نفسه. فتبديلُه طلبُ دمجٍ يُراجَع، لا ضغطة.
 * وكانت القيمةُ نفسُها `destination_address` في `wrangler.toml`، ورُفع القيدُ للفريق (D-270): الربطُ يرسل
 * إلى العناوين المُتحقَّق منها في Email Routing وحدها، والشيفرةُ للمالك والمدعوّين وحدهم.
 */
export const OWNER_EMAIL = 'milestonesimpact@gmail.com'

/** يقلّم ويصغّر — فالمقارنةُ لا تفرّق بين حروفٍ كبيرةٍ وصغيرة. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

export function isOwnerEmail(raw: string): boolean {
  return normalizeEmail(raw) === OWNER_EMAIL
}

/**
 * الأدوارُ (D-270) — من الأوسع إلى الأضيق. المالكُ بريدُه في الشيفرة، والباقون مدعوّون في `members`.
 * والترتيبُ في `access.ts` (`ROLE_RANK`): كلُّ دورٍ يملك ما تحته.
 */
export type Role = 'owner' | 'admin' | 'publisher' | 'editor' | 'viewer'

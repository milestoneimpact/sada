/**
 * بريدُ مالك المنصّة — **ثابتٌ في الشيفرة لا إعداد** (D-245).
 *
 * لا مسارَ يكتبه ولا شاشةَ تحذفه: ما يُعدَّل من اللوحة يُعدَّل بجلسةٍ مسروقة
 * أيضا، وبريدُ الدخول هو الباب نفسه. فتبديلُه طلبُ دمجٍ يُراجَع، لا ضغطة.
 * والقيمةُ نفسُها في `destination_address` من `wrangler.toml`، فلا يُرسَل
 * رمزٌ إلى عنوانٍ غيرِه ولو أخطأت الشيفرة.
 */
export const OWNER_EMAIL = 'milestonesimpact@gmail.com'

/** يقلّم ويصغّر — فالمقارنةُ لا تفرّق بين حروفٍ كبيرةٍ وصغيرة. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

export function isOwnerEmail(raw: string): boolean {
  return normalizeEmail(raw) === OWNER_EMAIL
}

/** الأدوارُ — المالكُ وحدَه اليوم، والدعواتُ بأدوارٍ أضيقَ خطوةٌ لاحقة (D-245). */
export type Role = 'owner'

/**
 * من يُرسَل إليه رمزُ الدخول، وبأيّ دور — **السؤالُ في موضعٍ واحد**.
 *
 * اليومَ المالكُ وحدَه. ويومَ تُبنى الدعوات (ناشرٌ، وعميلٌ يقرأ، وموظّفٌ يبني)
 * تُضاف هنا قراءتُها، ولا يُمسّ مسارُ الدخول.
 */
export function canReceiveCode(raw: string): { readonly email: string; readonly role: Role } | null {
  return isOwnerEmail(raw) ? { email: OWNER_EMAIL, role: 'owner' } : null
}

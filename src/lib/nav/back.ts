/**
 * إلى أين يعود الفعل — **من قائمةٍ مغلقة، والخادمُ يبني العنوان** (D-172).
 *
 * كان كلُّ فعلٍ يعود إلى `/panel#posts`، فمن ضغط «اسحبه من الطابور» في صفحة
 * LinkedIn رُمي إلى رأس لوحٍ آخر طولُه آلافُ البكسلات. فيحمل النموذجُ حقلَ
 * `return` بقيمةٍ من هذه القائمة، **ولا يُقبل عنوانٌ حرٌّ أبدا**: حقلٌ يحمل
 * `//evil` أو `https:` يصنع تحويلةً مفتوحةً من صفحةٍ داخل الجلسة.
 */
const PLATFORMS = ['linkedin', 'x', 'youtube', 'tiktok', 'instagram'] as const
// ‏و«setup» لنموذجَي ضبط التطبيق (ر-1): الحفظُ والفحصُ والحذفُ تعود إلى الحقول لا إلى لوح القنوات
const TABS = ['posts', 'waiting', 'setup'] as const

/** قيمةُ الحقل لصفحة منصّةٍ وتبويبها — يكتبها العرضُ ويقرؤها `backTo`. */
export function returnTo(platform: string, tab: (typeof TABS)[number]): string {
  return `platform:${platform}:${tab}`
}

export function backTo(raw: unknown, fallback: string): string {
  const m = /^platform:([a-z]+):([a-z]+)$/.exec(typeof raw === 'string' ? raw : '')
  if (m === null) return fallback
  const platform = m[1]!
  const tab = m[2]!
  if (!(PLATFORMS as readonly string[]).includes(platform) || !(TABS as readonly string[]).includes(tab)) {
    return fallback
  }
  return tab === 'posts' ? `/panel/channels/${platform}#upcoming` : `/panel/channels/${platform}?tab=${tab}`
}

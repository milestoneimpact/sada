/**
 * تصنيفُ ملفّات حزمة المحتوى (D-366) — **دالّةٌ نقيّة: مسارٌ تحت المجلّد ← دورُه ومادّتُه ولونُه ونسختُه وصوتُه**.
 *
 * الحزمةُ مجلّداتٌ مرقّمة: ‎01-plan الخطّة، و‎02-copy النصوص، و‎03-scripts السيناريوهات، و‎04-media المقاطعُ والأغلفة. وما سواها
 * (‎04-media/engine والصوتُ والهويّةُ والأدوات والدليل) أدواتُ صنعٍ لا مادّةٌ للنشر، فيُتجاهل ولا يُنزَّل.
 */
import { isTemplatePath } from '../plan/template'

export type FileRole = 'media' | 'cover' | 'plan' | 'copy' | 'script' | 'ignored'
export type PackageVariant = 'dark' | 'light'

export interface Classified {
  readonly role: FileRole
  readonly itemNo: string | null
  readonly variant: PackageVariant | null
  readonly version: number | null
  readonly hasSound: boolean
}

/** اسمُ الوسيطة المعتمَد: «06-impact-chain-v2-dark-sound-1080x1080.mp4» أو «…-v1-dark-cover.png». */
export const MEDIA_NAME = /^(\d{2})-[a-z-]+-v(\d+)-(dark|light)(-sound)?(-1080x1080\.mp4|-cover\.png)$/

/** غلافٌ عامّ لعدّة موادّ («03-15-overview-v1.png»): يُرى في المكتبة ولا يُربط بمادّة. */
const OVERVIEW = /^\d{2}-\d{2}-overview-v(\d+)\.png$/

/** أدواتُ الصنع داخل ‎04-media. */
const TOOL_DIRS = new Set(['engine', 'audio', 'brand', 'tools', 'fonts'])

const IGNORED: Classified = { role: 'ignored', itemNo: null, variant: null, version: null, hasSound: false }

/** يقطع المجلّدَ الجذر من مسار الشجرة — و`null` لما خارجه. */
export function underRoot(path: string, root: string): string | null {
  const r = root.replace(/^\/+|\/+$/g, '')
  if (r === '') return path
  return path.startsWith(r + '/') ? path.slice(r.length + 1) : null
}

/** نسخةُ الملفّ من «-vN» في اسمه — لاختيار أحدث خطّةٍ أو نصّ. */
function versionOf(name: string): number | null {
  const m = /-v(\d+)(?=[.-])/.exec(name)
  return m === null ? null : Number(m[1])
}

export function classifyPath(rel: string): Classified {
  const parts = rel.split('/').filter((p) => p !== '')
  if (parts.length < 2) return IGNORED
  const top = parts[0]!
  const name = parts[parts.length - 1]!
  // ‏وقالبُ الشهر `plans/YYYY-MM.(md|csv)` خطّةٌ كذلك (D-390) — وملفُّ حاله `.status.json` تكتبه صدى فلا يُقرأ
  if (isTemplatePath(rel)) return { ...IGNORED, role: 'plan' }
  if (top === '01-plan' && parts.length === 2 && /\.xlsx$/i.test(name)) return { ...IGNORED, role: 'plan', version: versionOf(name) }
  if (top === '02-copy' && parts.length === 2 && /\.md$/i.test(name)) return { ...IGNORED, role: 'copy', version: versionOf(name) }
  if (top === '03-scripts' && parts.length === 2 && /\.md$/i.test(name)) {
    return { ...IGNORED, role: 'script', itemNo: /^(\d{2})-/.exec(name)?.[1] ?? null, version: versionOf(name) }
  }
  if (top !== '04-media') return IGNORED
  if (parts.slice(1, -1).some((p) => TOOL_DIRS.has(p))) return IGNORED
  if (parts.length === 2) {
    const o = OVERVIEW.exec(name)
    return o === null ? IGNORED : { role: 'cover', itemNo: null, variant: null, version: Number(o[1]), hasSound: false }
  }
  if (parts.length !== 3) return IGNORED
  const m = MEDIA_NAME.exec(name)
  // ‏والمجلّدُ يبدأ برقم المادّة نفسِه: ملفٌّ وُضع في مجلّد مادّةٍ أخرى لا يُخمَّن
  if (m === null || !parts[1]!.startsWith(m[1]! + '-')) return IGNORED
  return {
    role: m[5]!.endsWith('.mp4') ? 'media' : 'cover',
    itemNo: m[1]!, variant: m[3] as PackageVariant, version: Number(m[2]), hasSound: m[4] !== undefined,
  }
}

/** نوعُ المحتوى لما يُنقل إلى R2. */
export function mimeOf(path: string): string {
  if (/\.mp4$/i.test(path)) return 'video/mp4'
  if (/\.png$/i.test(path)) return 'image/png'
  if (/\.csv$/i.test(path)) return 'text/csv; charset=utf-8'
  if (/\.xlsx$/i.test(path)) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  return 'text/markdown; charset=utf-8'
}

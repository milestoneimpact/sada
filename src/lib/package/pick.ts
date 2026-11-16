/**
 * اختيارُ وسائط الحزمة (D-366) — **دالّةٌ نقيّة: لكلّ مادّةٍ ولكلّ لونٍ مقطعٌ معتمدٌ واحد وغلافُه**.
 *
 * الترتيبُ: ما فيه «-sound» أوّلًا (هو المعتمد في دليل الحزمة)، ثمّ أعلى نسخة. والغلافُ أعلى نسخةٍ للّون نفسِه ولو كان أقدمَ من
 * المقطع (المادّة 06: المقطعُ v2 بالصوت والغلافُ v1). وما سوى المعتمد يبقى «مستبدَلًا» يُعرض مطويًّا ولا يُختار.
 */
import { isVideoPlatform } from '../media/uploads'
import { isVideoTarget, videoMisfit } from '../publish/video'
import type { PackageVariant } from './classify'

export interface PackageFile {
  readonly path: string
  readonly blobSha: string
  readonly size: number
  readonly role: 'media' | 'cover'
  readonly itemNo: string | null
  readonly variant: PackageVariant | null
  readonly version: number
  readonly hasSound: boolean
  readonly r2Key: string | null
}

export interface PackagePick {
  readonly itemNo: string
  readonly variant: PackageVariant
  readonly video: PackageFile | null
  readonly cover: PackageFile | null
  /** النسخُ التي حلّ المعتمدُ محلّها — مقاطعُ وأغلفة. */
  readonly superseded: readonly PackageFile[]
}

const rank = (a: PackageFile, b: PackageFile): number =>
  Number(b.hasSound) - Number(a.hasSound) || b.version - a.version || a.path.localeCompare(b.path)

export function pickMedia(files: readonly PackageFile[]): PackagePick[] {
  const groups = new Map<string, PackageFile[]>()
  for (const f of files) {
    if (f.itemNo === null || f.variant === null) continue
    const k = f.itemNo + '|' + f.variant
    groups.set(k, [...(groups.get(k) ?? []), f])
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, list]) => {
    const [itemNo, variant] = k.split('|') as [string, PackageVariant]
    const videos = list.filter((f) => f.role === 'media').sort(rank)
    const covers = list.filter((f) => f.role === 'cover').sort(rank)
    return {
      itemNo, variant, video: videos[0] ?? null, cover: covers[0] ?? null,
      superseded: [...videos.slice(1), ...covers.slice(1)],
    }
  })
}

/** اللونُ الافتراضيّ لكلّ منصّة: داكنٌ لـ X، وفاتحٌ لـ LinkedIn، وداكنٌ لما سواهما. */
export function defaultVariant(platform: string): PackageVariant {
  return platform === 'linkedin' ? 'light' : 'dark'
}

/**
 * مرجعُ المكتبة (`g:<sha>`) لصفٍّ في الخطّة ولماذا اختير: **المقطعُ حيث تنشر صدى المقطع** — منصّاتُ المقاطع (`isVideoPlatform`)
 * ‏وX وLinkedIn منذ D-374 — **والغلافُ بديلٌ** حين لا يوافق المقطعُ حدودَ المنصّة (`videoMisfit`)، وسببُه في `note` يُعرض.
 * وما لم يُنقل إلى R2 بعد لا يُربط، واللونُ من التلميح إن سمّى واحدًا.
 */
export function packageMediaFor(
  picks: readonly PackagePick[], itemNo: string, platform: string, variant: PackageVariant | null,
): { readonly ref: string | null; readonly note: string | null } {
  const want = variant ?? defaultVariant(platform)
  const own = picks.filter((p) => p.itemNo === itemNo)
  const pick = own.find((p) => p.variant === want) ?? own[0]
  if (pick === undefined) return { ref: null, note: null }
  const ref = (f: PackageFile | null): string | null => (f === null || f.r2Key === null ? null : 'g:' + f.blobSha)
  if (isVideoPlatform(platform)) return { ref: ref(pick.video), note: null }
  if (isVideoTarget(platform) && pick.video !== null && pick.video.r2Key !== null) {
    const misfit = videoMisfit(platform, pick.video.size)
    if (misfit === null) return { ref: ref(pick.video), note: null }
    const cover = ref(pick.cover)
    return { ref: cover, note: `${misfit} — ${cover === null ? 'ولا غلاف بديل' : 'أُلحق الغلافُ بدلَه'}` }
  }
  return { ref: ref(pick.cover), note: null }
}

export function packageRefFor(picks: readonly PackagePick[], itemNo: string, platform: string, variant: PackageVariant | null): string | null {
  return packageMediaFor(picks, itemNo, platform, variant).ref
}

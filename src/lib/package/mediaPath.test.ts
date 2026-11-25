/**
 * مطابقةُ وسيطة الحزمة بالمسار (D-394): صفٌّ يكتب مسارَ صورةٍ أو مقطعٍ في «الملف» يُربط بذلك الملفّ بعينه،
 * ورقمُ المادّة احتياطٌ، و«من حزمتك» أوّلًا في منتقي المكتبة.
 */
import { describe, expect, it } from 'vitest'
import { PACKAGE_PATHS } from '../../test/packageTree'
import { classifyPath, underRoot } from './classify'
import { packageFileByPath, pickMedia, planMediaFor, type PackageFile } from './pick'
import { readPlan, type PlanFacts } from '../plan/import'
import { snapshot } from './diff'
import { packageAssets } from '../library'
import { libraryScreen } from '../../routes/ui/libraryView'

const sha = (s: string): string => {
  let h = 0
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return h.toString(16).padStart(8, '0').repeat(5)
}
const files = (): PackageFile[] => PACKAGE_PATHS.flatMap((p) => {
  const rel = underRoot(p, 'social-media')!
  const c = classifyPath(rel)
  if (c.role !== 'media' && c.role !== 'cover') return []
  return [{ path: rel, blobSha: sha(p), size: c.role === 'media' ? 1_048_576 : 1, role: c.role, itemNo: c.itemNo, variant: c.variant, version: c.version ?? 0, hasSound: c.hasSound, r2Key: 'k' }]
})
const picks = pickMedia(files())
const ref = (path: string): string => 'g:' + sha('social-media/' + path)

describe('المطابقةُ بالمسار', () => {
  it('المسارُ كاملًا، أو آخرُه، أو اسمُ الملفّ — والشرطةُ المائلة العكسيّة و«./» سواء', () => {
    const full = '04-media/06-impact-chain/06-impact-chain-v1-light-cover.png'
    expect(packageFileByPath(picks, full)?.file.path).toBe(full)
    expect(packageFileByPath(picks, 'social-media/' + full)?.file.path).toBe(full)
    expect(packageFileByPath(picks, '06-impact-chain/06-impact-chain-v1-light-cover.png')?.file.path).toBe(full)
    expect(packageFileByPath(picks, '06-IMPACT-CHAIN-v1-light-cover.png')?.file.path).toBe(full)
    expect(packageFileByPath(picks, '.\\04-media\\06-impact-chain\\06-impact-chain-v1-light-cover.png')?.file.path).toBe(full)
  })

  it('ما ليس مسارَ وسيطة أو لا يطابق شيئًا لا يُربط', () => {
    expect(packageFileByPath(picks, 'داكن')).toBeNull()
    expect(packageFileByPath(picks, 'فيديو')).toBeNull()
    expect(packageFileByPath(picks, 'media/a.png')).toBeNull()
  })

  it('المسارُ يغلب الرقمَ واللون: مقطعٌ فاتحٌ سُمّي لـ X يُربط هو لا الداكنُ الافتراضيّ', () => {
    const light = '04-media/06-impact-chain/06-impact-chain-v2-light-sound-1080x1080.mp4'
    expect(planMediaFor(picks, '06', 'x', light, null)).toEqual({ ref: ref(light), note: null, byPath: true })
    // ‏والنسخةُ المستبدَلة إن سُمّيت بعينها فهي المقصودة
    const old = '04-media/06-impact-chain/06-impact-chain-v1-dark-1080x1080.mp4'
    expect(planMediaFor(picks, null, 'x', old, null).ref).toBe(ref(old))
  })

  it('الرقمُ احتياطٌ حين لا مسار، وبلا رقمٍ ولا مسارٍ لا شيء', () => {
    const byNo = planMediaFor(picks, '06', 'x', 'داكن', 'dark')
    expect(byNo.byPath).toBe(false)
    expect(byNo.ref).toBe(ref('04-media/06-impact-chain/06-impact-chain-v2-dark-sound-1080x1080.mp4'))
    expect(planMediaFor(picks, null, 'x', '', null)).toEqual({ ref: null, note: null, byPath: false })
  })

  it('مقطعٌ لم يُنقل بعد يقول سببه، ومقطعٌ فوق الحدّ يسقط إلى غلافه بسببٍ مكتوب', () => {
    const v = '04-media/06-impact-chain/06-impact-chain-v2-dark-sound-1080x1080.mp4'
    const unmoved = pickMedia(files().map((f) => (f.path === v ? { ...f, r2Key: null } : f)))
    expect(planMediaFor(unmoved, '06', 'x', v, null)).toMatchObject({ ref: null, byPath: true })
    expect(planMediaFor(unmoved, '06', 'x', v, null).note).toContain('لم يُنقل')
    const big = pickMedia(files().map((f) => (f.path === v ? { ...f, size: 600 * 1024 * 1024 } : f)))
    const out = planMediaFor(big, '06', 'x', v, null)
    expect(out.ref).toBe(ref('04-media/06-impact-chain/06-impact-chain-v1-dark-cover.png'))
    expect(out.note).toContain('أُلحق الغلافُ بدلَه')
  })
})

describe('في القارئ واللقطة', () => {
  const facts: PlanFacts = {
    accounts: [{ id: 'a-x', platform: 'x', status: 'active', displayName: 'س', externalId: '1', kind: 'member' } as never],
    uploads: [], now: new Date('2026-11-24T00:00:00Z'), zone: 'Asia/Riyadh', publishable: new Set(['x']), package: picks,
  }
  const cover = '04-media/06-impact-chain/06-impact-chain-v1-light-cover.png'

  it('صفُّ CSV بلا رقم مادّةٍ ومعه مسارُ صورةٍ يُربط بها (القالب D-390)', () => {
    const csv = `المنصة,التاريخ,الساعة,النص,الملف\nx,2026-12-02,20:00,منشورٌ بصورة,${cover}\nx,2026-12-03,20:00,منشورٌ بلا صورة,\n`
    const read = readPlan(csv, facts)
    expect(read.fileProblems).toEqual([])
    expect(read.rows[0]!.packageRef).toBe(ref(cover))
    expect(read.rows[1]!.packageRef).toBeUndefined()
  })

  it('لقطةُ الحزمة تربط بالمسار وتسمّي الملفّ', () => {
    const snap = snapshot({
      plan: { entries: [{ item: 'd02', platform: 'x', date: '2026-12-02', time: '20:00', idea: '', format: '', mediaHint: cover, text: 'ن' }] } as never,
      copy: { items: new Map(), problems: [] } as never, copySha: null, planPath: null, picks, variants: {},
    })
    expect(snap.entries[0]!.media).toBe(ref(cover))
    expect(snap.entries[0]!.mediaName).toBe('06-impact-chain-v1-light-cover.png')
  })
})

describe('«من حزمتك» في منتقي المكتبة', () => {
  const rows = [
    { blobSha: 'b1', itemNo: '06', variant: 'dark', kind: 'image' as const, path: '04-media/06/06-dark-cover.png', bytes: 10, r2Key: 'k', isCurrent: true },
    { blobSha: 'b2', itemNo: '06', variant: 'dark', kind: 'video' as const, path: '04-media/06/06-dark.mp4', bytes: 10, r2Key: 'k', isCurrent: true },
    { blobSha: 'b3', itemNo: '06', variant: 'dark', kind: 'image' as const, path: '04-media/06/06-old.png', bytes: 10, r2Key: 'k', isCurrent: false },
    { blobSha: 'b4', itemNo: '07', variant: 'dark', kind: 'image' as const, path: '04-media/07/07.png', bytes: 10, r2Key: null, isCurrent: true },
  ]
  const base = { assets: [], kind: null, origin: null, pick: null }

  it('المعتمدُ المنقولُ وحده، بمرجع g:', () => {
    expect(packageAssets(rows).map((a) => a.ref)).toEqual(['g:b1', 'g:b2'])
  })

  it('يُعرض أوّلًا لبند الخطّة، وصورًا وحدها لمنشورٍ مكتوب، ولا يُعرض في التصفّح', () => {
    const assets = packageAssets(rows)
    const forItem = libraryScreen({ ...base, pick: { plan: 'p1', index: 0 }, packageAssets: assets })
    expect(forItem).toContain('من حزمتك')
    expect(forItem.indexOf('من حزمتك')).toBeLessThan(forItem.indexOf('id="upload"'))
    expect(forItem).toContain('value="g:b2"')
    const forPost = libraryScreen({ ...base, pickPost: { post: 'post_1', index: 0, w: '' }, packageAssets: assets })
    expect(forPost).toContain('value="g:b1"')
    expect(forPost).not.toContain('value="g:b2"')
    expect(libraryScreen({ ...base, packageAssets: assets })).not.toContain('id="from-package"')
  })
})

/**
 * لقطةُ الحزمة وفرقُها (D-370) — **دالّتان نقيّتان**: اللقطةُ ما فهمته صدى من دفعةٍ واحدة (مادّةٌ × منصّة: الموعدُ والصيغةُ والنصُّ
 * والوسيطة)، والفرقُ بين لقطتين تغييراتٌ على مستوى (مادّة، منصّة): أُضيف، حُذف، نصّ، موعد، صيغة، وسيطة.
 * والدفعةُ نفسُها مرّتين لقطتان متطابقتان، فلا تغيير.
 *
 * **والمفتاحُ يضمّ الشهر** (D-383 المرحلة ٤): `(شهر، مادّة، منصّة)`، و«حُذف» محصورٌ في الأشهر التي في اللقطة الجديدة،
 * فدفعُ ملفّ ديسمبر وحده لا يمسّ شيئًا من نوفمبر.
 */
import { periodOf, type PackagePlan } from './plan'
import type { CopyRead } from './copy'
import { planMediaFor, type PackagePick } from './pick'
import type { PackageVariant } from './classify'

export interface SnapshotEntry {
  readonly item: string
  readonly platform: string
  readonly date: string
  readonly time: string
  readonly format: string
  readonly idea: string
  /** النصُّ الجاهز من 02-copy — و`null` لما لا نصَّ له (يُكتب من فكرته). */
  readonly text: string | null
  readonly media: string | null
  /** اسمُ ملفّ الوسيطة («06-…-v2-dark-sound-1080x1080.mp4») للعرض. */
  readonly mediaName: string | null
  readonly problems: readonly string[]
}

export interface Snapshot {
  readonly entries: readonly SnapshotEntry[]
  readonly copySha: string | null
  readonly planPath: string | null
}

export type ChangeKind = 'added' | 'removed' | 'text' | 'time' | 'format' | 'media'

export interface Change {
  /** «YYYY-MM» من تاريخ البند، والفارغُ لما لا تاريخ له. */
  readonly period?: string
  readonly item: string
  readonly platform: string
  readonly kind: ChangeKind
  readonly before: SnapshotEntry | null
  readonly after: SnapshotEntry | null
}

/** شهرُ البند في المفتاح — والفارغُ لما لا تاريخ له. */
export const entryPeriod = (e: { readonly date?: string }): string => periodOf(e.date ?? '') ?? ''

export const entryKey = (e: { readonly item: string; readonly platform: string; readonly date?: string }): string => entryPeriod(e) + '|' + e.item + '|' + e.platform

export interface SnapshotInput {
  readonly plan: PackagePlan
  readonly copy: CopyRead
  readonly copySha: string | null
  readonly planPath: string | null
  readonly picks: readonly PackagePick[]
  readonly variants: Readonly<Record<string, PackageVariant>>
}

export function snapshot(i: SnapshotInput): Snapshot {
  const nameOf = new Map(i.picks.flatMap((p) => [p.video, p.cover, ...p.superseded]).filter((f) => f !== null).map((f) => ['g:' + f!.blobSha, f!.path.split('/').pop() ?? f!.path]))
  const seen = new Set<string>()
  const entries: SnapshotEntry[] = []
  for (const e of i.plan.entries) {
    if (seen.has(entryKey(e))) continue
    seen.add(entryKey(e))
    const c = i.copy.items.get(e.item)
    const piece = e.platform === 'x' ? c?.x ?? null : e.platform === 'linkedin' ? c?.linkedin ?? null : null
    const hint = /داكن|dark/i.test(e.mediaHint) && !/فاتح|light/i.test(e.mediaHint) ? 'dark' : /فاتح|light/i.test(e.mediaHint) && !/داكن|dark/i.test(e.mediaHint) ? 'light' : null
    const { ref: media, note } = planMediaFor(i.picks, e.item, e.platform, e.mediaHint, hint ?? i.variants[e.platform] ?? null)
    entries.push({
      item: e.item, platform: e.platform, date: e.date, time: e.time, format: e.format, idea: e.idea,
      text: piece !== null && piece.text !== '' ? piece.text : e.text !== undefined && e.text !== '' ? e.text : null, media, mediaName: media === null ? null : nameOf.get(media) ?? null,
      // ‏‏وسببُ الغلاف البديل يُعرض مع مشكلات الصفّ (D-374)
      problems: [...(piece?.problems ?? []), ...(note === null ? [] : [`الوسيطة: ${note}`])],
    })
  }
  entries.sort((a, b) => a.date.slice(0, 7).localeCompare(b.date.slice(0, 7)) || a.item.localeCompare(b.item) || a.platform.localeCompare(b.platform))
  return { entries, copySha: i.copySha, planPath: i.planPath }
}

/** الفرقُ بين لقطتين — والسابقةُ `null` للدفعة الأولى: كلُّ شيءٍ «أُضيف». */
export function diffSnapshots(prev: Snapshot | null, next: Snapshot): Change[] {
  const before = new Map((prev?.entries ?? []).map((e) => [entryKey(e), e]))
  const after = new Map(next.entries.map((e) => [entryKey(e), e]))
  // ‏«حُذف» لا يعبر الشهر: ما في شهرٍ لا صفوفَ له في الدفعة الجديدة يبقى كما هو
  const months = new Set(next.entries.map(entryPeriod))
  const out: Change[] = []
  for (const [k, n] of after) {
    const period = entryPeriod(n)
    const p = before.get(k)
    if (p === undefined) { out.push({ period, item: n.item, platform: n.platform, kind: 'added', before: null, after: n }); continue }
    const push = (kind: ChangeKind): void => { out.push({ period, item: n.item, platform: n.platform, kind, before: p, after: n }) }
    if ((p.text ?? '') !== (n.text ?? '')) push('text')
    if (p.date !== n.date || p.time !== n.time) push('time')
    if (p.format !== n.format) push('format')
    if (p.media !== n.media) push('media')
  }
  for (const [k, p] of before) {
    if (after.has(k) || !months.has(entryPeriod(p))) continue
    out.push({ period: entryPeriod(p), item: p.item, platform: p.platform, kind: 'removed', before: p, after: null })
  }
  return out.sort((a, b) => (a.period ?? '').localeCompare(b.period ?? '') || a.item.localeCompare(b.item) || a.platform.localeCompare(b.platform) || a.kind.localeCompare(b.kind))
}

/**
 * الخطّةُ من نسخةٍ في الحزمة (D-377) — **تُعرض أيُّ نسخةٍ قُرئت، وتُبنى منها الخطّةُ بضغطة، ثمّ يحدّثها كلُّ دفعٍ تالٍ**.
 *
 * لا قراءةَ جديدة ولا تحليلَ ثانٍ: النسخةُ لقطتُها في `package_revisions.snapshot_json` كما فهمتها المراجعة (D-370)، والعرضُ منها،
 * والفرقُ عن الخطّة الحاليّة `diffSnapshots` نفسُه، والبناءُ `decide` و`applyDecisions` أنفسُهما — فالمعتمدُ والمجدولُ لا يُمسّان بصمت.
 * والبناءُ صفُّ مراجعةٍ جديد (`adopted_from`) يصير «آخر ما طُبّق»، فالدفعُ التالي يُحسب منه و«ما تغيّر في حزمتك» يعرضه.
 */
import type { Db } from '../tokens'
import { applyDecisions, decide, packagePosts } from './apply'
import { diffSnapshots, type Change, type Snapshot, type SnapshotEntry } from './diff'
import { countChanges, lastAppliedSnapshot, readRevision, type RevisionRow } from './revision'
import type { PackagePick } from './pick'
import type { PackageVariant } from './classify'
import type { PackageSource } from './sync'
import type { PlanRules } from '../plan/guidelines'

/** ما في اللقطة المحفوظة فوق المدخلات: الإرشاداتُ ومشكلاتُ القراءة. */
export interface StoredSnapshot extends Snapshot {
  readonly rules?: PlanRules | null
  readonly planProblems?: readonly string[]
  readonly unparsed?: readonly string[]
}

export interface PreviewMedia {
  readonly kind: 'video' | 'cover' | 'none'
  readonly name: string | null
  readonly variant: PackageVariant
  /** نُقل إلى R2 فيُرفق؟ */
  readonly ready: boolean
}

export interface PreviewRow extends SnapshotEntry {
  readonly shown: PreviewMedia
}

export interface RevisionPreview {
  readonly revision: RevisionRow
  readonly period: { readonly from: string; readonly to: string } | null
  readonly perPlatform: Readonly<Record<string, number>>
  readonly rows: readonly PreviewRow[]
  readonly missing: number
  readonly rules: PlanRules | null
  readonly problems: readonly string[]
  /** ما يتغيّر في الخطّة الحاليّة لو بُنيت من هذه النسخة. */
  readonly changes: readonly Change[]
}

const VIDEO_FORMAT = /فيديو|مقطع|video|reel/i

/** وسيطةُ الصفّ للعرض: المقطعُ لصيغةٍ فيها «فيديو»، والغلافُ لما سواها — باللون المختار للمنصّة. نقيّة. */
export function previewMedia(picks: readonly PackagePick[], e: Pick<SnapshotEntry, 'item' | 'platform' | 'format'>, variants: Readonly<Record<string, PackageVariant>>): PreviewMedia {
  const variant = variants[e.platform] ?? (e.platform === 'linkedin' ? 'light' : 'dark')
  const own = picks.filter((p) => p.itemNo === e.item)
  const pick = own.find((p) => p.variant === variant) ?? own[0]
  const kind = VIDEO_FORMAT.test(e.format) ? 'video' : 'cover'
  const file = pick === undefined ? null : kind === 'video' ? pick.video ?? pick.cover : pick.cover
  if (file === null) return { kind: 'none', name: null, variant, ready: false }
  return { kind: file === pick?.video ? 'video' : 'cover', name: file.path.split('/').pop() ?? file.path, variant: pick!.variant, ready: file.r2Key !== null }
}

/** لقطةُ نسخةٍ قُرئت — و`null` لنسخةٍ تعذّرت أو لم تُحسب. */
export async function revisionSnapshot(db: Db, org: string, id: string): Promise<StoredSnapshot | null> {
  const r = await db.prepare("SELECT snapshot_json FROM package_revisions WHERE id = ? AND org_id = ? AND status IN ('analysed', 'applied')")
    .bind(id, org).first<{ snapshot_json: string }>().catch(() => null)
  if (r === null) return null
  const s = JSON.parse(r.snapshot_json) as Partial<StoredSnapshot>
  return Array.isArray(s.entries) ? (s as StoredSnapshot) : null
}

/** التصوّرُ الكامل لنسخة: المدّة، وعددُ كلّ منصّة، وكلُّ صفٍّ بنصّه ووسيطته، والإرشادات، وما يختلف عن الخطّة الحاليّة. */
export async function previewRevision(db: Db, org: string, id: string, picks: readonly PackagePick[], variants: Readonly<Record<string, PackageVariant>>): Promise<RevisionPreview | null> {
  const [revision, snap, current] = await Promise.all([readRevision(db, org, id), revisionSnapshot(db, org, id), lastAppliedSnapshot(db, org).catch(() => null)])
  if (revision === null || snap === null) return null
  const dates = snap.entries.map((e) => e.date).filter((d) => d !== '').sort()
  const perPlatform: Record<string, number> = {}
  for (const e of snap.entries) perPlatform[e.platform] = (perPlatform[e.platform] ?? 0) + 1
  const rows = [...snap.entries].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time) || a.platform.localeCompare(b.platform))
    .map((e) => ({ ...e, shown: previewMedia(picks, e, variants) }))
  return {
    revision, rows, perPlatform,
    period: dates.length === 0 ? null : { from: dates[0]!, to: dates[dates.length - 1]! },
    missing: snap.entries.filter((e) => e.text === null).length,
    rules: snap.rules ?? null,
    problems: [...(snap.planProblems ?? []), ...(snap.unparsed ?? []).map((u) => 'لم يُفهم في النصوص: ' + u)],
    changes: diffSnapshots(current, snap),
  }
}

export type AdoptReport =
  | { readonly kind: 'adopted'; readonly id: string; readonly changes: number; readonly awaiting: number }
  | { readonly kind: 'same' }
  | { readonly kind: 'missing' }
  | { readonly kind: 'failed' }

/**
 * «ابنِ الخطّة من هذه النسخة»: الفرقُ عن آخر ما طُبّق يُطبَّق بالسياسة نفسِها في صفّ مراجعةٍ جديد — والنصوصُ والوسائطُ والمواعيدُ معًا.
 * ونسخةٌ مطابقةٌ للحاليّة لا تكتب شيئًا.
 */
export async function adoptRevision(db: Db, source: PackageSource, id: string): Promise<AdoptReport> {
  const org = source.org
  const [revision, snap] = await Promise.all([readRevision(db, org, id), revisionSnapshot(db, org, id)])
  if (revision === null || snap === null) return { kind: 'missing' }
  const changes = diffSnapshots(await lastAppliedSnapshot(db, org), snap)
  if (changes.length === 0) return { kind: 'same' }
  const nid = 'rev_' + crypto.randomUUID().replace(/-/g, '').slice(0, 20)
  // ‏المفتاحُ الفريد (org_id, commit_sha) لالتزامٍ حقيقيّ: صفُّ البناء يحمل التزامَه ولاحقةً لا يطابقها دفعٌ أبدًا
  await db.prepare(
    `INSERT INTO package_revisions (id, org_id, source_id, commit_sha, parent_commit_sha, commit_message, status, snapshot_json, diff_json, summary_counts, attempts, adopted_from, claimed_at)
      VALUES (?, ?, ?, ?, ?, ?, 'analysed', ?, ?, ?, 1, ?, datetime('now'))`,
  ).bind(nid, org, source.id, revision.commit + ':built:' + nid.slice(4, 12), revision.commit, 'بُنيت الخطّة من النسخة ' + revision.commit.slice(0, 7),
    JSON.stringify(snap), JSON.stringify(changes), JSON.stringify(countChanges(changes, 0)), id).run()
  // ‏الصفُّ وتطبيقُه معًا: إن انكسر التطبيقُ صار الصفُّ «تعذّر» بسببه — لا يبقى «محسوبًا» بلا تطبيق فيُحسب منه الدفعُ التالي
  try {
    const out = await applyDecisions({ db, org, revisionId: nid, copySha: snap.copySha }, decide(changes, await packagePosts(db, org)))
    await db.prepare('UPDATE package_revisions SET summary_counts = ? WHERE id = ? AND org_id = ?').bind(JSON.stringify(countChanges(changes, out.awaiting)), nid, org).run()
    return { kind: 'adopted', id: nid, changes: changes.length, awaiting: out.awaiting }
  } catch {
    await db.prepare("UPDATE package_revisions SET status = 'failed', error_reason = ?, retryable = 0 WHERE id = ? AND org_id = ? AND status <> 'applied'")
      .bind('تعذّر بناءُ الخطّة من هذه النسخة — لم يُطبَّق شيءٌ منها', nid, org).run().catch(() => undefined)
    return { kind: 'failed' }
  }
}

/** «تابع التحديث تلقائيًّا» — يُحفظ على المصدر. */
export async function setFollow(db: Db, org: string, sourceId: string, follow: boolean): Promise<void> {
  await db.prepare('UPDATE package_sources SET follow_updates = ? WHERE id = ? AND org_id = ?').bind(follow ? 1 : 0, sourceId, org).run()
}

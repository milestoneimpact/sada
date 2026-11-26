/**
 * **إصدارا خطّةٍ متجاوران** (D-406): كلُّ استيرادٍ يحفظ صورةَ الإصدار السابق في `plan_versions` (D-404)، وهنا تُقرأ الصورُ
 * والإصدارُ القائم، ويُحسب الفرقُ بين اثنين بـ`diffSnapshots` نفسِها التي تحسب فرقَ الحزمة (D-370) — لا فرقٌ ثانٍ.
 *
 * والمفتاحُ موعدُ البند (يومُه وساعتُه بتوقيت المالك) ومنصّتُه: `sourceId` في الملفّ «import:<سطر>» يتزحزح بحذف صفّ،
 * فلا يصلح مفتاحًا. فالنصُّ المعدَّل في موعده «النصّ عُدّل»، والموعدُ المنقولُ حذفٌ وإضافة.
 */
import type { Db } from '../tokens'
import type { PlanItem } from './prompt'
import { diffSnapshots, entryKey, entryPeriod, type Change, type Snapshot, type SnapshotEntry } from '../package/diff'

export interface PlanVersion {
  readonly version: number
  /** القائمُ في `plans`، لا صورةٌ محفوظة. */
  readonly current: boolean
  readonly at: string
  readonly items: readonly PlanItem[]
}

const itemsOf = (json: string): PlanItem[] => {
  try { return (JSON.parse(json) as { items?: PlanItem[] }).items ?? [] } catch { return [] }
}

/** إصداراتُ الخطّة من الأقدم إلى القائم — وخطّةٌ لمنظّمةٍ أخرى لا تُقرأ. */
export async function readPlanVersions(db: Db, org: string, planId: string): Promise<PlanVersion[]> {
  const plan = await db.prepare('SELECT version, plan_json, created_at FROM plans WHERE id = ? AND org_id = ?')
    .bind(planId, org).first<{ version: number; plan_json: string; created_at: string }>().catch(() => null)
  if (plan === null) return []
  const { results } = await db.prepare('SELECT version, plan_json, locked_at FROM plan_versions WHERE org_id = ? AND plan_id = ? AND version < ? ORDER BY version')
    .bind(org, planId, plan.version).all<{ version: number; plan_json: string; locked_at: string }>()
    .catch(() => ({ results: [] as { version: number; plan_json: string; locked_at: string }[] }))
  return [
    ...results.map((r) => ({ version: Number(r.version), current: false, at: r.locked_at, items: itemsOf(r.plan_json) })),
    { version: Number(plan.version), current: true, at: plan.created_at, items: itemsOf(plan.plan_json) },
  ]
}

/** لقطةُ إصدارٍ بشكل لقطة الحزمة: المادّةُ موعدُ البند، وبندان في الموعد والمنصّة نفسِهما يفترقان بترتيبهما. */
export function versionSnapshot(items: readonly PlanItem[]): Snapshot {
  const seen = new Map<string, number>()
  const entries: SnapshotEntry[] = items.map((i) => {
    const slot = i.day + ' ' + i.time
    const k = slot + '|' + i.platform
    const n = (seen.get(k) ?? 0) + 1
    seen.set(k, n)
    return {
      item: n === 1 ? slot : slot + ' #' + String(n), platform: i.platform, date: i.day, time: i.time, format: i.kind ?? 'text',
      idea: i.angle, text: i.angle, media: i.asset ?? null, mediaName: i.asset ?? null, problems: [],
    }
  })
  return { entries, copySha: null, planPath: null }
}

/**
 * الفرقُ من الإصدار `a` إلى `b`. وقاعدةُ `diffSnapshots` «حُذف لا يعبر الشهر» تلائم دفعاتِ الحزمة الجزئيّة، أمّا الإصدارُ
 * فصورةٌ كاملة (D-407): فما في `a` وليس في `b` محذوفٌ ولو خلا شهرُه في `b` كلّه — وإلّا قالت الشاشة «متطابقان» وقد حُذف كلُّ شيء.
 */
export function diffVersions(a: PlanVersion, b: PlanVersion): Change[] {
  const before = versionSnapshot(a.items)
  const after = versionSnapshot(b.items)
  const out = diffSnapshots(before, after)
  const kept = new Set(after.entries.map(entryKey))
  const months = new Set(after.entries.map(entryPeriod))
  for (const p of before.entries) {
    if (kept.has(entryKey(p)) || months.has(entryPeriod(p))) continue
    out.push({ period: entryPeriod(p), item: p.item, platform: p.platform, kind: 'removed', before: p, after: null })
  }
  return out.sort((x, y) => (x.period ?? '').localeCompare(y.period ?? '') || x.item.localeCompare(y.item) || x.platform.localeCompare(y.platform) || x.kind.localeCompare(y.kind))
}

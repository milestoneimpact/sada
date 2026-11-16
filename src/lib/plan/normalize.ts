/**
 * **المُطبِّعُ الواحد** (D-383 المرحلة ٣): صفوفُ أيّ مصدرٍ (CSV · Excel · نصّ · معالج) تصير بنودًا بمفتاحٍ وبصمةٍ وموعدٍ
 * محلّيّ، وللاستيراد كلِّه بصمةٌ واحدة وشهرٌ من تواريخه.
 *
 * - **مفتاحُ البند** هو `rowKey` نفسُه (D-181): الموعدُ كما فُهم بلا صيغة كتابته، والمنصّةُ، والنصُّ مطبَّعًا. فملفٌّ أعاد Excel
 *   حفظَ تواريخه بصيغةٍ أخرى بنودُه هي هي.
 * - **بصمةُ الاستيراد** SHA-256 لمفاتيح البنود مرتّبةً مع نوع التسكين (مسوّدةٌ أو فكرة): ترتيبُ السطور لا يغيّرها، وتغييرُ حرفٍ
 *   في نصٍّ يغيّرها. والبصمةُ نفسُها من المصدر نفسِه تعني «لا تغيير» (`import_jobs` فريدٌ عليها).
 * - **الشهرُ من التواريخ** (`YYYY-MM` من الموعد المحلّيّ)، لا من اسم الملفّ ولا من رقم نسخته.
 */
import { localParts } from '../time/zone'
import { rowKey, type PlanRow } from './import'

export type ImportSourceKind = 'github' | 'csv' | 'text' | 'wizard'

export interface NormalizedItem {
  readonly row: PlanRow
  /** مفتاحُ البند في `plan_items` وفي `posts.idempotency_key` (D-004). */
  readonly key: string
  /** «YYYY-MM-DD HH:MM» بمنطقة الصفّ. */
  readonly dueLocal: string
  readonly period: string
}

export interface NormalizedImport {
  readonly items: readonly NormalizedItem[]
  readonly contentHash: string
  /** الأشهرُ التي تقع فيها البنود، مرتّبة. */
  readonly periods: readonly string[]
}

const pad = (n: number): string => String(n).padStart(2, '0')

/** الموعدُ المحلّيّ للصفّ: كما فُهم من الملفّ، وإلّا من لحظته بمنطقته. */
export function dueLocalOf(row: PlanRow): string | null {
  if (row.local !== null) return row.local
  if (row.whenUtc === null) return null
  const l = localParts(new Date(row.whenUtc + ':00Z'), row.zone === '' ? null : row.zone)
  return `${String(l.year)}-${pad(l.month)}-${pad(l.day)} ${pad(l.hour)}:${pad(l.minute)}`
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** صفوفٌ سليمةٌ (لها موعدٌ ومنصّة) ← بنودٌ مطبَّعة وبصمةُ الاستيراد. */
export async function normalizeImport(rows: readonly PlanRow[], mode: 'draft' | 'idea'): Promise<NormalizedImport> {
  const items: NormalizedItem[] = []
  for (const row of rows) {
    const dueLocal = dueLocalOf(row)
    if (dueLocal === null) continue
    items.push({ row, key: await rowKey(row), dueLocal, period: dueLocal.slice(0, 7) })
  }
  const contentHash = await sha256Hex([mode, ...items.map((i) => i.key).sort()].join('\n'))
  const periods = [...new Set(items.map((i) => i.period))].sort()
  return { items, contentHash, periods }
}

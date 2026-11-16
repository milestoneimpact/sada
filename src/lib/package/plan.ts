/**
 * خطّةُ الحزمة من `01-plan/*.xlsx` (D-368) — **تُقرأ أصيلًا بلا كلفة، ثمّ تمرّ من قارئ الخطّة الموجود**.
 *
 * الورقةُ «خطة الشهر» تُحوَّل CSV وتُفرَد بـ `widenPlan` (صفٌّ لكلّ منصّةٍ لها صيغةٌ في يومها)، والورقةُ «الإرشادات» بـ
 * `readGuidelines`. وتاريخُ Excel التسلسليُّ ووقتُه الكسريّ يُحوَّلان قبلها. وإن كان في المجلّد أكثرُ من ملفّ يُختار الأعلى vN.
 */
import { parseCsvRecords } from '../plan/import'
import { widenPlan } from '../plan/widen'
import { readGuidelines, type PlanRules } from '../plan/guidelines'
import { excelDate, excelTime, readXlsx, type Sheet } from './xlsx'

export interface PlanEntry {
  readonly item: string
  readonly platform: string
  readonly date: string
  readonly time: string
  readonly idea: string
  readonly format: string
  readonly mediaHint: string
}

export interface PackagePlan {
  readonly entries: readonly PlanEntry[]
  readonly rules: PlanRules | null
  /** عددُ أيّام الورقة (صفوفٌ بفكرة). */
  readonly days: number
  readonly columns: readonly string[]
  readonly problems: readonly string[]
}

const quote = (v: string): string => (/[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v)
export const toCsv = (rows: readonly (readonly string[])[]): string => rows.map((r) => r.map(quote).join(',')).join('\n')

/** أعلى نسخةٍ بين ملفّات الخطّة («…-v2.xlsx» قبل «…-v1.xlsx»)، و`null` إن خلا المجلّد. */
export function choosePlanFile(paths: readonly string[]): string | null {
  const ver = (p: string): number => Number(/-v(\d+)\.xlsx$/i.exec(p)?.[1] ?? 0)
  const xs = paths.filter((p) => /^01-plan\/[^/]+\.xlsx$/i.test(p)).sort((a, b) => ver(b) - ver(a) || a.localeCompare(b))
  return xs[0] ?? null
}

/** «X» ← x، «LinkedIn» ← linkedin — وما سواهما بحروفه الصغيرة. */
export function platformKey(name: string): string {
  const n = name.trim().toLowerCase()
  if (/^(x|twitter|إكس|اكس|تويتر)$/.test(n)) return 'x'
  if (/^(linkedin|لينكدإن|لينكد إن)$/.test(n)) return 'linkedin'
  return n
}

/** «8:00 م» ← «20:00»، و«9:00 ص» ← «09:00» — والوقتُ الذي لا يُفهم يبقى كما كُتب. */
export function clock(v: string): string {
  const m = /^(\d{1,2})[:.](\d{2})\s*(ص|م|صباحًا|صباحا|مساءً|مساء|am|pm)?$/i.exec(v.trim())
  if (m === null) return v.trim()
  let h = Number(m[1])
  const pm = m[3] !== undefined && /^(م|مساء|pm)/i.test(m[3])
  const am = m[3] !== undefined && !pm
  if (pm && h < 12) h += 12
  if (am && h === 12) h = 0
  return String(h).padStart(2, '0') + ':' + m[2]
}

const DATE_HEAD = /^(التاريخ|date|day)$/i
const TIME_HEAD = /[:：]\s*(الوقت|الساعة|time)$/i

/** يحوّل ورقةَ الخطّة إلى منشورات (مادّة × منصّة). نقيّةٌ على الأوراق، والاختبارُ يمرّر الملفّ الحقيقيّ. */
export function planFromSheets(sheets: readonly Sheet[]): PackagePlan {
  const plan = sheets.find((s) => /خطة|خطّة|plan/i.test(s.name)) ?? sheets[0]
  const guide = sheets.find((s) => /الإرشادات|ارشادات|guidelines/i.test(s.name))
  if (plan === undefined || plan.rows.length < 2) return { entries: [], rules: null, days: 0, columns: [], problems: ['ورقة الخطّة فارغة'] }
  const head = plan.rows[0]!.map((h) => h.trim())
  const fixed = plan.rows.map((r, i) => i === 0 ? r : r.map((v, c) => DATE_HEAD.test(head[c] ?? '') ? excelDate(v) : TIME_HEAD.test(head[c] ?? '') ? excelTime(v) : v))
  const wide = widenPlan(toCsv(fixed))
  const problems: string[] = []
  if (!wide.widened) problems.push('لم أجد أعمدة «X: الصيغة» و«X: الوقت» في ورقة الخطّة')
  const recs = parseCsvRecords(wide.csv)
  const h = recs[0]?.cells ?? []
  const at = (cells: readonly string[], name: string): string => (cells[h.indexOf(name)] ?? '').trim()
  const entries: PlanEntry[] = []
  for (const { cells } of recs.slice(1)) {
    const item = at(cells, 'رقم المادة')
    if (!/^\d{1,2}$/.test(item)) continue
    entries.push({
      item: item.padStart(2, '0'), platform: platformKey(at(cells, 'المنصة')), date: at(cells, 'التاريخ'), time: clock(at(cells, 'الوقت')),
      idea: at(cells, 'النص').replace(/\s*\(الصيغة: [\s\S]*$/, ''), format: at(cells, 'الشكل'), mediaHint: at(cells, 'الملف'),
    })
  }
  const days = plan.rows.slice(1).filter((r) => r.some((v) => v.trim() !== '')).length
  const rules = guide === undefined ? null : readGuidelines(toCsv(guide.rows))
  return { entries, rules, days, columns: head.filter((x) => x !== ''), problems }
}

export async function readPackagePlan(bytes: Uint8Array): Promise<PackagePlan> {
  try {
    return planFromSheets(await readXlsx(bytes))
  } catch (e) {
    return { entries: [], rules: null, days: 0, columns: [], problems: [e instanceof Error ? e.message : 'تعذّرت قراءة ملفّ الخطّة'] }
  }
}

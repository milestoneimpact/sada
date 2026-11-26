/**
 * خطّةُ الحزمة من `01-plan/*.xlsx` (D-368) — **تُقرأ أصيلًا بلا كلفة، ثمّ تمرّ من قارئ الخطّة الموجود**.
 *
 * الورقةُ «خطة الشهر» تُحوَّل CSV وتُفرَد بـ `widenPlan` (صفٌّ لكلّ منصّةٍ لها صيغةٌ في يومها)، والورقةُ «الإرشادات» بـ
 * `readGuidelines`. وتاريخُ Excel التسلسليُّ ووقتُه الكسريّ يُحوَّلان قبلها.
 *
 * **كلُّ ملفٍّ في `01-plan/` يُقرأ** (D-383 المرحلة ٤): الشهرُ من تواريخ صفوفه لا من اسمه، و`vN` يحسم بين ملفّات الشهر
 * نفسِه وحدها. فملفّا نوفمبر وديسمبر يتعايشان، والملفُّ الممتدّ على شهرين يعطي كلَّ شهرٍ صفوفَه.
 */
import { parseCsvRecords } from '../plan/import'
import { widenPlan } from '../plan/widen'
import { readGuidelines, type PlanRules } from '../plan/guidelines'
import { excelDate, excelTime, readXlsx, type Sheet } from './xlsx'
import { issueText, readTemplate, TEMPLATE_HEADER, templatePeriod } from '../plan/template'

export interface PlanEntry {
  readonly item: string
  readonly platform: string
  readonly date: string
  readonly time: string
  readonly idea: string
  readonly format: string
  readonly mediaHint: string
  /** النصُّ الجاهز من قالب `plans/YYYY-MM` (D-390) — وخطّةُ xlsx بلا نصّ (نصُّها من 02-copy). */
  readonly text?: string
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

/** رقمُ النسخة في الاسم («…-v3.xlsx» ← 3)، و0 لما لا رقم له. */
/** وقالبُ `plans/YYYY-MM` (D-390) يغلب xlsx شهرِه، و`.md` يغلب `.csv`: هو الصيغةُ القياسيّة التي قرّرها المالك. */
export const planVersion = (p: string): number =>
  /^plans\/[^/]+\.md$/i.test(p) ? 1_000_001 : /^plans\/[^/]+\.csv$/i.test(p) ? 1_000_000 : Number(/-v(\d+)\.xlsx$/i.exec(p)?.[1] ?? 0)

/** كلُّ ملفّات الخطّة في `01-plan/` وقوالبُ `plans/YYYY-MM.(md|csv)`، الأعلى نسخةً أوّلًا. */
export function planFiles(paths: readonly string[]): string[] {
  return paths.filter((p) => /^01-plan\/[^/]+\.xlsx$/i.test(p) || templatePeriod(p) !== null).sort((a, b) => planVersion(b) - planVersion(a) || a.localeCompare(b))
}

/** شهرُ الصفّ «YYYY-MM» من تاريخه، و`null` لصفٍّ بلا تاريخٍ مفهوم. */
export function periodOf(date: string): string | null {
  return /^(\d{4}-[01]\d)-[0-3]\d$/.exec(date.trim())?.[1] ?? null
}

export interface MonthPlans {
  /** منشوراتُ كلّ الأشهر معًا، ولكلّ شهرٍ صفوفُ أعلى ملفّاته نسخةً. */
  readonly plan: PackagePlan
  /** الشهرُ ← الملفُّ الذي غلب فيه. */
  readonly files: Readonly<Record<string, string>>
  readonly periods: readonly string[]
}

/**
 * يجمع ملفّاتِ الخطّة أشهرًا: لكلّ شهرٍ صفوفُ الملفّ الأعلى `vN` بين ما فيه صفوفٌ لذلك الشهر، ولا يمسّ ملفُّ شهرٍ شهرًا غيرَه.
 * والصفُّ بلا تاريخٍ يُسقط بتحذير. والإرشاداتُ من الأعلى نسخةً بين ما فيه إرشادات.
 */
export function mergeMonthPlans(read: readonly { readonly path: string; readonly plan: PackagePlan }[]): MonthPlans {
  const ordered = [...read].sort((a, b) => planVersion(b.path) - planVersion(a.path) || a.path.localeCompare(b.path))
  const owner = new Map<string, string>()
  const problems: string[] = []
  for (const r of ordered) {
    let undated = 0
    for (const e of r.plan.entries) {
      const m = periodOf(e.date)
      if (m === null) { undated += 1; continue }
      if (!owner.has(m)) owner.set(m, r.path)
    }
    if (undated > 0) problems.push(`${r.path.split('/').pop()}: ${undated} صفًّا بلا تاريخٍ مفهوم لم تُقرأ`)
    for (const p of r.plan.problems) problems.push(read.length > 1 ? `${r.path.split('/').pop()}: ${p}` : p)
  }
  const entries: PlanEntry[] = []
  for (const r of ordered) for (const e of r.plan.entries) { const m = periodOf(e.date); if (m !== null && owner.get(m) === r.path) entries.push(e) }
  const winners = new Set(owner.values())
  const used = ordered.filter((r) => winners.has(r.path))
  const rules = ordered.find((r) => r.plan.rules !== null)?.plan.rules ?? null
  const periods = [...owner.keys()].sort()
  return {
    plan: {
      entries, rules, days: used.reduce((n, r) => n + r.plan.days, 0),
      columns: [...new Set(used.flatMap((r) => r.plan.columns))], problems: read.length === 0 ? ['لا ملفّ خطّة في 01-plan'] : problems,
    },
    files: Object.fromEntries(owner), periods,
  }
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

/**
 * القالبُ خطّةَ حزمة: مفتاحُ البند `dDD` (والثاني لليوم والمنصّة نفسَيهما `dDD-2`) لا رقمَ مادّة، فلا يُطابَق بوسيطة مادّةٍ أخرى،
 * والنصُّ من العمود نفسِه (يغلبه نصُّ 02-copy إن وُجد بالمفتاح نفسِه، ولن يوجد). والأخطاءُ مشكلاتُ الخطّة بسطرها وعمودها.
 */
/** ‏سببُ ردّ سطر الصفحة في مسار الحزمة (مراجعة D-422). */
export const PAGE_PACKAGE_REFUSAL = 'صفحة LinkedIn (linkedin-page) لا تُجدوَل من حزمة المستودع بعد، فتُرك السطر ولم يُنشر على حسابك الشخصيّ — جدوِله على الصفحة من المحرّر أو استورده «من ملفّ».'

export function planFromTemplate(text: string, path: string): PackagePlan {
  const format = /\.csv$/i.test(path) ? 'csv' : 'md'
  const read = readTemplate(text, format, templatePeriod(path))
  const count = new Map<string, number>()
  // ‏**وسطرُ `linkedin-page` يُردّ في مسار الحزمة ولا يُحوَّل** (مراجعة D-422): كان يصير بندَ LinkedIn فيُنشر على الحساب الشخصيّ،
  // ‏وخطّةٌ بالسطرين تنشره عليه مرّتين. فيُترك بسببٍ في تقرير الحزمة، والصفحةُ تُجدوَل من المحرّر أو بـ«من ملفّ»
  const pageRows = read.rows.filter((r) => r.platform === 'linkedin-page')
  const entries: PlanEntry[] = read.rows.filter((r) => r.platform !== 'linkedin-page').map((r) => {
    const base = 'd' + r.day.slice(8, 10)
    const n = (count.get(base + r.platform) ?? 0) + 1
    count.set(base + r.platform, n)
    return { item: n === 1 ? base : `${base}-${n}`, platform: r.platform, date: r.day, time: r.time, idea: r.note, format: '', mediaHint: r.media, text: r.text }
  })
  const name = path.split('/').pop() ?? path
  return { entries, rules: null, days: new Set(entries.map((e) => e.date)).size, columns: [...TEMPLATE_HEADER], problems: [...read.issues.map((i) => `${name}: ${issueText(i)}`), ...pageRows.map((r) => name + ': السطر ' + String(r.line) + ': ' + PAGE_PACKAGE_REFUSAL)] }
}

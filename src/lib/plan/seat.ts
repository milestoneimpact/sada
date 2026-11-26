/**
 * **«عندي خطّة»: تُقرأ أيًّا كانت صيغتُها، وتُسكَّن في المراجعة** (D-287) — الطلبُ ج من «الخطّةُ محورَ المنصّة».
 *
 * ## صيغٌ كثيرة، وقارئٌ واحد
 *
 * كان الاستيرادُ CSV وحدَه (D-181)، ويجدول ما فيه مباشرةً بعد المعاينة. والمالكُ يريد أن يرفع خطّتَه **كما هي**: جدولُ
 * Excel، أو PDF من وكالة، أو مستندُ Word، أو نصٌّ يلصقه. فكلُّ صيغةٍ **تصير جدولَ CSV ثمّ تمرّ بـ `readPlan` نفسِها**
 * (D-181 · D-182 · D-202): التواريخُ بترتيبها، والمنطقةُ، وأسماءُ المنصّات بالعربيّة والإنجليزيّة، والطولُ بحساب المنصّة.
 *
 * | الصيغة | كيف تصير جدولًا | الكلفة |
 * |---|---|---|
 * | CSV | كما هي | لا شيء |
 * | Excel xlsx | `readXlsx` أصيلًا: ورقةُ الخطّة جدولًا، وورقةُ «الإرشادات» قواعدَ (D-393) | لا شيء |
 * | Excel (xls · ods) | `toMarkdown` ثمّ جدولُه سطرًا سطرًا | لا شيء |
 * | PDF · Word · نصّ | `toMarkdown` للنصّ، **ثمّ نموذجُ الكتابة يستخرج الصفوف** | نداءٌ واحدٌ في الدفتر (D-008) |
 *
 * والنموذجُ **يستخرج ولا يخترع**: النصُّ كما كُتب، والتاريخُ إن ذُكر، وما لم يُذكر يبقى فارغًا.
 *
 * ## الناقصُ يُكمَّل ويُقال
 *
 * يومٌ لم يُذكر يأخذ أوّلَ يومٍ فارغٍ من البداية، وساعةٌ لم تُذكر تأخذ **أرجحَ ساعات المنصّة** (`readPeaks`) أو
 * ساعتَها الافتراضيّة — وكلاهما يُكتب على البند ملاحظةً، فلا يظنّ المالكُ أنّ الموعدَ منه.
 *
 * ## التسكينُ لا الجدولة
 *
 * كلُّ صفٍّ سليمٍ يصير **بندًا في خطّةٍ ومسوّدةً بنصّه** (بلا نموذج)، وتُفتح المراجعةُ (D-286): يعتمد ويؤخّر ويحذف، ثمّ
 * «ثبّت». **ولا يُجدوَل شيءٌ قبل التثبيت.** وما لا يُسكَّن (منصّةٌ لا تُعرف، أو موعدٌ مضى، أو نصٌّ فارغ) يُسمّى بسطره.
 */
import type { Db, DbStatement } from '../tokens'
import { normalizeImport, type ImportSourceKind, type NormalizedItem } from './normalize'
import { checkAllowance, blockerReason } from '../limits'
import { askWriter, type BriefDeps } from '../image/brief'
import { readPeaks } from '../schedule/peak'
import { localParts } from '../time/zone'
import { utcToLocalSlot } from './timeBasis'
import { driveAssetRef, driveMediaRow, parseCsvRecords, readPlan, rowKey, type PlanFacts, type PlanRow } from './import'
import { PLAN_CHANNELS, spanDays, type PlanItem, type PlanPlatform, type PlanSpan, type PlanImageStyle } from './prompt'
import { cleanConverted, type ToMarkdown } from '../sources/ingest'
import { readGuidelines, type PlanRules } from './guidelines'
import { isThread } from '../draft/thread'
import { issueText, looksMarkdown, markdownToCsv, readTemplate } from './template'
import { excelDate, excelTime, readXlsx, type Sheet } from '../package/xlsx'

export const SEAT_EXTENSIONS: readonly string[] = ['csv', 'xlsx', 'xls', 'ods', 'pdf', 'docx', 'odt', 'txt', 'md']
const SHEETS = new Set(['xlsx', 'xls', 'ods'])
const DOCS = new Set(['pdf', 'docx', 'odt'])
const HEADER = 'التاريخ,الوقت,المنصة,النص'

/** الساعةُ المحلّيّةُ حين لا يذكرها الملفّ ولا قياسَ للمنصّة بعد. */
const DEFAULT_LOCAL_TIME: Readonly<Record<string, string>> = { linkedin: '09:00', x: '13:00', youtube: '18:00', tiktok: '19:00', instagram: '19:00' }

export type TableOutcome =
  | { readonly kind: 'table'; readonly csv: string; readonly cost: number; readonly via: 'csv' | 'sheet' | 'model'; readonly rules?: PlanRules }
  | { readonly kind: 'error'; readonly reason: string }

const cell = (v: string): string => /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v

/**
 * كلُّ جدولٍ في Markdown على حدة — ورقةُ Excel جدول. كانت الأوراقُ كلُّها تُضمّ جدولًا واحدًا، فتصير صفوفُ
 * «الإرشادات» منشوراتٍ في الخطّة. والجدولُ سطورٌ متتابعةٌ تبدأ بـ `|`، وما بينها يفصلها.
 */
export function markdownTables(md: string): string[] {
  const tables: string[][] = []
  let open = false
  for (const raw of md.split('\n')) {
    const l = raw.trim()
    if (!l.startsWith('|')) { open = false; continue }
    if (/^\|[\s:|-]+\|$/.test(l)) continue
    if (!open) { tables.push([]); open = true }
    tables[tables.length - 1]!.push(l.replace(/^\||\|$/g, '').split('|').map((c) => cell(c.trim())).join(','))
  }
  return tables.map((t) => t.join('\n'))
}

const EXTRACT_SYSTEM = `You extract a social media publishing plan from a document. Output ONLY JSON:
{"rows":[{"date":"YYYY-MM-DD"|null,"time":"HH:MM"|null,"platform":"linkedin"|"x"|"youtube"|"tiktok"|"instagram"|null,"text":"..."}]}
Rules: copy each post's text exactly as written (Arabic stays Arabic); if a row gives only a topic, use the topic line as text.
Never invent a date, time or platform that the document does not state — use null. At most 200 rows. No commentary.`

/** ما يعيده النموذج — يُقرأ متسامحًا: سياجُ ```json وما حوله يُنزع، والصفُّ الفاسدُ يُسقَط. */
export function rowsFromModel(text: string): { date: string; time: string; platform: string; text: string }[] {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return []
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as { rows?: unknown }
    if (!Array.isArray(parsed.rows)) return []
    return parsed.rows.slice(0, 200).flatMap((r) => {
      if (typeof r !== 'object' || r === null) return []
      const o = r as Record<string, unknown>
      const s = (k: string): string => (typeof o[k] === 'string' ? String(o[k]).trim() : '')
      return s('text') === '' ? [] : [{ date: s('date'), time: s('time'), platform: s('platform'), text: s('text') }]
    })
  } catch {
    return []
  }
}

/**
 * جدولٌ بلا كلفة — وإن كان قالبَ الشهر (العمودُ الأوّل «اليوم»، D-390) يُتحقّق منه أوّلًا، **وأخطاؤه بسطرها وعمودها** تُردّ
 * قبل المعاينة: «السطر 9، العمود «الساعة»: «25:00» ليست ساعة».
 */
function templateGate(csv: string): TableOutcome {
  const first = parseCsvRecords(csv)[0]?.cells[0]?.trim() ?? ''
  if (first !== 'اليوم') return { kind: 'table', csv, cost: 0, via: 'csv' }
  const read = readTemplate(csv, 'csv')
  if (read.issues.length === 0) return { kind: 'table', csv, cost: 0, via: 'csv' }
  const shown = read.issues.slice(0, 8).map(issueText)
  const more = read.issues.length - shown.length
  return { kind: 'error', reason: 'في القالب ما يُصلح قبل القراءة — ' + shown.join(' · ') + (more > 0 ? ` · و${more} غيرها` : '') }
}

const PLAN_SHEET = /خطة|خطّة|plan/i
const GUIDE_SHEET = /الإرشادات|الارشادات|إرشادات|ارشادات|guidelines/i
const DATE_COL = /^(التاريخ|date|day|اليوم)$/i
const TIME_COL = /(^|[:：]\s*)(الوقت|الساعة|time)$/i

/**
 * **المصنَّفُ بأوراقه** (D-393) — يُقرأ أصيلًا بقارئ الحزمة (`readXlsx`، D-368) بلا Workers AI ولا كلفة. ورقةُ الخطّة باسمها
 * («خطة الشهر») وإلّا أوّلُ ورقةٍ ليست إرشادات، **وورقةُ «الإرشادات» باسمها** وإلّا أوّلُ ورقةٍ أخرى يقرؤها `readGuidelines`؛
 * وقواعدُها تُحمل مع الجدول فتُحفظ في خطّتها (`choices_json.rules`). والتاريخُ التسلسليُّ والوقتُ الكسريّ يُحوَّلان قبل القراءة.
 * و`null` لمصنَّفٍ بلا ورقة خطّة: يعود المسارُ إلى `toMarkdown` كما كان.
 */
export function sheetsTable(sheets: readonly Sheet[]): TableOutcome | null {
  const plan = sheets.find((s) => PLAN_SHEET.test(s.name) && !GUIDE_SHEET.test(s.name)) ?? sheets.find((s) => !GUIDE_SHEET.test(s.name))
  if (plan === undefined) return null
  const rows = plan.rows.filter((r) => r.some((v) => v.trim() !== ''))
  if (rows.length < 2) return { kind: 'error', reason: 'لا جدولَ في ورقة الخطّة «' + plan.name + '» — أهي فارغة؟' }
  const head = rows[0]!.map((h) => h.trim())
  const fixed = rows.map((r, i) => i === 0 ? r : r.map((v, c) => DATE_COL.test(head[c] ?? '') ? excelDate(v) : TIME_COL.test(head[c] ?? '') ? excelTime(v) : v))
  const csv = fixed.map((r) => r.map(cell).join(',')).join('\n')
  const others = sheets.filter((s) => s !== plan)
  const ordered = [...others.filter((s) => GUIDE_SHEET.test(s.name)), ...others.filter((s) => !GUIDE_SHEET.test(s.name))]
  const rules = ordered.map((s) => readGuidelines(s.rows.map((r) => r.map(cell).join(',')).join('\n'))).find((r) => r !== null) ?? null
  const gated = templateGate(csv)
  if (gated.kind === 'error') return gated
  return { kind: 'table', csv, cost: 0, via: 'sheet', ...(rules === null ? {} : { rules }) }
}

/** أيُّ صيغةٍ إلى جدولٍ واحد. */
export async function toTable(
  deps: { readonly db: Db; readonly writer: BriefDeps; readonly toMarkdown?: ToMarkdown | undefined },
  input: { readonly name: string; readonly bytes: Uint8Array } | { readonly pasted: string },
  /** منظّمةُ المالك الذي يرفع (D-295): سقفُها الخاصّ يُفحَص بعد العامّ. */
  org?: string,
): Promise<TableOutcome> {
  let prose: string
  if ('pasted' in input) {
    prose = input.pasted.trim()
    if (prose === '') return { kind: 'error', reason: 'لم يصل نصّ — الصق خطّتك ثمّ اقرأها.' }
    if (looksMarkdown(prose)) return templateGate(markdownToCsv(prose))
  } else {
    const ext = input.name.toLowerCase().split('.').pop() ?? ''
    if (!SEAT_EXTENSIONS.includes(ext)) return { kind: 'error', reason: `الصيغة .${ext} لا تُقرأ — المقبول: ${SEAT_EXTENSIONS.join(' · ')}.` }
    if (ext === 'csv') {
      try {
        return templateGate(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(input.bytes))
      } catch {
        return { kind: 'error', reason: 'الملفّ ليس UTF-8 — احفظه من Excel بصيغة «CSV UTF-8» أو ارفعه xlsx كما هو.' }
      }
    }
    if (ext === 'txt' || ext === 'md') {
      prose = new TextDecoder().decode(input.bytes)
      // ‏جدولُ markdown (قالبُ الشهر، D-390) يُقرأ بلا نموذجٍ ولا كلفة، بأرقام سطوره
      if (looksMarkdown(prose)) return templateGate(markdownToCsv(prose))
    } else {
      // ‏‏xlsx بأوراقه كلِّها أصيلًا (D-393): الخطّةُ والإرشادات، بلا قارئ مستنداتٍ ولا كلفة
      if (ext === 'xlsx') {
        const native = await readXlsx(input.bytes).then(sheetsTable, () => null)
        if (native !== null) return native
      }
      if (deps.toMarkdown === undefined) return { kind: 'error', reason: 'قارئُ المستندات (Workers AI) غير مربوط في هذه البيئة — ارفع CSV أو الصق النصّ.' }
      const out = await deps.toMarkdown({ name: input.name, blob: new Blob([new Uint8Array(input.bytes)]) })
      const one = Array.isArray(out) ? out[0] : out
      if (one === undefined || one.format === 'error' || one.data === undefined) return { kind: 'error', reason: 'تعذّرت قراءة الملفّ.' }
      if (SHEETS.has(ext)) {
        const [csv = '', ...rest] = markdownTables(one.data)
        if (csv.split('\n').length < 2) return { kind: 'error', reason: 'لا جدولَ في الملفّ — أوّلُ ورقةٍ فيه فارغة؟' }
        // ‏وورقةُ الإرشادات (البند × المنصّة) قواعدُ كتابةٍ لا منشورات
        const rules = rest.map(readGuidelines).find((r) => r !== null) ?? null
        return { kind: 'table', csv, cost: 0, via: 'sheet', ...(rules === null ? {} : { rules }) }
      }
      prose = cleanConverted(one.data)
      if (!DOCS.has(ext)) return { kind: 'error', reason: 'صيغةٌ لا تُقرأ.' }
    }
  }
  // ‏نصٌّ حرّ: النموذجُ يستخرج الصفوف — بعد الإيقاف والسقف، ونداؤه في الدفتر من `askWriter` (D-008)
  const allowance = await checkAllowance(deps.db, 'draft', org)
  if (allowance.blocker !== null) return { kind: 'error', reason: blockerReason(allowance.blocker) }
  const answer = await askWriter(deps.writer, { system: EXTRACT_SYSTEM, user: prose.slice(0, 60_000), operation: 'plan-import', maxTokens: 8000 })
  if (answer.text === null) return { kind: 'error', reason: 'تعذّر استخراج الخطّة: ' + answer.detail }
  const rows = rowsFromModel(answer.text)
  if (rows.length === 0) return { kind: 'error', reason: 'لم أجد في النصّ منشوراتٍ بمواعيدها أو منصّاتها — جرّب جدولًا (CSV أو Excel).' }
  const csv = [HEADER, ...rows.map((r) => [r.date, r.time, r.platform, r.text].map(cell).join(','))].join('\n')
  return { kind: 'table', csv, cost: answer.cost, via: 'model' }
}

/**
 * **الناقصُ يُكمَّل**: يومٌ فارغٌ يأخذ اليومَ التالي لآخر يومٍ قبله (أو البداية)، وساعةٌ فارغةٌ أرجحَ ساعات منصّتها أو
 * افتراضَها. ويعيد السطورَ التي كُمّلت ليُكتب عليها ذلك.
 */
export async function fillGaps(db: Db, org: string, csv: string, start: string, zone: string): Promise<{ csv: string; filled: Map<number, string> }> {
  const records = parseCsvRecords(csv)
  if (records.length === 0) return { csv, filled: new Map() }
  const head = records[0]!.cells.map((h) => h.trim().toLowerCase())
  const di = head.findIndex((h) => h === 'التاريخ' || h === 'date' || h === 'day')
  const ti = head.findIndex((h) => h === 'الوقت' || h === 'time' || h === 'الساعة')
  const pi = head.findIndex((h) => h === 'المنصة' || h === 'المنصّة' || h === 'platform')
  if (di < 0 || ti < 0) return { csv, filled: new Map() }
  const peaks = new Map<string, string>()
  const hourFor = async (platform: string): Promise<string> => {
    const p = platform.toLowerCase()
    if (!peaks.has(p)) {
      const utc = (await readPeaks(db, org, p).catch(() => ({ hours: [] as { hour: number }[] }))).hours[0]?.hour ?? null
      if (utc === null) peaks.set(p, DEFAULT_LOCAL_TIME[p] ?? '10:00')
      else {
        const l = localParts(new Date(Date.UTC(2026, 0, 15, utc)), zone)
        peaks.set(p, String(l.hour).padStart(2, '0') + ':00')
      }
    }
    return peaks.get(p)!
  }
  // ‏الصفوفُ بمحلّل RFC 4180 نفسِه (`parseCsvRecords`): خانةٌ مقتبسةٌ فيها فاصلةٌ أو سطرٌ لا تُشَقّ، والخرجُ يُقتبَس كما يلزم
  const filled = new Map<number, string>()
  let last = ''
  const out = [records[0]!.cells.map(cell).join(',')]
  for (const { cells: original, line } of records.slice(1)) {
    const cells = [...original]
    while (cells.length <= Math.max(di, ti)) cells.push('')
    const notes: string[] = []
    if ((cells[di] ?? '').trim() === '') {
      const at = new Date((last === '' ? start : last) + 'T12:00:00Z')
      if (last !== '') at.setUTCDate(at.getUTCDate() + 1)
      cells[di] = at.toISOString().slice(0, 10)
      notes.push('اليومُ من صدى')
    }
    last = (cells[di] ?? '').trim()
    if ((cells[ti] ?? '').trim() === '') {
      cells[ti] = await hourFor(pi < 0 ? '' : (cells[pi] ?? '').trim())
      notes.push('الساعةُ أرجحُ ساعات المنصّة')
    }
    if (notes.length > 0) filled.set(line, notes.join(' · '))
    out.push(cells.map(cell).join(','))
  }
  return { csv: out.join('\n'), filled }
}

export interface SeatOutcome {
  readonly planId: string | null
  readonly seated: number
  readonly skipped: readonly { readonly line: number; readonly reason: string }[]
  /** البصمةُ نفسُها من المصدر نفسِه (D-383): لم يتغيّر شيء. */
  readonly unchanged?: boolean
  /** صفوفٌ لم تتغيّر بقي بندُها ومنشورُها كما هما (D-404). */
  readonly kept?: number
  /** صفوفٌ عُدّلت فحُدّثت مسوّدتُها في مكانها (D-404). */
  readonly updated?: number
}

const SPANS: readonly PlanSpan[] = ['week', '2weeks', 'month', '2months']

type SeatRows =
  | { readonly fileProblems: readonly string[] }
  | {
    readonly skipped: { line: number; reason: string }[]; readonly within: PlanRow[]
    readonly normalized: Awaited<ReturnType<typeof normalizeImport>>; readonly keyOf: Map<PlanRow, NormalizedItem>
    readonly start: string; readonly span: PlanSpan
  }

/**
 * **صفوفُ الملفّ التي تُسكَّن** — مشتركةٌ بين `seatPlan` و`previewSeat` (D-406): ما تراه المعاينةُ هو ما يُسكَّن،
 * بالبصمة نفسِها والمفتاح نفسِه والمدى نفسِه.
 */
async function seatable(csv: string, facts: PlanFacts, write: boolean): Promise<SeatRows> {
  const read = readPlan(csv, facts)
  if (read.fileProblems.length > 0) return { fileProblems: read.fileProblems }
  const skipped: { line: number; reason: string }[] = []
  const ok: PlanRow[] = []
  for (const row of read.rows) {
    if (row.platform === null || !(PLAN_CHANNELS as readonly string[]).includes(row.platform)) { skipped.push({ line: row.line, reason: `منصّةٌ لا أعرفها «${row.platformRaw}»` }); continue }
    if (row.whenUtc === null) { skipped.push({ line: row.line, reason: row.understoodUtc === null ? 'لم أفهم الموعد' : 'موعدُه مضى' }); continue }
    if (row.text.trim() === '') { skipped.push({ line: row.line, reason: 'بلا نصّ' }); continue }
    ok.push(row)
  }
  if (ok.length === 0) return { skipped, within: [], normalized: await normalizeImport([], 'draft'), keyOf: new Map(), start: '', span: 'week' }
  const days = ok.map((r) => r.whenUtc!.slice(0, 10)).sort()
  const start = days[0]!
  const width = (Date.parse(days[days.length - 1]! + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z')) / 86_400_000 + 1
  const span = SPANS.find((s) => spanDays(s) >= width) ?? '2months'
  const within = ok.filter((r) => (Date.parse(r.whenUtc!.slice(0, 10) + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z')) / 86_400_000 < spanDays(span))
  for (const r of ok) if (!within.includes(r)) skipped.push({ line: r.line, reason: 'أبعدُ من شهرين عن أوّل موعد — ارفعه في خطّةٍ تالية' })

  // ‏المُطبِّعُ الواحد (D-383): مفتاحُ كلِّ بندٍ وبصمةُ الاستيراد والشهرُ من التواريخ
  const normalized = await normalizeImport(within, write ? 'idea' : 'draft')
  const keyOf = new Map(normalized.items.map((n) => [n.row, n]))
  return { skipped, within, normalized, keyOf, start, span }
}

type Existing = { id: string; version: number; plan_json: string; locked_at: string | null; model: string }

/** الخطّةُ التي يحلّ فيها الملفّ (D-404) وشهرُه. */
async function targetPlan(
  db: Db, org: string, within: readonly PlanRow[], start: string, span: PlanSpan, keyOf: ReadonlyMap<PlanRow, NormalizedItem>, zone: string,
): Promise<{ existing: Existing | null; period: string | null }> {
  const sameSpan = await db
    .prepare('SELECT id, version, plan_json, locked_at, model FROM plans WHERE org_id = ? AND week_start = ? AND span = ?')
    .bind(org, start, span).first<Existing>()
  const months = [...new Set(within.map((r) => keyOf.get(r)?.period ?? ownerSlot(r.whenUtc!, zone).day.slice(0, 7)))]
  const period = span === 'month' && months.length === 1 ? months[0]! : null
  // ‏**خطّةٌ واحدة للشهر** (D-383): إن حملت خطّةُ الحزمة شهرَ هذا الملفّ، نزلت صفوفُه فيها كما تنزل الحزمةُ في خطّة الشهر،
  // ‏ولا تُنشأ خطّةٌ بلا شهرٍ لا تراها شاشتُه
  const holder = period === null ? null : await db
    .prepare("SELECT id, version, plan_json, locked_at, model FROM plans WHERE org_id = ? AND period = ? AND status <> 'superseded'")
    .bind(org, period).first<Existing>()
  const intoPackage = holder !== null && holder.model === 'package' && holder.id !== sameSpan?.id
  return { existing: intoPackage ? holder : sameSpan, period }
}

/** بندُ خطّةٍ قائمة من الملفّ ومنشورُه الأبعد (D-405). */
export type OldItem = { id: string; item_key: string; platform: string; due_local: string | null; source_id: string | null; angle: string | null; post_id: string | null; status: string | null }

async function planOlds(db: Db, org: string, planId: string): Promise<OldItem[]> {
  const joined: OldItem[] = (await db
    .prepare(`SELECT i.id, i.item_key, i.platform, i.due_local, i.source_id, i.angle, p.id AS post_id, p.status FROM plan_items i
               LEFT JOIN posts p ON p.plan_item_id = i.id AND p.org_id = i.org_id AND p.plan_id = i.plan_id
               WHERE i.org_id = ? AND i.plan_id = ? AND i.source_kind <> 'github'`)
    .bind(org, planId).all<OldItem>()).results
  // ‏**بندٌ واحدٌ بأبعد منشوراته** (D-405): الوصلُ صفٌّ لكلّ منشور، فبندٌ رُفض منشورُه ثمّ جُدول آخرُ يظهر مرّتين،
  // ‏وكان «المرفوضُ» أوّلَهما فيمرّ الصفُّ المعدَّل وتُكتب مسوّدةٌ ثانية بجوار المجدول
  const rank = (s: string | null): number => s === null ? 0 : s === 'rejected' ? 1 : s === 'draft' ? 2 : 3
  const perItem = new Map<string, OldItem>()
  for (const o of joined) { const was = perItem.get(o.id); if (was === undefined || rank(o.status) > rank(was.status)) perItem.set(o.id, o) }
  return [...perItem.values()]
}

/**
 * **يُسكِّن**: الصفُّ السليمُ بندٌ ومسوّدة، والمدى أصغرُ ما يحمل مواعيدَه، والخطّةُ السابقةُ لهذا المدى تُستبدَل كما في
 * `planSpan`. وما يمنعه — منصّةٌ لا تُعرف، أو موعدٌ لم يُفهم أو مضى، أو نصٌّ فارغ — يُسمّى بسطره وسببه.
 */
/** موعدُ الصفّ بـ UTC إلى يومٍ وساعةٍ بتوقيت المالك (D-384): بندُ الخطّة محلّيٌّ، ولو كتب الصفُّ منطقةً غيرَها. */
function ownerSlot(whenUtc: string, zone: string): { day: string; time: string } {
  return utcToLocalSlot(whenUtc.slice(0, 10), whenUtc.slice(11, 16), zone === '' ? null : zone)
}

export async function seatPlan(
  db: Db, org: string, csv: string, facts: PlanFacts, filled: ReadonlyMap<number, string>, imageStyle: PlanImageStyle | null,
  /** قواعدُ ورقة الإرشادات — تُحفظ مع اختيارات الخطّة. */
  rules: PlanRules | null = null,
  /** «اكتب من الفكرة» (D-361): يُسكَّن البندُ فكرةً بلا مسوّدة، ويكتبه الطابورُ بقواعد منصّته. */
  write = false,
  /** مصدرُ الاستيراد في `import_jobs` (D-383): ملفٌّ جدوليّ، أو نصٌّ استخرجه النموذج. */
  source: { readonly kind: ImportSourceKind; readonly ref?: string } = { kind: 'csv' },
): Promise<SeatOutcome> {
  const prep = await seatable(csv, facts, write)
  if ('fileProblems' in prep) return { planId: null, seated: 0, skipped: prep.fileProblems.map((r) => ({ line: 1, reason: r })) }
  const { skipped, within, normalized, keyOf, start, span } = prep
  if (within.length === 0) return { planId: null, seated: 0, skipped }
  const kind = source.kind
  // ‏**البصمةُ نفسُها من المصدر نفسِه لا تغيّر شيئًا** ما دامت خطّتُها قائمة: كلُّ صفٍّ «مُسكَّنٌ من قبل»
  const prior = await db
    .prepare(`SELECT j.id, j.plan_id FROM import_jobs j JOIN plans p ON p.id = j.plan_id AND p.org_id = j.org_id
               WHERE j.org_id = ? AND j.source_kind = ? AND j.content_hash = ? AND p.status <> 'superseded'`)
    .bind(org, kind, normalized.contentHash).first<{ id: string; plan_id: string }>().catch(() => null)
  if (prior !== null) {
    for (const r of within) skipped.push({ line: r.line, reason: 'مُسكَّنٌ من قبل' })
    // ‏وإعادةُ الرفع بلا تغيير تُرى في السجلّ (D-406) — القيدُ الفريدُ يمنع صفًّا ثانيًا، فيُعدّ على الصفّ نفسِه
    await db.prepare("UPDATE import_jobs SET seen_count = seen_count + 1, last_seen_at = datetime('now') WHERE id = ? AND org_id = ?")
      .bind(prior.id, org).run().catch(() => null)
    return { planId: null, seated: 0, skipped, unchanged: true }
  }

  // ‏الخطّةُ التي يحلّ فيها الملفّ تُعرف قبل الصفوف (D-404): صفٌّ لم يتغيّر يبقى بنده ومنشورُه، وصفٌّ عُدّل يُحدَّث في مكانه
  const { existing, period } = await targetPlan(db, org, within, start, span, keyOf, facts.zone)
  const planId = existing?.id ?? crypto.randomUUID()

  // ‏بنودُ الخطّة القائمة من الملفّ ومنشورُ كلٍّ منها — **والمنشورُ الذي جاوز المسوّدة (اعتُمد أو جُدول أو نُشر) لا يُفصَل
  // ‏عن خطّته ولا يُمسّ نصُّه ولا مفتاحُه (D-004)**: كان الاستبدالُ يُفرغ إشارتَه فيختفي من الشهر والخطّة
  const olds = existing === null ? [] : await planOlds(db, org, planId)
  const claimed = new Set<string>()
  const keptPosts = new Set<string>()
  let kept = 0
  let updated = 0

  const items: PlanItem[] = []
  const rowsOf: { item: PlanItem; n: NormalizedItem | undefined; reuse?: string }[] = []
  const posts: { id: string; row: PlanRow; ref: string; key: string; itemId: string; mode: 'new' | 'update' | 'relink' }[] = []
  const importIdeas: string[] = []
  for (const r of within) {
    if (write) {
      importIdeas.push(r.text.slice(0, 2000))
      const notes = [filled.get(r.line) ?? ''].filter((x) => x !== '')
      const item: PlanItem = {
        sourceId: 'idea:i' + String(importIdeas.length), platform: r.platform as PlanPlatform, kind: 'text',
        angle: [...r.text].slice(0, 120).join(''), ...ownerSlot(r.whenUtc!, facts.zone), why: 'من خطّتك المرفوعة، يُكتب من فكرته',
        ...(notes.length === 0 ? {} : { note: notes.join(' · ') }),
        // ‏ووسيطتُه من مكتبة Drive (D-363) على البند: `draftMessage` يحملها، والطابورُ يربطها بالمسوّدة بـ`attachStatement` فلا تُرسم أخرى
        ...(driveAssetRef(r) === null ? {} : { asset: driveAssetRef(r)! }),
      }
      items.push(item)
      rowsOf.push({ item, n: keyOf.get(r) })
      continue
    }
    const n = keyOf.get(r)
    const key = n?.key ?? await rowKey(r)
    const dup = await db.prepare("SELECT id, plan_id, plan_item_id FROM posts WHERE org_id = ? AND idempotency_key = ? AND status <> 'rejected'")
      .bind(org, key).first<{ id: string; plan_id: string | null; plan_item_id: string | null }>()
    // ‏منشورُ الصفّ نفسِه في خطّةٍ أخرى أو بلا خطّة: لا يُكرَّر
    const own = dup !== null && existing !== null && dup.plan_id === existing.id
    if (dup !== null && !own) { skipped.push({ line: r.line, reason: 'مُسكَّنٌ من قبل' }); continue }
    const dueLocal = n?.dueLocal ?? null
    // ‏البندُ القديم: بمفتاحه إن لم يتغيّر الصفّ، وإلّا بمنصّته وموعده (صفٌّ عُدّل نصُّه)
    const old = own
      ? olds.find((o) => o.id === dup.plan_item_id && !claimed.has(o.id))
      : olds.find((o) => !claimed.has(o.id) && o.platform === r.platform && dueLocal !== null && o.due_local === dueLocal)
    if (old !== undefined) claimed.add(old.id)
    if (!own && old !== undefined && old.post_id !== null && old.status !== 'draft' && old.status !== 'rejected') {
      // ‏عُدّل صفٌّ منشورُه معتمدٌ أو مجدولٌ أو منشور: يبقى المنشورُ وبندُه كما هما، ولا يُكتب آخرُ يُنشر مرّتين
      skipped.push({ line: r.line, reason: 'منشورُه معتمدٌ أو مجدولٌ من قبل — عدّله من بطاقته' })
      continue
    }
    const ref = 'import:' + String(r.line)
    // ‏ما لا يمنع التسكينَ يُكتب على البند: حسابٌ غيرُ مربوط، أو طولٌ زائد، أو ما كمّله صدى
    const notes = [...r.problems.filter((p) => !/موعد|مضى/.test(p)), filled.get(r.line) ?? ''].filter((x) => x !== '')
    const item: PlanItem = {
      // ‏ونصُّ X بسطر `---` بندُ سلسلة (D-324)، كما يكتبه الموجّه
      sourceId: ref, platform: r.platform as PlanPlatform, kind: isThread(r.platform ?? '', r.text) ? 'thread' : 'text',
      angle: [...r.text].slice(0, 120).join(''), ...ownerSlot(r.whenUtc!, facts.zone), why: 'من خطّتك المرفوعة',
      ...(notes.length === 0 ? {} : { note: notes.join(' · ') }),
    }
    items.push(item)
    rowsOf.push({ item, n, ...(old === undefined ? {} : { reuse: old.id }) })
    if (own) {
      kept++
      keptPosts.add(dup.id)
      posts.push({ id: dup.id, row: r, ref, key, itemId: '', mode: 'relink' })
    } else if (old !== undefined && old.post_id !== null && old.status === 'draft') {
      updated++
      keptPosts.add(old.post_id)
      posts.push({ id: old.post_id, row: r, ref, key, itemId: '', mode: 'update' })
    } else {
      posts.push({ id: crypto.randomUUID(), row: r, ref, key, itemId: '', mode: 'new' })
    }
  }
  if (items.length === 0) return { planId: null, seated: 0, skipped }
  // ‏وبندٌ قديمٌ منشورُه جاوز المسوّدة يبقى في الخطّة ولو غاب صفُّه عن الملفّ
  const reusing = new Set(rowsOf.flatMap((x) => x.reuse === undefined ? [] : [x.reuse]))
  const guarded = olds.filter((o) => !reusing.has(o.id) && o.post_id !== null && o.status !== 'draft' && o.status !== 'rejected')
  const oldItems = existing === null ? [] : ((JSON.parse(existing.plan_json) as { items?: PlanItem[] }).items ?? [])
  // ‏**المحميُّ يُحمَل بمعرّف بنده لا بسطره** (D-405): `import:<سطر>` يتزحزح إذا حُذف صفٌّ فوقه فيأخذه صفٌّ جديد،
  // ‏فيُسمّى المحميُّ `import:kept:<معرّف البند>` — ثابتٌ لا يصطدم — ويُحدَّث مرجعُه في بنده ومنشوره
  const carried = guarded.flatMap((o) => {
    const was = oldItems.find((i) => i.sourceId === o.source_id && i.platform === o.platform)
    return was === undefined ? [] : [{ o, item: { ...was, sourceId: 'import:kept:' + o.id } }]
  })
  const channels = [...new Set(items.map((i) => i.platform))]
  const choices = { channels, cadence: {}, sources: 'all', ideas: [], assets: [], autoImage: imageStyle !== null, imageStyle: imageStyle ?? 'infographic', startDay: start, ...(rules === null ? {} : { rules }), ...(write ? { importIdeas } : {}) }
  const planJson = JSON.stringify({ rationale: 'خطّتُك المرفوعة', items: [...items, ...carried.map((c) => c.item)] })

  // ‏**إصدارٌ جديد لا حذف** (D-383): `(org_id, week_start, span)` فريد، فخطّةُ المدى نفسِه تُحدَّث في مكانها برقم إصدارٍ أعلى.
  const jobId = crypto.randomUUID()
  const periodFree = period === null ? false : (await db.prepare('SELECT id FROM plans WHERE org_id = ? AND period = ? AND id <> ?')
    .bind(org, period, planId).first<{ id: string }>()) === null
  const planPeriod = periodFree ? period : null
  const keepPackage = existing?.model === 'package'
  const itemRows = rowsOf.map(({ item, n, reuse }) => ({ id: reuse ?? crypto.randomUUID(), item, n, reuse }))
  // ‏المسوّدةُ تشير إلى بندها (`posts.plan_item_id`) بمرجعها
  for (const p of posts) p.itemId = itemRows.find((x) => x.item.sourceId === p.ref)!.id
  const statements: DbStatement[] = []
  if (existing !== null) {
    // ‏**صورةُ الإصدار السابق تُحفظ قبل كلّ استبدال** (D-404) — كانت لما ثُبّت أو له تاريخٌ وحده، فضاع ما لم يُثبَّت
    statements.push(db.prepare(`INSERT INTO plan_versions (id, plan_id, version, plan_json, scheduled, locked_by, org_id, import_job_id)
                                VALUES (?, ?, ?, ?, 0, 'import', ?, (SELECT id FROM import_jobs WHERE org_id = ? AND plan_id = ? ORDER BY created_at DESC LIMIT 1))
                                ON CONFLICT (plan_id, version) DO NOTHING`)
      .bind(crypto.randomUUID(), planId, existing.version, existing.plan_json, org, org, planId))
    statements.push(
      // ‏ومنشوراتُ بنود الحزمة تبقى على خطّتها، وما جاوز المسوّدة يبقى، وما بقي صفُّه أو عُدّل يبقى: الاستيرادُ يفصل مسوّداتٍ غاب صفُّها وحدها
      db.prepare(`UPDATE posts SET plan_id = NULL, plan_item_id = NULL WHERE org_id = ? AND plan_id = ? AND status IN ('draft', 'rejected')
                    AND id NOT IN (SELECT value FROM json_each(?))
                    AND NOT EXISTS (SELECT 1 FROM plan_items i WHERE i.id = posts.plan_item_id AND i.source_kind = 'github')`).bind(org, planId, JSON.stringify([...keptPosts])),
      // ‏بنودُ الحزمة في خطّة الشهر نفسِها لا يمحوها استيرادُ ملفّ (D-383 المرحلة ٤)، ولا بندٌ يُعاد استعمالُه أو منشورُه محميّ
      db.prepare(`DELETE FROM plan_items WHERE org_id = ? AND plan_id = ? AND source_kind <> 'github' AND id NOT IN (SELECT value FROM json_each(?))
                    AND NOT EXISTS (SELECT 1 FROM posts p WHERE p.plan_item_id = plan_items.id AND p.org_id = plan_items.org_id AND p.plan_id = plan_items.plan_id
                                    AND p.status NOT IN ('draft', 'rejected'))`).bind(org, planId, JSON.stringify([...reusing])),
      ...carried.flatMap(({ o, item }) => [
        db.prepare('UPDATE plan_items SET source_id = ? WHERE id = ? AND org_id = ?').bind(item.sourceId, o.id, org),
        db.prepare('UPDATE posts SET source_refs = ? WHERE id = ? AND org_id = ?').bind(JSON.stringify([item.sourceId]), o.post_id, org),
      ]),
      // ‏وخطّةُ الحزمة تبقى خطّةَ حزمة، ويُضاف مصدرُ الملفّ إلى مصادرها
      db.prepare(`UPDATE plans SET plan_json = ?, model = CASE WHEN ? THEN model ELSE 'import' END, status = 'draft', choices_json = ?, version = version + 1, locked_at = NULL, time_basis = 'local',
                         created_at = datetime('now'), period = ?, source_kinds = ? WHERE id = ? AND org_id = ?`)
        .bind(planJson, keepPackage ? 1 : 0, JSON.stringify(choices), planPeriod, JSON.stringify(keepPackage ? ['github', kind] : [kind]), planId, org),
    )
  } else {
    statements.push(db.prepare("INSERT INTO plans (id, week_start, plan_json, model, status, org_id, span, choices_json, period, source_kinds, time_basis) VALUES (?, ?, ?, 'import', 'draft', ?, ?, ?, ?, ?, 'local')")
      .bind(planId, start, planJson, org, span, JSON.stringify(choices), planPeriod, JSON.stringify([kind])))
  }
  const itemValues = (item: PlanItem, n: NormalizedItem | undefined): unknown[] =>
    [n?.key ?? item.sourceId, item.platform, n?.dueLocal ?? item.day + ' ' + item.time, item.kind, item.angle, n?.row.text ?? null, item.asset ?? null, n?.key ?? null, item.sourceId]
  statements.push(
    // ‏البندُ المُعاد يُحدَّث في مكانه بمعرّفه — فمنشورُه يبقى مشيرًا إليه
    ...itemRows.filter((x) => x.reuse !== undefined).map(({ id, item, n }) => db
      .prepare(`UPDATE plan_items SET item_key = ?, platform = ?, due_local = ?, kind = ?, angle = ?, copy = ?, media_ref = ?, content_hash = ?, source_id = ?,
                       source_kind = ?, rev = rev + 1, updated_at = datetime('now') WHERE id = ? AND org_id = ?`)
      .bind(...itemValues(item, n), kind, id, org)),
    ...itemRows.filter((x) => x.reuse === undefined).map(({ id, item, n }) => db
      .prepare(`INSERT INTO plan_items (id, org_id, plan_id, item_key, platform, due_local, kind, angle, copy, media_ref, content_hash, source_id, source_kind)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (plan_id, item_key, platform) DO NOTHING`)
      .bind(id, org, planId, ...itemValues(item, n), kind)),
    ...posts.map((p) => {
      const type = isThread(p.row.platform ?? '', p.row.text) ? 'thread' : 'text'
      if (p.mode === 'relink') {
        // ‏لم يتغيّر صفُّه: المنشورُ كما هو بحاله ومفتاحه، ويشير إلى بنده
        return db.prepare('UPDATE posts SET plan_item_id = ?, source_refs = ? WHERE id = ? AND org_id = ?').bind(p.itemId, JSON.stringify([p.ref]), p.id, org)
      }
      if (p.mode === 'update') {
        // ‏عُدّل صفُّه ومنشورُه مسوّدة: يُحدَّث نصُّه ومفتاحُه من صفّه الجديد (D-004) — والمسوّدةُ وحدها
        return db.prepare(`UPDATE posts SET text = ?, type = ?, idempotency_key = ?, source_refs = ?, plan_item_id = ? WHERE id = ? AND org_id = ? AND status = 'draft'`)
          .bind(p.row.text, type, p.key, JSON.stringify([p.ref]), p.itemId, p.id, org)
      }
      return db
        .prepare(`INSERT INTO posts (id, platform, type, text, status, idempotency_key, model, rationale, plan_id, source_refs, org_id, plan_item_id)
                  VALUES (?, ?, ?, ?, 'draft', ?, 'owner', 'من خطّتك المرفوعة', ?, ?, ?, ?)`)
        .bind(p.id, p.row.platform, type, p.row.text, p.key, planId, JSON.stringify([p.ref]), org, p.itemId)
    }),
    // ‏وسيطةُ المالك من مكتبة Drive تُربط بمسوّدتها (D-363) — فلا تُرسم لها صورة (`seatedPosts` يتخطّاها)
    ...posts.filter((p) => p.mode !== 'relink').flatMap((p) => { const m = driveMediaRow(db, org, p.id, p.row); return m === null ? [] : [m] }),
    // ‏ومهمّةُ الاستيراد ببصمتها: البصمةُ نفسُها بعد حذف خطّتها تُعاد إلى الخطّة الجديدة
    db.prepare(`INSERT INTO import_jobs (id, org_id, source_kind, source_ref, content_hash, period, status, report_json, plan_id)
                VALUES (?, ?, ?, ?, ?, ?, 'applied', ?, ?)
                ON CONFLICT (org_id, source_kind, content_hash) DO UPDATE SET plan_id = excluded.plan_id, status = 'applied',
                  report_json = excluded.report_json, source_ref = excluded.source_ref, period = excluded.period`)
      .bind(jobId, org, kind, source.ref ?? null, normalized.contentHash, normalized.periods.length === 1 ? normalized.periods[0]! : null,
        JSON.stringify({ seated: items.length, kept, updated, skipped: skipped.length, periods: normalized.periods, replaced: existing !== null }), planId),
  )
  if (db.batch !== undefined) await db.batch(statements)
  else for (const st of statements) await st.run()
  return { planId, seated: items.length, skipped, kept, updated }
}

/** وسمُ الصفّ في المعاينة (D-406) — قبل أن يضغط المالكُ «ابنِ». */
export type RowTag = 'new' | 'modified' | 'unchanged' | 'scheduled' | 'published'

export interface SeatPreview {
  /** رقمُ السطر ← وسمُه؛ وما لا يُسكَّن (منصّةٌ أو موعدٌ أو نصّ) لا وسمَ له. */
  readonly tags: Readonly<Record<string, RowTag>>
  /** بنودٌ في الخطّة القائمة غاب صفُّها عن الملفّ. */
  readonly removed: readonly { readonly platform: string; readonly due: string | null; readonly angle: string; readonly guarded: boolean }[]
  /** الملفُّ نفسُه (البصمةُ نفسُها من المصدر نفسِه) استُورد من قبل: متى. */
  readonly importedAt: string | null
}

const beyond = (status: string | null): RowTag | null =>
  status === 'published' ? 'published' : status === null || status === 'draft' || status === 'rejected' ? null : 'scheduled'

/**
 * **ما سيفعله «ابنِ» بكلّ صفّ — قراءةٌ بلا كتابة** (D-406). يمرّ بما يمرّ به `seatPlan` نفسِه: `seatable` و`targetPlan`
 * و`planOlds` ومطابقةُ المفتاح ثمّ المنصّة والموعد، فما يُوسَم «معدَّل» هو ما يُحدَّث، وما يُوسَم «مجدول سابقًا» هو ما يُتخطّى.
 */
export async function previewSeat(db: Db, org: string, csv: string, facts: PlanFacts, kind: ImportSourceKind = 'csv'): Promise<SeatPreview> {
  const empty: SeatPreview = { tags: {}, removed: [], importedAt: null }
  const prep = await seatable(csv, facts, false)
  if ('fileProblems' in prep || prep.within.length === 0) return empty
  const { within, normalized, keyOf, start, span } = prep
  const prior = await db
    .prepare(`SELECT j.created_at FROM import_jobs j JOIN plans p ON p.id = j.plan_id AND p.org_id = j.org_id
               WHERE j.org_id = ? AND j.source_kind = ? AND j.content_hash = ? AND p.status <> 'superseded'`)
    .bind(org, kind, normalized.contentHash).first<{ created_at: string }>().catch(() => null)
  const { existing } = await targetPlan(db, org, within, start, span, keyOf, facts.zone)
  const olds = existing === null ? [] : await planOlds(db, org, existing.id)
  const claimed = new Set<string>()
  const tags: Record<string, RowTag> = {}
  for (const r of within) {
    const n = keyOf.get(r)
    const key = n?.key ?? await rowKey(r)
    const dup = await db.prepare("SELECT plan_id, plan_item_id, status FROM posts WHERE org_id = ? AND idempotency_key = ? AND status <> 'rejected'")
      .bind(org, key).first<{ plan_id: string | null; plan_item_id: string | null; status: string }>()
    const own = dup !== null && existing !== null && dup.plan_id === existing.id
    if (dup !== null && !own) { tags[String(r.line)] = beyond(dup.status) ?? 'unchanged'; continue }
    const dueLocal = n?.dueLocal ?? null
    const old = own
      ? olds.find((o) => o.id === dup.plan_item_id && !claimed.has(o.id))
      : olds.find((o) => !claimed.has(o.id) && o.platform === r.platform && dueLocal !== null && o.due_local === dueLocal)
    if (old !== undefined) claimed.add(old.id)
    tags[String(r.line)] = own ? beyond(dup.status) ?? 'unchanged' : old === undefined ? 'new' : beyond(old.status) ?? 'modified'
  }
  const removed = olds.filter((o) => !claimed.has(o.id))
    .map((o) => ({ platform: o.platform, due: o.due_local, angle: o.angle ?? '', guarded: beyond(o.status) !== null }))
  return { tags, removed, importedAt: prior?.created_at ?? null }
}

/** معرّفاتُ مسوّدات خطّةٍ مسكَّنة — لرسم صورها في الخلفيّة إن اختيرت. */
export async function seatedPosts(db: Db, org: string, planId: string): Promise<string[]> {
  // ‏وما رُبطت به وسيطةٌ من المكتبة لا يُرسم له شيء (D-363)
  const { results } = await db
    .prepare("SELECT id FROM posts WHERE org_id = ? AND plan_id = ? AND status = 'draft' AND NOT EXISTS (SELECT 1 FROM media m WHERE m.post_id = posts.id)")
    .bind(org, planId).all<{ id: string }>()
  return results.map((r) => r.id)
}

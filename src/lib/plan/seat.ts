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
 * | Excel (xlsx · xls · ods) | `toMarkdown` ثمّ جدولُه سطرًا سطرًا | لا شيء |
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
import type { Db } from '../tokens'
import { checkAllowance, blockerReason } from '../limits'
import { askWriter, type BriefDeps } from '../image/brief'
import { readPeaks } from '../schedule/peak'
import { localParts } from '../time/zone'
import { driveAssetRef, driveMediaRow, parseCsvRecords, readPlan, rowKey, type PlanFacts, type PlanRow } from './import'
import { PLAN_CHANNELS, spanDays, type PlanItem, type PlanPlatform, type PlanSpan, type PlanImageStyle } from './prompt'
import { cleanConverted, type ToMarkdown } from '../sources/ingest'
import { readGuidelines, type PlanRules } from './guidelines'
import { isThread } from '../draft/thread'

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
  } else {
    const ext = input.name.toLowerCase().split('.').pop() ?? ''
    if (!SEAT_EXTENSIONS.includes(ext)) return { kind: 'error', reason: `الصيغة .${ext} لا تُقرأ — المقبول: ${SEAT_EXTENSIONS.join(' · ')}.` }
    if (ext === 'csv') {
      try {
        return { kind: 'table', csv: new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(input.bytes), cost: 0, via: 'csv' }
      } catch {
        return { kind: 'error', reason: 'الملفّ ليس UTF-8 — احفظه من Excel بصيغة «CSV UTF-8» أو ارفعه xlsx كما هو.' }
      }
    }
    if (ext === 'txt' || ext === 'md') {
      prose = new TextDecoder().decode(input.bytes)
    } else {
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
}

const SPANS: readonly PlanSpan[] = ['week', '2weeks', 'month', '2months']

/**
 * **يُسكِّن**: الصفُّ السليمُ بندٌ ومسوّدة، والمدى أصغرُ ما يحمل مواعيدَه، والخطّةُ السابقةُ لهذا المدى تُستبدَل كما في
 * `planSpan`. وما يمنعه — منصّةٌ لا تُعرف، أو موعدٌ لم يُفهم أو مضى، أو نصٌّ فارغ — يُسمّى بسطره وسببه.
 */
export async function seatPlan(
  db: Db, org: string, csv: string, facts: PlanFacts, filled: ReadonlyMap<number, string>, imageStyle: PlanImageStyle | null,
  /** قواعدُ ورقة الإرشادات — تُحفظ مع اختيارات الخطّة. */
  rules: PlanRules | null = null,
  /** «اكتب من الفكرة» (D-361): يُسكَّن البندُ فكرةً بلا مسوّدة، ويكتبه الطابورُ بقواعد منصّته. */
  write = false,
): Promise<SeatOutcome> {
  const read = readPlan(csv, facts)
  if (read.fileProblems.length > 0) return { planId: null, seated: 0, skipped: read.fileProblems.map((r) => ({ line: 1, reason: r })) }
  const skipped: { line: number; reason: string }[] = []
  const ok: PlanRow[] = []
  for (const row of read.rows) {
    if (row.platform === null || !(PLAN_CHANNELS as readonly string[]).includes(row.platform)) { skipped.push({ line: row.line, reason: `منصّةٌ لا أعرفها «${row.platformRaw}»` }); continue }
    if (row.whenUtc === null) { skipped.push({ line: row.line, reason: row.understoodUtc === null ? 'لم أفهم الموعد' : 'موعدُه مضى' }); continue }
    if (row.text.trim() === '') { skipped.push({ line: row.line, reason: 'بلا نصّ' }); continue }
    ok.push(row)
  }
  if (ok.length === 0) return { planId: null, seated: 0, skipped }
  const days = ok.map((r) => r.whenUtc!.slice(0, 10)).sort()
  const start = days[0]!
  const width = (Date.parse(days[days.length - 1]! + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z')) / 86_400_000 + 1
  const span = SPANS.find((s) => spanDays(s) >= width) ?? '2months'
  const within = ok.filter((r) => (Date.parse(r.whenUtc!.slice(0, 10) + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z')) / 86_400_000 < spanDays(span))
  for (const r of ok) if (!within.includes(r)) skipped.push({ line: r.line, reason: 'أبعدُ من شهرين عن أوّل موعد — ارفعه في خطّةٍ تالية' })

  const planId = crypto.randomUUID()
  const items: PlanItem[] = []
  const posts: { id: string; row: PlanRow; ref: string; key: string }[] = []
  const importIdeas: string[] = []
  for (const r of within) {
    if (write) {
      importIdeas.push(r.text.slice(0, 2000))
      const notes = [filled.get(r.line) ?? ''].filter((x) => x !== '')
      items.push({
        sourceId: 'idea:i' + String(importIdeas.length), platform: r.platform as PlanPlatform, kind: 'text',
        angle: [...r.text].slice(0, 120).join(''), day: r.whenUtc!.slice(0, 10), time: r.whenUtc!.slice(11, 16), why: 'من خطّتك المرفوعة، يُكتب من فكرته',
        ...(notes.length === 0 ? {} : { note: notes.join(' · ') }),
        // ‏ووسيطتُه من مكتبة Drive (D-363) على البند: `draftMessage` يحملها، والطابورُ يربطها بالمسوّدة بـ`attachStatement` فلا تُرسم أخرى
        ...(driveAssetRef(r) === null ? {} : { asset: driveAssetRef(r)! }),
      })
      continue
    }
    const key = await rowKey(r)
    const dup = await db.prepare("SELECT id FROM posts WHERE org_id = ? AND idempotency_key = ? AND status <> 'rejected'").bind(org, key).first<{ id: string }>()
    if (dup !== null) { skipped.push({ line: r.line, reason: 'مُسكَّنٌ من قبل' }); continue }
    const ref = 'import:' + String(r.line)
    // ‏ما لا يمنع التسكينَ يُكتب على البند: حسابٌ غيرُ مربوط، أو طولٌ زائد، أو ما كمّله صدى
    const notes = [...r.problems.filter((p) => !/موعد|مضى/.test(p)), filled.get(r.line) ?? ''].filter((x) => x !== '')
    items.push({
      // ‏ونصُّ X بسطر `---` بندُ سلسلة (D-324)، كما يكتبه الموجّه
      sourceId: ref, platform: r.platform as PlanPlatform, kind: isThread(r.platform ?? '', r.text) ? 'thread' : 'text',
      angle: [...r.text].slice(0, 120).join(''), day: r.whenUtc!.slice(0, 10), time: r.whenUtc!.slice(11, 16), why: 'من خطّتك المرفوعة',
      ...(notes.length === 0 ? {} : { note: notes.join(' · ') }),
    })
    posts.push({ id: crypto.randomUUID(), row: r, ref, key })
  }
  if (items.length === 0) return { planId: null, seated: 0, skipped }
  const channels = [...new Set(items.map((i) => i.platform))]
  const choices = { channels, cadence: {}, sources: 'all', ideas: [], assets: [], autoImage: imageStyle !== null, imageStyle: imageStyle ?? 'infographic', startDay: start, ...(rules === null ? {} : { rules }), ...(write ? { importIdeas } : {}) }
  const statements = [
    db.prepare("UPDATE plans SET status = 'superseded' WHERE org_id = ? AND week_start = ? AND span = ? AND status <> 'superseded'").bind(org, start, span),
    db.prepare('DELETE FROM plans WHERE org_id = ? AND week_start = ? AND span = ?').bind(org, start, span),
    db.prepare("INSERT INTO plans (id, week_start, plan_json, model, status, org_id, span, choices_json) VALUES (?, ?, ?, 'import', 'draft', ?, ?, ?)")
      .bind(planId, start, JSON.stringify({ rationale: 'خطّتُك المرفوعة', items }), org, span, JSON.stringify(choices)),
    ...posts.map((p) => db
      .prepare(`INSERT INTO posts (id, platform, type, text, status, idempotency_key, model, rationale, plan_id, source_refs, org_id)
                VALUES (?, ?, ?, ?, 'draft', ?, 'owner', 'من خطّتك المرفوعة', ?, ?, ?)`)
      .bind(p.id, p.row.platform, isThread(p.row.platform ?? '', p.row.text) ? 'thread' : 'text', p.row.text, p.key, planId, JSON.stringify([p.ref]), org)),
    // ‏وسيطةُ المالك من مكتبة Drive تُربط بمسوّدتها (D-363) — فلا تُرسم لها صورة (`seatedPosts` يتخطّاها)
    ...posts.flatMap((p) => { const m = driveMediaRow(db, org, p.id, p.row); return m === null ? [] : [m] }),
  ]
  if (db.batch !== undefined) await db.batch(statements)
  else for (const st of statements) await st.run()
  return { planId, seated: items.length, skipped }
}

/** معرّفاتُ مسوّدات خطّةٍ مسكَّنة — لرسم صورها في الخلفيّة إن اختيرت. */
export async function seatedPosts(db: Db, org: string, planId: string): Promise<string[]> {
  // ‏وما رُبطت به وسيطةٌ من المكتبة لا يُرسم له شيء (D-363)
  const { results } = await db
    .prepare("SELECT id FROM posts WHERE org_id = ? AND plan_id = ? AND status = 'draft' AND NOT EXISTS (SELECT 1 FROM media m WHERE m.post_id = posts.id)")
    .bind(org, planId).all<{ id: string }>()
  return results.map((r) => r.id)
}

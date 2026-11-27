/**
 * **الفحصُ الآليّ لملفّ الخطّة** (D-408) — لوكيل بناء الخطّة (`docs/PLAN-AGENT-GUIDE.md`) ولـ`npm run plan:check`.
 *
 * لا قارئَ ثانيًا: `.md` و`.csv` يمرّان بـ`readTemplate` نفسِه الذي تقرأ به الحزمةُ و«من ملفّ»، و`.json` (مصفوفةُ صفوفٍ
 * على `PLAN_SCHEMA`) يُكتب CSV بـ`renderTemplate` ثمّ يُقرأ بالقارئ ذاته. وفوق القارئ تنبيهاتُ الدليل التي لا يردّها
 * التطبيق: نصٌّ مكرَّر، ووسومٌ أكثرُ من ثلاثة، وأسعارٌ أو مبالغُ في النصّ.
 */
import { parseCsvRecords } from './import'
import { issueText, looksMarkdown, markdownToCsv, readTemplate, renderTemplate, TEMPLATE_HEADER, TEXT_LIMIT, type TemplateRow } from './template'

/** ‏JSON Schema لصفوف الخطّة — نسختُه في `docs/plan.schema.json` يحرسها اختبار. */
export const PLAN_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://github.com/milestoneimpact/sada/blob/main/docs/plan.schema.json',
  title: 'خطّة صدى',
  description: 'صفوف الخطّة بأعمدة القالب: ' + TEMPLATE_HEADER.join('، ') + '. الساعة بتوقيت المالك.',
  type: 'array',
  maxItems: 200,
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['day', 'time', 'platform', 'text'],
    properties: {
      day: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'اليوم YYYY-MM-DD' },
      time: { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$', description: 'الساعة HH:MM بتوقيت المالك' },
      platform: { enum: ['linkedin', 'linkedin-page', 'x'], description: 'المنصة — linkedin-page لصفحة الشركة' },
      text: { type: 'string', minLength: 1, description: 'النص كما يُنشر؛ في X سطر --- يفصل تغريدات السلسلة' },
      media: { type: 'string', description: 'مسار الصورة أو المقطع (اختياريّ)' },
      note: { type: 'string', description: 'ملاحظة لا تُنشر' },
    },
    allOf: [
      { if: { properties: { platform: { const: 'linkedin' } } }, then: { properties: { text: { maxLength: TEXT_LIMIT.linkedin } } } },
      { if: { properties: { platform: { const: 'linkedin-page' } } }, then: { properties: { text: { maxLength: TEXT_LIMIT['linkedin-page'] } } } },
    ],
  },
} as const

export interface PlanCheck { readonly ok: boolean; readonly rows: number; readonly lines: readonly string[] }

const HASHTAG = /(^|\s)#[\p{L}\p{N}_]+/gu
const PRICE = /(\d[\d.,]*\s*(ريال|ر\.س|درهم|دينار|جنيه|دولار|SAR|USD|\$))|((ريال|SAR|USD|\$)\s*\d)/iu
export const MAX_HASHTAGS = 3

function fromJson(text: string): { csv: string } | { error: string } {
  let data: unknown
  try { data = JSON.parse(text) } catch (e) { return { error: `ليس JSON صالحًا: ${(e as Error).message}` } }
  if (!Array.isArray(data)) return { error: 'الملفّ يجب أن يكون مصفوفةَ صفوف [ {day, time, platform, text}, … ]' }
  const keys = new Set(Object.keys(PLAN_SCHEMA.items.properties))
  for (const [i, r] of data.entries()) {
    if (typeof r !== 'object' || r === null || Array.isArray(r)) return { error: `الصفّ ${i + 1}: ليس كائنًا` }
    const extra = Object.keys(r).filter((k) => !keys.has(k))
    if (extra.length > 0) return { error: `الصفّ ${i + 1}: حقولٌ لا يعرفها القالب: ${extra.join('، ')}` }
    for (const [k, v] of Object.entries(r)) if (typeof v !== 'string') return { error: `الصفّ ${i + 1}: «${k}» يجب أن يكون نصًّا` }
  }
  const rows = (data as Record<string, string>[]).map((r): TemplateRow => ({
    day: r.day ?? '', time: r.time ?? '', platform: (r.platform ?? '') as TemplateRow['platform'], text: r.text ?? '', media: r.media ?? '', note: r.note ?? '',
  }))
  return { csv: renderTemplate('', 'csv', rows) }
}

/** يفحص ملفَّ خطّة باسمه ونصّه — **نقيّة**. `ok` كاذبةٌ عند أيّ خطأ أو تنبيه، وكلُّ سطرٍ بالعربيّة بسطره. */
export function checkPlanFile(name: string, text: string): PlanCheck {
  const period = /(\d{4}-(0[1-9]|1[0-2]))\.(md|csv|json)$/i.exec(name)?.[1] ?? null
  const isJson = /\.json$/i.test(name)
  let body = text
  let format: 'md' | 'csv' = /\.md$/i.test(name) || (!/\.csv$/i.test(name) && looksMarkdown(text)) ? 'md' : 'csv'
  if (isJson) {
    const j = fromJson(text)
    if ('error' in j) return { ok: false, rows: 0, lines: [j.error] }
    body = j.csv
    format = 'csv'
  }
  const read = readTemplate(body, format, period)
  // ‏في JSON السطرُ 1 هو العنوان، فالصفُّ ن في المصفوفة هو السطرُ ن+1 — يُقال «الصفّ» لا «السطر».
  const say = (s: string): string => (isJson ? s.replace(/^السطر (\d+)/, (_, n: string) => `الصفّ ${Number(n) - 1}`) : s)
  const where = (line: number): string => (isJson ? `الصفّ ${line - 1}` : `السطر ${line}`)
  const lines = read.issues.map((i) => say(issueText(i)))
  const seen = new Map<string, number>()
  for (const r of read.rows) {
    const key = r.platform + '\n' + r.text.replace(/\s+/g, ' ').trim()
    const first = seen.get(key)
    if (first !== undefined) lines.push(`${where(r.line)}، العمود «النص»: يكرّر نصَّ ${where(first)} على المنصّة نفسِها`)
    else seen.set(key, r.line)
    const tags = r.text.match(HASHTAG)?.length ?? 0
    if (tags > MAX_HASHTAGS) lines.push(`${where(r.line)}، العمود «النص»: ${tags} وسومٍ والحدّ ${MAX_HASHTAGS}`)
    if (PRICE.test(r.text)) lines.push(`${where(r.line)}، العمود «النص»: فيه سعرٌ أو مبلغ — الأسعارُ لا تُكتب في الخطّة`)
  }
  if (lines.length === 0 && read.rows.length === 0) lines.push('لا صفَّ بنصّ — الملفّ لا يحمل منشورًا')
  return { ok: lines.length === 0, rows: read.rows.length, lines }
}

/** خليّةُ CSV بقاعدة RFC 4180 — تُقتبس إن حملت فاصلةً أو اقتباسًا أو سطرًا. */
const quote = (c: string): string => (/[",\r\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)

/** ملفٌّ مرفوعٌ في «من ملفّ» جدولُ markdown؟ — بامتداده، أو بشكله إن لم يكن `.csv`. */
export function isMarkdownPlan(name: string, text: string): boolean {
  return /\.md$/i.test(name) || (!/\.csv$/i.test(name) && looksMarkdown(text))
}

/**
 * **بابٌ واحد للصيغتين** (D-434): ملفُّ الخطّة `plans/YYYY-MM.md` يُرفع في «من ملفّ» كما هو، فيُكتب CSV لـ`readPlan`.
 * الجدولُ بـ`markdownToCsv` نفسِه الذي يقرأ به `readTemplate`، و**الصفُّ بلا نصٍّ يُترك** كما يتركه القالب (يأتي بكلّ الأيّام)
 * — سطرًا فارغًا في مكانه، فيبقى رقمُ كلِّ صفٍّ رقمَ سطره في الملفّ. وCSV يمرّ كما هو.
 */
export function planUploadCsv(name: string, text: string): string {
  if (!isMarkdownPlan(name, text)) return text
  const recs = parseCsvRecords(markdownToCsv(text))
  if (recs.length === 0) return ''
  const head = recs[0]!.cells.map((h) => h.trim().toLowerCase())
  const t = head.findIndex((h) => h === 'text' || h === 'النص' || h === 'النصّ')
  const slots: string[] = []
  for (const r of recs) {
    if (r !== recs[0] && t >= 0 && (r.cells[t] ?? '').trim() === '') continue
    while (slots.length < r.line - 1) slots.push('')
    slots[r.line - 1] = r.cells.map(quote).join(',')
  }
  return slots.join('\r\n') + '\r\n'
}

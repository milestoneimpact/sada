/**
 * **قالبُ الخطّة الشهريّة في المستودع** (D-390) — صيغةٌ قياسيّةٌ واحدة: `plans/YYYY-MM.md` (جدولُ markdown) و`plans/YYYY-MM.csv`
 * بديلًا، بستّة أعمدة: اليوم، الساعة (بتوقيت المالك، D-384)، المنصّة (linkedin|x)، النصّ، الملفّ (مسارُ الصورة أو المقطع،
 * اختياريّ)، ملاحظة.
 *
 * **لا مسارَ موازٍ**: الجدولُ يُحوَّل CSV بأرقام سطوره كما هي، فيقرؤه `readPlan` في «من ملفّ»، ويقرؤه قارئُ الحزمة
 * (`planFromTemplate` ← `PackagePlan`) فيمرّ من اللقطة والفرق و`landInMonthPlans` كخطّة xlsx. وهنا فقط ما ينقص: قراءةُ
 * markdown، والتحقّقُ بالسطر والعمود، وتوليدُ القالب معبّأً بأيّام الشهر.
 */
import { parseCsvRecords } from './import'
import { longestTweet } from '../draft/thread'

/** عناوينُ القالب بترتيبها — وكلٌّ منها يعرفه `readPlan` (`COLUMNS`). */
export const TEMPLATE_HEADER = ['اليوم', 'الساعة', 'المنصة', 'النص', 'الملف', 'ملاحظة'] as const
type TemplateColumn = 'day' | 'time' | 'platform' | 'text' | 'media' | 'note'
const HEAD_OF: Readonly<Record<string, TemplateColumn>> = {
  'اليوم': 'day', 'التاريخ': 'day', day: 'day', date: 'day',
  'الساعة': 'time', 'الوقت': 'time', time: 'time',
  'المنصة': 'platform', 'المنصّة': 'platform', platform: 'platform',
  'النص': 'text', 'النصّ': 'text', text: 'text',
  'الملف': 'media', 'الملفّ': 'media', media: 'media', file: 'media',
  'ملاحظة': 'note', 'ملاحظات': 'note', note: 'note',
}
const LABEL_OF: Readonly<Record<TemplateColumn, string>> = { day: 'اليوم', time: 'الساعة', platform: 'المنصة', text: 'النص', media: 'الملف', note: 'ملاحظة' }

/** ساعاتٌ مقترحة بتوقيت المالك: LinkedIn صباحَ أيّام العمل (الأحد إلى الخميس)، وX مساءَ كلّ يوم. */
export const SUGGESTED = { linkedin: '09:00', x: '20:00' } as const
const WORKDAYS = new Set([0, 1, 2, 3, 4])
const WEEKDAY = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'] as const
export const TEXT_LIMIT = { linkedin: 3000, 'linkedin-page': 3000, x: 280 } as const

/** مسارُ قالبٍ في المستودع: `plans/YYYY-MM.md` أو `.csv` — وملفُّ الحالة `.status.json` ليس منها. */
export const TEMPLATE_PATH = /^plans\/(\d{4}-(0[1-9]|1[0-2]))\.(md|csv)$/i
export const isTemplatePath = (p: string): boolean => TEMPLATE_PATH.test(p)
export const templatePeriod = (p: string): string | null => TEMPLATE_PATH.exec(p)?.[1] ?? null

/** دليلُ وكيل بناء الخطّة (D-408). */
export const GUIDE_URL = 'https://github.com/milestoneimpact/sada/blob/main/docs/PLAN-AGENT-GUIDE.md'

const pad = (n: number): string => String(n).padStart(2, '0')

export interface TemplateRow { readonly day: string; readonly time: string; readonly platform: 'linkedin' | 'x' | 'linkedin-page'; readonly text: string; readonly media: string; readonly note: string }

/** صفوفُ أيّامٍ بعينها (`YYYY-MM-DD`): X مساءً كلَّ يوم، وLinkedIn صباحَ أيّام العمل — والنصُّ فارغٌ يكتبه المالك. */
export function dayListRows(days: readonly string[]): TemplateRow[] {
  const out: TemplateRow[] = []
  for (const day of days) {
    const [y, m, d] = day.split('-').map(Number) as [number, number, number]
    const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
    if (WORKDAYS.has(wd)) out.push({ day, time: SUGGESTED.linkedin, platform: 'linkedin', text: '', media: '', note: WEEKDAY[wd]! })
    out.push({ day, time: SUGGESTED.x, platform: 'x', text: '', media: '', note: WEEKDAY[wd]! })
  }
  return out
}

/** اليومُ بعد `day` بـ`n` أيّام — بالتقويم وحده، بلا منطقة. */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

/** أوّلُ أحدٍ بعد `day` (الأسبوعُ يبدأ الأحد، كأيّام العمل). */
export function nextSunday(day: string): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return addDays(day, 7 - wd)
}

/** صفوفُ الشهر المقترحة: كلُّ يومٍ X مساءً، وأيّامُ العمل LinkedIn صباحًا — والنصُّ فارغٌ يكتبه المالك. */
export function monthRows(period: string): TemplateRow[] {
  const [y, m] = period.split('-').map(Number) as [number, number]
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return dayListRows(Array.from({ length: days }, (_, i) => `${period}-${pad(i + 1)}`))
}

/** قالبُ الأسبوع (D-408): سبعةُ أيّامٍ من `start`. */
export const weekRows = (start: string): TemplateRow[] => dayListRows(Array.from({ length: 7 }, (_, i) => addDays(start, i)))
/** قالبُ اليوم (D-408): يومٌ واحد بمنصّتيه. */
export const dayRows = (day: string): TemplateRow[] => dayListRows([day])

/** قالبُ أسبوعٍ أو يومٍ ملفًّا (D-408): نصُّه ونوعُه واسمُه للتنزيل. */
export function shortTemplate(kind: 'week' | 'day', start: string, format: 'md' | 'csv'): { body: string; type: string; name: string } {
  const rows = kind === 'week' ? weekRows(start) : dayRows(start)
  const title = (kind === 'week' ? 'خطّة أسبوع ' : 'خطّة يوم ') + start
  const type = format === 'csv' ? 'text/csv; charset=utf-8' : 'text/markdown; charset=utf-8'
  return { body: renderTemplate(start, format, rows, title), type, name: kind + '-' + start + '.' + format }
}

const mdCell = (v: string): string => v.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>')
const csvCell = (v: string): string => (/[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v)
const cells = (r: TemplateRow): string[] => [r.day, r.time, r.platform, r.text, r.media, r.note]

/** الملفُّ نفسُه بصيغتيه — والصفوفُ تُمرَّر فيُختبر الذهابُ والإياب. */
export function renderTemplate(period: string, format: 'md' | 'csv', rows: readonly TemplateRow[] = monthRows(period), title = `خطّة ${period}`): string {
  if (format === 'csv') return '﻿' + [TEMPLATE_HEADER.join(','), ...rows.map((r) => cells(r).map(csvCell).join(','))].join('\r\n') + '\r\n'
  return [
    `# ${title}`,
    '',
    'الساعةُ بتوقيتك. اكتب النصَّ في عموده، واترك الصفَّ بلا نصٍّ إن لم تُرده. انظر `plans/README.md`.',
    '',
    '| ' + TEMPLATE_HEADER.join(' | ') + ' |',
    '|' + TEMPLATE_HEADER.map(() => '---').join('|') + '|',
    ...rows.map((r) => '| ' + cells(r).map(mdCell).join(' | ') + ' |'),
    '',
  ].join('\n')
}

/** شرحُ الصيغة — يُنزَّل مع القالب ويوضع في `plans/README.md`. */
export function templateReadme(): string {
  return [
    '# خطط صدى الشهريّة',
    '',
    'ملفٌّ لكلّ شهر: `plans/YYYY-MM.md` (جدول markdown) أو `plans/YYYY-MM.csv`. صدى تقرؤه عند كلّ دفع، وتكتب حالَه في `plans/YYYY-MM.status.json` (لا تعدّله يدويًّا).',
    '',
    '| العمود | ما يُكتب فيه | مثال |',
    '|---|---|---|',
    '| اليوم | التاريخ `YYYY-MM-DD` داخل شهر الملفّ | 2026-12-03 |',
    '| الساعة | `HH:MM` بتوقيتك أنت (24 ساعة) | 09:00 |',
    '| المنصة | `linkedin` أو `x` | x |',
    '| النص | نصّ المنشور كما يُنشر؛ في الجدول اكتب `<br>` لسطرٍ جديد، وفي X سطر `---` يفصل تغريدات السلسلة | … |',
    '| الملف | مسار الصورة أو المقطع في المستودع (اختياريّ) | media/launch.png |',
    '| ملاحظة | لك وحدك، لا تُنشر | الإثنين |',
    '',
    '- الصفُّ بلا نصٍّ يُتخطّى بلا خطأ: القالبُ يأتي بكلّ أيّام الشهر وأنت تملأ ما تريد.',
    '- الخطأ يُقال بالسطر والعمود، مثل: «السطر 9، العمود «الساعة»: «25:00» ليست ساعة».',
    '- لا شيء يُنشر قبل أن تعتمد الشهر في صدى.',
    '- قالبا الأسبوع واليوم بالأعمدة نفسِها: انسخ كلَّ صفٍّ إلى ملفّ شهر يومه (أسبوعٌ يعبر حدَّ شهرين يُقسَم على ملفّين، وإلّا رُفض صفُّ الشهر الآخر «خارج شهر الملفّ»)، أو ارفعهما في «من ملفّ».',
    '- افحص الملفّ قبل دفعه: `npm run plan:check -- plans/2026-12.md` في مستودع صدى.',
    '- من يبني الخطّة آليًّا (وكيلٌ أو نموذج) يتبع دليلَه: ' + GUIDE_URL,
    '',
  ].join('\n')
}

/**
 * جدولُ markdown ← CSV **بأرقام السطور نفسِها**: كلُّ سطرٍ ليس صفَّ جدولٍ (العنوانُ والشرحُ وسطرُ `---`) سجلٌّ فارغ يُسقطه
 * `parseCsvRecords` بعد أن يحفظ رقمَه، فـ«السطر 9» في المعاينة هو السطرُ 9 في الملفّ. و`\|` حرفٌ في الخليّة، و`<br>` سطرٌ جديد.
 */
export function markdownToCsv(md: string): string {
  const text = md.charCodeAt(0) === 0xfeff ? md.slice(1) : md
  return text.split(/\r?\n/).map((line) => {
    const t = line.trim()
    if (!t.startsWith('|') || /^\|?\s*:?-{3,}/.test(t)) return ''
    const inner = t.replace(/^\|/, '').replace(/\|$/, '')
    const parts = inner.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|').replace(/<br\s*\/?>/gi, '\n'))
    return parts.map(csvCell).join(',')
  }).join('\n')
}

/** ملفٌّ فيه جدولُ markdown؟ — سطرُ عنوانٍ يبدأ بـ `|` يليه سطرُ `---`. */
export function looksMarkdown(text: string): boolean {
  return /^\s*\|.*\|\s*\r?\n\s*\|?\s*:?-{3,}/m.test(text)
}

export interface TemplateIssue { readonly line: number; readonly column: string; readonly message: string }
export const issueText = (i: TemplateIssue): string => (i.column === '' ? `السطر ${i.line}: ${i.message}` : `السطر ${i.line}، العمود «${i.column}»: ${i.message}`)

export interface TemplateRead {
  readonly rows: readonly (TemplateRow & { readonly line: number })[]
  readonly issues: readonly TemplateIssue[]
  /** صفوفٌ بلا نصٍّ تُركت (القالبُ يأتي بكلّ الأيّام). */
  readonly skipped: number
}

/** ‏وصفحةُ LinkedIn `linkedin-page` (D-417) — وجهةٌ ثانيةٌ بحسابها، ويُقبل `linkedin:page`. */
const PLATFORM: Readonly<Record<string, 'linkedin' | 'x' | 'linkedin-page'>> = {
  linkedin: 'linkedin', 'لينكدإن': 'linkedin', x: 'x', twitter: 'x', 'إكس': 'x', 'اكس': 'x',
  'linkedin-page': 'linkedin-page', 'linkedin:page': 'linkedin-page', 'صفحة لينكدإن': 'linkedin-page',
}

/** يتحقّق من القالب صفًّا صفًّا — **نقيّة**، وكلُّ خطأٍ بسطره وعموده بالعربيّة. و`period` يُلزم الأيّامَ بشهر الملفّ. */
export function readTemplate(text: string, format: 'md' | 'csv', period: string | null = null): TemplateRead {
  const recs = parseCsvRecords(format === 'md' ? markdownToCsv(text) : text)
  if (recs.length === 0) return { rows: [], issues: [{ line: 1, column: '', message: 'الملفّ فارغ أو بلا جدول' }], skipped: 0 }
  const head = recs[0]!.cells.map((h) => HEAD_OF[h.trim().toLowerCase()] ?? HEAD_OF[h.trim()] ?? null)
  const need: TemplateColumn[] = ['day', 'time', 'platform', 'text']
  const missing = need.filter((c) => !head.includes(c))
  if (missing.length > 0) return { rows: [], issues: [{ line: recs[0]!.line, column: '', message: `أعمدة ناقصة في العنوان: ${missing.map((c) => LABEL_OF[c]).join('، ')}` }], skipped: 0 }
  const at = (r: readonly string[], c: TemplateColumn): string => { const i = head.indexOf(c); return i < 0 ? '' : (r[i] ?? '').trim() }
  const issues: TemplateIssue[] = []
  const rows: (TemplateRow & { line: number })[] = []
  let skipped = 0
  for (const { cells: r, line } of recs.slice(1)) {
    const text = at(r, 'text')
    if (text === '') { skipped += 1; continue }
    const bad = (c: TemplateColumn, message: string): void => { issues.push({ line, column: LABEL_OF[c], message }) }
    const before = issues.length
    const day = at(r, 'day')
    const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
    const valid = dm !== null && (() => { const d = new Date(Date.UTC(+dm[1]!, +dm[2]! - 1, +dm[3]!)); return d.getUTCMonth() === +dm[2]! - 1 && d.getUTCDate() === +dm[3]! })()
    if (!valid) bad('day', `«${day}» ليس تاريخًا — اكتبه مثل ${period ?? '2026-12'}-03`)
    else if (period !== null && !day.startsWith(period + '-')) bad('day', `${day} خارج شهر الملفّ ${period}`)
    const time = at(r, 'time')
    const tm = /^(\d{1,2}):(\d{2})$/.exec(time)
    if (tm === null || +tm[1]! > 23 || +tm[2]! > 59) bad('time', `«${time}» ليست ساعة — اكتبها مثل 09:30 بتوقيتك`)
    const raw = at(r, 'platform')
    const platform = PLATFORM[raw.toLowerCase()] ?? null
    if (platform === null) bad('platform', raw === '' ? 'فارغة — اكتب linkedin أو linkedin-page أو x' : `«${raw}» لا أعرفها — linkedin أو linkedin-page أو x`)
    else {
      const len = platform === 'x' ? longestTweet('x', text) : text.length
      if (len > TEXT_LIMIT[platform]) bad('text', `${len} محرفًا و${platform === 'x' ? 'X تقبل' : platform === 'linkedin-page' ? 'صفحة LinkedIn تقبل' : 'LinkedIn تقبل'} ${TEXT_LIMIT[platform]}`)
    }
    if (issues.length === before && platform !== null) {
      rows.push({ line, day, time: time.padStart(5, '0'), platform, text, media: at(r, 'media'), note: at(r, 'note') })
    }
  }
  return { rows, issues, skipped }
}

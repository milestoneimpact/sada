/**
 * **الخطّةُ العريضة** (طلبُ المالك 2026-11-15، ملفُّه «خطة الشهر»): صفٌّ لكلّ يوم، ولكلّ منصّةٍ عمودان
 * «X: الصيغة» و«X: الوقت»، والفكرةُ في «العنوان / الفكرة». قارئُ الخطّة (`readPlan`) يريد صفًّا لكلّ منشور
 * بعمود «المنصة»، فيُفرَد الصفُّ العريضُ صفوفًا: منصّةٌ لها صيغةٌ في يومها تصير منشورًا بوقتها.
 *
 * وما فيه عمودُ «المنصة» يمرّ كما هو. ولا نداءَ ولا كلفة: تحويلُ جدولٍ إلى جدول.
 */
import { parseCsvRecords } from './import'

const cell = (v: string): string => /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v

/** «X: الصيغة» ← { platform: 'X', field: 'format' }. */
function platformColumn(h: string): { platform: string; field: 'format' | 'time' } | null {
  const m = /^\s*([^:：]+?)\s*[:：]\s*(.+?)\s*$/.exec(h)
  if (m === null) return null
  const f = m[2]!.replace(/[ً-ْ]/g, '')
  if (/^(الصيغة|الصيغه|format|النوع)$/i.test(f)) return { platform: m[1]!, field: 'format' }
  if (/^(الوقت|الساعة|time)$/i.test(f)) return { platform: m[1]!, field: 'time' }
  return null
}

const TEXT_HEADS = /^(العنوان\s*\/\s*الفكرة|العنوان|الفكرة|الموضوع|title|idea|topic)$/i
const DATE_HEADS = /^(التاريخ|date|day)$/i
const EMPTY = /^(|-|—|لا|لا يوجد|none|n\/a)$/i

export interface Widened {
  readonly csv: string
  /** هل كان الملفُّ عريضًا ففُرد؟ */
  readonly widened: boolean
  /** المنصّاتُ كما سمّاها الملفّ. */
  readonly platforms: readonly string[]
}

export function widenPlan(csv: string): Widened {
  const records = parseCsvRecords(csv)
  if (records.length < 2) return { csv, widened: false, platforms: [] }
  const head = records[0]!.cells.map((h) => h.trim())
  if (head.some((h) => /^(المنصة|المنصّة|platform)$/i.test(h))) return { csv, widened: false, platforms: [] }
  const cols = new Map<string, { format?: number; time?: number }>()
  head.forEach((h, i) => {
    const p = platformColumn(h)
    if (p === null) return
    const e = cols.get(p.platform) ?? {}
    e[p.field] = i
    cols.set(p.platform, e)
  })
  const di = head.findIndex((h) => DATE_HEADS.test(h))
  const ti = head.findIndex((h) => TEXT_HEADS.test(h))
  if (cols.size === 0 || di < 0 || ti < 0) return { csv, widened: false, platforms: [] }
  const out = ['التاريخ,الوقت,المنصة,النص']
  for (const { cells } of records.slice(1)) {
    const idea = (cells[ti] ?? '').trim()
    if (idea === '') continue
    for (const [platform, c] of cols) {
      const format = c.format === undefined ? '' : (cells[c.format] ?? '').trim()
      const time = c.time === undefined ? '' : (cells[c.time] ?? '').trim()
      if (c.format !== undefined && EMPTY.test(format)) continue
      const text = format === '' ? idea : idea + ' (الصيغة: ' + format + ')'
      out.push([(cells[di] ?? '').trim(), time, platform, text].map(cell).join(','))
    }
  }
  return { csv: out.join('\n'), widened: true, platforms: [...cols.keys()] }
}

/**
 * **ورقةُ الإرشادات** (ملفُّ المالك «خطة الشهر»، الورقةُ الثانية): صفٌّ لكلّ بند (الدور · الإيقاع · الوقت · الطول ·
 * الوسوم · الممنوعات …) وعمودٌ لكلّ منصّة. تُقرأ قواعدَ كتابةٍ لكلّ منصّة، لا منشورات.
 *
 * و«نفسها» أو «نفس …» في خانةٍ تعني ما في خانة المنصّة الأولى. ولا نداءَ ولا كلفة.
 */
import { parseCsvRecords } from './import'

export interface PlanRule { readonly item: string; readonly value: string }
/** المنصّةُ كما سمّاها الملفّ ← بنودُها. */
export type PlanRules = Readonly<Record<string, readonly PlanRule[]>>

const PLATFORM = /^(x|twitter|linkedin|youtube|tiktok|instagram|إكس|اكس|تويتر|لينكدإن|لينكد إن|يوتيوب|تيك توك|إنستغرام|انستغرام)$/i
const SAME = /^(نفسها|نفسه|نفس(\s.*)?|كما سبق|same)$/i
const CLIP = 300

export function readGuidelines(csv: string): PlanRules | null {
  const records = parseCsvRecords(csv)
  if (records.length < 2) return null
  const head = records[0]!.cells.map((h) => h.trim())
  const cols = head.map((h, i) => ({ h, i })).filter(({ h, i }) => i > 0 && PLATFORM.test(h))
  if (cols.length === 0) return null
  const out: Record<string, PlanRule[]> = Object.fromEntries(cols.map(({ h }) => [h, []]))
  for (const { cells } of records.slice(1)) {
    const item = (cells[0] ?? '').trim()
    if (item === '') continue
    const first = (cells[cols[0]!.i] ?? '').trim()
    for (const { h, i } of cols) {
      let value = (cells[i] ?? '').trim()
      if (SAME.test(value) && h !== cols[0]!.h) value = first
      if (value === '' || value === '—' || value === '-') continue
      out[h]!.push({ item: item.slice(0, 60), value: value.slice(0, CLIP) })
    }
  }
  return Object.values(out).some((r) => r.length > 0) ? out : null
}


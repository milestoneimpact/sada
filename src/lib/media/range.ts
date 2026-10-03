/**
 * مدى البايتات (D-182) — **`Range` يُقرأ هنا لا في R2**.
 *
 * `<video>` يطلب المقطعَ قطعًا: «bytes=0-» ثمّ «bytes=1048576-» حين يقفز المالكُ
 * إلى منتصفه. ومدًى واحدٌ هو ما يرسله كلُّ متصفّح؛ والمتعدّدُ والمعطوبُ يُعامَلان
 * كأنّه لم يُطلَب، فيُردّ الكائنُ كلُّه بثًّا — كما تقول RFC 9110 §14.2.
 */

/** ما يُمرَّر إلى `R2Bucket.get` — بشكل `R2Range` نفسه. */
export type ByteRange = { offset: number; length?: number } | { suffix: number }

export function parseRange(header: string | undefined): ByteRange | null {
  if (header === undefined) return null
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (m === null) return null
  const [, a = '', b = ''] = m
  if (a === '' && b === '') return null
  if (a === '') {
    const suffix = Number(b)
    return suffix > 0 ? { suffix } : null
  }
  const offset = Number(a)
  if (b === '') return { offset }
  const end = Number(b)
  return end < offset ? null : { offset, length: end - offset + 1 }
}

/** البايتُ الأوّلُ والأخيرُ فعلًا في كائنٍ بحجمه — أو `null` إن وقع المدى خارجه (416). */
export function resolveRange(r: ByteRange, size: number): { start: number; end: number } | null {
  if (size === 0) return null
  if ('suffix' in r) return { start: Math.max(0, size - r.suffix), end: size - 1 }
  if (r.offset >= size) return null
  const end = r.length === undefined ? size - 1 : Math.min(size - 1, r.offset + r.length - 1)
  return { start: r.offset, end }
}

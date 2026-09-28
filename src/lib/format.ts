/**
 * تنسيقُ ما يُقرأ.
 *
 * طابعٌ زمنيّ خام (`2026-09-05 08:12:44`) بيانٌ لا معلومة: القارئ يطرح
 * في رأسه ليعرف «متى». والوقت النسبيّ يقول ما يريد أن يعرفه، والدقيق
 * يبقى في `title` لمن أراده.
 */

/** يقرأ ما يكتبه SQLite (`YYYY-MM-DD HH:MM:SS` بـ UTC). */
export function parseSqliteUtc(value: string): Date | null {
  const normalized = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date
}

const UNITS: readonly (readonly [number, (n: number) => string])[] = [
  [60, () => 'الآن'],
  [3600, (n) => (n < 2 ? 'قبل دقيقة' : n === 2 ? 'قبل دقيقتين' : `قبل ${n} دقيقة`)],
  [86400, (n) => (n < 2 ? 'قبل ساعة' : n === 2 ? 'قبل ساعتين' : `قبل ${n} ساعة`)],
]

/** وقتٌ نسبيّ بالعربية، بمثنّى صحيح — «قبل ساعتين» لا «قبل ٢ ساعة». */
export function relativeTime(value: string, now: Date = new Date()): string {
  const date = parseSqliteUtc(value)
  if (date === null) return value
  const seconds = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000))

  if (seconds < 60) return UNITS[0]![1](seconds)
  if (seconds < 3600) return UNITS[1]![1](Math.floor(seconds / 60))
  if (seconds < 86400) return UNITS[2]![1](Math.floor(seconds / 3600))

  const days = Math.floor(seconds / 86400)
  if (days < 2) return 'أمس'
  if (days === 2) return 'قبل يومين'
  if (days < 11) return `قبل ${days} أيام`
  if (days < 30) return `قبل ${days} يوما`
  const months = Math.floor(days / 30)
  if (months < 2) return 'قبل شهر'
  if (months === 2) return 'قبل شهرين'
  if (months < 12) return `قبل ${months} أشهر`
  return 'قبل أكثر من سنة'
}

/** حجمٌ بالكيلوبايت — معادلةٌ واحدةٌ لكلّ صورةٍ ومقطع (D-158). */
export function kb(bytes: number): string {
  return `${Math.round(bytes / 1024)}KB`
}

/** مبلغٌ بدقّةٍ تناسب حجمه: الكسور الصغيرة تُفقَد بالتقريب إلى منزلتين. */
export function money(value: number): string {
  if (value === 0) return '0.00$'
  if (value < 0.01) return `${value.toFixed(4)}$`
  if (value < 1) return `${value.toFixed(3)}$`
  return `${value.toFixed(2)}$`
}

/**
 * ما بقي من المحاولات — **بعددٍ عربيٍّ صحيح** (D-161).
 *
 * كانت «بقيت 1 محاولات» و«بقيت 2 محاولات». والعربيّةُ تفرد وتثنّي وتجمع:
 * محاولةٌ واحدة، محاولتان، ثلاثُ محاولاتٍ إلى عشر، ثمّ إحدى عشرة محاولةً.
 */
export function attemptsLeft(n: number): string {
  if (n <= 0) return 'لم تبقَ محاولات'
  if (n === 1) return 'بقيت محاولةٌ واحدة'
  if (n === 2) return 'بقيت محاولتان'
  if (n <= 10) return `بقيت ${n} محاولات`
  return `بقيت ${n} محاولة`
}

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
  // ‏ومن ثلاثٍ إلى عشرٍ جمعٌ (D-180): «قبل 3 ساعات» لا «قبل 3 ساعة» — قاعدةُ `counted` نفسُها
  [3600, (n) => (n < 2 ? 'قبل دقيقة' : n === 2 ? 'قبل دقيقتين' : n <= 10 ? `قبل ${n} دقائق` : `قبل ${n} دقيقة`)],
  [86400, (n) => (n < 2 ? 'قبل ساعة' : n === 2 ? 'قبل ساعتين' : n <= 10 ? `قبل ${n} ساعات` : `قبل ${n} ساعة`)],
]

/**
 * وقتٌ نسبيّ بالعربية، بمثنّى صحيح — «قبل ساعتين» لا «قبل ٢ ساعة».
 *
 * **والجملةُ كاملةٌ بظرفها**: «قبل …» أو «الآن» أو «أمس»، فلا يسبقها المستدعي
 * بـ«منذ» (D-183) — كانت أربعةُ مواضع تكتب «منذ ${…}» فقُرئ «منذ قبل 24 دقيقة»
 * ثماني مرّاتٍ في الصفحة. وما يُسبَق بفعلٍ يُسبَق به: «وُضعت قبل ساعتين».
 */
export function relativeTime(value: string, now: Date = new Date()): string {
  const date = parseSqliteUtc(value)
  if (date === null) return value
  const seconds = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000))

  if (seconds < 60) return UNITS[0]![1](seconds)
  if (seconds < 3600) return UNITS[1]![1](Math.floor(seconds / 60))
  if (seconds < 86400) return UNITS[2]![1](Math.floor(seconds / 3600))

  const days = Math.floor(seconds / 86400)
  if (days < 2) return 'أمس'
  // ‏والعددُ من «counted» (D-183): «قبل يومين» و«قبل 5 أيّام» و«قبل 15 يومًا»
  if (days < 30) return `قبل ${counted(days, NOUNS.day, 'gen')}`
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

/**
 * ما بقي حتّى موعد — «بعد ساعتين» و«بعد 3 أيّام» (D-172).
 *
 * كان «القادم» يُقرأ بتاريخٍ مطلقٍ وحدَه، فيحسب المالكُ في رأسه كم بقي.
 * والماضي لا يُقال هنا: موعدٌ فات يُقرأ في حاله («تأخّر») لا في عدّه.
 */
export function untilTime(value: string, now: Date = new Date()): string {
  const date = parseSqliteUtc(value)
  if (date === null) return value
  const minutes = Math.floor((date.getTime() - now.getTime()) / 60_000)
  if (minutes < 1) return 'الآن'
  if (minutes < 60) return minutes === 1 ? 'بعد دقيقة' : minutes === 2 ? 'بعد دقيقتين' : `بعد ${minutes} دقيقة`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return hours === 1 ? 'بعد ساعة' : hours === 2 ? 'بعد ساعتين' : `بعد ${hours} ساعة`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'غدًا'
  if (days === 2) return 'بعد يومين'
  if (days <= 10) return `بعد ${days} أيّام`
  return `بعد ${days} يومًا`
}

/**
 * الوقتُ داخل إطار المعاينة — **قصيرٌ كما تكتبه المنصّات**: «5 د» و«3 س»
 * و«2 ي»، ثمّ التاريخُ بعد أسبوع. والمطلقُ بـ UTC خارج الإطار لا داخله.
 */
export function shortAgo(value: string, now: Date = new Date()): string {
  const date = parseSqliteUtc(value)
  if (date === null) return value
  const minutes = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 60_000))
  if (minutes < 1) return 'الآن'
  if (minutes < 60) return `${minutes} د`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} س`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} ي`
  const months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
  return `${date.getUTCDate()} ${months[date.getUTCMonth()]}`
}

/** صيغُ الاسم مع العدد: المفرد بوصفه، والمثنّى، وجمعُ القلّة، وتمييزُ الكثرة. */
export interface Noun {
  readonly one: string
  readonly two: string
  readonly few: string
  readonly many: string
  /** المفردُ منصوبًا («منشورًا واحدًا») ومجرورًا («منشورٍ واحد»)، والمثنّى بالياء («منشورَين»). */
  readonly oneAcc?: string
  readonly oneGen?: string
  readonly twoObl?: string
}

/** موقعُ المعدود في جملته: فاعلٌ أو مبتدأ، أو مفعول، أو مضافٌ إليه ومجرور. */
export type Case = 'nom' | 'acc' | 'gen'

/**
 * العددُ ومعدودُه **بعربيّةٍ صحيحة** (D-177) — امتدادًا لـ `attemptsLeft`.
 *
 * كانت اللوحةُ تكتب «2 يوما» و«5 منشورا خرجت» و«2 مصدرا ينتظر»، فتُقرأ آلةً
 * تترجم. والقاعدةُ أربع: واحدٌ بوصفه، واثنان بالمثنّى، ومن ثلاثةٍ إلى عشرة
 * بالجمع، وما فوقها بالتمييز المفرد. والصفرُ يقوله المنادي بجملته.
 */
export function counted(n: number, noun: Noun, kase: Case = 'nom'): string {
  // ‏«اعتمد منشورًا واحدًا» لا «اعتمد منشورٌ واحد» (D-182): الإعرابُ في الواحد والاثنين وحدهما
  if (n === 1) return kase === 'acc' ? noun.oneAcc ?? noun.one : kase === 'gen' ? noun.oneGen ?? noun.one : noun.one
  if (n === 2) return kase === 'nom' ? noun.two : noun.twoObl ?? noun.two
  if (n >= 3 && n <= 10) return `${n} ${noun.few}`
  return `${n} ${noun.many}`
}

/** المعدوداتُ التي تتكرّر في اللوحة — في موضعٍ واحدٍ لا في كلّ جملة. */
export const NOUNS = {
  draft: { one: 'مسوّدةٌ واحدة', two: 'مسوّدتان', few: 'مسوّدات', many: 'مسوّدة' },
  post: { one: 'منشورٌ واحد', two: 'منشوران', few: 'منشورات', many: 'منشورًا', oneAcc: 'منشورًا واحدًا', oneGen: 'منشورٍ واحد', twoObl: 'منشورَين' },
  source: { one: 'مصدرٌ واحد', two: 'مصدران', few: 'مصادر', many: 'مصدرًا' },
  image: { one: 'صورةٌ واحدة', two: 'صورتان', few: 'صور', many: 'صورة' },
  suggestion: { one: 'توصيةٌ واحدة', two: 'توصيتان', few: 'توصيات', many: 'توصية' },
  day: { one: 'يومٌ واحد', two: 'يومان', few: 'أيّام', many: 'يومًا', oneAcc: 'يومًا واحدًا', oneGen: 'يومٍ واحد', twoObl: 'يومين' },
  request: { one: 'طلبٌ واحد', two: 'طلبان', few: 'طلبات', many: 'طلبًا', oneAcc: 'طلبًا واحدًا', oneGen: 'طلبٍ واحد', twoObl: 'طلبَين' },
  service: { one: 'خدمةٌ واحدة', two: 'خدمتان', few: 'خدمات', many: 'خدمةً', oneAcc: 'خدمةً واحدة', oneGen: 'خدمةٍ واحدة', twoObl: 'خدمتَين' },
  cycle: { one: 'دورةٌ واحدة', two: 'دورتان', few: 'دورات', many: 'دورةً', oneAcc: 'دورةً واحدة', oneGen: 'دورةٍ واحدة', twoObl: 'دورتَين' },
  channel: { one: 'قناةٌ واحدة', two: 'قناتان', few: 'قنوات', many: 'قناةً' },
  scope: { one: 'نطاقٌ واحد', two: 'نطاقان', few: 'نطاقات', many: 'نطاقًا' },
  row: { one: 'صفٌّ واحد', two: 'صفّان', few: 'صفوف', many: 'صفًّا', oneAcc: 'صفًّا واحدًا', oneGen: 'صفٍّ واحد', twoObl: 'صفَّين' },
} as const satisfies Readonly<Record<string, Noun>>

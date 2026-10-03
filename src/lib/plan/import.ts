/**
 * خطّةُ المالك من ملفّ (D-181) — **تُقرأ، وتُعرض صفًّا صفًّا بمشكلاتها، ولا يُجدوَل
 * شيءٌ قبل اعتمادٍ واحدٍ منه**.
 *
 * سأل المالك: «لو لديّ خطّة، كيف أرفعها لتُنفَّذ تلقائيًّا؟». والخطّةُ الأسبوعيّةُ
 * (D-041) تقترح ولا تجدول، وتمرّ بنموذجٍ مدفوع. وهذه خطّتُه هو: ملفُّ CSV (ويُصدَّر من
 * Google Sheets أو Excel) بأعمدةٍ معروفة، **لا نموذجَ ولا نداءَ مدفوعًا** (D-006).
 *
 * والتنفيذُ يمرّ من حرّاس الجدولة نفسِها (`schedulePost`): معتمَدٌ، وحسابٌ نشطٌ على
 * منصّته، وموعدٌ في المستقبل. ولكلّ صفٍّ مفتاحٌ من محتواه (D-004): استيرادُ الملفّ
 * نفسِه مرّتين لا يصنع منشورًا مكرّرًا.
 */
import { atomically, type Db, type DbStatement } from '../tokens'
import type { LinkedAccount } from '../channels'
import { postLength } from '../draft/length'
import { localParts, validZone } from '../time/zone'
import { dbNow, schedulePost } from '../schedule/job'
import { captionProblem, isVideoPlatform, readyUpload, uploadMediaRow, videoChecks, type UploadRow, type VideoPlatform } from '../media/uploads'

/** أكبرُ ملفٍّ يُقرأ، وأكثرُ صفوفٍ تُستورَد مرّة — خطّةُ شهرٍ كثيفةٍ دونهما. */
export const MAX_PLAN_BYTES = 512 * 1024
export const MAX_PLAN_ROWS = 200

/** المنطقةُ حين لا يذكرها الملفّ ولا المتصفّح. */
export const DEFAULT_ZONE = 'Asia/Riyadh'

export type PlanPlatform = 'linkedin' | 'x' | 'youtube' | 'tiktok' | 'instagram'

/** حدُّ النصّ المكتوب — X بوزنه (D-071). وحدودُ نصّ المقطع في `captionProblem`. */
const TEXT_LIMIT: Readonly<Record<'linkedin' | 'x', number>> = { linkedin: 3000, x: 280 }

const LABEL: Readonly<Record<PlanPlatform, string>> = {
  linkedin: 'LinkedIn', x: 'X', youtube: 'YouTube', tiktok: 'TikTok', instagram: 'Instagram',
}

/**
 * أسماءُ المنصّات كما قد يكتبها المالك — بالعربيّة أو بالإنجليزيّة، بأيّ حالةٍ أحرف.
 * وما لا يُعرَف يُقال «منصّةٌ لا أعرفها» ولا يُخمَّن.
 */
const PLATFORM_NAMES: Readonly<Record<string, PlanPlatform>> = {
  linkedin: 'linkedin', 'لينكدإن': 'linkedin', 'لينكد إن': 'linkedin', 'لينكدان': 'linkedin',
  x: 'x', twitter: 'x', 'تويتر': 'x', 'إكس': 'x', 'اكس': 'x',
  youtube: 'youtube', 'يوتيوب': 'youtube', shorts: 'youtube',
  tiktok: 'tiktok', 'تيك توك': 'tiktok', 'تيكتوك': 'tiktok',
  instagram: 'instagram', 'إنستغرام': 'instagram', 'انستغرام': 'instagram', 'انستقرام': 'instagram', 'إنستقرام': 'instagram',
}

/** أعمدةُ الملفّ — والعنوانُ بالعربيّة أو بالإنجليزيّة. */
const COLUMNS: Readonly<Record<string, 'date' | 'time' | 'platform' | 'text' | 'video' | 'zone'>> = {
  date: 'date', 'التاريخ': 'date', day: 'date',
  time: 'time', 'الوقت': 'time', 'الساعة': 'time',
  platform: 'platform', 'المنصة': 'platform', 'المنصّة': 'platform',
  text: 'text', caption: 'text', 'النص': 'text', 'النصّ': 'text', 'نص المنشور': 'text', 'نصّ المنشور': 'text',
  video: 'video', 'الفيديو': 'video', 'المقطع': 'video',
  timezone: 'zone', zone: 'zone', 'المنطقة': 'zone', 'المنطقة الزمنية': 'zone',
}

/**
 * CSV بقاعدة RFC 4180: الفاصلةُ، والاقتباسُ المزدوجُ ومضاعفُه، والسطرُ داخل الاقتباس،
 * و`CRLF`، وعلامةُ BOM التي يضعها Excel في أوّل الملفّ. **ولا مكتبة**: ثلاثون سطرًا
 * يُختبَر كلُّ فرعٍ منها خيرٌ من اعتمادٍ لا نعرف ما يفعل بالعربيّة.
 */
export function parseCsv(input: string): string[][] {
  return parseCsvRecords(input).map((r) => r.cells)
}

/**
 * كـ `parseCsv` ومع كلّ سجلٍّ رقمُه في الملفّ (D-182) — **قبل إسقاط الفارغ**.
 * كان الرقمُ يُعَدّ بعد الإسقاط، فصفٌّ فاصلٌ بين أسبوعين يُزيح كلَّ ما بعده سطرًا،
 * ويصلح المالكُ صفًّا غيرَ الذي أُشير إليه. والرقمُ رقمُ الصفّ في الجدول لا سطرُ النصّ:
 * خليّةٌ بسطرين تبقى صفًّا واحدًا كما يراه في Sheets.
 */
export function parseCsvRecords(input: string): { readonly cells: string[]; readonly line: number }[] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++ } else quoted = false
      } else cell += c
      continue
    }
    if (c === '"' && cell === '') quoted = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell); cell = ''
      rows.push(row); row = []
    } else cell += c
  }
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row) }
  // ‏والسطورُ الفارغةُ (ومنها ما يتركه Excel في آخر الملفّ) تُسقَط — بعد أن يُحفظ رقمُ كلٍّ
  return rows
    .map((cells, i) => ({ cells, line: i + 1 }))
    .filter((r) => r.cells.some((x) => x.trim() !== ''))
}

/**
 * لحظةٌ محلّيّةٌ في منطقةٍ إلى UTC — **بالمنطقة لا بإزاحةٍ ثابتة**: الإزاحةُ تتبدّل مع
 * التوقيت الصيفيّ في مناطق المالك المحتملة. تُخمَّن ثمّ تُصحَّح مرّتين بما يقوله `Intl`.
 */
export function zonedToUtc(date: string, time: string, zone: string): Date | null {
  const d = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(date.trim())
  const t = /^(\d{1,2}):(\d{2})$/.exec(time.trim())
  if (d === null || t === null) return null
  const [y, mo, da, h, mi] = [Number(d[1]), Number(d[2]), Number(d[3]), Number(t[1]), Number(t[2])]
  if (mo < 1 || mo > 12 || da < 1 || da > 31 || h > 23 || mi > 59) return null
  const wanted = Date.UTC(y, mo - 1, da, h, mi)
  let guess = wanted
  for (let i = 0; i < 2; i++) {
    const p = localParts(new Date(guess), zone)
    const seen = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute)
    guess += wanted - seen
  }
  const check = localParts(new Date(guess), zone)
  // ‏تاريخٌ لا وجودَ له (31 فبراير) يتحرّك عند `Date.UTC` — فيُردّ ولا يُصحَّح بصمت
  if (check.year !== y || check.month !== mo || check.day !== da || check.hour !== h || check.minute !== mi) return null
  return new Date(guess)
}

export interface PlanRow {
  /** رقمُ السطر في الملفّ (العنوانُ ‏1) — ليجده المالكُ في جدوله. */
  readonly line: number
  readonly platform: PlanPlatform | null
  readonly platformRaw: string
  readonly date: string
  readonly time: string
  readonly zone: string
  /** المنطقةُ كما في عمود الملفّ — فارغةٌ إن لم يذكرها؛ ومنها المفتاحُ لا من كعكة المتصفّح. */
  readonly zoneCell: string
  readonly text: string
  readonly video: string
  /** الموعدُ بصيغة الجدولة (`YYYY-MM-DDTHH:MM` بـ UTC). */
  readonly whenUtc: string | null
  readonly accountId: string | null
  readonly accountName: string | null
  readonly uploadId: string | null
  /** ما يمنع هذا الصفّ — والصفُّ بلا مشكلةٍ وحدَه يُعتمَد. */
  readonly problems: readonly string[]
}

export interface PlanRead {
  readonly rows: readonly PlanRow[]
  /** ما يمنع الملفَّ كلَّه: عنوانٌ ناقص، أو ملفٌّ فارغ، أو صفوفٌ فوق الحدّ. */
  readonly fileProblems: readonly string[]
}

export interface PlanFacts {
  readonly accounts: readonly LinkedAccount[]
  readonly uploads: readonly UploadRow[]
  readonly now: Date
  /** منطقةُ المتصفّح من كعكته، أو الافتراض. */
  readonly zone: string
  /** المنصّاتُ التي ينشر لها صدى فعلًا (مرتبة `publish`). */
  readonly publishable: ReadonlySet<string>
  /**
   * ما هو مجدولٌ الآن (`scheduled_at` بصيغة القاعدة) — ليُقال «النصُّ نفسُه مجدولٌ في
   * موعدٍ آخر» قبل أن يُنشر مرّتين. واختياريٌّ: الاختبارُ بلا قاعدةٍ لا يحتاجه.
   */
  readonly scheduled?: readonly { readonly platform: string; readonly text: string; readonly at: string }[]
}

/** مفتاحُ مقارنةٍ للاسم: بلا فراغٍ زائدٍ ولا حالةِ أحرف. */
const norm = (s: string): string => s.trim().replace(/\s+/g, ' ').toLowerCase()

/** «2026-10-12 06:30:00» بـ UTC إلى «2026-10-12 09:30» بمنطقة المالك. */
function localStamp(dbAt: string, zone: string): string {
  const p = localParts(new Date(`${dbAt.replace(' ', 'T')}Z`), zone)
  const two = (n: number): string => String(n).padStart(2, '0')
  return `${p.year}-${two(p.month)}-${two(p.day)} ${two(p.hour)}:${two(p.minute)}`
}

/**
 * يقرأ الملفَّ صفًّا صفًّا — **نقيًّا بلا قاعدة**: الحقائقُ (الحساباتُ والمقاطعُ والآن)
 * تُمرَّر، فيُختبَر كلُّ فرع. والصفُّ يحمل مشكلاته كلَّها لا أوّلَها: من يصلح ملفَّه
 * مرّةً خيرٌ له من أن يصلحه ثلاثًا.
 */
export function readPlan(csv: string, facts: PlanFacts): PlanRead {
  const table = parseCsvRecords(csv)
  if (table.length === 0) return { rows: [], fileProblems: ['الملفُّ فارغ'] }
  const header = table[0]!.cells.map((h) => COLUMNS[norm(h)] ?? COLUMNS[h.trim()] ?? null)
  const missing = (['date', 'time', 'platform', 'text'] as const).filter((c) => !header.includes(c))
  if (missing.length > 0) {
    const names = { date: 'date / التاريخ', time: 'time / الوقت', platform: 'platform / المنصة', text: 'text / النص' }
    return { rows: [], fileProblems: [`أعمدةٌ ناقصة في السطر الأوّل: ${missing.map((m) => names[m]).join('، ')}`] }
  }
  const body = table.slice(1)
  if (body.length === 0) return { rows: [], fileProblems: ['لا صفوفَ تحت العنوان'] }
  if (body.length > MAX_PLAN_ROWS) {
    return { rows: [], fileProblems: [`${body.length} صفًّا — والحدُّ ${MAX_PLAN_ROWS} في الملفّ الواحد. قسّمه ملفّين`] }
  }

  const cell = (r: string[], k: 'date' | 'time' | 'platform' | 'text' | 'video' | 'zone'): string => {
    const i = header.indexOf(k)
    return i < 0 ? '' : (r[i] ?? '').trim()
  }
  const seen = new Map<string, number>()
  const rows = body.map(({ cells: r, line }): PlanRow => {
    const problems: string[] = []
    const platformRaw = cell(r, 'platform')
    const platform = PLATFORM_NAMES[norm(platformRaw)] ?? null
    const date = cell(r, 'date')
    const time = cell(r, 'time')
    const text = cell(r, 'text')
    const video = cell(r, 'video')
    const zoneRaw = cell(r, 'zone')
    const zone = zoneRaw === '' ? facts.zone : (validZone(zoneRaw) ?? '')

    if (platform === null) problems.push(platformRaw === '' ? 'المنصّةُ فارغة' : `منصّةٌ لا أعرفها: «${platformRaw}»`)
    else if (!facts.publishable.has(platform)) problems.push(`${LABEL[platform]} لا ينشر لها صدى بعد`)
    if (zone === '') problems.push(`منطقةٌ زمنيّةٌ لا أعرفها: «${zoneRaw}» — مثل Asia/Riyadh`)

    let whenUtc: string | null = null
    const at = zone === '' ? null : zonedToUtc(date, time, zone)
    if (at === null) problems.push(`موعدٌ غيرُ مفهوم: «${date} ${time}» — التاريخ YYYY-MM-DD والوقت HH:MM`)
    else if (at.getTime() <= facts.now.getTime() + 15 * 60_000) problems.push('الموعدُ مضى أو أقربُ من ربع ساعة')
    else whenUtc = at.toISOString().slice(0, 16)

    // ‏ملفٌّ حُفظ بترميز Windows-1256 يُقرأ محارفَ بديلة — والمسارُ يردّه، وهذا حارسٌ ثانٍ
    if ([text, video, platformRaw].some((x) => x.includes('\uFFFD'))) {
      problems.push('محارفُ تالفة — احفظ الملفّ بصيغة «CSV UTF-8» ثمّ ارفعه')
    }
    if (text === '') problems.push('النصُّ فارغ')
    else if (platform !== null && isVideoPlatform(platform)) {
      // ‏وصفُ YouTube يُردّ بعد رفع المقطع فتضيع حصّةُ يومه (D-182): يُقال الآن لا بعد ساعات
      const why = captionProblem(platform, text)
      if (why !== null) problems.push(why)
    } else if (platform !== null) {
      const length = platform === 'x' ? postLength(text, 'x') : text.length
      if (length > TEXT_LIMIT[platform]) problems.push(`النصُّ ${length} محرفًا و${LABEL[platform]} تقبل ${TEXT_LIMIT[platform]}`)
    }

    // ‏المقطعُ يُطابَق باسمه في «فيديوهاتك» — الأحدثُ إن تكرّر الاسم
    let uploadId: string | null = null
    if (video !== '') {
      const found = facts.uploads.find((u) => u.status === 'ready' && norm(u.name) === norm(video))
      if (found === undefined) problems.push(`لا مقطعَ مرفوعًا باسم «${video}» — ارفعه في «فيديوهاتك» أوّلًا`)
      else if (platform === 'linkedin' || platform === 'x') problems.push(`${LABEL[platform]} لا تنشر المقطعَ من صدى بعد — اتركه فارغًا`)
      else if (platform !== null) {
        const check = videoChecks(found).find((c) => c.platform === (platform as VideoPlatform))
        if (check?.level === 'block') problems.push(`المقطع: ${check.note}`)
        else uploadId = found.id
      }
    } else if (platform === 'youtube' || platform === 'tiktok' || platform === 'instagram') {
      problems.push(`${LABEL[platform]} تحتاج مقطعًا — اكتب اسمَه كما في «فيديوهاتك»`)
    }

    // ‏الحسابُ: أوّلُ حسابٍ نشطٍ على المنصّة — وبلا حسابٍ لا موعد. وصفحةُ الشركة على
    // LinkedIn لا تُختار (D-087): النشرُ باسمها لم يُبنَ، فمنشورُها يُردّ ساعةَ النشر
    const page = (a: LinkedAccount): boolean => a.platform === 'linkedin' && a.kind === 'org'
    const account = platform === null ? undefined
      : facts.accounts.find((a) => a.platform === platform && a.status === 'active' && !page(a))
    if (platform !== null && account === undefined) {
      problems.push(facts.accounts.some((a) => a.platform === platform && a.status === 'active' && page(a))
        ? 'المتّصلُ على LinkedIn صفحةُ شركة — والنشرُ باسمها لم يُبنَ بعد؛ اربط حسابَك الشخصيّ'
        : `لا حسابَ متّصلًا على ${LABEL[platform]} — اربطه أوّلًا`)
    }

    // ‏النصُّ نفسُه مجدولٌ على المنصّة نفسِها في موعدٍ آخر: الملفُّ نفسُه من منطقةٍ أخرى،
    // أو صفٌّ نُقل موعدُه — وكلاهما نشرٌ مكرّر. والموعدُ نفسُه ليس مشكلة: هو المنشورُ نفسُه
    if (platform !== null && whenUtc !== null && text !== '') {
      const at = `${whenUtc.replace('T', ' ')}:00`
      const twin = (facts.scheduled ?? []).find((s) => s.platform === platform && s.at !== at && norm(s.text) === norm(text))
      if (twin !== undefined) {
        problems.push(`النصُّ نفسُه مجدولٌ على ${LABEL[platform]} في ${localStamp(twin.at, zone === '' ? facts.zone : zone)} — اسحبه أوّلًا أو غيّر النصّ`)
      }
    }

    const dupKey = [platform, whenUtc, norm(text), norm(video)].join('|')
    const first = seen.get(dupKey)
    if (first !== undefined) problems.push(`مكرّرٌ للسطر ${first}`)
    else seen.set(dupKey, line)

    return {
      line, platform, platformRaw, date, time, zone, zoneCell: zoneRaw, text, video, whenUtc,
      accountId: account?.id ?? null, accountName: account?.displayName ?? null, uploadId, problems,
    }
  })
  return { rows, fileProblems: [] }
}

/**
 * مفتاحُ الصفّ (D-004): من منصّته وموعده **كما كُتب في الملفّ** ونصّه ومقطعه — فالصفُّ
 * نفسُه مرّتين منشورٌ واحد. كان الموعدُ بعد تحويله إلى UTC، والتحويلُ بمنطقة المتصفّح
 * حين يخلو الملفُّ من عمودها؛ فالملفُّ نفسُه من هاتفٍ بمنطقةٍ أخرى صنع مفاتيحَ جديدة
 * ونُشر كلُّ صفٍّ مرّتين (D-182). والمنطقةُ تدخل المفتاحَ إن كتبها الملفّ وحده.
 */
export async function rowKey(row: PlanRow): Promise<string> {
  // ‏«2026-10-2» و«9:30» كـ«2026-10-02» و«09:30»: صيغتان لموعدٍ واحد
  const pad = (s: string): string => s.trim().replace(/(^|[-:])(\d)(?=$|[-:])/g, '$10$2')
  const raw = [row.platform, pad(row.date), pad(row.time), row.zoneCell.trim(), norm(row.text), norm(row.video)].join('|')
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))
  return `plan:${[...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32)}`
}

export interface ApplyOutcome {
  readonly line: number
  readonly result: 'scheduled' | 'exists' | 'failed'
  /** سببُ الفشل، أو حالُ المنشور الموجود («مجدولٌ» أو «نُشر» أو «فشل»). */
  readonly reason?: string
}

/** حالُ منشورٍ موجودٍ بالمفتاح نفسِه — يقولها المنادي كما هي لا «كان مجدولًا» لكلّ حال. */
const EXISTING: Readonly<Record<string, string>> = {
  queued: 'مجدولٌ من قبل',
  published: 'نُشر من قبل',
  failed: 'فشل نشرُه من قبل — أعده من بطاقته',
}

/**
 * يعتمد الصفوفَ السليمةَ ويجدولها — **والاعتمادُ اعتمادُ المالك**: ضغطَ «اعتمد وجدوِل»
 * على جدولٍ رآه صفًّا صفًّا. وكلُّ صفٍّ يمرّ من `schedulePost` بحرّاسه، فحسابٌ سقط
 * بين القراءة والاعتماد يُردّ صفُّه ولا يُجدوَل.
 *
 * و`shown` أرقامُ السطور التي عرضتها المعاينةُ جاهزةً (D-182): **ما لم يُعرَض جاهزًا لا
 * يُجدوَل**، وما عُرض جاهزًا ثمّ صارت له مشكلةٌ يُردّ بها ولا يُسقَط صامتًا.
 *
 * والمنشورُ ووسيطُه يُكتبان معًا أو لا يُكتبان (`atomically`). ومفتاحٌ موجودٌ لا يعني
 * «مجدولٌ» دائمًا: المرفوضُ يُحرَّر مفتاحُه ويُكتب من جديد، والمعتمَدُ بلا موعدٍ (جدولةٌ
 * سقطت في المرّة الأولى) يُكمَّل وسيطُه ويُجدوَل — فإعادةُ الملفّ تُصلح ولا تكذب.
 */
export async function applyPlan(
  db: Db,
  rows: readonly PlanRow[],
  by: string,
  now: Date,
  shown?: ReadonlySet<number>,
): Promise<ApplyOutcome[]> {
  const out: ApplyOutcome[] = []
  for (const row of rows) {
    if (shown !== undefined && !shown.has(row.line)) continue
    if (row.problems.length > 0 || row.platform === null || row.whenUtc === null || row.accountId === null) {
      if (shown !== undefined) out.push({ line: row.line, result: 'failed', reason: row.problems.join('؛ ') })
      continue
    }
    const key = await rowKey(row)
    const existing = await db
      .prepare('SELECT id, status FROM posts WHERE idempotency_key = ?')
      .bind(key)
      .first<{ id: string; status: string }>()
    const upload = row.uploadId === null ? null : await readyUpload(db, row.uploadId)
    if (row.uploadId !== null && upload === null) {
      out.push({ line: row.line, result: 'failed', reason: 'المقطعُ لم يعد جاهزًا' })
      continue
    }

    let postId: string
    if (existing !== null && (existing.status === 'approved' || existing.status === 'edited')) {
      // ‏كُتب ولم يُجدوَل: يُكمَّل وسيطُه إن نقص، ثمّ يُجدوَل
      postId = existing.id
      if (row.uploadId !== null && upload !== null) {
        const has = await db.prepare('SELECT 1 AS x FROM media WHERE post_id = ? AND upload_id = ?').bind(postId, row.uploadId).first()
        if (has === null) await uploadMediaRow(db, postId, row.uploadId, upload).run()
      }
    } else if (existing !== null && existing.status !== 'rejected') {
      out.push({ line: row.line, result: 'exists', reason: EXISTING[existing.status] ?? existing.status })
      continue
    } else {
      const statements: DbStatement[] = []
      if (existing !== null) {
        // ‏رفضه المالكُ ثمّ اعتمد الملفَّ من جديد: المرفوضُ يبقى سجلًّا، ومفتاحُه يُحرَّر (كـ D-088)
        statements.push(db
          .prepare(`UPDATE posts SET idempotency_key = idempotency_key || ':rejected:' || id WHERE id = ?`)
          .bind(existing.id))
      }
      postId = crypto.randomUUID()
      statements.push(db
        .prepare(
          `INSERT INTO posts (id, platform, type, text, status, idempotency_key, model, approved_by, approved_at, rationale)
           VALUES (?, ?, 'text', ?, 'approved', ?, 'owner', ?, ?, 'من خطّةٍ مستورَدة')`,
        )
        .bind(postId, row.platform, row.text, key, by, dbNow(now)))
      if (row.uploadId !== null && upload !== null) statements.push(uploadMediaRow(db, postId, row.uploadId, upload))
      await atomically(db, statements)
    }
    const scheduled = await schedulePost(db, postId, row.accountId, row.whenUtc, now)
    out.push(scheduled.ok
      ? { line: row.line, result: 'scheduled' }
      : { line: row.line, result: 'failed', reason: `اعتُمد ولم يُجدوَل: ${scheduled.reason}` })
  }
  return out
}

/** نموذجُ الملفّ — العنوانُ وصفّان يُريان الصيغة، ويُفتح في Excel وGoogle Sheets. */
export const PLAN_TEMPLATE = '﻿' + [
  'date,time,platform,text,video',
  '2026-10-12,09:30,linkedin,"المعلمُ ليس نقطةً على الخطّ الزمنيّ — هو نقطةُ قرار.",',
  '2026-10-13,18:00,youtube,"ثلاثُ طبقاتٍ للحوكمة في دقيقة",قيادة المعالم.mp4',
].join('\r\n') + '\r\n'

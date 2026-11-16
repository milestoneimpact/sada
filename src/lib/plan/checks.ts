/**
 * **بوّابةُ الفحص** (D-383 · المرحلة ٥) — دالّةٌ خالصة `planChecks` تقرأ بنودَ مسوّدةٍ مع منشورات المنظّمة في الأيّام نفسِها،
 * وتعيد ما تجده بجدول القواعد في `docs/plan-unified/DESIGN.md` («التعارضات والازدحام») قاعدةً قاعدة.
 *
 * - **كلُّ الحساب بتوقيت المالك** (`day` و`minutes` محلّيّان)، فالمُستدعي يحوّل ما في `posts.scheduled_at` قبل أن يمرّره.
 *   وبهذا لا تقرأ الدالّةُ ساعةً ولا منطقةً ولا قاعدة.
 * - **الشدّةُ اثنتان:** `warn` يُقال ولا يمنع، و`block` يمنع البندَ وحده (أو المنصّةَ لحسابٍ غائب) ويبقى مسوّدة.
 * - **والإصلاحُ بضغطة** خالصٌ كذلك (`planFix`): يعيد نقلاتٍ (يومٌ وساعةٌ محلّيّان) أو بنودًا تُحذف، والمسارُ يطبّقها.
 *
 * والعتباتُ من `schedule_rules` (0061)، وغيابُ الصفّ يعني `DEFAULT_RULES` كما كُتبت في الترحيل.
 */
import { platformLabel } from '../oauth/providers'

export interface ScheduleRules {
  /** سقفُ كلّ منصّةٍ في اليوم، وما لم يُذكر بلا سقف. */
  readonly platformCaps: Readonly<Record<string, number>>
  readonly dailyTotalCap: number
  readonly minGapMinutes: number
  /** `HH:MM` بتوقيت المالك. */
  readonly quietStart: string
  readonly quietEnd: string
  readonly jitterMinutes: number
}

export const DEFAULT_RULES: ScheduleRules = {
  platformCaps: { x: 3, linkedin: 2 },
  dailyTotalCap: 5,
  minGapMinutes: 90,
  quietStart: '23:00',
  quietEnd: '07:00',
  jitterMinutes: 7,
}

/** موعدٌ بتوقيت المالك: يومُه ودقيقتُه من منتصف ليله. */
export interface LocalAt {
  readonly day: string
  readonly minutes: number
}

export interface CheckItem {
  /** بصمةُ البند كما يرسلها النموذج، وبها يُطبَّق الإصلاح. */
  readonly key: string
  readonly platform: string
  /** الحسابُ الناشر، وغيابُه حسابُ المنصّة الوحيد. */
  readonly account?: string | null
  readonly at: LocalAt | null
  readonly text: string | null
  /** بصمةُ النصّ أو المادّة (مصدرُها ورقمُها) — بها يُكشف المكرَّر من مصدرين. */
  readonly contentKey?: string | null
  readonly mediaMissing?: boolean
  readonly kind?: string | null
  /** حالُ منشوره إن كان: ما نُشر أو جُدول لا يُحرَّك آليًّا. */
  readonly status?: string | null
}

export interface OtherPost {
  readonly id: string
  readonly platform: string
  readonly account?: string | null
  readonly at: LocalAt
  readonly planId: string | null
  readonly contentKey?: string | null
}

export interface CheckInput {
  readonly planId: string | null
  readonly items: readonly CheckItem[]
  /** منشوراتُ المنظّمة غير المرفوضة في الأيّام نفسِها، من خارج هذه المسوّدة. */
  readonly others: readonly OtherPost[]
  /** المنصّاتُ التي لها حسابٌ نشط. */
  readonly activePlatforms: readonly string[]
  readonly now: LocalAt
}

export type RuleId =
  | 'same_slot' | 'exact' | 'duplicate' | 'other_plan' | 'near_post' | 'platform_cap' | 'daily_total'
  | 'quiet' | 'past' | 'no_text' | 'no_media' | 'no_account' | 'bad_format'

/** الإصلاحاتُ الثلاثةُ بضغطة (`spread` · `shift` · `merge`)، وما سواها رابطٌ إلى حيث يُصلَح بيد المالك. */
export type FixId = 'shift' | 'spread' | 'merge' | 'quiet' | 'next_day' | 'edit' | 'upload' | 'connect' | 'format' | 'adopt'

export type Severity = 'warn' | 'block'

export interface Finding {
  readonly rule: RuleId
  readonly severity: Severity
  /** البنودُ المعنيّة بمفاتيحها، بترتيبها في الخطّة. */
  readonly keys: readonly string[]
  readonly day?: string
  readonly platform?: string
  readonly fix: FixId
  readonly message: string
}

export const RULE_LABEL: Readonly<Record<RuleId, string>> = {
  same_slot: 'نفس الخانة',
  exact: 'تطابق تامّ',
  duplicate: 'محتوى مكرّر',
  other_plan: 'تداخل مع خطّة أخرى',
  near_post: 'تداخل مع منشور قائم',
  platform_cap: 'سقف المنصّة اليوميّ',
  daily_total: 'الحمل اليوميّ الكلّيّ',
  quiet: 'ساعات الهدوء',
  past: 'موعد مضى',
  no_text: 'نصّ ناقص',
  no_media: 'وسيط ناقص',
  no_account: 'حساب غائب',
  bad_format: 'صيغة غير مناسبة',
}

/** ما يُفعل بضغطة: الثلاثةُ أزرارٌ تُرسل POST، وما سواها رابط. */
export const FIX_LABEL: Readonly<Record<FixId, string>> = {
  shift: 'أزِح',
  spread: 'وزّع',
  merge: 'ادمج',
  quiet: 'انقل إلى 08:00',
  next_day: 'انقل إلى أقرب يوم',
  edit: 'افتح المحرّر',
  upload: 'ارفع الوسيط',
  connect: 'اربط الحساب',
  format: 'غيّر الصيغة',
  adopt: 'انقل إلى خطّة الشهر',
}

/** ما يُطبَّق على الخادم بضغطةٍ واحدة. */
export const ONE_TAP: readonly FixId[] = ['shift', 'spread', 'merge', 'quiet', 'next_day']

const nameOf = (p: string): string => platformLabel(p)

/** الصيغُ التي لا تناسب منصّة: السلسلةُ لـ X وحدها. */
const FORMAT_FITS: Readonly<Record<string, readonly string[]>> = { thread: ['x'] }

export function hhmm(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0')
}

export function minutesOf(time: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time)
  return m === null ? null : Number(m[1]) * 60 + Number(m[2])
}

const dayNo = (day: string): number => Math.round(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10))) / 86_400_000)
const dayOf = (n: number): string => new Date(n * 86_400_000).toISOString().slice(0, 10)
/** دقيقةٌ مطلقةٌ محلّيّة — للمقارنة عبر منتصف الليل. */
const abs = (a: LocalAt): number => dayNo(a.day) * 1440 + a.minutes
export const addDays = (day: string, n: number): string => dayOf(dayNo(day) + n)

/** أتقع الدقيقةُ في ساعات الهدوء؟ النطاقُ قد يعبر منتصف الليل (23:00 إلى 07:00). */
export function inQuiet(minutes: number, rules: ScheduleRules): boolean {
  const s = minutesOf(rules.quietStart)
  const e = minutesOf(rules.quietEnd)
  if (s === null || e === null || s === e) return false
  return s < e ? minutes >= s && minutes < e : minutes >= s || minutes < e
}

const accountOf = (x: { platform: string; account?: string | null }): string => x.platform + '|' + (x.account ?? '')
const capOf = (rules: ScheduleRules, platform: string): number | null => {
  const n = rules.platformCaps[platform]
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null
}

/** هل يُحرَّك البندُ آليًّا؟ ما نُشر لا يُمسّ. */
const movable = (i: CheckItem): boolean => i.status !== 'published'

export function planChecks(input: CheckInput, rules: ScheduleRules = DEFAULT_RULES): Finding[] {
  const out: Finding[] = []
  const gap = Math.max(0, rules.minGapMinutes)
  const nowAbs = abs(input.now)
  const active = new Set(input.activePlatforms)
  const timed = input.items.filter((i): i is CheckItem & { at: LocalAt } => i.at !== null)

  // ‏١ و٢. نفسُ الخانة وتطابقٌ تامّ — بين بنود المسوّدة على الحساب نفسِه
  const byAccount = new Map<string, (CheckItem & { at: LocalAt })[]>()
  for (const i of timed) byAccount.set(accountOf(i), [...(byAccount.get(accountOf(i)) ?? []), i])
  for (const list of byAccount.values()) {
    const sorted = [...list].sort((a, b) => abs(a.at) - abs(b.at))
    for (let k = 1; k < sorted.length; k += 1) {
      const a = sorted[k - 1]!
      const b = sorted[k]!
      const d = abs(b.at) - abs(a.at)
      if (d === 0) {
        out.push({ rule: 'exact', severity: 'block', keys: [a.key, b.key], day: b.at.day, platform: b.platform, fix: 'shift',
          message: 'منشوران على ' + nameOf(b.platform) + ' في الدقيقة نفسِها (' + hhmm(b.at.minutes) + ')' })
      } else if (d < gap) {
        out.push({ rule: 'same_slot', severity: 'warn', keys: [a.key, b.key], day: b.at.day, platform: b.platform, fix: 'shift',
          message: 'منشوران على ' + nameOf(b.platform) + ' بينهما ' + String(d) + ' دقيقة، والفاصل الأدنى ' + String(gap) })
      }
    }
  }

  // ‏٣. محتوى مكرّر — بصمةُ النصّ أو المادّة نفسُها على المنصّة نفسِها
  const byContent = new Map<string, string[]>()
  for (const i of input.items) {
    const c = i.contentKey ?? (i.text === null || i.text.trim() === '' ? null : 't:' + i.text.replace(/\s+/g, ' ').trim())
    if (c === null) continue
    const k = i.platform + '|' + c
    byContent.set(k, [...(byContent.get(k) ?? []), i.key])
  }
  for (const [k, keys] of byContent) {
    if (keys.length < 2) continue
    out.push({ rule: 'duplicate', severity: 'warn', keys, platform: k.split('|')[0]!, fix: 'merge',
      message: String(keys.length) + ' بنود بالمحتوى نفسِه على ' + nameOf(k.split('|')[0]!) })
  }

  // ‏٤ و٥. تداخلٌ مع خطّةٍ أخرى، ومع منشورٍ يدويٍّ أو مجدول
  const otherPlanDays = new Set(input.others.filter((o) => o.planId !== null && o.planId !== input.planId).map((o) => o.at.day))
  const overlapKeys = timed.filter((i) => otherPlanDays.has(i.at.day)).map((i) => i.key)
  if (overlapKeys.length > 0) {
    out.push({ rule: 'other_plan', severity: 'warn', keys: overlapKeys, fix: 'adopt',
      message: 'خطّةٌ أخرى تغطّي ' + String(new Set(timed.filter((i) => otherPlanDays.has(i.at.day)).map((i) => i.at.day)).size) + ' من أيّام هذه الخطّة' })
  }
  for (const i of timed) {
    const near = input.others.find((o) => accountOf(o) === accountOf(i) && Math.abs(abs(o.at) - abs(i.at)) < gap)
    if (near === undefined) continue
    out.push({ rule: 'near_post', severity: 'warn', keys: [i.key], day: i.at.day, platform: i.platform, fix: 'shift',
      message: 'منشورٌ قائم على ' + nameOf(i.platform) + ' في ' + hhmm(near.at.minutes) + '، أقربُ من الفاصل الأدنى' })
  }

  // ‏٦ و٧. سقفُ المنصّة اليوميّ (تحذيرٌ، ثمّ منعٌ عند الضعف)، والحملُ اليوميّ الكلّيّ
  const days = [...new Set(timed.map((i) => i.at.day))].sort()
  for (const day of days) {
    const mine = timed.filter((i) => i.at.day === day)
    const theirs = input.others.filter((o) => o.at.day === day)
    for (const platform of [...new Set(mine.map((i) => i.platform))].sort()) {
      const cap = capOf(rules, platform)
      if (cap === null) continue
      const n = mine.filter((i) => i.platform === platform).length + theirs.filter((o) => o.platform === platform).length
      if (n <= cap) continue
      out.push({ rule: 'platform_cap', severity: n >= cap * 2 ? 'block' : 'warn', keys: mine.filter((i) => i.platform === platform).map((i) => i.key), day, platform, fix: 'spread',
        message: String(n) + ' على ' + nameOf(platform) + ' في ' + day + '، والسقف ' + String(cap) })
    }
    const total = mine.length + theirs.length
    if (rules.dailyTotalCap > 0 && total > rules.dailyTotalCap) {
      out.push({ rule: 'daily_total', severity: 'warn', keys: mine.map((i) => i.key), day, fix: 'spread',
        message: String(total) + ' منشورات في ' + day + '، والحمل الأقصى ' + String(rules.dailyTotalCap) })
    }
  }

  // ‏٨ إلى ١٣. ما يخصّ البندَ وحده
  for (const i of input.items) {
    if (i.at !== null && inQuiet(i.at.minutes, rules)) {
      out.push({ rule: 'quiet', severity: 'warn', keys: [i.key], day: i.at.day, platform: i.platform, fix: 'quiet',
        message: 'الساعة ' + hhmm(i.at.minutes) + ' داخل ساعات الهدوء (' + rules.quietStart + ' إلى ' + rules.quietEnd + ')' })
    }
    if (i.at !== null && movable(i) && abs(i.at) < nowAbs) {
      out.push({ rule: 'past', severity: 'block', keys: [i.key], day: i.at.day, platform: i.platform, fix: 'next_day', message: 'موعده ' + i.at.day + ' ' + hhmm(i.at.minutes) + ' مضى' })
    }
    if (i.text === null || i.text.trim() === '') {
      out.push({ rule: 'no_text', severity: 'block', keys: [i.key], platform: i.platform, fix: 'edit', message: 'لا نصّ لهذا البند بعد' })
    }
    if (i.mediaMissing === true) {
      out.push({ rule: 'no_media', severity: 'block', keys: [i.key], platform: i.platform, fix: 'upload', message: 'وسيطه لم يُرفع بعد' })
    }
    const fits = i.kind == null ? undefined : FORMAT_FITS[i.kind]
    if (fits !== undefined && !fits.includes(i.platform)) {
      out.push({ rule: 'bad_format', severity: 'block', keys: [i.key], platform: i.platform, fix: 'format', message: 'صيغة «' + String(i.kind) + '» لا تناسب ' + nameOf(i.platform) })
    }
  }
  for (const platform of [...new Set(input.items.map((i) => i.platform))].sort()) {
    if (active.has(platform)) continue
    out.push({ rule: 'no_account', severity: 'block', keys: input.items.filter((i) => i.platform === platform).map((i) => i.key), platform, fix: 'connect',
      message: 'لا حساب نشط على ' + nameOf(platform) + '، فلا يُجدوَل له شيء' })
  }
  return out
}

/** البنودُ الممنوعة — لا تُجدوَل وتبقى مسوّدة، وبقيّةُ الخطّة تُعتمد. */
export function blockedKeys(findings: readonly Finding[]): Set<string> {
  return new Set(findings.filter((f) => f.severity === 'block').flatMap((f) => f.keys))
}

/** سطرٌ واحد: «٣ تحذيرات، ٢ ممنوعة». */
export function summarize(findings: readonly Finding[]): { readonly warn: number; readonly block: number; readonly blockedItems: number } {
  return {
    warn: findings.filter((f) => f.severity === 'warn').length,
    block: findings.filter((f) => f.severity === 'block').length,
    blockedItems: blockedKeys(findings).size,
  }
}

export type FixPlan =
  | { readonly kind: 'move'; readonly moves: readonly { readonly key: string; readonly to: LocalAt }[] }
  | { readonly kind: 'remove'; readonly keys: readonly string[] }
  | { readonly kind: 'none'; readonly reason: string }

const STEP = 15

/**
 * **الإصلاحُ بضغطة** — خالص. يعيد ما يُنقل أو يُحذف ليزول ما وُجد، دون أن يصنع تعارضًا جديدًا على الحساب نفسِه:
 *
 * - `shift`: يُبقي أوّلَ البنود ويُزيح الباقي إلى أقرب خانةٍ فارغةٍ في يومه (خطوةُ ١٥ دقيقة، خارجَ ساعات الهدوء)، وإلّا اليومَ التالي.
 * - `spread`: يُبقي في اليوم ما يسعه السقفُ وينقل الزائدَ إلى أقرب يومٍ مجاورٍ فيه متّسع، بساعته نفسِها ما أمكن.
 * - `merge`: يُبقي الأوّلَ ويحذف المكرَّر.
 * - `quiet`: إلى 08:00 من يومه. و`next_day`: إلى أقرب يومٍ قادمٍ بالساعة نفسِها.
 */
export function planFix(input: CheckInput, rules: ScheduleRules, finding: Finding): FixPlan {
  const items = new Map(input.items.map((i) => [i.key, i]))
  const targets = finding.keys.map((k) => items.get(k)).filter((i): i is CheckItem => i !== undefined)
  if (targets.length === 0) return { kind: 'none', reason: 'تغيّرت الخطّة منذ فتحت الصفحة' }
  if (finding.fix === 'merge') return targets.length < 2 ? { kind: 'none', reason: 'لا مكرَّر' } : { kind: 'remove', keys: targets.slice(1).map((i) => i.key) }

  const gap = Math.max(0, rules.minGapMinutes)
  const nowAbs = abs(input.now)
  // ‏المشغولُ: كلُّ بندٍ ومنشورٍ قائم، ويُحدَّث مع كلّ نقلة
  const placed = new Map<string, LocalAt>()
  for (const i of input.items) if (i.at !== null) placed.set(i.key, i.at)
  const occupied = (except: string): { acc: string; at: LocalAt }[] => [
    ...[...placed].filter(([k]) => k !== except).map(([k, at]) => ({ acc: accountOf(items.get(k)!), at })),
    ...input.others.map((o) => ({ acc: accountOf(o), at: o.at })),
  ]
  const free = (i: CheckItem, at: LocalAt): boolean =>
    !inQuiet(at.minutes, rules) && abs(at) > nowAbs && occupied(i.key).every((o) => o.acc !== accountOf(i) || Math.abs(abs(o.at) - abs(at)) >= Math.max(gap, 1))
  const dayCount = (day: string, platform: string | null, except: string): number =>
    [...placed].filter(([k, at]) => k !== except && at.day === day && (platform === null || items.get(k)!.platform === platform)).length +
    input.others.filter((o) => o.at.day === day && (platform === null || o.platform === platform)).length
  const nearestInDay = (i: CheckItem, day: string, from: number): LocalAt | null => {
    for (let d = 0; d < 1440; d += STEP) {
      for (const m of d === 0 ? [from] : [from + d, from - d]) {
        if (m < 0 || m >= 1440) continue
        if (free(i, { day, minutes: m })) return { day, minutes: m }
      }
    }
    return null
  }
  const moves: { key: string; to: LocalAt }[] = []
  const move = (i: CheckItem, to: LocalAt): void => { moves.push({ key: i.key, to }); placed.set(i.key, to) }
  const movers = targets.filter(movable)

  if (finding.fix === 'quiet' || finding.fix === 'next_day') {
    for (const i of movers) {
      if (i.at === null) continue
      let to: LocalAt | null = null
      if (finding.fix === 'quiet') to = nearestInDay(i, i.at.day, 8 * 60)
      else {
        for (let n = 0; n <= 14 && to === null; n += 1) {
          const day = addDays(input.now.day, n)
          if (free(i, { day, minutes: i.at.minutes })) to = { day, minutes: i.at.minutes }
        }
      }
      if (to !== null) move(i, to)
    }
  } else if (finding.fix === 'shift') {
    const keep = finding.rule === 'near_post' ? [] : movers.slice(0, 1)
    for (const i of movers) {
      if (i.at === null || keep.includes(i)) continue
      const to = nearestInDay(i, i.at.day, i.at.minutes) ?? nearestInDay(i, addDays(i.at.day, 1), i.at.minutes)
      if (to !== null) move(i, to)
    }
  } else if (finding.fix === 'spread' && finding.day !== undefined) {
    const day = finding.day
    const platform = finding.rule === 'platform_cap' ? finding.platform ?? null : null
    const cap = platform === null ? rules.dailyTotalCap : capOf(rules, platform) ?? Infinity
    const capFor = (p: string): number => Math.min(capOf(rules, p) ?? Infinity, Infinity)
    let excess = dayCount(day, platform, '') - cap
    for (const i of [...movers].reverse()) {
      if (excess <= 0 || i.at === null) break
      for (let n = 1; n <= 7; n += 1) {
        const cands = [addDays(day, n), addDays(day, -n)]
        const pick = cands.map((d) => ({ d, at: nearestInDay(i, d, i.at!.minutes) }))
          .find((c) => c.at !== null && dayCount(c.d, i.platform, i.key) < capFor(i.platform) && dayCount(c.d, null, i.key) < rules.dailyTotalCap)
        if (pick !== undefined) { move(i, pick.at!); excess -= 1; break }
      }
    }
  }
  return moves.length === 0 ? { kind: 'none', reason: 'لا خانةَ فارغةً قريبة، فانقله بيدك' } : { kind: 'move', moves }
}

/** يقرأ صفّ `schedule_rules` إلى `ScheduleRules`، وما فسد منه يأخذ الافتراضيّ. خالص. */
export function rulesFromRow(row: {
  platform_caps_json?: string | null; daily_total_cap?: number | null; min_gap_minutes?: number | null
  quiet_start?: string | null; quiet_end?: string | null; jitter_minutes?: number | null
} | null): ScheduleRules {
  if (row === null) return DEFAULT_RULES
  let caps: Record<string, number> = { ...DEFAULT_RULES.platformCaps }
  try {
    const parsed = JSON.parse(row.platform_caps_json ?? '') as unknown
    if (parsed !== null && typeof parsed === 'object') {
      caps = {}
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) if (typeof v === 'number' && Number.isInteger(v) && v > 0) caps[k] = v
    }
  } catch { /* ‏الافتراضيّ */ }
  const int = (v: number | null | undefined, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d)
  return {
    platformCaps: caps,
    dailyTotalCap: int(row.daily_total_cap, DEFAULT_RULES.dailyTotalCap),
    minGapMinutes: int(row.min_gap_minutes, DEFAULT_RULES.minGapMinutes),
    quietStart: minutesOf(row.quiet_start ?? '') === null ? DEFAULT_RULES.quietStart : row.quiet_start!,
    quietEnd: minutesOf(row.quiet_end ?? '') === null ? DEFAULT_RULES.quietEnd : row.quiet_end!,
    jitterMinutes: int(row.jitter_minutes, DEFAULT_RULES.jitterMinutes),
  }
}

/** يتحقّق من نموذج «قواعد الجدولة» قبل الكتابة — خالص، ويعيد السببَ بالعربيّة. */
export function parseRulesForm(f: { get(name: string): unknown }): { readonly ok: true; readonly rules: ScheduleRules } | { readonly ok: false; readonly reason: string } {
  const n = (name: string, min: number, max: number): number | null => {
    const v = Number(String(f.get(name) ?? ''))
    return Number.isInteger(v) && v >= min && v <= max ? v : null
  }
  const x = n('cap_x', 1, 20)
  const li = n('cap_linkedin', 1, 20)
  const total = n('daily_total', 1, 40)
  const gap = n('min_gap', 0, 720)
  const jitter = n('jitter', 0, 30)
  const qs = String(f.get('quiet_start') ?? '')
  const qe = String(f.get('quiet_end') ?? '')
  if (x === null || li === null) return { ok: false, reason: 'سقف المنصّة عددٌ بين 1 و20' }
  if (total === null) return { ok: false, reason: 'الحمل اليوميّ عددٌ بين 1 و40' }
  if (gap === null) return { ok: false, reason: 'الفاصل الأدنى بالدقائق بين 0 و720' }
  if (jitter === null) return { ok: false, reason: 'التذبذب بين 0 و30 دقيقة' }
  if (minutesOf(qs) === null || minutesOf(qe) === null) return { ok: false, reason: 'ساعات الهدوء بصيغة 23:00' }
  return { ok: true, rules: { platformCaps: { x, linkedin: li }, dailyTotalCap: total, minGapMinutes: gap, quietStart: qs, quietEnd: qe, jitterMinutes: jitter } }
}

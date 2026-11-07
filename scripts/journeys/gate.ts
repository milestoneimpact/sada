/**
 * ‏**عتباتُ الرحلات** (D-326) — الرحلةُ التي تخسر نجاحَها أو تزيد خطوةً تُسقط التشغيل.
 *
 * ‏## لماذا
 *
 * ‏كان `npm run journeys` يخرج بصفرٍ أيًّا كان ما قاسه، ولا يقارن بشيء: رحلتان سقطتا منذ D-289 ولم يرهما أحد حتّى D-293،
 * ‏وارتفعت ر-1 من ‏6 إلى ‏8 وr-11 من ‏2 إلى ‏4 بلا كلمة. فلكلّ رحلةٍ ولكلّ مقاسٍ عتبةٌ في `thresholds.json`: النجاحُ،
 * ‏وأكثرُ الخطوات، وأكثرُ تحميلات الصفحة، و(حيث يُكتب) أنّ الفعلَ الحاسمَ في الشاشة الأولى. وما تجاوزها يُسقط التشغيلَ
 * ‏بسببه، وما نزل تحتها يُقال «ضيّق العتبة» ولا يُضيَّق وحدَه إلّا بـ`--update`، **ولا يُرخى شيءٌ آليًّا أبدًا**: إرخاءُ عتبةٍ
 * ‏تعديلٌ يُكتب بيدٍ في الملفّ مع سببه في `why`.
 *
 * ‏**ورحلةٌ بلا عتبة تُسقط التشغيل** (فلا تُضاف رحلةٌ لا يحرسها شيء)، **وعتبةٌ بلا رحلة** تُسقطه حين يُشغَّل الكلّ (فلا تبقى
 * ‏عتبةٌ تحرس ما حُذف).
 *
 *     npx tsx scripts/journeys/gate.ts --self-test   ← يزرع كلَّ علّةٍ ويشترط أن تُمسَك، ويفحص الملفَّ مقابل الرحلات
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export type VpName = 'phone' | 'desktop'
export const VP_NAMES: readonly VpName[] = ['phone', 'desktop']

export interface Threshold {
  readonly success: boolean
  readonly steps: number
  readonly loads: number
  /** يُكتب حيث الوعدُ أنّ الفعلَ الحاسمَ يُرى بلا تمرير (ر-10: رقمُ الشهر). */
  readonly firstScreen?: boolean
}

export interface ThresholdEntry {
  /** لماذا هذه العتبة — ومن أين جاء رقمُها. */
  readonly why: string
  readonly phone?: Threshold
  readonly desktop?: Threshold
}

export interface ThresholdFile {
  readonly about: string
  readonly journeys: Readonly<Record<string, ThresholdEntry>>
}

/** ما يقرؤه الحكمُ من نتيجة رحلة — حقولُ `JourneyResult` نفسُها. */
export interface Measured {
  readonly id: string
  readonly viewport: string
  readonly success: boolean
  readonly steps: number
  readonly loads: number
  readonly firstScreen: boolean | null
  readonly error: string | null
}

export type VerdictKind = 'ok' | 'lost' | 'steps' | 'loads' | 'first' | 'missing' | 'stale' | 'tighter'

export interface Verdict {
  readonly id: string
  readonly vp: VpName | null
  readonly kind: VerdictKind
  readonly text: string
}

export interface Judgement {
  /** ما يُسقط التشغيل. */
  readonly failures: readonly Verdict[]
  /** ما نزل تحت عتبته — يُقال ولا يُسقط. */
  readonly tighter: readonly Verdict[]
  /** لكلّ رحلةٍ ومقاس: العتبةُ والمقيسُ والحكم — لجدول SUMMARY.md. */
  readonly rows: readonly { readonly id: string; readonly vp: VpName; readonly threshold: Threshold | null; readonly measured: Measured; readonly kind: VerdictKind }[]
}

export const THRESHOLDS_PATH = join(fileURLToPath(new URL('.', import.meta.url)), 'thresholds.json')

export function readThresholds(path: string = THRESHOLDS_PATH): ThresholdFile {
  return JSON.parse(readFileSync(path, 'utf8')) as ThresholdFile
}

export function vpOf(viewport: string): VpName | null {
  const name = viewport.split(' ')[0]
  return name === 'phone' || name === 'desktop' ? name : null
}

/**
 * ‏الحكم. `complete`: شُغّلت الرحلاتُ كلُّها بالمقاسين — فعتبةٌ لم تُقَس رحلتُها قديمة. وتشغيلٌ بـ`--only` أو `--vp` يُحكم
 * ‏فيه على ما شُغّل وحده.
 */
export function judge(results: readonly Measured[], file: ThresholdFile, options: { readonly complete: boolean }): Judgement {
  const failures: Verdict[] = []
  const tighter: Verdict[] = []
  const rows: { id: string; vp: VpName; threshold: Threshold | null; measured: Measured; kind: VerdictKind }[] = []
  for (const r of results) {
    const vp = vpOf(r.viewport)
    if (vp === null) continue
    const t = file.journeys[r.id]?.[vp] ?? null
    if (t === null) {
      const v: Verdict = { id: r.id, vp, kind: 'missing', text: `${r.id} ${vp}: لا عتبةَ لها في thresholds.json — رحلةٌ لا يحرسها شيء` }
      failures.push(v)
      rows.push({ id: r.id, vp, threshold: null, measured: r, kind: 'missing' })
      continue
    }
    const own: Verdict[] = []
    if (t.success && !r.success) {
      own.push({ id: r.id, vp, kind: 'lost', text: `${r.id} ${vp}: خسرت نجاحَها${r.error === null ? '' : ` (${r.error})`}` })
    }
    if (r.steps > t.steps) own.push({ id: r.id, vp, kind: 'steps', text: `${r.id} ${vp}: ${r.steps} خطوات والعتبة ${t.steps}` })
    if (r.loads > t.loads) own.push({ id: r.id, vp, kind: 'loads', text: `${r.id} ${vp}: ${r.loads} تحميلات والعتبة ${t.loads}` })
    if (t.firstScreen === true && r.firstScreen !== true) {
      own.push({ id: r.id, vp, kind: 'first', text: `${r.id} ${vp}: الفعلُ الحاسمُ خرج من الشاشة الأولى` })
    }
    failures.push(...own)
    let kind: VerdictKind = own[0]?.kind ?? 'ok'
    if (own.length === 0 && r.success && (r.steps < t.steps || r.loads < t.loads)) {
      kind = 'tighter'
      tighter.push({ id: r.id, vp, kind, text: `${r.id} ${vp}: ${r.steps} خطوات و${r.loads} تحميلات تحت العتبة (${t.steps} · ${t.loads}) — ضيّقها بـ --update` })
    }
    rows.push({ id: r.id, vp, threshold: t, measured: r, kind })
  }
  if (options.complete) {
    const seen = new Set(results.map((r) => `${r.id}|${vpOf(r.viewport)}`))
    for (const [id, entry] of Object.entries(file.journeys)) {
      for (const vp of VP_NAMES) {
        if (entry[vp] !== undefined && !seen.has(`${id}|${vp}`)) {
          failures.push({ id, vp, kind: 'stale', text: `${id} ${vp}: عتبةٌ لرحلةٍ لم تُقَس — احذفها أو أعد الرحلة` })
        }
      }
    }
  }
  return { failures, tighter, rows }
}

/**
 * ‏**يضيّق ولا يُرخي**: ما نزل تحت عتبته والرحلةُ ناجحة تصير عتبتُه ما قيس، ورحلةٌ بلا عتبةٍ تُكتب عتبتُها أوّلَ مرّة.
 * ‏وما فوق العتبة لا يُمسّ — يبقى فاشلًا حتّى تُرخى بيدٍ وسبب.
 */
export function tightened(results: readonly Measured[], file: ThresholdFile, why: string): ThresholdFile {
  const journeys: Record<string, ThresholdEntry> = { ...file.journeys }
  for (const r of results) {
    const vp = vpOf(r.viewport)
    if (vp === null || !r.success) continue
    const entry = journeys[r.id]
    const t = entry?.[vp]
    const first = r.firstScreen === true && t?.firstScreen === true ? { firstScreen: true } : {}
    if (t === undefined) {
      journeys[r.id] = { why: entry?.why ?? why, ...entry, [vp]: { success: true, steps: r.steps, loads: r.loads } }
    } else if (r.steps <= t.steps && r.loads <= t.loads && (r.steps < t.steps || r.loads < t.loads)) {
      journeys[r.id] = { ...entry!, [vp]: { success: true, steps: r.steps, loads: r.loads, ...first } }
    }
  }
  return { ...file, journeys }
}

export function writeThresholds(file: ThresholdFile, path: string = THRESHOLDS_PATH): void {
  writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`)
}

/**
 * ‏**جملٌ ثابتةٌ كانت تُكتب في الخلاصة أيًّا كان ما قيس** — لا تعود إلى ملفّات القياس. أوّلُها نصّت «لا بابَ كتابةٍ في الرئيسيّة
 * ‏كلّها» وفحصُ الصفحة يقرأ الشاشةَ الأولى وحدَها ويتخطّى `<summary>`، وزرُّ «منشور جديد» في الترويسة والزرُّ العائم كانا هناك.
 */
export const BANNED_CONCLUSIONS: readonly string[] = [
  'ولا «منشور جديد» ولا «اكتب» في الرئيسيّة كلّها',
  'والمصدران في Drive بالاسم نفسه، والمحلَّل وحده يظهر',
  'فلا اختيار يلزم لـ LinkedIn',
  'رحلةُ ما قبل D-314 كانت تمرّر حتّى الرقم داخلها',
  'لماذا قال المالك «تمّ» ولم تُكتب مسوّدة',
  'من تبويب «اكتب» حتّى «اكتب مسوّدة» ثمّ «اعتمد»',
  'وأيُّهما حُلّل في staging لم يُذكر، فاختير المستند',
]

// ── الفحصُ الذاتيّ ──────────────────────────────────────────────────────

function selfTest(): void {
  const t: ThresholdFile = {
    about: 'زرع',
    journeys: {
      'R-A': { why: 'زرع', phone: { success: true, steps: 3, loads: 1 }, desktop: { success: true, steps: 2, loads: 1, firstScreen: true } },
      'R-B': { why: 'زرع', phone: { success: true, steps: 1, loads: 0 }, desktop: { success: true, steps: 1, loads: 0 } },
    },
  }
  const ok = (id: string, vp: VpName, steps: number, loads: number, extra: Partial<Measured> = {}): Measured =>
    ({ id, viewport: `${vp} 390×844`, success: true, steps, loads, firstScreen: true, error: null, ...extra })
  const clean = [ok('R-A', 'phone', 3, 1), ok('R-A', 'desktop', 2, 1), ok('R-B', 'phone', 1, 0), ok('R-B', 'desktop', 1, 0)]
  const swap = (i: number, m: Measured): Measured[] => clean.map((x, j) => (j === i ? m : x))
  const cases: readonly [string, readonly Measured[], boolean, (j: Judgement) => boolean][] = [
    ['بلا علّة', clean, true, (j) => j.failures.length === 0 && j.tighter.length === 0],
    ['رحلةٌ خسرت نجاحَها', swap(0, ok('R-A', 'phone', 3, 1, { success: false, error: 'توقّف' })), true, (j) => j.failures.some((f) => f.kind === 'lost' && f.id === 'R-A')],
    ['خطوةٌ زائدة', swap(1, ok('R-A', 'desktop', 3, 1)), true, (j) => j.failures.some((f) => f.kind === 'steps' && f.vp === 'desktop')],
    ['تحميلٌ زائد', swap(2, ok('R-B', 'phone', 1, 1)), true, (j) => j.failures.some((f) => f.kind === 'loads')],
    ['خرج الفعلُ من الشاشة الأولى', swap(1, ok('R-A', 'desktop', 2, 1, { firstScreen: false })), true, (j) => j.failures.some((f) => f.kind === 'first')],
    ['رحلةٌ بلا عتبة', [...clean, ok('R-C', 'phone', 9, 9)], true, (j) => j.failures.some((f) => f.kind === 'missing' && f.id === 'R-C')],
    ['عتبةٌ بلا رحلة (تشغيلٌ كامل)', clean.slice(0, 3), true, (j) => j.failures.some((f) => f.kind === 'stale' && f.id === 'R-B')],
    ['عتبةٌ بلا رحلة (--only)', clean.slice(0, 3), false, (j) => j.failures.length === 0],
    ['نزل تحت عتبته', swap(0, ok('R-A', 'phone', 2, 1)), true, (j) => j.failures.length === 0 && j.tighter.some((x) => x.id === 'R-A')],
  ]
  let missed = 0
  for (const [label, results, complete, expect] of cases) {
    if (!expect(judge(results, t, { complete }))) {
      console.log(`  ✕ «${label}» لم يُحكَم كما يجب`)
      missed += 1
    }
  }
  // ‏التضييقُ يضيّق ولا يُرخي، ويكتب لرحلةٍ جديدةٍ عتبتَها
  const up = tightened([ok('R-A', 'phone', 2, 1), ok('R-B', 'phone', 4, 0), ok('R-C', 'phone', 5, 2)], t, 'جديدة')
  if (up.journeys['R-A']?.phone?.steps !== 2 || up.journeys['R-B']?.phone?.steps !== 1 || up.journeys['R-C']?.phone?.steps !== 5) {
    console.log('  ✕ «--update» لا يضيّق وحدَه، أو يُرخي، أو لا يكتب عتبةَ الجديدة')
    missed += 1
  }
  if (missed > 0) {
    console.log(`✕ self-test: ${missed} من ${cases.length + 1} لم يقع كما يجب`)
    process.exit(1)
  }
  console.log(`  ✓ الفحصُ الذاتيّ: العللُ المزروعة الـ${cases.length - 2} أُمسكت، والسليمُ يمرّ، و«--only» لا يتّهم ما لم يُشغَّل، والتضييقُ لا يُرخي`)
}

async function checkRepo(): Promise<void> {
  const { JOURNEYS } = await import('./journeys')
  const file = readThresholds()
  const notes: string[] = []
  const ids = new Set(JOURNEYS.map((j) => j.id))
  for (const j of JOURNEYS) {
    const entry = file.journeys[j.id]
    if (entry === undefined) { notes.push(`${j.id}: بلا عتبة`); continue }
    if (entry.why.trim() === '') notes.push(`${j.id}: عتبةٌ بلا سبب (why)`)
    for (const vp of VP_NAMES) {
      const t = entry[vp]
      if (t === undefined) notes.push(`${j.id} ${vp}: بلا عتبة`)
      else if (t.success !== true) notes.push(`${j.id} ${vp}: العتبةُ تقبل الفشل`)
    }
  }
  for (const id of Object.keys(file.journeys)) if (!ids.has(id)) notes.push(`${id}: عتبةٌ لرحلةٍ لا وجود لها`)
  // ‏ولا تعود جملةٌ ثابتةٌ إلى ملفّات القياس
  const dir = fileURLToPath(new URL('.', import.meta.url))
  for (const f of ['journeys.ts', 'count_steps.ts', 'meter.ts']) {
    const text = readFileSync(join(dir, f), 'utf8')
    for (const b of BANNED_CONCLUSIONS) if (text.includes(b)) notes.push(`${f}: جملةٌ ثابتةٌ في الخلاصة: «${b}»`)
  }
  if (notes.length > 0) {
    console.log(`✕ عتباتُ الرحلات: ${notes.length} ملحوظة`)
    for (const n of notes) console.log(`  ${n}`)
    process.exit(1)
  }
  console.log(`  ✓ عتباتُ الرحلات: ${JOURNEYS.length} رحلةً بمقاسيها، لكلٍّ عتبةٌ وسبب، ولا عتبةَ لرحلةٍ غائبة، ولا جملةَ ثابتةً في الخلاصة`)
  // ‏وما تحمله وحداتُ الرحلات من مقابضَ مفتوحة لا يُبقي البوّابةَ معلّقة
  process.exit(0)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  if (process.argv.includes('--self-test')) selfTest()
  await checkRepo()
}

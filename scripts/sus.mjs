/**
 * درجاتُ الجلسة الشهريّة (D-300): SUS وSEQ وUMUX-Lite من ملفّ الإجابات — **لا تُحسَب بيد**.
 *
 * ## الصيغ (Brooke 1996 · Sauro وLewis، Quantifying the User Experience ط٢ · Lewis وSauro، UMUX-Lite)
 *
 * - SUS: العباراتُ الفرديّة (1 3 5 7 9) تُسهم بـ (الجواب − 1)، والزوجيّةُ (2 4 6 8 10) بـ (5 − الجواب)، والمجموعُ × 2.5.
 *   المتوسّطُ العالميّ ‏68. والدرجةُ بسلّم Sauro وLewis المنحني: A+ ≥ 84.1 · A ≥ 80.8 · A− ≥ 78.9 · B+ ≥ 77.2 · B ≥ 74.1
 *   · B− ≥ 72.6 · C+ ≥ 71.1 · C ≥ 65.0 · C− ≥ 62.7 · D ≥ 51.7 · F دونها.
 * - SEQ: سؤالٌ واحد من 1 إلى 7 بعد كلّ مهمّة؛ المتوسّطُ المرجعيّ ‏5.5، وما دونه يُعلَّم.
 * - UMUX-Lite: سؤالان من 1 إلى 7؛ الخامُ = (مجموع − 2) ÷ 12 × 100؛ والمعادلُ إلى SUS = 0.65 × الخام + 22.9.
 *
 * الاستعمال:  node scripts/sus.mjs docs/usability/session-2026-11.json   [--self-test]
 */
import { readFileSync } from 'node:fs'

const GRADES = [
  [84.1, 'A+'], [80.8, 'A'], [78.9, 'A-'], [77.2, 'B+'], [74.1, 'B'], [72.6, 'B-'],
  [71.1, 'C+'], [65.0, 'C'], [62.7, 'C-'], [51.7, 'D'],
]

export function sus(answers) {
  if (!Array.isArray(answers) || answers.length !== 10) throw new Error('SUS يحتاج عشرة أجوبة')
  let sum = 0
  answers.forEach((a, i) => {
    if (!Number.isInteger(a) || a < 1 || a > 5) throw new Error(`الجوابُ ${i + 1} خارج 1–5: ${a}`)
    sum += i % 2 === 0 ? a - 1 : 5 - a
  })
  return sum * 2.5
}

export function grade(score) {
  for (const [min, g] of GRADES) if (score >= min) return g
  return 'F'
}

export function seq(map) {
  const entries = Object.entries(map ?? {})
  if (entries.length === 0) throw new Error('SEQ بلا مهامّ')
  const rows = entries.map(([task, v]) => {
    if (!Number.isInteger(v) || v < 1 || v > 7) throw new Error(`SEQ للمهمّة ${task} خارج 1–7: ${v}`)
    return { task, value: v, flagged: v < 5.5 }
  })
  const mean = rows.reduce((s, r) => s + r.value, 0) / rows.length
  return { rows, mean: Math.round(mean * 100) / 100 }
}

export function umuxLite(pair) {
  if (!Array.isArray(pair) || pair.length !== 2) throw new Error('UMUX-Lite يحتاج جوابين')
  for (const v of pair) if (!Number.isInteger(v) || v < 1 || v > 7) throw new Error(`UMUX-Lite خارج 1–7: ${v}`)
  const raw = ((pair[0] - 1 + pair[1] - 1) / 12) * 100
  return { raw: Math.round(raw * 10) / 10, susEquivalent: Math.round((0.65 * raw + 22.9) * 10) / 10 }
}

function selfTest() {
  const cases = [
    [[5, 1, 5, 1, 5, 1, 5, 1, 5, 1], 100],
    [[1, 5, 1, 5, 1, 5, 1, 5, 1, 5], 0],
    [[4, 2, 5, 1, 4, 2, 4, 2, 5, 1], 85],
    [[3, 3, 3, 3, 3, 3, 3, 3, 3, 3], 50],
  ]
  for (const [a, want] of cases) {
    const got = sus(a)
    if (got !== want) { console.error(`✕ SUS ${JSON.stringify(a)} أراد ${want} ووجد ${got}`); process.exit(1) }
  }
  const grades = [[100, 'A+'], [80.8, 'A'], [80, 'A-'], [68, 'C'], [51.6, 'F']]
  for (const [s, want] of grades) {
    if (grade(s) !== want) { console.error(`✕ الدرجةُ لـ ${s} أرادت ${want} ووجدت ${grade(s)}`); process.exit(1) }
  }
  const q = seq({ '1': 7, '2': 4 })
  if (q.mean !== 5.5 || !q.rows[1].flagged || q.rows[0].flagged) { console.error('✕ SEQ'); process.exit(1) }
  const u = umuxLite([7, 7])
  if (u.raw !== 100 || u.susEquivalent !== 87.9) { console.error(`✕ UMUX-Lite ${JSON.stringify(u)}`); process.exit(1) }
  let threw = false
  try { sus([6, 1, 1, 1, 1, 1, 1, 1, 1, 1]) } catch { threw = true }
  if (!threw) { console.error('✕ جوابٌ خارج المدى مرّ'); process.exit(1) }
  console.log('✓ self-test: الصيغُ الثلاث والدرجاتُ والمدى')
}

if (process.argv.includes('--self-test')) selfTest()

const file = process.argv.slice(2).find((a) => !a.startsWith('--'))
if (file !== undefined) {
  const data = JSON.parse(readFileSync(file, 'utf8'))
  const score = sus(data.sus)
  console.log(`الجلسة ${data.session ?? '?'}`)
  console.log(`SUS: ${score} (${grade(score)}) — المتوسّطُ العالميّ 68، والهدفُ 80`)
  if (data.seq !== undefined) {
    const q = seq(data.seq)
    console.log(`SEQ: المتوسّطُ ${q.mean} (المرجعُ 5.5)`)
    for (const r of q.rows) console.log(`  المهمّة ${r.task}: ${r.value}${r.flagged ? '  ← دون المرجع' : ''}`)
  }
  if (data.umux !== undefined) {
    const u = umuxLite(data.umux)
    console.log(`UMUX-Lite: ${u.raw} خامًا، ويعادل SUS ${u.susEquivalent}`)
  }
} else if (!process.argv.includes('--self-test')) {
  console.log('الاستعمال: node scripts/sus.mjs <ملفّ الإجابات .json> [--self-test]')
}

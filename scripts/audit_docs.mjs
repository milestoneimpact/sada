/**
 * حارسُ الوثائق (D-292): **فهرسٌ يصدق، وروابطُ تصل، وملفّاتٌ تُقرأ.**
 *
 * ## لماذا
 *
 * كانت الوثائقُ اثنتين وعشرين خطّةً و‏18.6 ألف سطر، و`DECISIONS.md` ‏11.4 ألفًا في ملفّ،
 * ولا شيءَ يقول أيُّها حيّ. وفهرسٌ يُكتب بيدٍ يشيخ عند أوّل وثيقةٍ تُضاف ولا تُذكَر.
 * فهذا المدقّق يسقط حين:
 *
 * ١ · رابطٌ نسبيٌّ في README أو CLAUDE أو `docs/**` لا يصل إلى ملفّ.
 * ٢ · ملفٌّ في `docs/` يتجاوز ‏4,000 سطر.
 * ٣ · رقمُ قرارٍ `## D-NNN` يتكرّر، أو يخرج عن ترتيبه في ملفّه، أو يقع في غير جزئه
 *     (`decisions/D-100-149.md` لا يحمل إلّا ‏100 … ‏149)، أو يبدأ الحيُّ بغير ما يقوله اسمُ آخر جزء + ١.
 * ٤ · وثيقةٌ في `docs/` (أو `docs/archive/` أو `docs/decisions/`) لا يذكرها `docs/INDEX.md`.
 *
 * `--self-test` يزرع العللَ الأربع في مجلّدٍ مؤقّت ويتحقّق أنّ المدقّق يراها، ثمّ يفحص المستودع.
 */
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'

const MAX_LINES = 4000
const ROOT = resolve(new URL('..', import.meta.url).pathname)

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) out.push(...walk(path))
    else if (name.endsWith('.md')) out.push(path)
  }
  return out
}

function stripCode(text) {
  return text.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '')
}

/** يفحص جذرًا ويعيد الملحوظات — نقيّةً لتُختبَر بمجلّدٍ مزروع. */
export function auditDocs(root) {
  const notes = []
  const docs = join(root, 'docs')
  const files = [join(root, 'README.md'), join(root, 'CLAUDE.md'), ...walk(docs)].filter((f) => {
    try { return statSync(f).isFile() } catch { return false }
  })

  // ١ · الروابط
  for (const file of files) {
    const text = stripCode(readFileSync(file, 'utf8'))
    for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      const target = m[1]
      if (/^(https?:|mailto:|#)/.test(target)) continue
      const bare = target.split('#')[0]
      if (bare === '') continue
      const abs = resolve(dirname(file), bare)
      let ok = false
      try { statSync(abs); ok = true } catch { ok = false }
      if (!ok) notes.push(`رابطٌ لا يصل  ${relative(root, file)} → ${target}`)
    }
  }

  // ٢ · الحجم
  for (const file of files) {
    const n = readFileSync(file, 'utf8').split('\n').length
    if (n > MAX_LINES) notes.push(`ملفٌّ فوق ${MAX_LINES} سطر  ${relative(root, file)} (${n})`)
  }

  // ٣ · القرارات
  const seen = new Map()
  const parts = []
  let decisionsDir = join(docs, 'decisions')
  let partFiles = []
  try { partFiles = readdirSync(decisionsDir).filter((f) => /^D-\d{3}-\d{3}\.md$/.test(f)).sort() } catch { partFiles = [] }
  for (const name of partFiles) {
    const [, lo, hi] = /^D-(\d{3})-(\d{3})\.md$/.exec(name)
    parts.push({ file: join(decisionsDir, name), lo: Number(lo), hi: Number(hi) })
  }
  const live = join(docs, 'DECISIONS.md')
  const liveLo = parts.length === 0 ? 1 : parts[parts.length - 1].hi + 1
  const checkFile = (file, lo, hi) => {
    let text
    try { text = readFileSync(file, 'utf8') } catch { return }
    let prev = 0
    for (const line of text.split('\n')) {
      const m = /^## D-(\d{3})/.exec(line)
      if (m === null) continue
      const n = Number(m[1])
      const where = relative(root, file)
      if (seen.has(n)) notes.push(`قرارٌ مكرّر  D-${m[1]} في ${where} و${seen.get(n)}`)
      seen.set(n, where)
      if (n <= prev) notes.push(`قرارٌ خارج ترتيبه  D-${m[1]} بعد D-${String(prev).padStart(3, '0')} في ${where}`)
      prev = Math.max(prev, n)
      if (n < lo || n > hi) notes.push(`قرارٌ في غير جزئه  D-${m[1]} في ${where} (الجزءُ ${lo} … ${hi})`)
    }
  }
  for (const p of parts) checkFile(p.file, p.lo, p.hi)
  checkFile(live, liveLo, 9999)

  // ٤ · الفهرس
  let index = ''
  try { index = readFileSync(join(docs, 'INDEX.md'), 'utf8') } catch { notes.push('لا docs/INDEX.md'); index = '' }
  if (index !== '') {
    for (const file of walk(docs)) {
      const rel = relative(docs, file)
      if (rel === 'INDEX.md') continue
      // ‏مجلّدٌ مذكورٌ بأكمله يكفي لما فيه (usability/ · decisions/)
      const dir = rel.includes('/') ? rel.slice(0, rel.indexOf('/') + 1) : null
      if (index.includes(rel) || (dir !== null && index.includes(`(${dir})`)) ) continue
      notes.push(`وثيقةٌ ليست في الفهرس  docs/${rel}`)
    }
  }
  return notes
}

function selfTest() {
  const root = mkdtempSync(join(tmpdir(), 'sada-docs-'))
  try {
    mkdirSync(join(root, 'docs', 'decisions'), { recursive: true })
    writeFileSync(join(root, 'README.md'), '[x](docs/MISSING.md) [ok](docs/A.md)\n')
    writeFileSync(join(root, 'docs', 'A.md'), Array.from({ length: MAX_LINES + 1 }, () => 'س').join('\n'))
    writeFileSync(join(root, 'docs', 'decisions', 'D-001-049.md'), '## D-001 · أ\n## D-003 · ب\n## D-002 · ج\n## D-060 · د\n')
    writeFileSync(join(root, 'docs', 'DECISIONS.md'), '## D-049 · هـ\n## D-003 · و\n')
    writeFileSync(join(root, 'docs', 'INDEX.md'), '[A](A.md)\n')
    writeFileSync(join(root, 'docs', 'B.md'), 'بلا فهرس\n')
    const notes = auditDocs(root)
    const want = ['رابطٌ لا يصل', 'ملفٌّ فوق', 'قرارٌ خارج ترتيبه', 'قرارٌ في غير جزئه', 'قرارٌ مكرّر', 'وثيقةٌ ليست في الفهرس']
    for (const w of want) {
      if (!notes.some((n) => n.startsWith(w))) {
        console.error(`✕ الفحصُ الذاتيّ: لم يُمسَك «${w}»\n${notes.join('\n')}`)
        process.exit(1)
      }
    }
    // ‏ولا كذب: D-049 في الحيّ (liveLo = 50) خارجَ جزئه — ويُمسَك؛ وD-002 بعد D-003 خارج ترتيبه — ويُمسَك
    console.log(`  ✓ الفحصُ الذاتيّ: العللُ الستّ المزروعة أُمسكت`)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

if (process.argv.includes('--self-test')) selfTest()
const notes = auditDocs(ROOT)
if (notes.length === 0) {
  console.log('  ✓ الوثائق: الروابطُ تصل، والفهرسُ تامّ، والقراراتُ في مواضعها')
} else {
  for (const n of notes) console.log(`  ✕ ${n}`)
  console.log(`\nالمجموع: ${notes.length} ملحوظة`)
  process.exit(1)
}

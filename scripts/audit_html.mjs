/**
 * سقّاطةُ قالب `html` (D-281): **قالبٌ نصّيٌّ يُقحِم قيمةً ولا يحمل الوسم `html` يُعَدّ**.
 *
 * ## لماذا
 *
 * في `src/routes/` مئاتُ القوالب النصّيّة تبني HTML وتكتب `${escapeHtml(x)}` يدًا، **وما
 * نُسي تهريبُه عمل عملًا صحيحًا فلا يلحظ أحدٌ نقصَه** (علّةُ D-019). والقالبُ `html` في
 * `src/routes/ui/html.ts` يقلب الافتراض: ما يُقحَم يُهرَّب إلّا ما وُسم. فالهدفُ أن يصير
 * كلُّ قالبٍ فيه `${` موسومًا — **والطريقُ سقّاطة**، لا تحويلٌ دفعةً واحدة.
 *
 * ## كيف
 *
 * يُحفَظ لكلّ ملفٍّ عددُ قوالبه غير الموسومة التي تُقحِم قيمةً في `scripts/html-baseline.json`،
 * **ويسقط الفحصُ إن زاد عددُ ملفّ** (قالبٌ جديدٌ بلا وسم)، **أو نقص ولم يُحدَّث الملفّ** (فلا
 * يرتدّ الخطُّ بعد أن تقدّم). وقالبٌ بلا `${` لا يُعَدّ: لا شيءَ فيه يُهرَّب.
 *
 * والقراءةُ بماسحٍ يعرف النصوصَ والتعليقات والتداخل (`${…}` داخل قالبٍ داخل `${…}`)، لا
 * بتعبيرٍ نمطيّ: المشروعُ كلُّه قوالبٌ متداخلة.
 *
 * `--self-test` يتحقّق أنّ الماسح يرى الموسومَ وغيرَ الموسوم والمتداخلَ ويتخطّى التعليقات.
 * `--write` يكتب خطَّ الأساس.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const SRC = new URL('../src/', import.meta.url).pathname
const ROUTES = join(SRC, 'routes')
const BASELINE = new URL('./html-baseline.json', import.meta.url).pathname

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) out.push(...walk(path))
    else if (name.endsWith('.ts')) out.push(path)
  }
  return out
}

/**
 * عدُّ القوالب غير الموسومة التي تُقحِم قيمةً.
 *
 * ماسحُ حالاتٍ: شيفرةٌ، أو تعليقُ سطر/كتلة، أو نصٌّ بعلامةٍ مفردة/مزدوجة، أو قالب. وفي القالب
 * يُتابَع `${` بمكدَّسٍ من الأقواس، وما بداخله شيفرةٌ قد تحمل قالبًا آخر — فالماسحُ يعود إلى
 * نفسه. والوسمُ: آخرُ معرِّفٍ قبل العلامة الخلفيّة مباشرةً (بعد فراغٍ اختياريّ) هو `html`.
 */
export function countUntagged(code) {
  let count = 0
  let i = 0
  const n = code.length

  function identifierBefore(pos) {
    let j = pos - 1
    while (j >= 0 && /\s/.test(code[j])) j -= 1
    let k = j
    while (k >= 0 && /[\w$]/.test(code[k])) k -= 1
    return code.slice(k + 1, j + 1)
  }

  // ‏يقرأ شيفرةً حتى يبلغ `until` (قوسًا مغلِقًا على عمق الصفر) أو النهاية، ويعيد موضعَ ما بعده
  function scanCode(start, until) {
    let depth = 0
    let p = start
    while (p < n) {
      const c = code[p]
      const d = code[p + 1]
      if (c === '/' && d === '/') { while (p < n && code[p] !== '\n') p += 1; continue }
      if (c === '/' && d === '*') { const e = code.indexOf('*/', p + 2); p = e < 0 ? n : e + 2; continue }
      if (c === "'" || c === '"') { p = scanString(p, c); continue }
      if (c === '`') { p = scanTemplate(p); continue }
      if (until !== null) {
        if (c === '{') depth += 1
        else if (c === '}') { if (depth === 0) return p + 1; depth -= 1 }
      }
      p += 1
    }
    return p
  }

  function scanString(start, quote) {
    let p = start + 1
    while (p < n && code[p] !== quote && code[p] !== '\n') { if (code[p] === '\\') p += 1; p += 1 }
    return p + 1
  }

  function scanTemplate(start) {
    const tagged = identifierBefore(start) === 'html'
    let interpolates = false
    let p = start + 1
    while (p < n) {
      const c = code[p]
      if (c === '\\') { p += 2; continue }
      if (c === '`') { p += 1; break }
      if (c === '$' && code[p + 1] === '{') { interpolates = true; p = scanCode(p + 2, '}'); continue }
      p += 1
    }
    if (interpolates && !tagged) count += 1
    return p
  }

  i = scanCode(0, null)
  void i
  return count
}

function selfTest() {
  const cases = [
    ['const a = `<p>${x}</p>`', 1],
    ['const a = html`<p>${x}</p>`', 0],
    ['const a = html `<p>${x}</p>`', 0],
    ['const a = `<p>x</p>`', 0],
    ['const a = `<p>${y ? `<b>${z}</b>` : ""}</p>`', 2],
    ['const a = html`<p>${y ? `<b>${z}</b>` : ""}</p>`', 1],
    ['const a = html`<p>${y ? html`<b>${z}</b>` : ""}</p>`', 0],
    ['// `${x}`\n/* `${y}` */ const a = "`${z}`"', 0],
    ['const a = `${x}` + `${y}`; const b = sql`SELECT ${z}`', 3],
    ["const a = `a\\`${x}`", 1],
    ['const a = `${ {k: `${x}`}.k }`', 2],
  ]
  for (const [code, want] of cases) {
    const got = countUntagged(code)
    if (got !== want) {
      console.error(`✕ اختبارُ الماسح الذاتيّ فشل: ${JSON.stringify(code)} — أراد ${want} ووجد ${got}`)
      process.exit(1)
    }
  }
}

if (process.argv.includes('--self-test')) selfTest()

const now = {}
for (const f of walk(ROUTES).filter((f) => !f.endsWith('.test.ts') && !f.includes('/test/'))) {
  const c = countUntagged(readFileSync(f, 'utf8'))
  if (c > 0) now[relative(SRC, f)] = c
}

if (process.argv.includes('--write')) {
  const sorted = Object.fromEntries(Object.entries(now).sort(([a], [b]) => a.localeCompare(b)))
  writeFileSync(BASELINE, JSON.stringify(sorted, null, 2) + '\n')
  const total = Object.values(now).reduce((a, b) => a + b, 0)
  console.log(`✓ كُتب خطُّ الأساس: ${total} قالبًا غيرَ موسومٍ في ${Object.keys(now).length} ملفًّا`)
  process.exit(0)
}

const base = JSON.parse(readFileSync(BASELINE, 'utf8'))
const findings = []
for (const file of new Set([...Object.keys(now), ...Object.keys(base)])) {
  const n = now[file] ?? 0
  const b = base[file] ?? 0
  if (n > b) findings.push(`  ✕ ${file}: ${n} قالبًا بلا وسم html، والسقفُ ${b} — قالبٌ جديدٌ يُقحِم قيمةً بلا تهريبٍ تلقائيّ`)
  else if (n < b) findings.push(`  ✕ ${file}: ${n} والسقفُ ${b} — تقدّمٌ لم يُسجَّل: شغّل \`node scripts/audit_html.mjs --write\``)
}

const total = Object.values(now).reduce((a, b) => a + b, 0)
console.log('\n═══ قالبُ html: قوالبٌ تُقحِم قيمةً بلا وسم ═══\n')
if (findings.length === 0) {
  console.log(`  ✓ لا قالبَ جديدًا بلا وسم (${total} باقيةً للتحويل في ${Object.keys(now).length} ملفًّا، والهدفُ صفر)\n`)
  process.exit(0)
}
for (const f of findings) console.log(f)
console.log('')
process.exit(1)

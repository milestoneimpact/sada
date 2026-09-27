/**
 * مدقّقُ الحلقات: **وحدتان تستورد كلٌّ منهما الأخرى، ولو من بعيد** (D-160).
 *
 * ## لماذا
 *
 * في الحلقة لا يضمن ESM أن تُقيَّم الوحدةُ قبل من يستوردها، فثابتٌ يُقرأ عند
 * التحميل (`${B64URL_SCRIPT}` داخل قالب) قد يُقرأ قبل أن يُسنَد. **والترتيبُ
 * يتبدّل بنقطة الدخول**: الاختبارُ يستورد اللوحةَ أوّلًا فيسلم، والحزمةُ
 * تبدأ من `src/index.ts` فيُطبَع «undefined» في رأس سكربت الدخول بمفتاح المرور
 * ويرمي عند التحميل. ‏١٨٥٩ اختبارًا كانت خضراء وزرُّ الدخول لا يفعل شيئًا.
 *
 * فالصوابُ ألّا تكون حلقة: **ما لا يدور لا يُقرأ قبل أن يُسنَد**، في أيّ ترتيب.
 *
 * ## ما يُقرأ
 *
 * كلُّ `import … from './…'` و`export … from './…'` في `src/**` خارج
 * الاختبارات. **و`import type` لا يُعَدّ**: يُمحى عند البناء ولا يُقيَّم.
 * والاستيرادُ الديناميكيّ `import()` لا يُعَدّ كذلك: يُقيَّم عند النداء.
 *
 * ## والحارسُ يُجرَّب على عيبٍ مزروع
 *
 * `--self-test` يبني في الذاكرة حلقةً من ثلاث وحداتٍ وحلقةً من الأنواع وحدها،
 * ويتحقّق أنّ الأولى تُمسَك والثانيةَ لا.
 *
 * الاستعمال:  node scripts/audit_cycles.mjs [--self-test]
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

const ROOT = new URL('../src/', import.meta.url).pathname

/** الاستيراداتُ التي تُقيَّم — لا الأنواع. */
function edges(text) {
  const out = []
  const re = /^\s*(import|export)\s+(type\s+)?([\s\S]*?)\s*from\s+['"](\.{1,2}\/[^'"]+)['"]/gm
  for (const m of text.matchAll(re)) {
    if (m[2] !== undefined) continue
    const names = m[3].trim()
    // ‏`import { type A, type B }` كلُّها أنواع: تُمحى كما تُمحى `import type`
    const braces = /^\{([\s\S]*)\}$/.exec(names)
    if (braces !== null) {
      const parts = braces[1].split(',').map((p) => p.trim()).filter(Boolean)
      if (parts.length > 0 && parts.every((p) => p.startsWith('type '))) continue
    }
    out.push(m[4])
  }
  return out
}

function resolveTo(from, spec, exists) {
  const base = resolve(dirname(from), spec)
  for (const candidate of [base, `${base}.ts`, join(base, 'index.ts')]) {
    if (candidate.endsWith('.ts') && exists(candidate)) return candidate
  }
  return null
}

/** Tarjan: المكوّناتُ المترابطة بقوّة — وما زاد منها على وحدةٍ حلقة. */
function cycles(graph) {
  let index = 0
  const stack = []
  const on = new Set()
  const idx = new Map()
  const low = new Map()
  const found = []
  const visit = (v) => {
    idx.set(v, index)
    low.set(v, index)
    index += 1
    stack.push(v)
    on.add(v)
    for (const w of graph.get(v) ?? []) {
      if (!graph.has(w)) continue
      if (!idx.has(w)) {
        visit(w)
        low.set(v, Math.min(low.get(v), low.get(w)))
      } else if (on.has(w)) {
        low.set(v, Math.min(low.get(v), idx.get(w)))
      }
    }
    if (low.get(v) === idx.get(v)) {
      const scc = []
      let w
      do {
        w = stack.pop()
        on.delete(w)
        scc.push(w)
      } while (w !== v)
      const self = (graph.get(v) ?? []).includes(v)
      if (scc.length > 1 || self) found.push(scc.sort())
    }
  }
  for (const v of graph.keys()) if (!idx.has(v)) visit(v)
  return found
}

function build(files, read, exists) {
  const graph = new Map()
  for (const file of files) {
    graph.set(file, edges(read(file)).map((s) => resolveTo(file, s, exists)).filter(Boolean))
  }
  return graph
}

function sources(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      if (name !== 'test') out.push(...sources(path))
    } else if (name.endsWith('.ts') && !name.endsWith('.test.ts') && !name.endsWith('.d.ts')) {
      out.push(path)
    }
  }
  return out
}

if (process.argv.includes('--self-test')) {
  const planted = {
    '/x/a.ts': "import { b } from './b'\nexport const a = `${b}`\n",
    '/x/b.ts': "import { c } from './c'\nexport const b = c\n",
    '/x/c.ts': "import { a } from './a'\nexport const c = () => a\n",
    '/x/d.ts': "import type { E } from './e'\nexport type D = E\n",
    '/x/e.ts': "import { type D } from './d'\nexport type E = D\n",
  }
  const graph = build(Object.keys(planted), (f) => planted[f], (f) => f in planted)
  const got = cycles(graph)
  if (got.length !== 1 || got[0].length !== 3) {
    console.error(`audit_cycles --self-test: العيبُ المزروع لم يُمسَك كما يجب (${JSON.stringify(got)})`)
    process.exit(1)
  }
  console.log('audit_cycles --self-test: الحلقةُ المزروعة أُمسكت، وحلقةُ الأنواع لم تُعَدّ ✓')
}

const files = sources(ROOT)
const found = cycles(build(files, (f) => readFileSync(f, 'utf8'), existsSync))
for (const scc of found) {
  console.log(`  ✗ حلقةٌ من ${scc.length}: ${scc.map((f) => relative(ROOT, f)).join(' · ')}`)
}
console.log(`cycles: ${files.length} وحدةً · ${found.length === 0 ? 'لا حلقة' : `${found.length} حلقة`}`)
process.exit(found.length === 0 ? 0 : 1)

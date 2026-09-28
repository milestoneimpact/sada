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
 * ## والرسمُ من esbuild لا من نمطٍ على النصّ
 *
 * النسخةُ الأولى قرأت `import … from` بتعبيرٍ نمطيّ، **وأفلتت ثلاثَ صورٍ
 * حقيقيّة**: `import type` من حزمةٍ يسبق استيرادَ قيمةٍ فيبتلعه التطابق،
 * و`import './x'` بلا `from`، و`import { type X } from './y'` الذي يبقى في
 * الحزمة `import {} from './y'` لأنّ المستودعَ يعمل بـ`verbatimModuleSyntax`.
 * فالرسمُ الآن **رسمُ الحزمة نفسِها**: `metafile` من esbuild بخيارات wrangler،
 * وما عدّه esbuild `import-statement` ضلعٌ يُقيَّم، وما محاه (`import type`)
 * ليس ضلعًا. لا يُقدَّر ما يُقاس.
 *
 * ## والحارسُ يُجرَّب على عيبٍ مزروع
 *
 * `--self-test` يكتب في مجلّدٍ مؤقّت أربعَ حلقاتٍ من الصور التي أفلتت النسخةَ
 * الأولى، وحلقةً من الأنواع وحدها، ويتحقّق أنّ الأربعَ تُمسَك والخامسةَ لا.
 *
 * الاستعمال:  node scripts/audit_cycles.mjs [--self-test]
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { build } from 'esbuild'

const ROOT = resolve(new URL('..', import.meta.url).pathname)

/** رسمُ الاستيراد كما تراه الحزمة — من `metafile`، بخيارات `wrangler deploy`. */
async function graphOf(entry, cwd, within) {
  const result = await build({
    entryPoints: [entry],
    absWorkingDir: cwd,
    bundle: true,
    write: false,
    metafile: true,
    format: 'esm',
    target: 'es2024',
    platform: 'browser',
    conditions: ['workerd', 'worker', 'browser'],
    external: ['__STATIC_CONTENT_MANIFEST', 'cloudflare:*', 'node:*'],
    logLevel: 'silent',
  })
  const graph = new Map()
  for (const [file, input] of Object.entries(result.metafile.inputs)) {
    if (!file.startsWith(within)) continue
    graph.set(file, input.imports
      .filter((i) => i.kind === 'import-statement' && !i.external && i.path.startsWith(within))
      .map((i) => i.path))
  }
  return graph
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

if (process.argv.includes('--self-test')) {
  const dir = mkdtempSync(join(tmpdir(), 'sada-cycles-'))
  try {
    const planted = {
      'tsconfig.json': JSON.stringify({ compilerOptions: { verbatimModuleSyntax: true } }),
      'index.ts': "import './a1'\nimport './b1'\nimport './c1'\nimport './d1'\nimport './e1'\n",
      // ‏(أ) `import type` من حزمةٍ يسبق استيرادَ القيمة
      'a1.ts': "import type { Context } from 'hono'\nimport { a2 } from './a2'\nexport const a1 = `${a2}`\nexport type C = Context\n",
      'a2.ts': "import { a1 } from './a1'\nexport const a2 = 'x'\nexport const f = () => a1\n",
      // ‏(ب) `export type` ثمّ `export … from`
      'b1.ts': "export type Mode = 'a' | 'b'\nexport { b2 } from './b2'\n",
      'b2.ts': "import { b1x } from './b3'\nexport const b2 = b1x\n",
      'b3.ts': "import { b2 } from './b1'\nexport const b1x = 'y'\nexport const g = () => b2\n",
      // ‏(ج) استيرادٌ جانبيٌّ بلا `from`
      'c1.ts': "import './c2'\nexport const c1 = 1\n",
      'c2.ts': "import { c1 } from './c1'\nexport const c2 = () => c1\n",
      // ‏(د) `import { type X }` يبقى `import {}` تحت verbatimModuleSyntax
      'd1.ts': "import { type D2 } from './d2'\nexport const d1: D2 | null = null\n",
      'd2.ts': "import { d1 } from './d1'\nexport type D2 = number\nexport const h = () => d1\n",
      // ‏(هـ) حلقةُ أنواعٍ وحدَها: تُمحى، فلا تُعَدّ
      'e1.ts': "import type { E2 } from './e2'\nexport type E1 = E2\nexport const e1 = 1\n",
      'e2.ts': "import type { E1 } from './e1'\nexport type E2 = E1 | string\n",
    }
    for (const [name, text] of Object.entries(planted)) writeFileSync(join(dir, name), text)
    const got = cycles(await graphOf('index.ts', dir, ''))
    const names = got.map((c) => c.join('+')).sort()
    const want = ['a1.ts+a2.ts', 'b1.ts+b2.ts+b3.ts', 'c1.ts+c2.ts', 'd1.ts+d2.ts']
    if (JSON.stringify(names) !== JSON.stringify(want)) {
      console.error(`audit_cycles --self-test: العيبُ المزروع لم يُمسَك كما يجب\n  وُجد: ${JSON.stringify(names)}\n  يلزم: ${JSON.stringify(want)}`)
      process.exit(1)
    }
    console.log('audit_cycles --self-test: الحلقاتُ الأربعُ المزروعة أُمسكت، وحلقةُ الأنواع لم تُعَدّ ✓')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const graph = await graphOf('src/index.ts', ROOT, 'src/')
const found = cycles(graph)
for (const scc of found) {
  console.log(`  ✗ حلقةٌ من ${scc.length}: ${scc.map((f) => f.replace(/^src\//, '')).join(' · ')}`)
}
console.log(`cycles: ${graph.size} وحدةً في الحزمة · ${found.length === 0 ? 'لا حلقة' : `${found.length} حلقة`}`)
process.exit(found.length === 0 ? 0 : 1)

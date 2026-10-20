/**
 * يقسم ورقةَ الأنماط الواحدة (`src/routes/ui/styles.ts`) وحداتٍ في `src/routes/ui/styles/`
 * **بترتيبها كما هو، حرفًا بحرف**.
 *
 * ## لماذا سكربتٌ لا نقلٌ باليد
 *
 * الورقةُ ‏2700 سطر، وطلباتُ دمجٍ مفتوحةٌ تعدّلها. ونقلٌ باليد يتعارض مع كلّ طلبٍ منها،
 * ويُراجَع سطرًا سطرًا. **والسكربتُ يُعاد تشغيله على الورقة بعد كلّ دمج**، ويُقسم عند
 * عناوين الأقسام لا عند أرقام الأسطر، فما أُضيف داخل قسمٍ يقع في وحدته.
 *
 * ## والحَكَمُ مساواةُ النصّ
 *
 * السكربتُ يُسقط نفسه إن لم تُعِد الوحداتُ مجموعةً نصَّ الورقة كما هو، فـ`STYLE` بعد التقسيم هو
 * `STYLE` قبله **حرفًا بحرف**: لا قاعدةَ تتحرّك ولا ترتيبَ يتبدّل.
 *
 *     node scripts/split_styles.mjs            يقسم ويكتب الوحدات
 *     node scripts/split_styles.mjs --check    يقول ما سيكتب ولا يكتب
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const UI = new URL('../src/routes/ui/', import.meta.url).pathname
const SHEET = join(UI, 'styles.ts')
const DIR = join(UI, 'styles')
const CHECK = process.argv.includes('--check')

/**
 * الوحداتُ بترتيب الورقة: اسمُ الملفّ، والثابت، وأوّلُ عنوانٍ يبدأ به (بادئةُ تعليقٍ في عمق الأقواس صفر).
 * والأولى تبدأ من أوّل الورقة. **وعنوانٌ لا يوجد يُسقط السكربت**: قسمٌ أُعيدت تسميتُه يُقال لا يُبتلَع.
 */
const MODULES = [
  { file: 'base', name: 'BASE', title: null, about: 'الأساس: الصندوق والخطّ وحلقة التركيز والطيّ والعنوان واللمس' },
  { file: 'shell', name: 'SHELL', title: '/* ══ هيكلُ التطبيق', about: 'هيكل التطبيق: الرافدة والعلامة والشريط العلويّ والزجاج' },
  { file: 'head', name: 'HEAD', title: '/* ══ رأسُ الصفحة', about: 'رأس الصفحة والمقطع والإشعار' },
  { file: 'cards', name: 'CARDS', title: '/* ══ الشبكة والبطاقات', about: 'الشبكة والبطاقات والرئيسيّة وبطاقة المؤشّر' },
  { file: 'moment', name: 'MOMENT', title: '/* ══ لحظةُ العلامة', about: 'لحظة العلامة في الدخول والعامل الثاني' },
  { file: 'tables', name: 'TABLES', title: '/* ══ الجداول', about: 'الجداول واللوح المحوريّ' },
  { file: 'controls', name: 'CONTROLS', title: '/* ══ الزرّ', about: 'الزرّ والحقل والحالة الفارغة والقوائم والرسم والقنوات' },
  { file: 'sections', name: 'SECTIONS', title: '/* ══ الدليل', about: 'الدليل والمعالج والتبويبات والمسوّدات والمحرّر' },
  { file: 'decision', name: 'DECISION', title: '/* ══ مسرحُ القرار', about: 'مسرح القرار والمعاينة والصورة والطيّ' },
  { file: 'pages', name: 'PAGES', title: '/* ══ شاشةُ المنصّة', about: 'شاشة المنصّة وصفحتا الدخول والهبوط' },
  { file: 'narrow', name: 'NARROW', title: '/* ══ الشاشة الضيّقة', about: 'الشاشة الضيّقة والجوّال' },
  { file: 'extras', name: 'EXTRAS', title: '/* ── الوثائق العامّة', about: 'الوثائق والطباعة ولوحة الأوامر والتنبيهات والموعد' },
  { file: 'editions', name: 'EDITIONS', title: '/* ══ سجلُّ الطبعات', about: 'سجلّ الطبعات وما بقي منها' },
  { file: 'touch', name: 'TOUCH', title: '/* ══════════════════════════════════════════════════════════════════\n   طبقة اللمس', about: 'طبقة اللمس وما بعدها: آخر الورقة قصدًا (D-086)' },
]

const src = readFileSync(SHEET, 'utf8')
const OPEN = 'export const STYLE = TOKENS + `'
const at = src.indexOf(OPEN)
if (at < 0) { console.error('الورقةُ ليست واحدة: لا «export const STYLE = TOKENS + `» — قُسمت من قبل؟'); process.exit(1) }
const head = src.slice(0, at)
const bodyStart = at + OPEN.length
const bodyEnd = src.lastIndexOf('`')
const body = src.slice(bodyStart, bodyEnd)
if (src.slice(bodyEnd + 1).trim() !== '') { console.error('بعد الورقة شيءٌ لا يعرفه السكربت'); process.exit(1) }

/** عمقُ الأقواس عند كلّ موضع — والتعليقُ لا يُعدّ، و`${…}` متوازنٌ فيُعدّ ولا يضرّ. */
function depthAt(text, pos) {
  let depth = 0, inComment = false
  for (let i = 0; i < pos; i++) {
    if (inComment) { if (text[i] === '*' && text[i + 1] === '/') { inComment = false; i++ } continue }
    if (text[i] === '/' && text[i + 1] === '*') { inComment = true; i++; continue }
    if (text[i] === '{') depth++
    else if (text[i] === '}') depth--
  }
  return depth
}

const cuts = [0]
for (const m of MODULES.slice(1)) {
  let from = 0, found = -1
  while ((from = body.indexOf('\n' + m.title, from)) >= 0) {
    if (depthAt(body, from + 1) === 0) { found = from + 1; break }
    from += 1
  }
  if (found < 0) { console.error(`لم يوجد عنوانُ «${m.file}» في عمق صفر: ${m.title.split('\n').pop()}`); process.exit(1) }
  if (found <= cuts[cuts.length - 1]) { console.error(`«${m.file}» قبل ما سبقه: ترتيبُ الأقسام تغيّر`); process.exit(1) }
  cuts.push(found)
}
cuts.push(body.length)

const HELPERS = ['atLeast', 'below', 'narrower']
const parts = MODULES.map((m, i) => ({ ...m, text: body.slice(cuts[i], cuts[i + 1]) }))
if (parts.map((p) => p.text).join('') !== body) { console.error('التقسيمُ لا يعيد الورقة'); process.exit(1) }

for (const p of parts) {
  const used = HELPERS.filter((h) => p.text.includes('${' + h + '('))
  const lines = p.text.split('\n').length
  console.log(`${p.file}.ts  ${String(lines).padStart(5)} سطرًا${used.length ? '  ← ' + used.join(' · ') : ''}`)
}
if (CHECK) process.exit(0)

mkdirSync(DIR, { recursive: true })
for (const f of readdirSync(DIR)) if (f.endsWith('.ts') && !f.endsWith('.test.ts')) rmSync(join(DIR, f))
parts.forEach((p, i) => {
  const used = HELPERS.filter((h) => p.text.includes('${' + h + '('))
  const imp = used.length ? `import { ${used.join(', ')} } from '../tokens'\n\n` : ''
  const n = String(i + 1).padStart(2, '0')
  writeFileSync(join(DIR, `${n}-${p.file}.ts`),
    `/** ${p.about} — الوحدةُ ${i + 1} من ${parts.length} في ورقة الأنماط، بترتيبها (\`scripts/split_styles.mjs\`). */\n` +
    `${imp}export const ${p.name} = \`${p.text}\`\n`)
})

const imports = parts.map((p, i) => `import { ${p.name} } from './styles/${String(i + 1).padStart(2, '0')}-${p.file}'`).join('\n')
const newHead = head.replace(/import \{ TOKENS[^}]*\} from '\.\/tokens'\n/, `import { TOKENS } from './tokens'\n${imports}\n`)
writeFileSync(SHEET, `${newHead}/**
 * ‏**والورقةُ وحداتٌ بترتيبها** في \`styles/\` (\`scripts/split_styles.mjs\`): المتأخّرُ يغلب عند تساوي
 * ‏المحدّدات، فالترتيبُ هنا جزءٌ من المعنى لا تنظيمٌ له. وما يُضاف يُكتب في وحدة قسمه، و«طبقةُ اللمس» آخرًا.
 *
 * ‏**ولا \`@layer\` بعد**: جُرّبت طبقةٌ لكلّ وحدة فقاست لقطاتُ الأنماط المحسوبة ‏347 تغيّرًا مختلفًا، أوّلُها
 * ‏أزرارٌ تكسب حدًّا وحشوًا. فالطبقةُ تقلب ما كان المحدّدُ الأخصُّ يحسمه بين وحدتين، وكلُّ موضعٍ منها قرارٌ لا نقل.
 */
export const STYLE = TOKENS + ${parts.map((p) => p.name).join(' + ')}
`)
console.log(`كُتبت ${parts.length} وحدة، و\`styles.ts\` يجمعها`)

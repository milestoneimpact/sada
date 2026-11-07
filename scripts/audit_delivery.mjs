/**
 * **حارسُ سلسلة التوريد والتسليم** (D-319): ما بُني في القرار لا يرجع بسطرٍ يُكتب سهوًا.
 *
 * ## لماذا
 *
 * القرارُ كلُّه أسطرٌ في ملفّات إعدادٍ لا يقرؤها اختبار: إجراءٌ بوسمٍ يتحرّك بدل معرّف التزام، ورمزُ Cloudflare على مستوى
 * العمل فيراه كلُّ سكربت تثبيت، وبوّابةُ الاعتماديّات تُحذف أو تدخل `npm run ci` فيحتاج الشبكة، وworkers.dev يعود أصلًا ثانيًا،
 * وربطُ النسخة يسقط من بيئة فيقول `/ready` «null» ويسقط النشرُ كلُّه. وكلُّ واحدٍ منها يبدو سليمًا في طلب دمج.
 * فيسقط هذا المدقّق حين:
 *
 * ١ · `uses:` في `.github/workflows/*.yml` بغير معرّف التزامٍ كامل (40 حرفًا) وتعليقِ إصداره (`# vX.Y.Z`).
 * ٢ · `secrets.CLOUDFLARE_API_TOKEN` على مستوى السير أو العمل، أو على خطوةٍ لا تنادي wrangler. («أمضبوطٌ هو» `!= ''` جائز.)
 * ٣ · لا خطوةَ `npm audit --omit=dev --audit-level=high` في ci.yml، أو دخل `npm audit` سكربتَ `ci` (الذي يجري بلا شبكة).
 * ٤ · `.github/dependabot.yml` بلا npm أو بلا github-actions، أو بغير الدورة الشهريّة، أو بلا مجموعة minor وpatch.
 * ٥ · بيئةٌ في wrangler.toml بلا `workers_dev = false` و`preview_urls = false`، أو بلا ربط `CF_VERSION_METADATA`.
 * ٦ · deploy.yml لا يسأل عن ci (`ci-gate`) ولا يقارن النسخةَ المخدومة (`wait`)، أو يذكر workers.dev خارج تعليق،
 *     أو يثبّت بلا `--ignore-scripts`.
 *
 * `--self-test` يزرع كلَّ علّةٍ في نسخةٍ مؤقّتة ويتحقّق أنّها تُمسَك، ثمّ يفحص المستودع.
 */
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const ROOT = resolve(new URL('..', import.meta.url).pathname)
const PINNED = /^\s*-?\s*uses:\s*[\w.-]+\/[\w./-]+@[0-9a-f]{40}\s+#\s*v\d+(\.\d+){0,2}\s*$/
const indent = (line) => line.length - line.trimStart().length
const code = (line) => line.replace(/(^|\s)#.*$/, '')

/** يعيد سطرَ الأب (أقرب ما فوقه بإزاحةٍ أقلّ) ورقمَه. */
function parentOf(lines, i) {
  const own = indent(lines[i])
  for (let j = i - 1; j >= 0; j -= 1) {
    if (lines[j].trim() === '' || lines[j].trim().startsWith('#')) continue
    if (indent(lines[j]) < own) return j
  }
  return -1
}

/** كتلةُ الخطوة التي يبدأها سطرُ `- ` في الرقم `at`. */
function stepBlock(lines, at) {
  const own = indent(lines[at])
  const out = [lines[at]]
  for (let j = at + 1; j < lines.length; j += 1) {
    if (lines[j].trim() !== '' && indent(lines[j]) <= own) break
    out.push(lines[j])
  }
  return out.join('\n')
}

function auditWorkflow(name, text) {
  const notes = []
  const lines = text.split('\n')
  lines.forEach((line, i) => {
    if (/^\s*-?\s*uses:/.test(line) && !/uses:\s*(\.\/|docker:\/\/)/.test(line) && !PINNED.test(line)) {
      notes.push(`${name}:${i + 1} إجراءٌ بلا معرّف التزامٍ كامل وتعليقِ إصدار: ${line.trim()}`)
    }
    if (!code(line).includes('secrets.CLOUDFLARE_API_TOKEN') || /secrets\.CLOUDFLARE_API_TOKEN\s*!=\s*''/.test(line)) return
    const env = parentOf(lines, i)
    if (env < 0 || lines[env].trim() !== 'env:') { notes.push(`${name}:${i + 1} الرمزُ خارج \`env:\``); return }
    const owner = parentOf(lines, env)
    if (owner < 0 || !lines[owner].trimStart().startsWith('- ')) {
      notes.push(`${name}:${i + 1} CLOUDFLARE_API_TOKEN على مستوى ${owner < 0 ? 'السير' : `«${lines[owner].trim()}»`} لا خطوةٍ بعينها`)
      return
    }
    if (!/wrangler/.test(stepBlock(lines, owner))) notes.push(`${name}:${i + 1} CLOUDFLARE_API_TOKEN على خطوةٍ لا تنادي wrangler`)
  })
  return notes
}

/** يفحص جذرًا ويعيد الملحوظات — نقيّةً لتُختبَر بنسخةٍ مزروعة. */
export function auditDelivery(root) {
  const notes = []
  const wfDir = join(root, '.github', 'workflows')
  const workflows = readdirSync(wfDir).filter((f) => /\.ya?ml$/.test(f)).sort()
  for (const f of workflows) notes.push(...auditWorkflow(`.github/workflows/${f}`, readFileSync(join(wfDir, f), 'utf8')))

  // ٣ · بوّابةُ الاعتماديّات: خطوةٌ في ci.yml، لا في السكربت الذي يجري بلا شبكة
  const ci = readFileSync(join(wfDir, 'ci.yml'), 'utf8')
  if (!ci.split('\n').some((l) => /^\s*(-\s*)?run:\s*npm audit --omit=dev --audit-level=high\s*$/.test(code(l)))) {
    notes.push('ci.yml بلا خطوة `npm audit --omit=dev --audit-level=high`')
  }
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  if (/npm audit/.test(pkg.scripts?.ci ?? '')) notes.push('`npm audit` داخل `npm run ci`، وهو يجري بلا شبكة')

  // ٤ · Dependabot
  let dep = ''
  try { dep = readFileSync(join(root, '.github', 'dependabot.yml'), 'utf8') } catch { notes.push('لا .github/dependabot.yml') }
  if (dep !== '') {
    for (const eco of ['npm', 'github-actions']) {
      if (!new RegExp(`package-ecosystem:\\s*['"]?${eco}['"]?\\s*$`, 'm').test(dep)) notes.push(`dependabot.yml بلا ${eco}`)
    }
    if ((dep.match(/^\s*interval:\s*['"]?monthly/gm) ?? []).length < 2) notes.push('dependabot.yml: الدورةُ ليست شهريّةً للنظامين')
    if ((dep.match(/update-types:\s*\[\s*minor,\s*patch\s*\]/g) ?? []).length < 2) notes.push('dependabot.yml: لا مجموعةَ minor وpatch للنظامين')
  }

  // ٥ · wrangler.toml: أصلٌ واحدٌ عامّ وربطُ النسخة في كلّ بيئة
  const toml = readFileSync(join(root, 'wrangler.toml'), 'utf8')
  const sections = new Map()
  let current = ''
  for (const raw of toml.split('\n')) {
    const line = code(raw).trim()
    const head = /^\[\[?([^\]]+)\]\]?$/.exec(line)
    if (head) { current = head[1].trim(); if (!sections.has(current)) sections.set(current, []); continue }
    if (line !== '') sections.get(current)?.push(line)
  }
  const envs = [...sections.keys()].filter((k) => /^env\.[\w-]+$/.test(k))
  if (envs.length === 0) notes.push('wrangler.toml بلا بيئة')
  for (const e of envs) {
    const keys = sections.get(e)
    if (!keys.includes('workers_dev = false')) notes.push(`${e}: workers_dev ليس false — أصلٌ ثانٍ عامّ`)
    if (!keys.includes('preview_urls = false')) notes.push(`${e}: preview_urls ليس false — رابطٌ عامٌّ لكلّ نسخة`)
    if (!(sections.get(`${e}.version_metadata`) ?? []).includes('binding = "CF_VERSION_METADATA"')) notes.push(`${e}: بلا ربط CF_VERSION_METADATA`)
  }

  // ٦ · سيرُ النشر
  const deploy = readFileSync(join(wfDir, 'deploy.yml'), 'utf8')
  const live = deploy.split('\n').map(code).join('\n')
  if (!/deploy_checks\.mjs ci-gate/.test(live)) notes.push('deploy.yml لا يسأل عن نجاح ci على الالتزام (`ci-gate`)')
  if (!/deploy_checks\.mjs wait/.test(live)) notes.push('deploy.yml لا يقارن النسخةَ المخدومة بما نُشر (`wait`)')
  if (/workers\.dev/.test(live)) notes.push('deploy.yml يذكر workers.dev خارج تعليق — والفحصُ على النطاق وحده')
  for (const m of live.matchAll(/npm ci\b[^\n]*/g)) {
    if (!/--ignore-scripts/.test(m[0])) notes.push(`deploy.yml يثبّت بسكربتات التثبيت: ${m[0].trim()}`)
  }
  return notes
}

function selfTest() {
  const plants = [
    ['إجراءٌ بوسم', '.github/workflows/ci.yml', (s) => s.replace(/actions\/checkout@[0-9a-f]{40} # v[\d.]+/, 'actions/checkout@v4'), /بلا معرّف التزامٍ كامل/],
    ['معرّفٌ بلا تعليق إصدار', '.github/workflows/deploy.yml', (s) => s.replace(/(actions\/setup-node@[0-9a-f]{40}) # v[\d.]+/, '$1'), /بلا معرّف التزامٍ كامل/],
    ['الرمزُ على مستوى العمل', '.github/workflows/deploy.yml', (s) => s.replace("      SHA: ${{", "      CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}\n      SHA: ${{"), /على مستوى «deploy:»/],
    ['الرمزُ على خطوةٍ بلا wrangler', '.github/workflows/deploy.yml', (s) => s.replace("          GH_TOKEN: ${{ github.token }}", "          GH_TOKEN: ${{ github.token }}\n          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}"), /خطوةٍ لا تنادي wrangler/],
    ['لا بوّابةَ اعتماديّات', '.github/workflows/ci.yml', (s) => s.replace('run: npm audit --omit=dev --audit-level=high', 'run: echo audit'), /بلا خطوة `npm audit/],
    ['الفحصُ في npm run ci', 'package.json', (s) => s.replace('"ci": "npm run typecheck', '"ci": "npm audit && npm run typecheck'), /داخل `npm run ci`/],
    ['Dependabot بلا الإجراءات', '.github/dependabot.yml', (s) => s.replace('package-ecosystem: github-actions', 'package-ecosystem: docker'), /بلا github-actions/],
    ['Dependabot أسبوعيّ', '.github/dependabot.yml', (s) => s.replace('interval: monthly', 'interval: weekly'), /ليست شهريّةً/],
    ['workers.dev يعود', 'wrangler.toml', (s) => s.replace(/(\[env\.staging\][\s\S]*?)workers_dev = false/, '$1workers_dev = true'), /env\.staging: workers_dev/],
    ['ربطُ النسخة يسقط من الإنتاج', 'wrangler.toml', (s) => s.replace('[env.production.version_metadata]\nbinding = "CF_VERSION_METADATA"', ''), /env\.production: بلا ربط/],
    ['الفحصُ يقبل workers.dev', '.github/workflows/deploy.yml', (s) => s.replace('echo "فحص النطاق المخصّص"', 'echo "فحص النطاق المخصّص"; DEV=https://x.workers.dev'), /يذكر workers\.dev/],
    ['تثبيتٌ بسكربتاته', '.github/workflows/deploy.yml', (s) => s.replace('run: npm ci --ignore-scripts', 'run: npm ci'), /بسكربتات التثبيت/],
    ['لا مقارنةَ للنسخة', '.github/workflows/deploy.yml', (s) => s.replace(/node scripts\/deploy_checks\.mjs wait[^\n]*/, 'true'), /لا يقارن النسخةَ/],
  ]
  let missed = 0
  for (const [label, file, mutate, expect] of plants) {
    const dir = mkdtempSync(join(tmpdir(), 'sada-delivery-'))
    try {
      for (const p of ['.github', 'wrangler.toml', 'package.json']) cpSync(join(ROOT, p), join(dir, p), { recursive: true })
      const before = readFileSync(join(dir, file), 'utf8')
      const after = mutate(before)
      if (after === before) { console.log(`  ✕ «${label}»: الزرعُ لم يغيّر الملفّ`); missed += 1; continue }
      writeFileSync(join(dir, file), after)
      const notes = auditDelivery(dir)
      if (!notes.some((n) => expect.test(n))) { console.log(`  ✕ «${label}» لم يُمسَك (${notes.join(' | ') || 'لا ملحوظة'})`); missed += 1 }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }
  if (missed > 0) { console.log(`✕ self-test: ${missed} من ${plants.length} لم يقع كما يجب`); process.exit(1) }
  console.log(`  ✓ الفحصُ الذاتيّ: العللُ المزروعة الـ${plants.length} أُمسكت`)
}

if (process.argv.includes('--self-test')) selfTest()
const notes = auditDelivery(ROOT)
if (notes.length > 0) {
  console.log(`✕ سلسلةُ التوريد والتسليم: ${notes.length} ملحوظة`)
  for (const n of notes) console.log(`  ${n}`)
  process.exit(1)
}
console.log('  ✓ التوريدُ والتسليم: الإجراءاتُ بمعرّفاتها، والرمزُ على خطوات wrangler وحدها، وبوّابةُ الاعتماديّات، وDependabot، وأصلٌ واحدٌ ونسختُه')

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
 * ٧ · (مراجعة D-319) deploy.yml لا يسأل **قبل السحب** أهذا الالتزامُ رأسُ main (`id: head`)، أو خطوةٌ بعده لا يحرسها جوابُه —
 *     فإعادةُ ci على التزامٍ قديمٍ تنشره؛ أو لا `npm audit` في كلّ نشر؛ أو يفحص الخدمةَ والقاعدةَ و`ready` على جوابٍ لم يكتبه
 *     `wait` (أوّلُ جوابٍ قد يردّه البناءُ القديم)؛ أو لا ينشر ما نجح من ci المشغَّل يدويًّا على main.
 * ٨ · (مراجعة D-319) ci.yml يتخطّى المسوّدات باسم `ci` (المتخطّى «ناجحٌ» في الفحص المشروط، M-43)، أو يلغي الجاري على main
 *     (إعادةُ ci على التزامٍ قديم تلغي ci الأحدث فلا يُنشَر).
 * ٩ · (D-321) deploy.yml لا يأخذ علامةَ Time Travel قبل الترحيل (`id: bookmark` بـ`wrangler d1 time-travel info --json` تقرؤها
 *     `deploy_checks.mjs bookmark`)، أو يأخذها بعده، أو لا يطبعها في ملخّص العمل — فترحيلٌ يكسر القاعدةَ يبقى بلا أمرِ رجوعٍ مكتوب.
 *
 * `--self-test` يزرع كلَّ علّةٍ في نسخةٍ مؤقّتة ويتحقّق أنّها تُمسَك، ويُجري خطوةَ «رأس main» نفسَها بـ`gh` مزيَّف، ثمّ يفحص المستودع.
 */
import { spawnSync } from 'node:child_process'
import { chmodSync, cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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

/** خطواتُ أوّل `steps:` في السير: لكلٍّ سطرُ بدئها وكتلتُها وإزاحتُها. */
function stepsOf(lines) {
  const at = lines.findIndex((l) => /^\s*steps:\s*$/.test(l))
  if (at < 0) return []
  const out = []
  let own = -1
  for (let i = at + 1; i < lines.length; i += 1) {
    const l = lines[i]
    if (l.trim() === '' || l.trim().startsWith('#')) continue
    if (indent(l) <= indent(lines[at])) break
    if (!l.trimStart().startsWith('- ')) continue
    if (own < 0) own = indent(l)
    if (indent(l) === own) out.push({ line: i, own, block: stepBlock(lines, i) })
  }
  return out
}
/** شرطُ الخطوة (`if:` على مستواها) أو «». */
const stepIf = (s) => s.block.split('\n').map(code).find((l) => indent(l) === s.own + 2 && /^\s*if:/.test(l))?.replace(/^\s*if:\s*/, '').trim() ?? ''
const stepName = (s) => /(?:name|uses):\s*([^\n]+)/.exec(s.block)?.[1].trim() ?? `السطر ${s.line + 1}`
const HEAD_GATE = "steps.head.outputs.go == 'true'"
const AUDIT_RUN = /^\s*(-\s*)?run:\s*npm audit --omit=dev --audit-level=high\s*$/

/** نصُّ `run: |` في الخطوة ذات المعرّف `id` بلا إزاحته — ليُجرى في الفحص الذاتيّ كما يجريه العدّاء. */
export function stepRun(text, id) {
  const lines = text.split('\n')
  const s = stepsOf(lines).find((x) => new RegExp(`^\\s*id:\\s*${id}\\s*$`, 'm').test(x.block))
  if (s === undefined) return null
  const block = s.block.split('\n')
  const r = block.findIndex((l) => /^\s*run:\s*\|\s*$/.test(l))
  if (r < 0) return null
  const body = []
  for (const l of block.slice(r + 1)) { if (l.trim() !== '' && indent(l) <= indent(block[r])) break; body.push(l) }
  const pad = Math.min(...body.filter((l) => l.trim() !== '').map(indent))
  return body.map((l) => l.slice(pad)).join('\n')
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
  if (!ci.split('\n').some((l) => AUDIT_RUN.test(code(l)))) {
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

  // ٧ · (مراجعة D-319) رأسُ main قبل السحب ويحرس كلَّ ما بعده
  const steps = stepsOf(deploy.split('\n'))
  const head = steps.findIndex((s) => /^\s*id:\s*head\s*$/m.test(s.block))
  const headCode = head < 0 ? '' : steps[head].block.split('\n').map(code).join('\n')
  if (head < 0 || !/git\/ref\/heads\/main/.test(headCode) || !/\$SHA\b/.test(headCode)) {
    notes.push('deploy.yml لا يسأل أهذا الالتزامُ رأسُ main (`id: head` و`git/ref/heads/main`) — فإعادةُ ci على التزامٍ قديمٍ تنشره')
  } else {
    const checkout = steps.findIndex((s) => /uses:\s*actions\/checkout@/.test(s.block))
    if (checkout >= 0 && checkout < head) notes.push('deploy.yml يسأل عن رأس main بعد السحب — وما بعد السحب شيفرةُ الالتزام لا شيفرةُ main')
    for (const s of steps.slice(head + 1)) {
      if (!stepIf(s).includes(HEAD_GATE)) notes.push(`deploy.yml: «${stepName(s)}» لا يحرسها رأسُ main (\`${HEAD_GATE}\`)`)
    }
  }
  // ‏`npm audit` في كلّ نشر: الإنتاجُ يُنشَر بعد الدمج بأسابيع، وحكمُ ci يومَ الدمج لا يعرف ثغرةً نُشرت بعده
  const audit = steps.find((s) => s.block.split('\n').some((l) => AUDIT_RUN.test(code(l))))
  if (audit === undefined || stepIf(audit).replace(HEAD_GATE, '').trim() !== '') {
    notes.push('deploy.yml لا يفحص الاعتماديّات في كلّ نشر (`npm audit --omit=dev --audit-level=high` بلا شرطٍ سوى رأس main)')
  }
  // ‏ما بعد `wait` يُقرأ من الجواب الذي طابق النسخة، لا من أوّل جوابٍ قد يردّه البناءُ القديم
  const liveLines = live.split('\n')
  const waitAt = liveLines.findIndex((l) => /deploy_checks\.mjs wait\b/.test(l))
  const body = waitAt < 0 ? null : (/deploy_checks\.mjs wait\s+\S+\s+\S+\s+(\S+)/.exec(liveLines[waitAt])?.[1] ?? null)
  for (const needle of ['"service":"sada-api"', '"database":"ok"', '"ready":true']) {
    const reads = liveLines.map((l, i) => [l, i]).filter(([l]) => /\bgrep\b/.test(l) && l.includes(needle))
    if (reads.length === 0) { notes.push(`deploy.yml لا يفحص ${needle} في «التحقّق من النشر»`); continue }
    for (const [l, i] of reads) {
      if (body === null || i < waitAt || !l.includes(body)) notes.push(`deploy.yml يفحص ${needle} على جوابٍ لم يكتبه \`wait\` (السطر ${i + 1})`)
    }
  }
  if (!/github\.event\.workflow_run\.event == 'workflow_dispatch'/.test(live)) {
    notes.push('deploy.yml لا ينشر ما نجح من ci المشغَّل يدويًّا على main (`workflow_run.event == \'workflow_dispatch\'`)')
  }

  // ٩ · (D-321) علامةُ Time Travel قبل الترحيل، وفي ملخّص العمل
  const codeOf = (st) => st.block.split('\n').map(code).join('\n')
  const migrate = steps.findIndex((st) => /wrangler d1 migrations apply\b/.test(codeOf(st)))
  const mark = steps.findIndex((st) => /^\s*id:\s*bookmark\s*$/m.test(st.block))
  if (mark < 0) {
    notes.push('deploy.yml لا يأخذ علامةَ Time Travel قبل الترحيل (`id: bookmark`) — فترحيلٌ يكسر القاعدةَ بلا أمرِ رجوع')
  } else {
    const body = codeOf(steps[mark])
    if (!/wrangler d1 time-travel info\b[^\n]*--json/.test(body) || !/deploy_checks\.mjs bookmark\b/.test(body)) {
      notes.push('deploy.yml: خطوةُ العلامة لا تسأل `wrangler d1 time-travel info … --json` أو لا تقرؤها بـ`deploy_checks.mjs bookmark`')
    }
    if (!/GITHUB_STEP_SUMMARY/.test(body)) notes.push('deploy.yml: علامةُ Time Travel لا تُطبع في ملخّص العمل')
    if (migrate >= 0 && mark > migrate) notes.push('deploy.yml يأخذ علامةَ Time Travel بعد الترحيل — والعلامةُ لما قبله')
  }

  // ٨ · (مراجعة D-319) ci.yml: المتخطّى لا يُعدّ `ci`، والجاري على main لا يُلغى
  const ciLive = ci.split('\n').map(code).join('\n')
  if (/pull_request\.draft/.test(ciLive) && !/^\s*name:\s*\$\{\{[^}\n]*draft[^}\n]*\}\}\s*$/m.test(ciLive)) {
    notes.push('ci.yml يتخطّى المسوّدات باسم `ci` — والعملُ المتخطّى يُعدّ ناجحًا في الفحص المشروط (M-43)')
  }
  if (!/^\s*cancel-in-progress:\s*\$\{\{\s*github\.event_name == 'pull_request'\s*\}\}\s*$/m.test(ciLive)) {
    notes.push('ci.yml يلغي الجاري خارج طلبات الدمج — فإعادةُ ci على التزامٍ قديمٍ في main تلغي ci الأحدث فلا يُنشَر')
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
    // ‏مراجعة D-319
    ['لا سؤالَ عن رأس main', '.github/workflows/deploy.yml', (s) => s.replace('git/ref/heads/main', 'commits/HEAD'), /لا يسأل أهذا الالتزامُ رأسُ main/],
    ['رأسُ main بعد السحب', '.github/workflows/deploy.yml', (s) => s.replace('      - name: أهو رأسُ main؟', '      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0\n      - name: أهو رأسُ main؟'), /بعد السحب/],
    ['النشرُ بلا حارس الرأس', '.github/workflows/deploy.yml', (s) => s.replace("        id: deploy\n        if: steps.head.outputs.go == 'true'\n", '        id: deploy\n'), /«النشر» لا يحرسها رأسُ main/],
    ['الاعتماديّاتُ في الاحتياط وحده', '.github/workflows/deploy.yml', (s) => s.replace("      - name: الاعتماديّات\n        if: steps.head.outputs.go == 'true'\n", "      - name: الاعتماديّات\n        if: steps.head.outputs.go == 'true' && steps.ci.outputs.gate == 'run'\n"), /لا يفحص الاعتماديّات في كلّ نشر/],
    ['wait لا يكتب ما طابق', '.github/workflows/deploy.yml', (s) => s.replace('wait "$BASE" "$DEPLOYED" /tmp/ready.json', 'wait "$BASE" "$DEPLOYED"'), /"ready":true على جوابٍ لم يكتبه `wait`/],
    ['القاعدةُ تُفحص قبل wait', '.github/workflows/deploy.yml', (s) => s.replace('          node scripts/deploy_checks.mjs wait', "          grep -q '\"database\":\"ok\"' /tmp/ready.json\n          node scripts/deploy_checks.mjs wait"), /"database":"ok" على جوابٍ لم يكتبه `wait`/],
    ['ci اليدويُّ على main لا ينشر', '.github/workflows/deploy.yml', (s) => s.replace(" || github.event.workflow_run.event == 'workflow_dispatch'", ''), /المشغَّل يدويًّا/],
    ['المسوّدةُ تُبلَّغ باسم ci', '.github/workflows/ci.yml', (s) => s.replace(/ {4}name: \$\{\{ github\.event\.pull_request\.draft[^\n]*\n/, ''), /يتخطّى المسوّدات باسم `ci`/],
    ['الأقدمُ يلغي الأحدثَ على main', '.github/workflows/ci.yml', (s) => s.replace("cancel-in-progress: ${{ github.event_name == 'pull_request' }}", 'cancel-in-progress: true'), /يلغي الجاري خارج طلبات الدمج/],
    // ‏D-321
    ['لا علامةَ قبل الترحيل', '.github/workflows/deploy.yml', (s) => s.replace('        id: bookmark\n', '        id: mark\n'), /لا يأخذ علامةَ Time Travel قبل الترحيل/],
    ['العلامةُ بعد الترحيل', '.github/workflows/deploy.yml', (s) => {
      const at = s.indexOf('      - name: علامةُ الاسترجاع قبل الترحيل')
      const end = s.indexOf('\n\n', s.indexOf('GITHUB_STEP_SUMMARY', at)) + 2
      if (at < 0 || end < 2) return s
      const step = s.slice(at, end)
      const rest = s.slice(0, at) + s.slice(end)
      const after = rest.indexOf('      - name: الطوابير')
      return rest.slice(0, after) + step + rest.slice(after)
    }, /يأخذ علامةَ Time Travel بعد الترحيل/],
    ['العلامةُ لا تُطبع في الملخّص', '.github/workflows/deploy.yml', (s) => s.replace('          } >> "$GITHUB_STEP_SUMMARY"\n\n      # الترحيل', '          }\n\n      # الترحيل'), /لا تُطبع في ملخّص العمل/],
    ['العلامةُ بنصّ البشر', '.github/workflows/deploy.yml', (s) => s.replace('--env "$TARGET" --json > "$RUNNER_TEMP/bookmark.json"', '--env "$TARGET" > "$RUNNER_TEMP/bookmark.json"'), /لا تسأل `wrangler d1 time-travel info … --json`/],
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
  headStepCases()
  bookmarkStepCases()
}

/**
 * ‏خطوةُ «علامةُ الاسترجاع قبل الترحيل» نفسُها تُجرى بـbash (D-321)، و`npx` مزيَّفٌ يردّ ما يردّه wrangler (أو يسقط): العلامةُ في
 * ‏المخرَج وفي الملخّص بأمر الرجوع كاملًا وبقاعدة البيئة، **وما لا يُقرأ يوقف العملَ قبل الترحيل**.
 */
function bookmarkStepCases() {
  const script = stepRun(readFileSync(join(ROOT, '.github', 'workflows', 'deploy.yml'), 'utf8'), 'bookmark')
  if (script === null) { console.log('✕ self-test: لا خطوةَ `id: bookmark` بـ`run: |` في deploy.yml'); process.exit(1) }
  const BM = '00000085-0000024c-00004c6d-8e61117bf38d7adb71b934ebbf891683'
  //  [الحالة، البيئة، ما يطبعه npx (null = يسقط)، الخروج، القاعدة]
  const cases = [
    ['staging ← العلامةُ والأمرُ في الملخّص', 'staging', JSON.stringify({ bookmark: BM }, null, 2), 0, 'sada-staging'],
    ['الإنتاج ← قاعدتُه هو', 'production', JSON.stringify({ bookmark: BM }), 0, 'sada'],
    ['wrangler يسقط ← أحمرُ قبل الترحيل', 'staging', null, 1, 'sada-staging'],
    ['نصُّ البشر بلا --json ← أحمر', 'staging', `⚠️ The current bookmark is '${BM}'`, 1, 'sada-staging'],
  ]
  let missed = 0
  for (const [label, target, answer, wantCode, db] of cases) {
    const dir = mkdtempSync(join(tmpdir(), 'sada-bookmark-'))
    try {
      const npx = join(dir, 'npx')
      writeFileSync(npx, '#!/bin/sh\necho "$*" >> "$FAKE_LOG"\n[ "$FAKE_FAIL" = 1 ] && exit 1\nprintf \'%s\\n\' "$FAKE_OUT"\n')
      chmodSync(npx, 0o755)
      const out = join(dir, 'out')
      const log = join(dir, 'log')
      const summary = join(dir, 'summary')
      for (const f of [out, log, summary]) writeFileSync(f, '')
      const r = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', script], {
        cwd: ROOT,
        encoding: 'utf8',
        env: {
          PATH: `${dir}:${process.env.PATH}`, TARGET: target, RUNNER_TEMP: dir, GITHUB_OUTPUT: out, GITHUB_STEP_SUMMARY: summary,
          CLOUDFLARE_API_TOKEN: 'dummy', FAKE_LOG: log, FAKE_OUT: answer ?? '', FAKE_FAIL: answer === null ? '1' : '0',
        },
      })
      const got = /^bookmark=(.*)$/m.exec(readFileSync(out, 'utf8'))?.[1] ?? ''
      const asked = readFileSync(log, 'utf8').includes(`wrangler d1 time-travel info ${db} --env ${target} --json`)
      const told = readFileSync(summary, 'utf8').includes(`npx wrangler d1 time-travel restore ${db} --env ${target} --bookmark=${BM}`)
      const ok = wantCode === 0 ? r.status === 0 && got === BM && asked && told : r.status !== 0 && got === '' && asked
      if (!ok) {
        console.log(`  ✕ «${label}»: خرج ${r.status} والعلامة «${got || '∅'}» و${asked ? 'سُئل' : 'لم يُسأل'} و${told ? 'في الملخّص' : 'ليست في الملخّص'} (${(r.stdout + r.stderr).trim()})`)
        missed += 1
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }
  if (missed > 0) { console.log(`✕ self-test: ${missed} من ${cases.length} حالاتِ «العلامة» لم تقع كما يجب`); process.exit(1) }
  console.log(`  ✓ خطوةُ «علامةُ الاسترجاع» تُجرى بـbash: ${cases.length} حالات (staging، والإنتاجُ بقاعدته، وwrangler يسقط، ونصٌّ بلا --json)`)
}

/**
 * ‏خطوةُ «رأس main» نفسُها تُجرى بـbash كما يجريها العدّاء (`-eo pipefail`)، و`gh` مزيَّفٌ يردّ رأسًا نختاره (مراجعة D-319):
 * إعادةُ ci على التزامٍ تجاوزه main تنتهي خضراءَ بلا نشر، والسؤالُ المتعذّر أحمر، والنشرُ اليدويُّ لا يسأل.
 */
function headStepCases() {
  const script = stepRun(readFileSync(join(ROOT, '.github', 'workflows', 'deploy.yml'), 'utf8'), 'head')
  if (script === null) { console.log('✕ self-test: لا خطوةَ `id: head` بـ`run: |` في deploy.yml'); process.exit(1) }
  const A = 'a'.repeat(40)
  const B = 'b'.repeat(40)
  //  [الحالة، الحدث، ما يردّه gh (null = يسقط)، الخروج، go، أسُئل gh]
  const cases = [
    ['ci نجح على رأس main ← يُنشَر', 'workflow_run', A, 0, 'true', true],
    ['ci أُعيد على التزامٍ تجاوزه main ← أخضرُ بلا نشر', 'workflow_run', B, 0, 'false', true],
    ['السؤالُ يتعذّر ← أحمرُ بلا نشر', 'workflow_run', null, 1, '', true],
    ['جوابٌ فارغ ← أحمرُ بلا نشر', 'workflow_run', '', 1, '', true],
    ['نشرٌ يدويّ ← لا يُسأل', 'workflow_dispatch', B, 0, 'true', false],
  ]
  let missed = 0
  for (const [label, event, answer, wantCode, wantGo, wantAsked] of cases) {
    const dir = mkdtempSync(join(tmpdir(), 'sada-head-'))
    try {
      const gh = join(dir, 'gh')
      writeFileSync(gh, '#!/bin/sh\necho "$*" >> "$FAKE_LOG"\n[ "$FAKE_FAIL" = 1 ] && exit 1\nprintf \'%s\\n\' "$FAKE_HEAD"\n')
      chmodSync(gh, 0o755)
      const out = join(dir, 'out')
      const log = join(dir, 'log')
      writeFileSync(out, '')
      writeFileSync(log, '')
      const r = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', script], {
        encoding: 'utf8',
        env: {
          PATH: `${dir}:${process.env.PATH}`, GITHUB_EVENT_NAME: event, SHA: A, GITHUB_REPOSITORY: 'owner/repo',
          GITHUB_OUTPUT: out, GITHUB_STEP_SUMMARY: join(dir, 'summary'), GH_TOKEN: 'dummy',
          FAKE_LOG: log, FAKE_HEAD: answer ?? '', FAKE_FAIL: answer === null ? '1' : '0',
        },
      })
      const go = /^go=(\w+)$/m.exec(readFileSync(out, 'utf8'))?.[1] ?? ''
      const asked = readFileSync(log, 'utf8')
      const askedRight = asked.includes('api repos/owner/repo/git/ref/heads/main')
      if (r.status !== wantCode || go !== wantGo || (asked !== '') !== wantAsked || (wantAsked && !askedRight)) {
        console.log(`  ✕ «${label}»: خرج ${r.status} وgo=${go || '∅'} و${asked === '' ? 'لم يُسأل' : `سُئل: ${asked.trim()}`} (${(r.stdout + r.stderr).trim()})`)
        missed += 1
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }
  if (missed > 0) { console.log(`✕ self-test: ${missed} من ${cases.length} حالاتِ «رأس main» لم تقع كما يجب`); process.exit(1) }
  console.log(`  ✓ خطوةُ «رأس main» تُجرى بـbash: ${cases.length} حالات (رأسٌ هو، ورأسٌ تقدّم، وسؤالٌ يتعذّر، وجوابٌ فارغ، ونشرٌ يدويّ)`)
}

if (process.argv.includes('--self-test')) selfTest()
const notes = auditDelivery(ROOT)
if (notes.length > 0) {
  console.log(`✕ سلسلةُ التوريد والتسليم: ${notes.length} ملحوظة`)
  for (const n of notes) console.log(`  ${n}`)
  process.exit(1)
}
console.log('  ✓ التوريدُ والتسليم: الإجراءاتُ بمعرّفاتها، والرمزُ على خطوات wrangler وحدها، وبوّابةُ الاعتماديّات، وDependabot، وأصلٌ واحدٌ ونسختُه، وعلامةُ Time Travel قبل الترحيل')

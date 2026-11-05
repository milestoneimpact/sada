/**
 * حارسُ تعدّد المستأجرين: **كلُّ استعلامٍ على جدول عملٍ يسمّي `org_id`** (D-224).
 *
 * ## لماذا
 *
 * العزلُ بين المنظّمات في قاعدةٍ مشتركةٍ قيدٌ منطقيّ: صفوفُ الجميع في الجدول
 * نفسِه، **واستعلامٌ واحدٌ ينسى `org_id` يُري منظّمةً بياناتِ غيرها**. وهذا لا
 * تمسكه الأنواعُ ولا الاختبارات التي تزرع منظّمةً واحدة.
 *
 * ## كيف: سقّاطة
 *
 * اليومَ عشراتُ الاستعلامات قبل التحويل، فلا يُطلَب الصفرُ دفعةً واحدة.
 * يُحفَظ لكلّ جدولٍ عددُ جمله غير المقيّدة في `scripts/tenancy-baseline.json`،
 * **ويسقط الفحصُ إن زاد أيُّ عدد** (جملةٌ جديدةٌ بلا منظّمة)، **أو نقص ولم
 * يُحدَّث الملفّ** (فلا يرتدّ الخطُّ بعد أن تقدّم). والهدفُ صفرٌ في كلّ جدول.
 *
 * `--self-test` يتحقّق أنّ الحارس يرى جملةً بلا منظّمةٍ ويقبل المقيّدة.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = new URL('../src/', import.meta.url).pathname
const BASELINE = new URL('./tenancy-baseline.json', import.meta.url).pathname

/** جداولُ العمل — **ومرآتُها `migrations/0031_tenancy.sql`**. */
export const TENANT_TABLES = new Set([
  'accounts', 'tokens', 'sources', 'content_items', 'plans', 'posts', 'publish_attempts',
  'metrics', 'promotion_suggestions', 'settings', 'providers', 'task_routes', 'cost_ledger',
  'audit_log', 'reports', 'token_alerts', 'media_claims', 'analysis_claims', 'alert_outbox', 'oauth_apps',
  'uploads', 'media', 'brands', 'plan_versions', 'notice_reads', 'web_vitals',
])

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) out.push(...walk(path))
    else if (name.endsWith('.ts')) out.push(path)
  }
  return out
}

/** التعليقاتُ تُمحى: الشرحُ العربيّ يقتبس SQL. */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ')

/** جملُ SQL في نصّ — بالطريقة نفسِها التي يقرأ بها `audit_columns`. */
export function statementsOf(code) {
  const out = []
  for (const [i, part] of code.split('`').entries()) if (i % 2 === 1) out.push(part)
  for (const m of code.matchAll(/'([^'\n]*?(?:SELECT|INSERT|UPDATE|DELETE)[^'\n]*?)'/gis)) out.push(m[1])
  for (const m of code.matchAll(/"([^"\n]*?(?:SELECT|INSERT|UPDATE|DELETE)[^"\n]*?)"/gis)) out.push(m[1])
  return out.filter((s) => /\b(SELECT|INSERT|UPDATE|DELETE)\b/.test(s) && /\b(FROM|INTO|UPDATE)\b/.test(s))
}

/** عددُ الجمل غير المقيّدة لكلّ جدول عمل. */
export function unscoped(statements) {
  const counts = {}
  for (const st of statements) {
    if (/\borg_id\b/.test(st)) continue
    const tables = new Set()
    for (const m of st.matchAll(/\b(?:FROM|JOIN|INTO|UPDATE)\s+(\w+)/gi)) {
      if (TENANT_TABLES.has(m[1])) tables.add(m[1])
    }
    for (const t of tables) counts[t] = (counts[t] ?? 0) + 1
  }
  return counts
}

function selfTest() {
  const bad = unscoped(statementsOf("db.prepare('SELECT id FROM posts WHERE status = ?')"))
  const good = unscoped(statementsOf("db.prepare('SELECT id FROM posts WHERE org_id = ? AND status = ?')"))
  const other = unscoped(statementsOf("db.prepare('SELECT at FROM heartbeats WHERE job = ?')"))
  const ok = bad.posts === 1 && good.posts === undefined && Object.keys(other).length === 0
  if (!ok) {
    console.error('✕ اختبارُ الحارس الذاتيّ فشل', { bad, good, other })
    process.exit(1)
  }
}

if (process.argv.includes('--self-test')) selfTest()

const code = walk(SRC)
  .filter((f) => !f.endsWith('.test.ts') && !f.includes('/test/'))
  .map((f) => strip(readFileSync(f, 'utf8')))
  .join('\n')
const now = unscoped(statementsOf(code))

if (process.argv.includes('--write')) {
  const sorted = Object.fromEntries(Object.entries(now).sort(([a], [b]) => a.localeCompare(b)))
  writeFileSync(BASELINE, JSON.stringify(sorted, null, 2) + '\n')
  console.log('✓ كُتب خطُّ الأساس')
  process.exit(0)
}

const base = JSON.parse(readFileSync(BASELINE, 'utf8'))
const findings = []
for (const table of new Set([...Object.keys(now), ...Object.keys(base)])) {
  const n = now[table] ?? 0
  const b = base[table] ?? 0
  if (n > b) findings.push(`  ✕ ${table}: ${n} جملةً بلا org_id، والسقفُ ${b} — جملةٌ جديدةٌ لا تسمّي المنظّمة`)
  else if (n < b) findings.push(`  ✕ ${table}: ${n} والسقفُ ${b} — تقدّمٌ لم يُسجَّل: شغّل \`node scripts/audit_tenancy.mjs --write\``)
}

const total = Object.values(now).reduce((a, b) => a + b, 0)
console.log('\n═══ تعدّدُ المستأجرين: جملٌ بلا org_id ═══\n')
if (findings.length === 0) {
  console.log(`  ✓ لا جملةَ جديدةً بلا منظّمة (${total} باقيةً للتحويل، والهدفُ صفر)\n`)
  process.exit(0)
}
for (const f of findings) console.log(f)
console.log('')
process.exit(1)

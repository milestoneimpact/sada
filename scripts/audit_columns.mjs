/**
 * مدقّقُ الأعمدة: **ما يُكتَب في القاعدة ولا يُقرأ منها.**
 *
 * ## لماذا
 *
 * D-069 كان عمودا: `posts.has_url` يُكتب **صفرا مكتوبا حرفا**، و
 * `ARCHITECTURE.md §٤` تقول منذ أوّل يوم إنّه «يُحسَب بالشيفرة لا
 * بالنموذج **ويُعرَض في اللوحة مع تكلفته على X**». ولا قارئَ له.
 *
 * ووُجد **بالمصادفة**، حين تتبّعتُ رمزا آخر في `audit_dead`. وذاك
 * يُدقّق الرموزَ المُصدَّرة؛ **وهذا يُدقّق ما دونها**: عمودٌ يُملأ في
 * كلّ صفٍّ ولا يُسأل عنه أبدا هو وعدٌ لم يُوفَ به، أو حقلٌ نُسي.
 *
 * ## وثلاثةُ أشكالٍ خدعت أوّلَ صياغةٍ لهذا المدقّق
 *
 * | ما وقع | ما ظهر | العلاج |
 * |---|---|---|
 * | **علاماتٌ مائلة في شرحٍ عربيّ** | نثرٌ يُقرأ SQL | التعليقاتُ تُمحى أوّلا |
 * | **مزاوجةٌ بالبحث لا بالترتيب** | علامةٌ تُغلق تُزاوَج بأخرى تفتح | تُقسَم بالترتيب |
 * | **`SELECT *` و `SELECT ${COLUMNS}`** | عمودٌ يُقرأ بلا اسم | جدولُه يُستثنى |
 *
 * **ولولا الثلاثةُ لأعطى ٢٦ ملحوظةً أكثرُها كذب** — ومدقّقٌ يكذب مرّةً
 * لا يُقرأ ثانيةً (وهو درسُ D-067 نفسُه).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SRC = new URL('../src/', import.meta.url).pathname
const MIG = new URL('../migrations/', import.meta.url).pathname

/**
 * ما يُكتَب ولا يُقرأ **بحقّ** — ومعه سببُه.
 *
 * **ولا يُضاف اسمٌ هنا بلا سطرٍ يقول لماذا**، ولا يُضاف «سيُقرأ لاحقا»:
 * تلك حجّةُ `has_url` نفسِها، وعاشت سنةً كذبا في عمود.
 */
const ALLOWED = new Map([
  ['publish_attempts.request_json', 'سجلٌّ جنائيّ: ما أُرسِل فعلا — يُقرأ باستعلامٍ عند التحقيق، لا في مسار'],
  ['publish_attempts.response_json', 'وكذلك ما رُدّ — وقيمتُه أنّه موجودٌ حين يُسأل، لا أنّه يُعرَض'],
  ['audit_log.ua', 'وسمُ الجهاز يُحفَظ للتحقيق في جلسةٍ مريبة، ولا يُعرَض في الجرد'],
  ['metrics.clicks', '**لا منصّةَ تعطيه**: LinkedIn لعضوٍ لا يعطي حتّى الظهور، و X لا يعطي النقر. عمودٌ ينتظر منصّةً تعطيه'],
  ['reports.version', 'نسخةُ المخطّط — تُقرأ يومَ توجد نسخةٌ ثانيةٌ تحتاج ترقية، ولا معنى لقراءتها قبلها'],
  ['content_items.extracted_at', 'ختمُ التحليل — و`sources.last_seen_at` هو المعروض في اللوحة، وهذا يبقى للاستعلام'],
  ['promotion_suggestions.decided_at', 'ختمُ البَتّ — والتوصيةُ المبتوتُ فيها تخرج من `openSuggestions` أصلا (D-058)'],
  ['auth_attempts.window_start', 'يُقرأ داخل `ON CONFLICT … CASE` في `security/gate.ts`: العبارةُ الذرّيّةُ نفسُها تسأله أفاتت النافذة، ولا SELECT له لأنّ SELECTًا منفصلًا يعيد النافذةَ التي أغلقها (D-161)'],
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

/** التعليقاتُ تُمحى: هذا المستودعُ يقتبس أسماءَ الأعمدة في شرحٍ عربيّ. */
function strip(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ')
}

const code = walk(SRC)
  .filter((f) => !f.endsWith('.test.ts') && !f.includes('/test/'))
  .map((f) => strip(readFileSync(f, 'utf8')))
  .join('\n')

/**
 * جملُ SQL — **وتُزاوَج العلاماتُ بالترتيب**.
 *
 * نمطٌ يبحث عن علامتين حول `SELECT` يزاوج علامةً تُغلق حرفيّةً بعلامةٍ
 * تفتح التاليةَ، فيقرأ ما بينهما — وهو شيفرةٌ لا SQL.
 */
const statements = []
for (const [i, part] of code.split('`').entries()) if (i % 2 === 1) statements.push(part)
for (const m of code.matchAll(/'([^'\n]*?(?:SELECT|INSERT|UPDATE|DELETE)[^'\n]*?)'/gis)) {
  statements.push(m[1])
}
for (const m of code.matchAll(/"([^"\n]*?(?:SELECT|INSERT|UPDATE|DELETE)[^"\n]*?)"/gis)) {
  statements.push(m[1])
}
const allSql = statements.join('\n;;\n')

/** ما يقع في موضعِ قراءة: قائمةُ `SELECT`، أو شرطٌ، أو ترتيبٌ، أو وصل. */
const reads = []
for (const st of statements) {
  const list = st.match(/SELECT([\s\S]*?)\bFROM\b/i)
  if (list) reads.push(list[1])
  const clause =
    /\b(?:WHERE|ORDER BY|GROUP BY|HAVING|ON)\b([\s\S]*?)(?=\b(?:SELECT|FROM|VALUES|SET|LIMIT|GROUP|ORDER|HAVING|JOIN|\)|$))/gi
  for (const m of st.matchAll(clause)) reads.push(m[1])
}
const readText = reads.join('\n;;\n')

/** جدولٌ يُقرأ بلا تسميةِ أعمدة — فأعمدتُه كلُّها مقروءةٌ من هنا. */
const opaque = new Set()
for (const m of allSql.matchAll(/SELECT\s+\*\s+FROM\s+(\w+)/gi)) opaque.add(m[1])
for (const m of allSql.matchAll(/SELECT\s+([\s\S]*?)\bFROM\s+(\w+)/gi)) {
  if (m[1].includes('${')) opaque.add(m[2])
}

/** أعمدةُ المخطّط — وجداولُ الترحيل المؤقّتةُ لا تُحاسَب. */
const TEMP = /_new$|_old$/
const columns = []
const dropped = new Set()
for (const file of readdirSync(MIG).filter((n) => n.endsWith('.sql')).sort()) {
  const sql = readFileSync(join(MIG, file), 'utf8')
  for (const m of sql.matchAll(/DROP TABLE (?:IF EXISTS )?(\w+)/gi)) dropped.add(m[1])
  for (const m of sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?(\w+)\s*\(([\s\S]*?)\n\);/g)) {
    if (TEMP.test(m[1])) continue
    for (const line of m[2].split('\n')) {
      const text = line.trim()
      if (text === '' || text.startsWith('--')) continue
      const col = text.match(/^(\w+)\s+(?:TEXT|INTEGER|REAL|BLOB|NUMERIC)/i)
      if (col) columns.push({ table: m[1], col: col[1], file })
    }
  }
  for (const m of sql.matchAll(/ALTER TABLE (\w+)\s+ADD COLUMN (\w+)/gi)) {
    if (!TEMP.test(m[1])) columns.push({ table: m[1], col: m[2], file })
  }
}

/**
 * عمودا المستأجر (D-223) — **مُعفَيان ما دامت السقّاطةُ تعدّ جملًا بلا منظّمة**.
 *
 * أُضيفا لكلّ جدول عملٍ في ترحيلٍ واحد، ويُقرآن جدولًا جدولًا كلّما حُوِّلت
 * جملُه إلى `org_id`. والإعفاءُ **ليس «سيُقرأ لاحقا»**: هو مربوطٌ بعددٍ في
 * `tenancy-baseline.json` يحرسه `audit_tenancy`، **وينتهي وحدَه حين يصل جدولُه
 * صفرًا** — فعمودٌ لا يُقرأ بعدها يسقط هنا كأيّ عمود. و`brands` يُعفى ما بقي
 * في المستودع كلّه جملةٌ بلا منظّمة: هو ما تُقرأ به المنظّمةُ حين تُقيَّد.
 */
const tenancy = JSON.parse(readFileSync(new URL('./tenancy-baseline.json', import.meta.url), 'utf8'))
const tenancyLeft = Object.values(tenancy).reduce((a, b) => a + b, 0)
const tenancyPending = (table, col) =>
  (col === 'org_id' || col === 'brand_id') &&
  ((tenancy[table] ?? 0) > 0 || (table === 'brands' && tenancyLeft > 0))

const findings = []
for (const { table, col, file } of columns) {
  if (dropped.has(table) || opaque.has(table)) continue
  if (ALLOWED.has(`${table}.${col}`)) continue
  if (tenancyPending(table, col)) continue
  const word = new RegExp(`\\b${col}\\b`)
  if (!word.test(allSql)) findings.push({ table, col, file, why: 'لا يُذكَر في أيّ جملة' })
  else if (!word.test(readText)) findings.push({ table, col, file, why: 'يُكتَب ولا يُقرأ' })
}

console.log('\n═══ أعمدةٌ تُكتَب ولا تُقرأ ═══\n')
if (findings.length === 0) {
  console.log('  ✓ لا عمودَ مكتوبٍ بلا قارئ')
  console.log(`\n(${columns.length} عمودا · ${ALLOWED.size} معلَّلا في القائمة)\n`)
  process.exit(0)
}
for (const f of findings) console.log(`  ✕ ${f.table}.${f.col}  —  ${f.file}  (${f.why})`)
console.log(`\nالمجموع: ${findings.length}\n`)
console.log('وكلٌّ منها إمّا **يُوصَل بمن يُفترَض أن يقرأه**، أو يُحذَف من')
console.log('المخطّط، أو يُضاف إلى ALLOWED **بسطرٍ يقول لماذا** — ولا يُقال')
console.log('«سيُقرأ لاحقا»: تلك حجّةُ `has_url`، وعاشت سنةً كذبا في عمود.\n')
process.exit(1)

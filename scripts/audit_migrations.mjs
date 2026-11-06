/**
 * **ترحيلٌ يُسقط جدولًا أبًا يمحو أبناءه على D1** (D-316).
 *
 * قالبُ إعادة البناء في SQLite يبدأ بـ`PRAGMA foreign_keys = OFF` ثمّ ينسخ الجدولَ ويُسقط القديم. **وD1 يطبّق كلَّ ترحيلٍ في
 * معاملة**، و`foreign_keys` لا يتبدّل داخل معاملة، فالسطرُ لا يفعل شيئًا (وثائقُ D1 تقول `PRAGMA defer_foreign_keys = true`).
 * و`DROP TABLE` يجري `DELETE` ضمنيًّا **يُطلق أفعالَ المفاتيح الأجنبيّة**: كلُّ ابنٍ بـ`ON DELETE CASCADE` يُمحى، و`SET NULL`
 * يفقد مرجعَه. والتأجيلُ (`defer_foreign_keys`) يؤجّل الفحصَ لا الأفعال. وأعادت المحاكاةُ (معاملةٌ لكلّ ملفّ والمفاتيحُ مفعَّلة)
 * محوَ `posts` و`publish_attempts` في 0013. واختباراتُ `fakeDb` لا تراه: تطبّق الترحيلاتِ بلا معاملة.
 *
 * فيُفحص كلُّ ترحيلٍ بعد ‏0043 على المخطَّط الذي قبله: `DROP TABLE x` وفي المخطَّط ابنٌ لـ`x` بفعلٍ عند الحذف لم يُسقَط قبله في
 * الملفّ نفسِه ← يُردّ. و`PRAGMA foreign_keys` في ترحيلٍ جديد ← يُردّ (لا يفعل شيئًا على D1 ويوهم بالأمان).
 * وما قبل ‏0044 طُبّق على staging فلا يُعدَّل؛ يُطبع خطرُه التاريخيّ ولا يُسقط البوّابة.
 *
 * الاستعمال: node scripts/audit_migrations.mjs [--self-test]
 */
import { DatabaseSync } from 'node:sqlite'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const DIR = new URL('../migrations/', import.meta.url).pathname
/** آخرُ ترحيلٍ طُبّق قبل الحارس: ما بعده يُفحص صارمًا. */
const LAST_APPLIED = '0043'

/** يزيل التعليقات (السطريّة والكتليّة) فلا يُعدّ كلامٌ عن الإسقاط إسقاطًا. */
function strip(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ')
}

/** أبناءُ كلّ جدولٍ بفعلٍ عند الحذف، من المخطَّط الحيّ. */
function children(db) {
  const out = new Map()
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all().map((r) => r.name)
  for (const t of tables) {
    for (const fk of db.prepare(`PRAGMA foreign_key_list("${t}")`).all()) {
      const act = String(fk.on_delete ?? '').toUpperCase()
      if (act === '' || act === 'NO ACTION' || act === 'RESTRICT') continue
      const parent = String(fk.table).toLowerCase()
      if (!out.has(parent)) out.set(parent, [])
      out.get(parent).push({ child: t.toLowerCase(), action: act })
    }
  }
  return out
}

/** ملاحظاتُ ترحيلٍ واحدٍ على المخطَّط الذي قبله. */
function check(db, name, sql) {
  const body = strip(sql)
  const notes = []
  if (/PRAGMA\s+foreign_keys\s*=/i.test(body)) notes.push('PRAGMA foreign_keys لا يتبدّل داخل معاملة D1: لا يفعل شيئًا')
  const kids = children(db)
  const drops = [...body.matchAll(/DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?["`]?([A-Za-z_][A-Za-z0-9_]*)["`]?/gi)].map((m) => ({ table: m[1].toLowerCase(), at: m.index }))
  for (const d of drops) {
    for (const k of kids.get(d.table) ?? []) {
      // ‏ابنٌ أُسقط قبل أبيه في الملفّ نفسِه لا يُمحى بإسقاط الأب
      const first = drops.find((x) => x.table === k.child)
      if (first !== undefined && first.at < d.at) continue
      notes.push(`DROP TABLE ${d.table} يُطلق ${k.action} على ${k.child}`)
    }
  }
  return notes
}

/** يطبّق الترحيلاتِ كما يطبّقها D1 (معاملةٌ لكلّ ملفّ والمفاتيحُ مفعَّلة) ويجمع الملاحظات. */
function run(files) {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  const strict = []
  const history = []
  for (const [name, sql] of files) {
    const notes = check(db, name, sql)
    if (notes.length > 0) (name.slice(0, 4) > LAST_APPLIED ? strict : history).push(...notes.map((n) => `${name}: ${n}`))
    db.exec('BEGIN')
    db.exec(sql)
    db.exec('COMMIT')
  }
  return { strict, history }
}

const real = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort().map((f) => [f, readFileSync(join(DIR, f), 'utf8')])

if (process.argv.includes('--self-test')) {
  const base = [
    ['0001_a.sql', 'CREATE TABLE p (id TEXT PRIMARY KEY); CREATE TABLE c (id TEXT PRIMARY KEY, p_id TEXT REFERENCES p(id) ON DELETE CASCADE);'],
  ]
  const plants = [
    ['إسقاطُ أبٍ له ابنٌ بـCASCADE', [['9001_x.sql', 'CREATE TABLE p_new (id TEXT PRIMARY KEY); INSERT INTO p_new SELECT * FROM p; DROP TABLE p; ALTER TABLE p_new RENAME TO p;']], (r) => r.strict.length === 1 && r.strict[0].includes('CASCADE على c')],
    ['ابنٌ يُسقط قبل أبيه في الملفّ نفسِه', [['9001_x.sql', 'DROP TABLE c; DROP TABLE p; CREATE TABLE p (id TEXT PRIMARY KEY);']], (r) => r.strict.length === 0],
    ['PRAGMA foreign_keys في ترحيلٍ جديد', [['9001_x.sql', 'PRAGMA foreign_keys = OFF; ALTER TABLE p ADD COLUMN n TEXT;']], (r) => r.strict.length === 1 && r.strict[0].includes('PRAGMA')],
    ['إسقاطٌ في تعليقٍ لا يُعدّ', [['9001_x.sql', '-- DROP TABLE p\nALTER TABLE p ADD COLUMN n TEXT;']], (r) => r.strict.length === 0],
    ['عمودٌ يُضاف بلا إسقاط', [['9001_x.sql', 'ALTER TABLE c ADD COLUMN n TEXT;']], (r) => r.strict.length === 0],
  ]
  let missed = 0
  for (const [label, extra, ok] of plants) {
    const r = run([...base, ...extra])
    const good = ok(r)
    if (!good) missed += 1
    console.log(`  ${good ? '✓' : '✕'} ${label}${r.strict.length ? ` — ${r.strict.join(' · ')}` : ''}`)
  }
  if (missed > 0) { console.log(`✕ self-test: ${missed} من ${plants.length} لم يقع كما يجب`); process.exit(1) }
  console.log(`✓ self-test: ${plants.length} مزروعًا حُكم عليه كما يجب`)
}

const { strict, history } = run(real)
if (history.length > 0) {
  console.log(`  · خطرٌ تاريخيّ (ترحيلاتٌ طُبّقت حتّى ${LAST_APPLIED}، لا تُعدَّل — راجع D-316):`)
  for (const h of history) console.log(`      ${h}`)
}
if (strict.length > 0) {
  for (const s of strict) console.log(`  ✕ ${s}`)
  console.log('  والبديل: لا يُسقَط جدولٌ له أبناءٌ بفعلٍ عند الحذف؛ يُضاف عمودٌ أو جدولٌ جانبيّ، أو يُعاد بناءُ الأبناء في الملفّ نفسِه قبل أبيهم.')
  process.exit(1)
}
console.log(`  ✓ لا ترحيلَ بعد ${LAST_APPLIED} يُسقط أبًا فيمحو أبناءه (${real.length} ترحيلًا طُبّقت كما يطبّقها D1)`)

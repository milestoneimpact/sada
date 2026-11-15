/**
 * **تمرينُ الاسترجاع** (D-321): نسخةٌ من R2 تُفكّ، وتُبنى منها قاعدةٌ محلّيّةٌ بالترحيلات، وتُعدّ صفوفُها وتُفحص مفاتيحُها، ويُطبع الزمن.
 *
 * ## لماذا
 *
 * نسخةٌ لم تُسترجَع مرّةً ليست نسخة: صيغةٌ تتبدّل، أو مفتاحٌ ضاع، أو ترحيلٌ يكسر ما قبله — كلُّها تُكتشف يومَ الحاجة. فهذا
 * التمرينُ يفعل ما يُفعل يومَها، بلا شبكةٍ ولا Cloudflare، ويقول كم استغرق (زمنُ الاسترجاع، RTO). والصيغةُ من
 * `src/lib/ops/snapshot.ts` نفسِه الذي يكتبها الـ Worker، لا نسخةٌ منه تفترق.
 *
 * ## ما يفعل، بالترتيب
 *
 * ١ · يقرأ الرأسَ (بلا مفتاح) ويفكّ بالمفتاح الذي يطابقه من البيئة — **لا من سطر الأمر**: ما يُكتب في الأمر يبقى في سجلّ الطرفيّة.
 *     **مفتاحُ النسخ** (`SADA_BACKUP_KEY`، ثمّ `_PREV`) هو ما يُحفظ للتمرين: مشتقٌّ بـ HKDF لا يُعكس، فيفكّ النسخةَ ولا يفكّ رمزًا فيها
 *     (مراجعة D-321). و`TOKEN_ENC_KEY` الخامُ يُقبل أيضًا لحالة RUNBOOK §٤ وحدَها، و`--derive-key` يستخرج منه مفتاحَ النسخ مرّةً.
 * ٢ · يبني قاعدةً جديدةً بالترحيلات التي كانت مطبَّقةً ساعةَ النسخ (رأسُها يسمّيها)، كلٌّ في معاملةٍ والمفاتيحُ مفعَّلة كما يطبّقها D1.
 * ٣ · يحمّل الصفوفَ بلا محفّزاتٍ ولا مفاتيح (الترتيبُ بين الجداول لا يُعرَف)، ثمّ يعيد المحفّزاتِ ويفعّل المفاتيح.
 * ٤ · يفحص: عددُ كلّ جدولٍ كما في الرأس، و`PRAGMA foreign_key_check` بلا صفّ، و`integrity_check` «ok»، وجداولُ النسخة هي جداولُ المخطَّط.
 * ٥ · يطبّق ما بعدها من ترحيلات المستودع (قاعدةُ اليوم)، ويفحص المفاتيحَ ثانيةً.
 * ٦ · **يكتب ما يُحمَّل في D1 ويجرّبه كما يجري هناك** (مراجعة D-321): جملٌ تمحو كلَّ جدولٍ وتكتب صفوفَ النسخة — والمحفّزاتُ تُسقَط
 *     قبلها وتُعاد بعدها، فصفّان ناجحان بمفتاحٍ واحدٍ من قبل D-320 لا يُسقطان التحميل — ثمّ **ما يُحمَل من القاعدة الحيّة**
 *     (`--carry`، أدناه)، ثمّ **الإيقافُ المؤقّت آخرًا، دائمًا**. وتُحمَّل كلُّها في قاعدةٍ ثانيةٍ مرحَّلةٍ إلى اليوم والمفاتيحُ
 *     والمحفّزاتُ قائمة كما في D1: ما يردّه D1 يُردّ هنا قبله. و`--sql` يكتبها ملفًّا (`wrangler d1 execute … --file`، RUNBOOK §٣).
 * ٧ · يطبع زمنَ كلّ خطوةٍ والمجموع، وما في الطابور حلّ موعدُه (يُرسَل حين يُرفع الإيقاف). و`--out` يكتب القاعدةَ ملفًّا.
 *
 * ## ما يُحمَل من القاعدة الحيّة (`--carry`، مراجعة D-321)
 *
 * الاسترجاعُ يعيد القاعدةَ إلى لحظةٍ مضت، **وما وقع خارجها بعدها لا يرجع**: منشورٌ نُشر يعود «في الطابور» بموعدٍ مضى ولا صفَّ نجاحٍ
 * له (D-004)، فتلتقطه أوّلُ دورةٍ وينشره ثانية؛ وكلفةٌ دُفعت تُمحى فتسقط سقوفُ الإنفاق إلى عدّاد النسخة؛ وعضوٌ أُلغي ومفتاحُ مرورٍ
 * حُذف ورمزُ استردادٍ استُعمل كلُّها تعود صالحة. فـ`scripts/restore_carry.sql` يُصدَّر من القاعدة الحيّة **قبل** الاسترجاع
 * (`wrangler d1 execute --json --command`)، و`--carry` يكتب منه: كلُّ منشورٍ منشورٍ هناك منشورٌ هنا (بحسابه وموعده، فلا يُسقط قيدُ
 * CHECK جملتَه)، وصفوفُ `succeeded` و`sent` ومحاولاتُها، وصفوفُ `cost_ledger`، **والفريقُ وعواملُ الدخول كما هي اليوم** (ما أُغلق
 * يبقى مغلقًا). و`--carry` وحدَه (بلا نسخة) يكتب الملفَّ نفسَه لما بعد Time Travel (RUNBOOK §٢). وتصديرٌ ناقصٌ يُردّ قبل أن يُكتب شيء.
 *
 * ## ولا يكتب داخل المستودع
 *
 * `--out` و`--sql` فيهما صفوفُ القاعدة: مسارٌ تحت جذر المستودع يُردّ، فلا يحملها `git add -A` إلى GitHub (مراجعة D-321).
 *
 * الاستعمال:
 *     SADA_BACKUP_KEY=… node --no-warnings scripts/restore_drill.mjs <snapshot.sada> [--out restored.sqlite] [--sql data.sql] [--carry live.json]
 *     node --no-warnings scripts/restore_drill.mjs --carry live.json --sql carry.sql
 *     TOKEN_ENC_KEY=… node --no-warnings scripts/restore_drill.mjs --derive-key
 *     node --no-warnings scripts/restore_drill.mjs --self-test
 *
 * ‏`--self-test` (في `npm run ci`): نسخةٌ مصنوعةٌ من قاعدةٍ مرحَّلةٍ بصفوفٍ مترابطة تُسترجَع كاملة، وتُزرع ستُّ عللٍ فتُمسَك
 * (مفتاحٌ آخر، وبايتٌ عُبث به في المتن، ورأسٌ عُدّل، وابنٌ بلا أبيه، وترحيلٌ ليس في المستودع، ومخرجٌ داخل المستودع)، وتُحمَّل جملُ
 * `--sql` في قاعدةٍ مرحَّلة، وصفّان ناجحان بمفتاحٍ واحد يُحمَّلان، وملفُّ حملٍ يُكتب ويُحمَّل وناقصُه يُردّ.
 *
 * ‏**ويلزمه Node ≥ 22.18** (أو 23.6): يقرأ `snapshot.ts` كما هو بمحو الأنواع، ولا يمحوها بلا علَمٍ ما قبلها — فيُسأل عنها أوّلًا
 * ويُقال السببُ بالعربيّة بدل `ERR_UNKNOWN_FILE_EXTENSION` (مراجعة D-321).
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// ‏مسارُ الملفّ لا عنوانُه: `URL.pathname` يُبقي المسافةَ `%20` والحرفَ العربيَّ مرمَّزًا، فمستودعٌ في «~/Documents/صدى» لا يجد ترحيلاته
const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MIGRATIONS = join(ROOT, 'migrations')
const CARRY_SQL = join(ROOT, 'scripts', 'restore_carry.sql')
const quote = (name) => `"${String(name).replace(/"/g, '""')}"`

/** ‏ما يلزم قبل أيّ شيء: Node يمحو الأنواع بلا علَم، و`node:sqlite` بلا علَم. وإلّا فسببٌ يُقرأ لا رسالةُ Node. */
async function runtime() {
  const typescript = Boolean(process.features?.typescript)
  let sqlite = null
  try { sqlite = await import('node:sqlite') } catch { sqlite = null }
  if (!typescript || sqlite === null) {
    const lacking = [typescript ? null : 'محوُ الأنواع (لقراءة src/lib/ops/snapshot.ts كما هو)', sqlite === null ? 'node:sqlite' : null].filter(Boolean)
    console.log(`✕ يلزم Node ≥ 22.18 (أو ≥ 23.6)، وعندك ${process.version}: لا يعمل فيه بلا علَمٍ ${lacking.join(' ولا ')}. ثبّت Node 22 الأحدث (nvm install 22، أو nodejs.org) ثمّ أعد الأمر.`)
    process.exit(2)
  }
  return sqlite
}

const { DatabaseSync } = await runtime()
const { backupKey, backupKid, decodeSnapshot, encodeSnapshot, readSnapshotHeader, snapshotKid } = await import('../src/lib/ops/snapshot.ts')

function repoMigrations(dir = MIGRATIONS) {
  return readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
}

/** يطبّق ترحيلًا كما يطبّقه D1: معاملةٌ للملفّ كلّه. */
function apply(db, dir, name) {
  db.exec('BEGIN')
  try {
    db.exec(readFileSync(join(dir, name), 'utf8'))
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw new Error(`الترحيلُ ${name} سقط: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/** ‏قاعدةٌ في الذاكرة بترحيلات المستودع كلِّها والمفاتيحُ مفعَّلة — كقاعدة D1 التي يُحمَّل فيها. */
function migrated(dir = MIGRATIONS, migrations = repoMigrations(dir)) {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  for (const m of migrations) apply(db, dir, m)
  return db
}

const userTables = (db) => db
  .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\' AND name <> 'd1_migrations' ORDER BY name")
  .all().map((r) => r.name)

const triggersOf = (db) => db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND sql IS NOT NULL ORDER BY name").all()

/** خليّةُ النسخة إلى قيمةٍ تقبلها SQLite: `{$b64}` والمصفوفةُ (ما يردّه D1 لـ BLOB) بايتات. */
function cell(v) {
  if (v !== null && typeof v === 'object') {
    if (typeof v.$b64 === 'string') return Buffer.from(v.$b64, 'base64')
    if (Array.isArray(v)) return Buffer.from(v)
    return JSON.stringify(v)
  }
  if (typeof v === 'boolean') return v ? 1 : 0
  return v
}

function sqlValue(v) {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'number' || typeof v === 'bigint') return String(v)
  if (Buffer.isBuffer(v) || v instanceof Uint8Array) return `X'${Buffer.from(v).toString('hex')}'`
  return `'${String(v).replace(/'/g, "''")}'`
}
const lit = (v) => sqlValue(cell(v))

const ms = (t0) => Math.round(performance.now() - t0)

/** ‏مخرجٌ تحت جذر المستودع يُردّ: فيه صفوفُ القاعدة، و`git add -A` يحمله. */
function outsideRepo(path, flag) {
  if (path === undefined) return
  const rel = relative(ROOT, resolve(path))
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
    throw new Error(`${flag} ${path} داخل المستودع — فيه صفوفُ القاعدة، و«git add -A» يحمله إلى GitHub. اكتبه خارجه: D=$(mktemp -d) ثمّ ${flag} "$D/…"`)
  }
}

// ── ما يُحمَل من القاعدة الحيّة (scripts/restore_carry.sql) ───────────

/** ‏ما يحمله التصدير، بترتيب كتابته. والجداولُ الخمسةُ الأخيرة **تُستبدَل** بما في القاعدة الحيّة: الوصولُ كما هو اليوم. */
const CARRY = ['posts', 'publish_attempts', 'cost_ledger', 'members', 'passkeys', 'recovery_codes', 'totp', 'member_totp']
const ACCESS = ['members', 'passkeys', 'recovery_codes', 'totp', 'member_totp']
/** ‏ما يُقرأ بالمفتاح: جداولُ يغيّرها الحمل، فلا يُقارَن عدُّها بعدّ النسخة. */
const CARRIED = new Set(['publish_attempts', 'cost_ledger', ...ACCESS])

/**
 * ‏يقرأ ما ردّه `wrangler d1 execute --remote --json --command "$(cat scripts/restore_carry.sql)"` — مصفوفةُ نتائجَ لكلّ جملة — بالوسم
 * ‏`carry` في كلّ صفّ لا بترتيب النتائج. **ويُردّ ناقصًا**: سطرُ `manifest` يقول كم صفًّا في كلّ جدول، وما لا يطابقه يُسقط الأمر، فلا
 * ‏يُكتب ملفٌّ يمحو مفاتيحَ المرور بنصف قائمة.
 */
export function parseCarry(json) {
  const rows = []
  const walk = (v) => {
    if (Array.isArray(v)) { for (const x of v) walk(x); return }
    if (v === null || typeof v !== 'object') return
    if (typeof v.carry === 'string') { rows.push(v); return }
    for (const x of Object.values(v)) walk(x)
  }
  walk(json)
  const manifest = rows.find((r) => r.carry === 'manifest')
  if (manifest === undefined) {
    throw new Error('ملفُّ الحمل بلا سطر «manifest»: أهو ناتجُ «wrangler d1 execute … --json --command "$(cat scripts/restore_carry.sql)"» كاملًا؟ أوّلُه { "error": … } إن ردّه D1')
  }
  const out = {}
  for (const name of CARRY) {
    const want = manifest[name]
    const got = rows.filter((r) => r.carry === name).map(({ carry: _carry, ...r }) => r)
    if (typeof want !== 'number') throw new Error(`ملفُّ الحمل لا يعدّ «${name}» — أعد التصدير بـ scripts/restore_carry.sql من المستودع نفسِه`)
    if (got.length !== want) throw new Error(`ملفُّ الحمل ناقص: «${name}» ${got.length} من ${want} — أعد التصدير، ولا تحمّل نصفَه`)
    out[name] = got
  }
  return out
}

const PAUSE = "INSERT INTO settings (org_id, key, value, updated_by) VALUES ('org_owner', 'paused', 'true', 'restore') ON CONFLICT(org_id, key) DO UPDATE SET value = 'true', updated_by = 'restore', updated_at = datetime('now');"

/** ‏جملُ الحمل — كلُّها محروسةٌ بشرطها فتُحمَّل على ما استُرجع أيًّا كان، ولا تُسقط قيدًا ولا محفّزًا. */
export function carryStatements(c) {
  const lines = ['-- ما وقع خارج القاعدة بعد النسخة أو العلامة، من القاعدة الحيّة (scripts/restore_carry.sql · مراجعة D-321)']
  // ١ · ما نُشر يبقى منشورًا — بحسابه وموعده من القاعدة الحيّة: «معتمَدٌ» بلا حسابٍ ولا موعدٍ يُسقط قيدَي CHECK إن عُلّم وحدَه
  for (const p of c.posts) {
    const account = `(SELECT id FROM accounts WHERE id = ${lit(p.account_id)})`
    lines.push(`UPDATE posts SET status = 'published', account_id = coalesce(${account}, account_id), scheduled_at = coalesce(${lit(p.scheduled_at)}, scheduled_at), approved_at = coalesce(${lit(p.approved_at)}, approved_at), dispatched_at = coalesce(${lit(p.dispatched_at)}, dispatched_at) WHERE id = ${lit(p.id)} AND status <> 'published' AND coalesce(${account}, account_id) IS NOT NULL;`)
  }
  // ٢ · محاولاتُ النجاح والمفتوحة: ما يحرس D-004 في `publisher.ts` — بلا ما يُسقط محفّزَي 0047
  for (const a of c.publish_attempts) {
    const key = lit(a.idempotency_key)
    if (a.status === 'succeeded') {
      lines.push(`UPDATE publish_attempts SET status = 'succeeded', response_json = ${lit(a.response_json)}, platform_post_id = ${lit(a.platform_post_id)}, at = ${lit(a.at)} WHERE id = ${lit(a.id)} AND status = 'sent' AND NOT EXISTS (SELECT 1 FROM publish_attempts x WHERE x.idempotency_key = ${key} AND x.status = 'succeeded' AND x.id <> ${lit(a.id)});`)
    }
    const cols = Object.keys(a)
    const held = a.status === 'succeeded' ? "('succeeded')" : "('sent', 'succeeded')"
    lines.push(`INSERT OR IGNORE INTO publish_attempts (${cols.map(quote).join(', ')}) SELECT ${cols.map((k) => lit(a[k])).join(', ')} WHERE EXISTS (SELECT 1 FROM posts WHERE id = ${lit(a.post_id)}) AND NOT EXISTS (SELECT 1 FROM publish_attempts x WHERE x.idempotency_key = ${key} AND x.status IN ${held});`)
  }
  // ٣ · ما دُفع يبقى مكتوبًا (D-008): سقوفُ الإنفاق تعدّه
  for (const r of c.cost_ledger) {
    const cols = Object.keys(r)
    lines.push(`INSERT OR IGNORE INTO cost_ledger (${cols.map(quote).join(', ')}) VALUES (${cols.map((k) => lit(r[k])).join(', ')});`)
  }
  // ٤ · الوصولُ كما هو اليوم: ما أُلغي أو حُذف أو استُعمل بعد النسخة لا يعود صالحًا
  for (const name of ACCESS) {
    lines.push(`DELETE FROM ${quote(name)};`)
    for (const r of c[name]) {
      const cols = Object.keys(r)
      lines.push(`INSERT INTO ${quote(name)} (${cols.map(quote).join(', ')}) VALUES (${cols.map((k) => lit(r[k])).join(', ')});`)
    }
  }
  return lines
}

/** ‏جملُ صفوف القاعدة المسترجَعة: المحفّزاتُ تُسقَط قبلها وتُعاد بعدها (كما يحمّل التمرينُ نفسُه)، والمحوُ كلُّه قبل أيّ إدخال. */
function dataStatements(db, header) {
  const lines = ['-- صدى · صفوفُ نسخة ' + header.at + ' (' + header.env + ') — تُحمَّل في قاعدةٍ مرحَّلة (docs/RUNBOOK.md §٣)',
    'PRAGMA defer_foreign_keys = true;']
  const triggers = triggersOf(db)
  for (const tr of triggers) lines.push(`DROP TRIGGER IF EXISTS ${quote(tr.name)};`)
  // ‏المحوُ كلُّه قبل أيّ إدخال: محوُ أبٍ بعد إدخال ابنه يُطلق CASCADE على ما أُدخل للتوّ
  const names = userTables(db)
  for (const name of names) lines.push(`DELETE FROM ${quote(name)};`)
  for (const name of names) {
    for (const r of db.prepare(`SELECT * FROM ${quote(name)}`).all()) {
      const cols = Object.keys(r)
      lines.push(`INSERT INTO ${quote(name)} (${cols.map(quote).join(', ')}) VALUES (${cols.map((c) => sqlValue(r[c])).join(', ')});`)
    }
  }
  for (const tr of triggers) lines.push(`${tr.sql};`)
  return lines
}

/**
 * ‏يحمّل الجملَ في قاعدةٍ مرحَّلةٍ إلى اليوم والمفاتيحُ والمحفّزاتُ قائمة — كما يحمّلها `wrangler d1 execute --file`: معاملةٌ واحدة.
 * ‏ويعيد القاعدةَ مفتوحةً للفحص، أو يرمي بما ردّته.
 */
function replay(lines, migrationsDir) {
  const db = migrated(migrationsDir)
  db.exec('BEGIN')
  try {
    db.exec(lines.join('\n'))
    db.exec('COMMIT')
  } catch (error) {
    try { db.exec('ROLLBACK') } catch { /* سقطت المعاملةُ نفسُها */ }
    db.close()
    throw new Error(`التحميلُ في D1 يُردّ (قاعدةٌ مرحَّلةٌ والمحفّزاتُ قائمة): ${error instanceof Error ? error.message : String(error)}`)
  }
  const paused = db.prepare("SELECT value FROM settings WHERE org_id = 'org_owner' AND key = 'paused'").get()?.value
  if (paused !== 'true') { db.close(); throw new Error('الملفُّ لا ينتهي والنشرُ موقوف') }
  return db
}

const carryCounts = (c) => `منشوراتٌ نُشرت: ${c.posts.length} · محاولاتُ نشر: ${c.publish_attempts.length} · صفوفُ كلفة: ${c.cost_ledger.length} · ` +
  `الفريق: ${c.members.length} · مفاتيحُ المرور: ${c.passkeys.length} · رموزُ الاسترداد: ${c.recovery_codes.length} · رمزُ التطبيق: ${c.totp.length + c.member_totp.length}`

/**
 * ‏ملفُّ الحمل وحدَه (RUNBOOK §٢): يُكتب قبل `time-travel restore` ويُحمَّل بعده مباشرةً في الأمر نفسِه. ويُجرَّب على قاعدةٍ مرحَّلة.
 * @param {{ carry: object, sql: string, migrationsDir?: string }} input
 */
export function carryOnly({ carry, sql, migrationsDir = MIGRATIONS }) {
  outsideRepo(sql, '--sql')
  const lines = [...carryStatements(carry), PAUSE]
  replay(lines, migrationsDir).close()
  writeFileSync(sql, lines.join('\n') + '\n')
  return { lines: lines.length }
}

/**
 * الاسترجاعُ كلُّه — نقيٌّ بمدخلاته ليُختبَر: البايتاتُ والمفاتيحُ ومجلّدُ الترحيلات وأين يُكتب. يعيد التقريرَ أو يرمي بسببٍ مسمّى.
 * @param {{ bytes: Uint8Array, keys: string[], migrationsDir?: string, out?: string, sql?: string, carry?: object, now?: Date }} input
 */
export async function restore({ bytes, keys, migrationsDir = MIGRATIONS, out, sql, carry, now = new Date() }) {
  outsideRepo(out, '--out')
  outsideRepo(sql, '--sql')
  const timings = {}
  const total = performance.now()
  let t = performance.now()
  const { header, payload, by } = await decodeSnapshot(bytes, keys)
  timings.decrypt = ms(t)

  // ٢ · المخطَّطُ كما كان ساعةَ النسخ
  t = performance.now()
  const available = repoMigrations(migrationsDir)
  const wanted = header.migrations ?? available
  const missing = wanted.filter((m) => !available.includes(m))
  if (missing.length > 0) {
    throw new Error(`ترحيلٌ في النسخة ليس في المستودع: ${missing.join('، ')} — المستودعُ أقدمُ من النسخة، فاسحب main أوّلًا`)
  }
  if (out !== undefined && existsSync(out)) throw new Error(`${out} موجود — لا يُكتب فوق قاعدة؛ اختر اسمًا جديدًا`)
  const db = new DatabaseSync(out ?? ':memory:')
  try {
    db.exec('PRAGMA foreign_keys = ON')
    for (const m of wanted) apply(db, migrationsDir, m)
    timings.rebuild = ms(t)

    // ٣ · الصفوفُ بلا محفّزاتٍ ولا مفاتيح
    t = performance.now()
    const schema = userTables(db)
    const inSnapshot = Object.keys(payload.tables).sort()
    const extra = inSnapshot.filter((n) => !schema.includes(n))
    if (extra.length > 0) throw new Error(`جداولُ في النسخة ليست في مخطَّط ترحيلاتها: ${extra.join('، ')}`)
    const absent = schema.filter((n) => !inSnapshot.includes(n))
    const triggers = triggersOf(db)
    for (const tr of triggers) db.exec(`DROP TRIGGER ${quote(tr.name)}`)
    db.exec('PRAGMA foreign_keys = OFF')
    db.exec('BEGIN')
    // ‏ما بذرته الترحيلاتُ (المنظّمةُ الأولى والإعدادات) تحلّ النسخةُ محلَّه: النسخةُ هي الحقّ
    for (const name of inSnapshot) db.exec(`DELETE FROM ${quote(name)}`)
    for (const name of inSnapshot) {
      const { columns, rows } = payload.tables[name]
      if (rows.length === 0) continue
      const known = new Set(db.prepare(`PRAGMA table_info(${quote(name)})`).all().map((x) => x.name))
      const unknown = columns.filter((c) => !known.has(c))
      if (unknown.length > 0) throw new Error(`«${name}»: أعمدةٌ في النسخة ليست في المخطَّط: ${unknown.join('، ')}`)
      const insert = db.prepare(`INSERT INTO ${quote(name)} (${columns.map(quote).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`)
      for (const row of rows) insert.run(...row.map(cell))
    }
    db.exec('COMMIT')
    for (const tr of triggers) db.exec(tr.sql)
    db.exec('PRAGMA foreign_keys = ON')
    timings.load = ms(t)

    // ٤ · الفحص
    t = performance.now()
    const counts = header.tables.map((x) => ({ name: x.name, want: x.rows, got: db.prepare(`SELECT count(*) AS n FROM ${quote(x.name)}`).get().n }))
    const wrong = counts.filter((c) => c.want !== c.got)
    if (wrong.length > 0) throw new Error(`العددُ لا يطابق: ${wrong.map((c) => `${c.name} ${c.got} من ${c.want}`).join('، ')}`)
    const orphans = db.prepare('PRAGMA foreign_key_check').all()
    if (orphans.length > 0) {
      const sample = orphans.slice(0, 5).map((o) => `${o.table}#${o.rowid} ← ${o.parent}`).join('، ')
      throw new Error(`${orphans.length} صفًّا يشير إلى ما ليس في النسخة (foreign_key_check): ${sample}`)
    }
    const integrity = db.prepare('PRAGMA integrity_check').get()
    if (Object.values(integrity)[0] !== 'ok') throw new Error(`integrity_check: ${JSON.stringify(integrity)}`)
    timings.check = ms(t)

    // ٥ · إلى مخطَّط اليوم
    t = performance.now()
    const forward = available.filter((m) => !wanted.includes(m))
    for (const m of forward) apply(db, migrationsDir, m)
    const after = db.prepare('PRAGMA foreign_key_check').all()
    if (after.length > 0) throw new Error(`بعد ترحيلات اليوم (${forward.join('، ')}): ${after.length} صفًّا بلا أب`)
    timings.forward = ms(t)

    // ٦ · ما يُحمَّل في D1، مجرَّبًا كما يجري هناك
    t = performance.now()
    const lines = [...dataStatements(db, header), ...(carry === undefined ? [] : carryStatements(carry)), PAUSE]
    const target = replay(lines, migrationsDir)
    let due = []
    try {
      for (const name of userTables(db)) {
        if (carry !== undefined && CARRIED.has(name)) continue
        const want = db.prepare(`SELECT count(*) AS n FROM ${quote(name)}`).get().n
        const got = target.prepare(`SELECT count(*) AS n FROM ${quote(name)}`).get().n
        if (want !== got) throw new Error(`التحميلُ في D1: «${name}» ${got} من ${want}`)
      }
      if (target.prepare('PRAGMA foreign_key_check').all().length > 0) throw new Error('التحميلُ في D1: صفوفٌ بلا أب')
      if (triggersOf(target).length !== triggersOf(db).length) throw new Error('التحميلُ في D1: المحفّزاتُ لم تُعَد كلُّها')
      // ‏ما يُرسَل في أوّل دورةٍ بعد رفع الإيقاف: في الطابور وموعدُه مضى
      due = target.prepare("SELECT id, platform, scheduled_at FROM posts WHERE status = 'queued' AND dispatched_at IS NULL AND datetime(scheduled_at) <= datetime(?) ORDER BY scheduled_at")
        .all(now.toISOString())
    } finally {
      target.close()
    }
    if (sql !== undefined) writeFileSync(sql, lines.join('\n') + '\n')
    timings.replay = ms(t)
    timings.total = ms(total)
    return { header, by, counts, absent, forward, timings, due, carried: carry === undefined ? null : carryCounts(carry) }
  } finally {
    db.close()
  }
}

/** ‏مفتاحُ النسخ أوّلًا (ما يُحفظ للتمرين)، ثمّ الخامُ لحالة RUNBOOK §٤. */
const KEY_VARS = ['SADA_BACKUP_KEY', 'SADA_BACKUP_KEY_PREV', 'TOKEN_ENC_KEY', 'TOKEN_ENC_KEY_PREV']

function keysFromEnv() {
  return KEY_VARS.map((k) => process.env[k] ?? '').filter((k) => k.trim() !== '')
}

function report(r) {
  console.log(`النسخة: ${r.header.at} · ${r.header.env} · مفتاح النسخ ${r.header.bkid} · TOKEN_ENC_KEY ${r.header.kid} · ${r.header.tables.length} جدولًا · ${r.header.rows} صفًّا`)
  if (r.by === 'raw') console.log('  · فُكّت بـ TOKEN_ENC_KEY الخام — مفتاحُ النسخ يكفي ولا يفكّ الرموز: npm run restore -- --derive-key (RUNBOOK §٣)')
  console.log(`  ✓ العدد يطابق في ${r.counts.length} جدولًا · ✓ لا صفَّ بلا أب · ✓ integrity_check ok`)
  if (r.absent.length > 0) console.log(`  · في المخطَّط ولا صفَّ له في النسخة: ${r.absent.join('، ')}`)
  console.log(`  ✓ ترحيلاتُ اليوم بعدها: ${r.forward.length === 0 ? 'لا شيء' : r.forward.join('، ')}`)
  console.log('  ✓ التحميلُ في D1 مجرَّبٌ على قاعدةٍ مرحَّلةٍ والمحفّزاتُ قائمة، والملفُّ ينتهي والنشرُ موقوف')
  if (r.carried !== null) console.log(`  ✓ يُحمَل من القاعدة الحيّة: ${r.carried}`)
  if (r.due.length > 0) {
    const ids = r.due.slice(0, 20).map((p) => `${p.id} (${p.platform} ${p.scheduled_at})`).join('، ')
    console.log(`  ▲ ${r.due.length} مجدولٌ حلّ موعدُه ويُرسَل حين يُرفع الإيقاف: ${ids}${r.due.length > 20 ? '، …' : ''}`)
    console.log('    ما نُشر منه بعد النسخة: «اسحب الموعد» عليه قبل رفع الإيقاف (RUNBOOK §٣ · ٦)')
  }
  const t = r.timings
  console.log(`  الزمن: فكّ ${t.decrypt}ms · بناء ${t.rebuild}ms · تحميل ${t.load}ms · فحص ${t.check}ms · ترحيلُ اليوم ${t.forward}ms · تجربةُ D1 ${t.replay}ms · **المجموع ${t.total}ms**`)
}

// ── الفحصُ الذاتيّ: نسخةٌ مصنوعة، وستُّ عللٍ مزروعة ───────────────────

/** قاعدةٌ مرحَّلةٌ بصفوفٍ مترابطة: حسابٌ ورمزُه ومنشورٌ ومحاولتاه — ويُصنَع منها متنُ نسخة كما يصنعه الـ Worker. */
function syntheticDb(dir, migrations = repoMigrations(dir)) {
  const db = migrated(dir, migrations)
  db.exec(`INSERT INTO accounts (id, platform, kind, external_id, display_name, org_id) VALUES ('acc1', 'linkedin', 'member', 'ext-1', 'بصائر', 'org_owner');
    INSERT INTO tokens (account_id, access_enc, access_iv, expires_at, scopes, org_id) VALUES ('acc1', 'v2:abcd1234:Q0lQSEVS', 'aXY=', '2026-12-01 00:00:00', 'w_member_social', 'org_owner');
    INSERT INTO posts (id, account_id, platform, type, text, status, idempotency_key, approved_at, scheduled_at, org_id)
      VALUES ('p1', 'acc1', 'linkedin', 'text', 'منشورٌ «بعلامات» و''اقتباس''', 'published', 'idem-1', '2026-11-01 09:00:00', '2026-11-02 09:00:00', 'org_owner');
    INSERT INTO publish_attempts (id, post_id, idempotency_key, attempt_no, request_json, response_json, status, org_id)
      VALUES ('a1', 'p1', 'idem-1', 1, '{}', '{"error":"timeout","status":0}', 'failed', 'org_owner'),
             ('a2', 'p1', 'idem-1', 2, '{}', '{"id":"urn:li:share:1"}', 'succeeded', 'org_owner');
    INSERT INTO heartbeats (job, outcome, detail) VALUES ('dispatch', 'ok', 'أُرسل 1');
    INSERT INTO members (email, role, invited_by) VALUES ('editor@example.com', 'editor', 'owner@example.com');`)
  return db
}

function payloadOf(db) {
  const tables = {}
  for (const name of userTables(db)) {
    const rows = db.prepare(`SELECT * FROM ${quote(name)}`).all()
    const columns = rows[0] === undefined ? [] : Object.keys(rows[0])
    tables[name] = { columns, rows: rows.map((r) => columns.map((c) => r[c])) }
  }
  return { tables }
}

function syntheticPayload(dir, migrations) {
  const db = syntheticDb(dir, migrations)
  try { return payloadOf(db) } finally { db.close() }
}

/** ‏ما يردّه `wrangler d1 execute --json --command "$(cat scripts/restore_carry.sql)"` على قاعدة: نتيجةٌ لكلّ جملة. */
function exportCarry(db) {
  const statements = readFileSync(CARRY_SQL, 'utf8').split(/;\s*$/m).map((s) => s.trim()).filter((s) => s !== '')
  return statements.map((q) => ({ results: db.prepare(q).all(), success: true, meta: {} }))
}

async function selfTest() {
  const KEY = Buffer.alloc(32, 7).toString('base64')
  const OTHER = Buffer.alloc(32, 9).toString('base64')
  const fails = []
  const dir = mkdtempSync(join(tmpdir(), 'sada-drill-'))
  try {
    const payload = syntheticPayload(MIGRATIONS)
    const meta = { at: '2026-11-12T03:03:00.000Z', env: 'staging', migrations: repoMigrations() }
    const good = (await encodeSnapshot(KEY, meta, payload)).bytes
    const derived = await backupKey(KEY)

    // ١ · النسخةُ السليمةُ تُسترجَع كاملةً بمفتاح النسخ وحدَه، وجملُ `--sql` تُحمَّل في قاعدةٍ مرحَّلةٍ فتعطي الأعدادَ نفسَها والنشرَ موقوفًا
    const sqlFile = join(dir, 'data.sql')
    const outFile = join(dir, 'restored.sqlite')
    const r = await restore({ bytes: good, keys: [OTHER, derived], out: outFile, sql: sqlFile })
    if (r.by !== 'backup') fails.push('مفتاحُ النسخ لم يفكّها وحدَه')
    if (r.header.bkid !== await backupKid(derived) || r.header.kid !== await snapshotKid(KEY)) fails.push('الرأسُ لا يسمّي المفتاحين')
    if (r.header.rows !== Object.values(payload.tables).reduce((n, x) => n + x.rows.length, 0)) fails.push('الأعدادُ في الرأس')
    const restored = new DatabaseSync(outFile)
    const text = restored.prepare("SELECT text FROM posts WHERE id = 'p1'").get()?.text
    const token = restored.prepare("SELECT access_enc FROM tokens WHERE account_id = 'acc1'").get()?.access_enc
    restored.close()
    if (text !== "منشورٌ «بعلامات» و'اقتباس'") fails.push(`النصُّ لم يعد كما كان: ${text}`)
    if (token !== 'v2:abcd1234:Q0lQSEVS') fails.push('العمودُ المشفَّرُ لم يُنسَخ كما هو')
    const fresh = migrated()
    fresh.exec('BEGIN')
    fresh.exec(readFileSync(sqlFile, 'utf8'))
    fresh.exec('COMMIT')
    for (const c of r.counts) {
      const n = fresh.prepare(`SELECT count(*) AS n FROM ${quote(c.name)}`).get().n
      if (n !== c.want) fails.push(`--sql: ${c.name} ${n} من ${c.want}`)
    }
    if (fresh.prepare('PRAGMA foreign_key_check').all().length > 0) fails.push('--sql: صفوفٌ بلا أب')
    if (fresh.prepare("SELECT value FROM settings WHERE key = 'paused'").get()?.value !== 'true') fails.push('--sql: لا ينتهي والنشرُ موقوف')
    fresh.close()
    console.log(`  ✓ نسخةٌ مصنوعة (${r.header.tables.length} جدولًا · ${r.header.rows} صفًّا) استُرجعت بمفتاح النسخ في ${r.timings.total}ms، وجملُ --sql حُمّلت في قاعدةٍ مرحَّلةٍ والنشرُ موقوف`)

    // ‏ونسخةٌ أُخذت قبل آخر ترحيل: تُبنى بترحيلاتها هي ثمّ تُرحَّل إلى مخطَّط اليوم، والأعدادُ كما هي
    const older = repoMigrations().slice(0, -1)
    const oldBytes = (await encodeSnapshot(KEY, { ...meta, migrations: older }, syntheticPayload(MIGRATIONS, older))).bytes
    const o = await restore({ bytes: oldBytes, keys: [KEY] })
    if (o.forward.length !== 1 || o.forward[0] !== repoMigrations().at(-1)) fails.push(`ترحيلُ اليوم بعد نسخةٍ أقدم: ${o.forward.join('، ')}`)
    else console.log(`  ✓ نسخةٌ قبل ${o.forward[0]} بُنيت بترحيلاتها ثمّ رُحّلت إليه`)

    // ‏وصفّان ناجحان بمفتاحٍ واحدٍ من قبل D-320 (0047 يقرّ بهما على staging): يُحمَّلان في D1 والمحفّزان قائمان بعدهما
    const twice = structuredClone(payload)
    const pa = twice.tables.publish_attempts
    pa.rows.push(pa.columns.map((c) => ({ id: 'a3', post_id: 'p1', idempotency_key: 'idem-1', attempt_no: 3, request_json: '{}', status: 'succeeded', at: '2026-11-02 09:01:00', org_id: 'org_owner' })[c] ?? null))
    const dup = await restore({ bytes: (await encodeSnapshot(KEY, meta, twice)).bytes, keys: [KEY], sql: join(dir, 'twice.sql') })
    const dupDb = migrated()
    dupDb.exec(`BEGIN; ${readFileSync(join(dir, 'twice.sql'), 'utf8')} COMMIT;`)
    const dupRows = dupDb.prepare("SELECT count(*) AS n FROM publish_attempts WHERE status = 'succeeded'").get().n
    const dupTriggers = triggersOf(dupDb).length
    dupDb.close()
    const schemaDb = migrated()
    const wantTriggers = triggersOf(schemaDb).length
    schemaDb.close()
    if (dupRows !== 2 || wantTriggers === 0 || dupTriggers !== wantTriggers) fails.push(`صفّان ناجحان بمفتاحٍ واحد: ${dupRows} صفًّا و${dupTriggers} من ${wantTriggers} محفّزًا`)
    else console.log(`  ✓ صفّان ناجحان بمفتاحٍ واحد (قبل D-320) يُحمَّلان في D1، والمحفّزان قائمان بعدهما (${dup.timings.replay}ms)`)

    // ‏وملفُّ الحمل: ما نُشر وما دُفع وما أُغلق في القاعدة الحيّة يُكتب ويُحمَّل، وتصديرٌ ناقصٌ يُردّ
    const live = syntheticDb(MIGRATIONS)
    live.exec(`UPDATE members SET revoked_at = '2026-11-13 10:00:00';
      INSERT INTO cost_ledger (id, provider, operation, units, unit_cost, total, ref_id, org_id) VALUES ('c1', 'x', 'post', 1, 0.01, 0.01, 'p1', 'org_owner');`)
    const exported = exportCarry(live)
    live.close()
    const carried = await restore({ bytes: good, keys: [KEY], sql: join(dir, 'carried.sql'), carry: parseCarry(exported) })
    const back = migrated()
    back.exec(`BEGIN; ${readFileSync(join(dir, 'carried.sql'), 'utf8')} COMMIT;`)
    const revoked = back.prepare("SELECT revoked_at FROM members WHERE email = 'editor@example.com'").get()?.revoked_at
    const cost = back.prepare("SELECT count(*) AS n FROM cost_ledger WHERE id = 'c1'").get().n
    back.close()
    if (revoked !== '2026-11-13 10:00:00' || cost !== 1) fails.push(`الحمل: الإلغاءُ ${String(revoked)} والكلفة ${cost}`)
    else console.log(`  ✓ الحمل: ${carried.carried}`)
    const only = join(dir, 'carry.sql')
    carryOnly({ carry: parseCarry(exported), sql: only })
    if (!readFileSync(only, 'utf8').trimEnd().endsWith(PAUSE)) fails.push('ملفُّ الحمل وحدَه لا ينتهي بالإيقاف')
    try {
      // ‏الفريقُ بلا صفّه والعدُّ يقول واحدًا: ملفٌّ كهذا كان سيمحو الفريقَ ولا يعيده
      parseCarry(exported.map((x) => ({ ...x, results: x.results.filter((row) => row.carry !== 'members') })))
      fails.push('تصديرٌ ناقصٌ لم يُردّ')
    } catch (error) {
      if (!/ناقص: «members»/.test(String(error))) fails.push(`تصديرٌ ناقصٌ سقط بغير سببه: ${String(error)}`)
      else console.log('  ✓ تصديرٌ ناقصٌ (الفريقُ بلا صفوفه) يُردّ قبل أن يُكتب شيء')
    }

    // ٢ · العللُ المزروعة
    const tampered = good.slice()
    tampered[tampered.length - 20] ^= 0xff
    const badHeader = good.slice()
    const json = Buffer.from(badHeader.slice(12, readSnapshotHeader(good).end)).toString('utf8').replace('"env":"staging"', '"env":"stagino"')
    badHeader.set(Buffer.from(json, 'utf8'), 12)
    const orphan = structuredClone(payload)
    const opa = orphan.tables.publish_attempts
    opa.rows.push(opa.columns.map((c) => ({ id: 'a3', post_id: 'ghost', idempotency_key: 'idem-x', attempt_no: 1, request_json: '{}', status: 'failed', at: '2026-11-02 09:00:00', org_id: 'org_owner' })[c] ?? null))
    const orphanBytes = (await encodeSnapshot(KEY, meta, orphan)).bytes
    const future = (await encodeSnapshot(KEY, { ...meta, migrations: [...meta.migrations, '9999_future.sql'] }, payload)).bytes
    const plants = [
      ['مفتاحٌ آخر', { bytes: good, keys: [OTHER] }, /لا مفتاحَ معطًى يطابق/],
      ['بايتٌ عُبث به في المتن', { bytes: tampered, keys: [KEY] }, /فكُّ التشفير سقط/],
      ['رأسٌ عُدّل', { bytes: badHeader, keys: [KEY] }, /فكُّ التشفير سقط/],
      ['ابنٌ بلا أبيه', { bytes: orphanBytes, keys: [KEY] }, /foreign_key_check/],
      ['ترحيلٌ ليس في المستودع', { bytes: future, keys: [KEY] }, /ليس في المستودع/],
      ['مخرجٌ داخل المستودع', { bytes: good, keys: [KEY], sql: join(ROOT, 'restore-data.sql') }, /داخل المستودع/],
    ]
    for (const [label, input, expect] of plants) {
      try {
        await restore(input)
        fails.push(`«${label}» لم يُمسَك`)
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        if (expect.test(msg)) console.log(`  ✓ «${label}» يُمسَك: ${msg.slice(0, 90)}`)
        else fails.push(`«${label}» سقط بغير سببه: ${msg}`)
      }
    }
    if (existsSync(join(ROOT, 'restore-data.sql'))) fails.push('مخرجٌ داخل المستودع كُتب')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  if (fails.length > 0) {
    console.log(`✕ self-test: ${fails.length} لم يقع كما يجب`)
    for (const f of fails) console.log(`  ${f}`)
    return 1
  }
  console.log('✓ self-test: نسخةٌ مصنوعةٌ استُرجعت بمفتاح النسخ وعُدّت وفُحصت مفاتيحُها وجُرّب تحميلُها في D1، ونسخةٌ أقدمُ رُحّلت إلى اليوم، والحملُ كُتب وناقصُه رُدّ، وستُّ عللٍ مزروعةٍ أُمسكت')
  return 0
}

async function deriveKey() {
  const raw = (process.env.TOKEN_ENC_KEY ?? '').trim()
  if (raw === '') {
    console.log('✕ لا مفتاح: read -rs TOKEN_ENC_KEY && export TOKEN_ENC_KEY ثمّ أعد — لا في سطر الأمر.')
    return 2
  }
  const key = await backupKey(raw)
  console.log(`مفتاحُ النسخ لـ TOKEN_ENC_KEY (kid ${await snapshotKid(raw)}) — يفتح النسخَ ولا يفتح الرموز، ومعرّفُه في رأس كلّ نسخة bkid ${await backupKid(key)}:`)
  console.log(key)
  console.log('احفظه في خزانتك باسم «صدى · مفتاح النسخ · <البيئة>»، ثمّ: unset TOKEN_ENC_KEY && clear')
  return 0
}

async function main(argv) {
  if (argv.includes('--self-test')) return selfTest()
  if (argv.includes('--derive-key')) return deriveKey()
  const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined }
  const valued = new Set(['--out', '--sql', '--carry'])
  const file = argv.find((a, i) => !a.startsWith('--') && !valued.has(argv[i - 1]))
  const carryFile = opt('--carry')
  try {
    const carry = carryFile === undefined ? undefined : parseCarry(JSON.parse(readFileSync(carryFile, 'utf8')))
    if (file === undefined && carry !== undefined) {
      const sql = opt('--sql')
      if (sql === undefined) throw new Error('--carry وحدَه يلزمه --sql: أين يُكتب ملفُّ الحمل')
      const { lines } = carryOnly({ carry, sql })
      console.log(`✓ ملفُّ الحمل ${sql} (${lines} جملة)، مجرَّبٌ على قاعدةٍ مرحَّلةٍ وينتهي والنشرُ موقوف — يُحمَل من القاعدة الحيّة: ${carryCounts(carry)}`)
      return 0
    }
    if (file === undefined) {
      console.log('الاستعمال: SADA_BACKUP_KEY=… node --no-warnings scripts/restore_drill.mjs <snapshot.sada> [--out restored.sqlite] [--sql data.sql] [--carry live.json] | --carry live.json --sql carry.sql | --derive-key | --self-test')
      return 2
    }
    const keys = keysFromEnv()
    if (keys.length === 0) {
      console.log('✕ لا مفتاح: اضبط مفتاحَ النسخ في البيئة (read -rs SADA_BACKUP_KEY && export SADA_BACKUP_KEY) — لا في سطر الأمر.')
      return 2
    }
    const bytes = new Uint8Array(readFileSync(file))
    const { header } = readSnapshotHeader(bytes)
    console.log(`يُفكّ ${file} (مفتاح النسخ ${header.bkid}) …`)
    report(await restore({ bytes, keys, out: opt('--out'), sql: opt('--sql'), carry }))
    return 0
  } catch (error) {
    console.log(`✕ ${error instanceof Error ? error.message : String(error)}`)
    return 1
  }
}

process.exitCode = await main(process.argv.slice(2))

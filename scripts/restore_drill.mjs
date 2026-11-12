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
 * ١ · يقرأ الرأسَ (بلا مفتاح) ويفكّ بالمفتاح الذي يطابق `kid`: `TOKEN_ENC_KEY` ثمّ `TOKEN_ENC_KEY_PREV` من البيئة — **لا من سطر
 *     الأمر**: ما يُكتب في الأمر يبقى في سجلّ الطرفيّة.
 * ٢ · يبني قاعدةً جديدةً بالترحيلات التي كانت مطبَّقةً ساعةَ النسخ (رأسُها يسمّيها)، كلٌّ في معاملةٍ والمفاتيحُ مفعَّلة كما يطبّقها D1.
 * ٣ · يحمّل الصفوفَ بلا محفّزاتٍ ولا مفاتيح (الترتيبُ بين الجداول لا يُعرَف)، ثمّ يعيد المحفّزاتِ ويفعّل المفاتيح.
 * ٤ · يفحص: عددُ كلّ جدولٍ كما في الرأس، و`PRAGMA foreign_key_check` بلا صفّ، و`integrity_check` «ok»، وجداولُ النسخة هي جداولُ المخطَّط.
 * ٥ · يطبّق ما بعدها من ترحيلات المستودع (قاعدةُ اليوم)، ويفحص المفاتيحَ ثانيةً.
 * ٦ · يطبع زمنَ كلّ خطوةٍ والمجموع. و`--out` يكتب القاعدةَ ملفًّا، و`--sql` يكتب صفوفَها جملًا تُحمَّل في قاعدة D1 جديدةٍ مرحَّلة
 *     (`wrangler d1 execute … --file`، docs/RUNBOOK.md §٣).
 *
 * الاستعمال:
 *     TOKEN_ENC_KEY=… node --no-warnings scripts/restore_drill.mjs <snapshot.sada> [--out restored.sqlite] [--sql data.sql]
 *     node --no-warnings scripts/restore_drill.mjs --self-test
 *
 * ‏`--self-test` (في `npm run ci`): نسخةٌ مصنوعةٌ من قاعدةٍ مرحَّلةٍ بصفوفٍ مترابطة تُسترجَع كاملة، وتُزرع خمسُ عللٍ فتُمسَك
 * (مفتاحٌ آخر، وبايتٌ عُبث به في المتن، ورأسٌ عُدّل، وابنٌ بلا أبيه، وترحيلٌ ليس في المستودع)، وتُحمَّل جملُ `--sql` في قاعدةٍ مرحَّلة.
 */
import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { decodeSnapshot, encodeSnapshot, readSnapshotHeader } from '../src/lib/ops/snapshot.ts'

const ROOT = resolve(new URL('..', import.meta.url).pathname)
const MIGRATIONS = join(ROOT, 'migrations')
const quote = (name) => `"${String(name).replace(/"/g, '""')}"`

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

const userTables = (db) => db
  .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\' AND name <> 'd1_migrations' ORDER BY name")
  .all().map((r) => r.name)

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

const ms = (t0) => Math.round(performance.now() - t0)

/**
 * الاسترجاعُ كلُّه — نقيٌّ بمدخلاته ليُختبَر: البايتاتُ والمفاتيحُ ومجلّدُ الترحيلات وأين يُكتب. يعيد التقريرَ أو يرمي بسببٍ مسمّى.
 * @param {{ bytes: Uint8Array, keys: string[], migrationsDir?: string, out?: string, sql?: string }} input
 */
export async function restore({ bytes, keys, migrationsDir = MIGRATIONS, out, sql }) {
  const timings = {}
  const total = performance.now()
  let t = performance.now()
  const { header, payload } = await decodeSnapshot(bytes, keys)
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
    const triggers = db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND sql IS NOT NULL").all()
    for (const tr of triggers) db.exec(`DROP TRIGGER ${quote(tr.name)}`)
    db.exec('PRAGMA foreign_keys = OFF')
    db.exec('BEGIN')
    // ‏ما بذرته الترحيلاتُ (المنظّمةُ الأولى والإعدادات) تحلّ النسخةُ محلَّه: النسخةُ هي الحقّ
    for (const name of inSnapshot) db.exec(`DELETE FROM ${quote(name)}`)
    for (const name of inSnapshot) {
      const { columns, rows } = payload.tables[name]
      if (rows.length === 0) continue
      const unknown = columns.filter((c) => !db.prepare(`PRAGMA table_info(${quote(name)})`).all().some((x) => x.name === c))
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

    if (sql !== undefined) {
      const lines = ['-- صدى · صفوفُ نسخة ' + header.at + ' (' + header.env + ') — تُحمَّل في قاعدةٍ مرحَّلةٍ فارغة (docs/RUNBOOK.md §٣)',
        'PRAGMA defer_foreign_keys = true;']
      // ‏المحوُ كلُّه قبل أيّ إدخال: محوُ أبٍ بعد إدخال ابنه يُطلق CASCADE على ما أُدخل للتوّ
      const names = userTables(db)
      for (const name of names) lines.push(`DELETE FROM ${quote(name)};`)
      for (const name of names) {
        const rows = db.prepare(`SELECT * FROM ${quote(name)}`).all()
        for (const r of rows) {
          const cols = Object.keys(r)
          lines.push(`INSERT INTO ${quote(name)} (${cols.map(quote).join(', ')}) VALUES (${cols.map((c) => sqlValue(r[c])).join(', ')});`)
        }
      }
      writeFileSync(sql, lines.join('\n') + '\n')
    }
    timings.total = ms(total)
    return { header, counts, absent, forward, timings }
  } finally {
    db.close()
  }
}

function keysFromEnv() {
  return [process.env.TOKEN_ENC_KEY ?? '', process.env.TOKEN_ENC_KEY_PREV ?? ''].filter((k) => k.trim() !== '')
}

function report(r) {
  console.log(`النسخة: ${r.header.at} · ${r.header.env} · المفتاح ${r.header.kid} · ${r.header.tables.length} جدولًا · ${r.header.rows} صفًّا`)
  console.log(`  ✓ العدد يطابق في ${r.counts.length} جدولًا · ✓ لا صفَّ بلا أب · ✓ integrity_check ok`)
  if (r.absent.length > 0) console.log(`  · في المخطَّط ولا صفَّ له في النسخة: ${r.absent.join('، ')}`)
  console.log(`  ✓ ترحيلاتُ اليوم بعدها: ${r.forward.length === 0 ? 'لا شيء' : r.forward.join('، ')}`)
  const t = r.timings
  console.log(`  الزمن: فكّ ${t.decrypt}ms · بناء ${t.rebuild}ms · تحميل ${t.load}ms · فحص ${t.check}ms · ترحيلُ اليوم ${t.forward}ms · **المجموع ${t.total}ms**`)
}

// ── الفحصُ الذاتيّ: نسخةٌ مصنوعة، وخمسُ عللٍ مزروعة ───────────────────

/** قاعدةٌ مرحَّلةٌ بصفوفٍ مترابطة: حسابٌ ورمزُه ومنشورٌ ومحاولتاه — ويُصنَع منها متنُ نسخة كما يصنعه الـ Worker. */
function syntheticPayload(dir, migrations = repoMigrations(dir)) {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  for (const m of migrations) apply(db, dir, m)
  db.exec(`INSERT INTO accounts (id, platform, kind, external_id, display_name, org_id) VALUES ('acc1', 'linkedin', 'member', 'ext-1', 'بصائر', 'org_owner');
    INSERT INTO tokens (account_id, access_enc, access_iv, expires_at, scopes, org_id) VALUES ('acc1', 'v2:abcd1234:Q0lQSEVS', 'aXY=', '2026-12-01 00:00:00', 'w_member_social', 'org_owner');
    INSERT INTO posts (id, account_id, platform, type, text, status, idempotency_key, approved_at, scheduled_at, org_id)
      VALUES ('p1', 'acc1', 'linkedin', 'text', 'منشورٌ «بعلامات» و''اقتباس''', 'published', 'idem-1', '2026-11-01 09:00:00', '2026-11-02 09:00:00', 'org_owner');
    INSERT INTO publish_attempts (id, post_id, idempotency_key, attempt_no, request_json, response_json, status, org_id)
      VALUES ('a1', 'p1', 'idem-1', 1, '{}', '{"error":"timeout","status":0}', 'failed', 'org_owner'),
             ('a2', 'p1', 'idem-1', 2, '{}', '{"id":"urn:li:share:1"}', 'succeeded', 'org_owner');
    INSERT INTO heartbeats (job, outcome, detail) VALUES ('dispatch', 'ok', 'أُرسل 1');`)
  const tables = {}
  for (const name of userTables(db)) {
    const rows = db.prepare(`SELECT * FROM ${quote(name)}`).all()
    const columns = rows[0] === undefined ? [] : Object.keys(rows[0])
    tables[name] = { columns, rows: rows.map((r) => columns.map((c) => r[c])) }
  }
  db.close()
  return { tables }
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

    // ١ · النسخةُ السليمةُ تُسترجَع كاملة، وجملُ `--sql` تُحمَّل في قاعدةٍ مرحَّلةٍ فتعطي الأعدادَ نفسَها
    const sqlFile = join(dir, 'data.sql')
    const outFile = join(dir, 'restored.sqlite')
    const r = await restore({ bytes: good, keys: [OTHER, KEY], out: outFile, sql: sqlFile })
    if (r.header.rows !== Object.values(payload.tables).reduce((n, x) => n + x.rows.length, 0)) fails.push('الأعدادُ في الرأس')
    const restored = new DatabaseSync(outFile)
    const text = restored.prepare("SELECT text FROM posts WHERE id = 'p1'").get()?.text
    const token = restored.prepare("SELECT access_enc FROM tokens WHERE account_id = 'acc1'").get()?.access_enc
    restored.close()
    if (text !== "منشورٌ «بعلامات» و'اقتباس'") fails.push(`النصُّ لم يعد كما كان: ${text}`)
    if (token !== 'v2:abcd1234:Q0lQSEVS') fails.push('العمودُ المشفَّرُ لم يُنسَخ كما هو')
    const fresh = new DatabaseSync(':memory:')
    fresh.exec('PRAGMA foreign_keys = ON')
    for (const m of repoMigrations()) apply(fresh, MIGRATIONS, m)
    fresh.exec('BEGIN')
    fresh.exec(readFileSync(sqlFile, 'utf8'))
    fresh.exec('COMMIT')
    for (const c of r.counts) {
      const n = fresh.prepare(`SELECT count(*) AS n FROM ${quote(c.name)}`).get().n
      if (n !== c.want) fails.push(`--sql: ${c.name} ${n} من ${c.want}`)
    }
    if (fresh.prepare('PRAGMA foreign_key_check').all().length > 0) fails.push('--sql: صفوفٌ بلا أب')
    fresh.close()
    console.log(`  ✓ نسخةٌ مصنوعة (${r.header.tables.length} جدولًا · ${r.header.rows} صفًّا) استُرجعت في ${r.timings.total}ms، وجملُ --sql حُمّلت في قاعدةٍ مرحَّلة`)

    // ‏ونسخةٌ أُخذت قبل آخر ترحيل: تُبنى بترحيلاتها هي ثمّ تُرحَّل إلى مخطَّط اليوم، والأعدادُ كما هي
    const older = repoMigrations().slice(0, -1)
    const oldBytes = (await encodeSnapshot(KEY, { ...meta, migrations: older }, syntheticPayload(MIGRATIONS, older))).bytes
    const o = await restore({ bytes: oldBytes, keys: [KEY] })
    if (o.forward.length !== 1 || o.forward[0] !== repoMigrations().at(-1)) fails.push(`ترحيلُ اليوم بعد نسخةٍ أقدم: ${o.forward.join('، ')}`)
    else console.log(`  ✓ نسخةٌ قبل ${o.forward[0]} بُنيت بترحيلاتها ثمّ رُحّلت إليه`)

    // ٢ · العللُ المزروعة
    const tampered = good.slice()
    tampered[tampered.length - 20] ^= 0xff
    const badHeader = good.slice()
    const json = Buffer.from(badHeader.slice(12, readSnapshotHeader(good).end)).toString('utf8').replace('"env":"staging"', '"env":"stagino"')
    badHeader.set(Buffer.from(json, 'utf8'), 12)
    const orphan = structuredClone(payload)
    const pa = orphan.tables.publish_attempts
    pa.rows.push(pa.columns.map((c) => ({ id: 'a3', post_id: 'ghost', idempotency_key: 'idem-x', attempt_no: 1, request_json: '{}', status: 'failed', at: '2026-11-02 09:00:00', org_id: 'org_owner' })[c] ?? null))
    const orphanBytes = (await encodeSnapshot(KEY, meta, orphan)).bytes
    const future = (await encodeSnapshot(KEY, { ...meta, migrations: [...meta.migrations, '9999_future.sql'] }, payload)).bytes
    const plants = [
      ['مفتاحٌ آخر', { bytes: good, keys: [OTHER] }, /لا مفتاحَ معطًى يطابق/],
      ['بايتٌ عُبث به في المتن', { bytes: tampered, keys: [KEY] }, /فكُّ التشفير سقط/],
      ['رأسٌ عُدّل', { bytes: badHeader, keys: [KEY] }, /فكُّ التشفير سقط/],
      ['ابنٌ بلا أبيه', { bytes: orphanBytes, keys: [KEY] }, /foreign_key_check/],
      ['ترحيلٌ ليس في المستودع', { bytes: future, keys: [KEY] }, /ليس في المستودع/],
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
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  if (fails.length > 0) {
    console.log(`✕ self-test: ${fails.length} لم يقع كما يجب`)
    for (const f of fails) console.log(`  ${f}`)
    return 1
  }
  console.log('✓ self-test: نسخةٌ مصنوعةٌ استُرجعت وعُدّت وفُحصت مفاتيحُها، ونسخةٌ أقدمُ رُحّلت إلى اليوم، وخمسُ عللٍ مزروعةٍ أُمسكت')
  return 0
}

async function main(argv) {
  if (argv.includes('--self-test')) return selfTest()
  const file = argv.find((a) => !a.startsWith('--') && argv[argv.indexOf(a) - 1] !== '--out' && argv[argv.indexOf(a) - 1] !== '--sql')
  const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined }
  if (file === undefined) {
    console.log('الاستعمال: TOKEN_ENC_KEY=… node --no-warnings scripts/restore_drill.mjs <snapshot.sada> [--out restored.sqlite] [--sql data.sql] | --self-test')
    return 2
  }
  const keys = keysFromEnv()
  if (keys.length === 0) {
    console.log('✕ لا مفتاح: اضبط TOKEN_ENC_KEY في البيئة (read -rs TOKEN_ENC_KEY && export TOKEN_ENC_KEY) — لا في سطر الأمر.')
    return 2
  }
  const bytes = new Uint8Array(readFileSync(file))
  try {
    const { header } = readSnapshotHeader(bytes)
    console.log(`يُفكّ ${file} (المفتاح ${header.kid}) …`)
    report(await restore({ bytes, keys, out: opt('--out'), sql: opt('--sql') }))
    return 0
  } catch (error) {
    console.log(`✕ ${error instanceof Error ? error.message : String(error)}`)
    return 1
  }
}

process.exitCode = await main(process.argv.slice(2))

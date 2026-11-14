/**
 * ‏**الاسترجاعُ كما يجري يومَ الحاجة** (مراجعة D-321 · docs/RUNBOOK.md §٢ و§٣): نسخةٌ أو علامةٌ تعيد القاعدةَ إلى ما كانت، **وما وقع
 * ‏خارجها بعدها لا يرجع**: ما نُشر يبقى منشورًا فلا يُرسَل ثانية، وما دُفع يبقى في `cost_ledger`، وما أُلغي من وصولٍ يبقى ملغًى،
 * ‏والنشرُ موقوفٌ حتّى يرفعه المالك. كلُّ ذلك على SQLite مرحَّلٍ بالترحيلات نفسِها والمحفّزاتُ قائمة، كما في D1.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { toBase64 } from '../crypto'
import { fakeDb, type FakeDb } from '../../test/fakes'
import { dueNow } from '../schedule/job'
import { takeSnapshot, type BackupBucket } from './backup'
import { backupKey } from './snapshot'

const KEY = toBase64(crypto.getRandomValues(new Uint8Array(32)))
const SNAP_AT = new Date('2026-11-08T03:03:00.000Z')
const NOW = new Date('2026-11-12T10:00:00.000Z')

function memoryBucket(): BackupBucket & { readonly objects: Map<string, Uint8Array> } {
  const objects = new Map<string, Uint8Array>()
  return {
    objects,
    async put(key, value) { objects.set(key, value.slice()) },
    async list() { return { objects: [...objects.keys()].map((key) => ({ key })), truncated: false } },
    async delete() {},
  }
}

/** ‏القاعدةُ يومَ النسخة: منشورٌ في الطابور، ومنشورٌ معتمَدٌ بلا حسابٍ ولا موعد، وعضوٌ، ومفتاحا مرور، ورمزا استرداد. */
function before(db: FakeDb): void {
  db.raw.exec(`
    INSERT INTO accounts (id, platform, kind, external_id, display_name, org_id) VALUES ('acc1', 'x', 'member', 'e1', 'عمر', 'org_owner');
    INSERT INTO posts (id, account_id, platform, type, text, status, idempotency_key, approved_at, scheduled_at, org_id)
      VALUES ('q1', 'acc1', 'x', 'text', 'في الطابور', 'queued', 'k-q1', '2026-11-07 09:00:00', '2026-11-10 09:00:00', 'org_owner'),
             ('a1', NULL, 'x', 'text', 'معتمَدٌ بلا موعد', 'approved', 'k-a1', '2026-11-07 09:00:00', NULL, 'org_owner');
    INSERT INTO members (email, role, invited_by) VALUES ('editor@example.com', 'admin', 'owner@example.com');
    INSERT INTO passkeys (id, credential_id, public_key, alg, label, rp_id) VALUES ('pk-laptop', 'c1', 'k1', -7, 'الحاسوب', 'sada2.basserh.com'),
                                                                                  ('pk-stolen', 'c2', 'k2', -7, 'الهاتف', 'sada2.basserh.com');
    INSERT INTO recovery_codes (hash) VALUES ('h-used-later'), ('h-unused');`)
}

/** ‏ما وقع بعدها في القاعدة الحيّة: نُشر الاثنان ودُفع ثمنُ أحدهما، وأُلغي العضو وحُذف المفتاحُ المسروق واستُعمل رمز، ثمّ أوقف المالكُ النشر. */
function after(db: FakeDb): void {
  db.raw.exec(`
    UPDATE posts SET status = 'published', dispatched_at = '2026-11-10 09:00:04' WHERE id = 'q1';
    UPDATE posts SET status = 'published', account_id = 'acc1', scheduled_at = '2026-11-11 09:00:00', dispatched_at = '2026-11-11 09:00:03' WHERE id = 'a1';
    INSERT INTO publish_attempts (id, post_id, idempotency_key, attempt_no, request_json, response_json, platform_post_id, status, at, org_id)
      VALUES ('att-q1', 'q1', 'k-q1', 1, '{}', '{"id":"1"}', 'tw-1', 'succeeded', '2026-11-10 09:00:05', 'org_owner'),
             ('att-a1', 'a1', 'k-a1', 1, '{}', '{"id":"2"}', 'tw-2', 'succeeded', '2026-11-11 09:00:04', 'org_owner');
    INSERT INTO cost_ledger (id, provider, operation, units, unit_cost, total, ref_id, at, org_id)
      VALUES ('cost-q1', 'x', 'post', 1, 0.01, 0.01, 'q1', '2026-11-10 09:00:05', 'org_owner');
    UPDATE members SET revoked_at = '2026-11-09 12:00:00' WHERE email = 'editor@example.com';
    DELETE FROM passkeys WHERE id = 'pk-stolen';
    UPDATE recovery_codes SET used_at = '2026-11-09 13:00:00' WHERE hash = 'h-used-later';
    INSERT INTO settings (org_id, key, value) VALUES ('org_owner', 'paused', 'true') ON CONFLICT(org_id, key) DO UPDATE SET value = 'true';`)
}

/** ‏ما يردّه `wrangler d1 execute --remote --json --command "$(cat scripts/restore_carry.sql)"`: نتيجةٌ لكلّ جملة. */
function exportCarry(db: FakeDb): string {
  const statements = readFileSync('scripts/restore_carry.sql', 'utf8').split(/;\s*$/m).map((s) => s.trim()).filter((s) => s !== '')
  return JSON.stringify(statements.map((sql) => ({ results: db.raw.prepare(sql).all(), success: true, meta: { duration: 1 } })), null, 2)
}

function drill(args: readonly string[], env: Record<string, string>) {
  return spawnSync(process.execPath, ['--no-warnings', 'scripts/restore_drill.mjs', ...args], {
    encoding: 'utf8', env: { PATH: process.env.PATH ?? '', ...env },
  })
}

/** ‏تحميلُ ملفٍّ كما يحمّله `wrangler d1 execute --file`: معاملةٌ واحدة، والمفاتيحُ والمحفّزاتُ قائمة. */
function load(db: FakeDb, file: string): void {
  db.raw.exec('BEGIN')
  try {
    db.raw.exec(readFileSync(file, 'utf8'))
    db.raw.exec('COMMIT')
  } catch (error) {
    db.raw.exec('ROLLBACK')
    throw error
  }
}

const one = <T>(db: FakeDb, sql: string): T => db.raw.prepare(sql).get() as T

/** ‏ما يجب أن يبقى بعد أيّ استرجاع: لا شيءَ يُرسَل ثانية، وما دُفع مكتوب، والوصولُ كما أُغلق، والنشرُ موقوف. */
async function expectNothingUndone(db: FakeDb): Promise<void> {
  expect(one<{ value: string }>(db, "SELECT value FROM settings WHERE org_id = 'org_owner' AND key = 'paused'").value).toBe('true')
  expect(db.raw.prepare('SELECT id, status, account_id, scheduled_at FROM posts ORDER BY id').all()).toEqual([
    { id: 'a1', status: 'published', account_id: 'acc1', scheduled_at: '2026-11-11 09:00:00' },
    { id: 'q1', status: 'published', account_id: 'acc1', scheduled_at: '2026-11-10 09:00:00' },
  ])
  expect(db.raw.prepare("SELECT id FROM publish_attempts WHERE status = 'succeeded' ORDER BY id").all()).toEqual([{ id: 'att-a1' }, { id: 'att-q1' }])
  expect(await dueNow(db, NOW)).toEqual([])
  expect(one<{ n: number }>(db, "SELECT count(*) AS n FROM cost_ledger WHERE id = 'cost-q1'").n).toBe(1)
  expect(one<{ revoked_at: string | null }>(db, "SELECT revoked_at FROM members WHERE email = 'editor@example.com'").revoked_at).toBe('2026-11-09 12:00:00')
  expect(db.raw.prepare('SELECT id FROM passkeys').all()).toEqual([{ id: 'pk-laptop' }])
  expect(one<{ used_at: string | null }>(db, "SELECT used_at FROM recovery_codes WHERE hash = 'h-used-later'").used_at).toBe('2026-11-09 13:00:00')
  // ‏ومحفّزا D-004 (0047) قائمان بعد التحميل
  expect(one<{ n: number }>(db, "SELECT count(*) AS n FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'publish_attempts_once_%'").n).toBe(2)
}

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'sada-restore-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

describe('§٣ · النسخةُ والقاعدةُ قائمة (--sql مع --carry)', () => {
  it('ما نُشر بعد النسخة لا يُنشَر ثانية، وما أُلغي من وصولٍ يبقى ملغًى، والنشرُ موقوفٌ بعد التحميل', async () => {
    const live = fakeDb()
    before(live)
    const bucket = memoryBucket()
    const snap = await takeSnapshot({ db: live, bucket, encKey: KEY, env: 'staging', now: SNAP_AT })
    if (!snap.ok) throw new Error(snap.detail)
    after(live)
    writeFileSync(join(dir, 'snap.sada'), bucket.objects.get(snap.key)!)
    writeFileSync(join(dir, 'live.json'), exportCarry(live))
    const run = drill([join(dir, 'snap.sada'), '--sql', join(dir, 'restore-data.sql'), '--carry', join(dir, 'live.json')], { SADA_BACKUP_KEY: await backupKey(KEY) })
    expect(run.status, run.stdout + run.stderr).toBe(0)
    expect(run.stdout).toMatch(/يُحمَل من القاعدة الحيّة/)
    load(live, join(dir, 'restore-data.sql'))
    await expectNothingUndone(live)
  })

  it('وبلا --carry (القاعدةُ حُذفت): الملفُّ ينتهي بالإيقاف، والتمرينُ يسمّي ما سيُرسَل حين يُرفع', async () => {
    const live = fakeDb()
    before(live)
    const bucket = memoryBucket()
    const snap = await takeSnapshot({ db: live, bucket, encKey: KEY, env: 'staging', now: SNAP_AT })
    if (!snap.ok) throw new Error(snap.detail)
    writeFileSync(join(dir, 'snap.sada'), bucket.objects.get(snap.key)!)
    const run = drill([join(dir, 'snap.sada'), '--sql', join(dir, 'restore-data.sql')], { SADA_BACKUP_KEY: await backupKey(KEY) })
    expect(run.status, run.stdout + run.stderr).toBe(0)
    expect(run.stdout).toMatch(/مجدولٌ حلّ موعدُه[^\n]*q1/)
    const fresh = fakeDb()
    load(fresh, join(dir, 'restore-data.sql'))
    expect(one<{ value: string }>(fresh, "SELECT value FROM settings WHERE org_id = 'org_owner' AND key = 'paused'").value).toBe('true')
    expect(one<{ status: string }>(fresh, "SELECT status FROM posts WHERE id = 'q1'").status).toBe('queued')
  })

  it('ولا يكتب نواتجه داخل المستودع: «git add -A» لا يحمل القاعدة', async () => {
    const live = fakeDb()
    const bucket = memoryBucket()
    const snap = await takeSnapshot({ db: live, bucket, encKey: KEY, env: 'staging', now: SNAP_AT })
    if (!snap.ok) throw new Error(snap.detail)
    writeFileSync(join(dir, 'snap.sada'), bucket.objects.get(snap.key)!)
    for (const flag of ['--sql', '--out']) {
      const run = drill([join(dir, 'snap.sada'), flag, `restore-data-${flag.slice(2)}.tmp`], { TOKEN_ENC_KEY: KEY })
      expect(run.status).toBe(1)
      expect(run.stdout).toMatch(/داخل المستودع/)
    }
  })
})

describe('§٢ · Time Travel ثمّ ملفُّ الحمل (--carry وحدَه)', () => {
  it('ملفٌّ يُحمَّل بعد الاسترجاع مباشرةً: يوقف النشر ويصالح ما نُشر — ومنشورٌ معتمَدٌ بلا حسابٍ ولا موعد لا يُسقط الجملة (CHECK)', async () => {
    const live = fakeDb()
    before(live)
    after(live)
    writeFileSync(join(dir, 'live.json'), exportCarry(live))
    const run = drill(['--carry', join(dir, 'live.json'), '--sql', join(dir, 'carry.sql')], {})
    expect(run.status, run.stdout + run.stderr).toBe(0)
    // ‏ما يعيده `time-travel restore`: القاعدةُ كما كانت عند العلامة، والإيقافُ معها «false»
    const restored = fakeDb()
    before(restored)
    load(restored, join(dir, 'carry.sql'))
    await expectNothingUndone(restored)
  })

  it('وتصديرٌ ناقصٌ يُردّ بسببه قبل أن يُكتب شيء — لا ملفَّ يمحو العواملَ بنصف قائمة', async () => {
    const live = fakeDb()
    before(live)
    const partial = (JSON.parse(exportCarry(live)) as { results: { carry: string }[] }[])
      .map((r) => ({ ...r, results: r.results.filter((x) => x.carry !== 'passkeys') }))
    writeFileSync(join(dir, 'live.json'), JSON.stringify(partial))
    const run = drill(['--carry', join(dir, 'live.json'), '--sql', join(dir, 'carry.sql')], {})
    expect(run.status).toBe(1)
    expect(run.stdout).toMatch(/passkeys/)
    expect(() => readFileSync(join(dir, 'carry.sql'))).toThrow()
  })
})

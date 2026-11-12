/**
 * ‏**النسخةُ الاحتياطيّةُ الأسبوعيّة** (D-321): الصيغةُ تُكتب وتُقرأ بالمفتاح المشتقّ وحدَه، والرموزُ لا تظهر فيها مقروءة، وآخرُ ثمانٍ
 * ‏تبقى، وما يسقط يُسجَّل، والتمرينُ (`scripts/restore_drill.mjs`) يفتح ما يكتبه الـ Worker نفسُه.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { keyId, toBase64 } from '../crypto'
import { fakeDb, type FakeDb } from '../../test/fakes'
import { saveTokens, upsertAccount } from '../tokens'
import { KEEP_SNAPSHOTS, latestBackups, pruneSnapshots, snapshotDue, takeSnapshot, type BackupBucket } from './backup'
import { decodeSnapshot, encodeSnapshot, readSnapshotHeader, SnapshotError, snapshotKid } from './snapshot'

const KEY = toBase64(crypto.getRandomValues(new Uint8Array(32)))
const OTHER = toBase64(crypto.getRandomValues(new Uint8Array(32)))
const ACCESS = 'AQV_access_plaintext_must_not_leak'
const REFRESH = 'AQV_refresh_plaintext_must_not_leak'
const NOW = new Date('2026-11-16T03:03:00.000Z')

/** ‏دلوٌ في الذاكرة كـ R2: يكتب ويسرد بالبادئة ويحذف. */
function fakeBucket(fail = false): BackupBucket & { readonly objects: Map<string, Uint8Array> } {
  const objects = new Map<string, Uint8Array>()
  return {
    objects,
    async put(key, value) {
      if (fail) throw new Error('R2 put failed: https://example.r2.cloudflarestorage.com/x')
      objects.set(key, value.slice())
    },
    async list(options) {
      const prefix = options?.prefix ?? ''
      return { objects: [...objects.keys()].filter((k) => k.startsWith(prefix)).sort().map((key) => ({ key })), truncated: false }
    },
    async delete(keys) {
      for (const k of Array.isArray(keys) ? keys : [keys]) objects.delete(k)
    },
  }
}

let db: FakeDb

beforeEach(async () => {
  db = fakeDb()
  const id = await upsertAccount(db, 'org_owner', { platform: 'linkedin', kind: 'member', externalId: 'urn:li:person:1', displayName: 'عمر' })
  await saveTokens(db, KEY, id, {
    accessToken: ACCESS, refreshToken: REFRESH, expiresAt: '2026-12-01T00:00:00.000Z', refreshExpiresAt: null, scopes: 'w_member_social',
  })
})

describe('الصيغة (snapshot.ts)', () => {
  it('معرّفُ المفتاح هو `keyId` نفسُه (D-318) — فلا يفترق ما يقوله الرأسُ عمّا تقوله الشيفرة', async () => {
    expect(await snapshotKid(KEY)).toBe(await keyId(KEY))
  })

  it('تُكتب وتُقرأ بالمفتاح نفسِه، والرأسُ يقول الأعدادَ بلا مفتاح', async () => {
    const payload = { tables: { posts: { columns: ['id', 'text'], rows: [['p1', 'نصّ'], ['p2', null]] }, empty: { columns: [], rows: [] } } }
    const { bytes } = await encodeSnapshot(KEY, { at: NOW.toISOString(), env: 'staging', migrations: ['0001_init.sql'] }, payload)
    expect(readSnapshotHeader(bytes).header).toMatchObject({ rows: 2, kid: await keyId(KEY), info: 'backup-v1', cipher: 'AES-256-GCM' })
    const back = await decodeSnapshot(bytes, [OTHER, KEY])
    expect(back.payload).toEqual(payload)
  })

  it('مفتاحٌ آخر، أو بايتٌ في المتن، أو رأسٌ عُدّل — كلُّها تُردّ بسببها ولا نصفَ نسخة', async () => {
    const { bytes } = await encodeSnapshot(KEY, { at: NOW.toISOString(), env: 'staging', migrations: null }, { tables: { t: { columns: ['a'], rows: [[1]] } } })
    await expect(decodeSnapshot(bytes, [OTHER])).rejects.toThrow(/لا مفتاحَ معطًى يطابق/)
    const body = bytes.slice()
    body[body.length - 5]! ^= 1
    await expect(decodeSnapshot(body, [KEY])).rejects.toBeInstanceOf(SnapshotError)
    const head = bytes.slice()
    const at = new TextDecoder().decode(head).indexOf('"rows":1')
    head.set(new TextEncoder().encode('"rows":2'), at)
    await expect(decodeSnapshot(head, [KEY])).rejects.toThrow(/فكُّ التشفير سقط/)
    await expect(decodeSnapshot(new TextEncoder().encode('not a snapshot'), [KEY])).rejects.toThrow(/ليس ملفَّ نسخةٍ/)
  })
})

describe('takeSnapshot (D-321)', () => {
  it('كلُّ الجداول بأعدادها، والرموزُ تُنسَخ مشفَّرةً كما هي ثمّ يُشفَّر الملفُّ فوقها — لا رمزَ مقروءًا في النسخة', async () => {
    const bucket = fakeBucket()
    const out = await takeSnapshot({ db, bucket, encKey: KEY, env: 'staging', now: NOW })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.key).toMatch(/^snapshots\/2026-11-16T03-03-00-000Z-[0-9a-f]{8}\.sada$/)
    const bytes = bucket.objects.get(out.key)!
    const raw = new TextDecoder('latin1').decode(bytes)
    const stored = db.raw.prepare('SELECT access_enc, refresh_enc FROM tokens').get() as { access_enc: string; refresh_enc: string }
    // ‏الملفُّ كلُّه مشفَّر: لا الرمزُ ولا نصُّه المشفَّرُ في القاعدة يُقرأ في بايتاته
    for (const needle of [ACCESS, REFRESH, stored.access_enc]) expect(raw.includes(needle)).toBe(false)
    const { header, payload } = await decodeSnapshot(bytes, [KEY])
    const names = (db.raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[]).map((r) => r.name)
    expect(header.tables.map((t) => t.name)).toEqual(names)
    expect(header.tables.find((t) => t.name === 'tokens')?.rows).toBe(1)
    // ‏وبعد الفكّ: النصُّ المشفَّرُ كما في القاعدة حرفًا، والرمزُ المقروءُ غائب
    const tokens = payload.tables.tokens!
    expect(tokens.rows[0]![tokens.columns.indexOf('access_enc')]).toBe(stored.access_enc)
    const plain = JSON.stringify(payload)
    expect(plain.includes(ACCESS) || plain.includes(REFRESH)).toBe(false)
    // ‏والصفُّ في `backups` يقول ما كُتب
    const { lastOk } = await latestBackups(db)
    expect(lastOk).toMatchObject({ status: 'ok', objectKey: out.key, tables: names.length, rows: header.rows, bytes: bytes.byteLength, kid: header.kid })
  })

  it('آخرُ ثمانٍ تبقى، وما سواها في الدلو لا يُمسّ', async () => {
    const bucket = fakeBucket()
    bucket.objects.set('media/keep.png', new Uint8Array([1]))
    bucket.objects.set('snapshots/notes.txt', new Uint8Array([2]))
    const keys: string[] = []
    for (let week = 0; week < 10; week += 1) {
      const out = await takeSnapshot({ db, bucket, encKey: KEY, env: 'staging', now: new Date(NOW.getTime() + week * 7 * 86_400_000) })
      if (out.ok) keys.push(out.key)
    }
    const kept = [...bucket.objects.keys()].filter((k) => k.endsWith('.sada'))
    expect(kept).toEqual(keys.slice(-KEEP_SNAPSHOTS))
    expect(bucket.objects.has('media/keep.png') && bucket.objects.has('snapshots/notes.txt')).toBe(true)
    expect(await pruneSnapshots(bucket)).toBe(0)
  })

  it('ما يسقط يُسجَّل `failed` بسببٍ بلا عنوان، ولا يُحذف شيءٌ قديم', async () => {
    const bucket = fakeBucket(true)
    const out = await takeSnapshot({ db, bucket, encKey: KEY, env: 'staging', now: NOW })
    expect(out).toEqual({ ok: false, detail: 'R2 put failed: «عنوان مُزال»' })
    const { last, lastOk } = await latestBackups(db)
    expect(last).toMatchObject({ status: 'failed', objectKey: null, detail: 'R2 put failed: «عنوان مُزال»' })
    expect(lastOk).toBeNull()
  })

  it('أسبوعيّة: لا نسخةَ ← مستحقّة؛ وبعد نسخةٍ لا تُستحقّ قبل سبعة أيّام إلّا ساعة، والفاشلةُ لا تؤخّر التالية', async () => {
    expect(await snapshotDue(db, NOW)).toBe(true)
    await takeSnapshot({ db, bucket: fakeBucket(true), encKey: KEY, env: 'staging', now: NOW })
    expect(await snapshotDue(db, NOW)).toBe(true)
    await takeSnapshot({ db, bucket: fakeBucket(), encKey: KEY, env: 'staging', now: NOW })
    const hours = (h: number) => new Date(NOW.getTime() + h * 3_600_000)
    expect(await snapshotDue(db, hours(24))).toBe(false)
    expect(await snapshotDue(db, hours(7 * 24 - 2))).toBe(false)
    expect(await snapshotDue(db, hours(7 * 24 - 1))).toBe(true)
  })
})

describe('التمرينُ يفتح ما يكتبه الـ Worker (scripts/restore_drill.mjs)', () => {
  it('نسخةٌ من takeSnapshot تُفكّ وتُبنى وتُعدّ بالمفتاح من البيئة، وبغيره تُردّ', async () => {
    const bucket = fakeBucket()
    const out = await takeSnapshot({ db, bucket, encKey: KEY, env: 'staging', now: NOW })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    const dir = mkdtempSync(join(tmpdir(), 'sada-snap-'))
    try {
      const file = join(dir, 'snap.sada')
      writeFileSync(file, bucket.objects.get(out.key)!)
      const run = (key: string) => spawnSync(process.execPath, ['--no-warnings', 'scripts/restore_drill.mjs', file], {
        encoding: 'utf8', env: { PATH: process.env.PATH ?? '', TOKEN_ENC_KEY: key },
      })
      const ok = run(KEY)
      expect(ok.status, ok.stdout + ok.stderr).toBe(0)
      expect(ok.stdout).toMatch(/العدد يطابق في \d+ جدولًا/)
      expect(ok.stdout).toMatch(/المجموع \d+ms/)
      const bad = run(OTHER)
      expect(bad.status).toBe(1)
      expect(bad.stdout).toMatch(/لا مفتاحَ معطًى يطابق/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

/**
 * الحذفُ بالتراجع (D-322) — **ما يُحذف يعود كما كان، وما يُمنع يُقال سببُه، ولا يمسّ حذفٌ عميلًا آخر**.
 *
 * والبايتاتُ لا تُمحى قبل مهلة «تراجَع»، ولا يُمحى مفتاحٌ ما زال صفٌّ يشير إليه — صورةٌ رُبطت بمنشورٍ آخر، أو مقطعٌ له منشورات.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { fakeDb, fakeKv, type FakeDb } from '../../test/fakes'
import {
  purgeDeleted, restoreTrash, trashLibraryFile, trashPost, trashSource, trashUpload, UNDO_SECONDS, type PurgeBucket,
} from './trash'

let db: FakeDb
let kv: ReturnType<typeof fakeKv>
let clock = Date.now()

/** R2 في الذاكرة: ما يُمحى وما يُسرَد بسابقته. */
function bucket(keys: readonly string[]): PurgeBucket & { readonly objects: Set<string> } {
  const objects = new Set(keys)
  return {
    objects,
    async delete(k) { for (const key of [k].flat()) objects.delete(key) },
    async list({ prefix, limit = 1000 }) {
      const all = [...objects].filter((k) => k.startsWith(prefix)).sort()
      return { objects: all.slice(0, limit).map((key) => ({ key })), truncated: all.length > limit }
    },
  }
}

beforeEach(() => {
  clock = Date.now()
  db = fakeDb()
  kv = fakeKv(() => clock)
  db.raw.exec("INSERT INTO orgs (id, name, kind) VALUES ('org_b', 'شركة ب', 'agency')")
})

const deps = (): { db: FakeDb; kv: typeof kv } => ({ db, kv })
const count = (sql: string): number => (db.raw.prepare(sql).get() as { n: number }).n

function seedPost(id: string, org = 'org_owner', status = 'draft'): void {
  db.raw.prepare(`INSERT INTO posts (id, platform, type, text, status, idempotency_key, org_id) VALUES (?, 'linkedin', 'text', ?, ?, ?, ?)`)
    .run(id, 'نصّ المنشور ' + id, status, 'k-' + id, org)
}

function seedMedia(id: string, post: string, key: string, org = 'org_owner'): void {
  db.raw.prepare(`INSERT INTO media (id, post_id, r2_key, mime, bytes, prompt, model, idempotency_key, org_id)
    VALUES (?, ?, ?, 'image/png', 10, 'p', 'm', ?, ?)`).run(id, post, key, 'mk-' + id, org)
}

describe('المسوّدة', () => {
  it('تُحذف بأبنائها، وتعود بـ«تراجَع» كما كانت — صفًّا صفًّا', async () => {
    seedPost('p1')
    seedMedia('m1', 'p1', 'img/p1/m1.png')
    db.raw.exec(`INSERT INTO metrics (post_id, window, impressions) VALUES ('p1', '24h', 5)`)
    db.raw.exec(`INSERT INTO publish_attempts (id, post_id, idempotency_key, attempt_no, request_json, status)
      VALUES ('a1', 'p1', 'k-p1', 1, '{}', 'failed'), ('a2', 'p1', 'k-p1', 2, '{}', 'failed')`)
    const before = JSON.stringify([
      db.raw.prepare('SELECT * FROM posts').all(), db.raw.prepare('SELECT * FROM media').all(),
      db.raw.prepare('SELECT * FROM metrics').all(), db.raw.prepare('SELECT * FROM publish_attempts ORDER BY rowid').all(),
    ])
    const out = await trashPost(deps(), 'org_owner', 'p1')
    expect(out.ok).toBe(true)
    for (const t of ['posts', 'media', 'metrics', 'publish_attempts']) expect(count(`SELECT COUNT(*) AS n FROM ${t}`)).toBe(0)
    expect(kv.ttlOf(`trash:${out.ok ? out.token : ''}`)).toBe(UNDO_SECONDS)

    const back = await restoreTrash(deps(), 'org_owner', out.ok ? out.token : '')
    expect(back).toMatchObject({ ok: true, kind: 'post', ref: 'p1' })
    const after = JSON.stringify([
      db.raw.prepare('SELECT * FROM posts').all(), db.raw.prepare('SELECT * FROM media').all(),
      db.raw.prepare('SELECT * FROM metrics').all(), db.raw.prepare('SELECT * FROM publish_attempts ORDER BY rowid').all(),
    ])
    expect(after).toBe(before)
    // ‏والصورةُ وقيدُ المحو مُحيا: «تراجَع» مرّةً لا مرّتين
    expect(await kv.get(`trash:${out.ok ? out.token : ''}`)).toBeNull()
    expect((await restoreTrash(deps(), 'org_owner', out.ok ? out.token : '')).ok).toBe(false)
  })

  it.each([
    ['queued', 'اسحب موعده'],
    ['published', 'نُشر'],
  ])('%s لا تُحذف وحدَها، والسببُ يُقال', async (status, why) => {
    db.raw.prepare(`INSERT INTO accounts (id, platform, kind, external_id, display_name) VALUES ('acc', 'linkedin', 'member', 'e', 'ح')`).run()
    db.raw.prepare(`INSERT INTO posts (id, account_id, platform, type, text, status, idempotency_key, approved_at, scheduled_at)
      VALUES ('p1', 'acc', 'linkedin', 'text', 'نصّ', ?, 'k1', datetime('now'), datetime('now'))`).run(status)
    const out = await trashPost(deps(), 'org_owner', 'p1')
    expect(out.ok).toBe(false)
    expect(out.ok ? '' : out.reason).toContain(why)
    expect(count('SELECT COUNT(*) AS n FROM posts')).toBe(1)
  })

  it('**وما بلغ منصّتَه لا يُحذف ولو فشل بعده** — محاولتُه الناجحة هي D-004', async () => {
    seedPost('p1', 'org_owner', 'failed')
    db.raw.exec(`INSERT INTO publish_attempts (id, post_id, idempotency_key, attempt_no, request_json, status)
      VALUES ('a1', 'p1', 'k-p1', 1, '{}', 'succeeded')`)
    expect((await trashPost(deps(), 'org_owner', 'p1')).ok).toBe(false)
    db.raw.exec(`DELETE FROM publish_attempts`)
    db.raw.exec(`INSERT INTO publish_attempts (id, post_id, idempotency_key, attempt_no, request_json, status)
      VALUES ('a2', 'p1', 'k-p1', 1, '{}', 'sent')`)
    const open = await trashPost(deps(), 'org_owner', 'p1')
    expect(open.ok ? '' : open.reason).toContain('يُنشر الآن')
    expect(count('SELECT COUNT(*) AS n FROM publish_attempts')).toBe(1)
  })

  it('ولا تُحذف وصورتُها تُولَّد الآن (حجزٌ حيّ بلا صفّ)', async () => {
    seedPost('p1')
    db.raw.exec(`INSERT INTO media_claims (idempotency_key, post_id, kind) VALUES ('claim-1', 'p1', 'image')`)
    const out = await trashPost(deps(), 'org_owner', 'p1')
    expect(out.ok ? '' : out.reason).toContain('يُولَّد الآن')
  })

  it('**ولا يحذف عميلٌ منشورَ عميلٍ آخر، ولا يتراجع عن حذفٍ في غيره**', async () => {
    seedPost('pb', 'org_b')
    expect((await trashPost(deps(), 'org_owner', 'pb')).ok).toBe(false)
    expect(count("SELECT COUNT(*) AS n FROM posts WHERE org_id = 'org_b'")).toBe(1)
    const out = await trashPost(deps(), 'org_b', 'pb')
    expect(out.ok).toBe(true)
    const wrong = await restoreTrash(deps(), 'org_owner', out.ok ? out.token : '')
    expect(wrong.ok).toBe(false)
    expect(count('SELECT COUNT(*) AS n FROM posts')).toBe(0)
    expect((await restoreTrash(deps(), 'org_b', out.ok ? out.token : '')).ok).toBe(true)
  })

  it('و«تراجَع» بعد المهلة لا يعيد شيئًا', async () => {
    seedPost('p1')
    const out = await trashPost(deps(), 'org_owner', 'p1')
    clock += (UNDO_SECONDS + 1) * 1000
    const late = await restoreTrash(deps(), 'org_owner', out.ok ? out.token : '')
    expect(late.ok ? '' : late.reason).toContain('انقضت')
    expect(count('SELECT COUNT(*) AS n FROM posts')).toBe(0)
  })

  it('ورمزٌ مصنوعٌ لا يُقرأ', async () => {
    expect((await restoreTrash(deps(), 'org_owner', '../session:x')).ok).toBe(false)
  })
})

describe('محوُ البايتات في الكنس', () => {
  it('لا يُمحى شيءٌ قبل المهلة، ثمّ يُمحى ما لا يشير إليه أحد ويُترك المشار إليه', async () => {
    seedPost('p1')
    seedPost('p2')
    seedMedia('m1', 'p1', 'img/p1/own.png')
    // ‏صورةٌ رُبطت بالمنشورين (`attachStatement`): مفتاحُها في صفّي `media`
    seedMedia('m2', 'p1', 'library/shared.png')
    seedMedia('m3', 'p2', 'library/shared.png')
    const r2 = bucket(['img/p1/own.png', 'library/shared.png'])
    await trashPost(deps(), 'org_owner', 'p1')

    expect(await purgeDeleted({ ...deps(), bucket: r2 }, new Date(clock))).toMatchObject({ objects: 0 })
    expect(r2.objects.size).toBe(2)

    const later = new Date(clock + (UNDO_SECONDS + 120) * 1000)
    const report = await purgeDeleted({ ...deps(), bucket: r2 }, later)
    expect([...r2.objects]).toEqual(['library/shared.png'])
    expect(report).toMatchObject({ objects: 1, kept: 1, done: 1 })
    // ‏والقيدُ فرغ فمُحي: الكنسُ التالي لا يجد شيئًا
    expect(await purgeDeleted({ ...deps(), bucket: r2 }, later)).toMatchObject({ done: 0, objects: 0 })
  })

  it('وما رُدّ بـ«تراجَع» لا تُمحى بايتاتُه', async () => {
    seedPost('p1')
    seedMedia('m1', 'p1', 'img/p1/own.png')
    const r2 = bucket(['img/p1/own.png'])
    const out = await trashPost(deps(), 'org_owner', 'p1')
    await restoreTrash(deps(), 'org_owner', out.ok ? out.token : '')
    await purgeDeleted({ ...deps(), bucket: r2 }, new Date(clock + 3 * UNDO_SECONDS * 1000))
    expect(r2.objects.has('img/p1/own.png')).toBe(true)
  })

  it('**ومفتاحُ عميلٍ لا يُسأل عنه في غيره**: صفٌّ في عميلٍ آخر بالمفتاح نفسِه لا يُبقيه ولا يُمحى', async () => {
    seedPost('pb', 'org_b')
    seedMedia('mb', 'pb', 'org/org_b/img/pb/x.png', 'org_b')
    seedPost('po')
    seedMedia('mo', 'po', 'img/po/y.png')
    const r2 = bucket(['org/org_b/img/pb/x.png', 'img/po/y.png'])
    await trashPost(deps(), 'org_b', 'pb')
    await purgeDeleted({ ...deps(), bucket: r2 }, new Date(clock + 3 * UNDO_SECONDS * 1000))
    expect([...r2.objects]).toEqual(['img/po/y.png'])
    expect(count("SELECT COUNT(*) AS n FROM media WHERE org_id = 'org_owner'")).toBe(1)
  })
})

describe('المصدر', () => {
  it('المرفوعُ يُحذف بخلاصته وتُقطع إشارةُ منشوراته، ويعود بها، وأصلُه ونصُّه يُقيَّدان للمحو', async () => {
    db.raw.exec(`INSERT INTO sources (id, drive_file_id, name, mime, content_hash, kind, file_key, text_key)
      VALUES ('s1', 'upload:h', 'ملفّي.pdf', 'application/pdf', 'sha256:h', 'upload', 'sources/org_owner/upload-h/original.pdf', 'sources/org_owner/upload-h/text.md')`)
    db.raw.exec(`INSERT INTO content_items (id, source_id, summary) VALUES ('c1', 's1', 'خلاصة')`)
    seedPost('p1')
    db.raw.exec(`UPDATE posts SET source_id = 's1' WHERE id = 'p1'`)
    const out = await trashSource(deps(), 'org_owner', 's1')
    expect(out.ok).toBe(true)
    expect(count('SELECT COUNT(*) AS n FROM sources')).toBe(0)
    expect(count('SELECT COUNT(*) AS n FROM content_items')).toBe(0)
    expect((db.raw.prepare("SELECT source_id FROM posts WHERE id = 'p1'").get() as { source_id: string | null }).source_id).toBeNull()
    const r2 = bucket(['sources/org_owner/upload-h/original.pdf', 'sources/org_owner/upload-h/text.md'])
    await purgeDeleted({ ...deps(), bucket: r2 }, new Date(clock + 3 * UNDO_SECONDS * 1000))
    expect(r2.objects.size).toBe(0)
  })

  it('ويعود بـ«تراجَع» ومعه وصلُ منشوراته', async () => {
    db.raw.exec(`INSERT INTO sources (id, drive_file_id, name, mime, content_hash, kind) VALUES ('s1', 'url:x', 'صفحة', 'text/html', 'h', 'url')`)
    seedPost('p1')
    db.raw.exec(`UPDATE posts SET source_id = 's1' WHERE id = 'p1'`)
    const out = await trashSource(deps(), 'org_owner', 's1')
    expect((await restoreTrash(deps(), 'org_owner', out.ok ? out.token : '')).ok).toBe(true)
    expect((db.raw.prepare("SELECT source_id FROM posts WHERE id = 'p1'").get() as { source_id: string }).source_id).toBe('s1')
  })

  it('**وملفُّ Drive لا يُحذف ما دام في المجلّد** — وإلّا عاد في المسح التالي وحُلّل بكلفة', async () => {
    db.raw.exec(`INSERT INTO sources (id, drive_file_id, name, mime, content_hash, last_seen_at)
      VALUES ('d1', 'drive-1', 'في المجلّد', 'text/plain', 'h', datetime('now', '-1 minutes')),
             ('d2', 'drive-2', 'غاب عنه', 'text/plain', 'h', datetime('now', '-3 days'))`)
    // ‏قبل أيّ مسحٍ لا يُعرف أغاب أم لا
    expect((await trashSource(deps(), 'org_owner', 'd2')).ok).toBe(false)
    db.raw.exec(`INSERT INTO heartbeats (job, at, outcome) VALUES ('scan', datetime('now'), 'ok')`)
    const present = await trashSource(deps(), 'org_owner', 'd1')
    expect(present.ok ? '' : present.reason).toContain('مجلّد Drive')
    expect((await trashSource(deps(), 'org_owner', 'd2')).ok).toBe(true)
  })

  it('ولا يُحذف مصدرُ عميلٍ من غيره', async () => {
    db.raw.exec(`INSERT INTO sources (id, drive_file_id, name, mime, content_hash, kind, org_id) VALUES ('sb', 'url:b', 'ب', 'text/html', 'h', 'url', 'org_b')`)
    expect((await trashSource(deps(), 'org_owner', 'sb')).ok).toBe(false)
    expect(count('SELECT COUNT(*) AS n FROM sources')).toBe(1)
  })
})

describe('المقطع وصورةُ الأصول', () => {
  it('المقطعُ يُحذف ومنشوراتُه تبقى بمقطعها، فبايتاتُه تبقى ما بقيت', async () => {
    db.raw.exec(`INSERT INTO uploads (id, r2_key, name, mime, bytes, status) VALUES ('u1', 'upload/u1.mp4', 'مقطع', 'video/mp4', 100, 'ready'),
      ('u2', 'upload/u2.mp4', 'يُرفع', 'video/mp4', 100, 'uploading')`)
    seedPost('p1')
    db.raw.exec(`INSERT INTO media (id, post_id, r2_key, mime, bytes, prompt, model, idempotency_key, upload_id)
      VALUES ('m1', 'p1', 'upload/u1.mp4', 'video/mp4', 100, '', 'upload', 'mk', 'u1')`)
    const stuck = await trashUpload(deps(), 'org_owner', 'u2')
    expect(stuck.ok ? '' : stuck.reason).toContain('ألغِه')
    const out = await trashUpload(deps(), 'org_owner', 'u1')
    expect(out.ok).toBe(true)
    expect((db.raw.prepare("SELECT upload_id FROM media WHERE id = 'm1'").get() as { upload_id: string | null }).upload_id).toBeNull()
    const r2 = bucket(['upload/u1.mp4'])
    await purgeDeleted({ ...deps(), bucket: r2 }, new Date(clock + 3 * UNDO_SECONDS * 1000))
    expect(r2.objects.has('upload/u1.mp4')).toBe(true)
  })

  it('والمقطعُ يعود بـ«تراجَع» ومعه وصلُ صوره', async () => {
    db.raw.exec(`INSERT INTO uploads (id, r2_key, name, mime, bytes, status) VALUES ('u1', 'upload/u1.mp4', 'مقطع', 'video/mp4', 100, 'ready')`)
    seedPost('p1')
    db.raw.exec(`INSERT INTO media (id, post_id, r2_key, mime, bytes, prompt, model, idempotency_key, upload_id)
      VALUES ('m1', 'p1', 'upload/u1.mp4', 'video/mp4', 100, '', 'upload', 'mk', 'u1')`)
    const out = await trashUpload(deps(), 'org_owner', 'u1')
    expect((await restoreTrash(deps(), 'org_owner', out.ok ? out.token : '')).ok).toBe(true)
    expect((db.raw.prepare("SELECT upload_id FROM media WHERE id = 'm1'").get() as { upload_id: string }).upload_id).toBe('u1')
  })

  it('**ولا يُحذف مقطعُ عميلٍ من غيره، ولا تُقطع صورُه** — ولا يُقيَّد مفتاحُه للمحو', async () => {
    db.raw.exec(`INSERT INTO uploads (id, r2_key, name, mime, bytes, status, org_id) VALUES ('ub', 'org/org_b/upload/ub.mp4', 'مقطع ب', 'video/mp4', 100, 'ready', 'org_b')`)
    seedPost('pb', 'org_b')
    db.raw.exec(`INSERT INTO media (id, post_id, r2_key, mime, bytes, prompt, model, idempotency_key, upload_id, org_id)
      VALUES ('mb', 'pb', 'org/org_b/upload/ub.mp4', 'video/mp4', 100, '', 'upload', 'mkb', 'ub', 'org_b')`)
    const out = await trashUpload(deps(), 'org_owner', 'ub')
    expect(out.ok ? '' : out.reason).toContain('لم أجد')
    expect(count("SELECT COUNT(*) AS n FROM uploads WHERE id = 'ub'")).toBe(1)
    expect((db.raw.prepare("SELECT upload_id FROM media WHERE id = 'mb'").get() as { upload_id: string }).upload_id).toBe('ub')
    const r2 = bucket(['org/org_b/upload/ub.mp4'])
    await purgeDeleted({ ...deps(), bucket: r2 }, new Date(clock + 3 * UNDO_SECONDS * 1000))
    expect(r2.objects.has('org/org_b/upload/ub.mp4')).toBe(true)
  })

  it('صورةُ الأصول تُحذف وتُمحى بايتاتُها بعد المهلة، ولا تُحذف من عميلٍ آخر', async () => {
    db.raw.exec(`INSERT INTO library_files (id, org_id, r2_key, name, mime, bytes) VALUES
      ('f1', 'org_owner', 'library/org_owner/f1.png', 'شعار', 'image/png', 9),
      ('fb', 'org_b', 'library/org_b/fb.png', 'شعار ب', 'image/png', 9)`)
    expect((await trashLibraryFile(deps(), 'org_owner', 'fb')).ok).toBe(false)
    expect((await trashLibraryFile(deps(), 'org_owner', 'f1')).ok).toBe(true)
    const r2 = bucket(['library/org_owner/f1.png', 'library/org_b/fb.png'])
    await purgeDeleted({ ...deps(), bucket: r2 }, new Date(clock + 3 * UNDO_SECONDS * 1000))
    expect([...r2.objects]).toEqual(['library/org_b/fb.png'])
    expect(count('SELECT COUNT(*) AS n FROM library_files')).toBe(1)
  })
})

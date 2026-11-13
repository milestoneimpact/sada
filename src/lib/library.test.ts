import { describe, expect, it } from 'vitest'
import { fakeDb } from '../test/fakes'
import { attachStatement, findAsset, folderOf, libraryProblem, listLibrary, parseRef, rawObject } from './library'

function seed() {
  const db = fakeDb()
  db.raw.exec(`INSERT INTO posts (id, platform, type, text, status, idempotency_key, org_id) VALUES ('p1', 'x', 'text', 'نص', 'draft', 'k1', 'org_owner')`)
  db.raw.exec(`INSERT INTO posts (id, platform, type, text, status, idempotency_key, org_id) VALUES ('p2', 'x', 'text', 'نص', 'draft', 'k2', 'org_owner')`)
  db.raw.exec(`INSERT INTO media (id, post_id, r2_key, mime, bytes, prompt, model, idempotency_key, created_at, org_id)
    VALUES ('m1', 'p1', 'img/a.png', 'image/png', 900, 'وصف', 'flux', 'mk1', '2026-10-02 10:00:00', 'org_owner')`)
  db.raw.exec(`INSERT INTO library_files (id, org_id, r2_key, name, mime, bytes, created_at)
    VALUES ('f1', 'org_owner', 'library/o/f1.png', 'شعار.png', 'image/png', 500, '2026-09-10 08:00:00'),
           ('f2', 'org_b', 'library/b/f2.png', 'غيره.png', 'image/png', 500, '2026-09-10 08:00:00')`)
  db.raw.exec(`INSERT INTO sources (id, drive_file_id, name, mime, content_hash, last_seen_at, org_id)
    VALUES ('src:abcdefgh12', 'abcdefgh12', 'تقرير', 'application/vnd.google-apps.document', 'md5:a', '2026-10-05 00:00:00', 'org_owner')`)
  return db
}

describe('أصولُ العميل (D-260)', () => {
  it('المرجعُ حرفٌ ومعرّف، وغيرُه مرفوض', () => {
    expect(parseRef('m:abc')).toEqual({ tag: 'm', id: 'abc' })
    expect(parseRef('s:src:abc')).toEqual({ tag: 's', id: 'src:abc' })
    expect(parseRef('z:abc')).toBeNull()
    expect(parseRef("m:a' OR 1")).toBeNull()
  })

  it('التصنيف: النوعُ › المنشأ › الشهر', () => {
    expect(folderOf({ kind: 'image', origin: 'generated', at: '2026-10-02 10:00:00' })).toBe('صور › مولَّدة › 2026-10')
    expect(folderOf({ kind: 'doc', origin: 'drive', at: '2026-09-01 00:00:00' })).toBe('ملفّات › من Drive › 2026-09')
  })

  it('الأنهارُ الأربعة بمنظّمتها، أحدثُها أوّلًا — وأصلُ عميلٍ آخر لا يُرى ولا يُوجد', async () => {
    const db = seed()
    const list = await listLibrary(db, 'org_owner')
    expect(list.map((a) => a.ref)).toEqual(['s:src:abcdefgh12', 'm:m1', 'f:f1'])
    expect(list[0]!.drive).toContain('drive.google.com')
    expect(await findAsset(db, 'org_owner', 'f:f2')).toBeNull()
    expect(await findAsset(db, 'org_b', 'f:f2')).toMatchObject({ kind: 'image', origin: 'upload' })
    expect(await rawObject(db, 'org_owner', 'f:f1')).toEqual({ key: 'library/o/f1.png', mime: 'image/png' })
    expect(await rawObject(db, 'org_owner', 'f:f2')).toBeNull()
  })

  it('الربطُ صفٌّ على الكائن نفسِه بلا كلفة، ومرّةً واحدة، ولا يعبر المنظّمة', async () => {
    const db = seed()
    await attachStatement(db, 'org_owner', 'p2', 'm:m1')!.run()
    await attachStatement(db, 'org_owner', 'p2', 'm:m1')!.run()
    await attachStatement(db, 'org_owner', 'p2', 'f:f2')!.run()
    const rows = db.raw.prepare("SELECT r2_key, cost_usd, model FROM media WHERE post_id = 'p2'").all()
    expect(rows).toEqual([{ r2_key: 'img/a.png', cost_usd: 0, model: 'library' }])
    expect(attachStatement(db, 'org_owner', 'p2', 's:src:abcdefgh12')).toBeNull()
    // ‏والصورةُ المعادةُ لا تظهر في الأصول مرّتين
    expect((await listLibrary(db, 'org_owner')).filter((a) => a.origin === 'generated')).toHaveLength(1)
  })

  it('صورةُ الرفع بنوعها وحجمها', () => {
    expect(libraryProblem('image/png', 1000)).toBeNull()
    expect(libraryProblem('video/mp4', 1000)).toContain('فيديوهاتك')
    expect(libraryProblem('image/png', 6 * 1024 * 1024)).toContain('5MB')
  })
})

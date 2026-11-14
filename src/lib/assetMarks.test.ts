/** علاماتُ الأصل (D-347): الوسومُ تُقلَّم، والبحثُ بالاسم والوسم والمفضّلة، والعلامةُ بمنظّمتها ولكائنها. */
import { beforeEach, describe, expect, it } from 'vitest'
import { fakeDb, type FakeDb } from '../test/fakes'
import { cleanTags, listLibrary, markAsset, searchAssets, MAX_TAGS, type Asset } from './library'

let db: FakeDb
beforeEach(() => {
  db = fakeDb()
  db.raw.exec(`INSERT INTO library_files (id, org_id, r2_key, name, mime, bytes) VALUES ('f1', 'org_owner', 'lib/one', 'شعار.png', 'image/png', 5), ('f2', 'org_owner', 'lib/two', 'غلاف.png', 'image/png', 5)`)
})
const asset = async (ref: string): Promise<Asset> => (await listLibrary(db, 'org_owner')).find((a) => a.ref === ref)!

describe('علاماتُ الأصل (D-347)', () => {
  it('الوسومُ تُقلَّم: بلا «#» ولا مكرَّرٍ ولا فارغ، بفاصلةٍ عربيّةٍ أو لاتينيّة، وحدُّها ثمانية', () => {
    expect(cleanTags(' #هويّة ، شعار,شعار,, حملة  الصيف ')).toEqual(['هويّة', 'شعار', 'حملة الصيف'])
    expect(cleanTags(Array.from({ length: 12 }, (_, i) => 't' + String(i)).join(','))).toHaveLength(MAX_TAGS)
    expect(cleanTags('x'.repeat(60))[0]).toHaveLength(24)
  })

  it('«فضّلها» ثمّ «احفظ الوسوم»: كلٌّ يبقي الآخر، والمكتبةُ تقرؤهما على الأصل', async () => {
    expect((await asset('f:f1')).favourite).toBe(false)
    expect(await markAsset(db, 'org_owner', 'f:f1', { favourite: true })).toEqual({ ok: true })
    expect(await markAsset(db, 'org_owner', 'f:f1', { tags: 'هويّة، شعار' })).toEqual({ ok: true })
    const a = await asset('f:f1')
    expect(a.favourite).toBe(true)
    expect(a.tags).toEqual(['هويّة', 'شعار'])
    await markAsset(db, 'org_owner', 'f:f1', { favourite: false })
    expect((await asset('f:f1')).tags).toEqual(['هويّة', 'شعار'])
    expect((db.raw.prepare('SELECT COUNT(*) AS n FROM asset_marks').get() as { n: number }).n).toBe(1)
  })

  it('مرجعُ منظّمةٍ أخرى، ومصدرُ Drive، ومرجعٌ لا وجودَ له — لا تُعلَّم ولا صفَّ يُكتب', async () => {
    expect((await markAsset(db, 'org_other', 'f:f1', { favourite: true })).ok).toBe(false)
    expect((await markAsset(db, 'org_owner', 's:anything', { favourite: true })).ok).toBe(false)
    expect((await markAsset(db, 'org_owner', 'f:nope', { tags: 'x' })).ok).toBe(false)
    expect((db.raw.prepare('SELECT COUNT(*) AS n FROM asset_marks').get() as { n: number }).n).toBe(0)
  })

  it('البحثُ بالاسم أو بالوسم، والمفضّلةُ وحدَها', async () => {
    await markAsset(db, 'org_owner', 'f:f2', { favourite: true, tags: 'حملة الصيف' })
    const all = await listLibrary(db, 'org_owner')
    expect(searchAssets(all, 'شعار', false).map((a) => a.ref)).toEqual(['f:f1'])
    expect(searchAssets(all, 'الصيف', false).map((a) => a.ref)).toEqual(['f:f2'])
    expect(searchAssets(all, '', true).map((a) => a.ref)).toEqual(['f:f2'])
    expect(searchAssets(all, 'لا شيء', false)).toEqual([])
  })
})

/** الصورةُ الآليّة واختيارُ الخطّة (D-282): اختيارُ الخطّة يغلب الإعدادَ العامّ، والسقفُ والإيقافُ فوقهما. */
import { describe, expect, it } from 'vitest'
import { fakeDb } from '../../test/fakes'
import { writeSetting } from '../settings'
import { autoImageRoom } from './auto'

describe('autoImageRoom باختيار الخطّة', () => {
  it('الإعدادُ مطفأٌ والخطّةُ تريد: يُرسَم بما بقي من السقف — والخطّةُ لا تريد: لا يُرسَم ولو كان مرفوعًا', async () => {
    const db = fakeDb()
    await writeSetting(db, 'auto_image', 'false', 'test')
    await writeSetting(db, 'daily_image_cap', '3', 'test')
    expect(await autoImageRoom(db, 'org_owner')).toBe(0)
    expect(await autoImageRoom(db, 'org_owner', true)).toBe(3)
    await writeSetting(db, 'auto_image', 'true', 'test')
    expect(await autoImageRoom(db, 'org_owner')).toBe(3)
    expect(await autoImageRoom(db, 'org_owner', false)).toBe(0)
    // ‏والإيقافُ فوق الاثنين
    await writeSetting(db, 'paused', 'true', 'test')
    expect(await autoImageRoom(db, 'org_owner', true)).toBe(0)
  })
})

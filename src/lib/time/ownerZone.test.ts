import { beforeEach, describe, expect, it } from 'vitest'
import { fakeDb, type FakeDb } from '../../test/fakes'
import { ownerZone, storedZone, ZONE_SETTING } from './ownerZone'
import { readSettings } from '../settings'

let db: FakeDb
beforeEach(() => {
  db = fakeDb()
})

describe('منطقة المالك المحفوظة (D-200)', () => {
  it('أوّل زيارة حقًّا: لا كعكة ولا محفوظ فـ null', async () => {
    expect(await ownerZone(db, null)).toBeNull()
    expect(await storedZone(db)).toBeNull()
  })

  it('الكعكة تُحفظ، ثمّ تُقرأ حين تغيب', async () => {
    expect(await ownerZone(db, 'sada_tz=Asia%2FRiyadh')).toBe('Asia/Riyadh')
    expect(await storedZone(db)).toBe('Asia/Riyadh')
    expect(await ownerZone(db, null)).toBe('Asia/Riyadh')
    expect(await ownerZone(db, 'a=1')).toBe('Asia/Riyadh')
  })

  it('والكعكة تغلب المحفوظ وتكتب فوقه — مالك سافر', async () => {
    await ownerZone(db, 'sada_tz=Asia%2FRiyadh')
    expect(await ownerZone(db, 'sada_tz=Europe%2FLondon')).toBe('Europe/London')
    expect(await ownerZone(db, null)).toBe('Europe/London')
  })

  it('وكعكة فاسدة لا تُحفظ ولا تمحو المحفوظ', async () => {
    await ownerZone(db, 'sada_tz=Asia%2FRiyadh')
    expect(await ownerZone(db, 'sada_tz=Mars%2FOlympus')).toBe('Asia/Riyadh')
    expect(await storedZone(db)).toBe('Asia/Riyadh')
  })

  it('ومحفوظ فاسد يُقرأ null لا منطقةً كاذبة', async () => {
    await db.prepare("INSERT INTO settings (key, value, updated_by) VALUES (?, 'Not/AZone', 'x')").bind(ZONE_SETTING).run()
    expect(await ownerZone(db, null)).toBeNull()
  })

  it('ولا تُفسد الإعدادات التشغيليّة', async () => {
    await ownerZone(db, 'sada_tz=Asia%2FRiyadh')
    expect((await readSettings(db)).paused).toBe(false)
  })
})

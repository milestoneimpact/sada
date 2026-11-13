/**
 * ‏أولويّةُ المفتاح (D-346): الخزانةُ أوّلًا، وسرُّ Worker يسدّ الغيابَ وحده.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { fakeDb, type FakeDb } from '../test/fakes'
import { resolveKey, saveKey, setEnabled } from './providers'

let db: FakeDb
const encKey = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)))

beforeEach(() => {
  db = fakeDb()
})

describe('resolveKey — الخزانة أوّلًا', () => {
  it('مفتاحُ الخزانة يغلب سرَّ Worker القديم', async () => {
    await saveKey(db, encKey, 'anthropic', 'sk-ant-vault', 'test')
    const out = await resolveKey(db, encKey, 'anthropic', 'sk-ant-stale')
    expect(out).toEqual({ key: 'sk-ant-vault', source: 'vault' })
  })

  it('خزانةٌ خالية: سرُّ Worker احتياطًا', async () => {
    const out = await resolveKey(db, encKey, 'anthropic', 'sk-ant-secret')
    expect(out).toEqual({ key: 'sk-ant-secret', source: 'worker_secret' })
  })

  it('مزوّدٌ معطَّل في الخزانة: لا يُفكّ مفتاحه، والسرُّ يسدّ', async () => {
    await saveKey(db, encKey, 'anthropic', 'sk-ant-vault', 'test')
    await setEnabled(db, 'anthropic', false, 'test')
    const out = await resolveKey(db, encKey, 'anthropic', 'sk-ant-secret')
    expect(out.source).toBe('worker_secret')
  })

  it('مفتاحُ تشفيرٍ آخر لا يفكّ: السرُّ يسدّ، ولا شيءَ بلا سرّ', async () => {
    await saveKey(db, encKey, 'anthropic', 'sk-ant-vault', 'test')
    const other = btoa(String.fromCharCode(...new Uint8Array(32).fill(9)))
    expect((await resolveKey(db, other, 'anthropic', 'sk-x')).source).toBe('worker_secret')
    expect(await resolveKey(db, other, 'anthropic', undefined)).toEqual({ key: null, source: 'none' })
  })
})

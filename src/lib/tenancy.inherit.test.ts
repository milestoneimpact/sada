/**
 * **ما تكتبه المجدولاتُ يأخذ منظّمةَ أصله** (D-233) — لا يُنسَب إلى المالك
 * لأنّ العاملَ لا جلسةَ له.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { fakeDb, type FakeDb } from '../test/fakes'
import { recordCost } from './cost'

let db: FakeDb

beforeEach(() => {
  db = fakeDb()
  db.raw.exec(`INSERT INTO orgs (id, name, kind) VALUES ('org_b', 'ب', 'team')`)
  db.raw.exec(
    `INSERT INTO posts (id, platform, type, text, status, idempotency_key, org_id)
     VALUES ('p_b', 'x', 'text', 'نصّ', 'draft', 'k_b', 'org_b')`,
  )
})

function orgOf(table: string, where: string): string {
  return (db.raw.prepare(`SELECT org_id FROM ${table} WHERE ${where}`).get() as { org_id: string }).org_id
}

describe('الوراثة', () => {
  it('كلفةُ منشورٍ لمنظّمته، وما لا مرجعَ له للمالك', async () => {
    const owned = await recordCost(db, { provider: 'x', operation: 'publish', units: 1, unitCost: 0.01, refId: 'p_b' })
    const loose = await recordCost(db, { provider: 'x', operation: 'publish', units: 1, unitCost: 0.01 })
    expect(orgOf('cost_ledger', `id = '${owned}'`)).toBe('org_b')
    expect(orgOf('cost_ledger', `id = '${loose}'`)).toBe('org_owner')
  })
})

describe('مسارُ الملفّ (D-235)', () => {
  it('ملفُّ المالك بمساره القائم، وملفُّ غيره تحت سابقته', async () => {
    const { objectKey, orgOfPost } = await import('./tenancy')
    expect(objectKey('org_owner', 'img/p/m.png')).toBe('img/p/m.png')
    expect(objectKey('org_b', 'img/p/m.png')).toBe('org/org_b/img/p/m.png')
    expect(await orgOfPost(db, 'p_b')).toBe('org_b')
    expect(await orgOfPost(db, 'لا-منشور')).toBe('org_owner')
  })
})

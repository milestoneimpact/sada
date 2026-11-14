import { describe, expect, it } from 'vitest'
import { fakeDb } from '../test/fakes'
import { portfolioCalendar } from './portfolioCalendar'
import { clientsCalendar } from '../routes/ui/portfolioView'

describe('تقويمُ العملاء (D-354)', () => {
  it('منشوراتُ الشركات المطلوبة وحدها، في الأسبوعين، بحالاتها المجدولة والمنشورة والفاشلة', async () => {
    const db = fakeDb()
    db.raw.exec(`INSERT INTO orgs (id, name, kind) VALUES ('org_a', 'عميل أ', 'team'), ('org_b', 'عميل ب', 'team'), ('org_c', 'عميل ج', 'team')`)
    db.raw.exec(`INSERT INTO accounts (id, platform, kind, external_id, display_name, status) VALUES ('acc', 'x', 'member', 'e', 'ح', 'active')`)
    db.raw.exec(`INSERT INTO posts (id, org_id, platform, type, text, status, idempotency_key, scheduled_at, approved_by, approved_at, account_id) VALUES
      ('a1', 'org_a', 'linkedin', 'text', 'نصّ أ', 'queued', 'ka1', '2099-01-05 09:00:00', 'owner', '2099-01-01 00:00:00', 'acc'),
      ('b1', 'org_b', 'x', 'text', 'نصّ ب', 'failed', 'kb1', '2099-01-05 12:00:00', 'owner', '2099-01-01 00:00:00', 'acc'),
      ('b2', 'org_b', 'x', 'text', 'مسوّدة', 'draft', 'kb2', '2099-01-06 12:00:00', 'owner', '2099-01-01 00:00:00', 'acc'),
      ('b3', 'org_b', 'x', 'text', 'بعيد', 'queued', 'kb3', '2099-02-20 12:00:00', 'owner', '2099-01-01 00:00:00', 'acc'),
      ('c1', 'org_c', 'x', 'text', 'ليس لك', 'queued', 'kc1', '2099-01-05 10:00:00', 'owner', '2099-01-01 00:00:00', 'acc')`)
    const now = new Date('2099-01-04T08:00:00Z')
    const rows = await portfolioCalendar(db, ['org_a', 'org_b'], now)
    expect(rows.map((r) => r.id)).toEqual(['a1', 'b1'])
    const html = clientsCalendar(rows, [{ id: 'org_a', name: 'عميل أ', kind: 'team', brands: 1 }, { id: 'org_b', name: 'عميل ب', kind: 'team', brands: 1 }], now, null)
    expect(html).toContain('عميل أ')
    expect(html).toContain('data-st="failed"')
    expect(html).toContain('2 منشورًا')
    expect(await portfolioCalendar(db, [], now)).toEqual([])
  })
})

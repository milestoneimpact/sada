import { beforeEach, describe, expect, it } from 'vitest'
import { fakeDb, type FakeDb } from '../test/fakes'
import { record, recentAudit, targetLabel } from './audit'

let db: FakeDb

beforeEach(() => {
  db = fakeDb()
})

function request(ip = '203.0.113.5', ua = 'Mozilla/5.0 Chrome/120'): Request {
  return new Request('https://sada2.basserh.com/panel/settings', {
    method: 'POST',
    headers: { 'CF-Connecting-IP': ip, 'User-Agent': ua },
  })
}

describe('record', () => {
  it('يكتب الصفّ بكلّ حقوله', async () => {
    await record(db, { actor: 'panel', action: 'settings.write', target: 'paused', detail: '← true' }, request())
    const rows = await recentAudit(db, 'org_owner')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      actor: 'panel',
      action: 'settings.write',
      target: 'paused',
      detail: '← true',
      ip: '203.0.113.5',
    })
  })

  it('يعمل بلا طلب — نداء Cron لا ترويسات له', async () => {
    await record(db, { actor: 'cron', action: 'drive.scan' })
    expect((await recentAudit(db, 'org_owner'))[0]?.ip).toBeNull()
  })

  it('**لا يرمي حين يتعذّر الكتابة** — الفعل وقع، والسجلّ وحده ناقص', async () => {
    db.raw.exec('DROP TABLE audit_log')
    await expect(record(db, { actor: 'panel', action: 'settings.write' })).resolves.toBeUndefined()
  })

  // ترويسات HTTP لاتينيّة‑١: نصٌّ عربيّ فيها يرمي عند بناء `Request` نفسه
  it('يقصّ ترويسةً طويلة فلا تملأ الجدول', async () => {
    await record(db, { actor: 'panel', action: 'x' }, request('1.1.1.1', 'A'.repeat(500)))
    expect((await recentAudit(db, 'org_owner'))[0]).toBeDefined()
    const { results } = await db.prepare('SELECT ua FROM audit_log').all<{ ua: string }>()
    expect(results[0]!.ua.length).toBeLessThanOrEqual(160)
  })
})

describe('recentAudit', () => {
  it('الأحدث أوّلا', async () => {
    for (const action of ['أوّل', 'ثان', 'ثالث']) {
      await record(db, { actor: 'panel', action })
    }
    expect((await recentAudit(db, 'org_owner')).map((r) => r.action)).toEqual(['ثالث', 'ثان', 'أوّل'])
  })

  it('يحترم الحدّ ويقصّه إلى مدى معقول', async () => {
    for (let i = 0; i < 10; i += 1) await record(db, { actor: 'panel', action: `a${i}` })
    expect(await recentAudit(db, 'org_owner', 3)).toHaveLength(3)
    expect(await recentAudit(db, 'org_owner', 0)).toHaveLength(1)
    expect(await recentAudit(db, 'org_owner', 9999)).toHaveLength(10)
  })

  it('جدول لا يُقرأ يعطي قائمةً فارغة ولا يُسقط اللوحة', async () => {
    db.raw.exec('DROP TABLE audit_log')
    expect(await recentAudit(db, 'org_owner')).toEqual([])
  })
})

describe('targetLabel (D-134)', () => {
  it('مفتاح الإعداد اسم، والمزوّد اسمُه، والمنصّة اسمُها، وما سواها بحرفه', () => {
    expect(targetLabel('dashboard_tiles')).toBe('بطاقات اللوح')
    expect(targetLabel('anthropic')).toBe('Anthropic')
    expect(targetLabel('linkedin')).toBe('LinkedIn')
    expect(targetLabel('draft-42')).toBe('draft-42')
  })
})

/**
 * نبضُ التشغيل (D-158) — **صفٌّ لكلّ دورة، والأحدثُ يستبدل الأقدم.**
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { fakeDb, type FakeDb } from '../../test/fakes'
import { beat, pulses, readHeartbeats, type Heartbeat } from './heartbeat'

let db: FakeDb
beforeEach(() => {
  db = fakeDb()
})

describe('beat', () => {
  it('يكتب صفًّا ويستبدله في النبضة التالية', async () => {
    await beat(db, 'renew', 'ok', 'لا مستحقّ')
    await beat(db, 'renew', 'failed', 'رُدّ 401')
    const rows = await readHeartbeats(db)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ job: 'renew', outcome: 'failed', detail: 'رُدّ 401' })
  })

  it('التفصيل الفارغ يُحفَظ NULL، والطويل يُقصّ عند 200', async () => {
    await beat(db, 'dispatch', 'ok')
    await beat(db, 'scan', 'ok', 'x'.repeat(500))
    const rows = await readHeartbeats(db)
    expect(rows.find((r) => r.job === 'dispatch')?.detail).toBeNull()
    expect(rows.find((r) => r.job === 'scan')?.detail).toHaveLength(200)
  })

  it('قاعدة بلا جدول لا تُسقط الدورة', async () => {
    db.raw.exec('DROP TABLE heartbeats')
    await expect(beat(db, 'renew', 'ok')).resolves.toBeUndefined()
    expect(await readHeartbeats(db)).toEqual([])
  })
})

describe('pulses', () => {
  const now = new Date('2026-09-27T12:00:00Z')
  const at = (minutesAgo: number): string =>
    new Date(now.getTime() - minutesAgo * 60_000).toISOString().slice(0, 19).replace('T', ' ')
  const b = (job: Heartbeat['job'], minutesAgo: number, outcome: Heartbeat['outcome'] = 'ok'): Heartbeat =>
    ({ job, at: at(minutesAgo), outcome, detail: null })

  it('في موعدها حتّى ضعف مدّتها، ومتأخّرة بعده', () => {
    const p = pulses([b('renew', 20), b('dispatch', 45)], now)
    expect(p.find((x) => x.job === 'renew')?.state).toBe('ok')
    const late = p.find((x) => x.job === 'dispatch')!
    expect(late.state).toBe('late')
    expect(late.lateBy).toBe(15 * 60)
  })

  it('الساقطة ساقطة ولو كانت في موعدها، والغائبة «لم تدُر»', () => {
    const p = pulses([b('metrics', 1, 'failed')], now)
    expect(p.find((x) => x.job === 'metrics')?.state).toBe('failed')
    expect(p.find((x) => x.job === 'report')?.state).toBe('never')
  })

  it('النشر بلا موعد: لا يتأخّر أبدًا', () => {
    const p = pulses([b('publish', 60 * 24 * 30)], now)
    expect(p.find((x) => x.job === 'publish')?.state).toBe('ok')
  })

  it('الترتيب ثابت بسبع دورات', () => {
    expect(pulses([], now).map((x) => x.job)).toEqual(['renew', 'dispatch', 'publish', 'metrics', 'scan', 'alerts', 'report'])
  })
})

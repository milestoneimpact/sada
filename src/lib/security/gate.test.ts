import { describe, expect, it } from 'vitest'
import { fakeDb } from '../../test/fakes'
import { releaseAttempt, reserveAttempt, reserveChallenge, MAX_CHALLENGES } from './gate'
import { MAX_ATTEMPTS } from '../rateLimit'

const from = (ip: string): Request => new Request('https://sada2.basserh.com/panel/login', {
  headers: { 'CF-Connecting-IP': ip },
})

describe('بوّابة المحاولات الذرّيّة (D-161)', () => {
  it('المتزامنة تُعَدّ واحدةً واحدة: السادسة تُردّ ولو وصلت الستّ معًا', async () => {
    const db = fakeDb()
    const verdicts = await Promise.all(Array.from({ length: 8 }, () => reserveAttempt(db, from('1.1.1.1'))))
    expect(verdicts.filter((v) => v.allowed)).toHaveLength(MAX_ATTEMPTS)
    expect(verdicts.map((v) => v.count).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('لكلّ عنوان حصّتُه، والجميع سقف فوقها', async () => {
    const db = fakeDb()
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) await reserveAttempt(db, from('1.1.1.1'))
    expect((await reserveAttempt(db, from('1.1.1.1'))).allowed).toBe(false)
    expect((await reserveAttempt(db, from('2.2.2.2'))).allowed).toBe(true)

    for (let i = 0; i < 30; i += 1) await reserveAttempt(db, from(`9.9.9.${i}`))
    expect((await reserveAttempt(db, from('3.3.3.3'))).allowed).toBe(false)
  })

  it('النافذة ربع ساعة من أوّل محاولة، ثمّ يبدأ العدّ من واحد', async () => {
    const db = fakeDb()
    for (let i = 0; i < 6; i += 1) await reserveAttempt(db, from('1.1.1.1'))
    db.raw.prepare("UPDATE auth_attempts SET window_start = datetime('now', '-16 minutes')").run()
    const after = await reserveAttempt(db, from('1.1.1.1'))
    expect(after).toEqual({ allowed: true, count: 1 })
  })

  it('النجاح يعيد ما حجز: العنوان يُمحى، والجميع ينقص واحدًا', async () => {
    const db = fakeDb()
    await reserveAttempt(db, from('1.1.1.1'))
    await reserveAttempt(db, from('1.1.1.1'))
    await releaseAttempt(db, from('1.1.1.1'))
    const rows = db.raw.prepare('SELECT bucket, n FROM auth_attempts ORDER BY bucket').all()
    expect(rows).toEqual([{ bucket: 'global', n: 1 }])
  })

  it('إصدار التحدّيات حصّة منفصلة لا تأكل من محاولات الدخول', async () => {
    const db = fakeDb()
    for (let i = 0; i < MAX_CHALLENGES; i += 1) {
      expect((await reserveChallenge(db, from('1.1.1.1'))).allowed).toBe(true)
    }
    expect((await reserveChallenge(db, from('1.1.1.1'))).allowed).toBe(false)
    expect((await reserveAttempt(db, from('1.1.1.1'))).allowed).toBe(true)
  })

  it('جدول غائب لا يقفل الباب: يعود إلى حدّ KV كما كان', async () => {
    const db = fakeDb()
    db.raw.exec('DROP TABLE auth_attempts')
    expect(await reserveAttempt(db, from('1.1.1.1'))).toEqual({ allowed: true, count: 0 })
  })
})

import { describe, expect, it } from 'vitest'
import { fakeDb } from '../../test/fakes'
import {
  releaseAttempt, releaseCodeGuesses, reserveAttempt, reserveChallenge, reserveCodeGuess,
  MAX_CHALLENGES, MAX_CODE_GUESSES_PER_DAY,
} from './gate'
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

describe('سقفُ التخمين على رمز البريد في اليوم (D-247)', () => {
  const owner = 'milestonesimpact@gmail.com'

  it('عشرٌ في اليوم ولو تبدّلت العناوين، ثمّ يُغلق باب الرمز', async () => {
    const db = fakeDb()
    const verdicts = await Promise.all(
      Array.from({ length: MAX_CODE_GUESSES_PER_DAY + 3 }, () => reserveCodeGuess(db, owner)),
    )
    expect(verdicts.filter((v) => v.allowed)).toHaveLength(MAX_CODE_GUESSES_PER_DAY)
  })

  it('النافذة يوم كامل لا ربع ساعة', async () => {
    const db = fakeDb()
    for (let i = 0; i < MAX_CODE_GUESSES_PER_DAY; i += 1) await reserveCodeGuess(db, owner)
    db.raw.prepare("UPDATE auth_attempts SET window_start = datetime('now', '-16 minutes')").run()
    expect((await reserveCodeGuess(db, owner)).allowed).toBe(false)
    db.raw.prepare("UPDATE auth_attempts SET window_start = datetime('now', '-25 hours')").run()
    expect(await reserveCodeGuess(db, owner)).toEqual({ allowed: true, count: 1 })
  })

  it('الدخولُ الناجح يمحو عدَّ يومه', async () => {
    const db = fakeDb()
    await reserveCodeGuess(db, owner)
    await releaseCodeGuesses(db, owner)
    expect((await reserveCodeGuess(db, owner)).count).toBe(1)
  })
})

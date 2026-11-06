import { describe, expect, it } from 'vitest'
import { fakeDb } from '../../test/fakes'
import {
  releaseAttempt, releaseCodeGuesses, releaseFactorGuess, reserveAttempt, reserveChallenge, reserveCodeGuess,
  reserveFactorGuess, MAX_ACCOUNT_CODE_GUESSES_PER_DAY, MAX_CHALLENGES, MAX_CODE_GUESSES_PER_DAY,
  MAX_FACTOR_GUESSES_PER_DAY, MAX_FACTOR_GUESSES_PER_SESSION,
} from './gate'
import { ipBucket, MAX_ATTEMPTS, MAX_GLOBAL_ATTEMPTS } from '../rateLimit'

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

  it('لكلّ عنوان حصّتُه، والجميع قاطعُ دائرةٍ فوقها', async () => {
    const db = fakeDb()
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) await reserveAttempt(db, from('1.1.1.1'))
    expect((await reserveAttempt(db, from('1.1.1.1'))).allowed).toBe(false)
    expect((await reserveAttempt(db, from('2.2.2.2'))).allowed).toBe(true)

    db.raw.prepare(`INSERT INTO auth_attempts (bucket, n, window_start) VALUES ('global', ?, datetime('now'))
      ON CONFLICT(bucket) DO UPDATE SET n = excluded.n`).run(MAX_GLOBAL_ATTEMPTS)
    expect(await reserveAttempt(db, from('3.3.3.3'))).toMatchObject({ allowed: false, why: 'global' })
  })

  /**
   * ‏**D-317 · ثلاثون فشلًا لا تُغلق الدخولَ على الجميع**: كان دلوٌ عامٌّ واحدٌ (ثلاثون في ربع ساعة) يُغلق كلَّ دخول،
   * ‏وستّةُ عناوين تكفي. والآن القاطعُ العامّ ألفٌ، والعنوانُ الذي استنفد حصّتَه لا يُزاد به العامّ.
   */
  it('D-317: ستّةُ عناوين بثلاثين فشلًا لا تُغلق الدخولَ على عنوانٍ سابع', async () => {
    const db = fakeDb()
    for (let ip = 0; ip < 6; ip += 1) for (let i = 0; i < MAX_ATTEMPTS; i += 1) await reserveAttempt(db, from(`9.9.9.${ip}`))
    expect((await reserveAttempt(db, from('7.7.7.7'))).allowed).toBe(true)
  })

  it('D-317: عنوانٌ استنفد حصّتَه لا يحمل إلى القاطع العامّ أكثرَ منها، ولو أرسل ألفًا', async () => {
    const db = fakeDb()
    await Promise.all(Array.from({ length: 200 }, () => reserveAttempt(db, from('1.1.1.1'))))
    expect(db.raw.prepare("SELECT n FROM auth_attempts WHERE bucket = 'global'").get()).toEqual({ n: MAX_ATTEMPTS })
  })

  it('D-317: ‏IPv6 يُعدّ بشبكته /64 — تبديلُ الخانة الأخيرة لا يمنح حصّةً جديدة', async () => {
    expect(ipBucket(from('2001:db8:1:2:aaaa::1'))).toBe('2001:db8:1:2::/64')
    expect(ipBucket(from('2001:0db8:0001:0002:ffff:1:2:3'))).toBe('2001:db8:1:2::/64')
    expect(ipBucket(from('203.0.113.9'))).toBe('203.0.113.9')
    const db = fakeDb()
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) await reserveAttempt(db, from(`2001:db8:1:2::${i + 1}`))
    expect((await reserveAttempt(db, from('2001:db8:1:2::ffff'))).allowed).toBe(false)
    expect((await reserveAttempt(db, from('2001:db8:1:3::1'))).allowed).toBe(true)
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

  /** **وقاعدةٌ لا تردّ تغلق لحظةً لا تفتح** (D-291): ردٌّ بسببه، لا «كثرت المحاولات». */
  it('وقاعدة لا تردّ تردّ المحاولة بسببها ولا تفتح الباب', async () => {
    const db = fakeDb()
    db.raw.exec('DROP TABLE auth_attempts')
    expect(await reserveAttempt(db, from('1.1.1.1'))).toEqual({ allowed: false, count: 0, why: 'db' })
    expect(await reserveCodeGuess(db, 'x@example.com', from('1.1.1.1'))).toEqual({ allowed: false, count: 0, why: 'db' })
  })
})

describe('سقفُ التخمين على رمز البريد في اليوم (D-247 · D-317)', () => {
  const owner = 'milestonesimpact@gmail.com'

  it('عشرٌ في اليوم من المصدر الواحد، ثمّ يُغلق بابُ الرمز عليه وحده', async () => {
    const db = fakeDb()
    const verdicts = await Promise.all(
      Array.from({ length: MAX_CODE_GUESSES_PER_DAY + 3 }, () => reserveCodeGuess(db, owner, from('9.9.9.9'))),
    )
    expect(verdicts.filter((v) => v.allowed)).toHaveLength(MAX_CODE_GUESSES_PER_DAY)
    // ‏‏D-317: كانت هذه العشرُ تُغلق الرمزَ على المالك يومًا كاملًا من أيّ مكان
    expect((await reserveCodeGuess(db, owner, from('1.1.1.1'))).allowed).toBe(true)
  })

  it('وللحساب كلِّه سقفٌ فوقها من كلّ المصادر', async () => {
    const db = fakeDb()
    let allowed = 0
    for (let ip = 0; ip < 5; ip += 1) {
      for (let i = 0; i < MAX_CODE_GUESSES_PER_DAY; i += 1) {
        if ((await reserveCodeGuess(db, owner, from(`9.9.${ip}.1`))).allowed) allowed += 1
      }
    }
    expect(allowed).toBe(MAX_ACCOUNT_CODE_GUESSES_PER_DAY)
    expect(await reserveCodeGuess(db, owner, from('1.1.1.1'))).toMatchObject({ allowed: false, why: 'global' })
  })

  it('النافذة يوم كامل لا ربع ساعة', async () => {
    const db = fakeDb()
    for (let i = 0; i < MAX_CODE_GUESSES_PER_DAY; i += 1) await reserveCodeGuess(db, owner, from('9.9.9.9'))
    db.raw.prepare("UPDATE auth_attempts SET window_start = datetime('now', '-16 minutes')").run()
    expect((await reserveCodeGuess(db, owner, from('9.9.9.9'))).allowed).toBe(false)
    db.raw.prepare("UPDATE auth_attempts SET window_start = datetime('now', '-25 hours')").run()
    expect(await reserveCodeGuess(db, owner, from('9.9.9.9'))).toEqual({ allowed: true, count: 1 })
  })

  it('الدخولُ الناجح يمحو عدَّ مصدره، ولا يمحو عدَّ الحساب من مصادر أخرى', async () => {
    const db = fakeDb()
    for (let i = 0; i < 4; i += 1) await reserveCodeGuess(db, owner, from('9.9.9.9'))
    await reserveCodeGuess(db, owner, from('1.1.1.1'))
    await releaseCodeGuesses(db, owner, from('1.1.1.1'))
    expect((await reserveCodeGuess(db, owner, from('1.1.1.1'))).count).toBe(1)
    expect(db.raw.prepare('SELECT n FROM auth_attempts WHERE bucket = ?').get(`code:${owner}`)).toEqual({ n: 5 })
  })
})

describe('تخمينُ العامل الثاني (D-317)', () => {
  const owner = 'milestonesimpact@gmail.com'

  it('خمسٌ لكلّ جلسةٍ معلَّقة، والسادسةُ تُسقطها', async () => {
    const db = fakeDb()
    for (let i = 0; i < MAX_FACTOR_GUESSES_PER_SESSION; i += 1) {
      expect((await reserveFactorGuess(db, owner, 'h1', from(`9.9.${i}.1`))).allowed).toBe(true)
    }
    expect(await reserveFactorGuess(db, owner, 'h1', from('9.9.9.9'))).toMatchObject({ allowed: false, dropSession: true })
  })

  it('وعشرٌ في اليوم للحساب ولو تبدّلت الجلسات والعناوين', async () => {
    const db = fakeDb()
    let allowed = 0
    for (let i = 0; i < MAX_FACTOR_GUESSES_PER_DAY + 4; i += 1) {
      if ((await reserveFactorGuess(db, owner, `h${i}`, from(`9.9.${i}.1`))).allowed) allowed += 1
    }
    expect(allowed).toBe(MAX_FACTOR_GUESSES_PER_DAY)
  })

  it('والنجاحُ يمحو عدَّ الجلسة ويعيد إلى الحساب محاولتَه', async () => {
    const db = fakeDb()
    await reserveFactorGuess(db, owner, 'h1', from('1.1.1.1'))
    await reserveFactorGuess(db, owner, 'h1', from('1.1.1.1'))
    await releaseFactorGuess(db, owner, 'h1', from('1.1.1.1'))
    expect(db.raw.prepare("SELECT bucket, n FROM auth_attempts WHERE bucket LIKE '2fa%' ORDER BY bucket").all())
      .toEqual([{ bucket: `2fa:${owner}`, n: 1 }])
  })
})

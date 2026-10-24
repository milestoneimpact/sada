import { describe, expect, it } from 'vitest'
import { retryLater } from './index'

function message(attempts: number) {
  const calls: Array<{ delaySeconds?: number } | undefined> = []
  return { attempts, retry(options?: { delaySeconds?: number }) { calls.push(options) }, calls }
}

/** ‏الإعادةُ بتباعد (D-269): لا تُستنفَد المحاولاتُ الثلاث في ثوانٍ. */
describe('retryLater', () => {
  it('يتصاعد بالمحاولة: دقيقة ثمّ خمس ثمّ خمس عشرة', () => {
    for (const [attempts, delay] of [[1, 60], [2, 300], [3, 900], [7, 900]] as const) {
      const m = message(attempts)
      retryLater(m, 'unexpected')
      expect(m.calls).toEqual([{ delaySeconds: delay }])
    }
  })

  it('وانتهاءُ الرمز ينتظر دورةَ تجديدٍ كاملة ولو كانت أوّلَ محاولة', () => {
    const m = message(1)
    retryLater(m, 'token_expired_retry')
    expect(m.calls).toEqual([{ delaySeconds: 900 }])
  })

  it('ومحاولةٌ صفر تُعامَل كالأولى', () => {
    const m = message(0)
    retryLater(m, 'x')
    expect(m.calls).toEqual([{ delaySeconds: 60 }])
  })
})

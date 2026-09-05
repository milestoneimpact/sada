import { beforeEach, describe, expect, it } from 'vitest'
import { fakeKv } from '../test/fakes'
import {
  MAX_ATTEMPTS,
  MAX_GLOBAL_ATTEMPTS,
  WINDOW_SECONDS,
  attemptState,
  clearAttempts,
  delayMs,
  recordFailure,
} from './rateLimit'

let kv: ReturnType<typeof fakeKv>
beforeEach(() => {
  kv = fakeKv()
})

function from(ip: string): Request {
  return new Request('https://sada2.basserh.com/panel/login', {
    method: 'POST',
    headers: { 'CF-Connecting-IP': ip },
  })
}

describe('العدّ', () => {
  it('يبدأ صفرا وغير محظور', async () => {
    const state = await attemptState(kv, from('1.1.1.1'))
    expect(state).toEqual({ blocked: false, attempts: 0, remaining: MAX_ATTEMPTS, globalBlock: false })
  })

  it('يحظر عند بلوغ الحدّ لا بعد تجاوزه', async () => {
    const request = from('1.1.1.1')
    for (let i = 1; i < MAX_ATTEMPTS; i += 1) {
      expect((await recordFailure(kv, request)).blocked).toBe(false)
    }
    expect((await recordFailure(kv, request)).blocked).toBe(true)
  })

  it('يعدّ كلّ عنوان على حدة — فلا يحجب مخمّنٌ المالكَ', async () => {
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) await recordFailure(kv, from('9.9.9.9'))
    expect((await attemptState(kv, from('9.9.9.9'))).blocked).toBe(true)
    expect((await attemptState(kv, from('1.1.1.1'))).blocked).toBe(false)
  })

  it('غياب ترويسة Cloudflare يُعدّ لا يُترك بلا عدّ', async () => {
    const bare = new Request('https://sada2.basserh.com/panel/login', { method: 'POST' })
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) await recordFailure(kv, bare)
    expect((await attemptState(kv, bare)).blocked).toBe(true)
  })

  it('النجاح يمحو العدّ — مَن أخطأ ثمّ أصاب لا يُحاسَب', async () => {
    const request = from('1.1.1.1')
    await recordFailure(kv, request)
    await recordFailure(kv, request)
    await clearAttempts(kv, request)
    expect((await attemptState(kv, request)).attempts).toBe(0)
  })

  it('للعدّ مهلةٌ تنتهي وحدها — لا جدول ينمو ولا صفوف تُنظَّف', async () => {
    await recordFailure(kv, from('1.1.1.1'))
    expect(kv.ttlOf('login-attempts:1.1.1.1')).toBe(WINDOW_SECONDS)
  })
})

describe('التأخير المتصاعد', () => {
  it('لا تأخير في المحاولة الأولى — المالك المصيب لا ينتظر', () => {
    expect(delayMs(0)).toBe(0)
    expect(delayMs(1)).toBe(0)
  })

  it('يتصاعد ثمّ يبلغ سقفا — فلا يُعلَّق الطلب إلى الأبد', () => {
    expect(delayMs(2)).toBeGreaterThan(0)
    expect(delayMs(3)).toBeGreaterThan(delayMs(2))
    expect(delayMs(50)).toBe(2000)
  })
})

describe('السقف العامّ — ما يمنع الحملة الموزّعة', () => {
  it('محاولاتٌ من عناوين شتّى لا يوقفها سقف العنوان، ويوقفها العامّ', async () => {
    // كلّ عنوانٍ يخطئ مرّتين: دون سقفه بكثير، وفوق السقف العامّ مجتمعا
    for (let i = 0; i < MAX_GLOBAL_ATTEMPTS / 2; i += 1) {
      const ip = `198.51.100.${i}`
      await recordFailure(kv, from(ip))
      await recordFailure(kv, from(ip))
    }
    const fresh = await attemptState(kv, from('203.0.113.77'))
    expect(fresh.attempts).toBe(0)
    expect(fresh.globalBlock).toBe(true)
    expect(fresh.blocked).toBe(true)
  })

  it('نجاحُ الدخول لا يُصفّر العدّ العامّ — وإلّا صار أداةً تُنعش الحملة', async () => {
    for (let i = 0; i < MAX_GLOBAL_ATTEMPTS; i += 1) {
      await recordFailure(kv, from(`198.51.100.${i}`))
    }
    await clearAttempts(kv, from('198.51.100.0'))
    expect((await attemptState(kv, from('198.51.100.0'))).globalBlock).toBe(true)
  })

  it('ويُصفّر عدّ العنوان وحده', async () => {
    await recordFailure(kv, from('1.1.1.1'))
    await recordFailure(kv, from('1.1.1.1'))
    await clearAttempts(kv, from('1.1.1.1'))
    expect((await attemptState(kv, from('1.1.1.1'))).attempts).toBe(0)
  })

  it('العدّ العامّ ينتهي بمهلته هو أيضا', async () => {
    await recordFailure(kv, from('1.1.1.1'))
    expect(kv.ttlOf('login-attempts:global')).toBe(WINDOW_SECONDS)
  })
})

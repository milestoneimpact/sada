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

  it('يعدّ كلّ عنوان على حدة — فلا يحجب مخمّن المالك', async () => {
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

  it('للعدّ مهلة تنتهي وحدها — لا جدول ينمو ولا صفوف تُنظَّف', async () => {
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

describe('لا مفتاحَ عامًّا في KV (D-317)', () => {
  /**
   * ‏كان `login-attempts:global` يُكتب مع كلّ فشلٍ وثلاثون منه تُغلق الدخولَ على الجميع — مفتاحُ المرور معه. والقاطعُ
   * ‏العامّ صار في D1 (`gate.ts`) بسقفٍ أعلى بكثير، وKV للعنوان وحده.
   */
  it('فشلٌ من عناوين شتّى لا يُغلق عنوانًا لم يُخطئ', async () => {
    for (let i = 0; i < 60; i += 1) {
      await recordFailure(kv, from(`198.51.100.${i}`))
      await recordFailure(kv, from(`198.51.100.${i}`))
    }
    const fresh = await attemptState(kv, from('203.0.113.77'))
    expect(fresh).toEqual({ blocked: false, attempts: 0, remaining: MAX_ATTEMPTS, globalBlock: false })
    expect(kv.ttlOf('login-attempts:global')).toBeNull()
  })

  it('والقاطعُ العامّ في D1 أعلى بكثير من ثلاثين', () => {
    expect(MAX_GLOBAL_ATTEMPTS).toBeGreaterThanOrEqual(1000)
  })

  it('وكتابةٌ يردّها KV لا تُسقط الطلب', async () => {
    const broken = { get: async () => null, put: async () => { throw new Error('429 Too Many Requests') }, delete: async () => undefined }
    expect((await recordFailure(broken, from('1.1.1.1'))).attempts).toBe(1)
  })
})

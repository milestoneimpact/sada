import { beforeEach, describe, expect, it } from 'vitest'
import { fakeKv } from '../../test/fakes'
import { consumeState, saveState, StateError, STATE_TTL_SECONDS, type OAuthState } from './state'

let now = Date.UTC(2026, 8, 3, 10, 0, 0)
let kv: ReturnType<typeof fakeKv>

const VALUE: OAuthState = {
  platform: 'x',
  verifier: 'v-123',
  redirectUri: 'https://sada2.basserh.com/oauth/x/callback',
  createdAt: '2026-09-03T10:00:00.000Z',
}

beforeEach(() => {
  now = Date.UTC(2026, 8, 3, 10, 0, 0)
  kv = fakeKv(() => now)
})

describe('دورة الحالة', () => {
  it('يعيد ما حُفظ', async () => {
    await saveState(kv, 's1', VALUE)
    await expect(consumeState(kv, 's1')).resolves.toEqual(VALUE)
  })

  it('يستهلك مرة واحدة: المحاولة الثانية ترفض', async () => {
    await saveState(kv, 's1', VALUE)
    await consumeState(kv, 's1')
    await expect(consumeState(kv, 's1')).rejects.toBeInstanceOf(StateError)
  })

  it('لا يترك أثرا في المخزن بعد الاستهلاك', async () => {
    await saveState(kv, 's1', VALUE)
    await consumeState(kv, 's1')
    expect(kv.size()).toBe(0)
  })

  it('يحذف المفتاح حتى حين تكون الحالة تالفة', async () => {
    await kv.put('oauth:state:s1', 'ليس JSON')
    await expect(consumeState(kv, 's1')).rejects.toBeInstanceOf(StateError)
    expect(kv.size()).toBe(0)
  })
})

describe('ما يجب أن يرفض', () => {
  it('state فارغ', async () => {
    await expect(consumeState(kv, '')).rejects.toBeInstanceOf(StateError)
  })

  it('state لم يصدر منا', async () => {
    await expect(consumeState(kv, 'مزور')).rejects.toBeInstanceOf(StateError)
  })

  it('state انتهى عمره', async () => {
    await saveState(kv, 's1', VALUE)
    now += (STATE_TTL_SECONDS + 1) * 1000
    await expect(consumeState(kv, 's1')).rejects.toBeInstanceOf(StateError)
  })

  it('state ناقص الحقول', async () => {
    await kv.put('oauth:state:s1', JSON.stringify({ platform: 'x' }))
    await expect(consumeState(kv, 's1')).rejects.toBeInstanceOf(StateError)
  })

  it('state بمنصة غير معروفة', async () => {
    await kv.put(
      'oauth:state:s1',
      JSON.stringify({ ...VALUE, platform: 'facebook' }),
    )
    await expect(consumeState(kv, 's1')).rejects.toBeInstanceOf(StateError)
  })
})

describe('العمر', () => {
  it('يبقى صالحا قبل انتهاء المهلة بثانية', async () => {
    await saveState(kv, 's1', VALUE)
    now += (STATE_TTL_SECONDS - 1) * 1000
    await expect(consumeState(kv, 's1')).resolves.toEqual(VALUE)
  })
})

import { describe, expect, it } from 'vitest'
import { isTimeout, withTimeout } from './timeout'

describe('withTimeout', () => {
  it('يمرّر الطلبَ كما هو ويضيف إشارةَ مهلة', async () => {
    let seen: RequestInit | undefined
    const inner: typeof fetch = async (_url, init) => { seen = init; return new Response('ok') }
    const res = await withTimeout(inner, 1000)('https://x.test', { method: 'POST' })
    expect(res.status).toBe(200)
    expect(seen?.method).toBe('POST')
    expect(seen?.signal).toBeInstanceOf(AbortSignal)
  })

  it('يقطع النداءَ الذي لا يُجاب ويرمي TimeoutError', async () => {
    const inner: typeof fetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal!.reason))
      })
    await expect(withTimeout(inner, 20)('https://x.test')).rejects.toSatisfy(isTimeout)
  })

  it('يحترم إشارةَ المنادي إن سبقت المهلة', async () => {
    const own = new AbortController()
    const inner: typeof fetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal!.reason))
      })
    const pending = withTimeout(inner, 10_000)('https://x.test', { signal: own.signal })
    own.abort(new Error('own'))
    await expect(pending).rejects.toThrow('own')
  })
})

import { describe, expect, it } from 'vitest'
import { base64url, challengeFor, createPkce, randomToken } from './pkce'

describe('base64url', () => {
  it('لا يترك حشوا ولا محرفا خارج المجموعة الآمنة', () => {
    for (let length = 1; length <= 40; length += 1) {
      const encoded = base64url(crypto.getRandomValues(new Uint8Array(length)))
      expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/)
    }
  })
})

describe('createPkce', () => {
  it('يطابق المتجه المرجعي في RFC 7636 §A.2', async () => {
    // القيمتان منصوصتان في المعيار نفسه
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
    await expect(challengeFor(verifier)).resolves.toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    )
  })

  it('يعلن S256 ولا يقبل غيرها', async () => {
    const pkce = await createPkce()
    expect(pkce.method).toBe('S256')
  })

  it('يعطي verifier جديدا في كل نداء', async () => {
    const seen = new Set<string>()
    for (let i = 0; i < 50; i += 1) seen.add((await createPkce()).verifier)
    expect(seen.size).toBe(50)
  })

  it('يبني challenge مطابقا لـ verifier الخاص به', async () => {
    const pkce = await createPkce()
    await expect(challengeFor(pkce.verifier)).resolves.toBe(pkce.challenge)
  })

  it('يحترم طول verifier المسموح: 43 إلى 128 محرفا', async () => {
    const pkce = await createPkce()
    expect(pkce.verifier.length).toBeGreaterThanOrEqual(43)
    expect(pkce.verifier.length).toBeLessThanOrEqual(128)
  })
})

describe('randomToken', () => {
  it('لا يكرر قيمة في ألف نداء', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 1000; i += 1) seen.add(randomToken())
    expect(seen.size).toBe(1000)
  })
})

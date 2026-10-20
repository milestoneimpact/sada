import { describe, expect, it } from 'vitest'
import { digest, fingerprint, randomToken, sameBytes, sameSecret } from './digest'

describe('sameBytes', () => {
  it('المتطابقتان تمرّان', () => {
    expect(sameBytes(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true)
  })

  it('اختلاف في أيّ موضع يُرفض — ولو في الأخير', () => {
    expect(sameBytes(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false)
    expect(sameBytes(new Uint8Array([1, 2, 3]), new Uint8Array([9, 2, 3]))).toBe(false)
  })

  it('طولان مختلفان يُرفضان', () => {
    expect(sameBytes(new Uint8Array([1]), new Uint8Array([1, 2]))).toBe(false)
  })
})

describe('sameSecret', () => {
  it('السرّ نفسه يمرّ', async () => {
    expect(await sameSecret('abc123', 'abc123')).toBe(true)
  })

  it('اختلاف في محرف واحد يُرفض', async () => {
    expect(await sameSecret('abc123', 'abc124')).toBe(false)
  })

  it('لا يقلّم — الفراغ فرق ما لم يُقلَّم قبل النداء', async () => {
    expect(await sameSecret('abc', 'abc ')).toBe(false)
  })

  it('الفارغان متطابقان — فالتقليم مسؤوليّة المنادي لا هذه الدالّة', async () => {
    expect(await sameSecret('', '')).toBe(true)
  })
})

describe('fingerprint', () => {
  it('ثابتة لنفس السرّ', async () => {
    expect(await fingerprint('secret')).toBe(await fingerprint('secret'))
  })

  it('تختلف باختلاف السرّ', async () => {
    expect(await fingerprint('a')).not.toBe(await fingerprint('b'))
  })

  it('تُقلّم — فسطر تسلّل مع السرّ لا يبدّل البصمة', async () => {
    expect(await fingerprint('secret\n')).toBe(await fingerprint('secret'))
  })

  it('ستّة عشر محرفا ستّينيّ عشر، ولا تحمل السرّ', async () => {
    const value = await fingerprint('super-secret-value')
    expect(value).toMatch(/^[0-9a-f]{16}$/)
    expect(value).not.toContain('secret')
  })
})

describe('randomToken', () => {
  it('لا يتكرّر', () => {
    expect(new Set(Array.from({ length: 200 }, () => randomToken())).size).toBe(200)
  })

  it('طولُه ضعف البايتات — ستّينيّ عشر', () => {
    expect(randomToken(16)).toHaveLength(32)
    expect(randomToken(32)).toHaveLength(64)
  })

  it('محارفُه كلّها ستّينيّة عشر', () => {
    expect(randomToken(32)).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('digest', () => {
  it('SHA-256 — اثنان وثلاثون بايتا', async () => {
    expect((await digest('anything')).length).toBe(32)
  })
})

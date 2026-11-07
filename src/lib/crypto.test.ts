import { describe, expect, it } from 'vitest'
import {
  CryptoError,
  fromBase64,
  importKey,
  open,
  seal,
  toBase64,
  tokenContext,
} from './crypto'

const KEY_A = toBase64(crypto.getRandomValues(new Uint8Array(32)))
const KEY_B = toBase64(crypto.getRandomValues(new Uint8Array(32)))
const ACCESS = 'AQXd7f_fakeAccessTokenValue_notReal'
const CTX = tokenContext('lnkd_7', 'access')

describe('استيراد المفتاح', () => {
  it('يقبل مفتاح 32 بايت', async () => {
    await expect(importKey(KEY_A)).resolves.toBeDefined()
  })

  it('يرفض مفتاحا بطول خاطئ', async () => {
    const short = toBase64(new Uint8Array(16))
    await expect(importKey(short)).rejects.toBeInstanceOf(CryptoError)
  })

  it('يرفض base64 غير صالح', async () => {
    await expect(importKey('!!! not base64 !!!')).rejects.toBeInstanceOf(CryptoError)
  })
})

describe('دورة التشفير', () => {
  it('يعيد النص نفسه بالمفتاح والسياق نفسيهما', async () => {
    const key = await importKey(KEY_A)
    const sealed = await seal(key, ACCESS, CTX)
    await expect(open(key, sealed, CTX)).resolves.toBe(ACCESS)
  })

  it('لا يترك النص الخام ظاهرا في الناتج', async () => {
    const key = await importKey(KEY_A)
    const sealed = await seal(key, ACCESS, CTX)
    expect(sealed.ciphertext).not.toContain(ACCESS)
    expect(atob(sealed.ciphertext)).not.toContain(ACCESS)
  })

  it('يعطي iv مختلفا ونصا مختلفا لكل عملية', async () => {
    const key = await importKey(KEY_A)
    const first = await seal(key, ACCESS, CTX)
    const second = await seal(key, ACCESS, CTX)
    expect(first.iv).not.toBe(second.iv)
    expect(first.ciphertext).not.toBe(second.ciphertext)
    await expect(open(key, second, CTX)).resolves.toBe(ACCESS)
  })

  it('يحفظ النص العربي والمحارف غير اللاتينية', async () => {
    const key = await importKey(KEY_A)
    const value = 'رمز فيه عربية و emoji 🔐'
    const sealed = await seal(key, value, CTX)
    await expect(open(key, sealed, CTX)).resolves.toBe(value)
  })
})

describe('ما يجب أن يفشل', () => {
  it('يفشل بمفتاح آخر', async () => {
    const sealed = await seal(await importKey(KEY_A), ACCESS, CTX)
    await expect(open(await importKey(KEY_B), sealed, CTX)).rejects.toBeInstanceOf(
      CryptoError,
    )
  })

  it('يفشل بسياق آخر: رمز حساب لا يفتح لحساب غيره', async () => {
    const key = await importKey(KEY_A)
    const sealed = await seal(key, ACCESS, tokenContext('lnkd_7', 'access'))
    await expect(
      open(key, sealed, tokenContext('lnkd_9', 'access')),
    ).rejects.toBeInstanceOf(CryptoError)
  })

  it('يفشل حين يوضع نص refresh مكان access', async () => {
    const key = await importKey(KEY_A)
    const sealed = await seal(key, ACCESS, tokenContext('lnkd_7', 'refresh'))
    await expect(
      open(key, sealed, tokenContext('lnkd_7', 'access')),
    ).rejects.toBeInstanceOf(CryptoError)
  })

  it('يفشل إن عبث ببايت واحد في النص المشفر', async () => {
    const key = await importKey(KEY_A)
    const sealed = await seal(key, ACCESS, CTX)
    const bytes = fromBase64(sealed.ciphertext)
    bytes[0] = (bytes[0]! ^ 0x01) & 0xff
    await expect(
      open(key, { ciphertext: toBase64(bytes), iv: sealed.iv }, CTX),
    ).rejects.toBeInstanceOf(CryptoError)
  })

  it('يفشل بـ iv بطول خاطئ', async () => {
    const key = await importKey(KEY_A)
    const sealed = await seal(key, ACCESS, CTX)
    await expect(
      open(key, { ciphertext: sealed.ciphertext, iv: toBase64(new Uint8Array(8)) }, CTX),
    ).rejects.toBeInstanceOf(CryptoError)
  })

  it('يرفض السياق الفارغ في الطرفين', async () => {
    const key = await importKey(KEY_A)
    await expect(seal(key, ACCESS, '')).rejects.toBeInstanceOf(CryptoError)
    const sealed = await seal(key, ACCESS, CTX)
    await expect(open(key, sealed, '')).rejects.toBeInstanceOf(CryptoError)
  })
})

describe('حلقةُ المفاتيح وإصدارُها (D-318)', () => {
  const C = 'account:x:access'

  it('النصُّ الجديدُ يحمل معرّفَ مفتاحه ويُفتح بالنطاق نفسِه وحده', async () => {
    const { keyId, openScoped, sealScoped, LEGACY_RAW } = await import('./crypto')
    const sealed = await sealScoped(KEY_A, 'tokens:org_owner', ACCESS, C)
    expect(sealed.ciphertext.startsWith(`v2:${await keyId(KEY_A)}:`)).toBe(true)
    expect(sealed.ciphertext).not.toContain(ACCESS)
    await expect(openScoped(KEY_A, 'tokens:org_owner', sealed, C, LEGACY_RAW)).resolves.toBe(ACCESS)
    // ‏نطاقٌ آخر لا يفتحه، ولا المفتاحُ الخامُ — منظّمةُ المالك صار مفتاحُها مشتقًّا كغيرها
    await expect(openScoped(KEY_A, 'tokens:org_b', sealed, C, LEGACY_RAW)).rejects.toBeInstanceOf(CryptoError)
    const body = sealed.ciphertext.split(':')[2]!
    await expect(open(await importKey(KEY_A), { ciphertext: body, iv: sealed.iv }, C)).rejects.toBeInstanceOf(CryptoError)
  })

  it('والقديمُ (قبل D-318) يُقرأ بطريقته: الخامُ للمالك، والمشتقُّ القديمُ للعميل', async () => {
    const { deriveKey, legacyOrgKey, openScoped } = await import('./crypto')
    const owner = await seal(await importKey(KEY_A), ACCESS, C)
    await expect(openScoped(KEY_A, 'tokens:org_owner', owner, C, legacyOrgKey('org_owner'))).resolves.toBe(ACCESS)
    const client = await seal(await deriveKey(KEY_A, 'org_b'), ACCESS, C)
    await expect(openScoped(KEY_A, 'tokens:org_b', client, C, legacyOrgKey('org_b'))).resolves.toBe(ACCESS)
    await expect(openScoped(KEY_A, 'tokens:org_b', client, C, legacyOrgKey('org_c'))).rejects.toBeInstanceOf(CryptoError)
  })

  it('التدوير: بلا السابق لا يُفتح ما شُفِّر به، ومعه يُفتح — جديدًا كان أو قديمًا', async () => {
    const { LEGACY_RAW, openScoped, registerKeyring, sealScoped, sealedWithCurrent } = await import('./crypto')
    const fresh = await sealScoped(KEY_A, 'vault:providers', ACCESS, C)
    const legacy = await seal(await importKey(KEY_A), ACCESS, C)
    registerKeyring({ TOKEN_ENC_KEY: KEY_B })
    await expect(openScoped(KEY_B, 'vault:providers', fresh, C, LEGACY_RAW)).rejects.toBeInstanceOf(CryptoError)
    await expect(openScoped(KEY_B, 'vault:providers', legacy, C, LEGACY_RAW)).rejects.toBeInstanceOf(CryptoError)

    registerKeyring({ TOKEN_ENC_KEY: KEY_B, TOKEN_ENC_KEY_PREV: KEY_A })
    try {
      await expect(openScoped(KEY_B, 'vault:providers', fresh, C, LEGACY_RAW)).resolves.toBe(ACCESS)
      await expect(openScoped(KEY_B, 'vault:providers', legacy, C, LEGACY_RAW)).resolves.toBe(ACCESS)
      // ‏والكتابةُ بالحاليّ وحده
      const again = await sealScoped(KEY_B, 'vault:providers', ACCESS, C)
      expect(await sealedWithCurrent(KEY_B, again.ciphertext)).toBe(true)
      expect(await sealedWithCurrent(KEY_B, fresh.ciphertext)).toBe(false)
    } finally {
      registerKeyring({ TOKEN_ENC_KEY: KEY_B })
    }
    await expect(openScoped(KEY_B, 'vault:providers', fresh, C, LEGACY_RAW)).rejects.toBeInstanceOf(CryptoError)
  })

  it('ومعرّفٌ لا تعرفه الحلقةُ أو صيغةٌ تالفة: خطأُ تشفيرٍ لا قيمة', async () => {
    const { LEGACY_RAW, openScoped, sealScoped } = await import('./crypto')
    const sealed = await sealScoped(KEY_A, 's', ACCESS, C)
    const forged = { ...sealed, ciphertext: sealed.ciphertext.replace(/^v2:[0-9a-f]{8}:/, 'v2:00000000:') }
    await expect(openScoped(KEY_A, 's', forged, C, LEGACY_RAW)).rejects.toBeInstanceOf(CryptoError)
    await expect(openScoped(KEY_A, 's', { ...sealed, ciphertext: 'v2:abc' }, C, LEGACY_RAW)).rejects.toBeInstanceOf(CryptoError)
  })

  it('مفتاحُ HMAC مشتقٌّ لكلّ غرض: ثابتٌ للمفتاح والغرض، ويختلف باختلاف أحدهما', async () => {
    const { hmacKeyFor } = await import('./crypto')
    const mac = async (k: string, info: string): Promise<string> =>
      toBase64(new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKeyFor(k, info), new TextEncoder().encode('x'))))
    expect(await mac(KEY_A, 'recovery-v1')).toBe(await mac(KEY_A, 'recovery-v1'))
    expect(await mac(KEY_A, 'recovery-v1')).not.toBe(await mac(KEY_B, 'recovery-v1'))
    expect(await mac(KEY_A, 'recovery-v1')).not.toBe(await mac(KEY_A, 'other'))
  })
})

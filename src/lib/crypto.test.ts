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

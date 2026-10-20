import { describe, expect, it } from 'vitest'
import { codeAt, counterFor, fromBase32, newSecret, otpauthUrl, toBase32, verifyTotp } from './totp'

/** سرُّ RFC 6238 المرجعيّ: "12345678901234567890" بـ base32. */
const RFC = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'

describe('base32', () => {
  it('يذهب ويعود', () => {
    const bytes = crypto.getRandomValues(new Uint8Array(20))
    expect(fromBase32(toBase32(bytes))).toEqual(bytes)
  })

  it('يقرأ سرّ المواصفة المرجعيّ نصّا', () => {
    expect(new TextDecoder().decode(fromBase32(RFC))).toBe('12345678901234567890')
  })

  it('يتسامح مع الحشو والمسافات وحالة الأحرف', () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5])
    const encoded = toBase32(bytes)
    expect(fromBase32(encoded.toLowerCase())).toEqual(bytes)
    expect(fromBase32(`${encoded}======`)).toEqual(bytes)
  })

  it('يرمي على محرف غريب — لا يبتلعه فيصير سرّا آخر', () => {
    expect(() => fromBase32('ABC!')).toThrow()
    // ١ و ٨ و ٩ و ٠ ليست من الأبجديّة قصدا: تُخلط بحروفٍ تشبهها
    expect(() => fromBase32('ABC1')).toThrow()
  })
})

/**
 * قيَمُ RFC 6238 المرجعيّة لـ SHA-1.
 * وهي ما يجعل هذا التطبيق متوافقا مع كلّ تطبيقات المصادقة لا مجرّد
 * متّسقٍ مع نفسه.
 */
describe('codeAt — مقابل جدول المواصفة', () => {
  it.each([
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
    [20000000000, '353130'],
  ])('عند %i ثانية يعطي %s', async (seconds, expected) => {
    const counter = BigInt(Math.floor(seconds / 30))
    expect(await codeAt(RFC, counter)).toBe(expected)
  })
})

describe('verifyTotp', () => {
  const at = (seconds: number): Date => new Date(seconds * 1000)

  it('الرمز الحاليّ يمرّ', async () => {
    const result = await verifyTotp(RFC, '050471', { now: at(1111111111) })
    expect(result.ok).toBe(true)
  })

  it('رمز الخطوة السابقة يمرّ — الساعات تنحرف', async () => {
    const previous = await codeAt(RFC, counterFor(at(1111111111)) - 1n)
    expect((await verifyTotp(RFC, previous, { now: at(1111111111) })).ok).toBe(true)
  })

  it('رمز من بعيد يُرفض', async () => {
    expect((await verifyTotp(RFC, '050471', { now: at(1111120000) })).ok).toBe(false)
  })

  it('ما ليس ستّة أرقام يُرفض قبل أيّ حساب', async () => {
    for (const bad of ['', '12345', '1234567', 'abcdef', '12 34 5a']) {
      expect((await verifyTotp(RFC, bad, { now: at(1111111111) })).ok).toBe(false)
    }
  })

  it('يتسامح مع مسافة في الوسط — كما يُنسَخ من التطبيق', async () => {
    expect((await verifyTotp(RFC, '050 471', { now: at(1111111111) })).ok).toBe(true)
  })

  it('**رمز استُعمل لا يُقبل ثانية** — ولو بقي من نافذته ثوان', async () => {
    const first = await verifyTotp(RFC, '050471', { now: at(1111111111) })
    if (!first.ok) throw new Error('توقّعنا قبولا')
    const second = await verifyTotp(RFC, '050471', {
      now: at(1111111111),
      lastStep: first.step,
    })
    expect(second.ok).toBe(false)
  })

  it('ولا يُقبل رمز من خطوة أقدم من آخر ما استُعمل', async () => {
    const step = counterFor(at(1111111111))
    const previous = await codeAt(RFC, step - 1n)
    expect((await verifyTotp(RFC, previous, { now: at(1111111111), lastStep: step })).ok).toBe(
      false,
    )
  })
})

describe('newSecret', () => {
  it('لا يتكرّر، وطولُه عشرون بايتا', () => {
    const secrets = Array.from({ length: 50 }, () => newSecret())
    expect(new Set(secrets).size).toBe(50)
    expect(fromBase32(secrets[0]!).length).toBe(20)
  })
})

describe('otpauthUrl', () => {
  it('يحمل المُصدِر والحساب والمعاملات', () => {
    const url = otpauthUrl('ABCD', 'omar@example.com', 'sada2.basserh.com')
    expect(url.startsWith('otpauth://totp/')).toBe(true)
    expect(url).toContain('secret=ABCD')
    expect(url).toContain('issuer=sada2.basserh.com')
    expect(url).toContain('digits=6')
    expect(url).toContain('period=30')
  })

  it('يُرمّز المحارف الخاصّة في التسمية', () => {
    expect(otpauthUrl('X', 'a b@c', 'صدى')).not.toContain(' ')
  })
})

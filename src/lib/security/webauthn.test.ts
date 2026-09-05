import { beforeAll, describe, expect, it } from 'vitest'
import { fakeAuthenticator, type FakeAuthenticator } from '../../test/authenticator'
import { fromBase64Url, toBase64Url } from './bytes'
import {
  ES256, newChallenge, readAuthData, verifyAssertion, verifyRegistration,
} from './webauthn'

const RP_ID = 'sada2.basserh.com'
const ORIGIN = 'https://sada2.basserh.com'

let key: FakeAuthenticator

beforeAll(async () => {
  key = await fakeAuthenticator()
})

function expected(challenge: string): { challenge: string; origin: string; rpId: string } {
  return { challenge, origin: ORIGIN, rpId: RP_ID }
}

async function assertion(
  challenge: string,
  overrides: Parameters<FakeAuthenticator['sign']>[0] extends infer T
    ? Partial<Omit<T & object, 'challenge' | 'origin' | 'rpId'>>
    : never = {},
): Promise<{
  authenticatorData: Uint8Array
  clientDataJSON: Uint8Array
  signature: Uint8Array
}> {
  const signed = await key.sign({ challenge, origin: ORIGIN, rpId: RP_ID, ...overrides })
  return {
    authenticatorData: fromBase64Url(signed.authenticatorData),
    clientDataJSON: fromBase64Url(signed.clientDataJSON),
    signature: fromBase64Url(signed.signature),
  }
}

const stored = (signCount = 0): { publicKey: string; alg: number; signCount: number } => ({
  publicKey: key.publicKey,
  alg: ES256,
  signCount,
})

describe('newChallenge', () => {
  it('لا يتكرّر، ومن ٣٢ بايتا', () => {
    const list = Array.from({ length: 200 }, () => newChallenge())
    expect(new Set(list).size).toBe(200)
    expect(fromBase64Url(list[0]!).length).toBe(32)
  })
})

describe('readAuthData', () => {
  it('يرفض ما قَصُر عن أقلّ طولٍ ممكن', () => {
    expect(readAuthData(new Uint8Array(36))).toBeNull()
  })

  it('يقرأ الرايات والعدّاد', async () => {
    const signed = await assertion(newChallenge(), { signCount: 42 })
    const data = readAuthData(signed.authenticatorData)
    expect(data?.userPresent).toBe(true)
    expect(data?.userVerified).toBe(true)
    expect(data?.signCount).toBe(42)
  })
})

describe('verifyAssertion — التوقيع حقيقيّ لا محاكاة', () => {
  it('توقيعٌ صحيح يمرّ', async () => {
    const challenge = newChallenge()
    const result = await verifyAssertion(await assertion(challenge), stored(), expected(challenge))
    expect(result.ok).toBe(true)
  })

  it('**تحدٍّ آخر يُرفض** — وهو ما يمنع إعادة الإرسال', async () => {
    const signed = await assertion(newChallenge())
    const result = await verifyAssertion(signed, stored(), expected(newChallenge()))
    expect(result).toMatchObject({ ok: false })
    if (!result.ok) expect(result.reason).toContain('التحدّي')
  })

  it('**أصلٌ آخر يُرفض** — وهو ما يجعلها مقاومةً للتصيّد', async () => {
    const challenge = newChallenge()
    const signed = await assertion(challenge)
    const result = await verifyAssertion(signed, stored(), {
      challenge,
      origin: 'https://sada2.basserh.com.evil.example',
      rpId: RP_ID,
    })
    expect(result).toMatchObject({ ok: false })
    if (!result.ok) expect(result.reason).toContain('الأصل')
  })

  it('**نطاقٌ آخر يُرفض** — فمفتاح التجريب لا يفتح الإنتاج', async () => {
    const challenge = newChallenge()
    const signed = await assertion(challenge)
    const result = await verifyAssertion(signed, stored(), {
      challenge,
      origin: ORIGIN,
      rpId: 'sada.basserh.com',
    })
    expect(result).toMatchObject({ ok: false })
    if (!result.ok) expect(result.reason).toContain('نطاقٍ آخر')
  })

  it('نوعٌ خطأ يُرفض — توقيعُ تسجيلٍ لا يصلح دخولا', async () => {
    const challenge = newChallenge()
    const signed = await assertion(challenge, { type: 'webauthn.create' })
    expect(await verifyAssertion(signed, stored(), expected(challenge))).toMatchObject({
      ok: false,
    })
  })

  it('بلا حضورِ مستخدمٍ يُرفض', async () => {
    const challenge = newChallenge()
    const signed = await assertion(challenge, { userPresent: false })
    const result = await verifyAssertion(signed, stored(), expected(challenge))
    expect(result).toMatchObject({ ok: false })
    if (!result.ok) expect(result.reason).toContain('حضور')
  })

  it('توقيعٌ مبدَّل بايتا يُرفض', async () => {
    const challenge = newChallenge()
    const signed = await assertion(challenge)
    const last = signed.signature.length - 1
    signed.signature[last] = signed.signature[last]! ^ 0xff
    expect(await verifyAssertion(signed, stored(), expected(challenge))).toMatchObject({
      ok: false,
    })
  })

  it('مفتاحٌ عامٌّ آخر يُرفض', async () => {
    const other = await fakeAuthenticator()
    const challenge = newChallenge()
    const signed = await assertion(challenge)
    const result = await verifyAssertion(
      signed,
      { publicKey: other.publicKey, alg: ES256, signCount: 0 },
      expected(challenge),
    )
    expect(result).toMatchObject({ ok: false })
  })

  it('مفتاحٌ محفوظٌ مشوَّه يُقال عنه ذلك ولا يُبتلَع', async () => {
    const challenge = newChallenge()
    const result = await verifyAssertion(
      await assertion(challenge),
      { publicKey: toBase64Url(new Uint8Array([1, 2, 3])), alg: ES256, signCount: 0 },
      expected(challenge),
    )
    expect(result).toMatchObject({ ok: false })
    if (!result.ok) expect(result.reason).toContain('المفتاح العامّ')
  })
})

describe('عدّاد التوقيع — وهو ما يكشف الاستنساخ', () => {
  it('عدّادٌ يتقدّم يمرّ', async () => {
    const challenge = newChallenge()
    const signed = await assertion(challenge, { signCount: 5 })
    const result = await verifyAssertion(signed, stored(3), expected(challenge))
    expect(result).toMatchObject({ ok: true, signCount: 5 })
  })

  it('**عدّادٌ لم يتقدّم يُرفض** — نسخةٌ ثانية تُستعمل بالتوازي', async () => {
    const challenge = newChallenge()
    const signed = await assertion(challenge, { signCount: 3 })
    const result = await verifyAssertion(signed, stored(3), expected(challenge))
    expect(result).toMatchObject({ ok: false })
    if (!result.ok) expect(result.reason).toContain('مستنسَخا')
  })

  it('وعدّادٌ تراجع يُرفض كذلك', async () => {
    const challenge = newChallenge()
    const signed = await assertion(challenge, { signCount: 2 })
    expect(await verifyAssertion(signed, stored(9), expected(challenge))).toMatchObject({
      ok: false,
    })
  })

  it('**عدّادٌ تقدّم ثمّ عاد صفرا يُرفض** — وهو عينُ ما وُضع الفحص له', async () => {
    // مفتاحٌ بلغ عدّاده خمسا لا يعود إلى الصفر من نفسه. وكان `&&` يُسقط
    // الفحص هنا، ثمّ يكتب `touchPasskey` الصفرَ فوق الخمسة فيمحو الأثر
    const challenge = newChallenge()
    const signed = await assertion(challenge, { signCount: 0 })
    const result = await verifyAssertion(signed, stored(5), expected(challenge))
    expect(result).toMatchObject({ ok: false })
    if (!result.ok) expect(result.reason).toContain('مستنسَخا')
  })

  it('وأوّلُ استعمالٍ لمتوثِّقٍ يعدّ يمرّ — محفوظٌ صفر ووارِدٌ واحد', async () => {
    const challenge = newChallenge()
    const signed = await assertion(challenge, { signCount: 1 })
    expect(await verifyAssertion(signed, stored(0), expected(challenge))).toMatchObject({
      ok: true,
    })
  })

  it('**صفرٌ لا يُحاسَب** — متوثِّقاتٌ كثيرة لا تعدّ أصلا', async () => {
    const challenge = newChallenge()
    const signed = await assertion(challenge, { signCount: 0 })
    expect(await verifyAssertion(signed, stored(0), expected(challenge))).toMatchObject({
      ok: true,
    })
  })

  it('ومحفوظٌ صفرٌ مع وارِدٍ صفرٍ يمرّ مرارا', async () => {
    for (let i = 0; i < 3; i += 1) {
      const challenge = newChallenge()
      const signed = await assertion(challenge, { signCount: 0 })
      expect(await verifyAssertion(signed, stored(0), expected(challenge))).toMatchObject({
        ok: true,
      })
    }
  })
})

describe('verifyRegistration', () => {
  async function registration(
    challenge: string,
  ): Promise<{ clientDataJSON: Uint8Array; authenticatorData: Uint8Array }> {
    const signed = await key.sign({
      challenge,
      origin: ORIGIN,
      rpId: RP_ID,
      type: 'webauthn.create',
    })
    return {
      clientDataJSON: fromBase64Url(signed.clientDataJSON),
      authenticatorData: fromBase64Url(signed.authenticatorData),
    }
  }

  it('تسجيلٌ صحيح يمرّ', async () => {
    const challenge = newChallenge()
    const result = await verifyRegistration(
      { ...(await registration(challenge)), publicKey: fromBase64Url(key.publicKey), alg: ES256 },
      expected(challenge),
    )
    expect(result.ok).toBe(true)
  })

  it('**بلا مفتاحٍ عامٍّ من المتصفّح يُقال السبب** — لا يفشل صامتا', async () => {
    const challenge = newChallenge()
    const result = await verifyRegistration(
      { ...(await registration(challenge)), publicKey: null, alg: ES256 },
      expected(challenge),
    )
    expect(result).toMatchObject({ ok: false })
    if (!result.ok) expect(result.reason).toContain('متصفّح أحدث')
  })

  it('خوارزميّةٌ غير مدعومة تُرفض بالاسم', async () => {
    const challenge = newChallenge()
    const result = await verifyRegistration(
      { ...(await registration(challenge)), publicKey: fromBase64Url(key.publicKey), alg: -8 },
      expected(challenge),
    )
    expect(result).toMatchObject({ ok: false })
    if (!result.ok) expect(result.reason).toContain('-8')
  })

  it('نوعُ «دخول» لا يصلح تسجيلا', async () => {
    const challenge = newChallenge()
    const signed = await key.sign({ challenge, origin: ORIGIN, rpId: RP_ID })
    const result = await verifyRegistration(
      {
        clientDataJSON: fromBase64Url(signed.clientDataJSON),
        authenticatorData: fromBase64Url(signed.authenticatorData),
        publicKey: fromBase64Url(key.publicKey),
        alg: ES256,
      },
      expected(challenge),
    )
    expect(result).toMatchObject({ ok: false })
  })

  it('مفتاحٌ عامٌّ لا يُقرأ يُرفض عند التسجيل لا عند أوّل دخول', async () => {
    const challenge = newChallenge()
    const result = await verifyRegistration(
      {
        ...(await registration(challenge)),
        publicKey: new Uint8Array([9, 9, 9, 9]),
        alg: ES256,
      },
      expected(challenge),
    )
    expect(result).toMatchObject({ ok: false })
    if (!result.ok) expect(result.reason).toContain('لا يُقرأ')
  })
})

describe('بيانات العميل الفاسدة', () => {
  it('ما ليس JSON يُرفض بلا انهيار', async () => {
    const challenge = newChallenge()
    const signed = await assertion(challenge)
    const result = await verifyAssertion(
      { ...signed, clientDataJSON: new TextEncoder().encode('<<< ليس JSON') },
      stored(),
      expected(challenge),
    )
    expect(result).toMatchObject({ ok: false })
  })

  it('بيانات متوثِّقٍ أقصر ممّا يجب تُرفض', async () => {
    const challenge = newChallenge()
    const signed = await assertion(challenge)
    const result = await verifyAssertion(
      { ...signed, authenticatorData: new Uint8Array(10) },
      stored(),
      expected(challenge),
    )
    expect(result).toMatchObject({ ok: false })
  })
})

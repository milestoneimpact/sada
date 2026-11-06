import { beforeAll, describe, expect, it } from 'vitest'
import { cbor, fakeAuthenticator, type CborIn, type FakeAuthenticator } from '../../test/authenticator'
import { fromBase64Url, toBase64Url } from './bytes'
import {
  decodeCbor, ES256, newChallenge, readAuthData, verifyAssertion, verifyRegistration,
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
  it('يرفض ما قَصُر عن أقلّ طول ممكن', () => {
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
  it('توقيع صحيح يمرّ', async () => {
    const challenge = newChallenge()
    const result = await verifyAssertion(await assertion(challenge), stored(), expected(challenge))
    expect(result.ok).toBe(true)
  })

  it('**تحدّ آخر يُرفض** — وهو ما يمنع إعادة الإرسال', async () => {
    const signed = await assertion(newChallenge())
    const result = await verifyAssertion(signed, stored(), expected(newChallenge()))
    expect(result).toMatchObject({ ok: false })
    if (!result.ok) expect(result.reason).toContain('التحدّي')
  })

  it('**أصل آخر يُرفض** — وهو ما يجعلها مقاومةً للتصيّد', async () => {
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

  it('**نطاق آخر يُرفض** — فمفتاح التجريب لا يفتح الإنتاج', async () => {
    const challenge = newChallenge()
    const signed = await assertion(challenge)
    const result = await verifyAssertion(signed, stored(), {
      challenge,
      origin: ORIGIN,
      rpId: 'sada.basserh.com',
    })
    expect(result).toMatchObject({ ok: false })
    if (!result.ok) expect(result.reason).toContain('نطاق آخر')
  })

  it('نوع خطأ يُرفض — توقيع تسجيل لا يصلح دخولا', async () => {
    const challenge = newChallenge()
    const signed = await assertion(challenge, { type: 'webauthn.create' })
    expect(await verifyAssertion(signed, stored(), expected(challenge))).toMatchObject({
      ok: false,
    })
  })

  it('بلا حضور مستخدم يُرفض', async () => {
    const challenge = newChallenge()
    const signed = await assertion(challenge, { userPresent: false })
    const result = await verifyAssertion(signed, stored(), expected(challenge))
    expect(result).toMatchObject({ ok: false })
    if (!result.ok) expect(result.reason).toContain('حضور')
  })

  it('توقيع مبدَّل بايتا يُرفض', async () => {
    const challenge = newChallenge()
    const signed = await assertion(challenge)
    const last = signed.signature.length - 1
    signed.signature[last] = signed.signature[last]! ^ 0xff
    expect(await verifyAssertion(signed, stored(), expected(challenge))).toMatchObject({
      ok: false,
    })
  })

  it('مفتاح عامّ آخر يُرفض', async () => {
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

  it('مفتاح محفوظ مشوَّه يُقال عنه ذلك ولا يُبتلَع', async () => {
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
  it('عدّاد يتقدّم يمرّ', async () => {
    const challenge = newChallenge()
    const signed = await assertion(challenge, { signCount: 5 })
    const result = await verifyAssertion(signed, stored(3), expected(challenge))
    expect(result).toMatchObject({ ok: true, signCount: 5 })
  })

  it('**عدّاد لم يتقدّم يُرفض** — نسخة ثانية تُستعمل بالتوازي', async () => {
    const challenge = newChallenge()
    const signed = await assertion(challenge, { signCount: 3 })
    const result = await verifyAssertion(signed, stored(3), expected(challenge))
    expect(result).toMatchObject({ ok: false })
    if (!result.ok) expect(result.reason).toContain('مستنسَخا')
  })

  it('وعدّاد تراجع يُرفض كذلك', async () => {
    const challenge = newChallenge()
    const signed = await assertion(challenge, { signCount: 2 })
    expect(await verifyAssertion(signed, stored(9), expected(challenge))).toMatchObject({
      ok: false,
    })
  })

  it('**عدّاد تقدّم ثمّ عاد صفرا يُرفض** — وهو عين ما وُضع الفحص له', async () => {
    // مفتاحٌ بلغ عدّاده خمسا لا يعود إلى الصفر من نفسه. وكان `&&` يُسقط
    // الفحص هنا، ثمّ يكتب `touchPasskey` الصفرَ فوق الخمسة فيمحو الأثر
    const challenge = newChallenge()
    const signed = await assertion(challenge, { signCount: 0 })
    const result = await verifyAssertion(signed, stored(5), expected(challenge))
    expect(result).toMatchObject({ ok: false })
    if (!result.ok) expect(result.reason).toContain('مستنسَخا')
  })

  it('وأوّل استعمال لمتوثِّق يعدّ يمرّ — محفوظ صفر ووارِد واحد', async () => {
    const challenge = newChallenge()
    const signed = await assertion(challenge, { signCount: 1 })
    expect(await verifyAssertion(signed, stored(0), expected(challenge))).toMatchObject({
      ok: true,
    })
  })

  it('**صفر لا يُحاسَب** — متوثِّقات كثيرة لا تعدّ أصلا', async () => {
    const challenge = newChallenge()
    const signed = await assertion(challenge, { signCount: 0 })
    expect(await verifyAssertion(signed, stored(0), expected(challenge))).toMatchObject({
      ok: true,
    })
  })

  it('ومحفوظ صفر مع وارِد صفر يمرّ مرارا', async () => {
    for (let i = 0; i < 3; i += 1) {
      const challenge = newChallenge()
      const signed = await assertion(challenge, { signCount: 0 })
      expect(await verifyAssertion(signed, stored(0), expected(challenge))).toMatchObject({
        ok: true,
      })
    }
  })
})

describe('verifyRegistration — المفتاحُ من بيانات الاعتماد المشهودة (D-317)', () => {
  async function registration(
    challenge: string,
    override?: Parameters<FakeAuthenticator['register']>[0]['override'],
  ): Promise<{ clientDataJSON: Uint8Array; attestationObject: Uint8Array }> {
    const made = await key.register({ challenge, origin: ORIGIN, rpId: RP_ID, ...(override === undefined ? {} : { override }) })
    return {
      clientDataJSON: fromBase64Url(made.clientDataJSON),
      attestationObject: fromBase64Url(made.attestationObject),
    }
  }

  it('تسجيل صحيح يمرّ، والمعرّفُ والمفتاحُ ممّا قاله المتوثِّق', async () => {
    const challenge = newChallenge()
    const result = await verifyRegistration(await registration(challenge), expected(challenge))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.credentialId).toBe(key.credentialId)
    expect(result.alg).toBe(ES256)
    // ‏المفتاحُ المستخرَج من COSE هو المفتاحُ العامّ نفسُه بصيغة SPKI
    expect(result.publicKey).toBe(key.publicKey)
  })

  it('**والمفتاحُ المستخرَج يتحقّق من توقيع الدخول** — لا قولُ العميل', async () => {
    const challenge = newChallenge()
    const result = await verifyRegistration(await registration(challenge), expected(challenge))
    if (!result.ok) throw new Error(result.reason)
    const login = newChallenge()
    const verdict = await verifyAssertion(await assertion(login), { publicKey: result.publicKey, alg: result.alg, signCount: 0 }, expected(login))
    expect(verdict.ok).toBe(true)
  })

  it('**بلا بيانات إقرار يُقال السبب** — لا يفشل صامتا', async () => {
    const challenge = newChallenge()
    const { clientDataJSON } = await registration(challenge)
    const result = await verifyRegistration({ clientDataJSON, attestationObject: null }, expected(challenge))
    expect(result).toMatchObject({ ok: false })
    if (!result.ok) expect(result.reason).toContain('متصفّح أحدث')
  })

  it('بلا راية «بيانات اعتماد مشهودة» يُرفض', async () => {
    const challenge = newChallenge()
    const result = await verifyRegistration(await registration(challenge, { attestedFlag: false }), expected(challenge))
    expect(result).toMatchObject({ ok: false })
  })

  it('خوارزميّة غير مدعومة في COSE تُرفض بالاسم', async () => {
    const challenge = newChallenge()
    const ed25519 = cbor(new Map<CborIn, CborIn>([[1, 1], [3, -8], [-1, 6], [-2, new Uint8Array(32)]]))
    const result = await verifyRegistration(await registration(challenge, { cose: ed25519 }), expected(challenge))
    expect(result).toMatchObject({ ok: false })
    if (!result.ok) expect(result.reason).toContain('-8')
  })

  it('مفتاحُ EC بإحداثيّاتٍ ليست على المنحنى يُرفض عند التسجيل لا عند أوّل دخول', async () => {
    const challenge = newChallenge()
    const bogus = cbor(new Map<CborIn, CborIn>([[1, 2], [3, -7], [-1, 1], [-2, new Uint8Array(32).fill(9)], [-3, new Uint8Array(32).fill(9)]]))
    const result = await verifyRegistration(await registration(challenge, { cose: bogus }), expected(challenge))
    expect(result).toMatchObject({ ok: false })
    if (!result.ok) expect(result.reason).toContain('لا يُقرأ')
  })

  it('نوع «دخول» لا يصلح تسجيلا', async () => {
    const challenge = newChallenge()
    const signed = await key.sign({ challenge, origin: ORIGIN, rpId: RP_ID })
    const { attestationObject } = await registration(challenge)
    const result = await verifyRegistration(
      { clientDataJSON: fromBase64Url(signed.clientDataJSON), attestationObject },
      expected(challenge),
    )
    expect(result).toMatchObject({ ok: false })
  })

  it('نطاقٌ آخر في بيانات المتوثِّق يُرفض', async () => {
    const challenge = newChallenge()
    const made = await key.register({ challenge, origin: ORIGIN, rpId: 'evil.example' })
    const result = await verifyRegistration(
      { clientDataJSON: fromBase64Url(made.clientDataJSON), attestationObject: fromBase64Url(made.attestationObject) },
      expected(challenge),
    )
    expect(result).toMatchObject({ ok: false })
  })
})

describe('decodeCbor — محلّلٌ محدود (D-317)', () => {
  it('يقرأ الخرائطَ والبايتاتِ والنصوصَ والسوالب', () => {
    const bytes = cbor(new Map<CborIn, CborIn>([['a', 1], [-2, new Uint8Array([7, 8])], [3, -300]]))
    const { value, end } = decodeCbor(bytes)
    expect(end).toBe(bytes.length)
    expect(value).toBeInstanceOf(Map)
    const map = value as Map<unknown, unknown>
    expect(map.get('a')).toBe(1)
    expect(map.get(-2)).toEqual(new Uint8Array([7, 8]))
    expect(map.get(3)).toBe(-300)
  })

  it('يرفض طولًا يتجاوز البايتات، والأطوالَ اللانهائيّة، والعمقَ الزائد', () => {
    expect(() => decodeCbor(new Uint8Array([0x5a, 0xff, 0xff, 0xff, 0xff, 1]))).toThrow()
    expect(() => decodeCbor(new Uint8Array([0x5f, 0x41, 1, 0xff]))).toThrow()
    expect(() => decodeCbor(new Uint8Array(Array.from({ length: 20 }, () => 0x81).concat([0])))).toThrow()
  })

  it('ويرفض خريطةً أكبرَ من الحدّ قبل أن يقرأها', () => {
    expect(() => decodeCbor(new Uint8Array([0xb9, 0xff, 0xff]))).toThrow()
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

  it('بيانات متوثِّق أقصر ممّا يجب تُرفض', async () => {
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

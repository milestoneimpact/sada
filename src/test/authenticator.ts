/**
 * متوثِّقٌ برمجيّ للاختبار.
 *
 * يوقّع توقيعا حقيقيّا بـ ECDSA P-256 ويغلّفه بـ DER كما يفعل المتوثِّق
 * الحقيقيّ. فما يُختبر هو **مسارُ التحقّق كلُّه** — بصمةُ النطاق، والرايات،
 * والعدّاد، وفكُّ DER، ونداءُ `crypto.subtle.verify` — لا محاكاةٌ تقول
 * «صحيح» لأنّها كُتبت لتقول ذلك.
 *
 * ولا يُستورَد من شيفرة Worker.
 */
import { toBase64Url } from '../lib/security/bytes'

export interface FakeAuthenticator {
  readonly credentialId: string
  /** المفتاح العامّ SPKI بـ base64url — كما يعطيه `getPublicKey()`. */
  readonly publicKey: string
  readonly alg: number
  sign(input: {
    challenge: string
    origin: string
    rpId: string
    type?: 'webauthn.create' | 'webauthn.get'
    signCount?: number
    userPresent?: boolean
    userVerified?: boolean
  }): Promise<{
    credentialId: string
    authenticatorData: string
    clientDataJSON: string
    signature: string
  }>
}

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', data as BufferSource))
}

/** يبني `authenticatorData` بترتيب المواصفة. */
async function authData(
  rpId: string,
  flags: number,
  signCount: number,
): Promise<Uint8Array> {
  const hash = await sha256(new TextEncoder().encode(rpId))
  const bytes = new Uint8Array(37)
  bytes.set(hash, 0)
  bytes[32] = flags
  new DataView(bytes.buffer).setUint32(33, signCount, false)
  return bytes
}

/** يغلّف `r‖s` بـ DER — عكسُ ما يفكّه `verifyAssertion`. */
function rawToDer(raw: Uint8Array): Uint8Array {
  const trim = (part: Uint8Array): number[] => {
    let i = 0
    while (i < part.length - 1 && part[i] === 0) i += 1
    const value = Array.from(part.slice(i))
    // بايتُ صفرٍ يمنع تفسير الرقم سالبا
    if ((value[0]! & 0x80) !== 0) value.unshift(0)
    return value
  }
  const r = trim(raw.slice(0, 32))
  const s = trim(raw.slice(32))
  const body = [0x02, r.length, ...r, 0x02, s.length, ...s]
  return new Uint8Array([0x30, body.length, ...body])
}

export async function fakeAuthenticator(): Promise<FakeAuthenticator> {
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  )
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey))
  const credentialId = toBase64Url(crypto.getRandomValues(new Uint8Array(16)))

  return {
    credentialId,
    publicKey: toBase64Url(spki),
    alg: -7,
    async sign(input) {
      const clientData = new TextEncoder().encode(
        JSON.stringify({
          type: input.type ?? 'webauthn.get',
          challenge: input.challenge,
          origin: input.origin,
          crossOrigin: false,
        }),
      )
      const flags =
        (input.userPresent === false ? 0 : 0x01) | (input.userVerified === false ? 0 : 0x04)
      const auth = await authData(input.rpId, flags, input.signCount ?? 1)

      const clientHash = await sha256(clientData)
      const signed = new Uint8Array(auth.length + clientHash.length)
      signed.set(auth, 0)
      signed.set(clientHash, auth.length)

      const raw = new Uint8Array(
        await crypto.subtle.sign(
          { name: 'ECDSA', hash: 'SHA-256' },
          pair.privateKey,
          signed as BufferSource,
        ),
      )

      return {
        credentialId,
        authenticatorData: toBase64Url(auth),
        clientDataJSON: toBase64Url(clientData),
        signature: toBase64Url(rawToDer(raw)),
      }
    },
  }
}

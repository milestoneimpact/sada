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
  /**
   * تسجيلٌ كما يرسله المتصفّح (D-317): `attestationObject` بـ CBOR (‏`fmt: none`) وفيه بياناتُ الاعتماد المشهودة —
   * المعرّفُ والمفتاحُ بصيغة COSE. و`override` يبدّل شيئًا ليُختبَر رفضُه.
   */
  register(input: {
    challenge: string
    origin: string
    rpId: string
    signCount?: number
    userPresent?: boolean
    override?: { readonly attestedFlag?: boolean; readonly cose?: Uint8Array; readonly credentialId?: Uint8Array }
  }): Promise<{ credentialId: string; clientDataJSON: string; attestationObject: string }>
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

// ── CBOR للاختبار: ما يكفي لبناء ‹attestationObject› لا أكثر ─────────────

function head(major: number, n: number): number[] {
  if (n < 24) return [(major << 5) | n]
  if (n < 0x100) return [(major << 5) | 24, n]
  if (n < 0x10000) return [(major << 5) | 25, n >> 8, n & 0xff]
  return [(major << 5) | 26, (n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

export type CborIn = number | string | Uint8Array | Map<CborIn, CborIn>

export function cbor(value: CborIn): Uint8Array {
  if (typeof value === 'number') return new Uint8Array(value >= 0 ? head(0, value) : head(1, -1 - value))
  if (typeof value === 'string') {
    const bytes = new TextEncoder().encode(value)
    return new Uint8Array([...head(3, bytes.length), ...bytes])
  }
  if (value instanceof Uint8Array) return new Uint8Array([...head(2, value.length), ...value])
  const parts: number[] = [...head(5, value.size)]
  for (const [k, v] of value) parts.push(...cbor(k), ...cbor(v))
  return new Uint8Array(parts)
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
  const rawId = crypto.getRandomValues(new Uint8Array(16))
  const credentialId = toBase64Url(rawId)
  const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey)
  const fromB64u = (v: string): Uint8Array => Uint8Array.from(atob(v.replace(/-/g, '+').replace(/_/g, '/')), (ch) => ch.charCodeAt(0))
  // ‏مفتاحُ COSE كما يكتبه المتوثِّق: kty=2 (EC2)، alg=-7، crv=1 (P-256)، x، y
  const coseKey = cbor(new Map<CborIn, CborIn>([[1, 2], [3, -7], [-1, 1], [-2, fromB64u(jwk.x ?? '')], [-3, fromB64u(jwk.y ?? '')]]))

  return {
    credentialId,
    publicKey: toBase64Url(spki),
    alg: -7,
    async register(input) {
      const clientData = new TextEncoder().encode(
        JSON.stringify({ type: 'webauthn.create', challenge: input.challenge, origin: input.origin, crossOrigin: false }),
      )
      const flags = (input.userPresent === false ? 0 : 0x01) | 0x04 | (input.override?.attestedFlag === false ? 0 : 0x40)
      const base = await authData(input.rpId, flags, input.signCount ?? 0)
      const id = input.override?.credentialId ?? rawId
      const key = input.override?.cose ?? coseKey
      const attested = new Uint8Array([...base, ...new Uint8Array(16), id.length >> 8, id.length & 0xff, ...id, ...key])
      const attestationObject = cbor(new Map<CborIn, CborIn>([['fmt', 'none'], ['attStmt', new Map()], ['authData', attested]]))
      return {
        credentialId: toBase64Url(id),
        clientDataJSON: toBase64Url(clientData),
        attestationObject: toBase64Url(attestationObject),
      }
    },
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

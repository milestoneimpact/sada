/**
 * WebAuthn — التحقّق من مفاتيح المرور.
 *
 * ولمَ Passkey أصلا؟ لأنّها **مقاومةٌ للتصيّد بالبناء لا بالحذر**: المفتاح
 * موقّعٌ على اسم النطاق، فصفحةٌ مزوّرة على عنوانٍ يشبهه لا تحصل على توقيع
 * مهما أتقنت الشكل. وهذا ما لا يفعله رمزٌ يُكتب ولا رقمٌ يُنسَخ من تطبيق.
 *
 * ## المفتاحُ من بيانات الاعتماد المشهودة لا من العميل (D-317)
 *
 * كان التسجيلُ يأخذ المفتاحَ العامَّ ومعرّفَ الاعتماد كما يرسلهما العميل (`getPublicKey()`)، ولا يربطهما بما وقّع عليه
 * المتوثِّق: «ما لا نحلّله لا نُخطئ في تحليله». والثمنُ أنّ ما يُحفظ قولُ العميل لا قولُ المتوثِّق. فصار
 * `attestationObject` يُفكّ (CBOR) بمحلّلٍ صغيرٍ **محدودِ العمق والطول والأنواع** (`decodeCbor`)، ويُقرأ منه
 * `authData` ثمّ «بيانات الاعتماد المشهودة»: المعرّفُ والمفتاحُ بصيغة COSE، ويُحوَّل المفتاحُ إلى SPKI بـ `crypto.subtle`.
 * فلا يُحفظ إلّا مفتاحٌ قاله المتوثِّقُ على نطاقنا بعلامة «حاضر». والإقرارُ نفسُه (`attStmt`) لا يُفحص: نطلب `none`.
 *
 * ## ما يُفكَّك: `authenticatorData`
 *
 * بايتاتٌ بترتيبٍ ثابت لا CBOR فيها:
 *
 *     [٠..٣١]   بصمةُ اسم النطاق (SHA-256)
 *     [٣٢]      الرايات — الأولى «حاضر»، والثالثة «تُحقِّق منه»
 *     [٣٣..٣٦]  عدّادُ التوقيع، كبير الطرف
 *     [٣٧..]    في التسجيل وحده (الراية 0x40): AAGUID ‏16 بايتًا، وطولُ المعرّف بايتان، ثمّ المعرّف، ثمّ المفتاحُ بـ COSE
 */
import { equalBytes, fromBase64Url, randomBytes, sha256, toBase64Url } from './bytes'

/** ES256 و RS256 — ما يدعمه كلّ متوثِّقٍ عمليّا. */
export const ES256 = -7
export const RS256 = -257

export const CHALLENGE_TTL_SECONDS = 5 * 60

export interface ClientData {
  readonly type: string
  readonly challenge: string
  readonly origin: string
  readonly crossOrigin?: boolean
}

export interface Expected {
  /** التحدّي كما أُرسل — `base64url`. */
  readonly challenge: string
  /** أصلُ الصفحة كاملا: `https://sada2.basserh.com`. */
  readonly origin: string
  /** اسمُ النطاق الذي وُقّع عليه. */
  readonly rpId: string
}

export type Verdict =
  | { readonly ok: true; readonly signCount: number; readonly userVerified: boolean }
  | { readonly ok: false; readonly reason: string }

function fail(reason: string): Verdict {
  return { ok: false, reason }
}

/** تحدٍّ جديد — اثنان وثلاثون بايتا. */
export function newChallenge(): string {
  return toBase64Url(randomBytes(32))
}

/**
 * يقرأ `clientDataJSON` ويفحص الثلاثة التي تُثبت أنّ هذا التوقيع لنا.
 *
 * وترتيبُ الفحوص لا يهمّ أمنيّا، لكنّ الرسائل تهمّ: «الأصل لا يطابق» تقول
 * للمالك إنّ نطاقا خطأً في الضبط، و«التحدّي لا يطابق» تقول إنّ الجلسة
 * انتهت أو أُعيد إرسالٌ قديم.
 */
export function checkClientData(
  raw: Uint8Array,
  kind: 'webauthn.create' | 'webauthn.get',
  expected: Expected,
): { ok: true } | { ok: false; reason: string } {
  let data: ClientData
  try {
    data = JSON.parse(new TextDecoder().decode(raw)) as ClientData
  } catch {
    return { ok: false, reason: 'بيانات العميل ليست JSON صالحا' }
  }

  // ‏وما أرسله الطالبُ لا يُعاد كاملًا في السبب: قد يكون مليونَ بايت (D-161)
  if (data.type !== kind) return { ok: false, reason: `نوع غير متوقّع: ${String(data.type).slice(0, 40)}` }
  // مقارنةُ نصٍّ لا بايتات: التحدّي معرَّفٌ في المواصفة نصّا بـ base64url
  if (data.challenge !== expected.challenge) {
    return { ok: false, reason: 'التحدّي لا يطابق — انتهت المهلة أو أُعيد إرسال قديم' }
  }
  if (data.origin !== expected.origin) {
    return { ok: false, reason: `الأصل لا يطابق: ${String(data.origin).slice(0, 80)}` }
  }
  if (data.crossOrigin === true) {
    return { ok: false, reason: 'طلب من إطار عابر للأصل — مرفوض' }
  }
  return { ok: true }
}

export interface AuthData {
  readonly rpIdHash: Uint8Array
  readonly userPresent: boolean
  readonly userVerified: boolean
  readonly signCount: number
}

/** يقرأ `authenticatorData`. يرجع `null` إن قَصُر عن أقلّ طولٍ ممكن. */
export function readAuthData(bytes: Uint8Array): AuthData | null {
  if (bytes.length < 37) return null
  const flags = bytes[32]!
  const view = new DataView(bytes.buffer, bytes.byteOffset + 33, 4)
  return {
    rpIdHash: bytes.slice(0, 32),
    userPresent: (flags & 0x01) !== 0,
    userVerified: (flags & 0x04) !== 0,
    signCount: view.getUint32(0, false),
  }
}

async function checkAuthData(bytes: Uint8Array, expected: Expected): Promise<
  { ok: true; data: AuthData } | { ok: false; reason: string }
> {
  const data = readAuthData(bytes)
  if (data === null) return { ok: false, reason: 'بيانات المتوثِّق أقصر من أن تكون صحيحة' }

  if (!equalBytes(data.rpIdHash, await sha256(expected.rpId))) {
    return { ok: false, reason: 'المفتاح موقَّع على نطاق آخر' }
  }
  // «حاضر» تعني أنّ إنسانا لمس شيئا. وبدونها التوقيع قد يكون آليّا
  if (!data.userPresent) return { ok: false, reason: 'لم يُثبَت حضور المستخدم' }
  return { ok: true, data }
}

/**
 * توقيعُ ECDSA من WebAuthn يجيء بصيغة DER، و Web Crypto يريد `r‖s` خامّا.
 *
 * وهو فرقٌ لا يظهر في قراءة الشيفرة: التحقّق يفشل دائما، والسبب أنّ
 * ثلاثين بايتا من التغليف تُقرأ على أنّها رقم.
 */
function derToRaw(der: Uint8Array): Uint8Array | null {
  if (der.length < 8 || der[0] !== 0x30) return null
  let offset = 2
  // طولٌ طويل الصيغة: البايت الثاني يحمل عدد بايتات الطول
  if ((der[1]! & 0x80) !== 0) offset = 2 + (der[1]! & 0x7f)

  const read = (): Uint8Array | null => {
    if (der[offset] !== 0x02) return null
    const length = der[offset + 1]!
    const start = offset + 2
    offset = start + length
    if (offset > der.length) return null
    let value = der.slice(start, offset)
    // يُنزع بايتُ الصفر الذي يمنع تفسير الرقم سالبا
    while (value.length > 32 && value[0] === 0) value = value.slice(1)
    if (value.length > 32) return null
    const padded = new Uint8Array(32)
    padded.set(value, 32 - value.length)
    return padded
  }

  const r = read()
  if (r === null) return null
  const s = read()
  if (s === null) return null

  const raw = new Uint8Array(64)
  raw.set(r, 0)
  raw.set(s, 32)
  return raw
}

async function importKey(spki: Uint8Array, alg: number): Promise<CryptoKey> {
  return alg === RS256
    ? await crypto.subtle.importKey(
        'spki',
        spki as BufferSource,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify'],
      )
    : await crypto.subtle.importKey(
        'spki',
        spki as BufferSource,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['verify'],
      )
}

export interface StoredCredential {
  /** المفتاح العامّ بصيغة SPKI، مكتوبا `base64url`. */
  readonly publicKey: string
  readonly alg: number
  /** آخرُ عدّادٍ رأيناه. صفرٌ يعني «لا يعدّ هذا المتوثِّق». */
  readonly signCount: number
}

export interface Assertion {
  readonly authenticatorData: Uint8Array
  readonly clientDataJSON: Uint8Array
  readonly signature: Uint8Array
}

/**
 * يتحقّق من دخولٍ بمفتاح مرور.
 *
 * وفحصُ عدّاد التوقيع هو ما يكشف **استنساخ** المتوثِّق: عدّادٌ لم يتقدّم
 * يعني نسخةً ثانيةً من المفتاح تُستعمل بالتوازي.
 *
 * **ويُتخطّى الفحصُ في حالٍ واحدة لا اثنتين**: أن يكون المحفوظ صفرا
 * والوارد صفرا معا — وهذا متوثِّقٌ لا يعدّ أصلا. أمّا محفوظٌ تقدّم ثمّ
 * وارِدٌ صفر فهو عينُ ما وُضع الفحص له: مفتاحٌ عدّاده بلغ خمسا لا يعود
 * إلى الصفر من نفسه. وكان الشرط `&&` فيسقط الفحصُ هنا، ثمّ يكتب
 * `touchPasskey` الصفرَ فوق الخمسة فيمحو الأثر الذي كان يدلّ.
 *
 * وهو ما تقوله المواصفة (WebAuthn §7.2): يُقارَن ما لم يكونا صفرين.
 */
export async function verifyAssertion(
  assertion: Assertion,
  credential: StoredCredential,
  expected: Expected,
): Promise<Verdict> {
  const client = checkClientData(assertion.clientDataJSON, 'webauthn.get', expected)
  if (!client.ok) return fail(client.reason)

  const auth = await checkAuthData(assertion.authenticatorData, expected)
  if (!auth.ok) return fail(auth.reason)

  const neitherCounts = credential.signCount === 0 && auth.data.signCount === 0
  if (!neitherCounts && auth.data.signCount <= credential.signCount) {
    return fail('عدّاد التوقيع لم يتقدّم — قد يكون المفتاح مستنسَخا')
  }

  // ما وُقّع عليه: بيانات المتوثِّق ثمّ بصمةُ بيانات العميل
  const clientHash = await sha256(assertion.clientDataJSON)
  const signed = new Uint8Array(assertion.authenticatorData.length + clientHash.length)
  signed.set(assertion.authenticatorData, 0)
  signed.set(clientHash, assertion.authenticatorData.length)

  let key: CryptoKey
  try {
    key = await importKey(fromBase64Url(credential.publicKey), credential.alg)
  } catch {
    return fail('تعذّر قراءة المفتاح العامّ المحفوظ')
  }

  let signature = assertion.signature
  if (credential.alg !== RS256) {
    const raw = derToRaw(signature)
    if (raw === null) return fail('صيغة التوقيع غير مفهومة')
    signature = raw
  }

  const valid = await crypto.subtle.verify(
    credential.alg === RS256
      ? { name: 'RSASSA-PKCS1-v1_5' }
      : { name: 'ECDSA', hash: 'SHA-256' },
    key,
    signature as BufferSource,
    signed as BufferSource,
  )
  if (!valid) return fail('التوقيع لا يصحّ')

  return { ok: true, signCount: auth.data.signCount, userVerified: auth.data.userVerified }
}

// ── CBOR: محلّلٌ صغيرٌ محدود (D-317) ───────────────────────────────────

/** ما يقرؤه المحلّل: أعدادٌ صحيحة وبايتاتٌ ونصوصٌ ومصفوفاتٌ وخرائط، و`true`/`false`/`null`. ولا أعدادَ عشريّة ولا وسوم. */
export type Cbor = number | Uint8Array | string | boolean | null | Cbor[] | Map<Cbor, Cbor>

const CBOR_MAX_DEPTH = 8
const CBOR_MAX_ITEMS = 256

class CborError extends Error {}

/**
 * يفكّ عنصرًا واحدًا من `bytes` بدءًا من `offset`، ويعيده ومعه موضعَ ما بعده.
 *
 * **ومحدودٌ عمدًا**: عمقٌ لا يتجاوز ثمانية، وعناصرُ لا تتجاوز مئتين وستّة وخمسين في الحاوية، وطولٌ لا يتجاوز ما بقي من
 * البايتات، والأطوالُ اللانهائيّة (`0x1f`) والوسومُ والأعدادُ العشريّة مرفوضة — فمدخلٌ مصنوعٌ لا يستنزف ذاكرةً ولا وقتًا.
 */
export function decodeCbor(bytes: Uint8Array, offset = 0, depth = 0): { value: Cbor; end: number } {
  if (depth > CBOR_MAX_DEPTH) throw new CborError('عمقٌ زائد')
  if (offset >= bytes.length) throw new CborError('انتهت البايتات')
  const head = bytes[offset]!
  const major = head >> 5
  const info = head & 0x1f
  let pos = offset + 1
  const need = (n: number): void => {
    if (pos + n > bytes.length) throw new CborError('طولٌ يتجاوز البايتات')
  }
  let arg: number
  if (info < 24) arg = info
  else if (info === 24) { need(1); arg = bytes[pos]!; pos += 1 }
  else if (info === 25) { need(2); arg = (bytes[pos]! << 8) | bytes[pos + 1]!; pos += 2 }
  else if (info === 26) { need(4); arg = new DataView(bytes.buffer, bytes.byteOffset + pos, 4).getUint32(0); pos += 4 }
  else throw new CborError('صيغةٌ غير مدعومة')

  switch (major) {
    case 0: return { value: arg, end: pos }
    case 1: return { value: -1 - arg, end: pos }
    case 2: need(arg); return { value: bytes.slice(pos, pos + arg), end: pos + arg }
    case 3: need(arg); return { value: new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes.slice(pos, pos + arg)), end: pos + arg }
    case 4: {
      if (arg > CBOR_MAX_ITEMS) throw new CborError('مصفوفةٌ أكبر من الحدّ')
      const out: Cbor[] = []
      for (let i = 0; i < arg; i += 1) {
        const item = decodeCbor(bytes, pos, depth + 1)
        out.push(item.value)
        pos = item.end
      }
      return { value: out, end: pos }
    }
    case 5: {
      if (arg > CBOR_MAX_ITEMS) throw new CborError('خريطةٌ أكبر من الحدّ')
      const out = new Map<Cbor, Cbor>()
      for (let i = 0; i < arg; i += 1) {
        const k = decodeCbor(bytes, pos, depth + 1)
        const v = decodeCbor(bytes, k.end, depth + 1)
        out.set(k.value, v.value)
        pos = v.end
      }
      return { value: out, end: pos }
    }
    case 7:
      if (info === 20) return { value: false, end: pos }
      if (info === 21) return { value: true, end: pos }
      if (info === 22) return { value: null, end: pos }
      throw new CborError('قيمةٌ بسيطةٌ غير مدعومة')
    default:
      throw new CborError('نوعٌ غير مدعوم')
  }
}

/** بيانات الاعتماد المشهودة كما قالها المتوثِّق. */
export interface AttestedCredential {
  readonly authData: Uint8Array
  readonly credentialId: Uint8Array
  /** المفتاحُ بصيغة SPKI بعد تحويله من COSE. */
  readonly publicKey: Uint8Array
  readonly alg: number
}

const AT_FLAG = 0x40

/** يحوّل مفتاح COSE إلى SPKI بـ `crypto.subtle` — ‏ES256 (P-256) وRS256 وحدهما. */
async function coseToSpki(cose: Map<Cbor, Cbor>): Promise<{ spki: Uint8Array; alg: number } | { error: string }> {
  const kty = cose.get(1)
  const alg = cose.get(3)
  if (alg !== ES256 && alg !== RS256) return { error: `خوارزميّة غير مدعومة: ${String(alg)}` }
  let jwk: JsonWebKey
  if (alg === ES256) {
    const crv = cose.get(-1)
    const x = cose.get(-2)
    const y = cose.get(-3)
    if (kty !== 2 || crv !== 1 || !(x instanceof Uint8Array) || !(y instanceof Uint8Array) || x.length !== 32 || y.length !== 32) {
      return { error: 'مفتاح EC غير صالح في بيانات الاعتماد' }
    }
    jwk = { kty: 'EC', crv: 'P-256', x: toBase64Url(x), y: toBase64Url(y), ext: true }
  } else {
    const n = cose.get(-1)
    const e = cose.get(-2)
    if (kty !== 3 || !(n instanceof Uint8Array) || !(e instanceof Uint8Array) || n.length < 256) {
      return { error: 'مفتاح RSA غير صالح في بيانات الاعتماد' }
    }
    jwk = { kty: 'RSA', n: toBase64Url(n), e: toBase64Url(e), alg: 'RS256', ext: true }
  }
  try {
    const key = await crypto.subtle.importKey(
      'jwk', jwk,
      alg === RS256 ? { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' } : { name: 'ECDSA', namedCurve: 'P-256' },
      true, ['verify'],
    )
    return { spki: new Uint8Array((await crypto.subtle.exportKey('spki', key)) as ArrayBuffer), alg }
  } catch {
    return { error: 'المفتاح العامّ لا يُقرأ' }
  }
}

/**
 * يقرأ `attestationObject`: خريطةَ CBOR فيها `authData`، ومنها بياناتُ الاعتماد المشهودة. ويرمي `CborError` لما لا يُقرأ.
 */
export async function readAttestation(attestationObject: Uint8Array): Promise<AttestedCredential | { error: string }> {
  let top: Cbor
  try {
    const decoded = decodeCbor(attestationObject)
    top = decoded.value
  } catch {
    return { error: 'بيانات الإقرار لا تُقرأ' }
  }
  if (!(top instanceof Map)) return { error: 'بيانات الإقرار ليست خريطة' }
  const authData = top.get('authData')
  if (!(authData instanceof Uint8Array) || authData.length < 37 + 18) return { error: 'بيانات المتوثِّق ناقصة' }
  if ((authData[32]! & AT_FLAG) === 0) return { error: 'لا بيانات اعتمادٍ مشهودة في التسجيل' }
  const idLength = (authData[53]! << 8) | authData[54]!
  if (idLength === 0 || idLength > 1023 || 55 + idLength > authData.length) return { error: 'طولُ معرّف الاعتماد غير صالح' }
  const credentialId = authData.slice(55, 55 + idLength)
  let cose: Cbor
  try {
    cose = decodeCbor(authData, 55 + idLength).value
  } catch {
    return { error: 'مفتاح COSE لا يُقرأ' }
  }
  if (!(cose instanceof Map)) return { error: 'مفتاح COSE ليس خريطة' }
  const key = await coseToSpki(cose)
  if ('error' in key) return key
  return { authData, credentialId, publicKey: key.spki, alg: key.alg }
}

export type RegistrationVerdict =
  | {
      readonly ok: true
      readonly signCount: number
      readonly userVerified: boolean
      /** معرّفُ الاعتماد والمفتاحُ كما قالهما المتوثِّق — بـ base64url، والمفتاحُ SPKI. */
      readonly credentialId: string
      readonly publicKey: string
      readonly alg: number
    }
  | { readonly ok: false; readonly reason: string }

/**
 * يتحقّق من تسجيلِ مفتاحٍ جديد (D-317).
 *
 * يُفحص أنّ بيانات العميل لنا (النوعُ والتحدّي والأصل)، ثمّ يُقرأ `attestationObject`: نطاقُه ورايةُ «حاضر»، ومنه
 * **المعرّفُ والمفتاحُ نفسُهما** — فلا يُحفظ مفتاحٌ لم يقله المتوثِّق. والخوارزميّةُ ممّا ندعم، والمفتاحُ يُستورَد الآن
 * ليُرفض المشوَّه هنا لا عند أوّل دخول.
 */
export async function verifyRegistration(
  input: {
    readonly clientDataJSON: Uint8Array
    readonly attestationObject: Uint8Array | null
  },
  expected: Expected,
): Promise<RegistrationVerdict> {
  const client = checkClientData(input.clientDataJSON, 'webauthn.create', expected)
  if (!client.ok) return { ok: false, reason: client.reason }

  if (input.attestationObject === null || input.attestationObject.length === 0) {
    return { ok: false, reason: 'لم تصل بيانات الإقرار — يلزم متصفّح أحدث' }
  }
  const attested = await readAttestation(input.attestationObject)
  if ('error' in attested) return { ok: false, reason: attested.error }

  const auth = await checkAuthData(attested.authData, expected)
  if (!auth.ok) return { ok: false, reason: auth.reason }

  return {
    ok: true,
    signCount: auth.data.signCount,
    userVerified: auth.data.userVerified,
    credentialId: toBase64Url(attested.credentialId),
    publicKey: toBase64Url(attested.publicKey),
    alg: attested.alg,
  }
}

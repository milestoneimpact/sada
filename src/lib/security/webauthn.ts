/**
 * WebAuthn — التحقّق من مفاتيح المرور.
 *
 * ولمَ Passkey أصلا؟ لأنّها **مقاومةٌ للتصيّد بالبناء لا بالحذر**: المفتاح
 * موقّعٌ على اسم النطاق، فصفحةٌ مزوّرة على عنوانٍ يشبهه لا تحصل على توقيع
 * مهما أتقنت الشكل. وهذا ما لا يفعله رمزٌ يُكتب ولا رقمٌ يُنسَخ من تطبيق.
 *
 * ## ما لا يُفعل هنا: تفكيك CBOR
 *
 * `attestationObject` مغلَّفٌ بـ CBOR، وتفكيكُه شيفرةُ تحليلٍ لمدخلٍ لا
 * نثق به — وهو الموضع الذي تسكن فيه الثغرات. والمتصفّح يقدّم المفتاح
 * جاهزا بـ `getPublicKey()` بصيغة SPKI، فيُستورَد بـ `crypto.subtle`
 * مباشرة. **فما لا نحلّله لا نُخطئ في تحليله.**
 *
 * وثمنُه أنّ متصفّحا قديما لا يعطي `getPublicKey()` — ويُقال ذلك للمالك
 * صراحةً بدل أن يفشل التسجيل بلا تفسير.
 *
 * ## ما يُفكَّك: `authenticatorData`
 *
 * بايتاتٌ بترتيبٍ ثابت لا CBOR فيها:
 *
 *     [٠..٣١]   بصمةُ اسم النطاق (SHA-256)
 *     [٣٢]      الرايات — الأولى «حاضر»، والثالثة «تُحقِّق منه»
 *     [٣٣..٣٦]  عدّادُ التوقيع، كبير الطرف
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
  if (data.type !== kind) return { ok: false, reason: `نوعٌ غير متوقّع: ${String(data.type).slice(0, 40)}` }
  // مقارنةُ نصٍّ لا بايتات: التحدّي معرَّفٌ في المواصفة نصّا بـ base64url
  if (data.challenge !== expected.challenge) {
    return { ok: false, reason: 'التحدّي لا يطابق — انتهت المهلة أو أُعيد إرسالٌ قديم' }
  }
  if (data.origin !== expected.origin) {
    return { ok: false, reason: `الأصل لا يطابق: ${String(data.origin).slice(0, 80)}` }
  }
  if (data.crossOrigin === true) {
    return { ok: false, reason: 'طلبٌ من إطارٍ عابرٍ للأصل — مرفوض' }
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
    return { ok: false, reason: 'المفتاح موقَّعٌ على نطاقٍ آخر' }
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
    if (raw === null) return fail('صيغةُ التوقيع غير مفهومة')
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

/**
 * يتحقّق من تسجيلِ مفتاحٍ جديد.
 *
 * والمفتاحُ العامّ يجيء من المتصفّح لا من تفكيكنا — انظر رأس الملفّ. فما
 * يُفحص هنا: أنّ بيانات العميل لنا، وأنّ المتوثِّق وقّع على نطاقنا، وأنّ
 * الخوارزميّة ممّا ندعم.
 */
export async function verifyRegistration(
  input: {
    readonly clientDataJSON: Uint8Array
    readonly authenticatorData: Uint8Array
    readonly publicKey: Uint8Array | null
    readonly alg: number
  },
  expected: Expected,
): Promise<Verdict> {
  const client = checkClientData(input.clientDataJSON, 'webauthn.create', expected)
  if (!client.ok) return fail(client.reason)

  const auth = await checkAuthData(input.authenticatorData, expected)
  if (!auth.ok) return fail(auth.reason)

  if (input.publicKey === null || input.publicKey.length === 0) {
    return fail('متصفّحك لا يقدّم المفتاح العامّ مباشرةً — يلزم متصفّح أحدث')
  }
  if (input.alg !== ES256 && input.alg !== RS256) {
    return fail(`خوارزميّةٌ غير مدعومة: ${input.alg}`)
  }

  // يُستورَد الآن ليُرفض المشوَّه هنا لا عند أوّل دخول
  try {
    await importKey(input.publicKey, input.alg)
  } catch {
    return fail('المفتاح العامّ لا يُقرأ')
  }

  return { ok: true, signCount: auth.data.signCount, userVerified: auth.data.userVerified }
}

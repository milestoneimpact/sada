/**
 * نافذةٌ موقّعةٌ على وسيطٍ في R2 — تُفتَح لحظةَ النشر وتُغلق بعده.
 *
 * ## لماذا فُتحت أصلا، وقد كان الإغلاقُ مقصودا
 *
 * `‎/panel/media/:id` خلف الجلسة عمدا: صورةُ منشورٍ لم يُنشر بعد تكشف
 * ما يُعدّه المالك قبل أن يعلنه.
 *
 * **و Instagram و TikTok و YouTube لا تقبل رفعَ بايتات.** تطلب
 * `image_url` أو `video_url` — **عنوانا يفتحه خادمُها بنفسه**، ولا
 * جلسةَ له ولا كعكة. فإمّا نافذة، وإمّا لا نشرَ على الثلاث.
 *
 * ## وأضيقُ نافذةٍ تكفي
 *
 * **مُوقَّعة**: لا تُخمَّن. المعرّفُ وحده لا يفتح شيئا — يلزم توقيعٌ
 * بمفتاحٍ في أسرار Worker.
 *
 * **قصيرةٌ**: خمسَ عشرةَ دقيقة. أطولُ من أيّ سحبٍ للمنصّة، وأقصرُ من
 * أن يُترك رابطٌ حيّا في سجلٍّ أو تاريخِ متصفّح.
 *
 * **ومقصورةٌ على وسيطٍ بعينه**: التوقيعُ يشمل المعرّف، فرابطُ صورةٍ لا
 * يفتح غيرَها.
 *
 * ## والمفتاحُ مشتقٌّ لا مُعاد
 *
 * `TOKEN_ENC_KEY` مفتاحُ AES-GCM لتشفير الرموز. **واستعمالُ مفتاحٍ
 * واحدٍ لخوارزميّتين خطأٌ معروف**: تسريبٌ في إحداهما يُضعف الأخرى.
 * فيُشتقّ منه مفتاحُ HMAC بـ HKDF بمعلومةٍ خاصّة — ولا يُستعمل هو نفسه.
 */
import { fromBase64 } from '../crypto'

/** خمسَ عشرةَ دقيقة — أطولُ من أيّ سحبٍ، وأقصرُ من أن يُنسى مفتوحا. */
export const WINDOW_SECONDS = 900

export class LinkError extends Error {
  override readonly name = 'LinkError'
}

/** ترميزٌ آمنٌ في المسار: لا `+` ولا `/` ولا `=`. */
function b64url(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function unb64url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  return fromBase64(padded + '='.repeat((4 - (padded.length % 4)) % 4))
}

/**
 * مفتاحُ التوقيع — مشتقٌّ من مفتاح التشفير لا هو.
 *
 * والمعلومةُ (`info`) تربط الاشتقاقَ بغرضه: مفتاحٌ اشتُقّ لروابط الوسائط
 * لا يوقّع شيئا آخر ولو تسرّب.
 */
async function signingKey(encKey: string): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw', fromBase64(encKey) as BufferSource, 'HKDF', false, ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(0),
      info: new TextEncoder().encode('sada:media-url:v1'),
    },
    material,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

/** الجسدُ الموقَّع: المعرّفُ ولحظةُ الانتهاء، مفصولان بنقطة. */
function payload(mediaId: string, expiresAt: number): string {
  return `${mediaId}.${expiresAt}`
}

/**
 * رمزُ نافذةٍ لوسيطٍ بعينه.
 *
 * ولا يحمل شيئا سرّيّا: معرّفٌ ولحظةٌ وتوقيع. فمن قرأه في سجلٍّ لم يقرأ
 * إلّا ما يعرفه أصلا — **وانتهت صلاحيّتُه قبل أن يقرأه**.
 */
export async function signMediaToken(
  encKey: string,
  mediaId: string,
  now: Date = new Date(),
  windowSeconds: number = WINDOW_SECONDS,
): Promise<string> {
  if (mediaId.includes('.')) throw new LinkError('معرّفٌ فيه نقطة يلبس على الفاصل')
  const expiresAt = Math.floor(now.getTime() / 1000) + windowSeconds
  const key = await signingKey(encKey)
  const body = payload(mediaId, expiresAt)
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  return `${b64url(new TextEncoder().encode(body))}.${b64url(new Uint8Array(mac))}`
}

export type Verdict =
  | { readonly ok: true; readonly mediaId: string }
  | { readonly ok: false; readonly reason: 'malformed' | 'bad_signature' | 'expired' }

/**
 * يتحقّق ويقرأ.
 *
 * **والتوقيعُ يُفحَص قبل الانتهاء** لا بعده: من فحص الانتهاءَ أوّلا
 * أخبر المهاجمَ أنّ رمزَه صالحُ الشكلِ منتهي الوقت — وهو فرقٌ يُبنى
 * عليه. ويُفحَص بـ `verify` لا بمقارنةِ نصّين: المقارنةُ العاديّة
 * **تنتهي عند أوّل اختلاف**، فزمنُها يفشي كم حرفا صحّ.
 */
export async function verifyMediaToken(
  encKey: string,
  token: string,
  now: Date = new Date(),
): Promise<Verdict> {
  const dot = token.lastIndexOf('.')
  if (dot <= 0) return { ok: false, reason: 'malformed' }

  let body: string
  let mac: Uint8Array
  try {
    body = new TextDecoder().decode(unb64url(token.slice(0, dot)))
    mac = unb64url(token.slice(dot + 1))
  } catch {
    return { ok: false, reason: 'malformed' }
  }

  const key = await signingKey(encKey)
  const valid = await crypto.subtle.verify(
    'HMAC', key, mac as BufferSource, new TextEncoder().encode(body),
  )
  if (!valid) return { ok: false, reason: 'bad_signature' }

  const sep = body.lastIndexOf('.')
  if (sep <= 0) return { ok: false, reason: 'malformed' }
  const mediaId = body.slice(0, sep)
  const expiresAt = Number(body.slice(sep + 1))
  if (!Number.isFinite(expiresAt)) return { ok: false, reason: 'malformed' }

  if (Math.floor(now.getTime() / 1000) >= expiresAt) return { ok: false, reason: 'expired' }
  return { ok: true, mediaId }
}

/** الرابطُ كاملا — يُبنى من `PUBLIC_BASE_URL` ولا يُكتب ثابتا. */
export function mediaUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/m/${token}`
}

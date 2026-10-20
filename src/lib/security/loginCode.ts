/**
 * رمزُ الدخول بالبريد (D-245) — ستّةُ أرقامٍ لمرّةٍ واحدة.
 *
 * - **لا يُخزَّن الرمز**: بصمتُه SHA-256 بملحٍ لكلّ رمز، في KV بمهلة عشر دقائق.
 * - **مرّةً واحدة**: يُمحى عند أوّل قبول، **وبعد خمس محاولاتٍ خاطئة** يُمحى أيضا.
 * - **وسقفٌ للإرسال**: رسالةٌ في الدقيقة وخمسٌ في الساعة لكلّ عنوان — فلا يصير
 *   النموذجُ مدفعًا يملأ صندوق المالك.
 * - والمقارنةُ بزمنٍ ثابت، والرمزُ لا يُطبَع في سجلٍّ قطّ.
 *
 * وKV ليس ذرّيًّا: طلبان متزامنان قد يقرآن العدّادَ نفسَه. والثمنُ محاولةٌ زائدةٌ
 * أو اثنتان من مليون احتمال، والحدُّ بالعنوان في D1 (`reserveAttempt`) يحرس فوقه.
 */
import { digest, randomToken, sameBytes } from './digest'

export const CODE_TTL_SECONDS = 10 * 60
export const CODE_MAX_ATTEMPTS = 5
export const SEND_GAP_SECONDS = 60
export const SEND_PER_HOUR = 5

export interface CodeStore {
  get(key: string): Promise<string | null>
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
  delete(key: string): Promise<void>
}

interface StoredCode {
  readonly salt: string
  readonly hash: string
  readonly attempts: number
  readonly exp: number
}

const codeKey = (email: string): string => `logincode:${email}`
const gapKey = (email: string): string => `logincode-gap:${email}`
const hourKey = (email: string): string => `logincode-hour:${email}`

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

async function hashCode(salt: string, code: string): Promise<string> {
  return toHex(await digest(`${salt}:${code}`))
}

/** ستّةُ أرقامٍ من `crypto` — بلا انحياز: يُرفض ما فوق آخر مضاعفٍ للمليون. */
export function newCode(): string {
  const buf = new Uint32Array(1)
  const limit = Math.floor(0x1_0000_0000 / 1_000_000) * 1_000_000
  for (;;) {
    crypto.getRandomValues(buf)
    if (buf[0]! < limit) return String(buf[0]! % 1_000_000).padStart(6, '0')
  }
}

export type IssueResult =
  | { readonly ok: true; readonly code: string }
  | { readonly ok: false; readonly reason: 'too_soon' | 'hourly_cap' }

/** يصدر رمزًا جديدًا إن سمح السقف — ويُبطل ما قبله. */
export async function issueCode(store: CodeStore, email: string, now = Date.now()): Promise<IssueResult> {
  if ((await store.get(gapKey(email))) !== null) return { ok: false, reason: 'too_soon' }
  const hour = JSON.parse((await store.get(hourKey(email))) ?? 'null') as { n: number; until: number } | null
  const window = hour !== null && hour.until > now ? hour : { n: 0, until: now + 3600_000 }
  if (window.n >= SEND_PER_HOUR) return { ok: false, reason: 'hourly_cap' }

  const code = newCode()
  const salt = randomToken(16)
  const stored: StoredCode = { salt, hash: await hashCode(salt, code), attempts: 0, exp: now + CODE_TTL_SECONDS * 1000 }
  await store.put(codeKey(email), JSON.stringify(stored), { expirationTtl: CODE_TTL_SECONDS })
  await store.put(gapKey(email), '1', { expirationTtl: SEND_GAP_SECONDS })
  await store.put(hourKey(email), JSON.stringify({ n: window.n + 1, until: window.until }), {
    expirationTtl: Math.max(60, Math.ceil((window.until - now) / 1000)),
  })
  return { ok: true, code }
}

export type VerifyResult = { readonly ok: true } | { readonly ok: false; readonly reason: 'none' | 'wrong' | 'exhausted' }

/** يتحقّق من رمز — ويستهلكه إن قُبل، ويُبطله بعد الخامسة الخاطئة. */
export async function verifyCode(store: CodeStore, email: string, presented: string, now = Date.now()): Promise<VerifyResult> {
  const raw = await store.get(codeKey(email))
  if (raw === null) return { ok: false, reason: 'none' }
  let stored: StoredCode
  try {
    stored = JSON.parse(raw) as StoredCode
  } catch {
    await store.delete(codeKey(email))
    return { ok: false, reason: 'none' }
  }
  if (stored.exp <= now) {
    await store.delete(codeKey(email))
    return { ok: false, reason: 'none' }
  }

  const clean = presented.replace(/\s+/g, '')
  const enc = new TextEncoder()
  const match = /^\d{6}$/.test(clean) && sameBytes(enc.encode(await hashCode(stored.salt, clean)), enc.encode(stored.hash))
  if (match) {
    await store.delete(codeKey(email))
    return { ok: true }
  }
  const attempts = stored.attempts + 1
  if (attempts >= CODE_MAX_ATTEMPTS) {
    await store.delete(codeKey(email))
    return { ok: false, reason: 'exhausted' }
  }
  const left = Math.max(1, Math.ceil((stored.exp - now) / 1000))
  await store.put(codeKey(email), JSON.stringify({ ...stored, attempts }), { expirationTtl: Math.max(60, left) })
  return { ok: false, reason: 'wrong' }
}

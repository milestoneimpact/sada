/**
 * PKCE — RFC 7636، بطريقة S256 وحدها.
 *
 * X يوجب PKCE على تطبيقات OAuth 2.0. و LinkedIn لا يوجبه، لكن لا ضرر منه،
 * فالمسار واحد للمنصتين ولا تتشعب الشيفرة بحالتين.
 *
 * `plain` غير مدعومة عمدا: من يقبلها يقبل ألا يكون هناك تحقق أصلا.
 */

const VERIFIER_BYTES = 32

export interface Pkce {
  readonly verifier: string
  readonly challenge: string
  readonly method: 'S256'
}

/** base64url بلا حشو — الترميز الذي يوجبه RFC 7636 §A. */
export function base64url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64url(new Uint8Array(digest))
}

export async function createPkce(): Promise<Pkce> {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(VERIFIER_BYTES)))
  return { verifier, challenge: await challengeFor(verifier), method: 'S256' }
}

/** قيمة عشوائية صالحة لـ `state` أو لمعرف داخلي. */
export function randomToken(bytes = 32): string {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)))
}

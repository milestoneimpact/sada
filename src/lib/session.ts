/**
 * جلسة اللوحة.
 *
 * المتصفّح لا يرسل `Authorization: Bearer` من صفحةٍ عاديّة، فلا بدّ من
 * كعكة. وثلاثة قيود تجعلها كعكةً لا ثغرة:
 *
 * ١ · **`HttpOnly`** — لا تُقرأ من JavaScript، فثغرة XSS لا تسرقها.
 * ٢ · **`SameSite=Strict`** — لا تُرسل مع طلبٍ من موقعٍ آخر، وهذا وحده
 *     يسدّ CSRF على أفعال اللوحة بلا رمزٍ إضافيّ في كلّ نموذج.
 * ٣ · **`Secure`** — لا تُرسل إلا على HTTPS.
 *
 * والمعرّف عشوائيّ من `crypto`، والقيمة في KV بمهلة انتهاء — لا في
 * الكعكة نفسها. فلا يُزوَّر بتعديل نصّها، ولا يُقرأ منها شيء.
 */
import { authorizeAdmin } from './adminAuth'

export const COOKIE = 'sada_session'
/** ثمانُ ساعات: يومُ عملٍ واحد. أطول من ذلك يجعل جهازا منسيّا بابا مفتوحا. */
export const SESSION_TTL_SECONDS = 8 * 60 * 60

export interface SessionStore {
  get(key: string): Promise<string | null>
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
  delete(key: string): Promise<void>
}

function sessionKey(id: string): string {
  return `session:${id}`
}

/**
 * يبدّل الرمز الإداريّ بجلسة.
 *
 * يُعيد استعمال `authorizeAdmin` نفسه لا فحصا موازيا: منطق مقارنةٍ ثانٍ
 * يعني موضعا ثانيا يُخطئ فيه أحد، ومقارنةً قد تفقد ثبات الزمن.
 */
export async function createSession(
  store: SessionStore,
  adminToken: string | undefined,
  presentedToken: string,
  now: Date = new Date(),
): Promise<{ id: string } | { error: 'disabled' | 'denied' }> {
  // يُبنى طلبٌ صوريّ ليُفحص بالمنطق نفسه — الرمز يجيء من نموذجٍ لا ترويسة
  const probe = new Request('https://sada.local/panel/login', {
    method: 'POST',
    headers: { Authorization: `Bearer ${presentedToken}` },
  })
  const verdict = await authorizeAdmin(adminToken, probe)
  if (verdict.kind === 'disabled') return { error: 'disabled' }
  if (verdict.kind !== 'ok') return { error: 'denied' }

  const id = crypto.randomUUID()
  await store.put(sessionKey(id), JSON.stringify({ at: now.toISOString() }), {
    expirationTtl: SESSION_TTL_SECONDS,
  })
  return { id }
}

/** يقرأ معرّف الجلسة من ترويسة الكعكة. */
export function readCookie(header: string | null, name: string): string | null {
  if (header === null) return null
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) {
      const value = rest.join('=')
      return value.length === 0 ? null : value
    }
  }
  return null
}

export async function validSession(store: SessionStore, request: Request): Promise<boolean> {
  const id = readCookie(request.headers.get('Cookie'), COOKIE)
  if (id === null) return false
  return (await store.get(sessionKey(id))) !== null
}

export async function destroySession(store: SessionStore, request: Request): Promise<void> {
  const id = readCookie(request.headers.get('Cookie'), COOKIE)
  if (id !== null) await store.delete(sessionKey(id))
}

/** الكعكة بقيودها الثلاثة. `Path=/panel` يمنع إرسالها إلى مسارات API. */
export function sessionCookie(id: string): string {
  return [
    `${COOKIE}=${id}`,
    'Path=/panel',
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ].join('; ')
}

export function clearedCookie(): string {
  return `${COOKIE}=; Path=/panel; HttpOnly; Secure; SameSite=Strict; Max-Age=0`
}

/**
 * الدخولُ برمز البريد في الاختبار (D-245) — **كما يدخل المالك**: يطلب الرمزَ، ثمّ
 * يقرؤه من رسالةٍ صوريّة، ثمّ يرسله. ولا اختصارَ إلى الجلسة.
 */
import { OWNER_EMAIL } from '../lib/ownerEmail'
import { addPasskey } from '../lib/security/factors'
import { relyingParty } from '../lib/security/rp'
import type { Db } from '../lib/tokens'
import type { EmailMessage } from './cloudflareEmail'
import { fakeAuthenticator, type FakeAuthenticator } from './authenticator'

export interface FakeMailer {
  readonly sent: EmailMessage[]
  send(message: EmailMessage): Promise<void>
}

export function fakeMailer(): FakeMailer {
  const sent: EmailMessage[] = []
  return { sent, async send(m) { sent.push(m) } }
}

/** يفكّ جسدَ الرسالة (base64 بعد السطر الفارغ) ويقرأ الرمز. */
export function codeFrom(message: EmailMessage): string {
  const body = message.raw.split('\r\n\r\n')[1] ?? ''
  const text = new TextDecoder().decode(Uint8Array.from(atob(body.replace(/\s+/g, '')), (ch) => ch.charCodeAt(0)))
  return /\b(\d{6})\b/.exec(text)?.[1] ?? ''
}

interface App {
  request(path: string, init: RequestInit, env: object): Response | Promise<Response>
}

/**
 * يطلب رمزًا ويعيده — ويحقن ساعيًا صوريًّا إن لم يكن في البيئة.
 * ويمسح فاصلَ الدقيقة: اختبارٌ يدخل مرّتين لا ينتظر.
 */
export async function requestCode(app: App, env: Record<string, unknown>, email = OWNER_EMAIL): Promise<string> {
  if (env['EMAIL'] === undefined) env['EMAIL'] = fakeMailer()
  const kv = env['KV'] as { delete(k: string): Promise<void> }
  await kv.delete(`logincode-gap:${email}`)
  await kv.delete(`logincode-hour:${email}`)
  const body = new FormData()
  body.set('email', email)
  await app.request('/panel/login/code', { method: 'POST', body }, env)
  const mailer = env['EMAIL'] as FakeMailer
  const last = mailer.sent[mailer.sent.length - 1]
  return last === undefined ? '' : codeFrom(last)
}

/** مفتاحُ مرور المالك في قاعدة الاختبار، وعدّادُ توقيعه — لكلّ قاعدةٍ مفتاحُها. */
interface Seeded {
  readonly key: FakeAuthenticator
  count: number
}
const SEEDED = new WeakMap<object, Map<string, Seeded>>()

/**
 * **مفتاحُ مرور المالك في الاختبار** (D-317) — العاملُ الثاني صار إلزاميًّا للمالك، فدخولُ الاختبار يُتمّه كما يُتمّه المالك.
 *
 * يُزرع صفُّه بالدالّة نفسِها التي يحفظ بها مسارُ التسجيل (`addPasskey`)، والمفتاحُ متوثِّقٌ برمجيٌّ يوقّع بـ ECDSA حقًّا
 * (`fakeAuthenticator`). **ولا رايةَ في شيفرة الإنتاج تتخطّى العامل**: الدخولُ يمرّ بشاشة العامل الثاني نفسِها.
 */
export async function seedPasskey(env: Record<string, unknown>, email: string = OWNER_EMAIL): Promise<Seeded | null> {
  const db = env['DB'] as Db | undefined
  if (db === undefined || db === null) return null
  const byEmail = SEEDED.get(db) ?? new Map<string, Seeded>()
  SEEDED.set(db, byEmail)
  const known = byEmail.get(email)
  if (known !== undefined) return known
  const key = await fakeAuthenticator()
  try {
    await addPasskey(db, {
      credentialId: key.credentialId, publicKey: key.publicKey, alg: key.alg, signCount: 0,
      label: 'مفتاح الاختبار', rpId: relyingParty(String(env['PUBLIC_BASE_URL'] ?? '')).id, email,
    })
  } catch {
    // ‏قاعدةٌ لا تقبل الكتابة (اختبارُ عطل): يمضي الدخولُ إلى ما يقوله المسارُ عنها
    return null
  }
  const seeded: Seeded = { key, count: 0 }
  byEmail.set(email, seeded)
  return seeded
}

/**
 * دخولٌ كامل: رمزٌ ثمّ `POST /panel/login`، **ثمّ العاملُ الثاني بمفتاح المرور** (D-317) — ويعيد ردَّ الخطوة الأخيرة.
 *
 * و`secondFactor: false` يعيد ردَّ رمز البريد وحده بلا مفتاحٍ مزروع: لاختبار ما يقع لحسابٍ لا عاملَ له.
 */
export async function emailLogin(
  app: App,
  env: Record<string, unknown>,
  options: {
    readonly next?: string
    readonly path?: string
    readonly headers?: Record<string, string>
    readonly secondFactor?: boolean
    /** بريدُ الداخل — المالكُ إن غاب. والمدعوُّ يُزرع له مفتاحُه كما يُزرع للمالك. */
    readonly email?: string
  } = {},
): Promise<Response> {
  const email = options.email ?? OWNER_EMAIL
  const seeded = options.secondFactor === false ? null : await seedPasskey(env, email)
  const code = await requestCode(app, env, email)
  const body = new FormData()
  body.set('code', code)
  if (email !== OWNER_EMAIL) body.set('email', email)
  if (options.next !== undefined) body.set('next', options.next)
  const first = await app.request(options.path ?? '/panel/login', {
    method: 'POST', body, ...(options.headers === undefined ? {} : { headers: options.headers }),
  }, env)
  if (seeded === null || first.status !== 303 || first.headers.get('Location') !== '/panel/2fa') return first
  return await completeWithPasskey(app, env, first, seeded, options.headers ?? {})
}

/** يُتمّ جلسةً معلَّقةً بمفتاح المرور المزروع: شاشةُ العامل الثاني، ثمّ توقيعٌ على تحدّيها. */
async function completeWithPasskey(
  app: App,
  env: Record<string, unknown>,
  pending: Response,
  seeded: Seeded,
  headers: Record<string, string>,
): Promise<Response> {
  const cookie = (pending.headers.get('Set-Cookie') ?? '').split(';')[0]!
  const screen = await (await app.request('/panel/2fa', { headers: { ...headers, Cookie: cookie } }, env)).text()
  const challenge = /data-challenge="([^"]+)"/.exec(screen)?.[1] ?? ''
  const csrf = /name="_csrf" value="([^"]+)"/.exec(screen)?.[1] ?? ''
  const rp = relyingParty(String(env['PUBLIC_BASE_URL'] ?? ''))
  seeded.count += 1
  const signed = await seeded.key.sign({ challenge, origin: rp.origin, rpId: rp.id, signCount: seeded.count })
  const form = new FormData()
  form.set('_csrf', csrf)
  form.set('assertion', JSON.stringify(signed))
  return await app.request('/panel/2fa/passkey', { method: 'POST', body: form, headers: { ...headers, Cookie: cookie } }, env)
}

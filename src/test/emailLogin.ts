/**
 * الدخولُ برمز البريد في الاختبار (D-245) — **كما يدخل المالك**: يطلب الرمزَ، ثمّ
 * يقرؤه من رسالةٍ صوريّة، ثمّ يرسله. ولا اختصارَ إلى الجلسة.
 */
import { OWNER_EMAIL } from '../lib/ownerEmail'
import type { EmailMessage } from './cloudflareEmail'

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
  await kv.delete(`logincode-gap:${OWNER_EMAIL}`)
  await kv.delete(`logincode-hour:${OWNER_EMAIL}`)
  const body = new FormData()
  body.set('email', email)
  await app.request('/panel/login/code', { method: 'POST', body }, env)
  const mailer = env['EMAIL'] as FakeMailer
  const last = mailer.sent[mailer.sent.length - 1]
  return last === undefined ? '' : codeFrom(last)
}

/** دخولٌ كامل: رمزٌ ثمّ `POST /panel/login` — ويعيد ردَّ الخطوة الأخيرة. */
export async function emailLogin(
  app: App,
  env: Record<string, unknown>,
  options: { readonly next?: string; readonly path?: string; readonly headers?: Record<string, string> } = {},
): Promise<Response> {
  const code = await requestCode(app, env)
  const body = new FormData()
  body.set('code', code)
  if (options.next !== undefined) body.set('next', options.next)
  return await app.request(options.path ?? '/panel/login', {
    method: 'POST', body, ...(options.headers === undefined ? {} : { headers: options.headers }),
  }, env)
}

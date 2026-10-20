/**
 * رسالةُ بريدٍ نصّيّةٌ بصيغة MIME — **بلا مكتبة** (D-245).
 *
 * ربطُ `send_email` يطلب الرسالةَ خامًا. ونصٌّ عربيٌّ واحدٌ لا يحتاج أكثرَ من
 * ترويساتٍ قليلة: موضوعٌ بترميز RFC 2047، وجسدٌ UTF-8 بـ base64 مقسومٌ على
 * أسطرٍ من 76 محرفا. والسطرُ الجديد CRLF كما يطلب RFC 5322.
 */

function base64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

/** موضوعٌ غيرُ لاتينيّ: `=?UTF-8?B?...?=` — ويُفهَم في كلّ عميل بريد. */
export function encodeSubject(subject: string): string {
  return `=?UTF-8?B?${base64Utf8(subject)}?=`
}

/** ترويسةٌ لا تحمل سطرًا جديدًا: سطرٌ فيها ترويسةٌ ثانيةٌ يكتبها غيرُنا. */
function header(value: string): string {
  if (/[\r\n]/.test(value)) throw new Error('mime: سطر جديد في ترويسة')
  return value
}

export interface TextMail {
  readonly from: string
  readonly to: string
  readonly subject: string
  readonly text: string
  readonly date?: Date
  readonly messageId?: string
}

export function buildTextMail(m: TextMail): string {
  const domain = m.from.split('@')[1] ?? 'localhost'
  const id = m.messageId ?? `${crypto.randomUUID()}@${domain}`
  const body = base64Utf8(m.text).replace(/.{1,76}/g, '$&\r\n')
  return [
    `From: ${header(m.from)}`,
    `To: ${header(m.to)}`,
    `Subject: ${encodeSubject(m.subject)}`,
    `Date: ${(m.date ?? new Date()).toUTCString()}`,
    `Message-ID: <${header(id)}>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    body,
  ].join('\r\n')
}

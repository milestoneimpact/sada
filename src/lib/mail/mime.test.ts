import { describe, expect, it } from 'vitest'
import { buildTextMail, encodeSubject } from './mime'
import { canReceiveCode, isOwnerEmail, OWNER_EMAIL } from '../ownerEmail'

describe('رسالة MIME بلا مكتبة (D-245)', () => {
  const raw = buildTextMail({ from: 'noreply@basserh.com', to: OWNER_EMAIL, subject: 'رمز الدخول', text: 'الرمز: 123456' })

  it('ترويساتها بأسطر CRLF، وموضوعها بترميز RFC 2047', () => {
    expect(raw).toContain('\r\nSubject: =?UTF-8?B?')
    expect(raw).toContain('Content-Transfer-Encoding: base64')
    expect(raw).toMatch(/Message-ID: <[^>]+@basserh\.com>/)
    expect(encodeSubject('ا')).toBe('=?UTF-8?B?2Kc=?=')
  })

  it('وجسدها يُفكّ إلى النصّ نفسه', () => {
    const body = raw.split('\r\n\r\n')[1]!.replace(/\s+/g, '')
    expect(new TextDecoder().decode(Uint8Array.from(atob(body), (c) => c.charCodeAt(0)))).toBe('الرمز: 123456')
  })

  it('ولا ترويسة بسطر جديد', () => {
    expect(() => buildTextMail({ from: 'a@b.c', to: 'x@y.z\r\nBcc: e@v.il', subject: 's', text: 't' })).toThrow()
  })
})

describe('بريد المالك ثابت', () => {
  it('يُقارَن بلا حساسيّة للحروف والمسافات', () => {
    expect(isOwnerEmail('  MilestonesImpact@Gmail.com ')).toBe(true)
    expect(isOwnerEmail('someone@gmail.com')).toBe(false)
    expect(canReceiveCode('MILESTONESIMPACT@gmail.com')).toEqual({ email: OWNER_EMAIL, role: 'owner' })
    expect(canReceiveCode('x@basserh.com')).toBeNull()
  })
})

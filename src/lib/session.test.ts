import { beforeEach, describe, expect, it } from 'vitest'
import { fakeKv } from '../test/fakes'
import {
  clearedCookie,
  COOKIE,
  createSession,
  destroySession,
  readCookie,
  sessionCookie,
  SESSION_TTL_SECONDS,
  validSession,
} from './session'

const TOKEN = 'Yk3pQ9vX2mLsA7nR4tWfZ8cB6dH1jG0e'
let kv: ReturnType<typeof fakeKv>

beforeEach(() => {
  kv = fakeKv()
})

function withCookie(value: string): Request {
  return new Request('https://sada2.basserh.com/panel', { headers: { Cookie: value } })
}

describe('readCookie', () => {
  it.each([
    ['كعكة واحدة', `${COOKIE}=abc`, 'abc'],
    ['بين كعكتين', `other=1; ${COOKIE}=abc; third=2`, 'abc'],
    ['مع مسافات', ` ${COOKIE}=abc `, 'abc'],
    ['اسمٌ آخر', 'other=abc', null],
    ['بلا قيمة', `${COOKIE}=`, null],
    ['بلا ترويسة', '', null],
  ])('%s', (_name, header, expected) => {
    expect(readCookie(header.length === 0 ? null : header, COOKIE)).toBe(expected)
  })

  it('لا يخلط كعكة يبدأ اسمها بنفس الحروف', () => {
    expect(readCookie(`${COOKIE}_other=zzz`, COOKIE)).toBeNull()
  })
})

describe('createSession', () => {
  it('الرمز الصحيح يعطي جلسة', async () => {
    const result = await createSession(kv, TOKEN, TOKEN)
    expect('id' in result).toBe(true)
    if ('id' in result) expect(result.id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('الرمز الخطأ يُرفض ولا يُنشئ شيئا', async () => {
    expect(await createSession(kv, TOKEN, 'wrong')).toEqual({ error: 'denied' })
    expect(kv.size()).toBe(0)
  })

  it('بلا ADMIN_TOKEN المسار مقفل لا مفتوح', async () => {
    expect(await createSession(kv, undefined, 'anything')).toEqual({ error: 'disabled' })
    expect(await createSession(kv, '', 'anything')).toEqual({ error: 'disabled' })
    expect(kv.size()).toBe(0)
  })

  it('يتسامح مع مسافةٍ حول الرمز — كما يفعل الحارس', async () => {
    expect('id' in (await createSession(kv, `${TOKEN}\n`, TOKEN))).toBe(true)
  })

  it('كلّ جلسة معرّفٌ جديد', async () => {
    const first = await createSession(kv, TOKEN, TOKEN)
    const second = await createSession(kv, TOKEN, TOKEN)
    if (!('id' in first) || !('id' in second)) throw new Error('توقّعنا جلستين')
    expect(first.id).not.toBe(second.id)
  })
})

describe('validSession', () => {
  it('كعكة جلسةٍ قائمة تُقبل', async () => {
    const result = await createSession(kv, TOKEN, TOKEN)
    if (!('id' in result)) throw new Error('توقّعنا جلسة')
    expect(await validSession(kv, withCookie(`${COOKIE}=${result.id}`))).toBe(true)
  })

  it('معرّفٌ مخترَع يُرفض — القيمة في KV لا في الكعكة', async () => {
    expect(await validSession(kv, withCookie(`${COOKIE}=${crypto.randomUUID()}`))).toBe(false)
  })

  it('بلا كعكة يُرفض', async () => {
    expect(await validSession(kv, new Request('https://sada2.basserh.com/panel'))).toBe(false)
  })

  it('الخروج يُبطل الجلسة فورا', async () => {
    const result = await createSession(kv, TOKEN, TOKEN)
    if (!('id' in result)) throw new Error('توقّعنا جلسة')
    const request = withCookie(`${COOKIE}=${result.id}`)
    await destroySession(kv, request)
    expect(await validSession(kv, request)).toBe(false)
  })
})

describe('قيود الكعكة — وهي ما يجعلها كعكة لا ثغرة', () => {
  it('HttpOnly و Secure و SameSite=Strict كلّها حاضرة', () => {
    const cookie = sessionCookie('abc')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('Secure')
    expect(cookie).toContain('SameSite=Strict')
  })

  it('مقصورة على /panel — فلا تُرسل إلى مسارات API', () => {
    expect(sessionCookie('abc')).toContain('Path=/panel')
  })

  it('لها مهلة انتهاء — لا كعكة دائمة', () => {
    expect(sessionCookie('abc')).toContain(`Max-Age=${SESSION_TTL_SECONDS}`)
    expect(SESSION_TTL_SECONDS).toBeLessThanOrEqual(24 * 60 * 60)
  })

  it('كعكة الخروج تُفرَّغ وتُبطَل بنفس القيود', () => {
    const cleared = clearedCookie()
    expect(cleared).toContain('Max-Age=0')
    expect(cleared).toContain('HttpOnly')
    expect(cleared).toContain('SameSite=Strict')
  })
})

import { beforeEach, describe, expect, it } from 'vitest'
import { fakeKv } from '../../test/fakes'
import { CODE_MAX_ATTEMPTS, issueCode, newCode, SEND_PER_HOUR, verifyCode } from './loginCode'

const ME = 'milestonesimpact@gmail.com'
let kv: ReturnType<typeof fakeKv>
beforeEach(() => { kv = fakeKv() })

async function issue(now = Date.now()): Promise<string> {
  const r = await issueCode(kv, ME, now)
  if (!r.ok) throw new Error(r.reason)
  return r.code
}

describe('رمز الدخول بالبريد (D-245)', () => {
  it('ستّة أرقام', () => {
    for (let i = 0; i < 50; i += 1) expect(newCode()).toMatch(/^\d{6}$/)
  })

  it('لا يُخزَّن الرمز نفسه — بصمته وحدها، ومهلته عشر دقائق', async () => {
    const code = await issue()
    const raw = (await kv.get(`logincode:${ME}`))!
    expect(raw).not.toContain(code)
    expect(kv.ttlOf(`logincode:${ME}`)).toBe(600)
  })

  it('يُقبل مرّةً واحدة', async () => {
    const code = await issue()
    expect(await verifyCode(kv, ME, code)).toEqual({ ok: true })
    expect(await verifyCode(kv, ME, code)).toEqual({ ok: false, reason: 'none' })
  })

  it('ويسقط بعد خمس خاطئة — ولو جاء الصحيح بعدها', async () => {
    const code = await issue()
    const wrong = code === '000000' ? '111111' : '000000'
    for (let i = 1; i < CODE_MAX_ATTEMPTS; i += 1) expect((await verifyCode(kv, ME, wrong)).ok).toBe(false)
    expect(await verifyCode(kv, ME, wrong)).toEqual({ ok: false, reason: 'exhausted' })
    expect(await verifyCode(kv, ME, code)).toEqual({ ok: false, reason: 'none' })
  })

  it('ولا يُقبل بعد مهلته', async () => {
    const now = Date.now()
    const code = await issue(now)
    expect(await verifyCode(kv, ME, code, now + 601_000)).toEqual({ ok: false, reason: 'none' })
  })

  it('رسالة في الدقيقة، وخمس في الساعة', async () => {
    await issue()
    expect(await issueCode(kv, ME)).toEqual({ ok: false, reason: 'too_soon' })
    for (let i = 1; i < SEND_PER_HOUR; i += 1) {
      await kv.delete(`logincode-gap:${ME}`)
      await issue()
    }
    await kv.delete(`logincode-gap:${ME}`)
    expect(await issueCode(kv, ME)).toEqual({ ok: false, reason: 'hourly_cap' })
  })

  it('رمز جديد يُبطل ما قبله', async () => {
    const first = await issue()
    await kv.delete(`logincode-gap:${ME}`)
    const second = await issue()
    if (first !== second) expect((await verifyCode(kv, ME, first)).ok).toBe(false)
    expect((await verifyCode(kv, ME, second)).ok).toBe(true)
  })
})

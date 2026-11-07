/**
 * رموزُ الاسترداد (D-318): مئةُ بتٍّ لا خمسون، وتهشيمٌ بـ HMAC-SHA256 بمفتاحٍ مشتقٍّ من `TOKEN_ENC_KEY` (‏`recovery-v1`)
 * وملحٍ لكلّ رمز — والقديمُ (SHA-256 بلا ملح) يفتح حتّى يُستعمَل أو يُجدَّد.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { registerKeyring, toBase64 } from '../crypto'
import { fakeDb } from '../../test/fakes'
import { toBase64Url } from './bytes'
import { digest } from './digest'
import { countRecoveryCodes, issueRecoveryCodes, normalizeCode, RECOVERY_ALPHABET, useRecoveryCode } from './factors'

const KEY = toBase64(crypto.getRandomValues(new Uint8Array(32)))
const NEXT = toBase64(crypto.getRandomValues(new Uint8Array(32)))
const ME = 'sara@example.com'

afterEach(() => registerKeyring({ TOKEN_ENC_KEY: NEXT }))

describe('رموز الاسترداد (D-318)', () => {
  it('كلُّ رمزٍ عشرون محرفًا من أبجديّةٍ باثنين وثلاثين — مئةُ بتّ، فوق الثمانين المطلوبة', async () => {
    const codes = await issueRecoveryCodes(fakeDb(), KEY, ME)
    expect(codes).toHaveLength(8)
    expect(RECOVERY_ALPHABET).toHaveLength(32)
    for (const code of codes) {
      const plain = normalizeCode(code)
      expect(plain).toHaveLength(20)
      expect([...plain].every((ch) => RECOVERY_ALPHABET.includes(ch))).toBe(true)
      expect(plain.length * Math.log2(RECOVERY_ALPHABET.length)).toBeGreaterThanOrEqual(80)
    }
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('ولا يُخزَّن تهشيمٌ بلا ملح: الصفُّ يحمل ملحه ومعرّفَ مفتاحه، ولا يساوي SHA-256 القديم', async () => {
    const db = fakeDb()
    const codes = await issueRecoveryCodes(db, KEY, ME)
    const rows = db.raw.prepare('SELECT hash FROM recovery_codes').all() as { hash: string }[]
    expect(rows).toHaveLength(codes.length)
    for (const [i, row] of rows.entries()) {
      expect(row.hash).toMatch(/^r1\.[0-9a-f]{8}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/)
      const old = toBase64Url(await digest(`recovery:${normalizeCode(codes[i]!)}`))
      expect(row.hash).not.toContain(old)
    }
    // ‏ملحٌ لكلّ رمز: لا ملحان متساويان
    expect(new Set(rows.map((r) => r.hash.split('.')[2])).size).toBe(rows.length)
  })

  it('الرمزُ يفتح مرّةً واحدة، وبمفتاحٍ آخر لا يفتح', async () => {
    const db = fakeDb()
    const codes = await issueRecoveryCodes(db, KEY, ME)
    expect(await useRecoveryCode(db, NEXT, codes[0]!, ME)).toBe(false)
    expect(await useRecoveryCode(db, KEY, codes[0]!.toLowerCase(), ME)).toBe(true)
    expect(await useRecoveryCode(db, KEY, codes[0]!, ME)).toBe(false)
    expect((await countRecoveryCodes(db, ME)).unused).toBe(codes.length - 1)
    // ‏ورمزُ حسابٍ آخر لا يفتح بابَه
    expect(await useRecoveryCode(db, KEY, codes[1]!, 'other@example.com')).toBe(false)
  })

  it('والقديمُ (SHA-256 بلا ملح) يفتح حتّى يُستعمَل، والتجديدُ يُسقطه', async () => {
    const db = fakeDb()
    const legacy = 'ABCDE-FGHJK'
    db.raw.prepare('INSERT INTO recovery_codes (hash, email) VALUES (?, ?)')
      .run(toBase64Url(await digest(`recovery:${normalizeCode(legacy)}`)), ME)
    db.raw.prepare('INSERT INTO recovery_codes (hash, email) VALUES (?, ?)')
      .run(toBase64Url(await digest('recovery:ZZZZZZZZZZ')), ME)
    expect(await useRecoveryCode(db, KEY, legacy, ME)).toBe(true)
    expect(await useRecoveryCode(db, KEY, legacy, ME)).toBe(false)
    await issueRecoveryCodes(db, KEY, ME)
    expect(await useRecoveryCode(db, KEY, 'ZZZZZ-ZZZZZ', ME)).toBe(false)
  })

  it('وفي التدوير يفتح ما هُشِّم بالمفتاح السابق ما دام مسجَّلًا', async () => {
    const db = fakeDb()
    const codes = await issueRecoveryCodes(db, KEY, ME)
    expect(await useRecoveryCode(db, NEXT, codes[0]!, ME)).toBe(false)
    registerKeyring({ TOKEN_ENC_KEY: NEXT, TOKEN_ENC_KEY_PREV: KEY })
    expect(await useRecoveryCode(db, NEXT, codes[0]!, ME)).toBe(true)
  })
})

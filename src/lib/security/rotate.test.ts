/**
 * تدويرُ `TOKEN_ENC_KEY` من طرفه إلى طرفه (D-318): كلُّ حقلٍ مشفَّرٍ بالمفتاح القديم — بالصيغة الجديدة أو بصيغة ما قبل
 * D-318 — يُقرأ أثناء التدوير، وتعيد الدورةُ تشفيرَه بالجديد، ثمّ يُحذف السابقُ فيبقى كلُّه مقروءًا.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { importKey, registerKeyring, seal, toBase64, tokenContext } from '../crypto'
import { fakeDb, type FakeDb } from '../../test/fakes'
import { loadTokens, saveTokens, upsertAccount } from '../tokens'
import { keyContext, resolveKey, saveKey } from '../providers'
import { readApp, saveApp } from '../oauth/apps'
import { countRecoveryCodes, issueRecoveryCodes, readTotpSecret, startTotp, useRecoveryCode } from './factors'
import { readWebhookUrl, saveWebhook } from '../alerts/webhook'
import { OWNER_EMAIL } from '../ownerEmail'
import { rotateKeys } from './rotate'

const OLD = toBase64(crypto.getRandomValues(new Uint8Array(32)))
const NEW = toBase64(crypto.getRandomValues(new Uint8Array(32)))
const HOOK = 'https://hooks.example.com/services/abc123'
const TOKENS = { accessToken: 'acc-1', refreshToken: 'ref-1', expiresAt: '2027-01-01T00:00:00Z', refreshExpiresAt: null, scopes: 'x' }
let db: FakeDb
let owner: string
let client: string

/** كلُّ ما يُشفَّر، بالمفتاح القديم — وصفٌّ قديمٌ بصيغة ما قبل D-318 معه. */
async function seedWith(key: string): Promise<void> {
  owner = await upsertAccount(db, 'org_owner', { platform: 'linkedin', kind: 'member', externalId: 'o', displayName: 'م' })
  client = await upsertAccount(db, 'org_b', { platform: 'x', kind: 'member', externalId: 'c', displayName: 'ع' })
  await saveTokens(db, key, owner, TOKENS)
  await saveTokens(db, key, client, { ...TOKENS, accessToken: 'acc-2', refreshToken: null })
  await saveKey(db, key, 'anthropic', 'sk-ant-rotate-0001', 'panel')
  await saveApp(db, key, 'linkedin', 'li-id', 'li-secret-long-enough', 'panel')
  await startTotp(db, key, 'JBSWY3DPEHPK3PXP', OWNER_EMAIL)
  await startTotp(db, key, 'KRSXG5CTMVRXEZLU', 'sara@example.com')
  await saveWebhook(db, key, HOOK, 'panel')
  // ‏مفتاحُ «gemini» بصيغة ما قبل D-318: بالمفتاح الخام بلا وسم
  const legacy = await seal(await importKey(key), 'AIza-legacy-0001', keyContext('gemini'))
  db.raw.prepare("UPDATE providers SET key_enc = ?, key_iv = ?, enabled = 1 WHERE name = 'gemini'").run(legacy.ciphertext, legacy.iv)
}

async function everything(key: string): Promise<unknown[]> {
  return [
    (await loadTokens(db, key, owner))?.refreshToken,
    (await loadTokens(db, key, client))?.accessToken,
    (await resolveKey(db, key, 'anthropic', undefined)).key,
    (await resolveKey(db, key, 'gemini', undefined)).key,
    (await readApp(db, key, 'linkedin', {}))?.clientSecret,
    await readTotpSecret(db, key, OWNER_EMAIL),
    await readTotpSecret(db, key, 'sara@example.com'),
    await readWebhookUrl(db, key),
  ]
}

const EXPECTED = ['ref-1', 'acc-2', 'sk-ant-rotate-0001', 'AIza-legacy-0001', 'li-secret-long-enough', 'JBSWY3DPEHPK3PXP', 'KRSXG5CTMVRXEZLU', HOOK]

beforeEach(async () => {
  db = fakeDb()
  db.raw.exec(`INSERT INTO orgs (id, name, kind) VALUES ('org_b', 'ب', 'team')`)
  registerKeyring({ TOKEN_ENC_KEY: OLD })
  await seedWith(OLD)
})

afterEach(() => {
  registerKeyring({ TOKEN_ENC_KEY: NEW })
  registerKeyring({ TOKEN_ENC_KEY: OLD })
})

describe('تدوير TOKEN_ENC_KEY (D-318)', () => {
  it('خارج التدوير لا يُمسّ شيء: القديمُ يُقرأ بطريقته ويُعدّ «قديمًا» لا «باقيًا» ولا يُعاد تشفيرُه', async () => {
    expect(await everything(OLD)).toEqual(EXPECTED)
    const before = db.raw.prepare("SELECT key_enc FROM providers WHERE name = 'gemini'").get()
    const report = await rotateKeys(db, OLD)
    expect(report.previous).toBeNull()
    expect(report.rotated).toBe(0)
    // ‏(مراجعة D-318) كان `pending: 1` إلى الأبد خارج التدوير: صفٌّ قبل D-318 يُقرأ بالحاليّ ليس «على مفتاحٍ آخر»
    expect(report.pending).toBe(0)
    expect(report.legacy).toBe(1)
    expect(db.raw.prepare("SELECT key_enc FROM providers WHERE name = 'gemini'").get()).toEqual(before)
  })

  it('بمفتاحٍ جديدٍ بلا السابق لا يُفتح شيء — وهو ما يمنعه التدوير', async () => {
    registerKeyring({ TOKEN_ENC_KEY: NEW })
    await expect(loadTokens(db, NEW, owner)).rejects.toThrow()
    expect((await resolveKey(db, NEW, 'anthropic', undefined)).key).toBeNull()
    expect(await readWebhookUrl(db, NEW)).toBe('')
  })

  it('ومع السابق يُقرأ كلُّه، والدورةُ تعيده إلى الجديد، ثمّ يُحذف السابقُ فيبقى مقروءًا', async () => {
    registerKeyring({ TOKEN_ENC_KEY: NEW, TOKEN_ENC_KEY_PREV: OLD })
    expect(await everything(NEW)).toEqual(EXPECTED)

    const first = await rotateKeys(db, NEW)
    expect(first.previous).not.toBeNull()
    expect(first.previous).not.toBe(first.kid)
    expect(first.failed).toBe(0)
    expect(first.pending).toBe(0)
    // ‏حسابان، ومفتاحان، وتطبيق، ورمزا تطبيق، والقناة
    expect(first.rotated).toBe(8)
    expect((await rotateKeys(db, NEW)).rotated).toBe(0)

    registerKeyring({ TOKEN_ENC_KEY: NEW })
    expect(await everything(NEW)).toEqual(EXPECTED)
    expect(JSON.stringify(db.raw.prepare('SELECT access_enc, refresh_enc FROM tokens').all())).not.toMatch(new RegExp(`v2:${first.previous}:`))
  })

  it('وما لا يُفكّ لا يُمسّ ويُعدّ — فلا يُحذف السابقُ قبل أن يصير الباقي صفرًا', async () => {
    db.raw.prepare("UPDATE tokens SET access_enc = 'v2:00000000:AAAA' WHERE account_id = ?").run(client)
    registerKeyring({ TOKEN_ENC_KEY: NEW, TOKEN_ENC_KEY_PREV: OLD })
    const report = await rotateKeys(db, NEW)
    expect(report.failed).toBe(1)
    expect(report.pending).toBe(1)
    expect(db.raw.prepare('SELECT access_enc FROM tokens WHERE account_id = ?').get(client)).toEqual({ access_enc: 'v2:00000000:AAAA' })
  })

  it('ولا تدهس كتابةً وقعت بين القراءة والتحديث', async () => {
    registerKeyring({ TOKEN_ENC_KEY: NEW, TOKEN_ENC_KEY_PREV: OLD })
    const fresh = await seal(await importKey(OLD), 'acc-renewed', tokenContext(owner, 'access'))
    // ‏قاعدةٌ تُبدّل صفَّ المالك بعد أن قرأته الدورة وقبل أن تكتبه — كتجديدٍ جارٍ
    let swapped = false
    const racing = {
      ...db,
      prepare(query: string) {
        if (!swapped && query.startsWith('UPDATE tokens SET access_enc')) {
          swapped = true
          db.raw.prepare('UPDATE tokens SET access_enc = ?, access_iv = ? WHERE account_id = ?').run(fresh.ciphertext, fresh.iv, owner)
        }
        return db.prepare(query)
      },
    }
    await rotateKeys(racing as unknown as FakeDb, NEW)
    expect((await loadTokens(db, NEW, owner))?.accessToken).toBe('acc-renewed')
  })

  it('(مراجعة D-318) وفي التدوير يُعدّ القديمُ «باقيًا» مع ما على السابق — كلاهما لا يُقرأ بعد حذفه', async () => {
    registerKeyring({ TOKEN_ENC_KEY: NEW, TOKEN_ENC_KEY_PREV: OLD })
    const dry = await rotateKeys(db, NEW, { apply: false })
    expect(dry.legacy).toBe(1)
    expect(dry.pending).toBe(9)
    const done = await rotateKeys(db, NEW)
    expect(done.pending).toBe(0)
    expect(done.legacy).toBe(0)
  })

  it('(مراجعة D-318) ورموزُ الاسترداد المهشَّمةُ بالسابق تُعدّ: لا «صفر» يُحذف عنده السابقُ وهي حيّةٌ به وحده', async () => {
    await issueRecoveryCodes(db, OLD, 'sara@example.com')
    expect(await useRecoveryCode(db, OLD, (await issueRecoveryCodes(db, OLD, OWNER_EMAIL))[0]!, OWNER_EMAIL)).toBe(true)
    registerKeyring({ TOKEN_ENC_KEY: NEW, TOKEN_ENC_KEY_PREV: OLD })
    const report = await rotateKeys(db, NEW)
    expect(report.pending).toBe(0)
    // ‏ثمانيةٌ لسارة وسبعةٌ للمالك (استُعمل واحد) — والمستعمَلُ لا يُعدّ
    expect(report.recovery).toBe(15)
    expect(await countRecoveryCodes(db, NEW, 'sara@example.com')).toEqual({ total: 8, unused: 8, stale: 8 })

    // ‏سارةُ تجدّد: رموزُها على الحاليّ، فتنقص من العدّ
    await issueRecoveryCodes(db, NEW, 'sara@example.com')
    expect((await rotateKeys(db, NEW)).recovery).toBe(7)

    // ‏والسابقُ حُذف والمالكُ لم يجدّد: رموزُه لا تفتح، **ولا تُعدّ صالحةً** — فيُطلب منه غيرُها
    registerKeyring({ TOKEN_ENC_KEY: NEW })
    expect(await countRecoveryCodes(db, NEW, OWNER_EMAIL)).toEqual({ total: 8, unused: 0, stale: 7 })
    expect((await rotateKeys(db, NEW)).recovery).toBe(7)
  })

  it('(مراجعة D-318) وصفوفٌ لا تُفكّ لا تحجب ما بعدها: كلُّ دورةٍ تمضي في الجدول إلى آخره', async () => {
    const third = await upsertAccount(db, 'org_owner', { platform: 'x', kind: 'member', externalId: 't', displayName: 'ث' })
    await saveTokens(db, OLD, third, { ...TOKENS, accessToken: 'acc-3', refreshToken: null })
    db.raw.prepare("UPDATE tokens SET access_enc = 'v2:00000000:AAAA' WHERE account_id IN (?, ?)").run(owner, client)
    registerKeyring({ TOKEN_ENC_KEY: NEW, TOKEN_ENC_KEY_PREV: OLD })
    const first = await rotateKeys(db, NEW, { limit: 2 })
    expect(first.failed).toBe(2)
    expect((await loadTokens(db, NEW, third))?.accessToken).toBe('acc-3')
    const row = db.raw.prepare('SELECT access_enc FROM tokens WHERE account_id = ?').get(third) as { access_enc: string }
    expect(row.access_enc.startsWith(`v2:${first.kid}:`)).toBe(true)
    // ‏وما بقي هو ما لا يُفكّ وحدَه: «باقٍ» يساوي «لم يُفكّ»
    const again = await rotateKeys(db, NEW, { limit: 2 })
    expect(again.pending).toBe(2)
    expect(again.failed).toBe(2)
  })
})

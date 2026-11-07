import { beforeEach, describe, expect, it } from 'vitest'
import { toBase64 } from './crypto'
import { fakeDb, type FakeDb } from '../test/fakes'
import {
  accountId,
  AccountElsewhere,
  loadTokens,
  markNeedsReauth,
  saveTokens,
  upsertAccount,
  type AccountIdentity,
} from './tokens'

const KEY = toBase64(crypto.getRandomValues(new Uint8Array(32)))
const OTHER_KEY = toBase64(crypto.getRandomValues(new Uint8Array(32)))

const IDENTITY: AccountIdentity = {
  platform: 'linkedin',
  kind: 'member',
  externalId: 'urn:li:person:abc',
  displayName: 'عمر',
}

const TOKENS = {
  accessToken: 'AQV_access_notReal',
  refreshToken: 'AQV_refresh_notReal',
  expiresAt: '2026-11-02T10:00:00.000Z',
  refreshExpiresAt: '2027-09-03T10:00:00.000Z',
  scopes: 'openid profile w_member_social',
}

let db: FakeDb

beforeEach(() => {
  db = fakeDb()
})

describe('upsertAccount', () => {
  it('حساب مربوط في منظّمة لا يُنقَل إلى أخرى (D-229)', async () => {
    db.raw.exec(`INSERT INTO orgs (id, name, kind) VALUES ('org_b', 'ب', 'team')`)
    const id = await upsertAccount(db, 'org_owner', IDENTITY)
    await expect(upsertAccount(db, 'org_b', { ...IDENTITY, displayName: 'دخيل' })).rejects.toBeInstanceOf(
      AccountElsewhere,
    )
    const row = db.raw.prepare('SELECT org_id, display_name FROM accounts WHERE id = ?').get(id) as {
      org_id: string
      display_name: string
    }
    expect(row).toEqual({ org_id: 'org_owner', display_name: 'عمر' })
  })

  it('يشتق المعرف من الهوية فلا يتكرر الحساب', async () => {
    const first = await upsertAccount(db, 'org_owner', IDENTITY)
    const second = await upsertAccount(db, 'org_owner', { ...IDENTITY, displayName: 'عمر عبدالحميد' })
    expect(first).toBe(second)
    expect(first).toBe(accountId(IDENTITY))
    const count = db.raw.prepare('SELECT count(*) AS n FROM accounts').get() as { n: number }
    expect(count.n).toBe(1)
  })

  it('يحدّث الاسم ويعيد الحساب إلى active', async () => {
    const id = await upsertAccount(db, 'org_owner', IDENTITY)
    await markNeedsReauth(db, id)
    await upsertAccount(db, 'org_owner', { ...IDENTITY, displayName: 'اسم جديد' })
    const row = db.raw.prepare('SELECT display_name, status FROM accounts WHERE id = ?').get(id) as {
      display_name: string
      status: string
    }
    expect(row.display_name).toBe('اسم جديد')
    expect(row.status).toBe('active')
  })
})

describe('saveTokens ثم loadTokens', () => {
  it('يعيد ما حُفظ كما هو', async () => {
    const id = await upsertAccount(db, 'org_owner', IDENTITY)
    await saveTokens(db, KEY, id, TOKENS)
    await expect(loadTokens(db, KEY, id)).resolves.toEqual(TOKENS)
  })

  it('لا يكتب رمزا خاما في D1 — لا access ولا refresh', async () => {
    const id = await upsertAccount(db, 'org_owner', IDENTITY)
    await saveTokens(db, KEY, id, TOKENS)
    const row = db.raw.prepare('SELECT * FROM tokens WHERE account_id = ?').get(id) as Record<
      string,
      unknown
    >
    const dump = JSON.stringify(row)
    expect(dump).not.toContain(TOKENS.accessToken)
    expect(dump).not.toContain(TOKENS.refreshToken)
  })

  it('يعطي نصا مشفرا مختلفا لكل حفظ رغم ثبات القيمة', async () => {
    const id = await upsertAccount(db, 'org_owner', IDENTITY)
    await saveTokens(db, KEY, id, TOKENS)
    const first = db.raw.prepare('SELECT access_enc FROM tokens WHERE account_id = ?').get(id) as {
      access_enc: string
    }
    await saveTokens(db, KEY, id, TOKENS)
    const second = db.raw.prepare('SELECT access_enc FROM tokens WHERE account_id = ?').get(id) as {
      access_enc: string
    }
    expect(first.access_enc).not.toBe(second.access_enc)
  })

  it('يقبل حسابا بلا refresh', async () => {
    const id = await upsertAccount(db, 'org_owner', IDENTITY)
    await saveTokens(db, KEY, id, { ...TOKENS, refreshToken: null, refreshExpiresAt: null })
    const loaded = await loadTokens(db, KEY, id)
    expect(loaded?.refreshToken).toBeNull()
    const row = db.raw.prepare('SELECT refresh_iv FROM tokens WHERE account_id = ?').get(id) as {
      refresh_iv: string | null
    }
    expect(row.refresh_iv).toBeNull()
  })

  it('يستبدل الرمز عند إعادة الربط ولا ينشئ صفا ثانيا', async () => {
    const id = await upsertAccount(db, 'org_owner', IDENTITY)
    await saveTokens(db, KEY, id, TOKENS)
    await saveTokens(db, KEY, id, { ...TOKENS, accessToken: 'رمز جديد' })
    const count = db.raw.prepare('SELECT count(*) AS n FROM tokens').get() as { n: number }
    expect(count.n).toBe(1)
    const loaded = await loadTokens(db, KEY, id)
    expect(loaded?.accessToken).toBe('رمز جديد')
  })

  it('يعيد null لحساب بلا رمز', async () => {
    const id = await upsertAccount(db, 'org_owner', IDENTITY)
    await expect(loadTokens(db, KEY, id)).resolves.toBeNull()
  })
})

describe('ما يحمي الرموز', () => {
  it('مفتاح آخر لا يفك التشفير', async () => {
    const id = await upsertAccount(db, 'org_owner', IDENTITY)
    await saveTokens(db, KEY, id, TOKENS)
    await expect(loadTokens(db, OTHER_KEY, id)).rejects.toThrow()
  })

  it('نقل صف رموز إلى حساب آخر يفشل، لا يمر صامتا', async () => {
    const victim = await upsertAccount(db, 'org_owner', IDENTITY)
    const attacker = await upsertAccount(db, 'org_owner', {
      ...IDENTITY,
      externalId: 'urn:li:person:xyz',
      displayName: 'آخر',
    })
    await saveTokens(db, KEY, victim, TOKENS)
    // نسخ النص المشفر كما هو إلى حساب آخر — ما يفعله من نفذ إلى القاعدة
    const row = db.raw
      .prepare('SELECT access_enc, access_iv, expires_at, scopes FROM tokens WHERE account_id = ?')
      .get(victim) as { access_enc: string; access_iv: string; expires_at: string; scopes: string }
    db.raw
      .prepare(
        `INSERT INTO tokens (account_id, access_enc, access_iv, expires_at, scopes)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(attacker, row.access_enc, row.access_iv, row.expires_at, row.scopes)

    await expect(loadTokens(db, KEY, attacker)).rejects.toThrow()
    await expect(loadTokens(db, KEY, victim)).resolves.toBeTruthy()
  })

  it('markNeedsReauth لا يحذف الحساب ولا رموزه', async () => {
    const id = await upsertAccount(db, 'org_owner', IDENTITY)
    await saveTokens(db, KEY, id, TOKENS)
    await markNeedsReauth(db, id)
    const row = db.raw.prepare('SELECT status FROM accounts WHERE id = ?').get(id) as {
      status: string
    }
    expect(row.status).toBe('needs_reauth')
    await expect(loadTokens(db, KEY, id)).resolves.toBeTruthy()
  })
})

describe('مفتاح المنظّمة (D-238)', () => {
  it('رمز منظّمة أخرى يُشفَّر بمفتاح مشتقّ فلا يُفكّ بالأصل، ويُقرأ بمسارِه', async () => {
    db.raw.exec(`INSERT INTO orgs (id, name, kind) VALUES ('org_b', 'ب', 'team')`)
    const id = await upsertAccount(db, 'org_b', { ...IDENTITY, externalId: 'urn:li:person:b' })
    await saveTokens(db, KEY, id, TOKENS)
    expect((await loadTokens(db, KEY, id))?.accessToken).toBe(TOKENS.accessToken)

    const row = db.raw.prepare('SELECT access_enc, access_iv, org_id FROM tokens WHERE account_id = ?').get(id) as {
      access_enc: string
      access_iv: string
      org_id: string
    }
    expect(row.org_id).toBe('org_b')
    const { importKey, open, tokenContext } = await import('./crypto')
    await expect(
      open(await importKey(KEY), { ciphertext: row.access_enc, iv: row.access_iv }, tokenContext(id, 'access')),
    ).rejects.toThrow()
  })

  /*
   * ‏(D-318) كان هذا الاختبارُ يثبّت أنّ رمزَ المالك يُفكّ بالمفتاح الخام — وهو ما عدّه التقييمُ ضعفًا في الفصل: الخامُ
   * ‏مفتاحُ AES للمالك ومادّةُ HKDF لغيره معًا. فصار يثبّت العكس: الجديدُ مشتقٌّ موسومٌ بمعرّف مفتاحه ولا يفتحه الخام،
   * ‏والقديمُ المشفَّرُ بالخام يُقرأ كما هو — فلا يُعاد تشفيرُ ما حُفظ إلّا في تدويرٍ معلَن.
   */
  it('ورمزُ المالك الجديدُ بمفتاحٍ مشتقٍّ موسوم، والقديمُ بالخام يُقرأ كما هو (D-318)', async () => {
    const id = await upsertAccount(db, 'org_owner', IDENTITY)
    await saveTokens(db, KEY, id, TOKENS)
    const row = db.raw.prepare('SELECT access_enc, access_iv FROM tokens WHERE account_id = ?').get(id) as {
      access_enc: string
      access_iv: string
    }
    const { importKey, keyId, open, seal, tokenContext } = await import('./crypto')
    expect(row.access_enc.startsWith(`v2:${await keyId(KEY)}:`)).toBe(true)
    await expect(
      open(await importKey(KEY), { ciphertext: row.access_enc.split(':')[2]!, iv: row.access_iv }, tokenContext(id, 'access')),
    ).rejects.toThrow()

    // ‏صفٌّ كُتب قبل D-318 بالمفتاح الخام
    const legacy = await seal(await importKey(KEY), 'legacy-access', tokenContext(id, 'access'))
    db.raw.prepare('UPDATE tokens SET access_enc = ?, access_iv = ?, refresh_enc = NULL, refresh_iv = NULL WHERE account_id = ?')
      .run(legacy.ciphertext, legacy.iv, id)
    expect((await loadTokens(db, KEY, id))?.accessToken).toBe('legacy-access')
  })
})

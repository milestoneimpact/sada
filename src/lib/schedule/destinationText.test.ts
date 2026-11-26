/**
 * ‏نصٌّ لكلّ وجهة (D-426): نسخةُ الوجهة بنصٍّ غير نصّ الأصل تحمل مفتاحًا مشتقًّا من نصّها، والحدُّ لكلّ وجهة.
 */
import { describe, expect, it } from 'vitest'
import { saveTokens, upsertAccount } from '../tokens'
import { fakeDb } from '../../test/fakes'
import { toBase64 } from '../crypto'
import { destinationKeyOf } from '../linkedinPage'
import { readDestinationTexts, scheduleDestinations } from './destinations'
import { destinationsField } from '../../routes/ui/sections/drafts'

const KEY = toBase64(new Uint8Array(32).fill(7))
const NOW = new Date('2026-10-03T08:00:00Z')

async function seed() {
  const db = fakeDb()
  const me = await upsertAccount(db, 'org_owner', { platform: 'linkedin', kind: 'member', externalId: 'abc', displayName: 'عمر' })
  const page = await upsertAccount(db, 'org_owner', { platform: 'linkedin', kind: 'org', externalId: '111', displayName: 'بصيرة' })
  const live = { accessToken: 'a', refreshToken: null, expiresAt: '2027-01-01T00:00:00Z', refreshExpiresAt: null }
  await saveTokens(db, KEY, me, { ...live, scopes: 'openid profile w_member_social' })
  await saveTokens(db, KEY, page, { ...live, scopes: 'w_organization_social r_organization_social' })
  db.raw.prepare(`INSERT INTO posts (id, platform, type, text, status, idempotency_key, approved_by, approved_at)
                  VALUES ('p1', 'linkedin', 'text', 'نصّ', 'approved', 'draft:k1', 'omar', '2026-10-01 00:00:00')`).run()
  return { db, me, page }
}
type Row = { account_id: string; idempotency_key: string; text: string; has_url: number }
const rows = (db: ReturnType<typeof fakeDb>) => db.raw.prepare('SELECT account_id, idempotency_key, text, has_url FROM posts').all() as Row[]

describe('نصٌّ لكلّ وجهة', () => {
  it('نسخةُ الصفحة بنصّها، ومفتاحُها مشتقٌّ من نصّها', async () => {
    const { db, me, page } = await seed()
    const out = await scheduleDestinations(db, 'p1', [me, page], '2026-10-05T09:00', NOW, 'org_owner', 0, new Map([[page, 'نصُّ الصفحة https://basserh.com']]))
    expect(out.map((o) => o.result.ok)).toEqual([true, true])
    const copy = rows(db).find((r) => r.account_id === page)!
    expect(copy.text).toBe('نصُّ الصفحة https://basserh.com')
    expect(copy.has_url).toBe(1)
    expect(copy.idempotency_key.startsWith(destinationKeyOf('draft:k1', page) + ':t:')).toBe(true)
    expect(rows(db).find((r) => r.account_id === me)!.text).toBe('نصّ')
    // ‏ضغطةٌ ثانيةٌ بالنصّ نفسِه لا تنشئ ثالثًا
    await scheduleDestinations(db, 'p1', [me, page], '2026-10-05T09:00', NOW, 'org_owner', 0, new Map([[page, 'نصُّ الصفحة https://basserh.com']]))
    expect(rows(db)).toHaveLength(2)
  })

  it('النصُّ الفارغ أو نفسُه = نصُّ الأصل بمفتاح D-423', async () => {
    const { db, me, page } = await seed()
    await scheduleDestinations(db, 'p1', [me, page], '2026-10-05T09:00', NOW, 'org_owner', 0, new Map([[page, '  نصّ ']]))
    expect(rows(db).find((r) => r.account_id === page)!.idempotency_key).toBe(destinationKeyOf('draft:k1', page))
  })

  it('نصٌّ فوق حدّ الوجهة يُردّ بسببٍ ولا تبقى نسخة', async () => {
    const { db, me, page } = await seed()
    const out = await scheduleDestinations(db, 'p1', [me, page], '2026-10-05T09:00', NOW, 'org_owner', 0, new Map([[page, 'ا'.repeat(3001)]]))
    expect(out[0]!.result.ok).toBe(true)
    expect(out[1]!.result).toEqual({ ok: false, reason: expect.stringContaining('3000') })
    expect(rows(db)).toHaveLength(1)
  })

  it('الحقولُ تُقرأ من النموذج بلا JS', () => {
    const f = new FormData()
    f.append('text:acc_2', 'نصٌّ آخر')
    f.append('text:', 'x')
    f.append('id', 'p1')
    expect([...readDestinationTexts(f)]).toEqual([['acc_2', 'نصٌّ آخر']])
  })

  it('الحقلُ يعرض لكلّ وجهةٍ زائدةٍ نصًّا وحدَّها', () => {
    const out = destinationsField([
      { id: 'acc_1', platform: 'linkedin', label: 'LinkedIn · حسابي' },
      { id: 'acc_2', platform: 'linkedin', label: 'LinkedIn · صفحة بصيرة', page: true },
    ], null, 'ds')!
    expect(out).toContain('name="text:acc_2"')
    expect(out).toContain('data-limit="3000"')
    expect(out).toContain('حتّى 3000 حرف')
    expect(out).not.toContain('name="text:acc_1"')
  })
  it('مراجعة D-426: نصٌّ آخرُ بعد سقوط الأصل يحلّ محلَّ النسخة القديمة، فلا منشوران على الحساب', async () => {
    const { db, me, page } = await seed()
    const first = await scheduleDestinations(db, 'p1', ['acc_missing', page], '2026-10-05T09:00', NOW, 'org_owner', 0, new Map([[page, 'نصٌّ أ']]))
    expect(first.map((o) => o.result.ok)).toEqual([false, true])
    await scheduleDestinations(db, 'p1', [me, page], '2026-10-05T09:00', NOW, 'org_owner', 0, new Map([[page, 'نصٌّ ب']]))
    const pageRows = rows(db).filter((r) => r.account_id === page)
    expect(pageRows.map((r) => r.text)).toEqual(['نصٌّ ب'])
  })

  it('مراجعة D-426: لا `maxlength` في حقل الوجهة — الخادمُ يعدّ المحارف', () => {
    expect(destinationsField([
      { id: 'a1', label: 'حسابي', platform: 'linkedin' },
      { id: 'a2', label: 'صفحة', platform: 'linkedin', page: true },
    ] as never, null, 'd'))!.not.toContain('maxlength')
  })
})

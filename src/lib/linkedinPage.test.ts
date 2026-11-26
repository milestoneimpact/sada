/**
 * ‏صفحةُ LinkedIn وجهةٌ ثانية (D-423): اسمان في الشاشة، وقائمةُ المنظّمات التي يديرها المالك، ومنشوران بمفتاحين لمن
 * ‏اختار الاثنين، وسطرُ `linkedin-page` في ملفّ الخطّة.
 */
import { describe, expect, it } from 'vitest'
import { toBase64 } from './crypto'
import { saveTokens, upsertAccount } from './tokens'
import { fakeDb, fakeFetch } from '../test/fakes'
import { destinationKeyOf, destinationLabel, linkedInAuthor, listAdminOrgs, pageApp, pageCanPublish } from './linkedinPage'
import { scheduleDestinations } from './schedule/destinations'
import { readPlan, rowKey, type PlanFacts } from './plan/import'
import { readTemplate } from './plan/template'
import { destinationsField } from '../routes/ui/sections/drafts'
import type { LinkedAccount } from './channels'

const KEY = toBase64(crypto.getRandomValues(new Uint8Array(32)))

describe('الاسمان والمؤلّف', () => {
  it('«LinkedIn · حسابي» و«LinkedIn · صفحة <الاسم>»، والصفحةُ urn:li:organization', () => {
    expect(destinationLabel({ platform: 'linkedin', kind: 'member', displayName: 'عمر' }, 'LinkedIn')).toBe('LinkedIn · حسابي')
    expect(destinationLabel({ platform: 'linkedin', kind: 'org', displayName: 'بصيرة' }, 'LinkedIn')).toBe('LinkedIn · صفحة بصيرة')
    expect(destinationLabel({ platform: 'x', kind: 'member', displayName: 'عمر' }, 'X')).toBe('عمر · X')
    expect(linkedInAuthor({ account_kind: 'org', external_id: '12345' })).toBe('urn:li:organization:12345')
    expect(linkedInAuthor({ account_kind: 'member', external_id: 'abc' })).toBe('urn:li:person:abc')
    expect(pageCanPublish('w_organization_social,r_organization_social')).toBe(true)
    expect(pageCanPublish('openid profile w_member_social')).toBe(false)
  })

  it('وسرّا التطبيق الثاني من البيئة وحدها — وأحدُهما ناقصًا «لا تطبيق»', () => {
    expect(pageApp({})).toBeNull()
    expect(pageApp({ LINKEDIN_ORG_CLIENT_ID: 'a' })).toBeNull()
    expect(pageApp({ LINKEDIN_ORG_CLIENT_ID: ' a ', LINKEDIN_ORG_CLIENT_SECRET: 'b' })).toEqual({ clientId: 'a', clientSecret: 'b' })
  })

  it('والمحرّرُ يعرض الوجهتين مربّعين، والحسابُ الشخصيّ مختارٌ ابتداءً', () => {
    const html = destinationsField([
      { id: 'acc-me', platform: 'linkedin', label: 'LinkedIn · حسابي' },
      { id: 'acc-page', platform: 'linkedin', label: 'LinkedIn · صفحة بصيرة', page: true },
    ], 'ed-form', 'ed-dest')!
    expect(html).toContain('>LinkedIn · حسابي</label>')
    expect(html).toContain('>LinkedIn · صفحة بصيرة</label>')
    expect(html).toContain('data-pf="linkedin-page"')
    expect(html).toMatch(/value="acc-me" form="ed-form" checked/)
    expect(html).not.toMatch(/value="acc-page" form="ed-form" checked/)
    expect(html).not.toContain('style=')
    // ‏وبلا صفحةٍ تبقى القائمةُ كما كانت
    expect(destinationsField([{ id: 'a', platform: 'x', label: 'a' }, { id: 'b', platform: 'x', label: 'b' }], null, 'x')).toBeNull()
  })
})

describe('المنظّمات التي يديرها المالك', () => {
  it('ADMINISTRATOR المعتمَد وحده، بأسمائها — واسمٌ لا يُقرأ يصير رقمَها', async () => {
    const f = fakeFetch({
      'https://api.linkedin.com/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED&count=100': { json: { elements: [
        { organization: 'urn:li:organization:111', role: 'ADMINISTRATOR', state: 'APPROVED' },
        { organization: 'urn:li:organization:222', role: 'ANALYST', state: 'APPROVED' },
        { organization: 'urn:li:organization:333', role: 'ADMINISTRATOR', state: 'REQUESTED' },
        { organization: 'urn:li:organization:444', role: 'ADMINISTRATOR', state: 'APPROVED' },
      ] } },
      'https://api.linkedin.com/rest/organizations/111': { json: { localizedName: 'بصيرة' } },
      'https://api.linkedin.com/rest/organizations/444': { status: 403, json: {} },
    })
    expect(await listAdminOrgs('tok', f)).toEqual([{ id: '111', name: 'بصيرة' }, { id: '444', name: 'صفحة 444' }])
    expect(f.calls[0]!.headers['Authorization']).toBe('Bearer tok')
    expect(f.calls[0]!.headers['LinkedIn-Version']).toMatch(/^\d{6}$/)
  })
})

describe('منشورٌ إلى الوجهتين: منشوران', () => {
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
  const NOW = new Date('2026-10-03T08:00:00Z')

  it('اختيارُ الاثنين ينشئ منشورين مجدولين، لكلٍّ مفتاحُه وحسابُه', async () => {
    const { db, me, page } = await seed()
    const out = await scheduleDestinations(db, 'p1', [me, page], '2026-10-05T09:00', NOW, 'org_owner')
    expect(out.map((o) => o.result.ok)).toEqual([true, true])
    const rows = db.raw.prepare('SELECT id, account_id, idempotency_key, status FROM posts ORDER BY idempotency_key').all() as { id: string; account_id: string; idempotency_key: string; status: string }[]
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.account_id).sort()).toEqual([me, page].sort())
    expect(new Set(rows.map((r) => r.idempotency_key)).size).toBe(2)
    expect(rows.find((r) => r.account_id === page)!.idempotency_key).toBe(destinationKeyOf('draft:k1', page))
    expect(rows.every((r) => r.status === 'queued')).toBe(true)
    // ‏وضغطةٌ ثانيةٌ لا تنشئ ثالثًا
    await scheduleDestinations(db, 'p1', [me, page], '2026-10-05T09:00', NOW, 'org_owner')
    expect((db.raw.prepare('SELECT COUNT(*) AS n FROM posts').get() as { n: number }).n).toBe(2)
  })

  it('وسقوطُ واحدةٍ لا يوقف الأخرى', async () => {
    const { db, me, page } = await seed()
    db.raw.prepare("UPDATE accounts SET status = 'needs_reauth' WHERE id = ?").run(page)
    const out = await scheduleDestinations(db, 'p1', [me, page], '2026-10-05T09:00', NOW, 'org_owner')
    expect(out[0]!.result.ok).toBe(true)
    expect(out[1]!.result.ok).toBe(false)
    // ‏والنسخةُ التي لم تُجدوَل لا تبقى على اللوح
    expect((db.raw.prepare('SELECT COUNT(*) AS n FROM posts').get() as { n: number }).n).toBe(1)
  })
})

describe('linkedin-page في ملفّ الخطّة', () => {
  const account = (over: Partial<LinkedAccount>): LinkedAccount => ({
    id: 'acc-li', platform: 'linkedin', kind: 'member', displayName: 'عمر', status: 'active',
    createdAt: '2026-09-01 00:00:00', expiresAt: '2026-12-01 00:00:00', ...over,
  })
  const facts = (accounts: LinkedAccount[]): PlanFacts => ({
    accounts, uploads: [], now: new Date('2026-10-03T08:00:00Z'), zone: 'Asia/Riyadh', publishable: new Set(['linkedin', 'x']),
  })
  const csv = 'date,time,platform,text\n2026-10-12,09:30,linkedin-page,نصّ الصفحة\n2026-10-12,09:30,linkedin,نصّ الصفحة\n'

  it('السطرُ يُقرأ لصفحةٍ تنشر باسمها، ومفتاحُه غيرُ مفتاح الحساب الشخصيّ', async () => {
    const rows = readPlan(csv, facts([account({}), account({ id: 'acc-page', kind: 'org', displayName: 'بصيرة', pagePublish: true })])).rows
    expect(rows[0]).toMatchObject({ platform: 'linkedin', page: true, accountId: 'acc-page', problems: [] })
    expect(rows[1]).toMatchObject({ platform: 'linkedin', accountId: 'acc-li', problems: [] })
    expect(await rowKey(rows[0]!)).not.toBe(await rowKey(rows[1]!))
  })

  it('وبلا صفحةٍ تنشر: سببُه «بانتظار موافقة LinkedIn»', () => {
    const [row] = readPlan(csv, facts([account({})])).rows
    expect(row!.problems.join(' ')).toContain('بانتظار موافقة LinkedIn')
  })

  it('وقالبُ الشهر (plan:check) يقبل linkedin-page وlinkedin:page', () => {
    const md = '| اليوم | الساعة | المنصة | النص | الملف | ملاحظة |\n|---|---|---|---|---|---|\n| 2026-12-03 | 09:00 | linkedin-page | نصّ | | |\n| 2026-12-03 | 10:00 | linkedin:page | نصّ | | |\n'
    const r = readTemplate(md, 'md', '2026-12')
    expect(r.issues).toEqual([])
    expect(r.rows.map((x) => x.platform)).toEqual(['linkedin-page', 'linkedin-page'])
  })
})

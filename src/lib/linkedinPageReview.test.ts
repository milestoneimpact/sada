/**
 * ‏ملاحظاتُ مراجعة D-423: «تراجَع» يسحب نسخةَ الصفحة، وسطرُ الصفحة في حزمة المستودع يُردّ ولا يُنشر على الحساب الشخصيّ،
 * ‏وفصلُ صفحةٍ يشارك رمزَها صفحةٌ أخرى لا يُبطل الرمزَ عند LinkedIn.
 */
import { describe, expect, it } from 'vitest'
import { toBase64 } from './crypto'
import { saveTokens, upsertAccount } from './tokens'
import { fakeDb } from '../test/fakes'
import { scheduleDestinations, withdrawCopies } from './schedule/destinations'
import { undoSchedule } from './schedule/job'
import { PAGE_PACKAGE_REFUSAL, planFromTemplate } from './package/plan'
import { disconnectAccount, findLinked } from './oauth/disconnect'

const KEY = toBase64(crypto.getRandomValues(new Uint8Array(32)))

async function seed() {
  const db = fakeDb()
  const me = await upsertAccount(db, 'org_owner', { platform: 'linkedin', kind: 'member', externalId: 'abc', displayName: 'عمر' })
  const page = await upsertAccount(db, 'org_owner', { platform: 'linkedin', kind: 'org', externalId: '111', displayName: 'بصيرة' })
  const page2 = await upsertAccount(db, 'org_owner', { platform: 'linkedin', kind: 'org', externalId: '222', displayName: 'صدى' })
  const live = { accessToken: 'admin-token', refreshToken: null, expiresAt: '2027-01-01T00:00:00Z', refreshExpiresAt: null }
  await saveTokens(db, KEY, me, { ...live, accessToken: 'me-token', scopes: 'openid profile w_member_social' })
  await saveTokens(db, KEY, page, { ...live, scopes: 'w_organization_social r_organization_social' })
  await saveTokens(db, KEY, page2, { ...live, scopes: 'w_organization_social r_organization_social' })
  db.raw.prepare(`INSERT INTO posts (id, platform, type, text, status, idempotency_key, approved_by, approved_at)
                  VALUES ('p1', 'linkedin', 'text', 'نصّ', 'approved', 'draft:k1', 'omar', '2026-10-01 00:00:00')`).run()
  return { db, me, page, page2 }
}

describe('بعد المراجعة (D-423)', () => {
  it('«تراجَع» يسحب نسخةَ الصفحة مع الأصل، فلا يبقى في الطابور شيء', async () => {
    const { db, me, page } = await seed()
    const now = new Date('2026-10-03T08:00:00Z')
    const out = await scheduleDestinations(db, 'p1', [me, page], '2026-10-05T09:00', now, 'org_owner')
    const at = out[0]!.result.ok ? out[0]!.result.at : ''
    const undone = await undoSchedule(db, 'p1', 'org_owner', { at, until: new Date(now.getTime() + 60_000).toISOString(), to: 'approved' }, now)
    expect(undone.ok).toBe(true)
    expect(await withdrawCopies(db, 'p1', 'org_owner', at)).toEqual({ withdrawn: 1, stuck: 0 })
    expect((db.raw.prepare("SELECT COUNT(*) AS n FROM posts WHERE status = 'queued'").get() as { n: number }).n).toBe(0)
  })

  it('سطرُ linkedin-page في حزمة المستودع يُردّ بسببه ولا يصير بندًا على الحساب الشخصيّ', () => {
    const md = '| اليوم | الساعة | المنصة | النص | الملف | ملاحظة |\n|---|---|---|---|---|---|\n| 2026-12-03 | 09:00 | linkedin | نصّ | | |\n| 2026-12-03 | 09:00 | linkedin-page | نصّ | | |\n'
    const plan = planFromTemplate(md, 'plans/2026-12.md')
    expect(plan.entries.map((e) => e.platform)).toEqual(['linkedin'])
    expect(plan.problems.join(' ')).toContain(PAGE_PACKAGE_REFUSAL)
  })

  it('فصلُ صفحةٍ يشارك رمزَها صفحةٌ أخرى لا يُبطله عند LinkedIn، والأخيرةُ تُبطله بسرّي تطبيقها', async () => {
    const { db, page, page2 } = await seed()
    const sent: string[] = []
    const impl = (async (input: Request) => { sent.push(await input.text()); return new Response('{}') }) as unknown as typeof fetch
    const app = { clientId: 'org-id', clientSecret: 'org-secret' }
    const first = await disconnectAccount(db, KEY, (await findLinked(db, 'org_owner', page, 'linkedin'))!, app, impl)
    expect(first.remote).toBe('shared')
    expect(sent).toHaveLength(0)
    const last = await disconnectAccount(db, KEY, (await findLinked(db, 'org_owner', page2, 'linkedin'))!, app, impl)
    expect(last.remote).toBe('revoked')
    expect(sent.join(' ')).toContain('org-id')
  })

  it('وبعد التجديد تتباين الرموز: بصمةُ الموافقة نفسُها تبقيه مشتركًا، وبصمةٌ أخرى تُبطله (مراجعة D-425)', async () => {
    const { db, page, page2 } = await seed()
    // ‏جدّد التجديدُ رمزَ الثانية وحدها — والبصمةُ بصمةُ الاختيار، لا الرمز
    await saveTokens(db, KEY, page2, { accessToken: 'renewed', refreshToken: null, expiresAt: '2027-02-01T00:00:00Z', refreshExpiresAt: null, scopes: 'w_organization_social' })
    db.raw.prepare("UPDATE accounts SET grant_id = 'g1' WHERE id IN (?, ?)").run(page, page2)
    const sent: string[] = []
    const impl = (async (input: Request) => { sent.push(await input.text()); return new Response('{}') }) as unknown as typeof fetch
    const app = { clientId: 'org-id', clientSecret: 'org-secret' }
    expect((await disconnectAccount(db, KEY, (await findLinked(db, 'org_owner', page, 'linkedin'))!, app, impl)).remote).toBe('shared')
    expect(sent).toHaveLength(0)

    const other = await seed()
    other.db.raw.prepare("UPDATE accounts SET grant_id = ? WHERE id = ?").run('g1', other.page)
    other.db.raw.prepare("UPDATE accounts SET grant_id = ? WHERE id = ?").run('g2', other.page2)
    // ‏رمزٌ واحدٌ بالصدفة لا يجعلهما موافقةً واحدة: البصمتان مختلفتان
    expect((await disconnectAccount(other.db, KEY, (await findLinked(other.db, 'org_owner', other.page, 'linkedin'))!, app, impl)).remote).toBe('revoked')
  })
})

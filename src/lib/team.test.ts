import { describe, expect, it } from 'vitest'
import { fakeDb } from '../test/fakes'
import { activeMember, inviteMember, listMembers, revokeMember, whoCanReceive } from './team'

function seed() {
  const db = fakeDb()
  db.raw.exec(`INSERT INTO orgs (id, name, kind) VALUES ('org_a', 'شركة أ', 'team'), ('org_b', 'شركة ب', 'team')`)
  return db
}

describe('الفريق (D-271)', () => {
  it('الدعوةُ بريدٌ صحيحٌ ودورٌ من القائمة وشركاتٌ موجودة، والمالكُ لا يُدعى', async () => {
    const db = seed()
    expect(await inviteMember(db, { email: ' Sara@Example.com ', role: 'editor', orgs: ['org_a'], by: 'o' })).toEqual({ ok: true, email: 'sara@example.com' })
    expect(await inviteMember(db, { email: 'bad', role: 'editor', orgs: '*', by: 'o' })).toMatchObject({ ok: false })
    expect(await inviteMember(db, { email: 'x@y.com', role: 'owner', orgs: '*', by: 'o' })).toMatchObject({ ok: false })
    expect(await inviteMember(db, { email: 'x@y.com', role: 'viewer', orgs: ['org_zz'], by: 'o' })).toMatchObject({ ok: false })
    expect(await inviteMember(db, { email: 'x@y.com', role: 'viewer', orgs: [], by: 'o' })).toMatchObject({ ok: false })
    expect(await inviteMember(db, { email: 'MilestonesImpact@gmail.com', role: 'admin', orgs: '*', by: 'o' })).toMatchObject({ ok: false })
    expect(await activeMember(db, 'sara@example.com')).toMatchObject({ role: 'editor', orgs: ['org_a'] })
  })

  it('من يصله الرمز: المالكُ أو مدعوٌّ قائم، والملغى لا', async () => {
    const db = seed()
    await inviteMember(db, { email: 'sara@example.com', role: 'publisher', orgs: '*', by: 'o' })
    expect(await whoCanReceive(db, 'milestonesimpact@gmail.com')).toMatchObject({ role: 'owner' })
    expect(await whoCanReceive(db, 'SARA@example.com')).toMatchObject({ role: 'publisher', orgs: '*' })
    expect(await whoCanReceive(db, 'nobody@example.com')).toBeNull()
    expect(await revokeMember(db, 'sara@example.com')).toBe(true)
    expect(await whoCanReceive(db, 'sara@example.com')).toBeNull()
    expect(await listMembers(db)).toHaveLength(0)
    // ‏ودعوتُه ثانيةً تعيده
    await inviteMember(db, { email: 'sara@example.com', role: 'viewer', orgs: ['org_b'], by: 'o' })
    expect(await whoCanReceive(db, 'sara@example.com')).toMatchObject({ role: 'viewer', orgs: ['org_b'] })
  })
})

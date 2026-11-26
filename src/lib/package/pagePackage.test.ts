/**
 * ‏مسارُ الحزمة لصفحة LinkedIn (D-426): سطرُ `linkedin-page` يصير بندًا مستقلًّا بمفتاحه، يُجدوَل على الصفحة المربوطة وحدها،
 * ‏ولا يُنشر على الحساب الشخصيّ أبدًا؛ وبلا صفحةٍ مربوطة يُردّ بسببه.
 */
import { describe, expect, it } from 'vitest'
import { fakeDb } from '../../test/fakes'
import { saveTokens, upsertAccount } from '../tokens'
import { toBase64 } from '../crypto'
import { PAGE_PACKAGE_REFUSAL, planFromTemplate } from './plan'
import { changeStatements, packagePosts } from './apply'
import { planPackageSchedule, schedulePackage, SKIP_SAY } from './schedule'
import type { Change, SnapshotEntry } from './diff'

const KEY = toBase64(crypto.getRandomValues(new Uint8Array(32)))
const NOW = new Date('2026-11-16T10:00:00Z')
const MD = '| اليوم | الساعة | المنصة | النص | الملف | ملاحظة |\n|---|---|---|---|---|---|\n'
  + '| 2026-12-03 | 09:00 | linkedin | نصّ الحساب الشخصيّ: لوحة مؤشرات خضراء بالكامل لا تعني أنّ المشروع بخير، فالمؤشّر يقيس ما اخترنا أن نقيسه. | | |\n'
  + '| 2026-12-03 | 09:00 | linkedin-page | نصّ الصفحة: ما يقيسه المؤشّر هو ما اخترنا أن نقيسه، فاللون الأخضر وحده لا يكفي للحكم على المشروع. | | |\n'

async function seed(withPage: boolean) {
  const db = fakeDb()
  const live = { refreshToken: null, expiresAt: '2027-01-01T00:00:00Z', refreshExpiresAt: null }
  const me = await upsertAccount(db, 'org_owner', { platform: 'linkedin', kind: 'member', externalId: 'abc', displayName: 'عمر' })
  await saveTokens(db, KEY, me, { ...live, accessToken: 'me', scopes: 'openid profile w_member_social' })
  let page: string | null = null
  if (withPage) {
    page = await upsertAccount(db, 'org_owner', { platform: 'linkedin', kind: 'org', externalId: '111', displayName: 'بصيرة' })
    await saveTokens(db, KEY, page, { ...live, accessToken: 'pg', scopes: 'w_organization_social r_organization_social' })
  }
  const plan = planFromTemplate(MD, 'plans/2026-12.md')
  for (const e of plan.entries) {
    const after = { item: e.item, platform: e.platform, date: e.date, time: e.time, format: '', idea: '', text: e.text ?? null, media: null, mediaName: null, problems: [] } as unknown as SnapshotEntry
    const change = { period: '2026-12', item: e.item, platform: e.platform, kind: 'added', before: null, after } as Change
    for (const s of changeStatements({ db, org: 'org_owner', revisionId: 'rev1', copySha: null }, change, null, false).statements) await s.run()
  }
  return { db, me, page, plan }
}

describe('صفحة LinkedIn في حزمة المستودع (D-426)', () => {
  it('السطران في يومٍ واحد ← منشورٌ شخصيّ ومنشورُ صفحة، بمفتاحين مختلفين', async () => {
    const { db, me, page, plan } = await seed(true)
    expect(plan.entries.map((e) => e.platform)).toEqual(['linkedin', 'linkedin-page'])
    expect(plan.problems).toEqual([])
    const out = await schedulePackage(db, 'org_owner', 'Asia/Riyadh', NOW, 'panel:email')
    expect(out.failed).toEqual([])
    const rows = db.raw.prepare("SELECT platform, text, account_id, status, idempotency_key FROM posts ORDER BY idempotency_key").all() as { platform: string; text: string; account_id: string; status: string; idempotency_key: string }[]
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => r.platform === 'linkedin' && r.status === 'queued')).toBe(true)
    expect(new Set(rows.map((r) => r.idempotency_key)).size).toBe(2)
    expect(rows.find((r) => r.text.includes('الصفحة'))!.account_id).toBe(page)
    expect(rows.find((r) => r.text.includes('الشخصيّ'))!.account_id).toBe(me)
    // ‏والقراءةُ للمقارنة التالية تعيد البندَ بمنصّته، فلا يُطابَق بالبند الشخصيّ
    expect((await packagePosts(db, 'org_owner')).map((p) => p.platform).sort()).toEqual(['linkedin', 'linkedin-page'])
  })

  it('بلا صفحةٍ مربوطة ← يُردّ بسببه، ولا يُنشر على الحساب الشخصيّ', async () => {
    const { db, me } = await seed(false)
    const plan = await planPackageSchedule(db, 'org_owner', 'Asia/Riyadh', NOW)
    expect(plan.ready).toHaveLength(1)
    expect(plan.ready[0]!.account).toBe(me)
    expect(plan.skipped.page).toBe(1)
    expect(SKIP_SAY.page).toBe(PAGE_PACKAGE_REFUSAL)
    await schedulePackage(db, 'org_owner', 'Asia/Riyadh', NOW, 'panel:email')
    const pageRow = db.raw.prepare("SELECT status, account_id FROM posts WHERE text LIKE '%الصفحة%'").get()
    expect(pageRow).toEqual({ status: 'draft', account_id: null })
  })
})

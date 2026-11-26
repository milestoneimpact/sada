/** «قارن الإصدارات» (D-406): صورُ الاستيراد والإصدارُ القائم، والفرقُ بـ`diffSnapshots` نفسِها. */
import { beforeEach, describe, expect, it } from 'vitest'
import { fakeDb, type FakeDb } from '../../test/fakes'
import { seatPlan } from './seat'
import { diffVersions, readPlanVersions, versionSnapshot } from './versions'
import type { PlanFacts } from './import'
import type { PlanItem } from './prompt'
import { versionsScreen } from '../../routes/ui/planVersionsView'

let db: FakeDb
const facts = (): PlanFacts => ({ accounts: [], uploads: [], now: new Date('2099-01-01T08:00:00Z'), zone: 'Asia/Riyadh', publishable: new Set(['linkedin', 'x']) })
beforeEach(() => { db = fakeDb() })

const item = (day: string, time: string, angle: string, platform: PlanItem['platform'] = 'x'): PlanItem => ({ sourceId: 'import:2', platform, angle, day, time, why: '' })

describe('فرقُ إصدارين', () => {
  it('النصُّ المعدَّل في موعده «نصّ»، والموعدُ المنقولُ حذفٌ وإضافة، وبندان في الموعد نفسِه لا يتداخلان', () => {
    const a = { version: 1, current: false, at: '', items: [item('2099-01-04', '09:00', 'أ'), item('2099-01-05', '13:00', 'ب')] }
    const b = { version: 2, current: true, at: '', items: [item('2099-01-04', '09:00', 'أ معدَّلة'), item('2099-01-06', '13:00', 'ب')] }
    expect(diffVersions(a, b).map((c) => c.kind).sort()).toEqual(['added', 'removed', 'text'])
    expect(versionSnapshot([item('2099-01-04', '09:00', 'أ'), item('2099-01-04', '09:00', 'ثانية')]).entries.map((e) => e.item))
      .toEqual(['2099-01-04 09:00', '2099-01-04 09:00 #2'])
    expect(diffVersions(a, a)).toEqual([])
  })

  it('إصداراتُ خطّةٍ مرفوعة مرّتين: الصورةُ والقائم، وخطّةُ منظّمةٍ أخرى لا تُقرأ، والشاشةُ قبلُ وبعدُ متجاوران', async () => {
    const HEAD = 'التاريخ,الوقت,المنصة,النص'
    const first = await seatPlan(db, 'org_owner', [HEAD, '2099-01-04,09:00,LinkedIn,الأولى'].join('\n'), facts(), new Map(), null)
    await seatPlan(db, 'org_owner', [HEAD, '2099-01-04,09:00,LinkedIn,الأولى معدَّلة', '2099-01-05,13:00,X,ثانية'].join('\n'), facts(), new Map(), null)
    const versions = await readPlanVersions(db, 'org_owner', first.planId!)
    expect(versions.map((v) => [v.version, v.current])).toEqual([[1, false], [2, true]])
    expect(await readPlanVersions(db, 'org_other', first.planId!)).toEqual([])
    const changes = diffVersions(versions[0]!, versions[1]!)
    expect(changes.map((c) => c.kind).sort()).toEqual(['added', 'text'])
    const screen = versionsScreen({ planId: first.planId!, versions, a: versions[0]!, b: versions[1]!, changes })
    expect(screen).toContain('class="pk-diff"')
    expect(screen).toContain('الإصدار 2 (القائم)')
    expect(screen).toContain('أُضيف 1')
    expect(screen).toContain('النصّ عُدّل 1')
  })
})

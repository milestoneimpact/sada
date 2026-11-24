/**
 * واجهةُ D-390: «نزّل قالب الشهر القادم» في «من GitHub» والإعدادات وبطاقة الحزمة، و«يلزم إذن الكتابة» برابط الإعداد.
 */
import { describe, expect, it } from 'vitest'
import { fakeDb } from '../../test/fakes'
import { readSource, saveSource } from '../../lib/package/sync'
import { newWays } from './newView'
import { packageScreen } from './packageView'

describe('قالبُ الشهر وملفُّ الحال في الواجهة', () => {
  it('بطاقةُ «من GitHub» فيها «نزّل قالب الشهر القادم» وREADME', () => {
    const gh = newWays(true).find((w) => w.id === 'github')!
    expect(gh.links?.map((l) => l.label)).toContain('نزّل قالب الشهر القادم')
    expect(gh.links?.map((l) => l.href)).toContain('/panel/plan/month-template?f=readme')
  })

  it('بطاقةُ الحزمة: «يلزم إذن الكتابة» برابط M-64 وإعداد الرمز حين الرمزُ للقراءة، وبلا تحذيرٍ حين كُتب', async () => {
    const db = fakeDb()
    await saveSource(db, 'org_owner', { owner: 'o', repo: 'r', branch: 'b', root: '' })
    const source = (await readSource(db, 'org_owner'))!
    const base = { source, media: [], tokenReady: true }
    const blocked = packageScreen({ ...base, repoStatus: { needsWrite: true, rows: [{ period: '2026-12', written: null, error: 'GitHub ردّ 403', dirty: true }] } })
    expect(blocked).toContain('يلزم إذن الكتابة')
    expect(blocked).toContain('#m-64')
    expect(blocked).toContain('https://github.com/settings/personal-access-tokens')
    expect(blocked).toContain('/panel/plan/month-template?f=md')
    const fine = packageScreen({ ...base, repoStatus: { needsWrite: false, rows: [{ period: '2026-12', written: '2026-12-02 18:00:00', error: null, dirty: false }] } })
    expect(fine).not.toContain('يلزم إذن الكتابة')
    expect(fine).toContain('plans/2026-12.status.json')
  })
})

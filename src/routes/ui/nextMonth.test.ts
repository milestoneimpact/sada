/**
 * **«خطّةُ الشهر القادم» والمسارُ الرباعيّ** (D-389): البطاقةُ تظهر من يوم 20 وتغيب قبله، ولكلّ حالٍ كلمتُها وخطوتُها في
 * المسار وزرُّها الواحد؛ والمسارُ نفسُه في رأس شاشة الشهر.
 */
import { describe, expect, it } from 'vitest'
import { pathAt, planStage, type MonthFacts } from '../../lib/plan/month'
import { monthScreen, nextMonthCard, pathSteps } from './planMonthView'
import { journeyCounts } from '../../lib/home'
import { fakeDb } from '../../test/fakes'

const base: MonthFacts = { period: '2026-12', hasPlan: false, reviewed: false, items: 0, approved: 0, queued: 0, published: 0, failed: 0 }
const f = (over: Partial<MonthFacts>): MonthFacts => ({ ...base, ...over })

describe('خطّة الشهر القادم (D-389)', () => {
  it('تغيب قبل يوم 20 وتظهر منه', () => {
    expect(nextMonthCard(base, '2026-11-19')).toBe('')
    expect(nextMonthCard(base, '2026-11-01')).toBe('')
    expect(nextMonthCard(base, '2026-11-20')).toContain('خطّةُ الشهر القادم')
    expect(nextMonthCard(base, '2026-11-30')).toContain('id="next-month"')
  })

  const cases: readonly [string, MonthFacts, string, string, number][] = [
    ['لم تبدأ', base, 'لم تبدأ', 'href="/panel/new"', 0],
    ['مستوردة', f({ hasPlan: true, items: 4 }), 'مستوردة', 'href="/panel/plan/month?p=2026-12"', 1],
    ['مراجَعة', f({ hasPlan: true, reviewed: true, items: 4, approved: 1 }), 'مراجَعة', 'href="/panel/plan/month?p=2026-12"', 2],
    ['معتمدة', f({ hasPlan: true, reviewed: true, items: 4, approved: 3, queued: 1 }), 'معتمدة', 'href="/panel/feed?m=2026-12"', 3],
    ['مجدولة', f({ hasPlan: true, reviewed: true, items: 4, queued: 3, published: 1 }), 'مجدولة', 'href="/panel/feed?m=2026-12"', 4],
  ]
  for (const [name, facts, say, href, at] of cases) {
    it(`${name}: كلمتُها وزرٌّ واحدٌ لخطوتها والمسارُ عند ${at}`, () => {
      expect(pathAt(planStage(facts))).toBe(at)
      const html = nextMonthCard(facts, '2026-11-24')
      expect(html).toContain(say)
      expect(html).toContain(href)
      expect((html.match(/class="btn /g) ?? []).length).toBe(1)
      const steps = [...html.matchAll(/<li( aria-current="step")?>/g)]
      expect(steps.length).toBe(4)
      expect(steps.findIndex((m) => m[1] !== undefined)).toBe(at === 4 ? -1 : at)
    })
  }

  it('حقائقُ الشهر القادم من جملة الرحلة نفسِها: plans.period وplan_items، وخطّةُ منظّمةٍ أخرى لا تُقرأ (org_id)', async () => {
    const db = fakeDb()
    db.raw.exec(`INSERT INTO plans (id, week_start, plan_json, model, status, span, org_id, period, locked_at) VALUES
      ('px', '2099-02-01', '{"items":[]}', 'm', 'draft', 'month', 'org_other', '2099-02', datetime('now'))`)
    const none = await journeyCounts(db, 'org_owner', new Date(), [], '2099-02')
    expect(none.facts).toEqual({ ...base, period: '2099-02' })
    db.raw.exec(`INSERT INTO plans (id, week_start, plan_json, model, status, span, org_id, period) VALUES
      ('pm', '2099-02-01', '{"items":[]}', 'm', 'draft', 'month', 'org_owner', '2099-02')`)
    db.raw.exec(`INSERT INTO plan_items (id, org_id, plan_id, item_key, platform, source_kind) VALUES
      ('i1', 'org_owner', 'pm', 'k1', 'x', 'csv'), ('i2', 'org_owner', 'pm', 'k2', 'x', 'csv'), ('i3', 'org_other', 'px', 'k1', 'x', 'csv')`)
    const got = await journeyCounts(db, 'org_owner', new Date(), [], '2099-02')
    expect(got.facts).toEqual({ ...base, period: '2099-02', hasPlan: true, items: 2 })
    expect(planStage(got.facts!)).toBe('imported')
    expect((await journeyCounts(db, 'org_owner', new Date(), [])).facts).toBeUndefined()
  })

  it('المسارُ بأسمائه الأربعة بترتيبها', () => {
    const html = pathSteps(1)
    const order = ['المصدر', 'الفحص', 'الاعتماد', 'التيّار'].map((s) => html.indexOf(s))
    expect(order.every((i, k) => i > 0 && (k === 0 || i > order[k - 1]!))).toBe(true)
    expect(html).toContain('aria-label="مسار الخطّة"')
  })

  it('والمسارُ في رأس شاشة الشهر، بخطّةٍ وبلا خطّة', () => {
    const d = {
      period: '2026-12', planId: null, perDay: {}, dailyCap: 5, checks: { findings: [], canFix: true }, diff: [], approval: '', canApprove: false,
      prev: '2026-11', next: '2027-01', path: 0,
    }
    expect(monthScreen(d)).toContain('aria-label="مسار الخطّة"')
    const withPlan = monthScreen({ ...d, planId: 'pl1', path: 2 })
    expect(withPlan.indexOf('مسار الخطّة')).toBeLessThan(withPlan.indexOf('التقويم'))
    expect(withPlan).toContain('<li aria-current="step">')
    expect(monthScreen({ ...d, path: undefined } as never)).not.toContain('مسار الخطّة')
  })
})

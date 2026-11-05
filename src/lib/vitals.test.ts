/**
 * القياسُ الميدانيّ (D-299): التطبيعُ والمئينُ والحكمُ والسقفُ والمحوُ — بلا شبكة.
 */
import { describe, expect, it } from 'vitest'
import { fakeDb } from '../test/fakes'
import { DAILY_CAP, formatVital, p75, pageKey, rate, recordVital, vitalsSummary } from './vitals'

describe('التطبيع والحساب', () => {
  it('المسارُ يُطمَس فيه المعرّفُ ويُحذَف الاستعلام، وغيرُ اللوحة لا يُقبَل', () => {
    expect(pageKey('/panel/drafts/8f2a9c1d4e?x=1#d-3')).toBe('/panel/drafts/:id')
    expect(pageKey('/panel/plan/123/review')).toBe('/panel/plan/:id/review')
    expect(pageKey('/panel')).toBe('/panel')
    expect(pageKey('/login')).toBeNull()
    expect(pageKey('/panel/' + 'x'.repeat(200))?.length).toBeLessThanOrEqual(80)
  })

  it('المئينُ 75 بأقرب رتبة، والحكمُ من حدود web.dev', () => {
    expect(p75([])).toBeNull()
    expect(p75([5])).toBe(5)
    expect(p75([1, 2, 3, 4])).toBe(3)
    expect(p75([10, 1, 9, 2, 8, 3, 7, 4])).toBe(8)
    expect(rate('LCP', 2500)).toBe('good')
    expect(rate('LCP', 2501)).toBe('needs-improvement')
    expect(rate('INP', 501)).toBe('poor')
    expect(rate('CLS', 0.1)).toBe('good')
  })

  it('القيمُ بوحدتها بلغة المالك', () => {
    expect(formatVital('LCP', 1840)).toBe('1.8 ثانية')
    expect(formatVital('INP', 183.6)).toBe('184 ملّي ثانية')
    expect(formatVital('CLS', 0.046)).toBe('0.05')
  })
})

describe('الحفظُ والقراءة', () => {
  it('تُحفَظ بلا هويّة، وتُلخَّص بالمئين لكلّ مقياسٍ وجهاز، ولا حكمَ تحت عشر عيّنات', async () => {
    const db = fakeDb()
    for (let i = 0; i < 12; i += 1) {
      await recordVital(db, 'org_owner', { metric: 'LCP', value: 1000 + i * 100, page: '/panel', device: 'phone' })
    }
    await recordVital(db, 'org_owner', { metric: 'INP', value: 90, page: '/panel', device: 'desktop' })
    await recordVital(db, 'org_other', { metric: 'LCP', value: 9000, page: '/panel', device: 'phone' })
    const s = await vitalsSummary(db, 'org_owner')
    expect(s.samples).toBe(13)
    expect(s.byMetric.LCP.phone).toEqual({ p75: 1800, n: 12, rating: 'good' })
    expect(s.byMetric.INP.desktop).toEqual({ p75: 90, n: 1, rating: null })
    expect(s.byMetric.CLS.phone).toEqual({ p75: null, n: 0, rating: null })
    expect(s.slowest).toEqual({ page: '/panel', p75: 1800 })
    const cols = await db.prepare('SELECT * FROM web_vitals LIMIT 1').first<Record<string, unknown>>()
    expect(Object.keys(cols ?? {}).sort()).toEqual(['at', 'device', 'metric', 'org_id', 'page', 'value'])
  })

  it('سقفُ اليوم يردّ ما فوقه بلا أثر، وما فوق ثلاثين يومًا يُمحى عند الكتابة', async () => {
    const db = fakeDb()
    await db
      .prepare("INSERT INTO web_vitals (org_id, metric, value, page, device, at) VALUES ('org_owner', 'CLS', 0.3, '/panel', 'phone', datetime('now', '-40 days'))")
      .run()
    for (let i = 0; i < DAILY_CAP; i += 1) {
      await db
        .prepare("INSERT INTO web_vitals (org_id, metric, value, page, device) VALUES ('org_owner', 'INP', 100, '/panel', 'phone')")
        .run()
    }
    expect(await recordVital(db, 'org_owner', { metric: 'INP', value: 100, page: '/panel', device: 'phone' })).toBe('capped')
    expect(await recordVital(db, 'org_other', { metric: 'INP', value: 100, page: '/panel', device: 'phone' })).toBe('stored')
    const old = await db.prepare("SELECT count(*) AS n FROM web_vitals WHERE org_id = 'org_owner' AND metric = 'CLS'").first<{ n: number }>()
    expect(old?.n).toBe(1)
    await db.prepare("DELETE FROM web_vitals WHERE org_id = 'org_owner' AND metric = 'INP'").run()
    await recordVital(db, 'org_owner', { metric: 'INP', value: 100, page: '/panel', device: 'phone' })
    const after = await db.prepare("SELECT count(*) AS n FROM web_vitals WHERE org_id = 'org_owner' AND metric = 'CLS'").first<{ n: number }>()
    expect(after?.n).toBe(0)
  })
})

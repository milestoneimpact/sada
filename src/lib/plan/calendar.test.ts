import { describe, expect, it } from 'vitest'
import { bulkPick, calHref, calSpan, calStatus, matches, parseCalQuery, toggle, weekOf, type CalItem } from './calendar'
import { bulkForm, calFilters, unifiedCalendar } from '../../routes/ui/planMonthView'

const KNOWN = ['linkedin', 'x', 'instagram']
const q = (s: string) => parseCalQuery(new URLSearchParams(s), '2026-11-26', KNOWN)
const items: CalItem[] = [
  { id: 'a', platform: 'linkedin', due: '2026-11-02 09:00', title: 'أ', status: 'awaiting' },
  { id: 'b', platform: 'x', due: '2026-11-02 12:00', title: 'ب', status: 'scheduled' },
  { id: 'c', platform: 'x', due: '2026-11-20 10:00', title: 'ج', status: 'awaiting' },
  { id: 'd', platform: 'instagram', due: '2026-11-03 10:00', title: 'د', status: 'published' },
]

describe('التقويم الموحّد (D-410)', () => {
  it('يقرأ العنوان: العرض والمنصّات المتعدّدة والحال، والغريبُ يسقط إلى الافتراض', () => {
    const a = q('v=week&d=2026-11-04&pf=x,linkedin&pf=zzz&st=awaiting,bogus')
    expect(a).toEqual({ view: 'week', period: '2026-11', day: '2026-11-04', platforms: ['x', 'linkedin'], statuses: ['awaiting'] })
    expect(q('v=nope&p=2027-01')).toMatchObject({ view: 'month', period: '2027-01', platforms: [], statuses: [] })
    expect(q('')).toMatchObject({ view: 'month', period: '2026-11', day: '2026-11-26' })
  })

  it('حالُ البند من منشوره: بلا منشورٍ أو مسوّدةً ينتظر، والمعتمَدُ والطابورُ مجدوَل', () => {
    expect(calStatus(null)).toBe('awaiting')
    expect(calStatus('draft')).toBe('awaiting')
    expect(calStatus('queued')).toBe('scheduled')
    expect(calStatus('approved')).toBe('scheduled')
    expect(calStatus('published')).toBe('published')
  })

  it('الرابطُ يحمل الفرزَ فيُشارَك، والقلبُ يضيف ويحذف', () => {
    const a = q('v=day&d=2026-11-02&pf=x')
    expect(calHref(a)).toBe('/panel/plan/month?v=day&d=2026-11-02&pf=x')
    expect(calHref(a, { platforms: toggle(a.platforms, 'linkedin') })).toContain('pf=x%2Clinkedin')
    expect(toggle(['x'], 'x')).toEqual([])
    expect(parseCalQuery(new URL('https://h' + calHref(a)).searchParams, '2026-11-26', KNOWN)).toEqual(a)
  })

  it('الأسبوعُ يبدأ بالأحد، والسابقُ والتالي بسبعة أيّام', () => {
    expect(weekOf('2026-11-04')).toEqual(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07'])
    expect(calSpan(q('v=week&d=2026-11-04'))).toMatchObject({ prev: '2026-10-28', next: '2026-11-11' })
  })

  it('«اعتمد ما في الفرز» يأخذ المنتظرَ المطابقَ وحده، وفي أيّام العرض', () => {
    expect(bulkPick(items, q('p=2026-11'))).toEqual(['a', 'c'])
    expect(bulkPick(items, q('pf=x'))).toEqual(['c'])
    expect(bulkPick(items, q('v=week&d=2026-11-02'))).toEqual(['a'])
    expect(bulkPick(items, q('st=published'))).toEqual([])
    expect(matches(items[1]!, q('pf=x&st=scheduled'))).toBe(true)
  })

  it('الشاشة: شرائحُ بـaria-pressed، وخانةُ الشهر رابطٌ إلى يومها بعلامات المنصّة والحال', () => {
    const a = q('pf=x')
    const bar = calFilters(a, KNOWN)
    expect(bar).toContain('aria-pressed="true"')
    expect(bar).toContain('href="/panel/plan/month?v=week&amp;d=2026-11-26&amp;pf=x"')
    const m = unifiedCalendar({ q: q(''), items, platforms: KNOWN, dailyCap: 5 })
    expect(m).toContain('href="/panel/plan/month?v=day&amp;d=2026-11-02"')
    expect(m).toContain('ينتظر الاعتماد')
    expect(m).not.toContain('style=')
    const d = unifiedCalendar({ q: q('v=day&d=2026-11-02&pf=x'), items, platforms: KNOWN, dailyCap: 5 })
    expect(d).toContain('ب')
    expect(d).not.toContain('>أ<')
  })

  it('النموذجُ الجماعيّ يمرّ بمسار الاعتماد بتأكيدٍ يذكر العدد', () => {
    const f = bulkForm({ q: q('pf=x'), items, platforms: KNOWN, dailyCap: 5 }, 'plan1')
    expect(f).toContain('action="/panel/plan/month/approve"')
    expect(f).toContain('data-confirm="اعتمد 1 بندًا')
    expect(f).toContain('name="scope" value="filter"')
    expect(bulkForm({ q: q('st=published'), items, platforms: KNOWN, dailyCap: 5 }, 'plan1')).not.toContain('<form')
  })
})

/**
 * الخطُّ الزمنيّ للمحفظة (D-212) — **بالحساب لا بالتشغيل**: نافذةٌ ومواضعُ ونغماتٌ وطوابق.
 */
import { describe, expect, it } from 'vitest'
import { gantt, localMidnight, readShift, readSpan, windowOf, type GanttPost } from './gantt'

const NOW = new Date('2026-10-15T09:00:00Z') // ‏الثانيةَ عشرةَ ظهرًا بالرياض

function post(over: Partial<GanttPost>): GanttPost {
  return {
    id: 'p', platform: 'linkedin', accountId: 'a1', account: 'عمر', status: 'draft', text: 'نصٌّ',
    createdAt: '2026-10-10 06:00:00', approvedAt: null, scheduledAt: null, publishedAt: null, ...over,
  }
}

describe('النافذة', () => {
  it('تبدأ من منتصف ليل الرياض لا منتصف ليل غرينتش، وثلثُها ماضٍ', () => {
    const w = windowOf(NOW, null, 30, 0)
    // ‏منتصفُ ليل الرياض ٢١:٠٠ بغرينتش من اليوم السابق؛ وعشرةُ أيّامٍ قبل الخامس عشر
    expect(w.from.toISOString()).toBe('2026-10-04T21:00:00.000Z')
    expect(w.to.toISOString()).toBe('2026-11-03T21:00:00.000Z')
    expect(localMidnight(NOW, 'UTC').toISOString()).toBe('2026-10-15T00:00:00.000Z')
  })

  it('تُقلَّب نوافذَ كاملة', () => {
    const a = windowOf(NOW, null, 14, 0)
    const b = windowOf(NOW, null, 14, -1)
    expect(a.from.getTime() - b.from.getTime()).toBe(14 * 86_400_000)
  })

  it('وما يأتي من العنوان يُطابَق بقائمة سماح', () => {
    expect(readSpan('90')).toBe(90)
    expect(readSpan('45')).toBe(30)
    expect(readSpan(null)).toBe(30)
    expect(readShift('-2')).toBe(-2)
    expect(readShift('99')).toBe(6)
    expect(readShift('1;DROP')).toBe(0)
  })
})

describe('الشريط', () => {
  const win = windowOf(NOW, null, 30, 0)

  it('منشورٌ نُشر: كتابةٌ ثمّ انتظارٌ ثمّ علامةٌ خضراء عند لحظة النشر', () => {
    const c = gantt({
      posts: [post({
        status: 'published', approvedAt: '2026-10-11 06:00:00',
        scheduledAt: '2026-10-13 06:00:00', publishedAt: '2026-10-13 06:00:05',
      })],
      plans: [],
    }, win, NOW, null)
    const bar = c.groups[0]!.rows[0]!.tiers[0]![0]!
    expect(bar.tone).toBe('ok')
    expect(bar.split).not.toBeNull()
    expect(bar.start).toBeLessThan(bar.split!)
    expect(bar.split!).toBeLessThan(bar.end)
    expect(bar.mark).toBe(bar.end)
    expect(bar.href).toBe('/panel/journey/p')
    expect(c.summary).toEqual({ total: 1, published: 1, upcoming: 0, waiting: 0, failed: 0 })
  })

  it('مسوّدةٌ لم يُقرَّر فيها تمتدّ إلى «الآن» مفتوحةً — ولو كُتبت قبل النافذة', () => {
    const c = gantt({ posts: [post({ createdAt: '2026-08-01 06:00:00' })], plans: [] }, win, NOW, null)
    const bar = c.groups[0]!.rows[0]!.tiers[0]![0]!
    expect(bar.open).toBe(true)
    expect(bar.clippedStart).toBe(true)
    expect(bar.start).toBe(0)
    expect(bar.end).toBe(c.now)
    expect(bar.mark).toBeNull()
    expect(c.summary.waiting).toBe(1)
  })

  it('ما انتهى قبل النافذة لا يدخلها', () => {
    const c = gantt({
      posts: [post({ status: 'published', createdAt: '2026-08-01 06:00:00', approvedAt: '2026-08-01 07:00:00',
        scheduledAt: '2026-08-02 06:00:00', publishedAt: '2026-08-02 06:00:00' })],
      plans: [],
    }, win, NOW, null)
    expect(c.groups).toEqual([])
    expect(c.summary.total).toBe(0)
  })

  it('المتداخلان في حسابٍ واحدٍ طابقان، والمتعاقبان طابقٌ واحد', () => {
    const c = gantt({
      posts: [
        post({ id: 'a', createdAt: '2026-10-06 06:00:00', approvedAt: '2026-10-07 06:00:00', status: 'queued', scheduledAt: '2026-10-20 06:00:00' }),
        post({ id: 'b', createdAt: '2026-10-08 06:00:00', approvedAt: '2026-10-08 07:00:00', status: 'queued', scheduledAt: '2026-10-21 06:00:00' }),
        post({ id: 'c', createdAt: '2026-10-25 06:00:00', approvedAt: '2026-10-25 07:00:00', status: 'queued', scheduledAt: '2026-10-28 06:00:00' }),
      ],
      plans: [],
    }, win, NOW, null)
    const tiers = c.groups[0]!.rows[0]!.tiers
    expect(tiers.map((t) => t.map((b) => b.id))).toEqual([['a', 'c'], ['b']])
    expect(c.summary.upcoming).toBe(3)
  })

  it('المنصّاتُ بترتيب قاموسها، والمسوّدةُ بلا حسابٍ تُسمّى', () => {
    const c = gantt({
      posts: [post({ id: 'x1', platform: 'x', accountId: '', account: '' }), post({ id: 'l1' })],
      plans: [{ id: 'pl', weekStart: '2026-10-11', status: 'approved' }],
    }, win, NOW, null)
    expect(c.groups.map((g) => g.label)).toEqual(['الخطط الأسبوعيّة', 'LinkedIn', 'X'])
    expect(c.groups[2]!.rows[0]!.label).toBe('لم يُربَط بحساب')
    const plan = c.groups[0]!.rows[0]!.tiers[0]![0]!
    expect(plan.tone).toBe('ok')
    // ‏سبعةُ أيّامٍ من ثلاثين
    expect(plan.end - plan.start).toBeCloseTo((7 / 30) * 100, 1)
  })

  it('علاماتُ المحور: أسبوعيّةٌ في الثلاثين، وأوّلُ الشهر باسمه', () => {
    const c = gantt({ posts: [], plans: [] }, win, NOW, null)
    expect(c.ticks[0]!.major).toBe(true)
    expect(c.ticks.some((t) => t.label === '1 نوفمبر')).toBe(true)
    expect(c.ticks.length).toBeLessThanOrEqual(7)
    const two = gantt({ posts: [], plans: [] }, windowOf(NOW, null, 14, 0), NOW, null)
    expect(two.ticks).toHaveLength(13)
  })
})

/** ‏«اليوم» في تقويم الخطّة (D-401): ‏«aria-current=date» على خانةٍ واحدة بمنطقة المالك، والحلقةُ من الرموز. */
import { describe, expect, it } from 'vitest'
import { calendar } from './planReviewView'
import { STYLE } from './styles'
import { sheet } from '../../test/css'

const items = [{ sourceId: 's1', platform: 'linkedin', kind: 'text', angle: 'زاوية', day: '2026-11-09', time: '06:00', why: 'ل' }]
const m = {
  plan: { id: 'pl1', week: '2026-11-08', plan: { rationale: '', items }, model: 'm', status: 'approved', createdAt: '2026-11-02 08:00:00', span: 'week',
    choices: { channels: ['linkedin'], cadence: {}, sources: 'all', ideas: [], assets: [], autoImage: true, imageStyle: 'illustration', startDay: '2026-11-08' } },
  version: 1, lockedAt: null, versions: [], gaps: { unwritten: 0, no_image: 0, pending: 1, clash: 0 },
  cards: [{ index: 0, key: 'k0', item: items[0], post: { id: 'p0', status: 'draft', text: 'نصّ', scheduledAt: null }, mediaId: null, gaps: ['pending'] }],
} as never
const board = { zone: 'Asia/Riyadh', cardHref: () => '#' }
const count = (h: string): number => (h.match(/aria-current="date"/g) ?? []).length

describe('«اليوم» في التقويم (D-401)', () => {
  it('خانةُ اليوم وحدها تحمل aria-current=date — بمنطقة المالك', () => {
    // ‏22:30 UTC يومَ 8 هي ‏01:30 يومَ 9 في الرياض
    const h = calendar(m, undefined, board, new Date('2026-11-08T22:30:00Z')).value
    expect(count(h)).toBe(1)
    expect(h).toMatch(/data-day="2026-11-09" aria-current="date"/)
    // ‏وبلا منطقة (وثيقةُ الخطّة) فبمنطقة الاحتياط في D-201 (الرياض) كسائر الواجهة، لا UTC: اليومُ 9 لا 8
    expect(calendar(m, undefined, undefined, new Date('2026-11-08T22:30:00Z')).value).toMatch(/href="#d-2026-11-09" aria-current="date"/)
  })
  it('يومٌ خارج الأسبوع لا يُعلَّم', () => {
    expect(count(calendar(m, undefined, board, new Date('2026-12-20T10:00:00Z')).value)).toBe(0)
  })
  it('الحلقةُ من الرموز', () => {
    expect(sheet(STYLE).rule('.rv-cd[aria-current=date]')['box-shadow']).toBe('inset 0 0 0 var(--ring-w) var(--accent)')
  })
})

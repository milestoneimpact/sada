import { describe, expect, it } from 'vitest'
import { DESK_MAX, deskQueue } from './desk'
import type { DraftRow } from '../../../lib/draft/store'

const NOW = new Date('2026-10-15T12:00:00Z')
const row = (id: string, status: string, h: number): DraftRow =>
  ({ id, status, platform: 'linkedin', accountName: 'عمر', text: `نصّ ${id}\nسطر ثان`, createdAt: `2026-10-15 ${String(h).padStart(2, '0')}:00:00` }) as unknown as DraftRow

describe('«ينتظر قرارك» في الرئيسيّة (D-216)', () => {
  it('لا بطاقة حين لا شيء ينتظر', () => {
    expect(deskQueue([row('a', 'approved', 9), row('b', 'published', 9)], NOW)).toBe('')
  })

  it('الفاشل أوّلًا بـ«أصلحه»، ثمّ المنتظر بـ«اعتمد» من نموذج اللوح نفسِه', () => {
    const html = deskQueue([row('w', 'draft', 9), row('f', 'failed', 2), row('q', 'queued', 10)], NOW)
    expect(html.indexOf('نصّ f')).toBeLessThan(html.indexOf('نصّ w'))
    expect(html).toContain('href="/panel#d-f">أصلحه</a>')
    expect(html).toContain('action="/panel/drafts/decide"')
    expect(html).toContain('value="w"')
    expect(html).not.toContain('نصّ q')
  })

  it(`${DESK_MAX} بطاقات والباقي رابط بعدده`, () => {
    const html = deskQueue(['a', 'b', 'c', 'd', 'e'].map((id, i) => row(id, 'draft', i + 1)), NOW)
    expect(html.match(/class="desk-row"/g)).toHaveLength(DESK_MAX)
    expect(html).toContain('و2 غيرُها في المنشورات')
  })
})

describe('الحلقةُ اليوميّة من الرئيسيّة (D-431)', () => {
  const T = [{ id: 'acc1', platform: 'linkedin' as const, label: 'عمر' }]
  it('«اعتمد · غدًا» نموذجُ البطاقة نفسُه بـ data-swap ووجهتِه', () => {
    const html = deskQueue([row('w', 'draft', 9)], NOW, T, [])
    expect(html).toContain('id="k-w"')
    expect(html).toContain('data-swap')
    expect(html).toContain('value="approve-schedule"')
    expect(html).toContain('name="account" value="acc1"')
  })
  it('بلا وجهةٍ واحدة يبقى «اعتمد» وحدَه', () => {
    expect(deskQueue([row('w', 'draft', 9)], NOW)).toContain('value="approve"')
  })
  it('المعتمَدةُ بلا موعدٍ صفٌّ بـ«جدوِل · غدًا»، والمجدولةُ لا', () => {
    const free = { ...row('a', 'approved', 9), scheduledAt: null } as DraftRow
    const html = deskQueue([free], NOW, T, [])
    expect(html).toContain('action="/panel/drafts/schedule"')
    expect(html).toContain('name="preset" value="tomorrow"')
    expect(deskQueue([{ ...free, scheduledAt: '2026-10-16 06:00:00' } as DraftRow], NOW, T, [])).toBe('')
  })
})

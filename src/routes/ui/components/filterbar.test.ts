import { describe, expect, it } from 'vitest'
import { filterBar, pctChange, statTile } from './filterbar'

describe('شريطُ الفلتر الواحد والرقمُ باتّجاهه (UX-AUDIT-4 · أ)', () => {
  it('سطرٌ واحد: مقطّعٌ وقائمةٌ وشعارات، والمختارُ مضغوط', () => {
    const html = filterBar([
      { kind: 'seg', label: 'الفترة', options: [{ label: '7', href: '?d=7', current: false }, { label: '30', href: '?d=30', current: true }] },
      { kind: 'pick', label: 'رتّب:', name: 's', options: [{ label: 'الأحدث', value: 'seen', current: true }, { label: 'الاسم', value: 'name', current: false }] },
      { kind: 'logos', label: 'المنصّة', options: [{ label: 'X', href: '?p=x', current: true, logo: '<svg></svg>' }] },
    ])
    expect(html.match(/class="fbar"/g)).toHaveLength(1)
    expect(html).toContain('href="?d=30" aria-current="true" aria-pressed="true"')
    expect(html).toContain('<b>الأحدث</b><span class="menu-caret"')
    expect(html).toContain('data-filter="s" value="name"')
    expect(html).toContain('class="fb-logo" href="?p=x"')
  })

  it('الفرقُ بعلامته ونصّه، والإنفاقُ ينزل خيرًا، ولا مقارنةَ بلا سابقة', () => {
    expect(statTile({ label: 'خرج', value: '12', delta: 40 })).toContain('data-tone="good">↑ 40٪')
    expect(statTile({ label: 'أُنفق', value: '$1', delta: 20, good: 'down' })).toContain('data-tone="bad">↑ 20٪')
    expect(statTile({ label: 'خرج', value: '3', delta: null })).toContain('لا مقارنة')
    expect(pctChange(12, 10)).toBe(20)
    expect(pctChange(5, 0)).toBeNull()
    expect(pctChange(0, 0)).toBe(0)
  })
})

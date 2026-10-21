import { describe, expect, it } from 'vitest'
import { anchorPath, panelHref } from './panes'

describe('أين تسكن كلّ مرساة (D-211)', () => {
  it('المنتقلة بأسمائها وبادئاتها إلى مساراتها، والباقية في /panel', () => {
    expect(panelHref('providers')).toBe('/panel/settings#providers')
    expect(panelHref('channels')).toBe('/panel/accounts#channels')
    expect(panelHref('ch-linkedin')).toBe('/panel/accounts#ch-linkedin')
    expect(panelHref('v-up1')).toBe('/panel/library#v-up1')
    expect(panelHref('pivot')).toBe('/panel/analysis#pivot')
    expect(panelHref('d-123')).toBe('/panel#d-123')
    expect(panelHref('posts')).toBe('/panel#posts')
    // ‏حقولُ السقوف انتقلت مع «الإنفاق والحدود»، وكانت «#c2» و«#c3» تقع على /panel بلا هدف
    expect(panelHref('c2')).toBe('/panel/settings#c2')
    expect(panelHref('c3')).toBe('/panel/settings#c3')
    expect(anchorPath('write')).toBeNull()
  })
})

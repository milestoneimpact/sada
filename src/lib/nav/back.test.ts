/** العودةُ من قائمةٍ مغلقة — **ولا تحويلةَ مفتوحة** (D-172). */
import { describe, expect, it } from 'vitest'
import { backTo, returnTo } from './back'

describe('backTo', () => {
  it('صفحة منصّة وتبويبُها', () => {
    expect(backTo(returnTo('linkedin', 'waiting'), '/panel#posts')).toBe('/panel/channels/linkedin?tab=waiting')
    expect(backTo(returnTo('x', 'posts'), '/panel#posts')).toBe('/panel/channels/x#upcoming')
    // ‏ونموذجا ضبط التطبيق يعودان إلى تبويب الإعداد لا إلى لوح القنوات (ر-1)
    expect(backTo(returnTo('instagram', 'setup'), '/panel#channels')).toBe('/panel/channels/instagram?tab=setup')
  })

  it('وما سواها يعود إلى البديل', () => {
    for (const bad of ['//evil.com', 'https://evil.com', 'javascript:alert(1)', '/panel/../x', '/\\evil',
      'platform:x:posts\r\nSet-Cookie: a=1', 'platform:myspace:posts', 'platform:x:media', null, 42]) {
      expect(backTo(bad, '/panel#posts'), String(bad)).toBe('/panel#posts')
    }
  })
})

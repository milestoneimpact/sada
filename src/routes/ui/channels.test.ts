/**
 * لوحُ القنوات يقرأ صفَّ الإذن لا كلمةَ الحال (D-159).
 */
import { describe, expect, it } from 'vitest'
import { viewChannels, type LinkedAccount } from '../../lib/channels'
import { channelsSection } from './channels'

const now = new Date('2026-09-27T12:00:00Z')
const acc = (over: Partial<LinkedAccount>): LinkedAccount => ({
  id: 'a1', platform: 'linkedin', kind: 'member', displayName: 'عمر', status: 'active',
  createdAt: '2026-09-01 00:00:00', expiresAt: '2026-11-01 00:00:00', ...over,
})

describe('حسابٌ مربوطٌ بلا صفّ tokens', () => {
  it('يُعرَض «مربوطة بلا إذن» ويدخل «ما ينتظرك الآن» بزرّ «أعد الربط»', () => {
    const html = channelsSection(viewChannels([acc({ expiresAt: null })], () => true), now)
    expect(html).toContain('مربوطة بلا إذن')
    expect(html).toContain('بلا إذنٍ محفوظ')
    expect(html).toContain('ما ينتظرك الآن')
    expect(html).toContain('أعد ربط LinkedIn')
    expect(html).not.toContain('اربط حسابا آخر')
  })

  it('وبصفٍّ صالحٍ يبقى «مربوطة» ولا ينتظر شيء', () => {
    const html = channelsSection(viewChannels([acc({})], () => true), now)
    expect(html).toContain('>مربوطة<')
    expect(html).not.toContain('مربوطة بلا إذن')
    expect(html).not.toContain('ما ينتظرك الآن')
    expect(html).toContain('اربط حسابا آخر')
  })

  it('والحسابُ الذي يحتاج تجديدًا لا يُعَدّ مرّتين', () => {
    const html = channelsSection(viewChannels([acc({ status: 'needs_reauth', expiresAt: null })], () => true), now)
    expect(html).toContain('تحتاج تجديدا')
    expect(html).not.toContain('مربوطة بلا إذن')
    expect((html.match(/ما ينتظرك الآن/g) ?? []).length).toBe(1)
  })
})

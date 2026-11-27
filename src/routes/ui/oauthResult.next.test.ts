/** ‏نجاحُ الربط يقود إلى الخطوة التالية (D-435): لعميلٍ إلى «جاهزيّة العميل»، وللمالك إلى شاشة المنصّة. */
import { describe, expect, it } from 'vitest'
import { connectedBody, expiredBody } from './oauthResult'

const base = { platform: 'linkedin' as const, displayName: 'عمر', grantedScopes: [], hasRefresh: true, expiresAt: '2026-12-01T00:00:00Z' }

describe('صفحةُ نجاح الربط', () => {
  it('ربطٌ لعميل: الزرُّ الأوّليّ «التالي: جاهزيّة العميل»', () => {
    const html = connectedBody({ ...base, forClient: true })
    expect(html).toMatch(/btn-primary[^>]*href="\/panel\/client#setup"|href="\/panel\/client#setup"[^>]*btn-primary/)
    expect(html).toContain('التالي: جاهزيّة العميل')
  })
  it('ربطٌ للمالك: شاشةُ المنصّة كما كانت، ولا ذكرَ للعميل', () => {
    const html = connectedBody(base)
    expect(html).not.toContain('/panel/client#setup')
    expect(html).toContain('href="/panel/channels/linkedin"')
  })
  it('انتهاءُ المهلة: «اربط من جديد» إلى بدء الدورة', () => {
    const html = expiredBody('x')
    expect(html).toContain('انتهت مهلة الربط')
    expect(html).toContain('href="/oauth/x/start"')
  })
})

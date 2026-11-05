/**
 * خلاصةُ الأخطاء (D-302): صندوقٌ واحد ينال التركيزَ ويقرؤه قارئُ الشاشة، وكلُّ سطرٍ رابطٌ إلى حقله، ولا شيءَ حين لا خطأ.
 */
import { describe, expect, it } from 'vitest'
import { errorSummary } from './errorSummary'

describe('errorSummary', () => {
  it('لا شيءَ بلا أخطاء، وصندوقٌ واحد برابطٍ لكلّ حقل', () => {
    expect(errorSummary([])).toBe('')
    const out = errorSummary([
      { href: '#vyt-1', text: 'عنوان YouTube أطول من الحدّ.' },
      { href: '#vtt-1', text: 'نصّ TikTok أطول من الحدّ.' },
    ])
    expect(out).toContain('role="alert"')
    expect(out).toContain('tabindex="-1"')
    expect(out).toContain('id="err-sum"')
    expect(out).toContain('<a href="#vyt-1">عنوان YouTube أطول من الحدّ.</a>')
    expect((out.match(/<li>/g) ?? []).length).toBe(2)
    expect(out).toContain('هناك ما يُصلَح قبل الإرسال')
  })

  it('والنصُّ يُهرَّب', () => {
    expect(errorSummary([{ href: '#x', text: '<b>' }])).toContain('&lt;b&gt;')
  })
})

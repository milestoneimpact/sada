/**
 * النطاقات — ما يُطلَب، وما مُنح، وما يُمنَع بناءً عليه (D-045).
 *
 * ومعظمُ ما هنا **قواعدُ لا تعدادٌ لأسماء**: اختبارٌ يكتب
 * `['openid','profile','w_member_social']` يفشل حين يُضاف نطاقٌ رابع
 * صحيح، فيُصلَّح بنسخِ القائمة الجديدة — وهو تصحيحٌ لا يثبت شيئا.
 */
import { describe, expect, it } from 'vitest'
import {
  SCOPES, canPublish, canUploadMedia, capabilities, missingScopes,
  parseGranted, scopeSet,
} from './scopes'
import { PROVIDERS, type Platform } from './providers'

const PLATFORMS: Platform[] = ['linkedin', 'x']

describe('السجلّ — كلُّ نطاقٍ يحمل مصدرَه', () => {
  it.each(PLATFORMS)('%s: لا نطاقَ بلا شرحٍ ومصدرٍ وموضع', (platform) => {
    for (const spec of SCOPES[platform]) {
      // شرحٌ فارغ يجعل الجدولَ في الشاشة صفّا أبيض — وهو أسوأ من غيابه
      expect(spec.enables.length).toBeGreaterThan(3)
      expect(spec.grantedBy.length).toBeGreaterThan(3)
      expect(spec.where.length).toBeGreaterThan(3)
    }
  })

  it.each(PLATFORMS)('%s: لا اسمَ نطاقٍ مكرَّر', (platform) => {
    const names = SCOPES[platform].map((s) => s.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it.each(PLATFORMS)('%s: لكلٍّ نطاقُ نشرٍ واحدٌ على الأقلّ', (platform) => {
    // منصّةٌ بلا نطاق نشرٍ مسجَّل تجعل `canPublish` تعيد true دائما،
    // فيسقط الحارسُ كلُّه صامتا — وهي أخطرُ صورةٍ للعطل
    expect(SCOPES[platform].filter((s) => s.need === 'publish').length).toBeGreaterThan(0)
  })
})

describe('مصدرٌ واحد للنطاقات — لا نسختان تفترقان', () => {
  it.each(PLATFORMS)('%s: نطاقاتُ المزوّد هي نطاقاتُ السجلّ نفسها', (platform) => {
    expect([...PROVIDERS[platform].scopes]).toEqual([...scopeSet(platform)])
  })
})

describe('المجموعتان', () => {
  it.each(PLATFORMS)('%s: الهويّةُ جزءٌ من الكاملة لا مجموعةٌ أخرى', (platform) => {
    const full = new Set(scopeSet(platform, 'full'))
    for (const name of scopeSet(platform, 'identity')) expect(full.has(name)).toBe(true)
  })

  it.each(PLATFORMS)('%s: الهويّةُ أضيقُ من الكاملة — وإلّا فلا مخرجَ فيها', (platform) => {
    expect(scopeSet(platform, 'identity').length).toBeLessThan(scopeSet(platform, 'full').length)
  })

  it.each(PLATFORMS)('%s: ولا نطاقَ نشرٍ في مجموعة الهويّة', (platform) => {
    const identity = new Set(scopeSet(platform, 'identity'))
    for (const spec of SCOPES[platform]) {
      if (spec.need === 'publish') expect(identity.has(spec.name)).toBe(false)
    }
  })
})

describe('قراءةُ الممنوح', () => {
  it('يفصل بالمسافة وبالفاصلة معا — والمنصّاتُ تختلف', () => {
    expect(parseGranted('openid profile')).toEqual(['openid', 'profile'])
    expect(parseGranted('tweet.read,tweet.write')).toEqual(['tweet.read', 'tweet.write'])
    expect(parseGranted('a,  b   c')).toEqual(['a', 'b', 'c'])
  })

  it('وفراغٌ يعني لا شيء لا مصفوفةً فيها فراغ', () => {
    expect(parseGranted('')).toEqual([])
    expect(parseGranted('   ')).toEqual([])
  })
})

describe('الحارس — يقرأ ما مُنح لا ما طُلب', () => {
  it.each(PLATFORMS)('%s: الكاملةُ تنشر', (platform) => {
    expect(canPublish(platform, scopeSet(platform).join(' '))).toBe(true)
  })

  it.each(PLATFORMS)('%s: والهويّةُ وحدها لا تنشر', (platform) => {
    expect(canPublish(platform, scopeSet(platform, 'identity').join(' '))).toBe(false)
  })

  it.each(PLATFORMS)('%s: ونقصُ نطاقِ نشرٍ واحدٍ يمنع — لا يُتساهَل', (platform) => {
    const publish = SCOPES[platform].filter((s) => s.need === 'publish')
    for (const dropped of publish) {
      const rest = scopeSet(platform).filter((n) => n !== dropped.name)
      expect(canPublish(platform, rest.join(' '))).toBe(false)
    }
  })

  it('ولا شيء ممنوحا يعني لا نشر', () => {
    for (const platform of PLATFORMS) expect(canPublish(platform, '')).toBe(false)
  })

  it('رفعُ الوسيط عند X نطاقٌ ثانٍ — والنصُّ لا يُمنَع لنقصه', () => {
    const withoutMedia = scopeSet('x').filter((n) => n !== 'media.write')
    expect(canPublish('x', withoutMedia.join(' '))).toBe(true)
    expect(canUploadMedia('x', withoutMedia.join(' '))).toBe(false)
  })

  it('وعند LinkedIn الرفعُ بنطاق النشر نفسه', () => {
    expect(canUploadMedia('linkedin', scopeSet('linkedin').join(' '))).toBe(true)
    expect(canUploadMedia('linkedin', 'openid profile')).toBe(false)
  })
})

describe('ما نقص — يُسمّى ويُقال أين يُفتَح', () => {
  it('يعيد الشرحَ والمصدرَ لا الاسمَ وحده', () => {
    const missing = missingScopes('linkedin', 'openid profile')
    expect(missing.map((s) => s.name)).toEqual(['w_member_social'])
    // العلّةُ التي وُلد منها D-045: «فشل» بلا اسمِ المنتَج الذي يفتحه
    expect(missing[0]!.grantedBy).toBe('Share on LinkedIn')
  })

  it('ولا شيءَ ناقصا حين مُنح كلُّ ما طُلب', () => {
    expect(missingScopes('x', scopeSet('x').join(' '))).toEqual([])
  })
})

describe('القدرات — والممنوحُ الزائد لا يُخفى', () => {
  it('صفٌّ لكلّ نطاقٍ معروف، بحالِه', () => {
    const rows = capabilities('linkedin', 'openid profile')
    expect(rows.filter((r) => r.granted).map((r) => r.spec.name)).toEqual(['openid', 'profile'])
    expect(rows.filter((r) => !r.granted).map((r) => r.spec.name)).toEqual(['w_member_social'])
  })

  it('ونطاقٌ منحته المنصّةُ ولم نطلبه يُعرَض — إخفاؤه يجعل الشاشةَ تكذب', () => {
    const rows = capabilities('linkedin', 'openid profile email')
    const extra = rows.find((r) => r.spec.name === 'email')
    expect(extra).toBeDefined()
    expect(extra!.granted).toBe(true)
  })
})

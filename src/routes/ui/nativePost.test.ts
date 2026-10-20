/** المعاينةُ الأصليّة — **بنيةُ المنصّة، ولا رقمٌ ولا اسمٌ مخترَع** (D-172). */
import { describe, expect, it } from 'vitest'
import { nativePost, npText, type NativePostInput } from './nativePost'

const base: NativePostInput = {
  platform: 'linkedin', id: 'p1', author: { name: 'عمر', kind: 'member' }, text: 'نصّ #وسم',
  when: '2 ي', media: null, poster: null, metrics: null, variant: 'compact',
}

describe('nativePost', () => {
  it('لكلّ منصّة صنفُها', () => {
    for (const [p, cls] of [['linkedin', 'np-li'], ['x', 'np-x'], ['instagram', 'np-ig'], ['tiktok', 'np-tt'], ['youtube', 'np-yt']] as const) {
      expect(nativePost({ ...base, platform: p })).toContain(`np ${cls} np-compact`)
    }
  })

  it('النصّ مهرَّب، والوسوم تُلفّ بعد التهريب', () => {
    expect(npText('<b>x</b> #قيادة')).toBe('&lt;b&gt;x&lt;/b&gt; <span class="np-tag">#قيادة</span>')
  })

  it('بلا قياس لا رقم، و`null` لا يُرسم صفرا', () => {
    expect(nativePost({ ...base, platform: 'x' })).not.toMatch(/<b>\d/)
    const html = nativePost({ ...base, platform: 'x', metrics: { impressions: null, reactions: 1204, comments: 0, shares: null } })
    expect(html).toContain('<b>1,204</b>')
    expect(html).toContain('<b>0</b>')
    expect((html.match(/<b>/g) ?? []).length).toBe(2)
  })

  it('ولا اسم مستخدم مخترَع: الاسم المحفوظ كما هو', () => {
    expect(nativePost({ ...base, platform: 'tiktok' })).not.toContain('@عمر')
    expect(nativePost(base)).not.toContain('@—')
  })

  it('ومقطع ناقص لمنصّة مقاطع يُقال في الإطار', () => {
    expect(nativePost({ ...base, platform: 'tiktok' })).toContain('لا يُنشر بلا مقطع')
    expect(nativePost({ ...base, platform: 'instagram' })).toContain('Instagram لا تنشر بلا صورة')
  })

  it('وعنوان YouTube سطرُه الأوّل، والوصف مطويّ تحته', () => {
    const html = nativePost({ ...base, platform: 'youtube', text: 'العنوان\n\nالوصف' })
    expect(html).toContain('<p class="np-title">العنوان</p>')
    expect(html).toContain('<details class="np-desc">')
  })
})

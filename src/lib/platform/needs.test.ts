/** ما تطلبه كلُّ منصّة — **من الثوابت لا نسخةٌ منها** (D-172). */
import { describe, expect, it } from 'vitest'
import { CLIP_PLATFORMS, platformNeeds } from './needs'
import { PLATFORMS } from '../draft/prompt'
import { SLIDE_SIZE } from '../image/slide'
import { MEASURED } from '../metrics/job'

describe('الجدولُ من مصادره', () => {
  it('حدُّ النصّ ومقاسُ الوسيط والقياسُ يطابقون الثوابت', () => {
    for (const p of ['linkedin', 'x', 'tiktok', 'youtube'] as const) {
      const n = platformNeeds(p)
      expect(n.limit).toBe(PLATFORMS[p].hardLimit)
      expect(n.media.width).toBe(SLIDE_SIZE[p].width)
      expect(n.media.height).toBe(SLIDE_SIZE[p].height)
      expect(n.media.kind === 'clip').toBe(CLIP_PLATFORMS.has(p))
      expect(n.media.required).toBe(CLIP_PLATFORMS.has(p))
      expect(n.measured).toBe(MEASURED.has(p))
    }
  })

  it('وInstagram تطلب صورةً ولا تُكتب لها مسوّدةٌ بعد', () => {
    const n = platformNeeds('instagram')
    expect(n.media.required).toBe(true)
    expect(n.drafts).toBe(false)
  })

  it('وX تقول رسمَها قبل الاعتماد، وTikTok أين يصل منشورُها', () => {
    expect(platformNeeds('x').cost).toContain('إن كان فيه رابط')
    expect(platformNeeds('tiktok').publish).toContain('صندوقَ تطبيقك')
    expect(platformNeeds('linkedin').cost).toBe('بلا رسم')
  })

  it('وبعد أن يقلب المالكُ العلنيَّ لا تبقى «تنشره بيدك» (D-190)', () => {
    expect(platformNeeds('youtube').publish).toContain('خاصًّا')
    expect(platformNeeds('youtube', true).publish).toContain('علنيٌّ فورَ موعده')
    expect(platformNeeds('tiktok', true).publish).toContain('علنيٌّ فورَ موعده')
    // ‏ولا يمسّ ما ليس مقطعًا: LinkedIn علنيٌّ كما كان
    expect(platformNeeds('linkedin', true).publish).toBe('علنيٌّ فورَ موعده')
  })
})

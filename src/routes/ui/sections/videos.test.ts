/** صفُّ المقطع بعد «أنشئ المنشورات» (ر-4): طريقٌ إلى كلّ منشور، ولا مرساةَ بلا بطاقة. */
import { describe, expect, it } from 'vitest'
import type { UploadRow } from '../../../lib/media/uploads'
import { videosSection } from './videos'

const NOW = new Date('2026-10-04T08:00:00Z')
const UP: UploadRow = {
  id: 'u1', r2Key: 'upload/u1.mp4', name: 'قيادة.mp4', mime: 'video/mp4', bytes: 12_000_000,
  width: 1080, height: 1920, durationMs: 42_000, status: 'ready', createdAt: '2026-10-04 07:00:00',
  posts: [
    { id: 'p-yt', platform: 'youtube', status: 'approved' },
    { id: 'p-tt', platform: 'tiktok', status: 'queued' },
    { id: 'p-ig', platform: 'instagram', status: 'draft' },
  ],
}

describe('صفُّ المقطع بعد الإنشاء', () => {
  it('لكلّ منشورٍ حالُه ورابطُه إلى بطاقته، و«أُنشئت كلُّها» لا «ما بقي لا يوافق»', () => {
    const html = videosSection([UP], NOW)
    for (const id of ['p-yt', 'p-tt', 'p-ig']) expect(html).toContain(`href="#d-${id}"`)
    expect(html).toContain('معتمَدٌ بلا موعد')
    expect(html).toContain('أُنشئت كلُّها')
    expect(html).not.toContain('وما بقي لا يوافق')
    // ‏والجدولةُ معًا للمعتمَد وحده: المجدولُ والمسوّدةُ لا يُرسَلان
    expect(html).toContain('جدوِل منشورَ YouTube بتوقيتك:')
    expect(html).toContain('<input type="hidden" name="post" value="p-yt">')
    expect(html).not.toContain('value="p-tt"')
  })

  it('ومنشورٌ لا بطاقةَ له في الصفحة يُذكر بحاله بلا رابطٍ يرتدّ إلى الرئيسيّة', () => {
    const html = videosSection([UP], NOW, new Set(['p-yt']))
    expect(html).toContain('href="#d-p-yt"')
    expect(html).not.toContain('href="#d-p-tt"')
    expect(html).toContain('مجدول')
  })
})

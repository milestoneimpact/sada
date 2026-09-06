/**
 * شاشةُ المنصّة: التبويباتُ والمصغَّرات.
 *
 * **وما يُفحَص هنا أنّ الفرزَ لا يُخفي** — وهو الشرطُ الذي قام عليه.
 */
import { describe, expect, it } from 'vitest'
import { platformScreen, showOf, type PostMedia } from './ui/platformView'
import { viewChannels, type LinkedAccount } from '../lib/channels'
import type { PlatformPost } from '../lib/platform/screen'

const now = new Date('2026-09-06T12:00:00Z')

const accounts: LinkedAccount[] = [
  { id: 'a1', platform: 'x', kind: 'member', displayName: '@omar', status: 'active',
    createdAt: '2026-09-01T00:00:00Z' },
]
const view = viewChannels(accounts, () => true).find((v) => v.spec.id === 'x')!

const post = (id: string, status: string): PlatformPost => ({
  id, text: `نصُّ ${id}`, status, scheduledAt: null, createdAt: '2026-09-05T00:00:00Z',
  accountName: '@omar', platformPostId: null, publishedAt: null, lastError: null,
  hasMedia: false, costUsd: 0,
})

const POSTS: PlatformPost[] = [
  post('p1', 'published'), post('p2', 'published'),
  post('p3', 'queued'), post('p4', 'failed'), post('p5', 'draft'),
]

function screen(over: Partial<Parameters<typeof platformScreen>[0]> = {}): string {
  return platformScreen({
    view, posts: POSTS, now,
    tally: { published: 2, queued: 1, failed: 1, drafts: 1, spend: 0, lastPublishedAt: null },
    scopes: {}, metrics: {}, media: {},
    ...over,
  })
}

describe('التبويباتُ تفرز ولا تُخفي', () => {
  /**
   * D-046 قال: «الفاشلةُ تُعرض مع الناجحة **فشلٌ لا يُرى لا يُعالَج**».
   * والفرزُ يخدم القاعدةَ نفسَها **بشرط أن يكون العددُ معروضا دائما**:
   * من يقف على «الكلّ» يرى «فشل ١» بلا أن يفتحه.
   */
  it('العددُ على كلّ تبويبٍ معروضٌ ولو لم يُفتَح', () => {
    const html = screen()
    expect(html).toContain('فشل<span class="count">1</span>')
    expect(html).toContain('نُشر<span class="count">2</span>')
  })

  /** وتبويبٌ افتراضيٌّ يُخفي الفشلَ هو عينُ ما حذّر منه D-046. */
  it('والافتراضُ «الكلّ» لا «نُشر»', () => {
    const html = screen()
    expect(html).toContain('نصُّ p4') // الفاشلُ ظاهرٌ بلا فرز
    expect(html).toContain('aria-current="page"')
    // والمفتوحُ هو «الكلّ»
    expect(/class="ftab on"[^>]*>الكلّ/.test(html)).toBe(true)
  })

  it('والفرزُ يعرض ما طُلب وحده', () => {
    const html = screen({ show: 'failed' })
    expect(html).toContain('نصُّ p4')
    expect(html).not.toContain('نصُّ p1')
  })

  /** ويعمل بلا سكربت: روابطُ استعلامٍ لا أزرار. */
  it('والتبويباتُ روابطُ استعلام', () => {
    const html = screen()
    expect(html).toContain('href="/panel/channels/x?show=failed"')
    expect(html).not.toMatch(/<button[^>]*class="ftab/)
  })

  it('وتبويبٌ فارغٌ لا يُعرَض — إلّا «الكلّ»', () => {
    const html = screen({ posts: [post('p1', 'published')] })
    expect(html).not.toContain('show=failed')
    expect(html).toContain('الكلّ')
  })

  it('وقيمةٌ لا نعرفها تعود إلى «الكلّ» ولا تُفرغ الشاشة', () => {
    expect(showOf('لا-شيء')).toBe('all')
    expect(showOf(undefined)).toBe('all')
    expect(showOf('failed')).toBe('failed')
  })
})

describe('والوسائطُ تُعرَض لا يُقال إنّ هناك وسيطا', () => {
  const media: Record<string, PostMedia[]> = {
    p1: [{ id: 'm1', mime: 'image/png', status: 'ready' }],
    p2: [{ id: 'm2', mime: 'video/mp4', status: 'ready' }],
    p3: [{ id: 'm3', mime: 'image/png', status: 'rejected' }],
  }

  it('الصورةُ تُرسَم من مسارٍ خلف الجلسة', () => {
    const html = screen({ media })
    expect(html).toContain('src="/panel/media/m1"')
    expect(html).toContain('alt="صورةٌ مولَّدة')
  })

  /** والفيديو `<video>` لا `<img>` — **ولا تشغيلَ آليّ**. */
  it('والمقطعُ يُرسَم video بلا تشغيلٍ آليّ', () => {
    const html = screen({ media })
    expect(html).toContain('<video src="/panel/media/m2"')
    expect(html).not.toContain('autoplay')
    expect(html).toContain('muted')
  })

  /** كلفتُها دُفعت، وإخفاؤها يجعل سطرا في الدفتر بلا ما يقابله. */
  it('والمرفوضةُ تُعرَض مُعلَّمةً لا تُخفى', () => {
    const html = screen({ media })
    expect(html).toContain('src="/panel/media/m3"')
    expect(html).toContain('مرفوضة')
  })

  /** وصفٌّ يقول إنّ له وسيطا ولا وسيطَ يُقرأ: يُقال ولا يُخفى. */
  it('ووسيطٌ مفقودٌ يُقال', () => {
    const orphan = [{ ...post('p9', 'published'), hasMedia: true }]
    expect(screen({ posts: orphan, media: {} })).toContain('وسيطٌ لا يُقرأ')
  })

  it('ولا مصغَّرَ حيث لا وسيط', () => {
    expect(screen({ media: {} })).not.toContain('class="thumbs"')
  })
})

import { describe, expect, it } from 'vitest'
import { imagesGallery } from './library'
import type { MediaView } from './drafts'

const img = (over: Partial<MediaView>): MediaView => ({
  id: 'm1', postId: 'p1', mime: 'image/png', bytes: 10, prompt: 'و', cost: 0, status: 'ready',
  note: null, headline: null, ...over,
} as MediaView)

describe('«المكتبة ← الصور» (D-206)', () => {
  it('الصورة رابط إلى بطاقة مسوّدتها، وتحتها منصّتُها وسطر من نصّها', () => {
    const html = imagesGallery([img({})], [{ id: 'p1', platform: 'linkedin', text: 'نصّ  المسوّدة\nالأولى' }])
    expect(html).toContain('<a class="lib-img" href="#d-p1">')
    expect(html).toContain('src="/panel/media/m1"')
    expect(html).toContain('<b>LinkedIn</b> · نصّ المسوّدة الأولى')
    expect(html).toContain('alt="صورة منشور LinkedIn"')
  })

  it('ومسوّدة خرجت من القائمة تُقال، ولا يسقط السطر', () => {
    expect(imagesGallery([img({ postId: 'gone' })], [])).toContain('مسوّدة لم تعد في القائمة')
  })

  it('ولا صورة: حال فارغة تقول أين تُولَّد وأنّها مدفوعة', () => {
    const html = imagesGallery([], [])
    expect(html).toContain('لا صورة بعد')
    expect(html).toContain('نداء مدفوع')
  })

  it('والنصّ مهرَّب', () => {
    const html = imagesGallery([img({})], [{ id: 'p1', platform: 'x', text: '<script>' }])
    expect(html).not.toContain('<script>')
  })
})

describe('النماذج التي تُرسَل بلا تحميل (D-207)', () => {
  it('«اعتمد» على البطاقة و«ارفض» في قائمتها يحملان data-swap، والنموذج يبقى POST عاديًّا بلا سكربت', async () => {
    const { menuAction } = await import('../components/menu')
    const html = menuAction({ label: 'ارفض', action: '/panel/drafts/decide', fields: { id: 'p1', do: 'reject' }, swap: true })
    expect(html).toContain('method="POST" action="/panel/drafts/decide"')
    expect(html).toContain(' data-swap>')
    expect(menuAction({ label: 'س', action: '/x', fields: {} })).not.toContain('data-swap')
  })
})

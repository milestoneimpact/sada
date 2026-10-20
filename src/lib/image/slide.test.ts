/**
 * الشريحة — **النصُّ العربيُّ فوق الصورة لا فيها** (D-085).
 *
 * ولا نموذجَ توليدٍ يكتب عربيّةً صحيحةَ الوصل. **والوصلُ عملُ مُشكِّلِ
 * خطوطٍ لا عملُ مولّد صور** — ومتصفّحٌ يحمله.
 */
import { describe, expect, it } from 'vitest'
import { FONT_FACE_CSS, SLIDE_FONT } from './font'
import { clip, escapeHtml, HEADLINE_MAX, KICKER_MAX, SLIDE_SIZE, slideHtml } from './slide'

const INPUT = {
  imageBase64: 'AAAA',
  imageMime: 'image/jpeg',
  headline: 'الحوكمة تسبق السرعة',
  kicker: 'Governance First',
  platform: 'linkedin' as const,
}

describe('لا مورد خارجيّ — والسبب ليس السرعة', () => {
  it('الخطّ مضمَّن `data:` لا مطلوب من شبكة', () => {
    const html = slideHtml(INPUT)
    expect(html).toContain('data:font/woff2;base64,')
    expect(html).toContain(SLIDE_FONT)
  })

  it('والصورة مضمَّنة كذلك', () => {
    expect(slideHtml(INPUT)).toContain('src="data:image/jpeg;base64,AAAA"')
  })

  it('و**لا رابط خارجيّ ولا سكربت** — نقطة فشل ثالثة وتسريب أنّ صورةً تُبنى', () => {
    const html = slideHtml(INPUT)
    expect(html).not.toMatch(/<script/i)
    expect(html).not.toMatch(/https?:\/\//)
  })

  it('و`font-display: block` — لا تُصوَّر بخطّ بديل ثمّ يصل الصحيح', () => {
    expect(FONT_FACE_CSS).toContain('font-display:block')
  })
})

describe('الاتّجاه والمقاس — والعربيّة لا تُرسَم يسارا', () => {
  it('الصفحة عربيّة من اليمين', () => {
    const html = slideHtml(INPUT)
    expect(html).toContain('lang="ar"')
    expect(html).toContain('dir="rtl"')
  })

  it('ولكلّ منصّة مقاسُها المعلوم', () => {
    expect(slideHtml(INPUT)).toContain(`width:${SLIDE_SIZE.linkedin.width}px`)
    expect(slideHtml({ ...INPUT, platform: 'x' })).toContain(`height:${SLIDE_SIZE.x.height}px`)
  })

  it('و**الصورة تُقصّ ولا تُمطّ** — `cover` لا `fill`', () => {
    expect(slideHtml(INPUT)).toContain('object-fit:cover')
  })

  it('والفوقيّة اللاتينيّة تُعزَل فتحاذي العنوان على الحافّة نفسِها', () => {
    expect(slideHtml(INPUT)).toContain('unicode-bidi:isolate')
  })
})

describe('القصّ — عندنا لا في الشاشة', () => {
  it('يقصّ عند فراغ لا في نصف كلمة', () => {
    expect(clip('واحد اثنان ثلاثة', 11)).toBe('واحد اثنان')
    // والناتجُ بادئةٌ من الأصل تنتهي عند حدّ كلمة — لا حرفٌ مبتور
    const long = 'كلمة أولى وثانية وثالثة ورابعة'
    const cut = clip(long, 20)
    expect(long.startsWith(cut)).toBe(true)
    expect(long[cut.length]).toBe(' ')
  })

  it('وكلمة واحدة أطول من الحدّ تُبتَر — ولا بديل عن ذلك', () => {
    expect(clip('ن'.repeat(30), 10)).toHaveLength(10)
  })

  it('ويترك القصير كما هو، ويوحّد الفراغ', () => {
    expect(clip('  أثر   يُقاس  ', 40)).toBe('أثر يُقاس')
  })

  it('والعنوان الطويل يُقصّ في المخرَج', () => {
    const html = slideHtml({ ...INPUT, headline: 'ن'.repeat(HEADLINE_MAX + 30) })
    expect(html).not.toContain('ن'.repeat(HEADLINE_MAX + 1))
  })

  it('والفوقيّة كذلك — ويُقاس ما في كتلتها لا ما في الصفحة كلِّها', () => {
    const html = slideHtml({ ...INPUT, kicker: 'Q'.repeat(KICKER_MAX + 10) })
    const block = /<div class="k">([^<]*)<\/div>/.exec(html)?.[1] ?? ''
    expect(block.length).toBe(KICKER_MAX)
  })

  it('و**فوقيّة فارغة تُحذَف كتلتُها** — لا فراغ يُترك مكانها', () => {
    expect(slideHtml({ ...INPUT, kicker: '' })).not.toContain('class="k"')
  })
})

describe('الحقن يُهرَّب — ونصّ المنشور يأتي من نموذج', () => {
  it('وسم في العنوان يُهرَّب ولا يُنفَّذ', () => {
    const html = slideHtml({ ...INPUT, headline: '<img onerror=x>' })
    expect(html).not.toContain('<img onerror')
    expect(html).toContain('&lt;img')
  })

  it('واقتباس في نوع الصورة لا يكسر الوسم', () => {
    expect(escapeHtml('a"b')).toBe('a&quot;b')
  })
})

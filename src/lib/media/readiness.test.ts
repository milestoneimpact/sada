/**
 * نقاطُ الجاهزيّة (D-163) — **النقطةُ تقول ما ستقوله الدالّةُ بعد الضغط**.
 *
 * وما يُثبَت هنا ثلاثة: أنّ ترتيبَ النقاط ترتيبُ النداء، وأنّ ما يمنع النداءَ
 * كلَّه وحدَه يسقط فيُعطِّل الزرّ، وأنّ كلَّ نصٍّ يُقرأ بجانب زرٍّ صغير:
 * ستُّ كلماتٍ فأقلّ، وبكلمات المعجم.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { videoCapGate, type Blocker, type VideoCapGate } from '../limits'
import { imageProviderGate, slideGate, type ImageRefusal, type SlideGate } from '../image/gate'
import { imageReadiness, routeDot, videoReadiness, type MediaLine, infographicReadiness } from './readiness'
import type { VideoFace } from './video'

const READY_SLIDE = slideGate({ overlay: true, hasBrowserKey: true, hasAccount: true })

const image = (over: {
  blocker?: Blocker | null
  refusal?: ImageRefusal | null
  slide?: SlideGate
  briefReady?: boolean
  label?: string
} = {}): MediaLine =>
  imageReadiness({
    blocker: over.blocker ?? null,
    provider: { label: over.label ?? 'Gemini', refusal: over.refusal ?? null },
    slide: over.slide ?? READY_SLIDE,
    briefReady: over.briefReady ?? true,
  })

describe('سطرُ «ولّد صورة» — بترتيب generateForPost', () => {
  it('كلُّها تامّة: ثلاثُ نقاطٍ بترتيبها، ولا سبب، ولا تعطيل', () => {
    const line = image()
    expect(line.dots.map((d) => d.key)).toEqual(['limits', 'provider', 'overlay'])
    expect(line.dots.every((d) => d.state === 'done')).toBe(true)
    expect(line.next).toBeNull()
    expect(line.blocked).toBe(false)
    expect(line.dots[1]!.note).toBe('Gemini')
  })

  it('موقوفٌ: الحدودُ أوّلُ ساقطة، ورابطُها إلى الحدود، وهي `next` نفسُها', () => {
    const line = image({ blocker: { kind: 'paused' } })
    expect(line.dots[0]).toMatchObject({
      key: 'limits', state: 'failed', note: 'موقوفٌ بقرارك',
      action: { label: 'افتح الحدود', href: '#settings' },
    })
    expect(line.next).toBe(line.dots[0])
    expect(line.blocked).toBe(true)
  })

  it('وسقفُ التحليل يحجب الصورة كما يحجبها checkAllowance — ويُقال كما هو', () => {
    const line = image({ blocker: { kind: 'analysis_cap', used: 10, cap: 10 } })
    expect(line.next?.note).toBe('بلغ سقفَ التحليل اليوميّ')
    expect(image({ blocker: { kind: 'spend_cap', used: 5, cap: 5 } }).next?.note)
      .toBe('بلغ سقفَ الإنفاق اليوميّ')
  })

  it('والحدودُ تسبق المزوّد: موقوفٌ ومزوّدٌ بلا مفتاح يُقال الإيقاف', () => {
    const line = image({ blocker: { kind: 'paused' }, refusal: { kind: 'no_key' } })
    expect(line.next?.key).toBe('limits')
  })

  it('ولكلّ سببٍ في بوّابة المزوّد نصُّه، ورابطُه إلى المزوّدين', () => {
    const cases: [ImageRefusal, string][] = [
      [{ kind: 'missing' }, 'المزوّدُ الموجَّهُ غيرُ موجود'],
      [{ kind: 'cannot_image' }, 'Gemini لا يولّد صورًا'],
      [{ kind: 'blocked', blocker: { kind: 'provider_disabled', provider: 'gemini' } }, 'Gemini معطَّلٌ بقرارك'],
      [{ kind: 'blocked', blocker: { kind: 'provider_cap', provider: 'gemini', used: 2, cap: 2 } }, 'بلغ Gemini سقفَه اليوميّ'],
      [{ kind: 'no_key' }, 'لا مفتاحَ لـ Gemini'],
      [{ kind: 'no_account' }, 'لا معرّفَ حسابٍ لـ Cloudflare'],
    ]
    for (const [refusal, note] of cases) {
      const line = image({ refusal })
      expect(line.next).toMatchObject({
        key: 'provider', state: 'failed', note,
        action: { label: 'افتح المزوّدين', href: '#providers' },
      })
      expect(line.blocked).toBe(true)
    }
  })

  it('والتركيبُ المطفأ لا نقطةَ له — الإطفاءُ قرارٌ لا عطل', () => {
    const line = image({ slide: slideGate({ overlay: false, hasBrowserKey: false, hasAccount: false }) })
    expect(line.dots.map((d) => d.key)).toEqual(['limits', 'provider'])
    expect(line.next).toBeNull()
  })

  it('وما ينقص الشريحةَ ينتظرك ولا يسقط — فلا يُعطِّل زرًّا يعمل', () => {
    const noKey = image({ slide: slideGate({ overlay: true, hasBrowserKey: false, hasAccount: false }) })
    expect(noKey.next).toMatchObject({
      key: 'overlay', state: 'now', note: 'بلا مفتاح المتصفّح',
      action: { label: 'ما عليك', href: '/panel/tasks' },
    })
    expect(noKey.blocked).toBe(false)

    const noAccount = image({ slide: slideGate({ overlay: true, hasBrowserKey: true, hasAccount: false }) })
    expect(noAccount.next).toMatchObject({ state: 'now', note: 'بلا معرّف حساب Cloudflare', action: { href: '/panel/tasks' } })
  })

  it('والموجزُ بعد البيئة: المفتاحان حاضران وبلا مزوّدٍ يكتب — «لا مزوّدَ يصوغ العنوان»', () => {
    const line = image({ briefReady: false })
    expect(line.next).toMatchObject({ key: 'overlay', state: 'now', note: 'لا مزوّدَ يصوغ العنوان', action: { href: '#providers' } })
    // ومن لم يضبط المفتاحَ بعدُ يُقال له المفتاحُ لا الموجز
    const both = image({ briefReady: false, slide: slideGate({ overlay: true, hasBrowserKey: false, hasAccount: true }) })
    expect(both.next?.note).toBe('بلا مفتاح المتصفّح')
  })

  it('والساقطةُ تسبق ما ينتظرك في `next` ولو جاءت بعده', () => {
    const line = image({ refusal: { kind: 'no_key' }, briefReady: false })
    expect(line.next?.key).toBe('provider')
  })
})

/** مقطعٌ اليومَ من اثنين — تحت السقف، فالنقطةُ تامّة. */
const UNDER_CAP = videoCapGate(1, 2)

describe('سطرُ «حرّكها فيديو» — بترتيب animateForPost', () => {
  const video = (face: VideoFace, blocker: Blocker | null = null, clips: VideoCapGate = UNDER_CAP): MediaLine =>
    videoReadiness({ face, blocker, clips })

  it('المفتاحُ ثمّ الحدودُ ثمّ المقاطع — ولا نقطةَ للسعر: تنتظر أبدًا ولا يُطفئها المالك', () => {
    expect(video('env').dots.map((d) => d.key)).toEqual(['key', 'limits', 'clips'])
  })

  /*
   * **والمقاطعُ بعددها** (D-168): السعرُ صفرٌ موسومٌ لا يبلغ سقفَ مال، فالعددُ
   * هو الحدّ — وحكمُه من `videoCapGate` التي تحكم بها `animateForPost`.
   */
  it('تحت السقف: «المقاطع» تامّةٌ وتقول كم بقي — والزرُّ يعمل', () => {
    const line = video('env')
    expect(line.dots[2]).toMatchObject({ key: 'clips', title: 'المقاطع', state: 'done', note: 'بقي 1 من 2 اليوم' })
    expect(line.blocked).toBe(false)
    expect(line.next).toBeNull()
  })

  it('وعند البلوغ تسقط ورابطُها إلى الحدود — والزرُّ معطَّل', () => {
    const line = video('env', null, videoCapGate(2, 2))
    expect(line.next).toMatchObject({
      key: 'clips', state: 'failed', note: 'بلغ سقفَ المقاطع اليوميّ',
      action: { label: 'افتح الحدود', href: '#settings' },
    })
    expect(line.blocked).toBe(true)
    // وصفرٌ قرارٌ لا بلوغ
    expect(video('env', null, videoCapGate(0, 0)).next?.note).toBe('سقفُ المقاطع صفرٌ بقرارك')
  })

  it('وترتيبُها ترتيبُ الدالّة: بلا وجهٍ يُقال الوجه، وموقوفٌ يُقال الإيقاف', () => {
    const full = videoCapGate(2, 2)
    expect(video('none', null, full).next?.key).toBe('key')
    expect(video('env', { kind: 'paused' }, full).next?.key).toBe('limits')
  })

  it('البيئةُ والبطاقةُ تامّتان، والرابطُ ينتظرك، ولا وجهَ يسقط', () => {
    expect(video('env').dots[0]).toMatchObject({ state: 'done', note: 'من أسرار Worker' })
    expect(video('card').dots[0]).toMatchObject({ state: 'done', note: 'من بطاقة Cloudflare' })
    expect(video('binding')).toMatchObject({ blocked: false, next: { state: 'now', note: 'برابط Worker وحده' } })
    expect(video('none')).toMatchObject({
      blocked: true,
      next: { state: 'failed', note: 'لا مفتاحَ لـ Workers AI', action: { href: '#providers' } },
    })
  })

  it('والوجهُ يسبق الحدود كما في الدالّة: بلا وجهٍ وموقوفٌ يُقال الوجه', () => {
    expect(video('none', { kind: 'paused' }).next?.key).toBe('key')
    expect(video('env', { kind: 'paused' }).next).toMatchObject({ key: 'limits', note: 'موقوفٌ بقرارك' })
  })
})

describe('النصُّ يُقرأ بجانب زرٍّ صغير — وبكلمات المعجم', () => {
  /**
   * **والأنماطُ من مصدرها لا من نسخة**: `measure_text` تحرس المعجمَ في
   * `npm run text` وحده، وليس في `ci`. فتُقرأ قائمتُها هنا ويُحرَس بها كلُّ
   * نصٍّ تُنتجه هذه الوحدة — ونمطٌ يُضاف هناك يُحرَس هنا بلا نسخ.
   */
  const source = readFileSync(new URL('../../../scripts/measure_text.mjs', import.meta.url), 'utf8')
  const block = source.slice(source.indexOf('const BANNED = ['), source.indexOf(']\n', source.indexOf('const BANNED = [')))
  const banned = [...block.matchAll(/\[\/(.+?)\/, '/g)].map((m) => new RegExp(m[1]!))

  const refusals: (ImageRefusal | null)[] = [
    null, { kind: 'missing' }, { kind: 'cannot_image' }, { kind: 'no_key' }, { kind: 'no_account' },
    { kind: 'blocked', blocker: { kind: 'provider_disabled', provider: 'workers' } },
    { kind: 'blocked', blocker: { kind: 'provider_cap', provider: 'workers', used: 1, cap: 1 } },
  ]
  const blockers: (Blocker | null)[] = [
    null, { kind: 'paused' }, { kind: 'analysis_cap', used: 1, cap: 1 }, { kind: 'spend_cap', used: 1, cap: 1 },
    { kind: 'provider_cap', provider: 'x', used: 1, cap: 1 }, { kind: 'provider_disabled', provider: 'x' },
    { kind: 'video_cap', used: 2, cap: 2 },
  ]
  // ‏وأطولُ ما تقوله «المقاطع»: عشرون من عشرين، وصفرٌ، وبلوغ
  const caps = [videoCapGate(0, 20), videoCapGate(0, 0), videoCapGate(2, 2)]
  const slides = [
    slideGate({ overlay: true, hasBrowserKey: false, hasAccount: false }),
    slideGate({ overlay: true, hasBrowserKey: true, hasAccount: false }),
    READY_SLIDE,
  ]
  // واسمُ مزوّدٍ من كلمتين — أطولُ ما يكتبه المالكُ عادةً
  const lines: MediaLine[] = [
    ...refusals.flatMap((refusal) => blockers.flatMap((blocker) => slides.flatMap((slide) =>
      [true, false].map((briefReady) => image({ refusal, blocker, slide, briefReady, label: 'Workers AI' }))))),
    ...(['env', 'card', 'binding', 'none'] as const).flatMap((face) =>
      blockers.flatMap((blocker) => caps.map((clips) => videoReadiness({ face, blocker, clips })))),
  ]
  const texts = [...new Set(lines.flatMap((l) => l.dots.flatMap((d) => [d.title, d.note, d.action?.label ?? ''])))]
    .filter((t) => t !== '')

  it('القائمةُ قُرئت من مصدرها — لا حارسَ فارغ', () => {
    expect(banned.length).toBeGreaterThanOrEqual(5)
    expect(banned.some((re) => re.test('رمز المتصفّح'))).toBe(true)
    expect(texts.length).toBeGreaterThan(15)
  })

  it('ستُّ كلماتٍ فأقلّ — دون عتبة التكرار في measure_text', () => {
    for (const t of texts) expect(t.split(/\s+/).length, t).toBeLessThanOrEqual(6)
  })

  it('ولا رقمَ قرار، ولا «رمز» لمفتاح، ولا «الوجهة»', () => {
    for (const t of texts) for (const re of banned) expect(re.test(t), `${t} ← ${re}`).toBe(false)
  })

  it('وما يسقط وحده يُعطِّل: لا تسقط «النصُّ فوقها» في أيّ حال', () => {
    for (const l of lines) {
      expect(l.dots.filter((d) => d.key === 'overlay').every((d) => d.state !== 'failed')).toBe(true)
      expect(l.blocked).toBe(l.dots.some((d) => d.state === 'failed'))
    }
  })
})

describe('وحكمُ المزوّد من البوّابة لا من نسخة', () => {
  it('ما تحكم به imageProviderGate هو ما تقوله النقطة', () => {
    const refusal = imageProviderGate({
      name: 'gemini', exists: true, hasKey: true, hasAccount: false,
      blocker: { kind: 'provider_disabled', provider: 'gemini' },
    })
    expect(image({ refusal }).next?.note).toBe('Gemini معطَّلٌ بقرارك')
  })
})

/**
 * **وجدولُ التوجيه يقرأ النقطةَ ولا يعيد حكمَها**: كان يقول «جاهز» لرابط Worker
 * وحده بشرطٍ من عنده، والنقطةُ تحت الزرّ «تنتظرك».
 */
describe('نقطةُ المهمّة في جدول التوجيه — نقطةُ مزوّدها لا نقطةُ الحدود', () => {
  const ready = (face: VideoFace, refusal: ImageRefusal | null = null) => ({
    infographic: infographicReadiness({ blocker: { kind: 'paused' }, browser: { key: true, account: true }, briefReady: true }),
    // موقوفٌ عمدًا: الجدولُ يحكم على المزوّد، والإيقافُ حالُ النظام لا حالُ مهمّة
    image: image({ blocker: { kind: 'paused' }, refusal }),
    video: videoReadiness({ face, blocker: { kind: 'paused' }, clips: videoCapGate(2, 2) }),
  })

  it('الصورةُ من نقطة مزوّدها، والمقطعُ من نقطة مفتاحه — والإيقافُ وسقفُ المقاطع لا يُسقطانهما', () => {
    expect(routeDot(ready('env'), 'image')).toMatchObject({ key: 'provider', state: 'done' })
    expect(routeDot(ready('env'), 'video')).toMatchObject({ key: 'key', state: 'done', note: 'من أسرار Worker' })
    expect(routeDot(ready('none', { kind: 'no_key' }), 'image')).toMatchObject({ key: 'provider', state: 'failed' })
  })

  it('ورابطُ Worker وحده ينتظرك في الجدول كما ينتظرك تحت الزرّ', () => {
    expect(routeDot(ready('binding'), 'video')).toMatchObject({ state: 'now', note: 'برابط Worker وحده' })
  })

  it('وما عداهما لا نقطةَ له — فيبقى حكمُه من بطاقة مزوّده', () => {
    for (const task of ['analyze', 'draft', 'plan']) expect(routeDot(ready('env'), task)).toBeUndefined()
  })
})

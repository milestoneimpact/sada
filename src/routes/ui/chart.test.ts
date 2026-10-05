/**
 * طبقةُ الرسم (D-103) — **وما يُختبَر هو ما يُقرأ لا ما يُرسَم.**
 *
 * الرسمُ مسارات `SVG`، ومقارنةُ نصِّها بنصٍّ محفوظ اختبارٌ ينكسر مع كلّ
 * تعديلِ بكسل **ولا يقول شيئا عن صحّته**.
 *
 * فيُختبَر ما يعتمد عليه القارئ: **الترتيبُ**، و**النسبة**، و**وصفُ قارئ
 * الشاشة**، و**ألوانُ الحالة المحجوزة**.
 */
import { describe, expect, it } from 'vitest'
import { areaChart, barChart } from './chart'

describe('الأعمدة — والسؤالُ «أيُّها أكبر»', () => {
  const rows = [
    { label: 'أنثروبيك', value: 0.42 },
    { label: 'جيميناي', value: 1.35 },
    { label: 'مِسترال', value: 0.08 },
  ]

  it('**يُرتَّب نازلا** — وجوابُ السؤال أوّلُ سطر', () => {
    const html = barChart(rows, { unit: 'money' })
    const order = [...html.matchAll(/class="bar-name">([^<]+)</g)].map((m) => m[1])
    expect(order).toEqual(['جيميناي', 'أنثروبيك', 'مِسترال'])
  })

  /**
   * **والعرضُ نسبةٌ من الأكبر لا من المجموع.**
   *
   * نسبةُ المجموع تجعل أطولَ عمودٍ قصيرا حين تكثر الصفوف — **فيُقرأ
   * الرسمُ فارغا وهو ممتلئ**.
   */
  it('والأكبرُ يملأ المقياس، وما دونه بنسبته إليه', () => {
    const html = barChart(rows, { unit: 'money' })
    const widths = [...html.matchAll(/width:([\d.]+)%/g)].map((m) => Number(m[1]))
    expect(widths[0]).toBe(100)
    // ‏٠٫٤٢ من ‏١٫٣٥ = ‏٣١٪
    expect(widths[1]).toBeCloseTo(31.1, 0)
  })

  it('**والذهبُ للأوّل وحدَه** — وذهبٌ على الكلّ يُلغي معنى الأوّل', () => {
    const html = barChart(rows)
    expect(html.match(/bar-fill top/g)).toHaveLength(1)
  })

  /** **ألوانُ الحالة محجوزة** (D-043): لا تُستعمَل لمقدار. */
  it('ولا لونَ حالةٍ في مقياس مقدار', () => {
    const html = barChart(rows, { unit: 'money' })
    for (const state of ['var(--bad)', 'var(--warn)', 'var(--ok)']) {
      expect(html).not.toContain(state)
    }
  })

  it('وما قيمتُه صفرٌ لا يُرسَم له عمود', () => {
    const html = barChart([...rows, { label: 'غير مستعمَل', value: 0 }])
    expect(html).not.toContain('غير مستعمَل')
  })

  it('ولا شيءَ إطلاقا يعطي حالا فارغةً تقول لماذا', () => {
    const html = barChart([{ label: 'أ', value: 0 }])
    expect(html).toContain('لا إنفاق بعد')
    expect(html).not.toContain('bar-row')
  })

  /**
   * **ووصفٌ لقارئ الشاشة يحمل الجواب لا الشكل.**
   *
   * «رسمٌ بيانيّ» تصفُ ما لا يُرى، ولا تُغني عنه. والوصفُ يقول العددَ
   * والمجموعَ والأعلى — وهو ما تقوله الأعمدةُ لمن يراها.
   */
  it('ووصفُه يحمل الأعلى والمجموع', () => {
    const html = barChart(rows, { unit: 'money' })
    const label = /aria-label="([^"]+)"/.exec(html)?.[1] ?? ''
    expect(label).toContain('جيميناي')
    expect(label).toContain('3')
  })

  it('والاسمُ يُهرَّب — ووسمٌ في اسمِ مزوّدٍ يُعرَض حرفا', () => {
    const html = barChart([{ label: '<b>خبيث</b>', value: 1 }])
    expect(html).not.toContain('<b>خبيث</b>')
    expect(html).toContain('&lt;b&gt;')
  })
})

describe('المساحة — والسؤالُ «كيف تغيّر»', () => {
  const series = Array.from({ length: 14 }, (_, i) => ({
    day: `2026-09-${String(i + 1).padStart(2, '0')}`,
    total: i === 6 ? 2.4 : 0.3,
  }))

  it('يرسم محورا وشبكةً — لا خطّا معلَّقا في فراغ', () => {
    const html = areaChart(series)
    expect(html).toContain('class="grid-l"')
    expect(html).toContain('class="axis axis-y"')
    expect(html).toContain('class="axis axis-x"')
  })

  /** **الرسمُ يتمدّد والحرفُ لا** (D-153): لا `<text>` في SVG، والحدُّ لا يتمدّد، والذروةُ HTML. */
  it('لا حرفَ داخل SVG، والمسارُ بحدٍّ ثابت، والذروةُ نقطةٌ فوق الرسم', () => {
    const html = areaChart(series)
    expect(html).not.toContain('<text')
    expect(html).not.toContain('<circle')
    expect(html).toContain('vector-effect="non-scaling-stroke"')
    expect(html).toMatch(/<i class="peak" style="left:\d+\.\d+%;top:\d+\.\d+%"/)
    // الذروةُ في اليوم السابع من ‏١٤: موضعُها بين ‏٤٠٪ و‏٦٠٪ من العرض
    const left = Number(/class="peak" style="left:([\d.]+)%/.exec(html)?.[1])
    expect(left).toBeGreaterThan(40)
    expect(left).toBeLessThan(60)
  })

  it('**ويُعلِّم الذروة** — وهي ما يُسأل عنه أوّلا', () => {
    const html = areaChart(series)
    expect(html).toContain('2.40$')
    expect(html).toContain('09-07')
  })

  it('ونقطتان فأقلّ لا تُرسَم خطّا يوهم باتّجاه', () => {
    expect(areaChart([{ day: '2026-09-01', total: 1 }])).toContain('لا بيانات كافية')
  })
})

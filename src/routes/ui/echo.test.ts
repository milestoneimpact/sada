import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { echo } from './echo'
import { brandMoment } from './moment'
import { MARK, MOMENT, THEME } from './tokens'

/**
 * أكبرُ انكسارٍ بالدرجات بين قطعتين متتاليتين من «c» في كلّ مسارٍ من النقش — المماسُّ الواردُ من
 * المقبض الثاني إلى الطرف، والصادرُ من الطرف إلى المقبض الأوّل للقطعة التالية. والزاويةُ لا يغيّرها
 * التكبيرُ المتساوي (`slice`)، فما يُقاس هنا هو ما يُرى في أيّ إطار.
 */
function worstKink(svg: string): number {
  let worst = 0
  for (const [, d = ''] of svg.matchAll(/ d="([^"]+)"/g)) {
    const tokens = d.match(/[MLcZ]|-?\d*\.?\d+/g) ?? []
    let i = 0
    let cur: [number, number] = [0, 0]
    let lastIn: [number, number] | null = null
    while (i < tokens.length) {
      const t = tokens[i++]!
      if (t === 'M' || t === 'L') {
        cur = [Number(tokens[i]), Number(tokens[i + 1])]
        i += 2
        lastIn = null
      } else if (t === 'c') {
        while (i + 5 < tokens.length && !/[MLcZ]/.test(tokens[i]!)) {
          const [a, b, c, e, f, g] = tokens.slice(i, i + 6).map(Number) as [number, number, number, number, number, number]
          i += 6
          const out: [number, number] = [a, b]
          if (lastIn !== null && Math.hypot(...out) > 0.5 && Math.hypot(...lastIn) > 0.5) {
            const cos = (lastIn[0] * out[0] + lastIn[1] * out[1]) / (Math.hypot(...lastIn) * Math.hypot(...out))
            worst = Math.max(worst, (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI)
          }
          lastIn = [f - c, g - e]
          cur = [cur[0] + f, cur[1] + g]
        }
      } else lastIn = null
    }
  }
  return worst
}

describe('نقشُ الصدى', () => {
  it('حتميٌّ: المُدخَلُ نفسُه يُخرج البايتاتِ نفسَها', () => {
    const o = { width: 600, height: 900, tone: 'deep', crest: 0.62, level: 0.6, scale: 1.4 } as const
    expect(echo(o)).toBe(echo(o))
  })

  it('يمرّ تحت السياسة: لا سمةَ أسلوب ولا وسمَ أسلوب ولا رابطَ ولا معرّفَ ولا حدث', () => {
    for (const tone of ['deep', 'light'] as const) {
      const svg = echo({ width: 390, height: 240, tone })
      expect(svg).not.toMatch(/style=|<style|href=|\sid=|\son[a-z]+=|<script|<image|url\(/i)
      expect(svg).toContain('aria-hidden="true"')
    }
  })

  it('صغيرٌ بما يكفي ليُضمَّن في الصفحة: أقلُّ من ‏3KB بستّة أصداء وحريره', () => {
    for (const [width, height] of [[600, 900], [390, 240], [1200, 628], [1080, 1920]] as const) {
      expect(Buffer.byteLength(echo({ width, height, tone: 'deep', density: 6 }))).toBeLessThan(3072)
    }
  })

  it('العميقةُ بألوان MOMENT وحدها، والفاتحةُ بلونِ من يضعها', () => {
    const deep = echo({ width: 600, height: 300, tone: 'deep' })
    const colours = new Set(deep.match(/#[0-9a-f]{6}/gi))
    expect([...colours].every((c) => (Object.values(MOMENT) as string[]).includes(c))).toBe(true)
    expect(echo({ width: 600, height: 300, tone: 'light' })).not.toMatch(/#[0-9a-f]{6}/i)
  })

  it('الكثافةُ تُقصَر: لا أكثرَ من ستّة أصداء ولا أقلَّ من صفر، وافتراضُها أربعةٌ عميقةً واثنان فاتحة', () => {
    const lines = (o: { density?: number, tone: 'deep' | 'light' }): number =>
      (echo({ width: 600, height: 300, ribbon: false, hairline: false, ...o }).match(/stroke-width=/g) ?? []).length
    expect(lines({ tone: 'light', density: 40 })).toBe(6)
    expect(lines({ tone: 'light', density: -3 })).toBe(0)
    expect(lines({ tone: 'deep' })).toBe(4)
    expect(lines({ tone: 'light' })).toBe(2)
  })

  /*
   * ‏**ولا انكسارَ عند الوصل** (مراجعة D-196): المقبضان كانا من الطرفين قبل تقريبهما، والصادرُ يُقرَّب
   * وحدَه، فقيس ‏4.5° في الخيط الذهبيّ و‏4.3° في الوجه المضاء في شريط الجوّال — زاويةٌ تُرى في خيطٍ
   * رفيعٍ يكبّره `slice` حتّى ‏2.3 مرّة بين ‏600 و‏899. والحدُّ درجةٌ واحدة.
   */
  it('المماسُّ متّصلٌ عند كلّ وصلٍ في رسمَي اللحظة وفي الأحجام الأخرى: لا انكسارَ فوق درجة', () => {
    const moment = brandMoment()
    const drawings = [...moment.matchAll(/<svg[^>]*data-echo[\s\S]*?<\/svg>/g)].map((m) => m[0])
    expect(drawings).toHaveLength(2)
    for (const svg of drawings) expect(worstKink(svg)).toBeLessThan(1)
    for (const [width, height] of [[1200, 628], [1080, 1920], [160, 96]] as const) {
      for (const tone of ['deep', 'light'] as const) {
        expect(worstKink(echo({ width, height, tone, ribbon: true, hairline: true })), `${tone} ${width}×${height}`).toBeLessThan(1)
      }
    }
  })

  it('النقشُ يحمل علامتَه على الـsvg نفسِه — فيراه الحارسُ مكشوفًا بلا غلاف', () => {
    expect(echo({ width: 160, height: 96, tone: 'light' })).toMatch(/^<svg [^>]*data-echo="light"/)
    expect(echo({ width: 600, height: 300, tone: 'deep' })).toMatch(/^<svg [^>]*data-echo="deep"/)
  })

  /*
   * ‏**والشرحُ يقول ما تفعله الشيفرة** (مراجعة D-196): رأسُ الملفّ قال «صدًى واحدٌ افتراضًا» للفاتحة
   * والشيفرةُ اثنان — فمن يبني الحالةَ الفارغةَ على الشرح بلا `density` يخرج له ثلاثةُ خطوطٍ متوازية.
   */
  it('رأسُ echo.ts يذكر الافتراضَين كما هما، والحالةُ الفارغةُ تمرّر density: 1', () => {
    const head = readFileSync(new URL('./echo.ts', import.meta.url), 'utf8').split('import ')[0]!
    expect(head).toMatch(/أربعةٌ\s*\n?\s*\*?\s*افتراضًا/)
    expect(head).toMatch(/وصدَيان افتراضًا/)
    expect(head).toContain('`density: 1`')
    expect(head).not.toMatch(/صدًى واحدٌ\s*\n?\s*\*?\s*افتراضًا/)
  })

  it('الذهبُ ذهبُ الثيم لا ثالث، والصدى شريطُ العلامة (D-196)', () => {
    expect(MOMENT.gold).toBe(THEME.dark['--au'])
    expect(MOMENT.goldLight).toBe(THEME.light['--au'])
    expect(MOMENT.echo).toBe(MARK['--mark-fg'])
    expect(MOMENT.ground).toBe(MARK['--mark-bg'])
    const deep = echo({ width: 600, height: 300, tone: 'deep' })
    expect(deep).toContain(`stroke="${THEME.dark['--au']}"`)
    expect(echo({ width: 600, height: 300, tone: 'light', hairline: true })).toContain(`stroke="${THEME.light['--au']}"`)
  })
})

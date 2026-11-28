/** مفرداتُ الحركة (D-341): المدّةُ من الرموز، والأسماءُ من المفردات — والورقةُ تُسأل بـ`sheet` لا بنصّها. */
import { describe, expect, it } from 'vitest'
import { STYLE } from './styles'
import { sheet } from '../../test/css'
import { readFileSync } from 'node:fs'

const css = sheet(STYLE)
const values = (prop: string): string[] => css.decls().filter((d) => d.prop === prop).map((d) => d.value)

describe('مفرداتُ الحركة (D-341)', () => {
  it('كلُّ `animation` بمدّةٍ من `--dur-*` — إلّا دوّارةَ التحميل ولمعانَ الهيكل، وهما حلقتان لا حركةُ دخول', () => {
    expect(values('animation').filter((d) => !d.startsWith('none') && !d.includes('var(--dur-') && !/^(spin|shimmer) /.test(d))).toEqual([])
  })

  it('كلُّ `transition` بمدّةٍ من `--dur-*`، ولا `transition:all`', () => {
    const all = values('transition')
    expect(all.filter((d) => !d.startsWith('none') && !d.includes('var(--dur-') && !d.includes('var(--delay-'))).toEqual([])
    expect(all.filter((d) => /(^|,\s*)all\b/.test(d))).toEqual([])
  })

  it('المفرداتُ حاضرةٌ بأصنافها، وتقليلُ الحركة يُسكت الجميع', () => {
    for (const k of ['.m-enter', '.m-leave', '.m-settle']) expect(css.rule(k)['animation']).toContain('var(--dur-')
    expect(css.rule('*', '@media (prefers-reduced-motion:reduce)')['animation'] ?? css.decls().find((d) => d.at.includes('prefers-reduced-motion') && d.prop === 'animation')?.value).toContain('none')
  })

  it('الانتقالُ المشترك من «id» لا من «style»، ودخولُ الحوار بـ«@starting-style» ويسكن مع «data-motion» (D-401)', () => {
    expect(css.rule('.fd-card[id^="f-"]:not([id^="f-item-"])')['view-transition-name']).toBe('attr(id type(<custom-ident>))')
    expect(css.rule('.page-head[id]')['view-transition-name']).toBe('attr(id type(<custom-ident>))')
    expect(css.rule('dialog[open]:not(.rv-sheet)', '@starting-style')['opacity']).toBe('0')
    expect(css.rule(':root[data-motion="reduced"] *')['transition']).toContain('none')
  })

  // ‏التعليقُ يُقرأ بعد طيّ المسافات وحذف علامة الاتّجاه، فإعادةُ لفّه لا تكسر الفحص
  const prose = (f: string) => readFileSync(new URL(f, import.meta.url), 'utf8').replace(/\u200f/g, '').replace(/\s+/g, ' ')
  const ar = (n: number | string) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'.charAt(Number(d)))

  it('تعليقُ السقف في tokens.ts يطابق «--dur-2» و«--dur-3» (D-444)', () => {
    const src = prose('./tokens.ts')
    const ms = (n: string) => Number(src.match(new RegExp(`--dur-${n}:(\\d+)ms`))![1])
    expect(src).toContain(`لا ردَّ تفاعلٍ فوق ${ar(ms('2'))}`)
    expect(src).toContain(`ولا شيءَ فوق ${ar(ms('3'))}`)
  })

  it('تعليقُ نصف القطر يطابق «--r-card» (D-444)', () => {
    const src = prose('./tokens.ts')
    const r = src.match(/--r-card:(\d+)px/)![1]
    expect(src).toMatch(new RegExp(`card ${r} البطاقة`))
  })

  it('«rise» يبدأ مرئيّا، والبطاقاتُ «backwards»، والتتابعُ يقف عند الثالثة (D-444 · D-445)', () => {
    const from = css.rule('from', '@keyframes rise')
    expect(Number(from['opacity'])).toBeGreaterThanOrEqual(0.92)
    expect(css.rule('.card')['animation']).toContain('backwards')
    expect(css.rule('.card')['animation']).not.toContain('both')
    expect(css.rule('.card:nth-child(n+3)')['animation-delay']).toBe('calc(2 * var(--stagger))')
    expect(css.decls().some((d) => d.prop === 'animation-delay' && /calc\((?:3|4) \* var\(--stagger\)\)|var\(--stagger\) \* [34]/.test(d.value))).toBe(false)
  })

  it('رموزُ الطباعة معرَّفة ومستعمَلة، ولا حرفَ لونٍ في قاعدة الطباعة (D-444)', () => {
    for (const t of ['bg', 'ink', 'muted', 'rule']) expect(values(`--print-${t}`).length).toBe(1)
    expect(css.decls().find((d) => d.at.includes('print') && d.prop === 'background')?.value).toContain('var(--print-bg)')
  })

  it('الحركةُ مخفّفةً تُسكت «rise» في البطاقات (D-445)', () => {
    const off = css.decls().filter((d) => d.prop === 'animation' && /none/.test(d.value) && d.selectors.includes('*'))
    expect(off.some((d) => d.at.includes('prefers-reduced-motion'))).toBe(true)
    expect(css.rule(':root[data-motion="reduced"] *')['transition']).toContain('none')
  })

  it('«fab» خارجُ طيّ «::details-content» (D-445)', () => {
    expect(css.rule('details:not(.more-sheet):not(.menu):not(.fab)::details-content')['height']).toBe('0')
  })
})

/** مفرداتُ الحركة (D-341): المدّةُ من الرموز، والأسماءُ من المفردات — والورقةُ تُسأل بـ`sheet` لا بنصّها. */
import { describe, expect, it } from 'vitest'
import { STYLE } from './styles'
import { sheet } from '../../test/css'

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
})

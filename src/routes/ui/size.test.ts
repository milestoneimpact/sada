/**
 * حجمُ الخطّ بدرجتين (D-306): مبدّلٌ في قائمة الحساب، وسكربتٌ يحفظه ويضعه على الجذر، وسكربتُ الرأس يقرؤه قبل الرسم، والرموزُ تملك
 * الدرجةَ الأكبر على الحاسوب والجوّال — سلّمًا ثالثًا معلَنًا، لا تكبيرًا بنسبة.
 */
import { describe, expect, it } from 'vitest'
import { accountMenu, sizeSwitch } from './shell'
import { STYLE } from './styles'
import { SIZE_SCRIPT } from './scripts'
import { uiScript } from '../../lib/ui/asset'
import { sheet } from '../../test/css'

const css = sheet(STYLE)

describe('حجمُ الخطّ', () => {
  it('المبدّلُ بدرجتين في قائمة الحساب، و«عاديّ» مضغوطٌ افتراضًا', () => {
    const sw = sizeSwitch()
    expect(sw).toContain('data-size="normal"')
    expect(sw).toContain('data-size="large"')
    expect(sw).toContain('aria-pressed="true"')
    expect(accountMenu()).toContain('حجم الخطّ')
    expect(accountMenu()).toContain('id="size"')
  })

  it('الرموزُ تملك الدرجةَ الأكبر على الحاسوب من السلّم نفسِه، لا تكبيرًا بنسبة', () => {
    const large = css.rule(':root[data-size="large"]')
    expect(large['--t-body']).toBe('17px')
    expect(large['--lh-body']).toBe('30px')
    expect(large['--t-ui']).toBe('16px')
    expect(large['--t-h2']).toBe('24px')
    expect(large['font-size']).toBeUndefined()
    expect(large['zoom']).toBeUndefined()
  })

  it('السكربتُ يحفظ الاختيارَ ويضعه على الجذر، ورأسُ الصفحة يقرؤه قبل الرسم', () => {
    expect(SIZE_SCRIPT).toContain("localStorage.setItem('sada-size',v)")
    expect(SIZE_SCRIPT).toContain('document.documentElement.dataset.size=v')
    expect(uiScript().body).toContain("getElementById('size')")
  })
})

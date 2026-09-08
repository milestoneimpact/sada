/**
 * الوقتُ بوجهين (D-106) — **وأهمُّ ما يُحرَس هنا ما يبقى بلا JavaScript.**
 *
 * ميزةٌ تحوّل في المتصفّح تُقاس بما تتركه حين لا يعمل التحويل: **رقمٌ
 * بلا منطقةٍ أسوأُ من رقمٍ بمنطقةٍ واحدة**، لأنّ القارئ يحسبه بتوقيته.
 */
import { describe, expect, it } from 'vitest'
import { TIME_SCRIPT, whenTag } from './time'
import { STYLE } from './styles'

describe('وسمُ الموعد — والـUTC مكتوبةٌ في الوسم', () => {
  it('**يحمل UTC نصّا لا في title وحدَه**', () => {
    const html = whenTag('2026-09-08 19:30:00')
    expect(html).toContain('2026-09-08 19:30')
    expect(html).toContain('UTC')
  })

  /** **و`datetime` بصيغة ISO**: هي التي يقرؤها `Date` في كلّ متصفّح. */
  it('ويحمل ISO في datetime ليقرأه المتصفّحُ وقارئُ الشاشة', () => {
    expect(whenTag('2026-09-08 19:30:00')).toContain('datetime="2026-09-08T19:30:00.000Z"')
  })

  it('ولا شيءَ لموعدٍ غائب — ولا سطرٌ فارغٌ يُقرأ عطلا', () => {
    expect(whenTag(null)).toBe('')
  })

  /** نصٌّ لا يُقرأ تاريخا يُعرَض كما هو مُهرَّبا — ولا يُخمَّن له معنى. */
  it('وقيمةٌ لا تُقرأ تاريخا تُعرَض حرفا مُهرَّبا', () => {
    expect(whenTag('<b>ليس تاريخا</b>')).toBe('&lt;b&gt;ليس تاريخا&lt;/b&gt;')
  })

  it('واللافتةُ تسبق الرقمَ حين تُطلَب', () => {
    expect(whenTag('2026-09-08 19:30:00', { label: 'موعدُه' })).toContain('موعدُه <time')
  })
})

describe('نصُّ التحويل — وقواعدُ اللوحة تُوَرَّث', () => {
  it('يُبنى دالّةً بلا خطأ صياغة', () => {
    expect(() => new Function(TIME_SCRIPT)).not.toThrow()
  })

  /** **ولا `innerHTML`** (D-071): تُبنى العقدُ ويُكتب النصُّ بـ textContent. */
  it('ولا يبني وسما في المتصفّح', () => {
    const bare = TIME_SCRIPT.replace(/^\s*\/\/.*$/gm, ' ')
    expect(bare).not.toContain('innerHTML')
    expect(bare).toContain('textContent')
  })

  /**
   * **ويزيد ولا يستبدل.**
   *
   * `appendChild` تُبقي الـUTC وتضيف تحتها؛ ومسحُ المحتوى ثمّ كتابةُ
   * المحلّيّ **يمحو الصيغةَ التي في القاعدة والتقارير** — وهي التي
   * تُنسَخ وتُقارَن.
   */
  it('**ويضيف السطرَ ولا يمحو الأوّل**', () => {
    expect(TIME_SCRIPT).toContain('appendChild')
    expect(TIME_SCRIPT).not.toContain('textContent=said;')
  })

  /** **وفشلُ التحويل لا يمحو شيئا** — متصفّحٌ بلا Intl عربيّةٍ يُبقي UTC. */
  it('وحين يعجز يعود ولا يترك فراغا', () => {
    expect(TIME_SCRIPT).toContain("if(said==='')return;")
  })

  it('وسمةُ الوسم هي المرساة — فتبديلُ اسمها يُمسَك هنا', () => {
    expect(TIME_SCRIPT).toContain('time[data-when-utc]')
    expect(whenTag('2026-09-08 19:30:00')).toContain('data-when-utc')
  })
})

describe('والصنفُ معرَّفٌ في الأنماط — لا يسقط صامتا', () => {
  it('when-t و when-local لهما قواعدُ', () => {
    expect(STYLE).toContain('.when-t{')
    expect(STYLE).toContain('.when-local{')
  })
})

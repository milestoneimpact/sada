import { describe, expect, it } from 'vitest'
import { neutralizeFormula } from './csv'

describe('neutralizeFormula — خليّةٌ لا تصير صيغة (D-318)', () => {
  it('كلُّ بادئةٍ ينفّذها جدولُ البيانات تُسبَق بفاصلةٍ عليا', () => {
    for (const lead of ['=', '+', '-', '@', '\t', '\r']) {
      expect(neutralizeFormula(`${lead}1+1`)).toBe(`'${lead}1+1`)
    }
  })

  it('وما سواها يمرّ حرفًا', () => {
    for (const plain of ['نصّ', '12', '', ' =1', "'=1", 'a=b']) {
      expect(neutralizeFormula(plain)).toBe(plain)
    }
  })
})

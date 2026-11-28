import { describe, expect, it } from 'vitest'
import { dayHeading } from './when'
import { compact, PLAN_REVIEW_SCRIPT } from './planReviewView'

describe('dayHeading (D-447/D-448)', () => {
  it('يسقط الفاصلة ويعدّ بالمفرد والمثنّى والجمع', () => {
    expect(dayHeading('الأحد، 8 نوفمبر', 0)).toBe('الأحد 8 نوفمبر')
    expect(dayHeading('الأحد، 8 نوفمبر', -1)).toBe('الأحد 8 نوفمبر')
    for (const n of [1, 2, 3, 10, 11]) expect(dayHeading('الأحد، 8 نوفمبر', n)).toMatch(/^الأحد 8 نوفمبر · \S/)
    expect(dayHeading('الأحد', 3)).toBe('الأحد · 3 منشورات')
    expect(dayHeading('الأحد', 1)).not.toBe(dayHeading('الأحد', 2))
    expect(dayHeading('الأحد', 2)).not.toBe(dayHeading('الأحد', 11))
  })
})

describe('compact (D-448)', () => {
  it('يلحق ما بعد ; و{ و, ولا يلحق ما بعد تعليق', () => {
    expect(compact('  var a=1;\n  b();\n')).toBe('var a=1;b();')
    expect(compact('f({\n x:1\n})')).toBe('f({x:1\n})')
    expect(compact('a(); // c,\nb()')).toBe('a(); // c,\nb()')
    expect(compact('// x;\ny()')).toBe('// x;\ny()')
  })
  it('معنى السكربت لا يتغيّر', () => {
    const src = 'var o={a:1, b:[1, 2]};\nvar s=o.a+o.b[1];\nreturn s;'
    expect(new Function(compact(src))()).toBe(new Function(src)())
    expect(() => new Function(PLAN_REVIEW_SCRIPT)).not.toThrow()
  })
  it('معروف: يمسّ الحرفيّات بعد «, » — فلا يُكتب في السكربت حرفيٌّ كهذا', () => {
    expect(compact("var t='a, b';")).toBe("var t='a,b';")
  })
})

/** مدى البايتات (D-182): ما يرسله `<video>`، وما يُعامَل كأنّه لم يُطلَب. */
import { describe, expect, it } from 'vitest'
import { parseRange, resolveRange } from './range'

describe('parseRange', () => {
  it('البداية وحدها، والبداية والنهاية، والذيل', () => {
    expect(parseRange('bytes=0-')).toEqual({ offset: 0 })
    expect(parseRange('bytes=10-19')).toEqual({ offset: 10, length: 10 })
    expect(parseRange('bytes=-500')).toEqual({ suffix: 500 })
  })

  it('المتعدّد والمعطوب والمقلوب والغائب: لا مدى — فيُردّ الكائن كلُّه', () => {
    for (const h of [undefined, '', 'bytes=0-1,5-9', 'items=0-9', 'bytes=-', 'bytes=9-3', 'bytes=-0', 'bytes=a-b']) {
      expect(parseRange(h)).toBeNull()
    }
  })
})

describe('resolveRange', () => {
  it('يُقصّ على حجم الكائن، والذيل أطول منه يأخذه كلَّه، وما بدأ بعده ‏416', () => {
    expect(resolveRange({ offset: 10, length: 10 }, 100)).toEqual({ start: 10, end: 19 })
    expect(resolveRange({ offset: 90, length: 50 }, 100)).toEqual({ start: 90, end: 99 })
    expect(resolveRange({ offset: 0 }, 100)).toEqual({ start: 0, end: 99 })
    expect(resolveRange({ suffix: 500 }, 100)).toEqual({ start: 0, end: 99 })
    expect(resolveRange({ offset: 100 }, 100)).toBeNull()
    expect(resolveRange({ offset: 0 }, 0)).toBeNull()
  })
})

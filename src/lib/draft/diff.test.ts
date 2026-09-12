/**
 * فرقُ الأسطر (D-128) — **ما في الاثنين يبقى، وما في أحدهما يُسمّى**.
 */
import { describe, expect, it } from 'vitest'
import { changedCount, diffLines } from './diff'

describe('diffLines', () => {
  it('نصّان متطابقان لا فرقَ فيهما', () => {
    const d = diffLines('أ\nب', 'أ\nب')
    expect(d.every((l) => l.kind === 'same')).toBe(true)
    expect(changedCount(d)).toBe(0)
  })

  it('سطرٌ بُدّل يُقرأ حذفًا ثمّ إضافة، وما حوله يبقى', () => {
    const d = diffLines('أوّل\nثانٍ\nثالث', 'أوّل\nثانٍ معدَّل\nثالث')
    expect(d).toEqual([
      { kind: 'same', text: 'أوّل' },
      { kind: 'del', text: 'ثانٍ' },
      { kind: 'add', text: 'ثانٍ معدَّل' },
      { kind: 'same', text: 'ثالث' },
    ])
    expect(changedCount(d)).toBe(2)
  })

  it('وسطرٌ حُذف من الآخر، وسطرٌ أُضيف في الأوّل', () => {
    expect(diffLines('أ\nب\nج', 'أ\nب')).toEqual([
      { kind: 'same', text: 'أ' }, { kind: 'same', text: 'ب' }, { kind: 'del', text: 'ج' },
    ])
    expect(diffLines('ب', 'أ\nب')).toEqual([{ kind: 'add', text: 'أ' }, { kind: 'same', text: 'ب' }])
  })

  it('وسطرُ النهاية الفارغُ و CRLF لا يصنعان فرقًا', () => {
    expect(changedCount(diffLines('أ\r\nب\r\n', 'أ\nب'))).toBe(0)
  })
})

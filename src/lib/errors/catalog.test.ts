/**
 * كتالوجُ الأخطاء (D-302): كلُّ رسالةٍ بجزأين تامّين — ما وقع، وما تفعل — ولا رسالةَ تعتذر أو تتكلّم بلغة الخادم.
 */
import { describe, expect, it } from 'vitest'
import { ERRORS, say } from './catalog'

describe('كتالوجُ الأخطاء', () => {
  it('لكلّ خطأٍ ما وقع وما تفعل، جملتان تامّتان، والثانيةُ فعلٌ لا وصف', () => {
    for (const [id, e] of Object.entries(ERRORS)) {
      expect(e.what, id).toMatch(/\.$/)
      expect(e.next, id).toMatch(/\.$/)
      expect(e.next.split(' ').length, `${id}: الفعلُ التالي جملة`).toBeGreaterThanOrEqual(3)
      expect(e.next, id).not.toBe(e.what)
      expect(`${e.what} ${e.next}`, id).not.toMatch(/غير متوقّع|500|خطأ في الخادم|exception|error/i)
    }
  })

  it('say() يصل الجزأين بمسافة واحدة', () => {
    expect(say('csrf_failed')).toBe('رمزُ النموذج لا يطابق الجلسة. أعد تحميلَ اللوحة ثمّ أعد المحاولة.')
  })
})

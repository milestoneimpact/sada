/**
 * **المراجعةُ تُرى ولا تمنع.**
 *
 * وأخطرُ ما فيها ملحوظةٌ كاذبة: مالكٌ يُقال له «حشو» في نصٍّ نظيف يكفّ
 * عن قراءة الملحوظات كلِّها — **فيضيع الصحيحُ مع الخاطئ**. فيُختبَر
 * الصمتُ كما يُختبَر الكلام.
 */
import { describe, expect, it } from 'vitest'
import { CEILING_SHARE, ceilingOf, normalizeAr, reviewText, stemAr, type NoteKind } from './review'

function kinds(text: string, platform: 'linkedin' | 'x' = 'linkedin', counted = 500): NoteKind[] {
  return reviewText(text, platform, counted, platform === 'x' ? 280 : 3000).map((n) => n.kind)
}

const CLEAN_LI =
  'البرنامجُ الذي لا صاحبَ له لا يفشل — يذبل.\n\n' +
  'ولا أحد يعلن ذبوله. وهذا أخطر من السقوط الصريح: السقوطُ يُراجَع في اجتماع.\n\n' +
  'أمّا الذبولُ فيُموَّل سنةً أخرى، ثمّ أخرى، حتّى تنتهي المِنحة.'

describe('التطبيع — عدسةٌ لا مِبضَع', () => {
  it('يوحّد صورَ الألف والياء والتاء ويُسقط التشكيل', () => {
    expect(normalizeAr('الحَوْكَمَة')).toBe('الحوكمه')
    expect(normalizeAr('إدارة')).toBe('اداره')
    expect(normalizeAr('أثَر')).toBe('اثر')
    expect(normalizeAr('علىٰ')).toBe('علي')
    expect(normalizeAr('مـــمتد')).toBe('ممتد')
  })

  it('ولا يُطبَّق على ما يُعرَض — النصُّ يبقى كما كُتب', () => {
    const original = 'الحَوْكَمَةُ تسبق السرعة'
    const notes = reviewText(original, 'linkedin', 100, 3000)
    for (const note of notes) {
      expect(note.hits.join(' ')).not.toContain(original)
    }
  })
})

describe('الصمتُ حيث لا شيء', () => {
  it('نصٌّ نظيفٌ لا ملحوظةَ عليه', () => {
    expect(kinds(CLEAN_LI)).toEqual([])
  })

  it('ونصُّ X القصيرُ النظيفُ كذلك', () => {
    expect(kinds('البرنامجُ الذي لا صاحبَ له لا يفشل — يذبل. ولا أحد يعلن ذبوله.', 'x', 100))
      .toEqual([])
  })
})

describe('الحشو', () => {
  it('يُمسَك ولو كُتب بألفٍ همزتُها ساقطة', () => {
    const notes = reviewText(
      `${CLEAN_LI}\n\nومما لا شك فيه ان هذا يتكرر.`,
      'linkedin', 500, 3000,
    )
    const filler = notes.find((n) => n.kind === 'filler')
    expect(filler).toBeDefined()
    expect(filler!.hits).toContain('مما لا شك فيه')
  })

  it('وبالتشكيل كذلك', () => {
    expect(kinds(`${CLEAN_LI}\n\nوتَجْدُرُ الإشارةُ إلى أنّ الأمر كذلك.`))
      .toContain('filler')
  })
})

describe('الخاتمةُ المستهلَكة', () => {
  it('«ما رأيكم؟» تُقال', () => {
    expect(kinds(`${CLEAN_LI}\n\nما رأيكم؟`)).toContain('cliche')
  })

  it('وسؤالٌ خاصٌّ بالموضوع لا يُقال عنه شيء', () => {
    expect(kinds(`${CLEAN_LI}\n\nكم يوما بين قرارك وأثره؟`)).not.toContain('cliche')
  })
})

describe('الوسوم — بعرف كلّ منصّة', () => {
  it('أربعةٌ في LinkedIn تُقال، وثلاثةٌ لا', () => {
    expect(kinds(`${CLEAN_LI}\n#حوكمة #أثر #برامج #قياس`)).toContain('hashtag')
    expect(kinds(`${CLEAN_LI}\n#حوكمة #أثر #برامج`)).not.toContain('hashtag')
  })

  it('واثنان في X تُقالان', () => {
    expect(kinds('فكرةٌ تقف وحدها ولا تحتاج تمهيدا. #حوكمة #أثر', 'x', 100))
      .toContain('hashtag')
  })
})

describe('التكرار', () => {
  it('كلمةٌ ثلاثَ مرّاتٍ فأكثر تُقال بعددها', () => {
    const notes = reviewText(
      'الحوكمة تبدأ بالحوكمة، ولا حوكمةَ بلا قرار. والحوكمة قرار.',
      'linkedin', 200, 3000,
    )
    const repeat = notes.find((n) => n.kind === 'repeat')
    expect(repeat).toBeDefined()
    expect(repeat!.hits[0]).toBe('حوكمه ×4')
  })

  it('ومرّتان لا', () => {
    expect(kinds('الحوكمةُ قرار، والحوكمةُ تُقاس بأثرها في البرامج والمشاريع.'))
      .not.toContain('repeat')
  })

  it('**والسوابقُ لا تُخفي التكرار** — «بالحوكمة» و«الحوكمة» واحدة', () => {
    expect(stemAr('بالحوكمه')).toBe('حوكمه')
    expect(stemAr('والحوكمه')).toBe('حوكمه')
    expect(stemAr('للبرامج')).toBe('برامج')
    expect(stemAr('الحوكمه')).toBe('حوكمه')
  })

  it('ولا يُقَصّ ما يصير بالقصّ كلمةً أخرى', () => {
    // «بالغ» لو قُصّت لصارت «الغ» فجُمعت مع ما ليس منها
    expect(stemAr('بالغ')).toBe('بالغ')
    expect(stemAr('كتاب')).toBe('كتاب')
    expect(stemAr('وقت')).toBe('وقت')
  })

  it('وأداةٌ تتكرّر ليست تكرارا — «الذي» ليست كلمةً تُحسَب', () => {
    expect(kinds('الذي يبدأ والذي ينتهي والذي بينهما، هؤلاء الذين يقودون البرامج.'))
      .not.toContain('repeat')
  })
})

describe('الجملةُ الطويلة', () => {
  it('فوق الحدِّ تُقال، ولكلّ منصّةٍ حدُّها', () => {
    const long = `${'كلمةٌ '.repeat(30)}.`
    expect(kinds(long)).toContain('sentence')
    expect(kinds(`${'كلمةٌ '.repeat(24)}.`, 'x', 100)).toContain('sentence')
    expect(kinds(`${'كلمةٌ '.repeat(18)}.`, 'x', 100)).not.toContain('sentence')
  })

  it('ولا تُعرَض الجملةُ كاملةً — طرفُها يكفي للتعرّف', () => {
    const notes = reviewText(`${'كلمةٌ '.repeat(40)}.`, 'linkedin', 300, 3000)
    const note = notes.find((n) => n.kind === 'sentence')!
    expect(note.hits[0]!.endsWith('…')).toBe(true)
    expect(note.hits[0]!.length).toBeLessThan(60)
  })
})

describe('قربُ السقف — نسبةٌ من الحدّ لا رقمٌ مستقلّ', () => {
  it('يُشتقّ من الحدِّ فلا يشيخ وحدَه', () => {
    expect(ceilingOf(280)).toBe(Math.floor(280 * CEILING_SHARE))
    expect(ceilingOf(3000)).toBe(Math.floor(3000 * CEILING_SHARE))
  })

  it('وفوقه يُقال بالرقمين معا', () => {
    const notes = reviewText('نصٌّ قصير.', 'x', 270, 280)
    const note = notes.find((n) => n.kind === 'ceiling')
    expect(note).toBeDefined()
    expect(note!.text).toContain('270')
    expect(note!.text).toContain('280')
  })

  it('ودونه صمت', () => {
    expect(kinds('نصٌّ قصير.', 'x', 200)).not.toContain('ceiling')
  })
})

describe('لا ترمي ولا تمنع', () => {
  it('نصٌّ فارغٌ أو غريبٌ لا يُسقِط شيئا', () => {
    for (const text of ['', '   ', '\n\n', '###', '😀😀😀', 'a'.repeat(5000)]) {
      expect(() => reviewText(text, 'linkedin', 0, 3000)).not.toThrow()
    }
  })

  it('والمخرَجُ ملحوظاتٌ دائما — لا رفضَ ولا استثناء', () => {
    const notes = reviewText(`${CLEAN_LI}\nما رأيكم؟ #a #b #c #d`, 'linkedin', 2900, 3000)
    expect(Array.isArray(notes)).toBe(true)
    expect(notes.length).toBeGreaterThan(2)
  })
})

/**
 * **وحروفُ الأصل لا تُقصّ** — جُرّب قصُّ المفرد فأسقطه الاختبار.
 */
describe('ما لا يُقصّ', () => {
  it('حروفُ الجرّ والعطف المفردةُ تبقى — حرفُ أصلٍ لا يُميَّز إلّا بمعجم', () => {
    for (const word of ['بالغ', 'وقتها', 'كتاب', 'لعبه', 'بيان', 'وقت', 'فكره']) {
      expect(stemAr(word), word).toBe(word)
    }
  })

  it('وأداةٌ على كلمةٍ قصيرةٍ لا تُقصّ — «الي» تبقى', () => {
    expect(stemAr('الي')).toBe('الي')
    expect(stemAr('اثر')).toBe('اثر')
  })
})

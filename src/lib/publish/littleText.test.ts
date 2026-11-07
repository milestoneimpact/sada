/**
 * ‏نصُّ LinkedIn بصيغة «little» (D-324) — **كلُّ محرفٍ محجوزٍ يُهرَّب، والوسمُ بقالبه الموثَّق**.
 *
 * ‏الوثيقة: learn.microsoft.com/linkedin/marketing/community-management/shares/little-text-format (li-lms-2026-10):
 * ‏«All reserved characters need to be escaped with a backslash, even if those characters are not used in one of the
 * ‏supported elements or templates» — والمحجوزُ: ‎| { } @ [ ] ( ) < > # \ * _ ~‎. والوسمُ ‎{hashtag|\#|tag}‎.
 */
import { describe, expect, it } from 'vitest'
import { escapeLittle, littleText } from './littleText'

describe('escapeLittle', () => {
  it('يهرّب كلَّ محرفٍ محجوز بشرطةٍ مائلة، والعربيّةُ كما هي', () => {
    expect(escapeLittle('(قوسان) [مربّعان] {معقوفان} <زاويتان>')).toBe('\\(قوسان\\) \\[مربّعان\\] \\{معقوفان\\} \\<زاويتان\\>')
    expect(escapeLittle('a@b.com')).toBe('a\\@b.com')
    expect(escapeLittle('snake_case و*نجمة* و~مدّة~ و|عمود|')).toBe('snake\\_case و\\*نجمة\\* و\\~مدّة\\~ و\\|عمود\\|')
    expect(escapeLittle('C:\\path')).toBe('C:\\\\path')
    expect(escapeLittle('#')).toBe('\\#')
    expect(escapeLittle('الحوكمة تحمي القرار، ولا تبطئه.')).toBe('الحوكمة تحمي القرار، ولا تبطئه.')
  })
})

describe('littleText', () => {
  it('الأقواسُ التي تبتر المنشور تُهرَّب (السبب المبلَّغ عنه لقصّ النصّ)', () => {
    expect(littleText('ثلاث خطوات (لا أكثر) تكفي.')).toBe('ثلاث خطوات \\(لا أكثر\\) تكفي.')
  })

  it('الأقواس والمعقوفان والزاويتان و@ و_ و* و~ و| و\\ كلّها في نصٍّ واحد', () => {
    const raw = 'قائمة: [أ] {ب} <ج> @عمر a_b *مهمّ* ~تقريبًا~ أ|ب \\ نهاية'
    expect(littleText(raw)).toBe('قائمة: \\[أ\\] \\{ب\\} \\<ج\\> \\@عمر a\\_b \\*مهمّ\\* \\~تقريبًا\\~ أ\\|ب \\\\ نهاية')
  })

  it('الوسمُ في أوّل كلمةٍ أو بعد فراغ يصير قالبَ الوسم الموثَّق — عربيًّا وإنجليزيًّا', () => {
    expect(littleText('#الحوكمة')).toBe('{hashtag|\\#|الحوكمة}')
    expect(littleText('نصّ.\n\n#الحوكمة #القيادة #AI')).toBe('نصّ.\n\n{hashtag|\\#|الحوكمة} {hashtag|\\#|القيادة} {hashtag|\\#|AI}')
  })

  it('وما في الوسم من محرفٍ محجوز يُهرَّب داخل القالب', () => {
    expect(littleText('#AI_tools')).toBe('{hashtag|\\#|AI\\_tools}')
  })

  it('و# ليست وسمًا بعد حرف، ولا وحدها، ولا قبل أرقامٍ وحدها — تُهرَّب', () => {
    expect(littleText('لغة C# جيّدة')).toBe('لغة C\\# جيّدة')
    expect(littleText('رقم # واحد')).toBe('رقم \\# واحد')
    expect(littleText('البند #3')).toBe('البند \\#3')
  })

  it('والرابطُ يُهرَّب محرفًا محرفًا ولا يصير شيءٌ فيه وسمًا', () => {
    expect(littleText('اقرأ https://example.com/a_b/#part (هنا)'))
      .toBe('اقرأ https://example.com/a\\_b/\\#part \\(هنا\\)')
    expect(littleText('www.example.com/~me')).toBe('www.example.com/\\~me')
  })

  it('ونصٌّ بلا محجوزٍ يخرج كما دخل، بأسطره', () => {
    const plain = 'سطر أوّل.\n\nسطر ثانٍ، بفاصلة؛ وعلامة استفهام؟ ونقطتين: نعم!'
    expect(littleText(plain)).toBe(plain)
  })

  it('ولا يُهرَّب ما هُرّب مرّتين: الشرطةُ المائلة نفسُها محجوزة', () => {
    expect(littleText('\\(')).toBe('\\\\\\(')
  })
})

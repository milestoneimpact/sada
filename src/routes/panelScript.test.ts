/**
 * **العدّادُ في المتصفّح يعدّ كما يعدّ الخادم.**
 *
 * قاعدةُ الطول (D-071) مكتوبةٌ مرّتين بالضرورة: مرّةً في `length.ts`
 * يقرؤها الخادم، ومرّةً في نصّ اللوحة يجري في المتصفّح. **ونسختان
 * تفترقان بلا حارس**: يُري العدّادُ أحمرَ على منشورٍ يقبله الخادم،
 * أو أخضرَ على آخرَ يرفضه — والمالكُ يصدّق ما يرى.
 *
 * فيُنتزَع العدّادُ من النصّ المُرسَل فعلا — لا من نسخةٍ هنا — ويُشغَّل
 * ويُقارَن.
 */
import { describe, expect, it } from 'vitest'
import { SCRIPT } from './panelView'
import { xWeightedLength } from '../lib/draft/length'

/** يُنتزَع من النصّ المُرسَل ويُبنى دالّةً — فما يُختبَر هو ما يُشحَن. */
function clientCounter(): (text: string) => number {
  const head = /var URL_LEN=[\s\S]*?var RE_EMOJI=[^\n]*\n/.exec(SCRIPT)
  const weigh = /function weigh\(cp\)\{[\s\S]*?\n {2}\}/.exec(SCRIPT)
  const xLen = /function xLen\(text\)\{[\s\S]*?\n {2}\}/.exec(SCRIPT)
  if (head === null || weigh === null || xLen === null) {
    throw new Error('لم يُعثَر على العدّاد في نصّ اللوحة — أنُقل أم أُعيدت تسميتُه؟')
  }
  return new Function(`${head[0]}${weigh[0]}\n${xLen[0]}\nreturn xLen`)() as (t: string) => number
}

const CASES: readonly string[] = [
  '',
  'البرنامجُ بلا صاحبٍ لا يفشل — يذبل',
  'ن'.repeat(280),
  'https://a.co/x',
  `https://basserh.com/${'ط'.repeat(120)}`,
  `${'ن'.repeat(240)} https://basserh.com/${'m'.repeat(60)}`,
  'https://a.co/1 https://b.co/2',
  'basserh.com',
  '😀',
  '🇸🇦',
  '👨‍👩‍👧‍👦',
  'ﻻ',
  'نصّ 😀 ورابط https://x.co/1 وعَلَم 🇸🇦',
]

describe('عدّادُ المتصفّح يوافق عدّادَ الخادم (D-071)', () => {
  const count = clientCounter()

  it.each(CASES.map((c) => [c.slice(0, 32) || '(فارغ)', c]))(
    'يتّفقان على: %s',
    (_label, text) => {
      expect(count(text as string)).toBe(xWeightedLength(text as string))
    },
  )

  /** **والثوابتُ من `length.ts`** لا مكتوبةً في النصّ فتشيخ وحدَها. */
  it('وثوابتُ القاعدة تخرج في النصّ من مصدرها', () => {
    expect(SCRIPT).toContain('var URL_LEN=23')
    expect(count('https://a.co/x')).toBe(23)
  })
})

/** ‏سلسلةُ X من نصٍّ واحد (D-324): سطرٌ فيه `---` وحدَها بين كلّ تغريدتين. */
import { describe, expect, it } from 'vitest'
import { isThread, longestTweet, publishCostOf, THREAD_MAX, threadProblem, tweetsOf } from './thread'

describe('tweetsOf', () => {
  it('يقسم على سطر --- وحدَه، ويقصّ الأطراف، ويسقط الفارغ', () => {
    expect(tweetsOf('x', 'الأولى\n---\nالثانية\r\n  ---  \r\nالثالثة\n---\n')).toEqual(['الأولى', 'الثانية', 'الثالثة'])
  })

  it('ولا يقسم على --- داخل سطر، ولا على أربعٍ أو اثنتين', () => {
    expect(tweetsOf('x', 'أ --- ب\n----\nج\n--\nد')).toEqual(['أ --- ب\n----\nج\n--\nد'])
  })

  it('وLinkedIn لا سلسلةَ لها: النصّ كلُّه واحد كما كُتب', () => {
    expect(tweetsOf('linkedin', 'أ\n---\nب')).toEqual(['أ\n---\nب'])
    expect(isThread('linkedin', 'أ\n---\nب')).toBe(false)
    expect(isThread('x', 'أ\n---\nب')).toBe(true)
    expect(isThread('x', 'أ\n---\n')).toBe(false)
  })
})

describe('threadProblem', () => {
  it('كلُّ تغريدة بحدّها 280 بحساب X — ويُسمّى رقمُها', () => {
    const ok = `${'ن'.repeat(280)}\n---\n${'م'.repeat(200)}`
    expect(threadProblem(ok)).toBeNull()
    const long = `${'ن'.repeat(100)}\n---\n${'م'.repeat(281)}`
    expect(threadProblem(long)).toBe('التغريدة 2 من 2 طولها 281 محرفًا بحساب X وهي تقبل 280')
  })

  it('وسقفُ السلسلة', () => {
    const many = Array.from({ length: THREAD_MAX + 1 }, (_, i) => `تغريدة ${i + 1}`).join('\n---\n')
    expect(threadProblem(many)).toBe(`السلسلة ${THREAD_MAX + 1} تغريدةً والحدّ ${THREAD_MAX}`)
  })

  it('وأطولُ تغريدةٍ هو ما يقاس به العدّاد', () => {
    expect(longestTweet('x', `${'ن'.repeat(30)}\n---\n${'م'.repeat(250)}`)).toBe(250)
    expect(longestTweet('linkedin', 'ن'.repeat(500))).toBe(500)
  })
})

describe('publishCostOf', () => {
  it('ثمنُ السلسلة مجموعُ تغريداتها، والرابطُ في واحدةٍ يُحسب لها وحدها', () => {
    expect(publishCostOf('x', 'أ\n---\nب\n---\nج')).toBeCloseTo(0.045)
    expect(publishCostOf('x', 'أ https://e.com\n---\nب')).toBeCloseTo(0.215)
    expect(publishCostOf('linkedin', 'أ (ب)')).toBe(0)
  })
})

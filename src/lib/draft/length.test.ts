/**
 * الطولُ الموزون — **والقيمُ المتوقَّعةُ محسوبةٌ بقاعدة X المنشورة**
 * (`twitter-text@3.1.0 · configs.js · version3`)، لا بتقديرٍ ولا بذاكرة.
 */
import { describe, expect, it } from 'vitest'
import { postLength, X_URL_LENGTH, xWeightedLength } from './length'
import { PLATFORMS } from './prompt'

describe('العربيّةُ محرفا محرفا', () => {
  it('كلُّ حرفٍ عربيٍّ بواحد — فهو داخل ٠–٤٣٥١', () => {
    const text = 'البرنامجُ بلا صاحبٍ لا يفشل — يذبل'
    expect(xWeightedLength(text)).toBe(text.length)
  })

  it('ومئتان وثمانون حرفا عربيّا تبلغ الحدَّ ولا تتجاوزه', () => {
    const text = 'ن'.repeat(280)
    expect(xWeightedLength(text)).toBe(280)
    expect(xWeightedLength(text)).toBeLessThanOrEqual(PLATFORMS.x.hardLimit)
  })
})

describe('الروابطُ بطولٍ ثابت — وهذا لبُّ العلّة', () => {
  it('رابطٌ طويلٌ يُعدّ ثلاثةً وعشرين مهما طال', () => {
    const short = 'https://a.co/x'
    const long = `https://basserh.com/${'ط'.repeat(120)}`
    expect(xWeightedLength(short)).toBe(X_URL_LENGTH)
    expect(xWeightedLength(long)).toBe(X_URL_LENGTH)
  })

  /**
   * **الحالُ التي كانت تُرمى وقد دُفع ثمنُها**: نصٌّ في حدوده ورابطٌ
   * يدفعه فوق الحدّ بحسابنا، **و X تقبله**.
   */
  it('ومسوّدةٌ كانت تُرفض بعد الكلفة تصير مقبولةً بحقّ', () => {
    const body = 'ن'.repeat(240)
    const text = `${body} https://basserh.com/${'m'.repeat(60)}`

    expect(text.length).toBeGreaterThan(PLATFORMS.x.hardLimit)      // الحسابُ القديم يرفض
    expect(xWeightedLength(text)).toBe(240 + 1 + X_URL_LENGTH)      // وحسابُ X يقبل
    expect(xWeightedLength(text)).toBeLessThanOrEqual(PLATFORMS.x.hardLimit)
  })

  it('ورابطان يُعدّان ستّةً وأربعين', () => {
    expect(xWeightedLength('https://a.co/1 https://b.co/2')).toBe(X_URL_LENGTH * 2 + 1)
  })

  /**
   * **ولا يُختصَر ما لم نتيقّن أنّ X تختصره.** فالنطاقُ المجرَّد يُعدّ
   * بحروفه — وهو أكثرُ ممّا تعدّ X، **والخطأُ في هذا الاتّجاه أرحم**:
   * نرفض ما تقبله، ولا نقبل ما ترفضه بعد الكلفة وبعد الطابور.
   */
  it('والنطاقُ المجرَّد يُعدّ بحروفه — احتياطا في الاتّجاه الأرحم', () => {
    expect(xWeightedLength('basserh.com')).toBe('basserh.com'.length)
  })
})

describe('ما فوق النطاقات الخفيفة بمحرفين', () => {
  it('والرمزُ التعبيريُّ الواحدُ محرفان', () => {
    expect(xWeightedLength('😀')).toBe(2)
  })

  /** **العَلَمُ حرفان إقليميّان وأربعُ وحدات UTF-16 — ويُعدّ محرفين.** */
  it('والعَلَمُ محرفان لا أربعة', () => {
    expect('🇸🇦'.length).toBe(4)
    expect(xWeightedLength('🇸🇦')).toBe(2)
  })

  /** والعائلةُ سلسلةٌ موصولة — **واحدةٌ لا خمس**. */
  it('والعائلةُ الموصولةُ محرفان لا أحدَ عشر', () => {
    const family = '👨‍👩‍👧‍👦'
    expect(family.length).toBeGreaterThan(8)
    expect(xWeightedLength(family)).toBe(2)
  })

  /** وأشكالُ العربيّة التقديميّة **خارج** ٠–٤٣٥١ فتُعدّ محرفين. */
  it('وشكلٌ تقديميٌّ عربيٌّ بمحرفين — يأتي من لصقِ مستنداتٍ قديمة', () => {
    expect(xWeightedLength('ﻻ')).toBe(2)
  })
})

describe('و LinkedIn على عدّ المحارف — ولا تُخترَع لها قاعدة', () => {
  it('لا يُختصَر لها رابط', () => {
    const text = `مقدّمة https://basserh.com/${'m'.repeat(60)}`
    expect(postLength(text, 'linkedin')).toBe(text.length)
  })

  it('ويُختصَر لـ X', () => {
    const text = `مقدّمة https://basserh.com/${'m'.repeat(60)}`
    expect(postLength(text, 'x')).toBeLessThan(text.length)
  })
})

/**
 * قراءةُ سببِ الرفض — والنصُّ يُضيّق ولا يقرّر.
 *
 * والحالةُ الأولى هنا **منسوخةٌ من العنوان الذي عاد فعلا**، لا مؤلَّفة.
 */
import { describe, expect, it } from 'vitest'
import { blamedScopes, namedScopes } from './refusal'
import { scopeSet } from './scopes'

/** ما عاد من LinkedIn حرفا بحرف، بعد فكّ ترميز العنوان. */
const REAL = 'Scope "openid" is not authorized for your application'

describe('استخراج الأسماء', () => {
  it('يقرأ ما بين علامتي اقتباس', () => {
    expect(namedScopes(REAL)).toEqual(['openid'])
  })

  it('ويقبل الاقتباس مهرَّبا كما يصل من بعض المنصّات', () => {
    expect(namedScopes('Scope &quot;openid&quot; is not authorized')).toEqual(['openid'])
  })

  it('ويقبل الاقتباس المفرد', () => {
    expect(namedScopes("Scope 'tweet.write' is invalid")).toEqual(['tweet.write'])
  })

  it('ويقرأ أكثر من واحد بلا تكرار', () => {
    expect(namedScopes('"openid" and "profile" and "openid"').sort())
      .toEqual(['openid', 'profile'])
  })

  /**
   * **جملةٌ بين اقتباسين ليست اسمَ نطاق.**
   *
   * ووصفٌ يقتبس عبارةً — «your application» مثلا — لا يُقرأ نطاقا،
   * وإلّا عُرض للمالك اسمٌ لا وجودَ له في أيّ بوّابة.
   */
  it('ولا يقرأ جملةً أو اسما بمسافة أو حرف كبير', () => {
    expect(namedScopes('Scope "your application" is bad')).toEqual([])
    expect(namedScopes('"Share on LinkedIn" missing')).toEqual([])
    expect(namedScopes('"" empty')).toEqual([])
  })

  it('ووصف فارغ لا يعطي شيئا', () => {
    expect(namedScopes('')).toEqual([])
    expect(namedScopes('no quotes at all')).toEqual([])
  })
})

describe('المطابقة على ما طُلب', () => {
  /**
   * **النصُّ يُضيّق ولا يقرّر.**
   *
   * فما وافق نطاقا طلبناه أُخذ، وما لم يوافق أُهمل — ورسالةٌ تتبدّل
   * تُعيدنا إلى عرض القائمة كاملةً، ولا تُدخلنا في خطأ.
   */
  it('تأخذ ما طُلب وتُهمل ما لم يُطلَب', () => {
    const requested = scopeSet('linkedin')
    expect(blamedScopes(REAL, requested)).toEqual(['openid'])
    expect(blamedScopes('Scope "r_liteprofile" is not authorized', requested)).toEqual([])
  })

  it('وصياغة لم تُتوقَّع تعيد لا شيء — فتُعرَض القائمة كاملة', () => {
    expect(blamedScopes('Your app lacks the required product.', scopeSet('linkedin')))
      .toEqual([])
  })

  it('وتعمل لـ X كما لـ LinkedIn — والسجلّ واحد', () => {
    expect(blamedScopes('Scope "media.write" is invalid', scopeSet('x')))
      .toEqual(['media.write'])
  })
})

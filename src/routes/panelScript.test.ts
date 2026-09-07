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

/**
 * **ودَرَجُ النماذج يُشحَن سليما** (D-081).
 *
 * والسببُ مقيسٌ لا مفترَض: هذا النصُّ يعيش داخل قالبٍ نصّيّ في TypeScript،
 * **فمائلٌ واحدٌ يُبتلَع عند البناء** — وقد وقع فعلا في عدّاد X، فصار
 * `\p{RI}` في المصدر `p{RI}` في المتصفّح. ولا يظهر ذلك إلّا حين يُقرأ
 * **النصُّ المُرسَل** لا المصدر.
 */
describe('دَرَجُ النماذج — ما يُشحَن هو ما يُقرأ', () => {
  it('النصُّ يُبنى دالّةً بلا خطأ صياغة', () => {
    expect(() => new Function(SCRIPT)).not.toThrow()
  })

  it('وينادي نهايةَ الفهرس عندنا لا عند المزوّد مباشرةً', () => {
    expect(SCRIPT).toContain('/panel/providers/models')
  })

  it('و**خيارُ الكتابة اليدويّة باقٍ** — مزوّدٌ بلا فهرسٍ يبقى صالحا', () => {
    expect(SCRIPT).toContain('__manual__')
  })

  /**
   * **الجلبُ من إيماءةٍ لا من فتح الشاشة.**
   *
   * فتحُ اللوحة لا يوقظ نداءً باسم المالك إلى كلّ مزوّدٍ عنده. وأوّلُ
   * لمسةٍ للدرج تجلب — فتبديلُ النموذج لا يحتاج ضغطتين (D-083).
   */
  it('الجلبُ من إيماءةٍ لا من فتح الشاشة — ولمسةٌ ثانيةٌ لا تُعيده', () => {
    expect(SCRIPT).toContain("sel.addEventListener('focus',function(){load(true);})")
    expect(SCRIPT).toContain("btn.addEventListener('click',function(){loadedFor='';load(true);})")
    // حارسٌ يمنع نداءً ثانيا لقائمةٍ جُلبت — وإلّا نُودي عند كلّ لمسة
    expect(SCRIPT).toContain('if(busy||loadedFor===name)return')
  })

  /**
   * **وتبديلُ المزوّد يُسقط نماذجَه** — وهو العطلُ الذي رآه المالك:
   * اختير Cloudflare فبقيت نماذجُ Gemini معروضة، وحُفظ توجيهٌ لا يعمل.
   */
  it('وتبديلُ المزوّد يُفرّغ الدرجَ ويجلب نماذجَ الجديد', () => {
    expect(SCRIPT).toContain("pick.addEventListener('change'")
    expect(SCRIPT).toContain("mpClear(sel,'— اختر نموذجا —')")
    expect(SCRIPT).toContain("box.dataset.provider=pick.value")
  })
})

/**
 * **الشريطُ يخطف روابطَ المرساة وحدها** (D-087).
 *
 * كان يخطف كلَّ رابطٍ فيه — وفيه تسعةُ روابطِ صفحاتٍ حقيقيّة: «ما عليك»
 * و«التقرير» وشاشةُ كلّ منصّة. فكان `preventDefault` يمنع انتقالَها، ثمّ
 * يبحث عن لوحٍ اسمُه «panel/tasks» فلا يجده **فيرتدّ إلى نظرة عامّة**.
 *
 * **وزرٌّ يعمل خطأً أسوأُ من زرٍّ لا يعمل**: هذا يُشتكى منه، وذاك يُظنّ
 * به أنّ الصفحةَ فارغة.
 */
describe('الشريطُ لا يخطف إلّا المراسي', () => {
  it('يُصفّي الروابطَ إلى ما يبدأ بمرساة', () => {
    expect(SCRIPT).toContain("(a.getAttribute('href')||'').charAt(0)==='#'")
  })

  it('و**المُصفّى هو ما يُخطَف**، لا القائمةُ الخام', () => {
    // ترتيبٌ يهمّ: يُبنى `all` ثمّ يُصفّى إلى `tabs`، والمستمعُ على `tabs`
    const order = SCRIPT.indexOf('var all=') < SCRIPT.indexOf('var tabs=')
    expect(order).toBe(true)
    expect(SCRIPT).toContain('tabs.forEach(function(t){t.addEventListener')
    expect(SCRIPT).not.toContain('all.forEach(function(t){t.addEventListener')
  })
})

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
 * الاختصاراتُ تُقاس بموضع المفتاح لا بحرفه (D-090).
 *
 * ## ولماذا اختبارُ شكلٍ لا اختبارُ سلوك
 *
 * المالكُ يكتب عربيّةً. وبتخطيطٍ عربيٍّ يعطي المفتاحُ الذي عليه «J»
 * الحرفَ «ت»، والذي عليه «A» يعطي «ش». **فمقارنةُ `event.key` تجعل
 * الاختصاراتِ تعمل بالإنجليزيّ وتصمت بالعربيّ** — وصمتٌ لا رسالةَ له
 * يُقرأ «الاختصاراتُ لا تعمل عندي»، ولا يُبلَّغ عنه أصلا.
 *
 * و`event.code` موضعُ المفتاح على اللوح لا الحرفُ الذي يُنتجه، فيعمل في
 * التخطيطين معا.
 *
 * **وهذا لا يُختبَر بتشغيل**: لا لوحَ مفاتيحَ في vitest ولا تخطيطَ لغة.
 * فيُفحَص النصُّ المُرسَل: أيقارن الموضعَ أم الحرف؟ — وهو ما يُشحَن.
 */
describe('اختصاراتُ لوحة المفاتيح', () => {
  /** كتلةُ القرار وحدَها — فلا يُفحَص ما تكتبه أجزاءٌ أخرى من اللوحة. */
  function keyBlock(): string {
    const block = /document\.addEventListener\('keydown'[\s\S]*?\n {4}\}\);/.exec(SCRIPT)
    if (block === null) throw new Error('لم يُعثَر على مستمع لوحة المفاتيح في نصّ اللوحة')
    return block[0]
  }

  it('**تقارن `event.code` لا `event.key`** — فتعمل بالتخطيط العربيّ', () => {
    const block = keyBlock()
    expect(block).toContain('e.code')
    // و`e.key` غيابُه هو المقصود: وجودُه يعني أنّ مقارنةً بالحرف عادت
    expect(block).not.toContain('e.key')
  })

  it('وتُسمّي المفاتيحَ بمواضعها الستّة', () => {
    const block = keyBlock()
    for (const code of ['KeyJ', 'KeyK', 'KeyA', 'KeyR', 'KeyE', 'KeyS', 'Slash']) {
      expect(block).toContain(code)
    }
  })

  /**
   * **وحقلُ الكتابة يملك مفاتيحَه.**
   *
   * من يكتب منشورا عربيّا يطبع «ش» و«ت» و«ق» — وهي مواضعُ A و J و R.
   * فبلا هذا الحارس **يُرفَض المنشورُ وهو يُكتَب**.
   */
  it('ولا تعمل داخل مربّع كتابة', () => {
    const block = keyBlock()
    expect(block).toContain('TEXTAREA')
    expect(block).toContain('INPUT')
    expect(block).toContain('SELECT')
    expect(block).toContain('isContentEditable')
  })

  /** ومركّبةٌ للمتصفّح: Ctrl+R إعادةُ تحميل، لا رفضُ مسوّدة. */
  it('وتترك المركَّبات للمتصفّح', () => {
    const block = keyBlock()
    expect(block).toContain('e.metaKey')
    expect(block).toContain('e.ctrlKey')
    expect(block).toContain('e.altKey')
  })
})

/**
 * المعاينةُ تتبع المربّع (D-090).
 *
 * ## ولماذا يُفحَص الرباطُ لا الشكل
 *
 * قاعدةُ `drafts.ts` منذ أوّل يوم: **النصُّ الذي يراه المالك هو النصُّ
 * الذي يُرسَل**. والمعاينةُ تصويرٌ للمربّع لا نسخةٌ ثانية — **فلو انقطع
 * الرباطُ بقيت تعرض ما لن يُنشَر**، وهو أسوأُ من غيابها: يعتمد المالكُ
 * على ما قرأه فيها وقد بطل.
 *
 * ولا يُختبَر بتشغيل: لا DOM هنا. فيُفحَص النصُّ المُرسَل — أيربط
 * `input` بالمربّع؟ وأيكتب بـ `textContent`؟
 */
describe('المعاينة', () => {
  /**
   * **والتعليقاتُ تُمحى أوّلا** — وهي سنّةُ كلّ مدقّقٍ هنا (D-070 · D-087).
   *
   * وقعت العلّةُ في أوّل صياغةٍ لهذا الاختبار: شرحُ الرباط يقول «نكتب
   * كذا لا innerHTML»، **فوجد الاختبارُ الكلمةَ في شرحِ منعِها** ورسب.
   * وهي علّةُ «var(--ink) في شرحٍ عربيّ» نفسُها.
   */
  function bindBlock(): string {
    const block = /cards\.forEach\(function\(c\)\{[\s\S]*?data-pv-rest[\s\S]*?\n {4}\}\);/.exec(SCRIPT)
    if (block === null) throw new Error('لم يُعثَر على رباط المعاينة في نصّ اللوحة')
    return block[0].replace(/^\s*\/\/.*$/gm, ' ')
  }

  it('**تتبع المربّع عند كلّ حرف** — فلا تعرض ما بطل', () => {
    const block = bindBlock()
    expect(block).toContain("addEventListener('input'")
    expect(block).toContain('textarea.draft-text')
  })

  /**
   * **والنصُّ من المالك يُكتَب نصّا لا وسما.**
   *
   * `innerHTML` يجعل منشورا فيه `<b>` يُعرَض ثخينا في المعاينة **وحرفا
   * على المنصّة** — فتكذب المعاينةُ في عين ما بُنيت له. والحقنُ أبعدُ
   * من ذلك: نصُّ المسوّدة يُولّده نموذج، ومصدرُه مستندُ Drive.
   */
  it('وتكتب textContent لا innerHTML', () => {
    const block = bindBlock()
    expect(block).toContain('textContent')
    expect(block).not.toContain('innerHTML')
  })

  /**
   * والقسمةُ عند أوّل سطرٍ — **وهي القسمةُ التي يرسمها الخادم**.
   *
   * الخادمُ يقسم بـ `split('\n')` ويضع الأوّلَ في `<b>`. والمتصفّحُ يقسم
   * بـ `indexOf`. **ونسختان تفترقان تجعلان السطرَ الأوّل يتبدّل عند أوّل
   * حرفٍ يُكتَب** — والمالكُ يظنّ أنّه غيّر شيئا ولم يغيّره.
   */
  it('وتقسم عند أوّل سطرٍ كما يقسم الخادم', () => {
    const block = bindBlock()
    expect(block).toContain("indexOf('\\n')")
    // والباقي يحمل السطرَ الفاصلَ معه، فلا يلتصق بما قبله
    expect(block).toContain('t.slice(nl)')
  })
})

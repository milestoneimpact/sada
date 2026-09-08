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
 * الاختصاراتُ تُقاس بموضع المفتاح لا بحرفه (D-100).
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
 * المعاينةُ تتبع المربّع (D-100).
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
   * **والتعليقاتُ تُمحى أوّلا** — وهي سنّةُ كلّ مدقّقٍ هنا (D-070 · D-097).
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

/**
 * **مواعيدُ الجدولة تُنتزَع وتُشغَّل** (D-089).
 *
 * الأزرارُ تحسب لحظةً **محلّيّة** ثمّ تكتبها في الصندوق **UTC**. وبين
 * الاثنين تحويلٌ يخطئ في أربعة مواضع لا يكشفها النظر: آخرُ الشهر،
 * وآخرُ السنة، وتحوّلُ التوقيت الصيفيّ، **والأحدُ حين يكون اليومَ**.
 *
 * فتُنتزَع الدوالُّ من النصّ المُرسَل — لا من نسخةٍ هنا — وتُشغَّل.
 * **ونسخةٌ ثانيةٌ في الاختبار تفترق بلا حارس** (D-071).
 */
function clientPresets(): {
  utcBox: (d: Date) => string
  preset: (now: Date, kind: string) => Date | null
  boxToDate: (v: string) => Date | null
} {
  const parts = [
    /function pad2\(n\)\{[\s\S]*?\}\n/.exec(SCRIPT),
    /function utcBox\(d\)\{[\s\S]*?\n {2}\}\n/.exec(SCRIPT),
    /function localAt\(now,days,hour\)\{[\s\S]*?\n {2}\}\n/.exec(SCRIPT),
    /function preset\(now,kind\)\{[\s\S]*?\n {2}\}\n/.exec(SCRIPT),
    /function boxToDate\(v\)\{[\s\S]*?\n {2}\}\n/.exec(SCRIPT),
  ]
  if (parts.some((p) => p === null)) {
    throw new Error('لم تُعثَر دوالُّ المواعيد في نصّ اللوحة — أنُقلت أم أُعيدت تسميتُها؟')
  }
  return new Function(
    `${parts.map((p) => p![0]).join('')}\nreturn {utcBox:utcBox,preset:preset,boxToDate:boxToDate};`,
  )() as ReturnType<typeof clientPresets>
}

describe('مواعيدُ بضغطةٍ واحدة (D-089)', () => {
  const { utcBox, preset, boxToDate } = clientPresets()

  it('«بعد ساعة» ساعةٌ بالضبط', () => {
    const now = new Date('2026-09-07T10:17:33Z')
    const at = preset(now, 'hour')!
    expect(at.getTime() - now.getTime()).toBe(3_600_000)
  })

  it('وكلُّ موعدٍ في المستقبل — مهما كانت الساعة', () => {
    // أربعٌ وعشرون لحظةً في اليوم: لا واحدةَ منها تعطي موعدا مضى
    for (let hour = 0; hour < 24; hour += 1) {
      const now = new Date(2026, 8, 7, hour, 31, 0)
      for (const kind of ['hour', 'tonight', 'tomorrow', 'sunday']) {
        const at = preset(now, kind)!
        expect(at.getTime(), `${kind} عند ${hour}`).toBeGreaterThan(now.getTime())
      }
    }
  })

  it('و«الأحد» أحدٌ فعلا — ولو كان اليومُ أحدا', () => {
    // ٦ سبتمبر ٢٠٢٦ أحد. فالزرُّ يعطي الأحدَ القادم لا اليوم
    for (let day = 6; day <= 12; day += 1) {
      const now = new Date(2026, 8, day, 11, 0, 0)
      const at = preset(now, 'sunday')!
      expect(at.getDay()).toBe(0)
      expect(at.getHours()).toBe(9)
      expect(at.getTime()).toBeGreaterThan(now.getTime())
    }
  })

  it('و«الليلة ٨م» تصير الغدَ بعد الثامنة', () => {
    const before = preset(new Date(2026, 8, 7, 19, 0, 0), 'tonight')!
    expect(before.getDate()).toBe(7)
    const after = preset(new Date(2026, 8, 7, 21, 0, 0), 'tonight')!
    expect(after.getDate()).toBe(8)
    expect(after.getHours()).toBe(20)
  })

  it('والصندوقُ يُكتب UTC — والصيغةُ هي التي يقرؤها الخادم', () => {
    const box = utcBox(new Date(Date.UTC(2026, 8, 7, 6, 5)))
    expect(box).toBe('2026-09-07T06:05')
    expect(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(box)).toBe(true)
  })

  it('وما كُتب يُقرأ كما كُتب — ذهابا وإيابا', () => {
    for (const kind of ['hour', 'tonight', 'tomorrow', 'sunday']) {
      const at = preset(new Date(2026, 8, 7, 14, 22, 0), kind)!
      const back = boxToDate(utcBox(at))!
      // الصندوقُ بدقّة الدقيقة، فالثواني تسقط ولا شيءَ غيرها
      expect(Math.abs(back.getTime() - at.getTime())).toBeLessThan(60_000)
    }
  })

  it('وصندوقٌ فارغٌ أو مشوَّهٌ لا يُقرأ لحظةً كاذبة', () => {
    for (const bad of ['', 'غدا', '2026-13-40T99:99', '2026-09-07']) {
      expect(boxToDate(bad)).toBe(null)
    }
  })
})

describe('شريطُ المواعيد في الصفحة', () => {
  it('الأزرارُ تملأ الحقلَ الذي يُرسَل — لا حقلا آخر', () => {
    expect(SCRIPT).toContain("document.getElementById(bar.dataset.quick)")
    expect(SCRIPT).toContain('field.value=utcBox(at)')
  })

  it('والمرآةُ تُحدَّث على الكتابة اليدويّة كذلك', () => {
    expect(SCRIPT).toContain("field.addEventListener('input',reflect)")
  })

  it('وسقوطُ التنسيق المحلّيّ لا يُسقِط الصفحة', () => {
    expect(SCRIPT).toContain("catch(e){mirror.textContent='';}")
  })
})

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
import { SCRIPT } from './ui/panelScript'
import { xWeightedLength } from '../lib/draft/length'
import { presetAt, PRESETS } from '../lib/time/local'
import { cutTitle } from '../lib/media/uploads'

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
/**
 * ‏**ومرساةُ جزءٍ من بطاقةٍ تنزل إلى البطاقة حين لا يُرسَم الجزء** (ر-6): «#s-…» نموذجُ
 * ‏الجدولة لا يُرسَم لمعتمَدٍ بلا قناة، و«#i-…» لوحُ الصورة لا يُرسَم لمن له صورة. ومرساةٌ
 * ‏لا تجد شيئًا كانت ترتدّ إلى الرئيسيّة — فيُقرأ الرابطُ معطوبًا. فتُنتزَع الدالّةُ وتُشغَّل.
 */
describe('مرساةُ الجزء ترجع إلى بطاقتها', () => {
  const fn = /function target\(id\)\{[\s\S]*?\n {2}\}\n/.exec(SCRIPT)
  const run = (ids: readonly string[], id: string): string | null => {
    if (fn === null) throw new Error('لم تُعثَر target في نصّ اللوحة — أنُقلت؟')
    const document = { getElementById: (x: string) => (ids.includes(x) ? { id: x } : null) }
    const target = new Function('document', `${fn[0]}\nreturn target`)(document) as (id: string) => { id: string } | null
    return target(id)?.id ?? null
  }

  it('الجزءُ إن رُسم، وإلّا بطاقتُه', () => {
    expect(run(['d-p1', 's-p1'], 's-p1')).toBe('s-p1')
    expect(run(['d-p1'], 's-p1')).toBe('d-p1')
    expect(run(['d-p1'], 'i-p1')).toBe('d-p1')
  })

  it('ولا يُخترَع لغير الأجزاء — «#write» تُطلَب كما هي', () => {
    expect(run(['d-rite'], 'write')).toBeNull()
    expect(run(['write'], 'write')).toBe('write')
  })
})

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
 * **والإشعارُ يطفو ويُغلَق** (الخطّة 7.8، رحلتا R-4 وR-5).
 *
 * الفعلُ يعود إلى بطاقته في وسط اللوح، والإشعارُ كان في رأس المحتوى: «الملفُّ ليس
 * UTF-8» عند ‏-5747px. فيُنتزَع سلوكُه من النصّ المُرسَل ويُشغَّل على صفحةٍ مصغَّرة
 * بساعةٍ يملكها الاختبار — المهلةُ والإيقافُ والإغلاقُ والخطأُ الذي لا يذهب وحدَه.
 */
describe('الإشعارُ العائم', () => {
  // ‏حتّى نداء «armToast» للإشعار الذي جاء مع الصفحة (D-207: صار دالّةً يُعاد تسليحُها بعد فعلٍ بلا تحميل)
  const block = /  var flashBox=document\.getElementById\('flash'\);[\s\S]*?if\(note0\)armToast\(note0,false\);\n {2}\}\n/.exec(SCRIPT)

  function mount(kind: 'ok' | 'warn' | 'bad', undo = false, hash = '') {
    const on: Record<string, () => void> = {}
    const attrs: Record<string, string> = {}
    const box = new Set<string>()
    // ‏`attached`: أفي المنطقة الحيّة الآن — يُفصَل ليُعاد إدراجُه فيُعلَن، ويُفصَل حين يُغلَق
    const state = {
      attached: true, inserts: 0, appended: [] as Record<string, unknown>[],
      focused: null as string | null, focusOpts: null as unknown, tabindex: null as string | null,
    }
    const flash = {
      classList: { add: (c: string) => box.add(c) },
      querySelector: () => note,
      removeChild: () => { state.attached = false },
      appendChild: () => { state.attached = true; state.inserts += 1 },
    }
    const note = {
      classList: { contains: (c: string) => c === kind },
      setAttribute: (k: string, v: string) => { attrs[k] = v },
      appendChild: (c: Record<string, unknown>) => { state.appended.push(c) },
      querySelector: (sel: string) => (sel === 'form' && undo ? {} : null),
      addEventListener: (ev: string, fn: () => void) => { on[ev] = fn },
      get parentNode() { return state.attached ? flash : null },
    }
    const card = {
      tabIndex: -1,
      setAttribute: (k: string, v: string) => { if (k === 'tabindex') state.tabindex = v },
      focus: (o: unknown) => { state.focused = 'card'; state.focusOpts = o },
    }
    const document = {
      getElementById: (id: string) => (id === 'flash' ? flash : null),
      createElement: () => {
        const el: Record<string, unknown> = {}
        el['setAttribute'] = (k: string, v: string) => { el[k] = v }
        el['addEventListener'] = (ev: string, fn: () => void) => { el[`on${ev}`] = fn }
        return el
      },
    }
    // ‏و`target` من السكربت نفسِه: «#s-…» و«#d-…» إلى البطاقة
    const target = (id: string) => (id === 'd-p1' ? card : null)
    // ‏ساعةٌ يملكها الاختبار: لا انتظارَ حقيقيّ، ولا مؤقّتَ يتسرّب إلى غيره
    let clock = 0
    let seq = 0
    const timers = new Map<number, { at: number; fn: () => void }>()
    const setT = (fn: () => void, ms: number): number => { seq += 1; timers.set(seq, { at: clock + ms, fn }); return seq }
    const clearT = (id: number): void => { timers.delete(id) }
    const advance = (ms: number): void => {
      clock += ms
      for (const [id, t] of [...timers]) if (t.at <= clock) { timers.delete(id); t.fn() }
    }
    new Function('document', 'setTimeout', 'clearTimeout', 'target', 'location', block![0])(
      document, setT, clearT, target, { hash })
    return { box, attrs, on, state, advance, shut: state.appended[0] as Record<string, unknown> }
  }

  it('يُنتزَع من النصّ المُرسَل', () => {
    expect(block).not.toBeNull()
  })

  it('يطفو، ومعه «أغلق» يُغلقه — وبلا فعلٍ يذهب بعد ستّ ثوانٍ', () => {
    const t = mount('ok')
    expect([...t.box]).toEqual(['toast'])
    expect(t.shut['textContent']).toBe('أغلق')
    expect(t.shut['aria-label']).toBe('أغلق الإشعار')
    t.advance(5999)
    expect(t.state.attached).toBe(true)
    t.advance(1)
    expect(t.state.attached).toBe(false)

    const closed = mount('warn')
    ;(closed.shut['onclick'] as () => void)()
    expect(closed.state.attached).toBe(false)
  })

  /*
   * ‏مراجعة ر-0 · D-100: **«تراجَع» لا عدّادَ له.** كان يذهب بعد عشر ثوانٍ، وهو البابُ الوحيدُ إلى
   * ‏رفضٍ خاطئ، ولوحُ المفاتيح يبلغه بعشرين Shift+Tab. فيبقى حتّى يُغلَق، ويُعلَن، ويعيد «أغلق»
   * ‏التركيزَ إلى البطاقة بلا تمرير — لا إلى `body`.
   */
  it('وما فيه «تراجَع» لا يذهب وحدَه، ويُعاد إدراجُه فيُعلَن، و«أغلق» يعيد التركيزَ إلى البطاقة', () => {
    const t = mount('ok', true, '#d-p1')
    // ‏يُفصَل ثمّ يُدرَج بعد التحميل: إضافةٌ في المنطقة الحيّة يقرؤها قارئُ الشاشة
    expect(t.state.attached).toBe(false)
    t.advance(150)
    expect(t.state.attached).toBe(true)
    expect(t.state.inserts).toBe(1)
    t.advance(600_000)
    expect(t.state.attached).toBe(true)
    expect(t.state.focused).toBeNull()
    ;(t.shut['onclick'] as () => void)()
    expect(t.state.attached).toBe(false)
    expect(t.state.focused).toBe('card')
    expect(t.state.focusOpts).toEqual({ preventScroll: true })
    expect(t.state.tabindex).toBe('-1')
  })

  it('ويقف العدُّ ما دام المؤشّرُ أو التركيزُ عليه، ثمّ يبدأ من جديد', () => {
    const t = mount('ok')
    t.advance(5000)
    t.on['mouseenter']!()
    t.advance(60_000)
    expect(t.state.attached).toBe(true)
    t.on['mouseleave']!()
    t.advance(5999)
    expect(t.state.attached).toBe(true)
    t.on['focusin']!()
    t.advance(60_000)
    expect(t.state.attached).toBe(true)
    t.on['focusout']!()
    t.advance(6000)
    expect(t.state.attached).toBe(false)
  })

  it('**والخطأُ لا يذهب وحدَه** — يُعلَن تنبيهًا ويبقى حتّى يُغلَق', () => {
    const t = mount('bad')
    expect(t.attrs['role']).toBe('alert')
    t.advance(600_000)
    expect(t.state.attached).toBe(true)
    expect(t.state.inserts).toBe(1)
    ;(t.shut['onclick'] as () => void)()
    expect(t.state.attached).toBe(false)
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
  localBox: (d: Date) => string
  preset: (now: Date, kind: string) => Date | null
  boxToDate: (v: string) => Date | null
} {
  const parts = [
    /function pad2\(n\)\{[\s\S]*?\}\n/.exec(SCRIPT),
    /function localBox\(d\)\{[\s\S]*?\n {2}\}\n/.exec(SCRIPT),
    /function localAt\(now,days,hour\)\{[\s\S]*?\n {2}\}\n/.exec(SCRIPT),
    /function preset\(now,kind\)\{[\s\S]*?\n {2}\}\n/.exec(SCRIPT),
    /function boxToDate\(v\)\{[\s\S]*?\n {2}\}\n/.exec(SCRIPT),
  ]
  if (parts.some((p) => p === null)) {
    throw new Error('لم تُعثَر دوالُّ المواعيد في نصّ اللوحة — أنُقلت أم أُعيدت تسميتُها؟')
  }
  return new Function(
    `${parts.map((p) => p![0]).join('')}\nreturn {localBox:localBox,preset:preset,boxToDate:boxToDate};`,
  )() as ReturnType<typeof clientPresets>
}

describe('مواعيدُ بضغطةٍ واحدة (D-089)', () => {
  const { localBox, preset, boxToDate } = clientPresets()

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

  it('والصندوقُ يُكتب بتوقيت المتصفّح (D-199) — والصيغةُ هي التي يقرؤها الخادم', () => {
    const box = localBox(new Date(2026, 8, 7, 6, 5))
    expect(box).toBe('2026-09-07T06:05')
    expect(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(box)).toBe(true)
  })

  it('وما كُتب يُقرأ كما كُتب — ذهابا وإيابا', () => {
    for (const kind of ['hour', 'tonight', 'tomorrow', 'sunday']) {
      const at = preset(new Date(2026, 8, 7, 14, 22, 0), kind)!
      const back = boxToDate(localBox(at))!
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
    expect(SCRIPT).toContain('field.value=localBox(at)')
  })

  it('والمرآةُ تُحدَّث على الكتابة اليدويّة كذلك', () => {
    expect(SCRIPT).toContain("field.addEventListener('input',reflect)")
  })

  it('وسقوطُ التنسيق المحلّيّ لا يُسقِط الصفحة', () => {
    expect(SCRIPT).toContain("catch(e){mirror.textContent='';}")
  })
})

/**
 * **وأزرارُ صفّ المقطع تحسب كما تحسب أزرارُ البطاقة** (ر-4).
 *
 * تلك تحسب في المتصفّح وتكتب UTC في صندوق، وهذه ترسل اسمَ الموعد ويحسبه الخادمُ بتوقيت
 * المالك من كعكته. **ونسختان تفترقان بلا حارس** (D-071): «غدًا 9:00 ص» في موضعٍ يصير
 * العاشرةَ في الآخر. فتُشغَّل الاثنتان بمنطقة بيئة الاختبار وتُقارَنان.
 */
describe('أزرارُ المقطع على الخادم توافق أزرارَ البطاقة في المتصفّح', () => {
  const { preset } = clientPresets()
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone

  it('الأربعةُ نفسُها، والموعدُ نفسُه في كلّ ساعةٍ من اليوم', () => {
    expect(PRESETS.map((p) => p.kind)).toEqual(['hour', 'tonight', 'tomorrow', 'sunday'])
    for (let day = 4; day <= 10; day += 1) {
      for (let hour = 0; hour < 24; hour += 1) {
        const now = new Date(2026, 9, day, hour, 31, 0)
        for (const { kind } of PRESETS) {
          const client = preset(now, kind)!
          const server = presetAt(kind, now, zone)!
          // ‏والخادمُ بدقّة الدقيقة: «بعد ساعة» تُقصّ ثوانيها
          expect(Math.abs(server.getTime() - client.getTime()), `${kind} يوم ${day} ساعة ${hour}`).toBeLessThan(60_000)
        }
      }
    }
  })
})

/** **وعدّادُ عنوان YouTube يعدّ كما يقصّ الرفع** (ر-4). */
describe('عدّادُ عنوان YouTube', () => {
  function ytLine(): (v: string) => string {
    const fn = /function ytLine\(v\)\{[^\n]*\}/.exec(SCRIPT)
    if (fn === null) throw new Error('لم يُعثَر على ytLine في نصّ اللوحة')
    return new Function(`${fn[0]}\nreturn ytLine`)() as (v: string) => string
  }

  it('يتجاوز الحدَّ حيث يقصّ الخادمُ وحده', () => {
    const line = ytLine()
    for (const text of ['', 'قصير', `  ${'ع'.repeat(100)}  \nوصف`, `${'ع'.repeat(101)}\nوصف`, `${'كلمة '.repeat(30)}`, '\n\nسطرٌ بعد فراغ']) {
      expect(line(text).length > 100, JSON.stringify(text.slice(0, 20))).toBe(cutTitle(text) !== null)
    }
  })

  it('ويُخفى إن أُزيل اختيارُ YouTube، ويقول القصَّ بكلمة لا بلونٍ وحده', () => {
    expect(SCRIPT).toContain("input[name=platform][value=youtube]")
    expect(SCRIPT).toContain('يُقصّ عند')
  })
})

describe('ملفُّ الخطّة يُقرأ فورَ اختياره (ر-5)', () => {
  it('اسمُه في اللصيقة ثمّ يُرسَل النموذجُ بحارسه', () => {
    expect(SCRIPT).toContain("document.querySelectorAll('input[data-plan-file]')")
    expect(SCRIPT).toContain('pick.textContent=f.name')
    expect(SCRIPT).toContain('form.requestSubmit()')
  })
})

/*
 * ‏**مراجعةُ D-190**: المربّعاتُ قد تكون كلُّها فارغة (غيرُ المتّصلة لا تُؤشَّر) فيُمنع الإرسالُ
 * ‏هنا بسببه — **قبل معالج «مشغول»** الذي يقرأ `defaultPrevented`؛ وEnter في عنوان YouTube لا
 * ‏يُنشئ؛ وعدّادُ كلّ حقلٍ يعدّ كما يعدّ الخادم (`captionProblem`).
 */
describe('حرّاسُ «أنشئ» و«اكتب» (مراجعة D-190)', () => {
  it('الإرسالُ بلا منصّةٍ يُمنع ويُقال في موضعه — مسجَّلًا قبل «مشغول»', () => {
    const guard = SCRIPT.indexOf("input[type=checkbox][name=platform]:not([disabled])")
    expect(guard).toBeGreaterThan(0)
    expect(guard).toBeLessThan(SCRIPT.indexOf("document.querySelectorAll('form[data-busy]')"))
    expect(SCRIPT).toContain("f.querySelector('[data-pick-msg]')")
    expect(SCRIPT).toContain('اختر منصّةً واحدةً على الأقلّ')
  })

  it('وEnter في عنوان YouTube لا يُرسل النموذج', () => {
    expect(SCRIPT).toContain("document.querySelectorAll('input[name=title_youtube]')")
    expect(SCRIPT).toContain("if(e.key==='Enter')e.preventDefault();")
  })

  it('وعدّادُ نصّ كلّ منصّةٍ يعدّ كما يعدّ الخادم: المحرفُ لـ TikTok وInstagram والبايتُ لوصف YouTube', () => {
    const enc = /var enc=[^\n]*\n/.exec(SCRIPT)
    const fn = /function capLen\(v,bytes\)\{[^\n]*\}/.exec(SCRIPT)
    expect(enc).not.toBeNull()
    expect(fn).not.toBeNull()
    const capLen = new Function(`${enc![0]}${fn![0]}; return capLen;`)() as (v: string, bytes: boolean) => number
    for (const text of ['', 'نصّ', 'أوّلُ مئة يوم 👇 #قيادة', 'ن'.repeat(2300)]) {
      const t = text.trim()
      expect(capLen(t, false)).toBe(t.length)
      expect(capLen(t, true)).toBe(new TextEncoder().encode(t).length)
    }
    expect(SCRIPT).toContain("document.querySelectorAll('textarea[data-cap-limit]')")
  })
})

/**
 * **أفعالُ البطاقة بلا تحميل** (D-207) — والمتصفّحُ الحقيقيُّ يقيسها `npm run swap`. وهنا ما لا يجوز أن يرجع:
 * طلبٌ يُعاد إرسالُه بعد أن خرج، أو تحويلٌ يُتبَع آليًّا فيُقرأ ردُّه صفحةً غيرَ اللوحة.
 */
describe('أفعالُ البطاقة بلا تحميل (D-207)', () => {
  const block = /document\.addEventListener\('submit',function\(e\)\{[\s\S]*?\n {2}\}\);/.exec(SCRIPT)?.[0] ?? ''

  it('يُنتزَع من النصّ المُرسَل، ولا يعمل إلّا على «data-swap» وما لم يُمنع', () => {
    expect(block).toContain("f.hasAttribute('data-swap')")
    expect(block).toContain('e.defaultPrevented')
  })

  it('**ولا إرسالَ ثانيًا**: التحويلُ يُقرأ يدويًّا، والسقوطُ يعيد تحميلَ اللوحة بـGET', () => {
    expect(block).toContain("redirect:'manual'")
    expect(block).toContain("fetch('/panel',{credentials:'same-origin'})")
    expect(block).not.toMatch(/\.submit\(|submit\.call/)
    expect(block).toContain('location.reload()')
  })

  it('وردٌّ ليس لوحةً (جلسةٌ انتهت) يُفتح كما هو', () => {
    expect(block).toContain("if(!doc.querySelector('section[data-pane]')){location.href=res.url; return;}")
  })
})

/**
 * **بلا اتّصال ونصُّ الجهاز** (خطّة التصميم 7.11 · D-209) — والمتصفّحُ يقيسهما `npm run swap`.
 * وهنا ما أمسكه الفحصُ الحيّ: «function say» عُرّفت فغلبها «var say» لمفاتيح المرور في النطاق نفسِه، فلم يظهر
 * «عاد الاتّصال». فلا اسمَ دالّةٍ يُعاد إعلانُه في السكربت.
 */
describe('بلا اتّصال ونصُّ الجهاز (D-209)', () => {
  it('لا اسمٌ يُعلَن مرّتين في نطاق السكربت', () => {
    const names = [...SCRIPT.matchAll(/(?:^|\n) {2}(?:function (\w+)\(|var (\w+)=function)/g)].map((m) => m[1] ?? m[2])
    const twice = names.filter((n, i) => names.indexOf(n) !== i)
    expect(twice).toEqual([])
  })

  it('الشريطُ بالحدثين، والأزرارُ التي عطّلها وحدَها تعود، ولا إرسالَ تلقائيّ', () => {
    expect(SCRIPT).toContain("window.addEventListener('offline'")
    expect(SCRIPT).toContain("window.addEventListener('online',function(){setOffline(false); toastSay('ok','عاد الاتّصال.');});")
    expect(SCRIPT).toContain("document.querySelectorAll('button[data-off]')")
  })

  it('ونصُّ المحرّر وحدَه في «sada-draft:<id>»، بعد ثانيتين من الكتابة، ويُمحى إن ساوى نصَّ الخادم', () => {
    expect(SCRIPT).toContain("var dKey='sada-draft:'+edBox.dataset.post")
    expect(SCRIPT).toContain('JSON.stringify({t:edT.value,at:Date.now()}));}catch(e){}},2000)')
    expect(SCRIPT).toContain('if(kept.t===edT.value){try{localStorage.removeItem(dKey);}catch(e){}}')
  })
})

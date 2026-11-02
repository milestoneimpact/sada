/**
 * لوحةُ الأوامر (D-105) — **وما يُختبَر هو الحدُّ لا الشكل**.
 *
 * وثلاثةٌ تُحرَس هنا لأنّ خرقَها لا يُرى:
 *
 * ١ · **لا فعلَ يقع من اللوحة** — نموذجٌ واحدٌ فيها يخالف D-006 و D-008
 *     و D-009 معا، **ويُنفَّذ بضغطةٍ عمياءَ على قائمةٍ تُصفَّى بالكتابة**.
 * ٢ · **الرافدةُ واللوحةُ من جدولٍ واحد** — وقسمٌ يسقط من أحدهما لا
 *     يُشتكى منه: يبدو نقصَ فهرسةٍ لا عطلا.
 * ٣ · **طبعُ الخادم يوافق طبعَ المتصفّح** — نسختان تفترقان تجعلان البحثَ
 *     يجد في الخادم ما لا يجده في اليد، وهي علّةُ عدّاد D-071 نفسُها.
 */
import { describe, expect, it } from 'vitest'
import { railHtml } from './rail'
import { uiScript } from '../../lib/ui/asset'
import {
  buildCommands, commandPalette, commandTrigger, COMMAND_SCRIPT,
  DRAFT_CAP, normalize, searchKey, SECTIONS,
} from './command'
import { shell } from './shell'
import { STYLE } from './styles'
import { sheet } from '../../test/css'

describe('الطبع — والمالك يكتب همزتَه كما شاء', () => {
  it('يطوي صور الألف والياء والتاء المربوطة', () => {
    expect(normalize('الأقسام')).toBe(normalize('الاقسام'))
    expect(normalize('إعداد')).toBe(normalize('اعداد'))
    expect(normalize('منصّة')).toBe(normalize('منصه'))
    expect(normalize('على')).toBe(normalize('علي'))
  })

  it('ويحذف التشكيل والتطويل — ولا يقارن حركةً بحركة', () => {
    expect(normalize('المُسوَّدَة')).toBe(normalize('المسوده'))
    expect(normalize('مـــصادر')).toBe(normalize('مصادر'))
  })

  it('واللاتينيّ يُصغَّر — فمن كتب SOURCES وجدها', () => {
    expect(normalize('SOURCES')).toBe('sources')
  })
})

/**
 * **وطبعُ المتصفّح يُنتزَع من النصّ المُرسَل لا من نسخةٍ هنا** — كما
 * فُعل بعدّاد X في D-071. فما يُختبَر هو ما يُشحَن.
 */
describe('وطبع المتصفّح يوافق طبع الخادم', () => {
  const clientNorm = (): ((s: string) => string) => {
    const strip = /var STRIP=new RegExp\([^\n]*\n/.exec(COMMAND_SCRIPT)
    const fold = /var FOLD=[\s\S]*?\n {2}\}\);\n/.exec(COMMAND_SCRIPT)
    const norm = /function norm\(s\)\{[\s\S]*?\n {2}\}\n/.exec(COMMAND_SCRIPT)
    if (strip === null || fold === null || norm === null) {
      throw new Error('لم يُعثَر على الطبع في نصّ اللوحة — أنُقل أم أُعيدت تسميتُه؟')
    }
    return new Function(`${strip[0]}${fold[0]}${norm[0]}return norm`)() as (s: string) => string
  }

  const CASES = ['الأقسام', 'منصّة', 'المُسوَّدَة', 'مـــصادر', 'SOURCES', 'امسح Drive', 'على', '']

  it.each(CASES.map((c) => [c || '(فارغ)', c]))('يتّفقان على: %s', (_l, text) => {
    expect(clientNorm()(text as string)).toBe(normalize(text as string))
  })

  /** **والجدولُ يخرج في النصّ من مصدره** لا مكتوبا فيه فيشيخ وحدَه. */
  it('وجدول الطيّ مُسلسَل في النصّ لا منسوخ فيه', () => {
    expect(COMMAND_SCRIPT).toContain('["أإآٱ","ا"]')
  })
})

describe('الفهرس — ولا فعل يقع من هنا', () => {
  /**
   * **وأخطرُ ما يمكن أن يُضاف غدا زرُّ تنفيذ.**
   *
   * لوحةُ أوامرٍ تنفّذ تبدو أنفعَ، **وهي التي تُنفق بضغطةٍ عمياء**:
   * `D-006` يمنع الإنفاقَ الآليّ، و`D-008` يوجب تسجيلَ ما يُدفَع قبل
   * أن يُعدّ ناجحا، و`D-009` يوجب اعتمادا بشريّا. فالحدُّ يُحرَس هنا
   * لا في المراجعة.
   */
  it('**ولا نموذج ولا زرّ إرسال في اللوحة كلِّها**', () => {
    const html = commandPalette(buildCommands())
    expect(html).not.toContain('<form')
    expect(html).not.toContain('method="POST"')
    expect(html).not.toContain('type="submit"')
  })

  it('وكلّ مدخل رابط له عنوان', () => {
    for (const c of buildCommands({ onPanel: true })) {
      expect(c.href.length).toBeGreaterThan(0)
    }
  })

  /** **ولا قسمَ يسقط من اللوحة** — الجدولُ واحدٌ لها وللرافدة. */
  it('وكلّ قسم في الجدول له مدخل في اللوحة', () => {
    const labels = buildCommands().map((c) => c.label)
    for (const s of SECTIONS) expect(labels).toContain(s.label)
  })

  it('واللوح يُقصَد بمرساة في اللوحة وبمسار خارجَها', () => {
    const on = buildCommands({ onPanel: true }).find((c) => c.label === 'المنشورات')!
    const off = buildCommands({ onPanel: false }).find((c) => c.label === 'المنشورات')!
    expect(on.href).toBe('#posts')
    expect(off.href).toBe('/panel#posts')
  })

  /** **وصفحةٌ مستقلّةٌ مسارُها مسارٌ في الحالين** — ولا مرساةَ لها. */
  it('و«النتائج» مسار التقرير في اللوحة وخارجَها سواء (D-204)', () => {
    for (const onPanel of [true, false]) {
      const r = buildCommands({ onPanel }).find((c) => c.label === 'النتائج')!
      expect(r.href).toBe('/panel/report')
    }
  })

  it('والفعل يُسمّى بفعله — «امسح Drive» لا «قسم المصادر»', () => {
    const labels = buildCommands().map((c) => c.label)
    expect(labels).toContain('امسح Drive')
    expect(labels).toContain('اربط قناةً جديدة')
  })

  /*
   * ‏**والأبوابُ الثلاثةُ إلى بطاقاتها لا إلى رأس اللوح** (الخطّة 5.1، ر-2): «اكتب» و«ارفع
   * ‏فيديو» و«خطّة من ملفّ» كانت غائبةً، لأنّ الأفعالَ لا تقبل إلّا معرّفاتِ الأقسام.
   */
  it('و«اكتب» و«ارفع فيديو» و«خطّة من ملفّ» تنزل إلى بطاقاتها، في اللوحة وخارجها', () => {
    for (const [label, anchor] of [['اكتب منشورًا من مصدر', 'write'], ['ارفع فيديو', 'videos']]) {
      expect(buildCommands({ onPanel: true }).find((c) => c.label === label)?.href).toBe(`#${anchor}`)
      expect(buildCommands({ onPanel: false }).find((c) => c.label === label)?.href).toBe(`/panel#${anchor}`)
    }
    // ‏و«خطّة من ملفّ» صارت «عندي خطّة» بشاشتها (D-287): الصيغُ كلُّها، والتسكينُ في المراجعة
    expect(buildCommands({ onPanel: true }).find((c) => c.label === 'عندي خطّة')?.href).toBe('/panel/plan/import')
  })
})

describe('المسوّدات — ثمان لا كلُّها (D-101)', () => {
  const many = Array.from({ length: 30 }, (_, i) => ({
    id: `p${i}`, platform: 'linkedin', text: `مسوّدة رقم ${i}`,
  }))

  it('والفهرس لا يُترك ينمو مع كلّ منشور', () => {
    const rows = buildCommands({ onPanel: true, drafts: many })
      .filter((c) => c.group === 'المسوّدات')
    expect(rows).toHaveLength(DRAFT_CAP)
  })

  /** **وتذهب إلى رحلتها لا إلى قائمتها** (D-104). */
  it('والمسوّدة تقصد رحلتَها', () => {
    const one = buildCommands({ onPanel: true, drafts: many })
      .find((c) => c.group === 'المسوّدات')!
    expect(one.href).toBe('/panel/journey/p0')
  })

  it('والنصّ الطويل يُقصّ سطرا — ولا تُعرَض فقرة في قائمة', () => {
    const long = buildCommands({ onPanel: true, drafts: [{ id: 'a', platform: 'x', text: 'ن'.repeat(400) }] })
      .find((c) => c.group === 'المسوّدات')!
    expect(long.label.length).toBeLessThan(60)
    expect(long.label.endsWith('…')).toBe(true)
  })

  it('**ونصّ مسوّدة يُهرَّب** — ووسم فيه يُعرَض حرفا', () => {
    const html = commandPalette(
      buildCommands({ onPanel: true, drafts: [{ id: 'a', platform: 'x', text: '<img onerror=x>' }] }),
    )
    expect(html).not.toContain('<img onerror')
    expect(html).toContain('&lt;img')
  })

  it('ومعرّف فيه محرف خاصّ يُرمَّز في المسار', () => {
    const one = buildCommands({ onPanel: true, drafts: [{ id: 'a/b?c', platform: 'x', text: 'ن' }] })
      .find((c) => c.group === 'المسوّدات')!
    expect(one.href).toBe('/panel/journey/a%2Fb%3Fc')
  })
})

describe('مفتاح البحث — يُطبَّع مرّةً في الخادم', () => {
  it('يجمع الاسم والسطر والمجموعة والمرادف اللاتينيّ', () => {
    const c = buildCommands().find((x) => x.label === 'المكتبة')!
    const k = searchKey(c)
    expect(k).toContain('drive')
    expect(k).toContain(normalize('المكتبة'))
    // ‏والاسمُ القديمُ مرادفٌ يُبحث به (D-204): من كتب «المصادر» يجد المكتبة
    expect(k).toContain(normalize('مصادر'))
  })

  it('وهو مطبوع لا خام — فالمقارنة لا تطبع مع كلّ ضغطة', () => {
    const c = buildCommands().find((x) => x.label === 'المنشورات')!
    expect(searchKey(c)).toBe(normalize(searchKey(c)))
  })
})

describe('النصّ البرمجيّ — وقواعد اللوحة تُوَرَّث', () => {
  it('يُبنى دالّةً بلا خطأ صياغة', () => {
    expect(() => new Function(COMMAND_SCRIPT)).not.toThrow()
  })

  /** **بموضع المفتاح لا بحرفه** (D-100): لوحةٌ عربيّةٌ تعطي حرفا آخر. */
  it('**والاختصار بموضع المفتاح لا بحرفه**', () => {
    expect(COMMAND_SCRIPT).toContain("e.code==='KeyK'")
    expect(COMMAND_SCRIPT).not.toContain("e.key==='k'")
    expect(COMMAND_SCRIPT).not.toContain("e.key==='K'")
  })

  /** **ولا `innerHTML`** (D-071): العميلُ يُخفي ويُظهر ولا يبني وسما. */
  it('ولا يبني وسما في المتصفّح', () => {
    const bare = COMMAND_SCRIPT.replace(/^\s*\/\/.*$/gm, ' ')
    expect(bare).not.toContain('innerHTML')
    expect(bare).not.toContain('outerHTML')
    expect(bare).not.toContain('document.write')
  })

  it('وتُغلَق بـ Esc', () => {
    expect(COMMAND_SCRIPT).toContain("e.key==='Escape'")
  })

  /** **والتركيزُ يعود من حيث جاء** — وقفزُه يُفقِد قارئَ الشاشة موضعَه. */
  it('ويعيد التركيز إلى ما كان عليه قبل الفتح', () => {
    expect(COMMAND_SCRIPT).toContain('from=document.activeElement')
    expect(COMMAND_SCRIPT).toContain('from.focus()')
  })
})

/**
 * شريطُ الجوّال (D-107) — **والخمسةُ تُعلَّم في الجدول لا في قائمةٍ ثانية.**
 *
 * قائمةٌ ثانيةٌ تُبنى للشريط **تشيخ وحدَها**: قسمٌ يُضاف غدا يدخل الرافدةَ
 * واللوحةَ ولا يدخلها، **ولا حارسَ يمسك غيابا**.
 */
describe('شريط الجوّال — خمسة في اليد: أربع وجهات و«المزيد» (D-204)', () => {
  it('**وأربع وجهات لا أقلّ ولا أكثر**، والخامسة «المزيد»', () => {
    expect(SECTIONS.filter((s) => s.bar === true)).toHaveLength(4)
  })

  /** والرافدةُ سبعةُ عناصر (خطّة التصميم 5.1): الوجهاتُ الخمس، ثمّ «ما عليك» و«الإعدادات». */
  it('**وسبعة في الرافدة** بترتيب الخطّة', () => {
    expect(SECTIONS.map((s) => s.label)).toEqual(
      ['الرئيسيّة', 'المنشورات', 'المكتبة', 'النتائج', 'الحسابات', 'ما عليك', 'الإعدادات'])
  })

  /** والخمسةُ هي التي تُفتَح كلَّ يوم — لا الضبطُ الذي يُفتَح مرّة. */
  it('وهي أقسام العمل اليوميّ', () => {
    const bar = SECTIONS.filter((s) => s.bar === true).map((s) => s.id)
    expect(bar).toEqual(['overview', 'posts', 'library', 'results'])
  })

  /**
   * **وما ليس في الشريط يُبلَغ من «المزيد»** — وهو بابُ اللوحة لا
   * قائمةٌ ثالثة. فالتسعةُ كلُّها مفهرَسةٌ فيها أصلا.
   */
  it('وكلّ ما خرج من الشريط في اللوحة', () => {
    const labels = buildCommands({ onPanel: true }).map((c) => c.label)
    for (const s of SECTIONS.filter((x) => x.bar !== true)) {
      expect(labels).toContain(s.label)
    }
  })

  /** **وزرّان لا زرّ**: العلويُّ و«المزيد» — ومعرّفٌ واحدٌ يُعطِّل الثاني. */
  it('**والنصّ يربط بالصنف لا بالمعرّف**', () => {
    expect(COMMAND_SCRIPT).toContain(".querySelectorAll('.cmdk-open')")
    expect(COMMAND_SCRIPT).not.toContain("getElementById('cmdk-open')")
    expect(commandTrigger()).toContain('class="cmdk-open"')
    expect(railHtml({ inPanel: true })).toContain('<button type="button" class="cmdk-open" aria-haspopup="dialog"')
  })

  /** و«المزيد» قائمةٌ لا بحث (خطّة التصميم 5.3 · D-208): ما ليس في الشريط بأعداده، ويعمل بلا سكربت. */
  it('و«المزيد» ورقة فيها الحسابات وما عليك والإعدادات، وعددُها مجموعُها', () => {
    const html = railHtml({ inPanel: true, counts: { accounts: 1, tasks: 4, settings: 0 } })
    const sheet = html.slice(html.indexOf('<details class="more-sheet">'), html.indexOf('</details>') + 10)
    expect(sheet).toContain('<summary>')
    expect(sheet).toMatch(/<span>المزيد<\/span><span class="count">5<\/span><\/summary>/)
    expect([...sheet.matchAll(/<a href="([^"]+)"/g)].map((m) => m[1])).toEqual(['/panel/accounts', '/panel/tasks', '/panel/settings'])
    expect(sheet).toContain('بحث وأوامر')
    expect(sheet).not.toMatch(/<(details|button)[^>]* hidden[ >]/)
  })
})

describe('التركيب — واللوحة لا تُركَّب نصف تركيب', () => {
  const one = { label: 'أ', note: 'ب', href: '/x', group: 'ج', icon: '<svg></svg>' }

  it('**من مرّر الفهرس نال الجسد والنصّ معا**', () => {
    const html = shell('ت', '<p>x</p>', 'n1', '', { commands: [one] })
    expect(html).toContain('id="cmdk"')
    // النصُّ في الأصل العامّ الذي تربطه كلُّ صفحة (D-153)
    expect(html).toContain(`src="${uiScript().path}"`)
    expect(uiScript().body).toContain("e.code==='KeyK'")
  })

  it('ومن لم يمرّره لم ينل واحدا منهما', () => {
    const html = shell('ت', '<p>x</p>', 'n1')
    expect(html).not.toContain('id="cmdk"')
    expect(html).not.toContain('cmdk-q')
  })

  /**
   * **ولا تكسر الصفحةَ إن عُطّل `JavaScript`.**
   *
   * الجسدُ `hidden`، والزرُّ `hidden`، **ولا يرفعهما إلّا النصُّ الذي
   * يجعلهما يعملان**. وزرٌّ يُرى ولا يفتح شيئا عطلٌ يُشتكى منه.
   */
  it('والجسد والزرّ مخفيّان حتّى يعمل النصّ', () => {
    expect(commandPalette([one])).toContain('id="cmdk" hidden')
    expect(commandTrigger()).toContain('hidden')
  })

  /**
   * **و«hidden» تُهزَم صامتةً** — والسمةُ في الوسم لا تكفي.
   *
   * قاعدةُ المتصفّح `[hidden]{display:none}` من أصلٍ أدنى، **وأيُّ قاعدةِ
   * مؤلّفٍ تضع `display` تغلبها**. وحجابُ اللوحة `display:flex`، فظهر
   * على كلّ صفحةٍ عند التحميل **والسمةُ موجودةٌ تُقرأ في المصدر
   * فتُصدَّق** — ولا يُمسَك ذلك إلّا بتشغيلٍ في متصفّح.
   *
   * فأُقفلت مرّةً للكلّ، **ويُحرَس القفلُ هنا**: حذفُه يعيد العلّةَ
   * لكلّ ما يُرسَم مخفيّا.
   */
  it('**وقفل hidden قائم للكلّ** — لا لصنف صنفا', () => {
    // ‏في المستوى الأعلى لا في كتلةٍ مشروطة، ومحدّدُه العاري وحدَه
    expect(sheet(STYLE).rule('[hidden]').display).toBe('none!important')
  })

  it('والنصّ يبقى داخل نطاق nonce — لا وسم ثان بلا ختم', () => {
    const html = shell('ت', '<p>x</p>', 'n1', 'var a=1;', { commands: [one] })
    expect(html.match(/<script/g)).toHaveLength(3) // ‏ثيم الإقلاع، ثمّ الأصل العامّ، ثمّ نصّ الصفحة
    expect(html).not.toContain('<script>')
    expect(html.match(/<script nonce="n1"/g)).toHaveLength(3)
  })
})

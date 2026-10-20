/**
 * المحلِّلُ يُختبَر قبل أن يُصدَّق (N-13).
 *
 * اختباراتُ الورقة صارت تسأل `sheet(STYLE)` لا نصَّ `STYLE`. **فإن عمي
 * المحلِّلُ عمِيَت معه كلُّها خضراء** — فهنا يُثبَت أنّه يرى:
 *
 * | ما يُزرع | في ماذا | لماذا هناك |
 * |---|---|---|
 * | عيوبٌ تحتاج مرساةً (قاعدةٌ تخرج من كتلتها، والطباعةُ قبل الليل…) | عيّنةٌ صغيرةٌ هنا | مرساةٌ في styles.ts تنكسر بإعادة لفٍّ فيصير الحارسُ نفسُه سقوطًا كاذبًا |
 * | عيوبٌ تُلحَق آخرَ الورقة | نسخةٌ من `STYLE` في الذاكرة | لا مرساةَ فيها: تُلحَق بأيّ ورقة |
 * | إعادةُ صياغةٍ شاملة | الورقةُ المخدومةُ كلُّها | تحويلٌ عامّ بلا مرساة، فلا يمرّ فارغًا |
 * | أقواسٌ مكسورة | عيّناتٌ هنا | يرمي المحلِّلُ ويسمّي القاعدة |
 *
 * وآخرُ الملفّ عدّادٌ: **لا اختبارَ يسأل نصَّ الورقة**، والعددُ في رسالة السقوط.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, posix, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { STYLE } from '../routes/ui/styles'
import { STYLE_BODY } from '../lib/ui/asset'
import { parseCss, sheet, type Sheet } from './css'

describe('المحلِّل يقرأ الساري', () => {
  const SAMPLE = [
    '/* تعليق فيه { و} و; لا يُقرأ */',
    ':root{--ink:#111; --brand:#222}',
    '.a > .b ,  .c+.d{ color : var(--ink) ; margin:0 }',
    '.e{color:var(--ink) !important; color:var(--brand)}',
    '.e{color:var(--brand)}',
    '@media (max-width: 720px){',
    '  .a>.b{color:var(--brand) /* تعليق داخل قيمة */}',
    '  @media (hover:hover){ .c + .d{margin:1px} }',
    '}',
    ".f::after{content:'  ( ; } ,  '}",
    '@import url(x.css);',
    '@page{margin:1cm}',
  ].join('\n')
  const css = sheet(SAMPLE)

  it('المحدّد بعينه في سياقه، والفراغ حول الرابط وبعد اسم الكتلة لا يفرّق', () => {
    expect(css.rule('.a>.b')).toEqual({ color: 'var(--ink)', margin: '0' })
    expect(css.rule('.a > .b')).toEqual(css.rule('.a>.b'))
    expect(css.rule('.a>.b', '@media(max-width:720px)')).toEqual({ color: 'var(--brand)' })
    expect(css.rule('.a>.b', '@media (max-width: 720px)')).toEqual({ color: 'var(--brand)' })
    expect(css.rule('.c + .d', '@media(max-width:720px) @media(hover:hover)')).toEqual({ margin: '1px' })
    expect(css.where('.c+.d')).toEqual(['', '@media(max-width:720px) @media(hover:hover)'])
    expect(css.where('.b')).toEqual([])
  })

  it('وسياقان معًا يُدمَجان بترتيب المصدر، وترتيب المفاتيح ترتيب السريان', () => {
    const both = css.rule('.a>.b', ['', '@media(max-width:720px)'])
    expect(both).toEqual({ margin: '0', color: 'var(--brand)' })
    expect(Object.keys(both)).toEqual(['margin', 'color'])
  })

  it('و!important يثبت أمام ما بعده في القاعدة وفي قاعدة لاحقة، والفراغ قبله يُطوى', () => {
    expect(css.rule('.e').color).toBe('var(--ink)!important')
  })

  it('وما بين علامتَي اقتباس كما هو، والتعليق لا يُقرأ، و@page قاعدة باسمها', () => {
    expect(css.rule('.f::after').content).toBe("'  ( ; } ,  '")
    expect(css.rule('@page').margin).toBe('1cm')
    expect(css.decls().map((d) => d.prop)).toEqual([
      '--ink', '--brand', 'color', 'margin', 'color', 'color', 'color', 'margin', 'content', 'margin',
    ])
  })
})

/**
 * **عيوبٌ تجتاز الحرفيَّ خضراءَ وتقلب المحلَّل** — على عيّنةٍ تحاكي الورقة.
 *
 * كلُّ صفٍّ: التأكيدُ الحرفيُّ القديم قبل الزرع وبعده، وسؤالُ المحلِّل قبل
 * الزرع وبعده. والعيّنةُ هنا لا في styles.ts: مرساةٌ في الورقة الحقيقيّة
 * تنكسر بإعادة لفّ، فيسقط الحارسُ والورقةُ سليمة — وهي العلّةُ المحروسُ منها.
 */
describe('العيب المزروع يُرى', () => {
  const BASE = [
    ':root{--ink:#191b1f}',
    ':root[data-theme="dark"]{--ink:#ebe9e3}',
    '@media print{:root,:root[data-theme="dark"]{--ink:#191b1f}}',
    '.tile .v{font-size:20px; font-weight:400}',
    '.slice .stats{margin:0; margin-inline-start:auto}',
    '.head,.sec,th{font-family:"Reem Kufi"}',
    '.sec,th{font-family:inherit}',
    '@media(pointer:coarse){textarea.mono,.cmd-text{font-size:17px}}',
  ].join('\n')

  type Row = [
    name: string,
    plant: (s: string) => string,
    literal: (s: string) => boolean,
    literalAfter: boolean,
    ask: (c: Sheet) => unknown,
    before: unknown,
    after: unknown,
  ]
  const ROWS: Row[] = [
    [
      'قاعدة اللمس تخرج من كتلتها فيعود تقريب iOS',
      (s) => s.replace('@media(pointer:coarse){textarea.mono,.cmd-text{font-size:17px}}',
        '@media(pointer:coarse){}\ntextarea.mono,.cmd-text{font-size:17px}'),
      (s) => /@media\(pointer:coarse\)\{[\s\S]*textarea\.mono,\.cmd-text\{font-size:17px\}/.test(s),
      true,
      (c) => c.rule('textarea.mono', '@media(pointer:coarse)')['font-size'],
      '17px', undefined,
    ],
    [
      'كتلة الطباعة تسبق الليل فيغلبها حبرُه على الورق',
      (s) => s.replace(':root[data-theme="dark"]{--ink:#ebe9e3}\n@media print{:root,:root[data-theme="dark"]{--ink:#191b1f}}',
        '@media print{:root,:root[data-theme="dark"]{--ink:#191b1f}}\n:root[data-theme="dark"]{--ink:#ebe9e3}'),
      (s) => s.slice(s.indexOf('@media print')).includes('--ink:#191b1f'),
      true,
      (c) => c.rule(':root[data-theme="dark"]', ['', '@media print'])['--ink'],
      '#191b1f', '#ebe9e3',
    ],
    [
      'قائمة لاحقة تغيّر وزن الرقم',
      (s) => `${s}\n.grid .x,.tile .v{font-weight:600}`,
      (s) => s.includes('.tile .v{font-size:20px; font-weight:400}') &&
        s.split('\n').filter((l) => l.startsWith('.tile .v{')).length === 1,
      true,
      (c) => c.rule('.tile .v')['font-weight'],
      '400', '600',
    ],
    [
      'مسافة تهرّب لون التحذير',
      (s) => `${s}\n.delta.down{ color:var(--warn)}`,
      (s) => !s.includes('.delta.down{color:var(--warn)}'),
      true,
      (c) => c.rule('.delta.down').color,
      undefined, 'var(--warn)',
    ],
    [
      'محدّد يسقط من قائمة «inherit» فيصير كوفيًّا',
      (s) => s.replace('.sec,th{font-family:inherit}', 'th{font-family:inherit}'),
      (s) => /\.head,\.sec,[^{]*\{font-family:"Reem Kufi"\}/.test(s),
      true,
      (c) => c.rule('.sec')['font-family'],
      'inherit', '"Reem Kufi"',
    ],
    [
      'المختصَر بعد المفصَّل يمحوه — والحرفيّ يمسكه بالنصّ لا بالسبب',
      (s) => s.replace('.slice .stats{margin:0; margin-inline-start:auto}', '.slice .stats{margin-inline-start:auto; margin:0}'),
      (s) => s.includes('.slice .stats{margin:0; margin-inline-start:auto'),
      false,
      (c) => Object.keys(c.rule('.slice .stats')),
      ['margin', 'margin-inline-start'], ['margin-inline-start', 'margin'],
    ],
    [
      'وإعادة لفّ وتعليق لا يغيّران شيئًا — والحرفيّ يسقط كاذبًا',
      (s) => s.replace('.slice .stats{margin:0; margin-inline-start:auto}',
        '/* (D-142) THEME:rail */\n.slice .stats{margin:0;\n  margin-inline-start:auto}'),
      (s) => s.includes('.slice .stats{margin:0; margin-inline-start:auto'),
      false,
      (c) => c.rule('.slice .stats'),
      { margin: '0', 'margin-inline-start': 'auto' }, { margin: '0', 'margin-inline-start': 'auto' },
    ],
  ]

  it.each(ROWS)('%s', (_name, plant, literal, literalAfter, ask, before, after) => {
    const planted = plant(BASE)
    expect(planted, 'الزرع لم يقع').not.toBe(BASE)
    expect(literal(BASE)).toBe(true)
    expect(literal(planted)).toBe(literalAfter)
    expect(ask(sheet(BASE))).toEqual(before)
    expect(ask(sheet(planted))).toEqual(after)
  })
})

/**
 * **وعلى الورقة الحقيقيّة: ما يُلحَق آخرَها وحدَه** — بلا مرساةٍ تنكسر.
 * كلُّ صفٍّ سؤالٌ تسأله views.test، ويُقلَب بسطرٍ واحدٍ يُلحَق.
 */
describe('العيب يُلحَق بالورقة فيُرى', () => {
  it.each([
    ['قائمة لاحقة تغيّر وزن رقم المؤشّر', '.grid .x,.tile .kv-v{font-weight:600}',
      (c: Sheet) => c.rule('.tile .kv-v')['font-weight'], '400', '600'],
    ['مسافة تهرّب لون التحذير إلى نزول الإنفاق', '.delta.down{ color:var(--warn)}',
      (c: Sheet) => c.rule('.delta.down').color, 'var(--ink-2)', 'var(--warn)'],
    ['رمز يُعاد على الرافدة فتصير ثيمًا ثالثًا', '.rail{--bg:#14161c}',
      (c: Sheet) => Object.keys(c.rule('.rail')).filter((p) => p.startsWith('--')), [], ['--bg']],
  ])('%s', (_name, tail, ask, before, after) => {
    expect(ask(sheet(STYLE))).toEqual(before)
    expect(ask(sheet(STYLE + '\n' + tail))).toEqual(after)
  })
})

/**
 * **والتعليقُ والفراغُ لا يُسقطان** — والورقةُ كلُّها تُعاد صياغتُها.
 *
 * تعليقٌ بعد كلّ قوسِ فتح وقبل كلّ قوسِ إغلاق، وكلُّ «;» على سطر، وفراغٌ حول
 * كلّ فاصلةٍ و«>» و«!»، و«@media (». **تحويلٌ عامٌّ لا مرساةَ فيه**، فلا
 * يمرّ فارغًا إن أُعيد لفُّ styles.ts. وما بين علامتَي اقتباس لا يُمسّ.
 */
describe('التعليق والمسافة لا يُسقطان', () => {
  const shake = (css: string): string =>
    css.split(/("[^"]*"|'[^']*')/).map((part, i) => i % 2 === 1 ? part : part
      .replace(/\{/g, '{ /* THEME:rail (D-142) */\n    ')
      .replace(/\}/g, '\n  /* D-143 */ }\n')
      .replace(/;/g, ' ;\n      ')
      .replace(/,/g, ' , ')
      .replace(/>/g, ' > ')
      .replace(/!/g, ' ! ')
      .replace(/@media\(/g, '@media (')).join('')

  it('الورقة مهزوزةً تُقرأ قواعدَها نفسَها', () => {
    const shaken = shake(STYLE_BODY)
    expect(shaken).not.toMatch(/\{\S/)
    expect(shaken).not.toMatch(/\S;/)
    expect(parseCss(shaken)).toEqual(parseCss(STYLE))
  })

  it('والورقة المخدومة هي المصدر قاعدةً قاعدة', () => {
    expect(parseCss(STYLE_BODY)).toEqual(parseCss(STYLE))
  })
})

describe('القوس المكسور يسقط باسم قاعدته', () => {
  it.each([
    ['قوس ناقص', '.bar i{background:var(--ink)}\n.bar i.done{background:var(--ink)\n.cap{color:var(--ink)}',
      /كتلة داخل قاعدة «\.bar i\.done»/],
    ['قوس زائد', '.bar i.done{background:var(--ink)}}\n.cap{color:var(--ink)}',
      /قوس إغلاق بلا فتح بعد «\.bar i\.done»/],
    ['كتلة لم تُغلَق آخر الورقة', '.a{color:var(--ink)}\n@media(max-width:720px){.a{color:var(--brand)}',
      /1 كتلةً لم تُغلَق، آخرُها «@media\(max-width:720px\)»/],
    ['تصريح بلا نقطتين', '.a{color var(--ink)}', /تصريح بلا نقطتين في «\.a»/],
    ['«;» بعد القوس تُسقط القاعدة التالية', '.a{color:var(--ink)};\n.b{color:var(--ink)}', /محدّد فيه «;»/],
    ['قاعدة بلا محدّد', '.a{color:var(--ink)}\n{color:var(--ink)}', /قاعدة بلا محدّد بعد «\.a»/],
    ['نصّ بلا قاعدة داخل كتلة', '@media print{.a{color:var(--ink)} color:var(--ink)}', /نصّ بلا قاعدة داخل «@media print»/],
    // ‏الفتحةُ مقسومةٌ في المصدر: فتحةٌ بلا إغلاقٍ هنا يمحو بها عدّادُ الحرفيّات أدناه ما بعدها
    ['تعليق لم يُغلَق', '.a{color:var(--ink)}\n/' + '* يبدأ ولا ينتهي', /تعليق لم يُغلَق بعد «\.a»/],
    ['اقتباس لم يُغلَق', ".a::after{content:'x}", /اقتباس لم يُغلَق/],
  ])('%s', (_name, src, message) => {
    expect(() => parseCss(src)).toThrow(message)
  })

  it('والورقة لا تُحلَّل حتى تُسأل: العيب يُسقط السؤال لا تحميل الملفّ', () => {
    const broken = sheet('.a{color:var(--ink)\n.b{color:var(--ink)}')
    expect(() => broken.rule('.a')).toThrow(/كتلة داخل قاعدة «\.a»/)
    expect(() => broken.where('.b')).toThrow(/كتلة داخل قاعدة «\.a»/)
  })
})

/**
 * ── لا اختبارَ يسأل نصَّ الورقة (N-13) ──────────────────────────────
 *
 * يُعدّ كلُّ استعمالٍ لـ`STYLE` أو `TOKENS` في ملفّات الاختبار يقرأ النصَّ:
 * `expect(STYLE)`، و`STYLE.slice` و`indexOf` و`split` وأخواتُها، وتمريرُه إلى
 * غير المحلِّل. **والاسمُ يُعرَف بمصدره لا بحرفه**: `TOKENS` في
 * `lib/tokens.test.ts` رموزُ OAuth لا رموزُ الورقة، و`STYLE as S` يُعدّ باسمه
 * المستعار. والمدخلُ الوحيدُ المقبول `sheet(STYLE)` و`parseCss(STYLE)`.
 *
 * و`STYLE_BODY` لا يُعدّ: هو موضوعُ اختبار النزع في `assets.test.ts` —
 * أيبقى في المخدوم ما يُخدَم — لا سؤالٌ عن قيمة.
 */
const SHEETS = new Map([
  ['routes/ui/styles', 'STYLE'],
  ['routes/ui/tokens', 'TOKENS'],
])

/** ما يُقبل بحقٍّ — ومعه سببُه. وإعفاءٌ لم يعد يُستعمل يُسقط الاختبار. */
const ALLOWED: ReadonlyArray<readonly [file: string, name: string, use: string, why: string]> = [
  ['routes/assets.test.ts', 'STYLE', '.length', 'نسبة النزع: طول المصدر مقابل طول المخدوم، ولا قيمة فيه تُسأل'],
]

interface Use {
  readonly file: string
  readonly line: number
  readonly use: string
  readonly text: string
}

/** الأسماءُ المحلّيّةُ المربوطةُ بنصّ الورقة في ملفّ، باستيرادٍ ثابتٍ أو حيّ. */
function sheetNames(file: string, code: string): string[] {
  const names: string[] = []
  const bind = (spec: string, list: string, alias: RegExp): void => {
    const exported = SHEETS.get(posix.join(posix.dirname(file), spec).replace(/\.ts$/, ''))
    if (exported === undefined) return
    for (const item of list.split(',')) {
      const [name, local] = item.trim().split(alias)
      if (name === exported) names.push((local ?? name).trim())
    }
  }
  for (const m of code.matchAll(/import\s*\{([^{}]*)\}\s*from\s*'([^']+)'/g)) bind(m[2] ?? '', m[1] ?? '', /\s+as\s+/)
  for (const m of code.matchAll(/\{([^{}]*)\}\s*=\s*await\s+import\(\s*'([^']+)'\s*\)/g)) bind(m[2] ?? '', m[1] ?? '', /\s*:\s*/)
  return names
}

/**
 * كلُّ قراءةٍ لنصّ الورقة في ملفٍّ، إلّا ما دخل المحلِّلَ كاملًا.
 * والتعليقُ يُمحى بفراغٍ يحفظ السطور: شرحٌ يقتبس الاسمَ ليس قراءة.
 */
function literalUses(file: string, source: string): Use[] {
  const lines = source.split('\n')
  const blank = (m: string): string => m.replace(/[^\n]/g, ' ')
  const code = source.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/^[ \t]*\/\/.*$/gm, blank)
  const out: Use[] = []
  for (const name of sheetNames(file, code)) {
    const re = new RegExp(`(\\bsheet\\(\\s*|\\bparseCss\\(\\s*)?\\b${name}\\b\\s*([.)[])(\\w*)`, 'g')
    for (const m of code.matchAll(re)) {
      if (m[1] !== undefined && m[2] === ')') continue
      const line = code.slice(0, m.index).split('\n').length
      out.push({ file, line, use: `${name}${m[2] ?? ''}${m[3] ?? ''}`, text: (lines[line - 1] ?? '').trim() })
    }
  }
  return out
}

describe('لا حرفيّة على نصّ الورقة في اختبار', () => {
  const SRC = join(dirname(fileURLToPath(import.meta.url)), '..')
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return walk(path)
    return name.endsWith('.test.ts') ? [path] : []
  })

  it('العدد صفر، ورسالة السقوط تسمّي كلّ موضع بملفّه وسطره', () => {
    const uses = walk(SRC).flatMap((path) => literalUses(relative(SRC, path).split('\\').join('/'), readFileSync(path, 'utf8')))
    const allowed = (u: Use): boolean => ALLOWED.some(([file, name, use]) => u.file === file && u.use === name + use)
    const bad = uses.filter((u) => !allowed(u)).map((u) => `${u.file}:${u.line} · ${u.text}`)
    expect(bad, `حرفيّات على نصّ الورقة: ${bad.length} — اسأل sheet(STYLE) من src/test/css`).toEqual([])
    const stale = ALLOWED.filter(([file, name, use]) => !uses.some((u) => u.file === file && u.use === name + use))
    expect(stale.map(([file, name, use]) => `${file} · ${name}${use}`), 'إعفاء لم يعد يُستعمل: احذفه').toEqual([])
  })

  it('والعدّاد يرى الاسم المستعار والاستيراد الحيّ، ولا يعدّ المحلِّل ولا اسمًا من مصدر آخر', () => {
    const planted = [
      "import { STYLE as S } from './styles'",
      "import { TOKENS } from '../../lib/tokens'",
      "expect(S).toContain('.p{')",
      "const print = S.slice(S.indexOf('THEME:print'))",
      'const css = sheet(S)',
      'expect(TOKENS).toEqual({})',
      '// expect(S) في شرح لا يُعدّ',
      'expect(S[0]).toBe(":")',
    ].join('\n')
    expect(literalUses('routes/ui/x.test.ts', planted).map((u) => `${u.line} ${u.use}`))
      .toEqual(['3 S)', '4 S.slice', '4 S.indexOf', '8 S[0'])
    const dynamic = "it('x', async () => {\n  const { STYLE: T } = await import('./ui/styles')\n  expect(T.length).toBe(1)\n})"
    expect(literalUses('routes/x.test.ts', dynamic).map((u) => u.use)).toEqual(['T.length'])
    expect(literalUses('lib/x.test.ts', "import { TOKENS } from './tokens'\nexpect(TOKENS).toBe(1)")).toEqual([])
  })
})

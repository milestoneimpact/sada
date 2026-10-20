/**
 * مدقّقُ الاتّجاه: **خاصّيّةٌ فيزيائيّةٌ في ورقةٍ تُقرأ من اليمين** (D-167).
 *
 * ## لماذا
 *
 * اللوحةُ عربيّةٌ كلُّها، **وفيها جزرٌ لاتينيّة**: رمزُ الأمر، ومعرِّفُ
 * العميل، ومحورُ الرسم، والمبلغُ برمز عملته. و«يسار» في الأولى نهايةُ
 * السطر، وفي الثانية بدايتُه. فخاصّيّةٌ فيزيائيّةٌ تقول مكانًا على الشاشة،
 * **والمنطقيّةُ تقول مكانًا في السطر** — وهي ما يُراد في كلّ موضعٍ قِيس:
 *
 * | ما وُجد | ما كان يقول | ما يُراد |
 * |---|---|---|
 * | `.chip{margin:… 0 0 var(--s-1)}` | فاصلٌ يسارَ الرقاقة | فاصلٌ في نهاية السطر — ويسارُ الرقاقة بدايتُه في حاويةٍ لاتينيّة |
 * | `.tap::after{left:0; right:0}` | الطبقةُ بعرض الرابط | الشيءُ نفسُه منطقيًّا: `inset-inline:0` |
 * | `th{text-align:right}` | يمينُ الخليّة | بدايتُها |
 * | `.cmd-text{direction:ltr; text-align:left}` | يسارُ الحقل | بدايتُه — وهي هنا يسارُه |
 *
 * والرسمُ لم يتبدّل في أيٍّ منها اليوم: **الصفحةُ عربيّةٌ فاليسارُ نهايةٌ
 * بالمصادفة**. والحارسُ للغد: قاعدةٌ تُنسَخ إلى حاويةٍ لاتينيّة، أو صفحةٌ
 * تُكتب بالإنجليزيّة، تنقلب فيها كلُّ فيزيائيّةٍ صامتة.
 *
 * ## وما يُقرأ
 *
 * `routes/ui/styles.ts` و`tokens.ts` (والتعليقُ يُمحى بفراغٍ يحفظ السطور)،
 * و`style="…"` في وسم `src/routes/**` — والتعبيرُ `${…}` فيه يُقرأ صفرًا.
 *
 * | ما يردّ | بديلُه |
 * |---|---|
 * | `margin-left/right` · `padding-left/right` · `border-left/right(-*)` · `scroll-margin/padding-left/right` | `…-inline-start/end` |
 * | `left:` · `right:` | `inset-inline-start/end` · `inset-inline` |
 * | `text-align:left/right` · `float`/`clear:left/right` | `start/end` · `inline-start/end` |
 * | `margin`/`padding`/`inset`/`border-width/style/color` بأربع قيَمٍ يختلف ثانيها عن رابعها | مختصَرٌ متناظرٌ ثمّ `…-inline-start/end` |
 *
 * والمختصَرُ المتناظرُ (قيمةٌ أو اثنتان أو ثلاث، أو أربعٌ يتساوى ثانيها ورابعها)
 * يمرّ: لا يسارَ فيه ولا يمين. و`linear-gradient(to left…)` و`translateX` و
 * `box-shadow` خارج الحارس: لا نظيرَ منطقيًّا لها في CSS بعد.
 *
 * ## ولا تباعدَ على حرفٍ عربيّ (D-183)
 *
 * الحرفُ العربيُّ يتّصل بما بعده: **تباعدٌ موجبٌ يفكّ الوصل** («صــدى»)،
 * **وسالبٌ يُلصق الحروفَ فوق مسافاتها المرسومة** — والخطُّ مصمَّمٌ بها. وقِيس
 * ستّةُ مواضعَ سالبةٍ على عناوين عربيّة («صدى» نفسُها بينها). فكلُّ `letter-spacing`
 * غيرِ صفريٍّ يردّ **إلّا في قاعدةٍ تكتب `direction:ltr`**: نصٌّ لاتينيٌّ معزول —
 * شارةُ STAGING ورموزُ الاسترداد والرقمُ في بطاقة المؤشّر — والتضييقُ فيه صنعة.
 * والصفرُ يمرّ: يُلغي تباعدًا موروثًا ولا يضيف واحدًا. و`audit_tokens` يحرس
 * الموجبَ منذ D-149؛ وهذا يحرس الإشارتين.
 *
 * الاستعمال:  node scripts/audit_rtl.mjs [--self-test]
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { sheetFiles } from './sheet.mjs'
import { join } from 'node:path'

const ROOT = new URL('../src/', import.meta.url).pathname
const SHEETS = [...sheetFiles(ROOT).map((f) => f.slice(ROOT.length)), 'routes/ui/tokens.ts']

/** ملفّاتٌ يُعفى وسمُها — **وبسطرٍ يقول لماذا**. */
const EXEMPT = new Map([
  [
    'routes/ui/chart.ts',
    'الرسمُ إحداثيّاتٌ لا سطر: «.chart .plot» لاتينيُّ الاتّجاه قصدًا، ' +
      'ومواضعُ الأرقام تُحسَب من يسار المحور (D-153) — فاليسارُ هنا يسارُ الرسم',
  ],
])

const SIDE = /(?<![\w-])((?:scroll-)?(?:margin|padding)-(?:left|right)|border-(?:left|right)(?:-(?:width|style|color))?|left|right)\s*:/g
const ALIGN = /(?<![\w-])(text-align|float|clear)\s*:\s*(left|right)\b/g
const FOUR = /(?<![\w-])(margin|padding|inset|border-width|border-style|border-color)\s*:\s*([^;{}]*)/g

/** قيَمُ المختصَر على الفراغ في العمق صفر: `calc(a + b)` قيمةٌ واحدة. */
function parts(value) {
  const out = []
  let depth = 0
  let cur = ''
  for (const c of value.replace(/!important/i, '').trim()) {
    if (c === '(') depth += 1
    if (c === ')') depth -= 1
    if (/\s/.test(c) && depth === 0) {
      if (cur !== '') out.push(cur)
      cur = ''
      continue
    }
    cur += c
  }
  if (cur !== '') out.push(cur)
  return out
}

/** التعليقُ يُمحى بفراغٍ يحفظ السطور — شرحٌ يقتبس «margin-left» ليس قاعدة. */
const blank = (s) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))

/** كلُّ فيزيائيّةٍ في نصّ CSS: `{ line, decl }` بسطرها في النصّ المعطى. */
export function physical(css, lineBase = 1) {
  const text = blank(css)
  const hits = []
  const at = (i) => lineBase + (text.slice(0, i).match(/\n/g) ?? []).length
  for (const m of text.matchAll(SIDE)) hits.push({ i: m.index, decl: `${m[1]}:` })
  for (const m of text.matchAll(ALIGN)) hits.push({ i: m.index, decl: `${m[1]}:${m[2]}` })
  for (const m of text.matchAll(FOUR)) {
    const v = parts(m[2])
    if (v.length === 4 && v[1] !== v[3]) hits.push({ i: m.index, decl: `${m[1]}:${m[2].trim()}` })
  }
  return hits.sort((a, b) => a.i - b.i).map((h) => ({ line: at(h.i), decl: h.decl }))
}

/**
 * كلُّ تباعدٍ غيرِ صفريٍّ في كتلةٍ لا تعلن `direction:ltr`: `{ line, decl }`.
 * الكتلُ الداخليّةُ وحدَها، فقاعدةٌ داخل `@media` تُفحَص بذاتها.
 */
export function spacing(css, lineBase = 1) {
  const text = blank(css)
  const hits = []
  const at = (i) => lineBase + (text.slice(0, i).match(/\n/g) ?? []).length
  for (const block of text.matchAll(/\{([^{}]*)\}/g)) {
    if (/(?<![\w-])direction\s*:\s*ltr/.test(block[1])) continue
    for (const m of block[1].matchAll(/(?<![\w-])letter-spacing\s*:\s*([^;}]+)/g)) {
      const v = m[1].trim()
      if (/^-?0*\.?0+(?:px|em|rem)?$/.test(v) || v === 'normal') continue
      hits.push({ line: at(block.index + 1 + m.index), decl: `letter-spacing:${v}` })
    }
  }
  return hits
}

/** سِماتُ `style="…"` في وسم ملفّ، و`${…}` فيها صفر. */
export function inlineStyles(code) {
  const out = []
  for (const m of code.matchAll(/style="([^"]*)"/g)) {
    const line = code.slice(0, m.index).split('\n').length
    out.push({ line, css: m[1].replace(/\$\{[^}]*\}/g, '0') })
  }
  return out
}

if (process.argv.includes('--self-test')) {
  const sample = [
    '.a{margin:2px 0 0 4px}',
    '.b{margin-left:4px}',
    '.c{padding-right:var(--s-1)}',
    '.d{position:absolute; left:0; right:0}',
    '.e{direction:ltr; text-align:right}',
    '.f{border-left:1px solid; border-right-width:2px}',
    '.g{inset:0 auto 0 calc(var(--s-1) + 2px)}',
    '/* margin-left:4px و text-align:left في شرحٍ لا يُعَدّ */',
    '.h{margin:0 4px; padding:1px 2px 3px; margin-inline-start:4px; inset-inline:0; text-align:start;',
    '  border-inline-start:1px solid; scroll-padding-top:4px}',
    '.i{margin:1px calc(2px + 1px) 3px calc(2px + 1px); border-width:1px 2px 3px 2px}',
    '.j{background:linear-gradient(to left,red,blue); transform:translateX(2px)}',
    '.k{float:left}',
    '@media(max-width:720px){.l{padding-left:0}}',
  ].join('\n')
  const got = physical(sample).map((h) => h.line)
  const want = [1, 2, 3, 4, 4, 5, 6, 6, 7, 13, 14]
  const inline = inlineStyles('x = `<div style="text-align:left">` + `<i style="top:${y};right:${px(w)}">`')
    .flatMap((s) => physical(s.css))
  if (JSON.stringify(got) !== JSON.stringify(want) || inline.length !== 2) {
    console.log(`  ✕ self-test: ردّ ${JSON.stringify(got)} والمطلوب ${JSON.stringify(want)} · الوسمُ ${inline.length} والمطلوب 2`)
    process.exit(1)
  }
  const tracked = [
    '.a{font-size:20px; letter-spacing:-.3px}',
    '.b{letter-spacing:var(--ls-eyebrow)}',
    '.c{letter-spacing:.06em; direction:ltr}',
    '.d{letter-spacing:0}',
    '/* letter-spacing:.2em في شرحٍ لا يُعَدّ */',
    '@media(max-width:900px){.e{letter-spacing:-.6px}}',
    '.f{direction: ltr; unicode-bidi:isolate; letter-spacing:-.03em}',
    '.g{--ls-x:.1em; letter-spacing:normal}',
  ].join('\n')
  const spaced = spacing(tracked).map((h) => h.line)
  const spacedInline = inlineStyles('x = `<b style="letter-spacing:.2em">`').flatMap((s) => spacing(`{${s.css}}`))
  if (JSON.stringify(spaced) !== '[1,2,6]' || spacedInline.length !== 1) {
    console.log(`  ✕ self-test: التباعدُ ردّ ${JSON.stringify(spaced)} والمطلوب [1,2,6] · الوسمُ ${spacedInline.length} والمطلوب 1`)
    process.exit(1)
  }
  console.log('  ✓ self-test: إحدى عشرةَ فيزيائيّةً مزروعةً تُمسَك بسطورها، وفي الوسم اثنتان،')
  console.log('    والمنطقيّةُ والمتناظرةُ والشرحُ والتدرّجُ تمرّ')
  console.log('  ✓ self-test: ثلاثةُ تباعداتٍ على غير اللاتينيّ تُمسَك (سالبٌ وموجبٌ ورمز)، وفي الوسم واحد،')
  console.log('    والصفرُ و«normal» واللاتينيُّ المعزولُ والشرحُ تمرّ')
  process.exit(0)
}

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) out.push(...walk(path))
    else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) out.push(path)
  }
  return out
}

const found = []
const tracked = []
for (const sheet of SHEETS) {
  const css = readFileSync(join(ROOT, sheet), 'utf8')
  for (const h of physical(css)) found.push(`${sheet}:${h.line}  ${h.decl}`)
  for (const h of spacing(css)) tracked.push(`${sheet}:${h.line}  ${h.decl}`)
}
for (const file of walk(join(ROOT, 'routes'))) {
  const short = file.slice(ROOT.length)
  if (SHEETS.includes(short)) continue
  for (const s of inlineStyles(readFileSync(file, 'utf8'))) {
    // ‏والرسمُ المُعفى من الاتّجاه لا يُعفى من التباعد: نصُّه عربيٌّ كذلك
    for (const h of spacing(`{${s.css}}`)) tracked.push(`${short}:${s.line}  style="${h.decl}"`)
    if (EXEMPT.has(short)) continue
    for (const h of physical(s.css)) found.push(`${short}:${s.line}  style="${h.decl}"`)
  }
}

console.log('\n═══ خاصّيّةٌ فيزيائيّةٌ في ورقةٍ تُقرأ من اليمين ═══\n')
if (found.length === 0) console.log('  ✓ كلُّ جانبٍ منطقيّ: بدايةُ السطر ونهايتُه، لا يمينُ الشاشة ويسارُها')
for (const f of found) console.log(`  ✕ ${f}`)
console.log('\n═══ تباعدُ حرفٍ بلا اتّجاهٍ لاتينيّ ═══\n')
if (tracked.length === 0) console.log('  ✓ لا تباعدَ على العربيّة: ما بقي منه في قاعدةٍ تعلن «direction:ltr» وحدَها')
for (const t of tracked) console.log(`  ✕ ${t}`)
console.log('\n═══ ملفٌّ مُعفًى بسببه ═══\n')
for (const [file, why] of EXEMPT) console.log(`  · ${file} — ${why}`)

if (tracked.length > 0) {
  console.log('\nوالبديلُ: حذفُ التباعد، أو «direction:ltr» في القاعدة نفسِها إن كان النصُّ لاتينيًّا معزولًا.\n')
  process.exit(1)
}
if (found.length > 0) {
  console.log('\nوالبديلُ: «margin-inline-start/end» و«inset-inline» و«text-align:start/end».')
  console.log('ولا يُعفى ملفٌّ إلّا **بسطرٍ يقول لماذا لا ينطبق عليه اتّجاهُ السطر**.\n')
  process.exit(1)
}
console.log('')

/**
 * مدقّقُ الأصناف: **صنفٌ يُكتب في الوسم ولا قاعدةَ له في الورقة** (D-123).
 *
 * ## لماذا
 *
 * `audit_tokens` يحرس الرموزَ (`var(--x)`)، ولا يرى الأصنافَ. وقِيست
 * الواجهةُ كلُّها فوُجد **ستّةُ أصنافٍ تُكتب ولا تُرسَم**:
 *
 * | الصنف | أين | ما وقع |
 * |---|---|---|
 * | `ghost` | زرُّ «أرفض» في التقرير | زرّان بلا درجة: لا أرضيّةَ ولا حدّ، ولا يُعرَف الأوّليّ |
 * | `plain` | ملحوظاتُ المراجعة والتوزيع | نقطةُ المتصفّح وحشوُه ‏٤٠px خارجَ السلّم |
 * | `urgent` | صفُّ مهمّةٍ توقف بوّابة | يُقرأ في المصدر مميَّزا ويُرسَم كسائر الصفوف |
 * | `wz` · `spread-bar` · `pv-h` | — | أثرُ نسخٍ لا يفعل شيئا، ويوهم من يقرأ بأنّه يفعل |
 *
 * والأولى أخبثُها: **الوسمُ صحيحٌ والقاعدةُ غائبة**، فلا اختبارٌ يمسكها
 * (النصُّ موجود) ولا مدقّقٌ بصريٌّ (الأحجامُ من السلّم) — وهي عينُ علّة
 * `--ls-eyebrow` (D-097) في طبقةٍ لم يبلغها حارسُها.
 *
 * ## وما لا يُعَدّ صنفَ رسم
 *
 * صنفٌ يقرؤه النصُّ البرمجيُّ ليجد عنصرا (`mp-load` · `pk-del` · `preset`)
 * **مقبضٌ لا صنفُ رسم**، ويُعفى **باسمه وسببِه** في القائمة أدناه — ولا يُعفى
 * بصمت (سنّةُ `audit_tokens`).
 *
 * ## وما يُقرأ
 *
 * `src/routes/**` وحدَها: هي التي تكتب وسمَ اللوحة. و`lib/image/slide.ts`
 * تكتب `HTML` لصورةٍ **بورقةِ أنماطٍ مستقلّة** (D-085)، فليست من هذه الورقة.
 *
 * وتعبيراتُ القالب `${…}` تُمحى بموازنة الأقواس لا بنمطٍ نصّيّ: أوّلُ
 * صياغةٍ استعملت نمطا **فأخرجت `true` و`null` و`len` أصنافا** — بقايا
 * تعبيرٍ شرطيٍّ متداخلٍ لم يمحُه النمط.
 *
 * الاستعمال:  node scripts/audit_classes.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'

const ROOT = new URL('../src/', import.meta.url).pathname
const ROUTES = join(ROOT, 'routes')
const STYLES = join(ROOT, 'routes/ui/styles.ts')

/** مقابضُ النصّ البرمجيّ — ومعها سببُها. */
const HOOKS = new Map([
  ['mp', 'صندوقُ درج النماذج: يقرؤه السكربت ليربط الدرجَ بزرّه (D-081)'],
  ['mp-sel', 'الدرجُ نفسُه — يُملأ من عند المزوّد بضغطة'],
  ['mp-load', 'زرُّ «حدّث» — مقبضُ الجلب'],
  ['mp-note', 'سطرُ الحال تحت الدرج — يكتبه السكربت'],
  ['mp-provider', 'درجُ المزوّد في جدول التوجيه — يُفرَّغ الدرجُ عند تبديله (D-083)'],
  ['preset', 'رقاقةُ مزوّدٍ جاهز — تملأ النموذجَ بضغطة'],
  ['pk-del', 'زرُّ حذف مفتاح مرور — يُنادى بـ fetch لا بنموذج'],
])

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) out.push(...walk(path))
    else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) out.push(path)
  }
  return out
}

/** يمحو `${…}` بموازنة الأقواس — والمتداخلُ يُمحى معه. */
function stripExpressions(code) {
  let out = ''
  let i = 0
  while (i < code.length) {
    if (code[i] === '$' && code[i + 1] === '{') {
      let depth = 1
      i += 2
      while (i < code.length && depth > 0) {
        if (code[i] === '{') depth += 1
        else if (code[i] === '}') depth -= 1
        i += 1
      }
      out += ' '
      continue
    }
    out += code[i]
    i += 1
  }
  return out
}

const styles = readFileSync(STYLES, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ')
const defined = new Set([...styles.matchAll(/\.([a-zA-Z_][\w-]*)/g)].map((m) => m[1]))

/**
 * ── الأصنافُ التي كانت عمياء عنها (D-151) ────────────────────────────
 *
 * `stripExpressions` تمحو `${…}` كلَّها، فصنفٌ يُختار داخل التعبير
 * (`class="st ${ok ? 'ok' : 'bad'}"`) وصنفٌ يضيفه السكربتُ
 * (`classList.add('lifted')`) لم يُعدّا مستعملَين قطّ — وعيبٌ مزروعٌ فيهما
 * كان يجتاز. فتُقرأ الآن: الحرفيّاتُ داخل تعبيرٍ يقع **داخل سِمة class**
 * وحدَها (لا كلُّ حرفيّة، وإلّا عُدّت الأسماءُ والمعرّفاتُ أصنافًا)، ونداءاتُ
 * `classList` و`className` من نصّ السكربت.
 */
export function classesOf(code) {
  const out = new Set()
  const add = (text) => {
    for (const cls of text.split(/\s+/)) if (/^[a-zA-Z_][\w-]*$/.test(cls)) out.add(cls)
  }
  // سِمةُ class كاملةً مع تعبيراتها، بمسحٍ يوازن الأقواس
  let i = 0
  while ((i = code.indexOf('class="', i)) !== -1) {
    let j = i + 7
    let depth = 0
    let literal = ''
    while (j < code.length) {
      const ch = code[j]
      if (depth === 0 && ch === '"') break
      if (ch === '$' && code[j + 1] === '{') { depth += 1; j += 2; continue }
      if (depth > 0 && ch === '}') { depth -= 1; j += 1; continue }
      if (depth === 0) literal += ch
      else if (ch === "'" || ch === '`') {
        const end = code.indexOf(ch, j + 1)
        if (end === -1) break
        // حرفيّةٌ تُقارَن (`p === 'all' ? 'on' : ''`) ليست صنفًا؛ ما يُكتب في السِّمة هو الفرعان
        const before = code.slice(Math.max(0, j - 4), j).trimEnd()
        const after = code.slice(end + 1, end + 5).trimStart()
        const compared = /(===|!==|==|!=)$/.test(before) || /^(===|!==|==|!=)/.test(after)
        if (!compared) add(code.slice(j + 1, end))
        j = end + 1
        continue
      }
      j += 1
    }
    add(literal)
    i = j
  }
  for (const m of code.matchAll(/classList\.(?:add|toggle|remove|replace)\(([^)]*)\)/g)) {
    for (const lit of m[1].matchAll(/'([^']*)'/g)) add(lit[1])
  }
  for (const m of code.matchAll(/className\s*=\s*'([^']*)'/g)) add(m[1])
  return out
}

/**
 * ── حرفٌ من خطّ النظام في الوسم (D-167) ─────────────────────────────
 *
 * ▾ ▸ ▲ ▼ ← → ⌘ ليست في الخطّ المضمَّن — ولا في زوج Plex (D-185) — (N-7)،
 * فتُرسَم بخطّ النظام وتختلف من جهازٍ لآخر. رُسمت رموزُ الحال في D-154 وبقيت
 * هذه: سهمُ الطيّ في الورقة، وسهمُ الفرق، وسهما الرابط، و⌘ في زرّ اللوحة.
 * **والرسمُ في بيتين**: `parts.ts` (`glyph()` و`status()`) و`icons.ts`.
 *
 * ## وما يُقرأ — شجرةُ TypeScript لا نمطٌ نصّيّ
 *
 * الحرفُ نفسُه مفتاحٌ مشروعٌ في جداول الحال (`status('bad', '▲', …)` و
 * `{ g: '▲' }`)، **ومعيبٌ إن أُقحم في الوسم** (`${up ? '▲' : '▼'}` بين
 * وسمين) — والفرقُ لا يُرى بنمط. فتُقرأ الحرفيّاتُ من الشجرة (والتعليقُ ليس
 * عقدةً فلا يُقرأ)، وتُفَكّ فيها `&larr;` و`&#8984;` وهروبُ CSS قبل الفحص:
 *
 * | ما يُكتب | الحكم |
 * |---|---|
 * | حرفيّةٌ هي الحرفُ وحدَه، مُعطاةٌ لنداءٍ أو خاصّيّةٍ أو مقارنة | مفتاحٌ يُرسَم في parts — **يمرّ** |
 * | الحرفيّةُ نفسُها تصل `${…}` في قالبٍ مباشرةً (ولو عبر «?:» أو «\|\|»)، أو تُلصَق بـ«+» | **يردّ** |
 * | ▾ ▸ ▲ ▼ ⌘ في نصٍّ أو وسمٍ أو ورقة (وتعليقُ الورقة يُمحى أوّلًا) | **يردّ** |
 * | ← → يلاصق حدَّ وسمٍ («>» قبله أو «<» بعده، والفراغُ لا يُعدّ) | سهمُ رابطٍ — **يردّ** |
 * | ← → في نصٍّ لا يلاصق وسمًا («Credentials ← Create credentials») | **يُطبَع ولا يردّ** |
 *
 * والأخيرُ فاصلُ مسارٍ في نصٍّ يُقرأ، لا رمزُ واجهة: في أدلّة المنصّات وسطورِ
 * المفاتيح، وأكثرُه في `lib/` بياناتٍ لا وسمًا. **ويبقى في البيان حرفًا ويُرسَم عند
 * العرض** بـ `pathArrows()` في `parts.ts` (D-185) — فيُعَدّ هنا ليُرى، **وحارسُه
 * `audit_fonts`** في المتصفّح: سهمٌ وصل الصفحةَ حرفًا يُسقطه ولو مرّ هنا.
 *
 * **وحدُّه**: حرفٌ يُحفَظ في متغيّرٍ ثمّ يُقحَم (`const g = '▲'` ثمّ `${g}`)
 * يمرّ — تتبُّعُ القيمة عبر المتغيّرات ليس عملَ حارسٍ نصّيّ. و`lib/` لا يُقرأ.
 */
/**
 * ── سِمةُ «style» للمسافة (خطّة التصميم 3.3 · D-189) ───────────────────────────────
 *
 * كانت ‏٨٩ سِمةً في الوسم تكتب هامشًا أو حشوًا أو فجوةً بيدها، **وسِمةٌ لا يراها مدقّقُ
 * الورقة ولا يقلبها الثيم ولا تعرفها الكثافة**، وبابُها في السياسة غيرُ باب الوسم (D-150).
 * فصارت أصنافًا من السلّم (`mt-3` و`gap-2` و`w-m`…). **والحارسُ يقرأ الجزءَ الثابت** من
 * السِّمة (ما خرج عن `${…}`): العرضُ المحسوبُ من بيانٍ (`width:${pct}%`) والمتغيّرُ
 * (`--lines:9`) والموضعُ في الرسم يمرّ، والهامشُ والحشوُ والفجوةُ والعرضُ بالبكسل يردّ.
 */
export function inlineSpacing(code) {
  const out = []
  for (const m of code.matchAll(/\sstyle="([^"]*)"/g)) {
    const fixed = stripExpressions(m[1])
    const why = /(^|;)\s*(margin|padding|gap|row-gap|column-gap)[\w-]*\s*:/.test(fixed)
      ? 'مسافةٌ في السِّمة'
      : /(^|;)\s*(min-|max-)?width\s*:\s*\d+px/.test(fixed) ? 'عرضٌ بالبكسل في السِّمة' : null
    if (why !== null) out.push({ line: code.slice(0, m.index).split('\n').length, why, style: m[1].slice(0, 48) })
  }
  return out
}

/**
 * ── محدّدٌ في نصٍّ برمجيٍّ يسمّي صنفًا لا قاعدةَ له (مراجعةُ D-189) ─────────────────────
 *
 * أعادت المرحلةُ ٢ب تسميةَ الأصناف في سِمات `class` والورقة، **ولم تبلغ المحدّداتِ في
 * `scripts/`**: `audit_design` يقرأ `.tile .v` فلا يجد شيئًا فيقول «لا تعادل» على كلّ لوح،
 * و`meter.ts` يقرأ `.flash` فتُسجَّل كلُّ خطوةٍ في الرحلات «بلا إشعار»، و`audit_print` يقرأ
 * `.theme` فلا يرى المبدّلَ مطبوعًا. **محدّدٌ لا يطابق شيئًا لا يردّ — يُطفئ الحارسَ بصمت.**
 *
 * فيُقرأ النصُّ الخامُ لا الشجرة (سكربتُ اللوحة نصٌّ داخل قالب): كلُّ حرفيّةٍ تُعطى لـ
 * `querySelector(All)` و`closest` و`matches` و`locator` و`waitForSelector` و`$`/`$$`/`$eval`،
 * ولـ`classList.contains`؛ وتُمحى منها `${…}` وما بين `[…]` (قيمُ السِّمات فيها نقاط)، ثمّ
 * كلُّ `.اسم` فيها يجب أن يكون في `STYLE` أو مقبضًا في `HOOKS` أو في `SELECTOR_EXEMPT` بسببه.
 */
const CALL = /(?:\b(?:querySelector(?:All)?|closest|matches|locator|waitForSelector)|\.\$\$?(?:eval)?)\(\s*(['"`])/g
const CONTAINS = /classList\.contains\(\s*(['"`])/g

/** الحرفيّةُ من موضعها حتّى قوسها المطابق — و`${…}` علامةُ «محسوب»؛ ‏null إن لم تُغلَق. */
function literalAt(code, i, quote) {
  let out = ''
  for (let j = i; j < code.length;) {
    const ch = code[j]
    if (ch === '\\') { out += code[j + 1] ?? ''; j += 2; continue }
    if (ch === quote) return out
    if (ch === '\n' && quote !== '`') return null
    if (quote === '`' && ch === '$' && code[j + 1] === '{') {
      let depth = 1
      j += 2
      while (j < code.length && depth > 0) {
        if (code[j] === '{') depth += 1
        else if (code[j] === '}') depth -= 1
        j += 1
      }
      out += DYN
      continue
    }
    out += ch
    j += 1
  }
  return null
}
const DYN = '\u0001'

/** يعيد `[{ line, cls, sel }]`: كلَّ صنفٍ يسمّيه محدّدٌ أو `classList.contains` في النصّ. */
export function selectorClasses(code) {
  const out = []
  const lineAt = (i) => code.slice(0, i).split('\n').length
  for (const m of code.matchAll(CALL)) {
    const sel = literalAt(code, m.index + m[0].length, m[1])
    if (sel === null) continue
    const bare = sel.replace(/\[[^\]]*\]/g, ' ').replace(/(['"])(?:(?!\1).)*\1/g, ' ')
    // ‏صنفٌ يلاصقه `${…}` (`.row-${kind}`) محسوبٌ لا اسم — لا يُحكَم عليه
    for (const c of bare.matchAll(/\.(-?[_a-zA-Z][\w-]*)(\u0001)?/g)) {
      if (c[2] === undefined) out.push({ line: lineAt(m.index), cls: c[1], sel: sel.replaceAll(DYN, '…').slice(0, 56) })
    }
  }
  for (const m of code.matchAll(CONTAINS)) {
    const cls = literalAt(code, m.index + m[0].length, m[1])
    if (cls !== null && /^-?[_a-zA-Z][\w-]*$/.test(cls)) out.push({ line: lineAt(m.index), cls, sel: `classList.contains('${cls}')` })
  }
  return out
}

/** صنفٌ يُبحث عنه ولا قاعدةَ له **قصدًا** — ومعه سببُه. */
const SELECTOR_EXEMPT = new Map([
  ['ragged', 'إعفاءُ الشبكة الممزَّقة في audit_design: يُعَدّ ويُطبَع عددُه، ولا يُكتب في الوسم اليوم (D-124)'],
])

const SYSTEM_GLYPHS = new Set(['▾', '▸', '▲', '▼', '←', '→', '⌘'])
const ARROWS = new Set(['←', '→'])
const GLYPH_HOME = /ui\/(parts|icons|components\/badge)\.ts$/

/** الكيانُ والهروبُ يُفَكّان: `&larr;` حرفٌ كما لو كُتب. */
function decode(text) {
  const keep = (code, whole) => {
    const ch = String.fromCodePoint(code)
    return SYSTEM_GLYPHS.has(ch) ? ch : whole
  }
  return text
    .replace(/&larr;/gi, '←').replace(/&rarr;/gi, '→')
    .replace(/&#x([0-9a-f]+);/gi, (w, h) => keep(Number.parseInt(h, 16), w))
    .replace(/&#(\d+);/g, (w, d) => keep(Number(d), w))
    .replace(/\\([0-9a-f]{4,6}) ?/gi, (w, h) => keep(Number.parseInt(h, 16), w))
}

/** أقربُ ما ليس فراغًا في اتّجاه `step`، أو `edge` عند طرف الحرفيّة. */
function neighbour(text, i, step) {
  for (let j = i + step; j >= 0 && j < text.length; j += step) {
    if (!/\s/.test(text[j])) return text[j]
  }
  return 'edge'
}

const KEY_PASS = new Set([
  ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.AmpersandAmpersandToken,
])

/** يعيد `{ bad, prose }`: ما يردّ بسطره وسببه، وسهامَ النصّ بسطورها. */
export function rawGlyphs(name, code) {
  const src = ts.createSourceFile(name, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const bad = []
  const prose = []
  const lineOf = (node, text, i) =>
    src.getLineAndCharacterOfPosition(node.getStart(src)).line + 1 + (text.slice(0, i).match(/\n/g) ?? []).length

  const visit = (node) => {
    const literal = ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)
    if (literal) {
      // ‏التعليقُ داخل القالب (ورقةٌ أو سكربت) يُمحى بفراغٍ يحفظ السطور
      const text = decode(node.text ?? '').replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
      const alone = (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
        [...text.trim()].length === 1 && SYSTEM_GLYPHS.has(text.trim())
      if (alone) {
        let n = node
        while (n.parent !== undefined && (ts.isParenthesizedExpression(n.parent) ||
          (ts.isConditionalExpression(n.parent) && n !== n.parent.condition) ||
          (ts.isBinaryExpression(n.parent) && KEY_PASS.has(n.parent.operatorToken.kind)))) n = n.parent
        const glued = n.parent !== undefined && ts.isBinaryExpression(n.parent) &&
          n.parent.operatorToken.kind === ts.SyntaxKind.PlusToken
        if ((n.parent !== undefined && ts.isTemplateSpan(n.parent)) || glued) {
          bad.push({ line: lineOf(node, text, 0), ch: text.trim(), why: 'يُقحَم في الوسم خامًا — ارسمه بـglyph()' })
        }
      } else {
        for (let i = 0; i < text.length; i++) {
          const ch = text[i]
          if (!SYSTEM_GLYPHS.has(ch)) continue
          if (ARROWS.has(ch) && neighbour(text, i, -1) !== '>' && neighbour(text, i, 1) !== '<') {
            prose.push({ line: lineOf(node, text, i), ch })
            continue
          }
          bad.push({
            line: lineOf(node, text, i), ch,
            why: ARROWS.has(ch) ? 'سهمُ رابطٍ عند حدّ وسم — ICON.back أو ICON.go' : 'في الوسم أو الورقة',
          })
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(src)
  return { bad, prose }
}

if (process.argv.includes('--self-test')) {
  const sample ='x(`<span class="st ${ok ? \'ok\' : \'bad\'} ${n}">` + `class="chip"`); el.classList.add(\'lifted\'); el.className=\'ago\''
  const found = classesOf(sample)
  const want = ['st', 'ok', 'bad', 'chip', 'lifted', 'ago']
  const missing = want.filter((c) => !found.has(c))
  if (missing.length > 0 || found.has('n')) {
    console.log(`  ✕ self-test: missing ${missing.join(',')}${found.has('n') ? ' · n counted' : ''}`)
    process.exit(1)
  }
  console.log('  ✓ self-test: الأصنافُ داخل ${…} وفي classList تُقرأ')

  /*
   * ‏والحرفُ الساقط: كلُّ عيبٍ مزروعٍ يُمسَك بسطره، وكلُّ صوابٍ يمرّ — والعددُ
   * ‏بعينه. والعيوبُ بصيغها التي كانت في الشجرة قبل D-167.
   */
  const planted = [
    "const a = `<a href=\"${h}\">→ ${label}</a>`",
    "const b = `<a class=\"btn\">${label} ←</a>`",
    "const c = `<span class=\"ar\">${up ? '▲' : '▼'}</span>`",
    "const d = `<kbd class=\"kbd\">⌘K</kbd>`",
    "export const STYLE = `.t::after{content:'▾'} /* ▸ في شرح */`",
    "const e = `<a>&larr; عودة</a>`",
    "const f = '<i>' + '▲'",
    "const ok1 = status('bad', '▲', 'x') + chip('warn', up ? '▲' : '○', 'y')",
    "const ok2 = { failed: { g: '▲' } }; if (g === '▼') {}",
    '// ← تعليقٌ لا يُقرأ ⌘',
    "const ok3 = 'console.x.ai ← API Keys'; const ok4 = `${task} ← ${model}`",
    "const g2 = `.x::after{content:'\\\\25BE'}`",
  ].join('\n')
  const got = rawGlyphs('planted.ts', planted)
  const lines = got.bad.map((b) => b.line)
  const wantLines = [1, 2, 3, 3, 4, 5, 6, 7, 12]
  if (JSON.stringify(lines) !== JSON.stringify(wantLines) || got.prose.length !== 2) {
    console.log(`  ✕ self-test: الحرفُ الساقط — ردّ ${JSON.stringify(lines)} والمطلوب ${JSON.stringify(wantLines)}` +
      ` · سهامُ النصّ ${got.prose.length} والمطلوب 2`)
    process.exit(1)
  }
  console.log('  ✓ self-test: تسعةُ حروفٍ مزروعةٍ تُمسَك بسطورها، والمفتاحُ والشرحُ وفاصلُ المسار تمرّ')

  // ‏والسِّمةُ: خمسٌ مزروعةٌ تردّ، وأربعٌ محسوبةٌ أو متغيّرةٌ تمرّ (D-189)
  const styled = [
    '<div class="card" style="margin-top:var(--s-3)">',
    '<p style="padding:0 var(--s-3); color:red">',
    '<div class="row" style="gap:var(--s-2)">',
    '<input style="width:90px">',
    '<div style="--lines:9; margin:${m}">',
    '<i style="width:${pct.toFixed(1)}%"></i>',
    '<span style="left:${px(x)};top:${py(y)}">',
    '<textarea style="${box}">',
    '<i style="background:color-mix(in srgb,var(--brand) ${t}%,transparent)">',
  ].join('\n')
  const caught = inlineSpacing(styled).map((h) => h.line)
  if (JSON.stringify(caught) !== JSON.stringify([1, 2, 3, 4, 5])) {
    console.log(`  ✕ self-test: style="" — ردّ ${JSON.stringify(caught)} والمطلوب [1,2,3,4,5]`)
    process.exit(1)
  }
  console.log('  ✓ self-test: خمسُ سِماتِ مسافةٍ مزروعةٍ تُمسَك، والمحسوبُ من البيان يمرّ')

  // ‏والمحدّدُ الشائخ: الستّةُ التي فاتت إعادةَ التسمية في ٢ب تُمسَك بأسمائها، والسليمُ يمرّ
  const selectors = [
    "document.querySelectorAll('#flash .flash, .flash[role=\"alert\"]')",
    "const vs = [...s.querySelectorAll('.tile .v')]",
    "page.locator('.card.tile').filter({ has: page.locator('.k', { hasText: /x/ }) })",
    "const s = `var b=f.querySelector('button.p'); if(el.classList.contains('gone')){}`",
    "el.closest(`.row-${kind} a[href$=\".png\"]`)",
    "await page.$$eval('[data-pane] .tile .kv-v, a[title=\"a.b\"]', (e) => e)",
    "el.matches(':focus-visible'); el.closest('a'); matches(secret, step)",
  ].join('\n')
  const named = selectorClasses(selectors).map((h) => `${h.line}:${h.cls}`)
  const wantNamed = ['1:flash', '1:flash', '2:tile', '2:v', '3:card', '3:tile', '3:k', '4:p', '6:tile', '6:kv-v', '4:gone']
  if (JSON.stringify(named) !== JSON.stringify(wantNamed)) {
    console.log(`  ✕ self-test: المحدّد — قرأ ${JSON.stringify(named)} والمطلوب ${JSON.stringify(wantNamed)}`)
    process.exit(1)
  }
  console.log('  ✓ self-test: المحدّدُ في الشجرة وفي سكربتٍ داخل قالب يُقرأ، وقيمُ السِّمات و${…} لا تُعدّ أصنافًا')
  process.exit(0)
}

const used = new Map()
for (const file of walk(ROUTES)) {
  if (file === STYLES || file.endsWith('tokens.ts')) continue
  for (const cls of classesOf(readFileSync(file, 'utf8'))) {
    if (!used.has(cls)) used.set(cls, new Set())
    used.get(cls).add(file.slice(ROOT.length))
  }
}

/*
 * ── رقاقةُ الحال من دالّتها وحدَها (D-154) ────────────────────────────
 * `<span class="st-ic">` يرسمه `status()` في parts.ts؛ من كتبه يدًا أعاد
 * الحرفَ الساقطَ إلى خطّ النظام وفرّق ما وُحّد. **والاسمُ القديمُ يُمسَك معه**
 * (D-183): `<span class="g">` كان رمزَ الحال، وهو صنفُ الزرّ الشبحيّ — فمن
 * أعاده يدًا أعاد المربّعَ الأبيضَ داخل الحبّة.
 */
const handChips = []
for (const file of walk(ROUTES)) {
  if (file.endsWith('/parts.ts') || file.endsWith('/components/badge.ts') || file === STYLES) continue
  const code = readFileSync(file, 'utf8')
  const n = (code.match(/<span class="(?:g|st-ic)">/g) ?? []).length
  if (n > 0) handChips.push([file.slice(ROOT.length), n])
}
console.log('\n═══ رقاقةُ حالٍ مكتوبةٌ يدًا ═══\n')
if (handChips.length === 0) console.log('  ✓ كلُّ شارةٍ من statusBadge()')
for (const [where, n] of handChips) console.log(`  ✕ ${where}  ×${n}`)

/* ── حرفٌ من خطّ النظام في الوسم (D-167) — والشرحُ عند rawGlyphs ─── */
const glyphHits = []
const proseArrows = new Map()
for (const file of walk(ROUTES)) {
  if (GLYPH_HOME.test(file)) continue
  const { bad: hits, prose } = rawGlyphs(file, readFileSync(file, 'utf8'))
  const short = file.slice(ROOT.length)
  for (const h of hits) glyphHits.push(`${short}:${h.line}  «${h.ch}» ${h.why}`)
  if (prose.length > 0) proseArrows.set(short, prose.length)
}
console.log('\n═══ حرفٌ من خطّ النظام في الوسم أو الورقة ═══\n')
if (glyphHits.length === 0) console.log('  ✓ لا ▾ ▸ ▲ ▼ ⌘ ولا سهمَ رابطٍ حرفًا — الرسمُ من parts وicons')
for (const h of glyphHits) console.log(`  ✕ ${h}`)
const proseTotal = [...proseArrows.values()].reduce((a, b) => a + b, 0)
console.log(`\n  · سهمٌ في نصٍّ لا يلاصق وسمًا (يُطبَع ولا يردّ): ${proseTotal} في ${proseArrows.size} ملفّات`)
for (const [where, n] of proseArrows) console.log(`      ${where}  ×${n}`)

/* ── سِمةُ «style» للمسافة (D-189) — والشرحُ عند inlineSpacing ─── */
const inlineHits = []
let inlineKept = 0
for (const file of walk(ROUTES)) {
  if (file === STYLES) continue
  const code = readFileSync(file, 'utf8')
  inlineKept += (code.match(/\sstyle="[^"]+"/g) ?? []).length
  for (const h of inlineSpacing(code)) inlineHits.push(`${file.slice(ROOT.length)}:${h.line}  ${h.why} — style="${h.style}"`)
}
console.log('\n═══ سِمةُ style="" للمسافة ═══\n')
if (inlineHits.length === 0) console.log(`  ✓ لا هامشَ ولا حشوَ ولا فجوةَ ولا عرضَ بالبكسل في سِمة (${inlineKept - inlineHits.length} سِمةً محسوبةً من البيان باقية)`)
for (const h of inlineHits) console.log(`  ✕ ${h}`)

let bad = handChips.length + glyphHits.length + inlineHits.length
console.log('\n═══ صنفٌ يُكتب ولا يُرسَم ═══\n')
for (const [cls, files] of [...used].sort()) {
  if (defined.has(cls)) continue
  if (HOOKS.has(cls)) continue
  bad += 1
  console.log(`  ✕ .${cls}  ←  ${[...files].join(' · ')}`)
}
if (bad === 0) console.log('  ✓ كلُّ صنفٍ في الوسم له قاعدة')

/* ── محدّدٌ يسمّي صنفًا لا قاعدةَ له (مراجعةُ D-189) — والشرحُ عند selectorClasses ─── */
const SCRIPTS = new URL('../scripts/', import.meta.url).pathname
const SELF = new URL(import.meta.url).pathname
function walkCode(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) out.push(...walkCode(path))
    else if (/\.(ts|mjs|js)$/.test(name)) out.push(path)
  }
  return out
}
const staleSel = []
const selExemptSeen = new Set()
let selCount = 0
// ‏والمدقّقُ نفسُه لا يُقرأ: عيوبُه المزروعةُ في «--self-test» محدّداتٌ شائخةٌ قصدًا
for (const file of [...walkCode(ROOT), ...walkCode(SCRIPTS)]) {
  if (file === SELF) continue
  for (const h of selectorClasses(readFileSync(file, 'utf8'))) {
    selCount += 1
    if (defined.has(h.cls) || HOOKS.has(h.cls)) continue
    if (SELECTOR_EXEMPT.has(h.cls)) { selExemptSeen.add(h.cls); continue }
    staleSel.push(`${file.slice(file.startsWith(SCRIPTS) ? SCRIPTS.length - 'scripts/'.length : ROOT.length - 'src/'.length)}:${h.line}  .${h.cls}  ←  «${h.sel}»`)
  }
}
console.log('\n═══ محدّدٌ في نصٍّ برمجيٍّ يسمّي صنفًا لا قاعدةَ له ═══\n')
if (staleSel.length === 0) console.log(`  ✓ كلُّ صنفٍ في ${selCount} محدّدًا (src/ وscripts/) له قاعدةٌ أو مقبضٌ مُعفًى`)
for (const h of staleSel) console.log(`  ✕ ${h}`)
for (const [cls, why] of SELECTOR_EXEMPT) {
  const alive = selExemptSeen.has(cls)
  console.log(`  ${alive ? '·' : '✕'} .${cls} — ${why}${alive ? '' : ' — **ولم يعد يُبحَث عنه: احذفه من القائمة**'}`)
}
const selStale = staleSel.length + [...SELECTOR_EXEMPT.keys()].filter((c) => !selExemptSeen.has(c)).length

console.log('\n═══ مقبضٌ مُعفًى بسببه ═══\n')
let stale = 0
for (const [cls, why] of HOOKS) {
  const alive = used.has(cls)
  if (!alive) stale += 1
  console.log(`  ${alive ? '·' : '✕'} .${cls} — ${why}${alive ? '' : ' — **ولم يعد يُكتب: احذفه من القائمة**'}`)
}

/**
 * ── محدّدٌ يُعلَن مرّتين (D-148) ──────────────────────────────────────
 *
 * كانت الطبعاتُ تُكتب كتلًا آخرَ الورقة تغلب ما قبلها بالترتيب، فصار ‏٤٩
 * محدّدًا يُعلَن مرّتين إلى خمس، والقارئُ لا يعرف أيُّها الساري إلّا بقراءة
 * الورقة كلِّها. وفي D-148 دُمجت في مواضعها بعد أن قِيست الأنماطُ المحسوبة
 * فلم تتغيّر. **فالقاعدةُ**: محدّدٌ واحدٌ في المستوى الأعلى يُعلَن مرّةً؛
 * وما يُعاد داخلَ @media أو @supports لا يُعدّ، فذلك شرطٌ لا تكرار.
 */
const sheet = readFileSync(STYLES, 'utf8')
const cssStart = sheet.indexOf('export const STYLE = TOKENS + `') + 'export const STYLE = TOKENS + `'.length
// ‏وتعبيرُ القالب يُمحى قبل العدّ: «@media${below('sm')}{» فيه قوسا «${…}»، فيُقرأ
// ‏القوسُ الأوّلُ كتلةً بمحدّدٍ فارغ (D-187 — نقاطُ الانكسار من «BP»)
const css = stripExpressions(sheet.slice(cssStart, sheet.lastIndexOf('`')))
  .replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length))
const seen = new Map()
let depth = 0
let selStart = 0
for (let i = 0; i < css.length; i++) {
  const c = css[i]
  if (c === '{') {
    if (depth === 0) {
      const sel = css.slice(selStart, i).trim().replace(/\s+/g, ' ')
      if (!sel.startsWith('@')) seen.set(sel, (seen.get(sel) ?? 0) + 1)
    }
    depth++
  } else if (c === '}') {
    depth--
    if (depth === 0) selStart = i + 1
  }
}
const twice = [...seen].filter(([, n]) => n > 1)

/**
 * ── لا صنفَ من حرفٍ واحد، وتعدادُ الصيغ (خطّة التصميم 7 · D-189) ───────────────────────
 *
 * «.p» و«.g» و«.d» للأزرار، و«.k» و«.v» و«.n» للصق والقيمة والملحوظة، و«.i» و«.t» و«.f» و«.x»
 * و«.y» — **أحدَ عشرَ صنفًا من حرفٍ واحد**، و«.g» منها اصطدم مرّةً برمز الحال (D-183). وصارت
 * عائلاتٍ بادئتُها اسمُ مكوّنها، **فحرفٌ واحدٌ يُكتب في الورقة أو الوسم يردّ**.
 *
 * والتعدادُ سقفٌ لا هدف: سطوحٌ بقاعدتها (أرضٌ ونصفُ قطر البطاقة) وحبوبٌ بنصّ لصيقة. العُدّةُ
 * تعرّف أربعَ صيغ بطاقةٍ وشارتين (`components/`)، **والأقسامُ تُنقَل إليها في ٢ج** فينزل السقفُ
 * حتّى يبلغهما — ورقمٌ يزيد على سقفه يردّ، ورقمٌ ينقص يُخفَض سقفُه في الطلب نفسِه.
 */
const oneLetter = [...new Set([...defined, ...used.keys()])].filter((c) => c.length === 1).sort()
const CARD_MAX = 13
const BADGE_MAX = 6
const surfaces = new Set()
const pills = new Set()
{
  let d = 0
  let start = 0
  for (let i = 0; i < css.length; i++) {
    if (css[i] === '{') { if (d === 0) start = i; d += 1 }
    else if (css[i] === '}') {
      d -= 1
      if (d !== 0) continue
      const head = css.slice(css.lastIndexOf('}', start - 1) + 1, start).trim().replace(/\s+/g, ' ')
      if (head.startsWith('@')) continue
      const decl = Object.fromEntries(css.slice(start + 1, i).split(';').map((x) => x.split(':'))
        .filter((x) => x.length > 1).map(([k, ...v]) => [k.trim(), v.join(':').trim()]))
      const bg = decl.background ?? decl['background-color']
      if (decl['border-radius'] === 'var(--r-card)' && bg !== undefined && !/transparent|none/.test(bg)) surfaces.add(head)
      if (decl['border-radius'] === 'var(--r-pill)' && /--t-(caption|code|small)/.test(decl['font-size'] ?? '')) pills.add(head)
    }
  }
}
const census = [
  ...(surfaces.size > CARD_MAX ? [`سطوحٌ بقاعدتها ${surfaces.size} — والسقفُ ${CARD_MAX}`] : []),
  ...(pills.size > BADGE_MAX ? [`حبوبٌ بقاعدتها ${pills.size} — والسقفُ ${BADGE_MAX}`] : []),
]
console.log('═══ محدّدٌ يُعلَن مرّتين ═══\n')
if (twice.length === 0) console.log('  ✓ كلُّ محدّدٍ في المستوى الأعلى يُعلَن مرّةً')
for (const [sel, n] of twice) console.log(`  ✕ ${sel}  —  ${n} مرّات`)

console.log('\n═══ صنفٌ من حرفٍ واحد ═══\n')
if (oneLetter.length === 0) console.log('  ✓ لا صنفَ من حرفٍ واحد في الورقة ولا في الوسم')
for (const c of oneLetter) console.log(`  ✕ .${c}`)

console.log('\n═══ تعدادُ الصيغ (سقفٌ يمنع الرجوع) ═══\n')
// ‏`LIST=1` يطبع السطوحَ نفسَها: ما يُنقل إلى العُدّة في الطلب التالي
if (process.env.LIST) console.log([...surfaces].join('\n'))
console.log(`  ${surfaces.size > CARD_MAX ? '✕' : '·'} سطوحٌ بقاعدتها: ${surfaces.size} من سقف ${CARD_MAX} — والعُدّةُ أربعُ صيغ (card · card-interactive · card-inset · card-alert)`)
console.log(`  ${pills.size > BADGE_MAX ? '✕' : '·'} حبوبٌ بقاعدتها: ${pills.size} من سقف ${BADGE_MAX} — ${[...pills].join(' · ')}`)

const fails = bad + stale + twice.length + oneLetter.length + census.length + selStale
console.log(`\nالمجموع: ${bad} صنفا بلا قاعدة · ${stale} إعفاءً شاخ · ${twice.length} محدّدًا مكرّرًا · ${oneLetter.length} من حرفٍ واحد · ${census.length} فوق سقفه · ${selStale} محدّدًا شائخًا\n`)
process.exit(fails === 0 ? 0 : 1)

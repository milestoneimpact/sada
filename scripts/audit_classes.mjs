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
const SYSTEM_GLYPHS = new Set(['▾', '▸', '▲', '▼', '←', '→', '⌘'])
const ARROWS = new Set(['←', '→'])
const GLYPH_HOME = /ui\/(parts|icons)\.ts$/

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
  if (file.endsWith('/parts.ts') || file === STYLES) continue
  const code = readFileSync(file, 'utf8')
  const n = (code.match(/<span class="(?:g|st-ic)">/g) ?? []).length
  if (n > 0) handChips.push([file.slice(ROOT.length), n])
}
console.log('\n═══ رقاقةُ حالٍ مكتوبةٌ يدًا ═══\n')
if (handChips.length === 0) console.log('  ✓ كلُّ رقاقةٍ من status()')
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

let bad = handChips.length + glyphHits.length
console.log('\n═══ صنفٌ يُكتب ولا يُرسَم ═══\n')
for (const [cls, files] of [...used].sort()) {
  if (defined.has(cls)) continue
  if (HOOKS.has(cls)) continue
  bad += 1
  console.log(`  ✕ .${cls}  ←  ${[...files].join(' · ')}`)
}
if (bad === 0) console.log('  ✓ كلُّ صنفٍ في الوسم له قاعدة')

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
console.log('═══ محدّدٌ يُعلَن مرّتين ═══\n')
if (twice.length === 0) console.log('  ✓ كلُّ محدّدٍ في المستوى الأعلى يُعلَن مرّةً')
for (const [sel, n] of twice) console.log(`  ✕ ${sel}  —  ${n} مرّات`)

console.log(`\nالمجموع: ${bad} صنفا بلا قاعدة · ${stale} إعفاءً شاخ · ${twice.length} محدّدًا مكرّرًا\n`)
process.exit(bad + stale + twice.length === 0 ? 0 : 1)

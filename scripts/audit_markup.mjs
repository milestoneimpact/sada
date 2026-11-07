/**
 * سقّاطةُ الوسم المكتوب باليد (D-325): **زرٌّ وبطاقةٌ وحقلٌ خارج دوالّ العُدّة تُعَدّ، والعددُ لا يصعد**.
 *
 * ## لماذا
 *
 * العُدّةُ (`src/routes/ui/components/`) دوالٌّ تحمل ما لا يقوله الصنف: `button()` يكتب سببَ التعطيل ومربطَه والمشغولَ،
 * و`card()` الرأسَ والصيغة، و`field()` اللصيقةَ والتلميحَ والخطأَ ومرابطَها. **والوسمُ المكتوبُ باليد يلبس الصنفَ ويتخطّى
 * العقد**: قاس تقييمُ النضج ‏212 زرًّا بـ`class="btn…"` مقابل ‏15 نداءً لـ`button()`، و‏187 بطاقةً مقابل نداءين لـ`card()`،
 * ومن الأزرار المكتوبة باليد ثمانيةٌ معطَّلةٌ بلا سبب (`audit_disabled` يقيسها مرسومة). ولا يُترجَم المشروعُ دفعةً واحدة،
 * **والطريقُ سقّاطة** كسقّاطة قالب `html` (D-281):
 *
 * - يُحفَظ لكلّ ملفٍّ في `src/routes/` (سوى `components/` والاختبارات) عددُ زرّه وبطاقته وحقله المكتوبة باليد في
 *   `scripts/markup-baseline.json`، **ويسقط الفحصُ إن زاد عددٌ في ملفّ** (وسمٌ جديدٌ باليد)، **أو نقص ولم يُحدَّث الملفّ**
 *   (فلا يرتدّ الخطُّ بعد أن تقدّم). و`--write` يكتب خطَّ الأساس.
 * - **وزرٌّ بلا درجة يسقط مطلقًا**: `class="btn"` وحدَه لا أرضَ له ولا حدّ (كان «انتقل إليها» في المنظّمات)؛ والدرجةُ
 *   اسمُها في الصنف أو تعبيرٌ يختارها (`btn ${…}`).
 *
 * ## ما يُعَدّ
 *
 * | الصنف | ما يُعَدّ |
 * |---|---|
 * | زرّ | سِمةُ `class` كلمتُها الحرفيّةُ `btn` |
 * | بطاقة | سِمةُ `class` فيها `card` (وصيغُها الثلاث تُكتب `card card-…`) |
 * | حقل | وسمُ `<input>` ليس `type="hidden"`، ولا في وسيط `control:` لـ`field()` (ذاك الحقلُ في عقده) |
 *
 * `--self-test` يزرع زرًّا وبطاقةً وحقلًا وحقلًا مخفيًّا وحقلًا في `control:` وزرًّا بلا درجة، ويتحقّق أنّ العدَّ يراها كما يجب.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const SRC = new URL('../src/', import.meta.url).pathname
const ROUTES = join(SRC, 'routes')
const BASELINE = new URL('./markup-baseline.json', import.meta.url).pathname

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) out.push(...walk(path))
    else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) out.push(path)
  }
  return out
}

/** سِماتُ `class` بنصّها الحرفيّ — ما بين `${…}` يُطوى إلى علامة، والتداخلُ يوازَن. */
function classAttrs(code) {
  const out = []
  let i = 0
  while ((i = code.indexOf('class="', i)) !== -1) {
    let j = i + 7
    let depth = 0
    let literal = ''
    let dynamic = false
    while (j < code.length) {
      const ch = code[j]
      if (depth === 0 && ch === '"') break
      if (ch === '$' && code[j + 1] === '{') { depth += 1; dynamic = true; literal += ' \u0001 '; j += 2; continue }
      if (depth > 0 && ch === '{') { depth += 1; j += 1; continue }
      if (depth > 0 && ch === '}') { depth -= 1; j += 1; continue }
      if (depth === 0) literal += ch
      j += 1
    }
    out.push({ tokens: literal.split(/\s+/).filter(Boolean), dynamic, at: code.slice(0, i).split('\n').length })
    i = j + 1
  }
  return out
}

/** يمحو وسيطَ `control:` (حقلُ `field()` في عقده) قبل عدّ الحقول. */
function withoutControls(code) {
  return code.replace(/control:\s*(?:html)?(`[\s\S]*?`|'[^'\n]*'|"[^"\n]*")/g, 'control: null')
}

export function countMarkup(code) {
  const attrs = classAttrs(code)
  const buttons = attrs.filter((a) => a.tokens.includes('btn'))
  const cards = attrs.filter((a) => a.tokens.includes('card'))
  const inputs = [...withoutControls(code).matchAll(/<input\b([^>]*)>/g)].filter((m) => !/type="hidden"/.test(m[1] ?? ''))
  // ‏زرٌّ بلا درجة: لا «btn-<درجة>» حرفيًّا ولا تعبيرٌ يختارها
  const bare = buttons.filter((a) => !a.dynamic && !a.tokens.some((t) => /^btn-(?:primary|secondary|quiet|danger|icon)$/.test(t)))
  return { buttons: buttons.length, cards: cards.length, inputs: inputs.length, bare: bare.map((a) => a.at) }
}

function selfTest() {
  const cases = [
    ['<button class="btn btn-primary">أ</button>', { buttons: 1, cards: 0, inputs: 0, bare: 0 }],
    ['<a class="btn ${x ? \'btn-primary\' : \'btn-secondary\'} btn-sm" href="/">أ</a>', { buttons: 1, cards: 0, inputs: 0, bare: 0 }],
    ['<button class="btn" type="submit">انتقل</button>', { buttons: 1, cards: 0, inputs: 0, bare: 1 }],
    ['<div class="card card-inset">ب</div><span class="btn-why">ج</span>', { buttons: 0, cards: 1, inputs: 0, bare: 0 }],
    ['<input type="hidden" name="id"><input name="q"><input type="checkbox">', { buttons: 0, cards: 0, inputs: 2, bare: 0 }],
    ['field({ id: "a", label: "ب", control: \'<input name="a">\' })', { buttons: 0, cards: 0, inputs: 0, bare: 0 }],
    ['field({ id: "a", label: "ب", control: html`<input name="a" value="${v}">` })', { buttons: 0, cards: 0, inputs: 0, bare: 0 }],
  ]
  for (const [code, want] of cases) {
    const got = countMarkup(code)
    const flat = { ...got, bare: got.bare.length }
    if (JSON.stringify(flat) !== JSON.stringify(want)) {
      console.error(`✕ الفحصُ الذاتيّ: ${code}\n  أراد ${JSON.stringify(want)} ووجد ${JSON.stringify(flat)}`)
      process.exit(1)
    }
  }
  console.log(`  ✓ الفحصُ الذاتيّ: ${cases.length} مزروعًا عُدّ كما يجب (والحقلُ المخفيُّ وحقلُ «control:» لا يُعدّان)`)
}

if (process.argv.includes('--self-test')) selfTest()

const now = {}
const bare = []
for (const f of walk(ROUTES).filter((f) => !f.includes('/components/') && !f.includes('/test/'))) {
  const c = countMarkup(readFileSync(f, 'utf8'))
  const rel = relative(SRC, f)
  for (const line of c.bare) bare.push(`${rel}:${line}`)
  if (c.buttons + c.cards + c.inputs > 0) now[rel] = { buttons: c.buttons, cards: c.cards, inputs: c.inputs }
}
const sum = (o, k) => Object.values(o).reduce((n, v) => n + (v[k] ?? 0), 0)

if (process.argv.includes('--write')) {
  const sorted = Object.fromEntries(Object.entries(now).sort(([a], [b]) => a.localeCompare(b)))
  writeFileSync(BASELINE, JSON.stringify(sorted, null, 2) + '\n')
  console.log(`  ✓ كُتب خطُّ الأساس: ${sum(now, 'buttons')} زرًّا · ${sum(now, 'cards')} بطاقة · ${sum(now, 'inputs')} حقلًا باليد في ${Object.keys(now).length} ملفًّا`)
  process.exit(0)
}

let base = {}
try { base = JSON.parse(readFileSync(BASELINE, 'utf8')) } catch { base = {} }
const notes = []
for (const file of new Set([...Object.keys(base), ...Object.keys(now)])) {
  for (const k of ['buttons', 'cards', 'inputs']) {
    const was = base[file]?.[k] ?? 0
    const is = now[file]?.[k] ?? 0
    const name = { buttons: 'زرّ', cards: 'بطاقة', inputs: 'حقل' }[k]
    if (is > was) notes.push(`${file}: ${name} باليد ${was} ← ${is} — اكتبه بدالّة العُدّة (components/)`)
    else if (is < was) notes.push(`${file}: ${name} باليد ${was} ← ${is} — نزل العدد: حدّث الأساس بـ «node scripts/audit_markup.mjs --write»`)
  }
}
for (const b of bare) notes.push(`${b}: زرٌّ بلا درجة («btn» وحدَه) — أضف btn-primary أو btn-secondary أو btn-quiet أو btn-danger`)

if (notes.length === 0) {
  console.log(`  ✓ الوسمُ باليد لم يصعد: ${sum(now, 'buttons')} زرًّا · ${sum(now, 'cards')} بطاقة · ${sum(now, 'inputs')} حقلًا خارج العُدّة، ولا زرَّ بلا درجة`)
} else {
  for (const n of notes) console.log(`  ✕ ${n}`)
  console.log(`\nالمجموع: ${notes.length} ملحوظة`)
  process.exit(1)
}

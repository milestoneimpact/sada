/**
 * مدقّقُ الرموز: **رمزٌ يُنادى ولا وجودَ له، ورمزٌ موجودٌ لا ينادِيه أحد.**
 *
 * ## لماذا
 *
 * `audit_dead` يسأل عن كلّ رمزٍ مُصدَّرٍ في TypeScript أينادِيه أحد،
 * و`audit_columns` يسأل عن كلّ عمودٍ في D1 أيقرؤه أحد. **وطبقةُ CSS
 * بينهما بلا حارس** — وفيها ما فيهما من العلل:
 *
 * | ما وُجد | العلّة | نظيرُها |
 * |---|---|---|
 * | `--ls-eyebrow` يُنادى ولا يُعرَّف | القاعدةُ تُقرأ صحيحةً **وأثرُها صفر** | D-057 |
 * | سبعةُ رموزٍ تُعرَّف ولا تُنادى | بُني ولم يُستعمَل | D-067 |
 *
 * والأولى أخبثُ: `letter-spacing:var(--ls-eyebrow)` **تُقرأ في المراجعة
 * سطرا صحيحا**، ويسقط المتصفّح إلى `normal` بلا خطأ ولا تحذير. فلا
 * اختبارٌ يمسكها (القيمةُ ليست في عقد)، ولا عينٌ تراها (الفرقُ ثُمنُ
 * بكسلٍ على لصيقة).
 *
 * ## وثلاثةُ أشكالٍ تخدع أوّلَ صياغة
 *
 * | ما يقع | ما يظهر | العلاج |
 * |---|---|---|
 * | **`var(--ink)` في شرحٍ عربيّ** | رمزٌ مهجورٌ يُقرأ مستعمَلا | التعليقاتُ تُمحى أوّلا |
 * | **`--lines` يُضبَط في `style=`** | رمزٌ مستعمَلٌ يُقرأ بلا تعريف | التعريفاتُ تُمسَح من `src/` كلِّها |
 * | **`var(--x)` في ملفّ اختبار** | رمزٌ مهجورٌ ينجو باختبارٍ يذكره | الاختباراتُ لا تُعَدّ استعمالا |
 *
 * والثالثةُ عينُ ما يُحرَس منه: **رمزٌ لا يستعمله إلّا اختبارُه ميّت**،
 * والاختبارُ يبقيه حيًّا في الظاهر.
 *
 * الاستعمال:  node scripts/audit_tokens.mjs  [--self-test: يزرع ظلالًا مغبَّشةً وذهبًا باسمٍ ثانٍ ويتأكّد أنّها تُمسَك]
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { SHEET_RE, sheetSource } from './sheet.mjs'
import ts from 'typescript'
import { join } from 'node:path'

const SRC = new URL('../src/', import.meta.url).pathname

/**
 * ما يُعرَّف ولا يُنادى **بحقّ** — ومعه سببُه.
 *
 * **ولا يُضاف اسمٌ هنا بلا سطرٍ يقول لماذا**، ولا يُقال «سيُستعمَل في
 * موجةٍ قادمة»: تلك حجّةُ `has_url` نفسِها (D-069)، وعاشت سنةً كذبا في
 * عمود. **ورمزٌ ينتظر مساره يُضاف يومَ يُوصَل، لا قبله.**
 */
const ALLOWED = new Map([
  [
    'color-scheme',
    '**خاصّةٌ قياسيّةٌ لا رمزٌ عندنا**: تقول للمتصفّح أيَّ ثيمٍ يلبس بها ' +
      'أدواتُه — شريطُ التمرير وحقلُ التاريخ. ولا تُنادى بـ var() أصلا',
  ],
])

/** ما لا يُعَدّ استعمالا — والسببُ في ترويسة الملفّ. */
const NOT_USAGE = /\.test\.ts$/

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) out.push(...walk(path))
    else if (name.endsWith('.ts')) out.push(path)
  }
  return out
}

/**
 * التعليقاتُ تُمحى — **وهذا المستودعُ يقتبس أسماءَ الرموز في شرحٍ عربيّ.**
 *
 * في `styles.ts:117` سطرٌ يقول «الجسدُ حسب var(--ink) بقيمة الثيم
 * النهاريّ». ولولا المحوُ لعُدّ ذلك استعمالا — **فينجو رمزٌ ميّتٌ بشرحِ
 * موتِه**.
 */
function strip(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ')
}

const files = walk(SRC)
const defined = new Map()
const used = new Map()

for (const file of files) {
  const code = strip(readFileSync(file, 'utf8'))
  const short = file.slice(SRC.length)

  // التعريفُ حيثما وقع: في `tokens.ts` أو في `style=` داخل قالبٍ نصّيّ.
  // و`--lines` تُضبَط في `sections/drafts.ts` لا في ورقة الأنماط. **ومفتاحًا
  // في كائن الوضعين** (D-183): `'--bg': '#f5f4ef'` تعريفٌ تولّد منه الكتل.
  for (const m of code.matchAll(/(--[a-z0-9-]+)['"]?\s*:/g)) {
    if (!defined.has(m[1])) defined.set(m[1], short)
  }
  // والاختباراتُ تُمسَح تعريفا ولا تُمسَح استعمالا
  if (NOT_USAGE.test(file)) continue
  for (const m of code.matchAll(/var\(\s*(--[a-z0-9-]+)/g)) {
    if (!used.has(m[1])) used.set(m[1], short)
  }
}

/**
 * ورقمُ زمنٍ يُكتب حرفا — **وهو ما كان قبل `--dur-*`**.
 *
 * قِيست الورقةُ فوُجدت ثلاثةَ أزمنةٍ في عشرِ قواعد: انضباطٌ قائمٌ بلا
 * اسم. **ورقمٌ في عشرة مواضعَ يتباعد عند أوّل تعديل** — وهي علّةُ
 * السلّمين نفسُها (D-057): ما لا يُسمَّى لا يبقى واحدا.
 *
 * **والقاعدةُ مقصورةٌ على `transition`**: `animation:spin .7s` دورةُ
 * دوّامةٍ لا ردُّ تفاعل، ولها زمنُها وحدها.
 */
/**
 * ── نصفُ قطرٍ حرفيّ (D-151)، **ومن قائمةٍ مغلقة** (خطّة التصميم 3.3 · D-187) ──────
 * كانت ‏١٥ قاعدةً تكتب أرقامًا خارج السلّم والحبّةُ بإملاءين (99px و999px)، ثمّ صار
 * السلّمُ خمسةَ رموزٍ بقيَمٍ لا تجمعها قاعدة (‏6 و9 و12 و18 و999). **والقائمةُ اليوم مغلقة**:
 * ‏4 و8 و12 و16 و999 و‏50٪ لا غير — رمزٌ بقيمةٍ خارجها يردّ، وقطرٌ يُكتب بغير رمزٍ
 * منها أو ‏50٪ أو صفرٍ يردّ.
 */
// ‏والزرّ ‏10 والبطاقة ‏14 والبطل ‏20 منذ إعادة البناء (D-246)
const RADIUS_SET = new Set(['4px', '10px', '14px', '16px', '20px', '999px'])
const literalRadius = []
const radiusTokens = new Map()
for (const file of files) {
  // غلافُ الصور المنشورة (lib/image) نظامٌ آخر بمقاسه؛ الحارسُ لورقة اللوحة
  if (NOT_USAGE.test(file) || /\/image\//.test(file)) continue
  const code = strip(readFileSync(file, 'utf8'))
  for (const m of code.matchAll(/(--r-[a-z]+):\s*([^;}]+)/g)) {
    radiusTokens.set(m[1], m[2].trim())
    if (!RADIUS_SET.has(m[2].trim())) literalRadius.push([`${m[1]}:${m[2].trim()} خارج القائمة`, file.slice(SRC.length)])
  }
  for (const m of code.matchAll(/border-radius:\s*([^;}]*)/g)) {
    const v = m[1].trim()
    // ‏والقطرُ لكلّ زاوية (الورقةُ السفليّة ‏١٦ في زاويتيها العلويّتين) — كلُّ جزءٍ من القائمة
    if (v.split(/\s+/).every((part) => /^(0|50%|var\(--r-[a-z]+\))$/.test(part))) continue
    literalRadius.push([`border-radius:${v}`.slice(0, 58), file.slice(SRC.length)])
  }
}
const radiusVariants = [...new Set(radiusTokens.values())].sort((a, b) => parseFloat(a) - parseFloat(b))

/**
 * ── ميزانيّةُ الذهب: ثلاثةُ أدوارٍ لا رابعَ لها (خطّة التصميم 3.2 · D-187 · D-196) ─────
 * (وكان اسمُه «النحاس» حتّى لوحة الهويّة، والقاعدةُ هي هي.)
 * كان سقفًا عدديًّا (D-156: حبرٌ لرقمٍ واحد ونداءاتٌ دون ‏١٥) — **وخمسةَ عشرَ نداءً
 * تحت السقف صارت خمسةَ عشرَ موضعًا في الرئيسيّة**: خيطُ كلّ قسم وخطُّ كلّ رابطٍ هادئ.
 * فالسؤالُ اليوم «أين» لا «كم»: الذهبُ (`--au` وشريطُ العلامة `--mark-fg`) لا يقع إلّا
 * في الأدوار الثلاثة، **وقيمةً كاملة** لا في تدرّجٍ ولا مزيج، وفي خاصّةِ حبرٍ أو أرضٍ لا
 * في حدٍّ ولا خطٍّ تحت رابطٍ ولا ظلّ. ويعدّ `audit_design` المواضعَ في كلّ شاشةٍ مرسومة.
 */
const COPPER_HOMES = new Map([
  ['.glyph', 'العلامة'],
  // ‏والرمزُ في لحظة العلامة هو العلامةُ نفسُها، لا دورٌ رابع: يقع في القالب T6 وحده بلا «.glyph» فوق
  // ‏النموذج، و«audit_design» يعدّ اللحظةَ موضعًا واحدًا (مراجعة D-196: كان يُنادى باسمٍ ثانٍ فلا يُعَدّ)
  ['.moment-glyph', 'العلامة'],
  ['nav.tabs a[aria-current=page]::before', 'مؤشّرُ القسم الحاليّ'],
  ['.grid>.tile:first-child .kv-v', 'الرقمُ البطل'],
])
const GOLD_BASE = ['--au', '--mark-fg']

/**
 * ‏**والذهبُ يُعرَف بقيمته لا باسمه** (مراجعة D-196): كان الحارسُ يطابق «var(--au|--mark-fg)» حرفًا،
 * فـ«--moment-accent» بقيمة الشريط نفسِها مرّ منه ومن اختبار الأدوار معًا، وزُرع «.next-t» بلونه نصًّا
 * نعناعيًّا على أبيض ‏١٫٨٩:١ فلم يسقط شيء. فكلُّ رمزٍ قيمتُه قيمةُ ذهبٍ في أيّ كتلة، أو إحالةٌ إلى رمزٍ
 * ذهبيّ، **ذهبٌ هو أيضًا** — ويردّ تعريفُه نفسُه: لا اسمَ ثانيًا للذهب، فاسمان يفترقان عند أوّل تعديل.
 * والتصريحاتُ من الورقة المولَّدة (`TOKENS`، القيَمُ محلولة) ومن مصادر الورقة (`style=""` وما في `styles.ts`).
 */
function goldNames(decls) {
  const values = new Set(decls.filter(([n, v]) => GOLD_BASE.includes(n) && /^#[0-9a-f]{3,8}$/i.test(v)).map(([, v]) => v.toLowerCase()))
  const names = new Set(GOLD_BASE)
  for (let grew = true; grew;) {
    grew = false
    for (const [n, v] of decls) {
      if (names.has(n)) continue
      const ref = /^var\(\s*(--[a-z0-9-]+)\s*\)$/.exec(v)
      if (values.has(v.toLowerCase()) || (ref !== null && names.has(ref[1]))) {
        names.add(n)
        grew = true
      }
    }
  }
  return names
}

/** ‏ما خالف ميزانيّةَ الذهب: `sheets` مصادرُ ممحوّةُ التعليقات، و`tokensCss` الورقةُ المولَّدة. */
function goldFindings(sheets, tokensCss) {
  const decls = []
  for (const code of [tokensCss, ...sheets.map((x) => x.code)]) {
    for (const m of code.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;}`'"]+)/g)) decls.push([m[1], m[2].trim()])
  }
  const gold = goldNames(decls)
  const out = []
  const aliases = [...gold].filter((n) => !GOLD_BASE.includes(n))
  for (const a of aliases) out.push(`${a} اسمٌ ثانٍ للذهب — يُنادى «${GOLD_BASE.join('» أو «')}» بأسمائهما`)
  const any = new RegExp(`var\\(\\s*(${[...gold].map((n) => n.replace(/-/g, '\\-')).join('|')})\\s*\\)`)
  let count = 0
  for (const { short, code } of sheets) {
    if (!SHEET_RE.test(short)) {
      // ‏ولا ذهبَ خارج الورقة: سمةُ «style» في وسمٍ لا يراها هذا الحارس ولا يعدّها
      if (any.test(code)) out.push(`ذهبٌ خارج الورقة — ${short}`)
      continue
    }
    for (const m of code.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
      const sel = m[1].trim().split('\n').pop().trim()
      for (const d of m[2].split(';')) {
        if (!any.test(d)) continue
        const [prop, ...rest] = d.split(':')
        // ‏وتعريفُ الاسم الثاني نفسُه رُدّ أعلاه — لا يُعَدّ تصريحًا
        if (prop.trim().startsWith('--')) continue
        count += 1
        const val = rest.join(':').trim()
        if (!COPPER_HOMES.has(sel)) out.push(`${sel} — ليس من الأدوار الثلاثة`)
        else if (!/^(color|background|background-color)$/.test(prop.trim()) || !/^var\(--(au|mark-fg)\)$/.test(val)) {
          out.push(`${sel} { ${d.trim()} } — الذهبُ حبرٌ أو أرضٌ بقيمته الكاملة`)
        }
      }
    }
  }
  if (count > COPPER_HOMES.size) out.push(`الذهبُ ${count} تصريحًا — والمواضعُ ${COPPER_HOMES.size}`)
  return { findings: out, count }
}

/**
 * ── الارتفاعُ ثلاثةُ ظلالٍ لا رابعَ لها (خطّة التصميم 3.3 · D-187) ─────────────
 * كانت البطاقاتُ والأشرطةُ تكتب ظلالَها طبقاتٍ بحروفها (`inset 0 1px 0 var(--hair)`
 * فوق `--sh-2` ثمّ `--sh-3` على المحدّد نفسِه في قاعدتين). **فالظلُّ الذي يُغبَّش
 * (نصفُ قطرِ تغبيشٍ فوق الصفر) يُكتب من `--sh-1` أو `--sh-2` أو `--sh-3` وحدها**؛ وما
 * سواه حلقةٌ حادّةٌ لا ارتفاع (`0 0 0 1px` حولَ مربّعٍ، وهالةُ التركيز).
 *
 * **والرمزُ يُحَلّ لا يُتجاوَز** (مراجعة D-187): كان كلُّ `var(--x)` في الظلّ يُحذف قبل
 * القراءة، فرمزٌ رابعٌ باسمٍ غيرِ `--sh-N` (`--lift: 0 24px 64px …` ثمّ `box-shadow:var(--lift)`)
 * يمرّ والطبقةُ كلُّها فيه — وجُرّب فمرّ هذا الحارسُ واختبارُ الأسماء معًا. فالطبقةُ
 * المغبَّشةُ لا تُقبَل إلّا `var(--sh-1|2|3)` بعينها، وكلُّ رمزٍ غيرِها يُقرأ بقيَمه كلِّها
 * (نهارًا وليلًا وطباعةً)، **وكلُّ رمزٍ قيمتُه ظلٌّ مغبَّش ردٌّ** ولو لم يُنادَ. **والطولُ طولٌ
 * بأيّ وحدة** (`.5rem` و`1.5em` كانا يسقطان من العدّ)، و`calc()` تغبيشٌ حتّى يثبت غيرُه،
 * و`drop-shadow()` و`text-shadow` ظلالٌ كذلك. ويُزرَع كلُّ ذلك في `--self-test`.
 */
const ELEVATION = /^var\(--sh-[123]\)$/
const LENGTH = /^-?(\d*\.?\d+)(px|r?em|ch|ex|r?lh|v[whib]|vmin|vmax|[dsl]v[whib]|cq[whib]|cqmin|cqmax|pt|pc|in|cm|mm|q)?$/
const COMPUTED = /^(calc|min|max|clamp)\(/

/** يقسم على `sep` في العمق صفر — لا داخل قوسين. */
function topSplit(s, sep) {
  const out = []
  let depth = 0
  let cur = ''
  for (const c of s) {
    if (c === '(') depth += 1
    else if (c === ')') depth -= 1
    if (depth === 0 && (sep === ' ' ? /\s/.test(c) : c === sep)) {
      out.push(cur)
      cur = ''
      continue
    }
    cur += c
  }
  out.push(cur)
  return out.map((x) => x.trim()).filter((x) => x !== '')
}

/** قيَمُ كلّ رمزٍ في مصادره — كلُّ تعريفٍ بموضعه: الاسمُ ← [{ value, where }]. */
function tokenValues(sources) {
  const values = new Map()
  for (const { short, code } of sources) {
    for (const m of code.matchAll(/(--[a-z0-9-]+)['"]?\s*:\s*(?:'([^']*)'|"([^"]*)"|([^;}\n"'`]+))/g)) {
      const list = values.get(m[1]) ?? []
      list.push({ value: (m[2] ?? m[3] ?? m[4]).trim(), where: short })
      values.set(m[1], list)
    }
  }
  return values
}

/** طبقاتُ الظلّ المغبَّشة في قيمة — والرمزُ يُحَلّ بقيَمه كلِّها، إلّا الثلاثة. */
function blurredLayers(value, values, seen = new Set()) {
  const hits = []
  for (const layer of topSplit(value, ',')) {
    if (ELEVATION.test(layer) || /^(none|inherit|initial|unset|revert)$/.test(layer)) continue
    const whole = /^var\((--[a-z0-9-]+)\s*(?:,[\s\S]*)?\)$/.exec(layer)
    if (whole !== null) {
      if (seen.has(whole[1])) continue
      const deeper = new Set([...seen, whole[1]])
      if ((values.get(whole[1]) ?? []).some((d) => blurredLayers(d.value, values, deeper).length > 0)) hits.push(layer)
      continue
    }
    const lengths = topSplit(layer, ' ').filter((t) => {
      if (LENGTH.test(t) || COMPUTED.test(t)) return true
      const ref = /^var\((--[a-z0-9-]+)/.exec(t)
      return ref !== null && (values.get(ref[1]) ?? []).some((d) => LENGTH.test(d.value) || COMPUTED.test(d.value))
    })
    if (lengths.length < 3) continue
    const blur = LENGTH.exec(lengths[2])
    if (blur === null || Number.parseFloat(blur[1]) > 0) hits.push(layer)
  }
  return hits
}

/** كلُّ ظلٍّ مغبَّشٍ خارج الثلاثة في المصادر — `[[ما وُجد, أين]]`. */
function shadowFindings(sources, home = 'routes/ui/tokens.ts') {
  const values = tokenValues(sources)
  const out = []
  for (const { short, code } of sources) {
    const decls = [
      ...[...code.matchAll(/(box-shadow|text-shadow):\s*([^;}]*)/g)].map((m) => [m[1], m[2]]),
      ...[...code.matchAll(/drop-shadow\(/g)].map((m) => {
        let depth = 1
        let i = m.index + m[0].length
        const from = i
        while (i < code.length && depth > 0) {
          if (code[i] === '(') depth += 1
          else if (code[i] === ')') depth -= 1
          i += 1
        }
        return ['drop-shadow', code.slice(from, i - 1)]
      }),
    ]
    for (const [prop, value] of decls) {
      for (const layer of blurredLayers(value.trim(), values)) {
        out.push([`${prop === 'drop-shadow' ? 'filter:drop-shadow(' : `${prop}:`}${layer}`.slice(0, 70), short])
      }
    }
  }
  for (const [name, defs] of values) {
    if (/^--sh-\d+$/.test(name)) {
      for (const d of defs) if (d.where !== home) out.push([`${name} يُعرَّف خارج ${home}: ${d.value}`.slice(0, 70), d.where])
      continue
    }
    for (const d of defs) {
      if (blurredLayers(d.value, values).length > 0) out.push([`${name}: ${d.value} — ظلٌّ مغبَّشٌ باسمٍ رابع`.slice(0, 80), d.where])
    }
  }
  const elevations = [...values.keys()].filter((n) => /^--sh-\d+$/.test(n)).sort()
  if (elevations.join(' ') !== '--sh-1 --sh-2 --sh-3') out.push([`الظلالُ المعرَّفة: ${elevations.join(' ')}`, home])
  return out
}

if (process.argv.includes('--self-test')) {
  const planted = [
    { short: 'routes/ui/tokens.ts', code: [
      "const LIGHT = { '--sh-1': '0 1px 2px rgba(0,0,0,.06)', '--sh-2': '0 4px 12px rgba(0,0,0,.08)',",
      "  '--sh-3': '0 16px 40px rgba(0,0,0,.16)', '--lift': '0 24px 64px rgba(16,24,40,.30)',",
      "  '--s-1': '4px', '--surface': '#ffffff', '--ring': 'color-mix(in srgb,var(--link) 25%,transparent)' }",
      "const ROOT = `:root{--lift-2:var(--lift); --dur-1:120ms; --sh-4:0 30px 80px #000}`",
    ].join('\n') },
    { short: 'routes/ui/styles.ts', code: [
      '.auth .card{box-shadow:var(--lift)}',
      '.a{box-shadow:0 .5rem 1.5rem rgba(0,0,0,.2)}',
      '.b{filter:drop-shadow(0 8px 24px rgba(0,0,0,.2))}',
      '.c{text-shadow:0 1px 6px var(--ink)}',
      '.h{box-shadow:var(--lift-2)}',
      '.i{--sh-1:0 30px 80px #000}',
      '.j{box-shadow:0 0 calc(var(--s-1) * 2) var(--ink)}',
      // ‏وما يمرّ: الثلاثةُ والحلقاتُ الحادّةُ وما لا ظلَّ فيه
      '.d{box-shadow:var(--sh-2), 0 0 0 1px var(--mark-ring)}',
      ':focus-visible{box-shadow:0 0 0 4px var(--surface)}',
      '.e{box-shadow:inset 0 -1px 0 var(--line); transition:box-shadow var(--dur-1)}',
      '.f{box-shadow:none} .g{box-shadow:0 0 0 var(--s-1) var(--ring)}',
    ].join('\n') },
  ]
  const got = shadowFindings(planted).map(([what]) => what)
  const want = [
    'box-shadow:var(--lift)', '--lift: 0 24px 64px', 'box-shadow:0 .5rem 1.5rem', 'filter:drop-shadow(0 8px 24px',
    'text-shadow:0 1px 6px', 'box-shadow:var(--lift-2)', '--lift-2: var(--lift)', '--sh-1 يُعرَّف خارج',
    'box-shadow:0 0 calc(', 'الظلالُ المعرَّفة: --sh-1 --sh-2 --sh-3 --sh-4',
  ]
  const missed = want.filter((w) => !got.some((g) => g.startsWith(w)))
  const extra = got.filter((g) => !want.some((w) => g.startsWith(w)))
  if (missed.length > 0 || extra.length > 0) {
    console.log(`  ✕ self-test الظلال: فاته ${JSON.stringify(missed)} · واتّهم ${JSON.stringify(extra)}`)
    process.exit(1)
  }
  console.log(`  ✓ self-test الظلال: ${want.length} مزروعًا أُمسِك، والحلقاتُ الحادّةُ والثلاثةُ مرّت`)

  /*
   * ‏**والذهبُ باسمٍ ثانٍ** (مراجعة D-196): النعناعُ بقيمته حرفًا تحت اسمٍ آخر، والذهبُ بإحالة،
   * وإحالةٌ إلى إحالة — كلُّها تُعَدّ ذهبًا، وتعريفُها يردّ، ونداؤها خارج الأدوار يردّ.
   * وما يمرّ: الأدوارُ الأربعةُ بأسمائها، و«--mark-bg» (ليس ذهبًا) ولو جاور الشريط.
   */
  const goldTokens = ':root{\n  --au:#7b5e20;\n  --mark-bg:#0b2f31; --mark-fg:#4cd1b6;\n  --moment-accent:#4cd1b6;\n' +
    '  --brass:var(--au); --brass-2:var(--brass);\n}\n:root[data-theme="dark"]{\n  --au:#c9a96a;\n  --night-gold:#C9A96A;\n}'
  const goldSheet = [
    '.glyph{background:var(--mark-bg); color:var(--mark-fg)}',
    '.moment-glyph{color:var(--mark-fg)}',
    'nav.tabs a[aria-current=page]::before{background:var(--au)}',
    '.grid>.tile:first-child .kv-v{color:var(--au)}',
    '.next-t{font-weight:600; color:var(--moment-accent)}',
    '.chip{border-color:var(--brass-2)}',
    '.kv{color:var( --night-gold )}',
  ].join('\n')
  const gold = goldFindings([{ short: 'routes/ui/styles.ts', code: goldSheet }, { short: 'routes/x.ts', code: '`<b style="color:var(--brass)">`' }], goldTokens).findings
  const goldWant = [
    '--moment-accent اسمٌ ثانٍ', '--brass اسمٌ ثانٍ', '--brass-2 اسمٌ ثانٍ', '--night-gold اسمٌ ثانٍ',
    'ذهبٌ خارج الورقة — routes/x.ts', '.next-t — ليس من الأدوار', '.chip — ليس من الأدوار', '.kv — ليس من الأدوار',
    'الذهبُ 7 تصريحًا',
  ]
  const goldMissed = goldWant.filter((w) => !gold.some((g) => g.startsWith(w)))
  const goldExtra = gold.filter((g) => !goldWant.some((w) => g.startsWith(w)))
  if (goldMissed.length > 0 || goldExtra.length > 0) {
    console.log(`  ✕ self-test الذهب: فاته ${JSON.stringify(goldMissed)} · واتّهم ${JSON.stringify(goldExtra)}`)
    process.exit(1)
  }
  console.log(`  ✓ self-test الذهب: ${goldWant.length} مزروعًا أُمسِك (اسمٌ ثانٍ بالقيمة وبالإحالة)، والأدوارُ الأربعةُ مرّت`)
  process.exit(0)
}

const { TOKENS } = await import('../src/routes/ui/tokens.ts')
const { findings: brass, count: brassCount } = goldFindings(files
  .filter((file) => !NOT_USAGE.test(file))
  .map((file) => ({ short: file.slice(SRC.length), code: strip(readFileSync(file, 'utf8')) })), TOKENS)

const looseShadows = shadowFindings(files
  .filter((file) => !NOT_USAGE.test(file) && !/\/image\//.test(file))
  .map((file) => ({ short: file.slice(SRC.length), code: strip(readFileSync(file, 'utf8')) })))

/**
 * ── نقاطُ الانكسار من `BP` وحدها (خطّة التصميم 3.3 · D-187) ─────────────────
 * كانت ثمانيًا بأرقامها في عشرين استعلامًا، وتاسعةٌ في نصّ اللوحة (`matchMedia`). **فلا
 * عرضَ يُكتب رقمًا في استعلام**: يُقحَم بـ`below()` أو `atLeast()` من `tokens.ts`.
 * **وحدُّ الحاوية كذلك** (مراجعة D-187): `@container` يُقحَم بـ`narrower()` من `CQ`.
 */
const literalBreakpoints = []
for (const file of files) {
  if (NOT_USAGE.test(file)) continue
  const code = strip(readFileSync(file, 'utf8'))
  for (const m of code.matchAll(/(@media[^{]*|@container[^{]*|matchMedia\([^)]*\))/g)) {
    if (/(min|max)-width:\s*\d/.test(m[1])) literalBreakpoints.push([m[1].trim().slice(0, 58), file.slice(SRC.length)])
  }
}

/**
 * ── قيمُ px الحرفيّة في الورقة: سقفٌ يمنع الرجوع (خطّة التصميم 10.2) ────────────
 * كانت ‏399 قيمةً (التعليقاتُ ممحوّة)، والهدفُ ‏60 أو أقلّ (الحدودُ وما في حكمها) بعد
 * المكوّنات (المرحلة ٢ب) ونقل الأقسام إليها (٢ج). **والسقفُ هنا ما بلغته المرحلةُ ٢ب** (D-189):
 * ‏365 ← 40 — الحدُّ والخيطُ رموزٌ (`--bd` و`--stroke`)، والأيقونةُ أربعةُ مقاسات، والمقاسُ من السلّم،
 * والعتبةُ بالـrem (تتبع حرفَ المستخدم، WCAG 1.4.4). وما بقي حدودٌ بكسلٌ واحد وقصٌّ لقارئ الشاشة
 * وتغبيشٌ وخطوطُ الأسبوع الناقص. رقمٌ يزيد يردّ، ورقمٌ ينقص يُخفَض السقفُ إليه في الطلب نفسِه.
 */
const PX_MAX = 40
const PX_TARGET = 60
const sheetPx = (strip(sheetSource(SRC))
  .match(/(?<![\w.-])-?\d*\.?\d+px\b/g) ?? []).length
const pxOver = sheetPx > PX_MAX ? [`${sheetPx} قيمةَ px حرفيّةً في styles.ts — والسقفُ ${PX_MAX} (الهدفُ ${PX_TARGET})`] : []

/**
 * ── مقاسُ الأيقونة من أربعة (خطّة التصميم 3.4 · D-189) ──────────────────────────────
 * كانت اثنا عشرَ مقاسًا (‏١٤ و‏١٥ و‏١٦ و‏١٧ و‏١٨ و‏٢٠ و‏٢٢ و‏٢٣ و‏٢٦ و‏٢٩ و‏٤٠ و‏١em) — مقاسٌ لكلّ قاعدة.
 * فكلُّ عرضٍ أو ارتفاعٍ يُعطى لـ`svg` في الورقة رمزٌ من الأربعة (`--icon-xs|sm|md|lg`)،
 * **أو نسبةٌ من مربّعه** (شعارُ المنصّة نصفُ مربّعه، والعلامةُ ‏٥٦٪، والرسمُ البيانيّ كلُّه)،
 * أو سطرٌ في المستثنى أدناه باسمه وسببه.
 */
const ICON_SIZE_EXEMPT = new Map([
  ['.arw svg', 'سهمُ المسار حرفٌ في جملةٍ يُقرأ — يتبع حرفَ السطر («1em»)'],
  ['.acct-mark svg', 'شعارُ المنصّة على غلاف الحساب علامةٌ زخرفيّةٌ لغيرِنا لا أيقونة («--s-10»)'],
])
const iconSizes = []
let iconRules = 0
{
  const sheet = strip(sheetSource(SRC))
  for (const m of sheet.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    const sel = m[1].trim().split('\n').pop().trim()
    if (!/(^|[\s>,])svg(\b|$)/.test(sel)) continue
    for (const d of m[2].split(';')) {
      const [prop, ...rest] = d.split(':')
      if (!/^(width|height|inline-size|block-size)$/.test(prop?.trim() ?? '')) continue
      iconRules += 1
      const v = rest.join(':').trim()
      if (/^var\(--icon-(xs|sm|md|lg)\)$/.test(v) || /^\d+%$/.test(v)) continue
      if (ICON_SIZE_EXEMPT.has(sel)) continue
      iconSizes.push(`${sel} { ${prop.trim()}:${v} }`)
    }
  }
}

const literalTime = []
for (const file of files) {
  if (NOT_USAGE.test(file)) continue
  const code = strip(readFileSync(file, 'utf8'))
  for (const m of code.matchAll(/transition:[^;}]*/g)) {
    if (/\d*\.?\d+m?s\b/.test(m[0])) {
      literalTime.push([m[0].slice(0, 58), file.slice(SRC.length)])
    }
  }
}

/**
 * وتباعدُ حرفٍ موجبٌ على نصٍّ عربيّ — **يفكّ الوصل**.
 *
 * الحرفُ العربيُّ يتّصل بما بعده، **وإزاحتُه عنه تقطع الوصل**: تُقرأ
 * «صــدى» لا «صدى». وهي علّةٌ تُرى ولا تُقاس بمدقّقٍ بصريّ — الأحجامُ
 * صحيحةٌ والتباينُ صحيح، والحروفُ منفكّة. وقِيست ستّةَ مواضع.
 *
 * **والاستثناءُ يُعرَف بالشيفرة لا بالنيّة**: قاعدةٌ تكتب `direction:ltr`
 * تصف نصّا لاتينيّا معزولا — ورموزُ الاسترداد مثلا — **والتباعدُ فيه
 * صنعةٌ لا عيب**. فالفحصُ على الكتلة الواحدة: أفيها تباعدٌ موجبٌ بلا
 * إعلانِ اتّجاه؟
 *
 * **والقيمةُ تُقرأ عددا لا نمطا.** أوّلُ صياغةٍ فحصت بنمطٍ نصّيّ
 * فاتّهمت `letter-spacing:0` في `.tile .v em` و `.ch-name span` — **وتلك
 * صفرٌ يُلغي تضييقا موروثا، لا تباعدا يفكّ وصلا**. ومدقّقٌ يكذب مرّةً لا
 * يُقرأ ثانيةً (D-070). فالسالبُ والصفرُ يمرّان، والموجبُ وحدَه يُتَّهم.
 */
const spaced = []
for (const file of files) {
  if (NOT_USAGE.test(file)) continue
  const code = strip(readFileSync(file, 'utf8'))
  // الكتلُ الداخليّةُ وحدَها — فقاعدةٌ داخل `@media` تُفحَص بذاتها
  for (const m of code.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    // ‏والرمزُ يُحلّ لا يُتجاوَز: `var(--ls-eyebrow)` تباعدٌ موجبٌ كتب بالاسم (D-149)
    const value = m[2].match(/letter-spacing:\s*(-?[\d.]+)/)
    const byToken = /letter-spacing:\s*var\(--ls-/.test(m[2])
    if (!byToken && (value === null || Number.parseFloat(value[1]) <= 0)) continue
    if (/direction:\s*ltr/.test(m[2])) continue
    spaced.push([m[1].trim().split('\n').pop().trim().slice(0, 48), file.slice(SRC.length)])
  }
}

/**
 * وعلامةٌ خلفيّةٌ داخل قالبٍ نصّيّ — **تُنهيه فيصير الشرحُ شيفرة**.
 *
 * `TOKENS` و `STYLE` و `SCRIPT` قوالبُ نصّيّة، وهذا المستودعُ يقتبس
 * أسماءَ الشيفرة في شرحه بعلامةٍ خلفيّة. **فسطرُ شرحٍ واحدٌ يُسقط الملفَّ
 * كلَّه** بخطأ صياغة.
 *
 * **و`tsc` يمسكها — لكنّه يسمّيها «‏,‏ expected» في سطرٍ بعيدٍ عن السبب.**
 * ووقعت أربعَ مرّاتٍ في ثلاث جلسات، وكلَّ مرّةٍ ضاعت دورةٌ في البحث عن
 * موضعها. **وحارسٌ يسمّي العلّةَ خيرٌ من حارسٍ يمسكها ولا يسمّيها.**
 *
 * والبديلُ في الشرح: «القوسان» ‏«…» — وهما ما يستعمله المستودعُ أصلا.
 */
const backticks = []
for (const file of files) {
  if (NOT_USAGE.test(file)) continue
  const raw = readFileSync(file, 'utf8')
  // كلُّ قالبٍ مُصدَّر: من `= \`` إلى `\`` في أوّل عمود
  for (const m of raw.matchAll(/export const (\w+)\s*=\s*(?:\w+\s*\+\s*)?`([\s\S]*?)\n`/g)) {
    const inner = m[2]
    if (!inner.includes('`')) continue
    const line = raw.slice(0, m.index).split('\n').length +
      inner.slice(0, inner.indexOf('`')).split('\n').length
    backticks.push([`${m[1]} — سطر ${line}`, file.slice(SRC.length)])
  }
}

/**
 * وأيقونةٌ تُرسَم خارج مصدرها الواحد (D-103).
 *
 * قِيست الأيقوناتُ فوُجدت **ثلاثَ ثخاناتٍ في أحدَ عشرَ رمزا**: ‏١٫٨ في
 * تسعٍ، و‏٢ في اثنتين، و‏١٫٩ في واحدة. **ولا أحدَ يقصد ‏١٫٩** — هي أثرُ
 * نسخٍ عن أقربِ ما وُجد، وكنّ موزّعاتٍ على ثلاثة ملفّات.
 *
 * فصار `ui/icons.ts` مصدرَهنّ الواحد، **والمواصفةُ تُفرَض بالبناء**:
 * تُكتب الأشكالُ وحدَها ويلبسها `icon()` المواصفةَ.
 *
 * **وهذا الحارسُ يمنع الطريقَ الجانبيّ**: من كتب `svg` بيده في ملفٍّ آخر
 * تخطّى المواصفةَ بلا أن يُمنَع.
 *
 * ## وثلاثةٌ تُستثنى — ولكلٍّ سببُه
 *
 * `ui/logos.ts` علاماتٌ مسجّلةٌ لأصحابها: تُرسَم كما نشروها،
 * **وتوحيدُها على مواصفتنا تشويهٌ لعلامةِ غيرِنا**.
 * و`ui/shell.ts` علامةُ صدى ورمزُ التبويب — هويّتُنا لا أيقونةُ واجهة.
 * و`ui/chart.ts` رسمٌ بيانيٌّ يُحسَب، لا شكلٌ ثابت.
 */
// وparts.ts يرسم رموزَ الحال (D-154)
const ICON_HOME = /ui\/(icons|logos|shell|chart|parts)\.ts$/
const strayIcons = []
for (const file of files) {
  if (NOT_USAGE.test(file) || ICON_HOME.test(file)) continue
  const code = strip(readFileSync(file, 'utf8'))
  for (const m of code.matchAll(/<svg[^>]*stroke="currentColor"[^>]*>/g)) {
    const width = /stroke-width="([\d.]+)"/.exec(m[0])
    strayIcons.push([
      `ثخانة ${width === null ? '؟' : width[1]}`,
      file.slice(SRC.length),
    ])
  }
}

/**
 * و`var` يُعلَن مرّتين في نصٍّ واحد — **فالثاني يدهس الأوّل** (D-105).
 *
 * `var` نطاقُه الدالّةُ كلُّها لا الكتلة، **وإعلانان باسمٍ واحدٍ في
 * دالّةٍ واحدة رباطٌ واحد**. فنصُّ اللوحة أعلن `tabs` أعلاه مصفوفةَ
 * روابطِ الرافدة، ثمّ أعلنها أسفلَ عنصرَ فرزِ المسوّدات — **فصارت كلُّ
 * نقرةِ رافدةٍ ترمي**.
 *
 * وما وقع أنّ اللوحَ كان يتبدّل، **والإضاءةُ تبقى على «نظرة عامّة»
 * والمرساةُ لا تُكتب**. وهي D-046 حرفا: زرٌّ يعمل خطأً أسوأُ من زرٍّ
 * لا يعمل — **هذا يُشتكى منه، وذاك يُظنّ به أنّ الصفحةَ فارغة**.
 *
 * **ولا `tsc` يمسكها ولا اختبارُ نصٍّ**: الصياغةُ صحيحة، والنصُّ يُبنى
 * دالّةً بلا شكوى. ولا تظهر إلّا بتشغيلٍ في متصفّحٍ حقيقيّ — وهو ما
 * كشفها. **فتُمسَك هنا في كلّ دفعة**، لا في تشغيلٍ يُنسى.
 *
 * ## ويُقرأ النطاقُ ولا يُخمَّن
 *
 * أوّلُ صياغةٍ لهذا الحارس عدّت `var` في النصّ كلِّه، **فسمّت `t` في
 * دالّتين مختلفتين دهسا** — وليست به. **وحارسٌ يكذب مرّةً لا يُقرأ
 * ثانية**، فيُبنى الشجرُ ويُسأل النطاقُ الحقيقيّ: `var` نطاقُه أقربُ
 * دالّةٍ تحويه، **والتكرارُ فيها وحدَها هو الدهس**.
 */
const SCRIPT_VAR = /export const (\w*SCRIPT\w*)\s*=\s*`([\s\S]*?)\n`/g

/**
 * يُبدِّل `${…}` بصفرٍ قبل التحليل.
 *
 * **والمصدرُ ليس ما يُشحَن**: النصُّ هنا قالبٌ فيه إقحاماتٌ من TypeScript،
 * و`ts` يسقط عليها بـ «‏,‏ expected» **ثمّ يمضي بشجرةٍ ناقصة** — فلا
 * يرى ما بعدها. وهي علّةُ الحارس الأولى: **مرّ على العلّة الحقيقيّة
 * صامتا** لأنّها كانت بعد أوّل إقحام.
 *
 * والأقواسُ تُعدّ ولا تُلتقَط بنمط: `${JSON.stringify(x)}` فيها قوسٌ
 * داخليّ، **ونمطُ «إلى أوّل قوسٍ مغلق» يقصّها في منتصفها**.
 */
function deInterpolate(code) {
  let out = '', i = 0
  while (i < code.length) {
    if (code[i] === '$' && code[i + 1] === '{') {
      let depth = 1
      i += 2
      while (i < code.length && depth > 0) {
        if (code[i] === '{') depth += 1
        else if (code[i] === '}') depth -= 1
        i += 1
      }
      out += '(0)'
      continue
    }
    /*
     * ‏وهروبُ القالب يُفَكّ: المصدرُ يكتب «\\\\» ليَشحَن «\\» واحدة، فتعبير
     * ‏«RE_URL» يصل المحلِّلَ بشرطتين فينتهي مبكّرا. **والمقروءُ يجب أن
     * ‏يكون ما يُشحَن** — وهي قاعدةُ عدّاد D-081 نفسُها.
     */
    if (code[i] === '\\' && (code[i + 1] === '\\' || code[i + 1] === '`' || code[i + 1] === '$')) {
      out += code[i + 1]
      i += 2
      continue
    }
    out += code[i]
    i += 1
  }
  return out
}

/**
 * أسماءُ `var` المعلَنةِ أكثرَ من مرّةٍ في نطاقِ دالّةٍ واحدة.
 *
 * **ويقول حين يعجز**: نصٌّ لا يُحلَّل يُبلَّغ عنه علّةً، ولا يُمرَّر
 * صامتا. **وحارسٌ يسكت عمّا لم يقرأه يَعِد بما لا يفي به.**
 */
function shadowedVars(code) {
  const src = ts.createSourceFile('s.js', deInterpolate(code), ts.ScriptTarget.ES5, true, ts.ScriptKind.JS)
  const hits = []
  if ((src.parseDiagnostics ?? []).length > 0) {
    return ['(لم يُحلَّل — والحارسُ لا يقول عنه شيئا)']
  }
  const walk = (node, scope) => {
    const opens = ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) || ts.isSourceFile(node)
    const here = opens ? new Map() : scope
    if (ts.isVariableStatement(node) &&
        (node.declarationList.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const)) === 0) {
      for (const d of node.declarationList.declarations) {
        if (!ts.isIdentifier(d.name)) continue
        const n = (scope.get(d.name.text) ?? 0) + 1
        scope.set(d.name.text, n)
        if (n === 2) hits.push(d.name.text)
      }
    }
    ts.forEachChild(node, (c) => walk(c, here))
  }
  walk(src, new Map())
  return hits
}

const dupVars = []
for (const file of files) {
  if (NOT_USAGE.test(file)) continue
  const raw = readFileSync(file, 'utf8')
  for (const m of raw.matchAll(SCRIPT_VAR)) {
    for (const name of shadowedVars(m[2])) {
      dupVars.push([`${m[1]} · ${name}`, file.slice(SRC.length)])
    }
  }
}

/**
 * وجردُ الرموز — **رمزٌ يُرسَم في سياقين، ورمزٌ لا يرسمه أحد** (D-125 · `N-5`).
 *
 * `ICON` كائنٌ واحدٌ مُصدَّر، **و`audit_dead` يرى الكائنَ حيّا ما دام اسمٌ
 * واحدٌ منه يُنادى** — فمفتاحٌ فيه يُعرَّف ولا يُنادى ينجو بجيرانه. وهي
 * علّةُ D-067 على مستوى المفتاح لا الملفّ: بُني ولم يُستعمَل.
 *
 * ## وما يَحرُس وما يُطبَع — والفرقُ هندسةٌ لا حكم
 *
 * | ما يُقاس | كيف | الحكم |
 * |---|---|---|
 * | **مفتاحٌ بلا منادٍ** خارج الاختبارات | وجودٌ مقابلَ غياب | **يردّ** |
 * | **مفتاحٌ يُنادى من أكثرَ من ملفّ** | عدُّ ملفّات | **يُطبَع ليُقرأ** |
 *
 * والثاني لا يردّ لأنّ «معنيين» حكمٌ: الرحلةُ تعيد `report` **قصدا**
 * — «علامةُ نوعٍ لا صورةُ فعل» (D-104). فيُطبَع الجردُ ويُبَتّ عند كلّ رمزٍ
 * يُضاف، **ولا يُصدَّق حارسٌ يصيح على الصواب** (D-113).
 */
const ICON_KEYS = []
{
  const raw = strip(readFileSync(join(SRC, 'routes/ui/icons.ts'), 'utf8'))
  const body = /export const ICON = \{([\s\S]*?)\n\}/.exec(raw)
  if (body !== null) {
    for (const m of body[1].matchAll(/^\s{2}([a-zA-Z][a-zA-Z0-9]*):\s*icon\(/gm)) ICON_KEYS.push(m[1])
  }
}
const iconUses = new Map(ICON_KEYS.map((k) => [k, new Set()]))
for (const file of files) {
  if (NOT_USAGE.test(file) || /ui\/icons\.ts$/.test(file)) continue
  const code = strip(readFileSync(file, 'utf8'))
  for (const m of code.matchAll(/ICON\.([a-zA-Z][a-zA-Z0-9]*)/g)) {
    iconUses.get(m[1])?.add(file.slice(SRC.length))
  }
}
const unusedIcons = [...iconUses].filter(([, where]) => where.size === 0).map(([k]) => k)
const sharedIcons = [...iconUses].filter(([, where]) => where.size > 1)
  .sort((a, b) => b[1].size - a[1].size)

const ghosts = [...used].filter(([name]) => !defined.has(name))
const orphans = [...defined].filter(
  ([name]) => !used.has(name) && !ALLOWED.has(name.slice(2)),
)

console.log('\n═══ رموزٌ تُنادى ولا تُعرَّف ═══\n')
if (ghosts.length === 0) console.log('  ✓ لا رمزَ منادًى بلا تعريف')
for (const [name, where] of ghosts) {
  console.log(`  ✕ ${name}  —  يُنادى في ${where}  (يسقط إلى الافتراضيّ صامتا)`)
}

console.log('\n═══ رموزٌ تُعرَّف ولا تُنادى ═══\n')
if (orphans.length === 0) console.log('  ✓ لا رمزَ معرَّفٍ بلا منادٍ')
for (const [name, where] of orphans) {
  console.log(`  ✕ ${name}  —  يُعرَّف في ${where}`)
}

console.log('\n═══ رموزٌ في ICON لا يرسمها أحد ═══\n')
if (unusedIcons.length === 0) console.log('  ✓ كلُّ رمزٍ في ICON له موضع')
for (const k of unusedIcons) console.log(`  ✕ ICON.${k}  —  يُعرَّف ولا يُنادى خارج الاختبارات`)

console.log('\n═══ جردُ الرموز — ما يُرسَم في أكثرَ من ملفّ (يُقرأ ولا يردّ · N-5) ═══\n')
if (sharedIcons.length === 0) console.log('  · لا رمزَ يُرسَم في ملفّين')
for (const [k, where] of sharedIcons) {
  console.log(`  · ICON.${k}  في ${where.size}:  ${[...where].join(' · ')}`)
}

console.log('\n═══ زمنٌ يُكتب حرفا لا رمزا ═══\n')
console.log('\n═══ ميزانيّةُ الذهب ═══\n')
if (brass.length === 0) console.log(`  ✓ ${brassCount} تصريحاتٍ في الأدوار الثلاثة: ${[...new Set(COPPER_HOMES.values())].join(' · ')}، ولا اسمَ ثانيًا للذهب`)
for (const b of brass) console.log(`  ✕ ${b}`)

console.log('\n═══ نصفُ قطرٍ خارج القائمة المغلقة ═══\n')
if (literalRadius.length === 0) console.log(`  ✓ ${radiusVariants.length + 1} قيم: ${radiusVariants.join(' · ')} · 50%`)
for (const [rule, where] of literalRadius) console.log(`  ✕ ${rule}  —  ${where}`)

console.log('\n═══ ظلٌّ مُغبَّشٌ خارج الظلال الثلاثة ═══\n')
if (looseShadows.length === 0) console.log('  ✓ كلُّ ارتفاعٍ من --sh-1 أو --sh-2 أو --sh-3')
for (const [rule, where] of looseShadows) console.log(`  ✕ ${rule}  —  ${where}`)

console.log('\n═══ عرضٌ يُكتب رقمًا في استعلام ═══\n')
if (literalBreakpoints.length === 0) console.log('  ✓ كلُّ نقطةِ انكسارٍ من BP، وكلُّ حدِّ حاويةٍ من CQ')
for (const [rule, where] of literalBreakpoints) console.log(`  ✕ ${rule}  —  ${where}`)

console.log('\n═══ مقاسُ الأيقونة خارج الأربعة ═══\n')
if (iconSizes.length === 0) console.log(`  ✓ ${iconRules} تصريحًا كلُّها من --icon-xs|sm|md|lg أو نسبةٌ من مربّعها (ومستثنًى ${ICON_SIZE_EXEMPT.size} باسمه)`)
for (const i of iconSizes) console.log(`  ✕ ${i}`)

console.log('\n═══ قيمُ px الحرفيّة في الورقة ═══\n')
if (pxOver.length === 0) console.log(`  ✓ ${sheetPx} من سقف ${PX_MAX} (الهدفُ ${PX_TARGET})`)
for (const p of pxOver) console.log(`  ✕ ${p}`)

if (literalTime.length === 0) console.log('  ✓ لا زمنَ خارج السلّم')
for (const [rule, where] of literalTime) console.log(`  ✕ ${rule}  —  ${where}`)

console.log('\n═══ علامةٌ خلفيّةٌ داخل قالبٍ نصّيّ ═══\n')
if (backticks.length === 0) console.log('  ✓ لا قالبَ تُنهيه علامةٌ في شرحه')
for (const [what, where] of backticks) console.log(`  ✕ ${what}  —  ${where}`)

console.log('\n═══ أيقونةٌ تُرسَم خارج مصدرها ═══\n')
if (strayIcons.length === 0) console.log('  ✓ لا أيقونةَ خارج ui/icons.ts')
for (const [what, where] of strayIcons) console.log(`  ✕ ${what}  —  ${where}`)

console.log('\n═══ var يُعلَن مرّتين في نصٍّ واحد ═══\n')
if (dupVars.length === 0) console.log('  ✓ لا رباطَ يدهس رباطا')
for (const [what, where] of dupVars) console.log(`  ✕ ${what}  —  ${where}  (الثاني يدهس الأوّل)`)

console.log('\n═══ تباعدُ حرفٍ موجبٌ بلا اتّجاهٍ لاتينيّ ═══\n')
if (spaced.length === 0) console.log('  ✓ لا تباعدَ يفكّ وصلا')
for (const [sel, where] of spaced) console.log(`  ✕ ${sel}  —  ${where}`)

console.log(
  `\n(${defined.size} رمزا معرَّفا · ${used.size} منادًى · ${ALLOWED.size} معلَّلا في القائمة · ${ICON_KEYS.length} رمزا في ICON)\n`,
)

const total = ghosts.length + orphans.length + literalTime.length + literalRadius.length + brass.length + spaced.length +
  looseShadows.length + literalBreakpoints.length + pxOver.length + iconSizes.length +
  backticks.length + strayIcons.length + dupVars.length + unusedIcons.length
if (total === 0) process.exit(0)

console.log('والمنادَى بلا تعريفٍ **يُعرَّف أو يُحذَف نداؤه** — ولا يُترَك:')
console.log('قاعدةٌ تُقرأ صحيحةً ولا تعمل أسوأُ من قاعدةٍ غائبة.')
console.log('والمعرَّفُ بلا منادٍ **يُوصَل بمن يُفترَض أن ينادِيه**، أو يُحذَف،')
console.log('أو يُضاف إلى ALLOWED **بسطرٍ يقول لماذا** — ولا يُقال «سيُستعمَل')
console.log('لاحقا»: تلك حجّةُ `has_url`، وعاشت سنةً كذبا في عمود.\n')
process.exit(1)

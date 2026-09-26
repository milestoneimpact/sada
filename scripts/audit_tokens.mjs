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
 * الاستعمال:  node scripts/audit_tokens.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
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
  // و`--lines` تُضبَط في `sections/drafts.ts` لا في ورقة الأنماط.
  for (const m of code.matchAll(/(--[a-z0-9-]+)\s*:/g)) {
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
 * ── نصفُ قطرٍ حرفيّ (D-151) ──────────────────────────────────────────
 * سُلَّمُ الأقطار خمسةُ رموز (--r-xs · --r-sm · --r · --r-lg · --r-pill)؛
 * كانت ‏١٥ قاعدةً تكتب أرقامًا خارجها والحبّةُ بإملاءين (99px و999px).
 */
const literalRadius = []
for (const file of files) {
  // غلافُ الصور المنشورة (lib/image) نظامٌ آخر بمقاسه؛ الحارسُ لورقة اللوحة
  if (NOT_USAGE.test(file) || /\/image\//.test(file)) continue
  const code = strip(readFileSync(file, 'utf8'))
  for (const m of code.matchAll(/border-radius:\s*[^;}]*\d+px[^;}]*/g)) {
    literalRadius.push([m[0].slice(0, 58), file.slice(SRC.length)])
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
console.log('\n═══ نصفُ قطرٍ خارج السلّم ═══\n')
if (literalRadius.length === 0) console.log('  ✓ لا نصفَ قطرٍ حرفيًّا')
for (const [rule, where] of literalRadius) console.log(`  ✕ ${rule}  —  ${where}`)

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

const total = ghosts.length + orphans.length + literalTime.length + literalRadius.length + spaced.length +
  backticks.length + strayIcons.length + dupVars.length + unusedIcons.length
if (total === 0) process.exit(0)

console.log('والمنادَى بلا تعريفٍ **يُعرَّف أو يُحذَف نداؤه** — ولا يُترَك:')
console.log('قاعدةٌ تُقرأ صحيحةً ولا تعمل أسوأُ من قاعدةٍ غائبة.')
console.log('والمعرَّفُ بلا منادٍ **يُوصَل بمن يُفترَض أن ينادِيه**، أو يُحذَف،')
console.log('أو يُضاف إلى ALLOWED **بسطرٍ يقول لماذا** — ولا يُقال «سيُستعمَل')
console.log('لاحقا»: تلك حجّةُ `has_url`، وعاشت سنةً كذبا في عمود.\n')
process.exit(1)

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
    const value = m[2].match(/letter-spacing:\s*(-?[\d.]+)/)
    if (value === null || Number.parseFloat(value[1]) <= 0) continue
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
const ICON_HOME = /ui\/(icons|logos|shell|chart)\.ts$/
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

console.log('\n═══ زمنٌ يُكتب حرفا لا رمزا ═══\n')
if (literalTime.length === 0) console.log('  ✓ لا زمنَ خارج السلّم')
for (const [rule, where] of literalTime) console.log(`  ✕ ${rule}  —  ${where}`)

console.log('\n═══ علامةٌ خلفيّةٌ داخل قالبٍ نصّيّ ═══\n')
if (backticks.length === 0) console.log('  ✓ لا قالبَ تُنهيه علامةٌ في شرحه')
for (const [what, where] of backticks) console.log(`  ✕ ${what}  —  ${where}`)

console.log('\n═══ أيقونةٌ تُرسَم خارج مصدرها ═══\n')
if (strayIcons.length === 0) console.log('  ✓ لا أيقونةَ خارج ui/icons.ts')
for (const [what, where] of strayIcons) console.log(`  ✕ ${what}  —  ${where}`)

console.log('\n═══ تباعدُ حرفٍ موجبٌ بلا اتّجاهٍ لاتينيّ ═══\n')
if (spaced.length === 0) console.log('  ✓ لا تباعدَ يفكّ وصلا')
for (const [sel, where] of spaced) console.log(`  ✕ ${sel}  —  ${where}`)

console.log(
  `\n(${defined.size} رمزا معرَّفا · ${used.size} منادًى · ${ALLOWED.size} معلَّلا في القائمة)\n`,
)

const total = ghosts.length + orphans.length + literalTime.length + spaced.length +
  backticks.length + strayIcons.length
if (total === 0) process.exit(0)

console.log('والمنادَى بلا تعريفٍ **يُعرَّف أو يُحذَف نداؤه** — ولا يُترَك:')
console.log('قاعدةٌ تُقرأ صحيحةً ولا تعمل أسوأُ من قاعدةٍ غائبة.')
console.log('والمعرَّفُ بلا منادٍ **يُوصَل بمن يُفترَض أن ينادِيه**، أو يُحذَف،')
console.log('أو يُضاف إلى ALLOWED **بسطرٍ يقول لماذا** — ولا يُقال «سيُستعمَل')
console.log('لاحقا»: تلك حجّةُ `has_url`، وعاشت سنةً كذبا في عمود.\n')
process.exit(1)

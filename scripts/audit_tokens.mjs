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

console.log(
  `\n(${defined.size} رمزا معرَّفا · ${used.size} منادًى · ${ALLOWED.size} معلَّلا في القائمة)\n`,
)

if (ghosts.length + orphans.length === 0) process.exit(0)

console.log('والمنادَى بلا تعريفٍ **يُعرَّف أو يُحذَف نداؤه** — ولا يُترَك:')
console.log('قاعدةٌ تُقرأ صحيحةً ولا تعمل أسوأُ من قاعدةٍ غائبة.')
console.log('والمعرَّفُ بلا منادٍ **يُوصَل بمن يُفترَض أن ينادِيه**، أو يُحذَف،')
console.log('أو يُضاف إلى ALLOWED **بسطرٍ يقول لماذا** — ولا يُقال «سيُستعمَل')
console.log('لاحقا»: تلك حجّةُ `has_url`، وعاشت سنةً كذبا في عمود.\n')
process.exit(1)

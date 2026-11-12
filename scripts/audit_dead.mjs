/**
 * مدقّقُ ما بُني ولم يُستعمَل.
 *
 * ## لماذا
 *
 * أربعُ علّاتٍ في يومٍ واحدٍ من نوعٍ واحد:
 *
 * | | ما بُني | ما وقع |
 * |---|---|---|
 * | D-057 | سلّمُ القياسات | يُكتب البكسل حرفيّا |
 * | D-058 | جدولُ `metrics` | لا كاتبَ له منذ `0001_init` |
 * | D-059 | ترويسةُ الوسائط | تُدهَس قبل أن تخرج |
 * | D-066 | `refreshToken()` | **لا يناديه أحد — فيتوقّف النشرُ بعد شهرين** |
 *
 * **وكلُّها لا تُرى**: لا عطل، ولا سطرَ في السجلّ — شيفرةٌ تبدو أنّها
 * تفعل وهي لا تفعل. **وأغلاها ثمنا وُجدت بالمصادفة**، حين سألتُ عن
 * صحّة تعليقٍ كتبتُه بيدي.
 *
 * فالدرسُ يصير حارسا: **رمزٌ يُصدَّر ولا يُستورَد في شيفرة العمل
 * يُسمَّى**، ويُعلَّل أو يُحذَف.
 *
 * ## وما لا يُعدّ ميتا
 *
 * - **الأنواعُ والواجهات**: تُصدَّر لتُستورَد نوعا، وقد تُستعمَل بلا
 *   ذكرٍ للاسم في نصٍّ يُطابَق.
 * - **ما يُستعمَل في الاختبارات وحدها إن كان مقصودا** — ويُعلَّل في
 *   القائمة أدناه بسببه، **لا يُسكَت عنه**.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('../src/', import.meta.url).pathname

/**
 * ما يُسمَح بأن يُصدَّر بلا مستعمِلٍ في شيفرة العمل — **ومعه سببُه**.
 *
 * **ولا يُضاف اسمٌ هنا بلا سطرٍ يقول لماذا.** قائمةُ استثناءاتٍ بلا
 * تعليلٍ تصير مكنسةً يُخبَّأ تحتها ما يجب أن يُرى.
 */
const ALLOWED = new Map([
  ['app', 'نقطةُ الدخول — يُصدَّر ليُنادى من Worker لا من شيفرةٍ أخرى'],
  ['queue', 'مستهلكُ الطابور — ينادِيه Cloudflare'],
  ['scheduled', 'موزّعُ الدورات — ينادِيه Cloudflare'],
  ['fetch', 'واجهةُ Worker'],
  // ‏كانت اللوحةُ تحمله لعدّاد «ما عليك» في الرافدة الذي أُسقط في D-216، ولم يبقَ قسمٌ يقرؤه فأُسقط
  // ‏حِملُه من `panelRoute` (D-273). مُختبَرٌ في owner.test.ts، ويبقى لشاشة «ما عليك» حين تعرض عدَّها
  ['pendingCount', 'عدُّ ما على المالك — مُختبَرٌ، ولا يقرؤه لوحٌ منذ D-216'],
  // ‏نصفُ صيغة النسخة الذي يقرأ (D-321): الـ Worker يكتب نسخَه ولا يفكّها، ويفكّها تمرينُ الاسترجاع (`scripts/restore_drill.mjs`)
  // ‏من الملفّ نفسِه — فلا تفترق الكتابةُ والقراءة
  ['decodeSnapshot', 'يقرؤه تمرينُ الاسترجاع scripts/restore_drill.mjs، والـ Worker يكتب ولا يفكّ'],
])

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) out.push(...walk(path))
    else if (name.endsWith('.ts')) out.push(path)
  }
  return out
}

const files = walk(ROOT)
const work = files.filter((f) => !f.endsWith('.test.ts') && !f.includes('/test/'))

/** أسماءُ ما يُصدَّر قيمةً — لا نوعا. */
const exported = new Map() // name -> file
for (const file of work) {
  const src = readFileSync(file, 'utf8')
  for (const m of src.matchAll(/^export\s+(?:async\s+)?(?:function|const|class)\s+([A-Za-z_$][\w$]*)/gm)) {
    exported.set(m[1], file)
  }
}

/**
 * **والاستعمالُ داخل ملفِّه استعمال.**
 *
 * أوّلُ صيغةٍ لهذا المدقّق عدّت رمزا ميتا إن لم يُذكَر في ملفٍّ آخر —
 * فأعطت ٨٩ ملحوظةً أكثرُها ضجيج: دالّةٌ ينادِيها جارُها في الملفّ
 * نفسِه وتُصدَّر لتُختبَر **ليست ميتة**.
 *
 * **ومدقّقٌ يُهمَل أسوأُ من لا مدقّق** — وهو عينُ ما يحرس منه هذا
 * الملفّ. فالمقياسُ صار: **لا يُنادى في ملفِّه، ولا في غيره.**
 */
const dead = []
for (const [name, home] of exported) {
  if (ALLOWED.has(name)) continue
  const word = new RegExp(`\\b${name}\\b`, 'g')

  // في ملفِّه: يُطرَح سطرُ التصدير نفسُه، فالتعريفُ ليس استعمالا
  const own = readFileSync(home, 'utf8')
    .split('\n')
    .filter((line) => !new RegExp(`^export\\s+(?:async\\s+)?(?:function|const|class)\\s+${name}\\b`).test(line))
    .join('\n')
  if (word.test(own)) continue

  const elsewhere = work.some((file) => {
    if (file === home) return false
    return new RegExp(`\\b${name}\\b`).test(readFileSync(file, 'utf8'))
  })
  if (!elsewhere) dead.push({ name, file: home.replace(ROOT, '') })
}

if (dead.length === 0) {
  console.log('✓ لا رمزَ مُصدَّرا بلا مستعمِل')
  process.exit(0)
}

console.log('\n═══ رموزٌ تُصدَّر ولا تُستعمَل في شيفرة العمل ═══\n')
for (const d of dead) console.log(`  ✕ ${d.name}  —  ${d.file}`)
console.log(`\nالمجموع: ${dead.length}`)
console.log(
  '\nوكلٌّ منها إمّا **يُوصَل بما يُفترَض أن ينادِيه**، أو يُحذَف،\n' +
  'أو يُضاف إلى ALLOWED **بسطرٍ يقول لماذا**. ولا يُسكَت عنه:\n' +
  'D-066 كان من هذا النوع، وثمنُه توقّفُ النشر بعد شهرين.',
)
process.exit(1)

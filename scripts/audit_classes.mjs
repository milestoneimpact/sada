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

const used = new Map()
for (const file of walk(ROUTES)) {
  if (file === STYLES || file.endsWith('tokens.ts')) continue
  const code = stripExpressions(readFileSync(file, 'utf8'))
  for (const m of code.matchAll(/class="([^"]*)"/g)) {
    for (const cls of m[1].split(/\s+/)) {
      if (!/^[a-zA-Z_][\w-]*$/.test(cls)) continue
      if (!used.has(cls)) used.set(cls, new Set())
      used.get(cls).add(file.slice(ROOT.length))
    }
  }
}

let bad = 0
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

console.log(`\nالمجموع: ${bad} صنفا بلا قاعدة · ${stale} إعفاءً شاخ\n`)
process.exit(bad + stale === 0 ? 0 : 1)

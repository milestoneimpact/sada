/**
 * تدقيقُ الوزن — **كلُّ صفحةٍ تحت سقفها مضغوطةً** (D-266 · GROWTH-PLAN م-٦).
 *
 * الصفحةُ تصل الهاتفَ مضغوطةً بـ gzip، **فالوزنُ الذي يدفعه المالكُ هو المضغوط** لا الخام. والسقفُ سقفٌ لا هدف: يمنع الرجوع،
 * وما تجاوزه يُقسَم أو يُؤجَّل تحميلُه، ولا يُرفع السقفُ ليمرّ.
 *
 * | الصفحة | السقف مضغوطًا | لماذا |
 * |---|---|---|
 * | اللوحةُ وأقسامُها (`panel*`) | ‏26KB | تُفتح كلَّ يوم، وفيها الورقةُ كاملة — وأثقلُها اليومَ المحرّرُ ‏23.1KB |
 * | الشاشاتُ (`screen-*`) والوثيقة | ‏14KB | صفحةٌ واحدةُ الغرض — و«ما عليك» بلغته فقُسمت بنوعها ولم يُرفع (متابعة D-324): ‏11.1KB و«تفتح قدرة» ‏11.4KB على main |
 *
 * **ويُقاس المجرَّدُ (`.bare.html`) لا المدقَّق**: المدقَّقُ يضمّن الخطوطَ ليُقاس النصّ (نحو ‏157KB)، والخادمُ يرسلها أصولًا
 * منفصلةً مخزّنةً سنة، فلا يدفعها المالكُ مع كلّ صفحة.
 *
 *     node scripts/audit_size.mjs /tmp/panel.html /tmp/screen-x.html …
 *     node scripts/audit_size.mjs --self-test
 */
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { gzipSync } from 'node:zlib'

const KB = 1024
// ‏`rich`: شاشةٌ تحمل طبقةَ السكربت الغنيّ (D-328: «سقفُ وزن الصفحات يُرفع للشاشات التي تحمل هذه الطبقة، برقمٍ مقيس»). شاشةُ الخطّة
// ‏بلوحها الحيّ وسحبها بالفأرة وباللمس ورقائقها قيست ‏14.2KB (D-336)، فسقفُها ‏16KB — وما سواها على ‏14KB كما كان.
export const BUDGET = { panel: 26 * KB, screen: 14 * KB, rich: 16 * KB }
// ‏وكانت «ما عليك» هنا بسقف ‏16KB (D-336): قائمةٌ تكبر بكلّ مهمّةٍ يدويّة، بلغت ‏14.0KB بعد M-49 ثمّ ‏14.2KB على main وتقصيرُ النصوص لم يعد يُنزلها،
// ‏و«هذا رفعُ سقفٍ لا علاج». والعلاجُ بُني: قُسمت بنوعها (متابعة D-324، ودمجُها على main)، فصارت ‏11.1KB و«تفتح قدرة» ‏11.4KB،
// ‏وعادت الاثنتان إلى ‏14KB. **والمطابقةُ بالبادئة**: `screen-tasks` كانت تعطي `screen-tasks-later` ‏16KB بلا قرار
// ‏و«خطّة جديدة» تحمل الطبقةَ نفسَها (‏12.5KB سكربتًا مضمَّنًا كما في المراجعة ‏12.6KB، وبلا سكربتٍ ‏10.0KB): كانت على main ‏14325 بايتًا من ‏14336،
// ‏فأوقعها قسمُ «التيّار» في الرافدة واللوحة (D-386: ‏141 بايتًا مضغوطًا على كلّ صفحة، والتقصيرُ لا يُنزلها لأنّ الوزنَ وسمُ المدخل لا نصُّه).
// ‏قيست ‏14466 بايتًا (‏14.1KB)، فسقفُها بالقاعدة نفسِها (D-328: الطبقةُ الغنيّة ترفع السقفَ برقمٍ مقيس).
const RICH = ['screen-plan-review', 'screen-plan-new']

export function budgetOf(file) {
  const name = basename(file)
  if (name.startsWith('panel')) return BUDGET.panel
  return RICH.some((r) => name.startsWith(r)) ? BUDGET.rich : BUDGET.screen
}

export function measure(html) {
  return { raw: Buffer.byteLength(html), gz: gzipSync(html, { level: 9 }).length }
}

function selfTest() {
  const small = measure('<p>صدى</p>'.repeat(10))
  // ‏نصٌّ عشوائيٌّ لا ينضغط: يتجاوز السقفَ مضغوطًا
  const noise = Array.from({ length: 40 * KB }, () => String.fromCharCode(33 + Math.floor(Math.random() * 90))).join('')
  const big = measure(noise)
  if (small.gz > BUDGET.screen || big.gz <= BUDGET.screen || budgetOf('/tmp/panel-x.html') !== BUDGET.panel ||
      // ‏وصفحتا «ما عليك» على سقف الشاشة لا الغنيّ (دمجُ متابعة D-324 على main)
      budgetOf('/tmp/screen-tasks.bare.html') !== BUDGET.screen || budgetOf('/tmp/screen-tasks-later.bare.html') !== BUDGET.screen) {
    console.error('✕ self-test: الحارسُ لا يميّز الخفيفَ من الثقيل')
    process.exit(1)
  }
  console.log('✓ self-test: الخفيفُ يمرّ والثقيلُ يُمسَك')
}

const args = process.argv.slice(2)
if (args[0] === '--self-test') {
  selfTest()
  args.shift()
}
if (args.length > 0) {
  console.log('\n═══ الوزنُ مضغوطًا ═══\n')
  let over = 0
  for (const file of args) {
    const { raw, gz } = measure(readFileSync(file, 'utf8'))
    const cap = budgetOf(file)
    const ok = gz <= cap
    if (!ok) over++
    console.log(`  ${ok ? '✓' : '✕'} ${basename(file)}  ${(gz / KB).toFixed(1)}KB من ${cap / KB}KB  (خامًا ${(raw / KB).toFixed(0)}KB)`)
  }
  console.log(`\nالمجموع: ${over} فوق سقفه`)
  if (over > 0) process.exit(1)
}

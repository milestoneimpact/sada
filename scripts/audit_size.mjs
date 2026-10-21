/**
 * تدقيقُ الوزن — **كلُّ صفحةٍ تحت سقفها مضغوطةً** (D-266 · GROWTH-PLAN م-٦).
 *
 * الصفحةُ تصل الهاتفَ مضغوطةً بـ gzip، **فالوزنُ الذي يدفعه المالكُ هو المضغوط** لا الخام. والسقفُ سقفٌ لا هدف: يمنع الرجوع،
 * وما تجاوزه يُقسَم أو يُؤجَّل تحميلُه، ولا يُرفع السقفُ ليمرّ.
 *
 * | الصفحة | السقف مضغوطًا | لماذا |
 * |---|---|---|
 * | اللوحةُ وأقسامُها (`panel*`) | ‏26KB | تُفتح كلَّ يوم، وفيها الورقةُ كاملة — وأثقلُها اليومَ المحرّرُ ‏23.1KB |
 * | الشاشاتُ (`screen-*`) والوثيقة | ‏14KB | صفحةٌ واحدةُ الغرض — وأثقلُها اليومَ «ما عليك» ‏11.4KB |
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
export const BUDGET = { panel: 26 * KB, screen: 14 * KB }

export function budgetOf(file) {
  return basename(file).startsWith('panel') ? BUDGET.panel : BUDGET.screen
}

export function measure(html) {
  return { raw: Buffer.byteLength(html), gz: gzipSync(html, { level: 9 }).length }
}

function selfTest() {
  const small = measure('<p>صدى</p>'.repeat(10))
  // ‏نصٌّ عشوائيٌّ لا ينضغط: يتجاوز السقفَ مضغوطًا
  const noise = Array.from({ length: 40 * KB }, () => String.fromCharCode(33 + Math.floor(Math.random() * 90))).join('')
  const big = measure(noise)
  if (small.gz > BUDGET.screen || big.gz <= BUDGET.screen || budgetOf('/tmp/panel-x.html') !== BUDGET.panel) {
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

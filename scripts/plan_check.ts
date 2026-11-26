/**
 * ‏`npm run plan:check -- <ملف>` (D-408): يفحص ملفَّ خطّةٍ (`.md` أو `.csv` أو `.json`) بقارئ التطبيق نفسِه، ويطبع
 * كلَّ خطأٍ بسطره وعموده بالعربيّة. يخرج بـ0 إن سلم، و1 إن لم يسلم، و2 إن لم يُعطَ ملفّ.
 */
import { readFileSync } from 'node:fs'
import { checkPlanFile } from '../src/lib/plan/schema'

const file = process.argv[2]
if (file === undefined) {
  console.error('الاستعمال: npm run plan:check -- plans/2026-12.md')
  process.exit(2)
}
let text: string
try { text = readFileSync(file, 'utf8') } catch {
  console.error(`لا أقرأ الملفّ: ${file}`)
  process.exit(2)
}
const r = checkPlanFile(file, text)
for (const l of r.lines) console.log('✗ ' + l)
console.log(r.ok ? `✓ ${file}: ${r.rows} منشورًا، بلا خطأ` : `✗ ${file}: ${r.lines.length} ملحوظة`)
process.exit(r.ok ? 0 : 1)

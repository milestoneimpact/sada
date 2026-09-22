/** يقارن بصمتين من `snapshot_styles.mjs` ويعدّ العناصرَ التي اختلفت بصمتُها (D-148). */
import { readFileSync } from 'node:fs'
const [before, after] = process.argv.slice(2)
if (!before || !after) { console.error('الاستعمال: node scripts/diff_snapshots.mjs <before.json> <after.json>'); process.exit(2) }
const A = JSON.parse(readFileSync(before)), B = JSON.parse(readFileSync(after))
let diffs = 0; const byCls = new Map(); const pages = []
for (const k of Object.keys(A)) { const a = A[k], b = B[k]; if (!b || a.length !== b.length) { console.log('len', k); diffs++; continue }
  let d = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) { d++; const cls = a[i].split(' ')[1]; byCls.set(cls, (byCls.get(cls) || 0) + 1) }
  if (d) { diffs += d; pages.push(k + ':' + d) } }
console.log('عناصرُ اختلفت بصمتُها:', diffs); console.log(pages.join('  ')); console.log([...byCls].sort((x, y) => y[1] - x[1]).slice(0, 30).map(([c, n]) => n + '× ' + c).join('\n'))
process.exit(diffs === 0 ? 0 : 1)

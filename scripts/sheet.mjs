/**
 * ورقةُ الأنماط في مدقّقاتها — **ملفّاتٌ بترتيبها لا ملفٌّ واحد** (`scripts/split_styles.mjs`).
 *
 * المدقّقاتُ التي تقرأ مصدرَ الورقة نصًّا (عدُّ px، ومقاساتُ الأيقونات، والأصنافُ بلا قاعدة،
 * والاتّجاه) تقرؤها من هنا: `styles.ts` ثمّ وحداتُ `styles/` بترتيب أسمائها، وهو ترتيبُ الورقة.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** ملفٌّ من الورقة: `routes/ui/styles.ts` أو وحدةٌ منها. */
export const SHEET_RE = /routes\/ui\/styles(\.ts|\/\d\d-[a-z]+\.ts)$/

/** مساراتُ الورقة بترتيبها، من جذر `src/`. */
export function sheetFiles(src) {
  const dir = join(src, 'routes/ui/styles')
  let mods = []
  try { mods = readdirSync(dir).filter((f) => /^\d\d-[a-z]+\.ts$/.test(f)).sort().map((f) => join(dir, f)) } catch { /* ورقةٌ واحدة */ }
  return [join(src, 'routes/ui/styles.ts'), ...mods]
}

/** مصدرُ الورقة كلّه نصًّا واحدًا. */
export function sheetSource(src) {
  return sheetFiles(src).map((f) => readFileSync(f, 'utf8')).join('\n')
}

/** نصُّ CSS في القوالب بترتيبه، بلا ما حولها من TypeScript — و`${…}` باقٍ كما كُتب. */
export function sheetCss(src) {
  const [main, ...mods] = sheetFiles(src)
  const body = (code, open) => { const at = code.indexOf(open); return at < 0 ? '' : code.slice(at + open.length, code.lastIndexOf('`')) }
  if (mods.length === 0) return body(readFileSync(main, 'utf8'), 'export const STYLE = TOKENS + `')
  return mods.map((f) => body(readFileSync(f, 'utf8'), ' = `')).join('')
}

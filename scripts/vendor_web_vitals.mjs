/**
 * يولّد `src/lib/ui/vendor/webVitals.ts` من حزمة `web-vitals` المثبَّتة (D-299).
 *
 * ## لماذا نسخةٌ حرفيّة لا استيراد
 *
 * سكربتُ الواجهة يُجمَّع عند إقلاع العامل من سلاسلَ نصّيّة (`asset.ts`) ويُخدَم من أصلنا ببصمته، ولا يُحمَّل شيءٌ من
 * خارج الأصل (سياسةُ المحتوى D-150). والحزمةُ تُنشَر بناءً جاهزًا للمتصفّح (`web-vitals.iife.js`) لا يمرّ بمجمّع
 * العامل. فتُنسَخ حرفيًّا في سلسلةٍ واحدة، **واختبارُ `webVitals.test.ts` يقارنها بملفّ الحزمة** فلا تشيخ بصمت:
 * من بدّل الرقمَ في `package.json` أعاد التوليد.
 *
 * الاستعمال:  node scripts/vendor_web_vitals.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'

const PKG = new URL('../node_modules/web-vitals/package.json', import.meta.url)
const SRC = new URL('../node_modules/web-vitals/dist/web-vitals.iife.js', import.meta.url)
const OUT = new URL('../src/lib/ui/vendor/webVitals.ts', import.meta.url)

const version = JSON.parse(readFileSync(PKG, 'utf8')).version
const code = readFileSync(SRC, 'utf8').trim()
if (!code.startsWith('var webVitals=')) throw new Error('البناءُ المتوقَّع يبدأ بـ var webVitals= — تغيّر شكلُ الحزمة')

const out = `/**
 * web-vitals ${version} — نسخةٌ حرفيّةٌ من \`node_modules/web-vitals/dist/web-vitals.iife.js\` (Google، رخصة Apache-2.0).
 *
 * تُضمَّن في سكربت الواجهة (D-299) لأنّ السكربتَ يُخدَم من أصلنا بلا طلبٍ خارجيّ. **لا تُعدَّل بيد**: يولّدها
 * \`node scripts/vendor_web_vitals.mjs\`، واختبارُ \`webVitals.test.ts\` يقارنها بملفّ الحزمة المثبَّتة.
 */
export const WEB_VITALS_IIFE = ${JSON.stringify(code)}
`
writeFileSync(OUT, out)
console.log(`✓ web-vitals ${version}: ${code.length} حرفًا إلى src/lib/ui/vendor/webVitals.ts`)

#!/usr/bin/env node
/**
 * يضمّن خطَّ العنوان في الحزمة — **ولا يُترَك للمتصفّح أن يجده**.
 *
 * ## لماذا يُضمَّن
 *
 * الشريحةُ تُرسَم في متصفّحِ Cloudflare لا في متصفّحنا، **ولا نعرف ما
 * الخطوطُ المثبَّتة فيه**. وخطٌّ عربيٌّ غائبٌ لا يعطي خطأً — يعطي
 * **مربّعاتٍ فارغةً أو حروفا منفصلة**، وتخرج الصورةُ باسم المالك.
 *
 * وطلبُه من شبكةٍ خارجيّة يضيف نقطةَ فشلٍ ثالثة، **ويسرّب أنّ صورةً
 * تُبنى الآن** إلى من يستضيف الخطّ.
 *
 * فيُضمَّن `base64` في الحزمة. و`woff2` العربيّ من Cairo أربعةَ عشرَ
 * كيلوبايت — ثمنٌ لا يُذكَر في حزمةٍ حدُّها ميغابايتات.
 *
 * ## ولماذا سكربتٌ لا لصقٌ يدويّ
 *
 * كتلةُ `base64` في ملفٍّ لا تُراجَع: لا يعرف قارئُها ما فيها ولا من
 * أين جاءت. **وسكربتٌ يعيد توليدَها من حزمةٍ مسمّاةٍ بنسختها يجعلها
 * قابلةً للتدقيق** — ويُعاد تشغيلُه فيُطابِق أو يكشف تبديلا.
 *
 * ## ووجوهُ الإنفوجرافيك معه (D-185)
 *
 * الإنفوجرافيك (D-174) يُرسَم في المتصفّح نفسِه بثلاثة وجوه: Reem Kufi للعناوين
 * وBeiruti للمتن وInter للأرقام. وكان يستوردها من خطوط اللوحة، **فلمّا خرجت
 * اللوحةُ إلى Plex (المرحلة ١ من D-183) كان حذفُها يكسر بناءه أو يغيّر الصورَ
 * المنشورة قبل قرار المالك (M-25)**. فتُضمَّن هنا مع خطّ الشريحة — **بايتاتٍ
 * هي نفسُها**، فيبقى الإنفوجرافيك كما هو بكسلًا بكسلًا حتّى المرحلة ٥. ولا
 * تُسبَق ولا تُخدَم للّوحة ولا تُعَدّ في سقف خطّها.
 *
 * الاستعمال:  node scripts/embed_font.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'

const PKG = 'node_modules/@fontsource/cairo/files'
const FACES = [
  { file: 'cairo-arabic-700-normal.woff2', name: 'ARABIC_BOLD' },
  { file: 'cairo-latin-600-normal.woff2', name: 'LATIN_SEMI' },
]

const parts = FACES.map(({ file, name }) => {
  const bytes = readFileSync(`${PKG}/${file}`)
  return { name, file, size: bytes.length, b64: bytes.toString('base64') }
})

/** وجوهُ الإنفوجرافيك — **الملفّاتُ التي كانت في خطوط اللوحة نفسُها**، فلا يتغيّر بايتٌ في الصورة. */
const INFO_FACES = [
  { pkg: '@fontsource-variable/reem-kufi', file: 'reem-kufi-arabic-wght-normal.woff2', name: 'REEM_KUFI', why: 'العناوين' },
  { pkg: '@fontsource-variable/beiruti', file: 'beiruti-arabic-wght-normal.woff2', name: 'BEIRUTI', why: 'المتن' },
  { pkg: '@fontsource-variable/inter', file: 'inter-latin-wght-normal.woff2', name: 'INTER', why: 'الأرقامُ واللاتينيّ' },
].map((f) => {
  const bytes = readFileSync(`node_modules/${f.pkg}/files/${f.file}`)
  return { ...f, size: bytes.length, b64: bytes.toString('base64') }
})

const out = `/**
 * خطُّ الشريحة — **مضمَّنٌ لا مطلوبٌ من شبكة** (D-085).
 *
 * ## لا يُحرَّر بيد
 *
 * وُلّد بـ \`node scripts/embed_font.mjs\` من حزمة \`@fontsource/cairo\`
 * المثبَّتة بنسختها في \`package.json\`. **وأيُّ تعديلٍ هنا يُمحى عند
 * إعادة التوليد.**
 *
 * ## ولماذا الضمّ
 *
 * الشريحةُ تُرسَم في متصفّحِ Cloudflare لا عندنا، **ولا نعرف خطوطَه**.
 * وخطٌّ عربيٌّ غائبٌ لا يعطي خطأً — يعطي مربّعاتٍ فارغةً أو حروفا
 * منفصلة، وتخرج الصورةُ باسم المالك. وطلبُه من شبكةٍ خارجيّة يضيف نقطةَ
 * فشلٍ ثالثة ويسرّب أنّ صورةً تُبنى الآن.
 *
 * ## الرخصة
 *
 * Cairo — SIL Open Font License 1.1، وهي تجيز الضمَّ وإعادةَ التوزيع
 * داخل برنامج. حقوقُ المؤلّفين محفوظةٌ لـ The Cairo Project Authors.
 */

/** اسمُ العائلة كما يُنادى في \`font-family\`. */
export const SLIDE_FONT = 'Sada Cairo'

${parts
  .map(
    (p) => `/** \`${p.file}\` — ${p.size} بايتا قبل الترميز. */
export const ${p.name}_WOFF2 = '${p.b64}'`,
  )
  .join('\n\n')}

/**
 * وجوهُ الخطّ جاهزةً للحقن في \`<style>\`.
 *
 * و\`font-display: block\` مقصودة: **لا تُصوَّر الشريحةُ بخطٍّ بديلٍ ثمّ
 * يصل الخطُّ الصحيح** — والصورةُ لقطةٌ واحدةٌ لا صفحةٌ تُعاد رسمُها.
 */
export const FONT_FACE_CSS = [
${parts
  .map(
    (p) => `  "@font-face{font-family:'" + SLIDE_FONT + "';font-style:normal;" +
    "font-weight:${p.name === 'ARABIC_BOLD' ? 700 : 600};font-display:block;" +
    "src:url(data:font/woff2;base64," + ${p.name}_WOFF2 + ") format('woff2')}"`,
  )
  .join(',\n')},
].join('')

/**
 * وجوهُ الإنفوجرافيك (D-174) — **انتقلت من خطوط اللوحة إلى هنا** (D-185).
 *
 * اللوحةُ صارت على Plex، **والصورةُ المنشورةُ لا تتبدّل قبل قرار المالك** (M-25):
 * فالبايتاتُ هنا هي التي كانت هناك، ولا يتغيّر في الإنفوجرافيك بكسل. وتخرج
 * مع حزمها في المرحلة ٥ حين يصير خطُّ الصور Plex كذلك.
 */
export interface InfoFace {
  readonly b64: string
}

${INFO_FACES
  .map(
    (f) => `/** ${f.why} — \`${f.file}\` من \`${f.pkg}\` · ${f.size} بايتا قبل الترميز. */
export const ${f.name}: InfoFace = { b64: '${f.b64}' }`,
  )
  .join('\n\n')}
`

writeFileSync('src/lib/image/font.ts', out)
const total = [...parts, ...INFO_FACES].reduce((sum, p) => sum + p.size, 0)
console.log(`✓ ضُمّ ${parts.length + INFO_FACES.length} وجها · ${total} بايتا · ${Math.round(out.length / 1024)}KB مصدرا`)

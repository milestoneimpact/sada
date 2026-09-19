#!/usr/bin/env node
/**
 * يضمّن خطَّي اللوحة في الحزمة — **ولا يُطلبان من شبكةٍ ثالثة** (D-099).
 *
 * ## لماذا يُضمَّنان
 *
 * كانت الوثيقةُ تطلبهما من `fonts.googleapis.com`: **ثلاثُ رحلاتٍ قبل
 * رسم الحرف الأوّل** — `preconnect`، ثمّ ورقةُ أنماطٍ تُقرأ لتُعرَف
 * عناوينُ الملفّات، ثمّ الملفّات. ولكلٍّ منها زمنُ سفرٍ وزمنُ تسمية.
 *
 * **وثمنٌ ثالثٌ ليس أداءً**: كلُّ فتحةٍ للوحة تقول لـ Google متى فتحها
 * المالكُ ومن أين. ولنا `/privacy` تُقرأ من الخارج، **وسطرٌ فيها عن
 * خطٍّ خارجيٍّ لا يُحمَد**.
 *
 * ## والمتغيّرُ لا الثابت — بالقياس
 *
 * | | ملفّات | بايتات |
 * |---|---|---|
 * | من Google اليوم (‏٤ أوزانٍ × أسرتين) | ‏٨ · ‏٣ رحلات | ‏≈١٧٥KB |
 * | ثابتٌ ذاتيّ (‏٣ أوزان) | ‏٦ | ‏١٣٢KB |
 * | **متغيّرٌ ذاتيّ** | **‏٢ · رحلةٌ واحدة** | **‏١٠٣KB** |
 *
 * **والمتغيّرُ يفوز في الثلاثة**: أقلُّ بايتا، وأقلُّ طلبا، **ويعطي كلَّ
 * وزنٍ بين ‏٤٠٠ و‏٧٠٠** — والوزنُ ‏٥٠٠ يُستعمَل في ثلاثة مواضعَ وكان
 * سيُقرَّب لو حُمّلت أوجهٌ ثابتة. ووزنٌ يُضاف غدا يكلّف صفرا.
 *
 * ## ولماذا سكربتٌ لا لصقٌ يدويّ
 *
 * كتلةُ `base64` في ملفٍّ لا تُراجَع: لا يعرف قارئُها ما فيها ولا من
 * أين جاءت. **وسكربتٌ يعيد توليدَها من حزمةٍ مسمّاةٍ بنسختها يجعلها
 * قابلةً للتدقيق** — ويُعاد تشغيلُه فيُطابِق أو يكشف تبديلا.
 *
 * وهي سنّةُ `embed_font.mjs` نفسُها (D-085) — وذاك لخطّ الشريحة، وهذا
 * لخطّ اللوحة. **ولا يُخلَط بينهما**: الشريحةُ تُرسَم في متصفّح
 * Cloudflare، واللوحةُ في متصفّح المالك.
 *
 * الاستعمال:  node scripts/embed_ui_font.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

/**
 * ما يُضمَّن — **والمجموعةُ المحرفيّةُ مقصوصةٌ عند المصدر.**
 *
 * `@fontsource` يقصّ بالكتلة اللغويّة: `arabic` و `latin` وحدهما،
 * بلا سيريليّةٍ ولا يونانيّةٍ ولا لاتينيّةٍ موسَّعة. **ولا نقصّ نحن**:
 * قصٌّ بيدٍ يسقط محرفا يظهر بعد شهرٍ في اسم مصدرٍ أو نموذج.
 */
const FACES = [
  {
    pkg: '@fontsource-variable/beiruti',
    file: 'beiruti-arabic-wght-normal.woff2',
    name: 'BEIRUTI',
    family: 'Beiruti',
    why: 'العربيّةُ — وهي المتنُ كلُّه',
  },
  {
    pkg: '@fontsource-variable/inter',
    file: 'inter-latin-wght-normal.woff2',
    name: 'INTER',
    family: 'Inter',
    why: 'اللاتينيُّ والرقم — أسماءُ النماذج والمعرّفاتُ والمبالغ',
  },
  /*
   * **وجهُ العرض** (D-143): كوفيٌّ هندسيٌّ للعناوين ولصائق المؤشّرات
   * ورؤوس الأقسام — يقول «مؤسّسة» حيث تقول بيروتي «متن». المجموعةُ
   * العربيّةُ وحدَها: ‏١٢KB، واللاتينيُّ يبقى لـ Inter.
   */
  {
    pkg: '@fontsource-variable/reem-kufi',
    file: 'reem-kufi-arabic-wght-normal.woff2',
    name: 'REEM_KUFI',
    family: 'Reem Kufi',
    why: 'وجهُ العرض — العناوينُ ولصائقُ المؤشّرات ورؤوسُ الأقسام',
  },
]

/** سقفٌ **مُعلَنٌ ليُحرَس، لا ليُرضي** — كما في `audit_mobile`. */
const MAX_TOTAL_KB = 140

const faces = FACES.map((face) => {
  const bytes = readFileSync(`node_modules/${face.pkg}/files/${face.file}`)
  // بصمةٌ في الاسم: التبديلُ يبدّل المسار، فتُخبَّأ الملفّاتُ للأبد بلا
  // خوفِ شيخوخة. وثمانيةٌ من ستّةَ عشرَ تكفي — هذه ليست حراسةً
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 8)
  return { ...face, bytes, hash, b64: bytes.toString('base64') }
})

const totalKb = faces.reduce((sum, f) => sum + f.bytes.length, 0) / 1024
if (totalKb > MAX_TOTAL_KB) {
  console.error(
    `\n✕ المجموع ${totalKb.toFixed(1)}KB — فوق السقف المعلَن ${MAX_TOTAL_KB}KB.` +
      `\n  والسقفُ يُحرَس لا يُرفَع: يُقصّ وزنٌ أو أسرة، أو يُعاد القياسُ ويُعلَن السببُ في DECISIONS.\n`,
  )
  process.exit(1)
}

const out = `/**
 * خطّا اللوحة — **مضمَّنان لا مطلوبان من شبكة** (D-099).
 *
 * ## لا يُحرَّر بيد
 *
 * وُلّد بـ \`node scripts/embed_ui_font.mjs\` من حزمتَي
 * \`@fontsource-variable\` المثبَّتتين بنسختيهما في \`package.json\`.
 * **وأيُّ تعديلٍ هنا يُمحى عند إعادة التوليد.**
 *
 * ## ولماذا الضمّ
 *
 * ثلاثُ رحلاتٍ إلى \`fonts.googleapis.com\` قبل رسم الحرف الأوّل، وثمنٌ
 * ثالثٌ ليس أداءً: **كلُّ فتحةٍ للوحة تقول لطرفٍ ثالثٍ متى فتحها المالك.**
 *
 * ## والمتغيّرُ لا الثابت
 *
 * ملفٌّ واحدٌ لكلّ أسرةٍ يغطّي ‏٤٠٠ إلى ‏٧٠٠ — أقلُّ بايتا من ثلاثة أوجهٍ
 * ثابتة، **ويعطي الوزنَ ‏٥٠٠** الذي كان سيُقرَّب.
 *
 * ## الرخصة
 *
 * Beiruti و Inter و Reem Kufi — SIL Open Font License 1.1، وهي تجيز الضمَّ وإعادةَ
 * التوزيع داخل برنامج. حقوقُ المؤلّفين محفوظةٌ لأصحابها.
 */

/** وجهُ خطٍّ مضمَّن: بصمتُه في مساره، وبايتاتُه \`base64\`. */
export interface EmbeddedFace {
  readonly family: string
  readonly hash: string
  readonly path: string
  readonly bytes: number
  readonly b64: string
}

${faces
  .map(
    (f) => `/** ${f.why} · ${(f.bytes.length / 1024).toFixed(1)}KB · ${f.file} */
export const ${f.name}: EmbeddedFace = {
  family: '${f.family}',
  hash: '${f.hash}',
  path: '/f/${f.family.toLowerCase().replace(/\s+/g, '-')}.${f.hash}.woff2',
  bytes: ${f.bytes.length},
  b64: '${f.b64}',
}`,
  )
  .join('\n\n')}

/** الأوجهُ معا — تُمسَح في المسار وفي القشرة، فلا يُنسى أحدُها. */
export const FACES: readonly EmbeddedFace[] = [${faces.map((f) => f.name).join(', ')}]
`

writeFileSync('src/lib/ui/fonts.ts', out)
for (const f of faces) {
  console.log(`  ✓ ${f.family.padEnd(9)} ${(f.bytes.length / 1024).toFixed(1).padStart(6)}KB  ${f.hash}`)
}
console.log(`\n  المجموع ${totalKb.toFixed(1)}KB من سقف ${MAX_TOTAL_KB}KB\n`)

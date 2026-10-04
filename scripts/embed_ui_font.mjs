#!/usr/bin/env node
/**
 * يضمّن خطَّ اللوحة في الحزمة — **ولا يُطلَب من شبكةٍ ثالثة** (D-099).
 *
 * ## زوجُ Plex لا ثلاثةُ أصوات (D-185 · المرحلة ١ من D-183)
 *
 * كان Inter أوّلَ الترتيب فيرسم مسافاتِ الكلمات العربيّة وأرقامَها وترقيمَها،
 * وBeiruti المتنَ، وReem Kufi العناوين: **ثلاثةُ أصواتٍ في السطر الواحد**
 * (‏575 من 1,179 نصًّا تخلط خطّين). فصار زوجًا صُمّم جزآه معًا: IBM Plex Sans
 * Arabic بوجهين ثابتين (400 و600) وIBM Plex Sans اللاتينيّ متغيّرًا مقصورًا
 * على 400–600 بـ `unicode-range`. ووجوهُ الإنفوجرافيك الثلاثة خرجت إلى
 * `lib/image/font.ts` (`embed_font.mjs`)، فلا تُسبَق ولا تُعَدّ في السقف.
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
 * **وحيث وُجد المتغيّرُ فاز**: اللاتينيُّ من Plex متغيّرٌ ‏45,712 بايتا، والثابتان
 * (400 و600) ‏46,840 في ملفّين. **أمّا العربيّ فلا محورَ أوزانٍ له** في
 * `@fontsource`: وجهان ثابتان، **ولذلك لا وزنَ في الواجهة غيرُ ‏٤٠٠ و‏٦٠٠** (D-185).
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
 *
 * **و`unicode-range` يُقرأ من ورقة الحزمة نفسِها لا يُكتب هنا**: نطاقُ الوجه
 * هو ما قصّته الحزمةُ عليه، ونطاقٌ يُنسَخ بيدٍ يشيخ عند أوّل تحديثٍ لها.
 * وهو الذي يجعل الترتيبَ صحيحًا: العربيُّ أوّلُ الأسرة فيأخذ حروفَه وحدها،
 * واللاتينيُّ يأخذ المسافةَ والرقمَ والترقيمَ العامّ (U+2000–206F) و«» و·.
 */
const FACES = [
  {
    pkg: '@fontsource/ibm-plex-sans-arabic',
    css: '400.css',
    file: 'ibm-plex-sans-arabic-arabic-400-normal.woff2',
    name: 'PLEX_AR_400',
    family: 'Plex Arabic',
    slug: 'plex-ar-400',
    weight: '400',
    why: 'العربيّةُ للقراءة — المتنُ والتلميحُ والحقل',
  },
  {
    pkg: '@fontsource/ibm-plex-sans-arabic',
    css: '600.css',
    file: 'ibm-plex-sans-arabic-arabic-600-normal.woff2',
    name: 'PLEX_AR_600',
    family: 'Plex Arabic',
    slug: 'plex-ar-600',
    weight: '600',
    why: 'العربيّةُ الثخينة — العناوينُ واللصائقُ والأزرار',
  },
  {
    pkg: '@fontsource-variable/ibm-plex-sans',
    css: 'wght.css',
    file: 'ibm-plex-sans-latin-wght-normal.woff2',
    name: 'PLEX_SANS',
    family: 'Plex Sans',
    slug: 'plex-sans',
    // ‏المحورُ ‏100–700، **ويُقصَر على الوزنين المعلَنين**: طلبُ ‏700 يُقرَّب إلى ‏600 لا يُرسَم
    weight: '400 600',
    why: 'اللاتينيُّ والرقمُ والمسافة — أسماءُ المنصّات والنماذج والمعرّفاتُ والمبالغ',
  },
]

/** سقفٌ **مُعلَنٌ ليُحرَس، لا ليُرضي** — كما في `audit_mobile`. */
const MAX_TOTAL_KB = 140

/** نطاقُ الوجه من ورقة الحزمة: الكتلةُ التي يذكر `src` فيها الملفَّ نفسَه. */
function rangeOf(face) {
  const css = readFileSync(`node_modules/${face.pkg}/${face.css}`, 'utf8')
  for (const block of css.split('@font-face')) {
    if (!block.includes(`/${face.file})`)) continue
    const m = /unicode-range:\s*([^;]+);/.exec(block)
    if (m !== null) return m[1].trim()
  }
  console.error(`\n✕ لا unicode-range لـ ${face.file} في ${face.pkg}/${face.css} — والوجهُ بلا نطاقٍ يأخذ كلَّ حرف.\n`)
  process.exit(1)
}

const faces = FACES.map((face) => {
  const bytes = readFileSync(`node_modules/${face.pkg}/files/${face.file}`)
  // بصمةٌ في الاسم: التبديلُ يبدّل المسار، فتُخبَّأ الملفّاتُ للأبد بلا
  // خوفِ شيخوخة. وثمانيةٌ من ستّةَ عشرَ تكفي — هذه ليست حراسةً
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 8)
  return { ...face, bytes, hash, range: rangeOf(face), b64: bytes.toString('base64') }
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
 * خطُّ اللوحة — **مضمَّنٌ لا مطلوبٌ من شبكة** (D-099)، **وزوجٌ واحدٌ لا ثلاثة** (D-185).
 *
 * ## لا يُحرَّر بيد
 *
 * وُلّد بـ \`node scripts/embed_ui_font.mjs\` من \`@fontsource/ibm-plex-sans-arabic\`
 * و\`@fontsource-variable/ibm-plex-sans\` المثبَّتتين بنسختيهما في \`package.json\`،
 * ونطاقُ كلّ وجهٍ من ورقة حزمته. **وأيُّ تعديلٍ هنا يُمحى عند إعادة التوليد.**
 *
 * ## ولماذا الضمّ
 *
 * ثلاثُ رحلاتٍ إلى \`fonts.googleapis.com\` قبل رسم الحرف الأوّل، وثمنٌ
 * ثالثٌ ليس أداءً: **كلُّ فتحةٍ للوحة تقول لطرفٍ ثالثٍ متى فتحها المالك.**
 *
 * ## ووزنان لا غير
 *
 * العربيُّ وجهان ثابتان (‏٤٠٠ و‏٦٠٠)، واللاتينيُّ متغيّرٌ مقصورٌ عليهما.
 * **فلا ‏٥٠٠ ولا ‏٧٠٠ في الواجهة**، و\`font-synthesis:none\` يمنع اصطناعَ ثخانةٍ
 * لم تُحمَّل — والعربيّةُ المصطنَعةُ الثخانة تلتصق نقاطُها.
 *
 * ## الرخصة
 *
 * IBM Plex Sans Arabic و IBM Plex Sans — SIL Open Font License 1.1، وهي تجيز الضمَّ
 * وإعادةَ التوزيع داخل برنامج. حقوقُ المؤلّفين محفوظةٌ لـ IBM Corp.
 */

/** وجهُ خطٍّ مضمَّن: بصمتُه في مساره، ووزنُه ونطاقُه كما في ورقة حزمته، وبايتاتُه \`base64\`. */
export interface EmbeddedFace {
  readonly family: string
  /** وزنٌ واحدٌ للثابت، أو مدًى «400 600» للمتغيّر */
  readonly weight: string
  readonly unicodeRange: string
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
  weight: '${f.weight}',
  unicodeRange: '${f.range}',
  hash: '${f.hash}',
  path: '/f/${f.slug}.${f.hash}.woff2',
  bytes: ${f.bytes.length},
  b64: '${f.b64}',
}`,
  )
  .join('\n\n')}

/** الأوجهُ معا — تُمسَح في المسار وفي القشرة، فلا يُنسى أحدُها. والعربيُّ أوّلًا. */
export const FACES: readonly EmbeddedFace[] = [${faces.map((f) => f.name).join(', ')}]
`

writeFileSync('src/lib/ui/fonts.ts', out)
for (const f of faces) {
  console.log(`  ✓ ${f.slug.padEnd(12)} ${(f.bytes.length / 1024).toFixed(1).padStart(6)}KB  ${f.hash}`)
}
console.log(`\n  المجموع ${totalKb.toFixed(1)}KB من سقف ${MAX_TOTAL_KB}KB\n`)

#!/usr/bin/env node
/**
 * مدقّقُ التباين — يُشغَّل ولا يُقاس بالعين.
 *
 * وسببُ وجوده أنّ ذهب الهويّة `#d4af37` يقرأ على الداكن ولا يقرأ على
 * الأبيض: نسبتُه هناك ١٫٩:١، أي نصفُ ما تشترطه WCAG. فالثيم النهاريّ
 * يحتاج ذهبا أغمق — **وهذا ما لا تكشفه لقطةُ شاشة**: النصّ يبدو ظاهرا
 * لعينٍ سليمة في ضوءِ غرفة، ويختفي في الشمس أو على شاشةٍ رخيصة.
 *
 * يقرأ القيَمَ من الكائن الذي تُولَّد منه الورقة (`THEME` و`PRINT` في
 * `src/routes/ui/tokens.ts`) لا من قائمةٍ منسوخة ولا من نصٍّ مكتوب، فقيمةٌ
 * تتبدّل هناك تُفحص هنا بلا أن يتذكّر أحد (D-183 · المرحلة ٠).
 *
 * ## وثلاثةُ مقاييس لا واحد
 *
 * | المقياس | ما يجيب عنه | الحكم |
 * |---|---|---|
 * | نسبةُ WCAG 2.x | أيُقرأ النصّ؟ — المعيارُ المُلزِم | يردّ |
 * | APCA Lc ‏0.0.98G-4g | أيُقرأ بحجمه ووزنه؟ — استشاريٌّ مرشَّحٌ لـ WCAG 3 | يردّ على ثلاثة أزواج، ويُطبَع لكلّ زوج |
 * | ΔE_OK | أيتمايز لونان بالعين؟ | يردّ على النحاس مقابل التحذير |
 *
 * **وΔE هنا ΔE_OK**: المسافةُ في فضاء OKLab مضروبةً في ‏١٠٠، وعتبةُ الإدراك نحو
 * ‏٢. ولا يُقارَن برقم CIEDE2000 — الصيغتان تعطيان للزوج نفسِه رقمين مختلفين
 * (النحاسُ والتحذيرُ القديمان: ‏٢٫٨ هنا و‏٦٫٣ هناك). **ورقمٌ بلا اسم صيغته
 * لا يُحاسَب عليه**، وهو ما أمسكته المراجعةُ النقديّة لخطّة التصميم.
 *
 * ولا اعتماديّةَ: الصيغُ الثلاث مكتوبةٌ هنا من مراجعها.
 */
import { PRINT, THEME } from '../src/routes/ui/tokens.ts'

/** قيمةُ الرمز بعد حلّ `var(--x)` في الوضع نفسِه — `--link` نهارًا هو `--brand`. */
function value(tokens, name, depth = 0) {
  const raw = tokens[`--${name}`]
  if (raw === undefined || depth > 4) return undefined
  const ref = /^var\(--([a-z0-9-]+)\)$/.exec(raw)
  return ref === null ? raw : value(tokens, ref[1], depth + 1)
}

/** ‏`#rgb` و`#rrggbb` إلى ‏[r,g,b] — وما ليس لونًا مصمتًا (شفّافٌ أو تدرّج) لا يُقاس. */
function rgb(hex) {
  if (typeof hex !== 'string' || !/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) return null
  let v = hex.slice(1)
  if (v.length === 3) v = [...v].map((c) => c + c).join('')
  return [0, 2, 4].map((i) => Number.parseInt(v.slice(i, i + 2), 16))
}

// ── WCAG 2.x ────────────────────────────────────────────────────────────
function channel(value) {
  const c = value / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function luminance([r, g, b]) {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// ── APCA ‏0.0.98G-4g (Myndex، ثوابتُ SA98G) ──────────────────────────────
/**
 * **والإشارةُ تُسقَط**: Lc موجبٌ لحبرٍ داكنٍ على فاتح، وسالبٌ للعكس. والحدُّ
 * يُقرأ على القيمة المطلقة، فـ«‏-75» في الليل كـ«75» في النهار.
 */
function apca(text, ground) {
  const y = ([r, g, b]) => {
    const raw = 0.2126729 * (r / 255) ** 2.4 + 0.7151522 * (g / 255) ** 2.4 + 0.072175 * (b / 255) ** 2.4
    return raw > 0.022 ? raw : raw + (0.022 - raw) ** 1.414
  }
  const t = y(text)
  const g = y(ground)
  if (Math.abs(g - t) < 0.0005) return 0
  if (g > t) {
    const sapc = (g ** 0.56 - t ** 0.57) * 1.14
    return sapc < 0.1 ? 0 : (sapc - 0.027) * 100
  }
  const sapc = (g ** 0.65 - t ** 0.62) * 1.14
  return sapc > -0.1 ? 0 : (sapc + 0.027) * -100
}

// ── ΔE_OK: المسافةُ في OKLab × ‏١٠٠ (Björn Ottosson، 2020) ─────────────────
function oklab([r, g, b]) {
  const lin = (c) => {
    const v = c / 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  const [R, G, B] = [lin(r), lin(g), lin(b)]
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B)
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B)
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

function deltaEok(a, b) {
  const [x, y] = [oklab(a), oklab(b)]
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) * 100
}

/**
 * ما يُفحص، ولمَ هذا الحدّ.
 *
 * `4.5` لنصّ المتن، و `3` لما هو ١٨٫٦٦ بكسلٍ فأكبر أو عريض — وهو ما
 * تسمح به WCAG AA للنصّ الكبير. ولا يُفحص ما ليس نصّا: حدودُ البطاقات
 * وخطوطُ الفصل زينةٌ لا معلومة — **إلّا حلقةَ المربّع والعلامة في الليل**
 * (D-183): ‏٢:١ هدفٌ بصريٌّ لا شرطٌ من WCAG، والمعنى في الرمز الأبيض نفسِه.
 *
 * والعمودُ الخامس يقصر الزوجَ على وضعٍ: الحلقةُ نهارًا شفّافة، فلا تُقاس.
 */
const PAIRS = [
  ['ink', 'surface', 4.5, 'نصّ المتن على البطاقة'],
  ['ink', 'bg', 4.5, 'نصّ المتن على الأرض'],
  ['ink-2', 'surface', 4.5, 'النصّ الثانوي على البطاقة'],
  ['ink-2', 'bg', 4.5, 'النصّ الثانوي على الأرض'],
  ['ink-3', 'surface', 4.5, 'النصّ الخافت على البطاقة'],
  ['ink-3', 'bg', 4.5, 'النصّ الخافت على الأرض'],
  ['ink-3', 'surface-2', 4.5, 'النصّ الخافت على السطح الثاني'],
  ['ink-3', 'surface-3', 4.5, 'النصّ الخافت على السطح الثالث'],
  ['brand', 'surface', 4.5, 'لونُ الهويّة نصّا على البطاقة'],
  ['brand', 'bg', 4.5, 'لونُ الهويّة نصّا على الأرض'],
  ['on-brand', 'brand', 4.5, 'نصّ الزرّ الأساس على لون الهويّة'],
  // ‏والرابطُ والزرُّ الهادئ حبرُهما «--link» منذ المرحلة ٠
  ['link', 'surface', 4.5, 'الرابطُ على البطاقة'],
  ['link', 'bg', 4.5, 'الرابطُ على الأرض'],
  // والذهبُ طبقةُ تشديدٍ لا زينة: يحمل أرقاما ولصائقَ فيُقاس كنصّ
  ['au', 'surface', 4.5, 'الذهب نصّا على البطاقة'],
  ['au', 'bg', 4.5, 'الذهب نصّا على الأرض'],
  ['ok', 'surface', 4.5, 'حالةُ «جيّد» على البطاقة'],
  ['warn', 'surface', 4.5, 'حالةُ «تحذير» على البطاقة'],
  ['bad', 'surface', 4.5, 'حالةُ «خطر» على البطاقة'],
  ['ok', 'bg', 4.5, 'حالةُ «جيّد» على الأرض'],
  ['warn', 'bg', 4.5, 'حالةُ «تحذير» على الأرض'],
  ['bad', 'bg', 4.5, 'حالةُ «خطر» على الأرض'],
  // ‏والحبّةُ على أرضها — **وهو الموضعُ الوحيدُ لنصّ الحال خارج البطاقة والأرض** (D-183)
  ['ok', 'ok-wash', 4.5, 'حبّةُ «جيّد» على أرضها'],
  ['warn', 'warn-wash', 4.5, 'حبّةُ «تحذير» على أرضها'],
  ['bad', 'bad-wash', 4.5, 'حبّةُ «خطر» على أرضها'],
  // ‏ووصفُ المقطع على مسرحه الداكن (D-172)
  ['np-on-stage', 'np-stage', 4.5, 'نصُّ المعاينة على مسرح المقطع'],
  ['logo-ring', 'surface', 2, 'حلقةُ مربّع المنصّة على البطاقة', 'dark'],
  ['logo-ring', 'bg', 2, 'حلقةُ مربّع المنصّة على الأرض', 'dark'],
  ['mark-ring', 'chrome', 2, 'حلقةُ العلامة على الرافدة', 'dark'],
  ['mark-ring', 'bg', 2, 'حلقةُ العلامة على الأرض', 'dark'],
]

/**
 * APCA بحدودٍ تُقرأ بالحجم والوزن (القسم 10.2 من الخطّة) — **ثلاثةٌ تردّ**:
 * المتنُ ‏٩٠، و«--ink-2» ‏٧٥ لأنّه يحمل كلَّ نصٍّ تحت ‏١٥px، والرابطُ ‏٧٠ لأنّه
 * عبارةٌ قصيرةٌ مسطَّرة. وما سواها يُطبَع ولا يردّ حتّى المرحلة ٢: «--ink-3»
 * الليليّ وحبّاتُ الحال تُضبَط هناك بقيَم الخطّة، ورفعُها هنا بوّابةٌ تسقط
 * على ما لم يُبنَ بعد.
 */
const APCA_MIN = [
  ['ink', 'surface', 90, 'المتن'],
  ['ink-2', 'surface', 75, 'الثانويّ — كلُّ نصٍّ تحت ‏١٥px'],
  ['link', 'surface', 70, 'الرابطُ المسطَّر'],
]

/** وما يُطبَع ليُقرأ: الخافتُ، والحبوبُ على أرضها، والحالُ حيث تُمنَع (D-183). */
const APCA_SHOWN = [
  ['ink-3', 'surface', 'الخافت (45 لنصٍّ لا يُحتاج — المرحلة ٢)'],
  ['ok', 'ok-wash', 'حبّةُ «جيّد» (50 — المرحلة ٢)'],
  ['warn', 'warn-wash', 'حبّةُ «تحذير» (50 — المرحلة ٢)'],
  ['bad', 'bad-wash', 'حبّةُ «خطر» (50 — المرحلة ٢)'],
  ['au', 'surface', 'الرقمُ البطل (45، ‏٣٢px فأكبر)'],
]

/**
 * **والتمايزُ ليس تباينًا**: لونان بنسبة ‏١٫٠٣:١ قد يتمايزان بالصبغة، ولونان
 * بنسبةٍ عالية قد يُقرآن معنًى واحدًا. فيُقاس الفرقُ نفسُه — والنحاسُ
 * والتحذيرُ كانا على ‏٢٫٨ فيُقرأ أحدُهما الآخر (D-183).
 */
const DELTA_MIN = [
  ['au', 'warn', 9.5, 'النحاسُ مقابل التحذير'],
]
const DELTA_SHOWN = [
  ['warn', 'bad', 'التحذيرُ مقابل الخطر (يُدعَم برمزٍ وكلمة)'],
  ['ink-2', 'ink-3', 'الثانويّ مقابل الخافت'],
  ['link', 'ink', 'الرابطُ مقابل المتن (والخطُّ تحته هو العلامة)'],
]

/** نصُّ الحال حيث لا يقع (القسم 3.2): يُطبَع رقمُه ليُعرَف لماذا مُنع. */
const BANNED = [
  ['warn', 'surface-2'], ['ok', 'surface-2'], ['bad', 'surface-2'],
  ['warn', 'surface-3'], ['ok', 'surface-3'], ['bad', 'surface-3'],
]

const THEMES = [
  ['النهاريّ', 'light', THEME.light],
  ['الداكن', 'dark', THEME.dark],
  // والرافدةُ ترث الثيم منذ D-144 فلا تُفحَص ثيمًا ثالثًا؛ والطباعةُ تُعيد
  // قيَمَ النهار على أبيضَ ناصع، فتُفحَص هي.
  ['الطباعة', 'print', PRINT],
]

let failures = 0
const missing = (fg, bg) => {
  console.log(`  ✕ رمزٌ مفقودٌ أو ليس لونًا مصمتًا: --${fg} أو --${bg}`)
  failures += 1
}

for (const [name, mode, tokens] of THEMES) {
  console.log(`\n── ${name} ──`)
  for (const [fg, bg, min, label, only] of PAIRS) {
    if (only !== undefined && only !== mode) continue
    const [a, b] = [rgb(value(tokens, fg)), rgb(value(tokens, bg))]
    if (a === null || b === null) { missing(fg, bg); continue }
    const v = ratio(a, b)
    const pass = v >= min
    if (!pass) failures += 1
    console.log(`  ${pass ? '✓' : '✕'} ${v.toFixed(2)}:1 (≥${min})  ${label}  ${value(tokens, fg)} / ${value(tokens, bg)}`)
  }

  console.log('  · APCA Lc على البطاقة')
  for (const [fg, bg, min, label] of APCA_MIN) {
    const [a, b] = [rgb(value(tokens, fg)), rgb(value(tokens, bg))]
    if (a === null || b === null) { missing(fg, bg); continue }
    const lc = Math.abs(apca(a, b))
    const pass = lc >= min
    if (!pass) failures += 1
    console.log(`  ${pass ? '✓' : '✕'} Lc ${lc.toFixed(1)} (≥${min})  ${label}  --${fg} / --${bg}`)
  }
  for (const [fg, bg, label] of APCA_SHOWN) {
    const [a, b] = [rgb(value(tokens, fg)), rgb(value(tokens, bg))]
    if (a === null || b === null) continue
    console.log(`  · Lc ${Math.abs(apca(a, b)).toFixed(1)}  ${label}  --${fg} / --${bg}`)
  }

  console.log('  · ΔE_OK')
  for (const [x, y, min, label] of DELTA_MIN) {
    const [a, b] = [rgb(value(tokens, x)), rgb(value(tokens, y))]
    if (a === null || b === null) { missing(x, y); continue }
    const d = deltaEok(a, b)
    const pass = d >= min
    if (!pass) failures += 1
    console.log(`  ${pass ? '✓' : '✕'} ΔE_OK ${d.toFixed(1)} (≥${min})  ${label}  ${value(tokens, x)} / ${value(tokens, y)}`)
  }
  for (const [x, y, label] of DELTA_SHOWN) {
    const [a, b] = [rgb(value(tokens, x)), rgb(value(tokens, y))]
    if (a === null || b === null) continue
    console.log(`  · ΔE_OK ${deltaEok(a, b).toFixed(1)}  ${label}`)
  }

  const banned = BANNED.map(([fg, bg]) => {
    const [a, b] = [rgb(value(tokens, fg)), rgb(value(tokens, bg))]
    return a === null || b === null ? '' : `--${fg}/--${bg} ${ratio(a, b).toFixed(2)}`
  }).filter((s) => s !== '')
  console.log(`  · نصُّ الحال لا يقع على السطحين الداخليّين (يُطبَع ولا يُقاس هنا): ${banned.join(' · ')}`)
}

if (failures > 0) {
  console.error(`\n✕ ${failures} زوجا دون الحدّ. لا يُدفع ثيمٌ لا يُقرأ.`)
  process.exit(1)
}
console.log('\n✓ كلّ الأزواج تجتاز WCAG AA وحدودَ APCA وΔE_OK في الثيمات الثلاث.')

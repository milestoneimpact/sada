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
 * | APCA Lc ‏0.0.98G-4g | أيُقرأ بحجمه ووزنه؟ — استشاريٌّ مرشَّحٌ لـ WCAG 3 | يردّ على ثمانية أزواجٍ على البطاقة، ويُطبَع على السطحين الداخليّين |
 * | ΔE_OK | أيتمايز لونان بالعين؟ | يردّ على الذهب مقابل التحذير، وشريطِ العلامة مقابل الرابط والحال والذهب |
 * | عمى الألوان (Machado 2009) | أيتمايز لونان عند من لا يميّز الأحمرَ من الأخضر؟ | يردّ على أزواج الحال الثلاثة (نقاطُ الرافدة لونٌ بلا كلمة)، ويُطبَع الباقي |
 * | إشباعُ النعناع (D-196) | أعاد النعناعُ القاسي من باب؟ | يردّ على كلّ رمزٍ في أسرته، في الثيمين وفي `:root` كلِّه |
 *
 * **وΔE هنا ΔE_OK**: المسافةُ في فضاء OKLab مضروبةً في ‏١٠٠، وعتبةُ الإدراك نحو
 * ‏٢. ولا يُقارَن برقم CIEDE2000 — الصيغتان تعطيان للزوج نفسِه رقمين مختلفين
 * (النحاسُ والتحذيرُ القديمان: ‏٢٫٨ هنا و‏٦٫٣ هناك). **ورقمٌ بلا اسم صيغته
 * لا يُحاسَب عليه**، وهو ما أمسكته المراجعةُ النقديّة لخطّة التصميم.
 *
 * ولا اعتماديّةَ: الصيغُ الثلاث مكتوبةٌ هنا من مراجعها.
 */
import { MARK, MOMENT, PRINT, THEME, TOKENS } from '../src/routes/ui/tokens.ts'

/** قيمةُ الرمز بعد حلّ `var(--x)` في الوضع نفسِه — `--link` نهارًا هو `--brand`. */
function value(tokens, name, depth = 0) {
  const raw = tokens[`--${name}`] ?? MARK[`--${name}`]
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
 * ما يُفحص، ولمَ هذا الحدّ — **جدولُ القسم 3.2 من خطّة التصميم كلُّه** (D-187).
 *
 * `4.5` لنصّ المتن، و`3` لما هو ١٨٫٦٦ بكسلٍ فأكبر أو عريض — وهو ما تسمح به WCAG AA
 * للنصّ الكبير. **و`7` لـ`--ink-2` على السطوح التي يقع عليها**: يحمل كلَّ نصٍّ تحت ‏١٥px،
 * فحدُّه حدُّ AAA لا AA. و`3` للحدود الوظيفيّة (WCAG 1.4.11): حدُّ الحقل والزرّ الثانويّ
 * (`--field`) وحلقةُ التركيز (`--focus`). **ولا يُفحص ما هو زينة**: حدُّ البطاقة
 * (`--line`) يُطبَع ويسنده الظلّ — **إلّا حلقةَ المربّع والعلامة في الليل** (D-183):
 * ‏٢:١ هدفٌ بصريٌّ لا شرطٌ من WCAG، والمعنى في الرمز الأبيض نفسِه.
 *
 * والعمودُ الخامس يقصر الزوجَ على وضعٍ: الحلقةُ نهارًا شفّافة، فلا تُقاس.
 */
const PAIRS = [
  // ── الحبرُ على الأسطح ─────────────────────────────────────────────
  ['ink', 'surface', 4.5, 'المتن على البطاقة'],
  ['ink', 'bg', 4.5, 'المتن على الأرض'],
  ['ink', 'dialog', 4.5, 'المتن على الحوار'],
  ['ink-2', 'surface', 7, 'الثانويّ على البطاقة (يحمل ما تحت ‏١٥px)'],
  ['ink-2', 'bg', 7, 'الثانويّ على الأرض'],
  ['ink-2', 'surface-2', 7, 'الثانويّ على السطح الداخليّ'],
  ['ink-2', 'surface-3', 4.5, 'الثانويّ على المحدَّد والعدد'],
  ['ink-3', 'surface', 4.5, 'الخافت على البطاقة (‏١٥px فأكبر)'],
  ['ink-3', 'bg', 4.5, 'الخافت على الأرض'],
  ['ink-3', 'surface-2', 4.5, 'الخافت على السطح الداخليّ'],
  // ‏والرابطُ والزرُّ الهادئ حبرُهما «--link» مسطَّرًا (D-183 ثمّ D-187)
  ['link', 'surface', 4.5, 'الرابطُ على البطاقة'],
  ['link', 'bg', 4.5, 'الرابطُ على الأرض'],
  // ‏والزرُّ الأوّليُّ في أحواله الثلاث
  ['on-brand', 'brand', 4.5, 'نصُّ الزرّ الأوّليّ'],
  ['on-brand', 'brand-hover', 4.5, 'نصُّ الزرّ الأوّليّ عند التمرير'],
  ['on-brand', 'brand-press', 4.5, 'نصُّ الزرّ الأوّليّ عند الضغط'],
  // ‏**وحبرُ العلامة نصٌّ أيضًا** (D-196): الوسمُ في إطار المنصّة الفاتح، ورقمُ الخطوة، ورمزُ
  // ‏الإرشاد، وشريطُ العودة عند التمرير. كان لا يُقاس إلّا تعبئةً، فمرّ «--brand» تركوازيٌّ ليليٌّ
  // ‏على البطاقة ‏٢٫٨٣:١ في مقترحٍ كامل ولم يمسكه شيء — **أمسكه audit_design على الصفحة**
  // ‏**ومنذ D-325 ما يُبرز ولا يُضغط «--accent» لا «--brand»**: الوسمُ ورقمُ الخطوة ورمزُ الإرشاد ومِلءُ المقياس كانت
  // ‏«--brand»، ونهارًا «--brand» هو «--link» حرفًا — فقُرئ شريطُ التقدّم رابطًا. و«--brand» بعدها تعبئةُ الزرّ وحدَها
  ['accent', 'surface', 4.5, 'المبرِزُ نصًّا على البطاقة (الوسم، ورقمُ الخطوة)'],
  ['accent', 'surface-2', 4.5, 'المبرِزُ نصًّا على السطح الداخليّ (رمزُ الإرشاد)'],
  ['accent', 'bg', 4.5, 'المبرِزُ نصًّا على الأرض'],
  ['accent', 'surface-3', 3, 'تعبئةُ المقياس على مجراه (WCAG 1.4.11)'],
  // ‏ورمزُ القسم الحاليّ في الرافدة بحبر الرابط على المحدَّد — رمزٌ لا نصّ (D-196)
  ['link', 'surface-3', 3, 'رمزُ القسم الحاليّ على المحدَّد'],
  // ‏والذهبُ يحمل الرقمَ البطل فيُقاس نصًّا
  ['au', 'surface', 4.5, 'الذهبُ نصًّا على البطاقة'],
  ['au', 'bg', 4.5, 'الذهبُ نصًّا على الأرض'],
  // ── الحال: على البطاقة والأرض وأرضِه وحدها (3.2) ───────────────────
  ['ok', 'surface', 4.5, 'حالةُ «جيّد» على البطاقة'],
  ['warn', 'surface', 4.5, 'حالةُ «تحذير» على البطاقة'],
  ['bad', 'surface', 4.5, 'حالةُ «خطر» على البطاقة'],
  ['ok', 'bg', 4.5, 'حالةُ «جيّد» على الأرض'],
  ['warn', 'bg', 4.5, 'حالةُ «تحذير» على الأرض'],
  ['bad', 'bg', 4.5, 'حالةُ «خطر» على الأرض'],
  ['ok', 'ok-wash', 4.5, 'حبّةُ «جيّد» على أرضها'],
  ['warn', 'warn-wash', 4.5, 'حبّةُ «تحذير» على أرضها'],
  ['bad', 'bad-wash', 4.5, 'حبّةُ «خطر» على أرضها'],
  // ── المقلوبُ والمحدَّد ──────────────────────────────────────────────
  ['bg', 'ink', 4.5, 'الإشعارُ المقلوب: نصُّه وفعلُه وحلقتُه'],
  ['ink', 'selection', 4.5, 'النصُّ المحدَّد'],
  // ── الحدودُ الوظيفيّة (WCAG 1.4.11) ────────────────────────────────
  ['field', 'surface', 3, 'حدُّ الحقل والزرّ الثانويّ على البطاقة'],
  ['field', 'surface-2', 3, 'حدُّ الحقل على السطح الداخليّ'],
  ['field', 'bg', 3, 'حدُّ الحقل على الأرض'],
  ['focus', 'surface', 3, 'حلقةُ التركيز على البطاقة'],
  ['focus', 'bg', 3, 'حلقةُ التركيز على الأرض'],
  // ‏ووصفُ المقطع على مسرحه الداكن (D-172)
  ['np-on-stage', 'np-stage', 4.5, 'نصُّ المعاينة على مسرح المقطع'],
  ['logo-ring', 'surface', 2, 'حلقةُ مربّع المنصّة على البطاقة', 'dark'],
  ['logo-ring', 'bg', 2, 'حلقةُ مربّع المنصّة على الأرض', 'dark'],
  ['mark-ring', 'bg', 2, 'حلقةُ العلامة على الأرض والرافدة', 'dark'],
]

/**
 * APCA بحدودٍ تُقرأ بالحجم والوزن (القسم 10.2 من الخطّة) — **وكلُّها تردّ على
 * `--surface`** (D-187): المتنُ ‏٩٠، و`--ink-2` ‏٧٥ لأنّه يحمل كلَّ نصٍّ تحت ‏١٥px،
 * والرابطُ ‏٧٠ لأنّه عبارةٌ قصيرةٌ مسطَّرة، والخافتُ ‏٤٥ لأنّه مقصورٌ على ‏١٥px فأكبر
 * ولنصٍّ لا يُحتاج، والحبوبُ على أرضها ‏٥٠ لأنّها رمزٌ وكلمةٌ ووزن ‏٦٠٠، والرقمُ البطل
 * ‏٤٥ لأنّه ‏٣٢px فأكبر. وكانت الأربعةُ الأخيرةُ تُطبَع ولا تردّ حتّى تُضبَط قيَمُها.
 */
const APCA_MIN = [
  ['ink', 'surface', 90, 'المتن'],
  ['ink-2', 'surface', 75, 'الثانويّ — كلُّ نصٍّ تحت ‏١٥px'],
  ['link', 'surface', 70, 'الرابطُ المسطَّر'],
  ['ink-3', 'surface', 45, 'الخافت — ‏١٥px فأكبر ولنصٍّ لا يُحتاج'],
  ['ok', 'ok-wash', 50, 'حبّةُ «جيّد» على أرضها'],
  ['warn', 'warn-wash', 50, 'حبّةُ «تحذير» على أرضها'],
  ['bad', 'bad-wash', 50, 'حبّةُ «خطر» على أرضها'],
  ['au', 'surface', 45, 'الرقمُ البطل (‏٣٢px فأكبر)'],
]

/** وما يُطبَع ليُقرأ ولا يردّ (10.2): الحبرُ على السطحين الداخليّين. */
const APCA_SHOWN = [
  ['ink', 'surface-2', 'المتن على السطح الداخليّ'],
  ['ink-2', 'surface-2', 'الثانويّ على السطح الداخليّ'],
  ['ink-3', 'surface-2', 'الخافت على السطح الداخليّ'],
  ['link', 'surface-2', 'الرابطُ على السطح الداخليّ'],
  ['ink', 'surface-3', 'المتن على المحدَّد'],
  ['ink-2', 'surface-3', 'الثانويّ على المحدَّد'],
]

/**
 * **والتمايزُ ليس تباينًا**: لونان بنسبة ‏١٫٠٣:١ قد يتمايزان بالصبغة، ولونان
 * بنسبةٍ عالية قد يُقرآن معنًى واحدًا. فيُقاس الفرقُ نفسُه — والنحاسُ
 * والتحذيرُ كانا على ‏٢٫٨ فيُقرأ أحدُهما الآخر (D-183).
 *
 * **وشريطُ العلامة لا يساوي رمزًا آخر** (D-196): `audit_design` يعدّ «الذهب» بقيمة `--au`
 * و`--mark-fg` حرفًا، فرابطٌ بلون الشريط يصير كلُّه موضعَ ذهب، وحالٌ بلونه تُقرأ هويّة.
 */
const DELTA_MIN = [
  ['au', 'warn', 9.5, 'الذهبُ مقابل التحذير'],
  ['mark-fg', 'link', 7.5, 'شريطُ العلامة مقابل الرابط'],
  ['mark-fg', 'ok', 7.5, 'شريطُ العلامة مقابل «جيّد»'],
  ['mark-fg', 'au', 7.5, 'شريطُ العلامة مقابل الذهب'],
  // ‏**والتركوازُ يُضغط** (خطّة التصميم 3.2 · D-325): ما يُبرز ولا يُضغط بعيدٌ عن حبر الرابط في كلّ وضع
  ['accent', 'link', 7.5, 'المبرِزُ مقابل الرابط (ما لا يُضغط لا يُقرأ رابطًا)'],
  // ‏(مراجعة D-325) **ولا يُقرأ زرًّا**: كان المبرِزُ ليلًا قيمةَ الزرّ حرفًا (‏#e3f1ef، ΔE_OK صفر)، فرقمُ الخطوة الحاليّة
  // ‏مِلءٌ بحبرٍ داكن هو الزرُّ الأوّليُّ بعينه، وأشرطةُ التقدّم كذلك — والحارسُ كان يقيس المبرِزَ مقابل الرابط وحدَه
  ['accent', 'brand', 7.5, 'المبرِزُ مقابل الزرّ (ما لا يُضغط لا يُقرأ زرًّا)'],
]
/** وما يُطبَع بنسبته وفرقه معًا: درجتا الحبر، والرابطُ والمتن، والتحذيرُ والخطر (3.2). */
const DELTA_SHOWN = [
  ['ok', 'link', '«جيّد» مقابل الرابط (الحالُ ليست الهويّة)'],
  ['warn', 'bad', 'التحذيرُ مقابل الخطر (يُدعَم برمزٍ وكلمة)'],
  ['ink-2', 'ink-3', 'الثانويّ مقابل الخافت (يُدرَك بلا مقارنة)'],
  ['link', 'ink', 'الرابطُ مقابل المتن (والخطُّ تحته هو العلامة)'],
]

/** زينةٌ يسندها الظلّ (3.2): يُطبَع رقمُها ليُعرَف أنّها زينةٌ بقصد لا سهوًا. */
const DECOR = [
  ['line', 'surface', 'حدُّ البطاقة على البطاقة (ومعه «--sh-1»)'],
  ['line', 'bg', 'حدُّ البطاقة على الأرض'],
]

/**
 * ما لا يقع (القسم 3.2): نصُّ الحال على السطحين الداخليّين، والخافتُ على المحدَّد.
 * يُطبَع رقمُه ليُعرَف لماذا مُنع، **ويمسكه على الصفحة المرسومة `audit_design`**.
 *
 * ‏**وحبرُ العلامة على مسرح المقطع** (مراجعة D-187): الوسمُ في إطار TikTok وYouTube بحبر
 * المسرح لا بـ«--accent» (وكان «--brand» حتّى D-325) — وكان وصفُ YouTube خارج «.np-stage» فوقع ‏١٫١٠:١ نهارًا. يُطبَع هنا
 * ليُرى لماذا مُنع، **ويحرسه اختبارُ الوسم في `views.test`** (كلُّ وسمٍ على الإطار الداكن).
 */
const BANNED = [
  ['warn', 'surface-2'], ['ok', 'surface-2'], ['bad', 'surface-2'],
  ['warn', 'surface-3'], ['ok', 'surface-3'], ['bad', 'surface-3'],
  ['ink-3', 'surface-3'],
  ['accent', 'np-stage'],
]

// ── عمى الألوان: Machado وOliveira وFernandes ‏(2009)، بالشدّة الكاملة ────────────
/**
 * **ونقاطُ الرافدة لونٌ بلا كلمة**: «جيّد» و«تحذير» و«خطر» نقاطٌ ‏٨px وعنوانٌ لا يظهر إلّا
 * بالتمرير (`.plat-list .dot` و`.todo .dot`). فيُقاس فرقُ كلّ زوجٍ منها بعد محاكاة العمى الأحمر
 * (protan) والأخضر (deutan) — وكان الأخضرُ المقترح و«خطر» ‏٢٫٩ عند الثاني. **والأزواجُ الثلاثة
 * لا زوجٌ واحد** (مراجعة D-196): كان «جيّد» و«تحذير» يُطبَعان ولا يردّان، فنزلا بـ«جيّد» D-196
 * من ‏٧٫٣ إلى ‏٣٫٨ عند الأوّل نهارًا و‏٣٫١ عند الثاني ليلًا وطُبع «✓» — ونقطةُ «ينتظر أسرارًا»
 * بجانب «متّصل» في الرافدة كلَّ يوم. والأزواجُ الأخرى يُطبَع فرقُها: الرمزُ والكلمة يحملانها.
 * والمصفوفاتُ على الضوء الخطّيّ، والفرقُ ΔE_OK بعد المحاكاة.
 */
const MACHADO = {
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
  tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
}
function simulate(c, kind) {
  const lin = c.map((v) => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 })
  const out = MACHADO[kind].map((r) => Math.min(1, Math.max(0, r[0] * lin[0] + r[1] * lin[1] + r[2] * lin[2])))
  return out.map((v) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055))
}
const CVD_MIN = [
  ['ok', 'bad', 5, '«جيّد» مقابل «خطر» — نقاطُ الرافدة'],
  ['ok', 'warn', 5, '«جيّد» مقابل «تحذير» — نقاطُ الرافدة'],
  ['warn', 'bad', 5, '«تحذير» مقابل «خطر» — نقاطُ الرافدة'],
]
const CVD_SHOWN = [
  ['ok', 'au', '«جيّد» مقابل الذهب'], ['ok', 'link', '«جيّد» مقابل الرابط'],
  ['au', 'warn', 'الذهبُ مقابل التحذير'], ['link', 'ink-2', 'الرابطُ مقابل الثانويّ (والخطُّ تحته)'],
]

// ── إشباعُ النعناع (D-196 · D-053) ───────────────────────────────────────
/**
 * النعناعُ القاسي ‏(H ‏١٧٧°، C ‏٠٫١٢٢) لا يعود بابًا خلفيًّا: **كلُّ رمزٍ في أسرته** (هيولى ‏١٦٥°
 * إلى ‏١٩٥°) إشباعُه ‏٠٫٠٩٠ فأقلّ وبُعدُه عن شريط العلامة ‏٧٫٥ فأكثر — الشريطُ وحده بقيمته.
 * **و`--brand` ليس من أسرته الفاتحة قطّ** (L ‏٦٠ فأعلى): زرٌّ نعناعيٌّ على الداكن هو ما رُدّ
 * في D-049. والإشباعُ والهيولى من OKLCH.
 */
const MINT_HUE = [165, 195]
const MINT_C_MAX = 0.09

/**
 * ‏**وما في `:root` خارج الثيمين يُفحَص كذلك** (مراجعة D-196): كان الفحصُ يقرأ مفاتيحَ `THEME`
 * وحدها، فمرّ «--moment-accent» بقيمة الشريط حرفًا (‏C ‏٠٫١٢٢، ΔE_OK صفر) — اسمٌ ثانٍ للنعناع يُنادى
 * به نصٌّ على أبيض ‏١٫٨٩:١ ولا يُمسَك. فتُقرأ الورقةُ المولَّدةُ نفسُها (`TOKENS`): كلُّ رمزٍ بقيمةٍ
 * مصمتةٍ في الكتلة الأولى ليس من مفاتيح الثيم. **والشريطُ وحده مستثنًى بسببه**: هو النعناعُ بقيمته.
 */
const MINT_ALLOWED = new Map([['--mark-fg', 'شريطُ العلامة نفسُه — النعناعُ بقيمته في موضعه الوحيد']])
const ROOT_EXTRA = (() => {
  const first = /:root\{([\s\S]*?)\n\}/.exec(TOKENS)?.[1] ?? ''
  const out = []
  for (const m of first.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    if (m[1] in THEME.light) continue
    out.push([m[1], m[2].trim()])
  }
  return out
})()
function oklch(c) {
  const [l, a, b] = oklab(c)
  return [l * 100, Math.hypot(a, b), ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360]
}

/**
 * ‏**ولحظةُ العلامة تُقاس مرّةً** (ثابتةٌ في الثيمين): الشريطُ على أرضه، والنصُّ على العمق
 * عاجيٌّ أو «نعناعٌ فاتح» — الشعارُ اللاتينيّ ‏١٤px يحتاج Lc ‏٧٥ كالثانويّ — والخيطُ رمزٌ لا نصّ.
 */
const MOMENT_PAIRS = [
  [MARK['--mark-fg'], MARK['--mark-bg'], 7.5, null, 'شريطُ العلامة على أرضها (أيقونةُ التطبيق)'],
  [MOMENT.ink, MOMENT.ground, 7, 90, 'الاسمُ والشعارُ العربيّ على العمق'],
  [MOMENT.soft, MOMENT.ground, 4.5, 75, 'السطرُ اللاتينيّ والفوقيّة على العمق'],
  [MOMENT.gold, MOMENT.ground, 3, null, 'خيطُ الذهب على العمق (رمز)'],
]

const THEMES = [
  ['النهاريّ', 'light', THEME.light],
  ['الداكن', 'dark', THEME.dark],
  // والرافدةُ ترث الثيم منذ D-144 فلا تُفحَص ثيمًا ثالثًا؛ والطباعةُ تُعيد
  // قيَمَ النهار على أبيضَ ناصع، فتُفحَص هي.
  ['الطباعة', 'print', PRINT],
]

let failures = 0
let gated = 0
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
    gated += 1
    if (!pass) failures += 1
    console.log(`  ${pass ? '✓' : '✕'} ${v.toFixed(2)}:1 (≥${min})  ${label}  ${value(tokens, fg)} / ${value(tokens, bg)}`)
  }

  console.log('  · APCA Lc على البطاقة')
  for (const [fg, bg, min, label] of APCA_MIN) {
    const [a, b] = [rgb(value(tokens, fg)), rgb(value(tokens, bg))]
    if (a === null || b === null) { missing(fg, bg); continue }
    const lc = Math.abs(apca(a, b))
    const pass = lc >= min
    gated += 1
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
    gated += 1
    if (!pass) failures += 1
    console.log(`  ${pass ? '✓' : '✕'} ΔE_OK ${d.toFixed(1)} (≥${min})  ${label}  ${value(tokens, x)} / ${value(tokens, y)}`)
  }
  for (const [x, y, label] of DELTA_SHOWN) {
    const [a, b] = [rgb(value(tokens, x)), rgb(value(tokens, y))]
    if (a === null || b === null) continue
    console.log(`  · ΔE_OK ${deltaEok(a, b).toFixed(1)} · ${ratio(a, b).toFixed(2)}:1  ${label}`)
  }

  console.log('  · عمى الألوان (ΔE_OK بعد المحاكاة: protan · deutan · tritan)')
  for (const [x, y, min, label] of CVD_MIN) {
    const [a, b] = [rgb(value(tokens, x)), rgb(value(tokens, y))]
    if (a === null || b === null) { missing(x, y); continue }
    const [p, d, t] = ['protan', 'deutan', 'tritan'].map((k) => deltaEok(simulate(a, k), simulate(b, k)))
    const pass = Math.min(p, d) >= min
    gated += 1
    if (!pass) failures += 1
    console.log(`  ${pass ? '✓' : '✕'} ${p.toFixed(1)} · ${d.toFixed(1)} · ${t.toFixed(1)} (≥${min} عند الأوّلين)  ${label}`)
  }
  for (const [x, y, label] of CVD_SHOWN) {
    const [a, b] = [rgb(value(tokens, x)), rgb(value(tokens, y))]
    if (a === null || b === null) continue
    const [p, d, t] = ['protan', 'deutan', 'tritan'].map((k) => deltaEok(simulate(a, k), simulate(b, k)))
    console.log(`  · ${p.toFixed(1)} · ${d.toFixed(1)} · ${t.toFixed(1)}  ${label}`)
  }

  const mint = rgb(MARK['--mark-fg'])
  const family = Object.keys(tokens).filter((k) => k.startsWith('--')).map((k) => [k, rgb(value(tokens, k.slice(2)))])
    .filter(([, c]) => c !== null).map(([k, c]) => [k, c, oklch(c)])
    .filter(([, , [, C, H]]) => C > 0.02 && H >= MINT_HUE[0] && H <= MINT_HUE[1])
  for (const [k, c, [L, C]] of family) {
    const d = deltaEok(c, mint)
    const brandy = k === '--brand' && L >= 60
    const pass = C <= MINT_C_MAX && d >= 7.5 && !brandy
    gated += 1
    if (!pass) failures += 1
    console.log(`  ${pass ? '✓' : '✕'} نعناع: ${k} C ${C.toFixed(3)} (≤${MINT_C_MAX}) · ΔE_OK ${d.toFixed(1)} من الشريط (≥7.5)${brandy ? ' · زرٌّ نعناعيّ' : ''}`)
  }

  for (const [fg, bg, label] of DECOR) {
    const [a, b] = [rgb(value(tokens, fg)), rgb(value(tokens, bg))]
    if (a === null || b === null) { missing(fg, bg); continue }
    console.log(`  · ${ratio(a, b).toFixed(2)}:1  زينة: ${label}`)
  }

  const banned = BANNED.map(([fg, bg]) => {
    const [a, b] = [rgb(value(tokens, fg)), rgb(value(tokens, bg))]
    return a === null || b === null ? '' : `--${fg}/--${bg} ${ratio(a, b).toFixed(2)}`
  }).filter((s) => s !== '')
  console.log(`  · ما لا يقع (يُطبَع، ويمسكه audit_design على الصفحة المرسومة، والوسمَ على المسرح views.test): ${banned.join(' · ')}`)
}

console.log('\n── لحظةُ العلامة والعلامة (ثابتتان في الثيمين) ──')
for (const [fg, bg, min, lcMin, label] of MOMENT_PAIRS) {
  const [a, b] = [rgb(fg), rgb(bg)]
  if (a === null || b === null) { console.log(`  ✕ ليس لونًا مصمتًا: ${fg} أو ${bg}`); failures += 1; continue }
  const v = ratio(a, b)
  const lc = Math.abs(apca(a, b))
  const pass = v >= min && (lcMin === null || lc >= lcMin)
  gated += 1
  if (!pass) failures += 1
  console.log(`  ${pass ? '✓' : '✕'} ${v.toFixed(2)}:1 (≥${min}) · Lc ${lc.toFixed(1)}${lcMin === null ? '' : ` (≥${lcMin})`}  ${label}  ${fg} / ${bg}`)
}
for (const [label, c] of [['الصدى', MOMENT.echo], ['الشريط', MOMENT.ribbon], ['الوجهُ المضاء', MOMENT.lit]]) {
  console.log(`  · ${ratio(rgb(c), rgb(MOMENT.ground)).toFixed(2)}:1  زينة: ${label} على العمق  ${c}`)
}

/*
 * ‏**وألوانُ المنصّات لا تتشابه، ورمزُها الأبيضُ يُقرأ عليها** (D-325). كانت X وTikTok أسودين (‏#0f1419 و‏#111111، ΔE_OK
 * ‏1.7 تحت عتبة الإدراك)، ونقاطُ شريط الأسبوع لونًا بلا شعار — فلا يفرّقهما المالكُ وهو «يفرز المنصّات بلونها» (D-177).
 * ‏والمعنى بعدها في الرمز (الشعارُ على مربّعه)، واللونُ يُعين: فكلُّ زوجٍ منها ΔE_OK ‏5 فأكثر، وكذلك عند عمى الأحمر والأخضر،
 * ‏والرمزُ الأبيضُ (‏--pf-fg) ‏3:1 فأكثر على كلّ مربّع (WCAG 1.4.11، رسمٌ لا نصّ). وتُقرأ من الورقة المولَّدة نفسِها.
 */
console.log('\n── ألوانُ المنصّات (ثابتةٌ في الثيمين) ──')
const PF = new Map([...TOKENS.matchAll(/--pf-([a-z]+):(#[0-9a-f]{3,6});/gi)].map((m) => [m[1], m[2]]))
const pfFg = rgb(PF.get('fg'))
PF.delete('fg')
for (const [name, hex] of PF) {
  const v = ratio(pfFg, rgb(hex))
  const pass = v >= 3
  gated += 1
  if (!pass) failures += 1
  console.log(`  ${pass ? '✓' : '✕'} ${v.toFixed(2)}:1 (≥3)  الرمزُ الأبيض على مربّع ${name}  ${hex}`)
}
const pfNames = [...PF.keys()]
for (let i = 0; i < pfNames.length; i += 1) {
  for (let j = i + 1; j < pfNames.length; j += 1) {
    const [a, b] = [rgb(PF.get(pfNames[i])), rgb(PF.get(pfNames[j]))]
    const d = deltaEok(a, b)
    const [p, q] = ['protan', 'deutan'].map((k) => deltaEok(simulate(a, k), simulate(b, k)))
    const pass = Math.min(d, p, q) >= 5
    gated += 1
    if (!pass) failures += 1
    console.log(`  ${pass ? '✓' : '✕'} ΔE_OK ${d.toFixed(1)} · ${p.toFixed(1)} · ${q.toFixed(1)} (≥5، ومعه عمى الأحمر والأخضر)  ${pfNames[i]} مقابل ${pfNames[j]}`)
  }
}

// ‏وإشباعُ النعناع في «:root» خارج الثيمين — والإحالةُ تُحَلّ: «--x:var(--mark-fg)» اسمٌ ثانٍ كالقيمة حرفًا
const extra = new Map(ROOT_EXTRA)
const resolveRoot = (raw, depth = 0) => {
  const ref = /^var\(--([a-z0-9-]+)\)$/.exec(raw)
  if (ref === null || depth > 4) return raw
  const next = extra.get(`--${ref[1]}`) ?? THEME.light[`--${ref[1]}`]
  return next === undefined ? raw : resolveRoot(next, depth + 1)
}
const mintRoot = rgb(MARK['--mark-fg'])
for (const [k, raw] of ROOT_EXTRA) {
  const c = rgb(resolveRoot(raw))
  if (c === null) continue
  const [, C, H] = oklch(c)
  if (!(C > 0.02 && H >= MINT_HUE[0] && H <= MINT_HUE[1])) continue
  if (MINT_ALLOWED.has(k)) {
    console.log(`  · نعناع: ${k} مستثنًى — ${MINT_ALLOWED.get(k)}`)
    continue
  }
  const d = deltaEok(c, mintRoot)
  const pass = C <= MINT_C_MAX && d >= 7.5
  gated += 1
  if (!pass) failures += 1
  console.log(`  ${pass ? '✓' : '✕'} نعناع في :root: ${k} C ${C.toFixed(3)} (≤${MINT_C_MAX}) · ΔE_OK ${d.toFixed(1)} من الشريط (≥7.5)`)
}

if (failures > 0) {
  console.error(`\n✕ ${failures} زوجا دون الحدّ. لا يُدفع ثيمٌ لا يُقرأ.`)
  process.exit(1)
}
console.log(`\n✓ ${gated} فحصًا في الأوضاع الثلاثة ولحظةِ العلامة وألوانِ المنصّات تجتاز حدودَ WCAG وAPCA وΔE_OK وعمى الألوان وإشباعِ النعناع (خطّة التصميم 3.2 · D-196 · D-325).`)

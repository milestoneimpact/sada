/**
 * القشرة — الوثيقةُ وما يحرسها.
 *
 * وثلاثةُ أشياءَ تمرّ من هنا ولا تُكتب في مكانٍ آخر: تهريبُ النصّ،
 * وحقنُ رمز CSRF، و `nonce` السياسة. فما بُني فوقها ورثها، وما نسيها
 * لم يُبنَ فوقها أصلا.
 */
import { commandPalette, commandTrigger, type Command } from './command'
import { escapeHtml } from './escape'
import { ICON } from './icons'
import { panelScript, STYLE_PATH, stripJs, uiScript } from '../../lib/ui/asset'
import { FACES } from '../../lib/ui/fonts'
import { THEME } from './tokens'

/**
 * الخطّ — **زوجُ Plex من أصلنا** (D-099 · D-185).
 *
 * ## ثلاثةُ وجوهٍ لأسرتين، وكلٌّ بنطاقه
 *
 * العربيُّ وجهان ثابتان (‏٤٠٠ و‏٦٠٠) واللاتينيُّ متغيّرٌ مقصورٌ عليهما، ولكلّ وجهٍ
 * `unicode-range` من ورقة حزمته (`embed_ui_font.mjs`). **فالعربيُّ أوّلُ الأسرة
 * ويأخذ حروفَه وحدها**، واللاتينيُّ يأخذ المسافةَ والرقمَ والترقيمَ العامّ — وكان
 * Inter أوّلَ الترتيب يرسم مسافاتِ الكلمات العربيّة أعرضَ بـ ‏7.4٪ (خطّة التصميم ١).
 *
 * ## `swap` لا `block`
 *
 * نقيضُ ما تفعله الشريحةُ (D-085): هناك `block` لأنّ خطّا بديلا يُخرج
 * **صورةً** باسم المالك بحروفٍ مفكّكة، فالانتظارُ أهون. وهنا `swap`
 * لأنّ المالكَ يقرأ لوحتَه — **ونصٌّ لا يُرى ثلثَ ثانيةٍ أسوأُ من نصٍّ
 * يُرى بخطٍّ ثمّ يتبدّل**.
 *
 * ## ولا `size-adjust` — **ولا يُدَّعى قياسٌ لم يقع**
 *
 * نسبةُ التصحيح تُقاس بقسمة عرضِ نصٍّ بالخطّ على عرضِه بالبديل.
 * **والبديلُ يختلف باختلاف الجهاز**: «Segoe UI» على ويندوز، و«SF Arabic»
 * على ماك، و«Noto» على أندرويد — ونسبةٌ تُقاس في حاويةِ بناءٍ لينكسيّة
 * تصف خطًّا لا يراه المالك. **والقفزةُ تُقاس** (CLS عند التحميل الأوّل بلا
 * تخبئة، D-185)، ولا يُضاف وجهٌ احتياطيٌّ مقيسٌ إلّا إن تجاوزت ‏0.1.
 */
const FONT_CSS = FACES.map((f) => `
@font-face{font-family:'${f.family}'; font-style:normal; font-weight:${f.weight};
  font-display:swap; src:url('${f.path}') format('woff2'); unicode-range:${f.unicodeRange}}`).join('') + '\n'

/**
 * والوجوهُ الثلاثة تُسبَق في كلّ صفحة: `preload` يبدأ التحميلَ مع الوثيقة لا بعد
 * قراءة الأنماط. **وبلا `crossorigin` لا يُستعمَل المحمَّل** — يُحمَّل الخطُّ
 * مرّتين، ويُقرأ ذلك في الشبكة تكرارا لا يُفسَّر.
 *
 * وكان وجهُ العرض الكوفيُّ لا يُسبَق في الوثيقة العامّة (D-152). **وخرج الكوفيُّ
 * من الواجهة** (D-185)، والوجهُ الثخينُ عناوينُ كلِّ صفحةٍ ولصائقُها — فلا استثناء.
 */
const FONT_PRELOAD = FACES
  .map((f) => `<link rel="preload" as="font" type="font/woff2" href="${f.path}" crossorigin>`)
  .join('\n')

/**
 * رمزُ التبويب — **مرسومٌ في الوثيقة لا مطلوبٌ من الشبكة**.
 *
 * ملفٌّ خارجيّ يعني نداءً ثانيا، ومسارا يُنسى عند نقل النطاق، وسياسةَ
 * محتوًى تُوسَّع لتسمح به. و data: URI يعبر `img-src 'self' data:`
 * القائمة أصلا، ويظهر قبل أن يكتمل تحميل الصفحة.
 *
 * **والشكلُ من الهويّة لا من الذوق**: شريطُ صدى نفسه، بتدرّجه من
 * النحاس الداكن إلى الشمبانيا على أرضٍ من حبر (D-144). وحروفٌ في رمزٍ بستّةَ عشرَ بكسلا تُقرأ لطخةً —
 * والشريطُ يُقرأ عند كلّ قياس.
 */
const RIBBON = 'M13 22C13 34 17 39 24 38C31 37 32 18 38 14C45 9 51 18 51 32'

const ICON_SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 48">',
  '<defs><linearGradient id="g" x1="0" y1="1" x2="1" y2="0">',
  '<stop offset="0" stop-color="#6e5a33"/><stop offset=".55" stop-color="#c9a962"/>',
  '<stop offset="1" stop-color="#f0dcae"/>',
  '</linearGradient></defs>',
  '<rect width="64" height="48" rx="11" fill="#14161c"/>',
  '<path d="' + RIBBON + '" fill="none" stroke="url(#g)" stroke-width="11" ',
  'stroke-linecap="round"/>',
  '</svg>',
].join('')

/**
 * العلامةُ في الرافدة — شريطُ الهويّة — **مرسومٌ تقريبا لا منقولٌ من الأصل.**
 *
 * ما وصلني من الشعار صورةٌ نقطيّة (PNG)، **ولا تُحوَّل صورةٌ نقطيّةٌ
 * إلى متّجهٍ بيدٍ تحويلا أمينا**. فهذا **تفسيرٌ للشكل** يحفظ حركتَه
 * وتدرّجَه ونهاياتِه المستديرة، ويعمل عند كلّ قياس ويتبع الثيم.
 *
 * وحين يصلني ملفُّ `.svg` أو `.ai` الأصليّ يُستبدَل هذا بسطرٍ واحد —
 * وموضعُه واحدٌ لا مواضع. **ولا أدّعي أنّه الأصل.**
 *
 * والعلامةُ الواحدة في الموضعين تُعرَف: تبويبٌ في المتصفّح ورافدةٌ في
 * الصفحة يحملان الشكلَ نفسه.
 */
export const GLYPH_SVG =
  '<svg viewBox="0 0 64 48" fill="none" stroke="currentColor" ' +
  'stroke-linecap="round" aria-hidden="true">' +
  '<path d="' + RIBBON + '" stroke-width="11"/>' +
  '</svg>'

/**
 * الاسمُ «صدى» — **مسارٌ مرسومٌ لا حرفٌ من خطّ** (D-185 · خطّة التصميم 3.6).
 *
 * كان يُكتب بـ Reem Kufi في رأس الرافدة، **وخطٌّ كوفيٌّ كاملٌ يُحمَّل لثلاثة حروف**
 * ‏(١٢KB) ويتسرّب إلى العناوين. فحُوّلت الحروفُ نفسُها مساراتٍ مرّةً واحدة: Reem Kufi
 * بوزن ‏٧٠٠، مشكَّلةً بـ HarfBuzz ومرسومةً بـ fontTools من ملفّ `@fontsource-variable/reem-kufi`
 * — والترخيصُ OFL-1.1 يجيز ذلك. **فيبقى الطابعُ الكوفيُّ في الاسم وحده**، ويخرج
 * الكوفيُّ من الواجهة، ولا ملفَّ خطٍّ له.
 *
 * والإحداثيّاتُ بوحدات الخطّ (‏١٠٠٠ للـ em) وخطُّ القاعدة عند الصفر، فالارتفاعُ في
 * الورقة نسبةٌ من حجم الحرف الذي كان يُرسَم به. ولونُه `currentColor` فيتبع الثيم.
 * **ومعناه في سمته**: قارئُ الشاشة يقرأ «صدى» حيث لا نصَّ بجانبه.
 */
const WORDMARK_PATH = 'M393 200 162 -203Q122 -274 123.5 -328Q125 -382 154 -422.5Q183 -463 223 -493Q254 -516 271 -534Q288 -552 288 -591L627 0H471L274 -340Q268 -329 268.5 -309.5Q269 -290 279 -272L548 200ZM527 0 457 -140H524Q542 -140 562 -150Q582 -160 592 -180L700 0ZM25 200 133 20Q143 40 163 50Q183 60 201 60H358L418 200Z M750 0 834 -140H1405Q1406 -167 1388.5 -183.5Q1371 -200 1315 -200H860L1016 -460L1026 -453L974 -340H1315Q1381 -340 1423.5 -323Q1466 -306 1491 -277.5Q1516 -249 1527.5 -213.5Q1539 -178 1542 -140H1665V0Z M1720 -50V-409L1860 -440V-50ZM1625 0V-140H1900V0ZM1805 0V-140H2420Q2421 -167 2403.5 -183.5Q2386 -200 2330 -200H1805V-340H2330Q2404 -340 2449 -319Q2494 -298 2517.5 -263Q2541 -228 2550 -186Q2559 -144 2559.5 -101.5Q2560 -59 2560 -23Q2560 -11 2550 -6Q2540 -1 2530 -0.5Q2520 0 2520 0Z'

export function wordmark(label: boolean): string {
  return `<svg class="wordmark" viewBox="25 -591 2535 791" fill="currentColor" ${
    label ? 'role="img" aria-label="صدى"' : 'aria-hidden="true"'}><path d="${WORDMARK_PATH}"/></svg>`
}

/**
 * وتُصدَّر البايتات ليخدمها مسارٌ كذلك — **والسببُ عطلٌ وقع**.
 *
 * كانت الصيغةُ «data:image/svg+xml;utf8,» — و«;utf8» **ليست معاملا
 * صحيحا** في data URI (الصحيحُ «;charset=utf-8»). فرفضها فايرفوكس،
 * **وسقط إلى /favicon.ico** الذي لا مسارَ له، فردّ الخادمُ ٤٠٤ يحمل
 * «Cross-Origin-Resource-Policy: same-origin» — **فظهر في الكونسول
 * حظرٌ يبدو عطلَ أمنٍ وهو حرفان في نصّ**.
 */
export const ICON_BYTES = ICON_SVG

export { escapeHtml }

/**
 * لونُ شريط المتصفّح — **بالوضع لا بلونٍ واحد** (D-183).
 *
 * كان ‏#1f2430 في الوضعين: شريطٌ حبريٌّ فوق صفحةٍ بورسلينيّة نهارًا، ولا
 * يطابق أرضَ الليل ليلًا. فوسمان بشرط الوضع، وقيمتاهما أرضُ الصفحة من
 * «THEME» نفسِه — لا رقمٌ يُنسَخ. ويحدّثهما سكربتُ الثيم حين يختار المالكُ
 * وضعًا يخالف الجهاز (`THEME_BOOT` هنا و`THEME_SCRIPT` في `scripts.ts`).
 */
const THEME_COLOR = (['light', 'dark'] as const).map((mode) =>
  `<meta name="theme-color" media="(prefers-color-scheme: ${mode})" content="${THEME[mode]['--bg']}" data-c="${THEME[mode]['--bg']}">`).join('\n')

const FAVICON = `<link rel="icon" href="data:image/svg+xml;charset=utf-8,${encodeURIComponent(ICON_SVG)}">
${THEME_COLOR}`

/**
 * سكربتُ الثيم — **يُنفَّذ قبل الرسم لا بعده**.
 *
 * ولو أُخّر إلى نهاية الجسد لظهرت الصفحةُ نهاريّةً جزءا من ثانية ثمّ
 * قفزت داكنة (وميضُ الثيم الخطأ). فيُوضع في الرأس، ويقرأ الاختيار
 * المحفوظ ويضعه على `<html>` قبل أن يُرسم شيء.
 *
 * والقراءةُ في `try` لأنّ `localStorage` يرمي في نافذةٍ خاصّة أو حين
 * يمنع المتصفّح تخزينَ المواقع — ونافذةٌ خاصّة يجب أن تفتح اللوحة، لا
 * أن تسقط على سطرٍ من الزينة.
 *
 * ووضعٌ مختارٌ يخالف الجهاز يلوّن شريطَ المتصفّح بلونه كذلك (D-183): الوسمان
 * قبل السكربت في الرأس، فيُقرآن هنا قبل الرسم.
 */
const THEME_BOOT = `
try{var t=localStorage.getItem('sada-theme');
if(t==='dark'||t==='light'){document.documentElement.dataset.theme=t;
document.querySelectorAll('meta[name="theme-color"]').forEach(function(m){
m.content=t==='dark'?${JSON.stringify(THEME.dark['--bg'])}:${JSON.stringify(THEME.light['--bg'])};});}
var d=localStorage.getItem('sada-density');
if(d==='compact')document.documentElement.dataset.density=d;}catch(e){}
`



export function densitySwitch(): string {
  return `<div class="theme" id="density" role="group" aria-label="كثافة العرض">
    <button type="button" data-density="cozy" aria-pressed="true">مريح</button>
    <button type="button" data-density="compact" aria-pressed="false">مضغوط</button>
  </div>`
}

/**
 * شريطُ العودة — **كُتب ستَّ مرّاتٍ حرفا بحرف، فجُمع** (D-105).
 *
 * وليس التكرارُ وحدَه هو السبب: **زرُّ لوحة الأوامر يسكن هنا**. وستّةُ
 * مواضعَ تعني ستَّ فرصٍ لنسيانه، **وصفحةٌ بلا زرٍّ تُخفي اختصارا لا
 * يعرفه إلّا من كتبه**. فما دام الشريطُ واحدا، فالزرُّ فيه لا يُنسى.
 */
/**
 * الشاشةُ المستقلّة — **قالبٌ واحدٌ للمسار والعيّنة** (D-151).
 *
 * كانت ستُّ شاشاتٍ في panel.ts تكتب رابطَ التخطّي و`.wrap` و`backNav`
 * و`<main>` يدًا، وشاشتا نتيجة OAuth تكتبان سهمًا وحدَه بلا علامةٍ ولا
 * ⌘K ولا ثيم، وعيّنةُ render_screens تُغلَّف بغلافٍ ثالث. فما يُقاس على
 * العيّنة لم يكن ما يُخدَم. الآن يبنيها الثلاثةُ من هنا.
 */
export function soloPage(
  title: string,
  back: { readonly href: string; readonly label: string },
  body: string,
  nonce: string,
  script = '',
  commands?: readonly Command[],
  /**
   * الرافدةُ مرسومةً (D-178) — من `soloNav` في `rail.ts`. **وبها تصير الصفحةُ
   * جزءًا من التطبيق**: رافدةٌ على العريض وشريطٌ سفليٌّ في الجوّال.
   *
   * **والثيمُ في شريط العودة لا في ذيلها**: الذيلُ يُخفى دون «md» (‏٩٠٠px، D-187)، فكان
   * الهاتفُ واللوحيُّ بلا مبدّلٍ في أيّ صفحة. **ومبدّلٌ واحدٌ لا اثنان**:
   * سكربتُ الثيم يربط `#theme` الأوّلَ وحدَه، فنسخةٌ ثانيةٌ زرٌّ لا يعمل —
   * فتُنزَع نسخةُ الذيل، والكثافةُ تبقى فيه.
   */
  rail?: string,
): string {
  const inner = `${backNav(back.href, back.label)}
         <main id="main">${body}</main>`
  return shell(
    title,
    `<a class="skip" href="#main">تخطّي إلى المحتوى</a>
       ${rail === undefined
         ? `<div class="wrap">${inner}</div>`
         : `<div class="app">${rail.replace(themeSwitch(), '')}<div class="main"><div class="wrap">${inner}</div></div></div>`}`,
    nonce,
    script,
    commands === undefined ? {} : { commands },
  )
}


export function backNav(href: string, label: string): string {
  /*
   * **والعلامةُ في الشريط** (D-140): الشاشةُ المستقلّة كانت تبدأ بسهم عودةٍ
   * وحدَه، فتُقرأ صفحةً خارج التطبيق. والعلامةُ بجانب السهم تقول «هذه من
   * صدى» قبل أن يُقرأ العنوان — وهي بابٌ إلى اللوحة كذلك.
   *
   * **والسهمُ مرسومٌ لا حرف** (D-167): «→» ليس في خطٍّ مضمَّن (N-7)، فكان
   * يُرسَم بخطّ النظام. و`ICON.back` يشير إلى بداية السطر — اليمين هنا.
   */
  return `<nav class="back" aria-label="مسارُ العودة">
    <a class="home" href="/panel" aria-label="صدى — اللوحة"><span class="glyph sm">${GLYPH_SVG}</span>${wordmark(false)}</a>
    <a href="${escapeHtml(href)}">${ICON.back}${escapeHtml(label)}</a>
    <span class="grow"></span>${commandTrigger()}${themeSwitch()}
  </nav>`
}

export function themeSwitch(): string {
  return `<div class="theme" id="theme" role="group" aria-label="سمة العرض">
    <button type="button" data-theme="light" aria-pressed="false">نهاريّ</button>
    <button type="button" data-theme="dark" aria-pressed="false">ليليّ</button>
    <button type="button" data-theme="system" aria-pressed="true">النظام</button>
  </div>`
}

/**
 * يحقن رمز CSRF في **كلّ** نموذج POST في الصفحة.
 *
 * ولم يُكتب في كلّ نموذجٍ يدا لسببٍ واحد: نموذجٌ جديد يُضاف بعد شهر
 * فيُنسى فيه الحقل، ويعمل عملا صحيحا فلا يلحظ أحدٌ نقصه — وهي عينُ
 * الثغرة التي كشفها D-019: حارسٌ يُنسى نسخُه في مسارٍ جديد. فالحقن هنا
 * مرّةً واحدة، ولا سبيل إلى نسيانه.
 */
export function injectCsrf(html: string, token: string): string {
  const field = `<input type="hidden" name="_csrf" value="${escapeHtml(token)}">`
  return html.replace(/(<form\b[^>]*\bmethod="POST"[^>]*>)/gi, (tag) => tag + field)
}

/**
 * القشرة — و `nonce` يمرّ إلى كلّ ما هو داخليّ.
 *
 * السياسةُ في الترويسة تسمح بـ `'nonce-…'` وحده، لا بـ `'unsafe-inline'`.
 * فوسمٌ داخليّ بلا `nonce` **لا يُنفَّذ ولا يُطبَّق** — وهذا هو المقصود:
 * سطرٌ يحقنه مهاجم لن يحمل قيمةً لا يعرفها.
 */
/**
 * `noindex` هو الأصل، و`indexable` استثناءٌ يُطلب.
 *
 * صفحاتُ اللوحة تحمل حالَ النظام وأسماءَ المصادر، فلا تُفهرَس. أمّا
 * السياسةُ والشروطُ فوثيقتان **الغرضُ منهما أن تُقرآ من الخارج** — ومنعُ
 * الفهرسة عليهما يجعل مراجعا يبحث عنهما فلا يجدهما.
 */
export function shell(
  title: string,
  body: string,
  nonce: string,
  script = '',
  options: {
    indexable?: boolean
    description?: string
    /**
     * فهرسُ لوحة الأوامر (D-105) — **ومَن مرّره نالها كاملةً**.
     *
     * الجسدُ والنصُّ البرمجيُّ يُضافان هنا معا، ولا سبيلَ إلى تمرير
     * أحدهما دون الآخر. **وصفحةٌ فيها الجسدُ بلا نصٍّ لوحةٌ لا تُفتَح**،
     * وهي عينُ العلّة التي وُلد من أجلها حقنُ CSRF في مكانٍ واحد: حارسٌ
     * يُنسى نسخُه في مسارٍ جديد (D-019).
     */
    commands?: readonly Command[]
    /** صفحةُ اللوحة وحدَها تحمل سكربتَها أصلًا ببصمة (D-153) */
    panelScript?: boolean
  } = {},
): string {
  const safeNonce = escapeHtml(nonce)
  return `<!doctype html><html lang="ar" dir="rtl"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="${options.indexable === true ? 'index,follow' : 'noindex,nofollow'}">${
    options.description === undefined
      ? ''
      : `\n<meta name="description" content="${escapeHtml(options.description)}">`
  }
<title>${escapeHtml(title)}</title>
${FAVICON}
<script nonce="${safeNonce}">${THEME_BOOT}</script>
${FONT_PRELOAD}
<style nonce="${safeNonce}">${FONT_CSS}</style>
<link rel="stylesheet" href="${STYLE_PATH}"></head><body>${body}${
    options.commands === undefined ? '' : commandPalette(options.commands)
  }${
    (() => {
      /*
       * **ونصُّ الوقت يمرّ بلا شرط** (D-106).
       *
       * كلُّ صفحةٍ فيها موعدٌ تحتاجه، **وشرطٌ يُفحَص عند كلّ نداءٍ شرطٌ
       * يُنسى في مسارٍ جديد** — وهي علّةُ D-019 نفسُها. وثمنُه أنّ
       * صفحةَ الدخول تحمله بلا موعدٍ فيها: **يجد صفرَ وسومٍ فيعود
       * فورا**، وثمنُه مقيسٌ لا مقدَّر.
       */
      /*
       * **والثابتُ أصلٌ ببصمة** (D-153): لوحةُ الأوامر والوقتُ والثيمُ في
       * `/a/u.<hash>.js` تُخبَّأ سنةً، وسكربتُ اللوحة في `/a/p.<hash>.js`؛
       * ولا يبقى سطرًا إلّا ما يتبدّل بالطلب. وكلٌّ بـ`nonce`.
       */
      const tags = [`<script nonce="${safeNonce}" src="${uiScript().path}"></script>`]
      if (options.panelScript === true) tags.push(`<script nonce="${safeNonce}" src="${panelScript().path}"></script>`)
      const inline = stripJs(script)
      if (inline !== '') tags.push(`<script nonce="${safeNonce}">${inline}</script>`)
      return tags.join('')
    })()
  }</body></html>`
}

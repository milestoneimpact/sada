/**
 * القشرة — الوثيقةُ وما يحرسها.
 *
 * وثلاثةُ أشياءَ تمرّ من هنا ولا تُكتب في مكانٍ آخر: تهريبُ النصّ،
 * وحقنُ رمز CSRF، و `nonce` السياسة. فما بُني فوقها ورثها، وما نسيها
 * لم يُبنَ فوقها أصلا.
 */
import { commandPalette, commandTrigger, type Command } from './command'
import { scopeLine, type Scope } from './scope'
import { escapeHtml } from './escape'
import { html, join, raw } from './html'
import { ICON } from './icons'
import { segmented } from './components/tabs'
import { menu, menuAction, menuItem } from './components/menu'
import { count } from './components/badge'
import { panelScript, STYLE_PATH, stripJs, uiScript } from '../../lib/ui/asset'
import { FACES } from '../../lib/ui/fonts'
import { MARK, MOMENT, THEME, below } from './tokens'

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
const FONT_CSS = html`${FACES.map((f) => html`
@font-face{font-family:'${f.family}'; font-style:normal; font-weight:${f.weight};
  font-display:swap; src:url('${f.path}') format('woff2'); unicode-range:${f.unicodeRange}}`)}
`

/**
 * والوجوهُ الثلاثة تُسبَق في كلّ صفحة: `preload` يبدأ التحميلَ مع الوثيقة لا بعد
 * قراءة الأنماط. **وبلا `crossorigin` لا يُستعمَل المحمَّل** — يُحمَّل الخطُّ
 * مرّتين، ويُقرأ ذلك في الشبكة تكرارا لا يُفسَّر.
 *
 * وكان وجهُ العرض الكوفيُّ لا يُسبَق في الوثيقة العامّة (D-152). **وخرج الكوفيُّ
 * من الواجهة** (D-185)، والوجهُ الثخينُ عناوينُ كلِّ صفحةٍ ولصائقُها — فلا استثناء.
 */
const FONT_PRELOAD = join(FACES
  .map((f) => html`<link rel="preload" as="font" type="font/woff2" href="${f.path}" crossorigin>`), raw('\n'))

/**
 * رمزُ التبويب — **مرسومٌ في الوثيقة لا مطلوبٌ من الشبكة**.
 *
 * ملفٌّ خارجيّ يعني نداءً ثانيا، ومسارا يُنسى عند نقل النطاق، وسياسةَ
 * محتوًى تُوسَّع لتسمح به. و data: URI يعبر `img-src 'self' data:`
 * القائمة أصلا، ويظهر قبل أن يكتمل تحميل الصفحة.
 *
 * **والشكلُ من الهويّة لا من الذوق**: أيقونةُ التطبيق في لوحة الهويّة — شريطُ صدى «أخضرُ
 * فاتح» على مربّعٍ «أخضرَ عميق» مصمت (D-196)، **بلونَي العلامة نفسَيهما** (`MARK`)، فالتبويبُ
 * والرافدةُ هويّةٌ واحدة. وكان تدرّجًا نحاسيًّا على حبر (D-144). **ومسطّحٌ بلا تدرّج**: التدرّجُ
 * عند ‏١٦px لطخة، ونسخةُ المتصفّح المبسّطةُ من الأصل المتّجه تصل مع M-26. وحروفٌ في رمزٍ بستّةَ
 * عشرَ بكسلا تُقرأ لطخةً — والشريطُ يُقرأ عند كلّ قياس.
 */
const RIBBON = 'M13 22C13 34 17 39 24 38C31 37 32 18 38 14C45 9 51 18 51 32'

const ICON_SVG = html`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 48"><rect width="64" height="48" rx="11" fill="${MARK['--mark-bg']}"/><path d="${RIBBON}" fill="none" stroke="${MARK['--mark-fg']}" stroke-width="11" stroke-linecap="round"/></svg>`

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
export const GLYPH_SVG = html`<svg viewBox="0 0 64 48" fill="none" stroke="currentColor" stroke-linecap="round" aria-hidden="true"><path d="${RIBBON}" stroke-width="11"/></svg>`.value

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
  return html`<svg class="wordmark" viewBox="25 -591 2535 791" fill="currentColor" ${
    label ? html`role="img" aria-label="صدى"` : html`aria-hidden="true"`}><path d="${WORDMARK_PATH}"/></svg>`.value
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
export const ICON_BYTES = ICON_SVG.value

export { escapeHtml }

/**
 * لونُ شريط المتصفّح — **بالوضع لا بلونٍ واحد** (D-183).
 *
 * كان ‏#1f2430 في الوضعين: شريطٌ حبريٌّ فوق صفحةٍ بورسلينيّة نهارًا، ولا
 * يطابق أرضَ الليل ليلًا. فوسمان بشرط الوضع، وقيمتاهما أرضُ الصفحة من
 * «THEME» نفسِه — لا رقمٌ يُنسَخ. ويحدّثهما سكربتُ الثيم حين يختار المالكُ
 * وضعًا يخالف الجهاز (`THEME_BOOT` هنا و`THEME_SCRIPT` في `scripts.ts`).
 */
const THEME_COLOR = join((['light', 'dark'] as const).map((mode) =>
  html`<meta name="theme-color" media="(prefers-color-scheme: ${mode})" content="${THEME[mode]['--bg']}" data-c="${THEME[mode]['--bg']}">`), raw('\n'))

/**
 * ‏**وفي صفحتَي اللحظة يبدأ الشريطُ بلونها** (مراجعة D-196): دون «md» تبدأ صفحةُ الدخول والعاملِ الثاني
 * بشريط اللحظة العميق في الثيمين، فكان شريطُ المتصفّح رمليًّا فوق كتلةٍ عميقة — فاصلٌ في لحظة العلامة
 * الوحيدة. فوسمٌ ثالثٌ يسبق الوسمين (الأوّلُ المطابِق هو الساري) بشرط العرض، **وبلا «data-c»**: سكربتا
 * الثيم يقرآن ما يحمل «data-c» وحده، فاختيارُ «ليليّ» لا يكتب فوقه — وأرضُ اللحظة واحدةٌ في الوضعين.
 * ومن «md» فصاعدًا اللحظةُ لوحةٌ جانبيّة، فيعود الوسمان. (Safari ‏26 يأخذ اللونَ من أرض الصفحة لا من
 * الوسم، فلا يصله هذا.)
 */
const MOMENT_COLOR = html`<meta name="theme-color" media="${below('md')}" content="${MOMENT.ground}">`

/**
 * الهاتفُ أصيلًا (D-296): البيانُ يجعل «أضف إلى الشاشة الرئيسيّة» تطبيقًا يبدأ من اللوحة، وiOS يقرأ أيقونتَه
 * واسمَه من هذه الوسوم لا من البيان.
 */
const PWA_HEAD = html`<link rel="manifest" href="/manifest.webmanifest">
<link rel="apple-touch-icon" href="/icons/sada.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="صدى">`

const FAVICON = html`<link rel="icon" href="data:image/svg+xml;charset=utf-8,${encodeURIComponent(ICON_SVG.value)}">
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
document.querySelectorAll('meta[name="theme-color"][data-c]').forEach(function(m){
m.content=t==='dark'?${JSON.stringify(THEME.dark['--bg'])}:${JSON.stringify(THEME.light['--bg'])};});}
var d=localStorage.getItem('sada-density');
if(d==='compact')document.documentElement.dataset.density=d;}catch(e){}
`



/**
 * ‏**قائمةُ الحساب** (D-215): السمةُ والكثافةُ والجلساتُ والخروج خلف زرٍّ واحد.
 *
 * ‏كانت «خروج» أوّلَ ما تراه العينُ في ترويسة الهاتف وهو أندرُ أفعال اليوم، ومبدّلا السمة والكثافة ظاهرَين
 * ‏دائمًا في ذيل الرافدة. فالإطارُ كان أعلى صوتًا من المحتوى. ومبدّلٌ واحدٌ في الصفحة لا اثنان (سكربتُ الثيم
 * ‏يربط `#theme` الأوّلَ وحدَه)، فالقائمةُ هي مسكنُه الوحيد. و«خروج» نموذجٌ يحتاج رمزَ CSRF، فلا يُرسَم إلّا
 * ‏حيث يُحقَن (`logout`).
 */
export function accountMenu(options: { readonly logout?: boolean; readonly scope?: Scope } = {}): string {
  return menu({
    label: 'الحساب والعرض', variant: 'icon', size: 'sm', icon: ICON.account, id: 'acct',
    items: [
      // ‏والمنظّمةُ أوّلًا حين تكون أكثرَ من واحدة: على الهاتف لا رأسَ رافدةٍ يحمل مبدّلها
      ...scopeLine(options.scope),
      // ‏المبدّلان من العُدّة (`segmented`) يرسمان HTML ولم يُحوَّلا بعدُ إلى القالب: يُوثَقان عند الحدّ (D-281)
      html`<div class="menu-seg"><span>السمة</span>${raw(themeSwitch())}</div>`.value,
      html`<div class="menu-seg"><span>الكثافة</span>${raw(densitySwitch())}</div>`.value,
      // ‏المساعدةُ في الموضع نفسِه على كلّ صفحة (D-305 · WCAG 2.2 · 3.2.6)
      menuItem({ label: 'المساعدة', href: '/panel/help' }),
      menuItem({ label: 'الجلسات والأمان', href: '/panel/settings#security' }),
      ...(options.logout === true ? [menuAction({ label: 'خروج', action: '/panel/logout', fields: {}, busy: 'جار الخروج…' })] : []),
    ],
  })
}

/** مبدّلُ الكثافة — مقطعٌ من العُدّة (D-189)، وسكربتُه يقرأ «data-density» كما كان. */
export function densitySwitch(withId = true): string {
  return segmented('كثافة العرض', 'density', [
    { value: 'cozy', label: 'مريح', pressed: true },
    { value: 'compact', label: 'مضغوط' },
  ], withId ? 'density' : undefined)
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
  // ‏الجسدُ والرافدةُ مرسومان في وحداتٍ لم تُحوَّل بعدُ إلى القالب: يُوثَقان عند الحدّ (D-281)
  const inner = html`${raw(backNav(back.href, back.label))}
         <main id="main">${raw(body)}</main>`
  return shell(
    title,
    html`<a class="skip" href="#main">تخطّي إلى المحتوى</a>
       ${rail === undefined
         ? html`<div class="wrap">${inner}</div>`
         : html`<div class="app">${raw(rail)}<div class="main"><div class="wrap">${inner}</div></div></div>`}`.value,
    nonce,
    script,
    commands === undefined ? {} : { commands },
  )
}


/**
 * جرسُ الإشعارات (D-294): بابٌ إلى `/panel/notices` بعدّاد ما لم يُقرأ. في ترويسة اللوحة بعدّاده (الهيكلُ
 * يعدّه جملةً واحدة)، وفي شريط العودة في الصفحة المستقلّة بلا عدّاد: الصفحةُ المستقلّةُ لا تحمّل الهيكل.
 */
export function bell(unread: number | null): string {
  const n = unread ?? 0
  return html`<a class="bell" href="/panel/notices" aria-label="${n > 0 ? 'الإشعارات: ' + n + ' جديدة' : 'الإشعارات'}">${raw(ICON.bell)}${n > 0 ? raw(count(n, { label: n + ' جديدة' })) : ''}</a>`.value
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
  // ‏العلامةُ والرمزُ ثابتان في الشيفرة يُخرَجان نصًّا لوحداتٍ لم تُحوَّل، وزرُّ الأوامر والقائمةُ من
  // ‏العُدّة: كلُّها تُوثَق عند الحدّ (D-281)
  return html`<nav class="back" aria-label="مسار العودة">
    <a class="home" href="/panel" aria-label="صدى — اللوحة">${raw(wordmark(false))}<span class="glyph glyph-sm">${raw(GLYPH_SVG)}</span></a>
    <a href="${href}">${raw(ICON.back)}${label}</a>
    <span class="grow"></span>${raw(bell(null))}${raw(commandTrigger())}${raw(accountMenu())}
  </nav>`.value
}

/**
 * مبدّلُ الثيم — مقطعٌ من العُدّة (D-189). **ونصُّه يُطابَق حرفًا** حيث يُنزَع من ذيل الرافدة
 * في الصفحة المستقلّة (`soloPage`)، فهو دالّةٌ واحدةٌ لا وسمان.
 */
export function themeSwitch(withId = true): string {
  return segmented('سمة العرض', 'theme', [
    { value: 'light', label: 'نهاريّ' },
    { value: 'dark', label: 'ليليّ' },
    { value: 'system', label: 'النظام', pressed: true },
  ], withId ? 'theme' : undefined)
}

/**
 * يحقن رمز CSRF في **كلّ** نموذج POST في الصفحة.
 *
 * ولم يُكتب في كلّ نموذجٍ يدا لسببٍ واحد: نموذجٌ جديد يُضاف بعد شهر
 * فيُنسى فيه الحقل، ويعمل عملا صحيحا فلا يلحظ أحدٌ نقصه — وهي عينُ
 * الثغرة التي كشفها D-019: حارسٌ يُنسى نسخُه في مسارٍ جديد. فالحقن هنا
 * مرّةً واحدة، ولا سبيل إلى نسيانه.
 */
export function injectCsrf(page: string, token: string): string {
  const field = html`<input type="hidden" name="_csrf" value="${token}">`.value
  // ‏وحاملٌ مخفيٌّ للسكربت (D-299): صفحةٌ بلا نموذجٍ تُرسل عيّنةَ سرعتها بالرمز نفسِه، فلا بابَ ثانيًا
  const carrier = html`<span hidden data-csrf="${token}"></span>`.value
  return page.replace(/(<form\b[^>]*\bmethod="POST"[^>]*>)/gi, (tag) => tag + field) + carrier
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
    /** صفحتا لحظة العلامة (القالب T6): شريطُ المتصفّح بأرض اللحظة دون «md» (`MOMENT_COLOR`) */
    moment?: boolean
  } = {},
): string {
  // ‏الجسدُ ولوحةُ الأوامر وسكربتُ الثيم مرسومةٌ خارج القالب: تُوثَق عند الحدّ، و`nonce` يُهرَّب كأيّ قيمة (D-281)
  return html`<!doctype html><html lang="ar" dir="rtl"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="${options.indexable === true ? 'index,follow' : 'noindex,nofollow'}">${
    options.description === undefined
      ? ''
      : html`\n<meta name="description" content="${options.description}">`
  }
<title>${title}</title>${options.moment === true ? html`\n${MOMENT_COLOR}` : ''}
${FAVICON}
${PWA_HEAD}
<script nonce="${nonce}">${raw(THEME_BOOT)}</script>
${FONT_PRELOAD}
<style nonce="${nonce}">${FONT_CSS}</style>
<link rel="stylesheet" href="${STYLE_PATH}"></head><body>${raw(body)}${
    options.commands === undefined ? '' : raw(commandPalette(options.commands))
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
      const tags = [html`<script nonce="${nonce}" src="${uiScript().path}"></script>`]
      if (options.panelScript === true) tags.push(html`<script nonce="${nonce}" src="${panelScript().path}"></script>`)
      const inline = stripJs(script)
      if (inline !== '') tags.push(html`<script nonce="${nonce}">${raw(inline)}</script>`)
      return join(tags)
    })()
  }</body></html>`.value
}

/**
 * الأنماطُ تُخدَم من مسارٍ مخبَّأ — لا من داخل الوثيقة (D-101).
 *
 * ## ما قِيس
 *
 * | ما هو | وزنُه في وثيقة اللوحة |
 * |---|---|
 * | الأنماطُ سطرا | ‏١٠٢٫٣KB — ‏٤٢٪ |
 * | السكربتُ سطرا | ‏٢٧٫٢KB — ‏١١٪ |
 * | ما عداهما | ‏١١١٫٦KB — ‏٤٦٪ |
 *
 * **وأربعةٌ وخمسون كيلوبايتا من الأنماط تعليقاتٌ عربيّة.** وهي أنفسُ ما
 * في هذا المستودع — تقول لماذا كُتبت كلُّ قاعدة، ولا تُحذَف من المصدر.
 * **لكنّ المتصفّحَ لا يقرؤها**، وكان يحمّلها في كلّ طلبٍ ولكلّ صفحة.
 *
 * ## ولماذا مسارٌ لا نزعُ تعليقاتٍ وحدَه
 *
 * النزعُ وحدَه يوفّر ‏٥٤KB **ويُبقي ‏٤٧ تُرسَل مع كلّ فتحة**. والمسارُ
 * ببصمةٍ في اسمه يُخبَّأ للأبد: **يُدفَع مرّةً واحدة، ثمّ صفر** — وهو
 * نمطُ الخطّ نفسُه (D-099).
 *
 * ## وللأنماط وحدَها — والسكربتُ يبقى سطرا
 *
 * ورقةُ الأنماط **واحدةٌ في كلّ صفحة**، فمصدرُها معروفٌ عند إقلاع العامل
 * ويُسجَّل قبل أن يصل طلب.
 *
 * **والسكربتُ يختلف باختلاف الصفحة**: اللوحةُ غيرُ شاشة الدخول غيرُ
 * شاشة المنصّة. فمسارٌ له يعني سجلًّا يُملأ عند الرسم — **وطلبُ سكربتٍ
 * يسبق رسمَ صفحتِه في عاملٍ جديد يُردّ ‏٤٠٤، فتُفتَح الصفحةُ بلا سلوكها،
 * صامتةً**. وصفحةٌ جديدةٌ تُكتب غدا بسكربتٍ جديد تقع في ذلك بلا أن يلحظه
 * أحد — **وهي عينُ العلّة التي يُبنى هذا المستودعُ لمنعها**.
 *
 * فيُنزَع تعليقُه (‏٧KB) ويبقى سطرا بـ `nonce`. **ونصفُ المكسب بلا خطرٍ
 * صامت خيرٌ من كلِّه به.**
 */
import { STYLE } from '../../routes/ui/styles'
import { SCRIPT as PANEL_SCRIPT } from '../../routes/ui/panelScript'
import { COMMAND_SCRIPT } from '../../routes/ui/command'
import { CONFIRM_SCRIPT, COPY_SCRIPT, DENSITY_SCRIPT, IMG_SCRIPT, KIT_SCRIPT, THEME_SCRIPT, TZ_SCRIPT, ERRSUM_SCRIPT, SIZE_SCRIPT, SHORTCUTS_SCRIPT, TIP_SCRIPT } from '../../routes/ui/scripts'
import { WEB_VITALS_IIFE } from './vendor/webVitals'

/**
 * بصمةٌ متزامنة — **مفتاحُ تخبئةٍ لا حارس**.
 *
 * `crypto.subtle` غيرُ متزامنة، وحسابُها تعميةً عملٌ بلا فائدة هنا: ما
 * نريده أن يتبدّل الاسمُ إذا تبدّل المحتوى. و FNV-1a تفعل، وتُحسَب مرّةً
 * عند إقلاع العامل.
 */
function fingerprint(text: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

/**
 * نزعُ تعليقات CSS.
 *
 * **ولا سلسلةَ نصٍّ في أنماطنا تحمل بدايةَ تعليق**: أطولُ ما فيها
 * `content:'▾'`. ولو حملتها يوما لكشفه المدقّقُ البصريُّ فورا — يقيس
 * الأنماطَ **محسوبةً من المتصفّح**، فقاعدةٌ انكسرت تسقط قياسا لا ظنّا.
 */
export function stripCss(css: string): string {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\n[ \t]*\n+/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .trim()
}

/**
 * نزعُ تعليقات JavaScript — **بسطرٍ كاملٍ لا بموضع**.
 *
 * `//` تقع داخل تعابيرَ نمطيّة: في عدّاد الطول `RE_URL` فيها
 * `https?:\/\/`. **ونزعٌ بالموضع يقصّ التعبيرَ فيسقط النصُّ كلُّه** —
 * وهو خطأُ صياغةٍ يُبيّض الصفحة.
 *
 * فلا يُنزَع إلّا سطرٌ **أوّلُ ما فيه** بعد الفراغ شرطتان، وذاك تعليقٌ
 * يقينا. وتعليقاتُ الكتلة معه، ولا كتلةَ داخل سلسلةٍ عندنا.
 *
 * **والحارسُ قائم**: اختبارُ «النصُّ يُبنى دالّةً بلا خطأ صياغة» (D-071)
 * يبني المنزوعَ ويشغّله.
 */
export function stripJs(js: string): string {
  return js
    .replace(/^[ \t]*\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\n[ \t]*\n+/g, '\n')
    .trim()
}

/** ورقةُ الأنماط كما تُخدَم — **تُبنى مرّةً عند إقلاع العامل**. */
const BODY = stripCss(STYLE)

/** مسارُها ببصمتها: التبديلُ يبدّل الاسم، فلا إبطالَ يدويّ. */
export const STYLE_PATH = `/a/s.${fingerprint(BODY)}.css`

export const STYLE_BODY = BODY

/*
 * ── والسكربتُ الثابتُ يخرج كذلك (D-153) ───────────────────────────────
 *
 * قالت D-101 «السكربتُ يختلف باختلاف الصفحة» فأبقته سطرًا. **والصوابُ
 * أنّ أكثرَه ثابتٌ حرفًا بحرف في كلّ صفحة**: الثيمُ والكثافةُ والنسخُ ولوحةُ
 * الأوامر والوقتُ (‏١٨KB منزوعةً) في كلّ صفحة، وسكربتُ اللوحة (‏٢٨KB) في
 * صفحتها — وكلُّها معروفٌ من الشيفرة لا من الطلب، فيُخدَم ببصمةٍ ويُخبَّأ
 * سنةً كالأنماط. وما يتبدّل بالطلب (سكربتُ الدخول بالمفتاح، والعاملُ
 * الثاني) يبقى سطرًا بـ`nonce`.
 *
 * **وخطرُ D-101 الصامت لا يقع هنا**: الأصلُ يُبنى من ثوابتَ مستورَدة لا من
 * سجلٍّ يُملأ عند الرسم، فلا طلبَ يسبق تسجيلَه.
 *
 * **والحلقةُ التي قبلتها D-153 كسرت الدخول** (D-160): هذا الملفُّ كان يستورد
 * سكربتَ اللوحة من `panelView.ts`، و`panelView` يستورد القشرةَ التي تستورد هذا
 * الملفّ. فالبناءُ هنا كُسل عند أوّل نداء — **لكنّ قالبَ السكربت نفسَه يُقيَّم عند
 * التحميل** في `panelView`، وفي الحزمة قُرئ `${B64URL_SCRIPT}` قبل أن يُسنَد:
 * «undefined» في رأس سكربت اللوحة وسكربت الدخول بمفتاح المرور، ورميٌ عند
 * التحميل. فالمصادرُ الآن من `ui/scripts.ts` و`ui/panelScript.ts` ولا تستورد
 * القشرة، و`audit_cycles` يُسقط CI على أيّ حلقة. والبناءُ يبقى كسولًا: لا
 * حاجةَ إليه قبل أوّل طلب.
 *
 * وكلُّ `<script>` يحمل `nonce` — خارجيًّا كان أو سطرًا — فالسياسةُ لا تتبدّل.
 */
export interface ScriptAsset {
  readonly path: string
  readonly body: string
}

let ui: ScriptAsset | null = null
let panel: ScriptAsset | null = null

/** ما تحمله كلُّ صفحة: الثيمُ والكثافةُ والنسخُ وسلوكُ العُدّة ولوحةُ الأوامر والوقت. */
/**
 * تسجيلُ عامل الخدمة (D-296) — صامتٌ: متصفّحٌ بلا دعمٍ أو رفضٌ لا يُظهر شيئًا، فاللوحةُ تعمل كما كانت.
 * والعاملُ نفسُه لا يخزّن صفحةً (المسارُ /sw.js)، فالتسجيلُ لا يبدّل ما يراه المالك إلّا حين تسقط الشبكة.
 */
/**
 * القياسُ الميدانيّ (D-299): web-vitals مضمَّنةً حرفيًّا (vendor/webVitals.ts)، وبعدها سطرُنا: ثلاثةُ أرقامٍ لكلّ فتحةٍ
 * من جلسة (رمزُ النموذج شرطٌ، فلا عيّنةَ من زائرٍ ولا من صفحةٍ بلا نموذج) تُرسَل بـ sendBeacon إلى المسار الداخليّ
 * حين تكتمل أو حين تُخفى الصفحة. ونوعُ الجهاز من العرض لا من الوكيل.
 */
const VITALS_SCRIPT = `
(function(){
  if (typeof webVitals === 'undefined' || !navigator.sendBeacon) return;
  var f = document.querySelector('[data-csrf]');
  var csrf = f ? f.getAttribute('data-csrf') : '';
  if (!csrf) return;
  var sent = {};
  var device = window.innerWidth < 700 ? 'phone' : 'desktop';
  function send(m){
    if (sent[m.name]) return;
    sent[m.name] = 1;
    var p = new URLSearchParams();
    p.set('_csrf', csrf); p.set('metric', m.name); p.set('value', String(m.value));
    p.set('page', location.pathname); p.set('device', device);
    navigator.sendBeacon('/panel/vitals', p);
  }
  webVitals.onLCP(send); webVitals.onINP(send); webVitals.onCLS(send);
})();`

const SW_SCRIPT = `
(function(){
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js').catch(function(){});
})();`

export function uiScript(): ScriptAsset {
  if (ui === null) {
    const body = stripJs(THEME_SCRIPT + DENSITY_SCRIPT + COPY_SCRIPT + CONFIRM_SCRIPT + IMG_SCRIPT + TZ_SCRIPT + KIT_SCRIPT + COMMAND_SCRIPT + SW_SCRIPT + ERRSUM_SCRIPT + SIZE_SCRIPT + SHORTCUTS_SCRIPT + TIP_SCRIPT + '\n' + WEB_VITALS_IIFE + '\n' + VITALS_SCRIPT)
    ui = { path: `/a/u.${fingerprint(body)}.js`, body }
  }
  return ui
}

/** سكربتُ اللوحة وحدَها — صفحةٌ واحدةٌ تحمله. */
export function panelScript(): ScriptAsset {
  if (panel === null) {
    const body = stripJs(PANEL_SCRIPT)
    panel = { path: `/a/p.${fingerprint(body)}.js`, body }
  }
  return panel
}

/** ما يُخدَم من `/a/…` بمساره — أو لا شيء. */
export function assetAt(path: string): { readonly body: string; readonly type: string } | null {
  if (path === STYLE_PATH) return { body: STYLE_BODY, type: 'text/css; charset=utf-8' }
  for (const a of [uiScript(), panelScript()]) {
    if (path === a.path) return { body: a.body, type: 'text/javascript; charset=utf-8' }
  }
  return null
}

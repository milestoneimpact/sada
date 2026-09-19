/**
 * القشرة — الوثيقةُ وما يحرسها.
 *
 * وثلاثةُ أشياءَ تمرّ من هنا ولا تُكتب في مكانٍ آخر: تهريبُ النصّ،
 * وحقنُ رمز CSRF، و `nonce` السياسة. فما بُني فوقها ورثها، وما نسيها
 * لم يُبنَ فوقها أصلا.
 */
import { COMMAND_SCRIPT, commandPalette, commandTrigger, type Command } from './command'
import { TIME_SCRIPT } from './time'
import { STYLE_PATH, stripJs } from '../../lib/ui/asset'
import { BEIRUTI, INTER, REEM_KUFI } from '../../lib/ui/fonts'

/**
 * الخطّان — **من أصلنا، وبوجهٍ واحدٍ لكلّ أسرة** (D-099).
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
 * تصف خطًّا لا يراه المالك.
 *
 * **ورقمٌ يُكتب بلا قياسٍ يجعل الصفحةَ تقفز في الاتّجاه المعاكس** — وهي
 * علّةُ D-076: الفحصُ يكذب حين يستدلّ.
 *
 * والذي يُغني عنه قائم: الوجهُ **من أصلنا** لا من شبكةٍ ثالثة،
 * و`preload` يبدؤه مع الوثيقة، و`immutable` يجعله مخبَّأً بعد أوّل فتحة.
 * **والقفزةُ تُقاس بعد ذلك** (D-099) — فإن بقيت، قِيست النسبةُ على
 * أجهزةٍ حقيقيّةٍ وأُضيفت حينئذ.
 */
const FONT_CSS = `
@font-face{font-family:'Beiruti'; font-style:normal; font-weight:400 700;
  font-display:swap; src:url('${BEIRUTI.path}') format('woff2')}
@font-face{font-family:'Inter'; font-style:normal; font-weight:400 700;
  font-display:swap; src:url('${INTER.path}') format('woff2')}
@font-face{font-family:'Reem Kufi'; font-style:normal; font-weight:400 700;
  font-display:swap; src:url('${REEM_KUFI.path}') format('woff2')}
`

/**
 * والوجهان يُسبَقان: `preload` يبدأ التحميلَ مع الوثيقة لا بعد قراءة
 * الأنماط. **وبلا `crossorigin` لا يُستعمَل المحمَّل** — يُحمَّل الخطُّ
 * مرّتين، ويُقرأ ذلك في الشبكة تكرارا لا يُفسَّر.
 */
const FONT_PRELOAD = [BEIRUTI, INTER, REEM_KUFI]
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
 * وتُصدَّر البايتات ليخدمها مسارٌ كذلك — **والسببُ عطلٌ وقع**.
 *
 * كانت الصيغةُ «data:image/svg+xml;utf8,» — و«;utf8» **ليست معاملا
 * صحيحا** في data URI (الصحيحُ «;charset=utf-8»). فرفضها فايرفوكس،
 * **وسقط إلى /favicon.ico** الذي لا مسارَ له، فردّ الخادمُ ٤٠٤ يحمل
 * «Cross-Origin-Resource-Policy: same-origin» — **فظهر في الكونسول
 * حظرٌ يبدو عطلَ أمنٍ وهو حرفان في نصّ**.
 */
export const ICON_BYTES = ICON_SVG

const FAVICON = `<link rel="icon" href="data:image/svg+xml;charset=utf-8,${encodeURIComponent(ICON_SVG)}">
<meta name="theme-color" content="#1f2430">`

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

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
 */
const THEME_BOOT = `
try{var t=localStorage.getItem('sada-theme');
if(t==='dark'||t==='light')document.documentElement.dataset.theme=t;
var d=localStorage.getItem('sada-density');
if(d==='compact')document.documentElement.dataset.density=d;}catch(e){}
`

/** مبدّلُ الثيم — يُحفظ الاختيار، و«النظام» يمحوه فيعود التفضيل. */
/**
 * زرُّ النسخ — **حرفًا بحرف، ومن مصدرٍ واحد** (D-042 · D-126).
 *
 * رابطُ العودة يُطابَق حرفًا بحرف عند المنصّة، وكتابتُه يدًا تُدخل مسافةً
 * أو شرطةً فيفشل الربطُ بخطأٍ لا يدلّ على سببه. وأمرُ `wrangler` في شاشة
 * «ما عليك» من الجنس نفسِه. **فالنصُّ واحدٌ تحمله اللوحةُ والشاشة**، لا
 * نسختان تفترقان في أوّل تعديل.
 */
export const COPY_SCRIPT = `
(function(){
  document.querySelectorAll('button[data-copy]').forEach(function(b){
    b.addEventListener('click',function(){
      var f=document.getElementById(b.dataset.copy); if(!f)return;
      f.select(); f.setSelectionRange(0,f.value.length);
      var done=function(){var t=b.textContent; b.textContent='نُسخ ✓';
        setTimeout(function(){b.textContent=t;},1400);};
      // الحديثةُ أوّلا، والقديمةُ احتياطا: نافذةٌ بلا HTTPS لا تملك الأولى
      if(navigator.clipboard&&navigator.clipboard.writeText){
        navigator.clipboard.writeText(f.value).then(done,function(){
          try{document.execCommand('copy'); done();}catch(e){}});
      }else{try{document.execCommand('copy'); done();}catch(e){}}
    });
  });
})();
`

export const THEME_SCRIPT = `
(function(){
  var box=document.getElementById('theme');
  if(!box)return;
  var apply=function(v){
    try{
      if(v==='system'){localStorage.removeItem('sada-theme');
        delete document.documentElement.dataset.theme;}
      else{localStorage.setItem('sada-theme',v); document.documentElement.dataset.theme=v;}
    }catch(e){
      if(v==='system')delete document.documentElement.dataset.theme;
      else document.documentElement.dataset.theme=v;
    }
    box.querySelectorAll('button').forEach(function(b){
      b.setAttribute('aria-pressed',String(b.dataset.theme===v));});
  };
  var saved='system';
  try{saved=localStorage.getItem('sada-theme')||'system';}catch(e){}
  apply(saved);
  box.querySelectorAll('button').forEach(function(b){
    b.addEventListener('click',function(){apply(b.dataset.theme);});});
})();
`

/**
 * مبدّلُ الكثافة (D-102) — **ووضعان لا ثلاثة**.
 *
 * الثيمُ ثلاثةٌ لأنّ للنظام رأيا فيه (`prefers-color-scheme`). **ولا رأيَ
 * للنظام في الكثافة** — فوضعٌ ثالثٌ اسمُه «النظام» يَعِد بما لا مصدرَ له.
 *
 * والحفظُ في `try` كما في الثيم: `localStorage` يرمي في نافذةٍ خاصّة،
 * **ونافذةٌ خاصّة يجب أن تفتح اللوحة** لا أن تسقط على سطرٍ من الزينة.
 */
export const DENSITY_SCRIPT = `
(function(){
  var box=document.getElementById('density');
  if(!box)return;
  var apply=function(v){
    try{
      if(v==='compact'){localStorage.setItem('sada-density',v);
        document.documentElement.dataset.density=v;}
      else{localStorage.removeItem('sada-density');
        delete document.documentElement.dataset.density;}
    }catch(e){
      if(v==='compact')document.documentElement.dataset.density=v;
      else delete document.documentElement.dataset.density;
    }
    box.querySelectorAll('button').forEach(function(b){
      b.setAttribute('aria-pressed',String(b.dataset.density===v));});
  };
  var saved='cozy';
  try{saved=localStorage.getItem('sada-density')||'cozy';}catch(e){}
  apply(saved);
  box.querySelectorAll('button').forEach(function(b){
    b.addEventListener('click',function(){apply(b.dataset.density);});});
})();
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
export function backNav(href: string, label: string): string {
  /*
   * **والعلامةُ في الشريط** (D-140): الشاشةُ المستقلّة كانت تبدأ بسهم عودةٍ
   * وحدَه، فتُقرأ صفحةً خارج التطبيق. والعلامةُ بجانب السهم تقول «هذه من
   * صدى» قبل أن يُقرأ العنوان — وهي بابٌ إلى اللوحة كذلك.
   */
  return `<nav class="back" aria-label="مسارُ العودة">
    <a class="home" href="/panel" aria-label="صدى — اللوحة"><span class="glyph sm">${GLYPH_SVG}</span><b>صدى</b></a>
    <a href="${escapeHtml(href)}">← ${escapeHtml(label)}</a>
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
      const all = (options.commands === undefined ? script : script + COMMAND_SCRIPT) + TIME_SCRIPT
      return `<script nonce="${safeNonce}">${stripJs(all)}</script>`
    })()
  }</body></html>`
}

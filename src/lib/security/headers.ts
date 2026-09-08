/**
 * ترويسات الأمان.
 *
 * لم تكن في الردود ترويسةُ أمانٍ واحدة. واللوحةُ صفحةٌ فيها أزرارُ «أوقف
 * النظام» و«احذف مزوّدا» — فبلا `frame-ancestors` تُوضَع في `iframe`
 * شفّافٍ على صفحةٍ أخرى، وضغطةٌ يظنّها الزائرُ على زرٍّ بريء تقع على
 * الزرّ الذي تحته. وهذا هجومُ Clickjacking، ولا يحتاج ثغرةً في شيفرتنا.
 *
 * والسياسةُ **قائمةُ سماحٍ من العدم**: `default-src 'none'` ثمّ يُفتَح ما
 * يلزم بالاسم. فمصدرٌ جديد يُنسى ذكرُه يُمنع — لا يمرّ.
 *
 * ## ولا أصلَ خارجيًّا فيها (D-099)
 *
 * كانت فيها `fonts.googleapis.com` في `style-src` و`fonts.gstatic.com`
 * في `font-src`. وصار الخطّان يُخدَمان من `/f/…` في أصلنا، **فضاقت
 * السياسةُ إلى `'self'`**.
 *
 * **وسياسةٌ تبقى واسعةً بعد أن ضاقت الحاجةُ ثغرةٌ نائمة**: بابٌ لا
 * يُستعمَل يُغلق — وهي القاعدةُ نفسُها التي أغلقت الكاميرا والميكروفون
 * في `Permissions-Policy`.
 *
 * **وبهذا لا يبقى في الوثيقة أصلٌ ثالثٌ واحد**: كلُّ ما استُثني من
 * `default-src 'none'` هو `'self'` أو `data:`.
 */

/**
 * ترويساتٌ تصلح لكلّ ردّ، JSON كان أو HTML.
 *
 * `Strict-Transport-Security` بسنةٍ وبالنطاقات الفرعيّة — **وبلا
 * `preload`.** والفرقُ ليس تفصيلا: الترويسةُ من نطاقٍ فرعيّ تلزم ذلك
 * النطاقَ وما تحته، ولا تلزم `basserh.com` ولا أشقّاءه. و`preload` لا
 * يُقبل إلا من الجذر، فذكرُه هنا لا يفعل شيئا ويوهم بالتزامٍ لم يُتَّخذ:
 * إدراجُ نطاقٍ في قائمة المتصفّحات قرارٌ يشمل كلّ ما تحته إلى الأبد،
 * ولا يُتَّخذ في ترويسةٍ عرَضا.
 */
export const BASE_HEADERS: Readonly<Record<string, string>> = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  // بابٌ لا يُستعمل يُغلق: لا كاميرا ولا موقع ولا ميكروفون في لوحةٍ نصّيّة
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
}

/**
 * ترويساتُ صفحةِ HTML: السياسةُ ومنعُ التأطير ومنعُ التخزين.
 *
 * `no-store` مقصودة: صفحةُ اللوحة تحمل حالَ النظام وأسماءَ المصادر، فلا
 * تُترك في ذاكرة متصفّحٍ مشترك يفتحها من بعدك بزرّ «رجوع».
 *
 * و `X-Frame-Options` مكرّرةٌ عمدا مع `frame-ancestors`: الثانية هي
 * المعيار، والأولى يفهمها ما لا يفهم الثانية. وتكرارٌ يحمي خيرٌ من أناقةٍ
 * تترك بابا.
 */
export function htmlHeaders(nonce: string): Record<string, string> {
  const csp = [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    /*
     * **و`'self'` مع `nonce` لا بدلا عنه** (D-101).
     *
     * ورقةُ الأنماط خرجت إلى `/a/…` فتحتاج `'self'`. **و`nonce` يبقى**:
     * وسمُ `<style>` الباقي يحمل وجهَي الخطّ، وسطرٌ يحقنه مهاجمٌ لا
     * يحمل قيمةً لا يعرفها — **و`'self'` لا تفتح للداخليّ بابا**، إنّما
     * تسمح بموردٍ من أصلنا وحدَه، وكلُّ مساراتِ أصلنا نكتبها.
     */
    `style-src 'self' 'nonce-${nonce}'`,
    "font-src 'self'",
    "img-src 'self' data:",
    /**
     * **والمقاطعُ تحتاج بابا خاصّا بها.**
     *
     * `img-src` لا يشمل `<video>` — و`default-src 'none'` يمنعه.
     * فمصغَّرُ مقطعٍ يُرسَم ولا يُحمَّل، **بلا عطلٍ ظاهرٍ في الصفحة**:
     * مربّعٌ فارغٌ يُقرأ «لا مقطع» وهو «مُنع» (D-062).
     *
     * و`'self'` وحدها: البايتاتُ من `/panel/media/:id` خلف الجلسة،
     * ولا مقطعَ من نطاقٍ آخر بحال.
     */
    "media-src 'self'",
    "connect-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "object-src 'none'",
    'upgrade-insecure-requests',
  ].join('; ')

  return {
    ...BASE_HEADERS,
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': csp,
    'X-Frame-Options': 'DENY',
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
  }
}

/**
 * قيمةُ `nonce` لصفحةٍ واحدة.
 *
 * تُولَّد لكلّ ردٍّ على حدة. وثابتةٌ مشتركة تُبطل السياسةَ كلَّها: من عرفها
 * مرّةً حقن سطرا يمرّ في كلّ صفحةٍ بعدها.
 */
export function makeNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes)).replace(/=+$/, '')
}

/**
 * ترويساتُ الوثائق العامّة — السياسةُ والشروط.
 *
 * تفترق عن `htmlHeaders` في شيئين، وكلاهما مقصود:
 *
 * **تُخزَّن مؤقّتا.** `no-store` وُضعت على اللوحة لأنّها تحمل حالَ النظام،
 * ووثيقةٌ قانونيّةٌ ثابتة تُقرأ من الخارج لا تحتاجها — ومنعُ التخزين عليها
 * يعني نداءَ خادمٍ لكلّ فتحة.
 *
 * **ولا تُمنع من التأطير.** مراجعُ منصّةٍ قد يفتحها في إطارٍ داخل أداته،
 * و`DENY` تجعلها تظهر فارغةً عنده فيُعدّها غير موجودة. والصفحةُ لا تحمل
 * فعلا ولا نموذجا، فلا شيء يُنقَر خلسةً فيها (لا clickjacking بلا زرّ).
 */
export function publicPageHeaders(nonce: string): Record<string, string> {
  const headers = htmlHeaders(nonce)
  delete headers['X-Frame-Options']
  return {
    ...headers,
    'Content-Security-Policy': headers['Content-Security-Policy']!.replace(
      "frame-ancestors 'none'",
      'frame-ancestors *',
    ),
    'Cache-Control': 'public, max-age=3600',
  }
}
